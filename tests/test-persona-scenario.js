/**
 * PersonaScenario 테스트
 */

import PersonaScenario from '../lib/persona/PersonaScenario.js';

console.log('╔' + '═'.repeat(68) + '╗');
console.log('║' + '         페르소나 시나리오 테스트         '.padStart(47).padEnd(68) + '║');
console.log('╚' + '═'.repeat(68) + '╝\n');

// 테스트 케이스들
const testCases = [
  {
    personaCode: 'DS2M-001',
    targetProduct: '게이밍 마우스',
    productCategory: '전자기기',
    daysBeforePurchase: 5,
    description: '20대 남성 학생 - 게이밍 마우스'
  },
  {
    personaCode: 'DW3F-001',
    targetProduct: '에어프라이어',
    productCategory: '생활용품',
    daysBeforePurchase: 4,
    description: '30대 여성 직장인 - 에어프라이어'
  },
  {
    personaCode: 'DH4F-001',
    targetProduct: '아기 식기세트',
    productCategory: '육아',
    daysBeforePurchase: 5,
    description: '40대 여성 주부 - 아기 식기세트'
  }
];

testCases.forEach((testCase, idx) => {
  console.log('━'.repeat(70));
  console.log(`📋 [${idx + 1}] ${testCase.description}`);
  console.log('━'.repeat(70));

  const scenario = PersonaScenario.generate(testCase);

  console.log(`\n페르소나: ${scenario.personaCode}`);
  console.log(`타겟 상품: ${scenario.targetProduct}`);
  console.log(`카테고리: ${scenario.productCategory}`);
  console.log(`학습 기간: ${scenario.totalDays}일`);

  console.log(`\n[관심사]`);
  console.log(`  ${scenario.interests.join(', ')}`);

  console.log(`\n[검색어 흐름]`);
  scenario.searchFlow.forEach((step, i) => {
    console.log(`  ${i + 1}. [${step.phase}] "${step.keyword}" → ${step.service}`);
  });

  console.log(`\n[일별 시나리오]`);
  scenario.dailyScenarios.forEach(day => {
    console.log(`\n  Day ${day.day} (${day.phase}):`);
    day.actions.forEach(action => {
      const keyword = action.keyword ? ` "${action.keyword}"` : '';
      const duration = `${Math.floor(action.duration.min / 60)}~${Math.floor(action.duration.max / 60)}분`;
      console.log(`    • ${action.service}${keyword} (${duration})`);
    });
  });

  console.log('\n');
});

// URL 확인
console.log('━'.repeat(70));
console.log('🔗 서비스 URL 확인');
console.log('━'.repeat(70));

const urls = PersonaScenario.getServiceUrls();
Object.entries(urls).slice(0, 5).forEach(([service, info]) => {
  console.log(`\n  ${service}:`);
  console.log(`    모바일: ${info.mobile || info.base}`);
  if (info.search) console.log(`    검색: ${info.search}...`);
});

console.log('\n' + '━'.repeat(70));
console.log('✅ 테스트 완료');
console.log('━'.repeat(70));
