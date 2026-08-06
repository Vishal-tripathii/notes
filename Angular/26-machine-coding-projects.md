# Angular Study Notes — Part 26

## Machine Coding — The Two Projects

> **Format:** briefs, not tutorials. Build them without looking at the notes; use the checklists to find your gaps.
>
> **Roadmap:** [Part 26](00-ROADMAP.md) · **Priority:** ⭐⭐⭐⭐☆
>
> Two projects, not four — a third CRUD app teaches nothing the second didn't.

---

## Project 1 — Employee Management System

*Covers Parts 01–17.*

```
Login  →  guarded shell
          ├── Employee List      table, search, pagination
          ├── Employee Detail    route param, resolver
          ├── Employee Form      reactive, validation, create + edit
          └── Settings           role-gated (admin only)
```

## Build order

```
1.  ng new, standalone, routes for login + dashboard shell
2.  EmployeeService with the five CRUD methods returning Observables
3.  List page — toSignal, loading/error/empty states
4.  Card component — dumb, OnPush, @Input in / @Output out
5.  Detail page — paramMap + switchMap (NOT snapshot)
6.  Reactive form — validation, cross-field, async username check
7.  AuthService — signal, isLoggedIn synchronous
8.  authInterceptor — bearer token
9.  authGuard on the shell, roleGuard with canMatch on Settings
10. errorInterceptor — 401 → logout, rethrow
11. Lazy-load the admin/settings area
```

## Self-check

```
[ ] every async view has loading / error / empty / data states
[ ] no snapshot.paramMap on a route that can change params
[ ] every dumb component is OnPush
[ ] @for uses track with a real id
[ ] no method calls in templates
[ ] no nested subscribes
[ ] canMatch (not canActivate) on the lazy role-gated route
[ ] the interceptor rethrows after handling 401
[ ] no memory leaks — async pipe or takeUntilDestroyed everywhere
[ ] form uses nonNullable and getRawValue() on submit
```

---

## Project 2 — Live Search & Sync Dashboard

*Covers Parts 11, 12, 16, 18, 19. Deliberately **not** another CRUD app — the point is asynchrony.*

```
┌──────────────────────────────────────────┐
│  [ search…            ]   ● live         │
├──────────────────────────────────────────┤
│  virtualised table — 10,000 rows         │
│  optimistic inline edit                  │
└──────────────────────────────────────────┘
```

## The five things it must do

```
1. TYPE-AHEAD      debounce 300ms · distinctUntilChanged · switchMap
                   → cancels the in-flight request, no stale overwrite

2. POLLING         a live feed on an interval, pausable
                   → switchMap + takeUntilDestroyed, no leak

3. OPTIMISTIC      inline edit updates the UI immediately
   UPDATE          → rolls back on failure, shows a toast

4. VIRTUAL SCROLL  10,000 rows, ~20 DOM nodes
                   → cdk-virtual-scroll-viewport + OnPush rows

5. RETRY + ERROR   exponential backoff on 5xx, immediate fail on 4xx
                   → visible error state with a Retry button
```

## Why this one matters more

Project 1 proves you can wire an app together. **Project 2 is where the RxJS answers become real** — you can't fake understanding `switchMap` after you've watched a stale response overwrite fresh results because you used `mergeMap`.

## Self-check

```
[ ] typing fast fires ONE request, not one per keystroke
[ ] a slow old response never overwrites a newer one
[ ] navigating away mid-request cancels it (check the Network tab)
[ ] polling stops when the component is destroyed
[ ] a failed edit rolls the UI back
[ ] scrolling 10,000 rows stays smooth
[ ] one failed request doesn't kill the search box permanently
[ ] Angular DevTools profiler shows no unnecessary component checks
```

---

## How to use these before an interview

```
1. Build Project 1 with the notes open.
2. Build Project 2 WITHOUT them.
3. Rebuild Project 2's search component from scratch, from memory.
4. Explain each numbered feature out loud, as if teaching it.
```

Step 4 is the one that finds gaps. Recognising `switchMap` in code and explaining it unprompted are different skills, and only the second one is tested.

---

## Connects to

- **[Part 12 — RxJS](12-rxjs.md):** the type-ahead pattern in full.
- **[Part 12.5 — Subscribing](12.5-subscribing-and-api-calls.md):** the CRUD component with optimistic updates.
- **[Part 17 — Auth](17-authentication-and-authorization.md):** the guard/interceptor wiring for Project 1.
- **[Part 18 — Performance](18-performance.md):** virtual scrolling and the profiler.

*— End of Part 26 —*
