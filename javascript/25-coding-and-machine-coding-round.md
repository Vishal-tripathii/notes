# JavaScript Study Notes — Part 25

## Coding & Machine Coding Round ⭐⭐⭐⭐⭐

> **Implement from scratch:** Deep Clone · Flatten Array · Flatten Object · Event Emitter · Pub/Sub · LRU Cache · Promise Pool.
>
> 📁 `work/LRUCache.js` and `work/LRUCache_DLL.js` already exist in this repo (a `Map`-based first pass and a stub for the doubly-linked-list version) — reviewed and refactored into §5 below rather than starting from zero, per the roadmap's note.

---

## 1. Deep Clone

Already implemented in [Part 04 §Hands-on](04-objects.md#hands-on) — a recursive clone using a `WeakMap` to handle circular references, plus the one-line modern answer, `structuredClone()` ([Part 23 §6](23-modern-javascript-features.md#6-structuredclone)). Not duplicated here; that's the canonical version.

## 2. Flatten Array

> **Task:** flatten a nested array to any depth, without using the built-in `.flat()`.

```js
function flattenArray(arr, depth = Infinity) {
  if (depth < 1) return arr.slice();
  return arr.reduce((acc, item) => {
    return acc.concat(Array.isArray(item) ? flattenArray(item, depth - 1) : item);
  }, []);
}
flattenArray([1, [2, [3, [4, [5]]]]]);      // [1, 2, 3, 4, 5]
flattenArray([1, [2, [3, [4]]]], 1);           // [1, 2, [3, [4]]] — respects depth
```
**Iterative version** (avoids recursion's call-stack depth limit on very deeply nested input):
```js
function flattenArrayIterative(arr) {
  const stack = [...arr], result = [];
  while (stack.length) {
    const next = stack.pop();
    if (Array.isArray(next)) stack.push(...next);
    else result.push(next);
  }
  return result.reverse(); // pop() from the end reverses order, so restore it
}
```

## 3. Flatten Object

Already implemented in [Part 04 §Hands-on](04-objects.md#hands-on) — `flattenObject({a:1, b:{c:2}})` → `{'a':1, 'b.c':2}`. Not duplicated here.

## 4. Event Emitter / Pub-Sub

> **Definition:** an Event Emitter (the Node.js-standard name for the **Observer pattern**, also called Pub/Sub — Publish/Subscribe) is an object maintaining a registry of named events, each with a list of subscribed callback functions, that can **emit** (publish) an event with data to invoke all its subscribed callbacks, decoupling the code that triggers an event from the code that reacts to it.

```js
class EventEmitter {
  #listeners = new Map(); // eventName -> Set of callbacks

  on(event, callback) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(callback);
    return () => this.off(event, callback); // return an unsubscribe function — convenient cleanup
  }

  off(event, callback) {
    this.#listeners.get(event)?.delete(callback);
  }

  emit(event, ...args) {
    this.#listeners.get(event)?.forEach(callback => callback(...args));
  }

  once(event, callback) {
    const wrapper = (...args) => { this.off(event, wrapper); callback(...args); };
    this.on(event, wrapper);
  }
}

const emitter = new EventEmitter();
const unsubscribe = emitter.on('user:login', (user) => console.log(`${user} logged in`));
emitter.emit('user:login', 'V'); // 'V logged in'
unsubscribe();
emitter.emit('user:login', 'V'); // nothing — unsubscribed
```
**Pub/Sub vs Event Emitter, the usual distinction:** functionally near-identical; "Event Emitter" is the term for this pattern living *inside* one object emitting its own events (like Node's `EventEmitter`, or a DOM node), while "Pub/Sub" more often describes a fully decoupled **broker** — a separate, shared object neither publishers nor subscribers know anything about each other through, common in cross-module or cross-service messaging. The implementation above works equally as either, depending on how it's used.

## 5. LRU Cache

> **Definition:** a Least-Recently-Used cache is a fixed-capacity key-value store that, when full, evicts the entry that hasn't been accessed (read *or* written) for the longest time to make room for a new one — both `get` and `put` must run in **O(1)** for a correct implementation.

**Map-based (reviewed/polished from `work/LRUCache.js`)** — relies on the fact that a JS `Map` preserves **insertion order**, and re-inserting a key moves it to the end:

```js
class LRUCache {
  #capacity;
  #cache = new Map();

  constructor(capacity) { this.#capacity = capacity; }

  get(key) {
    if (!this.#cache.has(key)) return -1;
    const value = this.#cache.get(key);
    this.#cache.delete(key);      // delete + re-set moves this key to the END —
    this.#cache.set(key, value);    // i.e. marks it as most-recently-used
    return value;
  }

  put(key, value) {
    if (this.#cache.has(key)) this.#cache.delete(key); // remove old position first
    this.#cache.set(key, value);                          // insert as most-recently-used
    if (this.#cache.size > this.#capacity) {
      const lruKey = this.#cache.keys().next().value;        // Map's first key = least-recently-used
      this.#cache.delete(lruKey);
    }
  }
}
```
**Why this is genuinely O(1):** `Map.prototype.get/set/delete` are all O(1), and `Map` maintaining insertion order as a language guarantee is exactly what lets "move to the end" double as "mark as most recently used" with no extra bookkeeping — no manual doubly-linked list required for a correct, efficient answer.

**Doubly-linked-list + hash map version** (the classic textbook approach `work/LRUCache_DLL.js` stubs out — worth knowing even though the `Map` version above is simpler and equally O(1)):
```js
class Node {
  constructor(key, value) { this.key = key; this.value = value; this.prev = this.next = null; }
}
class LRUCacheDLL {
  #capacity; #map = new Map(); #head; #tail; // head = most recent, tail = least recent

  constructor(capacity) {
    this.#capacity = capacity;
    this.#head = new Node(null, null); // dummy sentinel nodes simplify edge cases
    this.#tail = new Node(null, null);
    this.#head.next = this.#tail;
    this.#tail.prev = this.#head;
  }
  #remove(node) { node.prev.next = node.next; node.next.prev = node.prev; }
  #insertAtFront(node) {
    node.next = this.#head.next; node.prev = this.#head;
    this.#head.next.prev = node; this.#head.next = node;
  }
  get(key) {
    if (!this.#map.has(key)) return -1;
    const node = this.#map.get(key);
    this.#remove(node); this.#insertAtFront(node); // move to front = mark as MRU
    return node.value;
  }
  put(key, value) {
    if (this.#map.has(key)) this.#remove(this.#map.get(key));
    const node = new Node(key, value);
    this.#map.set(key, node);
    this.#insertAtFront(node);
    if (this.#map.size > this.#capacity) {
      const lru = this.#tail.prev; // node just before the tail sentinel = least recent
      this.#remove(lru);
      this.#map.delete(lru.key);
    }
  }
}
```
**Why interviewers still ask for the DLL version even though `Map` already solves it:** it tests whether you can implement O(1) removal/reordering from arbitrary positions in a linked structure by hand — the underlying skill `Map` is hiding from you, and some interviewers explicitly disallow relying on `Map`'s ordering guarantee to force you to demonstrate it.

## 6. Promise Pool (Concurrency-Limited Promise Runner)

> **Definition:** a Promise Pool runs a large list of promise-returning tasks with **at most N running concurrently** at any time — as soon as one finishes, the next queued task starts — trading off total wall-clock time against not overwhelming a rate-limited API, a connection pool, or memory.

```js
async function promisePool(tasks, concurrency) {
  const results = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex++;               // claim the next task BEFORE awaiting anything
      results[currentIndex] = await tasks[currentIndex]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker);
  await Promise.all(workers);                            // wait for every worker "lane" to drain the queue
  return results;
}

const tasks = urls.map(url => () => fetch(url).then(r => r.json())); // FUNCTIONS, not promises —
promisePool(tasks, 5);                                                   // must not start until claimed
```
**The critical detail:** `tasks` must be an array of **functions that return promises**, not already-started promises — passing already-started promises would mean all of them began running immediately regardless of any "pool," defeating the entire point. `nextIndex++` claims a slot synchronously before the `await`, so two workers can never race to claim the same index even though they're running "concurrently" (there's no real parallelism within a single JS thread — see [Part 10](10-event-loop-and-concurrency-model.md)).

---

## Interview Q&A

**Q: Why does the `Map`-based LRU cache achieve O(1) without a manual linked list?**
> Because `Map` guarantees iteration in insertion order, and deleting then re-inserting a key moves it to the end of that order — which is exactly the "mark as most recently used" operation an LRU cache needs, and both `delete` and `set` are themselves O(1). The insertion-order guarantee is doing the linked-list's job implicitly.

**Q: What's the difference between an Event Emitter and Pub/Sub, if the implementation is basically the same?**
> Mostly a naming/usage distinction rather than a structural one — Event Emitter typically describes an object emitting its *own* events that others subscribe to directly on it (Node's `EventEmitter`, a DOM node). Pub/Sub more often implies a decoupled shared broker that publishers and subscribers both go through without knowing about each other, common for cross-module messaging.

**Q: Why must `promisePool`'s tasks be passed as functions, not already-created promises?**
> A promise starts running the moment it's created — there's no way to "pause" an already-in-flight promise. If you passed an array of promises, all of them would already be executing concurrently before `promisePool` even got a chance to limit anything. Passing functions that *return* promises lets the pool control exactly when each one starts, by only calling the function once a worker slot is free.

---

## Follow-ups (challenge questions)

- *Failure mode:* one task in `promisePool` throws/rejects — as written above, does that stop the whole pool, or does `Promise.all(workers)` propagate just that one worker's failure while others keep running mid-batch? Trace through it, and consider how you'd want failures handled (fail-fast vs collect-and-continue, echoing [Part 11's `all` vs `allSettled`](11-promises.md#5-promiseall-vs-allsettled-vs-race-vs-any)).
- *Scale:* an `EventEmitter` instance accumulates listeners that are never `off()`'d as components mount/unmount repeatedly — connect this to [Part 01's closure-leak](01-scope-and-closures.md#3-memory-retention--leaks) and [Part 17's memory management](17-memory-management.md) discussions. What's the concrete fix, and why does returning an unsubscribe function from `on()` (as in §4 above) help enforce it?
- *Consistency:* two different parts of a codebase both call `lruCache.get(key)` for the *same* key in quick succession — is there any correctness issue in a single-threaded environment, or does JS's run-to-completion model make this a non-issue the way it would be in a genuinely concurrent language?

---

**Previous:** [Part 24 — Output-Based Question Drills](24-output-based-question-drills.md) · **Next:** [Part 26 — Interview Discussion Practice](26-interview-discussion-practice.md)
