/**
 * Human Simulator - 인간적인 행동 시뮬레이션
 *
 * Playwright page 객체에 적용하여 자연스러운 사용자 행동을 시뮬레이션합니다.
 * 봇 탐지 시스템은 기계적인 행동 패턴을 감지하므로,
 * 실제 사람처럼 변동성 있는 행동을 주입합니다.
 */

// === 유틸리티 함수 ===

/**
 * 범위 내 랜덤 값 생성
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * 가우시안 분포 랜덤 (더 자연스러운 분포)
 * @param {number} mean - 평균
 * @param {number} stdDev - 표준편차
 * @returns {number}
 */
function gaussianRandom(mean, stdDev) {
  // Box-Muller 변환
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

/**
 * Easing 함수들
 */
const easingFunctions = {
  linear: t => t,
  easeInQuad: t => t * t,
  easeOutQuad: t => t * (2 - t),
  easeInOutQuad: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeOutCubic: t => (--t) * t * t + 1,
  easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1
};

// === 타이핑 패턴 ===
export const TypingPatterns = {

  /**
   * 한글 타이핑 시뮬레이션
   * 자모 조합, 음절 완성, 오타 등을 고려합니다.
   *
   * @param {Page} page - Playwright page
   * @param {string} selector - 입력 필드 셀렉터
   * @param {string} text - 입력할 텍스트
   * @param {Object} options - 옵션
   */
  async typeKorean(page, selector, text, options = {}) {
    const {
      baseDelay = 100,       // 기본 딜레이 (ms)
      variance = 40,         // 딜레이 변동폭
      mistakeRate = 0.015,   // 오타 확률 (1.5%)
      pauseAfterSyllable = true,
      clickFirst = true
    } = options;

    // 입력 필드 클릭
    if (clickFirst) {
      await page.click(selector);
      await page.waitForTimeout(randomBetween(200, 400));
    }

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // 오타 시뮬레이션 (드물게)
      if (Math.random() < mistakeRate) {
        const wrongChar = this._getRandomChar();
        await page.keyboard.type(wrongChar);
        await page.waitForTimeout(randomBetween(200, 400));
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(randomBetween(100, 200));
      }

      // 문자 입력
      await page.keyboard.type(char);

      // 딜레이 계산 (가우시안 분포로 더 자연스럽게)
      let delay = Math.max(30, gaussianRandom(baseDelay, variance / 2));

      // 한글 음절 완성 후 약간 더 긴 멈춤
      if (pauseAfterSyllable && this._isKoreanSyllable(char)) {
        delay += randomBetween(20, 50);
      }

      // 띄어쓰기/마침표 후 더 긴 멈춤 (생각하는 듯)
      if (char === ' ') {
        delay += randomBetween(50, 150);
      } else if (char === '.' || char === '?' || char === '!') {
        delay += randomBetween(100, 300);
      }

      await page.waitForTimeout(delay);
    }
  },

  /**
   * 한글 음절인지 확인
   */
  _isKoreanSyllable(char) {
    const code = char.charCodeAt(0);
    return code >= 0xAC00 && code <= 0xD7A3;
  },

  /**
   * 랜덤 문자 생성 (오타용)
   */
  _getRandomChar() {
    const chars = 'ㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔㅁㄴㅇㄹㅎㅗㅓㅏㅣㅋㅌㅊㅍabcdefghijklmnopqrstuvwxyz';
    return chars[Math.floor(Math.random() * chars.length)];
  }
};

// === 스크롤 패턴 ===
export const ScrollPatterns = {

  /**
   * 자연스러운 스크롤
   * 사람처럼 가속/감속하는 스크롤을 시뮬레이션합니다.
   *
   * @param {Page} page
   * @param {Object} options
   */
  async humanScroll(page, options = {}) {
    const {
      direction = 'down',
      distance = 300,
      steps = 8,
      easing = 'easeOutCubic'
    } = options;

    const easingFn = easingFunctions[easing] || easingFunctions.easeOutCubic;
    const sign = direction === 'down' ? 1 : -1;

    let scrolled = 0;

    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;
      const easedProgress = easingFn(progress);
      const targetScroll = distance * easedProgress;
      const stepScroll = targetScroll - scrolled;

      await page.mouse.wheel({
        deltaY: stepScroll * sign
      });

      scrolled = targetScroll;

      // 각 스텝 사이 미세 딜레이
      await page.waitForTimeout(randomBetween(20, 50));
    }

    // 스크롤 후 정지 시간
    await page.waitForTimeout(randomBetween(300, 600));
  },

  /**
   * 읽는 듯한 스크롤
   * 콘텐츠를 읽는 것처럼 중간중간 멈추며 스크롤합니다.
   *
   * @param {Page} page
   * @param {number} totalDistance - 총 스크롤 거리
   * @param {number} readingTime - 총 소요 시간 (ms)
   */
  async readingScroll(page, totalDistance = 1000, readingTime = 5000) {
    const scrollCount = Math.floor(totalDistance / 200);
    const pauseTime = readingTime / scrollCount;

    for (let i = 0; i < scrollCount; i++) {
      // 스크롤 거리에 변동성
      const scrollDistance = randomBetween(150, 250);

      await this.humanScroll(page, {
        distance: scrollDistance,
        steps: Math.floor(randomBetween(4, 8))
      });

      // 읽는 시간 (변동성 있게)
      await page.waitForTimeout(randomBetween(pauseTime * 0.5, pauseTime * 1.5));

      // 가끔 약간 위로 스크롤 (다시 읽는 듯)
      if (Math.random() < 0.1) {
        await this.humanScroll(page, {
          direction: 'up',
          distance: randomBetween(50, 100),
          steps: 3
        });
        await page.waitForTimeout(randomBetween(500, 1000));
      }
    }
  }
};

// === 마우스/터치 패턴 ===
export const MousePatterns = {

  /**
   * 베지어 곡선 기반 자연스러운 마우스 이동
   * 직선이 아닌 곡선 경로로 이동합니다.
   *
   * @param {Page} page
   * @param {number} targetX - 목표 X 좌표
   * @param {number} targetY - 목표 Y 좌표
   * @param {Object} options
   */
  async humanMove(page, targetX, targetY, options = {}) {
    const {
      steps = 15,
      duration = 300,
      startX = null,
      startY = null
    } = options;

    // 현재 위치 (또는 지정된 시작 위치)
    const viewport = page.viewportSize() || { width: 384, height: 854 };
    const fromX = startX ?? viewport.width / 2;
    const fromY = startY ?? viewport.height / 2;

    // 제어점 (곡선의 정도 결정)
    const curvature = randomBetween(50, 150);
    const controlX = (fromX + targetX) / 2 + (Math.random() - 0.5) * curvature;
    const controlY = (fromY + targetY) / 2 + (Math.random() - 0.5) * curvature;

    const stepDuration = duration / steps;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;

      // 2차 베지어 곡선
      const x = (1 - t) * (1 - t) * fromX +
                2 * (1 - t) * t * controlX +
                t * t * targetX;
      const y = (1 - t) * (1 - t) * fromY +
                2 * (1 - t) * t * controlY +
                t * t * targetY;

      // 미세한 흔들림 추가
      const jitterX = (Math.random() - 0.5) * 2;
      const jitterY = (Math.random() - 0.5) * 2;

      await page.mouse.move(x + jitterX, y + jitterY);
      await page.waitForTimeout(randomBetween(stepDuration * 0.7, stepDuration * 1.3));
    }
  },

  /**
   * 자연스러운 클릭
   * 요소로 이동 후 약간의 대기 후 클릭합니다.
   *
   * @param {Page} page
   * @param {string} selector - 클릭할 요소 셀렉터
   * @param {Object} options
   */
  async humanClick(page, selector, options = {}) {
    const {
      moveFirst = true,
      hoverTime = null
    } = options;

    const element = await page.$(selector);
    if (!element) {
      console.warn(`[HumanSimulator] Element not found: ${selector}`);
      return false;
    }

    const box = await element.boundingBox();
    if (!box) {
      console.warn(`[HumanSimulator] Element has no bounding box: ${selector}`);
      return false;
    }

    // 클릭 위치에 약간의 변동 (정확히 중앙이 아닌)
    const offsetX = box.width * randomBetween(0.3, 0.7);
    const offsetY = box.height * randomBetween(0.3, 0.7);
    const x = box.x + offsetX;
    const y = box.y + offsetY;

    // 요소로 이동
    if (moveFirst) {
      await this.humanMove(page, x, y);
    }

    // 호버 시간 (요소를 보는 듯)
    const hover = hoverTime ?? randomBetween(100, 300);
    await page.waitForTimeout(hover);

    // 클릭
    await page.mouse.click(x, y);

    return true;
  },

  /**
   * 더블클릭
   */
  async humanDoubleClick(page, selector, options = {}) {
    const element = await page.$(selector);
    if (!element) return false;

    const box = await element.boundingBox();
    if (!box) return false;

    const x = box.x + box.width * randomBetween(0.3, 0.7);
    const y = box.y + box.height * randomBetween(0.3, 0.7);

    await this.humanMove(page, x, y);
    await page.waitForTimeout(randomBetween(50, 150));

    // 더블클릭 간격
    await page.mouse.click(x, y);
    await page.waitForTimeout(randomBetween(50, 120));
    await page.mouse.click(x, y);

    return true;
  }
};

// === 고수준 시뮬레이션 함수 ===

/**
 * 자연스러운 검색 시뮬레이션
 *
 * @param {Page} page
 * @param {string} query - 검색어
 * @param {Object} options
 */
export async function simulateSearch(page, query, options = {}) {
  const {
    searchInputSelector = '#query',
    searchButtonSelector = null,
    useEnter = true
  } = options;

  // 1. 검색창으로 이동 및 클릭
  await MousePatterns.humanClick(page, searchInputSelector, { hoverTime: 200 });
  await page.waitForTimeout(randomBetween(300, 600));

  // 2. 검색어 입력
  await TypingPatterns.typeKorean(page, searchInputSelector, query, {
    baseDelay: 90,
    variance: 35,
    clickFirst: false
  });

  // 3. 입력 후 잠시 확인 (생각하는 듯)
  await page.waitForTimeout(randomBetween(400, 800));

  // 4. 검색 실행
  if (useEnter) {
    await page.keyboard.press('Enter');
  } else if (searchButtonSelector) {
    await MousePatterns.humanClick(page, searchButtonSelector);
  }
}

/**
 * 자연스러운 상품/콘텐츠 탐색
 *
 * @param {Page} page
 * @param {Object} options
 */
export async function simulateBrowse(page, options = {}) {
  const {
    scrollCount = 3,
    itemSelector = '.product_item, .item, article',
    clickProbability = 0.2,
    readingTime = 3000
  } = options;

  for (let i = 0; i < scrollCount; i++) {
    // 읽는 듯한 스크롤
    await ScrollPatterns.readingScroll(page, randomBetween(300, 500), readingTime);

    // 확률적 아이템 클릭
    if (Math.random() < clickProbability) {
      const items = await page.$$(itemSelector);

      if (items.length > 0) {
        // 화면에 보이는 아이템 중 랜덤 선택
        const randomIndex = Math.floor(Math.random() * Math.min(items.length, 5));
        const item = items[randomIndex];

        try {
          await item.scrollIntoViewIfNeeded();
          await page.waitForTimeout(randomBetween(500, 1000));

          const box = await item.boundingBox();
          if (box) {
            await MousePatterns.humanMove(page, box.x + box.width / 2, box.y + box.height / 2);
            await page.waitForTimeout(randomBetween(300, 600));
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

            // 페이지 이동 대기
            await page.waitForTimeout(randomBetween(2000, 4000));

            // 뒤로가기
            await page.goBack();
            await page.waitForTimeout(randomBetween(1000, 2000));
          }
        } catch (e) {
          // 클릭 실패 시 무시
        }
      }
    }
  }
}

/**
 * Page 객체에 Human Simulator 메서드 바인딩
 *
 * @param {Page} page - Playwright page
 * @returns {Page} 확장된 page 객체
 */
export function applyToPage(page) {
  // 타이핑
  page.humanType = (selector, text, opts) =>
    TypingPatterns.typeKorean(page, selector, text, opts);

  // 스크롤
  page.humanScroll = (opts) =>
    ScrollPatterns.humanScroll(page, opts);
  page.readingScroll = (distance, time) =>
    ScrollPatterns.readingScroll(page, distance, time);

  // 마우스
  page.humanMove = (x, y, opts) =>
    MousePatterns.humanMove(page, x, y, opts);
  page.humanClick = (selector, opts) =>
    MousePatterns.humanClick(page, selector, opts);

  // 고수준 시뮬레이션
  page.simulateSearch = (query, opts) =>
    simulateSearch(page, query, opts);
  page.simulateBrowse = (opts) =>
    simulateBrowse(page, opts);

  return page;
}

// === Default Export ===
export default {
  TypingPatterns,
  ScrollPatterns,
  MousePatterns,
  simulateSearch,
  simulateBrowse,
  applyToPage,
  utils: {
    randomBetween,
    gaussianRandom,
    easingFunctions
  }
};
