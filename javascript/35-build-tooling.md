# JavaScript Study Notes — Part 35

## Build Tooling — Bundlers, Transpiling vs Polyfilling, Tree-Shaking, Code Splitting, Source Maps ⭐⭐⭐☆☆

**Topics:** why we build at all · what a bundler does (Vite, webpack, esbuild, Rollup) · **transpiling vs polyfilling** · browserslist · tree-shaking and what breaks it · code splitting & lazy loading · minification · source maps · cache busting with hashed file names · `<script type="module">` and import maps · reading a bundle-size report.

> **Why this part exists:** at 3–4 years you're expected to know what happens between `npm run build` and the browser — and to fix "the bundle is 4 MB" or "it breaks in Safari 15." Angular CLI, Vite and Next.js hide most of this, but interviews ask what's underneath.

---

## 1. Why build at all?

The code you write isn't the code the browser should receive:

| You write | The browser needs |
|---|---|
| hundreds of small modules, plus `node_modules` | a few files, fetched efficiently |
| TypeScript, JSX, `.vue`/Angular templates, Sass | plain JavaScript and CSS |
| the newest syntax | syntax your users' browsers understand |
| readable code with comments | small, minified files |
| `import './logo.png'` | a real URL to an optimised image |

A **build tool** does these steps and gives you a fast dev server with hot reload.

> **Analogy 📦 — a publishing house.** You write the manuscript in your own style; the publisher edits, translates, removes the drafts, prints and packs it so readers get a clean, compact book.

---

## 2. What a bundler does

1. Starts from your **entry** file (`main.ts`) and follows every `import` to build a **dependency graph**.
2. **Transforms** each file (TypeScript → JS, JSX → JS, Sass → CSS) with loaders/plugins.
3. **Removes unused code** (tree-shaking, §4).
4. **Splits** the result into chunks (§5) and writes files with **hashed names** (§7).
5. **Minifies** everything.

| Tool | Notes |
|---|---|
| **Vite** | the default for new React/Vue/Svelte projects. In dev it serves native ES modules and transforms files on demand (very fast start); for production it bundles with Rollup/Rolldown |
| **webpack** | older, hugely configurable, still in many existing apps |
| **esbuild** | written in Go, extremely fast; used inside other tools (Vite dev, Angular CLI's builder) |
| **Rollup** | great for **libraries**; strong tree-shaking |
| **Angular CLI** | uses esbuild + Vite under the hood in recent versions |
| Turbopack, Rspack, Rolldown | newer Rust-based, faster bundlers |

---

## 3. ⭐ Transpiling vs polyfilling

These two get mixed up all the time. They solve **different** problems:

| | **Transpiling** | **Polyfilling** |
|---|---|---|
| Problem | the browser can't **parse** new **syntax** | the browser is missing a built-in **function/object** |
| Examples | `?.`, `??`, `class` fields, `async/await` (for very old targets) | `Array.prototype.at`, `Promise.allSettled`, `structuredClone`, `Object.groupBy` |
| How it's fixed | **rewrite** your code into older syntax at build time | **add code** at runtime that defines the missing function |
| Tools | Babel, TypeScript, esbuild, SWC | `core-js`, a hand-written polyfill ([Part 19](19-polyfills.md)) |

```js
// TRANSPILING: syntax rewritten
user?.address?.city
// becomes (roughly)
user == null ? void 0 : user.address == null ? void 0 : user.address.city

// POLYFILLING: missing function added
if (!Array.prototype.at) {
  Array.prototype.at = function (i) { i = Math.trunc(i) || 0; return this[i < 0 ? this.length + i : i]; };
}
```

> 🧠 **Remember:** **transpile = new *grammar*, rewritten. Polyfill = new *vocabulary*, added.** A transpiler can't add `structuredClone`; a polyfill can't make old browsers understand `?.`.

**Which browsers?** A **browserslist** setting (in `package.json` or `.browserslistrc`), e.g. `"> 0.5%, last 2 versions, not dead"`, tells Babel/esbuild/autoprefixer what to target. Targeting only modern browsers means less transpiling and smaller bundles.

---

## 4. ⭐ Tree-shaking — and what breaks it

> **Definition:** removing exports that nothing imports, so they never reach the bundle — "shaking the tree so dead leaves fall off."

It only works because **ES module imports are static** — the bundler can see exactly what's used without running the code ([Part 16 §3](16-modules-commonjs-vs-esm.md)).

**What breaks it:**

| Cause | Example | Fix |
|---|---|---|
| **CommonJS** packages | `const _ = require('lodash')` | use ES-module versions (`lodash-es`), or import the specific file |
| **importing everything** | `import * as icons from 'icons'` then using one dynamically | named imports: `import { SearchIcon } from 'icons'` |
| **side effects** at module top level | a file that patches `window` when imported | mark packages `"sideEffects": false` in `package.json` (libraries), keep top-level code pure |
| **barrel files** in big libraries | `import { x } from '@big/lib'` pulls in the whole index | import from deeper paths, or tools that optimise barrels |
| dynamic property access | `utils[name]()` | the bundler must keep everything |

Classic example: `import _ from 'lodash'` adds ~70 KB; `import debounce from 'lodash-es/debounce'` adds ~1 KB.

---

## 5. Code splitting & lazy loading

Don't make users download the admin panel to see the login page.

```js
// dynamic import() → the bundler creates a SEPARATE chunk, loaded only when this runs
button.addEventListener('click', async () => {
  const { openEditor } = await import('./editor.js');
  openEditor();
});
```

Frameworks wrap this: React `lazy(() => import('./AdminPage'))` + `<Suspense>`, Angular `loadComponent: () => import(...)` in routes, Vue `defineAsyncComponent`.

- **Split by route** first — the biggest win.
- Bundlers also put shared `node_modules` code into a **vendor chunk** that changes rarely and stays cached.
- Prefetch likely-next routes (`<link rel="prefetch">` or the framework's preloading) so navigation still feels instant.

---

## 6. Minification and source maps

**Minification:** remove spaces and comments, shorten variable names, drop dead code (`if (false)`), compress — often 60–80% smaller. Plus gzip/brotli compression on the server or CDN.

**Source maps** (`.map` files) map the minified code back to your original files and lines, so a production error says `CheckoutForm.tsx:42`, not `main.8f3a.js:1:28401`.

- Upload source maps to your **error tracker** (Sentry etc.) so stack traces are readable.
- Decide whether to **serve them publicly** — they reveal your original source code. Many teams upload them to the error tracker but don't deploy them to the public server (Vite: `build.sourcemap: 'hidden'`).

---

## 7. Cache busting with hashed file names

Build output looks like `assets/index-3f9a1c.js`. The hash comes from the file's **content**.

- Changed code → new hash → new file name → browsers **must** download it.
- Unchanged → same name → browsers keep their cached copy.

So these files can be cached **forever**: `Cache-Control: public, max-age=31536000, immutable`. Only `index.html` (which lists the current file names) must **not** be cached long (`no-cache`) — otherwise users keep loading old file names. ([nodejs Part 6.5 §7](../nodejs/06.5-production-http-timeouts-keepalive-caching.md).)

A common deploy bug: users with the old `index.html` open request old chunk names that were deleted → "**ChunkLoadError / Failed to fetch dynamically imported module**." Fix: keep old assets around for a while after deploy, and catch the error to reload the page.

---

## 8. Native modules in the browser & import maps

Browsers run ES modules directly — no bundler required for small projects:

```html
<script type="importmap">
  { "imports": { "lodash/": "https://cdn.jsdelivr.net/npm/lodash-es@4.17.21/" } }
</script>
<script type="module">
  import debounce from 'lodash/debounce.js';   // bare name resolved by the import map
</script>
```

Fine for demos and small sites. For real apps, bundlers still win: fewer requests, tree-shaking, minification, TypeScript.

---

## 9. "The bundle is too big" — the checklist

1. **Measure:** `vite-bundle-visualizer` / `rollup-plugin-visualizer`, `webpack-bundle-analyzer`, `source-map-explorer`, or Angular's `ng build --stats-json`. Find the biggest boxes.
2. **Heavy libraries:** replace (Moment → date-fns/dayjs/`Intl`), import parts only, or drop.
3. **Route-level code splitting** (§5); lazy-load heavy widgets (charts, editors, maps).
4. **Fix tree-shaking blockers** (§4) — CommonJS packages, `import *`.
5. **Duplicate copies** of the same library at different versions (`npm ls <pkg>`).
6. **Modern-only build** (browserslist) — less transpiled code and fewer polyfills.
7. **Images/fonts** are often bigger than the JS — compress, use modern formats (WebP/AVIF), subset fonts.
8. **Set a budget** in CI so it can't silently grow again.

---

## Interview Q&A

**Q: What's the difference between transpiling and polyfilling?**
> Transpiling rewrites new **syntax** into older syntax at build time — optional chaining, class fields — because old browsers can't parse it. Polyfilling adds missing **built-in functions** at runtime — `Array.prototype.at`, `structuredClone`. A transpiler can't add a missing function, and a polyfill can't teach a browser new syntax; you often need both, driven by a browserslist target.

**Q: What is tree-shaking, and why doesn't it always work?**
> Removing unused exports from the bundle. It relies on ES modules' static imports. It fails with CommonJS packages, `import *` used dynamically, modules with top-level side effects, and some barrel files — so the fix is ES-module packages, named imports, and `"sideEffects": false` for libraries.

**Q: How would you reduce a large bundle?**
> Measure first with a bundle analyzer. Then route-level code splitting, lazy-loading heavy components, replacing or partially importing big libraries, fixing tree-shaking blockers, removing duplicate dependency versions, targeting modern browsers, and optimising images and fonts. Then add a size budget in CI.

**Q: Why do built files have hashes in their names?**
> The hash is based on content, so a changed file gets a new name and browsers fetch it, while unchanged files keep their cached version. That lets assets be cached for a year as immutable. `index.html` must not be cached long, since it points to the current names.

**Q: What are source maps, and should they be public?**
> Files that map minified output back to the original source so errors and the debugger show real file names and lines. Upload them to the error tracker; many teams avoid serving them publicly because they expose the source.

---

## Follow-ups (challenge questions)

- *Failure mode:* after a deploy, some users get a blank page with "Failed to fetch dynamically imported module." What happened, and give two fixes.
- *Consistency:* the app works in Chrome but `structuredClone is not defined` appears in an older Safari, even though Babel is configured. Why didn't Babel fix it?

---

## Cheat Sheet

```
BUILD = graph from entry → transform (TS/JSX/Sass) → tree-shake → split → hash → minify
tools: Vite (default new apps) · webpack (legacy, configurable) · esbuild (fast core) · Rollup (libraries)

TRANSPILE = new SYNTAX rewritten (?. ?? class fields) — Babel/TS/esbuild/SWC
POLYFILL  = missing FUNCTION added (at, structuredClone, groupBy) — core-js
"grammar rewritten vs vocabulary added" · targets via browserslist

TREE-SHAKING needs static ESM · broken by: CommonJS, import *, side effects, barrels, obj[name]
  lodash → lodash-es/debounce · "sideEffects": false

CODE SPLITTING: import() → separate chunk · React.lazy / Angular loadComponent · split by ROUTE first
MINIFY + gzip/brotli · SOURCE MAPS → error tracker, maybe not public ('hidden')
HASHED NAMES → cache assets forever (immutable) · index.html no-cache
  old index.html + deleted chunks → ChunkLoadError → keep old assets, reload on error
import maps + <script type="module"> = no-bundler option for small sites

BIG BUNDLE: measure (visualizer) → split routes → lazy widgets → swap heavy libs
            → fix tree-shaking → dedupe versions → modern target → images/fonts → CI budget
```

---

**Previous:** [Part 34 — Async Iteration](34-async-iteration.md) · **Back to:** [00 — Roadmap](00-ROADMAP.md)
