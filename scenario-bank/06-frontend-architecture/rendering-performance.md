# Rendering & Load Performance — Scenario Bank

---

### "What happens during hydration? What causes hydration mismatch?"

After the server sends fully-rendered HTML (SSR/SSG/ISR), the page is visible but **not yet interactive** — none of the click handlers, form bindings, or component state exist yet, because that all lives in JavaScript that hasn't run yet. **Hydration** is the browser downloading and running that JS, which then "attaches" to the existing server-rendered DOM — reusing it rather than throwing it away and re-rendering from scratch — and wires up all the interactivity. Until hydration finishes, the page is in an uncanny-valley state: it *looks* done, but clicking anything does nothing yet.

**Hydration mismatch** happens when the HTML the client-side JS *would have rendered* doesn't match the HTML the server actually sent — React/Vue/etc. expects to reuse the existing DOM, but it doesn't line up, so the framework has to throw away the mismatched part and re-render it client-side (at best, a visible flicker; at worst, a hard error).

Common causes: using `Date.now()`, `Math.random()`, or any value that legitimately differs between server and client render; reading `window`/`localStorage` during the render itself (doesn't exist on the server, so the server and client render different content); browser extensions injecting DOM before hydration runs; locale/timezone differences between server and client.

**Interview line:** *"Hydration is the client-side JS attaching to server-rendered HTML and making it interactive — before that finishes, the page looks done but isn't clickable yet. A mismatch happens when what the client would render doesn't match what the server actually sent, usually from something non-deterministic like Date.now() or reading window during render, and the framework has to discard and re-render that part client-side instead of reusing it."*

**Tests:** SSR/hydration mechanics, common pitfalls

*Axis: normal · Source: challenge question*

---

### "How do you reduce JavaScript bundle size? Code splitting vs lazy loading?"

A large bundle means more to download, parse, and execute before the page becomes interactive — directly hurting load performance, especially on slow networks/devices.

**Code splitting** is the *build-time* mechanism — instead of one giant bundle, the bundler breaks the app into multiple smaller chunks (per-route is the most common split point).
**Lazy loading** is the *runtime* decision to only actually fetch a given chunk when it's needed — e.g. the code for a settings page doesn't get downloaded until the user navigates there, not on initial load.

```js
// Route-level code splitting + lazy loading in one line
const SettingsPage = lazy(() => import('./SettingsPage'));
```

Other concrete levers: **tree shaking** (the bundler removes exported code that's never actually imported anywhere — relies on ES modules and avoiding side-effectful imports that block it), auditing dependencies (a single unnecessarily large library can dominate the bundle — check with something like `source-map-explorer`), and **dynamic imports** for anything used conditionally/rarely (a heavy chart library only needed on one admin page).

**Interview line:** *"Code splitting is the build-time split into smaller chunks, usually per route. Lazy loading is deciding, at runtime, to only fetch a chunk when it's actually needed — so the settings page's code doesn't download until someone visits it. On top of that I'd tree-shake unused exports and audit dependencies with something like source-map-explorer, since one oversized library can dominate the whole bundle."*

**Tests:** bundle optimization, load performance

*Axis: performance · Source: challenge question*

---

### "What should be loaded eagerly? How do you optimize initial page load?"

**Eager** (loaded immediately, part of the initial bundle): anything needed to render what the user sees **without interaction** — the above-the-fold content, the core layout/shell, whatever's needed for the first meaningful paint. Delaying this just makes the user stare at a blank/loading page longer.

**Lazy** (deferred until needed): anything behind an interaction — a modal that opens on click, a settings page the user might never visit, a heavy library only used by one rarely-used feature, below-the-fold content the user hasn't scrolled to yet.

Beyond the eager/lazy split, initial load optimization usually includes: **preloading** critical resources the browser wouldn't otherwise discover early (`<link rel="preload">` for a critical font or hero image), image optimization (correctly sized, modern formats, lazy-loaded if below the fold), minimizing render-blocking resources (CSS/JS that blocks the browser from painting anything until it's fully downloaded and parsed), and — for SSR/SSG — sending real content in the initial HTML instead of a blank shell that waits for client-side data fetching.

**Interview line:** *"I load eagerly only what's needed for the first meaningful paint — the shell and above-the-fold content — and defer everything behind an interaction or below the fold. Beyond that split, I'd preload critical assets the browser wouldn't discover on its own, optimize images, and minimize render-blocking CSS/JS so the browser can paint something as early as possible."*

**Tests:** initial load optimization, critical rendering path

*Axis: performance · Source: challenge question*

---

### "How does browser caching affect frontend performance?"

Browser caching means a resource (a JS bundle, a CSS file, an image) downloaded once doesn't need to be downloaded again on a repeat visit — the browser serves it straight from local disk, instantly, with zero network round-trip. This is controlled by `Cache-Control` headers set by the server.

The design tension: you want **long** cache lifetimes for performance (why re-download something unchanged?), but a long cache lifetime means a client can be stuck on a **stale** version after you deploy a fix. The standard resolution: **content-hash filenames** — `app.a3f9c2.js` instead of `app.js` — so the filename itself changes whenever the content changes. That lets you cache these hashed assets essentially forever (`Cache-Control: max-age=31536000, immutable`) with zero staleness risk, because a new deploy simply produces a new filename that was never cached before — while the one file that *does* need to stay fresh (`index.html`, which references the current hashed filenames) is served with `Cache-Control: no-cache` so the browser always re-checks it.

**Interview line:** *"Browser caching skips the network entirely for a repeat resource, which is a real performance win — but a long cache lifetime risks a client staying on a stale version after a deploy. The standard fix is content-hashed filenames for JS/CSS, cached essentially forever since a change produces a new filename, while the HTML that references those filenames is never cached, so a new deploy is always picked up on the next load."*

**Tests:** cache-busting, browser caching strategy

*Axis: performance · Source: challenge question*

---
