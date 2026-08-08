# LLD Problem 03 — LRU Cache

> Worked end-to-end using the **[LLD Problem-Solving Framework](../04-lld-problem-solving-framework.md)**. Signature challenge: O(1) `get` **AND** `put` simultaneously. Existing repo code: [`../../work/LRUCache.js`](../../work/LRUCache.js) (Map-based) and [`../../work/LRUCache_DLL.js`](../../work/LRUCache_DLL.js) (DLL version — currently an empty stub, finish it after reading this).

---

## Table of Contents

1. [Requirements & Scope](#requirements)
2. [Why Array / Plain Hashmap Alone Fail](#why-fail)
3. [Class Design](#class-design)
4. [Core Code](#core-code)
5. [Walking the Repo's Map-Based Version](#map-version)
6. [Concurrency](#concurrency)
7. [Extensibility](#extensibility)
8. [Interview Q&A](#interview)
9. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements & Scope

**Functional:**
1. `get(key)` → return the value if present, else `-1`. Runs in **O(1)**.
2. `put(key, value)` → insert or update. Runs in **O(1)**.
3. Cache has a **fixed capacity**. When a `put` would exceed it, **evict the least-recently-used** entry first.
4. **`get` counts as a "use"** — a successful `get` promotes that key to most-recently-used (MRU), exactly like a `put` does.

**Non-functional (the signature challenge):**
- Both operations must be O(1) **at the same time** — not O(1) get with O(n) put, or vice versa. That's the whole interview.

**Out of scope for v1** (see [Extensibility](#extensibility)): TTL expiry, LFU semantics, thread-safety across real OS threads (Node is single-threaded — see [Concurrency](#concurrency)).

---

<a name="why-fail"></a>
# 2. Why Array / Plain Hashmap Alone Fail

Try to solve it with one data structure and it breaks:

### Array (or any list you scan)
- `get(key)` → scan for the key → **O(n)**.
- Track recency by moving the found element to the front/back → also **O(n)** shift.
- Fails both requirements immediately.

### Plain hashmap alone
- `get(key)` → O(1) lookup. ✅
- `put(key, value)` → O(1) insert. ✅
- **But eviction is the problem**: a hashmap has no concept of order. When capacity overflows, *which* key is least-recently-used? You'd have to scan every entry's "last used" timestamp — **O(n)** — or maintain a separate structure to track order, which is exactly the DLL below.

> A hashmap answers "where is this key" in O(1). It cannot answer "which key hasn't been touched in the longest time" in O(1) — that's an **ordering** question, and hashmaps don't preserve or expose order cheaply for arbitrary reordering.

### The insight: you need TWO structures, each doing the job it's good at
| Structure | Good at | Bad at |
|---|---|---|
| **Hashmap** | O(1) lookup by key | No ordering / no O(1) "move to front" |
| **Doubly linked list** | O(1) insert/remove/reorder **if you already have the node pointer** | O(1) lookup by key (would need to scan) |

**Combine them:** hashmap maps `key → node reference` (O(1) lookup), and that same node lives inside a doubly linked list ordered by recency (O(1) reorder once you have the node). Neither structure alone gets you there; together they do — this pairing is the single most important thing to say out loud in the interview.

Why **doubly** and not singly linked? To remove a node in O(1) you need its `prev` pointer to splice it out without walking from the head. A singly linked list only gives you `next`, so removal from the middle would be O(n) (you'd have to walk from head to find `prev`).

---

<a name="class-design"></a>
# 3. Class Design

**Nouns → classes:**
- `Node` — holds `key`, `value`, `prev`, `next`. **Important:** the node stores the `key` too (not just the value), because when we evict the tail node we need its key to delete it from the hashmap — otherwise we'd have the node but no way to find/remove its hashmap entry in O(1).
- `LRUCache` — owns the `Map<key, Node>` and the doubly linked list (via two sentinel nodes, `head`/`tail`).

**Convention:** `head.next` = **MRU** (most recently used, just touched), `tail.prev` = **LRU** (least recently used, evict this one first). New/touched nodes get inserted right after `head`; eviction removes the node right before `tail`.

```
      MRU                                          LRU
head ⇄ [k3|v3] ⇄ [k1|v1] ⇄ [k2|v2] ⇄ tail
        ↑ most                ↑ evict this
        recently used         one next
```

**Why sentinel head/tail nodes (dummy nodes that hold no real data)?**
Without sentinels, every insert/remove has to special-case "is this the first node?" / "is this the last node?" (null checks on `head`/`tail` themselves). With two permanent dummy nodes always present, `head.next` and `tail.prev` are **never null** — a real list is always "between" them, even when empty (`head.next === tail`). This removes every null-check branch from `_remove()` and `_addToFront()` — the exact kind of edge-case-elimination interviewers want to see, since it's a common source of LRU bugs under time pressure.

**Relationships:** `LRUCache` *has-a* `Map` and *has-a* linked list of `Node`s (composition, not inheritance — there's no "is-a" relationship anywhere in this problem). Cardinality: 1 cache → N nodes, 1:1 between a hashmap entry and a list node (the Map value literally *is* the node reference — that shared reference is what makes O(1) possible).

---

<a name="core-code"></a>
# 4. Core Code

Full, correct, runnable JavaScript (ES6 classes). This is the reference solution for finishing `work/LRUCache_DLL.js`.

```javascript
class Node {
    constructor(key, value) {
        this.key = key;     // stored so eviction can delete the map entry in O(1)
        this.value = value;
        this.prev = null;
        this.next = null;
    }
}

class LRUCacheDll {
    constructor(capacity) {
        this.capacity = capacity;
        this.map = new Map(); // key -> Node

        // sentinel head/tail — never hold real data, always present
        this.head = new Node(null, null);
        this.tail = new Node(null, null);
        this.head.next = this.tail;
        this.tail.prev = this.head;
    }

    get(key) {
        if (!this.map.has(key)) return -1;

        const node = this.map.get(key);
        this._remove(node);      // unlink from current position
        this._addToFront(node);  // re-insert as MRU

        return node.value;
    }

    put(key, value) {
        if (this.map.has(key)) {
            // key exists: update value, promote to MRU
            const node = this.map.get(key);
            node.value = value;
            this._remove(node);
            this._addToFront(node);
            return;
        }

        // new key
        const node = new Node(key, value);
        this.map.set(key, node);
        this._addToFront(node);

        if (this.map.size > this.capacity) {
            // evict LRU = node just before tail
            const lru = this.tail.prev;
            this._remove(lru);
            this.map.delete(lru.key);
        }
    }

    // --- helpers: O(1) because we already hold the node reference ---

    _remove(node) {
        // splice node out of the list — no null checks needed, sentinels
        // guarantee node.prev and node.next are always real nodes
        const prevNode = node.prev;
        const nextNode = node.next;
        prevNode.next = nextNode;
        nextNode.prev = prevNode;
    }

    _addToFront(node) {
        // insert node right after head (MRU position)
        node.next = this.head.next;
        node.prev = this.head;
        this.head.next.prev = node;
        this.head.next = node;
    }
}

// --- quick smoke test ---
const lru = new LRUCacheDll(2);
lru.put(1, "a");
lru.put(2, "b");
console.log(lru.get(1));   // "a" — 1 is now MRU
lru.put(3, "c");           // capacity 2 exceeded → evicts 2 (the LRU, since 1 was just touched)
console.log(lru.get(2));   // -1 — evicted
console.log(lru.get(1));   // "a"
console.log(lru.get(3));   // "c"
```

**Complexity:** `get` = O(1) map lookup + O(1) unlink/relink. `put` = O(1) map set + O(1) insert (+ O(1) evict when over capacity). Space = O(capacity) for both the map and the list.

---

<a name="map-version"></a>
# 5. Walking the Repo's Map-Based Version

[`work/LRUCache.js`](../../work/LRUCache.js) solves the same problem with **zero hand-rolled linked list**:

```javascript
class LRUCache {
    constructor(capacity) {
        this.capacity = capacity;
        this.cache = new Map();
    }

    get(key) {
        if(!this.cache.has(key)) return -1;
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value); // re-insert → moves to the end
        return value;
    }

    put(key, value) {
        if(this.cache.has(key)) this.cache.delete(key);
        this.cache.set(key, value);
        if(this.cache.size > this.capacity) {
            const lruKey = this.cache.keys().next().value; // first key = oldest
            this.cache.delete(lruKey);
        }
    }
}
```

**Why this legitimately works:** the JS spec guarantees `Map` **preserves insertion order** during iteration, and `Map.prototype.delete` + `Map.prototype.set` are both **O(1)** (V8 implements `Map` as a hash table with an auxiliary linked structure for ordered iteration — which, notice, is *the same DLL-behind-a-hashmap idea*, just implemented for you inside the engine). So:
- `delete(key)` then `set(key, value)` on an existing key removes it from its old position and re-appends it at the end → the end of iteration order = MRU, the start = LRU.
- `cache.keys().next().value` grabs the first key in iteration order in O(1) → that's the LRU key to evict.

This makes `Map` a **legitimate, simpler alternative** to hand-rolling a DLL for plain LRU. Fewer lines, fewer bugs (no manual pointer splicing), same asymptotic complexity.

**What you lose by hiding the mechanics in `Map`:**
1. **No O(1) access to arbitrary interior nodes for custom eviction policies.** With your own DLL you hold direct node references and can splice *any* node out from *anywhere* in O(1) — e.g. "evict the second-to-last" or "move this node three spots forward" for a hybrid policy. `Map` only gives you cheap access to the *ends* of iteration order (first key / re-append), not O(1) manipulation of an arbitrary middle node — you'd still need to delete+re-insert, which is fine for pure LRU but doesn't generalize to policies that need mid-list surgery.
2. **Less interview signal about DS fundamentals.** The whole point of the LRU question is "do you understand *why* hashmap + DLL together give O(1)." Reaching for `Map` and never explaining the mechanism underneath answers the *feature* request but skips the *data-structure* reasoning the interviewer is actually screening for. Good approach: mention `Map` as the pragmatic production answer, but demonstrate the DLL to show you know what's happening under the hood.

**Bottom line:** in production code, prefer `Map` — it's correct, O(1), and less code to maintain. In an LLD interview, build the DLL version (or at minimum explain it in detail) — that's the signal being tested.

---

<a name="concurrency"></a>
# 6. Concurrency

**The claim "JS is single-threaded so this is safe" is half-true — the danger is at the *boundaries* of synchronous code, not inside it.**

For a cache shared across concurrent requests in a Node.js server:
- Plain `get(key)` / `put(key, value)` as written above are **fully synchronous** — no `await`, no I/O. The event loop runs one JS callback to completion before starting the next, so two requests can never interleave *inside* a single `get`/`put` call. No torn reads, no partially-spliced list, no race on the map. This is a real advantage over languages where you'd need a mutex/`synchronized` block for the same guarantee.

**The specific hazard:** the moment eviction triggers an **async side-effect mid-operation** — e.g. `put()` evicting a key and pushing an "eviction event" onto a queue (`await queue.publish(...)`) — the function now has an `await` inside it. That `await` is a **yield point**: the event loop can run other queued callbacks (including another request's `get`/`put` on the *same cache instance*) before the eviction-publishing `put()` resumes. Concretely:
```
Request A: put(3, "c") → evicts key 2 → starts await queue.publish(evict-event-for-2) ...
   [event loop switches to Request B while A is suspended]
Request B: get(2) → key 2 is ALREADY GONE from the map (eviction already happened
           synchronously before the await) → correctly returns -1, no corruption here.
   ...but if the eviction itself were split so the map mutation happened
   AFTER an await (e.g. "check capacity → await something → then evict"),
   Request B could read state mid-eviction: a node removed from the DLL
   but not yet deleted from the map, or vice versa — an inconsistent view.
```
The rule of thumb: **do all the map + DLL mutation synchronously first, and only `await` the side-effect (queue publish, logging, metrics) *after* the cache's internal state is fully consistent.** Never split a single logical mutation (remove from map + remove from list) across an `await` boundary — that's the one place a single-threaded language can still produce a "concurrency bug," because it's not actually about threads, it's about *reentrancy*: another request's synchronous code can run while yours is paused mid-state-change.

If the cache needs to be shared **across processes/machines** (not just concurrent requests in one Node process), synchronous single-threaded guarantees stop applying entirely — you'd need an external distributed cache (Redis) with atomic commands, or a lock/version-check scheme, since two separate Node processes have no shared event loop to serialize them.

---

<a name="extensibility"></a>
# 7. Extensibility

### "Now add TTL expiry per key"
- Add an `expiresAt` timestamp field to `Node` (set on `put`, optionally refreshed on `get` depending on requirements — "sliding" vs "absolute" TTL).
- `get(key)`: after the O(1) map lookup, check `Date.now() > node.expiresAt` — if expired, treat as a miss: remove the node (map + list) and return `-1`. Still O(1); no extra structure needed for *lazy* expiry (expire-on-access).
- For *proactive* expiry (evict expired keys even if nobody accesses them, e.g. to reclaim memory promptly) you'd add a **min-heap keyed by `expiresAt`** or a background sweep timer — that's an additional structure, and a genuine trade-off to name out loud: lazy expiry is simpler and O(1) but can let dead entries linger in memory; proactive expiry reclaims memory faster but costs a heap/timer and extra bookkeeping.
- Design-wise this is an **additive** change — capacity-based LRU eviction and TTL-based expiry are orthogonal and compose cleanly: a key can be evicted for being LRU *or* removed for being expired, whichever happens first.

### "Now make it an LFU cache instead"
This is a bigger structural change, not a tweak — it's the natural interview follow-up specifically because it tests whether your design generalizes or was accidentally overfit to LRU:
- LRU needs **one axis of ordering** (recency) → one DLL suffices.
- LFU needs to evict the **least-frequently-used**, with ties broken by recency → you need frequency as a first-class dimension, not just a counter on the node.
- Classic O(1) LFU structure: a `Map<key, Node>` (same as before) **plus** a `Map<frequency, DoublyLinkedList>` — each frequency bucket is its own DLL of nodes at that frequency, ordered by recency within the bucket — **plus** a `minFrequency` pointer tracking the lowest non-empty bucket.
- On `get`/`put`-touch: remove the node from its current frequency's DLL, increment its frequency, insert it at the front of the new frequency's DLL (creating that bucket if needed), and bump `minFrequency` if the old bucket is now empty and was the minimum.
- Eviction: pop the tail of the `minFrequency` bucket's DLL (LRU within the least-frequent bucket — this is where the "tie-break by recency" requirement is satisfied).
- **What carries over:** the sentinel-node DLL trick, the "store the key on the node for O(1) map cleanup" trick, and the has-a composition style. **What doesn't:** a single DLL is no longer enough — you need the DLL-per-frequency-bucket structure. Flagging this distinction is the answer that shows real understanding rather than a memorized LRU script.

---

<a name="interview"></a>
# 8. Interview Q&A

### Q: "Why not just use an array?"
> *"An array gives me O(1) index access, but I don't have an index — I have a key. Finding the entry means scanning, which is O(n), and reordering it to mark it as recently used means shifting elements, also O(n). It fails both requirements before I even get to eviction."*

### Q: "Why can't a plain hashmap alone solve this?"
> *"A hashmap gets me O(1) lookup and O(1) insert, which covers half the problem. But eviction needs me to know which key is least-recently-used, and a hashmap doesn't preserve or expose ordering cheaply — I'd have to scan every entry's last-used time, which is O(n). I need a second structure that tracks order and lets me reorder in O(1), which is what the doubly linked list is for."*

### Q: "Why doubly linked, not singly linked?"
> *"To remove a node in O(1) I need to splice it out — that means updating both its predecessor's `next` and its successor's `prev`. A singly linked list only gives me `next`, so to find a node's predecessor I'd have to walk from the head, which is O(n). Doubly linked gives me `prev` directly off the node itself."*

### Q: "Why sentinel head and tail nodes instead of just tracking head/tail pointers?"
> *"Without sentinels, every insert or remove has to special-case whether the list is empty, or whether I'm touching the actual first/last node — that's exactly the kind of null-check bug that creeps into LRU implementations under interview time pressure. With two dummy nodes always present, `head.next` and `tail.prev` are never null, so `_remove` and `_addToFront` have zero branching — they always operate on a 'real' node between two guaranteed neighbors."*

### Q: "The repo also has a Map-based version with way less code — why would I ever hand-roll the DLL?"
> *"JavaScript's `Map` preserves insertion order and gives O(1) delete/set, so delete-then-re-insert on access legitimately reproduces LRU behavior with far less code — I'd use that in production. But it hides the mechanism the interview is actually testing: whether I understand *why* hashmap-plus-ordering gives O(1), and it only gives me cheap access to the ends of the order, not O(1) splicing of an arbitrary interior node — which matters the moment a policy needs anything beyond plain LRU. So I'd mention `Map` as the pragmatic answer but build the DLL to show the underlying data-structure reasoning."*

### Q: "Is this cache safe if it's shared across concurrent requests in a Node server?"
> *"For synchronous `get`/`put` as written, yes — JS's single-threaded event loop runs each call to completion, so two requests can't interleave mid-splice. The hazard shows up only if I add an `await` inside a mutation — say, publishing an eviction event to a queue *before* finishing the map/list cleanup. That `await` is a yield point where another request's `get`/`put` on the same cache can run against a half-mutated state. The fix is to keep all state mutation synchronous and only `await` side-effects after the cache is internally consistent again."*

### Q: "How would you extend this to LFU?"
> *"LRU only needs one ordering axis — recency — so one doubly linked list is enough. LFU needs frequency as a first-class axis with recency as the tiebreaker, so I'd move to a `Map` from frequency to its own DLL of nodes at that frequency, plus a `minFrequency` pointer. Touching a key removes it from its current frequency bucket and reinserts it at the front of the next frequency's bucket; eviction pops the tail of the minimum-frequency bucket. The sentinel-DLL and key-on-node tricks carry over, but a single DLL doesn't — that's the structural change the follow-up is testing for."*

---

<a name="cheatsheet"></a>
# 9. Cheat Sheet

- **Signature challenge:** O(1) `get` AND `put` simultaneously — `get` also promotes to MRU.
- **Why array fails:** lookup + reorder both O(n).
- **Why hashmap alone fails:** O(1) lookup, but no O(1) way to find "least recently used" — no ordering.
- **Fix:** `Map<key, Node>` (O(1) lookup) + doubly linked list ordered by recency (O(1) reorder/evict) — the hashmap's value *is* the list node reference.
- **Why doubly, not singly linked:** need `prev` for O(1) removal without walking from head.
- **Node stores its own key:** so evicting the tail lets you delete the right map entry in O(1).
- **Sentinel head/tail:** eliminates null-checks — `head.next` = MRU, `tail.prev` = LRU, always real nodes.
- **Core ops:** `_remove(node)` splices out; `_addToFront(node)` inserts after head; `get`/`put` both call remove-then-add-to-front to promote.
- **Repo's `Map`-based version:** legitimate O(1) alternative — JS `Map` preserves insertion order; delete+re-set on access = promote to MRU; `keys().next().value` = LRU key. Simpler, less interview signal, no O(1) arbitrary-node access for custom policies.
- **Concurrency:** single-threaded JS makes synchronous get/put safe; the hazard is an `await` *inside* a mutation (e.g. eviction publishing to a queue) creating a reentrancy window before state is consistent — keep mutation synchronous, await side-effects after.
- **Extend → TTL:** add `expiresAt` on `Node`, lazy-check on `get` (O(1)); proactive expiry needs a min-heap/timer.
- **Extend → LFU:** `Map<frequency, DLL>` + `minFrequency` pointer; frequency becomes the primary axis, recency the tiebreaker within a bucket.

*— LLD Problem 03 complete —*
