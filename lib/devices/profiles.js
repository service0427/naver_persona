/**
 * Device Profiles - 다양한 디바이스 핑거프린트 정의
 *
 * 동일 VPN IP에서 완전히 다른 핑거프린트로 동시 실행하기 위함
 *
 * 지원 디바이스:
 * - galaxy-s23: Samsung Galaxy S23+ (Android, Chrome)
 * - iphone-15: iPhone 15 Pro (iOS, Safari-like)
 * - pixel-8: Google Pixel 8 (Android, Chrome)
 * - pc-chrome: Desktop Windows (Chrome)
 * - pc-edge: Desktop Windows (Edge)
 */

// === Chrome 버전 동적 생성 헬퍼 ===
function generateUserAgent(template, chromeVersion) {
  const major = chromeVersion ? String(chromeVersion).split('.')[0] : '142';
  return template.replace(/Chrome\/\d+\.0\.0\.0/g, `Chrome/${major}.0.0.0`);
}

function generateSecChUa(chromeVersion, browser = 'Google Chrome') {
  const major = chromeVersion ? String(chromeVersion).split('.')[0] : '142';
  return `"Chromium";v="${major}", "${browser}";v="${major}", "Not_A Brand";v="99"`;
}

// === Galaxy S23+ (기존 s23plus-real.js 기반) ===
export const GALAXY_S23 = {
  id: 'galaxy-s23',
  name: 'Samsung Galaxy S23+',
  type: 'mobile',

  // 기본 템플릿 (실행 시 동적으로 버전 교체)
  userAgentTemplate: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
  userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',

  secChUaTemplate: 'Google Chrome',  // 브라우저 이름
  secChUa: '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
  secChUaMobile: '?1',
  secChUaPlatform: '"Android"',
  acceptLanguage: 'ko-KR,ko;q=0.9',

  viewport: { width: 384, height: 854 },
  deviceScaleFactor: 2.8125,
  screen: {
    width: 1080, height: 2340,
    availWidth: 1080, availHeight: 2214,
    colorDepth: 24, pixelDepth: 24
  },

  navigator: {
    platform: 'Linux armv8l',
    vendor: 'Google Inc.',
    vendorSub: '',
    product: 'Gecko',
    productSub: '20030107',
    language: 'ko-KR',
    languages: ['ko-KR', 'ko'],
    maxTouchPoints: 5,
    hardwareConcurrency: 8,
    deviceMemory: 8,
    pdfViewerEnabled: false,
    connection: { effectiveType: '4g', rtt: 50, downlink: 10, saveData: false }
  },

  webgl: {
    vendor: 'Qualcomm',
    renderer: 'Adreno (TM) 740',
    unmaskedVendor: 'Qualcomm',
    unmaskedRenderer: 'Adreno (TM) 740'
  },

  isMobile: true,
  hasTouch: true,
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul'
};

// === iPhone 15 Pro ===
export const IPHONE_15 = {
  id: 'iphone-15',
  name: 'iPhone 15 Pro',
  type: 'mobile',

  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',

  // iPhone은 Client Hints 미지원 (Safari)
  secChUa: null,
  secChUaMobile: null,
  secChUaPlatform: null,
  acceptLanguage: 'ko-KR,ko;q=0.9',

  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  screen: {
    width: 1179, height: 2556,
    availWidth: 1179, availHeight: 2556,
    colorDepth: 24, pixelDepth: 24
  },

  navigator: {
    platform: 'iPhone',
    vendor: 'Apple Computer, Inc.',
    vendorSub: '',
    product: 'Gecko',
    productSub: '20030107',
    language: 'ko-KR',
    languages: ['ko-KR', 'ko'],
    maxTouchPoints: 5,
    hardwareConcurrency: 6,  // A17 Pro 6코어
    deviceMemory: undefined,  // iOS에서 미지원
    pdfViewerEnabled: false,
    connection: null  // iOS Safari에서 미지원
  },

  webgl: {
    vendor: 'Apple Inc.',
    renderer: 'Apple GPU',
    unmaskedVendor: 'Apple Inc.',
    unmaskedRenderer: 'Apple GPU'
  },

  isMobile: true,
  hasTouch: true,
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul'
};

// === Google Pixel 8 ===
export const PIXEL_8 = {
  id: 'pixel-8',
  name: 'Google Pixel 8',
  type: 'mobile',

  userAgentTemplate: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',

  secChUaTemplate: 'Google Chrome',
  secChUa: '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
  secChUaMobile: '?1',
  secChUaPlatform: '"Android"',
  acceptLanguage: 'ko-KR,ko;q=0.9',

  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2.625,
  screen: {
    width: 1080, height: 2400,
    availWidth: 1080, availHeight: 2296,
    colorDepth: 24, pixelDepth: 24
  },

  navigator: {
    platform: 'Linux armv8l',
    vendor: 'Google Inc.',
    vendorSub: '',
    product: 'Gecko',
    productSub: '20030107',
    language: 'ko-KR',
    languages: ['ko-KR', 'ko'],
    maxTouchPoints: 5,
    hardwareConcurrency: 8,  // Tensor G3
    deviceMemory: 8,
    pdfViewerEnabled: false,
    connection: { effectiveType: '4g', rtt: 50, downlink: 10, saveData: false }
  },

  webgl: {
    vendor: 'ARM',
    renderer: 'Mali-G715',
    unmaskedVendor: 'ARM',
    unmaskedRenderer: 'Mali-G715'
  },

  isMobile: true,
  hasTouch: true,
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul'
};

// === Desktop Windows Chrome ===
export const PC_CHROME = {
  id: 'pc-chrome',
  name: 'Windows PC Chrome',
  type: 'desktop',

  userAgentTemplate: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',

  secChUaTemplate: 'Google Chrome',
  secChUa: '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
  secChUaMobile: '?0',
  secChUaPlatform: '"Windows"',
  acceptLanguage: 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',

  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  screen: {
    width: 1920, height: 1080,
    availWidth: 1920, availHeight: 1040,
    colorDepth: 24, pixelDepth: 24
  },

  navigator: {
    platform: 'Win32',
    vendor: 'Google Inc.',
    vendorSub: '',
    product: 'Gecko',
    productSub: '20030107',
    language: 'ko-KR',
    languages: ['ko-KR', 'ko', 'en-US', 'en'],
    maxTouchPoints: 0,
    hardwareConcurrency: 16,
    deviceMemory: 8,
    pdfViewerEnabled: true,
    connection: { effectiveType: '4g', rtt: 50, downlink: 10, saveData: false }
  },

  webgl: {
    vendor: 'Google Inc. (NVIDIA)',
    renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0)',
    unmaskedVendor: 'Google Inc. (NVIDIA)',
    unmaskedRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0)'
  },

  isMobile: false,
  hasTouch: false,
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul'
};

// === Desktop Windows Edge ===
export const PC_EDGE = {
  id: 'pc-edge',
  name: 'Windows PC Edge',
  type: 'desktop',

  userAgentTemplate: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0',

  secChUaTemplate: 'Microsoft Edge',
  secChUa: '"Microsoft Edge";v="142", "Chromium";v="142", "Not_A Brand";v="99"',
  secChUaMobile: '?0',
  secChUaPlatform: '"Windows"',
  acceptLanguage: 'ko-KR,ko;q=0.9',

  viewport: { width: 1536, height: 864 },
  deviceScaleFactor: 1.25,
  screen: {
    width: 1920, height: 1080,
    availWidth: 1920, availHeight: 1040,
    colorDepth: 24, pixelDepth: 24
  },

  navigator: {
    platform: 'Win32',
    vendor: 'Google Inc.',
    vendorSub: '',
    product: 'Gecko',
    productSub: '20030107',
    language: 'ko-KR',
    languages: ['ko-KR', 'ko'],
    maxTouchPoints: 0,
    hardwareConcurrency: 8,
    deviceMemory: 8,
    pdfViewerEnabled: true,
    connection: { effectiveType: '4g', rtt: 50, downlink: 10, saveData: false }
  },

  webgl: {
    vendor: 'Google Inc. (Intel)',
    renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)',
    unmaskedVendor: 'Google Inc. (Intel)',
    unmaskedRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)'
  },

  isMobile: false,
  hasTouch: false,
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul'
};

// === 모든 프로필 맵 ===
export const DEVICE_PROFILES = {
  'galaxy-s23': GALAXY_S23,
  'iphone-15': IPHONE_15,
  'pixel-8': PIXEL_8,
  'pc-chrome': PC_CHROME,
  'pc-edge': PC_EDGE
};

// === 프로필 목록 ===
export const PROFILE_IDS = Object.keys(DEVICE_PROFILES);

/**
 * 프로필 ID로 디바이스 정보 가져오기
 * @param {string} profileId
 * @returns {Object|null}
 */
export function getProfile(profileId) {
  return DEVICE_PROFILES[profileId] || null;
}

/**
 * 랜덤 프로필 선택
 * @param {string} type - 'mobile' | 'desktop' | null (전체)
 * @returns {Object}
 */
export function getRandomProfile(type = null) {
  let profiles = Object.values(DEVICE_PROFILES);

  if (type) {
    profiles = profiles.filter(p => p.type === type);
  }

  return profiles[Math.floor(Math.random() * profiles.length)];
}

/**
 * 프로필을 Playwright context 옵션으로 변환
 * @param {Object} profile
 * @param {string|number} chromeVersion - Chrome 버전 (예: '143' 또는 '143.0.7499.109')
 * @returns {Object}
 */
export function toContextOptions(profile, chromeVersion = null) {
  // Chrome 버전에 맞게 userAgent와 secChUa 동적 생성
  const userAgent = chromeVersion && profile.userAgentTemplate
    ? generateUserAgent(profile.userAgentTemplate, chromeVersion)
    : profile.userAgent;

  const secChUa = chromeVersion && profile.secChUaTemplate
    ? generateSecChUa(chromeVersion, profile.secChUaTemplate)
    : profile.secChUa;

  const extraHeaders = {
    'accept-language': profile.acceptLanguage
  };

  // Client Hints (Chrome 계열만)
  if (secChUa) {
    extraHeaders['sec-ch-ua'] = secChUa;
    extraHeaders['sec-ch-ua-mobile'] = profile.secChUaMobile;
    extraHeaders['sec-ch-ua-platform'] = profile.secChUaPlatform;
  }

  return {
    userAgent,
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
    locale: profile.locale,
    timezoneId: profile.timezoneId,
    extraHTTPHeaders: extraHeaders
  };
}

/**
 * Fingerprint 오버라이드 스크립트 생성
 * @param {Object} profile
 * @returns {string}
 */
export function generateFingerprintScript(profile) {
  const nav = profile.navigator;
  const scr = profile.screen;
  const webgl = profile.webgl;

  return `
    (function() {
      'use strict';

      function defineProperty(obj, prop, value) {
        try {
          Object.defineProperty(obj, prop, {
            get: () => value,
            configurable: true,
            enumerable: true
          });
        } catch(e) {
          try {
            delete obj[prop];
            Object.defineProperty(obj, prop, {
              get: () => value,
              configurable: true,
              enumerable: true
            });
          } catch(e2) {}
        }
      }

      // === Navigator ===
      const navigatorProps = {
        platform: '${nav.platform}',
        vendor: '${nav.vendor}',
        vendorSub: '${nav.vendorSub}',
        product: '${nav.product}',
        productSub: '${nav.productSub}',
        language: '${nav.language}',
        languages: Object.freeze(${JSON.stringify(nav.languages)}),
        maxTouchPoints: ${nav.maxTouchPoints},
        hardwareConcurrency: ${nav.hardwareConcurrency},
        ${nav.deviceMemory ? `deviceMemory: ${nav.deviceMemory},` : ''}
        webdriver: false,
        pdfViewerEnabled: ${nav.pdfViewerEnabled}
      };

      for (const [prop, value] of Object.entries(navigatorProps)) {
        defineProperty(Navigator.prototype, prop, value);
      }

      // === Screen ===
      const screenProps = {
        width: ${scr.width},
        height: ${scr.height},
        availWidth: ${scr.availWidth},
        availHeight: ${scr.availHeight},
        colorDepth: ${scr.colorDepth},
        pixelDepth: ${scr.pixelDepth}
      };

      for (const [prop, value] of Object.entries(screenProps)) {
        defineProperty(Screen.prototype, prop, value);
      }

      // === Connection API ===
      ${nav.connection ? `
      if (navigator.connection) {
        const connProto = Object.getPrototypeOf(navigator.connection);
        defineProperty(connProto, 'effectiveType', '${nav.connection.effectiveType}');
        defineProperty(connProto, 'rtt', ${nav.connection.rtt});
        defineProperty(connProto, 'downlink', ${nav.connection.downlink});
        defineProperty(connProto, 'saveData', ${nav.connection.saveData});
      }
      ` : ''}

      // === WebGL ===
      const getParameterOriginal = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return '${webgl.unmaskedVendor}';
        if (parameter === 37446) return '${webgl.unmaskedRenderer}';
        return getParameterOriginal.call(this, parameter);
      };

      if (typeof WebGL2RenderingContext !== 'undefined') {
        const getParameter2Original = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = function(parameter) {
          if (parameter === 37445) return '${webgl.unmaskedVendor}';
          if (parameter === 37446) return '${webgl.unmaskedRenderer}';
          return getParameter2Original.call(this, parameter);
        };
      }

      // === Chrome Object ===
      if (!window.chrome) window.chrome = {};
      window.chrome.runtime = window.chrome.runtime || {};

      // === Plugin/MimeType ===
      ${profile.isMobile ? `
      defineProperty(Navigator.prototype, 'plugins', { length: 0 });
      defineProperty(Navigator.prototype, 'mimeTypes', { length: 0 });
      ` : `
      // Desktop: 기본 플러그인 유지
      `}

      // === Marker ===
      window.__DEVICE_PROFILE__ = '${profile.id}';
      window.__FINGERPRINT_SPOOFED__ = true;
    })();
  `;
}

export default {
  DEVICE_PROFILES,
  PROFILE_IDS,
  getProfile,
  getRandomProfile,
  toContextOptions,
  generateFingerprintScript,
  GALAXY_S23,
  IPHONE_15,
  PIXEL_8,
  PC_CHROME,
  PC_EDGE
};
