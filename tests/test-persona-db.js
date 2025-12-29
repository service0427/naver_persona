/**
 * PersonaDB 테스트
 *
 * 새로운 페르소나 시스템 DB 기능 테스트
 */

import personaDB from '../lib/db/PersonaDB.js';
import PersonaCode from '../lib/persona/PersonaCode.js';
import PersonaProfile from '../lib/persona/PersonaProfile.js';

console.log('╔' + '═'.repeat(68) + '╗');
console.log('║' + '          페르소나 DB 테스트          '.padStart(47).padEnd(68) + '║');
console.log('╚' + '═'.repeat(68) + '╝\n');

async function runTests() {
  try {
    // 1. DB 연결
    console.log('━'.repeat(70));
    console.log('📊 [1] DB 연결 테스트');
    console.log('━'.repeat(70));

    await personaDB.connect();
    console.log('✅ DB 연결 성공\n');

    // 2. 마이그레이션 실행
    console.log('━'.repeat(70));
    console.log('📊 [2] 마이그레이션 테스트');
    console.log('━'.repeat(70));

    await personaDB.runMigration();
    console.log('✅ 마이그레이션 완료\n');

    // 3. 페르소나 생성 테스트
    console.log('━'.repeat(70));
    console.log('📊 [3] 페르소나 생성 테스트');
    console.log('━'.repeat(70));

    // 테스트용 IP 등록
    const testIp = '123.45.67.89';
    await personaDB.registerIp(testIp);
    console.log(`  IP 등록: ${testIp}`);

    // 페르소나 코드 생성 (랜덤 시퀀스로 중복 방지, 3자리)
    const randomSeq = Math.floor(Math.random() * 900) + 100;
    const code = PersonaCode.generate({
      timeSlot: 'D',
      userType: 'W',
      ageGroup: 30,
      gender: 'M',
      sequence: randomSeq
    });
    console.log(`  페르소나 코드: ${code}`);

    // 프로필 생성
    const profile = PersonaProfile.generate(code);
    console.log(`  디바이스: ${profile.device.code} (${profile.device.name})`);

    // DB에 페르소나 생성
    const persona = await personaDB.createPersona({
      code,
      deviceCode: profile.device.code,
      deviceProfile: profile.device,
      behaviorProfile: profile.behavior,
      ipAddress: testIp
    });
    console.log(`  페르소나 생성: ID=${persona.id}`);
    console.log('✅ 페르소나 생성 성공\n');

    // 4. 관심사 추가 테스트
    console.log('━'.repeat(70));
    console.log('📊 [4] 관심사 추가 테스트');
    console.log('━'.repeat(70));

    const interests = [
      { category: 'IT기기', subcategory: '마우스', interestLevel: 0.9, source: 'ai_generated', aiReason: '직장인 업무용' },
      { category: '생활용품', subcategory: '커피용품', interestLevel: 0.7, source: 'ai_generated', aiReason: '직장인 필수품' },
      { category: '패션', subcategory: '비즈니스 캐주얼', interestLevel: 0.5, source: 'initial' }
    ];

    for (const interest of interests) {
      const id = await personaDB.addInterest(persona.id, interest);
      console.log(`  관심사 추가: ${interest.category}/${interest.subcategory} (ID: ${id})`);
    }
    console.log('✅ 관심사 추가 성공\n');

    // 5. 검색어 추가 테스트
    console.log('━'.repeat(70));
    console.log('📊 [5] 검색어 추가 테스트');
    console.log('━'.repeat(70));

    const keywords = [
      { keyword: '무선 마우스 추천', keywordType: 'info', source: 'ai_generated' },
      { keyword: '손목 통증 마우스', keywordType: 'problem', source: 'ai_generated' },
      { keyword: '로지텍 vs 마이크로소프트', keywordType: 'comparison', source: 'ai_generated' },
      { keyword: '로지텍 MX Master 3', keywordType: 'purchase', source: 'ai_generated' }
    ];

    for (const kw of keywords) {
      const id = await personaDB.addKeyword(persona.id, kw);
      console.log(`  검색어 추가: "${kw.keyword}" (${kw.keywordType}) - ID: ${id}`);
    }
    console.log('✅ 검색어 추가 성공\n');

    // 6. 타겟 상품 등록 테스트
    console.log('━'.repeat(70));
    console.log('📊 [6] 타겟 상품 등록 테스트');
    console.log('━'.repeat(70));

    const targetProductId = await personaDB.createTargetProduct({
      productName: '로지텍 MX Master 3',
      productCategory: 'IT기기',
      productUrl: 'https://shopping.naver.com/...',
      productKeywords: ['무선 마우스', '인체공학 마우스', 'MX Master'],
      clientId: 'test-client',
      priority: 3,
      targetPersonaTypes: ['W3M', 'W3F', 'F3M'],
      targetAgeGroups: ['3', '4'],
      dailyTarget: 50
    });
    console.log(`  타겟 상품 등록: ID=${targetProductId}`);
    console.log('✅ 타겟 상품 등록 성공\n');

    // 7. 클릭 시나리오 생성 테스트
    console.log('━'.repeat(70));
    console.log('📊 [7] 클릭 시나리오 생성 테스트');
    console.log('━'.repeat(70));

    const scenarios = [
      {
        targetProductId,
        scenarioName: '직접 검색 후 구매',
        scenarioType: 'direct',
        preClickActions: [
          { type: 'search', keyword: '무선 마우스 추천', dwell: [30, 60] },
          { type: 'scroll', amount: '30%' },
          { type: 'view_product', position: 'top5', dwell: [15, 25] },
          { type: 'back' }
        ],
        targetClickAction: {
          dwell: [120, 300],
          scroll: 'full',
          view_reviews: true,
          view_details: true
        },
        postClickActions: [
          { type: 'back_to_list', dwell: [5, 10] },
          { type: 'exit', prob: 0.6 }
        ],
        weight: 30
      },
      {
        targetProductId,
        scenarioName: '비교 쇼핑 후 선택',
        scenarioType: 'compare',
        preClickActions: [
          { type: 'search', keyword: '로지텍 마우스', dwell: [40, 80] },
          { type: 'view_product', position: 'top3', dwell: [20, 35] },
          { type: 'back' },
          { type: 'view_product', position: 'top3', dwell: [25, 40] },
          { type: 'back' },
          { type: 'scroll', amount: '50%' }
        ],
        targetClickAction: {
          dwell: [180, 360],
          scroll: 'full',
          view_reviews: true,
          view_details: true,
          add_to_wishlist: 0.3
        },
        postClickActions: [
          { type: 'back_to_list' },
          { type: 'exit', prob: 0.8 }
        ],
        weight: 40
      }
    ];

    for (const scenario of scenarios) {
      const id = await personaDB.createClickScenario(scenario);
      console.log(`  시나리오 생성: "${scenario.scenarioName}" (weight: ${scenario.weight}) - ID: ${id}`);
    }
    console.log('✅ 클릭 시나리오 생성 성공\n');

    // 8. 시나리오 랜덤 선택 테스트
    console.log('━'.repeat(70));
    console.log('📊 [8] 시나리오 랜덤 선택 테스트');
    console.log('━'.repeat(70));

    const selectionCounts = {};
    for (let i = 0; i < 100; i++) {
      const selected = await personaDB.selectRandomScenario(targetProductId);
      if (selected) {
        selectionCounts[selected.scenarioName] = (selectionCounts[selected.scenarioName] || 0) + 1;
      }
    }

    console.log('  100회 선택 결과 (가중치 기반):');
    for (const [name, count] of Object.entries(selectionCounts)) {
      console.log(`    ${name}: ${count}회 (${count}%)`);
    }
    console.log('✅ 시나리오 선택 테스트 성공\n');

    // 9. 체류 시간 설정 테스트
    console.log('━'.repeat(70));
    console.log('📊 [9] 체류 시간 설정 테스트');
    console.log('━'.repeat(70));

    const contexts = ['target_product', 'comparison_product', 'search_result'];
    const ageGroups = ['2', '3', '4', '5'];

    for (const context of contexts) {
      console.log(`\n  [${context}]`);
      for (const age of ageGroups) {
        const dwellTime = await personaDB.calculateDwellTime(context, age);
        console.log(`    ${age}0대: ${dwellTime.min}~${dwellTime.max}초`);
      }
    }
    console.log('\n✅ 체류 시간 설정 테스트 성공\n');

    // 10. AI 학습 큐 테스트
    console.log('━'.repeat(70));
    console.log('📊 [10] AI 학습 큐 테스트');
    console.log('━'.repeat(70));

    const taskId = await personaDB.enqueueAiTask({
      taskType: 'generate_interests',
      personaId: persona.id,
      inputData: {
        targetCategory: 'IT기기'
      },
      priority: 3
    });
    console.log(`  AI 작업 추가: ID=${taskId}`);

    const task = await personaDB.getNextAiTask();
    if (task) {
      console.log(`  대기 중 작업: ${task.taskType} (priority: ${task.priority})`);

      // 작업 완료 처리
      await personaDB.completeAiTask(task.id, {
        interests: [{ category: 'IT기기', level: 0.8 }]
      });
      console.log(`  작업 완료 처리됨`);
    }
    console.log('✅ AI 학습 큐 테스트 성공\n');

    // 11. 현재 시간대 페르소나 조회
    console.log('━'.repeat(70));
    console.log('📊 [11] 시간대별 페르소나 조회');
    console.log('━'.repeat(70));

    const currentTimeSlot = personaDB.getCurrentTimeSlot();
    console.log(`  현재 시간대: ${currentTimeSlot}`);

    // 페르소나 상태를 ready로 변경
    await personaDB.updatePersonaStatus(persona.id, 'ready');

    const personas = await personaDB.getPersonasForCurrentTimeSlot({
      ipAddress: testIp,
      status: ['ready', 'active']
    });
    console.log(`  현재 시간대 페르소나: ${personas.length}개`);
    personas.forEach(p => {
      console.log(`    - ${p.code} (${p.status})`);
    });
    console.log('✅ 시간대별 페르소나 조회 성공\n');

    // 12. 통계 조회
    console.log('━'.repeat(70));
    console.log('📊 [12] 통계 조회');
    console.log('━'.repeat(70));

    const todayStats = await personaDB.getTodayStats();
    console.log('  오늘 통계:');
    console.log(`    총 세션: ${todayStats.total_sessions}`);
    console.log(`    성공: ${todayStats.success_count}`);
    console.log(`    차단: ${todayStats.blocked_count}`);

    const aiQueueStatus = await personaDB.getAiQueueStatus();
    console.log('\n  AI 큐 상태:');
    aiQueueStatus.forEach(s => {
      console.log(`    ${s.task_type} (${s.status}): ${s.count}건`);
    });
    console.log('✅ 통계 조회 성공\n');

    console.log('━'.repeat(70));
    console.log('🎉 모든 테스트 완료!');
    console.log('━'.repeat(70));

  } catch (error) {
    console.error('\n❌ 테스트 실패:', error);
    console.error(error.stack);
  } finally {
    await personaDB.close();
  }
}

// 테스트 실행
runTests();
