# VPN 클라이언트 API

외부 클라이언트(자동화 에이전트)용 API 문서

**Base URL**: `http://61.84.75.37:44010`

---

## 1. VPN 할당

### POST /api/vpn/allocate

VPN 동글 할당 요청. 이미 할당된 경우 갱신(renew).

```json
// Request
{
  "agent_id": "U22-01",
  "purpose": "coupang"
}

// Response - 성공 (새 할당)
{
  "success": true,
  "renewed": false,
  "vpn": {
    "dongle_id": 1,
    "server_ip": "112.161.54.7",
    "subnet": 16,
    "external_ip": "175.223.44.210",
    "purpose": "coupang",
    "private_key": "yDc5vXeR8sUSQ2Kmh8AboTBUf91XkUi/CwylB4JcjVo=",
    "public_key": "xTCiN8kF6ZP5MsLhD6afft83nikZwXWo/7nnoOO1vFg="
  },
  "timeout_sec": 180,
  "auto_toggle_sec": 600
}

// Response - 성공 (갱신)
{
  "success": true,
  "renewed": true,
  "vpn": { ... },
  "timeout_sec": 180,
  "auto_toggle_sec": 600
}

// Response - 실패 (사용 가능한 VPN 없음)
{
  "success": false,
  "reason": "NO_VPN",
  "message": "No available VPN"
}

// Response - 실패 (잘못된 agent_id)
{
  "success": false,
  "error": "INVALID_AGENT_ID",
  "message": "agent_id must match pattern: {OS}{VER}-{NUM} (e.g., U22-01, W11-23)"
}
```

#### agent_id 형식

| 패턴 | OS | 예시 |
|------|-----|------|
| `U{VER}-{NUM}` | Ubuntu | U22-01, U24-15 |
| `W{VER}-{NUM}` | Windows | W10-01, W11-23 |
| `M{VER}-{NUM}` | macOS | M14-01 |
| `D{VER}-{NUM}` | Debian | D12-01 |
| `T{VER}-{NUM}` | Test | T00-01, T00-99 |

#### WireGuard 설정

반환된 키로 WireGuard 설정:

```ini
[Interface]
PrivateKey = {private_key}
Address = 10.8.{subnet}.0/24
DNS = 1.1.1.1, 8.8.8.8

[Peer]
PublicKey = {public_key}
Endpoint = {server_ip}:55555
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
```

---

## 2. Heartbeat (연장)

### POST /api/vpn/heartbeat

**180초마다 필수 호출**. 미호출 시 자동 할당 해제.

```json
// Request
{
  "agent_id": "U22-01",
  "dongle_id": 1        // 옵션 (여러 동글 사용 시 특정 지정)
}

// Response - 성공
{
  "success": true,
  "renewed": 1,
  "dongles": [
    {
      "dongle_id": 1,
      "purpose": "coupang",
      "connected_sec": 0
    }
  ],
  "timeout_sec": 180,
  "auto_toggle_sec": 600
}

// Response - 실패 (할당된 VPN 없음)
{
  "success": false,
  "reason": "NOT_FOUND",
  "message": "No VPN allocated to this agent"
}
```

---

## 3. VPN 반납

### POST /api/vpn/release

작업 완료 후 VPN 반납. 세션 통계 포함 가능.

```json
// Request
{
  "agent_id": "U22-01",
  "dongle_id": 1,              // 옵션
  "success_count": 150,        // 옵션: 성공 작업 수
  "fail_count": 3,             // 옵션: 실패 작업 수
  "work_duration_ms": 120000   // 옵션: 작업 시간 (ms)
}

// Response
{
  "success": true,
  "released": 1,
  "dongles": [
    {
      "dongle_id": 1,
      "server_ip": "112.161.54.7",
      "subnet": 16,
      "duration_sec": 3600
    }
  ],
  "session_stats": {
    "success_count": 150,
    "fail_count": 3,
    "work_duration_ms": 120000
  }
}
```

---

## 4. IP 토글 (변경)

### GET http://{server_ip}/toggle/{subnet}

**동글 서버에 직접 호출**하여 IP 변경. allocate 응답의 `server_ip`와 `subnet` 사용.

```bash
# 예시
curl http://112.161.54.7/toggle/16
```

```json
// Response - 성공
{
  "success": true,
  "subnet": 16,
  "port": 10016,
  "old_ip": "175.223.10.116",
  "new_ip": "175.223.11.36",
  "elapsed": 12.99,
  "traffic": {
    "upload": 48187426508,
    "download": 77359432589
  },
  "signal_grade": "C",
  "error": null
}

// Response - 실패
{
  "success": false,
  "subnet": 17,
  "port": 10017,
  "old_ip": null,
  "new_ip": null,
  "elapsed": 0,
  "traffic": {
    "upload": 0,
    "download": 0
  },
  "signal_grade": null,
  "error": "Failed to get new IP"
}
```

#### 응답 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `success` | boolean | 토글 성공 여부 |
| `subnet` | number | 동글 subnet |
| `port` | number | 동글 포트 (10000 + subnet) |
| `old_ip` | string? | 변경 전 IP |
| `new_ip` | string? | 변경 후 IP |
| `elapsed` | number | 토글 소요 시간 (초) |
| `traffic` | object | 현재 트래픽 (upload/download bytes) |
| `signal_grade` | string? | 신호 등급 (A/B/C/D) |
| `error` | string? | 에러 메시지 |

**주의**: 토글 완료까지 10~15초 소요. 동기 방식으로 완료 후 응답.

---

## 5. 상태 조회

### GET /api/vpn/status

현재 VPN 할당 현황 조회.

```json
// Response
{
  "success": true,
  "summary": {
    "total": 8,
    "in_use": 3,
    "available": 4,
    "toggling": 1
  },
  "users": [
    {
      "dongle_id": 1,
      "agent_id": "U22-01",
      "purpose": "coupang",
      "server_ip": "112.161.54.7",
      "subnet": 16,
      "external_ip": "175.223.44.210",
      "location": "본사 3층",
      "allocated_at": "2025-12-24T07:00:00.000Z",
      "last_activity_at": "2025-12-24T07:30:00.000Z",
      "connected_sec": 1800,
      "idle_sec": 0
    }
  ],
  "timeout_sec": 180,
  "auto_toggle_sec": 600
}
```

### GET /toggle/status

토글 중인 동글 및 쿨다운 상태 조회.

```json
// Response
{
  "success": true,
  "count": 2,
  "dongles": [
    {
      "id": 1,
      "status": "toggling",
      "agent_id": "U22-01",
      "external_ip": "175.223.44.210",
      "last_toggle_at": null,
      "toggle_cooldown_until": null,
      "cooldown_remaining": null
    },
    {
      "id": 2,
      "status": "allocated",
      "agent_id": "W11-01",
      "external_ip": "39.7.55.90",
      "last_toggle_at": "2025-12-24T07:30:00.000Z",
      "toggle_cooldown_until": "2025-12-24T07:30:30.000Z",
      "cooldown_remaining": 15
    }
  ]
}
```

---

## 6. 타임아웃 및 제한

| 항목 | 시간 | 설명 |
|------|------|------|
| **Heartbeat 타임아웃** | 180초 | heartbeat 미호출 시 자동 해제 |
| **자동 토글** | 600초 | 활동 없으면 IP 자동 변경 |
| **토글 쿨다운** | 30초 | 토글 완료 후 대기 시간 |
| **토글 타임아웃** | 60초 | 토글 미완료 시 리셋 |

---

## 7. 사용 흐름

```
┌─────────────────────────────────────────────────────────────────┐
│                        클라이언트 흐름                            │
└─────────────────────────────────────────────────────────────────┘

1. VPN 할당 (Dongle API)
   POST http://61.84.75.37:44010/api/vpn/allocate { agent_id, purpose }
   → WireGuard 설정 (private_key, public_key, server_ip, subnet)
   → VPN 연결 (Endpoint: {server_ip}:55555)

2. 주기적 Heartbeat (60~120초 간격 권장)
   POST http://61.84.75.37:44010/api/vpn/heartbeat { agent_id }
   → 180초 내 호출 필수

3. IP 변경 필요 시 (동글 서버 직접 호출)
   GET http://{server_ip}/toggle/{subnet}
   → 동기 방식, 10~15초 후 새 IP 반환
   → VPN 재연결 (IP 변경됨)

4. 작업 완료 (Dongle API)
   POST http://61.84.75.37:44010/api/vpn/release { agent_id, success_count, fail_count }
   → VPN 연결 해제
```

---

## 8. 에러 코드

### Dongle API 에러 (할당/반납)

| 에러 | 설명 | 대응 |
|------|------|------|
| `NO_VPN` | 사용 가능한 VPN 없음 | 잠시 후 재시도 |
| `INVALID_AGENT_ID` | agent_id 형식 오류 | 패턴 확인 |
| `NOT_FOUND` | 할당된 VPN 없음 | 재할당 필요 |

### 토글 에러 (동글 서버 응답)

| error 필드 | 설명 | 대응 |
|------------|------|------|
| `Failed to get new IP` | IP 변경 실패 | 잠시 후 재시도 |
| `Dongle not connected` | 동글 연결 끊김 | 다른 동글 사용 |
| `Toggle in progress` | 이미 토글 중 | 완료 대기 후 재시도 |

---

## 9. Python 예제

```python
import requests
import time

API_BASE = "http://61.84.75.37:44010"
AGENT_ID = "U22-01"

class VPNClient:
    def __init__(self, agent_id: str, purpose: str = "unknown"):
        self.agent_id = agent_id
        self.purpose = purpose
        self.dongle_id = None
        self.vpn_config = None

    def allocate(self) -> bool:
        """VPN 할당"""
        resp = requests.post(f"{API_BASE}/api/vpn/allocate", json={
            "agent_id": self.agent_id,
            "purpose": self.purpose
        }).json()

        if resp["success"]:
            self.dongle_id = resp["vpn"]["dongle_id"]
            self.vpn_config = resp["vpn"]
            return True
        return False

    def heartbeat(self) -> bool:
        """Heartbeat (180초 내 호출 필수)"""
        resp = requests.post(f"{API_BASE}/api/vpn/heartbeat", json={
            "agent_id": self.agent_id
        }).json()
        return resp["success"]

    def toggle_ip(self) -> dict:
        """IP 변경 (동글 서버 직접 호출)"""
        server_ip = self.vpn_config["server_ip"]
        subnet = self.vpn_config["subnet"]

        resp = requests.get(f"http://{server_ip}/toggle/{subnet}").json()

        if resp["success"]:
            self.vpn_config["external_ip"] = resp["new_ip"]

        return resp

    def release(self, success_count: int = 0, fail_count: int = 0):
        """VPN 반납"""
        requests.post(f"{API_BASE}/api/vpn/release", json={
            "agent_id": self.agent_id,
            "dongle_id": self.dongle_id,
            "success_count": success_count,
            "fail_count": fail_count
        })
        self.dongle_id = None

# 사용 예시
client = VPNClient("U22-01", "coupang")

if client.allocate():
    print(f"VPN 할당됨: {client.vpn_config['external_ip']}")

    # 작업 수행 (heartbeat 주기적 호출)
    for i in range(10):
        # ... 작업 ...
        client.heartbeat()
        time.sleep(60)

    # IP 변경
    result = client.toggle_ip()
    if result["success"]:
        print(f"IP 변경됨: {result['old_ip']} → {result['new_ip']} ({result['elapsed']}초)")

    # 완료
    client.release(success_count=100, fail_count=2)
```
