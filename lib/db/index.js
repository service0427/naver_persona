/**
 * Database Module Index
 *
 * v2를 기본으로 사용 (중앙 집중형 멀티PC 아키텍처)
 * v1은 하위 호환성을 위해 유지
 */

// v2 - 메인 (권장)
export { default as db, DatabaseV2 } from './DatabaseV2.js';

// v1 - 레거시 (하위 호환)
export { default as dbLegacy, Database, DB_CONFIG } from './Database.js';

// 기본 export는 v2
import dbV2 from './DatabaseV2.js';
export default dbV2;
