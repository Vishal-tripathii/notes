# React Study Notes — Part 12

## Async JavaScript in React (Promises, async/await, Fetch, Axios, Loading, Errors, Retry, Polling, Debounce, Throttle, AbortController, Race Conditions, Timers, Cleanup)

> **Format:** Topic explanation first, then a simple working snippet for each — this part is genuinely code-shaped, so the code earns its place. Every section explains *why* the pattern exists and what breaks without it.
>
> **Roadmap:** the roadmap's "Part 13 — Async JavaScript in React".
>
> **Continues:** [Part 6 — Lifecycle](06-lifecycle.md) · [Part 7 — Hooks](07-hooks.md) · [Part 11 — State Management](11-state-management.md).

---

## Table of Contents

1. [Promises — the foundation](#promises)
2. [async / await](#async-await)
3. [Fetch API](#fetch)
4. [Axios](#axios)
5. [Loading States](#loading)
6. [Error Handling](#errors)
7. [Retry Logic](#retry)
8. [Polling](#polling)
9. [Debounce](#debounce)
10. [Throttle](#throttle)
11. [AbortController](#abort)
12. [Race Conditions](#race)
13. [Event Listeners](#listeners)
14. [setTimeout & setInterval](#timers)
15. [Cleanup — the theme underneath all of this](#cleanup)
16. [Interview questions & answers](#interview)
17. [Quick revision cheat sheet](#cheatsheet)

---

<a name="promises"></a>
# 1. Promises — the foundation

> **Definition:** a Promise is an object representing the eventual result of an asynchronous operation. It's a placeholder for a value that doesn't exist yet.

A promise exists in one of three states: **pending** (still running), **fulfilled** (succeeded, has a value), or **rejected** (failed, has a reason). Once it settles into fulfilled or rejected it can never change again — that immutability is what makes promises safe to pass around and attach handlers to at any time, including after they've already settled.

The thing worth internalising is *why* they exist. Before promises, async results came back through callbacks, and combining several meant nesting them — the "callback pyramid." Worse, error handling had no structure: every callback had to check an error argument itself, and one forgotten check swallowed a failure silently. Promises replaced nesting with **chaining** and gave errors a single path to travel down.

```js
fetch("/api/user")
  .then(res => res.json())            // each .then returns a NEW promise
  .then(user => console.log(user))
  .catch(err => console.error(err))   // catches a rejection anywhere above
  .finally(() => setLoading(false));  // runs either way
```

**The key mechanic:** `.then()` returns a new promise, which is what makes chaining flat instead of nested. And an error anywhere in the chain skips straight to the nearest `.catch()` — you don't handle failure at every step.

## Combining promises

Four combinators, and choosing the wrong one is a common bug.

```js
// ALL — waits for every one; rejects immediately if ANY rejects
const [user, posts] = await Promise.all([fetchUser(), fetchPosts()]);

// ALL SETTLED — waits for every one; never rejects
const results = await Promise.allSettled([fetchUser(), fetchPosts()]);
// → [{status: "fulfilled", value}, {status: "rejected", reason}]

// RACE — settles with the FIRST to settle, success or failure
await Promise.race([fetchData(), timeout(5000)]);

// ANY — first to SUCCEED; rejects only if all fail
await Promise.any([fetchFromCDN1(), fetchFromCDN2()]);
```

`Promise.all` is the default choice, but it's all-or-nothing: if you're loading a dashboard with six widgets and one endpoint is down, `all` gives you nothing at all. **`allSettled` is usually what you want for independent data** — render the five that worked and show an error in the sixth.

---

<a name="async-await"></a>
# 2. async / await

> **Definition:** syntax that lets you write promise-based code as if it were sequential. `async` marks a function as returning a promise; `await` pauses inside it until a promise settles.

It is **entirely syntax sugar** — there's no new capability here. `await` unwraps a promise's value, and rejections become thrown exceptions, which means you can use ordinary `try/catch` instead of `.catch()`.

```js
async function loadUser(id) {
  try {
    const res = await fetch(`/api/users/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const user = await res.json();
    return user;
  } catch (err) {
    console.error(err);
    throw err;                  // re-throw so the caller can react
  } finally {
    console.log("done");
  }
}
```

The readability win is real: the code reads top to bottom in the order things happen, and error handling looks like error handling everywhere else in the language.

## 🔥 The accidental-sequential trap

The most common async/await mistake, and it's easy to miss in review.

```js
// ❌ SEQUENTIAL — 3 seconds total
const user  = await fetchUser();     // 1s, then waits
const posts = await fetchPosts();    // 1s, then waits
const likes = await fetchLikes();    // 1s

// ✅ PARALLEL — 1 second total
const [user, posts, likes] = await Promise.all([
  fetchUser(), fetchPosts(), fetchLikes()
]);
```

`await` means "stop here until this finishes." If the next request doesn't depend on the previous result, awaiting them one at a time triples your load time for no reason. **Only await sequentially when there's a genuine dependency.**

## ⚠️ You cannot make `useEffect` async

```jsx
// ❌ useEffect must return a cleanup function or nothing — an async function
//    returns a Promise, which React would try to call as cleanup
useEffect(async () => { ... }, []);

// ✅ define an async function inside and call it
useEffect(() => {
  async function load() {
    const data = await fetchData();
    setData(data);
  }
  load();
}, []);
```

---

<a name="fetch"></a>
# 3. Fetch API

> **Definition:** the browser's built-in promise-based HTTP client.

```js
const res  = await fetch("/api/users");
const data = await res.json();
```

Two `await`s, because fetch resolves as soon as the **headers** arrive — the body is still streaming, so `.json()` is itself asynchronous.

## 🔥 The one thing everyone gets wrong

**`fetch` does not reject on HTTP error status codes.** A 404 or a 500 is a *successful* HTTP exchange from fetch's perspective — the server was reached and it answered. Fetch only rejects on **network failure**: no connection, DNS failure, CORS block, or an aborted request.

```js
// ❌ a 500 sails right past the catch, and you try to parse an error page
try {
  const res = await fetch("/api/users");
  const data = await res.json();
} catch (err) { /* never runs for a 500 */ }

// ✅ check res.ok yourself — it's true for 200–299
const res = await fetch("/api/users");
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const data = await res.json();
```

That single line — `if (!res.ok) throw` — is the most commonly forgotten line in React data fetching, and it's a guaranteed interview question.

## POST and options

```js
const res = await fetch("/api/users", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Vishal" }),
  credentials: "include",     // send cookies (default: same-origin only)
  signal: controller.signal,  // for cancellation — §11
});
```

**Fetch has no built-in timeout.** A hanging request hangs forever. `AbortSignal.timeout(5000)` is the modern fix.

---

<a name="axios"></a>
# 4. Axios

> **Definition:** a popular promise-based HTTP library that wraps the underlying request mechanism with conveniences fetch doesn't provide.

```js
const { data } = await axios.get("/api/users");   // already parsed
```

## What it actually gives you over fetch

**Automatic JSON.** No second `await res.json()`, and it serialises request bodies for you.

**It throws on 4xx and 5xx.** The behaviour people expect from fetch and don't get — your `try/catch` actually catches HTTP errors.

**Interceptors** — the biggest reason teams adopt it. You attach logic to every request and response in one place:

```js
axios.interceptors.request.use(config => {
  config.headers.Authorization = `Bearer ${getToken()}`;   // auth on every request
  return config;
});

axios.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) redirectToLogin();   // global 401 handling
    return Promise.reject(err);
  }
);
```

Doing that with fetch means a wrapper function everyone must remember to use.

Plus **instances with a base URL and defaults**, a **real timeout option**, and **upload/download progress**, which fetch can't do easily.

| | **fetch** | **Axios** |
|---|---|---|
| Built in | ✅ | ❌ ~13 KB |
| JSON | manual `.json()` | automatic |
| Rejects on 4xx/5xx | ❌ **no** | ✅ yes |
| Timeout | manual | built-in option |
| Interceptors | ❌ | ✅ |
| Cancellation | AbortController | AbortController |
| Upload progress | ❌ | ✅ |

**Which to choose:** fetch is fine for simple apps and avoids a dependency. Axios earns its place when you need interceptors — global auth headers, token refresh, centralised error handling. If you're using React Query or SWR, either works underneath and the choice matters much less.

---

<a name="loading"></a>
# 5. Loading States

> **The principle:** every async operation has more than two outcomes, and a UI that models only "data or no data" will be wrong.

The states are **idle** (nothing requested yet), **loading**, **success with data**, **success but empty** (the request worked and returned nothing — genuinely different from loading), and **error**.

## The naive approach and why it fails

```jsx
const [data, setData]       = useState(null);
const [loading, setLoading] = useState(false);
const [error, setError]     = useState(null);
```

Three independent booleans mean **impossible states are reachable**: `loading: true` alongside `error: set`, or stale `data` still showing while `error` is populated. Nothing prevents it, and it happens whenever a code path forgets to reset one of the three.

## The better shape: a status enum

```jsx
const [state, setState] = useState({ status: "idle", data: null, error: null });

// each transition sets the WHOLE object — contradictions become unreachable
setState({ status: "loading", data: null, error: null });
setState({ status: "success", data: users, error: null });
setState({ status: "error",   data: null, error: err });

if (state.status === "loading") return <Spinner />;
if (state.status === "error")   return <Error error={state.error} />;
if (!state.data?.length)        return <EmptyState />;
return <List items={state.data} />;
```

Only one status can be true at a time, by construction. For anything more complex, `useReducer` makes the transitions explicit and testable ([Part 7 §6](07-hooks.md)).

## Two UX details worth knowing

**Don't flash a spinner for fast requests.** A spinner that appears and vanishes in 80ms reads as a glitch. Delay showing it by ~200–300ms; if the request finishes first, the user never sees a loading state at all.

**Prefer skeletons to spinners** for content areas — they reserve the correct space (no layout shift) and consistently feel faster.

---

<a name="errors"></a>
# 6. Error Handling

## Three different failures, three different messages

Lumping them together produces the useless "Something went wrong."

**Network errors** — no connection, DNS failure, CORS. `fetch` rejects; this is what your `catch` sees. Usually retryable.

**HTTP errors** — the server answered with 4xx or 5xx. Fetch does *not* reject, so you must check `res.ok`. A 404 means "doesn't exist" (don't retry), a 401 means "log in again," a 500 means "server broke" (retry might help).

**Parsing errors** — the response wasn't valid JSON, usually because an error page or proxy HTML came back. `.json()` rejects.

```js
async function request(url) {
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("Network error — check your connection");
  }

  if (!res.ok) {
    if (res.status === 401) throw new Error("Session expired");
    if (res.status === 404) throw new Error("Not found");
    throw new Error(`Server error (${res.status})`);
  }

  try {
    return await res.json();
  } catch {
    throw new Error("Invalid response from server");
  }
}
```

## ⚠️ Error boundaries do not catch async errors

The crucial React-specific point. An error boundary ([Part 6](06-lifecycle.md)) catches errors thrown **during rendering**. An error inside a promise callback, a `setTimeout`, or an event handler happens outside React's render pipeline — React isn't on the call stack, so it can't intercept it.

```jsx
// the boundary NEVER sees this
useEffect(() => {
  fetchData().catch(err => { throw err; });   // ❌ thrown in a promise callback
}, []);

// ✅ put it into state; the next render throws it, and the boundary catches
const [error, setError] = useState(null);
if (error) throw error;

useEffect(() => {
  fetchData().catch(setError);
}, []);
```

Catch async → store in state → throw during render. That's how you route async failures to a boundary.

---

<a name="retry"></a>
# 7. Retry Logic

> **The principle:** some failures are transient. A network blip or a temporarily overloaded server will often succeed on the second attempt, so failing permanently on the first throws away a free win.

## Retry with exponential backoff

Retrying immediately and repeatedly is actively harmful — if the server is struggling, a thousand clients hammering it makes things worse. **Exponential backoff** doubles the wait between attempts, giving the server room to recover.

```js
async function fetchWithRetry(url, retries = 3, delay = 1000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok && res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;                            // give up
      await new Promise(r => setTimeout(r, delay * 2 ** attempt));   // 1s, 2s, 4s
    }
  }
}
```

## What not to retry

Retrying the wrong thing is worse than not retrying at all.

```
✅ RETRY    network errors · 500, 502, 503, 504 · 429 (respect Retry-After)
❌ DON'T    400 bad request · 401 unauthorized · 403 forbidden · 404 not found
            → the request itself is wrong; retrying gives the same answer
❌ NEVER    non-idempotent operations without an idempotency key
            → retrying a POST /payments may charge the user twice
```

That last one matters. Retrying a GET is safe because it has no effect. Retrying a POST can duplicate an order or a payment unless the server deduplicates by an idempotency key.

**React Query gives you retry with backoff as a configuration option**, which is one more reason not to hand-roll data fetching.

---

<a name="polling"></a>
# 8. Polling

> **Definition:** repeatedly requesting data on an interval to keep it fresh, because HTTP has no way for the server to tell you something changed.

## 🔥 `setInterval` is the wrong tool

The instinctive implementation is `setInterval(fetchData, 5000)`, and it has a real flaw: **the interval doesn't wait for the request to finish.** If the server takes 7 seconds to respond and you poll every 5, requests pile up — overlapping, arriving out of order, and adding load to a server that's already slow.

**A recursive `setTimeout` fixes it** by scheduling the next poll only after the previous one completes:

```jsx
useEffect(() => {
  let timeoutId;
  let cancelled = false;

  async function poll() {
    try {
      const data = await fetchStatus();
      if (!cancelled) setStatus(data);
    } finally {
      if (!cancelled) timeoutId = setTimeout(poll, 5000);   // schedule AFTER
    }
  }

  poll();
  return () => { cancelled = true; clearTimeout(timeoutId); };
}, []);
```

The interval is now the gap *between* requests, not a fixed rhythm that ignores them.

## Two refinements worth knowing

**Stop polling when the tab is hidden**, or you're burning the user's battery and your server's capacity for a page nobody is looking at:

```js
if (document.visibilityState === "visible") { /* poll */ }
```

**Consider whether polling is the right mechanism at all.** For genuinely real-time data, WebSockets or Server-Sent Events push updates instead of you asking repeatedly. Polling is right for slow-changing data — a job status, a dashboard — and wrong for chat.

---

<a name="debounce"></a>
# 9. Debounce

> **Definition:** delay executing a function until a specified time has passed **without** it being called again. Rapid calls reset the timer.

The mental model: *"wait until they've stopped."*

```
keystrokes:  R  e  a  c  t              (pause)
debounce:    ·  ·  ·  ·  ·  ──500ms──►  FIRES ONCE
```

The classic use is a search box. Without debouncing, typing "React" fires five requests, four of which are immediately obsolete. With a 500ms debounce it fires one, after the user stops typing.

Also right for: autosave, validating a field after typing stops, and resize handlers where only the final size matters.

## In React — a `useDebounce` hook

The cleanest approach debounces the **value**, not the function:

```jsx
function useDebounce(value, delay = 500) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);     // ← the whole trick
  }, [value, delay]);

  return debounced;
}
```

**The cleanup is the mechanism.** Every keystroke changes `value`, which re-runs the effect — and the cleanup cancels the *previous* timer before setting a new one. Only when the value stops changing does a timer survive long enough to fire.

```jsx
function Search() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 500);

  useEffect(() => {
    if (debouncedQuery) fetchResults(debouncedQuery);
  }, [debouncedQuery]);    // only fires when the debounced value settles

  return <input value={query} onChange={e => setQuery(e.target.value)} />;
}
```

The input stays perfectly responsive because `query` updates on every keystroke; only the *fetch* is debounced.

---

<a name="throttle"></a>
# 10. Throttle

> **Definition:** allow a function to run at most once per specified interval, no matter how often it's called.

The mental model: *"at most once every N ms."*

```
scroll events:  ▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪
throttle 200ms: ▪    ▪    ▪    ▪    ▪
```

## Debounce vs throttle — the distinction that gets asked

```
DEBOUNCE  waits for a PAUSE, then fires once
          → "do it when they're done"
          → search input, autosave, validation
          → if events never stop, it NEVER fires

THROTTLE  fires at a steady maximum rate throughout
          → "do it regularly, but not too often"
          → scroll position, mouse move, window resize, infinite scroll
          → fires continuously while events continue
```

The decision rule: **do you need updates *during* the activity, or only *after* it?** A scroll-position indicator must update while scrolling — throttle. A search must only fire once you've stopped typing — debounce.

```jsx
function useThrottle(value, limit = 200) {
  const [throttled, setThrottled] = useState(value);
  const lastRun = useRef(Date.now());

  useEffect(() => {
    const id = setTimeout(() => {
      if (Date.now() - lastRun.current >= limit) {
        setThrottled(value);
        lastRun.current = Date.now();
      }
    }, limit - (Date.now() - lastRun.current));

    return () => clearTimeout(id);
  }, [value, limit]);

  return throttled;
}
```

For scroll and resize specifically, **`requestAnimationFrame` is often better than throttling by time** — it syncs to the browser's paint rhythm rather than an arbitrary millisecond figure.

---

<a name="abort"></a>
# 11. AbortController

> **Definition:** a browser API for cancelling in-flight asynchronous operations. You create a controller, pass its `signal` to fetch, and call `abort()` to cancel.

```jsx
useEffect(() => {
  const controller = new AbortController();

  fetch(`/api/search?q=${query}`, { signal: controller.signal })
    .then(res => res.json())
    .then(setResults)
    .catch(err => {
      if (err.name !== "AbortError") setError(err);   // ignore intentional aborts
    });

  return () => controller.abort();     // cancel on re-run or unmount
}, [query]);
```

Three things this solves at once. It **prevents race conditions** (§12). It **avoids setting state on an unmounted component**. And unlike a boolean flag, it **actually cancels the network request**, freeing bandwidth and server work rather than just ignoring the answer.

The `AbortError` check is essential — aborting *causes a rejection*, and without filtering it you'd display an error every time the user types another character.

## Also useful for timeouts

```js
fetch(url, { signal: AbortSignal.timeout(5000) });   // modern one-liner
```

This is how you give fetch the timeout it doesn't have. Axios's `timeout` option does the same thing internally.

---

<a name="race"></a>
# 12. Race Conditions

> **Definition:** a bug where the outcome depends on the unpredictable order in which concurrent asynchronous operations complete.

This is the bug that separates people who have shipped async React from people who haven't, because the code looks completely correct.

```jsx
useEffect(() => {
  fetch(`/api/search?q=${query}`)
    .then(r => r.json())
    .then(setResults);        // ❌ looks fine, is wrong
}, [query]);
```

**Responses do not arrive in the order requests were sent.**

```
user types "a"  → request A fires   (slow — 300ms)
user types "ab" → request B fires   (fast —  50ms)

B resolves → setResults(B)   ✅ correct results for "ab"
A resolves → setResults(A)   ❌ overwrites with STALE results for "a"
```

The user is now looking at results for a query they've already moved past, while the input shows "ab". Nothing threw, no test caught it, and it only reproduces on a slow connection — which is exactly why it so often ships.

## The two fixes

**A cancellation flag** — simple, works with any async operation:

```jsx
useEffect(() => {
  let cancelled = false;
  fetchResults(query).then(data => { if (!cancelled) setResults(data); });
  return () => { cancelled = true; };
}, [query]);
```

**AbortController** — better, because it cancels the request itself rather than ignoring its result.

Either way, **the fix belongs in the cleanup function**, and that's the conceptual point worth holding: cleanup is "undo the previous effect," and an in-flight request is part of what the previous effect started.

---

<a name="listeners"></a>
# 13. Event Listeners

Adding a listener is a side effect on something outside React, so it belongs in an effect — and it *must* be removed.

```jsx
useEffect(() => {
  function handleResize() { setWidth(window.innerWidth); }

  window.addEventListener("resize", handleResize);
  return () => window.removeEventListener("resize", handleResize);
}, []);
```

**The reference must be identical.** `removeEventListener` matches by function identity, so an inline arrow in both calls creates two different functions and the removal silently does nothing. Name the handler.

## What goes wrong without cleanup

The listener outlives the component. It keeps firing, and because it closes over that component's scope, **the component can never be garbage collected**. Navigate back and forth ten times and you have ten zombie listeners, all running, all holding dead components in memory. The visible symptom is usually the warning about setting state on an unmounted component.

## The stale closure trap

```jsx
useEffect(() => {
  function handleScroll() {
    console.log(count);        // ❌ frozen at its initial value forever
  }
  window.addEventListener("scroll", handleScroll);
  return () => window.removeEventListener("scroll", handleScroll);
}, []);                        // empty deps → the handler is never recreated
```

The handler was created on the first render and captured `count` as it was then. Since the effect never re-runs, that handler — with its frozen value — is the one still attached a minute later.

Fixes: add `count` to the dependencies (the listener is re-attached on change), use a functional update (`setCount(c => c + 1)` reads nothing captured), or keep the latest value in a ref.

Two performance notes: use `{ passive: true }` for scroll and touch listeners so the browser doesn't wait to see whether you'll call `preventDefault()`, and throttle high-frequency handlers.

---

<a name="timers"></a>
# 14. setTimeout & setInterval

Both create work that outlives the render that scheduled it, so both need cleanup.

```jsx
useEffect(() => {
  const id = setTimeout(() => setVisible(false), 3000);
  return () => clearTimeout(id);
}, []);
```

## Storing the id when you need to control it from a handler

A local `const` is lost on the next render, so use a ref:

```jsx
function Stopwatch() {
  const [time, setTime] = useState(0);
  const intervalRef = useRef(null);

  const start = () => {
    if (intervalRef.current) return;                       // guard double-start
    intervalRef.current = setInterval(() => setTime(t => t + 1), 1000);
  };

  const stop = () => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  };

  useEffect(() => () => clearInterval(intervalRef.current), []);   // unmount safety

  return <><span>{time}</span><button onClick={start}>Start</button></>;
}
```

Note `setTime(t => t + 1)` — the functional form. That's what lets the interval run forever with an empty dependency array without going stale.

## Why intervals go stale so often

```jsx
useEffect(() => {
  const id = setInterval(() => setCount(count + 1), 1000);   // ❌ stuck at 1
  return () => clearInterval(id);
}, []);
```

The callback captured `count` as `0` on the first render. The effect never re-runs, so that callback runs forever computing `0 + 1`. The functional update is the clean fix; adding `count` to the dependencies works but tears down and rebuilds the interval every second.

**One more thing about `setInterval`: it drifts.** It doesn't guarantee exactly 1000ms between executions — if the main thread is busy the callback is delayed, and the error accumulates. For a clock, compute elapsed time from a stored start timestamp rather than counting ticks.

---

<a name="cleanup"></a>
# 15. Cleanup — the theme underneath all of this

Almost every topic above ends in the same place, and it's worth stating as one principle:

> **Anything asynchronous that a component starts, the component must be able to stop.**

The cleanup function returned from `useEffect` runs **before every re-run of the effect and once on unmount** — not only on unmount. That's what makes effects reversible, and it's why setup and teardown sit next to each other rather than in separate lifecycle methods.

| Started | Cleaned up with |
|---|---|
| `setTimeout` | `clearTimeout(id)` |
| `setInterval` | `clearInterval(id)` |
| `addEventListener` | `removeEventListener` (same reference) |
| `fetch` | `controller.abort()` |
| a subscription / WebSocket | `unsubscribe()` / `close()` |
| an observer | `observer.disconnect()` |
| an async `.then` setting state | a `cancelled` flag |

## Why React 18 Strict Mode runs your effects twice

In development, Strict Mode deliberately mounts, unmounts and remounts every component, so each effect runs **setup → cleanup → setup**.

This isn't a bug and it isn't something to work around. It's a **test of reversibility**: if your effect is properly cleaned up, that sequence leaves the system exactly as one setup would. If it isn't, you'll immediately see two subscriptions, a doubled interval, or two requests — which is precisely the bug that would otherwise appear in production when a dependency changes.

Suppressing it with a `useRef` "has already run" flag hides the diagnostic without fixing the defect.

## The unifying checklist

```
Did I start something that continues after this function returns?
  → then return a cleanup that stops it.

Did I set state after an await?
  → then guard it with a cancellation flag or an AbortController.

Did I capture a value in a long-lived callback?
  → then use a functional update, a ref, or the correct dependencies.
```

---

<a name="interview"></a>
# 16. Interview questions & answers

### Q: "Does `fetch` reject on a 404 or 500?"
> *"No. Fetch only rejects on network-level failures — no connection, DNS failure, CORS, or an abort. A 404 or 500 is a successful HTTP exchange as far as fetch is concerned, so the promise resolves and you have to check `response.ok` yourself and throw. It's the most commonly forgotten line in React data fetching, and it's why Axios feels more intuitive — it throws on 4xx and 5xx by default."*

### Q: "Fetch vs Axios?"
> *"Fetch is built in, so no dependency, but you parse JSON manually, check status manually, and there's no timeout or interceptors. Axios parses JSON automatically, throws on error statuses, has a timeout option, supports upload progress, and — the main reason teams adopt it — has interceptors, so you can attach auth headers and handle 401s globally in one place. For simple apps fetch is fine; if I'm using React Query, either works underneath and the choice matters less."*

### Q: "Why can't `useEffect` be async?"
> *"Because `useEffect` must return either nothing or a cleanup function, and an async function always returns a promise. React would treat that promise as the cleanup and try to call it. The fix is to define an async function inside the effect and invoke it."*

### Q: "What's a race condition in data fetching?"
> *"Responses don't arrive in request order. If a user types quickly, an earlier slow request can resolve after a later fast one and overwrite correct results with stale data. The code looks completely correct and it usually only reproduces on a slow connection. The fix goes in the effect's cleanup — either a `cancelled` boolean checked before setting state, or an AbortController, which is better because it actually cancels the request rather than just ignoring the response."*

### Q: "What does AbortController do?"
> *"It cancels in-flight async operations. You create a controller, pass its signal to fetch, and call `abort()` in the effect's cleanup. It solves three things at once: race conditions, setting state on an unmounted component, and wasted bandwidth, since it genuinely cancels the request. One detail — aborting causes a rejection, so you have to check for `AbortError` in the catch or you'll show an error every time the user types."*

### Q: "Debounce vs throttle?"
> *"Debounce waits for a pause and then fires once — 'do it when they're done.' Right for search inputs, autosave and validation. Throttle fires at a steady maximum rate throughout — 'do it regularly, but not too often.' Right for scroll, mouse move and resize. The deciding question is whether you need updates during the activity or only after it. Also worth noting that if events never stop, a debounced function never fires, while a throttled one keeps firing."*

### Q: "How do you debounce in React?"
> *"I'd debounce the value rather than the function, with a `useDebounce` hook: a `useEffect` that sets a timeout to copy the value into debounced state, returning `clearTimeout` as cleanup. The cleanup is the whole mechanism — every keystroke re-runs the effect, which cancels the previous timer, so only a value that stops changing survives long enough to commit. The input stays fully responsive because only the derived value is delayed."*

### Q: "What's wrong with `setInterval` for polling?"
> *"It doesn't wait for the previous request to finish. If the server is slower than the interval, requests overlap, arrive out of order, and add load to a server that's already struggling. A recursive `setTimeout` that schedules the next poll only after the current one completes fixes it, because the delay becomes the gap between requests rather than a fixed rhythm. I'd also pause polling when the tab is hidden, and consider whether WebSockets are more appropriate for genuinely real-time data."*

### Q: "How do you implement retry logic?"
> *"Retry with exponential backoff — doubling the delay each attempt — because retrying immediately in a loop makes an overloaded server worse. Crucially, only retry the right failures: network errors, 500-level responses, and 429 respecting Retry-After. Don't retry 400, 401, 403 or 404, because the request itself is wrong and you'll get the same answer. And never blindly retry a non-idempotent POST without an idempotency key, or you can charge someone twice."*

### Q: "Do error boundaries catch errors in async code?"
> *"No. Error boundaries catch errors thrown during rendering. An error inside a promise callback, a timeout or an event handler happens outside React's render pipeline, so React isn't on the call stack to intercept it. The pattern is to catch it, put it in state, and throw it during the next render — then the boundary catches it."*

### Q: "Why do my effects run twice in development?"
> *"React 18 Strict Mode intentionally mounts, unmounts and remounts each component so every effect runs setup, cleanup, setup. It's a test of whether your effect is properly reversible — if it is, that sequence is equivalent to one setup. If you see two subscriptions or two requests, that's a real cleanup bug that would also appear in production when a dependency changes. Suppressing it with a `hasRun` ref hides the diagnostic rather than fixing anything."*

### Q: "What happens if you don't clean up an event listener?"
> *"A memory leak. The listener keeps firing after the component unmounts, and because it closes over the component's scope, the component can never be garbage collected. Navigate back and forth and you accumulate zombie listeners all running at once. The visible symptom is usually the warning about setting state on an unmounted component. Also worth noting that `removeEventListener` matches by function reference, so an inline arrow in both calls silently fails to remove anything."*

### Q: "What's the sequential await mistake?"
> *"Awaiting independent requests one at a time, which makes three one-second requests take three seconds instead of one. `await` means stop until this finishes, so it should only be sequential when there's a genuine dependency. Otherwise use `Promise.all` — or `Promise.allSettled` when the results are independent, so one failed endpoint doesn't discard the other five."*

### Q: "How do you model loading state properly?"
> *"Not as three independent booleans, because that makes impossible states reachable — loading true while error is set, or stale data showing alongside an error. I'd use a single status enum with whole-object transitions so only one state can be true at a time, and `useReducer` if the transitions get complex. I'd also handle the empty case separately from loading, since a successful request returning nothing is a different thing to show."*

---

<a name="cheatsheet"></a>
# 17. Quick revision cheat sheet

```
PROMISE         pending → fulfilled | rejected. Settles ONCE, immutably.
                .then returns a NEW promise → chaining stays flat
                one .catch handles errors anywhere above it
                all       → all succeed, or reject on the FIRST failure
                allSettled→ never rejects; [{status, value|reason}] ← usually right
                race      → first to SETTLE (success or failure)
                any       → first to SUCCEED

async/await     pure sugar over promises · rejections become throws → try/catch
                🔥 SEQUENTIAL TRAP: await a; await b; = a+b seconds
                   independent? → Promise.all → max(a,b)
                ❌ useEffect(async () => …) — an async fn returns a Promise,
                   React would call it as cleanup → define + call inside

FETCH           2 awaits: fetch resolves on HEADERS, .json() streams the body
                🔥 DOES NOT REJECT ON 404/500 — only network/CORS/abort
                   → if (!res.ok) throw   ← the most forgotten line in React
                no built-in timeout → AbortSignal.timeout(5000)
                POST: method + headers + JSON.stringify(body)
                credentials: "include" to send cookies cross-origin

AXIOS           auto JSON both ways · THROWS on 4xx/5xx · timeout option
                ⭐ INTERCEPTORS — auth header + global 401 handling in ONE place
                instances w/ baseURL · upload progress
                fetch = no dependency · axios = interceptors earn it

LOADING STATES  idle · loading · success(data) · success(EMPTY) · error
                ❌ 3 separate booleans → impossible states reachable
                   (loading true AND error set)
                ✅ one status enum object, whole-object transitions
                   complex → useReducer
                UX: delay the spinner ~200–300ms (no flash on fast requests)
                    skeletons > spinners (no layout shift, feels faster)

ERROR TYPES     NETWORK  fetch rejects · retryable
                HTTP     res.ok is false · 401 re-login · 404 don't retry · 5xx maybe
                PARSE    .json() rejects — usually an HTML error page came back
                ⚠️ ERROR BOUNDARIES DON'T CATCH ASYNC
                   (promise callbacks/timeouts/handlers are outside render)
                   → catch → setState(err) → `if (error) throw error` in render

RETRY           exponential backoff: 1s, 2s, 4s (immediate retries worsen an outage)
                ✅ network · 500/502/503/504 · 429 (respect Retry-After)
                ❌ 400 · 401 · 403 · 404 — the request itself is wrong
                🔥 NEVER blindly retry a POST without an idempotency key
                React Query gives you this as config

POLLING         🔥 setInterval doesn't wait for the response → requests OVERLAP
                   and pile up on a slow server
                ✅ recursive setTimeout — schedule the next AFTER the current one
                pause when document.visibilityState !== "visible"
                genuinely real-time? → WebSockets / SSE, not polling

DEBOUNCE        wait for a PAUSE, then fire once — "do it when they're done"
                search · autosave · validation · final resize
                if events never stop, it NEVER fires
                React: debounce the VALUE — useEffect + setTimeout,
                       return clearTimeout ← the cleanup IS the mechanism
                       input stays responsive; only the derived value lags

THROTTLE        at most once per N ms — "regularly, but not too often"
                scroll · mousemove · resize · infinite scroll
                fires continuously while events continue
                ⭐ DECIDER: updates DURING the activity → throttle
                            only AFTER it stops     → debounce
                scroll/resize: requestAnimationFrame often beats time-throttling

ABORTCONTROLLER new AbortController() → pass .signal to fetch → abort() in cleanup
                solves: race conditions + unmounted setState + WASTED BANDWIDTH
                (a flag only ignores the response; abort cancels the request)
                ⚠️ abort CAUSES a rejection → if (err.name !== "AbortError")
                AbortSignal.timeout(ms) = the timeout fetch lacks

RACE CONDITION  responses DON'T arrive in request order
                "a" (slow) fires, "ab" (fast) fires → ab renders → a OVERWRITES it
                looks correct · no error · only reproduces on slow connections
                FIX BELONGS IN CLEANUP (cleanup = undo the previous effect,
                and an in-flight request is part of what it started)
                  let cancelled = false → check before setState
                  or controller.abort()  ← better

EVENT LISTENERS add in an effect, remove in cleanup
                ⚠️ removeEventListener matches by REFERENCE — inline arrows in
                   both calls silently fail. Name the handler.
                no cleanup → the listener keeps firing AND holds the dead
                component in memory (it closes over its scope) → leak
                STALE CLOSURE with [] deps → handler frozen at first-render values
                   → add the dep · functional update · or a ref
                { passive: true } for scroll/touch · throttle high-frequency ones

TIMERS          always clear in cleanup
                need to control it from a handler? store the id in a REF
                (a local const is lost on the next render)
                setInterval + setCount(count+1) + [] → STUCK (stale closure)
                   → setCount(c => c + 1)
                setInterval DRIFTS — for a clock, compute from a start timestamp

CLEANUP ⭐      "anything async a component STARTS, it must be able to STOP"
                runs BEFORE every re-run AND on unmount — not just unmount
                timeout→clearTimeout · interval→clearInterval
                listener→removeEventListener · fetch→abort()
                subscription→unsubscribe · observer→disconnect
                async setState→cancelled flag
STRICT MODE     dev: setup → cleanup → setup. A TEST OF REVERSIBILITY, not a bug.
                two subscriptions/requests = a REAL bug that would also appear
                in production when a dependency changes
                never suppress it with a hasRun ref
```

---

## Connects to

- **[Part 7 — Hooks](07-hooks.md):** `useEffect` dependencies, cleanup semantics, and stale closures — the foundation for almost everything here.
- **[Part 6 — Lifecycle](06-lifecycle.md):** error boundaries, and why they can't catch async errors.
- **[Part 11 — State Management](11-state-management.md):** server state — why React Query solves caching, deduplication, retry and staleness so you don't hand-roll them.
- **[Part 9 — Performance](09-performance.md):** debounce and throttle as interaction-performance tools.
- **[Part 8 — Rendering Internals](08-rendering-internals-and-vdom.md):** why Strict Mode double-invokes, and why render must be pure.
- **Custom Hooks:** `useDebounce`, `useThrottle`, `useFetch`, `useInterval` — the natural home for all of this.

## Suggested next topics

1. **Custom Hooks** — recommended next; where these patterns belong.
2. **React Query / SWR** — the library answer to most of this part.
3. **Forms** — controlled inputs, validation, async submission.

*— End of Part 12: Async JavaScript in React —*
