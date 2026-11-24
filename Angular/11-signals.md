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
   - [4.5 The rest of the toolbox: `linkedSignal`, `untracked`, equality, `toSignal` options](#advanced) ⭐
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

An effect runs **at least once**, then again whenever any signal it read changes. ⚠️ It does **not** run synchronously the moment you create it — Angular **schedules** it. Effects created in a component run during change detection, just before that component's template is checked; "root" effects (in services) run as part of the app's change-detection pass too. And if several signals change in a row, the effect runs **once** with the final values, not once per change.

Must be created in an **injection context** (constructor or field initializer) — or pass `{ injector }`. It's destroyed automatically with its component.

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

⚠️ Writing to a signal inside an effect is a common way to create loops. Reach for `computed` (or `linkedSignal`, §4.5) first. (Old code may pass `{ allowSignalWrites: true }` — that option was removed in v19; writes are allowed now, but still usually a design smell.)

---

<a name="advanced"></a>
# 4.5 ⭐ The rest of the signal toolbox

### `linkedSignal()` — derived, but you can still overwrite it (v19, stable v20)

`computed()` is read-only. Sometimes you want "a value that **resets** when its source changes, but the user can also change it." Classic case: a selected option that should reset when the list changes.

```ts
options  = input.required<string[]>();
selected = linkedSignal(() => this.options()[0]);   // follows options…

pick(o: string) { this.selected.set(o); }           // …but writable by the user
// when options() changes, selected resets to the new first option
```

> 🧠 **Remember:** `computed` = **calculated, read-only.** `linkedSignal` = **calculated default you're allowed to overwrite.** `signal` = **just a box.**

### `untracked()` — read without subscribing

Inside a `computed` or `effect`, every signal you read becomes a dependency. Wrap a read in `untracked` when you want its current value but **don't** want changes to it to re-run you:

```ts
effect(() => {
  const user = this.user();                         // re-run when user changes…
  const theme = untracked(() => this.theme());      // …but NOT when theme changes
  analytics.log('user-changed', { user, theme });
});
```

### Custom equality

By default a signal notifies when the new value isn't `Object.is`-equal. You can change that:

```ts
filters = signal({ q: '', page: 1 }, { equal: (a, b) => a.q === b.q && a.page === b.page });
filters.set({ q: '', page: 1 });   // equal → nobody notified
```

### `toSignal` options

```ts
user  = toSignal(this.user$);                              // Signal<User | undefined> — undefined until first emit
user2 = toSignal(this.user$, { initialValue: null });      // Signal<User | null>
count = toSignal(this.store.count$, { requireSync: true });// Observable emits synchronously (BehaviorSubject) → no undefined
```

`toSignal` subscribes immediately and unsubscribes when the component is destroyed. If the Observable errors, reading the signal **throws** — handle errors in the stream (`catchError`) first.

### Signal input `transform` and `alias`

```ts
disabled = input(false, { transform: booleanAttribute });   // <app-x disabled> → true
size     = input(0, { transform: numberAttribute });        // <app-x size="3"> → 3
```

### Reading a signal "inside" a template is what makes it reactive

```ts
// ✅ the template reads count() → this view updates when count changes (even with OnPush / zoneless)
// ❌ copying it into a plain field once (this.n = this.count()) loses that link
```

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

### Q: `computed` vs `linkedSignal`?

`computed` is derived and read-only. `linkedSignal` is derived too, but writable — it resets whenever its source changes, and in between you can `set` it. Use it for things like a selection that should reset when its list of options changes.

### Q: When does an effect run?

At least once, but not synchronously when created — Angular schedules it and runs it during change detection (component effects just before that component is checked). Several signal changes in a row cause one run with the latest values. Use `untracked()` for reads that shouldn't trigger it.

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
