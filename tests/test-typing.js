#!/usr/bin/env node
/**
 * 타이핑 패턴 테스트
 * page.type() vs page.fill() 자동완성 API 호출 비교
 */

import { createContext } from './lib/core/browser-launcher.js';

const SEARCH_TERM = '아이간식 달빛기정떡';

async function main() {
  const { context, page } = await createContext({ threadId: 0 });

  const acRequests = [];

  // 자동완성 API 요청 감시
  page.on('request', req => {
    if (req.url().includes('mac.search.naver.com/mobile/ac')) {
      const url = new URL(req.url());
      const q = url.searchParams.get('q');
      acRequests.push({ time: Date.now(), q });
      console.log(`AC 요청: "${q}"`);
    }
  });

  try {
    // 1. 네이버 접속
    console.log('\n[1] m.naver.com 접속...');
    await page.goto('https://m.naver.com', { waitUntil: 'load' });
    await page.waitForTimeout(1000);

    // 2. 검색창 클릭
    console.log('\n[2] 검색창 클릭...');
    await page.click('#MM_SEARCH_FAKE');
    await page.waitForTimeout(500);

    // 3. page.type()으로 한 글자씩 입력 (delay 포함)
    console.log(`\n[3] 타이핑 시작: "${SEARCH_TERM}" (delay: 200ms)`);
    await page.type('#query', SEARCH_TERM, { delay: 200 });

    await page.waitForTimeout(1000);

    // 4. 결과 출력
    console.log('\n=== 자동완성 요청 총', acRequests.length, '개 ===');
    acRequests.forEach((r, i) => console.log(i, r.q));

  } finally {
    await context.close();
  }
}

main().catch(console.error);
