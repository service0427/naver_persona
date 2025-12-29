#!/usr/bin/env node
/**
 * StateManager 테스트 스크립트
 *
 * 시나리오:
 * 1. 새 페르소나 생성
 * 2. 브라우저로 네이버 접속
 * 3. 체크포인트 생성 (페이지 이동마다)
 * 4. 브라우저 종료 후 재시작
 * 5. 체크포인트에서 복원 확인
 */

import { chromium } from 'patchright';
import StateManager from '../lib/utils/state-manager.js';
import dbV2 from '../lib/db/DatabaseV2.js';
import os from 'os';
import path from 'path';
import fs from 'fs';

const PROFILE_BASE = '/tmp/state-manager-test';
const TEST_PERSONA_ID = `test-sm-${Date.now()}`;

async function test() {
  console.log('='.repeat(60));
  console.log('StateManager 테스트');
  console.log('='.repeat(60));

  // 프로필 디렉토리 설정
  const profileDir = path.join(PROFILE_BASE, TEST_PERSONA_ID);

  try {
    // 1. DB 초기화 및 테스트 페르소나 생성
    console.log('\n[1] DB 초기화 및 페르소나 생성...');
    await dbV2.connect();
    await dbV2.registerPC({
      pcId: `pc-${os.hostname()}`,
      hostname: os.hostname(),
      ipAddress: '127.0.0.1',
      osVersion: `${os.platform()} ${os.release()}`,
      chromeVersion: '130.0.6723.91',
      vpnCount: 7
    });

    await dbV2.createPersona({
      id: TEST_PERSONA_ID,
      name: 'StateManager 테스트',
      baseProfile: 'galaxy-s23',
      chromeVersion: '130.0.6723.91',
      fingerprint: {
        navigator: { hardwareConcurrency: 8, deviceMemory: 8 },
        screen: { width: 1080, height: 2340 }
      }
    });
    console.log(`✓ 페르소나 생성: ${TEST_PERSONA_ID}`);

    // 2. StateManager 초기화
    console.log('\n[2] StateManager 초기화...');
    const stateManager = new StateManager(TEST_PERSONA_ID, profileDir);
    const prepResult = await stateManager.prepareProfile();
    console.log(`✓ 프로필 준비: restored=${prepResult.restored}`);

    // 3. 첫 번째 브라우저 세션 (launchPersistentContext 사용!)
    console.log('\n[3] 첫 번째 브라우저 세션 시작...');
    console.log(`   프로필 디렉토리: ${profileDir}`);

    // launchPersistentContext: 지정한 디렉토리에 프로필 저장
    const context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
      userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.91 Mobile Safari/537.36',
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 2.625,
      isMobile: true,
      hasTouch: true,
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul'
    });

    // storageState 적용 (복원된 쿠키가 있으면)
    if (prepResult.storageState?.cookies?.length > 0) {
      await context.addCookies(prepResult.storageState.cookies);
      console.log(`   복원된 쿠키 ${prepResult.storageState.cookies.length}개 적용`);
    }

    stateManager.setContext(context);
    const page = context.pages()[0] || await context.newPage();

    // 네이버 메인 접속
    console.log('\n[4] 네이버 메인 접속...');
    await page.goto('https://m.naver.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // 체크포인트 1
    const cp1 = await stateManager.createCheckpoint('after-naver-main', {
      vpnIp: '123.45.67.89'
    });
    console.log(`✓ 체크포인트 1: cookies=${cp1.cookieCount}`);

    // 검색 페이지 이동
    console.log('\n[5] 검색 페이지 이동...');
    await page.goto('https://m.search.naver.com/search.naver?query=테스트', {
      waitUntil: 'domcontentloaded'
    });
    await page.waitForTimeout(2000);

    // 체크포인트 2
    const cp2 = await stateManager.createCheckpoint('after-search', {
      vpnIp: '123.45.67.89'
    });
    console.log(`✓ 체크포인트 2: cookies=${cp2.cookieCount}`);

    // 쿠키 상태 검증
    const validation = await stateManager.validateCurrentState(['NNB']);
    console.log(`✓ 쿠키 검증: valid=${validation.valid}, present=${validation.present?.join(',') || 'none'}`);

    // 체크포인트 히스토리
    console.log('\n[6] 체크포인트 히스토리:');
    const history = stateManager.getCheckpointHistory();
    for (const cp of history) {
      console.log(`  - ${cp.name}: cookies=${cp.cookieCount}, hasStorageState=${cp.hasStorageState}`);
    }

    // 최종 저장 및 브라우저 종료
    console.log('\n[7] 세션 종료 및 저장...');
    await stateManager.finalSave({ vpnIp: '123.45.67.89', result: '성공' });
    await context.close();  // launchPersistentContext는 context.close() 사용
    console.log('✓ 첫 번째 세션 종료');

    // 4. 두 번째 세션 - 복원 테스트
    console.log('\n' + '='.repeat(60));
    console.log('[8] 두 번째 세션 - 복원 테스트');
    console.log('='.repeat(60));

    // 새 StateManager 인스턴스
    const stateManager2 = new StateManager(TEST_PERSONA_ID, profileDir);
    const prepResult2 = await stateManager2.prepareProfile();
    console.log(`✓ 복원 결과: restored=${prepResult2.restored}, checkpoint=${prepResult2.checkpoint}`);

    // 두 번째 브라우저 시작 (launchPersistentContext - 파일 복원됨)
    const context2 = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      args: ['--no-sandbox'],
      userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36',
      viewport: { width: 412, height: 915 },
      isMobile: true
    });

    // 추가 쿠키 적용 (storageState 보조)
    if (prepResult2.storageState?.cookies?.length > 0) {
      await context2.addCookies(prepResult2.storageState.cookies);
    }
    stateManager2.setContext(context2);
    const page2 = context2.pages()[0] || await context2.newPage();

    // 네이버 접속하여 쿠키 확인
    console.log('\n[9] 복원된 상태로 네이버 접속...');
    await page2.goto('https://m.naver.com', { waitUntil: 'domcontentloaded' });
    await page2.waitForTimeout(2000);

    // 쿠키 비교
    const cookies2 = await context2.cookies();
    const naverCookies = cookies2.filter(c => c.domain.includes('naver'));
    console.log(`✓ 복원된 네이버 쿠키: ${naverCookies.length}개`);
    for (const c of naverCookies.slice(0, 5)) {
      console.log(`  - ${c.name}: ${c.value.substring(0, 20)}...`);
    }

    // NNB 쿠키 비교 (동일해야 함)
    const nnb1 = cp2.cookies.find(c => c.name === 'NNB');
    const nnb2 = naverCookies.find(c => c.name === 'NNB');
    if (nnb1 && nnb2) {
      const match = nnb1.value === nnb2.value;
      console.log(`\n✓ NNB 쿠키 일치: ${match ? '✓ 동일!' : '✗ 다름'}`);
      if (!match) {
        console.log(`  - 원본: ${nnb1.value}`);
        console.log(`  - 복원: ${nnb2.value}`);
      }
    }

    await context2.close();

    // 5. DB 상태 확인
    console.log('\n[10] DB 상태 확인...');
    const persona = await dbV2.getPersona(TEST_PERSONA_ID);
    console.log(`✓ 페르소나 상태:`);
    console.log(`  - totalUses: ${persona.totalUses}`);
    console.log(`  - lastVpnIp: ${persona.lastVpnIp}`);
    console.log(`  - 저장된 쿠키: ${persona.storageState?.cookies?.length || 0}개`);

    console.log('\n' + '='.repeat(60));
    console.log('테스트 완료! ✓');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ 테스트 실패:', error);
    console.error(error.stack);
  } finally {
    // 정리
    await dbV2.close();
    if (fs.existsSync(profileDir)) {
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
  }
}

test();
