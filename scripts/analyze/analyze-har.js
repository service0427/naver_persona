#!/usr/bin/env node
/**
 * HAR 파일 분석 - 페르소나 스코어링 관련 데이터 추출
 */

import fs from 'fs';

const har = JSON.parse(fs.readFileSync('har/simple.har', 'utf-8'));

console.log('=== 스마트스토어 API 응답 분석 ===\n');

const apis = har.log.entries.filter(e =>
  e.request.url.includes('smartstore.naver.com/i/') &&
  e.response.content?.text
);

// 관련 필드 추출 함수
function extractFields(obj, path = '', results = []) {
  if (!obj || typeof obj !== 'object') return results;

  for (const [k, v] of Object.entries(obj)) {
    const key = k.toLowerCase();
    const keywords = ['score', 'quality', 'rank', 'grade', 'trust', 'credit', 'review', 'satisfaction'];

    if (keywords.some(kw => key.includes(kw))) {
      results.push({ path: path + k, value: v });
    }

    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      extractFields(v, path + k + '.', results);
    }
  }

  return results;
}

apis.forEach((e) => {
  try {
    const data = JSON.parse(e.response.content.text);
    const url = e.request.url.split('?')[0];
    const apiPath = url.substring(url.indexOf('/i/'));

    const fields = extractFields(data);

    if (fields.length > 0) {
      console.log('--- API:', apiPath, '---');
      fields.forEach(f => {
        const val = typeof f.value === 'object' ? JSON.stringify(f.value) : f.value;
        console.log('  ', f.path + ':', val);
      });
      console.log('');
    }
  } catch (err) {
    // JSON 파싱 실패 무시
  }
});

// 광고 트래킹 URL 파라미터 분석
console.log('\n=== 광고 트래킹 파라미터 상세 분석 ===\n');

const trackingEntries = har.log.entries.filter(e =>
  e.request.url.includes('siape.veta') ||
  e.request.url.includes('/crd/rd') ||
  e.request.url.includes('er.search.naver')
);

trackingEntries.forEach((e, i) => {
  const url = new URL(e.request.url);
  console.log('--- URL:', url.pathname, '---');

  const params = {};
  url.searchParams.forEach((v, k) => {
    // Base64로 인코딩된 것 같은 긴 값은 표시
    if (v.length > 100) {
      params[k] = '[BASE64/ENCRYPTED ' + v.length + ' chars]';
    } else {
      params[k] = v;
    }
  });

  console.log('Params:', JSON.stringify(params, null, 2));
  console.log('');
});
