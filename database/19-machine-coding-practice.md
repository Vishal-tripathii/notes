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

---

<a name="sql"></a>
## 6. SQL query practice — the classic interview problems

The MongoDB exercises above don't cover the SQL you'll be asked to write on a whiteboard. Concepts are in [Part 00.5](00.5-sql-query-patterns-and-null.md) and [Part 16](16-advanced-sql.md). Try each one before reading the answer.

**Schema used below:**
```sql
employees(id, name, salary, dept_id, manager_id)
departments(id, name)
customers(id, name, email, city)
orders(id, customer_id, amount, status, created_at)
logins(user_id, login_date)
```

### 6.1 Second-highest salary (and the Nth)
```sql
-- 2nd highest distinct salary; returns NULL if there isn't one
SELECT MAX(salary) FROM employees
WHERE salary < (SELECT MAX(salary) FROM employees);

-- Nth highest — general form
SELECT DISTINCT salary FROM (
  SELECT salary, DENSE_RANK() OVER (ORDER BY salary DESC) AS rk FROM employees
) t WHERE rk = 3;
```
Why `DENSE_RANK`: with salaries 100, 100, 90 the 2nd highest is 90. `ROW_NUMBER` would say 100; `RANK` would skip 2 entirely. The `LIMIT 1 OFFSET 1` answer is wrong for the same reason unless you add `DISTINCT`.

### 6.2 Highest-paid employee(s) per department, ties included
```sql
WITH ranked AS (
  SELECT e.*, RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS rk
  FROM employees e
)
SELECT d.name AS dept, r.name, r.salary
FROM ranked r JOIN departments d ON d.id = r.dept_id
WHERE r.rk = 1;
```
`GROUP BY dept_id` + `MAX(salary)` gives the salary but not *who* — selecting `name` there is invalid ([Part 00.5 §10](00.5-sql-query-patterns-and-null.md)).

### 6.3 Top 3 orders per customer
```sql
SELECT * FROM (
  SELECT o.*, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY amount DESC, id) AS rn
  FROM orders o
) t WHERE rn <= 3;
```
`id` as a tie-breaker makes the result deterministic. Same problem in MongoDB: §2 above and [Part 08.5 §6](08.5-aggregation-advanced.md).

### 6.4 Find duplicate emails, then delete duplicates keeping the oldest
```sql
SELECT email, COUNT(*) FROM customers GROUP BY email HAVING COUNT(*) > 1;

-- delete all but the lowest id per email
WITH d AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY email ORDER BY id) AS rn FROM customers
)
DELETE FROM customers WHERE id IN (SELECT id FROM d WHERE rn > 1);

-- Postgres alternative: self-join delete
DELETE FROM customers a USING customers b WHERE a.email = b.email AND a.id > b.id;
```
Then add `UNIQUE (email)` so it can't happen again.

### 6.5 Customers who never ordered
```sql
SELECT c.* FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);
```
Not `NOT IN` — if `orders.customer_id` contains a NULL, `NOT IN` returns nothing ([Part 00.5 §2](00.5-sql-query-patterns-and-null.md)).

### 6.6 Employees who earn more than their manager
```sql
SELECT e.name, e.salary, m.name AS manager, m.salary AS manager_salary
FROM employees e JOIN employees m ON m.id = e.manager_id
WHERE e.salary > m.salary;
```
Inner join on purpose — employees without a manager can't qualify.

### 6.7 Monthly revenue and month-over-month growth
```sql
WITH monthly AS (
  SELECT date_trunc('month', created_at) AS month, SUM(amount) AS revenue
  FROM orders WHERE status = 'paid'
  GROUP BY 1
)
SELECT month, revenue,
       revenue - LAG(revenue) OVER (ORDER BY month)                                     AS change,
       ROUND(100.0 * (revenue - LAG(revenue) OVER (ORDER BY month))
             / NULLIF(LAG(revenue) OVER (ORDER BY month), 0), 1)                         AS pct_change
FROM monthly ORDER BY month;
```
(MySQL: `DATE_FORMAT(created_at, '%Y-%m-01')` instead of `date_trunc`.) `NULLIF` avoids divide-by-zero; the first month's change is NULL.

### 6.8 Running total per customer
```sql
SELECT customer_id, created_at, amount,
       SUM(amount) OVER (PARTITION BY customer_id ORDER BY created_at, id
                         ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_total
FROM orders;
```
`ROWS` (not the default `RANGE`) so two orders with the same timestamp don't both show the combined total ([Part 00.5 §8](00.5-sql-query-patterns-and-null.md)).

### 6.9 Users who logged in on 3+ consecutive days (gaps and islands)
```sql
WITH d AS (
  SELECT DISTINCT user_id, login_date FROM logins
),
g AS (
  SELECT user_id, login_date,
         login_date - (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY login_date))::int AS grp
  FROM d
)
SELECT user_id, MIN(login_date) AS streak_start, COUNT(*) AS days
FROM g GROUP BY user_id, grp
HAVING COUNT(*) >= 3;
```
The trick: within a run of consecutive dates, `date − row_number` is constant, so it labels each "island." (MySQL: `DATE_SUB(login_date, INTERVAL rn DAY)`.)

### 6.10 Pivot: order counts per status, one row per customer
```sql
SELECT customer_id,
       COUNT(*) FILTER (WHERE status = 'paid')     AS paid,        -- Postgres
       COUNT(*) FILTER (WHERE status = 'refunded') AS refunded,
       SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS paid_amount   -- portable form
FROM orders GROUP BY customer_id;
```

### 6.11 Full reporting chain for an employee (recursive CTE)
```sql
WITH RECURSIVE chain AS (
  SELECT id, name, manager_id, 0 AS level FROM employees WHERE id = 42
  UNION ALL
  SELECT m.id, m.name, m.manager_id, c.level + 1
  FROM employees m JOIN chain c ON m.id = c.manager_id
)
SELECT * FROM chain ORDER BY level;
```
MongoDB equivalent: `$graphLookup` ([Part 08.5 §5](08.5-aggregation-advanced.md)).

### 6.12 Customers who ordered in January but not in February
```sql
SELECT DISTINCT o.customer_id FROM orders o
WHERE o.created_at >= '2026-01-01' AND o.created_at < '2026-02-01'
  AND NOT EXISTS (
    SELECT 1 FROM orders f
    WHERE f.customer_id = o.customer_id
      AND f.created_at >= '2026-02-01' AND f.created_at < '2026-03-01');
```
Half-open date ranges (`>= start AND < next_start`) avoid the "midnight on the last day" bug and stay index-friendly ([Part 02 §6](02-sql-indexes.md)).

**After writing each one:** run `EXPLAIN` on it and name the index that would make it fast (e.g. 6.3 → `orders(customer_id, amount DESC)`; 6.5 → `orders(customer_id)`).
