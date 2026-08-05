# React Study Notes — Part 9

## Performance Optimization (Memoization, Lazy Loading, Code Splitting, Bundle Optimization, Asset Optimization)

> **Format:** Explanation-led notes. Each technique is explained in prose — what it is, what problem it solves, why it works, and what it costs — with code only where a snippet carries a point words can't. Heavy emphasis on the interview answers.
>
> **Roadmap:** the roadmap's "Part 7 — Performance Optimization".
>
> **Continues:** [Part 7 — Hooks](07-hooks.md) · [Part 8 — Rendering Internals](08-rendering-internals-and-vdom.md).

---

## Table of Contents

0. [First: three different kinds of "slow"](#slow)
1. [The foundation: referential equality](#references)
2. [React.memo](#memo)
3. [useMemo](#usememo)
4. [useCallback](#usecallback)
5. [Why lazy loading exists — the bundle problem](#bundle-problem)
6. [Code Splitting](#splitting)
7. [React.lazy & Suspense](#lazy)
8. [Bundle Optimization](#bundle-opt)
9. [Asset Optimization](#assets)
10. [Anti-patterns](#antipatterns)
11. [Interview questions & answers](#interview)
12. [Quick revision cheat sheet](#cheatsheet)

---

<a name="slow"></a>
# 0. First: three different kinds of "slow"

Before any technique, the single most valuable habit in this entire topic is refusing to accept "the app is slow" as a problem statement. That sentence describes three unrelated failures with three unrelated fixes, and choosing the wrong one means spending a week making no measurable difference.

**Slow to load** means the user stares at a blank screen after clicking your link. Nothing has rendered because the JavaScript hasn't finished arriving and compiling. Nothing about your components or your hooks affects this — it's a question of how many bytes you shipped. The fixes are code splitting, lazy loading, and bundle and asset optimization.

**Slow to respond** means the app is on screen but feels sticky. Typing lags behind the keyboard, clicks take a beat to register. This is expensive work occupying the main thread when it should be free to handle input. The fixes are memoization, transitions, and virtualization.

**Slow to paint** means the browser itself is struggling — thousands of DOM nodes, layout thrashing, expensive CSS. React may be doing almost nothing while the browser recalculates geometry. The fixes are reducing DOM node count, virtualizing long lists, and simplifying styles.

These have almost nothing to do with each other. Memoizing a component does not shrink your bundle. Code splitting does not stop your list from stuttering. Diagnosing which one you have is the actual first step.

## Why "measure first" is a rule, not advice

Every technique in this part has a real cost. Memoization spends memory and adds a comparison on every render. Code splitting adds a network round-trip and a loading state the user has to look at. Lazy loading an image delays its arrival. Applied blindly, each of these makes the application *worse* while giving you the satisfying feeling of having optimized something.

Two tools give you the actual answer. **The React DevTools Profiler** records an interaction and shows which components rendered, how long each took, and — the most useful part — *why* each one rendered: props changed, hooks changed, or the parent rendered. You're looking for a component that renders on every keystroke but shouldn't, or a single component eating 50ms, or a whole subtree re-rendering when only a sibling's data changed.

**A bundle analyzer** — `webpack-bundle-analyzer`, or `rollup-plugin-visualizer` for Vite — draws your bundle as a treemap. This is almost always a shock the first time. One date library, one chart package, or one icon set routinely turns out to be 40% of the total, and it's frequently something nobody remembers adding.

> **Interview line:** *"I profile before optimizing. Premature memoization adds comparison cost and memory for no benefit and makes the code noisier. I use the React Profiler to find components that render often or render slowly, and a bundle analyzer to find what's inflating the initial download. And I'd first establish which problem I actually have — slow load is a bundle issue, slow interaction is a render issue, and they have nothing to do with each other."*

---

<a name="references"></a>
# 1. The foundation: referential equality

Everything in the memoization section rests on one JavaScript fact, and understanding it makes all three APIs obvious instead of arbitrary.

React compares values with `Object.is`, which for objects means comparing **identity** — whether two references point to the same thing in memory — not contents. Two objects with identical properties are not equal. Two arrays with identical elements are not equal. Two functions with identical bodies are not equal.

```js
{a: 1} === {a: 1}          // false — different objects
```

Now combine that with how components work. **A component function runs completely on every render.** Every object literal, array literal, and arrow function inside its body is *constructed again* each time. They contain the same data, but they are new values.

The consequence is that any prop whose value is written inline in JSX is, from React's perspective, different on every single render — even when nothing has changed. That's the mechanism behind every "why isn't my memoization working" question, and it's why `useMemo` and `useCallback` exist at all. They are not primarily about avoiding expensive computation; they are about **preserving identity across renders** so that comparisons downstream can succeed.

Hold onto that framing: memoization in React is mostly an identity-stability tool that happens to also cache values.

---

<a name="memo"></a>
# 2. React.memo

> **Definition:** a higher-order component that memoizes a component, skipping its re-render when the new props are shallowly equal to the previous props.

## The behaviour it changes

From [Part 8](08-rendering-internals-and-vdom.md): when a component re-renders, **all of its children re-render**, whether or not their props changed. React does not check first. This surprises people, and it's a deliberate trade — comparing props costs something too, and re-running a function is usually cheaper than checking whether you need to.

Critically, this default is usually harmless. A child re-renders, produces an element tree identical to the previous one, the diff finds no differences, and **zero DOM operations happen**. The entire cost was one function call. This is why "unnecessary re-renders" are far less alarming than the phrase suggests, and why chasing them without profiling is wasted effort.

The default stops being harmless when the child is genuinely expensive. If a chart component takes 250ms to compute its layout, and it re-renders every time an unrelated counter in its parent ticks, the user feels every click stick.

`React.memo` opts that component out of the default. Before re-rendering it, React shallowly compares the new props to the previous ones; if they're all equal, it skips the render entirely — **and skips everything below it too**. That last detail matters when deciding *where* to apply memo: one memo high in an expensive subtree can be worth more than ten memos on leaves.

## Why it so often does nothing

This is the most-asked question about `React.memo`, and the answer is the referential equality problem from §1.

```jsx
<MemoChild style={{ color: "red" }} onSave={() => save()} />
```

Both of those props are constructed fresh on every render of the parent. The comparison therefore fails every time, the memoized component re-renders anyway, and you have added a comparison step for no benefit — a strict net loss. The component *looks* optimized, and DevTools will happily show it re-rendering constantly.

The fix is to stabilize the references: hoist constants to module scope so they're created once, and wrap functions in `useCallback` and computed objects in `useMemo`. Which is to say: **`React.memo` almost always requires `useMemo` and `useCallback` alongside it to work at all.** They are three parts of one mechanism, not three independent tools.

A specific case catches nearly everyone: **memoizing a component that takes `children`**. `children` is a prop, and the JSX you nest inside creates a new element object on every render of the parent. So a memoized wrapper component sees changed props every time, unconditionally. Memoizing wrappers is essentially always pointless.

## The custom comparator, and why to avoid it

`React.memo` accepts a second argument — your own comparison function. Two things to know.

First, **the return value is inverted relative to `shouldComponentUpdate`**. Returning `true` means "these props are equal, skip the render." In the class method, `true` meant "yes, do update." This catches people constantly.

Second, and more importantly: a wrong comparator produces a **stale UI**, which is the worst category of bug to debug. The data in your application is correct; only the screen is wrong; and nothing throws. If you find yourself needing a deep comparison to make memo work, the real problem is usually the shape of your props, not the absence of a comparator.

## The alternative worth trying first: composition

Before reaching for memo, it's worth asking whether restructuring solves the problem for free — because often it does, and the result is simpler rather than more complex.

The trick relies on the fact that elements are just objects. If an expensive component's element is created in a *grandparent* that isn't re-rendering, and passed down as `children`, then when the middle component re-renders it receives **the identical element object it had before**. React's reconciler sees the same reference and skips that subtree — no memo, no comparison, no `useCallback` plumbing.

```jsx
// the expensive child's element is created here, in a component that isn't re-rendering
<Parent><ExpensiveChild /></Parent>

// Parent holds the state and renders {children} — the same object reference every time
```

**Moving where an element is created moves what re-renders.** This is a genuinely underused technique, and mentioning it in an interview signals that you understand *why* memo works rather than just that it exists.

## When to use it

Use `React.memo` when the component is measurably expensive, when it re-renders frequently with genuinely unchanged props, when its props are primitives or stable references, and ideally when it sits at the top of a large subtree.

Don't use it on small components, where the comparison costs more than the render. Don't use it when the props change every render anyway. Don't use it on components that take `children`. And don't apply it everywhere by default — that's a measurable slowdown dressed as an optimization.

---

<a name="usememo"></a>
# 3. useMemo

> **Definition:** a Hook that caches the result of a calculation between re-renders, recomputing only when its dependencies change.

`useMemo` has two genuinely distinct uses, and conflating them is why people misapply it.

## Use 1 — skipping expensive computation

The obvious use. If a component sorts ten thousand items during render, that sort re-runs whenever *any* state in the component changes — including a hover flag that has nothing to do with the list. Wrapping it in `useMemo` keyed on the list means the sort runs only when the list actually changes.

The hard question is **what counts as expensive**, and the honest answer is: much less than people assume. Modern JavaScript engines are extremely fast. Filtering fifty rows, concatenating strings, formatting a date, summing an array — all effectively free. The threshold is somewhere around sorting or transforming thousands of items, complex regular expressions over large strings, parsing, or anything the Profiler actually shows as more than a millisecond or two. Below that, `useMemo` costs more than it saves.

## Use 2 — reference stability

This is the more common and more important use, and it has nothing to do with computation cost. Building a two-key object is free; what matters is that the **identity** stays stable, so a memoized child's comparison succeeds, or an effect's dependency array stops firing every render.

The clearest example is a Context provider's value. An inline object as `value` is a new reference every render, so **every consumer of that context re-renders every time the provider does** — regardless of whether anything they use changed. Wrapping it in `useMemo` is the difference between Context being usable and Context being a performance disaster.

## The cost, and the caveat

Each `useMemo` stores a function, a dependency array, and a result, then compares dependencies on every render. That's not free. For trivial work you're paying more than you save, and you've also added a dependency array that can silently go stale — an incomplete one produces the same class of bug as an incomplete `useEffect` dependency array.

One further caveat matters for correctness, not performance: **`useMemo` is a hint, not a guarantee.** React reserves the right to discard cached values — for example, to free memory. Your code must remain correct if the computation runs again. Memoization may only affect performance; it must never affect behaviour. That rules out using it for anything with side effects or for caching something you rely on being identical.

---

<a name="usecallback"></a>
# 4. useCallback

> **Definition:** a Hook that caches a function definition between re-renders, returning the same reference until its dependencies change.

The first thing to know is that `useCallback` is not a separate mechanism — `useCallback(fn, deps)` is exactly `useMemo(() => fn, deps)`. It exists purely because passing functions as props is so common that the shorthand earns its place.

## The fact that governs its use

**`useCallback` does nothing for performance on its own.** This is the most misunderstood point in React performance work, and it's worth being precise about why.

The hook doesn't avoid *creating* the function — the arrow expression is still evaluated on every render, allocating a new function object. What `useCallback` changes is which reference it **returns**: if the dependencies match, it hands back the previous one and discards the new one.

That is only useful if something downstream **compares** the reference. If the receiving child isn't wrapped in `React.memo`, it re-renders regardless. If the function isn't in a dependency array, nothing is comparing it. In those cases you've added storage and a comparison for zero benefit.

```
useCallback + React.memo child      ✅ works — the comparison now succeeds
useCallback + effect dependency     ✅ works — stops the effect re-running
useCallback + custom hook dep       ✅ works
useCallback + a plain DOM <button>  ❌ pure overhead — nothing compares props
useCallback + a normal child        ❌ pure overhead — it re-renders anyway
```

**Both halves of the optimization are required.** Wrapping every handler "for performance" makes the application measurably slower and the code noisier, which is a common enough habit that interviewers ask about it specifically.

## The correctness hazard

Because `useCallback` has a dependency array, it has the same stale-closure failure mode as `useEffect`. A callback that reads `text` but declares `[]` as its dependencies captures `text` at its initial value and keeps using it forever. The function looks correct in isolation; the bug appears as "saving works but always saves the wrong thing."

The neatest escape, where applicable, is the functional state update — `setCount(c => c + 1)` reads nothing from the enclosing scope, so the dependency array can honestly be empty.

Finally, `useCallback` is never needed for `useState`'s setter or `useReducer`'s `dispatch` — both already have stable identities that React guarantees.

> **🆕 Looking ahead:** the **React Compiler** (React 19) applies these optimizations automatically at build time, which will make most manual `useMemo` and `useCallback` unnecessary. Worth mentioning in an interview as awareness of where things are heading; don't assume any given project has it enabled.

---

<a name="bundle-problem"></a>
# 5. Why lazy loading exists — the bundle problem

Your build tool starts at your entry file, follows every `import`, and concatenates the entire reachable graph into one JavaScript file. That's a sensible default and it works fine until an application grows — at which point every user downloads everything the application can *possibly* do before they can do anything at all.

Concretely: someone visits your homepage and downloads the admin panel, the charting library used on one dashboard, the rich text editor used inside one modal, and the PDF generator behind one button. They will likely never trigger any of it. On a mobile connection that's several seconds of blank screen before React has even started.

## The cost people forget

Download time is the obvious cost, and it's the one everyone optimizes for. But there's a second cost that's often larger and rarely discussed: **the JavaScript engine must parse and compile every byte before any of it can run.** That's CPU work, not network work, so a fast connection doesn't help. On a mid-range Android phone — which is a large share of real traffic — parse and compile time frequently exceeds download time.

This is why bundle size matters even to users on fibre, and why "it loads fine on my machine" is not evidence of anything. A developer laptop on office wifi is close to the best case in existence.

## What splitting achieves

Splitting doesn't delete code. It rearranges *when* the code arrives — a small initial bundle containing what's needed to render the first screen, and separate chunks fetched as the user navigates or interacts. A homepage that took three seconds can take six hundred milliseconds, with the admin panel arriving only for administrators and the editor arriving only when someone clicks Edit.

---

<a name="splitting"></a>
# 6. Code Splitting

> **Definition:** splitting your JavaScript bundle into multiple smaller files ("chunks") loaded on demand, so users download only the code required for what they're currently doing.

Code splitting is fundamentally a **bundler** capability, not a React one. React's `lazy` and `Suspense` are the glue that makes it ergonomic inside a component tree, but the actual splitting is done by webpack, Vite, or Rollup.

## The primitive underneath: dynamic import

Everything rests on one JavaScript language feature. A static `import` is hoisted and resolved at build time, so its target is always part of the bundle. A **dynamic** `import()` is an expression that returns a promise, and the bundler treats it as a **split point**: it cuts that module and its dependencies into a separate chunk file, and leaves behind code that fetches that file over the network when the expression evaluates.

```js
const { generatePDF } = await import("./pdfGenerator");   // 300 KB, fetched now
```

The PDF library is not in your main bundle at all. It downloads the first time someone actually needs it, and the browser caches it thereafter. This is plain JavaScript and works with no React involved — which is worth remembering, because splitting a *library* out of a handler is often the easiest win available.

## Route splitting — do this first

Routes are the natural boundary, because a user is on exactly one page at a time and pages rarely share much beyond shared components. Converting static page imports into lazy ones is close to mechanical, and the payoff is disproportionate: **a typical result is a 40–70% reduction in initial bundle size for perhaps twenty minutes of work.**

Once split, visiting the homepage downloads the main bundle plus the home chunk. Navigating to settings fetches the settings chunk — typically around a hundred milliseconds, then cached permanently. An admin panel a normal user never visits is never downloaded at all.

If you take one thing from this entire part, it's this.

## Component splitting — for heavy, conditional UI

The second tier is components that are large and **not visible immediately**. The guiding question is whether the code is needed for the first paint. Modals and dialogs are hidden until opened. Rich text editors and code editors are enormous and used rarely. Charts, maps, and date pickers all carry heavy dependencies. PDF and Excel export sits behind one button. Admin sections are seen by a small fraction of users. Advanced-settings panels are collapsed by default.

Each of those is code the majority of users will never execute, sitting in the bundle they must download before seeing anything.

The bad candidates are equally worth naming. Splitting something **above the fold** replaces instant rendering with a spinner — strictly worse. Splitting a **small component** costs an HTTP round-trip to save a couple of kilobytes, which is a net loss. Splitting something used **on every page** just means fetching it immediately every time, with extra ceremony.

> **The rule of thumb: split at boundaries where the user makes a decision** — navigating, opening a modal, expanding a panel. The network request then hides behind the user's intent and is never noticed.

---

<a name="lazy"></a>
# 7. React.lazy & Suspense

> **`React.lazy`** — a function that takes a dynamic import and returns a component loaded on first render instead of at bundle time.
> **`Suspense`** — a component that renders a fallback UI while any lazy component beneath it is still loading.

## How it actually works

The mechanism is more interesting than the API suggests. When React renders a lazy component whose module hasn't loaded yet, the component **throws the pending promise**. React catches it, walks up the tree to find the nearest `Suspense` boundary, and renders that boundary's fallback instead. When the promise resolves, React re-renders and the real component appears.

It's genuinely exception propagation — the same mechanism error boundaries use, which is why both require an *ancestor* rather than a sibling or a prop. Knowing this explains two otherwise arbitrary-seeming rules: why a `Suspense` ancestor is mandatory, and why the boundary's *placement* determines what the user sees.

## The three rules

**The module needs a default export**, because `lazy` expects the resolved module's `default` to be the component. Named exports need a one-line mapping in the `.then()`.

**The `lazy()` call must live at module scope.** Inside a component it runs on every render, producing a new component type each time, so React destroys and remounts the subtree constantly — state lost, effects re-run, data refetched. This is the same reconciliation rule that makes calling a HOC during render a bug, and it's worth recognising as one shared principle rather than two separate gotchas.

**Every lazy component needs a `Suspense` above it**, or React throws.

## Placement and fallback design

Where you put the boundary decides the user's experience. One boundary wrapping the whole application means the entire UI — header, navigation, footer — disappears and is replaced by a spinner on every navigation. Placing it around just the content region keeps the shell stable and swaps only the part that's actually changing, which feels dramatically better for the same load time.

The fallback itself matters too. A small spinner in place of a large component means content **jumps** into place when it arrives, causing layout shift. A skeleton matching the eventual layout reserves the right space and, consistently in research, *feels* faster than a spinner even when the duration is identical.

## The failure case people forget

`Suspense` handles *pending*. It does not handle *failed*. A chunk request can fail on a flaky network — and, very commonly, because **you deployed while the user had the page open**. Your new build has new content-hashed filenames; the chunk the open tab tries to fetch no longer exists on the server; the request 404s.

Without an error boundary above the `Suspense`, that user gets a blank screen and no explanation. This is routinely omitted, and it's a good thing to raise unprompted in an interview because it demonstrates production experience rather than tutorial knowledge.

## Preloading — removing the delay lazy loading introduces

The honest downside of lazy loading is that the user waits at the moment they act. You can usually erase that entirely by starting the fetch on **intent** rather than on render — calling the import function when the user hovers or focuses the link that will need it.

The gap between hovering a link and clicking it is typically 100–300 milliseconds, which is usually enough to complete the fetch. The navigation then feels instant, and you kept the smaller initial bundle. Modern routers — React Router's data APIs, Next.js's `<Link>` — do this automatically.

One broader note: **`Suspense` is not only for lazy loading.** It's a general mechanism for "this subtree isn't ready yet," also used by data-fetching libraries and streaming server rendering. `React.lazy` is simply its most common application.

---

<a name="bundle-opt"></a>
# 8. Bundle Optimization

Code splitting decides *when* code arrives. Bundle optimization decides *how much code exists in the first place*.

## Tree Shaking

> **Definition:** the build-time elimination of exported code that is never imported anywhere in your application.

The name is a good metaphor: the module graph is a tree, and unreachable exports are shaken out of it. If you import one function from a forty-function utility module, only that function should ship.

### Why it's possible at all — and when it isn't

Tree shaking depends entirely on **ES Modules**, and specifically on the property that ESM is **statically analysable**. Imports are hoisted, cannot be conditional, and cannot be computed. That means a bundler can determine, without running anything, exactly which exports are reachable — and delete the rest with confidence.

**CommonJS destroys this guarantee.** `require` is an ordinary function call executed at runtime; it can be conditional, its argument can be a computed string, and `module.exports` can be reassigned based on runtime conditions. A bundler cannot prove what's unused, so it must keep everything.

The practical consequence is worth stating plainly: **if a dependency ships only a CommonJS build, none of it can be tree-shaken.** This is why `lodash` (CJS) is a notorious offender while `lodash-es` is fine, and why checking whether a package ships ESM is a reasonable input to choosing it.

### The `sideEffects` flag

Even with ESM there's an ambiguity. If a module isn't imported by name, can it safely be deleted? Not necessarily — the file might do something merely by being loaded. A polyfill that patches a prototype has no exports at all but must still run. An imported CSS file produces no binding but removing it removes the styling.

These are **side effects**, and bundlers conservatively assume the worst. The `sideEffects` field in `package.json` is how a package tells the bundler otherwise — either "nothing here has side effects, shake freely" or an explicit list of files that must be preserved. Library authors who omit it get poor tree shaking, and their users pay for it silently.

### What actually breaks it in practice

Three mistakes account for most failures, and all three are worth recognising on sight.

**Namespace imports.** Writing `import * as _ from "lodash"` references the entire module object, so the bundler cannot narrow it to the two functions you called.

**CommonJS-only packages**, as above.

**Barrel files.** An `index.js` that re-exports everything with `export *` is enormously convenient and quietly expensive. Importing one small component from it can drag in everything the barrel touches — including, in a real case, a charting library and a rich text editor — because eliminating the rest requires side-effect analysis to succeed cleanly through every re-exported module, and it often doesn't. Icon libraries are the most common victim: importing two named icons can pull in a thousand.

The general lesson is to **verify rather than assume**. Run the analyzer and look specifically for libraries you believed were shaken.

## Dead Code Elimination

> **Definition:** the removal of code that can never execute — unreachable branches, unused variables, and conditions the compiler can prove are constant.

Tree shaking removes exports nobody imports, working *across* the module graph. Dead code elimination removes statements that can never run *within* a module. Related, both at build time, but distinct.

### The case that matters most

The important application is `process.env.NODE_ENV`, and it explains something you use every day without noticing.

React's source contains thousands of lines of development-only code — the warning about missing `key` props, prop-type validation, hook-order checks, helpful error messages. All of it sits inside `if (process.env.NODE_ENV !== "production")` blocks.

At build time the bundler **textually replaces** that expression with the literal string `"production"`. The condition becomes `"production" !== "production"`, which the minifier folds to `false`, and a branch guarded by `false` is deleted entirely. The warnings are gone — not skipped at runtime, but absent from the file.

**React's production build is roughly half the size of its development build purely because of this.** It's also why shipping a development build to production is such a costly mistake: you send all the warning machinery *and* it executes on every render.

The same mechanism powers build-time feature flags. A flag that's off doesn't cost a runtime check — the entire feature disappears from the bundle.

### Minification and compression

Distinct from both, and worth understanding as a separate layer. Minification renames variables, strips whitespace, and shortens syntax, typically cutting 60–70%. Compression (gzip or brotli) then removes another ~70% of what remains.

A megabyte of source might be 350 KB minified and 100 KB over the wire. **Always compare compressed transfer size**, not raw file size — judging dependencies by their unminified weight will point you at the wrong culprit.

## The bundlers

> **Bundler** — a tool that resolves your module graph, transforms each file, and produces optimized output for the browser.

Interviewers ask about these to see whether you understand your own toolchain rather than treating it as magic.

### Webpack

The long-time industry standard: enormously configurable, plugin-driven, written in JavaScript. "Webpack at interview level" means being able to explain five concepts.

**Entry** is where the module graph starts. **Output** is where bundles are written, conventionally with a content hash in the filename so that changing one file invalidates only that chunk's cache. **Loaders** transform non-JavaScript files — the framing that makes this click is that *Webpack only understands JavaScript, and loaders teach it everything else*: CSS, images, TypeScript, SVG. **Plugins** hook into the whole build lifecycle rather than individual files. **Mode** — development or production — where production automatically enables minification, tree shaking, and the `NODE_ENV` replacement described above.

Two more terms are worth having: **SplitChunksPlugin**, which automatically extracts shared code into common chunks such as a vendors bundle, and **Hot Module Replacement**, which swaps a changed module into the running application without a full reload, preserving state.

Webpack lost ground for one reason: it bundles the entire application before the dev server can serve anything, in JavaScript, single-threaded. On a large codebase that's 30–90 seconds to start and multi-second hot reloads. It remains dominant in enterprise and legacy codebases — Create React App used it — and remains the most capable option when a build is genuinely unusual.

### Vite

The modern default, and the interesting part is that it uses **two different strategies** for development and production.

**In development it doesn't bundle at all.** Vite serves `index.html` immediately, and when the browser requests a module, Vite transforms just that one file — using esbuild, in about a millisecond — and returns it. The browser then requests that file's imports, and so on. Because browsers support ES Modules natively, no bundling step is needed to run the app.

The consequence is that **cold start becomes nearly independent of project size**. A ten-file app and a two-thousand-file app both start in a few hundred milliseconds, because Vite only ever compiles what the browser actually asks for. Hot updates are near-instant for the same reason — one file is re-transformed, not a graph rebuilt.

Two supporting details complete the picture. Dependencies in `node_modules` are **pre-bundled once with esbuild**, which converts CommonJS packages to ESM and collapses what would otherwise be hundreds of tiny module requests. And **production builds use Rollup**, because shipping unbundled ESM to real users would mean hundreds of HTTP round-trips.

> **The one-liner worth memorising: Vite is native ESM plus esbuild in development, and Rollup in production.**

### Rollup

The ESM-first bundler, and the standard choice for building **libraries** rather than applications. Its output is flat and clean with minimal wrapper code, where Webpack emits a module runtime and registry — fine overhead for an application, unnecessary weight in a published package. Rollup also pioneered tree shaking and remains excellent at it. Most application developers encounter it indirectly, through Vite.

### esbuild

A bundler and transformer written in **Go**, roughly 10–100× faster than JavaScript-based tooling. The speed comes from being compiled to native code rather than interpreted, parallelising across all CPU cores, and being designed from the start to minimise AST passes and intermediate representations.

You meet it mainly through Vite, which uses it for dependency pre-bundling and for stripping TypeScript types.

One caveat is worth knowing because it surprises people migrating from `ts-loader`: **esbuild does not type-check TypeScript.** It deletes the annotations and moves on. Type errors are caught by your editor and by `tsc --noEmit` in CI, not by the build — which is a deliberate trade of safety-at-build-time for speed.

### The comparison

| | **Webpack** | **Vite** | **Rollup** | **esbuild** |
|---|---|---|---|---|
| Written in | JavaScript | JS (uses esbuild + Rollup) | JavaScript | Go |
| Dev speed | slow | very fast | n/a | fastest |
| Dev strategy | bundle everything first | native ESM, on demand | n/a | bundle |
| Best for | complex apps, legacy | modern apps | **libraries** | speed-critical steps |
| Config | large, flexible | minimal | moderate | minimal |
| Ecosystem | biggest | growing fast | mature | smallest |

> **Also worth knowing:** **SWC** (Rust) is the Babel and Terser replacement used by Next.js, and **Turbopack** and **Rolldown** are Rust-based bundlers being built to succeed Webpack and Rollup. The whole toolchain is migrating from JavaScript to compiled languages for speed, which is a useful trend to be able to name.

---

<a name="assets"></a>
# 9. Asset Optimization

Here is the fact that reframes everything above: **on a typical web page, JavaScript is not the largest download. Images are.**

Images are roughly half of median page weight; JavaScript is around a fifth; fonts under a tenth. You can spend a week shaving two hundred kilobytes off a bundle, or ten minutes converting one hero image to WebP and save four hundred. Opening the Network tab before choosing where to spend effort is the same discipline as profiling before memoizing.

## Images

### Format

Modern formats are substantially better than JPEG at equal visual quality — WebP by roughly 30%, AVIF by roughly 50%. Both have excellent browser support now. The `<picture>` element lets you offer several and let the browser take the first it understands, falling back to JPEG for anything ancient. A single hero image routinely drops from 800 KB to 150 KB on this change alone.

### Dimensions — usually the bigger win

The most common waste in real applications isn't format, it's size. A photo straight from a phone camera is 4000×3000 pixels; displayed in a 400-pixel-wide card, the browser downloads all twelve megapixels and scales them down. The user paid for 95% of that data for nothing.

`srcset` declares which versions exist and how wide each actually is; `sizes` tells the browser how wide the image will *display* at various viewport widths. The browser combines those with the device pixel ratio and downloads exactly one appropriate file — a small one on a phone, a large one on a Retina desktop.

### Reserving space

Setting `width` and `height` attributes is not about display size — CSS still controls that. It gives the browser the **aspect ratio** so it can reserve a correctly-sized box before the image arrives.

Without it, the page renders, then jumps when each image loads. That's **Cumulative Layout Shift**, one of the Core Web Vitals, and it's genuinely disruptive in a way metrics understate: it's the reason you go to tap a button and an image shoves it out from under your finger.

### Lazy loading, and the one image never to lazy-load

`loading="lazy"` defers fetching until an image approaches the viewport. It's a single attribute, natively supported, needs no library, and the browser's heuristics — which begin loading slightly *before* the image is visible — are well tuned.

The critical exception: **never lazy-load the hero image.** It's almost always the **LCP element** (Largest Contentful Paint, the Core Web Vital that measures how quickly the main content appears). Lazy-loading it means the browser doesn't even *begin* fetching until layout has run, directly worsening the exact metric you're trying to improve. Above-the-fold images should load eagerly, and the LCP one is worth marking `fetchpriority="high"` or preloading.

### Image CDNs

Cloudinary, imgix, Cloudflare Images and framework pipelines generate every size and format on demand from a single upload, driven by URL parameters. `next/image` goes further and handles `srcset`, lazy loading, dimensions, and blur placeholders automatically — which is why "use the framework's image component" is usually the correct answer rather than a cop-out.

## Fonts

Fonts are small in bytes but disproportionately damaging, because of a behaviour most developers don't realise is happening: **by default, browsers hide text for up to three seconds while waiting for a web font.** Your content has fully downloaded and is completely unreadable.

That's **FOIT** — Flash of Invisible Text. The alternative, **FOUT**, shows the fallback font first and swaps when the web font arrives. FOUT looks slightly less polished and is enormously better for users.

`font-display: swap` chooses FOUT explicitly: show the fallback immediately, swap when ready. `font-display: optional` goes further — use the web font only if it's already cached, otherwise never — which is the best choice for Core Web Vitals at the cost of some users never seeing your typeface.

Beyond that, five things matter. **Serve WOFF2 only**; it's universally supported and about 30% smaller than WOFF, so shipping TTF and EOT fallbacks is pure legacy weight. **Preload the critical font**, because otherwise it isn't discovered until the CSS is parsed *and* the browser encounters text using it — a long dependency chain. Note that `crossorigin` is **mandatory** on a font preload even when self-hosting; omitting it makes the browser fetch the font twice. **Self-host** rather than using a third-party font CDN, which costs an extra DNS lookup, TLS handshake, and connection — and the old "it's probably already cached from another site" argument is dead, because modern browsers partition cache per site. **Subset** to the characters you actually use; a full font carrying Cyrillic, Greek, and Vietnamese might be 300 KB where the Latin subset is 30. And **reduce file count** — four separate weight and style files can often be replaced by one variable font covering the whole range.

The last option is to load no font at all. A system font stack costs zero bytes, has zero layout shift, renders instantly, and looks native on every platform.

## SVGs

There are three ways to use an SVG, and they trade off differently.

As an `<img>`, it's cached separately by the browser and doesn't inflate your JavaScript, but it can't be styled with CSS and costs an HTTP request. **Inlined in JSX**, it's fully stylable and costs no request, but it inflates the bundle and duplicates markup wherever it appears. As a **component** via SVGR — built into Vite, CRA, and Next — you get the inline benefits with a clean import syntax.

The rule of thumb: small icons that need CSS control go inline or as components; large illustrations use `<img>` so they're cached and lazy-loadable; and an icon repeated fifty times on one page should be a sprite sheet referenced with `<use>`.

`fill="currentColor"` is the small trick that makes inline icons genuinely reusable — the icon inherits its parent's text color, so one file covers every color variant instead of needing one file per color.

Two practical points. **Design tools export enormous SVGs**, full of editor metadata, hidden layers, and absurd decimal precision; running them through SVGO typically cuts 80–85% with no visual difference. And **icon libraries are a classic barrel-file trap** — importing two named icons from a package index can pull in a thousand. Finding several hundred kilobytes of unused icons in a bundle analyzer is extremely common.

## Lazy loading assets

**Native lazy loading is the first choice** — `loading="lazy"` on images and iframes, supported everywhere, zero JavaScript, well-tuned heuristics.

**IntersectionObserver** covers everything else: content that isn't an image or iframe, or cases needing a custom trigger threshold. The important detail is `rootMargin` — triggering only when an element is exactly at the viewport edge means the user watches it load. A margin of a couple of hundred pixels starts the work early enough that it's usually finished by the time they arrive. This is also the mechanism for mounting a heavy `React.lazy` component when it scrolls into view, which connects asset lazy loading back to code splitting.

**Placeholders** matter more than they seem. A blurred low-quality preview inlined as a data URI, a BlurHash string that decodes into a blurred approximation, or simply the image's dominant color as a background — all three reserve the correct space (eliminating layout shift) and give the user something immediately rather than an empty rectangle.

**Video** deserves specific attention because the defaults are expensive. `preload="none"` with a poster image downloads nothing until the user presses play; `preload="auto"` can pull megabytes before anyone has expressed interest. And an auto-embedded YouTube iframe brings roughly a megabyte of player JavaScript with it — above the fold, that single embed can outweigh your entire application. The "lite embed" pattern shows a thumbnail and swaps in the real iframe on click.

The overall priority hierarchy is straightforward: **above the fold loads eagerly** and the LCP element gets high priority; **just below the fold** lazy-loads with a generous margin; **far below** lazy-loads with defaults; and anything **behind an interaction** doesn't load until the interaction happens.

---

<a name="antipatterns"></a>
# 10. Anti-patterns

Each of these is a real habit that makes an application slower while feeling like optimization.

**Memoizing everything by default.** A button costs microseconds to render; wrapping it in `React.memo` adds a comparison and memory for nothing.

**`useCallback` with no memoized consumer.** Passing a stabilized callback to a plain DOM element or a non-memoized child accomplishes precisely nothing.

**Memoizing a component that takes `children`.** The children prop is a new element object every render, so the comparison can never succeed.

**Splitting tiny components.** An HTTP round-trip to save two kilobytes is a loss.

**Lazy-loading above-the-fold content.** You replaced instant rendering with a spinner.

**Calling `lazy()` inside a component.** A new component type every render means a remount every render.

**Namespace imports from large libraries.** Tree shaking becomes impossible.

**Lazy-loading the LCP image.** Directly worsens the metric.

**Optimizing without profiling.** The most common one — an afternoon spent on a component that renders in 0.3 milliseconds.

## Three things often worth more than everything above

**List virtualization** renders only the rows currently visible. Ten thousand rows becomes twenty DOM nodes. For a long list, this dwarfs anything memoization can achieve — it's a different order of magnitude, not a percentage improvement.

**Transitions** (`startTransition`, `useDeferredValue`) stop expensive renders from blocking input, which fixes the *feel* of slowness even when total work is unchanged.

**Stable keys** prevent React from needlessly destroying and recreating DOM subtrees — a correctness fix that happens to be a large performance fix too.

---

<a name="interview"></a>
# 11. Interview questions & answers

### Q: "How do you approach performance optimization in React?"
> *"Measure first, and start by identifying which problem I actually have — slow initial load is a bundle-size issue, slow interaction is a re-render issue, and slow painting is usually a DOM-size issue. They have nothing to do with each other, so the wrong fix does nothing. I use the React Profiler to find components that render often or render slowly, and a bundle analyzer to find what's inflating the initial download. Every optimization here has a real cost, so applying them blindly makes things worse."*

### Q: "Why are 'unnecessary re-renders' usually not a problem?"
> *"Because a re-render just means the component function ran and produced a new element tree. React diffs it against the previous one, finds no differences, and performs zero DOM operations. The wasted work is one function call and one comparison, both cheap. It only matters when the component is genuinely expensive — which is why I profile rather than chasing every re-render I see in DevTools."*

### Q: "What does `React.memo` do?"
> *"It wraps a component so React skips re-rendering when the new props are shallowly equal to the previous ones. Without it, a child re-renders whenever its parent does, regardless of props, because React doesn't check first. It's worth it when the component is measurably expensive and its props are usually unchanged — and it skips the entire subtree below it, not just that one component, so placement matters."*

### Q: "Why might `React.memo` not work?"
> *"Because the comparison is shallow and by reference, and a component function recreates every literal on every render. An inline object, array, or arrow function is a new reference each time, so the comparison always fails and the component re-renders anyway — you've added cost for nothing. `children` has the same problem, since nested JSX creates a new element object each render, which is why memoizing wrapper components is essentially always pointless. The fix is stabilizing references with `useMemo` and `useCallback`, or hoisting constants to module scope."*

### Q: "Is there an alternative to memoizing?"
> *"Often, yes — composition. If an expensive child's element is created in a grandparent that isn't re-rendering and passed down as `children`, then when the middle component re-renders it receives the identical element object, so the reconciler skips that subtree with no comparison cost at all. Moving where an element is created moves what re-renders. I'd try that before adding memo, because it's simpler rather than more complex."*

### Q: "What's the return value of `React.memo`'s custom comparator?"
> *"Return `true` to mean the props are equal and the render should be skipped — inverted from `shouldComponentUpdate`, where `true` meant 'do update'. I use custom comparators rarely, because getting one wrong produces a stale UI, which is among the hardest bugs to trace: the data is correct, only the screen is wrong, and nothing throws."*

### Q: "When would you use `useMemo`?"
> *"Two distinct cases. One is genuinely expensive computation — sorting thousands of items, heavy regex, parsing — where I'd verify it's expensive in the Profiler first, because modern engines make most work free. The other, and more common, is reference stability: keeping an object or array identity stable so a memoized child's comparison succeeds or an effect's dependency array stops firing every render. The classic example is a Context provider's value, where an inline object makes every consumer re-render on every provider render."*

### Q: "Does `useCallback` improve performance on its own?"
> *"No. It doesn't avoid creating the function — the arrow is still allocated every render — it only changes which reference gets returned. That's useful solely when something compares the reference: a `React.memo` child, an effect dependency, or a custom hook dependency. Passing a memoized callback to a plain DOM element does nothing except add storage and a comparison. Both halves of the optimization are required."*

### Q: "When is memoization the wrong choice?"
> *"When the work is cheap. `useMemo` stores a function, a dependency array and a result, and compares dependencies every render, so for simple math or small arrays you pay more than you save — plus a dependency array that can silently go stale. It's also a hint rather than a guarantee: React may discard cached values, so the code must stay correct if the computation runs again. Memoization can affect performance but must never affect behaviour."*

### Q: "What is code splitting and why does it matter?"
> *"Splitting the bundle into chunks loaded on demand, so users download only what they need now. It matters because of two costs, and people usually only count one. The download itself, and then parsing and compiling the JavaScript — which is CPU work, so a fast connection doesn't help, and on a mid-range phone it often exceeds the download time. Without splitting, someone visiting the homepage downloads the admin panel, the chart library, and the rich text editor before anything renders."*

### Q: "What's the underlying mechanism?"
> *"Dynamic `import()`, which returns a promise. It's syntax the bundler recognises as a split point: it cuts that module and its dependencies into a separate chunk and leaves code that fetches it on demand. `React.lazy` wraps that promise into a component and `Suspense` renders a fallback while it resolves — but the splitting itself is a bundler feature, not a React one, and works fine in plain JavaScript."*

### Q: "Where should you split?"
> *"Routes first — the biggest win for the least work, typically 40 to 70 percent off the initial bundle, because a user is on one page at a time. Then heavy components that aren't visible immediately: modals, editors, charts, maps, export features, admin sections. Not small components, where an HTTP round-trip costs more than the bytes saved, and not above-the-fold content, where you've replaced instant rendering with a spinner. The general rule is to split where the user makes a decision — navigating, opening a modal — so the request hides behind their intent."*

### Q: "How does `React.lazy` work internally?"
> *"When React renders a lazy component whose module hasn't loaded, the component throws the pending promise. React catches it, walks up to the nearest `Suspense` boundary and renders its fallback. When the promise resolves, React re-renders and the real component appears. It's exception propagation, the same mechanism error boundaries use — which is why a `Suspense` ancestor is mandatory rather than optional."*

### Q: "What are the gotchas with `React.lazy`?"
> *"The module needs a default export, or you map a named one in the `.then()`. The `lazy()` call must be at module scope — inside a component it produces a new component type every render, so reconciliation destroys and remounts the subtree constantly. And you need an error boundary above the `Suspense`, because chunk loading can fail; the most common cause is deploying while a user has the page open, so the old content-hashed filename no longer exists on the server and they get a blank screen."*

### Q: "How do you avoid the loading delay lazy loading introduces?"
> *"Preload on intent rather than on render — call the import function on hover or focus of the link that will need it. There's typically 100 to 300 milliseconds between hovering and clicking, which is usually enough to finish the fetch, so navigation feels instant while the initial bundle stays small. Modern routers do this automatically."*

### Q: "Spinner or skeleton for the fallback?"
> *"A skeleton matching the eventual layout. It avoids the layout shift you get when content jumps in to replace a small spinner, and it consistently feels faster to users even when the actual duration is identical. I'd also place the boundary around just the content region rather than the whole app, so the header and navigation stay stable during navigation."*

### Q: "What is tree shaking and what does it require?"
> *"Build-time elimination of exports nobody imports. It requires ES Modules, because `import` and `export` are statically analysable — imports are hoisted and can't be conditional or computed, so the bundler can determine reachability without running anything. CommonJS breaks it, because `require` is a runtime call whose argument can be computed and whose exports can be reassigned conditionally, so the bundler can't prove anything is unused and keeps it all. Packages also need a `sideEffects` field, or bundlers conservatively assume every module might do something just by being loaded."*

### Q: "What commonly prevents tree shaking from working?"
> *"Namespace imports like `import * as _`, which reference the whole module object. CommonJS-only dependencies. And barrel files that `export *` — importing one component from an index can drag in everything it re-exports, because elimination depends on side-effect analysis succeeding through every re-exported module and it often doesn't. Icon libraries are the usual victim. I verify with a bundle analyzer rather than assuming it worked."*

### Q: "Tree shaking vs dead code elimination?"
> *"Tree shaking removes exports nobody imports, working across the module graph. Dead code elimination removes statements that can never execute within a module — unreachable branches, unused variables. The most important case is `process.env.NODE_ENV`: the bundler replaces it with a literal string, so the condition folds to false and the branch is deleted. That's how React ships thousands of lines of development warnings that never reach production — the production build is about half the size, and it's why running a dev build in production is doubly costly."*

### Q: "What's the difference between Webpack and Vite?"
> *"Webpack bundles the entire application before the dev server can serve anything, in JavaScript, so cold start scales with project size — often 30 to 90 seconds on a large app. Vite serves native ES Modules in development and transforms files on demand with esbuild, so cold start is nearly independent of app size and a hot update re-transforms one file rather than rebuilding a graph. For production Vite bundles with Rollup, because shipping hundreds of unbundled module requests to real users would be far worse than bundling."*

### Q: "Explain Webpack's core concepts."
> *"Entry, where the module graph starts. Output, where bundles are written, usually with a content hash so changing one file invalidates only that chunk's cache. Loaders, which transform non-JavaScript files — the useful framing is that Webpack only understands JavaScript and loaders teach it everything else. Plugins, which hook into the whole build lifecycle rather than individual files. And mode, where production automatically enables minification, tree shaking and the NODE_ENV replacement. Beyond those, SplitChunksPlugin extracts shared code into common chunks and HMR swaps changed modules without a reload."*

### Q: "What is esbuild and why is it fast?"
> *"A bundler and transformer written in Go rather than JavaScript, roughly 10 to 100 times faster. It's compiled to native code, parallelised across CPU cores, and designed to minimise AST passes. Vite uses it for dependency pre-bundling and for stripping TypeScript types. One thing worth knowing is that it doesn't type-check TypeScript — it just removes the annotations, so type errors have to be caught by `tsc` in the editor or CI. That's a deliberate trade of build-time safety for speed."*

### Q: "Why is Rollup used for libraries?"
> *"It's ESM-first and produces flat output with minimal wrapper code, whereas Webpack emits a module runtime and registry — acceptable overhead in an application, unnecessary weight in a published package. Rollup also pioneered tree shaking and is still excellent at it. Most application developers use it indirectly through Vite's production build."*

### Q: "What's the biggest asset optimization win?"
> *"Images, because they're around half of median page weight — more than double JavaScript. The two biggest levers are format and dimensions. Serving AVIF or WebP with a JPEG fallback through `<picture>` cuts 30 to 50 percent. And using `srcset` with `sizes` stops the browser downloading a 4000-pixel photo to display in a 400-pixel card, which is the single most common waste I see in real applications."*

### Q: "How do you prevent layout shift from images?"
> *"Always set `width` and `height` attributes. They don't control display size — CSS still does — they give the browser the aspect ratio so it can reserve a correctly-sized box before the image loads. Without them the page renders and then jumps, which is Cumulative Layout Shift, a Core Web Vital and genuinely disruptive when a user is about to tap something that moves."*

### Q: "When should you not lazy-load an image?"
> *"Above the fold, and especially the hero image, which is usually the LCP element. Lazy-loading it means the browser doesn't start fetching until layout has run, directly worsening Largest Contentful Paint — the exact metric you're trying to improve. Above-the-fold images load eagerly, and the LCP one is worth `fetchpriority=\"high\"` or a preload."*

### Q: "How do you optimize web fonts?"
> *"The core problem is that browsers hide text for up to three seconds waiting for a font, so the content is downloaded and unreadable. `font-display: swap` fixes that by showing a fallback immediately. Beyond that: WOFF2 only, since it's universal and about 30 percent smaller than WOFF; preload the critical font, with `crossorigin`, which is mandatory for fonts or the browser fetches them twice; self-host rather than using a CDN, since cache is partitioned per site now so the shared-cache argument is dead; subset to the characters you use, which can take 300 KB to 30; and use a variable font to replace four weight files with one. Or use a system font stack and load nothing at all."*

### Q: "How do you handle SVGs in React?"
> *"Small icons that need CSS control go inline or as components via SVGR, with `fill=\"currentColor\"` so they inherit text color and one file covers every variant. Large illustrations use an `<img>` tag so they're cached separately and can be lazy-loaded. Repeated icons go in a sprite sheet referenced with `<use>`. Either way I'd run them through SVGO, because design-tool exports carry editor metadata and excessive decimal precision and typically shrink 80 percent with no visual change. And I'd watch icon libraries specifically — importing named icons from a package index can pull in a thousand."*

### Q: "How do you lazy-load assets?"
> *"Native `loading=\"lazy\"` on images and iframes first — no JavaScript and well-tuned heuristics. IntersectionObserver for anything else, with a generous `rootMargin` so loading starts a couple of hundred pixels before the element is visible rather than exactly at the edge. I'd pair it with a placeholder that reserves the right space — a blurred preview or dominant color — so there's no layout shift. For video, `preload=\"none\"` with a poster image, and never auto-embed a YouTube iframe above the fold, since each one pulls in about a megabyte of player JavaScript."*

### Q: "What's the single biggest performance win you'd reach for?"
> *"It depends on the symptom. For initial load, route-level code splitting. For a slow list, virtualization — rendering only visible rows turns ten thousand DOM nodes into twenty, which is an order-of-magnitude change that memoization can't approach. Memoization is genuinely the last resort, not the first."*

---

<a name="cheatsheet"></a>
# 12. Quick revision cheat sheet

```
THREE DIFFERENT "SLOW"   — diagnose BEFORE choosing a fix; they're unrelated
  slow to LOAD      huge bundle          → splitting + bundle/asset optimization
  slow to RESPOND   expensive re-renders → memo, transitions, virtualization
  slow to PAINT     huge DOM, CSS        → virtualization, fewer nodes

MEASURE FIRST   React Profiler   → who rendered, how long, and WHY
                bundle analyzer  → what's inflating the initial download
                every technique here has a COST — blind use makes things worse

THE FOUNDATION  React compares with Object.is = REFERENCE identity, not contents
                a component re-runs fully each render → every inline {} [] () => {}
                is a NEW value → "props changed" even when nothing changed
                → memoization in React is mostly an IDENTITY-STABILITY tool

React.memo      skip a re-render when props are SHALLOWLY equal
                default: parent renders → ALL children render (React doesn't check)
                usually harmless — identical tree → diff finds nothing → 0 DOM ops
                memo skips the component AND ITS WHOLE SUBTREE
                🔥 fails on inline objects/arrays/functions and on `children`
                → almost always needs useMemo/useCallback alongside it
                comparator: return TRUE = skip (INVERTED vs shouldComponentUpdate);
                a wrong one = STALE UI, the worst bug class
                TRY FIRST: composition — create the element in a grandparent and
                pass as children → same reference → subtree skipped, zero cost

useMemo         (1) genuinely expensive work — verify in the Profiler first;
                    most work is free on modern engines
                (2) REFERENCE STABILITY — the more common reason
                    (memo children, effect deps, CONTEXT VALUE)
                cost: stores fn + deps + result, compares every render
                a HINT not a guarantee → must stay correct if it recomputes

useCallback     === useMemo(() => fn, deps)
                doesn't avoid CREATING the arrow — only changes which is RETURNED
                🔥 USELESS unless something COMPARES it:
                   memo child ✅ · effect dep ✅ · hook dep ✅
                   plain DOM element ❌ · non-memo child ❌
                missing deps → stale closure (same bug as useEffect)
                never needed for setState / dispatch
                🆕 React 19 Compiler auto-memoizes most of this

THE BUNDLE      one file with everything → the homepage visitor downloads the
                admin panel, chart library and editor before anything renders
                TWO costs: download bytes AND parse/compile (CPU — a fast network
                doesn't help; on mid-range phones it often EXCEEDS download time)

DYNAMIC IMPORT  import("./x") → a promise; the bundler treats it as a SPLIT POINT
                plain JavaScript — a bundler feature, not a React one

CODE SPLITTING  ROUTES FIRST — 40–70% off the initial bundle for ~20 min of work
                COMPONENTS — modals · editors · charts · maps · date pickers
                             · PDF/Excel export · admin panels · collapsed panels
                LIBRARIES — await import("xlsx") inside the handler
                ✅ split where the user makes a DECISION (the request hides
                   behind their intent)
                ❌ above the fold · tiny components · used on every page

React.lazy      HOW: the component THROWS the pending promise → nearest Suspense
                     catches it → fallback → chunk loads → re-render
                     (exception propagation, same as error boundaries
                      → which is WHY a Suspense ancestor is mandatory)
                RULES: default export (named → map it in .then)
                       MODULE SCOPE (inside a component = remount every render,
                       same reconciliation rule as calling a HOC in render)
Suspense        placement decides the experience: wrap the CONTENT region,
                not the whole app — keep the shell stable
                SKELETON not spinner → no layout shift, feels faster
                ⚠️ Suspense = PENDING only. Failure needs an ERROR BOUNDARY above.
                   #1 cause of chunk failure: DEPLOYING while a tab is open
PRELOAD         start the import on hover/focus — 100–300ms hover→click is
                usually enough → lazy loading with no perceived delay

TREE SHAKING    remove exports nobody imports
                REQUIRES ESM — statically analysable (hoisted, not conditional
                or computed) → the bundler can prove reachability
                CommonJS breaks it (require is a runtime call, exports reassignable)
                package.json "sideEffects": false | ["*.css", "./polyfills.js"]
                🔥 KILLERS: import * as _ · CJS-only packages
                            · barrel files with export * (icon libraries!)
                VERIFY with an analyzer — never assume

DEAD CODE       remove statements that can never RUN (vs shaking = unused EXPORTS)
                ⭐ process.env.NODE_ENV → replaced with a literal → folds to
                   if(false) → deleted → React's prod build ≈ HALF the dev build
                   → running a dev build in prod ships AND runs all of it
                same mechanism = build-time feature flags
MINIFY          rename/strip → 60–70% off, then brotli ~70% more
                1 MB source → 350 KB min → 100 KB over the wire
                always compare COMPRESSED transfer size

WEBPACK         ENTRY · OUTPUT ([contenthash] = per-chunk cache busting)
                · LOADERS ("Webpack only understands JS; loaders teach it the rest")
                · PLUGINS (whole-build lifecycle) · MODE (prod auto-enables
                  minify + shaking + NODE_ENV)
                + SplitChunksPlugin (vendors chunk) · HMR
                lost ground: bundles everything in JS before serving → 30–90s start
VITE            dev = native ESM + esbuild ON DEMAND → cold start independent
                      of app size; deps pre-bundled once with esbuild
                prod = ROLLUP (unbundled ESM would be hundreds of requests)
                ⭐ one-liner: "native ESM + esbuild in dev, Rollup in prod"
ROLLUP          ESM-first · flat minimal output · the LIBRARY choice
ESBUILD         Go, 10–100× faster · powers Vite's dev speed
                ⚠️ does NOT type-check TS — only strips types (tsc --noEmit in CI)
TREND           SWC (Rust, Next.js) · Turbopack · Rolldown — the toolchain is
                migrating from JS to compiled languages

ASSETS          ⚠️ IMAGES ≈ 50% of page weight — MORE THAN DOUBLE JavaScript (~22%)
IMAGES          FORMAT: AVIF (−50%) / WebP (−30%) via <picture> + jpg fallback
                SIZE:   srcset + sizes — stop shipping 4000px for a 400px card
                        (the most common real-world waste)
                width + height ALWAYS → gives the ASPECT RATIO → prevents CLS
                loading="lazy" below the fold
                🔥 NEVER lazy-load the hero/LCP image — the browser wouldn't even
                   START fetching until layout runs → fetchpriority="high"
                image CDN / next/image does all of this automatically
FONTS           PROBLEM: browsers hide text up to 3s waiting for a font (FOIT)
                font-display: swap → show the fallback immediately (FOUT)
                          optional → use it only if already cached (best CWV)
                WOFF2 only · preload + crossorigin (MANDATORY or double fetch)
                self-host (cache is partitioned per site — shared cache is dead)
                subset (300 KB → 30 KB) · variable font = 1 file not 4
                or a system font stack = 0 bytes, 0 shift, instant
SVG             icons needing CSS → inline / SVGR component + fill="currentColor"
                large illustrations → <img> (cached separately, lazy-loadable)
                repeated icons → sprite sheet <use href="#id">
                SVGO: design exports shrink ~80–85% with no visual change
                🔥 icon barrels: 2 named imports can pull in 1000 icons
LAZY ASSETS     loading="lazy" first (native, tuned heuristics)
                IntersectionObserver + rootMargin "200px" for everything else
                (triggering at the exact edge means the user WATCHES it load)
                placeholders: LQIP / BlurHash / dominant color → no layout shift
                video: preload="none" + poster
                YouTube iframe ≈ 1 MB of player JS → lite-embed pattern
                PRIORITY: above fold eager → just below lazy+margin
                          → far below lazy → behind interaction don't load

BEYOND THIS     VIRTUALIZATION  render only visible rows → 10,000 rows becomes 20
                                DOM nodes. Order of magnitude, not a percentage.
                TRANSITIONS     startTransition / useDeferredValue
                STABLE KEYS     avoid needless destroy-and-recreate
```

---

## Connects to

- **[Part 8 — Rendering Internals](08-rendering-internals-and-vdom.md):** why children re-render by default, why re-render ≠ repaint, why a changed component type remounts a subtree, and why stable keys matter.
- **[Part 7 — Hooks](07-hooks.md):** `useMemo`/`useCallback` mechanics, `useTransition` and `useDeferredValue`, stale closures.
- **[Part 10 — HOC](10-hoc.md):** `React.memo` is itself a HOC, and the "don't call it during render" rule is the same one.
- **[Part 6 — Lifecycle](06-lifecycle.md):** error boundaries — required above every `Suspense` for chunk-load failures.
- **Routing:** route-level splitting and router-level preloading.
- **SSR / Next.js:** streaming, selective hydration, `next/image`, `next/font`.

## Suggested next topics

1. **Custom Hooks** — recommended next.
2. **React Patterns** — compound components, control props, provider pattern.
3. **SSR / CSR & Next.js** — the other half of load performance.

*— End of Part 9: Performance Optimization —*
