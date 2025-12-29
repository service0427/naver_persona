#!/usr/bin/env node
/**
 * 페르소나 마이그레이션 스크립트
 * JSON 파일 → MariaDB
 *
 * 사용법: node migrate-personas.js
 */

import db from './lib/db/Database.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PERSONAS_DIR = path.join(__dirname, 'data', 'personas');

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         페르소나 마이그레이션 (JSON → MariaDB)                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();

  try {
    // DB 연결
    console.log('[1] DB 연결 중...');
    await db.connect();

    // 마이그레이션
    console.log(`[2] 마이그레이션 시작: ${PERSONAS_DIR}`);
    const result = await db.migrateFromJson(PERSONAS_DIR);

    // 결과 확인
    console.log();
    console.log('[3] 마이그레이션 결과:');
    console.log(`    ✅ 성공: ${result.migrated}개`);
    console.log(`    ❌ 실패: ${result.errors}개`);

    // DB에서 확인
    console.log();
    console.log('[4] DB 저장 확인:');
    const personas = await db.getAllPersonas(10);
    console.log(`    총 ${personas.length}개 페르소나 조회됨`);

    if (personas.length > 0) {
      console.log();
      console.log('    최근 페르소나:');
      for (const p of personas.slice(0, 5)) {
        console.log(`    - ${p.id} (${p.base_profile}) CPU:${p.hardware_concurrency} RAM:${p.device_memory}GB`);
      }
    }

  } catch (error) {
    console.error('오류:', error.message);
    process.exit(1);
  } finally {
    await db.close();
  }

  console.log();
  console.log('완료!');
}

main();
