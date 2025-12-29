/**
 * VpnThread - VPN 1개 + N개 브라우저 세션 관리
 *
 * 아키텍처:
 *   VpnThread (agentId: T00-01)
 *   ├── VpnManager (namespace: T00-01-12, IP: 110.70.54.53)
 *   └── Sessions[]
 *       ├── Session 0: Galaxy S23+ (Chrome 142)
 *       ├── Session 1: iPhone 15 (Safari)
 *       └── Session 2: PC Chrome
 *
 * 동일 VPN IP에서 완전히 다른 핑거프린트로 동시 실행
 * → 네이버 입장에서는 완전히 다른 사용자
 *
 * 사용법:
 *   const thread = new VpnThread({ agentId: 'T00-01', threadIndex: 0 });
 *   await thread.start();
 *
 *   // 세션 추가 (다른 디바이스 프로필)
 *   await thread.addSession({ profileId: 'galaxy-s23', sessionId: 'user-1' });
 *   await thread.addSession({ profileId: 'iphone-15', sessionId: 'user-2' });
 *
 *   // 세션 내에서 작업 실행
 *   await thread.runInSession('user-1', async (page, context) => {
 *     await page.goto('https://m.naver.com');
 *   });
 *
 *   await thread.shutdown();
 */

import VpnManager from '../vpn/VpnManager.js';
import { spawn, execSync } from 'child_process';
import { chromium } from 'patchright';
import path from 'path';
import fs from 'fs';
import {
  getProfile,
  toContextOptions,
  generateFingerprintScript,
  PROFILE_IDS
} from '../devices/profiles.js';

const DATA_DIR = path.resolve('./data');
const PROFILES_DIR = path.join(DATA_DIR, 'profiles');

class VpnThread {
  /**
   * @param {Object} options
   * @param {string} options.agentId - VPN agent ID (예: 'T00-01')
   * @param {number} options.threadIndex - 스레드 인덱스 (디버그 포트 계산용)
   * @param {boolean} options.debug - 디버그 모드
   * @param {Function} options.logger - 로깅 함수
   */
  constructor(options = {}) {
    this.agentId = options.agentId || 'T00-01';
    this.threadIndex = options.threadIndex || 0;
    this.debug = options.debug || false;
    this.logger = options.logger || console.log;

    this.vpn = new VpnManager({
      agentId: this.agentId,
      purpose: 'naver-persona',
      debug: this.debug,
      logger: this.logger
    });

    this.sessions = new Map();  // sessionId -> { context, page, profile, ... }
    this.browsers = new Map();  // sessionId -> browser (server mode용)
    this.started = false;
    this.namespace = null;
    this.vpnIp = null;

    // 디버그 포트 기준 (세션별로 증가)
    this.baseDebugPort = 9222 + (this.threadIndex * 100);
    this.nextPortOffset = 0;
  }

  /**
   * VPN 연결 시작
   * @returns {Promise<boolean>}
   */
  async start() {
    this.logger(`[VpnThread:${this.agentId}] 시작...`);

    const connected = await this.vpn.connect();
    if (!connected) {
      this.logger(`[VpnThread:${this.agentId}] ❌ VPN 연결 실패`);
      return false;
    }

    this.namespace = this.vpn.namespace;
    this.vpnIp = this.vpn.getPublicIp();
    this.started = true;

    this.logger(`[VpnThread:${this.agentId}] ✅ VPN 연결 성공`);
    this.logger(`[VpnThread:${this.agentId}]   Namespace: ${this.namespace}`);
    this.logger(`[VpnThread:${this.agentId}]   VPN IP: ${this.vpnIp}`);

    return true;
  }

  /**
   * 네임스페이스 내에서 명령 실행
   * @param {string} command
   * @returns {string}
   */
  execInNamespace(command) {
    if (!this.namespace) {
      throw new Error('VPN not connected');
    }
    return execSync(`ip netns exec ${this.namespace} ${command}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
  }

  /**
   * 브라우저 세션 추가
   *
   * @param {Object} options
   * @param {string} options.sessionId - 세션 식별자 (예: 'user-1', 'persona-A')
   * @param {string} options.profileId - 디바이스 프로필 ID (galaxy-s23, iphone-15, etc.)
   * @param {string} options.chromeVersion - Chrome 버전 (프로필 디렉토리용)
   * @returns {Promise<Object>} { context, page, profile }
   */
  async addSession(options = {}) {
    const {
      sessionId,
      profileId = 'galaxy-s23',
      chromeVersion = '142'
    } = options;

    if (!this.started) {
      throw new Error('VpnThread not started. Call start() first.');
    }

    if (!sessionId) {
      throw new Error('sessionId is required');
    }

    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists`);
    }

    const profile = getProfile(profileId);
    if (!profile) {
      throw new Error(`Unknown profile: ${profileId}. Available: ${PROFILE_IDS.join(', ')}`);
    }

    this.logger(`[VpnThread:${this.agentId}] 세션 추가: ${sessionId} (${profile.name})`);

    // 프로필 디렉토리: data/profiles/thread-{threadIndex}/{sessionId}
    const profileDir = path.join(
      PROFILES_DIR,
      `thread-${this.threadIndex}`,
      sessionId
    );

    // 디렉토리 생성
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }

    // 디버그 포트
    const debugPort = this.baseDebugPort + this.nextPortOffset++;

    try {
      // 네임스페이스 내에서 브라우저 실행
      // 방법: chromium.launchServer를 namespace 안에서 실행하고 외부에서 연결
      // 또는: 전체 프로세스를 namespace 안에서 실행

      // 현재 접근: 브라우저를 직접 실행 (DISPLAY 사용)
      // 주의: headless: false 필수

      const context = await chromium.launchPersistentContext(profileDir, {
        headless: false,  // HEADLESS 금지
        args: [
          `--remote-debugging-port=${debugPort}`,
          '--no-sandbox',
          '--disable-gpu-sandbox',
          // 네임스페이스 네트워크 사용을 위한 설정은 별도 처리 필요
        ],
        ...toContextOptions(profile)
      });

      // Fingerprint 스크립트 생성
      const fingerprintScript = generateFingerprintScript(profile);

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

      // accept-language 헤더 강제 적용
      await context.route('**/*', async (route) => {
        const headers = {
          ...route.request().headers(),
          'accept-language': profile.acceptLanguage
        };

        if (profile.secChUa) {
          headers['sec-ch-ua'] = profile.secChUa;
          headers['sec-ch-ua-mobile'] = profile.secChUaMobile;
          headers['sec-ch-ua-platform'] = profile.secChUaPlatform;
        }

        await route.continue({ headers });
      });

      // 기존 페이지 확인
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
      context.on('page', setupPageInjection);

      // 현재 페이지에 즉시 스크립트 주입
      try {
        await page.evaluate(fingerprintScript);
      } catch (e) {}

      const session = {
        sessionId,
        profileId,
        profile,
        context,
        page,
        profileDir,
        debugPort,
        chromeVersion,
        startTime: Date.now(),
        visitCount: 0,
        searchKeywords: []
      };

      this.sessions.set(sessionId, session);

      this.logger(`[VpnThread:${this.agentId}] ✅ 세션 생성: ${sessionId}`);
      this.logger(`[VpnThread:${this.agentId}]   프로필: ${profile.name}`);
      this.logger(`[VpnThread:${this.agentId}]   디버그 포트: ${debugPort}`);

      return session;

    } catch (error) {
      this.logger(`[VpnThread:${this.agentId}] ❌ 세션 생성 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * 특정 세션 가져오기
   * @param {string} sessionId
   * @returns {Object|null}
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * 모든 세션 목록
   * @returns {Array}
   */
  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  /**
   * 세션 내에서 작업 실행
   * @param {string} sessionId
   * @param {Function} callback - async (page, context, session) => {}
   * @returns {Promise<any>}
   */
  async runInSession(sessionId, callback) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return await callback(session.page, session.context, session);
  }

  /**
   * 모든 세션에서 병렬 실행
   * @param {Function} callback - async (page, context, session) => {}
   * @returns {Promise<Array>}
   */
  async runInAllSessions(callback) {
    const promises = [];

    for (const session of this.sessions.values()) {
      promises.push(
        callback(session.page, session.context, session)
          .catch(err => ({ error: err.message, sessionId: session.sessionId }))
      );
    }

    return await Promise.all(promises);
  }

  /**
   * 세션 종료
   * @param {string} sessionId
   */
  async closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.logger(`[VpnThread:${this.agentId}] 세션 종료: ${sessionId}`);

    try {
      await session.context.close();
    } catch (e) {}

    this.sessions.delete(sessionId);
  }

  /**
   * VpnThread 종료 (모든 세션 + VPN 정리)
   */
  async shutdown() {
    this.logger(`[VpnThread:${this.agentId}] 종료 시작...`);

    // 모든 세션 종료
    for (const sessionId of this.sessions.keys()) {
      await this.closeSession(sessionId);
    }

    // VPN 정리
    await this.vpn.cleanup();

    this.started = false;
    this.namespace = null;
    this.vpnIp = null;

    this.logger(`[VpnThread:${this.agentId}] ✅ 종료 완료`);
  }

  /**
   * VPN IP 가져오기
   */
  getVpnIp() {
    return this.vpnIp;
  }

  /**
   * 네임스페이스 이름 가져오기
   */
  getNamespace() {
    return this.namespace;
  }

  /**
   * 실행 프리픽스 (네임스페이스 내 실행용)
   */
  getExecPrefix() {
    return this.vpn.getExecPrefix();
  }

  /**
   * 연결 상태 확인
   */
  isStarted() {
    return this.started;
  }

  /**
   * 세션 수
   */
  getSessionCount() {
    return this.sessions.size;
  }

  /**
   * 통계 정보
   */
  getStats() {
    const sessions = [];
    for (const s of this.sessions.values()) {
      sessions.push({
        sessionId: s.sessionId,
        profileId: s.profileId,
        profileName: s.profile.name,
        visitCount: s.visitCount,
        duration: ((Date.now() - s.startTime) / 1000).toFixed(1) + 's'
      });
    }

    return {
      agentId: this.agentId,
      threadIndex: this.threadIndex,
      namespace: this.namespace,
      vpnIp: this.vpnIp,
      started: this.started,
      sessionCount: this.sessions.size,
      sessions
    };
  }
}

export default VpnThread;
