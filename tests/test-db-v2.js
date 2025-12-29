#!/usr/bin/env node
/**
 * DatabaseV2 테스트 스크립트
 *
 * v2 스키마 적용 및 기본 기능 테스트
 */

import dbV2 from '../lib/db/DatabaseV2.js';
import os from 'os';

async function test() {
  console.log('='.repeat(60));
  console.log('DatabaseV2 테스트 시작');
  console.log('='.repeat(60));

  try {
    // 1. 연결 및 테이블 초기화
    console.log('\n[1] DB 연결 및 v2 테이블 초기화...');
    await dbV2.connect();
    console.log('✓ 연결 성공');

    // 2. PC 등록
    console.log('\n[2] PC 등록...');
    const pcId = await dbV2.registerPC({
      pcId: `pc-${os.hostname()}`,
      hostname: os.hostname(),
      ipAddress: '127.0.0.1',  // 테스트용
      osVersion: `${os.platform()} ${os.release()}`,
      chromeVersion: '130.0.6723.91',
      vpnCount: 7,
      maxLoad: 10
    });
    console.log(`✓ PC 등록: ${pcId}`);

    // 3. 테스트 페르소나 생성
    console.log('\n[3] 테스트 페르소나 생성...');
    const testPersonaId = `test-persona-${Date.now()}`;
    await dbV2.createPersona({
      id: testPersonaId,
      name: '테스트 페르소나',
      baseProfile: 'galaxy-s23',
      chromeVersion: '130.0.6723.91',
      fingerprint: {
        navigator: {
          hardwareConcurrency: 8,
          deviceMemory: 8
        },
        screen: {
          width: 1080,
          height: 2340
        },
        webgl: {
          renderer: 'Adreno (TM) 740'
        },
        uniqueSeed: 'test-seed-12345'
      }
    });
    console.log(`✓ 페르소나 생성: ${testPersonaId}`);

    // 4. 페르소나 조회
    console.log('\n[4] 페르소나 조회...');
    const persona = await dbV2.getPersona(testPersonaId);
    console.log('✓ 조회 결과:');
    console.log(`  - ID: ${persona.id}`);
    console.log(`  - 이름: ${persona.name}`);
    console.log(`  - 상태: ${persona.status}`);
    console.log(`  - 핑거프린트: ${JSON.stringify(persona.fingerprint?.navigator)}`);

    // 5. 스토리지 상태 저장
    console.log('\n[5] 스토리지 상태 저장...');
    const mockStorageState = {
      cookies: [
        { name: 'NNB', value: 'test-nnb-value', domain: '.naver.com', path: '/' },
        { name: 'NAC', value: 'test-nac-value', domain: '.naver.com', path: '/' }
      ],
      origins: [
        {
          origin: 'https://www.naver.com',
          localStorage: [
            { name: 'test_key', value: 'test_value' }
          ]
        }
      ]
    };
    await dbV2.saveStorageState(testPersonaId, mockStorageState, {
      vpnIp: '123.45.67.89',
      pcId
    });
    console.log('✓ 스토리지 상태 저장 완료');

    // 6. 스토리지 상태 로드
    console.log('\n[6] 스토리지 상태 로드...');
    const loadedState = await dbV2.loadStorageState(testPersonaId);
    console.log(`✓ 쿠키 수: ${loadedState?.cookies?.length || 0}`);
    console.log(`✓ 오리진 수: ${loadedState?.origins?.length || 0}`);

    // 7. 실행 로그 저장
    console.log('\n[7] 실행 로그 저장...');
    const logId = await dbV2.logExecution({
      personaId: testPersonaId,
      vpnIp: '123.45.67.89',
      vpnAgent: 'dongle-1',
      chromeVersion: '130.0.6723.91',
      action: 'aging',
      targetUrl: 'https://www.naver.com',
      result: '성공',
      durationMs: 5000
    });
    console.log(`✓ 로그 ID: ${logId}`);

    // 8. 페르소나 다시 조회 (통계 업데이트 확인)
    console.log('\n[8] 업데이트된 페르소나 확인...');
    const updatedPersona = await dbV2.getPersona(testPersonaId);
    console.log(`✓ 총 사용: ${updatedPersona.totalUses}`);
    console.log(`✓ 성공: ${updatedPersona.successCount}`);
    console.log(`✓ 마지막 VPN IP: ${updatedPersona.lastVpnIp}`);

    // 9. 숙성 큐에 작업 추가
    console.log('\n[9] 숙성 큐 테스트...');
    await dbV2.enqueueAging(testPersonaId, 3);  // 우선순위 3
    console.log('✓ 작업 추가됨');

    // 10. 작업 가져오기
    const task = await dbV2.dequeueAging();
    if (task) {
      console.log(`✓ 작업 할당: persona=${task.personaId}, priority=${task.priority}`);
      await dbV2.completeAging(task.queueId, logId, true);
      console.log('✓ 작업 완료 처리');
    }

    // 11. 통계 조회
    console.log('\n[10] 통계 조회...');
    const stats = await dbV2.getTodayStats();
    console.log('✓ 오늘 통계:');
    console.log(`  - 총 실행: ${stats.total_runs}`);
    console.log(`  - 성공: ${stats.success}`);
    console.log(`  - 성공률: ${stats.success_rate}%`);

    // 12. PC 상태 조회
    const pcStatus = await dbV2.getPCStatus();
    console.log('\n✓ PC 상태:');
    for (const pc of pcStatus) {
      console.log(`  - ${pc.pc_id}: ${pc.status} (load: ${pc.current_load}/${pc.max_load})`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('모든 테스트 통과! ✓');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ 테스트 실패:', error);
    console.error(error.stack);
  } finally {
    await dbV2.close();
  }
}

test();
