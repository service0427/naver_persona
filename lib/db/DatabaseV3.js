/**
 * DatabaseV3 - 1억 쿠키 대응 대규모 DB
 *
 * 핵심 테이블:
 * 1. cookies - 쿠키 마스터 (파티셔닝 by created_month)
 * 2. profiles - 프로필 정보 (파일백업 포함)
 * 3. execution_logs - 실행 로그
 *
 * 특징:
 * - 월별 파티셔닝으로 대용량 처리
 * - 90일 초과 자동 삭제 (파티션 DROP)
 * - 슬롯 기반 조회 최적화
 */

import mysql from 'mysql2/promise';

const DB_CONFIG = {
  host: '220.121.120.83',
  user: 'naver_persona',
  password: 'Tech1324',
  database: 'naver_persona',
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  charset: 'utf8mb4'
};

// 고정 검색어
export const FIXED_SEARCH = '아이간식 달빛기정떡';

class DatabaseV3 {
  constructor() {
    this.pool = null;
    this.initialized = false;
  }

  async connect() {
    if (this.pool) return this.pool;

    try {
      this.pool = mysql.createPool(DB_CONFIG);
      const conn = await this.pool.getConnection();
      console.log('[DB] MariaDB 연결 성공 (V3)');
      conn.release();

      await this.initTables();
      this.initialized = true;
      return this.pool;
    } catch (error) {
      console.error('[DB] 연결 실패:', error.message);
      throw error;
    }
  }

  /**
   * V3 테이블 초기화
   */
  async initTables() {
    const conn = await this.pool.getConnection();

    try {
      // ============ 1. 프로필 마스터 테이블 ============
      // 슬롯(thread-chrome) 단위 관리, 파일백업 포함
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS profiles (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          slot_id VARCHAR(100) NOT NULL UNIQUE COMMENT 'thread-N/chrome-version',
          thread_id SMALLINT UNSIGNED NOT NULL,
          chrome_version VARCHAR(50) NOT NULL,

          -- 상태
          status ENUM('active', 'blocked', 'expired', 'deleted') DEFAULT 'active',
          vpn_ip VARCHAR(45),
          last_result ENUM('성공', '봇탐지', 'IP불일치', '에러') NULL,

          -- 통계
          total_uses INT UNSIGNED DEFAULT 0,
          success_count INT UNSIGNED DEFAULT 0,
          blocked_count INT UNSIGNED DEFAULT 0,

          -- 핑거프린트 (요약)
          fingerprint_hash VARCHAR(64) COMMENT 'SHA256 of fingerprint',
          screen_width SMALLINT UNSIGNED,
          screen_height SMALLINT UNSIGNED,
          hardware_concurrency TINYINT UNSIGNED,
          device_memory TINYINT UNSIGNED,

          -- 파일 백업 (gzip + base64)
          file_backup LONGTEXT COMMENT 'Cookies + LocalStorage + Preferences',
          backup_size INT UNSIGNED DEFAULT 0 COMMENT 'bytes',

          -- 시간
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          expires_at TIMESTAMP GENERATED ALWAYS AS (DATE_ADD(updated_at, INTERVAL 90 DAY)) STORED,

          INDEX idx_thread (thread_id),
          INDEX idx_status (status),
          INDEX idx_updated (updated_at),
          INDEX idx_expires (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // ============ 2. 쿠키 테이블 (대용량) ============
      // storageState에서 추출한 개별 쿠키
      // RANGE 파티셔닝 by created_at (월별)
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS cookies (
          id BIGINT UNSIGNED AUTO_INCREMENT,
          profile_id INT UNSIGNED NOT NULL,

          -- 쿠키 데이터
          name VARCHAR(255) NOT NULL,
          value TEXT,
          domain VARCHAR(255) NOT NULL,
          path VARCHAR(500) DEFAULT '/',
          expires BIGINT,
          http_only BOOLEAN DEFAULT FALSE,
          secure BOOLEAN DEFAULT FALSE,
          same_site ENUM('Strict', 'Lax', 'None') DEFAULT 'Lax',

          -- 메타
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

          PRIMARY KEY (id, created_at),
          INDEX idx_profile (profile_id),
          INDEX idx_domain (domain),
          INDEX idx_name_domain (name, domain),
          INDEX idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        PARTITION BY RANGE (TO_DAYS(created_at)) (
          PARTITION p_default VALUES LESS THAN (TO_DAYS('2025-01-01'))
        )
      `);

      // ============ 3. localStorage 테이블 ============
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS local_storage (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          profile_id INT UNSIGNED NOT NULL,
          origin VARCHAR(255) NOT NULL,
          key_name VARCHAR(255) NOT NULL,
          value MEDIUMTEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

          INDEX idx_profile (profile_id),
          INDEX idx_origin (origin),
          UNIQUE KEY uk_profile_origin_key (profile_id, origin, key_name(100))
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // ============ 4. 히스토리 테이블 ============
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS history (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          profile_id INT UNSIGNED NOT NULL,
          url VARCHAR(2000) NOT NULL,
          title VARCHAR(500),
          visit_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

          INDEX idx_profile (profile_id),
          INDEX idx_visit_time (visit_time)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // ============ 5. 실행 로그 테이블 ============
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS exec_logs (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          session_id VARCHAR(50) NOT NULL,
          profile_id INT UNSIGNED,
          slot_id VARCHAR(100),

          -- 실행 정보
          worker_pc VARCHAR(50),
          vpn_ip VARCHAR(45),
          vpn_agent VARCHAR(20),
          search_keyword VARCHAR(255),

          -- 결과
          result ENUM('성공', '봇탐지', 'IP불일치', '에러', '미실행') DEFAULT '미실행',
          error_message TEXT,
          duration_ms INT UNSIGNED,

          -- 시간
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_date DATE GENERATED ALWAYS AS (DATE(created_at)) STORED,

          INDEX idx_session (session_id),
          INDEX idx_profile (profile_id),
          INDEX idx_result (result),
          INDEX idx_date (created_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // ============ 6. 통계 요약 테이블 ============
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS daily_summary (
          date DATE PRIMARY KEY,
          total_profiles INT UNSIGNED DEFAULT 0,
          active_profiles INT UNSIGNED DEFAULT 0,
          total_executions INT UNSIGNED DEFAULT 0,
          success_count INT UNSIGNED DEFAULT 0,
          blocked_count INT UNSIGNED DEFAULT 0,
          error_count INT UNSIGNED DEFAULT 0,
          success_rate DECIMAL(5,2) DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      console.log('[DB] V3 테이블 초기화 완료');
    } finally {
      conn.release();
    }
  }

  // ============ 파티션 관리 ============

  /**
   * 현재 월 + 다음 월 파티션 생성 (없으면)
   * RANGE 파티셔닝: TO_DAYS() 사용
   */
  async ensureCurrentPartition() {
    const now = new Date();

    // 현재 월의 다음달 1일 (현재 월 파티션의 상한)
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthName = `p_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
    const nextMonthDate = nextMonth.toISOString().split('T')[0];

    // 다다음 월 1일 (다음 월 파티션의 상한)
    const monthAfter = new Date(now.getFullYear(), now.getMonth() + 2, 1);
    const monthAfterName = `p_${nextMonth.getFullYear()}_${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
    const monthAfterDate = monthAfter.toISOString().split('T')[0];

    const conn = await this.pool.getConnection();
    try {
      // 현재 월 파티션
      await conn.execute(`
        ALTER TABLE cookies ADD PARTITION (
          PARTITION ${nextMonthName} VALUES LESS THAN (TO_DAYS('${nextMonthDate}'))
        )
      `).catch(() => {}); // 이미 존재하면 무시

      // 다음 월 파티션 (미리 생성)
      await conn.execute(`
        ALTER TABLE cookies ADD PARTITION (
          PARTITION ${monthAfterName} VALUES LESS THAN (TO_DAYS('${monthAfterDate}'))
        )
      `).catch(() => {});

    } finally {
      conn.release();
    }
  }

  /**
   * 90일 지난 데이터 정리
   */
  async cleanup90Days() {
    const conn = await this.pool.getConnection();
    const results = { profiles: 0, cookies: 0, localStorage: 0, history: 0 };

    try {
      // 1. 만료된 프로필 soft delete
      const [profileResult] = await conn.execute(`
        UPDATE profiles SET status = 'expired'
        WHERE status = 'active' AND expires_at < NOW()
      `);
      results.profiles = profileResult.affectedRows;

      // 2. 만료된 프로필의 데이터 삭제
      const [expiredProfiles] = await conn.execute(`
        SELECT id FROM profiles WHERE status = 'expired'
      `);

      if (expiredProfiles.length > 0) {
        const ids = expiredProfiles.map(p => p.id).join(',');

        // localStorage 삭제
        const [lsResult] = await conn.execute(`DELETE FROM local_storage WHERE profile_id IN (${ids})`);
        results.localStorage = lsResult.affectedRows;

        // history 삭제
        const [hResult] = await conn.execute(`DELETE FROM history WHERE profile_id IN (${ids})`);
        results.history = hResult.affectedRows;

        // 프로필 완전 삭제
        await conn.execute(`UPDATE profiles SET status = 'deleted', file_backup = NULL WHERE status = 'expired'`);
      }

      // 3. 오래된 쿠키 파티션 DROP (4개월 전)
      const dropDate = new Date();
      dropDate.setMonth(dropDate.getMonth() - 4);
      const dropMonth = `${dropDate.getFullYear()}_${String(dropDate.getMonth() + 1).padStart(2, '0')}`;

      await conn.execute(`ALTER TABLE cookies DROP PARTITION p_${dropMonth}`).catch(() => {});

      console.log(`[DB] 90일 정리 완료:`, results);
      return results;
    } finally {
      conn.release();
    }
  }

  // ============ 프로필 CRUD ============

  /**
   * 프로필 저장/업데이트
   */
  async saveProfile(data) {
    if (!this.pool) await this.connect();
    await this.ensureCurrentPartition();

    const slotId = `thread-${data.threadId}/${data.chromeVersion}`;

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      // 1. 프로필 upsert
      const [result] = await conn.execute(`
        INSERT INTO profiles
        (slot_id, thread_id, chrome_version, vpn_ip, last_result, fingerprint_hash,
         screen_width, screen_height, hardware_concurrency, device_memory,
         file_backup, backup_size, total_uses, success_count, blocked_count, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'active')
        ON DUPLICATE KEY UPDATE
          vpn_ip = VALUES(vpn_ip),
          last_result = VALUES(last_result),
          fingerprint_hash = VALUES(fingerprint_hash),
          file_backup = VALUES(file_backup),
          backup_size = VALUES(backup_size),
          total_uses = total_uses + 1,
          success_count = success_count + VALUES(success_count),
          blocked_count = blocked_count + VALUES(blocked_count),
          status = 'active',
          updated_at = NOW()
      `, [
        slotId,
        data.threadId,
        data.chromeVersion,
        data.vpnIp || null,
        data.result || null,
        data.fingerprintHash || null,
        data.fingerprint?.screen?.width || null,
        data.fingerprint?.screen?.height || null,
        data.fingerprint?.navigator?.hardwareConcurrency || null,
        data.fingerprint?.navigator?.deviceMemory || null,
        data.fileBackup ? JSON.stringify(data.fileBackup) : null,
        data.fileBackup ? JSON.stringify(data.fileBackup).length : 0,
        data.result === '성공' ? 1 : 0,
        data.result === '봇탐지' ? 1 : 0
      ]);

      // 프로필 ID 가져오기
      let profileId;
      if (result.insertId) {
        profileId = result.insertId;
      } else {
        const [rows] = await conn.execute(`SELECT id FROM profiles WHERE slot_id = ?`, [slotId]);
        profileId = rows[0].id;
      }

      // 2. 쿠키 저장 (기존 삭제 후 새로 삽입)
      if (data.cookies && data.cookies.length > 0) {
        // 기존 쿠키 삭제는 파티션 때문에 까다로우므로 그냥 추가
        // 중복은 name+domain 조합으로 나중에 최신 것만 사용

        const cookieValues = data.cookies.map(c => [
          profileId,
          c.name,
          c.value,
          c.domain,
          c.path || '/',
          c.expires || null,
          c.httpOnly || false,
          c.secure || false,
          c.sameSite || 'Lax'
        ]);

        // 배치 삽입 (1000개씩)
        for (let i = 0; i < cookieValues.length; i += 1000) {
          const batch = cookieValues.slice(i, i + 1000);
          const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
          await conn.execute(
            `INSERT INTO cookies (profile_id, name, value, domain, path, expires, http_only, secure, same_site) VALUES ${placeholders}`,
            batch.flat()
          );
        }
      }

      // 3. localStorage 저장
      if (data.origins && data.origins.length > 0) {
        for (const origin of data.origins) {
          if (!origin.localStorage) continue;

          for (const item of origin.localStorage) {
            await conn.execute(`
              INSERT INTO local_storage (profile_id, origin, key_name, value)
              VALUES (?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE value = VALUES(value)
            `, [profileId, origin.origin, item.name, item.value]);
          }
        }
      }

      // 4. 히스토리 저장
      if (data.history && data.history.length > 0) {
        for (const h of data.history) {
          await conn.execute(`
            INSERT INTO history (profile_id, url, title, visit_time)
            VALUES (?, ?, ?, ?)
          `, [profileId, h.url, h.title || null, h.visitTime ? new Date(h.visitTime * 1000) : new Date()]);
        }
      }

      await conn.commit();
      return { profileId, slotId };

    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  /**
   * 프로필 로드
   */
  async loadProfile(threadId, chromeVersion) {
    if (!this.pool) await this.connect();

    const slotId = `thread-${threadId}/${chromeVersion}`;

    const [rows] = await this.pool.execute(`
      SELECT * FROM profiles WHERE slot_id = ? AND status = 'active'
    `, [slotId]);

    if (rows.length === 0) return null;

    const profile = rows[0];

    // 파일백업 파싱
    let fileBackup = null;
    if (profile.file_backup) {
      try {
        fileBackup = JSON.parse(profile.file_backup);
      } catch {}
    }

    return {
      profileId: profile.id,
      slotId: profile.slot_id,
      threadId: profile.thread_id,
      chromeVersion: profile.chrome_version,
      vpnIp: profile.vpn_ip,
      lastResult: profile.last_result,
      totalUses: profile.total_uses,
      successCount: profile.success_count,
      blockedCount: profile.blocked_count,
      fileBackup,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
      expiresAt: profile.expires_at
    };
  }

  /**
   * 프로필의 쿠키 로드 (storageState 형식)
   */
  async loadCookies(profileId) {
    const [rows] = await this.pool.execute(`
      SELECT name, value, domain, path, expires, http_only, secure, same_site
      FROM cookies
      WHERE profile_id = ?
      ORDER BY created_at DESC
    `, [profileId]);

    // name+domain 중복 제거 (최신 것만)
    const seen = new Set();
    const cookies = [];

    for (const row of rows) {
      const key = `${row.name}|${row.domain}`;
      if (seen.has(key)) continue;
      seen.add(key);

      cookies.push({
        name: row.name,
        value: row.value,
        domain: row.domain,
        path: row.path,
        expires: row.expires,
        httpOnly: row.http_only,
        secure: row.secure,
        sameSite: row.same_site
      });
    }

    return cookies;
  }

  /**
   * 프로필의 localStorage 로드
   */
  async loadLocalStorage(profileId) {
    const [rows] = await this.pool.execute(`
      SELECT origin, key_name, value FROM local_storage WHERE profile_id = ?
    `, [profileId]);

    // origin별로 그룹화
    const originsMap = new Map();
    for (const row of rows) {
      if (!originsMap.has(row.origin)) {
        originsMap.set(row.origin, { origin: row.origin, localStorage: [] });
      }
      originsMap.get(row.origin).localStorage.push({
        name: row.key_name,
        value: row.value
      });
    }

    return Array.from(originsMap.values());
  }

  // ============ 실행 로그 ============

  async logExecution(data) {
    if (!this.pool) await this.connect();

    const sessionId = data.sessionId || `exec-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    await this.pool.execute(`
      INSERT INTO exec_logs
      (session_id, profile_id, slot_id, worker_pc, vpn_ip, vpn_agent, search_keyword, result, error_message, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      sessionId,
      data.profileId || null,
      data.slotId || null,
      data.workerPc || null,
      data.vpnIp || null,
      data.vpnAgent || null,
      data.searchKeyword || FIXED_SEARCH,
      data.result || '미실행',
      data.errorMessage || null,
      data.durationMs || null
    ]);

    return sessionId;
  }

  // ============ 통계 ============

  /**
   * 일일 통계 업데이트
   */
  async updateDailySummary() {
    const conn = await this.pool.getConnection();
    try {
      await conn.execute(`
        INSERT INTO daily_summary (date, total_profiles, active_profiles, total_executions, success_count, blocked_count, error_count, success_rate)
        SELECT
          CURDATE(),
          (SELECT COUNT(*) FROM profiles),
          (SELECT COUNT(*) FROM profiles WHERE status = 'active'),
          COUNT(*),
          SUM(CASE WHEN result = '성공' THEN 1 ELSE 0 END),
          SUM(CASE WHEN result = '봇탐지' THEN 1 ELSE 0 END),
          SUM(CASE WHEN result IN ('에러', 'IP불일치') THEN 1 ELSE 0 END),
          ROUND(SUM(CASE WHEN result = '성공' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 2)
        FROM exec_logs
        WHERE created_date = CURDATE()
        ON DUPLICATE KEY UPDATE
          total_profiles = VALUES(total_profiles),
          active_profiles = VALUES(active_profiles),
          total_executions = VALUES(total_executions),
          success_count = VALUES(success_count),
          blocked_count = VALUES(blocked_count),
          error_count = VALUES(error_count),
          success_rate = VALUES(success_rate)
      `);
    } finally {
      conn.release();
    }
  }

  /**
   * 통계 조회
   */
  async getStats(days = 7) {
    const [rows] = await this.pool.execute(`
      SELECT * FROM daily_summary
      ORDER BY date DESC LIMIT ?
    `, [days]);

    const [totals] = await this.pool.execute(`
      SELECT
        COUNT(*) as total_profiles,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_profiles,
        SUM(total_uses) as total_uses,
        SUM(success_count) as total_success,
        SUM(blocked_count) as total_blocked
      FROM profiles
    `);

    return {
      daily: rows,
      totals: totals[0]
    };
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.initialized = false;
      console.log('[DB] V3 연결 종료');
    }
  }
}

// 싱글톤 인스턴스
const dbV3 = new DatabaseV3();

export default dbV3;
export { DatabaseV3, DB_CONFIG };
