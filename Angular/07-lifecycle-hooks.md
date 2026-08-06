# Angular Study Notes — Part 07

## Lifecycle Hooks

> **Roadmap:** [Part 07](00-ROADMAP.md) · **Priority:** ⭐⭐⭐⭐⭐
>
> **Continues:** [Part 06 — Communication](06-component-communication.md) · [Part 10 — Change Detection](10-change-detection-and-zonejs.md).

---

## Table of Contents

1. [Why hooks exist](#why)
2. [The full order](#order) ⭐
3. [`constructor` vs `ngOnInit`](#constructor) ⭐
4. [`ngOnChanges`](#onchanges)
5. [`ngDoCheck` — the expensive one](#docheck)
6. [Content hooks vs view hooks](#content-view)
7. [Parent and child order](#parent-child) ⭐
8. [Cleanup](#cleanup)
9. [`ExpressionChangedAfterItHasBeenChecked`](#expression-changed) ⭐
10. [Interview Q&A](#interview)
11. [The 60-second summary](#summary)

---

<a name="why"></a>
# 1. Why hooks exist

A component has a **lifetime**:

```
created  →  inputs arrive  →  rendered  →  updated…updated…  →  destroyed
```

You need to do things at specific moments in it — fetch data once it's ready, measure a DOM element after it's painted, cancel a subscription before it dies.

Hooks are Angular saying: **name the moment, and I'll call your method then.**

```ts
export class UserComponent implements OnInit {
  ngOnInit() { … }     // Angular calls this. You never do.
}
```

`implements OnInit` isn't required at runtime, but use it — it turns a typo (`ngOninit`) from a silent no-op into a compile error.

---

<a name="order"></a>
# 2. ⭐ The full order

First render:

```
constructor              ← not a hook. DI only.
     ↓
ngOnChanges              inputs have arrived
     ↓
ngOnInit                 ready                    ← once
     ↓
ngDoCheck                every cycle
     ↓
ngAfterContentInit       projected content ready  ← once
     ↓
ngAfterContentChecked    every cycle
     ↓
ngAfterViewInit          own template ready       ← once
     ↓
ngAfterViewChecked       every cycle
```

Every cycle after that, only the repeating ones run:

```
ngOnChanges (if inputs changed) → ngDoCheck → ngAfterContentChecked → ngAfterViewChecked
```

Then, once: `ngOnDestroy`.

**`Init` hooks fire once. `Checked` hooks fire forever.**

⚠️ That second group runs on every cycle across the whole app — potentially hundreds of times a second. Never put an HTTP call or heavy computation in one.

---

<a name="constructor"></a>
# 3. ⭐ `constructor` vs `ngOnInit`

The most asked lifecycle question.

The constructor runs when the class is instantiated. Angular has resolved dependencies by then, but has **not yet set the inputs**.

```ts
export class EmployeeCardComponent implements OnInit {
  @Input() employee!: Employee;

  constructor(private service: EmployeeService) {
    console.log(this.employee);   // undefined ❌
  }

  ngOnInit() {
    console.log(this.employee);   // { id: 1, name: 'Asha' } ✅
  }
}
```

```
constructor   →  dependencies exist,  inputs DON'T
ngOnInit      →  dependencies exist,  inputs DO
```

> **Constructor: dependency injection only. Everything else: `ngOnInit`.**

The second reason is testability — a constructor that fires HTTP calls can't be instantiated in a test without triggering all of it.

---

<a name="onchanges"></a>
# 4. `ngOnChanges`

Fires **before `ngOnInit`**, and again whenever a bound input changes.

```ts
ngOnChanges(changes: SimpleChanges) {
  if (changes['employeeId'] && !changes['employeeId'].firstChange) {
    this.loadDetails(changes['employeeId'].currentValue);
  }
}
```

Each entry gives you `previousValue`, `currentValue` and `firstChange`.

Two traps:

**It only fires for inputs bound in a template.** Set the property directly from a `ViewChild` and nothing happens.

**It compares by reference** — the same lesson as pure pipes ([Part 05](05-pipes.md)):

```ts
this.employee.name = 'Ravi';                          // mutation → does NOT fire ❌
this.employee = { ...this.employee, name: 'Ravi' };   // new reference → fires ✅
```

Modern alternative — a signal input plus `computed`, reacting to the value rather than to a lifecycle event:

```ts
employeeId = input.required<number>();
details = computed(() => this.lookup(this.employeeId()));
```

---

<a name="docheck"></a>
# 5. `ngDoCheck` — the expensive one

Runs on **every change detection cycle**, triggered by any click, keystroke or HTTP response anywhere in the app.

Its legitimate use is detecting changes Angular can't see by reference — a mutation inside an object, via `KeyValueDiffers`. But you're adding work to every cycle in the application, so it has to be trivial.

In modern Angular you rarely need it: signals detect their own changes ([Part 11](11-signals.md)), which is the problem `ngDoCheck` existed to work around.

---

<a name="content-view"></a>
# 6. Content hooks vs view hooks

From [Part 06](06-component-communication.md):

```
CONTENT  =  markup the PARENT projected in via <ng-content>
VIEW     =  the component's OWN template
```

```ts
ngAfterContentInit() {
  this.tabs.first.active = true;                     // ContentChild ready here
}

ngAfterViewInit() {
  console.log(this.nav.nativeElement.offsetWidth);   // ViewChild ready here
}
```

Content is ready **before** view, because the parent hands over projected markup before the component finishes rendering its own.

---

<a name="parent-child"></a>
# 7. ⭐ Parent and child order

```
Parent  constructor → ngOnChanges → ngOnInit → ngDoCheck
Parent  ngAfterContentInit → ngAfterContentChecked
        │
        │  the parent renders its template, which creates the child
        ▼
Child   constructor → ngOnChanges → ngOnInit → ngDoCheck
Child   ngAfterContentInit → ngAfterContentChecked
Child   ngAfterViewInit          ← child's view completes FIRST
Child   ngAfterViewChecked
        │
        ▼
Parent  ngAfterViewInit          ← parent's view completes LAST
Parent  ngAfterViewChecked
```

**Init hooks go top-down. View hooks complete bottom-up.**

A parent's view isn't finished until its children are — which is exactly why you can measure a child's DOM in the parent's `ngAfterViewInit`.

---

<a name="cleanup"></a>
# 8. Cleanup

Everything a component **starts**, it must **stop**.

```ts
ngOnDestroy() {
  this.sub?.unsubscribe();
  clearInterval(this.timer);
  window.removeEventListener('resize', this.onResize);
}
```

Skip it and you get a real leak: the component leaves the DOM, but the live subscription still holds a reference to it, so the instance stays in memory — still reacting to events.

```
subscription     →  unsubscribe()
setInterval      →  clearInterval()
addEventListener →  removeEventListener()
observer         →  disconnect()
```

Two things remove the burden entirely.

**The `async` pipe** unsubscribes for you ([Part 05](05-pipes.md)) — templates using `| async` need no cleanup.

**`takeUntilDestroyed()`** ties an Observable's life to the component's:

```ts
constructor() {
  this.feed.messages$
    .pipe(takeUntilDestroyed())     // no ngOnDestroy needed
    .subscribe(m => this.messages.push(m));
}
```

Outside an injection context, pass a `DestroyRef`:

```ts
private destroyRef = inject(DestroyRef);

load() {
  this.service.poll().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
}
```

`DestroyRef.onDestroy(fn)` does the same for non-Observable cleanup. The win in both cases: **setup and teardown sit next to each other**.

---

<a name="expression-changed"></a>
# 9. ⭐ `ExpressionChangedAfterItHasBeenCheckedError`

Everyone hits this. Almost nobody can explain it.

```ts
ngAfterViewInit() {
  this.title = 'Loaded';    // 💥
}
```

In development mode Angular runs change detection **twice** and compares the results — a verification pass checking that one round produced a stable result.

```
Pass 1:  render → title = 'Loading'
         ngAfterViewInit runs → title = 'Loaded'
Pass 2:  render → title = 'Loaded'

'Loading' ≠ 'Loaded'  →  ERROR
```

Angular is saying: *a value changed after I finished rendering it.* That's a real problem — one pass wasn't enough, and in a bad case it can loop.

The check runs **only in development**. In production the error disappears; the instability doesn't.

Fixes, best first:

```ts
ngOnInit() { this.title = 'Loaded'; }              // 1. do it earlier — usually the answer
this.cdr.detectChanges();                          // 2. ask for another check
setTimeout(() => this.title = 'Loaded');           // 3. works, but papers over the design
```

---

<a name="interview"></a>
# 10. Interview Q&A

### Q: Constructor vs `ngOnInit`?

The constructor runs before Angular sets any inputs, so `@Input` values are undefined there. `ngOnInit` runs after the first `ngOnChanges`, when inputs are available. Constructor for DI only — which also keeps the class easy to construct in tests.

### Q: Give me the full hook order.

`ngOnChanges`, `ngOnInit`, `ngDoCheck`, `ngAfterContentInit`, `ngAfterContentChecked`, `ngAfterViewInit`, `ngAfterViewChecked`, then `ngOnDestroy`. Init hooks fire once; Checked hooks fire on every change detection cycle.

### Q: In what order do parent and child hooks run?

Init hooks top-down, view hooks bottom-up. The child's `ngAfterViewInit` fires before the parent's, because the parent's view isn't complete until its children are.

### Q: Why do content and view have separate hooks?

Content is markup projected in by the parent through `ng-content`; view is the component's own template. Content is handed over first, so `ngAfterContentInit` fires before `ngAfterViewInit` — matching `ContentChild` and `ViewChild`.

### Q: What causes `ExpressionChangedAfterItHasBeenCheckedError`?

Dev mode runs change detection twice and compares results. If a value changed after the first pass — typically because I set state in `ngAfterViewInit` — the passes disagree. The fix is usually to move the work into `ngOnInit`. It only appears in development, but it flags a real instability.

### Q: How do you avoid memory leaks?

Everything the component starts, it stops — unsubscribe, clear intervals, remove listeners. Better, use the `async` pipe or `takeUntilDestroyed()`, so teardown lives next to setup instead of in a separate method.

### Q: When would you use `ngDoCheck`?

Rarely. It runs on every cycle across the whole app, so it must be trivial. Its real use is detecting mutations Angular can't see by reference, via `KeyValueDiffers` — and signals mostly remove that need.

---

<a name="summary"></a>
# 11. The 60-second summary

> *"Hooks let me run code at specific moments in a component's life: `ngOnChanges`, `ngOnInit`, `ngDoCheck`, the content hooks, the view hooks, then `ngOnDestroy` — Init hooks once, Checked hooks every cycle. The constructor is for DI only, since inputs aren't bound yet. `ngOnChanges` compares by reference, so mutating an object won't trigger it. Content hooks fire before view hooks, and across a tree init hooks run top-down while view hooks complete bottom-up, because a parent's view isn't done until its children are. `ngOnDestroy` is the cleanup contract, though `takeUntilDestroyed` and the `async` pipe remove most of that work. And `ExpressionChangedAfterItHasBeenChecked` means a value changed after rendering finished — dev mode catches it by checking twice, and the fix is almost always to do that work earlier."*

---

## Connects to

- **[Part 06 — Communication](06-component-communication.md):** `ContentChild` vs `ViewChild`, and the `static` flag.
- **[Part 10 — Change Detection](10-change-detection-and-zonejs.md):** what a cycle is, and why dev mode checks twice.
- **[Part 11 — Signals](11-signals.md):** `computed` replacing `ngOnChanges`.
- **[Part 12 — RxJS](12-rxjs.md):** subscription management and `takeUntilDestroyed`.

*— End of Part 07 —*
