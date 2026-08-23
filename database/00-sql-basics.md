# Database Study Notes — Part 00

## SQL Basics

> **Format:** Q&A — my prompts are the questions, the explanations are the answers. Written the way you'd *say* it in an interview, not as reference notes.

---

## Table of Contents

1. [The clause execution order](#order)
2. [`WHERE` vs `HAVING`](#where-having)
3. [`COUNT(*)` vs `COUNT(column)`](#count)
4. [`DISTINCT` vs `GROUP BY`](#distinct)
5. [Aggregate functions](#aggregates)
6. [Interview Questions & Answers](#interview)
7. [Cheat Sheet](#cheatsheet)

---

<a name="order"></a>
## 1. The clause execution order

SQL is **written** in one order but **executed** in another — this gap is the source of almost every "why doesn't this work" SQL bug.

```
Written:   SELECT → FROM → WHERE → GROUP BY → HAVING → ORDER BY → LIMIT
Executed:  FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT
```

**Why it exists this way:** the engine has to know *which rows exist* (`FROM`), then *which of those rows survive* (`WHERE`), then *how they're bucketed* (`GROUP BY`), then *which buckets survive* (`HAVING`) — before it can figure out what to actually project as columns (`SELECT`). `SELECT` runs almost last because it's just picking/shaping the output of everything before it.

**Practical consequence:** you can't reference a `SELECT` column alias inside `WHERE` — the alias doesn't exist yet at that point in execution:

```sql
-- FAILS in most databases:
SELECT amount * 1.1 AS total_with_tax
FROM orders
WHERE total_with_tax > 100;   -- ❌ total_with_tax doesn't exist yet

-- WORKS — ORDER BY runs after SELECT, so the alias exists by then:
SELECT amount * 1.1 AS total_with_tax
FROM orders
ORDER BY total_with_tax;      -- ✅
```

---

<a name="where-having"></a>
## 2. `WHERE` vs `HAVING`

The common half-right answer: *"WHERE is for columns, HAVING is for aggregates."* Close, but the real distinction is about **timing**, not content type.

- **`WHERE`** filters raw rows **before** grouping happens.
- **`HAVING`** filters **groups** — after aggregation has already collapsed rows into buckets.

```sql
-- Total spend per customer, but only customers whose total exceeds 1000
SELECT customer_id, SUM(amount) AS total_spent
FROM orders
WHERE status = 'completed'      -- filters individual rows first
GROUP BY customer_id
HAVING SUM(amount) > 1000;      -- filters the resulting groups
```

You can't put `SUM(amount) > 1000` in `WHERE` because at the time `WHERE` runs, rows haven't been grouped or summed yet — there is no per-customer total to compare against. `HAVING` runs after `GROUP BY`, once that total actually exists.

---

<a name="count"></a>
## 3. `COUNT(*)` vs `COUNT(column)`

- `COUNT(*)` counts rows, full stop — regardless of what's inside them (even rows that are entirely `NULL` across every column still count).
- `COUNT(column)` counts only rows where **that specific column** is non-`NULL`.

```sql
-- users table: 100 rows, but 12 have a NULL phone_number
SELECT COUNT(*) FROM users;             -- 100
SELECT COUNT(phone_number) FROM users;  -- 88
```

**The footgun:** someone expects "total users" and silently gets a smaller number because they used `COUNT(phone_number)` instead of `COUNT(*)` — an easy, quiet bug in a report or dashboard.

---

<a name="distinct"></a>
## 4. `DISTINCT` vs `GROUP BY`

- **`DISTINCT`** dedupes the full row (or the selected columns) — no aggregation involved.
- **`GROUP BY`** buckets rows so aggregate functions (`COUNT`, `SUM`, `AVG`, `MIN`, `MAX`) can run **per bucket**.

For a plain "list the unique values" query, they produce identical results:

```sql
SELECT DISTINCT city FROM users;

SELECT city FROM users GROUP BY city;
-- same output as above
```

They stop being interchangeable the moment you need an aggregate alongside the grouping — `DISTINCT` has no mechanism for that at all:

```sql
-- Only GROUP BY can do this — DISTINCT has no equivalent
SELECT city, COUNT(*) AS user_count
FROM users
GROUP BY city;
```

---

<a name="aggregates"></a>
## 5. Aggregate functions

| Function | What it does | Nulls |
|---|---|---|
| `COUNT(*)` | counts rows | includes rows with all-null columns |
| `COUNT(col)` | counts non-null values in `col` | skips `NULL` |
| `SUM(col)` | adds numeric values | skips `NULL` (doesn't treat it as 0) |
| `AVG(col)` | mean of non-null values | `NULL` rows excluded from both numerator and denominator |
| `MIN(col)` / `MAX(col)` | smallest / largest value | skips `NULL` |

**Key shared behavior:** every aggregate function ignores `NULL` values — they don't count as 0, they're just excluded from the calculation entirely. This is consistent across `COUNT`, `SUM`, `AVG`, `MIN`, `MAX`.

Aggregate functions with no `GROUP BY` treat the **entire table as one group**:

```sql
SELECT AVG(amount) FROM orders;   -- one number, average across all rows
```

---

<a name="interview"></a>
## 6. Interview Questions & Answers

**Q: `WHERE` vs `HAVING` — what's the actual difference?**
A: Timing, not content type. `WHERE` filters individual rows before grouping. `HAVING` filters the groups that result after `GROUP BY` has already aggregated. You need `HAVING` specifically when the filter condition depends on an aggregate value that doesn't exist until grouping has happened.

**Q: `COUNT(*)` vs `COUNT(column)` — when would they differ?**
A: Whenever the column has `NULL` values. `COUNT(*)` counts every row; `COUNT(column)` only counts rows where that column is non-null. If you want a true row count, always use `COUNT(*)` — `COUNT(some_column)` silently undercounts if that column can be null.

**Q: `DISTINCT` vs `GROUP BY` — when does the choice actually matter?**
A: They look the same for a bare "unique values" query. They diverge the moment you need to compute an aggregate per group — `DISTINCT` has no way to attach a `COUNT` or `SUM` per bucket, only `GROUP BY` can.

**Q: Why can't I use a `SELECT` alias in a `WHERE` clause?**
A: Because of execution order — `WHERE` runs before `SELECT` in the actual execution sequence, so the alias hasn't been computed yet. `ORDER BY` runs after `SELECT`, so aliases work there.

---

<a name="cheatsheet"></a>
## 7. Cheat Sheet

- **Execution order:** `FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT` (not the order it's written in).
- **`WHERE`** = filter rows before grouping. **`HAVING`** = filter groups after aggregation.
- **`COUNT(*)`** = all rows. **`COUNT(col)`** = non-null values only.
- **`DISTINCT`** = dedupe rows, no aggregation possible. **`GROUP BY`** = bucket rows so aggregates can run per bucket.
- All aggregate functions (`COUNT`, `SUM`, `AVG`, `MIN`, `MAX`) **skip `NULL`**, they don't treat it as zero.
- No `GROUP BY` + an aggregate function = the whole table is treated as one group.
