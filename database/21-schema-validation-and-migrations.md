# Database Study Notes — Part 21

## Schema Validation & Zero-Downtime Migrations

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.
>
> **Why this part exists:** at 4 years you're expected to have shipped schema changes to a live database without taking it down. The questions are "add a NOT NULL column to a 500M-row table," "rename a column with no downtime," and "how do you enforce a schema in MongoDB." This part covers the mechanics (locks, online DDL) and the process (expand/contract, backfills).

---

## Table of Contents

1. [Schema validation in MongoDB](#mongo-validation)
2. [Migrations as code](#as-code)
3. [Why DDL is dangerous on a live database](#ddl-locks)
4. [The expand / contract pattern](#expand-contract)
5. [Recipes: common changes done safely](#recipes)
6. [Backfilling large tables](#backfill)
7. [MongoDB migrations](#mongo-migrations)
8. [Interview Questions & Answers](#interview)
9. [Cheat Sheet](#cheatsheet)

---

<a name="mongo-validation"></a>
## 1. Schema validation in MongoDB

MongoDB is schema-flexible, not schema-less — you can make the **database** enforce rules with `$jsonSchema`:

```js
db.createCollection("users", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["email", "createdAt"],
      properties: {
        email:     { bsonType: "string", pattern: "^.+@.+$" },
        age:       { bsonType: "int", minimum: 0 },
        status:    { enum: ["active", "suspended", "deleted"] },
        createdAt: { bsonType: "date" }
      }
    }
  },
  validationLevel: "strict",     // or "moderate": only validate inserts + docs that are already valid
  validationAction: "error"      // or "warn": allow, but log
});
// existing collection: db.runCommand({ collMod: "users", validator: {...} })
```

- `validationLevel: "moderate"` + `validationAction: "warn"` lets you roll validation onto a collection with old, messy documents without breaking writes — watch the logs, fix data, then tighten to `strict` / `error`.

**Mongoose validation is not database validation:**
- It only runs in your Node app. Another service, a script, or the mongo shell bypasses it completely.
- **`updateOne` / `findOneAndUpdate` don't run schema validators by default** — you need `{ runValidators: true }` (or set it globally). Only `save()` / `create()` validate by default.
- `unique: true` in a Mongoose schema **is not a validator** — it just creates a unique index (and only if `autoIndex` is on).

Use both: Mongoose for friendly errors and casting, `$jsonSchema` (and unique indexes) for guarantees that hold no matter which client writes.

---

<a name="as-code"></a>
## 2. Migrations as code

Every schema change lives in a versioned migration file committed with the code — never run by hand in production.

- Tools: Flyway, Liquibase, Knex, Prisma Migrate, TypeORM, Sequelize; for MongoDB, `migrate-mongo`.
- The tool records which migrations ran in a table (e.g. `schema_migrations`), so every environment converges to the same schema.
- Migrations run in CI/CD before or during deploy — **not** on every app boot from every instance at once (they'd race).
- **Down-migrations are rarely used in production** — once data has been written in the new shape, rolling back usually loses it. The practical strategy is *forward fix*: make every change backward compatible (§4) so the previous code version still works if you roll back the deploy.

---

<a name="ddl-locks"></a>
## 3. Why DDL is dangerous on a live database

**Postgres:** most `ALTER TABLE` forms take an `ACCESS EXCLUSIVE` lock — it blocks **all** reads and writes on the table. Even a statement that's metadata-only and takes milliseconds can cause an outage:

```
1. A long report query is reading `orders` (holds a weak lock for 2 minutes).
2. Migration runs ALTER TABLE orders ... → waits for that query to finish.
3. Every new SELECT/INSERT on `orders` queues BEHIND the waiting ALTER.
4. For 2 minutes, nothing can touch `orders` → connection pool fills → site down.
```

The fix is to make the migration **give up quickly** and retry:
```sql
SET lock_timeout = '3s';         -- fail fast instead of blocking everyone behind us
SET statement_timeout = '15min';
ALTER TABLE orders ADD COLUMN note text;
```

**MySQL (InnoDB):** many changes are **online** (`ALGORITHM=INSTANT` or `INPLACE, LOCK=NONE`) since 5.6/8.0 — e.g. adding a column is `INSTANT` in 8.0+. But they still need a brief metadata lock, so the same "queue behind a long transaction" problem applies, and some changes (changing a column type) still copy the whole table. For big tables, teams use **gh-ost** or **pt-online-schema-change**, which build a shadow copy, sync changes, and swap tables atomically.

**Large changes also generate huge WAL/binlog**, which causes **replication lag** on replicas ([Part 13](13-replication.md)) — another reason to batch.

---

<a name="expand-contract"></a>
## 4. The expand / contract pattern

During a rolling deploy, **old and new versions of the app run at the same time** against the same database. So no single deploy may make a change the other version can't handle. Every breaking change is split into backward-compatible steps:

**Example — rename `users.fullname` → `users.display_name`:**

| Step | Database | App |
|---|---|---|
| 1. **Expand** | add `display_name` (nullable) | — |
| 2. Dual write | — | write to **both** columns, still read `fullname` |
| 3. Backfill | copy `fullname` → `display_name` in batches (§6) | — |
| 4. Switch reads | — | read `display_name` (still writing both) |
| 5. Stop old writes | — | write only `display_name` |
| 6. **Contract** | drop `fullname` (after a safe period) | — |

Each step is its own deploy and can be rolled back on its own. It's slower than one `RENAME COLUMN`, and that's the price of zero downtime. The same pattern applies to splitting a table, changing a type, or moving a field between collections.

---

<a name="recipes"></a>
## 5. Recipes: common changes done safely

### Add a NOT NULL column to a huge table (Postgres)

```sql
-- PG 11+: adding a column with a constant DEFAULT is metadata-only (no table rewrite)
ALTER TABLE orders ADD COLUMN currency text NOT NULL DEFAULT 'INR';
```

If the value must be **computed per row** (so no constant default fits):
```sql
ALTER TABLE orders ADD COLUMN region text;                       -- 1. nullable, instant
-- 2. deploy app code that writes `region` on every insert/update
-- 3. backfill old rows in batches (§6)
ALTER TABLE orders ADD CONSTRAINT region_not_null
  CHECK (region IS NOT NULL) NOT VALID;                          -- 4. instant: applies to new writes only
ALTER TABLE orders VALIDATE CONSTRAINT region_not_null;          -- 5. scans, but only a weak lock — reads/writes continue
ALTER TABLE orders ALTER COLUMN region SET NOT NULL;             -- 6. PG 12+: uses the valid CHECK, skips the full scan
ALTER TABLE orders DROP CONSTRAINT region_not_null;              -- 7. optional cleanup
```
A direct `SET NOT NULL` would scan all 500M rows under an `ACCESS EXCLUSIVE` lock.

### Add an index without blocking writes
```sql
CREATE INDEX CONCURRENTLY idx_orders_customer ON orders (customer_id);   -- Postgres
```
- Doesn't block writes; takes longer (two table scans).
- Can't run inside a transaction block (many migration tools wrap each migration in one — disable that for this migration).
- If it fails, it leaves an **`INVALID`** index behind that still slows writes — check `\d orders`, drop it and retry.
- MySQL: `ALTER TABLE orders ADD INDEX ..., ALGORITHM=INPLACE, LOCK=NONE`.

### Add a foreign key
```sql
ALTER TABLE orders ADD CONSTRAINT fk_customer FOREIGN KEY (customer_id) REFERENCES customers(id) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT fk_customer;   -- checks existing rows without blocking writes
```

### Change a column's type
Usually rewrites the table. Use expand/contract: new column of the new type → dual write → backfill → switch → drop old. (Exception: some widenings are cheap, e.g. `varchar(50)` → `varchar(100)` or → `text` in Postgres.)

### Drop a column
Deploy code that no longer reads or writes it **first** (and that ORMs don't `SELECT *` it into models), then drop it. Dropping first breaks the old app version still running.

---

<a name="backfill"></a>
## 6. Backfilling large tables

Never `UPDATE orders SET region = ...` across 500M rows in one statement: it holds row locks for a very long time, generates a giant WAL burst (replication lag), bloats the table (Postgres keeps old row versions, [Part 22](22-storage-internals.md)), and if it fails at 90% everything rolls back.

Do it in **batches by primary key**, each its own short transaction:

```sql
UPDATE orders SET region = compute_region(address)
WHERE id > :last_id AND id <= :last_id + 10000 AND region IS NULL;
```

```js
for (let lastId = 0; lastId < maxId; lastId += 10_000) {
  await db.query(UPDATE_SQL, [lastId]);
  await sleep(50);   // throttle; watch replication lag and pause if it grows
}
```

- Idempotent (`AND region IS NULL`) so it can be stopped and resumed safely.
- Throttled, and monitored for replication lag and load.
- Run as a background job, not inside the deploy.

---

<a name="mongo-migrations"></a>
## 7. MongoDB migrations

No DDL, so no table locks — but the same problems exist in a different form:

- **Adding a field:** nothing to do in the database; code must handle documents without it (`doc.region ?? default`).
- **Changing a shape:** the **schema versioning** pattern ([Part 09.5 §5](09.5-normalization-and-mongodb-schema-patterns.md)) — `schemaVersion` on each document, code reads both versions, and documents are upgraded **lazily on write** or by a batched background job (`updateMany` in chunks of `_id` ranges, or `bulkWrite`).
- **Renaming a field:** expand/contract with `$rename` in batches, or dual-read (`doc.displayName ?? doc.fullname`).
- **Adding an index:** built online (see [Part 06.5 §7](06.5-mongodb-indexing-deep-dive.md)), but a **unique** index fails if duplicates exist — clean them first.
- **Tightening validation:** `validationLevel: "moderate"`, `validationAction: "warn"` first (§1).

---

<a name="interview"></a>
## 8. Interview Questions & Answers

**Q: How do you add a NOT NULL column to a 500M-row Postgres table without downtime?**
A: If a constant default works, `ADD COLUMN ... NOT NULL DEFAULT x` is metadata-only on PG 11+. Otherwise: add it nullable, ship code that writes it, backfill in small batches, add `CHECK (col IS NOT NULL) NOT VALID`, `VALIDATE CONSTRAINT` (no blocking lock), then `SET NOT NULL`, which PG 12+ does without a full scan. Run every step with a short `lock_timeout`.

**Q: How do you rename a column with zero downtime?**
A: Expand/contract: add the new column, dual-write both, backfill, switch reads, stop writing the old one, drop it later. Each step is a separate backward-compatible deploy, because old and new app versions run side by side during a rolling deploy.

**Q: Why can a quick `ALTER TABLE` take the site down?**
A: In Postgres it needs an `ACCESS EXCLUSIVE` lock. If a long query is running, the ALTER waits — and every new query on that table queues behind the waiting ALTER. Set `lock_timeout` so the migration fails fast and retries instead.

**Q: How do you add an index to a big table in production?**
A: Postgres `CREATE INDEX CONCURRENTLY` (outside a transaction; drop the INVALID leftover if it fails), MySQL online DDL with `ALGORITHM=INPLACE, LOCK=NONE`, MongoDB's online build or a rolling build.

**Q: How do you backfill a huge table?**
A: Batches by primary-key range, each a short transaction, idempotent so it can resume, throttled, watching replication lag — never one giant UPDATE.

**Q: How do you enforce a schema in MongoDB? Isn't Mongoose enough?**
A: `$jsonSchema` validators on the collection, plus unique indexes. Mongoose validation runs only in that app, can be bypassed by other clients, and doesn't run on `updateOne`/`findOneAndUpdate` unless `runValidators: true`.

**Q: Do you write down-migrations?**
A: I keep them for local development, but in production I rely on forward fixes: every migration is backward compatible with the previous app version, so rolling back the code doesn't require rolling back the schema.

---

<a name="cheatsheet"></a>
## 9. Cheat Sheet

- Mongo: `$jsonSchema` validator; `moderate` + `warn` to roll out on messy data. Mongoose validators skip updates unless `runValidators: true`; `unique` is an index, not a validator.
- Migrations: versioned files, run by CI/CD, forward-fix over down-migrations.
- PG `ALTER TABLE` = `ACCESS EXCLUSIVE`; waiting ALTER blocks everyone → **`lock_timeout`**.
- **Expand/contract:** add → dual write → backfill → switch reads → stop old writes → drop. Old + new app versions coexist.
- NOT NULL on a huge table: constant default (PG 11+) or nullable → backfill → `CHECK NOT VALID` → `VALIDATE` → `SET NOT NULL`.
- Index: `CREATE INDEX CONCURRENTLY` (no transaction, clean up INVALID). MySQL `INPLACE, LOCK=NONE`; gh-ost / pt-osc for big tables.
- FK: `NOT VALID` then `VALIDATE`.
- Backfill: PK-range batches, idempotent, throttled, watch replication lag.
- Drop column: stop using it in code first.
