/**
 * PersonaDB - 단순화된 쿠키 숙성 데이터베이스
 *
 * 설계 원칙:
 * 1. 단순함 - IP + 유저속성(성별, 나이, 직업)
 * 2. 1시간 쿨다운 후 동일 IP에서만 재사용
 * 3. 디바이스는 현재 s23plus 고정 (추후 확장)
 *
 * 코드 형식: W3M (직업+연령+성별) - 시간대 제거
 */

import mysql from 'mysql2/promise';
import crypto from 'crypto';

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

// ============ 페르소나 속성 정의 (단순화) ============

// 직업 유형: W(직장인), S(학생), H(주부), F(프리랜서), R(은퇴자)
export const USER_TYPES = {
  W: { weight: 50, label: '직장인' },
  S: { weight: 20, label: '학생' },
  H: { weight: 15, label: '주부' },
  F: { weight: 10, label: '프리랜서' },
  R: { weight: 5, label: '은퇴자' }
};

// 연령대: 2(20대), 3(30대), 4(40대), 5(50대+)
export const AGE_GROUPS = {
  '2': { weight: 30, label: '20대' },
  '3': { weight: 35, label: '30대' },
  '4': { weight: 25, label: '40대' },
  '5': { weight: 10, label: '50대+' }
};

// 성별
export const GENDERS = {
  M: { weight: 55, label: '남성' },
  F: { weight: 45, label: '여성' }
};

// ============ 페르소나 규칙 ============

// 쿨다운 시간 (밀리초)
const COOLDOWN_MS = 60 * 60 * 1000; // 1시간

// 세션 한도
const PERSONA_RULES = {
  // 일일 최대 세션 (하루 너무 많이 사용하면 의심)
  MAX_DAILY_SESSIONS: 4,

  // 총 최대 세션 (너무 많이 사용된 페르소나는 폐기)
  MAX_TOTAL_SESSIONS: 30,

  // 페르소나 최대 수명 (일) - 오래된 것은 폐기
  MAX_AGE_DAYS: 14,

  // 연속 차단 시 폐기 임계값
  MAX_CONSECUTIVE_BLOCKS: 3,

  // 차단 비율 임계값 (총 세션 대비)
  MAX_BLOCK_RATIO: 0.3,

  // 세션 간 최소 간격 (ms) - 연속 사용 방지
  MIN_SESSION_INTERVAL: 30 * 60 * 1000  // 30분
};

/**
 * 가중치 기반 랜덤 선택
 */
export function weightedRandom(options) {
  const entries = Object.entries(options);
  const totalWeight = entries.reduce((sum, [_, v]) => sum + v.weight, 0);
  let random = Math.random() * totalWeight;

  for (const [key, value] of entries) {
    random -= value.weight;
    if (random <= 0) return key;
  }
  return entries[0][0];
}

/**
 * 페르소나 코드 생성 (예: W3M = 직장인+30대+남성)
 */
export function generateCode(userType, ageGroup, gender) {
  return `${userType}${ageGroup}${gender}`;
}

// ============ PersonaDB 클래스 ============

class PersonaDB {
  constructor() {
    this.pool = null;
    this.initialized = false;
  }

  async connect() {
    if (this.pool) return this.pool;

    try {
      this.pool = mysql.createPool(DB_CONFIG);
      const conn = await this.pool.getConnection();
      console.log('[PersonaDB] MariaDB 연결 성공');
      conn.release();

      await this.initTables();
      this.initialized = true;
      return this.pool;
    } catch (error) {
      console.error('[PersonaDB] 연결 실패:', error.message);
      throw error;
    }
  }

  /**
   * 테이블 초기화
   */
  async initTables() {
    const conn = await this.pool.getConnection();

    try {
      // ============ 핵심 테이블: personas ============
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS personas (
          -- 식별자
          id VARCHAR(36) PRIMARY KEY,
          code VARCHAR(10) NOT NULL COMMENT 'W3M 형식 (직업+연령+성별)',

          -- 페르소나 속성 (단순화)
          user_type CHAR(1) NOT NULL COMMENT 'W/S/H/F/R',
          age_group CHAR(1) NOT NULL COMMENT '2/3/4/5',
          gender CHAR(1) NOT NULL COMMENT 'M/F',

          -- 디바이스 (현재 고정)
          device_type VARCHAR(30) DEFAULT 's23plus-real',
          fingerprint JSON COMMENT '핑거프린트',

          -- 데이터 백업
          data_backup LONGTEXT COMMENT 'gzip+base64 파일 백업',
          storage_state JSON COMMENT 'Playwright storageState',

          -- IP 관련 (재사용 조건)
          created_ip VARCHAR(45) COMMENT '최초 생성 IP',
          last_ip VARCHAR(45) COMMENT '마지막 사용 IP',

          -- 상태
          status ENUM('new', 'active', 'blocked', 'expired') DEFAULT 'new',

          -- 통계
          session_count INT UNSIGNED DEFAULT 0,
          success_count INT UNSIGNED DEFAULT 0,
          blocked_count INT UNSIGNED DEFAULT 0,

          -- 시간
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          last_used_at DATETIME,

          -- 인덱스
          INDEX idx_code (code),
          INDEX idx_status (status),
          INDEX idx_created_ip (created_ip),
          INDEX idx_last_ip (last_ip),
          INDEX idx_last_used (last_used_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // created_ip 컬럼 추가 (기존 테이블용)
      try {
        await conn.execute(`ALTER TABLE personas ADD COLUMN created_ip VARCHAR(45) COMMENT '최초 생성 IP' AFTER storage_state`);
      } catch (e) {
        // 이미 존재하면 무시
      }

      // time_slot 컬럼이 있으면 제거 안함 (호환성)
      // 대신 새 레코드에서는 사용 안함

      // ============ 로그 테이블: logs ============
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS logs (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          persona_id VARCHAR(36),
          session_id VARCHAR(50),

          -- 실행 정보
          vpn_ip VARCHAR(45),
          search_keyword VARCHAR(255),
          result ENUM('성공', '봇탐지', 'IP불일치', '에러') NOT NULL,
          error_message TEXT,
          duration_ms INT UNSIGNED,

          -- 시간
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

          INDEX idx_persona (persona_id),
          INDEX idx_result (result),
          INDEX idx_date (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      console.log('[PersonaDB] 테이블 초기화 완료');
    } finally {
      conn.release();
    }
  }

  // ============ 페르소나 생성 ============

  /**
   * 새 페르소나 생성 (랜덤 속성)
   * @param {string} vpnIp - 생성 시 VPN IP (재사용 조건용)
   */
  async createPersona(vpnIp, options = {}) {
    if (!this.pool) await this.connect();

    const id = crypto.randomUUID();
    const userType = options.userType || weightedRandom(USER_TYPES);
    const ageGroup = options.ageGroup || weightedRandom(AGE_GROUPS);
    const gender = options.gender || weightedRandom(GENDERS);
    const code = generateCode(userType, ageGroup, gender);

    // 디바이스는 현재 s23plus-real 고정
    const deviceType = 's23plus-real';

    await this.pool.execute(`
      INSERT INTO personas (id, code, user_type, age_group, gender, device_type, created_ip, last_ip, fingerprint)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, code, userType, ageGroup, gender, deviceType,
      vpnIp, vpnIp,
      options.fingerprint ? JSON.stringify(options.fingerprint) : null
    ]);

    console.log(`[PersonaDB] 새 페르소나 생성: ${code} (${id.substring(0, 8)}...) IP: ${vpnIp}`);

    return {
      id,
      code,
      userType,
      ageGroup,
      gender,
      deviceType,
      createdIp: vpnIp,
      status: 'new',
      isNew: true,
      labels: {
        userType: USER_TYPES[userType].label,
        ageGroup: AGE_GROUPS[ageGroup].label,
        gender: GENDERS[gender].label
      }
    };
  }

  // ============ 재사용 가능한 페르소나 조회 ============

  /**
   * 현재 IP에서 재사용 가능한 페르소나 조회
   *
   * 조건:
   * 1. 동일 IP (created_ip 또는 last_ip)
   * 2. 1시간 이상 경과 (쿨다운)
   * 3. status가 active
   * 4. data_backup이 있음
   * 5. 일일 세션 한도 미달
   * 6. 총 세션 한도 미달
   * 7. 수명 14일 이내
   * 8. 차단 비율 30% 미만
   *
   * @param {string} vpnIp - 현재 VPN IP
   * @param {number} limit - 최대 개수
   * @returns {Array} 재사용 가능한 페르소나 목록
   */
  async getReusablePersonas(vpnIp, limit = 10) {
    if (!this.pool) await this.connect();

    const cooldownTime = new Date(Date.now() - COOLDOWN_MS);
    const maxAgeDate = new Date(Date.now() - PERSONA_RULES.MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

    // 일일 세션 체크를 위한 오늘 시작 시간 (KST 기준)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [rows] = await this.pool.execute(`
      SELECT p.*,
        (SELECT COUNT(*) FROM logs l
         WHERE l.persona_id = p.id
         AND l.created_at >= ?) as today_sessions
      FROM personas p
      WHERE p.status = 'active'
        AND p.data_backup IS NOT NULL
        AND (p.created_ip = ? OR p.last_ip = ?)
        AND p.last_used_at <= ?
        AND p.session_count < ?
        AND p.created_at >= ?
        AND (p.blocked_count = 0 OR p.blocked_count / GREATEST(p.session_count, 1) < ?)
      HAVING today_sessions < ?
      ORDER BY p.last_used_at ASC
      LIMIT ?
    `, [
      todayStart,
      vpnIp, vpnIp,
      cooldownTime,
      PERSONA_RULES.MAX_TOTAL_SESSIONS,
      maxAgeDate,
      PERSONA_RULES.MAX_BLOCK_RATIO,
      PERSONA_RULES.MAX_DAILY_SESSIONS,
      limit
    ]);

    if (rows.length > 0) {
      console.log(`[PersonaDB] 재사용 가능: ${rows.length}개 (IP: ${vpnIp})`);
    }

    return rows.map(r => this._parseRow(r));
  }

  /**
   * 페르소나 상태 체크 (사용 가능 여부)
   * @param {string} personaId - 페르소나 ID
   * @returns {Object} { canUse, reason, stats }
   */
  async checkPersonaStatus(personaId) {
    if (!this.pool) await this.connect();

    const [rows] = await this.pool.execute(`
      SELECT p.*,
        DATEDIFF(NOW(), p.created_at) as age_days,
        (SELECT COUNT(*) FROM logs l
         WHERE l.persona_id = p.id
         AND l.created_at >= DATE(NOW())) as today_sessions
      FROM personas p
      WHERE p.id = ?
    `, [personaId]);

    if (rows.length === 0) {
      return { canUse: false, reason: 'NOT_FOUND' };
    }

    const p = rows[0];
    const stats = {
      totalSessions: p.session_count,
      todaySessions: p.today_sessions,
      ageDays: p.age_days,
      blockedCount: p.blocked_count,
      blockRatio: p.session_count > 0 ? p.blocked_count / p.session_count : 0
    };

    // 상태 체크
    if (p.status === 'blocked') {
      return { canUse: false, reason: 'BLOCKED', stats };
    }

    if (p.status === 'expired') {
      return { canUse: false, reason: 'EXPIRED', stats };
    }

    // 총 세션 한도
    if (p.session_count >= PERSONA_RULES.MAX_TOTAL_SESSIONS) {
      await this._expirePersona(personaId, 'MAX_SESSIONS');
      return { canUse: false, reason: 'MAX_SESSIONS_REACHED', stats };
    }

    // 일일 세션 한도
    if (p.today_sessions >= PERSONA_RULES.MAX_DAILY_SESSIONS) {
      return { canUse: false, reason: 'DAILY_LIMIT_REACHED', stats };
    }

    // 수명 체크
    if (p.age_days > PERSONA_RULES.MAX_AGE_DAYS) {
      await this._expirePersona(personaId, 'MAX_AGE');
      return { canUse: false, reason: 'TOO_OLD', stats };
    }

    // 차단 비율 체크
    if (p.session_count >= 5 && stats.blockRatio >= PERSONA_RULES.MAX_BLOCK_RATIO) {
      await this._expirePersona(personaId, 'HIGH_BLOCK_RATE');
      return { canUse: false, reason: 'HIGH_BLOCK_RATE', stats };
    }

    // 쿨다운 체크
    if (p.last_used_at) {
      const timeSinceLastUse = Date.now() - new Date(p.last_used_at).getTime();
      if (timeSinceLastUse < COOLDOWN_MS) {
        const remainingMs = COOLDOWN_MS - timeSinceLastUse;
        return {
          canUse: false,
          reason: 'COOLDOWN',
          remainingMinutes: Math.ceil(remainingMs / 60000),
          stats
        };
      }
    }

    return { canUse: true, reason: 'OK', stats };
  }

  /**
   * 페르소나 만료 처리
   */
  async _expirePersona(personaId, reason) {
    await this.pool.execute(`
      UPDATE personas
      SET status = 'expired'
      WHERE id = ?
    `, [personaId]);

    console.log(`[PersonaDB] 페르소나 만료: ${personaId.substring(0, 8)}... (사유: ${reason})`);
  }

  /**
   * 만료된 페르소나 정리 (배치 작업용)
   * @returns {number} 만료된 페르소나 수
   */
  async cleanupExpiredPersonas() {
    if (!this.pool) await this.connect();

    const maxAgeDate = new Date(Date.now() - PERSONA_RULES.MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

    // 수명 초과
    const [ageResult] = await this.pool.execute(`
      UPDATE personas
      SET status = 'expired'
      WHERE status = 'active'
        AND created_at < ?
    `, [maxAgeDate]);

    // 총 세션 초과
    const [sessionResult] = await this.pool.execute(`
      UPDATE personas
      SET status = 'expired'
      WHERE status = 'active'
        AND session_count >= ?
    `, [PERSONA_RULES.MAX_TOTAL_SESSIONS]);

    // 높은 차단 비율
    const [blockResult] = await this.pool.execute(`
      UPDATE personas
      SET status = 'expired'
      WHERE status = 'active'
        AND session_count >= 5
        AND blocked_count / session_count >= ?
    `, [PERSONA_RULES.MAX_BLOCK_RATIO]);

    const totalExpired = ageResult.affectedRows + sessionResult.affectedRows + blockResult.affectedRows;

    if (totalExpired > 0) {
      console.log(`[PersonaDB] 페르소나 정리: ${totalExpired}개 만료 (수명: ${ageResult.affectedRows}, 세션: ${sessionResult.affectedRows}, 차단: ${blockResult.affectedRows})`);
    }

    return totalExpired;
  }

  /**
   * 재사용 가능한 페르소나 1개 선택 (선착순)
   */
  async selectReusable(vpnIp) {
    const personas = await this.getReusablePersonas(vpnIp, 1);
    return personas.length > 0 ? personas[0] : null;
  }

  /**
   * Row 파싱
   */
  _parseRow(row) {
    return {
      id: row.id,
      code: row.code,
      userType: row.user_type,
      ageGroup: row.age_group,
      gender: row.gender,
      deviceType: row.device_type,
      fingerprint: row.fingerprint ? (typeof row.fingerprint === 'string' ? JSON.parse(row.fingerprint) : row.fingerprint) : null,
      dataBackup: row.data_backup,
      storageState: row.storage_state ? (typeof row.storage_state === 'string' ? JSON.parse(row.storage_state) : row.storage_state) : null,
      createdIp: row.created_ip,
      lastIp: row.last_ip,
      status: row.status,
      sessionCount: row.session_count,
      successCount: row.success_count,
      blockedCount: row.blocked_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastUsedAt: row.last_used_at,
      isNew: false,
      labels: {
        userType: USER_TYPES[row.user_type]?.label,
        ageGroup: AGE_GROUPS[row.age_group]?.label,
        gender: GENDERS[row.gender]?.label
      }
    };
  }

  // ============ 세션 업데이트 ============

  /**
   * 세션 완료 후 저장
   */
  async updateAfterSession(id, data) {
    if (!this.pool) await this.connect();

    const success = data.result === '성공';
    const blocked = data.result === '봇탐지';

    await this.pool.execute(`
      UPDATE personas SET
        data_backup = COALESCE(?, data_backup),
        storage_state = COALESCE(?, storage_state),
        last_ip = COALESCE(?, last_ip),
        status = CASE
          WHEN ? = TRUE THEN 'blocked'
          WHEN status = 'new' THEN 'active'
          ELSE status
        END,
        session_count = session_count + 1,
        success_count = success_count + ?,
        blocked_count = blocked_count + ?,
        last_used_at = NOW()
      WHERE id = ?
    `, [
      data.dataBackup || null,
      data.storageState ? JSON.stringify(data.storageState) : null,
      data.vpnIp || null,
      blocked,
      success ? 1 : 0,
      blocked ? 1 : 0,
      id
    ]);

    // 로그 기록
    if (data.result) {
      await this.pool.execute(`
        INSERT INTO logs (persona_id, session_id, vpn_ip, search_keyword, result, error_message, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        data.sessionId || null,
        data.vpnIp || null,
        data.searchKeyword || null,
        data.result,
        data.errorMessage || null,
        data.durationMs || null
      ]);
    }
  }

  // ============ 통계 ============

  /**
   * 전체 통계
   */
  async getStats() {
    if (!this.pool) await this.connect();

    const [totals] = await this.pool.execute(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_count,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
        SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked_count,
        SUM(session_count) as total_sessions,
        SUM(success_count) as total_success
      FROM personas
    `);

    const [recentLogs] = await this.pool.execute(`
      SELECT result, COUNT(*) as cnt
      FROM logs
      WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY result
    `);

    return { totals: totals[0], recentLogs };
  }

  /**
   * IP별 페르소나 현황
   */
  async getStatsByIp(vpnIp) {
    if (!this.pool) await this.connect();

    const cooldownTime = new Date(Date.now() - COOLDOWN_MS);

    const [rows] = await this.pool.execute(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' AND data_backup IS NOT NULL AND last_used_at <= ? THEN 1 ELSE 0 END) as reusable,
        SUM(CASE WHEN status = 'active' AND last_used_at > ? THEN 1 ELSE 0 END) as cooling,
        SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked
      FROM personas
      WHERE created_ip = ? OR last_ip = ?
    `, [cooldownTime, cooldownTime, vpnIp, vpnIp]);

    return rows[0];
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.initialized = false;
      console.log('[PersonaDB] 연결 종료');
    }
  }

  // ============ 호환성 메서드 (run-multi.js 지원) ============

  /**
   * 프로필 데이터 저장 (호환용)
   */
  async saveProfileData(data) {
    if (!this.pool) await this.connect();

    let personaId = data.personaId;

    if (!personaId) {
      // 새 페르소나 생성
      const persona = await this.createPersona(data.vpnIp, {
        fingerprint: data.fingerprint
      });
      personaId = persona.id;
    }

    // 세션 완료 후 업데이트
    await this.updateAfterSession(personaId, {
      result: data.result || '성공',
      dataBackup: data.fileBackup ? JSON.stringify(data.fileBackup) : null,
      storageState: data.cookies ? { cookies: data.cookies, origins: data.origins || [] } : null,
      vpnIp: data.vpnIp,
      searchKeyword: data.search
    });

    return personaId;
  }

  /**
   * 세션 로그 저장 (호환용)
   */
  async logSession(data) {
    if (!this.pool) await this.connect();

    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    if (data.profileDataList && data.profileDataList.length > 0) {
      for (const p of data.profileDataList) {
        await this.pool.execute(`
          INSERT INTO logs (persona_id, session_id, vpn_ip, search_keyword, result, error_message)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          p.personaId || null,
          sessionId,
          data.vpnIp || null,
          data.search || '아이간식 달빛기정떡',
          p.result || '성공',
          p.error || null
        ]);
      }
    }

    return sessionId;
  }

  /**
   * 슬롯 기반 프로필 데이터 로드 (호환용)
   * 재사용 가능한 페르소나 반환
   */
  async loadProfileData(_threadId, _chromeVersion) {
    // 이 함수는 VPN IP 없이는 재사용 판단 불가
    // run-multi.js에서 vpnIp와 함께 getReusablePersonas() 직접 호출 권장
    return null;
  }

  /**
   * 선택 초기화 (호환용)
   */
  resetSelectedPersonas() {
    // 새 시스템에서는 IP 기반이므로 필요 없음
  }
}

// 싱글톤
const personaDB = new PersonaDB();

export { PersonaDB, DB_CONFIG, COOLDOWN_MS, PERSONA_RULES };
export default personaDB;
