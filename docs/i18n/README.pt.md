# RediForge — Documentação em Português

<div align="center">

![RediForge Logo](https://img.shields.io/badge/RediForge-Redis--Compatible%20Datastore-1885E2?style=for-the-badge&logo=redis&logoColor=white)

**Armazenamento de dados em memória de alto desempenho compatível com RESP2, subsistema de persistência dupla e motor de telemetria reativa em tempo real desenvolvido do zero em Node.js.**

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

## 1. Visão Geral (Overview)

O **RediForge** é um banco de dados chave-valor em memória de nível empresarial construído a partir de primeiros princípios, sem dependências externas em seu motor de dados central. Ele implementa 100% da especificação do protocolo de comunicação de rede **RESP2 (REdis Serialization Protocol)** do Redis, atuando como um substituto transparente e direto para os clientes padrão (`redis-cli`, `ioredis`, `redis-py`, `Jedis`, `go-redis`).

Acompanhando o motor está um **painel de administração Web reativo** conectado via WebSocket de baixa latência, fornecendo telemetria vetorial em tempo real, gráficos dinâmicos de consumo de memória, navegador visual de chaves com cálculo de TTL, controle de acesso baseado em funções (RBAC) e terminal CLI integrado no navegador.

---

## 2. Arquitetura do Sistema (Architecture)

```
                 +---------------------------------------+
                 |            Camada de Clientes         |
                 | (redis-cli / ioredis / Navegador Web) |
                 +---------------------------------------+
                               |                 |
                   Porta TCP 6379          Porta WebSocket / HTTP 8080
                               |                 |
                 +--------------------+   +-----------------------+
                 |  Analisador RESP2  |   |    Ponte HTTP / WS    |
                 | (Máquina Estados)  |   | (Firewall SSRF & CORS)|
                 +--------------------+   +-----------------------+
                               \                 /
                            +-----------------------+
                            |  Gateway de Comandos  |
                            | - Limitador de Taxa   |
                            | - RBAC & OIDC Auth    |
                            | - Bloqueio de Perigos |
                            | - Auditoria Mascarada |
                            +-----------------------+
                                        |
                            +-----------------------+
                            |  Registro de Comandos |
                            |  (102 Comandos RESP2) |
                            +-----------------------+
                                        |
     +----------------------------------+----------------------------------+
     |                                  |                                  |
+-------------------+            +-------------------+            +-------------------+
| Armazém Multi-DB  |            |   Broker Pub/Sub  |            | Persistência Dupla|
| (16 Bases Dados)  |            | (Canais & Padrões)|            | (RDB e Logs AOF)  |
| - Despejo LRU     |            +-------------------+            +-------------------+
| - Varredura TTL   |
+-------------------+
```

### Especificações Técnicas Centrais:
1. **Analisador de Fluxo Determinístico RESP2**: Fatiamento de buffers sem cópia intermediária (zero-copy buffer slicing), tolerando fragmentação arbitrária de pacotes TCP.
2. **Estruturas de Dados e Complexidade**:
   - **Strings** ($\mathcal{O}(1)$): Strings binárias seguras, aritmética de 64 bits atômica (`INCRBY`, `DECRBY`), operações de bits (`BITOP`, `BITCOUNT`).
   - **Hashes** ($\mathcal{O}(1)$): Mapas campo-valor associativos com mutações em massa (`HMSET`, `HMGET`).
   - **Lists** ($\mathcal{O}(1)$): Deques duplamente encadeadas com operações push/pop (`LPUSH`, `RPOP`, `RPOPLPUSH`).
   - **Sets** ($\mathcal{O}(1)$): Conjuntos únicos não ordenados com união, interseção e diferença (`SUNIONSTORE`, `SINTERSTORE`, `SDIFFSTORE`).
   - **Sorted Sets (ZSets)** ($\mathcal{O}(\log N)$): Vetores ordenados com índice hash de pontuação para cálculos rápidos de posição (`ZRANK`) e filtragem por faixa de pontuação (`ZRANGEBYSCORE`).
3. **Subsistema de Persistência Dupla**:
   - **Snapshots RDB**: Serialização binária atômica pontual em `dump.rdb` com verificação de integridade CRC64.
   - **AOF (Append-Only File)**: Registro Write-Ahead de transações com políticas fsync (`always`, `everysec`, `no`) e compactação em segundo plano (`BGREWRITEAOF`).
4. **Contabilidade de Memória e Despejo LRU**:
   - Rastreamento exato de bytes na memória heap nas 16 partições de banco de dados.
   - Políticas de desalocação (`allkeys-lru`, `volatile-lru`, `noeviction`) impedem falhas de Out-Of-Memory (OOM).
5. **Modelo de Expiração TTL em Duas Fases**:
   - Expiração passiva no acesso à chave.
   - Varredura ativa estocástica a cada 100ms que avalia 20 chaves aleatórias por banco de dados.
6. **Segurança Zero-Trust e Defesa SSRF**:
   - Autenticação TCP `AUTH`.
   - Tokens JWT HMAC-SHA256 sem estado e validação de chaves públicas RS256 Google OIDC.
   - Bloqueio completo de loopback (`127.0.0.1`), faixas privadas (RFC 1918), metadados de nuvem (`169.254.169.254`) e variantes IPv4-mapped IPv6.

---

## 3. Desempenho e Benchmarks

Resultados verificados com a suíte de testes de estresse (`benchmark.js`):

- **Taxa de Leitura Bruta (GET)**: `820.701 ops/seg` (100k operações em 122ms)
- **Taxa de Escrita Bruta (SET)**: `449.269 ops/seg` (100k operações em 223ms)
- **Taxa de Recuperação RDB**: `100,0%` (10.503 / 10.503 chaves recuperadas)
- **Taxa de Reexecução AOF**: `100,0%` (4.999 / 4.999 chaves restauradas)
- **Confinamento de Memória LRU**: 50.000 escrituras contínuas no teto estrito de 500KB sem erros.

---

## 4. Início Rápido (Quick Start)

```bash
# Clonar repositório e instalar
git clone https://github.com/Ashutosh-Yadav-256/Build-Redis-In-JAVA.git
cd "Build-Redis-In-JAVA"
npm install

# Iniciar servidor
npm start
```

Painel Web: Acesse `http://127.0.0.1:8080`.

Executar testes:
```bash
npm test
# 28 suítes, 153 testes aprovados (100% de sucesso)
```

---

## 5. Autor e Licença

- **Arquiteto Líder**: [Ashutosh Yadav](https://ashutoshwork.space/) ([GitHub](https://github.com/Ashutosh-Yadav-256))
- **Demonstração em Tempo Real**: [https://rediforge.in](https://rediforge.in)
- **Licença**: Código aberto sob a [Licença MIT](../../LICENSE).
