# Database Study Notes — Part 05

## MongoDB Fundamentals

> **Format:** Q&A — my prompts are the questions, the explanations are the answers. Written the way you'd *say* it in an interview, not as reference notes.

---

## Table of Contents

1. [Documents & Collections](#docs)
2. [BSON vs JSON](#bson)
3. [`ObjectId` internals](#objectid)
4. [CRUD operations](#crud)
5. [Why MongoDB over relational, honestly](#why-mongo)
6. [Interview Questions & Answers](#interview)
7. [Cheat Sheet](#cheatsheet)

---

<a name="docs"></a>
## 1. Documents & Collections

A **document** is a single record — a BSON object (looks like JSON) with fields and values, can nest objects and arrays. A **collection** is a group of documents — roughly SQL's "table," except a collection has no enforced schema: two documents in the same collection can have completely different fields.

```js
// two documents, same collection, different shape — perfectly valid
{ _id: 1, name: "Alice", email: "a@x.com" }
{ _id: 2, name: "Bob", email: "b@x.com", phone: "555-1234", tags: ["vip"] }
```

That flexibility is the whole pitch and the whole risk at once — nothing stops inconsistent documents from accumulating unless your application (or a schema layer like Mongoose) enforces structure.

---

<a name="bson"></a>
## 2. BSON vs JSON

MongoDB stores documents as **BSON** (Binary JSON), not plain JSON. It's binary-encoded and adds types JSON can't express natively:

| Type | JSON | BSON |
|---|---|---|
| Date | string, no real date type | native `Date` (stored as milliseconds since epoch) |
| Binary data | not supported (base64 string workaround) | native `BinData` |
| Numbers | one generic "number" type | distinct `Int32`, `Int64`, `Double`, `Decimal128` |
| Unique ID | not supported | native `ObjectId` |

**Why it matters practically:** if you send a JS `Date` object through a driver, it round-trips as a real date you can query/sort/range-filter directly — no manual `new Date(string)` parsing on the way back out, unlike a JSON API where dates are just strings.

---

<a name="objectid"></a>
## 3. `ObjectId` internals

The default `_id` MongoDB generates is a 12-byte value with real structure, not a random blob:

```
4 bytes          5 bytes              3 bytes
timestamp    +   random value    +    incrementing counter
(seconds)        (per process)        (starts random per process)
```

**The practical consequence:** an `ObjectId` is **roughly sortable by creation time** — sorting by `_id` ascending gives you approximate insertion order, without needing a separate `createdAt` field or index. Not exact to the millisecond (only the first 4 bytes are time-based, at 1-second resolution), but good enough that "sort by `_id`" is a common cheap substitute for "sort by creation time."

```js
db.orders.find().sort({ _id: -1 }).limit(10)  // roughly "10 most recent orders"
```

---

<a name="crud"></a>
## 4. CRUD operations

The core operations, with the shape that actually shows up in interviews and code:

```js
// CREATE
db.users.insertOne({ name: "Alice", email: "a@x.com" })
db.users.insertMany([{ name: "Bob" }, { name: "Carol" }])

// READ
db.users.findOne({ email: "a@x.com" })
db.users.find({ age: { $gte: 18 } }).sort({ createdAt: -1 }).limit(20)

// UPDATE
db.users.updateOne({ _id: id }, { $set: { name: "Alice Smith" } })
db.users.updateMany({ status: "pending" }, { $set: { status: "active" } })

// DELETE
db.users.deleteOne({ _id: id })
db.users.deleteMany({ status: "inactive" })
```

**Key operator distinctions that come up constantly:**
- `$set` updates only the named fields — it does **not** overwrite the whole document (unlike passing a plain object as the second arg to `updateOne`, which *does* replace the entire document if you forget `$set`).
- `updateOne` vs `updateMany` — same footgun shape as SQL's missing `WHERE` on an `UPDATE`: filter precisely, or you affect more documents than intended.
- `find()` returns a **cursor** (lazy, doesn't load everything into memory at once) — `findOne()` returns a single document directly.

---

<a name="why-mongo"></a>
## 5. Why MongoDB over relational, honestly

**The honest pitch, not the marketing one:**
- **Schema flexibility** — genuinely useful when your data is naturally document-shaped (nested objects, varying fields across records) or when the schema is still evolving and a rigid `ALTER TABLE` migration on every change is real friction.
- **Natural fit for nested data** — a document with embedded sub-objects/arrays maps directly to how you'd model it in code (a `User` with an embedded `address`), no join required to read it back as one object.

**The real trade-off, said plainly:**
- **No native joins across collections** the way SQL has them — `$lookup` exists and can do left-outer-join-like work inside an aggregation pipeline, but it's not a first-class, always-available operation the way a SQL `JOIN` is, and it doesn't get the same decades of query-optimizer tuning.
- Data modeling shifts from "normalize by default" to "embed vs reference, decided per relationship" (this is Part 09's whole subject) — get that decision wrong and you either duplicate data awkwardly or pay for `$lookup`/`populate()` joins constantly.

A credible interview answer names both sides — not "MongoDB is just better/more scalable," which reads as marketing rather than engineering judgment.

**Full point-by-point comparison (data model, schema, transactions, scaling, query language) → [Part 20](20-sql-vs-nosql-comparison.md).**

---

<a name="interview"></a>
## 6. Interview Questions & Answers

**Q: Why MongoDB over a relational database, for a given project?**
A: Schema flexibility and a natural fit for nested, document-shaped data — useful when the schema is still evolving or when your objects are naturally hierarchical. The real trade-off is losing native joins; `$lookup` exists but isn't as first-class as SQL `JOIN`, so data modeling shifts to a deliberate embed-vs-reference decision per relationship instead of defaulting to normalization.

**Q: What's actually inside an `ObjectId`?**
A: 12 bytes: a 4-byte timestamp (seconds since epoch), a 5-byte random value fixed per process, and a 3-byte incrementing counter. Because the timestamp is the leading bytes, sorting by `_id` gives you roughly-correct insertion order without a separate timestamp field.

**Q: What's the difference between BSON and JSON?**
A: BSON is binary-encoded and adds types JSON has no native representation for — a real `Date` type, binary data, and distinct numeric types (Int32/Int64/Double/Decimal128) instead of one generic "number." A JS `Date` sent through the driver comes back as a real date object, not a string you have to reparse.

**Q: What happens if you forget `$set` in an update?**
A: If you pass a plain object (not wrapped in `$set`) as the update document to `updateOne`/`updateMany`, MongoDB replaces the **entire document** with that object instead of merging the named fields — a common and dangerous mistake, since every field not included in the replacement object is silently dropped.

---

<a name="cheatsheet"></a>
## 7. Cheat Sheet

- **Document** = one record (BSON). **Collection** = group of documents, no enforced schema.
- **BSON** adds real types JSON can't express: `Date`, `BinData`, distinct numeric types, `ObjectId`.
- **`ObjectId`** = timestamp (4B) + per-process random (5B) + counter (3B) → roughly sortable by creation time.
- CRUD: `insertOne`/`insertMany`, `findOne`/`find`, `updateOne`/`updateMany` (always use `$set`), `deleteOne`/`deleteMany`.
- `find()` returns a lazy cursor; `findOne()` returns one document directly.
- Mongo's real trade-off vs relational: no native joins (`$lookup` is the substitute, not equivalent) — data modeling becomes an explicit embed-vs-reference call per relationship.
- **SQL vs NoSQL:** full point-by-point comparison → [Part 20](20-sql-vs-nosql-comparison.md). Related: [Part 04.5](04.5-foreign-keys-and-cascading.md) — Mongo has no foreign-key/cascade equivalent at all.
