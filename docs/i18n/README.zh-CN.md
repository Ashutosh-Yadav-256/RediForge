# RediForge — 简体中文文档

<div align="center">

![RediForge Logo](https://img.shields.io/badge/RediForge-Redis--Compatible%20Datastore-1885E2?style=for-the-badge&logo=redis&logoColor=white)

**基于 Node.js 从零工程实现的 RESP2 兼容高性能内存数据库、双重持久化子系统与实时遥测引擎**

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

## 1. 项目概述 (Overview)

**RediForge** 是一个企业级、内存优先的键值数据存储引擎，从第一性原理出发完全自主构建，严格遵循 Redis **RESP2 (REdis Serialization Protocol)** 通信协议规范。核心存储引擎具备 **零外部运行时依赖**（Zero Runtime Dependencies），原生支持与主流 Redis 客户端（如 `redis-cli`、`ioredis`、`redis-py`、`Jedis`、`go-redis`）的 100% 无缝兼容与平替。

RediForge 同时搭载了轻量级、响应式的 **Web 可视化管理控制台**，通过内置的高性能 WebSocket 遥测网关提供亚毫秒级延迟的实时系统状态监控、动态内存占用波形图、可视化键空间浏览、TTL 自动刷新、多租户 RBAC 权限控制及浏览器内置交互式 CLI 终端。

---

## 2. 核心架构与技术特性 (Core Architecture)

```
                 +---------------------------------------+
                 |            客户端连接层 (Clients)       |
                 |  (redis-cli / ioredis / 浏览器 Web UI) |
                 +---------------------------------------+
                               |                 |
                标准 TCP 端口 6379      WebSocket / HTTP 端口 8080
                               |                 |
                 +--------------------+   +-----------------------+
                 |  RESP2 协议解析器  |   | HTTP / WebSocket 网关 |
                 | (确定性状态机引擎)  |   |  (SSRF 防火墙 & CORS)  |
                 +--------------------+   +-----------------------+
                               \                 /
                            +-----------------------+
                            |     命令网关与守卫     |
                            | - 令牌桶限流          |
                            | - RBAC 权限与 OIDC 校验|
                            | - 高危指令拦截器      |
                            | - 敏感凭证脱敏审计日志|
                            +-----------------------+
                                        |
                            +-----------------------+
                            |     命令路由与注册表   |
                            |   (102 个 RESP2 指令) |
                            +-----------------------+
                                        |
     +----------------------------------+----------------------------------+
     |                                  |                                  |
+-------------------+            +-------------------+            +-------------------+
|   多分区内存引擎   |            |   发布/订阅 Broker|            |    双持久化引擎   |
| (16 个独立数据库)  |            | (精确频道与模式匹配)|           | (RDB 快照 & AOF)  |
| - LRU 内存淘汰机制 |            +-------------------+            +-------------------+
| - 双阶段主动 TTL   |
+-------------------+
```

### 关键子系统规范：

1. **确定性 RESP2 协议状态机**：
   - 原生支持 Simple Strings (`+`)、Errors (`-`)、Integers (`:`)、Bulk Strings (`$`) 以及 Arrays (`*`)。
   - 流式缓冲区切片（Zero-copy buffer slicing），支持任意 TCP 分包与粘包的无损还原。
2. **丰富的内存数据结构与复杂度**：
   - **Strings** ($\mathcal{O}(1)$)：支持二进制安全字节串、64 位整数原子自增减 (`INCRBY`)、浮点运算 (`INCRBYFLOAT`)、位图位运算 (`BITOP`, `BITCOUNT`)。
   - **Hashes** ($\mathcal{O}(1)$)：字段-值哈希映射，支持批量读写 (`HMSET`, `HMGET`) 与增量步长。
   - **Lists** ($\mathcal{O}(1)$)：双向链表/双端队列，支持两端推入弹出 (`LPUSH`, `RPOP`, `RPOPLPUSH`) 与范围切片 (`LRANGE`)。
   - **Sets** ($\mathcal{O}(1)$)：基于哈希表的唯一集合，支持交集、并集、差集运算与存储 (`SINTERSTORE`, `SUNIONSTORE`, `SDIFFSTORE`)。
   - **Sorted Sets (ZSets)** ($\mathcal{O}(\log N)$)：结合平衡有序索引与分值哈希表，提供高效排名计算 (`ZRANK`)、分值区间过滤 (`ZRANGEBYSCORE`)。
3. **双重持久化与灾难恢复引擎**：
   - **RDB (Redis Database) 快照**：紧凑型二进制序列化输出（`dump.rdb`），记录类型操作码、数据库编号与毫秒级过期戳，具备 CRC 校验机制。
   - **AOF (Append-Only File) 日志**：写前日志追加（WAL），提供 `always`、`everysec`、`no` 三种同步策略，并支持后台日志重写与压缩 (`BGREWRITEAOF`)。
4. **内存精确计量与 LRU 淘汰机制**：
   - 跨 16 个数据库分区进行字节级堆内存精确计量。
   - 支持 `allkeys-lru`、`volatile-lru` 与 `noeviction` 策略，在高压写入下确保内存边界稳定。
5. **双阶段 TTL 过期回收模型**：
   - **被动惰性回收**：在读写指令访问键时即时核验 TTL，若过期立即回收并返回空值。
   - **主动概率采样巡检**：后台周期（每 100ms）随机采样 20 个带 TTL 的键，若过期比例超过 25% 则连续触发深度回收循环。
6. **零信任安全体系 (Zero-Trust Security)**：
   - TCP 原生 `AUTH` 密码鉴权。
   - 无状态 HMAC-SHA256 JWT 令牌颁发与校验。
   - 基于 Google OIDC RS256 JWKS 公钥验签。
   - RBAC 三级权限控制（`admin`、`developer`、`viewer`）。
   - 高危指令阻断器（拦截未经授权的 `FLUSHALL`、`FLUSHDB`、`SHUTDOWN`）。
   - 全功能 SSRF 防火墙：阻止回环地址 (`127.0.0.1`, `::1`)、私有内网段 (RFC 1918)、云厂商元数据地址 (`169.254.169.254`) 以及 IPv4-mapped IPv6 混淆。

---

## 3. 基准测试与性能指标 (Benchmarks)

通过连续高并发压测套件（`benchmark.js`）实测指标：

| 评测维度 | 测试项目 | 实测性能指标 | 状态 |
| :--- | :--- | :--- | :--- |
| **吞吐量 (Throughput)** | 原始读取吞吐量 (GET) | **820,701 ops/sec** (10 万次操作耗时 122ms) | 达标 |
| | 原始写入吞吐量 (SET) | **449,269 ops/sec** (10 万次操作耗时 223ms) | 达标 |
| | 混合负载 (CRUD / ZSet) | **365,369 ops/sec** (5 万次操作耗时 137ms) | 达标 |
| **持久化与灾难恢复** | RDB 快照恢复率 | **100.0%** (10,503 / 10,503 个键完美还原) | 达标 |
| | RDB TTL 过期戳保留率 | **100.0%** (1,000 / 1,000 个过期时间准确保持) | 达标 |
| | AOF 指令重放还原率 | **100.0%** (4,999 / 4,999 个活跃键完全重构) | 达标 |
| **高压内存边界** | 500KB 阈值下的 LRU 淘汰 | 50,000 / 50,000 次高频写入全程无 OOM | 达标 |

---

## 4. 快速开始 (Quick Start)

### 环境要求
- Node.js `>= 20.0.0`
- npm `>= 9.0.0`

### 安装与启动
```bash
# 克隆仓库
git clone https://github.com/Ashutosh-Yadav-256/Build-Redis-In-JAVA.git
cd "Build-Redis-In-JAVA"

# 安装依赖（仅 WebSocket 桥接依赖）
npm install

# 启动服务器（TCP 6379 端口 + Web 8080 端口）
npm start
```

### 访问 Web 管理控制台
浏览器打开 `http://127.0.0.1:8080`，输入连接地址 `ws://127.0.0.1:8080` 即可实时查看监控波形与数据。

### 运行自动化测试套件
```bash
npm test
# 测试结果: 28 个测试套件，153 个测试用例全部通过 (100% Pass)
```

---

## 5. 多语言客户端连接示例 (Polyglot Connectivity)

RediForge 支持任意标准的 Redis 客户端。

### Python (`redis-py`)
```python
import redis

r = redis.Redis(host='127.0.0.1', port=6379, password='your-password', decode_responses=True)
r.set("user:101", "Developer")
print("User:", r.get("user:101"))
```

### Go (`go-redis`)
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
        Password: "your-password",
    })
    rdb.Set(ctx, "session:token", "alpha_token", 0)
    val, _ := rdb.Get(ctx, "session:token").Result()
    fmt.Println("Token:", val)
}
```

---

## 6. 开源许可与作者信息

- **架构设计与研发**：[Ashutosh Yadav](https://ashutoshwork.space/) (GitHub: [@Ashutosh-Yadav-256](https://github.com/Ashutosh-Yadav-256))
- **在线演示系统**：[https://rediforge.in](https://rediforge.in)
- **开源许可证**：本项目采用 [MIT 许可证](../../LICENSE)。
