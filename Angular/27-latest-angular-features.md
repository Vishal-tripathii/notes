# Angular Study Notes — Part 27

## Latest Angular Features (post-signals)

> **Roadmap:** [Part 27](00-ROADMAP.md) · **Priority:** ⭐⭐⭐☆☆
>
> **Continues:** [Part 11 — Signals](11-signals.md) · [Part 10 — Change Detection](10-change-detection-and-zonejs.md) · [Part 21 — SSR & Hydration](21-ssr-and-hydration.md) · [Part 20 — Testing](20-testing.md).
>
> ⚠️ **Version note:** these shipped across several Angular releases after signals landed. Exact version numbers and API names shifted during stabilization (several started as `experimental*`-prefixed APIs and were later renamed). Confirm the exact name against the version in the job's stack — the *concept* is what an interviewer is testing, not whether you memorised a release number.

---

## Table of Contents

1. [The problem — signals created a new gap](#problem)
2. [`resource()` / `rxResource()` / `httpResource()` — reactive async data](#resource) ⭐
3. [`afterRenderEffect()` — render-phase reactivity](#afterrendereffect)
4. [`@let` — template local variables](#let)
5. [`provideZonelessChangeDetection()` — zoneless in production](#zoneless) ⭐
6. [Hydration event replay](#event-replay)
7. [The esbuild/Vite build system](#esbuild-vite)
8. [Vitest — the new test runner story](#vitest)
9. [Self-closing tags](#self-closing)
10. [Signal Forms — experimental, don't over-invest](#signal-forms)
11. [Interview Q&A](#interview)
12. [The 60-second summary](#summary)

---

<a name="problem"></a>
# 1. The problem — signals created a new gap

[Part 11](11-signals.md) covered `signal()`, `computed()`, and `effect()` for **synchronous** state. But most real screens don't start from synchronous state — they start from an HTTP call. Before this batch of features, "fetch data driven by a signal" meant hand-wiring an `effect()` that calls `HttpClient` and writes the result into another signal, manually tracking loading/error state yourself. That's the gap `resource()` closes — the rest of this part is smaller, related gaps (rendering, hydration, tooling) that got filled in the same stretch of releases.

---

<a name="resource"></a>
# 2. ⭐ `resource()` / `rxResource()` / `httpResource()` — reactive async data

The problem stated plainly: you have a signal (`userId`), and you want a fetch to **re-run automatically whenever it changes**, with loading/error state you didn't have to build by hand.

```ts
userId = signal(1);

userResource = resource({
  params: () => ({ id: this.userId() }),        // tracked like a computed's deps
  loader: async ({ params, abortSignal }) => {
    const res = await fetch(`/api/users/${params.id}`, { signal: abortSignal });
    return res.json();
  },
});
```

> ⚠️ **API rename in Angular 20:** this option used to be called **`request`** (and the loader received `{ request }`). Since v20 it's **`params`** / `{ params }`. Older articles and codebases on v19 use the old name — same idea. If `params` returns `undefined`, the resource stays `idle` and doesn't load (handy for "no id selected yet").

`resource()` gives you back an object of signals, not a promise:

```ts
userResource.value()      // the data, or undefined before it resolves
userResource.hasValue()   // true once there's a value (use it before reading value() safely)
userResource.status()     // 'idle' | 'loading' | 'reloading' | 'resolved' | 'error' | 'local'
userResource.error()      // the error, if any
userResource.isLoading()  // convenience boolean
userResource.reload()     // re-run the loader on demand
userResource.value.set(x) // set a value locally (status becomes 'local') — e.g. optimistic update
```

**How it works:** the `params` function is read like a `computed()`'s dependencies — any signal read inside it becomes a trigger. When one changes, Angular reruns `loader` automatically, and cancels the in-flight one via `abortSignal` — the same job `switchMap` does in RxJS, but built in.

**`httpResource()`** — a thinner wrapper specifically for `HttpClient`, since writing `fetch` by hand is rarely what you want in Angular:

```ts
user = httpResource<User>(() => `/api/users/${this.userId()}`);
// goes through HttpClient → your interceptors still run ✅
// also exposes user.headers(), user.statusCode(), user.progress()
```

**`rxResource()`** — for when the loader is naturally an Observable instead of a Promise (reusing an existing service method that returns one). Since Angular 20 its loader option is called **`stream`** (it was `loader` before):

```ts
user = rxResource({
  params: () => ({ id: this.userId() }),
  stream: ({ params }) => this.userService.getById(params.id),   // returns Observable
});
```

> 🧠 **Remember:** `params` = **what** to load (signals in), `loader`/`stream` = **how** to load it. Change a signal in `params` → the old request is cancelled and a new one starts.

⚠️ This does **not** replace RxJS. It replaces the specific pattern of "signal in, HTTP call out, track loading/error by hand." Debounced search, WebSocket streams, polling — that's still RxJS territory (see [Part 12](12-rxjs.md)), because `resource()` reacts to a signal changing, it doesn't operate on a stream of events over time.

---

<a name="afterrendereffect"></a>
# 3. `afterRenderEffect()` — render-phase reactivity

[Part 07](07-lifecycle-hooks.md) covered `afterRender` / `afterNextRender` — hooks for DOM work that must happen after Angular finishes rendering (measuring an element, initializing a third-party chart library). `afterRenderEffect()` combines that timing guarantee with signal tracking: it's an `effect()` that specifically runs in the render phase, split into the same sub-phases (`earlyRead`, `write`, `mixedReadWrite`, `read`) that `afterRender` uses to keep reads and writes from thrashing layout.

```ts
afterRenderEffect(() => {
  const width = this.containerWidth();   // read a signal
  this.chart.resize(width);              // safe DOM write, guaranteed post-render
});
```

Use it over a plain `effect()` when the side effect specifically touches the DOM or a non-Angular library — a plain `effect()` isn't guaranteed to run at a safe point in the render cycle for that.

---

<a name="let"></a>
# 4. `@let` — template local variables

Before this, deriving a value for use *only inside a template* meant a getter (recomputed every CD cycle) or a pipe. `@let` gives templates their own scoped local variable:

```html
@let discountedPrice = price() * (1 - discount());

<p>{{ discountedPrice }}</p>
<p *ngIf="discountedPrice > 100">Free shipping</p>
```

Rules worth knowing: it's block-scoped (not visible outside the template block it's declared in), it's **read-only** — no reassigning it — and it recalculates on every change detection pass, same as an interpolation. It doesn't replace `computed()` for anything reused across the component class, only for a value that exists purely for the template's own convenience.

---

<a name="zoneless"></a>
# 5. ⭐ `provideZonelessChangeDetection()` — zoneless in production

[Part 10](10-change-detection-and-zonejs.md) introduced *why* zoneless is possible once change detection is signal-driven. This is the production API that turns it on:

```ts
bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection()],
});
```

With this, Zone.js is removed from the bundle entirely — no monkey-patched `setTimeout`/`addEventListener`/promises, no "something happened, check everything" guessing. Change detection instead runs precisely when a signal write, an event binding, or an explicit `markForCheck()`/async-pipe update says something changed.

**What this demands of your code:** anything that mutates state *outside* Angular's knowledge — a third-party library's callback, a raw DOM event listener attached manually — won't trigger a view update on its own anymore, because there's no Zone.js patch making that automatic. You need the state involved to be a signal (whose write itself notifies the view) or to call the update mechanism explicitly.

⚠️ This started as `provideExperimentalZonelessChangeDetection()` (v18–19) and was renamed once stabilized — if you see the experimental name in an older codebase or article, it's the same feature, pre-stabilization.

**Status by version:** experimental in **v18**, developer preview in **v20.0**, **stable in v20.2**, and **the default for new projects in v21** (`ng new` no longer adds `zone.js`). Existing apps keep Zone.js until you migrate.

**What triggers change detection without Zone.js:** a signal read in a template changing, `markForCheck()` (which the `async` pipe calls), a template event listener (`(click)`), `ComponentRef.setInput()`, and attaching/detaching views. Things that **don't** anymore: a `setTimeout` or a raw `addEventListener` callback that just sets a plain field.

```ts
// zoneless: this won't update the view…
setTimeout(() => this.message = 'Done', 1000);
// …this will
message = signal('');
setTimeout(() => this.message.set('Done'), 1000);
```

---

<a name="event-replay"></a>
# 6. Hydration event replay

[Part 21](21-ssr-and-hydration.md) covered hydration — reusing server-rendered DOM instead of re-rendering it client-side. The gap it left: a user can click a button in the window between "page painted" and "hydration finished attaching listeners," and that click used to be silently lost.

**Event replay** (enabled via `provideClientHydration(withEventReplay())`) fixes this: it captures DOM events that happen during that window and **replays them** once the real event listeners are attached, so a fast click on a slow-to-hydrate page still does something instead of appearing broken.

```ts
provideClientHydration(withEventReplay())
```

---

<a name="esbuild-vite"></a>
# 7. The esbuild/Vite build system

The Angular CLI's newer **application builder** replaced the old webpack-based builder. Two different tools, two different jobs:

**esbuild** — does the actual bundling/transforming for `ng build`. It's written in Go, and its whole design point is doing far less work per file than webpack's plugin-heavy pipeline, which is where the large build-speed jump comes from.

**Vite** — powers `ng serve`'s dev server. It serves modules over native ES modules to the browser instead of bundling everything up front, so a dev-server rebuild after a file change only has to process that file, not re-bundle the whole app.

⚠️ Interview framing: esbuild replaced webpack for **building**; Vite replaced webpack-dev-server for **serving in dev**. They're not the same tool doing two jobs — mixing them up is the easy way to lose points on this question.

---

<a name="vitest"></a>
# 8. Vitest — the new test runner story

Karma (the CLI's long-time default unit test runner) runs tests in a real browser via a browser launcher, which is slow to start and heavier to run in CI. The CLI added **Vitest** as a unit-test builder — it runs in Node with a simulated DOM (jsdom/happy-dom), or optionally in a real browser via Playwright, which is the source of the speed difference.

**Status:** experimental in v20, and **the default test runner for new projects since v21**. Karma is no longer actively developed upstream; existing projects can keep it or migrate with a schematic. (Many teams also use **Jest** via community builders — see [Part 20](20-testing.md).)

**What doesn't change:** `TestBed`, `ComponentFixture`, `HttpTestingController` — everything from [Part 20](20-testing.md) — work the same regardless of which runner executes them. This is a **runner** swap, not a rewrite of how Angular tests are written.

---

<a name="self-closing"></a>
# 9. Self-closing tags

A small template-syntax relaxation: a component with no content projected into it can be self-closed instead of needing an explicit closing tag.

```html
<!-- before -->
<app-user-card [user]="currentUser"></app-user-card>

<!-- now, also legal -->
<app-user-card [user]="currentUser" />
```

No behavioural difference — purely a compiler-level syntax allowance, useful mainly for readability in JSX-adjacent tooling/formatting.

---

<a name="signal-forms"></a>
# 10. Signal Forms — experimental, don't over-invest

A signals-based alternative to Reactive/Template-driven forms ([Part 15](15-forms.md)) — **shipped as experimental in Angular 21**, in `@angular/forms/signals`. The idea: your form *is* a signal of your data model, and validation is declared as a schema.

```ts
import { form, required, email } from '@angular/forms/signals';

login = signal({ email: '', password: '' });        // the model — a plain signal
loginForm = form(this.login, (f) => {               // the form wraps the model
  required(f.email); email(f.email);
  required(f.password);
});
// template binds fields with a directive, e.g. <input [field]="loginForm.email" />
// state is signals: loginForm.email().valid(), loginForm().invalid() ...
```

What problem it targets: no separate `FormControl` tree to keep in sync with your model, no `valueChanges` Observables — form state works with `computed()` like the rest of a signals-based component.

**Still experimental** — the API (including the binding directive's name) may change between versions. Know that it exists and what it's for; Reactive Forms remain the production default. If a JD mentions it, ask which Angular version they're on.

---

<a name="interview"></a>
# 11. Interview Q&A

### Q: What problem does `resource()` solve that `effect()` + `HttpClient` didn't already handle?
`effect()` can call `HttpClient` when a signal changes, but you'd hand-write the loading/error state and the cancellation of a stale in-flight request yourself. `resource()` gives you all of that as signals out of the box — `value()`, `status()`, `error()`, `isLoading()` — and cancels the previous load automatically when its `request` signal changes again.

### Q: `resource()` vs `rxResource()` vs `httpResource()` — when would you pick each?
Same idea, different loader shape. `resource()`'s loader returns a Promise; `rxResource()`'s `stream` returns an Observable — use it to reuse an existing service method. `httpResource()` takes a URL (or request object) function and goes through `HttpClient`, so interceptors still apply — the most common choice for plain GETs in an Angular app.

### Q: How does `resource()` know when to re-run its loader?
The same dependency-tracking signals already use: its `params` function (called `request` before Angular 20) is read like a `computed()`, so any signal called inside it registers as a dependency. When one of those signals changes, the in-flight load is aborted and the loader reruns automatically. If `params` returns `undefined`, the resource stays idle.

### Q: Is zoneless the default now?
For **new** projects, yes — since Angular 21, `ng new` creates a zoneless app. It became stable in 20.2. Existing apps keep Zone.js until migrated. Without Zone.js, updates come from signals, template events, `markForCheck`/`async` pipe — not from any finished `setTimeout` or promise.

### Q: What does `provideZonelessChangeDetection()` actually remove, and what does that cost you?
It removes Zone.js — no more monkey-patched async APIs triggering an automatic "check everything" pass. The cost: state changes that happen outside Angular's knowledge (a raw addEventListener callback, a third-party library's internal state) no longer trigger a view update automatically. That state needs to be a signal, or you call the update path explicitly.

### Q: What is hydration event replay solving?
The gap between a server-rendered page becoming visible and Angular finishing hydration and attaching real event listeners. A user click that lands in that window used to be silently dropped. `withEventReplay()` captures it and replays it once listeners are attached.

### Q: esbuild vs Vite in the new Angular build system — what does each actually do?
esbuild does the bundling for `ng build` — that's the build-speed win. Vite powers the `ng serve` dev server, serving native ES modules so a rebuild after a file change only reprocesses that file instead of re-bundling the app. They're solving two different problems, not the same one.

### Q: Does switching to Vitest change how Angular tests are written?
No — `TestBed`, `ComponentFixture`, `HttpTestingController` all stay the same. Vitest is a different runner (runs in Node/lightweight environment) replacing Karma (which launches a real browser), not a different testing API.

### Q: What is `@let`, and how is it different from a `computed()`?
A template-scoped local variable — `@let x = expr;` — visible only within that template block, read-only, recalculated every change-detection pass like an interpolation. `computed()` is a class-level signal, memoised and reusable anywhere in the component, including outside the template. Use `@let` for a value that only exists to make one template more readable.

---

<a name="summary"></a>
# 12. The 60-second summary

> *"Signals solved synchronous state, but most screens start from an HTTP call — `resource()` (and its `rxResource()`/`httpResource()` variants) closes that gap: give it a signal-based request and a loader, and it reruns automatically when the request changes, cancelling the stale in-flight call, exposing `value()`/`status()`/`error()`/`isLoading()` as signals instead of you wiring that by hand. `afterRenderEffect()` is the render-phase-safe version of `effect()`, for side effects that touch the DOM. `@let` gives templates a scoped, read-only local variable so you're not reaching for a getter or a pipe just to name a value once. `provideZonelessChangeDetection()` is the production API that removes Zone.js now that signals can drive change detection precisely — the cost is that state changed outside Angular's knowledge no longer auto-updates the view. `withEventReplay()` fixes clicks getting silently dropped in the gap between server-render and hydration finishing. And under the hood, esbuild replaced webpack for building, Vite powers the dev server, and Vitest is a newer, faster alternative to Karma for running the exact same TestBed-based tests — tooling changes, not API changes."*

---

## Connects to

- **[Part 11 — Signals](11-signals.md):** `resource()` is built on the same dependency-tracking as `computed()`.
- **[Part 10 — Change Detection](10-change-detection-and-zonejs.md):** the conceptual case for zoneless; this part is the shipped API.
- **[Part 12 — RxJS](12-rxjs.md):** where debouncing, polling, and stream combination still live — `resource()` doesn't replace this.
- **[Part 21 — SSR & Hydration](21-ssr-and-hydration.md):** event replay is a `provideClientHydration()` feature.
- **[Part 20 — Testing](20-testing.md):** Vitest is a runner swap under the same `TestBed` APIs taught there.
- **[Part 15 — Forms](15-forms.md):** what Signal Forms would eventually sit alongside, once stable.

*— End of Part 27 —*
