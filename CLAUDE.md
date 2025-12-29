# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## ⛔ 절대 금지 사항 (CRITICAL - 반드시 숙지)

### 🚨 메인 IP 보호 - 최우선 원칙

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  ⚠️  경고: 네이버 접속 시 반드시 VPN 네임스페이스 내에서 실행할 것!           ║
║                                                                              ║
║  메인 이더넷 IP가 차단되면 서버 접속 자체가 불가능해짐                        ║
║  VPN 없이 네이버 접속 = 서버 사망                                            ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

**금지 행위:**
```bash
# ❌ 절대 금지 - 메인 IP 노출
DISPLAY=:0 node run-persona.js
DISPLAY=:0 node test.js  # 네이버 접속하는 모든 스크립트

# ❌ 절대 금지 - 메인 IP로 네이버 curl/wget
curl https://m.naver.com
curl https://shopping.naver.com
```

**올바른 실행 방식:**
```bash
# ✅ 반드시 VPN 네임스페이스 내에서 실행
ip netns exec {namespace} node run-persona.js

# ✅ IP 확인도 네임스페이스 내에서
ip netns exec {namespace} curl https://api.ipify.org
```

### 🔒 네임스페이스 격리 필수

브라우저/스크립트가 네이버에 접속할 때:
1. 반드시 `ip netns exec {namespace}` 안에서 실행
2. VPN 할당 → WireGuard 설정 → 네임스페이스 생성 → 스크립트 실행 순서 준수
3. 작업 완료 후 반드시 VPN 반납

---

## Project Overview

**naver_persona** (Project Luna Phase 1) - 네이버 쇼핑/플레이스용 페르소나 쿠키 숙성 시스템

다양한 디바이스(Galaxy S23+)를 에뮬레이션하여 신뢰할 수 있는 쿠키를 생성하고 숙성시키는 시스템.

### 현재 상태 (2025-12-30)
- **Phase 1**: 비로그인 페르소나 생성 및 숙성
- **페르소나**: 147개 활성 (36/40 코드 조합 커버)
- **스크롤**: CDP 터치 스크롤 검증 완료 (scrolllog/v2)

---

## 개발 환경

- **개발 서버**: 원격 서버 (사용자는 AnyDesk로 모니터링)
- **개발 방식**: 바이브코딩 (사용자에게 지시하지 않음, Claude가 직접 수행)
- **브라우저 실행**: xvfb + remote debugging port 사용
- **headless 모드 금지**: 차단 위험, 모니터링 불가

### 브라우저 실행 규칙
```bash
# 실행 시 DISPLAY 환경변수 필수
DISPLAY=:0 node script.js
```

```javascript
// 올바른 방식
chromium.launchPersistentContext(profileDir, {
  headless: false,
  args: ['--remote-debugging-port=9222', '--no-sandbox']
});

// 금지
chromium.launch({ headless: true });  // 절대 사용 금지
```

---

## Architecture

```
naver_persona/
├── lib/
│   ├── behavior/       # 행동 시뮬레이션 (핵심!)
│   │   ├── index.js           # 통합 export
│   │   ├── AgeProfiles.js     # 나이대별 행동 프로필
│   │   ├── NaverActions.js    # 네이버 특화 액션
│   │   ├── CDPTouchScroll.js  # CDP 터치 스크롤 (봇 탐지 우회)
│   │   └── ScenarioBuilder.js # 시나리오 자동 생성
│   ├── core/           # 핵심 로직 (ProfileSlot, SessionRunner)
│   ├── db/             # 데이터베이스 (PersonaDB - MariaDB)
│   ├── devices/        # 디바이스 프로필 & 핑거프린트
│   ├── utils/          # StateManager, CookieBackup
│   └── vpn/            # VPN 클라이언트
├── scripts/            # 유틸리티 스크립트
│   ├── analyze/        # 분석 도구
│   ├── persona-admin.js       # 페르소나 관리 CLI
│   └── test-action-library.js # 액션 라이브러리 테스트
└── docs/               # 문서
```

---

## 핵심 모듈 사용법

### 1. 행동 시뮬레이션 (lib/behavior/)

```javascript
import {
  createNaverActions,       // 네이버 특화 액션 팩토리
  flickScroll,              // CDP 플릭 스크롤
  naturalBrowseScroll,      // 자연스러운 브라우징 스크롤
  ScenarioBuilder,          // 시나리오 빌더
  runPersonaScenario        // 페르소나 기반 시나리오 실행
} from './lib/behavior/index.js';

// CDP 세션 생성 (터치 스크롤용)
const cdp = await context.newCDPSession(page);

// 액션 라이브러리 생성
const actions = createNaverActions(page, '30', cdp);  // 30대 프로필, CDP 활성화

// 검색 실행
await actions.search.performSearch('노트북 추천');

// CDP 플릭 스크롤 (관성 스크롤)
await flickScroll(page, cdp, 150, {
  duration: 100,
  wobble: true  // X축 흔들림 (5-15px)
});

// 자연스러운 스크롤
await naturalBrowseScroll(page, cdp, {
  totalDistance: 2000,
  backScrollChance: 0.2,  // 20% 확률로 위로 스크롤
  pauseChance: 0.3        // 30% 확률로 멈춤
});
```

### 2. 페르소나 시나리오 실행

```javascript
import { runPersonaScenario } from './lib/behavior/index.js';

// 페르소나 정보
const persona = {
  code: 'W3M',
  user_type: 'W',   // Worker
  age_group: '3',   // 30대
  gender: 'M'       // 남성
};

// 시나리오 자동 실행
const result = await runPersonaScenario(page, persona, {
  debug: true,
  cdp  // CDP 세션 (옵션)
});
```

### 3. 페르소나 DB

```javascript
import personaDB from './lib/db/PersonaDB.js';

await personaDB.connect();

// 랜덤 페르소나 생성
const persona = await personaDB.createRandomPersona('192.168.1.1');

// 활성 페르소나 조회
const personas = await personaDB.getActivePersonas(10);

// 통계
const stats = await personaDB.getStats();
```

---

## 스크롤 동작 (봇 탐지 우회)

### 페이지별 특성

| 페이지 | 관성 스크롤 | 터치:이동 비율 |
|--------|-------------|----------------|
| m.naver.com | ❌ 없음 | 1:1 |
| m.search.naver.com | ✅ 있음 | 1:10~12 |

### CDP 터치 스크롤 (권장)

```javascript
import { flickScroll, naturalBrowseScroll } from './lib/behavior/CDPTouchScroll.js';

// 검색 결과에서 플릭 스크롤 (관성 동작)
await flickScroll(page, cdp, 150);  // 150px 터치 → ~1500px 이동

// 메인 페이지에서 자연 스크롤
await naturalBrowseScroll(page, cdp, { totalDistance: 2000 });
```

### scrolllog/v2 검증 완료
- CDP `Input.dispatchTouchEvent` 스크롤이 네이버 scrolllog/v2에 정상 기록됨
- 상품 노출 시간, 스크롤 패턴 등이 자연스럽게 추적됨

---

## 관리 스크립트

### 페르소나 관리 (persona-admin.js)

```bash
# 현재 상태
node scripts/persona-admin.js status

# 활성 페르소나 목록
node scripts/persona-admin.js list 20

# 코드별/일별 통계
node scripts/persona-admin.js stats

# 분포 (직업/연령/성별)
node scripts/persona-admin.js dist

# 누락 조합 확인
node scripts/persona-admin.js missing

# 만료 페르소나 정리
node scripts/persona-admin.js cleanup
```

### 액션 라이브러리 테스트

```bash
# VPN 네임스페이스 내에서 실행!
ip netns exec {namespace} env DISPLAY=:0 node scripts/test-action-library.js
```

---

## 페르소나 코드 체계

### 코드 형식: `{직업}{나이}{성별}`

**직업 (user_type):**
| 코드 | 설명 | 비중 |
|------|------|------|
| W | 직장인 (Worker) | 45% |
| S | 학생 (Student) | 20% |
| H | 주부 (Homemaker) | 20% |
| F | 프리랜서 (Freelancer) | 10% |
| R | 은퇴자 (Retired) | 5% |

**연령 (age_group):**
| 코드 | 설명 | 비중 |
|------|------|------|
| 2 | 20대 | 25% |
| 3 | 30대 | 35% |
| 4 | 40대 | 25% |
| 5 | 50대+ | 15% |

**성별 (gender):**
| 코드 | 설명 | 비중 |
|------|------|------|
| M | 남성 | 50% |
| F | 여성 | 50% |

**예시:**
- `W3M` = 30대 남성 직장인
- `H4F` = 40대 여성 주부
- `S2F` = 20대 여성 학생

---

## 데이터베이스 구조

```sql
-- 핵심 테이블 (PersonaDB)
personas        -- 페르소나 마스터 (코드, 상태, 통계)
logs            -- 실행 로그 (결과, IP, 시간)

-- 보조 테이블
persona_state   -- 쿠키 파일 백업 (storageState)
```

### 쿠키 관리 전략

```
쿠키는 암호화되어 오프라인 복호화 불가 (Chrome 130+)
→ 파일 통째로 백업 (Cookies, Cookies-journal, Local State)
→ storageState는 보조용 (브라우저 정상 시)

launchPersistentContext 필수! (browser.newContext 사용 금지)
```

---

## VPN 관리

- WireGuard 기반 네트워크 네임스페이스 방식
- 7개 VPN 동글 = 7개 스레드 동시 운영
- API 서버: `http://61.84.75.37:10001`

### VPN 연결 흐름

```
1. POST /dongle/allocate → dongle 정보 획득
2. 네임스페이스 생성: ip netns add {namespace}
3. WireGuard 인터페이스 설정
4. ip netns exec {namespace} node script.js 실행
5. 180초마다 heartbeat 갱신
6. POST /dongle/release → 작업 완료
7. ip netns del {namespace} → 정리
```

---

## Key Guidelines

### 개발 원칙
- ES Modules 사용 (`"type": "module"`)
- Patchright (Playwright 패치 버전) 사용으로 봇 탐지 우회
- 모바일 에뮬레이션: `isMobile: true`, `hasTouch: true`
- locale: `ko-KR`, timezone: `Asia/Seoul` 고정

### 문서 구조
```
docs/
├── PROJECT_LUNA_REFERENCE.md  # 프로젝트 개요
├── ARCHITECTURE_V3.md         # 아키텍처 상세
├── PERSONA_RULES.md           # 페르소나 규칙
├── PERSONA_SCENARIOS.md       # 시나리오 설계
├── SCROLL_BEHAVIOR.md         # 스크롤 동작 분석 (scrolllog/v2)
└── ...기타 분석 문서
```
