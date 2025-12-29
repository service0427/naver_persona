/**
 * VPN 모듈 - lib/vpn/
 *
 * WireGuard VPN과 네트워크 네임스페이스 관리를 위한 모듈
 *
 * 구성:
 * - WireGuardHelper: 네임스페이스/WireGuard 설정 관리
 * - VpnClient: VPN API 통신
 * - VpnManager: VPN 연결 생명주기 관리
 *
 * 사용법:
 *   import { VpnManager } from './lib/vpn/index.js';
 *
 *   const vpn = new VpnManager({ agentId: 'T00-01' });
 *   await vpn.connect();
 *
 *   // 네임스페이스 내에서 실행
 *   const prefix = vpn.getExecPrefix();
 *   // `${prefix} node script.js`
 *
 *   await vpn.cleanup();
 */

import WireGuardHelper from './WireGuardHelper.js';
import VpnClient from './VpnClient.js';
import VpnManager from './VpnManager.js';

export {
  WireGuardHelper,
  VpnClient,
  VpnManager
};

export default VpnManager;
