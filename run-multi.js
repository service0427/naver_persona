#!/usr/bin/env node
/**
 * Project Luna - 다중 스레드 쿠키 생성
 *
 * 3 VPN 스레드 × 5 브라우저 = 15개 쿠키 동시 생성
 *
 * 사용법:
 *   sudo DISPLAY=:0 node run-multi.js
 *   sudo DISPLAY=:0 node run-multi.js --threads=3 --browsers=5
 *   sudo DISPLAY=:0 node run-multi.js --loop
 */

import VpnManager from './lib/vpn/VpnManager.js';
import ChromeVersions from './lib/chrome/ChromeVersions.js';
import db from './lib/db/PersonaDB.js';

const FIXED_SEARCH = '아이간식 달빛기정떡';
import ProfileSlot, { createSlotGrid, resetAllSlots } from './lib/core/ProfileSlot.js';
import SessionRunner from './lib/core/SessionRunner.js';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import os from 'os';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);

// === 설정 ===
const CONFIG = {
  threads: parseInt(process.env.THREADS || '3'),
  browsersPerThread: parseInt(process.env.BROWSERS || '5'),
  search: FIXED_SEARCH,
  maxThreads: 10
};

const WINDOW_LAYOUT = {
  X_START: 60,
  X_SPACING: 520,
  Y_START: 30,
  Y_SPACING: 46,
  WIDTH: 400,
  HEIGHT: 800,
};

// === 유틸리티 ===
function getHostname() {
  try {
    return execSync('hostname', { encoding: 'utf8' }).trim() || os.hostname() || 'K00';
  } catch (e) {
    return os.hostname() || 'K00';
  }
}

function generateAgentId(threadIndex) {
  return `${getHostname()}-${String(threadIndex + 1).padStart(2, '0')}`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const getArg = (prefix) => {
    const arg = args.find(a => a.startsWith(prefix + '='));
    return arg ? arg.split('=')[1] : null;
  };

  return {
    threads: parseInt(getArg('--threads') || CONFIG.threads),
    browsers: parseInt(getArg('--browsers') || CONFIG.browsersPerThread),
    search: FIXED_SEARCH,
    loop: args.includes('--loop'),
    help: args.includes('--help')
  };
}

function showHelp() {
  console.log(`
다중 스레드 쿠키 생성

사용법: sudo DISPLAY=:0 node run-multi.js [옵션]

옵션:
  --threads=N    VPN 스레드 수 (기본: 3)
  --browsers=N   스레드당 브라우저 수 (기본: 5)
  --loop         각 스레드 독립 무한 루프
  --help         도움말

예시:
  sudo DISPLAY=:0 node run-multi.js                    # 15개 쿠키 생성 (3×5)
  sudo DISPLAY=:0 node run-multi.js --threads=1        # 5개 쿠키 생성 (1×5)
  sudo DISPLAY=:0 node run-multi.js --loop             # 무한 루프 생성
`);
}

// === 시작 전 정리 ===
async function cleanupBeforeStart() {
  console.log('\n[Cleanup] 시작 전 정리...');

  try {
    execSync('pkill -9 -f "user-data-dir=/home/tech/naver_persona/data"', { stdio: 'ignore' });
    console.log('   ✅ 크롬 프로세스 종료');
  } catch (e) {}

  await new Promise(r => setTimeout(r, 1000));

  try {
    execSync('find ./data -name "SingletonLock" -delete 2>/dev/null', { stdio: 'ignore' });
    execSync('find ./data -name "lockfile" -delete 2>/dev/null', { stdio: 'ignore' });
    execSync('chown -R tech:tech /home/tech/naver_persona/data/ 2>/dev/null', { stdio: 'ignore' });
  } catch (e) {}

  console.log('   ✅ 정리 완료');
}

// === VPN 토글 (비동기) ===
function toggleVpnAsync(agentId, dongle) {
  if (!dongle?.serverIp || !dongle?.subnet) return;

  const url = `http://${dongle.serverIp}/toggle/${dongle.subnet}`;
  console.log(`[VPN] 토글 요청: ${agentId}`);
  spawn('curl', ['-s', url], { stdio: 'ignore', detached: true }).unref();
}

// === 단일 스레드 실행 (VPN namespace 내부) ===
async function runThread(threadId, config, chromeVersions) {
  const vpnIp = process.env.VPN_IP;

  console.log(`\n[Thread-${threadId}] 시작 (VPN: ${vpnIp})`);

  // 슬롯 생성 (항상 새 프로필)
  const slots = chromeVersions.map(cv => new ProfileSlot(threadId, cv.fullName));

  // 프로필 디렉토리 전체 초기화 (새 페르소나 - 깨끗한 상태에서 시작)
  for (const slot of slots) {
    slot.fullReset();
    slot.ensureDir();
  }

  // SessionRunner로 실행
  const runner = new SessionRunner();
  const { results, profileDataList } = await runner.runFullSession(
    slots,
    chromeVersions,
    vpnIp,
    {
      searchQuery: config.search,
      windowLayout: WINDOW_LAYOUT
    }
  );

  console.log(`[Thread-${threadId}] 완료: ✅${results.success} ⚠️${results.blocked} ❌${results.error}`);
  runner.printSummary();

  // 결과를 임시 파일로 전달 (stdout 오염 방지)
  const resultFile = `/tmp/luna-result-${threadId}-${Date.now()}.json`;
  const sessionData = {
    vpnIp,
    agentId: process.env.VPN_AGENT_ID || generateAgentId(threadId),
    results,
    profileDataList: profileDataList.map(p => ({
      ...p,
      fileBackup: p.fileBackup || null  // 백업 데이터 포함
    }))
  };

  fs.writeFileSync(resultFile, JSON.stringify(sessionData));

  // 결과 파일 경로만 출력
  console.log(`__RESULT_FILE__${resultFile}__END__`);
  return results;
}

// === 단일 스레드 무한 루프 ===
async function runSingleThreadLoop(threadId, agentId, config, chromeVersions) {
  let round = 1;

  while (true) {
    console.log(`\n[Thread-${threadId}] ===== 라운드 ${round} =====`);

    let vpn = null;

    try {
      // VPN 연결
      vpn = new VpnManager({ agentId, purpose: `luna-thread-${threadId}` });
      const connected = await vpn.connect();

      if (!connected) {
        console.log(`[Thread-${threadId}] ❌ VPN 연결 실패, 10초 후 재시도`);
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }

      const vpnIp = vpn.getPublicIp();
      console.log(`[Thread-${threadId}] ✅ VPN: ${vpnIp}`);

      // 슬롯 생성 (항상 새 프로필)
      const slots = chromeVersions.map(cv => new ProfileSlot(threadId, cv.fullName));

      // 자식 프로세스 실행
      const childEnv = {
        ...process.env,
        VPN_NAMESPACE: vpn.namespace,
        VPN_IP: vpnIp,
        VPN_AGENT_ID: agentId,
        THREAD_ID: String(threadId),
        THREADS: String(config.threads),
        BROWSERS: String(config.browsers),
        SEARCH: config.search,
        CHROME_VERSIONS: JSON.stringify(chromeVersions.map(v => v.fullName))
      };

      const sessionData = await new Promise((resolve) => {
        const child = spawn('ip', ['netns', 'exec', vpn.namespace, 'node', __filename, '--child'], {
          stdio: ['inherit', 'pipe', 'inherit'],
          env: childEnv
        });

        let resultFile = null;
        child.stdout.on('data', (data) => {
          const text = data.toString();
          // 결과 파일 경로 추출
          const match = text.match(/__RESULT_FILE__(.+?)__END__/);
          if (match) resultFile = match[1];
          // 결과 파일 라인 제외하고 출력
          text.split('\n').filter(l => !l.includes('__RESULT_FILE__') && l.trim()).forEach(l => console.log(l));
        });

        child.on('close', () => {
          if (resultFile && fs.existsSync(resultFile)) {
            try {
              const data = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
              fs.unlinkSync(resultFile);  // 임시 파일 삭제
              resolve(data);
            } catch (e) {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        });
      });

      // DB 저장 - 새 페르소나 생성
      if (sessionData?.profileDataList) {
        try {
          for (const data of sessionData.profileDataList) {
            if (data.result === '성공' || data.fileBackup) {
              await db.saveProfileData({ ...data, vpnIp });
            }
          }
          console.log(`[Thread-${threadId}] DB 저장 완료`);
        } catch (e) {
          console.log(`[Thread-${threadId}] DB 저장 실패: ${e.message}`);
        }
      }

      const r = sessionData?.results || { success: 0, blocked: 0, error: 0 };
      console.log(`[Thread-${threadId}] 라운드 ${round} 완료: ✅${r.success} ⚠️${r.blocked} ❌${r.error}`);

    } catch (error) {
      console.log(`[Thread-${threadId}] 오류: ${error.message}`);
    } finally {
      if (vpn) {
        const dongle = vpn.getDongle();
        await vpn.cleanup();
        toggleVpnAsync(agentId, dongle);
      }
    }

    round++;
    await new Promise(r => setTimeout(r, 3000));
  }
}

// === 부모 프로세스 ===
async function runParent(config) {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         Project Luna - 다중 스레드 쿠키 생성                   ║');
  console.log(`║         ${config.threads} VPN × ${config.browsers} 브라우저 = ${config.threads * config.browsers} 쿠키              ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Chrome 버전 로드
  // major 버전별로 하나씩만 선택 (다양한 버전 사용: 143, 142, 141, ...)
  const allVersions = ChromeVersions.listUniqueMajors(config.browsers);
  if (allVersions.length < config.browsers) {
    console.log(`\n❌ Chrome 버전 부족: ${allVersions.length}개 (필요: ${config.browsers}개)`);
    process.exit(1);
  }
  const chromeVersions = allVersions.slice(0, config.browsers);

  // 슬롯 그리드 생성
  const slotGrid = createSlotGrid(config.threads, chromeVersions);

  // 프로필 초기화 (항상 새 프로필)
  console.log('\n[초기화] 프로필 디렉토리 정리...');
  const { resetCount, deletedCount } = resetAllSlots(slotGrid);
  if (resetCount > 0) {
    console.log(`   ✅ ${resetCount}개 프로필 초기화 (${deletedCount}개 파일 삭제)`);
  }

  console.log(`\n[Chrome] ${chromeVersions.map(v => v.majorVersion).join(', ')}`);
  console.log(`[PC] ${getHostname()} (스레드 ${config.threads}개)`);

  // DB 연결
  await db.connect();

  // 스레드별 실행
  const vpnManagers = [];
  const childProcesses = [];

  try {
    for (let t = 0; t < config.threads; t++) {
      const agentId = generateAgentId(t);
      console.log(`\n[${t}] VPN 연결: ${agentId}...`);

      const vpn = new VpnManager({ agentId, purpose: `luna-thread-${t}` });
      const connected = await vpn.connect();

      if (!connected) {
        console.log(`   ❌ VPN 연결 실패`);
        continue;
      }

      const vpnIp = vpn.getPublicIp();
      console.log(`   ✅ ${vpnIp} (${vpn.namespace})`);
      vpnManagers.push({ vpn, vpnIp, agentId });

      // 자식 프로세스 실행
      const childEnv = {
        ...process.env,
        VPN_NAMESPACE: vpn.namespace,
        VPN_IP: vpnIp,
        VPN_AGENT_ID: agentId,
        THREAD_ID: String(t),
        THREADS: String(config.threads),
        BROWSERS: String(config.browsers),
        SEARCH: config.search,
        CHROME_VERSIONS: JSON.stringify(chromeVersions.map(v => v.fullName))
      };

      const child = spawn('ip', ['netns', 'exec', vpn.namespace, 'node', __filename, '--child'], {
        stdio: ['inherit', 'pipe', 'inherit'],
        env: childEnv
      });

      let resultFile = null;
      child.stdout.on('data', (data) => {
        const text = data.toString();
        // 결과 파일 경로 추출
        const match = text.match(/__RESULT_FILE__(.+?)__END__/);
        if (match) resultFile = match[1];
        // 결과 파일 라인 제외하고 출력
        text.split('\n').filter(l => !l.includes('__RESULT_FILE__') && l.trim()).forEach(l => console.log(l));
      });

      childProcesses.push({ child, vpn, vpnIp, agentId, getResultFile: () => resultFile });
    }

    // 완료 대기
    console.log('\n[대기] 모든 스레드 완료 대기...');
    const allResults = [];

    await Promise.all(childProcesses.map(({ child, vpn, vpnIp, agentId, getResultFile }) =>
      new Promise(resolve => {
        child.on('close', async () => {
          const resultFile = getResultFile();
          if (resultFile && fs.existsSync(resultFile)) {
            try {
              const sessionData = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
              sessionData.vpnIp = vpnIp;
              allResults.push(sessionData);
              fs.unlinkSync(resultFile);  // 임시 파일 삭제
            } catch (e) {}
          }

          const dongle = vpn.getDongle();
          await vpn.cleanup();
          toggleVpnAsync(agentId, dongle);
          resolve();
        });
      })
    ));

    // DB 저장 - 새 페르소나 생성
    let savedCount = 0;
    if (allResults.length > 0) {
      console.log(`\n[DB] ${allResults.length}개 세션 저장 중...`);
      try {
        for (const sessionData of allResults) {
          if (sessionData.profileDataList) {
            for (const data of sessionData.profileDataList) {
              if (data.result === '성공' || data.fileBackup) {
                await db.saveProfileData({ ...data, vpnIp: sessionData.vpnIp });
                savedCount++;
              }
            }
          }
        }
        console.log(`[DB] ✅ ${savedCount}개 페르소나 저장 완료`);
      } catch (e) {
        console.log(`[DB] ❌ 저장 실패: ${e.message}`);
      }
    }

    // 통계
    const total = allResults.reduce((acc, r) => ({
      success: acc.success + (r.results?.success || 0),
      blocked: acc.blocked + (r.results?.blocked || 0),
      error: acc.error + (r.results?.error || 0)
    }), { success: 0, blocked: 0, error: 0 });

    // DB 전체 통계
    const stats = await db.getStats();

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                       완료                                    ║');
    console.log(`║   이번 실행: ✅ ${total.success}  ⚠️ ${total.blocked}  ❌ ${total.error}                            ║`);
    console.log(`║   DB 총계:   ${stats.totals.total}개 페르소나 (active: ${stats.totals.active_count})           ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');

    return 0;

  } finally {
    for (const { vpn } of vpnManagers) {
      try { await vpn.cleanup(); } catch (e) {}
    }
    try {
      execSync('chown -R tech:tech /home/tech/naver_persona/data/', { stdio: 'ignore' });
    } catch (e) {}
  }
}

// === 자식 프로세스 ===
async function runChild() {
  const threadId = parseInt(process.env.THREAD_ID);
  const config = {
    threads: parseInt(process.env.THREADS),
    browsers: parseInt(process.env.BROWSERS),
    search: process.env.SEARCH
  };

  const chromeVersionNames = JSON.parse(process.env.CHROME_VERSIONS);
  const chromeVersions = chromeVersionNames.map(name => ChromeVersions.get(name));

  await runThread(threadId, config, chromeVersions);
}

// === 메인 ===
async function main() {
  const config = parseArgs();

  if (config.help) {
    showHelp();
    return;
  }

  if (!process.env.DISPLAY) {
    console.log('\n⚠️  DISPLAY 환경변수 필요: sudo DISPLAY=:0 node run-multi.js');
    process.exit(1);
  }

  if (process.getuid?.() !== 0) {
    console.log('\n⚠️  root 권한 필요: sudo DISPLAY=:0 node run-multi.js');
    process.exit(1);
  }

  // 자식 모드
  if (process.argv.includes('--child')) {
    await runChild();
    return;
  }

  // 부모 모드
  await cleanupBeforeStart();

  if (config.loop) {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║         Project Luna - 무한 루프 쿠키 생성                     ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    // major 버전별로 하나씩만 선택 (다양한 버전 사용)
    const chromeVersions = ChromeVersions.listUniqueMajors(config.browsers);

    console.log(`\n[Chrome] ${chromeVersions.map(v => v.majorVersion).join(', ')}`);
    console.log(`[PC] ${getHostname()} (스레드 ${config.threads}개)`);

    await db.connect();

    console.log('\n[시작] 각 스레드 독립 루프 시작...\n');
    for (let t = 0; t < config.threads; t++) {
      const agentId = generateAgentId(t);
      runSingleThreadLoop(t, agentId, config, chromeVersions)
        .catch(err => console.error(`[Thread-${t}] 치명적 오류:`, err));
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log('[메인] 모든 스레드 독립 실행 중... (Ctrl+C로 종료)');
    await new Promise(() => {});

  } else {
    const exitCode = await runParent(config);
    process.exit(exitCode);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
