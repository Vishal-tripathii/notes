# Node.js Study Notes — Part 8

## MongoDB & Mongoose — Schema Design, Indexes, Populate & Cascades

> **Format:** Q&A — my prompts are the questions, the explanations are the answers. Written the way you'd *say* it in an interview.
>
> **Concepts elsewhere:** [08-databases-sql-vs-nosql](../08-databases-sql-vs-nosql.md), [09-database-indexing](../09-database-indexing.md), [10-database-relationships](../10-database-relationships.md). **This is the Mongo-specific part** — what actually breaks in production.
>
> ⭐ **One idea runs through everything here: schema design is the only decision that really matters.** Slow `populate`, needing transactions, and cascade-delete pain are all *consequences* of getting embed-vs-reference wrong.

---

## Table of Contents

1. [Schema design — embed or reference?](#schema) ⭐
2. [Validation](#validation)
3. [What an index actually is](#indexes) ⭐
4. [Compound indexes and the ESR rule](#compound) ⭐
5. [Covered queries](#covered)
6. [Aggregation](#aggregation)
7. [Populate — and why it gets slow](#populate) ⭐
8. [Virtuals](#virtuals)
9. [Transactions](#transactions)
10. [Cascade deletes](#cascade) ⭐
11. [Interview Questions & Answers](#interview)
12. [Cheat Sheet](#cheatsheet)

---

<a name="schema"></a>
# 1. ⭐ Schema design — embed or reference?

In MongoDB you have a choice SQL doesn't give you: **do related things live inside one document, or in separate collections?**

```js
// EMBEDDED — everything in one document
{ _id: 1, name: 'Ada',
  addresses: [{ street: '1 Main', city: 'NY' }] }

// REFERENCED — separate documents, connected by an id
{ _id: 1, name: 'Ada' }                          // in `users`
{ _id: 9, userId: 1, total: 250 }                // in `orders`
```

**The difference that matters:** getting a user *with* their addresses is **one read** when embedded. When referenced, it's **two** — fetch the user, then fetch their orders.

## How to decide

| Embed when… | Reference when… |
|---|---|
| There are **few** of them — a person has 2 addresses, not 2 million | There can be **unlimited** — a user's posts, a post's comments |
| You **always read them together** | You often need one without the other |
| They change **with** the parent | They have their own life cycle |

## Three rules that settle most arguments

**① A document cannot exceed 16MB. This is a hard wall, not a guideline.**

Any list that can grow forever — comments, events, log entries, chat messages — **will** eventually hit it. When it does, writes simply start failing. So those must be referenced, however convenient embedding looks today.

**② There are no cheap joins in MongoDB.**

In SQL you split data across tables and join it back. Mongo has no equivalent that's free — so **duplicating data is normal and expected here**, not a sin. Different database, different instincts.

**③ Design around your queries, not around your data.**

Ask *"what does my most common request need?"* and shape the document so that request is one read. This is genuinely the opposite of how you'd design a SQL schema.

## The pattern that solves most real cases

Store the id **plus the two or three fields you always show**:

```js
// an order document
{ _id: 9, total: 250,
  user: { _id: 1, name: 'Ada', email: 'ada@mail.com' } }
```

**Rendering an order list needs the customer's name.** With this, that's zero extra queries — the name is right there.

**The cost:** if Ada changes her name, you have to update it in two places, and for a moment they disagree.

> ⭐ **That's the trade you're making: cheap reads, more expensive writes.** It's usually the right one, because names change rarely and order lists render constantly. This is called an **extended reference**.

---

<a name="validation"></a>
# 2. Validation

```js
const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  age:   { type: Number, min: 18, max: 120 },
  role:  { type: String, enum: ['user', 'admin'], default: 'user' },
});
```

## ⚠️ The gotcha: updates skip validation entirely

```js
await User.create({ age: 5 });                     // ❌ rejected ✅ good
await User.findByIdAndUpdate(id, { age: 5 });      // ✅ SAVED. No error. 💥
```

**Why does the second one work?** Because Mongoose validators run when you **save a document**. An update isn't a document — it's a set of instructions ("change age to 5"). There's no document in hand to check, so by default Mongoose doesn't try.

```js
await User.findByIdAndUpdate(id, { age: 5 }, { runValidators: true });   // ✅ rejected
mongoose.set('runValidators', true);                                     // or globally
```

## `unique: true` is not validation

It looks like the other options, but it's different: **it tells MongoDB to build a unique index.** The check happens in the database, not in Mongoose. So:
- It only works **if that index actually got created**
- It throws a **duplicate-key error (code 11000)**, not a validation error, so your error handling needs to expect a different shape

> **And know which layer you're on.** Mongoose validation lives in your Node app. Anything writing to the database another way — a migration script, mongosh, a different service — **bypasses it completely.** If you need a real guarantee, add MongoDB's own `$jsonSchema` validation to the collection.

---

<a name="indexes"></a>
# 3. ⭐ What an index actually is

Everything in §4 and §5 depends on this, so it's worth building properly.

**Without an index, finding a document means checking every single one.** A million documents means a million checks. That's called a **collection scan** — `COLLSCAN` in Mongo's output.

**An index is a separate, sorted copy of one field, with pointers back to the documents.**

> **It's the index at the back of a textbook.** Without one, finding every mention of "photosynthesis" means reading all 900 pages. With one, you flip to the P's, find the word, and it tells you: pages 34, 112, 288. **You didn't read the book — you read the index, then jumped.**

Because it's **sorted**, the database can find an entry by halving the search repeatedly rather than walking through. A million documents takes about 20 steps instead of a million.

```js
schema.index({ email: 1 });                                  // 1 = ascending
schema.index({ email: 1 }, { unique: true });                // also enforce uniqueness
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });   // auto-delete old docs
```

**Index every field you filter by, sort by, or join on.**

## How to check whether it's working

```js
await Order.find({ userId: 1 }).explain('executionStats');
```

Three things to read in the output:

```
"stage": "IXSCAN"     ✅ it used an index
"stage": "COLLSCAN"   ❌ it read every document — you're missing an index

totalDocsExamined  vs  nReturned
   1000 examined / 10 returned  → ❌ it's sifting through too much
     10 examined / 10 returned  → ✅ good — it went straight to them
      0 examined / 10 returned  → ⭐ covered query (§5)
```

**`totalDocsExamined` vs `nReturned` is the number that matters** — it's "how much did I read" versus "how much did I need." If those are far apart, the index isn't doing its job.

## Indexes are not free

Every index has to be **kept up to date on every write.** Ten indexes means ten extra updates per insert. They also take up memory, and MongoDB is fastest when the indexes it uses fit in RAM.

> **So an index you never query is pure cost** — slower writes, more memory, zero benefit. Don't index "just in case."

---

<a name="compound"></a>
# 4. ⭐ Compound indexes and the ESR rule

A **compound index** covers several fields at once:

```js
schema.index({ status: 1, createdAt: -1 });
```

## The order of fields is everything

> **Think of a phone book, sorted by last name, then first name.**
>
> - *"Find Smith"* → instant. Flip to the S's.
> - *"Find everyone named John"* → **useless.** Johns are scattered across every letter, so you'd read the entire book.
>
> The book is sorted by last name **first**. First name only helps you *after* you've narrowed to a surname.

Indexes work identically. `{ status, createdAt }` helps you if you filter by `status` — or by `status` **and** `createdAt`. It does **nothing** if you only filter by `createdAt`.

```js
schema.index({ status: 1, createdAt: -1, price: 1 });

✅ find({ status })                        ← uses it
✅ find({ status, createdAt })             ← uses it
✅ find({ status, createdAt, price })      ← uses it fully
❌ find({ createdAt })                     ← skips the first field. No help.
❌ find({ price })                         ← same problem
```

**The rule: an index helps only if your query uses the fields from the left, without skipping any.**

## ESR — Equality, Sort, Range

Given a query that filters, sorts *and* uses a range, what order should the index fields go in? **ESR** is the answer:

```js
// the query
db.orders.find({ status: 'active', price: { $gte: 10, $lte: 100 } })
         .sort({ createdAt: -1 })

// the index
schema.index({ status: 1, createdAt: -1, price: 1 });
//             └ Equality  └ Sort        └ Range
```

**Walk through why, one field at a time:**

**Equality first (`status: 'active'`).** Because the index is sorted, every `active` row sits together in one continuous block. One jump, and everything you care about is in front of you.

**Sort second (`createdAt`).** Inside that block, rows are *already ordered by date* — that's what the second index field did. So the database can just read them out in order. **It never has to sort anything.**

**Range last (`price` between 10 and 100).** A range covers a *span* of values, not a single point. Everything after a range field is scattered across that span, so it's no longer in any usable order.

> ⭐ **That last point is the whole rule. Put the range before the sort field, and the sort ordering is destroyed — so MongoDB has to collect all the matches and sort them in memory afterwards.**

**How you'd notice:** `explain()` shows an extra `SORT` stage. And in-memory sorts have a **32MB limit** — cross it and the query doesn't just get slow, it **fails**.

**Putting range before sort is the most common indexing mistake there is.**

---

<a name="covered"></a>
# 5. Covered queries

**A covered query is one MongoDB answers using only the index — it never opens the actual documents.**

```js
schema.index({ email: 1, name: 1 });

await User.find({ email: 'ada@mail.com' }, { name: 1, _id: 0 });
//                └ the field I search by   └ the field I want back
// explain() → totalDocsExamined: 0   ⭐
```

**Why is that possible?** Because both `email` *and* `name` are stored in the index itself. Once MongoDB finds the entry, it already has everything you asked for. **There's nothing left to look up.**

**Three conditions, all required:**
1. Every field you **search by** is in the index
2. Every field you **ask for back** is in the index
3. You exclude `_id` (`_id: 0`) — unless `_id` is in the index too

**Why it's so much faster:** the index is small and usually sitting in RAM. The documents are big and usually on disk. **A covered query never touches the disk** — often ten times faster.

**Where it's worth it:** small, very frequent queries — permission checks, autocomplete, "does this exist?", turning IDs into names.

**The cost:** the index carries more fields, so it's bigger and slower to write. Don't do it everywhere — do it on the query you run ten thousand times a minute.

---

<a name="aggregation"></a>
# 6. Aggregation

**An aggregation is a series of steps, where each step takes the results of the previous one and transforms them.** Like an assembly line.

```js
await Order.aggregate([
  { $match: { status: 'paid' } },                       // 1. keep only paid orders
  { $group: { _id: '$userId', total: { $sum: '$amount' } } },  // 2. total per user
  { $sort:  { total: -1 } },                            // 3. biggest spender first
  { $limit: 10 },                                       // 4. top 10
]);
```

Use it for things a plain `find()` can't do: totals, grouping, reports, joins.

## The four performance rules

**① Put `$match` first. Always.**

**Only `$match` and `$sort` can use an index — and only while they're at the *start* of the pipeline.** Once any step has transformed the data (grouped it, reshaped it), MongoDB is working with intermediate results in memory, and no index applies to those.

So filtering a million documents down to a thousand **first** makes everything after it trivial. Filtering last means every step before it did a million documents' worth of work for nothing.

**② Each step has a 100MB memory limit.**
Exceed it and the step fails. `allowDiskUse: true` lets it spill to disk, which works but is slow. **Usually hitting this means you didn't filter early enough** — treat it as a symptom, not a fix.

**③ `$lookup` (joining another collection) is expensive.**
It runs a lookup **for every document coming in**. If the field it looks up isn't indexed, that's a full collection scan **per document**. Index it, and don't put `$lookup` after a step producing many rows.

**④ `$unwind` multiplies your document count.**
It turns one document with a 100-item array into 100 documents. A thousand documents becomes a hundred thousand. **Always `$match` before `$unwind`, never after.**

---

<a name="populate"></a>
# 7. ⭐ Populate — and why it gets slow

`populate()` looks like a join. **It isn't.**

```js
const orders = await Order.find().populate('userId');
```

Here's what actually runs:

```
Query 1:  db.orders.find()                              → 100 orders
          Mongoose reads the userIds out of them, in JavaScript
Query 2:  db.users.find({ _id: { $in: [1, 2, 3, ...] } })  → the users
          Mongoose matches them up in memory

→ TWO round trips to the database, plus work in your Node process
```

**MongoDB never joined anything.** Mongoose ran two separate queries and stitched the results together itself.

## Why it degrades

| What happens | Why it costs you |
|---|---|
| One extra query per `populate()` | each is a network round trip |
| Nested populate | populate inside populate → 3, 4, 5 queries |
| Populating a non-`_id` field | if it isn't indexed, that's a collection scan |
| A big result set | 10,000 orders → an `$in` list with 10,000 ids to build and match |
| No field selection | pulls entire documents when you needed one name |

## ⭐ The limitation that actually matters

**You cannot filter, sort, or paginate by a populated field.**

```js
// "give me orders sorted by customer name" — IMPOSSIBLE with populate
```

**Why?** Because when MongoDB runs query 1, it's only looking at the `orders` collection. **It has never seen the users.** It cannot sort by something it doesn't have. The names don't arrive until query 2 — after sorting and pagination already happened.

Your only option would be fetching *every* order and sorting in Node, which defeats the point of pagination entirely.

## The fixes, cheapest first

```js
// ① ask for less
.populate('userId', 'name email')

// ② $lookup — one round trip, and the database CAN sort by the joined data
Order.aggregate([
  { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
  { $unwind: '$user' },
  { $sort: { 'user.name': 1 } },        // ⭐ impossible with populate
]);

// ③ store the field you need on the order itself — zero extra queries ⭐
{ _id: 9, total: 250, user: { _id: 1, name: 'Ada' } }
```

> **The honest summary: `populate` is fine for one level on a page of twenty records. It is not a join, it doesn't scale to lists, and if you're populating on every single read, that's your schema telling you to denormalize.**

---

<a name="virtuals"></a>
# 8. Virtuals

A **virtual** is a computed property — it's calculated in your app and **never stored in the database**.

```js
userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

user.fullName;                       // ✅ 'Ada Lovelace'
User.find({ fullName: 'Ada L' });    // ❌ returns nothing
```

**Why does the query find nothing?** Because `fullName` doesn't exist in MongoDB. There's no such field to match against — Mongoose computed it after the data arrived.

> **The rule: if you'll ever need to search or sort by it, it has to be a real stored field.**

Virtuals also don't show up in `res.json()` unless you enable them:
```js
new Schema({...}, { toJSON: { virtuals: true } });
```

## Virtual populate — genuinely useful

This is the right way to model "a user has many posts":

```js
userSchema.virtual('posts', { ref: 'Post', localField: '_id', foreignField: 'userId' });
await User.findById(id).populate('posts');
```

**The user document stays small**, because you're not storing an ever-growing array of post ids inside it — which would eventually hit the 16MB limit. The relationship is defined, but the data stays where it belongs.

---

<a name="transactions"></a>
# 9. Transactions

A transaction makes several separate writes succeed or fail **together**. Classic case: moving money — you can't subtract from one account and then fail to add to the other.

```js
const session = await mongoose.startSession();
try {
  await session.withTransaction(async () => {
    await Account.updateOne({ _id: from }, { $inc: { balance: -100 } }, { session });
    await Account.updateOne({ _id: to },   { $inc: { balance:  100 } }, { session });
  });
} finally {
  await session.endSession();
}
```

**They require a replica set** — a multi-server MongoDB setup. They do **not** work on a single standalone instance, **including your local development one.** That's why transactions commonly "work in production and fail locally."

**What they cost:**

| Cost | Detail |
|---|---|
| Locks held longer | other writers to those documents have to wait |
| A 60-second limit | long transactions are aborted |
| Extra coordination | measurably slower than a plain write |
| Retries | some failures are temporary and must be retried — `withTransaction` does this for you |

> ⭐ **The point worth making in an interview: a single document update is *already* atomic in MongoDB.** It either fully happens or doesn't — no transaction needed.
>
> **So if you find yourself needing transactions constantly, that's usually a schema smell.** Data that must always change together is often data that should have lived in one document. Transactions are for genuine cross-entity operations — a money transfer, an order plus inventory — not for patching a design decision.

---

<a name="cascade"></a>
# 10. ⭐ Cascade deletes

**MongoDB has no foreign keys and no `ON DELETE CASCADE`.**

In SQL you can tell the database "when a user is deleted, delete their posts too." **Mongo has nothing like that.** Delete a user, and their 500 posts remain — now pointing at somebody who doesn't exist.

Those are **orphans**, and they break things quietly: `populate('userId')` returns `null`, so `order.user.name` throws.

**Handling this is entirely your job.** Four ways:

## ① Mongoose hooks

```js
userSchema.pre('deleteOne', { document: true, query: false }, async function () {
  await Post.deleteMany({ userId: this._id });
});
```

> ⚠️ **The trap that catches everyone: the hook is tied to the exact method you call.**

```js
await user.deleteOne();                    // ✅ this hook runs
await User.deleteOne({ _id: id });         // ⚠️ different hook type entirely
await User.findByIdAndDelete(id);          // ⚠️ fires 'findOneAndDelete' instead
await User.deleteMany({ active: false });  // ❌ NO per-document hooks at all 💥
```

**So your cleanup works when you delete one way, and silently does nothing when a colleague deletes another way.** Bulk deletes create orphans in complete silence.

## ② Do it explicitly in your service layer — the honest approach

```js
async function deleteUser(userId) {
  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    await Post.deleteMany({ userId }, { session });
    await Comment.deleteMany({ userId }, { session });
    await User.deleteOne({ _id: userId }, { session });
  });
}
```

**Visible, testable, and impossible to bypass by using a different Mongoose method.** Usually better than hooks in production code — hooks hide expensive, far-reaching side effects behind an innocent-looking call.

## ③ Soft delete — usually the best answer ⭐

**Don't delete anything. Mark it.**

```js
await User.updateOne({ _id: id }, { deleted: true, deletedAt: new Date() });

// and automatically hide them from every query:
schema.pre(/^find/, function () { this.where({ deleted: { $ne: true } }); });
```

**Nothing is orphaned because nothing was removed.** You also get an audit trail and an undo button for free.

**Trade-offs:** every query needs that filter (hence the hook), and you should exclude deleted rows from your indexes. And note that "delete my data" requests under GDPR may legally require a **real** delete — soft delete alone isn't always enough.

## ④ Background cleanup
For very large cascades, mark the user as deleted and let a background job clean up. **Deleting 100,000 documents should not happen inside an HTTP request** ([Part 1.2](01.2-event-loop-blocking-and-real-world-load.md)).

## Guard against orphans anyway

They'll happen regardless — a crash mid-cleanup, a manual delete in mongosh, a bulk operation:

```js
const orders = await Order.find().populate('userId');
orders.filter(o => o.userId)          // ⭐ populate returns null for missing refs
      .map(o => o.userId.name);
```

---

<a name="interview"></a>
# 11. Interview Questions & Answers

### Q1. Explain covered indexes.
> "A covered query is one MongoDB answers **entirely from the index**, without ever opening the actual documents. It works when every field you search by *and* every field you ask for back are both in the index, and you exclude `_id` unless it's in there too.
>
> **It's fast because the index is small and usually in RAM, while the documents are on disk** — so you skip the disk read completely, which is often ten times faster.
>
> You confirm it in `explain()`: **`totalDocsExamined: 0`** with a non-zero `nReturned` means nothing was fetched.
>
> It's worth doing on small, very frequent queries — permission checks, autocomplete, ID-to-name lookups. The cost is a wider index that's slower to write, so I wouldn't do it everywhere."

### Q2. Why does `populate()` become slow?
> "Because it isn't a join. **It's a second query**, and Mongoose stitches the results together in the Node process. So every populated field is an extra network round trip, and nested populate multiplies that.
>
> It gets worse with big result sets, because you end up with an `$in` list of ten thousand ids, and with populating a non-`_id` field that isn't indexed, which becomes a collection scan.
>
> **But the real limitation is structural: you can't filter, sort or paginate by a populated field.** When MongoDB runs the first query it's only looking at the orders collection — it has never seen the users, so it can't sort by customer name. The names don't arrive until the second query, after pagination already happened. Your only option would be fetching everything and sorting in Node, which defeats the purpose.
>
> Fixes in order: select only the fields you need, switch to `$lookup` so it's one round trip and the database *can* sort on it, or store the field directly on the document. **If I'm populating on every read, that's the schema telling me to denormalize.**"

### Q3. When should data be embedded vs referenced?
> "Embed when there are **few of them, they're bounded, and you always read them together** — a person's two addresses, an order's line items. Reference when the number can **grow without limit or they're used independently** — a user's posts, a post's comments.
>
> **The hard constraint is the 16MB document limit.** Any array that grows forever will eventually hit it and writes start failing, so comments and event logs have to be referenced no matter how convenient embedding looks.
>
> The tiebreaker is the access pattern: if you always read them together, embedding makes it one read instead of two. If you often need one without the other, referencing avoids dragging useless data around.
>
> **In practice I reach for an extended reference** — store the id plus the two or three fields you always display, like the customer's name on an order. Cheap reads, at the cost of updating duplicates when they change."

### Q4. Explain transaction costs.
> "First, they need a **replica set** — they don't work on a standalone instance, which is why they often fail locally and pass in production. Then: locks are held for the whole transaction so other writers contend, there's a 60-second limit, there's real coordination overhead, and some failures are temporary and have to be retried.
>
> **But the bigger point is that a single-document update is already atomic in MongoDB.** So needing transactions frequently usually means data that always changes together is living in separate documents when it should be one. I use them for genuine cross-entity operations — a money transfer, an order plus inventory — not to compensate for schema design."

### Q5. How do you handle cascade deletes in MongoDB?
> "MongoDB has **no foreign keys and no `ON DELETE CASCADE`**, so nothing stops you leaving orphaned references. It's entirely the application's job.
>
> **The trap with Mongoose hooks is that they're tied to the exact method you call.** `doc.deleteOne()` fires document middleware, `Model.deleteOne()` fires a different kind, `findByIdAndDelete` fires another hook entirely, and **`deleteMany` fires no per-document hooks at all.** So cleanup that works one way silently does nothing when someone deletes another way.
>
> I prefer **doing it explicitly in the service layer, inside a transaction** — visible, testable, and impossible to bypass. Better still, **soft delete**: mark it as deleted and filter it out with a query hook. Nothing is orphaned because nothing is removed, and you get an audit trail and undo for free. For very large cascades I'd mark it and let a background job clean up rather than deleting 100,000 documents during a request.
>
> And defensively, always guard populated fields — `populate` returns `null` for a missing reference, so `o.userId.name` crashes on any orphan that got through."

### Q6. Why did `findByIdAndUpdate` save invalid data?
> "Because Mongoose validators run when you **save a document**, and an update isn't a document — it's a set of instructions. There's nothing to validate, so by default it doesn't try. You need `{ runValidators: true }`, or set it globally.
>
> And `unique` isn't a validator at all — it's an instruction to build a unique index. MongoDB enforces it, and it throws a duplicate-key error, code 11000, not a validation error."

### Q7. What order should compound index fields go in?
> "**ESR — Equality, Sort, Range.**
>
> Equality first, because the index is sorted, so all matching rows sit in one continuous block — one jump and you're there. The sort field next, because inside that block those rows are *already* in order, so nothing needs sorting. Range last, because a range covers a span of values, and anything after it is scattered across that span with no usable ordering left.
>
> **Putting a range before the sort field is the most common indexing mistake** — MongoDB then has to collect everything and sort it in memory, which shows up as a `SORT` stage in `explain()` and **fails outright past 32MB.**
>
> Also worth saying: a compound index only helps if your query uses fields **from the left without skipping any.** `{a, b, c}` helps queries on `a` or `a+b` — never on `b` alone. Like a phone book sorted by surname then first name: finding 'Smith' is instant, finding everyone named 'John' means reading the whole book."

### Q8. Why is my aggregation slow?
> "Usually because `$match` isn't first. **Only `$match` and `$sort` can use an index, and only at the start of the pipeline** — once any stage has transformed the data, you're working with intermediate results in memory and no index applies. So filtering a million documents down to a thousand first makes everything after it trivial.
>
> Other common causes: `$unwind` before `$match`, which multiplies your document count before you've filtered; `$lookup` on an unindexed field, which is a collection scan for every incoming document; and hitting the 100MB per-stage limit, where `allowDiskUse` makes it work but slowly — that's a symptom of not filtering early enough."

### Q9. Can you query on a virtual?
> "No — a virtual is computed in your application and doesn't exist in the database, so there's no field for MongoDB to match against. If you need to search or sort by it, it has to be a real stored field.
>
> **Virtual populate is a different thing and genuinely useful** — it defines a reverse relationship so a user can have `posts` without storing an ever-growing array of ids in the user document, which would eventually hit the 16MB limit."

---

<a name="cheatsheet"></a>
# 12. Cheat Sheet

### Schema design ⭐ (everything else follows from this)
```
EMBED      few of them · always read together · changes with the parent
REFERENCE  unlimited · used independently · own life cycle

⚠️ 16MB per document is a HARD WALL — unbounded arrays WILL hit it
⚠️ no cheap joins → duplicating data is NORMAL here
⭐ EXTENDED REFERENCE: store the id + the 2-3 fields you always show
   → cheap reads, duplicate updates. Usually the right trade.
Design around your QUERIES, not your data.
```

### Validation
```
validators run on SAVE, not on findByIdAndUpdate  → { runValidators: true }
   (an update is instructions, not a document — nothing to validate)
unique ≠ validator → it's an INDEX → duplicate-key error 11000
Mongoose validation is APP-level → scripts/mongosh bypass it
```

### Indexes ⭐
```
no index = check EVERY document (COLLSCAN)
an index = a sorted copy of a field + pointers  ← the textbook index
   → ~20 steps instead of 1,000,000

explain():  IXSCAN ✅ · COLLSCAN ❌
            totalDocsExamined vs nReturned = "read" vs "needed"
            0 examined = COVERED ⭐

⚠️ every index slows every WRITE and uses RAM → unused index = pure cost
```

### Compound + ESR ⭐
```
LEFT-TO-RIGHT, NO SKIPPING
   {a,b,c} → helps a · a+b · a+b+c     ✗ NEVER b alone
   (phone book: "Smith" instant · "all Johns" = read the whole book)

ESR = Equality → Sort → Range
   Equality first → all matches in ONE continuous block
   Sort next      → already in order, so NO sorting needed
   Range last     → a span destroys the ordering of everything after it

⚠️ range before sort = a SORT stage = FAILS past 32MB in memory
```

### Covered queries
```
answered from the INDEX ALONE — documents never opened
① every searched field in the index
② every returned field in the index
③ _id: 0 (unless _id is in it)
fast because: index is small + in RAM · documents are big + on disk
```

### Aggregation
```
$match FIRST — only $match/$sort at the START can use an index
$unwind multiplies documents → $match BEFORE it
$lookup runs per incoming document → index the field, or it's a scan each time
100MB per stage → allowDiskUse works but it's a SYMPTOM
```

### Populate ⭐
```
NOT a join → a SECOND query, stitched together in Node

⭐ THE REAL LIMIT: you CANNOT filter/sort/paginate BY a populated field
   the first query never saw that collection, so it can't sort by it
   "orders sorted by customer name" is impossible

FIX: .populate('user','name') → $lookup → store the field on the doc ⭐
```

### Transactions
```
need a REPLICA SET (fail on standalone/local dev)
cost: locks · 60s limit · coordination · retries
⭐ a single-document update is ALREADY atomic
   → needing transactions a lot = the data probably belonged in one document
```

### Cascade delete ⭐
```
NO foreign keys · NO ON DELETE CASCADE → orphans are YOUR problem
orphan = populate() returns null → o.userId.name CRASHES

⚠️ hooks are tied to the EXACT method:
   doc.deleteOne()      → document middleware ✅
   Model.deleteOne()    → a DIFFERENT hook type
   findByIdAndDelete()  → 'findOneAndDelete'
   deleteMany()         → NO per-document hooks 💥

BEST: ③ soft delete (deleted:true + pre-find filter) ⭐
      ② explicit service-layer delete in a transaction
      ④ background job for huge cascades
      ① hooks — convenient, easily bypassed

ALWAYS guard: orders.filter(o => o.userId)
```

---

*— Part 8 of the Node.js notes. Concepts: [08-sql-vs-nosql](../08-databases-sql-vs-nosql.md) · [09-indexing](../09-database-indexing.md) · [10-relationships](../10-database-relationships.md) —*
