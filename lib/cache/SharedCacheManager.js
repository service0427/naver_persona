/**
 * SharedCacheManager - 공유 캐시 관리
 *
 * 여러 페르소나가 하나의 캐시 폴더를 공유하여 디스크 공간 절약
 * 심볼릭 링크를 사용하여 각 페르소나의 캐시를 공유 폴더로 연결
 *
 * 공유되는 캐시:
 *   - Cache (일반 캐시)
 *   - Code Cache (JS 컴파일 캐시)
 *   - GPUCache (GPU 렌더링 캐시)
 *   - Service Worker
 *   - Shared Dictionary Cache
 *
 * 공유되지 않는 데이터 (개별 유지):
 *   - Cookies
 *   - History
 *   - Preferences
 *   - Local Storage
 *   - Session Storage
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

const SHARED_CACHE_DIR = path.resolve('./data/shared-cache');

// 심볼릭 링크로 공유할 캐시 타입
const CACHE_TYPES = [
  'Cache',
  'Code Cache',
  'GPUCache',
  'Service Worker',
  'Shared Dictionary Cache',
  'ShaderCache'
];

class SharedCacheManager {
  constructor() {
    this.sharedCachePath = SHARED_CACHE_DIR;
    this.initialized = false;
  }

  /**
   * 공유 캐시 디렉토리 초기화
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.sharedCachePath, { recursive: true });

      // 각 캐시 타입별 디렉토리 생성
      for (const cacheType of CACHE_TYPES) {
        const cachePath = path.join(this.sharedCachePath, cacheType);
        await fs.mkdir(cachePath, { recursive: true });
      }

      this.initialized = true;
      console.log(`[SharedCache] 초기화 완료: ${this.sharedCachePath}`);
    } catch (error) {
      console.error('[SharedCache] 초기화 실패:', error.message);
      throw error;
    }
  }

  /**
   * 페르소나 프로필 폴더에 공유 캐시 설정
   * @param {string} profileDir - 페르소나의 Chrome 프로필 경로
   * @param {boolean} forceConvert - 기존 캐시를 강제로 심볼릭 링크로 전환
   * @returns {Object} 설정 결과
   */
  async setupForProfile(profileDir, forceConvert = false) {
    await this.initialize();

    const defaultPath = path.join(profileDir, 'Default');
    const result = {
      profileDir,
      linked: [],
      skipped: [],
      converted: [],
      errors: []
    };

    // Default 디렉토리 확인/생성
    await fs.mkdir(defaultPath, { recursive: true });

    for (const cacheType of CACHE_TYPES) {
      const targetPath = path.join(defaultPath, cacheType);
      const sharedPath = path.join(this.sharedCachePath, cacheType);

      try {
        const stats = await fs.lstat(targetPath).catch(() => null);

        if (stats && stats.isSymbolicLink()) {
          // 이미 심볼릭 링크 - 대상 확인
          const linkTarget = await fs.readlink(targetPath);
          if (linkTarget === sharedPath) {
            result.skipped.push(cacheType);
          } else {
            // 다른 곳을 가리키는 경우 재설정
            await fs.unlink(targetPath);
            await fs.symlink(sharedPath, targetPath, 'dir');
            result.linked.push(cacheType);
          }
        } else if (stats && stats.isDirectory()) {
          // 실제 디렉토리가 존재
          if (forceConvert) {
            await this.convertToSymlink(targetPath, cacheType);
            result.converted.push(cacheType);
          } else {
            // 2회차 이상: 자동 전환
            await this.convertToSymlink(targetPath, cacheType);
            result.converted.push(cacheType);
          }
        } else {
          // 캐시가 없음 - 심볼릭 링크 생성
          await fs.symlink(sharedPath, targetPath, 'dir');
          result.linked.push(cacheType);
        }
      } catch (error) {
        result.errors.push({ cacheType, error: error.message });
      }
    }

    return result;
  }

  /**
   * 기존 캐시 디렉토리를 심볼릭 링크로 전환
   */
  async convertToSymlink(targetPath, cacheType) {
    const sharedPath = path.join(this.sharedCachePath, cacheType);
    const tempPath = `${targetPath}_temp_${Date.now()}`;

    try {
      // 1. 기존 캐시를 임시 위치로 이동
      await fs.rename(targetPath, tempPath);

      // 2. 심볼릭 링크 생성
      await fs.symlink(sharedPath, targetPath, 'dir');

      // 3. 임시 캐시 삭제 (공유 캐시에 이미 데이터가 있으므로)
      await this.removeDirectory(tempPath);

    } catch (error) {
      // 실패 시 원상 복구 시도
      try {
        const exists = await fs.access(tempPath).then(() => true).catch(() => false);
        if (exists) {
          await fs.rename(tempPath, targetPath);
        }
      } catch (e) {
        // 복구 실패 무시
      }
      throw error;
    }
  }

  /**
   * 디렉토리 삭제 (재귀)
   */
  async removeDirectory(dirPath) {
    await fs.rm(dirPath, { recursive: true, force: true });
  }

  /**
   * 공유 캐시 상태 확인
   */
  async getStatus() {
    const status = {
      path: this.sharedCachePath,
      exists: false,
      cacheTypes: {},
      totalSize: '0K'
    };

    try {
      await fs.access(this.sharedCachePath);
      status.exists = true;

      for (const cacheType of CACHE_TYPES) {
        const cachePath = path.join(this.sharedCachePath, cacheType);
        try {
          const stats = await fs.stat(cachePath);
          status.cacheTypes[cacheType] = {
            exists: true,
            isDirectory: stats.isDirectory()
          };
        } catch {
          status.cacheTypes[cacheType] = { exists: false };
        }
      }

      // 전체 크기 확인
      try {
        const { execSync } = await import('child_process');
        const sizeOutput = execSync(`du -sh "${this.sharedCachePath}" 2>/dev/null | cut -f1`, { encoding: 'utf8' });
        status.totalSize = sizeOutput.trim();
      } catch (e) {
        status.totalSize = 'unknown';
      }

    } catch {
      status.exists = false;
    }

    return status;
  }

  /**
   * 페르소나 프로필의 캐시 링크 상태 확인
   */
  async checkProfileCache(profileDir) {
    const defaultPath = path.join(profileDir, 'Default');
    const result = {
      profileDir,
      cacheTypes: {}
    };

    for (const cacheType of CACHE_TYPES) {
      const targetPath = path.join(defaultPath, cacheType);

      try {
        const stats = await fs.lstat(targetPath);

        if (stats.isSymbolicLink()) {
          const linkTarget = await fs.readlink(targetPath);
          const isShared = linkTarget.includes('shared-cache');
          result.cacheTypes[cacheType] = {
            type: 'symlink',
            target: linkTarget,
            isShared
          };
        } else if (stats.isDirectory()) {
          result.cacheTypes[cacheType] = {
            type: 'directory',
            isShared: false
          };
        }
      } catch {
        result.cacheTypes[cacheType] = {
          type: 'none',
          isShared: false
        };
      }
    }

    return result;
  }

  /**
   * 공유 캐시 정리 (오래된 파일 삭제)
   * @param {number} maxAgeInDays - 삭제할 파일의 최소 경과일
   */
  async cleanup(maxAgeInDays = 3) {
    try {
      const { execSync } = await import('child_process');

      for (const cacheType of ['Cache', 'Code Cache', 'GPUCache']) {
        const cachePath = path.join(this.sharedCachePath, cacheType);
        try {
          execSync(`find "${cachePath}" -type f -atime +${maxAgeInDays} -delete 2>/dev/null || true`);
        } catch (e) {
          // 무시
        }
      }

      console.log(`[SharedCache] ${maxAgeInDays}일 이상 미사용 캐시 정리 완료`);
    } catch (error) {
      console.error('[SharedCache] 정리 실패:', error.message);
    }
  }
}

// 싱글톤 인스턴스
const sharedCacheManager = new SharedCacheManager();

export default sharedCacheManager;
export { SharedCacheManager, SHARED_CACHE_DIR, CACHE_TYPES };
