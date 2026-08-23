# Database Study Notes — Part 16

## Advanced SQL

> **Format:** Q&A — my prompts are the questions, the explanations are the answers. Lower priority — read once the ⭐⭐⭐⭐⭐/⭐⭐⭐⭐☆ parts are solid.

---

## Table of Contents

1. [Window Functions](#window)
2. [CTEs](#cte)
3. [Full-Text Search](#fts)
4. [Interview Questions & Answers](#interview)
5. [Cheat Sheet](#cheatsheet)

---

<a name="window"></a>
## 1. Window Functions

A window function computes a value **across a set of related rows** ("the window") without collapsing them into a single row the way `GROUP BY` does — each input row still appears in the output, now with an extra computed column.

```sql
-- Rank each order within its customer's orders, by amount — no collapsing, every order row survives
SELECT customer_id, amount,
       RANK() OVER (PARTITION BY customer_id ORDER BY amount DESC) AS rank_in_customer
FROM orders;
```

`PARTITION BY` is the window-function equivalent of `GROUP BY`'s bucketing — but instead of collapsing each bucket into one summary row, every row keeps its identity and gains a value computed relative to its bucket (`RANK()`, `SUM() OVER (...)` as a running total, `LAG()`/`LEAD()` for the previous/next row's value).

**The core distinction from `GROUP BY`:** `GROUP BY` answers "one row per group." A window function answers "every row, plus something computed about its group" — the classic use case is "top 3 orders per customer" or "running total," neither of which `GROUP BY` alone can produce.

---

<a name="cte"></a>
## 2. CTEs (Common Table Expressions)

A CTE is a named, temporary result set defined with `WITH`, usable like a table within the rest of the query — mainly a **readability** tool for breaking a complex query into named, logical steps instead of nesting subqueries.

```sql
WITH high_value_customers AS (
  SELECT customer_id, SUM(amount) AS total
  FROM orders
  GROUP BY customer_id
  HAVING SUM(amount) > 1000
)
SELECT c.name, hvc.total
FROM high_value_customers hvc
JOIN customers c ON c.id = hvc.customer_id;
```

The equivalent nested-subquery version works identically but is harder to read once there's more than one level of nesting — CTEs name each intermediate step, which is the whole value proposition. Some databases also support **recursive CTEs** (a CTE that references itself) for hierarchical data — e.g. walking an employee→manager tree of arbitrary depth, something a fixed-depth `SELF JOIN` (Part 01 §3) can't do.

---

<a name="fts"></a>
## 3. Full-Text Search

Standard `LIKE '%keyword%'` matching is fundamentally different from full-text search: `LIKE` does literal substring matching (can't use a normal index, Part 02 §6) and has no concept of relevance, word forms, or ranking. A full-text index is a purpose-built structure for searching **natural language** — it tokenizes text into words, often applies stemming (matching "running" when searching "run"), ignores common stop words, and can rank results by relevance rather than just returning an unordered match/no-match set.

```sql
-- Postgres example
SELECT * FROM articles
WHERE to_tsvector('english', body) @@ to_tsquery('english', 'database & performance');
```

Full-text search is the right tool when the requirement is genuinely "search this text field for relevant matches" (a search bar, a content search feature) — `LIKE '%x%'` is fine for small, simple exact-substring needs, but doesn't scale in either performance or search quality to real full-text search requirements.

---

<a name="interview"></a>
## 4. Interview Questions & Answers

**Q: What's the difference between a window function and `GROUP BY`?**
A: `GROUP BY` collapses each group into a single summary row. A window function keeps every individual row in the output while computing a value relative to its group (via `PARTITION BY`) — needed for things like "rank each order within its customer's orders" or a running total, where you need both the per-row detail and a group-relative computed value at once.

**Q: What's a CTE, and why use one over a nested subquery?**
A: A named, temporary result set defined with `WITH`, usable like a table in the rest of the query. Functionally similar to a subquery, but it names each logical step — mainly a readability/maintainability win once a query has more than one level of nesting. Recursive CTEs additionally handle arbitrary-depth hierarchical data that a fixed-depth join can't.

**Q: Why not just use `LIKE '%keyword%'` for search?**
A: It's literal substring matching — can't use a standard index, and has no concept of word forms, stop words, or relevance ranking. A full-text index tokenizes and often stems the text, and can rank matches by relevance, which is what an actual search feature needs; `LIKE` only makes sense for small-scale, simple exact-substring needs.

---

<a name="cheatsheet"></a>
## 5. Cheat Sheet

- Window function = per-row output + a value computed over a related group (`PARTITION BY`), unlike `GROUP BY` which collapses to one row per group.
- CTE (`WITH ... AS (...)`) = named temporary result set, mainly for readability over nested subqueries; recursive CTEs handle arbitrary-depth hierarchies.
- Full-text search ≠ `LIKE '%x%'` — tokenizes, stems, ranks by relevance; `LIKE` is literal substring matching with no index support and no ranking.
