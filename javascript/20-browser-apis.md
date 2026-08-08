# JavaScript Study Notes — Part 20

## Browser APIs ⭐⭐⭐☆☆

**Topics:** `localStorage` vs `sessionStorage` · cookies · `fetch` vs `XMLHttpRequest` · `AbortController` · `URLSearchParams`.

---

## 1. `localStorage` vs `sessionStorage`

> **Definition:** both are **Web Storage API** key-value stores, synchronous, string-only, scoped to the page's origin. `localStorage` persists with **no expiration** — surviving tab closes and browser restarts, shared across all tabs of the same origin. `sessionStorage` persists only for the lifetime of **one tab** — cleared when that tab closes, and not shared with other tabs even of the same origin.

```js
localStorage.setItem('theme', 'dark');       // survives closing the browser entirely
sessionStorage.setItem('draft', 'unsaved text'); // gone the moment this tab closes

localStorage.getItem('theme');  // 'dark'
localStorage.removeItem('theme');
localStorage.clear();             // wipes everything for this origin

// both only store strings — objects must be serialized
localStorage.setItem('user', JSON.stringify({ name: 'V' }));
JSON.parse(localStorage.getItem('user'));
```

## 2. Cookies

> **Definition:** small key-value strings stored by the browser and automatically attached to **every HTTP request** to a matching domain/path (unlike `localStorage`, which is never sent over the network on its own) — configurable with expiration, domain/path scope, and security flags (`HttpOnly`, `Secure`, `SameSite`).

```js
document.cookie = 'sessionId=abc123; max-age=3600; path=/; Secure; SameSite=Strict';
document.cookie; // reading returns ALL cookies as one semicolon-joined string — awkward,
                    // which is why libraries exist just to parse/write cookies cleanly
```
**Cookies' distinct role:** they're the mechanism for session/auth tokens specifically *because* they're sent automatically with every request (including a plain `<img>` tag or a server-rendered page load) — `localStorage` requires JavaScript to explicitly read and attach it, so it can't authenticate a request the browser makes on its own. `HttpOnly` cookies additionally can't be read by JavaScript at all, closing off a common XSS attack vector that plagues token-in-`localStorage` setups.

## 3. `fetch` vs `XMLHttpRequest`

> **Definition:** `fetch` is the modern, **promise-based** API for making HTTP requests, with a cleaner interface built around `Request`/`Response` objects. `XMLHttpRequest` (`XHR`) is the older, **callback/event-based** API it largely superseded.

```js
// fetch — promise-based, chainable, works naturally with async/await
async function getUser(id) {
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`); // fetch does NOT reject on 404/500!
  return res.json();                                     // only rejects on network failure
}

// XHR — event-based, more verbose, but supports upload progress events fetch historically lacked
const xhr = new XMLHttpRequest();
xhr.open('GET', '/api/users/1');
xhr.onload = () => console.log(JSON.parse(xhr.responseText));
xhr.onerror = () => console.log('network error');
xhr.send();
```
**The `fetch` gotcha that trips people up:** `fetch`'s promise only rejects on a genuine network failure (DNS failure, no connection) — a `404` or `500` response is still a "successful" fetch as far as the promise is concerned, and you must explicitly check `res.ok` (or `res.status`) yourself, or errors silently pass through as if they succeeded.

## 4. `AbortController`

> **Definition:** a controller object whose `.signal` can be passed to a cancelable operation (`fetch`, an event listener); calling `controller.abort()` signals cancellation, causing a pending `fetch` to reject with an `AbortError` and immediately removing any listener registered with that signal.

```js
const controller = new AbortController();
fetch('/slow-endpoint', { signal: controller.signal })
  .then(res => res.json())
  .catch(err => { if (err.name === 'AbortError') console.log('request was cancelled'); });

setTimeout(() => controller.abort(), 5000); // cancel if it takes longer than 5s — a timeout pattern
```
Classic real use case: a search-as-you-type box aborting the *previous* in-flight request the moment a new keystroke fires a new one, so a slow earlier response can't race ahead and overwrite the UI with stale results.

## 5. `URLSearchParams`

> **Definition:** a utility object for reading and constructing URL query-string parameters, avoiding manual string concatenation and encoding.

```js
const params = new URLSearchParams({ q: 'js interview', page: '2' });
params.toString();                     // 'q=js+interview&page=2' — handles encoding automatically
`https://example.com/search?${params}`;

const url = new URL('https://example.com/search?q=js&page=2');
url.searchParams.get('q');               // 'js'
url.searchParams.set('page', '3');
url.searchParams.has('sort');            // false
```

---

## Interview Q&A

**Q: `localStorage` vs `sessionStorage`, precisely?**
> Both are synchronous, string-only, origin-scoped Web Storage. `localStorage` has no expiration and is shared across every tab of the same origin. `sessionStorage` is scoped to a single tab's lifetime — cleared when that tab closes, and not visible to other tabs even of the same origin.

**Q: Why do cookies exist as a distinct mechanism when `localStorage` can also store data?**
> Cookies are automatically attached to every matching HTTP request by the browser itself, which is what makes them viable for session authentication — the server sees them on requests it didn't get any JavaScript chance to attach data to. `localStorage` is never sent over the network on its own; only explicit JS code can read and attach it, so it can't authenticate a plain page load or an `<img>` request the way a cookie can.

**Q: How does `fetch` differ from `XMLHttpRequest`, and what's the classic `fetch` gotcha?**
> `fetch` is promise-based and composes naturally with `async`/`await`; `XHR` is event/callback-based and more verbose, though it does support things like upload progress that `fetch` historically lacked. The gotcha: `fetch`'s returned promise only rejects on an actual network failure — a `404` or `500` HTTP response still resolves successfully, so you must check `response.ok` yourself or a real server error will silently be treated as success.

**Q: What does `AbortController` solve?**
> It gives you a way to cancel an in-flight `fetch` (or remove an event listener) programmatically — calling `.abort()` on the controller rejects the pending fetch with an `AbortError`. The classic use is a search box cancelling the previous request the instant a new keystroke fires a newer one, preventing a slow, now-stale response from overwriting fresher results.

---

## Follow-ups (challenge questions)

- *Security:* an app stores a JWT in `localStorage` instead of an `HttpOnly` cookie — walk through exactly how an XSS vulnerability elsewhere in the app becomes a full account-takeover in the `localStorage` case, and why an `HttpOnly` cookie would have blocked that specific attack path.
- *Consistency:* a user has the same page open in two tabs, both reading/writing `localStorage` — is there a race condition if both tabs write to the same key at nearly the same moment? What does the `storage` event let you do about cross-tab sync?
- *Failure mode:* a search-as-you-type feature doesn't use `AbortController` — walk through the exact sequence of events that causes an older, slower response to overwrite a newer, faster one in the UI (a real, common production bug).

---

**Previous:** [Part 19 — Polyfills](19-polyfills.md) · **Next:** [Part 21 — DOM Manipulation & Event Delegation](21-dom-manipulation-and-event-delegation.md)
