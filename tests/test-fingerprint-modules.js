/**
 * Fingerprint 모듈 검수 테스트
 *
 * 테스트 항목:
 * 1. 모든 fingerprint 모듈 로드 확인
 * 2. 각 모듈별 위조 동작 확인
 * 3. 네이버 접속 테스트
 */

import { createContext } from '../lib/index.js';

async function runTest() {
  console.log('=== Fingerprint 모듈 검수 시작 ===\n');

  const { context, page, humanSimulator } = await createContext({ threadId: 99 });

  try {
    // 1. 테스트 페이지로 이동
    console.log('[1] 테스트 페이지 로드...');
    await page.goto('about:blank');

    // 2. Fingerprint 모듈 로드 확인
    console.log('[2] Fingerprint 모듈 로드 상태 확인...');
    const fpStatus = await page.evaluate(() => {
      return {
        fingerprint_spoofed: window.__FINGERPRINT_SPOOFED__ === true,
        fp_modules_loaded: window.__FP_MODULES_LOADED__ === true,
        fp_modules_version: window.__FP_MODULES_VERSION__ || 'N/A'
      };
    });
    console.log('   - __FINGERPRINT_SPOOFED__:', fpStatus.fingerprint_spoofed ? '✓' : '✗');
    console.log('   - __FP_MODULES_LOADED__:', fpStatus.fp_modules_loaded ? '✓' : '✗');
    console.log('   - __FP_MODULES_VERSION__:', fpStatus.fp_modules_version);

    // 3. Navigator 속성 확인
    console.log('\n[3] Navigator 속성 확인...');
    const navProps = await page.evaluate(() => ({
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory,
      maxTouchPoints: navigator.maxTouchPoints,
      webdriver: navigator.webdriver,
      languages: navigator.languages
    }));
    console.log('   - platform:', navProps.platform, navProps.platform === 'Linux armv8l' ? '✓' : '✗');
    console.log('   - hardwareConcurrency:', navProps.hardwareConcurrency);
    console.log('   - deviceMemory:', navProps.deviceMemory);
    console.log('   - maxTouchPoints:', navProps.maxTouchPoints);
    console.log('   - webdriver:', navProps.webdriver, navProps.webdriver === false ? '✓' : '✗');
    console.log('   - languages:', navProps.languages);

    // 4. Screen 속성 확인
    console.log('\n[4] Screen 속성 확인...');
    const screenProps = await page.evaluate(() => ({
      width: screen.width,
      height: screen.height,
      colorDepth: screen.colorDepth
    }));
    console.log('   - width:', screenProps.width, screenProps.width === 1080 ? '✓' : '✗');
    console.log('   - height:', screenProps.height, screenProps.height === 2340 ? '✓' : '✗');
    console.log('   - colorDepth:', screenProps.colorDepth);

    // 5. WebGL 확인
    console.log('\n[5] WebGL 속성 확인...');
    const webglInfo = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl');
      if (!gl) return { error: 'WebGL not supported' };

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (!debugInfo) return { error: 'WEBGL_debug_renderer_info not available' };

      return {
        vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
        renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      };
    });
    console.log('   - vendor:', webglInfo.vendor, webglInfo.vendor === 'Qualcomm' ? '✓' : '');
    console.log('   - renderer:', webglInfo.renderer, webglInfo.renderer?.includes('Adreno') ? '✓' : '');

    // 6. Touch 지원 확인
    console.log('\n[6] Touch 지원 확인...');
    const touchInfo = await page.evaluate(() => ({
      ontouchstart: 'ontouchstart' in window,
      maxTouchPoints: navigator.maxTouchPoints,
      pointerCoarse: window.matchMedia('(pointer: coarse)').matches,
      hoverNone: window.matchMedia('(hover: none)').matches
    }));
    console.log('   - ontouchstart in window:', touchInfo.ontouchstart ? '✓' : '✗');
    console.log('   - maxTouchPoints:', touchInfo.maxTouchPoints);
    console.log('   - pointer: coarse:', touchInfo.pointerCoarse ? '✓' : '✗');
    console.log('   - hover: none:', touchInfo.hoverNone ? '✓' : '✗');

    // 7. Performance.now() 정밀도 확인
    console.log('\n[7] Performance.now() 정밀도 확인...');
    const perfTest = await page.evaluate(() => {
      const samples = [];
      for (let i = 0; i < 10; i++) {
        samples.push(performance.now());
      }
      // 소수점 자릿수 확인
      const decimals = samples.map(s => {
        const str = s.toString();
        const dotIndex = str.indexOf('.');
        return dotIndex === -1 ? 0 : str.length - dotIndex - 1;
      });
      return {
        samples: samples.slice(0, 3),
        maxDecimals: Math.max(...decimals)
      };
    });
    console.log('   - 샘플값:', perfTest.samples.map(s => s.toFixed(2)).join(', '));
    console.log('   - 최대 소수점:', perfTest.maxDecimals, perfTest.maxDecimals <= 1 ? '✓ (0.1ms 정밀도)' : '✗');

    // 8. Battery API 확인
    console.log('\n[8] Battery API 확인...');
    const batteryInfo = await page.evaluate(async () => {
      try {
        const battery = await navigator.getBattery();
        return {
          level: battery.level,
          charging: battery.charging,
          chargingTime: battery.chargingTime,
          dischargingTime: battery.dischargingTime
        };
      } catch (e) {
        return { error: e.message };
      }
    });
    if (batteryInfo.error) {
      console.log('   - Error:', batteryInfo.error);
    } else {
      console.log('   - level:', (batteryInfo.level * 100).toFixed(0) + '%');
      console.log('   - charging:', batteryInfo.charging);
    }

    // 9. Canvas Fingerprint 테스트
    console.log('\n[9] Canvas Fingerprint 노이즈 확인...');
    const canvasTest = await page.evaluate(() => {
      // 같은 canvas를 두 번 그려서 결과 비교
      function drawCanvas() {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 50;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'red';
        ctx.fillRect(10, 10, 50, 50);
        ctx.fillStyle = 'blue';
        ctx.font = '14px Arial';
        ctx.fillText('Fingerprint Test', 60, 30);
        return canvas.toDataURL();
      }

      const result1 = drawCanvas();
      const result2 = drawCanvas();

      return {
        consistent: result1 === result2,
        length: result1.length
      };
    });
    console.log('   - 일관성 유지:', canvasTest.consistent ? '✓ (같은 세션 내 동일)' : '✗');
    console.log('   - DataURL 길이:', canvasTest.length);

    // 10. HumanSimulator 확인
    console.log('\n[10] HumanSimulator 바인딩 확인...');
    const humanMethods = {
      humanType: typeof page.humanType === 'function',
      humanClick: typeof page.humanClick === 'function',
      humanScroll: typeof page.humanScroll === 'function',
      readingScroll: typeof page.readingScroll === 'function'
    };
    console.log('   - humanType:', humanMethods.humanType ? '✓' : '✗');
    console.log('   - humanClick:', humanMethods.humanClick ? '✓' : '✗');
    console.log('   - humanScroll:', humanMethods.humanScroll ? '✓' : '✗');
    console.log('   - readingScroll:', humanMethods.readingScroll ? '✓' : '✗');

    // 11. 네이버 접속 테스트
    console.log('\n[11] 네이버 접속 테스트...');
    await page.goto('https://www.naver.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

    const naverTest = await page.evaluate(() => ({
      title: document.title,
      url: location.href,
      hasSearchBox: !!document.querySelector('#query, input[name="query"]')
    }));
    console.log('   - 페이지 로드:', naverTest.title ? '✓' : '✗');
    console.log('   - URL:', naverTest.url);
    console.log('   - 검색창 존재:', naverTest.hasSearchBox ? '✓' : '✗');

    // 잠시 대기 후 WTM 요청 확인
    await page.waitForTimeout(3000);

    console.log('\n=== 검수 완료 ===');
    console.log('브라우저는 30초간 유지됩니다. AnyDesk로 확인하세요.');

    // 30초 대기 (수동 확인용)
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('테스트 중 오류 발생:', error.message);
  } finally {
    await context.close();
  }
}

runTest().catch(console.error);
