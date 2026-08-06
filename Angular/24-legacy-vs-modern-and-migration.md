# Angular Study Notes — Part 24

## Legacy vs Modern & Migration

> **Format:** the part that exists purely so no interview question about "the old way" catches you out.
>
> **Roadmap:** [Part 24](00-ROADMAP.md) · **Priority:** ⭐⭐⭐⭐☆
>
> **Continues:** [Part 09 — Standalone](09-ngmodules-vs-standalone.md) · [Part 10 — Change Detection](10-change-detection-and-zonejs.md) · [Part 11 — Signals](11-signals.md).

---

## Table of Contents

1. [AngularJS vs Angular](#angularjs) ⭐
2. [The complete old → new table](#table) ⭐
3. [ViewEngine → Ivy](#ivy)
4. [The three eras](#eras)
5. [Migrating for real](#migrating) ⭐
6. [Deprecated vs removed vs unfashionable](#status)
7. [Reading an old codebase](#reading)
8. [Interview Q&A](#interview)
9. [The 60-second summary](#summary)

---

<a name="angularjs"></a>
# 1. ⭐ AngularJS vs Angular

Still asked, and the answer is not "version 1 versus version 2."

```
AngularJS (1.x)              Angular (2+)
JavaScript                   TypeScript
$scope, controllers          components + classes
dirty checking ($digest)     Zone.js / signals
directives for everything    components, directives, pipes
$http                        HttpClient (Observables)
modules via angular.module   NgModules → standalone
no CLI                       Angular CLI
```

**They are different frameworks, not different versions.** Angular 2 was a complete rewrite with no upgrade path — you migrated by rewriting, sometimes running both side by side. That's why "Angular" and "AngularJS" are deliberately different names.

---

<a name="table"></a>
# 2. ⭐ The complete old → new table

The single most useful page in this track. Every row is a thing you'll see in a real codebase.

| Concept | Legacy (Angular 2–16) | Modern (17+) | Part |
|---|---|---|---|
| App structure | `@NgModule` + `declarations` | standalone components | [09](09-ngmodules-vs-standalone.md) |
| Bootstrap | `platformBrowserDynamic().bootstrapModule()` | `bootstrapApplication()` | [01](01-angular-architecture-and-bootstrap.md) |
| Conditionals | `*ngIf` / `*ngFor` / `ngSwitch` | `@if` / `@for` / `@switch` | [04](04-directives.md) |
| List identity | `trackBy:` (optional) | `track` (**mandatory**) | [04](04-directives.md) |
| Injection | constructor params | `inject()` | [08](08-dependency-injection-and-services.md) |
| Inputs | `@Input()` | `input()` / `input.required()` | [06](06-component-communication.md) |
| Outputs | `@Output() = new EventEmitter()` | `output()` | [06](06-component-communication.md) |
| Two-way | `@Input x` + `@Output xChange` | `model()` | [06](06-component-communication.md) |
| Queries | `@ViewChild(…, {static})` | `viewChild()` signal query | [06](06-component-communication.md) |
| Reacting to inputs | `ngOnChanges` / setters | `computed()` on a signal input | [07](07-lifecycle-hooks.md) |
| Local state | `BehaviorSubject` | `signal()` | [11](11-signals.md) |
| Reactivity | Zone.js | signals / zoneless | [10](10-change-detection-and-zonejs.md) |
| HTTP setup | `HttpClientModule` | `provideHttpClient()` | [13](13-httpclient-and-interceptors.md) |
| Interceptors | class + `HTTP_INTERCEPTORS` | `HttpInterceptorFn` | [13](13-httpclient-and-interceptors.md) |
| Router setup | `RouterModule.forRoot()` | `provideRouter()` | [14](14-routing.md) |
| Guards | class implementing `CanActivate` | plain function `CanActivateFn` | [14](14-routing.md) |
| Lazy loading | `loadChildren` → NgModule | `loadComponent` / routes | [14](14-routing.md) |
| Cleanup | `takeUntil(destroy$)` | `takeUntilDestroyed()` | [07](07-lifecycle-hooks.md) |
| Forms typing | untyped | typed + `nonNullable` | [15](15-forms.md) |
| SSR | Angular Universal | `@angular/ssr` + hydration | [21](21-ssr-and-hydration.md) |
| Renderer | ViewEngine | Ivy | [22](22-angular-internals.md) |

---

<a name="ivy"></a>
# 3. ViewEngine → Ivy

Angular 9 replaced the rendering engine. What actually changed:

```
LOCALITY      each component compiles knowing only itself
              → faster rebuilds; libraries no longer need ngcc
TREE SHAKING  unused framework code drops out → much smaller bundles
DEBUGGING     readable output, ng.getComponent($0) in the console
```

If someone mentions `ngcc` or "Angular Compatibility Compiler", they're describing the transition period when Ivy apps had to convert ViewEngine libraries. It's gone.

---

<a name="eras"></a>
# 4. The three eras

Useful for placing any codebase you're shown:

```
2016–2019   Angular 2–8     NgModules, ViewEngine, RxJS everywhere,
                            constructor injection, template-driven or reactive forms

2020–2022   Angular 9–15    Ivy, strict mode, typed forms (14),
                            standalone preview (14), inject() (14)

2023–now    Angular 16+     signals (16), control flow + @defer (17),
                            standalone by default, zoneless, SSR rework
```

If you're asked "which version introduced signals", the answer is **16** (developer preview), stabilising afterwards. Control flow blocks and `@defer` arrived in **17**.

---

<a name="migrating"></a>
# 5. ⭐ Migrating for real

Order matters — each step is easier once the previous one is done.

```
1. Upgrade version by version      ng update, never skip majors
2. Turn on strict mode             fix types before changing architecture
3. Standalone                      ng generate @angular/core:standalone
4. inject() over constructors      optional, mechanical
5. Control flow blocks             ng generate @angular/core:control-flow
6. Signals                         gradual — new code first, then hot paths
7. Zoneless                        LAST — requires everything above
```

Angular ships schematics for the big ones:

```bash
ng update @angular/core @angular/cli          # one major at a time
ng generate @angular/core:standalone          # 3 passes: convert → cleanup → bootstrap
ng generate @angular/core:control-flow        # *ngIf → @if across the codebase
```

**Two rules from real migrations:**

**Never skip a major version.** `ng update` runs migrations for each one; skipping means running them yourself.

**Migrate incrementally, not in a big-bang branch.** Standalone and NgModules coexist, decorator and signal inputs coexist, `*ngIf` and `@if` coexist in the same template. A six-month migration branch will never merge.

---

<a name="status"></a>
# 6. Deprecated vs removed vs unfashionable

```
REMOVED          ViewEngine · ngcc · toPromise() · Angular Universal package
DEPRECATED       ::ng-deep · class-based guards
STILL SUPPORTED  NgModules · *ngIf · @Input/@Output · constructor injection
                 ← not going anywhere. Don't call these "wrong" in an interview.
```

That last line matters. Calling NgModules obsolete in front of someone maintaining a large module-based app reads as inexperience. They're supported; standalone is preferred for new code.

---

<a name="reading"></a>
# 7. Reading an old codebase

What you'll actually meet, and its modern equivalent:

```ts
constructor(private http: HttpClient) {}              // → inject(HttpClient)

@Input() set value(v: string) { this.recompute(v); }  // → computed() on input()

private destroy$ = new Subject<void>();
ngOnDestroy() { this.destroy$.next(); }               // → takeUntilDestroyed()

@Injectable()
export class AuthGuard implements CanActivate {}      // → const authGuard: CanActivateFn

@NgModule({ declarations: [...] })                    // → standalone imports

<div *ngIf="user; else loading">                      // → @if (user) { } @else { }
```

None of it is broken. It's the previous idiom.

---

<a name="interview"></a>
# 8. Interview Q&A

### Q: What's the difference between AngularJS and Angular?

They're different frameworks, not versions. AngularJS is the 1.x JavaScript framework with `$scope`, controllers and dirty checking. Angular 2 was a complete TypeScript rewrite with components, a real DI system, and Zone.js-based change detection. There was no upgrade path — migration meant rewriting, sometimes running both side by side.

### Q: What did Ivy change?

It made compilation local — each component compiles knowing only itself. That gave faster incremental builds, removed the need for `ngcc` to convert libraries, and enabled real tree-shaking, which is why bundles got substantially smaller.

### Q: How would you migrate a module-based app to standalone?

Incrementally, using the schematic — `ng generate @angular/core:standalone` runs three passes: convert components, remove now-unnecessary modules, then switch bootstrap. They coexist, so a standalone component can go in an NgModule's `imports` and `importProvidersFrom` pulls legacy providers into a standalone bootstrap. I'd upgrade versions and enable strict mode first, and never do it as a long-lived branch.

### Q: Which version introduced signals?

16, as developer preview. Control flow blocks and `@defer` came in 17, along with standalone becoming the default for new projects.

### Q: Are NgModules deprecated?

No. They're still supported and enormous amounts of production code uses them. Standalone is the recommended approach for new code, but there's no removal planned and calling them obsolete would be wrong.

### Q: What's the risk of skipping Angular versions when upgrading?

`ng update` runs the migration schematics for each major version. Skipping means those migrations never run, so you're applying the breaking changes by hand — much slower and easy to get wrong.

---

<a name="summary"></a>
# 9. The 60-second summary

> *"AngularJS and Angular are different frameworks, not versions — Angular 2 was a full TypeScript rewrite with no upgrade path. Within Angular, the big shifts are Ivy replacing ViewEngine in 9, which made compilation local and enabled real tree-shaking; then the modern era from 16 onwards with signals, and 17 with control flow blocks, `@defer` and standalone by default. The old-to-new mapping is NgModules to standalone, `platformBrowserDynamic` to `bootstrapApplication`, `*ngIf` to `@if` with `track` now mandatory, constructor injection to `inject()`, decorator inputs to `input()` and `model()`, `BehaviorSubject` to `signal()`, module imports like `HttpClientModule` to provider functions, and class guards to plain functions. Migration goes version by version with `ng update`, strict mode first, then the standalone schematic, then control flow, then signals, with zoneless last. And crucially the old APIs are supported, not deprecated — they coexist, which is what makes incremental migration possible."*

---

## Connects to

- **[Part 09 — Standalone](09-ngmodules-vs-standalone.md):** the biggest structural change.
- **[Part 10 — Change Detection](10-change-detection-and-zonejs.md):** Zone.js to zoneless.
- **[Part 11 — Signals](11-signals.md):** the new reactivity model.
- **[Part 22 — Internals](22-angular-internals.md):** Ivy in more detail.

*— End of Part 24 —*
