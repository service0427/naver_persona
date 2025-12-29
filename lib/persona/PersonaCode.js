/**
 * PersonaCode - 페르소나 고유 코드 생성 및 파싱
 *
 * 코드 형식: [시간대][유형][연령][성별]-[순번]
 * 예: DW3M-001 = 주간/직장인/30대/남성/1번
 */

// 시간대 정의
const TIME_SLOTS = {
  M: { code: 'M', name: 'morning', label: '아침', start: 6, end: 9 },
  D: { code: 'D', name: 'daytime', label: '주간', start: 9, end: 18 },
  E: { code: 'E', name: 'evening', label: '저녁', start: 18, end: 22 },
  N: { code: 'N', name: 'night', label: '야간', start: 22, end: 2 },
  L: { code: 'L', name: 'latenight', label: '새벽', start: 2, end: 6 }
};

// 사용자 유형 정의
const USER_TYPES = {
  W: { code: 'W', name: 'worker', label: '직장인' },
  S: { code: 'S', name: 'student', label: '학생' },
  H: { code: 'H', name: 'homemaker', label: '주부' },
  F: { code: 'F', name: 'freelancer', label: '자영업' },
  R: { code: 'R', name: 'retired', label: '은퇴자' }
};

// 연령대 정의
const AGE_GROUPS = {
  '2': { code: '2', range: '20대', min: 20, max: 29 },
  '3': { code: '3', range: '30대', min: 30, max: 39 },
  '4': { code: '4', range: '40대', min: 40, max: 49 },
  '5': { code: '5', range: '50대+', min: 50, max: 69 }
};

// 성별 정의
const GENDERS = {
  M: { code: 'M', name: 'male', label: '남성' },
  F: { code: 'F', name: 'female', label: '여성' }
};

class PersonaCode {
  /**
   * 페르소나 코드 생성
   * @param {Object} params
   * @param {string} params.timeSlot - M/D/E/N/L
   * @param {string} params.userType - W/S/H/F/R
   * @param {string|number} params.ageGroup - 2/3/4/5 또는 20/30/40/50
   * @param {string} params.gender - M/F
   * @param {number} params.sequence - 순번 (1~999)
   * @returns {string} 페르소나 코드 (예: DW3M-001)
   */
  static generate({ timeSlot, userType, ageGroup, gender, sequence }) {
    const t = timeSlot.toUpperCase();
    const u = userType.toUpperCase();
    // ageGroup: 2,3,4,5 또는 20,30,40,50
    let a;
    if (typeof ageGroup === 'number') {
      a = ageGroup >= 10 ? String(Math.floor(ageGroup / 10)) : String(ageGroup);
    } else {
      a = String(ageGroup);
    }
    const g = gender.toUpperCase();
    const s = sequence.toString().padStart(3, '0');

    // 유효성 검사
    if (!TIME_SLOTS[t]) throw new Error(`Invalid timeSlot: ${timeSlot}`);
    if (!USER_TYPES[u]) throw new Error(`Invalid userType: ${userType}`);
    if (!AGE_GROUPS[a]) throw new Error(`Invalid ageGroup: ${ageGroup}`);
    if (!GENDERS[g]) throw new Error(`Invalid gender: ${gender}`);

    return `${t}${u}${a}${g}-${s}`;
  }

  /**
   * 페르소나 코드 파싱
   * @param {string} code - 페르소나 코드 (예: DW3M-001)
   * @returns {Object} 파싱된 정보
   */
  static parse(code) {
    const match = code.match(/^([MDENL])([WSHFR])([2345])([MF])-(\d{3})$/);
    if (!match) {
      throw new Error(`Invalid persona code: ${code}`);
    }

    const [, timeSlot, userType, ageGroup, gender, sequence] = match;

    const ts = TIME_SLOTS[timeSlot];
    const ut = USER_TYPES[userType];
    const ag = AGE_GROUPS[ageGroup];
    const gd = GENDERS[gender];

    return {
      code,
      timeSlot: ts,
      userType: ut,
      ageGroup: ag,
      gender: gd,
      sequence: parseInt(sequence, 10),
      description: `${ts.label} ${ag.range} ${gd.label} ${ut.label}`
    };
  }

  /**
   * 코드에 대한 한글 설명 생성
   */
  static getDescription(code) {
    const parsed = this.parse(code);
    return parsed.description;
  }

  /**
   * 현재 시간대 코드 반환
   * @returns {string} M/D/E/N/L
   */
  static getCurrentTimeSlot() {
    const hour = new Date().getHours();
    return this.getTimeSlotByHour(hour);
  }

  /**
   * 시간으로 시간대 코드 반환
   * @param {number} hour - 0~23
   * @returns {string} M/D/E/N/L
   */
  static getTimeSlotByHour(hour) {
    if (hour >= 6 && hour < 9) return 'M';
    if (hour >= 9 && hour < 18) return 'D';
    if (hour >= 18 && hour < 22) return 'E';
    if (hour >= 22 || hour < 2) return 'N';
    return 'L';
  }

  /**
   * 시간대별 권장 페르소나 수
   */
  static getRecommendedCount(timeSlot) {
    const counts = {
      M: 3,   // 아침: 3개
      D: 10,  // 주간: 10개
      E: 8,   // 저녁: 8개
      N: 6,   // 야간: 6개
      L: 3    // 새벽: 3개
    };
    return counts[timeSlot] || 5;
  }

  /**
   * IP당 표준 페르소나 그룹 생성 (30개)
   * @returns {Array<Object>} 페르소나 템플릿 배열
   */
  static generateStandardGroup() {
    const templates = [];

    // 아침 (M) - 3개
    templates.push(
      { timeSlot: 'M', userType: 'W', ageGroup: 3, gender: 'M' },  // 출근 전 직장인
      { timeSlot: 'M', userType: 'W', ageGroup: 3, gender: 'F' },
      { timeSlot: 'M', userType: 'S', ageGroup: 2, gender: 'M' }   // 등교 전 학생
    );

    // 주간 (D) - 10개
    templates.push(
      { timeSlot: 'D', userType: 'W', ageGroup: 3, gender: 'M' },  // 점심시간 직장인
      { timeSlot: 'D', userType: 'W', ageGroup: 3, gender: 'M' },
      { timeSlot: 'D', userType: 'W', ageGroup: 3, gender: 'F' },
      { timeSlot: 'D', userType: 'W', ageGroup: 4, gender: 'M' },
      { timeSlot: 'D', userType: 'H', ageGroup: 3, gender: 'F' },  // 주부
      { timeSlot: 'D', userType: 'H', ageGroup: 4, gender: 'F' },
      { timeSlot: 'D', userType: 'H', ageGroup: 4, gender: 'F' },
      { timeSlot: 'D', userType: 'S', ageGroup: 2, gender: 'M' },  // 학생
      { timeSlot: 'D', userType: 'S', ageGroup: 2, gender: 'F' },
      { timeSlot: 'D', userType: 'F', ageGroup: 3, gender: 'M' }   // 자영업
    );

    // 저녁 (E) - 8개
    templates.push(
      { timeSlot: 'E', userType: 'W', ageGroup: 3, gender: 'M' },  // 퇴근 후 직장인
      { timeSlot: 'E', userType: 'W', ageGroup: 3, gender: 'F' },
      { timeSlot: 'E', userType: 'W', ageGroup: 4, gender: 'M' },
      { timeSlot: 'E', userType: 'W', ageGroup: 4, gender: 'F' },
      { timeSlot: 'E', userType: 'S', ageGroup: 2, gender: 'M' },  // 저녁 학생
      { timeSlot: 'E', userType: 'S', ageGroup: 2, gender: 'F' },
      { timeSlot: 'E', userType: 'S', ageGroup: 2, gender: 'F' },
      { timeSlot: 'E', userType: 'H', ageGroup: 3, gender: 'F' }
    );

    // 야간 (N) - 6개
    templates.push(
      { timeSlot: 'N', userType: 'W', ageGroup: 3, gender: 'M' },  // 야근 직장인
      { timeSlot: 'N', userType: 'W', ageGroup: 3, gender: 'F' },
      { timeSlot: 'N', userType: 'S', ageGroup: 2, gender: 'M' },  // 밤 학생
      { timeSlot: 'N', userType: 'S', ageGroup: 2, gender: 'M' },
      { timeSlot: 'N', userType: 'S', ageGroup: 2, gender: 'F' },
      { timeSlot: 'N', userType: 'F', ageGroup: 3, gender: 'M' }
    );

    // 새벽 (L) - 3개
    templates.push(
      { timeSlot: 'L', userType: 'S', ageGroup: 2, gender: 'M' },  // 올빼미 학생
      { timeSlot: 'L', userType: 'S', ageGroup: 2, gender: 'M' },
      { timeSlot: 'L', userType: 'F', ageGroup: 3, gender: 'M' }   // 새벽 자영업
    );

    // 순번 부여
    const sequenceMap = {};
    return templates.map(t => {
      const key = `${t.timeSlot}${t.userType}${t.ageGroup}${t.gender}`;
      sequenceMap[key] = (sequenceMap[key] || 0) + 1;

      return {
        ...t,
        sequence: sequenceMap[key],
        code: this.generate({ ...t, sequence: sequenceMap[key] })
      };
    });
  }

  /**
   * 유효한 코드인지 확인
   */
  static isValid(code) {
    try {
      this.parse(code);
      return true;
    } catch {
      return false;
    }
  }
}

// 상수 내보내기
export { TIME_SLOTS, USER_TYPES, AGE_GROUPS, GENDERS };
export default PersonaCode;
