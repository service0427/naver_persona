/**
 * VPN API Client - VPN 서버와의 통신 담당
 *
 * Base URL: http://61.84.75.37:44010
 * 참조: docs/CLIENT-API.md
 */

const API_BASE = 'http://61.84.75.37:44010';

class VpnClient {
  constructor(options = {}) {
    this.agentId = options.agentId || 'T00-01';
    this.purpose = options.purpose || 'naver';
    this.vpn = null;  // 할당된 VPN 정보
    this.logger = options.logger || console.log;
  }

  async _fetch(endpoint, body = null) {
    const url = `${API_BASE}${endpoint}`;
    const options = {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    this.logger(`[VPN] API 요청: ${options.method} ${url}`);
    if (body) {
      this.logger(`[VPN] Body: ${JSON.stringify(body)}`);
    }

    const response = await fetch(url, options);
    const result = await response.json();

    this.logger(`[VPN] 응답: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * VPN 할당 요청 (재시도 포함)
   * POST /api/vpn/allocate
   *
   * @param {Object} options - { maxRetries, retryInterval }
   */
  async allocate(options = {}) {
    const { maxRetries = 30, retryInterval = 10000 } = options;  // 기본 5분(30회×10초)
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;

      try {
        if (attempt > 1) {
          this.logger(`[VPN] 동글 할당 재시도 (${attempt}/${maxRetries})...`);
        } else {
          this.logger(`[VPN] 동글 할당 요청: agent_id=${this.agentId}, purpose=${this.purpose}`);
        }

        const result = await this._fetch('/api/vpn/allocate', {
          agent_id: this.agentId,
          purpose: this.purpose
        });

        if (result.success && result.vpn) {
          // 할당 성공
          this.vpn = {
            dongleId: result.vpn.dongle_id,
            serverIp: result.vpn.server_ip,
            subnet: result.vpn.subnet,
            externalIp: result.vpn.external_ip,
            privateKey: result.vpn.private_key,
            publicKey: result.vpn.public_key,
            purpose: result.vpn.purpose,
            renewed: result.renewed
          };

          const status = result.renewed ? '(기존 재사용)' : '(신규 할당)';
          this.logger(`[VPN] ✅ 할당 성공 ${status}: dongle_id=${this.vpn.dongleId}, ip=${this.vpn.externalIp}`);
          return this.vpn;
        }

        // 할당 가능한 VPN 없음 - 재시도
        if (result.reason === 'NO_VPN' || result.message?.includes('No available')) {
          this.logger(`[VPN] ⏳ 사용 가능한 VPN 없음, ${retryInterval/1000}초 후 재시도...`);
          await this._sleep(retryInterval);
          continue;
        }

        // 다른 오류 (INVALID_AGENT_ID 등)
        this.logger(`[VPN] ❌ 할당 실패: ${result.error || result.message || '응답 없음'}`);
        return null;

      } catch (error) {
        this.logger(`[VPN] ❌ 할당 오류: ${error.message}`);

        // 네트워크 오류는 재시도
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
          this.logger(`[VPN] ⏳ 서버 연결 실패, ${retryInterval/1000}초 후 재시도...`);
          await this._sleep(retryInterval);
          continue;
        }

        return null;
      }
    }

    this.logger(`[VPN] ❌ 최대 재시도 횟수 초과 (${maxRetries}회)`);
    return null;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Heartbeat 갱신 (180초 내 호출 필수)
   * POST /api/vpn/heartbeat
   */
  async heartbeat() {
    if (!this.vpn) return false;

    try {
      const result = await this._fetch('/api/vpn/heartbeat', {
        agent_id: this.agentId,
        dongle_id: this.vpn.dongleId  // 옵션
      });

      if (result.success) {
        this.logger(`[VPN] 💓 Heartbeat OK (timeout: ${result.timeout_sec}s)`);
        return true;
      }

      // NOT_FOUND = 할당이 해제됨
      if (result.reason === 'NOT_FOUND') {
        this.logger(`[VPN] ⚠️ VPN 할당이 해제됨, 재할당 필요`);
        this.vpn = null;
      }
      return false;
    } catch (error) {
      this.logger(`[VPN] Heartbeat 오류: ${error.message}`);
      return false;
    }
  }

  /**
   * VPN 반납
   * POST /api/vpn/release
   */
  async release(stats = {}) {
    if (!this.vpn) return false;

    try {
      const result = await this._fetch('/api/vpn/release', {
        agent_id: this.agentId,
        dongle_id: this.vpn.dongleId,
        success_count: stats.successCount || 0,
        fail_count: stats.failCount || 0,
        work_duration_ms: stats.durationMs || 0
      });

      if (result.success) {
        this.logger(`[VPN] ✅ 반납 성공: dongle_id=${this.vpn.dongleId}`);
        this.vpn = null;
        return true;
      }
      return false;
    } catch (error) {
      this.logger(`[VPN] 반납 오류: ${error.message}`);
      return false;
    }
  }

  /**
   * IP 토글 요청 - 동글 서버에 직접 호출
   * GET http://{server_ip}/toggle/{subnet}
   *
   * 동기 방식으로 10~15초 후 새 IP 반환
   */
  async toggleIp() {
    if (!this.vpn) return { success: false, error: 'VPN not allocated' };

    const { serverIp, subnet } = this.vpn;
    const url = `http://${serverIp}/toggle/${subnet}`;

    try {
      this.logger(`[VPN] IP 토글 요청: GET ${url}`);

      const response = await fetch(url);
      const result = await response.json();

      this.logger(`[VPN] 토글 응답: ${JSON.stringify(result)}`);

      if (result.success) {
        // 새 IP 업데이트
        this.vpn.externalIp = result.new_ip;

        this.logger(`[VPN] ✅ IP 변경 성공: ${result.old_ip} → ${result.new_ip} (${result.elapsed}초)`);
        this.logger(`[VPN] 신호 등급: ${result.signal_grade || 'N/A'}`);

        return {
          success: true,
          oldIp: result.old_ip,
          newIp: result.new_ip,
          elapsed: result.elapsed,
          signalGrade: result.signal_grade
        };
      }

      // 실패
      this.logger(`[VPN] ❌ 토글 실패: ${result.error}`);
      return {
        success: false,
        error: result.error,
        oldIp: result.old_ip
      };
    } catch (error) {
      this.logger(`[VPN] IP 토글 오류: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 상태 조회
   * GET /api/vpn/status
   */
  async getStatus() {
    try {
      const result = await this._fetch('/api/vpn/status');
      return result;
    } catch (error) {
      this.logger(`[VPN] 상태 조회 오류: ${error.message}`);
      return null;
    }
  }

  /**
   * WireGuard 설정 생성
   * Address: 10.8.{subnet}.2/32 (클라이언트), 서버는 .1
   * Endpoint: {server_ip}:55555
   */
  getWireGuardConfig() {
    if (!this.vpn) return null;

    return {
      privateKey: this.vpn.privateKey,
      publicKey: this.vpn.publicKey,
      endpoint: `${this.vpn.serverIp}:55555`,
      address: `10.8.${this.vpn.subnet}.0/24`,  // 클라이언트 IP (서버에서 할당)
      dns: ['1.1.1.1', '8.8.8.8']
    };
  }

  /**
   * WireGuard 설정 파일 내용 생성
   */
  getWireGuardConfigFile() {
    if (!this.vpn) return null;

    return `[Interface]
PrivateKey = ${this.vpn.privateKey}
Address = 10.8.${this.vpn.subnet}.0/24
DNS = 1.1.1.1, 8.8.8.8

[Peer]
PublicKey = ${this.vpn.publicKey}
Endpoint = ${this.vpn.serverIp}:55555
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25`;
  }

  /**
   * 네임스페이스 이름 생성
   */
  getNamespaceName() {
    if (!this.vpn) return null;
    return `vpn-${this.agentId}-${this.vpn.dongleId}`;
  }

  /**
   * WireGuard 인터페이스 이름 생성
   */
  getInterfaceName() {
    if (!this.vpn) return null;
    return `wg${this.vpn.dongleId}`;
  }

  /**
   * 현재 할당된 VPN 정보
   */
  getVpnInfo() {
    return this.vpn;
  }

  /**
   * 할당 여부 확인
   */
  isAllocated() {
    return this.vpn !== null;
  }
}

export default VpnClient;
