# JavaScript Study Notes — Part 32

## Browser Rendering & Loading — `async`/`defer`, the Rendering Pipeline, Reflow, Web Vitals, Observers ⭐⭐⭐⭐⭐

**Topics:** how a page loads · `<script>` vs `async` vs `defer` vs `type="module"` · the rendering pipeline (style → layout → paint → composite) · reflow and **layout thrashing** · `DocumentFragment` and batching · long tasks · **Core Web Vitals** (LCP, INP, CLS) · `IntersectionObserver`, `ResizeObserver`, `MutationObserver`.

> **Continues from:** [Part 10](10-event-loop-and-concurrency-model.md) (event loop and `requestAnimationFrame`) and [Part 22](22-performance-patterns.md) (debounce, lazy loading). Those cover *when* your code runs; this part covers *what the browser does* to turn HTML, CSS and your JS into pixels — and where it gets slow.

---

## 1. How a page loads

```
HTML arrives → parse it top to bottom into the DOM
             → CSS files → CSSOM            (render-blocking: nothing is painted until CSS is ready)
             → <script> found → STOP parsing, download + run it, then continue   ← the problem
DOM + CSSOM → render tree → layout → paint → first pixels on screen
```

A plain `<script src>` in the `<head>` **pauses the HTML parser** while it downloads and runs, because the script might change the page (`document.write`). A big script there means a **blank white page** until it finishes.

---

## 2. ⭐ `<script>` vs `async` vs `defer` vs `type="module"`

```
plain     HTML parse ███░░░░░░░░███████     ← parser STOPS while the script downloads + runs
          script          ↓download↓run

async     HTML parse ████████░░██████       ← downloads in parallel, runs AS SOON AS it arrives
          script     ↓download↓run             (pauses the parser at that moment)

defer     HTML parse ████████████████       ← downloads in parallel, runs AFTER the HTML is parsed,
          script     ↓download    ↓run          in document order, before DOMContentLoaded
```

| | Blocks the parser? | When it runs | Order between scripts | Use for |
|---|---|---|---|---|
| `<script>` | **yes** | immediately | in order | almost never in `<head>` |
| `<script async>` | no (only while running) | as soon as downloaded | **not guaranteed** | independent scripts — analytics, ads |
| `<script defer>` | no | after HTML parsing, before `DOMContentLoaded` | **in order** | your app's scripts ✅ |
| `<script type="module">` | no | **deferred by default** | in order | modern apps (add `async` to run ASAP) |

> **Analogy 🍳 — cooking while reading a recipe.** Plain script: you stop reading and go shopping for an ingredient, and only continue reading when you're back. `async`: someone else goes shopping; whenever they return you stop and use it right away. `defer`: someone else goes shopping; you use everything after you've finished reading the whole recipe, in the order written.

> 🧠 **Remember:** **`defer` = in order, after parsing. `async` = whenever it's ready, any order.** Modules are deferred automatically.

**Events:** `DOMContentLoaded` fires when the HTML is parsed and deferred scripts have run (images may still be loading). `load` fires when **everything**, including images, has loaded.

**Resource hints:** `<link rel="preload" href="font.woff2" as="font" crossorigin>` (fetch this critical file early), `<link rel="preconnect" href="https://api.example.com">` (open the connection early), `<img fetchpriority="high">` for the main hero image, `loading="lazy"` for images below the fold.

---

## 3. The rendering pipeline

Every time something on the page changes, the browser may redo some of these steps:

```
JavaScript → Style → Layout → Paint → Composite
             (which   (where is   (fill in    (put the layers
             CSS       each box,   the pixels) together on the
             applies)  how big)                GPU)
```

How expensive a change is depends on **which step it starts from**:

| You change | Steps redone | Cost |
|---|---|---|
| `width`, `height`, `top`, `margin`, font size, adding/removing elements, changing text | **layout** + paint + composite ("**reflow**") | 💰💰💰 — can affect the whole page |
| `color`, `background`, `box-shadow` | paint + composite ("**repaint**") | 💰💰 |
| **`transform`, `opacity`** | composite only | 💰 — can run on the GPU |

So **animate with `transform` and `opacity`**, not `left`/`top`/`width`:

```css
.slide-in { transform: translateX(100px); transition: transform 200ms; }   /* ✅ smooth */
.slide-in { left: 100px; transition: left 200ms; }                          /* ❌ reflow every frame */
```

---

## 4. ⭐ Layout thrashing

The browser normally **batches** layout: you can change ten styles and it recalculates layout once, before the next frame. But **reading** a layout value (`offsetHeight`, `getBoundingClientRect()`, `scrollTop`, `clientWidth`, `getComputedStyle`) forces it to calculate layout **right now** so it can give you a correct answer.

Mix reads and writes in a loop and you force a full layout **on every iteration**:

```js
// ❌ layout thrashing — read, write, read, write… → N forced layouts
for (const box of boxes) {
  const h = box.offsetHeight;           // READ  → forces layout
  box.style.height = `${h * 2}px`;      // WRITE → invalidates layout
}

// ✅ batch: all reads first, then all writes → 1 layout
const heights = boxes.map(b => b.offsetHeight);            // read phase
boxes.forEach((b, i) => { b.style.height = `${heights[i] * 2}px`; });   // write phase
```

> **Analogy 🧹 — tidying a room while someone keeps asking "how tidy is it now?"** Each question forces you to stop and measure. Answer once at the end and the job goes far faster.

> 🧠 **Remember:** **read everything, then write everything.** Do the writes inside `requestAnimationFrame` if they're visual.

**Adding many elements:** build them off-page and insert once.

```js
const frag = document.createDocumentFragment();          // an invisible container
for (const item of items) {
  const li = document.createElement('li');
  li.textContent = item.name;
  frag.appendChild(li);                                  // no reflow — not in the page yet
}
list.appendChild(frag);                                  // ONE insert, one layout
// (or list.replaceChildren(...nodes), or build with a framework that batches for you)
```

For very long lists (thousands of rows), render only what's visible — **virtualization** (`react-window`, Angular CDK virtual scroll). CSS `content-visibility: auto` lets the browser skip rendering off-screen sections.

---

## 5. Long tasks — why the page feels frozen

The main thread does **JavaScript, style, layout and paint** — one thing at a time ([Part 10](10-event-loop-and-concurrency-model.md)). Any task over **50 ms** is a "**long task**": during it, clicks and typing just wait.

Fixes:
- **Break work into chunks** and yield between them, so the browser can handle input:
  ```js
  async function processAll(items) {
    for (let i = 0; i < items.length; i++) {
      process(items[i]);
      if (i % 500 === 0) await new Promise(r => setTimeout(r, 0));   // yield to the browser
      // newer browsers: await scheduler.yield();
    }
  }
  ```
- Move heavy computation to a **Web Worker** ([Part 27](27-workers-and-parallelism.md)).
- Load less JavaScript — code-split routes ([Part 16 §5](16-modules-commonjs-vs-esm.md)), remove unused libraries.

Find them in Chrome DevTools → **Performance** panel (long tasks are marked with red corners).

---

## 6. ⭐ Core Web Vitals

Google's three numbers for "does this page feel good?" — they also affect search ranking.

| Metric | Measures | Good | Usual fixes |
|---|---|---|---|
| **LCP** — Largest Contentful Paint | **loading**: when the biggest image/text block appears | ≤ 2.5 s | faster server/CDN, preload & `fetchpriority="high"` the hero image, compress images, less render-blocking CSS/JS |
| **INP** — Interaction to Next Paint | **responsiveness**: delay from a click/tap/key to the screen updating (replaced FID in 2024) | ≤ 200 ms | avoid long tasks, break up work, less JS on the main thread, debounce expensive handlers |
| **CLS** — Cumulative Layout Shift | **visual stability**: how much things jump around while loading | ≤ 0.1 | set `width`/`height` (or `aspect-ratio`) on images and ads, reserve space for late content, don't insert banners above content |

> 🧠 **Remember:** **LCP = fast. INP = responsive. CLS = stable.** ("Load, Interact, Stay still.")

Measure with Lighthouse / PageSpeed Insights (lab), the `web-vitals` library or Chrome's field data (real users). Real-user numbers matter more than your fast laptop.

---

## 7. Observers — let the browser tell you

Instead of checking things in `scroll` or `resize` handlers, or polling, **observers** run your callback only when something actually changes — efficiently, off the hot path.

```js
// IntersectionObserver — "is this element on screen?" (lazy loading, infinite scroll, analytics)
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) loadMore();
}, { rootMargin: '200px' });               // start 200px before it becomes visible
io.observe(document.querySelector('#sentinel'));

// ResizeObserver — "did this ELEMENT change size?" (not just the window)
const ro = new ResizeObserver(([entry]) => {
  chart.resize(entry.contentRect.width);
});
ro.observe(chartContainer);

// MutationObserver — "did the DOM inside this element change?" (third-party widgets, editors)
const mo = new MutationObserver((mutations) => console.log(mutations.length, 'changes'));
mo.observe(container, { childList: true, subtree: true, attributes: true });
```

Always **`disconnect()`** observers when the component is destroyed. `MutationObserver` callbacks run as **microtasks**, batched — but observing a big subtree with `subtree: true` can still be expensive.

---

## Interview Q&A

**Q: `async` vs `defer`?**
> Both download the script without blocking HTML parsing. `async` runs it as soon as it arrives, in no guaranteed order — good for independent scripts like analytics. `defer` runs scripts in document order after parsing finishes and before `DOMContentLoaded` — right for app code that needs the DOM and depends on other scripts. Module scripts are deferred by default.

**Q: What's reflow, and what triggers it?**
> Reflow is the browser recalculating layout — positions and sizes. It's triggered by changing geometry (width, height, margins, fonts, adding or removing elements) and by reading layout values like `offsetHeight` after a change, which forces it to happen immediately. Animating `transform` and `opacity` avoids it.

**Q: What's layout thrashing, and how do you fix it?**
> Alternating layout reads and writes in a loop, so every read forces a fresh synchronous layout. Fix it by doing all the reads first and all the writes after, batching writes in `requestAnimationFrame`, and inserting many elements at once with a `DocumentFragment`.

**Q: What are the Core Web Vitals?**
> LCP — how fast the main content appears, target 2.5 seconds; INP — how fast the page responds to interactions, target 200 milliseconds; CLS — how much the layout shifts unexpectedly, target 0.1. Improve them respectively with faster loading of the hero content, avoiding long main-thread tasks, and reserving space for images and late content.

**Q: The page freezes for a second when you click "Export." How do you fix it?**
> The click handler is running a long task on the main thread. I'd confirm with the Performance panel, then move the heavy work to a Web Worker, or split it into chunks that yield back to the browser so it can paint and handle input in between. Showing a loading state before starting the work also helps INP.

**Q: How would you implement infinite scroll efficiently?**
> An `IntersectionObserver` on a sentinel element at the bottom of the list with a `rootMargin`, so the next page loads just before the user reaches the end — no scroll listener. For very long lists, virtualize so only visible rows are in the DOM, and use cursor-based pagination from the API.

---

## Follow-ups (challenge questions)

- *Failure mode:* an ad script inserted with `async` loads late and pushes the article down by 300px as the user starts reading. Which metric suffers, and what's the fix?
- *Scale:* a dashboard re-renders 2,000 table cells every second from a WebSocket feed. Walk through which pipeline steps run each time and three ways to make it cheaper.

---

## Cheat Sheet

```
PAGE LOAD: HTML → DOM, CSS → CSSOM (render-blocking) → layout → paint
plain <script> = parser STOPS · async = runs when ready, any order (analytics)
defer = after parsing, IN ORDER, before DOMContentLoaded (app code) · type=module = deferred
DOMContentLoaded = HTML parsed · load = everything incl. images
preload · preconnect · fetchpriority="high" · loading="lazy"

PIPELINE: JS → Style → Layout → Paint → Composite
geometry change = REFLOW (expensive) · color = repaint · transform/opacity = composite only ✅

LAYOUT THRASHING: read (offsetHeight, getBoundingClientRect) + write in a loop
→ READ ALL, THEN WRITE ALL · writes in rAF · DocumentFragment / replaceChildren · virtualize long lists

LONG TASK > 50ms → input waits → chunk + yield (setTimeout 0 / scheduler.yield) · Web Worker · less JS

WEB VITALS: LCP ≤ 2.5s (load) · INP ≤ 200ms (interact) · CLS ≤ 0.1 (stay still)
"Load, Interact, Stay still" · CLS fix: width/height/aspect-ratio, reserve space

OBSERVERS: Intersection (on screen?) · Resize (element size) · Mutation (DOM changed) → disconnect()
```

---

**Previous:** [Part 31 — Proxy & Reflect](31-proxy-and-reflect.md) · **Next:** [Part 33 — Front-End Security](33-frontend-security.md)
