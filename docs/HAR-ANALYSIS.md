# HAR 분석 결과 (2025-12-29)

실제 기기(Galaxy S23+)로 m.naver.com 탐색 시 수집된 네트워크 트래픽 분석

## 개요

- **총 요청 수**: 440개
- **주요 도메인**: 20개 이상
- **Document 요청**: 5개 (페이지 이동)
- **API 호출**: 69개 (xhr, fetch)

## 리다이렉트 체인

```
http://naver.com/ (307 Temporary Redirect)
  → https://naver.com/ (301 Moved Permanently)
    → https://www.naver.com/ (302 Found)
      → https://m.naver.com/ (200 OK)
```

모바일 User-Agent로 접속 시 자동으로 `m.naver.com`으로 리다이렉트됨

## 도메인별 요청 분포

| 요청 수 | 도메인 | 용도 |
|--------|--------|------|
| 134 | s.pstatic.net | 정적 리소스 (JS, CSS) |
| 86 | ssl.pstatic.net | 이미지 |
| 55 | nlog.naver.com | 로깅/추적 |
| 34 | tivan.naver.com | 광고 추적 |
| 22 | naverpa-phinf.pstatic.net | 이미지 CDN |
| 19 | livecloud.pstatic.net | 라이브 스트리밍 |
| 12 | m.naver.com | 메인 콘텐츠 |
| 12 | nam.veta.naver.com | 광고 플랫폼 |
| 12 | b02-kr-smp-vod.pstatic.net | VOD CDN |
| 10 | nelo2-col.navercorp.com | 에러 로깅 |
| 8 | apis.naver.com | API 서버 |

## 주요 API 엔드포인트

### 홈피드 (무한스크롤)

```
GET /nvhaproxy_craft/v1/homefeed/mainHomefeed/1/popular-feeds/page/{N}
    ?sessionId={sessionId}
    &page={N}
    &pullToRefresh=0
    &nextCursor={cursor}
    &adAfterCardsCount=3
    &adNextSeq={seq}
```

**응답**: 74KB+ JSON (피드 아이템 배열)

### 뉴스/라이브

```
GET /nvhaproxy_craft/v1/news/live/playback?liveIds={id}
GET /panels/NEWS-CHANNEL.shtml
GET /panels/NEWS-MY.shtml
```

### 비디오 트레일러

```
GET /nvhaproxy_craft/v1/video/trailers?videoIds={id1},{id2},...
```

### 자동완성

```
GET /preview/index.json
```

## 광고 도메인 (필터링 대상)

### nam.veta.naver.com
- `/gfp/v1` - 광고 요청 (GFP = Google/Naver Feed Partner)
- `/nac/1` - NAC 쿠키 관련

### tivan.naver.com
- `/sc2/{n}/` - 광고 스크립트
- 다양한 경로로 광고 추적

### siape.veta.naver.com
- `/fxview` - 광고 뷰 추적
- `/openrtb/nurl` - RTB(Real-Time Bidding) 알림
- `/openrtb/nbackimp` - 백엔드 임프레션

### g.tivan.naver.com
- `/gfa/{hash}` - 광고 이미지/리소스

## 라이브 스트리밍 CDN

```
livecloud.pstatic.net/navertv/lip2_kr/{server}/{stream_id}/playlist.m3u8
livecloud.pstatic.net/navertv/lip2_kr/{server}/{stream_id}/720/hdntl
```

HLS(HTTP Live Streaming) 방식으로 라이브 콘텐츠 제공

## m.naver.com 경로 목록

| 경로 | 용도 |
|------|------|
| `/` | 메인 페이지 |
| `/favicon.ico` | 파비콘 |
| `/nvhaproxy_craft/v1/homefeed/mainHomefeed/...` | 홈피드 API |
| `/nvhaproxy_craft/v1/news/live/playback` | 라이브 뉴스 |
| `/nvhaproxy_craft/v1/video/trailers` | 비디오 트레일러 |
| `/panels/NEWS-CHANNEL.shtml` | 뉴스 채널 패널 |
| `/panels/NEWS-MY.shtml` | 내 뉴스 패널 |
| `/preview/index.json` | 프리뷰/자동완성 |

## 쿠키 숙성 관점

### 관찰 사항
1. **Set-Cookie 헤더 없음**: 이미 쿠키가 설정된 상태에서 녹화됨
2. **첫 방문 시 필요한 쿠키**: NNB, NAC, NACT가 초기 설정됨
3. **광고 요청이 쿠키 설정에 기여**: veta, tivan 도메인 요청 시 추적 쿠키 설정

### 권장 행동 패턴
1. **메인 피드 스크롤**: 무한스크롤로 homefeed API 호출 유도
2. **라이브/뉴스 시청**: 라이브 스트림 요청으로 활동성 증명
3. **콘텐츠 클릭**: 새 탭으로 열리는 링크 클릭 후 복귀
4. **광고 회피**: `#ad-element`, `.feed_native_section` 요소 클릭 금지

## 구현 노트

### 터치 스크롤 구현
- `touchstart` → `touchmove` (20단계) → `touchend` 순서
- ease-out 커브로 자연스러운 감속
- 시작점, 거리에 랜덤 변화 추가

### 클릭 동작
- 대부분의 피드 콘텐츠는 새 탭(`target="_blank"`)으로 열림
- 뒤로가기 = 새 탭 닫기로 처리

### User-Agent 참고
```
Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36
```

Chrome 142 버전, Android 10, "K" 기기 식별자
