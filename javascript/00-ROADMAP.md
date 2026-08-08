# 🟨 JavaScript Study Notes — Master Roadmap

> **Purpose:** the full study plan for the JavaScript track — the language underneath everything else in this repo. 27 parts, ordered so each depends only on what came before it. Every part is its own note file in this folder (`NN-topic-slug.md`), same convention as [Angular](../Angular/00-ROADMAP.md) and [nodejs](../nodejs/).
>
> **Format per part:** a proper definition for every concept, code snippets, predict-before-you-run output, interview Q&A, and follow-up scenario-style challenge questions.
>
> **Target:** 80–85% interview coverage — strong conceptual understanding, hands-on coding, output prediction, real-world usage, and interview-oriented explanations.
>
> **Connects to:** [nodejs track](../nodejs/) (Part 10 here is the browser-side delta to nodejs's event loop coverage) · [Angular track](../Angular/) (RxJS/Signals build on Promises/closures here) · [scenario-bank/](../scenario-bank/) (once a part below is solid, production-failure-style follow-ups can graduate there on agreement — see that folder's README).

---

## Progress tracker

| # | Part | Priority | Status |
|---|---|---|---|
| 00 | [JS Fundamentals](00-js-fundamentals.md) | ⭐⭐⭐⭐☆ | ✅ done |
| 01 | [Scope & Closures](01-scope-and-closures.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 02 | [Functions](02-functions.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 03 | [`this`, `call`/`apply`/`bind`](03-this-call-apply-bind.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 04 | [Objects](04-objects.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 05 | [Arrays](05-arrays.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 06 | [Strings & Regex](06-strings-and-regex.md) | ⭐⭐⭐☆☆ | ✅ done |
| 07 | [Destructuring & Spread/Rest](07-destructuring-and-spread-rest.md) | ⭐⭐⭐☆☆ | ✅ done |
| 08 | [Prototype & Inheritance](08-prototype-and-inheritance.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 09 | [Classes](09-classes.md) | ⭐⭐⭐⭐☆ | ✅ done |
| 10 | [Event Loop & Concurrency Model](10-event-loop-and-concurrency-model.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 11 | [Promises](11-promises.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 12 | [async/await](12-async-await.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 13 | [Error Handling](13-error-handling.md) | ⭐⭐⭐☆☆ | ✅ done |
| 14 | [Generators & Iterators](14-generators-and-iterators.md) | ⭐⭐☆☆☆ | ✅ done |
| 15 | [Map / Set / WeakMap / WeakSet](15-map-set-weakmap-weakset.md) | ⭐⭐⭐☆☆ | ✅ done |
| 16 | [Modules (CommonJS vs ESM)](16-modules-commonjs-vs-esm.md) | ⭐⭐⭐☆☆ | ✅ done |
| 17 | [Memory Management](17-memory-management.md) | ⭐⭐⭐☆☆ | ✅ done |
| 18 | [Advanced Functional Patterns](18-advanced-functional-patterns.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 19 | [Polyfills](19-polyfills.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 20 | [Browser APIs](20-browser-apis.md) | ⭐⭐⭐☆☆ | ✅ done |
| 21 | [DOM Manipulation & Event Delegation](21-dom-manipulation-and-event-delegation.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 22 | [Performance Patterns](22-performance-patterns.md) | ⭐⭐⭐☆☆ | ✅ done |
| 23 | [Modern JavaScript Features](23-modern-javascript-features.md) | ⭐⭐⭐☆☆ | ✅ done |
| 24 | [Output-Based Question Drills](24-output-based-question-drills.md) | ⭐⭐⭐⭐⭐ | ✅ done (25 of 50+ target) |
| 25 | [Coding & Machine Coding Round](25-coding-and-machine-coding-round.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 26 | [Interview Discussion Practice](26-interview-discussion-practice.md) | ⭐⭐⭐⭐⭐ | ✅ done |

**If you have one week left:** closures + event loop + promises/async-await + `this` + prototypes + output-based drills (Parts 01, 03, 08, 10–12, 24). Those six carry most JavaScript interviews.

---

# PHASE 0 — Foundations

## Part 00 — [JS Fundamentals](00-js-fundamentals.md) ⭐⭐⭐⭐☆

Execution Context · Call Stack · Hoisting · TDZ · `var`/`let`/`const` · Primitive vs Reference · Type Coercion · `==` vs `===` · `typeof` · `Object.is()` · `null` vs `undefined` · `Symbol` · `BigInt`.

---

# PHASE 1 — Core language

## Part 01 — [Scope & Closures](01-scope-and-closures.md) ⭐⭐⭐⭐⭐

Lexical Scope · Scope Chain · Closures · memory retention/leaks · the Module Pattern · the classic `for(var i...)` loop bug.

## Part 02 — [Functions](02-functions.md) ⭐⭐⭐⭐⭐

Declaration vs Expression · Arrow Functions · IIFE · Higher-Order Functions · Callbacks · Pure Functions · Rest/Spread in params · first-pass `compose`/`pipe`/`curry`/`once`/`debounce`/`throttle`.

## Part 03 — [`this`, `call`/`apply`/`bind`](03-this-call-apply-bind.md) ⭐⭐⭐⭐⭐

`this` in global/plain function/method/arrow/constructor/event listener · the four binding rules · `call`/`apply`/`bind` · implementing `bind()` from scratch.

## Part 04 — [Objects](04-objects.md) ⭐⭐⭐⭐⭐

Object creation · `Object.freeze()` vs `Object.seal()` · `Object.assign()` · property descriptors · `?.` / `??` · shallow vs deep copy.

## Part 05 — [Arrays](05-arrays.md) ⭐⭐⭐⭐⭐

`map`/`filter`/`reduce`/`find`/`some`/`every`/`sort`/`slice`/`splice`/`flat`/`flatMap` — which mutate vs return new.

## Part 06 — [Strings & Regex](06-strings-and-regex.md) ⭐⭐⭐☆☆

Common string methods · template literals (incl. tagged templates) · regex basics.

## Part 07 — [Destructuring & Spread/Rest](07-destructuring-and-spread-rest.md) ⭐⭐⭐☆☆

Array/object destructuring · defaults · nested destructuring · destructuring params · spread vs rest.

---

# PHASE 2 — Object model & OOP

## Part 08 — [Prototype & Inheritance](08-prototype-and-inheritance.md) ⭐⭐⭐⭐⭐

The Prototype · the Prototype Chain and property lookup · Constructor Functions · `Object.create()` · how `class` desugars to prototypal inheritance.

## Part 09 — [Classes](09-classes.md) ⭐⭐⭐⭐☆

Constructor · static members · private fields (`#field`) · getters/setters · `extends` · `super`.

---

# PHASE 3 — Asynchronous JavaScript

> The highest-yield phase after closures.

## Part 10 — [Event Loop & Concurrency Model](10-event-loop-and-concurrency-model.md) ⭐⭐⭐⭐⭐

⚠️ Scoped to the **browser delta** — cross-references [nodejs Part 01](../nodejs/01-javascript-execution-model.md) rather than duplicating it. Web APIs vs libuv, no `process.nextTick`, `requestAnimationFrame`.

## Part 11 — [Promises](11-promises.md) ⭐⭐⭐⭐⭐

Three states · chaining · error handling · `.finally()` · `Promise.all`/`allSettled`/`race`/`any` · implementing `Promise.all()` from scratch.

## Part 12 — [async/await](12-async-await.md) ⭐⭐⭐⭐⭐

Sugar over promises · how `await` suspends · `try`/`catch` around `await` · sequential vs parallel `await` · top-level `await`. Heavy output-prediction drilling territory.

## Part 13 — [Error Handling](13-error-handling.md) ⭐⭐⭐☆☆

`try`/`catch`/`finally` · `throw` · custom `Error` subclasses · catching async errors.

## Part 14 — [Generators & Iterators](14-generators-and-iterators.md) ⭐⭐☆☆☆

Iterator protocol · `Symbol.iterator` · `function*`/`yield` · lazy evaluation · custom iterables.

## Part 15 — [Map / Set / WeakMap / WeakSet](15-map-set-weakmap-weakset.md) ⭐⭐⭐☆☆

`Map` vs plain object · `Set` for uniqueness · `WeakMap`/`WeakSet` and garbage collection.

## Part 16 — [Modules (CommonJS vs ESM)](16-modules-commonjs-vs-esm.md) ⭐⭐⭐☆☆

`require`/`module.exports` vs `import`/`export` · why they don't mix cleanly · named vs default exports · dynamic `import()`.

## Part 17 — [Memory Management](17-memory-management.md) ⭐⭐⭐☆☆

Stack vs Heap · reference counting vs mark-and-sweep GC · common leak sources.

---

# PHASE 4 — Functional patterns & polyfills

## Part 18 — [Advanced Functional Patterns](18-advanced-functional-patterns.md) ⭐⭐⭐⭐⭐

Polished `debounce`/`throttle`/`memoize`/`curry`/`compose`/`pipe`/`retry`/`once` — edge cases and options.

## Part 19 — [Polyfills](19-polyfills.md) ⭐⭐⭐⭐⭐

Implement from scratch: `map`/`filter`/`reduce`/`bind`/`call`/`apply`/`Promise.all`/`debounce`/`throttle`/`flat`.

---

# PHASE 5 — Browser & DOM

## Part 20 — [Browser APIs](20-browser-apis.md) ⭐⭐⭐☆☆

`localStorage` vs `sessionStorage` · cookies · `fetch` · `AbortController` · `URLSearchParams`.

## Part 21 — [DOM Manipulation & Event Delegation](21-dom-manipulation-and-event-delegation.md) ⭐⭐⭐⭐⭐

Querying/creating/modifying nodes · bubbling/capturing · event delegation.

## Part 22 — [Performance Patterns](22-performance-patterns.md) ⭐⭐⭐☆☆

Debounce/throttle on real DOM events · lazy loading · `requestAnimationFrame`.

---

# PHASE 6 — Modern JS & machine coding

## Part 23 — [Modern JavaScript Features](23-modern-javascript-features.md) ⭐⭐⭐☆☆

Default params · computed property names · `Array.prototype.at()` · `Object.hasOwn()` · `structuredClone()` · logical assignment (`||=`/`&&=`/`??=`).

## Part 24 — [Output-Based Question Drills](24-output-based-question-drills.md) ⭐⭐⭐⭐⭐

A running file — target 50+ questions, weighted toward Parts 10–12 and Part 01.

## Part 25 — [Coding & Machine Coding Round](25-coding-and-machine-coding-round.md) ⭐⭐⭐⭐⭐

Deep Clone · Flatten Array/Object · Event Emitter · Pub/Sub · LRU Cache · Promise Pool.

📁 `work/LRUCache.js` and `work/LRUCache_DLL.js` already exist in this repo — review/refactor those rather than starting from zero.

## Part 26 — [Interview Discussion Practice](26-interview-discussion-practice.md) ⭐⭐⭐⭐⭐

Explain out loud, without notes: Event Loop · Closures · Execution Context · Prototype Chain · single-threading · `async`/`await` · `map` vs `forEach` · shallow vs deep copy · Promise lifecycle.

---

# Interview priority — what to revise last

| Priority | Topics |
|---|---|
| ⭐⭐⭐⭐⭐ | Closures · Functions · `this`/`call`/`apply`/`bind` · Objects · Arrays · Prototype & Inheritance · Event Loop · Promises · async/await · Advanced Functional Patterns · Polyfills · Event Delegation · Output Drills · Machine Coding · Discussion Practice |
| ⭐⭐⭐⭐☆ | JS Fundamentals · Classes |
| ⭐⭐⭐☆☆ | Strings & Regex · Destructuring · Error Handling · Map/Set/WeakMap/WeakSet · Modules · Memory Management · Browser APIs · Performance Patterns · Modern Features |
| ⭐⭐☆☆☆ | Generators & Iterators |

---

*— Work through these in order. One part at a time, explained first, written after. —*
