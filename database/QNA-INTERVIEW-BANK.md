# 🟦 Database Interview Question Bank — Answered

> **How to use:** cover the answer, say yours out loud, then compare. Speaking finds gaps that reading hides.
>
> Answers are the *spoken* version, not the essay. Sections link to the note that explains them properly.
>
> **~146 questions · 20 sections**

---

## Sections

| | Topic | Note |
|---|---|---|
| 1 | [SQL Basics](#s1) | [Part 00](00-sql-basics.md) |
| 2 | [Joins](#s2) ⭐ | [Part 01](01-joins.md) |
| 3 | [SQL Indexes](#s3) ⭐ | [Part 02](02-sql-indexes.md) |
| 4 | [Query Optimization & EXPLAIN](#s4) ⭐ | [Part 03](03-query-optimization-and-explain.md) |
| 5 | [Transactions & ACID](#s5) ⭐ | [Part 04](04-transactions-and-acid.md) |
| 6 | [Foreign Keys & Cascading](#s6) | [Part 04.5](04.5-foreign-keys-and-cascading.md) |
| 7 | [MongoDB Fundamentals](#s7) | [Part 05](05-mongodb-fundamentals.md) |
| 8 | [MongoDB Indexes](#s8) | [Part 06](06-mongodb-indexes.md) |
| 9 | [Populate & the N+1 Problem](#s9) ⭐ | [Part 07](07-populate-and-n-plus-1.md) |
| 10 | [Aggregation Pipeline](#s10) | [Part 08](08-aggregation-pipeline.md) |
| 11 | [Embedding vs Referencing](#s11) ⭐ | [Part 09](09-embedding-vs-referencing.md) |
| 12 | [Pagination](#s12) | [Part 10](10-pagination.md) |
| 13 | [Redis Basics & Caching](#s13) ⭐ | [Part 11](11-redis-basics-and-caching.md) |
| 14 | [Connection Pooling](#s14) | [Part 12](12-connection-pooling.md) |
| 15 | [Replication](#s15) | [Part 13](13-replication.md) |
| 16 | [Sharding](#s16) ⭐ | [Part 14](14-sharding.md) |
| 17 | [MongoDB Transactions & Concurrency](#s17) ⭐ | [Part 15](15-mongodb-transactions-and-concurrency.md) |
| 18 | [Advanced SQL](#s18) | [Part 16](16-advanced-sql.md) |
| 19 | [Advanced Indexing & Partitioning](#s19) | [Part 17](17-advanced-indexing-and-partitioning.md) |
| 20 | [SQL vs NoSQL — the Decision](#s20) ⭐ | [Part 20](20-sql-vs-nosql-comparison.md) |

---

<a name="s1"></a>
# 1. SQL Basics

### What order does SQL actually execute in?
Not the order it's written. Written order is `SELECT → FROM → WHERE → GROUP BY → HAVING → ORDER BY → LIMIT`; execution order is `FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT`. The engine has to know which rows exist, then which survive filtering, then how they're bucketed, before it can figure out what to project — `SELECT` runs almost last.

### Why can't you reference a SELECT alias in a WHERE clause?
Because `WHERE` executes before `SELECT` does, so the alias hasn't been computed yet at that point.
```sql
SELECT amount * 1.1 AS total FROM orders WHERE total > 100;  -- ❌ total doesn't exist yet
SELECT amount * 1.1 AS total FROM orders ORDER BY total;     -- ✅ ORDER BY runs after SELECT
```

### WHERE vs HAVING — what's the real difference?
It's timing, not "columns vs aggregates." `WHERE` filters raw rows before grouping happens; `HAVING` filters the groups that result after `GROUP BY` has already aggregated. You need `HAVING` specifically when the condition depends on an aggregate value — like `SUM(amount) > 1000` — that doesn't exist until grouping has happened.

### When would COUNT(*) and COUNT(column) give different numbers?
Whenever that column has `NULL`s. `COUNT(*)` counts every row regardless of content; `COUNT(column)` only counts rows where that specific column is non-null. If you want a true row count, use `COUNT(*)` — `COUNT(some_column)` silently undercounts the moment that column can be null.

### DISTINCT vs GROUP BY — when does the choice actually matter?
For a plain "list the unique values" query they produce identical output. They diverge the moment you need an aggregate alongside the grouping — `DISTINCT` has no mechanism to attach a `COUNT` or `SUM` per bucket, only `GROUP BY` can bucket rows so an aggregate function runs per bucket.

### How do aggregate functions handle NULL?
Every one of them — `COUNT`, `SUM`, `AVG`, `MIN`, `MAX` — skips `NULL` values entirely rather than treating them as zero. `AVG` in particular excludes null rows from both the numerator and the denominator, not just the sum.

### What happens when you use an aggregate function with no GROUP BY?
The entire table is treated as one group. `SELECT AVG(amount) FROM orders` returns a single number — the average across every row — because with nothing to bucket by, there's implicitly exactly one bucket.

### Why does this written-vs-executed order gap exist in the first place?
Because `SELECT` is just shaping output — deciding what to *project* — and the engine can't decide what to project until it knows which rows and groups actually survived everything upstream. Writing `SELECT` first is for human readability; the database still has to resolve `FROM`/`WHERE`/`GROUP BY`/`HAVING` first to know what `SELECT` even has to work with.

---

<a name="s2"></a>
# 2. ⭐ Joins

### What are the SQL join types?
`INNER JOIN` — only rows matching on both sides. `LEFT JOIN` — every row from the left table, with `NULL` in unmatched right-side columns. `RIGHT JOIN` — the mirror of `LEFT`, rare in practice since it's usually rewritten as a `LEFT JOIN` with the tables swapped. `CROSS JOIN` — every row of A paired with every row of B, a full Cartesian product with no `ON` clause.

### LEFT JOIN vs INNER JOIN — give a concrete case where the row count differs.
Customers table with 100 rows, 20 of whom never placed an order. `INNER JOIN` against orders returns only the 80 who ordered something — the other 20 vanish from the result entirely. `LEFT JOIN` (customers as the left table) keeps all 100, with `NULL` in the order columns for the 20 with no match. This is the canonical example interviewers use to test real understanding versus recitation.

### What's a SELF JOIN, and when would you use one?
Not a distinct keyword — any join where a table is joined to itself using two aliases. Classic case: an `employees` table where each row has a `manager_id` pointing at another row's `id`.
```sql
SELECT e.name AS employee, m.name AS manager
FROM employees e LEFT JOIN employees m ON e.manager_id = m.id;
```

### Why LEFT JOIN and not INNER JOIN for the employee/manager self join?
Because the CEO's `manager_id` is `NULL` — an `INNER JOIN` would drop the CEO from the result entirely instead of showing them with a `NULL` manager. Same underlying reasoning as the customers-with-zero-orders case.

### At a high level, how does the database actually execute a join?
One of three strategies, picked by the optimizer based on table size and available indexes. **Nested loop** — for each row in A, scan B for matches; fine when small or B is indexed on the join column. **Hash join** — build an in-memory hash table on the smaller side's join key, probe it with the larger side; good with no index and enough memory. **Merge join** — both sides pre-sorted on the join key, zippered together.

### What usually causes a slow join?
An unindexed join column, which forces the slow nested-loop path scanning an unsorted table. Adding an index on the foreign key column is usually the first fix to reach for — you don't need to reimplement a query planner in an interview, just recognize this pattern.

### What's a CROSS JOIN, and when do you actually see one?
Every row of table A paired with every row of table B — a full Cartesian product, no `ON` clause. Rare intentionally; usually you see it by accident when someone forgets a join condition, producing a result set of size `rows(A) × rows(B)`.

### Why is RIGHT JOIN rarely used in practice?
Because it's just a `LEFT JOIN` with the table order flipped, and most people standardize on writing `LEFT JOIN` for consistency and readability rather than switching join direction mid-query.

### How do MongoDB's populate() and $lookup compare to a SQL JOIN?
They're the closest equivalents but not first-class the same way — SQL joins are native and tuned by decades of optimizer work, while `$lookup` runs inside an aggregation pipeline and `populate()` is an application-level batched query. Full comparison in [Part 20](20-sql-vs-nosql-comparison.md).

---

<a name="s3"></a>
# 3. ⭐ SQL Indexes

### Why do indexes exist, and why aren't they free?
Without one, finding a row means a full table scan — O(n). An index is a separate, ordered structure mapping column values to row locations, turning that into O(log n). The cost: every `INSERT`/`UPDATE`/`DELETE` touching that column has to update the index too, plus disk space — indexing is a deliberate per-query-pattern decision, not a default reflex.

### Why B-Tree specifically, and not a plain binary tree?
A B-Tree node holds many keys per disk page, not just one, so a lookup touches far fewer disk pages than a binary tree would for the same key count. The structure is shaped around minimizing disk I/O — the expensive operation — not around minimizing comparisons in memory. Balanced, so lookup/insert/delete are O(log n) worst case, not just average.

### What's the left-most prefix rule for composite indexes?
A composite index on `(last_name, first_name)` is sorted by `last_name` first, then `first_name` within each `last_name` group — like a phone book. It can serve a query filtering on `last_name` alone, or `last_name AND first_name` together, but **not** a query filtering on `first_name` alone, since the index isn't independently sorted by that column.

### Why does composite index field order matter?
Because the physical sort order is fixed at creation time — first column, then second within it. Put the column with the most selective or most frequently used equality filter first; filtering only on the second column skips the sorted structure entirely and can't use the index at all.

### What's a covering index?
One where every column the query needs — both filtered and selected — exists in the index itself, so the database never has to jump back to the actual table row.
```sql
CREATE INDEX idx_email_name ON users (email, name);
SELECT name FROM users WHERE email = 'a@x.com';  -- fully covered
```
Selecting a column not in the index forces an extra round-trip from the index entry back to the row — a covering index avoids that entirely.

### Clustered vs non-clustered index — what's the actual difference?
Clustered: the table's rows are physically stored in this index's order — only one per table, usually the primary key, and looking it up *is* looking at the data. Non-clustered: a separate structure pointing back to where the row lives — many allowed per table. The difference shows up on range scans: clustered reads contiguous physical rows; non-clustered follows a pointer back per match, unless it's also covering.

### Give the standard reasons an index isn't being used.
A leading wildcard `LIKE '%smith'` (no prefix to seek to — a B-Tree is sorted left-to-right); a function wrapped around the indexed column like `WHERE YEAR(created_at) = 2024` (the index stores raw values, not the function's output); wrong left-most-prefix order on a composite index; or — legitimately — the optimizer decided a full scan is cheaper because the query returns too large a fraction of the table.

### How would you fix `WHERE YEAR(created_at) = 2024` not using an index?
Rewrite it as a range instead of wrapping the column in a function: `WHERE created_at >= '2024-01-01' AND created_at < '2025-01-01'`. The raw column value is what's indexed, so a range comparison against it can seek directly; the function's output was never indexed at all.

### Do MongoDB indexes work the same way?
Same underlying B-Tree structure and the same left-most-prefix rule for compound indexes — the concept transfers directly, see [Part 06](06-mongodb-indexes.md). Full SQL vs NoSQL comparison → [Part 20](20-sql-vs-nosql-comparison.md).

---

<a name="s4"></a>
# 4. ⭐ Query Optimization & EXPLAIN

### What does EXPLAIN actually show you?
What the database plans to do to answer the query — which index (if any) it uses, join order, and an estimated row count at each step. It's the difference between guessing why a query is slow and actually seeing it.
```sql
EXPLAIN SELECT * FROM orders WHERE customer_id = 42;
```

### How do you spot a full table scan in EXPLAIN output?
By access type — MySQL shows `type: ALL`, MongoDB's `.explain()` shows `stage: "COLLSCAN"` vs `"IXSCAN"` for an actual index scan. Seeing `ALL`/`COLLSCAN` on a query that's supposed to be selective — `WHERE customer_id = 42` on a million-row table — is the red flag that starts the investigation.

### What's the single strongest smell in EXPLAIN output that something's wrong?
A huge gap between rows examined and rows returned. If the engine is scanning a hundred thousand rows to return twenty, it's doing far more work than the result size justifies — regardless of what access type it says it's using.

### Is a full table scan in EXPLAIN always a problem?
No, and this is the distinction that separates a junior answer from a senior one. If a query returns a large fraction of the table (roughly 20-30%+, engine-dependent), a sequential scan can genuinely be cheaper than an index scan — index scans mean random I/O jumping around the table, while a sequential scan reads everything in one pass. The optimizer bases this on table statistics; a *bad* decision is more often stale statistics than the concept being wrong.

### Walk through diagnosing a slow API endpoint, database-side.
Reproduce with `EXPLAIN` on the actual query at realistic data volume — plans change with table size. Check access type for an unexpected full scan. Compare rows examined to rows returned. If an index exists but isn't used, check the usual culprits (leading wildcard, function on the column, wrong composite order). If no index exists, weigh adding one against its write cost. If the plan looks right and it's still slow, look wider — N+1 queries, connection pool exhaustion, genuine data growth needing partitioning or sharding.

### Why does EXPLAIN need realistic data volume, not a small dev dataset?
Because the optimizer's plan choice depends on table statistics — at ten rows a full scan is fine and might even be chosen over an index; at ten million rows the same query needs an index seek. Running `EXPLAIN` against a tiny dataset can validate a plan that falls apart in production.

### What causes the optimizer to make a genuinely bad scan-vs-index decision?
Stale statistics — the optimizer's cost estimates are based on table statistics it tracked at some point, and if the data has changed significantly since (a table that grew 100x, a column's value distribution that shifted), those estimates go wrong and the optimizer chooses badly based on outdated assumptions.

### Beyond indexing, what else should you check if the plan looks correct but the endpoint is still slow?
N+1 query patterns (Part 09's populate/N+1), connection pool exhaustion (Part 12), or genuine data-volume growth that needs a structural fix like archiving or sharding rather than a query-level tweak.

---

<a name="s5"></a>
# 5. ⭐ Transactions & ACID

### Explain ACID with a concrete example per letter.
**Atomicity** — transferring money: debit A and credit B either both happen or neither does. **Consistency** — a `CHECK` constraint that balance can't go negative rejects a violating transaction outright rather than partially applying it. **Isolation** — two people booking the last seat simultaneously don't both succeed; one can't see the other's in-flight change. **Durability** — once the transfer commits and the app gets a success response, a crash a second later doesn't lose it.

### COMMIT vs ROLLBACK — what do they actually do?
`COMMIT` makes every change in the transaction permanent and visible to other transactions. `ROLLBACK` discards everything since `BEGIN`, as if none of it happened — this is what makes atomicity enforceable at the application level: catch the error, roll back, and the partial debit never happened.

### What are the isolation levels, weakest to strongest?
**Read Uncommitted** — prevents nothing. **Read Committed** — prevents dirty reads. **Repeatable Read** — prevents dirty and non-repeatable reads (MySQL's InnoDB also blocks most phantoms here, a known engine deviation from the standard). **Serializable** — prevents all three, transactions behave as if run one at a time.

### What's the trade-off of stronger isolation?
More locking and blocking, so lower concurrency throughput. Most applications default to Read Committed (Postgres, Oracle) or Repeatable Read (MySQL/InnoDB) — `Serializable` is reserved for genuinely correctness-critical sections, not used as a blanket default, precisely because of that throughput cost.

### Dirty read vs non-repeatable read vs phantom read — what's the actual distinction?
Dirty read: you read data another transaction wrote but hasn't committed — if it rolls back, you acted on data that never really existed. Non-repeatable read: you read the *same row* twice in one transaction and get *different values* because another transaction committed an update in between. Phantom read: you run the *same query* twice and the *set of rows* changes — new rows appear or vanish — because another transaction inserted or deleted matching rows in between.

### Why use a transaction — walk through what breaks without one.
A money transfer is two separate statements: debit A, credit B. Without a transaction wrapping both, a crash or failure between the two leaves an impossible state — A lost 100, B never received it, with no record of where it went. `BEGIN`/`COMMIT`/`ROLLBACK` makes that failure state impossible: either both statements land or neither does, with no observable in-between.

### What does a dirty read actually look like in practice?
Transaction A reads a balance transaction B just updated but hasn't committed. If B then rolls back, A made a decision — say, approving a withdrawal — based on data that, from the database's permanent history, never actually existed.

### When should you actually use a transaction?
Whenever multiple writes must succeed or fail together as one logical unit — not for single-statement operations, which are already atomic on their own without wrapping anything.

### See also
[Part 04.5](04.5-foreign-keys-and-cascading.md) covers the other database-enforced integrity mechanism (foreign keys); [Part 15](15-mongodb-transactions-and-concurrency.md) covers how MongoDB's transaction model differs from SQL's ACID-by-default baseline.

---

<a name="s6"></a>
# 6. Foreign Keys & Cascading

### What does a foreign key actually enforce?
That a column's value must exist as a primary/unique key value in another table — the database-level mechanism for referential integrity.
```sql
FOREIGN KEY (customer_id) REFERENCES customers(id)
```
Without it, nothing stops an `orders` row from having a `customer_id` that points at no one — an orphaned reference, silently wrong until something tries to join against it and gets nothing back.

### What are the cascading options for ON DELETE / ON UPDATE?
`CASCADE` — delete (or update) child rows automatically along with the parent. `SET NULL` — null out the child's foreign key instead of deleting it. `RESTRICT` (the usual default) — block the parent delete/update entirely if children still reference it. `NO ACTION` — similar to `RESTRICT` but checked at the end of the statement rather than immediately.

### CASCADE vs RESTRICT — when would you choose each?
`CASCADE` for genuine parent-owns-child relationships where child data is meaningless without the parent — deleting a blog post reasonably deletes its comments. `RESTRICT` (or `SET NULL` plus soft deletes) for relationships where the child has independent value that should survive — order history when a customer account is deleted, usually for compliance reasons.

### Why is ON DELETE CASCADE risky in production?
A single `DELETE` can silently ripple through many related tables, especially once cascades chain — A cascades into B, which itself cascades into C — deleting far more than the person running it realizes, with no confirmation step and no dry-run by default.

### What's a common safer pattern than a hard cascading delete?
Soft deletes — an `is_deleted`/`deleted_at` column instead of an actual `DELETE`. It sidesteps the cascading-delete danger entirely, at the cost that every query now has to remember to filter out soft-deleted rows.

### How does MongoDB handle what a foreign key + cascade handles in SQL?
It doesn't, at the database level — there's no FK constraint mechanism at all, so referential integrity is entirely the application's responsibility. Embedding (Part 09) sidesteps the problem for owned relationships, since deleting the parent document deletes the "children" with it automatically. For referenced relationships, cascading has to be done explicitly in application code, a multi-document transaction, or via change streams.

### Why does a foreign key matter even though it slows down deletes with checks?
Because the alternative — an orphaned reference — is worse: silently wrong data discoverable only when something later tries to join and gets nothing back. Catching it at write time, immediately, is strictly better than discovering it downstream in production.

### Would you use CASCADE for financial or audit data?
No — deleting a customer shouldn't silently delete their historical order records, which often need to be retained for compliance regardless of whether the account still exists. `RESTRICT`, or `SET NULL` combined with soft deletes, is the safer default there.

---

<a name="s7"></a>
# 7. MongoDB Fundamentals

### What's a document, and what's a collection?
A document is a single record — a BSON object with fields and values, can nest objects and arrays. A collection is a group of documents, roughly SQL's "table," except it has no enforced schema: two documents in the same collection can have completely different fields.

### What's actually different between BSON and JSON?
BSON is binary-encoded and adds types JSON can't express natively — a real `Date` type, native binary data (`BinData`), and distinct numeric types (`Int32`, `Int64`, `Double`, `Decimal128`) instead of one generic "number." Practically: a JS `Date` sent through the driver round-trips as a real date you can query/sort/range-filter, not a string you have to reparse.

### What's actually inside an ObjectId?
12 bytes: a 4-byte timestamp (seconds since epoch), a 5-byte random value fixed per process, and a 3-byte incrementing counter.

### Why can you sort by _id as a rough substitute for creation time?
Because the timestamp is the leading bytes of the ObjectId, sorting by `_id` gives roughly-correct insertion order without needing a separate `createdAt` field or index — not exact to the millisecond (only 1-second resolution), but good enough that it's a common cheap substitute.
```js
db.orders.find().sort({ _id: -1 }).limit(10)  // roughly "10 most recent"
```

### What happens if you forget $set in an update?
If you pass a plain object instead of wrapping it in `$set`, MongoDB replaces the **entire document** with that object — every field not included is silently dropped. Same footgun shape as forgetting `WHERE` on a SQL `UPDATE`, but worse in effect since it's a full replace, not just a wider blast radius.

### find() vs findOne() — what's the actual difference?
`find()` returns a lazy **cursor** — it doesn't load everything into memory at once. `findOne()` returns a single document directly.

### Why MongoDB over a relational database, honestly?
Schema flexibility and a natural fit for nested, document-shaped data — genuinely useful when the schema is still evolving or your objects are naturally hierarchical. Not "it's just more scalable," which reads as marketing rather than engineering judgment.

### What's the real trade-off of choosing MongoDB?
Losing native joins. `$lookup` exists inside an aggregation pipeline and can do left-outer-join-like work, but it's not first-class the way SQL `JOIN` is, and it hasn't had decades of optimizer tuning. Data modeling shifts from "normalize by default" to a deliberate embed-vs-reference decision per relationship — get that wrong and you either duplicate data awkwardly or pay for constant joins.

### What's the practical risk of MongoDB's schema flexibility?
Nothing stops inconsistent documents from accumulating in the same collection unless the application — or a schema layer like Mongoose — enforces structure. The flexibility is the whole pitch and the whole risk at the same time.

---

<a name="s8"></a>
# 8. MongoDB Indexes

### What index types does MongoDB support?
Single-field (same B-Tree concept as SQL), compound (same left-most-prefix logic as SQL composite indexes), text (full-text `$text` search, only one allowed per collection), and TTL (`expireAfterSeconds` — auto-deletes documents once that much time has passed since the indexed date field).

### What's a TTL index actually for?
Automatic self-expiry with no manual cleanup job — session data, verification codes, or any record that should disappear on its own after a fixed window.
```js
db.sessions.createIndex({ createdAt: 1 }, { expireAfterSeconds: 3600 })
```

### Does the left-most-prefix rule apply to Mongo compound indexes the same way?
Identically. An index on `{customerId: 1, status: 1}` is physically sorted by `customerId` first, then `status` within it — serves a query filtering on `customerId` alone or `customerId + status`, but not `status` alone.

### What's a covered query in Mongo, and what's the _id gotcha?
Every field the query needs — filter and projection — exists in the index, so MongoDB never fetches the actual document. The gotcha: `_id` is included in results by default even when not projected explicitly, and if `_id` isn't part of the index, that default inclusion forces a document fetch and breaks coverage — you have to explicitly exclude it with `_id: 0`.

### Walk through diagnosing "search by email is slow at 10 million users."
Confirm with `.explain()` that it's showing `"stage": "COLLSCAN"`. Add a single-field index on `email`. Consider `{ unique: true }` if email should be a real identifier, which enforces the constraint at the database level too. Then justify why you're not indexing every field — each index costs write throughput, storage, and RAM.

### Why not just index everything?
Every index costs write throughput (each insert/update maintains N index structures, not one), storage (each index is its own on-disk structure), and memory (indexes need to fit in RAM to stay fast). Indexing is a deliberate trade-off per real query pattern, not a default reflex applied to every field.

### What does MongoDB add on top of SQL's indexing concepts?
TTL and text indexes, with no direct SQL equivalent — everything else (B-Tree structure, left-most-prefix rule, covering queries) transfers directly from [Part 02](02-sql-indexes.md).

---

<a name="s9"></a>
# 9. ⭐ Populate & the N+1 Problem

### What is the N+1 problem, generally?
Not Mongo-specific — the same shape shows up in any ORM's lazy loading (Hibernate, ActiveRecord, Sequelize). One query fetches N parent records; then, for *each* of those N, a separate query fetches its related data. Total: 1 + N queries instead of 1 or 2.
```js
const orders = await Order.find();                     // 1 query
for (const order of orders) {
  order.customer = await Customer.findById(order.customerId);  // N queries
}
```
At 10 orders this is invisible. At 10,000 it's 10,001 round-trips — the single most common cause of a list endpoint that mysteriously slows as data grows.

### Why does populate() avoid N+1, and how would you still create one with it?
`populate()` batches the referenced-document fetch into **one additional query for the whole result set** — `Model.find().populate(...)` is 2 queries total, not N+1. But calling `populate()` (or any fetch) inside a `for` loop over already-fetched parent documents reintroduces the exact same bug — the pattern is what matters, not the tool.
```js
// Still N+1 — populate() called once per order
for (const order of orders) { await order.populate('customerId'); }
```

### populate() vs $lookup — what's actually different?
`populate()` is a Mongoose-level convenience running as a separate, application-orchestrated batched query. `$lookup` runs inside the database as one stage in an aggregation pipeline, in one round-trip, composable with `$match`/`$group`/`$project`. Use `$lookup` when the join needs to participate in further aggregation; use `populate()` for a simpler "attach the related document" case.

### What's .lean(), and when is it safe?
Tells Mongoose to skip hydrating results into full Document instances — you get plain JS objects instead, faster and lighter since Documents carry change-tracking, virtuals, and methods you don't need for a read-only response. Safe for read-only endpoints; unsafe if the returned object gets mutated and saved later expecting real Document behavior.

### When would you avoid populate() entirely?
On write-heavy paths, where the extra read overhead isn't needed. And when you only need one field from the related document — project it (`populate('customerId', 'name')`) rather than pulling the whole related document, or reach for `$lookup` with a `$project` stage if already inside an aggregation.

### Why is populate() described as "batching," not "eliminating" the extra query?
Because it's still a second round-trip to the database — it collects the referenced IDs from the first result set, then runs one more query fetching all of them at once. It replaces N queries with 1 additional query, not zero.

### How would you actually spot an N+1 bug in a real codebase?
An endpoint whose latency scales with the number of returned rows is the symptom — a list of 10 is fast, a list of 10,000 is slow, and the ratio tracks row count rather than data volume. Looking for `await` calls inside a loop over an already-fetched array is the concrete code smell.

---

<a name="s10"></a>
# 10. Aggregation Pipeline

### What is an aggregation pipeline, conceptually?
An array of stages, each taking the previous stage's output as its input. Conceptually identical to `.filter().map().sort()` chaining in JS, just running inside the database across documents rather than in application memory.
```js
db.orders.aggregate([
  { $match: { status: "completed" } },
  { $group: { _id: "$customerId", total: { $sum: "$amount" } } },
  { $sort: { total: -1 } }
])
```

### What do the core stages actually do?
`$match` filters — SQL's `WHERE`. `$group` buckets and aggregates — SQL's `GROUP BY`. `$project` reshapes fields — SQL's `SELECT`. `$sort` orders — SQL's `ORDER BY`. `$lookup` joins in another collection — closest to a `LEFT JOIN`. `$unwind` deconstructs an array field into one document per element.

### Why should $match come first when possible?
It shrinks the working set before the expensive stages (`$group`, `$sort`, `$lookup`) ever see the data — grouping and sorting a million documents, then filtering down to a thousand, means all that work happened on 999,000 documents that get thrown away. Bonus: an early `$match` on an indexed field can actually use that index the way a normal `find()` would; a later `$match` generally can't.

### $lookup vs populate() — what's the actual distinction?
`$lookup` runs inside the database as one stage among others in a pipeline — composable with further filtering, grouping, or reshaping in the same round-trip. `populate()` is a Mongoose-level convenience running as a separate, application-orchestrated batched query, simpler but unable to participate in the middle of a broader aggregation.

### What does $unwind do, and when do you need it?
Deconstructs an array field into one document per array element — `{tags: ["a","b"]}` becomes two documents, one with `tags: "a"` and one with `tags: "b"`. Needed before a `$group` that has to aggregate over individual array elements, since `$group` can't reach inside an array on its own.

### Can an early $match actually use an index?
Yes — if it's the first stage in the pipeline and filters on an indexed field, it behaves like a normal indexed `find()`. A `$match` placed after other stages have already reshaped the documents generally loses that ability, since it's no longer operating on the original indexed shape.

### How do the pipeline stages map to SQL, and where does the analogy break down?
`$match`≈`WHERE`, `$group`≈`GROUP BY`, `$project`≈`SELECT`, `$sort`≈`ORDER BY`, `$lookup`≈`JOIN` — but a pipeline is an explicit, ordered sequence of stages you write out, not a declarative query a cost-based optimizer is free to reorder the way SQL's is.

---

<a name="s11"></a>
# 11. ⭐ Embedding vs Referencing

### What actually decides embed vs reference?
Three factors. How often the data is read together with its parent — favors embedding. How large the embedded data could grow unbounded, against MongoDB's hard 16MB document cap — a real production failure mode, not theoretical, and favors referencing past a certain size. How often the sub-data needs to be queried or updated independently of the parent — favors referencing, since embedded sub-documents are awkward to index/query on their own.

### User + Address vs User + Orders — why opposite decisions?
Address is bounded (one per user) and always read together with the user — embed, no real downside. Orders are unbounded over a user's lifetime and frequently queried independently ("find order #101," "today's orders across all customers") — reference, since embedding would risk the size cap and make independent querying awkward.

### Blog + Comments — why does the "right" answer depend?
Low volume, rarely queried independently (a small internal blog) → embedding is fine, one read gets the post plus comments. High volume, or comments need independent querying/moderation (a viral post, an admin querying across all posts) → reference, same reasoning as orders — unbounded growth plus a real need to query the sub-data alone. A credible answer names both branches and the factor that decides between them, not one fixed answer.

### Why can't you just embed chat messages in the conversation document?
Two compounding problems: unbounded growth guaranteed to eventually hit the 16MB cap, and high write volume — every new message would mean rewriting/growing the entire parent document, getting progressively more expensive as history accumulates, versus a cheap `insertOne` into a separate messages collection regardless of how much history already exists.

### What's the actual constraint the 16MB document cap creates?
It turns "how big could this array grow" from a style preference into a hard limit — an array that grows without bound (comments on a post that goes viral, messages in a long-running chat) will eventually hit that ceiling if embedded, and it's a real failure mode, not a theoretical one.

### Why doesn't this embed-vs-reference decision exist in SQL?
Because relational modeling normalizes by default and reassembles related data via joins at query time — there's no single-document size constraint driving a "put it in this row or a separate table" call the way there is in Mongo. Mongo's document model is what makes embed-vs-reference a real, per-relationship engineering choice in the first place.

### If a relationship is genuinely ambiguous, what should you actually say in an interview?
Name the deciding factors explicitly rather than picking a side by instinct — read-together frequency, unbounded-growth risk against the 16MB cap, and independent-query need. Walking through why a case is ambiguous, and which factor would tip it, reads as stronger judgment than a confident wrong answer either way.

---

<a name="s12"></a>
# 12. Pagination

### How does offset pagination work?
```sql
SELECT * FROM posts ORDER BY created_at DESC LIMIT 20 OFFSET 100;   -- page 6
```
Simple to implement and supports "jump to page 7" directly — the appeal is purely UX and implementation simplicity.

### How does cursor pagination work?
Instead of a page number, you pass the last item you saw and ask for "everything after that" — usually `_id` or a timestamp from the previous page's last row.
```js
db.posts.find({ _id: { $lt: lastSeenId } }).sort({ _id: -1 }).limit(20)
```

### Why does offset pagination get slower the deeper you page?
`OFFSET 100` doesn't teleport past the first 100 rows — the database still has to scan and discard them before returning row 101. `OFFSET 100000` scans and throws away 100,000 rows every single time that page is requested; cost grows linearly with depth even though only 20 rows are returned.

### Why is offset pagination incorrect under concurrent writes?
It tracks position by row *count*, not by an actual value. If rows are inserted or deleted between page loads, the page shifts underneath the user — deleting row 15 while someone's on page 2 means what was row 41 shifts into row 40's slot, silently skipping or duplicating rows across page loads.

### Why does cursor pagination stay fast and correct regardless of depth?
`WHERE _id < X` is a direct index seek — the database jumps straight to that point in the sorted index and reads forward, whether that point is row 20 or row 2,000,000 in. It's correct under concurrent writes because the cursor is an actual value ("everything after this point"), not a count — inserts/deletes elsewhere don't shift what "after this point" means.

### What does cursor pagination give up, and when would you still choose offset?
No "jump to page 7" — you can only page forward/backward sequentially from a known cursor, since there's no way to compute "the value at row 140" without effectively counting there. Fine for infinite-scroll feeds; offset remains acceptable for small, rarely-changing datasets where a real numbered-pages UI is a hard requirement.

---

<a name="s13"></a>
# 13. ⭐ Redis Basics & Caching

### Why cache at all?
A cache trades a small staleness risk for a large latency win — reading from Redis (in-memory, sub-millisecond) is orders of magnitude faster than a disk-backed database read, especially for data read far more often than it changes. It also offloads read load from the primary database, which matters as much for protecting the database under traffic as for the requester's latency.

### What's the cache-aside pattern?
Read: check the cache; on a hit return it; on a miss, read the database, write the result into the cache, return it. Write: update the database, then **delete** the cache key.
```js
async function getUser(id) {
  const cached = await redis.get(`user:${id}`);
  if (cached) return JSON.parse(cached);
  const user = await db.users.findById(id);
  await redis.set(`user:${id}`, JSON.stringify(user), 'EX', 3600);
  return user;
}
```
The database is always the source of truth; the cache is disposable and can be wiped and rebuilt with no data loss — that's what makes cache-aside safe.

### Delete vs update on a write — which wins, and why?
Delete. Updating the cache from application code duplicates the exact transformation logic that produced the value, and if that logic ever drifts from what actually got written (a partial update, a derived field, a different code path), the cache silently holds something wrong. Deleting just removes the stale entry — the next read is a guaranteed miss that goes to the actual source of truth and repopulates correctly. Delete-on-write can never encode the update-logic bug that update-on-write can.

### Why keep a TTL even with correct invalidation logic?
TTL is the backstop for invalidation paths you didn't think of — a direct database write that bypassed the app layer, a bug in the invalidation code, a race condition. Without one, a missed invalidation means the data stays wrong forever; with one, staleness self-heals within a bounded window.

### What's a cache stampede, and how do you prevent one?
A popular key expires or is invalidated, and a burst of concurrent requests all miss at the same instant — each one independently hits the database for the same recompute, turning one query into N simultaneous ones, a self-inflicted spike that can take down the database it was meant to protect. Mitigate with locking (first miss recomputes, others wait), request coalescing (dedupe concurrent identical in-flight calls into one), or staggered TTLs (jitter so a batch of keys don't expire in the same instant).

### What makes cache-aside "safe" as a pattern?
The database staying the single source of truth — the cache holds nothing that isn't derivable from the database, so wiping it entirely at any point causes zero data loss, just a temporary wave of cache misses while it repopulates.

### If invalidation and TTL both fail somehow, what's actually at risk?
Serving stale data indefinitely for that key — the whole reason TTL exists as a backstop is that it bounds how long a missed invalidation can stay wrong, converting an unbounded failure into a bounded, self-healing one.

---

<a name="s14"></a>
# 14. Connection Pooling

### Why is opening a fresh database connection per request expensive?
It's not just opening a socket — a TCP handshake, often TLS negotiation, authentication against the database, and the server allocating its own per-connection resources (memory buffers, sometimes a whole backend process/thread). Doing that on every request and tearing it down immediately after adds real latency to every request and real overhead to the server — at any meaningful volume it becomes the dominant cost, not the actual query.

### What does a connection pool actually do?
Opens a fixed set of connections once, keeps them alive, and hands them out to requests as needed, returning them when the request finishes — paying the expensive setup cost once per connection instead of once per request.

### What happens when a pool is too small?
Requests queue waiting for a connection to free up, adding latency even though the database itself has spare capacity — an artificial bottleneck created by pool configuration, not real capacity limits.

### What happens when a pool is too big?
The database server has its own finite connection limit and per-connection resource overhead — too many open connections, especially multiplied across multiple app server instances each with their own pool, can exhaust the database's own memory/resources, sometimes causing more harm than being too small.

### What's a connection leak, and why is it dangerous?
A connection checked out from the pool and never returned — typically an error path with no cleanup between checkout and release. It's dangerous specifically because it's slow and silent: the pool doesn't break immediately, it just quietly has one fewer usable connection, and given enough accumulated leaks the pool eventually runs completely dry — every request queues indefinitely and the service looks fully down with no obvious single trigger.

### How do you actually prevent a connection leak in code?
Always release in a `finally`, so it runs even if the query throws.
```js
const conn = await pool.getConnection();
try {
  const result = await conn.query('SELECT ...');
} finally {
  conn.release();
}
```

### Why does pool sizing matter more once you're running multiple app instances?
Because pool size × number of app instances has to stay under the database's actual connection ceiling — a pool tuned fine for one instance can collectively exhaust the database once that same configuration is running across ten instances.

---

<a name="s15"></a>
# 15. Replication

### Primary vs secondary — what's the actual split?
Primary (master) is the one node that accepts writes; every change originates there. Secondaries are copies kept current by continuously applying the primary's changes via a replication log/oplog, and typically serve reads only.

### Why use read replicas?
To spread read load off the primary, since reads usually vastly outnumber writes in most applications — routing reads across replicas means no single node carries the full read traffic, and read capacity scales roughly linearly by adding more replicas. Also for geographic latency (a replica closer to a set of users) and for availability (a replica can be promoted to primary if the original fails).

### What is replication lag?
The delay between a write landing on the primary and that same change actually being applied on a given secondary — the secondary is always slightly behind, and how far behind varies with write volume, network conditions, and replica load.

### What's the concrete bug replication lag causes?
A client writes to the primary, immediately reads from a replica that hasn't caught up yet, and doesn't see their own write — the classic "I just updated my profile and it still shows the old data" bug. Real and common under any meaningful write load, not a theoretical edge case.

### How would you handle the read-your-own-write problem with replicas?
Route reads back to the primary for a short window after a write from that same client (or always, for data where this genuinely matters), or track replication lag and steer reads away from a replica that's fallen too far behind.

### When is accepting eventual consistency a legitimate choice instead of fighting it?
When a few seconds of staleness genuinely doesn't matter for other users — a public activity feed is the standard example. Not every read needs read-your-own-writes guarantees; the cost/benefit of routing around lag should match how much the staleness actually matters for that specific data.

---

<a name="s16"></a>
# 16. ⭐ Sharding

### What is sharding, and when would you need it?
Splitting one logical dataset across multiple physical servers, each holding a subset of the data (not a full copy) — how you scale past what a single machine's storage and write throughput can handle. Instead of one server holding 500M documents, five shards each hold ~100M, and writes spread across all five instead of bottlenecking on one. A router (e.g. MongoDB's `mongos`) directs each query to the correct shard(s), mostly transparent to the application.

### What's a shard key, and why is choosing it so consequential?
The field used to decide which shard a document lives on — the single most consequential decision in a sharded system, because it can't be easily changed after data is already distributed.

### What's the classic bad shard key, and why does it create a hot shard?
A monotonically increasing value — an auto-incrementing ID or raw timestamp. New documents always have the newest, highest value, so they all route to whichever shard currently owns the highest range of that key — every new write lands on one shard while the others sit idle, defeating the entire purpose of spreading write load.

### What makes a good shard key?
One that distributes writes evenly — a hashed version of an ID (spreads writes randomly regardless of ID ordering), or a naturally high-cardinality field where the write pattern isn't correlated with the key's ordering (`customerId` if customers write roughly evenly, rather than `createdAt`).

### Sharding vs replication — are they alternatives?
No, they solve different problems and are commonly used together. Sharding scales writes/storage by splitting data so each node holds a subset. Replication scales reads and provides availability by giving each node a full copy of the same data. This distinction is a common interview trap.

### Can you combine sharding and replication?
Yes, and production systems commonly do — a sharded cluster where each individual shard is itself a replica set (primary + secondaries), giving both write/storage scaling and read scaling/availability layered together rather than chosen between.

### Is sharding equally native across SQL and NoSQL databases?
No — it's foundational to MongoDB's design from early on. Relational databases can shard too (Vitess for MySQL, Citus for Postgres), but it's historically more of a bolt-on with more operational overhead, not a built-in default posture.

---

<a name="s17"></a>
# 17. ⭐ MongoDB Transactions & Concurrency

### Does MongoDB support multi-document ACID transactions?
Yes, since v4.0, with the same `BEGIN`/`COMMIT`/`ROLLBACK`-shaped guarantees as SQL.
```js
const session = client.startSession();
session.startTransaction();
try {
  await Account.updateOne({ _id: a }, { $inc: { balance: -100 } }, { session });
  await Account.updateOne({ _id: b }, { $inc: { balance: 100 } }, { session });
  await session.commitTransaction();
} catch (err) { await session.abortTransaction(); }
finally { session.endSession(); }
```

### Why is a multi-document transaction a heavier tool in MongoDB than in SQL?
Because MongoDB's schema-design philosophy already leans toward embedding related data into a single document specifically so many logically-related updates can be one single-document write — and a single-document write is already atomic without any explicit transaction. Reaching for a multi-document transaction is often a signal to first ask whether the data model should have embedded that relationship instead; transactions are the fallback for genuinely cross-document needs, not the default tool.

### Optimistic vs pessimistic locking — when does each win?
Pessimistic: lock the row/document before touching it, others block until released — guarantees no conflict, at the cost of concurrency. Optimistic: read data plus a version number, do the work, write back conditionally on the version being unchanged; a mismatch means retry. Pessimistic wins under high contention, where retrying optimistic writes repeatedly wastes more work than just waiting. Optimistic wins under low contention, where most writes succeed with zero locking cost and the occasional retry is cheap.

### What is MVCC?
Multi-Version Concurrency Control — the mechanism underneath "readers don't block writers, writers don't block readers" in most modern databases. Instead of one shared row copy that reads and writes fight over, the database keeps multiple versions as a row is modified — a read sees a consistent snapshot as of when its transaction started, while a concurrent write creates a new version rather than mutating the one being read. This is why Read Committed/Repeatable Read can offer strong-ish guarantees without heavy locking — MVCC gives read isolation largely for free.

### How would you prevent two concurrent requests from decrementing inventory below zero?
Don't check-then-write in application code — read stock, check `> 0`, then decrement — that has a race window where two concurrent requests can both read `stock: 1`, both pass the check, and both decrement, landing at `-1`. Push the condition into the same atomic operation as the write instead.
```js
const result = await Product.updateOne(
  { _id: id, stock: { $gt: 0 } },
  { $inc: { stock: -1 } }
);
if (result.matchedCount === 0) { /* stock was already 0 — correctly fails */ }
```

### Why does that atomic updateOne actually prevent the race?
Because MongoDB guarantees single-document operations are atomic — the `$gt: 0` filter and the `$inc` execute as one indivisible step from the database's perspective, so there's no window between checking and writing for a second concurrent request to slip into.

### How does MongoDB's transaction model compare to SQL's ACID-by-default baseline?
SQL is ACID by default on every statement/transaction — that's the baseline the whole system is designed around. MongoDB is atomic per-document by default, with multi-document transactions as a heavier, secondary fallback — a genuinely different design philosophy, not a missing feature.

---

<a name="s18"></a>
# 18. Advanced SQL

### What's a window function, and how is it different from GROUP BY?
`GROUP BY` collapses each group into a single summary row. A window function computes a value across a set of related rows ("the window") without collapsing anything — every input row still appears in the output, now with an extra computed column.
```sql
SELECT customer_id, amount,
       RANK() OVER (PARTITION BY customer_id ORDER BY amount DESC) AS rank_in_customer
FROM orders;
```
Needed for things like "top 3 orders per customer" or a running total — neither of which `GROUP BY` alone can produce.

### What does PARTITION BY do?
The window-function equivalent of `GROUP BY`'s bucketing — but instead of collapsing each bucket into one row, every row keeps its identity and gains a value computed relative to its bucket (`RANK()`, a running `SUM() OVER (...)`, `LAG()`/`LEAD()` for adjacent rows).

### What's a CTE, and why use one over a nested subquery?
A named, temporary result set defined with `WITH`, usable like a table in the rest of the query.
```sql
WITH high_value_customers AS (
  SELECT customer_id, SUM(amount) AS total FROM orders
  GROUP BY customer_id HAVING SUM(amount) > 1000
)
SELECT c.name, hvc.total FROM high_value_customers hvc JOIN customers c ON c.id = hvc.customer_id;
```
Functionally identical to nesting the subquery, but the CTE names each logical step — a readability win once a query has more than one level of nesting.

### What's a recursive CTE useful for that a fixed-depth join can't do?
Walking hierarchical data of arbitrary depth — an employee→manager tree, for instance — where a fixed-depth `SELF JOIN` only handles a known, fixed number of levels. A recursive CTE references itself to keep walking until there's nothing left to traverse.

### Why not just use LIKE '%keyword%' for search?
It's literal substring matching — can't use a standard index (no prefix to seek to) and has no concept of relevance, word forms, or ranking. A full-text index tokenizes text into words, often stems them (matching "running" when searching "run"), ignores stop words, and ranks by relevance. `LIKE` is fine for small, simple exact-substring needs; it doesn't scale to real search requirements.

---

<a name="s19"></a>
# 19. Advanced Indexing & Partitioning

### What's a partial index, and when would you use one?
An index that only covers rows matching a given condition, not the whole table — smaller and cheaper to maintain.
```sql
CREATE INDEX idx_pending_orders ON orders (created_at) WHERE status = 'pending';
```
Useful when the hot query path only ever needs a subset — if 95% of rows are `completed`/archived and the hot path only ever queries `pending`, a full index would waste storage and write overhead on rows nobody filters by that condition.

### What's a sparse index, and how's it different from a partial index?
A sparse index only includes documents where the indexed field **exists at all** — documents missing that field entirely are excluded (not the same as excluding null values; it's about absence, not value). A partial index can filter on any predicate, not just field-presence — sparse is really a special case of partial, scoped specifically to "does this field exist."

### Why does a sparse index matter for optional fields specifically?
Indexing every document — including all the ones missing the field — wastes space, and for a non-sparse **unique** index it can also create false conflicts, since MongoDB would otherwise treat every missing-field document as colliding `null` values against each other.

### What's table partitioning, and how's it different from sharding?
Partitioning splits one large table into smaller physical pieces within a **single** database server, transparent to queries — the application still queries it as one table while the database internally only scans the relevant partition(s). Sharding (Part 14) splits data across **multiple** servers. Different scaling ceilings, and they can be combined — a sharded cluster where each shard's table is itself partitioned.

### What's partition pruning, and why does it matter?
The database automatically scanning only the partition(s) relevant to a query's filter — a query for `created_at >= '2025-06-01'` only touches the current-year partition, not the whole table. It also makes bulk archival cheap: dropping an entire old partition is far faster than a `DELETE` scanning and removing millions of individual rows.

---

<a name="s20"></a>
# 20. ⭐ SQL vs NoSQL — the Decision

### SQL vs NoSQL — how do you actually decide, for a real project?
Not a blanket "NoSQL scales better" claim — name the actual factors. How relational the data genuinely is, and whether the database needs to enforce that referential integrity itself. How stable vs evolving the schema is expected to be. Whether horizontal write scaling is a known near-term requirement or a hypothetical. Whether complex ad-hoc multi-table queries are core to the access pattern (favors SQL's mature join optimizer) or the pattern is mostly "read/write one coherent unit" (favors a document model).

### What's the single biggest thing you give up moving from SQL to MongoDB?
Referential integrity enforced by the database. A SQL foreign key guarantees a reference points at something real, automatically, at write time. MongoDB has no equivalent — a reference to a document that doesn't exist is entirely possible and silent, and that responsibility moves entirely to the application.

### Is "NoSQL scales horizontally better than SQL" always true?
It's a difference in default posture, not an absolute law. MongoDB was built with sharding as a native, foundational capability from early on. Relational databases can scale horizontally too (Vitess, Citus) but it's historically more of a bolt-on with more operational overhead — and plenty of document databases run comfortably unsharded for years. "Native and easy" vs "possible with more effort," not "impossible."

### Data model — normalized vs denormalized, what's the actual trade-off?
SQL normalizes across tables to avoid duplication and keep a single source of truth per fact, at the cost of needing joins to reassemble related data. NoSQL can denormalize/embed on purpose, avoiding joins for data read together, at the cost of potential duplication and having to decide, per relationship, whether embedding is actually safe.

### Where does schema enforcement live in each?
SQL: defined upfront and enforced by the database itself — a row missing a required column or with the wrong type is rejected at write time. NoSQL: no database-level enforcement by default — two documents in the same collection can have entirely different shapes; consistency, if wanted, comes from the application or an ODM layer as a convention, not a guarantee.

### How do the transaction/consistency defaults differ?
SQL: every statement or explicit transaction is ACID by default — the baseline the whole system is designed around. MongoDB: single-document writes are always atomic, and because the data model favors embedding specifically so related updates land in one document, many "these must update together" cases never need an explicit transaction at all. Multi-document transactions exist but are a fallback, not the baseline — a different design philosophy, not a missing feature.

### When does each genuinely win?
Reach for SQL when the data is genuinely relational and correctness depends on it (financial ledgers, real referential integrity), the schema is stable and well-understood, or complex ad-hoc multi-table queries are core to the requirement. Reach for MongoDB when the data is naturally document-shaped and read/written as one unit, the schema is expected to evolve or genuinely varies across records (multi-tenant SaaS), or horizontal scale for high write volume is a known requirement from the start.

### What's the honest framing an interviewer is actually listening for here?
Named, specific factors weighed against the actual system under discussion — not "NoSQL is more scalable" as a blanket claim, which reads as marketing rather than engineering judgment. The strongest answers name both sides of the trade-off explicitly, the way the comparison table in [Part 20](20-sql-vs-nosql-comparison.md) lays it out axis by axis.

---

## Before an interview

```
1. Cover the answers. Say yours ALOUD.
2. Stumble → open the linked Part, reread that section only.
3. Highest yield: 2 (joins), 3 (indexes), 4 (EXPLAIN), 5 (ACID),
   9 (N+1), 11 (embed vs reference), 13 (caching), 16 (sharding),
   17 (Mongo transactions/concurrency), 20 (the SQL vs NoSQL decision).
4. If you have one hour: LEFT vs INNER with the zero-orders case, why an
   unindexed column makes EXPLAIN show a full scan, the money-transfer
   ACID example, and embed-vs-reference's three deciding factors.
   Those four carry most database interviews.
```

*— End of question bank —*
