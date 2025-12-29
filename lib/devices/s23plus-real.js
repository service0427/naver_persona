/**
 * S23+ 실기기 정보 (HAR + 스크린샷 기반)
 *
 * 실기기 수집 정보:
 * - User-Agent Reduction 적용됨 (Android 10; K)
 * - Chrome 142 사용
 * - Snapdragon 8 Gen 2 (Adreno 740 GPU)
 */

import { generateFingerprintScript } from './fingerprint-modules/index.js';

export const S23_PLUS_REAL = {
  // === HTTP Headers ===
  userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',

  // Client Hints
  secChUa: '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
  secChUaMobile: '?1',
  secChUaPlatform: '"Android"',

  // Accept headers
  acceptLanguage: 'ko-KR,ko;q=0.9',

  // === Viewport / Screen ===
  viewport: { width: 384, height: 854 },
  deviceScaleFactor: 2.8125,  // 1080 / 384
  screen: {
    width: 1080,
    height: 2340,
    availWidth: 1080,
    availHeight: 2214,
    colorDepth: 24,
    pixelDepth: 24
  },

  // === Navigator Properties ===
  navigator: {
    platform: 'Linux armv8l',
    vendor: 'Google Inc.',
    vendorSub: '',
    product: 'Gecko',
    productSub: '20030107',
    language: 'ko-KR',
    languages: ['ko-KR', 'ko'],
    onLine: true,
    cookieEnabled: true,
    doNotTrack: null,
    maxTouchPoints: 5,
    hardwareConcurrency: 8,
    deviceMemory: 8,
    pdfViewerEnabled: false,
    webdriver: false,

    // Connection
    connection: {
      effectiveType: '4g',
      rtt: 50,
      downlink: 10,
      saveData: false
    }
  },

  // === WebGL ===
  webgl: {
    vendor: 'Qualcomm',
    renderer: 'Adreno (TM) 740',
    unmaskedVendor: 'Qualcomm',
    unmaskedRenderer: 'Adreno (TM) 740'
  },

  // === Touch / Mobile ===
  isMobile: true,
  hasTouch: true,

  // === Timezone / Locale ===
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',

  // === Geolocation (optional) ===
  geolocation: {
    latitude: 37.5665,
    longitude: 126.9780
  }
};

/**
 * Playwright context 옵션으로 변환
 */
export function toContextOptions() {
  return {
    userAgent: S23_PLUS_REAL.userAgent,
    viewport: S23_PLUS_REAL.viewport,
    deviceScaleFactor: S23_PLUS_REAL.deviceScaleFactor,
    isMobile: S23_PLUS_REAL.isMobile,
    hasTouch: S23_PLUS_REAL.hasTouch,
    locale: S23_PLUS_REAL.locale,
    timezoneId: S23_PLUS_REAL.timezoneId,
    extraHTTPHeaders: {
      'accept-language': S23_PLUS_REAL.acceptLanguage,
      'sec-ch-ua': S23_PLUS_REAL.secChUa,
      'sec-ch-ua-mobile': S23_PLUS_REAL.secChUaMobile,
      'sec-ch-ua-platform': S23_PLUS_REAL.secChUaPlatform
    }
  };
}

/**
 * 페이지에 디바이스 설정 적용 (initScript + route)
 * @param {BrowserContext} context - Playwright context
 */
export async function applyDeviceSettings(context) {
  // Navigator/Screen/WebGL 오버라이드 스크립트 주입
  await context.addInitScript({ content: getNavigatorOverrideScript() });

  // 모든 요청에 accept-language 강제 적용
  await context.route('**/*', async (route) => {
    const headers = {
      ...route.request().headers(),
      'accept-language': S23_PLUS_REAL.acceptLanguage
    };
    await route.continue({ headers });
  });
}

/**
 * Navigator/Screen/WebGL 속성 오버라이드 스크립트
 * - Prototype 레벨에서 오버라이드하여 확실하게 적용
 * - WebGL fingerprint 포함
 */
export function getNavigatorOverrideScript() {
  const nav = S23_PLUS_REAL.navigator;
  const scr = S23_PLUS_REAL.screen;
  const webgl = S23_PLUS_REAL.webgl;

  return `
    (function() {
      'use strict';

      // === Helper: 안전한 속성 정의 ===
      function defineProperty(obj, prop, value) {
        try {
          Object.defineProperty(obj, prop, {
            get: () => value,
            configurable: true,
            enumerable: true
          });
        } catch(e) {
          // 이미 정의된 경우 삭제 후 재정의 시도
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

      // === Navigator 오버라이드 (Prototype 레벨) ===
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
        deviceMemory: ${nav.deviceMemory},
        webdriver: false,
        pdfViewerEnabled: ${nav.pdfViewerEnabled}
      };

      // Navigator.prototype에 정의
      for (const [prop, value] of Object.entries(navigatorProps)) {
        defineProperty(Navigator.prototype, prop, value);
      }

      // === Screen 오버라이드 (Prototype 레벨) ===
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

      // === Connection API 오버라이드 ===
      if (navigator.connection) {
        const connectionProps = {
          effectiveType: '${nav.connection.effectiveType}',
          rtt: ${nav.connection.rtt},
          downlink: ${nav.connection.downlink},
          saveData: ${nav.connection.saveData}
        };

        const connProto = Object.getPrototypeOf(navigator.connection);
        for (const [prop, value] of Object.entries(connectionProps)) {
          defineProperty(connProto, prop, value);
        }
      }

      // === WebGL Fingerprint 오버라이드 ===
      const getParameterOriginal = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        // UNMASKED_VENDOR_WEBGL
        if (parameter === 37445) {
          return '${webgl.unmaskedVendor}';
        }
        // UNMASKED_RENDERER_WEBGL
        if (parameter === 37446) {
          return '${webgl.unmaskedRenderer}';
        }
        return getParameterOriginal.call(this, parameter);
      };

      // WebGL2 도 동일하게 처리
      if (typeof WebGL2RenderingContext !== 'undefined') {
        const getParameter2Original = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = function(parameter) {
          if (parameter === 37445) {
            return '${webgl.unmaskedVendor}';
          }
          if (parameter === 37446) {
            return '${webgl.unmaskedRenderer}';
          }
          return getParameter2Original.call(this, parameter);
        };
      }

      // === Chrome 객체 (봇 탐지 우회) ===
      if (!window.chrome) {
        window.chrome = {};
      }
      window.chrome.runtime = window.chrome.runtime || {};
      window.chrome.loadTimes = window.chrome.loadTimes || function() {
        return {
          commitLoadTime: Date.now() / 1000,
          connectionInfo: 'http/1.1',
          finishDocumentLoadTime: Date.now() / 1000,
          finishLoadTime: Date.now() / 1000,
          firstPaintAfterLoadTime: 0,
          firstPaintTime: Date.now() / 1000,
          navigationType: 'Other',
          npnNegotiatedProtocol: 'unknown',
          requestTime: Date.now() / 1000,
          startLoadTime: Date.now() / 1000,
          wasAlternateProtocolAvailable: false,
          wasFetchedViaSpdy: false,
          wasNpnNegotiated: false
        };
      };
      window.chrome.csi = window.chrome.csi || function() {
        return {
          onloadT: Date.now(),
          pageT: Date.now(),
          startE: Date.now(),
          tran: 15
        };
      };

      // === Permissions API 수정 ===
      const originalQuery = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = (parameters) => {
        if (parameters.name === 'notifications') {
          return Promise.resolve({ state: Notification.permission, onchange: null });
        }
        return originalQuery(parameters);
      };

      // === Plugin/MimeType 모바일 스타일로 ===
      defineProperty(Navigator.prototype, 'plugins', { length: 0 });
      defineProperty(Navigator.prototype, 'mimeTypes', { length: 0 });

      // === 디버그 마커 (테스트용) ===
      window.__FINGERPRINT_SPOOFED__ = true;

    })();
  `;
}

/**
 * 전체 Fingerprint 스크립트 생성 (기존 + 새 모듈)
 *
 * 기존 Navigator/Screen/WebGL 위조에 추가로:
 * - Canvas Fingerprint
 * - Audio Fingerprint
 * - Performance 정밀도
 * - Font Enumeration
 * - Battery API
 * - Touch Event
 *
 * @param {Object} options - 모듈별 활성화 옵션
 * @returns {string} 통합 initScript
 *
 * @example
 * const script = getFullFingerprintScript();
 * await context.addInitScript({ content: script });
 */
export function getFullFingerprintScript(options = {}) {
  // 기존 Navigator/Screen/WebGL 스크립트
  const navigatorScript = getNavigatorOverrideScript();

  // 새로운 Fingerprint 모듈 스크립트
  const fingerprintScript = generateFingerprintScript(S23_PLUS_REAL, options);

  return `
    // === S23+ Full Fingerprint Protection ===
    // Part 1: Navigator/Screen/WebGL (기존)
    ${navigatorScript}

    // Part 2: Canvas/Audio/Performance/Fonts/Battery/Touch (신규)
    ${fingerprintScript}
  `;
}

/**
 * 페이지에 전체 디바이스 설정 적용 (확장 버전)
 *
 * Patchright에서는 addInitScript가 작동하지 않으므로
 * route interception을 통해 HTML에 스크립트를 주입합니다.
 *
 * @param {BrowserContext} context - Playwright context
 * @param {Object} options - 옵션
 * @param {boolean} options.useFullFingerprint - 전체 fingerprint 모듈 사용 (기본: true)
 * @param {Object} options.modules - 개별 모듈 설정
 * @returns {string} 생성된 fingerprint 스크립트 (수동 주입용)
 */
export async function applyFullDeviceSettings(context, options = {}) {
  const {
    useFullFingerprint = true,
    modules = {}
  } = options;

  // Fingerprint 스크립트 선택
  const script = useFullFingerprint
    ? getFullFingerprintScript(modules)
    : getNavigatorOverrideScript();

  // 스크립트를 context에 저장 (나중에 접근용)
  context._fingerprintScript = script;

  // HTML 응답에 스크립트 주입 + accept-language 헤더 적용
  await context.route('**/*', async (route) => {
    const request = route.request();
    const headers = {
      ...request.headers(),
      'accept-language': S23_PLUS_REAL.acceptLanguage
    };

    // document 요청인 경우에만 스크립트 주입
    if (request.resourceType() === 'document') {
      try {
        const response = await route.fetch({ headers });
        const contentType = response.headers()['content-type'] || '';

        // HTML 응답인 경우에만 수정
        if (contentType.includes('text/html')) {
          let body = await response.text();

          // <head> 태그 바로 뒤에 스크립트 주입
          const scriptTag = `<script>${script}</script>`;

          if (body.includes('<head>')) {
            body = body.replace('<head>', '<head>' + scriptTag);
          } else if (body.includes('<head ')) {
            // <head ...> 형태 대응
            body = body.replace(/<head([^>]*)>/, '<head$1>' + scriptTag);
          } else if (body.includes('<html>') || body.includes('<html ')) {
            // head가 없으면 html 태그 뒤에 주입
            body = body.replace(/<html([^>]*)>/, '<html$1><head>' + scriptTag + '</head>');
          } else {
            // 최후의 수단: 문서 맨 앞에 주입
            body = scriptTag + body;
          }

          await route.fulfill({
            response,
            body,
            headers: response.headers()
          });
          return;
        }
      } catch (e) {
        // fetch 실패 시 원래 요청 계속
      }
    }

    // 다른 리소스는 헤더만 수정하여 계속
    await route.continue({ headers });
  });

  return script;
}
