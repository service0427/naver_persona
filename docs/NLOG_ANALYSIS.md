# nlog.naver.com 분석

## 개요

`nlog.naver.com/n`은 네이버의 통합 행동 추적 시스템입니다. 모든 네이버 서비스에서 사용자 행동을 수집하고 분석하기 위해 사용됩니다.

## HAR 분석 결과

### 요청 통계

| Origin                        | 요청 수 | 총 크기   |
|-------------------------------|---------|-----------|
| m.naver.com (메인)            | 9회     | 11.2KB    |
| m.search.naver.com (검색)     | 4회     | 5.6KB     |
| m.blog.naver.com (블로그)     | 3회     | 4.2KB     |
| m.smartstore.naver.com (쇼핑) | 11회    | 117.4KB   |
| nid.naver.com (로그인)        | 1회     | 2.2KB     |

### 요청 형식

- **Method**: POST
- **Content-Type**: text/plain 또는 text/plain;charset=UTF-8
- **Response**: 204 No Content
- **Body**: JSON 형식

## 페이로드 구조

### 기본 구조

```json
{
  "corp": "naver",
  "svc": "main",                    // 서비스 ID (main, nid, search 등)
  "location": "korea_real/korea",
  "send_ts": 1766894000464,         // 전송 타임스탬프
  "tool": {
    "name": "custom",               // SDK 이름 (custom, ntm-web)
    "ver": "1.0.0"
  },
  "usr": {},                        // 사용자 정보 (로그인 시)
  "env": { ... },                   // 환경 정보
  "svc_tags": { ... },              // 서비스별 태그
  "evt": { ... }                    // 이벤트 정보
}
```

### env (환경 정보)

```json
{
  "device_type": "mobile",
  "platform_type": "web",
  "os_type": "android",
  "os": "Linux armv81",
  "br_ln": "ko-KR",                 // 브라우저 언어
  "br_sr": "384x701",               // 브라우저 화면 크기
  "device_sr": "384x832",           // 디바이스 화면 크기
  "device_pr": "2.8125",            // 픽셀 비율 (devicePixelRatio)
  "timezone": "Asia/Seoul",
  "ch_pltf": "Android",             // 플랫폼
  "ch_mob": true,                   // 모바일 여부
  "ch_mdl": "SM-S916N",             // 디바이스 모델명
  "ch_pltfv": "16.0.0",             // 플랫폼 버전
  "ch_fvls": [                      // Client Hints - Full Version List
    { "brand": "Chromium", "version": "142.0.7444.171" },
    { "brand": "Google Chrome", "version": "142.0.7444.171" }
  ]
}
```

### evt (이벤트 정보)

#### impression (노출 이벤트)

```json
{
  "type": "custom.impression",
  "imp_cids": ["90000003_00000000000000342EE18D52"],  // 노출된 콘텐츠 ID
  "imp_area": "home.feedsncon",                       // 노출 영역
  "page_url": "https://m.naver.com/",
  "page_ref": "",                                     // 리퍼러
  "page_sti": "m_main_home",                          // 서비스 템플릿 ID
  "imp_nsc": "mtop.v6",                               // 네이버 서비스 코드
  "evt_ts": 1766894000464,                            // 이벤트 타임스탬프
  "airs": { ... }                                     // AI 추천 시스템 정보
}
```

#### pageview (페이지 조회)

```json
{
  "type": "pageview",
  "page_url": "https://nid.naver.com/...",
  "page_ref": "https://m.smartstore.naver.com/...",
  "page_id": "c04af13ced14b630d635749e2d52220a",
  "evt_ts": 1766894080626,
  "nlog_id": "fb859b55-4370-4c76-b899-691fa5056a1e",
  "timing": {
    "type": "navigate",
    "fetchStart": 8.8,
    "domainLookupStart": 8.8,
    "requestStart": 87.3,
    "responseStart": 182.9,
    "responseEnd": 183.9,
    "domInteractive": 854.2,
    "domContentLoadedEventStart": 854.3,
    "first_paint": 368,
    "first_contentful_paint": 368
  }
}
```

## 이벤트 타입

| 타입 | 설명 |
|------|------|
| `pageview` | 페이지 조회 |
| `custom.impression` | 콘텐츠/상품 노출 |
| `click` | 클릭 |

## scrolllog와의 차이점

| 항목 | nlog | scrolllog |
|------|------|-----------|
| 목적 | 전반적 행동 추적 | 검색 결과 스크롤 추적 |
| 발생 조건 | 페이지 로드, 노출, 클릭 | 검색 결과 스크롤 |
| 구현 방식 | JS SDK 자동 전송 | 스크롤 이벤트 기반 |
| 직접 구현 필요 | ❌ 불필요 | ⚠️ 휴먼 스크롤 필수 |

## 봇 감지 관점

### nlog 관련 위험 요소

1. **nlog 미전송**
   - JS SDK가 로드되지 않으면 nlog 미전송
   - → 페이지가 제대로 렌더링되면 자동 발생

2. **환경 정보 불일치**
   - `ch_mdl`, `ch_pltf` 등이 User-Agent와 불일치
   - → 디바이스 에뮬레이션에서 일관성 유지 필요

3. **timing 데이터 이상**
   - 페이지 로딩 성능이 비정상적으로 빠름
   - → headless 브라우저의 특성

### 대응 전략

nlog는 **직접 구현이 필요 없습니다**:

- 네이버 페이지의 JS SDK가 자동으로 전송
- Patchright로 페이지가 정상 렌더링되면 자동 발생
- 디바이스 에뮬레이션만 올바르게 설정하면 됨

**주의할 점**:
- `deviceScaleFactor`가 env.device_pr과 일치해야 함
- User-Agent와 Client Hints가 일관되어야 함

## 분석 도구

```bash
# nlog 요청 분석
node scripts/analyze-nlog.js ./har/your-file.har
```

## 참고

- scrolllog 분석: [SCROLLLOG_ANALYSIS.md](./SCROLLLOG_ANALYSIS.md)
- 휴먼 인터랙션: [HUMAN-INTERACTION.md](./HUMAN-INTERACTION.md)
