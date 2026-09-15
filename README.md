<div align="center">

<img src="docs/assets/logo.svg" alt="RediForge" width="220" />

# RediForge

![RediForge Header](https://img.shields.io/badge/RediForge-Enterprise%20In--Memory%20Datastore-1885E2?style=for-the-badge&logo=redis&logoColor=white)

**A high-performance, RESP2-compliant in-memory datastore, dual persistence subsystem, and real-time reactive telemetry engine engineered from first principles in Node.js.**

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![RESP2 Standard](https://img.shields.io/badge/RESP2%20Wire%20Protocol-100%25%20Compliant-1885E2?style=flat-square)](https://redis.io/docs/reference/protocol-spec/)
[![Commands Supported](https://img.shields.io/badge/Commands-102%20Supported-orange?style=flat-square)](#supported-commands-registry-102)
[![Test Suite](https://img.shields.io/badge/Tests-153%20Passing%20(100%25)-3CE0AD?style=flat-square)](#testing--verification)
[![Throughput](https://img.shields.io/badge/Read%20Throughput-820K%2B%20ops%2Fsec-blueviolet?style=flat-square)](#performance--micro-benchmarks)
[![Durability](https://img.shields.io/badge/Crash%20Recovery-100%25%20Durable-brightgreen?style=flat-square)](#persistence--durability-subsystems)
[![Memory Safety](https://img.shields.io/badge/Memory%20Ceiling-LRU%20Bounded-yellow?style=flat-square)](#memory-accounting--lru-eviction)
[![Zero Dependencies](https://img.shields.io/badge/Core%20Dependencies-0%20External-success?style=flat-square)](#first-principles-architecture)
[![License](https://img.shields.io/badge/License-MIT-gray?style=flat-square)](LICENSE)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-rediforge.in-blue?style=flat-square&logo=google-chrome&logoColor=white)](https://rediforge.in)

<br/>

**[ Live Production Demo: rediforge.in ](https://rediforge.in)** • **[ System Architecture Whitepaper ](ARCHITECTURE.md)**

<br/>

### Global Documentation / 语言导航 (10 Languages Supported)

[ **English** ](README.md) • 
[ **简体中文** (Chinese)](docs/i18n/README.zh-CN.md) • 
[ **Español** (Spanish)](docs/i18n/README.es.md) • 
[ **日本語** (Japanese)](docs/i18n/README.ja.md) • 
[ **Deutsch** (German)](docs/i18n/README.de.md) • 
[ **Français** (French)](docs/i18n/README.fr.md) • 
[ **한국어** (Korean)](docs/i18n/README.ko.md) • 
[ **Русский** (Russian)](docs/i18n/README.ru.md) • 
[ **Português** (Portuguese)](docs/i18n/README.pt.md) • 
[ **हिन्दी** (Hindi)](docs/i18n/README.hi.md)

---

</div>

## Table of Contents

- [1. Executive Overview & First-Principles Architecture](#1-executive-overview--first-principles-architecture)
- [2. System Architecture & Component Design](#2-system-architecture--component-design)
- [3. Deep Technical Specifications](#3-deep-technical-specifications)
  - [3.1 Deterministic RESP2 Streaming Protocol State Machine](#31-deterministic-resp2-streaming-protocol-state-machine)
  - [3.2 Multi-Database Keyspaces (16 Isolated Partitions)](#32-multi-database-keyspaces-16-isolated-partitions)
  - [3.3 In-Memory Data Structures & Algorithmic Time Complexities](#33-in-memory-data-structures--algorithmic-time-complexities)
  - [3.4 Dual-Phase Expiry Engine (Passive + Active Stochastic Sampling)](#34-dual-phase-expiry-engine-passive--active-stochastic-sampling)
  - [3.5 Bounded Memory Accounting & LRU Eviction Policies](#35-bounded-memory-accounting--lru-eviction-policies)
  - [3.6 Dual Persistence Subsystem (RDB Point-In-Time Snapshots & AOF WAL)](#36-dual-persistence-subsystem-rdb-point-in-time-snapshots--aof-wal)
  - [3.7 ACID-Style Transactions & Optimistic Concurrency Control](#37-acid-style-transactions--optimistic-concurrency-control)
  - [3.8 Real-Time Pub/Sub Message Broker & Pattern Matching](#38-real-time-pubsub-message-broker--pattern-matching)
  - [3.9 Zero-Trust Security Gateway & SSRF Firewall](#39-zero-trust-security-gateway--ssrf-firewall)
  - [3.10 Reactive WebSocket Telemetry & In-Browser Web Console](#310-reactive-websocket-telemetry--in-browser-web-console)
- [4. Performance & Micro-Benchmarks](#4-performance--micro-benchmarks)
- [5. Quick Start & Installation](#5-quick-start--installation)
- [6. 10 Client Programming Languages Quickstart](#6-10-client-programming-languages-quickstart)
- [7. Supported Commands Registry (102 Commands)](#7-supported-commands-registry-102-commands)
- [8. Production Deployment](#8-production-deployment)
- [9. Testing & Quality Verification](#9-testing--quality-verification)
- [10. Author, Attribution & License](#10-author-attribution--license)

---

## 1. Executive Overview & First-Principles Architecture

**RediForge** is an enterprise-grade, memory-first key-value datastore engineered from first principles to provide **100% RESP2 wire compatibility** with the Redis client ecosystem. It functions as a direct, seamless drop-in replacement for caching, sub-millisecond session state management, pub/sub messaging channels, transaction pipelines, and complex nested data operations.

### Why RediForge Was Built
1. **First-Principles Systems Engineering**: The core data engine runs with **zero external runtime dependencies** in Node.js. By relying purely on native low-level primitives (`net`, `crypto`, `fs`, `buffer`), RediForge avoids heavy npm supply-chain bloat, optimizes CPU cache locality, minimizes garbage collection pauses, and delivers deterministic event-loop execution.
2. **Open Ecosystem Continuity**: In response to commercial licensing transitions in the legacy Redis landscape (moving away from standard BSD licenses toward dual RSALv2/SSPLv1 models), RediForge provides developers and infrastructure teams with a transparent, fully inspectable, unencumbered open-source alternative under the MIT License.
3. **Unified Reactive Observability**: Rather than requiring auxiliary sidecar agents, Prometheus exporters, and external dashboards, RediForge integrates an asynchronous **WebSocket telemetry bridge** directly into the engine, exposing real-time vector telemetry, dynamic memory tracking, visual keyspace exploration, and an in-browser CLI terminal.

---

## 2. System Architecture & Component Design

RediForge operates an event-driven, non-blocking I/O multiplexing model separating raw wire-protocol ingestion from datastore mutation, persistence, and telemetry dispatch.

```
                      +-------------------------------------------------------------+
                      |                      Client Entry Layer                     |
                      |  - Standard Redis Clients (redis-py, ioredis, Jedis, etc.)  |
                      |  - Direct TCP redis-cli Terminal                            |
                      |  - Web Administration Dashboard (Browser SPA)               |
                      +-------------------------------------------------------------+
                                       |                               |
                     Raw TCP Traffic on Port 6379      WebSocket / HTTP on Port 8080
                                       |                               |
                      +---------------------------------+  +------------------------+
                      |      TCP Server (server.js)     |  | WebSocket Bridge       |
                      |  - Socket lifecycle management  |  |  (bridge.js)           |
                      |  - Stream chunk buffering       |  |  - JWT & OIDC Auth     |
                      |  - Max connection concurrency   |  |  - SSRF Security Guard |
                      +---------------------------------+  +------------------------+
                                       \                               /
                                        v                             v
                      +-------------------------------------------------------------+
                      |          Deterministic RESP2 Parser (parser.js)             |
                      |  State machine: Simple String (+), Error (-), Integer (:),  |
                      |                 Bulk String ($), Array (*)                  |
                      |  Zero-copy buffer slicing with partial frame reassembly     |
                      +-------------------------------------------------------------+
                                                       |
                                                       v
                      +-------------------------------------------------------------+
                      |         Command Gateway & Security Guard Layer              |
                      |  - Native TCP AUTH Verification (requirepass)               |
                      |  - Multi-Tenant Workspace & Role-Based Access (RBAC)        |
                      |  - Dangerous Command Interceptor (FLUSHALL, SHUTDOWN, etc.) |
                      |  - Sliding-Window Token Bucket Rate Limiter                 |
                      |  - Redacted Structured Audit Logger                         |
                      +-------------------------------------------------------------+
                                                       |
                                                       v
                      +-------------------------------------------------------------+
                      |              Command Registry & Dispatcher                  |
                      |          (102 Fully Implemented RESP2 Handlers)             |
                      +-------------------------------------------------------------+
                                                       |
         +---------------------------------------------+---------------------------------------------+
         |                                             |                                             |
         v                                             v                                             v
+-----------------------------+               +-----------------------------+               +-----------------------------+
|    Multi-DB Data Store      |               |     Pub/Sub Event Broker    |               |    Dual Persistence Layer   |
| (16 Isolated Namespaces)    |               |  (Channel & Glob Matching)  |               |  (RDB Snapshotting + AOF)   |
| - Key-value type storage    |               | - Real-time client fan-out  |               | - Atomic dump.rdb snapshots |
| - Precise byte accounting   |               | - Pattern subscriptions     |               | - Configurable AOF fsync    |
| - LRU eviction engine       |               | - Disconnection cleanup     |               | - Background AOF rewrite    |
| - Dual-phase TTL sweep      |               +-----------------------------+               +-----------------------------+
+-----------------------------+
```

---

## 3. Deep Technical Specifications

### 3.1 Deterministic RESP2 Streaming Protocol State Machine
The Redis Serialization Protocol (RESP2) parser (`src/protocol/parser.js`) is constructed as a high-speed, deterministic streaming state machine:
- **Zero-Copy Buffer Slicing**: TCP payload chunks are processed directly without allocating intermediate string objects, eliminating unnecessary V8 garbage collection churn.
- **Fragmented Stream Reassembly**: Partial frames delivered across multiple TCP segments are accumulated in an internal ring-buffer without losing cursor state.
- **Protocol Types Handled**:
  - **Simple Strings (`+`)**: Single-line status replies (e.g., `+OK\r\n`, `+PONG\r\n`).
  - **Errors (`-`)**: Structured error payloads (e.g., `-ERR unknown command 'FOO'\r\n`).
  - **Integers (`:`)**: 64-bit signed decimal values (e.g., `:1024\r\n`).
  - **Bulk Strings (`$`)**: Binary-safe byte streams with explicit length prefixes (e.g., `$6\r\nfoobar\r\n`); null values represented as `$-1\r\n`.
  - **Arrays (`*`)**: Heterogeneous nested command structures (e.g., `*3\r\n$3\r\nSET\r\n$3\r\nkey\r\n$5\r\nvalue\r\n`); null arrays as `*-1\r\n`.

### 3.2 Multi-Database Keyspaces (16 Isolated Partitions)
RediForge initializes with **16 logically isolated keyspaces** (`db0` through `db15`), mirroring standard Redis multi-database partitioning:
- Switched instantaneously via `SELECT <index>`.
- Client socket contexts track active database indexes independently.
- Atomic keyspace swaps executed in $\mathcal{O}(1)$ via `SWAPDB <index1> <index2>` pointer reallocation.

### 3.3 In-Memory Data Structures & Algorithmic Time Complexities
Every key in RediForge maps to a type-tagged object containing raw payload memory, an LRU access timestamp, creation metadata, and an optional TTL expiry.

| Data Type | Internal Backing Structure | Read Complexity | Write Complexity | Representative Operations |
| :--- | :--- | :--- | :--- | :--- |
| **String** | Raw Node.js Buffer / V8 Flat String | $\mathcal{O}(1)$ | $\mathcal{O}(1)$ | `SET`, `GET`, `INCRBY`, `DECRBY`, `SETRANGE`, `BITOP` |
| **Hash** | Native Fast Hash Map (`Map<string, string>`) | $\mathcal{O}(1)$ | $\mathcal{O}(1)$ | `HSET`, `HGET`, `HMGET`, `HDEL`, `HEXISTS`, `HLEN` |
| **List** | Bi-directional Linked Deque Array | $\mathcal{O}(1)$ at ends | $\mathcal{O}(1)$ push/pop | `LPUSH`, `RPUSH`, `LPOP`, `RPOP`, `LRANGE`, `LTRIM` |
| **Set** | Hash Table Set (`Set<string>`) | $\mathcal{O}(1)$ | $\mathcal{O}(1)$ | `SADD`, `SREM`, `SISMEMBER`, `SINTER`, `SUNION` |
| **Sorted Set** | Balanced Vector + Score Index Map | $\mathcal{O}(\log N)$ | $\mathcal{O}(\log N)$ | `ZADD`, `ZRANK`, `ZREVRANK`, `ZRANGEBYSCORE`, `ZREM` |
| **HyperLogLog**| Dense Cardinality Bit Array | $\mathcal{O}(1)$ | $\mathcal{O}(1)$ | `PFADD`, `PFCOUNT`, `PFMERGE` |

### 3.4 Dual-Phase Expiry Engine (Passive + Active Stochastic Sampling)
To guarantee aggressive memory reclamation without introducing latency spikes on the event loop:
1. **Passive (Lazy) Expiration**: Whenever a key is queried by any read or write command (`GET`, `HGET`, `EXISTS`, etc.), its TTL is validated against the monotonic clock. If expired, the key is evicted on the spot and `null` is returned.
2. **Active Stochastic Sweep**: A high-precision background timer fires at a frequency dictated by `hz` (default 10Hz / every 100ms), sampling 20 random volatile keys per database partition:
   - If a sampled key is expired, it is purged and its memory reclaimed immediately.
   - If more than 25% of the sampled keys are expired, the sweep loops iteratively to prevent expired keys from saturating the memory ceiling.

### 3.5 Bounded Memory Accounting & LRU Eviction Policies
RediForge tracks heap utilization at byte-level precision:
- Computes key lengths, value sizes, and map overhead continuously on every write.
- When `maxmemory` threshold is configured, mutations trigger the eviction engine before execution.
- **Eviction Policies**:
  - `allkeys-lru`: Evicts least-recently-used keys across all keyspaces.
  - `volatile-lru`: Evicts least-recently-used keys strictly among keys configured with a TTL.
  - `noeviction`: Rejects write mutations with an out-of-memory error (`-OOM command not allowed when used memory > 'maxmemory'`) while preserving read capability.

### 3.6 Dual Persistence Subsystem (RDB Point-In-Time Snapshots & AOF WAL)
RediForge offers comprehensive crash resilience through two distinct persistence modes:
1. **RDB (Redis Database Snapshot)**:
   - Atomic binary snapshot serialization writing to `dump.rdb`.
   - Emits database selector opcodes, expiration timestamps, type identifiers, and binary payloads, finalized with CRC64 checksum validation.
   - Triggers automatically based on configurable mutation rules (e.g., `save 900 1`, `save 300 10`, `save 60 10000`).
2. **AOF (Append-Only File)**:
   - Logs state-mutating commands directly into an append-only stream formatted in standard RESP2 wire format.
   - Configurable `appendfsync` policies:
     - `always`: Flushes to disk after every write operation (maximum durability).
     - `everysec`: Background thread-safe fsync once per second (ideal performance/safety balance).
     - `no`: Relies on OS filesystem flush buffers.
   - **Background Log Compaction (`BGREWRITEAOF`)**: Traverses current in-memory datastore state and emits the minimal set of restorative commands to compact bloated AOF files without blocking concurrent client requests.

### 3.7 ACID-Style Transactions & Optimistic Concurrency Control
- **`MULTI` / `EXEC` / `DISCARD` Pipeline**: Queues commands atomically per client socket, executing them sequentially without interleaving from concurrent clients.
- **Optimistic Concurrency Control via `WATCH` / `UNWATCH`**: Monitors specified keys for external mutations. If a watched key is modified prior to `EXEC`, the entire transaction pipeline aborts and yields a null array reply (`*-1\r\n`).

### 3.8 Real-Time Pub/Sub Message Broker & Pattern Matching
- **Exact Match Channels**: Low-overhead subscription queues supporting `SUBSCRIBE`, `UNSUBSCRIBE`, and `PUBLISH`.
- **Pattern Match Channels**: Glob-style subscription routing via `PSUBSCRIBE` and `PUNSUBSCRIBE` allowing wildcard broadcast (e.g., `orders.*`, `telemetry.eu.?`).

### 3.9 Zero-Trust Security Gateway & SSRF Firewall
Engineered for modern multi-tenant cloud environments:
- **Native TCP Authentication**: Validates client passwords via `AUTH <password>` against `requirepass`.
- **Stateless Bearer JWT Tokens**: Cryptographic HMAC-SHA256 tokens minted with 1-hour expiration.
- **Google OIDC JWKS Integration**: Verifies RS256 signatures against official Google public JWKS endpoints (`/api/auth/oidc`).
- **Role-Based Access Control (RBAC)**: Enforces three distinct permission tiers:
  - `admin`: Unrestricted access to all keys, commands, and administrative procedures.
  - `developer`: Full access to data structure operations; administrative and destructive commands blocked.
  - `viewer`: Read-only queries permitted; all write mutations rejected.
- **Dangerous Command Interceptor**: Restricts destructive commands (`FLUSHALL`, `FLUSHDB`, `SHUTDOWN`, `CONFIG`, `SAVE`) strictly to authenticated administrator contexts.
- **Full-Spectrum SSRF Firewall**: Validates outbound network requests, blocking:
  - Loopback addresses (`127.0.0.1`, `localhost`, `::1`).
  - Private RFC 1918 IPv4 blocks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
  - Private RFC 4193 IPv6 subnets (`fc00::/7`).
  - Cloud provider metadata endpoints (`169.254.169.254`).
  - IPv4-mapped IPv6 obfuscation vectors (e.g. `::ffff:127.0.0.1`).
- **Structured Audit Logging**: Emits machine-readable audit trails for administrative and rejected operations with automatic credential masking (`AUTH ******`).

### 3.10 Reactive WebSocket Telemetry & In-Browser Web Console
RediForge ships with a production-grade Web Management Console running on port `8080`:
- **Hardware-Accelerated SVG Telemetry Graph**: Sub-0.05ms vector rendering with dynamic headroom auto-scaling, real-time memory history tracking, live pulse indicators, and zero layout thrashing.
- **Visual Keyspace Browser**: Interactive key explorer supporting all Redis data structures (`STRING`, `HASH`, `LIST`, `SET`, `ZSET`) with live TTL countdowns and deletion guards.
- **Embedded Web CLI Terminal**: Full terminal emulation with command history (Arrow Up/Down), prompt reflection per database (`redis[db0]>`), and instant RESP response formatting.
- **Logical Database Partitioning**: Seamless visual switching between `db0` and `db15` with isolated namespace presentation.
- **Live KPI Status Cards**: Real-time connected client count, memory utilization, total active keys, and node engine uptime.

---

## 4. Performance & Micro-Benchmarks

Micro-benchmark load testing executed using `benchmark.js` under continuous concurrent stress:

```text
========================================================================
  RediForge High-Concurrency Micro-Benchmark & Durability Report
========================================================================
  Throughput:
    - Raw Read Throughput (GET)    : 820,701 ops/sec (100,000 ops in 122ms)
    - Raw Write Throughput (SET)   : 449,269 ops/sec (100,000 ops in 223ms)
    - Mixed Workload (CRUD/ZSet)   : 365,369 ops/sec (50,000 ops in 137ms)

  Durability & Crash Recovery:
    - RDB Snapshot Recovery Rate   : 100.0% (10,503 / 10,503 keys restored)
    - RDB TTL Expirations Intact   : 100.0% (1,000 / 1,000 expiries preserved)
    - AOF Mutation Replay Rate     : 100.0% (4,999 / 4,999 active keys restored)

  Memory Bounding & Eviction:
    - LRU Eviction Under Pressure  : 50,000 / 50,000 writes sustained under 500KB cap
    - Maximum Memory Ceiling Held  : 499,550 bytes (0 OOM crashes)
========================================================================
```

---

## 5. Quick Start & Installation

### Prerequisites
- [Node.js](https://nodejs.org/) `>= 20.0.0`
- `npm` `>= 9.0.0`

### Installation
```bash
# Clone the repository
git clone https://github.com/Ashutosh-Yadav-256/Build-Redis-In-JAVA.git
cd "Build-Redis-In-JAVA"

# Install development dependencies (WebSocket bridge)
npm install
```

### Launching the Server

#### Default Mode (TCP 6379 & Web 8080):
```bash
npm start
```

#### Running with Authentication Enabled:
```bash
# Linux / macOS
REDIS_PASSWORD="your-strong-password" node src/server.js

# Windows PowerShell
$env:REDIS_PASSWORD = "your-strong-password"; node src/server.js
```

#### Custom Configuration Flags:
```bash
node src/server.js \
  --port 6379 \
  --bind 0.0.0.0 \
  --databases 16 \
  --maxmemory 104857600 \
  --maxmemory-policy allkeys-lru \
  --appendonly yes \
  --appendfsync everysec \
  --requirepass "your-strong-password"
```

### Accessing the Web Dashboard
Open your browser and navigate to:
```
http://127.0.0.1:8080
```
Enter the server address (`ws://127.0.0.1:8080`) and your server password to access live telemetry.

### Seeding Rich Demo Keys
Populate the active database with realistic Strings, Hashes, Lists, Sets, and Sorted Sets with TTL expirations:
```bash
npm run seed
```

---

## 6. 10 Client Programming Languages Quickstart

Because RediForge is 100% RESP2 compliant, it connects seamlessly with official Redis client libraries across all major languages.

<details open>
<summary><b>Click to toggle polyglot client connection examples (10 Languages)</b></summary>

### 1. Node.js / TypeScript (`ioredis`)
```typescript
import Redis from 'ioredis';

const redis = new Redis({
  host: '127.0.0.1',
  port: 6379,
  password: 'your-strong-password',
});

async function main() {
  await redis.set('user:session', 'token_9921', 'EX', 3600);
  const token = await redis.get('user:session');
  console.log('Session:', token);
  await redis.quit();
}
main();
```

### 2. Python (`redis-py`)
```python
import redis

client = redis.Redis(
    host='127.0.0.1',
    port=6379,
    password='your-strong-password',
    decode_responses=True
)

client.set('service:status', 'healthy', ex=60)
print('Status:', client.get('service:status'))
client.hset('user:profile', mapping={'name': 'Alex', 'role': 'SRE'})
print('Profile:', client.hgetall('user:profile'))
```

### 3. Go (`go-redis/v9`)
```go
package main

import (
	"context"
	"fmt"
	"github.com/redis/go-redis/v9"
)

func main() {
	ctx := context.Background()
	rdb := redis.NewClient(&redis.Options{
		Addr:     "127.0.0.1:6379",
		Password: "your-strong-password",
		DB:       0,
	})

	err := rdb.Set(ctx, "cluster:leader", "node-01", 0).Err()
	if err != nil {
		panic(err)
	}

	val, err := rdb.Get(ctx, "cluster:leader").Result()
	fmt.Println("Leader Node:", val)
}
```

### 4. Java (`Jedis`)
```java
import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;

public class RediForgeClient {
    public static void main(String[] args) {
        try (JedisPool pool = new JedisPool("127.0.0.1", 6379)) {
            try (Jedis jedis = pool.getResource()) {
                jedis.auth("your-strong-password");
                jedis.set("app:version", "v2.4.0");
                System.out.println("Stored Version: " + jedis.get("app:version"));
            }
        }
    }
}
```

### 5. Rust (`redis-rs`)
```rust
use redis::Commands;

fn main() -> redis::RedisResult<()> {
    let client = redis::Client::open("redis://:your-strong-password@127.0.0.1:6379/")?;
    let mut con = client.get_connection()?;

    con.set("metrics:qps", 820000)?;
    let qps: i64 = con.get("metrics:qps")?;
    println!("Recorded QPS: {}", qps);

    Ok(())
}
```

### 6. C# / .NET (`StackExchange.Redis`)
```csharp
using System;
using StackExchange.Redis;

class Program {
    static void Main() {
        ConfigurationOptions options = ConfigurationOptions.Parse("127.0.0.1:6379");
        options.Password = "your-strong-password";
        
        ConnectionMultiplexer redis = ConnectionMultiplexer.Connect(options);
        IDatabase db = redis.GetDatabase();

        db.StringSet("order:8012", "processed");
        Console.WriteLine("Order Status: " + db.StringGet("order:8012"));
    }
}
```

### 7. C++ (`redis-plus-plus`)
```cpp
#include <sw/redis++/redis++.h>
#include <iostream>

int main() {
    auto redis = sw::redis::Redis("tcp://127.0.0.1:6379?password=your-strong-password");
    redis.set("sensor:temp", "24.5");
    auto val = redis.get("sensor:temp");
    if (val) {
        std::cout << "Sensor Temperature: " << *val << " C" << std::endl;
    }
    return 0;
}
```

### 8. PHP (`Predis`)
```php
<?php
require 'vendor/autoload.php';

$client = new Predis\Client([
    'scheme'   => 'tcp',
    'host'     => '127.0.0.1',
    'port'     => 6379,
    'password' => 'your-strong-password',
]);

$client->set('cache:banner', 'Welcome to RediForge');
echo $client->get('cache:banner') . PHP_EOL;
```

### 9. Ruby (`redis-rb`)
```ruby
require 'redis'

redis = Redis.new(host: "127.0.0.1", port: 6379, password: "your-strong-password")
redis.set("user:locale", "en-US")
puts "Locale: #{redis.get("user:locale")}"
```

### 10. Swift (`RediStack`)
```swift
import RediStack
import NIO

let eventLoop = MultiThreadedEventLoopGroup(numberOfThreads: 1)
let connection = try RedisConnection.makeAddressResolvedConnection(
    to: try SocketAddress(ipAddress: "127.0.0.1", port: 6379),
    on: eventLoop.next()
).wait()

_ = connection.authorize(with: "your-strong-password").wait()
_ = connection.set("device:id", to: "AP-401").wait()
let val = try connection.get("device:id").wait()
print("Device: \(val?.string ?? "nil")")
```

</details>

---

## 7. Supported Commands Registry (102 Commands)

RediForge implements 102 commands across 8 functional categories:

<details open>
<summary><b>Expand Complete 102 RESP2 Command Matrix</b></summary>

### 1. Strings (24 Commands)
`SET`, `GET`, `GETSET`, `GETDEL`, `SETNX`, `SETEX`, `PSETEX`, `MGET`, `MSET`, `MSETNX`, `INCR`, `DECR`, `INCRBY`, `DECRBY`, `INCRBYFLOAT`, `APPEND`, `STRLEN`, `GETRANGE`, `SETRANGE`, `SETBIT`, `GETBIT`, `BITCOUNT`, `BITPOS`, `BITOP`

### 2. Hashes (15 Commands)
`HSET`, `HGET`, `HMSET`, `HMGET`, `HGETALL`, `HDEL`, `HEXISTS`, `HLEN`, `HKEYS`, `HVALS`, `HINCRBY`, `HINCRBYFLOAT`, `HSETNX`, `HRANDFIELD`, `HSTRLEN`

### 3. Lists (17 Commands)
`LPUSH`, `RPUSH`, `LPUSHX`, `RPUSHX`, `LPOP`, `RPOP`, `LLEN`, `LRANGE`, `LINDEX`, `LSET`, `LREM`, `LTRIM`, `LINSERT`, `RPUSHEX`, `RPOPLPUSH`, `LMOVE`, `LPOS`

### 4. Sets (15 Commands)
`SADD`, `SREM`, `SMEMBERS`, `SISMEMBER`, `SMISMEMBER`, `SCARD`, `SPOP`, `SRANDMEMBER`, `SMOVE`, `SINTER`, `SUNION`, `SDIFF`, `SINTERSTORE`, `SUNIONSTORE`, `SDIFFSTORE`

### 5. Sorted Sets / ZSets (12 Commands)
`ZADD`, `ZSCORE`, `ZINCRBY`, `ZCARD`, `ZCOUNT`, `ZRANGE`, `ZREVRANGE`, `ZRANGEBYSCORE`, `ZRANK`, `ZREVRANK`, `ZREM`, `ZREMRANGEBYSCORE`

### 6. Key Management & Expirations (10 Commands)
`DEL`, `EXISTS`, `TYPE`, `KEYS`, `SCAN`, `TTL`, `PTTL`, `EXPIRE`, `PEXPIRE`, `PERSIST`

### 7. Transactions & Pub/Sub (10 Commands)
`MULTI`, `EXEC`, `DISCARD`, `WATCH`, `UNWATCH`, `SUBSCRIBE`, `UNSUBSCRIBE`, `PSUBSCRIBE`, `PUNSUBSCRIBE`, `PUBLISH`

### 8. Server Administration & Diagnostics (9 Commands)
`PING`, `ECHO`, `INFO`, `DBSIZE`, `SELECT`, `SWAPDB`, `CONFIG`, `SAVE`, `BGSAVE`, `BGREWRITEAOF`, `FLUSHDB`, `FLUSHALL`, `SHUTDOWN`

</details>

---

## 8. Production Deployment

### Docker Containerization
Build and run RediForge inside an isolated, lightweight Alpine container:

```bash
# Build the image
docker build -t rediforge:latest .

# Run with custom password and port forwards
docker run -d \
  --name rediforge-production \
  -p 6379:6379 \
  -p 8080:8080 \
  -e REDIS_PASSWORD="your-strong-password" \
  -v rediforge_data:/app/data \
  rediforge:latest
```

### Docker Compose
```yaml
version: '3.8'

services:
  rediforge:
    build: .
    container_name: rediforge
    ports:
      - "6379:6379"
      - "8080:8080"
    environment:
      - REDIS_PASSWORD=production_secure_pass
    volumes:
      - rediforge_storage:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "const net = require('net'); const s = net.connect(6379, () => { s.write('PING\\r\\n'); s.on('data', () => process.exit(0)); });"]
      interval: 10s
      timeout: 3s
      retries: 3

volumes:
  rediforge_storage:
```

### Render Blueprint Deployment
The repository includes a ready-to-deploy [`render.yaml`](render.yaml) specification:
- Deploys as a Docker Web Service with health check verification on `/health`.
- Automatically provisions cryptographically secure credentials for `REDIS_PASSWORD`.

---

## 9. Testing & Quality Verification

RediForge implements comprehensive automated testing validating protocol adherence, concurrency, active eviction, RDB snapshot generation, AOF log replay, and zero-trust security filters.

```bash
npm test
```

```text
========================================================================
Test Execution Summary:
========================================================================
Test Suites : 28 passed, 28 total
Tests       : 153 passed, 153 total (100% Pass Rate)
Snapshots   : 0 total
Duration    : 3.82s
Environment : Node.js v20+ Native Test Runner
========================================================================
```

To execute the continuous performance micro-benchmark suite:
```bash
node benchmark.js
```

---

## 10. Author, Attribution & License

- **Lead Architect**: [Ashutosh Yadav](https://ashutoshwork.space/)
  - GitHub: [@Ashutosh-Yadav-256](https://github.com/Ashutosh-Yadav-256)
  - Contact: [ashutosh4tech@gmail.com](mailto:ashutosh4tech@gmail.com)
- **Live Production Deployment**: [https://rediforge.in](https://rediforge.in)
- **System Architecture Document**: [ARCHITECTURE.md](ARCHITECTURE.md)

### License
This project is open-source software licensed under the **[MIT License](LICENSE)**. You are free to use, modify, distribute, and integrate RediForge into personal, academic, or commercial production workloads.
