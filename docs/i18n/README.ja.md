# RediForge — 日本語ドキュメント

<div align="center">

![RediForge Logo](https://img.shields.io/badge/RediForge-Redis--Compatible%20Datastore-1885E2?style=for-the-badge&logo=redis&logoColor=white)

**Node.js でゼロから構築された、RESP2 準拠の超高速インメモリデータストア、デュアル永続化サブシステム、およびリアルタイムリアクティブテレメトリエンジン**

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

## 1. 概要 (Overview)

**RediForge** は、第一原理（First Principles）に基づき設計されたエンタープライズグレードのインメモリ Key-Value データベースです。Redis の **RESP2 (REdis Serialization Protocol)** ワイヤープロトコル仕様に 100% 準拠しており、コアエンジンは外部依存パッケージを一切持たない「ゼロ・ランタイム・ディペンデンシー（Zero External Dependencies）」を実現しています。

標準の Redis クライアント（`redis-cli`、`ioredis`、`redis-py`、`Jedis`、`go-redis` など）と完全な互換性を持ち、そのまま差し替えて利用できます。また、超低遅延 WebSocket ブリッジを介したモダンな **Web 管理コンソール** を標準搭載しており、リアルタイムなメモリ消費グラフ、キースペースブラウザ、自動 TTL 計算、マルチテナント RBAC アクセス制御、ブラウザ内インタラクティブ CLI ターミナルを提供します。

---

## 2. システムアーキテクチャ (System Architecture)

```
                 +---------------------------------------+
                 |           クライアント接続層          |
                 |  (redis-cli / ioredis / Web ブラウザ) |
                 +---------------------------------------+
                               |                 |
                   TCP ポート 6379        WebSocket / HTTP ポート 8080
                               |                 |
                 +--------------------+   +-----------------------+
                 |  RESP2 解析エンジン|   | HTTP / WebSocket ゲートウェイ
                 | (決定論的状態機械) |   | (SSRF ガード & CORS)  |
                 +--------------------+   +-----------------------+
                               \                 /
                            +-----------------------+
                            |    コマンドゲートウェイ|
                            | - レートリミッター    |
                            | - RBAC & OIDC 認証    |
                            | - 危険コマンド抑止    |
                            | - 監査ログ（平文伏字）|
                            +-----------------------+
                                        |
                            +-----------------------+
                            |   コマンドレジストリ  |
                            |  (102 個の RESP2 命令)|
                            +-----------------------+
                                        |
     +----------------------------------+----------------------------------+
     |                                  |                                  |
+-------------------+            +-------------------+            +-------------------+
|  マルチ DB ストア |            |  Pub/Sub ブローカー|            |   永続化レイヤー  |
| (16 の論理 DB)    |            | (完全一致 & グロブ)|           | (RDB スナップ & AOF)|
| - LRU メモリ退避  |            +-------------------+            +-------------------+
| - 能動的 TTL 走査 |
+-------------------+
```

### 主要な技術的特長:
1. **決定論的 RESP2 ストリーミングパーサー**:
   - 単純文字列 (`+`)、エラー (`-`)、整数 (`:`)、一括文字列 (`$`)、配列 (`*`) をサポート。
   - ゼロコピー・バッファスライシングにより、TCP パケットの断片化や結合をオーバーヘッドなく高効率に処理。
2. **データ構造と計算量**:
   - **Strings** ($\mathcal{O}(1)$): バイナリセーフ文字列、64bit 整数アトミック計算 (`INCRBY`, `DECRBY`)、ビット演算 (`BITOP`, `BITCOUNT`)。
   - **Hashes** ($\mathcal{O}(1)$): フィールド・値の連想配列、高速存在チェック (`HEXISTS`)、一括操作 (`HMSET`, `HMGET`)。
   - **Lists** ($\mathcal{O}(1)$): 双方向リンクリスト構造による両端 push/pop (`LPUSH`, `RPOP`, `RPOPLPUSH`)。
   - **Sets** ($\mathcal{O}(1)$): 一意な要素集合、和集合・積集合・差集合の演算と格納 (`SUNIONSTORE`, `SINTERSTORE`, `SDIFFSTORE`)。
   - **Sorted Sets (ZSets)** ($\mathcal{O}(\log N)$): バランス配列とスコアハッシュインデックスによる高速順位取得 (`ZRANK`) およびスコア範囲抽出 (`ZRANGEBYSCORE`)。
3. **デュアル永続化サブシステム**:
   - **RDB スナップショット**: コンパクトなバイナリ形式（`dump.rdb`）による定期的なアトミック書き出しと CRC64 整合性保証。
   - **AOF (Append-Only File)**: `always`、`everysec`、`no` の各同期ポリシーに対応した WAL ログ、およびバックグラウンドログ圧縮・再構築 (`BGREWRITEAOF`)。
4. **メモリ会計と LRU 退避アルゴリズム**:
   - 16 の独立した論理データベース全体でのバイト単位正確なメモリ追跡。
   - `allkeys-lru`、`volatile-lru`、`noeviction` 退避ポリシーをサポートし、上限メモリ到達時の OOM クラッシュを完全防止。
5. **2フェーズ TTL 失効モデル**:
   - **受動的失効**: キーアクセス時に現在時刻と比較し、失効していれば即座にメモリ解放して null を返却。
   - **能動的確率サンプリング走査**: バックグラウンド cron（100ms 間隔）により各 DB から 20 個の揮発性キーをランダム抽出。25% 以上が失効していた場合は連続的に走査を継続。
6. **ゼロトラスト・セキュリティ**:
   - TCP ネイティブ `AUTH` 認証。
   - ステートレス HMAC-SHA256 JWT トークンおよび Google OIDC RS256 JWKS 公開鍵検証。
   - SSRF 防御: ループバックアドレス (`127.0.0.1`, `::1`)、プライベート IP (RFC 1918)、クラウドメタデータエンドポイント (`169.254.169.254`)、IPv4 射影 IPv6 の遮断。

---

## 3. ベンチマーク測定結果 (Benchmarks)

`benchmark.js` による並行負荷検証結果：

- **RAW 読み込みスループット (GET)**: `820,701 ops/sec` (10 万回処理を 122ms で完了)
- **RAW 書き込みスループット (SET)**: `449,269 ops/sec` (10 万回処理を 223ms で完了)
- **混合ワークロード (CRUD/ZSet)**: `365,369 ops/sec` (5 万回処理を 137ms で完了)
- **RDB クラッシュ復元率**: `100.0%` (10,503 / 10,503 キーを完全復元)
- **AOF ログ再生復元率**: `100.0%` (4,999 / 4,999 キーを完全再構築)
- **高圧下 LRU メモリ境界維持**: 500KB 上限設定下で 5 万回連続書き込みを実施し、OOM クラッシュゼロを実証。

---

## 4. クイックスタート (Quick Start)

```bash
# クローンと依存インストール
git clone https://github.com/Ashutosh-Yadav-256/Build-Redis-In-JAVA.git
cd "Build-Redis-In-JAVA"
npm install

# サーバー起動 (TCP: 6379, Web: 8080)
npm start
```

Web コンソール: ブラウザで `http://127.0.0.1:8080` を開きます。

テスト実行:
```bash
npm test
# 28 テストスイート、153 件のテストが 100% 合格
```

---

## 5. 作者とライセンス

- **リードアーキテクト**: [Ashutosh Yadav](https://ashutoshwork.space/) ([GitHub](https://github.com/Ashutosh-Yadav-256))
- **ライブデモ**: [https://rediforge.in](https://rediforge.in)
- **ライセンス**: [MIT ライセンス](../../LICENSE)
