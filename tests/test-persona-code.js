/**
 * PersonaCode / PersonaProfile 테스트
 */

import PersonaCode from '../lib/persona/PersonaCode.js';
import PersonaProfile from '../lib/persona/PersonaProfile.js';

console.log('╔' + '═'.repeat(68) + '╗');
console.log('║' + '       페르소나 코드 & 프로필 테스트       '.padStart(47).padEnd(68) + '║');
console.log('╚' + '═'.repeat(68) + '╝\n');

// 1. 코드 생성 테스트
console.log('━'.repeat(70));
console.log('📝 [1] 코드 생성 테스트');
console.log('━'.repeat(70));

const code1 = PersonaCode.generate({
  timeSlot: 'D',
  userType: 'W',
  ageGroup: 30,
  gender: 'M',
  sequence: 1
});
console.log(`\n생성된 코드: ${code1}`);
console.log(`설명: ${PersonaCode.getDescription(code1)}`);

// 2. 코드 파싱 테스트
console.log('\n' + '━'.repeat(70));
console.log('🔍 [2] 코드 파싱 테스트');
console.log('━'.repeat(70));

const parsed = PersonaCode.parse('EH4F-002');
console.log('\n파싱 결과:');
console.log(`  코드: ${parsed.code}`);
console.log(`  시간대: ${parsed.timeSlot.label} (${parsed.timeSlot.start}:00~${parsed.timeSlot.end}:00)`);
console.log(`  유형: ${parsed.userType.label}`);
console.log(`  연령: ${parsed.ageGroup.range}`);
console.log(`  성별: ${parsed.gender.label}`);
console.log(`  순번: ${parsed.sequence}`);
console.log(`  설명: ${parsed.description}`);

// 3. 현재 시간대 테스트
console.log('\n' + '━'.repeat(70));
console.log('⏰ [3] 현재 시간대 확인');
console.log('━'.repeat(70));

const currentSlot = PersonaCode.getCurrentTimeSlot();
const hour = new Date().getHours();
console.log(`\n현재 시각: ${hour}시`);
console.log(`현재 시간대: ${currentSlot}`);
console.log(`권장 페르소나 수: ${PersonaCode.getRecommendedCount(currentSlot)}개`);

// 4. 표준 페르소나 그룹 생성
console.log('\n' + '━'.repeat(70));
console.log('👥 [4] 표준 페르소나 그룹 (30개)');
console.log('━'.repeat(70));

const group = PersonaCode.generateStandardGroup();
console.log(`\n총 ${group.length}개 페르소나:\n`);

const byTimeSlot = {};
group.forEach(p => {
  if (!byTimeSlot[p.timeSlot]) byTimeSlot[p.timeSlot] = [];
  byTimeSlot[p.timeSlot].push(p.code);
});

Object.entries(byTimeSlot).forEach(([slot, codes]) => {
  const slotName = { M: '아침', D: '주간', E: '저녁', N: '야간', L: '새벽' }[slot];
  console.log(`[${slot}] ${slotName} (${codes.length}개):`);
  console.log(`    ${codes.join(', ')}`);
});

// 5. 프로필 생성 테스트
console.log('\n' + '━'.repeat(70));
console.log('📱 [5] 프로필 생성 테스트');
console.log('━'.repeat(70));

const profile = PersonaProfile.generate('DW3M-001');
console.log(`\n코드: ${profile.code}`);
console.log(`설명: ${profile.description}`);
console.log('\n[디바이스]');
console.log(`  ${profile.device.name} (${profile.device.model})`);
console.log(`  화면: ${profile.device.viewport.width}x${profile.device.viewport.height}`);
console.log(`  DPR: ${profile.device.deviceScaleFactor}`);
console.log('\n[행동 패턴]');
console.log(`  스크롤 속도: ${profile.behavior.scrollSpeed.label} (${profile.behavior.scrollSpeed.min}~${profile.behavior.scrollSpeed.max} px/ms)`);
console.log(`  세션 길이: ${profile.behavior.sessionDuration.type} (${profile.behavior.sessionDuration.min}~${profile.behavior.sessionDuration.max}분)`);
console.log(`  클릭 패턴: ${profile.behavior.clickPattern.type}`);
console.log(`  검색 비율: ${(profile.behavior.searchRatio * 100).toFixed(0)}%`);
console.log('\n[관심 카테고리]');
console.log(`  ${profile.interests.join(', ')}`);

// 6. 다양한 페르소나 프로필 비교
console.log('\n' + '━'.repeat(70));
console.log('📊 [6] 페르소나별 프로필 비교');
console.log('━'.repeat(70));

const testCodes = ['DW3M-001', 'DH4F-001', 'ES2F-001', 'NS2M-001', 'LF3M-001'];
console.log('\n');
console.log('코드'.padEnd(12) + '디바이스'.padEnd(20) + '스크롤'.padEnd(10) + '세션'.padEnd(10) + '검색비율');
console.log('─'.repeat(62));

testCodes.forEach(code => {
  const p = PersonaProfile.generate(code);
  console.log(
    code.padEnd(12) +
    p.device.name.substring(0, 18).padEnd(20) +
    p.behavior.scrollSpeed.label.padEnd(10) +
    p.behavior.sessionDuration.type.padEnd(10) +
    `${(p.behavior.searchRatio * 100).toFixed(0)}%`
  );
});

// 7. 유효성 검사 테스트
console.log('\n' + '━'.repeat(70));
console.log('✅ [7] 유효성 검사');
console.log('━'.repeat(70));

const validCodes = ['DW3M-001', 'EH4F-002', 'NS2M-010'];
const invalidCodes = ['DW3M-1', 'XW3M-001', 'DW6M-001', 'DW3X-001'];

console.log('\n유효한 코드:');
validCodes.forEach(c => console.log(`  ${c}: ${PersonaCode.isValid(c) ? '✅' : '❌'}`));

console.log('\n무효한 코드:');
invalidCodes.forEach(c => console.log(`  ${c}: ${PersonaCode.isValid(c) ? '✅' : '❌'}`));

console.log('\n' + '━'.repeat(70));
console.log('✅ 테스트 완료');
console.log('━'.repeat(70));
