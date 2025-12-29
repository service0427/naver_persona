# Architecture V3 - 수천만 페르소나 대응 설계

## 현재 문제점

### 1. DB 스케일 문제
- `cookie_files_backup` (LONGTEXT ~50KB) × 1천만 = 500GB
- 단일 테이블에 모든 데이터 → 성능 붕괴
- 쿼리 시 전체 스캔 발생

### 2. VPN 이중 관리
- `vpn_pool` 테이블 vs VPN API 서버 불일치
- 실제 마스터는 VPN 서버인데 DB도 관리하려 함

---

## V3 설계 제안

### 1. 데이터 분리 전략

```
┌─────────────────────────────────────────────────────────────┐
│                     MariaDB (메타데이터만)                   │
├─────────────────────────────────────────────────────────────┤
│ personas_v3                                                 │
│   - id, fingerprint_hash, status, aging_level               │
│   - 통계 (total_uses, success_count)                        │
│   - 타임스탬프만                                            │
│   → 1행 ~500바이트                                         │
│   → 1천만개 = 5GB (관리 가능)                               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     파일 시스템 (대용량)                      │
├─────────────────────────────────────────────────────────────┤
│ /data/personas/                                             │
│   ├── ab/cd/abcd1234/                                       │
│   │   ├── fingerprint.json     (~2KB)                       │
│   │   ├── cookies.tar.gz       (~50KB)                      │
│   │   └── state.json           (~5KB)                       │
│   └── ...                                                   │
│                                                             │
│ 해시 기반 2단계 디렉토리 샤딩:                               │
│   persona_id: abcd1234... → /ab/cd/abcd1234/                │
│   → 디렉토리당 최대 ~250개 파일                              │
│   → 1천만개 분산 저장 가능                                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     NFS/S3 (멀티PC 공유)                     │
├─────────────────────────────────────────────────────────────┤
│ 모든 PC가 /data/personas 마운트                              │
│ → A PC에서 저장 → C PC에서 즉시 접근                         │
│ → DB 동기화 지연 문제 없음                                   │
└─────────────────────────────────────────────────────────────┘
```

### 2. VPN 관리 단순화

```
현재 (복잡):
  DatabaseV2.vpn_pool ←→ VpnClient ←→ VPN API Server
  (동기화 필요)        (불일치 가능)

제안 (단순):
  VPN API Server = 유일한 마스터
  ↓
  VpnClient.allocate() → dongle 정보 반환
  ↓
  실행 로그에 vpn_ip만 기록 (로컬 관리 안 함)

  → vpn_pool 테이블 삭제
  → VPN 상태는 API 서버가 전담
```

### 3. 새로운 테이블 구조

```sql
-- personas_v3: 메타데이터만 (경량)
CREATE TABLE personas_v3 (
  id VARCHAR(36) PRIMARY KEY,           -- UUID
  fingerprint_hash VARCHAR(64),         -- SHA256 (중복 방지)
  base_profile VARCHAR(20),
  status ENUM('숙성중','활성','휴면','차단','폐기'),
  aging_level TINYINT,

  -- 통계
  total_uses INT DEFAULT 0,
  success_count INT DEFAULT 0,
  blocked_count INT DEFAULT 0,

  -- 타임스탬프
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP NULL,

  -- 파일 경로 (실제 데이터는 파일시스템)
  data_path VARCHAR(100),               -- /ab/cd/abcd1234

  INDEX idx_status (status),
  INDEX idx_aging (aging_level),
  INDEX idx_last_used (last_used_at)
);

-- execution_logs: 변경 없음 (이미 적절)
-- worker_pcs: 변경 없음
-- aging_queue: 변경 없음

-- vpn_pool: 삭제 (VPN API 서버가 마스터)
```

### 4. 파일 구조

```
/data/personas/{hash[0:2]}/{hash[2:4]}/{persona_id}/
├── fingerprint.json      # 핑거프린트 전체
├── cookies.tar.gz        # Cookies + Cookies-journal + Local State
├── state.json            # 마지막 상태 (checkpoint, vpn_ip 등)
└── history.json          # 방문/검색 히스토리 (선택)
```

### 5. PersonaStorage 클래스

```javascript
class PersonaStorage {
  constructor(baseDir = '/data/personas') {
    this.baseDir = baseDir;
  }

  getPath(personaId) {
    // abcd1234 → /data/personas/ab/cd/abcd1234
    const hash = personaId.substring(0, 8);
    return path.join(this.baseDir, hash.slice(0,2), hash.slice(2,4), personaId);
  }

  async saveState(personaId, data) {
    const dir = this.getPath(personaId);
    await fs.mkdir(dir, { recursive: true });

    // 핑거프린트
    await fs.writeFile(
      path.join(dir, 'fingerprint.json'),
      JSON.stringify(data.fingerprint)
    );

    // 쿠키 파일 (tar.gz)
    await this.packCookies(data.profileDir, path.join(dir, 'cookies.tar.gz'));

    // 상태
    await fs.writeFile(
      path.join(dir, 'state.json'),
      JSON.stringify({ checkpoint: data.checkpoint, vpnIp: data.vpnIp, ... })
    );
  }

  async loadState(personaId) {
    const dir = this.getPath(personaId);
    if (!await fs.exists(dir)) return null;

    return {
      fingerprint: JSON.parse(await fs.readFile(path.join(dir, 'fingerprint.json'))),
      cookiesPath: path.join(dir, 'cookies.tar.gz'),
      state: JSON.parse(await fs.readFile(path.join(dir, 'state.json')))
    };
  }

  async restoreCookies(personaId, profileDir) {
    const cookiesPath = path.join(this.getPath(personaId), 'cookies.tar.gz');
    await this.unpackCookies(cookiesPath, profileDir);
  }
}
```

---

## 마이그레이션 계획

### Phase 1: 파일 시스템 도입
1. PersonaStorage 클래스 구현
2. 기존 DB 데이터 → 파일로 마이그레이션
3. DB에서 LONGTEXT 컬럼 제거

### Phase 2: VPN 단순화
1. vpn_pool 테이블 삭제
2. VpnClient만 사용 (API 서버가 마스터)
3. 실행 로그에 vpn_ip만 기록

### Phase 3: NFS/S3 도입
1. /data/personas를 NFS로 공유
2. 또는 S3 + 로컬 캐시 방식
3. 멀티PC 동시 접근 가능

---

## 예상 효과

| 항목 | 현재 (V2) | 개선 (V3) |
|------|-----------|-----------|
| DB 크기 (1천만) | ~650GB | ~5GB |
| 쿼리 성능 | 느림 | 빠름 |
| 파일 저장 | DB 내 | 파일시스템 |
| VPN 관리 | 이중 | 단일 (API) |
| 멀티PC | DB 의존 | NFS/S3 |
