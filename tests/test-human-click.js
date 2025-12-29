/**
 * 휴먼 클릭 라이브러리 테스트
 *
 * 실행: DISPLAY=:0 node tests/test-human-click.js
 */

import { chromium } from 'patchright';
import {
  clickNaturally,
  clickElementNaturally,
  moveMouseNaturally,
  delay,
  randomBetween,
} from '../lib/human/index.js';

async function testMouseMove() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🖱️ 마우스 이동 테스트');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage({
    viewport: { width: 800, height: 600 },
  });

  try {
    // 마우스 추적 페이지 생성
    await page.setContent(`
      <html>
        <head>
          <style>
            body {
              margin: 0;
              font-family: sans-serif;
              height: 100vh;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            #cursor-trail {
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              pointer-events: none;
            }
            .trail-dot {
              position: absolute;
              width: 8px;
              height: 8px;
              background: rgba(255, 255, 255, 0.8);
              border-radius: 50%;
              transform: translate(-50%, -50%);
            }
            #info {
              color: white;
              text-align: center;
              z-index: 10;
            }
            .target-box {
              width: 150px;
              height: 80px;
              background: white;
              border-radius: 10px;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              margin: 20px;
              transition: transform 0.2s;
            }
            .target-box:hover {
              transform: scale(1.05);
            }
            #targets {
              display: flex;
              flex-wrap: wrap;
              justify-content: center;
            }
          </style>
        </head>
        <body>
          <div id="cursor-trail"></div>
          <div id="info">
            <h1>🖱️ 마우스 이동 테스트</h1>
            <p>마우스 경로를 확인하세요</p>
          </div>
          <div id="targets">
            <div class="target-box" id="box1">Box 1</div>
            <div class="target-box" id="box2">Box 2</div>
            <div class="target-box" id="box3">Box 3</div>
          </div>
          <script>
            const trail = document.getElementById('cursor-trail');
            let dotCount = 0;
            document.addEventListener('mousemove', (e) => {
              if (dotCount > 100) {
                trail.firstChild?.remove();
                dotCount--;
              }
              const dot = document.createElement('div');
              dot.className = 'trail-dot';
              dot.style.left = e.clientX + 'px';
              dot.style.top = e.clientY + 'px';
              trail.appendChild(dot);
              dotCount++;
            });
          </script>
        </body>
      </html>
    `);

    console.log('1️⃣ 자연스러운 마우스 이동 테스트');

    // 여러 위치로 이동
    const positions = [
      { x: 200, y: 400 },
      { x: 600, y: 300 },
      { x: 400, y: 500 },
      { x: 100, y: 200 },
    ];

    for (const pos of positions) {
      console.log(`   → (${pos.x}, ${pos.y})로 이동`);
      await moveMouseNaturally(page, pos.x, pos.y);
      await delay(500);
    }

    console.log('   ✅ 이동 완료 (곡선 경로 확인)');

    await delay(2000);

  } catch (error) {
    console.error('❌ 테스트 실패:', error);
  } finally {
    await browser.close();
  }
}

async function testClick() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🖱️ 클릭 테스트');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage({
    viewport: { width: 800, height: 600 },
  });

  try {
    await page.setContent(`
      <html>
        <head>
          <style>
            body {
              margin: 0;
              font-family: sans-serif;
              height: 100vh;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              background: #1a1a2e;
            }
            .button {
              padding: 20px 40px;
              font-size: 18px;
              border: none;
              border-radius: 10px;
              cursor: pointer;
              margin: 15px;
              transition: all 0.3s;
            }
            #btn1 { background: #e94560; color: white; }
            #btn2 { background: #0f3460; color: white; }
            #btn3 { background: #16213e; color: white; border: 2px solid #e94560; }
            .button:hover { transform: scale(1.1); }
            .button.clicked { animation: pulse 0.5s; }
            @keyframes pulse {
              0% { transform: scale(1); }
              50% { transform: scale(0.95); }
              100% { transform: scale(1); }
            }
            #log {
              color: #eee;
              margin-top: 30px;
              font-size: 14px;
            }
            h1 { color: white; }
          </style>
        </head>
        <body>
          <h1>🖱️ 클릭 테스트</h1>
          <button class="button" id="btn1">Button 1</button>
          <button class="button" id="btn2">Button 2</button>
          <button class="button" id="btn3">Button 3</button>
          <div id="log"></div>
          <script>
            const log = document.getElementById('log');
            document.querySelectorAll('.button').forEach(btn => {
              btn.addEventListener('click', (e) => {
                btn.classList.add('clicked');
                setTimeout(() => btn.classList.remove('clicked'), 500);
                log.textContent = '클릭됨: ' + btn.id + ' at (' + e.clientX + ', ' + e.clientY + ')';
              });
            });
          </script>
        </body>
      </html>
    `);

    console.log('1️⃣ clickElementNaturally 테스트');

    const buttons = ['#btn1', '#btn2', '#btn3'];

    for (const selector of buttons) {
      console.log(`   → ${selector} 클릭`);
      await clickElementNaturally(page, selector, {
        logger: (msg) => console.log(`     ${msg}`),
      });
      await delay(1000);
    }

    console.log('   ✅ 클릭 완료');

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
  console.log('║         휴먼 클릭 라이브러리 테스트                     ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  await testMouseMove();
  await testClick();

  console.log('\n🎉 모든 테스트 완료!');
}

main().catch(console.error);
