/**
 * 휴먼라이크 클릭 라이브러리
 *
 * 봇 탐지 회피를 위한 자연스러운 클릭 패턴 구현
 * - 마우스 이동 경로에 곡선 적용 (베지어 커브)
 * - 클릭 전 호버 시간 랜덤화
 * - 클릭 위치 미세 오프셋
 * - 클릭 후 딜레이
 */

import { randomBetween, gaussianRandom, delay } from './scroll.js';

// ─────────────────────────────────────────────────────────────────
// 설정값
// ─────────────────────────────────────────────────────────────────

const CLICK_CONFIG = {
  // 마우스 이동 설정
  MOUSE_MOVE: {
    STEPS_MIN: 15,           // 최소 이동 단계
    STEPS_MAX: 30,           // 최대 이동 단계
    STEP_DELAY_MIN: 5,       // 단계당 최소 딜레이 (ms)
    STEP_DELAY_MAX: 15,      // 단계당 최대 딜레이 (ms)
    CURVE_VARIANCE: 0.3,     // 곡선 변동성 (0~1)
  },
  // 호버 설정 (클릭 전 대기)
  HOVER: {
    DURATION_MIN: 100,       // 최소 호버 시간 (ms)
    DURATION_MAX: 400,       // 최대 호버 시간 (ms)
  },
  // 클릭 위치 오프셋
  OFFSET: {
    X_MAX: 5,                // X 오프셋 최대값 (px)
    Y_MAX: 5,                // Y 오프셋 최대값 (px)
  },
  // 클릭 후 딜레이
  AFTER_CLICK: {
    MIN: 50,
    MAX: 150,
  },
};

// ─────────────────────────────────────────────────────────────────
// 베지어 커브 유틸리티
// ─────────────────────────────────────────────────────────────────

/**
 * 2차 베지어 곡선 포인트 계산
 *
 * @param {number} t - 0~1 사이 진행률
 * @param {Object} p0 - 시작점 {x, y}
 * @param {Object} p1 - 제어점 {x, y}
 * @param {Object} p2 - 끝점 {x, y}
 * @returns {{x: number, y: number}}
 */
function quadraticBezier(t, p0, p1, p2) {
  const x = Math.pow(1 - t, 2) * p0.x + 2 * (1 - t) * t * p1.x + Math.pow(t, 2) * p2.x;
  const y = Math.pow(1 - t, 2) * p0.y + 2 * (1 - t) * t * p1.y + Math.pow(t, 2) * p2.y;
  return { x, y };
}

/**
 * 자연스러운 마우스 경로 생성
 *
 * @param {Object} start - 시작점 {x, y}
 * @param {Object} end - 끝점 {x, y}
 * @param {number} steps - 단계 수
 * @returns {Array<{x: number, y: number}>} 경로 포인트 배열
 */
function generateMousePath(start, end, steps) {
  const path = [];

  // 제어점 계산 (시작-끝 중간 + 랜덤 오프셋)
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  // 거리에 비례하는 곡선 변동
  const distance = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
  const variance = distance * CLICK_CONFIG.MOUSE_MOVE.CURVE_VARIANCE;

  const controlPoint = {
    x: midX + (Math.random() - 0.5) * variance,
    y: midY + (Math.random() - 0.5) * variance,
  };

  // 베지어 곡선으로 경로 생성
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;

    // easeOutQuad 적용 (처음 빠르고 끝에서 느려짐)
    const easedT = 1 - Math.pow(1 - t, 2);

    const point = quadraticBezier(easedT, start, controlPoint, end);

    // 미세한 지터 추가
    point.x += (Math.random() - 0.5) * 2;
    point.y += (Math.random() - 0.5) * 2;

    path.push({
      x: Math.round(point.x),
      y: Math.round(point.y),
    });
  }

  return path;
}

// ─────────────────────────────────────────────────────────────────
// 마우스 이동
// ─────────────────────────────────────────────────────────────────

/**
 * 자연스러운 마우스 이동
 *
 * @param {import('patchright').Page} page - 페이지
 * @param {number} targetX - 목표 X 좌표
 * @param {number} targetY - 목표 Y 좌표
 * @param {Object} options - 옵션
 * @param {Object} [options.currentPos] - 현재 마우스 위치 (없으면 중앙 가정)
 */
async function moveMouseNaturally(page, targetX, targetY, options = {}) {
  const viewport = page.viewportSize();
  if (!viewport) return;

  // 현재 위치 (없으면 화면 중앙)
  const currentPos = options.currentPos || {
    x: viewport.width / 2,
    y: viewport.height / 2,
  };

  // 거리 계산
  const distance = Math.sqrt(
    Math.pow(targetX - currentPos.x, 2) +
    Math.pow(targetY - currentPos.y, 2)
  );

  // 거리에 따른 단계 수 결정
  const steps = Math.min(
    CLICK_CONFIG.MOUSE_MOVE.STEPS_MAX,
    Math.max(
      CLICK_CONFIG.MOUSE_MOVE.STEPS_MIN,
      Math.floor(distance / 20)
    )
  );

  // 경로 생성
  const path = generateMousePath(currentPos, { x: targetX, y: targetY }, steps);

  // 경로 따라 이동
  for (const point of path) {
    await page.mouse.move(point.x, point.y);
    await delay(randomBetween(
      CLICK_CONFIG.MOUSE_MOVE.STEP_DELAY_MIN,
      CLICK_CONFIG.MOUSE_MOVE.STEP_DELAY_MAX
    ));
  }
}

// ─────────────────────────────────────────────────────────────────
// 클릭 함수
// ─────────────────────────────────────────────────────────────────

/**
 * 자연스러운 클릭
 *
 * @param {import('patchright').Page} page - 페이지
 * @param {number} x - 클릭 X 좌표
 * @param {number} y - 클릭 Y 좌표
 * @param {Object} options - 옵션
 * @param {boolean} [options.moveFirst=true] - 클릭 전 마우스 이동
 * @param {boolean} [options.hover=true] - 클릭 전 호버
 */
async function clickNaturally(page, x, y, options = {}) {
  const { moveFirst = true, hover = true } = options;

  // 미세 오프셋 적용
  const offsetX = randomBetween(-CLICK_CONFIG.OFFSET.X_MAX, CLICK_CONFIG.OFFSET.X_MAX);
  const offsetY = randomBetween(-CLICK_CONFIG.OFFSET.Y_MAX, CLICK_CONFIG.OFFSET.Y_MAX);
  const targetX = x + offsetX;
  const targetY = y + offsetY;

  // 1. 마우스 이동 (선택적)
  if (moveFirst) {
    await moveMouseNaturally(page, targetX, targetY);
  } else {
    await page.mouse.move(targetX, targetY);
  }

  // 2. 호버 대기 (선택적)
  if (hover) {
    await delay(randomBetween(
      CLICK_CONFIG.HOVER.DURATION_MIN,
      CLICK_CONFIG.HOVER.DURATION_MAX
    ));
  }

  // 3. 클릭
  await page.mouse.click(targetX, targetY);

  // 4. 클릭 후 짧은 딜레이
  await delay(randomBetween(
    CLICK_CONFIG.AFTER_CLICK.MIN,
    CLICK_CONFIG.AFTER_CLICK.MAX
  ));
}

/**
 * 요소에 자연스럽게 클릭
 *
 * @param {import('patchright').Page} page - 페이지
 * @param {string} selector - CSS 셀렉터
 * @param {Object} options - 옵션
 * @returns {Promise<boolean>} 성공 여부
 */
async function clickElementNaturally(page, selector, options = {}) {
  const logger = options.logger || (() => {});

  // 요소 위치 가져오기
  const rect = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;

    const rect = el.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      centerX: rect.x + rect.width / 2,
      centerY: rect.y + rect.height / 2,
    };
  }, selector);

  if (!rect) {
    logger(`[Click] 요소를 찾을 수 없음: ${selector}`);
    return false;
  }

  // 클릭 위치: 중앙 근처 랜덤
  const clickX = rect.centerX + randomBetween(-rect.width * 0.2, rect.width * 0.2);
  const clickY = rect.centerY + randomBetween(-rect.height * 0.2, rect.height * 0.2);

  logger(`[Click] ${selector} 클릭 (${Math.round(clickX)}, ${Math.round(clickY)})`);

  await clickNaturally(page, clickX, clickY, options);
  return true;
}

/**
 * 네이버 상품 링크 클릭
 *
 * @param {import('patchright').Page} page - 페이지
 * @param {string} nvMid - 네이버 상품 ID
 * @param {Object} options - 옵션
 * @returns {Promise<boolean>} 성공 여부
 */
async function clickProductNaturally(page, nvMid, options = {}) {
  const logger = options.logger || (() => {});

  // 상품 링크 위치 가져오기
  const rect = await page.evaluate((mid) => {
    const link = document.querySelector(`a[href*="nv_mid=${mid}"]`);
    if (!link) return null;

    const rect = link.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      centerX: rect.x + rect.width / 2,
      centerY: rect.y + rect.height / 2,
    };
  }, nvMid);

  if (!rect) {
    logger(`[Click] 상품을 찾을 수 없음: ${nvMid}`);
    return false;
  }

  // 화면에 보이는지 확인
  const viewport = page.viewportSize();
  if (!viewport) return false;

  if (rect.centerY < 0 || rect.centerY > viewport.height) {
    logger(`[Click] ⚠️ 상품이 화면 밖에 있음 - 먼저 스크롤 필요`);
    return false;
  }

  // 클릭 위치: 중앙 근처 랜덤
  const clickX = rect.centerX + randomBetween(-rect.width * 0.15, rect.width * 0.15);
  const clickY = rect.centerY + randomBetween(-rect.height * 0.15, rect.height * 0.15);

  logger(`[Click] 상품 ${nvMid} 클릭 (${Math.round(clickX)}, ${Math.round(clickY)})`);

  await clickNaturally(page, clickX, clickY, options);
  return true;
}

// ─────────────────────────────────────────────────────────────────
// 복합 액션
// ─────────────────────────────────────────────────────────────────

/**
 * 상품 탐색 후 클릭 (스크롤 + 클릭 통합)
 *
 * @param {import('patchright').Page} page - 페이지
 * @param {string} nvMid - 네이버 상품 ID
 * @param {Object} options - 옵션
 * @returns {Promise<boolean>} 성공 여부
 */
async function findAndClickProduct(page, nvMid, options = {}) {
  const logger = options.logger || (() => {});
  const { scrollToProductNaturally } = await import('./scroll.js');

  // 1. 상품으로 스크롤
  logger(`[Action] 상품 ${nvMid} 찾아서 스크롤`);
  const scrolled = await scrollToProductNaturally(page, nvMid, { logger });

  if (!scrolled) {
    logger(`[Action] ❌ 상품을 찾을 수 없음`);
    return false;
  }

  // 2. 잠시 대기 (탐색하는 것처럼)
  await delay(randomBetween(500, 1500));

  // 3. 클릭
  const clicked = await clickProductNaturally(page, nvMid, { logger });

  if (!clicked) {
    logger(`[Action] ❌ 클릭 실패`);
    return false;
  }

  logger(`[Action] ✅ 상품 클릭 완료`);
  return true;
}

// ─────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────

export {
  // 설정
  CLICK_CONFIG,

  // 유틸리티
  quadraticBezier,
  generateMousePath,

  // 마우스 이동
  moveMouseNaturally,

  // 클릭
  clickNaturally,
  clickElementNaturally,
  clickProductNaturally,

  // 복합 액션
  findAndClickProduct,
};

export default {
  clickNaturally,
  clickElementNaturally,
  clickProductNaturally,
  findAndClickProduct,
  moveMouseNaturally,
};
