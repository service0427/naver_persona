#!/usr/bin/env node
/**
 * 기존 페르소나 테스트
 * - VPN 할당받아 IP 확인
 * - 해당 IP로 페르소나 last_ip 업데이트
 * - 쿠키 복원 후 검색 테스트
 */

import VpnManager from '../lib/vpn/VpnManager.js';
import db from '../lib/db/PersonaDB.js';
import { chromium } from 'patchright';
import fs from 'fs';
import path from 'path';
import { flickScroll, scrollUp } from '../lib/behavior/CDPTouchScroll.js';

const DEVICE_CONFIG = {
  userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S916N Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.135 Mobile Safari/537.36',
  viewport: { width: 384, height: 854 },
  deviceScaleFactor: 2.8125,
  isMobile: true,
  hasTouch: true
};

async function main() {
  const testCount = 3;
  
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║    기존 페르소나 복원 테스트                        ║');
  console.log('╚═══════════════════════════════════════════════════╝');

  await db.connect();

  // VPN 연결
  console.log('\n[1] VPN 연결 중...');
  const vpn = new VpnManager({ agentId: 'K05-01', purpose: 'persona-test' });
  const connected = await vpn.connect();
  
  if (!connected) {
    console.log('❌ VPN 연결 실패');
    process.exit(1);
  }

  const vpnIp = vpn.getPublicIp();
  console.log(`✅ VPN IP: ${vpnIp}`);

  // 테스트할 페르소나 선택 (data_backup 있는 것만)
  console.log('\n[2] 테스트용 페르소나 선택...');
  const [personas] = await db.pool.query(`
    SELECT id, code, last_ip, fingerprint, data_backup, storage_state
    FROM personas 
    WHERE status = 'active' AND data_backup IS NOT NULL
    ORDER BY last_used_at DESC
    LIMIT ?
  `, [testCount]);

  if (personas.length === 0) {
    console.log('❌ 테스트 가능한 페르소나 없음');
    await vpn.cleanup();
    process.exit(1);
  }

  console.log(`   ${personas.length}개 페르소나 선택됨`);

  // last_ip를 현재 VPN IP로 업데이트 (있는 척 하기)
  console.log('\n[3] 페르소나 IP 업데이트 (테스트용)...');
  for (const p of personas) {
    await db.pool.query(
      'UPDATE personas SET last_ip = ? WHERE id = ?',
      [vpnIp, p.id]
    );
    console.log(`   ${p.code}: ${p.last_ip} → ${vpnIp}`);
  }

  // 각 페르소나 테스트
  console.log('\n[4] 페르소나별 복원 테스트...');
  
  for (let i = 0; i < personas.length; i++) {
    const persona = personas[i];
    console.log(`\n--- [${i+1}/${personas.length}] ${persona.code} ---`);

    // 프로필 디렉토리 생성
    const profileDir = `/tmp/test-persona-${persona.id.substring(0, 8)}`;
    
    try {
      // 백업 데이터 복원
      if (persona.data_backup) {
        console.log('   📦 프로필 복원 중...');
        const backup = JSON.parse(persona.data_backup);
        const zlib = await import('zlib');

        let restoredCount = 0;

        // files 복원 (Cookies, Preferences 등)
        if (backup.files) {
          for (const [filePath, fileInfo] of Object.entries(backup.files)) {
            const fullPath = path.join(profileDir, filePath);
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });

            // gzip 압축 해제
            const compressed = Buffer.from(fileInfo.data, 'base64');
            const decompressed = zlib.gunzipSync(compressed);
            fs.writeFileSync(fullPath, decompressed);
            restoredCount++;
          }
        }

        // directories 복원 (Local Storage, Session Storage 등)
        if (backup.directories) {
          for (const [dirPath, files] of Object.entries(backup.directories)) {
            for (const [fileName, fileInfo] of Object.entries(files)) {
              const fullPath = path.join(profileDir, dirPath, fileName);
              fs.mkdirSync(path.dirname(fullPath), { recursive: true });

              // gzip 압축 해제
              const compressed = Buffer.from(fileInfo.data, 'base64');
              const decompressed = zlib.gunzipSync(compressed);
              fs.writeFileSync(fullPath, decompressed);
              restoredCount++;
            }
          }
        }

        console.log(`      ✅ ${restoredCount}개 파일 복원`);
      }

      // 브라우저 실행
      console.log('   🌐 브라우저 시작...');
      const context = await chromium.launchPersistentContext(profileDir, {
        headless: false,
        args: [
          '--no-sandbox',
          '--disable-blink-features=AutomationControlled',
          `--remote-debugging-port=${9300 + i}`
        ],
        ...DEVICE_CONFIG,
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul'
      });

      const page = await context.newPage();
      
      // CDP 세션 생성
      const cdp = await context.newCDPSession(page);

      // 네이버 검색
      console.log('   🔍 네이버 검색...');
      await page.goto('https://m.naver.com', { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(1000);

      await page.click('#MM_SEARCH_FAKE');
      await page.waitForTimeout(500);
      await page.fill('#query', '아이간식 달빛기정떡');
      await page.press('#query', 'Enter');
      await page.waitForLoadState('load', { timeout: 30000 });
      await page.waitForTimeout(2000);

      // 봇 탐지 확인
      const blocked = await page.evaluate(() => {
        const text = document.body.innerText;
        return text.includes('자동입력') || text.includes('보안문자');
      });

      if (blocked) {
        console.log('   ⚠️ 봇 탐지됨!');
      } else {
        console.log('   ✅ 검색 성공!');
        
        // CDP 스크롤 테스트
        console.log('   📜 CDP 스크롤 테스트...');
        
        // 아래로 2회 플릭
        for (let j = 0; j < 2; j++) {
          const dist = 300 + Math.floor(Math.random() * 200);
          const result = await flickScroll(page, cdp, dist, { 
            duration: 100, 
            wobble: true,
            verbose: false
          });
          console.log(`      ↓ 플릭 ${dist}px → 실제 ${result.actualDistance}px (관성 ${result.inertiaPercent}%)`);
          await new Promise(r => setTimeout(r, 1000));
        }
        
        // 위로 1회
        const upResult = await scrollUp(page, cdp, 150, { verbose: false });
        console.log(`      ↑ 위로 150px → 실제 ${upResult.actualDistance}px`);
      }

      // 쿠키 확인
      const state = await context.storageState();
      const nnbCookie = state.cookies.find(c => c.name === 'NNB');
      console.log(`   🍪 NNB 쿠키: ${nnbCookie ? nnbCookie.value.substring(0, 20) + '...' : '없음'}`);

      await page.waitForTimeout(2000);
      await context.close();

      // 정리
      fs.rmSync(profileDir, { recursive: true, force: true });

    } catch (error) {
      console.log(`   ❌ 오류: ${error.message}`);
      try {
        fs.rmSync(profileDir, { recursive: true, force: true });
      } catch (e) {}
    }

    // 브라우저 간 간격
    if (i < personas.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // 정리
  console.log('\n[5] 정리 중...');
  await vpn.cleanup();
  await db.pool.end();

  console.log('\n✅ 테스트 완료');
}

main().catch(console.error);
