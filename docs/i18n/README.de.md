# RediForge — Deutsche Dokumentation

<div align="center">

![RediForge Logo](https://img.shields.io/badge/RediForge-Redis--Compatible%20Datastore-1885E2?style=for-the-badge&logo=redis&logoColor=white)

**Hochperformanter, RESP2-kompatibler In-Memory-Datenspeicher, duales Persistenz-Subsystem und reaktive Echtzeit-Telemetrie-Engine, von Grund auf in Node.js entwickelt.**

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

## 1. Übersicht (Overview)

**RediForge** ist ein für Unternehmensanforderungen konzipierter In-Memory-Schlüssel-Wert-Datenspeicher (Key-Value Datastore), der aus ersten Prinzipien entwickelt wurde und eine **100-prozentige RESP2-Wire-Protokoll-Kompatibilität** mit Redis bietet. Die Core-Engine kommt vollständig **ohne externe Laufzeitabhängigkeiten** aus und fungiert als direkter Drop-in-Ersatz für Standard-Redis-Clients wie `redis-cli`, `ioredis`, `redis-py`, `Jedis` und `go-redis`.

Ein integriertes **Web-Administrations-Dashboard** verbindet sich über eine latenzfreie WebSocket-Bridge und ermöglicht Echtzeit-Vektor-Telemetrie, dynamische Speicherverbrauchsgraphen, Keyspace-Inspektion mit automatischen TTL-Berechnungen, Multi-Tenant-Rollenverwaltung (RBAC) und ein interaktives Browser-CLI-Terminal.

---

## 2. Systemarchitektur (Architecture)

```
                 +---------------------------------------+
                 |            Client-Zugriffsebene       |
                 |  (redis-cli / ioredis / Web-Browser)  |
                 +---------------------------------------+
                               |                 |
                   TCP-Port 6379           WebSocket / HTTP-Port 8080
                               |                 |
                 +--------------------+   +-----------------------+
                 |   RESP2-Parser     |   |   HTTP/WS-Bridge      |
                 | (Zustandsmaschine) |   | (SSRF-Guard & CORS)   |
                 +--------------------+   +-----------------------+
                               \                 /
                            +-----------------------+
                            |    Kommando-Gateway   |
                            | - Rate-Limiter        |
                            | - RBAC & OIDC-Auth    |
                            | - Schutz vor Abbrüchen|
                            | - Maskierte Audit-Logs|
                            +-----------------------+
                                        |
                            +-----------------------+
                            |    Befehlsregister    |
                            |  (102 RESP2-Befehle)  |
                            +-----------------------+
                                        |
     +----------------------------------+----------------------------------+
     |                                  |                                  |
+-------------------+            +-------------------+            +-------------------+
|  Multi-DB-Speicher|            |   Pub/Sub-Broker  |            | Persistenz-Schicht|
| (16 Partitionen)  |            | (Kanäle & Globs)  |            | (RDB & AOF-Sync)  |
| - LRU-Verdrängung |            +-------------------+            +-------------------+
| - TTL-Bereinigung |
+-------------------+
```

### Technische Spezifikationen:
1. **Deterministischer RESP2-Parser**:
   - Unterstützt Simple Strings (`+`), Errors (`-`), Integers (`:`), Bulk Strings (`$`) und Arrays (`*`).
   - Zero-Copy-Buffer-Slicing verarbeitet fragmentierte TCP-Streams absolut verlustfrei.
2. **Datenstrukturen & Zeitkomplexität**:
   - **Strings** ($\mathcal{O}(1)$): Binärsichere Bytefolgen, 64-Bit-Ganzzahlarithmetik (`INCRBY`, `DECRBY`), Bitfeld-Operationen (`BITOP`, `BITCOUNT`).
   - **Hashes** ($\mathcal{O}(1)$): Assoziative Feld-Wert-Maps mit Massenmutationen (`HMSET`, `HMGET`).
   - **Lists** ($\mathcal{O}(1)$): Doppelt verkettete Deque-Strukturen für beidseitiges Push/Pop (`LPUSH`, `RPOP`, `RPOPLPUSH`).
   - **Sets** ($\mathcal{O}(1)$): Eindeutige Mengensammlungen mit Mengenoperationen (`SUNIONSTORE`, `SINTERSTORE`, `SDIFFSTORE`).
   - **Sorted Sets (ZSets)** ($\mathcal{O}(\log N)$): Balancierte Datenstrukturen mit Score-Hash-Indizierung für Rangberechnung (`ZRANK`) und Score-Filterung (`ZRANGEBYSCORE`).
3. **Duales Persistenz-Subsystem**:
   - **RDB-Snapshots**: Periodische, atomare Binär-Serialisierung in `dump.rdb` mit Datenbank-Selektoren und CRC64-Prüfsummen.
   - **AOF (Append-Only File)**: Write-Ahead-Transaktionslog mit Fsync-Richtlinien (`always`, `everysec`, `no`) und asynchroner Kompaktierung (`BGREWRITEAOF`).
4. **Speicherkontingente & LRU-Verdrängung**:
   - Exakte Byte-Überwachung auf Heap-Ebene über alle 16 Datenbank-Partitionen.
   - Einstellbare Verdrängungsstrategien (`allkeys-lru`, `volatile-lru`, `noeviction`) verhindern unkontrollierte OOM-Abstürze.
5. **Zweiphasiges TTL-Ablaufmodell**:
   - **Passiv**: Überprüfung beim Schlüsselzugriff; abgelaufene Schlüssel werden augenblicklich freigegeben.
   - **Aktiv**: Ein Hintergrund-Cronjob (alle 100ms) zieht stochastische Stichproben von 20 Schlüsseln pro Datenbank. Übersteigt die Quote abgelaufener Schlüssel 25%, wird die Bereinigung sofort intensiviert.
6. **Zero-Trust-Sicherheitsarchitektur**:
   - TCP-native `AUTH`-Kennwortauthentifizierung.
   - Zustandsloser HMAC-SHA256-JWT-Token-Dienst und Google OIDC RS256 JWKS-Signaturvalidierung.
   - SSRF-Schutzwall: Blockiert Loopback-Adressen (`127.0.0.1`, `::1`), private Netze (RFC 1918), Cloud-Metadaten (`169.254.169.254`) und IPv4-gemappte IPv6-Adressen.

---

## 3. Benchmarks & Leistungskennzahlen

Ermittelt mit der Benchmark-Suite (`benchmark.js`):

- **Lesedurchsatz (GET)**: `820.701 ops/sek` (100.000 Operationen in 122ms)
- **Schreibdurchsatz (SET)**: `449.269 ops/sek` (100.000 Operationen in 223ms)
- **RDB-Wiederherstellungsquote**: `100,0%` (10.503 / 10.503 Schlüssel fehlerfrei rekonstruiert)
- **AOF-Wiedergabequote**: `100,0%` (4.999 / 4.999 Schlüssel wiederhergestellt)
- **Speicherstabilität unter Volllast**: 50.000 Schreibvorgänge unter 500KB-Limit ohne Speicherüberschreitung.

---

## 4. Schnellstart (Quick Start)

```bash
# Klonen und Abhängigkeiten installieren
git clone https://github.com/Ashutosh-Yadav-256/Build-Redis-In-JAVA.git
cd "Build-Redis-In-JAVA"
npm install

# Server starten (TCP 6379, Web 8080)
npm start
```

Web-Konsole: `http://127.0.0.1:8080` aufrufen.

Tests ausführen:
```bash
npm test
# 28 Suiten, 153 Tests bestanden (100% Erfolgsquote)
```

---

## 5. Autor & Lizenz

- **Chefarchitekt**: [Ashutosh Yadav](https://ashutoshwork.space/) ([GitHub](https://github.com/Ashutosh-Yadav-256))
- **Live-Demonstration**: [https://rediforge.in](https://rediforge.in)
- **Lizenz**: Lizenziert unter der [MIT-Lizenz](../../LICENSE).
