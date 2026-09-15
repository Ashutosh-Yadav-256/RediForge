# RediForge — 한국어 문서

<div align="center">

![RediForge Logo](https://img.shields.io/badge/RediForge-Redis--Compatible%20Datastore-1885E2?style=for-the-badge&logo=redis&logoColor=white)

**Node.js로 밑바닥부터 설계한 RESP2 완벽 호환 고성능 인메모리 데이터스토어, 듀얼 영속성 서브시스템 및 실시간 반응형 텔레메트리 엔진**

[ English ](../../README.md) • 
[ 简体中文 ](README.zh-CN.md) • 
[ Español ](README.es.md) • 
[ 日本語 ](README.ja.md) • 
[ Deutsch ](README.de.md) • 
[ Français ](README.fr.md) • 
[ 한국어 ](README.ko.md) • 
[ Русский ](README.ru.md) • 
[ Português ](README.pt.md) • 
[ हिन्दी ](README.hi.md)

</div>

---

## 1. 개요 (Overview)

**RediForge**는 제1원칙(First Principles)에 기반하여 외부 런타임 라이브러리 의존성 없이 순수하게 개발된 엔터프라이즈급 인메모리 키-값(Key-Value) 데이터베이스입니다. Redis의 **RESP2 (REdis Serialization Protocol)** 유선 프로토콜 표준을 100% 준수하여, `redis-cli`, `ioredis`, `redis-py`, `Jedis`, `go-redis` 등 기존의 모든 공식 Redis 클라이언트와 즉각적이고 완벽한 드롭인(Drop-in) 대체를 지원합니다.

초저지연 WebSocket 브릿지를 통해 연결되는 **반응형 웹 관리 콘솔**이 내장되어 있어, 실시간 벡터 텔레메트리 메모리 그래프, 키스페이스 탐색기, 자동 TTL 확인, 역할 기반 접근 제어(RBAC) 및 브라우저 기반 대화형 CLI 터미널을 기본 제공합니다.

---

## 2. 시스템 아키텍처 (System Architecture)

```
                 +---------------------------------------+
                 |            클라이언트 접속 계층       |
                 |  (redis-cli / ioredis / 웹 브라우저)  |
                 +---------------------------------------+
                               |                 |
                   표준 TCP 포트 6379      WebSocket / HTTP 포트 8080
                               |                 |
                 +--------------------+   +-----------------------+
                 |  RESP2 프로토콜 파서|   |   HTTP/WS 브릿지 게이트웨이
                 |  (결정론적 상태 머신)|   | (SSRF 방화벽 & CORS)  |
                 +--------------------+   +-----------------------+
                               \                 /
                            +-----------------------+
                            |     명령어 게이트웨이 |
                            | - 처리율 제한기       |
                            | - RBAC 및 OIDC 인증   |
                            | - 위험 명령 차단기    |
                            | - 자격증명 마스킹 감사|
                            +-----------------------+
                                        |
                            +-----------------------+
                            |     명령어 레지스트리 |
                            |   (102개 RESP2 명령어)|
                            +-----------------------+
                                        |
     +----------------------------------+----------------------------------+
     |                                  |                                  |
+-------------------+            +-------------------+            +-------------------+
|  멀티 DB 스토어   |            |    Pub/Sub 브로커 |            |    영속성 계층    |
| (16개 독립 데이터)|            | (채널 및 패턴 매칭)|           | (RDB 스냅샷 & AOF)|
| - LRU 메모리 축출 |            +-------------------+            +-------------------+
| - 2단계 능동 TTL  |
+-------------------+
```

### 핵심 기술 사양:
1. **결정론적 RESP2 스트리밍 파서**: 제로 카피 버퍼 슬라이싱(Zero-copy buffer slicing) 기법을 사용하여 TCP 패킷 분할이나 결합 시에도 추가적인 문자열 메모리 할당 없이 초고속 처리.
2. **풍부한 자료구조 및 시간 복잡도**:
   - **Strings** ($\mathcal{O}(1)$): 바이너리 안전 바이트 스트링, 원자적 64비트 정수 연산 (`INCRBY`, `DECRBY`), 비트맵 비트 연산 (`BITOP`, `BITCOUNT`).
   - **Hashes** ($\mathcal{O}(1)$): 필드-값 연관 맵, 대량 일괄 갱신 (`HMSET`, `HMGET`), 빠른 존재 검사 (`HEXISTS`).
   - **Lists** ($\mathcal{O}(1)$): 이중 연결 덱 구조를 활용한 양방향 push/pop (`LPUSH`, `RPOP`, `RPOPLPUSH`).
   - **Sets** ($\mathcal{O}(1)$): 유일 문자열 집합, 합집합/교집합/차집합 연산 및 저장 (`SUNIONSTORE`, `SINTERSTORE`, `SDIFFSTORE`).
   - **Sorted Sets (ZSets)** ($\mathcal{O}(\log N)$): 균형 배열과 점수 해시 인덱스를 결합한 고성능 순위 계산 (`ZRANK`) 및 점수 구간 조회 (`ZRANGEBYSCORE`).
3. **듀얼 영속성(Persistence) 서브시스템**:
   - **RDB 스냅샷**: 주기적으로 원자적 바이너리 직렬화를 수행하여 `dump.rdb`에 저장하며 CRC64 무결성 검증 수행.
   - **AOF (Append-Only File)**: 트랜잭션 선행 기록(WAL) 로그, 동기화 정책(`always`, `everysec`, `no`) 및 백그라운드 압축 재작성(`BGREWRITEAOF`).
4. **정밀 메모리 회계 및 LRU 축출 엔진**:
   - 16개 데이터베이스 파티션 전체에서 바이트 단위 힙 메모리 추적.
   - `allkeys-lru`, `volatile-lru`, `noeviction` 축출 정책을 통해 메모리 한계 도달 시 OOM 크래시 방지.
5. **2단계 TTL 만료 회수 모델**:
   - 수동 회수: 키 접근 시 즉시 만료 확인 및 해제.
   - 능동 확률적 샘플링: 100ms마다 각 DB에서 20개의 휘발성 키를 무작위 샘플링하여 25% 이상 만료 시 즉시 심층 회수 루프 수행.
6. **제로 트러스트 보안 및 SSRF 방화벽**:
   - TCP 기본 `AUTH` 인증.
   - 무상태 HMAC-SHA256 JWT 토큰 및 Google OIDC RS256 JWKS 서명 검증.
   - 루프백 주소(`127.0.0.1`), 사설 IP(RFC 1918), 클라우드 메타데이터(`169.254.169.254`) 및 IPv4-mapped IPv6 우회 접근 전면 차단.

---

## 3. 벤치마크 성능 지표 (Benchmarks)

동시 부하 테스트 슈트(`benchmark.js`) 실측치:

- **원시 읽기 처리량 (GET)**: `820,701 ops/sec` (10만 건 처리: 122ms)
- **원시 쓰기 처리량 (SET)**: `449,269 ops/sec` (10만 건 처리: 223ms)
- **RDB 크래시 복구율**: `100.0%` (10,503 / 10,503 키 완전 복원)
- **AOF 재실행 복구율**: `100.0%` (4,999 / 4,999 키 완벽 재구성)
- **고압 하 LRU 메모리 경계 준수**: 500KB 제한 환경에서 50,000회 연속 쓰기 시 OOM 크래시 0건 달성.

---

## 4. 빠른 시작 (Quick Start)

```bash
# 레포지토리 클론 및 의존성 설치
git clone https://github.com/Ashutosh-Yadav-256/Build-Redis-In-JAVA.git
cd "Build-Redis-In-JAVA"
npm install

# 서버 실행 (TCP 6379, Web 8080)
npm start
```

웹 관리자 콘솔: `http://127.0.0.1:8080` 접속.

테스트 실행:
```bash
npm test
# 28개 스위트, 153개 테스트 100% 통과
```

---

## 5. 설계자 및 라이선스

- **수석 아키텍트**: [Ashutosh Yadav](https://ashutoshwork.space/) ([GitHub](https://github.com/Ashutosh-Yadav-256))
- **라이브 데모**: [https://rediforge.in](https://rediforge.in)
- **라이선스**: [MIT 라이선스](../../LICENSE).
