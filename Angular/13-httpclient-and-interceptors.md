# Angular Study Notes — Part 13

## HttpClient & Interceptors

> **Roadmap:** [Part 13](00-ROADMAP.md) · **Priority:** ⭐⭐⭐⭐☆
>
> **Continues:** [Part 12 — RxJS](12-rxjs.md) · [Part 12.5 — Subscribing](12.5-subscribing-and-api-calls.md) · [Part 17 — Auth](17-authentication-and-authorization.md).

---

## Table of Contents

1. [Setup](#setup)
2. [The verbs, typed](#verbs)
3. [Params and headers](#params)
4. [Reading more than the body](#observe)
5. [The error shape](#errors) ⭐
6. [Interceptors](#interceptors) ⭐
7. [Built-in vs yours](#builtin) ⭐
8. [The chain and its order](#order) ⭐
9. [The four interceptors you'll actually write](#four)
10. [Cancellation](#cancellation)
11. [Interview Q&A](#interview)
12. [The 60-second summary](#summary)

---

<a name="setup"></a>
# 1. Setup

```ts
// app.config.ts
providers: [
  provideHttpClient(
    withInterceptors([authInterceptor, errorInterceptor]),
  ),
]
```

Legacy equivalent was `HttpClientModule` in a module's `imports` ([Part 09](09-ngmodules-vs-standalone.md)).

---

<a name="verbs"></a>
# 2. The verbs, typed

```ts
this.http.get<Employee[]>('/api/employees')
this.http.post<Employee>('/api/employees', body)
this.http.put<Employee>(`/api/employees/${id}`, body)
this.http.patch<Employee>(`/api/employees/${id}`, { role })
this.http.delete<void>(`/api/employees/${id}`)
```

⚠️ The generic is a **claim, not a validation**. Angular parses the JSON and hands it to you typed — if the server sends something else, TypeScript never finds out. Nothing is checked at runtime.

---

<a name="params"></a>
# 3. Params and headers

```ts
const params = new HttpParams()
  .set('page', page)
  .set('size', 20)
  .set('sort', 'name,asc');

this.http.get<Page<Employee>>('/api/employees', { params });
// → /api/employees?page=2&size=20&sort=name,asc
```

⚠️ `HttpParams` is **immutable** — `.set()` returns a *new* instance. This silently does nothing:

```ts
let params = new HttpParams();
params.set('page', 1);            // ❌ discarded
params = params.set('page', 1);   // ✅
```

Same for `HttpHeaders`. Conditional params need the reassignment:

```ts
let params = new HttpParams();
if (search) params = params.set('q', search);
```

---

<a name="observe"></a>
# 4. Reading more than the body

By default you get the parsed body. When you need headers or the status:

```ts
this.http.get<Employee[]>('/api/employees', { observe: 'response' })
  .subscribe(res => {
    res.status;                          // 200
    res.headers.get('X-Total-Count');    // pagination metadata
    res.body;                            // the actual data
  });
```

Other response types:

```ts
{ responseType: 'blob' }   // file downloads
{ responseType: 'text' }   // CSV, plain text
```

---

<a name="errors"></a>
# 5. ⭐ The error shape

Angular throws an `HttpErrorResponse` for anything non-2xx:

```ts
.subscribe({
  error: (err: HttpErrorResponse) => {
    err.status;         // 404, 500 — or 0
    err.error;          // the response BODY (your API's error payload)
    err.message;        // Angular's description, not the server's
  },
});
```

⚠️ **`status === 0` means the request never reached the server** — network down, CORS rejection, or DNS failure. The most useful status to special-case, because the user's fix is different.

```ts
if (err.status === 0)   return 'Check your connection';
if (err.status === 401) return 'Please log in again';
if (err.status === 404) return 'Not found';
if (err.status >= 500)  return 'Server error — try again';
```

---

<a name="interceptors"></a>
# 6. ⭐ Interceptors

**The problem:** every request needs an auth token. You could add it in all forty service methods.

An interceptor is a function sitting between your code and the network, seeing every request and every response:

```
Component → Service → [interceptor 1] → [interceptor 2] → Network
                            ↑                  ↑
                    every request passes through both
```

```ts
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).token;

  if (!token) return next(req);

  const cloned = req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  });

  return next(cloned);
};
```

Three things to notice:

**Requests are immutable.** You must `clone()` with your changes — mutating `req` does nothing.

**`inject()` works** because interceptors run in an injection context ([Part 08](08-dependency-injection-and-services.md)). There's no constructor here.

**`next(req)` continues the chain** and returns the response Observable, which you can also pipe.

---

<a name="builtin"></a>
# 7. ⭐ Built-in vs yours

A common question: does Angular ship interceptors, or do you write them?

```
Angular provides:   the MECHANISM — where they plug in, the chain, the order
You provide:        auth, error handling, logging, retry, cache — all of it
```

There is **no built-in auth interceptor**. Every Angular app has a hand-written one, and they look nearly identical, because there's only one sensible way to attach a bearer token.

## The one exception: XSRF

Angular ships exactly one interceptor, and it's on **by default**:

```
server sets cookie:  XSRF-TOKEN=abc123
Angular sends:       X-XSRF-TOKEN: abc123      on POST/PUT/PATCH/DELETE
```

Only for same-origin relative URLs — it won't leak your token to another domain.

```ts
provideHttpClient(
  withXsrfConfiguration({ cookieName: 'CSRF-TOKEN', headerName: 'X-CSRF-TOKEN' }),
);

provideHttpClient(withNoXsrfProtection());   // if you use bearer tokens only
```

## The other `with*` options

Features of the client itself, not interceptors:

```ts
provideHttpClient(
  withFetch(),                              // use fetch() instead of XHR — better for SSR
  withInterceptors([authInterceptor]),      // YOURS
  withInterceptorsFromDi(),                 // legacy class-based interceptors
  withJsonpSupport(),
);
```

**Why Angular can't ship an auth interceptor:** where your token lives, which header it uses, when to refresh, and where to redirect on 401 are all application decisions. What it ships is the hook, so those forty lines live in one file instead of forty service methods.

---

<a name="order"></a>
# 8. ⭐ The chain and its order

```ts
withInterceptors([authInterceptor, loggingInterceptor, errorInterceptor])
```

```
REQUEST   auth → logging → error → network
RESPONSE  auth ← logging ← error ← network
```

Requests travel **down** in array order; responses come back **up** in reverse. So the *last* interceptor is closest to the network, and the *first* one sees the final response.

---

<a name="four"></a>
# 9. The four interceptors you'll actually write

```ts
// ── ERROR — one place for global failures ──────────────────
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401) {
        auth.logout();
        router.navigate(['/login']);
      }
      return throwError(() => err);        // rethrow — components still need it
    }),
  );
};
```

```ts
// ── LOADING — a global spinner without touching any component ──
export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loader = inject(LoadingService);
  loader.start();
  return next(req).pipe(finalize(() => loader.stop()));
};
```

```ts
// ── RETRY — transient failures only ────────────────────────
export const retryInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET') return next(req);      // never retry writes ⚠️

  return next(req).pipe(
    retry({ count: 2, delay: (err, n) => timer(n * 1000) }),   // 1s, 2s
  );
};
```

```ts
// ── CACHE — skip repeat GETs ───────────────────────────────
const cache = new Map<string, HttpEvent<unknown>>();

export const cacheInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET') return next(req);

  const hit = cache.get(req.urlWithParams);
  if (hit) return of(hit);

  return next(req).pipe(
    tap(event => {
      if (event instanceof HttpResponse) cache.set(req.urlWithParams, event);
    }),
  );
};
```

⚠️ The retry one carries a real lesson: **retrying a POST can create two records.** Only retry idempotent requests unless the API supports idempotency keys.

---

<a name="cancellation"></a>
# 10. Cancellation

You get it free from `switchMap` ([Part 12](12-rxjs.md)):

```ts
this.searchTerm$.pipe(
  switchMap(term => this.http.get<Result[]>('/api/search', { params: { q: term } })),
)
// each new term aborts the previous request — a real network cancellation
```

---

<a name="interview"></a>
# 11. Interview Q&A

### Q: Why use interceptors?

They're a single choke point for behaviour every request needs — attaching auth tokens, logging, global error handling, retries, a loading indicator. Without them that logic is duplicated in every service method, and easy to forget in a new one.

### Q: Does Angular provide interceptors, or do you write them?

Angular provides the mechanism and one built-in interceptor for XSRF, which is enabled by default. Everything else — auth, error handling, logging, retry, cache — you write. It can't ship an auth interceptor because token storage, header name, refresh strategy and redirect behaviour are all application decisions.

### Q: If I have three interceptors, what order do they run in?

Requests pass through in the order they're registered, and responses come back in reverse. The last one is closest to the network; the first one sees the final response.

### Q: Why do you have to clone the request?

`HttpRequest` is immutable. Mutating it wouldn't propagate — you clone with your modifications and pass the clone to `next()`.

### Q: How do you handle a 401 globally?

In an error interceptor: catch the response, and on 401 clear the session and redirect to login. I rethrow afterwards so the calling component can still react — swallowing it would leave the component thinking the request succeeded.

### Q: What does `status: 0` mean?

The request never reached the server — network failure, CORS rejection or DNS. Worth special-casing, because the message to the user is different from a server error.

### Q: How do you cancel an HTTP request?

Unsubscribe, which actually aborts it. In practice that comes free from `switchMap`, which unsubscribes from the previous inner request whenever a new value arrives.

### Q: Does the generic on `get<T>()` validate the response?

No. It's a compile-time assertion only. Angular parses the JSON and types it as `T`; if the server sends something different, nothing catches it at runtime.

---

<a name="summary"></a>
# 12. The 60-second summary

> *"`HttpClient` returns Observables, so requests are lazy and cancellable, and Angular parses the JSON and throws an `HttpErrorResponse` on any non-2xx. The generic on `get<T>` is a compile-time claim, not runtime validation. `HttpParams` and `HttpHeaders` are immutable, so `.set()` returns a new instance — forgetting to reassign is a common silent bug. Interceptors are functions that see every request and response, which is where auth tokens, logging, retries, a global loading indicator and 401 handling belong instead of being repeated in every service. Angular only ships the mechanism plus a default XSRF interceptor; the rest you write. Requests are immutable there too, so you clone with your changes and call `next()`, and interceptors run in registration order outbound and reverse order inbound. Retries should be limited to idempotent requests — retrying a POST can create duplicate records."*

---

## Connects to

- **[Part 12 — RxJS](12-rxjs.md):** `switchMap` for cancellation, `retry`, `catchError`.
- **[Part 12.5 — Subscribing](12.5-subscribing-and-api-calls.md):** the service/component split and error handling placement.
- **[Part 17 — Auth](17-authentication-and-authorization.md):** the auth interceptor plus token refresh in full.
- **[Part 19 — Error Handling](19-error-handling.md):** global `ErrorHandler` alongside the error interceptor.

*— End of Part 13 —*
