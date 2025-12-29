/**
 * 스크롤 패턴 비교 테스트
 *
 * HAR 파일에서 분석한 실제 사용자 패턴과
 * 구현된 휴먼 스크롤 라이브러리 비교
 *
 * ⚠️ 주의: 네이버 접속 시 반드시 VPN 네임스페이스 내에서 실행!
 * 실행: ip netns exec {namespace} DISPLAY=:0 node tests/test-scroll-comparison.js
 */

import { chromium } from 'patchright';
import {
  naturalScroll,
  flingScroll,
  delay,
  randomBetween,
} from '../lib/human/index.js';

// HAR 분석 결과 (실제 사용자 패턴)
const HAR_ANALYSIS = {
  // Scroll 이벤트 duration 통계
  scrollDuration: {
    min: 675,
    max: 3874,
    avg: 2646,
    samples: [3017, 3874, 3019, 675],
  },
  // TSI 변화량 (스크롤 거리)
  scrollDistances: [373, 1641, 944, -132, -2396, -301],
  // 이벤트 순서
  eventSequence: ['first', 'expand', 'expand', 'scroll', 'scroll', 'disable', 'first', 'scroll', 'scroll'],
};

// 테스트용 긴 페이지 HTML
function createLongPageHtml() {
  const sections = Array.from({ length: 20 }, (_, i) =>
    `<div class="section" style="
      height: 600px;
      background: hsl(${i * 18}, 70%, 85%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-family: sans-serif;
    ">Section ${i + 1}</div>`
  ).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Scroll Test</title>
      <style>
        body { margin: 0; }
        #scroll-info {
          position: fixed;
          top: 10px;
          right: 10px;
          background: rgba(0,0,0,0.8);
          color: white;
          padding: 10px;
          font-family: monospace;
          font-size: 12px;
          border-radius: 5px;
          z-index: 1000;
        }
      </style>
    </head>
    <body>
      <div id="scroll-info">
        Y: <span id="scrollY">0</span><br>
        누적: <span id="totalScroll">0</span>
      </div>
      ${sections}
      <script>
        let totalScroll = 0;
        let lastY = 0;
        window.addEventListener('scroll', () => {
          const currentY = window.scrollY;
          const delta = Math.abs(currentY - lastY);
          totalScroll += delta;
          lastY = currentY;
          document.getElementById('scrollY').textContent = Math.round(currentY);
          document.getElementById('totalScroll').textContent = Math.round(totalScroll);
        });
      </script>
    </body>
    </html>
  `;
}

async function testScrollPattern() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        스크롤 패턴 비교 테스트                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('📊 HAR 분석 결과 (실제 사용자 패턴):');
  console.log(`   Duration: min=${HAR_ANALYSIS.scrollDuration.min}ms, max=${HAR_ANALYSIS.scrollDuration.max}ms, avg=${HAR_ANALYSIS.scrollDuration.avg}ms`);
  console.log(`   스크롤 거리: ${HAR_ANALYSIS.scrollDistances.join(', ')}`);
  console.log('');

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--remote-debugging-port=9222'],
  });

  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },  // Galaxy S23+ 기준
  });

  try {
    await page.setContent(createLongPageHtml());
    await delay(500);

    console.log('📜 휴먼 스크롤 라이브러리 테스트:\n');

    // HAR에서 분석한 스크롤 거리와 유사하게 테스트
    const testDistances = [400, 1600, 900, -150, -2400, -300];
    const results = [];

    for (let i = 0; i < testDistances.length; i++) {
      const distance = testDistances[i];
      const startTime = Date.now();

      console.log(`   [${i + 1}] 스크롤 ${distance}px ${distance > 0 ? '아래로' : '위로'}...`);

      const result = await flingScroll(page, distance);

      results.push({
        targetDistance: distance,
        actualDistance: result.actualDistance,
        duration: result.duration,
        steps: result.steps,
      });

      console.log(`       → duration: ${result.duration}ms, steps: ${result.steps}, actual: ${result.actualDistance}px`);

      // 스크롤 사이 대기 (실제 사용자처럼)
      await delay(randomBetween(500, 1500));
    }

    // 결과 분석
    console.log('\n' + '═'.repeat(60));
    console.log('📊 결과 비교');
    console.log('═'.repeat(60));

    const durations = results.map(r => r.duration);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);

    console.log('\n구현 라이브러리:');
    console.log(`   Duration: min=${minDuration}ms, max=${maxDuration}ms, avg=${Math.round(avgDuration)}ms`);

    console.log('\nHAR 분석 (실제 사용자):');
    console.log(`   Duration: min=${HAR_ANALYSIS.scrollDuration.min}ms, max=${HAR_ANALYSIS.scrollDuration.max}ms, avg=${HAR_ANALYSIS.scrollDuration.avg}ms`);

    // 비교
    console.log('\n비교 결과:');
    const durationDiff = Math.abs(avgDuration - HAR_ANALYSIS.scrollDuration.avg);
    const durationMatch = durationDiff < 1000;
    console.log(`   Duration 차이: ${Math.round(durationDiff)}ms ${durationMatch ? '✅ (1초 이내)' : '⚠️ (조정 필요)'}`);

    // 조언
    if (!durationMatch) {
      console.log('\n💡 조정 권장:');
      if (avgDuration < HAR_ANALYSIS.scrollDuration.avg) {
        console.log('   - 스크롤 속도를 더 느리게 조정');
        console.log('   - FLING_CONFIG.DECELERATION.DECAY 값을 높이기 (0.85 → 0.90)');
      } else {
        console.log('   - 스크롤 속도를 더 빠르게 조정');
        console.log('   - FLING_CONFIG.DECELERATION.DECAY 값을 낮추기 (0.85 → 0.80)');
      }
    }

    console.log('\n📋 개별 스크롤 결과:');
    results.forEach((r, i) => {
      console.log(`   [${i + 1}] 목표: ${r.targetDistance}px → 실제: ${r.actualDistance}px, ${r.duration}ms, ${r.steps}단계`);
    });

    await delay(3000);
    console.log('\n✅ 테스트 완료!');

  } catch (error) {
    console.error('\n❌ 테스트 실패:', error);
  } finally {
    await browser.close();
  }
}

testScrollPattern().catch(console.error);
