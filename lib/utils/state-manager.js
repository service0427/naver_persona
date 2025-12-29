/**
 * StateManager - 하이브리드 상태 백업/복원 매니저
 *
 * 이중 백업 전략:
 * 1. 파일 백업 (안정적): 브라우저 상태와 무관, 타임아웃에도 안전
 * 2. storageState (보조): 브라우저 정상 시 추가 정보
 *
 * 체크포인트 기반:
 * - 페이지 이동마다 백업
 * - 타임아웃 시 마지막 체크포인트로 복원
 */

import { backupCookies, restoreCookies, validateCookies } from './cookie-backup.js';
import dbV2 from '../db/DatabaseV2.js';
import fs from 'fs';
import path from 'path';

class StateManager {
  constructor(personaId, profileDir) {
    this.personaId = personaId;
    this.profileDir = profileDir;
    this.profileDirName = path.basename(profileDir);
    this.checkpoints = [];
    this.lastCheckpoint = null;
    this.context = null;  // Playwright context 참조
  }

  /**
   * Playwright context 설정
   */
  setContext(context) {
    this.context = context;
  }

  /**
   * 체크포인트 생성 (페이지 이동 시 호출)
   * @param {string} checkpoint - 체크포인트 이름 (예: 'after-naver-main', 'after-search')
   * @param {Object} options - { saveToDb: true, vpnIp, pcId }
   */
  async createCheckpoint(checkpoint, options = {}) {
    const { saveToDb = true, vpnIp, pcId } = options;
    const startTime = Date.now();

    try {
      // 1. 파일 백업 (항상 수행 - 안정적)
      const fileBackup = await backupCookies(this.profileDir);

      // 2. storageState 백업 (context가 있을 때만)
      let storageState = null;
      if (this.context) {
        try {
          storageState = await this.context.storageState();
        } catch (e) {
          console.warn(`[StateManager] storageState 실패 (${checkpoint}):`, e.message);
          // 파일 백업은 있으므로 계속 진행
        }
      }

      const checkpointData = {
        name: checkpoint,
        timestamp: Date.now(),
        fileBackup,
        storageState,
        cookies: storageState?.cookies || [],
        cookieCount: storageState?.cookies?.length || Object.keys(fileBackup.files).length
      };

      // 메모리에 저장 (최대 5개 유지)
      this.checkpoints.push(checkpointData);
      if (this.checkpoints.length > 5) {
        this.checkpoints.shift();
      }
      this.lastCheckpoint = checkpoint;

      // DB에 저장
      if (saveToDb) {
        await this._saveToDb(checkpointData, { vpnIp, pcId });
      }

      const duration = Date.now() - startTime;
      console.log(`[StateManager] 체크포인트 생성: ${checkpoint} (${duration}ms, cookies: ${checkpointData.cookieCount})`);

      return checkpointData;

    } catch (error) {
      console.error(`[StateManager] 체크포인트 생성 실패 (${checkpoint}):`, error.message);
      throw error;
    }
  }

  /**
   * DB에 상태 저장
   */
  async _saveToDb(checkpointData, sessionInfo) {
    if (!dbV2.pool) await dbV2.connect();

    const { vpnIp, pcId } = sessionInfo;

    await dbV2.pool.execute(`
      UPDATE persona_state SET
        storage_state = ?,
        cookie_files_backup = ?,
        profile_dir_name = ?,
        last_vpn_ip = ?,
        last_pc_id = ?,
        last_session_at = NOW(),
        last_checkpoint = ?,
        state_version = state_version + 1
      WHERE persona_id = ?
    `, [
      checkpointData.storageState ? JSON.stringify(checkpointData.storageState) : null,
      JSON.stringify(checkpointData.fileBackup),
      this.profileDirName,
      vpnIp || null,
      pcId || dbV2.pcId,
      checkpointData.name,
      this.personaId
    ]);

    // personas_v2 테이블 last_used_at 업데이트
    await dbV2.pool.execute(`
      UPDATE personas_v2 SET last_used_at = NOW() WHERE id = ?
    `, [this.personaId]);
  }

  /**
   * 마지막 체크포인트에서 복원
   * @param {string} targetCheckpoint - 특정 체크포인트 이름 (없으면 마지막 것)
   */
  async restoreFromCheckpoint(targetCheckpoint = null) {
    // 메모리에서 찾기
    let checkpoint = null;

    if (targetCheckpoint) {
      checkpoint = this.checkpoints.find(c => c.name === targetCheckpoint);
    } else if (this.checkpoints.length > 0) {
      checkpoint = this.checkpoints[this.checkpoints.length - 1];
    }

    if (checkpoint) {
      console.log(`[StateManager] 메모리에서 복원: ${checkpoint.name}`);
      return this._restoreFromData(checkpoint);
    }

    // DB에서 로드
    console.log(`[StateManager] DB에서 복원 시도...`);
    return this.restoreFromDb();
  }

  /**
   * DB에서 상태 복원
   * @returns {Object} { success, checkpoint, cookies }
   */
  async restoreFromDb() {
    if (!dbV2.pool) await dbV2.connect();

    const [rows] = await dbV2.pool.execute(`
      SELECT storage_state, cookie_files_backup, profile_dir_name, last_checkpoint
      FROM persona_state WHERE persona_id = ?
    `, [this.personaId]);

    if (rows.length === 0) {
      console.log(`[StateManager] DB에 저장된 상태 없음: ${this.personaId}`);
      return { success: false, reason: 'no_data' };
    }

    const row = rows[0];

    // 파일 백업 복원 (우선)
    if (row.cookie_files_backup) {
      try {
        const fileBackup = JSON.parse(row.cookie_files_backup);
        await restoreCookies(this.profileDir, fileBackup);
        console.log(`[StateManager] 파일 백업에서 복원 완료`);
      } catch (e) {
        console.warn(`[StateManager] 파일 복원 실패:`, e.message);
      }
    }

    // storageState 파싱 (보조 데이터)
    let storageState = null;
    if (row.storage_state) {
      try {
        storageState = JSON.parse(row.storage_state);
      } catch {}
    }

    return {
      success: true,
      checkpoint: row.last_checkpoint,
      storageState,
      cookies: storageState?.cookies || []
    };
  }

  /**
   * 체크포인트 데이터에서 복원
   */
  async _restoreFromData(checkpointData) {
    // 1. 파일 복원 (항상)
    if (checkpointData.fileBackup) {
      await restoreCookies(this.profileDir, checkpointData.fileBackup);
    }

    return {
      success: true,
      checkpoint: checkpointData.name,
      storageState: checkpointData.storageState,
      cookies: checkpointData.cookies
    };
  }

  /**
   * 브라우저 시작 전 상태 복원 (프로필 디렉토리에 파일 복원)
   * @returns {Object} { restored, checkpoint, storageState }
   */
  async prepareProfile() {
    console.log(`[StateManager] 프로필 준비: ${this.personaId}`);

    // 프로필 디렉토리 생성
    if (!fs.existsSync(this.profileDir)) {
      fs.mkdirSync(this.profileDir, { recursive: true });
    }

    // DB에서 복원
    const result = await this.restoreFromDb();

    if (result.success) {
      console.log(`[StateManager] 프로필 복원 완료: checkpoint=${result.checkpoint}`);
    } else {
      console.log(`[StateManager] 새 프로필로 시작`);
    }

    return {
      restored: result.success,
      checkpoint: result.checkpoint,
      storageState: result.storageState
    };
  }

  /**
   * 브라우저 context 생성 후 쿠키 추가 적용
   * (파일 복원으로 대부분 되지만, 추가 안전장치)
   */
  async applyToContext(context, storageState) {
    this.context = context;

    if (storageState?.cookies?.length > 0) {
      try {
        await context.addCookies(storageState.cookies);
        console.log(`[StateManager] context에 쿠키 ${storageState.cookies.length}개 추가 적용`);
      } catch (e) {
        console.warn(`[StateManager] 쿠키 추가 실패:`, e.message);
      }
    }
  }

  /**
   * 현재 쿠키 상태 검증
   * @param {Array} requiredCookies - 필수 쿠키 이름 목록
   */
  async validateCurrentState(requiredCookies = ['NNB', 'NAC']) {
    if (!this.context) {
      return { valid: false, reason: 'no_context' };
    }

    try {
      const cookies = await this.context.cookies();
      return validateCookies(cookies, requiredCookies);
    } catch (e) {
      return { valid: false, reason: 'cookie_read_failed', error: e.message };
    }
  }

  /**
   * 세션 종료 시 최종 저장
   * @param {Object} options - { vpnIp, pcId, result }
   */
  async finalSave(options = {}) {
    const { vpnIp, pcId, result = '성공' } = options;

    try {
      // 마지막 체크포인트 생성
      await this.createCheckpoint('session-end', { saveToDb: true, vpnIp, pcId });

      // 실행 로그 저장
      if (dbV2.pool) {
        await dbV2.logExecution({
          personaId: this.personaId,
          vpnIp,
          pcId,
          action: 'session',
          result
        });
      }

      console.log(`[StateManager] 세션 종료 저장 완료: ${this.personaId}`);
    } catch (e) {
      console.error(`[StateManager] 최종 저장 실패:`, e.message);
    }
  }

  /**
   * 타임아웃/에러 발생 시 긴급 백업
   * (context 없이 파일만 백업)
   */
  async emergencyBackup(checkpoint = 'emergency') {
    try {
      const fileBackup = await backupCookies(this.profileDir);

      // DB에 저장 (storageState 없이)
      if (dbV2.pool) {
        await dbV2.pool.execute(`
          UPDATE persona_state SET
            cookie_files_backup = ?,
            last_checkpoint = ?,
            state_version = state_version + 1
          WHERE persona_id = ?
        `, [
          JSON.stringify(fileBackup),
          checkpoint,
          this.personaId
        ]);
      }

      console.log(`[StateManager] 긴급 백업 완료: ${checkpoint}`);
      return { success: true, fileBackup };

    } catch (e) {
      console.error(`[StateManager] 긴급 백업 실패:`, e.message);
      return { success: false, error: e.message };
    }
  }

  /**
   * 체크포인트 히스토리 조회
   */
  getCheckpointHistory() {
    return this.checkpoints.map(c => ({
      name: c.name,
      timestamp: c.timestamp,
      cookieCount: c.cookieCount,
      hasStorageState: !!c.storageState
    }));
  }
}

/**
 * 사용 예시:
 *
 * // 1. 브라우저 시작 전
 * const stateManager = new StateManager(personaId, profileDir);
 * const { restored, storageState } = await stateManager.prepareProfile();
 *
 * // 2. 브라우저 시작
 * const context = await browser.newContext({ ... });
 * await stateManager.applyToContext(context, storageState);
 *
 * // 3. 페이지 이동마다 체크포인트
 * await page.goto('https://www.naver.com');
 * await stateManager.createCheckpoint('after-naver-main', { vpnIp });
 *
 * await page.goto('https://search.naver.com/...');
 * await stateManager.createCheckpoint('after-search', { vpnIp });
 *
 * // 4. 타임아웃 발생 시
 * try {
 *   await page.goto('...');
 * } catch (e) {
 *   await stateManager.emergencyBackup('timeout-at-step3');
 *   // 마지막 체크포인트로 복원 가능
 * }
 *
 * // 5. 정상 종료
 * await stateManager.finalSave({ vpnIp, result: '성공' });
 */

export default StateManager;
export { StateManager };
