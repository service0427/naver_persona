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
chromium.launch({
  headless: false,
  args: ['--remote-debugging-port=9222', '--no-sandbox']
});

// 금지
chromium.launch({ headless: true });  // 절대 사용 금지
```

## Project Overview

**naver_persona** (Project Luna Phase 1) - 네이버 쇼핑/플레이스용 페르소나 쿠키 숙성 시스템

다양한 디바이스(Galaxy S23+, iPhone 등)를 에뮬레이션하여 신뢰할 수 있는 쿠키를 생성하고 숙성시키는 시스템.

### 타겟
- 네이버 쇼핑
- 네이버 플레이스

### 현재 단계
- Phase 1: 비로그인 페르소나 생성 및 숙성

## Development Setup

```bash
npm install
```

Patchright 브라우저는 postinstall에서 자동 설치됨.

## Build and Run Commands

```bash
npm start           # 메인 실행
npm test            # 테스트 실행
```

## Architecture

```
naver_persona/
├── lib/
│   ├── core/           # 핵심 로직 (Persona, VpnThread)
│   ├── db/             # 데이터베이스 (DatabaseV2 - MariaDB)
│   ├── devices/        # 디바이스 프로필 & 핑거프린트 모듈
│   ├── utils/          # StateManager, CookieBackup, HumanSimulator
│   └── vpn/            # VPN 클라이언트
├── tests/              # 테스트 파일
├── scripts/            # 분석/유틸리티 스크립트
└── docs/               # 문서
```

### 핵심 컴포넌트

- **DatabaseV2** (`lib/db/DatabaseV2.js`): 중앙 집중형 멀티PC 아키텍처
- **StateManager** (`lib/utils/state-manager.js`): 하이브리드 쿠키 백업 (파일 + storageState)
- **Device Profiles** (`lib/devices/profiles.js`): 모바일/PC 디바이스 에뮬레이션
- **VPN Client** (`lib/vpn/VpnClient.js`): 네트워크 네임스페이스 기반 VPN 관리

### 데이터베이스 구조 (v2)

```sql
-- 핵심 테이블
personas_v2        -- 페르소나 마스터 (핑거프린트, 상태)
persona_state      -- 이식 가능한 상태 (쿠키 파일 백업, storageState)
execution_logs     -- 실행 로그 (PC/VPN 추적)
worker_pcs         -- PC 등록/관리
vpn_pool           -- VPN 풀 관리
aging_queue        -- 작업 스케줄링 큐
```

### 쿠키 관리 전략 (중요!)

```
쿠키는 암호화되어 오프라인 복호화 불가 (Chrome 130+)
→ 파일 통째로 백업 (Cookies, Cookies-journal, Local State)
→ storageState는 보조용 (브라우저 정상 시)

launchPersistentContext 필수! (browser.newContext 사용 금지)
```

## Network Architecture

### VPN 관리 (중요!)

- WireGuard 기반 네트워크 네임스페이스 방식 사용
- 7개 VPN 동글 = 7개 스레드 동시 운영
- API 서버: `http://61.84.75.37:10001` (vpn_coupang_v1 기준)

**절대 주의사항:**
- 메인 이더넷 인터페이스를 건드리면 안 됨 (서버 접속 끊김)
- 네트워크 설정 변경 시 극도의 주의 필요

### VPN API 흐름 (실제 사용 경로 - vpn_coupang_v1 기준)
1. `POST /dongle/allocate` - VPN 할당
2. `POST /dongle/heartbeat/{id}` - 180초마다 갱신 필수
3. `POST /dongle/release/{id}` - 작업 완료 후 반납
4. `POST /dongle/toggle/{id}` - IP 변경 요청

### 네임스페이스 패턴 (vpn_coupang_v1 참조)

```javascript
// 네임스페이스 이름 형식
const namespace = `${agentId}-${dongleId}`;  // 예: luna-01-05-031

// WireGuard 인터페이스 이름
const interfaceName = `wg-${dongleNumber}`;  // 예: wg-05

// IP 주소 형식
const address = `10.8.${dongleNumber}.0/24`;
```

### VPN 연결 흐름

```
1. POST /api/vpn/allocate → dongle 정보 획득
2. 네임스페이스 생성: ip netns add {namespace}
3. WireGuard 인터페이스 설정
4. 네임스페이스 내 IP 확인
5. ip netns exec {namespace} node script.js 실행
6. 180초마다 heartbeat 갱신
7. 작업 완료 시 POST /api/vpn/release
8. 네임스페이스 정리: ip netns del {namespace}
```

### IP 토글 조건 (TogglePolicy)

- `IP_CHECK_FAILED`: IP 확인 실패 시
- `BLOCKED`: 차단 감지 (score <= -2)
- `NO_WORK_STREAK`: 연속 3회 작업 없음
- `PREVENTIVE`: 50회 성공 후 예방적 교체

## Key Guidelines

### 개발 원칙
- ES Modules 사용 (`"type": "module"`)
- Patchright (Playwright 패치 버전) 사용으로 봇 탐지 우회
- 페르소나 데이터는 JSON 파일로 1차 관리, 추후 PostgreSQL API 연동

### 디바이스 에뮬레이션
- `deviceScaleFactor` 필수 설정 (1.0은 PC로 간주됨)
- 모바일: `isMobile: true`, `hasTouch: true`
- locale: `ko-KR`, timezone: `Asia/Seoul` 고정

### 쿠키 관리 (검증 완료)

**결론**: 오프라인 쿠키 복호화 불가 → 파일 백업 방식 사용

```javascript
// StateManager 사용법
import StateManager from './lib/utils/state-manager.js';
import { chromium } from 'patchright';

// 1. 프로필 준비 (DB에서 파일 복원)
const stateManager = new StateManager(personaId, profileDir);
await stateManager.prepareProfile();

// 2. launchPersistentContext 필수!
const context = await chromium.launchPersistentContext(profileDir, {...});
stateManager.setContext(context);

// 3. 페이지 이동마다 체크포인트
await page.goto('https://m.naver.com');
await stateManager.createCheckpoint('after-main', { vpnIp });

// 4. 세션 종료
await stateManager.finalSave({ vpnIp, result: '성공' });
```

- 핵심 쿠키: `NNB`, `NAC`, `NACT`
- 백업 파일: `Cookies`, `Cookies-journal`, `Local State`
