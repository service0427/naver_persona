/**
 * Persona Manager
 * - 페르소나 세션 생명주기 관리
 * - DB 기반 백업/복원 통합
 * - 브라우저 컨텍스트와 연동
 */

import { createContext, CURRENT_CHROME_VERSION } from './browser-launcher.js';
import {
  initDB,
  backupPersona,
  restorePersona,
  listPersonas,
  getProfilePath
} from '../db/persona-db.js';
import fs from 'fs';
import path from 'path';

// DB 초기화 (모듈 로드 시 1회)
initDB();

/**
 * 페르소나 세션 시작
 * - DB에서 복원 시도 → 없으면 새로 생성
 * - 브라우저 컨텍스트 생성 및 반환
 *
 * @param {Object} options
 * @param {number} options.threadId - 스레드 ID
 * @param {string} options.chromeVersion - Chrome 버전 (기본: 현재 버전)
 * @param {boolean} options.restoreFromDB - DB에서 복원 시도 (기본: true)
 * @returns {Promise<PersonaSession>}
 */
export async function startPersonaSession(options = {}) {
  const {
    threadId = 0,
    chromeVersion = CURRENT_CHROME_VERSION,
    restoreFromDB = true
  } = options;

  console.log(`[PersonaManager] 세션 시작: thread-${threadId}/chrome-${chromeVersion}`);

  // 버전별 프로필 사용
  const profilePath = getProfilePath(threadId, chromeVersion);

  // DB에서 복원 시도
  if (restoreFromDB) {
    const restored = restorePersona(threadId, chromeVersion);
    if (restored) {
      console.log(`[PersonaManager] ✅ DB에서 복원 완료`);
    } else {
      console.log(`[PersonaManager] 📝 새 페르소나 생성`);
    }
  }

  // 브라우저 컨텍스트 생성
  const browserSession = await createContext({
    threadId,
    chromeVersion,
    useVersionedProfile: true  // thread-N/chrome-VER 구조 사용
  });

  return new PersonaSession({
    threadId,
    chromeVersion,
    profilePath,
    ...browserSession
  });
}

/**
 * 페르소나 세션 클래스
 * - 세션 종료 시 자동 백업
 * - 방문 통계 추적
 */
class PersonaSession {
  constructor(config) {
    this.threadId = config.threadId;
    this.chromeVersion = config.chromeVersion;
    this.profilePath = config.profilePath;
    this.context = config.context;
    this.page = config.page;
    this.humanSimulator = config.humanSimulator;

    this.startTime = Date.now();
    this.visitCount = 0;
    this.searchKeywords = [];
    this.lastDomain = null;
  }

  /**
   * 방문 기록
   */
  recordVisit(domain = null) {
    this.visitCount++;
    if (domain) {
      this.lastDomain = domain;
    }
  }

  /**
   * 검색어 기록
   */
  recordSearch(keyword) {
    if (keyword && !this.searchKeywords.includes(keyword)) {
      this.searchKeywords.push(keyword);
    }
  }

  /**
   * 세션 종료 및 DB 백업
   */
  async close(options = {}) {
    const { backup = true } = options;

    console.log(`[PersonaManager] 세션 종료: thread-${this.threadId}/chrome-${this.chromeVersion}`);

    // 브라우저 컨텍스트 닫기 (프로필 파일 flush)
    await this.context.close();

    // DB에 백업
    if (backup) {
      const success = backupPersona(this.threadId, this.chromeVersion);
      if (success) {
        console.log(`[PersonaManager] ✅ DB 백업 완료`);
      } else {
        console.log(`[PersonaManager] ⚠️ DB 백업 실패`);
      }
    }

    const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log(`[PersonaManager] 세션 통계: ${this.visitCount}회 방문, ${this.searchKeywords.length}개 검색어, ${duration}초`);

    return {
      threadId: this.threadId,
      chromeVersion: this.chromeVersion,
      duration: parseFloat(duration),
      visitCount: this.visitCount,
      searchKeywords: this.searchKeywords,
      lastDomain: this.lastDomain
    };
  }
}

/**
 * 모든 페르소나 목록 조회
 */
export function getPersonas() {
  return listPersonas();
}

/**
 * 페르소나 통계 출력
 */
export function printPersonaStats() {
  const personas = listPersonas();

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║              페르소나 DB 통계                                   ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');

  if (personas.length === 0) {
    console.log('║  저장된 페르소나 없음                                          ║');
  } else {
    console.log('║  Thread | Chrome |  Cookies |  History | Updated              ║');
    console.log('║---------|--------|----------|----------|----------------------║');

    personas.forEach(p => {
      const cookiesKB = (p.cookies_size / 1024).toFixed(1).padStart(6);
      const historyKB = p.history_size ? (p.history_size / 1024).toFixed(1).padStart(6) : '   N/A';
      const updated = p.updated_at.substring(0, 16);
      console.log(`║     ${String(p.thread_id).padStart(3)} |    ${p.chrome_version.padEnd(3)} | ${cookiesKB}KB | ${historyKB}KB | ${updated} ║`);
    });
  }

  console.log('╚══════════════════════════════════════════════════════════════╝');

  return personas;
}

export default {
  startPersonaSession,
  getPersonas,
  printPersonaStats,
  PersonaSession
};
