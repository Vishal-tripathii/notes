# Angular Study Notes — Part 01

## Angular Architecture & Bootstrap (Framework vs Library, SPA, CLI, main.ts, app.config.ts, angular.json)

> **Format:** **Q&A only.** This part is orientation rather than mechanics — there's little here to *learn* beyond being able to answer it cleanly. Each answer is written the way it should be spoken in an interview.
>
> **Roadmap:** [Part 01 of the Angular roadmap](00-ROADMAP.md).
>
> **Continues:** [Part 02 — Components](02-components.md) · [Part 08 — DI](08-dependency-injection-and-services.md) · [Part 09 — NgModules vs Standalone](09-ngmodules-vs-standalone.md).

---

## Table of Contents

1. [Is Angular a framework or a library?](#framework)
2. [What is an SPA, and what does it cost?](#spa)
3. [How does Angular bootstrap an application?](#bootstrap) ⭐
4. [What is `bootstrapApplication()`?](#bootstrapapplication)
5. [How does the modern entry point differ from the old one?](#modern-vs-legacy)
6. [What does the CLI generate, and which files matter?](#cli)
7. [What is AOT vs JIT?](#aot)
8. [What is `angular.json` for?](#angularjson)
9. [How do you handle different API URLs per environment?](#environments)

---

<a name="framework"></a>
### Q: "Is Angular a framework or a library, and why does it matter?"

> *"A framework. React is a library — it renders UI and stops there, so you assemble routing, state, HTTP and forms yourself, which means every React codebase makes different choices. Angular ships all of that from one vendor, versioned together, with a CLI that runs codemods against your source when you upgrade. You trade flexibility for consistency: any Angular app looks like any other Angular app, so a new developer is productive in days. The cost is a much higher concept load up front — you meet DI, decorators and change detection before you've built anything — and a higher bundle floor. That's why it's common in large, long-lived enterprise apps and heavy-handed for a landing page."*

**The comparison in one block:**

```
REACT                              ANGULAR
react + react-dom                  @angular/core
+ react-router      (you pick)     @angular/router
+ redux/zustand     (you pick)     services + DI (built in)
+ axios/fetch       (you pick)     @angular/common/http
+ formik/RHF        (you pick)     @angular/forms
= your architecture                = the same architecture as every other Angular app
```

---

<a name="spa"></a>
### Q: "What is a single-page application, and what does it cost?"

> *"The server sends one HTML shell and a JavaScript bundle, and from then on the JavaScript owns the page. Navigation swaps components in and out while the History API rewrites the URL — no reload, so transitions are near-instant and in-memory state survives. The cost is front-loaded: the first paint is slower because the browser has to download and execute the bundle before anything appears, and a crawler that doesn't run JavaScript sees an empty page. Those two problems are exactly what server-side rendering solves."*

```
MULTI-PAGE APP                      SINGLE-PAGE APP
click → server → full HTML          initial load → shell + JS bundle
click → server → full HTML          click → router swaps component (no server)
each click: blank flash,            data fetched as JSON in the background
state lost, ~500ms+                 ~instant, state preserved
```

---

<a name="bootstrap"></a>
### Q: ⭐ "How does Angular bootstrap an application?"

> *"The browser loads `index.html`, which contains an empty `<app-root>` element and a script tag for the compiled bundle. That bundle's entry point is `main.ts`, which calls `bootstrapApplication` with the root component and an application config. Angular creates the root environment injector from the providers in that config, then finds the element matching the root component's selector, instantiates the component — dependency injection supplies its constructor arguments — and executes its compiled template to create real DOM. Children are created recursively down the tree, the router renders the component matching the current URL into the router outlet, and change detection runs."*

```
1. Browser requests the URL
        ↓
2. Server returns index.html
   <app-root></app-root>          ← an empty, unknown element
   <script src="main.js">         ← injected by the build
        ↓
3. Browser downloads + executes main.js (already compiled)
        ↓
4. main.ts → bootstrapApplication(AppComponent, appConfig)
        ↓
5. Root ENVIRONMENT INJECTOR created from appConfig.providers
        ↓
6. Angular finds <app-root> by matching AppComponent's SELECTOR
        ↓
7. AppComponent instantiated — DI fills the constructor
        ↓
8. Compiled template executes → real DOM inside <app-root>
        ↓
9. Children created recursively
        ↓
10. Router renders the URL's component into <router-outlet>
        ↓
11. Change detection runs — the app is live
```

**Three things people get wrong:**

- **The template is not compiled in the browser.** AOT turns templates into JavaScript render instructions at *build* time.
- **`<app-root>` is matched by selector, not magic.** Rename the class without the selector and you get a blank page.
- **The injector is created before the component** (step 5 before step 7) — which is precisely why a service can be injected into the root component's constructor.

---

<a name="bootstrapapplication"></a>
### Q: "What is `bootstrapApplication()`?"

> *"It's the standalone entry point. You hand it the root component directly plus a providers array, and it boots the app with no NgModule involved. The providers array is where application-wide features get registered — `provideRouter`, `provideHttpClient`, and any global services."*

```ts
// main.ts
bootstrapApplication(AppComponent, appConfig);

// app.config.ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
  ],
};
```

---

<a name="modern-vs-legacy"></a>
### Q: "How does the modern entry point differ from the old one, and why did it change?"

> *"The old form was `platformBrowserDynamic().bootstrapModule(AppModule)`, where a root NgModule declared its components and named which one to bootstrap. NgModules were an indirection that mostly created work: a component couldn't be used until some module declared it, and using it elsewhere meant exporting it from one module and importing that module into another. That made dependency graphs hard to tree-shake and made `NgModule` errors a rite of passage. Standalone components declare their own dependencies in their own file, so the information lives where it's used and the module layer disappears."*

| | Legacy (NgModule) | Modern (Standalone) |
|---|---|---|
| Entry call | `platformBrowserDynamic().bootstrapModule(AppModule)` | `bootstrapApplication(AppComponent, appConfig)` |
| What boots | A **module**, which names the root component | The **root component** directly |
| Declaring components | `declarations: []` in a module | Components declare their own `imports` |
| Registering features | `HttpClientModule`, `RouterModule.forRoot()` | `provideHttpClient()`, `provideRouter()` |
| Learning curve | Must understand modules before your first component | Skip modules entirely |

**Both are worth knowing:** modern for writing new code, legacy for reading the codebase you get hired into. Full treatment in [Part 09](09-ngmodules-vs-standalone.md); migration in [Part 24](24-legacy-vs-modern-and-migration.md).

---

<a name="cli"></a>
### Q: "What does `ng new` generate, and which files actually matter?"

> *"An `index.html` shell containing `<app-root>`, a `main.ts` entry point, the root component, an `app.config.ts` holding application-wide providers, `app.routes.ts` for route definitions, and `angular.json` for build configuration. The two that matter day to day are `main.ts` — where execution starts — and `app.config.ts` — where the router, HttpClient and global services get registered."*

```
src/
├── index.html          the shell — contains <app-root></app-root>
├── main.ts             ⭐ entry point
└── app/
    ├── app.component.*  root component (class + template + styles)
    ├── app.config.ts    ⭐ application-wide providers
    └── app.routes.ts    route definitions
angular.json            ⭐ build/serve/test configuration
```

> ⚠️ Recent releases updated the style guide to drop the `.component` suffix (`app.ts` rather than `app.component.ts`). Roles are identical either way — check what your version actually generates.

**Commands worth knowing:**

| Command | What it does |
|---|---|
| `ng serve` | Dev server, hot reload, builds **in memory** — not what ships |
| `ng build` | Production build to `dist/` — optimised, minified, hashed filenames |
| `ng g c <name>` | Component class + template + styles + spec, consistently named |
| `ng update` | Upgrades Angular **and codemods your source** for breaking changes |

---

<a name="aot"></a>
### Q: "What's the difference between AOT and JIT?"

> *"AOT — ahead-of-time — compiles templates to JavaScript at build time, so the browser downloads executable render code and template errors surface during the build. JIT compiled templates in the browser at runtime, which meant shipping the Angular compiler inside the bundle and only discovering template mistakes when the page ran. AOT is the default now: smaller bundles, faster startup, errors caught earlier."*

Deeper treatment in [Part 22 — Angular Internals](22-angular-internals.md).

---

<a name="angularjson"></a>
### Q: "What is `angular.json` for?"

> *"It's the CLI's control file — it defines targets like build, serve and test, which builder runs each one, and what options apply. The part that matters day to day is configurations: named option sets, usually development and production. A dev build optimises for feedback speed — no minification, full source maps. A production build optimises for the user — minification, tree shaking, hashed filenames for cache busting, and budgets, which are size limits that fail the build when the bundle crosses them."*

**Why budgets are worth caring about:** they turn "the app got slowly bigger over two years" into a build failure on the PR that caused it.

---

<a name="environments"></a>
### Q: "How do you handle different API URLs per environment?"

> *"Environment files with file replacement in `angular.json`. The code imports one path everywhere, and the production configuration substitutes the prod file at build time, so nothing branches at runtime. And nothing secret goes in them — they're compiled into a bundle the user downloads."*

```
import { environment } from './environments/environment';
      ↓                                    ↓
   dev build                          prod build
environment.ts                    environment.prod.ts   ← swapped by fileReplacements
apiUrl: 'http://localhost:3000'   apiUrl: 'https://api.company.com'
```

> ⚠️ Newer CLI versions don't scaffold the environments folder — `ng generate environments` adds it.
>
> ⚠️ **Environment files are not secrets management.** Anything genuinely secret lives on the server.

---

## Common mistakes

- **Assuming `ng serve` output is what ships.** It's an unoptimised in-memory dev build — check bundle size and performance against a production build.
- **Putting API keys in `environment.prod.ts`.** They ship to the browser.
- **Renaming a component class without its selector**, then wondering why the page is blank.
- **Confusing the two `imports`.** `imports` in an `@NgModule` and `imports` in a standalone `@Component` look identical and mean different things — [Part 09](09-ngmodules-vs-standalone.md).

---

## Connects to

- **[Part 02 — Components](02-components.md):** the tree that bootstrap creates, one node at a time.
- **[Part 08 — DI](08-dependency-injection-and-services.md):** the environment injector built in step 5, in full.
- **[Part 09 — NgModules vs Standalone](09-ngmodules-vs-standalone.md):** the two entry points, properly.
- **[Part 21 — SSR & Hydration](21-ssr-and-hydration.md):** the fix for the SPA's slow first paint and empty-page-for-crawlers problem.
- **[Part 22 — Internals](22-angular-internals.md):** AOT, Ivy, and what a template actually compiles into.

*— End of Part 01 —*
