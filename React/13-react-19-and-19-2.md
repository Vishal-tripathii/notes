# React Study Notes — Part 13

## React 19 & 19.2 (Actions, `useActionState`, `useFormStatus`, `useOptimistic`, `use()`, ref as a prop, Metadata, `<Activity>`, `useEffectEvent`)

> **Format:** definition → the problem before → the fix → code → the trap. Same style as the other parts, plain language.
>
> **Versions:** React **19.0** shipped December 2024, **19.1** March 2025, **19.2** October 2025. If a job uses React 18, everything here is "what's new" — still worth knowing because interviewers ask "have you used React 19 yet?"
>
> **Continues from:** [Part 7 — Hooks](07-hooks.md) (`useTransition`) · [Part 12 — Async](12-async-javascript.md) · [Part 16 — Forms](16-forms.md).

---

## Table of Contents

1. [The big idea: Actions](#actions)
2. [⭐ `<form action>` and `useActionState`](#useactionstate)
3. [`useFormStatus`](#useformstatus)
4. [⭐ `useOptimistic`](#useoptimistic)
5. [⭐ `use()` — read a promise or context](#use)
6. [`ref` as a prop, and ref cleanup](#ref)
7. [Smaller React 19 changes](#smaller)
8. [What React 19 removed](#removed)
9. [React 19.2: `<Activity>`](#activity)
10. [React 19.2: `useEffectEvent`](#useeffectevent)
11. [Interview Q&A](#interview)
12. [Cheat Sheet](#cheatsheet)

---

<a name="actions"></a>
# 1. The big idea: Actions

**Before React 19,** every form submit or button that saved data needed the same hand-written code:

```jsx
const [isPending, setIsPending] = useState(false);
const [error, setError] = useState(null);

async function handleSubmit(e) {
  e.preventDefault();
  setIsPending(true);
  setError(null);
  try { await updateName(name); }
  catch (err) { setError(err.message); }
  finally { setIsPending(false); }
}
```

Pending state, error state, preventing double submits, resetting the form — written again in every form.

> **Definition — Action:** in React 19, an **Action** is a function (usually async) that you run inside a transition. React tracks it for you: it knows when it's pending, keeps the UI responsive, and lets you show optimistic updates and errors.

You already met the start of this: in React 19, `startTransition` accepts an **async** function, and `isPending` stays `true` until it finishes ([Part 7](07-hooks.md)). The new hooks below build on that.

> **Analogy 🍽️ — handing your order to a waiter instead of walking to the kitchen.** You give the order (the action) and carry on chatting; the waiter tracks "it's being cooked" (pending) and tells you if something went wrong (error).

---

<a name="useactionstate"></a>
# 2. ⭐ `<form action>` and `useActionState`

### `<form action={fn}>`

In React 19 you can pass a **function** as a form's `action`. React calls it with the form's **`FormData`** when submitted — no `e.preventDefault()`, no `onSubmit`.

```jsx
function NewsletterForm() {
  async function subscribe(formData) {
    await api.subscribe(formData.get('email'));
  }
  return (
    <form action={subscribe}>
      <input name="email" type="email" required />
      <button type="submit">Subscribe</button>
    </form>
  );
}
```

After the action succeeds, React **resets** the form's uncontrolled fields automatically.

### `useActionState` — the result of the last submit

```jsx
import { useActionState } from 'react';

async function updateName(previousState, formData) {
  const name = formData.get('name');
  const error = await api.updateName(name);
  if (error) return { error };              // whatever you return becomes the new state
  return { error: null, saved: name };
}

function NameForm() {
  const [state, formAction, isPending] = useActionState(updateName, { error: null });

  return (
    <form action={formAction}>
      <input name="name" defaultValue={state.saved ?? ''} />
      <button disabled={isPending}>{isPending ? 'Saving…' : 'Save'}</button>
      {state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
```

- Returns **`[state, formAction, isPending]`**.
- Your function receives **`(previousState, formData)`** — notice the extra first argument compared with a plain form action.
- Submissions are **queued in order**; `isPending` covers the whole thing.
- Works with **Server Functions** too ([Part 14](14-server-components-and-nextjs.md)) — and then the form even works **before JavaScript loads** (progressive enhancement).

> 🧠 **Remember:** `useActionState` = **"run this on submit, give me the result and a pending flag."**

(It was briefly called `useFormState` in React canary/Next.js 14 — same idea, renamed.)

---

<a name="useformstatus"></a>
# 3. `useFormStatus`

Reads the status of the **parent `<form>`** — so a reusable submit button can show a spinner without being passed props.

```jsx
import { useFormStatus } from 'react-dom';     // note: react-DOM

function SubmitButton({ children }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>{pending ? 'Working…' : children}</button>;
}

<form action={saveProfile}>
  …
  <SubmitButton>Save</SubmitButton>
</form>
```

⚠️ It only works in a component rendered **inside** the `<form>`. Calling it in the same component that renders the `<form>` returns nothing useful. It also gives `data` (the FormData being sent), `method` and `action`.

---

<a name="useoptimistic"></a>
# 4. ⭐ `useOptimistic`

**Optimistic UI** = show the result **immediately**, before the server confirms, and undo it if the request fails. Like a chat app showing your message instantly, with a "sending…" tick.

```jsx
import { useOptimistic, startTransition } from 'react';

function Likes({ count, onLike }) {
  const [optimisticCount, addOptimistic] = useOptimistic(
    count,                                   // the real value (from props/server)
    (current, delta) => current + delta      // how to apply an optimistic change
  );

  function like() {
    startTransition(async () => {
      addOptimistic(1);                      // UI shows count + 1 RIGHT NOW
      await onLike();                        // real request; when it ends, React
    });                                      // switches back to the real `count`
  }

  return <button onClick={like}>♥ {optimisticCount}</button>;
}
```

- The optimistic value only lives **while the action is running**. When it finishes, React shows the real `count` again — so if the server updated `count`, it stays; if the request **failed**, the optimistic change **disappears automatically** (no manual rollback).
- `addOptimistic` must be called **inside an Action / transition** (a form action or `startTransition`).

> 🧠 **Remember:** **`useOptimistic` = "pretend it worked until we know."**

---

<a name="use"></a>
# 5. ⭐ `use()` — read a promise or context

`use` is a new API (not quite a hook — it **can** be called inside `if` and loops).

### Reading a promise

```jsx
import { use, Suspense } from 'react';

function Comments({ commentsPromise }) {
  const comments = use(commentsPromise);      // suspends until resolved; throws to error boundary if rejected
  return comments.map(c => <p key={c.id}>{c.text}</p>);
}

function Post({ id }) {
  const commentsPromise = useMemo(() => fetchComments(id), [id]);   // ⚠️ must be STABLE (see below)
  return (
    <Suspense fallback={<p>Loading comments…</p>}>
      <Comments commentsPromise={commentsPromise} />
    </Suspense>
  );
}
```

⚠️ **The rule that trips everyone:** don't create the promise **inside the component that calls `use`**. Every render would create a new promise → suspend again → render again → infinite loop. The promise should come from **outside**: a parent, a cache, a router loader, or — the main intended use — a **Server Component** passing a promise down to a Client Component ([Part 14](14-server-components-and-nextjs.md)). For everyday client-side fetching, a library like TanStack Query is still the better tool ([Part 17](17-data-fetching-tanstack-query-and-redux-toolkit.md)).

### Reading context — conditionally

```jsx
function Badge({ show }) {
  if (!show) return null;
  const theme = use(ThemeContext);            // ✅ allowed after an early return — useContext isn't
  return <span className={theme}>New</span>;
}
```

---

<a name="ref"></a>
# 6. `ref` as a prop, and ref cleanup

**`ref` is a normal prop** for function components — no `forwardRef` needed ([Part 7 §10](07-hooks.md)):

```jsx
function TextInput({ ref, ...props }) {
  return <input ref={ref} {...props} />;
}
<TextInput ref={inputRef} placeholder="Name" />
```

**Ref callbacks can return a cleanup function** (like an effect):

```jsx
<div ref={(node) => {
  const observer = new ResizeObserver(() => measure(node));
  observer.observe(node);
  return () => observer.disconnect();         // 🆕 runs when the element is removed
}} />
```

Before, React called the callback with `null` on removal and you had to handle that case.

---

<a name="smaller"></a>
# 7. Smaller React 19 changes

| Change | Example |
|---|---|
| **`<Context>` is the provider** | `<ThemeContext value="dark">…</ThemeContext>` instead of `<ThemeContext.Provider>` (still works) |
| **Document metadata in components** | render `<title>`, `<meta>`, `<link>` anywhere — React moves them into `<head>` |
| **Stylesheets with `precedence`** | `<link rel="stylesheet" href="…" precedence="default" />` — loaded once, in order, and Suspense waits for them |
| **Resource hints** | `preload`, `preinit`, `preconnect`, `prefetchDNS` from `react-dom` |
| **Better hydration errors** | one error with a diff of what didn't match, instead of many vague ones |
| **Errors logged once**, plus root options `onCaughtError` / `onUncaughtError` / `onRecoverableError` | [Part 6 §5](06-lifecycle.md) |
| **`useDeferredValue(value, initialValue)`** | show `initialValue` on first render, then defer |
| **Custom Elements** fully supported | props passed as properties, not just strings |
| **React 19.1:** "owner stacks" | dev-only stack showing *which component rendered* the broken one — much easier debugging |

```jsx
function ProductPage({ product }) {
  return (
    <>
      <title>{`${product.name} | Shop`}</title>          {/* hoisted to <head> */}
      <meta name="description" content={product.summary} />
      <h1>{product.name}</h1>
    </>
  );
}
```

---

<a name="removed"></a>
# 8. What React 19 removed

Long-deprecated APIs are gone — what you'll hit when upgrading an old app:

```
ReactDOM.render / hydrate          → createRoot / hydrateRoot
unmountComponentAtNode             → root.unmount()
findDOMNode                        → refs
propTypes / defaultProps on function components → TypeScript / default parameters (Part 4)
string refs (ref="input")          → useRef / callback refs
legacy context (contextTypes)      → createContext
react-test-renderer/shallow        → React Testing Library (Part 18)
act from react-dom/test-utils      → act from 'react'
```

There's an official codemod (`npx codemod@latest react/19/migration-recipe`) and the recommended path is **upgrade to 18.3 first** — it warns about everything 19 removes.

---

<a name="activity"></a>
# 9. React 19.2: `<Activity>`

**Problem:** with `{isOpen && <Sidebar />}`, closing the sidebar **unmounts** it — its state (scroll position, typed text, expanded sections) is lost, and reopening rebuilds it from scratch. Hiding with CSS instead keeps it mounted but its effects keep running and it still re-renders.

**`<Activity>`** lets you hide part of the UI **without losing its state**:

```jsx
import { Activity } from 'react';

<Activity mode={isOpen ? 'visible' : 'hidden'}>
  <Sidebar />
</Activity>
```

When `hidden`:
- the UI is hidden (`display: none`) but **state is kept**;
- its **effects are cleaned up** (subscriptions, timers stop) and re-run when shown again;
- updates inside it are **low priority**, so they don't slow the visible page.

Uses: tabs that keep their state, a back-navigation that restores the previous screen instantly, **pre-rendering** a screen the user is likely to open next (render it `hidden` in the background).

> 🧠 **Remember:** `&&` = **destroy**. CSS `display:none` = **hidden but still running**. `<Activity hidden>` = **paused, state kept.**

(This feature was called "Offscreen" during development.)

---

<a name="useeffectevent"></a>
# 10. React 19.2: `useEffectEvent`

**Problem:** an effect needs the **latest** value of something, but you don't want that value to **re-run** the effect.

```jsx
function ChatRoom({ roomId, theme }) {
  useEffect(() => {
    const conn = connect(roomId);
    conn.on('connected', () => showToast('Connected!', theme));   // needs the current theme…
    return () => conn.disconnect();
  }, [roomId, theme]);   // …but now changing the THEME reconnects to the chat 😬
}
```

Leaving `theme` out of the dependencies gives a stale value and a lint error. **`useEffectEvent`** fixes it:

```jsx
import { useEffect, useEffectEvent } from 'react';

function ChatRoom({ roomId, theme }) {
  const onConnected = useEffectEvent(() => {
    showToast('Connected!', theme);           // always reads the LATEST theme
  });

  useEffect(() => {
    const conn = connect(roomId);
    conn.on('connected', () => onConnected());
    return () => conn.disconnect();
  }, [roomId]);                               // ✅ only reconnect when the room changes
}
```

Rules: call the effect event **only from inside effects** (not during render, not passed to other components), and don't list it in dependency arrays. It replaces the old "store the latest callback in a ref" trick.

> 🧠 **Remember:** inside an effect, **reactive** values go in the dependency array; **"just read the latest"** values go in a `useEffectEvent`.

Also in 19.2: **Performance tracks** in Chrome DevTools (see React's scheduler and component renders in the Performance panel), `cacheSignal` for Server Components, and partial pre-rendering APIs used by frameworks.

---

<a name="interview"></a>
# 11. Interview Q&A

### Q: "What are Actions in React 19?"
> *"Async functions run inside a transition, which React tracks for pending state, errors and optimistic updates. You can pass one as a form's `action` — React calls it with the FormData and resets the form on success — and hooks like `useActionState`, `useFormStatus` and `useOptimistic` build on that, removing the hand-written isPending/error boilerplate."*

### Q: "What does `useActionState` return?"
> *"`[state, formAction, isPending]`. You give it a function that receives the previous state and the FormData and returns the new state — typically an error or success message — plus an initial state. You pass `formAction` to the form's `action`. It also works with Server Functions, which makes forms work before JavaScript loads."*

### Q: "How do you do an optimistic update in React 19?"
> *"`useOptimistic(realValue, applyFn)` gives an optimistic value and a setter. Inside an action I call the setter so the UI updates immediately, then await the real request. When the action finishes, React goes back to the real value — so a failure automatically undoes the optimistic change."*

### Q: "What is `use()`, and how is it different from hooks?"
> *"It reads a promise — suspending until it resolves and throwing to an error boundary if it rejects — or a context. Unlike hooks it can be called conditionally. The promise has to be stable and created outside the component, typically by a Server Component or a cache; creating it during render causes an infinite loop."*

### Q: "Is `forwardRef` still needed?"
> *"Not in React 19 — `ref` is a normal prop for function components. It's not formally deprecated yet, but that's planned. Ref callbacks can now also return a cleanup function."*

### Q: "What does `<Activity>` do?"
> *"It hides part of the tree without unmounting it — state is preserved, effects are cleaned up while hidden, and updates inside are low priority. Good for tabs that keep their state or pre-rendering the next screen. Conditional rendering destroys state; CSS hiding keeps effects running; Activity is in between."*

### Q: "What problem does `useEffectEvent` solve?"
> *"Reading the latest value of a prop or state inside an effect without making the effect re-run when it changes — for example, the current theme inside a 'connected' callback, without reconnecting the chat when the theme changes. It replaces the latest-value-in-a-ref workaround."*

---

<a name="cheatsheet"></a>
# 12. Cheat Sheet

```
ACTION = async fn in a transition → React tracks pending / errors / optimistic
startTransition(async () => …) works in 19 (isPending until it finishes)

<form action={fn}>         fn(formData) · no preventDefault · resets uncontrolled fields on success
useActionState(fn, init)   → [state, formAction, isPending] · fn(prevState, formData)
useFormStatus()            (react-dom) → { pending, data } of the PARENT form · use in a child
useOptimistic(value, fn)   → [optimistic, addOptimistic] · call inside an action · auto-undo on finish
use(promise | context)     suspends / reads context · CAN be conditional
                           promise must be STABLE (from server/cache/parent), not created in render

ref is a normal prop (forwardRef not needed; deprecation planned) · ref callbacks return cleanup
<Context value> = provider · <title>/<meta> in components → <head> · preload/preinit
REMOVED: ReactDOM.render, findDOMNode, string refs, legacy context, propTypes/defaultProps on fn comps
upgrade path: 18.3 (warnings) → codemod → 19

19.2: <Activity mode="visible|hidden"> = hide, keep state, pause effects
      useEffectEvent(fn) = latest values inside effects without re-running them
      DevTools performance tracks · partial pre-rendering (frameworks)
```

---

## Connects to

- **[Part 7 — Hooks](07-hooks.md):** `useTransition` (async transitions are the base of Actions), `forwardRef`, stale closures (`useEffectEvent`).
- **[Part 14 — Server Components & Next.js](14-server-components-and-nextjs.md):** Server Functions as form actions, `use()` with server promises.
- **[Part 16 — Forms](16-forms.md):** when to use form actions vs React Hook Form.
- **[Part 6 — Lifecycle](06-lifecycle.md):** error boundaries and the new root error callbacks.

## Suggested next topics

1. **Server Components & Next.js** — where Actions and `use()` are most at home.
2. **Forms** — form actions vs React Hook Form + zod.
