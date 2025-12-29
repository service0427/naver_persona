#!/usr/bin/env node
/**
 * 페르소나 품질 종합 분석
 * - 쿠키 나이
 * - 방문 기록
 * - 검색 기록
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const profileDir = './data/profiles/thread-0/Default';

// Chrome timestamp to Date
function chromeTimeToDate(chromeTime) {
  if (!chromeTime || chromeTime === 0) return null;
  const epochDiff = 11644473600000000n;
  const unixMicro = BigInt(chromeTime) - epochDiff;
  return new Date(Number(unixMicro / 1000n));
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║           페르소나 품질 종합 분석 리포트                        ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// 1. 쿠키 분석
console.log('━━━ 1. 쿠키 분석 ━━━\n');
try {
  const cookieDb = new Database(path.join(profileDir, 'Cookies'), { readonly: true });
  const cookies = cookieDb.prepare(`
    SELECT name, host_key, creation_utc, expires_utc
    FROM cookies WHERE host_key LIKE '%naver%'
  `).all();

  console.log(`네이버 쿠키 수: ${cookies.length}개\n`);

  // 가장 오래된 쿠키
  const oldest = cookies.reduce((min, c) =>
    c.creation_utc < min.creation_utc ? c : min, cookies[0]);

  if (oldest) {
    const created = chromeTimeToDate(oldest.creation_utc);
    const ageInDays = Math.floor((new Date() - created) / (1000 * 60 * 60 * 24));
    const ageInHours = Math.floor((new Date() - created) / (1000 * 60 * 60));

    console.log('📅 쿠키 나이 (가장 오래된 것 기준):');
    console.log(`   생성: ${created.toISOString()}`);
    console.log(`   나이: ${ageInDays}일 ${ageInHours % 24}시간`);

    if (ageInDays < 1) {
      console.log('   ⚠️  상태: 매우 신규 (신뢰도 낮음)');
    } else if (ageInDays < 7) {
      console.log('   🔶 상태: 신규 사용자');
    } else if (ageInDays < 30) {
      console.log('   🟡 상태: 일반 사용자');
    } else {
      console.log('   ✅ 상태: 숙성된 사용자 (신뢰도 높음)');
    }
  }

  cookieDb.close();
} catch (err) {
  console.log('쿠키 분석 실패:', err.message);
}

// 2. 방문 기록 분석
console.log('\n━━━ 2. 방문 기록 분석 ━━━\n');
try {
  const historyDb = new Database(path.join(profileDir, 'History'), { readonly: true });

  // 총 방문 수
  const totalVisits = historyDb.prepare(`SELECT COUNT(*) as cnt FROM visits`).get();
  console.log(`총 방문 횟수: ${totalVisits.cnt}회`);

  // 네이버 관련 방문
  const naverVisits = historyDb.prepare(`
    SELECT COUNT(*) as cnt FROM visits v
    JOIN urls u ON v.url = u.id
    WHERE u.url LIKE '%naver%'
  `).get();
  console.log(`네이버 방문 횟수: ${naverVisits.cnt}회`);

  // 도메인별 방문
  const domainVisits = historyDb.prepare(`
    SELECT
      CASE
        WHEN url LIKE '%m.naver.com%' THEN 'm.naver.com'
        WHEN url LIKE '%search.naver.com%' THEN 'search.naver.com'
        WHEN url LIKE '%shopping.naver.com%' THEN 'shopping.naver.com'
        WHEN url LIKE '%smartstore.naver.com%' THEN 'smartstore.naver.com'
        WHEN url LIKE '%naver.com%' THEN 'naver.com (기타)'
        ELSE 'other'
      END as domain,
      COUNT(*) as cnt
    FROM urls
    WHERE url LIKE '%naver%'
    GROUP BY domain
    ORDER BY cnt DESC
  `).all();

  console.log('\n도메인별 방문:');
  domainVisits.forEach(d => console.log(`   ${d.domain}: ${d.cnt}회`));

  // 검색 키워드
  const searchQueries = historyDb.prepare(`
    SELECT term, url_count FROM keyword_search_terms
    ORDER BY url_count DESC LIMIT 10
  `).all();

  console.log('\n검색 키워드:');
  if (searchQueries.length === 0) {
    console.log('   (없음)');
  } else {
    searchQueries.forEach(q => console.log(`   "${q.term}" - ${q.url_count}회`));
  }

  // 최근 방문 URL
  const recentUrls = historyDb.prepare(`
    SELECT u.url, u.title, u.visit_count, u.last_visit_time
    FROM urls u
    WHERE u.url LIKE '%naver%'
    ORDER BY u.last_visit_time DESC
    LIMIT 10
  `).all();

  console.log('\n최근 방문 URL:');
  recentUrls.forEach(u => {
    const time = chromeTimeToDate(u.last_visit_time);
    console.log(`   [${time?.toLocaleTimeString('ko-KR')}] ${u.title?.substring(0, 40) || u.url.substring(0, 50)}`);
  });

  historyDb.close();
} catch (err) {
  console.log('방문 기록 분석 실패:', err.message);
}

// 3. 페르소나 품질 점수 계산
console.log('\n━━━ 3. 페르소나 품질 점수 ━━━\n');

let score = 0;
const factors = [];

// 쿠키 나이 점수 (최대 30점)
try {
  const cookieDb = new Database(path.join(profileDir, 'Cookies'), { readonly: true });
  const oldest = cookieDb.prepare(`
    SELECT MIN(creation_utc) as min_time FROM cookies WHERE host_key LIKE '%naver%'
  `).get();

  if (oldest?.min_time) {
    const ageInDays = Math.floor((new Date() - chromeTimeToDate(oldest.min_time)) / (1000 * 60 * 60 * 24));
    const cookieScore = Math.min(30, ageInDays);
    score += cookieScore;
    factors.push(`쿠키 나이: +${cookieScore}점 (${ageInDays}일)`);
  }
  cookieDb.close();
} catch (e) {}

// 방문 횟수 점수 (최대 30점)
try {
  const historyDb = new Database(path.join(profileDir, 'History'), { readonly: true });
  const visits = historyDb.prepare(`
    SELECT COUNT(*) as cnt FROM visits v
    JOIN urls u ON v.url = u.id
    WHERE u.url LIKE '%naver%'
  `).get();

  const visitScore = Math.min(30, Math.floor(visits.cnt / 10) * 5);
  score += visitScore;
  factors.push(`네이버 방문: +${visitScore}점 (${visits.cnt}회)`);

  historyDb.close();
} catch (e) {}

// 검색 다양성 점수 (최대 20점)
try {
  const historyDb = new Database(path.join(profileDir, 'History'), { readonly: true });
  const keywords = historyDb.prepare(`SELECT COUNT(DISTINCT term) as cnt FROM keyword_search_terms`).get();

  const keywordScore = Math.min(20, keywords.cnt * 2);
  score += keywordScore;
  factors.push(`검색 다양성: +${keywordScore}점 (${keywords.cnt}개 키워드)`);

  historyDb.close();
} catch (e) {}

// 쇼핑 활동 점수 (최대 20점)
try {
  const historyDb = new Database(path.join(profileDir, 'History'), { readonly: true });
  const shopping = historyDb.prepare(`
    SELECT COUNT(*) as cnt FROM urls WHERE url LIKE '%shopping.naver%' OR url LIKE '%smartstore.naver%'
  `).get();

  const shopScore = Math.min(20, shopping.cnt * 2);
  score += shopScore;
  factors.push(`쇼핑 활동: +${shopScore}점 (${shopping.cnt}회)`);

  historyDb.close();
} catch (e) {}

console.log('점수 구성:');
factors.forEach(f => console.log(`   ${f}`));
console.log(`\n📊 총점: ${score}/100점`);

if (score < 20) {
  console.log('⚠️  등급: 신규 페르소나 (숙성 필요)');
} else if (score < 50) {
  console.log('🔶 등급: 성장 중 페르소나');
} else if (score < 80) {
  console.log('🟡 등급: 일반 페르소나');
} else {
  console.log('✅ 등급: 숙성된 페르소나 (최상)');
}

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║                      분석 완료                               ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
