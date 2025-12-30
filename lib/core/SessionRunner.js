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
import { flickScroll, scrollUp } from '../behavior/CDPTouchScroll.js';

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
    this.cdp = null;  // CDP 세션 (터치 스크롤용)
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

    // CDP 세션 생성 (터치 스크롤용)
    try {
      this.cdp = await this.context.newCDPSession(this.page);
    } catch (e) {
      console.log(`   ⚠️ CDP 세션 생성 실패: ${e.message}`);
    }

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

      // 1. 네이버 메인 로드 (재시도 포함)
      let mainLoaded = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await this.page.goto('https://m.naver.com', { waitUntil: 'domcontentloaded', timeout: 45000 });
          mainLoaded = true;
          break;
        } catch (e) {
          if (attempt === 0) {
            await this.page.waitForTimeout(2000);  // 재시도 전 대기
          } else {
            throw e;
          }
        }
      }
      await this.page.waitForTimeout(1500);

      // 2. 메인 페이지에서 자연스러운 스크롤 (CDP 터치)
      if (this.cdp) {
        try {
          await this.performMainPageScroll();
        } catch (scrollError) {
          // 스크롤 실패해도 계속 진행
        }
      }

      // 3. 맨 위로 복귀 후 검색창 클릭
      await this.page.evaluate(() => window.scrollTo(0, 0));
      await this.page.waitForTimeout(500);

      // 검색창 찾기 (재시도 포함)
      let searchBox = await this.page.$('#MM_SEARCH_FAKE');
      if (!searchBox) {
        await this.page.waitForTimeout(1500);
        searchBox = await this.page.$('#MM_SEARCH_FAKE');
        if (!searchBox) {
          throw new Error('검색창(#MM_SEARCH_FAKE) 찾기 실패');
        }
      }

      await this.page.click('#MM_SEARCH_FAKE');
      await this.page.waitForTimeout(800);

      // 검색어 입력 (재시도 포함)
      const queryInput = await this.page.$('#query');
      if (!queryInput) {
        await this.page.waitForTimeout(1000);
      }
      await this.page.fill('#query', searchQuery, { timeout: 10000 });
      await this.page.press('#query', 'Enter');
      await this.page.waitForLoadState('domcontentloaded', { timeout: 45000 });
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

        // === 검색 성공 후 CDP 터치 스크롤 ===
        if (this.cdp) {
          try {
            await this.performNaturalScroll();
          } catch (scrollError) {
            // 스크롤 실패해도 검색은 성공으로 처리
            console.log(`   ⚠️ 스크롤 오류: ${scrollError.message}`);
          }
        }
      }

    } catch (error) {
      this.result = '에러';
      this.error = error.message;
      console.log(`   ❌ ${this.slot.shortId} 에러: ${error.message.substring(0, 100)}`);
    }

    return this;
  }

  /**
   * 메인 페이지 자연스러운 스크롤 (검색 전)
   * - 아래로 300~500px 플릭 1~3회 (랜덤)
   * - 위로 100~200px 플릭 1~3회 (랜덤)
   * - 메인 페이지는 관성 없음 (1:1 비율)
   */
  async performMainPageScroll() {
    const delay = ms => new Promise(r => setTimeout(r, ms));

    // 아래로 스크롤: 1~3회
    const downCount = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < downCount; i++) {
      const distance = 300 + Math.floor(Math.random() * 201);  // 300~500
      const duration = 80 + Math.floor(Math.random() * 50);

      await flickScroll(this.page, this.cdp, distance, {
        duration,
        wobble: true,
        verbose: false
      });

      await delay(600 + Math.floor(Math.random() * 500));  // 600~1100ms
    }

    // 위로 스크롤: 1~3회
    const upCount = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < upCount; i++) {
      const distance = 100 + Math.floor(Math.random() * 101);  // 100~200

      await scrollUp(this.page, this.cdp, distance, { verbose: false });

      await delay(400 + Math.floor(Math.random() * 400));  // 400~800ms
    }

    await delay(300 + Math.floor(Math.random() * 300));
  }

  /**
   * 검색 결과 자연스러운 스크롤 (검색 후)
   * - 아래로 300~500px 플릭 1~3회 (랜덤)
   * - 위로 100~200px 플릭 1~3회 (랜덤)
   * - 검색 결과는 관성 있음 (1:10~12 비율)
   */
  async performNaturalScroll() {
    const delay = ms => new Promise(r => setTimeout(r, ms));

    // 아래로 스크롤: 1~3회
    const downCount = 1 + Math.floor(Math.random() * 3);  // 1, 2, or 3
    for (let i = 0; i < downCount; i++) {
      const distance = 300 + Math.floor(Math.random() * 201);  // 300~500
      const duration = 80 + Math.floor(Math.random() * 50);    // 80~130ms

      await flickScroll(this.page, this.cdp, distance, {
        duration,
        wobble: true,
        verbose: false
      });

      // 스크롤 사이 읽는 시간 (800~1500ms)
      await delay(800 + Math.floor(Math.random() * 700));
    }

    // 위로 스크롤: 1~3회
    const upCount = 1 + Math.floor(Math.random() * 3);  // 1, 2, or 3
    for (let i = 0; i < upCount; i++) {
      const distance = 100 + Math.floor(Math.random() * 101);  // 100~200
      const duration = 80 + Math.floor(Math.random() * 50);

      await scrollUp(this.page, this.cdp, distance, { verbose: false });

      // 스크롤 사이 읽는 시간
      await delay(600 + Math.floor(Math.random() * 500));
    }

    // 최종 대기 (콘텐츠 안정화)
    await delay(500 + Math.floor(Math.random() * 500));
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

      // 브라우저 간 간격 (네트워크 병목 방지)
      if (i < slots.length - 1) {
        await new Promise(r => setTimeout(r, 1000));  // 500 → 1000ms
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
   * 모든 세션에서 네이버 검색 실행 (시차 병렬)
   * - 각 세션 시작 시 랜덤 지연 (0~2초)으로 네트워크 부하 분산
   */
  async runSearchAll(searchQuery = FIXED_SEARCH) {
    await Promise.all(
      this.sessions.map(async (session, idx) => {
        // 각 세션마다 0~2초 랜덤 지연 (인덱스 기반 + 랜덤)
        const delay = idx * 500 + Math.floor(Math.random() * 1000);
        await new Promise(r => setTimeout(r, delay));
        return session.runNaverSearch(this.vpnIp, searchQuery);
      })
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
