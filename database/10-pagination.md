# Database Study Notes — Part 10

## Pagination

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.

---

## Table of Contents

1. [Offset pagination](#offset)
2. [Cursor pagination](#cursor)
3. [Why offset gets slower and less correct](#offset-problems)
4. [Why cursor stays O(1)-ish, and what it gives up](#cursor-tradeoff)
5. [Interview Questions & Answers](#interview)
6. [Cheat Sheet](#cheatsheet)

---

<a name="offset"></a>
## 1. Offset pagination

```sql
SELECT * FROM posts ORDER BY created_at DESC LIMIT 20 OFFSET 100;   -- page 6, 20 per page
```

```js
db.posts.find().sort({ createdAt: -1 }).skip(100).limit(20)
```

Simple to implement, and supports "jump to page 7" directly — the appeal is purely UX and implementation simplicity.

---

<a name="cursor"></a>
## 2. Cursor pagination

Instead of a page number, you pass **the last item you saw** and ask for "everything after that":

```sql
SELECT * FROM posts WHERE created_at < '2024-01-15T10:00:00Z' ORDER BY created_at DESC LIMIT 20;
```

```js
db.posts.find({ _id: { $lt: lastSeenId } }).sort({ _id: -1 }).limit(20)
```

The "cursor" is just the value (usually `_id` or a timestamp) of the last row returned on the previous page, passed back by the client on the next request.

---

<a name="offset-problems"></a>
## 3. Why offset gets slower and less correct the deeper you page

**Slower:** `OFFSET 100` doesn't teleport past the first 100 rows — the database still has to **scan and discard** them before it can start returning row 101. `OFFSET 100000` scans and throws away 100,000 rows every single time that page is requested. Cost grows linearly with how deep you page, even though you only ever return 20 rows.

**Less correct:** if rows are inserted or deleted between page loads, the "page" itself shifts underneath the user. Concretely: you're on page 2 (rows 21-40), someone deletes row 15 — now what was row 41 has shifted into row 40's position, so page 3 skips what used to be row 41, or you see row 21 again depending on direction. Offset pagination has no memory of *what* you actually saw, only *how many rows* — so concurrent writes silently produce skipped or duplicated results.

---

<a name="cursor-tradeoff"></a>
## 4. Why cursor stays O(1)-ish, and what it gives up

**Why it's fast regardless of depth:** `WHERE created_at < X` (or `_id < X`) is a direct **index seek** — the database jumps straight to that point in the sorted index and reads forward 20 rows, whether that point is row 20 or row 2,000,000 into the dataset. No scanning-and-discarding of everything before it.

**Why it's correct under concurrent writes:** the cursor is an actual value from the data ("everything after this specific point"), not a row count — inserts/deletes elsewhere in the dataset don't shift what "after this point" means, so no skipped or duplicated rows across page loads.

**What it gives up:** no "jump to page 7" — you can only page forward/backward sequentially from a known cursor, because there's no way to compute "the value at row 140" without effectively counting there. Fine for infinite-scroll feeds; a real limitation for a numbered-pages UI.

---

<a name="interview"></a>
## 5. Interview Questions & Answers

**Q: Why does offset pagination get slower as you page deeper?**
A: `OFFSET N` doesn't skip directly to row N — the database scans and discards all N rows before it, every single request. That scan cost grows linearly with page depth even though the page size stays constant.

**Q: What correctness problem does offset pagination have that cursor pagination doesn't?**
A: Offset pagination tracks position by row *count*, not by an actual value — so inserts/deletes elsewhere in the table between page loads shift what row N actually is, silently producing skipped or duplicated rows across pages. Cursor pagination tracks position by an actual value ("everything after this point"), which concurrent writes elsewhere don't affect.

**Q: What does cursor pagination give up in exchange for its performance/correctness advantages?**
A: The ability to jump directly to an arbitrary page number — you can only page sequentially forward/backward from a known cursor value, since there's no way to compute "the value at position 140" without effectively counting there.

---

<a name="cheatsheet"></a>
## 6. Cheat Sheet

- Offset (`SKIP`/`LIMIT`) = simple, supports jump-to-page, but scans-and-discards every row before the offset → O(n) cost that grows with depth, and is incorrect under concurrent inserts/deletes.
- Cursor (`WHERE x < lastSeenValue`) = index seek regardless of depth → O(1)-ish, and correct under concurrent writes since it tracks an actual value, not a row count.
- Cursor's trade-off: no "jump to page 7" — sequential paging only.
- Default to cursor pagination for infinite-scroll/feed UIs; offset is acceptable for small, rarely-changing datasets with a real numbered-pages requirement.
