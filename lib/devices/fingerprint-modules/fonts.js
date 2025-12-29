/**
 * Font Enumeration 위조 모듈
 *
 * 시스템 폰트 목록을 Android 디바이스에 맞게 제한합니다.
 * Canvas를 통한 폰트 탐지를 방지합니다.
 *
 * 탐지 방식:
 * - Canvas에 다양한 폰트로 텍스트 렌더링 후 너비 측정
 * - document.fonts.check()로 폰트 존재 여부 확인
 */

export default {
  name: 'fonts',

  /**
   * Font enumeration 위조 스크립트 생성
   * @param {Object} deviceConfig - 디바이스 설정
   * @returns {string} 주입할 JavaScript 코드
   */
  getInitScript(deviceConfig) {
    // Android 14 (S23+) 기본 폰트 목록
    const androidFonts = [
      // 시스템 폰트
      'Roboto',
      'Roboto Condensed',
      'Noto Sans',
      'Noto Sans CJK KR',
      'Noto Sans KR',
      'Noto Color Emoji',
      'Droid Sans',
      'Droid Sans Mono',
      'Droid Serif',
      // 일반 폰트 패밀리
      'sans-serif',
      'serif',
      'monospace',
      'cursive',
      'fantasy',
      'system-ui',
      // Samsung 폰트
      'SamsungOne',
      'SEC One UI'
    ];

    return `
    (function() {
      'use strict';

      const ANDROID_FONTS = ${JSON.stringify(androidFonts)};
      const ANDROID_FONTS_LOWER = ANDROID_FONTS.map(f => f.toLowerCase());

      /**
       * 폰트명이 Android 폰트인지 확인
       * @param {string} fontFamily
       * @returns {boolean}
       */
      function isAndroidFont(fontFamily) {
        if (!fontFamily) return false;

        const normalized = fontFamily
          .replace(/["']/g, '')
          .trim()
          .toLowerCase();

        return ANDROID_FONTS_LOWER.some(f =>
          normalized === f ||
          normalized.includes(f) ||
          f.includes(normalized)
        );
      }

      /**
       * 폰트 스택에서 폰트명 추출
       * @param {string} fontString - CSS font 속성값
       * @returns {string|null} 폰트 패밀리명
       */
      function extractFontFamily(fontString) {
        // "14px Arial" 또는 "bold 14px/1.5 'Helvetica Neue', Arial"
        const match = fontString.match(/(?:\\d+(?:\\.\\d+)?(?:px|pt|em|rem|%)\\s+)?["']?([^"',]+)/);
        return match ? match[1].trim() : null;
      }

      // === measureText 오버라이드 ===
      const originalMeasureText = CanvasRenderingContext2D.prototype.measureText;

      CanvasRenderingContext2D.prototype.measureText = function(text) {
        const currentFont = this.font;
        const fontFamily = extractFontFamily(currentFont);

        // Android에 없는 폰트면 fallback 폰트로 측정
        if (fontFamily && !isAndroidFont(fontFamily)) {
          // 현재 폰트 저장
          const savedFont = this.font;

          // fallback 폰트로 교체하여 측정
          this.font = currentFont.replace(fontFamily, 'sans-serif');
          const fallbackMetrics = originalMeasureText.call(this, text);

          // 원본 폰트 복원
          this.font = savedFont;

          // TextMetrics는 읽기 전용이므로 유사 객체 반환
          return {
            width: fallbackMetrics.width,
            actualBoundingBoxAscent: fallbackMetrics.actualBoundingBoxAscent || 0,
            actualBoundingBoxDescent: fallbackMetrics.actualBoundingBoxDescent || 0,
            actualBoundingBoxLeft: fallbackMetrics.actualBoundingBoxLeft || 0,
            actualBoundingBoxRight: fallbackMetrics.actualBoundingBoxRight || 0,
            fontBoundingBoxAscent: fallbackMetrics.fontBoundingBoxAscent || 0,
            fontBoundingBoxDescent: fallbackMetrics.fontBoundingBoxDescent || 0
          };
        }

        return originalMeasureText.call(this, text);
      };

      // === document.fonts.check() 오버라이드 ===
      if (document.fonts && document.fonts.check) {
        const originalCheck = document.fonts.check.bind(document.fonts);

        document.fonts.check = function(font, text) {
          const fontFamily = extractFontFamily(font);

          if (fontFamily && !isAndroidFont(fontFamily)) {
            return false;  // 비-Android 폰트는 항상 없음
          }

          return originalCheck(font, text || '');
        };
      }

      // === document.fonts.load() 오버라이드 ===
      if (document.fonts && document.fonts.load) {
        const originalLoad = document.fonts.load.bind(document.fonts);

        document.fonts.load = function(font, text) {
          const fontFamily = extractFontFamily(font);

          if (fontFamily && !isAndroidFont(fontFamily)) {
            // 비-Android 폰트는 빈 FontFaceSet 반환
            return Promise.resolve([]);
          }

          return originalLoad(font, text || '');
        };
      }

      // === CSS Font Loading API: FontFaceSet ===
      if (document.fonts) {
        // ready 상태 위조 (필요시)
        const originalForEach = document.fonts.forEach;

        if (originalForEach) {
          document.fonts.forEach = function(callback, thisArg) {
            originalForEach.call(this, function(fontFace) {
              // Android 폰트만 콜백 실행
              if (isAndroidFont(fontFace.family)) {
                callback.call(thisArg, fontFace);
              }
            });
          };
        }
      }

      console.debug('[FP:Fonts] Font enumeration module loaded (' + ANDROID_FONTS.length + ' fonts allowed)');
    })();
    `;
  },

  defaultConfig: {
    enabled: true,
    restrictToAndroid: true,
    fallbackFont: 'sans-serif'
  }
};
