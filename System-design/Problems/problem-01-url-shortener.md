# Design Problem 01 — URL Shortener (bit.ly / TinyURL)

> **Signature challenge:** generating a unique short code at scale, and serving redirects with near-zero latency.
>
> **⚠️ Structure — flow-first** (same as [Problem 10](problem-10-uber-ride-sharing.md)):
>
> ```
> PART I  — establish the FLOW,  driven by FUNCTIONAL requirements     ("what does it do?")
> PART II — make it WORK AT SCALE, driven by NON-FUNCTIONAL requirements ("what breaks?")
> ```
>
> The architecture is **built incrementally, one functional requirement at a time** — each stage adds only what that requirement forces, and the diagram grows with it (★ marks what's new). Only then do the non-functional requirements become deep dives, each walked **bad → good → great**.
>
> **Why this problem is the best one to start with:** it looks trivial — it's a hash map with a web server in front. That's exactly why it's a good interview: the design is small enough that you can't hide, so the entire signal comes from how carefully you handle *code generation*, *the read path*, and *the details* (301 vs 302, custom-alias collisions, negative caching, abuse).

---

## Table of Contents

**PART I — Establish the flow**
1. [Requirements](#requirements)
2. [Core Entities](#entities)
3. [API Design](#api)
4. [High-Level Design — built one requirement at a time](#hld)
   - [4.1 Shorten a URL](#hld1)
   - [4.2 Redirect](#hld2)
   - [4.3 Custom alias & expiry](#hld3)
   - [4.4 Click counting](#hld4)
   - [4.5 The complete flow](#hld5)

**PART II — Make it work at scale**

5. [Capacity Estimation — where the numbers bite](#estimation)
6. [Deep Dive 1 — Generating the short code 🎯](#dd1)
7. [Deep Dive 2 — The redirect read path](#dd2)
8. [Deep Dive 3 — 301 vs 302 (and why it's not really about caching)](#dd3)
9. [Deep Dive 4 — Storage & sharding](#dd4)
10. [Deep Dive 5 — Abuse: your product is a phishing tool ⚠️](#dd5)
11. [Database — consolidated](#db)
12. [Final architecture](#arch)
13. [How the real system does it](#realworld)
14. [Interview Q&A](#interview)
15. [Cheat Sheet](#cheatsheet)

---
---

# PART I — ESTABLISH THE FLOW

*Driven by the **functional** requirements. Goal: a working system, correctness before scale.*

---

<a name="requirements"></a>
# 1. Requirements *(Part 1)*

### Functional — in scope
1. Submit a **long URL**, get a **short URL** back.
2. Visiting the short URL **redirects** to the original.
3. Optionally specify a **custom alias** (`short.ly/my-launch`).
4. Optionally set an **expiration**.
5. **Count clicks** per link.

### Functional — explicitly out of scope
*Scope out loud and get agreement — narrowing is graded.*
- User accounts, auth, a link-management dashboard
- Editing or deleting an existing link
- Rich analytics (geography, referrer breakdowns, time series)
- Link-preview / safety interstitial pages

### Non-functional — in scope
1. **Uniqueness, permanently** — one short code maps to exactly one URL, forever. A collision means a user's link silently sends people somewhere else.
2. **Low redirect latency** — this sits on the **critical path of a page load**; the user is staring at a blank screen waiting for it. Target p99 well under ~100ms.
3. **Extreme read skew** — roughly **100:1** reads to writes, often far worse.
4. **High availability of the *read* path** — a dead redirect breaks **every link ever shared**, including ones printed on paper. Read availability matters more than write availability.
5. **Durability** — links are expected to work for years, and a lost mapping is **unrecoverable**: you cannot reconstruct a long URL from a short code.

### Non-functional — out of scope
GDPR/data-residency · monitoring & alerting · CI/CD · disaster-recovery drills

> **The framing sentence to open with:** *"This is a read-heavy, immutable key-value lookup. Two facts drive everything: once created, a mapping **never changes**, and reads outnumber writes by a hundred to one or more. Immutability is what makes the caching story unusually easy, and the read skew is what makes caching the whole design."*

**The mapping — each non-functional requirement becomes a deep dive:**

| Non-functional requirement | Becomes |
|---|---|
| Uniqueness, permanently | [DD1 — generating the short code](#dd1) |
| Low redirect latency + read skew | [DD2 — the redirect read path](#dd2) |
| Read skew **vs** click counting | [DD3 — 301 vs 302](#dd3) |
| Durability at billions of rows | [DD4 — storage & sharding](#dd4) |
| *(not an NFR — an inherent property of the product)* | [DD5 — abuse](#dd5) |

---

<a name="entities"></a>
# 2. Core Entities

Two entities. The interesting part is how differently they behave.

| Entity | Fields | Notes |
|---|---|---|
| **ShortLink** | `shortCode` (PK) · `longUrl` · `createdAt` · `expiresAt` · `isCustom` | ⭐ **Immutable after creation** |
| **ClickEvent** | `shortCode` · `timestamp` · `referrer` · `userAgent` | ⭐ High volume, low value, approximate is fine |

**Two observations that shape the whole design:**

**① `ShortLink` is immutable.** Once written, `shortCode → longUrl` never changes. This is a much stronger property than it sounds: **cache invalidation — the hard part of most caching — simply doesn't exist here.** A cached entry can never go stale, so you can cache aggressively, everywhere, effectively forever. Most designs fight their cache; this one doesn't. ([DD2](#dd2) is built on this.)

**② The two entities have opposite profiles.** `ShortLink` is written ~40 times a second and **must survive for years**. `ClickEvent` is written ~4,000 times a second and **nobody cares if a few are lost**.

> Same structural insight as [Problem 10 §2](problem-10-uber-ride-sharing.md#entities): *the high-volume data is the low-value data.* Keep them apart, and never let click counting touch the redirect's critical path.

---

<a name="api"></a>
# 3. API Design *(Part 11)*

```
① Create a short link  (FR1, FR3, FR4)
POST /api/v1/urls
Body: { "longUrl": "https://example.com/very/long/path?x=1",
        "customAlias": "my-launch",        ← optional
        "expiresAt": "2027-01-01T00:00:00Z" }  ← optional
→ 201 { "shortUrl": "https://short.ly/aB3xK9p", "shortCode": "aB3xK9p", "expiresAt" }
→ 409 { "error": "alias already taken" }   ← custom alias collided

② Redirect  (FR2)
GET /{shortCode}
→ 302 Found
   Location: https://example.com/very/long/path?x=1
   Cache-Control: private, max-age=0
→ 404 if unknown  ·  410 Gone if expired
```

**Three decisions worth defending:**

1. **The redirect lives at the root path (`GET /{shortCode}`), not `/api/v1/redirect/{code}`.** The entire product is short URLs — every character in the path costs. This is the rare case where API-design orthodoxy loses to the product requirement.
2. **`410 Gone` for expired, not `404 Not Found`.** They mean different things: 404 is "never existed," 410 is "existed, deliberately gone." Free semantic precision, and it lets a client distinguish a typo from an expired link.
3. **No `longUrl` in the response of the redirect** — the redirect *is* the response. And the `Location` header is the whole payload; a body would be wasted bytes on the hottest path in the system.

---

<a name="hld"></a>
# 4. High-Level Design — built one requirement at a time

**The rule: no component appears until a functional requirement forces it.**

---

<a name="hld1"></a>
## 4.1 — FR1: Shorten a URL

Accept a long URL, produce a unique code, store the mapping, return the short URL.

```
   [Client]
      │  POST /api/v1/urls { longUrl }
      ▼
  ┌──────────────────┐
  │  API Gateway ★   │   authN (if any), rate limiting     (Parts 15, 23)
  └──────────────────┘
      │
      ▼
  ┌──────────────────┐
  │ Shorten Service ★│   validate URL → generate code → store
  └──────────────────┘
      │
      ▼
  ┌──────────────────────────────────────┐
  │  Database ★                          │
  │   ShortLink { shortCode(PK), longUrl,│
  │               createdAt, expiresAt } │
  └──────────────────────────────────────┘
```

**Decisions made here:**
- **Validate the URL before storing.** Is it a well-formed absolute URL? Is the scheme `http`/`https` (not `javascript:` or `file:`)? Does it point back at your own domain, creating a redirect loop? Cheap checks that prevent real problems — and the first hint of [DD5](#dd5).
- **Generating a unique code is hand-waved for now.** *This is deliberate.* It's the signature challenge and it belongs in [DD1](#dd1), once we know the write rate and the code-space math.
- **Idempotency is *not* required here**, unusually. If a retry creates a second short code for the same long URL, both work and both point to the right place — a duplicate row, not a correctness bug. Worth saying out loud, because it's a genuine contrast with most `POST` endpoints and shows you're reasoning rather than pattern-matching. *(You may still choose to dedupe to save space — that's an optimization, not a correctness requirement.)*

---

<a name="hld2"></a>
## 4.2 — FR2: Redirect

Look up the code, return a redirect. Structurally trivial — and this is where you notice something important.

```
   [Client]                        [Browser hitting a short link]
      │  POST /api/v1/urls                   │  GET /{shortCode}
      ▼                                      ▼
  ┌────────────────────────────────────────────────┐
  │              API Gateway                        │
  └────────────────────────────────────────────────┘
      │                                      │
      ▼                                      ▼
  ┌──────────────────┐              ┌──────────────────────┐
  │ Shorten Service  │              │ Redirect Service ★   │
  │  (~40 writes/s)  │              │  (~4,000 reads/s)    │
  └──────────────────┘              └──────────────────────┘
      │                                      │
      └──────────────┬───────────────────────┘
                     ▼
          ┌────────────────────────┐
          │  Database: ShortLink   │
          └────────────────────────┘
```

**The observation that shapes Part II:** the read path and the write path are **the same data but completely different workloads** — 100× the traffic, a far tighter latency budget, and a much stronger availability requirement.

**So split them into separate services**, even though they share a database:
- They **scale independently** — the redirect fleet grows with click traffic; the shorten fleet barely grows at all.
- They **fail independently** — if link *creation* goes down, every existing link still works. That's exactly the right failure mode, and it directly serves NFR 4 ("read availability > write availability").
- Their **latency budgets differ by an order of magnitude** — nobody minds 300ms to create a link; 300ms on a redirect is a visibly slow page load.

> *"I'd split shorten and redirect into separate services sharing one datastore. Not for code cleanliness — because if link creation falls over, every link ever shared must keep working, and that's only true if the two paths don't share a fate."*

---

<a name="hld3"></a>
## 4.3 — FR3 + FR4: Custom alias & expiry

**No new components** — but two real subtleties appear.

### The custom alias namespace collision ⭐
A user claims `short.ly/sale`. Later, your generator produces the code `sale`. **Now two links claim one code.**

They share **one namespace**, so they need **one uniqueness authority**:

```sql
CREATE TABLE short_links (
  short_code  VARCHAR(16) PRIMARY KEY,   -- ← the PK IS the uniqueness guarantee
  long_url    TEXT NOT NULL,
  is_custom   BOOLEAN,
  expires_at  TIMESTAMP NULL
);
```

Insert both generated codes and custom aliases into the **same table with the same primary key**. Then:
- Custom alias already taken → **insert fails → `409 Conflict`**. The database enforces it, not application logic.
- Generated code happens to hit an existing custom alias → **insert fails → regenerate**. Rare, and self-correcting.

> Same principle as the idempotency key in [Problem 16 §4a](problem-16-payment-system-upi.md#core) and inventory in [Problem 18 §4b](problem-18-ecommerce-amazon.md#core): **let the database's uniqueness constraint be the mechanism, never a read-then-write check in application code** — which has a race between the read and the write.

**Also reserve a blocklist:** `admin`, `login`, `api`, `settings`, `static` — anything that would shadow a real route or enable impersonation.

### Expiry is checked lazily on read
Don't run a bulk `DELETE ... WHERE expires_at < NOW()`. Instead:
- **Read path checks `expiresAt`** → past it, return `410 Gone` regardless of whether the row still exists. **This is what makes expiry correct**, and it means nothing depends on a cleanup job running on time.
- **Reclaim in the background** — and prefer dropping time-partitions over row-by-row deletion. *(Full treatment in [Problem 03 §9.5](problem-03-pastebin.md#realworld) — same problem, worked there.)*

---

<a name="hld4"></a>
## 4.4 — FR5: Click counting

We need click counts. We must **not** pay for them on the redirect path.

```
   [Browser] ── GET /{shortCode} ──▶ ┌──────────────────────┐
                                     │  Redirect Service    │
                  ◀── 302 Location ──│  (responds FIRST)    │
                                     └──────────────────────┘
                                              │  fire-and-forget ★
                                              ▼
                                     ┌──────────────────────┐
                                     │  Queue ★  (Part 13)  │
                                     └──────────────────────┘
                                              │
                                     ┌──────────────────────┐
                                     │ Analytics Workers ★  │
                                     └──────────────────────┘
                                              │
                                     ┌──────────────────────┐
                                     │ Analytics Store ★    │
                                     └──────────────────────┘
```

**Decisions made here:**
- **Respond first, record after.** The 302 goes out before (or concurrently with) the click event being enqueued. The user never waits on analytics.
- **A synchronous `UPDATE links SET clicks = clicks + 1` is the mistake to name.** It turns every read into a write, puts write contention on your hottest rows (viral links), and couples redirect availability to database write availability. It is the single most common wrong answer in this design.
- **Approximate is fine.** Losing a fraction of a percent of click counts costs nothing. This is explicitly *not* the billing-grade counting of [Problem 19](problem-19-ad-click-aggregator.md) — say so, because knowing when you *don't* need exactness is as valuable as knowing when you do.
- **This requirement is why the redirect must be a `302`.** A `301` lets browsers skip your server entirely, and you'd count each user once and then never again. → [DD3](#dd3).

---

<a name="hld5"></a>
## 4.5 — The complete flow

```
   [Client: create]                       [Browser: click a link]
        │  POST /api/v1/urls                      │  GET /{shortCode}
        ▼                                         ▼
   ┌────────────────────── API Gateway ──────────────────────┐
   └─────────────────────────────────────────────────────────┘
        │                                         │
        ▼                                         ▼
  ┌──────────────────┐                  ┌──────────────────────┐
  │ Shorten Service  │                  │  Redirect Service    │
  │  • validate URL  │                  │  • look up code      │
  │  • generate code │                  │  • check expiry      │
  │  • INSERT (PK    │                  │  • 302 Location      │
  │    enforces      │                  └──────────────────────┘
  │    uniqueness)   │                             │
  └──────────────────┘                             │ fire-and-forget
        │                                          ▼
        │                                  ┌────────────────┐
        │                                  │ Queue →        │
        │                                  │ Analytics      │
        ▼                                  └────────────────┘
   ┌────────────────────────────────────┐
   │  Database:  ShortLink              │
   └────────────────────────────────────┘
```

**The happy path in one breath:**

> *"Client posts a long URL. The shorten service validates it, generates a unique short code, and inserts the mapping — with the primary key enforcing uniqueness, so a custom alias that's already taken just fails the insert and returns a 409. Later, someone clicks the short link: the redirect service looks up the code, checks it hasn't expired, and returns a 302 with the original URL in the Location header. It fires the click event onto a queue without waiting, so analytics never sits on the redirect's latency path."*

**✅ Part I done: the system works.** Nothing scales yet — and that's fine, because you can't sensibly optimize a flow you haven't drawn.

---
---

# PART II — MAKE IT WORK AT SCALE

*Driven by the **non-functional** requirements. Each deep dive names what breaks, then walks **bad → good → great**.*

---

<a name="estimation"></a>
# 5. Capacity Estimation — where the numbers bite *(Part 3)*

Assume **100M new URLs/month**, 100:1 read:write.

| Number | Value | What it forces |
|---|---|---|
| **Writes/sec** | 100M ÷ (30×24×3600) ≈ **~40/s** | ⭐ **Trivially small.** A single database handles this. **Writes are not the problem** — say this explicitly, it stops you over-engineering. |
| **Reads/sec** | 40 × 100 ≈ **~4,000/s** (peaks far higher on a viral link) | The whole design. → [DD2](#dd2) |
| **Total URLs (5yr)** | 100M × 12 × 5 = **~6 billion rows** | ~500B/row ≈ **~3TB** — one machine *can* hold it, but reads and HA argue for sharding. → [DD4](#dd4) |
| **Code space needed** | 6B, with headroom | Drives the length calculation below. → [DD1](#dd1) |

**Short-code length (Base62 = `0-9A-Za-z` = 62 chars):**

```
   62⁵ ≈ 916 million        ✗  too small
   62⁶ ≈ 56.8 billion       ~  works, but only ~10× headroom over 6B
   62⁷ ≈ 3.5 TRILLION       ✅  ~580× headroom  → use 7 characters
```

> **The estimation's real punchline:** *"~40 writes a second and ~4,000 reads a second. The write path is almost free — the interesting engineering is entirely on the read path and in code generation. And 7 Base62 characters gives 3.5 trillion codes against 6 billion needed, so the keyspace is a non-issue."*

---

<a name="dd1"></a>
# 6. Deep Dive 1 — Generating the short code 🎯
### *Driven by: uniqueness, permanently*

Produce a unique 7-character code, at scale, without coordination.

### ❌ Bad — hash the URL and truncate

```
MD5("https://example.com/…") → Base62 → take first 7 chars
```

Three problems:
- **Collisions are guaranteed by the pigeonhole principle.** You're mapping unlimited URLs into 3.5 trillion codes, and truncating throws away most of the hash's bits. Two different URLs *will* eventually produce the same 7 characters.
- **Therefore every write needs a read-before-write** — check whether the code exists and whether it maps to *this* URL or a different one. That's an extra round trip on every creation, and the collision rate rises as the table fills.
- **Subtle product bug:** the same long URL always produces the same code, so two users shortening the same link **share one short code** — and therefore share click analytics, expiry, and takedown. Usually not what anyone wants.

### ⚠️ Good — a global counter + Base62

Maintain one incrementing counter; Base62-encode each value.

```
        1 → "1"          125 → "cb"          1,000,000 → "4c92"
```

- ✅ **Zero collisions, by construction** — each integer is used once.
- ✅ No read-before-write.
- ❌ **The counter is a single point of failure and a coordination point on every single write.**
- ❌ **Codes are sequential and trivially guessable** (see below).
- ❌ Early numbers encode to short strings → pad to 7, or start the counter at 62⁶ so every code is naturally ≥7 chars.

**The standard fix for the bottleneck — counter batching:** each app server claims a *range* (say 1,000 values) from a central counter (Redis `INCRBY`, or ZooKeeper) and serves from it locally. That's one coordination round trip per 1,000 writes instead of per write. Gaps appear when a server dies mid-range — completely harmless, since you have 3.5 trillion codes.

### ✅ Great — a distributed ID (Snowflake-style) → Base62

```
   64-bit ID:  [ timestamp | machine ID | sequence ]
                          │  Base62 encode
                          ▼
                    7 chars ≈ 3.5 trillion codes
```

- **No coordination at all** — each generator mints IDs independently; the embedded machine ID makes collisions *structurally impossible*.
- **No SPOF**, unlike the central counter.
- **No read-before-write**, unlike hashing.
- ⭐ **The machine ID doubles as a shard key** — see [DD4](#dd4). Two problems, one move.

**Alternative: a Key Generation Service (KGS).** Pre-generate billions of random unique codes offline into a table; hand one out per request and mark it used. Gives **unguessable** codes with no runtime collision check. Costs: a service to run, a table of unused keys, and care around handing the same key to two requests (take from a partitioned pool, or use an atomic pop).

### Base62, not Base64 — and it's a real reason
Base64's alphabet contains `+` and `/`, which are **reserved characters in a URL** and must be percent-encoded — turning a 7-char code into something longer and uglier. Its URL-safe `-`/`_` variant still risks trouble when a code is copied from running text or double-clicked. **Base62 (`0-9A-Za-z`) is the largest alphabet that is unambiguously URL-safe with no escaping.**

### ⚠️ The guessability problem — raise it unprompted
Counter-based and timestamp-ordered codes are **predictable**, with two concrete consequences:

1. **Business-intelligence leak.** Shorten two URLs an hour apart, decode both, subtract — you've published your creation rate to a competitor.
2. **Enumeration.** Walk the keyspace and harvest every link ever created. **People treat "unguessable" as "private"** — shortened URLs routinely contain private documents, invitations, and internal dashboards.

**Fix:** add random bits, use a KGS, or **encrypt the ID before encoding it** — a block cipher over the integer keeps it fixed-length and reversible while destroying the ordering.

---

<a name="dd2"></a>
# 7. Deep Dive 2 — The redirect read path
### *Driven by: low latency + 100:1 read skew*

~4,000 reads/sec steady, far higher when a link goes viral, on the **critical path of a page load**.

### ❌ Bad — hit the database on every redirect
Works at 4,000/s with a well-indexed key-value lookup. Falls over the moment a link goes viral and 100K people click it in a minute, and every millisecond of database latency is a millisecond the user spends looking at a blank screen.

### ⚠️ Good — cache-aside in Redis

```
GET /{code} → Redis?  ──HIT──▶ 302 (~1ms)
                 │
               MISS
                 ▼
              Database → populate Redis → 302
```

### ✅ Great — cache-aside, **plus the three things that make this cache unusual**

**① The mapping is immutable → cache invalidation doesn't exist.** ⭐

This is the most important sentence in the deep dive. In most systems the cache is hard *because of invalidation* — you must detect when the underlying data changed and evict. Here, `shortCode → longUrl` **never changes after creation**, so:
- Entries can be cached **effectively forever** (evict on memory pressure via LRU, not on staleness).
- **No invalidation logic, no cache-coherence bugs, no stale reads. Ever.**
- You can safely cache at **every** layer — app memory, Redis, even CDN edge.

> *"The property I'd lean on hardest is that the mapping is immutable. Cache invalidation is normally the hard part of caching, and here it simply doesn't exist — which is why I'd cache aggressively at multiple layers rather than carefully at one."*

**② Access is extreme power-law.** A small number of links (a viral tweet, a campaign) account for the overwhelming majority of clicks, while billions of old links are never touched. That means a modest cache holding the hot set delivers a **very high hit ratio** — most redirects never reach the database.

**③ Negative caching — the one people miss.** ⭐

Bots and scanners hammer random codes that **don't exist**. With only positive caching, every one of those is a guaranteed cache miss and a **guaranteed database hit** — so an attacker can drive 100% of their traffic straight through your cache into your database.

Two fixes:
- **Cache the negative result** with a short TTL (`code → NOT_FOUND`, 30s).
- **Bloom filter (Part 27)** of all existing codes in front of the cache: "definitely doesn't exist" → return 404 without touching anything. No false negatives means you never wrongly reject a real code; the false positives just fall through to a normal lookup.

**Also handle the cache stampede.** When a link goes viral from cold, thousands of simultaneous misses all hit the database for the *same* key. **Request coalescing** — the first miss fetches, the rest wait on that in-flight request. Same idea as the origin shield in [Problem 11 §7](problem-11-video-streaming.md).

---

<a name="dd3"></a>
# 8. Deep Dive 3 — 301 vs 302 (and why it's not really about caching)
### *Driven by: read skew vs FR5 (click counting)*

| | **301 Moved Permanently** | **302 Found** |
|---|---|---|
| Browser caches the redirect | ✅ Yes, aggressively | ❌ No |
| Subsequent clicks | **Skip your server entirely** | Hit your server every time |
| Click analytics | ❌ Lost after the first click | ✅ Complete |
| Server load | Much lower | Higher |
| Can you change the target later? | ❌ Effectively no | ✅ Yes |

### The argument everyone gives
"302, because we need analytics." True, and it's FR5 — but it's the *weaker* argument.

### ⭐ The argument that actually matters: **revocation**

A cached `301` is, for practical purposes, **permanent and irrevocable**. A browser that cached it **will never ask you again**. So:

> If a link is later found to point at malware, a phishing page, or content that must be taken down — **you cannot revoke it** for anyone who has already clicked. Your takedown mechanism does not reach them. Ever.

Given [DD5](#dd5) — that a URL shortener is inherently an abuse vector and *will* be used to distribute malicious links — **the ability to revoke is a safety requirement, not a feature.** That makes 302 the correct answer even if you didn't care about analytics at all.

> **How to answer:** *"302. The usual reason given is analytics, and that's real — a 301 means I count each user once and never again. But the stronger reason is revocation: a cached 301 is effectively permanent, so if a link later turns out to point at malware I can't take it down for anyone who already clicked. Since a shortener is inherently an abuse vector, being able to revoke is a safety requirement. The cost is more traffic hitting my servers, and that's exactly what the cache in DD2 is for — an in-memory lookup is about a millisecond, so I'm buying safety and analytics very cheaply."*

**And set `Cache-Control` explicitly.** Don't rely on the status code alone — some intermediaries cache 302s. `Cache-Control: private, max-age=0` makes the intent unambiguous.

*(307/308 exist and preserve the HTTP method. Irrelevant here — this is always a `GET`.)*

---

<a name="dd4"></a>
# 9. Deep Dive 4 — Storage & sharding
### *Driven by: durability at billions of rows*

**Start by saying what isn't a problem:** ~40 writes/sec and ~3TB is comfortably within one well-provisioned database. **You shard for read throughput, availability, and headroom — not because the write rate demands it.** Saying that shows judgment; jumping straight to sharding shows pattern-matching.

**Shard by `shortCode`** (hash-partitioned). It's the perfect shard key:
- **Every** query is `WHERE short_code = ?` — a single-shard point lookup. There are no range scans, no joins, no cross-shard queries. Ever.
- Hashing distributes uniformly, so there are no hot shards *by key* (a hot *link* is handled by cache, not by sharding).

### ⭐ The machine-ID prefix trick — two problems, one move

Reuse [DD1](#dd1)'s distributed ID: embed the generating machine's ID in the code itself.

```
Machine 1: "1" + "aB3xK" → "1aB3xK"
Machine 2: "2" + "aB3xK" → "2aB3xK"   ← same local counter, different code
```

- ✅ Codes **never collide across machines**, with **zero coordination**.
- ⭐ **The prefix *is* the shard key.** `"2aB3xK"` → prefix `2` → route straight to shard 2, **with no lookup table on the read path**.

That's the Snowflake idea (embed the machine ID) doing double duty. *(Same technique as Instagram's ID scheme — [Problem 05 §9.5](problem-05-instagram.md#realworld).)*

**Replication (Part 21):** read replicas absorb cache misses; a replicated primary gives failover. Given NFR 4, **read availability is what you protect** — you can tolerate the write path being down far longer than the read path.

**Database choice:** a pure key-value access pattern with no joins → **NoSQL fits naturally** (DynamoDB/Cassandra), and shards on `shortCode` out of the box. SQL is entirely fine at smaller scale with an index on `short_code` — and gives you the unique constraint from [§4.3](#hld3) for free.

---

<a name="dd5"></a>
# 10. Deep Dive 5 — Abuse: your product is a phishing tool ⚠️
### *Driven by: the nature of the product, not a stated requirement*

**This is the deep dive most candidates never raise, and it's the one that signals real-world experience.**

The entire value proposition of a URL shortener is **hiding the destination**. That is also, exactly, what a phisher wants. You have not built a link shortener that *can be* abused — you have built abuse infrastructure that also has legitimate uses.

**The threats:**

| Threat | What it looks like |
|---|---|
| **Phishing / malware** | Short link hides `evil-bank-login.xyz` |
| **Bypassing filters** | Corporate/email blocklists see *your* trusted domain, not the destination |
| **Spam at volume** | Scripts generating millions of links |
| **Open redirect abuse** | Your domain used to lend credibility to a malicious destination |
| **Redirect loops/chains** | Shortener → shortener → shortener, or pointing back at yourself |

**Mitigations, roughly in order of value:**

1. **Scan destinations at creation time** against a safe-browsing/threat-intel list. Reject or flag known-bad URLs.
2. ⭐ **Re-scan periodically.** This is the non-obvious one: **a URL that is benign at creation can turn malicious later** — attackers deliberately shorten a clean page, get it distributed, then change what it serves. A one-time check at creation is close to worthless on its own.
3. **Rate-limit creation** per IP/account (Part 23) — Redis `INCR` + TTL. Blunts bulk generation.
4. **Interstitial warning page** for flagged-but-unconfirmed links: "you're about to leave for `example.com` — continue?" Shows the destination and restores the informed consent that shortening removed.
5. **Takedown capability** — flip a link to disabled and serve a warning instead. ⭐ **This only works because of the 302 decision in [DD3](#dd3)** — with cached 301s you'd have no reach.
6. **Reject self-referential and chained redirects** at creation — cheap, prevents loops and layered obfuscation.
7. **Never redirect to non-`http(s)` schemes.** `javascript:`, `data:`, and `file:` URLs are attack payloads, not destinations.

> **How to raise it:** *"One thing I'd flag that isn't in the requirements: the core feature of this product — hiding the destination — is also exactly what a phisher wants, so abuse isn't an edge case here, it's a structural property. I'd scan destinations against a threat-intel list at creation, but more importantly re-scan periodically, because attackers shorten a clean page and change what it serves after distribution. I'd rate-limit creation, show an interstitial for flagged links so the user can see where they're going, and keep a takedown path — which, incidentally, is a second reason for 302 over 301, since a cached 301 is unreachable by any takedown I do later."*

---

<a name="db"></a>
# 11. Database — consolidated *(Part 8)*

| Data | Pattern | Store |
|---|---|---|
| **ShortLink** (`shortCode → longUrl`) | ~40 writes/s, ~4,000 reads/s, **immutable**, must last years | **NoSQL key-value** (DynamoDB/Cassandra) sharded by `shortCode`; SQL fine at smaller scale (PK gives uniqueness free) |
| **Hot mappings** | The actual read path | **Redis cache-aside** — cacheable forever (immutable), plus **negative cache / Bloom filter** ([DD2](#dd2)) |
| **Code generation state** | Counter ranges, if using batching | Redis `INCRBY` — one round trip per 1,000 codes |
| **ClickEvent** | ~4,000 writes/s, approximate is fine | **Queue → analytics store.** Never the primary DB, never synchronous |
| **Reserved words / blocklist** | Tiny, read on every custom alias | In-memory set |

```
short_links
┌──────────────┬──────────┬────────────┬────────────┬───────────┐
│ short_code   │ long_url │ created_at │ expires_at │ is_custom │
│ (PK, UNIQUE) │          │            │  (NULL ok) │           │
└──────────────┴──────────┴────────────┴────────────┴───────────┘
        ▲
        └── the PRIMARY KEY is the uniqueness mechanism for BOTH
            generated codes and custom aliases (§4.3)
```

> **Note what's *not* here:** no `clicks` column on `short_links`. Incrementing a counter on the link row would turn every read into a write, contend on exactly the hottest rows, and couple redirect availability to write availability. Clicks live in the analytics store.

---

<a name="arch"></a>
# 12. Final architecture

Part I's flow with Part II's machinery. **★ marks what Part II added.**

```
   [Client: create]                          [Browser: click]
        │                                          │
        ▼                                          ▼
   ┌──────────── API Gateway — rate limit ★ (DD5) ──────────────┐
   └─────────────────────────────────────────────────────────────┘
        │                                          │
        ▼                                          ▼
  ┌──────────────────────┐              ┌────────────────────────┐
  │ Shorten Service ×N   │              │ Redirect Service ×N    │
  │  • validate + scan ★ │              │  • 302 (revocable ★)   │
  │  • Snowflake ID ★    │              └────────────────────────┘
  │    → Base62          │                          │
  │  • INSERT (PK = uniq)│                          ▼
  └──────────────────────┘              ┌────────────────────────┐
        │                               │ Bloom filter ★ (Pt 27) │
        │                               │  "code doesn't exist"  │
        │                               └────────────────────────┘
        │                                          │ maybe exists
        │                                          ▼
        │                               ┌────────────────────────┐
        │                               │ REDIS CACHE ★          │
        │                               │  immutable → no        │
        │                               │  invalidation ever     │
        │                               │  + negative cache ★    │
        │                               │  + request coalescing ★│
        │                               └────────────────────────┘
        │                                          │ miss
        ▼                                          ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  ShortLink DB — sharded by shortCode ★ (machine-ID prefix =   │
  │  shard key), replicated ★, read replicas ★                    │
  └──────────────────────────────────────────────────────────────┘
                                                   │
                            fire-and-forget ───────┘
                                     ▼
                    ┌────────────────────────────────┐
                    │ Queue ★ → Analytics Workers ★  │
                    │ → Analytics Store ★            │
                    └────────────────────────────────┘

        [ Periodic re-scan job ★ (DD5) ] ──▶ flags/disables malicious links
```

**Read path:** `GET /{code}` → Bloom filter (reject non-existent) → Redis (very high hit rate, never invalidated) → DB on miss (coalesced) → check expiry → **302** → fire click event async.
**Write path:** validate + threat-scan → Snowflake ID → Base62 → `INSERT` (PK enforces uniqueness for generated codes *and* custom aliases) → return short URL.

---

<a name="realworld"></a>
# 13. How the real system does it 🌐

### The consensus production answer: Snowflake ID → Base62
Not a central counter (SPOF, coordination per write), not a truncated hash (collisions, read-before-write, retry loop). A distributed ID with the machine ID embedded, Base62-encoded — **zero collisions by construction, zero coordination, zero read-before-write**, and the machine ID doubles as the shard key.

### Base62 over Base64
`+` and `/` are **reserved in URLs** and require percent-encoding; the URL-safe `-`/`_` variant still causes trouble when codes are copied out of running text or double-clicked. Base62 is the largest unambiguously URL-safe alphabet. **7 chars ≈ 3.5 trillion.**

### If you *do* hash
Defensible when you deliberately want the same URL to map to the same code (dedup). Then you must handle collisions: re-hash with a different seed, take additional bits, or append a suffix — each requiring a **read-before-write**. That round trip is the real argument against it, and it's about write-path latency, not elegance.

### The detail that generalizes beyond this problem
> **Immutable data makes caching trivial.** The reason a URL shortener scales so gracefully isn't clever engineering — it's that `shortCode → longUrl` never changes, so the hardest part of caching (invalidation) is absent by construction. When you meet a caching problem elsewhere, **ask first whether you can make the cached thing immutable** — versioned keys, content-addressed storage, immutable segments. Same trick as immutable video segments in [Problem 11 §7](problem-11-video-streaming.md) and content-addressed chunks in [Problem 12 §10.5](problem-12-dropbox.md#realworld).

---

<a name="interview"></a>
# 14. Interview Q&A

### Q: "Walk me through the flow."
> *"Client posts a long URL. The shorten service validates it — well-formed, http or https, not pointing back at us — generates a unique short code, and inserts the mapping with the short code as the primary key, so the database itself enforces uniqueness. That matters because generated codes and custom aliases share one namespace: if someone claims an alias that's taken, the insert just fails and I return a 409. Later, someone clicks: the redirect service looks up the code, checks expiry, and returns a 302 with the original URL in the Location header, then fires a click event onto a queue without waiting. I'd run shorten and redirect as separate services on a shared datastore — not for tidiness, but because if link creation goes down, every link ever shared must keep working."*

### Q: "How do you generate the short code?"
> *"A Snowflake-style distributed ID, Base62-encoded to 7 characters. That gives zero collisions by construction because the machine ID is baked into the value, with no coordination and no read-before-write. I'd avoid hashing the URL and truncating: collisions are guaranteed by the pigeonhole principle, so every write needs a read-before-write to check, and it gets worse as the table fills — plus the same URL always yields the same code, so two users sharing a link would share analytics and takedown, which usually isn't wanted. A single global counter also avoids collisions but is a single point of failure and coordinates on every write; if I did use one I'd have each server claim ranges of a thousand. Base62 rather than Base64 because plus and slash are reserved in URLs. Seven characters gives 3.5 trillion codes against about 6 billion needed."*

### Q: "Someone wants the custom alias 'sale'. Later your generator produces 'sale'. What happens?"
> *"They're in one namespace, so they need one uniqueness authority — and that's the primary key. Both generated codes and custom aliases go into the same table with short_code as the PK, so a custom alias that's taken fails the insert and returns 409, and a generated code that happens to hit an existing alias fails and I regenerate. I'd never do a read-then-write check in application code, because there's a race between the read and the write. I'd also keep a reserved blocklist — admin, login, api, static — so nobody can shadow a real route or impersonate one."*

### Q: "4,000 redirects a second on the critical path of a page load. How?"
> *"Cache-aside in Redis, and the thing I'd lean on hardest is that the mapping is immutable — once created it never changes. Cache invalidation is normally the hard part of caching and here it simply doesn't exist, so I can cache effectively forever and at every layer, evicting only on memory pressure. Access is also extreme power-law, so a modest cache holding the hot set gets a very high hit rate. Two things I'd add that get missed: negative caching, because bots hammer codes that don't exist and every one of those is a guaranteed miss straight through to the database — a Bloom filter in front handles that with no false negatives. And request coalescing, so when a link goes viral from cold, thousands of simultaneous misses become one database fetch rather than thousands."*

### Q: "301 or 302?"
> *"302 — but the usual reason given is the weaker one. Analytics is real: a 301 is cached by the browser, so I'd count each user once and then never see them again. The stronger reason is revocation. A cached 301 is effectively permanent — the browser will never ask me again — so if a link later turns out to point at malware, I cannot take it down for anyone who has already clicked. Since a URL shortener is inherently an abuse vector, being able to revoke is a safety requirement rather than a feature. The cost is that every click hits my servers, which is exactly what the cache is for — about a millisecond per lookup. I'd also set Cache-Control explicitly rather than relying on the status code, since some intermediaries cache 302s."*

### Q: "How do you count clicks?"
> *"Fire-and-forget onto a queue; the 302 goes out first and the user never waits on analytics. What I'd specifically avoid is incrementing a clicks column on the link row — that turns every read into a write, contends on exactly the hottest rows, and couples redirect availability to database write availability. Approximate is completely fine here: losing a fraction of a percent of counts costs nothing, which is a real contrast with something like ad-click billing where the count is the invoice."*

### Q: "How would you shard this?"
> *"By short code, hash-partitioned — it's an unusually clean shard key because every single query is a point lookup on it. No range scans, no joins, no cross-shard queries at all. But I'd start by saying sharding isn't forced by the write rate: forty writes a second and three terabytes fit on one machine. I'd shard for read throughput, availability, and headroom. The nice trick is that if I embed the machine ID in the code, as Snowflake does, that prefix is also the shard key — so I can route a lookup straight to the right shard from the code itself, with no lookup table on the read path. One move solving both uniqueness and routing."*

### Q: *(unprompted)* "Anything else you'd raise?"
> *"Abuse. The core feature of this product — hiding the destination — is exactly what a phisher wants, so abuse isn't an edge case, it's structural. I'd scan destinations against a threat-intel list at creation, but more importantly re-scan periodically, because attackers shorten a clean page, get it distributed, and then change what it serves, which makes a one-time check nearly worthless. Rate-limit creation to blunt bulk generation, show an interstitial for flagged links so users can see where they're actually going, reject non-http schemes like javascript: and data:, and keep a takedown path — which is the second reason I chose 302 over 301."*

---

<a name="cheatsheet"></a>
# 15. Cheat Sheet

**Structure:** flow first (functional), then deep dives (non-functional). Don't optimize a flow you haven't drawn.

**Part I — the flow**
- **Shape:** read-heavy (**~100:1**) **immutable** key-value lookup. Read availability > write availability.
- **Entities:** `ShortLink` (⭐ **immutable after creation**) + `ClickEvent` (high volume, low value). *Hottest data is the least valuable — keep it off the hot path.*
- **API:** `POST /api/v1/urls` → `GET /{shortCode}` (root path — every character costs). **`410 Gone`** for expired ≠ `404` for never-existed.
- **Split shorten and redirect services** — different scale, different latency budget, and **link creation failing must not break existing links**.
- **Custom alias + generated code share ONE namespace** → **the PRIMARY KEY is the uniqueness mechanism** (never read-then-write). Reserve a blocklist (`admin`, `login`, `api`).
- **Expiry checked lazily on read** → `410`; reclaim in background (prefer partition-drop, see Problem 03).
- **Clicks: respond first, enqueue after.** ❌ Never `UPDATE links SET clicks = clicks + 1` — turns reads into writes on the hottest rows.
- ⭐ **Idempotency is NOT required on create** — a duplicate short code for the same URL is a wasted row, not a bug. Unusual; say it.

**Part II — the deep dives**
- **Estimate:** ~**40 writes/s** (⭐ *not the problem — say so*) · ~**4,000 reads/s** · ~**6B rows ≈ 3TB** · **62⁷ ≈ 3.5T → 7 chars**.
- **DD1 code gen:** ❌ hash+truncate (pigeonhole collisions → read-before-write → worsens as table fills; *same URL = same code = shared analytics/takedown*) → ⚠️ global counter (no collisions but **SPOF + coordination per write**; fix = **claim ranges of 1,000**) → ✅ **Snowflake ID → Base62** (no coordination, no SPOF, no read-before-write, **machine ID = shard key**). KGS = pre-generated unguessable keys. **Base62 not Base64** (`+` `/` reserved in URLs). ⚠️ **Sequential codes are guessable** → creation-rate leak + enumeration harvesting "private" links → **encrypt the ID before encoding**.
- **DD2 read path:** ❌ DB every time → ⚠️ Redis cache-aside → ✅ **plus three things**: ⭐ **immutable → cache invalidation doesn't exist** (cache forever, at every layer) · **power-law → very high hit rate** · ⭐ **negative caching / Bloom filter** (bots hammering non-existent codes are 100% misses straight to the DB) · **request coalescing** for the cold-viral stampede.
- **DD3 301 vs 302:** **302.** Analytics is the weak reason. ⭐ **The strong reason is REVOCATION** — a cached 301 is unreachable by any later takedown, and a shortener *will* be used for malware. Set `Cache-Control` explicitly.
- **DD4 sharding:** shard by **`shortCode`** (every query is a point lookup — no range scans, joins, or cross-shard queries). ⭐ **Machine-ID prefix = unique code + shard key, no lookup table.** Read replicas; protect the **read** path. **Say that ~40 w/s doesn't force sharding** — you shard for reads/HA/headroom.
- **DD5 abuse ⚠️ (raise unprompted):** hiding the destination is the product *and* the attack. Scan at creation + ⭐ **re-scan periodically** (clean-then-swap is the actual attack) · rate-limit creation · interstitial for flagged links · **takedown path (needs 302)** · reject self/chained redirects · **block `javascript:` / `data:` / `file:`**.

**The transferable lesson:** ⭐ **immutable data makes caching trivial** — invalidation is the hard part and immutability removes it. Ask elsewhere whether you can *make* the cached thing immutable (versioned keys, content addressing, immutable segments).

**Cross-refs:** Problem 03 (expiry/TTL at scale) · Problem 05 §9.5 (Snowflake IDs, logical shards) · Problem 11 §7 (immutable segments, origin shield/coalescing) · Problem 12 §10.5 (content addressing) · Problem 18 §4b (DB constraint as the mechanism) · Problem 19 (contrast: when counting must be *exact*) · Part 27 (Bloom filter) · Part 23 (rate limiting) · Part 13 (async queue).

*— Design Problem 01 complete —*
