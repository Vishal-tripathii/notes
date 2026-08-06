# Angular Study Notes — Part 10

## Change Detection & Zone.js

> **Roadmap:** [Part 10](00-ROADMAP.md) · **Priority:** ⭐⭐⭐⭐⭐ — the hardest topic in Angular. Taught once, here, in full.
>
> **Continues:** [Part 07 — Lifecycle](07-lifecycle-hooks.md) · [Part 11 — Signals](11-signals.md) · [Part 18 — Performance](18-performance.md).

---

## Table of Contents

1. [The question](#question)
2. [Zone.js — the answer](#zonejs) ⭐
3. [What a cycle does](#cycle)
4. [`OnPush`](#onpush) ⭐
5. [`ChangeDetectorRef`](#cdr) ⭐
6. [`runOutsideAngular`](#outside)
7. [Where signals change things](#signals)
8. [Interview Q&A](#interview)
9. [The 60-second summary](#summary)

---

<a name="question"></a>
# 1. The question

You change a property:

```ts
this.name = 'Ravi';
```

The screen updates. **How did Angular know?**

There's no setter, no `setState()`, no subscription. You assigned to a plain field. Something must be watching.

---

<a name="zonejs"></a>
# 2. ⭐ Zone.js — the answer

Angular's answer is indirect and slightly outrageous: **it doesn't watch your data at all.** It watches for *anything that could have changed data*.

Every state change in a browser app originates from one of three things:

```
DOM events        click, input, submit
Timers            setTimeout, setInterval
Async I/O         HTTP, promises
```

Zone.js **monkey-patches all of them** at startup. It replaces the browser's `setTimeout`, `addEventListener`, `Promise`, `XMLHttpRequest` and friends with wrapped versions.

```
you call setTimeout(fn)
        ↓
Zone.js's patched setTimeout runs fn
        ↓
fn finishes  →  Zone tells Angular "something async just completed"
        ↓
Angular runs change detection
```

So Angular's real trigger isn't *"data changed"* — it's *"an async task finished, so data might have changed."*

That's a crude heuristic. It's also why it works with zero effort from you.

---

<a name="cycle"></a>
# 3. What a cycle does

Once triggered, Angular walks the component tree **from the root, top to bottom**:

```
AppComponent            check its bindings
    ├── Header          check its bindings
    ├── EmployeeList    check its bindings
    │     └── Card ×50  check each one's bindings
    └── Footer          check its bindings
```

For each component it re-evaluates every template expression and compares the result to the previous value. Different → update that piece of DOM.

Two things to notice:

**It checks every component**, not just the one that changed. Angular has no idea *which* data changed — only that something happened.

**It's a comparison of values, not a diff of the DOM.** Angular compares old and new values, then touches only the DOM that actually differs.

⚠️ This is why a method call in a template is expensive ([Part 05](05-pipes.md)) — it re-runs on every cycle, for every component.

---

<a name="onpush"></a>
# 4. ⭐ `OnPush`

Checking everything is wasteful. `OnPush` tells Angular: *skip this component unless I tell you otherwise.*

```ts
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
})
```

```
Default   check this component on EVERY cycle
OnPush    skip it unless one of four things happens
```

The four things that mark an `OnPush` component dirty:

```
1. an @Input REFERENCE changes
2. an event fires from this component or its children
3. markForCheck() is called
4. an async pipe in its template emits
```

And skipping a component skips its **entire subtree**:

```
AppComponent (Default)          checked
    └── Dashboard (OnPush)      SKIPPED
          └── Chart             skipped too — never even visited
```

That's where the performance win comes from.

**The catch is rule 1 — reference, not value:**

```ts
this.employee.name = 'Ravi';                          // mutation → does NOT update ❌
this.employee = { ...this.employee, name: 'Ravi' };   // new reference → updates ✅
```

Same lesson as `ngOnChanges` and pure pipes. `OnPush` is essentially a contract: *you promise to treat inputs as immutable, and Angular rewards you by skipping work.*

---

<a name="cdr"></a>
# 5. ⭐ `ChangeDetectorRef`

When the four rules aren't enough — data arrived from a source Angular can't see:

```ts
private cdr = inject(ChangeDetectorRef);
```

```ts
this.cdr.markForCheck();    // mark this component + ancestors dirty
                            // → checked on the NEXT cycle
this.cdr.detectChanges();   // run CD on this component + children RIGHT NOW
this.cdr.detach();          // remove from the CD tree entirely
```

The distinction interviews ask about:

```
markForCheck()   asks to be included next time   → asynchronous, safe
detectChanges()  runs a check immediately        → synchronous, can loop
```

Use `markForCheck` by default. `detectChanges` is for when you need the DOM updated before the next line runs.

---

<a name="outside"></a>
# 6. `runOutsideAngular`

Some code triggers cycles you don't want. A `mousemove` handler firing 60 times a second causes 60 full change detection runs.

```ts
private zone = inject(NgZone);

ngOnInit() {
  this.zone.runOutsideAngular(() => {
    window.addEventListener('mousemove', this.track);   // no CD triggered
  });
}

onDone() {
  this.zone.run(() => this.result = value);   // re-enter when you DO want an update
}
```

The pattern for animations, canvas drawing, scroll tracking, and any third-party library with its own render loop.

---

<a name="signals"></a>
# 7. Where signals change things

Zone.js's weakness is that it's a guess — *"something happened, check everything."*

Signals know exactly who depends on them:

```ts
count = signal(0);
this.count.set(5);
```

```
Zone.js   "something happened"  →  check the whole tree
Signal    "count changed"       →  update only what reads count
```

That's fine-grained reactivity, and it makes Zone.js unnecessary. **Zoneless** change detection drops the `zone.js` polyfill entirely — smaller bundle, readable stack traces, targeted updates.

The trade: without Zone.js, plain field mutation no longer triggers anything. State must live in signals, or you call `markForCheck` yourself.

*(The zoneless provider's exact name has changed across versions — check the docs for yours.)*

---

<a name="interview"></a>
# 8. Interview Q&A

### Q: How does Angular know when to update the view?

Zone.js monkey-patches the browser's async APIs — `setTimeout`, `addEventListener`, promises, XHR. When one of those completes, Zone notifies Angular, which runs change detection. So the trigger isn't "data changed", it's "an async task finished, so data might have changed."

### Q: What happens in a change detection cycle?

Angular walks the component tree from the root down, re-evaluating every template expression and comparing each result with its previous value. Where they differ, it updates that piece of DOM. It checks every component, because it doesn't know which data actually changed.

### Q: What does `OnPush` do?

It tells Angular to skip a component unless one of four things happens: an input reference changes, an event fires from the component or its children, `markForCheck` is called, or an async pipe in its template emits. Skipping a component skips its whole subtree, which is where the win comes from. The requirement is treating inputs as immutable — mutating an object won't change its reference, so the component won't update.

### Q: `markForCheck` vs `detectChanges`?

`markForCheck` marks the component and its ancestors dirty so they're included in the *next* cycle — asynchronous and safe. `detectChanges` runs change detection on that component and its children *immediately* and synchronously, which can cause loops if misused. I default to `markForCheck`.

### Q: When would you use `runOutsideAngular`?

For high-frequency events that shouldn't trigger a cycle each time — mousemove, scroll, animation frames, or a third-party library with its own render loop. I run the listener outside the zone and re-enter with `zone.run()` only when there's actually something to display.

### Q: What is zoneless change detection?

Dropping Zone.js entirely and relying on signals to notify Angular precisely what changed. Instead of "something happened, check everything," it's "this signal changed, update what reads it." Smaller bundle, cleaner stack traces, targeted updates — but state has to live in signals, since plain field mutation no longer triggers anything.

---

<a name="summary"></a>
# 9. The 60-second summary

> *"Angular doesn't watch your data — Zone.js patches the browser's async APIs, so when a click, timer or HTTP call completes, it tells Angular something might have changed. Angular then walks the component tree from the root down, re-evaluating every template expression and comparing it to its previous value, updating only the DOM that differs. Because it checks everything, `OnPush` exists: it skips a component and its entire subtree unless an input reference changes, an event fires from within it, `markForCheck` is called, or an async pipe emits — which is why `OnPush` requires treating inputs as immutable. `ChangeDetectorRef` gives manual control, where `markForCheck` schedules a check for the next cycle and `detectChanges` runs one immediately, and `runOutsideAngular` keeps high-frequency events from triggering cycles at all. Signals change the model entirely: instead of guessing that something changed, they know exactly what depends on them, which is what makes zoneless change detection possible."*

---

## Connects to

- **[Part 05 — Pipes](05-pipes.md):** pure pipes, and why `async` works with `OnPush`.
- **[Part 07 — Lifecycle](07-lifecycle-hooks.md):** which hooks run every cycle, and `ExpressionChangedAfterItHasBeenChecked`.
- **[Part 11 — Signals](11-signals.md):** fine-grained reactivity and zoneless.
- **[Part 18 — Performance](18-performance.md):** applying `OnPush` across a real app.

*— End of Part 10 —*
