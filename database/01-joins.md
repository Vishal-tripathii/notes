# Database Study Notes — Part 01

## Joins

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.

---

## Table of Contents

1. [The join types](#types)
2. [`LEFT` vs `INNER` — concrete row-count case](#left-inner)
3. [`SELF JOIN`](#self)
4. [How joins actually execute](#execution)
5. [Interview Questions & Answers](#interview)
6. [Cheat Sheet](#cheatsheet)

---

<a name="types"></a>
## 1. The join types

Given `orders(id, customer_id, amount)` and `customers(id, name)`:

```sql
-- INNER JOIN — only rows that match on both sides
SELECT o.id, c.name FROM orders o
INNER JOIN customers c ON o.customer_id = c.id;

-- LEFT JOIN — every row from the left table, matched columns NULL if no match
SELECT o.id, c.name FROM orders o
LEFT JOIN customers c ON o.customer_id = c.id;

-- RIGHT JOIN — every row from the right table (rare in practice — usually rewritten as a LEFT JOIN with tables swapped)
SELECT o.id, c.name FROM orders o
RIGHT JOIN customers c ON o.customer_id = c.id;

-- CROSS JOIN — every row from A paired with every row from B (Cartesian product, no ON clause)
SELECT c.name, s.size FROM colors c CROSS JOIN sizes s;
```

`SELF JOIN` isn't a distinct SQL keyword — it's any join where a table is joined to itself, using two aliases.

---

<a name="left-inner"></a>
## 2. `LEFT` vs `INNER` — concrete row-count case

Say `customers` has 100 rows, but only 80 have ever placed an order.

- `INNER JOIN customers c ON o.customer_id = c.id` → returns rows only for customers **with at least one order**. Customers with zero orders simply disappear from the result.
- `LEFT JOIN` (orders as the left table) → returns every order, and if an order's `customer_id` doesn't match anything, the customer columns come back `NULL` rather than dropping the row.

The row-count divergence shows up clearest the other way: `SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON o.id = c.id` returns **all 100 customers** (20 with `NULL` order columns), while the same query with `INNER JOIN` returns only the 80 who ordered something. This is *the* concrete example to have ready — "customers with zero orders" is the canonical case interviewers use to test whether you actually understand the difference versus reciting it.

---

<a name="self"></a>
## 3. `SELF JOIN`

Used when rows in a table relate to other rows in the *same* table — the classic case is an `employees` table where each row has a `manager_id` pointing to another row's `id`.

```sql
SELECT e.name AS employee, m.name AS manager
FROM employees e
LEFT JOIN employees m ON e.manager_id = m.id;
```

`LEFT JOIN` here (not `INNER`) matters for the same reason as above — without it, the CEO (whose `manager_id` is `NULL`) would disappear from the result entirely instead of showing up with a `NULL` manager.

---

<a name="execution"></a>
## 4. How joins actually execute

At a high level, the query planner picks one of three strategies per join, based on table sizes and available indexes:

| Strategy | How it works | When the optimizer picks it |
|---|---|---|
| **Nested loop** | for each row in table A, scan table B for matches | small tables, or an index exists on the join column of B |
| **Hash join** | build an in-memory hash table on the smaller table's join key, then probe it with the larger table | no useful index, both tables large, enough memory |
| **Merge join** | both inputs sorted on the join key, then merged like a zipper | both sides already sorted (e.g. both have an index on the join column) |

You don't need to reimplement a query planner in an interview — the useful level of understanding is: **an unindexed join column forces a nested loop over an unsorted table, which is the classic "why is this join slow" root cause**, and adding an index on the foreign key column is usually the first fix to reach for.

---

<a name="interview"></a>
## 5. Interview Questions & Answers

**Q: `LEFT JOIN` vs `INNER JOIN` — give a concrete case where the row count differs.**
A: Customers table with rows that have never placed an order. `INNER JOIN` against orders drops those customers entirely from the result. `LEFT JOIN` (customers as the left table) keeps all of them, with `NULL` in the order columns for the ones with no match.

**Q: Why would you use a `SELF JOIN`?**
A: When rows relate to other rows in the same table — employee-to-manager is the standard example. Two aliases of the same table, joined on a foreign-key-like column (`manager_id` → `id`).

**Q: At a high level, how does the database actually execute a join?**
A: One of three strategies: nested loop (scan B per row of A — fine if small or indexed), hash join (build a hash table on the smaller side, probe with the larger — good with no index and enough memory), or merge join (both sides pre-sorted, zippered together). The practical takeaway: an unindexed join column tends to force the slow nested-loop path over an unsorted table.

---

<a name="cheatsheet"></a>
## 6. Cheat Sheet

- `INNER JOIN` = only matching rows on both sides. `LEFT JOIN` = all left rows, unmatched right columns become `NULL`.
- Canonical "row count differs" case: customers with zero orders — `INNER` drops them, `LEFT` keeps them as `NULL`-filled rows.
- `SELF JOIN` = same table, two aliases — classic case: employee → manager.
- Join execution: nested loop (small/indexed), hash join (large, unindexed, in-memory), merge join (both pre-sorted). Unindexed join column → slow nested loop is the usual root cause of a slow join.
- **SQL vs NoSQL:** joins are native and optimizer-tuned in SQL — Mongo's closest equivalents (`$lookup`, `populate()`) are neither as first-class nor as optimized. Full comparison → [Part 20](20-sql-vs-nosql-comparison.md).
