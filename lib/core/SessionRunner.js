/**
 * SessionRunner - 브라우저 세션 실행 및 관리
 *
 * 역할:
 * - 브라우저 생성/종료
 * - 네이버 검색 실행
 * - 결과 수집 (storageState, 히스토리)
 * - 파일 백업 생성
 */

import { createContextWithPersona } from './browser-launcher.js';
import Persona from './Persona.js';
import ProfileSlot from './ProfileSlot.js';
import { extractProfileData, extractPreferences } from '../utils/profile-extractor.js';
import { FIXED_SEARCH } from '../db/Database.js';

/**
 * 단일 브라우저 세션
 */
export class BrowserSession {
  constructor(slot, options = {}) {
    this.slot = slot;  // ProfileSlot 인스턴스
    this.options = options;

    // 런타임 상태
    this.persona = null;
    this.context = null;
    this.page = null;
    this.result = null;  // '성공', '봇탐지', 'IP불일치', '에러'
    this.error = null;

    // 추출된 데이터
    this.storageState = null;  // { cookies, origins }
    this.fileBackup = null;
    this.history = [];
  }

  /**
   * 브라우저 시작
   */
  async start(chromeVersion, windowPosition = null) {
    // 페르소나 생성 (매번 새로운 핑거프린트)
    this.persona = await Persona.createEphemeral('galaxy-s23');

    // 브라우저 실행
    const session = await createContextWithPersona({
      persona: this.persona,
      chromeVersion,
      profileDir: this.slot.profileDir,
      debugPort: this.options.debugPort || 9222,
      windowPosition
    });

    this.context = session.context;
    this.page = session.page;

    return this;
  }

  /**
   * 쿠키 복원 (DB에서 로드된 데이터)
   */
  async restoreCookies(cookies) {
    if (!cookies || cookies.length === 0) return 0;

    try {
      await this.context.addCookies(cookies);
      return cookies.length;
    } catch (e) {
      return 0;
    }
  }

  /**
   * 네이버 검색 실행
   * IP 확인은 브라우저가 아닌 외부에서 curl로 수행 (localStorage 오염 방지)
   */
  async runNaverSearch(expectedIp, searchQuery = FIXED_SEARCH) {
    try {
      // IP 확인은 이제 브라우저 외부에서 수행 (VpnManager.checkIp)
      // 브라우저로 ipify 접속하면 localStorage에 흔적이 남음

      // 바로 네이버 검색
      await this.page.goto('https://m.naver.com', { waitUntil: 'load', timeout: 60000 });
      await this.page.waitForTimeout(1000);

      await this.page.click('#MM_SEARCH_FAKE');
      await this.page.waitForTimeout(500);
      await this.page.fill('#query', searchQuery);
      await this.page.press('#query', 'Enter');
      await this.page.waitForLoadState('load', { timeout: 60000 });
      await this.page.waitForTimeout(2000);

      // 3. 결과 확인
      const blocked = await this.page.evaluate(() => {
        const text = document.body.innerText;
        return text.includes('자동입력') || text.includes('보안문자');
      });

      if (blocked) {
        this.result = '봇탐지';
      } else {
        this.result = '성공';
        await this.persona.recordUsage('search');
      }

    } catch (error) {
      this.result = '에러';
      this.error = error.message;
    }

    return this;
  }

  /**
   * storageState 추출 (브라우저 종료 전)
   */
  async extractStorageState() {
    try {
      const state = await this.context.storageState();
      this.storageState = {
        cookies: state.cookies || [],
        origins: state.origins || []
      };
    } catch (e) {
      this.storageState = { cookies: [], origins: [] };
    }
    return this.storageState;
  }

  /**
   * 브라우저 종료
   */
  async close() {
    try {
      await this.context.close();
    } catch (e) { /* 무시 */ }
  }

  /**
   * 브라우저 종료 후 데이터 추출 (히스토리 + 파일 백업)
   */
  async extractAfterClose() {
    // 히스토리 추출
    try {
      const extracted = extractProfileData(this.slot.profileDir);
      this.history = extracted.history || [];
    } catch (e) {
      this.history = [];
    }

    // 파일 백업
    this.fileBackup = await this.slot.backup();

    return {
      history: this.history,
      fileBackup: this.fileBackup
    };
  }

  /**
   * DB 저장용 데이터 생성
   */
  toProfileData(vpnIp) {
    const preferences = extractPreferences(this.slot.profileDir);

    return {
      threadId: this.slot.threadId,
      chromeVersion: this.slot.chromeVersion,
      profileDir: this.slot.profileDir,
      vpnIp,
      fingerprint: this.persona?.fingerprint || {},
      cookies: this.storageState?.cookies || [],
      origins: this.storageState?.origins || [],
      fileBackup: this.fileBackup,
      history: this.history,
      preferences,
      result: this.result
    };
  }

  /**
   * 결과 요약
   */
  getSummary() {
    const lsCount = (this.storageState?.origins || [])
      .reduce((sum, o) => sum + (o.localStorage?.length || 0), 0);

    return {
      slot: this.slot.shortId,
      result: this.result,
      cookies: this.storageState?.cookies?.length || 0,
      localStorage: lsCount,
      history: this.history.length,
      hasBackup: !!this.fileBackup
    };
  }
}

/**
 * 여러 세션을 관리하는 러너
 */
export default class SessionRunner {
  constructor(options = {}) {
    this.options = options;
    this.sessions = [];
    this.vpnIp = null;
  }

  /**
   * 세션들 생성 및 시작
   * @param {ProfileSlot[]} slots - 실행할 슬롯들
   * @param {Object[]} chromeVersions - Chrome 버전 정보 배열
   * @param {string} vpnIp - VPN IP
   * @param {Object} windowLayout - 창 위치 계산용
   */
  async startAll(slots, chromeVersions, vpnIp, windowLayout = null) {
    this.vpnIp = vpnIp;
    this.sessions = [];

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];

      // Chrome 버전 찾기
      const cv = chromeVersions.find(v => v.fullName === slot.chromeVersion);
      if (!cv) {
        console.log(`   ⚠️ Chrome 버전 없음: ${slot.chromeVersion}`);
        continue;
      }

      // 창 위치 계산
      let windowPosition = null;
      if (windowLayout) {
        windowPosition = this.calculateWindowPosition(
          slot.threadId,
          i,
          windowLayout
        );
      }

      // 세션 생성 및 시작
      const session = new BrowserSession(slot, {
        debugPort: 9222 + (slot.threadId * 10) + i
      });

      await session.start(cv, windowPosition);
      this.sessions.push(session);

      // 브라우저 간 간격
      if (i < slots.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    return this.sessions;
  }

  /**
   * 저장된 쿠키 복원
   * @param {Map<string, Object>} dataMap - profileKey -> { cookies, ... }
   */
  async restoreCookies(dataMap) {
    for (const session of this.sessions) {
      const data = dataMap.get(session.slot.profileKey);
      if (data?.cookies?.length > 0) {
        const count = await session.restoreCookies(data.cookies);
        if (count > 0) {
          console.log(`      → ${session.slot.shortId}: ${count}개 쿠키 복원`);
        }
      }
    }
  }

  /**
   * 모든 세션에서 네이버 검색 실행 (병렬)
   */
  async runSearchAll(searchQuery = FIXED_SEARCH) {
    await Promise.all(
      this.sessions.map(session =>
        session.runNaverSearch(this.vpnIp, searchQuery)
      )
    );

    return this.getResults();
  }

  /**
   * storageState 추출 (브라우저 종료 전)
   */
  async extractStorageStateAll() {
    for (const session of this.sessions) {
      await session.extractStorageState();
    }
  }

  /**
   * 모든 브라우저 종료
   */
  async closeAll() {
    for (const session of this.sessions) {
      await session.close();
    }
  }

  /**
   * 브라우저 종료 후 데이터 추출
   */
  async extractAfterCloseAll() {
    for (const session of this.sessions) {
      await session.extractAfterClose();
    }
  }

  /**
   * DB 저장용 프로필 데이터 목록
   */
  getProfileDataList() {
    return this.sessions.map(s => s.toProfileData(this.vpnIp));
  }

  /**
   * 결과 집계
   */
  getResults() {
    return {
      success: this.sessions.filter(s => s.result === '성공').length,
      blocked: this.sessions.filter(s => s.result === '봇탐지').length,
      error: this.sessions.filter(s => !['성공', '봇탐지'].includes(s.result)).length
    };
  }

  /**
   * 요약 출력
   */
  printSummary() {
    for (const session of this.sessions) {
      const summary = session.getSummary();
      const icon = summary.result === '성공' ? '✅' :
                   summary.result === '봇탐지' ? '⚠️' : '❌';

      console.log(`   ${icon} ${summary.slot}: 쿠키 ${summary.cookies}개, ` +
                  `localStorage ${summary.localStorage}개, ` +
                  `히스토리 ${summary.history}개, ` +
                  `백업: ${summary.hasBackup ? '있음' : '없음'}`);
    }
  }

  /**
   * 창 위치 계산
   */
  calculateWindowPosition(threadIndex, browserIndex, layout) {
    const {
      X_START = 60,
      X_SPACING = 520,
      Y_START = 30,
      Y_SPACING = 46,
      WIDTH = 400,
      HEIGHT = 800
    } = layout;

    return {
      x: X_START + (threadIndex * X_SPACING),
      y: Y_START + (browserIndex * Y_SPACING),
      width: WIDTH,
      height: HEIGHT
    };
  }

  /**
   * 전체 흐름 실행 (편의 메서드)
   */
  async runFullSession(slots, chromeVersions, vpnIp, options = {}) {
    const {
      searchQuery = FIXED_SEARCH,
      windowLayout = null,
      restoreData = null  // Map<profileKey, data>
    } = options;

    // 1. 브라우저 시작
    await this.startAll(slots, chromeVersions, vpnIp, windowLayout);

    // 2. 쿠키 복원
    if (restoreData) {
      await this.restoreCookies(restoreData);
    }

    // 3. 검색 실행
    await this.runSearchAll(searchQuery);

    // 4. storageState 추출
    await this.extractStorageStateAll();

    // 5. 브라우저 종료
    await this.closeAll();

    // 6. 파일 백업 추출
    await this.extractAfterCloseAll();

    return {
      results: this.getResults(),
      profileDataList: this.getProfileDataList()
    };
  }
}
