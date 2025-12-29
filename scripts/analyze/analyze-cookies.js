#!/usr/bin/env node
/**
 * 쿠키 분석 - 페르소나 품질 지표 추출
 */

import Database from 'better-sqlite3';
import path from 'path';

const profileDir = './data/profiles/thread-0/Default';
const cookieDb = path.join(profileDir, 'Cookies');

try {
  const db = new Database(cookieDb, { readonly: true });

  console.log('=== 네이버 관련 쿠키 분석 ===\n');

  const cookies = db.prepare(`
    SELECT
      host_key,
      name,
      value,
      path,
      expires_utc,
      is_secure,
      is_httponly,
      creation_utc,
      last_access_utc,
      has_expires,
      is_persistent
    FROM cookies
    WHERE host_key LIKE '%naver%'
    ORDER BY creation_utc ASC
  `).all();

  console.log('총 쿠키 수:', cookies.length, '\n');

  // Chrome timestamp to Date (마이크로초 since 1601-01-01)
  function chromeTimeToDate(chromeTime) {
    if (!chromeTime || chromeTime === 0) return null;
    // Chrome timestamp is microseconds since 1601-01-01
    const epochDiff = 11644473600000000n; // Difference between 1601 and 1970 in microseconds
    const unixMicro = BigInt(chromeTime) - epochDiff;
    return new Date(Number(unixMicro / 1000n));
  }

  // 쿠키 분류
  const categories = {
    identity: [],    // 식별자
    session: [],     // 세션
    tracking: [],    // 트래킹
    preference: [],  // 설정
    other: []
  };

  cookies.forEach(c => {
    const name = c.name.toLowerCase();
    const createdAt = chromeTimeToDate(c.creation_utc);
    const expiresAt = chromeTimeToDate(c.expires_utc);
    const lastAccess = chromeTimeToDate(c.last_access_utc);

    const info = {
      name: c.name,
      host: c.host_key,
      value: c.value?.substring(0, 50) + (c.value?.length > 50 ? '...' : ''),
      created: createdAt?.toISOString(),
      expires: expiresAt?.toISOString(),
      lastAccess: lastAccess?.toISOString(),
      persistent: c.is_persistent === 1,
      httpOnly: c.is_httponly === 1,
      secure: c.is_secure === 1
    };

    // 분류
    if (['nnb', 'nid_', 'nid_ses', 'nid_aut', 'nid_jkl'].some(p => name.includes(p))) {
      categories.identity.push(info);
    } else if (name.includes('session') || name.includes('jsessionid')) {
      categories.session.push(info);
    } else if (['_ga', '_gid', 'nx_ssl', 'pm_'].some(p => name.includes(p))) {
      categories.tracking.push(info);
    } else if (['locale', 'timezone', 'theme', 'pref'].some(p => name.includes(p))) {
      categories.preference.push(info);
    } else {
      categories.other.push(info);
    }
  });

  // 출력
  console.log('=== 🔑 식별자 쿠키 (Identity) ===');
  categories.identity.forEach(c => {
    console.log(`\n[${c.name}] @ ${c.host}`);
    console.log(`  값: ${c.value}`);
    console.log(`  생성: ${c.created}`);
    console.log(`  만료: ${c.expires || '세션'}`);
    console.log(`  영구: ${c.persistent}, HttpOnly: ${c.httpOnly}`);
  });

  console.log('\n\n=== 📊 트래킹 쿠키 ===');
  categories.tracking.forEach(c => {
    console.log(`[${c.name}] @ ${c.host} = ${c.value}`);
  });

  console.log('\n\n=== 🔄 세션 쿠키 ===');
  categories.session.forEach(c => {
    console.log(`[${c.name}] @ ${c.host} = ${c.value}`);
  });

  console.log('\n\n=== ⚙️ 기타 쿠키 ===');
  categories.other.forEach(c => {
    console.log(`[${c.name}] @ ${c.host}`);
  });

  // 핵심 쿠키 분석
  console.log('\n\n=== 📈 페르소나 품질 지표 분석 ===\n');

  const nnbCookie = cookies.find(c => c.name === 'NNB');
  const nidCookies = cookies.filter(c => c.name.startsWith('NID_'));

  if (nnbCookie) {
    const created = chromeTimeToDate(nnbCookie.creation_utc);
    const now = new Date();
    const ageInDays = Math.floor((now - created) / (1000 * 60 * 60 * 24));

    console.log('NNB 쿠키 (핵심 식별자):');
    console.log(`  값: ${nnbCookie.value}`);
    console.log(`  생성일: ${created.toISOString()}`);
    console.log(`  나이: ${ageInDays}일`);
    console.log(`  ⚠️ 쿠키 나이가 짧으면 신규 사용자로 인식 → 신뢰도 낮음`);
  }

  console.log(`\nNID 쿠키 수: ${nidCookies.length}개`);
  console.log('  → 로그인하지 않은 상태에서는 NID 쿠키가 없거나 적음');

  db.close();

} catch (err) {
  console.error('오류:', err.message);
}
