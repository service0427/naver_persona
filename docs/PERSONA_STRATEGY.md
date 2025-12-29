# 페르소나 IP 매칭 전략

> 작성일: 2025-12-29
> KT 모바일 VPN 기반 전략

---

## 1. IP 풀 특성

```
┌─────────────────────────────────────────────────────────────┐
│  KT 모바일 IP 풀                                             │
├─────────────────────────────────────────────────────────────┤
│  • 총 IP 수: 약 10,000개                                    │
│  • 특성: 동시 사용량 높음 (일반 모바일 사용자 다수)          │
│  • 일시적 차단: 재시도로 통과 가능 (무시해도 됨)             │
│  • IP 재할당: 랜덤하게 이전 IP가 다시 할당될 수 있음         │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. IP:페르소나 매핑 전략

### 2.1 기본 원칙

```
IP 1개 : 페르소나 N개 (수십 개)

┌─────────────┐
│  IP-A       │ ──→ 페르소나 A-1 (주간/직장인)
│  (KT Pool)  │ ──→ 페르소나 A-2 (주간/학생)
│             │ ──→ 페르소나 A-3 (야간/직장인)
│             │ ──→ 페르소나 A-4 (야간/주부)
│             │ ──→ ... (수십 개)
└─────────────┘
```

### 2.2 IP 할당 시 로직

```
VPN 연결 → IP 확인
    │
    ├─ [기존 IP] → 해당 IP의 페르소나 규칙에 따라 진행
    │              (시간대별 페르소나 선택)
    │
    └─ [신규 IP] → 새 페르소나 그룹 생성
                   (주간/야간 페르소나 미리 설정)
```

---

## 3. 시간대별 페르소나 구분

### 3.1 주간 사용자 (09:00 ~ 21:00)

| 페르소나 타입 | 특성 | 행동 패턴 |
|--------------|------|----------|
| 직장인 A | 점심시간 쇼핑 | 12:00~13:00 집중, 빠른 검색 |
| 직장인 B | 퇴근 후 쇼핑 | 18:00~21:00 여유로운 탐색 |
| 학생 | 수업 중 틈틈이 | 불규칙, 짧은 세션 |
| 주부 | 오전/오후 쇼핑 | 10:00~11:00, 14:00~16:00 |

### 3.2 야간 사용자 (21:00 ~ 09:00)

| 페르소나 타입 | 특성 | 행동 패턴 |
|--------------|------|----------|
| 야근 직장인 | 늦은 밤 쇼핑 | 22:00~24:00 |
| 대학생 | 새벽 쇼핑 | 00:00~03:00, 긴 세션 |
| 올빼미족 | 불규칙 | 깊은 밤 활동 |
| 해외 교포 | 시차 활동 | 새벽 시간대 |

---

## 4. 데이터베이스 설계

### 4.1 IP-페르소나 매핑 테이블

```sql
-- IP별 페르소나 그룹
CREATE TABLE ip_persona_groups (
    ip_address VARCHAR(15) PRIMARY KEY,
    first_seen DATETIME NOT NULL,
    last_seen DATETIME NOT NULL,
    total_sessions INT DEFAULT 0,
    INDEX idx_last_seen (last_seen)
);

-- 페르소나 상세 (IP당 수십 개)
CREATE TABLE personas (
    id VARCHAR(36) PRIMARY KEY,
    ip_address VARCHAR(15) NOT NULL,
    time_slot ENUM('morning', 'daytime', 'evening', 'night', 'latenight') NOT NULL,
    persona_type VARCHAR(50) NOT NULL,  -- '직장인', '학생', '주부' 등
    device_profile JSON NOT NULL,        -- 핑거프린트 정보
    created_at DATETIME NOT NULL,
    last_used DATETIME,
    session_count INT DEFAULT 0,

    INDEX idx_ip_time (ip_address, time_slot),
    FOREIGN KEY (ip_address) REFERENCES ip_persona_groups(ip_address)
);
```

### 4.2 시간대 정의

```javascript
const TIME_SLOTS = {
  morning: { start: 6, end: 9 },      // 06:00 ~ 09:00
  daytime: { start: 9, end: 18 },     // 09:00 ~ 18:00
  evening: { start: 18, end: 22 },    // 18:00 ~ 22:00
  night: { start: 22, end: 2 },       // 22:00 ~ 02:00
  latenight: { start: 2, end: 6 }     // 02:00 ~ 06:00
};
```

---

## 5. 페르소나 선택 알고리즘

```javascript
async function selectPersona(ipAddress) {
  const currentHour = new Date().getHours();
  const timeSlot = getTimeSlot(currentHour);

  // 1. 해당 IP의 페르소나 그룹 조회
  let group = await db.getIpGroup(ipAddress);

  if (!group) {
    // 2-A. 신규 IP → 페르소나 그룹 생성
    group = await createPersonaGroup(ipAddress);
  }

  // 3. 현재 시간대에 맞는 페르소나 선택
  const candidates = await db.getPersonas(ipAddress, timeSlot);

  if (candidates.length === 0) {
    // 해당 시간대 페르소나 없으면 생성
    return await createPersona(ipAddress, timeSlot);
  }

  // 4. 가장 오래 사용 안 한 페르소나 선택 (균등 분배)
  return candidates.sort((a, b) =>
    (a.last_used || 0) - (b.last_used || 0)
  )[0];
}

function getTimeSlot(hour) {
  if (hour >= 6 && hour < 9) return 'morning';
  if (hour >= 9 && hour < 18) return 'daytime';
  if (hour >= 18 && hour < 22) return 'evening';
  if (hour >= 22 || hour < 2) return 'night';
  return 'latenight';
}
```

---

## 6. IP당 페르소나 수 권장

```
┌─────────────────────────────────────────────────────────────┐
│  IP당 권장 페르소나 수: 20~50개                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  시간대별 분배 예시 (30개 기준):                             │
│                                                             │
│  morning (06-09):   3개 (아침 출근 전 쇼핑)                 │
│  daytime (09-18):  10개 (주간 활동 - 가장 많음)             │
│  evening (18-22):   8개 (퇴근 후 쇼핑)                      │
│  night (22-02):     6개 (늦은 밤 쇼핑)                      │
│  latenight (02-06): 3개 (새벽 쇼핑)                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. 차단 대응 전략

```
일시적 차단 발생 시:
────────────────────────────────

1. 즉시 재시도 (KT 모바일 특성상 통과 가능)
2. 3회 실패 시 → IP 토글 (새 IP 할당)
3. 새 IP에서 다시 페르소나 매칭

※ 일시적 차단은 무시해도 됨
※ KT 모바일은 동시 사용량이 높아 차단 임계값이 높음
```

---

## 8. 예상 규모

```
IP 풀: ~10,000개
IP당 페르소나: ~30개
────────────────────
총 페르소나 용량: ~300,000개

실제 활성 IP (동시): ~100개 (7개 동글 × 일일 로테이션)
일일 처리 가능: ~3,000 페르소나 세션
```

---

## 9. 구현 우선순위

| 순서 | 작업 | 중요도 |
|------|------|--------|
| 1 | IP-페르소나 매핑 DB 스키마 | 높음 |
| 2 | 시간대별 페르소나 선택 로직 | 높음 |
| 3 | 신규 IP 감지 시 페르소나 그룹 자동 생성 | 높음 |
| 4 | 페르소나 타입별 행동 패턴 정의 | 중간 |
| 5 | 차단 대응 자동화 | 중간 |
