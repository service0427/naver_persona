/**
 * 휴먼 스크롤 라이브러리 테스트
 *
 * 실행: DISPLAY=:0 node tests/test-human-scroll.js
 *
 * ⚠️ 주의: 네이버 접속 시 반드시 VPN 네임스페이스 내에서 실행!
 */

import { chromium } from 'patchright';
import {
  flingScroll,
  naturalScroll,
  scrollToElementNaturally,
  executeScrollSequence,
  SEARCH_RESULT_SCROLL_SEQUENCE,
  randomBetween,
  delay,
} from '../lib/human/index.js';

const TEST_URL = 'https://example.com';  // 안전한 테스트 URL

async function testBasicScroll() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📜 기본 스크롤 테스트');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },  // 모바일 뷰포트
  });

  try {
    // 긴 페이지 생성 (스크롤 테스트용)
    await page.setContent(`
      <html>
        <head>
          <style>
            body { margin: 0; font-family: sans-serif; }
            .section { height: 500px; display: flex; align-items: center; justify-content: center; font-size: 24px; }
            .section:nth-child(odd) { background: #f0f0f0; }
            .section:nth-child(even) { background: #e0e0e0; }
            #target { background: #4CAF50; color: white; }
          </style>
        </head>
        <body>
          <div class="section">Section 1</div>
          <div class="section">Section 2</div>
          <div class="section">Section 3</div>
          <div class="section" id="target">🎯 Target Section</div>
          <div class="section">Section 5</div>
          <div class="section">Section 6</div>
          <div class="section">Section 7</div>
          <div class="section">Section 8</div>
        </body>
      </html>
    `);

    console.log('1️⃣ flingScroll 테스트 (1500px 아래로)');
    const result1 = await flingScroll(page, 1500);
    console.log(`   ✅ 완료: ${result1.duration}ms, ${result1.steps}단계, ${result1.actualDistance}px`);

    await delay(1000);

    console.log('\n2️⃣ naturalScroll 테스트 (1000px 아래로)');
    const result2 = await naturalScroll(page, 1000);
    console.log(`   ✅ 완료: ${result2.duration}ms, ${result2.steps}단계`);

    await delay(1000);

    console.log('\n3️⃣ scrollToElementNaturally 테스트 (#target)');
    const scrolled = await scrollToElementNaturally(page, '#target', {
      logger: (msg) => console.log(`   ${msg}`),
    });
    console.log(`   ✅ 완료: ${scrolled ? '성공' : '실패'}`);

    await delay(2000);

    console.log('\n✅ 모든 테스트 완료!');

  } catch (error) {
    console.error('❌ 테스트 실패:', error);
  } finally {
    await browser.close();
  }
}

async function testScrollSequence() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📜 스크롤 시퀀스 테스트');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });

  try {
    // 매우 긴 페이지 생성
    const sections = Array.from({ length: 20 }, (_, i) =>
      `<div class="section" style="height: 600px; background: hsl(${i * 18}, 70%, 80%); display: flex; align-items: center; justify-content: center; font-size: 24px;">Section ${i + 1}</div>`
    ).join('');

    await page.setContent(`
      <html>
        <head>
          <style>
            body { margin: 0; font-family: sans-serif; }
          </style>
        </head>
        <body>${sections}</body>
      </html>
    `);

    console.log('📜 검색 결과 스크롤 시퀀스 실행\n');

    await executeScrollSequence(page, SEARCH_RESULT_SCROLL_SEQUENCE, (msg) => {
      console.log(`   ${msg}`);
    });

    console.log('\n✅ 시퀀스 완료!');

    await delay(2000);

  } catch (error) {
    console.error('❌ 테스트 실패:', error);
  } finally {
    await browser.close();
  }
}

// 메인 실행
async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║         휴먼 스크롤 라이브러리 테스트                   ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  await testBasicScroll();
  await testScrollSequence();

  console.log('\n🎉 모든 테스트 완료!');
}

main().catch(console.error);
