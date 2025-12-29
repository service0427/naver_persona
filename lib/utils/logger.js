/**
 * 디버깅용 로거
 * - 콘솔 로그: 최근 30개 파일 유지
 * - 네트워크 로그: 최근 30개 JSON 파일 유지
 */

import fs from 'fs';
import path from 'path';

const LOG_DIR = './logs';
const CONSOLE_DIR = path.join(LOG_DIR, 'console');
const NETWORK_DIR = path.join(LOG_DIR, 'network');
const HTML_DIR = path.join(LOG_DIR, 'html');
const MAX_FILES = 30;

// 디렉토리 생성
function ensureDirs() {
  [LOG_DIR, CONSOLE_DIR, NETWORK_DIR, HTML_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

// 오래된 파일 정리 (최근 MAX_FILES개만 유지)
function cleanOldFiles(dir) {
  const files = fs.readdirSync(dir)
    .map(f => ({ name: f, time: fs.statSync(path.join(dir, f)).mtime.getTime() }))
    .sort((a, b) => b.time - a.time);

  if (files.length > MAX_FILES) {
    files.slice(MAX_FILES).forEach(f => {
      fs.unlinkSync(path.join(dir, f.name));
    });
  }
}

// 타임스탬프 생성
function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * 세션 로거 클래스
 */
export class SessionLogger {
  constructor(sessionName = 'session') {
    ensureDirs();

    this.timestamp = getTimestamp();
    this.sessionName = sessionName;
    this.consoleLogs = [];
    this.networkLogs = [];
    this.htmlFiles = [];  // 저장된 HTML 파일 목록
    this.htmlCounter = 0;  // HTML 파일 순번

    this.consoleFile = path.join(CONSOLE_DIR, `${this.timestamp}_${sessionName}.log`);
    this.networkFile = path.join(NETWORK_DIR, `${this.timestamp}_${sessionName}.json`);
  }

  // 콘솔 로그 추가
  log(message) {
    const time = new Date().toISOString();
    const logLine = `[${time}] ${message}`;
    this.consoleLogs.push(logLine);
    console.log(message);
  }

  // 네트워크 요청 로깅
  logRequest(request) {
    const entry = {
      timestamp: new Date().toISOString(),
      type: 'request',
      resourceType: request.resourceType(),
      method: request.method(),
      url: request.url(),
      headers: request.headers(),
      postData: request.postData() || null
    };
    this.networkLogs.push(entry);
    return entry;
  }

  // 네트워크 응답 로깅
  async logResponse(response) {
    let body = null;
    let bodyError = null;

    try {
      const contentType = response.headers()['content-type'] || '';
      // JSON이나 텍스트만 body 저장
      if (contentType.includes('json') || contentType.includes('text')) {
        body = await response.text();
        // 너무 긴 body는 자르기
        if (body.length > 10000) {
          body = body.substring(0, 10000) + '... [truncated]';
        }
      }
    } catch (e) {
      bodyError = e.message;
    }

    const entry = {
      timestamp: new Date().toISOString(),
      type: 'response',
      status: response.status(),
      statusText: response.statusText(),
      url: response.url(),
      headers: response.headers(),
      body,
      bodyError
    };
    this.networkLogs.push(entry);
    return entry;
  }

  /**
   * HTML 페이지 저장
   * @param {Page} page - Playwright page 객체
   * @param {string} label - 페이지 라벨 (예: 'search', 'result')
   * @returns {Promise<string>} 저장된 파일 경로
   */
  async saveHtml(page, label = 'page') {
    this.htmlCounter++;
    const filename = `${this.timestamp}_${this.sessionName}_${String(this.htmlCounter).padStart(2, '0')}_${label}.html`;
    const filepath = path.join(HTML_DIR, filename);

    const html = await page.content();
    fs.writeFileSync(filepath, html);

    this.htmlFiles.push(filepath);
    this.log(`   📄 HTML 저장: ${filename}`);

    return filepath;
  }

  // 저장
  save() {
    // 콘솔 로그 저장
    fs.writeFileSync(this.consoleFile, this.consoleLogs.join('\n'));

    // 네트워크 로그 저장
    fs.writeFileSync(this.networkFile, JSON.stringify(this.networkLogs, null, 2));

    // 오래된 파일 정리
    cleanOldFiles(CONSOLE_DIR);
    cleanOldFiles(NETWORK_DIR);
    cleanOldFiles(HTML_DIR);

    return {
      console: this.consoleFile,
      network: this.networkFile,
      html: this.htmlFiles
    };
  }

  // 페이지에 리스너 연결
  attachToPage(page, options = {}) {
    const { excludeTypes = ['image', 'stylesheet', 'font', 'media'] } = options;

    page.on('request', request => {
      const type = request.resourceType();
      this.logRequest(request);

      // 콘솔 출력 (필터링)
      if (!excludeTypes.includes(type)) {
        this.log(`>> [${type}] ${request.method()} ${request.url()}`);
      }
    });

    page.on('response', async response => {
      await this.logResponse(response);
    });
  }
}

export default SessionLogger;
