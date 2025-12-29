#!/usr/bin/env node
/**
 * DB 완전 초기화 스크립트
 *
 * 모든 테이블 삭제 후 새로운 단순화된 스키마 생성
 *
 * 사용법:
 *   node scripts/db-reset.js --dry-run    # 삭제 대상만 확인
 *   node scripts/db-reset.js --confirm    # 실제 삭제 및 재생성
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
    console.log('\n⚠️  DRY RUN 모드 - 실제 삭제하려면 --confirm 옵션 사용\n');
  }

  const conn = await mysql.createConnection(DB_CONFIG);

  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                    DB 완전 초기화                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // 1. 모든 테이블 목록 조회
  const [tables] = await conn.execute(`
    SELECT TABLE_NAME as name, TABLE_ROWS as row_count
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = 'naver_persona' AND TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_NAME
  `);

  // 2. 모든 뷰 목록 조회
  const [views] = await conn.execute(`
    SELECT TABLE_NAME as name
    FROM information_schema.VIEWS
    WHERE TABLE_SCHEMA = 'naver_persona'
  `);

  console.log(`  [삭제할 뷰: ${views.length}개]`);
  for (const v of views) {
    console.log(`    - ${v.name}`);
  }

  console.log(`\n  [삭제할 테이블: ${tables.length}개]`);
  let totalRows = 0;
  for (const t of tables) {
    console.log(`    - ${t.name.padEnd(35)} (${t.row_count || 0}행)`);
    totalRows += parseInt(t.row_count || 0);
  }
  console.log(`\n  총 ${totalRows.toLocaleString()}행 삭제 예정`);

  if (dryRun) {
    console.log('\n  ℹ️  실제 삭제하려면: node scripts/db-reset.js --confirm\n');
    await conn.end();
    return;
  }

  // 실제 삭제 수행
  console.log('\n  삭제 중...\n');

  // 외래키 체크 비활성화
  await conn.execute('SET FOREIGN_KEY_CHECKS = 0');

  // 뷰 삭제
  for (const v of views) {
    try {
      await conn.execute(`DROP VIEW IF EXISTS \`${v.name}\``);
      console.log(`  ✅ VIEW ${v.name} 삭제`);
    } catch (e) {
      console.log(`  ❌ VIEW ${v.name} 삭제 실패: ${e.message}`);
    }
  }

  // 테이블 삭제
  for (const t of tables) {
    try {
      await conn.execute(`DROP TABLE IF EXISTS \`${t.name}\``);
      console.log(`  ✅ TABLE ${t.name} 삭제`);
    } catch (e) {
      console.log(`  ❌ TABLE ${t.name} 삭제 실패: ${e.message}`);
    }
  }

  // 외래키 체크 다시 활성화
  await conn.execute('SET FOREIGN_KEY_CHECKS = 1');

  console.log('\n  ═══════════════════════════════════════════════════════════════');
  console.log('  모든 테이블 삭제 완료!');
  console.log('  새 스키마 생성: node scripts/db-init.js');
  console.log('');

  await conn.end();
}

main().catch(console.error);
