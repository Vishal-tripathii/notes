# System Design Study Notes — Part 9

## Database Indexing

> **Format:** Written as **Q&A** — my prompts are the questions, the explanations are the answers. Complete capture of the chat, reorganized and expanded. Diagrams, behind-the-scenes mechanics, and interview Q&A included.
>
> **Continues from:** Part 8 (Databases). Indexing is *how* a database finds rows fast — the difference between a 2ms and a 2-second query.

---

## Table of Contents

1. [Core idea (book-index analogy)](#core)
2. [Behind the scenes: without vs with an index](#behind)
3. [How indexes work: the B-tree](#btree)
4. [Types of indexes (primary, secondary, compound)](#types)
5. [Why use indexes](#why)
6. [Downsides + why inserts get slower](#downsides)
7. [How data is stored: heap vs index (the clarification)](#storage)
8. [Interview extras](#extras)
9. [Interview questions & answers](#interview)
10. [Cheat Sheet — everything on one page](#cheatsheet)

---

<a name="core"></a>
# 1. Core idea

**An index is a separate data structure that lets the database find rows quickly without scanning the entire table.**

> **Book-index analogy** 📖: Want every mention of "caching"? Without the book's index, flip through **every page** (slow). With it, jump to "caching → pages 42, 87, 150" instantly. The index is a *sorted, separate* structure pointing to where the real content lives.
>
> The trade-off is in the analogy too: the index **takes extra pages** (storage), and adding a chapter means **updating the index** (slower writes).

---

<a name="behind"></a>
# 2. Behind the scenes: without vs with an index

Table: `users` with **1,000,000 rows**. Query:
```sql
SELECT * FROM users WHERE email = 'alice@mail.com';
```

## WITHOUT an index — a "full table scan"
No idea where Alice is → check **every row** top to bottom.
```
Row 1     → not Alice
Row 2     → not Alice
...
Row 847,203 → ✅ found Alice!
...often continues to the end to be sure
```
- Checks up to **1,000,000 rows**.
- **O(n)** — linear. Double the rows → double the time.
- Can take **seconds**. 🐌

## WITH an index on `email`
A **sorted structure** (B-tree) of emails, each pointing to its row → **binary-search-like** narrowing.
```
Is 'alice@mail.com' <, =, or > the middle value?
   → jump left or right → repeat → found in a handful of steps
```
- Finds Alice in ~**20 steps** (log₂ of 1,000,000 ≈ 20).
- **O(log n)** — logarithmic. 1B rows → only ~30 steps.
- Takes **milliseconds**. ⚡

## Comparison
| | Without index | With index |
|---|---|---|
| Method | Full table scan | Index lookup (binary-search-like) |
| Rows examined (1M) | ~1,000,000 | ~20 |
| Time complexity | **O(n)** linear | **O(log n)** logarithmic |
| Speed | Seconds 🐌 | Milliseconds ⚡ |

---

<a name="btree"></a>
# 3. How indexes work: the B-tree

Most indexes are a **B-tree** (technically **B+ tree** in MySQL/InnoDB, PostgreSQL).

**A B-tree is a balanced, sorted tree that keeps data ordered, allows fast lookups, and stays shallow even with millions of rows.**
```
                        [ M ]                 ← root (start here)
                   /            \
              [ D | H ]        [ R | W ]       ← internal nodes (navigation)
             /    |    \        /    |    \
        [A B C][E F G][I..L] [N..Q][S..V][X Y Z]  ← leaf nodes (sorted, point to rows)
```
**Key properties:**
- **Sorted** — supports range queries (`age > 25`), not just exact matches.
- **Balanced** — every leaf same depth → every lookup takes the same small number of steps.
- **Shallow & wide** — many keys per node → a billion rows is only a few levels deep → a few hops per lookup. (This is what gives O(log n).)

**Interview note:** B-trees handle **equality AND range** (`=`, `<`, `>`, `BETWEEN`, sorting). A **hash index** is O(1) for *exact* matches but **useless for ranges** — so B-trees are the default general-purpose choice.

---

<a name="types"></a>
# 4. Types of indexes

## 1. Primary index (clustered)
Built on the **primary key** (e.g. `id`). Usually **clustered** — it sets the **physical order** rows are stored on disk.
```
Clustered (primary) index — the table IS sorted by this key:
   id=1 → [row data for 1]
   id=2 → [row data for 2]
   id=3 → [row data for 3]     ← the leaf nodes ARE the actual rows
```
- **One per table** (data can only be physically sorted one way).
- Very fast for primary-key lookups and ranges.
- Auto-created with the primary key.

## 2. Secondary index (non-clustered)
On a **non-primary column** (e.g. `email`). A **separate** structure pointing *back* to the row.
```
Secondary index on email — separate structure:
   alice@mail.com → points to id=847203 → then fetch that row
   bob@mail.com   → points to id=12
```
- **Many allowed per table.**
- Slightly slower than clustered (extra hop: index → primary key → row).
- What you create for columns you frequently search/filter by.

## 3. Compound index (composite / multi-column)
On **two or more columns together**, e.g. `(last_name, first_name)`.
```sql
CREATE INDEX idx_name ON users (last_name, first_name);
```
Sorted by `last_name` **first**, then `first_name` within each — like a phone book (surname, then given name).

### ⚠️ The leftmost-prefix rule (interview gotcha)
Index on `(last_name, first_name)` serves queries using:
- ✅ `last_name` alone
- ✅ `last_name` AND `first_name`
- ❌ `first_name` **alone** — useless!

> **Why:** sorted by `last_name` first. Searching `first_name` alone is like using a phone book to find everyone named "John" regardless of surname. **Column order matters** — put the most-filtered column (and equality before range) first.

---

<a name="why"></a>
# 5. Why use indexes (benefits)

1. **Dramatically faster reads** — O(n) → O(log n).
2. **Faster filtering & sorting** — `WHERE`, `ORDER BY`, `GROUP BY` on indexed columns.
3. **Faster JOINs** — indexing foreign keys speeds joins (Part 8).
4. **Enforce uniqueness** — a **unique index** guarantees no duplicate emails.
5. **Range queries** — B-trees handle `BETWEEN`, `>`, `<` efficiently.

---

<a name="downsides"></a>
# 6. Downsides + why inserts get slower

Indexes are **not free**.

## 1. Extra storage
Each index is a **separate structure** on disk. Index many columns → DB can be **bigger than the actual data**.

## 2. Slower writes (INSERT / UPDATE / DELETE) — the key trade-off
An INSERT doesn't just add the row — it must **also update every index** to keep them sorted.
```
INSERT new user (email = 'zara@mail.com'):
  1. Add the row to the table                              ✅
  2. Update the email index      → find sorted spot, insert  🐌
  3. Update the last_name index  → find sorted spot, insert  🐌
  4. Update the created_at index → find sorted spot, insert  🐌
  ... one extra update PER index
```
- With **5 indexes**: one insert = **1 row write + 5 index updates** (+ possible B-tree rebalancing).
- **UPDATE** to an indexed column and **DELETE** are similar — every affected index maintained.

> **One-line answer to "why do inserts get slower?":** *every index must be kept sorted and up-to-date on every write, so each additional index adds work to every insert, update, and delete.*

## 3. The core trade-off
> **Indexes speed up reads but slow down writes.** More indexes = faster queries, slower inserts + more storage. **Don't index everything** — index the columns you actually search/filter/join on.
>
> Write-heavy tables (logging) → **few** indexes. Read-heavy tables (catalog) → **more**. (Echoes the read-heavy/write-heavy theme from Parts 1–3.)

---

<a name="storage"></a>
# 7. How data is stored: heap vs index (the clarification)

**Confusion cleared up:** "When a table isn't indexed, is it stored as-is? And when I index a column, does the *table* become a tree?"

## Unindexed table = a HEAP (unordered pile)
Stored **as-is, no particular order** — rows dumped wherever there's room.
```
HEAP (unindexed table) — just a pile, no order:
┌──────────────────────────────────┐
│ [Bob]  [Zara]  [Alice]  [Carol]   │   ← rows sit wherever there was room
│ [Dan]  [Eve]   [Frank]  [Grace]   │
└──────────────────────────────────┘
   Find "Alice" → check every row (full table scan)
```

## Key correction: the TABLE does NOT become a tree
Adding a (secondary) index does **not** reorganize the table. The table **stays a heap**; the index is a **separate structure** next to it, holding only **the indexed column + a pointer** back to the row.
```
TABLE (heap — UNCHANGED)              SEPARATE INDEX on "name" (a B-tree)
┌──────────────────────────┐
│ #1 [Bob]                 │◀─────┐
│ #2 [Zara]                │◀───┐ │           [ Carol ]
│ #3 [Alice]               │◀─┐ │ │          /        \
│ #4 [Carol]               │  │ │ │   [Alice]#3        [Zara]#2
│ #5 [Dan]                 │  │ │ └──────▶ \            /
└──────────────────────────┘  │ │        [Bob]#1   [Dan]#5
   leaves point back to rows ─┘ └──────────
```
Query `WHERE name = 'Alice'`:
1. Search the **separate index tree** → find "Alice" fast.
2. Index entry says *"row #3."*
3. Jump to **row #3** in the heap, grab the full row.

> The table is untouched. The index is an *additional* structure to *locate* rows. This is exactly why indexes cost **extra storage** and **slow writes**.

## The one exception: clustered (primary) index
A **clustered index** (usually the primary key) **does** physically sort the *table itself* → the table *becomes* the B-tree. That's why there's **only one clustered index per table** (data can be sorted one way only). Every other index is the separate side-structure above.

| | How it's stored |
|---|---|
| **No index** | Heap — unordered pile. Find = scan everything. |
| **Secondary index** (e.g. `email`) | Table stays a heap; a **separate** B-tree points back to rows. |
| **Clustered / primary index** | The **table itself** is organized as a B-tree, sorted by that key. One per table. |

## Small but important: B-tree, NOT binary tree
- **Binary tree** = at most **2 children** per node → deep.
- **B-tree** = **many** keys/children per node → wide & shallow.
```
Binary tree:  each node → 2 children      B-tree: each node → MANY keys/children
     [M]                                    [ D | H | M | R | W ]
    /   \                                   /   |   |   |   |   \
  [D]   [R]                              (many wide branches, very shallow)
```
> **Why B-tree, not binary?** Databases live on **disk** (slow reads). A wide B-tree is **shallow** — a billion rows in ~4 levels → ~4 disk reads. A binary tree would be ~30 levels → ~30 disk reads. The search *behaves* like binary search (narrowing each step), but the *structure* is wide and shallow.

---

<a name="extras"></a>
# 8. Interview extras (things that impress)

### Cardinality — index high-cardinality columns
**Cardinality = number of distinct values.**
- **High** (email, user_id — mostly unique) → **great** index; narrows fast.
- **Low** (gender, boolean — few values) → **poor** index; each value still matches ~half the table.

### Covering index
If an index contains **all columns a query needs**, the DB answers **entirely from the index** — no hop to the table. Called a **covering index**.

### When NOT to index
- Small tables (scan is already fast).
- Write-heavy tables (write speed > read speed).
- Low-cardinality columns.
- Columns rarely queried (unused index = pure cost).

### Clustered vs non-clustered (crisp)
- **Clustered** = table physically sorted by this index; leaves *are* the rows; **one per table**.
- **Non-clustered (secondary)** = separate structure pointing to rows; **many per table**.

---

<a name="interview"></a>
# 9. Interview questions & answers

### Q: "What is a database index and why use one?"
> *"An index is a separate, sorted data structure — usually a B-tree — that lets the database find rows without scanning the whole table. It's like the index at the back of a book: instead of flipping through every page, you jump straight to the right one. It turns a lookup from O(n), a full table scan, into O(log n), so queries go from seconds to milliseconds on large tables."*

### Q: "What happens without an index?"
> *"A full table scan — the database checks every row until it finds matches. On a million-row table that's up to a million comparisons, O(n), which can take seconds. An index avoids that by keeping values sorted so the database jumps to the answer in a handful of steps."*

### Q: "Why a B-tree?"
> *"Because it keeps data sorted and balanced, so every lookup takes the same small number of steps — a few hops even for millions of rows, giving O(log n). And being sorted, it handles range queries and ordering, not just exact matches — unlike a hash index, which is O(1) for equality but useless for ranges."*

### Q: "Primary vs secondary index?"
> *"A primary index is on the primary key and usually clustered — it sets the physical order of rows on disk, one per table. A secondary index is on a non-primary column like email; it's a separate structure pointing back to the row, and you can have many. Secondary lookups have one extra hop — index to primary key to row."*

### Q: "If indexes make reads faster, why not index every column?"
> *"Because indexes slow writes and cost storage. Every insert, update, or delete must update every index to keep them sorted, so more indexes mean slower writes. And each index is a separate structure on disk. So I index the columns I actually query, filter, or join on — especially high-cardinality ones — and leave the rest, particularly on write-heavy tables."*

### Q: "Why do inserts get slower with more indexes?"
> *"Because an insert isn't just adding the row — the database also inserts the new value into every index in the correct sorted position, sometimes rebalancing the B-tree. With five indexes, one insert becomes one row write plus five index updates. Updates and deletes are the same for every affected index."*

### Q: "Compound index on (last_name, first_name) — which queries use it?"
> *"Queries filtering by last_name alone, or last_name and first_name together. Filtering by first_name alone won't use it, because the index is sorted by last_name first — the leftmost-prefix rule. It's like a phone book sorted by surname: great for a surname, useless for a given first name. So column order matters."*

---

<a name="cheatsheet"></a>
# 10. Cheat Sheet — everything on one page

### Core
- **Index** = separate sorted structure (B-tree) to find rows without scanning. Like a book's index.
- **Without index** = full table scan, **O(n)** (check every row), seconds.
- **With index** = binary-search-like lookup, **O(log n)** (few hops), milliseconds.

### B-tree
- Balanced, sorted, wide & shallow → few hops even for billions of rows.
- Handles equality AND range/sort. (Hash index = O(1) equality but no ranges.)
- **B-tree ≠ binary tree** — B-tree nodes have MANY children (shallow, fewer disk reads).

### Types
| Type | What | Count |
|---|---|---|
| **Primary (clustered)** | On primary key; sets physical row order; leaves = rows | One per table |
| **Secondary (non-clustered)** | On other columns; separate structure → points to rows | Many |
| **Compound** | Multiple columns, sorted left-to-right | Many |
- **Leftmost-prefix rule:** `(a, b)` serves `a` and `a,b` — NOT `b` alone. Column order matters.

### Storage model
- **No index** → heap (unordered pile).
- **Secondary index** → table stays a heap; separate B-tree points back to rows (table UNCHANGED).
- **Clustered index** → the table itself is sorted into a B-tree (one per table — the exception).

### Benefits
Faster reads · faster WHERE/ORDER BY/GROUP BY · faster JOINs · uniqueness · range queries.

### Downsides
- **Storage** — each index is a separate on-disk structure.
- **Slower writes** — every INSERT/UPDATE/DELETE updates EVERY index (+ rebalancing).
- → Index only what you query; write-heavy tables = few indexes.

### Why inserts slow down
Insert = 1 row write + 1 update per index (find sorted spot + maybe rebalance). N indexes = N extra writes per insert.

### Interview extras
- **Cardinality** — index high-cardinality (email); skip low (boolean/gender).
- **Covering index** — index has all needed columns → answer without touching table.
- **Don't index:** small tables, write-heavy tables, low-cardinality, rarely-queried columns.

### Connects to
- Part 8: SQL tables, JOINs (index foreign keys), primary keys. · Parts 1–3: read-heavy vs write-heavy trade-off.

### Suggested next topics
- **Message queues** (async, decoupling, spikes).
- **API design** (REST vs GraphQL, rate limiting).
- **Full system design walkthrough** (e.g. URL shortener — ties all parts together).

*— End of Part 9 —*
