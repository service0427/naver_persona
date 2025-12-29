/**
 * AgeProfiles - 나이대별 행동 프로필
 *
 * 나이대에 따라 다른 타이핑 속도, 오타율, 스크롤 속도,
 * 검색 패턴 등을 정의합니다.
 *
 * 실제 연구 데이터 기반:
 * - 젊은 층: 빠른 타이핑, 낮은 오타율, 자동완성 적극 활용
 * - 중장년층: 느린 타이핑, 높은 오타율, 자동완성 덜 사용
 * - 노년층: 매우 느린 타이핑, 신중한 행동, 긴 체류 시간
 */

// 나이대 그룹 정의
export const AGE_GROUPS = {
  TEEN: 'teen',           // 10대
  YOUNG_ADULT: 'young',   // 20대
  ADULT: 'adult',         // 30대
  MIDDLE_AGED: 'middle',  // 40대
  SENIOR: 'senior'        // 50대+
};

/**
 * 나이대별 행동 프로필
 */
export const AGE_PROFILES = {
  // === 10대 (teen) ===
  [AGE_GROUPS.TEEN]: {
    name: '10대',

    // 타이핑 특성
    typing: {
      baseDelay: 60,        // 기본 딜레이 (ms) - 매우 빠름
      variance: 25,         // 변동폭
      mistakeRate: 0.008,   // 오타율 0.8% - 낮음
      correctionSpeed: 100, // 오타 수정 속도 (ms)
      burstTyping: true,    // 연속 타이핑 (멈춤 없이)
      autocompleteProbability: 0.7  // 자동완성 사용 확률 70%
    },

    // 스크롤 특성
    scroll: {
      speed: 'fast',
      stepSize: [300, 500],   // 한 번에 스크롤하는 거리
      pauseBetween: [100, 300], // 스크롤 사이 멈춤 (ms)
      readingTime: 0.7        // 읽기 시간 배율 (빠르게 훑음)
    },

    // 클릭 특성
    click: {
      hoverTime: [50, 150],   // 호버 후 클릭까지 시간 (ms)
      doubleClickInterval: [50, 100],
      accuracy: 0.95          // 정확도 (중앙에 가까움)
    },

    // 체류 시간 배율
    dwellTimeMultiplier: 0.7,  // 기본 체류 시간의 70%

    // 검색 패턴
    searchBehavior: {
      useShortKeywords: true,     // 짧은 키워드 선호
      slangUsage: 0.3,            // 신조어/줄임말 사용 30%
      autocompleteFirst: true,    // 자동완성 먼저 시도
      refinementProbability: 0.2  // 검색어 수정 확률 20%
    }
  },

  // === 20대 (young) ===
  [AGE_GROUPS.YOUNG_ADULT]: {
    name: '20대',

    typing: {
      baseDelay: 75,
      variance: 30,
      mistakeRate: 0.012,
      correctionSpeed: 120,
      burstTyping: true,
      autocompleteProbability: 0.6
    },

    scroll: {
      speed: 'fast',
      stepSize: [250, 400],
      pauseBetween: [150, 400],
      readingTime: 0.8
    },

    click: {
      hoverTime: [80, 200],
      doubleClickInterval: [60, 120],
      accuracy: 0.92
    },

    dwellTimeMultiplier: 0.85,

    searchBehavior: {
      useShortKeywords: true,
      slangUsage: 0.15,
      autocompleteFirst: true,
      refinementProbability: 0.25
    }
  },

  // === 30대 (adult) ===
  [AGE_GROUPS.ADULT]: {
    name: '30대',

    typing: {
      baseDelay: 95,
      variance: 35,
      mistakeRate: 0.018,
      correctionSpeed: 150,
      burstTyping: false,
      autocompleteProbability: 0.5
    },

    scroll: {
      speed: 'medium',
      stepSize: [200, 350],
      pauseBetween: [300, 600],
      readingTime: 1.0
    },

    click: {
      hoverTime: [120, 300],
      doubleClickInterval: [80, 150],
      accuracy: 0.88
    },

    dwellTimeMultiplier: 1.0,

    searchBehavior: {
      useShortKeywords: false,
      slangUsage: 0.05,
      autocompleteFirst: false,
      refinementProbability: 0.3
    }
  },

  // === 40대 (middle) ===
  [AGE_GROUPS.MIDDLE_AGED]: {
    name: '40대',

    typing: {
      baseDelay: 130,
      variance: 45,
      mistakeRate: 0.028,
      correctionSpeed: 200,
      burstTyping: false,
      autocompleteProbability: 0.35
    },

    scroll: {
      speed: 'medium',
      stepSize: [150, 280],
      pauseBetween: [400, 800],
      readingTime: 1.2
    },

    click: {
      hoverTime: [200, 400],
      doubleClickInterval: [100, 200],
      accuracy: 0.82
    },

    dwellTimeMultiplier: 1.3,

    searchBehavior: {
      useShortKeywords: false,
      slangUsage: 0.02,
      autocompleteFirst: false,
      refinementProbability: 0.35
    }
  },

  // === 50대+ (senior) ===
  [AGE_GROUPS.SENIOR]: {
    name: '50대+',

    typing: {
      baseDelay: 180,
      variance: 60,
      mistakeRate: 0.042,
      correctionSpeed: 280,
      burstTyping: false,
      autocompleteProbability: 0.2
    },

    scroll: {
      speed: 'slow',
      stepSize: [100, 200],
      pauseBetween: [600, 1200],
      readingTime: 1.5
    },

    click: {
      hoverTime: [300, 600],
      doubleClickInterval: [150, 300],
      accuracy: 0.75
    },

    dwellTimeMultiplier: 1.6,

    searchBehavior: {
      useShortKeywords: false,
      slangUsage: 0,
      autocompleteFirst: false,
      refinementProbability: 0.4  // 검색어 수정 많음 (오타 때문에)
    }
  }
};

/**
 * 나이대 프로필 가져오기
 * @param {string} ageGroup - 나이대 코드 ('10', '20', '30', '40', '50' 또는 enum)
 * @returns {Object} 프로필 객체
 */
export function getAgeProfile(ageGroup) {
  // 숫자 문자열을 enum으로 변환
  const mapping = {
    '10': AGE_GROUPS.TEEN,
    '20': AGE_GROUPS.YOUNG_ADULT,
    '30': AGE_GROUPS.ADULT,
    '40': AGE_GROUPS.MIDDLE_AGED,
    '50': AGE_GROUPS.SENIOR,
    '60': AGE_GROUPS.SENIOR
  };

  const groupKey = mapping[ageGroup] || ageGroup;
  return AGE_PROFILES[groupKey] || AGE_PROFILES[AGE_GROUPS.ADULT];
}

/**
 * 한글 오타 생성기
 * 실제 키보드 레이아웃 기반 인접 키 오타 생성
 */
export const KoreanTypoGenerator = {
  // 두벌식 키보드 자판 배열 (인접 키)
  adjacent: {
    // 자음
    'ㅂ': ['ㅈ', 'ㅁ'],
    'ㅈ': ['ㅂ', 'ㄷ', 'ㅁ', 'ㄴ'],
    'ㄷ': ['ㅈ', 'ㄱ', 'ㄴ', 'ㅇ'],
    'ㄱ': ['ㄷ', 'ㅅ', 'ㅇ', 'ㄹ'],
    'ㅅ': ['ㄱ', 'ㄹ', 'ㅎ'],
    'ㅁ': ['ㅂ', 'ㅈ', 'ㄴ'],
    'ㄴ': ['ㅈ', 'ㄷ', 'ㅁ', 'ㅇ'],
    'ㅇ': ['ㄷ', 'ㄱ', 'ㄴ', 'ㄹ'],
    'ㄹ': ['ㄱ', 'ㅅ', 'ㅇ', 'ㅎ'],
    'ㅎ': ['ㅅ', 'ㄹ'],

    // 모음
    'ㅛ': ['ㅕ', 'ㅗ'],
    'ㅕ': ['ㅛ', 'ㅑ', 'ㅓ'],
    'ㅑ': ['ㅕ', 'ㅏ', 'ㅐ'],
    'ㅐ': ['ㅑ', 'ㅔ'],
    'ㅔ': ['ㅐ'],
    'ㅗ': ['ㅛ', 'ㅓ', 'ㅏ'],
    'ㅓ': ['ㅕ', 'ㅗ', 'ㅏ', 'ㅣ'],
    'ㅏ': ['ㅑ', 'ㅓ', 'ㅣ'],
    'ㅣ': ['ㅓ', 'ㅏ']
  },

  /**
   * 인접 키 오타 생성
   * @param {string} char - 원래 문자
   * @returns {string} 오타 문자
   */
  getAdjacentTypo(char) {
    const adjacents = this.adjacent[char];
    if (adjacents && adjacents.length > 0) {
      return adjacents[Math.floor(Math.random() * adjacents.length)];
    }
    // 인접키가 없으면 랜덤 자모
    return this._getRandomJamo();
  },

  /**
   * 랜덤 자모 반환
   */
  _getRandomJamo() {
    const jamo = 'ㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔㅁㄴㅇㄹㅎㅗㅓㅏㅣㅋㅌㅊㅍ';
    return jamo[Math.floor(Math.random() * jamo.length)];
  },

  /**
   * 오타 타입 결정 (나이대별 확률)
   * @param {Object} profile - 나이대 프로필
   * @returns {string} 오타 타입
   */
  getTypoType(profile) {
    const rand = Math.random();

    if (profile.typing.burstTyping) {
      // 젊은 층: 인접 키 오타가 대부분
      if (rand < 0.7) return 'adjacent';
      if (rand < 0.9) return 'double';  // 키 두 번 누름
      return 'skip';  // 글자 빠뜨림
    } else {
      // 중장년층: 다양한 오타 유형
      if (rand < 0.4) return 'adjacent';
      if (rand < 0.6) return 'wrong_key';  // 완전 다른 키
      if (rand < 0.8) return 'double';
      return 'transposition';  // 순서 바꿈
    }
  }
};

/**
 * 검색어 변형기
 * 나이대별 검색어 특성 적용
 */
export const SearchQueryTransformer = {
  // 신조어/줄임말 매핑
  slangMap: {
    '좋아요': '좋아여',
    '진짜': '레알',
    '맛있는': '맛난',
    '가성비': '가성비갑',
    '추천': '추천템',
    '운동화': '운동화 신상',
    '화장품': '화장품 꿀템'
  },

  /**
   * 나이대에 맞게 검색어 변형
   * @param {string} query - 원래 검색어
   * @param {Object} profile - 나이대 프로필
   * @returns {string} 변형된 검색어
   */
  transform(query, profile) {
    const { searchBehavior } = profile;
    let result = query;

    // 신조어 변환 (젊은 층)
    if (Math.random() < searchBehavior.slangUsage) {
      for (const [original, slang] of Object.entries(this.slangMap)) {
        if (result.includes(original)) {
          result = result.replace(original, slang);
          break;
        }
      }
    }

    // 짧은 키워드 선호 (젊은 층)
    if (searchBehavior.useShortKeywords && result.length > 8) {
      // 불필요한 조사/접미사 제거
      result = result.replace(/을|를|이|가|의|에서|에게|으로|로/g, ' ').trim();
      result = result.replace(/\s+/g, ' ');
    }

    return result;
  },

  /**
   * 자동완성용 검색어 부분 반환
   * 자동완성을 트리거할 만큼만 입력
   * @param {string} query - 전체 검색어
   * @param {Object} profile - 나이대 프로필
   * @returns {string} 부분 검색어
   */
  getAutocompletePartial(query, profile) {
    // 자동완성 사용 확률 체크
    if (Math.random() > profile.typing.autocompleteProbability) {
      return null;  // 자동완성 사용 안 함
    }

    // 검색어의 40~70% 입력
    const ratio = 0.4 + Math.random() * 0.3;
    const length = Math.ceil(query.length * ratio);

    // 최소 2글자 이상
    return query.slice(0, Math.max(2, length));
  }
};

export default {
  AGE_GROUPS,
  AGE_PROFILES,
  getAgeProfile,
  KoreanTypoGenerator,
  SearchQueryTransformer
};
