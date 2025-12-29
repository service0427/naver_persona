/**
 * 검색 결과 비교 테스트
 * - m.naver.com 검색 수행
 * - 검색 결과 페이지 헤더 및 응답 확인
 */

import { chromium } from 'patchright';
import path from 'path';
import { S23_PLUS_REAL, toContextOptions, applyDeviceSettings } from '../lib/devices/s23plus-real.js';
import SessionLogger from '../lib/utils/logger.js';

const THREAD_ID = 0;
const PROFILE_DIR = path.resolve(`./data/profiles/thread-${THREAD_ID}`);
const SEARCH_QUERY = '아이간식 달빛기정떡';

async function main() {
  const logger = new SessionLogger('search-compare');

  logger.log('=== 검색 결과 비교 테스트 ===');
  logger.log(`검색어: ${SEARCH_QUERY}`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: [
      '--remote-debugging-port=9222',
      '--no-sandbox'
    ],
    ...toContextOptions(),
    geolocation: S23_PLUS_REAL.geolocation,
    permissions: ['geolocation']
  });

  await applyDeviceSettings(context);

  let page = null;

  try {
    page = await context.newPage();

    logger.attachToPage(page, {
      excludeTypes: ['image', 'stylesheet', 'font', 'media']
    });

    // 1. m.naver.com 접속
    logger.log('\n[1] m.naver.com 접속...');
    await page.goto('https://m.naver.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // 2. 검색창 클릭
    logger.log('\n[2] 검색창 클릭...');
    await page.click('#MM_SEARCH_FAKE');
    await page.waitForTimeout(1000);

    // 3. 검색어 입력
    logger.log(`\n[3] 검색어 입력: ${SEARCH_QUERY}`);
    await page.fill('#query', SEARCH_QUERY);
    await page.waitForTimeout(500);

    // 4. 검색 실행
    logger.log('\n[4] 검색 실행...');
    await page.press('#query', 'Enter');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    logger.log(`\n[5] 검색 결과 URL: ${currentUrl}`);

    // 5. 검색 결과 페이지 분석
    logger.log('\n[6] 검색 결과 페이지 분석...');

    const pageInfo = await page.evaluate(() => {
      // 검색 결과 영역 확인
      const results = {
        url: location.href,
        title: document.title,

        // 쇼핑 결과 확인
        shoppingSection: !!document.querySelector('[data-area="shp"]') ||
                         !!document.querySelector('.shopping_list') ||
                         !!document.querySelector('[class*="shopping"]'),

        // 광고 영역 확인
        adSection: !!document.querySelector('[data-area="nad"]') ||
                   !!document.querySelector('[class*="ad_"]'),

        // 통합검색 탭 확인
        tabs: Array.from(document.querySelectorAll('.tab_menu a, .flick_bx a')).map(a => a.textContent.trim()).slice(0, 5),

        // 검색 결과 개수 (대략적)
        resultCount: document.querySelectorAll('.total_wrap, .search_result, [class*="result"]').length,

        // 본문에 특정 키워드가 있는지
        hasSearchTerm: document.body.innerText.includes('달빛기정떡'),

        // 에러 메시지 확인
        hasError: !!document.querySelector('.error_wrap, .no_result'),

        // 캡챠/봇 감지 확인
        hasCaptcha: document.body.innerText.includes('자동입력') ||
                    document.body.innerText.includes('보안문자') ||
                    document.body.innerText.includes('비정상적인'),

        // 로그인 요청 확인
        loginRequired: document.body.innerText.includes('로그인이 필요')
      };

      return results;
    });

    logger.log('\n=== 검색 결과 분석 ===');
    logger.log(JSON.stringify(pageInfo, null, 2));

    // 결과 판정
    logger.log('\n=== 결과 판정 ===');
    if (pageInfo.hasCaptcha) {
      logger.log('❌ 캡챠/봇 감지됨!');
    } else if (pageInfo.hasError) {
      logger.log('❌ 에러 발생');
    } else if (pageInfo.loginRequired) {
      logger.log('⚠️ 로그인 요청됨');
    } else if (pageInfo.hasSearchTerm) {
      logger.log('✅ 정상 검색 결과 표시됨');
      if (pageInfo.shoppingSection) {
        logger.log('✅ 쇼핑 섹션 표시됨');
      }
    } else {
      logger.log('⚠️ 검색어가 결과에 없음 - 확인 필요');
    }

    // 30초 대기 (결과 확인용)
    logger.log('\n30초 대기...');
    await page.waitForTimeout(30000);

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
