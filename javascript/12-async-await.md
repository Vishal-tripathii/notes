# JavaScript Study Notes — Part 12

## async/await ⭐⭐⭐⭐⭐

**Topics:** `async`/`await` as sugar over promises · how `await` actually suspends · error handling with `try`/`catch` · sequential vs parallel `await` · top-level `await`.

---

## 1. `async`/`await` as Sugar Over Promises

> **Definition — `async` function:** a function declared with the `async` keyword that always returns a `Promise` — if the function body returns a plain value, that value is automatically wrapped in a resolved promise; if it throws, the returned promise rejects with that error.
> **Definition — `await`:** an operator, usable only inside an `async` function (or at a module's top level), that pauses execution of that function until the given promise settles, then either returns its resolved value or throws its rejection reason.

```js
async function getUser() { return { name: 'V' }; }
getUser().then(user => console.log(user)); // still a promise — async doesn't change that

async function getUserAwaited() {
  const user = await getUser(); // "unwraps" the promise, feels synchronous
  console.log(user);
}
```
`async`/`await` doesn't introduce a new concurrency mechanism — it's syntax that lets you write promise chains in a linear, synchronous-looking style, compiling down to the exact same `.then()`/microtask machinery underneath.

## 2. How `await` Actually Suspends

> **Definition:** `await` does not block the JS thread. It pauses only the **current async function**, registers the rest of that function as a continuation to run in the **microtask queue** once the awaited promise settles, and immediately returns control to the caller so other code can run in the meantime.

```js
console.log('1');
async function demo() {
  console.log('2');
  await Promise.resolve();     // suspends HERE, rest of demo() becomes a microtask
  console.log('4');             // this line runs later, as a microtask
}
demo();
console.log('3');
// 1, 2, 3, 4 — proof that await doesn't block: '3' runs before '4' even though
// demo() was called before the synchronous console.log('3')
```
**Why `await` doesn't block the thread despite "looking synchronous":** it's still the microtask queue underneath, exactly like a `.then()` callback — the engine is free to run other synchronous code and other microtasks while an `async` function is "paused" at an `await`.

## 3. Error Handling with `try`/`catch`

> **Definition:** wrapping an `await` expression in a `try`/`catch` block catches a rejected awaited promise as a thrown exception — the `async`/`await` equivalent of a `.catch()` handler on a promise chain.

```js
async function fetchUserSafe(id) {
  try {
    const user = await fetchUser(id); // if this rejects, control jumps to catch
    return user;
  } catch (err) {
    console.error('Failed to fetch user:', err);
    return null;
  }
}
```
**The trap:** `try`/`catch` only catches a rejection if you actually `await` the promise inside it. `try { fetchUser(id); } catch (err) {}` (no `await`) catches nothing — the promise rejects asynchronously, long after the synchronous `try` block has already finished, and becomes an unhandled rejection instead.

## 4. Sequential vs Parallel `await`

> **Definition:** sequential `await` runs each asynchronous step **only after** the previous one finishes, even when the steps don't actually depend on each other — parallel execution starts all the independent promises **at once** and awaits them together, so total time is the slowest one, not the sum of all of them.

```js
// SEQUENTIAL — each await blocks the next from even STARTING. Total: sum of all times.
async function slow() {
  const a = await fetchA(); // starts, waits
  const b = await fetchB(); // doesn't even START until fetchA is done
  const c = await fetchC();
  return [a, b, c];
}

// PARALLEL — all three start immediately, total time = the SLOWEST one, not the sum
async function fast() {
  const [a, b, c] = await Promise.all([fetchA(), fetchB(), fetchC()]);
  return [a, b, c];
}
```
**The classic `await`-in-a-loop performance bug:**
```js
// BAD — sequential, one at a time, N times the latency
async function fetchAllBad(ids) {
  const results = [];
  for (const id of ids) results.push(await fetchUser(id)); // each iteration waits for the last
  return results;
}
// GOOD — fire all requests immediately, await them together
async function fetchAllGood(ids) {
  return Promise.all(ids.map(id => fetchUser(id)));
}
```
Use sequential `await` only when a step genuinely depends on the previous step's *result* — otherwise, kick off independent work in parallel with `Promise.all`.

## 5. Top-Level `await`

> **Definition:** in an ES module (not inside any function), `await` can be used directly at the top level of the module — the module's execution (and anything importing it) pauses until the awaited promise settles.

```js
// config.mjs
const response = await fetch('/config.json'); // valid at module top level (ESM only)
export const config = await response.json();
```
Not available in CommonJS or plain scripts — only inside a genuine ES module ([Part 16](16-modules-commonjs-vs-esm.md)).

---

## Interview Q&A

**Q: Why doesn't `await` block the thread despite looking synchronous?**
> Because it's still built on the microtask queue underneath — `await` pauses only the current `async` function, registering its continuation as a microtask, and immediately hands control back to the caller. Other synchronous code and other microtasks can still run while the function is "paused."

**Q: What's the `await`-in-a-loop bug, and how do you fix it?**
> Awaiting inside a loop makes each iteration wait for the previous one to finish before even starting, even when the iterations are fully independent — turning N operations that could run concurrently into N operations run one after another, multiplying total latency by N. Fix: kick off all the promises first (e.g. `items.map(fetchOne)`), then `await Promise.all(...)` on the resulting array.

**Q: Why does a `try`/`catch` around a promise-returning call without `await` catch nothing?**
> Because the `try` block only catches synchronous throws (or an awaited rejection turned into a throw). A promise rejects asynchronously — by the time it actually rejects, the synchronous `try` block has already finished executing and there's nothing left listening for the exception; it becomes an unhandled promise rejection instead.

**Q: Predict:**
```js
async function a() { console.log('a start'); await b(); console.log('a end'); }
async function b() { console.log('b start'); }
console.log('script start');
a();
console.log('script end');
```
> `script start, a start, b start, script end, a end` — `a()` runs synchronously up until its `await`; `b()` runs fully synchronously (it has no `await` of its own) and returns a resolved promise; `await` on an already-resolved promise still defers the rest of `a` to a microtask, so `script end` (synchronous) runs before `a end` (microtask).

---

## Follow-ups (challenge questions)

- *Failure mode:* a function does `async function save() { await db.write(data); }` and the caller does `save();` without awaiting it — what happens if `db.write` rejects, and why is this a silent production bug (unhandled rejection) rather than a visible crash?
- *Scale:* `fetchAllGood` above with `Promise.all` on 10,000 IDs fires all 10,000 requests simultaneously — what actually breaks (rate limits, connection limits, memory), and how would you bound the concurrency (ties to the [Promise Pool exercise](25-coding-and-machine-coding-round.md))?
- *Consistency:* two `await`ed database writes inside the same `async` function, no explicit transaction — if the second write throws, is the first write already committed? What does that mean for data consistency, and what's the fix?

---

**Previous:** [Part 11 — Promises](11-promises.md) · **Next:** [Part 13 — Error Handling](13-error-handling.md)
