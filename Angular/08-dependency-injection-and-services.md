# Angular Study Notes — Part 08

## Dependency Injection & Services

> **Roadmap:** [Part 08](00-ROADMAP.md) · **Priority:** ⭐⭐⭐⭐⭐ — the spine of Angular; everything else assumes it.
>
> **Continues:** [Part 06 — Communication](06-component-communication.md) · [Part 09 — Standalone](09-ngmodules-vs-standalone.md) · [Part 16 — State](16-state-management.md).

---

## Table of Contents

1. [The problem](#problem)
2. [The fix: ask, don't build](#fix)
3. [Services](#services)
4. [`inject()` vs constructor injection](#inject)
5. [The injector tree](#tree) ⭐
6. [Scoping — how many instances exist](#scoping) ⭐
7. [Provider types](#providers)
8. [`InjectionToken` and why you can't inject an interface](#token) ⭐
9. [Resolution modifiers](#modifiers)
10. [Interview Q&A](#interview)
11. [The 60-second summary](#summary)

---

<a name="problem"></a>
# 1. The problem

Your component needs employee data. Without DI:

```ts
export class EmployeeListComponent {
  private service = new EmployeeService(new HttpClient(...));
}
```

Three things are now broken:

```
COUPLED     the component knows how to BUILD its dependency
UNSHARED    every component creates its own instance — no shared state
UNTESTABLE  you can't swap in a fake for tests
```

---

<a name="fix"></a>
# 2. The fix: ask, don't build

```ts
export class EmployeeListComponent {
  private service = inject(EmployeeService);
}
```

The component **declares what it needs**. Angular supplies it.

```
Component:  "I need an EmployeeService"
     ↓
Injector:   finds or creates one, hands it over
```

That's dependency injection. The component no longer knows how the service is built, who else uses it, or whether it's real or a mock.

---

<a name="services"></a>
# 3. Services

A service is just a class for logic that isn't UI — data fetching, state, business rules.

```ts
@Injectable({ providedIn: 'root' })
export class EmployeeService {
  private http = inject(HttpClient);

  getAll() {
    return this.http.get<Employee[]>('/api/employees');
  }
}
```

`providedIn: 'root'` does two things: registers it in the root injector (so it's a **singleton**), and makes it **tree-shakable** — if nothing injects it, it's dropped from the bundle.

---

<a name="inject"></a>
# 4. `inject()` vs constructor injection

```ts
// modern
private service = inject(EmployeeService);

// classic — still everywhere in existing code
constructor(private service: EmployeeService) {}
```

Identical behaviour. `inject()` wins on ergonomics: it works in field initialisers, avoids constructor boilerplate in subclasses, and can be used inside standalone functions like guards and interceptors — where there's no constructor at all.

⚠️ `inject()` only works in an **injection context**: a field initialiser, a constructor, or a factory. Call it inside `ngOnInit` and it throws.

---

<a name="tree"></a>
# 5. ⭐ The injector tree

This is the part interviews probe.

Injectors form a hierarchy that mirrors your component tree:

```
        Root injector          (providedIn: 'root')
              │
        AppComponent
              │
        EmployeeListComponent   ← has its own injector
              │
        EmployeeCardComponent   ← has its own injector
```

When a component asks for a dependency, Angular **walks up**:

```
EmployeeCard asks for EmployeeService
     │
     ├─ my own injector?        no
     ├─ parent's injector?      no
     ├─ AppComponent's?         no
     ├─ root injector?          YES → return it
     └─ (if not) NullInjector   → "No provider for EmployeeService"
```

First match wins. That single rule explains everything else in this part.

---

<a name="scoping"></a>
# 6. ⭐ Scoping — how many instances exist

Where you register decides how many exist.

```ts
@Injectable({ providedIn: 'root' })     // ONE instance, whole app
```

```ts
@Component({
  providers: [EmployeeService],          // NEW instance per component instance
})
```

The second case is the useful one to understand:

```
        Root                    EmployeeService #0
          │
    ListComponent  providers:[EmployeeService]  →  #1
          │
      CardComponent   ← injects → gets #1 (walks up, finds it)
```

Each `ListComponent` gets its own service, shared with its children. Useful for per-instance state — a wizard's form state, a per-tab cache.

Other `providedIn` values: `'platform'` (shared across multiple Angular apps on one page) and `'any'` (a separate instance per lazy-loaded scope). Both are rare.

---

<a name="providers"></a>
# 7. Provider types

`providers: [EmployeeService]` is shorthand for `{ provide: EmployeeService, useClass: EmployeeService }`. The full forms:

```ts
{ provide: EmployeeService, useClass: MockEmployeeService }      // swap the implementation
{ provide: API_URL,         useValue: 'https://api.com' }        // a constant
{ provide: Logger,          useFactory: () => new Logger(env) }  // computed at runtime
{ provide: OldService,      useExisting: NewService }            // alias — same instance
```

`useClass` is how tests swap a real service for a fake without the component knowing ([Part 20](20-testing.md)).

---

<a name="token"></a>
# 8. ⭐ `InjectionToken` — and why you can't inject an interface

```ts
export interface AppConfig { apiUrl: string; }

constructor(private config: AppConfig) {}   // ❌ fails
```

**Why:** TypeScript types are erased at compile time. At runtime `AppConfig` doesn't exist, so Angular has nothing to look up — the token *is* the runtime class object.

The fix is a token: a real runtime value that carries a type.

```ts
export const APP_CONFIG = new InjectionToken<AppConfig>('app.config');

// register
{ provide: APP_CONFIG, useValue: { apiUrl: 'https://api.com' } }

// inject
private config = inject(APP_CONFIG);   // typed as AppConfig
```

Use a token for anything that isn't a class: config objects, strings, feature flags. An `abstract class` also works, since classes survive to runtime.

---

<a name="modifiers"></a>
# 9. Resolution modifiers

Four ways to change how the lookup walks:

```ts
inject(Logger, { optional: true })   // return null instead of throwing
inject(Logger, { self: true })       // only my own injector, don't walk up
inject(Logger, { skipSelf: true })   // start at my parent
inject(Logger, { host: true })       // stop at the host component
```

`optional` is the common one — for a dependency that may not be provided. `skipSelf` shows up in recursive component trees, where a component provides a service but also wants the parent's version.

*(Decorator equivalents in older code: `@Optional()`, `@Self()`, `@SkipSelf()`, `@Host()`.)*

---

<a name="interview"></a>
# 10. Interview Q&A

### Q: Explain dependency injection.

Instead of a class constructing its own dependencies, it declares what it needs and Angular supplies them. That decouples the class from how its dependencies are built, lets multiple components share one instance, and makes testing trivial because you can provide a mock instead.

### Q: How does Angular resolve a dependency?

Injectors form a hierarchy mirroring the component tree. Angular starts at the requesting component's injector and walks up — parent components, then the environment or root injector. The first provider found wins. If it reaches the null injector, you get "No provider for X".

### Q: `providedIn: 'root'` vs providing in a component?

`root` gives one singleton for the whole application, and it's tree-shakable — unused services are dropped from the bundle. Providing in a component's `providers` array creates a new instance per component instance, shared with its children. Root for shared state, component-level for per-instance state.

### Q: Why can't you inject an interface?

Because TypeScript interfaces are erased at compile time — there's nothing at runtime for Angular to use as a lookup key. I use an `InjectionToken` instead, or an abstract class, since both exist at runtime.

### Q: `inject()` vs constructor injection?

Same mechanism. `inject()` works in field initialisers, avoids constructor plumbing in subclasses, and is the only option inside functional guards and interceptors, which have no constructor. It must be called in an injection context though.

### Q: How do you get a non-singleton service?

Provide it in the component's `providers` array rather than `providedIn: 'root'`. Each instance of that component then gets its own, shared with its children.

---

<a name="summary"></a>
# 11. The 60-second summary

> *"Dependency injection means a class declares what it needs rather than constructing it, so it's decoupled, shareable and testable. Services hold non-UI logic and are usually registered with `providedIn: 'root'`, which makes them singletons and tree-shakable. Injectors form a hierarchy mirroring the component tree: a request walks up from the component's own injector to the root, and the first provider found wins — which is why providing a service in a component's `providers` array gives each instance its own copy, shared with its children. Providers can use `useClass`, `useValue`, `useFactory` or `useExisting`, which is how tests swap in mocks. And because TypeScript types are erased at runtime, you can't inject an interface — you use an `InjectionToken` or an abstract class, since those exist as real values."*

---

## Connects to

- **[Part 06 — Communication](06-component-communication.md):** the shared service that lets unrelated components talk.
- **[Part 09 — Standalone](09-ngmodules-vs-standalone.md):** `provideX()` functions and where providers are registered now.
- **[Part 13 — HttpClient](13-httpclient-and-interceptors.md):** interceptors as functions that use `inject()`.
- **[Part 16 — State](16-state-management.md):** services as the default state container.
- **[Part 20 — Testing](20-testing.md):** swapping real services for mocks via providers.

*— End of Part 08 —*
