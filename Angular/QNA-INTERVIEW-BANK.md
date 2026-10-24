# 🅰️ Angular Interview Question Bank — Answered

> **How to use:** cover the answer, say yours out loud, then compare — speaking still finds gaps that reading hides. But unlike its terse siblings, this bank is written to work as a **standalone crash course**: every answer opens with a plain definition, then the tradeoff/reasoning behind it, then a short code snippet wherever the concept has real shape in code. If someone has time for exactly one file before an interview and never opens the rest of the `Angular/` notes folder, this is the one that gets them ready.
>
> **~220 questions · 22 sections**

---

## Sections

| | Topic | Note |
|---|---|---|
| 1 | [Architecture & Bootstrapping](#s1) | [Part 01](01-angular-architecture-and-bootstrap.md) |
| 2 | [Component Internals](#s2) | [Part 02](02-components.md), [07](07-lifecycle-hooks.md) |
| 3 | [Change Detection](#s3) | [Part 10](10-change-detection-and-zonejs.md) |
| 4 | [Signals](#s4) | [Part 11](11-signals.md) |
| 5 | [Dependency Injection](#s5) | [Part 08](08-dependency-injection-and-services.md) |
| 6 | [Components & Communication](#s6) | [Part 06](06-component-communication.md) |
| 7 | [Directives](#s7) | [Part 04](04-directives.md) |
| 8 | [Pipes](#s8) | [Part 05](05-pipes.md) |
| 9 | [Routing](#s9) | [Part 14](14-routing.md) |
| 10 | [RxJS — core](#s10) | [Part 12](12-rxjs.md) |
| 11 | [Rendering & Templates](#s11) | [Part 03](03-templates-and-data-binding.md) |
| 12 | [Build System](#s12) | [Part 22](22-angular-internals.md) |
| 13 | [Project Structure](#s13) | [Part 01](01-angular-architecture-and-bootstrap.md) |
| 14 | [Performance](#s14) | [Part 18](18-performance.md) |
| 15 | [Forms](#s15) | [Part 15](15-forms.md) |
| 16 | [HTTP & Interceptors](#s16) | [Part 13](13-httpclient-and-interceptors.md) |
| 17 | [RxJS — operators](#s17) | [Part 12](12-rxjs.md), [12.5](12.5-subscribing-and-api-calls.md) |
| 18 | [State Management](#s18) | [Part 16](16-state-management.md) |
| 19 | [Auth & Security](#s19) | [Part 17](17-authentication-and-authorization.md) |
| 20 | [Testing](#s20) | [Part 20](20-testing.md) |
| 21 | [Latest Angular Features](#s21) | [Part 27](27-latest-angular-features.md) |
| 22 | [Scenario & Debugging](#s22) ⭐ | — |

---

<a name="s1"></a>
# 1. Architecture & Bootstrapping

### What happens internally when an Angular application starts?
Bootstrapping is the sequence that turns a static HTML shell and a compiled JS bundle into a live, rendered application — nothing on the page exists until this runs once, at load.

The browser loads `index.html`, which has an empty `<app-root>` and a script tag. That script is your compiled app. It runs `main.ts`, which calls `bootstrapApplication`. Angular builds the root injector from the providers, finds the element matching the root component's selector, creates the component (dependency injection fills its constructor), runs its compiled template to produce real DOM, then does the same for children recursively. Finally the router renders the URL's component and change detection runs.

```ts
// main.ts
bootstrapApplication(AppComponent, appConfig);
```

### What does `bootstrapApplication()` actually do?
It's the standalone entry point that starts an Angular app with no NgModule involved.

Three things: creates the root environment injector from your providers array, instantiates the root component, and attaches it to the DOM element matching its selector. It returns a promise of the `ApplicationRef`.

```ts
// app.config.ts
export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes), provideHttpClient()],
};
```

### How did bootstrapping work before standalone components?
The legacy entry point booted a **module**, not a component — the module then named which component to render.

`platformBrowserDynamic().bootstrapModule(AppModule)`. The root NgModule declared its components and named which one to bootstrap in its `bootstrap` array. The module was the entry point; now the component is.

```ts
// legacy
platformBrowserDynamic().bootstrapModule(AppModule);
```

### What is the Angular compiler?
The compiler is the tool that turns your templates and decorator metadata into JavaScript render instructions — a template isn't HTML at runtime, it's compiled code the framework executes directly.

```
<h1>{{ title }}</h1>
        ↓ compiler
ɵɵelementStart(0, 'h1'); ɵɵtext(1); ɵɵelementEnd();
ɵɵtextInterpolate(ctx.title);   // on update
```

### What is the difference between JIT and AOT?
**AOT** (ahead-of-time) compiles templates to JavaScript at build time; **JIT** (just-in-time) compiled them in the browser at runtime.

Think of it as pre-cooking the meal versus cooking it when the guest arrives. Pre-cooking means the kitchen (the compiler) doesn't need to travel with you.

### Why is AOT preferred in production?
AOT is Angular's default compilation mode — the template compiler runs once, during your build, rather than shipping inside the browser bundle.

Three reasons: the compiler doesn't ship in the bundle, so it's smaller; the app starts faster because there's no compile step at runtime; and template errors appear during the build rather than when a user hits the page.

### How does Angular know which component is the root component?
By selector match, not by any special marker on the class.

You tell it — `bootstrapApplication(AppComponent, …)`. Angular then looks for the element matching that component's `selector` in the document. Rename the class but not the selector and you get a blank page.

```ts
@Component({ selector: 'app-root' })
export class AppComponent {}
```
```html
<app-root></app-root>   <!-- must match the selector exactly -->
```

### What is the role of `main.ts`?
It's the application's entry point — the first file the browser executes. Its only job is to bootstrap the app, which is why it's usually two lines.

### What is `ApplicationRef`?
It's the runtime handle to your booted application — it knows the attached views, and `tick()` runs change detection from the root. You rarely use it directly, but it's what Zone.js calls when an async task finishes.

```ts
private appRef = inject(ApplicationRef);
this.appRef.tick();   // force a full change detection pass
```

### What is `PlatformRef`?
One level above `ApplicationRef` — it represents the *platform* (the browser environment itself) rather than any individual app. One platform can host several Angular applications on the same page, which is what `providedIn: 'platform'` scopes to.

### What is Zone.js, and why did Angular need it?
Zone.js is a library that monkey-patches the browser's async APIs — `setTimeout`, `addEventListener`, promises, XHR — so Angular can be notified whenever one of them completes.

Angular doesn't watch your data. It's like a doorbell wired to every door in the house: it doesn't know what changed inside, only that *someone came in*, so it goes and checks everything.

```ts
// conceptually, what Zone.js does at startup
window.setTimeout = zonePatchedSetTimeout;   // wraps the real one
```

### Can Angular work without Zone.js?
Yes — that's zoneless change detection, available via `provideZonelessChangeDetection()`.

The trade is that plain property mutation no longer triggers anything, so state must be in signals or you call `markForCheck` yourself.

```ts
bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection()],
});
```

### How do Signals reduce Angular's dependency on Zone.js?
Signals replace a guess with a precise dependency graph.

Zone.js is a guess: *something happened, check everything.* A signal knows exactly which views read it, so it can say *this changed, update these three things.* Once your state is in signals, the guess is unnecessary.

---

<a name="s2"></a>
# 2. Component Internals

### How does Angular create a component?
Instantiation is a fixed sequence: Angular reads the compiled metadata, creates an injector for the component, instantiates the class (filling constructor dependencies from that injector), then executes the compiled template function to create the DOM and any child components.

### What actually happens when you write `<app-user>`?
Tag resolution happens at compile time, not by scanning the DOM in the browser — the compiler sees that tag, matches it against the selectors of components in scope, and emits an instruction to create that component there.

### How does Angular map HTML tags to components?
Matching is by CSS selector — components use element selectors like `selector: 'app-user'`, directives usually use attribute selectors like `[appHighlight]`. Standalone components must be in the consuming component's `imports` for the match to be in scope.

```ts
@Component({ selector: 'app-user', imports: [UserAvatarComponent] })
export class UserComponent {}
```

### Where is component metadata stored?
Ivy compiles metadata onto the component class itself, as a static property (an `ɵcmp` definition), rather than into a separate module-level registry. That's Ivy's "locality" — everything Angular needs to know about a component lives on the component.

### Why are templates compiled instead of interpreted?
Speed and safety. Angular converts templates into JavaScript function calls at build time rather than parsing HTML strings at runtime — interpreting HTML on every change would mean parsing at runtime, while compiled templates are just function calls. It also means type errors in templates are caught at build time.

### How does Angular scope component styles by default?
Through **emulated view encapsulation** — Angular rewrites your CSS at build time so a component's styles only match its own elements, without using the browser's Shadow DOM at all.

What you write:
```css
p { color: red; }
```
What Angular emits:
```html
<p _ngcontent-abc>Hello</p>
```
```css
p[_ngcontent-abc] { color: red; }
```
Every element in the template gets a unique attribute, and every selector in the stylesheet gets that same attribute appended — so scoping falls out of ordinary CSS specificity, nothing to polyfill. Without this, `p { color: red }` in a component's stylesheet would be a **global** rule hitting every `<p>` in the app.

### What are the three encapsulation modes?
`encapsulation` on `@Component` controls the scoping strategy: `Emulated` (default), `None`, or `ShadowDom`.

```
Emulated    your styles stay in  ·  outside styles CAN reach in    (default)
None        your styles LEAK OUT ·  outside styles reach in
ShadowDom   your styles stay in  ·  outside styles CANNOT reach in
```

`None` is for deliberately global theme styles; `ShadowDom` uses the real browser feature for true two-way isolation. ⚠️ The trap: setting `None` on one component pushes its styles into the *entire* application — a very common cause of "why did this component break another page?", and because the damage is remote, it's hard to trace back.

```ts
@Component({ encapsulation: ViewEncapsulation.None })
```

### How does Angular instantiate a component?
It calls the class constructor with dependencies resolved from the component's injector — inputs and lifecycle hooks come after, in order.

### When is the constructor called?
At the moment the class is instantiated — before inputs are set and before the template renders.

### Why does `ngOnInit()` exist if we already have a constructor?
`ngOnInit` is a lifecycle hook Angular calls once, after the first round of inputs has been delivered — `@Input` values are still `undefined` in the constructor, and `ngOnInit` runs right after the first `ngOnChanges`, so it's the first place your inputs are guaranteed real. It also keeps constructors cheap, which makes the class easy to instantiate in tests.

```ts
export class EmployeeCardComponent implements OnInit {
  @Input() employee!: Employee;
  constructor() { console.log(this.employee); }   // undefined
  ngOnInit()    { console.log(this.employee); }    // real value
}
```

### How are `@Input()` values assigned?
Angular sets them like plain property assignments, driven by the parent's template bindings — after construction, during the first change detection pass, before `ngOnInit`.

### Why does `ngOnChanges()` execute before `ngOnInit()`?
`ngOnChanges` is the hook that *delivers* the inputs, so it necessarily runs first — by the time `ngOnInit` fires, everything is already populated.

### Why are `@ViewChild()` values unavailable in the constructor?
`@ViewChild` reads elements from the rendered template, and nothing has rendered yet at construction time — the element simply doesn't exist. Static queries resolve by `ngOnInit`; dynamic ones (anything inside `@if` or `@for`) resolve at `ngAfterViewInit`.

```ts
@ViewChild('box', { static: true })  box!: ElementRef;   // ready in ngOnInit
@ViewChild('box', { static: false }) box!: ElementRef;   // ready in ngAfterViewInit (default)
```

### What is the difference between projected content and a component's own view?
**View** is markup the component's own template produces; **content** is markup the parent passed in through `<ng-content>` — the parent created it, so it's ready earlier. That's why there are two hook pairs: `ngAfterContentInit` for projected content, `ngAfterViewInit` for your own.

```html
<!-- parent -->
<app-card><h2>Hello</h2></app-card>
<!-- card.component.html -->
<div class="card"><ng-content /></div>
```

---

<a name="s3"></a>
# 3. Change Detection

### What is change detection?
Change detection is Angular's process for keeping the DOM in sync with your component's data — it compares current values against what's rendered and updates only where they differ.

### Why does Angular need change detection?
Because ordinary property assignment — `this.name = 'Ravi'` — has no hook Angular can observe: no setter, no subscription. Something has to notice.

```ts
this.name = 'Ravi';   // no setter fires — Angular has to go looking
```

### How does Angular know that a value changed?
Indirectly — it doesn't watch data, it watches for anything that could have changed data. Zone.js tells it that an *async task finished*, and Angular then re-evaluates every template expression and compares each with its previous value.

### What triggers a change detection cycle?
Any of the async operations Zone.js patches, plus a handful of manual triggers.

DOM events, timers (`setTimeout`, `setInterval`), and async I/O (HTTP, promises) — all patched by Zone.js. Also explicit calls like `markForCheck` or `ApplicationRef.tick()`.

### What is a change detector?
Each component instance owns one — an object that remembers the previous values of its bindings and knows how to re-check them, exposed to you via `ChangeDetectorRef`.

```ts
private cdr = inject(ChangeDetectorRef);
```

### What is the component tree?
The hierarchy of components from the root down, mirroring the nesting in your templates.

Change detection walks it top-to-bottom, which is why a parent is always checked before its children.

### Does Angular update the whole DOM every time?
No — it *checks* every binding on every cycle, but only *touches* the DOM where a value actually changed. The checking is the cost, not the DOM writes.

### What is dirty checking?
Comparing each binding's current value against its stored previous value to decide whether it's "dirty" and needs a DOM update.

It's brute force — hence checking everything on every cycle — but it's simple and needs no cooperation from your code.

### Why is object mutation problematic with `OnPush`?
`OnPush` decides whether to re-check a component by comparing input **references**, not values.

`employee.name = 'Ravi'` keeps the same object, so the reference is identical and Angular concludes nothing changed. You must replace the object: `{...employee, name: 'Ravi'}`.

```ts
this.employee.name = 'Ravi';                          // ❌ same reference — invisible
this.employee = { ...this.employee, name: 'Ravi' };   // ✅ new reference — detected
```

### What does `ChangeDetectionStrategy.Default` actually do?
It's the strategy every component gets unless told otherwise.

Checks the component on every cycle, regardless of whether anything relevant changed.

### What does `ChangeDetectionStrategy.OnPush` actually do?
An opt-in strategy that tells Angular to skip a component unless it has good reason to check it.

Skips the component unless one of four things happens: an input reference changes, an event fires from the component or its children, `markForCheck()` is called, or an async pipe in its template emits. Skipping a component skips its whole subtree — that's where the saving comes from.

```ts
@Component({ changeDetection: ChangeDetectionStrategy.OnPush })
export class DashboardComponent {}
```

### What is `markForCheck()`?
A method on `ChangeDetectorRef` that schedules a component (and its ancestors) to be checked on the next cycle.

It doesn't run change detection itself — it's a request, not a command.

```ts
private cdr = inject(ChangeDetectorRef);
onSocketMessage(data: Data) {
  this.data = data;
  this.cdr.markForCheck();   // data arrived outside Angular's knowledge
}
```

### What is `detectChanges()`?
A method on `ChangeDetectorRef` that runs change detection immediately, synchronously, rather than scheduling it.

Powerful but easy to misuse — it can cause loops. Prefer `markForCheck`.

```ts
this.cdr.detectChanges();   // updates the DOM before the next line runs
```

### What happens if you call `detach()`?
`detach()` removes a component from the change detection tree entirely — it stops being checked, and you then own updating it via `detectChanges()` when you decide. Used for extreme optimisation cases like a high-frequency data grid.

```ts
this.cdr.detach();
setInterval(() => this.cdr.detectChanges(), 1000);   // update on your own schedule
```

### How many times can a component be checked during one user interaction?
More than once — a single interaction can trigger several cycles, and dev mode doubles that again.

A single click triggers a cycle; if the handler starts an HTTP call, the response triggers another. And in development mode Angular runs each cycle **twice** to verify stability — which is exactly how `ExpressionChangedAfterItHasBeenChecked` is detected.

---

<a name="s4"></a>
# 4. Signals

### Why did Angular introduce Signals?
A signal is a reactive value that tracks its own readers, introduced because Zone.js could only say "something happened somewhere." Angular needed values that know who reads them, so it can update precisely what's affected instead of checking everything.

### What problem do Signals solve?
Over-checking — Zone.js's "something happened, check everything" trigger.

With Zone.js, one keystroke can cause the entire component tree to be re-examined. A signal turns that into a targeted update.

### How are Signals different from RxJS?
A signal is **state** with a current value you read synchronously; an Observable is **events over time**.

An Observable may not have emitted yet, and gives you operators for time-based logic like debouncing and cancellation. Signal = the current temperature on a thermometer. Observable = the log of every temperature reading, with tools to process the stream.

```ts
count = signal(0);
count();          // read synchronously — always has a value
```

### How does Angular know who depends on a Signal?
Through automatic dependency tracking — recording which computations read a signal, at the moment they read it.

When a computed or a template runs, every signal it *calls* registers itself as a dependency of that computation. That's why reading is a function call.

### What is dependency tracking?
The mechanism that builds the signal dependency graph automatically, at read time — every time the computation runs. Because it re-tracks on each run, branches that aren't taken don't create dependencies.

### Why do we read a Signal using `count()` instead of `count`?
Because reading a signal is a function call, and that call is the tracking mechanism itself.

A plain property read is invisible to Angular; a function call can register "whoever is currently computing depends on me."

```ts
count = signal(0);
count();   // ✅ registers a dependency
```

### When should you use `signal()`?
`signal()` creates a piece of writable, reactive state.

For any piece of state you own and mutate — a counter, a selected tab, a list of cart items.

```ts
count = signal(0);
count.set(5);
count.update(n => n + 1);
```

### When should you use `computed()`?
`computed()` derives a new signal from other signals.

For anything **derived** — totals, filtered lists, formatted names. It's lazy (doesn't run until read) and memoised (recalculates only when a dependency changes).

```ts
subtotal = computed(() => this.items().reduce((s, i) => s + i.price, 0));
```

### When should you use `effect()`?
`effect()` runs a function whenever any signal it reads changes — for side effects, not for producing values.

Only for side effects **outside** Angular — logging, `localStorage`, analytics, driving a third-party chart library.

```ts
effect(() => localStorage.setItem('user', JSON.stringify(this.user())));
```

### Why shouldn't `effect()` be used for derived state?
Because it's the wrong tool: writing to a signal inside an effect that reads other signals can retrigger itself and create a loop. If you're producing a value, that's `computed`.

### Are Signals synchronous or asynchronous?
Signal reads and writes are synchronous — only the view update is scheduled.

`set()` then read, and you get the new value immediately. The *view* update is scheduled, but the value itself is not.

```ts
count.set(5);
console.log(count());   // 5 — immediately
```

### How do Signals work with `OnPush`?
A signal read inside a template automatically registers that view as one of its dependents.

So when the signal changes Angular marks that component dirty automatically. You get `OnPush` correctness without calling `markForCheck` yourself.

### How do Signals reduce unnecessary change detection?
By replacing a blanket "check everything" trigger with a precise "update this exact dependent" trigger.

Only the affected views are marked — not the whole tree.

### How do you bridge a Signal to an Observable, and back?
`toSignal()` converts an Observable into a signal, subscribing and unsubscribing for you; `toObservable()` does the reverse, emitting whenever the signal changes.

Use `toSignal` when a value is naturally a stream (an HTTP call, a WebSocket) but you want to read it like state in the template — it's the `async` pipe's job, but living in the class. Use `toObservable` when a signal's changes need to flow into an RxJS pipe, e.g. to `debounceTime` a signal-backed search term.

```ts
user   = toSignal(this.userService.user$, { initialValue: null });
query$ = toObservable(this.searchTerm);
```

---

<a name="s5"></a>
# 5. Dependency Injection

### What is Dependency Injection?
A pattern where a class declares what it needs and something else supplies it — instead of building your own dependencies, you ask for them.

```ts
export class EmployeeListComponent {
  private service = inject(EmployeeService);   // ask, don't build
}
```

### Why use DI instead of `new`?
DI decouples a class from how its dependencies are constructed.

Three reasons: the class no longer knows how to build its dependencies (decoupling), several components can share one instance (shared state), and tests can substitute a fake (testability). With `new`, all three are impossible.

### What is an injector?
A container that holds a registry of providers, knows how to create dependencies from them, and caches the instances it has already created.

### What is the injector hierarchy?
Injectors form a tree that mirrors the component tree.

A request starts at the requesting component's injector and walks up until a provider is found. It's like asking your team lead, then your manager, then HR — the first person who can answer, answers.

### What is the root injector?
The top-level environment injector created at bootstrap.

Holds everything registered with `providedIn: 'root'` or in your bootstrap providers.

### Why is `providedIn: 'root'` tree-shakable?
Because the registration lives on the service class itself, so the bundler can see whether anything actually imports it.

With module-based providers, the module referenced the service, so it always looked "used". A service, unreferenced, can be dropped entirely.

```ts
@Injectable({ providedIn: 'root' })
export class EmployeeService {}
```

### Why is a root service a singleton?
Because there's exactly one root injector, and an injector caches the instance it creates.

Everyone who walks up to it gets the same object.

### How can you create one service instance per component?
Register it in the component's own `providers` array instead of `providedIn: 'root'`.

Every instance of that component then gets its own injector entry — and its children share it.

```ts
@Component({ providers: [WizardStateService] })
export class WizardComponent {}
```

### How does Angular resolve dependencies?
By walking up the injector tree from the requesting element's injector, through parent element injectors, then into the environment injectors up to root, stopping at the first provider found. If nothing is found it hits the null injector and throws "No provider for X".

### What happens if two injectors provide the same service?
You get two separate instances — the resolution walk stops at the **nearest** match to the requesting component, not the furthest.

### How does Angular choose which service instance to inject?
Purely by proximity — the nearest provider in the injector tree wins.

That's also the classic cause of "why do two components see different data?": one of them provided the service locally.

### What are provider scopes?
Where a provider is registered decides its lifetime and how many instances exist.

`'root'` (one per app), `'platform'` (one per platform, across apps), `'any'` (one per lazy-loaded scope), or a component's `providers` (one per component instance).

### What are `useClass`, `useValue`, `useExisting`, and `useFactory` providers?
The four forms of a provider — each answers "what do I hand back for this token" differently.

`useClass` — instantiate this class (how tests swap in a mock). `useValue` — hand back this object as-is (config, constants). `useFactory` — call this function and use its return (runtime decisions). `useExisting` — alias another token, sharing the same instance.

```ts
{ provide: EmployeeService, useClass: MockEmployeeService }
{ provide: API_URL,         useValue: 'https://api.com' }
{ provide: Logger,          useFactory: () => new Logger(env) }
{ provide: OldService,      useExisting: NewService }
```

### What are injection tokens and why are they needed?
An `InjectionToken` is a real runtime object used as a DI lookup key, for things that don't survive to runtime the way a class does.

TypeScript interfaces are erased at compile time — there's nothing at runtime for Angular to use as a lookup key. Classes survive, interfaces don't. Use a token for config objects, strings, and flags.

```ts
export const APP_CONFIG = new InjectionToken<AppConfig>('app.config');
{ provide: APP_CONFIG, useValue: { apiUrl: 'https://api.com' } }
private config = inject(APP_CONFIG);
```

### What do `optional`, `self`, `skipSelf` and `host` do when injecting?
Resolution modifiers change how the injector walk behaves, for the rare cases where "walk up and take the first match" isn't what you want.

`optional` returns `null` instead of throwing when nothing is provided; `self` restricts the lookup to the component's own injector; `skipSelf` starts the walk at the parent, skipping a local provider; `host` stops the walk at the host component. `optional` is by far the most common — for a dependency that may legitimately not be provided.

```ts
inject(Logger, { optional: true })   // null instead of throwing
inject(Logger, { skipSelf: true })   // start at my parent
```

---

<a name="s6"></a>
# 6. Components & Communication

### Why is Angular's data flow one-way?
Data flows down through inputs and events flow up through outputs — never the reverse.

Because predictability. When something is wrong you can trace where a value came from. If children could write upward directly, any component could change any other and you'd have no idea who did it.

### Why shouldn't a child mutate an `@Input()`?
An `@Input()` is owned by the parent — the child only holds a reference to it.

Mutating it changes the parent's state invisibly — the parent never asked for it and can't react to it. Worse, under `OnPush` the reference didn't change, so the parent may not even re-render. The child should emit an event and let the parent decide.

```ts
// ❌ child mutates what it was given
this.employee.name = 'Ravi';
// ✅ child announces intent, parent decides
this.delete.emit(this.employee.id);
```

### How does `@Output()` work internally?
`@Output()` declares an event a child can emit; `EventEmitter` is the mechanism behind it.

`EventEmitter` is a thin wrapper around an RxJS `Subject`. When you write `(delete)="handler()"`, Angular subscribes to that emitter and calls your handler on each emission. `$event` is whatever you passed to `emit()`. One real trap: `.emit()` runs **synchronously** — the parent's handler executes immediately, in the same call stack, not as a Promise or a deferred microtask.

```ts
@Output() delete = new EventEmitter<number>();
onDeleteClick() { this.delete.emit(this.employee.id); }
```
```html
<app-employee-card (delete)="removeEmployee($event)" />
```

### When should you use Inputs/Outputs versus a shared service?
Inputs/outputs are for a direct parent-child edge; a shared service is for components anywhere else in the tree.

Threading a value through five intermediate components that don't care about it is a smell — that's a shared service's job.

### What happens if a parent updates an Input while the child is editing it?
The parent's new value silently overwrites whatever the child was doing, because the binding always wins.

That's why you copy an input into local state before editing, and emit the result — rather than binding a form directly to an object the parent owns.

### How does content projection (`ng-content`) work?
Content projection lets a parent pass markup into a child, which places it somewhere in its own template — the markup is created as part of the **parent's** view, and Angular slots it in wherever your `<ng-content>` sits. It's Angular's equivalent of React's `children`. Use `select="[header]"` for named slots.

```html
<!-- parent -->
<app-card><h2>Hello</h2></app-card>
<!-- card's own template -->
<div class="card"><ng-content /></div>
```

### How does Angular implement `@ContentChild()`?
`@ContentChild` queries the markup a parent projected in through `<ng-content>`.

Because the parent creates that content before your component finishes rendering, the results are available at `ngAfterContentInit` — earlier than view queries.

```ts
@ContentChild(NgControl) control?: NgControl;
```

### What is the difference between `@ViewChild()` and `@ContentChild()`?
`ViewChild` reaches into a component's own template; `ContentChild` reaches into markup the parent projected in.

They resolve at different times too: content at `ngAfterContentInit`, view at `ngAfterViewInit`.

### What do `input()`, `output()` and `model()` give you over the decorators?
The signal-based component API — functions that replace `@Input()`/`@Output()`/two-way pairs with signals.

`input()` and `input.required()` are signals, so they compose directly with `computed()` without a setter or `ngOnChanges`; `input.required()` is enforced by the type system so the property is never `undefined`. `output()` replaces `EventEmitter`. `model()` declares a two-way binding in one line instead of an input plus a matching `Change` output.

```ts
employee = input.required<Employee>();
delete   = output<number>();
selected = model(false);
displayName = computed(() => this.employee().name);
```

### What does the `static` flag on `@ViewChild` do?
It controls **when** a view query resolves — before or after the element could possibly exist.

`static: true` resolves before the first change detection run, so the result is available in `ngOnInit` — but only works if the element is unconditionally present. Inside `@if`/`@for`, it must be `static: false` (the default), resolving in `ngAfterViewInit`. Get it backwards and you read `undefined`.

```ts
@ViewChild('box', { static: true })  box!: ElementRef;   // unconditional element
@ViewChild('box', { static: false }) box!: ElementRef;   // inside @if — default
```

---

<a name="s7"></a>
# 7. Directives

### What is the difference between a component and a directive?
A directive is a class that adds behaviour to an element; a component is a directive that also renders its own template. If it just adds behaviour to markup that already exists — a tooltip, a highlight, an autofocus — it's a directive rather than a component.

```ts
@Directive({ selector: '[appHighlight]' })
export class HighlightDirective {}
```

### How does `*ngIf` work internally?
`*ngIf` is a structural directive — one that decides whether an element exists in the DOM at all, not just how it looks.

The `*` is shorthand. Angular rewrites `<div *ngIf="x">` into `<ng-template [ngIf]="x"><div></div></ng-template>`. The directive then either creates the embedded view or clears it — the element is genuinely absent from the DOM rather than hidden.

```html
<!-- what you write -->
<div *ngIf="loggedIn">Welcome</div>
<!-- what Angular expands it to -->
<ng-template [ngIf]="loggedIn"><div>Welcome</div></ng-template>
```

### Why is `*ngIf` written with an asterisk?
The asterisk is sugar for "wrap this element in an `ng-template` and turn me into a property binding on it." Without it you'd write the template wrapper by hand.

### What does Angular generate behind the scenes for structural directives?
An `<ng-template>` wrapping the element, with the directive turned into a property binding on that template.

This also explains why you can't put two structural directives on one element — each wants its own wrapper, and Angular can't decide which wraps which. Use `ng-container`.

```html
<ng-container *ngIf="user">
  <div *ngFor="let role of user.roles">{{ role }}</div>
</ng-container>
```

### How does `*ngFor` work?
`*ngFor` renders one embedded view per array item and keeps a differ that reconciles the list on every change.

By default it compares by object identity.

### Why is `trackBy` important?
`trackBy`/`track` tells Angular how to recognise "the same item" across a list update, instead of comparing by object reference.

Without it, Angular compares list items by reference. Refetch from an API and every object is new, so every row is destroyed and rebuilt — losing focus, scroll position and animations, and costing real time on a large list. `trackBy` tells Angular what identity means, usually an id. The modern `@for` makes `track` mandatory precisely because it was too easy to forget.

```html
@for (item of items; track item.id) { <li>{{ item.name }}</li> }
```

### How do attribute directives differ from structural directives?
Attribute directives change how an existing element looks or behaves, leaving the DOM structure untouched; structural directives add or remove elements from the DOM.

```ts
@Directive({
  selector: '[appHighlight]',
  host: { '(mouseenter)': 'onEnter()', '(mouseleave)': 'onLeave()' },
})
export class HighlightDirective {
  private el = inject(ElementRef);
  onEnter() { this.el.nativeElement.style.background = 'yellow'; }
  onLeave() { this.el.nativeElement.style.background = ''; }
}
```

### Can you create your own structural directive?
Yes — a structural directive is just a class that controls an `<ng-template>` via `TemplateRef` and `ViewContainerRef`.

Inject `TemplateRef` (the markup blueprint) and `ViewContainerRef` (the slot in the DOM), then call `createEmbeddedView()` to render and `clear()` to remove — driven by an `@Input` setter so it re-evaluates on change.

```ts
@Directive({ selector: '[appIfRole]' })
export class IfRoleDirective {
  private tpl  = inject(TemplateRef<any>);
  private view = inject(ViewContainerRef);
  @Input() set appIfRole(role: string) {
    this.hasRole(role) ? this.view.createEmbeddedView(this.tpl) : this.view.clear();
  }
}
```

### What does `@defer` do, and how is it different from a lazy route?
`@defer` is template-level lazy loading — it splits a block of a page into its own bundle chunk, downloaded only when its trigger fires, rather than splitting only at route boundaries.

```html
@defer (on viewport) {
  <app-heavy-chart [data]="data" />
} @placeholder {
  <div class="skeleton"></div>
} @loading {
  <spinner />
}
```

Triggers include `on viewport`, `on interaction`, `on hover`, `on idle` (the default), `on timer(2s)`, and `when <condition>`. Before `@defer`, a heavy component below the fold shipped in the initial bundle whether or not anyone scrolled to it — lazy loading used to be a routing-only concern.

---

<a name="s8"></a>
# 8. Pipes

### What is a pipe?
A pipe is a named, reusable transformation applied to a value in a template, at the point it's displayed.

It keeps raw data in the component and formatting out of both the class and the template logic.

```html
<p>{{ price | currency }}</p>
```

### How does Angular cache pure pipes?
A pure pipe is memoisation you get for free — Angular skips re-running it when its input hasn't changed.

It stores the last input and last output. On each change detection cycle it compares the current input by reference — if it's the same, it returns the cached result without calling `transform` at all. Like keeping a receipt: if nothing was bought since, don't add up the shopping again.

### What is the difference between pure and impure pipes?
Purity controls when a pipe re-runs — on reference change (pure, the default) or on every cycle (impure).

```ts
@Pipe({ name: 'myPipe', pure: false })
export class MyPipe implements PipeTransform { transform(v: unknown) { /* … */ } }
```

### Why are impure pipes expensive?
Because "every cycle" can mean hundreds of times a second, triggered by activity anywhere in the app.

An impure pipe over a large list re-processes that list constantly, even when nothing related changed.

### When should you create a custom pipe?
A pipe is the right tool for reusable **display formatting** — not for deriving or filtering data.

When you're formatting a value for display and the same formatting appears in more than one template — dates, currency, `timeAgo`, truncation. If it's derived data rather than formatting, a `computed()` signal is usually the better fit.

```ts
@Pipe({ name: 'timeAgo' })
export class TimeAgoPipe implements PipeTransform {
  transform(value: Date): string {
    const mins = Math.floor((Date.now() - value.getTime()) / 60000);
    return `${mins}m ago`;
  }
}
```

### Why shouldn't pipes contain business logic?
A pipe runs on rendering's schedule, not yours, so anything heavy or stateful in one is hard to control.

It's invoked by the rendering process, potentially very often, which makes business logic there hard to test, impossible to reuse outside a template, and easy to make accidentally expensive. Pipes format; services decide.

### Why doesn't Angular ship a `filter` or `sort` pipe?
It's a deliberate omission, not an oversight — neither a pure nor an impure version of it actually works well.

A pure filter pipe won't re-run when you `push` to the array, because the reference didn't change — the filtered view silently goes stale. An impure one runs on *every* change detection cycle, re-filtering the whole list many times a second on every keystroke elsewhere on the page. The fix is to filter in the component, where it runs only when the data actually changes.

```ts
filtered = computed(() =>
  this.users().filter(u => u.name.includes(this.search()))
);
```

---

<a name="s9"></a>
# 9. Routing

### How does Angular Router work internally?
The router is what maps a URL to a component in a single-page app, since there's no server round trip to do it.

It listens to URL changes, matches the URL against your route config top-to-bottom, runs any guards and resolvers, then creates the matched component and inserts it into the `router-outlet`. Navigation is a sequence of steps that can be cancelled at any point by a guard.

```ts
export const routes: Routes = [
  { path: 'employees', component: EmployeeListComponent },
  { path: '**', component: NotFoundComponent },   // wildcard — must be last
];
```

### What is lazy loading?
Splitting an app so a feature's code downloads only when someone visits it, instead of shipping in the initial bundle.

### How are lazy-loaded modules/components downloaded?
Through a dynamic `import()`, which the bundler recognises as a split point and turns into its own chunk file.

The browser fetches it on first navigation to that route.

```ts
{ path: 'reports', loadComponent: () => import('./reports/reports.component').then(m => m.ReportsComponent) }
```

### What is a route guard?
A function that decides whether a navigation may proceed.

It returns `true`, `false`, or a `UrlTree` to redirect — or an Observable/Promise of those. It's the bouncer at the door.

```ts
export const authGuard: CanActivateFn = () =>
  inject(AuthService).isLoggedIn() || inject(Router).createUrlTree(['/login']);
```

### In what order do guards execute?
Guards run in a fixed sequence relative to matching and to the routes being left and entered.

`canMatch` first, during route matching — a failure means the route isn't matched at all and its lazy chunk is never downloaded. Then `canDeactivate` on the route you're leaving, then `canActivateChild` and `canActivate` on the one you're entering, parent-to-child. Resolvers run after guards pass.

### What is a resolver?
A function that fetches data **before** a route activates, so the component never renders in an empty state.

It's waiting for the food to be ready before seating the guest.

```ts
export const employeeResolver: ResolveFn<Employee> = (route) =>
  inject(EmployeeService).getById(Number(route.paramMap.get('id')));
```

### When should data be loaded using a resolver versus inside the component?
The choice is about who owns the wait — the router (blocking) or the component (a spinner).

Resolver when the page is meaningless without the data and you'd rather not flash an empty shell. In the component when you want to show a skeleton immediately — because a resolver **blocks navigation**, so a slow API leaves the user on the old page with no feedback. In practice, component-level loading with a spinner is usually the better experience.

### What is `router-outlet` actually doing?
It's a placeholder directive marking where the router should render the matched component.

Internally it uses a `ViewContainerRef` to create and destroy components as navigation changes.

### How do child routes give you a persistent layout shell?
Nesting routes under a parent with its own `<router-outlet>` renders a shared shell (header, sidebar) once, while only the child area swaps as the URL changes.

```ts
{
  path: 'employees',
  component: EmployeeLayoutComponent,     // has its own <router-outlet>
  children: [
    { path: '',    component: EmployeeListComponent },
    { path: ':id', component: EmployeeDetailComponent },
  ],
}
```

`EmployeeLayoutComponent` stays mounted across every child navigation — its header and sidebar aren't destroyed and rebuilt on every route change, only the nested outlet's content is.

---

<a name="s10"></a>
# 10. RxJS — core

### Why does Angular use RxJS?
RxJS gives Angular one vocabulary for values that arrive over time, plus cancellation — something Promises can't do.

Most of what an app deals with isn't a single value — keystrokes, websocket messages, route changes, retries.

### What is the difference between Promise and Observable?
A Promise is one eager, uncancellable value; an Observable is a lazy, cancellable stream of zero to many values — nothing happens until you subscribe, and unsubscribing genuinely aborts an in-flight HTTP request.

```ts
const obs = this.http.get('/api/users');   // nothing happens yet
const sub = obs.subscribe(users => console.log(users));   // now it fires
sub.unsubscribe();                          // actually aborts it
```

### What is a cold observable?
One where each subscriber triggers its own independent execution.

Two subscribers to an HTTP Observable send two requests.

### What is a hot observable?
One where a single producer is shared across all subscribers.

DOM events and Subjects work this way. `shareReplay` converts cold to hot when you want one request shared by many.

```ts
users$ = this.http.get<User[]>('/api/users').pipe(
  shareReplay({ bufferSize: 1, refCount: true }),
);
```

### Why do HTTP calls complete automatically?
An HTTP request is finite — one response, then the stream is over.

`HttpClient` emits the value and calls `complete`, which tears down the subscription. That's why HTTP calls don't leak, while `interval` and Subjects do.

### Why do Subjects exist?
A `Subject` is both an Observable and an Observer — it lets you push values into a stream from imperative code, making it the bridge between the two.

```ts
const s = new Subject<string>();
s.subscribe(v => console.log(v));
s.next('hello');
```

### What are `BehaviorSubject`, `ReplaySubject`, and `AsyncSubject`?
Three Subject variants that differ in what a **late subscriber** sees.

`BehaviorSubject` — the current value, immediately (needs an initial value, exposes `.value`). The state container. `ReplaySubject(n)` — the last n values. History. `AsyncSubject` — only the final value, and only once the stream completes. Rare. A plain `Subject` gives a late subscriber nothing.

```ts
const b = new BehaviorSubject('initial');
b.subscribe(v => console.log(v));   // 'initial' immediately
console.log(b.value);               // synchronous read
```

### Why should subscriptions be cleaned up?
A live subscription holds a reference to the component, so the component can outlive its own destruction.

Navigate back and forth ten times and you have ten dead components still reacting to events.

### How does `takeUntilDestroyed()` work?
It's `takeUntil` automated — it hooks into `DestroyRef` and completes the stream when the component (or service) is destroyed.

Called in an injection context it finds the `DestroyRef` itself; elsewhere you pass one in. The value is that teardown sits next to setup instead of in a separate `ngOnDestroy`.

```ts
constructor() {
  this.feed.messages$.pipe(takeUntilDestroyed()).subscribe(m => this.messages.push(m));
}
```

---

<a name="s11"></a>
# 11. Rendering & Templates

### How does Angular compile templates?
The compiler turns HTML templates into JavaScript render instructions at build time, resolved against everything in scope — the browser never parses your template; "create this element," "bind this property," "update this text" are all pre-compiled instructions.

### What is interpolation?
`{{ value }}` inserts a value into the template as text.

The result is always stringified, and Angular escapes it, so injected markup can't execute.

```html
<h1>{{ name }}</h1>
```

### What is property binding?
`[prop]="expr"` sets a live DOM property to the result of an expression.

Works with any type: booleans, arrays, objects.

```html
<img [src]="imageUrl">
```

### What is attribute binding?
`[attr.x]="expr"` sets an HTML attribute directly, for cases with no matching DOM property — `colspan`, `aria-*`, `data-*`, SVG.

```html
<td [attr.colspan]="span">
```

### What is event binding?
`(event)="handler()"` attaches a listener that calls a component method.

`$event` carries the DOM event. It's also the one place assignment is legal in a template.

```html
<input (input)="onType($event)">
```

### What is two-way binding?
`[(x)]` is sugar for a property binding plus a matching event binding, following the `x`/`xChange` naming convention.

`[(ngModel)]="name"` expands to `[ngModel]="name" (ngModelChange)="name = $event"`. Any component supports it by exposing an input `x` and an output `xChange`.

```html
<input [ngModel]="name" (ngModelChange)="name = $event">
```

### Why is `[value]` different from `value=""`?
A bare HTML attribute sets the property once, at parse time; a bound property stays live.

`[value]="name"` evaluates an expression and keeps the DOM property in sync as it changes. Without brackets, `value="name"` would literally set the string "name".

### Why is `[disabled]` different from `disabled`?
`disabled` as a bare attribute is a boolean-presence flag — always true once written, regardless of its string value.

`[disabled]="isBusy"` binds the boolean **property**, so `false` actually enables it. This is the classic bug: `disabled="{{ isBusy }}"` stays disabled forever.

```html
<button [disabled]="isBusy">Save</button>       <!-- ✅ -->
<button disabled="{{ isBusy }}">Save</button>   <!-- ❌ always disabled -->
```

### How does Angular sanitize HTML?
Angular escapes interpolated text and sanitizes anything bound into an HTML-related property by default, across five security contexts.

HTML, style, script, URL and resource URL. This happens automatically; you opt *out*, never in.

### Why is `innerHTML` potentially dangerous?
Because you're injecting markup rather than text, and sanitization only protects you until you explicitly bypass it.

If you call `bypassSecurityTrustHtml` on content a user can influence, you've created an XSS hole yourself. The rule: never bypass sanitization on anything user-supplied.

```ts
this.sanitizer.bypassSecurityTrustHtml(html);   // ⚠️ you now own the XSS risk
```

### `ng-container` vs `ng-template` vs `ng-content` — what does each actually do?
Three elements that all render **no DOM node of their own**, but for entirely different jobs — grouping, deferred blueprints, and content projection.

`ng-container` groups elements (often to host a structural directive) without adding a wrapper `<div>` that could break flex/grid layout. `ng-template` defines markup that renders nothing until something explicitly asks Angular to render it — every structural directive compiles into one behind the scenes. `ng-content` is where a parent's projected markup actually appears — Angular's equivalent of React's `children`.

```html
<ng-container *ngIf="loggedIn"><h2>Welcome</h2></ng-container>   <!-- no wrapper div -->
<ng-template #loading>Loading…</ng-template>                     <!-- renders nothing yet -->
<div class="card"><ng-content /></div>                           <!-- parent's markup goes here -->
```

---

<a name="s12"></a>
# 12. Build System

### How does Angular build a project?
The CLI reads `angular.json`, then a **builder** compiles TypeScript and templates ahead of time, bundles the modules, and optimises the output for `dist/` — tree shaking, minification, hashed filenames.

### What is the Angular CLI actually doing?
The CLI is an orchestrator — it resolves configuration and delegates the real work to builders and schematics.

It doesn't bundle anything itself. It also runs schematics for `generate` and migration codemods for `update`.

### What is the role of the builder?
A builder is the pluggable implementation behind a CLI target like `build`, `serve` or `test`.

Swapping the builder swaps the whole toolchain without changing your code — which is how Angular moved from webpack to an esbuild-based pipeline without projects rewriting anything.

### What does Webpack (or the newer build pipeline) do?
Module bundling — it starts at your entry point, follows every import to build a dependency graph, and emits loadable bundle files, splitting at dynamic `import()` boundaries and applying optimisations along the way.

### What is tree shaking?
Removing exported code that nothing in the app actually imports.

It relies on ES modules being statically analysable — the bundler can prove a function is never referenced and drop it. Like unpacking a suitcase and only taking what you'll actually wear.

### What is code splitting?
Breaking one large bundle into several chunks that can load independently.

So the browser downloads only what it needs now.

### What is lazy loading at the bundle level?
A dynamic `import()` at a route creates a split point, so that route's chunk is a separate file, fetched only on first navigation.

Lazy loading is code splitting, triggered by the router.

### Why are production bundles smaller?
Production builds stack several optimisations that a dev build deliberately skips for faster feedback.

AOT so the compiler doesn't ship, tree shaking, minification, dead code elimination, dropping source maps, and removing development-only code like the double change-detection check.

### What is minification?
Shrinking code physically without changing its behaviour.

Shortening variable names, removing whitespace and comments, collapsing expressions.

### What is dead code elimination?
Removing code that can provably never execute.

An `if (false)` branch, a function that's defined but unreachable. Related to tree shaking but different: tree shaking removes *unimported* modules, dead code elimination removes *unreachable* statements.

### What is source map generation?
Producing a file that maps minified output back to the original TypeScript source.

Browser devtools show real filenames and line numbers. Enabled in development; usually off (or uploaded privately to an error tracker) in production.

### How are CSS files bundled?
Global styles are combined into one file; component styles are processed individually under encapsulation.

With emulated encapsulation, every selector gets the component's unique attribute appended and the result is injected at runtime.

### How are assets copied?
Files listed under `assets` in `angular.json` are copied into `dist/` verbatim, with no processing.

They're not hashed — which is why a file in `assets/` can be cached by a browser longer than you want unless you version the filename yourself.

```json
"assets": ["src/favicon.ico", "src/assets"]
```

---

<a name="s13"></a>
# 13. Project Structure

### Why is `angular.json` needed?
It's the CLI's control file — what builder runs each target, and which named option sets (configurations) exist.

Without it the CLI wouldn't know how to build, serve or test your project.

### What is `tsconfig.json` used for?
Standard TypeScript compiler configuration, plus an Angular-specific block for template type-checking strictness.

An `angularCompilerOptions` section holds checks like `strictTemplates`, which type-checks your templates as strictly as your TypeScript.

```json
{ "angularCompilerOptions": { "strictTemplates": true } }
```

### What is `polyfills.ts`?
The file (or config array) listing code that must load before the app to fill in missing browser capabilities — most importantly `zone.js`.

Newer CLI versions replaced the file with a `polyfills` array in `angular.json`, but the purpose is the same.

### What is `main.ts`?
The application entry point — the first code executed.

It bootstraps the root component with the app config, and usually contains nothing else.

### What is `environment.ts`?
A configuration module for values that differ per environment — most commonly the API base URL.

Your code imports one path everywhere; the build substitutes the right file.

### Why are environments replaced during builds?
File replacement swaps in the correct environment file at build time, so only one configuration's values ever ship in a given bundle.

The alternative is branching at runtime, which means both configurations ship and the wrong one could be selected.

⚠️ They are **not** secrets management — everything in them is downloaded by the user.

```ts
import { environment } from './environments/environment';
this.apiUrl = environment.apiUrl;
```

---

<a name="s14"></a>
# 14. Performance

### When should you use `OnPush`?
`OnPush` skips checking a component (and its whole subtree) unless it has explicit reason to — the single biggest runtime performance lever in Angular.

By default on every new component. It's far easier to build with immutable inputs from the start than to retrofit `OnPush` onto an app that mutates freely.

```ts
@Component({ changeDetection: ChangeDetectionStrategy.OnPush })
```

### When should you use Signals?
Signals are the default choice for state that's read synchronously; RxJS stays for anything genuinely time-based.

`computed` gives you memoisation for free and makes `OnPush` correctness automatic. Keep RxJS for debouncing, cancellation, retries, streams.

### How do lazy-loaded routes improve startup time?
Lazy routes keep code that isn't needed on first load out of the initial bundle.

The browser downloads less JavaScript before first paint, and features nobody visits are never downloaded at all.

### What causes unnecessary change detection?
Anything Zone.js treats as "async work finished" fires a cycle — including things you don't want triggering one.

High-frequency events inside the zone (mousemove, scroll, animation frames), `setInterval` timers, third-party libraries that use patched async APIs, and components left on `Default` when their data rarely changes. Angular DevTools' profiler shows you which.

### Why should expensive functions not be called directly in templates?
Template expressions re-evaluate on every change detection cycle, regardless of whether their inputs actually changed.

`{{ getTotal() }}` runs every time; `{{ total() }}` on a computed signal runs only when a dependency changes.

```html
{{ getTotal() }}      <!-- ❌ runs every cycle -->
{{ total() }}          <!-- ✅ computed — cached -->
```

### How do pure pipes improve performance?
A pure pipe caches its last result and skips re-running `transform` when the input reference is unchanged.

That's the difference between a pipe and a method call in a template.

### What causes memory leaks in Angular?
Anything that holds a live reference to a destroyed component — usually an uncleaned subscription to an infinite stream.

Subjects, `interval`, `fromEvent`, websockets. Also event listeners added manually without removal, and observers (`IntersectionObserver`, `ResizeObserver`) never disconnected.

### How would you make a 10,000-row table fast?
Virtual scrolling renders only the rows currently visible, recycling DOM nodes as the user scrolls, instead of creating one node per row.

```html
<cdk-virtual-scroll-viewport itemSize="50" class="viewport">
  <div *cdkVirtualFor="let item of items">{{ item.name }}</div>
</cdk-virtual-scroll-viewport>
```

10,000 rows becomes roughly 20 rendered nodes. Requires `@angular/cdk`. Pair it with `OnPush` on the row component and `track` by a stable id, or the fix is undone by everything else still re-checking and rebuilding rows.

### What are build budgets, and what does `NgOptimizedImage` give you?
Budgets are size limits in `angular.json` that fail the build when a bundle crosses them; `NgOptimizedImage` is a built-in directive that applies image performance best-practices automatically.

```json
"budgets": [{ "type": "initial", "maximumWarning": "500kb", "maximumError": "1mb" }]
```
```html
<img ngSrc="hero.jpg" width="800" height="400" priority>
```

Budgets turn "the app got slowly bigger over two years" into a build failure on the PR that caused it. `NgOptimizedImage` enforces width/height to prevent layout shift, lazy-loads below-the-fold images automatically, and `priority` preloads the one image that matters for LCP — images are usually a bigger performance win than any JavaScript optimisation.

---

<a name="s15"></a>
# 15. Forms

### Reactive vs template-driven — when would you choose each?
Template-driven builds the form model from `ngModel` directives scanned out of the HTML; reactive defines the model explicitly in the class.

Template-driven is fine for a login box. Reactive means validation lives in one place, the form is a plain object you can unit test, and `valueChanges` gives you a stream. Reactive for anything with real logic.

```ts
form = this.fb.nonNullable.group({
  name:  ['', [Validators.required, Validators.minLength(3)]],
  email: ['', [Validators.required, Validators.email]],
});
```

### Why can't you unit test a template-driven form easily?
Because the form model doesn't exist until Angular scans the rendered template for `ngModel` directives.

You have to create a component fixture and run change detection just to get at it. A reactive form is a plain object — construct it and assert.

### Where does a cross-field validator (password confirmation) go, and why?
Cross-field validation belongs on the `FormGroup`, because only the group can see every control at once.

A control validator only sees its own value. It returns an error on the group, and the template checks `form.hasError('mismatch')`.

```ts
export const passwordsMatch: ValidatorFn = (group) =>
  group.get('password')?.value === group.get('confirm')?.value ? null : { mismatch: true };

form = this.fb.nonNullable.group({ password: [''], confirm: [''] }, { validators: passwordsMatch });
```

### How do async validators work? Why must the Observable complete?
An async validator returns an Observable of an error object or `null`, and the control's status is `PENDING` while it runs.

If the Observable never completes, the control stays `PENDING` forever and the form is never valid — so add `first()`. Also set `updateOn: 'blur'` so you're not calling the API on every keystroke.

```ts
username: ['', {
  asyncValidators: [usernameTaken(this.api)],
  updateOn: 'blur',
}]
```

### What is `FormArray` for?
A list of controls whose length changes at runtime.

Skills, phone numbers, invoice line items. You `push` and `removeAt`, and in the template each control is bound by its index.

```ts
addSkill() { this.skills.push(this.fb.nonNullable.control('', Validators.required)); }
```

### `setValue` vs `patchValue` — what's the trap?
`setValue` writes the whole control tree and throws on a missing key; `patchValue` writes only the keys you give it.

`patchValue` also **ignores unknown keys silently**, so a typo in a field name fails quietly and you debug a form that "won't populate".

### How do you make your own component work with `formControlName`?
Implement `ControlValueAccessor` — the contract that lets Angular's forms API read and write your component like any other control.

Register it via `NG_VALUE_ACCESSOR` with `multi: true`. `writeValue` receives values from the form, `registerOnChange` gives you the callback to send values back, `registerOnTouched` reports blur.

```ts
providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => RatingComponent), multi: true }]
writeValue(v: number) { this.value = v; }
registerOnChange(fn: any) { this.onChange = fn; }
```

### Why is a field missing from `form.value`?
`form.value` silently excludes disabled controls.

Use `getRawValue()` when submitting or you'll silently drop fields.

### When should validation errors be displayed to the user?
The standard rule is invalid **and** touched — never while someone is still typing into a field for the first time.

On submit, call `markAllAsTouched()` so every error appears at once.

```html
@if (form.controls.email.invalid && form.controls.email.touched) {
  <p>Not a valid email</p>
}
```

### What do typed forms give you over the old `AbstractControl<any>`?
Since Angular 14, `FormGroup`/`FormControl` carry real generic types, inferred from the initial value you pass in.

`form.controls.name.value` is typed `string`, autocompleted and checked; `form.get('nmae')` is a compile error instead of a silent `null`. Without `this.fb.nonNullable`, `reset()` sets controls to `null`, widening the type to `string | null` — use `nonNullable` unless you actually want that.

```ts
form = this.fb.nonNullable.group({ name: [''], age: [0] });
this.form.controls.name.value;   // string, not `any`
```

---

<a name="s16"></a>
# 16. HTTP & Interceptors

### Why do interceptors exist rather than putting logic in each service?
An interceptor is a function that sees every outgoing request and every incoming response — a single choke point for cross-cutting concerns.

Without it, auth tokens, logging, retries and 401 handling get duplicated across forty service methods and forgotten in the forty-first. It's airport security: one checkpoint everyone passes through, rather than a guard at every gate.

```ts
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).token;
  return next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);
};
```

### In what order do multiple interceptors run — request vs response?
Interceptors form a chain — requests travel down it in registration order, responses travel back up in reverse.

So the last interceptor is closest to the network, and the first one sees the final response.

### Why must you clone the request?
`HttpRequest` objects are immutable.

Mutating it wouldn't propagate — you clone with your changes and pass the clone to `next()`.

```ts
const cloned = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
return next(cloned);
```

### Does Angular ship any built-in interceptors?
Exactly one — XSRF protection — and it's on by default.

It reads a cookie your server sets and copies it into a header on mutating requests, for same-origin URLs only. Everything else — auth, error handling, logging, retry, cache — you write, because token storage and refresh strategy are application decisions Angular can't assume.

### Why should an error interceptor rethrow rather than swallow?
Swallowing an error inside an interceptor destroys information the component needs to react correctly.

If it returns a fallback like `of([])`, the component can't distinguish "no results" from "the request failed" — and shows an empty list where an error message belongs.

```ts
catchError((err: HttpErrorResponse) => {
  if (err.status === 401) { auth.logout(); router.navigate(['/login']); }
  return throwError(() => err);   // rethrow
})
```

### What does `status: 0` mean?
The request never reached the server at all.

Network down, CORS rejection, or DNS failure. Worth special-casing, because the user's fix is different from a server error.

### Does `get<T>()` validate the response at runtime?
No — the generic is a compile-time claim, not a runtime check.

Angular parses the JSON and types it as `T`; if the server sends something else, nothing catches it.

### Which requests are safe to retry, and which aren't?
Only idempotent requests, and only for transient failures.

GETs, and transient failures like 502/503/504. Never retry a POST without idempotency keys, or you can create duplicate records. And never retry 4xx: a 400 or 403 will fail identically every time.

```ts
if (req.method !== 'GET') return next(req);   // never retry writes
return next(req).pipe(retry({ count: 2, delay: (e, n) => timer(n * 1000) }));
```

### Why does `params.set('page', 1)` on its own silently do nothing?
`HttpParams` (and `HttpHeaders`) are immutable — every mutator method returns a **new** instance rather than changing the existing one.

```ts
let params = new HttpParams();
params.set('page', 1);            // ❌ discarded — return value ignored
params = params.set('page', 1);   // ✅ reassign
```

This is the same trap as string immutability in JavaScript, and it silently produces a request with no params at all rather than throwing — worth checking first whenever "my query params aren't showing up" comes up.

---

<a name="s17"></a>
# 17. RxJS — operators

### `switchMap` vs `mergeMap` vs `concatMap` vs `exhaustMap`?
All four are flattening operators — they turn an Observable-of-Observables into a single stream, differing only in how they handle a new value arriving while the previous inner Observable is still running.

**switchMap** — cancels the previous. *Changing TV channels: you abandon the old one.* → type-ahead search, route params.
**mergeMap** — runs everything at once, no ordering. *All checkout counters open.* → parallel uploads.
**concatMap** — queues them in order. *One queue, one counter.* → ordered saves.
**exhaustMap** — ignores new values until the current finishes. *A turnstile: while someone's going through, others are refused.* → submit buttons.

```ts
searchTerm$.pipe(switchMap(term => this.api.search(term))).subscribe();
loginClicks$.pipe(exhaustMap(() => this.auth.login(form))).subscribe();
```

### Which one prevents a stale search result overwriting a fresh one?
`switchMap` — the operator that cancels the previous inner Observable whenever a new outer value arrives.

Without it, the slow response for "ang" can land after the fast one for "angu" and overwrite correct results with stale ones. `switchMap` unsubscribes from the previous request, which actually aborts it.

### Where should `catchError` go — inside or outside `switchMap`?
Placement decides what dies — an error is terminal for whichever stream it's caught in.

Outside, one failed request terminates the entire stream — which is how a search box silently stops responding to typing after a single error. Inside the `switchMap`, only that inner request dies and the outer stream survives.

```ts
searchTerm$.pipe(
  switchMap(term => this.api.search(term).pipe(catchError(() => of([])))),  // ✅ inner
).subscribe();
```

### `forkJoin` vs `combineLatest`? Why might `forkJoin` never emit?
`forkJoin` waits for every source to **complete** and emits once, like `Promise.all`; `combineLatest` emits on every source emission once all have emitted at least once.

`forkJoin` never emits if you give it something that never completes — a `BehaviorSubject`, for instance — and it fails silently.

```ts
forkJoin({ user: this.api.getUser(id), roles: this.api.getRoles(id) })
  .subscribe(({ user, roles }) => { /* … */ });
```

### `debounceTime` vs `throttleTime`?
`debounceTime` waits for silence then emits the last value; `throttleTime` emits immediately then enforces a cooldown.

`debounceTime` for search boxes, where you want one request after they stop typing. `throttleTime` for scroll and resize, where you want regular updates at a capped rate.

```ts
searchControl.valueChanges.pipe(debounceTime(300), distinctUntilChanged());
```

### Why is nesting `.subscribe()` inside `.subscribe()` wrong?
Nested subscriptions are the classic RxJS antipattern — they signal you actually want a flattening operator.

You lose cancellation, error handling becomes impossible to centralise, and it nests deeper with every step. Rule: one `subscribe` per stream.

```ts
// ❌
this.userService.getUser(id).subscribe(user => {
  this.orderService.getOrders(user.id).subscribe(orders => { /* … */ });
});
// ✅
this.userService.getUser(id).pipe(
  switchMap(user => this.orderService.getOrders(user.id)),
).subscribe(orders => { /* … */ });
```

### Why didn't my HTTP request fire?
Observables are lazy — nothing runs until something subscribes.

No `subscribe()`, no `async` pipe, no `toSignal`, no request.

---

<a name="s18"></a>
# 18. State Management

### What problem does state management actually solve?
"State management" really means **shared** state — one piece of data several unrelated components must read and write consistently.

A component's own `loading` flag needs no management at all.

### How would you share state between two unrelated components without a library?
A service, provided in root, holding private writable state exposed as read-only — the "default answer" on the escalation ladder before reaching for a store.

`computed` for derived values, methods as the only writers. Both components inject the service and get the same instance.

```ts
@Injectable({ providedIn: 'root' })
export class CartService {
  private items = signal<CartItem[]>([]);
  readonly all = this.items.asReadonly();
  readonly count = computed(() => this.all().length);
  add(item: CartItem) { this.items.update(list => [...list, item]); }
}
```

### When would you introduce NgRx — and when would you refuse?
NgRx is a full store — actions, reducers, effects, memoised selectors — that trades boilerplate for predictability and traceability.

Introduce it when many features mutate the same state in complex ways, when side effects genuinely need orchestration, or when a large team needs one enforced pattern instead of a dozen hand-rolled services. Refuse it for "we might need it later", for what is really just cached server data, or when two services would do.

### Why are reducers required to be pure?
A reducer is a function `(state, action) → new state` with no side effects.

The same state plus the same action must always produce the same result. That's what makes them trivially testable and what makes time-travel debugging possible.

```ts
export const reducer = createReducer(
  initialState,
  on(loadEmployeesSuccess, (state, { employees }) => ({ ...state, employees })),
);
```

### Why are effects separate from reducers?
Effects are where impure work — HTTP, timers, navigation — is quarantined, so reducers stay pure.

They do the work and then dispatch a new action that a reducer handles.

```ts
loadEmployees$ = createEffect(() => this.actions$.pipe(
  ofType(loadEmployees),
  switchMap(() => this.api.getAll().pipe(map(e => loadEmployeesSuccess({ employees: e })))),
));
```

### What problem do selectors solve?
A selector is a memoised query into the state tree.

They're memoised, so a derived value recomputes only when its input slice actually changes. And they decouple components from the state shape, so you can restructure the tree and only the selectors change.

```ts
export const selectActiveCount = createSelector(
  selectEmployees,
  employees => employees.filter(e => e.active).length,
);
```

### What's wrong with putting server data in a store?
Server data is a cache, not owned client state — putting it in a store makes you responsible for cache invalidation by hand.

You now own staleness, invalidation, refetching after another user's edit, request deduplication and rollback on failed updates — none of which a store solves. Server state belongs in something built to cache it; the store should hold what the client genuinely owns.

---

<a name="s19"></a>
# 19. Auth & Security

### Walk me through your auth flow, end to end.
The standard flow chains together a login call, token storage, an attaching interceptor, route guards, and a refresh path.

User posts credentials; the server returns a token and user object. The service stores the token and sets the current user as a signal. An interceptor attaches the bearer token to every subsequent request. Guards check the current user before activating protected routes, redirecting to login with a `returnUrl`. On a 401, a refresh interceptor gets a new token and retries; if refresh fails, the session is cleared and the user goes back to login.

```ts
readonly isLoggedIn = computed(() => this.currentUser() !== null);
```

### What is a JWT, structurally?
A JSON Web Token is three base64 segments — header, payload, signature — separated by dots.

```
header.payload.signature
{ "alg": "HS256" } . { "sub": "42", "role": "admin", "exp": 1735689600 } . <signature>
```

The payload is **not encrypted** — it's base64, readable by anyone who decodes it — so nothing secret belongs in it. Only the server, holding the signing key, can verify the signature; the client can read `exp` to pre-empt an expiry but can't trust the contents for any security decision.

### Where do you store the JWT? Trade-offs of each option.
Token storage is a tradeoff between XSS exposure and CSRF exposure — there's no option with neither.

`localStorage` is simple and survives a refresh, but **any injected script can read it** — an XSS risk. An `httpOnly` cookie can't be read by JavaScript at all, which removes that risk, but introduces CSRF, so you need token protection (Angular's XSRF interceptor). In-memory is safest but lost on refresh. A good middle ground: access token in memory, refresh token in an httpOnly cookie.

### How do you refresh a token without firing five refresh calls at once?
A flag plus a queue — refresh exactly once, and have every other concurrent 401 wait on that one refresh.

The first 401 sets a `isRefreshing` flag and starts the refresh; concurrent 401s see the flag and wait on a `BehaviorSubject` instead of starting their own. When the refresh resolves, the subject emits the new token and every queued request retries with it. If refresh fails, clear the session.

```ts
if (isRefreshing) {
  return refreshed$.pipe(filter((t): t is string => t !== null), take(1), switchMap(t => next(withToken(req, t))));
}
```

### `canActivate` or `canMatch` for a lazy admin area, and why?
`canMatch` runs during route matching, before the route (and its lazy chunk) is committed to at all — so the route is skipped entirely and the bundle is never fetched. `canActivate` runs *after* the route matched, which means the admin chunk was already downloaded before the user was refused.

### Is hiding a button with `@if` secure?
No — client-side checks are UX, not security, because the client is entirely under the user's control.

They can edit the DOM, decode and modify a token payload, or call your API directly with curl. Guards and conditional UI are **user experience**: they stop honest users finding doors that won't open. Authorization is enforced on the server, on every request.

### Can the client validate a JWT?
Not meaningfully — only the server holds the key that would make validation trustworthy.

The payload is base64, not encrypted — readable and modifiable by anyone. The client can read `exp` to refresh proactively, but it can't trust the contents.

---

<a name="s20"></a>
# 20. Testing

### How do you test a component that depends on a service?
Swap the real service for a fake through `TestBed`'s provider mechanism — the practical payoff of DI.

The component receives the stub through normal dependency injection and never knows the difference.

```ts
TestBed.configureTestingModule({
  providers: [{ provide: EmployeeService, useValue: { getAll: () => of([]) } }],
});
```

### How do you test an HTTP call without a network?
`HttpTestingController` intercepts requests and lets you hand back a fake response instead of hitting the network.

Subscribe to the service method, assert the expected request with `expectOne`, then `flush` a fake response to trigger the subscription. `httpMock.verify()` in `afterEach` fails the test if any request went unhandled.

```ts
const req = httpMock.expectOne('/api/employees');
req.flush([{ id: 1, name: 'Asha' }]);
```

### `fakeAsync` vs `waitForAsync`?
`fakeAsync` gives a virtual, synchronously-advanceable clock; `waitForAsync` waits on real, uncontrollable asynchrony.

`tick(300)` fast-forwards timers synchronously, which is how you test a debounce without waiting 300 real milliseconds. `waitForAsync` is for genuine asynchrony you can't control, where you wait on `fixture.whenStable()`.

```ts
it('debounces', fakeAsync(() => {
  component.searchControl.setValue('ang');
  tick(300);
  expect(service.search).toHaveBeenCalledOnce();
}));
```

### Why does my DOM assertion fail?
Creating a component doesn't render it — a fixture needs `detectChanges()` before the template exists. It's almost always the culprit when a DOM assertion fails unexpectedly.

```ts
fixture.componentRef.setInput('employee', { id: 1, name: 'Asha' });
fixture.detectChanges();   // ← easy to forget
```

### What do you deliberately *not* test?
Private methods, Angular's own behaviour, and other implementation details — test a component's public behaviour instead: inputs in, outputs out, what renders. Those survive a refactor and the internals don't.

---

<a name="s21"></a>
# 21. Latest Angular Features

### What problem does `resource()` solve that `effect()` + `HttpClient` didn't?
`resource()` is a signal-driven wrapper for async data — a fetch that reruns automatically when its input signal changes, exposing loading/error/value as signals.

`effect()` can call `HttpClient` when a signal changes, but loading state, error state, and cancelling a stale in-flight request all had to be hand-wired. `resource()` gives you `value()`, `status()`, `error()`, and `isLoading()` as signals out of the box, and cancels the previous load automatically when its `request` signal changes.

```ts
userResource = resource({
  request: () => ({ id: this.userId() }),
  loader: async ({ request }) => (await fetch(`/api/users/${request.id}`)).json(),
});
```

### `resource()` vs `rxResource()` vs `httpResource()`?
Three variants of the same idea, differing only in the shape their loader returns.

`resource()`'s loader returns a Promise. `rxResource()`'s returns an Observable — useful when a service already returns one. `httpResource()` is a thin wrapper specifically for an `HttpClient` GET, when you just need a URL derived from a signal.

```ts
user = httpResource<User>(() => `/api/users/${this.userId()}`);
```

### How does `resource()` know when to re-fetch?
Its `request` function is tracked exactly like a `computed()`'s dependencies.

Any signal called inside it registers as a dependency. When one changes, the loader reruns automatically — the same dependency-tracking signals already use.

### What does `provideZonelessChangeDetection()` remove, and what does that cost you?
The production API that drops Zone.js from the bundle entirely, relying on signals to drive change detection precisely.

Async APIs are no longer monkey-patched to trigger an automatic "check everything" pass. The cost: state that changes outside Angular's knowledge — a raw `addEventListener` callback, a third-party library's internal state — no longer triggers a view update on its own. That state needs to be a signal, or you update explicitly.

```ts
bootstrapApplication(AppComponent, { providers: [provideZonelessChangeDetection()] });
```

### What is hydration event replay for?
It captures clicks that land in the gap between a server-rendered page appearing and Angular finishing hydration, then replays them once real listeners attach.

A click landing in that window used to be silently dropped.

```ts
provideClientHydration(withEventReplay())
```

### esbuild vs Vite — what does each actually do in the new Angular build system?
Two different tools doing two different jobs in the modern application builder.

esbuild bundles for `ng build` — that's the build-speed win, since it does far less per-file work than the old webpack pipeline. Vite powers `ng serve`'s dev server, serving native ES modules so a rebuild after a file change reprocesses only that file.

### Does moving to Vitest change how Angular tests are written?
No — Vitest is a runner swap, not an API change.

`TestBed`, `ComponentFixture`, `HttpTestingController` are unchanged. Karma launches a real browser to run tests; Vitest runs in Node/a lightweight environment instead, which is where the speed difference comes from.

### What is `@let`, and how is it different from `computed()`?
`@let` declares a read-only, template-scoped local variable.

Visible only within that template block and recalculated every change-detection pass, like an interpolation. `computed()` is a class-level, memoised signal usable anywhere in the component. `@let` is for a value that only exists to make one template more readable.

```html
@let discountedPrice = price() * (1 - discount());
<p>{{ discountedPrice }}</p>
```

### Is Signal Forms something you should know deeply for an interview?
An in-progress, still-experimental signals-based alternative to reactive/template-driven forms.

Know that it exists and the problem it targets — form state expressed as signals instead of the separate reactive-forms Observable API. It's still experimental, so don't over-invest in its API surface; if it comes up, it's more likely a "have you heard of it" question than an implementation one.

### What is `afterRenderEffect()` for?
An `effect()` variant guaranteed to run in the render phase — the safe point for DOM reads and writes — instead of at an arbitrary point in the change detection cycle.

```ts
afterRenderEffect(() => {
  const width = this.containerWidth();   // read a signal
  this.chart.resize(width);              // safe DOM write, guaranteed post-render
});
```

Use it over a plain `effect()` specifically when the side effect touches the DOM or a non-Angular library — a plain `effect()` isn't guaranteed to run at a point in the cycle where that's safe, and can thrash layout.

---

<a name="s22"></a>
# 22. ⭐ Scenario & Debugging

> These can't be memorised, which is exactly why they're asked. Each maps to a real bug — the structure below is what's wrong, why, then the fix.

### "The page shows stale data when you navigate from `/employee/1` to `/employee/2`. Why?"
**What's wrong:** the component is reading `route.snapshot.paramMap`, which is captured once and never updates.

**Why:** Angular **reuses the component instance** when only the route parameter changes, so `ngOnInit` doesn't run again and the snapshot still holds the old id.

```ts
// ❌ read once, never updates
ngOnInit() {
  this.id = this.route.snapshot.paramMap.get('id');
}

// ✅ subscribe and refetch on every change, cancelling the previous request
employee = toSignal(
  this.route.paramMap.pipe(switchMap(p => this.api.getEmployee(p.get('id')!))),
);
```

### "An `OnPush` component isn't updating. Debug it."
**What's wrong:** almost certainly a mutation reaching the component instead of a new reference.

**Why:** `OnPush` compares input **references**, and `employee.name = 'x'` or `items.push(…)` keeps the same reference, so Angular concludes nothing changed.

```ts
// ❌ same reference — OnPush sees nothing
this.employee.name = 'Ravi';

// ✅ new reference — OnPush detects it
this.employee = { ...this.employee, name: 'Ravi' };
```

If the data genuinely arrives from outside Angular's knowledge, call `markForCheck()`.

### "Typing in the search box fires a request per keystroke, and results flicker between old and new. Fix it."
**What's wrong:** two separate bugs — no debouncing, and a race between requests.

**Why:** every keystroke fires its own request, and a slow earlier response can land after a fast later one and overwrite correct results with stale ones.

```ts
// ❌ one HTTP call per keystroke, no cancellation
this.searchControl.valueChanges.subscribe(term => this.api.search(term).subscribe());

// ✅ debounce, then cancel the previous in-flight request
this.searchControl.valueChanges.pipe(
  debounceTime(300),
  distinctUntilChanged(),
  switchMap(term => this.api.search(term)),
).subscribe(results => this.results.set(results));
```

### "The app is slow. Walk me through diagnosing it."
**What's wrong:** unknown — and applying techniques before measuring is itself the mistake.

**Why:** slow-to-load and slow-to-interact have completely different fixes, so treating "slow" as one problem wastes effort on the wrong lever.

```
Chrome DevTools → Performance     where is time actually going?
Angular DevTools → Profiler       which components are checked, how often?
source-map-explorer               what's making the bundle big?
```

Diagnose first, then apply `OnPush`, cheaper templates, `track`, or lazy loading/`@defer` depending on what the profiler actually shows.

### "After a single failed request the search box stops working entirely. Why?"
**What's wrong:** `catchError` is outside the `switchMap`, on the outer stream.

**Why:** an error is terminal for an Observable — it killed the outer stream, the one listening to `valueChanges`, so nothing responds to typing any more.

```ts
// ❌ outer catch — kills the whole stream on one failure
searchTerm$.pipe(switchMap(term => this.api.search(term)), catchError(() => of([]))).subscribe();

// ✅ inner catch — only that request dies
searchTerm$.pipe(switchMap(term => this.api.search(term).pipe(catchError(() => of([]))))).subscribe();
```

### "Users report the app gets slower the longer they use it."
**What's wrong:** a subscription leak.

**Why:** something subscribes to an infinite stream — a Subject, `interval`, `fromEvent` — without cleanup, so destroyed components stay in memory and keep reacting; each navigation adds another.

```ts
// ❌ leaks — interval never completes, component never cleans up
ngOnInit() { interval(1000).subscribe(() => this.tick()); }

// ✅ tied to the component's lifetime
constructor() { interval(1000).pipe(takeUntilDestroyed()).subscribe(() => this.tick()); }
```

### "You get `ExpressionChangedAfterItHasBeenChecked`. What does it mean and how do you fix it?"
**What's wrong:** a value changed after Angular finished its render pass.

**Why:** in development, Angular runs change detection twice and compares the results to verify stability — usually the value was set in `ngAfterViewInit`, after the first pass already rendered.

```ts
// ❌ sets state after the view already rendered once
ngAfterViewInit() { this.title = 'Loaded'; }

// ✅ set it before the first render pass
ngOnInit() { this.title = 'Loaded'; }
```

It only appears in dev, but it's flagging a real instability, not noise.

### "A junior wrote `{{ getTotal() }}`. What's wrong with it?"
**What's wrong:** a method call in a template.

**Why:** it runs on every change detection cycle — potentially hundreds of times a second — even when nothing it depends on changed.

```html
<!-- ❌ recalculates every cycle -->
{{ getTotal() }}

<!-- ✅ recalculates only when a dependency changes -->
{{ total() }}
```
```ts
total = computed(() => this.items().reduce((s, i) => s + i.price, 0));
```

### "Two components show different cart totals. What went wrong?"
**What's wrong:** one of the two components got its own separate service instance.

**Why:** it has the service in its own `providers` array, so injector resolution — which stops at the first provider found walking up — found that local one instead of the root singleton.

```ts
// ❌ this component (and its children) get a SEPARATE CartService instance
@Component({ providers: [CartService] })
export class CheckoutComponent {}

// ✅ remove it — resolve to the root singleton like everyone else
@Component({})
export class CheckoutComponent {}
```

### "A form field's value never reaches the server."
**What's wrong:** the control is disabled.

**Why:** `form.value` excludes disabled controls, so a disabled field silently vanishes from the submitted payload. (Second suspect: `patchValue` with a misspelled key, which fails silently.)

```ts
this.api.submit(this.form.value);         // ❌ drops disabled controls
this.api.submit(this.form.getRawValue()); // ✅ includes everything
```

### "`<button disabled="{{ isBusy }}">` is always disabled. Why?"
**What's wrong:** `disabled` is being set as a bare attribute string, not a bound property.

**Why:** `disabled` is a boolean **attribute** — its presence alone disables the element, and `"false"` is still a non-empty, truthy string.

```html
<!-- ❌ always disabled — the attribute is present regardless of value -->
<button disabled="{{ isBusy }}">Save</button>

<!-- ✅ binds the actual boolean property -->
<button [disabled]="isBusy">Save</button>
```

---

## Before an interview

```
1. Cover the answers. Say yours ALOUD. Section 22 first — it's the least memorisable.
2. Any question you stumble on → open the linked Part, reread that section only.
3. The ⭐ sections are the highest yield: 3 (change detection), 5 (DI),
   17 (RxJS operators), 22 (scenarios).
4. Then build the projects in Part 26. Notes stop helping before an interview does.
```

*— End of question bank —*
