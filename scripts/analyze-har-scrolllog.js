/**
 * HAR 파일에서 scrolllog 분석
 */

import fs from 'fs';
import path from 'path';

const harPath = process.argv[2] || './har/nid.naver.com.har';

function analyzeHar() {
  console.log('='.repeat(60));
  console.log('HAR ScrollLog 분석');
  console.log('='.repeat(60));
  console.log(`파일: ${harPath}\n`);

  const har = JSON.parse(fs.readFileSync(harPath, 'utf8'));

  // scrolllog 요청만 추출
  const scrollLogs = har.log.entries
    .filter(e => e.request.url.includes('scrolllog'))
    .map(e => {
      const url = new URL(e.request.url);
      const slogs = url.searchParams.get('slogs');
      if (!slogs) return null;
      try {
        return JSON.parse(slogs);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .flat();

  console.log('총 ScrollLog 이벤트 수:', scrollLogs.length);

  // 이벤트 타입별 분류
  const byType = {};
  scrollLogs.forEach(log => {
    byType[log.t] = (byType[log.t] || 0) + 1;
  });
  console.log('\n이벤트 타입 분포:');
  Object.entries(byType).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}회`);
  });

  // pt (timestamp) 분석 - scroll 이벤트의 duration
  const scrollEvents = scrollLogs.filter(log => log.t === 'scroll');
  console.log('\n' + '='.repeat(60));
  console.log('Scroll 이벤트 Duration 분석');
  console.log('='.repeat(60));
  console.log(`Scroll 이벤트 수: ${scrollEvents.length}`);

  const durations = [];
  scrollEvents.forEach((log, i) => {
    if (log.pt && typeof log.pt === 'string' && log.pt.includes(':')) {
      const [start, end] = log.pt.split(':').map(Number);
      const duration = end - start;
      durations.push(duration);
      console.log(`  [${i + 1}] duration: ${duration}ms`);
    }
  });

  if (durations.length > 0) {
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    console.log(`\n  통계: min=${min}ms, max=${max}ms, avg=${Math.round(avg)}ms`);
  }

  // tsi (Total Scroll Info) 분석
  console.log('\n' + '='.repeat(60));
  console.log('TSI (Total Scroll Info) 분석');
  console.log('='.repeat(60));
  console.log('tsi 형식: 문서높이:현재Y:누적스크롤\n');

  let prevY = 0;
  let prevTotal = 0;
  scrollLogs.forEach((log, i) => {
    if (log.tsi) {
      const [docHeight, currentY, totalScroll] = log.tsi.split(':').map(Number);
      const yDiff = currentY - prevY;
      const totalDiff = totalScroll - prevTotal;
      console.log(`  [${i + 1}] type:${log.t.padEnd(7)} | Y:${String(currentY).padStart(5)} (Δ${String(yDiff).padStart(5)}) | 누적:${String(totalScroll).padStart(5)} (Δ${String(totalDiff).padStart(5)})`);
      prevY = currentY;
      prevTotal = totalScroll;
    }
  });

  // 이벤트 순서 분석
  console.log('\n' + '='.repeat(60));
  console.log('이벤트 순서');
  console.log('='.repeat(60));
  const sequence = scrollLogs.map(log => log.t);
  console.log(sequence.join(' → '));

  // al (Area Log) 분석 - 어떤 영역이 보였는지
  console.log('\n' + '='.repeat(60));
  console.log('노출된 영역 (Area Log)');
  console.log('='.repeat(60));
  const areas = new Set();
  scrollLogs.forEach(log => {
    if (log.al) {
      log.al.split('|').forEach(area => {
        const [code] = area.split(':');
        areas.add(code);
      });
    }
  });
  console.log([...areas].join(', '));

  // cl (Component Log) 분석 - 어떤 상품이 보였는지
  console.log('\n' + '='.repeat(60));
  console.log('노출된 상품 (Component Log)');
  console.log('='.repeat(60));
  const products = new Set();
  scrollLogs.forEach(log => {
    if (log.cl) {
      log.cl.split('|').forEach(comp => {
        const parts = comp.split(':');
        if (parts[1]) {
          products.add(parts[1]);
        }
      });
    }
  });
  console.log(`총 ${products.size}개 상품 노출`);
  console.log([...products].slice(0, 10).join('\n'));
  if (products.size > 10) {
    console.log(`... 외 ${products.size - 10}개`);
  }
}

analyzeHar();
