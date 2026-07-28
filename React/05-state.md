# React Study Notes — Part 5

## State (Local, Global, Derived, vs Props, Immutable & Functional Updates, Batching, Lifting) + Component Communication

> **Format:** Conceptual **"how it works"** notes, fresh-start friendly — every term translated, nothing assumed. Follows the 14-question framework (what / why / how internally / when to use / when to avoid / pros / cons / performance / common mistakes / interview Qs / code examples / advanced / quick revision).
>
> **Roadmap:** this is the **State** half of the roadmap's "Part 2 — Props & State". Props are in [Part 4](04-props.md).
>
> **Continues:** [Part 1 — Fundamentals](01-react-fundamentals.md) · [Part 2 — Components](02-components.md) · [Part 3 — JSX](03-jsx-deep-dive.md) · [Part 4 — Props](04-props.md).

---

## Table of Contents

1. [Local State](#local)
2. [Global State](#global)
3. [Derived State](#derived)
4. [State vs Props](#vs-props)
5. [Immutable Updates](#immutable)
6. [Functional Updates](#functional)
7. [State Batching](#batching)
8. [State Lifting](#lifting)
9. [Communication Examples](#communication)
10. [Interview questions & answers](#interview)
11. [Quick revision cheat sheet](#cheatsheet)

---

<a name="local"></a>
# 1. Local State

**State = data a component owns and remembers between renders.**

```jsx
function Counter() {
  const [count, setCount] = useState(0);
  //     ↑        ↑                  ↑
  //   value   setter        initial value (first render only)

  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

`useState` returns an **array of two things**, and `[count, setCount]` is array destructuring. Name them anything — convention is `x` / `setX`.

## Why a normal variable doesn't work

```jsx
function Counter() {
  let count = 0;                              // ❌
  return <button onClick={() => count++}>{count}</button>;
}
```

Two failures:
1. **No re-render.** Changing a plain variable tells React nothing — the screen never updates.
2. **No memory.** On the next render the function runs top to bottom again and `count` resets to `0`.

**`useState` fixes both:** React stores the value *outside* your function (attached to the component's slot in the tree), and the setter tells React "re-render this component."

```
                    ┌──────────────────────────┐
   your function ──►│  React's internal store  │
   asks for state   │  Counter → [ 0 ]         │  survives re-renders
                    └──────────────────────────┘
   setCount(1) ──► update store ──► mark dirty ──► re-render ──► useState returns 1
```

## 🔑 State is a snapshot, not a live variable

The concept that separates people who "use React" from people who "understand React."

```jsx
function Counter() {
  const [count, setCount] = useState(0);

  function handleClick() {
    setCount(count + 1);
    console.log(count);       // logs 0, NOT 1  😲
  }
}
```

`count` is a **const inside this render's function call**. It cannot change. `setCount` doesn't edit that variable — it tells React to run the function *again*, and the *next* run gets a new `count`.

**Every render has its own `count`, frozen in time.**

```
render #1:  count = 0   ← handleClick defined here always sees 0
render #2:  count = 1   ← a NEW handleClick, sees 1
render #3:  count = 2
```

The famous consequence:

```jsx
function handleClick() {
  setCount(count + 1);   // count is 0 → schedules "set to 1"
  setCount(count + 1);   // count is STILL 0 → schedules "set to 1"
  setCount(count + 1);   // count is STILL 0 → schedules "set to 1"
}
// Result: 1, not 3
```

Fix → functional updates (§6).

## Lazy initialization

```jsx
const [data, setData] = useState(expensiveCompute());       // ❌ runs EVERY render
const [data, setData] = useState(() => expensiveCompute()); // ✅ runs ONCE
```

Without the arrow, JS evaluates the argument every render — React just ignores it after the first. Pass a **function** and React calls it only on mount. Matters for `localStorage.getItem`, parsing, or heavy computation.

## Multiple state variables vs one object

```jsx
// ✅ preferred — independent values, independent updates
const [name, setName] = useState("");
const [age, setAge]   = useState(0);

// also fine when values change together
const [form, setForm] = useState({ name: "", age: 0 });
setForm(prev => ({ ...prev, name: "V" }));   // ⚠️ must spread — no auto-merge
```

Unlike class `this.setState`, hook setters **replace**, they don't merge. Split state that changes independently; group state that always changes together.

## 🆕 Resetting state with `key`

```jsx
<Profile key={userId} userId={userId} />
```

When `key` changes, React treats it as a **different component**: unmounts the old, mounts a fresh one, and **all its state resets**. Far cleaner than a `useEffect` that manually resets six state variables.

---

<a name="global"></a>
# 2. Global State

**State that many components across the tree need.** Auth user, theme, cart, language.

The problem: local state lives in one component. Sharing it means lifting it high — and if it reaches `App`, everything below drills props.

## The three tiers

| Tool | For | Cost |
|---|---|---|
| **Lifting state up** | 2–3 nearby components | free, but causes drilling if deep |
| **Context API** | app-wide, **rarely changing** — theme, auth, locale | every consumer re-renders on any change |
| **Redux / Zustand / Jotai** | large, complex, **frequently changing** shared state | a dependency + concepts to learn |

## Context in 30 seconds

```jsx
const ThemeContext = createContext();

function App() {
  const [theme, setTheme] = useState("dark");
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <Page />                        {/* no props threaded */}
    </ThemeContext.Provider>
  );
}

function Button() {
  const { theme } = useContext(ThemeContext);   // reach in from any depth
  return <button className={theme}>Click</button>;
}
```

## ⚠️ Context is not a state manager

It's a **transport mechanism** — it moves a value down the tree without props. No store, no reducers, no optimization. **Any change to the provider's `value` re-renders every consumer**, whether or not they use the part that changed.

```jsx
// ❌ new object EVERY render → every consumer re-renders every time
<ThemeContext.Provider value={{ theme, setTheme }}>

// ✅ stabilize it
const value = useMemo(() => ({ theme, setTheme }), [theme]);
<ThemeContext.Provider value={value}>
```

**Rule of thumb:** Context for things that change **rarely**. A cart updating on every click, or form state, belongs in a store like Zustand — which lets components subscribe to *slices* and skip unrelated updates.

## ⚠️ Not everything shared is "global state"

Much of what people put in Redux is really **server data** — API responses needing caching, refetching and invalidation. That's **React Query / SWR**'s job, not a global store. Modern apps split it:

```
server data   → React Query / SWR   (users, posts, orders)
UI state      → Context or Zustand  (theme, sidebar open, modal)
local state   → useState            (input value, hover, toggle)
```

---

<a name="derived"></a>
# 3. Derived State

**If you can calculate a value from existing state or props — calculate it. Don't store it.**

```jsx
// ❌ duplicated state — now there are two sources of truth
function Cart({ items }) {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setTotal(items.reduce((s, i) => s + i.price, 0));   // sync it manually
  }, [items]);
}

// ✅ derived — one source of truth, always correct
function Cart({ items }) {
  const total = items.reduce((s, i) => s + i.price, 0);   // just compute it
}
```

## Why the first version is a bug factory

1. **Two sources of truth** that can disagree.
2. **An extra render every time** — items change → render → effect → setState → render again. The user briefly sees a stale total.
3. **Every new mutation path must remember to update it.** Miss one → silently wrong number.
4. **More code** to do less.

## 🚩 Recognize the anti-pattern

Any `useEffect` whose only job is to call `setState` based on props or other state is almost always derived state in disguise.

```jsx
useEffect(() => { setFullName(first + " " + last); }, [first, last]);   // 🚩
const fullName = first + " " + last;                                   // ✅
```

## More examples

```jsx
const filtered  = items.filter(i => i.name.includes(query));  // not state
const isValid   = email.includes("@") && password.length > 7; // not state
const selected  = items.find(i => i.id === selectedId);       // not state
const pageCount = Math.ceil(total / perPage);                 // not state
```

**Only `items`, `query`, `email`, `password`, `selectedId` are real state.** Everything else follows from them.

> **Tip:** store the **id**, derive the object. Storing the whole selected object means it goes stale when the list updates.

## When derivation is genuinely expensive

```jsx
const sorted = useMemo(
  () => hugeList.sort(expensiveComparator),
  [hugeList]
);
```

`useMemo` caches the *computed* value — still derived, still one source of truth, just not recomputed unnecessarily. **For expensive work only** — recomputing a filter over 50 items every render is free.

## The rare legit case

Sometimes you need a value that *starts* from a prop then diverges — an editable form pre-filled from the server, where the user's edits shouldn't be overwritten:

```jsx
function EditForm({ user }) {
  const [name, setName] = useState(user.name);   // initial value only
  // now `name` is independent — user edits don't get clobbered
}
```

That's real state, not derived — the prop is just the seed. To reset it when a *different* user loads, use `key={user.id}` on the component.

---

<a name="vs-props"></a>
# 4. State vs Props

| | **Props** | **State** |
|---|---|---|
| Owner | the parent | the component itself |
| Mutable by the component? | ❌ never | ✅ via the setter |
| Source | outside | inside |
| Triggers re-render? | when the parent re-renders | when the setter is called |
| Initial value | supplied by the caller | supplied by `useState` |
| Analogy | function arguments | a variable that survives calls |

## The decision flowchart

```
Does the value come from a parent?           → props
Does it change over time from user action?   → state
Can it be calculated from props/state?       → derived (neither!)
Does it not affect rendering at all?         → useRef, not state
```

That last one matters: a timer id, a previous value, a DOM node — none should be state. State causes re-renders; refs don't.

## Both together — the standard shape

```jsx
function Parent() {
  const [query, setQuery] = useState("");   // STATE — parent owns it

  return <SearchBox value={query} onChange={setQuery} />;
  //                  ↑ becomes PROPS in the child
}
```

**The same value is state in the owner and props in the child.** That's the entire architecture: state has exactly one owner; everyone else sees props.

---

<a name="immutable"></a>
# 5. Immutable Updates

**Never modify state directly. Always create a new value.**

```jsx
// ❌ mutation — React sees nothing
items.push(newItem);
setItems(items);

user.name = "V";
setUser(user);

// ✅ new value
setItems([...items, newItem]);
setUser({ ...user, name: "V" });
```

## Why mutation silently fails

React decides whether to re-render by comparing old vs new with **`Object.is`** — a reference check for objects.

```js
const arr = [1, 2];
arr.push(3);
arr === arr        // true — SAME reference
// React: "nothing changed" → NO RE-RENDER
```

You mutated the array, so the data *is* different — but the **reference** is identical, so React skips the update. **Your data changed and your screen didn't.**

This also breaks `React.memo` children, `useEffect` dependency arrays, and any downstream `useMemo` — all reference comparisons.

## The array recipes

```jsx
const [items, setItems] = useState([]);

// add to end
setItems([...items, newItem]);

// add to front
setItems([newItem, ...items]);

// remove by id
setItems(items.filter(i => i.id !== id));

// update one item
setItems(items.map(i => i.id === id ? { ...i, done: true } : i));

// insert at index
setItems([...items.slice(0, i), newItem, ...items.slice(i)]);

// sort / reverse — ⚠️ these MUTATE, so copy first
setItems([...items].sort(byName));
```

**Mutating methods to avoid on state:** `push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`.
**Safe (return new arrays):** `map`, `filter`, `slice`, `concat`, `...spread`.

> Memory aid: **`splice` mutates, `slice` copies.**

## Nested objects — spread is shallow

```jsx
const [user, setUser] = useState({
  name: "V",
  address: { city: "Pune", pin: "411001" }
});

// ✅ correct — every level you change gets its own spread
setUser({ ...user, address: { ...user.address, city: "Mumbai" } });

// ❌ wrong — mutates the ORIGINAL nested object
const copy = { ...user };
copy.address.city = "Mumbai";
```

Deeper:

```jsx
setState({
  ...state,
  a: { ...state.a, b: { ...state.a.b, c: newValue } }
});
```

**When this gets painful, that's a design signal.** Options: flatten the state shape, split into multiple `useState` calls, move to `useReducer`, or bring in **Immer** (`produce`) — write mutating syntax, get an immutable result.

---

<a name="functional"></a>
# 6. Functional Updates

**When the new state depends on the old state, pass a function instead of a value.**

```jsx
setCount(count + 1);        // uses the value from THIS render (a snapshot)
setCount(c => c + 1);       // React passes the LATEST value — always correct
```

## The problem it solves

```jsx
function handleClick() {
  setCount(count + 1);   // count = 0 → "set to 1"
  setCount(count + 1);   // count = 0 → "set to 1"
  setCount(count + 1);   // count = 0 → "set to 1"
}
// final: 1  ❌
```

All three read the same frozen snapshot. With functional updates React **queues** them and applies each to the result of the previous:

```jsx
function handleClick() {
  setCount(c => c + 1);   // queued: 0 → 1
  setCount(c => c + 1);   // queued: 1 → 2
  setCount(c => c + 1);   // queued: 2 → 3
}
// final: 3  ✅
```

## The stale closure bug — the real-world case

```jsx
useEffect(() => {
  const id = setInterval(() => {
    setCount(count + 1);      // ❌ `count` is frozen at 0 forever
  }, 1000);
  return () => clearInterval(id);
}, []);                       // empty deps → this effect only ever ran once
```

The interval callback was created during render #1, where `count` was `0`. It's still `0` a minute later — the counter sticks at 1.

```jsx
setCount(c => c + 1);   // ✅ no dependency on the captured value
```

Now the callback never reads `count` — React supplies the current value. **This is why functional updates let you keep dependency arrays empty.**

## When to use which

```
new value depends on old value        → functional  setX(prev => …)
multiple updates in one handler       → functional
inside setInterval / setTimeout       → functional
inside a useEffect with empty deps    → functional
async callback (fetch .then)          → functional
brand-new value, unrelated to old     → direct      setX(value)
```

Setting from an input — `setName(e.target.value)` — direct is right; the new value has nothing to do with the old.

> **Habit worth forming:** if the word *previous*, *current*, *toggle* or *increment* is in your head, use the function form.

Works for every type:

```jsx
setItems(prev => [...prev, newItem]);
setUser(prev => ({ ...prev, name: "V" }));
setOpen(prev => !prev);
```

---

<a name="batching"></a>
# 7. State Batching

**React groups multiple state updates into a single re-render.**

```jsx
function handleClick() {
  setA(1);
  setB(2);
  setC(3);
}
// ONE re-render, not three
```

Without batching you'd render three times and the user could see intermediate states — the "flicker" problem.

## How it works

React doesn't apply updates immediately. It queues them, finishes the event handler, then processes the whole queue in one pass.

```
click
  ↓
setA(1) → queue
setB(2) → queue
setC(3) → queue
  ↓
handler finishes
  ↓
React processes queue → ONE render → ONE diff → ONE commit
```

**This is also why state looks "asynchronous":**

```jsx
setCount(1);
console.log(count);   // still the old value — the queue hasn't been processed
```

State isn't async in the promise sense; it's **scheduled**. And the `count` in your current function is a snapshot that can never change anyway (§1).

## 🆕 React 18 — automatic batching

**Before React 18**, batching only happened inside React event handlers. Everywhere else, each `setState` triggered its own render:

```jsx
// React 17 behaviour
fetch("/api").then(() => {
  setLoading(false);   // render #1
  setData(data);       // render #2   😕 two renders
});

setTimeout(() => {
  setA(1);             // render #1
  setB(2);             // render #2
}, 0);
```

**React 18 batches everywhere** — promises, `setTimeout`, native event listeners, all of it. The same code now produces one render. It arrived with `createRoot` (React 18's new root API); automatic, no opt-in.

## Opting out — `flushSync`

Rarely needed, but for when you must read the DOM between updates:

```jsx
import { flushSync } from "react-dom";

flushSync(() => { setItems([...items, newItem]); });        // forced sync render
listRef.current.scrollTop = listRef.current.scrollHeight;   // DOM already updated
```

Use sparingly — it defeats the optimization batching exists for.

## The gotcha batching creates

```jsx
setCount(count + 1);
setCount(count + 1);   // both read the same snapshot → +1 total
```

Batching + snapshots is exactly why functional updates exist. **Batching groups the *renders*; functional updates make each queued update see the *result of the previous one*.**

---

<a name="lifting"></a>
# 8. State Lifting

**When two components need the same state, move it to their nearest common parent.**

## The problem

```jsx
function Celsius()    { const [temp, setTemp] = useState(0); ... }
function Fahrenheit() { const [temp, setTemp] = useState(0); ... }
```

Two independent copies. Type in one, the other doesn't know. **Siblings cannot see each other's state.**

## The fix

```jsx
function Converter() {
  const [celsius, setCelsius] = useState(0);      // ⬆️ LIFTED to the parent

  return (
    <>
      <Celsius    value={celsius} onChange={setCelsius} />
      <Fahrenheit value={celsius * 9/5 + 32}
                  onChange={f => setCelsius((f - 32) * 5/9)} />
    </>
  );
}

function Celsius({ value, onChange }) {
  return <input value={value} onChange={e => onChange(+e.target.value)} />;
}
```

```
BEFORE                          AFTER
  Converter                       Converter  ← owns `celsius` (single source of truth)
   ├── Celsius    [temp]           ├── Celsius     ← props only (controlled)
   └── Fahrenheit [temp]           └── Fahrenheit  ← props only (controlled)
   two truths, out of sync         one truth, always in sync
```

Both children became **controlled components** ([Part 2 §6](02-components.md)) — they don't own their value; they display what they're given and report changes upward.

## The procedure

1. Find the **nearest common ancestor** of the components that need the value.
2. Move the `useState` there.
3. Pass the value **down** as a prop.
4. Pass a setter/handler **down** as a prop.
5. Children become controlled.

## ⚠️ The cost — don't over-lift

Every lift means more prop passing, and the parent re-renders on every change (so its whole subtree re-renders). **Lift to the nearest common parent — not to `App`.**

```
Lifted too high  →  prop drilling + the entire app re-renders on every keystroke
Not lifted       →  components out of sync
Just right       →  nearest common ancestor
```

> **Rule:** state lives at the **lowest** point in the tree where every component that needs it is a descendant.

---

<a name="communication"></a>
# 9. Communication Examples

The four cases you'll be asked to write on a whiteboard.

## A. Parent → Child (props)

```jsx
function Parent() {
  const [user, setUser] = useState({ name: "Vishal" });
  return <Child user={user} />;
}

function Child({ user }) {
  return <p>{user.name}</p>;
}
```

The default direction. Nothing else to it.

## B. Child → Parent (callback prop)

The child can't push data upward — so the parent hands down a function.

```jsx
function Parent() {
  const [message, setMessage] = useState("");

  return (
    <>
      <p>Child said: {message}</p>
      <Child onSend={setMessage} />       {/* pass the setter, or a handler */}
    </>
  );
}

function Child({ onSend }) {
  return <button onClick={() => onSend("Hello!")}>Send</button>;
}
```

```
Parent  ──── onSend (function) ────►  Child
   ▲                                    │
   └──── child CALLS onSend("Hello") ───┘
Parent updates its own state → re-render → new message flows down
```

**The key insight:** the child never changes the parent's state. It **asks**. The parent decides.

## C. Sibling → Sibling (lift state up)

Siblings have **no direct channel**. Route through the common parent.

```jsx
function Parent() {
  const [message, setMessage] = useState("");   // shared state lives here

  return (
    <>
      <SiblingA onSend={setMessage} />   {/* writes */}
      <SiblingB message={message} />     {/* reads  */}
    </>
  );
}

function SiblingA({ onSend }) {
  return <input onChange={e => onSend(e.target.value)} />;
}

function SiblingB({ message }) {
  return <p>{message}</p>;
}
```

```
        Parent  ← owns the state
        ╱     ╲
   SiblingA   SiblingB
   (writes)    (reads)

A → up to Parent → down to B.  Never A → B directly.
```

**This is just child→parent + parent→child chained together.** That's the whole trick.

## D. Deep nested components

Four options, in order of preference.

**Option 1 — Composition (try first).** Restructure so the consumer is *created* where the data lives:

```jsx
function App() {
  const [user, setUser] = useState(null);
  return (
    <Layout>
      <Sidebar>
        <Avatar user={user} />     {/* created here — never travels */}
      </Sidebar>
    </Layout>
  );
}
function Layout({ children })  { return <div>{children}</div>; }
function Sidebar({ children }) { return <aside>{children}</aside>; }
```

**Option 2 — Context.** For genuinely global, rarely-changing data:

```jsx
const UserContext = createContext();

function App() {
  const [user, setUser] = useState(null);
  const value = useMemo(() => ({ user, setUser }), [user]);   // stabilize!

  return (
    <UserContext.Provider value={value}>
      <Layout />
    </UserContext.Provider>
  );
}

function Avatar() {
  const { user } = useContext(UserContext);   // any depth, no props
  return <img src={user.avatar} />;
}
```

**Option 3 — A store (Zustand / Redux).** Frequently changing shared state, where components subscribe to slices:

```jsx
const useStore = create(set => ({
  user: null,
  setUser: user => set({ user }),
}));

function Avatar() {
  const user = useStore(s => s.user);   // re-renders ONLY when user changes
  return <img src={user.avatar} />;
}
```

**Option 4 — Custom hook (for logic, not just data):**

```jsx
function useAuth() {
  const { user, setUser } = useContext(UserContext);
  const login  = creds => api.login(creds).then(setUser);
  const logout = ()    => setUser(null);
  return { user, login, logout };
}

function Navbar() { const { user, logout } = useAuth(); ... }
```

## The decision table

| Situation | Use |
|---|---|
| Parent → child | props |
| Child → parent | callback prop |
| Sibling ↔ sibling | lift state to the common parent |
| 1–2 levels deep | just drill — it's explicit |
| Middle layers are generic | composition / `children` |
| Global, rarely changes | Context |
| Global, changes often | Zustand / Redux |
| Server data | React Query / SWR |
| Shared *logic*, not data | custom hook |

---

<a name="interview"></a>
# 10. Interview questions & answers

### Q: "What is state and how is it different from a normal variable?"
> *"State is data a component owns that persists across renders and triggers a re-render when it changes. A normal variable resets every render because the function runs top to bottom again, and changing it doesn't notify React, so the UI never updates. `useState` stores the value outside the function — in React's internal structure for that component — and the setter schedules a re-render."*

### Q: "Why does `console.log(count)` right after `setCount` show the old value?"
> *"Because `count` is a const captured in that render's closure — a snapshot. `setCount` doesn't reassign it; it schedules a re-render, and the next render's call to `useState` returns the new value. Each render has its own frozen copy of state, which is also why calling `setCount(count + 1)` three times only increments by one."*

### Q: "`setCount(count + 1)` vs `setCount(c => c + 1)`?"
> *"The first uses the value from the current render's snapshot, so multiple calls in one handler all read the same stale value. The functional form receives the latest queued state, so updates compose correctly. It also avoids stale closures inside intervals, timeouts and effects with empty dependency arrays, since it never reads the captured variable."*

### Q: "Why must state updates be immutable?"
> *"React compares previous and next state with `Object.is`, which is a reference check for objects and arrays. If you mutate in place the reference is unchanged, so React concludes nothing happened and skips the re-render — the data changed but the screen didn't. It also breaks `React.memo`, effect dependency arrays and `useMemo`, which all compare references."*

### Q: "How do you update a nested object in state?"
> *"Spread every level you're changing, because spread is shallow: `setUser({...user, address: {...user.address, city: 'Mumbai'}})`. If that gets deep and painful, it's a signal to flatten the state shape, split it into multiple state variables, move to `useReducer`, or use Immer, which lets you write mutating syntax and produces an immutable result."*

### Q: "What is batching, and what changed in React 18?"
> *"Batching groups multiple state updates in the same tick into a single re-render, so you don't render three times or flash intermediate UI. Before React 18 it only applied inside React event handlers — updates in promises, timeouts or native listeners each caused their own render. React 18 introduced automatic batching everywhere, enabled by `createRoot`. You can opt out with `flushSync` when you need the DOM updated before the next line runs."*

### Q: "What is derived state and why avoid storing it?"
> *"Derived state is any value computable from existing props or state — a total, a filtered list, a validity flag. Storing it in `useState` and syncing with an effect creates two sources of truth that can disagree, causes an extra render, and requires every mutation path to remember to update it. Just compute it during render, and wrap it in `useMemo` only if the computation is genuinely expensive."*

### Q: "When is an effect that calls setState a red flag?"
> *"When it only derives a value from props or other state — that's derived state and should be a plain calculation during render. Effects are for synchronizing with things outside React: network requests, subscriptions, timers, direct DOM work. If the effect's whole body is 'when X changes, set Y', Y probably shouldn't be state at all."*

### Q: "What is lifting state up?"
> *"Moving state to the nearest common ancestor of the components that need it, so there's a single source of truth. The children become controlled — they receive the value as a prop and report changes through a callback. It's how sibling communication works, since siblings can't see each other directly. The caveat is not to lift higher than necessary, since the owner and its whole subtree re-render on every change."*

### Q: "How do two sibling components communicate?"
> *"They don't, directly. State lifts to their common parent: one sibling calls a callback to update it, and the other receives the value as a prop. It's child-to-parent and parent-to-child chained. If the siblings are far apart or the tree between them is deep, Context or a store is the better route."*

### Q: "When would you use Context vs Redux/Zustand?"
> *"Context is a transport mechanism, not a state manager — it passes a value down without props but has no store or optimization, and every consumer re-renders whenever the provider's value changes. So Context suits data that's global and changes rarely: theme, locale, authenticated user. For frequently changing shared state I'd use Zustand or Redux, where components subscribe to slices and only re-render when their slice changes. And for server data specifically, React Query, which handles caching, refetching and invalidation that a plain store doesn't."*

### Q: "Why memoize a Context value?"
> *"Because an inline object like `value={{user, setUser}}` is a new reference every render, so every consumer re-renders even when nothing meaningful changed. Wrapping it in `useMemo` keyed on the real dependencies keeps the reference stable."*

### Q: "When should you use `useRef` instead of `useState`?"
> *"When the value doesn't affect rendering. Refs persist across renders like state but don't trigger a re-render when changed — right for timer ids, previous values, instance-like flags and DOM node handles. If the UI needs to reflect the value, it's state."*

### Q: "How do you reset a component's state when a prop changes?"
> *"Give the component a `key` tied to that prop, like `key={userId}`. When the key changes React unmounts the old instance and mounts a fresh one, so all its state resets. It's much cleaner than an effect that manually resets several state variables."*

### Q: "Why does `useState` accept a function for its initial value?"
> *"Because a plain argument is evaluated on every render even though React ignores it after mount. Passing a function makes React call it only on the first render, which matters for expensive initialization like reading and parsing `localStorage`."*

---

<a name="cheatsheet"></a>
# 11. Quick revision cheat sheet

```
STATE           data a component OWNS and REMEMBERS across renders.
                const [x, setX] = useState(initial)
                normal variable ❌ → resets each render + no re-render
                React stores it outside your function; setter schedules a render

🔑 SNAPSHOT     state is a CONST inside each render — it never changes mid-render
                setX() doesn't edit it; it schedules the NEXT render
                → console.log right after setX shows the OLD value
                → setX(x+1) three times = +1, not +3

LAZY INIT       useState(expensive())       ❌ runs every render
                useState(() => expensive()) ✅ runs once

RESET STATE     <Profile key={userId} /> — key change = new component = fresh state

GLOBAL          lift state       → 2–3 nearby components
                Context          → global + RARELY changes (theme/auth/locale)
                Zustand/Redux    → large + frequent, subscribe to slices
                React Query/SWR  → SERVER data (not a global-store job)
                ⚠️ Context = TRANSPORT, not a store.
                   ALL consumers re-render on any value change
                   → useMemo the provider value

DERIVED         computable from props/state? COMPUTE IT, don't store it
                🚩 a useEffect whose only job is setState from props = derived state
                two sources of truth · extra render · easy to forget to sync
                expensive? useMemo — still derived, just cached
                store the ID, derive the object

STATE vs PROPS  props = owned by parent, read-only, from outside
                state = owned by self, changeable, from inside
                from a parent?      → props
                changes over time?  → state
                computable?         → derived (neither)
                doesn't affect render? → useRef

IMMUTABLE       React compares with Object.is → REFERENCE check
                mutate → same ref → NO re-render (data changed, screen didn't)
                add     [...items, x]      / [x, ...items]
                remove  items.filter(...)
                update  items.map(i => i.id===id ? {...i, done:true} : i)
                sort    [...items].sort()   ⚠️ sort/reverse MUTATE
                ❌ push pop shift unshift splice sort reverse
                ✅ map filter slice concat spread  ("splice mutates, slice copies")
                nested → spread EVERY level. Painful? → flatten / useReducer / Immer

FUNCTIONAL      setX(prev => …) when the new value depends on the old
                fixes: multiple updates in one handler · stale closures in
                       setInterval / setTimeout / effects with empty deps
                direct setX(v) when the value is brand new (e.g. an input value)

BATCHING        multiple setStates in one tick → ONE re-render
                React 17: only inside React event handlers
                React 18: EVERYWHERE (promises, timeouts, native handlers) — automatic
                escape hatch: flushSync (forces a sync render; use sparingly)
                why state "seems async": it's SCHEDULED, then processed as a queue

LIFTING         two components need the same value → move state to the
                NEAREST common ancestor · pass value + setter down
                children become CONTROLLED
                ⚠️ don't lift to App — owner + whole subtree re-render

COMMUNICATION   parent → child     props
                child → parent     callback prop ("data down, actions up")
                sibling ↔ sibling  lift to the common parent (A→up→P→down→B)
                deep nested        composition/children → Context → store
                shared LOGIC       custom hook
```

---

## Connects to

- **[Part 4 — Props](04-props.md):** the other half of the data story. Lifting state turns children into prop-driven controlled components, and drilling is what pushes you to Context.
- **[Part 2 — Components](02-components.md):** controlled vs uncontrolled (§6–7 there) is state ownership applied to form inputs; `React.memo` (§3 there) is why immutable updates and stable references matter.
- **[Part 1 — Fundamentals](01-react-fundamentals.md):** `UI = f(state)` and the re-render → diff → commit pipeline that every `setState` kicks off.
- **Hooks (next):** `useState` internals, `useEffect`, `useRef`, `useReducer`, `useMemo`/`useCallback`, custom hooks.
- **Context API:** the deep dive on providers, consumers and re-render cost.
- **State management:** Redux, Zustand, Jotai; React Query for server state.
- **Performance:** why unnecessary re-renders happen and when they actually matter.

## Suggested next topics

1. **Hooks** — recommended next; `useState` internals, `useEffect` and the rules of hooks.
2. **Context API** — the deep-nesting fix, in depth.
3. **Lifecycle / `useEffect`** — mount, update, unmount and cleanup.

*— End of Part 5: State & Component Communication —*
