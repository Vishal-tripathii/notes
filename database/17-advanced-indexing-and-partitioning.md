# Database Study Notes — Part 17

## Advanced Indexing & Partitioning

> **Format:** Q&A — my prompts are the questions, the explanations are the answers. Lower priority — read once the ⭐⭐⭐⭐⭐/⭐⭐⭐⭐☆ parts are solid.

---

## Table of Contents

1. [Partial indexes](#partial)
2. [Sparse indexes](#sparse)
3. [Table partitioning](#partitioning)
4. [Interview Questions & Answers](#interview)
5. [Cheat Sheet](#cheatsheet)

---

<a name="partial"></a>
## 1. Partial indexes

A **partial index** only indexes rows matching a given condition, instead of every row in the table — smaller index, cheaper to maintain, useful when queries only ever care about a subset of rows.

```sql
-- Only index orders that are still pending — most queries only ever filter for these
CREATE INDEX idx_pending_orders ON orders (created_at) WHERE status = 'pending';
```

```js
// MongoDB equivalent — partialFilterExpression
db.orders.createIndex({ createdAt: 1 }, { partialFilterExpression: { status: "pending" } })
```

**Why it matters:** if 95% of a table's rows are `status = 'completed'` (effectively archived, rarely queried) and the hot query path only ever needs `status = 'pending'` orders, a full index would waste storage and write overhead indexing rows nobody queries by that condition — a partial index covers exactly the subset that matters.

---

<a name="sparse"></a>
## 2. Sparse indexes

A **sparse index** only includes documents/rows where the indexed field **actually exists** — documents missing that field entirely are excluded from the index (not the same as excluding `null` values; a sparse index is about the field being absent).

```js
// Only users who have a `phone` field get indexed — users without one are skipped
db.users.createIndex({ phone: 1 }, { sparse: true })
```

Useful for optional fields that only a fraction of documents have — indexing every document (including all the ones missing the field, which a non-sparse unique index would otherwise treat as colliding `null` values) wastes space and can create false unique-constraint conflicts.

---

<a name="partitioning"></a>
## 3. Table partitioning

**Partitioning** splits one large table into multiple smaller physical pieces (partitions), based on a partition key (commonly a date range) — but unlike sharding, this happens **within a single database server**, and it's transparent to queries: the application still queries the table as if it were one, while the database internally only scans the relevant partition(s).

```sql
CREATE TABLE orders (
  id INT, created_at DATE, amount DECIMAL
) PARTITION BY RANGE (created_at) (
  PARTITION orders_2024 VALUES LESS THAN ('2025-01-01'),
  PARTITION orders_2025 VALUES LESS THAN ('2026-01-01')
);

-- The database only scans the orders_2025 partition, not the whole table
SELECT * FROM orders WHERE created_at >= '2025-06-01';
```

**Why it helps:** a query filtered to a specific date range only needs to scan the matching partition instead of the entire table — this is called **partition pruning**. It also makes bulk archival/deletion of old data cheap: dropping an entire old partition is far faster than a `DELETE` scanning and removing millions of individual rows.

**Partitioning vs sharding — don't conflate them:** partitioning splits data within one server (still one machine's storage/compute); sharding (Part 14) splits data across multiple servers. They solve different scaling ceilings, and can be combined (each shard internally partitioned).

---

<a name="interview"></a>
## 4. Interview Questions & Answers

**Q: What's a partial index, and when would you use one?**
A: An index that only covers rows matching a specific condition, rather than the whole table — smaller, cheaper to maintain. Useful when the hot query path only ever needs a subset of rows (e.g. only `pending` orders), so there's no reason to also index the much larger set of rows nobody queries by that filter.

**Q: What's the difference between a sparse index and a partial index?**
A: A sparse index excludes documents where the indexed field is entirely absent — built for optional fields only a fraction of documents have. A partial index excludes rows based on an arbitrary condition, not specifically field-presence — a partial index could filter on any predicate, not just "does this field exist."

**Q: How is table partitioning different from sharding?**
A: Partitioning splits a table into pieces within a single database server — transparent to queries, and the database prunes to the relevant partition(s) automatically. Sharding splits data across multiple separate servers. They address different scaling limits and are often combined — a sharded cluster where each shard's table is itself partitioned.

---

<a name="cheatsheet"></a>
## 5. Cheat Sheet

- Partial index = indexes only rows matching a condition — smaller, cheaper, for queries that only ever need a known subset.
- Sparse index = indexes only documents where the field exists at all — for optional fields.
- Partitioning = split one table into physical pieces within one server, queried transparently, with automatic partition pruning; cheap bulk archival via dropping a whole partition.
- Partitioning (one server) ≠ Sharding (multiple servers) — different problems, can be combined.
