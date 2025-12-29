/**
 * Canvas Fingerprint 위조 모듈
 *
 * Canvas 2D/WebGL의 toDataURL, getImageData 결과에 미세한 노이즈를 추가하여
 * 일관되지만 고유한 fingerprint를 생성합니다.
 *
 * 네이버 WTM이 수집하는 데이터:
 * - canvas.toDataURL() → 이미지 해시
 * - ctx.getImageData() → 픽셀 데이터 추출
 */

export default {
  name: 'canvas',

  /**
   * Canvas fingerprint 위조 스크립트 생성
   * @param {Object} deviceConfig - 디바이스 설정 (S23_PLUS_REAL 등)
   * @returns {string} 주입할 JavaScript 코드
   */
  getInitScript(deviceConfig) {
    // deviceConfig에서 고유 seed 생성
    const seed = (deviceConfig.navigator?.hardwareConcurrency || 8) *
                 (deviceConfig.navigator?.deviceMemory || 8);

    return `
    (function() {
      'use strict';

      // === Seeded Random Generator (일관된 노이즈 생성) ===
      // 같은 seed면 같은 난수 시퀀스 → 세션 내 일관성 보장
      function createSeededRandom(seed) {
        let state = seed;
        return function() {
          // Linear Congruential Generator
          state = (state * 1103515245 + 12345) & 0x7fffffff;
          return state / 0x7fffffff;
        };
      }

      // 세션별 고유 seed (페이지 로드 시점 기반)
      const sessionSeed = ${seed} + (Date.now() % 10000);
      const seededRandom = createSeededRandom(sessionSeed);

      // 일반 랜덤 (노이즈 위치 결정용)
      const random = Math.random.bind(Math);

      // === Canvas 2D: getImageData 오버라이드 ===
      const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;

      CanvasRenderingContext2D.prototype.getImageData = function(...args) {
        const imageData = originalGetImageData.apply(this, args);

        // fingerprint 수집 목적의 작은 캔버스만 수정 (성능 최적화)
        if (imageData.width * imageData.height > 10000) {
          return imageData;  // 큰 이미지는 그대로 반환
        }

        const data = imageData.data;
        const noiseRate = 0.01;  // 1% 픽셀만 수정

        for (let i = 0; i < data.length; i += 4) {
          if (random() < noiseRate) {
            // RGB 중 하나만 ±1 변경 (alpha는 유지)
            const channel = Math.floor(seededRandom() * 3);  // 0, 1, 2
            const offset = seededRandom() < 0.5 ? -1 : 1;
            data[i + channel] = Math.max(0, Math.min(255, data[i + channel] + offset));
          }
        }

        return imageData;
      };

      // === Canvas 2D: toDataURL 오버라이드 ===
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;

      HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
        // 캔버스에 보이지 않는 수정 추가
        try {
          const ctx = this.getContext('2d');
          if (ctx && this.width > 0 && this.height > 0) {
            // 첫 번째 픽셀에 미세한 변화 (시각적 영향 없음)
            const imageData = originalGetImageData.call(ctx, 0, 0, 1, 1);
            if (imageData.data[3] > 0) {  // alpha가 0이 아닌 경우만
              // alpha 값을 미세 조정 (254 또는 255)
              imageData.data[3] = Math.max(1, imageData.data[3] - (seededRandom() < 0.5 ? 0 : 1));
              ctx.putImageData(imageData, 0, 0);
            }
          }
        } catch (e) {
          // 2d context를 가져올 수 없는 경우 (WebGL 캔버스 등) 무시
        }

        return originalToDataURL.call(this, type, quality);
      };

      // === WebGL: readPixels 오버라이드 ===
      const originalReadPixels = WebGLRenderingContext.prototype.readPixels;

      WebGLRenderingContext.prototype.readPixels = function(x, y, width, height, format, type, pixels) {
        originalReadPixels.call(this, x, y, width, height, format, type, pixels);

        // 작은 영역만 노이즈 추가
        if (width * height <= 10000 && pixels && pixels.length) {
          const noiseRate = 0.01;
          for (let i = 0; i < pixels.length; i += 4) {
            if (random() < noiseRate) {
              const channel = Math.floor(seededRandom() * 3);
              const offset = seededRandom() < 0.5 ? -1 : 1;
              pixels[i + channel] = Math.max(0, Math.min(255, pixels[i + channel] + offset));
            }
          }
        }
      };

      // WebGL2도 동일하게 처리
      if (typeof WebGL2RenderingContext !== 'undefined') {
        const originalReadPixels2 = WebGL2RenderingContext.prototype.readPixels;

        WebGL2RenderingContext.prototype.readPixels = function(x, y, width, height, format, type, pixels) {
          originalReadPixels2.call(this, x, y, width, height, format, type, pixels);

          if (width * height <= 10000 && pixels && pixels.length) {
            const noiseRate = 0.01;
            for (let i = 0; i < pixels.length; i += 4) {
              if (random() < noiseRate) {
                const channel = Math.floor(seededRandom() * 3);
                const offset = seededRandom() < 0.5 ? -1 : 1;
                pixels[i + channel] = Math.max(0, Math.min(255, pixels[i + channel] + offset));
              }
            }
          }
        };
      }

      console.debug('[FP:Canvas] Canvas fingerprint module loaded (seed: ' + sessionSeed + ')');
    })();
    `;
  },

  defaultConfig: {
    enabled: true,
    noiseRate: 0.01,        // 수정할 픽셀 비율
    maxPixels: 10000,       // 노이즈 추가할 최대 픽셀 수
    consistentPerSession: true
  }
};
