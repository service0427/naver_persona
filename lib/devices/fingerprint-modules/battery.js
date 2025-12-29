/**
 * Battery API 위조 모듈
 *
 * navigator.getBattery()를 모바일 디바이스답게 위조합니다.
 * 시간에 따른 자연스러운 배터리 상태 변화를 시뮬레이션합니다.
 *
 * S23+ 배터리 특성:
 * - 4700mAh
 * - 45W 급속충전
 */

export default {
  name: 'battery',

  /**
   * Battery API 위조 스크립트 생성
   * @param {Object} deviceConfig - 디바이스 설정
   * @returns {string} 주입할 JavaScript 코드
   */
  getInitScript(deviceConfig) {
    // S23+ 기본 배터리 상태 (자연스러운 값)
    const initialLevel = 0.70 + Math.random() * 0.25;  // 70% ~ 95%
    const charging = Math.random() > 0.3;  // 70% 확률로 충전 중

    return `
    (function() {
      'use strict';

      // === 초기 배터리 상태 ===
      const INITIAL_STATE = {
        charging: ${charging},
        chargingTime: ${charging ? Math.floor(1800 + Math.random() * 3600) : Infinity},
        dischargingTime: ${charging ? Infinity : Math.floor(7200 + Math.random() * 14400)},
        level: ${initialLevel.toFixed(4)}
      };

      // === MockBatteryManager 클래스 ===
      class MockBatteryManager extends EventTarget {
        constructor() {
          super();

          this._charging = INITIAL_STATE.charging;
          this._chargingTime = INITIAL_STATE.chargingTime;
          this._dischargingTime = INITIAL_STATE.dischargingTime;
          this._level = parseFloat(INITIAL_STATE.level);
          this._startTime = Date.now();

          // 이벤트 핸들러 저장
          this._onchargingchange = null;
          this._onchargingtimechange = null;
          this._ondischargingtimechange = null;
          this._onlevelchange = null;

          // 주기적 업데이트 (2분마다)
          this._updateInterval = setInterval(() => this._simulateBatteryChange(), 120000);
        }

        /**
         * 자연스러운 배터리 변화 시뮬레이션
         */
        _simulateBatteryChange() {
          const elapsed = (Date.now() - this._startTime) / 1000;  // seconds

          if (this._charging) {
            // 충전 중: 2분마다 약 1-2% 증가
            const increase = 0.01 + Math.random() * 0.01;
            this._level = Math.min(1.0, this._level + increase);

            // 충전 완료 시간 감소
            this._chargingTime = Math.max(0, this._chargingTime - 120);

            // 완충 시 충전 완료
            if (this._level >= 1.0) {
              this._chargingTime = 0;
            }

            this._dispatchEvent('levelchange');
            this._dispatchEvent('chargingtimechange');

          } else {
            // 방전 중: 2분마다 약 0.3-0.5% 감소
            const decrease = 0.003 + Math.random() * 0.002;
            this._level = Math.max(0.05, this._level - decrease);

            // 방전 시간 감소
            this._dischargingTime = Math.max(0, this._dischargingTime - 120);

            this._dispatchEvent('levelchange');
            this._dispatchEvent('dischargingtimechange');
          }

          // 가끔 충전 상태 변경 (5% 확률)
          if (Math.random() < 0.05) {
            this._charging = !this._charging;

            if (this._charging) {
              this._chargingTime = Math.floor(1800 + Math.random() * 3600);
              this._dischargingTime = Infinity;
            } else {
              this._chargingTime = Infinity;
              this._dischargingTime = Math.floor(7200 + Math.random() * 14400);
            }

            this._dispatchEvent('chargingchange');
          }
        }

        _dispatchEvent(type) {
          this.dispatchEvent(new Event(type));
        }

        // Getters
        get charging() { return this._charging; }
        get chargingTime() { return this._chargingTime; }
        get dischargingTime() { return this._dischargingTime; }
        get level() { return this._level; }

        // Event handler setters
        get onchargingchange() { return this._onchargingchange; }
        set onchargingchange(handler) {
          if (this._onchargingchange) {
            this.removeEventListener('chargingchange', this._onchargingchange);
          }
          this._onchargingchange = handler;
          if (handler) {
            this.addEventListener('chargingchange', handler);
          }
        }

        get onchargingtimechange() { return this._onchargingtimechange; }
        set onchargingtimechange(handler) {
          if (this._onchargingtimechange) {
            this.removeEventListener('chargingtimechange', this._onchargingtimechange);
          }
          this._onchargingtimechange = handler;
          if (handler) {
            this.addEventListener('chargingtimechange', handler);
          }
        }

        get ondischargingtimechange() { return this._ondischargingtimechange; }
        set ondischargingtimechange(handler) {
          if (this._ondischargingtimechange) {
            this.removeEventListener('dischargingtimechange', this._ondischargingtimechange);
          }
          this._ondischargingtimechange = handler;
          if (handler) {
            this.addEventListener('dischargingtimechange', handler);
          }
        }

        get onlevelchange() { return this._onlevelchange; }
        set onlevelchange(handler) {
          if (this._onlevelchange) {
            this.removeEventListener('levelchange', this._onlevelchange);
          }
          this._onlevelchange = handler;
          if (handler) {
            this.addEventListener('levelchange', handler);
          }
        }
      }

      // 싱글톤 인스턴스
      let batteryManager = null;

      // === navigator.getBattery 오버라이드 ===
      navigator.getBattery = function() {
        if (!batteryManager) {
          batteryManager = new MockBatteryManager();
        }
        return Promise.resolve(batteryManager);
      };

      console.debug('[FP:Battery] Battery API module loaded (level: ' +
                    (INITIAL_STATE.level * 100).toFixed(0) + '%, charging: ' +
                    INITIAL_STATE.charging + ')');
    })();
    `;
  },

  defaultConfig: {
    enabled: true,
    simulateChanges: true,
    updateInterval: 120000  // 2분
  }
};
