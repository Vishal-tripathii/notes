# Database Study Notes — Part 08

## Aggregation Pipeline

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.

---

## Table of Contents

1. [The pipeline as staged transformation](#pipeline)
2. [The core stages](#stages)
3. [`$lookup` vs `populate()`](#lookup-vs-populate)
4. [Why `$match` should come first](#match-first)
5. [Interview Questions & Answers](#interview)
6. [Cheat Sheet](#cheatsheet)

---

<a name="pipeline"></a>
## 1. The pipeline as staged transformation

An aggregation pipeline is an **array of stages**, each one taking the output of the previous stage as its input and transforming it further — conceptually identical to `.filter().map().sort()` chaining in JS, just running inside the database across documents instead of in application memory.

```js
db.orders.aggregate([
  { $match: { status: "completed" } },   // stage 1: filter documents
  { $group: { _id: "$customerId", total: { $sum: "$amount" } } },  // stage 2: bucket + aggregate
  { $sort: { total: -1 } }               // stage 3: sort the grouped output
])
```

Each stage only ever sees what the previous stage passed through — `$group` in stage 2 only sees `completed` orders because `$match` already filtered everything else out in stage 1.

---

<a name="stages"></a>
## 2. The core stages

| Stage | Does |
|---|---|
| `$match` | filters documents — same role as SQL `WHERE`, and should generally run as early as possible |
| `$group` | buckets documents by a key and computes aggregates per bucket — same role as SQL `GROUP BY` |
| `$project` | reshapes documents — include/exclude/rename/compute fields, same role as SQL `SELECT` |
| `$sort` | orders documents — same role as SQL `ORDER BY` |
| `$lookup` | joins in documents from another collection — closest equivalent to a SQL `LEFT JOIN` |
| `$unwind` | deconstructs an array field into one document per array element — turns `{tags: ["a","b"]}` into two separate documents, one with `tags: "a"` and one with `tags: "b"` |

```js
// $unwind example — useful before $group when you need to aggregate over array elements
db.orders.aggregate([
  { $unwind: "$items" },
  { $group: { _id: "$items.productId", totalSold: { $sum: "$items.quantity" } } }
])
```

---

<a name="lookup-vs-populate"></a>
## 3. `$lookup` vs `populate()`

Both do the join-like thing conceptually, but the mechanism differs (see Part 07 §2 for the full comparison):

- **`$lookup`** runs **inside the database**, as one stage among others in a single pipeline — it can be filtered, grouped, or reshaped further in the same round-trip.
- **`populate()`** is a **Mongoose-level convenience** that runs as a separate, application-orchestrated batched query — simpler syntax, but it's a second round-trip and can't be woven into the middle of a broader aggregation.

Use `$lookup` when the join needs to participate in further aggregation (filter/group/sort on the joined data); use `populate()` for a simpler "just attach the related document" case outside of an aggregation context.

---

<a name="match-first"></a>
## 4. Why `$match` should come first when possible

`$match` shrinks the **working set** before the more expensive stages (`$group`, `$sort`, `$lookup`) ever see the data. If a pipeline groups and sorts a million documents and *then* filters down to a thousand, it just did all that expensive work on 999,000 documents that get thrown away — running `$match` first means `$group`/`$sort`/`$lookup` only ever operate on the thousand that matter.

There's an added benefit: an early `$match` on an indexed field can use that index the same way a normal `find()` query would — a `$match` placed later in the pipeline, after other stages have already reshaped the documents, generally cannot.

```js
// Inefficient — sorts and groups the entire collection before filtering
db.orders.aggregate([
  { $group: { _id: "$customerId", total: { $sum: "$amount" } } },
  { $sort: { total: -1 } },
  { $match: { total: { $gt: 1000 } } }
])

// Efficient — filters first, so later stages work on a much smaller set
db.orders.aggregate([
  { $match: { status: "completed" } },
  { $group: { _id: "$customerId", total: { $sum: "$amount" } } },
  { $sort: { total: -1 } }
])
```

---

<a name="interview"></a>
## 5. Interview Questions & Answers

**Q: `$lookup` vs `populate()` — what's actually different?**
A: Both join related data, but `$lookup` runs inside the database as one stage in an aggregation pipeline, composable with other stages in the same round-trip. `populate()` is a Mongoose-level convenience that runs as a separate batched query from the application — simpler, but it can't participate in the middle of an aggregation the way `$lookup` can.

**Q: Why should `$match` come first in a pipeline when possible?**
A: It shrinks the working set before expensive stages like `$group`, `$sort`, or `$lookup` run — those stages then only process the documents that actually matter instead of the whole collection. An early `$match` on an indexed field can also use that index, the way a normal query would; a `$match` placed later in the pipeline generally can't.

**Q: What does `$unwind` do, and when would you use it?**
A: Deconstructs an array field into one document per element — needed before a `$group` that has to aggregate over individual array elements (e.g. summing quantities across all `items` in all orders), since `$group` can't reach inside an array on its own.

---

<a name="cheatsheet"></a>
## 6. Cheat Sheet

- Pipeline = array of stages, each transforming the previous stage's output — like `.filter().map().sort()` inside the database.
- `$match` ≈ `WHERE`. `$group` ≈ `GROUP BY`. `$project` ≈ `SELECT`. `$sort` ≈ `ORDER BY`. `$lookup` ≈ `JOIN`. `$unwind` = array → one document per element.
- `$lookup` (in-DB, composable) vs `populate()` (app-level, separate batched query).
- Put `$match` first — shrinks the working set for later stages, and can still use an index.
- **SQL vs NoSQL:** the pipeline stages map roughly to SQL clauses (`$match`≈`WHERE`, `$group`≈`GROUP BY`, `$lookup`≈`JOIN`) but run as an explicit, ordered stage sequence rather than a declarative query the optimizer reorders. Full comparison → [Part 20](20-sql-vs-nosql-comparison.md).
