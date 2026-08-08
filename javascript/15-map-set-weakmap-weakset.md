# JavaScript Study Notes — Part 15

## Map / Set / WeakMap / WeakSet ⭐⭐⭐☆☆

**Topics:** `Map` vs plain object (key types, insertion order, size) · `Set` for uniqueness · `WeakMap`/`WeakSet` and why "weak."

---

## 1. `Map` vs Plain Object

> **Definition:** a `Map` is a collection of key-value pairs where **keys can be any value** (including objects and functions, not just strings/symbols), that maintains **insertion order** when iterated, and tracks its own `.size`.

| | Plain Object | `Map` |
|---|---|---|
| Key types | strings/symbols only (numbers coerce to strings) | **any value**, including objects, functions, `NaN` |
| Iteration order | mostly insertion order, but integer-like keys sort first (a real gotcha) | **always** insertion order |
| Size | `Object.keys(obj).length` (manual) | `.size` (built-in) |
| Iterable directly? | no (`for...in`, or `Object.entries` first) | yes — directly iterable with `for...of` |
| Accidental prototype pollution | risk via inherited keys (`toString`, `__proto__`) | none — no inherited keys at all |

```js
const m = new Map();
const objKey = {};
m.set(objKey, 'value for this exact object');
m.set('name', 'V');
m.set(1, 'number key');
m.get(objKey); // 'value for this exact object' — impossible with a plain object as a key
m.size;          // 3
for (const [key, value] of m) console.log(key, value); // guaranteed insertion order
```

## 2. `Set` for Uniqueness

> **Definition:** a `Set` is a collection of **unique values** of any type — adding a value that already exists (compared via the same-value-zero algorithm, essentially `===` but treating `NaN` as equal to itself) is a no-op.

```js
const s = new Set([1, 2, 2, 3, 3, 3]);
s.size; // 3 — duplicates silently collapsed
[...new Set([1, 2, 2, 3])]; // [1, 2, 3] — the classic "remove duplicates from an array" one-liner
s.add(NaN); s.add(NaN); s.size; // still counts NaN as one entry (same-value-zero, unlike ===)
```

## 3. `WeakMap` / `WeakSet` — Why "Weak"

> **Definition:** a `WeakMap` is like a `Map` but its keys **must be objects**, and those keys are held with a **weak reference** — meaning if no other reference to that object exists anywhere in the program, the garbage collector is free to reclaim it, automatically removing the entry from the `WeakMap` too. `WeakSet` is the same idea for a set of object values. Neither is iterable, has no `.size`, and has no `.clear()` — a deliberate consequence of entries being able to silently disappear at any time via GC.

```js
let element = document.getElementById('widget');
const metadata = new WeakMap();
metadata.set(element, { clickCount: 0 }); // key is the DOM node itself

element = null; // no more references to the DOM node ANYWHERE else in the program
// the WeakMap does NOT keep the element alive — once GC'd, its entry in
// `metadata` is automatically removed too. A regular Map would have kept
// the element (and its metadata) alive forever, since Map holds a STRONG reference.
```
**What "weak" actually buys you:** a place to attach metadata to an object (a DOM node, a class instance) without that attachment itself becoming a memory leak — the metadata's lifetime is tied to the object's real lifetime, not managed manually. Classic use case: per-DOM-node caching/metadata in a library, where you have no reliable hook to clean up when the node is removed from the document.

---

## Interview Q&A

**Q: `Map` vs object, when does each win?**
> `Map` wins when keys aren't simple strings (objects as keys, guaranteed insertion order, frequent add/remove with accurate size tracking, or when key names might collide with inherited object properties like `toString`). Plain objects still win for simple, known-shape data, JSON serialization, and destructuring ergonomics.

**Q: What does "weak" actually buy you, and why would you choose it for something like per-DOM-node metadata?**
> The keys are held weakly, so attaching data to an object via a `WeakMap` doesn't keep that object alive — once nothing else references it, both the object and its entry in the `WeakMap` become eligible for garbage collection automatically. That means you can cache metadata against DOM nodes (or any object) without writing manual cleanup code and without the cache itself becoming a memory leak that outlives the nodes it describes.

**Q: Why is `WeakMap` not iterable, and why does it have no `.size`?**
> Because entries can be silently removed by garbage collection at any unpredictable time — if you could iterate it or read its size, that result could be observably different from one moment to the next for reasons entirely outside your program's control (GC timing isn't deterministic or observable), which would break a lot of assumptions. Restricting the API to just `get`/`set`/`has`/`delete` avoids ever exposing that non-determinism.

**Q: Predict:**
```js
const obj1 = { id: 1 }, obj2 = { id: 1 };
const s = new Set([obj1, obj2]);
console.log(s.size);
const m = new Map([[obj1, 'a'], [obj2, 'b']]);
console.log(m.size);
```
> `2` and `2` — `Set`/`Map` compare by reference for objects, not deep equality. `obj1` and `obj2` are distinct object references even though their contents look identical, so both are treated as unique.

---

## Follow-ups (challenge questions)

- *Scale:* a `Map` used as an in-memory cache keeps growing forever since entries are never removed — what breaks at scale, and how does that connect to why `WeakMap` alone doesn't fully solve unbounded-cache growth (hint: what if the key is a primitive-derived string, not an object)?
- *Consistency:* code iterates a `Map` with `for...of` while another part of the same synchronous function calls `.delete()` on an entry not yet visited — is that safe in JS, and why does the single-threaded execution model make this a non-issue compared to a multi-threaded language?
- *Failure mode:* a `WeakMap` is used to cache expensive computed results keyed by a plain string (`"user:123"`) instead of an object — why does this fail to compile/work as intended, and what's the actual constraint on `WeakMap` keys?

---

**Previous:** [Part 14 — Generators & Iterators](14-generators-and-iterators.md) · **Next:** [Part 16 — Modules (CommonJS vs ESM)](16-modules-commonjs-vs-esm.md)
