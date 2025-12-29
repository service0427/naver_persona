/**
 * 최근 검색어 추출 테스트
 */

import { chromium } from 'patchright';
import path from 'path';
import { toContextOptions, applyDeviceSettings } from '../lib/devices/s23plus-real.js';
import { getRecentSearchesWithClick } from '../lib/utils/search-helper.js';

const THREAD_ID = 0;
const PROFILE_DIR = path.resolve(`./data/profiles/thread-${THREAD_ID}`);

async function main() {
  console.log('=== 최근 검색어 추출 테스트 ===\n');

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: ['--remote-debugging-port=9222', '--no-sandbox'],
    ...toContextOptions()
  });

  await applyDeviceSettings(context);
  const page = await context.newPage();

  try {
    // m.naver.com 접속
    console.log('[1] m.naver.com 접속...');
    await page.goto('https://m.naver.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // 검색창 클릭 후 최근 검색어 추출
    console.log('[2] 검색창 클릭 및 최근 검색어 추출...\n');
    const recentSearches = await getRecentSearchesWithClick(page);

    console.log('=== 최근 검색어 목록 ===');
    if (recentSearches.length === 0) {
      console.log('(최근 검색어 없음)');
    } else {
      recentSearches.forEach((item, i) => {
        console.log(`${i + 1}. "${item.query}" (rank: ${item.rank}, date: ${item.date})`);
      });
    }

    console.log(`\n총 ${recentSearches.length}개의 최근 검색어 발견`);

    // 5초 대기
    await page.waitForTimeout(5000);

  } finally {
    await context.close();
    console.log('\n종료');
  }
}

main().catch(console.error);
