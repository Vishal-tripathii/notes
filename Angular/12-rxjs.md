# Angular Study Notes — Part 12

## RxJS

> **Format:** code-heavy by design. RxJS is learned by reading streams, so every operator here gets a marble timeline and a real example.
>
> **Roadmap:** [Part 12](00-ROADMAP.md) · **Priority:** ⭐⭐⭐⭐⭐ — the highest-frequency Angular interview topic.
>
> **Continues:** [Part 11 — Signals](11-signals.md) · [Part 13 — HttpClient](13-httpclient-and-interceptors.md) · [Part 07 — Lifecycle](07-lifecycle-hooks.md).

---

## Table of Contents

1. [The problem](#problem)
2. [Observable vs Promise](#vs-promise)
3. [What an Observable actually is](#anatomy)
4. [Cold vs hot](#cold-hot) ⭐
5. [Subjects](#subjects) ⭐
6. [Operators and `pipe()`](#operators)
7. [The four flattening operators](#flattening) ⭐⭐
8. [Combining streams](#combining)
9. [Error handling](#errors) ⭐
10. [Rate limiting](#rate)
11. [Memory leaks](#leaks) ⭐
12. [Everything in one example](#together)
13. [Interview Q&A](#interview)
14. [The 60-second summary](#summary)

---

<a name="problem"></a>
# 1. The problem

A `Promise` gives you **one** value, **once**:

```ts
const user = await fetchUser();   // one value, then done
```

But most of what an app deals with isn't one value:

```
keystrokes in a search box       many values, over time
websocket messages               many values, over time
route parameter changes          many values, over time
```

An **Observable** is a Promise generalised to a **stream** — zero, one, or many values, arriving whenever.

---

<a name="vs-promise"></a>
# 2. Observable vs Promise

```
PROMISE                          OBSERVABLE
one value                        0…n values
eager — starts immediately       lazy — starts on subscribe()
can't cancel                     unsubscribe() cancels
.then()                          .pipe(operators).subscribe()
```

Two of those matter in practice. Prove them to yourself:

```ts
// EAGER — this fetch fires immediately, even though nobody awaits it
const p = fetch('/api/users');

// LAZY — no request is sent. Nothing at all happens.
const obs = this.http.get('/api/users');

// NOW it fires
obs.subscribe(users => console.log(users));
```

```ts
// CANCELLABLE — this actually aborts the in-flight HTTP request
const sub = this.http.get('/api/slow').subscribe(r => console.log(r));
setTimeout(() => sub.unsubscribe(), 100);   // request cancelled at 100ms
```

The lazy behaviour catches everyone once: *"why didn't my HTTP call fire?"* — because nothing subscribed.

---

<a name="anatomy"></a>
# 3. What an Observable actually is

Strip away the library and it's a function that pushes values to an observer:

```ts
const numbers$ = new Observable<number>(observer => {
  observer.next(1);
  observer.next(2);

  const id = setInterval(() => observer.next(Date.now()), 1000);

  // the teardown function — runs on unsubscribe or complete
  return () => clearInterval(id);
});
```

An observer has three callbacks, and `subscribe` accepts all three:

```ts
numbers$.subscribe({
  next:     value => console.log('value:', value),
  error:    err   => console.error('failed:', err),   // terminal — nothing follows
  complete: ()    => console.log('done'),             // terminal — nothing follows
});
```

```
next  next  next  complete       ← a normal stream
next  next  error                ← a failed stream (no complete)
```

`error` and `complete` are both **terminal**. Once either fires, the stream is finished — which is exactly why an unhandled error in a search stream silently kills the search box.

---

<a name="cold-hot"></a>
# 4. ⭐ Cold vs hot

```
COLD   each subscriber gets its OWN execution
HOT    all subscribers SHARE one execution
```

```ts
// COLD — the producer lives inside the Observable
const cold$ = this.http.get('/api/users');

cold$.subscribe(u => console.log('A', u));   // HTTP request #1
cold$.subscribe(u => console.log('B', u));   // HTTP request #2 — a second call!
```

```ts
// HOT — the producer lives outside; subscribers share it
const hot$ = new Subject<number>();

hot$.subscribe(v => console.log('A', v));
hot$.subscribe(v => console.log('B', v));
hot$.next(1);        // A 1, B 1 — one emission, both see it
```

This is why `| async` used twice on the same HTTP Observable fires two requests ([Part 05](05-pipes.md)). To share one execution, use `shareReplay`:

```ts
users$ = this.http.get<User[]>('/api/users').pipe(
  shareReplay({ bufferSize: 1, refCount: true }),
);
// now any number of subscribers share ONE request
```

---

<a name="subjects"></a>
# 5. ⭐ Subjects

A plain Observable produces its own values. A `Subject` lets *you* push them in — it's both an Observable and an observer.

Three variants. The difference is **what a late subscriber sees**:

```ts
// ── Subject: nothing before you subscribed ────────────────
const s = new Subject<string>();
s.next('a');                                  // nobody listening — lost forever
s.subscribe(v => console.log('sub:', v));
s.next('b');                                  // sub: b

// ── BehaviorSubject: the current value, immediately ───────
const b = new BehaviorSubject<string>('initial');   // initial value REQUIRED
b.next('updated');
b.subscribe(v => console.log('sub:', v));     // sub: updated   ← gets it on subscribe
b.next('again');                              // sub: again
console.log(b.value);                         // 'again' — synchronous read

// ── ReplaySubject: the last n values ──────────────────────
const r = new ReplaySubject<string>(2);       // buffer the last 2
r.next('a'); r.next('b'); r.next('c');
r.subscribe(v => console.log('sub:', v));     // sub: b, sub: c
```

```
Subject           →  future emissions only
BehaviorSubject   →  current value + future     (state container)
ReplaySubject(n)  →  last n values + future     (history)
```

The classic `BehaviorSubject` state service — the pattern you'll see in every pre-signals codebase:

```ts
@Injectable({ providedIn: 'root' })
export class CartService {
  private items$$ = new BehaviorSubject<Item[]>([]);   // private, writable
  readonly items$ = this.items$$.asObservable();       // public, read-only
  readonly count$ = this.items$.pipe(map(items => items.length));

  add(item: Item) {
    this.items$$.next([...this.items$$.value, item]);  // new array, not push()
  }
}
```

Note `asObservable()` — it stops consumers calling `.next()` and writing to your state from anywhere. Signals do this job more simply now ([Part 11](11-signals.md)), but you must be able to read this pattern.

---

<a name="operators"></a>
# 6. Operators and `pipe()`

Operators are pure functions that take a stream and return a new one. Nothing is mutated.

```ts
source$.pipe(
  map(x => x * 2),
  filter(x => x > 10),
  tap(x => console.log('passing through:', x)),   // side effect, stream unchanged
).subscribe(console.log);
```

The five groups worth knowing:

```
transform     map, scan, tap
filter        filter, take, first, takeWhile, distinctUntilChanged
flatten       switchMap, mergeMap, concatMap, exhaustMap    ⭐
combine       forkJoin, combineLatest, withLatestFrom, merge
error/rate    catchError, retry, finalize, debounceTime, throttleTime
```

`tap` is the one people underuse — it's how you log or set a loading flag mid-pipe without disturbing the values:

```ts
this.api.getUsers().pipe(
  tap(() => this.loading.set(true)),
  tap({ finalize: () => this.loading.set(false) }),
)
```

`scan` is `reduce` for streams — it emits the running accumulator on every value:

```ts
clicks$.pipe(scan(count => count + 1, 0)).subscribe(n => console.log('clicks:', n));
// 1, 2, 3, 4…
```

---

<a name="flattening"></a>
# 7. ⭐⭐ The four flattening operators

The guaranteed interview question.

**The problem:** each value in your stream needs to trigger *another* Observable. A search term → an HTTP call. Without flattening you'd have an Observable of Observables:

```ts
searchTerm$.pipe(
  map(term => this.api.search(term)),   // ❌ Observable<Observable<Result[]>>
)
```

All four flatten that. They differ in **what happens when a new value arrives while the previous inner Observable is still running.**

## `switchMap` — cancel the previous

```
outer:        --A-----B------------->
A → inner:      --a1--✗                 cancelled the moment B arrives
B → inner:            --b1--b2--->
output:         --a1----b1--b2--->
```

```ts
// Type-ahead search. User types "ang", then "angu" 200ms later.
// The "ang" request is CANCELLED — you only ever want the latest result.
searchTerm$.pipe(
  switchMap(term => this.api.search(term))
).subscribe(results => this.results.set(results));
```

Without it you get a race: the slow "ang" response can land *after* the fast "angu" one and overwrite the correct results with stale ones.

Also the right choice for route params:

```ts
this.route.paramMap.pipe(
  switchMap(params => this.api.getEmployee(params.get('id')!))
).subscribe(emp => this.employee.set(emp));
```

## `mergeMap` — run everything at once

```
outer:        --A-----B------------->
A → inner:      --a1------a2--->
B → inner:            --b1------b2--->
output:         --a1--b1--a2--b2--->    interleaved, no ordering
```

```ts
// Five file uploads. They're independent and order doesn't matter —
// run them concurrently.
from(files).pipe(
  mergeMap(file => this.api.upload(file), 3)   // optional: max 3 at a time
).subscribe(res => console.log('uploaded', res));
```

⚠️ `mergeMap` on a stream you don't control is how you accidentally fire 200 concurrent requests. Use the concurrency argument.

## `concatMap` — queue them in order

```
outer:        --A--B--------------->
A → inner:      --a1--a2|
B → inner:              --b1--b2|      starts only after A COMPLETES
output:         --a1--a2--b1--b2--->
```

```ts
// Saving edits. Request 2 must not overtake request 1, or the server
// ends up with the older value written last.
edits$.pipe(
  concatMap(edit => this.api.save(edit))
).subscribe();
```

## `exhaustMap` — ignore new while busy

```
outer:        --A--B---------C----->    B arrives while A is in flight
A → inner:      --a1--a2|
B:                 ✗ ignored entirely
C → inner:                   --c1-->
output:         --a1--a2-------c1-->
```

```ts
// Login button. The user double-clicks; ignore every click until the
// first login resolves. No duplicate login requests.
loginClicks$.pipe(
  exhaustMap(() => this.auth.login(this.form.value))
).subscribe(() => this.router.navigate(['/dashboard']));
```

## The memory hook

```
switch  = latest wins        →  search, route params
merge   = all at once        →  independent parallel work
concat  = one after another  →  ordered writes
exhaust = first wins         →  submit buttons
```

If you remember only two: **`switchMap` for search, `exhaustMap` for buttons.** They cover most real bugs.

---

<a name="combining"></a>
# 8. Combining streams

```ts
// forkJoin — wait for ALL to complete, emit once. Like Promise.all.
forkJoin({
  user:  this.api.getUser(id),
  roles: this.api.getRoles(id),
  prefs: this.api.getPrefs(id),
}).subscribe(({ user, roles, prefs }) => {
  this.viewModel.set({ user, roles, prefs });
});
```

```ts
// combineLatest — emit whenever ANY source emits,
// after every source has emitted at least once.
combineLatest([this.filter$, this.sort$, this.page$]).pipe(
  switchMap(([filter, sort, page]) => this.api.list(filter, sort, page))
).subscribe(rows => this.rows.set(rows));
```

```
filter$:   --f1--------f2------->
sort$:     -----s1-------------->
output:    -----[f1,s1]--[f2,s1]->      nothing until BOTH have emitted
```

```ts
// withLatestFrom — emit only when the SOURCE emits, grabbing others' latest
this.submitClicks$.pipe(
  withLatestFrom(this.formValue$),
  switchMap(([_, form]) => this.api.save(form)),
).subscribe();
// form changes alone do NOT trigger a save — only a click does
```

⚠️ **The `forkJoin` trap:** it requires every source to **complete**. Hand it a `BehaviorSubject`, which never completes, and it emits nothing — forever, silently. Use `combineLatest` with `take(1)` for that case.

---

<a name="errors"></a>
# 9. ⭐ Error handling

```ts
this.api.getUsers().pipe(
  retry({ count: 3, delay: 1000 }),        // retry 3× with a 1s gap
  catchError((err: HttpErrorResponse) => {
    this.logger.error(err);
    return of([]);                          // MUST return an Observable
  }),
  finalize(() => this.loading.set(false)),  // runs on success OR failure
).subscribe(users => this.users.set(users));
```

**Rule 1: `catchError` must return an Observable.** Two choices:

```ts
catchError(() => of([]))                    // recover — stream continues with a fallback
catchError(err => throwError(() => err))    // rethrow — let a caller handle it
```

**Rule 2: placement decides what dies.** This is the one that bites.

```ts
// ❌ OUTER catch — one failed request kills the search box permanently.
searchTerm$.pipe(
  switchMap(term => this.api.search(term)),
  catchError(() => of([])),          // stream TERMINATES here
).subscribe();

// ✅ INNER catch — the failed request is contained; typing still works.
searchTerm$.pipe(
  switchMap(term =>
    this.api.search(term).pipe(catchError(() => of([])))
  ),
).subscribe();
```

```
outer catch  →  error terminates the whole stream, forever
inner catch  →  error terminates only that inner request
```

---

<a name="rate"></a>
# 10. Rate limiting

```ts
debounceTime(300)          // wait for 300ms of SILENCE, then emit the last value
throttleTime(300)          // emit immediately, then ignore for 300ms
distinctUntilChanged()     // skip consecutive duplicates
```

```
input:       a-b-c--------d-e------->
debounce:    --------c--------e----->     emits after the pause
throttle:    a---------d------------>     emits first, then a cooldown
```

```
debounce   →  search boxes, autosave     (wait until they stop)
throttle   →  scroll, resize, mousemove  (regular updates, capped rate)
```

`distinctUntilChanged` after a debounce saves a wasted request when someone types a character and immediately deletes it:

```ts
searchControl.valueChanges.pipe(
  debounceTime(300),
  distinctUntilChanged(),      // "angular" → "angularx" → "angular" = one request
)
```

---

<a name="leaks"></a>
# 11. ⭐ Memory leaks

A subscription to an **infinite** stream keeps running after the component dies — and holds a reference to it, so the component itself can't be garbage collected.

```ts
// ❌ leaks — interval never completes
ngOnInit() {
  interval(1000).subscribe(() => this.tick());
}
```

Four fixes, best first:

```ts
// 1. async pipe — unsubscribes for you
users$ = this.api.getUsers();
// template:  @for (u of users$ | async; track u.id) { … }

// 2. takeUntilDestroyed — ties the stream to the component's lifetime
constructor() {
  interval(1000).pipe(takeUntilDestroyed()).subscribe(() => this.tick());
}

// 3. takeUntil with a destroy Subject — the classic pre-v16 pattern
private destroy$ = new Subject<void>();

ngOnInit() {
  interval(1000).pipe(takeUntil(this.destroy$)).subscribe(() => this.tick());
}
ngOnDestroy() {
  this.destroy$.next();
  this.destroy$.complete();
}

// 4. manual — fine for one, unmanageable for five
private sub = new Subscription();
ngOnInit()    { this.sub.add(stream$.subscribe()); }
ngOnDestroy() { this.sub.unsubscribe(); }
```

⚠️ With `takeUntil`, put it **last** in the pipe. An operator after it can resubscribe and defeat the whole thing.

**What doesn't leak:** HTTP Observables complete after one emission, so they clean themselves up. The risk is `Subject`, `interval`, `fromEvent`, websockets — anything infinite.

### ⭐ `takeUntilDestroyed()` — how it actually works, and its one real gotcha

Under the hood it's `takeUntil` automated: it reads the component's `DestroyRef` (the object Angular's DI gives every component/directive/service, with an `onDestroy(callback)` hook) and unsubscribes when that instance is torn down — replacing the manual `destroy$` Subject from fix #3.

```ts
// simplified mental model, not the real implementation
function takeUntilDestroyed(destroyRef = inject(DestroyRef)) {
  const destroyed$ = new Subject<void>();
  destroyRef.onDestroy(() => { destroyed$.next(); destroyed$.complete(); });
  return takeUntil(destroyed$);
}
```

**The gotcha:** `inject(DestroyRef)` only works inside an **injection context** — the constructor, a field initializer, or a function called synchronously during DI setup. `ngOnInit` is *not* an injection context, even though it feels like the natural place to start a subscription:

```ts
export class TickerComponent {
  constructor() {
    interval(1000).pipe(takeUntilDestroyed()).subscribe();  // ✅ constructor — injection context
  }

  ngOnInit() {
    interval(1000).pipe(takeUntilDestroyed()).subscribe();  // ❌ throws — ngOnInit is NOT an injection context
  }
}
```

Fix: capture `DestroyRef` where you do have context (a field initializer), and pass it in explicitly wherever you actually start the subscription:

```ts
export class TickerComponent {
  private destroyRef = inject(DestroyRef);   // captured in field-initializer context — always safe

  ngOnInit() {
    interval(1000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();  // ✅ passed explicitly
  }
}
```

It only works on things Angular's DI actually manages — a plain class instantiated with `new` has no `DestroyRef` and nothing for this operator to hook into.

---

<a name="together"></a>
# 12. Everything in one example

A complete type-ahead search. Every operator is preventing a specific bug:

```ts
@Component({ … })
export class EmployeeSearchComponent {
  private api = inject(EmployeeService);

  searchControl = new FormControl('');
  loading = signal(false);
  results = signal<Employee[]>([]);

  constructor() {
    this.searchControl.valueChanges.pipe(
      debounceTime(300),                     // ① one request per pause, not per keystroke
      distinctUntilChanged(),                // ② skip if the term didn't really change
      filter(term => !!term && term.length > 2),  // ③ don't search on 1–2 characters
      tap(() => this.loading.set(true)),     // ④ spinner on
      switchMap(term =>                      // ⑤ cancel the previous request
        this.api.search(term).pipe(
          catchError(() => of([])),          // ⑥ contain the error — keep typing alive
          finalize(() => this.loading.set(false)),   // ⑦ spinner off, success or fail
        )
      ),
      takeUntilDestroyed(),                  // ⑧ no leak
    ).subscribe(results => this.results.set(results));
  }
}
```

Remove any one line and you get a real bug:

```
without ①  a request on every keystroke
without ②  duplicate requests for the same term
without ③  useless searches on "a"
without ⑤  a slow old response overwrites a fresh one    ← the nastiest
without ⑥  one failed request kills the search forever
without ⑧  the stream outlives the component
```

That's the argument for RxJS in one block: these are hard bugs to fix by hand.

---

<a name="interview"></a>
# 13. Interview Q&A

### Q: Observable vs Promise?

A Promise resolves once, starts immediately, and can't be cancelled. An Observable is a stream of zero to many values, is lazy so nothing happens until you subscribe, and can be cancelled by unsubscribing — which actually aborts an in-flight HTTP request.

### Q: `switchMap` vs `mergeMap` vs `concatMap` vs `exhaustMap`?

All four flatten an inner Observable; they differ in what happens when a new value arrives while one is in flight. `switchMap` cancels the previous — right for type-ahead search and route params. `mergeMap` runs everything concurrently with no ordering — right for independent parallel work like uploads. `concatMap` queues them in order — right when sequence matters, like ordered saves. `exhaustMap` ignores new values until the current one finishes — right for a login button you don't want double-firing.

### Q: `Subject` vs `BehaviorSubject`?

A `Subject` only emits to subscribers already listening — subscribe late and you miss everything. A `BehaviorSubject` requires an initial value and immediately gives every new subscriber the current one, plus it exposes `.value` for a synchronous read. That's what makes it work as a state container.

### Q: Cold vs hot observable?

A cold Observable creates a new producer per subscriber, so two subscribers to an HTTP Observable send two requests. A hot one shares a single producer, like a Subject or a DOM event stream. `shareReplay` converts cold to hot when you want one request shared by many subscribers.

### Q: `forkJoin` vs `combineLatest`?

`forkJoin` waits for every source to complete and emits once with the final values — like `Promise.all`. `combineLatest` emits every time any source emits, once all have emitted at least once. The trap is giving `forkJoin` a source that never completes, like a `BehaviorSubject`: it emits nothing at all.

### Q: How do you prevent memory leaks?

Prefer the `async` pipe, which unsubscribes automatically. Otherwise `takeUntilDestroyed()`, or the classic `takeUntil` with a destroy Subject placed last in the pipe, or a manual unsubscribe. HTTP calls complete on their own — the risk is infinite streams like Subjects, `interval` and `fromEvent`.

### Q: Why does `takeUntilDestroyed()` throw when called in `ngOnInit`?

Because it needs to `inject(DestroyRef)` internally, and that only works inside an injection context — the constructor or a field initializer, not a lifecycle hook like `ngOnInit`. The fix is to capture `DestroyRef` where there is context (a field initializer) and pass it in explicitly: `takeUntilDestroyed(this.destroyRef)`.

### Q: Where should `catchError` go?

It depends on what you want to survive. Inside a `switchMap` it only kills the inner request, so the outer stream keeps working. Outside, one error terminates the whole stream — which is how a search box silently stops responding after a single failed request.

### Q: Why didn't my HTTP request fire?

Because Observables are lazy. If nothing subscribes — no `subscribe()`, no `async` pipe — nothing runs.

---

<a name="summary"></a>
# 14. The 60-second summary

> *"An Observable is a stream of zero to many values over time — lazy, so nothing happens until you subscribe, and cancellable, so unsubscribing aborts an in-flight request. Cold observables run once per subscriber, which is why two `async` pipes on one HTTP call fire two requests; `shareReplay` fixes that. Subjects let you push values in, and `BehaviorSubject` holds a current value so late subscribers get it immediately — the classic state container. Operators are pure functions in a `pipe`. The four flattening operators are what interviews ask about: `switchMap` cancels the previous inner request, which is what type-ahead search needs; `mergeMap` runs everything in parallel; `concatMap` queues in order; `exhaustMap` ignores new values while one is in flight, right for a submit button. `forkJoin` waits for everything to complete like `Promise.all`, while `combineLatest` emits whenever any source emits. `catchError` must return an Observable, and its placement decides whether an error kills just the inner request or the entire stream. And leaks come from infinite streams, which is why the `async` pipe or `takeUntilDestroyed` should be the default."*

---

## Connects to

- **[Part 05 — Pipes](05-pipes.md):** the `async` pipe as the default consumption method.
- **[Part 07 — Lifecycle](07-lifecycle-hooks.md):** `takeUntilDestroyed` and the cleanup contract.
- **[Part 11 — Signals](11-signals.md):** state vs streams, and `toSignal` / `toObservable`.
- **[Part 13 — HttpClient](13-httpclient-and-interceptors.md):** where most of your Observables come from.
- **[Part 15 — Forms](15-forms.md):** `valueChanges` as a stream.

*— End of Part 12 —*
