# React Internals — Scenario Bank

> "How do stale closures happen?" is covered in [`state-management.md`](state-management.md) under "What causes stale state?" — same root cause, not repeated here.

---

### "What causes a component to re-render?"

Three triggers, and only three:
1. **Its own state changes** (`useState`/`useReducer` setter called).
2. **Its parent re-renders** — by default, a re-rendering parent re-renders *every* child, regardless of whether that child's own props actually changed (this is the one people don't expect — a child with completely unchanged props still re-renders just because its parent did, unless something explicitly prevents it, like `React.memo`).
3. **A context it's subscribed to changes** (`useContext` — every consumer of that context re-renders on any change to the context's value, even if the consumer only cares about part of it).

Note what's *not* on this list: a prop merely being passed down doesn't by itself cause anything — it's specifically state changing (in this component, a context it reads, or a parent) that starts a render, which then cascades to children by default.

**Interview line:** *"There are really only three triggers — a component's own state changing, its parent re-rendering, which cascades to all children by default regardless of whether their props changed, or a context it consumes changing. The one people miss is the parent cascade — a child re-renders just because its parent did, unless something like React.memo explicitly stops that."*

**Tests:** re-render triggers, React rendering model

*Axis: normal · Source: challenge question*

---

### "useMemo vs useCallback? When do memoization techniques hurt performance?"

**`useMemo`** memoizes a **computed value** — re-runs the computation only when its dependencies change, returns the cached value otherwise. Use for something genuinely expensive to (re)compute — sorting/filtering a large list, a heavy calculation.

**`useCallback`** memoizes a **function reference** — returns the *same* function identity across renders as long as its dependencies haven't changed. It doesn't make the function itself faster; its entire purpose is keeping the reference stable so it doesn't defeat downstream memoization — e.g. passing a fresh inline function to a `React.memo`'d child as a prop makes that memoization pointless, since "new function every render" always looks like "changed props" to a reference-equality check.

```js
const sorted = useMemo(() => expensiveSort(items), [items]); // memoize a value
const handleClick = useCallback(() => doThing(id), [id]);    // memoize a reference
```

**When it hurts:** memoization isn't free — it costs memory (holding onto the cached value/dependency array) and a comparison on every render (checking whether dependencies changed). For a cheap computation or a component that rarely re-renders anyway, the memoization overhead can exceed the cost of just recomputing — reaching for `useMemo`/`useCallback` reflexively on everything adds complexity and can make things *slower*, not faster. The right instinct is to profile first, then memoize what's actually shown to be expensive — not memoize preemptively everywhere.

**Interview line:** *"useMemo caches a value, useCallback caches a function reference — and useCallback's whole point is keeping that reference stable so it doesn't break a child's memoization, not making the function itself faster. Both have real overhead — the dependency comparison on every render — so wrapping everything in them by default can actually make things slower for cheap computations. I profile first, then memoize what's actually shown to matter."*

**Tests:** memoization mechanics, premature optimization

*Axis: performance · Source: challenge question*

---

### "How does reconciliation work? What does the key actually do? Why shouldn't array indexes always be used as keys?"

**Reconciliation** is React's process of comparing the new element tree (from the latest render) against the previous one, and computing the minimal set of actual DOM changes needed — instead of throwing away and rebuilding the whole DOM every render, which would be far slower. It's a diffing algorithm with a few key heuristics, one of which is how it matches up items in a list.

For a list, React needs to know "is this the *same* logical item as before, just possibly reordered/updated, or is this a genuinely new item?" — that's exactly what **`key`** tells it. With a stable, unique key per item, React can correctly match "item with key `42`" across renders even if its position in the array changed, and update just that DOM node in place rather than treating it as removed-and-recreated.

**Why array index as key is a problem:** the index is really "this item's current position," not "this item's identity." If the list is reordered, filtered, or has an item inserted/removed from the middle, every item *after* that point now has a different index than before — React thinks those are all different items at those positions and can misapply updates to the wrong DOM nodes (visible as: form inputs retaining the wrong value after a reorder, animations attaching to the wrong item, component state — like an open/closed toggle — sticking to a position rather than following the actual item).

```jsx
// bad: index is positional, not the item's actual identity
{items.map((item, i) => <Row key={i} {...item} />)}
// good: a stable identifier that travels with the item
{items.map(item => <Row key={item.id} {...item} />)}
```

Index-as-key is fine specifically when the list is static and never reorders/filters/inserts — but that's a narrow enough case that defaulting to a real ID is the safer habit.

**Interview line:** *"Reconciliation is React diffing the new tree against the old one to find the minimal DOM changes, and key is how it tells whether a list item is the same logical item across renders versus a new one. Using the array index as key breaks that when the list reorders or filters, because the index is really the item's position, not its identity — React can then misapply state or DOM updates to the wrong item. I use a stable ID unless the list genuinely never reorders."*

**Tests:** reconciliation, key semantics, React rendering pitfalls

*Axis: normal · Source: challenge question*

---

### "Controlled vs uncontrolled components?"

**Controlled** — the form input's value is driven entirely by React state; the DOM input has no memory of its own, it just reflects whatever `value` prop it's given, and every keystroke goes through an `onChange` that updates that state. React is the single source of truth.

```jsx
const [value, setValue] = useState('');
<input value={value} onChange={e => setValue(e.target.value)} />
```

**Uncontrolled** — the DOM manages the input's value itself, the normal way an HTML input works; React reads the current value only when it needs to (e.g. via a `ref`, typically on form submit), rather than tracking every keystroke.

```jsx
const inputRef = useRef();
<input ref={inputRef} defaultValue="" />
// read inputRef.current.value on submit
```

**Trade-off:** controlled gives you real-time access to the value for every render (live validation, conditionally disabling a submit button, formatting as you type), at the cost of a re-render on every keystroke. Uncontrolled is simpler and avoids that per-keystroke re-render, appropriate for a simple form where you only need the value at submit time and don't need to react to it live.

**Interview line:** *"Controlled means React state is the source of truth and drives the input's value on every keystroke — needed for live validation or formatting as you type, at the cost of a re-render per keystroke. Uncontrolled lets the DOM manage its own value and React only reads it via a ref when needed, usually at submit — simpler, and avoids that per-keystroke re-render, for cases where I don't need to react to every change live."*

**Tests:** form input patterns, React vs DOM state ownership

*Axis: normal · Source: challenge question*

---

### "How does React batching work?"

Batching means React groups multiple state updates that happen within the same synchronous block of code into a **single** re-render, instead of re-rendering once per `setState` call.

```js
function handleClick() {
  setCount(c => c + 1);
  setFlag(f => !f);
  // React 18+: batched into ONE re-render, not two, even though two setters were called
}
```

Before React 18, batching only happened automatically inside React event handlers — an update inside a `setTimeout`, a native DOM event listener, or a Promise callback would trigger a separate re-render for *each* `setState` call, un-batched. React 18's **automatic batching** extends this to batch updates everywhere, regardless of where they originate, which removed a common surprise (and a reason people reached for `unstable_batchedUpdates` workarounds pre-18).

Why it matters: without batching, multiple state updates in the same logical operation would each trigger their own render pass — wasted work, and potentially visible as inconsistent intermediate UI states flashing between the updates.

**Interview line:** *"Batching groups multiple state updates in the same tick into one re-render instead of one render per setState call. Before React 18 that only happened automatically inside React's own event handlers — an update inside a setTimeout or a promise callback would render separately for each call. React 18 made batching automatic everywhere, which removed a real source of unnecessary extra renders."*

**Tests:** React 18 batching, render scheduling

*Axis: performance · Source: challenge question*

---

### "Context vs external state management?"

Both let distant components share state without prop drilling, but they behave very differently under the hood, and that difference is the whole reason external stores (Zustand, Redux, Jotai) still exist even though Context is built in.

**Context** — **every** component consuming a context re-renders whenever the context's value changes, even if that specific consumer only cares about one field of a larger value object. There's no built-in way to subscribe to just a slice of it; a context holding `{ user, theme, cart }` means a component that only reads `theme` still re-renders when `cart` changes, unless you split it into multiple separate contexts yourself.

**External stores** (Zustand, Redux with `useSelector`, Jotai/Recoil's atoms) — support **selective subscription**: a component subscribes to a specific slice of the store and only re-renders when *that slice* actually changes, regardless of what else in the store updated. This is a meaningfully different performance characteristic at scale, not just a stylistic preference.

**Rule of thumb:** Context is fine for state that changes rarely and is read broadly (theme, auth/current-user, locale) — the lack of selective subscription rarely matters there. Reach for an external store once state updates frequently and is read by many components that each only care about a slice of it — that's exactly where Context's all-consumers-re-render behavior starts costing real performance.

**Interview line:** *"The real difference isn't API ergonomics, it's that every Context consumer re-renders on any change to the context value, with no built-in way to subscribe to just a slice — while external stores like Zustand support selective subscription, so a component only re-renders when the specific slice it reads actually changes. I use Context for state that changes rarely and is read broadly, like theme or current user, and reach for an external store once state updates frequently and components only care about part of it."*

**Tests:** Context performance characteristics, state library trade-offs

*Axis: performance · Source: challenge question*

---

### "Server Components vs Client Components?"

**Server Components** (React Server Components, the Next.js App Router default) render **only on the server** — they never ship their code to the browser at all, which means: zero JS bundle cost for that component, direct access to server-only resources (query a database, read a file, use a secret API key) without an API layer in between, and the output is just HTML/data sent to the client. The trade-off: no interactivity — no `useState`, no event handlers, no browser APIs — because there's no client-side JS instance of the component to hold that state or respond to events.

**Client Components** (`'use client'`) render on the server for the initial HTML (like normal SSR) **and** ship their JS to the browser to hydrate and become interactive — these are what you reach for whenever a component needs state, effects, event handlers, or browser-only APIs.

The design shift this encourages: push components as far toward Server Components as possible (smaller bundle, more direct data access), and only mark the specific leaf components that genuinely need interactivity as Client Components — rather than the older default of "the whole page is client-side JS."

**Interview line:** *"Server Components render only on the server and never ship JS to the browser at all — zero bundle cost, and direct access to server-only resources like a database, but no interactivity since there's no client-side instance to hold state or handle events. Client Components hydrate and become interactive in the browser, so anything with useState or an event handler needs to be one. The pattern is to default to Server Components and only mark the specific interactive leaves as Client Components, instead of shipping the whole tree as client JS by default."*

**Tests:** React Server Components model, bundle/architecture trade-offs

*Axis: normal · Source: challenge question*

---
