/**
 * 휴먼라이크 스크롤 라이브러리
 *
 * 봇 탐지 회피를 위한 자연스러운 스크롤 패턴 구현
 * - 관성 감속 (플링 스크롤)
 * - 60fps 기반 휠 이벤트
 * - 랜덤 지터로 기계적 패턴 회피
 *
 * @see docs/HUMAN-INTERACTION.md
 * @see docs/SCROLLLOG_ANALYSIS.md
 */

// ─────────────────────────────────────────────────────────────────
// 설정값
// ─────────────────────────────────────────────────────────────────

const FLING_CONFIG = {
  // 스크롤 속도 (px/s) - HAR 분석: 약 600-800 px/s
  SPEED: {
    MIN: 500,
    MAX: 900,
  },
  // 한 번 플링 거리 (px)
  DISTANCE: {
    MIN: 300,
    MAX: 2500,
  },
  // 관성 감속 설정 (HAR 분석: duration 평균 2646ms)
  DECELERATION: {
    INITIAL_MULTIPLIER: 1.2,  // 초기 속도 120%로 시작
    DECAY: 0.96,              // 매 프레임 96%로 감속 (더 천천히 감속)
    MIN_VELOCITY: 10,         // 이 이하면 정지 (더 낮게)
  },
  // 휠 이벤트 설정
  WHEEL: {
    FRAME_INTERVAL: 16,       // 60fps 기준 ~16ms
    INTERVAL_JITTER: 5,       // ±5ms 변동
  },
};

// ScrollLog 분석 기반 duration 설정
const DURATION_CONFIG = {
  MIN: 800,
  MAX: 2000,
  AVG: 1400,  // 가우시안 분포 중심
};

// ─────────────────────────────────────────────────────────────────
// 유틸리티 함수
// ─────────────────────────────────────────────────────────────────

/**
 * 랜덤 범위 값 생성
 */
function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 가우시안 랜덤 (더 자연스러운 분포)
 * Box-Muller 변환 사용
 */
function gaussianRandom(mean, stdDev) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

/**
 * 딜레이
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────
// 핵심 스크롤 함수
// ─────────────────────────────────────────────────────────────────

/**
 * 플링 스크롤 - 관성 감속 시뮬레이션
 *
 * 실제 모바일 기기의 플링(Fling) 스크롤 패턴을 시뮬레이션
 * - 처음에 빠르게 시작 → 점점 느려짐
 * - 60fps 프레임 기반 휠 이벤트
 * - 랜덤 지터로 기계적 패턴 회피
 *
 * @param {import('patchright').Page} page - Playwright/Patchright 페이지
 * @param {number} targetDistance - 목표 스크롤 거리 (양수: 아래로, 음수: 위로)
 * @param {Object} options - 옵션
 * @param {number} [options.speed] - 목표 속도 (px/s), 미지정시 랜덤
 * @returns {Promise<{duration: number, steps: number, actualDistance: number}>}
 */
async function flingScroll(page, targetDistance, options = {}) {
  const viewport = page.viewportSize();
  if (!viewport) return { duration: 0, steps: 0, actualDistance: 0 };

  // 마우스를 화면 중앙 근처로 이동 (약간의 랜덤)
  const centerX = viewport.width / 2 + randomBetween(-30, 30);
  const centerY = viewport.height / 2 + randomBetween(-50, 50);
  await page.mouse.move(centerX, centerY);

  const direction = targetDistance > 0 ? 1 : -1;
  const absDistance = Math.abs(targetDistance);

  // 목표 duration 계산 (HAR 분석 기반: 거리에 비례하여 600ms ~ 4000ms)
  // HAR 데이터: 373px→~1000ms, 1641px→~3000ms, 2396px→~3500ms
  const targetDuration = Math.min(4000, Math.max(600, absDistance * 1.5));

  // 프레임 수 계산
  const frameInterval = FLING_CONFIG.WHEEL.FRAME_INTERVAL;
  const totalFrames = Math.round(targetDuration / frameInterval);

  let scrolled = 0;
  let steps = 0;
  const startTime = Date.now();

  for (let frame = 0; frame < totalFrames && scrolled < absDistance; frame++) {
    // 진행률 (0 ~ 1)
    const progress = frame / totalFrames;

    // easeOutQuart: 처음에 빠르고 끝에서 천천히 (관성 감속 시뮬레이션)
    const easeProgress = 1 - Math.pow(1 - progress, 4);

    // 이번 프레임까지 도달해야 할 누적 거리
    const targetScrolled = absDistance * easeProgress;

    // 이번 프레임의 delta
    let delta = Math.round(targetScrolled - scrolled);

    // 최소 delta 보장
    if (delta < 1 && scrolled < absDistance) delta = 1;

    // 남은 거리보다 크면 조정
    const remaining = absDistance - scrolled;
    if (delta > remaining) delta = remaining;

    if (delta > 0) {
      // 휠 이벤트 발생
      await page.mouse.wheel(0, delta * direction);
      scrolled += delta;
      steps++;
    }

    // 프레임 대기 (랜덤 지터 포함)
    const jitteredInterval = frameInterval +
      randomBetween(-FLING_CONFIG.WHEEL.INTERVAL_JITTER, FLING_CONFIG.WHEEL.INTERVAL_JITTER);
    await delay(jitteredInterval);
  }

  // 남은 거리가 있으면 마지막에 처리
  if (scrolled < absDistance) {
    const remaining = absDistance - scrolled;
    await page.mouse.wheel(0, remaining * direction);
    scrolled += remaining;
    steps++;
  }

  return {
    duration: Date.now() - startTime,
    steps,
    actualDistance: scrolled
  };
}

/**
 * 자연스러운 스크롤 (flingScroll 래퍼)
 *
 * @param {import('patchright').Page} page - Playwright/Patchright 페이지
 * @param {number} distance - 스크롤 거리 (양수: 아래로, 음수: 위로)
 * @param {Object} options - 옵션
 * @param {number} [options.duration] - 목표 duration (미사용, 호환성용)
 * @param {boolean} [options.withPause] - 스크롤 후 짧은 멈춤 추가
 * @returns {Promise<{duration: number, steps: number}>}
 */
async function naturalScroll(page, distance, options = {}) {
  const result = await flingScroll(page, distance);

  // 스크롤 후 짧은 멈춤 (선택적)
  if (options.withPause) {
    await delay(randomBetween(200, 500));
  }

  return {
    duration: result.duration,
    steps: result.steps
  };
}

/**
 * 스크롤 시퀀스 실행
 *
 * @param {import('patchright').Page} page - 페이지
 * @param {Array} sequence - 스크롤 시퀀스 배열
 * @param {Function} [logger] - 로거 함수
 */
async function executeScrollSequence(page, sequence, logger = console.log) {
  for (const step of sequence) {
    const distance = randomBetween(step.distanceRange[0], step.distanceRange[1]);
    const delayMs = randomBetween(step.delayRange[0], step.delayRange[1]);

    logger(`[Scroll] ${step.name}: ${distance}px 스크롤`);
    await naturalScroll(page, distance);

    logger(`[Scroll] ${delayMs}ms 대기`);
    await delay(delayMs);
  }
}

// ─────────────────────────────────────────────────────────────────
// 타겟 요소로 스크롤
// ─────────────────────────────────────────────────────────────────

// 네이버 쇼핑 고정 헤더 높이
const STICKY_HEADER_HEIGHT = 72;

/**
 * 타겟 요소로 자연스럽게 스크롤
 *
 * 특정 요소(상품)를 화면에 보이게 하기 위해 자연스럽게 스크롤
 * - 여러 번의 작은 스크롤로 접근 (실제 사용자 패턴)
 * - 30% 확률로 "오버슈트" 패턴 사용 (타겟을 지나쳤다가 올라오기)
 * - 이미 화면에 보이더라도 "탐색하는 척" 미세 스크롤 수행
 *
 * @param {import('patchright').Page} page - 페이지
 * @param {string} nvMid - 네이버 상품 ID (nv_mid)
 * @param {Object} options - 옵션
 * @param {Function} [options.logger] - 로거
 * @returns {Promise<boolean>} 성공 여부
 */
async function scrollToProductNaturally(page, nvMid, options = {}) {
  const logger = options.logger || (() => {});
  const viewport = page.viewportSize();
  if (!viewport) return false;

  // 타겟 요소의 현재 위치 확인
  const targetRect = await page.evaluate((mid) => {
    // nv_mid 파라미터가 있는 링크 찾기
    const link = document.querySelector(`a[href*="nv_mid=${mid}"]`);
    if (!link) return null;

    const rect = link.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      centerY: rect.top + rect.height / 2,
    };
  }, nvMid);

  if (!targetRect) {
    logger(`[Scroll] 타겟 상품을 찾을 수 없음: ${nvMid}`);
    return false;
  }

  // 클릭 가능한 영역의 중앙 계산
  const visibleTop = STICKY_HEADER_HEIGHT;
  const visibleHeight = viewport.height - STICKY_HEADER_HEIGHT;
  const visibleCenter = visibleTop + visibleHeight / 2;

  // 약간의 랜덤 오프셋 (정확한 중앙 회피)
  const targetOffset = randomBetween(-60, 60);
  const desiredPosition = visibleCenter + targetOffset;

  // 스크롤 거리 계산
  const scrollDistance = targetRect.centerY - desiredPosition;

  logger(`[Scroll] 타겟 위치: ${Math.round(targetRect.centerY)}px, 목표: ${Math.round(desiredPosition)}px, 거리: ${Math.round(scrollDistance)}px`);

  // ─────────────────────────────────────────────
  // 패턴 1: 이미 화면에 보이는 경우 - 탐색하는 척
  // ─────────────────────────────────────────────
  if (Math.abs(scrollDistance) < 100) {
    logger(`[Scroll] 패턴 1: 이미 화면에 보임 - 탐색하는 척 스크롤`);

    // 위로 살짝 갔다가 다시 내려오는 패턴
    const exploreUp = randomBetween(150, 300);
    await naturalScroll(page, -exploreUp);  // 위로
    await delay(randomBetween(500, 1000));

    await naturalScroll(page, exploreUp + randomBetween(50, 150));  // 다시 아래로
    await delay(randomBetween(300, 600));
    return true;
  }

  // ─────────────────────────────────────────────
  // 패턴 2: 오버슈트 (30% 확률, 거리 200px 이상일 때)
  // ─────────────────────────────────────────────
  const useOvershoot = Math.random() < 0.3 && scrollDistance > 200;

  if (useOvershoot) {
    logger(`[Scroll] 패턴 2: 오버슈트 - 타겟을 지나쳤다가 복귀`);

    // 타겟보다 200~400px 더 아래로 스크롤
    const overshootExtra = randomBetween(200, 400);
    const overshootDistance = scrollDistance + overshootExtra;

    // 1. 오버슈트 (타겟을 지나침)
    const overshootScrollCount = randomBetween(2, 3);
    const perOvershoot = overshootDistance / overshootScrollCount;

    for (let i = 0; i < overshootScrollCount; i++) {
      const jitter = randomBetween(-30, 30);
      await naturalScroll(page, perOvershoot + jitter);
      await delay(randomBetween(300, 600));
    }

    // 2. 잠시 머무르며 "어디갔지?" 느낌
    await delay(randomBetween(500, 1000));

    // 3. 다시 위로 올라와서 타겟 찾기
    const comeBackDistance = -overshootExtra - randomBetween(50, 150);
    await naturalScroll(page, comeBackDistance);
    await delay(randomBetween(300, 500));

  } else {
    // ─────────────────────────────────────────────
    // 패턴 3: 일반 - 여러 번 나눠서 접근
    // ─────────────────────────────────────────────
    const scrollCount = Math.abs(scrollDistance) > 500 ? randomBetween(2, 3) : 1;
    logger(`[Scroll] 패턴 3: 일반 - ${scrollCount}회 나눠서 스크롤`);

    const perScrollDistance = scrollDistance / scrollCount;

    for (let i = 0; i < scrollCount; i++) {
      const jitter = randomBetween(-30, 30);
      await naturalScroll(page, perScrollDistance + jitter);

      if (i < scrollCount - 1) {
        await delay(randomBetween(400, 800));
      }
    }
  }

  // 최종 위치 안정화 대기
  await delay(randomBetween(300, 600));
  return true;
}

/**
 * 셀렉터로 요소를 찾아 스크롤
 *
 * @param {import('patchright').Page} page - 페이지
 * @param {string} selector - CSS 셀렉터
 * @param {Object} options - 옵션
 * @returns {Promise<boolean>} 성공 여부
 */
async function scrollToElementNaturally(page, selector, options = {}) {
  const logger = options.logger || (() => {});
  const viewport = page.viewportSize();
  if (!viewport) return false;

  // 요소 위치 확인
  const targetRect = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;

    const rect = el.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      centerY: rect.top + rect.height / 2,
    };
  }, selector);

  if (!targetRect) {
    logger(`[Scroll] 요소를 찾을 수 없음: ${selector}`);
    return false;
  }

  // 중앙 근처로 스크롤
  const visibleCenter = viewport.height / 2;
  const targetOffset = randomBetween(-60, 60);
  const scrollDistance = targetRect.centerY - visibleCenter - targetOffset;

  if (Math.abs(scrollDistance) < 50) {
    logger(`[Scroll] 이미 화면에 보임`);
    return true;
  }

  // 스크롤 실행
  const scrollCount = Math.abs(scrollDistance) > 500 ? randomBetween(2, 3) : 1;
  const perScroll = scrollDistance / scrollCount;

  for (let i = 0; i < scrollCount; i++) {
    await naturalScroll(page, perScroll + randomBetween(-30, 30));
    if (i < scrollCount - 1) {
      await delay(randomBetween(300, 600));
    }
  }

  await delay(randomBetween(200, 400));
  return true;
}

// ─────────────────────────────────────────────────────────────────
// 사전 정의 스크롤 시퀀스
// ─────────────────────────────────────────────────────────────────

/**
 * 검색 결과 탐색용 스크롤 시퀀스
 */
const SEARCH_RESULT_SCROLL_SEQUENCE = [
  {
    name: '1차 플링',
    distanceRange: [2500, 4000],
    delayRange: [800, 1500],
  },
  {
    name: '2차 플링',
    distanceRange: [2000, 3500],
    delayRange: [1000, 2000],
  },
];

/**
 * 상품 상세 페이지용 스크롤 시퀀스
 */
const PRODUCT_DETAIL_SCROLL_SEQUENCE = [
  {
    name: '상품 정보 확인',
    distanceRange: [500, 1000],
    delayRange: [1500, 3000],
  },
  {
    name: '리뷰 영역 탐색',
    distanceRange: [1000, 2000],
    delayRange: [2000, 4000],
  },
];

// ─────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────

export {
  // 설정
  FLING_CONFIG,
  DURATION_CONFIG,
  STICKY_HEADER_HEIGHT,

  // 유틸리티
  randomBetween,
  gaussianRandom,
  delay,

  // 핵심 함수
  flingScroll,
  naturalScroll,
  executeScrollSequence,

  // 타겟 스크롤
  scrollToProductNaturally,
  scrollToElementNaturally,

  // 사전 정의 시퀀스
  SEARCH_RESULT_SCROLL_SEQUENCE,
  PRODUCT_DETAIL_SCROLL_SEQUENCE,
};

export default {
  flingScroll,
  naturalScroll,
  scrollToProductNaturally,
  scrollToElementNaturally,
  executeScrollSequence,
};
