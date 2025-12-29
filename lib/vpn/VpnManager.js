/**
 * VPN Manager - VPN 연결 생명주기 관리
 *
 * 통합 기능:
 * - VPN 할당/반납 (VpnClient)
 * - WireGuard 네임스페이스 설정 (WireGuardHelper)
 * - Heartbeat 자동화
 */

import VpnClient from './VpnClient.js';
import WireGuardHelper from './WireGuardHelper.js';

class VpnManager {
  constructor(options = {}) {
    this.agentId = options.agentId || 'T00-01';
    this.purpose = options.purpose || 'naver-persona';
    this.debug = options.debug || false;
    this.logger = options.logger || console.log;

    this.client = new VpnClient({
      agentId: this.agentId,
      purpose: this.purpose,
      logger: this.logger
    });

    this.wgHelper = new WireGuardHelper({
      debug: this.debug,
      logger: this.logger
    });

    this.namespace = null;
    this.wgInterface = null;
    this.heartbeatInterval = null;
    this.connected = false;
  }

  /**
   * VPN 연결
   * 1. VPN 할당
   * 2. WireGuard 네임스페이스 설정
   * 3. IP 확인
   * 4. Heartbeat 시작
   *
   * @returns {Promise<boolean>} 연결 성공 여부
   */
  async connect() {
    this.logger('[VpnManager] 연결 시작...');

    // 1. VPN 할당
    const dongle = await this.client.allocate();
    if (!dongle) {
      this.logger('[VpnManager] ❌ VPN 할당 실패');
      return false;
    }

    // 2. 네임스페이스 설정
    this.namespace = this.client.getNamespaceName();
    this.wgInterface = this.client.getInterfaceName();
    const wgConfig = this.client.getWireGuardConfig();

    this.logger(`[VpnManager] 네임스페이스: ${this.namespace}`);
    this.logger(`[VpnManager] 인터페이스: ${this.wgInterface}`);

    try {
      this.wgHelper.setupNamespace(this.namespace, this.wgInterface, wgConfig);
    } catch (error) {
      this.logger(`[VpnManager] ❌ WireGuard 설정 실패: ${error.message}`);
      await this.client.release();
      return false;
    }

    // 3. IP 확인
    const publicIp = this.wgHelper.getPublicIp(this.namespace);
    if (!publicIp) {
      this.logger('[VpnManager] ❌ IP 확인 실패');
      await this.cleanup();
      return false;
    }

    this.logger(`[VpnManager] ✅ 연결 성공: ${publicIp}`);
    this.connected = true;

    // 4. Heartbeat 시작 (60초 간격)
    this._startHeartbeat();

    return true;
  }

  /**
   * 네임스페이스 내에서 명령 실행용 프리픽스
   */
  getExecPrefix() {
    if (!this.namespace) return null;
    return `ip netns exec ${this.namespace}`;
  }

  /**
   * 현재 VPN IP 확인
   */
  getPublicIp() {
    if (!this.namespace) return null;
    return this.wgHelper.getPublicIp(this.namespace);
  }

  /**
   * IP 토글 요청
   */
  async toggleIp() {
    if (!this.connected) return false;

    const success = await this.client.toggleIp();
    if (success) {
      // 15초 대기 후 새 IP 확인
      await new Promise(r => setTimeout(r, 15000));
      const newIp = this.getPublicIp();
      this.logger(`[VpnManager] 새 IP: ${newIp}`);
      return true;
    }
    return false;
  }

  /**
   * VPN 연결 해제 및 정리
   */
  async cleanup(stats = {}) {
    this.logger('[VpnManager] 정리 시작...');

    // Heartbeat 중지
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // WireGuard 정리
    if (this.namespace) {
      this.wgHelper.cleanupNamespace(this.namespace, this.wgInterface);
    }

    // VPN 반납
    await this.client.release(stats);

    this.namespace = null;
    this.wgInterface = null;
    this.connected = false;

    this.logger('[VpnManager] ✅ 정리 완료');
  }

  /**
   * Heartbeat 시작
   * @private
   */
  _startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // 60초 간격으로 heartbeat (180초 타임아웃)
    this.heartbeatInterval = setInterval(async () => {
      const success = await this.client.heartbeat();
      if (!success) {
        this.logger('[VpnManager] ⚠️ Heartbeat 실패');
      }
    }, 60000);
  }

  /**
   * 연결 상태 확인
   */
  isConnected() {
    return this.connected;
  }

  /**
   * 현재 dongle 정보
   */
  getDongle() {
    return this.client.getVpnInfo();
  }
}

export default VpnManager;
