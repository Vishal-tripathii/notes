# JavaScript Study Notes — Part 16

## Modules (CommonJS vs ESM) ⭐⭐⭐☆☆

**Topics:** CommonJS `require`/`module.exports` vs ES Modules `import`/`export` · why they don't mix cleanly · named vs default exports · dynamic `import()`.

---

## 1. CommonJS

> **Definition:** CommonJS is Node's original module system, where `require()` **synchronously** loads and executes a module (with results cached after the first load), and `module.exports` is the object a module hands back to whoever requires it — resolved and evaluated entirely at **runtime**.

```js
// math.js
function add(a, b) { return a + b; }
module.exports = { add };          // or: exports.add = add;

// app.js
const { add } = require('./math'); // synchronous — blocks until math.js has fully executed
console.log(add(2, 3));
```

## 2. ES Modules (ESM)

> **Definition:** ES Modules are the standardized, language-level module system, using `import`/`export` — bindings are resolved **statically** at parse time (before any code runs), imports are **live bindings** to the exporting module's values (not copies), and loading is inherently **asynchronous**.

```js
// math.mjs
export function add(a, b) { return a + b; }   // named export
export default function multiply(a, b) { return a * b; } // default export

// app.mjs
import multiply, { add } from './math.mjs';    // default + named in one import
console.log(add(2, 3), multiply(2, 3));
```

## 3. Why They Don't Mix Cleanly

> **Definition:** "static" analysis (ESM) means the shape of the module's exports is knowable **without executing any code** — just by parsing the `import`/`export` statements — which is exactly what enables **tree shaking** (bundlers safely removing unused exports). "Dynamic" (CommonJS) means the exports object is just a regular JS value assigned at runtime, so its shape can only be known by actually running the code — a bundler can't know what `module.exports` contains without evaluating the module.

| | CommonJS | ESM |
|---|---|---|
| Loading | synchronous, at the `require()` call site, anywhere in code | static, resolved at parse time, only at the top of a file (with dynamic `import()` as the escape hatch) |
| Exports | a mutable runtime object | live, read-only bindings to the source module |
| Tree-shakeable? | no — bundler can't statically know what's exported without running the code | yes — the whole reason bundlers can safely drop unused exports |
| `this` at module top level | `module.exports` | `undefined` |
| File extension convention (Node) | `.js` (default) or `.cjs` | `.mjs`, or `.js` with `"type": "module"` in `package.json` |

**Where the mixing breaks down:** Node lets you `require()` a CommonJS module from ESM in many cases, but `import`ing a CommonJS module into ESM only gets you its `module.exports` as a single default-like object (no proper named exports unless Node can statically analyze them), and you generally **cannot** `require()` a genuine ESM module synchronously at all — ESM's async nature is fundamentally incompatible with `require()`'s synchronous contract.

## 4. Named vs Default Exports

> **Definition — Named export:** an export bound to a specific identifier (`export const x = ...`), imported with the matching name in braces (`import { x }`) — a module can have any number of named exports.
> **Definition — Default export:** the one export a module designates as its "main" value (`export default ...`), imported under any name the importer chooses, without braces — a module can have at most one default export.

```js
// named — good for utility modules exporting multiple independent things
export const PI = 3.14159;
export function circleArea(r) { return PI * r * r; }
import { PI, circleArea } from './math.js';

// default — good for a module whose entire purpose is "the one thing it exports"
export default class UserService { /* ... */ }
import UserService from './UserService.js'; // name is arbitrary — no braces
```

## 5. Dynamic `import()`

> **Definition:** `import()` (as a function call, not the static statement) asynchronously loads a module and returns a **promise** that resolves to its exports namespace object — usable anywhere in code, including conditionally, unlike the static `import` statement which must appear at the top of a file.

```js
async function loadChart() {
  const { Chart } = await import('./chart-library.js'); // only loaded when actually needed
  return new Chart();
}
button.addEventListener('click', loadChart); // classic code-splitting / lazy-loading pattern
```

---

## Interview Q&A

**Q: CommonJS vs ESM, the core difference?**
> CommonJS resolves modules synchronously at runtime via `require()`, and exports are just a regular mutable object. ESM resolves imports/exports statically at parse time, before any code runs, with live read-only bindings to the source — that static analyzability is exactly what lets bundlers tree-shake unused code, which CommonJS can't support since it can't know a module's exports without actually executing it.

**Q: Named vs default exports — when do you reach for each?**
> Named exports for a module offering multiple independent, equally-important utilities — they're explicit at the import site and get IDE auto-import/rename support. Default export for a module whose entire purpose is one thing (a single component, a single class) — though the tradeoff is the importer can name it anything, which can hurt consistency across a codebase.

**Q: What does dynamic `import()` unlock that static `import` can't do?**
> It can be called conditionally, inside a function, in response to an event — anywhere regular code can run — and returns a promise, making it the mechanism behind code-splitting and lazy-loading (only download/parse/execute a module when it's actually needed, e.g. behind a route or a button click).

---

## Follow-ups (challenge questions)

- *Failure mode:* a large bundle includes a CommonJS dependency alongside ESM-only application code — the bundler can't tree-shake the CommonJS parts. What's the actual bundle-size consequence, and why can't the bundler "just figure it out" by running the code during the build?
- *Consistency:* ESM exports are **live bindings** — if module A exports a `let count = 0` and increments it internally, does module B (which imported `count`) see the updated value automatically? Contrast with what CommonJS's `module.exports = { count }` would do.
- *Scale:* a single-page app statically imports every route's component up front — what's the practical cost as the app grows to 200 routes, and how does dynamic `import()` per-route change the initial load?

---

**Previous:** [Part 15 — Map / Set / WeakMap / WeakSet](15-map-set-weakmap-weakset.md) · **Next:** [Part 17 — Memory Management](17-memory-management.md)
