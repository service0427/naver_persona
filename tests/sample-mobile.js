/**
 * 모바일 S23+ 검색 테스트
 * m.naver.com → 검색어 입력 → 검색 결과
 */

import { chromium } from 'patchright';
import path from 'path';
import SessionLogger from '../lib/utils/logger.js';

const THREAD_ID = 0;
const PROFILE_DIR = path.resolve(`./data/profiles/thread-${THREAD_ID}`);

// S23+ 디바이스 설정
const S23_PLUS = {
  userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S916N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  viewport: { width: 384, height: 854 },
  deviceScaleFactor: 2.8125,
  isMobile: true,
  hasTouch: true,
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul'
};

async function main() {
  const logger = new SessionLogger('s23plus-search');

  logger.log('S23+ 모바일 검색 테스트');
  logger.log(`프로필: ${PROFILE_DIR}`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: [
      '--remote-debugging-port=9222',
      '--no-sandbox'
    ],
    ...S23_PLUS
  });

  const page = context.pages()[0] || await context.newPage();

  // 로거 연결 (모든 네트워크 로깅 + 콘솔 필터 출력)
  logger.attachToPage(page, {
    excludeTypes: ['image', 'stylesheet', 'font', 'media']
  });

  try {
    // 1. m.naver.com 접속
    logger.log('\n[1] m.naver.com 접속...');
    await page.goto('https://m.naver.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // 2. 검색창 클릭 (MM_SEARCH_FAKE)
    logger.log('\n[2] 검색창 클릭...');
    await page.click('#MM_SEARCH_FAKE');
    await page.waitForTimeout(1000);

    // 3. 실제 검색 input에 검색어 입력
    logger.log('\n[3] 검색어 입력: 아이간식 달빛기정떡');
    await page.fill('#query', '아이간식 달빛기정떡');
    await page.waitForTimeout(500);

    // 4. 검색 실행 (Enter)
    logger.log('\n[4] 검색 실행...');
    await page.press('#query', 'Enter');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    logger.log(`\n[완료] 현재 URL: ${page.url()}`);

    // 30초 대기 (결과 확인용)
    logger.log('\n30초 대기...');
    await page.waitForTimeout(30000);

  } finally {
    // 로그 저장
    const saved = logger.save();
    console.log(`\n로그 저장됨:`);
    console.log(`  콘솔: ${saved.console}`);
    console.log(`  네트워크: ${saved.network}`);

    await context.close();
    logger.log('종료');
  }
}

main().catch(console.error);
