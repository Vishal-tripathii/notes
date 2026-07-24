# Node.js Study Notes — Part 9

## Performance — Making Things Fast, and Finding Out Why They're Slow

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.
>
> **Connects to:** [Part 1.2](01.2-event-loop-blocking-and-real-world-load.md) (why one slow request can freeze everyone) · [Part 2.8](02.8-memory-management.md) (garbage collection) · [Part 8](08-mongodb-and-mongoose.md) (indexes, N+1) · [Part 9.5](09.5-streams-deep-dive.md) (streams in full).
>
> **The story this part tells:** your app was fast. Now it isn't. This is how you make it fast, and how you find out what went wrong.

---

## Table of Contents

1. [First: what does "slow" even mean?](#slow) ⭐
2. [Caching — reuse the answer](#caching) ⭐
3. [Redis — where you keep the cache](#redis)
4. [Pagination — don't send everything](#pagination) ⭐
5. [Streams — don't hold everything](#streams)
6. [Finding the problem when something IS slow](#finding) ⭐
7. [Memory leaks](#leaks)
8. [Interview Questions & Answers](#interview)
9. [Cheat Sheet](#cheatsheet)

---

<a name="slow"></a>
# 1. ⭐ First: what does "slow" even mean?

Before any technique, you need two words, because every performance conversation uses them.

### Latency = how long ONE request takes
Your `/orders` endpoint takes 200 milliseconds. That's latency. It's about **one user waiting**.

### Throughput = how many requests you handle per second
Your server handles 500 requests per second. That's throughput. It's about **capacity**.

**They're different problems.** A server can be fast for one user (low latency) and still fall over with a hundred users (low throughput), and vice versa.

## Percentiles — the thing that actually matters ⭐

Suppose 100 people use your app. Their load times, sorted:

```
99 people waited about 10ms.
 1 person waited 5,000ms.
```

**The average is 60ms.** Your dashboard says 60ms. Everything looks fine. But someone waited five seconds and probably left.

**Percentiles fix this.** Sort every request by how long it took, then:

```
p50  = the middle one          → "the typical experience"
p95  = 95 out of 100 were faster than this
p99  = 99 out of 100 were faster than this   → "the worst 1%"
```

For the example above:
```
p50 = 10ms     ← most people are fine
p99 = 5,000ms  ← ⚠️ THIS is the number that reveals the problem
```

> ⭐ **Rule: look at p99, not the average.** Averages hide your worst experiences. p50 tells you how it *usually* feels; p99 tells you **where the bugs are**.

**And p99 is not rare.** If you serve 1,000 requests per second, "the worst 1%" is **10 users every single second** having a bad time.

## What makes p99 bad but p50 fine?

Things that only happen *sometimes*:

| Cause | Why it's occasional |
|---|---|
| Garbage collection pause | GC only runs now and then, but freezes everything when it does |
| A cache miss | most requests hit the cache; the unlucky one goes to the database |
| Waiting for a free thread | the 5th `bcrypt` call waits, the first 4 don't ([Part 2](02-nodejs-internals.md)) |
| A user with much more data | 10 orders is fast; 10,000 orders is not |

**So: p50 got worse = something changed for everyone. Only p99 got worse = something occasional.** That single distinction will guide half your debugging.

---

<a name="caching"></a>
# 2. ⭐ Caching — reuse the answer

## The idea, in one sentence

**If you just calculated something, keep the answer nearby so you don't have to calculate it again.**

Your database takes 50ms to find a user. If a thousand people view that same profile, you did the same 50ms of work a thousand times — and got the identical answer every time. **Do it once, remember it, hand out the copy.**

> **Like a barista who writes the day's special on a board.** Without the board, they recite it to all 300 customers. With it, they write it once and point.

## How it works, step by step

The standard flow is called **cache-aside** — meaning *"look in the cache first, and if it's not there, go get it and put it there."*

```
Request for user 42
   │
   ├─ Is user 42 in the cache?
   │
   ├─ YES → return it.                        ~1ms    ✅ this is a "cache HIT"
   │
   └─ NO  → ask the database                  ~50ms   ❌ this is a "cache MISS"
            → save the answer in the cache
            → return it
            (the next request for user 42 is now a HIT)
```

```js
async function getUser(id) {
  // 1. Look in the cache first
  const cached = await redis.get(`user:${id}`);
  if (cached) return JSON.parse(cached);        // HIT — done in ~1ms

  // 2. Not there. Do the slow thing.
  const user = await db.users.findById(id);     // MISS — ~50ms

  // 3. Save it so next time is a hit.
  //    300 = delete this automatically after 300 seconds.
  await redis.setex(`user:${id}`, 300, JSON.stringify(user));

  return user;
}
```

**Two terms from that code:**
- **TTL (time to live)** — how many seconds before the cache deletes the entry by itself. The `300` above.
- **Hit rate** — what percentage of requests found the answer in the cache. 95% hit rate means only 5% reached the database. **This is the number to watch.**

## What you should and shouldn't cache

| ✅ Good to cache | ❌ Bad to cache |
|---|---|
| Read often, changes rarely — a user profile, a product catalog, config | Changes every second — a live view counter |
| Slow to produce — a monthly sales report | Only read once — you'd never reuse it |
| Same answer for everyone — the homepage, trending posts | Must be exactly right this instant — an account balance |

**The test: "would I get the same answer if I asked twice, and would it matter if it was 30 seconds out of date?"** Yes to both → cache it.

## The three problems caching creates

### ① How do you update it? (invalidation)

If a user changes their name, the cache still has the old one. Three approaches:

```js
// A. TTL — just let it expire. Simple. Accept up to 300s of staleness.
await redis.setex(key, 300, value);

// B. Delete it when you write. Accurate, but you must remember to do this
//    in EVERY place that updates a user — including scripts and admin tools.
await db.users.update(id, data);
await redis.del(`user:${id}`);

// C. Put a version in the key. The old key is simply never asked for again.
await redis.get(`user:${id}:v${user.updatedAt}`);
```

**Default to A.** It's the one that can't be forgotten. Use B when staleness genuinely matters.

### ② Everyone misses at once (a "stampede") ⚠️

Here's a failure that surprises people:

```
Your homepage is cached. 10,000 people per second are being served from cache.
The cache entry expires.
Those 10,000 requests ALL miss at the same moment.
All 10,000 hit the database simultaneously.
The database falls over.
```

**Your cache just caused an outage.** This is called a **stampede** or **thundering herd** — everyone rushing the same door the instant it opens.

Two fixes:

```js
// Fix A: add randomness to the TTL, so keys don't all expire together
await redis.setex(key, 300 + Math.floor(Math.random() * 60), value);
//                     └── between 300 and 360 seconds, spread out

// Fix B: let ONE request rebuild it while the others wait briefly.
//    'NX' means "only set this if it doesn't already exist" — so exactly
//    one request wins the race and becomes the rebuilder.
const iWon = await redis.set(`lock:${key}`, '1', 'NX', 'EX', 10);
if (!iWon) {
  await sleep(50);          // someone else is already rebuilding it
  return getUser(id);       // try again — it'll be there
}
```

Fix A is one line and prevents most of it. Reach for B only on genuinely hot, genuinely expensive keys.

### ③ Caching a failure

```js
const user = await db.users.findById(id);   // returns null — DB hiccup
await redis.setex(key, 300, JSON.stringify(user));   // ⚠️ you just cached null
```

**A five-second glitch is now a five-minute outage for that user.** Either don't cache empty results, or cache them for a much shorter time (~30 seconds). Caching "this doesn't exist" briefly is actually useful — it stops repeated lookups for IDs that were never real.

---

<a name="redis"></a>
# 3. Redis — where you keep the cache

**Redis is a database that keeps everything in memory instead of on disk.** That's why it answers in about a millisecond while a normal database takes tens of milliseconds — no disk involved.

Concepts in [05.5-redis-deep-dive](../05.5-redis-deep-dive.md). What matters in Node:

## Name your keys predictably
```js
`user:42:profile`         // ✅ you can look at this and know what it is
`u42p`                    // ❌ nobody, including you in a month, knows this
```
Colons are just convention, but a consistent shape lets you find and delete related keys later.

## The three jobs Redis does in a typical app

```js
// ① Cache — everything in §2.

// ② Counting things
await redis.incr(`views:post:${id}`);
```
**Why not do this in your database?** Because with 8 server processes ([Part 2](02-nodejs-internals.md)), two could read "100", both add 1, and both write "101" — one view vanishes. That's a **race condition**. Redis handles one command at a time, so `INCR` can't be interrupted halfway. It's **atomic**, meaning it either fully happens or doesn't.

```js
// ③ Rate limiting — "no more than 100 requests per minute from this IP"
const count = await redis.incr(`rl:${ip}`);
if (count === 1) await redis.expire(`rl:${ip}`, 60);  // start a 60s clock
if (count > 100) throw new TooManyRequests();
```
Same reason: the counter must be correct across every server process, so it can't live in one process's memory.

## Don't ask 100 times when you can ask once ⭐

Every Redis command is a network trip — roughly 1ms out and back. So:

```js
// ❌ 100 separate trips = ~100ms
for (const id of ids) {
  users.push(await redis.get(`user:${id}`));
}

// ✅ ONE trip carrying 100 commands = ~2ms
const pipeline = redis.pipeline();
ids.forEach(id => pipeline.get(`user:${id}`));
const results = await pipeline.exec();
```

**This is called pipelining** — bundling commands into a single trip. It's the same lesson as `Promise.all` in [Part 3](03-asynchronous-programming.md): **things that don't depend on each other shouldn't wait in line.**

> ⚠️ **Never run `KEYS *` on a production Redis.** It scans every single key, and because Redis does one thing at a time, **your entire cache is frozen** until it finishes. With millions of keys that's seconds of total outage. Use `SCAN`, which walks through in small batches.

---

<a name="pagination"></a>
# 4. ⭐ Pagination — don't send everything

**Pagination means returning results in pages instead of all at once.** There are two ways, and one of them breaks.

## The common way: offset (and why it dies)

```js
// "skip the first 40 results, then give me 20" — page 3
await Order.find().skip(40).limit(20);
```

Fine for page 3. Now think about page 50,000:

```js
await Order.find().skip(1_000_000).limit(20);
```

**The database has to walk past a million records, one at a time, throwing each away, just to reach the twenty you want.** It can't jump — it has to count.

```
page 1       skip 0          →     2ms   ✅
page 100     skip 2,000      →    15ms   🟡
page 5,000   skip 100,000    →   400ms   ❌
page 50,000  skip 1,000,000  → 4,000ms   ☠️
```

**And there's a second problem — it gives wrong results.** Imagine you're reading page 1 of a feed, and someone posts a new item:

```
Before:  [A][B][C] | [D][E][F]      you read page 1 = A,B,C
Someone posts NEW at the top:
After:   [NEW][A][B] | [C][D][E]    you ask for page 2 = C,D,E
                                    ⚠️ you see C twice, and never see F… wait
```
Everything shifted down by one, so **you see an item twice, or skip one entirely.** Any list that changes while people page through it has this bug.

## The better way: cursor

**Instead of "skip 1,000,000 records", say "give me the 20 after this specific one."**

```js
// The client sends back the ID of the last item it saw.
const query = cursor ? { _id: { $gt: cursor } } : {};   // $gt = "greater than"
const items = await Order.find(query).sort({ _id: 1 }).limit(20);
const nextCursor = items[items.length - 1]?._id;        // send this back next time
```

**Why this is fast:** the database has an index on `_id`, so "find the record with this ID" is an instant lookup — like opening a dictionary at the right letter instead of reading from page 1. **Page 50,000 costs exactly what page 1 costs.**

**And it's correct**, because you're saying "after item X," which stays true no matter what gets inserted above.

| | Offset (`skip`) | Cursor |
|---|---|---|
| Deep pages | ❌ gets slower and slower | ✅ always the same speed |
| Jump to page 500 | ✅ can | ❌ can't — only "next" |
| Correct while data changes | ❌ duplicates and skips | ✅ |
| Show "page 3 of 47" | ✅ | ❌ no total |
| **Use for** | admin tables with page numbers | **feeds, infinite scroll, APIs** ⭐ |

**One detail if you sort by something non-unique**, like a date. If ten orders share a timestamp, "after this date" is ambiguous and you'll skip some. Add the ID as a tiebreaker:

```js
.sort({ createdAt: -1, _id: -1 })   // sort by date, then by id for ties
```

> ⚠️ **Also: `countDocuments()` on a big collection reads the whole thing.** Showing "1–20 of 4,300,000" can be slower than the actual query. Cache that number, estimate it, or don't show it.

---

<a name="streams"></a>
# 5. Streams — don't hold everything

**Full treatment in [Part 9.5](09.5-streams-deep-dive.md).** The one-paragraph version:

```js
const data = await fs.readFile('2gb.csv');    // ❌ loads all 2GB into memory
fs.createReadStream('2gb.csv').pipe(res);     // ✅ handles ~64KB at a time
```

**A stream processes data in small pieces instead of loading all of it.** Memory stays flat whether the file is 2MB or 2TB — like moving a shipment box by box on a conveyor belt instead of lifting the whole pallet.

**Why it matters for performance specifically:** ten users downloading a 1GB file is **10GB of memory** with `readFile`, and about **640KB** with streams. That's the difference between a server that works and one that crashes.

**And one concept — backpressure.** If you read from disk at 500MB/s but the user's connection only accepts 5MB/s, the difference piles up in memory until you've effectively loaded the whole file anyway. **Backpressure is the slow side telling the fast side to wait.** `pipeline()` handles it for you automatically — that's the main reason to use it.

---

<a name="finding"></a>
# 6. ⭐ Finding the problem when something IS slow

Everything above is how to *be* fast. This is what you do when something already isn't — and it's the part interviews actually probe, because it's about method, not trivia.

> **The single biggest mistake is guessing.** Everyone has a hunch about what's slow. The hunch is usually wrong, and you spend a day optimizing something that wasn't the problem.

## The one question that splits everything in two ⭐

> **"Is MY code slow, or am I WAITING for something else?"**

Almost every performance problem is one or the other, and they have completely different fixes:

```
MY CODE IS SLOW                    I'M WAITING ON SOMETHING
(a loop, JSON.parse, sorting)      (database, another API, Redis)
        │                                    │
   the whole server                   only that endpoint
   slows down for                     is slow; everything
   EVERYONE                           else is fine
        │                                    │
   fix: move work off the            fix: add an index, cache it,
        main thread / to the DB           fix the N+1
```

**The reason it splits so cleanly** is [Part 1.2](01.2-event-loop-blocking-and-real-world-load.md): your JavaScript runs on one thread, so CPU work blocks everybody, while waiting costs nothing and blocks nobody.

## The measurement that answers it: event loop lag

**Event loop lag = how late a timer fires.**

You ask Node to run something in 0ms. If it actually runs 300ms later, something was hogging the thread for 300ms — because Node can't interrupt running code to fire your timer.

```js
const { monitorEventLoopDelay } = require('perf_hooks');
const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();

setInterval(() => {
  console.log('lag:', h.percentile(99) / 1e6, 'ms');
}, 5000);
```

```
under 10ms    ✅ healthy — the thread is free
10 to 100ms   🟡 something is hogging it sometimes
over 100ms    ❌ requests are queueing behind CPU work
```

> ⭐ **Why this is the most important Node metric: a blocked event loop looks HEALTHY on every other dashboard.** Memory is normal. The process isn't crashing. CPU shows one core busy — which is completely normal for Node. **Only lag reveals it.**

## The order to check things

```
1. WHICH endpoint, and WHEN did it start?
      → correlate with deploys and traffic. A sudden jump = a deploy.
        A slow slide = data growing.

2. p50 or p99?
      → p50 = everyone is slower (systemic)
        p99 = only sometimes (GC, cache misses, waiting for a thread)

3. EVENT LOOP LAG   ⭐ the fork
      → high  = my code is blocking  → step 4
        normal = I'm waiting on something → step 5

4. CPU profile — which function?
5. Database / external calls — which query?
```

## Step 4: reading a CPU profile

```bash
node --cpu-prof app.js        # produces a file you open in Chrome DevTools
npx clinic doctor -- node app.js   # ⭐ easiest: it tells you the category
```

A **flame graph** shows which functions used CPU time. The only rule you need:

```
   ┌──────────────────────────────────────────────┐
   │            handleRequest                     │   ← wide = lots of time
   ├──────────────┬───────────────────────────────┤
   │ parseBody    │        sortResults            │   ← THIS is your problem
   ├──────────────┴───────────────────────────────┤
   │                                              │
```

**Width = time spent. Look for anything unexpectedly wide.** Depth just means "functions calling functions" and is not a problem by itself.

Usual culprits: `JSON.parse` on a big payload, sorting a large array, a nested loop, `readFileSync`, or synchronous crypto.

## Step 5: it's not my code — what's slow downstream?

The usual four, in order of likelihood:

| Cause | How to spot it |
|---|---|
| **Missing index** | one query is slow; `explain()` says `COLLSCAN` ([Part 8](08-mongodb-and-mongoose.md)) |
| **N+1 queries** | high **query count** per request, though each is fast |
| **Cache hit rate dropped** | hits fell from 95% → 50%, so twice as many requests reach the DB |
| **Thread pool queueing** | one endpoint slow, lag *normal*, and it uses `fs`/`bcrypt`/`zlib` |

**N+1 explained**, since it's the most common and the sneakiest:
```js
const orders = await Order.find();               // 1 query
for (const o of orders) {
  o.user = await User.findById(o.userId);        // + 1 query PER ORDER
}
// 100 orders = 101 queries
```
Each query takes 2ms, so nothing looks slow in isolation — but 101 × 2ms = 202ms. **You find it by counting queries per request, not by timing them.**

---

<a name="leaks"></a>
# 7. Memory leaks

**Full treatment in [Part 2.8](02.8-memory-management.md).** The performance-relevant version:

**A leak is memory you're still holding but will never use again.**

## The symptom order surprises people

```
memory grows → garbage collection works harder → LATENCY GETS SPIKY → crash
                                                         ↑
                                            you notice THIS first
```

**Why latency, before running out of memory?** Because garbage collection runs **on your one thread**. The more objects it has to check, the longer it pauses everything. So a leak shows up as **p99 getting worse** long before you see an out-of-memory error.

## Is it actually a leak? Look at the shape

```
HEALTHY (sawtooth returning to the same floor)     LEAK (the floor rises)
   /|  /|  /|  /|                                     /|   /|    /|
  / | / | / | / |                                    / |  / |   / |
 /  |/  |/  |/  |                                   /  |_/  |__/  |___
─────────────────── same floor each time           ──────────────────── ⬆
```

Memory going up and down is **normal** — that's allocation and collection. What matters is whether it comes back down to **the same level**. A floor that creeps upward means each collection is recovering less than the last.

## The four causes

```js
// ① Something that only ever grows            ← by far the most common
const cache = {};
app.use((req, res, next) => { cache[req.id] = req; next(); });
// nothing ever removes entries → fix: a size limit, or Redis with a TTL

// ② Listeners you add but never remove
emitter.on('event', handler);        // in a request handler = one leak per request
// → emitter.off() when done

// ③ Timers you never stop
setInterval(poll, 1000);             // keeps everything it references alive forever
// → clearInterval on shutdown/disconnect

// ④ A closure holding more than you think
function outer() {
  const huge = new Array(1e7);       // 80MB
  return () => 42;                   // ⚠️ doesn't use `huge`, but keeps it alive
}
```

④ is surprising and worth understanding — see [Part 1 §4](01-javascript-execution-model.md). V8 keeps **one shared box of variables per scope**, so if any surviving function needs *anything* from that scope, the whole box survives, `huge` included.

## Finding it: take three snapshots

A **heap snapshot** is a photograph of every object in memory.

```
1. Take snapshot #1                         ← the baseline
2. Hit the suspect endpoint 1,000 times
3. Take snapshot #2
4. Wait, force garbage collection, take #3
5. Compare #1 with #3
```

**Why three and not two?** Snapshot #2 is full of objects that are garbage but haven't been cleaned up yet — they'd look like a leak and aren't. Anything **still present in #3, after collection ran**, is genuinely being held.

```bash
node --inspect app.js     # then open chrome://inspect → Memory tab
```

Then, in DevTools, two things matter:
- **The "Comparison" view** — shows what those 1,000 requests left behind.
- **The "Retainers" panel** ⭐ — **this is the answer.** It tells you *what is holding this object*. That's the line of code you fix. Everything else just tells you *what* leaked.

---

<a name="interview"></a>
# 8. Interview Questions & Answers

### Q1. An API's latency doubled. How do you diagnose it?
> "I'd narrow it down before touching any code.
>
> **① What changed and when?** A sudden jump usually means a deploy; a gradual slide usually means data growing or a leak.
>
> **② Is it everything or one endpoint?** Everything slowing down points at something shared — the event loop, the database, the cache. One endpoint points at its own query or logic.
>
> **③ Did p50 move, or only p99?** p50 doubling means every request got slower — something systemic. Only p99 moving means it's occasional: GC pauses, cache misses, or waiting for a free thread.
>
> **④ Then the key question — is my code slow, or am I waiting?** I check **event loop lag**. High lag means my own CPU work is blocking the thread, so I'd take a CPU profile and look for an unexpectedly wide function in the flame graph. Normal lag means I'm waiting on something downstream.
>
> **⑤ If it's downstream**, the usual four are: a query that lost its index as data grew, an N+1 introduced by new code, a cache hit rate that dropped, or thread-pool queueing. **A hit rate falling from 95% to 50% roughly doubles average latency by itself** — which matches the symptom exactly."

### Q2. How would you identify an event-loop bottleneck?
> "**Event loop lag** — I ask Node to run a timer immediately and measure how late it actually fires. If a 0ms timer fires 300ms late, something hogged the thread for 300ms. Under 10ms is healthy; sustained over 100ms means requests are queueing behind CPU work.
>
> **It's the metric that matters because a blocked loop looks healthy everywhere else.** Memory is fine, the process isn't crashing, and CPU showing one core busy is normal for Node. Only lag reveals it.
>
> Once confirmed I'd take a CPU profile and look for a wide plateau in the flame graph — usually `JSON.parse` on a big payload, a large sort, a nested loop, or a sync `fs` call.
>
> **One nuance:** if lag is *fine* but a single endpoint is slow and it uses `fs`, `bcrypt` or `zlib`, that's **thread-pool exhaustion** instead. That work queues without touching the event loop, so lag stays clean while that endpoint gets slower — invisible unless you know to look."

### Q3. Why can synchronous APIs reduce throughput?
> "Because Node runs your JavaScript on one thread, and **the event loop can't interrupt code that's already running**. A synchronous call like `readFileSync` occupies that thread completely, so every other user waits — including ones whose requests were nearly finished.
>
> The math is direct: max throughput is about `1000ms ÷ CPU-milliseconds per request`. A 50ms sync call caps one process at **20 requests per second**, no matter how many cores the machine has.
>
> **The subtle part is that async I/O is free precisely because the waiting happens somewhere else.** `readFileSync` and `readFile` do identical work — the difference is entirely *who waits*. So sync calls are fine at startup, where nothing else is happening, and never inside a request handler."

### Q4. What's an N+1 query and how do you spot it?
> "One query to fetch a list, then one more for each item — so 100 orders becomes 101 queries. It usually comes from a loop with an `await` inside, or fetching a related record per item.
>
> **You spot it by counting queries per request, not by timing them** — each query is fast, which is exactly why it hides. Fix it by fetching them all at once with a single `$in` query, a join, or by storing the needed field directly on the record ([Part 8](08-mongodb-and-mongoose.md))."

### Q5. When does caching make things worse?
> "Three cases. **A low hit rate** — you pay a cache lookup on every request and rarely benefit; below about 50% it's often a net loss. **A stampede** — a popular key expires and thousands of requests hit the database at the same moment, which is worse than having no cache. And **correctness** — caching something that must be exact, or caching a `null` from a temporary failure and turning a five-second glitch into a five-minute one.
>
> Caching trades accuracy for speed. It's not free, it's a deal."

### Q6. Why measure p99 instead of the average?
> "Averages hide the worst experiences. Ninety-nine requests at 10ms and one at 5 seconds averages to 60ms — which looks healthy while a real person waited five seconds and left.
>
> **p50 tells you how it usually feels; p99 tells you where the bugs are** — GC pauses, cache misses, thread-pool waits. And at scale p99 isn't rare: at 1,000 requests per second, the worst 1% is **10 users every second**."

### Q7. How do you tell a memory leak from normal usage?
> "By the **shape** of the memory graph. Healthy memory goes up and down — allocation and collection — but always returns to roughly the same floor. A leak returns to a **higher floor each time**, because each collection recovers less than the last.
>
> To confirm, I'd take three heap snapshots: a baseline, one after exercising the suspect path a thousand times, and a third after forcing garbage collection. Anything still there in the third is genuinely held. Then the **Retainers panel** names what's holding it — and that's the line I fix."

---

<a name="cheatsheet"></a>
# 9. Cheat Sheet

### The words
```
latency    = how long ONE request takes
throughput = how many requests per second

p50 = the typical experience · p99 = the worst 1%
⭐ ALWAYS look at p99 — the average hides your worst users
   at 1,000 req/s, "the worst 1%" is 10 people EVERY SECOND

p50 got worse → everyone is slower (systemic)
p99 got worse → occasional (GC · cache miss · waiting for a thread)
```

### Caching
```
Look in the cache → HIT? return it (~1ms) → MISS? do the work, save it (~50ms)
TTL = seconds until it deletes itself · hit rate = % served from cache

CACHE: read often + changes rarely + slow to make + staleness is OK
DON'T: changes constantly · read once · must be exact right now

THE 3 PROBLEMS:
① updating it   → TTL (default) · delete on write · version in the key
② STAMPEDE      → a hot key expires, 10,000 requests hit the DB at once
                  fix: random TTL (300 + rand(60)) · one rebuilder with a lock
③ caching null  → a 5-second glitch becomes a 5-minute outage
```

### Redis
```
in-memory → ~1ms instead of ~50ms
① cache  ② counting (INCR is atomic — can't be interrupted, so no lost counts)
③ rate limiting (INCR + EXPIRE)

⭐ PIPELINE: 100 commands in ONE network trip (~2ms) not 100 trips (~100ms)
⚠️ never KEYS * in prod — Redis does ONE thing at a time, so it freezes
   everything while it scans. Use SCAN.
```

### Pagination
```
OFFSET skip(1,000,000) → walks past a million records to reach 20 → 4s ☠️
       ALSO WRONG: a new item shifts everything → duplicates and skips

CURSOR find({_id: {$gt: lastId}}).limit(20) → instant index lookup
       SAME SPEED at page 1 or page 50,000 ⭐ · correct while data changes
       non-unique sort field? add _id as a tiebreaker

offset → admin tables with page numbers · cursor → feeds, APIs, infinite scroll
⚠️ countDocuments() on a big collection reads the WHOLE thing
```

### Streams (full: Part 9.5)
```
readFile = all of it in memory · stream = ~64KB at a time
10 users × 1GB file: readFile 10GB 💥 · streams 640KB ✅
backpressure = the slow side telling the fast side to wait (pipeline() does it)
```

### Finding what's slow ⭐
```
⭐ THE ONE QUESTION: is MY CODE slow, or am I WAITING?

     my code slow          →  EVERYONE slows down  →  CPU profile
     waiting on something  →  ONE endpoint slow    →  index / N+1 / cache

ANSWERED BY: EVENT LOOP LAG = how late a 0ms timer actually fires
   <10ms ✅ · 10-100ms 🟡 · >100ms ❌
   ⭐ a blocked loop looks HEALTHY on memory and CPU dashboards. Only lag shows it.

ORDER: 1 which endpoint + when · 2 p50 or p99 · 3 LAG (the fork)
       4 CPU profile (flame graph: WIDTH = time) · 5 DB (index/N+1/hit rate)

⚠️ lag normal + ONE endpoint slow + it uses fs/bcrypt/zlib → THREAD POOL queueing

N+1 = 1 query for the list + 1 per item = 101 queries
      each is fast → find it by COUNTING queries, not timing them
```

### Memory leaks (full: Part 2.8)
```
⭐ SYMPTOM ORDER: memory grows → GC works harder → SPIKY LATENCY → crash
   (you notice the latency FIRST — GC pauses run on your one thread)

SHAPE: up and down to the SAME floor ✅ normal
       floor CREEPING UP ❌ leak

CAUSES: ① something that only grows (cache with no limit)
        ② listeners never removed  ③ timers never stopped
        ④ a closure keeping its whole scope alive

FIND IT: 3 snapshots — baseline → 1,000 requests → snapshot → GC → snapshot
         (#2 is full of not-yet-collected garbage, that's why you need #3)
         Comparison view = what's left · RETAINERS panel ⭐ = WHO holds it
```

---

*— Part 9 of the Node.js notes. Related: [Part 1.2 — Why one slow request freezes everyone](01.2-event-loop-blocking-and-real-world-load.md) · [Part 2.8 — Memory](02.8-memory-management.md) · [Part 9.5 — Streams](09.5-streams-deep-dive.md) —*
