/**
 * Touch Event 강화 모듈
 *
 * Touch 이벤트를 실제 터치스크린 디바이스처럼 상세하게 처리합니다.
 * CSS Media Query도 모바일 터치 디바이스에 맞게 조정합니다.
 *
 * S23+ 터치 특성:
 * - Capacitive touchscreen
 * - Multi-touch (10 points)
 * - Force touch 미지원
 */

export default {
  name: 'touch',

  /**
   * Touch event 강화 스크립트 생성
   * @param {Object} deviceConfig - 디바이스 설정
   * @returns {string} 주입할 JavaScript 코드
   */
  getInitScript(deviceConfig) {
    const maxTouchPoints = deviceConfig.navigator?.maxTouchPoints || 5;

    return `
    (function() {
      'use strict';

      // === S23+ 터치 특성 ===
      const TOUCH_CONFIG = {
        radiusX: 25,          // 터치 영역 반경 (px)
        radiusY: 25,
        rotationAngle: 0,
        force: 0              // S23+는 Force Touch 미지원
      };

      // === ontouchstart 속성 보장 ===
      // 일부 봇 탐지는 이 속성의 존재 여부 확인
      if (!('ontouchstart' in window)) {
        window.ontouchstart = null;
      }
      if (!('ontouchmove' in window)) {
        window.ontouchmove = null;
      }
      if (!('ontouchend' in window)) {
        window.ontouchend = null;
      }
      if (!('ontouchcancel' in window)) {
        window.ontouchcancel = null;
      }

      // === Touch 속성 확장 ===
      // Touch 인터페이스의 추가 속성들
      if (window.Touch) {
        const TouchPrototype = Touch.prototype;

        // radiusX, radiusY, rotationAngle, force 속성 보장
        const touchProps = ['radiusX', 'radiusY', 'rotationAngle', 'force'];

        touchProps.forEach(prop => {
          if (!(prop in TouchPrototype)) {
            Object.defineProperty(TouchPrototype, prop, {
              get: function() {
                return this['_' + prop] || TOUCH_CONFIG[prop];
              },
              configurable: true
            });
          }
        });
      }

      // === TouchEvent 생성자 확장 ===
      if (window.TouchEvent) {
        const OriginalTouchEvent = window.TouchEvent;

        // TouchEvent 생성 시 터치 속성 자동 추가
        window.TouchEvent = function(type, eventInitDict) {
          if (eventInitDict && eventInitDict.touches) {
            // 각 Touch에 기본 속성 추가
            eventInitDict.touches = Array.from(eventInitDict.touches).map(touch => {
              if (touch && typeof touch === 'object') {
                return {
                  ...touch,
                  radiusX: touch.radiusX || TOUCH_CONFIG.radiusX + (Math.random() - 0.5) * 10,
                  radiusY: touch.radiusY || TOUCH_CONFIG.radiusY + (Math.random() - 0.5) * 10,
                  rotationAngle: touch.rotationAngle || Math.random() * 360,
                  force: touch.force || TOUCH_CONFIG.force
                };
              }
              return touch;
            });
          }

          return new OriginalTouchEvent(type, eventInitDict);
        };

        // 프로토타입 체인 유지
        window.TouchEvent.prototype = OriginalTouchEvent.prototype;
      }

      // === CSS Media Query 대응 ===
      // pointer: coarse, hover: none (모바일 특성)
      if (window.matchMedia) {
        const originalMatchMedia = window.matchMedia.bind(window);

        window.matchMedia = function(query) {
          const normalizedQuery = query.toLowerCase().replace(/\\s+/g, '');

          // 터치 디바이스 관련 쿼리
          const touchQueries = {
            '(pointer:coarse)': true,
            '(pointer:fine)': false,
            '(hover:none)': true,
            '(hover:hover)': false,
            '(any-pointer:coarse)': true,
            '(any-pointer:fine)': false,
            '(any-hover:none)': true,
            '(any-hover:hover)': false
          };

          for (const [pattern, matches] of Object.entries(touchQueries)) {
            if (normalizedQuery.includes(pattern.replace(/\\s+/g, ''))) {
              // MediaQueryList 유사 객체 반환
              const result = {
                matches: matches,
                media: query,
                onchange: null,
                addListener: function(cb) { /* deprecated */ },
                removeListener: function(cb) { /* deprecated */ },
                addEventListener: function(type, cb) {
                  if (type === 'change') this.onchange = cb;
                },
                removeEventListener: function(type, cb) {
                  if (type === 'change' && this.onchange === cb) this.onchange = null;
                },
                dispatchEvent: function(event) { return true; }
              };

              return result;
            }
          }

          return originalMatchMedia(query);
        };
      }

      // === navigator.maxTouchPoints 재확인 ===
      Object.defineProperty(Navigator.prototype, 'maxTouchPoints', {
        get: () => ${maxTouchPoints},
        configurable: true
      });

      // === DocumentTouch 인터페이스 (레거시) ===
      // 일부 사이트는 여전히 이를 확인
      if (!window.DocumentTouch) {
        window.DocumentTouch = function() {};
      }

      // === 터치 이벤트 지원 확인 함수 ===
      // Modernizr 등에서 사용하는 탐지 방법 대응
      if (!document.createTouch) {
        document.createTouch = function(view, target, identifier, pageX, pageY, screenX, screenY) {
          return {
            identifier: identifier,
            target: target,
            screenX: screenX,
            screenY: screenY,
            clientX: pageX,
            clientY: pageY,
            pageX: pageX,
            pageY: pageY,
            radiusX: TOUCH_CONFIG.radiusX,
            radiusY: TOUCH_CONFIG.radiusY,
            rotationAngle: TOUCH_CONFIG.rotationAngle,
            force: TOUCH_CONFIG.force
          };
        };
      }

      if (!document.createTouchList) {
        document.createTouchList = function(...touches) {
          const list = [...touches];
          list.item = function(index) { return this[index] || null; };
          return list;
        };
      }

      console.debug('[FP:Touch] Touch event module loaded (maxTouchPoints: ' + ${maxTouchPoints} + ')');
    })();
    `;
  },

  defaultConfig: {
    enabled: true,
    maxTouchPoints: 5,
    radiusX: 25,
    radiusY: 25
  }
};
