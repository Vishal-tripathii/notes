# JavaScript Study Notes — Part 22

## Performance Patterns ⭐⭐⭐☆☆

**Topics:** applying [Part 18](18-advanced-functional-patterns.md)'s debounce/throttle to real DOM events · lazy loading · event delegation as a performance technique · `requestAnimationFrame` for animation.

---

## 1. Debounce/Throttle on Real DOM Events

> **Definition:** high-frequency DOM events (`scroll`, `resize`, `input`, `mousemove`) can fire dozens to hundreds of times per second — far more often than a handler doing real work (a re-render, a network call, layout recalculation) needs to run, so wrapping the handler in debounce or throttle ([Part 18](18-advanced-functional-patterns.md)) caps that rate deliberately.

```js
window.addEventListener('resize', debounce(() => recalculateLayout(), 200));  // only after resizing stops
window.addEventListener('scroll', throttle(() => updateStickyHeader(), 100)); // steady rate throughout
searchInput.addEventListener('input', debounce((e) => runSearch(e.target.value), 300));
```
**Choosing which one, concretely:** if the handler only needs the *final* state once activity settles (layout after resizing stops, a search query after typing stops) → debounce. If the handler needs to track *ongoing* state throughout the activity (a progress indicator during scroll, a live position readout) → throttle.

## 2. Lazy Loading

> **Definition:** deferring the loading of a resource (an image, a route's JS bundle, a component) until it's actually needed — about to enter the viewport, or about to be navigated to — instead of loading everything upfront.

```js
// images — native lazy loading, zero JS needed
// <img src="photo.jpg" loading="lazy" alt="...">

// more control — IntersectionObserver, fires a callback when an element enters the viewport
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.src = entry.target.dataset.src; // swap in the real src only when visible
      observer.unobserve(entry.target);
    }
  });
});
document.querySelectorAll('img[data-src]').forEach(img => observer.observe(img));

// routes — dynamic import() (Part 16) as code-splitting
const AdminPanel = lazy(() => import('./AdminPanel.js')); // only downloaded if the user navigates there
```

## 3. Event Delegation as a Performance Technique

Already covered structurally in [Part 21](21-dom-manipulation-and-event-delegation.md#3-event-delegation) — worth restating here specifically as a *performance* lens: attaching one listener instead of thousands isn't just cleaner code, it measurably reduces memory footprint and the cost of setting up/tearing down listeners as a large list re-renders, which is a real, measurable perf win at scale (a virtualized list re-rendering visible rows on every scroll tick would otherwise be attaching/detaching listeners constantly).

## 4. `requestAnimationFrame` for Animation

> **Definition:** (recap from [Part 10](10-event-loop-and-concurrency-model.md#4-requestanimationframe-vs-settimeoutfn-16)) schedules a callback to run once, synced to the browser's actual repaint cycle — the correct primitive for anything visually animating, in place of guessing at a `setTimeout` interval.

```js
// BAD — setTimeout(fn, 16) guesses at 60fps, drifts under load, keeps running in a hidden tab
setInterval(() => { el.style.left = `${pos++}px`; }, 16);

// GOOD — requestAnimationFrame, synced to the real refresh rate, pauses when tab is hidden
function animate() {
  el.style.left = `${pos++}px`;
  if (pos < 500) requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
```
**Why it beats a `setTimeout(fn, 16)` guess:** it's tied to the display's actual refresh rate (which isn't always exactly 60Hz — high-refresh-rate monitors run faster), never schedules a frame the browser can't actually paint, and automatically stops consuming CPU/battery in a backgrounded tab — a `setInterval` loop keeps firing regardless, burning resources for animation nobody can see.

---

## Interview Q&A

**Q: How would you decide between debounce and throttle for a given DOM event handler?**
> Whether the handler only cares about the *final* state after activity stops, or needs to track state *throughout* the activity. Debounce for the former (search input, resize-triggered layout recalculation), throttle for the latter (scroll-position-driven UI, a live progress readout) — get this backwards and you either get a laggy "nothing updates until you stop scrolling" UI, or an over-firing handler that never lets a burst settle.

**Q: Why is `requestAnimationFrame` the right tool for animation instead of `setTimeout`?**
> It's synced to the browser's real repaint cycle, so it never schedules work the screen can't actually display, doesn't drift the way a fixed interval does under load, and automatically pauses in a backgrounded tab, saving battery/CPU for animation nobody can see — none of which a `setTimeout`/`setInterval` guess gets for free.

**Q: How does event delegation function as a *performance* pattern, not just cleaner code?**
> Fewer listeners means less memory overhead and less setup/teardown cost, which matters concretely when a large or frequently-changing list would otherwise be attaching and removing a listener per row on every re-render — delegation collapses that to one stable listener regardless of how many rows exist or how often they change.

---

## Follow-ups (challenge questions)

- *Scale:* a virtualized list re-renders only the ~20 visible rows out of 100,000 as the user scrolls — does event delegation still matter here, given only 20 listeners would ever exist at once with the naive per-row approach? What's actually gained by delegating anyway?
- *Failure mode:* an `IntersectionObserver`-based lazy-load never calls `observer.unobserve()` after swapping in the real image — what's the actual cost of leaving thousands of resolved observers still attached as a long infinite-scroll page grows?
- *Consistency:* a debounced search-input handler and a separate, un-debounced "clear results" button both mutate the same results array — walk through a race where a stale debounced search response lands *after* the user has already cleared the results, and how you'd guard against it (ties back to [`AbortController`, Part 20](20-browser-apis.md#4-abortcontroller)).

---

**Previous:** [Part 21 — DOM Manipulation & Event Delegation](21-dom-manipulation-and-event-delegation.md) · **Next:** [Part 23 — Modern JavaScript Features](23-modern-javascript-features.md)
