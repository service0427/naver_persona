# 휴먼라이크 인터랙션 라이브러리

Playwright 자동화에서 봇 탐지를 회피하기 위한 자연스러운 스크롤 및 클릭 패턴 구현

---

## 목차

1. [자연스러운 스크롤 (Natural Scroll)](#1-자연스러운-스크롤-natural-scroll)
2. [타겟 요소로 스크롤 (Scroll To Product)](#2-타겟-요소로-스크롤-scroll-to-product)
3. [사용 예제](#3-사용-예제)

---

## 1. 자연스러운 스크롤 (Natural Scroll)

### 개요

실제 모바일 기기의 플링(Fling) 스크롤 패턴을 시뮬레이션합니다.

**핵심 특징:**
- 관성 감속 (처음 빠르게 → 점점 느려짐)
- 60fps 프레임 기반 휠 이벤트
- 랜덤 지터(jitter)로 기계적 패턴 회피

### 설정값

```typescript
const FLING_CONFIG = {
  // 스크롤 속도 (px/s) - 실제 기기 기준 1895 px/s
  SPEED: {
    MIN: 1500,
    MAX: 2500,
  },
  // 한 번 플링 거리 (px) - 실제 기기 기준 5375px
  DISTANCE: {
    MIN: 3000,
    MAX: 6000,
  },
  // 관성 감속 설정
  DECELERATION: {
    INITIAL_MULTIPLIER: 1.5,  // 초기 속도 150%로 시작
    DECAY: 0.85,              // 매 프레임 85%로 감속
    MIN_VELOCITY: 50,         // 이 이하면 정지
  },
  // 휠 이벤트 설정
  WHEEL: {
    FRAME_INTERVAL: 16,       // 60fps 기준 ~16ms
    INTERVAL_JITTER: 5,       // ±5ms 변동
  },
};
```

### 핵심 함수

#### `flingScroll(page, targetDistance, options?)`

플링 스크롤 - 관성 감속 시뮬레이션

```typescript
async function flingScroll(
  page: Page,
  targetDistance: number,
  options?: {
    speed?: number;  // px/s, 미지정시 랜덤
  }
): Promise<{ duration: number; steps: number; actualDistance: number }>
```

**구현:**

```typescript
async function flingScroll(page, targetDistance, options) {
  const viewport = page.viewportSize();
  if (!viewport) return { duration: 0, steps: 0, actualDistance: 0 };

  // 마우스를 화면 중앙 근처로 이동 (약간의 랜덤)
  const centerX = viewport.width / 2 + randomBetween(-30, 30);
  const centerY = viewport.height / 2 + randomBetween(-50, 50);
  await page.mouse.move(centerX, centerY);

  const direction = targetDistance > 0 ? 1 : -1;
  const absDistance = Math.abs(targetDistance);

  // 목표 속도 (px/s)
  const targetSpeed = options?.speed ?? randomBetween(1500, 2500);

  // 초기 속도 (목표보다 빠르게 시작)
  let velocity = targetSpeed * 1.5;  // INITIAL_MULTIPLIER

  let scrolled = 0;
  let steps = 0;
  const startTime = Date.now();

  while (scrolled < absDistance && velocity > 50) {  // MIN_VELOCITY
    // 프레임 간격 (랜덤 지터 포함)
    const frameInterval = 16 + randomBetween(-5, 5);

    // 이번 프레임의 delta (속도 * 시간)
    let delta = Math.round(velocity * (frameInterval / 1000));

    // 남은 거리보다 크면 조정
    const remaining = absDistance - scrolled;
    if (delta > remaining) delta = remaining;

    // 휠 이벤트 발생
    await page.mouse.wheel(0, delta * direction);
    scrolled += delta;
    steps++;

    // 감속 적용 (약간의 랜덤성 추가)
    const decayJitter = 1 + (Math.random() - 0.5) * 0.1;  // ±5% 변동
    velocity *= 0.85 * decayJitter;  // DECAY

    // 프레임 대기
    await new Promise(resolve => setTimeout(resolve, frameInterval));
  }

  return { duration: Date.now() - startTime, steps, actualDistance: scrolled };
}
```

#### `naturalScroll(page, distance, options?)`

flingScroll 래퍼 (호환성 인터페이스)

```typescript
async function naturalScroll(
  page: Page,
  distance: number,
  options?: {
    duration?: number;
    withPause?: boolean;
  }
): Promise<{ duration: number; steps: number }>
```

### 유틸리티 함수

```typescript
// 랜덤 범위 값 생성
function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 가우시안 랜덤 (더 자연스러운 분포)
function gaussianRandom(mean: number, stdDev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}
```

---

## 2. 타겟 요소로 스크롤 (Scroll To Product)

### 개요

특정 요소를 화면에 보이게 하기 위해 자연스럽게 스크롤합니다.

**핵심 특징:**
- 여러 번의 작은 스크롤로 접근 (실제 사용자 패턴)
- 30% 확률로 "오버슈트" 패턴 사용 (타겟을 지나쳤다가 올라오기)
- 이미 화면에 보이더라도 "탐색하는 척" 미세 스크롤 수행

### 핵심 함수

#### `scrollToProductNaturally(targetSelector)`

```typescript
async function scrollToProductNaturally(targetSelector: string): Promise<void>
```

**구현:**

```typescript
async function scrollToProductNaturally(nvMid: string): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) return;

  // 타겟 요소의 현재 위치 확인
  const targetRect = await page.evaluate((mid) => {
    const link = document.querySelector(`a[href*="nv_mid=${mid}"]`);
    if (!link) return null;
    const rect = link.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      centerY: rect.top + rect.height / 2,
    };
  }, nvMid);

  if (!targetRect) return;

  // 고정 헤더 영역 계산
  const STICKY_HEADER_HEIGHT = 72;

  // 클릭 가능한 영역의 중앙 계산
  const visibleTop = STICKY_HEADER_HEIGHT;
  const visibleHeight = viewport.height - STICKY_HEADER_HEIGHT;
  const visibleCenter = visibleTop + visibleHeight / 2;

  // 약간의 랜덤 오프셋 (정확한 중앙 회피)
  const targetOffset = randomBetween(-60, 60);
  const desiredPosition = visibleCenter + targetOffset;

  // 스크롤 거리 계산
  const scrollDistance = targetRect.centerY - desiredPosition;

  // ─────────────────────────────────────────────
  // 패턴 1: 이미 화면에 보이는 경우 - 탐색하는 척
  // ─────────────────────────────────────────────
  if (Math.abs(scrollDistance) < 100) {
    // 위로 살짝 갔다가 다시 내려오는 패턴
    const exploreUp = randomBetween(150, 300);
    await naturalScroll(page, -exploreUp);  // 위로
    await delay(randomBetween(500, 1000));

    await naturalScroll(page, exploreUp + randomBetween(50, 150));  // 다시 아래로
    await delay(randomBetween(300, 600));
    return;
  }

  // ─────────────────────────────────────────────
  // 패턴 2: 오버슈트 (30% 확률, 거리 200px 이상일 때)
  // ─────────────────────────────────────────────
  const useOvershoot = Math.random() < 0.3 && scrollDistance > 200;

  if (useOvershoot) {
    // 타겟보다 200~400px 더 아래로 스크롤
    const overshootExtra = randomBetween(200, 400);
    const overshootDistance = scrollDistance + overshootExtra;

    // 1. 오버슈트 (타겟을 지나침)
    const overshootScrollCount = randomBetween(2, 3);
    const perOvershoot = overshootDistance / overshootScrollCount;

    for (let i = 0; i < overshootScrollCount; i++) {
      const jitter = randomBetween(-30, 30);
      await naturalScroll(page, perOvershoot + jitter);
      await delay(randomBetween(300, 600));
    }

    // 2. 잠시 머무르며 "어디갔지?" 느낌
    await delay(randomBetween(500, 1000));

    // 3. 다시 위로 올라와서 타겟 찾기
    const comeBackDistance = -overshootExtra - randomBetween(50, 150);
    await naturalScroll(page, comeBackDistance);
    await delay(randomBetween(300, 500));

  } else {
    // ─────────────────────────────────────────────
    // 패턴 3: 일반 - 여러 번 나눠서 접근
    // ─────────────────────────────────────────────
    const scrollCount = Math.abs(scrollDistance) > 500 ? randomBetween(2, 3) : 1;
    const perScrollDistance = scrollDistance / scrollCount;

    for (let i = 0; i < scrollCount; i++) {
      const jitter = randomBetween(-30, 30);
      await naturalScroll(page, perScrollDistance + jitter);

      if (i < scrollCount - 1) {
        await delay(randomBetween(400, 800));
      }
    }
  }

  // 최종 위치 안정화 대기
  await delay(randomBetween(300, 600));
}
```

---

## 3. 사용 예제

### 기본 사용

```typescript
import { chromium } from 'playwright';  // 또는 patchright

async function example() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('https://example.com');

  // 자연스럽게 3000px 아래로 스크롤
  await naturalScroll(page, 3000);

  // 위로 1000px 스크롤
  await naturalScroll(page, -1000);

  await browser.close();
}
```

### 스크롤 시퀀스 실행

```typescript
const SEARCH_RESULT_SCROLL_SEQUENCE = [
  {
    name: '1차 플링',
    distanceRange: [2500, 4000],
    delayRange: [800, 1500],
  },
  {
    name: '2차 플링',
    distanceRange: [2000, 3500],
    delayRange: [1000, 2000],
  },
];

await executeScrollSequence(page, SEARCH_RESULT_SCROLL_SEQUENCE, console.log);
```

### 타겟 요소로 스크롤 후 클릭

```typescript
// 1. 타겟 링크 확인
const targetLink = page.locator('a[href*="product-id=12345"]').first();

// 2. 자연스럽게 스크롤
await scrollToProductNaturally('12345');

// 3. 잠시 대기 후 클릭
await delay(randomBetween(500, 1000));
await targetLink.click();
```

---

## 봇 탐지 회피 포인트

| 요소 | 봇 패턴 | 휴먼 패턴 |
|------|---------|-----------|
| 스크롤 속도 | 일정함 | 관성 감속 (빠름→느림) |
| 스크롤 거리 | 정확히 목표 위치 | 약간의 오차 (±30px) |
| 스크롤 횟수 | 1회에 목표 도달 | 2~3회 나눠서 접근 |
| 타겟 위치 | 정확히 중앙 | 랜덤 오프셋 (±60px) |
| 오버슈트 | 없음 | 30% 확률로 지나쳤다 복귀 |
| 프레임 간격 | 정확히 16ms | 16±5ms 랜덤 |
| 마우스 위치 | 고정 또는 미사용 | 중앙 근처 랜덤 |

---

## 파일 구조

```
src/
├── scroll.ts           # 메인 export (버전 관리 래퍼)
└── scroll/
    ├── index.ts        # 버전 관리 로직
    ├── v1-wheel-basic.ts   # v1: 기본 휠 스크롤 (느림)
    └── v2-fling-style.ts   # v2: 플링 관성 스크롤 (현재 기본)
```

### 버전 변경 방법

```bash
# 환경변수로 버전 지정
SCROLL_VERSION=v1 npm start

# 또는 src/scroll/index.ts에서 수정
const CURRENT_VERSION = 'v2';  // 'v1' 또는 'v2'
```

---

## 의존성

- **Playwright** 또는 **Patchright** (Playwright 포크)
- `Page` 객체의 `mouse.wheel()`, `mouse.move()` 메서드 사용

```typescript
import { Page } from 'playwright';
// 또는
import { Page } from 'patchright';
```
