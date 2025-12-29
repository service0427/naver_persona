/**
 * NaverActions - 네이버 특화 액션 라이브러리 (CDP 터치 기반)
 *
 * m.naver.com의 구조를 기반으로 한 액션 정의:
 * - 검색 (자동완성 포함)
 * - 메뉴 네비게이션
 * - 콘텐츠 타입별 탐색 (블로그, 영상, 쇼핑, 플레이스)
 * - CDP 리얼 터치 스크롤 (scrolllog/v2 검증 완료)
 *
 * 검증 완료 (2024-12-29):
 * - CDP 터치 스크롤이 네이버 scrolllog/v2에 정상 기록됨
 * - 관성 스크롤 작동 확인 (검색 결과 페이지)
 */

import { getAgeProfile, KoreanTypoGenerator, SearchQueryTransformer } from './AgeProfiles.js';
import {
  flickScroll,
  dragScroll,
  scrollUp,
  naturalBrowseScroll,
  multiFlickScroll,
  touchTap,
  tapElement
} from './CDPTouchScroll.js';

// === 네이버 URL 정의 ===
export const NAVER_URLS = {
  // 모바일 메인
  main: 'https://m.naver.com',

  // 검색
  search: {
    all: 'https://m.search.naver.com/search.naver?query=',
    blog: 'https://m.search.naver.com/search.naver?where=blog&query=',
    news: 'https://m.search.naver.com/search.naver?where=news&query=',
    video: 'https://m.search.naver.com/search.naver?where=video&query=',
    image: 'https://m.search.naver.com/search.naver?where=image&query=',
    shopping: 'https://mshopping.naver.com/search/search?query=',
    place: 'https://m.place.naver.com/search?query='
  },

  // 서비스 직접 접근
  services: {
    shopping: 'https://mshopping.naver.com',
    news: 'https://m.news.naver.com',
    sports: 'https://m.sports.naver.com',
    entertainment: 'https://m.entertain.naver.com',
    weather: 'https://weather.naver.com/m',
    map: 'https://m.map.naver.com'
  }
};

// === 검색창 셀렉터 ===
export const SELECTORS = {
  // 메인 페이지 검색
  mainSearchInput: '#query, input[name="query"], .search_input input',
  mainSearchButton: 'button[type="submit"], .btn_search',

  // 검색 결과 페이지
  searchInput: '#nx_query, input[name="query"]',

  // 자동완성
  autocomplete: {
    container: '.autocomplete, .auto_rolling, .atcmp_wrap',
    items: '.autocomplete li, .atcmp_list li, .acitem',
    firstItem: '.autocomplete li:first-child, .atcmp_list li:first-child'
  },

  // 검색 결과 탭
  searchTabs: {
    all: 'a[href*="sm=top_hty"]',
    blog: 'a[href*="where=blog"]',
    news: 'a[href*="where=news"]',
    video: 'a[href*="where=video"]',
    image: 'a[href*="where=image"]',
    shopping: 'a[href*="shopping"]',
    place: 'a[href*="place"]'
  },

  // 검색 결과 컨텐츠
  content: {
    blogItems: '.blog_item, .total_area .api_subject_bx',
    newsItems: '.news_item, .news_area .list_news',
    videoItems: '.video_item, .video_area',
    shopItems: '.product_item, .item, .goods_list li',
    placeItems: '.place_item, .place_section li'
  },

  // 메인 페이지 메뉴
  mainMenu: {
    shopping: 'a[href*="shopping"], .service_list a:has-text("쇼핑")',
    news: 'a[href*="news.naver"], .service_list a:has-text("뉴스")',
    sports: 'a[href*="sports"], .service_list a:has-text("스포츠")',
    entertainment: 'a[href*="entertain"], .service_list a:has-text("연예")',
    webtoon: 'a[href*="comic"], .service_list a:has-text("웹툰")',
    more: '.service_more, button:has-text("더보기")'
  }
};

// === 유틸리티 함수 ===
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function gaussianRandom(mean, stdDev) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * NaverSearchAction - 네이버 검색 액션
 *
 * 나이대별 타이핑 패턴, 자동완성 사용, 오타 시뮬레이션 포함
 */
export class NaverSearchAction {
  constructor(page, ageGroup) {
    this.page = page;
    this.profile = getAgeProfile(ageGroup);
  }

  /**
   * 검색어 입력 (나이대별 패턴 적용)
   * @param {string} query - 검색어
   * @param {Object} options - 옵션
   * @returns {Object} 결과 { method: 'typed' | 'autocomplete', finalQuery }
   */
  async search(query, options = {}) {
    const {
      useAutocomplete = true,
      selector = SELECTORS.mainSearchInput
    } = options;

    // 검색어 변형 (나이대 특성 적용)
    const transformedQuery = SearchQueryTransformer.transform(query, this.profile);

    // 검색창 클릭
    await this._clickSearchInput(selector);
    await delay(randomBetween(200, 400));

    // 자동완성 사용 시도
    if (useAutocomplete) {
      const autocompleteQuery = SearchQueryTransformer.getAutocompletePartial(
        transformedQuery,
        this.profile
      );

      if (autocompleteQuery) {
        // 부분 입력
        await this._typeWithPattern(autocompleteQuery);
        await delay(randomBetween(500, 1000));

        // 자동완성 대기 및 클릭 시도
        const clicked = await this._tryClickAutocomplete(transformedQuery);
        if (clicked) {
          return { method: 'autocomplete', finalQuery: transformedQuery };
        }
      }
    }

    // 전체 검색어 입력
    await this._typeWithPattern(transformedQuery);
    await delay(randomBetween(300, 600));

    // Enter 또는 검색 버튼
    await this._submitSearch();

    return { method: 'typed', finalQuery: transformedQuery };
  }

  /**
   * 검색창 클릭
   */
  async _clickSearchInput(selector) {
    try {
      await this.page.click(selector, {
        timeout: 5000
      });
    } catch {
      // 대체 셀렉터 시도
      const alternatives = [
        '#query',
        'input[name="query"]',
        '.search_input input',
        'input[type="search"]'
      ];

      for (const alt of alternatives) {
        try {
          await this.page.click(alt, { timeout: 2000 });
          return;
        } catch {
          continue;
        }
      }
      throw new Error('검색창을 찾을 수 없습니다');
    }
  }

  /**
   * 나이대별 타이핑 패턴으로 입력
   */
  async _typeWithPattern(text) {
    const { typing } = this.profile;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // 오타 시뮬레이션
      if (Math.random() < typing.mistakeRate) {
        const typoType = KoreanTypoGenerator.getTypoType(this.profile);
        await this._simulateTypo(char, typoType);
      } else {
        // 정상 입력
        await this.page.keyboard.type(char);
      }

      // 딜레이 계산 (가우시안 분포)
      let charDelay = Math.max(30, gaussianRandom(typing.baseDelay, typing.variance / 2));

      // 한글 음절 완성 후 약간 더 긴 멈춤
      if (this._isKoreanSyllable(char)) {
        charDelay += randomBetween(10, 30);
      }

      // 띄어쓰기 후 멈춤 (생각하는 듯)
      if (char === ' ') {
        charDelay += randomBetween(50, 150);
      }

      // 젊은 층은 burst typing (연속 빠른 입력)
      if (typing.burstTyping && Math.random() < 0.3) {
        charDelay = charDelay * 0.5;
      }

      await delay(charDelay);
    }
  }

  /**
   * 오타 시뮬레이션
   */
  async _simulateTypo(char, typoType) {
    const { typing } = this.profile;

    switch (typoType) {
      case 'adjacent':
        // 인접 키 오타
        const wrongChar = KoreanTypoGenerator.getAdjacentTypo(char);
        await this.page.keyboard.type(wrongChar);
        await delay(typing.correctionSpeed);
        await this.page.keyboard.press('Backspace');
        await delay(randomBetween(100, 200));
        await this.page.keyboard.type(char);
        break;

      case 'double':
        // 키 두 번 누름
        await this.page.keyboard.type(char);
        await this.page.keyboard.type(char);
        await delay(typing.correctionSpeed);
        await this.page.keyboard.press('Backspace');
        break;

      case 'skip':
        // 글자 빠뜨림 (나중에 발견하고 수정)
        // 실제로는 그냥 입력하지 않음 - 자연스러운 불완전함
        break;

      case 'transposition':
        // 순서 바꿈 (중장년층 특징)
        await this.page.keyboard.type(char);
        break;

      default:
        await this.page.keyboard.type(char);
    }
  }

  /**
   * 자동완성 클릭 시도
   */
  async _tryClickAutocomplete(targetQuery) {
    try {
      // 자동완성 목록 대기
      await this.page.waitForSelector(
        SELECTORS.autocomplete.container,
        { timeout: 2000, state: 'visible' }
      ).catch(() => null);

      // 자동완성 아이템 찾기
      const items = await this.page.$$(SELECTORS.autocomplete.items);

      if (items.length === 0) {
        return false;
      }

      // 타겟 검색어와 유사한 항목 찾기
      for (let i = 0; i < Math.min(items.length, 5); i++) {
        const itemText = await items[i].textContent().catch(() => '');

        if (itemText.includes(targetQuery) || targetQuery.includes(itemText.trim())) {
          // 호버 시간 (나이대별)
          const hoverTime = randomBetween(...this.profile.click.hoverTime);
          await delay(hoverTime);

          await items[i].click();
          return true;
        }
      }

      // 정확한 매칭이 없으면 첫 번째 항목 선택 (확률적)
      if (this.profile.typing.autocompleteFirst && Math.random() < 0.5) {
        await delay(randomBetween(300, 600));
        await items[0].click();
        return true;
      }

      return false;

    } catch {
      return false;
    }
  }

  /**
   * 검색 제출
   */
  async _submitSearch() {
    // 80%는 Enter 키, 20%는 검색 버튼 클릭
    if (Math.random() < 0.8) {
      await this.page.keyboard.press('Enter');
    } else {
      try {
        await this.page.click(SELECTORS.mainSearchButton, { timeout: 2000 });
      } catch {
        await this.page.keyboard.press('Enter');
      }
    }
  }

  /**
   * 한글 음절 체크
   */
  _isKoreanSyllable(char) {
    const code = char.charCodeAt(0);
    return code >= 0xAC00 && code <= 0xD7A3;
  }
}

/**
 * NaverNavigationAction - 네이버 메뉴 네비게이션
 *
 * 검색 외 다른 경로로 콘텐츠 접근
 */
export class NaverNavigationAction {
  constructor(page, ageGroup) {
    this.page = page;
    this.profile = getAgeProfile(ageGroup);
  }

  /**
   * 메인 페이지로 이동
   */
  async goToMain() {
    await this.page.goto(NAVER_URLS.main, { waitUntil: 'domcontentloaded' });
    await this._naturalScroll();
  }

  /**
   * 메뉴에서 서비스 선택
   * @param {string} serviceName - 'shopping', 'news', 'sports', etc.
   */
  async navigateToService(serviceName) {
    const selector = SELECTORS.mainMenu[serviceName];

    if (!selector) {
      // 직접 URL로 이동
      const url = NAVER_URLS.services[serviceName];
      if (url) {
        await this.page.goto(url, { waitUntil: 'domcontentloaded' });
        return { method: 'direct', service: serviceName };
      }
      throw new Error(`Unknown service: ${serviceName}`);
    }

    try {
      // 메뉴 찾기
      await this._naturalScroll();
      await delay(randomBetween(500, 1000));

      // 클릭
      const hoverTime = randomBetween(...this.profile.click.hoverTime);
      await this.page.hover(selector);
      await delay(hoverTime);
      await this.page.click(selector);

      await this.page.waitForLoadState('domcontentloaded');
      return { method: 'menu', service: serviceName };

    } catch {
      // 실패 시 직접 URL로
      const url = NAVER_URLS.services[serviceName];
      if (url) {
        await this.page.goto(url, { waitUntil: 'domcontentloaded' });
        return { method: 'fallback', service: serviceName };
      }
      throw new Error(`Cannot navigate to: ${serviceName}`);
    }
  }

  /**
   * 검색 결과에서 탭 전환
   * @param {string} tabName - 'blog', 'news', 'video', 'shopping', etc.
   */
  async switchSearchTab(tabName) {
    const selector = SELECTORS.searchTabs[tabName];

    if (!selector) {
      throw new Error(`Unknown tab: ${tabName}`);
    }

    try {
      await this.page.click(selector, { timeout: 3000 });
      await this.page.waitForLoadState('domcontentloaded');
      return true;
    } catch {
      // 탭이 없으면 직접 검색 URL로
      const currentUrl = this.page.url();
      const queryMatch = currentUrl.match(/query=([^&]+)/);

      if (queryMatch) {
        const query = decodeURIComponent(queryMatch[1]);
        const tabUrl = NAVER_URLS.search[tabName];
        if (tabUrl) {
          await this.page.goto(tabUrl + encodeURIComponent(query), {
            waitUntil: 'domcontentloaded'
          });
          return true;
        }
      }
      return false;
    }
  }

  /**
   * 자연스러운 스크롤
   */
  async _naturalScroll() {
    const { scroll } = this.profile;
    const [minStep, maxStep] = scroll.stepSize;
    const [minPause, maxPause] = scroll.pauseBetween;

    const steps = Math.floor(randomBetween(1, 3));

    for (let i = 0; i < steps; i++) {
      const distance = randomBetween(minStep, maxStep) * 0.5;

      await this.page.mouse.wheel({ deltaY: distance });
      await delay(randomBetween(minPause, maxPause));
    }
  }
}

/**
 * NaverContentAction - 콘텐츠 상호작용 (CDP 터치 기반)
 *
 * 블로그, 뉴스, 영상, 쇼핑 아이템과 상호작용
 * CDP 터치로 실제 모바일 사용자 행동 시뮬레이션
 */
export class NaverContentAction {
  constructor(page, ageGroup, cdp = null) {
    this.page = page;
    this.profile = getAgeProfile(ageGroup);
    this.cdp = cdp;
  }

  /**
   * CDP 세션 설정
   */
  setCdp(cdp) {
    this.cdp = cdp;
  }

  /**
   * 콘텐츠 아이템 클릭
   * @param {string} type - 'blog', 'news', 'video', 'shop', 'place'
   * @param {Object} options - 옵션
   */
  async clickContent(type, options = {}) {
    const {
      position = 'random',  // 'first', 'random', 'random_top5', number
      scrollFirst = true
    } = options;

    const selector = SELECTORS.content[`${type}Items`];
    if (!selector) {
      throw new Error(`Unknown content type: ${type}`);
    }

    // 스크롤하며 콘텐츠 탐색
    if (scrollFirst) {
      await this._browseContent();
    }

    // 아이템 목록 가져오기
    const items = await this.page.$$(selector);

    if (items.length === 0) {
      return { success: false, reason: 'no_items' };
    }

    // 위치 선택
    let targetIndex;
    if (position === 'first') {
      targetIndex = 0;
    } else if (position === 'random') {
      targetIndex = Math.floor(Math.random() * items.length);
    } else if (position === 'random_top5') {
      targetIndex = Math.floor(Math.random() * Math.min(5, items.length));
    } else if (typeof position === 'number') {
      targetIndex = Math.min(position, items.length - 1);
    } else {
      targetIndex = Math.floor(Math.random() * Math.min(10, items.length));
    }

    const item = items[targetIndex];

    try {
      // 뷰포트로 스크롤
      await item.scrollIntoViewIfNeeded();
      await delay(randomBetween(300, 600));

      // 호버
      const hoverTime = randomBetween(...this.profile.click.hoverTime);
      await item.hover();
      await delay(hoverTime);

      // 클릭
      await item.click();
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});

      return {
        success: true,
        position: targetIndex + 1,
        totalItems: items.length
      };

    } catch (error) {
      return { success: false, reason: error.message };
    }
  }

  /**
   * 콘텐츠 읽기 (CDP 터치 스크롤 + 체류)
   * @param {number} baseDuration - 기본 체류 시간 (초)
   */
  async readContent(baseDuration = 30) {
    // 나이대별 체류 시간 조정
    const actualDuration = baseDuration * this.profile.dwellTimeMultiplier;
    const endTime = Date.now() + actualDuration * 1000;

    const { scroll } = this.profile;
    let scrollCount = 0;
    let totalScrollDistance = 0;

    // CDP 터치 스크롤 사용 (있으면)
    if (this.cdp) {
      while (Date.now() < endTime) {
        // 터치 거리 (나이대별)
        const [minStep, maxStep] = scroll.stepSize;
        const touchDist = Math.floor(randomBetween(minStep * 0.4, maxStep * 0.6));

        const result = await flickScroll(this.page, this.cdp, touchDist, {
          duration: 80 + Math.floor(Math.random() * 50),
          wobble: true,
          verbose: false
        });

        totalScrollDistance += result.actualDistance;
        scrollCount++;

        // 읽기 시간 (나이대별)
        const [minPause, maxPause] = scroll.pauseBetween;
        const readTime = randomBetween(minPause, maxPause) * scroll.readingTime;
        await delay(readTime);

        // 가끔 위로 스크롤 (다시 읽기)
        if (Math.random() < 0.1) {
          await scrollUp(this.page, this.cdp, 50 + Math.floor(Math.random() * 100));
          await delay(randomBetween(500, 1500));
        }

        // 페이지 끝 체크
        if (result.actualDistance < 50) {
          const remaining = (endTime - Date.now());
          if (remaining > 0) {
            await delay(Math.min(remaining, 5000));
          }
          break;
        }
      }
    } else {
      // 폴백: 기존 wheel 방식
      const [minStep, maxStep] = scroll.stepSize;
      const [minPause, maxPause] = scroll.pauseBetween;

      while (Date.now() < endTime) {
        const distance = randomBetween(minStep, maxStep);
        await this.page.mouse.wheel({ deltaY: distance });
        totalScrollDistance += distance;
        scrollCount++;

        const readTime = randomBetween(minPause, maxPause) * scroll.readingTime;
        await delay(readTime);

        if (Math.random() < 0.1) {
          await this.page.mouse.wheel({ deltaY: -randomBetween(50, 150) });
          await delay(randomBetween(500, 1500));
        }

        const scrollTop = await this.page.evaluate(() => window.scrollY);
        const scrollHeight = await this.page.evaluate(() => document.body.scrollHeight);
        const viewportHeight = await this.page.evaluate(() => window.innerHeight);

        if (scrollTop + viewportHeight >= scrollHeight - 100) {
          const remaining = (endTime - Date.now());
          if (remaining > 0) {
            await delay(Math.min(remaining, 5000));
          }
          break;
        }
      }
    }

    return {
      duration: actualDuration,
      scrollCount,
      totalScrollDistance
    };
  }

  /**
   * 콘텐츠 목록 탐색 (클릭 전 CDP 터치 스크롤)
   */
  async _browseContent() {
    const { scroll } = this.profile;
    const [minStep, maxStep] = scroll.stepSize;
    const [minPause, maxPause] = scroll.pauseBetween;

    // 1~3번 스크롤
    const scrollCount = Math.floor(randomBetween(1, 4));

    if (this.cdp) {
      // CDP 터치 스크롤 (scrolllog/v2 호환)
      for (let i = 0; i < scrollCount; i++) {
        const touchDist = Math.floor(randomBetween(minStep * 0.4, maxStep * 0.5));

        await flickScroll(this.page, this.cdp, touchDist, {
          duration: 80 + Math.floor(Math.random() * 50),
          wobble: true,
          verbose: false
        });

        await delay(randomBetween(minPause, maxPause));

        // 가끔 멈춰서 읽기
        if (Math.random() < 0.3) {
          await delay(randomBetween(1000, 2000) * this.profile.scroll.readingTime);
        }
      }
    } else {
      // 폴백: wheel 방식
      for (let i = 0; i < scrollCount; i++) {
        const distance = randomBetween(minStep, maxStep);
        await this.page.mouse.wheel({ deltaY: distance });
        await delay(randomBetween(minPause, maxPause));

        if (Math.random() < 0.3) {
          await delay(randomBetween(1000, 2000) * this.profile.scroll.readingTime);
        }
      }
    }
  }

  /**
   * 뒤로 가기
   */
  async goBack() {
    await delay(randomBetween(300, 600));
    await this.page.goBack().catch(() => {});
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    await delay(randomBetween(500, 1000));
  }
}

/**
 * 통합 액션 팩토리 (CDP 터치 지원)
 *
 * @param {Page} page - Playwright 페이지
 * @param {string} ageGroup - 나이대 ('10', '20', '30', '40', '50')
 * @param {CDPSession} cdp - CDP 세션 (선택, CDP 터치 스크롤 활성화)
 */
export function createNaverActions(page, ageGroup, cdp = null) {
  const searchAction = new NaverSearchAction(page, ageGroup);
  const navigationAction = new NaverNavigationAction(page, ageGroup);
  const contentAction = new NaverContentAction(page, ageGroup, cdp);

  return {
    search: searchAction,
    navigation: navigationAction,
    content: contentAction,

    // CDP 세션 설정 (나중에 설정 가능)
    setCdp(cdpSession) {
      contentAction.setCdp(cdpSession);
    },

    // 편의 메서드
    async doSearch(query, options) {
      return searchAction.search(query, options);
    },

    async goToService(serviceName) {
      return navigationAction.navigateToService(serviceName);
    },

    async clickItem(type, options) {
      return contentAction.clickContent(type, options);
    },

    async readAndReturn(duration) {
      const result = await contentAction.readContent(duration);
      await contentAction.goBack();
      return result;
    },

    // CDP 터치 스크롤 메서드 (직접 접근용)
    async flickScroll(touchDist = 150, options = {}) {
      if (!cdp) throw new Error('CDP 세션이 필요합니다');
      return flickScroll(page, cdp, touchDist, options);
    },

    async naturalScroll(options = {}) {
      if (!cdp) throw new Error('CDP 세션이 필요합니다');
      return naturalBrowseScroll(page, cdp, options);
    },

    async scrollUp(distance = 100, options = {}) {
      if (!cdp) throw new Error('CDP 세션이 필요합니다');
      return scrollUp(page, cdp, distance, options);
    },

    async tap(x, y, options = {}) {
      if (!cdp) throw new Error('CDP 세션이 필요합니다');
      return touchTap(page, cdp, x, y, options);
    },

    async tapElement(selector, options = {}) {
      if (!cdp) throw new Error('CDP 세션이 필요합니다');
      return tapElement(page, cdp, selector, options);
    }
  };
}

export default {
  NAVER_URLS,
  SELECTORS,
  NaverSearchAction,
  NaverNavigationAction,
  NaverContentAction,
  createNaverActions
};
