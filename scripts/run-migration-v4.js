/**
 * 마이그레이션 실행 스크립트 (v4)
 *
 * 새로운 AI 기반 페르소나 시스템 테이블 생성
 * 기존 테이블과 충돌 방지를 위해 _v4 접미사 사용
 */

import mysql from 'mysql2/promise';
import { DB_CONFIG } from '../lib/db/Database.js';

// 테이블 이름
const T = {
  ip_groups: 'ip_groups_v4',
  personas: 'personas_v4',
  persona_interests: 'persona_interests_v4',
  persona_search_keywords: 'persona_search_keywords_v4',
  target_products: 'target_products_v4',
  click_scenarios: 'click_scenarios_v4',
  dwell_time_configs: 'dwell_time_configs_v4',
  session_logs: 'session_logs_v4',
  click_logs: 'click_logs_v4',
  ai_learning_queue: 'ai_learning_queue_v4'
};

async function runMigration() {
  console.log('╔' + '═'.repeat(60) + '╗');
  console.log('║' + '  페르소나 시스템 v4 마이그레이션  '.padStart(40).padEnd(60) + '║');
  console.log('╚' + '═'.repeat(60) + '╝\n');

  const pool = mysql.createPool(DB_CONFIG);

  try {
    const conn = await pool.getConnection();
    console.log('✅ DB 연결 성공\n');

    // 1. ip_groups 테이블
    console.log(`[1/10] ${T.ip_groups} 테이블 생성...`);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ${T.ip_groups} (
        ip_address VARCHAR(15) PRIMARY KEY,
        first_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        total_personas INT DEFAULT 0,
        total_sessions INT DEFAULT 0,
        blocked_count INT DEFAULT 0,
        status ENUM('active', 'blocked', 'retired') DEFAULT 'active',
        INDEX idx_status (status),
        INDEX idx_last_seen (last_seen)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log(`   ✓ ${T.ip_groups} 생성 완료`);

    // 2. personas 테이블
    console.log(`[2/10] ${T.personas} 테이블 생성...`);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ${T.personas} (
        id VARCHAR(36) PRIMARY KEY,
        code VARCHAR(20) NOT NULL UNIQUE,
        ip_address VARCHAR(15),
        time_slot CHAR(1) NOT NULL,
        user_type CHAR(1) NOT NULL,
        age_group CHAR(1) NOT NULL,
        gender CHAR(1) NOT NULL,
        sequence INT NOT NULL,
        device_code VARCHAR(10) NOT NULL,
        device_profile JSON NOT NULL,
        behavior_profile JSON NOT NULL,
        ai_generated_at DATETIME,
        ai_model VARCHAR(50),
        status ENUM('new', 'learning', 'ready', 'active', 'suspended') DEFAULT 'new',
        learning_progress INT DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_used DATETIME,
        session_count INT DEFAULT 0,
        success_count INT DEFAULT 0,
        blocked_count INT DEFAULT 0,
        INDEX idx_ip (ip_address),
        INDEX idx_time_slot (time_slot),
        INDEX idx_status (status),
        INDEX idx_code (code),
        INDEX idx_age_gender (age_group, gender)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log(`   ✓ ${T.personas} 생성 완료`);

    // 3. persona_interests 테이블
    console.log(`[3/10] ${T.persona_interests} 테이블 생성...`);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ${T.persona_interests} (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        persona_id VARCHAR(36) NOT NULL,
        category VARCHAR(50) NOT NULL,
        subcategory VARCHAR(100),
        interest_level DECIMAL(3,2) DEFAULT 0.50,
        source ENUM('initial', 'ai_generated', 'learned') DEFAULT 'initial',
        ai_reason TEXT,
        search_count INT DEFAULT 0,
        click_count INT DEFAULT 0,
        total_dwell_time INT DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_persona (persona_id),
        INDEX idx_category (category),
        INDEX idx_level (interest_level),
        FOREIGN KEY (persona_id) REFERENCES ${T.personas}(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log(`   ✓ ${T.persona_interests} 생성 완료`);

    // 4. persona_search_keywords 테이블
    console.log(`[4/10] ${T.persona_search_keywords} 테이블 생성...`);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ${T.persona_search_keywords} (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        persona_id VARCHAR(36) NOT NULL,
        interest_id BIGINT,
        keyword VARCHAR(200) NOT NULL,
        keyword_type ENUM('problem', 'info', 'comparison', 'purchase', 'general') DEFAULT 'general',
        source ENUM('initial', 'ai_generated', 'learned') DEFAULT 'initial',
        ai_context TEXT,
        used_count INT DEFAULT 0,
        last_used DATETIME,
        success_rate DECIMAL(3,2) DEFAULT 0.00,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_persona (persona_id),
        INDEX idx_type (keyword_type),
        INDEX idx_interest (interest_id),
        INDEX idx_used (used_count),
        FOREIGN KEY (persona_id) REFERENCES ${T.personas}(id) ON DELETE CASCADE,
        FOREIGN KEY (interest_id) REFERENCES ${T.persona_interests}(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log(`   ✓ ${T.persona_search_keywords} 생성 완료`);

    // 5. target_products 테이블
    console.log(`[5/10] ${T.target_products} 테이블 생성...`);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ${T.target_products} (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        product_name VARCHAR(200) NOT NULL,
        product_category VARCHAR(50) NOT NULL,
        product_url VARCHAR(500),
        product_keywords JSON,
        client_id VARCHAR(50),
        priority INT DEFAULT 5,
        target_persona_types JSON,
        target_age_groups JSON,
        target_time_slots JSON,
        status ENUM('pending', 'active', 'completed', 'paused') DEFAULT 'pending',
        daily_target INT DEFAULT 100,
        daily_achieved INT DEFAULT 0,
        total_clicks INT DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        start_date DATE,
        end_date DATE,
        INDEX idx_status (status),
        INDEX idx_category (product_category),
        INDEX idx_priority (priority)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log(`   ✓ ${T.target_products} 생성 완료`);

    // 6. click_scenarios 테이블
    console.log(`[6/10] ${T.click_scenarios} 테이블 생성...`);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ${T.click_scenarios} (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        target_product_id BIGINT NOT NULL,
        scenario_name VARCHAR(100) NOT NULL,
        scenario_type ENUM('direct', 'compare', 'blog', 'revisit') DEFAULT 'direct',
        pre_click_actions JSON NOT NULL,
        target_click_action JSON NOT NULL,
        post_click_actions JSON NOT NULL,
        weight INT DEFAULT 10,
        used_count INT DEFAULT 0,
        success_count INT DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_product (target_product_id),
        INDEX idx_type (scenario_type),
        INDEX idx_weight (weight),
        FOREIGN KEY (target_product_id) REFERENCES ${T.target_products}(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log(`   ✓ ${T.click_scenarios} 생성 완료`);

    // 7. dwell_time_configs 테이블
    console.log(`[7/10] ${T.dwell_time_configs} 테이블 생성...`);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ${T.dwell_time_configs} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        context ENUM('target_product', 'comparison_product', 'search_result', 'blog_post', 'review_page') NOT NULL UNIQUE,
        min_dwell INT NOT NULL,
        max_dwell INT NOT NULL,
        avg_dwell INT NOT NULL,
        min_scroll INT DEFAULT 0,
        max_scroll INT DEFAULT 100,
        age_multiplier JSON
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 기본 데이터 삽입
    await conn.execute(`
      INSERT IGNORE INTO ${T.dwell_time_configs} (context, min_dwell, max_dwell, avg_dwell, min_scroll, max_scroll, age_multiplier) VALUES
      ('target_product', 120, 300, 180, 80, 100, '{"2":0.7,"3":1.0,"4":1.2,"5":1.5}'),
      ('comparison_product', 10, 30, 20, 20, 50, '{"2":0.6,"3":1.0,"4":1.3,"5":1.6}'),
      ('search_result', 30, 60, 45, 30, 70, '{"2":0.7,"3":1.0,"4":1.2,"5":1.4}'),
      ('blog_post', 60, 180, 120, 50, 90, '{"2":0.8,"3":1.0,"4":1.1,"5":1.3}'),
      ('review_page', 30, 90, 60, 40, 80, '{"2":0.7,"3":1.0,"4":1.2,"5":1.5}')
    `);
    console.log(`   ✓ ${T.dwell_time_configs} 생성 완료`);

    // 8. session_logs 테이블
    console.log(`[8/10] ${T.session_logs} 테이블 생성...`);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ${T.session_logs} (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(36) NOT NULL,
        persona_id VARCHAR(36) NOT NULL,
        ip_address VARCHAR(15) NOT NULL,
        started_at DATETIME NOT NULL,
        ended_at DATETIME,
        duration_sec INT,
        target_product_id BIGINT,
        scenario_id BIGINT,
        target_clicked BOOLEAN DEFAULT FALSE,
        target_dwell_time INT,
        total_pages INT DEFAULT 0,
        total_searches INT DEFAULT 0,
        total_clicks INT DEFAULT 0,
        result ENUM('success', 'blocked', 'timeout', 'error') DEFAULT 'success',
        error_message TEXT,
        INDEX idx_persona (persona_id),
        INDEX idx_session (session_id),
        INDEX idx_target (target_product_id),
        INDEX idx_started (started_at),
        INDEX idx_result (result),
        FOREIGN KEY (persona_id) REFERENCES ${T.personas}(id),
        FOREIGN KEY (target_product_id) REFERENCES ${T.target_products}(id) ON DELETE SET NULL,
        FOREIGN KEY (scenario_id) REFERENCES ${T.click_scenarios}(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log(`   ✓ ${T.session_logs} 생성 완료`);

    // 9. click_logs 테이블
    console.log(`[9/10] ${T.click_logs} 테이블 생성...`);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ${T.click_logs} (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(36) NOT NULL,
        action_type ENUM('search', 'view_product', 'scroll', 'click', 'back', 'exit'),
        action_order INT NOT NULL,
        url VARCHAR(500),
        search_keyword VARCHAR(200),
        product_position INT,
        is_target BOOLEAN DEFAULT FALSE,
        dwell_time_sec INT,
        scroll_depth DECIMAL(3,2),
        timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_session (session_id),
        INDEX idx_is_target (is_target),
        INDEX idx_timestamp (timestamp),
        INDEX idx_action (action_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log(`   ✓ ${T.click_logs} 생성 완료`);

    // 10. ai_learning_queue 테이블
    console.log(`[10/10] ${T.ai_learning_queue} 테이블 생성...`);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ${T.ai_learning_queue} (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        task_type ENUM('generate_interests', 'expand_keywords', 'generate_scenario', 'analyze_failure', 'optimize_pattern') NOT NULL,
        persona_id VARCHAR(36),
        target_product_id BIGINT,
        input_data JSON NOT NULL,
        output_data JSON,
        status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
        priority INT DEFAULT 5,
        error_message TEXT,
        retry_count INT DEFAULT 0,
        max_retries INT DEFAULT 3,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME,
        INDEX idx_status_priority (status, priority),
        INDEX idx_persona (persona_id),
        INDEX idx_type (task_type),
        FOREIGN KEY (persona_id) REFERENCES ${T.personas}(id) ON DELETE CASCADE,
        FOREIGN KEY (target_product_id) REFERENCES ${T.target_products}(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log(`   ✓ ${T.ai_learning_queue} 생성 완료`);

    // Views 생성
    console.log('\n뷰 생성...');

    await conn.execute(`
      CREATE OR REPLACE VIEW persona_summary_v4 AS
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
        (SELECT COUNT(*) FROM ${T.persona_interests} WHERE persona_id = p.id) as interest_count,
        (SELECT COUNT(*) FROM ${T.persona_search_keywords} WHERE persona_id = p.id) as keyword_count
      FROM ${T.personas} p
    `);
    console.log('   ✓ persona_summary_v4 뷰 생성 완료');

    await conn.execute(`
      CREATE OR REPLACE VIEW target_product_progress_v4 AS
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
        tp.end_date
      FROM ${T.target_products} tp
    `);
    console.log('   ✓ target_product_progress_v4 뷰 생성 완료');

    await conn.execute(`
      CREATE OR REPLACE VIEW ai_queue_status_v4 AS
      SELECT
        task_type,
        status,
        COUNT(*) as count,
        MIN(created_at) as oldest,
        MAX(created_at) as newest
      FROM ${T.ai_learning_queue}
      GROUP BY task_type, status
    `);
    console.log('   ✓ ai_queue_status_v4 뷰 생성 완료');

    await conn.execute(`
      CREATE OR REPLACE VIEW daily_session_stats_v4 AS
      SELECT
        DATE(started_at) as date,
        COUNT(*) as total_sessions,
        COUNT(DISTINCT persona_id) as unique_personas,
        SUM(CASE WHEN result = 'success' THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN result = 'blocked' THEN 1 ELSE 0 END) as blocked_count,
        SUM(CASE WHEN target_clicked = TRUE THEN 1 ELSE 0 END) as target_clicks,
        AVG(duration_sec) as avg_duration,
        AVG(CASE WHEN target_clicked THEN target_dwell_time END) as avg_target_dwell
      FROM ${T.session_logs}
      GROUP BY DATE(started_at)
    `);
    console.log('   ✓ daily_session_stats_v4 뷰 생성 완료');

    conn.release();

    console.log('\n' + '═'.repeat(60));
    console.log('🎉 마이그레이션 완료!');
    console.log('═'.repeat(60));

    console.log('\n생성된 테이블:');
    Object.values(T).forEach(t => console.log(`  - ${t}`));

  } catch (error) {
    console.error('\n❌ 마이그레이션 실패:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

runMigration();
