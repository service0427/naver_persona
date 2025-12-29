/**
 * Fingerprint Modules - 통합 Export
 *
 * 모든 fingerprint 위조 모듈을 통합하여 관리합니다.
 * 각 모듈은 독립적으로 활성화/비활성화할 수 있습니다.
 */

import canvasModule from './canvas.js';
import audioModule from './audio.js';
import performanceModule from './performance.js';
import fontsModule from './fonts.js';
import batteryModule from './battery.js';
import touchModule from './touch.js';

// === 모든 Fingerprint 모듈 ===
export const fingerprintModules = {
  canvas: canvasModule,
  audio: audioModule,
  performance: performanceModule,
  fonts: fontsModule,
  battery: batteryModule,
  touch: touchModule
};

// === 기본 모듈 설정 ===
export const defaultModuleConfig = {
  canvas: { enabled: true },
  audio: { enabled: true },
  performance: { enabled: true },
  fonts: { enabled: true },
  battery: { enabled: true },
  touch: { enabled: true }
};

/**
 * 디바이스 설정에 따른 통합 initScript 생성
 *
 * @param {Object} deviceConfig - 디바이스 설정 (S23_PLUS_REAL 등)
 * @param {Object} options - 모듈별 활성화 옵션
 * @returns {string} 통합 initScript
 *
 * @example
 * const script = generateFingerprintScript(S23_PLUS_REAL, {
 *   canvas: { enabled: true },
 *   audio: { enabled: true },
 *   battery: { enabled: false }  // 배터리 모듈 비활성화
 * });
 */
export function generateFingerprintScript(deviceConfig, options = {}) {
  const config = { ...defaultModuleConfig, ...options };
  const scripts = [];

  // 헤더 주석
  scripts.push(`
    // =====================================================
    // Fingerprint Protection Modules
    // Generated for: ${deviceConfig.userAgent ? 'S23+' : 'Unknown Device'}
    // Timestamp: ${new Date().toISOString()}
    // =====================================================
  `);

  // 각 모듈의 initScript 수집
  for (const [name, module] of Object.entries(fingerprintModules)) {
    const moduleConfig = config[name] || {};

    if (moduleConfig.enabled !== false) {
      try {
        const script = module.getInitScript(deviceConfig);
        scripts.push(`
          // --- ${module.name.toUpperCase()} MODULE ---
          ${script}
        `);
      } catch (error) {
        scripts.push(`
          // --- ${module.name.toUpperCase()} MODULE (ERROR) ---
          console.error('[FP:${module.name}] Failed to load:', '${error.message}');
        `);
      }
    } else {
      scripts.push(`
        // --- ${module.name.toUpperCase()} MODULE (DISABLED) ---
        console.debug('[FP:${module.name}] Module disabled');
      `);
    }
  }

  // 완료 마커
  scripts.push(`
    // === Fingerprint Protection Complete ===
    window.__FP_MODULES_LOADED__ = true;
    window.__FP_MODULES_VERSION__ = '1.0.0';
    console.debug('[FP] All fingerprint modules loaded successfully');
  `);

  // 통합 IIFE로 래핑
  return `
    (function() {
      'use strict';

      // 이미 로드된 경우 스킵
      if (window.__FP_MODULES_LOADED__) {
        console.debug('[FP] Modules already loaded, skipping');
        return;
      }

      ${scripts.join('\n')}
    })();
  `;
}

/**
 * 특정 모듈만 개별 로드
 *
 * @param {string} moduleName - 모듈 이름 (canvas, audio, etc.)
 * @param {Object} deviceConfig - 디바이스 설정
 * @returns {string|null} 모듈 initScript 또는 null
 */
export function getModuleScript(moduleName, deviceConfig) {
  const module = fingerprintModules[moduleName];

  if (!module) {
    console.warn(`[FP] Unknown module: ${moduleName}`);
    return null;
  }

  return module.getInitScript(deviceConfig);
}

/**
 * 모듈 목록 조회
 *
 * @returns {string[]} 사용 가능한 모듈 이름 목록
 */
export function getAvailableModules() {
  return Object.keys(fingerprintModules);
}

/**
 * 모듈 정보 조회
 *
 * @param {string} moduleName - 모듈 이름
 * @returns {Object|null} 모듈 정보
 */
export function getModuleInfo(moduleName) {
  const module = fingerprintModules[moduleName];

  if (!module) {
    return null;
  }

  return {
    name: module.name,
    defaultConfig: module.defaultConfig
  };
}

// === 개별 모듈 Export (테스트용) ===
export {
  canvasModule,
  audioModule,
  performanceModule,
  fontsModule,
  batteryModule,
  touchModule
};

// === Default Export ===
export default {
  fingerprintModules,
  generateFingerprintScript,
  getModuleScript,
  getAvailableModules,
  getModuleInfo,
  defaultModuleConfig
};
