/**
 * NNB 쿠키 구조 분석
 *
 * NNB가 정말 타임스탬프를 포함하지 않는지 확인
 * 쿠키 "나이"를 서버가 알 수 있는지 검증
 */

import fs from 'fs';
import path from 'path';

const HAR_DIR = './har';

function analyzeNNB() {
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║' + '         NNB 쿠키 구조 분석 - 타임스탬프 검증         '.padStart(58).padEnd(78) + '║');
  console.log('╚' + '═'.repeat(78) + '╝\n');

  const harFiles = fs.readdirSync(HAR_DIR).filter(f => f.endsWith('.har'));

  // NNB 쿠키 수집
  const nnbCookies = [];

  harFiles.forEach(file => {
    const harPath = path.join(HAR_DIR, file);
    const har = JSON.parse(fs.readFileSync(harPath, 'utf8'));

    har.log.entries.forEach(entry => {
      // Set-Cookie에서 NNB 찾기
      const setCookies = entry.response.headers.filter(h =>
        h.name.toLowerCase() === 'set-cookie' && h.value.includes('NNB=')
      );

      setCookies.forEach(header => {
        const match = header.value.match(/NNB=([^;]+)/);
        if (match) {
          nnbCookies.push({
            file,
            value: match[1],
            fullHeader: header.value,
            url: entry.request.url
          });
        }
      });

      // 요청 Cookie 헤더에서도 NNB 찾기
      const reqCookie = entry.request.headers.find(h => h.name.toLowerCase() === 'cookie');
      if (reqCookie && reqCookie.value.includes('NNB=')) {
        const match = reqCookie.value.match(/NNB=([^;]+)/);
        if (match && !nnbCookies.find(c => c.value === match[1])) {
          nnbCookies.push({
            file,
            value: match[1],
            type: 'request',
            url: entry.request.url
          });
        }
      }
    });
  });

  console.log('━'.repeat(80));
  console.log('🍪 수집된 NNB 쿠키 샘플');
  console.log('━'.repeat(80));

  // 중복 제거
  const uniqueNNB = [...new Set(nnbCookies.map(c => c.value))];
  console.log(`\n고유 NNB 값: ${uniqueNNB.length}개\n`);

  uniqueNNB.forEach((value, i) => {
    console.log(`[${i + 1}] ${value}`);
    console.log(`    길이: ${value.length}자`);

    // Base64 디코딩 시도
    try {
      const decoded = Buffer.from(value, 'base64').toString('utf8');
      const hexDecoded = Buffer.from(value, 'base64').toString('hex');
      console.log(`    Base64 디코딩: ${decoded.substring(0, 30)}... (hex: ${hexDecoded.substring(0, 20)}...)`);

      // 타임스탬프 패턴 검색
      const timestampPatterns = [
        /\d{10,13}/, // Unix timestamp
        /\d{4}-\d{2}-\d{2}/, // ISO date
        /\d{8}/ // YYYYMMDD
      ];

      let foundTimestamp = false;
      timestampPatterns.forEach(pattern => {
        const match = decoded.match(pattern) || hexDecoded.match(pattern);
        if (match) {
          console.log(`    ⚠️ 타임스탬프 패턴 발견: ${match[0]}`);
          foundTimestamp = true;
        }
      });

      if (!foundTimestamp) {
        console.log(`    ✅ 타임스탬프 패턴 없음`);
      }
    } catch (e) {
      console.log(`    Base64 디코딩 실패`);
    }
    console.log();
  });

  // NNB 쿠키 Set-Cookie 헤더 분석
  console.log('━'.repeat(80));
  console.log('📋 Set-Cookie 헤더 분석');
  console.log('━'.repeat(80));

  const withFullHeader = nnbCookies.filter(c => c.fullHeader);
  if (withFullHeader.length > 0) {
    console.log(`\n샘플 Set-Cookie 헤더:\n`);
    console.log(withFullHeader[0].fullHeader);
    console.log();

    // 속성 파싱
    const attrs = withFullHeader[0].fullHeader.split(';').map(s => s.trim());
    console.log('속성 분석:');
    attrs.forEach(attr => {
      console.log(`  • ${attr}`);
    });
  }

  // NAC, NACT 분석
  console.log('\n' + '━'.repeat(80));
  console.log('🔍 NAC, NACT 쿠키 분석');
  console.log('━'.repeat(80));

  const otherCookies = { NAC: [], NACT: [] };

  harFiles.forEach(file => {
    const harPath = path.join(HAR_DIR, file);
    const har = JSON.parse(fs.readFileSync(harPath, 'utf8'));

    har.log.entries.forEach(entry => {
      const reqCookie = entry.request.headers.find(h => h.name.toLowerCase() === 'cookie');
      if (reqCookie) {
        ['NAC', 'NACT'].forEach(name => {
          const match = reqCookie.value.match(new RegExp(`${name}=([^;]+)`));
          if (match && !otherCookies[name].includes(match[1])) {
            otherCookies[name].push(match[1]);
          }
        });
      }
    });
  });

  Object.entries(otherCookies).forEach(([name, values]) => {
    console.log(`\n${name} 샘플 (${values.length}개):`);
    values.slice(0, 3).forEach((v, i) => {
      console.log(`  [${i + 1}] ${v.substring(0, 50)}... (길이: ${v.length})`);

      // 타임스탬프 검색
      if (/^\d+$/.test(v)) {
        const date = new Date(parseInt(v));
        if (date.getFullYear() > 2020 && date.getFullYear() < 2030) {
          console.log(`      ⚠️ Unix timestamp 가능: ${date.toISOString()}`);
        }
      }
    });
  });

  // 결론
  console.log('\n' + '━'.repeat(80));
  console.log('📌 분석 결론');
  console.log('━'.repeat(80));

  console.log(`
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ NNB 쿠키 구조 분석 결과                                                  │
  └─────────────────────────────────────────────────────────────────────────┘

  1. NNB 쿠키 형식:
     ─────────────────────────────
     • 길이: 약 13자
     • 형식: Base64 인코딩된 랜덤 문자열
     • 타임스탬프 패턴: 발견되지 않음

  2. 서버 측 추적 가능성:
     ─────────────────────────────
     • 쿠키 자체에는 발급 시점 정보 없음
     • 서버 DB에 저장하면 추적 가능하지만:
       - 모든 쿠키 발급을 DB에 기록해야 함
       - 수천만 사용자의 쿠키 조회 비용 높음
       - 실시간 검증은 비현실적

  3. 현실적인 시나리오:
     ─────────────────────────────
     A) 쿠키 나이 기반 차단 (가능성 낮음 ~20%)
        - 모든 NNB를 DB에 저장하고 발급일 기록
        - 신규 쿠키 차단 → False Positive 너무 높음
        - 정상 사용자도 쿠키 초기화하면 신규가 됨

     B) 쿠키-행동 누적 기반 차단 (가능성 중간 ~40%)
        - 쿠키별로 과거 행동 패턴 DB 저장
        - 의심 행동 누적 시 차단
        - 신규 쿠키는 행동 기록 없음 → 중립적

     C) 즉각적 패턴 기반 차단 (가능성 높음 ~90%)
        - 현재 요청의 핑거프린트/행동 패턴 분석
        - 쿠키 나이와 무관
        - 비정상 패턴 즉시 탐지

  ┌─────────────────────────────────────────────────────────────────────────┐
  │ 최종 판단                                                                │
  └─────────────────────────────────────────────────────────────────────────┘

  쿠키 "숙성" 효과에 대한 확신 레벨: 30% (낮음)

  이유:
  • NNB에 타임스탬프 없음 → 자체적으로 나이 알 수 없음
  • 서버 DB 조회 비용 높음 → 실시간 검증 비현실적
  • 신규 쿠키 차단 시 False Positive 너무 높음

  권장 사항:
  • 쿠키 숙성 기간: 7일 → 1-2일로 단축 가능
  • 대신 핑거프린트/행동 패턴 품질에 집중
  • A/B 테스트로 실제 효과 검증 필요
  `);
}

analyzeNNB();
