# 🅰️ Angular Interview Question Bank — Answered

> **How to use:** cover the answer, say yours out loud, then compare. Speaking finds gaps that reading hides.
>
> Answers are deliberately short — the *spoken* version, not the essay. Each section links to the note that explains it properly.
>
> **~195 questions · 21 sections**

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
| 21 | [Scenario & Debugging](#s21) ⭐ | — |

---

<a name="s1"></a>
# 1. Architecture & Bootstrapping

### What happens internally when an Angular application starts?
The browser loads `index.html`, which has an empty `<app-root>` and a script tag. That script is your compiled app. It runs `main.ts`, which calls `bootstrapApplication`. Angular builds the root injector from the providers, finds the element matching the root component's selector, creates the component (dependency injection fills its constructor), runs its compiled template to produce real DOM, then does the same for children recursively. Finally the router renders the URL's component and change detection runs.

### What does `bootstrapApplication()` actually do?
Three things: creates the root environment injector from your providers array, instantiates the root component, and attaches it to the DOM element matching its selector. It returns a promise of the `ApplicationRef`.

### How did bootstrapping work before standalone components?
`platformBrowserDynamic().bootstrapModule(AppModule)`. The root NgModule declared its components and named which one to bootstrap in its `bootstrap` array. The module was the entry point; now the component is.

### What is the Angular compiler?
The tool that turns your templates and decorator metadata into JavaScript. A template isn't HTML at runtime — the compiler converts it into render instructions the framework executes.

### What is the difference between JIT and AOT?
**AOT** compiles at build time; **JIT** compiled in the browser at runtime.
Think of it as pre-cooking the meal versus cooking it when the guest arrives. Pre-cooking means the kitchen (the compiler) doesn't need to travel with you.

### Why is AOT preferred in production?
Three reasons: the compiler doesn't ship in the bundle, so it's smaller; the app starts faster because there's no compile step at runtime; and template errors appear during the build rather than when a user hits the page.

### How does Angular know which component is the root component?
You tell it — `bootstrapApplication(AppComponent, …)`. Angular then looks for the element matching that component's `selector` in the document. Rename the class but not the selector and you get a blank page.

### What is the role of `main.ts`?
It's the entry point — the first file that executes. Its only job is to bootstrap the app, which is why it's usually two lines.

### What is `ApplicationRef`?
The handle to your running application. It knows the attached views, and `tick()` runs change detection from the root. You rarely use it directly, but it's what Zone.js calls when an async task finishes.

### What is `PlatformRef`?
One level above `ApplicationRef` — it represents the *platform* (the browser) rather than the app. One platform can host several Angular applications on the same page, which is what `providedIn: 'platform'` scopes to.

### What is Zone.js, and why did Angular need it?
Zone.js patches the browser's async APIs — `setTimeout`, `addEventListener`, promises, XHR — so it can tell Angular when any of them finish.
Angular doesn't watch your data. It's like a doorbell wired to every door in the house: it doesn't know what changed inside, only that *someone came in*, so it goes and checks everything.

### Can Angular work without Zone.js?
Yes — that's zoneless change detection. The trade is that plain property mutation no longer triggers anything, so state must be in signals or you call `markForCheck` yourself.

### How do Signals reduce Angular's dependency on Zone.js?
Zone.js is a guess: *something happened, check everything.* A signal knows exactly which views read it, so it can say *this changed, update these three things.* Once your state is in signals, the guess is unnecessary.

---

<a name="s2"></a>
# 2. Component Internals

### How does Angular create a component?
It reads the compiled metadata, creates an injector for the component, instantiates the class (filling constructor dependencies), then executes the compiled template function to create the DOM and any child components.

### What actually happens when you write `<app-user>`?
At build time the compiler sees that tag, matches it against the selectors of components in scope, and emits an instruction to create that component there. It's resolved during compilation, not by scanning the DOM at runtime.

### How does Angular map HTML tags to components?
By CSS selector. `selector: 'app-user'` is an element selector; directives usually use attribute selectors like `[appHighlight]`. Standalone components must be in the consuming component's `imports` for the match to be in scope.

### Where is component metadata stored?
The compiler bakes it into a static property on the class itself (an `ɵcmp` definition). That's Ivy's "locality" — everything Angular needs to know about a component lives on the component.

### Why are templates compiled instead of interpreted?
Speed and safety. Interpreting HTML on every change would mean parsing at runtime; compiled templates are just JavaScript function calls. It also means type errors in templates are caught at build time.

### How does Angular instantiate a component?
It calls the class constructor with dependencies resolved from the component's injector, then sets inputs, then runs the lifecycle hooks in order.

### When is the constructor called?
When the class is instantiated — before inputs are set and before the template renders.

### Why does `ngOnInit()` exist if we already have a constructor?
Because inputs aren't bound yet in the constructor. `@Input` values are `undefined` there. `ngOnInit` runs after the first `ngOnChanges`, so it's the first place your inputs are real. It also keeps constructors cheap, which makes the class easy to instantiate in tests.

### How are `@Input()` values assigned?
Angular sets them as plain properties after construction, during the first change detection pass, before `ngOnInit`.

### Why does `ngOnChanges()` execute before `ngOnInit()`?
Because `ngOnChanges` is what *delivers* the inputs. It runs first so that by the time `ngOnInit` fires, everything is populated.

### Why are `@ViewChild()` values unavailable in the constructor?
Because the template hasn't rendered yet — the element doesn't exist. Static queries resolve by `ngOnInit`; dynamic ones (anything inside `@if` or `@for`) resolve at `ngAfterViewInit`.

### What is the difference between projected content and a component's own view?
Your **view** is what your template creates. **Content** is markup the parent passed in through `<ng-content>` — the parent created it, so it's ready earlier. That's why there are two hook pairs: `ngAfterContentInit` for projected content, `ngAfterViewInit` for your own.

---

<a name="s3"></a>
# 3. Change Detection

### What is change detection?
The process of comparing your component's current data against what's on screen and updating the DOM where they differ.

### Why does Angular need change detection?
Because you assign to plain properties — `this.name = 'Ravi'`. There's no setter, no subscription. Something has to notice.

### How does Angular know that a value changed?
It doesn't, directly. Zone.js tells it that an *async task finished*, and Angular then re-evaluates every template expression and compares each with its previous value.

### What triggers a change detection cycle?
DOM events, timers (`setTimeout`, `setInterval`), and async I/O (HTTP, promises) — all patched by Zone.js. Also explicit calls like `markForCheck` or `ApplicationRef.tick()`.

### What is a change detector?
Each component has one. It holds the previous values of that component's bindings and knows how to re-check them. `ChangeDetectorRef` is your handle to it.

### What is the component tree?
The hierarchy of components from the root down. Change detection walks it top-to-bottom, which is why a parent is always checked before its children.

### Does Angular update the whole DOM every time?
No. It *checks* every binding but only *touches* the DOM where a value actually changed. The checking is the cost, not the DOM writes.

### What is dirty checking?
Comparing each binding's current value with its previous one to see if it's "dirty". It's brute force — hence checking everything on every cycle — but it's simple and needs no cooperation from your code.

### Why is object mutation problematic with `OnPush`?
`OnPush` compares input **references**. `employee.name = 'Ravi'` keeps the same object, so the reference is identical and Angular concludes nothing changed. You must replace the object: `{...employee, name: 'Ravi'}`.

### What does `ChangeDetectionStrategy.Default` actually do?
Checks the component on every cycle, regardless of whether anything relevant changed.

### What does `ChangeDetectionStrategy.OnPush` actually do?
Skips the component unless one of four things happens: an input reference changes, an event fires from the component or its children, `markForCheck()` is called, or an async pipe in its template emits. Skipping a component skips its whole subtree — that's where the saving comes from.

### What is `markForCheck()`?
It marks this component and all its ancestors as dirty so they're included in the **next** cycle. It doesn't run change detection itself — it's a request, not a command.

### What is `detectChanges()`?
Runs change detection on this component and its children **immediately and synchronously**. Powerful but easy to misuse — it can cause loops. Prefer `markForCheck`.

### What happens if you call `detach()`?
The component is removed from the change detection tree entirely — it stops being checked. You then own updating it, via `detectChanges()` when you decide. Used for extreme optimisation cases like a high-frequency data grid.

### How many times can a component be checked during one user interaction?
More than once. A single click triggers a cycle; if the handler starts an HTTP call, the response triggers another. And in development mode Angular runs each cycle **twice** to verify stability — which is exactly how `ExpressionChangedAfterItHasBeenChecked` is detected.

---

<a name="s4"></a>
# 4. Signals

### Why did Angular introduce Signals?
Because Zone.js can only say "something happened somewhere." Angular needed values that know who reads them, so it can update precisely what's affected instead of checking everything.

### What problem do Signals solve?
Over-checking. With Zone.js, one keystroke can cause the entire component tree to be re-examined. A signal turns that into a targeted update.

### How are Signals different from RxJS?
A signal is **state** — it always has a current value and you read it synchronously. An Observable is **events over time** — it may not have emitted yet, and it gives you operators for time-based logic like debouncing and cancellation.
Signal = the current temperature on a thermometer. Observable = the log of every temperature reading, with tools to process the stream.

### How does Angular know who depends on a Signal?
By recording reads. When a computed or a template runs, every signal it *calls* registers itself as a dependency of that computation. That's why reading is a function call.

### What is dependency tracking?
Building that graph automatically, at read time, every time the computation runs. Because it re-tracks on each run, branches that aren't taken don't create dependencies.

### Why do we read a Signal using `count()` instead of `count`?
Because the call is the tracking mechanism. A plain property read is invisible to Angular; a function call can register "whoever is currently computing depends on me."

### When should you use `signal()`?
For any piece of state you own and mutate — a counter, a selected tab, a list of cart items.

### When should you use `computed()`?
For anything **derived** from other signals — totals, filtered lists, formatted names. It's lazy (doesn't run until read) and memoised (recalculates only when a dependency changes).

### When should you use `effect()`?
Only for side effects **outside** Angular — logging, `localStorage`, analytics, driving a third-party chart library.

### Why shouldn't `effect()` be used for derived state?
Because it's the wrong tool and it's a loop hazard. Writing a signal inside an effect that reads other signals can retrigger itself. If you're producing a value, that's `computed`.

### Are Signals synchronous or asynchronous?
Synchronous. `set()` then read, and you get the new value immediately. The *view* update is scheduled, but the value itself is not.

### How do Signals work with `OnPush`?
A signal read in a template registers that view as a dependency, so when the signal changes Angular marks that component dirty automatically. You get `OnPush` correctness without calling `markForCheck` yourself.

### How do Signals reduce unnecessary change detection?
By replacing "check everything because something happened" with "this exact view read this exact value, and the value changed." Only the affected views are marked.

---

<a name="s5"></a>
# 5. Dependency Injection

### What is Dependency Injection?
A class declares what it needs, and something else supplies it. Instead of building your own dependencies, you ask for them.

### Why use DI instead of `new`?
Three reasons: the class no longer knows how to build its dependencies (decoupling), several components can share one instance (shared state), and tests can substitute a fake (testability). With `new`, all three are impossible.

### What is an injector?
A container that knows how to create and hand out dependencies. It holds a registry of providers and a cache of already-created instances.

### What is the injector hierarchy?
Injectors form a tree mirroring your component tree. A request starts at the requesting component's injector and walks up until a provider is found.
It's like asking your team lead, then your manager, then HR — the first person who can answer, answers.

### What is the root injector?
The top-level environment injector created at bootstrap, holding everything registered with `providedIn: 'root'` or in your bootstrap providers.

### Why is `providedIn: 'root'` tree-shakable?
Because the registration lives on the *service*, not in a module's providers array. The bundler can see that nothing imports the service and drop it. With module-based providers, the module referenced the service, so it always looked "used".

### Why is a root service a singleton?
Because there's only one root injector, and an injector caches the instance it creates. Everyone who walks up to it gets the same object.

### How can you create one service instance per component?
Put it in the component's `providers` array. Every instance of that component then gets its own injector entry — and its children share it.

### How does Angular resolve dependencies?
It starts at the requesting element's injector, walks up through parent element injectors, then into the environment injectors up to root. First provider found wins. If nothing is found it hits the null injector and throws "No provider for X".

### What happens if two injectors provide the same service?
You get two instances. The one **closest** to the requesting component wins, because the walk stops at the first match.

### How does Angular choose which service instance to inject?
Purely by proximity in the injector tree — nearest provider wins. That's also the classic cause of "why do two components see different data?": one of them provided the service locally.

### What are provider scopes?
Where a provider is registered, which determines its lifetime and count: `'root'` (one per app), `'platform'` (one per platform, across apps), `'any'` (one per lazy-loaded scope), or a component's `providers` (one per component instance).

### What are `useClass`, `useValue`, `useExisting`, and `useFactory` providers?
Four ways to answer "what do I hand back for this token":
`useClass` — instantiate this class (how tests swap in a mock).
`useValue` — hand back this object as-is (config, constants).
`useFactory` — call this function and use its return (runtime decisions).
`useExisting` — alias another token, sharing the same instance.

### What are injection tokens and why are they needed?
An `InjectionToken` is a real runtime object used as a lookup key. You need one because **TypeScript interfaces don't exist at runtime** — they're erased at compile time, so Angular has nothing to look up. Classes survive, interfaces don't. Use a token for config objects, strings, and flags.

---

<a name="s6"></a>
# 6. Components & Communication

### Why is Angular's data flow one-way?
Because predictability. Data goes down through inputs, events come up through outputs, so when something is wrong you can trace where a value came from. If children could write upward directly, any component could change any other and you'd have no idea who did it.

### Why shouldn't a child mutate an `@Input()`?
The parent owns that object. Mutating it changes the parent's state invisibly — the parent never asked for it and can't react to it. Worse, under `OnPush` the reference didn't change, so the parent may not even re-render. The child should emit an event and let the parent decide.

### How does `@Output()` work internally?
`EventEmitter` is a thin wrapper around an RxJS `Subject`. When you write `(delete)="handler()"`, Angular subscribes to that emitter and calls your handler on each emission. `$event` is whatever you passed to `emit()`.

### When should you use Inputs/Outputs versus a shared service?
Inputs and outputs when there's a direct parent–child edge. A shared service when the components are in different branches of the tree — threading a value through five intermediate components that don't care about it is a smell.

### What happens if a parent updates an Input while the child is editing it?
The child's value is overwritten, and any local edit is lost. That's why you copy an input into local state before editing, and emit the result — rather than binding a form directly to an object the parent owns.

### How does content projection (`ng-content`) work?
The parent writes markup inside your component's tags; Angular creates that markup as part of the **parent's** view and then places it where your `<ng-content>` sits. It's Angular's equivalent of React's `children`. Use `select="[header]"` for named slots.

### How does Angular implement `@ContentChild()`?
It's a query over the projected nodes. Because the parent creates that content before your component finishes rendering, the results are available at `ngAfterContentInit` — earlier than view queries.

### What is the difference between `@ViewChild()` and `@ContentChild()`?
`ViewChild` queries your **own** template. `ContentChild` queries what the **parent projected in**. They resolve at different times: content at `ngAfterContentInit`, view at `ngAfterViewInit`.

---

<a name="s7"></a>
# 7. Directives

### What is the difference between a component and a directive?
A component is a directive **with a template**. If it renders its own markup, it's a component; if it just adds behaviour to markup that already exists — a tooltip, a highlight, an autofocus — it's a directive.

### How does `*ngIf` work internally?
The `*` is shorthand. Angular rewrites `<div *ngIf="x">` into `<ng-template [ngIf]="x"><div></div></ng-template>`. The directive then either creates the embedded view or clears it. That's why the element is genuinely absent from the DOM rather than hidden.

### Why is `*ngIf` written with an asterisk?
The asterisk *is* the sugar. It signals "wrap this element in an `ng-template` and turn me into a property binding on it." Without it you'd write the template wrapper by hand.

### What does Angular generate behind the scenes for structural directives?
An `<ng-template>` containing the element, plus a property binding for the directive. This also explains why you can't put two structural directives on one element — each wants its own wrapper, and Angular can't decide which wraps which. Use `ng-container`.

### How does `*ngFor` work?
It creates an embedded view per item and keeps a differ that compares the new list against the old one, then adds, removes or moves views to match. By default it compares by object identity.

### Why is `trackBy` important?
Without it, Angular compares list items by reference. Refetch from an API and every object is new, so every row is destroyed and rebuilt — losing focus, scroll position and animations, and costing real time on a large list. `trackBy` tells Angular what identity means, usually an id. The modern `@for` makes `track` mandatory precisely because it was too easy to forget.

### How do attribute directives differ from structural directives?
Attribute directives change how an existing element looks or behaves — the DOM structure is untouched. Structural directives add or remove elements from the DOM.

### Can you create your own structural directive?
Yes. Inject `TemplateRef` (the markup blueprint) and `ViewContainerRef` (the slot in the DOM), then call `createEmbeddedView()` to render and `clear()` to remove — driven by an `@Input` setter so it re-evaluates on change.

---

<a name="s8"></a>
# 8. Pipes

### What is a pipe?
A named, reusable transformation applied to a value in a template. It keeps raw data in the component and formatting out of both the class and the template logic.

### How does Angular cache pure pipes?
It stores the last input and last output. On each change detection cycle it compares the current input by reference — if it's the same, it returns the cached result without calling `transform` at all.
Like keeping a receipt: if nothing was bought since, don't add up the shopping again.

### What is the difference between pure and impure pipes?
A pure pipe re-runs only when its input changes by reference. An impure pipe (`pure: false`) runs on **every** change detection cycle.

### Why are impure pipes expensive?
Because "every cycle" can mean hundreds of times a second, triggered by activity anywhere in the app. An impure pipe over a large list re-processes that list constantly, even when nothing related changed.

### When should you create a custom pipe?
When you're formatting a value for display and the same formatting appears in more than one template — dates, currency, `timeAgo`, truncation. If it's derived data rather than formatting, a `computed()` signal is usually the better fit.

### Why shouldn't pipes contain business logic?
Because a pipe is invoked by the rendering process, on Angular's schedule, potentially very often. Business logic there is hard to test, impossible to reuse outside a template, and easy to make accidentally expensive. Pipes format; services decide.

---

<a name="s9"></a>
# 9. Routing

### How does Angular Router work internally?
It listens to URL changes, matches the URL against your route config top-to-bottom, runs any guards and resolvers, then creates the matched component and inserts it into the `router-outlet`. Navigation is a sequence of steps that can be cancelled at any point by a guard.

### What is lazy loading?
Splitting your app so a feature's code downloads only when someone visits it, instead of being in the initial bundle.

### How are lazy-loaded modules/components downloaded?
Through a dynamic `import()` in `loadComponent` or `loadChildren`. The bundler sees that import statement and emits a separate chunk file; the browser fetches it on first navigation to that route.

### What is a route guard?
A function that decides whether navigation may proceed. It returns `true`, `false`, or a `UrlTree` to redirect — or an Observable/Promise of those.
It's the bouncer at the door.

### In what order do guards execute?
`canMatch` first, during route matching — a failure means the route isn't matched at all and its lazy chunk is never downloaded. Then `canDeactivate` on the route you're leaving, then `canActivateChild` and `canActivate` on the one you're entering, parent-to-child. Resolvers run after guards pass.

### What is a resolver?
A function that fetches data **before** the route activates, so the component renders with data already present rather than starting empty.
It's waiting for the food to be ready before seating the guest.

### When should data be loaded using a resolver versus inside the component?
Resolver when the page is meaningless without the data and you'd rather not flash an empty shell. In the component when you want to show a skeleton immediately — because a resolver **blocks navigation**, so a slow API leaves the user on the old page with no feedback. In practice, component-level loading with a spinner is usually the better experience.

### What is `router-outlet` actually doing?
It's a placeholder directive marking where the router should insert the matched component. Internally it uses a `ViewContainerRef` to create and destroy components as navigation changes.

---

<a name="s10"></a>
# 10. RxJS — core

### Why does Angular use RxJS?
Because most of what an app deals with isn't a single value — keystrokes, websocket messages, route changes, retries. RxJS gives one vocabulary for values arriving over time, plus cancellation, which promises can't do.

### What is the difference between Promise and Observable?
A promise resolves once, starts immediately, and can't be cancelled. An Observable delivers zero to many values, is **lazy** (nothing happens until you subscribe), and **cancellable** (unsubscribing aborts an in-flight HTTP request).

### What is a cold observable?
One where the producer lives inside it, so each subscriber triggers its own execution. Two subscribers to an HTTP Observable send two requests.

### What is a hot observable?
One where the producer lives outside and is shared, so all subscribers see the same emissions — DOM events, Subjects. `shareReplay` converts cold to hot when you want one request shared by many.

### Why do HTTP calls complete automatically?
Because a request is finite: one response, then it's over. `HttpClient` emits the value and calls `complete`, which tears down the subscription. That's why HTTP calls don't leak, while `interval` and Subjects do.

### Why do Subjects exist?
Because sometimes *you* need to push values in, rather than having them produced inside the Observable. A Subject is both an Observable and an Observer, which makes it the bridge between imperative code and a stream.

### What are `BehaviorSubject`, `ReplaySubject`, and `AsyncSubject`?
They differ in what a **late subscriber** sees.
`BehaviorSubject` — the current value, immediately (needs an initial value, exposes `.value`). The state container.
`ReplaySubject(n)` — the last n values. History.
`AsyncSubject` — only the final value, and only once the stream completes. Rare.
A plain `Subject` gives a late subscriber nothing.

### Why should subscriptions be cleaned up?
Because a live subscription holds a reference to the component. When the component is destroyed, that reference keeps it in memory *and* keeps its callbacks firing. Navigate back and forth ten times and you have ten dead components still reacting to events.

### How does `takeUntilDestroyed()` work?
It hooks into `DestroyRef` — Angular's per-context destroy notification — and completes your stream when that fires. Called in an injection context it finds the `DestroyRef` itself; elsewhere you pass one in. The value is that teardown sits next to setup instead of in a separate `ngOnDestroy`.

---

<a name="s11"></a>
# 11. Rendering & Templates

### How does Angular compile templates?
The compiler parses your HTML, resolves every tag and binding against the components and directives in scope, and emits JavaScript instructions — create this element, bind this property, update this text. The browser never parses your template.

### What is interpolation?
`{{ value }}` — inserts a value into the template as **text**. The result is always stringified, and Angular escapes it, so injected markup can't execute.

### What is property binding?
`[prop]="expr"` — sets a **DOM property** to the result of an expression. Works with any type: booleans, arrays, objects.

### What is attribute binding?
`[attr.x]="expr"` — sets an HTML **attribute**. Needed only where no matching DOM property exists: `colspan`, `aria-*`, `data-*`, SVG.

### What is event binding?
`(event)="handler()"` — attaches a listener and calls your method, with `$event` carrying the DOM event. It's also the one place assignment is legal in a template.

### What is two-way binding?
`[(x)]` — pure sugar for a property binding plus an event binding. `[(ngModel)]="name"` expands to `[ngModel]="name" (ngModelChange)="name = $event"`. Any component supports it by exposing an input `x` and an output `xChange`.

### Why is `[value]` different from `value=""`?
`value="john"` is a static string set once. `[value]="name"` evaluates an expression and keeps the DOM property in sync as it changes. Without brackets, `value="name"` would literally set the string "name".

### Why is `[disabled]` different from `disabled`?
`disabled` as a bare attribute is always true in HTML — its mere presence disables the element, whatever value you give it. `[disabled]="isBusy"` binds the boolean **property**, so `false` actually enables it. This is the classic bug: `disabled="{{ isBusy }}"` stays disabled forever.

### How does Angular sanitize HTML?
It has five security contexts — HTML, style, script, URL and resource URL. Interpolated values are escaped, and values bound to `[innerHTML]` are sanitized: scripts and event handlers are stripped. This happens automatically; you opt *out*, never in.

### Why is `innerHTML` potentially dangerous?
Because you're injecting markup rather than text. Angular sanitizes it, which handles most cases — but if you call `bypassSecurityTrustHtml` on content a user can influence, you've created an XSS hole yourself. The rule: never bypass sanitization on anything user-supplied.

---

<a name="s12"></a>
# 12. Build System

### How does Angular build a project?
The CLI reads `angular.json` to find the target's **builder**, compiles TypeScript and templates ahead of time, bundles the modules, then optimises — tree shaking, minification, hashed filenames — and writes the result to `dist/`.

### What is the Angular CLI actually doing?
Orchestrating. It doesn't bundle anything itself — it resolves configuration and invokes builders, which wrap the underlying toolchain. It also runs schematics for `generate` and migration codemods for `update`.

### What is the role of the builder?
A builder is the implementation of a target like `build`, `serve` or `test`. Swapping the builder swaps the whole toolchain without changing your code — which is how Angular moved from webpack to an esbuild-based pipeline without projects rewriting anything.

### What does Webpack (or the newer build pipeline) do?
Module bundling: it starts at your entry point, follows every import to build a dependency graph, and produces bundle files the browser can load — splitting at dynamic `import()` boundaries and applying optimisations along the way.

### What is tree shaking?
Removing exported code that nothing imports. It relies on ES modules being statically analysable — the bundler can prove a function is never referenced and drop it.
Like unpacking a suitcase and only taking what you'll actually wear.

### What is code splitting?
Breaking one big bundle into several chunks that can load independently, so the browser downloads only what it needs now.

### What is lazy loading at the bundle level?
The routing feature and the bundling feature meeting: a dynamic `import()` in a route creates a split point, so that chunk is a separate file fetched on first navigation. Lazy loading is code splitting, triggered by the router.

### Why are production bundles smaller?
Several things at once: AOT so the compiler doesn't ship, tree shaking, minification, dead code elimination, dropping source maps, and removing development-only code like the double change-detection check.

### What is minification?
Making the code physically smaller without changing behaviour — shortening variable names, removing whitespace and comments, collapsing expressions.

### What is dead code elimination?
Removing code that can never execute — an `if (false)` branch, a function that's defined but unreachable. Related to tree shaking but different: tree shaking removes *unimported* modules, dead code elimination removes *unreachable* statements.

### What is source map generation?
Producing a file that maps minified output back to your original TypeScript, so browser devtools show real filenames and line numbers. Enabled in development; usually off (or uploaded privately to an error tracker) in production.

### How are CSS files bundled?
Global styles listed in `angular.json` are bundled into one stylesheet. Component styles are processed per component — with emulated encapsulation, every selector gets the component's unique attribute appended and the result is injected at runtime.

### How are assets copied?
The `assets` array in `angular.json` lists folders copied verbatim into `dist/`. They're not processed or hashed — which is why a file in `assets/` can be cached by a browser longer than you want unless you version the filename yourself.

---

<a name="s13"></a>
# 13. Project Structure

### Why is `angular.json` needed?
It's the CLI's configuration: which builder runs each target, what options apply, and which named configurations exist (development, production). Without it the CLI wouldn't know how to build, serve or test your project.

### What is `tsconfig.json` used for?
Two things: standard TypeScript compiler options (target, strictness, paths) and an `angularCompilerOptions` section for Angular-specific checks like `strictTemplates`, which type-checks your templates as strictly as your TypeScript.

### What is `polyfills.ts`?
Historically a file that imported browser shims — most importantly `zone.js`. Newer CLI versions replaced the file with a `polyfills` array in `angular.json`, but the purpose is the same: code that must load before the app to fill in missing browser capabilities.

### What is `main.ts`?
The application entry point — the first code to execute. It bootstraps the root component with the app config, and usually contains nothing else.

### What is `environment.ts`?
A configuration module for per-environment values, most commonly the API base URL. Your code imports one path everywhere; the build substitutes the right file.

### Why are environments replaced during builds?
Because the alternative is branching at runtime, which means both configurations ship and the wrong one could be selected. File replacement in `angular.json` swaps `environment.ts` for `environment.prod.ts` at build time, so only the correct values exist in the bundle.
⚠️ They are **not** secrets management — everything in them is downloaded by the user.

---

<a name="s14"></a>
# 14. Performance

### When should you use `OnPush`?
By default on every new component. It's far easier to build with immutable inputs from the start than to retrofit `OnPush` onto an app that mutates freely.

### When should you use Signals?
For component and shared state, and especially anything derived — `computed` gives you memoisation for free and makes `OnPush` correctness automatic. Keep RxJS for time-based work: debouncing, cancellation, retries, streams.

### How do lazy-loaded routes improve startup time?
They keep code out of the initial bundle. The browser downloads less JavaScript before first paint, and features nobody visits are never downloaded at all.

### What causes unnecessary change detection?
High-frequency events inside the zone (mousemove, scroll, animation frames), `setInterval` timers, third-party libraries that use patched async APIs, and components left on `Default` when their data rarely changes. Angular DevTools' profiler shows you which.

### Why should expensive functions not be called directly in templates?
Because template expressions are re-evaluated on every change detection cycle — potentially hundreds of times a second — regardless of whether their inputs changed. `{{ getTotal() }}` runs every time; `{{ total() }}` on a computed signal runs only when a dependency changes.

### How do pure pipes improve performance?
They're memoisation you get for free: Angular caches the last result and skips `transform` entirely when the input reference is unchanged. That's the difference between a pipe and a method call in a template.

### What causes memory leaks in Angular?
Subscriptions to infinite streams that are never cleaned up — Subjects, `interval`, `fromEvent`, websockets. Also event listeners added manually without removal, and observers (`IntersectionObserver`, `ResizeObserver`) never disconnected. Each holds a reference to the component, so the destroyed component can't be collected.

---

<a name="s15"></a>
# 15. Forms

### Reactive vs template-driven — when would you choose each?
Template-driven builds the model from `ngModel` directives in the HTML — fine for a login box. Reactive defines the model in the class, so validation lives in one place, the form is a plain object you can unit test, and `valueChanges` gives you a stream. Reactive for anything with real logic.

### Why can't you unit test a template-driven form easily?
Because the form model doesn't exist until the template renders. You have to create a component fixture and run change detection just to get at it. A reactive form is a plain object — construct it and assert.

### Where does a cross-field validator (password confirmation) go, and why?
On the `FormGroup`, not on either control. A control validator only sees its own value; only the group can see both fields. It returns an error on the group, and the template checks `form.hasError('mismatch')`.

### How do async validators work? Why must the Observable complete?
They return an Observable of an error object or `null` and go in the `asyncValidators` slot; the control's status is `PENDING` while one runs. If the Observable never completes, the control stays `PENDING` forever and the form is never valid — so add `first()`. Also set `updateOn: 'blur'` so you're not calling the API on every keystroke.

### What is `FormArray` for?
A list of controls whose length changes at runtime — skills, phone numbers, invoice line items. You `push` and `removeAt`, and in the template each control is bound by its index.

### `setValue` vs `patchValue` — what's the trap?
`setValue` requires a value for every control and throws if one is missing. `patchValue` updates only the keys you give it — but it also **ignores unknown keys silently**, so a typo in a field name fails quietly and you debug a form that "won't populate".

### How do you make your own component work with `formControlName`?
Implement `ControlValueAccessor` and register it via `NG_VALUE_ACCESSOR` with `multi: true`. `writeValue` receives values from the form, `registerOnChange` gives you the callback to send values back, `registerOnTouched` reports blur.

### Why is a field missing from `form.value`?
It's disabled. Disabled controls are excluded from `value` — use `getRawValue()` when submitting or you'll silently drop fields.

### When should validation errors be displayed to the user?
Not while they're still filling a field in. The standard condition is invalid **and** touched, so errors appear on blur. On submit, call `markAllAsTouched()` so every error appears at once.

---

<a name="s16"></a>
# 16. HTTP & Interceptors

### Why do interceptors exist rather than putting logic in each service?
Because auth tokens, logging, retries and 401 handling apply to *every* request. Without a choke point that logic is duplicated across forty service methods and forgotten in the forty-first.
It's airport security: one checkpoint everyone passes through, rather than a guard at every gate.

### In what order do multiple interceptors run — request vs response?
Requests pass through in the order they're registered; responses come back in reverse. So the last interceptor is closest to the network and the first one sees the final response.

### Why must you clone the request?
`HttpRequest` is immutable. Mutating it wouldn't propagate — you clone with your changes and pass the clone to `next()`.

### Does Angular ship any built-in interceptors?
One: XSRF protection, enabled by default. It reads a cookie your server sets and copies it into a header on mutating requests, for same-origin URLs only. Everything else — auth, error handling, logging, retry, cache — you write, because token storage and refresh strategy are application decisions Angular can't assume.

### Why should an error interceptor rethrow rather than swallow?
Because if it returns a fallback like `of([])`, the component can't distinguish "no results" from "the request failed" — and shows an empty list where an error message belongs. Handle cross-cutting concerns there, then rethrow.

### What does `status: 0` mean?
The request never reached the server — network down, CORS rejection, or DNS failure. Worth special-casing, because the user's fix is different from a server error.

### Does `get<T>()` validate the response at runtime?
No. It's a compile-time claim only. Angular parses the JSON and types it as `T`; if the server sends something else, nothing catches it.

### Which requests are safe to retry, and which aren't?
Idempotent ones — GETs, and transient failures like 502/503/504. Never retry a POST without idempotency keys, or you can create duplicate records. And never retry 4xx: a 400 or 403 will fail identically every time.

---

<a name="s17"></a>
# 17. RxJS — operators

### `switchMap` vs `mergeMap` vs `concatMap` vs `exhaustMap`?
All four flatten an inner Observable. They differ in what happens when a new value arrives while one is still running:
**switchMap** — cancels the previous. *Changing TV channels: you abandon the old one.* → type-ahead search, route params.
**mergeMap** — runs everything at once, no ordering. *All checkout counters open.* → parallel uploads.
**concatMap** — queues them in order. *One queue, one counter.* → ordered saves.
**exhaustMap** — ignores new values until the current finishes. *A turnstile: while someone's going through, others are refused.* → submit buttons.

### Which one prevents a stale search result overwriting a fresh one?
`switchMap`. Without it, the slow response for "ang" can land after the fast one for "angu" and overwrite correct results with stale ones. `switchMap` unsubscribes from the previous request, which actually aborts it.

### Where should `catchError` go — inside or outside `switchMap`?
Inside, almost always. Outside, one failed request terminates the entire stream — which is how a search box silently stops responding to typing after a single error. Inside the `switchMap`, only that inner request dies and the outer stream survives.

### `forkJoin` vs `combineLatest`? Why might `forkJoin` never emit?
`forkJoin` waits for every source to **complete** and emits once with the final values, like `Promise.all`. `combineLatest` emits every time any source emits, once all have emitted at least once. `forkJoin` never emits if you give it something that never completes — a `BehaviorSubject`, for instance — and it fails silently.

### `debounceTime` vs `throttleTime`?
`debounceTime` waits for a pause, then emits the last value — right for search boxes, where you want one request after they stop typing. `throttleTime` emits immediately then ignores everything for a period — right for scroll and resize, where you want regular updates at a capped rate.

### Why is nesting `.subscribe()` inside `.subscribe()` wrong?
You lose cancellation, error handling becomes impossible to centralise, and it nests deeper with every step. A flattening operator gives you one chain, one subscribe, one error handler — and `switchMap` cancels correctly when inputs change. Rule: one `subscribe` per stream.

### Why didn't my HTTP request fire?
Because Observables are lazy. Nothing happens until something subscribes — no `subscribe()`, no `async` pipe, no `toSignal`, no request.

---

<a name="s18"></a>
# 18. State Management

### What problem does state management actually solve?
Shared state, not state. A component's own `loading` flag needs no management. The problem is one piece of data that several unrelated components must read and write consistently.

### How would you share state between two unrelated components without a library?
A service provided in root, holding a private signal, exposed read-only, with `computed` for derived values and methods as the only writers. Both components inject the service and get the same instance. That's already a store — state, selectors and actions — without the boilerplate.

### When would you introduce NgRx — and when would you refuse?
Introduce it when many features mutate the same state in complex ways, when side effects genuinely need orchestration, or when a large team needs one enforced pattern instead of a dozen hand-rolled services. Refuse it for "we might need it later", for what is really just cached server data, or when two services would do.

### Why are reducers required to be pure?
Because the same state plus the same action must always produce the same result. That's what makes them trivially testable and what makes time-travel debugging possible — you can replay a list of actions and get the identical state.

### Why are effects separate from reducers?
To keep reducers pure. Anything impure — HTTP, timers, navigation — is quarantined into effects, which do the work and then dispatch a new action that a reducer handles.

### What problem do selectors solve?
Two. They're memoised, so a derived value recomputes only when its input slice actually changes. And they decouple components from the state shape, so you can restructure the tree and only the selectors change.

### What's wrong with putting server data in a store?
You've turned a caching problem into a manual one. You now own staleness, invalidation, refetching after another user's edit, request deduplication and rollback on failed updates — none of which a store solves. Server state belongs in something built to cache it; the store should hold what the client genuinely owns.

---

<a name="s19"></a>
# 19. Auth & Security

### Walk me through your auth flow, end to end.
User posts credentials; the server returns a token and user object. The service stores the token and sets the current user as a signal. An interceptor attaches the bearer token to every subsequent request. Guards check the current user before activating protected routes, redirecting to login with a `returnUrl`. On a 401, a refresh interceptor gets a new token and retries; if refresh fails, the session is cleared and the user goes back to login.

### Where do you store the JWT? Trade-offs of each option.
`localStorage` is simple and survives a refresh, but **any injected script can read it** — an XSS risk. An `httpOnly` cookie can't be read by JavaScript at all, which removes that risk, but introduces CSRF, so you need token protection (Angular's XSRF interceptor). In-memory is safest but lost on refresh. A good middle ground: access token in memory, refresh token in an httpOnly cookie.

### How do you refresh a token without firing five refresh calls at once?
With a flag and a queue. The first 401 sets a `isRefreshing` flag and starts the refresh; concurrent 401s see the flag and wait on a `BehaviorSubject` instead of starting their own. When the refresh resolves, the subject emits the new token and every queued request retries with it. If refresh fails, clear the session.

### `canActivate` or `canMatch` for a lazy admin area, and why?
`canMatch`. `canActivate` runs *after* the route matched, which means the admin chunk was already downloaded before the user was refused. `canMatch` runs during matching, so the route is skipped entirely and the bundle is never fetched.

### Is hiding a button with `@if` secure?
No. Everything in the browser is under the user's control — they can edit the DOM, decode and modify a token payload, or call your API directly with curl. Guards and conditional UI are **user experience**: they stop honest users finding doors that won't open. Authorization is enforced on the server, on every request.

### Can the client validate a JWT?
Not for security. The payload is base64, not encrypted — readable and modifiable by anyone. Only the server holds the signing key. The client can read `exp` to refresh proactively, but it can't trust the contents.

---

<a name="s20"></a>
# 20. Testing

### How do you test a component that depends on a service?
Provide a fake in the `TestBed` — `{ provide: RealService, useValue: fake }`. The component receives the stub through normal dependency injection and never knows the difference. That's the practical payoff of DI.

### How do you test an HTTP call without a network?
`HttpTestingController`. Subscribe to the service method, assert the expected request with `expectOne`, then `flush` a fake response to trigger the subscription. `httpMock.verify()` in `afterEach` fails the test if any request went unhandled.

### `fakeAsync` vs `waitForAsync`?
`fakeAsync` gives a virtual clock — `tick(300)` fast-forwards timers synchronously, which is how you test a debounce without waiting 300 real milliseconds. `waitForAsync` is for genuine asynchrony you can't control, where you wait on `fixture.whenStable()`.

### Why does my DOM assertion fail?
Almost always a missing `fixture.detectChanges()`. Creating a component doesn't render it — change detection has to run before the template exists.

### What do you deliberately *not* test?
Private methods, Angular's own behaviour, and implementation details. Test public behaviour — inputs in, outputs out, what renders — because those survive a refactor and the internals don't.

---

<a name="s21"></a>
# 21. ⭐ Scenario & Debugging

> These can't be memorised, which is exactly why they're asked. Each maps to a real bug.

### "The page shows stale data when you navigate from `/employee/1` to `/employee/2`. Why?"
The component is reading `route.snapshot.paramMap`. Angular **reuses the component instance** when only the parameter changes, so `ngOnInit` doesn't run again and the snapshot still holds the old id. Fix: subscribe to `paramMap` and `switchMap` into the fetch, so every param change refetches and cancels the previous request.

### "An `OnPush` component isn't updating. Debug it."
Almost certainly a mutation. `OnPush` compares input **references**, and `employee.name = 'x'` or `items.push(…)` keeps the same reference. Replace instead of mutating. If the data genuinely arrives from outside Angular's knowledge, `markForCheck()`.

### "Typing in the search box fires a request per keystroke, and results flicker between old and new. Fix it."
Two separate bugs. The request-per-keystroke needs `debounceTime(300)` plus `distinctUntilChanged()`. The flicker is a race — a slow earlier response landing after a fast later one — which means `switchMap`, so the previous request is cancelled rather than left to arrive.

### "The app is slow. Walk me through diagnosing it."
First separate slow-to-load from slow-to-interact, because the fixes don't overlap. Chrome's Performance panel and Angular DevTools' profiler show whether time is going into change detection and which components are being checked. `source-map-explorer` shows what's making the bundle big. I don't apply techniques until I know which problem it is.

### "After a single failed request the search box stops working entirely. Why?"
`catchError` is outside the `switchMap`. An error is terminal for an Observable, so it killed the outer stream — the one listening to `valueChanges` — and nothing responds to typing any more. Move the `catchError` inside the `switchMap` so only the inner request dies.

### "Users report the app gets slower the longer they use it."
A subscription leak. Something subscribes to an infinite stream — a Subject, `interval`, `fromEvent` — without cleanup, so destroyed components stay in memory and keep reacting. Each navigation adds another. Fix with the `async` pipe or `takeUntilDestroyed()`.

### "You get `ExpressionChangedAfterItHasBeenChecked`. What does it mean and how do you fix it?"
In development, Angular runs change detection twice and compares the results to verify stability. A value changed after rendering finished — usually because state was set in `ngAfterViewInit`. The right fix is to do that work in `ngOnInit`; otherwise call `detectChanges()` explicitly. It only appears in dev, but it's flagging a real instability, not noise.

### "A junior wrote `{{ getTotal() }}`. What's wrong with it?"
It runs on every change detection cycle — potentially hundreds of times a second — even when nothing it depends on changed. Replace with a `computed()` signal or a pure pipe, both of which recalculate only when their inputs change.

### "Two components show different cart totals. What went wrong?"
One of them has the service in its own `providers` array, so it got a separate instance. Injector resolution stops at the first provider found walking up, so a local provider shadows the root one. Remove it and let both resolve to the root singleton.

### "A form field's value never reaches the server."
The control is disabled. `form.value` excludes disabled controls — use `getRawValue()`. (Second suspect: `patchValue` with a misspelled key, which fails silently.)

### "`<button disabled="{{ isBusy }}">` is always disabled. Why?"
Because `disabled` is a boolean **attribute** — its presence alone disables the element, and `"false"` is still a non-empty string. Use property binding: `[disabled]="isBusy"`.

---

## Before an interview

```
1. Cover the answers. Say yours ALOUD. Section 21 first — it's the least memorisable.
2. Any question you stumble on → open the linked Part, reread that section only.
3. The ⭐ sections are the highest yield: 3 (change detection), 5 (DI),
   17 (RxJS operators), 21 (scenarios).
4. Then build the projects in Part 26. Notes stop helping before an interview does.
```

*— End of question bank —*

