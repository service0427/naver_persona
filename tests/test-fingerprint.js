/**
 * S23+ 실기기 fingerprint 테스트
 * - Client Hints 매칭 확인
 * - HTTP 헤더 검증
 */

import { chromium } from 'patchright';
import path from 'path';
import { S23_PLUS_REAL, toContextOptions, applyDeviceSettings } from '../lib/devices/s23plus-real.js';
import SessionLogger from '../lib/utils/logger.js';

const THREAD_ID = 0;
const PROFILE_DIR = path.resolve(`./data/profiles/thread-${THREAD_ID}`);

async function main() {
  const logger = new SessionLogger('fingerprint-test');

  logger.log('=== S23+ 실기기 fingerprint 테스트 ===');
  logger.log(`프로필: ${PROFILE_DIR}`);

  const contextOptions = toContextOptions();

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: [
      '--remote-debugging-port=9222',
      '--no-sandbox'
    ],
    ...contextOptions,
    geolocation: S23_PLUS_REAL.geolocation,
    permissions: ['geolocation']
  });

  // 디바이스 설정 적용 (initScript + route interception)
  logger.log('\n[1] 디바이스 설정 적용...');
  await applyDeviceSettings(context);

  let page = null;

  try {
    // 새 페이지 생성 (모든 설정이 적용된 상태)
    logger.log('\n[2] 새 페이지 생성...');
    page = await context.newPage();

    // 로거 연결
    logger.attachToPage(page, {
      excludeTypes: ['image', 'stylesheet', 'font', 'media']
    });

    logger.log('\n[3] m.naver.com 접속...');
    await page.goto('https://m.naver.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // 헤더 검증을 위한 간단한 정보 출력
    logger.log('\n[4] 검증 완료');
    logger.log(`현재 URL: ${page.url()}`);

    // 10초 대기 (결과 확인용)
    logger.log('\n10초 대기...');
    await page.waitForTimeout(10000);

  } finally {
    const saved = logger.save();
    console.log(`\n로그 저장됨:`);
    console.log(`  콘솔: ${saved.console}`);
    console.log(`  네트워크: ${saved.network}`);

    await context.close();
    logger.log('종료');
  }
}

main().catch(console.error);
