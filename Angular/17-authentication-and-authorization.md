# Angular Study Notes — Part 17

## Authentication & Authorization

> **Format:** the pieces live in Parts 08, 13 and 14 — this is where they're assembled into one flow.
>
> **Roadmap:** [Part 17](00-ROADMAP.md) · **Priority:** ⭐⭐⭐⭐☆
>
> **Continues:** [Part 13 — HttpClient](13-httpclient-and-interceptors.md) · [Part 14 — Routing](14-routing.md).

---

## Table of Contents

1. [The end-to-end flow](#flow) ⭐
2. [What a JWT is](#jwt)
3. [Where to store the token](#storage) ⭐
4. [The AuthService](#service)
5. [The interceptor](#interceptor)
6. [The guards](#guards)
7. [Token refresh](#refresh) ⭐
8. [Role-based access](#roles)
9. [Hiding UI is not security](#ui) ⭐
10. [Interview Q&A](#interview)
11. [The 60-second summary](#summary)

---

<a name="flow"></a>
# 1. ⭐ The end-to-end flow

Draw this in an interview and most of the follow-up questions answer themselves:

```
1. User submits credentials
        ↓
2. POST /login  →  server returns { accessToken, refreshToken, user }
        ↓
3. AuthService stores the token + sets the current user
        ↓
4. Router navigates to the returnUrl
        ↓
5. Every subsequent request: the INTERCEPTOR attaches
   Authorization: Bearer <token>
        ↓
6. Every protected route: the GUARD checks the current user
        ↓
7. Token expires → 401 → interceptor refreshes → retries the request
        ↓
8. Refresh fails → clear session → redirect to /login
```

---

<a name="jwt"></a>
# 2. What a JWT is

Three base64 segments separated by dots:

```
header.payload.signature

{ "alg": "HS256" } . { "sub": "42", "role": "admin", "exp": 1735689600 } . <signature>
```

Two things people get wrong:

**The payload is not encrypted** — it's base64, which anyone can decode. Never put anything secret in it.

**The client cannot validate it.** Only the server holds the signing key. You can read `exp` to pre-empt an expiry, but you can't trust the token's contents for security decisions — you can only *use* it for UI.

---

<a name="storage"></a>
# 3. ⭐ Where to store the token

The trade-off interviews probe:

| | XSS risk | CSRF risk | Notes |
|---|---|---|---|
| `localStorage` | ❌ readable by any script | ✅ safe | survives a tab close |
| `sessionStorage` | ❌ readable by any script | ✅ safe | dies with the tab |
| In-memory (a service field) | ✅ not persisted | ✅ safe | lost on refresh |
| **httpOnly cookie** | ✅ **unreadable by JS** | ❌ needs CSRF protection | the safest option |

```
localStorage       simple, universal, but ANY injected script can steal the token
httpOnly cookie    JavaScript can't touch it — but now you need CSRF protection
                   (Angular's built-in XSRF interceptor — Part 13)
```

**The honest answer:** httpOnly cookies plus CSRF tokens are the secure choice. `localStorage` is what most apps actually do, and it's acceptable *only* if you're confident about XSS — which means a strict CSP and never using `bypassSecurityTrustHtml` on user content.

A good middle ground: access token in memory, refresh token in an httpOnly cookie. A page refresh silently re-authenticates, and no long-lived token is ever exposed to JavaScript.

---

<a name="service"></a>
# 4. The AuthService

```ts
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private currentUser = signal<User | null>(this.readStoredUser());

  readonly user       = this.currentUser.asReadonly();
  readonly isLoggedIn = computed(() => this.currentUser() !== null);
  readonly isAdmin    = computed(() => this.currentUser()?.role === 'admin');

  get token(): string | null {
    return localStorage.getItem('access_token');
  }

  login(credentials: Credentials) {
    return this.http.post<LoginResponse>('/api/login', credentials).pipe(
      tap(res => {
        localStorage.setItem('access_token', res.accessToken);
        this.currentUser.set(res.user);
      }),
    );
  }

  logout() {
    localStorage.removeItem('access_token');
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }
}
```

⚠️ `isLoggedIn` must be **synchronous** — a guard has to answer immediately. That's why it's a signal (or a `BehaviorSubject` with `.value`) and not a plain Observable ([Part 12.5](12.5-subscribing-and-api-calls.md)).

---

<a name="interceptor"></a>
# 5. The interceptor

```ts
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).token;

  if (!token || req.url.includes('/login')) return next(req);

  return next(req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  }));
};
```

Skip the login endpoint — sending a stale token to it can confuse the server.

---

<a name="guards"></a>
# 6. The guards

```ts
export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) return true;

  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });
};

export const roleGuard = (role: string): CanMatchFn => () => {
  const auth = inject(AuthService);
  return auth.user()?.role === role
    ? true
    : inject(Router).createUrlTree(['/forbidden']);
};
```

```ts
{ path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
{
  path: 'admin',
  loadChildren: () => import('./admin/admin.routes').then(m => m.ADMIN_ROUTES),
  canMatch: [roleGuard('admin')],       // ← canMatch: the chunk is never downloaded
},
```

The `canMatch` choice matters ([Part 14](14-routing.md)): a non-admin never downloads the admin bundle.

---

<a name="refresh"></a>
# 7. ⭐ Token refresh

The hard part, and the reason this topic gets asked.

**The problem:** the token expires. Five requests fire at once, all get 401, and a naive implementation sends five refresh calls — four of which fail because the refresh token was already rotated.

The fix is to refresh **once** and queue the rest:

```ts
let isRefreshing = false;
const refreshed$ = new BehaviorSubject<string | null>(null);

export const refreshInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401) return throwError(() => err);

      if (isRefreshing) {
        // a refresh is already running — wait for it, then retry with the new token
        return refreshed$.pipe(
          filter((token): token is string => token !== null),
          take(1),
          switchMap(token => next(withToken(req, token))),
        );
      }

      isRefreshing = true;
      refreshed$.next(null);

      return auth.refresh().pipe(
        switchMap(token => {
          isRefreshing = false;
          refreshed$.next(token);              // release the queued requests
          return next(withToken(req, token));
        }),
        catchError(refreshErr => {
          isRefreshing = false;
          auth.logout();                        // refresh failed — session is over
          return throwError(() => refreshErr);
        }),
      );
    }),
  );
};
```

```
5 requests → 5× 401
        ↓
first one starts the refresh, sets isRefreshing = true
other four WAIT on refreshed$
        ↓
refresh succeeds → refreshed$.next(token) → all four retry with the new token
```

---

<a name="roles"></a>
# 8. Role-based access

Three layers, and you need all three:

```
ROUTE     canMatch / canActivate guard   →  can't navigate there
UI        @if (auth.isAdmin()) { … }     →  can't see the button
API       the server checks the token    →  can't do it, ever  ⭐
```

```html
@if (auth.isAdmin()) {
  <button (click)="deleteAll()">Delete all</button>
}
```

---

<a name="ui"></a>
# 9. ⭐ Hiding UI is not security

Say this out loud in an interview — it's what separates a frontend answer from an engineering one.

```
Everything in the browser is under the user's control.
```

They can open devtools, edit the token payload, call your API directly with curl, or simply un-hide the button. Guards and `@if` are **user experience** — they stop honest users wandering into pages that will fail.

**Authorization is enforced on the server, on every request, without exception.** The client's job is to avoid showing people doors they can't open.

---

<a name="interview"></a>
# 10. Interview Q&A

### Q: Walk me through your auth flow.

The user posts credentials, the server returns an access token and user object. The service stores the token and sets the current user as a signal. An interceptor attaches the bearer token to every subsequent request. Guards check the current user before activating protected routes, redirecting to login with a returnUrl. On a 401, a refresh interceptor obtains a new token and retries the request; if the refresh fails, the session is cleared and the user goes back to login.

### Q: Where do you store the token and why?

The secure answer is an httpOnly cookie, since JavaScript can't read it, which removes the XSS risk — but then you need CSRF protection, which Angular provides by default. `localStorage` is simpler and what most apps use, but any injected script can read it, so it's only acceptable with a strict CSP. A good middle ground is the access token in memory and the refresh token in an httpOnly cookie.

### Q: How do you handle token refresh without a request storm?

With a flag and a queue. The first 401 sets a refreshing flag and starts the refresh; concurrent 401s see the flag and wait on a `BehaviorSubject` instead of triggering their own. When the refresh resolves, the subject emits the new token and every queued request retries with it. If the refresh fails, the session is cleared.

### Q: `canActivate` or `canMatch` for a role-gated area?

`canMatch`, if the area is lazy loaded. `canActivate` runs after the route matched, meaning the chunk was already downloaded before the user was refused. `canMatch` runs during matching, so the bundle is never fetched.

### Q: Is hiding a button with `*ngIf` secure?

No. Everything in the browser is under the user's control — they can edit the DOM, decode and alter a token payload, or call the API directly. Route guards and conditional UI are user experience. Authorization must be enforced on the server for every request.

### Q: Can the client validate a JWT?

Not for security. The payload is base64, not encrypted, so it can be read — and modified. Only the server holds the signing key. The client can read `exp` to refresh proactively, but it can't trust the contents.

---

<a name="summary"></a>
# 11. The 60-second summary

> *"The flow is: post credentials, store the returned token and set the current user, then an interceptor attaches a bearer token to every request and guards check the current user before activating protected routes. `isLoggedIn` has to be synchronous, because a guard must answer immediately — so it's a signal or a `BehaviorSubject`, not a bare Observable. For storage, httpOnly cookies are the secure option since JavaScript can't read them, though they need CSRF protection; `localStorage` is common but readable by any injected script. Refresh is the hard part: several concurrent requests can all get a 401 at once, so I refresh once behind a flag and queue the rest on a subject, releasing them with the new token, and log out if the refresh fails. Role-based access has three layers — a `canMatch` guard so a lazy admin bundle is never downloaded, conditional UI so users don't see doors they can't open, and the server, which is the only layer that actually enforces anything. Hiding a button is UX, not security."*

---

## Connects to

- **[Part 13 — HttpClient](13-httpclient-and-interceptors.md):** interceptors and the XSRF default.
- **[Part 14 — Routing](14-routing.md):** `canActivate` vs `canMatch`, `returnUrl`.
- **[Part 12.5 — Subscribing](12.5-subscribing-and-api-calls.md):** why `BehaviorSubject` / signals give a synchronous read.
- **[Part 22 — Internals](22-angular-internals.md):** sanitization and the XSS surface.

*— End of Part 17 —*
