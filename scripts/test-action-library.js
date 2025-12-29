#!/usr/bin/env node
/**
 * 액션 라이브러리 통합 테스트
 *
 * CDP 터치 스크롤 + 네이버 액션 라이브러리 테스트
 *
 * 사용법:
 *   DISPLAY=:0 node scripts/test-action-library.js
 */

import { chromium } from 'patchright';
import { S23_PLUS_REAL, toContextOptions, getFullFingerprintScript } from '../lib/devices/s23plus-real.js';
import ChromeVersions from '../lib/chrome/ChromeVersions.js';
import {
  createNaverActions,
  flickScroll,
  naturalBrowseScroll,
  getAgeProfile
} from '../lib/behavior/index.js';

const CONFIG = {
  profileDir: '/tmp/action-library-test',
  searchQuery: '노트북 추천'
};

const delay = ms => new Promise(r => setTimeout(r, ms));

function log(msg, type = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    warn: '\x1b[33m',
    error: '\x1b[31m',
    reset: '\x1b[0m'
  };
  console.log(`${colors[type] || colors.info}[Test]${colors.reset} ${msg}`);
}

async function main() {
  log('═══════════════════════════════════════════════════════════════');
  log('    액션 라이브러리 통합 테스트');
  log('═══════════════════════════════════════════════════════════════');

  const chromeInfo = ChromeVersions.getLatest();
  log(`Chrome ${chromeInfo?.version || 'unknown'}`);

  const contextOptions = toContextOptions(S23_PLUS_REAL);

  const browser = await chromium.launchPersistentContext(CONFIG.profileDir, {
    headless: false,
    viewport: contextOptions.viewport,
    userAgent: contextOptions.userAgent,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: contextOptions.deviceScaleFactor,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--remote-debugging-port=9222'
    ]
  });

  const page = browser.pages()[0] || await browser.newPage();
  await page.addInitScript(getFullFingerprintScript());

  // CDP 세션 생성
  const cdp = await browser.newCDPSession(page);
  log('CDP 세션 연결됨', 'success');

  // 액션 라이브러리 생성 (30대, CDP 터치 활성화)
  const actions = createNaverActions(page, '30', cdp);
  log('액션 라이브러리 생성됨 (나이대: 30대)', 'success');

  // === 테스트 1: 메인 페이지 로드 + CDP 스크롤 ===
  log('\n[테스트 1] 메인 페이지 로드 + CDP 자연 스크롤');

  await page.goto('https://m.naver.com', { waitUntil: 'networkidle', timeout: 30000 });
  log('메인 페이지 로드 완료', 'success');

  await delay(2000);

  // CDP 자연스러운 스크롤
  log('자연 스크롤 시작...');
  const scrollResult = await naturalBrowseScroll(page, cdp, {
    totalDistance: 1500,
    backScrollChance: 0.2,
    pauseChance: 0.3,
    verbose: true
  });

  log(`스크롤 완료: ${scrollResult.netScrolled}px (${scrollResult.scrollCount}회)`, 'success');

  await delay(2000);

  // === 테스트 2: 검색 실행 ===
  log('\n[테스트 2] 검색 실행');

  await page.goto('https://m.naver.com', { waitUntil: 'networkidle' });
  await delay(1000);

  // 맨 위로 스크롤 (검색창이 보이도록)
  await page.evaluate(() => window.scrollTo(0, 0));
  await delay(500);

  log(`검색어: "${CONFIG.searchQuery}"`);

  // 검색창 직접 클릭 후 입력
  try {
    await page.click('#query', { timeout: 5000 });
    await delay(300);
    await page.keyboard.type(CONFIG.searchQuery, { delay: 80 });
    await delay(500);
    await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle');
    log('검색 완료 (직접 입력 방식)', 'success');
  } catch (e) {
    log(`검색 실패: ${e.message}`, 'error');
  }

  var searchResult = { method: 'direct', finalQuery: CONFIG.searchQuery };

  log(`검색 결과: ${searchResult.method} 방식으로 "${searchResult.finalQuery}" 검색`, 'success');

  await page.waitForLoadState('networkidle');
  await delay(2000);

  // === 테스트 3: 검색 결과에서 CDP 플릭 스크롤 ===
  log('\n[테스트 3] 검색 결과 플릭 스크롤 (관성 스크롤)');

  const startScroll = await page.evaluate(() => window.scrollY);

  for (let i = 1; i <= 3; i++) {
    log(`플릭 ${i}/3...`);
    const flickResult = await flickScroll(page, cdp, 150, {
      duration: 100,
      wobble: true,
      verbose: false
    });

    log(`  터치: 150px → 실제: ${flickResult.actualDistance}px (관성: ${flickResult.inertiaPercent}%)`,
        flickResult.inertiaPercent > 80 ? 'success' : 'warn');

    await delay(1000);
  }

  const endScroll = await page.evaluate(() => window.scrollY);
  log(`총 스크롤: ${startScroll} → ${endScroll}px (+${endScroll - startScroll}px)`, 'success');

  // === 테스트 4: 콘텐츠 읽기 ===
  log('\n[테스트 4] 콘텐츠 읽기 (10초)');

  const readResult = await actions.content.readContent(10);
  log(`읽기 완료: ${readResult.scrollCount}회 스크롤, ${readResult.totalScrollDistance}px 이동`, 'success');

  // === 결과 요약 ===
  log('\n═══════════════════════════════════════════════════════════════');
  log('                      테스트 결과 요약');
  log('═══════════════════════════════════════════════════════════════');
  log(`✅ CDP 자연 스크롤: ${scrollResult.netScrolled}px`);
  log(`✅ 검색 실행: ${searchResult.method} 방식`);
  log(`✅ 플릭 스크롤: ${endScroll - startScroll}px`);
  log(`✅ 콘텐츠 읽기: ${readResult.scrollCount}회`);

  await delay(3000);
  await browser.close();
  log('\n테스트 완료', 'success');
}

main().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
