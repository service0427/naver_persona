#!/usr/bin/env node
/**
 * PersonaStorage 테스트
 */

import PersonaStorage from '../lib/storage/PersonaStorage.js';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const TEST_BASE = '/tmp/persona-storage-test';
const TEST_PERSONA_ID = 'abcd1234-test-persona';

async function test() {
  console.log('='.repeat(60));
  console.log('PersonaStorage 테스트');
  console.log('='.repeat(60));

  const storage = new PersonaStorage({ baseDir: TEST_BASE });

  try {
    // 1. 경로 생성 테스트
    console.log('\n[1] 경로 생성...');
    const fullPath = storage.getPath(TEST_PERSONA_ID);
    const relativePath = storage.getRelativePath(TEST_PERSONA_ID);
    console.log(`  전체 경로: ${fullPath}`);
    console.log(`  상대 경로: ${relativePath}`);
    console.log(`  예상: ${TEST_BASE}/ab/cd/${TEST_PERSONA_ID}`);

    // 2. 핑거프린트 저장/로드
    console.log('\n[2] 핑거프린트 저장/로드...');
    const fingerprint = {
      navigator: { hardwareConcurrency: 8, deviceMemory: 8 },
      screen: { width: 1080, height: 2340 },
      webgl: { renderer: 'Adreno (TM) 740' }
    };
    await storage.saveFingerprint(TEST_PERSONA_ID, fingerprint);
    const loadedFp = await storage.loadFingerprint(TEST_PERSONA_ID);
    console.log(`  저장: ✓`);
    console.log(`  로드: ${loadedFp?.navigator?.hardwareConcurrency === 8 ? '✓' : '✗'}`);

    // 3. 상태 저장/로드
    console.log('\n[3] 상태 저장/로드...');
    const state = {
      checkpoint: 'after-search',
      vpnIp: '123.45.67.89',
      pcId: 'pc-test',
      agingLevel: 3
    };
    await storage.saveState(TEST_PERSONA_ID, state);
    const loadedState = await storage.loadState(TEST_PERSONA_ID);
    console.log(`  저장: ✓`);
    console.log(`  로드: checkpoint=${loadedState?.checkpoint}`);

    // 4. 히스토리 추가
    console.log('\n[4] 히스토리 추가...');
    await storage.appendHistory(TEST_PERSONA_ID, { action: 'visit', url: 'https://m.naver.com' });
    await storage.appendHistory(TEST_PERSONA_ID, { action: 'search', keyword: '테스트' });
    const history = await storage.loadHistory(TEST_PERSONA_ID);
    console.log(`  항목 수: ${history.length}`);

    // 5. 쿠키 백업 테스트 (임시 프로필 생성)
    console.log('\n[5] 쿠키 백업/복원...');
    const tempProfile = '/tmp/test-chrome-profile';
    const tempDefault = path.join(tempProfile, 'Default');
    await fs.mkdir(tempDefault, { recursive: true });

    // 더미 쿠키 파일 생성
    await fs.writeFile(path.join(tempDefault, 'Cookies'), 'dummy-cookies-data');
    await fs.writeFile(path.join(tempDefault, 'Cookies-journal'), 'dummy-journal');
    await fs.writeFile(path.join(tempProfile, 'Local State'), '{"os_crypt":{}}');

    // 백업
    const backupResult = await storage.saveCookies(TEST_PERSONA_ID, tempProfile);
    console.log(`  백업: ${backupResult ? '✓' : '✗'}`);

    // 복원할 새 프로필
    const restoreProfile = '/tmp/test-chrome-profile-restored';
    await fs.rm(restoreProfile, { recursive: true, force: true }).catch(() => {});

    const restoreResult = await storage.restoreCookies(TEST_PERSONA_ID, restoreProfile);
    console.log(`  복원: ${restoreResult ? '✓' : '✗'}`);

    // 복원 확인
    const restoredCookies = existsSync(path.join(restoreProfile, 'Default', 'Cookies'));
    const restoredLocalState = existsSync(path.join(restoreProfile, 'Local State'));
    console.log(`  Cookies 파일: ${restoredCookies ? '✓' : '✗'}`);
    console.log(`  Local State: ${restoredLocalState ? '✓' : '✗'}`);

    // 6. 전체 로드
    console.log('\n[6] 전체 데이터 로드...');
    const allData = await storage.load(TEST_PERSONA_ID);
    console.log(`  fingerprint: ${allData?.fingerprint ? '✓' : '✗'}`);
    console.log(`  state: ${allData?.state ? '✓' : '✗'}`);
    console.log(`  history: ${allData?.history?.length || 0}개`);
    console.log(`  cookiesPath: ${allData?.cookiesPath ? '✓' : '✗'}`);

    // 7. 통계
    console.log('\n[7] 저장소 통계...');
    const stats = await storage.getStats();
    console.log(`  총 페르소나: ${stats.totalPersonas}`);
    console.log(`  샤드:`, stats.shards);

    // 8. 삭제
    console.log('\n[8] 삭제...');
    await storage.delete(TEST_PERSONA_ID);
    const existsAfterDelete = await storage.exists(TEST_PERSONA_ID);
    console.log(`  삭제 후 존재: ${existsAfterDelete ? '✗ (실패)' : '✓ (성공)'}`);

    console.log('\n' + '='.repeat(60));
    console.log('테스트 완료! ✓');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ 테스트 실패:', error);
    console.error(error.stack);
  } finally {
    // 정리
    await fs.rm(TEST_BASE, { recursive: true, force: true }).catch(() => {});
    await fs.rm('/tmp/test-chrome-profile', { recursive: true, force: true }).catch(() => {});
    await fs.rm('/tmp/test-chrome-profile-restored', { recursive: true, force: true }).catch(() => {});
  }
}

test();
