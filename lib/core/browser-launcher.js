/**
 * Browser Launcher
 * - 다양한 디바이스 프로필 지원 (Galaxy, iPhone, PC)
 * - 스레드별 프로필 관리 (Chrome 버전별 분리)
 * - Fingerprint 위조 모듈 통합
 * - Human-like 행동 시뮬레이션
 * - VPN 네임스페이스 환경 인식
 */

import { chromium } from 'patchright';
import path from 'path';
import {
  S23_PLUS_REAL,
  toContextOptions as toS23ContextOptions,
  getFullFingerprintScript
} from '../devices/s23plus-real.js';
import {
  getProfile,
  toContextOptions as toProfileContextOptions,
  generateFingerprintScript,
  PROFILE_IDS,
  GALAXY_S23
} from '../devices/profiles.js';
import HumanSimulator from '../utils/human-simulator.js';
import sharedCacheManager from '../cache/SharedCacheManager.js';

// 현재 Chromium 버전 (patchright-core 기준)
const CURRENT_CHROME_VERSION = '142';

const DATA_DIR = path.resolve('./data');
const PROFILES_DIR = path.join(DATA_DIR, 'profiles');

/**
 * 브라우저 컨텍스트 생성
 * @param {Object} options
 * @param {number} options.threadId - 스레드 ID (프로필 폴더 결정)
 * @param {string} options.sessionId - 세션 ID (다중 세션용, 폴더명에 사용)
 * @param {string} options.profileId - 디바이스 프로필 ID (galaxy-s23, iphone-15, pc-chrome 등)
 * @param {string} options.chromeVersion - Chrome 버전 (기본: CURRENT_CHROME_VERSION)
 * @param {boolean} options.headless - headless 모드 (기본: false, 사용 금지 권장)
 * @param {number} options.debugPort - 원격 디버깅 포트 (기본: 9222 + threadId)
 * @param {boolean} options.useVersionedProfile - 버전별 프로필 사용 여부 (기본: false, 호환성)
 * @returns {Promise<{context: BrowserContext, page: Page, profileDir: string, chromeVersion: string, profile: Object}>}
 */
export async function createContext(options = {}) {
  const {
    threadId = 0,
    sessionId = null,
    profileId = null,  // null이면 기존 S23+ 사용 (하위 호환)
    chromeVersion = CURRENT_CHROME_VERSION,
    headless = false,  // HEADLESS 금지 - 탐지됨
    debugPort = 9222 + threadId,
    useVersionedProfile = false  // true: thread-N/chrome-VER 구조 사용
  } = options;

  // 디바이스 프로필 결정
  let deviceProfile = null;
  let contextOptions = null;
  let fingerprintScript = null;

  if (profileId) {
    // 새 방식: profiles.js 사용
    deviceProfile = getProfile(profileId);
    if (!deviceProfile) {
      throw new Error(`Unknown profile: ${profileId}. Available: ${PROFILE_IDS.join(', ')}`);
    }
    contextOptions = toProfileContextOptions(deviceProfile);
    fingerprintScript = generateFingerprintScript(deviceProfile);
  } else {
    // 기존 방식: S23+ 고정 (하위 호환)
    deviceProfile = S23_PLUS_REAL;
    contextOptions = toS23ContextOptions();
    fingerprintScript = getFullFingerprintScript();
  }

  // 프로필 경로 결정
  let profileDir;
  if (sessionId) {
    // 다중 세션: thread-N/session-ID
    profileDir = path.join(PROFILES_DIR, `thread-${threadId}`, sessionId);
  } else if (useVersionedProfile) {
    // 버전별: thread-N/chrome-VER
    profileDir = path.join(PROFILES_DIR, `thread-${threadId}`, `chrome-${chromeVersion}`);
  } else {
    // 기본: thread-N
    profileDir = path.join(PROFILES_DIR, `thread-${threadId}`);
  }

  // VPN 환경 확인 (vpn-runner.js에서 설정)
  const vpnInfo = {
    namespace: process.env.VPN_NAMESPACE || null,
    ip: process.env.VPN_IP || null,
    agentId: process.env.VPN_AGENT_ID || null
  };

  if (vpnInfo.namespace) {
    console.log(`[BrowserLauncher] VPN 환경 감지: ${vpnInfo.namespace} (${vpnInfo.ip})`);
  }

  const context = await chromium.launchPersistentContext(profileDir, {
    headless,
    args: [
      `--remote-debugging-port=${debugPort}`,
      '--no-sandbox'
    ],
    ...contextOptions,
    geolocation: deviceProfile.geolocation || { latitude: 37.5665, longitude: 126.9780 },
    permissions: ['geolocation']
  });

  // accept-language 및 Client Hints 헤더 강제 적용
  await context.route('**/*', async (route) => {
    const headers = {
      ...route.request().headers(),
      'accept-language': deviceProfile.acceptLanguage
    };

    // Client Hints (Chrome 계열)
    if (deviceProfile.secChUa) {
      headers['sec-ch-ua'] = deviceProfile.secChUa;
      headers['sec-ch-ua-mobile'] = deviceProfile.secChUaMobile;
      headers['sec-ch-ua-platform'] = deviceProfile.secChUaPlatform;
    }

    await route.continue({ headers });
  });

  // 새 페이지에 fingerprint 스크립트 자동 주입 설정
  // (Patchright에서 addInitScript가 작동하지 않으므로 이벤트 기반 주입 사용)
  const setupPageInjection = (targetPage) => {
    targetPage.on('domcontentloaded', async () => {
      try {
        await targetPage.evaluate(fingerprintScript);
      } catch (e) {
        // 페이지 이동 중 주입 실패 시 무시
      }
    });
  };

  // 기존 페이지 확인 및 설정
  const existingPages = context.pages();

  let page;
  if (existingPages.length > 0) {
    page = existingPages[0];

    // 추가 탭이 있으면 닫기
    for (let i = 1; i < existingPages.length; i++) {
      await existingPages[i].close();
    }
  } else {
    page = await context.newPage();
  }

  // 메인 페이지에 이벤트 리스너 설정
  setupPageInjection(page);

  // 새로 생성되는 페이지에도 자동으로 이벤트 리스너 설정
  context.on('page', (newPage) => {
    setupPageInjection(newPage);
  });

  // 현재 페이지에 즉시 스크립트 주입 (about:blank 또는 기존 페이지)
  try {
    await page.evaluate(fingerprintScript);
  } catch (e) {
    // 주입 실패 시 무시 (다음 네비게이션에서 주입됨)
  }

  // Human-like 행동 시뮬레이터 적용
  const humanSimulator = HumanSimulator.applyToPage(page);

  return {
    context,
    page,
    profileDir,
    chromeVersion,
    threadId,
    sessionId,
    profileId: deviceProfile.id || 'galaxy-s23',
    profile: deviceProfile,
    vpnInfo,
    humanSimulator
  };
}

/**
 * 페르소나를 사용한 브라우저 컨텍스트 생성
 * @param {Object} options
 * @param {Persona} options.persona - 페르소나 객체
 * @param {Object} options.chromeVersion - ChromeVersions.get() 결과 객체
 * @param {number} options.debugPort - 원격 디버깅 포트 (기본: 9222)
 * @param {boolean} options.headless - headless 모드 (기본: false)
 * @returns {Promise<{context, page, profile, persona, chromeVersion}>}
 */
export async function createContextWithPersona(options = {}) {
  const {
    persona,
    chromeVersion = null,  // { fullName, executablePath, version, ... }
    profileDir = null,     // 직접 프로필 경로 지정 (우선)
    debugPort = 9222,
    headless = false,
    windowPosition = null  // { x, y } - 창 위치 지정
  } = options;

  if (!persona) {
    throw new Error('Persona is required');
  }

  // 페르소나의 기반 프로필 가져오기
  const deviceProfile = getProfile(persona.baseProfile);
  if (!deviceProfile) {
    throw new Error(`Unknown base profile: ${persona.baseProfile}`);
  }

  // 페르소나 고유 핑거프린트 스크립트
  const fingerprintScript = persona.generateFingerprintScript();

  // 프로필 디렉토리 결정 (직접 지정 > Chrome 버전별 > 기본)
  const actualProfileDir = profileDir
    ? profileDir
    : chromeVersion
      ? persona.getProfileDir(chromeVersion.fullName)
      : persona.getProfileDir();

  // 컨텍스트 옵션 (페르소나의 fingerprint 사용, Chrome 버전 전달)
  const contextOptions = persona.toContextOptions(chromeVersion?.version || chromeVersion?.majorVersion);

  // VPN 환경 확인
  const vpnInfo = {
    namespace: process.env.VPN_NAMESPACE || null,
    ip: process.env.VPN_IP || null,
    agentId: process.env.VPN_AGENT_ID || null
  };

  if (vpnInfo.namespace) {
    console.log(`[BrowserLauncher] VPN 환경: ${vpnInfo.namespace} (${vpnInfo.ip})`);
  }

  // Chrome 버전별 실행 파일 결정
  const chromeArgs = [
    `--remote-debugging-port=${debugPort}`,
    '--no-sandbox',
    '--disable-session-crashed-bubble',
    '--no-restore-session-state',
    '--password-store=basic',  // 쿠키 암호화에 기본 키 사용
    '--use-mock-keychain'      // 키체인 모킹으로 고정 키 사용
  ];

  // 환경변수로 고정 암호화 키 설정 (Chromium이 읽음)
  process.env.CHROMIUM_BUILDFLAGS_OVERRIDE = 'use_default_encryption=1';

  // 창 위치 및 크기 설정
  if (windowPosition) {
    chromeArgs.push(`--window-position=${windowPosition.x},${windowPosition.y}`);
    if (windowPosition.width && windowPosition.height) {
      chromeArgs.push(`--window-size=${windowPosition.width},${windowPosition.height}`);
    }
    console.log(`[BrowserLauncher] 창 위치: (${windowPosition.x}, ${windowPosition.y})`);
  }

  const launchOptions = {
    headless,
    args: chromeArgs,
    ...contextOptions,
    geolocation: deviceProfile.geolocation || { latitude: 37.5665, longitude: 126.9780 },
    permissions: ['geolocation']
  };

  // 특정 Chrome 버전 사용
  if (chromeVersion?.executablePath) {
    launchOptions.executablePath = chromeVersion.executablePath;
    console.log(`[BrowserLauncher] Chrome ${chromeVersion.version}`);
    console.log(`   → ${chromeVersion.executablePath}`);
  }

  console.log(`[BrowserLauncher] 프로필: ${actualProfileDir}`);

  // 공유 캐시 설정 (2회차부터 자동 전환)
  try {
    const cacheResult = await sharedCacheManager.setupForProfile(actualProfileDir);
    if (cacheResult.linked.length > 0 || cacheResult.converted.length > 0) {
      console.log(`[BrowserLauncher] 공유 캐시: ${[...cacheResult.linked, ...cacheResult.converted].join(', ')}`);
    }
  } catch (cacheError) {
    console.log(`[BrowserLauncher] 공유 캐시 설정 스킵: ${cacheError.message}`);
  }

  const context = await chromium.launchPersistentContext(actualProfileDir, launchOptions);

  // Chrome 버전에 맞는 동적 헤더 생성
  const chromeVersionStr = chromeVersion?.version || chromeVersion?.majorVersion || '142';
  const dynamicUserAgent = deviceProfile.userAgentTemplate
    ? deviceProfile.userAgentTemplate.replace(/Chrome\/\d+\.0\.0\.0/g, `Chrome/${String(chromeVersionStr).split('.')[0]}.0.0.0`)
    : deviceProfile.userAgent;
  const dynamicSecChUa = deviceProfile.secChUaTemplate
    ? `"Chromium";v="${String(chromeVersionStr).split('.')[0]}", "${deviceProfile.secChUaTemplate}";v="${String(chromeVersionStr).split('.')[0]}", "Not_A Brand";v="99"`
    : deviceProfile.secChUa;

  // accept-language 및 Client Hints 헤더 강제 적용
  await context.route('**/*', async (route) => {
    const headers = {
      ...route.request().headers(),
      'accept-language': deviceProfile.acceptLanguage
    };

    // Client Hints (Chrome 계열) - 동적 버전 사용
    if (dynamicSecChUa) {
      headers['sec-ch-ua'] = dynamicSecChUa;
      headers['sec-ch-ua-mobile'] = deviceProfile.secChUaMobile;
      headers['sec-ch-ua-platform'] = deviceProfile.secChUaPlatform;
    }

    await route.continue({ headers });
  });

  // 새 페이지에 fingerprint 스크립트 자동 주입
  const setupPageInjection = (targetPage) => {
    targetPage.on('domcontentloaded', async () => {
      try {
        await targetPage.evaluate(fingerprintScript);
      } catch (e) {
        // 페이지 이동 중 주입 실패 시 무시
      }
    });
  };

  // 기존 페이지 확인 및 설정
  const existingPages = context.pages();
  let page;

  if (existingPages.length > 0) {
    page = existingPages[0];
    for (let i = 1; i < existingPages.length; i++) {
      await existingPages[i].close();
    }
  } else {
    page = await context.newPage();
  }

  setupPageInjection(page);
  context.on('page', (newPage) => setupPageInjection(newPage));

  // 현재 페이지에 즉시 스크립트 주입
  try {
    await page.evaluate(fingerprintScript);
  } catch (e) {}

  // Human-like 행동 시뮬레이터
  const humanSimulator = HumanSimulator.applyToPage(page);

  return {
    context,
    page,
    profileDir: actualProfileDir,
    profile: deviceProfile,
    persona,
    chromeVersion,
    vpnInfo,
    humanSimulator
  };
}

/**
 * 간단한 브라우저 세션 실행
 * @param {Function} callback - async (page, context) => {}
 * @param {Object} options - createContext 옵션
 */
export async function withBrowser(callback, options = {}) {
  const { context, page, profileDir, humanSimulator } = await createContext(options);

  try {
    await callback(page, context, { profileDir, humanSimulator });
  } finally {
    await context.close();
  }
}

export default {
  createContext,
  createContextWithPersona,
  withBrowser,
  HumanSimulator,
  PROFILES_DIR,
  DATA_DIR,
  CURRENT_CHROME_VERSION
};

export { CURRENT_CHROME_VERSION };
