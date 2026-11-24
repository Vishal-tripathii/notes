# Database Study Notes — Part 01

## Joins

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.

---

## Table of Contents

0. [Simple version — start here](#simple)
1. [The join types](#types)
2. [`LEFT` vs `INNER` — concrete row-count case](#left-inner)
3. [`SELF JOIN`](#self)
4. [How joins actually execute](#execution)
5. [Interview Questions & Answers](#interview)
6. [Cheat Sheet](#cheatsheet)

---

<a name="simple"></a>
## 0. Simple version — start here

### The big idea

A **join** puts two tables side by side and pairs up rows that belong together.

**Analogy:** You have two lists:
- a **guest list** (customers)
- a **receipts pile** (orders), where each receipt has the guest's ID written on it

A join is you matching each receipt to the guest it belongs to. The join *type* decides **what happens to the leftovers**: guests with no receipt, and receipts with no matching guest.

```
   customers            orders
  ┌─────────┐        ┌─────────┐
  │         │        │         │
  │   only  │ match  │  only   │
  │  cust.  │ ██████ │ orders  │
  │         │ ██████ │         │
  └─────────┘        └─────────┘

  INNER JOIN  → only the ██ middle (matches)
  LEFT JOIN   → everything on the LEFT + matches
  RIGHT JOIN  → everything on the RIGHT + matches
```

### Example 1: Customers and orders (INNER vs LEFT vs RIGHT)

**customers**

| id | name  |
|----|-------|
| 1  | Asha  |
| 2  | Ravi  |
| 3  | Meera ← never ordered anything |

**orders**

| id  | customer_id | amount |
|-----|-------------|--------|
| 101 | 1           | 500    |
| 102 | 1           | 200    |
| 103 | 2           | 300    |
| 104 | 9 ← customer 9 doesn't exist | 150 |

The matching rule is `orders.customer_id = customers.id`. Draw the links:

```
customers              orders
 1 Asha  ───────────── 101 (cust 1)
         └──────────── 102 (cust 1)
 2 Ravi  ───────────── 103 (cust 2)
 3 Meera     (no link)
             (no link) 104 (cust 9)
```

**INNER JOIN: "only pairs that are linked"**

```sql
SELECT c.name, o.id, o.amount
FROM customers c
INNER JOIN orders o ON o.customer_id = c.id;
```

| name | order id | amount |
|------|----------|--------|
| Asha | 101 | 500 |
| Asha | 102 | 200 |
| Ravi | 103 | 300 |

Meera is **gone** (she has no order). Order 104 is **gone** (it has no customer).

**LEFT JOIN: "keep every row on the left, even if it has no partner"**

```sql
SELECT c.name, o.id, o.amount
FROM customers c          -- left table
LEFT JOIN orders o ON o.customer_id = c.id;
```

| name  | order id | amount |
|-------|----------|--------|
| Asha  | 101  | 500  |
| Asha  | 102  | 200  |
| Ravi  | 103  | 300  |
| Meera ← kept, with empty order columns | NULL | NULL |

**RIGHT JOIN: "keep every row on the right"**

Same query with `RIGHT JOIN`: every **order** is kept.

| name | order id | amount |
|------|----------|--------|
| Asha | 101 | 500 |
| Asha | 102 | 200 |
| Ravi | 103 | 300 |
| NULL ← order with no customer | 104 | 150 |

People rarely write RIGHT JOIN. They swap the two tables and use LEFT JOIN, because it reads more easily.

**Notice:** Asha shows up **twice**. A join gives one output row **per matching pair**, not one per customer. This catches a lot of people. If you then do `SUM(amount)` on another joined table, the totals can come out doubled.

**Bonus pattern interviewers love: "find customers who never ordered"**

```sql
SELECT c.name
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.id IS NULL;     -- → Meera
```

LEFT JOIN keeps everyone. The `IS NULL` filter then keeps only the people with no partner.

> **Remember this:** INNER = "matched couples only". LEFT = "everyone from the left, partner or not". A missing partner shows up as NULL.

### Example 2: SELF JOIN (a table joined with itself)

There's no `SELF JOIN` keyword. It just means you use **the same table twice** under two nicknames.

**employees**

| id | name   | manager_id |
|----|--------|------------|
| 1  | Priya  | NULL ← CEO, no boss |
| 2  | Karan  | 1 |
| 3  | Neha   | 1 |
| 4  | Arjun  | 2 |

The manager is also an employee, so the "boss" information lives in the **same table**:

```
        Priya (1)
        /       \
   Karan (2)   Neha (3)
      |
   Arjun (4)
```

**Analogy:** Print the table twice. Call one copy **e** (employee) and the other **m** (manager). For each row in e, find the row in m whose `id` equals e's `manager_id`.

```sql
SELECT e.name AS employee, m.name AS manager
FROM employees e
LEFT JOIN employees m ON e.manager_id = m.id;
```

| employee | manager |
|----------|---------|
| Priya | NULL  |
| Karan | Priya |
| Neha  | Priya |
| Arjun | Karan |

Why LEFT and not INNER? Priya's `manager_id` is NULL, so she has no match. INNER JOIN would **drop the CEO** from the list.

> **Remember this:** Self join = one table, two nicknames. Use it when a row points to another row in the same table (employee → manager, comment → parent comment).

### Example 3: CROSS JOIN (every row paired with every row)

No matching rule here. **Every** row on one side is paired with **every** row on the other.

**colors:** Red, Blue  **sizes:** S, M, L

```sql
SELECT c.name, s.size FROM colors c CROSS JOIN sizes s;
```

```
        S        M        L
Red   Red-S    Red-M    Red-L
Blue  Blue-S   Blue-M   Blue-L
```

That's 2 × 3 = **6 rows**. It's useful for building every product variant or every date × store combination.

**Danger:** if you forget the `ON` condition by mistake, you get a cross join. Two tables of 10,000 rows each become **100 million rows**.

> **Remember this:** CROSS = multiply. Rows out = rows in A × rows in B.

### One-line summary

| Join | Keeps |
|------|-------|
| INNER | only matched pairs |
| LEFT | all left rows, plus matches (NULL if none) |
| RIGHT | all right rows, plus matches (NULL if none) |
| CROSS | every possible pair |
| SELF | any of the above, with one table used twice |

### Quick self-check

1. In Example 1, how many rows does `customers LEFT JOIN orders` give if Asha had **5** orders instead of 2?
2. You write `LEFT JOIN orders o ON ...` and then add `WHERE o.amount > 100`. What happens to Meera, and why does the LEFT JOIN quietly turn into an INNER JOIN?
3. `orders` has 10 million rows and `customer_id` has no index. Why is the join slow, and what's the fix? (See [section 4](#execution).)

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

The row-count divergence shows up clearest the other way: `SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON o.customer_id = c.id` returns **all 100 customers** (20 with `NULL` order columns), while the same query with `INNER JOIN` returns only the 80 who ordered something. This is *the* concrete example to have ready — "customers with zero orders" is the canonical case interviewers use to test whether you actually understand the difference versus reciting it.

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

You don't need to reimplement a query planner in an interview — the useful level of understanding is:

- **A nested loop is fast *because of* an index** — for each outer row it does an O(log n) index seek into the inner table. That's why the planner picks it when the inner join column is indexed (and the outer side is small).
- **With no usable index, modern planners don't fall back to a naive nested loop** — Postgres and MySQL 8.0.18+ pick a **hash join** instead (build a hash table on the smaller side, probe with the larger). That's O(n + m), but it reads both tables fully and needs memory; if the hash table doesn't fit in `work_mem` / `join_buffer_size`, it spills to disk and gets slow.
- **The genuinely slow case** is a nested loop *without* an index on the inner side (O(n × m)) — what older MySQL (pre-8.0.18, "block nested loop") did, and what any planner can still choose when **stale statistics** make it think the outer side has only a few rows when it actually has millions.

So the practical fix is still the same — **index the foreign key column** (Postgres does *not* create one for you automatically, only for the referenced primary key) — but the reason is "it makes a cheap nested-loop seek possible and stops the planner scanning both tables in full," not "no index forces a nested loop."

---

<a name="interview"></a>
## 5. Interview Questions & Answers

**Q: `LEFT JOIN` vs `INNER JOIN` — give a concrete case where the row count differs.**
A: Customers table with rows that have never placed an order. `INNER JOIN` against orders drops those customers entirely from the result. `LEFT JOIN` (customers as the left table) keeps all of them, with `NULL` in the order columns for the ones with no match.

**Q: Why would you use a `SELF JOIN`?**
A: When rows relate to other rows in the same table — employee-to-manager is the standard example. Two aliases of the same table, joined on a foreign-key-like column (`manager_id` → `id`).

**Q: At a high level, how does the database actually execute a join?**
A: One of three strategies: nested loop (scan B per row of A — fine if small or indexed), hash join (build a hash table on the smaller side, probe with the larger — good with no index and enough memory), or merge join (both sides pre-sorted, zippered together). The practical takeaway: an index on the join column makes a cheap nested-loop seek possible; without one, modern planners use a hash join, which scans both tables fully and can spill to disk. The truly slow case is an unindexed nested loop (O(n × m)) — older MySQL, or a planner misled by stale statistics.

---

<a name="cheatsheet"></a>
## 6. Cheat Sheet

- `INNER JOIN` = only matching rows on both sides. `LEFT JOIN` = all left rows, unmatched right columns become `NULL`.
- Canonical "row count differs" case: customers with zero orders — `INNER` drops them, `LEFT` keeps them as `NULL`-filled rows.
- `SELF JOIN` = same table, two aliases — classic case: employee → manager.
- Join execution: nested loop (small outer side + indexed inner side), hash join (no useful index, large inputs, needs memory), merge join (both pre-sorted). No index on the join column → full scans + hash join that can spill to disk; an *unindexed nested loop* (O(n × m), old MySQL or stale stats) is the worst case. Fix: index the foreign key column — Postgres doesn't create it for you.
- **SQL vs NoSQL:** joins are native and optimizer-tuned in SQL — Mongo's closest equivalents (`$lookup`, `populate()`) are neither as first-class nor as optimized. Full comparison → [Part 20](20-sql-vs-nosql-comparison.md).
