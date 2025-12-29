/**
 * Cookie Backup/Restore Utility
 *
 * Chrome 쿠키는 암호화되어 있어 오프라인 복호화가 불가능합니다.
 * 대신 쿠키 파일 전체를 백업하고 복원하는 방식을 사용합니다.
 *
 * 백업 대상:
 * - Default/Cookies (SQLite DB)
 * - Default/Cookies-journal (WAL journal)
 * - Local State (암호화 키 메타데이터)
 */

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import zlib from 'zlib';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// 백업할 파일 목록
const BACKUP_FILES = [
  'Default/Cookies',
  'Default/Cookies-journal',
  'Local State'
];

/**
 * 프로필의 쿠키 파일들을 백업
 * @param {string} profileDir - Chrome 프로필 디렉토리 경로
 * @returns {Promise<Object>} 백업 데이터 (base64 인코딩된 gzip 압축 파일들)
 */
export async function backupCookies(profileDir) {
  const backup = {
    version: 1,
    timestamp: Date.now(),
    profileDir,
    files: {}
  };

  for (const relPath of BACKUP_FILES) {
    const fullPath = path.join(profileDir, relPath);

    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath);
        const compressed = await gzip(content);
        backup.files[relPath] = {
          size: content.length,
          compressedSize: compressed.length,
          data: compressed.toString('base64')
        };
      } catch (error) {
        console.warn(`[CookieBackup] Failed to backup ${relPath}:`, error.message);
      }
    }
  }

  const backedUpCount = Object.keys(backup.files).length;
  console.log(`[CookieBackup] Backed up ${backedUpCount} files from ${path.basename(profileDir)}`);

  return backup;
}

/**
 * 백업 데이터를 프로필에 복원
 * @param {string} profileDir - Chrome 프로필 디렉토리 경로
 * @param {Object} backup - backupCookies()에서 반환된 백업 데이터
 * @returns {Promise<boolean>} 복원 성공 여부
 */
export async function restoreCookies(profileDir, backup) {
  if (!backup || !backup.files) {
    console.warn('[CookieBackup] Invalid backup data');
    return false;
  }

  let restoredCount = 0;

  for (const [relPath, fileData] of Object.entries(backup.files)) {
    const fullPath = path.join(profileDir, relPath);
    const dirPath = path.dirname(fullPath);

    try {
      // 디렉토리 생성
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      // 압축 해제 및 파일 쓰기
      const compressed = Buffer.from(fileData.data, 'base64');
      const content = await gunzip(compressed);
      fs.writeFileSync(fullPath, content);
      restoredCount++;
    } catch (error) {
      console.warn(`[CookieBackup] Failed to restore ${relPath}:`, error.message);
    }
  }

  console.log(`[CookieBackup] Restored ${restoredCount} files to ${path.basename(profileDir)}`);
  return restoredCount > 0;
}

/**
 * 백업 데이터를 JSON 파일로 저장
 * @param {Object} backup - 백업 데이터
 * @param {string} outputPath - 저장 경로
 */
export function saveBackupToFile(backup, outputPath) {
  fs.writeFileSync(outputPath, JSON.stringify(backup));
  const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(1);
  console.log(`[CookieBackup] Saved to ${outputPath} (${sizeKB} KB)`);
}

/**
 * JSON 파일에서 백업 데이터 로드
 * @param {string} inputPath - 백업 파일 경로
 * @returns {Object} 백업 데이터
 */
export function loadBackupFromFile(inputPath) {
  const content = fs.readFileSync(inputPath, 'utf8');
  return JSON.parse(content);
}

/**
 * 쿠키 상태 검증 (Playwright 세션에서 호출)
 * @param {Array} cookies - context.cookies()에서 반환된 쿠키 배열
 * @param {Array} requiredCookies - 필수 쿠키 이름 목록
 * @returns {Object} 검증 결과
 */
export function validateCookies(cookies, requiredCookies = ['NNB', 'NAC']) {
  const cookieMap = new Map(cookies.map(c => [c.name, c]));
  const result = {
    valid: true,
    missing: [],
    expired: [],
    present: []
  };

  const now = Date.now() / 1000;

  for (const name of requiredCookies) {
    const cookie = cookieMap.get(name);

    if (!cookie) {
      result.missing.push(name);
      result.valid = false;
    } else if (cookie.expires > 0 && cookie.expires < now) {
      result.expired.push(name);
      result.valid = false;
    } else {
      result.present.push(name);
    }
  }

  return result;
}

/**
 * 프로필의 쿠키 통계 조회 (SQLite 직접 읽기)
 * @param {string} profileDir - Chrome 프로필 디렉토리 경로
 * @returns {Promise<Object>} 쿠키 통계
 */
export async function getCookieStats(profileDir) {
  const dbPath = path.join(profileDir, 'Default', 'Cookies');

  if (!fs.existsSync(dbPath)) {
    return { exists: false };
  }

  // dynamic import for better-sqlite3 or use sqlite3
  try {
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(dbPath, { readonly: true });

    const stats = {
      exists: true,
      total: db.prepare('SELECT COUNT(*) as count FROM cookies').get().count,
      byDomain: {}
    };

    const domains = db.prepare(`
      SELECT host_key, COUNT(*) as count
      FROM cookies
      GROUP BY host_key
      ORDER BY count DESC
      LIMIT 10
    `).all();

    for (const row of domains) {
      stats.byDomain[row.host_key] = row.count;
    }

    db.close();
    return stats;
  } catch (error) {
    // Fallback: just check file exists and size
    const stat = fs.statSync(dbPath);
    return {
      exists: true,
      fileSize: stat.size,
      error: error.message
    };
  }
}

export default {
  backupCookies,
  restoreCookies,
  saveBackupToFile,
  loadBackupFromFile,
  validateCookies,
  getCookieStats
};
