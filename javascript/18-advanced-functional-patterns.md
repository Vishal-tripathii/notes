# JavaScript Study Notes — Part 18

## Advanced Functional Patterns ⭐⭐⭐⭐⭐

> The polished, edge-case-aware versions of what [Part 02](02-functions.md#hands-on--first-pass) first attempted. This is where "I understand it" gets tested against "I can write it cold."

**Topics:** `debounce` (leading/trailing) · `throttle` · `memoize` (multi-arg cache keys) · `curry` · `compose` vs `pipe` · `retry` (with backoff) · `once`.

---

## 1. `debounce` — with `leading`/`trailing` Options

> **Definition:** a higher-order function that delays invoking the wrapped function until `wait` milliseconds have elapsed since the **last** time the debounced function was called — every call within that window resets the timer. `leading: true` fires on the very first call of a burst instead of (or in addition to) the end; `trailing` (default `true`) fires after the burst goes quiet.

```js
function debounce(fn, wait, { leading = false, trailing = true } = {}) {
  let timer = null;
  return function (...args) {
    const callNow = leading && !timer;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (trailing && !callNow) fn.apply(this, args);
    }, wait);
    if (callNow) fn.apply(this, args);
  };
}
// search-as-you-type: trailing only (default) — wait for the user to pause
const onSearch = debounce(runSearch, 300);
// "prevent double submit": leading only — fire instantly on first click, ignore the rest
const onSubmit = debounce(submitForm, 1000, { leading: true, trailing: false });
```

## 2. `throttle`

> **Definition:** a higher-order function that invokes the wrapped function at most once per `wait` milliseconds, no matter how often the throttled function is called — unlike debounce, it guarantees regular execution *during* a continuous burst, not just at the end.

```js
function throttle(fn, wait) {
  let lastCall = 0, timer = null, lastArgs = null;
  return function (...args) {
    const now = Date.now();
    lastArgs = args;
    if (now - lastCall >= wait) {
      lastCall = now;
      fn.apply(this, args);
    } else if (!timer) {                          // schedule a trailing call so the
      timer = setTimeout(() => {                     // FINAL event in a burst isn't dropped
        lastCall = Date.now();
        timer = null;
        fn.apply(this, lastArgs);
      }, wait - (now - lastCall));
    }
  };
}
window.addEventListener('scroll', throttle(updateScrollPosition, 200));
```
**debounce vs throttle, precisely:** debounce waits for silence and fires once; throttle fires at a steady maximum rate throughout continuous activity. A search box wants debounce (only search once typing stops); a scroll-position tracker wants throttle (needs regular updates *during* scrolling, not just at the end).

## 3. `memoize` — Multi-Argument Cache-Key Strategy

> **Definition:** a higher-order function that caches a function's return value keyed by its arguments, so a repeated call with the *same* arguments returns the cached result instead of recomputing.

```js
function memoize(fn, keyResolver = (...args) => JSON.stringify(args)) {
  const cache = new Map();
  return function (...args) {
    const key = keyResolver(...args);
    if (cache.has(key)) return cache.get(key);
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
}
```
**Why naive memoize breaks on multi-argument or object-argument functions:** a cache keyed by a single argument (`cache.set(args[0], result)`) silently ignores the rest, conflating `add(1, 2)` and `add(1, 999)`. The default fix — `JSON.stringify(args)` — has its own edge cases: key order in an object argument changes the string (`{a:1,b:2}` vs `{b:2,a:1}` are "different" keys despite being equal objects), and it can't serialize functions, `undefined` inside arrays, or circular references at all. A production `keyResolver` needs to be chosen deliberately for the actual argument shapes involved.

## 4. `curry`

> **Definition:** transforms a function taking multiple arguments into a sequence of functions that each take a subset of those arguments, returning a new function for the remaining ones until enough arguments have accumulated to invoke the original.

```js
function curry(fn) {
  return function curried(...args) {
    if (args.length >= fn.length) return fn.apply(this, args);
    return (...next) => curried.apply(this, [...args, ...next]);
  };
}
const add3 = curry((a, b, c) => a + b + c);
add3(1)(2)(3); add3(1, 2)(3); add3(1, 2, 3); // all → 6
```
Relies on `fn.length` (the declared parameter count) to know when to stop collecting — which is why curry breaks on functions with default or rest parameters, since those don't count toward `fn.length` (see Part 02's follow-up on this).

## 5. `compose` vs `pipe`

> **Definition:** both combine multiple single-argument functions into one. `compose(f, g, h)(x)` applies **right to left** — `f(g(h(x)))`, mirroring mathematical function composition notation. `pipe(f, g, h)(x)` applies **left to right** — `h(g(f(x)))`, mirroring the visual/reading order of a pipeline.

```js
const compose = (...fns) => (x) => fns.reduceRight((acc, fn) => fn(acc), x);
const pipe    = (...fns) => (x) => fns.reduce((acc, fn) => fn(acc), x);

const addOne = n => n + 1, double = n => n * 2;
compose(double, addOne)(5); // double(addOne(5)) = double(6) = 12
pipe(double, addOne)(5);    // addOne(double(5)) = addOne(10) = 11
```

## 6. `retry` (with Backoff)

> **Definition:** a higher-order function that re-invokes a (typically async, fallible) function up to `n` times if it rejects/throws, optionally waiting an increasing delay between attempts (**backoff**) so repeated failures don't hammer a struggling dependency.

```js
async function retry(fn, { attempts = 3, baseDelay = 200 } = {}) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1) throw err;             // exhausted retries, propagate the failure
      const delay = baseDelay * 2 ** i;                 // exponential backoff: 200ms, 400ms, 800ms...
      await new Promise(res => setTimeout(res, delay));
    }
  }
}
retry(() => fetch('/flaky-endpoint').then(r => r.json()), { attempts: 3, baseDelay: 300 });
```

## 7. `once`

> **Definition:** a higher-order function that ensures the wrapped function's actual body runs **at most once**, no matter how many times the returned function is called — every call after the first returns the memoized result of that single real invocation.

```js
function once(fn) {
  let called = false, result;
  return function (...args) {
    if (!called) { result = fn.apply(this, args); called = true; }
    return result;
  };
}
const initializeApp = once(() => { console.log('initializing...'); return 'ready'; });
initializeApp(); initializeApp(); // logs 'initializing...' exactly once
```

---

## Interview Q&A

**Q: debounce vs throttle, precisely, with a UI scenario each.**
> Debounce delays until a burst of calls goes quiet, then fires once — for a search-as-you-type box, so you only call the API after the user stops typing. Throttle fires at a steady maximum rate throughout continuous activity — for a scroll handler, where you need regular position updates *during* scrolling, not just at the very end.

**Q: Why does naive memoize break on multi-argument or object-argument functions?**
> A cache keyed by only one argument silently ignores the others, treating calls with different remaining arguments as identical. The common fix, `JSON.stringify(args)`, has its own gaps — it's order-sensitive for object properties (two deeply-equal objects with keys in different orders produce different cache keys), and it can't serialize functions or handle circular references — so the key strategy has to be chosen deliberately for the real argument shapes.

**Q: Why is exponential backoff used in `retry` instead of a fixed delay?**
> A fixed short delay on every retry can hammer an already-struggling dependency at a constant rate, making an outage worse (a thundering-herd-style pattern across many clients retrying at the same fixed interval). Exponential backoff spaces retries increasingly further apart, giving the failing dependency room to recover, and spreads out retry load across clients that started failing at slightly different times.

**Q: Predict:**
```js
const log = () => console.log('called');
const debouncedLog = debounce(log, 100);
debouncedLog(); debouncedLog(); debouncedLog();
```
> Logs `'called'` exactly **once**, ~100ms after the *last* of the three calls — each call resets the timer, so only the final call's timeout ever completes uninterrupted.

---

## Follow-ups (challenge questions)

- *Failure mode:* `retry` above retries *any* thrown error identically — what's wrong with retrying a `400 Bad Request` the same way as a `503 Service Unavailable`, and how would you make `retry` retry-aware of error type?
- *Scale:* `throttle`'s trailing-call `setTimeout` schedule — under a truly continuous, high-frequency event stream (e.g. `mousemove` firing hundreds of times per second), does this implementation ever fall behind or drop the true final position? Trace through it.
- *Consistency:* two components independently wrap the *same* underlying async function with `once()` — do they share the cached result, or does each get its own? What does that imply about where a `once`-wrapped initializer should actually live in a module?

---

**Previous:** [Part 17 — Memory Management](17-memory-management.md) · **Next:** [Part 19 — Polyfills](19-polyfills.md)
