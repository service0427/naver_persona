/**
 * Performance API 정밀도 제한 모듈
 *
 * performance.now() 및 PerformanceEntry의 타이밍 값에 노이즈를 추가하여
 * 타이밍 기반 fingerprinting을 방지합니다.
 *
 * 네이버 NTM/nlog가 수집하는 데이터:
 * - Navigation timing (fetchStart, responseStart 등)
 * - Resource timing
 * - performance.now() 정밀도 측정
 */

export default {
  name: 'performance',

  /**
   * Performance 정밀도 제한 스크립트 생성
   * @param {Object} deviceConfig - 디바이스 설정
   * @returns {string} 주입할 JavaScript 코드
   */
  getInitScript(deviceConfig) {
    // 모바일 Chrome의 기본 정밀도: 100μs (0.1ms)
    const precision = 0.1;

    return `
    (function() {
      'use strict';

      const PRECISION = ${precision};  // milliseconds
      const NOISE_FACTOR = PRECISION * 0.1;  // 노이즈 범위

      // === performance.now() 오버라이드 ===
      const originalNow = performance.now.bind(performance);

      performance.now = function() {
        const now = originalNow();

        // 정밀도 제한 (반올림)
        const rounded = Math.round(now / PRECISION) * PRECISION;

        // 미세 노이즈 추가 (±0.01ms)
        const noise = (Math.random() - 0.5) * NOISE_FACTOR;

        return rounded + noise;
      };

      // === PerformanceEntry 타이밍 노이즈 ===
      const originalGetEntriesByType = performance.getEntriesByType.bind(performance);

      /**
       * PerformanceEntry 객체의 타이밍 값에 노이즈 추가
       * @param {PerformanceEntry} entry
       * @returns {Object} 수정된 entry (읽기 전용이므로 새 객체)
       */
      function spoofEntry(entry) {
        // 타이밍 관련 속성들
        const timingProps = [
          'startTime', 'duration', 'fetchStart', 'domainLookupStart',
          'domainLookupEnd', 'connectStart', 'connectEnd', 'secureConnectionStart',
          'requestStart', 'responseStart', 'responseEnd', 'transferSize',
          'encodedBodySize', 'decodedBodySize', 'domInteractive',
          'domContentLoadedEventStart', 'domContentLoadedEventEnd',
          'domComplete', 'loadEventStart', 'loadEventEnd',
          'unloadEventStart', 'unloadEventEnd', 'redirectStart', 'redirectEnd',
          'workerStart'
        ];

        const spoofed = {};

        // 모든 속성 복사
        for (const key in entry) {
          try {
            const value = entry[key];

            if (typeof value === 'function') {
              spoofed[key] = value.bind(entry);
            } else if (typeof value === 'number' && timingProps.includes(key) && value > 0) {
              // 타이밍 값에 노이즈 추가
              const rounded = Math.round(value / PRECISION) * PRECISION;
              spoofed[key] = rounded + (Math.random() - 0.5) * NOISE_FACTOR;
            } else {
              spoofed[key] = value;
            }
          } catch (e) {
            spoofed[key] = entry[key];
          }
        }

        // toJSON 메서드
        spoofed.toJSON = function() {
          const json = {};
          for (const key in this) {
            if (typeof this[key] !== 'function') {
              json[key] = this[key];
            }
          }
          return json;
        };

        return spoofed;
      }

      performance.getEntriesByType = function(type) {
        const entries = originalGetEntriesByType(type);

        // navigation, resource 타이밍에 노이즈 추가
        if (type === 'navigation' || type === 'resource' || type === 'paint') {
          return entries.map(spoofEntry);
        }

        return entries;
      };

      // === getEntriesByName 도 처리 ===
      const originalGetEntriesByName = performance.getEntriesByName.bind(performance);

      performance.getEntriesByName = function(name, type) {
        const entries = originalGetEntriesByName(name, type);

        if (!type || type === 'navigation' || type === 'resource' || type === 'paint') {
          return entries.map(spoofEntry);
        }

        return entries;
      };

      // === getEntries 도 처리 ===
      const originalGetEntries = performance.getEntries.bind(performance);

      performance.getEntries = function() {
        const entries = originalGetEntries();

        return entries.map(entry => {
          if (entry.entryType === 'navigation' ||
              entry.entryType === 'resource' ||
              entry.entryType === 'paint') {
            return spoofEntry(entry);
          }
          return entry;
        });
      };

      // === performance.timeOrigin 노이즈 ===
      if (performance.timeOrigin) {
        const originalTimeOrigin = performance.timeOrigin;

        Object.defineProperty(performance, 'timeOrigin', {
          get: function() {
            // 미세 노이즈 (일관성 유지를 위해 세션당 고정)
            return originalTimeOrigin + (originalTimeOrigin % 0.1);
          },
          configurable: true
        });
      }

      console.debug('[FP:Performance] Performance timing module loaded (precision: ' + PRECISION + 'ms)');
    })();
    `;
  },

  defaultConfig: {
    enabled: true,
    precision: 0.1,  // ms
    addNoise: true
  }
};
