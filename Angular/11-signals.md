# Angular Study Notes — Part 11

## Signals

> **Roadmap:** [Part 11](00-ROADMAP.md) · **Priority:** ⭐⭐⭐⭐☆
>
> **Continues:** [Part 10 — Change Detection](10-change-detection-and-zonejs.md) · [Part 12 — RxJS](12-rxjs.md) · [Part 16 — State](16-state-management.md).

---

## Table of Contents

1. [The problem](#problem)
2. [`signal()` — a value that announces changes](#signal)
3. [`computed()` — derived state](#computed) ⭐
4. [`effect()` — for side effects only](#effect) ⭐
5. [Signals in components](#components)
6. [Bridging to RxJS](#bridging)
7. [Signals vs RxJS](#vs-rxjs) ⭐
8. [Interview Q&A](#interview)
9. [The 60-second summary](#summary)

---

<a name="problem"></a>
# 1. The problem

From [Part 10](10-change-detection-and-zonejs.md): Angular's default model is a guess. *"Something async finished, so check the entire tree."*

The missing piece was a value that can say **who is reading me**. That's a signal.

---

<a name="signal"></a>
# 2. `signal()` — a value that announces changes

```ts
count = signal(0);

count();                     // read  → 0
count.set(5);                // write
count.update(n => n + 1);    // write based on current
```

The read is a **function call**. That's the whole trick — calling it is how Angular records "this template or computation depends on this value."

```
count()  in a template
    ↓
Angular notes: this view depends on `count`
    ↓
count.set(5)
    ↓
Angular updates exactly that view
```

⚠️ Signals compare with `Object.is`. Setting the same value notifies nobody — and mutating an object inside a signal doesn't count as a change. Replace, don't mutate.

---

<a name="computed"></a>
# 3. ⭐ `computed()` — derived state

```ts
items    = signal<Item[]>([]);
taxRate  = signal(0.18);

subtotal = computed(() => this.items().reduce((s, i) => s + i.price, 0));
total    = computed(() => this.subtotal() * (1 + this.taxRate()));
```

Two properties that matter:

**Lazy** — the function doesn't run until something reads `total()`. A computed nobody reads costs nothing.

**Memoised** — it re-runs only when a dependency actually changes, then caches. Read it fifty times in a template, it computes once.

```ts
{{ total() }}       // ✅ cached
{{ getTotal() }}    // ❌ a method — runs every change detection cycle
```

That comparison is the practical reason signals matter day to day.

Dependencies are tracked **automatically, at read time**. You never declare them — no dependency array to get wrong.

---

<a name="effect"></a>
# 4. ⭐ `effect()` — for side effects only

```ts
constructor() {
  effect(() => {
    console.log('user changed:', this.user().name);
    localStorage.setItem('user', JSON.stringify(this.user()));
  });
}
```

An effect runs once immediately, then again whenever any signal it read changes.

**The rule:** if you're producing a value, use `computed`. Use `effect` only for things outside Angular — logging, `localStorage`, analytics, a third-party chart library.

```
Deriving a value?     computed()
Touching the world?   effect()
```

Cleanup works like `ngOnDestroy`, but local:

```ts
effect((onCleanup) => {
  const id = setInterval(() => this.poll(), 1000);
  onCleanup(() => clearInterval(id));
});
```

⚠️ Writing to a signal inside an effect is a common way to create loops. Reach for `computed` first.

---

<a name="components"></a>
# 5. Signals in components

From [Part 06](06-component-communication.md):

```ts
employee = input.required<Employee>();   // input as a signal
delete   = output<number>();
selected = model(false);                 // two-way

displayName = computed(() => `${this.employee().name} (${this.employee().role})`);
```

Because inputs are signals, derived values just work — no `ngOnChanges`, no setter.

---

<a name="bridging"></a>
# 6. Bridging to RxJS

```ts
user   = toSignal(this.userService.user$, { initialValue: null });
query$ = toObservable(this.searchTerm);
```

`toSignal` also subscribes and unsubscribes for you — the `async` pipe's job, but in the class.

---

<a name="vs-rxjs"></a>
# 7. ⭐ Signals vs RxJS

Not competitors. They solve different problems.

```
SIGNALS                          RXJS
synchronous state                events over time
"what is the value now?"         "what happened, in what order?"
always has a current value       may not have emitted yet
no operators needed              debounce, retry, cancel, combine
```

Concretely: **cart contents, form state, a selected tab → signal.** **Type-ahead search with debounce and cancellation, WebSocket streams, polling → RxJS.**

Against `BehaviorSubject` specifically, signals are simpler for the same job: no `.next()`, no subscription, no `async` pipe, no leak risk, and `computed` replaces a chain of `map` operators.

---

<a name="interview"></a>
# 8. Interview Q&A

### Q: What is a signal and why was it added?

A signal is a value that tracks who reads it. Angular's default change detection is a guess — Zone.js says "something happened", so the whole tree is checked. A signal knows exactly which views and computations depend on it, so Angular can update only those. That's what makes zoneless change detection possible.

### Q: `computed` vs `effect`?

`computed` derives a new value — it's lazy, memoised and read-only. `effect` performs a side effect outside Angular, like logging or writing to `localStorage`. If you're producing a value it should be `computed`; using an effect to set another signal is how you get loops.

### Q: Why is `computed` better than a method in the template?

A method re-runs on every change detection cycle. A `computed` re-runs only when one of its dependencies changes, and caches the result — so reading it many times in a template costs one computation.

### Q: Signal vs `BehaviorSubject`?

Both hold a current value. The signal is simpler for plain state: read it by calling it, no subscription, no unsubscribe, and `computed` replaces operator chains. RxJS still wins for anything time-based — debouncing, cancelling in-flight requests, retries, combining streams.

### Q: My signal changed but nothing updated. Why?

Almost certainly a mutation. Signals compare with `Object.is`, so pushing to an array or setting a property on an object inside a signal keeps the same reference and notifies nobody. Set a new array or object instead.

### Q: How do signals know their dependencies?

They're tracked at read time. When a computed or effect runs, every signal it calls registers itself as a dependency — so the graph is built automatically and updates dynamically as branches change. There's no dependency array to declare.

---

<a name="summary"></a>
# 9. The 60-second summary

> *"A signal is a value that knows who reads it. You read it by calling it, and that call is what registers the dependency — so instead of Zone.js guessing that something changed and checking the whole tree, Angular knows precisely which views depend on which values. `computed` derives state from other signals: it's lazy, so it doesn't run until read, and memoised, so it recalculates only when a dependency actually changes — which is why it's the right answer to a method call in a template. `effect` is for side effects outside Angular like logging or storage, not for producing values, since writing signals inside effects causes loops. Dependencies are tracked automatically at read time, so there's no dependency array. Signals compare with `Object.is`, so mutating an object inside one won't notify anything. And they don't replace RxJS — signals are synchronous state, RxJS is events over time, so debouncing, cancellation and retries stay with RxJS, with `toSignal` and `toObservable` bridging the two."*

---

## Connects to

- **[Part 06 — Communication](06-component-communication.md):** `input()`, `output()`, `model()` and signal queries.
- **[Part 10 — Change Detection](10-change-detection-and-zonejs.md):** fine-grained updates and zoneless.
- **[Part 12 — RxJS](12-rxjs.md):** the other half of reactivity.
- **[Part 16 — State](16-state-management.md):** a signal service as the default state container.

*— End of Part 11 —*
