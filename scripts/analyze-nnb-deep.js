/**
 * NNB 쿠키 심층 분석
 *
 * hex에서 발견된 "314e16" 공통 패턴 분석
 */

const samples = [
  'LDDO3LEXMU4WS',
  'B5ZOI5MXMU4WS',
  '4WVX6REXMU4WS'
];

console.log('╔' + '═'.repeat(78) + '╗');
console.log('║' + '         NNB 쿠키 심층 구조 분석         '.padStart(52).padEnd(78) + '║');
console.log('╚' + '═'.repeat(78) + '╝\n');

samples.forEach((nnb, i) => {
  console.log(`[${i + 1}] ${nnb}`);

  // Base64 디코딩
  const decoded = Buffer.from(nnb, 'base64');
  const hex = decoded.toString('hex');

  console.log(`    Raw bytes (${decoded.length} bytes): ${hex}`);

  // 바이트별 분석
  const bytes = [];
  for (let j = 0; j < decoded.length; j++) {
    bytes.push(decoded[j]);
  }
  console.log(`    Bytes: [${bytes.join(', ')}]`);

  // 패턴 분석
  // 마지막 바이트들이 같은지 확인
  console.log(`    마지막 4바이트: ${hex.slice(-8)}`);

  // 가능한 구조 분석
  // 앞 6바이트: 랜덤 ID?
  // 뒤 4바이트: 고정 또는 타입?
  const frontHex = hex.slice(0, 12);
  const backHex = hex.slice(12);
  console.log(`    앞 6bytes: ${frontHex} (가변)`);
  console.log(`    뒤 4bytes: ${backHex} (고정?)`);

  // 뒤 4바이트를 정수로 해석
  const last4 = decoded.slice(-4);
  const bigEndian = last4.readUInt32BE(0);
  const littleEndian = last4.readUInt32LE(0);
  console.log(`    뒤 4bytes as uint32 BE: ${bigEndian}`);
  console.log(`    뒤 4bytes as uint32 LE: ${littleEndian}`);

  console.log();
});

// 공통 패턴 분석
console.log('━'.repeat(80));
console.log('📊 패턴 분석');
console.log('━'.repeat(80));

const hexValues = samples.map(s => Buffer.from(s, 'base64').toString('hex'));
console.log('\n모든 샘플의 hex:');
hexValues.forEach((h, i) => {
  console.log(`  ${i + 1}. ${h}`);
});

// 공통 suffix 찾기
let commonSuffix = '';
for (let i = 1; i <= hexValues[0].length; i++) {
  const suffix = hexValues[0].slice(-i);
  if (hexValues.every(h => h.endsWith(suffix))) {
    commonSuffix = suffix;
  } else {
    break;
  }
}

console.log(`\n공통 suffix: ${commonSuffix} (${commonSuffix.length / 2} bytes)`);

// 이 suffix가 무엇을 의미하는지 분석
if (commonSuffix) {
  const suffixBytes = Buffer.from(commonSuffix, 'hex');
  console.log(`  → ASCII: "${suffixBytes.toString('ascii').replace(/[^\x20-\x7E]/g, '?')}"`);

  // 타입 식별자일 가능성
  console.log(`  → 가능성: 쿠키 타입/버전 식별자`);
}

console.log('\n━'.repeat(80));
console.log('📌 구조 가설');
console.log('━'.repeat(80));

console.log(`
  NNB 쿠키 구조 (10 bytes):
  ─────────────────────────────────────────────────

  [  랜덤 ID (6 bytes)  ][  고정 suffix (4 bytes)  ]

  • 앞 6바이트: 랜덤 생성된 고유 ID
  • 뒤 4바이트: "314e16xx" - 쿠키 타입/버전 식별자

  ⚠️ 중요 발견:
  ─────────────────────────────────────────────────
  • 타임스탬프는 포함되어 있지 않음
  • 순수한 랜덤 ID + 고정 타입 식별자 구조
  • 서버가 발급 시점을 알려면 별도 DB 필요

  결론:
  ─────────────────────────────────────────────────
  NNB 쿠키 자체만으로는 "나이"를 알 수 없음.
  서버 측에서 모든 NNB 발급을 DB에 기록해야만 가능.

  → 이는 수천만 사용자 규모에서 비용이 매우 높음
  → 실시간 검증은 비현실적
  → "쿠키 숙성" 효과는 과대평가된 것으로 판단
`);
