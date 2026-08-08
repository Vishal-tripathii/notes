# JavaScript Study Notes — Part 17

## Memory Management ⭐⭐⭐☆☆

**Topics:** Stack vs Heap · reference counting vs mark-and-sweep garbage collection · common memory leak sources.

---

## 1. Stack vs Heap

> **Definition — Stack:** a region of memory that stores fixed-size, statically-known data — primitive values and references (pointers) — allocated and reclaimed automatically in strict LIFO order as execution contexts push and pop ([Part 00](00-js-fundamentals.md)).
> **Definition — Heap:** a much larger, less structured region of memory where objects, arrays, and functions (anything of dynamic/unpredictable size) actually live; a stack variable holding an object only stores a *reference* into the heap, not the object itself.

```js
function example() {
  const num = 42;                 // primitive — lives directly on the stack
  const obj = { value: 42 };        // obj is a HEAP allocation; the stack only holds a
}                                     // pointer to where that object lives on the heap
```
This is the mechanical basis for [Part 00's primitive-vs-reference](00-js-fundamentals.md#5-primitive-vs-reference-types) copy semantics: copying a stack value copies the actual bits; copying a heap reference copies the pointer, not the object.

## 2. Garbage Collection — Reference Counting vs Mark-and-Sweep

> **Definition — Reference counting:** a GC strategy that tracks, per object, how many references point to it; when that count hits zero, the object is immediately reclaimed. Fatal flaw: two objects referencing each other (a **circular reference**) never hit zero even when nothing external reaches either of them, leaking memory forever under pure reference counting.
> **Definition — Mark-and-sweep:** the GC strategy modern JS engines actually use — periodically, starting from a set of "roots" (global object, currently executing call stack), the engine walks every reachable reference and **marks** each object found; anything left **unmarked** afterward is unreachable garbage and gets **swept** (reclaimed) — correctly handling circular references, since an isolated cycle with no path from a root is never marked.

```js
function makeCycle() {
  const a = {};
  const b = {};
  a.ref = b; // a references b
  b.ref = a; // b references a — circular
  return 'done';
} // once makeCycle() returns, a and b are unreachable from any root — mark-and-sweep
  // correctly reclaims BOTH, even though they still reference each other
```
**The rule:** modern engines (V8 included) reclaim memory based on **reachability from a root**, not reference count — an object is garbage the moment nothing reachable from a root points to it, cycle or not.

## 3. Common Memory Leak Sources

> **Definition:** in a garbage-collected language, a memory leak is memory that a program no longer logically needs, but which remains **reachable** from a root — so the GC correctly (by its own rules) never reclaims it, because *something* still technically points to it.

```js
// 1. Forgotten timers/listeners — the classic leak, covered in depth in Part 01
function attach() {
  const bigData = new Array(1_000_000).fill('x');
  document.addEventListener('scroll', () => console.log(bigData.length)); // never removed
} // bigData is kept alive forever via the listener's closure, unless removeEventListener runs

// 2. Detached DOM references held in closures
let detachedNode;
function cacheNode() {
  const el = document.getElementById('temp');
  detachedNode = el; // even after el is removed from the document, this reference
}                       // keeps the ENTIRE node (and its subtree) alive in memory

// 3. Growing caches with no eviction
const cache = new Map(); // a Map (not WeakMap — Part 15) holding STRONG references
function memoizeForever(key, value) { cache.set(key, value); } // never shrinks, unbounded growth

// 4. Accidental global variables
function leaky() { accidentalGlobal = 'oops'; } // missing let/const/var — attaches to
                                                    // the global object, lives for the
                                                    // entire lifetime of the page/process
```

---

## Interview Q&A

**Q: Stack vs heap, and why does it matter for how JS copies values?**
> The stack holds fixed-size data — primitives and references — managed automatically as functions are called and return. The heap holds everything of dynamic size — objects, arrays, functions — and a stack variable pointing at one only stores a reference into the heap. That's exactly why primitives copy by value (the actual bits are duplicated) and objects copy by reference (only the heap pointer is duplicated, so both variables end up pointing at the same underlying object).

**Q: Why doesn't reference counting handle circular references, and how does mark-and-sweep fix it?**
> Two objects that reference only each other never hit a reference count of zero under pure reference counting, even once nothing else in the program can reach either of them — a permanent leak. Mark-and-sweep instead starts from actual GC roots (globals, the active call stack) and marks everything reachable by walking references outward; an isolated cycle with no path from any root is simply never marked, so it gets correctly swept regardless of how many references point within the cycle.

**Q: Name a few common sources of real memory leaks in JS, beyond the toy examples.**
> Event listeners or timers that are set up but never torn down, closures capturing large data that outlives its usefulness, detached DOM nodes still referenced by a variable after being removed from the document, and caches (a plain `Map`, not a `WeakMap`) that grow without any eviction policy.

**Q: Predict — is this a leak?**
```js
function setup() {
  const controller = new AbortController();
  window.addEventListener('resize', onResize, { signal: controller.signal });
  return () => controller.abort(); // returns a cleanup function
}
const cleanup = setup();
cleanup();
```
> Not a leak — `AbortController` is a clean, modern pattern for exactly this problem: `controller.abort()` automatically removes any listener registered with that `signal`, so calling the returned `cleanup()` function correctly detaches `onResize`, letting anything it closed over be garbage collected normally.

---

## Follow-ups (challenge questions)

- *Scale:* a single-page app never unmounts old route components' event listeners over a long session — walk through what a Chrome DevTools heap snapshot comparison (before/after navigating between routes repeatedly) would actually show, and what "detached DOM tree" nodes in that snapshot mean.
- *Observability:* how would you notice a slow memory leak in production *before* users report the tab crashing — what's the actual signal to watch (heap size trend, not absolute value) and why does absolute heap size alone not always mean a leak?
- *Consistency:* a `WeakMap`-based cache and a `Map`-based cache both hold "the same" data — under memory pressure, why might the `WeakMap` version return unexpected cache misses that the `Map` version never would, and is that a bug or the intended tradeoff?

---

**Previous:** [Part 16 — Modules (CommonJS vs ESM)](16-modules-commonjs-vs-esm.md) · **Next:** [Part 18 — Advanced Functional Patterns](18-advanced-functional-patterns.md)
