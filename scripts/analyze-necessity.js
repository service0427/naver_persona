/**
 * 페르소나/쿠키 숙성 필요성 검증 분석
 *
 * HAR 파일을 분석하여:
 * 1. 네이버가 어떤 쿠키를 사용하는지
 * 2. 어떤 추적 메커니즘이 있는지
 * 3. 쿠키 없이 접근 시 어떤 차이가 있는지
 * 4. 페르소나 숙성이 정말 필요한지
 *
 * 논리적으로 검증
 */

import fs from 'fs';
import path from 'path';

const HAR_DIR = './har';

function analyzeNecessity() {
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║' + '   페르소나/쿠키 숙성 필요성 논리적 검증   '.padStart(52).padEnd(78) + '║');
  console.log('╚' + '═'.repeat(78) + '╝\n');

  const harFiles = fs.readdirSync(HAR_DIR).filter(f => f.endsWith('.har'));
  console.log(`분석 대상: ${harFiles.length}개 HAR 파일\n`);

  const allCookies = new Map(); // cookie name -> { setCount, useCount, domains }
  const allTracking = {};
  const responseCodes = {};
  const apiPatterns = [];

  harFiles.forEach(file => {
    const harPath = path.join(HAR_DIR, file);
    const har = JSON.parse(fs.readFileSync(harPath, 'utf8'));
    const entries = har.log.entries;

    entries.forEach(entry => {
      const url = entry.request.url;
      const domain = new URL(url).hostname;

      // 쿠키 분석
      const reqCookies = entry.request.headers.find(h => h.name.toLowerCase() === 'cookie');
      if (reqCookies) {
        reqCookies.value.split(';').forEach(c => {
          const name = c.trim().split('=')[0];
          if (!allCookies.has(name)) {
            allCookies.set(name, { setCount: 0, useCount: 0, domains: new Set() });
          }
          allCookies.get(name).useCount++;
          allCookies.get(name).domains.add(domain);
        });
      }

      // Set-Cookie 분석
      entry.response.cookies?.forEach(c => {
        if (!allCookies.has(c.name)) {
          allCookies.set(c.name, { setCount: 0, useCount: 0, domains: new Set() });
        }
        allCookies.get(c.name).setCount++;
      });

      // 추적 도메인 분석
      const trackingPatterns = [
        { pattern: 'nlog.naver.com', name: 'nlog (행동추적)' },
        { pattern: 'siape.veta.naver.com', name: 'veta (광고추적)' },
        { pattern: 'lcs.naver.com', name: 'lcs (로그수집)' },
        { pattern: 'nclick', name: 'nclick (클릭추적)' },
        { pattern: 'scrolllog', name: 'scrolllog (스크롤추적)' }
      ];

      trackingPatterns.forEach(({ pattern, name }) => {
        if (url.includes(pattern)) {
          allTracking[name] = (allTracking[name] || 0) + 1;
        }
      });

      // API 패턴 수집 (shopping, search 관련)
      if (url.includes('api') || url.includes('search')) {
        const apiDomain = domain;
        if (!apiPatterns.includes(apiDomain)) {
          apiPatterns.push(apiDomain);
        }
      }

      // 응답 코드
      const status = entry.response.status;
      responseCodes[status] = (responseCodes[status] || 0) + 1;
    });
  });

  // 결과 출력
  console.log('━'.repeat(80));
  console.log('🍪 [1] 쿠키 분석 - 핵심 쿠키');
  console.log('━'.repeat(80));

  const importantCookies = ['NNB', 'NAC', 'NACT', 'NID_AUT', 'NID_SES', 'nid_inf', 'nx_ssl'];
  importantCookies.forEach(name => {
    const info = allCookies.get(name);
    if (info) {
      console.log(`  ${name.padEnd(12)} | 설정: ${info.setCount}회, 사용: ${info.useCount}회`);
      console.log(`               | 도메인: ${[...info.domains].slice(0, 3).join(', ')}...`);
    } else {
      console.log(`  ${name.padEnd(12)} | ❌ 발견되지 않음`);
    }
  });

  console.log('\n━'.repeat(80));
  console.log('📊 [2] 추적 메커니즘 분석');
  console.log('━'.repeat(80));

  Object.entries(allTracking).sort((a, b) => b[1] - a[1]).forEach(([name, count]) => {
    console.log(`  ${name.padEnd(25)} : ${count}회`);
  });

  console.log('\n━'.repeat(80));
  console.log('🔍 [3] 논리적 분석: 쿠키 없이 접근하면?');
  console.log('━'.repeat(80));

  console.log(`
  질문 1: 쿠키 없이 네이버 쇼핑/플레이스 접근이 가능한가?
  ────────────────────────────────────────────────────
  → 기술적으로 가능함. 네이버는 비로그인 사용자도 허용.
  → 첫 접근 시 서버가 NNB, NAC 등 쿠키를 자동 발급.

  질문 2: 그러면 왜 쿠키 "숙성"이 필요한가?
  ────────────────────────────────────────────────────
  가설 A: 신규 쿠키 vs 오래된 쿠키 구분
    - NNB 쿠키는 타임스탬프를 포함하지 않음 (단순 UUID)
    - 서버 측에서 쿠키 발급 시점을 기록할 수 있음
    - 하지만 이것만으로 차단하기엔 False Positive 너무 높음

  가설 B: 행동 패턴 누적
    - nlog, scrolllog 등이 사용자 행동을 추적
    - "자연스러운" 행동 패턴 누적이 신뢰도에 영향
    - BUT: 이 데이터는 쿠키가 아닌 서버 DB에 저장

  가설 C: 핑거프린트 일관성
    - 같은 쿠키로 다른 핑거프린트 = 의심
    - 쿠키와 핑거프린트의 일관된 매칭이 중요

  질문 3: 실제로 차단이 발생하는 시점은?
  ────────────────────────────────────────────────────
  → 대량 요청 (Rate Limiting)
  → 비정상 패턴 (봇 시그니처)
  → IP 평판 (VPN/데이터센터 IP)
  → 핑거프린트 이상 (headless 탐지)
  `);

  console.log('\n━'.repeat(80));
  console.log('📈 [4] HAR 데이터 기반 증거');
  console.log('━'.repeat(80));

  // NNB 쿠키 구조 분석
  console.log('\n  NNB 쿠키 샘플 분석:');
  harFiles.forEach(file => {
    const harPath = path.join(HAR_DIR, file);
    const har = JSON.parse(fs.readFileSync(harPath, 'utf8'));

    for (const entry of har.log.entries) {
      const setCookies = entry.response.headers.filter(h =>
        h.name.toLowerCase() === 'set-cookie' && h.value.includes('NNB=')
      );
      if (setCookies.length > 0) {
        const nnbValue = setCookies[0].value.match(/NNB=([^;]+)/)?.[1];
        if (nnbValue) {
          console.log(`    ${file}: NNB=${nnbValue.substring(0, 20)}...`);
          console.log(`    → 길이: ${nnbValue.length}자, 형식: ${/^[A-Z0-9]+$/.test(nnbValue) ? 'Base64/UUID' : '기타'}`);
          break;
        }
      }
    }
  });

  console.log('\n━'.repeat(80));
  console.log('⚖️ [5] 최종 판단: 페르소나 숙성이 필요한가?');
  console.log('━'.repeat(80));

  console.log(`
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ 결론: 부분적으로 필요하지만, 과대평가된 측면이 있음                      │
  └─────────────────────────────────────────────────────────────────────────┘

  ✅ 확실히 필요한 것:
  ────────────────────
  1. 쿠키 일관성: 같은 페르소나는 같은 쿠키 유지 (세션 연속성)
  2. 핑거프린트 일관성: 쿠키와 디바이스 정보 매칭
  3. IP 관리: 깨끗한 IP (VPN 회전)

  ❓ 효과가 불확실한 것:
  ────────────────────
  1. 쿠키 "나이": NNB는 타임스탬프 없음, 서버측 검증 비용 높음
  2. 행동 패턴 "숙성": 네이버가 쿠키별 행동을 장기 분석하는지 불명확
  3. 오래된 쿠키 = 신뢰: 증거 없음, 추측에 가까움

  🎯 실제 차단 원인 (우선순위):
  ────────────────────
  1순위: Rate Limiting (너무 빠른 요청)
  2순위: 봇 시그니처 (headless, 비정상 UA, WebDriver 탐지)
  3순위: IP 평판 (데이터센터 IP, 알려진 VPN)
  4순위: 핑거프린트 불일치 (canvas, WebGL 이상)
  5순위: 행동 패턴 (즉각적인 이상, 클릭 없는 스크롤 등)

  💡 권장 전략:
  ────────────────────
  1. 쿠키 "숙성" 기간 최소화 (1-2일이면 충분할 수 있음)
  2. 대신 핑거프린트 품질에 집중
  3. 행동 패턴 자연스럽게 (스크롤, 체류시간)
  4. IP 로테이션 전략 강화
  5. Rate Limiting 회피 (요청 간격)
  `);

  console.log('\n━'.repeat(80));
  console.log('🔬 [6] 추가 검증 필요 사항');
  console.log('━'.repeat(80));

  console.log(`
  A/B 테스트 제안:
  ────────────────────
  1. 신규 쿠키 vs 7일 숙성 쿠키 → 차단율 비교
  2. 동일 쿠키 + 다른 핑거프린트 → 차단 여부
  3. 동일 핑거프린트 + 다른 쿠키 → 차단 여부
  4. 쿠키 없이 첫 접근 → 즉시 작업 가능 여부

  이 테스트를 통해 실제로 어느 요소가 중요한지 확인 필요.
  `);
}

analyzeNecessity();
