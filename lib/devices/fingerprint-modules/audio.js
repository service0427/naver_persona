/**
 * AudioContext Fingerprint 위조 모듈
 *
 * OfflineAudioContext를 통한 오디오 fingerprint 수집을 우회합니다.
 * 오디오 처리 결과에 미세한 노이즈를 추가하여 고유한 fingerprint를 생성합니다.
 *
 * 네이버 WTM이 수집하는 데이터:
 * - OfflineAudioContext.startRendering() 결과
 * - AudioBuffer의 getChannelData() 분석
 */

export default {
  name: 'audio',

  /**
   * Audio fingerprint 위조 스크립트 생성
   * @param {Object} deviceConfig - 디바이스 설정
   * @returns {string} 주입할 JavaScript 코드
   */
  getInitScript(deviceConfig) {
    // S23+의 오디오 특성
    const sampleRate = 44100;
    const channelCount = 2;
    const deviceMemory = deviceConfig.navigator?.deviceMemory || 8;

    return `
    (function() {
      'use strict';

      // === OfflineAudioContext 오버라이드 ===
      const OriginalOfflineAudioContext = window.OfflineAudioContext ||
                                          window.webkitOfflineAudioContext;

      if (!OriginalOfflineAudioContext) {
        console.debug('[FP:Audio] OfflineAudioContext not available');
        return;
      }

      // 세션별 고유 seed
      const audioSeed = ${deviceMemory} * 1000 + (Date.now() % 10000);

      // Seeded random for consistent noise
      function seededRandom(seed) {
        let state = seed;
        return function() {
          state = (state * 1103515245 + 12345) & 0x7fffffff;
          return (state / 0x7fffffff) - 0.5;  // -0.5 ~ 0.5
        };
      }

      const random = seededRandom(audioSeed);

      /**
       * AudioBuffer에 미세한 노이즈 추가
       * @param {AudioBuffer} buffer
       */
      function addAudioNoise(buffer) {
        const noiseLevel = 0.0000001;  // 극도로 미세한 노이즈 (청각 영향 없음)
        const sampleRate = 100;         // 100 샘플당 1개 수정

        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          const channelData = buffer.getChannelData(channel);

          for (let i = 0; i < channelData.length; i++) {
            if (i % sampleRate === 0) {
              channelData[i] += random() * noiseLevel;
            }
          }
        }
      }

      // OfflineAudioContext 래퍼 클래스
      class SpoofedOfflineAudioContext extends OriginalOfflineAudioContext {
        constructor(numberOfChannels, length, sampleRate) {
          super(numberOfChannels, length, sampleRate);
          this._spoofed = true;
        }

        startRendering() {
          return super.startRendering().then(buffer => {
            // 렌더링 결과에 노이즈 추가
            addAudioNoise(buffer);
            return buffer;
          });
        }
      }

      // 원본 프로토타입 체인 유지
      Object.setPrototypeOf(
        SpoofedOfflineAudioContext.prototype,
        OriginalOfflineAudioContext.prototype
      );

      // 정적 메서드/속성 복사
      Object.getOwnPropertyNames(OriginalOfflineAudioContext).forEach(prop => {
        if (prop !== 'prototype' && prop !== 'length' && prop !== 'name') {
          try {
            SpoofedOfflineAudioContext[prop] = OriginalOfflineAudioContext[prop];
          } catch (e) {}
        }
      });

      // 전역 객체 교체
      window.OfflineAudioContext = SpoofedOfflineAudioContext;
      if (window.webkitOfflineAudioContext) {
        window.webkitOfflineAudioContext = SpoofedOfflineAudioContext;
      }

      // === AudioContext destination 속성 위조 ===
      if (window.AudioContext) {
        const originalAudioContext = window.AudioContext;

        // destination의 maxChannelCount 위조
        const originalDestinationDescriptor = Object.getOwnPropertyDescriptor(
          originalAudioContext.prototype,
          'destination'
        );

        if (originalDestinationDescriptor && originalDestinationDescriptor.get) {
          Object.defineProperty(originalAudioContext.prototype, 'destination', {
            get: function() {
              const dest = originalDestinationDescriptor.get.call(this);

              if (dest && !dest._channelCountSpoofed) {
                // S23+의 채널 구성으로 위조
                try {
                  Object.defineProperty(dest, 'maxChannelCount', {
                    get: () => ${channelCount},
                    configurable: true
                  });
                  Object.defineProperty(dest, 'channelCount', {
                    get: () => ${channelCount},
                    configurable: true
                  });
                  dest._channelCountSpoofed = true;
                } catch (e) {}
              }

              return dest;
            },
            configurable: true
          });
        }
      }

      // === BaseAudioContext sampleRate 일관성 ===
      if (window.AudioContext) {
        const originalSampleRateDescriptor = Object.getOwnPropertyDescriptor(
          AudioContext.prototype,
          'sampleRate'
        );

        if (originalSampleRateDescriptor && originalSampleRateDescriptor.get) {
          Object.defineProperty(AudioContext.prototype, 'sampleRate', {
            get: function() {
              // S23+의 기본 샘플레이트
              return ${sampleRate};
            },
            configurable: true
          });
        }
      }

      console.debug('[FP:Audio] Audio fingerprint module loaded (seed: ' + audioSeed + ')');
    })();
    `;
  },

  defaultConfig: {
    enabled: true,
    sampleRate: 44100,
    channelCount: 2,
    noiseLevel: 0.0000001
  }
};
