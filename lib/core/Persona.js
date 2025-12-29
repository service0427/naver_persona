/**
 * Persona - 개별 페르소나 관리
 *
 * 각 페르소나는:
 * - 고유 ID
 * - 기반 디바이스 프로필 (galaxy-s23, pc-chrome 등)
 * - 변형된 핑거프린트 (동일 프로필이라도 미세하게 다름)
 * - Chrome 버전별 개별 프로필 폴더 (버전 호환성 문제 방지)
 *
 * 폴더 구조:
 *   data/personas/{persona-id}/
 *   ├── persona.json                           # 메타데이터
 *   ├── chrome-142-0-7444-134/Default/         # Chrome 142 프로필
 *   └── chrome-143-0-7499-169/Default/         # Chrome 143 프로필
 *
 * 사용법:
 *   const persona = await Persona.create({ name: 'user-1', baseProfile: 'galaxy-s23' });
 *   const persona = await Persona.load('persona-abc123');
 *   const profileDir = persona.getProfileDir('chrome-143-0-7499-169');  // 버전별 프로필 경로
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getProfile, DEVICE_PROFILES } from '../devices/profiles.js';

const PERSONAS_DIR = path.resolve('./data/personas');

class Persona {
  constructor(data) {
    this.id = data.id;
    this.name = data.name || data.id;
    this.baseProfile = data.baseProfile;  // galaxy-s23, pc-chrome 등
    this.fingerprint = data.fingerprint;  // 변형된 핑거프린트
    this.createdAt = data.createdAt || new Date().toISOString();
    this.lastUsedAt = data.lastUsedAt || null;
    this.stats = data.stats || { visitCount: 0, searchCount: 0 };
  }

  /**
   * 새 페르소나 생성
   */
  static async create(options = {}) {
    const {
      name = null,
      baseProfile = 'galaxy-s23'
    } = options;

    // 고유 ID 생성
    const id = `persona-${crypto.randomBytes(6).toString('hex')}`;

    // 기반 프로필 가져오기
    const base = getProfile(baseProfile);
    if (!base) {
      throw new Error(`Unknown base profile: ${baseProfile}`);
    }

    // 핑거프린트 변형 생성
    const fingerprint = Persona.generateVariedFingerprint(base);

    const persona = new Persona({
      id,
      name: name || id,
      baseProfile,
      fingerprint,
      createdAt: new Date().toISOString()
    });

    // 메타데이터 저장 (프로필 폴더는 브라우저 실행 시 생성됨)
    await persona.save();

    console.log(`[Persona] 생성: ${persona.id} (${baseProfile})`);
    return persona;
  }

  /**
   * 임시 페르소나 (저장 안 함, 핑거프린트만 생성)
   * 프로필은 외부에서 관리, 핑거프린트만 매번 새로 생성
   */
  static async createEphemeral(baseProfile = 'galaxy-s23') {
    const base = getProfile(baseProfile);
    if (!base) {
      throw new Error(`Unknown base profile: ${baseProfile}`);
    }

    const fingerprint = Persona.generateVariedFingerprint(base);
    const id = `ephemeral-${crypto.randomBytes(4).toString('hex')}`;

    const persona = new Persona({
      id,
      name: id,
      baseProfile,
      fingerprint,
      createdAt: new Date().toISOString()
    });

    persona._ephemeral = true;  // 파일 저장 안 함 플래그
    return persona;
  }

  /**
   * 스레드 기반 페르소나 (재활용 구조)
   *
   * 폴더 구조:
   *   data/personas/thread-{threadId}/b{browserIndex}/
   *   ├── persona.json
   *   └── chrome-{version}/Default/
   *
   * @param {number} threadId - 스레드 ID (VPN 인덱스)
   * @param {number} browserIndex - 브라우저 인덱스 (Chrome 버전 인덱스)
   * @param {string} baseProfile - 기반 프로필
   */
  static async forThread(threadId, browserIndex, baseProfile = 'galaxy-s23') {
    const id = `thread-${threadId}-b${browserIndex}`;
    const personaDir = path.join(PERSONAS_DIR, `thread-${threadId}`, `b${browserIndex}`);
    const metaPath = path.join(personaDir, 'persona.json');

    // 기존 페르소나 로드 시도
    if (fs.existsSync(metaPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        const persona = new Persona(data);
        persona._threadDir = personaDir;  // 스레드 기반 경로 저장
        return persona;
      } catch (e) {
        // 파일 손상 시 새로 생성
      }
    }

    // 새 페르소나 생성
    const base = getProfile(baseProfile);
    if (!base) {
      throw new Error(`Unknown base profile: ${baseProfile}`);
    }

    const fingerprint = Persona.generateVariedFingerprint(base);

    const persona = new Persona({
      id,
      name: id,
      baseProfile,
      fingerprint,
      createdAt: new Date().toISOString()
    });

    persona._threadDir = personaDir;

    // 메타데이터 저장
    fs.mkdirSync(personaDir, { recursive: true });
    fs.writeFileSync(metaPath, JSON.stringify({
      id: persona.id,
      name: persona.name,
      baseProfile: persona.baseProfile,
      fingerprint: persona.fingerprint,
      createdAt: persona.createdAt,
      lastUsedAt: persona.lastUsedAt,
      stats: persona.stats
    }, null, 2));

    console.log(`[Persona] 스레드 생성: ${id} (${baseProfile})`);
    return persona;
  }

  /**
   * 기존 페르소나 로드
   */
  static async load(personaId) {
    const metaPath = path.join(PERSONAS_DIR, personaId, 'persona.json');

    if (!fs.existsSync(metaPath)) {
      throw new Error(`Persona not found: ${personaId}`);
    }

    const data = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    console.log(`[Persona] 로드: ${data.id} (${data.baseProfile})`);
    return new Persona(data);
  }

  /**
   * 모든 페르소나 목록
   */
  static list() {
    if (!fs.existsSync(PERSONAS_DIR)) {
      return [];
    }

    const personas = [];
    const dirs = fs.readdirSync(PERSONAS_DIR);

    for (const dir of dirs) {
      const metaPath = path.join(PERSONAS_DIR, dir, 'persona.json');
      if (fs.existsSync(metaPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          personas.push(data);
        } catch (e) {}
      }
    }

    return personas;
  }

  /**
   * 핑거프린트 변형 생성
   * 같은 디바이스 프로필이라도 미세하게 다른 값
   */
  static generateVariedFingerprint(baseProfile) {
    const nav = { ...baseProfile.navigator };
    const screen = { ...baseProfile.screen };
    const webgl = { ...baseProfile.webgl };

    // 변형 적용
    // 1. hardwareConcurrency: ±2 범위
    if (nav.hardwareConcurrency) {
      const variation = Math.floor(Math.random() * 3) - 1;  // -1, 0, 1
      nav.hardwareConcurrency = Math.max(2, nav.hardwareConcurrency + variation * 2);
    }

    // 2. deviceMemory: 가능한 값 중 랜덤
    if (nav.deviceMemory) {
      const memoryOptions = [4, 8, 16];
      if (baseProfile.type === 'mobile') {
        nav.deviceMemory = memoryOptions[Math.floor(Math.random() * 2)];  // 4 or 8
      } else {
        nav.deviceMemory = memoryOptions[Math.floor(Math.random() * 3)];
      }
    }

    // 3. Screen 미세 변형 (모바일은 고정, PC는 약간 변형)
    if (baseProfile.type === 'desktop') {
      const widthOptions = [1920, 1680, 1536, 2560];
      const heightOptions = [1080, 1050, 864, 1440];
      const idx = Math.floor(Math.random() * widthOptions.length);
      screen.width = widthOptions[idx];
      screen.height = heightOptions[idx];
      screen.availWidth = screen.width;
      screen.availHeight = screen.height - 40;
    }

    // 4. Canvas noise seed (고유값)
    const canvasNoise = Math.random() * 0.01;

    // 5. Audio noise seed
    const audioNoise = Math.random() * 0.0001;

    // 6. WebGL 렌더러 변형 (버전 숫자 등)
    // GPU 모델은 유지하되 드라이버 버전 등 미세 변경

    return {
      navigator: nav,
      screen,
      webgl,
      canvasNoise,
      audioNoise,
      timezone: baseProfile.timezoneId,
      locale: baseProfile.locale,
      // 고유 식별자
      uniqueSeed: crypto.randomBytes(16).toString('hex')
    };
  }

  /**
   * 페르소나 기본 디렉토리 (메타데이터 저장 위치)
   */
  getBaseDir() {
    return path.join(PERSONAS_DIR, this.id);
  }

  /**
   * 프로필 디렉토리 경로 (Chrome 버전별)
   * @param {string} chromeVersion - Chrome 버전 폴더명 (예: 'chrome-143-0-7499-169')
   * @returns {string} 프로필 디렉토리 경로
   *
   * 스레드 기반: /data/personas/thread-0/b0/chrome-143
   * 일반 모드:   /data/personas/persona-abc123/chrome-143
   */
  getProfileDir(chromeVersion = null) {
    // 스레드 기반 경로가 있으면 사용
    const baseDir = this._threadDir || path.join(PERSONAS_DIR, this.id);

    if (chromeVersion) {
      return path.join(baseDir, chromeVersion);
    }

    // chromeVersion 없으면 기본 경로 (하위 호환)
    return baseDir;
  }

  /**
   * 사용 가능한 Chrome 프로필 목록
   * @returns {Array<{version: string, path: string, size: string}>}
   */
  listChromeProfiles() {
    const baseDir = this.getBaseDir();
    if (!fs.existsSync(baseDir)) return [];

    const dirs = fs.readdirSync(baseDir)
      .filter(d => d.startsWith('chrome-'))
      .filter(d => fs.statSync(path.join(baseDir, d)).isDirectory());

    return dirs.map(dir => {
      const profilePath = path.join(baseDir, dir);
      let size = '0K';
      try {
        const { execSync } = require('child_process');
        size = execSync(`du -sh "${profilePath}" 2>/dev/null | cut -f1`, { encoding: 'utf8' }).trim();
      } catch (e) {}

      return {
        version: dir,
        path: profilePath,
        size
      };
    });
  }

  /**
   * 브라우저 컨텍스트 옵션 생성
   * @param {string|number} chromeVersion - Chrome 버전 (동적 UA 생성용)
   */
  toContextOptions(chromeVersion = null) {
    const base = getProfile(this.baseProfile);
    const fp = this.fingerprint;

    // Chrome 버전에 맞게 userAgent와 secChUa 동적 생성
    const major = chromeVersion ? String(chromeVersion).split('.')[0] : '142';
    const userAgent = base.userAgentTemplate
      ? base.userAgentTemplate.replace(/Chrome\/\d+\.0\.0\.0/g, `Chrome/${major}.0.0.0`)
      : base.userAgent;
    const secChUa = base.secChUaTemplate
      ? `"Chromium";v="${major}", "${base.secChUaTemplate}";v="${major}", "Not_A Brand";v="99"`
      : base.secChUa;

    return {
      userAgent,
      viewport: base.viewport,
      deviceScaleFactor: base.deviceScaleFactor,
      isMobile: base.isMobile,
      hasTouch: base.hasTouch,
      locale: fp.locale,
      timezoneId: fp.timezone,
      extraHTTPHeaders: {
        'accept-language': base.acceptLanguage,
        ...(secChUa && {
          'sec-ch-ua': secChUa,
          'sec-ch-ua-mobile': base.secChUaMobile,
          'sec-ch-ua-platform': base.secChUaPlatform
        })
      }
    };
  }

  /**
   * Fingerprint override 스크립트 생성
   */
  generateFingerprintScript() {
    const base = getProfile(this.baseProfile);
    const fp = this.fingerprint;
    const nav = fp.navigator;
    const scr = fp.screen;
    const webgl = fp.webgl;

    return `
      (function() {
        'use strict';

        // Unique seed for this persona
        const PERSONA_SEED = '${fp.uniqueSeed}';
        const CANVAS_NOISE = ${fp.canvasNoise};
        const AUDIO_NOISE = ${fp.audioNoise};

        function defineProperty(obj, prop, value) {
          try {
            Object.defineProperty(obj, prop, {
              get: () => value,
              configurable: true,
              enumerable: true
            });
          } catch(e) {
            try {
              delete obj[prop];
              Object.defineProperty(obj, prop, {
                get: () => value,
                configurable: true,
                enumerable: true
              });
            } catch(e2) {}
          }
        }

        // Navigator
        defineProperty(Navigator.prototype, 'platform', '${nav.platform}');
        defineProperty(Navigator.prototype, 'vendor', '${nav.vendor}');
        defineProperty(Navigator.prototype, 'language', '${nav.language}');
        defineProperty(Navigator.prototype, 'languages', Object.freeze(${JSON.stringify(nav.languages)}));
        defineProperty(Navigator.prototype, 'hardwareConcurrency', ${nav.hardwareConcurrency});
        ${nav.deviceMemory ? `defineProperty(Navigator.prototype, 'deviceMemory', ${nav.deviceMemory});` : ''}
        defineProperty(Navigator.prototype, 'maxTouchPoints', ${nav.maxTouchPoints});
        defineProperty(Navigator.prototype, 'webdriver', false);

        // Screen
        defineProperty(Screen.prototype, 'width', ${scr.width});
        defineProperty(Screen.prototype, 'height', ${scr.height});
        defineProperty(Screen.prototype, 'availWidth', ${scr.availWidth});
        defineProperty(Screen.prototype, 'availHeight', ${scr.availHeight});
        defineProperty(Screen.prototype, 'colorDepth', ${scr.colorDepth});

        // WebGL
        const getParameterOriginal = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          if (parameter === 37445) return '${webgl.unmaskedVendor}';
          if (parameter === 37446) return '${webgl.unmaskedRenderer}';
          return getParameterOriginal.call(this, parameter);
        };

        if (typeof WebGL2RenderingContext !== 'undefined') {
          const getParameter2Original = WebGL2RenderingContext.prototype.getParameter;
          WebGL2RenderingContext.prototype.getParameter = function(parameter) {
            if (parameter === 37445) return '${webgl.unmaskedVendor}';
            if (parameter === 37446) return '${webgl.unmaskedRenderer}';
            return getParameter2Original.call(this, parameter);
          };
        }

        // Canvas fingerprint noise
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(type) {
          const ctx = this.getContext('2d');
          if (ctx) {
            const imageData = ctx.getImageData(0, 0, this.width, this.height);
            for (let i = 0; i < imageData.data.length; i += 4) {
              imageData.data[i] += Math.floor((Math.random() - 0.5) * CANVAS_NOISE * 255);
            }
            ctx.putImageData(imageData, 0, 0);
          }
          return originalToDataURL.apply(this, arguments);
        };

        // Plugins (mobile = empty)
        ${base.isMobile ? `
        defineProperty(Navigator.prototype, 'plugins', { length: 0 });
        defineProperty(Navigator.prototype, 'mimeTypes', { length: 0 });
        ` : ''}

        // Marker
        window.__PERSONA_ID__ = '${this.id}';
        window.__FINGERPRINT_SPOOFED__ = true;
      })();
    `;
  }

  /**
   * 메타데이터 저장 (ephemeral 페르소나는 저장 안 함)
   */
  async save() {
    // ephemeral 페르소나는 파일 저장 스킵 (DB에만 저장됨)
    if (this._ephemeral) {
      return;
    }

    const personaDir = this.getBaseDir();
    fs.mkdirSync(personaDir, { recursive: true });

    const metaPath = path.join(personaDir, 'persona.json');
    const data = {
      id: this.id,
      name: this.name,
      baseProfile: this.baseProfile,
      fingerprint: this.fingerprint,
      createdAt: this.createdAt,
      lastUsedAt: this.lastUsedAt,
      stats: this.stats
    };

    fs.writeFileSync(metaPath, JSON.stringify(data, null, 2));
  }

  /**
   * 사용 기록 업데이트
   */
  async recordUsage(action = 'visit') {
    this.lastUsedAt = new Date().toISOString();

    if (action === 'visit') {
      this.stats.visitCount++;
    } else if (action === 'search') {
      this.stats.searchCount++;
    }

    await this.save();
  }

  /**
   * 요약 정보
   */
  getSummary() {
    return {
      id: this.id,
      name: this.name,
      baseProfile: this.baseProfile,
      createdAt: this.createdAt,
      lastUsedAt: this.lastUsedAt,
      stats: this.stats,
      fingerprint: {
        hardwareConcurrency: this.fingerprint.navigator.hardwareConcurrency,
        deviceMemory: this.fingerprint.navigator.deviceMemory,
        screen: `${this.fingerprint.screen.width}x${this.fingerprint.screen.height}`
      }
    };
  }
}

export default Persona;
