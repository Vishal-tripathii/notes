# Node.js Study Notes — Part 3

## Asynchronous Programming — Callbacks, Promises, async/await & Error Propagation

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.
>
> **Continues from:** [Part 1](01-javascript-execution-model.md) (event loop, microtasks) and [Part 1.2](01.2-event-loop-blocking-and-real-world-load.md) (blocking vs latency).
>
> **▶ Runnable companion:** [`work/promise.js`](../work/promise.js) — every example below, live, with timestamps. `node promise.js`.
>
> ⭐ **Kill this misconception first:** `await` in a loop does **not** block the event loop. Your server keeps serving other users fine. It only makes *this one request* slow. It's a **latency** problem, not a blocking problem.

---

## Table of Contents

1. [Callbacks — and the 6 real problems](#callbacks) ⭐
2. [Callback hell — why it's shaped like a pyramid](#hell)
3. [Promises — which problems they fixed](#promises)
4. [async/await — the last two](#await)
5. [The whole story in one table](#story)
6. [Promise combinators](#combinators)
7. [Error propagation & the traps](#errors)
8. [Patterns: timeout, retry, concurrency limit](#patterns)
9. [Interview Questions & Answers](#interview)
10. [Cheat Sheet](#cheatsheet)

---

<a name="callbacks"></a>
# 1. Callbacks — and the 6 real problems

**What it is:** you hand a function to an async operation — *"run this when you're done."*

> **Analogy 📞 — leaving your phone number.** You call a shop about an out-of-stock part. You don't stay on the line for three days. You leave your number and hang up; they call you back.

```js
fs.readFile('data.txt', (err, data) => {   // runs later
  if (err) return console.error(err);
  console.log(data);
});
console.log('this runs FIRST');
```

**Node's convention is error-first:** `(err, result)`. It exists **because** of problem #3 below — `try/catch` can't catch async errors, so handing you the error as an argument is the only channel left.

## The 6 problems

### ⚠️ #1 — You cannot return a value from a callback ⭐ *the root cause*
The result only exists **inside** the callback. Anything needing it must be written inside too. That single fact creates the pyramid.

### ⚠️ #2 — Error handling is copy-pasted at every level
Four calls = four identical `if (err)` lines. **Miss one and the failure vanishes silently** — no crash, no log, the request just hangs.

### ⚠️ #3 — `try/catch` is useless
```js
try {
  setTimeout(() => { throw new Error('boom'); }, 10);
} catch (e) {
  // ❌ never runs — the process CRASHES instead
}
```
By the time the callback fires, the `try` block has finished and left the call stack ([Part 1 §2](01-javascript-execution-model.md)). The error is thrown on a **fresh stack** with no `try` on it.

### ⚠️ #4 — Parallel work needs hand-rolled bookkeeping
Three independent calls should run at once. With callbacks you write this yourself:
```js
let pending = 3, failed = false;
const collect = key => (err, value) => {
  if (failed) return;
  if (err) { failed = true; return done(err); }   // guard, or done() fires twice
  results[key] = value;
  if (--pending === 0) done(null, results);       // the manual counter
};
```
Everyone wrote this by hand, slightly differently, and slightly wrong.

### ⚠️ #5 — Nothing stops a callback being called twice (or never)
```js
function buggyLibrary(callback) {
  callback(null, 'charged $250');
  callback(null, 'charged $250');    // 💥 double-charge, invisible to you
}
```
A callback is just a function some other code *agreed* to call correctly. There's no guarantee anywhere in the language.

### ⚠️ #6 — Inversion of control
You hand **your** function to **their** code and hope they call it once, with the right arguments, at the right time.

---

<a name="hell"></a>
# 2. Callback hell — why it's shaped like a pyramid

```js
getUserCB(1, (err, user) => {
  if (err) return done(err);                       // check #1
  getOrdersCB(user.id, (err, orders) => {
    if (err) return done(err);                     // check #2 (identical)
    getPaymentCB(orders[0].id, (err, payment) => {
      if (err) return done(err);                   // check #3 (identical)

      //  ⭐ THIS LINE is why the pyramid exists.
      //  It needs user.email AND payment — produced 3 levels apart.
      //  The only place both are in scope is right here, at the bottom.
      sendEmailCB(user.email, payment, (err, result) => {
        if (err) return done(err);                 // check #4 (identical)
        done(null, 'finished');                    // 5 levels deep
      });
    });
  });
});
```

> **Analogy 🪆 — Russian dolls.** Every value you need is one doll deeper. To use `user` *and* `payment` together you must be inside the innermost doll — so the code grows **rightward** instead of downward.

**The nesting is a symptom, not the disease.** The disease is problem #1.

---

<a name="promises"></a>
# 3. Promises — which problems they fixed

**A promise is an object representing a value that isn't ready yet.** Three states, and it changes **once**:

```
                ┌──▶  FULFILLED  (has a value)
   PENDING ─────┤
                └──▶  REJECTED   (has an error)

   Once settled, frozen forever. It cannot un-settle or change again.
```

> **Analogy 🍔 — the restaurant buzzer.** You order and get a buzzer **immediately** — that's the promise, pending. Later it buzzes (fulfilled) or a server comes over to say the kitchen is out (rejected). You get it right away even though the food isn't ready, and it fires exactly once.

> ⭐ **The key insight:** a promise is **a value you can return**, hold in a variable, and pass around. Problem #1 was *"you can't return anything"* — **a promise IS the thing you return.** Every other fix follows from that one change.

```js
getUser(1)
  .then(user  => getOrders(user.id))        // ⭐ RETURN → the chain WAITS
  .then(orders => getPayment(orders[0].id))
  .then(payment => sendEmail(payment))
  .then(() => res.json({ done: true }))
  .catch(err => handle(err));               // ⭐ ONE catch for the whole chain
```

| Fixed | How |
|---|---|
| ✅ **#2** | one `.catch()` covers a failure from any step — 4 checks became 1 |
| ✅ **#4** | `Promise.all([...])` replaces the counter |
| ✅ **#5** | a promise settles once; a second `resolve()` is ignored |
| ✅ **#6** | control inverted back — *they* hand *you* a promise |
| 🟡 **#1** | **only half.** See below. |

### Two rules that cause most promise bugs

**① You must `return` inside `.then`:**
```js
.then(user => { getOrders(user.id); })   // ❌ no return → next .then gets undefined
.then(user => getOrders(user.id))        // ✅ chain waits
```

**② Promises are eager, not lazy.** A promise starts executing **the moment it's created**, not when you `await` it — which is useful:
```js
const a = fetchUser();      // ⚡ both start RIGHT NOW
const b = fetchOrders();
const user = await a;       // just collecting results
```

### Why #1 is only half-fixed
Each `.then()` receives only the **previous** step's value. Need `user` *and* `payment` together? You still need a workaround:

```js
let user;                         // ⚠️ the leftover hack
getUser(1)
  .then(u => { user = u; return getOrders(u.id); })
  .then(orders => getPayment(orders[0].id))
  .then(payment => sendEmail(user.email, payment));   // reaching outside
```

---

<a name="await"></a>
# 4. async/await — the last two

Syntactic sugar over promises. Same machinery, reads top-to-bottom.

> **Analogy 🍔 — same buzzer, different choice.** `.then()` is *"give me the buzzer, I'll browse the shops."* `await` is *"I'll stand right here until it buzzes."* **You're still not blocking the restaurant** — other customers get served. You just chose to wait before doing *your* next thing.

```js
async function handler(req, res) {
  try {
    const user    = await getUser(req.params.id);
    const orders  = await getOrders(user.id);
    const payment = await getPayment(orders[0].id);

    // ⭐ user AND payment both just... in scope. Like ordinary variables.
    //    This is the line that needed 5 levels of nesting with callbacks.
    await sendEmail(user.email, payment);

    res.json({ done: true });
  } catch (err) {          // ⭐ catches ANY line above
    handle(err);
  }
}
```

| Fixed | How |
|---|---|
| ✅ **#1** | every value stays in **one normal function scope** — no nesting, no outer variable |
| ✅ **#3** | **real `try/catch` works again** — `await` keeps you on the same logical call stack |

**Three facts:**
- An `async` function **always returns a promise**, whatever you return.
- `throw` inside it becomes a **rejection**.
- `await` doesn't block the thread — it hands control back to the event loop and resumes as a **microtask** ([Part 1 §11](01-javascript-execution-model.md)).

---

<a name="story"></a>
# 5. The whole story in one table

| Problem | Callbacks | Promises | async/await |
|---|:---:|:---:|:---:|
| #1 can't return a value | ✗ | 🟡 partly | ✅ |
| #2 error checks repeated | ✗ | ✅ | ✅ |
| #3 `try/catch` doesn't work | ✗ | `.catch` | ✅ |
| #4 parallel needs a counter | ✗ | ✅ | ✅ |
| #5 can be called twice | ✗ | ✅ | ✅ |
| #6 inversion of control | ✗ | ✅ | ✅ |

---

<a name="combinators"></a>
# 6. Promise combinators

> **Analogy 🍽️ — ordering for a table of four.**
> - **`all`** — nobody eats until all four dishes arrive; one ruined = order off
> - **`allSettled`** — everyone eats what arrived; you get a report of what failed
> - **`race`** — first dish to hit the table wins, good or bad
> - **`any`** — first *edible* dish wins; failures ignored unless everything fails

| Combinator | Resolves when | Rejects when | Use for |
|---|---|---|---|
| **`all`** | **all** succeed | **any** fails (immediately) | dashboard — you need all of it |
| **`allSettled`** | **all** settle | never | bulk ops where partial success is fine |
| **`race`** | **first** to settle | first settles as a rejection | timeouts |
| **`any`** | **first** to succeed | all fail | fallbacks / mirrors |

```js
// all — dashboard: 200 + 300 + 200ms runs in 300ms, not 700ms
const [user, orders, notifs] = await Promise.all([
  getUser(id), getOrders(id), getNotifications(id),
]);

// allSettled — 1,000 emails; one bad address shouldn't kill the batch
const results = await Promise.allSettled(users.map(u => sendEmail(u)));
const failed  = results.filter(r => r.status === 'rejected');

// any — first mirror that works
const img = await Promise.any([fetch(cdn1), fetch(cdn2), fetch(cdn3)]);
```

### `all` vs `allSettled` — what you actually get back ⭐

The return **shape** is the detail people miss. `all` gives you a plain array of values; `allSettled` gives you an array of **outcome objects**.

```js
// Promise.all → array of RESOLVED VALUES, in input order (NOT completion order)
const [user, orders, notifs] = await Promise.all([
  getUser(id),        // 'U'
  getOrders(id),      // 'O'
  getNotifications(id) // 'N'
]);
// → ['U', 'O', 'N']   ✅ all succeeded

// ...but if ANY rejects, the whole thing rejects and you get NONE of the values:
try {
  await Promise.all([
    getUser(id),                       // succeeds
    Promise.reject(new Error('orders down')), // fails
  ]);
} catch (e) {
  // ❌ e = Error('orders down')  — the successful getUser result is LOST
}
```

```js
// Promise.allSettled → array of OUTCOME OBJECTS, never rejects
const outcomes = await Promise.allSettled([
  getUser(id),                          // succeeds
  Promise.reject(new Error('orders down')), // fails
]);
// → [
//     { status: 'fulfilled', value: 'U' },
//     { status: 'rejected',  reason: Error('orders down') },
//   ]

// so you split successes from failures yourself:
const ok     = outcomes.filter(o => o.status === 'fulfilled').map(o => o.value);
const failed = outcomes.filter(o => o.status === 'rejected').map(o => o.reason);
// ok → ['U'],  failed → [Error('orders down')]
```

> **The shape to memorize:** `all` → `[v1, v2, …]` (or it throws). `allSettled` → `[{status:'fulfilled', value}, {status:'rejected', reason}, …]` (never throws). `value` on success, `reason` on failure.

> ⚠️ **`Promise.all` rejects on the first failure — but it does NOT cancel the others.** They keep running and their results are discarded. **If one was writing to your database, that write still happens.**

---

<a name="errors"></a>
# 7. Error propagation & the traps

### Trap 1 — a missing `await` swallows the error ⭐ *most common in production*
```js
async function handler(req, res) {
  try {
    saveToDb(req.body);        // ❌ no await → rejects LATER, catch is gone
  } catch (e) { /* never runs */ }
  res.json({ ok: true });      // lies to the user; the save may have failed
}
```
> **Rule: every promise needs one of — `await`, `.catch()`, or `return`.** Nothing else.

### Trap 2 — `.catch()` resumes the chain
```js
fetchUser()
  .catch(err => null)                    // handled → chain CONTINUES with null
  .then(user => console.log(user.name)); // 💥 TypeError on null
```
`.catch` doesn't stop the chain, it **recovers** it. Everything after runs with whatever `catch` returned.

### Trap 3 — `forEach` ignores promises
```js
items.forEach(async item => { await save(item); });   // ❌ doesn't wait at all
await Promise.all(items.map(item => save(item)));     // ✅
```
Errors inside become unhandled rejections, and the function returns before any save finishes.

### Trap 4 — Express 4 doesn't catch async errors
```js
app.get('/x', async (req, res) => { throw new Error('boom'); });  // ❌ never
```
Express 4 only catches **synchronous** throws. Use `express-async-errors`, wrap your handlers, or move to Express 5.

### The rules that work
```
throw in an async fn   → rejects the returned promise
throw inside .then     → skips to the next .catch
error-first callback   → check `err` at every level, manually
try/catch              → works with await, NEVER with bare callbacks
one .catch at the end  → covers the whole chain above it
```

---

<a name="patterns"></a>
# 8. Patterns: timeout, retry, concurrency limit

```js
// TIMEOUT — race anything against a timer
const withTimeout = (promise, ms) => Promise.race([
  promise,
  new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
]);

// RETRY with exponential backoff
// ⚠️ Only retry IDEMPOTENT operations — retrying a payment can double-charge.
async function retry(fn, attempts = 3, base = 100) {
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) {
      if (i === attempts - 1) throw e;
      await new Promise(r => setTimeout(r, base * 2 ** i));   // 100, 200, 400ms
    }
  }
}

// CONCURRENCY LIMIT — between a slow serial loop and Promise.all blowing up
// your 20-connection pool with 10,000 queries. (Production: `p-limit`.)
const limit = pLimit(10);
await Promise.all(ids.map(id => limit(() => getUser(id))));
```

---

<a name="interview"></a>
# 9. Interview Questions & Answers

### Q1. Why shouldn't `await` be used inside loops?
> "Because it **serializes work that could run in parallel** — each iteration waits for the previous one."
```js
for (const id of ids) users.push(await getUser(id));   // ❌ 100 × 200ms = 20s
const users = await Promise.all(ids.map(getUser));      // ✅ ~200ms
```
> **The nuance that gets you the job:** "It's about **latency, not blocking** — the event loop is free the whole time, other requests are served normally. It only makes *this* request slow.
>
> And sometimes serial is correct: when each iteration **depends on the previous result**, when respecting an **API rate limit**, or when you need **backpressure** — firing 100,000 parallel queries will exhaust the connection pool and is worse than the loop. For large batches I'd use `p-limit` rather than either extreme."

### Q2. Difference between `Promise.all()` and `Promise.allSettled()`?
> "**`all` is fail-fast** — it rejects the moment any promise rejects, and you lose the successful results too. **`allSettled` never rejects** — it waits for everything and returns `{status, value}` or `{status, reason}` for each.
>
> `all` when you need every piece — a dashboard where a missing widget makes the page useless. `allSettled` when partial success is valid — 1,000 notifications where one bad address shouldn't kill the batch.
>
> **The detail people miss: `all` rejecting doesn't *cancel* the others.** They keep running and their results are discarded. Side effects still happen."

### Q3. How do unhandled promise rejections affect production systems?
> "**Since Node 15 they crash the process by default** — treated like an uncaught exception. Before that they were a warning, which was arguably worse because failures went silent.
>
> In production: under `cluster` or Kubernetes a worker dies and restarts, so you see mysterious restarts and dropped in-flight requests. On a hot path it's a crash loop. And it's usually a *hidden* bug — the cause is normally a forgotten `await`, so **the user already got a 200 OK for an operation that actually failed.** Silent data loss.
>
> I'd add a `process.on('unhandledRejection')` hook that logs to Sentry and shuts down gracefully, plus a lint rule for floating promises."

### Q4. `Promise.all` with 10,000 promises — what goes wrong?
> "You fire 10,000 operations simultaneously. Against a 20-connection pool, 9,980 queue and start timing out; against an external API you get rate-limited; and you hold 10,000 results in memory at once. **`Promise.all` has no concurrency control** — it starts everything immediately. Use `p-limit` or batch."

### Q5. Is `await` in a loop ever the *right* answer?
> "Yes — when iterations depend on each other (paginating with a cursor from the previous page), when respecting a rate limit, or when you need backpressure. Sequential isn't wrong; **unintentionally** sequential is."

### Q6. What's the difference between these two?
```js
const a = await getUser(); const b = await getOrders();      // 400ms sequential
const [a, b] = await Promise.all([getUser(), getOrders()]);  // 200ms parallel
```
> "The first doesn't even *start* `getOrders` until `getUser` finishes. They're independent, so that's wasted time. **The tell is whether the second call uses the first one's result** — if not, it belongs in a `Promise.all`."

### Q7. Why are callbacks still around if promises are better?
> "Node's core APIs predate promises, and **streams and event emitters are genuinely event-based** — `server.on('request')` fires many times, while a promise settles exactly once. Promises are the wrong shape for repeated events. For anything one-shot, `require('fs/promises')` or `util.promisify` covers it."

---

<a name="cheatsheet"></a>
# 10. Cheat Sheet

### The 6 problems → what fixed them
```
#1 can't return a value  →  promises (partly) → await (fully)   ⭐ the root cause
#2 repeated if(err)      →  one .catch()
#3 try/catch useless     →  await + try/catch
#4 manual counter        →  Promise.all
#5 called twice          →  promises settle ONCE
#6 inversion of control  →  they return a promise, you decide
```

### Promise states
```
PENDING ──▶ FULFILLED (value)
        └─▶ REJECTED  (error)      settles ONCE, then frozen
```

### Combinators
```
all        → ALL succeed, fails fast   (⚠️ does NOT cancel the others)
allSettled → never rejects, full report
race       → first to SETTLE           (→ timeouts)
any        → first to SUCCEED          (→ fallbacks)
```

### The rules
```
• every promise needs: await | .catch() | return          ← nothing else
• .then must RETURN to chain
• promises are EAGER — they start when created, not when awaited
• .catch RESUMES the chain, it doesn't stop it
• forEach ignores promises — use map + Promise.all
• async fn always returns a promise; throw = rejection
• unhandled rejection = process CRASH since Node 15
```

### Sequential vs parallel
```js
await a(); await b();                 // ❌ 400ms — only if b needs a's result
await Promise.all([a(), b()]);        // ✅ 200ms — independent work
const pa = a(), pb = b();             // ✅ 200ms — eager start, await later
await Promise.all(ids.map(f))         // ✅ but no concurrency limit ⚠️
await Promise.all(ids.map(id => limit(() => f(id))))   // ✅✅ p-limit
```

### await in a loop
```
⭐ It does NOT block the event loop. Other users are served fine.
   It only makes THIS request slow. → LATENCY, not blocking.

   Correct when: each step needs the previous result · rate limits · backpressure
```

### Patterns
```
timeout → Promise.race([work, timer])
retry   → exponential backoff, IDEMPOTENT operations only
throttle→ p-limit / batching
```

---

*— Part 3 of the Node.js notes. Runnable: [`work/promise.js`](../work/promise.js) · Related: [Part 1 — Execution Model](01-javascript-execution-model.md) · [Part 1.2 — Blocking & Load](01.2-event-loop-blocking-and-real-world-load.md) —*
