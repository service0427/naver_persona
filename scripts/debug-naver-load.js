#!/usr/bin/env node
/**
 * 네이버 로딩 디버그 스크립트
 * - waitUntil 옵션별 로딩 시간 측정
 * - route 핸들러 영향 분석
 */

import { chromium } from 'patchright';
import fs from 'fs';

const DEVICE_CONFIG = {
  userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S916N Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.135 Mobile Safari/537.36',
  viewport: { width: 384, height: 854 },
  deviceScaleFactor: 2.8125,
  isMobile: true,
  hasTouch: true,
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul'
};

async function testNaverLoad(testName, setupFn = null) {
  const profileDir = `/tmp/debug-naver-${Date.now()}`;
  fs.mkdirSync(profileDir, { recursive: true });

  console.log(`\n=== ${testName} ===`);

  try {
    const context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      args: ['--no-sandbox', '--remote-debugging-port=9400'],
      ...DEVICE_CONFIG
    });

    // 설정 함수 호출 (route 설정 등)
    if (setupFn) {
      await setupFn(context);
    }

    const page = await context.newPage();

    // 1. 네이버 메인 로드 테스트
    console.log('  [1] m.naver.com 로드 중...');
    const start1 = Date.now();

    try {
      await page.goto('https://m.naver.com', {
        waitUntil: 'domcontentloaded',  // load 대신 domcontentloaded 사용
        timeout: 30000
      });
      console.log(`      ✅ domcontentloaded: ${Date.now() - start1}ms`);
    } catch (e) {
      console.log(`      ❌ 실패: ${e.message}`);
      await context.close();
      fs.rmSync(profileDir, { recursive: true, force: true });
      return;
    }

    // 추가 대기 후 실제 렌더링 확인
    await page.waitForTimeout(500);

    const pageContent = await page.evaluate(() => document.body?.innerText?.length || 0);
    console.log(`      페이지 텍스트 길이: ${pageContent}자`);

    // 2. 검색 테스트
    console.log('  [2] 검색 테스트...');
    const start2 = Date.now();

    try {
      // 검색 입력창 찾기
      const searchInput = await page.$('#MM_SEARCH_FAKE');
      if (!searchInput) {
        console.log('      ❌ 검색창 없음 (아직 로딩 안됨)');

        // 잠시 대기 후 재시도
        await page.waitForTimeout(2000);
        const searchInput2 = await page.$('#MM_SEARCH_FAKE');
        if (!searchInput2) {
          console.log('      ❌ 2초 후에도 검색창 없음');
          await context.close();
          fs.rmSync(profileDir, { recursive: true, force: true });
          return;
        }
      }

      await page.click('#MM_SEARCH_FAKE');
      await page.waitForTimeout(300);
      await page.fill('#query', '테스트');
      await page.press('#query', 'Enter');

      await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
      console.log(`      ✅ 검색 완료: ${Date.now() - start2}ms`);

    } catch (e) {
      console.log(`      ❌ 검색 실패: ${e.message}`);
    }

    await page.waitForTimeout(1000);
    await context.close();
    fs.rmSync(profileDir, { recursive: true, force: true });

    console.log(`  총 소요시간: ${Date.now() - start1}ms`);

  } catch (e) {
    console.log(`  ❌ 테스트 실패: ${e.message}`);
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch (ee) {}
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║        네이버 로딩 디버그 테스트                    ║');
  console.log('╚══════════════════════════════════════════════════╝');

  // 테스트 1: route 핸들러 없이
  await testNaverLoad('Route 핸들러 없음 (기본)');

  // 테스트 2: route 핸들러 있음
  await testNaverLoad('Route 핸들러 있음 (헤더 수정)', async (context) => {
    await context.route('**/*', async (route) => {
      const headers = {
        ...route.request().headers(),
        'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
      };
      await route.continue({ headers });
    });
  });

  // 테스트 3: 특정 도메인만 route
  await testNaverLoad('Route 핸들러 (네이버만)', async (context) => {
    await context.route('**/*.naver.com/**', async (route) => {
      const headers = {
        ...route.request().headers(),
        'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
      };
      await route.continue({ headers });
    });
  });

  console.log('\n✅ 테스트 완료');
}

main().catch(console.error);
