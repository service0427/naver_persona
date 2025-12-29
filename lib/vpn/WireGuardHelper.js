/**
 * WireGuardHelper - WireGuard 및 네트워크 네임스페이스 관리
 *
 * vpn_coupang_v1에서 이식 (ES Modules 변환)
 *
 * 책임:
 * - 네임스페이스 생성/삭제
 * - WireGuard 인터페이스 설정
 * - 공인 IP 확인
 */

import { execSync } from 'child_process';
import fs from 'fs';

class WireGuardHelper {
  constructor(options = {}) {
    this.debug = options.debug || false;
    this.logger = options.logger || console.log;
  }

  _log(msg) {
    if (this.debug) {
      this.logger(`[WireGuard] ${msg}`);
    }
  }

  /**
   * VPN 네임스페이스 생성 및 WireGuard 설정
   *
   * @param {string} namespace - 네임스페이스 이름
   * @param {string} wgInterface - WireGuard 인터페이스 이름 (예: wg-16)
   * @param {Object} config - WireGuard 설정
   * @param {string} config.privateKey - 클라이언트 비밀키
   * @param {string} config.publicKey - 서버 공개키
   * @param {string} config.endpoint - 서버 엔드포인트 (IP:포트)
   * @param {string} config.address - 클라이언트 IP/서브넷 (예: 10.0.16.2/32)
   */
  setupNamespace(namespace, wgInterface, config) {
    try {
      this._log(`설정 시작: ${namespace} / ${wgInterface}`);

      // 기존 정리
      this._log('기존 네임스페이스 정리...');
      try {
        const nsExists = execSync(`ip netns list 2>/dev/null | grep -q "^${namespace}" && echo yes || echo no`, {
          encoding: 'utf8'
        }).trim();
        if (nsExists === 'yes') {
          const nsLinks = execSync(`ip -n ${namespace} link show 2>/dev/null || true`, { encoding: 'utf8' });
          const wgInNs = nsLinks.match(/wg-\d+/g) || [];
          for (const wg of wgInNs) {
            execSync(`ip -n ${namespace} link del ${wg} 2>/dev/null || true`, { stdio: 'pipe' });
          }
        }
      } catch (e) { /* 무시 */ }

      execSync(`ip netns del ${namespace} 2>/dev/null || true`, { stdio: 'pipe' });
      execSync(`ip link del ${wgInterface} 2>/dev/null || true`, { stdio: 'pipe' });

      // 네임스페이스 생성
      this._log('네임스페이스 생성...');
      execSync(`ip netns add ${namespace}`);
      execSync(`ip netns exec ${namespace} ip link set lo up`);

      // WireGuard 인터페이스 생성
      this._log(`WireGuard 인터페이스 생성: ${wgInterface}`);
      execSync(`ip link add ${wgInterface} type wireguard`);
      execSync(`ip link set ${wgInterface} netns ${namespace}`);

      // WireGuard 설정 파일 생성
      this._log('WireGuard 설정 적용...');
      const tempConf = `/tmp/wg-${namespace}.conf`;
      const wgConfig = `[Interface]
PrivateKey = ${config.privateKey}

[Peer]
PublicKey = ${config.publicKey}
Endpoint = ${config.endpoint}
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
`;
      fs.writeFileSync(tempConf, wgConfig);

      execSync(`ip netns exec ${namespace} wg setconf ${wgInterface} ${tempConf}`);
      fs.unlinkSync(tempConf);

      // IP 할당 및 활성화
      this._log(`IP 할당: ${config.address}`);
      execSync(`ip netns exec ${namespace} ip addr add ${config.address} dev ${wgInterface}`);
      execSync(`ip netns exec ${namespace} ip link set ${wgInterface} up`);

      // 라우팅 설정
      this._log('라우팅 설정...');
      execSync(`ip netns exec ${namespace} ip route add default dev ${wgInterface}`);

      // DNS 설정
      this._log('DNS 설정...');
      const dnsDir = `/etc/netns/${namespace}`;
      if (!fs.existsSync(dnsDir)) {
        fs.mkdirSync(dnsDir, { recursive: true });
      }
      fs.writeFileSync(`${dnsDir}/resolv.conf`, 'nameserver 1.1.1.1\nnameserver 8.8.8.8\n');

      this._log('설정 완료 ✓');
      return true;
    } catch (error) {
      // 에러 발생 시 정리
      try {
        execSync(`ip link del ${wgInterface} 2>/dev/null || true`, { stdio: 'pipe' });
        execSync(`ip netns del ${namespace} 2>/dev/null || true`, { stdio: 'pipe' });
      } catch (e) { /* 무시 */ }
      throw error;
    }
  }

  /**
   * 개별 네임스페이스 정리
   */
  cleanupNamespace(namespace, wgInterface) {
    try {
      this._log(`정리: ${namespace}`);

      // 프로세스 종료
      try {
        const pids = execSync(`ip netns pids ${namespace} 2>/dev/null || true`, { encoding: 'utf8' })
          .trim().split('\n').filter(p => p.trim());
        for (const pid of pids) {
          execSync(`kill -9 ${pid} 2>/dev/null || true`, { stdio: 'pipe' });
        }
      } catch (e) { /* 무시 */ }

      // 네임스페이스 내 인터페이스 삭제
      try {
        const nsInterfaces = execSync(`ip -n ${namespace} link show 2>/dev/null || true`, { encoding: 'utf8' });
        const wgInNs = nsInterfaces.match(/wg-\d+/g) || [];
        for (const wg of wgInNs) {
          execSync(`ip -n ${namespace} link del ${wg} 2>/dev/null || true`, { stdio: 'pipe' });
        }
      } catch (e) { /* 무시 */ }

      if (wgInterface) {
        execSync(`ip -n ${namespace} link del ${wgInterface} 2>/dev/null || true`, { stdio: 'pipe' });
      }

      execSync(`ip netns del ${namespace} 2>/dev/null || true`, { stdio: 'pipe' });

      // DNS 설정 파일 정리
      const dnsDir = `/etc/netns/${namespace}`;
      if (fs.existsSync(dnsDir)) {
        fs.rmSync(dnsDir, { recursive: true, force: true });
      }

      execSync(`ip link del ${wgInterface} 2>/dev/null || true`, { stdio: 'pipe' });

      this._log('정리 완료 ✓');
    } catch (e) {
      this._log(`정리 중 오류: ${e.message}`);
    }
  }

  /**
   * VPN 네임스페이스 내에서 공인 IP 확인
   */
  getPublicIp(namespace, timeout = 5) {
    try {
      const ip = execSync(`ip netns exec ${namespace} curl -s --connect-timeout ${timeout} --max-time ${timeout} https://api.ipify.org`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: (timeout + 2) * 1000
      }).trim();
      return ip || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 네임스페이스 존재 여부 확인
   */
  namespaceExists(namespace) {
    try {
      const result = execSync(`ip netns list 2>/dev/null | grep -q "^${namespace}" && echo yes || echo no`, {
        encoding: 'utf8'
      }).trim();
      return result === 'yes';
    } catch (e) {
      return false;
    }
  }

  /**
   * 현재 네임스페이스 목록 조회
   */
  getNamespaceList(prefix = null) {
    try {
      const nsList = execSync('ip netns list 2>/dev/null || true', { encoding: 'utf8' });
      let namespaces = nsList
        .split('\n')
        .map(ns => ns.split(' ')[0].trim())
        .filter(ns => ns.length > 0);

      if (prefix) {
        namespaces = namespaces.filter(ns => ns.startsWith(prefix));
      }

      return namespaces;
    } catch (e) {
      return [];
    }
  }

  /**
   * 모든 VPN 네임스페이스 정리
   */
  cleanupAllNamespaces(prefix) {
    const namespaces = this.getNamespaceList(prefix);
    let cleaned = 0;

    for (const ns of namespaces) {
      this.cleanupNamespace(ns);
      cleaned++;
    }

    return cleaned;
  }
}

export default WireGuardHelper;
