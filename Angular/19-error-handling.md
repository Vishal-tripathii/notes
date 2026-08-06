# Angular Study Notes — Part 19

## Error Handling

> **Roadmap:** [Part 19](00-ROADMAP.md) · **Priority:** ⭐⭐⭐☆☆
>
> **Continues:** [Part 13 — HttpClient](13-httpclient-and-interceptors.md) · [Part 12 — RxJS](12-rxjs.md).

---

## Table of Contents

1. [Three layers](#layers) ⭐
2. [The global `ErrorHandler`](#global)
3. [The HTTP error interceptor](#interceptor)
4. [Component-level handling](#component)
5. [Retry, sensibly](#retry)
6. [Angular has no error boundary](#boundary) ⭐
7. [Interview Q&A](#interview)
8. [The 60-second summary](#summary)

---

<a name="layers"></a>
# 1. ⭐ Three layers

Error handling goes wrong when everything is done in one place. There are three, with different jobs:

```
GLOBAL ErrorHandler     uncaught JS errors     → log, report, generic message
HTTP interceptor        network failures       → 401 redirect, retry, logging
COMPONENT               this specific request  → what the user sees here
```

The rule: **lower layers log and shape, the component decides what to display.**

---

<a name="global"></a>
# 2. The global `ErrorHandler`

Angular's default `ErrorHandler` logs to the console. Replace it to report errors somewhere useful:

```ts
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private notifier = inject(NotificationService);
  private logger   = inject(LoggingService);

  handleError(error: unknown) {
    // HTTP errors are already handled by the interceptor — don't double-report
    if (error instanceof HttpErrorResponse) return;

    this.logger.report(error);                       // Sentry, Datadog, your API
    this.notifier.show('Something went wrong');
    console.error(error);                            // keep the console useful in dev
  }
}
```

```ts
providers: [{ provide: ErrorHandler, useClass: GlobalErrorHandler }]
```

This is the last line of defence — it catches what nothing else did.

---

<a name="interceptor"></a>
# 3. The HTTP error interceptor

From [Part 13](13-httpclient-and-interceptors.md) — one place for network failures:

```ts
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const logger = inject(LoggingService);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401) auth.logout();
      if (err.status >= 500)  logger.report(err);

      return throwError(() => err);      // ⚠️ ALWAYS rethrow
    }),
  );
};
```

⚠️ **Never swallow the error here.** If the interceptor returns `of([])`, the component can't distinguish "no results" from "the request failed" — and shows an empty list where an error message belongs.

---

<a name="component"></a>
# 4. Component-level handling

The component owns the *message*, because only it knows the context:

```ts
this.service.getEmployees().pipe(
  finalize(() => this.loading.set(false)),
  takeUntilDestroyed(this.destroyRef),
).subscribe({
  next:  data => this.employees.set(data),
  error: (err: HttpErrorResponse) => this.error.set(this.messageFor(err)),
});

private messageFor(err: HttpErrorResponse): string {
  if (err.status === 0)   return 'Check your connection';
  if (err.status === 403) return "You don't have access to this";
  if (err.status === 404) return 'Employee not found';
  if (err.status >= 500)  return 'Server error — please try again';
  return 'Something went wrong';
}
```

Three surfaces, matched to severity:

```
inline    a field-level validation error
toast     a background action failed (autosave)
page      the main data of the page failed to load  → offer a Retry button
```

---

<a name="retry"></a>
# 5. Retry, sensibly

```ts
retry({ count: 3, delay: (err, n) => timer(n * 1000) })    // 1s, 2s, 3s
```

Two rules:

```
✅ retry:  GET, and transient failures (network, 502, 503, 504)
❌ never:  POST/PUT without idempotency — you can create duplicate records
❌ never:  4xx — a 400 or 403 will fail identically every time
```

```ts
retry({
  count: 2,
  delay: (err: HttpErrorResponse, n) =>
    err.status >= 500 ? timer(n * 1000) : throwError(() => err),   // don't retry 4xx
})
```

---

<a name="boundary"></a>
# 6. ⭐ Angular has no error boundary

React has error boundaries — a component that catches a child's render error and shows a fallback. **Angular has no equivalent.** An error thrown during a component's rendering reaches the global `ErrorHandler`, and the view can be left broken.

What you do instead:

```
defensive templates    @if (data(); as d) { … } @else { <app-empty /> }
                       — don't assume data exists
explicit error state   every async view has loading / error / empty / data
safe navigation        user?.address?.city
global handler         catches what slipped through, so the app doesn't die silently
```

The practical version — every data-driven view has four states, not one:

```html
@if (loading()) {
  <app-spinner />
} @else if (error()) {
  <app-error [message]="error()!" (retry)="load()" />
} @else if (employees().length === 0) {
  <app-empty />
} @else {
  @for (e of employees(); track e.id) { … }
}
```

Forgetting the empty and error states is the most common cause of a "blank page with no explanation".

---

<a name="interview"></a>
# 7. Interview Q&A

### Q: How do you handle errors globally in Angular?

Two mechanisms. A custom `ErrorHandler` replaces Angular's default and catches uncaught exceptions — I use it to report to a logging service and show a generic message. An HTTP error interceptor catches network failures in one place, handling 401 logout and server-error reporting. The interceptor always rethrows, so components can still react.

### Q: Why shouldn't the interceptor swallow errors?

Because the component then can't tell a failure from an empty result. If the interceptor returns an empty array, the user sees "no employees" when the truth is the request failed. Handle cross-cutting concerns there, then rethrow.

### Q: Where does `catchError` go in a pipe?

It depends what you want to survive. Inside a `switchMap` it only kills the inner request, so an outer stream like a search box keeps working. Outside it, one error terminates the whole stream permanently.

### Q: How do you retry a failed request?

`retry` with a delay function for backoff, but only for idempotent requests and transient failures. Retrying a POST can create duplicate records, and retrying a 400 or 403 just fails again — so I check the status in the delay function and rethrow immediately for 4xx.

### Q: Does Angular have error boundaries like React?

No. An error during rendering goes to the global `ErrorHandler` and can leave the view broken. The substitute is defensive templates and an explicit state machine per view — loading, error, empty, data — plus the global handler as a last resort.

---

<a name="summary"></a>
# 8. The 60-second summary

> *"I handle errors at three layers. A custom global `ErrorHandler` catches uncaught exceptions and reports them to a logging service. An HTTP interceptor handles network failures centrally — 401 logout, server-error reporting — and always rethrows, because swallowing there would leave components unable to distinguish a failure from an empty result. The component then decides what the user actually sees, mapping status codes to messages, with inline, toast or full-page surfaces depending on severity. Retries are limited to idempotent requests and transient failures, with backoff, and never for 4xx since those fail identically every time. Angular has no error boundary like React, so the substitute is defensive templates and an explicit four-state view — loading, error, empty, data — which is also what prevents the blank-page-with-no-explanation failure mode."*

---

## Connects to

- **[Part 12 — RxJS](12-rxjs.md):** `catchError` placement, `retry`, `finalize`.
- **[Part 13 — HttpClient](13-httpclient-and-interceptors.md):** the error interceptor and `HttpErrorResponse`.
- **[Part 12.5 — Subscribing](12.5-subscribing-and-api-calls.md):** service vs component error responsibilities.

*— End of Part 19 —*
