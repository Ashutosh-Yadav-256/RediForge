# RediForge — System Architecture & Technical Whitepaper

> **High-Performance, Zero-External-Dependency, Redis-Compatible In-Memory Datastore & Real-Time Telemetry Engine**  
> *Engineered by [Ashutosh Yadav](https://ashutoshwork.space/) ([ashutosh4tech@gmail.com](mailto:ashutosh4tech@gmail.com))*

---

## 1. Executive Summary & Vision

### 1.1 What is RediForge?
**RediForge** is an enterprise-grade, memory-first key-value datastore engineered from the ground up to provide **100% RESP2 wire compatibility** with Redis. It implements raw TCP socket handling on port `6379`, a high-throughput WebSocket & HTTP gateway, an interactive Neumorphic administration console, dual persistence engines (RDB + AOF), an intelligent memory accounting subsystem with LRU eviction, and a multi-tenant Role-Based Access Control (RBAC) security model.

### 1.2 Why was RediForge Created?
1. **First-Principles Systems Engineering**: To build an ultra-clean, production-ready in-memory database engine with **zero external runtime dependencies** in the core data engine.
2. **The Open-Source Licensing Evolution**: In light of Redis Ltd.'s shift away from BSD licensing toward commercial dual-licenses (RSALv2/SSPLv1), developers and cloud architects require transparent, fully auditable, and modular in-memory engines.
3. **Unified Observability**: Traditional in-memory datastores require external sidecars, Prometheus exporters, and complex UI tooling. RediForge fuses the core engine directly with an integrated **real-time WebSocket telemetry pipeline**, live memory graphs, visual key browser, and an in-browser RESP CLI.

### 1.3 What Problems Does It Solve?
* **Sub-Millisecond Read/Write Latency**: Eliminates disk I/O bottlenecks for high-throughput caching and session management.
* **Complex Fleet Management**: Provides an instant, zero-install Web Console with visual key editing, TTL monitoring, and live database switching across 16 isolated databases (`db0`–`db15`).
* **Accidental Data Loss in Production**: Prevents catastrophe via an automated **Dangerous Command Interceptor** that catches and guards destructive operations like `FLUSHALL`, `FLUSHDB`, and `SHUTDOWN`.
* **Security & SSRF Vulnerabilities**: Implements an enterprise SSRF security guard blocking loopback addresses (`127.0.0.1`), link-local IPs, private subnets, and IPv4-mapped IPv6 evasions.

---

## 2. High-Level System Architecture

RediForge is composed of four distinct architectural layers operating concurrently on an asynchronous, event-driven event loop:

```
+-----------------------------------------------------------------------------------+
|                                CLIENT ACCESS LAYER                                |
|  +-------------------------+  +--------------------------+  +-------------------+ |
|  |  Standard Redis Clients |  |   Terminal redis-cli     |  |   Web UI Browser  | |
|  | (redis-py, ioredis, ...) |  |   (Direct RESP2 TCP)     |  | (Neumorphic SPA)  | |
+--+-------------------------+--+--------------------------+--+-------------------+-+
                |                             |                         |
                | (TCP Port 6379)             | (TCP Port 6379)         | (HTTPS / WSS)
                v                             v                         v
+-----------------------------------------------------------------------------------+
|                         GATEWAY & PROTOCOL PARSER LAYER                           |
|  +-------------------------------------+   +------------------------------------+ |
|  |       TCP Server (server.js)        |   |    HTTP & WebSocket Bridge (bridge.js)
|  |   - Stream Chunk Accumulator        |   |   - Google OAuth / JWT Auth        | |
|  |   - Client Socket Management        |   |   - SSRF Guard & Rate Limiter      | |
|  +------------------+------------------+   +------------------+-----------------+ |
|                     |                                         |                   |
|                     v                                         v                   |
|  +------------------------------------------------------------------------------+ |
|  |                     RESP2 Stream Parser (parser.js)                          | |
|  |    + Simple String (+)  |  - Error (-)  |  : Integer (:)  |  $ Bulk String ($) |
|  |    * Array (*)          |  Binary-Safe State Machine Execution                 | |
|  +------------------------------------------------------------------------------+ |
+-----------------------------------------------------------------------------------+
                                      |
                                      v
+-----------------------------------------------------------------------------------+
|                        SECURITY & COMMAND ROUTING LAYER                           |
|  +------------------------------------------------------------------------------+ |
|  |                  Command Gateway & Guard (command_gateway.js)                 | |
|  |   - Authentication Check (requirepass)  - Dangerous Command Interceptor        | |
|  |   - RBAC Role Evaluator (Admin / Dev)   - Structured Audit Logger (Audit Trail)| |
|  +------------------------------------------------------------------------------+ |
+-----------------------------------------------------------------------------------+
                                      |
                                      v
+-----------------------------------------------------------------------------------+
|                          CORE IN-MEMORY ENGINE LAYER                              |
|  +------------------------------------------------------------------------------+ |
|  |                    Multi-Database Datastore (store.js)                       | |
|  |    [db0]   [db1]   [db2]   [db3]   ...   [db14]   [db15] (16 Isolated DBs)   | |
|  |    ------------------------------------------------------------------------  | |
|  |    Data Types: Strings | Hashes | Lists | Sets | Sorted Sets | HyperLogLogs  | |
|  +------------------------------------------------------------------------------+ |
|            |                                                    |                 |
|            v                                                    v                 |
|  +--------------------------------+            +--------------------------------+ |
|  |    TTL & Expiry (expiry.js)    |            |   LRU Eviction (lru.js)        | |
|  |  - Passive check on access     |            |  - MaxMemory Threshold Guard   | |
|  |  - Active 100ms probabilistic  |            |  - Volatile & AllKeys LRU      | |
|  +--------------------------------+            +--------------------------------+ |
+-----------------------------------------------------------------------------------+
                                      |
                                      v
+-----------------------------------------------------------------------------------+
|                           PERSISTENCE SUBSYSTEM                                   |
|  +-------------------------------------+   +------------------------------------+ |
|  |    RDB Snapshot Engine (rdb.js)     |   |    AOF Write-Ahead Logger (aof.js) | |
|  |  - Compact Binary Serialization     |   |  - Append-Only RESP Log            | |
|  |  - Point-in-time dump.rdb snapshots |   |  - fsync: always / everysec / no   | |
|  +-------------------------------------+   +------------------------------------+ |
+-----------------------------------------------------------------------------------+
```

---

## 3. Core Subsystems & Technical Deep Dive

### 3.1 Binary RESP2 Protocol Parser (`src/protocol/parser.js`)
The Redis Serialization Protocol (RESP2) parser is designed as a **deterministic state machine** capable of processing fragmented streaming buffers over TCP without losing state:
* **Bulk Strings (`$`)**: Tracks expected byte length, verifies trailing `\r\n` delimiters, and supports binary payloads.
* **Arrays (`*`)**: Recursively resolves multi-argument commands (`*3\r\n$3\r\nSET\r\n$4\r\nuser\r\n$5\r\nadmin\r\n`).
* **Integers (`:`)**: High-speed signed 64-bit integer parser.
* **Errors (`-`) & Simple Strings (`+`)**: Low-overhead inline string serialization.

### 3.2 In-Memory Data Structures & Complexities (`src/datastore/store.js`)
Every key in RediForge maps to a type-tagged object container holding payload data, access metadata, and expiration timestamps.

| Data Type | Internal Implementation Structure | Read Complexity | Write Complexity |
| :--- | :--- | :--- | :--- |
| **String** | Native Buffer / V8 Flat String | $\mathcal{O}(1)$ | $\mathcal{O}(1)$ |
| **Hash** | Hash Map (`Map<string, string>`) | $\mathcal{O}(1)$ | $\mathcal{O}(1)$ |
| **List** | Doubly-Linked Node Buffer Array | $\mathcal{O}(1)$ (push/pop) | $\mathcal{O}(1)$ |
| **Set** | Hash Table (`Set<string>`) | $\mathcal{O}(1)$ | $\mathcal{O}(1)$ |
| **Sorted Set** | Balanced Array + Score Hash Index | $\mathcal{O}(\log N)$ | $\mathcal{O}(\log N)$ |

### 3.3 Dual-Phase Expiry Engine (`src/datastore/expiry.js`)
To guarantee optimal memory reclamation without inducing CPU spikes:
1. **Passive Eviction**: Whenever any key is accessed (`GET`, `HGET`, `EXISTS`), its TTL timestamp is checked against `Date.now()`. If expired, it is deleted immediately and `null` is returned.
2. **Active Eviction Cron**: A background timer runs every **100ms**, sampling 20 random volatile keys per database. If more than 25% of the sampled keys are expired, the cycle immediately repeats to reclaim memory aggressively.

### 3.4 Dual Persistence Engine (RDB + AOF)
* **RDB (Redis Database Snapshot)**: Generates a binary snapshot file (`dump.rdb`) containing database selector opcodes, expiration timestamps, type identifiers, and serialized payloads.
* **AOF (Append-Only File)**: Writes every state-mutating command (`SET`, `DEL`, `HSET`, `EXPIRE`) to `appendonly.aof` using standard RESP formatting, ensuring zero data loss across process crashes.

---

## 4. Key Use Cases & Industry Applications

1. **Distributed High-Speed Session Management**: Store user sessions, JWT blacklists, and auth tokens with automatic TTL expiration.
2. **API Rate Limiting & Sliding Windows**: Enforce precision API quotas using `INCR` and `EXPIRE` primitives.
3. **Real-Time Leaderboards & Metrics**: Utilize Sorted Sets (`ZADD`, `ZRANGEBYSCORE`) for gaming leaderboards and financial ticker scoring.
4. **Pub/Sub Microservices Event Streaming**: Decouple microservices using pub/sub message channels.
5. **Database Caching Layer**: Sit in front of PostgreSQL, MongoDB, or MySQL to offload 95%+ of repetitive read queries.

---

## 5. Developer Philosophy ("What the Developer Thinks")

> *"True software craftsmanship is measured by simplicity, transparency, and first-principles design. Building a database is not merely about storing bytes in RAM; it is about guaranteeing deterministic latency, predictable memory behavior, and unwavering data integrity."*  
> — **Ashutosh Yadav**, Lead Architect of RediForge

* **Zero Bloat**: No 500-dependency npm chains. The core engine runs on native standard primitives.
* **Predictable Allocations**: Memory accounting prevents out-of-memory kernel kills through LRU evictions.
* **Security by Default**: Enterprise security controls are baked into the protocol layer rather than patched on top.

---

## 6. Verification & Quality Assurance

* **Unit & Integration Tests**: 153/153 tests passing across 28 test suites.
* **Protocol Conformance**: Validated against standard Redis client libraries (`redis-py`, `ioredis`, `Jedis`).
* **Continuous Delivery**: Fully containerized via Docker and deployed automatically to production on [rediforge.in](https://rediforge.in).
