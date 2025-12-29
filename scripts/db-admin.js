#!/usr/bin/env node
/**
 * DB 관리 스크립트
 *
 * 사용법:
 *   node scripts/db-admin.js status          # 현재 상태 확인
 *   node scripts/db-admin.js cleanup-old     # 사용하지 않는 테이블 삭제
 *   node scripts/db-admin.js migrate         # 기존 데이터를 V3로 마이그레이션
 *   node scripts/db-admin.js cleanup-90d     # 90일 지난 데이터 정리
 *   node scripts/db-admin.js stats           # 통계 조회
 */

import mysql from 'mysql2/promise';
import dbV3 from '../lib/db/DatabaseV3.js';

const DB_CONFIG = {
  host: '220.121.120.83',
  user: 'naver_persona',
  password: 'Tech1324',
  database: 'naver_persona',
  charset: 'utf8mb4'
};

// 사용할 핵심 테이블 (V3)
const CORE_TABLES = [
  'profiles',
  'cookies',
  'local_storage',
  'history',
  'exec_logs',
  'daily_summary'
];

// 기존 테이블 (마이그레이션 후 삭제 대상)
const LEGACY_TABLES = [
  // 버전별 중복 테이블
  'personas', 'personas_v2', 'personas_v3', 'personas_v4',
  'persona_state',
  'persona_logs', 'session_logs', 'session_logs_v4',
  'execution_logs', 'execution_logs_v3',
  'aging_queue', 'aging_queue_v3',
  'vpn_pool', 'worker_pcs',
  'ip_groups', 'ip_groups_v4',

  // 사용하지 않는 테이블
  'click_logs', 'click_logs_v4',
  'click_scenarios', 'click_scenarios_v4',
  'target_products', 'target_products_v4',
  'persona_interests', 'persona_interests_v4',
  'persona_search_keywords', 'persona_search_keywords_v4',
  'ai_learning_queue', 'ai_learning_queue_v4',
  'dwell_time_configs', 'dwell_time_configs_v4',

  // 마이그레이션 후 삭제
  'profile_data'
];

async function getConnection() {
  return await mysql.createConnection(DB_CONFIG);
}

/**
 * 현재 DB 상태 확인
 */
async function showStatus() {
  const conn = await getConnection();

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                       DB 상태 현황                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // 테이블 목록
  const [tables] = await conn.execute(`
    SELECT
      TABLE_NAME as name,
      TABLE_ROWS as row_count,
      ROUND(DATA_LENGTH/1024/1024, 2) as data_mb,
      ROUND(INDEX_LENGTH/1024/1024, 2) as index_mb,
      ROUND((DATA_LENGTH + INDEX_LENGTH)/1024/1024, 2) as total_mb
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA='naver_persona' AND TABLE_TYPE='BASE TABLE'
    ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC
  `);

  let totalSize = 0;
  let totalRows = 0;

  // 핵심 테이블
  console.log('  [핵심 테이블 - V3]');
  console.log(`  ${'Table'.padEnd(30)} ${'Rows'.padStart(10)} ${'Size MB'.padStart(10)} ${'Status'.padStart(12)}`);
  console.log('  ' + '-'.repeat(65));

  for (const t of tables) {
    if (CORE_TABLES.includes(t.name)) {
      console.log(`  ${t.name.padEnd(30)} ${String(t.row_count || 0).padStart(10)} ${String(t.total_mb || 0).padStart(10)} ${'✅ 사용중'.padStart(12)}`);
      totalSize += parseFloat(t.total_mb || 0);
      totalRows += parseInt(t.row_count || 0);
    }
  }

  // 레거시 테이블
  console.log('\n  [레거시 테이블 - 삭제 대상]');
  console.log(`  ${'Table'.padEnd(30)} ${'Rows'.padStart(10)} ${'Size MB'.padStart(10)} ${'Status'.padStart(14)}`);
  console.log('  ' + '-'.repeat(65));

  let legacySize = 0;
  let legacyRows = 0;

  for (const t of tables) {
    if (LEGACY_TABLES.includes(t.name)) {
      const status = (t.row_count > 0) ? '⚠️ 데이터있음' : '🗑️ 비어있음';
      console.log(`  ${t.name.padEnd(30)} ${String(t.row_count || 0).padStart(10)} ${String(t.total_mb || 0).padStart(10)} ${status.padStart(14)}`);
      legacySize += parseFloat(t.total_mb || 0);
      legacyRows += parseInt(t.row_count || 0);
    }
  }

  // 알 수 없는 테이블
  const unknownTables = tables.filter(t =>
    !CORE_TABLES.includes(t.name) && !LEGACY_TABLES.includes(t.name)
  );

  if (unknownTables.length > 0) {
    console.log('\n  [기타 테이블]');
    for (const t of unknownTables) {
      console.log('  %-30s %10s %10s', t.name, t.row_count || 0, t.total_mb || 0);
    }
  }

  // 요약
  console.log('\n  ═══════════════════════════════════════════════════════════════');
  console.log(`  핵심 테이블: ${CORE_TABLES.length}개, ${totalRows.toLocaleString()}행, ${totalSize.toFixed(2)}MB`);
  console.log(`  레거시 테이블: ${LEGACY_TABLES.length}개, ${legacyRows.toLocaleString()}행, ${legacySize.toFixed(2)}MB`);
  console.log(`  정리 시 확보 가능 용량: ${legacySize.toFixed(2)}MB`);
  console.log('');

  await conn.end();
}

/**
 * 레거시 테이블 삭제
 */
async function cleanupOldTables() {
  const conn = await getConnection();

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                    레거시 테이블 정리                               ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // 데이터가 있는 테이블 확인
  const [tables] = await conn.execute(`
    SELECT TABLE_NAME as name, TABLE_ROWS as row_count
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA='naver_persona' AND TABLE_TYPE='BASE TABLE'
  `);

  const tableMap = new Map(tables.map(t => [t.name, t.row_count || 0]));

  let deleted = 0;
  let skipped = 0;

  for (const tableName of LEGACY_TABLES) {
    const rowCount = tableMap.get(tableName);

    if (rowCount === undefined) {
      // 테이블이 존재하지 않음
      continue;
    }

    if (rowCount > 0 && tableName !== 'profile_data') {
      // profile_data는 마이그레이션 후 삭제
      console.log(`  ⚠️ ${tableName}: ${rowCount}행 있음 - 스킵 (먼저 마이그레이션 필요)`);
      skipped++;
      continue;
    }

    try {
      await conn.execute(`DROP TABLE IF EXISTS ${tableName}`);
      console.log(`  ✅ ${tableName} 삭제됨`);
      deleted++;
    } catch (e) {
      console.log(`  ❌ ${tableName} 삭제 실패: ${e.message}`);
    }
  }

  console.log(`\n  완료: ${deleted}개 삭제, ${skipped}개 스킵`);

  await conn.end();
}

/**
 * 기존 데이터 마이그레이션
 */
async function migrateToV3() {
  const conn = await getConnection();

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                    V3 마이그레이션                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // V3 테이블 초기화
  await dbV3.connect();

  // profile_data에서 마이그레이션
  const [profiles] = await conn.execute(`SELECT * FROM profile_data`);

  console.log(`  profile_data에서 ${profiles.length}개 프로필 발견\n`);

  let migrated = 0;
  let errors = 0;

  for (const row of profiles) {
    try {
      // JSON 파싱
      const parseJson = (val) => {
        if (!val) return null;
        if (typeof val === 'string') {
          try { return JSON.parse(val); } catch { return null; }
        }
        return val;
      };

      const data = {
        threadId: row.thread_id,
        chromeVersion: row.chrome_version,
        vpnIp: row.vpn_ip,
        result: row.last_result,
        fingerprint: parseJson(row.fingerprint),
        fileBackup: parseJson(row.file_backup),
        cookies: parseJson(row.cookies) || [],
        origins: parseJson(row.origins) || [],
        history: parseJson(row.history) || []
      };

      await dbV3.saveProfile(data);
      console.log(`  ✅ ${row.profile_key} 마이그레이션 완료`);
      migrated++;

    } catch (e) {
      console.log(`  ❌ ${row.profile_key} 실패: ${e.message}`);
      errors++;
    }
  }

  console.log(`\n  완료: ${migrated}개 성공, ${errors}개 실패`);

  await conn.end();
  await dbV3.close();
}

/**
 * 90일 정리
 */
async function cleanup90Days() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                    90일 초과 데이터 정리                            ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  await dbV3.connect();
  const result = await dbV3.cleanup90Days();

  console.log(`  프로필 만료: ${result.profiles}개`);
  console.log(`  localStorage 삭제: ${result.localStorage}개`);
  console.log(`  히스토리 삭제: ${result.history}개`);

  await dbV3.close();
}

/**
 * 통계 조회
 */
async function showStats() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                         통계                                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  await dbV3.connect();
  await dbV3.updateDailySummary();
  const stats = await dbV3.getStats(14);

  console.log('  [전체 통계]');
  console.log(`  총 프로필: ${stats.totals?.total_profiles?.toLocaleString() || 0}개`);
  console.log(`  활성 프로필: ${stats.totals?.active_profiles?.toLocaleString() || 0}개`);
  console.log(`  총 사용: ${stats.totals?.total_uses?.toLocaleString() || 0}회`);
  console.log(`  성공: ${stats.totals?.total_success?.toLocaleString() || 0}회`);
  console.log(`  차단: ${stats.totals?.total_blocked?.toLocaleString() || 0}회`);

  if (stats.daily.length > 0) {
    console.log('\n  [일별 통계]');
    console.log(`  ${'Date'.padEnd(12)} ${'Execs'.padStart(10)} ${'Success'.padStart(10)} ${'Blocked'.padStart(10)} ${'Rate'.padStart(10)}`);
    console.log('  ' + '-'.repeat(55));

    for (const d of stats.daily) {
      const dateStr = d.date instanceof Date ? d.date.toISOString().split('T')[0] : String(d.date);
      console.log(`  ${dateStr.padEnd(12)} ${String(d.total_executions || 0).padStart(10)} ${String(d.success_count || 0).padStart(10)} ${String(d.blocked_count || 0).padStart(10)} ${String((d.success_rate || 0) + '%').padStart(10)}`);
    }
  }

  console.log('');
  await dbV3.close();
}

async function main() {
  const command = process.argv[2];

  try {
    switch (command) {
      case 'status':
        await showStatus();
        break;

      case 'cleanup-old':
        await cleanupOldTables();
        break;

      case 'migrate':
        await migrateToV3();
        break;

      case 'cleanup-90d':
        await cleanup90Days();
        break;

      case 'stats':
        await showStats();
        break;

      default:
        console.log(`
DB 관리 스크립트

사용법:
  node scripts/db-admin.js <command>

명령어:
  status          현재 DB 상태 확인 (테이블 목록, 크기)
  cleanup-old     사용하지 않는 레거시 테이블 삭제
  migrate         기존 profile_data를 V3로 마이그레이션
  cleanup-90d     90일 지난 데이터 정리
  stats           통계 조회

예시:
  node scripts/db-admin.js status
  node scripts/db-admin.js migrate
  node scripts/db-admin.js cleanup-90d
`);
    }
  } catch (e) {
    console.error('오류:', e);
  }
}

main();
