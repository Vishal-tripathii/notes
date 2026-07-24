# System Design Study Notes — Part 10

## Database Relationships (+ Embedding vs Referencing in MongoDB)

> **Format:** Written as **Q&A** — my prompts are the questions, the explanations are the answers. Complete capture of the chat, reorganized and expanded. Diagrams, real examples, decision guides, and interview Q&A included.
>
> **Continues from:** Part 8 (SQL vs NoSQL, JOINs, normalization) and Part 9 (index foreign keys). This part is how you model the *connections* between data.

---

## Table of Contents

1. [What are database relationships?](#what)
2. [One-to-One (1:1)](#one-to-one)
3. [One-to-Many (1:N) — the most common](#one-to-many)
4. [Many-to-Many (M:N)](#many-to-many)
5. [Quick identification guide](#identify)
6. [Embedding vs Referencing (MongoDB)](#embed-ref)
7. [When to embed vs when to reference](#when)
8. [Real-life examples](#examples)
9. [Interview questions & answers](#interview)
10. [Cheat Sheet — everything on one page](#cheatsheet)

---

<a name="what"></a>
# 1. What are database relationships?

Real-world data is **connected**: a user *has* orders, a student *takes* courses, an author *writes* books. **A relationship describes how records in one table/collection connect to records in another.**

There are exactly **three** types. Identify them with **two questions**:
> 1. Can one **A** have many **B**?
> 2. Can one **B** have many **A**?

The yes/no answers tell you the type.

---

<a name="one-to-one"></a>
# 2. One-to-One (1:1)

**One record in A connects to exactly one record in B, and vice versa.**
*Can A have many B? → No. Can B have many A? → No.*

```
   USER                    PASSPORT
 ┌───────┐               ┌──────────┐
 │ Alice │ ───────────── │ P1234567 │
 └───────┘   exactly     └──────────┘
              one each
```

**Real examples:** user ↔ passport · user ↔ profile settings · country ↔ capital city.

**SQL implementation:** a foreign key with a **UNIQUE** constraint (so the link can't repeat), or keep both in the same table.
```
USERS                          USER_DETAILS
┌────┬───────┐                 ┌────┬─────────┬──────────────┐
│ id │ name  │                 │ id │ user_id │ ssn          │
├────┼───────┤                 ├────┼─────────┼──────────────┤
│ 1  │ Alice │◀────────────────│ 1  │   1     │ 123-45-6789  │   user_id is UNIQUE
└────┴───────┘                 └────┴─────────┴──────────────┘
```
> Often split to separate rarely-used or sensitive data (SSN) from the main table. 1:1 is the **rarest** — frequently you'd just use one table.

---

<a name="one-to-many"></a>
# 3. One-to-Many (1:N) — the most common

**One record in A connects to many records in B, but each B connects back to only one A.**
*Can A have many B? → Yes. Can B have many A? → No.*

```
   USER                          ORDERS
 ┌───────┐              ┌──────────────────────┐
 │ Alice │ ────────────▶│ Order #10  ($50)     │
 └───────┘        │     │ Order #11  ($30)     │
                  └────▶│ Order #12  ($75)     │
                        └──────────────────────┘
   One user, many orders — but each order belongs to ONE user.
```

**Real examples:** user → orders · YouTube channel → videos · blog post → comments · customer → addresses.

**SQL implementation:** put a **foreign key on the "many" side**, pointing back to the "one." (Index that foreign key — Part 9.)
```
USERS                    ORDERS
┌────┬───────┐           ┌────┬─────────┬────────┐
│ id │ name  │           │ id │ user_id │ amount │
├────┼───────┤           ├────┼─────────┼────────┤
│ 1  │ Alice │◀──────────│ 10 │   1     │  $50   │
└────┴───────┘◀──────────│ 11 │   1     │  $30   │   many orders point
                    ▲────│ 12 │   1     │  $75   │   to the same user
              foreign key └────┴─────────┴────────┘
```
> **The rule:** the foreign key always lives on the **"many" side**. Most common relationship.

---

<a name="many-to-many"></a>
# 4. Many-to-Many (M:N)

**Many records in A connect to many records in B.**
*Can A have many B? → Yes. Can B have many A? → Yes.*

```
   STUDENTS                          COURSES
 ┌─────────┐                       ┌──────────┐
 │ Alice   │───┬───────────────────│ Math     │
 │ Bob     │───┼───┬───────────────│ Physics  │
 │ Carol   │───┘   └───────────────│ History  │
 └─────────┘                       └──────────┘
  One student takes many courses; one course has many students.
```

**Real examples:** students ↔ courses · movies ↔ actors · products ↔ tags · users ↔ groups.

**SQL implementation:** you **can't** put a foreign key on either side (both have "many"), so add a **junction table** (join/bridge table) holding pairs of foreign keys.
```
STUDENTS          ENROLLMENTS (junction table)      COURSES
┌────┬───────┐    ┌────────────┬───────────┐        ┌────┬─────────┐
│ id │ name  │    │ student_id │ course_id │        │ id │ name    │
├────┼───────┤    ├────────────┼───────────┤        ├────┼─────────┤
│ 1  │ Alice │◀───│     1      │    101    │───────▶│101 │ Math    │
│ 2  │ Bob   │◀───│     1      │    102    │───────▶│102 │ Physics │
└────┴───────┘◀───│     2      │    101    │───────▶└────┴─────────┘
                  └────────────┴───────────┘
   Each ROW = one student-course pairing.
```
> **Key insight:** every many-to-many becomes **two one-to-many relationships** through the junction table (`Students → Enrollments` and `Courses → Enrollments`). The junction table is the "many" side of both.

---

<a name="identify"></a>
# 5. Quick identification guide

| Can A have many B? | Can B have many A? | Relationship | SQL implementation |
|---|---|---|---|
| No | No | **One-to-One** | Foreign key + UNIQUE (or same table) |
| Yes | No | **One-to-Many** | Foreign key on the "many" side |
| Yes | Yes | **Many-to-Many** | Junction table (two foreign keys) |

> Fastest way to answer "what relationship is this?" in an interview or schema design.

---

<a name="embed-ref"></a>
# 6. Embedding vs Referencing (MongoDB)

The above is the **SQL way** (foreign keys + JOINs). MongoDB (Part 8) handles relationships with **two options** — choosing between them is the classic MongoDB interview question.

## Referencing — the SQL-like way
Store the related document's **ID** (like a foreign key). Data lives in **separate collections**, looked up separately.
```json
// users collection
{ "_id": 1, "name": "Alice" }

// orders collection — references the user by ID
{ "_id": 10, "user_id": 1, "amount": 50 }
{ "_id": 11, "user_id": 1, "amount": 30 }
```
- Alice + her orders → **two queries** (or `$lookup`, MongoDB's JOIN).
- **Normalized** — no duplication.

## Embedding — the NoSQL way
**Nest** related data *inside* the parent document.
```json
// users collection — orders embedded INSIDE the user
{
  "_id": 1,
  "name": "Alice",
  "orders": [
    { "id": 10, "amount": 50 },
    { "id": 11, "amount": 30 }
  ]
}
```
- Alice + her orders → **one query** (all in one document). ⚡
- **Denormalized** — fast reads, but data can be duplicated.

---

<a name="when"></a>
# 7. When to embed vs when to reference

## Embed when… ("this data belongs to / is part of the parent")
- Child data is **accessed together** with the parent.
- **One-to-few** (bounded, small — e.g. a user's few addresses).
- Child **doesn't exist independently** (order line items make no sense without the order).
- Data **doesn't change often**.
```
Embed: user + addresses, post + tags, order + line items → "contains" / "owns"
```

## Reference when… ("this data is shared / grows unbounded / stands alone")
- **One-to-many (large)** or **many-to-many** — unbounded growth.
- Child data is **large** or would blow up the document (MongoDB **16MB document limit**!).
- Data is **shared across many parents** (avoid duplicating everywhere).
- Child is **accessed independently** (queried on its own).
- Data **changes frequently** (update in one place, not thousands of copies).
```
Reference: students ↔ courses, user ↔ millions of tweets, shared products → "related but independent"
```

## Decision cheat sheet
| Question | Embed | Reference |
|---|---|---|
| Accessed together? | ✅ Yes | ❌ Separately |
| How many children? | Few (bounded) | Many (unbounded) |
| Child exists alone? | No (owned) | Yes (independent) |
| Data shared/reused? | No | Yes |
| Changes often? | No | Yes |
| Read pattern | One fast read | Multiple / $lookup |

> **One-line rule:** **Embed for "contains" (one-to-few, read together, owned); reference for "related to" (one-to-many-large, many-to-many, shared, independent).** When unsure: *"Would this data be queried on its own, or grow without bound?"* — if yes, reference.

---

<a name="examples"></a>
# 8. Real-life examples (how to visualize what's used where)

**Instagram (Part 5 revisited):**
- **post** ↔ **comments** → could embed if few, but comments grow unbounded + paginated on their own → **reference** ("unbounded → reference").
- **post** ↔ **like count / tags** → **embed** (small, read with the post).
- **users** ↔ **followers** → many-to-many → **reference** (millions, shared).

**E-commerce (Flipkart, Part 5 revisited):**
- **order** ↔ **line items** → **embed** (owned by order, read together, bounded). ✅ Classic embed.
- **products** → **reference** (shared across many orders; price changes — don't update a million embedded copies). ✅ Classic reference.
- **products** ↔ **categories** → many-to-many → **reference**.

**Blog:**
- **post** ↔ **author** → **reference** (author shared across posts, exists independently).
- **post** ↔ **tags** (a few) → **embed** (small, bounded, read with the post).

> **How to visualize:** picture the data on screen. Always appears **together as one unit** and is **owned** by the parent → embed. A **thing in its own right** that's **linked** and reused → reference.

---

<a name="interview"></a>
# 9. Interview questions & answers

### Q: "Explain the three types of database relationships."
> *"One-to-one, where each record on both sides links to exactly one on the other — like a user and their passport. One-to-many, where one record links to many but each of those links back to one — like a user and their orders; the foreign key goes on the 'many' side. And many-to-many, where both sides can have many — like students and courses; you implement it with a junction table holding pairs of foreign keys, which effectively splits it into two one-to-many relationships."*

### Q: "How do you implement many-to-many in SQL?"
> *"You can't put a foreign key on either side because both have 'many,' so you add a third table — a junction or join table — with a foreign key to each side. Each row represents one pairing. For students and courses, an enrollments table with student_id and course_id. It becomes two one-to-many relationships pointing into the junction table."*

### Q: "In MongoDB, when do you embed vs reference?"
> *"I embed when the data is owned by the parent, accessed together, and bounded in size — like an order's line items or a post's tags. It gives one fast read. I reference when the data grows unbounded, is shared across parents, exists independently, or changes often — like products shared across orders, or a many-to-many relationship. Referencing avoids duplication and the 16MB document limit, at the cost of extra lookups. The rule of thumb is embed for 'contains,' reference for 'related to.'"*

### Q: "What's the downside of embedding?"
> *"Duplication and growth. If you embed data that's shared, you copy it into every parent, so updating it means updating many documents. And if the embedded array grows unbounded — like comments on a viral post — the document can bloat and hit MongoDB's 16MB limit. That's when you switch to referencing."*

### Q: "Why does referencing need multiple queries?"
> *"Because the related data lives in a separate collection, so you fetch the parent, then fetch the referenced documents by their IDs — either as a second query or with $lookup, MongoDB's join equivalent. Embedding avoids that by keeping everything in one document, which is faster to read but denormalized."*

---

<a name="cheatsheet"></a>
# 10. Cheat Sheet — everything on one page

### The three relationships (identify with: "can each side have many of the other?")
| Can A→many B? | Can B→many A? | Type | SQL |
|---|---|---|---|
| No | No | **One-to-One** | FK + UNIQUE (or same table) |
| Yes | No | **One-to-Many** | FK on the "many" side |
| Yes | Yes | **Many-to-Many** | Junction table (2 FKs) |

- **1:1** — user ↔ passport (rarest).
- **1:N** — user → orders (most common); FK on the many side.
- **M:N** — students ↔ courses; junction table = two 1:N relationships.

### MongoDB: embed vs reference
- **Referencing** — store the ID (like FK); separate collections; normalized; needs `$lookup`/2 queries.
- **Embedding** — nest inside parent; denormalized; one fast read; can duplicate.

### When to embed vs reference
| | Embed | Reference |
|---|---|---|
| Accessed together | ✅ | ❌ |
| Count | Few (bounded) | Many (unbounded) |
| Exists alone | No (owned) | Yes (independent) |
| Shared/reused | No | Yes |
| Changes often | No | Yes |
- **Rule:** embed for "contains," reference for "related to."
- Reference if it grows unbounded, is shared, changes often, or would hit MongoDB's **16MB doc limit**.

### Real examples
- **Embed:** order + line items, post + tags, user + addresses.
- **Reference:** products (shared), post + author, comments (unbounded), any many-to-many.

### Connects to
- Part 8: JOINs, normalization/denormalization, SQL vs NoSQL. · Part 9: index foreign keys.

### Suggested next topics
- **Message queues** (async, decoupling, spikes).
- **API design** (REST vs GraphQL, rate limiting).
- **Full system design walkthrough** (e.g. URL shortener — ties all parts together).

*— End of Part 10 —*
