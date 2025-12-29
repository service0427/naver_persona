import { chromium } from 'patchright';

const browser = await chromium.launch({
  headless: false,
  args: ['--no-sandbox']
});

const context = await browser.newContext();
const page = await context.newPage();
await page.goto('chrome://version');

const profilePath = await page.locator('#profile_path').textContent();
console.log('프로필 경로:', profilePath);

await page.waitForTimeout(3000);
await browser.close();
