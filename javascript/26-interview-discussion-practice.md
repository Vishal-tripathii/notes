# JavaScript Study Notes — Part 26

## Interview Discussion Practice ⭐⭐⭐⭐⭐

> The final gate before calling the track interview-ready: **be able to explain each of these out loud, from memory, with no notes, in the time it'd take a real interviewer to nod along** — not just recognize the answer when reading it. If any of these still requires flipping back to its part, that part isn't done yet.

---

## How to use this part

For each topic below: say the explanation out loud, unscripted, in under ~90 seconds, including one concrete example or real-world consequence. Then check yourself against the linked part. If you stumble, that's real signal — go back and re-drill that part's Q&A section, don't just re-read the explanation silently.

---

## The checklist

### 1. The Event Loop
Explain: what the call stack is, why JS is single-threaded, what a Web API/libuv hands off, the microtask-vs-macrotask priority order, and why `setTimeout(fn, 0)` doesn't mean "now." → [Part 10](10-event-loop-and-concurrency-model.md), [nodejs Part 01](../nodejs/01-javascript-execution-model.md)

### 2. Closures
Explain: the precise definition (live reference, not a snapshot), why the `var`-loop bug happens, one real non-toy use case, and when a closure becomes a memory leak. → [Part 01](01-scope-and-closures.md)

### 3. Execution Context
Explain: the two-phase creation/execution model, how it produces hoisting and the TDZ, and what's pushed/popped on the call stack per function call. → [Part 00](00-js-fundamentals.md)

### 4. The Prototype Chain
Explain: the lookup algorithm step by step, why methods belong on `.prototype` not the constructor, and how `class` desugars to exactly this mechanism. → [Part 08](08-prototype-and-inheritance.md)

### 5. Why JavaScript Is Single-Threaded (and what that trades away)
Explain: one call stack, no locks/race conditions needed for synchronous code, but CPU-heavy work blocks everything — and the escape hatch (Web Workers) for that specific problem. → [Part 10](10-event-loop-and-concurrency-model.md)

### 6. `async`/`await`
Explain: it's sugar over promises/microtasks, not a new concurrency mechanism, how `await` suspends without blocking the thread, and the `await`-in-a-loop performance bug plus its fix. → [Part 12](12-async-await.md)

### 7. `map` vs `forEach`
Explain: return value and intent (`map` builds data, `forEach` is for side effects), and why using the wrong one is a readability smell, not just a style nit. → [Part 05](05-arrays.md)

### 8. Shallow vs Deep Copy
Explain: why `{...obj}`/`Object.assign` is shallow, exactly where that bites in practice (state-management mutation bugs), and `structuredClone()` as the modern deep-copy answer. → [Part 04](04-objects.md)

### 9. The Full Lifecycle of a Promise
Explain: the three states, why a promise settles exactly once, how `.then()` chaining works (each call returns a new promise), and `all`/`allSettled`/`race`/`any` with a use case each. → [Part 11](11-promises.md)

---

## Extended list — round out the full track

### 10. `this` and the Four Binding Rules
→ [Part 03](03-this-call-apply-bind.md)

### 11. `call`/`apply`/`bind` — differentiate and give a use case each
→ [Part 03](03-this-call-apply-bind.md)

### 12. `==` vs `===`, and the one accepted exception
→ [Part 00](00-js-fundamentals.md)

### 13. `typeof null` — and why it's a known bug, not a design choice
→ [Part 00](00-js-fundamentals.md)

### 14. `var`/`let`/`const` — scope, hoisting, and reassignment differences
→ [Part 00](00-js-fundamentals.md)

### 15. `freeze` vs `seal`, and why both are shallow
→ [Part 04](04-objects.md)

### 16. `slice` vs `splice`, and which array methods mutate
→ [Part 05](05-arrays.md)

### 17. `#private` class fields vs the `_underscore` convention
→ [Part 09](09-classes.md)

### 18. `Map`/`Set` vs plain objects/arrays — when each wins
→ [Part 15](15-map-set-weakmap-weakset.md)

### 19. `WeakMap`/`WeakSet` — what "weak" actually buys you
→ [Part 15](15-map-set-weakmap-weakset.md)

### 20. CommonJS vs ESM — why they don't tree-shake the same way
→ [Part 16](16-modules-commonjs-vs-esm.md)

### 21. Stack vs Heap, and reference counting vs mark-and-sweep GC
→ [Part 17](17-memory-management.md)

### 22. debounce vs throttle, with the UI scenario each fits
→ [Part 18](18-advanced-functional-patterns.md), [Part 22](22-performance-patterns.md)

### 23. Why polyfilling `bind` needs to handle `new`
→ [Part 19](19-polyfills.md)

### 24. Event delegation — why it beats a listener per element
→ [Part 21](21-dom-manipulation-and-event-delegation.md)

### 25. `fetch`'s gotcha — why a 404 doesn't reject the promise
→ [Part 20](20-browser-apis.md)

---

## Mock-interview format (do this once the checklist above feels solid)

Pick 3 topics at random from the list. For each:
1. **Explain it cold** (90 seconds, out loud, no notes).
2. **Predict an output** — pull a random snippet from [Part 24's drills](24-output-based-question-drills.md) on that topic.
3. **Take one follow-up** — pull a *Follow-ups (challenge questions)* entry from that topic's part and answer it as if an interviewer just asked it as a "what if" after your explanation. This is deliberately the same escalation pattern the [scenario-bank](../scenario-bank/00-README.md) uses — production-failure/scale/concurrency framing, not more definitions.

If any of the three trips you up, that's not a failure — it's exactly the signal this part exists to surface. Go fix it in the source part, then come back and try a fresh random 3.

---

**Previous:** [Part 25 — Coding & Machine Coding Round](25-coding-and-machine-coding-round.md) · **Back to:** [00 — Roadmap](00-ROADMAP.md)
