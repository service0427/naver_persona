#!/usr/bin/env node
/**
 * 페르소나 관리 CLI
 *
 * 사용법:
 *   node scripts/persona-admin.js status           # 현재 상태
 *   node scripts/persona-admin.js list [N]         # 활성 페르소나 N개 조회
 *   node scripts/persona-admin.js stats            # 통계
 *   node scripts/persona-admin.js dist             # 분포
 *   node scripts/persona-admin.js cleanup          # 만료 처리
 *   node scripts/persona-admin.js missing          # 누락 조합 확인
 */

import personaDB, { USER_TYPES, AGE_GROUPS, GENDERS } from '../lib/db/PersonaDB.js';

const commands = {
  /**
   * 현재 상태 확인
   */
  async status() {
    console.log('\n╔══════════════════════════════════════════════════════════════════╗');
    console.log('║                     페르소나 DB 상태                               ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝\n');

    await personaDB.connect();

    const stats = await personaDB.getStats();
    const t = stats.totals;

    console.log('  [전체 현황]');
    console.log(`  총 페르소나: ${t.total}개`);
    console.log(`  ├─ new:     ${t.new_count || 0}개`);
    console.log(`  ├─ active:  ${t.active_count || 0}개`);
    console.log(`  └─ blocked: ${t.blocked_count || 0}개`);
    console.log('');
    console.log(`  총 세션: ${t.total_sessions || 0}회`);
    console.log(`  성공: ${t.total_success || 0}회`);

    if (stats.recentLogs.length > 0) {
      console.log('\n  [최근 24시간]');
      for (const log of stats.recentLogs) {
        console.log(`    ${log.result}: ${log.cnt}회`);
      }
    }
  },

  /**
   * 활성 페르소나 목록
   */
  async list(limit = 20) {
    await personaDB.connect();

    const [rows] = await personaDB.pool.execute(`
      SELECT id, code, status, session_count, success_count, blocked_count,
             created_ip, last_ip, last_used_at
      FROM personas
      WHERE status = 'active'
      ORDER BY last_used_at DESC
      LIMIT ?
    `, [limit]);

    console.log('\n  [활성 페르소나]');
    console.log(`  ${'ID'.padEnd(10)} ${'Code'.padEnd(6)} ${'Sessions'.padEnd(10)} ${'Success'.padEnd(8)} ${'IP'.padEnd(16)} ${'Last Used'.padEnd(20)}`);
    console.log('  ' + '-'.repeat(75));

    for (const p of rows) {
      const lastUsed = p.last_used_at ? new Date(p.last_used_at).toLocaleString('ko-KR') : '미사용';
      console.log(`  ${p.id.substring(0, 8).padEnd(10)} ${p.code.padEnd(6)} ${String(p.session_count).padEnd(10)} ${String(p.success_count).padEnd(8)} ${(p.created_ip || '-').padEnd(16)} ${lastUsed}`);
    }

    console.log(`\n  총 ${rows.length}개`);
  },

  /**
   * 통계
   */
  async stats() {
    await personaDB.connect();

    // 코드별 통계
    const [codeStats] = await personaDB.pool.execute(`
      SELECT code, COUNT(*) as cnt,
             SUM(session_count) as total_sessions,
             SUM(success_count) as total_success,
             SUM(blocked_count) as total_blocked
      FROM personas
      WHERE status = 'active'
      GROUP BY code
      ORDER BY code
    `);

    console.log('\n  [코드별 통계]');
    console.log(`  ${'Code'.padEnd(6)} ${'Count'.padStart(6)} ${'Sessions'.padStart(10)} ${'Success'.padStart(8)} ${'Blocked'.padStart(8)}`);
    console.log('  ' + '-'.repeat(42));

    for (const row of codeStats) {
      console.log(`  ${row.code.padEnd(6)} ${String(row.cnt).padStart(6)} ${String(row.total_sessions || 0).padStart(10)} ${String(row.total_success || 0).padStart(8)} ${String(row.total_blocked || 0).padStart(8)}`);
    }

    // 일별 통계
    const [dailyStats] = await personaDB.pool.execute(`
      SELECT DATE(created_at) as date,
             COUNT(*) as total,
             SUM(CASE WHEN result = '성공' THEN 1 ELSE 0 END) as success,
             SUM(CASE WHEN result = '봇탐지' THEN 1 ELSE 0 END) as blocked
      FROM logs
      WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    if (dailyStats.length > 0) {
      console.log('\n  [최근 7일 로그]');
      console.log(`  ${'Date'.padEnd(12)} ${'Total'.padStart(8)} ${'Success'.padStart(8)} ${'Blocked'.padStart(8)} ${'Rate'.padStart(8)}`);
      console.log('  ' + '-'.repeat(48));

      for (const d of dailyStats) {
        const dateStr = d.date instanceof Date ? d.date.toISOString().split('T')[0] : String(d.date);
        const rate = d.total > 0 ? Math.round(d.success / d.total * 100) : 0;
        console.log(`  ${dateStr.padEnd(12)} ${String(d.total).padStart(8)} ${String(d.success).padStart(8)} ${String(d.blocked).padStart(8)} ${String(rate + '%').padStart(8)}`);
      }
    }
  },

  /**
   * 분포
   */
  async dist() {
    await personaDB.connect();

    const [rows] = await personaDB.pool.execute(`
      SELECT user_type, age_group, gender, COUNT(*) as cnt
      FROM personas
      WHERE status = 'active'
      GROUP BY user_type, age_group, gender
    `);

    console.log('\n  [페르소나 분포]\n');

    // 직업별
    const byType = {};
    rows.forEach(r => {
      if (!byType[r.user_type]) byType[r.user_type] = 0;
      byType[r.user_type] += r.cnt;
    });
    console.log('  직업:');
    for (const [k, v] of Object.entries(byType)) {
      const label = USER_TYPES[k]?.label || k;
      console.log(`    ${k}: ${String(v).padStart(4)}개  (${label})`);
    }

    // 연령별
    const byAge = {};
    rows.forEach(r => {
      if (!byAge[r.age_group]) byAge[r.age_group] = 0;
      byAge[r.age_group] += r.cnt;
    });
    console.log('\n  연령:');
    for (const [k, v] of Object.entries(byAge)) {
      const label = AGE_GROUPS[k]?.label || k;
      console.log(`    ${k}0대: ${String(v).padStart(4)}개`);
    }

    // 성별
    const byGender = {};
    rows.forEach(r => {
      if (!byGender[r.gender]) byGender[r.gender] = 0;
      byGender[r.gender] += r.cnt;
    });
    console.log('\n  성별:');
    for (const [k, v] of Object.entries(byGender)) {
      const label = GENDERS[k]?.label || k;
      console.log(`    ${k}: ${String(v).padStart(4)}개  (${label})`);
    }
  },

  /**
   * 만료 처리
   */
  async cleanup() {
    await personaDB.connect();

    const expired = await personaDB.cleanupExpiredPersonas();
    console.log(`\n  ${expired}개 페르소나 만료 처리됨`);
  },

  /**
   * 누락 조합 확인
   */
  async missing() {
    await personaDB.connect();

    // 현재 조합 확인
    const [existing] = await personaDB.pool.execute(`
      SELECT DISTINCT code FROM personas WHERE status = 'active'
    `);
    const existingCodes = new Set(existing.map(r => r.code));

    // 모든 가능한 조합
    const allPossible = [];
    Object.keys(USER_TYPES).forEach(t => {
      Object.keys(AGE_GROUPS).forEach(a => {
        Object.keys(GENDERS).forEach(g => {
          allPossible.push(`${t}${a}${g}`);
        });
      });
    });

    const missing = allPossible.filter(c => !existingCodes.has(c));

    console.log(`\n  [조합 현황]`);
    console.log(`  전체 가능: ${allPossible.length}개`);
    console.log(`  현재 있음: ${existingCodes.size}개`);
    console.log(`  누락: ${missing.length}개`);

    if (missing.length > 0) {
      console.log(`\n  [누락된 조합]`);
      console.log(`  ${missing.join(', ')}`);
      console.log('\n  ⚠️ 누락 조합은 VPN 연결 시 자동 생성됩니다.');
    } else {
      console.log('\n  ✅ 모든 조합이 있습니다!');
    }
  }
};

async function main() {
  const [cmd, arg] = process.argv.slice(2);

  try {
    if (cmd && commands[cmd]) {
      await commands[cmd](arg ? parseInt(arg) || arg : undefined);
    } else {
      console.log(`
페르소나 관리 CLI

사용법:
  node scripts/persona-admin.js <command> [arg]

명령어:
  status              현재 상태 확인
  list [N]            활성 페르소나 N개 조회 (기본 20)
  stats               코드별/일별 통계
  dist                분포 조회 (직업/연령/성별)
  cleanup             만료 페르소나 정리
  missing             누락된 조합 확인

예시:
  node scripts/persona-admin.js status
  node scripts/persona-admin.js list 50
  node scripts/persona-admin.js missing
`);
    }
  } catch (e) {
    console.error('오류:', e.message);
  } finally {
    await personaDB.close();
  }
}

main();
