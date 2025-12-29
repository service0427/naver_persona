#!/usr/bin/env node
/**
 * Project Luna - 다중 스레드 실행
 *
 * 3 VPN 스레드 × 5 Chrome 버전 = 15 브라우저 동시 실행
 * 각 스레드 완료 후 VPN 토글 (비동기)
 *
 * 사용법:
 *   sudo DISPLAY=:0 node run-multi.js
 *   sudo DISPLAY=:0 node run-multi.js --threads=3 --browsers=5
 *   sudo DISPLAY=:0 node run-multi.js --search="검색어"
 */

import VpnManager from './lib/vpn/VpnManager.js';
import { createContextWithPersona } from './lib/core/browser-launcher.js';
import Persona from './lib/core/Persona.js';
import ChromeVersions from './lib/chrome/ChromeVersions.js';
import db, { FIXED_SEARCH } from './lib/db/Database.js';
import { extractProfileData, extractPreferences } from './lib/utils/profile-extractor.js';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import os from 'os';
import fs from 'fs';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);

// === 호스트명 기반 에이전트 ID 생성 ===
function getHostname() {
  // 1. hostname 명령어 우선 (K05 형태)
  try {
    const hostname = execSync('hostname', { encoding: 'utf8' }).trim();
    if (hostname) return hostname;
  } catch (e) {}

  // 2. os.hostname() 폴백
  return os.hostname() || 'K00';
}

/**
 * 에이전트 ID 생성
 * @param {number} threadIndex - 스레드 인덱스 (0-based)
 * @returns {string} - 예: "K05-01", "K05-02"
 */
function generateAgentId(threadIndex) {
  const hostname = getHostname();
  const threadNum = String(threadIndex + 1).padStart(2, '0');
  return `${hostname}-${threadNum}`;
}

// === 설정 ===
const CONFIG = {
  threads: parseInt(process.env.THREADS || '3'),        // VPN 스레드 수
  browsersPerThread: parseInt(process.env.BROWSERS || '5'),  // 스레드당 브라우저 수
  search: FIXED_SEARCH,  // 고정 검색어: 아이간식 달빛기정떡
  screenWidth: 1920,
  screenHeight: 1080,
  maxThreads: 10  // 최대 스레드 수 (PC 부하 고려)
};

// CLI 파싱
function parseArgs() {
  const args = process.argv.slice(2);
  const getArg = (prefix) => {
    const arg = args.find(a => a.startsWith(prefix + '='));
    return arg ? arg.split('=')[1] : null;
  };

  return {
    threads: parseInt(getArg('--threads') || CONFIG.threads),
    browsers: parseInt(getArg('--browsers') || CONFIG.browsersPerThread),
    search: FIXED_SEARCH,  // 고정
    loop: args.includes('--loop'),
    fresh: !args.includes('--reuse'),  // 기본값: fresh (--reuse로 비활성화)
    help: args.includes('--help')
  };
}

function showHelp() {
  console.log(`
다중 스레드 실행 (2시간 테스트용)

사용법: sudo DISPLAY=:0 node run-multi.js [옵션]

옵션:
  --threads=N    VPN 스레드 수 (기본: 3)
  --browsers=N   스레드당 브라우저 수 (기본: 5)
  --reuse        기존 프로필 재사용 (숙성용)
  --loop         각 스레드 독립 무한 루프 (서로 기다리지 않음)
  --help         도움말

※ 기본값: 매번 새 프로필로 시작 (--reuse 없으면 자동 초기화)

검색어: ${FIXED_SEARCH} (고정)
DB: 220.121.120.83/naver_persona

예시:
  sudo DISPLAY=:0 node run-multi.js                   # 단일 실행 (새 프로필)
  sudo DISPLAY=:0 node run-multi.js --loop            # 무한 루프 (새 프로필)
  sudo DISPLAY=:0 node run-multi.js --loop --reuse    # 무한 루프 (숙성용)
`);
}

// === 창 위치 계산 (vpn_coupang_v1 방식: VPN=열, 브라우저=행) ===
const WINDOW_LAYOUT = {
  X_START: 60,       // 좌측 여백 (우분투 작업표시줄)
  X_SPACING: 520,    // VPN별 가로 간격 (400px 창 + 120px 여백)
  Y_START: 30,       // 상단 여백
  Y_SPACING: 46,     // 브라우저별 세로 간격 (타이틀바만 보이게)
  WIDTH: 400,        // 창 너비
  HEIGHT: 800,       // 창 높이
};

function calculateWindowPosition(threadIndex, browserIndex, totalThreads, browsersPerThread) {
  // X 위치: VPN(스레드)별 열 배치
  const x = WINDOW_LAYOUT.X_START + (threadIndex * WINDOW_LAYOUT.X_SPACING);

  // Y 위치: 브라우저별 행 배치 (46px씩 아래로)
  const y = WINDOW_LAYOUT.Y_START + (browserIndex * WINDOW_LAYOUT.Y_SPACING);

  return {
    x,
    y,
    width: WINDOW_LAYOUT.WIDTH,
    height: WINDOW_LAYOUT.HEIGHT
  };
}

// === 단일 스레드 실행 (VPN namespace 내부) ===
async function runThread(threadId, config, chromeVersions) {
  const vpnIp = process.env.VPN_IP;
  const sessions = [];

  // 부모에서 전달받은 프로필 데이터 (쿠키/스토리지)
  let profileDataMap = {};
  try {
    profileDataMap = JSON.parse(process.env.PROFILE_DATA || '{}');
  } catch (e) {}

  console.log(`\n[Thread-${threadId}] 시작 (VPN: ${vpnIp})`);

  try {
    // 브라우저별 실행 (0.5초 간격)
    for (let i = 0; i < config.browsers; i++) {
      if (i > 0) {
        await new Promise(r => setTimeout(r, 500));  // 0.5초 딜레이
      }

      const chromeVersion = chromeVersions[i % chromeVersions.length];

      // 프로필 경로: data/thread-{id}/chrome-{version}
      const profileDir = path.join(
        './data',
        `thread-${threadId}`,
        chromeVersion.fullName
      );

      // 핑거프린트는 매번 새로 생성 (프로필과 분리)
      const persona = await Persona.createEphemeral('galaxy-s23');

      // 창 위치 계산
      const pos = calculateWindowPosition(threadId, i, config.threads, config.browsers);
      console.log(`   [${i}] Chrome ${chromeVersion.majorVersion} → (${pos.x}, ${pos.y})`);

      // 브라우저 실행
      const session = await createContextWithPersona({
        persona,
        chromeVersion,
        profileDir,  // 직접 프로필 경로 전달
        debugPort: 9222 + (threadId * 10) + i,
        windowPosition: pos
      });

      // DB에서 로드한 쿠키 복원 (히스토리/Preferences는 SQLite에서 이미 유지됨)
      const savedProfile = profileDataMap[chromeVersion.fullName];
      if (savedProfile?.cookies?.length > 0) {
        try {
          await session.context.addCookies(savedProfile.cookies);
          console.log(`      → ${savedProfile.cookies.length}개 쿠키 복원`);
        } catch (e) {
          // 복원 실패 시 무시
        }
      }

      sessions.push({ ...session, persona, chromeVersion, position: pos });
    }

    // 네이버 검색 실행 (병렬)
    console.log(`\n[Thread-${threadId}] 검색 시작 (${sessions.length}개 병렬): "${config.search}"`);

    await Promise.all(sessions.map(async (session) => {
      const { page, persona, chromeVersion } = session;

      try {
        // IP 확인
        await page.goto('https://api.ipify.org', { waitUntil: 'load', timeout: 60000 });
        const browserIp = await page.evaluate(() => document.body.innerText.trim());

        if (browserIp !== vpnIp) {
          console.log(`   ❌ Chrome ${chromeVersion.majorVersion}: IP 불일치`);
          persona._result = 'IP불일치';
          return;
        }

        // 네이버 검색
        await page.goto('https://m.naver.com', { waitUntil: 'load', timeout: 60000 });
        await page.waitForTimeout(1000);

        await page.click('#MM_SEARCH_FAKE');
        await page.waitForTimeout(500);
        await page.fill('#query', config.search);
        await page.press('#query', 'Enter');
        await page.waitForLoadState('load', { timeout: 60000 });
        await page.waitForTimeout(2000);

        // 결과 확인
        const blocked = await page.evaluate(() => {
          const text = document.body.innerText;
          return text.includes('자동입력') || text.includes('보안문자');
        });

        if (blocked) {
          console.log(`   ⚠️ Chrome ${chromeVersion.majorVersion}: 봇 탐지`);
          persona._result = '봇탐지';
        } else {
          console.log(`   ✅ Chrome ${chromeVersion.majorVersion}: 성공`);
          persona._result = '성공';
          await persona.recordUsage('search');
        }

      } catch (error) {
        console.log(`   ❌ Chrome ${chromeVersion.majorVersion}: ${error.message.substring(0, 30)}`);
        persona._result = '에러';
      }
    }));

    // 결과 집계
    const results = {
      success: sessions.filter(s => s.persona._result === '성공').length,
      blocked: sessions.filter(s => s.persona._result === '봇탐지').length,
      error: sessions.filter(s => !['성공', '봇탐지'].includes(s.persona._result)).length
    };

    console.log(`[Thread-${threadId}] 완료: ✅${results.success} ⚠️${results.blocked} ❌${results.error}`);

    // [하이브리드 방식] 브라우저 종료 전에 쿠키 추출 (Playwright API - 복호화된 상태로 접근)
    console.log(`[Thread-${threadId}] 쿠키 추출 (브라우저 종료 전)...`);
    const cookiesMap = {};  // chromeVersion.fullName -> cookies[]
    for (const session of sessions) {
      try {
        const storageState = await session.context.storageState();
        cookiesMap[session.chromeVersion.fullName] = storageState.cookies || [];
      } catch (e) {
        cookiesMap[session.chromeVersion.fullName] = [];
      }
    }

    // 브라우저 종료
    console.log(`[Thread-${threadId}] 브라우저 종료 중...`);
    for (const s of sessions) {
      try { await s.context.close(); } catch (e) {}
    }

    // 브라우저 종료 후 SQLite에서 히스토리 추출 (쿠키는 위에서 이미 추출)
    console.log(`[Thread-${threadId}] 히스토리 추출 (브라우저 종료 후)...`);
    const profileDataList = [];
    for (const session of sessions) {
      try {
        const extracted = extractProfileData(session.profileDir);
        const playwrightCookies = cookiesMap[session.chromeVersion.fullName] || [];
        profileDataList.push({
          threadId,
          chromeVersion: session.chromeVersion.fullName,
          profileDir: session.profileDir,
          vpnIp,  // 사용된 VPN IP
          fingerprint: session.persona.fingerprint,
          cookies: playwrightCookies,   // Playwright API에서 추출 (복호화됨)
          history: extracted.history,    // SQLite에서 추출
          result: session.persona._result
        });
        console.log(`   ${session.chromeVersion.majorVersion}: 쿠키 ${playwrightCookies.length}개, 히스토리 ${extracted.history.length}개`);
      } catch (e) {
        console.log(`   ${session.chromeVersion.majorVersion}: 추출 실패 - ${e.message}`);
      }
    }

    // 결과를 JSON으로 출력 (부모 프로세스에서 수집)
    const sessionData = {
      vpnIp,
      agentId: process.env.VPN_AGENT_ID || `T00-0${threadId + 1}`,
      chromeVersion: sessions[0]?.chromeVersion?.version || 'unknown',
      personas: sessions.map(s => ({
        id: s.persona.id,
        name: s.persona.name,
        baseProfile: s.persona.baseProfile,
        fingerprint: s.persona.fingerprint,
        result: s.persona._result || '미실행',
        profileDir: s.profileDir
      })),
      profileDataList,  // SQLite에서 추출한 데이터
      results
    };

    // 부모 프로세스가 파싱할 수 있도록 특별한 마커와 함께 출력
    console.log(`__RESULT_JSON__${JSON.stringify(sessionData)}__END_JSON__`);

    return results;

  } catch (error) {
    // 에러 시에도 브라우저 정리
    for (const s of sessions) {
      try { await s.context.close(); } catch (e) {}
    }
    throw error;
  }
}

// === 시작 시 정리 (크롬 프로세스, Lock 파일) ===
async function cleanupBeforeStart() {
  const { execSync } = await import('child_process');

  console.log('\n[Cleanup] 시작 전 정리...');

  // 1. 크롬 프로세스 강제 종료
  try {
    // naver_persona 프로필을 사용하는 크롬만 종료
    execSync('pkill -9 -f "user-data-dir=/home/tech/naver_persona/data"', { stdio: 'ignore' });
    console.log('   ✅ 크롬 프로세스 종료');
  } catch (e) {
    // 프로세스가 없으면 에러 - 무시
  }

  // 잠시 대기 (프로세스 정리 시간)
  await new Promise(r => setTimeout(r, 1000));

  // 2. SingletonLock 파일 삭제
  try {
    const lockFiles = execSync('find ./data -name "SingletonLock" 2>/dev/null', { encoding: 'utf8' }).trim();
    if (lockFiles) {
      const count = lockFiles.split('\n').length;
      execSync('find ./data -name "SingletonLock" -delete 2>/dev/null', { stdio: 'ignore' });
      console.log(`   ✅ SingletonLock 파일 ${count}개 삭제`);
    }
  } catch (e) {}

  // 3. 기타 lock 파일 삭제
  try {
    execSync('find ./data -name "lockfile" -delete 2>/dev/null', { stdio: 'ignore' });
    execSync('find ./data -name "*.lock" -delete 2>/dev/null', { stdio: 'ignore' });
  } catch (e) {}

  // 4. 불필요한 ephemeral 페르소나 파일 삭제
  try {
    execSync('rm -rf ./data/personas/ephemeral-* 2>/dev/null', { stdio: 'ignore' });
  } catch (e) {}

  // 5. 소유권 변경 (root → tech)
  try {
    execSync('chown -R tech:tech /home/tech/naver_persona/data/ 2>/dev/null', { stdio: 'ignore' });
  } catch (e) {}

  console.log('   ✅ 정리 완료');
}

// === VPN 토글 (비동기) ===
function toggleVpnAsync(agentId, dongle) {
  if (!dongle || !dongle.serverIp || !dongle.subnet) {
    console.log(`[VPN] 토글 스킵: ${agentId} (dongle 정보 없음)`);
    return;
  }

  const url = `http://${dongle.serverIp}/toggle/${dongle.subnet}`;
  console.log(`[VPN] 토글 요청: ${agentId} → GET ${url}`);

  // 비동기로 토글 API 호출 (GET 방식)
  spawn('curl', ['-s', url], { stdio: 'ignore', detached: true }).unref();
}

// === 단일 스레드 무한 루프 (--loop 모드용) ===
async function runSingleThreadLoop(threadId, agentId, config, chromeVersions) {
  let round = 1;

  while (true) {
    console.log(`\n[Thread-${threadId}] ===== 라운드 ${round} 시작 =====`);

    let vpn = null;
    let sessionData = null;

    try {
      // 1. VPN 연결
      vpn = new VpnManager({
        agentId,
        purpose: `luna-thread-${threadId}`,
        debug: false
      });

      const connected = await vpn.connect();
      if (!connected) {
        console.log(`[Thread-${threadId}] ❌ VPN 연결 실패, 10초 후 재시도`);
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }

      const vpnIp = vpn.getPublicIp();
      console.log(`[Thread-${threadId}] ✅ VPN: ${vpnIp}`);

      // 2. DB에서 프로필 데이터 로드
      let threadProfileData = {};
      try {
        for (const cv of chromeVersions) {
          const profileData = await db.loadProfileData(threadId, cv.fullName);
          if (profileData) {
            threadProfileData[cv.fullName] = profileData;
          }
        }
      } catch (e) {}

      // 3. 자식 프로세스 실행 (VPN namespace 내부)
      const childEnv = {
        ...process.env,
        VPN_NAMESPACE: vpn.namespace,
        VPN_IP: vpnIp,
        VPN_AGENT_ID: agentId,
        THREAD_ID: String(threadId),
        THREADS: String(config.threads),
        BROWSERS: String(config.browsers),
        SEARCH: config.search,
        CHROME_VERSIONS: JSON.stringify(chromeVersions.map(v => v.fullName)),
        PROFILE_DATA: JSON.stringify(threadProfileData)
      };

      sessionData = await new Promise((resolve, reject) => {
        const child = spawn('ip', [
          'netns', 'exec', vpn.namespace,
          'node', __filename, '--child'
        ], {
          stdio: ['inherit', 'pipe', 'inherit'],
          env: childEnv
        });

        let outputBuffer = '';
        child.stdout.on('data', (data) => {
          const text = data.toString();
          outputBuffer += text;
          // 로그 출력 (JSON 마커 제외)
          const lines = text.split('\n');
          for (const line of lines) {
            if (!line.includes('__RESULT_JSON__') && line.trim()) {
              console.log(line);
            }
          }
        });

        child.on('close', (code) => {
          // 결과 JSON 추출
          const jsonMatch = outputBuffer.match(/__RESULT_JSON__(.+?)__END_JSON__/);
          if (jsonMatch) {
            try {
              resolve(JSON.parse(jsonMatch[1]));
            } catch (e) {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        });

        child.on('error', reject);
      });

      // 4. DB 저장 (부모에서 - 메인 네트워크)
      if (sessionData) {
        try {
          await db.logSession(sessionData);

          // 프로필 데이터 저장
          if (sessionData.profileDataList?.length > 0) {
            for (const profileData of sessionData.profileDataList) {
              const preferences = extractPreferences(profileData.profileDir);
              await db.saveProfileData({ ...profileData, preferences });
            }
          }
        } catch (e) {
          console.log(`[Thread-${threadId}] DB 저장 실패: ${e.message}`);
        }
      }

      // 통계 출력
      const results = sessionData?.results || { success: 0, blocked: 0, error: 0 };
      console.log(`[Thread-${threadId}] 라운드 ${round} 완료: ✅${results.success} ⚠️${results.blocked} ❌${results.error}`);

    } catch (error) {
      console.log(`[Thread-${threadId}] 오류: ${error.message}`);
    } finally {
      // 5. VPN 정리 및 토글
      if (vpn) {
        const dongle = vpn.getDongle();
        await vpn.cleanup();
        toggleVpnAsync(agentId, dongle);
      }
    }

    round++;
    // 짧은 대기 (VPN 토글 완료 대기)
    await new Promise(r => setTimeout(r, 3000));
  }
}

// === 부모 프로세스: VPN 연결 및 자식 프로세스 관리 ===
async function runParent(config) {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         Project Luna - 다중 스레드 실행                       ║');
  console.log(`║         ${config.threads} VPN × ${config.browsers} Chrome = ${config.threads * config.browsers} 브라우저              ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // --fresh 플래그: 프로필 초기화 (시크릿 모드처럼 새로 시작)
  if (config.fresh) {
    console.log('\n[Fresh Mode] 프로필 초기화 중...');

    // 1. 디스크 프로필 디렉토리 삭제
    try {
      const dataDir = './data';
      const entries = fs.readdirSync(dataDir, { withFileTypes: true });
      let deletedCount = 0;

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('thread-')) {
          const threadDir = path.join(dataDir, entry.name);
          fs.rmSync(threadDir, { recursive: true, force: true });
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        console.log(`   ✅ ${deletedCount}개 프로필 디렉토리 삭제`);
      }
    } catch (e) {
      console.log(`   ⚠️ 디렉토리 삭제 실패: ${e.message}`);
    }

    // 2. DB profile_data 테이블 초기화
    try {
      await db.connect();
      await db.pool.execute('DELETE FROM profile_data');
      console.log('   ✅ DB profile_data 테이블 초기화');
    } catch (e) {
      console.log(`   ⚠️ DB 초기화 실패: ${e.message}`);
    }
  }

  // Chrome 버전 준비
  const allVersions = ChromeVersions.list();
  if (allVersions.length < config.browsers) {
    console.log(`\n❌ Chrome 버전 부족: ${allVersions.length}개 (필요: ${config.browsers}개)`);
    process.exit(1);
  }

  // 사용할 Chrome 버전 선택 (최신 N개)
  const chromeVersions = allVersions.slice(0, config.browsers);
  console.log(`\n[Chrome] ${chromeVersions.map(v => v.majorVersion).join(', ')}`);

  // 에이전트 ID 생성 (hostname 기반)
  const hostname = getHostname();
  console.log(`[PC] ${hostname} (스레드 ${config.threads}개)`);

  // DB에서 기존 프로필 데이터 로드 (쿠키/스토리지 복원용)
  let profileDataMap = {};  // { 'thread-N/chrome-VER': profileData }
  try {
    await db.connect();
    for (let t = 0; t < config.threads; t++) {
      for (const cv of chromeVersions) {
        const profileData = await db.loadProfileData(t, cv.fullName);
        if (profileData) {
          profileDataMap[`thread-${t}/${cv.fullName}`] = profileData;
        }
      }
    }
    const loadedCount = Object.keys(profileDataMap).length;
    if (loadedCount > 0) {
      console.log(`[DB] ${loadedCount}개 프로필 데이터 로드 완료`);
    }
  } catch (dbError) {
    console.log(`[DB] 프로필 로드 스킵: ${dbError.message}`);
  }

  // 각 스레드 실행
  const vpnManagers = [];
  const childProcesses = [];

  try {
    for (let t = 0; t < config.threads; t++) {
      const agentId = generateAgentId(t);
      console.log(`\n[${t}] VPN 연결: ${agentId}...`);

      const vpn = new VpnManager({
        agentId,
        purpose: `luna-thread-${t}`,
        debug: false
      });

      const connected = await vpn.connect();
      if (!connected) {
        console.log(`   ❌ VPN 연결 실패`);
        continue;
      }

      const vpnIp = vpn.getPublicIp();
      console.log(`   ✅ ${vpnIp} (${vpn.namespace})`);
      vpnManagers.push(vpn);

      // 이 스레드의 프로필 데이터 추출
      const threadProfileData = {};
      for (const cv of chromeVersions) {
        const key = `thread-${t}/${cv.fullName}`;
        if (profileDataMap[key]) {
          threadProfileData[cv.fullName] = profileDataMap[key];
        }
      }

      // 자식 프로세스 실행 (VPN namespace 내부)
      const childEnv = {
        ...process.env,
        VPN_NAMESPACE: vpn.namespace,
        VPN_IP: vpnIp,
        THREAD_ID: String(t),
        THREADS: String(config.threads),
        BROWSERS: String(config.browsers),
        SEARCH: config.search,
        CHROME_VERSIONS: JSON.stringify(chromeVersions.map(v => v.fullName)),
        PROFILE_DATA: JSON.stringify(threadProfileData)  // 쿠키/스토리지 데이터
      };

      const child = spawn('ip', [
        'netns', 'exec', vpn.namespace,
        'node', __filename, '--child'
      ], {
        stdio: ['inherit', 'pipe', 'inherit'],  // stdout만 캡처
        env: childEnv
      });

      // stdout 데이터 수집
      let outputBuffer = '';
      child.stdout.on('data', (data) => {
        const text = data.toString();
        outputBuffer += text;
        // 일반 로그는 그대로 출력 (JSON 마커 제외)
        const lines = text.split('\n');
        for (const line of lines) {
          if (!line.includes('__RESULT_JSON__') && line.trim()) {
            console.log(line);
          }
        }
      });

      childProcesses.push({ child, vpn, agentId, getOutput: () => outputBuffer });
    }

    // 모든 자식 프로세스 완료 대기 및 결과 수집
    console.log('\n[대기] 모든 스레드 완료 대기...');

    const allResults = [];

    await Promise.all(childProcesses.map(({ child, vpn, agentId, getOutput }) =>
      new Promise(resolve => {
        child.on('close', async (code) => {
          console.log(`[완료] Thread (${agentId}) - exit: ${code}`);

          // 자식 출력에서 결과 JSON 추출
          const output = getOutput();
          const jsonMatch = output.match(/__RESULT_JSON__(.+?)__END_JSON__/);
          if (jsonMatch) {
            try {
              const sessionData = JSON.parse(jsonMatch[1]);
              allResults.push(sessionData);
            } catch (e) {
              console.log(`[${agentId}] 결과 파싱 실패: ${e.message}`);
            }
          }

          // VPN 정리 전에 dongle 정보 저장
          const dongle = vpn.getDongle();

          // VPN 정리
          await vpn.cleanup();

          // VPN 토글 (비동기)
          toggleVpnAsync(agentId, dongle);

          resolve();
        });
      })
    ));

    // 부모 프로세스에서 DB 저장 (메인 네트워크 사용)
    if (allResults.length > 0) {
      console.log(`\n[DB] ${allResults.length}개 세션 저장 중...`);
      try {
        await db.connect();

        // 1. 세션 로그 저장
        for (const sessionData of allResults) {
          await db.logSession(sessionData);
        }
        console.log(`[DB] ✅ ${allResults.length}개 세션 저장 완료`);

        // 2. 프로필 데이터 저장 (쿠키, 히스토리, preferences)
        let profileSaved = 0;
        for (const sessionData of allResults) {
          if (sessionData.profileDataList && sessionData.profileDataList.length > 0) {
            for (const profileData of sessionData.profileDataList) {
              try {
                // 부모에서 preferences 직접 추출 (자식에서 전달받은 profileDir 사용)
                const preferences = extractPreferences(profileData.profileDir);
                await db.saveProfileData({
                  ...profileData,
                  preferences
                });
                profileSaved++;
              } catch (e) {
                // 개별 프로필 저장 실패는 무시
              }
            }
          }
        }
        if (profileSaved > 0) {
          console.log(`[DB] ✅ ${profileSaved}개 프로필 데이터 저장 완료`);
        }

      } catch (dbError) {
        console.log(`[DB] ❌ 저장 실패: ${dbError.message}`);
      }
    }

    // 전체 통계
    const totalResults = allResults.reduce((acc, r) => ({
      success: acc.success + (r.results?.success || 0),
      blocked: acc.blocked + (r.results?.blocked || 0),
      error: acc.error + (r.results?.error || 0)
    }), { success: 0, blocked: 0, error: 0 });

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                       모든 스레드 완료                         ║');
    console.log(`║            ✅ ${totalResults.success}  ⚠️ ${totalResults.blocked}  ❌ ${totalResults.error}                           ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');

    return 0;

  } catch (error) {
    console.error('오류:', error);
    return 1;

  } finally {
    // 정리
    for (const vpn of vpnManagers) {
      try { await vpn.cleanup(); } catch (e) {}
    }

    // data 폴더 소유권 변경 (root → tech)
    try {
      const { execSync } = await import('child_process');
      execSync('chown -R tech:tech /home/tech/naver_persona/data/', { stdio: 'ignore' });
    } catch (e) {}
  }
}

// === 자식 프로세스: VPN namespace 내부에서 실행 ===
async function runChild() {
  const threadId = parseInt(process.env.THREAD_ID);
  const config = {
    threads: parseInt(process.env.THREADS),
    browsers: parseInt(process.env.BROWSERS),
    search: process.env.SEARCH
  };

  // Chrome 버전 파싱
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

  // 환경 확인
  if (!process.env.DISPLAY) {
    console.log('\n⚠️  DISPLAY 환경변수 필요: sudo DISPLAY=:0 node run-multi.js');
    process.exit(1);
  }

  if (process.getuid && process.getuid() !== 0) {
    console.log('\n⚠️  root 권한 필요: sudo DISPLAY=:0 node run-multi.js');
    process.exit(1);
  }

  // 자식 모드 (VPN namespace 내부)
  if (process.argv.includes('--child')) {
    await runChild();
    return;
  }

  // === 부모 모드: 시작 전 정리 ===
  await cleanupBeforeStart();

  // 부모 모드
  if (config.loop) {
    // 반복 실행: 각 스레드가 독립적으로 무한 루프
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║         Project Luna - 독립 스레드 루프 모드                   ║');
    console.log(`║         ${config.threads} VPN × ${config.browsers} Chrome (각 스레드 독립 실행)     ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');

    // --fresh 플래그 처리
    if (config.fresh) {
      console.log('\n[Fresh Mode] 프로필 초기화 중...');
      try {
        const dataDir = './data';
        const entries = fs.readdirSync(dataDir, { withFileTypes: true });
        let deletedCount = 0;
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.startsWith('thread-')) {
            fs.rmSync(path.join(dataDir, entry.name), { recursive: true, force: true });
            deletedCount++;
          }
        }
        if (deletedCount > 0) console.log(`   ✅ ${deletedCount}개 프로필 디렉토리 삭제`);
      } catch (e) {}

      try {
        await db.connect();
        await db.pool.execute('DELETE FROM profile_data');
        console.log('   ✅ DB profile_data 테이블 초기화');
      } catch (e) {}
    }

    // Chrome 버전 준비
    const allVersions = ChromeVersions.list();
    const chromeVersions = allVersions.slice(0, config.browsers);
    console.log(`\n[Chrome] ${chromeVersions.map(v => v.majorVersion).join(', ')}`);

    // 에이전트 ID (hostname 기반)
    const hostname = getHostname();
    console.log(`[PC] ${hostname} (스레드 ${config.threads}개)`);

    // DB 연결
    await db.connect();

    // 각 스레드 독립 루프 시작 (await 없이!)
    console.log('\n[시작] 각 스레드 독립 루프 시작...\n');
    for (let t = 0; t < config.threads; t++) {
      const agentId = generateAgentId(t);
      // 비동기로 시작 (await 없음)
      runSingleThreadLoop(t, agentId, config, chromeVersions)
        .catch(err => console.error(`[Thread-${t}] 치명적 오류:`, err));

      // 스레드 간 시작 간격 (충돌 방지)
      await new Promise(r => setTimeout(r, 2000));
    }

    // 무한 대기 (Ctrl+C로 종료)
    console.log('[메인] 모든 스레드 독립 실행 중... (Ctrl+C로 종료)');
    await new Promise(() => {});

  } else {
    // 단일 실행
    const exitCode = await runParent(config);
    process.exit(exitCode);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
