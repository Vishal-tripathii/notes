# JavaScript Study Notes — Part 10

## Event Loop & Concurrency Model ⭐⭐⭐⭐⭐

> ⚠️ Cross-reference, don't duplicate: [nodejs Part 01](../nodejs/01-javascript-execution-model.md) covers this in a Node/libuv context in real depth already. This part is scoped to the **browser** delta only.

---

## 1. The Shared Foundation (quick recap)

> **Definition — Event Loop:** the runtime mechanism that continuously checks whether the call stack is empty, and if so, pushes the next callback from a queue onto it — the thing that lets a single-threaded language handle asynchronous work without blocking.

JS has one call stack, one thing runs at a time. Slow work (timers, network, DOM events) doesn't block that stack — it's handed off, and a callback gets queued for when the stack is empty. It can never interrupt currently-running code — that's why `setTimeout(fn, 0)` means "as soon as the stack is free," not "now."

## 2. What's Different in the Browser

> **Definition — Web APIs:** browser-provided capabilities (`setTimeout`, `fetch`, DOM events, `addEventListener`) that are **not part of the JS language itself** — they're supplied by the host environment (the browser), the same role `libuv` plays for Node.
> **Definition — Microtask:** a callback (promise `.then`, `queueMicrotask`) queued to run immediately after the current synchronous code finishes, and before any macrotask — the entire microtask queue drains completely before the next macrotask runs.
> **Definition — Macrotask (task):** a callback (`setTimeout`, a DOM event, `postMessage`) queued to run on a later, separate turn of the event loop — only one macrotask runs per loop iteration.

| | Node | Browser |
|---|---|---|
| Who provides async I/O | libuv (thread pool + OS event notification) | **Web APIs** — the browser itself (not the JS engine) provides `setTimeout`, `fetch`, DOM events |
| Highest-priority queue | `process.nextTick()` — runs before even promise microtasks | **no equivalent** — doesn't exist in browsers |
| Render-aligned queue | n/a | **`requestAnimationFrame`** — its own queue, run once per frame, right before repaint |
| Macrotask sources | timers, I/O, `setImmediate` | timers, DOM events (click, scroll, input), `postMessage`, `fetch` completions |

## 3. The Priority Order (browser)

```
1. Run all synchronous code (empty the call stack)
2. Drain the ENTIRE microtask queue (promises, queueMicrotask) — completely, before anything else
3. Run ONE task from the macrotask queue (setTimeout, DOM events, postMessage)
4. Before the next repaint: run requestAnimationFrame callbacks
5. Repaint
6. Back to step 2 — check microtasks again
... repeat
```
**The critical rule:** microtasks are drained **completely** — if a microtask schedules another microtask, that one runs too, before any macrotask or repaint happens. This is why a runaway promise chain can starve rendering and timers entirely, even though nothing is technically "blocking" in the traditional sense.

```js
console.log('1');
setTimeout(() => console.log('2'), 0);              // macrotask
Promise.resolve().then(() => console.log('3'));       // microtask
requestAnimationFrame(() => console.log('4'));          // render-aligned, its own queue
console.log('5');
// 1, 5, 3, 4 (right before the next repaint), 2 (next macrotask turn)
// exact 4-vs-2 ordering can vary by browser/frame timing — the reliable part is 1,5,3 first
```

## 4. `requestAnimationFrame` vs `setTimeout(fn, 16)`

> **Definition:** `requestAnimationFrame` schedules a callback to run once, right before the browser's next repaint, synced to the actual display refresh rate rather than a fixed guessed interval.

```js
// naive "60fps" attempt
setInterval(updatePosition, 16); // guesses at the frame rate, drifts, runs even when tab is hidden

requestAnimationFrame(function loop() {
  updatePosition();
  requestAnimationFrame(loop); // schedules the NEXT frame, synced to actual display refresh
});
```
`requestAnimationFrame` won't run faster than the screen can display, automatically pauses in a backgrounded tab (saving battery/CPU), and doesn't drift the way a fixed `setTimeout` interval does under load.

---

## Interview Q&A

**Q: What's different about the event loop in the browser vs Node?**
> The core mechanism is identical — one call stack, a microtask queue, a macrotask queue, drained in that priority order. What differs is who provides the async work: in Node it's libuv plus the OS; in the browser it's the browser's own Web APIs. Node also has `process.nextTick`, an even-higher-priority queue than microtasks, which browsers don't have at all. And browsers add `requestAnimationFrame`, a queue that runs once per frame right before repaint, which has no Node equivalent since Node doesn't render anything.

**Q: Why is `requestAnimationFrame` better than `setTimeout` for animation?**
> It's synced to the actual display refresh rate instead of guessing a fixed interval, so it doesn't drift or run faster than the screen can show. It also automatically pauses when the tab isn't visible, which a `setInterval` loop keeps firing through, wasting battery and CPU for no visible benefit.

**Q: Predict the output.**
```js
console.log('start');
setTimeout(() => console.log('timeout'), 0);
Promise.resolve().then(() => console.log('promise 1')).then(() => console.log('promise 2'));
console.log('end');
```
> `start, end, promise 1, promise 2, timeout` — synchronous code first, then the ENTIRE microtask chain drains (both `.then`s) before the engine even looks at the macrotask queue.

---

## Follow-ups (challenge questions)

- *Failure mode:* a component's cleanup schedules a promise chain that never resolves (an infinite `.then()` chain) — what actually happens to the page, and why does it look like a hang rather than a crash?
- *Scale:* a scroll handler updates DOM state on every `scroll` event, unthrottled — connect this back to [Part 22 — Performance Patterns](22-performance-patterns.md): why does this specifically compete with `requestAnimationFrame` for the same frame budget?
- *Consistency:* two `setTimeout(fn, 0)` calls scheduled from two different user interactions milliseconds apart — is their relative order guaranteed? What about two `Promise.resolve().then()` calls?

---

**Previous:** [Part 09 — Classes](09-classes.md) · **Next:** [Part 11 — Promises](11-promises.md)
