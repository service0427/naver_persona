/**
 * Profile Backup/Restore Utility
 *
 * 쿠키 + Local Storage + Session Storage + Preferences를 통째로 base64 백업
 * DB에 저장하고 복원하는 시스템
 *
 * 백업 대상:
 * - Default/Cookies (SQLite - 암호화됨)
 * - Default/Cookies-journal
 * - Local State (암호화 키 메타데이터)
 * - Default/Preferences (브라우저 설정 - JSON)
 * - Default/Local Storage/leveldb/ (LevelDB 폴더)
 * - Default/Session Storage/ (LevelDB 폴더)
 */

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import zlib from 'zlib';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// 백업 대상 정의
const BACKUP_TARGETS = [
  // 필수 파일 (쿠키)
  { path: 'Default/Cookies', type: 'file', required: true },
  { path: 'Default/Cookies-journal', type: 'file', required: false },
  { path: 'Local State', type: 'file', required: true },
  // 설정 파일
  { path: 'Default/Preferences', type: 'file', required: false },
  // 스토리지 폴더
  { path: 'Default/Local Storage/leveldb', type: 'directory', required: false },
  { path: 'Default/Session Storage', type: 'directory', required: false },
];

/**
 * 디렉토리 전체를 백업
 */
async function backupDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return null;
  }

  const files = {};

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile()) {
        const filePath = path.join(dirPath, entry.name);
        try {
          const content = fs.readFileSync(filePath);
          const compressed = await gzip(content);
          files[entry.name] = {
            size: content.length,
            data: compressed.toString('base64')
          };
        } catch (e) {
          // 개별 파일 실패는 무시
        }
      }
    }
  } catch (e) {
    return null;
  }

  return Object.keys(files).length > 0 ? files : null;
}

/**
 * 디렉토리 복원
 */
async function restoreDirectory(dirPath, files) {
  if (!files || Object.keys(files).length === 0) {
    return false;
  }

  try {
    fs.mkdirSync(dirPath, { recursive: true });

    let restored = 0;
    for (const [name, fileData] of Object.entries(files)) {
      try {
        const compressed = Buffer.from(fileData.data, 'base64');
        const content = await gunzip(compressed);
        fs.writeFileSync(path.join(dirPath, name), content);
        restored++;
      } catch (e) {
        // 개별 파일 실패는 무시
      }
    }

    return restored > 0;
  } catch (e) {
    return false;
  }
}

/**
 * 프로필 전체 백업
 * @param {string} profileDir - Chrome 프로필 디렉토리
 * @returns {Object} 백업 데이터 (DB 저장용)
 */
export async function backupProfile(profileDir) {
  const backup = {
    version: 2,
    timestamp: Date.now(),
    files: {},
    directories: {}
  };

  for (const target of BACKUP_TARGETS) {
    const fullPath = path.join(profileDir, target.path);

    if (target.type === 'file') {
      if (fs.existsSync(fullPath)) {
        try {
          const content = fs.readFileSync(fullPath);
          const compressed = await gzip(content);
          backup.files[target.path] = {
            size: content.length,
            compressedSize: compressed.length,
            data: compressed.toString('base64')
          };
        } catch (e) {
          // 실패 무시
        }
      }
    } else if (target.type === 'directory') {
      const dirBackup = await backupDirectory(fullPath);
      if (dirBackup) {
        backup.directories[target.path] = dirBackup;
      }
    }
  }

  // 백업 통계
  backup.stats = {
    fileCount: Object.keys(backup.files).length,
    directoryCount: Object.keys(backup.directories).length,
    totalSize: Object.values(backup.files).reduce((s, f) => s + (f.size || 0), 0) +
               Object.values(backup.directories).reduce((s, d) =>
                 s + Object.values(d).reduce((ss, f) => ss + (f.size || 0), 0), 0)
  };

  return backup;
}

/**
 * 프로필 복원
 * @param {string} profileDir - Chrome 프로필 디렉토리
 * @param {Object} backup - backupProfile()에서 반환된 백업 데이터
 * @returns {Object} 복원 결과
 */
export async function restoreProfile(profileDir, backup) {
  const result = {
    success: false,
    filesRestored: 0,
    directoriesRestored: 0,
    errors: []
  };

  if (!backup || backup.version < 2) {
    result.errors.push('호환되지 않는 백업 버전');
    return result;
  }

  // Default 폴더 생성
  const defaultDir = path.join(profileDir, 'Default');
  fs.mkdirSync(defaultDir, { recursive: true });

  // 파일 복원
  for (const [relPath, fileData] of Object.entries(backup.files || {})) {
    const fullPath = path.join(profileDir, relPath);
    const dirPath = path.dirname(fullPath);

    try {
      fs.mkdirSync(dirPath, { recursive: true });
      const compressed = Buffer.from(fileData.data, 'base64');
      const content = await gunzip(compressed);
      fs.writeFileSync(fullPath, content);
      result.filesRestored++;
    } catch (e) {
      result.errors.push(`${relPath}: ${e.message}`);
    }
  }

  // 디렉토리 복원
  for (const [relPath, files] of Object.entries(backup.directories || {})) {
    const fullPath = path.join(profileDir, relPath);
    const success = await restoreDirectory(fullPath, files);
    if (success) {
      result.directoriesRestored++;
    } else {
      result.errors.push(`${relPath}/: 복원 실패`);
    }
  }

  result.success = result.filesRestored > 0 || result.directoriesRestored > 0;
  return result;
}

/**
 * 백업 데이터 요약 (로그용)
 */
export function getBackupSummary(backup) {
  if (!backup) return '백업 없음';

  const files = Object.keys(backup.files || {});
  const dirs = Object.keys(backup.directories || {});
  const stats = backup.stats || {};

  return `파일 ${files.length}개, 폴더 ${dirs.length}개 (${(stats.totalSize / 1024).toFixed(1)}KB)`;
}

/**
 * 백업 유효성 검사
 */
export function isValidBackup(backup) {
  if (!backup || backup.version < 2) return false;

  // 최소한 쿠키 파일이 있어야 함
  const hasCookies = backup.files?.['Default/Cookies'];
  const hasLocalState = backup.files?.['Local State'];

  return !!(hasCookies && hasLocalState);
}

export default {
  backupProfile,
  restoreProfile,
  getBackupSummary,
  isValidBackup,
  BACKUP_TARGETS
};
