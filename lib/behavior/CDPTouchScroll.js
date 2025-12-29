/**
 * CDPTouchScroll - CDP 기반 리얼 터치 스크롤
 *
 * Chrome DevTools Protocol을 사용하여 브라우저 레벨에서
 * 진짜 터치 이벤트를 발생시킴.
 *
 * 검증 완료 (2024-12-29):
 * - CDP 터치가 네이버 scrolllog/v2에 정상 기록됨
 * - 관성 스크롤이 검색 결과 페이지에서 작동 (1:10~12 배율)
 * - X축 흔들림 5~15px로 가로 스크롤 방지
 *
 * 실제 S23+ 측정 데이터 기반:
 * - 터치 시간: 68~134ms (평균 ~100ms)
 * - 터치 이동: 16~186px
 * - 관성 이동: 630~5230px
 * - 관성 비중: 89~99%
 * - 이벤트 빈도: 38~98 Hz (평균 ~75Hz)
 */

/**
 * 딜레이 유틸리티
 */
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * 터치 포인트 생성
 */
function createTouchPoint(x, y) {
  return {
    x,
    y,
    radiusX: 11.5,
    radiusY: 11.5,
    force: 1.0,
    id: 0
  };
}

/**
 * 플릭 스크롤 (관성 스크롤 유도)
 *
 * @param {Page} page - Playwright 페이지
 * @param {CDPSession} cdp - CDP 세션
 * @param {number} touchDist - 터치 이동 거리 (px)
 * @param {Object} options - 옵션
 * @returns {Object} 결과
 */
export async function flickScroll(page, cdp, touchDist = 150, options = {}) {
  const {
    startX = null,
    startY = null,
    duration = 100,       // 80~130ms 권장
    wobble = true,        // X축 흔들림
    verbose = false
  } = options;

  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    scrollY: window.scrollY,
    maxScroll: document.body.scrollHeight - window.innerHeight
  }));

  // 시작점 (화면 중앙~하단)
  const x = startX ?? Math.floor(viewport.width / 2) + Math.floor(Math.random() * 20 - 10);
  const y = startY ?? Math.floor(viewport.height * 0.65) + Math.floor(Math.random() * 30 - 15);

  const startScrollY = viewport.scrollY;

  // === 1. Touch Start ===
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [createTouchPoint(x, y)],
    modifiers: 0
  });

  // === 2. Touch Move (sextic ease-in 가속) ===
  const frameInterval = 13;  // ~75Hz
  const steps = Math.max(5, Math.floor(duration / frameInterval));
  const targetY = y - touchDist;

  // X축 흔들림: 5~15px (가로 스크롤 방지)
  const wobbleRange = wobble ? (5 + Math.random() * 10) : 0;

  let currentX = x;
  let currentY = y;

  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;

    // sextic ease-in: 끝으로 갈수록 급격히 가속
    const easedProgress = Math.pow(progress, 6);
    currentY = y + (targetY - y) * easedProgress;

    // 최소한의 X축 흔들림
    if (wobble && wobbleRange > 0) {
      const sineWobble = Math.sin(progress * Math.PI) * wobbleRange * 0.5;
      const randomNoise = (Math.random() - 0.5) * 3;
      currentX = x + sineWobble + randomNoise;
    }

    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [createTouchPoint(currentX, currentY)],
      modifiers: 0
    });

    // 불규칙한 간격 (실제 기기 시뮬레이션)
    const jitter = Math.floor(Math.random() * 10 - 5);
    await delay(Math.max(8, frameInterval + jitter));
  }

  // === 3. Touch End (플릭: 빠르게 떼기) ===
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
    modifiers: 0
  });

  // === 4. 관성 스크롤 대기 ===
  await delay(1000);

  // 결과 측정
  const endScrollY = await page.evaluate(() => window.scrollY);
  const actualDistance = endScrollY - startScrollY;
  const inertiaDistance = actualDistance - touchDist;
  const inertiaPercent = actualDistance > 0
    ? Math.round(inertiaDistance / actualDistance * 100)
    : 0;

  if (verbose) {
    console.log(`[플릭] ${startScrollY} → ${endScrollY}px (터치: ${touchDist}px, 관성: ${inertiaPercent}%)`);
  }

  return {
    startScrollY,
    endScrollY,
    actualDistance,
    touchDistance: touchDist,
    inertiaDistance,
    inertiaPercent
  };
}

/**
 * 드래그 스크롤 (관성 없이 정밀 이동)
 *
 * @param {Page} page - Playwright 페이지
 * @param {CDPSession} cdp - CDP 세션
 * @param {number} distance - 스크롤 거리 (px)
 * @param {Object} options - 옵션
 */
export async function dragScroll(page, cdp, distance = 200, options = {}) {
  const {
    startX = null,
    startY = null,
    duration = 400,    // 드래그는 천천히
    verbose = false
  } = options;

  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    scrollY: window.scrollY
  }));

  const x = startX ?? Math.floor(viewport.width / 2);
  const y = startY ?? Math.floor(viewport.height * 0.6);
  const startScrollY = viewport.scrollY;

  // Touch Start
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [createTouchPoint(x, y)],
    modifiers: 0
  });

  // Touch Move (linear)
  const steps = 10;
  const targetY = y - distance;

  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;
    const currentY = y + (targetY - y) * progress;
    const wobbleX = x + (Math.random() - 0.5) * 6;

    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [createTouchPoint(wobbleX, currentY)],
      modifiers: 0
    });

    await delay(duration / steps);
  }

  // Touch End (잠시 멈춘 후 떼기 - 관성 방지)
  await delay(50);

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
    modifiers: 0
  });

  await delay(200);

  const endScrollY = await page.evaluate(() => window.scrollY);

  if (verbose) {
    console.log(`[드래그] ${startScrollY} → ${endScrollY}px (요청: ${distance}px)`);
  }

  return {
    startScrollY,
    endScrollY,
    actualDistance: endScrollY - startScrollY
  };
}

/**
 * 위로 스크롤 (살짝)
 */
export async function scrollUp(page, cdp, distance = 100, options = {}) {
  const { verbose = false } = options;

  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    scrollY: window.scrollY
  }));

  const startX = Math.floor(viewport.width / 2);
  const startY = Math.floor(viewport.height * 0.3);
  const startScrollY = viewport.scrollY;

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [createTouchPoint(startX, startY)],
    modifiers: 0
  });

  for (let i = 1; i <= 5; i++) {
    const progress = i / 5;
    const currentY = startY + distance * Math.pow(progress, 4);
    const wobbleX = startX + (Math.random() - 0.5) * 10;

    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [createTouchPoint(wobbleX, currentY)],
      modifiers: 0
    });
    await delay(15);
  }

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
    modifiers: 0
  });

  await delay(500);

  const endScrollY = await page.evaluate(() => window.scrollY);

  if (verbose) {
    console.log(`[위로] ${startScrollY} → ${endScrollY}px`);
  }

  return {
    startScrollY,
    endScrollY,
    actualDistance: endScrollY - startScrollY
  };
}

/**
 * 자연스러운 브라우징 스크롤
 *
 * 실제 사용자 패턴:
 * - 아래로 스크롤 → 콘텐츠 읽기 → 가끔 위로 복귀
 * - 멈춤 시간이 불규칙
 *
 * @param {Page} page - Playwright 페이지
 * @param {CDPSession} cdp - CDP 세션
 * @param {Object} options - 옵션
 */
export async function naturalBrowseScroll(page, cdp, options = {}) {
  const {
    totalDistance = 3000,     // 목표 총 이동 거리
    backScrollChance = 0.2,   // 위로 스크롤 확률 (20%)
    pauseChance = 0.3,        // 콘텐츠 읽기 멈춤 확률 (30%)
    verbose = false
  } = options;

  const startScroll = await page.evaluate(() => window.scrollY);
  let netScrolled = 0;
  let scrollCount = 0;

  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }));

  while (Math.abs(netScrolled) < totalDistance) {
    scrollCount++;

    // 스크롤 방향 결정
    const goBack = Math.random() < backScrollChance && netScrolled > 500;

    // 스크롤 거리/시작점 결정
    let touchDist, startY;
    if (goBack) {
      // 위로 스크롤 (살짝만)
      touchDist = 50 + Math.floor(Math.random() * 80);
      startY = Math.floor(viewport.height * 0.3) + Math.floor(Math.random() * 50);
    } else {
      // 아래로 스크롤
      touchDist = 100 + Math.floor(Math.random() * 100);
      startY = Math.floor(viewport.height * 0.65) + Math.floor(Math.random() * 30);
    }

    const duration = 80 + Math.floor(Math.random() * 50);
    const startX = Math.floor(viewport.width / 2) + Math.floor(Math.random() * 30 - 15);
    const direction = goBack ? 1 : -1;
    const targetY = startY + direction * touchDist;

    // 터치 시작
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [createTouchPoint(startX, startY)],
      modifiers: 0
    });

    // 터치 이동 (ease-in 가속)
    const steps = 6;
    const wobbleRange = 3 + Math.random() * 5;  // 최소 흔들림

    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;
      const eased = Math.pow(progress, 5);
      const currentY = startY + (targetY - startY) * eased;
      const wobbleX = startX + Math.sin(progress * Math.PI) * wobbleRange + (Math.random() - 0.5) * 2;

      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [createTouchPoint(wobbleX, currentY)],
        modifiers: 0
      });
      await delay(duration / steps);
    }

    // 터치 종료
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
      modifiers: 0
    });

    // 관성 대기
    await delay(600 + Math.floor(Math.random() * 400));

    // 결과 측정
    const currentScroll = await page.evaluate(() => window.scrollY);
    const moved = currentScroll - startScroll - netScrolled;
    netScrolled = currentScroll - startScroll;

    if (verbose) {
      const dirStr = goBack ? '↑' : '↓';
      console.log(`  #${scrollCount} ${dirStr}: ${moved > 0 ? '+' : ''}${moved}px → 총 ${netScrolled}px`);
    }

    // 페이지 끝 체크
    if (Math.abs(moved) < 20 && !goBack) {
      if (verbose) console.log(`  페이지 끝 도달`);
      break;
    }

    // 랜덤 멈춤 (콘텐츠 읽는 척)
    if (Math.random() < pauseChance && !goBack) {
      const pauseTime = 800 + Math.floor(Math.random() * 1500);
      await delay(pauseTime);
    } else {
      await delay(300 + Math.floor(Math.random() * 400));
    }
  }

  const endScroll = await page.evaluate(() => window.scrollY);

  return {
    startScroll,
    endScroll,
    netScrolled: endScroll - startScroll,
    scrollCount
  };
}

/**
 * 연속 플릭 스크롤 (피드 탐색용)
 *
 * @param {Page} page - Playwright 페이지
 * @param {CDPSession} cdp - CDP 세션
 * @param {Object} options - 옵션
 */
export async function multiFlickScroll(page, cdp, options = {}) {
  const {
    totalDistance = 3000,
    touchDist = 120,          // 한 번 터치 거리
    duration = 100,
    pauseBetween = 800,       // 플릭 사이 휴식
    randomize = true,
    verbose = false
  } = options;

  const startScroll = await page.evaluate(() => window.scrollY);
  let totalScrolled = 0;
  let flickCount = 0;

  while (totalScrolled < totalDistance) {
    // 랜덤 변화
    const actualTouchDist = randomize
      ? touchDist + Math.floor(Math.random() * 60 - 30)
      : touchDist;

    const actualDuration = randomize
      ? duration + Math.floor(Math.random() * 40 - 20)
      : duration;

    const actualPause = randomize
      ? pauseBetween + Math.floor(Math.random() * 600 - 300)
      : pauseBetween;

    const result = await flickScroll(page, cdp, actualTouchDist, {
      duration: actualDuration,
      wobble: true,
      verbose: false
    });

    totalScrolled += result.actualDistance;
    flickCount++;

    if (verbose) {
      console.log(`  플릭 #${flickCount}: +${result.actualDistance}px (관성 ${result.inertiaPercent}%)`);
    }

    // 페이지 끝 체크
    if (result.actualDistance < 50) {
      if (verbose) console.log(`  페이지 끝 도달`);
      break;
    }

    await delay(actualPause);
  }

  const endScroll = await page.evaluate(() => window.scrollY);

  return {
    startScroll,
    endScroll,
    totalScrolled: endScroll - startScroll,
    flickCount
  };
}

/**
 * 터치 탭 (클릭 대체)
 *
 * @param {Page} page - Playwright 페이지
 * @param {CDPSession} cdp - CDP 세션
 * @param {number} x - X 좌표
 * @param {number} y - Y 좌표
 * @param {Object} options - 옵션
 */
export async function touchTap(page, cdp, x, y, options = {}) {
  const {
    holdDuration = 50,    // 터치 유지 시간
    verbose = false
  } = options;

  if (verbose) {
    console.log(`[탭] (${x}, ${y})`);
  }

  // Touch Start
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [createTouchPoint(x, y)],
    modifiers: 0
  });

  await delay(holdDuration + Math.floor(Math.random() * 30));

  // Touch End
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
    modifiers: 0
  });

  await delay(100);

  return { x, y };
}

/**
 * 요소 위치로 터치 탭
 *
 * @param {Page} page - Playwright 페이지
 * @param {CDPSession} cdp - CDP 세션
 * @param {string} selector - CSS 셀렉터
 * @param {Object} options - 옵션
 */
export async function tapElement(page, cdp, selector, options = {}) {
  const {
    scrollIntoView = true,
    verbose = false
  } = options;

  const element = await page.$(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }

  // 뷰포트로 스크롤
  if (scrollIntoView) {
    await element.scrollIntoViewIfNeeded();
    await delay(300);
  }

  // 요소 위치 가져오기
  const box = await element.boundingBox();
  if (!box) {
    throw new Error(`Cannot get bounding box: ${selector}`);
  }

  // 중앙 약간 랜덤
  const x = box.x + box.width / 2 + (Math.random() - 0.5) * box.width * 0.3;
  const y = box.y + box.height / 2 + (Math.random() - 0.5) * box.height * 0.3;

  return touchTap(page, cdp, x, y, { verbose });
}

export default {
  flickScroll,
  dragScroll,
  scrollUp,
  naturalBrowseScroll,
  multiFlickScroll,
  touchTap,
  tapElement
};
