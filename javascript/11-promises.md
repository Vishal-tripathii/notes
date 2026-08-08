# JavaScript Study Notes — Part 11

## Promises ⭐⭐⭐⭐⭐

**Topics:** the three states and why a promise only settles once · chaining · error handling and where `.catch()` sits · `.finally()` · `Promise.all()` vs `allSettled()` vs `race()` vs `any()` · implementing `Promise.all()` from scratch.

---

## 1. The Three States

> **Definition:** a `Promise` is an object representing the eventual completion (or failure) of an asynchronous operation, existing in exactly one of three states at any time — **pending** (not yet settled), **fulfilled** (completed successfully, holding a value), or **rejected** (failed, holding a reason) — and once it moves from pending to fulfilled or rejected, it is **settled** permanently and can never change state again.

```js
const p = new Promise((resolve, reject) => {
  setTimeout(() => resolve('done'), 1000); // calling resolve/reject transitions the state
});
```

**Why "only settles once" matters:** calling `resolve()` a second time, or `resolve()` then `reject()`, is silently a no-op — the first call wins permanently. This guarantee is what makes `.then()` reliable: a callback attached to a promise fires exactly once, ever, with a value that can never be "changed out from under it" later.

## 2. Chaining

> **Definition:** `.then(onFulfilled, onRejected)` registers callbacks to run when a promise settles, and itself **returns a brand-new promise** — resolved with whatever the callback returns (or with the settled value of a promise it returns), which is what makes `.then()` calls chainable in sequence rather than nested.

```js
fetchUser(id)
  .then(user => fetchOrders(user.id))   // returns a promise — the chain WAITS for it
  .then(orders => console.log(orders))
  .catch(err => console.error(err));
```
Each `.then()` produces a distinct promise; if the callback returns a plain value, the new promise resolves with it immediately (well, on the next microtask); if it returns another promise, the chain "flattens" and waits for that one too — the mechanism that turns nested async steps into a flat, readable sequence instead of the "callback hell" pyramid.

## 3. Error Handling & `.catch()`

> **Definition:** `.catch(onRejected)` is shorthand for `.then(undefined, onRejected)` — it registers a handler for whichever preceding promise in the chain rejects, and a rejection **propagates down the chain**, skipping every intermediate `.then()` that has no rejection handler, until it hits a `.catch()` (or the end of the chain, becoming an unhandled rejection).

```js
fetchUser(id)
  .then(user => fetchOrders(user.id))
  .then(orders => processOrders(orders)) // if fetchUser OR fetchOrders rejects, both
  .catch(err => console.error(err));       // .then()s here are skipped entirely, straight to catch
```
**Why the chain "swallows" an error until the nearest `.catch()`:** a rejection converts the *entire rest of the chain* into rejected promises, one after another, until something actually handles it (`.catch()`, or the second argument to `.then()`). Put `.catch()` at the **end** of a chain to catch errors from any step; put it mid-chain only when you deliberately want to recover and continue.

## 4. `.finally()`

> **Definition:** `.finally(onFinally)` registers a callback that runs when the promise settles, **regardless of whether it fulfilled or rejected**, and receives no argument — used for cleanup that must happen either way.

```js
showSpinner();
fetchData()
  .then(render)
  .catch(showError)
  .finally(hideSpinner); // runs whether fetchData succeeded or failed
```

## 5. `Promise.all` vs `allSettled` vs `race` vs `any`

> **Definitions:**
> - **`Promise.all(promises)`** — waits for **all** to fulfill, resolving with an array of values in order; rejects **immediately** on the **first** rejection (fail-fast), discarding the rest.
> - **`Promise.allSettled(promises)`** — waits for **all** to settle (fulfilled or rejected), **never rejects**, resolving with an array of `{status, value|reason}` objects describing each outcome.
> - **`Promise.race(promises)`** — settles as soon as the **first** promise settles, adopting that one's outcome (fulfilled or rejected), ignoring the rest.
> - **`Promise.any(promises)`** — settles as soon as the **first** promise fulfills; rejects only if **all** reject, with an `AggregateError` collecting every rejection reason.

```js
// all — need every result, one failure should abort everything
Promise.all([fetchUser(), fetchOrders(), fetchSettings()])
  .then(([user, orders, settings]) => { /* all three succeeded */ })
  .catch(err => { /* whichever one failed first */ });

// allSettled — want every result regardless of individual failures (e.g. dashboard widgets)
Promise.allSettled([fetchWidgetA(), fetchWidgetB()])
  .then(results => results.forEach(r => r.status === 'fulfilled' ? render(r.value) : showError(r.reason)));

// race — timeout pattern: whichever settles first wins
Promise.race([fetchData(), new Promise((_, rej) => setTimeout(() => rej('timeout'), 5000))]);

// any — fastest successful mirror/CDN wins, individual failures don't matter
Promise.any([fetchFromCDN1(), fetchFromCDN2(), fetchFromCDN3()]);
```

## Hands-on — Implement `Promise.all()` From Scratch

```js
function myPromiseAll(promises) {
  return new Promise((resolve, reject) => {
    const results = [];
    let completed = 0;
    if (promises.length === 0) return resolve([]);

    promises.forEach((p, i) => {
      Promise.resolve(p).then(value => {
        results[i] = value;           // preserve ORDER by index, not completion order
        completed++;
        if (completed === promises.length) resolve(results);
      }).catch(reject);                 // any single rejection rejects immediately
    });
  });
}
```
Checks: results are placed by index (`results[i]`), not push order, since promises can settle out of order but `Promise.all`'s contract guarantees output order matches input order; a single rejection calls `reject` immediately (fail-fast), matching real `Promise.all` semantics.

---

## Interview Q&A

**Q: Why can a promise chain "swallow" an error until the nearest `.catch()`?**
> A rejection propagates through every subsequent `.then()` that only has a fulfillment handler — each of those just passes the rejection along as a new rejected promise — until it reaches a `.then()`'s rejection handler or a `.catch()`, which is why `.catch()` at the end of a chain reliably catches failures from any earlier step.

**Q: `all` vs `allSettled` vs `race` vs `any`, with a use case each?**
> `all` — need every result and want to fail fast if any one fails, e.g. loading required data for a page. `allSettled` — want every outcome regardless of individual failures, e.g. independent dashboard widgets where one failing shouldn't blank the whole page. `race` — first to settle wins, classic use is a timeout wrapper around a slow request. `any` — first to *succeed* wins, failures are ignored unless everything fails, e.g. querying multiple redundant mirrors/CDNs.

**Q: Why does a promise chain each return a NEW promise rather than reusing the same one?**
> Because `.then()`'s job is to produce the *next* value in the chain, which depends on what the callback returns — a plain value, a thrown error, or another promise to wait on. That can't be represented by mutating the original promise (which is already settled and immutable), so a fresh promise is created to represent that next step.

**Q: Predict:**
```js
Promise.resolve(1)
  .then(v => { throw new Error('fail'); })
  .then(v => console.log('never runs', v))
  .catch(err => console.log('caught:', err.message))
  .then(v => console.log('after catch:', v));
```
> `caught: fail`, then `after catch: undefined` — the throw rejects the chain, skipping the next `.then()` entirely, until `.catch()` handles it and returns `undefined` implicitly, which becomes a normal fulfilled value for the chain to continue from.

---

## Follow-ups (challenge questions)

- *Failure mode:* `Promise.all` on 5 API calls where one silently never resolves (server hangs, no timeout) — what happens to the whole `.then()` chain, and how would `Promise.race` with a timeout promise fix it?
- *Consistency:* a UI calls `Promise.allSettled` to load 4 independent widgets — one widget's promise rejects. What's the correct UI behavior, and why is `Promise.all` the wrong tool here even though it's simpler code?
- *Scale:* `myPromiseAll` above kicks off every promise immediately, unbounded — for 10,000 API calls, what breaks, and how would you build a concurrency-limited version (this is the [Promise Pool exercise](25-coding-and-machine-coding-round.md))?

---

**Previous:** [Part 10 — Event Loop & Concurrency Model](10-event-loop-and-concurrency-model.md) · **Next:** [Part 12 — async/await](12-async-await.md)
