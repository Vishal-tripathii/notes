# Database Study Notes — Part 03

## Query Optimization & `EXPLAIN`

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.

---

## Table of Contents

1. [Reading an execution plan](#reading)
2. [Full table scan vs index scan](#scan-vs-index)
3. [When the optimizer chooses a scan over an index](#optimizer-choice)
4. [The "API became slow" diagnostic process](#process)
5. [Interview Questions & Answers](#interview)
6. [Cheat Sheet](#cheatsheet)

---

<a name="reading"></a>
## 1. Reading an execution plan

`EXPLAIN` (SQL) / `.explain()` (MongoDB) shows what the database actually plans to do to answer a query — which index (if any) it uses, in what order tables are joined, and an estimated row count at each step. It's the difference between guessing why a query is slow and actually seeing it.

```sql
EXPLAIN SELECT * FROM orders WHERE customer_id = 42;
```

Key fields to scan for (naming varies by engine, but the concepts are universal): the **access type** (full scan vs index seek), **which index, if any**, was used, and the **estimated rows examined** at each step — a huge gap between "rows examined" and "rows returned" is the single strongest smell that something's wrong.

---

<a name="scan-vs-index"></a>
## 2. Full table scan vs index scan

- **Full table scan:** the engine reads every row in the table to find matches — O(n).
- **Index scan:** the engine uses a sorted index structure to jump directly to matching rows — O(log n) plus however many matching rows there are.

`EXPLAIN` output literally names this — MySQL shows `type: ALL` for a full scan; MongoDB's `.explain()` shows `stage: "COLLSCAN"` for a collection scan vs `"IXSCAN"` for an index scan. Seeing `ALL` or `COLLSCAN` on a query that's supposed to be selective (`WHERE customer_id = 42` on a million-row table) is the red flag that starts the investigation.

---

<a name="optimizer-choice"></a>
## 3. When the optimizer chooses a scan over an index — and why that can be correct

This is the nuance that separates a junior answer from a senior one: **seeing a full scan in `EXPLAIN` is not automatically a bug.**

If a query is going to return a large fraction of the table (say, more than ~20-30%, the exact threshold depends on the engine's cost model), a full sequential scan can genuinely be **cheaper** than an index scan — because an index scan means jumping around the table fetching each matching row individually (random I/O), while a sequential scan reads everything in one pass (sequential I/O, which is much faster per byte on spinning disks and still meaningfully faster on SSDs due to read-ahead and caching behavior).

The optimizer makes this call based on table statistics (estimated selectivity of the `WHERE` clause) — stale statistics are a real, separate cause of *bad* scan-vs-index decisions, distinct from the optimizer correctly avoiding the index for a low-selectivity query.

---

<a name="process"></a>
## 4. The "API became slow" diagnostic process

The process matters more than a one-liner fix — this is what an interviewer is actually testing:

1. **Reproduce with `EXPLAIN`** on the actual slow query (with realistic data volume, not a tiny dev dataset — plans change with table size).
2. **Check access type** — is it a full scan (`ALL`/`COLLSCAN`) where an index seek was expected?
3. **Check rows examined vs rows returned** — a huge gap means the engine is doing far more work than the result size justifies.
4. **If an index exists but isn't used** — check for the Part 02 culprits: leading wildcard, function on the column, wrong composite order.
5. **If no index exists** — is the query pattern common enough to justify adding one, weighed against the write-cost trade-off (Part 02 §1)?
6. **If the plan looks right but it's still slow** — check for N+1 query patterns (Part 07), missing connection pooling (Part 12), or genuine data-volume growth needing a structural fix (archiving, sharding).

---

<a name="interview"></a>
## 5. Interview Questions & Answers

**Q: Walk me through how you'd diagnose a slow API endpoint, database-side.**
A: Run `EXPLAIN` on the actual query with realistic data volume, check the access type for a full scan where an index seek was expected, and compare rows-examined to rows-returned. If an index exists but isn't used, check for a leading wildcard, a function wrapped around the column, or wrong composite-index order. If none of that applies, look wider — N+1 queries, connection pool exhaustion, or genuine data growth needing a structural fix.

**Q: What should you look for in `EXPLAIN` output specifically?**
A: Access type (full scan vs index scan — `ALL`/`COLLSCAN` vs an actual index name), which index was chosen if any, and the gap between estimated rows examined and rows actually returned — a large gap is the strongest single signal of an inefficient plan.

**Q: Is a full table scan in `EXPLAIN` always a problem?**
A: No — if the query is expected to return a large fraction of the table, a sequential full scan can be genuinely cheaper than jumping around via an index (sequential I/O vs random I/O). The optimizer bases this on table statistics; a bad decision is more often caused by stale statistics than by the concept being wrong.

---

<a name="cheatsheet"></a>
## 6. Cheat Sheet

- `EXPLAIN`/`.explain()` shows the actual plan: access type, index used, estimated rows.
- `ALL` (MySQL) / `COLLSCAN` (Mongo) = full scan. `index`/`IXSCAN` = index used.
- Big gap between rows-examined and rows-returned = red flag.
- A full scan isn't automatically wrong — for low-selectivity queries (large % of table matches), sequential I/O beats random I/O via an index; that's a legitimate optimizer choice, not a bug.
- Diagnostic order: reproduce with `EXPLAIN` → check access type → check rows examined vs returned → check index-not-used culprits → check wider (N+1, pooling, data growth).
