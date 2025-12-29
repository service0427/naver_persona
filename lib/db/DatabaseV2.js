/**
 * DatabaseV2 - 중앙 집중형 멀티PC 아키텍처용 DB 클래스
 *
 * v1과의 차이점:
 * - 페르소나가 PC에 종속되지 않음 (어떤 PC에서든 실행 가능)
 * - storage_state (Playwright JSON)를 중앙 저장 → 어디서든 복원 가능
 * - 작업 큐 기반 스케줄링
 * - PC 및 VPN 풀 관리
 */

import mysql from 'mysql2/promise';
import { DB_CONFIG } from './Database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DatabaseV2 {
  constructor() {
    this.pool = null;
    this.initialized = false;
    this.pcId = null;  // 현재 PC 식별자
  }

  /**
   * DB 연결 및 v2 테이블 초기화
   */
  async connect() {
    if (this.pool) return this.pool;

    try {
      this.pool = mysql.createPool(DB_CONFIG);

      // 연결 테스트
      const conn = await this.pool.getConnection();
      console.log('[DBv2] MariaDB 연결 성공');
      conn.release();

      // v2 테이블 생성
      await this.initTablesV2();
      this.initialized = true;

      return this.pool;
    } catch (error) {
      console.error('[DBv2] 연결 실패:', error.message);
      throw error;
    }
  }

  /**
   * v2 테이블 초기화 (직접 SQL 실행)
   */
  async initTablesV2() {
    const conn = await this.pool.getConnection();

    try {
      // personas_v2
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS personas_v2 (
          id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(100),
          base_profile VARCHAR(30) DEFAULT 'galaxy-s23',
          chrome_version VARCHAR(50) NOT NULL,
          fingerprint JSON NOT NULL,
          hardware_concurrency TINYINT,
          device_memory TINYINT,
          screen_width SMALLINT,
          screen_height SMALLINT,
          webgl_renderer VARCHAR(200),
          canvas_noise DECIMAL(20, 18),
          audio_noise DECIMAL(20, 18),
          unique_seed VARCHAR(64),
          status ENUM('숙성중', '활성', '휴면', '차단됨', '폐기') DEFAULT '숙성중',
          aging_level TINYINT DEFAULT 0,
          aging_score INT DEFAULT 0,
          total_uses INT DEFAULT 0,
          success_count INT DEFAULT 0,
          blocked_count INT DEFAULT 0,
          last_result ENUM('성공', '봇탐지', 'IP불일치', '에러') NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_used_at TIMESTAMP NULL,
          INDEX idx_status (status),
          INDEX idx_base_profile (base_profile),
          INDEX idx_aging_level (aging_level),
          INDEX idx_last_used (last_used_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // persona_state
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS persona_state (
          persona_id VARCHAR(50) PRIMARY KEY,
          storage_state LONGTEXT,
          cookie_files_backup LONGTEXT,
          profile_dir_name VARCHAR(100),
          visit_history JSON,
          search_keywords JSON,
          visited_shops JSON,
          last_vpn_ip VARCHAR(45),
          last_pc_id VARCHAR(50),
          last_session_at TIMESTAMP NULL,
          last_checkpoint VARCHAR(100),
          state_version INT DEFAULT 1,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (persona_id) REFERENCES personas_v2(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // 기존 테이블에 컬럼 추가 (마이그레이션용)
      try {
        await conn.execute(`ALTER TABLE persona_state ADD COLUMN cookie_files_backup LONGTEXT AFTER storage_state`);
      } catch (e) { /* 이미 존재 */ }
      try {
        await conn.execute(`ALTER TABLE persona_state ADD COLUMN profile_dir_name VARCHAR(100) AFTER cookie_files_backup`);
      } catch (e) { /* 이미 존재 */ }
      try {
        await conn.execute(`ALTER TABLE persona_state ADD COLUMN last_checkpoint VARCHAR(100) AFTER last_session_at`);
      } catch (e) { /* 이미 존재 */ }

      // execution_logs
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS execution_logs (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          persona_id VARCHAR(50) NOT NULL,
          pc_id VARCHAR(50),
          vpn_ip VARCHAR(45),
          vpn_agent VARCHAR(20),
          chrome_version VARCHAR(50),
          action VARCHAR(50),
          target_url TEXT,
          search_keyword VARCHAR(255),
          result ENUM('성공', '봇탐지', 'IP불일치', '에러', '타임아웃') NOT NULL,
          duration_ms INT,
          error_message TEXT,
          cookies_snapshot JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_persona (persona_id),
          INDEX idx_pc (pc_id),
          INDEX idx_vpn (vpn_ip),
          INDEX idx_result (result),
          INDEX idx_action (action),
          INDEX idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // worker_pcs
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS worker_pcs (
          pc_id VARCHAR(50) PRIMARY KEY,
          hostname VARCHAR(100),
          ip_address VARCHAR(45),
          os_version VARCHAR(100),
          chrome_version VARCHAR(50),
          vpn_count TINYINT DEFAULT 0,
          status ENUM('온라인', '오프라인', '점검중') DEFAULT '오프라인',
          current_load TINYINT DEFAULT 0,
          max_load TINYINT DEFAULT 10,
          total_executions INT DEFAULT 0,
          last_heartbeat TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // vpn_pool
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS vpn_pool (
          id INT AUTO_INCREMENT PRIMARY KEY,
          agent_id VARCHAR(20) NOT NULL,
          vpn_ip VARCHAR(45),
          status ENUM('사용가능', '사용중', '오류', '점검중') DEFAULT '사용가능',
          assigned_pc VARCHAR(50),
          assigned_persona VARCHAR(50),
          total_uses INT DEFAULT 0,
          blocked_count INT DEFAULT 0,
          last_used_at TIMESTAMP NULL,
          INDEX idx_status (status),
          INDEX idx_agent (agent_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // aging_queue
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS aging_queue (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          persona_id VARCHAR(50) NOT NULL,
          priority TINYINT DEFAULT 5,
          scheduled_at TIMESTAMP NULL,
          assigned_pc VARCHAR(50),
          assigned_vpn INT,
          status ENUM('대기', '진행중', '완료', '실패', '취소') DEFAULT '대기',
          attempts TINYINT DEFAULT 0,
          max_attempts TINYINT DEFAULT 3,
          result_log_id BIGINT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          started_at TIMESTAMP NULL,
          completed_at TIMESTAMP NULL,
          INDEX idx_status (status),
          INDEX idx_priority (priority),
          INDEX idx_scheduled (scheduled_at),
          INDEX idx_persona (persona_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // Views
      await conn.execute(`
        CREATE OR REPLACE VIEW daily_stats_v2 AS
        SELECT
          DATE(created_at) as date,
          COUNT(*) as total_runs,
          COUNT(DISTINCT persona_id) as unique_personas,
          COUNT(DISTINCT pc_id) as active_pcs,
          SUM(CASE WHEN result = '성공' THEN 1 ELSE 0 END) as success,
          SUM(CASE WHEN result = '봇탐지' THEN 1 ELSE 0 END) as blocked,
          SUM(CASE WHEN result = '에러' THEN 1 ELSE 0 END) as errors,
          ROUND(SUM(CASE WHEN result = '성공' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as success_rate,
          AVG(duration_ms) as avg_duration_ms
        FROM execution_logs
        GROUP BY DATE(created_at)
      `);

      await conn.execute(`
        CREATE OR REPLACE VIEW persona_summary AS
        SELECT
          p.id,
          p.name,
          p.status,
          p.aging_level,
          p.total_uses,
          p.success_count,
          ROUND(p.success_count * 100.0 / NULLIF(p.total_uses, 0), 1) as success_rate,
          ps.last_vpn_ip,
          ps.last_pc_id,
          ps.last_session_at,
          p.created_at
        FROM personas_v2 p
        LEFT JOIN persona_state ps ON p.id = ps.persona_id
      `);

      await conn.execute(`
        CREATE OR REPLACE VIEW pc_status AS
        SELECT
          w.pc_id,
          w.hostname,
          w.status,
          w.current_load,
          w.max_load,
          w.vpn_count,
          w.last_heartbeat
        FROM worker_pcs w
      `);

      console.log('[DBv2] v2 테이블 초기화 완료');
    } finally {
      conn.release();
    }
  }

  // =====================================================
  // PC 등록 및 관리
  // =====================================================

  /**
   * 현재 PC 등록/업데이트
   */
  async registerPC(pcInfo) {
    if (!this.pool) await this.connect();

    const { pcId, hostname, ipAddress, osVersion, chromeVersion, vpnCount, maxLoad } = pcInfo;
    this.pcId = pcId;

    await this.pool.execute(`
      INSERT INTO worker_pcs
      (pc_id, hostname, ip_address, os_version, chrome_version, vpn_count, max_load, status, last_heartbeat)
      VALUES (?, ?, ?, ?, ?, ?, ?, '온라인', NOW())
      ON DUPLICATE KEY UPDATE
        hostname = VALUES(hostname),
        ip_address = VALUES(ip_address),
        os_version = VALUES(os_version),
        chrome_version = VALUES(chrome_version),
        vpn_count = VALUES(vpn_count),
        max_load = VALUES(max_load),
        status = '온라인',
        last_heartbeat = NOW()
    `, [pcId, hostname, ipAddress, osVersion, chromeVersion, vpnCount || 0, maxLoad || 10]);

    console.log(`[DBv2] PC 등록: ${pcId}`);
    return pcId;
  }

  /**
   * PC 하트비트 업데이트
   */
  async heartbeat(currentLoad = 0) {
    if (!this.pool || !this.pcId) return;

    await this.pool.execute(`
      UPDATE worker_pcs SET
        last_heartbeat = NOW(),
        current_load = ?,
        status = '온라인'
      WHERE pc_id = ?
    `, [currentLoad, this.pcId]);
  }

  /**
   * PC 오프라인 표시
   */
  async setOffline() {
    if (!this.pool || !this.pcId) return;

    await this.pool.execute(`
      UPDATE worker_pcs SET status = '오프라인' WHERE pc_id = ?
    `, [this.pcId]);
  }

  // =====================================================
  // 페르소나 v2 관리
  // =====================================================

  /**
   * 페르소나 생성 (v2)
   */
  async createPersona(persona) {
    if (!this.pool) await this.connect();

    const fp = persona.fingerprint || {};

    await this.pool.execute(`
      INSERT INTO personas_v2
      (id, name, base_profile, chrome_version, fingerprint,
       hardware_concurrency, device_memory, screen_width, screen_height,
       webgl_renderer, canvas_noise, audio_noise, unique_seed, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '숙성중')
    `, [
      persona.id,
      persona.name,
      persona.baseProfile || 'galaxy-s23',
      persona.chromeVersion,
      JSON.stringify(fp),
      fp.navigator?.hardwareConcurrency || null,
      fp.navigator?.deviceMemory || null,
      fp.screen?.width || null,
      fp.screen?.height || null,
      fp.webgl?.renderer || null,
      fp.canvasNoise || null,
      fp.audioNoise || null,
      fp.uniqueSeed || null
    ]);

    // 초기 상태 레코드 생성
    await this.pool.execute(`
      INSERT INTO persona_state (persona_id, storage_state, visit_history, search_keywords, visited_shops)
      VALUES (?, NULL, '[]', '[]', '[]')
    `, [persona.id]);

    console.log(`[DBv2] 페르소나 생성: ${persona.id}`);
    return persona.id;
  }

  /**
   * 페르소나 조회 (v2)
   */
  async getPersona(personaId) {
    if (!this.pool) await this.connect();

    const [rows] = await this.pool.execute(`
      SELECT p.*, ps.storage_state, ps.visit_history, ps.search_keywords,
             ps.visited_shops, ps.last_vpn_ip, ps.last_pc_id, ps.last_session_at
      FROM personas_v2 p
      LEFT JOIN persona_state ps ON p.id = ps.persona_id
      WHERE p.id = ?
    `, [personaId]);

    if (rows.length === 0) return null;

    const row = rows[0];
    return this._parsePersonaRow(row);
  }

  /**
   * 숙성 대상 페르소나 조회
   * @param {Object} options - { status, agingLevelMax, limit }
   */
  async getPersonasForAging(options = {}) {
    if (!this.pool) await this.connect();

    const { status = '숙성중', agingLevelMax = 9, limit = 10 } = options;

    const [rows] = await this.pool.execute(`
      SELECT p.*, ps.storage_state, ps.last_vpn_ip, ps.last_pc_id
      FROM personas_v2 p
      LEFT JOIN persona_state ps ON p.id = ps.persona_id
      WHERE p.status = ? AND p.aging_level <= ?
      ORDER BY p.last_used_at ASC, p.aging_level ASC
      LIMIT ?
    `, [status, agingLevelMax, limit]);

    return rows.map(row => this._parsePersonaRow(row));
  }

  /**
   * 페르소나 상태 업데이트
   */
  async updatePersonaStatus(personaId, status) {
    if (!this.pool) await this.connect();

    await this.pool.execute(`
      UPDATE personas_v2 SET status = ? WHERE id = ?
    `, [status, personaId]);
  }

  /**
   * 페르소나 숙성 레벨 업데이트
   */
  async updateAgingLevel(personaId, level, score = null) {
    if (!this.pool) await this.connect();

    if (score !== null) {
      await this.pool.execute(`
        UPDATE personas_v2 SET aging_level = ?, aging_score = ? WHERE id = ?
      `, [level, score, personaId]);
    } else {
      await this.pool.execute(`
        UPDATE personas_v2 SET aging_level = ? WHERE id = ?
      `, [level, personaId]);
    }
  }

  // =====================================================
  // 페르소나 상태 (storage_state) 관리 - 핵심!
  // =====================================================

  /**
   * 스토리지 상태 저장 (Playwright storageState)
   * @param {string} personaId
   * @param {Object} storageState - context.storageState() 결과
   * @param {Object} sessionInfo - { vpnIp, pcId }
   */
  async saveStorageState(personaId, storageState, sessionInfo = {}) {
    if (!this.pool) await this.connect();

    const { vpnIp, pcId } = sessionInfo;

    await this.pool.execute(`
      UPDATE persona_state SET
        storage_state = ?,
        last_vpn_ip = ?,
        last_pc_id = ?,
        last_session_at = NOW(),
        state_version = state_version + 1
      WHERE persona_id = ?
    `, [
      JSON.stringify(storageState),
      vpnIp || null,
      pcId || this.pcId,
      personaId
    ]);

    // personas_v2 테이블의 last_used_at도 업데이트
    await this.pool.execute(`
      UPDATE personas_v2 SET last_used_at = NOW() WHERE id = ?
    `, [personaId]);

    console.log(`[DBv2] 스토리지 상태 저장: ${personaId}`);
  }

  /**
   * 스토리지 상태 로드
   * @param {string} personaId
   * @returns {Object|null} Playwright storageState 형식
   */
  async loadStorageState(personaId) {
    if (!this.pool) await this.connect();

    const [rows] = await this.pool.execute(`
      SELECT storage_state FROM persona_state WHERE persona_id = ?
    `, [personaId]);

    if (rows.length === 0 || !rows[0].storage_state) {
      return null;
    }

    try {
      return JSON.parse(rows[0].storage_state);
    } catch {
      return null;
    }
  }

  /**
   * 방문 히스토리 추가
   */
  async addVisitHistory(personaId, visit) {
    if (!this.pool) await this.connect();

    // 기존 히스토리 조회
    const [rows] = await this.pool.execute(`
      SELECT visit_history FROM persona_state WHERE persona_id = ?
    `, [personaId]);

    let history = [];
    if (rows.length > 0 && rows[0].visit_history) {
      try {
        history = JSON.parse(rows[0].visit_history);
      } catch {}
    }

    // 새 방문 추가
    history.push({
      ...visit,
      timestamp: new Date().toISOString()
    });

    // 최대 100개 유지
    if (history.length > 100) {
      history = history.slice(-100);
    }

    await this.pool.execute(`
      UPDATE persona_state SET visit_history = ? WHERE persona_id = ?
    `, [JSON.stringify(history), personaId]);
  }

  /**
   * 검색 키워드 추가
   */
  async addSearchKeyword(personaId, keyword) {
    if (!this.pool) await this.connect();

    const [rows] = await this.pool.execute(`
      SELECT search_keywords FROM persona_state WHERE persona_id = ?
    `, [personaId]);

    let keywords = [];
    if (rows.length > 0 && rows[0].search_keywords) {
      try {
        keywords = JSON.parse(rows[0].search_keywords);
      } catch {}
    }

    keywords.push({
      keyword,
      timestamp: new Date().toISOString()
    });

    if (keywords.length > 50) {
      keywords = keywords.slice(-50);
    }

    await this.pool.execute(`
      UPDATE persona_state SET search_keywords = ? WHERE persona_id = ?
    `, [JSON.stringify(keywords), personaId]);
  }

  // =====================================================
  // 실행 로그
  // =====================================================

  /**
   * 실행 로그 저장
   */
  async logExecution(data) {
    if (!this.pool) await this.connect();

    const [result] = await this.pool.execute(`
      INSERT INTO execution_logs
      (persona_id, pc_id, vpn_ip, vpn_agent, chrome_version,
       action, target_url, search_keyword, result, duration_ms, error_message, cookies_snapshot)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      data.personaId,
      data.pcId || this.pcId,
      data.vpnIp || null,
      data.vpnAgent || null,
      data.chromeVersion || null,
      data.action || 'aging',
      data.targetUrl || null,
      data.searchKeyword || null,
      data.result,
      data.durationMs || null,
      data.errorMessage || null,
      data.cookiesSnapshot ? JSON.stringify(data.cookiesSnapshot) : null
    ]);

    // 페르소나 통계 업데이트
    const isSuccess = data.result === '성공';
    const isBlocked = data.result === '봇탐지';

    await this.pool.execute(`
      UPDATE personas_v2 SET
        total_uses = total_uses + 1,
        success_count = success_count + ?,
        blocked_count = blocked_count + ?,
        last_result = ?,
        last_used_at = NOW()
      WHERE id = ?
    `, [
      isSuccess ? 1 : 0,
      isBlocked ? 1 : 0,
      data.result,
      data.personaId
    ]);

    return result.insertId;
  }

  // =====================================================
  // VPN 풀 관리
  // =====================================================

  /**
   * VPN 에이전트 등록
   */
  async registerVPN(agentId, vpnIp = null) {
    if (!this.pool) await this.connect();

    await this.pool.execute(`
      INSERT INTO vpn_pool (agent_id, vpn_ip, status)
      VALUES (?, ?, '사용가능')
      ON DUPLICATE KEY UPDATE
        vpn_ip = VALUES(vpn_ip),
        status = '사용가능'
    `, [agentId, vpnIp]);
  }

  /**
   * 사용 가능한 VPN 할당
   */
  async allocateVPN(personaId) {
    if (!this.pool) await this.connect();

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      // 사용 가능한 VPN 찾기
      const [vpns] = await conn.execute(`
        SELECT * FROM vpn_pool
        WHERE status = '사용가능'
        ORDER BY last_used_at ASC
        LIMIT 1
        FOR UPDATE
      `);

      if (vpns.length === 0) {
        await conn.rollback();
        return null;
      }

      const vpn = vpns[0];

      // VPN 할당
      await conn.execute(`
        UPDATE vpn_pool SET
          status = '사용중',
          assigned_pc = ?,
          assigned_persona = ?,
          last_used_at = NOW()
        WHERE id = ?
      `, [this.pcId, personaId, vpn.id]);

      await conn.commit();
      return vpn;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  /**
   * VPN 반납
   */
  async releaseVPN(vpnId, blocked = false) {
    if (!this.pool) await this.connect();

    await this.pool.execute(`
      UPDATE vpn_pool SET
        status = '사용가능',
        assigned_pc = NULL,
        assigned_persona = NULL,
        total_uses = total_uses + 1,
        blocked_count = blocked_count + ?
      WHERE id = ?
    `, [blocked ? 1 : 0, vpnId]);
  }

  // =====================================================
  // 숙성 큐 관리
  // =====================================================

  /**
   * 숙성 작업 추가
   */
  async enqueueAging(personaId, priority = 5, scheduledAt = null) {
    if (!this.pool) await this.connect();

    await this.pool.execute(`
      INSERT INTO aging_queue (persona_id, priority, scheduled_at, status)
      VALUES (?, ?, ?, '대기')
    `, [personaId, priority, scheduledAt]);
  }

  /**
   * 다음 작업 가져오기 (이 PC에 할당)
   */
  async dequeueAging() {
    if (!this.pool) await this.connect();

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      // 대기 중인 작업 찾기
      const [tasks] = await conn.execute(`
        SELECT aq.*, p.fingerprint, ps.storage_state
        FROM aging_queue aq
        JOIN personas_v2 p ON aq.persona_id = p.id
        LEFT JOIN persona_state ps ON p.id = ps.persona_id
        WHERE aq.status = '대기'
          AND (aq.scheduled_at IS NULL OR aq.scheduled_at <= NOW())
          AND aq.attempts < aq.max_attempts
        ORDER BY aq.priority ASC, aq.scheduled_at ASC, aq.created_at ASC
        LIMIT 1
        FOR UPDATE
      `);

      if (tasks.length === 0) {
        await conn.rollback();
        return null;
      }

      const task = tasks[0];

      // 작업 할당
      await conn.execute(`
        UPDATE aging_queue SET
          status = '진행중',
          assigned_pc = ?,
          started_at = NOW(),
          attempts = attempts + 1
        WHERE id = ?
      `, [this.pcId, task.id]);

      await conn.commit();

      return {
        queueId: task.id,
        personaId: task.persona_id,
        priority: task.priority,
        attempts: task.attempts + 1,
        fingerprint: task.fingerprint ? JSON.parse(task.fingerprint) : null,
        storageState: task.storage_state ? JSON.parse(task.storage_state) : null
      };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  /**
   * 작업 완료 처리
   */
  async completeAging(queueId, resultLogId, success = true) {
    if (!this.pool) await this.connect();

    const status = success ? '완료' : '실패';

    await this.pool.execute(`
      UPDATE aging_queue SET
        status = ?,
        result_log_id = ?,
        completed_at = NOW()
      WHERE id = ?
    `, [status, resultLogId, queueId]);
  }

  // =====================================================
  // 통계 및 조회
  // =====================================================

  /**
   * 오늘 통계 조회 (v2)
   */
  async getTodayStats() {
    if (!this.pool) await this.connect();

    const [rows] = await this.pool.execute(`
      SELECT * FROM daily_stats_v2 WHERE date = CURDATE()
    `);

    return rows[0] || {
      total_runs: 0,
      unique_personas: 0,
      active_pcs: 0,
      success: 0,
      blocked: 0,
      errors: 0,
      success_rate: 0
    };
  }

  /**
   * 페르소나 요약 조회
   */
  async getPersonaSummary(limit = 50) {
    if (!this.pool) await this.connect();

    const [rows] = await this.pool.execute(`
      SELECT * FROM persona_summary LIMIT ?
    `, [limit]);

    return rows;
  }

  /**
   * PC 상태 조회
   */
  async getPCStatus() {
    if (!this.pool) await this.connect();

    const [rows] = await this.pool.execute(`
      SELECT * FROM pc_status
    `);

    return rows;
  }

  // =====================================================
  // 유틸리티
  // =====================================================

  _parsePersonaRow(row) {
    const parseJson = (val) => {
      if (!val) return null;
      if (typeof val === 'string') {
        try { return JSON.parse(val); } catch { return null; }
      }
      return val;
    };

    return {
      id: row.id,
      name: row.name,
      baseProfile: row.base_profile,
      chromeVersion: row.chrome_version,
      fingerprint: parseJson(row.fingerprint),
      status: row.status,
      agingLevel: row.aging_level,
      agingScore: row.aging_score,
      totalUses: row.total_uses,
      successCount: row.success_count,
      blockedCount: row.blocked_count,
      lastResult: row.last_result,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      // State
      storageState: parseJson(row.storage_state),
      visitHistory: parseJson(row.visit_history),
      searchKeywords: parseJson(row.search_keywords),
      visitedShops: parseJson(row.visited_shops),
      lastVpnIp: row.last_vpn_ip,
      lastPcId: row.last_pc_id,
      lastSessionAt: row.last_session_at
    };
  }

  /**
   * 연결 종료
   */
  async close() {
    if (this.pool) {
      // 오프라인 표시
      await this.setOffline();
      await this.pool.end();
      this.pool = null;
      this.initialized = false;
      console.log('[DBv2] 연결 종료');
    }
  }
}

// 싱글톤 인스턴스
const dbV2 = new DatabaseV2();

export default dbV2;
export { DatabaseV2 };
