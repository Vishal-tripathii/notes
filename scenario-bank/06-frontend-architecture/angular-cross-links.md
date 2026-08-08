# Angular — Scenario Bank

> These topics already have deep, dedicated coverage in the Angular track — [`Angular/10-change-detection...md`](../../Angular/) (change detection), Part 08 (DI), Part 01 (bootstrap), Part 22 (internals/compilation), Part 14 (routing/lazy loading), Part 12 (RxJS). Rather than duplicate that material, these entries are short and point there for the full depth — see [`Angular/00-ROADMAP.md`](../../Angular/00-ROADMAP.md) for the part index.

---

### "Default vs OnPush change detection? What triggers Angular change detection?"

By default, Angular re-checks **every** component in the tree on **any** async event anywhere (a click, an HTTP response, a timer) — simple to reason about, but wasteful at scale, since most of those components' inputs didn't actually change.

`OnPush` tells a component "only re-check me if one of my `@Input()` references changed, an event originated from inside me, or I was explicitly told to (`markForCheck`)." This is a real performance lever, but it demands **immutable updates** — mutating an object/array in place doesn't change its *reference*, so an `OnPush` component watching that input won't notice the mutation at all; you have to create a new reference (`{...obj, field: newValue}`) for the check to see it as changed.

Full depth: [`Angular/10-change-detection-and-zonejs.md`](../../Angular/10-change-detection-and-zonejs.md).

**Interview line:** *"Default checks the whole tree on any async event; OnPush only re-checks a component when its input references change, an event fires inside it, or it's marked dirty explicitly. The trap is that OnPush needs immutable updates — mutating an object in place doesn't change its reference, so an OnPush component just won't see it."*

*Axis: performance · Source: challenge question*

---

### "Why does a parent re-render? How can a child avoid unnecessary work?"

Same underlying issue as the React parent-cascade case: under `Default` change detection, a parent being checked checks its children top-down regardless of whether their own inputs changed. The fix is the same lever as above — put the child on `OnPush`, and make sure the parent passes it genuinely new references only when the data actually changed, not on every parent render.

**Interview line:** *"Under default change detection, a parent being checked cascades down to children regardless of whether their inputs actually changed — putting the child on OnPush is what stops that, as long as the parent isn't accidentally passing a fresh reference every render for data that hasn't really changed."*

*Axis: performance · Source: challenge question*

---

### "What does trackBy actually solve?"

Without it, `*ngFor`/`@for` re-renders (destroys and recreates) every DOM node in a list whenever the array reference changes — even if most of the items are literally the same data, just in a new array instance (a common outcome of an immutable state update). `trackBy` (or `track` in the new `@for` syntax, which makes it mandatory) tells Angular how to identify "this is the same logical item as before" — usually by ID — so it can update/reorder existing DOM nodes in place instead of destroying and recreating everything, which matters both for performance and for preserving DOM state (focus, animations, form input values) that would otherwise be lost on a full recreate.

Full depth: [`Angular/04-directives.md`](../../Angular/04-directives.md), [`Angular/18-performance.md`](../../Angular/18-performance.md).

**Interview line:** *"Without trackBy, a new array reference means the whole list gets destroyed and recreated in the DOM even if most items are unchanged. trackBy tells Angular how to match items by identity, usually an ID, so it can update or reorder existing nodes instead — which matters for performance and for not losing DOM state like focus or form values on every list update."*

*Axis: performance · Source: challenge question*

---

### "How does Angular DI determine service instances? How do you create component-scoped services?"

Angular resolves a dependency by walking **up** an injector tree — element/component injector → module/environment injector → root — returning the first provider it finds. `providedIn: 'root'` registers a provider at the root, giving you one singleton shared app-wide by default.

A **component-scoped** (non-singleton) instance is created by listing the service in that component's own `providers` array — this creates a *new* injector at that component's level, so Angular finds (and creates) a fresh instance there before ever walking further up to the root one. Every instance of that component gets its own separate service instance, which matters for anything that shouldn't be shared globally (e.g. per-instance form state held in a service).

Full depth: [`Angular/08-dependency-injection-and-services.md`](../../Angular/08-dependency-injection-and-services.md).

**Interview line:** *"DI walks up the injector tree from the component to root, returning the first provider found — providedIn: 'root' gives you one app-wide singleton. To get a non-singleton, I list the service in that specific component's own providers array, which creates a new injector at that level, so every instance of that component gets its own separate service instance instead of sharing the root one."*

*Axis: normal · Source: challenge question*

---

### "What happens during Angular bootstrapping?"

`bootstrapApplication()` (or the legacy `platformBrowserDynamic().bootstrapModule()`) is the entry point: it creates the root injector from the app's providers, compiles/instantiates the root component, and inserts it into the DOM element matched by that component's selector in `index.html`. From there, Angular's rendering and change detection take over for everything nested inside the root component.

Full depth: [`Angular/01-angular-architecture-and-bootstrap.md`](../../Angular/01-angular-architecture-and-bootstrap.md).

**Interview line:** *"bootstrapApplication sets up the root injector from the app's providers, then instantiates and inserts the root component into the DOM element its selector matches in index.html — from there Angular's own rendering and change detection take over for everything nested under it."*

*Axis: normal · Source: challenge question*

---

### "How does Angular compile templates?"

Angular templates are compiled **ahead-of-time (AOT)** by default in production — the compiler (Ivy) turns each template into JavaScript instruction functions at build time, rather than parsing and interpreting template strings in the browser at runtime (which is what the older JIT approach did, and what AOT replaced as the standard). This means faster startup (no in-browser compilation step), smaller bundles (the template compiler and raw template strings aren't shipped, just the compiled output), and template errors caught at build time instead of surfacing at runtime in a user's browser.

Full depth: [`Angular/22-angular-internals.md`](../../Angular/22-angular-internals.md).

**Interview line:** *"By default, Angular compiles templates ahead-of-time at build — Ivy turns each template into JS instruction functions rather than parsing template strings in the browser at runtime. That gives faster startup, smaller bundles since the compiler itself isn't shipped, and template errors caught at build time instead of in a user's browser."*

*Axis: normal · Source: challenge question*

---

### "What happens during lazy loading?"

A lazily-loaded route's component code lives in its own separate chunk, produced by the build (`loadComponent`/`loadChildren`), that's simply **not requested at all** until the router actually navigates to that route. The browser fetches and evaluates that chunk on-demand at navigation time, rather than it being part of the initial bundle download — directly shrinking what has to be downloaded before the app is usable.

Full depth: [`Angular/14-routing.md`](../../Angular/14-routing.md).

**Interview line:** *"Lazy loading means a route's code lives in its own separate build chunk that isn't requested until the router actually navigates there — it's fetched on demand instead of being part of the initial bundle, which directly shrinks what has to download before the app is usable."*

*Axis: performance · Source: challenge question*

---

### "What causes memory leaks with RxJS?"

An `Observable` subscription keeps a reference alive until it's explicitly unsubscribed (or the observable completes on its own) — a component that subscribes in `ngOnInit` but never unsubscribes in `ngOnDestroy` leaves that subscription running **after the component is gone**, holding onto the component instance (and anything it closes over) so garbage collection can't reclaim it. Multiply that across every navigation to a component with this bug, and memory grows unbounded.

The fixes, in order of how commonly they're reached for today: the `async` pipe (automatically unsubscribes when the component is destroyed — the simplest, safest default for template-bound observables), `takeUntilDestroyed()` (the modern, minimal-boilerplate way to auto-unsubscribe in code, tied to `DestroyRef`), or manually unsubscribing in `ngOnDestroy` (the older, more error-prone pattern people forget).

Full depth: [`Angular/12-rxjs.md`](../../Angular/12-rxjs.md).

**Interview line:** *"A subscription stays alive until it's explicitly unsubscribed, so subscribing in ngOnInit without cleanup leaves it running after the component is destroyed, holding a reference that blocks garbage collection. I default to the async pipe for anything template-bound since it unsubscribes automatically, and takeUntilDestroyed for subscriptions in code — manual unsubscribe in ngOnDestroy works but it's the pattern people most often forget."*

*Axis: failure · Source: challenge question*

---
