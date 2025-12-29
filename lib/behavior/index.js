/**
 * Behavior Module - 인간 행동 시뮬레이션 시스템 (CDP 터치 기반)
 *
 * 네이버 브라우징을 위한 자연스러운 사용자 행동 생성
 *
 * 주요 컴포넌트:
 * - AgeProfiles: 나이대별 행동 특성 (타이핑 속도, 오타율, 스크롤 패턴)
 * - NaverActions: 네이버 특화 액션 (검색, 메뉴, 콘텐츠 클릭)
 * - CDPTouchScroll: CDP 기반 리얼 터치 스크롤 (scrolllog/v2 검증 완료)
 * - ScenarioBuilder: 페르소나 기반 시나리오 자동 생성
 *
 * @example
 * import { ScenarioBuilder, ScenarioExecutor, runPersonaScenario } from './lib/behavior/index.js';
 *
 * // 방법 1: 자동 시나리오 생성 및 실행
 * const result = await runPersonaScenario(page, persona, { debug: true });
 *
 * // 방법 2: 수동 시나리오 빌드
 * const builder = new ScenarioBuilder(persona);
 * const scenario = builder.buildScenario(5);  // 5개 액션
 *
 * const executor = new ScenarioExecutor(page, persona);
 * await executor.execute(scenario);
 *
 * // 방법 3: 개별 액션 사용 (CDP 터치 지원)
 * const cdp = await context.newCDPSession(page);
 * const actions = createNaverActions(page, '30', cdp);  // 30대, CDP 터치 활성화
 * await actions.doSearch('맛집 추천');
 * await actions.flickScroll(150);   // CDP 플릭 스크롤
 * await actions.naturalScroll({ totalDistance: 3000 });  // 자연스러운 스크롤
 * await actions.clickItem('blog');
 * await actions.readAndReturn(60);  // 60초 읽고 뒤로
 */

// 나이대별 프로필
export {
  AGE_GROUPS,
  AGE_PROFILES,
  getAgeProfile,
  KoreanTypoGenerator,
  SearchQueryTransformer
} from './AgeProfiles.js';

// 네이버 액션
export {
  NAVER_URLS,
  SELECTORS,
  NaverSearchAction,
  NaverNavigationAction,
  NaverContentAction,
  createNaverActions
} from './NaverActions.js';

// CDP 터치 스크롤 (직접 사용 가능)
export {
  flickScroll,
  dragScroll,
  scrollUp,
  naturalBrowseScroll,
  multiFlickScroll,
  touchTap,
  tapElement
} from './CDPTouchScroll.js';

// 시나리오 빌더 & 실행기
export {
  ScenarioBuilder,
  ScenarioExecutor,
  runPersonaScenario
} from './ScenarioBuilder.js';

// 기본 export
import { ScenarioBuilder, ScenarioExecutor, runPersonaScenario } from './ScenarioBuilder.js';
import { createNaverActions } from './NaverActions.js';
import { getAgeProfile } from './AgeProfiles.js';
import { flickScroll, naturalBrowseScroll, touchTap } from './CDPTouchScroll.js';

export default {
  ScenarioBuilder,
  ScenarioExecutor,
  runPersonaScenario,
  createNaverActions,
  getAgeProfile,
  // CDP 터치 스크롤
  flickScroll,
  naturalBrowseScroll,
  touchTap
};
