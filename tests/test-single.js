#!/usr/bin/env node
/**
 * 싱글 브라우저 테스트 - 쿠키 추출 검증용
 */

import { createContextWithPersona } from './lib/core/browser-launcher.js';
import Persona from './lib/core/Persona.js';
import ChromeVersions from './lib/chrome/ChromeVersions.js';
import { extractProfileData } from './lib/utils/profile-extractor.js';
import path from 'path';

async function main() {
  console.log('=== 싱글 브라우저 테스트 ===\n');

  // Chrome 버전 랜덤 선택
  const allVersions = ChromeVersions.list();
  const chromeVersion = allVersions[Math.floor(Math.random() * allVersions.length)];
  console.log(`[Chrome] ${chromeVersion.fullName} (랜덤 선택)`);
  console.log(`   총 ${allVersions.length}개 버전 중 선택됨\n`);

  // 테스트용 프로필 경로
  const profileDir = path.join('./data', 'test-single', chromeVersion.fullName);
  console.log(`[Profile] ${profileDir}`);

  // 페르소나 생성
  const persona = await Persona.createEphemeral('galaxy-s23');
  console.log(`[Persona] ${persona.id}`);

  let context, page;

  try {
    // 브라우저 실행
    console.log('\n[1] 브라우저 실행...');
    const session = await createContextWithPersona({
      persona,
      chromeVersion,
      profileDir,
      debugPort: 9300,
      windowPosition: { x: 100, y: 100, width: 400, height: 800 }
    });
    context = session.context;
    page = session.page;
    console.log('   ✅ 브라우저 실행 완료');

    // IP 확인
    console.log('\n[2] IP 확인...');
    await page.goto('https://api.ipify.org', { waitUntil: 'load', timeout: 30000 });
    const ip = await page.evaluate(() => document.body.innerText.trim());
    console.log(`   IP: ${ip}`);

    // 네이버 접속
    console.log('\n[3] 네이버 접속...');
    await page.goto('https://m.naver.com', { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(2000);
    console.log('   ✅ 네이버 로드 완료');

    // 검색
    console.log('\n[4] 검색...');
    await page.click('#MM_SEARCH_FAKE');
    await page.waitForTimeout(500);
    await page.fill('#query', '아이간식 달빛기정떡');
    await page.press('#query', 'Enter');
    await page.waitForLoadState('load', { timeout: 30000 });
    await page.waitForTimeout(3000);
    console.log('   ✅ 검색 완료');

    // 봇 탐지 확인
    const blocked = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('자동입력') || text.includes('보안문자');
    });
    console.log(`   봇 탐지: ${blocked ? '⚠️ 탐지됨' : '✅ 정상'}`);

    // [하이브리드 방식] 브라우저 종료 전에 쿠키 추출 (Playwright API 사용)
    console.log('\n[5] 쿠키 추출 (Playwright API)...');
    let playwrightCookies = [];
    try {
      const storageState = await context.storageState();
      playwrightCookies = storageState.cookies || [];
      console.log(`   ✅ Playwright 쿠키: ${playwrightCookies.length}개`);
    } catch (e) {
      console.log(`   ⚠️ Playwright 쿠키 추출 실패: ${e.message}`);
    }

    // 브라우저 종료
    console.log('\n[6] 브라우저 종료...');
    await context.close();
    context = null;
    console.log('   ✅ 종료 완료');

    // SQLite에서 히스토리/Preferences 추출 (쿠키는 암호화되어 있어서 제외)
    console.log('\n[7] SQLite 데이터 추출 (히스토리, Preferences)...');
    await new Promise(r => setTimeout(r, 1000)); // 파일 시스템 동기화 대기

    const extracted = extractProfileData(profileDir);
    console.log(`   SQLite 쿠키 (암호화됨): ${extracted.cookies.length}개`);
    console.log(`   히스토리: ${extracted.history.length}개`);
    console.log(`   Preferences: ${extracted.preferences ? 'OK' : 'NULL'}`);

    // Playwright 쿠키 출력
    if (playwrightCookies.length > 0) {
      console.log('\n   === Playwright 쿠키 샘플 ===');
      playwrightCookies.slice(0, 5).forEach(c => {
        console.log(`   ${c.name}: ${c.value?.substring(0, 30)}...`);
      });
    }

    if (extracted.history.length > 0) {
      console.log('\n   === 히스토리 샘플 ===');
      extracted.history.slice(0, 3).forEach(h => {
        console.log(`   ${h.url.substring(0, 50)}...`);
      });
    }

    console.log('\n=== 테스트 완료 ===');

  } catch (error) {
    console.error('\n❌ 오류:', error.message);
    console.error(error.stack);
  } finally {
    if (context) {
      try { await context.close(); } catch (e) {}
    }
  }
}

main().catch(console.error);
