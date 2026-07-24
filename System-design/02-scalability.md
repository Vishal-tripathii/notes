# System Design Study Notes — Part 2

## Scalability (Scaling, Load Balancing, State Management, Replication & Sharding)

> **Format:** Written as **Q&A** — my prompts are the questions, the explanations are the answers. Complete capture of the chat, reorganized and expanded into study material. Diagrams added for clarity.
>
> **Continues from:** Part 1 (Functional & Non-Functional Requirements). "Scalability" was one of the NFRs there — this part is the deep dive.

---

## Table of Contents

1. [Q1: What is scaling in system design? (+ real examples)](#q1)
2. [Q2: Load balancing, state management & data synchronization](#q2)
3. [Q3: Deep dive — Sessions, JWT, Redis, Replication & Sharding](#q3)
4. [Q4: Clarification — the shared session store confusion](#q4)
5. [Cheat Sheet — everything on one page](#cheatsheet)

---

<a name="q1"></a>
# Q1: What is scaling in system design?

## What is scaling?

**Scaling means changing your system's capacity so it can handle more load without slowing down or crashing.**

"Load" usually means:
- More **users** at once
- More **requests** per second
- More **data** to store
- More **complex** work per request

When load grows, your setup hits a limit — the server maxes out CPU/memory, responses slow, then requests fail. **Scaling pushes that limit up.**

> **Scalability** (the NFR from Part 1) is the *quality* of being able to scale smoothly. A scalable system can grow to 10x the load by adding resources — without a redesign.

---

## Restaurant analogy

Your restaurant has **one cook** and orders are backing up. Two options:

1. **Replace the cook with a superhuman cook** (bigger stove, more arms) → **Vertical scaling**
2. **Hire more cooks** side by side → **Horizontal scaling**

That's the entire core of scaling.

---

## The two types of scaling

### 1. Vertical scaling ("scale up") — make one machine bigger
Add more CPU / RAM / faster disk to your **existing** server.

```
   BEFORE                  AFTER
 ┌─────────┐          ┌───────────────┐
 │ Server  │          │    Server     │
 │ 4 CPU   │   ──▶    │   32 CPU      │
 │ 8GB RAM │          │   128GB RAM   │
 └─────────┘          └───────────────┘
```

**Pros:** Simple — no code changes; no multi-server coordination.
**Cons:** Hard **ceiling** (only so big); **expensive** (top hardware costs disproportionately); **single point of failure** (one machine dies → all down).

### 2. Horizontal scaling ("scale out") — add more machines
Add **more servers** and spread load across them. How large systems really scale.

```
                    ┌──▶ [Server 1]
[Users] ──▶ [Load   │──▶ [Server 2]
          Balancer] │──▶ [Server 3]
                    └──▶ [Server 4]   ◀── add more as needed →
```

**Pros:** Near-**unlimited** growth; **fault tolerant** (LB routes around a dead server); cheaper commodity machines.
**Cons:** **Complex** (needs load balancer + coordination); requires the app to be **stateless** (the big catch).

---

## Side-by-side comparison

| | **Vertical (scale up)** | **Horizontal (scale out)** |
|---|---|---|
| How | Bigger machine | More machines |
| Limit | Hardware ceiling | Practically unlimited |
| Failure | Single point of failure | Survives node loss |
| Complexity | Simple | Needs load balancer + coordination |
| Cost curve | Gets expensive fast | Scales more linearly |
| Analogy | One super-cook | Many cooks |

> **Rule of thumb:** Start vertical (simpler/cheaper early). Go horizontal when you hit the ceiling or need fault tolerance. Google/Netflix/Amazon are *all* horizontally scaled.

---

## The critical catch: stateless vs. stateful

If a user logs in and **Server 2** stores "logged in" in its *own memory*, the next request routed to **Server 4** has no idea who they are → they get logged out. 💥

**The fix: make servers stateless.** A stateless server keeps *no* user session data in its own memory. Any server can handle any request because shared state lives *outside* the servers — in a database or shared cache (Redis).

```
                    ┌──▶ [Server 1] ──┐
[Users] ──▶ [Load   │──▶ [Server 2] ──┤──▶ [Shared Cache / DB]
          Balancer] │──▶ [Server 3] ──┤    (holds the session state)
                    └──▶ [Server 4] ──┘
```

> **Key principle:** Horizontal scaling works only if servers are **stateless** — any server can serve any request because state lives in a shared store.

---

## Scaling every layer (not just servers)

Web servers are the easy part. The real bottleneck is usually the **database** (one source of truth). Techniques (deep dive in Q3):
- **Read replicas** — copies that handle read queries (great for read-heavy systems).
- **Sharding** — split data across multiple databases.
- **Caching** — a fast layer (Redis) in front so most reads never hit the DB.

> When you scale, **the database is usually the hardest part** — data can't be duplicated as freely as stateless servers.

---

## Real-world examples

1. **Amazon on Black Friday / Prime Day** — traffic spikes 10–20x for days. They don't run 20x servers all year; they **horizontally scale** with **auto-scaling** — spin up thousands of servers before the event, remove them after.
2. **Netflix in the evening** — demand peaks 7–11pm. Scales out + uses a global **CDN** so video streams from a machine near you.
3. **Twitter / X (read-heavy)** — ~100 reads per write. Scales reads with **caching + read replicas** so scrollers don't overwhelm the DB.
4. **A startup's first scaling moment** — Day 1: one server does everything. Growth → **scale up** (bigger box) → hit ceiling → split DB onto its own machine, add a load balancer, run multiple stateless app servers → **scale out**.

---

## Auto-scaling (modern default)

Cloud platforms (AWS/GCP/Azure) add/remove servers automatically via rules like *"if avg CPU > 70%, add a server; if < 30%, remove one."* Grow during spikes, shrink when quiet — pay only for what you use.

```
Load:    low ──────▶ HIGH (spike) ──────▶ low
Servers:  2  ──────▶  8            ──────▶  2     (automatic)
```

---

## Trade-off lens (bring to interviews)

- More servers → more **cost** + **operational complexity**
- Horizontal → must handle **statelessness** + **consistency** across machines
- Adding replicas → data can be briefly **stale** (consistency trade-off)

> The skill isn't "add more servers." It's: *identify the bottleneck → pick the right technique for that layer → name the trade-off you're accepting.*

---

## Interview angle

- **"How would you scale this system?"** → identify bottleneck (app? DB?), vertical vs horizontal, statelessness + LB, scale DB via replicas/caching/sharding.
- **"Vertical vs. horizontal — which and why?"** → explain both; vertical's ceiling + single point of failure; big systems go horizontal.
- **"What is a stateless server and why does it matter?"** → any server serves any request; state in a shared store; enables horizontal scaling.
- **"Traffic 10x'd overnight — what do you do?"** → auto-scale the stateless app tier, add caching/replicas to protect the DB, CDN for static/media.

> **Takeaway:** Scaling = increasing capacity for more load. Vertical (bigger machine — simple but capped) vs. horizontal (more machines — unlimited but needs stateless servers + a load balancer). Real systems scale horizontally, scale every layer (especially the DB), and use auto-scaling — always with a cost/complexity trade-off.

---

<a name="q2"></a>
# Q2: Load balancing, state management & data synchronization

> These three are the problems that appear **the moment you scale horizontally**: *How is traffic spread? Where does the user's login live? How do all machines agree on the data?*

---

## 1. Load Balancing

A **load balancer (LB)** sits in front of your servers and decides *which* server each request goes to — spreading traffic **evenly** so no server is overwhelmed.

```
                        ┌──▶ [Server 1]
[Users] ──▶ [Load       │──▶ [Server 2]
           Balancer] ───┼──▶ [Server 3]
                        └──▶ [Server 4]
```

It also does **health checks** — if a server stops responding, the LB routes around it (this gives horizontal scaling its fault tolerance). The rule it uses to pick a server = the **load balancing algorithm**.

### Round Robin
Hand out requests in a fixed rotation: 1, 2, 3, 4, 1, 2, 3, 4…

```
Request 1 ──▶ Server 1
Request 2 ──▶ Server 2
Request 3 ──▶ Server 3
Request 4 ──▶ Server 4
Request 5 ──▶ Server 1   (cycle repeats)
```
**Analogy:** teacher handing out worksheets desk by desk, in order.
- ✅ Dead simple; spreads count evenly.
- ❌ Ignores how busy each server is. If Request 2 is a 30-second job, round robin still sends more work to that busy server — it only counts turns.

### Least Connections
Send each new request to the server with the **fewest active connections** (least busy).

```
Current active connections:
  Server 1: 2 ◀── new request goes HERE (fewest)
  Server 2: 8
  Server 3: 5
  Server 4: 7
```
**Analogy:** a manager sending you to the shortest checkout line.
- ✅ Adapts to real load; great when request durations vary.
- ❌ LB must track live connection counts (a bit more work).

### Comparison
| | **Round Robin** | **Least Connections** |
|---|---|---|
| Rule | Rotate in fixed order | Fewest active connections |
| Tracks load? | No | Yes |
| Best when | Requests uniform & fast | Requests vary in duration |
| Complexity | Very simple | A bit more |

> Others exist (weighted round robin, IP hash, least response time), but these two are must-knows. *Uniform quick requests → round robin; mixed/long requests → least connections.*

---

## 2. State Management: Session vs. JWT

HTTP is **stateless** — the server doesn't naturally remember your previous request. So we carry identity across requests via a **session** or a **JWT**. (Full mechanics in Q3.)

- **Server-side session:** server stores who you are (in a **shared Redis** when scaled) and gives you a random **session ID**. Each request → look up the ID.
  - ✅ Easy to revoke (delete it). ❌ Lookup per request; must scale the store.
- **JWT:** a self-contained, cryptographically signed **token** carrying your identity. Each server **verifies the signature** locally — no lookup.
  - ✅ Truly stateless; scales beautifully. ❌ Hard to revoke before expiry.

| | **Server-side Session** | **JWT** |
|---|---|---|
| State lives | Shared store (Redis) | Inside the token (client) |
| Per-request cost | Lookup in store | Local signature check |
| Revoke/logout | ✅ Instant | ❌ Hard until expiry |
| Best for | Tight control (banking) | Large distributed systems / APIs |

---

## 3. Data Synchronization

Once you scale the **database** (replicas/shards), data lives in **many copies across many machines**. How do they agree on the truth? That's data sync — and it's the **consistency** NFR from Part 1.

### Replication (source of copies)
One **primary** (handles writes) + several **replicas** (handle reads). Primary streams changes to replicas.

```
                    WRITE
[App] ─────────────────────────▶ [Primary DB]
                                      │  copies changes to...
                    READ              ▼
[App] ◀───────────────────  [Replica 1] [Replica 2] [Replica 3]
```
Great for **read-heavy** systems — but replicas don't update instantly (lag).

### The two sync models
**Strong consistency (synchronous):** write confirmed only when all copies updated.
- ✅ Always correct. ❌ Slower writes, less available. **Use:** banking, inventory, bookings.

**Eventual consistency (asynchronous):** write confirmed immediately; replicas catch up shortly (ms–s).
- ✅ Fast, highly available. ❌ Briefly stale reads. **Use:** likes, view counts, feeds.

```
Eventual consistency in action:
  t=0ms   Write "likes = 500" to Primary  ✅ confirmed
  t=20ms  Friend reads Replica 3 ──▶ still 499 (not synced)
  t=50ms  Replica 3 catches up ──▶ everyone sees 500
```

> **The trade-off:** you usually can't have instant consistency *and* maximum availability/speed at scale (heart of the **CAP theorem**). Real systems pick per-feature: bank balance = strong; Instagram likes = eventual.

### Examples
- **Banking transfer** → strong consistency.
- **Instagram like count** → eventual.
- **DNS** → eventual (propagates over minutes/hours).

---

## The big picture — three consequences of horizontal scaling

```
             ┌─────────────────────────────────────────────┐
             │           You scaled horizontally            │
             │            (many servers)                    │
             └─────────────────────────────────────────────┘
                    │              │                 │
      "which server?"      "where's the login?"   "how do copies agree?"
                    ▼              ▼                 ▼
        ┌──────────────┐  ┌─────────────────┐  ┌────────────────────┐
        │ LOAD BALANCE │  │ STATE MGMT      │  │ DATA SYNC          │
        │ round robin  │  │ session vs JWT  │  │ replication +      │
        │ least conn.  │  │ (stay stateless)│  │ strong/eventual    │
        └──────────────┘  └─────────────────┘  └────────────────────┘
```

- **Load balancing** → distributing the traffic.
- **State management** → keeping servers stateless so the LB can route anyone anywhere.
- **Data synchronization** → keeping data copies in agreement (consistency vs. speed/availability).

---

<a name="q3"></a>
# Q3: Deep dive — Sessions, JWT, Redis, Replication & Sharding

# PART A — State Management, in depth

## What "state" means
When you log in, the system must remember *"this request is from Alice, already authenticated."* HTTP is **stateless** (each request is a blank slate), so we carry identity via a **session** or a **JWT** — same problem, opposite solutions.

---

## Sessions — full lifecycle

**Step 1 — Creation (login):** server verifies credentials, creates a session record:
```
session_id:  "a3f9x7k2..."   (long random unguessable string)
data:        { userId: 42, role: "rider", loginTime: ... }
```
**Step 2 — Storage (server side):** the **session data lives on the server**. The client only gets the **session ID** — like a coat-check ticket.
**Step 3 — Send to client:** via cookie → `Set-Cookie: session_id=a3f9x7k2...` (browser auto-sends it on future requests).
**Step 4 — Validation (every request):**
```
Request arrives with cookie session_id=a3f9x7k2...
   ▼
Server looks up "a3f9x7k2..." in the session store
   ├─ found     ──▶ "This is Alice (userId 42)" ✅ proceed
   └─ not found ──▶ "Who are you?" ❌ 401
```
The ID carries *no* info — the server must **look it up**. That lookup is the cost (and the power — full server control).
**Step 5 — Invalidation (logout/revoke):** **delete the session record** → next lookup fails → user out instantly. Sessions' superpower: **easy revocation**.

---

## Why sessions need Redis when you scale
Naive store = the server's own RAM → invisible to other servers. Fix: move sessions to a **shared external store every server reaches** — almost always **Redis**.

**Why Redis:** in-memory → microsecond lookups (done every request); key–value → perfect for ID→data; built-in **TTL** → auto-expire sessions.

**In Redis:**
```
Login:     SET  session:a3f9x7k2  '{"userId":42,"role":"rider"}'  EX 1800   (expire 30 min)
Validate:  GET  session:a3f9x7k2   → data ✅  /  nil ❌ (expired or logged out)
Logout:    DEL  session:a3f9x7k2   → gone. Instant logout.
```

```
                ┌──▶ [Server 1] ──┐
[Alice] ─[LB]──▶│──▶ [Server 2] ──┼──▶ [Redis]  SET/GET/DEL session:a3f9x7k2
                └──▶ [Server 3] ──┘   (single shared source of truth)
```
Servers stay **stateless**; Redis holds state.

> **Trade-off:** every request does a fast round-trip to Redis, and **Redis becomes critical infrastructure** (must be made highly available). You *move* the state problem, not eliminate it.

---

## JWT — how it actually works

Flips the model: **store nothing on the server — give the user a tamper-proof token carrying their identity.**

**Structure: 3 parts joined by dots** — `header.payload.signature`
```
eyJhbGci...   .   eyJ1c2VySWQ...   .   SflKxwRJSM...
  HEADER              PAYLOAD             SIGNATURE
```
1. **Header** — metadata (algorithm): `{ "alg": "HS256", "typ": "JWT" }`
2. **Payload** — the claims / identity: `{ "userId": 42, "role": "rider", "exp": 1736789000 }`
   - ⚠️ Only **Base64-encoded, NOT encrypted** — anyone can read it. Never put secrets in it. It's readable but **can't be forged**.
3. **Signature** — the security:
```
signature = HMAC-SHA256( base64(header) + "." + base64(payload), SERVER_SECRET_KEY )
                                                        ▲ only the server knows this
```

**Why it can't be faked:** the signature seals header+payload with a secret only the server knows. Change the payload (`role: rider` → `role: admin`) and the signature no longer matches. Forging a matching signature needs the secret → attacker can't. Server detects tampering instantly.

**Flow:**
```
LOGIN:  verify credentials ──▶ build payload ──▶ sign with SECRET ──▶ send JWT to user.
EVERY REQUEST: user sends JWT (Authorization: Bearer eyJ...)
   ▼
ANY server re-computes signature over received header+payload with SECRET, compares:
   ├─ matches  ──▶ genuine + untampered; read userId straight from payload ✅
   └─ no match ──▶ forged/altered ──▶ reject ❌
```
**No database, no Redis, no lookup** — the server learns identity by *reading the payload* and trusts it because the *signature verifies*. Pure local math → scales beautifully across servers/microservices (each just needs the same secret).

---

## The JWT invalidation problem (the deep trade-off)

With sessions, logout = delete the record. **With JWT there's nothing to delete** — the token lives on the *client*; the server accepts it purely because the signature is valid. No "active tokens" list to remove from.

So to **force-logout** (logout / ban / stolen token): you **can't** un-issue a token already out there — it stays valid until `exp`.

**Real-world solutions (each reintroduces some cost):**

1. **Short-lived access tokens + refresh tokens** (standard):
```
Access token (JWT):  ~15 min, stateless, fast to verify
Refresh token:       stored in Redis/DB, revocable, used to mint new access tokens
```
Revoke = invalidate the refresh token; worst case user stays in ≤15 min.

2. **Token blocklist (denylist):** keep revoked token IDs (in Redis); check each request against it.
   - ⚠️ **Reintroduces the per-request lookup** — partly turns JWT back into a session. Used when instant revocation truly matters.

> **The core trade-off, plainly:**
> **Sessions** = server holds state → **extra lookup per request**, but **instant, easy revocation + full control**.
> **JWT** = client holds state → **no lookup, scales effortlessly**, but **sacrifices easy revocation** (claw it back only via short expiries or a blocklist that costs the lookup again).
> You can't have "zero server state" *and* "instant revocation" for free — pick what you value. Banking → sessions; huge stateless API → JWT + short expiry.

---

# PART B — Replication & Sharding, in depth

Both are about the **database** (hardest to scale — copies must agree). They solve **two different problems**:

| | Solves | One-line meaning |
|---|---|---|
| **Replication** | Too many **reads** + fault tolerance | **Copy** the *same* data to multiple machines |
| **Sharding** | Too much **data** / too many **writes** | **Split** *different* data across multiple machines |

---

## Replication — copying the same data

**What it is:** full copies of the DB on multiple machines. Classic **primary–replica**:
- **Primary** — the one authoritative copy; **all writes** go here.
- **Replicas** — read-only copies; primary streams changes to them; **reads** served here.

```
              WRITES (inserts/updates)
[App] ──────────────────────────────▶ [PRIMARY]
                                          │  replicates changes →
                          ┌───────────────┼───────────────┐
                          ▼               ▼               ▼
                     [Replica 1]     [Replica 2]     [Replica 3]
                          ▲               ▲               ▲
[App] ─────────READS (spread across all replicas)─────────
```

**What it does for us:** Twitter is ~100:1 reads:writes. One DB → all reads+writes hit one machine → melts. With replication: the **1 write** → primary; the **100 reads** spread across replicas → read load per machine slashed. **You scaled reads by adding replicas.**

Bonuses:
- **Fault tolerance** — primary dies → a replica is **promoted** (*failover*); no data loss, no full outage.
- **Geographic locality** — a replica in Europe → European users read nearby → lower latency.

**Trade-off — replication lag:** primary streams changes **asynchronously**, so replicas briefly lag:
```
t=0ms   Write "likes=500" to PRIMARY ✅
t=30ms  Read Replica 2 → still 499 (not caught up)
t=80ms  Replica 2 synced → 500
```
This is **eventual consistency** — fine for likes/feeds, bad for read-your-own-write (route those reads to the primary).

**Limits:** replication does **NOT** scale writes (all writes still funnel to one primary) and does **NOT** help if the dataset is too big for one machine (each replica holds the *full* copy). → That's sharding.

---

## Sharding — splitting different data

**What it is:** split the dataset into pieces (**shards**), each on its own machine holding **only its slice**. No machine holds everything.

```
                   ┌─────────────────────────────────┐
                   │   Which shard? Based on a KEY    │
                   └─────────────────────────────────┘
                       │            │            │
                       ▼            ▼            ▼
                  [Shard A]     [Shard B]     [Shard C]
                  users 1–1M    users 1M–2M   users 2M–3M
```

**The shard key — the most important decision.** Pick a key (e.g. `userId`) + a rule mapping rows to shards:

1. **Range-based:** split by value ranges.
```
userId 1–1,000,000     → Shard A
userId 1,000,001–2M    → Shard B
```
Simple; range queries easy. ❌ **Hotspots** (if newest users are most active, one shard gets hammered).

2. **Hash-based:** `shard = hash(userId) % number_of_shards`
Spreads data **evenly**, avoids hotspots. ❌ Range queries hard (adjacent users scatter).

**What it does for us:** solves what replication can't:
- **Storage** — 3B rows won't fit on one machine → 30 shards × 100M each.
- **Write scaling** — writes for Shard A go to A's machine, B's to B's → **writes happen in parallel across shards.** You scaled *writes*.

**Trade-offs (serious):**
- **Cross-shard queries painful** — "all users who joined this year" may query *every* shard + merge (*scatter-gather*) → slow. Easiest when queries include the shard key (hit one shard).
- **Cross-shard joins** hard/expensive — data once joinable is now on different machines.
- **Hotspots** — bad shard key overloads one shard (e.g. sharding by country → one giant shard).
- **Resharding is a nightmare** — adding shards means remapping + physically moving huge data while live. (*Consistent hashing* eases this — later topic.)

> **Trade-off, plainly:** sharding buys near-unlimited storage + write throughput, at the cost of **losing easy cross-shard queries/joins + major operational complexity.** Shard only when you must (one machine can't hold the data or absorb the writes).

---

## They combine — real-world setup
Shard for size/writes, then **replicate each shard** for read-scaling + fault tolerance.
```
        ┌──────────── Shard A ────────────┐   ┌──────────── Shard B ────────────┐
        │  [Primary A] ──▶ [Replica A1]    │   │  [Primary B] ──▶ [Replica B1]    │
        │       │      ──▶ [Replica A2]    │   │       │      ──▶ [Replica B2]    │
        └───────┼─────────────────────────┘   └───────┼─────────────────────────┘
          writes│ reads (A's slice)            writes │ reads (B's slice)
```
- Sharding → data *divided* (scales storage + writes).
- Replication → each slice *duplicated* (scales reads + survives failure).

---

## Ties back to scaling (full arc)
```
Reads too heavy?                  ──▶ REPLICATION (copy same data, spread reads)
Data too big / writes too heavy?  ──▶ SHARDING     (split data, parallel writes)
Need both?                        ──▶ SHARD, then REPLICATE each shard
Servers must stay stateless       ──▶ SESSIONS (Redis) or JWT
```

> **Takeaway:** Sessions store identity server-side (Redis for speed+sharing) — one lookup/request, instant revocation. JWTs store signed identity in the token — no lookup, scales effortlessly, hard to revoke early (fix: short tokens + refresh, or a blocklist that costs the lookup back). Replication copies the *same* data → scales reads + survives failure, price = lag (eventual consistency). Sharding splits *different* data → scales storage + writes, price = hard cross-shard queries + operational complexity. Every one: what you gain vs. what you pay.

---

<a name="q4"></a>
# Q4: Clarification — the shared session store confusion

## The question
> "When a session is stored in a database and every server points to the same database (as in sharding etc.), why can't Server 2 identify a session created on Server 1 — if it's stored in a DB all servers point to?"

## The answer — you're right: with a shared store, there is NO problem

The "Server 1 login → Server 2 can't identify you" problem exists in **only ONE case: when each server stores the session in its OWN local memory.** Move the session to a **shared store all servers point to** (Redis/DB) and the problem **disappears** — exactly as you reasoned.

### Scenario 1 — Session in the server's LOCAL memory ❌ (broken)
```
Login ──▶ Server 1 stores session in Server 1's OWN memory (Server 2 can't see it)
Next request ──[LB]──▶ Server 2
   Server 2 checks ITS OWN memory ──▶ nothing ──▶ "Who are you?" 💥
```
The session exists, but only inside Server 1's private memory.

### Scenario 2 — Session in a SHARED store ✅ (your point — correct)
```
Login ──▶ Server 1 writes session to SHARED Redis/DB
Next request ──[LB]──▶ Server 2
   Server 2 reads the SAME shared Redis/DB ──▶ finds it ──▶ "It's Alice" ✅
```
No problem — because everyone points to the same store.

## So why mention the problem at all?
Because it explains **WHY we use a shared store in the first place**:
1. Naive default (single server) = sessions in local memory (Scenario 1).
2. Scale to multiple servers → Scenario 1 **breaks**.
3. **Fix** = move sessions to a shared store (Scenario 2).

You'd assumed the correct end state, so there seemed to be no problem — there isn't, *once the fix is applied*. The problem is just the *reason the fix exists*.

> **Analogy:** "Why lock your door?" → "So burglars can't walk in." "But my door is locked, so no problem." Right — because you *applied the fix*. The threat explains *why* you lock it.

## Nuance about "shared DB" + sharding
"Sessions in a shared store" is looked up by **session ID** (the key). Even if that session store is *itself* sharded across multiple Redis nodes, a given session ID **deterministically resolves to the one node holding it** — so every app server, given the same ID, lands on the same node and finds the same session.

- The requirement isn't literally "one single database."
- It's **"a store all servers can reach, where a session ID always resolves to the same place."**

> **Locking it in:** The login-mismatch problem exists **only when each server stores sessions in its own local memory.** The fix (what everyone does at scale) = a **shared session store (Redis/DB) all servers reach**. With that, it doesn't matter which server the LB picks — the same session ID resolves to the same data. Shared store = no problem; the problem statement just explains *why* the shared store is necessary.

---

<a name="cheatsheet"></a>
# Cheat Sheet — everything on one page

### Scaling
- **Scaling** = increase capacity to handle more load.
- **Vertical (scale up)** = bigger machine. Simple; capped; single point of failure.
- **Horizontal (scale out)** = more machines. Unlimited; fault tolerant; needs LB + **stateless** servers.
- **Stateless server** = keeps no session in local memory; state lives in a shared store → any server serves any request.
- **Auto-scaling** = cloud adds/removes servers by rules (e.g. CPU > 70% → add).
- Scale **every layer**; the **database** is usually the hardest.

### Load balancing algorithms
- **Round robin** = fixed rotation. Simple; ignores real load. Best for uniform quick requests.
- **Least connections** = pick least-busy server. Adapts to load. Best for varied/long requests.
- LB also does **health checks** → routes around dead servers (fault tolerance).

### State management
| | Session | JWT |
|---|---|---|
| State | Server-side (Redis) | In the signed token (client) |
| Per request | Lookup | Local signature check (no lookup) |
| Revoke | ✅ Instant (delete) | ❌ Hard until expiry |
| Scales | Good (must scale store) | Excellent |
| Use | Banking / tight control | Large distributed / APIs |
- **JWT** = `header.payload.signature`; payload is **readable, not encrypted**; signature (HMAC + secret) makes it **unforgeable**.
- JWT revocation fixes: **short access token + refresh token**, or **blocklist** (reintroduces a lookup).
- **Redis** for sessions: in-memory (µs), key–value, TTL. `SET session:id data EX 1800` / `GET` / `DEL`.

### Data synchronization / consistency
- **Strong consistency** = all copies updated before write confirmed. Correct; slower. Use: banking, inventory, bookings.
- **Eventual consistency** = write confirmed now; replicas catch up soon. Fast; briefly stale. Use: likes, feeds, DNS.
- Root of the **CAP theorem** trade-off. Pick per-feature.

### Replication vs. Sharding
| | Replication | Sharding |
|---|---|---|
| Does | **Copies** same data | **Splits** different data |
| Scales | **Reads** (+ fault tolerance) | **Storage + writes** |
| Setup | Primary (writes) + replicas (reads) | Shards by a **shard key** (range or hash) |
| Cost | **Replication lag** (stale reads) | Hard cross-shard queries/joins; hotspots; painful resharding |
- Big systems do **both**: shard for size/writes → replicate each shard for reads/failover.

### The three consequences of horizontal scaling
1. **Load balancing** → which server handles the request.
2. **State management** → keep servers stateless (session/JWT).
3. **Data synchronization** → keep data copies in agreement (consistency vs. speed).

### Golden rules
- Everything is a **trade-off** — always name what you pay.
- Start vertical, go horizontal at the ceiling / for fault tolerance.
- Stateless servers are what *make* horizontal scaling possible.
- The **database** is the hard part; reads → replicate, size/writes → shard.
- NFR priorities differ by system (bank → consistency; social → availability).

### Suggested next topics
- **Caching** (how reads avoid the DB entirely; cache strategies, eviction).
- **CAP theorem** (the consistency/availability trade-off in full).
- **Capacity estimation** (turn user counts into servers/QPS/storage).
- **Message queues** (handling spikes, async processing).

*— End of Part 2 —*
