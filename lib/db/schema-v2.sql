-- =====================================================
-- naver_persona Database Schema v2
-- 중앙 집중형 멀티PC 아키텍처
-- =====================================================

-- 기존 테이블 백업 (마이그레이션 시)
-- RENAME TABLE personas TO personas_v1_backup;
-- RENAME TABLE profile_data TO profile_data_v1_backup;

-- =====================================================
-- 1. 페르소나 마스터 테이블
-- 핑거프린트 + 메타데이터 (PC 독립)
-- =====================================================
CREATE TABLE IF NOT EXISTS personas_v2 (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100),

  -- 기반 프로필
  base_profile VARCHAR(30) DEFAULT 'galaxy-s23',
  chrome_version VARCHAR(50) NOT NULL,  -- 고정 Chrome 버전

  -- 핑거프린트 (전체 JSON)
  fingerprint JSON NOT NULL,

  -- 핑거프린트 주요 필드 (인덱싱/쿼리용)
  hardware_concurrency TINYINT,
  device_memory TINYINT,
  screen_width SMALLINT,
  screen_height SMALLINT,
  webgl_renderer VARCHAR(200),
  canvas_noise DECIMAL(20, 18),
  audio_noise DECIMAL(20, 18),
  unique_seed VARCHAR(64),

  -- 상태
  status ENUM('숙성중', '활성', '휴면', '차단됨', '폐기') DEFAULT '숙성중',
  aging_level TINYINT DEFAULT 0,  -- 0~10 (숙성 단계)
  aging_score INT DEFAULT 0,      -- 세부 점수

  -- 통계
  total_uses INT DEFAULT 0,
  success_count INT DEFAULT 0,
  blocked_count INT DEFAULT 0,
  last_result ENUM('성공', '봇탐지', 'IP불일치', '에러') NULL,

  -- 타임스탬프
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP NULL,

  INDEX idx_status (status),
  INDEX idx_base_profile (base_profile),
  INDEX idx_aging_level (aging_level),
  INDEX idx_last_used (last_used_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- 2. 페르소나 상태 테이블 (핵심!)
-- 쿠키, 스토리지, 히스토리 - PC간 이식 가능
-- =====================================================
CREATE TABLE IF NOT EXISTS persona_state (
  persona_id VARCHAR(50) PRIMARY KEY,

  -- Playwright storageState (cookies + origins/localStorage)
  -- context.storageState() 결과를 그대로 저장
  storage_state LONGTEXT,

  -- 방문 히스토리 (JSON 배열)
  visit_history JSON,

  -- 숙성 활동 기록
  search_keywords JSON,     -- 검색한 키워드 목록
  visited_shops JSON,       -- 방문한 쇼핑몰/플레이스

  -- 마지막 세션 정보
  last_vpn_ip VARCHAR(45),
  last_pc_id VARCHAR(50),
  last_session_at TIMESTAMP NULL,

  -- 메타데이터
  state_version INT DEFAULT 1,  -- 상태 버전 (충돌 방지)
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (persona_id) REFERENCES personas_v2(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- 3. 실행 로그 테이블
-- 모든 실행 기록 (PC, VPN, 결과 추적)
-- =====================================================
CREATE TABLE IF NOT EXISTS execution_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,

  -- 페르소나
  persona_id VARCHAR(50) NOT NULL,

  -- 실행 환경
  pc_id VARCHAR(50),          -- PC 식별자 (hostname 등)
  vpn_ip VARCHAR(45),
  vpn_agent VARCHAR(20),
  chrome_version VARCHAR(50),

  -- 실행 정보
  action VARCHAR(50),         -- 'aging', 'search', 'visit', 'check'
  target_url TEXT,            -- 대상 URL
  search_keyword VARCHAR(255),

  -- 결과
  result ENUM('성공', '봇탐지', 'IP불일치', '에러', '타임아웃') NOT NULL,
  duration_ms INT,
  error_message TEXT,

  -- 스냅샷 (선택)
  cookies_snapshot JSON,      -- 실행 후 쿠키 상태

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_persona (persona_id),
  INDEX idx_pc (pc_id),
  INDEX idx_vpn (vpn_ip),
  INDEX idx_result (result),
  INDEX idx_action (action),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- 4. PC 등록 테이블
-- 작업 PC 관리
-- =====================================================
CREATE TABLE IF NOT EXISTS worker_pcs (
  pc_id VARCHAR(50) PRIMARY KEY,
  hostname VARCHAR(100),
  ip_address VARCHAR(45),

  -- 스펙
  os_version VARCHAR(100),
  chrome_version VARCHAR(50),
  vpn_count TINYINT DEFAULT 0,  -- 연결된 VPN 동글 수

  -- 상태
  status ENUM('온라인', '오프라인', '점검중') DEFAULT '오프라인',
  current_load TINYINT DEFAULT 0,  -- 현재 실행 중인 브라우저 수
  max_load TINYINT DEFAULT 10,     -- 최대 동시 실행 수

  -- 통계
  total_executions INT DEFAULT 0,
  last_heartbeat TIMESTAMP NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- 5. VPN 풀 테이블
-- 전체 VPN 관리
-- =====================================================
CREATE TABLE IF NOT EXISTS vpn_pool (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agent_id VARCHAR(20) NOT NULL,  -- dongle-1, dongle-2, ...

  -- 연결 정보
  vpn_ip VARCHAR(45),

  -- 상태
  status ENUM('사용가능', '사용중', '오류', '점검중') DEFAULT '사용가능',
  assigned_pc VARCHAR(50),
  assigned_persona VARCHAR(50),

  -- 통계
  total_uses INT DEFAULT 0,
  blocked_count INT DEFAULT 0,  -- 이 IP로 차단된 횟수

  last_used_at TIMESTAMP NULL,

  INDEX idx_status (status),
  INDEX idx_agent (agent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- 6. 숙성 큐 테이블
-- 작업 할당 및 스케줄링
-- =====================================================
CREATE TABLE IF NOT EXISTS aging_queue (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,

  persona_id VARCHAR(50) NOT NULL,

  -- 스케줄
  priority TINYINT DEFAULT 5,     -- 1(높음) ~ 10(낮음)
  scheduled_at TIMESTAMP NULL,    -- 예약 시간

  -- 할당
  assigned_pc VARCHAR(50),
  assigned_vpn INT,               -- vpn_pool.id

  -- 상태
  status ENUM('대기', '진행중', '완료', '실패', '취소') DEFAULT '대기',
  attempts TINYINT DEFAULT 0,
  max_attempts TINYINT DEFAULT 3,

  -- 결과
  result_log_id BIGINT,           -- execution_logs.id

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,

  INDEX idx_status (status),
  INDEX idx_priority (priority),
  INDEX idx_scheduled (scheduled_at),
  INDEX idx_persona (persona_id),

  FOREIGN KEY (persona_id) REFERENCES personas_v2(id),
  FOREIGN KEY (assigned_pc) REFERENCES worker_pcs(pc_id),
  FOREIGN KEY (assigned_vpn) REFERENCES vpn_pool(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- VIEWS
-- =====================================================

-- 일별 통계
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
ORDER BY date DESC;

-- 페르소나 상태 요약
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
ORDER BY p.last_used_at DESC;

-- PC 상태 요약
CREATE OR REPLACE VIEW pc_status AS
SELECT
  w.pc_id,
  w.hostname,
  w.status,
  w.current_load,
  w.max_load,
  w.vpn_count,
  COUNT(DISTINCT aq.id) as queued_tasks,
  w.last_heartbeat
FROM worker_pcs w
LEFT JOIN aging_queue aq ON w.pc_id = aq.assigned_pc AND aq.status = '진행중'
GROUP BY w.pc_id;
