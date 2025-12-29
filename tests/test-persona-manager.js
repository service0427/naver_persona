#!/usr/bin/env node
/**
 * PersonaManager 통합 테스트
 */

import PersonaManager from '../lib/core/PersonaManager.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';

const TEST_STORAGE = '/tmp/pm-test-storage';

async function test() {
  console.log('='.repeat(60));
  console.log('PersonaManager 통합 테스트');
  console.log('='.repeat(60));

  const pm = new PersonaManager({
    storageDir: TEST_STORAGE,
    pcId: 'test-pc-01'
  });

  const testPersonaId = uuidv4();

  try {
    // 1. 연결
    console.log('\n[1] 연결...');
    await pm.connect();
    console.log('  ✓ DB 연결 완료');

    // 2. 페르소나 생성
    console.log('\n[2] 페르소나 생성...');
    await pm.create({
      id: testPersonaId,
      fingerprint: {
        navigator: { hardwareConcurrency: 8, deviceMemory: 8 },
        screen: { width: 1080, height: 2340 },
        webgl: { renderer: 'Adreno (TM) 740' }
      },
      baseProfile: 'galaxy-s23',
      chromeVersion: '130.0.6723.91'
    });
    console.log(`  ✓ 생성: ${testPersonaId}`);

    // 3. 조회
    console.log('\n[3] 페르소나 조회...');
    const persona = await pm.get(testPersonaId);
    console.log(`  ID: ${persona.id}`);
    console.log(`  상태: ${persona.status}`);
    console.log(`  핑거프린트: ${persona.fingerprint ? '✓' : '✗'}`);

    // 4. 세션 준비 (쿠키 복원 시뮬레이션)
    console.log('\n[4] 세션 준비...');
    const tempProfile = '/tmp/pm-test-profile';
    await fs.mkdir(path.join(tempProfile, 'Default'), { recursive: true });

    // 더미 쿠키 생성
    await fs.writeFile(path.join(tempProfile, 'Default', 'Cookies'), 'test-cookies');
    await fs.writeFile(path.join(tempProfile, 'Local State'), '{}');

    // 먼저 저장
    await pm.saveSession(testPersonaId, {
      profileDir: tempProfile,
      checkpoint: 'test-checkpoint',
      vpnIp: '1.2.3.4',
      result: '성공',
      durationMs: 5000
    });
    console.log('  ✓ 세션 저장 완료');

    // 복원 테스트
    const restoreProfile = '/tmp/pm-test-profile-restore';
    const { restored, fingerprint } = await pm.prepareSession(testPersonaId, restoreProfile);
    console.log(`  복원: ${restored ? '✓' : '✗'}`);
    console.log(`  핑거프린트 로드: ${fingerprint ? '✓' : '✗'}`);

    // 5. 업데이트된 데이터 확인
    console.log('\n[5] 업데이트 확인...');
    const updated = await pm.get(testPersonaId);
    console.log(`  총 사용: ${updated.totalUses}`);
    console.log(`  성공: ${updated.successCount}`);
    console.log(`  마지막 VPN: ${updated.lastVpnIp}`);

    // 6. 숙성 레벨 업데이트
    console.log('\n[6] 숙성 레벨 업데이트...');
    await pm.updateAgingLevel(testPersonaId, 3);
    const afterLevel = await pm.get(testPersonaId);
    console.log(`  숙성 레벨: ${afterLevel.agingLevel}`);

    // 7. 작업 큐 테스트
    console.log('\n[7] 작업 큐 테스트...');
    await pm.enqueue(testPersonaId, 2);
    console.log('  ✓ 큐에 추가');

    const task = await pm.dequeue();
    if (task) {
      console.log(`  가져온 작업: ${task.personaId}`);
      console.log(`  우선순위: ${task.priority}`);
      await pm.completeQueue(task.queueId, true);
      console.log('  ✓ 작업 완료 처리');
    }

    // 8. 통계
    console.log('\n[8] 통계...');
    const stats = await pm.getStats();
    console.log(`  DB 총 페르소나: ${stats.db.total}`);
    console.log(`  Storage 페르소나: ${stats.storage.totalPersonas}`);

    console.log('\n' + '='.repeat(60));
    console.log('테스트 완료! ✓');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ 테스트 실패:', error);
    console.error(error.stack);
  } finally {
    await pm.close();
    // 정리
    await fs.rm(TEST_STORAGE, { recursive: true, force: true }).catch(() => {});
    await fs.rm('/tmp/pm-test-profile', { recursive: true, force: true }).catch(() => {});
    await fs.rm('/tmp/pm-test-profile-restore', { recursive: true, force: true }).catch(() => {});
  }
}

test();
