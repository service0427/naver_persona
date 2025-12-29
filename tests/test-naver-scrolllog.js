/**
 * 네이버 검색 결과 ScrollLog 테스트
 *
 * 검색 결과 페이지에서 스크롤 시 발생하는 ScrollLog 캡처 및 분석
 *
 * ⚠️ 주의: 반드시 VPN 네임스페이스 내에서 실행!
 * 실행: ip netns exec {namespace} DISPLAY=:0 node tests/test-naver-scrolllog.js
 */

import { chromium } from 'patchright';
import {
  naturalScroll,
  flingScroll,
  delay,
  randomBetween,
} from '../lib/human/index.js';
import { S23_PLUS_REAL, toContextOptions } from '../lib/devices/s23plus-real.js';

const SEARCH_QUERY = '아이폰16 케이스';

async function testNaverScrollLog() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        네이버 검색 ScrollLog 테스트                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--remote-debugging-port=9222'],
  });

  // Galaxy S23+ 에뮬레이션
  const contextOptions = toContextOptions(S23_PLUS_REAL);
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  // ScrollLog 요청 캡처
  const scrollLogs = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('scrolllog')) {
      try {
        const urlObj = new URL(url);
        const slogs = urlObj.searchParams.get('slogs');
        if (slogs) {
          const parsed = JSON.parse(slogs);
          scrollLogs.push(...(Array.isArray(parsed) ? parsed : [parsed]));
          console.log(`\n📡 ScrollLog 캡처됨 (type: ${parsed[0]?.t || 'unknown'})`);
        }
      } catch (e) {
        // ignore parse errors
      }
    }
  });

  try {
    // 1. 네이버 메인 접속
    console.log('1️⃣ 네이버 메인 접속...');
    await page.goto('https://m.naver.com', { waitUntil: 'domcontentloaded' });
    await delay(2000);

    // 2. 메인에서 간단한 스크롤 (ScrollLog 없음 확인)
    console.log('\n2️⃣ 메인 페이지 스크롤 (ScrollLog 없어야 함)...');
    const logsBeforeSearch = scrollLogs.length;
    await flingScroll(page, 500);
    await delay(1000);
    await flingScroll(page, -300);
    await delay(1000);

    console.log(`   메인 페이지 ScrollLog 수: ${scrollLogs.length - logsBeforeSearch}`);
    if (scrollLogs.length - logsBeforeSearch === 0) {
      console.log('   ✅ 메인 페이지에서는 ScrollLog 없음 (정상)');
    } else {
      console.log('   ⚠️ 메인 페이지에서도 ScrollLog 발생');
    }

    // 3. 검색창 클릭 및 검색
    console.log(`\n3️⃣ 검색: "${SEARCH_QUERY}"...`);
    const searchBox = page.locator('#MM_SEARCH_FAKE');
    await searchBox.click();
    await delay(500);

    // 검색어 입력
    const searchInput = page.locator('input[name="query"]');
    await searchInput.fill(SEARCH_QUERY);
    await delay(300);

    // 검색 실행
    await page.keyboard.press('Enter');
    await page.waitForLoadState('domcontentloaded');
    await delay(3000);

    console.log('   검색 결과 페이지 로드 완료');

    // 4. 검색 결과에서 스크롤 (ScrollLog 필수)
    console.log('\n4️⃣ 검색 결과 스크롤 (ScrollLog 캡처 중)...');
    const logsBeforeScroll = scrollLogs.length;

    // 첫 번째 스크롤 (아래로)
    console.log('   → 1차 스크롤: 1000px 아래로');
    await flingScroll(page, 1000);
    await delay(2000);

    // 두 번째 스크롤 (아래로)
    console.log('   → 2차 스크롤: 1500px 아래로');
    await flingScroll(page, 1500);
    await delay(2000);

    // 세 번째 스크롤 (위로)
    console.log('   → 3차 스크롤: 800px 위로');
    await flingScroll(page, -800);
    await delay(2000);

    // 5. ScrollLog 분석
    console.log('\n' + '═'.repeat(60));
    console.log('📊 ScrollLog 분석 결과');
    console.log('═'.repeat(60));

    const searchScrollLogs = scrollLogs.slice(logsBeforeScroll);
    console.log(`\n검색 결과 페이지 ScrollLog 수: ${searchScrollLogs.length}`);

    if (searchScrollLogs.length === 0) {
      console.log('❌ ScrollLog가 캡처되지 않음 - 봇 감지 가능성!');
    } else {
      console.log('✅ ScrollLog 정상 발생');

      // 이벤트 타입 분석
      const byType = {};
      searchScrollLogs.forEach(log => {
        byType[log.t] = (byType[log.t] || 0) + 1;
      });
      console.log('\n이벤트 타입:');
      Object.entries(byType).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}회`);
      });

      // Duration 분석 (scroll 이벤트)
      const scrollEvents = searchScrollLogs.filter(log => log.t === 'scroll');
      if (scrollEvents.length > 0) {
        console.log('\nScroll 이벤트 Duration:');
        scrollEvents.forEach((log, i) => {
          if (log.pt && typeof log.pt === 'string' && log.pt.includes(':')) {
            const [start, end] = log.pt.split(':').map(Number);
            const duration = end - start;
            console.log(`  [${i + 1}] ${duration}ms`);
          }
        });
      }

      // TSI 분석
      console.log('\nTSI (스크롤 누적):');
      searchScrollLogs.forEach((log, i) => {
        if (log.tsi) {
          const [docHeight, currentY, totalScroll] = log.tsi.split(':').map(Number);
          console.log(`  [${i + 1}] type:${log.t.padEnd(7)} Y:${String(currentY).padStart(5)} 누적:${String(totalScroll).padStart(5)}`);
        }
      });
    }

    // 6. 전체 로그 수 확인
    console.log('\n' + '═'.repeat(60));
    console.log('📋 전체 ScrollLog 요약');
    console.log('═'.repeat(60));
    console.log(`총 ScrollLog 이벤트: ${scrollLogs.length}개`);

    await delay(3000);
    console.log('\n✅ 테스트 완료!');

  } catch (error) {
    console.error('\n❌ 테스트 실패:', error);
  } finally {
    await context.close();
    await browser.close();
  }
}

// 실행 확인
console.log('⚠️  이 테스트는 네이버에 접속합니다.');
console.log('⚠️  반드시 VPN 네임스페이스 내에서 실행하세요!\n');
console.log('실행: ip netns exec {namespace} DISPLAY=:0 node tests/test-naver-scrolllog.js\n');

// 환경변수로 강제 실행 허용
if (process.env.FORCE_RUN === '1') {
  testNaverScrollLog().catch(console.error);
} else {
  console.log('테스트를 실행하려면 FORCE_RUN=1 환경변수를 설정하세요.');
  console.log('예: FORCE_RUN=1 ip netns exec vpn-test DISPLAY=:0 node tests/test-naver-scrolllog.js');
}
