# System Design Study Notes — Part 8

## Databases: SQL vs NoSQL (PostgreSQL, MySQL, MongoDB, Redis)

> **Format:** Written as **Q&A** — my prompts are the questions, the explanations are the answers. Complete capture of the chat, reorganized and expanded. Diagrams, comparison tables, a simple ACID walkthrough, and interview Q&A included.
>
> **Continues from:** Parts 2 (sharding/replication), 4 (CAP — MongoDB=CP, Redis=AP; ACID vs BASE), 5 (Redis as cache). This part unifies it into "how do I choose a database?"

---

## Table of Contents

1. [The big picture: two families](#families)
2. [The four databases in one line each](#four)
3. [Dimension 1 — Schema (rigid vs flexible)](#schema)
4. [Dimension 2 — Relationships & flexibility (JOINs vs denormalization)](#relationships)
5. [Dimension 3 — Scaling (vertical vs horizontal)](#scaling)
6. [Dimension 4 — Transactions (ACID vs BASE)](#transactions)
7. [ACID explained with a simple example](#acid)
8. [PostgreSQL vs MySQL](#pg-mysql)
9. [MongoDB vs Redis](#mongo-redis)
10. [Use cases — when to use what](#usecases)
11. [Master comparison table](#master)
12. [Interview questions & answers](#interview)
13. [Cheat Sheet — everything on one page](#cheatsheet)

---

<a name="families"></a>
# 1. The big picture: two families

```
                         DATABASES
                    ┌────────┴────────┐
                  SQL                NoSQL
             (Relational)       (Non-relational)
          ┌──────┴──────┐    ┌──────┬──────┬──────┐
      PostgreSQL     MySQL  MongoDB Redis Cassandra ...
                            (document)(key-value)
```

- **SQL (Relational)** — data in **structured tables** (rows & columns) with a **fixed schema** and **relationships** between tables. Spreadsheets that reference each other. `PostgreSQL`, `MySQL`.
- **NoSQL (Non-relational)** — data in **flexible formats** (documents, key-value, etc.), often no fixed schema, built to **scale horizontally**. `MongoDB` (documents), `Redis` (key-value).

> The whole decision comes down to four dimensions — **schema, relationships, scaling, transactions** — mapped to your **use case**.

---

<a name="four"></a>
# 2. The four databases in one line each

| DB | Family | Type | One-liner |
|---|---|---|---|
| **PostgreSQL** | SQL | Relational | Advanced, feature-rich relational DB; great for complex queries + integrity |
| **MySQL** | SQL | Relational | Simpler, fast, hugely popular relational DB (classic web stack) |
| **MongoDB** | NoSQL | Document | Stores flexible JSON-like documents; scales horizontally |
| **Redis** | NoSQL | Key-value (in-memory) | Blazing-fast in-memory store; cache, sessions, real-time |

---

<a name="schema"></a>
# 3. Dimension 1 — Schema (rigid vs flexible)

**Schema = the defined structure of your data** (what fields exist, their types).

## SQL — rigid, predefined schema
Define tables/columns **up front**. Every row must fit. Changing it later needs a **migration**.
```
USERS table (fixed columns):
┌────┬─────────┬───────────────────┬─────┐
│ id │ name    │ email             │ age │
├────┼─────────┼───────────────────┼─────┤
│ 1  │ Alice   │ alice@mail.com    │ 30  │
│ 2  │ Bob     │ bob@mail.com      │ 25  │
└────┴─────────┴───────────────────┴─────┘
   Every row MUST have these columns, these types.
```
- ✅ **Data integrity** — DB enforces structure; no malformed data.
- ❌ **Rigid** — adding a field means altering the table (a migration).

## NoSQL (MongoDB) — flexible / dynamic schema
Each **document** can have different fields. Store JSON-like objects; no upfront schema.
```json
// Same collection, different shapes — totally fine:
{ "id": 1, "name": "Alice", "email": "alice@mail.com", "age": 30 }
{ "id": 2, "name": "Bob", "hobbies": ["chess", "cycling"], "premium": true }
```
- ✅ **Flexible** — evolve without migrations; great for changing requirements / varied data.
- ❌ **No enforced structure** — the *application* must handle inconsistency.

> **Trade-off:** SQL trades flexibility for **integrity and structure**; NoSQL trades structure for **flexibility and speed of change**.

---

<a name="relationships"></a>
# 4. Dimension 2 — Relationships & flexibility (JOINs vs denormalization)

## SQL — normalized, with relationships (JOINs)
Split data across tables, link with **foreign keys**, combine with **JOINs**. Avoids duplication (**normalization**).
```
USERS table          ORDERS table
┌────┬───────┐       ┌────┬─────────┬────────┐
│ id │ name  │       │ id │ user_id │ amount │
├────┼───────┤       ├────┼─────────┼────────┤
│ 1  │ Alice │◀──────│ 10 │   1     │  $50   │   (order 10 belongs to Alice)
└────┴───────┘       └────┴─────────┴────────┘
       JOIN on user_id → "Alice ordered $50"
```
- ✅ **No duplication**, powerful **complex queries**, strong for analytics/reporting.
- ❌ JOINs across huge tables can be **slow**; hard to shard (related data may be on different shards — Part 2's cross-shard pain).

## NoSQL (MongoDB) — denormalized, self-contained documents
Nest related data in one document instead of splitting + joining.
```json
{
  "id": 1, "name": "Alice",
  "orders": [ { "id": 10, "amount": 50 } ]   // order nested INSIDE the user
}
```
- ✅ **One read gets everything** — no JOIN → fast reads, easy to shard (a user's data lives together).
- ❌ **Duplication**; updates to duplicated data are harder.

> **Flexibility summary:** SQL for **highly relational** data (many connections, complex queries); NoSQL for **self-contained / hierarchical** data with fast JOIN-free reads.

---

<a name="scaling"></a>
# 5. Dimension 3 — Scaling (vertical vs horizontal) — ties to Part 2

## SQL — scales vertically more naturally; horizontal is harder
- **Vertical scaling** (bigger machine — Part 3) is the default.
- **Read replicas** (Part 2) scale reads well.
- **Sharding is hard** — JOINs/relationships across shards + keeping ACID across shards is complex. (Postgres/MySQL *can* shard via Citus/Vitess, but it's painful.)

## NoSQL — built for horizontal scaling
- **MongoDB has built-in sharding** — designed to scale out from day one.
- Self-contained documents shard naturally (queries hit one shard).
- **Redis** scales via clustering; in-memory (RAM-limited, but insanely fast).

```
SQL:   easier to scale UP (bigger box), harder to scale OUT (sharding painful)
NoSQL: designed to scale OUT (add machines) — horizontal from the start
```

> A major reason NoSQL rose: smoother horizontal scaling for massive data. (Modern SQL has closed the gap somewhat.)

---

<a name="transactions"></a>
# 6. Dimension 4 — Transactions (ACID vs BASE) — ties to Part 4

## SQL — strong ACID transactions
A **transaction** groups operations so they all succeed or all fail together. SQL is the gold standard. **ACID** (full example in the next section).
> **Why banking/finance uses SQL:** you cannot have a transfer that half-completes.

## NoSQL — traditionally BASE (weaker guarantees)
**BASE = Basically Available, Soft state, Eventual consistency.** Prioritizes **availability + speed** over strict correctness (the AP side of CAP, Part 4).
- Traditionally sacrificed multi-record transactions for scale + speed.
- **MongoDB now supports multi-document ACID** (since v4.0) — the line has blurred — but it's still most often used BASE-style.
- **Redis** has simple `MULTI`/`EXEC` transactions — lightweight, not full ACID.

> **Trade-off = CAP (Part 4):** SQL leans **CP** (correctness); many NoSQL lean **AP** (availability + scale, eventual consistency).

---

<a name="acid"></a>
# 7. ACID explained with a simple example

**Scenario:** Alice transfers **$100 to Bob** — really **two operations**:
1. Subtract $100 from Alice
2. Add $100 to Bob

## A — Atomicity ("all or nothing")
Both steps happen, or **neither** does.
```
✅ Good:  Alice -$100  AND  Bob +$100   (both done)
❌ Prevented:  Alice -$100  ...crash...  (Bob never gets it)
```
Crash after step 1? Atomicity **rolls back** step 1 — Alice gets her $100 back. Money never vanishes.
> *"Do everything, or undo everything. Never leave it half-done."*

## C — Consistency ("follow the rules")
DB always moves from one **valid state** to another; all rules/constraints hold.
```
Rule: total money must stay the same.
Before:  Alice $500 + Bob $200 = $700
After:   Alice $400 + Bob $300 = $700   ✅ (still $700 — valid)
```
A transaction breaking a rule (e.g. negative balance when not allowed) is **rejected**.
> *"The data always stays valid according to the rules."*

## I — Isolation ("no interfering")
Two transactions at the same time don't corrupt each other — each behaves as if alone.
```
Alice → Bob $100  AND  Alice → Carol $100  at the SAME time.
Isolation ensures both are handled cleanly — Alice isn't over-debited
or her balance read mid-update (prevents race conditions).
```
> *"Simultaneous transactions don't step on each other."*

## D — Durability ("once done, stays done")
Once **committed**, it's **permanent** — survives crashes (written to disk, not just memory).
```
Transfer committed ✅ ──▶ power outage 💥 ──▶ restart ──▶ transfer STILL there
```
> *"Once confirmed, it survives crashes."*

## All four at a glance
| Letter | Name | One-line meaning | In the transfer |
|---|---|---|---|
| **A** | Atomicity | All-or-nothing | Both accounts update, or neither |
| **C** | Consistency | Data stays valid | Total money unchanged; no negative balance |
| **I** | Isolation | No interference | Concurrent transfers don't corrupt each other |
| **D** | Durability | Survives crashes | Committed transfer is permanent |

> **Why it matters:** exactly why banking/payments use SQL — you can't have an atomic-unsafe money transfer. NoSQL traditionally traded these away (BASE) for scale/speed → the ACID vs BASE split from Part 4.

---

<a name="pg-mysql"></a>
# 8. PostgreSQL vs MySQL

Both excellent open-source relational databases.

| | **PostgreSQL** | **MySQL** |
|---|---|---|
| Reputation | "Advanced, feature-rich" | "Simple, fast, popular" |
| Strengths | Complex queries, analytics, data integrity, extensibility (JSON, custom types, advanced indexing) | Fast simple reads, ease of use, huge ecosystem (LAMP stack) |
| Concurrency | Very strong (MVCC) | Good |
| Best for | Complex/analytical workloads, strict correctness, geospatial, JSON+relational mix | Read-heavy web apps, simpler CRUD, simplicity |

> **Interview-safe take:** *"Both are solid. PostgreSQL for complex queries, data integrity, and advanced features; MySQL for simpler, read-heavy web apps. For most apps either works — the SQL-vs-NoSQL choice matters far more than PostgreSQL-vs-MySQL."*

---

<a name="mongo-redis"></a>
# 9. MongoDB vs Redis (both NoSQL — very different types)

| | **MongoDB** (document) | **Redis** (key-value, in-memory) |
|---|---|---|
| Stores | JSON-like documents | Key → value (strings, hashes, lists, sets, sorted sets) |
| Location | On disk (persistent primary DB) | **In-memory** (RAM) — optionally persisted |
| Speed | Fast | **Blazing fast** (microseconds) |
| Role | A **primary database** for flexible data | Usually a **cache / helper**, not the main DB |
| CAP (Part 4) | CP-leaning | AP-leaning |
| Typical uses | Catalogs, user profiles, content, evolving schemas | Caching, sessions, leaderboards, rate limiting, queues, pub/sub |

> **Mental model:** **MongoDB is a general-purpose database you build an app on. Redis is a super-fast specialized store you put *alongside* your main DB** (cache from Part 5, session store from Part 2). They often coexist.

---

<a name="usecases"></a>
# 10. Use cases — when to use what

## Use SQL (PostgreSQL/MySQL) when:
- Data is **highly structured** and relationships matter (users ↔ orders ↔ products).
- You need **ACID transactions** — **banking, payments, e-commerce orders, inventory**.
- You need **complex queries / reporting / analytics** (JOINs, aggregations).
- **Correctness > raw scale.**

## Use MongoDB when:
- **Flexible / evolving schema** — startups iterating fast, varied data shapes.
- **Hierarchical / nested data** read as a unit (catalogs, profiles, CMS content).
- You need to **scale horizontally** with large data volumes.
- Multi-record transaction correctness isn't the top priority.

## Use Redis when:
- **Caching** (Part 5) — the #1 use.
- **Session storage** (Part 2).
- **Real-time** — leaderboards (sorted sets), live counters, pub/sub.
- **Rate limiting**, **queues**, anything needing microsecond speed.
- ⚠️ Not your primary source of truth for critical data (memory-first; can lose data — Part 4).

## The common real-world combo — polyglot persistence
```
SQL (Postgres)  → orders, payments, users (needs ACID)
MongoDB         → product catalog, content (flexible, scale)
Redis           → cache + sessions + leaderboards (speed)
```
> Use the right database for each job, not one for everything.

---

<a name="master"></a>
# 11. Master comparison table

| Dimension | **SQL** (Postgres/MySQL) | **NoSQL** (MongoDB/Redis) |
|---|---|---|
| **Data model** | Tables (rows/columns) | Documents / key-value / etc. |
| **Schema** | Rigid, predefined | Flexible, dynamic |
| **Relationships** | Foreign keys + JOINs | Nested/denormalized, no JOINs |
| **Scaling** | Vertical + replicas (sharding hard) | Horizontal by design |
| **Transactions** | Strong ACID | BASE / eventual (MongoDB now has ACID) |
| **Consistency (CAP)** | CP-leaning | Often AP-leaning |
| **Query power** | Very powerful (SQL, JOINs) | Simpler queries, per-type |
| **Best for** | Structured, transactional, relational | Flexible, high-scale, self-contained |

---

<a name="interview"></a>
# 12. Interview questions & answers

### Q: "SQL vs NoSQL — how do you choose?"
> *"It comes down to the data and the guarantees I need. I choose SQL when data is structured and relational and I need ACID transactions — like payments or orders — where correctness is critical. I choose NoSQL when I need a flexible schema, self-contained data, and easy horizontal scaling — like a product catalog or user profiles at large scale. SQL prioritizes structure and consistency; NoSQL prioritizes flexibility and scale. In practice, many systems use both."*

### Q: "Why is it harder to scale SQL horizontally?"
> *"Because of relationships and transactions. SQL data is normalized across tables and queried with JOINs, so if you shard it, related rows can end up on different shards and JOINs become expensive cross-shard operations. Keeping ACID consistent across shards is also very hard. NoSQL avoids this by keeping related data together in one document, so it shards naturally."*

### Q: "What does ACID mean, and why does it matter?"
> *"ACID is Atomicity, Consistency, Isolation, Durability. Atomicity means all operations in a transaction succeed or none do. Consistency means the database stays valid. Isolation means concurrent transactions don't interfere. Durability means committed data survives crashes. It matters most for financial data — a bank transfer must move money out of one account and into another as one atomic unit, never half-way."*

### Q: "MongoDB vs Redis — aren't they both NoSQL?"
> *"Both are NoSQL but very different types. MongoDB is a document database — a general-purpose, disk-based primary database for flexible JSON-like data. Redis is an in-memory key-value store that's extremely fast, usually used as a cache, session store, or for real-time features like leaderboards — alongside a main database, not usually as the source of truth. MongoDB is what you build an app on; Redis is the speed layer next to it."*

### Q: "When would you NOT use NoSQL?"
> *"When I need strong multi-record transactions and complex relational queries — like a banking or accounting system. The data is highly relational and correctness is non-negotiable, which is exactly what SQL's ACID guarantees and JOINs are built for. Using NoSQL there would mean reinventing those guarantees in the application."*

### Q: "PostgreSQL or MySQL?"
> *"Both are strong relational databases. I'd lean PostgreSQL for complex queries, strict data integrity, and advanced features like rich JSON support and advanced indexing; MySQL for simpler, read-heavy web apps where simplicity and speed matter. For most applications either is fine — the bigger decision is SQL versus NoSQL."*

---

<a name="cheatsheet"></a>
# 13. Cheat Sheet — everything on one page

### Two families
- **SQL (relational):** tables, fixed schema, JOINs, ACID. PostgreSQL, MySQL.
- **NoSQL (non-relational):** flexible formats, horizontal scale. MongoDB (document), Redis (key-value).

### The four decision dimensions
| Dimension | SQL | NoSQL |
|---|---|---|
| Schema | Rigid (migrations) | Flexible (dynamic) |
| Relationships | JOINs (normalized) | Nested (denormalized) |
| Scaling | Vertical + replicas (shard hard) | Horizontal by design |
| Transactions | Strong ACID | BASE / eventual |

### ACID (bank transfer: Alice → Bob $100)
- **A**tomicity — both steps or neither (all-or-nothing).
- **C**onsistency — data stays valid (total money unchanged, no illegal state).
- **I**solation — concurrent transactions don't corrupt each other.
- **D**urability — once committed, survives crashes.
→ Why banking uses SQL. NoSQL traded these for scale (BASE).

### BASE (NoSQL)
Basically Available, Soft state, Eventual consistency → AP side of CAP.

### PostgreSQL vs MySQL
- **Postgres:** complex queries, integrity, advanced features.
- **MySQL:** simple, fast, read-heavy web apps.
- (SQL-vs-NoSQL matters more than which SQL.)

### MongoDB vs Redis
- **MongoDB:** document DB, disk, primary DB, flexible data, CP-leaning.
- **Redis:** in-memory key-value, blazing fast, cache/sessions/real-time, alongside main DB, AP-leaning.

### Use cases
- **SQL:** payments, orders, inventory, anything transactional/relational.
- **MongoDB:** catalogs, profiles, CMS, evolving schemas, big scale.
- **Redis:** caching, sessions, leaderboards, rate limiting, queues.
- **Polyglot persistence:** use several together (right tool per job).

### Golden rules
- SQL = structure + correctness (CP). NoSQL = flexibility + scale (AP).
- Sharding is hard in SQL (JOINs + ACID across machines), natural in NoSQL.
- Redis is a speed layer, not usually a source of truth.
- All four dimensions trace back to one theme: **structure/correctness vs flexibility/scale.**

### Connects to
- Part 2: sharding & replication. · Part 4: CAP (CP/AP), ACID vs BASE. · Part 5: Redis as cache.

### Suggested next topics
- **Indexing** (how databases find data fast — natural follow-on).
- **Message queues** (async, decoupling, spikes).
- **API design** (REST vs GraphQL, rate limiting).
- **Capacity estimation** (users → RPS → storage).

*— End of Part 8 —*
