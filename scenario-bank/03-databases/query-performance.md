# Database Query Performance — Scenario Bank

---

### "How do database indexes work?"

Without an index, finding a row means the database scans every single row in the table checking each one — a **full table scan**. On a small table that's fine; on a million-row table it's brutally slow.

An index is a separate, sorted data structure (usually a B-tree) that maps a column's values to the physical location of the rows that have them — like the index at the back of a textbook: instead of reading every page to find "circuit breaker," you look it up alphabetically and jump straight to the page. A query filtering on `WHERE email = 'x@y.com'` can use an index on `email` to jump almost directly to the matching rows instead of scanning the whole table.

```sql
CREATE INDEX idx_users_email ON users(email);
-- now `WHERE email = 'x@y.com'` is an index lookup, not a full scan
```

The cost: every index has to be updated on every `INSERT`/`UPDATE`/`DELETE` to that column, so indexes speed up reads at the cost of slightly slower writes and extra storage.

**Interview line:** *"An index is a sorted structure — usually a B-tree — that lets the database jump directly to matching rows instead of scanning the whole table. It speeds up reads on the indexed column, but every write to that column now also has to update the index, so it's a genuine read/write trade-off, not a free win."*

**Tests:** index fundamentals, read/write trade-off

*Axis: performance · Source: challenge question*

---

### "When can an index make performance worse?"

Indexes aren't free, and over-indexing is a real, common mistake:

- **Write-heavy tables** — every index on a table has to be updated on every insert/update/delete. A table with 8 indexes pays that cost 8 times per write; on a high-write table this can dominate write latency.
- **Low-cardinality columns** — an index on a boolean or a column with only a few distinct values (`status: active/inactive`) often doesn't help much, because the database still ends up reading a large fraction of the table either way; the query planner may just ignore the index and scan anyway.
- **The planner picks the index when it shouldn't** — for a query that would actually return a large fraction of the table, jumping row-by-row through an index can be slower than just scanning sequentially, because random-access index lookups are more expensive per-row than a sequential scan.

The rule of thumb: index columns that are actually filtered/sorted on **and** have high cardinality (many distinct values) **and** are on tables where reads meaningfully outnumber writes.

**Interview line:** *"Every index costs something on every write, so more indexes isn't automatically better. A low-cardinality column often doesn't benefit much from an index, and on a write-heavy table, indexes you don't actually need for your real query patterns are pure cost. I only index what's actually filtered or sorted on in real queries."*

**Tests:** index trade-offs, over-indexing

*Axis: performance · Source: challenge question*

---

### "Why isn't the database using your index?"

The query planner decides per-query whether using an index is actually faster than a full scan — and sometimes it decides no, even though you have an index that "should" apply. Common reasons:

- **A function or transformation is applied to the indexed column in the query** — `WHERE LOWER(email) = 'x@y.com'` can't use a plain index on `email`, because the index stores the raw values, not the lowercased ones. You'd need a matching **functional index** (`CREATE INDEX ON users(LOWER(email))`).
- **Type mismatch** — comparing a string column to a number, or similar, can silently prevent index usage depending on the database.
- **Leading wildcard in a `LIKE`** — `LIKE '%gmail.com'` can't use a standard B-tree index (it doesn't know where to start), while `LIKE 'john%'` can.
- **The planner estimates a full scan is actually cheaper** — for a query expected to return a large fraction of the table, or on a small table where the overhead of an index lookup isn't worth it.
- **Stale statistics** — the planner uses table statistics to estimate row counts; if those are out of date (e.g. after a huge bulk insert without an `ANALYZE`), it can make a bad choice.

The way to actually know, rather than guess: run `EXPLAIN` (or `EXPLAIN ANALYZE`) on the query and read what the planner actually chose and why.

**Interview line:** *"I wouldn't guess — I'd run EXPLAIN and see what the planner actually did. Usually it's one of a few things: a function applied to the column in the WHERE clause that bypasses the plain index, a leading wildcard in a LIKE, or stale table statistics after a big bulk load that make the planner misjudge the cost."*

**Tests:** query plan analysis, debugging methodology

*Axis: performance · Source: challenge question*

---

### "How do you identify a slow query? What is an execution plan?"

Identifying: most databases have a **slow query log** (or equivalent — Postgres's `pg_stat_statements`, MongoDB's profiler) that records queries exceeding a threshold, with their duration — that's the starting point in production, since you can't manually watch every query.

Diagnosing: once you have a slow query, run **`EXPLAIN`** (or `EXPLAIN ANALYZE`, which actually runs it and reports real timings, not just estimates) — it shows the plan the database chose: which indexes it used (if any), the join strategy, and crucially the **estimated vs actual row counts** at each step, which is usually where the real problem shows up (the planner expected 10 rows and got 500,000).

```sql
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 123 AND status = 'pending';
-- look for: Seq Scan (bad, on a large table) vs Index Scan (good)
-- look for: estimated rows vs actual rows — a big mismatch means stale statistics
```

**Interview line:** *"In production I'd start from the slow query log to find what's actually slow, rather than guessing. Then EXPLAIN ANALYZE on that query — it shows whether it used an index or did a sequential scan, and whether the estimated row count was anywhere close to the actual one, which is usually where the real problem is hiding."*

**Tests:** query diagnosis, execution plans

*Axis: performance · Source: challenge question*

---

### "What causes an N+1 query problem?"

You fetch a list of N items with one query, then — for each item — run a *separate* query to fetch related data, ending up with 1 + N total queries instead of 2 (or 1). Classic case: fetch 50 orders, then loop over them calling `getCustomer(order.customerId)` inside the loop — 1 query for the orders, then 50 more, one per order.

```js
// N+1 — 1 query for orders, then 50 more in the loop
const orders = await db.orders.find();
for (const order of orders) {
  order.customer = await db.customers.findById(order.customerId); // ← runs 50 times
}

// fixed — 2 queries total, or 1 with a JOIN
const orders = await db.orders.find();
const customerIds = orders.map(o => o.customerId);
const customers = await db.customers.find({ id: { $in: customerIds } }); // 1 batched query
```

It's easy to introduce accidentally — especially with an ORM's lazy-loaded relations, where `order.customer.name` in a template silently triggers a query per order unless you explicitly eager-load it. It's also easy to miss in dev, where a list of 5 items feels instant even with N+1 — the pain only shows up at real scale (500 items = 500 extra queries).

**Interview line:** *"N+1 is fetching a list with one query, then running a separate query per item for related data instead of batching it — 1 + N queries instead of 2. It's especially easy to hit by accident with an ORM's lazy-loaded relations. The fix is to batch the related fetch with a single IN query or a JOIN, or explicitly eager-load the relation up front."*

**Tests:** ORM pitfalls, query batching

*Axis: performance · Source: challenge question*

---

### "How do you optimize a query without changing functionality?"

The result set has to stay identical — same rows, same values — only *how* the database gets there changes:

- **Add the right index** for the actual filter/sort/join columns being used (the highest-leverage fix, most of the time).
- **Select only the columns you actually need** (`SELECT id, name` instead of `SELECT *`) — less data to read and transfer, especially if it lets the database satisfy the query entirely from the index itself (a "covering index") without touching the table at all.
- **Rewrite an equivalent but cheaper query shape** — replace a correlated subquery (re-run once per outer row) with a `JOIN` or a batched `IN` query; replace `OFFSET` deep pagination with cursor-based pagination.
- **Batch what was N+1** into a single query, as above.
- **Materialize/cache** an expensive-but-rarely-changing aggregate instead of recomputing it on every request.

The discipline: measure before and after (`EXPLAIN ANALYZE`, or actual timing) — "should be faster" isn't the same as confirmed faster.

**Interview line:** *"Same result set, different path to it — usually the highest-leverage move is adding the right index for what the query actually filters or sorts on, then making sure I'm not selecting more columns than needed or running something as N+1 that could be one batched query. I always measure before and after rather than assuming a change helped."*

**Tests:** query optimization techniques, measurement discipline

*Axis: performance · Source: challenge question*

---

### "How do you design indexes for a high-write system?"

This is a direct tension: every index speeds up reads but slows down writes, so on a write-heavy system you can't just index everything that might ever be queried — you have to be deliberate:

- **Index only what's actually queried in the hot write path or the most frequent reads** — not every column that's ever filtered anywhere.
- **Prefer fewer, well-chosen composite indexes** over many single-column indexes, if queries commonly filter on the same combination of columns together.
- **Consider whether reads can be served from a replica** instead — offload read traffic (and therefore the pressure to add more indexes on the primary) to a read replica that can carry more indexes without hurting the primary's write latency.
- **Batch writes** where possible (bulk insert instead of one-row-at-a-time), since index maintenance overhead per batch is generally cheaper than per individual row.

**Interview line:** *"On a write-heavy system I treat every index as a real cost on the write path, not just a free speedup for reads — so I only add indexes for what's actually queried frequently, prefer composite indexes over a pile of single-column ones, and consider pushing read traffic to a replica instead of adding more indexes to the primary."*

**Tests:** write-heavy system design, index trade-offs

*Axis: performance · Source: challenge question*

---

### "What happens when a table/collection becomes extremely large?"

Growth degrades a database in a few specific, predictable ways:

- **Index size grows too** — a large index may no longer fit comfortably in memory, so index lookups start hitting disk instead of RAM, which is dramatically slower.
- **Full scans become catastrophic** — any query that was relying on a scan (accidentally, because it lacked an index) goes from "fine on 10K rows" to "unusable on 100M rows."
- **Maintenance operations get slower and more disruptive** — `ALTER TABLE`, rebuilding an index, a backup — all scale with table size, and some (depending on the database) can lock the table while running.
- **Offset pagination gets slower** the deeper you page, as covered earlier — the database has to skip more and more rows.

The responses: make sure the hot query paths are actually indexed (this matters far more at scale than at dev-size), consider **partitioning** the table (splitting it by date range or another key so queries only touch the relevant partition), move to **cursor pagination**, and **archive** data that doesn't need to stay in the primary hot table (next question).

**Interview line:** *"Growth exposes every gap that didn't matter at small scale — a missing index, a full scan that was fine on a small table, offset pagination that gets progressively slower. My response is indexing the actual hot paths, considering partitioning by something like date range so queries don't touch the whole table, and archiving data that doesn't need to live in the primary table at all."*

**Tests:** scale-driven degradation, partitioning

*Axis: scale · Source: challenge question*

---

### "How do you archive old data?"

Not every row needs to live in the primary, actively-queried table forever — old orders from three years ago are rarely read, but they still cost index space and slow down maintenance on the live table if they stay there.

The pattern: move data that's old and rarely accessed into **cold storage** — a separate archive table (same database or a different one), or export to cheap object storage (S3) as compressed files (Parquet, JSON) if it's rarely queried at all and mostly kept for compliance/audit. Then adjust application logic so:
- The primary table is queried by default (fast, small, hot).
- A specific "search archive" path exists for the rare case someone genuinely needs old data — usually slower, and that's an acceptable trade since it's rare.

```sql
-- move orders older than 2 years to an archive table, then delete from the live table
INSERT INTO orders_archive SELECT * FROM orders WHERE created_at < NOW() - INTERVAL '2 years';
DELETE FROM orders WHERE created_at < NOW() - INTERVAL '2 years';
```

**Interview line:** *"I move data that's old and rarely accessed out of the primary table — into an archive table, or out to object storage entirely if it's mostly for compliance. That keeps the live table smaller and its indexes faster for the traffic that actually matters, while still keeping old data available through a separate, deliberately slower path for the rare case someone needs it."*

**Tests:** data lifecycle management, hot vs cold storage

*Axis: scale · Source: challenge question*

---
