# Database Study Notes — Part 23

## Primary Keys & ID Generation — Auto-increment, UUIDv4, UUIDv7, ObjectId, Snowflake

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.
>
> **Why this part exists:** "auto-increment or UUID?" is a standard design question, and the good answer depends on storage internals ([Part 22 §3](22-storage-internals.md)), sharding ([Part 14](14-sharding.md)) and security — not taste. The URL shortener problem ([System-design Problem 01](../System-design/Problems/problem-01-url-shortener.md)) uses the same ideas for short-code generation.

---

## Table of Contents

1. [Natural vs surrogate keys](#natural)
2. [Auto-increment](#autoinc)
3. [UUIDv4 — and why random keys hurt](#uuid4)
4. [UUIDv7 / ULID — time-ordered UUIDs](#uuid7)
5. [MongoDB ObjectId](#objectid)
6. [Snowflake-style 64-bit IDs](#snowflake)
7. [Internal vs public IDs](#public)
8. [Comparison & decision guide](#decision)
9. [Interview Questions & Answers](#interview)
10. [Cheat Sheet](#cheatsheet)

---

<a name="natural"></a>
## 1. Natural vs surrogate keys

- **Natural key:** a real-world attribute that's already unique — email, PAN number, ISBN, country code.
- **Surrogate key:** a meaningless generated value (`id`) with no business meaning.

**Default to surrogate primary keys**, and put a **unique constraint** on natural keys. Natural keys change (people change email; "unique" government IDs get reissued or mistyped), and when a PK changes, every foreign key pointing at it must change too ([Part 04.5](04.5-foreign-keys-and-cascading.md)). Natural keys are fine for truly stable, small reference data (`currency_code = 'INR'`) and for junction tables (`PRIMARY KEY (order_id, product_id)`).

---

<a name="autoinc"></a>
## 2. Auto-increment

```sql
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY     -- Postgres (modern form of SERIAL)
id BIGINT AUTO_INCREMENT PRIMARY KEY                   -- MySQL
```

**Pros:** small (8 bytes), human-friendly for debugging, and **sequential** — every insert appends to the right edge of the B+Tree, so pages fill completely and the hot page stays in cache. The fastest option for single-database inserts.

**Cons:**
- **Needs one central counter** — awkward across shards or multiple regions, and IDs can't be generated client-side before insert (useful for offline apps and for creating related rows in one round-trip).
- **Leaks information:** `/orders/10452` tells a competitor your order volume, and lets anyone enumerate `/orders/10451`, `/10450`... (an IDOR bug waiting to happen if authorisation checks are missing).
- **Gaps are normal:** sequences aren't transactional — a rolled-back insert still consumes its number. Never use auto-increment for things that must be gap-free (legal invoice numbers need a separate, locked counter).
- **Use `BIGINT`, not `INT`.** A 32-bit `INT` tops out at ~2.1 billion; tables that hit it stop accepting inserts — a real class of outages, and migrating the type of a PK on a huge table is painful ([Part 21](21-schema-validation-and-migrations.md)).
- **Bad shard key** — monotonic, so all new rows land on one shard ([Part 14 §2](14-sharding.md)).

---

<a name="uuid4"></a>
## 3. UUIDv4 — and why random keys hurt

128-bit, 122 random bits — e.g. `f47ac10b-58cc-4372-a567-0e02b2c3d479`. Can be generated anywhere (app, client, any shard) with no coordination, practically no collision risk, and reveals nothing.

**The cost is in the B+Tree** ([Part 22 §3](22-storage-internals.md)):
- Each insert goes to a **random leaf page**. Once the index is bigger than memory, most inserts must first read a page from disk.
- Pages **split** in the middle and end up ~half empty → the index is larger than it needs to be, and caching gets worse.
- In **InnoDB** it's worse: the table is clustered on the PK, so the table itself fragments, and every secondary index stores the PK value.
- Insert throughput on large tables can drop severalfold compared to sequential keys.

**Storage:** store as a native `uuid` type (Postgres) or `BINARY(16)` (MySQL) — **not** a `CHAR(36)` string, which is more than twice the size and makes every index bigger.

---

<a name="uuid7"></a>
## 4. UUIDv7 / ULID — time-ordered UUIDs

**UUIDv7** (standardised in RFC 9562, 2024): the first **48 bits are a Unix timestamp in milliseconds**, the rest random.

```
0190f3a1-2b4c-7d5e-8f6a-1b2c3d4e5f60
└─ ms timestamp ─┘ └── version + random ──┘
```

- Generated anywhere without coordination, like v4.
- **Roughly sequential** — new IDs sort after old ones, so inserts go to the right edge of the index like auto-increment. Most of v4's write penalty disappears.
- Sortable by creation time — same benefit as ObjectId ([Part 05 §3](05-mongodb-fundamentals.md)).
- Trade-off: it **reveals creation time**, which is usually fine, occasionally not.

Postgres 18 includes a built-in `uuidv7()`; elsewhere use a library (e.g. the `uuid` npm package's `v7()`). **ULID** is an older equivalent (48-bit time + 80 random bits, encoded as 26 Base32 characters) — same idea, different text format.

For a new system that needs globally generated IDs, **UUIDv7 is the modern default** over v4.

---

<a name="objectid"></a>
## 5. MongoDB ObjectId

12 bytes: 4-byte timestamp (seconds) + 5-byte per-process random + 3-byte counter ([Part 05 §3](05-mongodb-fundamentals.md)). Generated by the **driver** on the client, roughly time-ordered — the same properties as UUIDv7 in a smaller package, with second-level resolution.

Being roughly increasing, an ObjectId `_id` is a **bad ranged shard key** (all inserts hit the "last" chunk) — use a hashed shard key on it, or a different shard key ([Part 14](14-sharding.md)).

---

<a name="snowflake"></a>
## 6. Snowflake-style 64-bit IDs

Twitter's Snowflake design (also used, with variations, by Discord, Instagram and others) packs a time-ordered ID into a **64-bit integer** — it fits a `BIGINT`, half the size of a UUID:

```
| 1 bit unused | 41 bits: ms since custom epoch | 10 bits: machine id | 12 bits: sequence |
   ~69 years of timestamps        1,024 generators       4,096 IDs per ms per generator
```

- Time-ordered (good for B+Trees and sorting), compact, generated locally by each node.
- **Each generator needs a unique machine id** — assigned via config, ZooKeeper/etcd, or a database table. Two generators with the same id produce duplicates.
- **Clock going backwards** (NTP correction) can produce duplicates — implementations refuse to generate, or wait, until the clock catches up.
- Instagram's variant generated IDs **inside Postgres** per logical shard (timestamp + shard id + per-shard sequence), so the shard is encoded in the ID itself.

Use when you want time ordering, `BIGINT` size, and very high generation rates across many nodes.

---

<a name="public"></a>
## 7. Internal vs public IDs

A common production pattern: keep a compact sequential `BIGINT` primary key for joins and storage efficiency, and add a separate **public ID** (UUIDv7, or a random short string like `ord_8fK2xQ`) with a unique index for URLs and APIs.

- Internal joins stay small and fast.
- Public URLs don't leak counts and can't be enumerated.
- Prefixed public IDs (`cus_`, `ord_` — popularised by Stripe) make logs and support tickets readable.

An unguessable ID is **not authorisation** — still check that the caller may access the resource.

---

<a name="decision"></a>
## 8. Comparison & decision guide

| | Size | Ordered? | Generated where | Leaks info | Index-friendly inserts |
|---|---|---|---|---|---|
| Auto-increment `BIGINT` | 8B | ✅ | the database (central) | count/volume | ✅ best |
| UUIDv4 | 16B | ❌ random | anywhere | nothing | ❌ worst |
| UUIDv7 / ULID | 16B | ✅ by ms | anywhere | creation time | ✅ |
| ObjectId | 12B | ✅ by second | driver | creation time | ✅ |
| Snowflake | 8B | ✅ by ms | each node (needs machine id) | time + node | ✅ |

- One SQL database, internal IDs → **`BIGINT` identity** (+ a public ID if exposed).
- Distributed / client-generated / merged across systems → **UUIDv7**.
- MongoDB → **ObjectId** (default) unless you have a reason.
- Huge scale, need 64-bit + ordering → **Snowflake-style**.
- Avoid UUIDv4 as a clustered primary key on large, write-heavy tables.

---

<a name="interview"></a>
## 9. Interview Questions & Answers

**Q: Auto-increment or UUID for a primary key?**
A: Auto-increment `BIGINT` is smallest and fastest for inserts because it appends to the index, but it needs a central counter and exposes record counts. UUIDs can be generated anywhere and reveal nothing, but random UUIDv4 fragments the B+Tree. My default today: `BIGINT` internally with a separate public ID for URLs, or UUIDv7 when IDs must be generated in a distributed way — it's time-ordered, so inserts stay sequential.

**Q: Why are UUIDv4 primary keys slow on large tables?**
A: Inserts land on random leaf pages — once the index outgrows memory, most inserts need a disk read, and pages split and stay half empty, so the index is bigger and caches worse. In InnoDB the table itself is clustered on the PK and every secondary index carries it, so the cost multiplies.

**Q: What's UUIDv7?**
A: A UUID whose first 48 bits are a millisecond timestamp and the rest random. Globally unique without coordination like v4, but roughly sequential, so it's index-friendly and sortable by creation time. It does reveal when the record was created.

**Q: How does a Snowflake ID work?**
A: A 64-bit integer: 41 bits of milliseconds since an epoch, 10 bits of machine id, 12 bits of per-millisecond sequence. Time-ordered, fits a BIGINT, generated locally. You must assign unique machine ids and handle clocks moving backwards.

**Q: Why not use email as the primary key?**
A: It changes, and a changing PK must be updated in every referencing table. Use a surrogate key and a unique constraint on email.

**Q: Is it a security problem to expose auto-increment IDs?**
A: It leaks business volume and makes enumeration trivial, which turns any missing authorisation check into a data leak. Use a separate random public ID — but still enforce authorisation; an unguessable ID isn't access control.

---

<a name="cheatsheet"></a>
## 10. Cheat Sheet

- Surrogate PK + unique constraint on natural keys. Natural PKs only for stable reference data / junction tables.
- Auto-increment: smallest, fastest, sequential; central, leaks counts, gaps are normal; **use BIGINT**; bad shard key.
- UUIDv4: random → page splits, cache misses, fragmentation (worst in InnoDB). Store as `uuid` / `BINARY(16)`, not `CHAR(36)`.
- **UUIDv7**: ms timestamp + random → distributed *and* index-friendly. Modern default for distributed IDs.
- ObjectId: 12B, time-prefixed, client-generated; hash it if used as a shard key.
- Snowflake: 64-bit = time 41 + machine 10 + seq 12; needs machine ids, watch clock skew.
- Internal BIGINT + public random/prefixed ID. Unguessable ≠ authorised.
