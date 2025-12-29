/**
 * 휴먼 인터랙션 라이브러리
 *
 * 봇 탐지 회피를 위한 자연스러운 스크롤/클릭 패턴
 *
 * @see docs/HUMAN-INTERACTION.md
 * @see docs/SCROLLLOG_ANALYSIS.md
 */

// 스크롤 모듈
export {
  // 설정
  FLING_CONFIG,
  DURATION_CONFIG,
  STICKY_HEADER_HEIGHT,

  // 유틸리티
  randomBetween,
  gaussianRandom,
  delay,

  // 핵심 함수
  flingScroll,
  naturalScroll,
  executeScrollSequence,

  // 타겟 스크롤
  scrollToProductNaturally,
  scrollToElementNaturally,

  // 사전 정의 시퀀스
  SEARCH_RESULT_SCROLL_SEQUENCE,
  PRODUCT_DETAIL_SCROLL_SEQUENCE,
} from './scroll.js';

// 클릭 모듈
export {
  // 설정
  CLICK_CONFIG,

  // 유틸리티
  quadraticBezier,
  generateMousePath,

  // 마우스 이동
  moveMouseNaturally,

  // 클릭
  clickNaturally,
  clickElementNaturally,
  clickProductNaturally,

  // 복합 액션
  findAndClickProduct,
} from './click.js';

// 기본 export
import scroll from './scroll.js';
import click from './click.js';

export default {
  scroll,
  click,
};
