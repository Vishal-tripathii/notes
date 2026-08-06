# Angular Study Notes — Part 16

## State Management

> **Roadmap:** [Part 16](00-ROADMAP.md) · **Priority:** ⭐⭐⭐☆☆
>
> **Continues:** [Part 08 — DI](08-dependency-injection-and-services.md) · [Part 11 — Signals](11-signals.md) · [Part 12.5 — Subscribing](12.5-subscribing-and-api-calls.md).

---

## Table of Contents

1. [The real problem](#problem)
2. [The escalation ladder](#ladder) ⭐
3. [Service with a signal — the default](#signal-service) ⭐
4. [The `BehaviorSubject` version](#behaviorsubject)
5. [When you actually need NgRx](#when-ngrx) ⭐
6. [NgRx — the flow](#ngrx-flow) ⭐
7. [NgRx SignalStore](#signalstore)
8. [Server state is a different problem](#server-state) ⭐
9. [Interview Q&A](#interview)
10. [The 60-second summary](#summary)

---

<a name="problem"></a>
# 1. The real problem

"State management" is a misleading name. A component holding a `loading` flag is state, and it needs no management at all.

The actual problem is **shared** state — one piece of data that several unrelated components must read and write, staying consistent:

```
        AppComponent
        /     |      \
   Header   Cart    Checkout
      │       │         │
      └───── the same cart ─────┘

   all three must see the same items, instantly
```

Everything below is a different answer to that.

---

<a name="ladder"></a>
# 2. ⭐ The escalation ladder

Don't start at the top. Each rung is only justified when the one below it stops working:

```
1.  Component state                  most state. Stays here.
2.  @Input / @Output                 parent ↔ child
3.  Service with a signal            ← the default answer for shared state
4.  A store (NgRx)                   large teams, complex flows, audit needs
```

Most apps never need rung 4. Reaching for it early is the most common over-engineering mistake in Angular.

---

<a name="signal-service"></a>
# 3. ⭐ Service with a signal — the default

```ts
@Injectable({ providedIn: 'root' })
export class CartService {
  private items = signal<CartItem[]>([]);          // private = writable

  readonly all   = this.items.asReadonly();        // public = read-only
  readonly count = computed(() => this.all().length);
  readonly total = computed(() =>
    this.all().reduce((sum, i) => sum + i.price * i.qty, 0)
  );

  add(item: CartItem) {
    this.items.update(list => [...list, item]);    // new array, never push()
  }

  remove(id: number) {
    this.items.update(list => list.filter(i => i.id !== id));
  }

  clear() {
    this.items.set([]);
  }
}
```

```ts
// any component, anywhere
private cart = inject(CartService);
count = this.cart.count;      // updates automatically
```

Three principles doing the work:

```
private signal + asReadonly()   nobody mutates state from outside
computed for derived values     total is never stored, never stale
methods are the only writers    every change goes through one place
```

That *is* a store. It has state, selectors and actions — just without a library.

---

<a name="behaviorsubject"></a>
# 4. The `BehaviorSubject` version

The same pattern before signals, and what you'll find in most existing codebases ([Part 12.5](12.5-subscribing-and-api-calls.md)):

```ts
@Injectable({ providedIn: 'root' })
export class CartService {
  private items$$ = new BehaviorSubject<CartItem[]>([]);

  readonly all$   = this.items$$.asObservable();
  readonly count$ = this.all$.pipe(map(items => items.length));

  add(item: CartItem) {
    this.items$$.next([...this.items$$.value, item]);
  }
}
```

Identical shape. Signals just remove the subscription, the `async` pipe, and the leak risk.

---

<a name="when-ngrx"></a>
# 5. ⭐ When you actually need NgRx

Signals-in-a-service breaks down at a specific point — and being able to name it is the interview answer:

```
✅ reach for a store when…
   many features mutate the same state in complex ways
   you need time-travel debugging / an audit trail of every change
   side effects are complicated (chained calls, retries, cancellation, rollback)
   a large team needs one enforced pattern rather than 12 hand-rolled services

❌ don't when…
   "we might need it later"
   it's really just server data you're caching
   one or two services would do
```

The honest trade: NgRx buys **predictability and traceability** at the cost of **a lot of boilerplate**. Every change becomes an action, a reducer case, a selector — sometimes an effect too. On a small app that's pure overhead. On a 200-component app with fifteen developers, it's what stops the state layer becoming unknowable.

---

<a name="ngrx-flow"></a>
# 6. ⭐ NgRx — the flow

You need to be able to draw this:

```
  Component
      │  dispatch(action)
      ▼
   Action ──────────────► Effect ──► API call
      │                      │
      │                      └──► dispatches a NEW action (success/failure)
      ▼
   Reducer   (pure: state + action → new state)
      │
      ▼
    Store     (one immutable state tree)
      │
      │  selector (memoised)
      ▼
  Component
```

```ts
// ACTION — describes an EVENT, never a command
export const loadEmployees        = createAction('[Employees] Load');
export const loadEmployeesSuccess = createAction('[Employees] Load Success',
  props<{ employees: Employee[] }>());
```

```ts
// REDUCER — pure. No HTTP, no Date.now(), no mutation.
export const reducer = createReducer(
  initialState,
  on(loadEmployees,        state => ({ ...state, loading: true })),
  on(loadEmployeesSuccess, (state, { employees }) =>
    ({ ...state, employees, loading: false })),
);
```

```ts
// SELECTOR — a memoised query into the tree
export const selectEmployees = createSelector(
  selectEmployeeState,
  state => state.employees,
);
export const selectActiveCount = createSelector(
  selectEmployees,
  employees => employees.filter(e => e.active).length,   // recomputes only when employees changes
);
```

```ts
// EFFECT — where the impure work lives
loadEmployees$ = createEffect(() =>
  this.actions$.pipe(
    ofType(loadEmployees),
    switchMap(() => this.api.getAll().pipe(
      map(employees => loadEmployeesSuccess({ employees })),
      catchError(error => of(loadEmployeesFailure({ error }))),
    )),
  )
);
```

**Why reducers and effects are separate:** a reducer must be pure, so the same action always produces the same state — that's what makes time-travel debugging and testing possible. Anything impure (HTTP, timers, navigation) is quarantined into effects, which convert side effects back into actions.

**Why selectors exist:** they're memoised, so a derived value recomputes only when its slice changes, and components depend on the selector rather than the state shape — you can restructure the tree without touching them.

---

<a name="signalstore"></a>
# 7. NgRx SignalStore

The modern middle ground — store discipline, far less ceremony:

```ts
export const CartStore = signalStore(
  { providedIn: 'root' },
  withState({ items: [] as CartItem[], loading: false }),
  withComputed(({ items }) => ({
    count: computed(() => items().length),
    total: computed(() => items().reduce((s, i) => s + i.price, 0)),
  })),
  withMethods((store, api = inject(CartApi)) => ({
    add(item: CartItem) {
      patchState(store, { items: [...store.items(), item] });
    },
  })),
);
```

No actions, no reducers, no dispatch — but still one place per feature with an enforced shape.

---

<a name="server-state"></a>
# 8. ⭐ Server state is a different problem

The distinction that separates a good answer from a rote one:

```
CLIENT state    you own it        cart, filters, wizard step, theme
SERVER state    you cache it      employees, orders — the truth lives on the server
```

Putting server data in a store *looks* right and creates a hard problem: you now own a **cache**, and cache invalidation is your job.

```
When does it go stale?
Who refetches after another user edits it?
What happens on a failed optimistic update?
Two components mount at once — one request or two?
```

A store answers none of that. Tools built for server state — TanStack Query for Angular, or Angular's own resource APIs — handle caching, deduplication, staleness and refetching for you.

**A good rule:** keep server data out of your store unless you have a specific reason. Cache it in the service that fetches it, and let the store hold only what your app genuinely owns.

---

<a name="interview"></a>
# 9. Interview Q&A

### Q: When would you introduce NgRx?

When shared state is mutated by many features in complex ways, when side effects need real orchestration, or when a large team needs one enforced pattern instead of a dozen hand-rolled services. I wouldn't add it for "we might need it later" — a service with a signal covers most shared state, and NgRx trades a lot of boilerplate for predictability a small app doesn't need.

### Q: Walk me through the NgRx flow.

A component dispatches an action describing what happened. Reducers are pure functions taking the current state and the action and returning new state. The store holds one immutable tree. Components read through selectors, which are memoised. Anything impure — an HTTP call — lives in an effect, which listens for actions, does the work, and dispatches a success or failure action that a reducer then handles.

### Q: Why are effects separate from reducers?

Because reducers must be pure — the same state plus the same action always gives the same result. That purity is what makes them testable and time-travel debugging possible. Side effects are quarantined in effects, which turn them back into actions.

### Q: What problem do selectors solve?

Two. They're memoised, so a derived value only recomputes when its input slice actually changes. And they decouple components from the state shape — you can restructure the tree and only the selectors change.

### Q: How would you share state without a library?

A service provided in root holding a private signal, exposed read-only, with `computed` for derived values and methods as the only way to write. Any component injects the service and gets the same instance. That's already a store, without the boilerplate.

### Q: What's wrong with putting server data in a store?

It turns a caching problem into a manual one. You inherit staleness, invalidation, refetching after another user's change, request deduplication and rollback on failed updates — none of which a store solves. Server state belongs in something built to cache it; the store should hold what the client genuinely owns.

---

<a name="summary"></a>
# 10. The 60-second summary

> *"State management is really about shared state — data several unrelated components must read and write consistently. I escalate rather than start at the top: component state, then inputs and outputs, then a service holding a private signal exposed read-only with computed values and methods as the only writers. That service is already a store — state, selectors and actions — without a library, and it covers most applications. NgRx becomes worth it when many features mutate the same state in complex ways, when side effects need orchestration, or when a big team needs one enforced pattern. Its flow is: component dispatches an action, a pure reducer produces new state, components read through memoised selectors, and impure work lives in effects that dispatch further actions — reducers stay pure so they're testable and time-travel works. SignalStore is the lighter modern version. And the distinction that matters most is client state versus server state: caching server data in a store means owning invalidation, staleness and refetching yourself, which is a problem a store was never designed to solve."*

---

## Connects to

- **[Part 06 — Communication](06-component-communication.md):** the shared service, where this starts.
- **[Part 08 — DI](08-dependency-injection-and-services.md):** why every component gets the same instance.
- **[Part 11 — Signals](11-signals.md):** `signal`, `computed`, `asReadonly`.
- **[Part 13 — HttpClient](13-httpclient-and-interceptors.md):** caching server data in the service that fetches it.

*— End of Part 16 —*
