/**
 * Project Luna - Main Library Exports
 *
 * 네이버 쇼핑/플레이스용 페르소나 쿠키 숙성 시스템
 */

// =====================================================
// Database & Storage
// =====================================================
export { default as db, DatabaseV2 } from './db/index.js';
export { PersonaStorage } from './storage/index.js';

// =====================================================
// Core
// =====================================================
export { createContext, withBrowser } from './core/browser-launcher.js';
export { default as Persona } from './core/Persona.js';
export { default as PersonaManager } from './core/PersonaManager.js';

// =====================================================
// Device & Fingerprint
// =====================================================
export {
  S23_PLUS_REAL,
  toContextOptions,
  applyDeviceSettings,
  applyFullDeviceSettings,
  getFullFingerprintScript,
  getNavigatorOverrideScript
} from './devices/s23plus-real.js';

export {
  fingerprintModules,
  generateFingerprintScript,
  getModuleScript,
  getAvailableModules,
  getModuleInfo,
  defaultModuleConfig
} from './devices/fingerprint-modules/index.js';

// =====================================================
// State Management (핵심!)
// =====================================================
export { default as StateManager } from './utils/state-manager.js';
export {
  backupCookies,
  restoreCookies,
  validateCookies
} from './utils/cookie-backup.js';
export {
  getCookieStats,
  extractHistory,
  extractPreferences,
  getProfileSummary
} from './utils/profile-extractor.js';

// =====================================================
// VPN
// =====================================================
export { default as VpnClient } from './vpn/VpnClient.js';

// =====================================================
// Human Interaction (봇 탐지 회피)
// =====================================================
export {
  // 스크롤
  flingScroll,
  naturalScroll,
  scrollToProductNaturally,
  scrollToElementNaturally,
  executeScrollSequence,
  SEARCH_RESULT_SCROLL_SEQUENCE,
  PRODUCT_DETAIL_SCROLL_SEQUENCE,

  // 클릭
  clickNaturally,
  clickElementNaturally,
  clickProductNaturally,
  findAndClickProduct,
  moveMouseNaturally,

  // 유틸리티
  randomBetween,
  gaussianRandom,
  delay,
} from './human/index.js';

// =====================================================
// Utils
// =====================================================
export { default as HumanSimulator } from './utils/human-simulator.js';
export { default as SessionLogger } from './utils/logger.js';
export {
  extractRecentSearches,
  getRecentSearchesWithClick,
  maybeClickRecentSearch
} from './utils/search-helper.js';
