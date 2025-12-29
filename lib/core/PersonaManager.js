/**
 * PersonaManager - 페르소나 통합 관리
 *
 * 역할:
 * - DB (메타데이터) + Storage (파일) 통합
 * - 수천만 규모 대응 설계
 *
 * 데이터 분리:
 * - DB: id, status, aging_level, 통계, 타임스탬프 (경량)
 * - File: fingerprint, cookies, state, history (대용량)
 */

import mysql from 'mysql2/promise';
import { DB_CONFIG } from '../db/Database.js';
import PersonaStorage from '../storage/PersonaStorage.js';
import crypto from 'crypto';
import os from 'os';

class PersonaManager {
  constructor(options = {}) {
    this.pool = null;
    this.storage = new PersonaStorage({
      baseDir: options.storageDir || '/data/personas',
      logger: options.logger || console.log
    });
    this.pcId = options.pcId || `pc-${os.hostname()}`;
    this.logger = options.logger || console.log;
  }

  async connect() {
    if (this.pool) return;

    this.pool = mysql.createPool(DB_CONFIG);

    // 연결 테스트
    const conn = await this.pool.getConnection();
    conn.release();

    // 테이블 초기화
    await this._initTables();

    this.logger('[PersonaManager] 연결 완료');
  }

  async _initTables() {
    const conn = await this.pool.getConnection();
    try {
      // 경량화된 personas 테이블
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS personas_v3 (
          id VARCHAR(36) PRIMARY KEY,
          fingerprint_hash VARCHAR(64),
          base_profile VARCHAR(20) DEFAULT 'galaxy-s23',
          chrome_version VARCHAR(50),

          status ENUM('숙성중','활성','휴면','차단','폐기') DEFAULT '숙성중',
          aging_level TINYINT DEFAULT 0,
          aging_score INT DEFAULT 0,

          total_uses INT DEFAULT 0,
          success_count INT DEFAULT 0,
          blocked_count INT DEFAULT 0,
          last_result ENUM('성공','봇탐지','IP불일치','에러') NULL,

          last_vpn_ip VARCHAR(45),
          last_pc_id VARCHAR(50),

          data_path VARCHAR(100),

          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_used_at TIMESTAMP NULL,

          INDEX idx_status (status),
          INDEX idx_aging (aging_level),
          INDEX idx_last_used (last_used_at),
          INDEX idx_fingerprint (fingerprint_hash)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // 실행 로그 (변경 없음)
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS execution_logs_v3 (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          persona_id VARCHAR(36) NOT NULL,
          pc_id VARCHAR(50),
          vpn_ip VARCHAR(45),
          action VARCHAR(50),
          result ENUM('성공','봇탐지','IP불일치','에러','타임아웃') NOT NULL,
          duration_ms INT,
          error_message TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

          INDEX idx_persona (persona_id),
          INDEX idx_result (result),
          INDEX idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // 작업 큐
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS aging_queue_v3 (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          persona_id VARCHAR(36) NOT NULL,
          priority TINYINT DEFAULT 5,
          scheduled_at TIMESTAMP NULL,
          assigned_pc VARCHAR(50),
          status ENUM('대기','진행중','완료','실패') DEFAULT '대기',
          attempts TINYINT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

          INDEX idx_status_priority (status, priority),
          INDEX idx_persona (persona_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

    } finally {
      conn.release();
    }
  }

  /**
   * 핑거프린트 해시 생성
   */
  _hashFingerprint(fingerprint) {
    const str = JSON.stringify(fingerprint);
    return crypto.createHash('sha256').update(str).digest('hex');
  }

  /**
   * 페르소나 생성
   */
  async create(data) {
    if (!this.pool) await this.connect();

    const { id, fingerprint, baseProfile, chromeVersion } = data;
    const fingerprintHash = this._hashFingerprint(fingerprint);
    const dataPath = this.storage.getRelativePath(id);

    // 1. 파일 저장
    await this.storage.saveFingerprint(id, fingerprint);
    await this.storage.saveState(id, { checkpoint: 'created', agingLevel: 0 });

    // 2. DB 저장
    await this.pool.execute(`
      INSERT INTO personas_v3
      (id, fingerprint_hash, base_profile, chrome_version, data_path)
      VALUES (?, ?, ?, ?, ?)
    `, [id, fingerprintHash, baseProfile || 'galaxy-s23', chromeVersion, dataPath]);

    this.logger(`[PersonaManager] 생성: ${id}`);
    return id;
  }

  /**
   * 페르소나 조회
   */
  async get(personaId) {
    if (!this.pool) await this.connect();

    // DB에서 메타데이터
    const [rows] = await this.pool.execute(`
      SELECT * FROM personas_v3 WHERE id = ?
    `, [personaId]);

    if (rows.length === 0) return null;

    const meta = rows[0];

    // 파일에서 상세 데이터
    const fileData = await this.storage.load(personaId);

    return {
      id: meta.id,
      baseProfile: meta.base_profile,
      chromeVersion: meta.chrome_version,
      status: meta.status,
      agingLevel: meta.aging_level,
      totalUses: meta.total_uses,
      successCount: meta.success_count,
      blockedCount: meta.blocked_count,
      lastResult: meta.last_result,
      lastVpnIp: meta.last_vpn_ip,
      lastPcId: meta.last_pc_id,
      createdAt: meta.created_at,
      lastUsedAt: meta.last_used_at,
      // 파일 데이터
      fingerprint: fileData?.fingerprint,
      state: fileData?.state,
      history: fileData?.history
    };
  }

  /**
   * 숙성 대상 조회
   */
  async getForAging(options = {}) {
    if (!this.pool) await this.connect();

    const { status = '숙성중', agingLevelMax = 9, limit = 10 } = options;

    const [rows] = await this.pool.execute(`
      SELECT id, base_profile, chrome_version, aging_level, data_path
      FROM personas_v3
      WHERE status = ? AND aging_level <= ?
      ORDER BY last_used_at ASC, aging_level ASC
      LIMIT ?
    `, [status, agingLevelMax, limit]);

    return rows;
  }

  /**
   * 세션 시작 - 쿠키 복원
   */
  async prepareSession(personaId, profileDir) {
    // 쿠키 파일 복원
    const restored = await this.storage.restoreCookies(personaId, profileDir);

    // 핑거프린트 로드
    const fingerprint = await this.storage.loadFingerprint(personaId);

    return { restored, fingerprint };
  }

  /**
   * 세션 저장 - 쿠키 백업 + 상태 업데이트
   */
  async saveSession(personaId, data) {
    if (!this.pool) await this.connect();

    const { profileDir, checkpoint, vpnIp, result, durationMs } = data;

    // 1. 쿠키 백업
    if (profileDir) {
      await this.storage.saveCookies(personaId, profileDir);
    }

    // 2. 상태 저장
    await this.storage.saveState(personaId, {
      checkpoint,
      vpnIp,
      pcId: this.pcId,
      lastResult: result
    });

    // 3. DB 업데이트
    const isSuccess = result === '성공';
    const isBlocked = result === '봇탐지';

    await this.pool.execute(`
      UPDATE personas_v3 SET
        total_uses = total_uses + 1,
        success_count = success_count + ?,
        blocked_count = blocked_count + ?,
        last_result = ?,
        last_vpn_ip = ?,
        last_pc_id = ?,
        last_used_at = NOW()
      WHERE id = ?
    `, [
      isSuccess ? 1 : 0,
      isBlocked ? 1 : 0,
      result,
      vpnIp,
      this.pcId,
      personaId
    ]);

    // 4. 실행 로그
    await this.pool.execute(`
      INSERT INTO execution_logs_v3
      (persona_id, pc_id, vpn_ip, action, result, duration_ms)
      VALUES (?, ?, ?, 'aging', ?, ?)
    `, [personaId, this.pcId, vpnIp, result, durationMs]);

    this.logger(`[PersonaManager] 세션 저장: ${personaId} (${result})`);
  }

  /**
   * 숙성 레벨 업데이트
   */
  async updateAgingLevel(personaId, level) {
    if (!this.pool) await this.connect();

    await this.pool.execute(`
      UPDATE personas_v3 SET aging_level = ? WHERE id = ?
    `, [level, personaId]);

    // 파일 상태도 업데이트
    const state = await this.storage.loadState(personaId) || {};
    state.agingLevel = level;
    await this.storage.saveState(personaId, state);
  }

  /**
   * 상태 변경
   */
  async updateStatus(personaId, status) {
    if (!this.pool) await this.connect();

    await this.pool.execute(`
      UPDATE personas_v3 SET status = ? WHERE id = ?
    `, [status, personaId]);
  }

  /**
   * 작업 큐에 추가
   */
  async enqueue(personaId, priority = 5) {
    if (!this.pool) await this.connect();

    await this.pool.execute(`
      INSERT INTO aging_queue_v3 (persona_id, priority)
      VALUES (?, ?)
    `, [personaId, priority]);
  }

  /**
   * 작업 가져오기
   */
  async dequeue() {
    if (!this.pool) await this.connect();

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const [tasks] = await conn.execute(`
        SELECT q.*, p.base_profile, p.chrome_version, p.data_path
        FROM aging_queue_v3 q
        JOIN personas_v3 p ON q.persona_id = p.id
        WHERE q.status = '대기'
        ORDER BY q.priority ASC, q.created_at ASC
        LIMIT 1
        FOR UPDATE
      `);

      if (tasks.length === 0) {
        await conn.rollback();
        return null;
      }

      const task = tasks[0];

      await conn.execute(`
        UPDATE aging_queue_v3 SET
          status = '진행중',
          assigned_pc = ?,
          attempts = attempts + 1
        WHERE id = ?
      `, [this.pcId, task.id]);

      await conn.commit();

      // 핑거프린트 로드
      const fingerprint = await this.storage.loadFingerprint(task.persona_id);

      return {
        queueId: task.id,
        personaId: task.persona_id,
        baseProfile: task.base_profile,
        chromeVersion: task.chrome_version,
        priority: task.priority,
        fingerprint
      };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  /**
   * 작업 완료
   */
  async completeQueue(queueId, success = true) {
    if (!this.pool) await this.connect();

    await this.pool.execute(`
      UPDATE aging_queue_v3 SET status = ? WHERE id = ?
    `, [success ? '완료' : '실패', queueId]);
  }

  /**
   * 통계
   */
  async getStats() {
    if (!this.pool) await this.connect();

    const [rows] = await this.pool.execute(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = '숙성중' THEN 1 ELSE 0 END) as aging,
        SUM(CASE WHEN status = '활성' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = '차단' THEN 1 ELSE 0 END) as blocked,
        SUM(total_uses) as total_uses,
        SUM(success_count) as success_count
      FROM personas_v3
    `);

    const storageStats = await this.storage.getStats();

    return {
      db: rows[0],
      storage: storageStats
    };
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

export default PersonaManager;
export { PersonaManager };
