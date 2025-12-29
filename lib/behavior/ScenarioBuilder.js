/**
 * ScenarioBuilder - 페르소나 기반 시나리오 생성기
 *
 * 페르소나 속성 (나이, 성별, 직업)에 따라
 * 자연스러운 브라우징 시나리오를 생성합니다.
 *
 * 시나리오 유형:
 * 1. 검색 중심 - 특정 키워드 검색 후 탐색
 * 2. 브라우징 중심 - 메뉴 탐색, 추천 콘텐츠 클릭
 * 3. 혼합 - 검색 + 메뉴 조합
 *
 * 콘텐츠 타입:
 * - 블로그: 리뷰, 정보 글
 * - 뉴스: 시사, 연예, 스포츠
 * - 영상: 유튜브 검색 결과
 * - 쇼핑: 상품 검색
 * - 플레이스: 맛집, 카페, 장소
 */

import { getAgeProfile, AGE_GROUPS } from './AgeProfiles.js';
import { createNaverActions, NAVER_URLS } from './NaverActions.js';

// === 검색어 풀 (페르소나 속성별) ===
const SEARCH_KEYWORDS = {
  // 성별별 관심사
  byGender: {
    M: [
      '노트북 추천', '운동화 추천', '헬스장 근처', '자동차 리뷰',
      'IT 뉴스', '축구 경기 결과', '맥북 vs 삼성', '게이밍 모니터'
    ],
    F: [
      '화장품 추천', '다이어트 식단', '네일아트 디자인', '카페 맛집',
      '원피스 코디', '피부관리', '헤어스타일', '인테리어 소품'
    ]
  },

  // 나이대별 관심사
  byAge: {
    '10': [
      '아이돌 콘서트', '게임 공략', '학원 추천', '간식 맛집',
      'kpop 신곡', '유튜버 추천', '학교 앞 맛집', '핸드폰 케이스'
    ],
    '20': [
      '자취 꿀템', '취업 준비', '자격증 추천', '소개팅 장소',
      '데이트 코스', '여행지 추천', '알바 추천', '고시원 추천'
    ],
    '30': [
      '신혼여행', '육아용품', '아파트 분양', '재테크 방법',
      '가성비 가전', '어린이집 추천', '보험 추천', '주식 입문'
    ],
    '40': [
      '건강 검진', '자녀 교육', '노후 준비', '중년 패션',
      '등산 코스', '골프 연습장', '건강식품', '리모델링'
    ],
    '50': [
      '관절 건강', '노후 대비', '효도 여행', '건강 보조제',
      '은퇴 준비', '취미 생활', '당뇨 관리', '무릎 운동'
    ]
  },

  // 직업별 관심사
  byOccupation: {
    student: [
      '과제 도움', '도서관 위치', '학식 메뉴', '노트 정리법',
      '시험 기간 카페', '스터디카페 추천'
    ],
    office: [
      '점심 맛집', '커피숍 추천', '업무용 노트북', '출퇴근 앱',
      '연차 사용', '회식 장소'
    ],
    freelance: [
      '코워킹스페이스', '재택근무 장비', '프리랜서 세금',
      '미팅 장소', '카페 와이파이'
    ],
    housewife: [
      '반찬 만들기', '육아 정보', '주부 운동', '살림 꿀팁',
      '마트 할인', '아이 간식'
    ],
    retired: [
      '노인 복지', '건강 관리', '시니어 취미', '동호회 추천',
      '공원 산책', '복지관 프로그램'
    ]
  },

  // 범용 (누구나 관심 있는)
  universal: [
    '날씨', '오늘 뉴스', '맛집 추천', '영화 추천',
    '택배 조회', '로또 당첨번호', '환율', '부동산'
  ]
};

// === 콘텐츠 탐색 패턴 ===
const CONTENT_PATTERNS = {
  // 블로그 읽기
  blog: {
    weight: 0.3,  // 전체 중 30%
    actions: ['search', 'click_blog', 'read', 'back'],
    dwellTime: { min: 60, max: 180 },  // 1~3분
    scrollDepth: 0.7
  },

  // 뉴스 읽기
  news: {
    weight: 0.2,
    actions: ['menu_news', 'click_article', 'read', 'back'],
    dwellTime: { min: 30, max: 120 },
    scrollDepth: 0.8
  },

  // 영상 시청
  video: {
    weight: 0.15,
    actions: ['search', 'tab_video', 'click_video', 'watch', 'back'],
    dwellTime: { min: 60, max: 300 },  // 1~5분
    scrollDepth: 0.3
  },

  // 쇼핑 탐색
  shopping: {
    weight: 0.25,
    actions: ['search_shopping', 'scroll', 'click_item', 'read', 'back', 'click_another'],
    dwellTime: { min: 30, max: 90 },
    scrollDepth: 0.5
  },

  // 플레이스 탐색
  place: {
    weight: 0.1,
    actions: ['search_place', 'click_place', 'read_reviews', 'back'],
    dwellTime: { min: 45, max: 120 },
    scrollDepth: 0.6
  }
};

/**
 * ScenarioBuilder - 시나리오 생성기
 */
class ScenarioBuilder {
  constructor(persona) {
    this.persona = persona;
    this.ageGroup = persona.ageGroup || persona.age_group || '30';
    this.gender = persona.gender || 'M';
    this.occupation = persona.occupation || persona.job || 'office';
    this.profile = getAgeProfile(this.ageGroup);
  }

  /**
   * 검색어 선택
   * 페르소나 속성에 맞는 검색어를 확률적으로 선택
   */
  selectKeyword() {
    const candidates = [];

    // 성별 키워드 (40%)
    const genderKeywords = SEARCH_KEYWORDS.byGender[this.gender] || [];
    candidates.push(...genderKeywords.map(k => ({ keyword: k, weight: 0.4 })));

    // 나이 키워드 (35%)
    const ageKeywords = SEARCH_KEYWORDS.byAge[this.ageGroup] || [];
    candidates.push(...ageKeywords.map(k => ({ keyword: k, weight: 0.35 })));

    // 직업 키워드 (15%)
    const occupationKeywords = SEARCH_KEYWORDS.byOccupation[this.occupation] || [];
    candidates.push(...occupationKeywords.map(k => ({ keyword: k, weight: 0.15 })));

    // 범용 키워드 (10%)
    candidates.push(...SEARCH_KEYWORDS.universal.map(k => ({ keyword: k, weight: 0.1 })));

    // 가중치 기반 랜덤 선택
    const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
    let random = Math.random() * totalWeight;

    for (const candidate of candidates) {
      random -= candidate.weight;
      if (random <= 0) {
        return candidate.keyword;
      }
    }

    return candidates[0]?.keyword || '맛집 추천';
  }

  /**
   * 콘텐츠 타입 선택
   * 나이대별 선호도 반영
   */
  selectContentType() {
    // 나이대별 가중치 조정
    const adjustedWeights = { ...CONTENT_PATTERNS };

    // 젊은 층: 영상 선호
    if (this.ageGroup === '10' || this.ageGroup === '20') {
      adjustedWeights.video.weight *= 1.5;
      adjustedWeights.shopping.weight *= 1.3;
    }

    // 중장년층: 뉴스, 블로그 선호
    if (this.ageGroup === '40' || this.ageGroup === '50') {
      adjustedWeights.news.weight *= 1.5;
      adjustedWeights.blog.weight *= 1.3;
      adjustedWeights.video.weight *= 0.5;
    }

    // 가중치 기반 선택
    const types = Object.entries(adjustedWeights);
    const totalWeight = types.reduce((sum, [_, p]) => sum + p.weight, 0);
    let random = Math.random() * totalWeight;

    for (const [type, pattern] of types) {
      random -= pattern.weight;
      if (random <= 0) {
        return type;
      }
    }

    return 'blog';
  }

  /**
   * 완전한 시나리오 생성
   * @param {number} actionCount - 액션 수 (3~8)
   * @returns {Object} 시나리오 객체
   */
  buildScenario(actionCount = null) {
    // 액션 수 결정 (나이대에 따라)
    const baseCount = actionCount || Math.floor(Math.random() * 4) + 3;  // 3~6
    const adjustedCount = Math.round(baseCount * this.profile.dwellTimeMultiplier);

    const scenario = {
      personaId: this.persona.id,
      personaCode: this.persona.code,
      profile: {
        ageGroup: this.ageGroup,
        gender: this.gender,
        occupation: this.occupation
      },
      totalDuration: 0,
      actions: []
    };

    // 시작 액션: 메인 페이지
    scenario.actions.push({
      type: 'navigate',
      target: 'main',
      url: NAVER_URLS.main,
      dwellTime: this._randomDwell(5, 15)
    });

    // 중간 액션들 생성
    for (let i = 0; i < adjustedCount; i++) {
      const action = this._generateAction(i, adjustedCount);
      scenario.actions.push(action);
      scenario.totalDuration += action.dwellTime || 0;
    }

    // 종료 액션
    scenario.actions.push({
      type: 'exit',
      dwellTime: 0
    });

    return scenario;
  }

  /**
   * 단일 액션 생성
   */
  _generateAction(index, total) {
    // 첫 액션은 검색 또는 메뉴 클릭
    if (index === 0) {
      return this._buildSearchAction();
    }

    // 마지막 전 액션은 종료 준비
    if (index === total - 1) {
      return {
        type: 'scroll',
        direction: 'up',
        dwellTime: this._randomDwell(3, 8)
      };
    }

    // 콘텐츠 타입 기반 액션
    const contentType = this.selectContentType();
    const pattern = CONTENT_PATTERNS[contentType];

    // 랜덤 액션 선택
    const actionType = pattern.actions[Math.floor(Math.random() * pattern.actions.length)];

    return this._buildActionByType(actionType, contentType, pattern);
  }

  /**
   * 검색 액션 생성
   */
  _buildSearchAction() {
    const keyword = this.selectKeyword();

    return {
      type: 'search',
      keyword,
      useAutocomplete: Math.random() < this.profile.typing.autocompleteProbability,
      dwellTime: this._randomDwell(10, 30)
    };
  }

  /**
   * 타입별 액션 생성
   */
  _buildActionByType(actionType, contentType, pattern) {
    switch (actionType) {
      case 'search':
        return this._buildSearchAction();

      case 'search_shopping':
        return {
          type: 'search',
          keyword: this.selectKeyword(),
          searchType: 'shopping',
          url: NAVER_URLS.search.shopping,
          dwellTime: this._randomDwell(15, 45)
        };

      case 'search_place':
        return {
          type: 'search',
          keyword: this._getPlaceKeyword(),
          searchType: 'place',
          url: NAVER_URLS.search.place,
          dwellTime: this._randomDwell(20, 60)
        };

      case 'click_blog':
      case 'click_article':
      case 'click_video':
      case 'click_item':
      case 'click_place':
        return {
          type: 'click',
          contentType,
          position: Math.random() < 0.6 ? 'random_top5' : 'random',
          dwellTime: this._randomDwell(pattern.dwellTime.min, pattern.dwellTime.max)
        };

      case 'click_another':
        return {
          type: 'click',
          contentType,
          position: 'random',
          dwellTime: this._randomDwell(15, 45)
        };

      case 'read':
      case 'watch':
      case 'read_reviews':
        return {
          type: 'dwell',
          scrollDepth: pattern.scrollDepth,
          dwellTime: this._randomDwell(pattern.dwellTime.min, pattern.dwellTime.max)
        };

      case 'scroll':
        return {
          type: 'scroll',
          direction: 'down',
          amount: Math.random() < 0.5 ? 'partial' : 'full',
          dwellTime: this._randomDwell(5, 20)
        };

      case 'back':
        return {
          type: 'back',
          dwellTime: this._randomDwell(3, 8)
        };

      case 'menu_news':
        return {
          type: 'navigate',
          target: 'news',
          method: 'menu',
          dwellTime: this._randomDwell(10, 30)
        };

      case 'tab_video':
        return {
          type: 'switch_tab',
          tab: 'video',
          dwellTime: this._randomDwell(5, 15)
        };

      default:
        return {
          type: 'scroll',
          direction: 'down',
          dwellTime: this._randomDwell(5, 15)
        };
    }
  }

  /**
   * 장소 검색어 생성
   */
  _getPlaceKeyword() {
    const places = ['맛집', '카페', '음식점', '술집', '베이커리'];
    const areas = ['강남', '홍대', '신촌', '명동', '이태원', '건대', '합정', '망원'];

    const place = places[Math.floor(Math.random() * places.length)];
    const area = areas[Math.floor(Math.random() * areas.length)];

    return `${area} ${place}`;
  }

  /**
   * 나이대별 체류 시간 계산
   */
  _randomDwell(min, max) {
    const base = min + Math.random() * (max - min);
    return Math.round(base * this.profile.dwellTimeMultiplier);
  }
}

/**
 * ScenarioExecutor - 시나리오 실행기
 *
 * ScenarioBuilder가 생성한 시나리오를 실제로 실행
 */
export class ScenarioExecutor {
  constructor(page, persona, options = {}) {
    this.page = page;
    this.persona = persona;
    this.ageGroup = persona.ageGroup || persona.age_group || '30';
    this.actions = createNaverActions(page, this.ageGroup);
    this.debug = options.debug || false;
    this.results = [];
  }

  /**
   * 시나리오 실행
   * @param {Object} scenario - ScenarioBuilder가 생성한 시나리오
   */
  async execute(scenario) {
    this._log(`시나리오 시작: ${scenario.actions.length}개 액션`);

    const startTime = Date.now();

    for (let i = 0; i < scenario.actions.length; i++) {
      const action = scenario.actions[i];

      try {
        this._log(`액션 ${i + 1}/${scenario.actions.length}: ${action.type}`);

        const result = await this._executeAction(action);
        this.results.push({
          index: i,
          action: action.type,
          success: true,
          ...result
        });

      } catch (error) {
        this._log(`액션 실패: ${error.message}`, 'error');
        this.results.push({
          index: i,
          action: action.type,
          success: false,
          error: error.message
        });
      }

      // 액션 간 자연스러운 간격
      if (i < scenario.actions.length - 1) {
        const delay = 500 + Math.random() * 1500;
        await new Promise(r => setTimeout(r, delay));
      }
    }

    const totalDuration = (Date.now() - startTime) / 1000;
    this._log(`시나리오 완료: ${totalDuration.toFixed(1)}초`);

    return {
      success: this.results.filter(r => r.success).length / this.results.length > 0.7,
      totalDuration,
      actionResults: this.results
    };
  }

  /**
   * 단일 액션 실행
   */
  async _executeAction(action) {
    switch (action.type) {
      case 'navigate':
        return this._doNavigate(action);

      case 'search':
        return this._doSearch(action);

      case 'click':
        return this._doClick(action);

      case 'dwell':
        return this._doDwell(action);

      case 'scroll':
        return this._doScroll(action);

      case 'back':
        return this._doBack(action);

      case 'switch_tab':
        return this._doSwitchTab(action);

      case 'exit':
        return { action: 'exit' };

      default:
        this._log(`알 수 없는 액션: ${action.type}`, 'warn');
        return { action: 'unknown' };
    }
  }

  async _doNavigate(action) {
    if (action.url) {
      await this.page.goto(action.url, { waitUntil: 'domcontentloaded' });
    } else if (action.target) {
      await this.actions.navigation.navigateToService(action.target);
    }

    if (action.dwellTime) {
      await this._wait(action.dwellTime);
    }

    return { navigated: action.target || action.url };
  }

  async _doSearch(action) {
    const result = await this.actions.search.search(action.keyword, {
      useAutocomplete: action.useAutocomplete
    });

    await this.page.waitForLoadState('domcontentloaded').catch(() => {});

    if (action.dwellTime) {
      await this._wait(action.dwellTime);
    }

    return { searched: action.keyword, method: result.method };
  }

  async _doClick(action) {
    const result = await this.actions.content.clickContent(action.contentType, {
      position: action.position
    });

    if (action.dwellTime && result.success) {
      await this.actions.content.readContent(action.dwellTime);
    }

    return result;
  }

  async _doDwell(action) {
    const result = await this.actions.content.readContent(action.dwellTime || 30);
    return result;
  }

  async _doScroll(action) {
    const profile = getAgeProfile(this.ageGroup);
    const [minStep, maxStep] = profile.scroll.stepSize;

    if (action.amount === 'full') {
      // 전체 스크롤
      const scrollHeight = await this.page.evaluate(() => document.body.scrollHeight);
      const viewportHeight = await this.page.evaluate(() => window.innerHeight);
      const steps = Math.ceil(scrollHeight / viewportHeight);

      for (let i = 0; i < steps; i++) {
        await this.page.mouse.wheel({ deltaY: viewportHeight * 0.8 });
        await new Promise(r => setTimeout(r, profile.scroll.pauseBetween[0] + Math.random() * 500));
      }
    } else {
      // 부분 스크롤
      const distance = minStep + Math.random() * (maxStep - minStep);
      await this.page.mouse.wheel({ deltaY: distance });
    }

    if (action.dwellTime) {
      await this._wait(action.dwellTime);
    }

    return { scrolled: action.amount || 'partial' };
  }

  async _doBack(action) {
    await this.actions.content.goBack();

    if (action.dwellTime) {
      await this._wait(action.dwellTime);
    }

    return { action: 'back' };
  }

  async _doSwitchTab(action) {
    const success = await this.actions.navigation.switchSearchTab(action.tab);

    if (action.dwellTime) {
      await this._wait(action.dwellTime);
    }

    return { switched: action.tab, success };
  }

  async _wait(seconds) {
    // 가끔 스크롤하면서 대기
    const endTime = Date.now() + seconds * 1000;

    while (Date.now() < endTime) {
      const remaining = endTime - Date.now();

      if (remaining > 3000 && Math.random() < 0.2) {
        await this.page.mouse.wheel({ deltaY: 50 + Math.random() * 100 });
      }

      await new Promise(r => setTimeout(r, Math.min(remaining, 2000)));
    }
  }

  _log(message, level = 'info') {
    if (!this.debug && level === 'info') return;

    const prefix = `[ScenarioExecutor]`;
    const personaCode = this.persona?.code || 'Unknown';

    console.log(`${prefix} [${personaCode}] ${message}`);
  }
}

/**
 * 편의 함수: 페르소나 기반 자동 시나리오 생성 및 실행
 */
export async function runPersonaScenario(page, persona, options = {}) {
  const builder = new ScenarioBuilder(persona);
  const scenario = builder.buildScenario(options.actionCount);

  const executor = new ScenarioExecutor(page, persona, options);
  const result = await executor.execute(scenario);

  return {
    scenario,
    result
  };
}

export { ScenarioBuilder };
export default {
  ScenarioBuilder,
  ScenarioExecutor,
  runPersonaScenario,
  SEARCH_KEYWORDS,
  CONTENT_PATTERNS
};
