# Angular Study Notes — Part 31

## Configuration, App Startup & Deployment — Environments, Runtime Config, `provideAppInitializer`, Base Href

> **Roadmap:** [Part 31](00-ROADMAP.md) · **Priority:** ⭐⭐⭐⭐☆
>
> **Continues:** [Part 01 — Bootstrap](01-angular-architecture-and-bootstrap.md) · [Part 08 — DI](08-dependency-injection-and-services.md) (`InjectionToken`) · [nodejs Part 4.5](../nodejs/04.5-npm-packages-and-configuration.md) (configuration on the server side).
>
> **The questions this answers:** "How do you point the app at a different API per environment?", "Why do we have to rebuild for each environment?", "How do you load config before the app starts?", "Why does refreshing a deep link give a 404?"

---

## Table of Contents

1. [Build-time config: `environment.ts`](#environments)
2. [⭐ The problem: one build per environment](#problem)
3. [⭐ Runtime config — build once, deploy anywhere](#runtime)
4. [`provideAppInitializer` — run code before the app starts](#initializer)
5. [Other startup hooks](#other-hooks)
6. [Build configurations in `angular.json`](#angular-json)
7. [⭐ Deploying an Angular app](#deploy)
8. [Interview Q&A](#interview)
9. [The 60-second summary](#summary)

---

<a name="environments"></a>
# 1. Build-time config: `environment.ts`

```bash
ng generate environments        # newer CLIs don't create these by default
```

```ts
// src/environments/environment.ts            (development)
export const environment = { production: false, apiUrl: 'http://localhost:3000' };

// src/environments/environment.production.ts
export const environment = { production: true, apiUrl: 'https://api.example.com' };
```

```json
// angular.json → configurations.production
"fileReplacements": [
  { "replace": "src/environments/environment.ts", "with": "src/environments/environment.production.ts" }
]
```

`ng build --configuration production` **swaps the file at build time**, so the values are compiled into the JavaScript.

⚠️ **Everything in it is public.** It ends up in the bundle anyone can download. API URLs and public keys are fine; **secrets never** ([javascript Part 33 §7](../javascript/33-frontend-security.md)).

---

<a name="problem"></a>
# 2. ⭐ The problem: one build per environment

Build-time config means **a separate build for dev, QA, staging and production**:

```
same code → build for QA → test it → build AGAIN for production → deploy
                                       ↑ this artifact was never tested
```

That breaks a core deployment rule: **build once, promote the same artifact** through environments. It also makes "deploy this build to a new customer environment" impossible without rebuilding.

> **Analogy 📦 — a printed vs a blank address label.** Build-time config prints the address on the box at the factory — a new destination means a new box. Runtime config ships a blank label filled in at the destination.

---

<a name="runtime"></a>
# 3. ⭐ Runtime config — build once, deploy anywhere

Ship a `config.json` **next to** the app, written by each environment's deployment (Kubernetes ConfigMap, a CI step, the CDN), and load it at startup.

```json
// public/config.json  (overwritten per environment at deploy time)
{ "apiUrl": "https://api.staging.example.com", "featureFlags": { "newCheckout": true } }
```

**Option A — fetch before bootstrapping** (simple; config is ready for everything, including route guards):

```ts
// main.ts
fetch('/config.json')
  .then(res => res.json())
  .then((config: AppConfig) =>
    bootstrapApplication(AppComponent, {
      ...appConfig,
      providers: [...appConfig.providers, { provide: APP_CONFIG, useValue: config }],
    }))
  .catch(err => console.error('Could not load config', err));
```

```ts
// app-config.ts
export interface AppConfig { apiUrl: string; featureFlags: Record<string, boolean>; }
export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');

// anywhere
private config = inject(APP_CONFIG);
```

**Option B — load it inside the app with `provideAppInitializer`** (§4) into a config service.

Rules:
- Serve `config.json` with **`Cache-Control: no-cache`**, or users keep a stale copy.
- Validate it at startup (missing `apiUrl` → show an error page, not a blank screen).
- Still **no secrets** — the browser downloads it.

---

<a name="initializer"></a>
# 4. `provideAppInitializer` — run code before the app starts

Code that must finish **before the first component renders**: load config, restore the session from a refresh cookie, load the user's permissions or translations.

```ts
// app.config.ts  (Angular 19+)
export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideAppInitializer(() => {
      const config = inject(ConfigService);     // inject() works here
      return config.load();                      // return a Promise or Observable → Angular waits
    }),
    provideRouter(routes),
  ],
};
```

```ts
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private http = inject(HttpClient);
  private _config = signal<AppConfig | null>(null);
  readonly config = this._config.asReadonly();

  load() {
    return firstValueFrom(this.http.get<AppConfig>('/config.json')).then(c => this._config.set(c));
  }
}
```

- **Before v19** the same thing was `{ provide: APP_INITIALIZER, useFactory: (cfg: ConfigService) => () => cfg.load(), deps: [ConfigService], multi: true }` — you'll see this in older code. `APP_INITIALIZER` is deprecated in favour of `provideAppInitializer`.
- If the returned promise **rejects**, the app fails to start — catch errors and show a useful message.
- Keep it fast: the user sees nothing until it finishes. Don't load data here that a page can load later.
- ⚠️ An HTTP interceptor that injects `ConfigService` to read the API URL will run *during* `config.load()` itself — make sure it handles "config not loaded yet" (e.g. skip relative `/config.json`).

---

<a name="other-hooks"></a>
# 5. Other startup hooks

| Hook | Runs | Use for |
|---|---|---|
| `provideAppInitializer(fn)` | before the root component renders; Angular waits for it | config, session restore |
| `provideEnvironmentInitializer(fn)` (was `ENVIRONMENT_INITIALIZER`) | when an injector (root, or a lazy route's) is created | set up a feature when its lazy routes load |
| `provideBrowserGlobalErrorListeners()` | at startup | catch global errors ([Part 19](19-error-handling.md)) |
| `APP_BOOTSTRAP_LISTENER` | after the root component is bootstrapped | rare — analytics "app ready" |
| `afterNextRender()` in the root component | after the first render, browser only | non-critical setup (load chat widget) |

---

<a name="angular-json"></a>
# 6. Build configurations in `angular.json`

```jsonc
"configurations": {
  "production": {
    "budgets": [
      { "type": "initial", "maximumWarning": "500kB", "maximumError": "1MB" },
      { "type": "anyComponentStyle", "maximumWarning": "4kB" }
    ],
    "outputHashing": "all",              // hashed file names → long-term caching
    "sourceMap": false,                  // or { "scripts": true, "hidden": true } to upload to Sentry
    "fileReplacements": [ /* §1 */ ]
  },
  "staging": { /* … */ }
},
"defaultConfiguration": "production"
```

- **Budgets** fail the build when the bundle grows too big ([Part 18 §10](18-performance.md)).
- **`define`** (esbuild builder) replaces global identifiers at build time — another build-time config option.
- `ng build` defaults to production; `ng serve` defaults to development.

---

<a name="deploy"></a>
# 7. ⭐ Deploying an Angular app

A built Angular app (without SSR) is **just static files** — `index.html`, JS, CSS, assets — served by any web server or CDN (nginx, S3 + CloudFront, Firebase Hosting, Netlify, Azure Static Web Apps).

**The deep-link 404 — the most common deployment bug:**

```
user opens https://app.com/employees/42 directly (or refreshes)
→ the SERVER looks for a file /employees/42 → doesn't exist → 404
```

The browser only knows `/employees/42` is an Angular route *after* Angular loads. The server must **return `index.html` for every unknown path** (an "SPA fallback"):

```nginx
location / {
  try_files $uri $uri/ /index.html;      # real files first, otherwise the app
}
```

(Old workaround: `withHashLocation()` → URLs like `/#/employees/42`, which never reach the server — but ugly and bad for SEO.)

**`<base href>` — when the app isn't at the domain root:**

```bash
ng build --base-href /hr-portal/        # app served at https://company.com/hr-portal/
```

Wrong base href = every JS/CSS file 404s and you get a blank page. Per-locale builds ([Part 30 §8](30-accessibility-and-i18n.md)) each get their own (`/fr/`).

**Caching:**
- Hashed files (`main-3f9a1c.js`) → `Cache-Control: public, max-age=31536000, immutable`.
- `index.html` and `config.json` → `no-cache`, so users pick up new deployments.
- After a deploy, users on the old version may request deleted lazy chunks → "ChunkLoadError / Failed to fetch dynamically imported module." Keep the previous build's files for a while, and/or reload on that error. ([javascript Part 35 §7](../javascript/35-build-tooling.md).)

**Docker:** multi-stage — build with Node, serve with nginx:

```dockerfile
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx ng build

FROM nginx:alpine
COPY --from=build /app/dist/my-app/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf          # with the try_files fallback
```

With **SSR**, you deploy a Node server too (`dist/my-app/server/server.mjs`) — [Part 21](21-ssr-and-hydration.md) and [nodejs Part 6.6](../nodejs/06.6-graceful-shutdown-health-checks-and-docker.md).

---

<a name="interview"></a>
# 8. Interview Q&A

### Q: How do you configure different API URLs per environment?
The CLI way is `environment.ts` files swapped with `fileReplacements` at build time. That requires a separate build per environment, so for "build once, deploy anywhere" I load a `config.json` at runtime — either fetching it in `main.ts` before `bootstrapApplication` and providing it through an `InjectionToken`, or in `provideAppInitializer` into a config service. Either way, nothing secret goes into frontend config.

### Q: What is `provideAppInitializer` (or `APP_INITIALIZER`)?
A hook that runs a function before the app renders and waits if it returns a Promise or Observable. It's used to load runtime config, restore a session or load permissions. `provideAppInitializer` (v19+) replaced the older `APP_INITIALIZER` multi-provider. If it fails, the app doesn't start, so it needs error handling and should stay fast.

### Q: Users get a 404 when they refresh on a deep link. Why?
The server tries to find a file for that path. The Angular router only knows the route after `index.html` loads. The server needs an SPA fallback — return `index.html` for unknown paths, like nginx `try_files $uri /index.html`.

### Q: The app is a blank page after deploying under a sub-path. What's wrong?
Most likely the `<base href>`. Built with `/`, the browser requests `/main.js` instead of `/sub-path/main.js`. Build with `--base-href /sub-path/`.

### Q: How do you cache an Angular app correctly?
Hashed bundle files can be cached for a year as immutable, because a change produces a new file name. `index.html` and runtime config must be `no-cache` so new deployments are picked up. Keep old chunks around briefly to avoid chunk-load errors for users mid-session.

---

<a name="summary"></a>
# 9. The 60-second summary

> *"`environment.ts` plus `fileReplacements` bakes config in at build time, which means one build per environment — the artifact you deploy to production is never the one you tested. For build-once-deploy-anywhere, ship a `config.json` that each environment overwrites, and load it either in `main.ts` before `bootstrapApplication` — provided through an `InjectionToken` — or with `provideAppInitializer`, which replaced `APP_INITIALIZER` and makes Angular wait before rendering. Frontend config is always public, so no secrets. A non-SSR Angular app is static files: the server needs an SPA fallback to `index.html` so deep links don't 404, the right `--base-href` when served under a sub-path, long-term caching for hashed bundles and `no-cache` for `index.html` and config, and a Docker image is typically Node to build and nginx to serve."*

---

## Connects to

- **[Part 08 — DI](08-dependency-injection-and-services.md):** `InjectionToken` for config.
- **[Part 13 — HttpClient](13-httpclient-and-interceptors.md):** a base-URL interceptor reading the config.
- **[Part 17 — Auth](17-authentication-and-authorization.md):** restoring the session at startup.
- **[Part 18 — Performance](18-performance.md):** budgets.
- **[Part 32 — Scaling up](32-scaling-nx-microfrontends-elements.md):** config shared across many apps.

*— End of Part 31 —*
