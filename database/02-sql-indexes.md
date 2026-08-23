# Database Study Notes — Part 02

## SQL Indexes

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.

---

## Table of Contents

1. [Why indexes exist](#why)
2. [B-Tree structure](#btree)
3. [Composite indexes & the left-most prefix rule](#composite)
4. [Covering indexes](#covering)
5. [Clustered vs non-clustered](#clustered)
6. [Why isn't my index being used](#not-used)
7. [Interview Questions & Answers](#interview)
8. [Cheat Sheet](#cheatsheet)

---

<a name="why"></a>
## 1. Why indexes exist

Without an index, finding a row means scanning every row in the table (a full table scan) — O(n) in table size. An index is a separate, ordered data structure that maps a column's values to the location of the rows that have them, so a lookup becomes O(log n) instead.

**The trade-off is never free:** every index has to be updated on every `INSERT`/`UPDATE`/`DELETE` that touches its column, so more indexes means slower writes and more storage — indexing is a deliberate choice per query pattern, not a default reflex to add everywhere.

---

<a name="btree"></a>
## 2. B-Tree structure

Most database indexes (SQL and MongoDB alike) are B-Trees: a balanced tree where each node holds multiple sorted keys, and every leaf is the same distance from the root.

**Why B-Tree specifically, not a binary tree:** a B-Tree node holds many keys per disk page (not just one), so a lookup touches far fewer disk pages than a binary tree would for the same number of keys — the structure is shaped around minimizing disk I/O, since a disk page read is the expensive operation, not comparisons in memory. The balanced property means lookup, insert, and delete are all O(log n) worst case, not just average case.

---

<a name="composite"></a>
## 3. Composite indexes & the left-most prefix rule

A composite (multi-column) index on `(last_name, first_name)` is stored sorted by `last_name` first, then `first_name` within each `last_name` group — like a phone book sorted by last name, then first name.

**Left-most prefix rule:** the index can be used for queries filtering on `last_name` alone, or on `last_name AND first_name` together — but **not** for a query filtering on `first_name` alone, because the index isn't sorted by `first_name` independently of `last_name`.

```sql
CREATE INDEX idx_name ON users (last_name, first_name);

WHERE last_name = 'Smith'                      -- ✅ uses index
WHERE last_name = 'Smith' AND first_name = 'A'  -- ✅ uses index
WHERE first_name = 'A'                          -- ❌ can't use this index at all
```

**Field order matters** — put the column used most often (or with the most selective/equality filters) first.

---

<a name="covering"></a>
## 4. Covering indexes

A query is answered entirely from the index itself, without ever touching the actual table rows — because every column the query needs (both filtered and selected) is present in the index.

```sql
CREATE INDEX idx_email_name ON users (email, name);

-- covered: both `email` (filter) and `name` (selected) are in the index
SELECT name FROM users WHERE email = 'a@x.com';
```

If the query selected a column not in the index (e.g. `SELECT phone`), the database has to jump from the index entry back to the actual row to fetch it — an extra I/O step a covering index avoids entirely.

---

<a name="clustered"></a>
## 5. Clustered vs non-clustered

- **Clustered index:** the table's actual rows are physically stored in the order of this index — there can only be **one** per table (usually the primary key). Looking it up *is* looking at the data.
- **Non-clustered index:** a separate structure that points back to where the row actually lives (a row pointer or, in many databases, the clustered index key). A table can have **many** of these.

The practical difference shows up in range scans: a clustered index range query reads contiguous physical rows; a non-clustered one has to follow a pointer back to the table for each match, which is slower per row unless it's a covering index.

---

<a name="not-used"></a>
## 6. Why isn't my index being used

The standard culprits, in the order an interviewer expects you to reach for them:

1. **A leading wildcard `LIKE`** — `LIKE '%smith'` can't use a standard B-Tree index (it's sorted left-to-right, so there's no prefix to seek to); `LIKE 'smith%'` can.
2. **A function applied to the indexed column** — `WHERE YEAR(created_at) = 2024` can't use an index on `created_at` directly, because the index stores raw values, not the function's output. Rewriting as a range (`created_at >= '2024-01-01' AND created_at < '2025-01-01'`) fixes it.
3. **Wrong leftmost-prefix order** — filtering only on the second column of a composite index (see §3).
4. **The optimizer decided a full scan is actually cheaper** — this is not always a bug. If a query would return a large fraction of the table, jumping in and out of the index for each row can cost more than one sequential scan; the optimizer's cost-based decision can be correct even when it "looks wrong."

---

<a name="interview"></a>
## 7. Interview Questions & Answers

**Q: Why do indexes make reads fast, and why isn't that free?**
A: An index is a sorted structure (typically a B-Tree) that turns an O(n) full scan into an O(log n) lookup. The cost is that every write to the table now also has to update every index on it, so more indexes trade write speed and storage for read speed — it's a deliberate per-query-pattern decision, not a blanket default.

**Q: Why does composite index field order matter?**
A: The index is physically sorted by the first column, then the second within each first-column value — like a phone book by last name then first name. A query can only use the index if it filters on a left-most prefix of the columns; filtering on just the second column skips the sorted structure entirely.

**Q: What's a covering index?**
A: One where every column the query needs — filtered and selected — exists in the index itself, so the database never has to jump back to the actual table row to satisfy the query.

**Q: Give the standard reasons an index isn't being used.**
A: Leading wildcard `LIKE`, a function wrapped around the indexed column, wrong leftmost-prefix order on a composite index, or — legitimately — the optimizer decided a full scan is cheaper because the query would return too large a fraction of the table for the index to help.

---

<a name="cheatsheet"></a>
## 8. Cheat Sheet

- Index = sorted structure (usually B-Tree), turns O(n) scan into O(log n) lookup — costs write speed + storage.
- B-Tree is disk-I/O-shaped: many keys per node = fewer page reads than a binary tree.
- Composite index = sorted by first column, then second within it — left-most prefix rule governs which queries can use it.
- Covering index = query answered entirely from the index, no row lookup needed.
- Clustered = table data physically ordered by this index (one per table). Non-clustered = separate structure pointing back to the row (many per table).
- Index not used → check: leading `%wildcard`, function on the column, wrong composite order, or optimizer correctly preferring a full scan.
- **SQL vs NoSQL:** same underlying B-Tree structure and left-most-prefix rule apply in MongoDB ([Part 06](06-mongodb-indexes.md)) — the concept transfers directly. Full comparison → [Part 20](20-sql-vs-nosql-comparison.md).
