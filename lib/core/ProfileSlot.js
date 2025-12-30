/**
 * ProfileSlot - 슬롯 기반 프로필 관리
 *
 * 슬롯 ID 형식: "thread-browser" (예: "0-0", "1-2")
 * 프로필 경로: data/thread-{N}/{chrome-version}/
 *
 * 기능:
 * - 슬롯 ID 파싱/생성
 * - 프로필 경로 관리
 * - 파일 백업/복원
 * - DB 연동
 */

import fs from 'fs';
import path from 'path';
import db from '../db/PersonaDB.js';
import { backupProfile, restoreProfile, isValidBackup, getBackupSummary } from '../utils/profile-backup.js';

const DATA_DIR = path.resolve('./data');

export default class ProfileSlot {
  /**
   * @param {number} threadId - 스레드 ID (0-based)
   * @param {string} chromeVersion - Chrome 버전 fullName (예: "chrome-143-0-7499-109")
   */
  constructor(threadId, chromeVersion) {
    this.threadId = threadId;
    this.chromeVersion = chromeVersion;
    this.profileDir = path.join(DATA_DIR, `thread-${threadId}`, chromeVersion);
    this.profileKey = `thread-${threadId}/${chromeVersion}`;

    // DB에서 로드된 데이터 캐시
    this._cachedData = null;
  }

  /**
   * 슬롯 ID 문자열에서 ProfileSlot 생성
   * @param {string} slotId - "0-0" 또는 "thread-0/chrome-143-0-7499-109" 형식
   * @param {Object} chromeVersionsMap - { majorVersion: ChromeVersion } 맵 (간략 ID 사용 시)
   */
  static fromSlotId(slotId, chromeVersionsMap = null) {
    // 형식 1: "0-0" (threadId-browserIndex)
    if (/^\d+-\d+$/.test(slotId)) {
      const [threadId, browserIndex] = slotId.split('-').map(Number);
      if (!chromeVersionsMap) {
        throw new Error('chromeVersionsMap required for short slot ID format');
      }
      const versions = Object.values(chromeVersionsMap);
      if (browserIndex >= versions.length) {
        throw new Error(`Browser index ${browserIndex} out of range (max: ${versions.length - 1})`);
      }
      return new ProfileSlot(threadId, versions[browserIndex].fullName);
    }

    // 형식 2: "thread-0/chrome-143-0-7499-109"
    const match = slotId.match(/^thread-(\d+)\/(.+)$/);
    if (match) {
      return new ProfileSlot(parseInt(match[1]), match[2]);
    }

    throw new Error(`Invalid slot ID format: ${slotId}`);
  }

  /**
   * 슬롯 ID 생성 (간략/상세)
   */
  get slotId() {
    return `${this.threadId}-${this.chromeVersion}`;
  }

  get shortId() {
    // Chrome 버전에서 major 버전만 추출
    const majorMatch = this.chromeVersion.match(/chrome-(\d+)/);
    const major = majorMatch ? majorMatch[1] : this.chromeVersion;
    return `T${this.threadId}-C${major}`;
  }

  // =========== 파일 시스템 ===========

  /**
   * 프로필 디렉토리 존재 여부
   */
  exists() {
    return fs.existsSync(this.profileDir);
  }

  /**
   * 프로필 디렉토리 생성
   */
  ensureDir() {
    fs.mkdirSync(path.join(this.profileDir, 'Default'), { recursive: true });
    return this;
  }

  /**
   * 프로필 초기화 (쿠키/히스토리만 삭제, 캐시/스토리지 유지)
   */
  reset() {
    if (!this.exists()) {
      return { reset: false, reason: '폴더 없음' };
    }

    const defaultDir = path.join(this.profileDir, 'Default');
    if (!fs.existsSync(defaultDir)) {
      return { reset: false, reason: 'Default 없음' };
    }

    // 삭제할 파일만 (쿠키, 히스토리) - 캐시/스토리지는 유지!
    const toDelete = [
      'Cookies', 'Cookies-journal',
      'History', 'History-journal',
    ];

    let deleted = 0;
    for (const name of toDelete) {
      const target = path.join(defaultDir, name);
      if (fs.existsSync(target)) {
        try {
          fs.unlinkSync(target);
          deleted++;
        } catch (e) { /* 무시 */ }
      }
    }

    // SingletonLock 파일 삭제
    const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
    for (const lock of lockFiles) {
      const lockPath = path.join(this.profileDir, lock);
      if (fs.existsSync(lockPath)) {
        try { fs.unlinkSync(lockPath); } catch (e) {}
      }
    }

    return { reset: true, deleted };
  }

  /**
   * 프로필 전체 삭제 (새 페르소나 생성 시 사용)
   * - 모든 파일과 디렉토리를 삭제하고 새로 시작
   */
  fullReset() {
    if (!this.exists()) {
      return { reset: false, reason: '폴더 없음' };
    }

    try {
      fs.rmSync(this.profileDir, { recursive: true, force: true });
      return { reset: true, deleted: 'all' };
    } catch (e) {
      return { reset: false, reason: e.message };
    }
  }

  // =========== 파일 백업/복원 ===========

  /**
   * 파일 백업 생성
   * @returns {Object} 백업 데이터
   */
  async backup() {
    if (!this.exists()) {
      return null;
    }
    return await backupProfile(this.profileDir);
  }

  /**
   * 파일 백업 복원
   * @param {Object} backupData - backupProfile()에서 반환된 데이터
   * @returns {Object} 복원 결과
   */
  async restore(backupData) {
    if (!backupData || !isValidBackup(backupData)) {
      return { success: false, error: '유효하지 않은 백업 데이터' };
    }

    this.ensureDir();
    return await restoreProfile(this.profileDir, backupData);
  }

  // =========== DB 연동 ===========

  /**
   * DB에서 프로필 데이터 로드
   */
  async loadFromDb() {
    await db.connect();
    this._cachedData = await db.loadProfileData(this.threadId, this.chromeVersion);
    return this._cachedData;
  }

  /**
   * DB에 프로필 데이터 저장
   * @param {Object} data - { vpnIp, fingerprint, cookies, origins, fileBackup, history, preferences, result }
   */
  async saveToDb(data) {
    await db.connect();
    return await db.saveProfileData({
      threadId: this.threadId,
      chromeVersion: this.chromeVersion,
      ...data
    });
  }

  /**
   * DB에서 로드 후 파일 백업 복원
   * @returns {Object} { loaded: boolean, restored: boolean, data: Object }
   */
  async loadAndRestore() {
    const data = await this.loadFromDb();

    if (!data) {
      return { loaded: false, restored: false, data: null };
    }

    let restored = false;
    if (data.fileBackup && isValidBackup(data.fileBackup)) {
      const result = await this.restore(data.fileBackup);
      restored = result.success;
    }

    return { loaded: true, restored, data };
  }

  /**
   * 파일 백업 후 DB 저장
   * @param {Object} sessionData - { vpnIp, fingerprint, cookies, origins, history, preferences, result }
   */
  async backupAndSave(sessionData) {
    const fileBackup = await this.backup();

    return await this.saveToDb({
      ...sessionData,
      fileBackup
    });
  }

  // =========== 유틸리티 ===========

  /**
   * 프로필 상태 요약
   */
  getStatus() {
    const exists = this.exists();

    let fileInfo = null;
    if (exists) {
      const defaultDir = path.join(this.profileDir, 'Default');
      const cookiesPath = path.join(defaultDir, 'Cookies');
      const localStoragePath = path.join(defaultDir, 'Local Storage', 'leveldb');

      fileInfo = {
        hasCookies: fs.existsSync(cookiesPath),
        hasLocalStorage: fs.existsSync(localStoragePath),
      };
    }

    return {
      slotId: this.slotId,
      shortId: this.shortId,
      profileKey: this.profileKey,
      profileDir: this.profileDir,
      exists,
      ...fileInfo,
      cachedData: this._cachedData ? {
        vpnIp: this._cachedData.vpnIp,
        totalUses: this._cachedData.totalUses,
        lastResult: this._cachedData.lastResult,
        hasFileBackup: !!this._cachedData.fileBackup,
        cookieCount: this._cachedData.cookies?.length || 0,
      } : null
    };
  }

  /**
   * 백업 요약 문자열
   */
  getBackupSummary(backup) {
    return getBackupSummary(backup);
  }

  toString() {
    return `ProfileSlot(${this.shortId})`;
  }
}

// =========== 유틸리티 함수 ===========

/**
 * 여러 슬롯 일괄 생성
 * @param {number} threadCount - 스레드 수
 * @param {Array} chromeVersions - ChromeVersion 배열
 * @returns {ProfileSlot[][]} 2D 배열 [thread][browser]
 */
export function createSlotGrid(threadCount, chromeVersions) {
  const grid = [];

  for (let t = 0; t < threadCount; t++) {
    const row = [];
    for (const cv of chromeVersions) {
      row.push(new ProfileSlot(t, cv.fullName));
    }
    grid.push(row);
  }

  return grid;
}

/**
 * 모든 슬롯 초기화
 * @param {ProfileSlot[][]} grid
 * @returns {{ resetCount: number, deletedCount: number }}
 */
export function resetAllSlots(grid) {
  let resetCount = 0;
  let deletedCount = 0;

  for (const row of grid) {
    for (const slot of row) {
      const result = slot.reset();
      if (result.reset) {
        resetCount++;
        deletedCount += result.deleted;
      }
    }
  }

  return { resetCount, deletedCount };
}

/**
 * DB에서 모든 슬롯 데이터 로드
 * @param {ProfileSlot[][]} grid
 * @returns {Map<string, Object>} profileKey -> data
 */
export async function loadAllSlotsFromDb(grid) {
  await db.connect();

  const dataMap = new Map();

  for (const row of grid) {
    for (const slot of row) {
      const data = await slot.loadFromDb();
      if (data) {
        dataMap.set(slot.profileKey, data);
      }
    }
  }

  return dataMap;
}
