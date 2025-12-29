# [Project Luna] Phase 1: Persona Creator - 참고 문서

> **주의**: 이 문서는 외부 자문 내용으로, 실제 구현 시 테스트를 통해 검증 필요

## 1. 개요 (Overview)
**"모든 봇은 태어나는 순간 가장 의심받는다."**
이 모듈의 목적은 바로 실전에 투입할 봇을 만드는 것이 아니라, **'숙성된(Aged) 신뢰 쿠키'**를 대량 생산하여 창고(DB)에 비축하는 것이다.

### 1.1 핵심 철학 (Philosophy)
* **Separation (분리):** 쿠키를 굽는 행위(생성)와 쿠키를 먹는 행위(상위노출)를 철저히 분리한다.
* **Aging (숙성):** 갓 생성된 NNB는 힘이 없다. 최소 24시간 이상 묵혀둔 쿠키만이 상위노출의 힘을 가진다.
* **Lightweight (경량화):** 무거운 프로필 폴더 전체가 아닌, 핵심 인증 파일만 추출하여 관리한다.

### 1.2 목표 (Objective)
* **Target:** 네이버 쇼핑/플레이스 (Mobile 환경).
* **Output:** `nstore_pagesession` 면죄부와 `NNB`가 포함된 검증된 프로필 데이터.
* **DB Status:** `NEW` 상태의 프로필을 `AGING`(숙성 중) 상태로 전환.

---

## 2. 데이터 아키텍처 (검증 필요)

### 2.1 파일 기반 저장 전략
| 저장소 | 물리적 경로 | 저장 방식 | 역할 |
| :--- | :--- | :--- | :--- |
| **Cookies** | `Network/Cookies` | Binary Read | `NNB`, `nstore_pagesession` |
| **Local Storage** | `Local Storage/leveldb` | Folder Zip | `g_did`, 기기 환경 정보 |
| **Session Storage** | `Session Storage` | Folder Zip | 유입 경로, 뒤로가기 데이터 |
| **IndexedDB** | `IndexedDB` | Ignored | 비로그인 시 불필요 예상 |

---

## 3. 개발 로직 시나리오

### Step 1. Genesis (환경 구성)
* Playwright로 브라우저 실행
* Mobile 필수 설정:
  * `is_mobile=True`, `has_touch=True`
  * `viewport`: 360x800 ~ 412x915 (랜덤)
  * `device_scale_factor`: 2.0 ~ 3.0 (1.0은 PC로 간주)

### Step 2. Injection (면죄부 획득)
* 네이버 메인 접속 → 쇼핑 이동
* 캡챠 발생 시 해결 → `nstore_pagesession` 생성

### Step 3. Aging (숙성 활동)
* **규칙:** 타겟 키워드 검색 금지
* 뉴스, 날씨, 웹툰 등 자연스러운 브라우징
* 3~5분 체류

### Step 4. Harvesting (수확)
* 브라우저 종료 후 데이터 추출
* DB 저장 (status='AGING')

---

## 4. 검증 체크리스트

- [ ] 저장된 데이터 복원 시 무결성 확인
- [ ] 복원된 프로필로 캡챠 없이 접속 가능한가
- [ ] 세션 유지 (최근 본 뉴스 등)
- [ ] 모바일로 인식되는가 (PC버전 보기 버튼)

---

## 5. 기술적 검토 필요 사항

1. **storageState() vs OS 파일 추출**: Patchright에서 어느 방식이 더 안정적인지 테스트
2. **IndexedDB 필요 여부**: 비로그인 상태에서 실제 확인
3. **nlog 일관성**: UA/viewport와 payload 일치 여부
