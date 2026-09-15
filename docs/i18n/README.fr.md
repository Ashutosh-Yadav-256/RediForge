# RediForge — Documentation en Français

<div align="center">

![RediForge Logo](https://img.shields.io/badge/RediForge-Redis--Compatible%20Datastore-1885E2?style=for-the-badge&logo=redis&logoColor=white)

**Magasin de données en mémoire haute performance compatible RESP2, sous-système de persistance double et moteur de télémétrie réactive en temps réel développé de zéro en Node.js.**

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

## 1. Vue d'Ensemble (Overview)

**RediForge** est un magasin de données clé-valeur en mémoire de classe entreprise conçu selon les principes fondamentaux (« first principles »), sans aucune dépendance logicielle externe dans son moteur central. Il assure une **compatibilité intégrale (100%) au niveau des octets avec le protocole Redis RESP2 (REdis Serialization Protocol)**, permettant un remplacement transparent avec l'ensemble des bibliothèques clientes officielles (`redis-cli`, `ioredis`, `redis-py`, `Jedis`, `go-redis`).

RediForge intègre une **console d'administration Web réactive** reliée par un pont WebSocket à ultra-faible latence, offrant une télémétrie vectorielle en temps réel, un suivi dynamique de l'allocation mémoire, la navigation visuelle dans l'espace de clés avec inspection automatique des durées de vie (TTL), le contrôle d'accès basé sur les rôles (RBAC) et un émulateur de terminal interactif.

---

## 2. Architecture Technique (Architecture)

```
                 +---------------------------------------+
                 |            Couche des Clients         |
                 | (redis-cli / ioredis / Navigateur Web)|
                 +---------------------------------------+
                               |                 |
                   Port TCP 6379           Port WebSocket / HTTP 8080
                               |                 |
                 +--------------------+   +-----------------------+
                 |  Analyseur RESP2   |   |    Pont HTTP / WS     |
                 | (Machine d'États)  |   | (Pare-feu SSRF & CORS)|
                 +--------------------+   +-----------------------+
                               \                 /
                            +-----------------------+
                            | Passerelle Commandes  |
                            | - Limiteur de Débit   |
                            | - Auth RBAC & OIDC    |
                            | - Intercepteur Sécurité|
                            | - Journal d'Audit     |
                            +-----------------------+
                                        |
                            +-----------------------+
                            | Registre de Commandes |
                            |  (102 Commandes RESP2)|
                            +-----------------------+
                                        |
     +----------------------------------+----------------------------------+
     |                                  |                                  |
+-------------------+            +-------------------+            +-------------------+
| Magasin Multi-DB  |            |  Courtier Pub/Sub |            | Double Persistance|
| (16 Bases Isolées)|            | (Canaux & Modèles)|            | (RDB et Logs AOF) |
| - Éviction LRU    |            +-------------------+            +-------------------+
| - Balayage TTL    |
+-------------------+
```

### Caractéristiques Principales :
1. **Analyseur Déterministe RESP2** : Découpage de flux binaire à coût nul (zero-copy buffer slicing) pour un traitement fluide sans allocation superflue.
2. **Structures de Données et Complexités** :
   - **Strings** ($\mathcal{O}(1)$) : Chaînes binaires sûres, arithmétique 64 bits atomique (`INCRBY`, `DECRBY`), calcul flottant (`INCRBYFLOAT`), opérations binaires (`BITOP`, `BITCOUNT`).
   - **Hashes** ($\mathcal{O}(1)$) : Dictionnaires associatifs champ-valeur avec mutations par lot (`HMSET`, `HMGET`).
   - **Lists** ($\mathcal{O}(1)$) : Deques doublement chaînées (`LPUSH`, `RPOP`, `RPOPLPUSH`).
   - **Sets** ($\mathcal{O}(1)$) : Collections d'éléments uniques sans ordre avec opérations ensemblistes (`SUNIONSTORE`, `SINTERSTORE`, `SDIFFSTORE`).
   - **Sorted Sets (ZSets)** ($\mathcal{O}(\log N)$) : Tableaux équilibrés avec index de score pour classement rapide (`ZRANK`) et requêtes par intervalle (`ZRANGEBYSCORE`).
3. **Double Persistance et Tolérance aux Pannes** :
   - **Instantanés RDB** : Sérialisation binaire point-in-time dans `dump.rdb` avec métadonnées et vérification CRC64.
   - **Fichier AOF (Append-Only File)** : Journalisation transactionnelle Write-Ahead avec politiques de synchronisation (`always`, `everysec`, `no`) et réécriture de compactage (`BGREWRITEAOF`).
4. **Comptabilisation Mémoire et Éviction LRU** :
   - Suivi précis au niveau de l'octet à travers les 16 bases de données.
   - Politiques d'éviction paramétrables (`allkeys-lru`, `volatile-lru`, `noeviction`).
5. **Modèle d'Expiration TTL à Double Phase** :
   - Expiration passive lors de l'accès aux clés.
   - Balayage actif probabiliste toutes les 100ms échantillonnant 20 clés par partition.
6. **Sécurité Zero-Trust et Protection SSRF** :
   - Authentification native `AUTH`.
   - Jetons JWT signés HMAC-SHA256 et vérification de signature RS256 Google OIDC.
   - Protection SSRF stricte bloquant les adresses de bouclage (`127.0.0.1`), les sous-réseaux privés (RFC 1918), les métadonnées cloud (`169.254.169.254`) et les variations IPv6 mappées IPv4.

---

## 3. Métriques et Performances (Benchmarks)

Évalué via la suite de micro-benchmarks (`benchmark.js`) :

- **Débit de Lecture Brute (GET)** : `820 701 ops/sec` (100 000 opérations en 122ms)
- **Débit d'Écriture Brute (SET)** : `449 269 ops/sec` (100 000 opérations en 223ms)
- **Taux de Récupération RDB** : `100,0%` (10 503 / 10 503 clés restaurées)
- **Taux de Réexécution AOF** : `100,0%` (4 999 / 4 999 mutations restaurées)
- **Contrainte Mémoire Sous Pression** : 50 000 écritures consécutives sous une limite stricte de 500 Ko sans crash OOM.

---

## 4. Démarrage Rapide (Quick Start)

```bash
# Cloner le dépôt et installer
git clone https://github.com/Ashutosh-Yadav-256/Build-Redis-In-JAVA.git
cd "Build-Redis-In-JAVA"
npm install

# Démarrer le serveur (TCP 6379, Web 8080)
npm start
```

Console Web : Ouvrez `http://127.0.0.1:8080`.

Exécuter la suite de tests :
```bash
npm test
# 28 suites de tests, 153 tests réussis (100% de succès)
```

---

## 5. Auteur et Licence

- **Architecte Principal** : [Ashutosh Yadav](https://ashutoshwork.space/) ([GitHub](https://github.com/Ashutosh-Yadav-256))
- **Démonstration en Ligne** : [https://rediforge.in](https://rediforge.in)
- **Licence** : Logiciel libre sous [Licence MIT](../../LICENSE).
