/**
 * nlog, scrolllog 심층 분석
 *
 * 네이버가 실제로 어떤 데이터를 수집하고
 * 이를 기반으로 사용자를 어떻게 식별하는지 분석
 */

import fs from 'fs';
import path from 'path';

const HAR_DIR = './har';

function deepAnalyze() {
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║' + '      nlog/scrolllog 심층 분석 - 봇 탐지 가능성      '.padStart(58).padEnd(78) + '║');
  console.log('╚' + '═'.repeat(78) + '╝\n');

  const harFiles = fs.readdirSync(HAR_DIR).filter(f => f.endsWith('.har'));

  // nlog 페이로드 수집
  const nlogPayloads = [];
  const scrolllogUrls = [];

  harFiles.forEach(file => {
    const harPath = path.join(HAR_DIR, file);
    const har = JSON.parse(fs.readFileSync(harPath, 'utf8'));

    har.log.entries.forEach(entry => {
      const url = entry.request.url;

      // nlog 분석
      if (url.includes('nlog.naver.com')) {
        if (entry.request.postData?.text) {
          try {
            const data = JSON.parse(entry.request.postData.text);
            nlogPayloads.push({ file, data });
          } catch (e) {}
        }
      }

      // scrolllog 분석
      if (url.includes('scrolllog')) {
        scrolllogUrls.push({ file, url });
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // nlog 분석
  // ═══════════════════════════════════════════════════════════════
  console.log('━'.repeat(80));
  console.log('📊 [1] nlog 페이로드 분석');
  console.log('━'.repeat(80));
  console.log(`\n수집된 nlog 페이로드: ${nlogPayloads.length}개\n`);

  // 공통 필드 분석
  const envFields = new Map();
  const evtTypes = new Map();

  nlogPayloads.forEach(({ data }) => {
    // env 필드 (환경 정보)
    if (data.env) {
      Object.keys(data.env).forEach(key => {
        if (!envFields.has(key)) {
          envFields.set(key, { count: 0, samples: [] });
        }
        envFields.get(key).count++;
        if (envFields.get(key).samples.length < 3) {
          envFields.get(key).samples.push(data.env[key]);
        }
      });
    }

    // 이벤트 타입
    if (data.evt?.type) {
      evtTypes.set(data.evt.type, (evtTypes.get(data.evt.type) || 0) + 1);
    }
    if (data.evts) {
      data.evts.forEach(e => {
        if (e.type) evtTypes.set(e.type, (evtTypes.get(e.type) || 0) + 1);
      });
    }
  });

  console.log('  [환경 정보 (env) 필드]');
  console.log('  ─────────────────────────────────────────────────────');

  // 핑거프린트 관련 필드 하이라이트
  const fingerprintFields = ['ch_mdl', 'ch_pltf', 'ch_pltfv', 'br_sr', 'device_pr', 'device_type', 'os_type'];
  const sortedFields = [...envFields.entries()].sort((a, b) => b[1].count - a[1].count);

  sortedFields.forEach(([key, info]) => {
    const isFingerprint = fingerprintFields.includes(key);
    const marker = isFingerprint ? '🔍' : '  ';
    const sample = JSON.stringify(info.samples[0])?.substring(0, 40) || 'N/A';
    console.log(`  ${marker} ${key.padEnd(20)} (${info.count}회) → ${sample}`);
  });

  console.log('\n  [이벤트 타입]');
  console.log('  ─────────────────────────────────────────────────────');
  evtTypes.forEach((count, type) => {
    console.log(`    ${type.padEnd(25)} : ${count}회`);
  });

  // ═══════════════════════════════════════════════════════════════
  // scrolllog 분석
  // ═══════════════════════════════════════════════════════════════
  console.log('\n' + '━'.repeat(80));
  console.log('📜 [2] scrolllog URL 분석');
  console.log('━'.repeat(80));
  console.log(`\n수집된 scrolllog 요청: ${scrolllogUrls.length}개\n`);

  // URL 파라미터 분석
  const scrolllogParams = new Map();

  scrolllogUrls.slice(0, 10).forEach(({ url }) => {
    try {
      const urlObj = new URL(url);
      urlObj.searchParams.forEach((value, key) => {
        if (!scrolllogParams.has(key)) {
          scrolllogParams.set(key, { count: 0, samples: [] });
        }
        scrolllogParams.get(key).count++;
        if (scrolllogParams.get(key).samples.length < 2) {
          scrolllogParams.get(key).samples.push(value.substring(0, 50));
        }
      });
    } catch (e) {}
  });

  console.log('  [scrolllog 파라미터]');
  console.log('  ─────────────────────────────────────────────────────');

  scrolllogParams.forEach((info, key) => {
    console.log(`    ${key.padEnd(15)} : ${info.samples[0]?.substring(0, 50)}...`);
  });

  // ═══════════════════════════════════════════════════════════════
  // 봇 탐지 가능성 분석
  // ═══════════════════════════════════════════════════════════════
  console.log('\n' + '━'.repeat(80));
  console.log('🤖 [3] 봇 탐지 관점에서의 분석');
  console.log('━'.repeat(80));

  console.log(`
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ nlog가 수집하는 핵심 정보                                                │
  └─────────────────────────────────────────────────────────────────────────┘

  1. 디바이스 정보 (핑거프린트):
     ─────────────────────────────
     • ch_mdl (Chrome Model): 디바이스 모델명 (SM-S916N 등)
     • ch_pltf (Platform): Android, iOS, Windows 등
     • ch_pltfv (Platform Version): OS 버전
     • br_sr (Browser Screen): 화면 해상도
     • device_pr (Device Pixel Ratio): 픽셀 밀도

     ⚠️ 봇 탐지 포인트:
     - 이 값들이 일관성 있어야 함
     - SM-S916N인데 iPhone UA면 탐지됨
     - 해상도와 DPR이 실제 디바이스와 맞아야 함

  2. 행동 데이터:
     ─────────────────────────────
     • pageview: 페이지 조회
     • impression: 상품/콘텐츠 노출
     • click: 클릭 이벤트 (scrolllog로 전송)
     • scroll: 스크롤 위치 (scrolllog로 전송)

     ⚠️ 봇 탐지 포인트:
     - pageview만 있고 scroll이 없으면 의심
     - 스크롤 없이 페이지 하단 클릭은 불가능
     - 노출 대비 클릭률이 비정상적이면 의심

  3. 세션 정보:
     ─────────────────────────────
     • session_id: 세션 식별자
     • page_id: 페이지별 고유 ID
     • user_id: (로그인 시) 사용자 ID

     ⚠️ 봇 탐지 포인트:
     - 같은 session_id로 다른 핑거프린트면 의심
     - 세션 간 행동 패턴 분석 가능

  ┌─────────────────────────────────────────────────────────────────────────┐
  │ scrolllog가 수집하는 핵심 정보                                           │
  └─────────────────────────────────────────────────────────────────────────┘

  • u (URL): 현재 페이지 URL
  • r (Referrer): 이전 페이지
  • t (Timestamp): 이벤트 시간
  • scr (Scroll): 스크롤 위치/비율
  • imp (Impression): 노출된 상품 ID들
  • clk (Click): 클릭된 상품 정보

  ⚠️ 봇 탐지 포인트:
  - 스크롤 없이 하단 상품 클릭 = 불가능
  - 스크롤 속도가 비현실적이면 의심
  - 노출-클릭 시퀀스가 자연스러워야 함

  `);

  // ═══════════════════════════════════════════════════════════════
  // 최종 결론
  // ═══════════════════════════════════════════════════════════════
  console.log('━'.repeat(80));
  console.log('📌 [4] 최종 결론: 무엇이 정말 중요한가?');
  console.log('━'.repeat(80));

  console.log(`
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ 중요도 순위 (HAR 분석 기반)                                              │
  └─────────────────────────────────────────────────────────────────────────┘

  🥇 1순위: 핑거프린트 일관성 (90% 확신)
     ─────────────────────────────────
     • nlog가 ch_mdl, ch_pltf 등 수집
     • 쿠키와 핑거프린트 매칭 필수
     • 불일치 시 즉시 의심 대상

     → 결론: 페르소나별 고정 핑거프린트 필수

  🥈 2순위: 행동 패턴 자연스러움 (80% 확신)
     ─────────────────────────────────
     • scrolllog가 스크롤/클릭 추적
     • 비현실적 패턴 탐지 가능
     • 노출 없이 클릭 불가능

     → 결론: 자연스러운 스크롤 + 체류시간 필수

  🥉 3순위: IP 평판 (70% 확신)
     ─────────────────────────────────
     • VPN/프록시 IP 탐지
     • 동일 IP 다수 쿠키 = 의심
     • 지역 불일치 = 의심

     → 결론: 깨끗한 IP + 적절한 로테이션

  4순위: 쿠키 일관성 (60% 확신)
     ─────────────────────────────────
     • 세션 연속성 유지
     • 쿠키 갱신 패턴
     • 쿠키-세션 매칭

     → 결론: 쿠키 유지는 필요, "숙성"은 불확실

  5순위: 쿠키 나이/숙성 (30% 확신)
     ─────────────────────────────────
     • NNB에 타임스탬프 없음
     • 서버측 DB 조회 비용 높음
     • False Positive 위험 큼

     → 결론: 과대평가된 것 같음, 우선순위 낮음

  ┌─────────────────────────────────────────────────────────────────────────┐
  │ 실용적 제안                                                              │
  └─────────────────────────────────────────────────────────────────────────┘

  Phase 1 (현재): 핑거프린트 + 행동 패턴에 집중
  ───────────────────────────────────────────────
  • 디바이스 에뮬레이션 품질 향상
  • 자연스러운 스크롤/클릭 구현
  • IP 로테이션 최적화

  Phase 2 (검증 후): 쿠키 숙성 필요성 테스트
  ───────────────────────────────────────────────
  • 신규 쿠키 vs 7일 쿠키 A/B 테스트
  • 차단율 차이 측정
  • 결과에 따라 전략 조정

  핵심: "쿠키 숙성" 기간을 줄이고,
       핑거프린트/행동 품질에 리소스 집중 권장
  `);
}

deepAnalyze();
