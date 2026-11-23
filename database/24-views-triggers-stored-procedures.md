# Database Study Notes — Part 24

## Views, Materialized Views, Triggers & Stored Procedures

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.
>
> **Why this part exists:** these come up as "what's the difference between a view and a materialized view," "would you use triggers," and "business logic in stored procedures or in the app?" The expected answer at 4 years is less about syntax and more about the trade-offs — and the MongoDB equivalents.

---

## Table of Contents

1. [Views](#views)
2. [Materialized views](#mviews)
3. [Triggers](#triggers)
4. [Stored procedures & functions](#procs)
5. [MongoDB equivalents](#mongo)
6. [Interview Questions & Answers](#interview)
7. [Cheat Sheet](#cheatsheet)

---

<a name="views"></a>
## 1. Views

A **view** is a saved query you can select from like a table. It stores **no data** — every time you query it, the database runs the underlying query (the optimizer merges it into your query).

```sql
CREATE VIEW active_customers AS
SELECT id, name, email FROM customers WHERE deleted_at IS NULL;

SELECT * FROM active_customers WHERE email LIKE '%@acme.com';
```

Uses:
- **Hide complexity** — name a 5-table join once; reuse it everywhere.
- **Security** — grant a reporting user access to a view exposing some columns, not the base table (no `salary`, no `password_hash`).
- **Stable interface** during refactors — rename/split the underlying tables, keep the view's shape.
- **Soft-delete filtering** — `active_customers` so nobody forgets `WHERE deleted_at IS NULL` ([Part 17 §4](17-advanced-indexing-and-partitioning.md)).

Not a performance tool: a view is exactly as fast as its query. Simple views over one table are **updatable** (you can `INSERT`/`UPDATE` through them); views with joins, `GROUP BY` or `DISTINCT` generally aren't.

---

<a name="mviews"></a>
## 2. Materialized views

A **materialized view** stores the query's **result** physically, like a cached table. Reads are fast; the data is only as fresh as the last refresh.

```sql
CREATE MATERIALIZED VIEW daily_revenue AS
SELECT date_trunc('day', created_at) AS day, store_id, SUM(total) AS revenue
FROM orders GROUP BY 1, 2;

CREATE UNIQUE INDEX ON daily_revenue (day, store_id);          -- required for CONCURRENTLY

REFRESH MATERIALIZED VIEW CONCURRENTLY daily_revenue;          -- readers aren't blocked during refresh
```

| | View | Materialized view |
|---|---|---|
| Stores data | no | yes |
| Freshness | always current | as of last refresh |
| Read speed | as slow as the query | fast — can be indexed |
| Write cost | none | refresh cost (Postgres recomputes the whole thing) |

- Postgres refresh is **full recomputation** — fine for a summary that takes 30s to build nightly, wrong for something that must be fresh within seconds.
- `REFRESH ... CONCURRENTLY` needs a unique index and doesn't block reads; without it, the refresh locks out readers.
- **MySQL has no materialized views** — teams build a summary table and refresh it with a scheduled job, or maintain it incrementally (counters on write, [Part 09.5 §5](09.5-normalization-and-mongodb-schema-patterns.md)).
- Alternatives when you need fresher data: incremental summary tables updated by the app or by events; a cache ([Part 11](11-redis-basics-and-caching.md)).

---

<a name="triggers"></a>
## 3. Triggers

A **trigger** runs a function automatically on `INSERT`, `UPDATE` or `DELETE` — `BEFORE` (can modify or reject the row) or `AFTER` (sees the final row); per row or per statement.

```sql
-- keep updated_at correct no matter which client writes
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_updated_at
BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Good uses** — small, mechanical, must-always-happen rules:
- `updated_at` timestamps
- **audit logs** (write old/new row to an `audit_log` table) — guaranteed even for writes from scripts or other services
- enforcing invariants a constraint can't express
- maintaining a denormalized counter in the same transaction

**Why teams avoid them for business logic:**
- **Invisible** — someone reading the app code has no idea an `UPDATE` also writes three other tables.
- **Performance** — row-level triggers run once per row; a bulk update of 1M rows runs the function 1M times inside the transaction, holding locks longer.
- **Cascades** — triggers firing triggers, hard to reason about and debug.
- **Harder to test, version and deploy** than application code; they also run during migrations and backfills ([Part 21](21-schema-validation-and-migrations.md)), sometimes unexpectedly.
- **Side effects outside the DB** (send an email, call an API) don't belong in a trigger — the transaction might roll back after the email was sent. Use the **outbox pattern** instead ([System-design Part 13.5](../System-design/13.5-message-brokers-deep-dive.md)).

---

<a name="procs"></a>
## 4. Stored procedures & functions

Code (PL/pgSQL, T-SQL, MySQL's procedural SQL) stored and executed **inside** the database, called with `CALL transfer(1, 2, 100)` or `SELECT fn(...)`.

| For | Against |
|---|---|
| fewer network round-trips — many statements run next to the data in one call | logic split between two places and two languages |
| a set operation over millions of rows without shipping them to the app | harder to unit test, debug, code review, and deploy alongside the app |
| one enforced path for critical operations; can grant `EXECUTE` but not direct table access | **scales the hardest-to-scale tier** — CPU spent in the database can't be fixed by adding app servers |
| | vendor lock-in — PL/pgSQL doesn't port to MySQL |

**The modern, mainstream stance:** business logic in the application; the database enforces **integrity** (constraints, foreign keys, unique indexes) and does **set-based data work**. Stored procedures are reasonable for data-heavy batch operations, legacy systems, and teams that deliberately put logic in the database — say *why* either way, rather than "procedures are bad."

---

<a name="mongo"></a>
## 5. MongoDB equivalents

| SQL feature | MongoDB |
|---|---|
| View | **read-only views** defined by an aggregation pipeline — `db.createView("activeUsers", "users", [{ $match: { deletedAt: null } }, { $project: { password: 0 } }])`; computed on read, like a SQL view |
| Materialized view | **on-demand materialized views**: an aggregation ending in `$merge` into a collection, run on a schedule ([Part 08.5 §8](08.5-aggregation-advanced.md)) |
| Trigger | **change streams** (your service subscribes to inserts/updates/deletes and reacts) or **Atlas Triggers** (managed functions on change events). Both run **after commit and outside the transaction** — closer to an event than to a SQL `BEFORE` trigger. Mongoose **middleware** (`pre('save')`) is app-side only and doesn't fire for `updateMany` or other clients |
| Stored procedure | none in practice — server-side JavaScript (`$where`, `mapReduce`, stored JS) is deprecated. Use aggregation pipelines and pipeline updates for in-database work, logic in the app |

---

<a name="interview"></a>
## 6. Interview Questions & Answers

**Q: View vs materialized view?**
A: A view stores only the query and runs it on every read — always fresh, no faster than the query. A materialized view stores the result — fast, indexable reads, but stale until refreshed, and in Postgres a refresh recomputes everything. Use a view for abstraction or security, a materialized view for expensive aggregates where some staleness is fine.

**Q: Does a view make a query faster?**
A: No — it's the same query with a name. It can help security and readability. For speed you need indexes, a materialized view, or a summary table.

**Q: Would you use triggers?**
A: For small mechanical rules that must hold regardless of which client writes — `updated_at`, audit logs, a counter maintained in the same transaction. Not for business logic: it's invisible from the app code, runs per row on bulk updates, cascades, and is harder to test. And never for external side effects like emails — use an outbox.

**Q: Business logic in stored procedures or the application?**
A: Usually the application — one language, testable, versioned with the code, and it scales horizontally, whereas the database is the hardest tier to scale. The database should enforce integrity with constraints. Procedures make sense for set-based, data-heavy operations where moving the data to the app would be wasteful.

**Q: What does MongoDB have instead of triggers and materialized views?**
A: Change streams or Atlas Triggers react to committed changes, asynchronously and outside the transaction. Materialized views are built with an aggregation ending in `$merge` run on a schedule; regular read-only views are defined by an aggregation pipeline.

---

<a name="cheatsheet"></a>
## 7. Cheat Sheet

- View = named query, no data, always fresh, not faster. Uses: abstraction, column-level security, stable interface, soft-delete filter.
- Materialized view = stored result, indexable, stale until `REFRESH` (PG: full recompute; `CONCURRENTLY` needs a unique index). MySQL: none → summary table + job.
- Triggers: good for `updated_at`, audit logs, same-transaction counters; bad for business logic (hidden, per-row cost, cascades) and **never** for external side effects (→ outbox).
- Stored procs: fewer round trips, set-based work; but split logic, hard to test, scale the hardest tier, lock-in. Default: logic in app, integrity in DB.
- Mongo: views = aggregation pipeline; materialized = `$merge` on a schedule; triggers = change streams / Atlas Triggers (async, post-commit); no stored procs (server JS deprecated).
