# Database Study Notes — Part 11

## Redis Basics & Caching

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.

---

## Table of Contents

1. [Why cache at all](#why)
2. [The cache-aside pattern](#cache-aside)
3. [TTL as a backstop](#ttl)
4. [Cache invalidation on CRUD — delete vs update](#invalidation)
5. [Cache stampede](#stampede)
6. [Interview Questions & Answers](#interview)
7. [Cheat Sheet](#cheatsheet)

---

<a name="why"></a>
## 1. Why cache at all

A cache trades a small amount of staleness risk for a large latency win — reading from Redis (in-memory, sub-millisecond) is orders of magnitude faster than reading from a disk-backed database, especially for data that's read far more often than it changes (a user profile, a product listing, a computed aggregate). Caching also **offloads read load from the primary database**, which matters as much for protecting the database under high traffic as it does for the requester's latency.

---

<a name="cache-aside"></a>
## 2. The cache-aside pattern

The most common pattern in practice:

```
READ:
  1. Check the cache for the key.
  2. If HIT → return the cached value.
  3. If MISS → read from the database, write the result into the cache, return it.

WRITE:
  1. Update the database.
  2. DELETE the cache key (don't update it — see §4).
```

```js
async function getUser(id) {
  const cached = await redis.get(`user:${id}`);
  if (cached) return JSON.parse(cached);

  const user = await db.users.findById(id);
  await redis.set(`user:${id}`, JSON.stringify(user), 'EX', 3600);
  return user;
}
```

The database is always the source of truth; the cache is a disposable performance layer that can be wiped entirely and rebuilt from the database with no data loss — that property is what makes cache-aside safe.

---

<a name="ttl"></a>
## 3. TTL as a backstop

Every cached key should carry a **TTL (time-to-live)** — even with correct invalidation logic, TTL is the safety net for the invalidation paths you didn't think of (a direct database write that bypassed the app layer, a bug in the invalidation code, a race condition). Without a TTL, a missed invalidation means data stays wrong **forever**; with one, it self-heals within a bounded window even if invalidation logic fails somewhere.

---

<a name="invalidation"></a>
## 4. Cache invalidation on CRUD — delete vs update

On a write, **delete the cache key rather than updating it in place**. This is the single most important practical rule in this whole topic.

**Why delete beats update:** updating the cache from application code duplicates the exact transformation logic that produced the cached value in the first place — if that logic ever drifts from what actually got written to the database (a partial update, a computed/derived field, a different code path), the cache silently holds something that doesn't match the database. Deleting instead just removes the stale entry; the next read is a guaranteed cache miss that goes to the database — the actual source of truth — and repopulates the cache correctly from there. Delete-on-write can never encode the update-logic bug that update-on-write can.

```js
async function updateUser(id, changes) {
  await db.users.updateOne({ _id: id }, { $set: changes });
  await redis.del(`user:${id}`);   // delete, don't try to patch the cached value in place
}
```

---

<a name="stampede"></a>
## 5. Cache stampede

**What it is:** a popular key expires (or is invalidated), and a large burst of concurrent requests all miss the cache **at the same instant** — every one of them independently goes to the database to recompute/refetch the same value, all at once. Instead of one database query, the database suddenly takes N simultaneous identical queries — a self-inflicted spike that can take down the database it was supposed to be protected from.

**Mitigations:**
- **Locking** — the first request to miss acquires a lock and does the recompute; concurrent requests for the same key wait briefly (or get a slightly stale value) instead of all hitting the database independently.
- **Request coalescing** — in-process, deduplicate concurrent identical in-flight requests into a single actual database call, fanning the result out to all waiters.
- **Staggered TTLs** — add small random jitter to TTL values so a batch of keys cached at the same time don't all expire in the exact same instant.

---

<a name="interview"></a>
## 6. Interview Questions & Answers

**Q: Why does delete-on-write beat update-on-write for cache invalidation?**
A: Updating the cache duplicates the logic that produced the value in the first place — if that logic ever drifts from the actual database write (partial update, derived field, different code path), the cache silently holds wrong data with no signal anything's off. Deleting just removes the entry; the next read is guaranteed to miss and refetch from the actual source of truth, so it can't encode that class of bug.

**Q: What's a cache stampede, and how do you prevent one?**
A: A popular key expiring or being invalidated causes many concurrent requests to all miss at the same instant and hit the database simultaneously for the same recompute — a self-inflicted spike. Mitigate with locking (first miss recomputes, others wait), request coalescing (dedupe concurrent identical in-flight calls into one), or staggered TTLs (jitter so a batch of keys don't expire simultaneously).

**Q: Why keep a TTL even if your invalidation logic is correct?**
A: TTL is the backstop for invalidation paths you didn't account for — a direct DB write bypassing the app layer, a bug, a race condition. Without TTL, a missed invalidation means the cache is wrong forever; with it, staleness is bounded and self-heals.

---

<a name="cheatsheet"></a>
## 7. Cheat Sheet

- Cache trades a small staleness risk for large latency wins + reduced load on the primary database.
- Cache-aside: read = check cache → miss → read DB → populate cache. Write = update DB → **delete** cache key.
- Delete-on-write > update-on-write: deleting can't encode a drifted-update-logic bug; the next read guarantees a correct refetch from the source of truth.
- TTL is a backstop for invalidation paths you didn't think of — always set one.
- Cache stampede = many concurrent misses on the same key hit the DB simultaneously. Fix with locking, request coalescing, or jittered TTLs.
