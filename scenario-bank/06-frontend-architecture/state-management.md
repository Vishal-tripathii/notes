# Frontend State Management — Scenario Bank

---

### "Local state vs global state? When should state go into Redux/Zustand/etc.?"

**Local state** lives in one component and nothing outside it needs to know about it — an input's current value, whether a dropdown is open, a modal's visibility. It should stay local; lifting it up "just in case" adds indirection with no benefit.

**Global state** is needed by multiple, often distant/unrelated parts of the component tree — the logged-in user, a shopping cart, app-wide theme/settings. The test isn't "is this important data," it's **"do two or more components that aren't parent/child of each other need to read or change this?"**

The escalation path, roughly: component state → lift to a shared parent (if it's just parent + a couple of children) → React Context or a lightweight store like Zustand (if it's genuinely spread across distant parts of the tree) → Redux specifically once you need its particular tooling — time-travel debugging, a strict unidirectional action/reducer pattern for a large team, middleware for complex async flows. Redux is a heavier commitment than most apps actually need; a lot of "we need Redux" turns out to be solved by Context or a simpler store.

**Interview line:** *"The test isn't how important the data is, it's whether two components that aren't parent-child need it. I start local, lift to a shared parent if it's nearby, and only reach for a global store — Context, Zustand, or Redux — once state is genuinely spread across distant parts of the tree. Redux specifically I'd reserve for when I actually need its tooling, not as a default."*

**Tests:** state placement judgment, over-engineering avoidance

*Axis: normal · Source: challenge question*

---

### "Server state vs client state? Why use React Query/SWR?"

**Client state** is state that only exists in the browser and that your application fully owns — a form's current input values, whether a sidebar is collapsed, a wizard's current step. Nobody else changes it out from under you.

**Server state** is a local *copy* of data that actually lives on the server and can change independently of your app — a list of orders, a user's profile. This is fundamentally different from client state because it can go **stale** (someone else changed it on the server), needs to be **fetched asynchronously** (loading/error states), and often needs to be **shared** across multiple components without literally being your app's own state.

Treating server state like client state (just `useState` + a `useEffect` fetch) means hand-rolling: loading/error states, avoiding duplicate fetches when two components want the same data, re-fetching on window refocus, caching, and background refresh — all real, recurring problems. **React Query/SWR** exist specifically to solve exactly this class of problem, out of the box: caching by query key, deduplication of simultaneous identical requests, automatic background refetching, and built-in loading/error states — instead of every team re-inventing a worse version of the same thing.

**Interview line:** *"Client state is fully owned by the app — a form value, a UI toggle. Server state is a cached copy of something that lives on the server and can go stale independently — that needs fetching, loading/error handling, deduplication, and refresh logic that plain useState doesn't give you. React Query and SWR exist specifically to solve that class of problem instead of everyone hand-rolling a worse version of the same caching layer."*

**Tests:** server state vs client state, why dedicated libraries exist

*Axis: normal · Source: challenge question*

---

### "How do you prevent unnecessary re-renders? How do you debug excessive rendering?"

**Preventing:**
- **Memoize expensive children** — `React.memo` on a component skips its re-render if its props haven't actually changed, but this only helps if the props really are stable — a new inline object/array/function literal passed as a prop (`onClick={() => ...}`) is a *new reference* every render, defeating the memoization entirely.
- **Memoize the values/functions themselves** — `useMemo` for an expensive computed value, `useCallback` for a function passed down as a prop, so the reference stays stable across renders when its dependencies haven't changed.
- **Split state so unrelated updates don't share a re-render** — if one piece of state changing forces a big component (and everything under it) to re-render, consider splitting that state into a separate, smaller component so only the part that actually depends on it re-renders.
- **Push state down** — if state is only used by a small part of the tree, keep it declared there rather than in a shared ancestor that re-renders everything below it.

**Debugging:** React DevTools' **Profiler** tab records a render pass and shows exactly which components rendered and why (it can highlight "why did this render" — new props, new state, parent re-rendered). That's the actual tool — don't guess by reading code; measure.

**Interview line:** *"I'd first measure with React DevTools' Profiler to see exactly which components are re-rendering and why, rather than guessing. The usual fixes are React.memo on expensive children combined with useMemo/useCallback so their props actually stay referentially stable — memoizing a component whose props include a fresh inline function every render doesn't help at all — and splitting state so an unrelated update doesn't force a big shared subtree to re-render."*

**Tests:** re-render optimization, profiling tools

*Axis: performance · Source: challenge question*

---

### "What causes stale state?"

Stale state means the value you're reading is out of date relative to what it should be — a few common, specific causes:

- **Stale closures** — a function (an event handler, a `useEffect` callback, a `setTimeout`) captured a state variable's value at the time it was *created*, and that value doesn't update even though state has since changed, because the closure is still holding the old reference. Classic case: a `setInterval` callback set up once in a `useEffect` with an empty dependency array, referencing a state value that's changed several times since — the callback still sees the original value forever.
- **Missing `useEffect` dependencies** — an effect that reads a value but doesn't list it in its dependency array won't re-run when that value changes, so it keeps acting on the old one.
- **Not using the functional form of a state updater** — `setCount(count + 1)` inside code that runs multiple times before a re-render (e.g. two rapid calls) can both read the same stale `count`, whereas `setCount(c => c + 1)` always operates on the actual latest value.
- **Server state that hasn't been refetched or invalidated** after a mutation — the UI is showing what it fetched a while ago, and nothing told it to go get the current value.

```js
// stale: `count` is captured once when the effect runs
useEffect(() => {
  const id = setInterval(() => console.log(count), 1000); // always logs the initial value
  return () => clearInterval(id);
}, []);
```

**Interview line:** *"Most stale state I've hit traces back to a stale closure — a callback capturing a state value at creation time that never updates, classically a setInterval or effect with a missing dependency. The fix is usually either the functional updater form for state, or making sure the effect's dependency array actually includes everything it reads."*

**Tests:** stale closures, React state pitfalls

*Axis: normal · Source: challenge question*

---

### "How do you handle optimistic updates? What happens if an optimistic update fails?"

An optimistic update means updating the UI **immediately**, as if the server request already succeeded, before the server has actually confirmed it — so the user sees instant feedback (a "like" button filling in immediately) instead of waiting for a round trip. This makes the app feel dramatically faster for actions that usually succeed.

The part that has to be designed deliberately is the failure path: if the actual server request comes back with an error, the UI is now showing something that **never really happened**, and it needs to be corrected —
1. **Snapshot the previous state** before applying the optimistic change, so there's something to roll back to.
2. Apply the update immediately, optimistically.
3. Fire the real request.
4. On success — nothing further needed, the optimistic state already matches reality.
5. On failure — **roll back** to the snapshot, and surface the failure to the user (a toast, an inline error) so they understand their action didn't actually stick — silently reverting with no explanation is confusing.

```js
const previous = items;
setItems(optimisticallyUpdated); // update UI immediately
try {
  await api.update(item);
} catch {
  setItems(previous); // roll back
  showError("Update failed — please try again");
}
```

This connects directly to idempotency and retries (category 01) — if the "real request" is retried after a failure, it needs the same safety guarantees as any other retried write.

**Interview line:** *"I update the UI immediately for instant feedback, but I keep a snapshot of the prior state before doing so. If the real request fails, I roll back to that snapshot and surface the failure explicitly — silently reverting with no explanation is worse than not doing an optimistic update at all. And if that request gets retried, it needs the same idempotency guarantees as any other retried write."*

**Tests:** optimistic UI, rollback design

*Axis: failure · Source: challenge question*

---
