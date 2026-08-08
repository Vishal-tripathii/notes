# 🅰️ Angular Study Notes — Master Roadmap

> **Purpose:** the full study plan for the Angular track. 27 parts, ordered so that each one only depends on what came before it. Every part becomes a note file in this folder (`NN-topic-slug.md`), written after the topic is explained in chat.
>
> **Target:** interview-ready for a 2–5 year Angular role — modern Angular (standalone, signals, new control flow) **and** legacy Angular (NgModules, `*ngIf`, class guards), because real interviews and real codebases contain both.
>
> **Honest time estimate:** ~45–60 hours if you're learning this material, not reviewing it. RxJS and change detection are the two that eat the budget.

---

## How to study each part

The sequence that makes a topic stick, in order:

```
1. Concept        → what it is, in one sentence
2. Why it exists  → what people did BEFORE it, and what hurt
3. How internally → what Angular actually does under the hood
4. Write it       → type the code yourself, don't read it
5. Break it       → the common mistakes, deliberately made
6. Answer it      → the interview questions, spoken aloud
7. Compress it    → the cheat sheet at the end of each note
```

Step 2 is the one people skip and it's the one that separates a memorised answer from an understood one. Every note in this folder is written around it.

---

## Progress tracker

| # | Part | Priority | Status |
|---|---|---|---|
| 00 | TypeScript for Angular | ⭐⭐⭐⭐☆ | ⬜ skipped (already comfortable) |
| 01 | Angular architecture & bootstrap | ⭐⭐⭐⭐☆ | ✅ done (Q&A only) |
| 02 | Components | ⭐⭐⭐⭐⭐ | ✅ done |
| 03 | Templates & data binding | ⭐⭐⭐⭐☆ | ✅ done |
| 04 | Directives | ⭐⭐⭐☆☆ | ✅ done |
| 05 | Pipes | ⭐⭐⭐☆☆ | ✅ done |
| 06 | Component communication | ⭐⭐⭐⭐⭐ | ✅ done |
| 07 | Lifecycle hooks | ⭐⭐⭐⭐⭐ | ✅ done |
| 08 | Dependency injection & services | ⭐⭐⭐⭐⭐ | ✅ done |
| 09 | NgModules vs Standalone | ⭐⭐⭐⭐☆ | ✅ done |
| 10 | Change detection & Zone.js | ⭐⭐⭐⭐⭐ | ✅ done |
| 11 | Signals | ⭐⭐⭐⭐☆ | ✅ done |
| 12 | RxJS | ⭐⭐⭐⭐⭐ | ✅ done |
| 12.5 | Subscribing & API calls *(deep dive)* | ⭐⭐⭐⭐⭐ | ✅ done |
| 13 | HttpClient & interceptors | ⭐⭐⭐⭐☆ | ✅ done |
| 14 | Routing | ⭐⭐⭐⭐⭐ | ✅ done |
| 15 | Forms | ⭐⭐⭐⭐⭐ | ✅ done |
| 16 | State management | ⭐⭐⭐☆☆ | ✅ done |
| 17 | Auth & authorization | ⭐⭐⭐⭐☆ | ✅ done |
| 18 | Performance | ⭐⭐⭐⭐☆ | ✅ done |
| 19 | Error handling | ⭐⭐⭐☆☆ | ✅ done |
| 20 | Testing | ⭐⭐⭐☆☆ | ✅ done |
| 21 | SSR & hydration | ⭐⭐☆☆☆ | ✅ done |
| 22 | Angular internals | ⭐⭐⭐☆☆ | ✅ done |
| 23 | Architecture & patterns | ⭐⭐⭐☆☆ | ✅ done |
| 24 | Legacy vs modern & migration | ⭐⭐⭐⭐☆ | ✅ done |
| 25 | Angular vs React | ⭐⭐⭐☆☆ | ✅ done |
| 26 | Machine coding — projects | ⭐⭐⭐⭐☆ | ✅ done |
| 27 | Latest Angular features (post-signals) | ⭐⭐⭐☆☆ | ✅ done |

> **Track complete** — every part written. Parts 14–27 were written directly to file rather than taught in chat first.
>
> **What's left is not reading.** Build the two projects in [Part 26](26-machine-coding-projects.md), then say the ⭐⭐⭐⭐⭐ answers out loud. Speaking exposes gaps that re-reading hides.
>
> 📋 **[Interview Question Bank](QNA-INTERVIEW-BANK.md)** — ~200 questions across 22 sections, answered in spoken form. Drill from here, not from the notes.

---

# PHASE 0 — Prerequisite

## Part 00 — TypeScript for Angular ⭐⭐⭐⭐☆

Angular is not usable without TypeScript the way React is. Decorators, DI metadata, and typed forms all lean on it.

**Topics:** interfaces · type aliases · classes & access modifiers · enums · generics · utility types (`Partial`, `Required`, `Readonly`, `Pick`, `Omit`, `Record`) · union & literal types · optional chaining `?.` · nullish coalescing `??` · non-null assertion `!` · decorators & metadata · `strict` mode and what it forces.

**Hands-on:** an `Employee` interface, a `Manager` that extends it, a generic `ApiResponse<T>`, and the same DTO expressed four ways with utility types.

**Must be able to answer:** interface vs type · when generics earn their keep · what a decorator actually *is* at runtime · why Angular needs `emitDecoratorMetadata`.

---

# PHASE 1 — Foundations

## Part 01 — Angular architecture & bootstrap ⭐⭐⭐⭐☆

**Topics:** framework vs library (and why Angular is opinionated on purpose) · SPA model · the CLI and what each command generates · project structure · `main.ts` · `app.config.ts` · `bootstrapApplication()` vs the legacy `platformBrowserDynamic().bootstrapModule()` · the full path from `index.html` to a rendered component · `angular.json` and build configurations · environments.

**Hands-on:** scaffold the Employee Dashboard shell — Header, Sidebar, Employee List, Employee Details.

**Must be able to answer:** how does Angular bootstrap an application, step by step · what is `bootstrapApplication()` · what happens between the browser parsing `index.html` and your component appearing.

## Part 02 — Components ⭐⭐⭐⭐⭐

**Topics:** the `@Component` decorator and every metadata field · selector forms · inline vs external template/styles · view encapsulation (`Emulated`, `None`, `ShadowDom`) and the attribute-rewriting trick behind it · `HostListener` / `HostBinding` / the `host` object · standalone components · component as the unit of composition.

**Hands-on:** a reusable Button, a Modal, an Accordion, Tabs, a Confirmation Dialog.

**Must be able to answer:** how does `Emulated` encapsulation work · `HostBinding` vs binding in the template · when a component should become a directive instead.

## Part 03 — Templates & data binding ⭐⭐⭐⭐☆

**Topics:** interpolation `{{ }}` · property binding `[x]` · attribute binding `[attr.x]` and why it differs from property binding · class binding `[class.x]` / `ngClass` · style binding `[style.x]` / `ngStyle` · event binding `(x)` and `$event` · two-way binding `[(ngModel)]` and the banana-in-a-box desugaring · template reference variables `#ref` · `ng-container` · `ng-template` · `ng-content` and content projection (single, multi-slot, conditional) · safe navigation in templates · what expressions are legal in a template and why.

**Hands-on:** a dynamic User Card with edit, delete, loading, error, and empty states. Then a Shopping Cart line: quantity → price → discount → tax → total, all bound.

**Must be able to answer:** `ng-container` vs a `div` · `ng-template` vs `ng-content` · property vs attribute binding · what `[(x)]` desugars to.

## Part 04 — Directives ⭐⭐⭐☆☆

**Topics:** the three kinds (component, structural, attribute) · structural directives and the `<ng-template>` they secretly create · the `*` desugaring · `*ngIf` / `*ngFor` / `*ngSwitch` · the modern block control flow `@if` / `@else` / `@for` (with mandatory `track`) / `@switch` / `@empty` · `@defer` and its triggers · `trackBy` vs `track` · writing custom structural and attribute directives · directive selectors and `exportAs`.

**Hands-on:** a `*appIfRole` structural directive and an `appHighlight` attribute directive.

**Must be able to answer:** structural vs attribute · what `*ngIf` compiles to · why `@for` made `track` mandatory · what breaks without it.

## Part 05 — Pipes ⭐⭐⭐☆☆

**Topics:** what a pipe is and why it exists instead of a method call · built-ins (`date`, `currency`, `json`, `keyvalue`, `slice`, `titlecase`) · **pure vs impure** and the change-detection cost of impure · the `async` pipe and why it's the safest way to consume an Observable · custom pipes · pipes vs component methods vs `computed()` · chaining and parameters.

**Hands-on:** a `timeAgo` pipe and a `filterBy` pipe — then the argument for why the filter pipe is usually a mistake.

**Must be able to answer:** pure vs impure and when the impure one fires · what the `async` pipe does on destroy · why filtering in a pipe hurts.

## Part 06 — Component communication ⭐⭐⭐⭐⭐

**Topics:** `@Input()` / `@Output()` + `EventEmitter` · the signal-based `input()`, `input.required()`, `output()`, `model()` · input transforms and aliases · `ViewChild` / `ViewChildren` / `ContentChild` / `ContentChildren` and the `static` flag · `viewChild()` / `contentChild()` signal queries · content projection as a communication channel · sibling communication via a shared service · when to stop passing props and reach for a service.

**Hands-on:** parent ⇄ child on the Employee Dashboard, then a Tabs component where the parent reads its projected children.

**Must be able to answer:** `ViewChild` vs `ContentChild` · when `static: true` is required · decorator inputs vs signal inputs · how two unrelated components talk.

## Part 07 — Lifecycle hooks ⭐⭐⭐⭐⭐

**Topics:** every hook and the exact firing order · `ngOnChanges` (and the `SimpleChanges` object) vs `ngOnInit` · `ngDoCheck` and why it's expensive · `ngAfterContentInit` / `ngAfterContentChecked` · `ngAfterViewInit` / `ngAfterViewChecked` · `ngOnDestroy` and everything that must be cleaned up there · `DestroyRef` + `takeUntilDestroyed()` as the modern replacement · `afterNextRender` / `afterRender` · why writing to state in `ngAfterViewInit` triggers `ExpressionChangedAfterItHasBeenChecked`.

**Hands-on:** a component that logs every hook, mounted and unmounted, with the order written down.

**Must be able to answer:** the full order · constructor vs `ngOnInit` · which hooks run on every CD cycle · how to avoid `ExpressionChangedAfterItHasBeenChecked`.

---

# PHASE 2 — The Angular way

> This phase is what makes Angular *not React*. It is also where interviews spend most of their time.

## Part 08 — Dependency injection & services ⭐⭐⭐⭐⭐

**Topics:** what DI solves · services as the unit of logic · the injector tree (environment, module, element/component injectors) · resolution order and how a lookup walks up the tree · `providedIn: 'root' | 'platform' | 'any'` · `providers` on a component and what that does to instance count · `useClass` / `useValue` / `useFactory` / `useExisting` · `InjectionToken` · constructor injection vs `inject()` · `@Optional`, `@Self`, `@SkipSelf`, `@Host` · singleton vs per-component instance · tree-shakable providers.

**Hands-on:** `AuthService`, `EmployeeService`, `LoggerService`, `NotificationService` — and one deliberately provided at component level to see the difference.

**Must be able to answer:** explain DI · how does Angular resolve a dependency · how do you get a non-singleton service · `inject()` vs constructor injection and where each is legal.

## Part 09 — NgModules vs Standalone ⭐⭐⭐⭐☆

**Topics:** `@NgModule` anatomy — `declarations`, `imports`, `exports`, `providers`, `bootstrap` · why declarations existed and the errors they caused · feature / shared / core module conventions · standalone components and the `imports` array on a component · `provideX()` functions replacing `forRoot()` · mixing both in one app · migrating module → standalone.

**Hands-on:** convert the dashboard from NgModule form to standalone, by hand.

**Must be able to answer:** NgModule vs standalone · why standalone was introduced · what `forRoot()` was for · can they coexist.

## Part 10 — Change detection & Zone.js ⭐⭐⭐⭐⭐

> The hardest topic in Angular. Taught once, here, in full — not spread across three parts.

**Topics:** what triggers change detection · Zone.js and monkey-patching of async APIs · the CD tree and top-down traversal · `Default` vs `OnPush` and the exact conditions that mark an `OnPush` component dirty · `ChangeDetectorRef` — `markForCheck`, `detectChanges`, `detach`, `reattach` · `NgZone.runOutsideAngular` · `ExpressionChangedAfterItHasBeenCheckedError` explained properly · signals as a fine-grained alternative · zoneless change detection.

**Hands-on:** the same component tree under `Default` and `OnPush`, with logging, to see which components check and when.

**Must be able to answer:** what triggers CD · how `OnPush` decides · `markForCheck` vs `detectChanges` · what zoneless changes.

## Part 11 — Signals ⭐⭐⭐⭐☆

**Topics:** why signals were added when RxJS already existed · `signal()`, `.set()`, `.update()` · `computed()` and lazy memoised evaluation · `effect()` and when *not* to use one · the dependency graph and glitch-free propagation · signal inputs/outputs and `model()` · `linkedSignal` · converting between worlds with `toSignal()` / `toObservable()` · signals vs `BehaviorSubject` · what signals do to change detection.

**Hands-on:** rebuild the Shopping Cart totals with `computed()` instead of methods.

**Must be able to answer:** signal vs BehaviorSubject · when to use `effect()` vs `computed()` · why `computed` is lazy · how signals enable zoneless.

## Part 12 — RxJS ⭐⭐⭐⭐⭐

> Highest-frequency Angular interview topic after DI. Budget real time here.

**Topics:** Observable vs Promise · observer, subscription, unsubscribe · cold vs hot · `Subject` / `BehaviorSubject` / `ReplaySubject` / `AsyncSubject` · creation (`of`, `from`, `fromEvent`, `interval`, `timer`) · transformation (`map`, `tap`, `filter`, `scan`) · **the four flattening operators** — `switchMap`, `mergeMap`, `concatMap`, `exhaustMap` — and the exact scenario each one owns · combination (`combineLatest`, `forkJoin`, `withLatestFrom`, `merge`, `startWith`) · error handling (`catchError`, `retry`, `retryWhen`, `finalize`) · rate limiting (`debounceTime`, `throttleTime`, `distinctUntilChanged`) · `takeUntil` / `take` / `first` · the `async` pipe · `takeUntilDestroyed()` · memory leaks and the four ways to avoid them.

**Hands-on:** a type-ahead search — debounce, distinct, cancel the in-flight request, loading state, error state, retry.

**Must be able to answer:** `switchMap` vs `mergeMap` vs `concatMap` vs `exhaustMap` (with a use case each) · `Subject` vs `BehaviorSubject` · `forkJoin` vs `combineLatest` · how do you prevent a subscription leak · cold vs hot.

---

# PHASE 3 — Building real apps

## Part 13 — HttpClient & interceptors ⭐⭐⭐⭐☆

**Topics:** `provideHttpClient()` vs legacy `HttpClientModule` · typed GET/POST/PUT/PATCH/DELETE · `HttpParams` and `HttpHeaders` · `observe: 'response'` and reading headers · error handling and `HttpErrorResponse` · `retry` with backoff · request cancellation (and why `switchMap` gives it free) · functional interceptors vs class interceptors · the interceptor chain and its order · auth / logging / error / caching interceptors · progress events for uploads.

**Hands-on:** full Employee CRUD against a mock API, with an auth interceptor and a global error interceptor.

**Must be able to answer:** why interceptors exist · execution order with multiple interceptors · how to cancel a request · where to put global error handling.

## Part 14 — Routing ⭐⭐⭐⭐⭐

**Topics:** route config and `provideRouter()` · `routerLink`, `routerLinkActive`, `<router-outlet>` · route params vs query params vs fragments · snapshot vs observable params (and the bug caused by using snapshot) · child and nested routes, named outlets · lazy loading with `loadComponent` / `loadChildren` (and the legacy string syntax) · guards — `canActivate`, `canActivateChild`, `canDeactivate`, `canMatch` — as functions and as classes · resolvers · router events · redirects, wildcards, `pathMatch` · preloading strategies · `withComponentInputBinding()`.

**Hands-on:** the Admin Dashboard — Login, Dashboard, Employees, Reports, Settings, Profile — with lazy features and a guarded area.

**Must be able to answer:** guard vs resolver · how lazy loading actually splits the bundle · `canActivate` vs `canMatch` · snapshot vs observable params.

## Part 15 — Forms ⭐⭐⭐⭐⭐

**Topics:** template-driven vs reactive, and how to justify the choice · `FormControl` / `FormGroup` / `FormArray` / `FormBuilder` · typed reactive forms · built-in validators · custom sync validators · async validators (and debouncing them) · cross-field validation on the group · `valueChanges` / `statusChanges` · touched / dirty / pristine and error display timing · `setValue` vs `patchValue` · dynamic form controls · `ControlValueAccessor` for custom inputs.

**Hands-on:** a registration form — email + password rules, confirm-password cross-field validation, an async username-availability check, and a dynamic skills `FormArray`.

**Must be able to answer:** reactive vs template-driven · what `FormArray` is for · how to write a custom validator · how to make your own component work inside a form.

## Part 16 — State management ⭐⭐⭐☆☆

**Topics:** the actual problem (shared state, not "state") · component state → service state → store, as an escalation · a service with `signal()` as the default answer · the `BehaviorSubject` store pattern · when you genuinely need NgRx · NgRx concepts — store, actions, reducers, selectors, effects — and the flow between them · NgRx SignalStore · server state vs client state and why they're different problems · the cost of a store.

**Hands-on:** cart state as a signal service, then the same thing sketched in NgRx to feel the difference.

**Must be able to answer:** when would you introduce NgRx · what problem do selectors solve · why are effects separate from reducers · what's wrong with putting server data in a store.

## Part 17 — Authentication & authorization ⭐⭐⭐⭐☆

> The pieces live in Parts 8, 13, 14 — this is where they're assembled into one flow.

**Topics:** the end-to-end flow — login → token → storage → interceptor → guard → protected route · JWT structure and what belongs in it · access vs refresh tokens · silent refresh and queuing requests during it · localStorage vs sessionStorage vs httpOnly cookie, with the XSS/CSRF trade-off stated plainly · role-based route protection · hiding UI by permission (and why that is not security) · logout and cleanup · handling a 401 globally.

**Hands-on:** wire real auth into the Admin Dashboard — login, token interceptor, auth guard, role guard, refresh on 401.

**Must be able to answer:** where do you store the token and why · how does refresh work without a request storm · how do you do role-based access · why is hiding a button not authorization.

---

# PHASE 4 — Production quality

## Part 18 — Performance ⭐⭐⭐⭐☆

**Topics:** `OnPush` everywhere and what it demands of you · `track` / `trackBy` · pure pipes over method calls in templates · `computed()` over recomputation · lazy routes and `@defer` blocks with their triggers · virtual scrolling (CDK) · image optimisation (`NgOptimizedImage`) · bundle budgets and `source-map-explorer` · tree shaking · SSR + hydration as a perf lever · `runOutsideAngular` for high-frequency events · measuring before optimising.

**Hands-on:** a 10,000-row employee table — make filtering and searching smooth, and record what each fix bought.

**Must be able to answer:** how do you diagnose a slow Angular app · what does `OnPush` actually save · why is a method call in a template a problem · what does `@defer` do.

## Part 19 — Error handling ⭐⭐⭐☆☆

**Topics:** global `ErrorHandler` and replacing it · HTTP error interceptor · `catchError` placement and what "recovering" means · retry with exponential backoff · user-facing error surfaces (toast, inline, page) · logging to a remote service · what to do about errors inside `effect()` and subscriptions · why Angular has no error boundary and what you do instead.

**Hands-on:** a global handler + an HTTP interceptor that classifies 4xx vs 5xx vs network failure and reacts differently.

**Must be able to answer:** how do you handle errors globally · where does `catchError` go in a chain · how do you retry a failed request sensibly.

## Part 20 — Testing ⭐⭐⭐☆☆

**Topics:** what to test and what not to · `TestBed` and configuring a testing module · component tests with `ComponentFixture` and `detectChanges()` · testing inputs, outputs, and rendered DOM · service tests without `TestBed` · mocking dependencies with providers and spies · `HttpTestingController` for HTTP · `fakeAsync` / `tick` / `waitForAsync` · testing signals and observables · harnesses · what a good test asserts.

**Hands-on:** tests for `EmployeeService` (mocked HTTP) and for a component that renders a list from it.

**Must be able to answer:** how do you test a component with a service dependency · how do you test an HTTP call · `fakeAsync` vs `waitForAsync`.

## Part 21 — SSR & hydration ⭐⭐☆☆☆

**Topics:** CSR vs SSR vs SSG and the three problems SSR solves · `@angular/ssr` (formerly Angular Universal) · the server bundle and the render flow · full hydration vs incremental hydration · what breaks on the server (`window`, `document`, `localStorage`) and `isPlatformBrowser` · `TransferState` to avoid double-fetching · prerendering · when SSR is not worth it.

**Must be able to answer:** why SSR · what is hydration and what problem does it solve · what breaks in a component when it renders on the server.

## Part 22 — Angular internals ⭐⭐⭐☆☆

**Topics:** the compilation pipeline · AOT vs JIT and why AOT won · Ivy — what it changed (locality, tree shaking, smaller bundles) vs the old ViewEngine · what a component compiles into · `Renderer2` and why you shouldn't touch the DOM directly · DOM sanitization, `DomSanitizer`, and `bypassSecurityTrust*` · `DestroyRef` · `ApplicationRef` · `ViewContainerRef` and dynamic component creation · tree shaking and side effects.

**Must be able to answer:** AOT vs JIT · what Ivy changed · why `Renderer2` instead of `document` · how does Angular protect against XSS.

## Part 23 — Architecture & patterns ⭐⭐⭐☆☆

**Topics:** smart (container) vs dumb (presentational) components · the facade pattern over a store · feature-folder structure that survives growth · shared vs core vs feature boundaries · dynamic components with `ViewContainerRef` · composition over inheritance in components · directive composition · barrel files and the circular-import trap · when to extract a library.

**Must be able to answer:** how would you structure a large Angular app · what is a smart vs dumb component · how do you render a component dynamically.

## Part 24 — Legacy vs modern & migration ⭐⭐⭐⭐☆

> The part that exists purely so that no interview question about "the old way" catches you out.

**Topics:** AngularJS (1.x) vs Angular 2+ — different frameworks, not versions · ViewEngine → Ivy · NgModule → standalone · `*ngIf`/`*ngFor` → `@if`/`@for` · constructor injection → `inject()` · decorator I/O → signal I/O · Zone.js → zoneless · class guards → functional guards · `HttpClientModule` → `provideHttpClient()` · Angular Universal → `@angular/ssr` · what's deprecated vs removed · how you'd plan a real migration and in what order · reading an old codebase without flinching.

**Must be able to answer:** difference between AngularJS and Angular · what changed with Ivy · how would you migrate a module-based app to standalone · which version introduced signals.

## Part 25 — Angular vs React ⭐⭐⭐☆☆

**Topics:** framework vs library · DI vs props/context · templates vs JSX · Zone/signals vs the VDOM diff · RxJS vs promises/hooks · CLI-and-conventions vs assemble-your-own · two-way binding vs one-way + callbacks · when each is the better choice. Cross-references the [React track](../React/).

**Must be able to answer:** the honest trade-offs, without cheerleading either side.

---

# PHASE 5 — Machine coding

## Part 26 — The two projects ⭐⭐⭐⭐☆

Two projects, not four — because a third CRUD app teaches nothing the second one didn't. These live in `Angular/Projects/`.

### Project 1 — Employee Management System *(covers Parts 1–17)*

```
Login → guarded shell
        ├── Employee List      (table, search, pagination)
        ├── Employee Detail    (route param, resolver)
        ├── Employee Form      (reactive, validation, edit + create)
        └── Settings           (role-gated)
```

CRUD · routing + lazy features · reactive forms · services + DI · HttpClient · interceptors · guards · role-based access.

### Project 2 — Live Search & Sync Dashboard *(covers Parts 11, 12, 16, 18, 19)*

Deliberately not another CRUD app. The point is asynchrony:

- type-ahead search with debounce + cancellation of in-flight requests
- polling a live feed, pausable
- optimistic update with rollback on failure
- a 10k-row virtualised table with `OnPush`
- retry with backoff and a visible error state

---

# PHASE 6 — Staying current

## Part 27 — Latest Angular features (post-signals) ⭐⭐⭐☆☆

> For anyone who learned Angular around the time signals landed and hasn't tracked what shipped since.

**Topics:** `resource()` / `rxResource()` / `httpResource()` — reactive async data fetching built on signal dependency-tracking · `afterRenderEffect()` · `@let` template local variables · `provideZonelessChangeDetection()` (the production zoneless API) · hydration event replay (`withEventReplay()`) · the esbuild + Vite build system (what replaced webpack, and which tool does which job) · Vitest as a newer test runner alongside Karma · self-closing component tags · Signal Forms (flagged as experimental — know it exists, don't over-invest).

**Must be able to answer:** what problem `resource()` solves that `effect()` + `HttpClient` didn't · what `provideZonelessChangeDetection()` actually removes and what that costs · esbuild vs Vite, which does which job · what hydration event replay fixes.

---

# Interview priority — what to revise last

| Priority | Topics |
|---|---|
| ⭐⭐⭐⭐⭐ | Components · Lifecycle · Component communication · **DI** · **RxJS** · Change detection · Routing · Reactive forms |
| ⭐⭐⭐⭐☆ | HttpClient & interceptors · Standalone · Signals · Performance · Auth · TypeScript · Legacy vs modern · Machine coding |
| ⭐⭐⭐☆☆ | Pipes · Directives · Internals · State management · Testing · Error handling · Patterns · Angular vs React · Latest features (`resource()`, zoneless) |
| ⭐⭐☆☆☆ | SSR & hydration |

If you have one week left, it's DI + RxJS + change detection + forms + routing. Those five carry most interviews.

---

# Revision strategy

Each note file in this folder ends with a **cheat sheet** — that's the one-page revision unit, so there's no separate summary to maintain. Before an interview:

- [ ] Read only the cheat sheets, in part order.
- [ ] Rebuild Project 2's search component from scratch, no reference.
- [ ] Say the answer to every ⭐⭐⭐⭐⭐ interview question **out loud** — writing it down hides the gaps that speaking exposes.
- [ ] For each of the top-5 topics, be able to state: what it is · what came before it · what it costs.

---

# Suggested schedule

A calendar, not a contract. Adjust to whatever pace the material actually takes.

| Week | Parts |
|---|---|
| 1 | 00 TypeScript · 01 Architecture · 02 Components · 03 Templates |
| 2 | 04 Directives · 05 Pipes · 06 Communication · 07 Lifecycle |
| 3 | 08 DI · 09 Standalone · 10 Change detection |
| 4 | 11 Signals · 12 RxJS *(give RxJS the whole rest of the week)* |
| 5 | 13 HTTP · 14 Routing · 15 Forms |
| 6 | 16 State · 17 Auth · 18 Performance · 19 Errors |
| 7 | 20 Testing · 21 SSR · 22 Internals · 23 Patterns · 24 Legacy · 25 vs React |
| 8 | 26 Projects + revision + mock interviews |
| 8.5 | 27 Latest features — read once, closer to the interview date than to now |

---

## Connects to

- **[React track](../React/)** — Part 25 compares the two directly; Parts 6, 7, 10 have close React analogues worth contrasting.
- **[Node.js track](../nodejs/)** — Part 13 (HttpClient) and Part 17 (auth) sit on the other side of the APIs built there.
- **[System Design track](../System-design/)** — Part 16 (state), Part 18 (performance/CDN) and Part 21 (SSR) connect to caching and delivery.

*— Work through these in order. One part at a time, explained first, written after. —*
