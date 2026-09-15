# RediForge — Documentación en Español

<div align="center">

![RediForge Logo](https://img.shields.io/badge/RediForge-Redis--Compatible%20Datastore-1885E2?style=for-the-badge&logo=redis&logoColor=white)

**Almacén de datos en memoria de alto rendimiento compatible con RESP2, subsistema de persistencia dual y motor de telemetría reactiva en tiempo real diseñado desde cero en Node.js.**

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

## 1. Descripción General (Overview)

**RediForge** es un almacén de datos clave-valor en memoria de grado empresarial, diseñado desde los primeros principios sin dependencias externas en su motor principal. Implementa el 100% de la especificación del protocolo de serialización de Redis **RESP2 (REdis Serialization Protocol)** a nivel de bytes, permitiendo la interoperabilidad transparente e inmediata con cualquier cliente Redis oficial (`redis-cli`, `ioredis`, `redis-py`, `Jedis`, `go-redis`).

Incluye un panel de administración web reactivo de alta fidelidad conectado a través de un puente WebSocket de baja latencia, con telemetría SVG en tiempo real, monitoreo dinámico del consumo de memoria, explorador visual de claves con cálculo automático de TTL, control de acceso basado en roles (RBAC) y un emulador de terminal interactivo en el navegador.

---

## 2. Arquitectura del Sistema (Architecture)

```
                 +---------------------------------------+
                 |            Capa de Clientes           |
                 | (redis-cli / ioredis / Navegador Web) |
                 +---------------------------------------+
                               |                 |
                  Puerto TCP 6379        Puerto WebSocket / HTTP 8080
                               |                 |
                 +--------------------+   +-----------------------+
                 |  Analizador RESP2  |   |   Puente HTTP / WS    |
                 |  (Máquina Estados) |   | (Firewall SSRF / CORS)|
                 +--------------------+   +-----------------------+
                               \                 /
                            +-----------------------+
                            |  Pasarela de Comandos |
                            | - Limitador de Tasa   |
                            | - RBAC y Google OIDC  |
                            | - Interceptor Seguro  |
                            | - Registro Auditoría  |
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
|  Almacén Multi-DB |            |   Broker Pub/Sub  |            |  Persistencia     |
| (16 Bases Datos)  |            | (Canales y Globs) |            | (RDB y Log AOF)   |
| - Desalojo LRU    |            +-------------------+            +-------------------+
| - Barrido TTL     |
+-------------------+
```

### Características Técnicas Clave:
1. **Máquina de Estados Determinista RESP2**: Procesamiento en streaming de buffers binarios sin asignaciones de memoria intermedias redundantes. Soporta cadenas simples (`+`), errores (`-`), enteros (`:`), cadenas en masa (`$`) y arreglos (`*`).
2. **Estructuras de Datos y Complejidades**:
   - **Strings** ($\mathcal{O}(1)$): Cadenas seguras en binario, aritmética atómica de 64 bits (`INCRBY`, `DECRBY`), flotantes (`INCRBYFLOAT`), operaciones a nivel de bits (`BITOP`, `BITCOUNT`).
   - **Hashes** ($\mathcal{O}(1)$): Mapas clave-valor asociativos con mutaciones masivas (`HMSET`, `HMGET`).
   - **Lists** ($\mathcal{O}(1)$): Deques bidireccionales con operaciones push/pop en ambos extremos (`LPUSH`, `RPOP`, `RPOPLPUSH`).
   - **Sets** ($\mathcal{O}(1)$): Colecciones de cadenas únicas sin ordenar con operaciones de unión, intersección y diferencia (`SINTERSTORE`, `SUNIONSTORE`, `SDIFFSTORE`).
   - **Sorted Sets (ZSets)** ($\mathcal{O}(\log N)$): Arreglos balanceados con índice hash de puntuación, cálculo de rangos (`ZRANK`) y filtros por puntuación (`ZRANGEBYSCORE`).
3. **Subsistema de Persistencia Dual**:
   - **Instantáneas RDB**: Serialización binaria atómica periódica en `dump.rdb` con encabezados de base de datos y verificación de integridad.
   - **Registro AOF (Append-Only File)**: Bitácora de transacciones Write-Ahead Log con políticas de fsync (`always`, `everysec`, `no`) y compactación en segundo plano (`BGREWRITEAOF`).
4. **Gestión de Memoria y Desalojo LRU**:
   - Contabilidad en bytes del montón (heap) a través de las 16 bases de datos lógicas.
   - Políticas de expulsión configurables (`allkeys-lru`, `volatile-lru`, `noeviction`).
5. **Modelo Dual de Expiración TTL**:
   - Expiración pasiva bajo acceso (`lazy on-access check`).
   - Expiración activa probabilística mediante temporizador recurrente (cada 100ms) que muestrea 20 claves aleatorias por partición.
6. **Seguridad Zero-Trust y Cortafuegos SSRF**:
   - Autenticación nativa TCP `AUTH`.
   - Tokens Bearer JWT HMAC-SHA256 sin estado y verificación de firmas públicas RS256 Google OIDC JWKS.
   - Bloqueo de direcciones de bucle local (`127.0.0.1`), rangos privados (RFC 1918), metadatos de proveedores cloud (`169.254.169.254`) y variantes ofuscadas IPv4-mapped IPv6.

---

## 3. Pruebas de Rendimiento (Benchmarks)

Evaluado mediante suites de micro-benchmarks concurrentes (`benchmark.js`):

- **Rendimiento de Lectura Bruta (GET)**: `820,701 operaciones/seg` (100k operaciones en 122ms).
- **Rendimiento de Escritura Bruta (SET)**: `449,269 operaciones/seg` (100k operaciones en 223ms).
- **Tasa de Recuperación RDB tras fallo**: `100.0%` (10,503 / 10,503 claves recuperadas intactas).
- **Desalojo LRU bajo saturación**: 50,000 escrituras sostenidas estrictamente por debajo del límite de 500KB sin desbordamiento de memoria.

---

## 4. Inicio Rápido (Quick Start)

```bash
# Clonar el repositorio
git clone https://github.com/Ashutosh-Yadav-256/Build-Redis-In-JAVA.git
cd "Build-Redis-In-JAVA"

# Instalar dependencias
npm install

# Iniciar servidor
npm start
```

Panel Web: Navegar a `http://127.0.0.1:8080`.

Pruebas automatizadas:
```bash
npm test
# 28 suites, 153 pruebas superadas (100% éxito)
```

---

## 5. Autor y Licencia

- **Arquitecto Principal**: [Ashutosh Yadav](https://ashutoshwork.space/) ([GitHub](https://github.com/Ashutosh-Yadav-256))
- **Demostración en Vivo**: [https://rediforge.in](https://rediforge.in)
- **Licencia**: Código abierto bajo la [Licencia MIT](../../LICENSE).
