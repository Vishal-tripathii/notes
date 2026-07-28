# React Study Notes — Part 6

## Component Lifecycle (Mounting, Updating, Unmounting, Error Handling, Class → Hooks Mapping)

> **Format:** Conceptual **"how it works"** notes, fresh-start friendly — every term translated, nothing assumed. Follows the 14-question framework (what / why / how internally / when to use / when to avoid / pros / cons / performance / common mistakes / interview Qs / code examples / advanced / quick revision).
>
> **Roadmap:** the roadmap's "Part 3 — Component Lifecycle".
>
> **Continues:** [Part 1 — Fundamentals](01-react-fundamentals.md) · [Part 2 — Components](02-components.md) · [Part 3 — JSX](03-jsx-deep-dive.md) · [Part 4 — Props](04-props.md) · [Part 5 — State](05-state.md).

---

## Table of Contents

1. [What "lifecycle" means + the two phases](#phases)
2. [Mounting](#mounting)
3. [Updating](#updating)
4. [Unmounting](#unmounting)
5. [Error Handling — Error Boundaries](#errors)
6. [Mapping Class Lifecycle to Hooks](#hooks)
7. [The deprecated `will` methods](#deprecated)
8. [Interview questions & answers](#interview)
9. [Quick revision cheat sheet](#cheatsheet)

---

<a name="phases"></a>
# 1. What "lifecycle" means

Every component goes through three stages:

```
MOUNTING          UPDATING                    UNMOUNTING
"being born"      "changing" (repeatedly)     "being removed"
   ↓                  ↓                            ↓
appears on     props or state change,        removed from the DOM
the screen     re-renders                    (navigate away, hide, delete)
```

**Lifecycle methods are hooks into those moments** — "run this right after I appear," "run this right before I'm removed."

## The two phases React actually has

Understand this split first — it explains *why* each method exists and why several were deprecated:

```
┌─────────────────── RENDER PHASE ───────────────────┐
│  React figures out WHAT should change              │
│  · calls your render()/component function          │
│  · builds the new virtual DOM, diffs it            │
│  · NO DOM touched yet                              │
│  ⚠️ can be PAUSED, ABORTED, or RESTARTED           │
│  ⚠️ must be PURE — no side effects allowed         │
│  constructor · getDerivedStateFromProps            │
│  · shouldComponentUpdate · render                  │
└────────────────────────────────────────────────────┘
                        ↓
┌─────────────────── COMMIT PHASE ───────────────────┐
│  React APPLIES the changes to the real DOM         │
│  · runs synchronously, cannot be interrupted       │
│  · DOM now exists and is up to date                │
│  ✅ side effects are safe here                     │
│  getSnapshotBeforeUpdate · componentDidMount       │
│  · componentDidUpdate · componentWillUnmount       │
└────────────────────────────────────────────────────┘
```

**Every "did" method runs in the commit phase** — which is why fetching and subscriptions belong in `componentDidMount`, not `render`.

> **Memory aid:** `will` = before (render phase, dangerous) · `did` = after (commit phase, safe).

---

<a name="mounting"></a>
# 2. Mounting

The first time a component appears.

```
constructor()
     ↓
static getDerivedStateFromProps()
     ↓
render()
     ↓
   [ React commits to the real DOM ]
     ↓
componentDidMount()
```

## `constructor(props)`

Runs **once**, before anything else. Two jobs only: initialize state, bind methods.

```jsx
constructor(props) {
  super(props);                                    // MUST be first
  this.state = { count: 0 };                       // the ONLY place to assign state directly
  this.handleClick = this.handleClick.bind(this);
}
```

**Why `super(props)` is mandatory:** without it `this` doesn't exist yet (a JS class rule), and `this.props` would be `undefined` inside the constructor.

**Never do here:** side effects, fetching, subscriptions, `setState`. The component isn't on screen yet — there's nothing to update, and the render phase can restart.

You can **skip the constructor entirely** with class fields:

```jsx
class Counter extends React.Component {
  state = { count: 0 };                     // no constructor needed
  handleClick = () => { ... };              // arrow = auto-bound
}
```

## `static getDerivedStateFromProps(props, state)`

The strangest one. Runs **before every render** — on mount *and* every update, including updates caused by `setState`.

```jsx
static getDerivedStateFromProps(props, state) {
  if (props.userId !== state.prevUserId) {
    return { prevUserId: props.userId, data: null };   // merged into state
  }
  return null;                                          // null = change nothing
}
```

- **`static`** → no `this`. It cannot read `this.props` or call `this.setState`. Deliberately: it must be pure.
- Returns an **object** (shallow-merged into state) or **`null`** (no change).

**When you'd use it:** state must change in response to a prop change — e.g. reset internal data when `userId` changes.

⚠️ **It's rare and usually the wrong tool.** React's own docs call it an escape hatch. The modern answers: derive the value during render, or reset with `key={userId}`. If you're reaching for it, question the design.

## `render()`

The only **required** method. Reads `this.props` and `this.state`, returns JSX.

**Must be pure:** no `setState` (infinite loop), no fetching, no DOM manipulation, no timers. It can be called and its result discarded.

## `componentDidMount()`

Runs **once**, immediately after the component is in the real DOM. **This is where side effects go.**

```jsx
componentDidMount() {
  fetch(`/api/users/${this.props.id}`)               // ✅ data fetching
    .then(r => r.json())
    .then(user => this.setState({ user }));

  this.timer = setInterval(this.tick, 1000);         // ✅ timers
  window.addEventListener("resize", this.onResize);  // ✅ subscriptions
  this.chart = new Chart(this.canvasRef.current);    // ✅ libs needing a real DOM node
}
```

**Why here and not the constructor?** The DOM node exists now — you can measure it, attach a library to it, and `setState` will correctly trigger a re-render.

⚠️ **`setState` here causes a second render before the browser paints.** React flushes it synchronously so the user never sees the intermediate state — no flicker, but two renders. Fine for loading→data; avoid for anything computable up front.

---

<a name="updating"></a>
# 3. Updating

Runs on every re-render — triggered by new props, `setState`, or a parent re-rendering.

```
static getDerivedStateFromProps()
     ↓
shouldComponentUpdate()  →  false ──► STOP, no re-render
     ↓ true
render()
     ↓
getSnapshotBeforeUpdate()
     ↓
   [ React commits to the real DOM ]
     ↓
componentDidUpdate()
```

## `shouldComponentUpdate(nextProps, nextState)`

**Return `false` to skip the re-render entirely** — this component and its whole subtree.

```jsx
shouldComponentUpdate(nextProps, nextState) {
  return nextProps.value !== this.props.value;   // only re-render if value changed
}
```

The **only** lifecycle method that exists purely for performance. `React.PureComponent` implements it for you with a shallow props+state comparison — exactly what `React.memo` does for functions ([Part 2 §3](02-components.md)).

⚠️ **Easy to get wrong.** Return `false` when something *did* change and you get a stale UI that's very hard to debug. Prefer `PureComponent` / `React.memo` over hand-written comparisons.

## `render()`

Same as mounting. Pure.

## `getSnapshotBeforeUpdate(prevProps, prevState)`

The one nobody remembers, and the one with the most elegant purpose.

Runs **after render but before the DOM is updated** — the last moment the *old* DOM still exists. Whatever it returns is passed as the **third argument** to `componentDidUpdate`.

```jsx
getSnapshotBeforeUpdate(prevProps, prevState) {
  if (prevProps.messages.length < this.props.messages.length) {
    const list = this.listRef.current;
    return list.scrollHeight - list.scrollTop;   // capture BEFORE the new DOM lands
  }
  return null;
}

componentDidUpdate(prevProps, prevState, snapshot) {
  if (snapshot !== null) {
    const list = this.listRef.current;
    list.scrollTop = list.scrollHeight - snapshot;   // restore scroll position
  }
}
```

**The classic use case:** a chat window. New messages arrive at the top; without this the user's scroll position jumps. Capture the measurement before the DOM changes, restore it after.

Why a separate method? Between `render()` and the commit there is no other moment to read the old DOM — React may already have discarded it by the time `componentDidUpdate` runs.

## `componentDidUpdate(prevProps, prevState, snapshot)`

Runs after every update (**not** after the initial mount — that's `componentDidMount`). The DOM is up to date.

```jsx
componentDidUpdate(prevProps) {
  if (prevProps.userId !== this.props.userId) {    // ⚠️ THE GUARD IS MANDATORY
    this.fetchUser(this.props.userId);
  }
}
```

## 🔥 The infinite-loop trap

```jsx
componentDidUpdate() {
  this.setState({ count: this.state.count + 1 });   // ❌ update → didUpdate → update → …
}
```

**`setState` here is only safe inside a condition** that eventually becomes false. The single most common class-component bug — and the exact same bug as a `useEffect` with a missing dependency array.

---

<a name="unmounting"></a>
# 4. Unmounting

## `componentWillUnmount()`

Runs **immediately before** the component is removed from the DOM. **Cleanup only.**

```jsx
componentWillUnmount() {
  clearInterval(this.timer);                            // ✅ stop timers
  window.removeEventListener("resize", this.onResize);  // ✅ remove listeners
  this.subscription.unsubscribe();                      // ✅ close subscriptions
  this.controller.abort();                              // ✅ cancel in-flight requests
}
```

**Never `setState` here** — the component is going away; React warns and nothing happens.

## Why cleanup matters — memory leaks

Every subscription you don't clean up keeps a reference to a dead component:

```
mount   → addEventListener(resize, handler)
unmount → (no cleanup)
        → the browser STILL holds `handler`
        → `handler` closes over the component
        → the component can never be garbage collected
        → navigate back and forth 50 times = 50 zombie listeners, all firing
```

Symptom: *"Can't perform a React state update on an unmounted component"* — a listener fired and called `setState` on something that no longer exists.

> **The rule: every subscribe needs an unsubscribe.**

---

<a name="errors"></a>
# 5. Error Handling — Error Boundaries

**A component that catches JavaScript errors in its child tree and renders a fallback instead of crashing the whole app.**

Without one, an error anywhere unmounts your **entire React tree** — the user gets a blank white page. That's a deliberate React 16 decision: a corrupted UI is worse than no UI.

```jsx
class ErrorBoundary extends React.Component {
  state = { hasError: false };

  // RENDER phase — pure. Return new state to show the fallback.
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  // COMMIT phase — side effects allowed. Log it.
  componentDidCatch(error, errorInfo) {
    logToSentry(error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) return <h1>Something went wrong.</h1>;
    return this.props.children;
  }
}

<ErrorBoundary>
  <Dashboard />
</ErrorBoundary>
```

## Why two methods?

| | `getDerivedStateFromError` | `componentDidCatch` |
|---|---|---|
| Phase | render (pure) | commit (effects OK) |
| Purpose | **update state** → show fallback | **side effects** → log, report |
| `static`? | yes — no `this` | no |
| Gets | `error` | `error` + `errorInfo.componentStack` |

The split exists because the render phase must stay pure for concurrent rendering, but logging is a side effect. One method decides *what to show*; the other *reports what happened*.

## ⚠️ What error boundaries do NOT catch

```jsx
onClick={() => { throw new Error("boom"); }}   // ❌ event handlers
setTimeout(() => { throw new Error("boom"); }) // ❌ async code
fetch(...).then(() => { throw ... })           // ❌ promises
// ❌ server-side rendering
// ❌ errors thrown inside the boundary itself
```

**Why:** boundaries hook into the render/commit pipeline. Event handlers and async callbacks run *outside* it — React isn't on the call stack, so it can't intercept.

For those, use ordinary `try/catch` and put the error into state:

```jsx
async function handleClick() {
  try { await save(); }
  catch (e) { setError(e); }     // now render shows it
}
```

## Practical notes

- **Granularity matters.** One boundary at the root = still a full-page fallback. Wrap risky sections individually so one broken widget doesn't take down the page.
- **Add a reset.** A "Try again" button that clears `hasError`, often keyed so the subtree remounts.
- **Still class-only.** No hook equivalent. The standard solution is the **`react-error-boundary`** package, which wraps a class and gives a clean hooks-friendly API.

---

<a name="hooks"></a>
# 6. Mapping Class Lifecycle to Hooks

The table interviewers actually want.

| Class | Hook equivalent |
|---|---|
| `constructor` (init state) | `useState(initial)` / `useState(() => init())` |
| `componentDidMount` | `useEffect(() => {...}, [])` |
| `componentDidUpdate` | `useEffect(() => {...}, [dep])` |
| both mount + update | `useEffect(() => {...})` — no dep array |
| `componentWillUnmount` | the **return function** from `useEffect` |
| `shouldComponentUpdate` | `React.memo(Component)` |
| `getDerivedStateFromProps` | derive during render, or `key={x}` to reset |
| `getSnapshotBeforeUpdate` | `useLayoutEffect` |
| `getDerivedStateFromError` | ❌ **no hook** — still needs a class |
| `componentDidCatch` | ❌ **no hook** — still needs a class |
| `this.state` | `useState` |
| `forceUpdate` | `useReducer(x => x + 1, 0)` |

## The dependency array is the whole story

```jsx
useEffect(() => { ... });              // EVERY render        (didMount + didUpdate)
useEffect(() => { ... }, []);          // ONCE on mount       (didMount)
useEffect(() => { ... }, [userId]);    // mount + when userId changes
useEffect(() => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);      // ← cleanup           (willUnmount)
}, []);
```

## 🔑 Cleanup is not only "unmount"

The biggest conceptual difference — and where the class mental model misleads people.

**The cleanup function runs before EVERY re-run of the effect, not just on unmount.**

```jsx
useEffect(() => {
  const sub = subscribe(roomId);
  return () => sub.unsubscribe();
}, [roomId]);
```

```
roomId "a"   → subscribe("a")
roomId → "b" → unsubscribe("a")   ← cleanup runs FIRST
             → subscribe("b")
unmount      → unsubscribe("b")
```

In a class you'd need three methods (`componentDidMount`, `componentDidUpdate` with a guard, `componentWillUnmount`) to get this right, and people routinely forgot the middle one — leaking the old subscription.

**`useEffect` reframes the problem:** don't think "when does this run," think **"what is this effect synchronizing with, and how do I undo it."** Setup and teardown live side by side, so they can't drift apart.

## ⚠️ The timing difference nobody mentions

`componentDidMount` runs **before** the browser paints. `useEffect` runs **after** it paints.

```
class:  render → DOM update → componentDidMount → PAINT
hooks:  render → DOM update → PAINT → useEffect
```

Usually better — the user sees content sooner. But if your effect **measures or mutates the DOM visually**, the user sees a flash of the wrong layout first:

```jsx
useEffect(() => {
  el.style.left = measure() + "px";     // ⚠️ user may see it jump
});

useLayoutEffect(() => {
  el.style.left = measure() + "px";     // ✅ runs BEFORE paint — no flash
});
```

**`useLayoutEffect` is the true timing equivalent of `componentDidMount`/`componentDidUpdate`.** It blocks paint, so use it only for DOM measurement and synchronous visual fixes.

## The complete side-by-side

```jsx
// ══════════ CLASS ══════════
class Chat extends React.Component {
  state = { messages: [] };

  componentDidMount() {
    this.sub = subscribe(this.props.roomId, this.onMessage);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.roomId !== this.props.roomId) {   // easy to forget
      this.sub.unsubscribe();                       // easy to forget
      this.sub = subscribe(this.props.roomId, this.onMessage);
    }
  }

  componentWillUnmount() {
    this.sub.unsubscribe();
  }

  render() { return <List items={this.state.messages} />; }
}

// ══════════ HOOKS ══════════
function Chat({ roomId }) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const sub = subscribe(roomId, msg => setMessages(m => [...m, msg]));
    return () => sub.unsubscribe();
  }, [roomId]);        // ← handles mount, roomId change, AND unmount

  return <List items={messages} />;
}
```

Three methods and two forgettable lines collapse into one effect where **setup and cleanup can't get out of sync.** That's the argument for hooks in a nutshell.

## ⚠️ Strict Mode double-invocation (React 18 dev)

In development, `<StrictMode>` deliberately **mounts, unmounts and remounts** every component — so every effect runs **twice**:

```
setup → cleanup → setup
```

**This is not a bug.** It's React surfacing missing cleanup: an effect that isn't properly reversible will visibly misbehave (two subscriptions, a doubled counter). It doesn't happen in production. If double-invocation breaks your effect, your effect has a real bug.

---

<a name="deprecated"></a>
# 7. The deprecated `will` methods (interview bonus)

Three methods were deprecated in React 16.3 and renamed with an `UNSAFE_` prefix:

```
componentWillMount          → UNSAFE_componentWillMount
componentWillReceiveProps   → UNSAFE_componentWillReceiveProps
componentWillUpdate         → UNSAFE_componentWillUpdate
```

**Why:** they run in the **render phase**, which React can now **pause, abort and restart** for concurrent rendering. A method that starts a fetch or a subscription could run two or three times for a single actual update — duplicate requests, duplicated subscriptions, memory leaks.

The replacements are safe by construction:

| Deprecated | Replacement | Why it's safe |
|---|---|---|
| `componentWillMount` | `componentDidMount` | commit phase — runs exactly once |
| `componentWillReceiveProps` | `getDerivedStateFromProps` or `componentDidUpdate` | static and pure, or commit phase |
| `componentWillUpdate` | `getSnapshotBeforeUpdate` | runs once, right before commit |

> **Interview line:** *"The `will` methods were deprecated because they run in the render phase, which concurrent React can interrupt and restart. Side effects there could execute multiple times per update. The replacements are either static and pure, or moved into the commit phase, which runs exactly once and can't be interrupted."*

---

<a name="interview"></a>
# 8. Interview questions & answers

### Q: "Walk me through the class component lifecycle."
> *"Three phases. Mounting: `constructor` initializes state, then `getDerivedStateFromProps`, then `render`, then React commits to the DOM, then `componentDidMount` — where side effects like fetching and subscriptions go. Updating: `getDerivedStateFromProps`, then `shouldComponentUpdate` which can cancel the render, then `render`, then `getSnapshotBeforeUpdate` to capture DOM info before it changes, then `componentDidUpdate`. Unmounting: `componentWillUnmount` for cleanup. Plus `getDerivedStateFromError` and `componentDidCatch` for error boundaries."*

### Q: "Why does side-effect code go in `componentDidMount` rather than `render` or the constructor?"
> *"Because `render` and the constructor are in the render phase, which must be pure and which React can pause, abort or restart — a fetch there could fire multiple times. `componentDidMount` is in the commit phase: it runs exactly once, the DOM node exists so you can measure it or attach libraries, and `setState` there correctly triggers a re-render."*

### Q: "What's the difference between the render phase and the commit phase?"
> *"The render phase computes what should change — it calls your component, builds the virtual DOM and diffs. It's pure and interruptible. The commit phase applies the result to the real DOM and runs synchronously. That's why every 'did' method is safe for side effects and every render-phase method must be pure."*

### Q: "What is `getDerivedStateFromProps` and when would you use it?"
> *"A static method that runs before every render and returns an object to merge into state, or null. It's static so it has no access to `this` — it can't read props or call setState, which keeps it pure. You'd use it when state must reset in response to a prop change. In practice it's rarely the right answer: usually you should derive the value during render, or remount with a `key`."*

### Q: "What is `getSnapshotBeforeUpdate` for?"
> *"It runs after render but before the DOM is committed — the last moment the old DOM still exists. Whatever it returns is passed as the third argument to `componentDidUpdate`. The classic use is preserving scroll position in a chat window when messages are prepended: you measure `scrollHeight - scrollTop` before the update and restore it after."*

### Q: "Why do you need a condition inside `componentDidUpdate`?"
> *"Because calling `setState` unconditionally there triggers another update, which calls `componentDidUpdate` again — an infinite loop. You compare `prevProps` or `prevState` with the current values and only act when the thing you care about actually changed. It's the same class of bug as a `useEffect` with no dependency array."*

### Q: "What happens if you forget `componentWillUnmount` cleanup?"
> *"Memory leaks. Timers keep firing, event listeners stay registered, and subscriptions keep pushing data to a component that no longer exists. Because those callbacks close over the component, it can never be garbage collected — navigate back and forth and you accumulate zombie listeners. The visible symptom is the warning about setting state on an unmounted component."*

### Q: "What are error boundaries and what can't they catch?"
> *"A class component with `getDerivedStateFromError` and/or `componentDidCatch` that catches errors in its child tree and renders a fallback instead of unmounting the whole app. It can't catch errors in event handlers, async code like `setTimeout` or promise callbacks, server-side rendering, or errors thrown in the boundary itself — those run outside React's render pipeline, so React isn't on the call stack to intercept them. Use try/catch and put the error into state for those."*

### Q: "Why does an error boundary need two methods?"
> *"`getDerivedStateFromError` is static and runs in the render phase, so it must be pure — its only job is returning state to render the fallback. `componentDidCatch` runs in the commit phase where side effects are allowed, so that's where you log to a service. One decides what to show; the other reports what happened."*

### Q: "Why were `componentWillMount` and friends deprecated?"
> *"They run in the render phase, which concurrent React can interrupt and restart. Side effects started there could run several times for one logical update, causing duplicate requests and leaked subscriptions. The replacements are either static and pure, like `getDerivedStateFromProps`, or moved into the commit phase, which runs exactly once."*

### Q: "Map the lifecycle to hooks."
> *"`componentDidMount` is `useEffect` with an empty dependency array. `componentDidUpdate` is `useEffect` with dependencies. `componentWillUnmount` is the function you return from `useEffect`. `shouldComponentUpdate` is `React.memo`. `getSnapshotBeforeUpdate` is `useLayoutEffect`. `getDerivedStateFromProps` is usually replaced by deriving during render or resetting with a `key`. Error boundaries have no hook equivalent and still require a class."*

### Q: "Is `useEffect(() => {}, [])` exactly `componentDidMount`?"
> *"Functionally close, but the timing differs: `componentDidMount` runs before the browser paints, `useEffect` runs after. That's usually better because the user sees content sooner, but if the effect measures or visually adjusts the DOM you get a flash of the wrong layout. `useLayoutEffect` is the true equivalent — it runs before paint, at the cost of blocking it."*

### Q: "How is `useEffect` cleanup different from `componentWillUnmount`?"
> *"Cleanup runs before every re-run of the effect, not just on unmount. If a subscription depends on `roomId`, changing it unsubscribes from the old room before subscribing to the new one, automatically. A class needed three coordinated methods to do that, and people routinely forgot the update case and leaked the old subscription. Hooks put setup and teardown next to each other so they can't drift apart."*

### Q: "Why do my effects run twice in development?"
> *"React 18 Strict Mode intentionally mounts, unmounts and remounts each component in development so every effect runs setup, cleanup, setup. It's a test: an effect that isn't properly reversible will visibly misbehave. It doesn't happen in production, and if it breaks something, the effect has a real cleanup bug."*

---

<a name="cheatsheet"></a>
# 9. Quick revision cheat sheet

```
TWO PHASES
  RENDER   pure · interruptible · NO side effects · no DOM yet
           constructor · getDerivedStateFromProps · shouldComponentUpdate · render
  COMMIT   synchronous · uninterruptible · DOM exists · side effects OK
           getSnapshotBeforeUpdate · componentDidMount/Update/WillUnmount
  "will = before (dangerous) · did = after (safe)"

MOUNTING   constructor → getDerivedStateFromProps → render → [COMMIT] → componentDidMount
  constructor              super(props) FIRST · init state · bind · NO side effects
  getDerivedStateFromProps static (no `this`) · returns object|null · RARELY needed
  render                   REQUIRED · pure · no setState
  componentDidMount        ✅ fetch · timers · subscriptions · 3rd-party libs
                           runs BEFORE paint

UPDATING   gDSFP → shouldComponentUpdate → render → getSnapshotBeforeUpdate
           → [COMMIT] → componentDidUpdate
  shouldComponentUpdate   return false = skip render (+ subtree)
                          PureComponent does it for you (shallow compare)
  getSnapshotBeforeUpdate reads the OLD DOM · return value → 3rd arg of didUpdate
                          classic use: preserve scroll position in a chat
  componentDidUpdate(prevProps, prevState, snapshot)
                          🔥 ALWAYS guard with a condition or → INFINITE LOOP

UNMOUNTING componentWillUnmount — cleanup ONLY, never setState
           clearInterval · removeEventListener · unsubscribe · abort()
           forget it → memory leak + "setState on unmounted component"
           RULE: every subscribe needs an unsubscribe

ERRORS     static getDerivedStateFromError(err) → render phase, pure → fallback state
           componentDidCatch(err, info)         → commit phase → LOG it
           ❌ does NOT catch: event handlers · async/setTimeout · promises
                              · SSR · errors in the boundary itself
              → those need try/catch + setState
           still CLASS-ONLY (use the react-error-boundary package)
           wrap sections, not just the root

DEPRECATED componentWillMount / WillReceiveProps / WillUpdate → UNSAFE_*
           why: render phase can be paused/restarted → side effects run many times

HOOK MAP   constructor              → useState / useState(() => init)
           componentDidMount        → useEffect(fn, [])
           componentDidUpdate       → useEffect(fn, [dep])
           both                     → useEffect(fn)          (no array)
           componentWillUnmount     → return () => {} from useEffect
           shouldComponentUpdate    → React.memo
           getDerivedStateFromProps → derive during render, or key={x} to reset
           getSnapshotBeforeUpdate  → useLayoutEffect
           error boundary           → ❌ no hook — class required
           forceUpdate              → useReducer(x => x+1, 0)

⚠️ TIMING   componentDidMount = BEFORE paint · useEffect = AFTER paint
            visual DOM work → useLayoutEffect (blocks paint, no flash)

🔑 CLEANUP  runs before EVERY re-run, not only on unmount
            roomId a→b:  unsubscribe(a) → subscribe(b)
            classes needed 3 methods for this and people forgot the middle one

STRICT MODE React 18 dev: setup → cleanup → setup (effects run twice)
            not a bug — it exposes missing cleanup. Production runs once.
```

---

## Connects to

- **[Part 2 — Components](02-components.md):** classes and why hooks replaced them; `shouldComponentUpdate` is `PureComponent`/`React.memo` (§3 there); error boundaries are the last class-only feature.
- **[Part 5 — State](05-state.md):** `componentDidUpdate` guards are the same bug class as effect dependency arrays; the "effect whose only job is setState" red flag is derived state.
- **[Part 1 — Fundamentals](01-react-fundamentals.md):** the render → diff → commit pipeline these phases sit inside.
- **Hooks (next):** `useEffect`, `useLayoutEffect`, dependency arrays, cleanup, custom hooks.
- **Rendering internals / Fiber:** why the render phase became interruptible in the first place.
- **Error handling:** boundaries in depth, `react-error-boundary`, fallback strategies.
- **Performance:** `React.memo`, the Profiler, avoiding wasted renders.

## Suggested next topics

1. **Hooks** — recommended next; `useEffect` in depth, the rules of hooks, custom hooks.
2. **Rendering internals / Virtual DOM** — Fiber, reconciliation, concurrent rendering.
3. **Error handling** — boundaries, fallback UI, logging.

*— End of Part 6: Component Lifecycle —*
