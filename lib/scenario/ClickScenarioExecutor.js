/**
 * ClickScenarioExecutor - 클릭 시나리오 실행기
 *
 * DB에서 시나리오를 로드하고 실행
 * 체류 시간 규칙에 따른 자연스러운 행동 수행
 * 핵심: 타겟 상품 = 긴 체류, 비교 상품 = 짧은 체류
 */

import personaDB from '../db/PersonaDB.js';

// 네이버 서비스 URL
const SERVICE_URLS = {
  shopping: {
    mobile: 'https://mshopping.naver.com',
    search: 'https://mshopping.naver.com/search/search?query='
  },
  search: {
    mobile: 'https://m.search.naver.com',
    query: 'https://m.search.naver.com/search.naver?query='
  },
  blog: {
    mobile: 'https://m.blog.naver.com',
    search: 'https://m.search.naver.com/search.naver?where=blog&query='
  }
};

class ClickScenarioExecutor {
  constructor(options = {}) {
    this.page = null;
    this.persona = null;
    this.sessionId = null;
    this.actionOrder = 0;
    this.humanSimulator = options.humanSimulator;
    this.debug = options.debug || false;
  }

  /**
   * 초기화
   */
  async init(page, persona) {
    this.page = page;
    this.persona = persona;
    this.actionOrder = 0;
  }

  /**
   * 시나리오 실행
   * @param {Object} targetProduct - 타겟 상품 정보
   * @param {string} ipAddress - VPN IP
   * @returns {Object} 실행 결과
   */
  async executeScenario(targetProduct, ipAddress) {
    const result = {
      success: false,
      targetClicked: false,
      targetDwellTime: 0,
      totalPages: 0,
      totalSearches: 0,
      totalClicks: 0,
      errorMessage: null
    };

    try {
      // 시나리오 선택
      const scenario = await personaDB.selectRandomScenario(targetProduct.id);
      if (!scenario) {
        throw new Error(`No scenario found for product: ${targetProduct.id}`);
      }

      this._log(`시나리오 선택: ${scenario.scenarioName} (${scenario.scenarioType})`);

      // 세션 시작
      this.sessionId = await personaDB.startSession({
        personaId: this.persona.id,
        ipAddress,
        targetProductId: targetProduct.id,
        scenarioId: scenario.id
      });

      // 1. 사전 클릭 행동 실행
      this._log('사전 클릭 행동 실행...');
      await this._executeActions(scenario.preClickActions, targetProduct, result);

      // 2. 타겟 상품 클릭 및 체류
      this._log('타겟 상품 클릭...');
      const targetResult = await this._executeTargetClick(
        scenario.targetClickAction,
        targetProduct
      );
      result.targetClicked = targetResult.clicked;
      result.targetDwellTime = targetResult.dwellTime;
      result.totalClicks++;

      // 3. 사후 클릭 행동 실행
      this._log('사후 클릭 행동 실행...');
      await this._executeActions(scenario.postClickActions, targetProduct, result);

      // 성공 처리
      result.success = true;

      // 시나리오 사용 기록
      await personaDB.recordScenarioUsage(scenario.id, true);

      // 타겟 상품 클릭 기록
      if (result.targetClicked) {
        await personaDB.recordTargetClick(targetProduct.id);
      }

    } catch (error) {
      result.errorMessage = error.message;
      this._log(`시나리오 실행 실패: ${error.message}`, 'error');
    }

    // 세션 종료
    if (this.sessionId) {
      await personaDB.endSession(this.sessionId, result);
    }

    // 페르소나 사용 기록
    await personaDB.recordPersonaUsage(this.persona.id, result.success);

    return result;
  }

  /**
   * 액션 배열 실행
   */
  async _executeActions(actions, targetProduct, result) {
    for (const action of actions) {
      await this._executeAction(action, targetProduct, result);
      await this._randomDelay(500, 1500);
    }
  }

  /**
   * 단일 액션 실행
   */
  async _executeAction(action, targetProduct, result) {
    const { type } = action;
    this.actionOrder++;

    this._log(`액션 실행: ${type}`);

    switch (type) {
      case 'search':
        await this._actionSearch(action, targetProduct, result);
        break;

      case 'view_product':
        await this._actionViewProduct(action, result);
        break;

      case 'scroll':
        await this._actionScroll(action);
        break;

      case 'back':
      case 'back_to_list':
        await this._actionBack(action, result);
        break;

      case 'blog_search':
        await this._actionBlogSearch(action, result);
        break;

      case 'read_blog':
        await this._actionReadBlog(action, result);
        break;

      case 'exit':
      case 'exit_or_continue':
        await this._actionExit(action);
        break;

      case 're_search':
        await this._actionSearch(action, targetProduct, result);
        break;

      default:
        this._log(`알 수 없는 액션: ${type}`, 'warn');
    }
  }

  /**
   * 검색 액션
   */
  async _actionSearch(action, targetProduct, result) {
    let keyword = action.keyword;

    // {product} 플레이스홀더 치환
    if (keyword.includes('{product}')) {
      keyword = keyword.replace('{product}', targetProduct.product_name);
    }

    const searchUrl = SERVICE_URLS.shopping.search + encodeURIComponent(keyword);

    await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
    result.totalSearches++;
    result.totalPages++;

    // 체류 시간
    const [minDwell, maxDwell] = action.dwell || [30, 60];
    const dwellTime = await this._getDwellTime('search_result', minDwell, maxDwell);

    await this._logClickAction('search', { searchKeyword: keyword, dwellTimeSec: dwellTime });
    await this._naturalWait(dwellTime);
  }

  /**
   * 상품 보기 액션 (비교용 - 짧은 체류)
   */
  async _actionViewProduct(action, result) {
    const { position, dwell } = action;

    // 상품 목록에서 선택
    const productLinks = await this.page.$$('a[href*="smartstore"], a[href*="shopping"]');

    if (productLinks.length === 0) {
      this._log('상품 링크 없음', 'warn');
      return;
    }

    // 위치에 따라 상품 선택
    let targetIndex = 0;
    if (position === 'random') {
      targetIndex = Math.floor(Math.random() * Math.min(productLinks.length, 20));
    } else if (position === 'random_top5') {
      targetIndex = Math.floor(Math.random() * Math.min(productLinks.length, 5));
    } else if (position === 'random_top10') {
      targetIndex = Math.floor(Math.random() * Math.min(productLinks.length, 10));
    } else if (position === 'top3') {
      targetIndex = Math.floor(Math.random() * Math.min(productLinks.length, 3));
    } else if (position === 'adjacent') {
      // 인접 상품 (현재 위치 +-2)
      targetIndex = Math.floor(Math.random() * Math.min(productLinks.length, 5));
    }

    const link = productLinks[targetIndex];
    if (!link) return;

    // 클릭
    await link.click();
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    result.totalClicks++;
    result.totalPages++;

    // 비교 상품 = 짧은 체류 (10~30초)
    const [minDwell, maxDwell] = dwell || [10, 30];
    const dwellTime = await this._getDwellTime('comparison_product', minDwell, maxDwell);

    // 일부 스크롤
    await this._partialScroll(30, 50);

    await this._logClickAction('view_product', {
      productPosition: targetIndex + 1,
      isTarget: false,
      dwellTimeSec: dwellTime,
      scrollDepth: 0.4
    });

    await this._naturalWait(dwellTime);
  }

  /**
   * 타겟 상품 클릭 (긴 체류!)
   */
  async _executeTargetClick(targetAction, targetProduct) {
    const result = { clicked: false, dwellTime: 0 };

    try {
      // 타겟 상품 찾기
      const productName = targetProduct.product_name;
      const productSelector = `text="${productName}"`;

      // 스크롤하면서 상품 찾기
      let found = false;
      for (let i = 0; i < 5; i++) {
        const element = await this.page.$(productSelector).catch(() => null);
        if (element) {
          found = true;

          // 스크롤하여 뷰포트에 표시
          await element.scrollIntoViewIfNeeded();
          await this._randomDelay(500, 1000);

          // 클릭
          await element.click();
          await this.page.waitForLoadState('domcontentloaded').catch(() => {});
          result.clicked = true;
          break;
        }

        // 아래로 스크롤
        await this._scrollDown(300);
        await this._randomDelay(1000, 2000);
      }

      if (!found) {
        this._log('타겟 상품을 찾지 못함', 'warn');
        return result;
      }

      // ★★★ 타겟 상품 = 긴 체류 (2~5분) ★★★
      const [minDwell, maxDwell] = targetAction.dwell || [120, 300];
      const dwellTime = await this._getDwellTime('target_product', minDwell, maxDwell);
      result.dwellTime = dwellTime;

      this._log(`타겟 상품 체류 시작: ${dwellTime}초`);

      // 전체 스크롤 (천천히)
      if (targetAction.scroll === 'full') {
        await this._fullScroll();
      }

      // 리뷰 확인
      if (targetAction.view_reviews) {
        await this._viewReviews();
      }

      // 상세 정보 확인
      if (targetAction.view_details) {
        await this._viewDetails();
      }

      // 찜하기 (확률적)
      if (targetAction.add_to_wishlist && Math.random() < targetAction.add_to_wishlist) {
        await this._addToWishlist();
      }

      await this._logClickAction('click', {
        url: this.page.url(),
        isTarget: true,
        dwellTimeSec: dwellTime,
        scrollDepth: 1.0
      });

      // 남은 체류 시간 대기
      await this._naturalWait(dwellTime * 0.5); // 스크롤/리뷰 시간 제외한 나머지

    } catch (error) {
      this._log(`타겟 클릭 실패: ${error.message}`, 'error');
    }

    return result;
  }

  /**
   * 스크롤 액션
   */
  async _actionScroll(action) {
    const { amount, speed } = action;

    let scrollPercent = 50;
    if (amount === 'full') scrollPercent = 100;
    else if (amount === '80%') scrollPercent = 80;
    else if (amount === '50%') scrollPercent = 50;
    else if (amount === '30%') scrollPercent = 30;
    else if (typeof amount === 'string' && amount.endsWith('%')) {
      scrollPercent = parseInt(amount);
    }

    await this._partialScroll(scrollPercent, scrollPercent);
  }

  /**
   * 뒤로가기 액션
   */
  async _actionBack(action, result) {
    await this.page.goBack().catch(() => {});
    result.totalPages++;

    const [minDwell, maxDwell] = action.dwell || [3, 8];
    await this._naturalWait(this._random(minDwell, maxDwell));

    await this._logClickAction('back', {});
  }

  /**
   * 블로그 검색 액션
   */
  async _actionBlogSearch(action, result) {
    let keyword = action.keyword;

    const searchUrl = SERVICE_URLS.blog.search + encodeURIComponent(keyword);
    await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
    result.totalSearches++;
    result.totalPages++;

    const [minDwell, maxDwell] = action.dwell || [30, 60];
    const dwellTime = await this._getDwellTime('search_result', minDwell, maxDwell);

    await this._logClickAction('search', { searchKeyword: keyword, dwellTimeSec: dwellTime });
    await this._naturalWait(dwellTime);
  }

  /**
   * 블로그 읽기 액션
   */
  async _actionReadBlog(action, result) {
    // 블로그 글 클릭
    const blogLinks = await this.page.$$('a[href*="blog.naver.com"]');
    if (blogLinks.length > 0) {
      const randomIndex = Math.floor(Math.random() * Math.min(blogLinks.length, 5));
      await blogLinks[randomIndex].click();
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});
      result.totalClicks++;
      result.totalPages++;

      const [minDwell, maxDwell] = action.dwell || [60, 180];
      const dwellTime = await this._getDwellTime('blog_post', minDwell, maxDwell);

      await this._fullScroll();

      await this._logClickAction('view_product', { dwellTimeSec: dwellTime, scrollDepth: 0.8 });
      await this._naturalWait(dwellTime * 0.5);
    }
  }

  /**
   * 종료 액션
   */
  async _actionExit(action) {
    const exitProb = action.prob || action.exit_prob || 0.5;

    if (Math.random() < exitProb) {
      this._log('세션 종료 (확률적)');
      // 실제로 종료하지 않고 플래그만 설정
    }

    await this._logClickAction('exit', {});
  }

  /**
   * 전체 스크롤 (천천히)
   */
  async _fullScroll() {
    const scrollHeight = await this.page.evaluate(() => document.body.scrollHeight);
    const viewportHeight = await this.page.evaluate(() => window.innerHeight);
    const scrollSteps = Math.ceil(scrollHeight / viewportHeight);

    for (let i = 0; i < scrollSteps; i++) {
      await this._scrollDown(viewportHeight * 0.8);
      await this._randomDelay(1500, 3000);

      // 가끔 멈추기
      if (Math.random() < 0.3) {
        await this._randomDelay(2000, 4000);
      }
    }
  }

  /**
   * 부분 스크롤
   */
  async _partialScroll(minPercent, maxPercent) {
    const scrollHeight = await this.page.evaluate(() => document.body.scrollHeight);
    const targetPercent = this._random(minPercent, maxPercent) / 100;
    const targetScroll = scrollHeight * targetPercent;

    let currentScroll = 0;
    while (currentScroll < targetScroll) {
      const step = this._random(200, 400);
      await this._scrollDown(step);
      currentScroll += step;
      await this._randomDelay(500, 1500);
    }
  }

  /**
   * 스크롤 다운
   */
  async _scrollDown(pixels) {
    await this.page.evaluate((px) => {
      window.scrollBy({ top: px, behavior: 'smooth' });
    }, pixels);
  }

  /**
   * 리뷰 확인
   */
  async _viewReviews() {
    try {
      // 리뷰 탭 클릭
      const reviewTab = await this.page.$('text="리뷰"');
      if (reviewTab) {
        await reviewTab.click();
        await this._randomDelay(1000, 2000);

        // 리뷰 몇 개 스크롤
        for (let i = 0; i < 3; i++) {
          await this._scrollDown(300);
          await this._randomDelay(2000, 4000);
        }
      }
    } catch (error) {
      // 무시
    }
  }

  /**
   * 상세 정보 확인
   */
  async _viewDetails() {
    try {
      // 상품정보 탭 클릭
      const detailTab = await this.page.$('text="상품정보"');
      if (detailTab) {
        await detailTab.click();
        await this._randomDelay(1000, 2000);

        // 이미지 로딩 대기
        await this._randomDelay(2000, 4000);
      }
    } catch (error) {
      // 무시
    }
  }

  /**
   * 찜하기
   */
  async _addToWishlist() {
    try {
      const wishlistBtn = await this.page.$('button:has-text("찜")');
      if (wishlistBtn) {
        await wishlistBtn.click();
        await this._randomDelay(500, 1000);
        this._log('찜하기 완료');
      }
    } catch (error) {
      // 무시
    }
  }

  /**
   * 연령대 보정된 체류 시간 계산
   */
  async _getDwellTime(context, minDwell, maxDwell) {
    try {
      const config = await personaDB.calculateDwellTime(context, this.persona.ageGroup);
      const min = Math.max(minDwell, config.min);
      const max = Math.min(maxDwell, config.max);
      return this._random(min, max);
    } catch {
      return this._random(minDwell, maxDwell);
    }
  }

  /**
   * 자연스러운 대기
   */
  async _naturalWait(seconds) {
    // 체류 시간 동안 가끔 스크롤/마우스 이동
    const endTime = Date.now() + seconds * 1000;

    while (Date.now() < endTime) {
      const remaining = (endTime - Date.now()) / 1000;

      if (remaining > 10 && Math.random() < 0.2) {
        // 작은 스크롤
        await this._scrollDown(this._random(50, 150));
      }

      await this._randomDelay(2000, 5000);
    }
  }

  /**
   * 클릭 액션 로그
   */
  async _logClickAction(actionType, data) {
    if (!this.sessionId) return;

    await personaDB.logClickAction(this.sessionId, {
      actionType,
      actionOrder: this.actionOrder,
      url: data.url || this.page?.url(),
      searchKeyword: data.searchKeyword,
      productPosition: data.productPosition,
      isTarget: data.isTarget || false,
      dwellTimeSec: data.dwellTimeSec,
      scrollDepth: data.scrollDepth
    });
  }

  /**
   * 랜덤 지연
   */
  async _randomDelay(min, max) {
    const delay = this._random(min, max);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * 랜덤 숫자
   */
  _random(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * 로그 출력
   */
  _log(message, level = 'info') {
    if (!this.debug && level === 'info') return;

    const prefix = `[ScenarioExecutor]`;
    const personaCode = this.persona?.code || 'Unknown';

    switch (level) {
      case 'error':
        console.error(`${prefix} [${personaCode}] ${message}`);
        break;
      case 'warn':
        console.warn(`${prefix} [${personaCode}] ${message}`);
        break;
      default:
        console.log(`${prefix} [${personaCode}] ${message}`);
    }
  }
}

export default ClickScenarioExecutor;
export { ClickScenarioExecutor, SERVICE_URLS };
