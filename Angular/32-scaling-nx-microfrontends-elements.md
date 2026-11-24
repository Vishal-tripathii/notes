# Angular Study Notes — Part 32

## Scaling Up — Libraries, Nx Monorepos, Micro-Frontends & Angular Elements

> **Roadmap:** [Part 32](00-ROADMAP.md) · **Priority:** ⭐⭐⭐⭐☆ for senior roles
>
> **Continues:** [Part 23 — Architecture & patterns](23-architecture-and-patterns.md) (folder structure, smart/dumb components) · [Part 14 — Routing](14-routing.md) (lazy loading) · [Part 09 — Standalone](09-ngmodules-vs-standalone.md).
>
> **The questions this answers:** "How would you structure a codebase for 5 teams?", "What's a monorepo and why use Nx?", "Have you worked with micro-frontends — when are they worth it?", "How do you use an Angular component inside a non-Angular page?"

---

## Table of Contents

1. [The growing-pains ladder](#ladder)
2. [Angular libraries](#libraries)
3. [⭐ Monorepos and Nx](#nx)
4. [⭐ Micro-frontends — what, how, and when not to](#mfe)
5. [Angular Elements — Angular components anywhere](#elements)
6. [Interview Q&A](#interview)
7. [The 60-second summary](#summary)

---

<a name="ladder"></a>
# 1. The growing-pains ladder

Move up only when the step below genuinely hurts:

```
1. one app, folders by feature + lazy routes          ← most apps should stay here (Part 23)
2. one app + internal libraries (shared UI, data-access, utils)
3. a MONOREPO: several apps + shared libraries, one repo, enforced boundaries (Nx)
4. MICRO-FRONTENDS: separately built and DEPLOYED pieces composed at runtime
```

> 🧠 **Remember:** **monorepo = share code, deploy together (or separately). Micro-frontends = deploy separately, compose at runtime.** Most "we need micro-frontends" problems are solved by step 2 or 3.

---

<a name="libraries"></a>
# 2. Angular libraries

```bash
ng generate library ui-kit            # projects/ui-kit — built with ng-packagr
```

- A library has a **public API** file (`public-api.ts`) — only what's exported there can be imported. That boundary is the point: apps use the library's API, not its internals.
- **Secondary entry points** (`@org/ui-kit/button`, `@org/ui-kit/table`) let consumers import only what they use and keep tree-shaking effective.
- Published to npm (or a private registry) when used across repos; consumed directly from source inside a monorepo.
- Version libraries with **semver** and keep Angular as a **peer dependency**, so apps don't end up with two copies of Angular ([nodejs Part 4.5 §2](../nodejs/04.5-npm-packages-and-configuration.md)).

---

<a name="nx"></a>
# 3. ⭐ Monorepos and Nx

A **monorepo** keeps several apps and their shared libraries in **one repository**: one place to change shared code, atomic changes across app + library in one PR, one version of each dependency.

The problem: in a big monorepo, "build and test everything on every PR" gets slow, and anything can import anything. **Nx** solves that:

| Nx feature | What it does |
|---|---|
| **project graph** | knows which app depends on which library (`nx graph` draws it) |
| **affected commands** | `nx affected -t test build` — only build/test projects touched by this PR |
| **computation cache** (local + remote) | never rebuild/retest the same code twice — CI reuses results from other machines |
| **module boundary rules** | tag libraries (`type:ui`, `type:data-access`, `scope:hr`) and lint-forbid wrong imports — e.g. a UI library can't import a data-access library, the HR app can't import the Payroll feature |
| **generators** | scaffold apps/libs consistently |

A typical layout:

```
apps/
  hr-portal/            payroll/
libs/
  hr/feature-employees/      ← smart components, routes        (type:feature)
  hr/data-access/            ← services, state, API calls       (type:data-access)
  shared/ui/                 ← dumb, reusable components        (type:ui)
  shared/util/               ← pure functions, pipes            (type:util)
```

Rule of thumb: **feature → data-access → ui/util**, never upwards. That keeps dependencies acyclic and makes "affected" builds small.

> **Analogy 🏢 — one office building, many teams.** Shared kitchen and lifts (libraries), each team its own floor (apps), and badge rules (boundary lint) so people don't wander into other teams' rooms.

Downsides: needs tooling discipline (Nx/Turborepo), CI setup, and access control is coarser than with separate repos.

---

<a name="mfe"></a>
# 4. ⭐ Micro-frontends — what, how, and when not to

**Micro-frontends** split one product's UI into pieces owned by **different teams** that are **built and deployed independently**, then **composed at runtime** in the browser.

```
SHELL (host app: layout, nav, auth)
  ├── /hr       → loads "hr" remote       (deployed by team HR, any time)
  ├── /payroll  → loads "payroll" remote  (deployed by team Payroll)
  └── /reports  → loads "reports" remote
```

**How in Angular:**
- **Module Federation** (webpack) — via `@angular-architects/module-federation`. Each remote exposes routes/components; the shell loads `remoteEntry.js` at runtime and **shares** libraries like `@angular/core` and `rxjs` so they load once.
- **Native Federation** — `@angular-architects/native-federation`, the same idea built on browser-native ES modules and import maps; works with Angular's **esbuild** builder (the current default), which webpack-based Module Federation doesn't.
- Loading a remote route:
  ```ts
  { path: 'hr', loadChildren: () => loadRemoteModule('hr', './routes').then(m => m.HR_ROUTES) }
  ```
- Alternatives: **iframes** (strong isolation, poor UX/integration), **Web Components** via Angular Elements (§5) — useful when remotes use different frameworks.

**Why teams choose it:** each team deploys on its own schedule, without coordinating a big release; a failing area can be rolled back alone; teams can upgrade at different paces (within limits).

**What it costs — say this in the interview:**
- **Shared dependency versions:** Angular must usually be the **same major version** across shell and remotes (shared as a singleton) — upgrades still need coordination.
- **Runtime failures:** a remote that's down or incompatible breaks at runtime, not at build time → need fallbacks and contract tests.
- **Duplicated code and bigger downloads** if sharing is misconfigured.
- **Cross-cutting concerns:** auth, design system, routing, global state and styling need agreed contracts; CSS can leak between pieces.
- **More infrastructure:** many pipelines, versioned deployments, a discovery mechanism (a manifest of remote URLs per environment).

> 🧠 **Remember:** micro-frontends solve **organisational** problems (many teams, independent deploys), not **technical** ones. One team? Use a monorepo with lazy routes.

---

<a name="elements"></a>
# 5. Angular Elements — Angular components anywhere

`@angular/elements` turns an Angular component into a standard **Custom Element** (Web Component) that works in any page — plain HTML, a CMS, a React or Vue app.

```ts
// main.ts of a small "widgets" build
import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';

(async () => {
  const app = await createApplication({ providers: [provideZonelessChangeDetection(), provideHttpClient()] });
  const RatingElement = createCustomElement(RatingComponent, { injector: app.injector });
  customElements.define('acme-rating', RatingElement);
})();
```

```html
<!-- any page, any framework -->
<script src="https://cdn.acme.com/widgets/main.js" type="module"></script>
<acme-rating value="4" (change)="..."></acme-rating>
```

- Inputs become **attributes/properties** (`value="4"`, or `el.value = 4`); outputs become **DOM `CustomEvent`s** (`el.addEventListener('change', e => e.detail)`).
- Good for: embedding a widget in a legacy or non-Angular site, a gradual migration from AngularJS/jQuery, micro-frontends across frameworks.
- Cost: each bundle ships the Angular runtime — keep the widget set small, prefer zoneless, and don't load several Angular Elements bundles on one page.

---

<a name="interview"></a>
# 6. Interview Q&A

### Q: How would you structure a large Angular codebase for several teams?
Feature-based folders with lazy routes inside an app, then extract libraries — feature, data-access, UI and util — with public APIs. With several apps or many teams, a monorepo with Nx: a project graph, affected-only builds and tests, remote caching, and lint rules enforcing boundaries like "UI libraries can't import data-access" and "one domain can't import another's internals."

### Q: Monorepo vs micro-frontends?
A monorepo is about **sharing code** in one repository with enforced boundaries; apps can still deploy separately, but the code builds together and breaking changes show up at build time. Micro-frontends are about **deploying UI pieces independently** and composing them at runtime. Micro-frontends solve organisational problems — many autonomous teams — at the cost of runtime integration, version coordination and more infrastructure.

### Q: How do micro-frontends work in Angular?
A shell app loads remote apps at runtime with Module Federation (webpack) or Native Federation (esbuild, ES modules and import maps), typically lazy-loading a remote's routes. Core libraries like `@angular/core` and RxJS are shared as singletons so they load once, which means shell and remotes need compatible Angular versions.

### Q: When would you not use micro-frontends?
With one or two teams, or when releases don't need to be independent. The integration cost, version coordination and runtime failure modes outweigh the benefit; a monorepo with lazy-loaded features gives most of the structure without it.

### Q: What are Angular Elements for?
Packaging Angular components as standard Custom Elements, so they can be used in any page — a CMS, a legacy app, or another framework. Inputs become attributes or properties and outputs become DOM events. The trade-off is that each bundle carries the Angular runtime.

---

<a name="summary"></a>
# 7. The 60-second summary

> *"Scale up only as far as it hurts: one app with feature folders and lazy routes, then internal libraries with public APIs, then a monorepo, and only then micro-frontends. In a monorepo, Nx gives a project graph, affected-only builds and tests, remote caching, and tag-based lint rules so features depend on data-access and UI libraries but never the other way round. Micro-frontends let separate teams deploy pieces independently, composed at runtime with Module Federation or the esbuild-friendly Native Federation, sharing Angular as a singleton — which means versions still need coordinating, failures move to runtime, and you need more infrastructure; they solve organisational problems, not technical ones. And Angular Elements wraps components as Custom Elements so they work in any page or framework, at the cost of shipping the Angular runtime with them."*

---

## Connects to

- **[Part 23 — Architecture & patterns](23-architecture-and-patterns.md):** folder structure and smart/dumb components inside each library.
- **[Part 14 — Routing](14-routing.md):** lazy loading — the same mechanism remotes use.
- **[Part 31 — Configuration](31-configuration-and-app-startup.md):** per-environment manifests of remote URLs.
- **[javascript Part 35 — Build tooling](../javascript/35-build-tooling.md):** bundles, shared chunks, import maps.

*— End of Part 32 —*
