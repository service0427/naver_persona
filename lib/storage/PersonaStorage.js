/**
 * PersonaStorage - 파일 기반 페르소나 데이터 저장소
 *
 * 수천만 규모 대응:
 * - DB에는 메타데이터만 (경량)
 * - 대용량 데이터(쿠키, 핑거프린트)는 파일시스템
 * - 해시 기반 2단계 디렉토리 샤딩
 *
 * 디렉토리 구조:
 * /data/personas/{hash[0:2]}/{hash[2:4]}/{persona_id}/
 *   ├── fingerprint.json   # 핑거프린트
 *   ├── cookies.tar.gz     # 쿠키 파일 백업
 *   ├── state.json         # 상태 (checkpoint, vpnIp 등)
 *   └── history.json       # 히스토리 (선택)
 */

import fs from 'fs/promises';
import { existsSync, createReadStream, createWriteStream } from 'fs';
import path from 'path';
import { createGzip, createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { pack, extract } from 'tar-fs';

const DEFAULT_BASE_DIR = '/data/personas';

class PersonaStorage {
  constructor(options = {}) {
    this.baseDir = options.baseDir || DEFAULT_BASE_DIR;
    this.logger = options.logger || console.log;
  }

  /**
   * 페르소나 ID로 저장 경로 생성
   * abcd1234-xxxx → /data/personas/ab/cd/abcd1234-xxxx/
   */
  getPath(personaId) {
    const hash = personaId.replace(/-/g, '').substring(0, 8);
    return path.join(
      this.baseDir,
      hash.slice(0, 2),
      hash.slice(2, 4),
      personaId
    );
  }

  /**
   * DB용 상대 경로 반환
   * → ab/cd/abcd1234-xxxx
   */
  getRelativePath(personaId) {
    const hash = personaId.replace(/-/g, '').substring(0, 8);
    return path.join(hash.slice(0, 2), hash.slice(2, 4), personaId);
  }

  /**
   * 디렉토리 존재 확인
   */
  async exists(personaId) {
    const dir = this.getPath(personaId);
    return existsSync(dir);
  }

  /**
   * 핑거프린트 저장
   */
  async saveFingerprint(personaId, fingerprint) {
    const dir = this.getPath(personaId);
    await fs.mkdir(dir, { recursive: true });

    const filePath = path.join(dir, 'fingerprint.json');
    await fs.writeFile(filePath, JSON.stringify(fingerprint, null, 2));

    this.logger(`[Storage] 핑거프린트 저장: ${personaId}`);
  }

  /**
   * 핑거프린트 로드
   */
  async loadFingerprint(personaId) {
    const filePath = path.join(this.getPath(personaId), 'fingerprint.json');

    if (!existsSync(filePath)) return null;

    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  }

  /**
   * 쿠키 파일 백업 (프로필 디렉토리 → tar.gz)
   *
   * @param {string} personaId
   * @param {string} profileDir - Chrome 프로필 디렉토리
   */
  async saveCookies(personaId, profileDir) {
    const dir = this.getPath(personaId);
    await fs.mkdir(dir, { recursive: true });

    const defaultDir = path.join(profileDir, 'Default');
    const tarPath = path.join(dir, 'cookies.tar.gz');

    // 백업할 파일들
    const filesToBackup = ['Cookies', 'Cookies-journal', 'Local State'];
    const tempDir = path.join(dir, '.temp-cookies');

    try {
      // 임시 디렉토리에 파일 복사
      await fs.mkdir(tempDir, { recursive: true });

      for (const file of filesToBackup) {
        const src = file === 'Local State'
          ? path.join(profileDir, file)
          : path.join(defaultDir, file);

        if (existsSync(src)) {
          await fs.copyFile(src, path.join(tempDir, file));
        }
      }

      // tar.gz 생성
      await pipeline(
        pack(tempDir),
        createGzip(),
        createWriteStream(tarPath)
      );

      // 임시 디렉토리 삭제
      await fs.rm(tempDir, { recursive: true, force: true });

      const stat = await fs.stat(tarPath);
      this.logger(`[Storage] 쿠키 백업: ${personaId} (${(stat.size / 1024).toFixed(1)}KB)`);

      return true;
    } catch (error) {
      // 정리
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      this.logger(`[Storage] 쿠키 백업 실패: ${error.message}`);
      return false;
    }
  }

  /**
   * 쿠키 파일 복원 (tar.gz → 프로필 디렉토리)
   *
   * @param {string} personaId
   * @param {string} profileDir - Chrome 프로필 디렉토리
   */
  async restoreCookies(personaId, profileDir) {
    const tarPath = path.join(this.getPath(personaId), 'cookies.tar.gz');

    if (!existsSync(tarPath)) {
      this.logger(`[Storage] 쿠키 백업 없음: ${personaId}`);
      return false;
    }

    const defaultDir = path.join(profileDir, 'Default');
    const tempDir = path.join(this.getPath(personaId), '.temp-restore');

    try {
      // tar.gz 압축 해제
      await fs.mkdir(tempDir, { recursive: true });

      await pipeline(
        createReadStream(tarPath),
        createGunzip(),
        extract(tempDir)
      );

      // 프로필 디렉토리 생성
      await fs.mkdir(defaultDir, { recursive: true });

      // 파일 복원
      const files = await fs.readdir(tempDir);
      for (const file of files) {
        const src = path.join(tempDir, file);
        const dest = file === 'Local State'
          ? path.join(profileDir, file)
          : path.join(defaultDir, file);

        await fs.copyFile(src, dest);
      }

      // 임시 디렉토리 삭제
      await fs.rm(tempDir, { recursive: true, force: true });

      this.logger(`[Storage] 쿠키 복원: ${personaId}`);
      return true;
    } catch (error) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      this.logger(`[Storage] 쿠키 복원 실패: ${error.message}`);
      return false;
    }
  }

  /**
   * 상태 저장 (checkpoint, vpnIp, 마지막 세션 정보)
   */
  async saveState(personaId, state) {
    const dir = this.getPath(personaId);
    await fs.mkdir(dir, { recursive: true });

    const filePath = path.join(dir, 'state.json');
    const data = {
      ...state,
      updatedAt: new Date().toISOString()
    };

    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  /**
   * 상태 로드
   */
  async loadState(personaId) {
    const filePath = path.join(this.getPath(personaId), 'state.json');

    if (!existsSync(filePath)) return null;

    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  }

  /**
   * 히스토리 추가
   */
  async appendHistory(personaId, entry) {
    const dir = this.getPath(personaId);
    await fs.mkdir(dir, { recursive: true });

    const filePath = path.join(dir, 'history.json');

    let history = [];
    if (existsSync(filePath)) {
      const content = await fs.readFile(filePath, 'utf8');
      history = JSON.parse(content);
    }

    history.push({
      ...entry,
      timestamp: new Date().toISOString()
    });

    // 최대 100개 유지
    if (history.length > 100) {
      history = history.slice(-100);
    }

    await fs.writeFile(filePath, JSON.stringify(history, null, 2));
  }

  /**
   * 히스토리 로드
   */
  async loadHistory(personaId) {
    const filePath = path.join(this.getPath(personaId), 'history.json');

    if (!existsSync(filePath)) return [];

    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  }

  /**
   * 전체 데이터 저장 (한 번에)
   */
  async save(personaId, data) {
    const { fingerprint, profileDir, state, history } = data;

    if (fingerprint) {
      await this.saveFingerprint(personaId, fingerprint);
    }

    if (profileDir) {
      await this.saveCookies(personaId, profileDir);
    }

    if (state) {
      await this.saveState(personaId, state);
    }

    if (history) {
      for (const entry of history) {
        await this.appendHistory(personaId, entry);
      }
    }
  }

  /**
   * 전체 데이터 로드
   */
  async load(personaId) {
    if (!await this.exists(personaId)) {
      return null;
    }

    return {
      fingerprint: await this.loadFingerprint(personaId),
      state: await this.loadState(personaId),
      history: await this.loadHistory(personaId),
      cookiesPath: path.join(this.getPath(personaId), 'cookies.tar.gz')
    };
  }

  /**
   * 페르소나 데이터 삭제
   */
  async delete(personaId) {
    const dir = this.getPath(personaId);

    if (existsSync(dir)) {
      await fs.rm(dir, { recursive: true, force: true });
      this.logger(`[Storage] 삭제: ${personaId}`);
      return true;
    }

    return false;
  }

  /**
   * 저장소 통계
   */
  async getStats() {
    const stats = {
      totalPersonas: 0,
      totalSize: 0,
      shards: {}
    };

    try {
      // 1단계 디렉토리 순회
      const level1 = await fs.readdir(this.baseDir);

      for (const d1 of level1) {
        if (d1.length !== 2) continue;

        const path1 = path.join(this.baseDir, d1);
        const stat1 = await fs.stat(path1);
        if (!stat1.isDirectory()) continue;

        // 2단계 디렉토리 순회
        const level2 = await fs.readdir(path1);

        for (const d2 of level2) {
          if (d2.length !== 2) continue;

          const path2 = path.join(path1, d2);
          const stat2 = await fs.stat(path2);
          if (!stat2.isDirectory()) continue;

          // 페르소나 디렉토리 카운트
          const personas = await fs.readdir(path2);
          stats.totalPersonas += personas.length;

          const shardKey = `${d1}/${d2}`;
          stats.shards[shardKey] = personas.length;
        }
      }
    } catch (error) {
      // baseDir가 없으면 빈 통계
    }

    return stats;
  }
}

export default PersonaStorage;
export { PersonaStorage, DEFAULT_BASE_DIR };
