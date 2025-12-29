#!/usr/bin/env node
/**
 * DB 상태 확인 스크립트
 */

import db from '../lib/db/Database.js';

async function main() {
  await db.connect();

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    현재 DB 테이블 현황                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // 테이블 목록 및 크기
  const [tables] = await db.pool.execute(`
    SELECT
      TABLE_NAME as name,
      TABLE_ROWS as row_count,
      ROUND(DATA_LENGTH/1024/1024, 2) as data_mb,
      ROUND(INDEX_LENGTH/1024/1024, 2) as index_mb
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA='naver_persona' AND TABLE_TYPE='BASE TABLE'
    ORDER BY TABLE_ROWS DESC
  `);

  console.log('  %-25s %12s %10s %10s', 'Table', 'Rows', 'Data MB', 'Index MB');
  console.log('  ' + '-'.repeat(60));

  for (const t of tables) {
    console.log('  %-25s %12s %10s %10s', t.name, t.row_count || 0, t.data_mb || 0, t.index_mb || 0);
  }

  // profile_data 샘플
  console.log('\n\n[profile_data 샘플]');
  const [samples] = await db.pool.execute(`
    SELECT profile_key, total_uses, last_result,
           LENGTH(file_backup)/1024 as backup_kb,
           updated_at
    FROM profile_data LIMIT 5
  `);

  for (const s of samples) {
    console.log(`  ${s.profile_key}: ${s.total_uses}회 사용, ${s.last_result}, 백업 ${Math.round(s.backup_kb || 0)}KB`);
  }

  await db.close();
}

main().catch(console.error);
