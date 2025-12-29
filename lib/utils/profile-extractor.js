/**
 * Profile Extractor - 브라우저 종료 후 SQLite에서 데이터 추출
 *
 * Chromium 프로필 폴더 구조:
 * profileDir/
 *   └── Default/
 *       ├── Cookies (SQLite) - 암호화됨, 복호화 불가 → cookie-backup.js 사용
 *       ├── History (SQLite) - 추출 가능 ✓
 *       ├── Preferences (JSON) - 추출 가능 ✓
 *       └── Local Storage/leveldb/ - LevelDB 형식
 *
 * 쿠키 참고:
 * - Linux Chromium 쿠키는 AES-128-GCM으로 암호화됨 (v10 prefix)
 * - Chrome 130+에서는 도메인 해시가 추가되어 오프라인 복호화 불가
 * - 쿠키는 cookie-backup.js의 파일 백업 방식 사용
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

/**
 * Default 폴더 경로 반환
 */
function getDefaultPath(profileDir) {
  return path.join(profileDir, 'Default');
}

/**
 * 쿠키 통계만 조회 (복호화 없이)
 * 복호화는 불가능하므로 개수/도메인만 확인
 */
export function getCookieStats(profileDir) {
  const cookiesPath = path.join(getDefaultPath(profileDir), 'Cookies');

  if (!fs.existsSync(cookiesPath)) {
    return { exists: false };
  }

  try {
    const db = new Database(cookiesPath, { readonly: true });

    const total = db.prepare('SELECT COUNT(*) as count FROM cookies').get().count;

    const byDomain = db.prepare(`
      SELECT host_key as domain, COUNT(*) as count
      FROM cookies
      GROUP BY host_key
      ORDER BY count DESC
      LIMIT 10
    `).all();

    const meta = db.prepare('SELECT * FROM meta').all();

    db.close();

    return {
      exists: true,
      total,
      byDomain: Object.fromEntries(byDomain.map(d => [d.domain, d.count])),
      metaVersion: meta.find(m => m.key === 'version')?.value,
      note: '쿠키 복호화 불가 - cookie-backup.js로 파일 백업 사용'
    };

  } catch (error) {
    return { exists: true, error: error.message };
  }
}

/**
 * 프로필에서 방문 기록 추출
 * @param {string} profileDir - 프로필 디렉토리 경로
 * @param {number} limit - 최대 개수
 * @returns {Array} 방문 기록 배열
 */
export function extractHistory(profileDir, limit = 100) {
  const historyPath = path.join(getDefaultPath(profileDir), 'History');

  if (!fs.existsSync(historyPath)) {
    return [];
  }

  try {
    const db = new Database(historyPath, { readonly: true });

    const history = db.prepare(`
      SELECT
        url,
        title,
        visit_count,
        last_visit_time
      FROM urls
      ORDER BY last_visit_time DESC
      LIMIT ?
    `).all(limit);

    db.close();

    return history.map(h => ({
      url: h.url,
      title: h.title || '',
      visitCount: h.visit_count,
      lastVisit: chromiumTimeToUnix(h.last_visit_time)
    }));

  } catch (error) {
    console.log(`[ProfileExtractor] 히스토리 추출 실패: ${error.message}`);
    return [];
  }
}

/**
 * 프로필에서 Preferences 추출 (JSON)
 * @param {string} profileDir - 프로필 디렉토리 경로
 * @returns {Object} Preferences 객체
 */
export function extractPreferences(profileDir) {
  const prefsPath = path.join(getDefaultPath(profileDir), 'Preferences');

  if (!fs.existsSync(prefsPath)) {
    return null;
  }

  try {
    const data = fs.readFileSync(prefsPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.log(`[ProfileExtractor] Preferences 추출 실패: ${error.message}`);
    return null;
  }
}

/**
 * 프로필에서 모든 데이터 추출
 * @param {string} profileDir - 프로필 디렉토리 경로
 * @returns {Object} { cookieStats, history, preferences }
 */
export function extractProfileData(profileDir) {
  return {
    cookieStats: getCookieStats(profileDir),  // 쿠키는 통계만 (복호화 불가)
    history: extractHistory(profileDir),
    preferences: extractPreferences(profileDir)
  };
}

/**
 * 프로필 전체 요약 정보
 */
export function getProfileSummary(profileDir) {
  const defaultPath = getDefaultPath(profileDir);

  if (!fs.existsSync(defaultPath)) {
    return { exists: false, profileDir };
  }

  const summary = {
    exists: true,
    profileDir,
    files: {}
  };

  // 주요 파일 체크
  const checkFiles = ['Cookies', 'History', 'Preferences', 'Web Data', 'Bookmarks'];

  for (const file of checkFiles) {
    const filePath = path.join(defaultPath, file);
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      summary.files[file] = {
        exists: true,
        size: stat.size,
        modified: stat.mtime.toISOString()
      };
    } else {
      summary.files[file] = { exists: false };
    }
  }

  // LocalStorage 디렉토리
  const lsPath = path.join(defaultPath, 'Local Storage', 'leveldb');
  if (fs.existsSync(lsPath)) {
    const files = fs.readdirSync(lsPath);
    summary.files['LocalStorage'] = {
      exists: true,
      fileCount: files.length
    };
  }

  return summary;
}

/**
 * 네이버 관련 히스토리만 추출
 */
export function extractNaverHistory(profileDir, limit = 50) {
  const historyPath = path.join(getDefaultPath(profileDir), 'History');

  if (!fs.existsSync(historyPath)) {
    return [];
  }

  try {
    const db = new Database(historyPath, { readonly: true });

    const history = db.prepare(`
      SELECT url, title, visit_count, last_visit_time
      FROM urls
      WHERE url LIKE '%naver.com%'
      ORDER BY last_visit_time DESC
      LIMIT ?
    `).all(limit);

    db.close();

    return history.map(h => ({
      url: h.url,
      title: h.title || '',
      visitCount: h.visit_count,
      lastVisit: chromiumTimeToUnix(h.last_visit_time)
    }));

  } catch (error) {
    return [];
  }
}

/**
 * Chromium 시간을 Unix 타임스탬프로 변환
 * Chromium: 1601년 1월 1일부터의 마이크로초
 * Unix: 1970년 1월 1일부터의 초
 */
function chromiumTimeToUnix(chromiumTime) {
  if (!chromiumTime || chromiumTime === 0) return -1;

  // Chromium epoch: 1601-01-01 00:00:00 UTC
  // Unix epoch: 1970-01-01 00:00:00 UTC
  // 차이: 11644473600 초
  const CHROMIUM_EPOCH_OFFSET = 11644473600n;

  // 마이크로초 → 초 변환
  const seconds = BigInt(chromiumTime) / 1000000n;
  const unixTime = seconds - CHROMIUM_EPOCH_OFFSET;

  return Number(unixTime);
}

/**
 * SameSite 값을 문자열로 변환
 */
function sameSiteToString(samesite) {
  switch (samesite) {
    case 0: return 'None';
    case 1: return 'Lax';
    case 2: return 'Strict';
    default: return 'Lax';
  }
}

export default {
  getCookieStats,
  extractHistory,
  extractPreferences,
  extractProfileData,
  getProfileSummary,
  extractNaverHistory
};
