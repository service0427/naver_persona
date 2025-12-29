#!/usr/bin/env node
/**
 * DB 컬럼 마이그레이션
 * cookie_backup → data_backup
 *
 * 사용법:
 *   node scripts/migrate-column.js --dry-run    # 변경 사항 확인만
 *   node scripts/migrate-column.js --confirm    # 실제 실행
 */

import mysql from 'mysql2/promise';

const DB_CONFIG = {
  host: '220.121.120.83',
  user: 'naver_persona',
  password: 'Tech1324',
  database: 'naver_persona',
  charset: 'utf8mb4'
};

async function main() {
  const dryRun = !process.argv.includes('--confirm');

  if (dryRun) {
    console.log('\n⚠️  DRY RUN 모드 - 실제 실행하려면 --confirm 옵션 사용\n');
  }

  const conn = await mysql.createConnection(DB_CONFIG);

  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                    컬럼 마이그레이션                               ║');
  console.log('║              cookie_backup → data_backup                         ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // 현재 컬럼 확인
  const [columns] = await conn.execute(`
    SELECT COLUMN_NAME, DATA_TYPE, COLUMN_COMMENT
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'naver_persona'
      AND TABLE_NAME = 'personas'
      AND COLUMN_NAME IN ('cookie_backup', 'data_backup')
  `);

  console.log('  [현재 컬럼 상태]');
  if (columns.length === 0) {
    console.log('    - cookie_backup: 없음');
    console.log('    - data_backup: 없음');
  } else {
    for (const col of columns) {
      console.log(`    - ${col.COLUMN_NAME}: ${col.DATA_TYPE} (${col.COLUMN_COMMENT || '코멘트 없음'})`);
    }
  }

  const hasCookieBackup = columns.some(c => c.COLUMN_NAME === 'cookie_backup');
  const hasDataBackup = columns.some(c => c.COLUMN_NAME === 'data_backup');

  if (!hasCookieBackup && hasDataBackup) {
    console.log('\n  ✅ 이미 마이그레이션 완료됨 (data_backup 컬럼 존재)');
    await conn.end();
    return;
  }

  if (!hasCookieBackup && !hasDataBackup) {
    console.log('\n  ⚠️ cookie_backup 컬럼이 없음 - 새로 생성됨');
    await conn.end();
    return;
  }

  // 데이터 확인
  const [dataCheck] = await conn.execute(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN cookie_backup IS NOT NULL THEN 1 ELSE 0 END) as with_backup,
      SUM(LENGTH(cookie_backup)) / 1024 / 1024 as total_mb
    FROM personas
  `);

  console.log('\n  [데이터 현황]');
  console.log(`    - 총 레코드: ${dataCheck[0].total}개`);
  console.log(`    - 백업 있는 레코드: ${dataCheck[0].with_backup}개`);
  const totalMb = dataCheck[0].total_mb ? Number(dataCheck[0].total_mb) : 0;
  console.log(`    - 총 데이터 크기: ${totalMb.toFixed(2)}MB`);

  if (dryRun) {
    console.log('\n  [마이그레이션 계획]');
    console.log('    1. cookie_backup 컬럼을 data_backup으로 이름 변경');
    console.log('    2. 컬럼 코멘트 업데이트: "gzip+base64 파일 백업 (전체)"');
    console.log('\n  ℹ️  실제 실행하려면: node scripts/migrate-column.js --confirm\n');
    await conn.end();
    return;
  }

  // 실제 마이그레이션 수행
  console.log('\n  마이그레이션 실행 중...\n');

  try {
    await conn.execute(`
      ALTER TABLE personas
      CHANGE COLUMN cookie_backup data_backup LONGTEXT
      COMMENT 'gzip+base64 파일 백업 (전체)'
    `);
    console.log('  ✅ cookie_backup → data_backup 변경 완료');
  } catch (e) {
    console.log(`  ❌ 실패: ${e.message}`);
  }

  // 확인
  const [verifyColumns] = await conn.execute(`
    SELECT COLUMN_NAME, DATA_TYPE, COLUMN_COMMENT
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'naver_persona'
      AND TABLE_NAME = 'personas'
      AND COLUMN_NAME = 'data_backup'
  `);

  if (verifyColumns.length > 0) {
    console.log('\n  [검증]');
    console.log(`    - data_backup: ${verifyColumns[0].DATA_TYPE} (${verifyColumns[0].COLUMN_COMMENT})`);
  }

  console.log('\n  ═══════════════════════════════════════════════════════════════');
  console.log('  마이그레이션 완료!');
  console.log('');

  await conn.end();
}

main().catch(console.error);
