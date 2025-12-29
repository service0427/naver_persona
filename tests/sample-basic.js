/**
 * 기본 PC 크롬 테스트
 * 스레드별 유저폴더 재사용
 */

import { chromium } from 'patchright';
import path from 'path';

const THREAD_ID = 0;  // 테스트용 스레드 번호
const PROFILE_DIR = path.resolve(`./data/profiles/thread-${THREAD_ID}`);

async function main() {
  console.log(`스레드 ${THREAD_ID} 시작`);
  console.log(`프로필 경로: ${PROFILE_DIR}`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: [
      '--remote-debugging-port=9222',
      '--no-sandbox'
    ]
  });

  const page = context.pages()[0] || await context.newPage();

  // 요청 URL 로깅 (이미지, CSS, 폰트, 미디어 제외)
  page.on('request', request => {
    const type = request.resourceType();
    if (['image', 'stylesheet', 'font', 'media'].includes(type)) return;
    console.log(`>> [${type}] ${request.method()} ${request.url()}`);
  });

  await page.goto('https://www.naver.com');
  console.log('네이버 접속 완료');

  // 30초 대기
  console.log('30초 대기...');
  await page.waitForTimeout(30000);

  await context.close();
  console.log('종료');
}

main().catch(console.error);
