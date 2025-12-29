/**
 * Database - MariaDB 연결 및 로그 저장
 *
 * 서버: 220.121.120.83
 * DB: naver_persona
 * 사용자: naver_persona / Tech1324
 */

import mysql from 'mysql2/promise';

const DB_CONFIG = {
  host: '220.121.120.83',
  user: 'naver_persona',
  password: 'Tech1324',
  database: 'naver_persona',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
};

// 고정 검색어
export const FIXED_SEARCH = '아이간식 달빛기정떡';

class Database {
  constructor() {
    this.pool = null;
    this.initialized = false;
  }

  /**
   * DB 연결 풀 초기화
   */
  async connect() {
    if (this.pool) return this.pool;

    try {
      this.pool = mysql.createPool(DB_CONFIG);

      // 연결 테스트
      const conn = await this.pool.getConnection();
      console.log('[DB] MariaDB 연결 성공');
      conn.release();

      // 테이블 생성
      await this.initTables();
      this.initialized = true;

      return this.pool;
    } catch (error) {
      console.error('[DB] 연결 실패:', error.message);
      throw error;
    }
  }

  /**
   * 테이블 초기화
   */
  async initTables() {
    const conn = await this.pool.getConnection();

    try {
      // 세션 로그 테이블
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS session_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          session_id VARCHAR(50) NOT NULL,
          vpn_ip VARCHAR(45),
          vpn_agent VARCHAR(20),
          chrome_version VARCHAR(50),
          search_keyword VARCHAR(255) DEFAULT '${FIXED_SEARCH}',
          total_personas INT DEFAULT 0,
          success_count INT DEFAULT 0,
          blocked_count INT DEFAULT 0,
          error_count INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_session_id (session_id),
          INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // 페르소나 실행 로그 테이블
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS persona_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          session_id VARCHAR(50) NOT NULL,
          persona_id VARCHAR(50) NOT NULL,
          persona_name VARCHAR(100),
          base_profile VARCHAR(30),
          chrome_version VARCHAR(50),
          vpn_ip VARCHAR(45),
          hardware_concurrency INT,
          device_memory INT,
          screen_width INT,
          screen_height INT,
          result ENUM('성공', '봇탐지', 'IP불일치', '에러', '미실행') DEFAULT '미실행',
          error_message TEXT,
          profile_dir TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_session_id (session_id),
          INDEX idx_persona_id (persona_id),
          INDEX idx_result (result),
          INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // 페르소나 마스터 테이블 (핑거프린트 저장)
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS personas (
          id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(100),
          base_profile VARCHAR(30) DEFAULT 'galaxy-s23',
          fingerprint JSON,
          hardware_concurrency INT,
          device_memory INT,
          screen_width INT,
          screen_height INT,
          webgl_vendor VARCHAR(100),
          webgl_renderer VARCHAR(100),
          canvas_noise DECIMAL(20, 18),
          audio_noise DECIMAL(20, 18),
          unique_seed VARCHAR(64),
          total_uses INT DEFAULT 0,
          success_count INT DEFAULT 0,
          blocked_count INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_used_at TIMESTAMP NULL,
          INDEX idx_base_profile (base_profile),
          INDEX idx_created_at (created_at),
          INDEX idx_last_used_at (last_used_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // 프로필 데이터 테이블 (프로필별 쿠키/히스토리/localStorage/파일백업 저장)
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS profile_data (
          id INT AUTO_INCREMENT PRIMARY KEY,
          profile_key VARCHAR(100) NOT NULL UNIQUE,
          thread_id INT NOT NULL,
          chrome_version VARCHAR(50) NOT NULL,
          vpn_ip VARCHAR(45),
          fingerprint JSON,
          cookies LONGTEXT,
          origins LONGTEXT,
          file_backup LONGTEXT,
          history LONGTEXT,
          preferences LONGTEXT,
          total_uses INT DEFAULT 0,
          last_result ENUM('성공', '봇탐지', 'IP불일치', '에러') NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_thread_id (thread_id),
          INDEX idx_chrome_version (chrome_version),
          INDEX idx_vpn_ip (vpn_ip),
          INDEX idx_updated_at (updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // 컬럼 추가 (기존 테이블에 없는 경우)
      try {
        await conn.execute(`ALTER TABLE profile_data ADD COLUMN origins LONGTEXT AFTER cookies`);
      } catch (e) { /* 이미 존재 */ }

      try {
        await conn.execute(`ALTER TABLE profile_data ADD COLUMN file_backup LONGTEXT AFTER origins`);
      } catch (e) { /* 이미 존재 */ }

      // 통계 뷰 (일별)
      await conn.execute(`
        CREATE OR REPLACE VIEW daily_stats AS
        SELECT
          DATE(created_at) as date,
          COUNT(*) as total_runs,
          SUM(CASE WHEN result = '성공' THEN 1 ELSE 0 END) as success,
          SUM(CASE WHEN result = '봇탐지' THEN 1 ELSE 0 END) as blocked,
          SUM(CASE WHEN result = '에러' THEN 1 ELSE 0 END) as errors,
          ROUND(SUM(CASE WHEN result = '성공' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as success_rate
        FROM persona_logs
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `);

      console.log('[DB] 테이블 초기화 완료');
    } finally {
      conn.release();
    }
  }

  /**
   * 세션 로그 저장
   */
  async logSession(data) {
    if (!this.pool) await this.connect();

    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    try {
      // 세션 로그 삽입
      await this.pool.execute(`
        INSERT INTO session_logs
        (session_id, vpn_ip, vpn_agent, chrome_version, search_keyword,
         total_personas, success_count, blocked_count, error_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        sessionId,
        data.vpnIp,
        data.agentId,
        data.chromeVersion,
        FIXED_SEARCH,
        data.personas?.length || 0,
        data.personas?.filter(p => p.result === '성공').length || 0,
        data.personas?.filter(p => p.result === '봇탐지').length || 0,
        data.personas?.filter(p => !['성공', '봇탐지'].includes(p.result)).length || 0
      ]);

      // 페르소나별 로그 삽입
      if (data.personas && data.personas.length > 0) {
        for (const p of data.personas) {
          await this.pool.execute(`
            INSERT INTO persona_logs
            (session_id, persona_id, persona_name, base_profile, chrome_version,
             vpn_ip, hardware_concurrency, device_memory, screen_width, screen_height,
             result, error_message, profile_dir)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            sessionId,
            p.id,
            p.name,
            p.baseProfile,
            data.chromeVersion,
            data.vpnIp,
            p.fingerprint?.navigator?.hardwareConcurrency || null,
            p.fingerprint?.navigator?.deviceMemory || null,
            p.fingerprint?.screen?.width || null,
            p.fingerprint?.screen?.height || null,
            p.result || '미실행',
            p.error || null,
            p.profileDir || null
          ]);
        }
      }

      console.log(`[DB] 세션 저장: ${sessionId}`);
      return sessionId;

    } catch (error) {
      console.error('[DB] 로그 저장 실패:', error.message);
      throw error;
    }
  }

  /**
   * 오늘 통계 조회
   */
  async getTodayStats() {
    if (!this.pool) await this.connect();

    const [rows] = await this.pool.execute(`
      SELECT * FROM daily_stats WHERE date = CURDATE()
    `);

    return rows[0] || { total_runs: 0, success: 0, blocked: 0, errors: 0, success_rate: 0 };
  }

  /**
   * 최근 세션 조회
   */
  async getRecentSessions(limit = 10) {
    if (!this.pool) await this.connect();

    const [rows] = await this.pool.execute(`
      SELECT * FROM session_logs
      ORDER BY created_at DESC
      LIMIT ?
    `, [limit]);

    return rows;
  }

  /**
   * 페르소나 저장 (upsert)
   */
  async savePersona(persona) {
    if (!this.pool) await this.connect();

    const fp = persona.fingerprint || {};
    const stats = persona.stats || {};

    await this.pool.execute(`
      INSERT INTO personas
      (id, name, base_profile, fingerprint, hardware_concurrency, device_memory,
       screen_width, screen_height, webgl_vendor, webgl_renderer,
       canvas_noise, audio_noise, unique_seed, total_uses, success_count, blocked_count,
       created_at, last_used_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        fingerprint = VALUES(fingerprint),
        total_uses = VALUES(total_uses),
        success_count = VALUES(success_count),
        blocked_count = VALUES(blocked_count),
        last_used_at = VALUES(last_used_at)
    `, [
      persona.id,
      persona.name,
      persona.baseProfile || 'galaxy-s23',
      JSON.stringify(fp),
      fp.navigator?.hardwareConcurrency || null,
      fp.navigator?.deviceMemory || null,
      fp.screen?.width || null,
      fp.screen?.height || null,
      fp.webgl?.vendor || null,
      fp.webgl?.renderer || null,
      fp.canvasNoise || null,
      fp.audioNoise || null,
      fp.uniqueSeed || null,
      stats.totalUses || 0,
      stats.successCount || 0,
      stats.blockedCount || 0,
      persona.createdAt ? new Date(persona.createdAt) : new Date(),
      persona.lastUsedAt ? new Date(persona.lastUsedAt) : null
    ]);
  }

  /**
   * 페르소나 조회
   */
  async getPersona(personaId) {
    if (!this.pool) await this.connect();

    const [rows] = await this.pool.execute(`
      SELECT * FROM personas WHERE id = ?
    `, [personaId]);

    return rows[0] || null;
  }

  /**
   * 모든 페르소나 조회
   */
  async getAllPersonas(limit = 100) {
    if (!this.pool) await this.connect();

    const [rows] = await this.pool.execute(`
      SELECT id, name, base_profile, hardware_concurrency, device_memory,
             screen_width, screen_height, webgl_renderer,
             total_uses, success_count, blocked_count, created_at, last_used_at
      FROM personas
      ORDER BY created_at DESC
      LIMIT ?
    `, [limit]);

    return rows;
  }

  /**
   * 페르소나 사용 기록 업데이트
   */
  async updatePersonaUsage(personaId, success = true) {
    if (!this.pool) await this.connect();

    const successIncrement = success ? 1 : 0;
    const blockedIncrement = success ? 0 : 1;

    await this.pool.execute(`
      UPDATE personas SET
        total_uses = total_uses + 1,
        success_count = success_count + ?,
        blocked_count = blocked_count + ?,
        last_used_at = NOW()
      WHERE id = ?
    `, [successIncrement, blockedIncrement, personaId]);
  }

  /**
   * 프로필 데이터 저장 (쿠키, localStorage, 파일백업, 히스토리, Preferences + VPN IP)
   * @param {Object} data - { threadId, chromeVersion, vpnIp, fingerprint, cookies, origins, fileBackup, history, preferences, result }
   */
  async saveProfileData(data) {
    if (!this.pool) await this.connect();

    const profileKey = `thread-${data.threadId}/${data.chromeVersion}`;

    try {
      await this.pool.execute(`
        INSERT INTO profile_data
        (profile_key, thread_id, chrome_version, vpn_ip, fingerprint, cookies, origins, file_backup, history, preferences, total_uses, last_result)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        ON DUPLICATE KEY UPDATE
          vpn_ip = VALUES(vpn_ip),
          fingerprint = VALUES(fingerprint),
          cookies = VALUES(cookies),
          origins = VALUES(origins),
          file_backup = VALUES(file_backup),
          history = VALUES(history),
          preferences = VALUES(preferences),
          total_uses = total_uses + 1,
          last_result = VALUES(last_result),
          updated_at = NOW()
      `, [
        profileKey,
        data.threadId,
        data.chromeVersion,
        data.vpnIp || null,
        JSON.stringify(data.fingerprint || {}),
        JSON.stringify(data.cookies || []),
        JSON.stringify(data.origins || []),
        data.fileBackup ? JSON.stringify(data.fileBackup) : null,
        JSON.stringify(data.history || []),
        JSON.stringify(data.preferences || {}),
        data.result || null
      ]);

      return profileKey;
    } catch (error) {
      console.error('[DB] 프로필 데이터 저장 실패:', error.message);
      throw error;
    }
  }

  /**
   * 프로필 데이터 로드
   * @param {number} threadId
   * @param {string} chromeVersion
   */
  async loadProfileData(threadId, chromeVersion) {
    if (!this.pool) await this.connect();

    const profileKey = `thread-${threadId}/${chromeVersion}`;

    const [rows] = await this.pool.execute(`
      SELECT * FROM profile_data WHERE profile_key = ?
    `, [profileKey]);

    if (rows.length === 0) return null;

    const row = rows[0];
    const parseJson = (val) => {
      if (!val) return null;
      if (typeof val === 'string') {
        try { return JSON.parse(val); } catch { return null; }
      }
      return val;
    };

    return {
      profileKey: row.profile_key,
      threadId: row.thread_id,
      chromeVersion: row.chrome_version,
      vpnIp: row.vpn_ip,
      fingerprint: parseJson(row.fingerprint),
      cookies: parseJson(row.cookies) || [],
      origins: parseJson(row.origins) || [],
      fileBackup: parseJson(row.file_backup),
      history: parseJson(row.history) || [],
      preferences: parseJson(row.preferences),
      totalUses: row.total_uses,
      lastResult: row.last_result,
      updatedAt: row.updated_at
    };
  }

  /**
   * 모든 프로필 데이터 조회
   */
  async getAllProfileData(limit = 50) {
    if (!this.pool) await this.connect();

    const [rows] = await this.pool.execute(`
      SELECT profile_key, thread_id, chrome_version, total_uses, last_result, updated_at
      FROM profile_data
      ORDER BY updated_at DESC
      LIMIT ?
    `, [limit]);

    return rows;
  }

  /**
   * JSON 파일에서 페르소나 마이그레이션
   */
  async migrateFromJson(personasDir) {
    if (!this.pool) await this.connect();

    const fs = await import('fs/promises');
    const path = await import('path');

    let migrated = 0;
    let errors = 0;

    try {
      const entries = await fs.readdir(personasDir, { withFileTypes: true });

      for (const entry of entries) {
        // persona-XXXX 폴더 또는 .json 파일
        let jsonPath;

        if (entry.isDirectory() && entry.name.startsWith('persona-')) {
          jsonPath = path.join(personasDir, entry.name, 'persona.json');
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          jsonPath = path.join(personasDir, entry.name);
        } else {
          continue;
        }

        try {
          const data = await fs.readFile(jsonPath, 'utf8');
          const persona = JSON.parse(data);

          await this.savePersona(persona);
          migrated++;
        } catch (e) {
          errors++;
        }
      }

      console.log(`[DB] 마이그레이션 완료: ${migrated}개 성공, ${errors}개 실패`);
      return { migrated, errors };

    } catch (error) {
      console.error('[DB] 마이그레이션 실패:', error.message);
      throw error;
    }
  }

  /**
   * 연결 종료
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.initialized = false;
      console.log('[DB] 연결 종료');
    }
  }
}

// 싱글톤 인스턴스
const db = new Database();

export default db;
export { Database, DB_CONFIG };
