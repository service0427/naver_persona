/**
 * ChromeVersions - 크롬 버전 관리
 *
 * /home/tech/chrome-versions/ 폴더에서 사용 가능한 크롬 빌드 자동 탐지
 * 각 버전별로 독립적인 프로필 폴더 사용
 *
 * 폴더 구조:
 *   chrome-versions/
 *   ├── chrome-137-0-7151-103/
 *   ├── chrome-142-0-7444-134/
 *   └── chrome-143-0-7499-169/
 *
 * 프로필 구조:
 *   data/personas/{persona-id}/chrome-{version}/Default/
 */

import fs from 'fs';
import path from 'path';

const CHROME_VERSIONS_DIR = path.resolve('/home/tech/chrome-versions');

class ChromeVersions {
  /**
   * 사용 가능한 모든 Chrome 버전 목록
   * @returns {Array<{version: string, fullName: string, executablePath: string, majorVersion: number}>}
   */
  static list() {
    if (!fs.existsSync(CHROME_VERSIONS_DIR)) {
      console.warn(`[ChromeVersions] 폴더 없음: ${CHROME_VERSIONS_DIR}`);
      return [];
    }

    const dirs = fs.readdirSync(CHROME_VERSIONS_DIR)
      .filter(d => d.startsWith('chrome-'))
      .filter(d => {
        const fullPath = path.join(CHROME_VERSIONS_DIR, d);
        return fs.statSync(fullPath).isDirectory();
      });

    return dirs.map(dir => {
      // chrome-143-0-7499-169 → 143.0.7499.169
      const versionMatch = dir.match(/chrome-(\d+)-(\d+)-(\d+)-(\d+)/);
      if (!versionMatch) return null;

      const [, major, minor, build, patch] = versionMatch;
      const version = `${major}.${minor}.${build}.${patch}`;
      const majorVersion = parseInt(major, 10);

      // 실행 파일 경로 찾기 (다양한 설치 구조 대응)
      const possiblePaths = [
        path.join(CHROME_VERSIONS_DIR, dir, 'opt', 'google', 'chrome', 'chrome'),  // deb 패키지 추출
        path.join(CHROME_VERSIONS_DIR, dir, 'chrome-linux64', 'chrome'),           // 공식 빌드
        path.join(CHROME_VERSIONS_DIR, dir, 'chrome-linux', 'chrome'),
        path.join(CHROME_VERSIONS_DIR, dir, 'chrome'),
      ];

      let executablePath = null;
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          executablePath = p;
          break;
        }
      }

      return {
        version,
        fullName: dir,
        majorVersion,
        executablePath,
        dir: path.join(CHROME_VERSIONS_DIR, dir)
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.majorVersion - a.majorVersion);  // 최신 버전 먼저
  }

  /**
   * 특정 버전 가져오기
   * @param {string} versionQuery - "143", "143.0.7499.169", "chrome-143-0-7499-169" 등
   */
  static get(versionQuery) {
    const versions = this.list();

    if (!versionQuery) {
      // 기본: 최신 버전
      return versions[0] || null;
    }

    // 정확한 full name 매칭
    let found = versions.find(v => v.fullName === versionQuery);
    if (found) return found;

    // 버전 문자열 매칭 (143.0.7499.169)
    found = versions.find(v => v.version === versionQuery);
    if (found) return found;

    // major 버전만 매칭 (143) - 해당 major의 최신 빌드
    const majorQuery = parseInt(versionQuery, 10);
    if (!isNaN(majorQuery)) {
      const majorVersions = versions.filter(v => v.majorVersion === majorQuery);
      if (majorVersions.length > 0) {
        // 같은 major 중 최신 빌드 반환
        return majorVersions[0];
      }
    }

    return null;
  }

  /**
   * 최신 버전 가져오기
   */
  static getLatest() {
    const versions = this.list();
    return versions[0] || null;
  }

  /**
   * 특정 major 버전의 최신 빌드
   */
  static getLatestMajor(major) {
    return this.get(String(major));
  }

  /**
   * 랜덤 버전 선택 (최근 N개 중)
   * @param {number} recentCount - 최근 몇 개 버전 중 선택할지 (기본: 5)
   */
  static getRandom(recentCount = 5) {
    const versions = this.list().slice(0, recentCount);
    if (versions.length === 0) return null;

    const idx = Math.floor(Math.random() * versions.length);
    return versions[idx];
  }

  /**
   * major 버전별로 최신 하나씩만 선택 (다양한 버전 사용)
   * @param {number} count - 필요한 버전 수 (기본: 5)
   * @returns {Array} major 버전별 최신 빌드 목록
   */
  static listUniqueMajors(count = 5) {
    const allVersions = this.list();
    const seen = new Set();
    const result = [];

    for (const v of allVersions) {
      if (!seen.has(v.majorVersion)) {
        seen.add(v.majorVersion);
        result.push(v);
        if (result.length >= count) break;
      }
    }

    return result;
  }

  /**
   * 사용 가능한 버전 출력
   */
  static print() {
    const versions = this.list();
    console.log(`\n[ChromeVersions] ${CHROME_VERSIONS_DIR}`);
    console.log(`총 ${versions.length}개 버전:\n`);

    versions.forEach(v => {
      const status = v.executablePath ? '✅' : '❌';
      console.log(`  ${status} ${v.fullName} (${v.version})`);
      if (v.executablePath) {
        console.log(`     → ${v.executablePath}`);
      }
    });
  }
}

export default ChromeVersions;
export { CHROME_VERSIONS_DIR };
