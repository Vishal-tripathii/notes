# Database Study Notes — Part 19

## Machine Coding — Query & Aggregation Practice

> **Format:** write real queries, don't just recall syntax. Run each of these against an actual seeded dataset before treating it as "done" — reading a query and being able to write one under pressure are different skills.

---

### 1. A compound-index-backed filter + sort query, verified with `explain()`

```js
// Schema: orders(customerId, status, createdAt)
db.orders.createIndex({ customerId: 1, status: 1, createdAt: -1 })

db.orders.find(
  { customerId: "abc123", status: "completed" }
).sort({ createdAt: -1 })
 .explain("executionStats")

// Verify in the output: winningPlan.stage === "IXSCAN" (not COLLSCAN),
// and totalDocsExamined ≈ nReturned (not a huge gap — Part 03 §1)
```

The index covers the filter (`customerId`, `status` — left-most prefix) and the sort (`createdAt`) in one structure, so the sort doesn't require a separate in-memory sort stage after the scan.

### 2. An aggregation pipeline: top 3 orders per customer

```js
db.orders.aggregate([
  { $sort: { customerId: 1, amount: -1 } },
  { $group: {
      _id: "$customerId",
      topOrders: { $push: { orderId: "$_id", amount: "$amount" } }
  }},
  { $project: {
      topOrders: { $slice: ["$topOrders", 3] }   // keep only the top 3 per group
  }}
])
```

Sort **before** grouping so that when `$push` accumulates into the array per group, it's already in the right order for `$slice` to just take the first 3 — grouping first and sorting the array after would need an extra `$sort` inside a more complex `$map`/`$slice` combination.

### 3. A `$lookup`-based join replacing a `populate()` call

```js
// populate() version
const orders = await Order.find({ status: "completed" }).populate("customerId");

// $lookup equivalent — and note it composes with $match/$project in one round-trip,
// which populate() can't do
const orders = await Order.aggregate([
  { $match: { status: "completed" } },
  { $lookup: {
      from: "customers",
      localField: "customerId",
      foreignField: "_id",
      as: "customer"
  }},
  { $unwind: "$customer" },   // $lookup returns an array — unwind to a single object like populate() gives you
  { $project: { amount: 1, "customer.name": 1, "customer.email": 1 } }
])
```

### 4. A cursor-paginated list endpoint

```js
// GET /orders?cursor=<lastSeenId>&limit=20
app.get('/orders', async (req, res) => {
  const { cursor, limit = 20 } = req.query;
  const filter = cursor ? { _id: { $lt: new ObjectId(cursor) } } : {};

  const orders = await Order.find(filter)
    .sort({ _id: -1 })
    .limit(Number(limit) + 1);   // fetch one extra to know if there's a next page

  const hasMore = orders.length > limit;
  const page = orders.slice(0, limit);

  res.json({
    orders: page,
    nextCursor: hasMore ? page[page.length - 1]._id : null
  });
});
```

The "fetch `limit + 1`" trick avoids a separate `count()` query just to know whether a next page exists — cheap and avoids the extra round-trip.

### 5. A schema for a small domain, with an explicit embed/reference decision for every relationship

**Domain: a small e-commerce order system** — `User`, `Order`, `Product`, `Review`.

```js
// User — Address embedded: bounded (one), always read with the user (Part 09 §2)
{ _id, name, email, address: { street, city, zip } }

// Order — items embedded, User referenced:
//   items are bounded per order and always read together with it → embed
//   userId referenced because orders are unbounded per user and queried independently
//   ("show all orders today," "find order #X") → reference (Part 09 §3)
{ _id, userId, items: [{ productId, name, price, qty }], total, createdAt }

// Product — standalone collection, referenced by orders and reviews:
//   queried independently constantly (product listing pages, search) → reference
{ _id, name, price, description, stock }

// Review — Product referenced (unbounded reviews per product, and reviews are
// queried independently — "show all reviews for this product," "show all reviews
// by this user" — same reasoning as User+Orders) → reference, not embedded in Product
{ _id, productId, userId, rating, text, createdAt }
```

Every relationship above is justified by the same three factors from Part 09 §1: read-together frequency, unbounded-growth risk against the 16MB cap, and independent-query need — not a single fixed rule applied uniformly.
