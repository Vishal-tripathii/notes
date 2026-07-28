# React Study Notes — Part 7

## React Hooks ⭐ (Rules, useState, useEffect, useContext, useReducer, useMemo, useCallback, useRef + Additional Hooks)

> **Format:** Conceptual **"how it works"** notes, fresh-start friendly. Every hook is presented as **definition → the problem before it → the code after → what changed → the effects and trade-offs**, so you learn *why* each hook exists, not just its syntax.
>
> **Roadmap:** the roadmap's "Part 4 — React Hooks".
>
> **Continues:** [Part 1 — Fundamentals](01-react-fundamentals.md) · [Part 2 — Components](02-components.md) · [Part 3 — JSX](03-jsx-deep-dive.md) · [Part 4 — Props](04-props.md) · [Part 5 — State](05-state.md) · [Part 6 — Lifecycle](06-lifecycle.md).

---

## Table of Contents

0. [Definitions — the vocabulary](#definitions)
1. [Why hooks exist — the big before & after](#why)
2. [Rules of Hooks](#rules)
3. [useState](#usestate)
4. [useEffect](#useeffect)
5. [useContext](#usecontext)
6. [useReducer](#usereducer)
7. [useMemo](#usememo)
8. [useCallback](#usecallback)
9. [useRef](#useref)
10. [Additional Hooks](#additional)
11. [Interview questions & answers](#interview)
12. [Quick revision cheat sheet](#cheatsheet)

---

<a name="definitions"></a>
# 0. Definitions — the vocabulary

## What is a Hook?

> **A Hook is a special JavaScript function, provided by React, that lets a function component "hook into" React's internal features — state, lifecycle, context and refs — which were previously available only to class components.**

Three defining properties:

1. **The name starts with `use`.** A real convention, not cosmetic — it's how the linter identifies a hook and applies the rules.
2. **Callable only from a React function component or another custom hook.** A hook needs React's rendering context to attach itself to.
3. **Tracked by call order.** React stores each hook's data in a per-component ordered list; the hook's position in the call sequence *is* its identity.

**Introduced:** React 16.8 (February 2019).

## Supporting terms

> **Side effect** — any operation reaching outside the component's own render output: network requests, timers, subscriptions, direct DOM manipulation, `localStorage`, logging.

> **Pure function** — returns the same output for the same input and produces no side effects. React requires the render phase to be pure.

> **Closure** — a function that retains access to the variables of the scope in which it was created, even after that scope has finished executing.

> **Stale closure** — a closure holding values captured from an earlier render, which are no longer current. Happens when a callback outlives the render that created it.

> **Memoization** — caching the result of a computation, keyed by its inputs, so repeating the same inputs returns the cached result instead of recomputing.

> **Referential equality (reference identity)** — comparing values by whether they are the *same object in memory* (`===` / `Object.is`), not by whether their contents match. `{a:1} === {a:1}` is `false`. This one mechanism underlies memoization, dependency arrays, and re-render decisions.

> **Dependency array** — the list of reactive values an effect or memo depends on. React compares each element to its previous value with `Object.is` and re-runs only when at least one differs.

> **Reactive value** — anything that can change between renders: props, state, and values computed from them. Every reactive value used inside an effect belongs in its dependency array.

> **Race condition** — a bug where the outcome depends on the unpredictable order in which concurrent async operations complete. In React: an earlier request resolving *after* a later one and overwriting fresh data with stale data.

> **Memory leak** — memory that can never be reclaimed because something still references it. In React: a listener, timer or subscription that outlives its component and keeps that component alive.

> **Concurrent rendering** — React's ability to prepare a render in the background, pause it, abandon it, or resume it, so urgent updates aren't blocked by expensive ones.

> **Tearing** — a visual inconsistency where, during a single concurrent render pass, different components read different values of the same external data source.

> **Hydration** — attaching React's event handling and state to server-rendered HTML on the client. A **hydration mismatch** is when the client's first render doesn't match the server's HTML.

> **Custom Hook** — a function whose name begins with `use` and which calls other Hooks. It exists to extract and reuse **stateful logic**. Each component calling it gets its own independent state — the logic is shared, not the state.

---

<a name="why"></a>
# 1. Why hooks exist — the big before & after

## Before hooks (React ≤ 16.7)

There was a hard rule: **only class components could have state or lifecycle.** A function component took props, returned JSX, and that was the extent of its power.

This created a daily frustration. You'd write a small, clean function component:

```jsx
function Toggle() {
  return <button>OFF</button>;
}
```

The moment you needed one boolean, you had to **rewrite the entire thing** as a class:

```jsx
class Toggle extends React.Component {
  constructor(props) {
    super(props);
    this.state = { on: false };
    this.handleClick = this.handleClick.bind(this);
  }
  handleClick() {
    this.setState({ on: !this.state.on });
  }
  render() {
    return <button onClick={this.handleClick}>{this.state.on ? "ON" : "OFF"}</button>;
  }
}
```

Six lines of ceremony to store one boolean. But the boilerplate was the *smallest* problem. There were three deeper ones.

**Problem 1 — related code was scattered across lifecycle methods.** A single concern, like "stay subscribed to a chat room," was split across three methods often a hundred lines apart. Meanwhile one lifecycle method held several *unrelated* concerns, jammed together because they happened to run at the same moment. Code was organized by **when it ran** rather than by **what it was about**.

**Problem 2 — stateful logic could not be reused.** If two components both needed "track the window width," there was no extraction mechanism. The workarounds — higher-order components and render props — worked by **adding components to the tree**. Wrap a component in five HOCs and DevTools showed a pyramid of wrappers around the one component doing real work: **"wrapper hell."**

**Problem 3 — `this` was a permanent tax.** Every handler needed binding. Forget it and you got `Cannot read property 'setState' of undefined` — a confusing error for code that looked correct.

## After hooks (React 16.8+)

```jsx
function Toggle() {
  const [on, setOn] = useState(false);
  return <button onClick={() => setOn(!on)}>{on ? "ON" : "OFF"}</button>;
}
```

## What actually changed

| | Before (classes) | After (hooks) |
|---|---|---|
| Adding state to a component | rewrite it as a class | add one line |
| Code organization | by *lifecycle timing* | by *concern* |
| Reusing stateful logic | HOCs / render props → wrapper hell | custom hooks → no tree changes |
| `this` | required, error-prone | doesn't exist |
| Setup and cleanup | in different methods | adjacent, in the same effect |
| Component granularity | split components to split logic | split *hooks*, keep the component |

## The effect on the ecosystem

The consequence was larger than the syntax suggests. Because logic could finally be extracted **without touching the component tree**, the ecosystem shifted: **containers largely disappeared** (custom hooks replaced them), **HOCs became rare**, and libraries redesigned their APIs around hooks — `useSelector` replaced `connect()`, `useQuery` replaced render-prop data loaders.

---

<a name="rules"></a>
# 2. Rules of Hooks

> **Rule 1 — Only call Hooks at the top level.**
> Never inside conditionals, loops, nested functions, or after an early `return`. Hooks must execute in the same order on every render.

> **Rule 2 — Only call Hooks from React functions.**
> From React function components or from custom Hooks — never from regular JavaScript functions, class components, or event handlers.

```jsx
// ❌ ALL illegal
if (loggedIn)               { const [x] = useState(0); }
for (let i = 0; i < n; i++) { useEffect(...); }
function inner()            { useState(0); }
if (!user) return null;  const [x] = useState(0);   // early return BEFORE a hook

// ✅ hooks first, conditions inside
const [x, setX] = useState(0);
useEffect(() => { if (loggedIn) doThing(); }, [loggedIn]);
if (!user) return null;      // early return AFTER all hooks
```

## 🔑 Why — React tracks hooks by call order

React does **not** know your hooks by name. Each component has an internal **ordered list**, and each hook call consumes the next slot:

```jsx
function Form() {
  const [name, setName] = useState("");    // slot 0
  const [age, setAge]   = useState(0);     // slot 1
  useEffect(...)                           // slot 2
}
```

```
React's internal list for <Form>:
  [0] → ""     [1] → 0     [2] → effect
```

On the next render React walks the list again and hands out slot 0, then 1, then 2 — **purely by call order**. No name is attached.

Now break the rule:

```jsx
if (showName) {
  const [name, setName] = useState("");   // slot 0 — ONLY SOMETIMES
}
const [age, setAge] = useState(0);        // slot 0 or 1?!
```

```
render 1 (showName true):   [0]=name  [1]=age
render 2 (showName false):  [0]=age   ← age now reads name's slot!
```

**State silently lands in the wrong variable.** Same for effects — cleanups run against the wrong setup. That's why `eslint-plugin-react-hooks` is non-negotiable: it enforces both rules plus dependency arrays.

> **Interview line:** *"React identifies hooks by call order, not by name — each component has an ordered list of hook slots. If a hook is conditional, the order shifts between renders and state gets associated with the wrong hook."*

---

<a name="usestate"></a>
# 3. useState

> **Definition:** a Hook that declares a state variable — a value the component preserves across re-renders, whose change triggers a re-render.

- **Signature:** `const [state, setState] = useState(initialState)`
- **Returns:** a two-element array — the current value *for this render*, and a setter.
- **`initialState`:** used only on the first render. If passed as a function, React calls it once (lazy initialization).
- **The setter:** schedules a re-render; it does **not** mutate the current render's variable. Its identity is **stable** across renders.

## BEFORE — a plain variable

The instinctive approach fails in a way worth understanding precisely.

```jsx
function Counter() {
  let count = 0;

  function handleClick() {
    count = count + 1;
    console.log(count);      // 1, 2, 3… the variable IS changing
  }

  return <button onClick={handleClick}>{count}</button>;   // always displays 0
}
```

Two independent failures happen at once, and people usually notice only the first.

The **first failure**: React is never informed. React re-renders when *it* is told to; nothing watches your variables. `count` changed, but React had no reason to run the component again.

The **second failure** is subtler and would defeat you even if the first were fixed. `count` is declared *inside* the function. Every render is a fresh call, so every render creates a **brand-new `count` initialized to 0**. Even with a re-render, the value would reset. The variable has no continuity.

## BEFORE — a variable outside the component

So you hoist it out to give it continuity:

```jsx
let count = 0;                       // outside — survives renders

function Counter() {
  return <button onClick={() => { count++; }}>{count}</button>;
}
```

The value persists, but React still isn't notified, so nothing updates. And a new problem appears: this variable is **shared by every instance** of `Counter` on the page. Render three counters and they all read the same number. State must be *per component instance*, and a module-level variable can't do that.

## AFTER — useState

```jsx
function Counter() {
  const [count, setCount] = useState(0);

  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

React stores the value **outside your function but attached to this specific component instance**, so it survives re-renders and stays private per instance. The setter does double duty: it updates the stored value *and* tells React to re-render.

## What changed

| | Plain variable | Module variable | `useState` |
|---|---|---|---|
| Survives re-render | ❌ | ✅ | ✅ |
| Per-instance | ✅ | ❌ shared | ✅ |
| Triggers re-render | ❌ | ❌ | ✅ |

## The effect: state became a snapshot

Adopting `useState` introduced a behaviour that surprises everyone, and it is a direct, unavoidable consequence of how it works.

```jsx
function handleClick() {
  setCount(count + 1);
  console.log(count);     // prints the OLD value
}
```

`count` is a `const` belonging to *this particular render's* function call. It cannot change — nothing can reassign it. `setCount` doesn't edit that variable; it stores a new value in React and schedules the component to run again. The *next* run declares a *new* `count`.

So state behaves less like a mutable variable and more like a **photograph of the values at the moment this render began**. Every render has its own frozen copy, and every function defined during that render captures that copy permanently.

This one fact explains a family of behaviours that otherwise look like bugs: why logging after a setter shows the old value, why calling `setCount(count + 1)` three times only adds one, and why a callback inside `setInterval` can be permanently stuck on an old value. The functional form `setCount(c => c + 1)` exists specifically to escape the snapshot: instead of computing from the frozen value, you hand React a recipe and React applies it to whatever the current value actually is.

## The API in one table

| Feature | Form |
|---|---|
| **Lazy init** | `useState(() => expensive())` — runs once, not every render |
| **Functional update** | `setX(prev => prev + 1)` — when the new value depends on the old |
| **Object update** | `setUser(p => ({ ...p, name: "V" }))` — setters **replace**, never merge |
| **Array update** | add `[...a, x]` · remove `a.filter()` · update `a.map()` · sort `[...a].sort()` |
| **Batching** | multiple setters in one tick → one render (React 18: everywhere) |

Full treatment of immutable updates, batching and lifting → [Part 5 — State](05-state.md).

## The common mistakes

```jsx
// ❌ 1. expecting the value to change immediately
setCount(count + 1);
console.log(count);            // old value — state is a per-render snapshot

// ❌ 2. multiple updates from the same snapshot
setCount(count + 1);
setCount(count + 1);           // +1 total → use setCount(c => c + 1)

// ❌ 3. mutating
user.name = "V"; setUser(user);          // same reference → NO re-render
items.push(x);   setItems(items);        // same reference → NO re-render

// ❌ 4. running the initializer every render
useState(JSON.parse(localStorage.getItem("k")));       // parses every render
useState(() => JSON.parse(localStorage.getItem("k"))); // ✅ once

// ❌ 5. storing derived data
const [total, setTotal] = useState(0);
useEffect(() => setTotal(sum(items)), [items]);        // 🚩
const total = sum(items);                              // ✅ just compute it

// ❌ 6. calling the setter during render
function C() { setCount(1); return <p/>; }             // infinite loop
```

---

<a name="useeffect"></a>
# 4. useEffect

> **Definition:** a Hook that lets a component synchronize with an external system by running a side effect after the render is committed to the screen.

- **Signature:** `useEffect(setup, dependencies?)`
- **`setup`:** the effect function; may return a **cleanup** function.
- **Cleanup:** runs before the next execution of the effect, and once on unmount.
- **Timing:** asynchronously, **after** the browser paints.
- **Dependencies:** omitted → after every render · `[]` → once after mount · `[a, b]` → after mount and whenever `a` or `b` changes by `Object.is`.

## BEFORE — three lifecycle methods that had to agree

A chat component subscribing to a room. In a class, this one concern was expressed in three places:

```jsx
class Chat extends React.Component {
  componentDidMount() {
    this.sub = subscribe(this.props.roomId);        // ① start
  }

  componentDidUpdate(prevProps) {
    if (prevProps.roomId !== this.props.roomId) {   // ② the part everyone forgot
      this.sub.unsubscribe();
      this.sub = subscribe(this.props.roomId);
    }
  }

  componentWillUnmount() {
    this.sub.unsubscribe();                          // ③ stop
  }
}
```

The problem isn't the volume of code — it's that **correctness depends on three separate methods staying consistent**, and nothing enforces that. In practice the middle one was omitted constantly, because the app *appeared* to work: the first subscription succeeded, and the bug only surfaced when the user switched rooms, at which point the old subscription kept running silently. You'd end up with five live subscriptions and messages from rooms the user had left.

The reverse problem existed too. A single `componentDidMount` typically held several unrelated concerns — start a timer, fetch data, add a resize listener — because they all needed to happen after mounting. Their cleanups sat together in `componentWillUnmount`. The file was organized by *when things run*, and the two halves of each concern lived far apart.

## AFTER — one effect that owns its own reversal

```jsx
function Chat({ roomId }) {
  useEffect(() => {
    const sub = subscribe(roomId);
    return () => sub.unsubscribe();
  }, [roomId]);
}
```

Setup and teardown are now **adjacent lines in the same function**. React runs the cleanup automatically before re-running the effect and again on unmount, so the room-change case is handled without you writing it.

## What changed

| | Class lifecycle | `useEffect` |
|---|---|---|
| Places one concern lives | 3 methods | 1 effect |
| Handling a dependency change | manual, easily forgotten | automatic |
| Cleanup location | a different method | the line below setup |
| Multiple concerns | interleaved in shared methods | one effect each |
| Organized by | when code runs | what code is about |

## The effect: a different question to ask

The real change was conceptual. With lifecycle methods you asked *"when should this run?"* — a timing question. With effects, the useful question is **"what external thing am I keeping in sync with, and how do I undo it?"**

That reframing is why the dependency array exists. You're not listing "things that trigger a re-run"; you're declaring **what this synchronization depends on**. If the answer changes, the old synchronization is undone and a new one established. Cleanup isn't "unmount code" — it's **the reverse of setup**, which is why it runs before *every* re-run.

```
mount        → setup
deps change  → cleanup(old) → setup(new)
unmount      → cleanup
```

This also explains **React 18 Strict Mode**, which deliberately runs every effect twice in development (setup → cleanup → setup). If an effect is genuinely reversible, that sequence leaves the system exactly as one setup would. If it isn't, you'll see two subscriptions or a doubled request. **It's a test of the property effects are supposed to have** — never suppress it with a `hasRun` ref; that hides a real bug.

## The dependency array — three forms

```jsx
useEffect(() => { ... });            // EVERY render
useEffect(() => { ... }, []);        // ONCE, on mount
useEffect(() => { ... }, [a, b]);    // on mount + whenever a or b changes
```

```
render 1:  deps [1, "a"]
render 2:  deps [1, "a"]   → identical → SKIP
render 3:  deps [2, "a"]   → changed   → cleanup, then re-run
```

⚠️ Object/array/function dependencies compare by **reference**, so they change every render:

```jsx
useEffect(() => { ... }, [{ id }]);           // ❌ new object each render → runs always
useEffect(() => { ... }, [id]);               // ✅ primitive
useEffect(() => { ... }, [obj.id, obj.name]); // ✅ destructure to primitives
```

## Infinite loops — the four causes

```jsx
// 1. no dep array + setState inside
useEffect(() => { setX(1); });

// 2. an object/array/function dependency recreated every render
useEffect(() => { ... }, [{ a: 1 }]);
useEffect(() => { fetchData(); }, [fetchData]);   // fetchData redefined each render

// 3. setting the very state you depend on
useEffect(() => { setCount(count + 1); }, [count]);

// 4. a parent that re-renders because of the child's effect
```

**Fixes:** add the dependency array · keep primitives in deps · `useCallback`/`useMemo` for non-primitive deps · functional updates `setX(c => c + 1)` so you can drop the dep · or realize the value is derived and shouldn't be state at all.

## API calls

```jsx
function User({ id }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`/api/users/${id}`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(data => { if (!cancelled) { setUser(data); setLoading(false); } })
      .catch(e   => { if (!cancelled) { setError(e);   setLoading(false); } });

    return () => { cancelled = true; };     // ← the race-condition guard
  }, [id]);

  if (loading) return <Spinner />;
  if (error)   return <Error e={error} />;
  return <div>{user.name}</div>;
}
```

Note the three state variables, the `!r.ok` check (fetch doesn't reject on 404/500), and the cancellation flag.

> **Reality check:** in production, use **React Query / SWR**. Manual fetching means hand-rolling caching, deduplication, retries, refetch-on-focus and invalidation. Interviewers like to hear you know this.

## Race conditions

The bug that separates seniors from juniors.

```jsx
useEffect(() => {
  fetch(`/api/search?q=${query}`).then(r => r.json()).then(setResults);
}, [query]);
```

This looks correct and is wrong. **Responses do not arrive in the order requests were sent.**

```
user types "a"  → request A fires (slow, 300ms)
user types "ab" → request B fires (fast, 50ms)

B resolves first → setResults(B)   ✅ correct, shows "ab" results
A resolves later → setResults(A)   ❌ overwrites with STALE "a" results
```

The user sees results for a query they've already moved past, and nothing in the code looks broken.

The fix belongs in the **cleanup**, because cleanup is precisely "undo the previous effect" — and an in-flight request is part of what the previous effect started:

```jsx
useEffect(() => {
  const controller = new AbortController();

  fetch(`/api/search?q=${query}`, { signal: controller.signal })
    .then(r => r.json())
    .then(setResults)
    .catch(e => { if (e.name !== "AbortError") setError(e); });

  return () => controller.abort();
}, [query]);
```

| | Cancellation flag | AbortController |
|---|---|---|
| Ignores stale responses | ✅ | ✅ |
| Actually cancels the request | ❌ | ✅ |
| Frees bandwidth / server work | ❌ | ✅ |
| Works with non-fetch async | ✅ | only if the API supports signals |

Both also prevent "setState on an unmounted component."

## Stale closures

```jsx
useEffect(() => {
  const id = setInterval(() => {
    setCount(count + 1);      // stuck at 1 forever
  }, 1000);
  return () => clearInterval(id);
}, []);
```

The interval callback was created during the first render and captured `count` as `0`. Because the dependency array is empty, the effect never re-runs, so that original callback — with its frozen `0` — executes every second forever.

**The dependency array is a claim you're making**: *"this effect uses nothing from props or state."* Here that claim is false, and the empty array is the lie.

```jsx
// 1. functional update — never reads the captured value   ✅ best
setCount(c => c + 1);

// 2. tell the truth — the interval is rebuilt on each change
}, [count]);

// 3. a ref holding the latest value — when you need to READ, not just set
const countRef = useRef(count);
useEffect(() => { countRef.current = count; });
// inside the interval: countRef.current
```

> **The general rule:** a stale closure means you lied in the dependency array. Either tell the truth (add the dep), or restructure so the claim becomes true.

## When NOT to use useEffect

Because `useEffect` is the most visible hook, it gets used for work that isn't a side effect at all:

```jsx
// ❌ before — an effect syncing derived data
const [total, setTotal] = useState(0);
useEffect(() => { setTotal(items.reduce((s, i) => s + i.price, 0)); }, [items]);

// ✅ after — a plain calculation
const total = items.reduce((s, i) => s + i.price, 0);
```

The effect version renders twice for every change (once with the stale total, once after the effect corrects it), creates a second source of truth that can drift, and requires every code path touching `items` to remember to realign `total`. The calculation version **cannot be wrong**, because there's nothing to keep in sync.

More cases:

```jsx
// ❌ handling a user event  →  put it in the handler
useEffect(() => { if (submitted) postForm(); }, [submitted]);
function handleSubmit() { postForm(); }

// ❌ resetting state when a prop changes  →  use key
useEffect(() => setText(""), [userId]);
<Profile key={userId} />

// ❌ chains of effects that each set state  →  compute in one place
```

> **The rule: an effect is for synchronizing with a system outside React.** If no external system is involved — no network, no timer, no subscription, no DOM API — the work belongs in the render body or an event handler.

---

<a name="usecontext"></a>
# 5. useContext

> **Definition:** a Hook that reads and subscribes to the value of a React context from the nearest matching Provider above it in the tree.

- **Signature:** `const value = useContext(SomeContext)`
- **Returns:** the `value` prop of the closest `<SomeContext.Provider>` ancestor; if there is none, the default passed to `createContext`.
- **Subscription:** the calling component re-renders whenever that Provider's `value` changes.

> **Context** — a mechanism for passing data through the component tree without threading props at every level. It is **transport**, not storage.

## BEFORE — threading props through uninterested components

```jsx
function App() {
  const [user] = useState(currentUser);
  return <Dashboard user={user} />;
}

function Dashboard({ user }) { return <Sidebar user={user} />; }   // doesn't use it
function Sidebar({ user })   { return <Profile user={user} />; }   // doesn't use it
function Profile({ user })   { return <Avatar user={user} />; }    // doesn't use it
function Avatar({ user })    { return <img src={user.avatar} />; } // finally uses it
```

Three components have `user` in their signature purely as a courier service. The costs go beyond ugliness. Those three components are now **untruthful about their requirements** — their API claims they need a user, so you can't reuse any of them elsewhere without supplying one. Adding a second piece of shared data means editing all five files. Inserting a new layer means threading everything through it again.

## BEFORE hooks, but with context — the Consumer render prop

Context itself predates hooks; consuming it was the awkward part.

```jsx
<UserContext.Consumer>
  {user => (
    <ThemeContext.Consumer>
      {theme => (
        <LocaleContext.Consumer>
          {locale => <Avatar user={user} theme={theme} locale={locale} />}
        </LocaleContext.Consumer>
      )}
    </ThemeContext.Consumer>
  )}
</UserContext.Consumer>
```

Reading three contexts produced three levels of nesting **inside your JSX**, pushing the actual content further right with each one.

## AFTER — useContext

```jsx
function Avatar() {
  const user   = useContext(UserContext);
  const theme  = useContext(ThemeContext);
  const locale = useContext(LocaleContext);

  return <img src={user.avatar} className={theme} />;
}
```

Three flat lines. The intermediate components go back to being generic:

```jsx
function Dashboard() { return <Sidebar />; }
function Sidebar()   { return <Profile />; }
```

## What changed

| | Prop drilling | `Consumer` | `useContext` |
|---|---|---|---|
| Intermediate components affected | all of them | none | none |
| Reading 3 contexts | 3 props everywhere | 3 nesting levels | 3 lines |
| Where the data appears | in every signature | in JSX | in the function body |

> `<Ctx.Consumer>` is still needed in **class components**. `useContext` replaces it everywhere else.

## The three pieces

```jsx
// 1. CREATE
const ThemeContext = createContext("light");   // arg = default if no Provider

// 2. PROVIDE — the standard pattern: state + logic inside its own component
function ThemeProvider({ children }) {
  const [theme, setTheme] = useState("dark");
  const toggle = useCallback(() => setTheme(t => t === "dark" ? "light" : "dark"), []);
  const value  = useMemo(() => ({ theme, toggle }), [theme, toggle]);   // ⚠️ stabilize

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// 3. CONSUME
const { theme } = useContext(ThemeContext);
```

## Nested providers

```jsx
<AuthProvider>
  <ThemeProvider>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </ThemeProvider>
</AuthProvider>
```

Separate concerns = separate contexts. **Nesting the same context deliberately overrides it** for a subtree:

```jsx
<ThemeContext.Provider value="dark">
  <Page />                                  {/* dark */}
  <ThemeContext.Provider value="light">
    <Modal />                               {/* light — nearest provider wins */}
  </ThemeContext.Provider>
</ThemeContext.Provider>
```

⚠️ **"Provider hell"** — eight nested providers is a smell. Flatten with a compose helper, or move some state to a store.

## The effect, and the cost that came with it

**The dependency became invisible.** With props, a component's signature documents everything it needs. With context, `Avatar()` takes no arguments yet cannot function outside a `UserProvider`. This shows up in testing — rendering `Avatar` in isolation fails until you wrap it in providers. The mitigation is a custom hook that fails loudly:

```jsx
function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within a UserProvider");
  return ctx;
}
```

**🔥 Every consumer re-renders on every value change.** Context has no concept of "which part of the value did you read" — when the Provider's `value` changes, *every* component calling `useContext` for it re-renders, whether or not the part it uses changed. And **`React.memo` cannot prevent this**, because memo compares props and context doesn't travel through props.

That makes one mistake very expensive:

```jsx
<UserContext.Provider value={{ user, setUser }}>   // ❌ new reference every render
<UserContext.Provider value={useMemo(() => ({user, setUser}), [user])}>   // ✅
```

Two more structural fixes:

```jsx
// ❌ one big context — a theme change re-renders everyone who only wanted `user`
<AppContext.Provider value={{ user, theme, cart, locale }}>

// ✅ split by concern AND by update frequency
<UserContext.Provider value={user}>
  <ThemeContext.Provider value={theme}>

// ✅ separate state from dispatch — dispatch is stable, so those consumers never re-render
<StateContext.Provider value={state}>
  <DispatchContext.Provider value={dispatch}>
```

> **The broader lesson: context is a transport mechanism, not a state manager.** It has no store, no selectors, no way to subscribe to part of a value. Well suited to data that is genuinely global and changes rarely — theme, locale, authenticated user. Poorly suited to anything that changes often, like form fields or a cart, where Zustand lets components subscribe to slices.

---

<a name="usereducer"></a>
# 6. useReducer

> **Definition:** a Hook that manages state through a reducer — a pure function taking the current state and an action, and returning the next state.

- **Signature:** `const [state, dispatch] = useReducer(reducer, initialArg, init?)`
- **Reducer:** `(state, action) => newState` — must be pure.
- **Action:** a plain object describing *what happened*, conventionally `{ type, payload }`.
- **`dispatch`:** sends an action and schedules a re-render. Identity is **stable**.
- **`init`:** optional lazy initializer — React computes the initial state as `init(initialArg)`.

## BEFORE — state logic scattered across handlers

```jsx
function Form() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.save();
      setData(res);
      setLoading(false);
    } catch (e) {
      setError(e);
      setLoading(false);      // easy to forget
      setData(null);          // easy to forget
    }
  }

  function handleRetry() {
    setError(null);
    setLoading(true);
    setData(null);            // the same trio, written again
  }
}
```

Three state variables that are conceptually **one thing** — the status of a request — represented as three independent values. Because they're independent, nothing prevents contradictory combinations: `loading: true` alongside `error: set`, or `data` present while `loading` is still `true`. These **"impossible states" are entirely possible**, and they occur whenever a code path forgets one of the three updates.

The logic is also duplicated. `handleSubmit` and `handleRetry` both express "we are now loading," each spelling it out separately. A third path will spell it out a third time, slightly differently.

## AFTER — one reducer holding every transition

```jsx
function reducer(state, action) {
  switch (action.type) {
    case "SUBMIT":  return { status: "loading", data: null,           error: null };
    case "SUCCESS": return { status: "success", data: action.payload, error: null };
    case "FAILURE": return { status: "error",   data: null,           error: action.error };
    default: throw new Error(`Unknown action: ${action.type}`);
  }
}

function Form() {
  const [state, dispatch] = useReducer(reducer, { status: "idle", data: null, error: null });

  async function handleSubmit() {
    dispatch({ type: "SUBMIT" });
    try {
      const res = await api.save();
      dispatch({ type: "SUCCESS", payload: res });
    } catch (e) {
      dispatch({ type: "FAILURE", error: e });
    }
  }
}
```

## What changed

The mechanical difference is small; the conceptual one is not.

**Components stopped describing *how* to update state and started describing *what happened*.** `handleSubmit` no longer knows that submitting means clearing the error, clearing the data and setting a loading flag. It announces `SUBMIT`. The reducer owns the consequences.

**Impossible states became impossible.** Every transition produces a complete state object in one place, so there is no path that sets `loading` without also clearing `error`. Contradictory combinations can't be reached because no case produces one.

**The logic became testable in isolation.** A reducer is a pure function of two arguments — assert `reducer(prev, action) === expected` without rendering anything or mocking a component.

**`dispatch` has a permanently stable identity.** Unlike a handler defined during render, it's the same function forever — safe to pass to memoized children or list in dependency arrays, with none of the referential-stability problems that make `useCallback` necessary elsewhere.

| | `useState` × 3 | `useReducer` |
|---|---|---|
| Where transition logic lives | duplicated across handlers | one pure function |
| Contradictory states | reachable | unreachable by construction |
| Adding a new transition | edit every affected handler | add one `case` |
| Unit testing | requires rendering | call the function |
| Identity of the updater | new each render | stable |

## When the trade isn't worth it

The cost is **indirection**. Reading `dispatch({type: "SUBMIT"})` doesn't tell you what happens — you have to go find the reducer. For a single boolean toggle or a text input's value that's a pure loss, and `useState` remains correct.

**Switch when:** several values change together · update logic is complex or duplicated across handlers · the next state depends on the previous in non-trivial ways · you have 4+ related `useState` calls · state is deeply nested.

> `useReducer` + `useContext` is a lightweight Redux — global state, no dependency. Redux adds devtools, middleware and a single store; Zustand adds slice subscriptions.

---

<a name="usememo"></a>
# 7. useMemo

> **Definition:** a Hook that caches the result of a calculation between re-renders, recomputing it only when its dependencies change.

- **Signature:** `const cached = useMemo(calculateValue, dependencies)`
- **Returns:** the cached value if dependencies are unchanged; otherwise the result of calling `calculateValue()`.
- **Guarantee:** none — it is a performance **hint**. React may discard cached values.

## BEFORE — the underlying problem

A component function runs completely on every render. Every object literal, array literal and function expression inside it produces a **brand-new value** each time — identical in content, different in identity.

```jsx
function Parent() {
  const [count, setCount] = useState(0);

  const config = { theme: "dark" };            // new object every render
  const sorted = hugeList.sort(comparator);    // re-sorts 10,000 items every render

  return <Child config={config} items={sorted} />;
}
```

Usually creating an object is cheap and this doesn't matter. It matters in two situations.

**Situation 1 — something downstream compares references.**

```jsx
const Child = React.memo(function Child({ config }) { ... });
```

`React.memo` compares props shallowly with `===` and skips re-rendering when they're equal. But `config` is a new object each render, so the comparison always fails and `Child` re-renders every time regardless. **You added a comparison step and gained nothing — a net loss.** The same trap hits dependency arrays:

```jsx
useEffect(() => { loadData(config); }, [config]);   // fires every render
```

**Situation 2 — the computation is genuinely expensive.** Toggling an unrelated hover flag re-sorts ten thousand items.

## AFTER

```jsx
function Parent() {
  const [count, setCount] = useState(0);

  const config = useMemo(() => ({ theme: "dark" }), []);
  const sorted = useMemo(() => hugeList.sort(comparator), [hugeList]);

  return <Child config={config} items={sorted} />;
}
```

Now the reference is stable, so `React.memo` genuinely skips the child and the effect runs only when it should; and the sort runs only when the list actually changes.

## What changed

| | Without memoization | With memoization |
|---|---|---|
| Object/array identity | new every render | stable until deps change |
| `React.memo` on children | always misses | works |
| Effect dependencies | fire constantly | fire correctly |
| Expensive computation | repeats on unrelated renders | cached |
| Cost | none | storage + a comparison every render |

## The two legitimate reasons to use it

1. **Genuinely expensive calculations** — profile first.
2. **Reference stability** — often the *more* important one: cheap to compute, but the **identity** matters to `React.memo`, dependency arrays, and context values.

## When NOT to use it

```jsx
const total = useMemo(() => a + b, [a, b]);                    // ❌ addition is free
const name  = useMemo(() => `${f} ${l}`, [f, l]);              // ❌ concatenation is free
const small = useMemo(() => items.filter(x => x.on), [items]); // ❌ 20 items? free
```

**Memoization is not free.** Each `useMemo` stores a function, a dependency array and a result, then compares dependencies on every render. For trivial work you pay more than you save — and add noise.

```
✅ measurably expensive (profile it) · reference identity matters
❌ primitives · trivial math/strings · small arrays · "just in case"
```

⚠️ **A hint, not a guarantee.** React may discard cached values (e.g. to free memory). Code must remain correct if the computation runs again — memoization may only affect performance, never behaviour.

---

<a name="usecallback"></a>
# 8. useCallback

> **Definition:** a Hook that caches a function definition between re-renders, returning the same function reference until its dependencies change.

- **Signature:** `const cached = useCallback(fn, dependencies)`
- **Equivalence:** `useCallback(fn, deps)` **is exactly** `useMemo(() => fn, deps)`.
- **Purpose:** referential stability — meaningful **only** when the consumer compares references.

## BEFORE — memoization that silently does nothing

```jsx
function Parent() {
  const [count, setCount] = useState(0);
  const handleSave = () => save();               // NEW identity every render

  return <MemoChild onSave={handleSave} />;      // memo always misses → re-renders
}
```

Functions are objects, so a new one is created every render. `React.memo` compares `onSave` by reference, sees a different function, and re-renders the child anyway.

## AFTER

```jsx
const handleSave = useCallback(() => save(), []);   // ✅ stable identity
```

Now `MemoChild` genuinely skips re-rendering.

## What changed

Only one thing: the **identity** of the function is preserved across renders. That's it — and that's why it only pays off when something is comparing identities.

## 🔥 The mistake that makes it pointless

```jsx
const handleClick = useCallback(() => {...}, []);
return <RegularChild onClick={handleClick} />;    // ❌ NOT memoized
```

**`useCallback` alone accomplishes nothing.** Stabilizing a reference matters only if something is *comparing* that reference:

```
useCallback + React.memo child      ✅ works
useCallback + normal child          ❌ pure overhead — the child re-renders anyway
useCallback + effect dependency     ✅ works (stops the effect re-running)
useCallback + custom hook dep       ✅ works
```

**Both halves of the optimization are required.** Wrapping every handler "for performance" makes the app slower and the code noisier.

## Other mistakes

```jsx
// ❌ missing dependency → stale closure, same as useEffect
const save = useCallback(() => api.save(text), []);   // `text` frozen at its initial value

// ❌ a dependency that changes every render → useCallback never helps
const save = useCallback(() => post(config), [config]);   // config is new each render

// ✅ drop the dep with a functional update
const inc = useCallback(() => setCount(c => c + 1), []);  // no `count` needed
```

## useMemo vs useCallback

| | `useMemo` | `useCallback` |
|---|---|---|
| Caches | the **result** of calling the function | the **function itself** |
| For | expensive values, stable objects/arrays | stable function props / deps |

**Never needed:** `useState`'s setter and `useReducer`'s `dispatch` — already stable.

> **Looking ahead:** the **React Compiler** (React 19) applies these optimizations automatically at build time, which will make most manual `useMemo`/`useCallback` unnecessary. Worth mentioning in interviews; don't assume it's enabled in a given project.

---

<a name="useref"></a>
# 9. useRef

> **Definition:** a Hook returning a mutable object that persists for the component's lifetime and whose mutation does **not** trigger a re-render.

- **Signature:** `const ref = useRef(initialValue)`
- **Returns:** `{ current: initialValue }` — the *same object* on every render.
- **Two uses:** (1) holding a DOM node, when passed to a JSX `ref` attribute; (2) holding any mutable value the render output doesn't depend on.
- **Constraint:** do not read or write `ref.current` during rendering — that makes the render impure.

## BEFORE — two bad options for a timer id

A component starts an interval on one button and stops it on another. The interval's id must survive between renders.

**Option A — a local variable.** Fails like the counter earlier: recreated every render, so by the time "Stop" is clicked `timerId` is `undefined` and there's nothing to clear. The interval runs forever.

```jsx
function Timer() {
  let timerId;                                          // lost on every render
  const start = () => { timerId = setInterval(tick, 1000); };
  const stop  = () => { clearInterval(timerId); };      // undefined
}
```

**Option B — state.** The value now survives, but you've caused an unnecessary re-render to store a number the user never sees.

```jsx
const [timerId, setTimerId] = useState(null);   // works, but re-renders for nothing
```

## BEFORE — reaching a DOM node

The other classic need is a direct handle on a DOM element — to focus an input, measure it, or play a video. Without refs you'd resort to:

```jsx
document.getElementById("search").focus();     // querying outside React
```

which reaches around React entirely, breaks if the id isn't unique, and fails in tests or wherever the element isn't mounted as assumed.

## AFTER — useRef for both

```jsx
function Timer() {
  const timerRef = useRef(null);

  const start = () => { timerRef.current = setInterval(tick, 1000); };
  const stop  = () => { clearInterval(timerRef.current); };

  useEffect(() => () => clearInterval(timerRef.current), []);   // cleanup on unmount
}
```

```jsx
function Search() {
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current.focus(); }, []);
  return <input ref={inputRef} />;
}
```

## What changed

`useRef` fills the gap between a local variable (doesn't survive) and state (survives but forces a re-render). It gives you **persistence without reactivity**.

| | Local variable | `useState` | `useRef` |
|---|---|---|---|
| Survives re-renders | ❌ | ✅ | ✅ |
| Triggers a re-render | ❌ | ✅ | ❌ |
| Per component instance | ✅ | ✅ | ✅ |
| Mutated in place | ✅ | ❌ (replace) | ✅ |

> **The decision rule:** if the UI must display the value → **state**. If it's bookkeeping the UI never shows → **ref**.

## The five real uses

**1. DOM access** — focus, text selection, scrolling, measuring (`getBoundingClientRect`), media playback, canvas, integrating non-React libraries.

**2. Mutable instance variables** — the class equivalent of `this.something`:

```jsx
const renderCount = useRef(0);
renderCount.current++;                     // no re-render — just counting
```

**3. Previous value:**

```jsx
function usePrevious(value) {
  const ref = useRef();
  useEffect(() => { ref.current = value; });   // runs AFTER render
  return ref.current;                          // so this is still the PREVIOUS value
}
```

The trick is ordering: the effect updates the ref *after* render, so during render it still holds the last value.

**4. Timer references** — as above.

**5. Focus management** — focus traps, returning focus after a modal closes, moving focus to an error message. A major real-world use.

```jsx
function Modal({ open }) {
  const closeRef = useRef(null);
  useEffect(() => { if (open) closeRef.current?.focus(); }, [open]);
  return open ? <button ref={closeRef}>Close</button> : null;
}
```

## The effect: an escape hatch with rules

Refs are deliberately an **escape hatch** from React's declarative model, and they carry two constraints that follow from that.

**Refs are `null` during the first render.** React attaches the DOM node during commit, which happens after render. Reading `inputRef.current` in the render body crashes on mount; read it inside effects or event handlers.

**Reading or writing a ref during render makes the render impure.** React assumes calling your component produces the same output for the same inputs. A ref mutated during render breaks that and misbehaves under Strict Mode and concurrent rendering.

```jsx
// ❌ impure
function C() { ref.current++; return <p>{ref.current}</p>; }

// ❌ expecting a re-render
ref.current = 5;     // screen won't update

// ❌ null on first render
const w = inputRef.current.offsetWidth;    // 💥 in the render body — use an effect

// ✅ optional chaining for conditionally rendered nodes
inputRef.current?.focus();
```

And a ref should never be used to *change* what's displayed — setting `element.textContent` or `element.className` directly puts the DOM out of sync with the virtual DOM, and the next render overwrites it. **Refs are for things React has no declarative API for.**

---

<a name="additional"></a>
# 10. Additional Hooks

Each exists because a specific situation had no good answer before it.

## `useLayoutEffect`

> **Definition:** identical to `useEffect` in API, but fires synchronously after DOM mutations and **before** the browser repaints.

**Before:** `useEffect` runs after paint. For most effects that's ideal — the user sees content sooner. But if the effect *measures* the DOM and then *adjusts* it — positioning a tooltip so it doesn't overflow the viewport — the user briefly sees the tooltip in the wrong place before it snaps into position. A visible flicker.

**After:** the correction is applied within the same frame; the intermediate state is never visible.

```
useEffect:        render → DOM update → PAINT → effect     (possible flash)
useLayoutEffect:  render → DOM update → effect → PAINT     (no flash, blocks paint)
```

**The cost:** it blocks painting, so slow work here freezes the UI, and it doesn't run during server rendering. Use only for measure-then-adjust.

## `forwardRef`

> **Definition:** a React API (not a Hook) that lets a component receive a `ref` from its parent and forward it to a DOM node or component inside it.

**Before:** `ref` is not an ordinary prop — React intercepts it. So `<MyInput ref={r} />` gave you the component instance (or nothing, for a function component), never the inner `<input>`. Any design-system component wrapping a native element made focus management impossible for its consumers.

**After:**

```jsx
const MyInput = forwardRef(function MyInput(props, ref) {
  return <input ref={ref} {...props} />;
});
```

**🆕 React 19:** `ref` became a normal prop for function components — `function MyInput({ ref })` works, and `forwardRef` is deprecated. Existing codebases are still full of it.

## `useImperativeHandle`

> **Definition:** a Hook that customizes the value exposed to a parent through a forwarded ref, replacing the DOM node with a chosen set of methods.

**Before:** forwarding a ref exposes the raw DOM node, so the parent can do *anything* to it — change styles, read internals, break your assumptions. A component library had no way to offer a narrow imperative API.

**After:**

```jsx
const Input = forwardRef((props, ref) => {
  const inputRef = useRef();

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current.focus(),
    clear: () => { inputRef.current.value = ""; },
  }), []);

  return <input ref={inputRef} />;
});
// the parent can call .focus() and .clear() — nothing else
```

An escape hatch from declarative React — use sparingly, mainly in component libraries (a video player's `play()`/`pause()`, a form's `validate()`).

## `useId`

> **Definition:** a Hook that generates a unique, stable identifier string that matches between server and client rendering.

**Before:** linking a `<label>` to an `<input>` requires a unique id. Generating one with a counter or `Math.random()` breaks SSR — server and client generate different values, producing a hydration mismatch.

**After:**

```jsx
function Field() {
  const id = useId();
  return (
    <>
      <label htmlFor={id}>Email</label>
      <input id={id} />
    </>
  );
}
```

The id derives from the component's position in the tree, so server and client agree.

⚠️ **Not for list keys** — it identifies a component instance, not a data item.

## `useTransition`

> **Definition:** a Hook that lets you mark a state update as a non-urgent **transition**, allowing React to interrupt it so urgent updates stay responsive.

**Before:** React processed every state update with equal urgency. Type into a box that filters ten thousand rows and each keystroke blocked on the filtering — the character appeared only after the expensive work finished. The only workarounds were debouncing (which delays everything, including the input) or manual scheduling.

**After:**

```jsx
const [isPending, startTransition] = useTransition();

function handleChange(e) {
  setQuery(e.target.value);                       // URGENT — the input must feel instant
  startTransition(() => {
    setResults(filterHugeList(e.target.value));   // NON-URGENT — interruptible
  });
}

{isPending && <Spinner />}
```

## `useDeferredValue`

> **Definition:** a Hook that returns a deferred copy of a value, which lags behind during urgent updates and catches up in a background re-render.

```jsx
const deferredQuery = useDeferredValue(query);
const results = useMemo(() => filterHuge(deferredQuery), [deferredQuery]);

<input value={query} onChange={...} />     {/* updates immediately */}
<Results items={results} />                {/* lags behind, non-blocking */}
```

Same concurrency mechanism as `useTransition`; different entry point:

```
useTransition     — you wrap the UPDATE (you own the setState) + get isPending
useDeferredValue  — you wrap the VALUE  (it comes from props/elsewhere)
```

## `useSyncExternalStore`

> **Definition:** a Hook that subscribes a component to an external data store while guaranteeing a consistent snapshot during concurrent rendering.

**Before:** subscribing to state outside React — a Redux store, `localStorage`, `navigator.onLine` — was done with `useEffect` plus `useState`. That worked in React 17. Under concurrent rendering it can **tear**: React pauses mid-render, the store changes, and components rendered after the pause read a different value than those before it. One render pass, two different truths, visible on screen.

**After:**

```jsx
const isOnline = useSyncExternalStore(
  callback => {                                  // subscribe
    window.addEventListener("online", callback);
    window.addEventListener("offline", callback);
    return () => { /* unsubscribe */ };
  },
  () => navigator.onLine,        // getSnapshot (client)
  () => true                     // getServerSnapshot (SSR)
);
```

Primarily used *by* state libraries (Zustand, Redux) rather than in app code — but it's why they work correctly with concurrent features.

## `useInsertionEffect`

> **Definition:** a Hook that fires before any DOM mutations and before all layout effects — the earliest hook — intended for injecting styles from CSS-in-JS libraries.

**Before:** CSS-in-JS libraries inject `<style>` tags at runtime. If injection happened in a layout effect, another layout effect could measure an element **before** its styles existed, producing wrong measurements.

**After:** styles are guaranteed to be in place before anything measures.

```jsx
useInsertionEffect(() => { injectStyleTag(css); }, [css]);
```

Only library authors need it. Know it exists.

---

<a name="interview"></a>
# 11. Interview questions & answers

### Q: "What are hooks and why were they introduced?"
> *"Hooks are functions that let function components use React features that previously required classes — state, lifecycle, context, refs. They were introduced in 16.8 to solve three problems: stateful logic couldn't be reused without HOCs or render props, which added wrapper components to the tree; related code was split across lifecycle methods while unrelated code was grouped together; and `this` binding was a constant source of bugs. The biggest win is custom hooks — logic extraction without changing the component tree."*

### Q: "What are the rules of hooks and why do they exist?"
> *"Only call hooks at the top level, and only from React function components or custom hooks. React identifies hooks by call order, not name — each component has an ordered list of hook slots filled in the order the hooks run. A conditional hook shifts that order between renders, so state gets associated with the wrong hook. The ESLint plugin enforces both rules."*

### Q: "Why does `console.log` right after a setter show the old value?"
> *"Because the state variable is a const captured in that render's closure — a snapshot. The setter doesn't reassign it; it stores a new value in React and schedules a re-render, and the next render's `useState` call returns the new value. Every render has its own frozen copy, which is also why calling `setCount(count + 1)` three times only increments by one, and why the functional form exists."*

### Q: "What does the useEffect dependency array actually do?"
> *"React stores the array from the previous render and compares each element with `Object.is`. All equal → skip the effect. Any different → run the previous cleanup, then the effect. No array means run after every render; an empty array means run once on mount, because nothing can change."*

### Q: "When does the cleanup function run?"
> *"Before every re-run of the effect and on unmount — not just unmount. If an effect depends on `roomId`, changing it unsubscribes from the old room before subscribing to the new one. Cleanup isn't 'unmount code', it's the reverse of setup. That pairing is what makes effects reversible, and it's what Strict Mode's double-invocation is testing."*

### Q: "What causes an infinite loop in useEffect?"
> *"Usually setting state the effect depends on, or omitting the dependency array while calling setState. Also a non-primitive dependency — an object, array or function literal recreated every render — since the reference comparison always fails. Fixes: a correct dependency array, primitives in deps, `useCallback`/`useMemo` for non-primitives, or functional updates so you can drop the dependency."*

### Q: "What's a race condition in data fetching and how do you fix it?"
> *"Responses don't arrive in request order. If a user types quickly, an earlier slow request can resolve after a later fast one and overwrite correct results with stale data. Fix it in the effect's cleanup: a `cancelled` boolean checked before setState, or an `AbortController` whose signal you pass to fetch and abort in cleanup. AbortController is better because it actually cancels the request rather than just ignoring the response."*

### Q: "What is a stale closure?"
> *"A callback that captured props or state from an earlier render and keeps using those frozen values. Classic case: an empty dependency array plus an interval — the callback created on the first render lives forever with `count` equal to zero. It means you lied in the dependency array. Fixes: a functional update so you never read the captured value, add the real dependency, or keep the latest value in a ref."*

### Q: "Why do effects run twice in development?"
> *"React 18 Strict Mode mounts, unmounts and remounts each component in dev, so every effect runs setup, cleanup, setup. It surfaces effects that aren't properly reversible. It doesn't happen in production, and suppressing it with a ref flag hides a real bug rather than fixing it."*

### Q: "When should you NOT use useEffect?"
> *"When there's no external system involved. Transforming data for rendering should be a plain calculation or `useMemo`; responding to a user event belongs in the handler; resetting state when a prop changes is better done with a `key`. Effects are for synchronizing with things outside React — network, timers, subscriptions, the DOM, browser APIs."*

### Q: "Why does everything re-render when a context value changes?"
> *"Context propagation doesn't go through props — every consumer re-renders when the provider's value changes, and `React.memo` can't stop it since memo only compares props. The usual cause is an inline object as `value`, a new reference every render; wrap it in `useMemo`. Beyond that, split contexts by concern and update frequency, and separate state from dispatch since dispatch is stable."*

### Q: "useState vs useReducer?"
> *"`useState` for independent, simple values. `useReducer` when several values change together, when update logic is complex or duplicated across handlers, or when the next state depends on the previous non-trivially. The reducer centralizes all transitions in one pure function that's trivially unit-testable, components dispatch what happened rather than how to update, impossible states become unreachable, and `dispatch` has a stable identity so it's safe in dependency arrays."*

### Q: "useMemo vs useCallback?"
> *"`useMemo` caches the result of calling a function; `useCallback` caches the function itself. `useCallback(fn, deps)` is literally `useMemo(() => fn, deps)`. Use `useMemo` for expensive computations or to keep an object or array reference stable, and `useCallback` for function props passed to memoized children or used in dependency arrays."*

### Q: "Does `useCallback` improve performance by itself?"
> *"No. It only helps if the receiver actually compares the reference — a `React.memo` child, an effect dependency, or a custom hook dependency. Passing a memoized callback to a normal child does nothing except add memory and comparison overhead. Both halves are required."*

### Q: "When is memoization the wrong choice?"
> *"When the computation is cheap. `useMemo` stores the function, deps and result and compares deps every render, so for simple math, string concatenation or small arrays you pay more than you save. Profile first. It's also a hint, not a guarantee — React may discard cached values, so never depend on it for correctness."*

### Q: "useRef vs useState?"
> *"Both persist across renders, but changing a ref doesn't trigger a re-render and you mutate `.current` in place rather than replacing the value. Use state when the UI must reflect the value; use a ref for bookkeeping the UI doesn't show — DOM nodes, timer ids, previous values, instance flags. Reading or writing a ref during render is impure; do it in effects or handlers."*

### Q: "useEffect vs useLayoutEffect?"
> *"`useEffect` runs asynchronously after the browser paints; `useLayoutEffect` runs synchronously before paint. Use layout effects only when you measure the DOM and immediately change it — otherwise the user sees a flash of the pre-adjustment layout. Because it blocks painting, slow work there freezes the UI, and it doesn't run during SSR."*

### Q: "What is `forwardRef` and is it still needed?"
> *"It lets a parent's ref pass through a component to a DOM node inside it, since `ref` isn't a normal prop. Essential for design-system components wrapping native elements. In React 19 `ref` became a regular prop for function components and `forwardRef` is deprecated, but existing code is full of it."*

### Q: "What problem does `useId` solve?"
> *"Generating ids for accessibility attributes like `htmlFor` and `aria-describedby` without breaking SSR. A random id differs between server and client and causes a hydration mismatch; `useId` produces the same stable value on both. It's per component instance, so it must not be used for list keys."*

### Q: "`useTransition` vs `useDeferredValue`?"
> *"Both mark work as non-urgent so React can interrupt it and keep the UI responsive. `useTransition` wraps the state update — use it when you own the setter — and gives you an `isPending` flag. `useDeferredValue` wraps a value you receive, from props say, and returns a version that lags behind. Same mechanism, different entry point."*

### Q: "What is `useSyncExternalStore` for?"
> *"Subscribing to state that lives outside React — a store library, `localStorage`, or a browser API like online status. With concurrent rendering a `useEffect`-based subscription can tear: components in the same render pass read different values. This hook forces a consistent snapshot. In practice it's used by libraries like Zustand and Redux rather than directly in app code."*

---

<a name="cheatsheet"></a>
# 12. Quick revision cheat sheet

```
HOOK            a function that lets a FUNCTION component use React features
                (state, lifecycle, context, refs). React 16.8, Feb 2019.
                name starts with `use` · only in components/custom hooks · tracked by ORDER

WHY THEY EXIST  before: state needed a CLASS · logic split across lifecycle methods
                        · stateful logic unreusable (HOC/render props → wrapper hell)
                        · `this` binding tax
                after:  one line for state · code grouped by CONCERN · custom hooks
                        extract logic with NO tree changes · no `this`

RULES           1. top level only — no if/loops/nested fns/after early return
                2. only from components (Capitalized) or custom hooks (useX)
                WHY: hooks live in a per-component ordered SLOT LIST.
                     Conditional hook → order shifts → state lands in the wrong slot.
                enforce with eslint-plugin-react-hooks

useState        [v, setV] = useState(init) — value + setter; setter identity STABLE
                BEFORE: local var → resets each render + no re-render
                        module var → shared by all instances
                lazy: useState(() => expensive())    functional: setV(p => …)
                objects/arrays: setters REPLACE, never merge → spread
                🔑 STATE IS A SNAPSHOT — a const per render, frozen in every closure
                ❌ log after set · double set from one snapshot · mutation
                   · initializer running every render · derived data · set during render

useEffect       "synchronize with an EXTERNAL system" — not "run on mount"
                BEFORE: 3 lifecycle methods that had to agree; the update case
                        was forgotten constantly → leaked subscriptions
                no array → every render · [] → once · [a,b] → when a or b changes
                cleanup = THE REVERSE OF SETUP → runs before every re-run AND on unmount
                ∞ LOOPS: no array + setState · object/fn deps · setting your own dep
                API: loading/error/data · !r.ok check · cancel in cleanup
                RACE: flag `cancelled` ✅ | AbortController ✅✅ (cancels the request)
                      ignore e.name === "AbortError"
                STALE CLOSURE: [] + interval → frozen values. The deps array is a CLAIM.
                      fix: setX(c=>c+1) · add the dep · ref for the latest
                STRICT MODE dev: setup→cleanup→setup. A TEST, not a bug — never suppress
                ❌ DON'T USE for: deriving data · handling events · resetting on prop
                                  change (use key) · chained setState effects

useContext      value = useContext(Ctx) — reads the NEAREST Provider above
                BEFORE: prop drilling through uninterested components, OR
                        <Ctx.Consumer> render props nesting 3 deep inside JSX
                createContext(default) → <Ctx.Provider value> → useContext(Ctx)
                nesting the same context OVERRIDES it for a subtree
                🔥 EVERY consumer re-renders on value change — React.memo CAN'T stop it
                ✅ useMemo the value · split by concern AND update frequency
                   · separate state/dispatch contexts · custom hook that throws if missing
                ❌ fast-changing state — Context is TRANSPORT, not a store

useReducer      [state, dispatch] = useReducer(reducer, init, initFn?)
                reducer(state, action) → newState — PURE · dispatch identity STABLE
                BEFORE: 3 useStates for one concept → impossible states reachable,
                        transition logic duplicated in every handler
                AFTER:  components say WHAT HAPPENED, not how to update
                        impossible states become unreachable by construction
                        reducer is unit-testable with no rendering
                USE WHEN: values change together · complex/duplicated logic · 4+ related
                          useStates · deeply nested state
                COST: indirection.  useReducer + useContext = lightweight Redux

useMemo         cache a VALUE.  useMemo(() => compute(a), [a])
                BEFORE: object literals = new reference each render → memo always misses,
                        effects fire constantly, expensive work repeats
                ✅ measurably expensive work · REFERENCE STABILITY (memo/deps/context)
                ❌ primitives · trivial math/strings · small arrays · "just in case"
                a HINT, not a guarantee — never rely on it for correctness

useCallback     cache a FUNCTION.  useCallback(fn, deps) === useMemo(() => fn, deps)
                🔥 USELESS ALONE — needs React.memo child / effect dep / hook dep
                ❌ missing deps → stale closure · a dep that changes every render
                never needed for setState or dispatch (already stable)
                React 19 Compiler auto-memoizes → most manual memo becomes unnecessary

useRef          a box that SURVIVES renders and does NOT trigger one
                BEFORE: local var (lost each render) vs state (needless re-render)
                        · document.getElementById reaching around React
                → PERSISTENCE WITHOUT REACTIVITY
                UI must show it → state.  Bookkeeping → ref.
                uses: DOM access · mutable instance vars · previous value
                      · timer ids · focus management
                ❌ read/write during render (impure) · expect a re-render
                   · .current is null on first render → use effects, or ?.
                never use a ref to CHANGE what's displayed

useLayoutEffect  before PAINT, synchronous → measure + adjust DOM, no flash
                 blocks painting · no SSR
forwardRef       pass a ref through to an inner DOM node (ref isn't a normal prop)
                 🆕 React 19: ref IS a normal prop; forwardRef deprecated
useImperativeHandle  expose chosen methods via ref instead of the DOM node
                 escape hatch — component libraries only
useId            stable SSR-safe id for htmlFor/aria — ❌ NOT for list keys
useTransition    mark an UPDATE non-urgent → [isPending, startTransition]
useDeferredValue mark a VALUE non-urgent → lagging copy (when you don't own the setter)
useSyncExternalStore  subscribe to state outside React; prevents concurrent TEARING
                 (used by Zustand/Redux, rarely in app code)
useInsertionEffect  earliest hook — CSS-in-JS style injection only
```

---

## Connects to

- **[Part 5 — State](05-state.md):** snapshots, immutable updates, batching, lifting — the foundation `useState` and `useReducer` sit on.
- **[Part 6 — Lifecycle](06-lifecycle.md):** the class → hooks mapping, render vs commit phase, why `useEffect` runs after paint and `useLayoutEffect` before it.
- **[Part 2 — Components](02-components.md):** `React.memo` — the other half of every `useCallback`/`useMemo` optimization.
- **[Part 4 — Props](04-props.md):** prop drilling — the problem `useContext` solves.
- **Custom Hooks (next):** the reason hooks were created — extracting stateful logic with no tree changes.
- **Performance:** the Profiler, when memoization actually pays, list virtualization, the React Compiler.
- **State management:** Context vs Zustand vs Redux; React Query for server state.

## Suggested next topics

1. **Custom Hooks** — recommended next; the payoff of everything in this part.
2. **Rendering internals / Virtual DOM** — Fiber, reconciliation, concurrent rendering.
3. **Performance optimization** — memo, profiling, virtualization.

*— End of Part 7: React Hooks —*
