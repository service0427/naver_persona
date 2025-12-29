/**
 * HAR 파일에서 nlog.naver.com 요청 분석
 *
 * nlog는 네이버의 통합 행동 추적 시스템으로:
 * - 페이지 조회 (pageview)
 * - 노출 추적 (impression)
 * - 클릭 추적
 * - 디바이스/브라우저 정보
 * - 세션 정보
 * 등을 수집한다.
 *
 * 실행: node scripts/analyze-nlog.js [har-file-path]
 */

import fs from 'fs';

const harPath = process.argv[2] || './har/nid.naver.com.har';

function analyzeNlog() {
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + '        nlog.naver.com 요청 분석        '.padStart(44).padEnd(68) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');
  console.log(`\n파일: ${harPath}\n`);

  const har = JSON.parse(fs.readFileSync(harPath, 'utf8'));

  // nlog 요청 추출
  const nlogRequests = har.log.entries.filter(e => e.request.url.includes('nlog.naver.com/n'));
  console.log('총 nlog 요청 수:', nlogRequests.length);

  // 요청 타임라인 분석
  console.log('\n' + '='.repeat(70));
  console.log('📊 요청 타임라인');
  console.log('='.repeat(70));

  const byOrigin = {};
  nlogRequests.forEach((entry, i) => {
    const origin = entry.request.headers.find(h => h.name.toLowerCase() === 'origin')?.value || 'unknown';
    const bodySize = entry.request.headers.find(h => h.name.toLowerCase() === 'content-length')?.value || 0;
    if (!byOrigin[origin]) byOrigin[origin] = [];
    byOrigin[origin].push({ index: i + 1, time: entry.startedDateTime, bodySize: parseInt(bodySize) });
  });

  Object.entries(byOrigin).forEach(([origin, requests]) => {
    const totalSize = requests.reduce((sum, r) => sum + r.bodySize, 0);
    console.log(`\n${origin} (${requests.length}회, 총 ${(totalSize / 1024).toFixed(1)}KB)`);
    requests.forEach(r => {
      console.log(`  [${r.index.toString().padStart(2)}] ${r.time} - ${(r.bodySize / 1024).toFixed(1)}KB`);
    });
  });

  // postData 분석
  console.log('\n' + '='.repeat(70));
  console.log('📦 POST Body 분석');
  console.log('='.repeat(70));

  const withPostData = nlogRequests.filter(e => e.request.postData?.text);
  console.log(`\npostData 캡처된 요청: ${withPostData.length}/${nlogRequests.length}`);
  console.log('(나머지는 HAR 녹화 한계로 body 미캡처, Content-Length만 존재)\n');

  // 이벤트 타입 분석
  const eventTypes = {};
  withPostData.forEach((entry) => {
    try {
      const data = JSON.parse(entry.request.postData.text);
      // evt.type 또는 evts[].type 추출
      if (data.evt?.type) {
        eventTypes[data.evt.type] = (eventTypes[data.evt.type] || 0) + 1;
      }
      if (data.evts) {
        data.evts.forEach(e => {
          if (e.type) eventTypes[e.type] = (eventTypes[e.type] || 0) + 1;
        });
      }
    } catch (e) {}
  });

  if (Object.keys(eventTypes).length > 0) {
    console.log('이벤트 타입:');
    Object.entries(eventTypes).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}회`);
    });
  }

  // 페이로드 구조 분석
  console.log('\n' + '='.repeat(70));
  console.log('🔍 페이로드 구조 분석');
  console.log('='.repeat(70));

  withPostData.forEach((entry, i) => {
    console.log(`\n[${i + 1}] ───────────────────────────────────────`);
    try {
      const data = JSON.parse(entry.request.postData.text);

      console.log(`svc: ${data.svc || 'N/A'}`);
      console.log(`env.device_type: ${data.env?.device_type || 'N/A'}`);
      console.log(`env.os_type: ${data.env?.os_type || 'N/A'}`);
      console.log(`tool: ${data.tool?.name} v${data.tool?.ver || 'N/A'}`);

      if (data.evt) {
        console.log(`evt.type: ${data.evt.type}`);
        console.log(`evt.page_url: ${data.evt.page_url?.substring(0, 60)}...`);
        if (data.evt.imp_cids) {
          console.log(`evt.imp_cids: ${data.evt.imp_cids.length}개 상품 노출`);
        }
      }

      if (data.evts) {
        console.log(`evts: ${data.evts.length}개 이벤트`);
        data.evts.forEach((e, j) => {
          console.log(`  [${j}] ${e.type} - ${e.page_url?.substring(0, 50)}...`);
        });
      }

      // 디바이스 정보 (env)
      if (data.env?.ch_mdl) {
        console.log(`device: ${data.env.ch_mdl} (${data.env.ch_pltf} ${data.env.ch_pltfv})`);
        console.log(`screen: ${data.env.br_sr}, dpr: ${data.env.device_pr}`);
      }
    } catch (e) {
      console.log('파싱 실패:', e.message);
    }
  });

  // 핵심 인사이트
  console.log('\n' + '='.repeat(70));
  console.log('💡 핵심 인사이트');
  console.log('='.repeat(70));
  console.log(`
  1. nlog는 네이버의 통합 행동 추적 시스템
  2. POST body로 JSON 데이터 전송 (text/plain MIME type)
  3. 주요 추적 항목:
     - pageview: 페이지 조회
     - custom.impression: 상품/콘텐츠 노출
     - timing: 페이지 로딩 성능 데이터
  4. 환경 정보 포함:
     - 디바이스 모델 (ch_mdl: SM-S916N)
     - 플랫폼/버전 (ch_pltf: Android, ch_pltfv: 16.0.0)
     - 화면 해상도 (br_sr: 384x701)
     - 픽셀 비율 (device_pr: 2.8125)
  5. 세션 추적:
     - session_id로 세션 연속성 추적
     - page_id로 페이지별 구분

  ⚠️ 봇 감지 관점:
  - nlog 미전송 = 행동 추적 데이터 없음 = 의심 대상
  - 하지만 nlog는 JS SDK가 자동으로 전송하므로
    페이지가 제대로 렌더링되면 자동 발생
  - 직접 구현 불필요 (scrolllog와 다름)
  `);
}

analyzeNlog();
