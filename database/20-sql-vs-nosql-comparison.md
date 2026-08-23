# Database Study Notes — Part 20

## SQL vs NoSQL — Point-by-Point Comparison

> **Format:** the consolidated comparison — every axis interviewers actually probe, side by side. Individual parts throughout this track cross-link back here wherever the comparison came up in context; this is the one place it's assembled whole.

---

## Table of Contents

1. [The comparison table](#table)
2. [Data model](#data-model)
3. [Schema enforcement](#schema)
4. [Relationships & joins](#relationships)
5. [Transactions & consistency](#transactions)
6. [Scaling](#scaling)
7. [Query language & flexibility](#query)
8. [When each genuinely wins](#when)
9. [Interview Questions & Answers](#interview)
10. [Cheat Sheet](#cheatsheet)

---

<a name="table"></a>
## 1. The comparison table

| Axis | SQL (Relational) | NoSQL (MongoDB, document-model) |
|---|---|---|
| Data model | rows in tables, normalized across tables | documents (BSON) in collections, can nest freely |
| Schema | fixed, enforced by the database | flexible — no enforced schema unless the app/ODM adds one |
| Relationships | foreign keys, enforced referentially | references by `_id`, **not** enforced by the database ([Part 04.5](04.5-foreign-keys-and-cascading.md)) |
| Joins | native, first-class, optimizer-tuned ([Part 01](01-joins.md)) | `$lookup` inside aggregation, or app-level `populate()` — neither as first-class ([Part 07](07-populate-and-n-plus-1.md), [Part 08](08-aggregation-pipeline.md)) |
| Transactions | ACID by default on every statement/transaction ([Part 04](04-transactions-and-acid.md)) | multi-document ACID transactions exist but are a heavier, secondary tool ([Part 15](15-mongodb-transactions-and-concurrency.md)) |
| Scaling | traditionally vertical-first; horizontal (sharding) is possible but historically less native | horizontal scaling (sharding) built into the platform from early on ([Part 14](14-sharding.md)) |
| Indexing | B-Tree indexes, composite, covering, partial ([Part 02](02-sql-indexes.md), [Part 17](17-advanced-indexing-and-partitioning.md)) | same underlying B-Tree concept, same left-most-prefix rule, plus TTL/text indexes with no direct SQL equivalent ([Part 06](06-mongodb-indexes.md)) |
| Query language | SQL — declarative, standardized across vendors | driver-specific query API / aggregation pipeline — imperative-feeling, not standardized across NoSQL databases |
| Document size limit | no equivalent concept | hard 16MB per document — a real constraint on embedding ([Part 09](09-embedding-vs-referencing.md)) |

---

<a name="data-model"></a>
## 2. Data model

**SQL:** data is normalized — split across multiple tables to avoid duplication, related by foreign keys, reassembled at query time via joins. A `User` and their `Orders` live in separate tables by design.

**NoSQL (document):** data can be **denormalized on purpose** — a document can nest related data directly inside it (Part 09's embedding). A `User` document *can* contain its `Address` directly, no separate table or join needed to read it back as one object.

**The underlying trade-off:** normalization (SQL) avoids duplication and keeps a single source of truth per fact, at the cost of needing joins to reassemble related data. Denormalization (embedding) avoids joins for data that's read together, at the cost of potential duplication and the discipline of deciding, per relationship, whether embedding is actually safe (Part 09's three factors).

---

<a name="schema"></a>
## 3. Schema enforcement

**SQL:** the schema is defined upfront and **enforced by the database itself** — inserting a row missing a required column, or with the wrong type, is rejected at write time.

**NoSQL:** no such enforcement exists at the database level by default — two documents in the same collection can have entirely different shapes (Part 05 §1). Consistency, if wanted, has to come from the application or an ODM layer (like Mongoose schemas) — it's a **convention enforced in code**, not a guarantee enforced by the database.

**Honest trade-off:** SQL's enforcement catches structural bugs early, at the cost of migration friction every time the schema needs to change. NoSQL's flexibility removes that friction, at the cost of the database itself no longer being able to catch a malformed write.

---

<a name="relationships"></a>
## 4. Relationships & joins

Covered in full in [Part 01](01-joins.md) (SQL joins), [Part 04.5](04.5-foreign-keys-and-cascading.md) (foreign keys), and [Part 07](07-populate-and-n-plus-1.md)/[Part 08](08-aggregation-pipeline.md) (Mongo's `populate()`/`$lookup`).

The single most important honest distinction: **SQL enforces referential integrity at the database level (a foreign key constraint); MongoDB does not — a reference to a nonexistent document is not just unusual, it's entirely possible and silent.** This is the real cost of choosing the document model, not just "no joins."

---

<a name="transactions"></a>
## 5. Transactions & consistency

**SQL:** every statement (or explicit transaction) is ACID by default — this is the baseline the whole system is designed around (Part 04).

**MongoDB:** single-document writes are always atomic — and because the data model favors embedding specifically so related updates land in one document (Part 09, Part 15 §1), many "these must update together" cases never need an explicit transaction at all. Multi-document ACID transactions do exist (since v4.0) but are reached for as a fallback, not the default tool — a genuinely different design philosophy, not a missing feature.

---

<a name="scaling"></a>
## 6. Scaling

**SQL:** historically scaled **vertically first** (bigger server) — horizontal scaling (sharding) is possible in most modern relational databases but tends to be a bolt-on, operationally heavier addition rather than a foundational design assumption.

**MongoDB:** built with **horizontal scaling (sharding, Part 14) as a first-class, native capability** from early in the product's design — reflecting the class of problems document databases are frequently reached for (large, growing, high-write-volume datasets).

This is a real, meaningful difference in default posture — but it's not an absolute rule; plenty of relational deployments shard successfully (e.g. Vitess for MySQL, Citus for Postgres), and plenty of document databases run comfortably unsharded for years. It's a difference in what's native and easy versus what's possible with more operational effort.

---

<a name="query"></a>
## 7. Query language & flexibility

**SQL:** one standardized, declarative language (with vendor-specific dialects) — you say *what* you want, the optimizer decides *how*. Portable knowledge across Postgres/MySQL/SQL Server with mostly syntax-level differences.

**MongoDB (and NoSQL generally):** each database has its **own query API** — MongoDB's query documents and aggregation pipeline aren't SQL and aren't shared with, say, DynamoDB's or Cassandra's query models. Knowledge transfers conceptually (filtering, projecting, aggregating) but not syntactically across NoSQL databases the way SQL does across relational ones.

---

<a name="when"></a>
## 8. When each genuinely wins

**Reach for SQL/relational when:**
- The data is genuinely relational and the relationships matter for correctness (financial ledgers, anything needing real referential integrity enforced by the database itself).
- The schema is stable and well-understood upfront.
- Complex, ad-hoc multi-table queries are a core requirement — SQL's join optimizer is mature and general-purpose in a way `$lookup` isn't designed to be.

**Reach for MongoDB/document when:**
- The data is naturally document-shaped (nested, hierarchical) and usually read/written as one unit.
- The schema is expected to evolve, or genuinely varies across records (different tenants, different facility types — a real pattern in multi-tenant SaaS).
- Horizontal scale for high write volume is a known requirement from the start, not a hypothetical.

A credible interview answer names the actual factors above for the actual system being discussed — not "NoSQL is more scalable" as a blanket claim, which undersells the real, specific trade-offs on both sides.

---

<a name="interview"></a>
## 9. Interview Questions & Answers

**Q: SQL vs NoSQL — how do you actually decide, for a real project?**
A: Not a blanket "NoSQL scales better" claim — name the actual factors: how relational the data genuinely is and whether the database needs to enforce that referential integrity itself; how stable vs evolving the schema is expected to be; whether horizontal write scaling is a known near-term requirement or a hypothetical; and whether complex ad-hoc multi-table queries are core to the access pattern (favors SQL's mature join optimizer) or the access pattern is mostly "read/write one coherent unit of data" (favors a document model).

**Q: What's the single biggest thing you give up moving from SQL to MongoDB?**
A: Referential integrity enforced by the database. A SQL foreign key guarantees a reference points at something real, at write time, automatically. MongoDB has no equivalent — a reference to a document that doesn't exist is entirely possible and silent; that responsibility moves entirely to the application.

**Q: Is "NoSQL scales horizontally better than SQL" always true?**
A: It's a difference in default posture, not an absolute law. MongoDB was built with sharding as a native, foundational capability. Relational databases can scale horizontally too (Vitess, Citus) but it's historically more of a bolt-on with more operational overhead — and plenty of document databases run comfortably unsharded for years. The honest framing is "native and easy" vs "possible with more effort," not "impossible."

---

<a name="cheatsheet"></a>
## 10. Cheat Sheet

- Data model: SQL normalizes across tables; NoSQL can denormalize/embed on purpose.
- Schema: SQL enforces it at the database; NoSQL enforcement (if any) lives in application/ODM code.
- Relationships: SQL foreign keys enforce referential integrity at write time; MongoDB references are pure convention, unenforced ([Part 04.5](04.5-foreign-keys-and-cascading.md)).
- Transactions: SQL is ACID-by-default everywhere; MongoDB is atomic-per-document by default, with multi-document transactions as a heavier fallback.
- Scaling: sharding is native/foundational in MongoDB, historically more bolt-on in relational — a difference in default posture, not an absolute capability gap.
- Query language: SQL is one standardized language across vendors; each NoSQL database has its own API — conceptual knowledge transfers, syntax doesn't.
- Decide per project on real factors (relational-ness, schema stability, scale requirements, query complexity) — never on a blanket "NoSQL is more scalable" claim.
