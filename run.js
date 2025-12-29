#!/usr/bin/env node
/**
 * Project Luna - 단일 VPN 쿠키 생성/숙성
 *
 * 사용법:
 *   sudo DISPLAY=:0 node run.js              # 재사용 가능하면 재사용, 아니면 생성
 *   sudo DISPLAY=:0 node run.js --create     # 강제 신규 생성
 *   sudo DISPLAY=:0 node run.js --create=5   # 5개 신규 생성
 *   sudo DISPLAY=:0 node run.js --reuse      # 재사용만 (없으면 종료)
 *   sudo DISPLAY=:0 node run.js --stats      # 현재 IP 통계만 출력
 */

import VpnManager from './lib/vpn/VpnManager.js';
import db from './lib/db/PersonaDB.js';
import SessionRunner from './lib/core/SessionRunner.js';
import ProfileSlot from './lib/core/ProfileSlot.js';
import ChromeVersions from './lib/chrome/ChromeVersions.js';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const FIXED_SEARCH = '아이간식 달빛기정떡';

// === 설정 ===
function parseArgs() {
  const args = process.argv.slice(2);

  // --create=N 파싱
  let createCount = 0;
  const createArg = args.find(a => a.startsWith('--create'));
  if (createArg) {
    const match = createArg.match(/--create=(\d+)/);
    createCount = match ? parseInt(match[1]) : 1;
  }

  return {
    create: createCount > 0,
    createCount: createCount || 1,
    reuse: args.includes('--reuse'),
    stats: args.includes('--stats'),
    help: args.includes('--help'),
    child: args.includes('--child')
  };
}

function showHelp() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║              Project Luna - 쿠키 생성/숙성                     ║
╚══════════════════════════════════════════════════════════════╝

사용법: sudo DISPLAY=:0 node run.js [옵션]

옵션:
  (없음)         자동 모드: 재사용 가능하면 재사용, 아니면 생성
  --create       1개 신규 생성
  --create=N     N개 신규 생성 (VPN 1개로 순차 실행)
  --reuse        재사용만 (재사용 가능한 것 없으면 종료)
  --stats        현재 VPN IP의 페르소나 통계 출력
  --help         도움말

쿠키 재사용 조건:
  1. 동일 IP (created_ip 또는 last_ip)
  2. 1시간 이상 경과 (쿨다운)
  3. status = active
  4. data_backup 존재

예시:
  sudo DISPLAY=:0 node run.js --create=10   # 10개 신규 쿠키 생성
  sudo DISPLAY=:0 node run.js --reuse       # 1시간 지난 쿠키 숙성
`);
}

function getHostname() {
  try {
    return execSync('hostname', { encoding: 'utf8' }).trim() || os.hostname() || 'K00';
  } catch (e) {
    return os.hostname() || 'K00';
  }
}

// === 메인 실행 ===
async function main() {
  const config = parseArgs();

  if (config.help) {
    showHelp();
    return;
  }

  // 자식 프로세스 모드
  if (config.child) {
    await runChild();
    return;
  }

  // 환경 체크
  if (!process.env.DISPLAY) {
    console.log('\n⚠️  DISPLAY 환경변수 필요: sudo DISPLAY=:0 node run.js');
    process.exit(1);
  }

  if (process.getuid?.() !== 0) {
    console.log('\n⚠️  root 권한 필요: sudo DISPLAY=:0 node run.js');
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              Project Luna - 쿠키 생성/숙성                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // VPN 연결
  const agentId = `${getHostname()}-01`;
  console.log(`\n[VPN] 연결 중... (${agentId})`);

  const vpn = new VpnManager({ agentId, purpose: 'luna-single' });
  const connected = await vpn.connect();

  if (!connected) {
    console.log('❌ VPN 연결 실패');
    process.exit(1);
  }

  const vpnIp = vpn.getPublicIp();
  console.log(`✅ VPN 연결: ${vpnIp}`);

  try {
    await db.connect();

    // 통계 모드
    if (config.stats) {
      const stats = await db.getStatsByIp(vpnIp);
      console.log(`\n[IP: ${vpnIp}] 페르소나 현황:`);
      console.log(`  총: ${stats.total}개`);
      console.log(`  재사용 가능: ${stats.reusable}개`);
      console.log(`  쿨다운 중: ${stats.cooling}개`);
      console.log(`  차단됨: ${stats.blocked}개`);
      return;
    }

    // 실행 횟수 결정
    let runCount = 1;
    let forceCreate = config.create;

    if (config.create) {
      runCount = config.createCount;
      console.log(`\n[모드] 신규 생성 ${runCount}개`);
    } else if (config.reuse) {
      const reusable = await db.getReusablePersonas(vpnIp, 1);
      if (reusable.length === 0) {
        console.log('\n❌ 재사용 가능한 페르소나 없음 (쿨다운 또는 IP 불일치)');
        return;
      }
      console.log(`\n[모드] 재사용: ${reusable[0].code} (${reusable[0].id.substring(0, 8)}...)`);
    } else {
      // 자동 모드: 재사용 가능하면 재사용
      const reusable = await db.getReusablePersonas(vpnIp, 1);
      if (reusable.length > 0) {
        console.log(`\n[모드] 자동 → 재사용: ${reusable[0].code}`);
      } else {
        console.log(`\n[모드] 자동 → 신규 생성 (재사용 가능한 것 없음)`);
        forceCreate = true;
      }
    }

    // 실행
    for (let i = 0; i < runCount; i++) {
      if (runCount > 1) {
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`[${i + 1}/${runCount}] 실행 중...`);
      }

      await runSession(vpn, vpnIp, forceCreate);

      // 다음 실행 전 잠시 대기
      if (i < runCount - 1) {
        console.log('   3초 대기...');
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    // 최종 통계
    const stats = await db.getStatsByIp(vpnIp);
    console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
    console.log(`║  완료! IP: ${vpnIp.padEnd(15)} 총: ${String(stats.total).padEnd(3)} 재사용가능: ${stats.reusable}     ║`);
    console.log(`╚══════════════════════════════════════════════════════════════╝`);

  } finally {
    await vpn.cleanup();
    await db.close();
  }
}

// === 단일 세션 실행 ===
async function runSession(vpn, vpnIp, forceCreate) {
  // 페르소나 선택/생성
  let persona;
  if (forceCreate) {
    persona = await db.createPersona(vpnIp);
  } else {
    persona = await db.selectReusable(vpnIp);
    if (!persona) {
      persona = await db.createPersona(vpnIp);
    }
  }

  console.log(`\n[페르소나] ${persona.code} (${persona.id.substring(0, 8)}...)`);
  console.log(`   ${persona.labels.userType} / ${persona.labels.ageGroup} / ${persona.labels.gender}`);
  console.log(`   ${persona.isNew ? '🆕 신규 생성' : '♻️ 재사용'}`);

  // Chrome 버전 (첫 번째 것 사용)
  const chromeVersion = ChromeVersions.list()[0];
  console.log(`[Chrome] ${chromeVersion.majorVersion}`);

  // 자식 프로세스로 실행 (VPN namespace 내부)
  const childEnv = {
    ...process.env,
    VPN_NAMESPACE: vpn.namespace,
    VPN_IP: vpnIp,
    PERSONA_ID: persona.id,
    PERSONA_CODE: persona.code,
    CHROME_VERSION: chromeVersion.fullName,
    FORCE_CREATE: forceCreate ? '1' : '0'
  };

  // 기존 백업 데이터가 있으면 전달
  if (!persona.isNew && persona.dataBackup) {
    childEnv.PERSONA_BACKUP = typeof persona.dataBackup === 'string'
      ? persona.dataBackup
      : JSON.stringify(persona.dataBackup);
  }

  const result = await new Promise((resolve) => {
    const child = spawn('ip', ['netns', 'exec', vpn.namespace, 'node', __filename, '--child'], {
      stdio: ['inherit', 'pipe', 'inherit'],
      env: childEnv
    });

    let output = '';
    child.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      // JSON 결과 외의 출력만 표시
      text.split('\n')
        .filter(l => !l.includes('__RESULT__') && l.trim())
        .forEach(l => console.log(l));
    });

    child.on('close', () => {
      const match = output.match(/__RESULT__(.+?)__END__/);
      resolve(match ? JSON.parse(match[1]) : null);
    });
  });

  // DB 저장
  if (result) {
    await db.updateAfterSession(persona.id, {
      result: result.success ? '성공' : (result.blocked ? '봇탐지' : '에러'),
      dataBackup: result.fileBackup ? JSON.stringify(result.fileBackup) : null,
      storageState: result.storageState,
      vpnIp,
      searchKeyword: FIXED_SEARCH,
      errorMessage: result.error
    });

    console.log(`[결과] ${result.success ? '✅ 성공' : (result.blocked ? '⚠️ 봇탐지' : '❌ 에러')}`);
  }
}

// === 자식 프로세스 (VPN namespace 내부) ===
async function runChild() {
  const vpnIp = process.env.VPN_IP;
  const personaId = process.env.PERSONA_ID;
  const personaCode = process.env.PERSONA_CODE;
  const chromeVersionName = process.env.CHROME_VERSION;
  const backupData = process.env.PERSONA_BACKUP;

  console.log(`[Child] 시작 - ${personaCode} (VPN: ${vpnIp})`);

  // Chrome 버전
  const chromeVersion = ChromeVersions.get(chromeVersionName);

  // ProfileSlot 생성 (임시 슬롯 사용)
  const slot = new ProfileSlot(0, chromeVersionName);
  slot.ensureDir();

  // 백업 복원
  if (backupData) {
    try {
      const backup = JSON.parse(backupData);
      const restoreResult = await slot.restore(backup);
      if (restoreResult.success) {
        console.log(`[Child] 백업 복원 완료`);
      }
    } catch (e) {
      console.log(`[Child] 백업 복원 실패: ${e.message}`);
    }
  }

  // SessionRunner 실행
  const runner = new SessionRunner();
  const { results, profileDataList } = await runner.runFullSession(
    [slot],
    [chromeVersion],
    vpnIp,
    { searchQuery: FIXED_SEARCH }
  );

  // 결과 출력
  const result = {
    success: results.success > 0,
    blocked: results.blocked > 0,
    error: results.error > 0 ? profileDataList[0]?.error : null,
    fileBackup: profileDataList[0]?.fileBackup,
    storageState: profileDataList[0]?.cookies
      ? { cookies: profileDataList[0].cookies, origins: profileDataList[0].origins || [] }
      : null
  };

  console.log(`__RESULT__${JSON.stringify(result)}__END__`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
