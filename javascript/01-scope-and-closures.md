# JavaScript Study Notes — Part 01

## Scope & Closures ⭐⭐⭐⭐⭐

**Topics:** Lexical Scope · Scope Chain · Closures · memory retention/leaks · the Module Pattern · the classic `for(var i...)` loop bug.

---

## 1. Lexical Scope & the Scope Chain

> **Definition — Lexical Scope:** the scoping model where a variable's accessibility is determined by its physical position in the nested structure of the source code at write-time, not by the call stack at runtime.
> **Definition — Scope Chain:** the ordered sequence of scopes — from the current scope outward to the global scope — that the engine searches, in order, when resolving a variable reference.

Lexical scope = a variable's scope is fixed by **where it's written in the code**, not by how/from where the function is called — decided at write-time, by nesting, permanently.

```js
const x = 'global';
function outer() {
  const y = 'outer';
  function inner() {
    const z = 'inner';
    console.log(x, y, z); // 'global outer inner' — inner sees everything above it
  }
  inner();
}
```

The **scope chain**: lookup walks outward — current → enclosing → ... → global → `ReferenceError`. Only ever outward; a function can see its parents' vars, never a sibling's or child's.

## 2. Closures

> **Definition:** a closure is the combination of a function and a live reference to the lexical environment in which that function was declared — it allows the function to continue accessing the variables of its enclosing scope even after that enclosing function has finished executing.

Live reference, not a value snapshot — that distinction is what the loop bug (§5) hinges on.

```js
function makeCounter() {
  let count = 0;                 // would normally be GC'd once makeCounter() returns
  return function () {
    count++;                     // but this inner fn holds a live reference to it
    return count;
  };
}
const c1 = makeCounter(), c2 = makeCounter(); // SEPARATE closures, separate `count`
c1(); c1();     // 1, 2
c2();            // 1 — never shared state with c1
```

**Mechanically why:** in the creation phase, `outer`'s variables live in its execution context, normally popped/GC'd when `outer` returns. If the returned inner function still references `count`, the engine can't reclaim it — the closure keeps that slice of the outer context alive on the heap. Each *call* to `makeCounter` creates a fresh execution context, hence fresh, independent closures.

## 3. Memory Retention & Leaks

> **Definition:** a memory leak is memory that is no longer needed by a program but is never released, because a reference to it — often via a closure — remains reachable indefinitely.

Closures keeping variables alive is normally the whole point. It becomes a **leak** when the closure outlives its usefulness but is still reachable — a forgotten event listener, an uncleared timer, or a callback stashed in a long-lived cache.

```js
function attachHandler() {
  const hugeData = new Array(1_000_000).fill('leaked');
  document.getElementById('btn').addEventListener('click', function () {
    console.log(hugeData.length); // keeps hugeData alive as long as the listener is attached
  });
}
```
Fix is always the same shape: explicitly break the reference (`removeEventListener`, `clearInterval`, cache eviction) once the closure's job is done — full depth in [Part 17 — Memory Management](17-memory-management.md).

## 4. The Module Pattern

> **Definition:** a design pattern that uses an IIFE and closures to create a private scope, exposing only a deliberately chosen public API while keeping internal state and helper logic inaccessible from outside.

Pre-ES-modules technique for private state via closures — conceptual basis for `#private` class fields ([Part 09](09-classes.md)).

```js
const bankAccount = (function () {
  let balance = 0;                    // truly private, no outside access
  return {
    deposit(amt) { return balance += amt; },
    withdraw(amt) {
      if (amt > balance) throw new Error('Insufficient funds');
      return balance -= amt;
    },
    getBalance() { return balance; },
  };
})();
bankAccount.deposit(100);
bankAccount.balance; // undefined — only reachable through the returned API
```

## 5. The Classic Loop Bug

```js
for (var i = 0; i < 3; i++) setTimeout(() => console.log(i), 100); // 3, 3, 3
for (let i = 0; i < 3; i++) setTimeout(() => console.log(i), 100); // 0, 1, 2
```

`var` is function-scoped → **one** `i` for the whole loop; all three closures share it, and by the time any callback runs (100ms later), the loop's finished and `i` is `3`. `let` is block-scoped, and the spec makes `for` create a **fresh binding per iteration** — each closure captures its own.

**Fix without switching to `let`** (tests whether you understand closures, not just "use let"):
```js
for (var i = 0; i < 3; i++) {
  (function (captured) { setTimeout(() => console.log(captured), 100); })(i);
}
// 0, 1, 2 — each IIFE call is its own execution context, manufacturing a fresh
// variable per iteration, same trick `let` now does natively
```

## Hands-on

```js
// Memoization — cache lives in the closure, persists across calls
function memoize(fn) {
  const cache = new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}

// Secret Variable — private state, only reachable via the returned API
function createSecret(value) {
  return { reveal: () => value, isEqual: (guess) => guess === value };
}
```

---

## Interview Q&A

**Q: What's a closure, precisely?**
> A function bundled with a live reference to variables in its surrounding lexical scope, so it keeps accessing them even after the outer function returned. "Live" is the key word — not a snapshot, which is exactly why the `var`-loop bug happens.

**Q: Why does `var` in a loop with `setTimeout` print the same value every time, and how does `let` fix it with no other code change?**
> `var` is function-scoped so the whole loop shares one variable — every callback closes over that same one and sees its final value once the loop's done. `let` gets a fresh binding per iteration by spec, so each callback closes over its own.

**Q: One real use of closures beyond the counter toy example?**
> Memoization — caching results in a variable only the returned function can see. Debounce/throttle hold timer IDs/timestamps between calls the same way. And private state before `#`-private fields existed — the module pattern.

**Q: When does a closure become a memory leak?**
> When it outlives its use and nothing breaks the reference — an event listener never removed, or a timer never cleared, keeps everything it references alive indefinitely.

**Q: Predict:**
```js
function outer() {
  let count = 0;
  return { inc: () => ++count, reset: () => { count = 0; } };
}
const a = outer(), b = outer();
a.inc(); a.inc(); b.inc();
console.log(a.inc(), b.inc());
```
> `3 2` — `a` and `b` are separate closures over separate `count`s.

---

## Follow-ups (challenge questions)

- *Scale:* a page attaches a closure-capturing listener inside a component that mounts/unmounts thousands of times (e.g. a virtualized list) — what actually accumulates, and how would you notice it in a memory profiler before users complain?
- *Concurrency-adjacent:* if `makeCounter()`'s returned function were called from multiple places "simultaneously" (e.g. rapid click handlers), can `count` ever get corrupted the way a shared variable would in a multi-threaded language? Why or why not?
- *Failure mode:* a memoize-wrapped function is used for API responses keyed by `JSON.stringify(args)` — what breaks if one argument is an object with properties in a different order across calls, or contains a function/`undefined`?

---

**Previous:** [Part 00 — JS Fundamentals](00-js-fundamentals.md) · **Next:** [Part 02 — Functions](02-functions.md)
