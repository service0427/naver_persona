/**
 * PersonaScenario - 페르소나별 행동 시나리오 정의
 *
 * 최종 목표: 쇼핑 검색을 자연스럽게 만들기 위한
 * 사전 학습 시나리오 생성
 */

// 네이버 서비스 URL 매핑
const SERVICE_URLS = {
  news: {
    base: 'https://news.naver.com',
    mobile: 'https://m.news.naver.com',
    sections: {
      politics: '/section/100',
      economy: '/section/101',
      society: '/section/102',
      life: '/section/103',
      it: '/section/105',
      world: '/section/104'
    }
  },
  sports: {
    base: 'https://sports.naver.com',
    mobile: 'https://m.sports.naver.com',
    sections: {
      baseball: '/kbaseball',
      soccer: '/wfootball',
      golf: '/golf',
      esports: '/esports'
    }
  },
  entertain: {
    base: 'https://entertain.naver.com',
    mobile: 'https://m.entertain.naver.com'
  },
  blog: {
    base: 'https://section.blog.naver.com',
    mobile: 'https://m.blog.naver.com',
    search: 'https://m.search.naver.com/search.naver?where=m_blog&query='
  },
  cafe: {
    base: 'https://section.cafe.naver.com',
    mobile: 'https://m.cafe.naver.com',
    search: 'https://m.search.naver.com/search.naver?where=m_cafe&query='
  },
  kin: {
    base: 'https://kin.naver.com',
    mobile: 'https://m.kin.naver.com',
    search: 'https://m.search.naver.com/search.naver?where=m_kin&query='
  },
  shopping: {
    base: 'https://shopping.naver.com',
    mobile: 'https://msearch.shopping.naver.com',
    search: 'https://msearch.shopping.naver.com/search/all?query='
  },
  webtoon: {
    base: 'https://comic.naver.com',
    mobile: 'https://m.comic.naver.com'
  },
  series: {
    base: 'https://series.naver.com',
    mobile: 'https://m.series.naver.com'
  },
  search: {
    base: 'https://search.naver.com',
    mobile: 'https://m.search.naver.com/search.naver?query='
  }
};

// 연령대별 관심사 정의
const AGE_INTERESTS = {
  '2': {  // 20대
    male: ['게임', 'IT기기', '패션', '운동', '자취', '취업', '여행'],
    female: ['패션', '뷰티', '카페', '여행', 'K-POP', '맛집', '인테리어']
  },
  '3': {  // 30대
    male: ['IT기기', '자동차', '육아', '재테크', '골프', '운동', '캠핑'],
    female: ['패션', '인테리어', '요리', '육아', '재테크', '여행', '건강']
  },
  '4': {  // 40대
    male: ['골프', '등산', '자동차', '부동산', '건강', '재테크', '낚시'],
    female: ['교육', '건강', '인테리어', '여행', '요리', '패션', '부동산']
  },
  '5': {  // 50대+
    male: ['건강', '등산', '낚시', '부동산', '은퇴', '여행', '골프'],
    female: ['건강', '여행', '요리', '원예', '종교', '문화', '교육']
  }
};

// 관심사별 서비스 매핑
const INTEREST_SERVICES = {
  '게임': [
    { service: 'news', section: 'it', keywords: ['신작 게임', 'e스포츠'] },
    { service: 'cafe', keywords: ['게임 커뮤니티', 'LOL 공략'] },
    { service: 'webtoon', keywords: [] }
  ],
  'IT기기': [
    { service: 'news', section: 'it', keywords: ['갤럭시', '아이폰', '노트북'] },
    { service: 'blog', keywords: ['IT 리뷰', '전자기기 추천'] },
    { service: 'cafe', keywords: ['IT 커뮤니티'] }
  ],
  '패션': [
    { service: 'blog', keywords: ['데일리룩', '코디 추천'] },
    { service: 'cafe', keywords: ['패션 정보'] },
    { service: 'entertain', keywords: [] }
  ],
  '뷰티': [
    { service: 'blog', keywords: ['화장품 리뷰', '메이크업'] },
    { service: 'cafe', keywords: ['뷰티 정보'] },
    { service: 'entertain', keywords: [] }
  ],
  '자동차': [
    { service: 'news', section: 'economy', keywords: ['자동차', '전기차'] },
    { service: 'cafe', keywords: ['자동차 동호회'] },
    { service: 'blog', keywords: ['자동차 리뷰'] }
  ],
  '육아': [
    { service: 'cafe', keywords: ['맘카페', '육아 정보'] },
    { service: 'blog', keywords: ['육아 일기', '아기 용품'] },
    { service: 'kin', keywords: ['육아 고민'] }
  ],
  '골프': [
    { service: 'sports', section: 'golf', keywords: [] },
    { service: 'cafe', keywords: ['골프 동호회'] },
    { service: 'blog', keywords: ['골프 레슨'] }
  ],
  '등산': [
    { service: 'cafe', keywords: ['등산 동호회', '산행 정보'] },
    { service: 'blog', keywords: ['등산 코스', '등산 장비'] }
  ],
  '요리': [
    { service: 'blog', keywords: ['레시피', '집밥'] },
    { service: 'cafe', keywords: ['요리 정보'] }
  ],
  '인테리어': [
    { service: 'blog', keywords: ['인테리어', '홈스타일링'] },
    { service: 'cafe', keywords: ['인테리어 정보'] }
  ],
  '재테크': [
    { service: 'news', section: 'economy', keywords: ['주식', '부동산', '금리'] },
    { service: 'cafe', keywords: ['재테크 정보'] }
  ],
  '건강': [
    { service: 'news', section: 'life', keywords: ['건강', '의료'] },
    { service: 'blog', keywords: ['건강 정보', '운동'] },
    { service: 'kin', keywords: ['건강 상담'] }
  ],
  '여행': [
    { service: 'blog', keywords: ['여행 후기', '맛집'] },
    { service: 'cafe', keywords: ['여행 정보'] }
  ]
};

// 상품 카테고리별 검색어 흐름
const PRODUCT_SEARCH_FLOWS = {
  '전자기기': {
    problemAware: ['고장', '느림', '오래됨', '불편'],
    infoSearch: ['추천', '비교', '순위', '가성비'],
    comparison: ['vs', '후기', '장단점', '실사용'],
    purchase: ['최저가', '정품', '할인']
  },
  '패션': {
    problemAware: ['올해 트렌드', '코디', '스타일'],
    infoSearch: ['추천', '인기', '신상'],
    comparison: ['후기', '착용샷', '사이즈'],
    purchase: ['쿠폰', '세일', '정품']
  },
  '뷰티': {
    problemAware: ['고민', '관리', '케어'],
    infoSearch: ['추천', '인기', '순위'],
    comparison: ['후기', '발색', '지속력'],
    purchase: ['정품', '샘플', '세트']
  },
  '생활용품': {
    problemAware: ['불편', '필요', '찾는'],
    infoSearch: ['추천', '비교', '후기 좋은'],
    comparison: ['vs', '후기', '가성비'],
    purchase: ['최저가', '무료배송']
  },
  '스포츠': {
    problemAware: ['입문', '시작', '배우기'],
    infoSearch: ['추천', '입문용', '가성비'],
    comparison: ['후기', 'vs', '비교'],
    purchase: ['최저가', '정품']
  }
};

class PersonaScenario {
  /**
   * 페르소나 코드로 시나리오 생성
   * @param {Object} params
   * @param {string} params.personaCode - 페르소나 코드 (예: DW3M-001)
   * @param {string} params.targetProduct - 최종 검색할 상품
   * @param {string} params.productCategory - 상품 카테고리
   * @param {number} params.daysBeforePurchase - 학습 기간 (일)
   */
  static generate({ personaCode, targetProduct, productCategory, daysBeforePurchase = 5 }) {
    // 코드 파싱
    const parsed = this.parseCode(personaCode);
    const { ageGroup, gender, userType, timeSlot } = parsed;

    // 관심사 선택
    const interests = this.selectInterests(ageGroup, gender, productCategory);

    // 검색어 흐름 생성
    const searchFlow = this.generateSearchFlow(targetProduct, productCategory);

    // 일별 시나리오 생성
    const dailyScenarios = this.generateDailyScenarios({
      interests,
      targetProduct,
      productCategory,
      daysBeforePurchase,
      userType,
      timeSlot
    });

    return {
      personaCode,
      targetProduct,
      productCategory,
      interests,
      searchFlow,
      totalDays: daysBeforePurchase,
      dailyScenarios,
      meta: {
        generatedAt: new Date().toISOString(),
        ageGroup,
        gender,
        userType
      }
    };
  }

  /**
   * 간단한 코드 파싱
   */
  static parseCode(code) {
    const match = code.match(/^([MDENL])([WSHFR])([2345])([MF])-(\d{3})$/);
    if (!match) throw new Error(`Invalid persona code: ${code}`);

    const [, timeSlot, userType, ageGroup, gender] = match;
    return { timeSlot, userType, ageGroup, gender };
  }

  /**
   * 연령대/성별에 맞는 관심사 선택
   */
  static selectInterests(ageGroup, gender, productCategory) {
    const genderKey = gender === 'M' ? 'male' : 'female';
    const baseInterests = AGE_INTERESTS[ageGroup]?.[genderKey] || [];

    // 카테고리 관련 관심사 우선
    const categoryRelated = this.getCategoryRelatedInterests(productCategory);

    // 합치고 3~5개 선택
    const combined = [...new Set([...categoryRelated, ...baseInterests])];
    return combined.slice(0, 4 + Math.floor(Math.random() * 2));
  }

  /**
   * 카테고리 관련 관심사
   */
  static getCategoryRelatedInterests(category) {
    const mapping = {
      '전자기기': ['IT기기', '게임'],
      '패션': ['패션'],
      '뷰티': ['뷰티', '패션'],
      '생활용품': ['인테리어', '요리'],
      '스포츠': ['골프', '등산', '운동'],
      '육아': ['육아'],
      '자동차': ['자동차']
    };
    return mapping[category] || [];
  }

  /**
   * 검색어 흐름 생성
   */
  static generateSearchFlow(targetProduct, category) {
    const flow = PRODUCT_SEARCH_FLOWS[category] || PRODUCT_SEARCH_FLOWS['생활용품'];

    // 각 단계별 검색어 생성
    const problemKeyword = `${targetProduct} ${this.randomPick(flow.problemAware)}`;
    const infoKeyword = `${targetProduct} ${this.randomPick(flow.infoSearch)}`;
    const comparisonKeyword = `${targetProduct} ${this.randomPick(flow.comparison)}`;
    const purchaseKeyword = targetProduct;

    return [
      { phase: 'problem', keyword: problemKeyword, service: 'search' },
      { phase: 'info', keyword: infoKeyword, service: 'blog' },
      { phase: 'comparison', keyword: comparisonKeyword, service: 'kin' },
      { phase: 'purchase', keyword: purchaseKeyword, service: 'shopping' }
    ];
  }

  /**
   * 일별 시나리오 생성
   */
  static generateDailyScenarios(params) {
    const { interests, targetProduct, productCategory, daysBeforePurchase, userType, timeSlot } = params;

    const scenarios = [];

    for (let day = 1; day <= daysBeforePurchase; day++) {
      const isLastDay = day === daysBeforePurchase;
      const isResearchPhase = day >= Math.ceil(daysBeforePurchase / 2);

      const actions = [];

      // Phase 1: 관심사 형성 (전반부)
      if (!isResearchPhase) {
        // 뉴스 읽기
        actions.push(this.createNewsAction(interests, userType));

        // 관심사 기반 블로그/카페
        const interest = this.randomPick(interests);
        if (INTEREST_SERVICES[interest]) {
          const serviceInfo = this.randomPick(INTEREST_SERVICES[interest]);
          actions.push(this.createServiceAction(serviceInfo, interest));
        }

        // 20대: 웹툰 추가
        if (params.ageGroup === '2') {
          actions.push({
            service: 'webtoon',
            type: 'browse',
            duration: { min: 300, max: 600 },
            url: SERVICE_URLS.webtoon.mobile
          });
        }
      }

      // Phase 2: 구매 의도 형성 (후반부)
      if (isResearchPhase && !isLastDay) {
        // 블로그 검색
        actions.push({
          service: 'blog',
          type: 'search',
          keyword: `${targetProduct} 추천`,
          duration: { min: 300, max: 600 },
          url: `${SERVICE_URLS.blog.search}${encodeURIComponent(`${targetProduct} 추천`)}`
        });

        // 지식iN 검색
        actions.push({
          service: 'kin',
          type: 'search',
          keyword: `${targetProduct} 후기`,
          duration: { min: 180, max: 360 },
          url: `${SERVICE_URLS.kin.search}${encodeURIComponent(`${targetProduct} 후기`)}`
        });

        // 카페 검색
        actions.push({
          service: 'cafe',
          type: 'search',
          keyword: `${targetProduct} 비교`,
          duration: { min: 300, max: 600 },
          url: `${SERVICE_URLS.cafe.search}${encodeURIComponent(`${targetProduct} 비교`)}`
        });
      }

      // Phase 3: 쇼핑 검색 (마지막 날)
      if (isLastDay) {
        // 최종 블로그 확인
        actions.push({
          service: 'blog',
          type: 'search',
          keyword: `${targetProduct} 구매 후기`,
          duration: { min: 180, max: 360 },
          url: `${SERVICE_URLS.blog.search}${encodeURIComponent(`${targetProduct} 구매 후기`)}`
        });

        // 쇼핑 검색
        actions.push({
          service: 'shopping',
          type: 'search',
          keyword: targetProduct,
          duration: { min: 600, max: 1200 },
          url: `${SERVICE_URLS.shopping.search}${encodeURIComponent(targetProduct)}`,
          actions: ['scroll', 'view_product', 'compare_prices', 'read_reviews']
        });
      }

      scenarios.push({
        day,
        phase: isLastDay ? 'purchase' : (isResearchPhase ? 'research' : 'interest'),
        actions
      });
    }

    return scenarios;
  }

  /**
   * 뉴스 액션 생성
   */
  static createNewsAction(interests, userType) {
    // 관심사에 따른 뉴스 섹션 결정
    let section = 'life';
    if (interests.includes('IT기기') || interests.includes('게임')) section = 'it';
    if (interests.includes('재테크') || interests.includes('자동차')) section = 'economy';
    if (interests.includes('골프')) section = 'sports';

    return {
      service: 'news',
      type: 'browse',
      section,
      duration: { min: 180, max: 360 },
      url: `${SERVICE_URLS.news.mobile}${SERVICE_URLS.news.sections[section] || ''}`
    };
  }

  /**
   * 서비스 액션 생성
   */
  static createServiceAction(serviceInfo, interest) {
    const { service, keywords } = serviceInfo;
    const keyword = keywords.length > 0 ? this.randomPick(keywords) : interest;

    const urlBase = SERVICE_URLS[service];
    let url = urlBase?.mobile || urlBase?.base;

    if (urlBase?.search && keyword) {
      url = `${urlBase.search}${encodeURIComponent(keyword)}`;
    }

    return {
      service,
      type: keywords.length > 0 ? 'search' : 'browse',
      keyword,
      duration: { min: 300, max: 600 },
      url
    };
  }

  /**
   * 배열에서 랜덤 선택
   */
  static randomPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * 서비스 URL 가져오기
   */
  static getServiceUrls() {
    return { ...SERVICE_URLS };
  }

  /**
   * 관심사 목록 가져오기
   */
  static getInterests(ageGroup, gender) {
    const genderKey = gender === 'M' ? 'male' : 'female';
    return AGE_INTERESTS[ageGroup]?.[genderKey] || [];
  }
}

export { SERVICE_URLS, AGE_INTERESTS, INTEREST_SERVICES, PRODUCT_SEARCH_FLOWS };
export default PersonaScenario;
