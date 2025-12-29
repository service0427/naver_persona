# 페르소나 규칙 정의서

> 작성일: 2025-12-29
> 버전: 1.0

---

## 1. 개요

페르소나는 실제 사용자를 모방한 가상의 사용자 프로필입니다.
각 페르소나는 **고유 코드**로 식별되며, 일관된 행동 패턴을 유지합니다.

---

## 2. 페르소나 고유 코드 체계

### 2.1 코드 형식

```
[시간대][사용자유형][연령대][성별]-[순번]

예시: DW3M-001
      │││└─ 성별: M(남), F(여)
      ││└── 연령대: 2(20대), 3(30대), 4(40대), 5(50대+)
      │└─── 사용자유형: W(직장인), S(학생), H(주부), F(자영업), R(은퇴)
      └──── 시간대: M(아침), D(주간), E(저녁), N(야간), L(새벽)
```

### 2.2 시간대 코드 (Time Slot)

| 코드 | 명칭 | 시간 | 설명 |
|------|------|------|------|
| **M** | Morning | 06:00~09:00 | 출근 전, 등교 전 |
| **D** | Daytime | 09:00~18:00 | 주간 활동 시간 |
| **E** | Evening | 18:00~22:00 | 퇴근 후, 저녁 시간 |
| **N** | Night | 22:00~02:00 | 늦은 밤 |
| **L** | Latenight | 02:00~06:00 | 새벽 |

### 2.3 사용자 유형 코드 (User Type)

| 코드 | 명칭 | 특성 |
|------|------|------|
| **W** | Worker | 직장인 - 점심/퇴근 후 쇼핑 |
| **S** | Student | 학생 - 불규칙, 짧은 세션 |
| **H** | Homemaker | 주부 - 오전/오후 여유로운 쇼핑 |
| **F** | Freelancer | 자영업/프리랜서 - 불규칙 |
| **R** | Retired | 은퇴자 - 낮 시간대 활동 |

### 2.4 연령대 코드 (Age Group)

| 코드 | 연령대 | 특성 |
|------|--------|------|
| **2** | 20대 | 트렌드 민감, 빠른 탐색 |
| **3** | 30대 | 실용적, 비교 쇼핑 |
| **4** | 40대 | 신중한 구매, 리뷰 중시 |
| **5** | 50대+ | 천천히 탐색, 긴 체류 |

### 2.5 성별 코드 (Gender)

| 코드 | 성별 |
|------|------|
| **M** | 남성 |
| **F** | 여성 |

---

## 3. 페르소나 프로필 상세

### 3.1 주간 직장인 (DW - Daytime Worker)

```
┌─────────────────────────────────────────────────────────────┐
│  DW3M-001: 30대 남성 직장인                                  │
├─────────────────────────────────────────────────────────────┤
│  활동 시간: 12:00~13:00 (점심), 18:30~21:00 (퇴근 후)       │
│  세션 길이: 5~15분 (점심), 20~40분 (퇴근 후)                │
│  관심 카테고리: 전자기기, 남성패션, 스포츠용품               │
│  검색 패턴: 직접 검색 > 카테고리 탐색                        │
│  스크롤 속도: 빠름                                          │
│  구매 성향: 비교 후 빠른 결정                                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  DW3F-001: 30대 여성 직장인                                  │
├─────────────────────────────────────────────────────────────┤
│  활동 시간: 12:00~13:00 (점심), 19:00~22:00 (퇴근 후)       │
│  세션 길이: 10~20분 (점심), 30~60분 (퇴근 후)               │
│  관심 카테고리: 여성패션, 뷰티, 생활용품                     │
│  검색 패턴: 검색 + 추천 상품 탐색                            │
│  스크롤 속도: 중간                                          │
│  구매 성향: 리뷰 확인 후 신중한 결정                         │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 주간 주부 (DH - Daytime Homemaker)

```
┌─────────────────────────────────────────────────────────────┐
│  DH4F-001: 40대 여성 주부                                    │
├─────────────────────────────────────────────────────────────┤
│  활동 시간: 10:00~11:30, 14:00~16:00                        │
│  세션 길이: 30~60분                                         │
│  관심 카테고리: 식품, 생활용품, 주방용품, 아동용품           │
│  검색 패턴: 카테고리 탐색 > 검색                             │
│  스크롤 속도: 느림~중간                                      │
│  구매 성향: 가격 비교, 리뷰 꼼꼼히 확인                      │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 학생 (S - Student)

```
┌─────────────────────────────────────────────────────────────┐
│  DS2M-001: 20대 남성 대학생                                  │
├─────────────────────────────────────────────────────────────┤
│  활동 시간: 불규칙 (수업 사이, 저녁, 새벽)                   │
│  세션 길이: 5~15분 (짧고 자주)                              │
│  관심 카테고리: 전자기기, 게임, 패션, 식품                   │
│  검색 패턴: 직접 검색 (정확한 키워드)                        │
│  스크롤 속도: 매우 빠름                                      │
│  구매 성향: 가성비 중시, 최저가 검색                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  ES2F-001: 20대 여성 대학생 (저녁)                           │
├─────────────────────────────────────────────────────────────┤
│  활동 시간: 19:00~23:00                                     │
│  세션 길이: 20~40분                                         │
│  관심 카테고리: 패션, 뷰티, 액세서리, 문구                   │
│  검색 패턴: 검색 + 추천 탐색                                 │
│  스크롤 속도: 빠름                                          │
│  구매 성향: 트렌드 민감, 충동 구매 가능                      │
└─────────────────────────────────────────────────────────────┘
```

### 3.4 야간 사용자 (N/L - Night/Latenight)

```
┌─────────────────────────────────────────────────────────────┐
│  NW3M-001: 30대 남성 야근 직장인                             │
├─────────────────────────────────────────────────────────────┤
│  활동 시간: 22:00~24:00                                     │
│  세션 길이: 15~30분                                         │
│  관심 카테고리: 전자기기, 건강식품, 간편식                   │
│  검색 패턴: 목적 구매 (정확한 검색)                          │
│  스크롤 속도: 중간                                          │
│  구매 성향: 피로로 인한 빠른 결정                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  LS2M-001: 20대 남성 올빼미 (새벽)                           │
├─────────────────────────────────────────────────────────────┤
│  활동 시간: 02:00~05:00                                     │
│  세션 길이: 30~60분 (긴 탐색)                               │
│  관심 카테고리: 게임, 전자기기, 취미용품                     │
│  검색 패턴: 탐색형 (여러 상품 비교)                          │
│  스크롤 속도: 느림 (여유로움)                                │
│  구매 성향: 심야 충동 구매 가능                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. 디바이스 프로필 매칭

### 4.1 연령대별 디바이스 분포

| 연령대 | 주요 디바이스 | 비율 |
|--------|--------------|------|
| 20대 | Galaxy S23/S24, iPhone 14/15 | 최신 기종 80% |
| 30대 | Galaxy S22/S23, iPhone 13/14 | 최신~1년 전 70% |
| 40대 | Galaxy S21/S22, iPhone 12/13 | 1~2년 전 60% |
| 50대+ | Galaxy A시리즈, iPhone SE | 중급~보급형 50% |

### 4.2 디바이스 코드 매핑

```javascript
const DEVICE_PROFILES = {
  // 삼성 플래그십
  'GS24U': 'Galaxy S24 Ultra',
  'GS24P': 'Galaxy S24+',
  'GS23U': 'Galaxy S23 Ultra',
  'GS23P': 'Galaxy S23+',
  'GS22U': 'Galaxy S22 Ultra',

  // 삼성 중급
  'GA54': 'Galaxy A54',
  'GA34': 'Galaxy A34',

  // 아이폰
  'IP15P': 'iPhone 15 Pro',
  'IP15': 'iPhone 15',
  'IP14P': 'iPhone 14 Pro',
  'IP14': 'iPhone 14',
  'IP13': 'iPhone 13',
  'IPSE3': 'iPhone SE 3',
};
```

---

## 5. 행동 패턴 파라미터

### 5.1 스크롤 속도 (px/ms)

| 레벨 | 명칭 | 속도 범위 | 적용 대상 |
|------|------|----------|----------|
| 1 | 매우 느림 | 0.3~0.5 | 50대+, 신중한 탐색 |
| 2 | 느림 | 0.5~0.8 | 40대, 주부 |
| 3 | 중간 | 0.8~1.2 | 30대 직장인 |
| 4 | 빠름 | 1.2~1.8 | 20대, 점심시간 |
| 5 | 매우 빠름 | 1.8~2.5 | 학생, 급한 검색 |

### 5.2 체류 시간 (초)

| 페이지 유형 | 짧음 | 보통 | 김 |
|------------|------|------|-----|
| 검색 결과 | 3~8 | 8~15 | 15~30 |
| 상품 상세 | 10~20 | 20~45 | 45~90 |
| 리뷰 페이지 | 15~30 | 30~60 | 60~120 |

### 5.3 클릭 패턴

```javascript
const CLICK_PATTERNS = {
  // 직접 검색형
  'direct': {
    searchRatio: 0.8,      // 검색으로 시작하는 비율
    categoryRatio: 0.2,    // 카테고리로 시작하는 비율
    avgClicksPerSession: 5~10
  },

  // 탐색형
  'explorer': {
    searchRatio: 0.4,
    categoryRatio: 0.6,
    avgClicksPerSession: 15~25
  },

  // 목적 구매형
  'targeted': {
    searchRatio: 0.9,
    categoryRatio: 0.1,
    avgClicksPerSession: 3~7
  }
};
```

---

## 6. IP당 페르소나 구성 예시

### 6.1 표준 구성 (30개/IP)

```
┌─────────────────────────────────────────────────────────────┐
│  IP: 123.45.67.89                                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [M] Morning (3개)                                          │
│      MW3M-001, MW3F-001, MS2M-001                          │
│                                                             │
│  [D] Daytime (10개)                                         │
│      DW3M-001, DW3M-002, DW3F-001, DW4M-001               │
│      DH3F-001, DH4F-001, DH4F-002                          │
│      DS2M-001, DS2F-001, DF3M-001                          │
│                                                             │
│  [E] Evening (8개)                                          │
│      EW3M-001, EW3F-001, EW4M-001, EW4F-001               │
│      ES2M-001, ES2F-001, ES2F-002, EH3F-001               │
│                                                             │
│  [N] Night (6개)                                            │
│      NW3M-001, NW3F-001, NS2M-001, NS2M-002               │
│      NS2F-001, NF3M-001                                    │
│                                                             │
│  [L] Latenight (3개)                                        │
│      LS2M-001, LS2M-002, LF3M-001                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. 데이터베이스 스키마

```sql
-- 페르소나 마스터 테이블
CREATE TABLE personas (
    id VARCHAR(36) PRIMARY KEY,           -- UUID
    code VARCHAR(20) NOT NULL UNIQUE,     -- 'DW3M-001'
    ip_address VARCHAR(15),               -- 매핑된 IP

    -- 코드 분해
    time_slot CHAR(1) NOT NULL,           -- M/D/E/N/L
    user_type CHAR(1) NOT NULL,           -- W/S/H/F/R
    age_group CHAR(1) NOT NULL,           -- 2/3/4/5
    gender CHAR(1) NOT NULL,              -- M/F
    sequence INT NOT NULL,                -- 순번

    -- 디바이스 정보
    device_code VARCHAR(10) NOT NULL,     -- 'GS23P'
    device_profile JSON NOT NULL,         -- 전체 핑거프린트

    -- 행동 파라미터
    scroll_speed_level INT DEFAULT 3,     -- 1~5
    session_duration_avg INT DEFAULT 20,  -- 분
    click_pattern VARCHAR(20) DEFAULT 'direct',

    -- 관심 카테고리
    interest_categories JSON,             -- ['전자기기', '패션']

    -- 상태
    status ENUM('active', 'suspended', 'retired') DEFAULT 'active',
    created_at DATETIME NOT NULL,
    last_used DATETIME,
    session_count INT DEFAULT 0,

    INDEX idx_ip (ip_address),
    INDEX idx_time_slot (time_slot),
    INDEX idx_code (code)
);

-- 페르소나 세션 로그
CREATE TABLE persona_sessions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    persona_id VARCHAR(36) NOT NULL,
    ip_address VARCHAR(15) NOT NULL,
    started_at DATETIME NOT NULL,
    ended_at DATETIME,
    duration_sec INT,
    pages_visited INT DEFAULT 0,
    searches INT DEFAULT 0,
    clicks INT DEFAULT 0,
    result ENUM('success', 'blocked', 'error'),

    INDEX idx_persona (persona_id),
    INDEX idx_started (started_at)
);
```

---

## 8. 페르소나 선택 알고리즘

```javascript
async function selectPersonaForIp(ipAddress) {
  const hour = new Date().getHours();
  const timeSlot = getTimeSlot(hour);

  // 1. 해당 IP + 시간대의 페르소나 조회
  const personas = await db.query(`
    SELECT * FROM personas
    WHERE ip_address = ? AND time_slot = ? AND status = 'active'
    ORDER BY last_used ASC NULLS FIRST
  `, [ipAddress, timeSlot]);

  if (personas.length === 0) {
    // 신규 IP → 페르소나 그룹 생성
    return await createPersonaGroupForIp(ipAddress);
  }

  // 2. 가장 오래 사용 안 한 페르소나 선택
  const selected = personas[0];

  // 3. 사용 시간 업데이트
  await db.query(`
    UPDATE personas SET last_used = NOW(), session_count = session_count + 1
    WHERE id = ?
  `, [selected.id]);

  return selected;
}

function getTimeSlot(hour) {
  if (hour >= 6 && hour < 9) return 'M';
  if (hour >= 9 && hour < 18) return 'D';
  if (hour >= 18 && hour < 22) return 'E';
  if (hour >= 22 || hour < 2) return 'N';
  return 'L';
}
```

---

## 9. 코드 사용 예시

```javascript
// 페르소나 코드 파싱
function parsePersonaCode(code) {
  // DW3M-001
  const match = code.match(/^([MDENL])([WSHFR])(\d)([MF])-(\d+)$/);
  if (!match) throw new Error('Invalid persona code');

  const [, timeSlot, userType, ageGroup, gender, sequence] = match;

  return {
    timeSlot: TIME_SLOTS[timeSlot],
    userType: USER_TYPES[userType],
    ageGroup: parseInt(ageGroup) * 10,  // 20, 30, 40, 50
    gender: gender === 'M' ? 'male' : 'female',
    sequence: parseInt(sequence)
  };
}

// 페르소나 코드 생성
function generatePersonaCode(timeSlot, userType, ageGroup, gender, sequence) {
  const t = timeSlot[0].toUpperCase();       // 'D'
  const u = userType[0].toUpperCase();       // 'W'
  const a = Math.floor(ageGroup / 10);       // 3
  const g = gender[0].toUpperCase();         // 'M'
  const s = sequence.toString().padStart(3, '0');  // '001'

  return `${t}${u}${a}${g}-${s}`;  // 'DW3M-001'
}
```

---

## 10. 요약

```
┌─────────────────────────────────────────────────────────────┐
│  페르소나 고유 코드: [시간대][유형][연령][성별]-[순번]       │
│                                                             │
│  예: DW3M-001 = 주간/직장인/30대/남성/1번                   │
│                                                             │
│  IP당 30개 페르소나 (시간대별 분배)                          │
│  • Morning: 3개                                             │
│  • Daytime: 10개                                            │
│  • Evening: 8개                                             │
│  • Night: 6개                                               │
│  • Latenight: 3개                                           │
│                                                             │
│  각 페르소나는 고유한 디바이스 프로필 + 행동 패턴 보유       │
└─────────────────────────────────────────────────────────────┘
```
