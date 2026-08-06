# Angular Study Notes — Part 14

## Routing

> **Roadmap:** [Part 14](00-ROADMAP.md) · **Priority:** ⭐⭐⭐⭐⭐
>
> **Continues:** [Part 09 — Standalone](09-ngmodules-vs-standalone.md) · [Part 12 — RxJS](12-rxjs.md) · [Part 17 — Auth](17-authentication-and-authorization.md).

---

## Table of Contents

1. [What the router does](#what)
2. [Defining routes](#routes)
3. [Navigating](#navigating)
4. [Route params vs query params](#params) ⭐
5. [The snapshot bug](#snapshot) ⭐
6. [Child routes and nested outlets](#children)
7. [Lazy loading](#lazy) ⭐
8. [Guards](#guards) ⭐
9. [Resolvers](#resolvers)
10. [Router events](#events)
11. [Interview Q&A](#interview)
12. [The 60-second summary](#summary)

---

<a name="what"></a>
# 1. What the router does

In a multi-page app the server decides what a URL renders. In an SPA there is no server round trip, so **the router maps a URL to a component** and swaps it in, while the History API rewrites the address bar.

```
URL: /employees/42
        │
        ▼
   Router matches a route
        │
        ▼
   EmployeeDetailComponent rendered into <router-outlet>
```

---

<a name="routes"></a>
# 2. Defining routes

```ts
// app.routes.ts
export const routes: Routes = [
  { path: '',            component: HomeComponent },
  { path: 'employees',   component: EmployeeListComponent },
  { path: 'employees/:id', component: EmployeeDetailComponent },
  { path: 'old-path',    redirectTo: 'employees', pathMatch: 'full' },
  { path: '**',          component: NotFoundComponent },     // wildcard — MUST be last
];
```

```ts
// app.config.ts
providers: [provideRouter(routes)]
```

```html
<!-- app.component.html -->
<router-outlet />
```

Two rules that cause real bugs:

**Order matters.** Routes are matched top to bottom, first match wins. A `**` wildcard anywhere but last swallows everything below it.

**`pathMatch: 'full'`** on an empty-path redirect. Without it, `''` matches as a *prefix* of every URL, and you redirect infinitely.

---

<a name="navigating"></a>
# 3. Navigating

```html
<a routerLink="/employees">All</a>
<a [routerLink]="['/employees', emp.id]">Detail</a>
<a [routerLink]="['/employees']" [queryParams]="{ page: 2 }">Page 2</a>

<a routerLink="/employees" routerLinkActive="active">   <!-- adds a class when active -->
```

From TypeScript:

```ts
private router = inject(Router);

this.router.navigate(['/employees', id]);
this.router.navigate(['/employees'], { queryParams: { page: 2 } });
this.router.navigateByUrl('/employees/42');
```

⚠️ Never build a link with string concatenation in a template — `routerLink` handles encoding and base href.

---

<a name="params"></a>
# 4. ⭐ Route params vs query params

```
/employees/42?page=2&sort=name#section3
            └┬┘ └──────┬─────┘└───┬───┘
          route      query      fragment
          param      params
```

```
ROUTE PARAM    identifies the resource. Required. Part of the path.
QUERY PARAM    modifies the view. Optional. Filters, sorting, pagination.
FRAGMENT       a position on the page.
```

Reading them:

```ts
private route = inject(ActivatedRoute);

// route param
this.route.paramMap.subscribe(p => this.id = Number(p.get('id')));

// query param
this.route.queryParamMap.subscribe(p => this.page = Number(p.get('page') ?? 1));
```

Modern shortcut — bind them straight to inputs:

```ts
provideRouter(routes, withComponentInputBinding())
```

```ts
export class EmployeeDetailComponent {
  id = input.required<string>();     // ← filled from the :id route param automatically
}
```

---

<a name="snapshot"></a>
# 5. ⭐ The snapshot bug

Both forms exist, and picking wrong causes a bug that only appears later:

```ts
// SNAPSHOT — read once, never updates
const id = this.route.snapshot.paramMap.get('id');

// OBSERVABLE — emits on every change
this.route.paramMap.subscribe(p => this.load(p.get('id')!));
```

The trap: Angular **reuses the component instance** when you navigate from `/employees/1` to `/employees/2`. Same route, same component — so `ngOnInit` does *not* run again.

```
/employees/1  →  component created, snapshot reads "1"   ✅
/employees/2  →  component REUSED, ngOnInit doesn't run
                 snapshot still says "1"                 ❌ stale page
```

The correct pattern combines the observable with `switchMap` ([Part 12](12-rxjs.md)):

```ts
employee = toSignal(
  this.route.paramMap.pipe(
    switchMap(p => this.api.getEmployee(p.get('id')!)),
  )
);
```

Snapshot is safe only when you know the component can't be reused for a different value.

---

<a name="children"></a>
# 6. Child routes and nested outlets

```ts
{
  path: 'employees',
  component: EmployeeLayoutComponent,      // has its own <router-outlet>
  children: [
    { path: '',      component: EmployeeListComponent },
    { path: ':id',   component: EmployeeDetailComponent },
    { path: ':id/edit', component: EmployeeEditComponent },
  ],
}
```

```
EmployeeLayoutComponent          ← always rendered (shared header/sidebar)
    └── <router-outlet>          ← the child swaps in here
```

That's how you get a persistent shell around a changing area.

---

<a name="lazy"></a>
# 7. ⭐ Lazy loading

By default every component is in the initial bundle. Lazy loading splits them out, so code downloads only when its route is visited.

```ts
// a single standalone component
{
  path: 'reports',
  loadComponent: () => import('./reports/reports.component')
                        .then(m => m.ReportsComponent),
}

// a whole feature's routes
{
  path: 'admin',
  loadChildren: () => import('./admin/admin.routes')
                        .then(m => m.ADMIN_ROUTES),
}
```

```
eager   →  everything in main.js         →  slow first paint
lazy    →  admin.js downloaded on /admin →  fast first paint
```

The `import()` is what creates the split point — the bundler sees it and emits a separate chunk.

Legacy form loaded an NgModule instead:

```ts
loadChildren: () => import('./admin/admin.module').then(m => m.AdminModule)
```

**Preloading** fetches lazy chunks in the background after the app boots, so the click still feels instant:

```ts
provideRouter(routes, withPreloading(PreloadAllModules))
```

---

<a name="guards"></a>
# 8. ⭐ Guards

A guard decides whether navigation may proceed. Modern guards are plain functions.

```ts
export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) return true;

  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },      // come back here after login
  });
};
```

```ts
{ path: 'admin', component: AdminComponent, canActivate: [authGuard] }
```

Return `true` to allow, `false` to block, or a `UrlTree` to redirect. Guards may also return an Observable or Promise of those.

The four kinds:

```
canActivate      may I enter this route?
canActivateChild may I enter any child of this route?
canDeactivate    may I LEAVE?  → "unsaved changes" prompts
canMatch         may this route even be CONSIDERED for matching?
```

⚠️ **`canActivate` vs `canMatch`** is a real interview question:

```
canActivate  route matches → guard runs → blocked
             the lazy chunk has ALREADY been downloaded

canMatch     guard runs → route doesn't match at all → tries the next route
             the lazy chunk is NEVER downloaded
```

Use `canMatch` for role-gated lazy features — an ordinary user shouldn't download the admin bundle just to be told no.

`canDeactivate` receives the component, so it can ask it something:

```ts
export const unsavedChangesGuard: CanDeactivateFn<EditComponent> = (component) =>
  component.form.pristine || confirm('Discard unsaved changes?');
```

---

<a name="resolvers"></a>
# 9. Resolvers

A resolver fetches data **before** the route activates, so the component never renders in an empty state.

```ts
export const employeeResolver: ResolveFn<Employee> = (route) =>
  inject(EmployeeService).getById(Number(route.paramMap.get('id')));
```

```ts
{
  path: 'employees/:id',
  component: EmployeeDetailComponent,
  resolve: { employee: employeeResolver },
}
```

```ts
employee = this.route.snapshot.data['employee'];   // already loaded
```

**Guard vs resolver:** a guard answers *may I go?* and returns a boolean or redirect. A resolver answers *what data does this route need?* and returns the data.

⚠️ The cost: navigation is **blocked** until the resolver finishes, so a slow API means the old page stays visible with no feedback. Often a loading state inside the component is the better UX.

---

<a name="events"></a>
# 10. Router events

```ts
this.router.events.pipe(
  filter(e => e instanceof NavigationEnd),
  takeUntilDestroyed(),
).subscribe(() => {
  this.analytics.pageView(this.router.url);
  window.scrollTo(0, 0);
});
```

`NavigationStart` / `NavigationEnd` also drive a global loading bar.

---

<a name="interview"></a>
# 11. Interview Q&A

### Q: Route params vs query params?

A route param is part of the path and identifies the resource — `/employees/42`. A query param modifies the view and is optional — filters, sorting, pagination. Route params are required for the route to match; query params never affect matching.

### Q: Why would a component not update when the route changes?

Because Angular reuses the component instance when only the parameter changes, so `ngOnInit` doesn't run again. If I read `snapshot.paramMap` I keep the old value. The fix is to subscribe to `paramMap` and use `switchMap` to reload, so every parameter change refetches and cancels any in-flight request.

### Q: Guard vs resolver?

A guard decides whether navigation is allowed and returns a boolean, a `UrlTree` redirect, or an Observable of those. A resolver fetches data before the route activates so the component renders with data already present. Guards control access; resolvers control readiness.

### Q: `canActivate` vs `canMatch`?

`canActivate` runs after the route has matched, which means a lazy chunk has already been downloaded before the user is refused. `canMatch` runs during matching, so a failed guard makes the router skip the route entirely and the chunk is never fetched. For role-gated lazy features, `canMatch` is the right one.

### Q: How does lazy loading work?

A route uses `loadComponent` or `loadChildren` with a dynamic `import()`. The bundler sees that import and emits a separate chunk, which is downloaded only when the route is visited. That keeps the initial bundle small, and `withPreloading` can fetch the chunks in the background afterwards so navigation still feels instant.

### Q: How do you stop a user leaving a form with unsaved changes?

A `canDeactivate` guard. It receives the component instance, so it can check whether the form is dirty and prompt for confirmation.

### Q: Why is my wildcard route breaking everything?

Routes are matched top to bottom, first match wins. A `**` route must be last, or it matches before the routes below it.

---

<a name="summary"></a>
# 12. The 60-second summary

> *"The router maps URLs to components and renders them into a `router-outlet`, with no server round trip. Routes are matched top to bottom so order matters and the wildcard goes last. Route params identify a resource and are part of the path; query params are optional view modifiers. The classic bug is reading `snapshot.paramMap` — Angular reuses the component when only the param changes, so `ngOnInit` doesn't rerun and the value goes stale; subscribing to `paramMap` with `switchMap` fixes it and cancels in-flight requests. Child routes give you a persistent shell with a nested outlet. Lazy loading uses a dynamic `import()` in `loadComponent` or `loadChildren`, which creates a separate bundle chunk. Guards control access — `canActivate`, `canActivateChild`, `canDeactivate` for unsaved-changes prompts, and `canMatch`, which runs during matching so a rejected lazy route is never even downloaded. Resolvers fetch data before activation, at the cost of blocking navigation while they run."*

---

## Connects to

- **[Part 09 — Standalone](09-ngmodules-vs-standalone.md):** `provideRouter` vs `RouterModule.forRoot`.
- **[Part 12 — RxJS](12-rxjs.md):** `switchMap` on `paramMap`.
- **[Part 17 — Auth](17-authentication-and-authorization.md):** auth and role guards in a full flow.
- **[Part 18 — Performance](18-performance.md):** lazy routes as a bundle-size lever.

*— End of Part 14 —*
