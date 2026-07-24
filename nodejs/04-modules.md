# Node.js Study Notes — Part 4

## Modules — CommonJS, ES Modules, Resolution, Cache & Circular Dependencies

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.
>
> **Continues from:** [Part 2 §Q7](02-nodejs-internals.md) (the module cache makes modules singletons) and [Part 1 §5](01-javascript-execution-model.md) (TDZ, which is how circular imports fail in ESM).
>
> **Why this matters:** modules are where "works on my machine" bugs come from — load order, stale caches, and half-built objects that fail at runtime instead of at load time.

---

## Table of Contents

1. [CommonJS](#cjs)
2. [ES Modules](#esm)
3. [Module Resolution](#resolution)
4. [Module Cache](#cache)
5. [Circular Dependencies](#circular) ⭐
6. [Interview Questions & Answers](#interview)
7. [Cheat Sheet](#cheatsheet)

---

<a name="cjs"></a>
# 1. CommonJS (CJS)

Node's original system: `require()` and `module.exports`.

> **Analogy 📞 — a phone call.** You call, wait on the line, get your answer, then continue. `require()` is **synchronous** — execution stops until the module is loaded and run.

```js
// math.js
function add(a, b) { return a + b; }
module.exports = { add };

// app.js
const { add } = require('./math');
```

## The wrapper — this explains almost everything about CJS

Node doesn't run your file as-is. It **wraps it in a function** first:

```js
(function (exports, require, module, __filename, __dirname) {
  // ← your entire file goes here
});
```

Three consequences:

**① `__dirname`, `require`, `module` aren't globals** — they're **parameters** of that wrapper. That's why they exist in Node but not the browser, and why ESM doesn't have them.

**② Every module has its own scope.** A top-level `var` isn't global; it's local to the wrapper. No accidental collisions between files.

**③ `exports` is just a variable pointing at `module.exports`** — which causes the classic bug:

```js
exports.add = fn;          // ✅ works — mutating the shared object
module.exports = { add };  // ✅ works — reassigning the real thing
exports = { add };         // ❌ SILENTLY BROKEN
```

> **Why:** `exports` starts as a shortcut to the same object as `module.exports`. Reassigning `exports` only repoints your local variable — Node still returns `module.exports`, still the original empty object.
> **Rule: assign to `module.exports`, or only ever mutate `exports`.**

---

<a name="esm"></a>
# 2. ES Modules (ESM)

The standard: `import` / `export`.

> **Analogy 📄 — sending the contract in advance.** Instead of phoning to ask what someone can do, you get their signed contract before the meeting starts. Node reads **all** imports and exports *before running a single line*.
>
> ⭐ **That's the whole difference: CJS is resolved while running, ESM is resolved before running.**

```js
// math.mjs
export function add(a, b) { return a + b; }

// app.mjs
import { add } from './math.mjs';
```

| | **CommonJS** | **ES Modules** |
|---|---|---|
| Syntax | `require` / `module.exports` | `import` / `export` |
| Loading | **synchronous** | asynchronous |
| When resolved | **at runtime** — can be conditional | **at parse time** — static |
| Imports are | a **copy** of the value | a **live binding** ⭐ |
| `__dirname` | ✅ | ❌ use `import.meta.url` |
| Top-level `await` | ❌ | ✅ |
| Tree-shaking | ❌ impossible | ✅ |
| File extension | `.js` / `.cjs` | `.mjs`, or `"type": "module"` |

## Live bindings vs copies — the difference people get wrong

```js
// counter.cjs                     // counter.mjs
let count = 0;                     export let count = 0;
function inc() { count++; }        export function inc() { count++; }
module.exports = { count, inc };
```
```js
// CommonJS                        // ESM
const c = require('./counter');    import { count, inc } from './counter.mjs';
c.inc();                           inc();
console.log(c.count);  // 0 ❌     console.log(count);  // 1 ✅
```

**CJS copied the *value* at export time — a snapshot, frozen at 0.** ESM exported a **live link to the variable**, so the importer sees updates.

This is also why **only ESM can be tree-shaken**: imports are static, so a bundler knows at build time which exports are unused. With `require()` the path could be a variable — nothing is knowable until runtime.

## Turning it on, and mixing

```json
{ "type": "module" }     // package.json — now .js files are ESM
```

**ESM can `import` CommonJS.** The reverse traditionally fails with `ERR_REQUIRE_ESM` — **`require` is sync and ESM loading is async, and a sync function can't wait on async work.** (Recent Node has relaxed this for modules without top-level `await`; the safe interview answer is still the sync/async reason.)

The portable escape hatch is dynamic `import()`, which returns a promise and works from CJS:

```js
const { default: chalk } = await import('chalk');
```

---

<a name="resolution"></a>
# 3. Module Resolution

**How `require('x')` finds `x`.**

> **Analogy 🔍 — looking for a tool.** First check your own toolbox (**core modules**). If they gave you a map (`./path`), follow it. Otherwise ask your floor — no luck? ask the floor above — still no? keep climbing until you reach the street (**the `node_modules` walk-up**).

```
require('X')
   │
   ├─ 1. Is X a CORE module?  (fs, path, http, crypto)
   │       → return it immediately. Always wins.
   │
   ├─ 2. Does X start with ./ ../ or / ?   → a FILE PATH
   │       try in order:  X  →  X.js  →  X.json  →  X.node
   │       if X is a directory:
   │            X/package.json "main" (or "exports")
   │            X/index.js
   │
   └─ 3. Otherwise → a PACKAGE. Walk UP the folder tree:
            ./node_modules/X
            ../node_modules/X
            ../../node_modules/X
            ... to the filesystem root  →  then throw MODULE_NOT_FOUND
```

**The walk-up in practice.** From `/app/src/services/user.js`, `require('lodash')` checks:

```
/app/src/services/node_modules/lodash
/app/src/node_modules/lodash
/app/node_modules/lodash          ← usually found here
/node_modules/lodash
```

**Two things this explains:**
- **Why `node_modules` nests.** If two packages need different versions of the same dependency, npm nests one inside the other so each finds its own version on the way up.
- **Why you can't shadow a core module.** Name a file `http.js` and `require('http')` still gets Node's built-in — core is checked first. You'd need `./http`.

Modern packages use `exports` instead of `main`, which serves different files to CJS and ESM and **blocks** access to internal paths:

```json
{ "exports": { ".": { "import": "./index.mjs", "require": "./index.cjs" } } }
```

---

<a name="cache"></a>
# 4. Module Cache

**A module executes once. Every later `require()` returns the same cached object.**

> **Analogy 🥤 — a vending machine that dispenses the same can.** You insert a coin and get a can. Your colleague inserts a coin and gets… *the same can, already opened.* `require()` doesn't build a fresh module — it hands you the one that already exists.

```js
// config.js
console.log('config loaded');       // prints ONCE, however many requires
module.exports = { db: process.env.DB_URL };
```

The cache is keyed by **resolved absolute path**, so `require('./config')` and `require('../src/config')` from different files hit the same entry.

## Why it matters: modules are singletons

The standard way to share one instance across an app:

```js
// db.js — created ONCE, shared by every file that requires it
const pool = mysql.createPool({ connectionLimit: 10 });
module.exports = pool;
```

Every route, service and job gets **the same pool** — not 40 separate pools. Same trick for a logger, a Redis client, or config.

**The flip side:** top-level side effects also run once, **the first time the module is required** — which might be from anywhere. A module that connects to a database at the top level makes startup order implicit and tests painful.

```js
delete require.cache[require.resolve('./config')];   // force a reload
```
> ⚠️ Fine in test setups and hot-reload tooling. **In application code it's a bug factory** — anything still holding the old copy now has a different object than everyone else. ESM's cache can't be cleared at all.

---

<a name="circular"></a>
# 5. ⭐ Circular Dependencies

`a.js` requires `b.js`, and `b.js` requires `a.js`.

> **Analogy 🗣️ — interrupting someone mid-sentence.** You start explaining something and halfway through ask a colleague for input. They turn around and ask *you* to explain the thing you're currently halfway through explaining. They don't get an error — **they get whatever you've managed to say so far.** Which might be nothing.

**Node doesn't throw. It hands over a partially-built module** — far more dangerous than a crash.

```js
// a.js                                  // b.js
console.log('a starting');               console.log('b starting');
exports.done = false;                    exports.done = false;
const b = require('./b');                const a = require('./a');   // ← half-built!
console.log('in a, b.done =', b.done);   console.log('in b, a.done =', a.done);
exports.done = true;                     exports.done = true;
console.log('a done');                   console.log('b done');
```
```
$ node a.js
a starting
b starting
in b, a.done = false     ← ⚠️ a snapshot of a's INCOMPLETE exports
b done
in a, b.done = true
a done
```

**What happened:** when `b` required `a`, Node saw `a` was already loading. Rather than re-run it (infinite loop), it returned `a`'s exports **as they existed at that moment** — incomplete.

## How it shows up in real code

```js
// models/user.js                        // models/post.js
const Post = require('./post');          const User = require('./user');   // may be {}
class User {                             class Post {
  getPosts() { return Post.findByUser(this.id); }   getAuthor() { return User.findById(...); }
}                                        }
module.exports = User;                   module.exports = Post;
```

**The symptoms are nasty:**
- `TypeError: X is not a constructor` / `Cannot read property of undefined`
- **It depends on which file loaded first** — so it breaks in production but passes in tests, or breaks only after someone reorders imports
- **In ESM it fails differently:** hoisting means functions usually work, but touching a `const` too early throws a **TDZ `ReferenceError`** ([Part 1 §5](01-javascript-execution-model.md))

## Four fixes, best first

**① Extract the shared piece** — usually the real fix. If A and B both need something, it belongs in C.
```
   a ──▶ b               a ──┐
   ▲     │      →            ├──▶ shared
   └─────┘               b ──┘
```

**② Move the `require` inside the function** — by the time it's *called*, both modules have finished loading.
```js
getAuthor() {
  const User = require('./user');   // lazy, resolved at call time ✅
  return User.findById(this.userId);
}
```

**③ Dependency injection** — pass the dependency in rather than importing it. Better design, trivially testable.

**④ A registry** — how Mongoose does it: models register centrally (`mongoose.model('User')`) and look each other up by name, so the files never import each other.

> **Detect them in CI:** `madge --circular src/`

---

<a name="interview"></a>
# 6. Interview Questions & Answers

### Q1. How does Node resolve `require()`?
> "Three steps. **First**, is it a core module like `fs` or `path`? Those always win — you can't shadow them with a local file. **Second**, does it start with `./`, `../` or `/`? Then it's a path: Node tries the exact file, then appends `.js`, `.json`, `.node`; if it's a directory it reads `package.json`'s `main` or `exports`, falling back to `index.js`. **Third**, anything else is a package name, so Node walks **up** the directory tree checking `node_modules` at each level until the filesystem root, then throws `MODULE_NOT_FOUND`.
>
> That walk-up is why `node_modules` nests — two packages needing different versions each find their own on the way up. And the result is cached by resolved absolute path, so a file only ever executes once."

### Q2. What problems do circular dependencies create?
> "Node doesn't error — it returns a **partially-initialized module**, which is worse, because you get `undefined` at runtime instead of a clear failure at load time. Classic symptom: `X is not a constructor`.
>
> The dangerous part is that it **depends on which file loads first**, so the same cycle can pass in tests and break in production, or break only after someone reorders imports. In ESM it usually surfaces as a TDZ `ReferenceError` instead.
>
> A cycle is normally a design smell — two modules needing each other's internals usually hide a third concept that should be extracted. Quick fixes: move the `require` inside the function so it resolves lazily, or use dependency injection. `madge --circular` catches them in CI."

### Q3. What's the difference between `exports` and `module.exports`?
> "`exports` is a local variable that starts out pointing at `module.exports`, and Node returns `module.exports`. So **mutating works** (`exports.foo = 1`) but **reassigning breaks silently** (`exports = {...}`) — you've only repointed your local variable. I assign to `module.exports` to avoid the ambiguity entirely."

### Q4. Why can't you `require()` an ES module?
> "`require` is **synchronous** and ESM loading is **asynchronous** — a sync function can't wait for async work. Historically that throws `ERR_REQUIRE_ESM`; recent Node relaxed it for modules without top-level `await`. The portable answer is dynamic `import()`, which returns a promise and works from CJS. The reverse — ESM importing CJS — has always worked."

### Q5. Are Node modules singletons?
> "Yes — per resolved path, per process. That's why a connection pool or logger at module scope is shared app-wide. **Two caveats:** the same package installed at two different paths in `node_modules` is two separate instances, which breaks `instanceof` checks across the duplicates. And under `cluster`, each process has its own cache — 8 workers means 8 pools, not one shared."

### Q6. `require` is synchronous — doesn't that block the event loop?
> "It does — it's a blocking file read. But it happens at **startup**, before the server accepts traffic, so nothing is waiting on it. Same reasoning as `readFileSync` being fine at boot ([Part 2](02-nodejs-internals.md)). Where it *does* matter is a `require()` inside a request handler or a lazy require on a hot path — that's a synchronous disk read on the critical path. Only the first call pays; after that it's a cache hit."

### Q7. Why can ESM be tree-shaken but not CommonJS?
> "Because ESM imports are **static** — the bundler knows every import and export at build time and can prove which are unused. `require()` is a function call that can take a computed path or sit inside an `if`, so nothing is knowable until runtime. That same static structure is why ESM handles circular dependencies more gracefully — the graph is built before any code runs."

### Q8. What does `"type": "module"` actually change?
> "It makes Node treat every `.js` file in that package as ESM instead of CommonJS — so `require` and `__dirname` disappear and `import` works. You can override per file with `.cjs` (always CommonJS) and `.mjs` (always ESM). The common failure is adding it to an existing project and having every `require()` break at once."

---

<a name="cheatsheet"></a>
# 7. Cheat Sheet

### CJS vs ESM
```
CommonJS                        ES Modules
require / module.exports        import / export
SYNCHRONOUS                     asynchronous
resolved at RUNTIME (dynamic)   resolved at PARSE TIME (static)
imports are a COPY              imports are LIVE BINDINGS ⭐
__dirname ✅                    import.meta.url
no top-level await              top-level await ✅
no tree-shaking                 tree-shaking ✅

ESM can import CJS ✅   ·   require(ESM) ✗ (sync can't await async)
                             → use dynamic import()
```

### The CJS wrapper — explains everything
```js
(function (exports, require, module, __filename, __dirname) { ...your file... });

→ __dirname/require/module are PARAMETERS, not globals
→ every module has its own scope
→ exports is just a pointer to module.exports:
     exports.x = 1      ✅ mutate
     module.exports = {} ✅ reassign the real one
     exports = {}        ❌ silently broken
```

### Resolution order
```
1. CORE module (fs, path…)          → always wins, can't be shadowed
2. ./ ../ /  → file: X, X.js, X.json, X.node
               dir:  package.json "main"/"exports", then index.js
3. package   → walk UP node_modules to the filesystem root
               → MODULE_NOT_FOUND

⭐ the walk-up is why node_modules nests (different versions per package)
```

### Cache
```
• keyed by RESOLVED ABSOLUTE PATH
• module body executes ONCE → modules are SINGLETONS
  → a pool/logger at module scope is shared app-wide
• top-level side effects also run once, whenever it's FIRST required
• delete require.cache[...] → tests & hot-reload only, never app code
• per process → cluster means 8 workers = 8 caches = 8 pools
```

### Circular dependencies
```
Node does NOT throw → it returns a HALF-BUILT module ⚠️
Symptom: "X is not a constructor" / undefined at runtime
Worst part: depends on WHICH FILE LOADED FIRST
            → passes in tests, breaks in prod
ESM: fails as a TDZ ReferenceError instead

FIXES:  1. extract the shared piece  ⭐ the real fix
        2. require inside the function (lazy)
        3. dependency injection
        4. a registry (Mongoose-style)
DETECT: madge --circular src/
```

---

*— Part 4 of the Node.js notes. Related: [Part 1 — Execution Model](01-javascript-execution-model.md) · [Part 2 — Internals](02-nodejs-internals.md) · [Part 3 — Async](03-asynchronous-programming.md) —*
