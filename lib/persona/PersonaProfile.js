/**
 * PersonaProfile - 페르소나별 행동 패턴 및 디바이스 프로필
 *
 * 페르소나 코드를 기반으로 적절한 행동 파라미터와
 * 디바이스 프로필을 생성
 */

import PersonaCode, { TIME_SLOTS, USER_TYPES, AGE_GROUPS, GENDERS } from './PersonaCode.js';

// 디바이스 프로필 정의
const DEVICE_PROFILES = {
  // 삼성 플래그십
  GS24U: {
    code: 'GS24U',
    name: 'Galaxy S24 Ultra',
    model: 'SM-S928N',
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 3.5,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
  },
  GS24P: {
    code: 'GS24P',
    name: 'Galaxy S24+',
    model: 'SM-S926N',
    viewport: { width: 412, height: 883 },
    deviceScaleFactor: 3.0,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S926N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
  },
  GS23U: {
    code: 'GS23U',
    name: 'Galaxy S23 Ultra',
    model: 'SM-S918N',
    viewport: { width: 384, height: 824 },
    deviceScaleFactor: 3.0,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
  },
  GS23P: {
    code: 'GS23P',
    name: 'Galaxy S23+',
    model: 'SM-S916N',
    viewport: { width: 384, height: 832 },
    deviceScaleFactor: 2.8125,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S916N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
  },
  GS22U: {
    code: 'GS22U',
    name: 'Galaxy S22 Ultra',
    model: 'SM-S908N',
    viewport: { width: 384, height: 824 },
    deviceScaleFactor: 3.0,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-S908N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
  },

  // 삼성 중급
  GA54: {
    code: 'GA54',
    name: 'Galaxy A54',
    model: 'SM-A546N',
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-A546N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
  },
  GA34: {
    code: 'GA34',
    name: 'Galaxy A34',
    model: 'SM-A346N',
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-A346N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'
  },

  // 아이폰
  IP15PM: {
    code: 'IP15PM',
    name: 'iPhone 15 Pro Max',
    model: 'iPhone15,3',
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3.0,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  },
  IP15P: {
    code: 'IP15P',
    name: 'iPhone 15 Pro',
    model: 'iPhone15,2',
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3.0,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  },
  IP14P: {
    code: 'IP14P',
    name: 'iPhone 14 Pro',
    model: 'iPhone15,2',
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3.0,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
  },
  IP13: {
    code: 'IP13',
    name: 'iPhone 13',
    model: 'iPhone14,5',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3.0,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
  },
  IPSE3: {
    code: 'IPSE3',
    name: 'iPhone SE 3',
    model: 'iPhone14,6',
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2.0,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
  }
};

// 연령대별 디바이스 분포 (가중치)
const AGE_DEVICE_WEIGHTS = {
  2: { // 20대 - 최신 기종
    GS24U: 15, GS24P: 20, GS23U: 15, GS23P: 15,
    IP15PM: 10, IP15P: 15, IP14P: 10
  },
  3: { // 30대 - 최신~1년 전
    GS24P: 15, GS23U: 20, GS23P: 20, GS22U: 10,
    IP15P: 15, IP14P: 15, IP13: 5
  },
  4: { // 40대 - 1~2년 전
    GS23U: 15, GS23P: 20, GS22U: 20, GA54: 10,
    IP14P: 15, IP13: 15, IPSE3: 5
  },
  5: { // 50대+ - 중급~보급형
    GS23P: 10, GS22U: 15, GA54: 25, GA34: 20,
    IP13: 15, IPSE3: 15
  }
};

// 행동 패턴 정의
const BEHAVIOR_PATTERNS = {
  // 스크롤 속도 (px/ms)
  scrollSpeed: {
    1: { min: 0.3, max: 0.5, label: '매우 느림' },
    2: { min: 0.5, max: 0.8, label: '느림' },
    3: { min: 0.8, max: 1.2, label: '중간' },
    4: { min: 1.2, max: 1.8, label: '빠름' },
    5: { min: 1.8, max: 2.5, label: '매우 빠름' }
  },

  // 세션 길이 (분)
  sessionDuration: {
    short: { min: 5, max: 15 },
    medium: { min: 15, max: 30 },
    long: { min: 30, max: 60 }
  },

  // 체류 시간 (초)
  dwellTime: {
    searchResult: { short: [3, 8], medium: [8, 15], long: [15, 30] },
    productDetail: { short: [10, 20], medium: [20, 45], long: [45, 90] },
    reviewPage: { short: [15, 30], medium: [30, 60], long: [60, 120] }
  }
};

// 관심 카테고리 정의
const INTEREST_CATEGORIES = {
  // 성별 기반
  male: ['전자기기', '컴퓨터', '스포츠', '자동차용품', '게임', '공구'],
  female: ['패션', '뷰티', '생활용품', '식품', '주방용품', '인테리어'],

  // 사용자 유형 기반
  worker: ['비즈니스', '건강식품', '커피/음료'],
  student: ['문구', '도서', '간식', '디지털기기'],
  homemaker: ['식품', '생활용품', '주방', '아동'],
  freelancer: ['사무용품', '전자기기', '인테리어'],
  retired: ['건강', '원예', '취미', '여행']
};

class PersonaProfile {
  /**
   * 페르소나 코드로부터 전체 프로필 생성
   * @param {string} code - 페르소나 코드 (예: DW3M-001)
   * @param {Object} options - 추가 옵션
   * @returns {Object} 전체 프로필
   */
  static generate(code, options = {}) {
    const parsed = PersonaCode.parse(code);
    const { timeSlot, userType, ageGroup, gender } = parsed;

    // 디바이스 선택
    const device = options.device || this.selectDevice(ageGroup.code);

    // 행동 패턴 생성
    const behavior = this.generateBehavior(parsed);

    // 관심 카테고리 생성
    const interests = this.generateInterests(userType.code, gender.code);

    return {
      code,
      description: parsed.description,

      // 시간 정보
      timeSlot: {
        code: timeSlot.code,
        name: timeSlot.name,
        activeHours: this.getActiveHours(timeSlot.code, userType.code)
      },

      // 사용자 정보
      user: {
        type: userType.name,
        ageGroup: ageGroup.range,
        gender: gender.name
      },

      // 디바이스 프로필
      device: {
        ...device,
        isMobile: true,
        hasTouch: true,
        locale: 'ko-KR',
        timezone: 'Asia/Seoul'
      },

      // 행동 패턴
      behavior,

      // 관심 카테고리
      interests,

      // 메타 정보
      meta: {
        generatedAt: new Date().toISOString(),
        version: '1.0'
      }
    };
  }

  /**
   * 연령대에 맞는 디바이스 선택 (가중치 기반 랜덤)
   */
  static selectDevice(ageGroupCode) {
    const weights = AGE_DEVICE_WEIGHTS[ageGroupCode];
    if (!weights) {
      return DEVICE_PROFILES.GS23P; // 기본값
    }

    const entries = Object.entries(weights);
    const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
    let random = Math.random() * totalWeight;

    for (const [deviceCode, weight] of entries) {
      random -= weight;
      if (random <= 0) {
        return { ...DEVICE_PROFILES[deviceCode] };
      }
    }

    return { ...DEVICE_PROFILES[entries[0][0]] };
  }

  /**
   * 행동 패턴 생성
   */
  static generateBehavior(parsed) {
    const { userType, ageGroup, timeSlot } = parsed;

    // 스크롤 속도 결정
    let scrollSpeedLevel = 3; // 기본: 중간
    if (ageGroup.code === '2') scrollSpeedLevel = 4; // 20대: 빠름
    if (ageGroup.code === '5') scrollSpeedLevel = 2; // 50대+: 느림
    if (userType.code === 'S') scrollSpeedLevel = Math.min(5, scrollSpeedLevel + 1); // 학생: +1
    if (userType.code === 'H') scrollSpeedLevel = Math.max(1, scrollSpeedLevel - 1); // 주부: -1

    // 세션 길이 결정
    let sessionType = 'medium';
    if (timeSlot.code === 'M' || timeSlot.code === 'D' && userType.code === 'W') {
      sessionType = 'short'; // 아침/점심 직장인: 짧음
    }
    if (timeSlot.code === 'E' || timeSlot.code === 'N') {
      sessionType = 'long'; // 저녁/야간: 김
    }
    if (userType.code === 'H') {
      sessionType = 'long'; // 주부: 김
    }

    // 체류 시간 유형 결정
    let dwellType = 'medium';
    if (ageGroup.code === '4' || ageGroup.code === '5') {
      dwellType = 'long'; // 40대+: 길게 체류
    }
    if (userType.code === 'S' && timeSlot.code !== 'L') {
      dwellType = 'short'; // 학생 (새벽 제외): 짧게
    }

    const scrollSpeed = BEHAVIOR_PATTERNS.scrollSpeed[scrollSpeedLevel];
    const sessionDuration = BEHAVIOR_PATTERNS.sessionDuration[sessionType];
    const dwellTime = {
      searchResult: BEHAVIOR_PATTERNS.dwellTime.searchResult[dwellType],
      productDetail: BEHAVIOR_PATTERNS.dwellTime.productDetail[dwellType],
      reviewPage: BEHAVIOR_PATTERNS.dwellTime.reviewPage[dwellType]
    };

    return {
      scrollSpeed: {
        level: scrollSpeedLevel,
        ...scrollSpeed
      },
      sessionDuration: {
        type: sessionType,
        ...sessionDuration
      },
      dwellTime,

      // 클릭 패턴
      clickPattern: this.getClickPattern(userType.code, ageGroup.code),

      // 검색 vs 카테고리 탐색 비율
      searchRatio: this.getSearchRatio(userType.code)
    };
  }

  /**
   * 클릭 패턴 결정
   */
  static getClickPattern(userType, ageGroup) {
    // 목적 구매형
    if (userType === 'W') {
      return { type: 'targeted', avgClicks: [3, 7] };
    }
    // 탐색형
    if (userType === 'H' || ageGroup === '5') {
      return { type: 'explorer', avgClicks: [15, 25] };
    }
    // 직접 검색형
    return { type: 'direct', avgClicks: [5, 10] };
  }

  /**
   * 검색 vs 카테고리 비율
   */
  static getSearchRatio(userType) {
    const ratios = {
      W: 0.8,  // 직장인: 검색 위주
      S: 0.7,  // 학생: 검색 위주
      H: 0.4,  // 주부: 카테고리 탐색
      F: 0.6,  // 자영업: 혼합
      R: 0.3   // 은퇴자: 카테고리 탐색
    };
    return ratios[userType] || 0.5;
  }

  /**
   * 활동 시간대 상세
   */
  static getActiveHours(timeSlotCode, userTypeCode) {
    const base = TIME_SLOTS[timeSlotCode];
    const hours = [];

    // 시간대 기본 범위
    let start = base.start;
    let end = base.end;

    // 야간은 자정 넘어감
    if (start > end) {
      for (let h = start; h < 24; h++) hours.push(h);
      for (let h = 0; h < end; h++) hours.push(h);
    } else {
      for (let h = start; h < end; h++) hours.push(h);
    }

    // 사용자 유형별 세부 조정
    if (userTypeCode === 'W' && timeSlotCode === 'D') {
      return [12, 13]; // 직장인 주간 = 점심시간만
    }

    return hours;
  }

  /**
   * 관심 카테고리 생성
   */
  static generateInterests(userTypeCode, genderCode) {
    const genderKey = genderCode === 'M' ? 'male' : 'female';
    const userKey = USER_TYPES[userTypeCode].name;

    const genderInterests = INTEREST_CATEGORIES[genderKey] || [];
    const userInterests = INTEREST_CATEGORIES[userKey] || [];

    // 합치고 중복 제거, 랜덤 3~5개 선택
    const all = [...new Set([...genderInterests, ...userInterests])];
    const count = 3 + Math.floor(Math.random() * 3);

    return this.shuffleArray(all).slice(0, count);
  }

  /**
   * 배열 셔플
   */
  static shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * 전체 디바이스 목록
   */
  static getDeviceProfiles() {
    return { ...DEVICE_PROFILES };
  }

  /**
   * 특정 디바이스 프로필
   */
  static getDevice(code) {
    return DEVICE_PROFILES[code] ? { ...DEVICE_PROFILES[code] } : null;
  }
}

export { DEVICE_PROFILES, BEHAVIOR_PATTERNS, INTEREST_CATEGORIES };
export default PersonaProfile;
