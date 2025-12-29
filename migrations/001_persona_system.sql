-- =============================================================================
-- Migration: 001_persona_system.sql
-- Description: AI 기반 페르소나 시스템 테이블 생성
-- Created: 2025-12-29
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. IP 그룹 테이블
-- KT 모바일 IP 풀 관리 (1 IP : N personas)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ip_groups (
    ip_address VARCHAR(15) PRIMARY KEY,
    first_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total_personas INT DEFAULT 0,
    total_sessions INT DEFAULT 0,
    blocked_count INT DEFAULT 0,
    status ENUM('active', 'blocked', 'retired') DEFAULT 'active',

    INDEX idx_status (status),
    INDEX idx_last_seen (last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 2. 페르소나 마스터 테이블
-- 코드 기반 식별: DW3M-001 (Daytime/Worker/30s/Male/001)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS personas (
    id VARCHAR(36) PRIMARY KEY,                    -- UUID
    code VARCHAR(20) NOT NULL UNIQUE,              -- 'DW3M-001'
    ip_address VARCHAR(15),                        -- 매핑된 IP

    -- 코드 분해 (인덱싱용)
    time_slot CHAR(1) NOT NULL,                    -- M/D/E/N/L
    user_type CHAR(1) NOT NULL,                    -- W/S/H/F/R
    age_group CHAR(1) NOT NULL,                    -- 2/3/4/5
    gender CHAR(1) NOT NULL,                       -- M/F
    sequence INT NOT NULL,                         -- 순번

    -- 디바이스 정보
    device_code VARCHAR(10) NOT NULL,              -- 'GS23P', 'IP14PM' 등
    device_profile JSON NOT NULL,                  -- 전체 핑거프린트

    -- 행동 파라미터
    behavior_profile JSON NOT NULL,                -- 스크롤속도, 체류시간 등

    -- AI 생성 데이터
    ai_generated_at DATETIME,                      -- AI 생성 시점
    ai_model VARCHAR(50),                          -- 사용된 AI 모델

    -- 상태
    status ENUM('new', 'learning', 'ready', 'active', 'suspended') DEFAULT 'new',
    learning_progress INT DEFAULT 0,               -- 0~100%

    -- 통계
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used DATETIME,
    session_count INT DEFAULT 0,
    success_count INT DEFAULT 0,
    blocked_count INT DEFAULT 0,

    INDEX idx_ip (ip_address),
    INDEX idx_time_slot (time_slot),
    INDEX idx_status (status),
    INDEX idx_code (code),
    INDEX idx_age_gender (age_group, gender),
    FOREIGN KEY (ip_address) REFERENCES ip_groups(ip_address) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 3. 페르소나 관심사 테이블
-- AI가 생성/확장하는 관심사
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS persona_interests (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    persona_id VARCHAR(36) NOT NULL,

    -- 관심사 정보
    category VARCHAR(50) NOT NULL,                 -- '전자기기', '패션' 등
    subcategory VARCHAR(100),                      -- '게이밍 마우스', '겨울 코트' 등
    interest_level DECIMAL(3,2) DEFAULT 0.50,      -- 0.00~1.00 (관심도)

    -- AI 생성 정보
    source ENUM('initial', 'ai_generated', 'learned') DEFAULT 'initial',
    ai_reason TEXT,                                -- AI가 이 관심사를 추가한 이유

    -- 학습 데이터
    search_count INT DEFAULT 0,                    -- 관련 검색 횟수
    click_count INT DEFAULT 0,                     -- 관련 클릭 횟수
    total_dwell_time INT DEFAULT 0,                -- 총 체류시간 (초)

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_persona (persona_id),
    INDEX idx_category (category),
    INDEX idx_level (interest_level),
    FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 4. 검색어 풀 테이블
-- AI가 생성/확장하는 검색어
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS persona_search_keywords (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    persona_id VARCHAR(36) NOT NULL,
    interest_id BIGINT,                            -- 연관 관심사

    -- 검색어 정보
    keyword VARCHAR(200) NOT NULL,
    keyword_type ENUM(
        'problem',      -- 문제 인식 ("마우스 손목 통증")
        'info',         -- 정보 탐색 ("무선 마우스 추천")
        'comparison',   -- 비교 검토 ("로지텍 vs 레이저")
        'purchase',     -- 구매 결정 ("로지텍 MX Master")
        'general'       -- 일반 관심사
    ) DEFAULT 'general',

    -- AI 생성 정보
    source ENUM('initial', 'ai_generated', 'learned') DEFAULT 'initial',
    ai_context TEXT,                               -- 검색어 생성 맥락

    -- 사용 통계
    used_count INT DEFAULT 0,
    last_used DATETIME,
    success_rate DECIMAL(3,2) DEFAULT 0.00,        -- 차단 없이 성공한 비율

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_persona (persona_id),
    INDEX idx_type (keyword_type),
    INDEX idx_interest (interest_id),
    INDEX idx_used (used_count),
    FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE CASCADE,
    FOREIGN KEY (interest_id) REFERENCES persona_interests(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 5. 타겟 상품 테이블
-- 클라이언트가 원하는 최종 목표 상품
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS target_products (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,

    -- 상품 정보
    product_name VARCHAR(200) NOT NULL,
    product_category VARCHAR(50) NOT NULL,
    product_url VARCHAR(500),
    product_keywords JSON,                         -- 검색에 사용할 키워드들

    -- 클라이언트 정보
    client_id VARCHAR(50),                         -- 의뢰 클라이언트
    priority INT DEFAULT 5,                        -- 1~10 (높을수록 우선)

    -- 타겟팅 조건
    target_persona_types JSON,                     -- ["W3M", "W3F"] 등
    target_age_groups JSON,                        -- ["3", "4"] 등
    target_time_slots JSON,                        -- ["D", "E"] 등

    -- 상태
    status ENUM('pending', 'active', 'completed', 'paused') DEFAULT 'pending',
    daily_target INT DEFAULT 100,                  -- 일일 목표 클릭수
    daily_achieved INT DEFAULT 0,
    total_clicks INT DEFAULT 0,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    start_date DATE,
    end_date DATE,

    INDEX idx_status (status),
    INDEX idx_category (product_category),
    INDEX idx_priority (priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 6. 클릭 시나리오 테이블 (핵심!)
-- 타겟 상품 클릭 전후 패턴
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS click_scenarios (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    target_product_id BIGINT NOT NULL,

    -- 시나리오 이름
    scenario_name VARCHAR(100) NOT NULL,
    scenario_type ENUM(
        'direct',       -- 직접 검색형
        'compare',      -- 비교 쇼핑형
        'blog',         -- 블로그 경유형
        'revisit'       -- 재방문형
    ) DEFAULT 'direct',

    -- 클릭 전 행동 (JSON 배열)
    pre_click_actions JSON NOT NULL,
    /*
    [
        {"type": "search", "keyword": "무선 마우스", "dwell": [30, 60]},
        {"type": "view_product", "position": "random_top10", "dwell": [10, 20]},
        {"type": "scroll", "amount": "50%", "speed": "medium"}
    ]
    */

    -- 타겟 클릭 행동
    target_click_action JSON NOT NULL,
    /*
    {
        "dwell": [120, 300],           // 긴 체류 (2~5분)
        "scroll": "full",               // 끝까지 스크롤
        "view_reviews": true,           // 리뷰 확인
        "view_details": true,           // 상세 스펙 확인
        "add_to_wishlist": 0.3          // 30% 확률로 찜하기
    }
    */

    -- 클릭 후 행동 (JSON 배열)
    post_click_actions JSON NOT NULL,
    /*
    [
        {"type": "back_to_list", "dwell": [5, 10]},
        {"type": "view_product", "position": "random", "dwell": [10, 20]},
        {"type": "exit_or_continue", "exit_prob": 0.4}
    ]
    */

    -- 가중치 (시나리오 선택 확률)
    weight INT DEFAULT 10,

    -- 통계
    used_count INT DEFAULT 0,
    success_count INT DEFAULT 0,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_product (target_product_id),
    INDEX idx_type (scenario_type),
    INDEX idx_weight (weight),
    FOREIGN KEY (target_product_id) REFERENCES target_products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 7. 체류 시간 설정 테이블
-- 컨텍스트별 기본 체류 시간 및 연령대별 보정
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dwell_time_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,

    context ENUM(
        'target_product',      -- 타겟 상품
        'comparison_product',  -- 비교 상품
        'search_result',       -- 검색 결과
        'blog_post',           -- 블로그 글
        'review_page'          -- 리뷰 페이지
    ) NOT NULL UNIQUE,

    -- 체류 시간 (초)
    min_dwell INT NOT NULL,
    max_dwell INT NOT NULL,
    avg_dwell INT NOT NULL,

    -- 스크롤 깊이 (%)
    min_scroll INT DEFAULT 0,
    max_scroll INT DEFAULT 100,

    -- 연령대별 보정 (JSON)
    age_multiplier JSON
    /*
    {
        "2": 0.7,   // 20대: 빠름 (70%)
        "3": 1.0,   // 30대: 기준
        "4": 1.2,   // 40대: 느림 (120%)
        "5": 1.5    // 50대+: 매우 느림 (150%)
    }
    */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 기본 체류 시간 데이터 삽입
INSERT INTO dwell_time_configs (context, min_dwell, max_dwell, avg_dwell, min_scroll, max_scroll, age_multiplier) VALUES
('target_product', 120, 300, 180, 80, 100, '{"2":0.7,"3":1.0,"4":1.2,"5":1.5}'),
('comparison_product', 10, 30, 20, 20, 50, '{"2":0.6,"3":1.0,"4":1.3,"5":1.6}'),
('search_result', 30, 60, 45, 30, 70, '{"2":0.7,"3":1.0,"4":1.2,"5":1.4}'),
('blog_post', 60, 180, 120, 50, 90, '{"2":0.8,"3":1.0,"4":1.1,"5":1.3}'),
('review_page', 30, 90, 60, 40, 80, '{"2":0.7,"3":1.0,"4":1.2,"5":1.5}')
ON DUPLICATE KEY UPDATE
    min_dwell = VALUES(min_dwell),
    max_dwell = VALUES(max_dwell),
    avg_dwell = VALUES(avg_dwell);

-- -----------------------------------------------------------------------------
-- 8. 세션 로그 테이블
-- 세션별 전체 기록
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS session_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,               -- 세션 UUID
    persona_id VARCHAR(36) NOT NULL,
    ip_address VARCHAR(15) NOT NULL,

    -- 세션 정보
    started_at DATETIME NOT NULL,
    ended_at DATETIME,
    duration_sec INT,

    -- 타겟 상품 정보 (있는 경우)
    target_product_id BIGINT,
    scenario_id BIGINT,
    target_clicked BOOLEAN DEFAULT FALSE,
    target_dwell_time INT,                         -- 타겟 상품 체류시간

    -- 세션 통계
    total_pages INT DEFAULT 0,
    total_searches INT DEFAULT 0,
    total_clicks INT DEFAULT 0,

    -- 결과
    result ENUM('success', 'blocked', 'timeout', 'error') DEFAULT 'success',
    error_message TEXT,

    INDEX idx_persona (persona_id),
    INDEX idx_session (session_id),
    INDEX idx_target (target_product_id),
    INDEX idx_started (started_at),
    INDEX idx_result (result),
    FOREIGN KEY (persona_id) REFERENCES personas(id),
    FOREIGN KEY (target_product_id) REFERENCES target_products(id) ON DELETE SET NULL,
    FOREIGN KEY (scenario_id) REFERENCES click_scenarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 9. 클릭 상세 로그 테이블
-- 개별 클릭/뷰 로그
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS click_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,

    -- 행동 정보
    action_type ENUM('search', 'view_product', 'scroll', 'click', 'back', 'exit'),
    action_order INT NOT NULL,                     -- 세션 내 순서

    -- 상세 정보
    url VARCHAR(500),
    search_keyword VARCHAR(200),
    product_position INT,                          -- 검색 결과 내 위치

    -- 타겟 여부
    is_target BOOLEAN DEFAULT FALSE,

    -- 체류 시간
    dwell_time_sec INT,
    scroll_depth DECIMAL(3,2),                     -- 0.00~1.00

    -- 타임스탬프
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_session (session_id),
    INDEX idx_is_target (is_target),
    INDEX idx_timestamp (timestamp),
    INDEX idx_action (action_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 10. AI 학습 큐 테이블
-- AI에게 요청할 작업 큐
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_learning_queue (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,

    -- 요청 정보
    task_type ENUM(
        'generate_interests',      -- 관심사 생성
        'expand_keywords',         -- 검색어 확장
        'generate_scenario',       -- 시나리오 생성
        'analyze_failure',         -- 실패 분석
        'optimize_pattern'         -- 패턴 최적화
    ) NOT NULL,

    -- 대상
    persona_id VARCHAR(36),
    target_product_id BIGINT,

    -- 입력 데이터
    input_data JSON NOT NULL,

    -- 출력 (AI 처리 후)
    output_data JSON,

    -- 상태
    status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
    priority INT DEFAULT 5,                        -- 1~10 (낮을수록 우선)

    -- 에러 정보
    error_message TEXT,
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,

    INDEX idx_status_priority (status, priority),
    INDEX idx_persona (persona_id),
    INDEX idx_type (task_type),
    FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE CASCADE,
    FOREIGN KEY (target_product_id) REFERENCES target_products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 11. Views
-- -----------------------------------------------------------------------------

-- 현재 시간대 매핑 함수
DELIMITER //
CREATE FUNCTION IF NOT EXISTS get_current_time_slot() RETURNS CHAR(1)
DETERMINISTIC
BEGIN
    DECLARE current_hour INT;
    SET current_hour = HOUR(NOW());

    RETURN CASE
        WHEN current_hour BETWEEN 6 AND 9 THEN 'M'    -- Morning (06-09)
        WHEN current_hour BETWEEN 10 AND 17 THEN 'D'  -- Daytime (10-17)
        WHEN current_hour BETWEEN 18 AND 21 THEN 'E'  -- Evening (18-21)
        WHEN current_hour BETWEEN 22 AND 23 THEN 'N'  -- Night (22-23)
        ELSE 'L'                                       -- Latenight (00-05)
    END;
END //
DELIMITER ;

-- 페르소나 요약 뷰
CREATE OR REPLACE VIEW persona_summary_v3 AS
SELECT
    p.id,
    p.code,
    p.status,
    p.time_slot,
    p.user_type,
    p.age_group,
    p.gender,
    p.device_code,
    p.session_count,
    p.success_count,
    p.blocked_count,
    ROUND(p.success_count * 100.0 / NULLIF(p.session_count, 0), 1) as success_rate,
    p.learning_progress,
    p.last_used,
    p.created_at,
    (SELECT COUNT(*) FROM persona_interests WHERE persona_id = p.id) as interest_count,
    (SELECT COUNT(*) FROM persona_search_keywords WHERE persona_id = p.id) as keyword_count
FROM personas p;

-- 타겟 상품 진행률 뷰
CREATE OR REPLACE VIEW target_product_progress AS
SELECT
    tp.id,
    tp.product_name,
    tp.product_category,
    tp.status,
    tp.daily_target,
    tp.daily_achieved,
    tp.total_clicks,
    ROUND(tp.daily_achieved * 100.0 / NULLIF(tp.daily_target, 0), 1) as daily_progress,
    tp.start_date,
    tp.end_date,
    (SELECT COUNT(DISTINCT scenario_id) FROM session_logs WHERE target_product_id = tp.id AND target_clicked = TRUE) as scenarios_used,
    (SELECT AVG(target_dwell_time) FROM session_logs WHERE target_product_id = tp.id AND target_clicked = TRUE) as avg_dwell_time
FROM target_products tp;

-- AI 큐 상태 뷰
CREATE OR REPLACE VIEW ai_queue_status AS
SELECT
    task_type,
    status,
    COUNT(*) as count,
    MIN(created_at) as oldest,
    MAX(created_at) as newest
FROM ai_learning_queue
GROUP BY task_type, status;

-- 일별 통계 뷰
CREATE OR REPLACE VIEW daily_session_stats AS
SELECT
    DATE(started_at) as date,
    COUNT(*) as total_sessions,
    COUNT(DISTINCT persona_id) as unique_personas,
    SUM(CASE WHEN result = 'success' THEN 1 ELSE 0 END) as success_count,
    SUM(CASE WHEN result = 'blocked' THEN 1 ELSE 0 END) as blocked_count,
    SUM(CASE WHEN target_clicked = TRUE THEN 1 ELSE 0 END) as target_clicks,
    AVG(duration_sec) as avg_duration,
    AVG(CASE WHEN target_clicked THEN target_dwell_time END) as avg_target_dwell
FROM session_logs
GROUP BY DATE(started_at);

-- =============================================================================
-- End of Migration
-- =============================================================================
