#!/usr/bin/env node
/**
 * Project Luna - 통합 실행 파일
 *
 * VPN 보호 하에 네이버 페르소나 쿠키 숙성
 * 자동으로 VPN namespace 안에서 브라우저 실행
 *
 * 사용법:
 *   sudo DISPLAY=:0 node run.js                        # 새 페르소나 생성 (Galaxy S23+)
 *   sudo DISPLAY=:0 node run.js --profile=pc-chrome    # 특정 프로필로 새 페르소나
 *   sudo DISPLAY=:0 node run.js --persona=persona-xxx  # 기존 페르소나 로드
 *   sudo DISPLAY=:0 node run.js --list                 # 페르소나 목록 조회
 *   sudo DISPLAY=:0 node run.js --search="검색어"       # 특정 검색어
 *   sudo DISPLAY=:0 node run.js --multi=2              # 다중 페르소나 (N개 동시)
 *   sudo DISPLAY=:0 node run.js --agent=T00-02         # 다른 VPN agent
 *
 * 프로필 (새 페르소나 생성 시):
 *   galaxy-s23, iphone-15, pixel-8, pc-chrome, pc-edge
 *
 * 페르소나 시스템:
 *   - 각 페르소나는 고유 ID와 핑거프린트를 가짐
 *   - 같은 프로필도 미세하게 다른 핑거프린트로 변형됨
 *   - data/personas/{persona-id}/ 에 개별 저장
 */

import VpnManager from './lib/vpn/VpnManager.js';
import { createContextWithPersona } from './lib/core/browser-launcher.js';
import { PROFILE_IDS } from './lib/devices/profiles.js';
import Persona from './lib/core/Persona.js';
import ChromeVersions from './lib/chrome/ChromeVersions.js';
import sharedCacheManager from './lib/cache/SharedCacheManager.js';
import db, { FIXED_SEARCH } from './lib/db/Database.js';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);

const LOG_DIR = path.resolve('./data/logs');
const LOG_FILE = path.join(LOG_DIR, 'sessions.log');

// === 프로필 초기화 (쿠키/히스토리 삭제, 핑거프린트 유지) ===
function resetProfileData(profileDir) {
  if (!fs.existsSync(profileDir)) {
    console.log(`   프로필 없음 (신규 생성됨)`);
    return;
  }

  const defaultDir = path.join(profileDir, 'Default');
  if (!fs.existsSync(defaultDir)) {
    console.log(`   Default 폴더 없음`);
    return;
  }

  // 삭제할 파일/폴더 목록 (쿠키, 히스토리, 캐시 등)
  const toDelete = [
    'Cookies',
    'Cookies-journal',
    'History',
    'History-journal',
    'Login Data',
    'Login Data-journal',
    'Web Data',
    'Web Data-journal',
    'Visited Links',
    'Network Action Predictor',
    'Top Sites',
    'Favicons',
    'Cache',
    'Code Cache',
    'GPUCache',
    'Session Storage',
    'Local Storage',
    'IndexedDB',
    'Service Worker',
  ];

  let deleted = 0;
  for (const name of toDelete) {
    const target = path.join(defaultDir, name);
    if (fs.existsSync(target)) {
      try {
        const stat = fs.statSync(target);
        if (stat.isDirectory()) {
          fs.rmSync(target, { recursive: true, force: true });
        } else {
          fs.unlinkSync(target);
        }
        deleted++;
      } catch (e) {
        console.log(`   ⚠️ 삭제 실패: ${name}`);
      }
    }
  }

  // SingletonLock 파일도 삭제 (이전 세션 잠금 해제)
  const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
  for (const lock of lockFiles) {
    const lockPath = path.join(profileDir, lock);
    if (fs.existsSync(lockPath)) {
      try { fs.unlinkSync(lockPath); } catch (e) {}
    }
  }

  console.log(`   ✅ ${deleted}개 항목 삭제됨 (핑거프린트 유지)`);
}

// === 세션 로그 기록 ===
async function logSession(data) {
  fs.mkdirSync(LOG_DIR, { recursive: true });

  const timestamp = new Date().toISOString();
  const date = timestamp.split('T')[0];
  const time = timestamp.split('T')[1].split('.')[0];

  const logEntry = [
    `═══════════════════════════════════════════════════════════════`,
    `[${date} ${time}]`,
    ``,
    `VPN IP:     ${data.vpnIp}`,
    `Agent:      ${data.agentId}`,
    `Chrome:     ${data.chromeVersion}`,
    `검색어:     ${FIXED_SEARCH}`,
    ``,
    `페르소나:`,
    ...data.personas.map(p =>
      `  - ${p.id} (${p.baseProfile})\n` +
      `    cores=${p.fingerprint.navigator.hardwareConcurrency}, ` +
      `mem=${p.fingerprint.navigator.deviceMemory}GB, ` +
      `screen=${p.fingerprint.screen.width}x${p.fingerprint.screen.height}\n` +
      `    결과: ${p.result}`
    ),
    ``,
    `프로필 경로:`,
    ...data.profileDirs.map(d => `  - ${d}`),
    ``,
  ].join('\n');

  // 텍스트 로그 저장
  fs.appendFileSync(LOG_FILE, logEntry + '\n');
  const dailyLog = path.join(LOG_DIR, `${date}.log`);
  fs.appendFileSync(dailyLog, logEntry + '\n');

  // DB 저장
  try {
    await db.connect();
    await db.logSession(data);
    console.log(`\n📝 로그 저장: ${LOG_FILE} + DB`);
  } catch (dbError) {
    console.log(`\n📝 로그 저장: ${LOG_FILE} (DB 실패: ${dbError.message})`);
  }
}

// === 프로필 데이터 분석 ===
function analyzeProfile(profileDir, profileId) {
  console.log(`\n   ─── ${profileId} 프로필 데이터 ───`);
  console.log(`   📁 ${profileDir}`);

  // 1. Cookies
  const cookiesPath = path.join(profileDir, 'Default', 'Cookies');
  if (fs.existsSync(cookiesPath)) {
    try {
      const db = new Database(cookiesPath, { readonly: true });
      const cookies = db.prepare(`
        SELECT host_key, name, value, expires_utc, is_secure, is_httponly
        FROM cookies
        ORDER BY last_access_utc DESC
        LIMIT 10
      `).all();
      db.close();

      console.log(`\n   [쿠키] ${cookies.length}개 (상위 10개)`);
      cookies.forEach(c => {
        const secure = c.is_secure ? '🔒' : '';
        const httpOnly = c.is_httponly ? '📛' : '';
        console.log(`      ${c.host_key}: ${c.name}=${(c.value || '').substring(0, 20)}... ${secure}${httpOnly}`);
      });

      // 네이버 쿠키 특별 표시
      const naverCookies = db.prepare ? null : cookies.filter(c => c.host_key.includes('naver'));
    } catch (e) {
      console.log(`   [쿠키] 읽기 실패: ${e.message}`);
    }
  } else {
    console.log(`   [쿠키] 파일 없음`);
  }

  // 2. History
  const historyPath = path.join(profileDir, 'Default', 'History');
  if (fs.existsSync(historyPath)) {
    try {
      const db = new Database(historyPath, { readonly: true });
      const visits = db.prepare(`
        SELECT url, title, visit_count, last_visit_time
        FROM urls
        ORDER BY last_visit_time DESC
        LIMIT 5
      `).all();
      db.close();

      console.log(`\n   [방문기록] 최근 ${visits.length}개`);
      visits.forEach(v => {
        const title = (v.title || '').substring(0, 30);
        const url = v.url.substring(0, 50);
        console.log(`      ${title || url}... (${v.visit_count}회)`);
      });
    } catch (e) {
      console.log(`   [방문기록] 읽기 실패: ${e.message}`);
    }
  }

  // 3. Local Storage (LevelDB - 파일 존재 여부만)
  const localStoragePath = path.join(profileDir, 'Default', 'Local Storage', 'leveldb');
  if (fs.existsSync(localStoragePath)) {
    const files = fs.readdirSync(localStoragePath);
    const logFiles = files.filter(f => f.endsWith('.log') || f.endsWith('.ldb'));
    console.log(`\n   [로컬스토리지] ${logFiles.length}개 파일`);
  }

  // 4. Session Storage
  const sessionStoragePath = path.join(profileDir, 'Default', 'Session Storage');
  if (fs.existsSync(sessionStoragePath)) {
    const files = fs.readdirSync(sessionStoragePath);
    console.log(`   [세션스토리지] ${files.length}개 파일`);
  }

  // 5. Preferences (핑거프린트 관련 설정)
  const prefsPath = path.join(profileDir, 'Default', 'Preferences');
  if (fs.existsSync(prefsPath)) {
    try {
      const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
      console.log(`\n   [Preferences]`);
      if (prefs.profile) {
        console.log(`      이름: ${prefs.profile.name || '없음'}`);
      }
      if (prefs.intl) {
        console.log(`      언어: ${prefs.intl.accept_languages || '없음'}`);
      }
      if (prefs.webkit?.webprefs) {
        console.log(`      폰트: ${prefs.webkit.webprefs.default_font_size || '기본'}px`);
      }
    } catch (e) {
      console.log(`   [Preferences] 읽기 실패: ${e.message}`);
    }
  }

  // 6. 프로필 크기
  try {
    const size = execSync(`du -sh "${profileDir}" 2>/dev/null | cut -f1`, { encoding: 'utf8' }).trim();
    console.log(`\n   [프로필 크기] ${size}`);
  } catch (e) {}
}

// === 설정 ===
const DEFAULT_SEARCH = FIXED_SEARCH;  // 고정 검색어
const MULTI_PROFILES = ['galaxy-s23', 'pc-chrome'];

// === CLI 파싱 ===
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    agentId: getArg(args, '--agent') || 'T00-01',
    profileId: getArg(args, '--profile') || 'galaxy-s23',
    personaId: getArg(args, '--persona'),  // 기존 페르소나 로드
    personaName: getArg(args, '--name'),   // 페르소나 이름 지정
    chromeVersion: getArg(args, '--chrome'),  // Chrome 버전 (143, chrome-143-0-7499-169 등)
    search: getArg(args, '--search') || DEFAULT_SEARCH,
    threadId: parseInt(getArg(args, '--thread') || '0', 10),
    multi: parseInt(getArg(args, '--multi') || '0', 10),  // N개 동시 생성
    fresh: args.includes('--fresh'),       // 프로필 초기화 (쿠키/히스토리 삭제, 핑거프린트 유지)
    list: args.includes('--list'),         // 페르소나 목록
    listChrome: args.includes('--list-chrome'),  // Chrome 버전 목록
    cacheStatus: args.includes('--cache-status'),  // 공유 캐시 상태
    debug: args.includes('--debug'),
    help: args.includes('--help') || args.includes('-h')
  };
}

function getArg(args, prefix) {
  const arg = args.find(a => a.startsWith(prefix + '='));
  return arg ? arg.split('=')[1] : null;
}

function showHelp() {
  console.log(`
Project Luna - 네이버 페르소나 쿠키 숙성

사용법: sudo DISPLAY=:0 node run.js [옵션]

페르소나 옵션:
  --persona=ID    기존 페르소나 로드 (예: persona-abc123)
  --name=이름     새 페르소나 이름 지정
  --list          저장된 페르소나 목록 조회
  --multi=N       N개의 새 페르소나 동시 생성
  --fresh         프로필 초기화 (쿠키/히스토리 삭제, 핑거프린트 유지)

Chrome 버전 옵션:
  --chrome=VER    Chrome 버전 지정 (예: 143, chrome-143-0-7499-169)
                  지정 안 하면 최신 버전 자동 선택
  --list-chrome   사용 가능한 Chrome 버전 목록

디바이스 프로필 (새 페르소나 생성 시):
  --profile=ID    기반 프로필 (기본: galaxy-s23)
                  가능: ${PROFILE_IDS.join(', ')}

기타 옵션:
  --search=검색어  네이버 검색어 (기본: ${DEFAULT_SEARCH})
  --agent=ID      VPN agent ID (기본: T00-01)
  --debug         디버그 출력
  --help          도움말

예시:
  sudo DISPLAY=:0 node run.js                                # 새 페르소나 + 최신 Chrome
  sudo DISPLAY=:0 node run.js --chrome=142                   # Chrome 142로 실행
  sudo DISPLAY=:0 node run.js --persona=persona-abc          # 기존 페르소나 재사용 (쿠키 유지)
  sudo DISPLAY=:0 node run.js --persona=persona-abc --fresh  # 기존 페르소나 + 쿠키 초기화
  sudo DISPLAY=:0 node run.js --list-chrome                  # Chrome 버전 목록

프로필 구조:
  data/personas/{persona-id}/
  ├── persona.json                  # 메타데이터 + 핑거프린트
  ├── chrome-142-0-7444-134/        # Chrome 142 프로필
  │   └── Default/
  └── chrome-143-0-7499-169/        # Chrome 143 프로필
      └── Default/

  동일 페르소나라도 Chrome 버전별로 프로필이 분리됨 (버전 호환성 보장)
`);
}

// === 부모 모드: VPN 연결 후 namespace에서 자식 실행 ===
async function runAsParent(config) {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           Project Luna - 네이버 페르소나                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // 메인 IP 확인
  let mainIp;
  try {
    mainIp = execSync('curl -s --max-time 5 https://api.ipify.org', { encoding: 'utf8' }).trim();
    console.log(`\n[메인 IP] ${mainIp} ⚠️ 절대 노출 금지!`);
  } catch (e) {
    mainIp = 'unknown';
  }

  const vpn = new VpnManager({
    agentId: config.agentId,
    purpose: 'naver-persona',
    debug: config.debug
  });

  try {
    // 1. VPN 연결
    console.log('\n[1] VPN 연결...');
    const connected = await vpn.connect();

    if (!connected) {
      console.log('❌ VPN 연결 실패');
      process.exit(1);
    }

    const vpnIp = vpn.getPublicIp();
    console.log(`✅ VPN: ${vpnIp} (Namespace: ${vpn.namespace})`);

    if (vpnIp === mainIp) {
      console.log('❌ VPN IP가 메인 IP와 동일!');
      await vpn.cleanup();
      process.exit(1);
    }

    // 2. namespace 안에서 자기 자신 재실행
    console.log('\n[2] VPN namespace 내에서 브라우저 실행...');

    const childEnv = {
      ...process.env,
      VPN_NAMESPACE: vpn.namespace,
      VPN_IP: vpnIp
    };

    const childArgs = process.argv.slice(2);
    const child = spawn('ip', ['netns', 'exec', vpn.namespace, 'node', __filename, ...childArgs], {
      stdio: 'inherit',
      env: childEnv
    });

    const exitCode = await new Promise(resolve => {
      child.on('close', resolve);
      child.on('error', () => resolve(1));
    });

    return exitCode;

  } finally {
    // VPN 정리
    console.log('\n[5] VPN 정리...');
    await vpn.cleanup();
    console.log('✅ 완료');
  }
}

// === 자식 모드: namespace 안에서 브라우저 실행 ===
async function runAsBrowser(config) {
  const vpnIp = process.env.VPN_IP;
  console.log(`\n[VPN] namespace: ${process.env.VPN_NAMESPACE}, IP: ${vpnIp}`);

  const sessions = [];
  const personas = [];

  // Chrome 버전 결정
  let chromeVersion = null;
  if (config.chromeVersion) {
    chromeVersion = ChromeVersions.get(config.chromeVersion);
    if (!chromeVersion) {
      console.log(`\n❌ Chrome 버전을 찾을 수 없음: ${config.chromeVersion}`);
      console.log('   사용 가능한 버전: node run.js --list-chrome');
      process.exit(1);
    }
  } else {
    // 기본: 최신 버전
    chromeVersion = ChromeVersions.getLatest();
    if (!chromeVersion) {
      console.log('\n❌ 사용 가능한 Chrome 버전 없음');
      console.log('   /home/tech/chrome-versions/ 폴더 확인');
      process.exit(1);
    }
  }

  console.log(`\n[2] Chrome: ${chromeVersion.version} (${chromeVersion.fullName})`);

  try {
    // 페르소나 생성 또는 로드
    console.log('\n[3] 페르소나 준비...');

    if (config.personaId) {
      // 기존 페르소나 로드
      console.log(`   기존 페르소나 로드: ${config.personaId}`);
      const persona = await Persona.load(config.personaId);
      personas.push(persona);
    } else if (config.multi > 0) {
      // N개 새 페르소나 생성
      for (let i = 0; i < config.multi; i++) {
        const persona = await Persona.create({
          name: config.personaName ? `${config.personaName}-${i}` : null,
          baseProfile: config.profileId
        });
        personas.push(persona);
      }
    } else {
      // 단일 새 페르소나 생성
      const persona = await Persona.create({
        name: config.personaName,
        baseProfile: config.profileId
      });
      personas.push(persona);
    }

    // --fresh 옵션: 프로필 초기화
    if (config.fresh) {
      console.log('\n[4] 프로필 초기화 (--fresh)...');
      for (const persona of personas) {
        const profileDir = persona.getProfileDir(chromeVersion.fullName);
        console.log(`   ${persona.id}:`);
        resetProfileData(profileDir);
      }
    }

    // 페르소나별 브라우저 생성
    console.log(`\n[${config.fresh ? '5' : '4'}] 브라우저 생성...`);
    for (let i = 0; i < personas.length; i++) {
      const persona = personas[i];
      const fp = persona.fingerprint;

      console.log(`   ${persona.id} (${persona.baseProfile})`);
      console.log(`      cores: ${fp.navigator.hardwareConcurrency}, mem: ${fp.navigator.deviceMemory}GB`);
      console.log(`      screen: ${fp.screen.width}x${fp.screen.height}`);

      const session = await createContextWithPersona({
        persona,
        chromeVersion,
        debugPort: 9222 + i
      });

      sessions.push({ ...session, persona });
      console.log(`   ✅ ${persona.id} (port: ${9222 + i})`);

      if (i < personas.length - 1) await new Promise(r => setTimeout(r, 1000));
    }

    // 네이버 접속 및 검색
    console.log('\n[5] 네이버 검색...');

    for (const session of sessions) {
      const { page, persona, profile } = session;
      const isMobile = profile.isMobile;

      console.log(`\n   ─── ${persona.id} (${persona.baseProfile}) ───`);

      try {
        // 1. IP 확인 (브라우저가 VPN 사용하는지 검증)
        console.log(`   → IP 확인...`);
        await page.goto('https://api.ipify.org', { waitUntil: 'load', timeout: 15000 });
        await page.waitForTimeout(500);

        const browserIp = await page.evaluate(() => document.body.innerText.trim());
        console.log(`   브라우저 IP: ${browserIp}`);

        if (browserIp !== vpnIp) {
          console.log(`   ❌ IP 불일치! VPN: ${vpnIp}, 브라우저: ${browserIp}`);
          console.log(`   ⚠️ VPN 보호 실패 - 스킵`);
          continue;
        }
        console.log(`   ✅ VPN IP 일치 확인`);

        // 2. 네이버 접속
        const naverUrl = isMobile ? 'https://m.naver.com' : 'https://www.naver.com';
        await page.goto(naverUrl, { waitUntil: 'load', timeout: 30000 });
        await page.waitForTimeout(1500);
        console.log(`   ✅ ${isMobile ? '모바일' : 'PC'} 네이버 로드`);

        // 검색 수행
        if (isMobile) {
          // 모바일: #MM_SEARCH_FAKE 클릭 → #query 입력
          await page.click('#MM_SEARCH_FAKE');
          await page.waitForTimeout(800);
          await page.fill('#query', config.search);
          await page.waitForTimeout(300);
          await page.press('#query', 'Enter');
        } else {
          // PC: #query 직접 입력
          await page.fill('#query', config.search);
          await page.waitForTimeout(300);
          await page.press('#query', 'Enter');
        }
        console.log(`   → 검색: "${config.search}"`);

        await page.waitForLoadState('load', { timeout: 30000 });
        await page.waitForTimeout(2000);

        // 결과 확인
        const currentUrl = page.url();
        if (currentUrl.includes('search.naver.com')) {
          const blocked = await page.evaluate(() => {
            const text = document.body.innerText;
            return text.includes('자동입력') || text.includes('보안문자');
          });

          if (blocked) {
            console.log(`   ⚠️ 봇 탐지!`);
            persona._result = '봇 탐지';
          } else {
            console.log(`   ✅ 검색 성공`);
            persona._result = '성공';
            // 사용 기록 업데이트
            await persona.recordUsage('search');
          }
        } else {
          console.log(`   ⚠️ 예상치 못한 URL: ${currentUrl.substring(0, 50)}...`);
          persona._result = `예상치 못한 URL: ${currentUrl.substring(0, 40)}`;
        }

      } catch (error) {
        console.log(`   ❌ ${error.message}`);
        persona._result = `에러: ${error.message.substring(0, 50)}`;
      }
    }

    // 결과
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log(`║  VPN IP: ${vpnIp.padEnd(20)} 페르소나: ${personas.length}개              ║`);
    console.log(`║  Chrome: ${chromeVersion.version.padEnd(49)} ║`);
    console.log(`║  검색어: ${config.search.substring(0, 20).padEnd(20)}                           ║`);
    for (const p of personas) {
      const resultIcon = p._result === '성공' ? '✅' : p._result === '봇 탐지' ? '⚠️' : '❌';
      console.log(`║  ${resultIcon} ${p.id.padEnd(55)} ║`);
    }
    console.log('╚══════════════════════════════════════════════════════════════╝');

    // 세션 로그 저장
    await logSession({
      vpnIp,
      agentId: config.agentId,
      chromeVersion: `${chromeVersion.version} (${chromeVersion.fullName})`,
      search: FIXED_SEARCH,
      personas: personas.map(p => ({
        id: p.id,
        name: p.name,
        baseProfile: p.baseProfile,
        fingerprint: p.fingerprint,
        result: p._result || '미실행'
      })),
      profileDirs: sessions.map(s => s.profileDir)
    });

    // 대기
    console.log('\n   5초 후 종료...');
    await new Promise(r => setTimeout(r, 5000));

  } finally {
    // 브라우저 정리
    console.log('\n[6] 브라우저 종료...');
    for (const s of sessions) {
      try { await s.context.close(); } catch (e) {}
    }

    // 잠시 대기 (파일 flush)
    await new Promise(r => setTimeout(r, 1000));

    // 페르소나 데이터 분석
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                   페르소나 데이터 분석                         ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    for (const s of sessions) {
      const persona = s.persona;
      const profileDir = persona.getProfileDir();
      console.log(`\n   ─── ${persona.id} ───`);
      console.log(`   이름: ${persona.name}`);
      console.log(`   프로필: ${persona.baseProfile}`);
      console.log(`   생성: ${persona.createdAt}`);
      console.log(`   핑거프린트:`);
      console.log(`      cores: ${persona.fingerprint.navigator.hardwareConcurrency}`);
      console.log(`      memory: ${persona.fingerprint.navigator.deviceMemory}GB`);
      console.log(`      screen: ${persona.fingerprint.screen.width}x${persona.fingerprint.screen.height}`);
      console.log(`      uniqueSeed: ${persona.fingerprint.uniqueSeed.substring(0, 16)}...`);

      analyzeProfile(profileDir, persona.id);
    }
  }
}

// === 페르소나 목록 표시 ===
function showPersonaList() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    저장된 페르소나 목록                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const personas = Persona.list();

  if (personas.length === 0) {
    console.log('   저장된 페르소나가 없습니다.');
    console.log('   새 페르소나 생성: sudo DISPLAY=:0 node run.js\n');
    return;
  }

  console.log(`   총 ${personas.length}개 페르소나\n`);

  for (const p of personas) {
    const fp = p.fingerprint || {};
    const nav = fp.navigator || {};
    const scr = fp.screen || {};

    console.log(`   ─── ${p.id} ───`);
    console.log(`      이름: ${p.name}`);
    console.log(`      프로필: ${p.baseProfile}`);
    console.log(`      생성: ${p.createdAt}`);
    console.log(`      마지막 사용: ${p.lastUsedAt || '없음'}`);
    console.log(`      통계: 방문 ${p.stats?.visitCount || 0}회, 검색 ${p.stats?.searchCount || 0}회`);
    console.log(`      핑거프린트: cores=${nav.hardwareConcurrency}, mem=${nav.deviceMemory}GB, ${scr.width}x${scr.height}`);
    console.log('');
  }
}

// === 공유 캐시 상태 표시 ===
async function showCacheStatus() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    공유 캐시 상태                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const status = await sharedCacheManager.getStatus();

  console.log(`   경로: ${status.path}`);
  console.log(`   상태: ${status.exists ? '✅ 존재' : '❌ 없음'}`);
  console.log(`   크기: ${status.totalSize}`);

  if (status.exists) {
    console.log('\n   캐시 타입:');
    for (const [type, info] of Object.entries(status.cacheTypes)) {
      const icon = info.exists ? '✅' : '❌';
      console.log(`      ${icon} ${type}`);
    }

    // 페르소나별 캐시 상태
    const personas = Persona.list();
    if (personas.length > 0) {
      console.log('\n   페르소나 캐시 연결 상태:');
      for (const p of personas.slice(0, 5)) {  // 최대 5개만 표시
        const persona = await Persona.load(p.id);
        const chromeProfiles = persona.listChromeProfiles();

        for (const cp of chromeProfiles) {
          const cacheStatus = await sharedCacheManager.checkProfileCache(cp.path);
          const linkedCount = Object.values(cacheStatus.cacheTypes).filter(c => c.isShared).length;
          const totalCount = Object.keys(cacheStatus.cacheTypes).length;
          const icon = linkedCount === totalCount ? '🔗' : linkedCount > 0 ? '⚠️' : '📁';
          console.log(`      ${icon} ${p.id}/${cp.version} (${linkedCount}/${totalCount} 공유)`);
        }
      }
      if (personas.length > 5) {
        console.log(`      ... 외 ${personas.length - 5}개`);
      }
    }
  }

  console.log('');
}

// === 메인 ===
async function main() {
  const config = parseArgs();

  if (config.help) {
    showHelp();
    return;
  }

  // 페르소나 목록 조회 (VPN/브라우저 불필요)
  if (config.list) {
    showPersonaList();
    return;
  }

  // Chrome 버전 목록 조회
  if (config.listChrome) {
    ChromeVersions.print();
    return;
  }

  // 공유 캐시 상태 조회
  if (config.cacheStatus) {
    await showCacheStatus();
    return;
  }

  // 환경 확인
  if (!process.env.DISPLAY) {
    console.log('\n⚠️  DISPLAY 환경변수 필요: sudo DISPLAY=:0 node run.js');
    process.exit(1);
  }

  if (process.getuid && process.getuid() !== 0) {
    console.log('\n⚠️  root 권한 필요: sudo DISPLAY=:0 node run.js');
    process.exit(1);
  }

  // VPN_NAMESPACE가 있으면 자식 모드 (브라우저 실행)
  if (process.env.VPN_NAMESPACE) {
    await runAsBrowser(config);
  } else {
    // 부모 모드 (VPN 연결 후 namespace에서 자식 실행)
    const exitCode = await runAsParent(config);
    process.exit(exitCode);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
