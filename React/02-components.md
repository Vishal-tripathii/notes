# React Study Notes — Part 2

## Components (Functional, Class, Pure, Smart/Dumb, Container/Presentational, Controlled/Uncontrolled, Reusable, Composition vs Inheritance)

> **Format:** Conceptual **"how it works"** notes, fresh-start friendly — every term translated, nothing assumed. Follows the 14-question framework (what / why / how internally / when to use / when to avoid / pros / cons / performance / common mistakes / interview Qs / code examples / advanced / quick revision).
>
> **Continues:** [Part 1 — React Fundamentals](01-react-fundamentals.md). Next: **JSX deep-dive** (rules, fragments, conditional rendering, lists & `key`), then **Props & State**, then **Hooks**.

---

## Table of Contents

1. [Functional Components](#functional)
2. [Class Components](#class)
3. [Pure Components](#pure)
4. [Smart vs Dumb Components](#smart-dumb)
5. [Container vs Presentational Components](#container)
6. [Controlled Components](#controlled)
7. [Uncontrolled Components](#uncontrolled)
8. [Reusable Components](#reusable)
9. [Composition vs Inheritance](#composition)
10. [Interview questions & answers](#interview)
11. [Quick revision cheat sheet](#cheatsheet)

---

<a name="functional"></a>
# 1. Functional Components

**A function that takes props and returns UI.** That's the whole definition.

```jsx
function Welcome({ name }) {
  return <h1>Hello, {name}</h1>;
}

// used as:
<Welcome name="Vishal" />
```

## What's happening under the hood

React calls your function and passes **one** argument — an object holding everything you wrote as attributes.

```jsx
<Welcome name="Vishal" age={25} />

// React calls:
Welcome({ name: "Vishal", age: 25 })
```

`{ name }` in the parameter list is just **destructuring** — pulling `name` out of that object. These are identical:

```jsx
function Welcome(props)     { return <h1>Hello, {props.name}</h1>; }
function Welcome({ name })  { return <h1>Hello, {name}</h1>; }
```

## State and side effects come from hooks

A plain function has no memory — it runs, returns, forgets. **Hooks** give functions memory and lifecycle:

```jsx
function Counter() {
  const [count, setCount] = useState(0);        // memory
  useEffect(() => { document.title = count; }); // side effect after paint
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

## Rules

1. **Capitalized name** — `Welcome`, not `welcome`. Lowercase compiles to the string `"welcome"` → treated as an unknown HTML tag.
2. **Must return** JSX, a string, a number, `null`, or an array. `return null` = render nothing (valid and common).
3. **Must be pure during render** — no DOM edits, no fetches, no mutating props inside the function body. Side effects belong in `useEffect` or event handlers.
4. **Hooks only at the top level** — never inside `if`, loops, or nested functions.

> **This is the modern default.** Since React 16.8 (2019, hooks), functional components do everything classes can. New code should use functions; classes are a legacy-code and interview topic.

---

<a name="class"></a>
# 2. Class Components

**The old way** — an ES6 class extending `React.Component` with a `render()` method.

```jsx
class Welcome extends React.Component {
  constructor(props) {
    super(props);                                   // MUST call — wires up this.props
    this.state = { count: 0 };                      // state is ONE object
    this.handleClick = this.handleClick.bind(this); // the `this` tax
  }

  handleClick() {
    this.setState({ count: this.state.count + 1 });
  }

  componentDidMount()    { /* after first render */ }
  componentDidUpdate()   { /* after every update */ }
  componentWillUnmount() { /* cleanup before removal */ }

  render() {
    return <button onClick={this.handleClick}>{this.state.count}</button>;
  }
}
```

## Side by side

| | **Class** | **Functional** |
|---|---|---|
| Definition | `class X extends React.Component` | `function X() {}` |
| Props | `this.props.name` | `props.name` / `{ name }` |
| State | `this.state` — one object | `useState` — many independent values |
| Update state | `this.setState({...})` — **merges** | `setCount(v)` — **replaces** |
| Lifecycle | `componentDidMount` etc. | `useEffect` |
| `this` | exists, and bites you | doesn't exist |
| Boilerplate | high | low |

## ⚠️ The state-merge difference (real gotcha)

```jsx
// CLASS — setState MERGES into the existing object
this.state = { name: "V", age: 25 };
this.setState({ age: 26 });               // → { name: "V", age: 26 }   name survives

// HOOKS — the setter REPLACES entirely
const [user, setUser] = useState({ name: "V", age: 25 });
setUser({ age: 26 });                     // → { age: 26 }   ❌ name GONE
setUser(prev => ({ ...prev, age: 26 }));  // ✅ you must spread manually
```

## The `this` problem

```jsx
handleClick() { this.setState(...) }
<button onClick={this.handleClick}>   // ❌ `this` is undefined when called
```

You passed the function **detached** from its object. In JS, `this` is decided by *how* a function is called, not where it's defined.

Fixes — `.bind(this)` in the constructor, or a class-field arrow function:

```jsx
handleClick = () => { this.setState(...) }   // arrow captures `this` — ✅
```

> **This entire category of bug does not exist in functional components.** One of the big reasons hooks won.

## Why classes lost

1. **`this` confusion** — constant source of bugs.
2. **Logic couldn't be shared** — reusing stateful logic needed HOCs or render props → "wrapper hell" (10 nested components in DevTools).
3. **Related logic split across lifecycle methods** — a subscription's setup in `componentDidMount`, cleanup in `componentWillUnmount`, refresh in `componentDidUpdate`. One concern, three places.
4. **Verbose** — constructor, super, bind, render.

`useEffect` fixed #3 by putting setup and cleanup **together**:

```jsx
useEffect(() => {
  const sub = subscribe();
  return () => sub.unsubscribe();   // cleanup lives right next to setup
}, []);
```

## The one thing classes still do that hooks can't

**Error boundaries.** `componentDidCatch` and `getDerivedStateFromError` have no hook equivalent — catching render errors still requires a class (or a library that wraps one).

---

<a name="pure"></a>
# 3. Pure Components

Two meanings — know both, they're related.

## Meaning A: a pure function

Same input → same output, no side effects.

```jsx
// PURE ✅ — same props always give the same UI
function Price({ amount }) {
  return <span>₹{amount}</span>;
}

// IMPURE ❌ — mutates something outside itself during render
let total = 0;
function Price({ amount }) {
  total += amount;                 // side effect during render!
  return <span>₹{amount}</span>;
}
```

**React requires components to be pure during render.** React may call your function extra times, in a different order, or throw the result away — Strict Mode does exactly this in dev to smoke out impurity. Impure components break in ways that are brutal to debug.

## Meaning B: the performance optimization

**A "Pure Component" skips re-rendering when its props haven't changed.**

The default behavior: **when a parent re-renders, all its children re-render** — even ones whose props didn't change.

```
Parent re-renders (count changed)
   │
   ├── Header    ← re-runs, even though its props are identical  😕
   ├── Sidebar   ← re-runs
   └── Counter   ← re-runs (this one actually needed to)
```

Usually harmless — re-render is cheap and the diff finds no changes, so **nothing reaches the DOM**. But if `Header` renders a 5,000-row table, it's real wasted work.

**Class version — `React.PureComponent`:**

```jsx
class Header extends React.PureComponent {   // instead of React.Component
  render() { return <h1>{this.props.title}</h1>; }
}
```

**Functional version — `React.memo`:**

```jsx
const Header = React.memo(function Header({ title }) {
  return <h1>{title}</h1>;
});
```

Both do the same thing: before re-rendering, **shallow-compare** new props to old. All equal → skip the re-render, and skip the whole subtree below it.

## ⚠️ Shallow comparison — the critical catch

"Shallow" means comparing with `===`, one level deep.

```js
// primitives — works as expected
"hello" === "hello"   // true  ✅
5 === 5               // true  ✅

// objects/arrays/functions — compares IDENTITY, not contents
{a:1} === {a:1}       // false ❌  two different objects in memory
[1,2] === [1,2]       // false ❌
```

So this **silently defeats** the optimization:

```jsx
function Parent() {
  const [count, setCount] = useState(0);

  return (
    <>
      <button onClick={() => setCount(count + 1)}>{count}</button>
      {/* new object + new function created EVERY render → memo always misses */}
      <Header style={{ color: "red" }} onSave={() => save()} />
    </>
  );
}
```

`Header` is memoized but re-renders every single time — you added comparison cost and got nothing. Fix: `useMemo` / `useCallback` to keep those references stable.

## When to use it

✅ Component is genuinely expensive (big lists, charts, heavy computation)
✅ It re-renders often with the same props
✅ Props are primitives or stable references

❌ Small, cheap components — the comparison costs more than the render
❌ Props change every render anyway — pure overhead
❌ Sprinkled everywhere "just in case"

> **Interview line:** *"Premature memoization is a real cost. `React.memo` adds a comparison on every render; if props change anyway you've made it slower. Profile first."*

---

<a name="smart-dumb"></a>
# 4. Smart vs Dumb Components

A way of thinking about responsibility. **A component should either manage data or display it — not both.**

| | **Smart (Container)** | **Dumb (Presentational)** |
|---|---|---|
| Concerned with | **how things work** | **how things look** |
| Has state? | yes | rarely (only UI state like "is open") |
| Fetches data? | yes | never |
| Knows about Redux/API? | yes | no |
| Gets data from | hooks, store, API | **props only** |
| Reusable? | not very (tied to the app) | very (drop it anywhere) |
| Easy to test? | needs mocks | trivial — pass props, check output |

## Example

```jsx
// ── SMART: knows the API, owns the state, no markup opinions
function UserListContainer() {
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/users")
      .then(r => r.json())
      .then(data => { setUsers(data); setLoading(false); });
  }, []);

  return <UserList users={users} loading={loading} />;
}

// ── DUMB: pure display. No fetch, no state, no idea where data came from.
function UserList({ users, loading }) {
  if (loading) return <Spinner />;
  return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>;
}
```

## Why split them

1. **`UserList` becomes reusable** — feed it users from an API, a cache, a test, or Storybook. It doesn't care.
2. **Testing is trivial** — no network mocking, just `render(<UserList users={[...]} />)`.
3. **Designers/juniors can work on dumb components** without touching data logic.
4. **Swap the data source** (REST → GraphQL) and only the container changes.

> **How to spot a dumb component:** could you drop it into a completely different app and have it work, given the right props? Yes → dumb. It would break because it needs *your* API or *your* store → smart.

---

<a name="container"></a>
# 5. Container vs Presentational Components

**Same idea as smart/dumb — different name.** "Smart/dumb" is the informal name; "container/presentational" is the formal one Dan Abramov popularized in 2015.

```
   ┌─────────────────────────┐
   │  UserListContainer      │   ← CONTAINER: fetches, holds state,
   │  (logic, no markup)     │     handles events
   └───────────┬─────────────┘
               │ props down
               ▼
   ┌─────────────────────────┐
   │  UserList               │   ← PRESENTATIONAL: renders props,
   │  (markup, no logic)     │     calls callbacks
   └─────────────────────────┘
```

Common convention: `UserListContainer` + `UserList`, or folders `containers/` and `components/`.

## ⚠️ The nuance interviewers love

**Dan Abramov later added a note to his own article saying he no longer recommends the pattern as a rule** — because **hooks made the mechanical split unnecessary**.

The original problem: before hooks, the *only* way to give a component state or lifecycle was to make it a class. So you wrapped a simple display component in a stateful class just to feed it data. Containers largely existed as a **workaround**.

With hooks you extract the logic into a **custom hook** instead of a wrapper component:

```jsx
// the logic — reusable, testable, no wrapper component needed
function useUsers() {
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/users").then(r => r.json())
      .then(d => { setUsers(d); setLoading(false); });
  }, []);

  return { users, loading };
}

// one component, concerns still cleanly separated
function UserList() {
  const { users, loading } = useUsers();
  if (loading) return <Spinner />;
  return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>;
}
```

Same separation — **logic in the hook, markup in the component** — with one less layer in the tree.

> **The answer that lands:** *"Container/presentational separates data logic from rendering. It's still a useful mental model, and I keep leaf components prop-only so they're reusable and testable. But Dan Abramov walked the pattern back after hooks — custom hooks achieve the same separation without an extra wrapper. So I apply the principle, not the folder structure."*

---

<a name="controlled"></a>
# 6. Controlled Components

**React state is the single source of truth for the input's value.**

```jsx
function NameForm() {
  const [name, setName] = useState("");

  return (
    <input
      value={name}                              // value comes FROM state
      onChange={e => setName(e.target.value)}   // every keystroke updates state
    />
  );
}
```

## The loop — this *is* the concept

```
you type "V"
     ↓
onChange fires with e.target.value = "V"
     ↓
setName("V")  →  state updates
     ↓
component re-renders
     ↓
<input value="V">  →  the letter appears on screen
```

**The character you see was put there by React, not by the browser.** The input is a slave to state. That's what "controlled" means.

## The classic beginner bug

```jsx
<input value={name} />        // ❌ no onChange — input is FROZEN, can't type
```

You locked the value to state but gave state no way to change. React warns in the console. Fixes: add `onChange`, use `defaultValue` (uncontrolled), or add `readOnly` if it's intentional.

## What controlled buys you

```jsx
function SignUp() {
  const [email, setEmail] = useState("");
  const valid = email.includes("@");

  return (
    <>
      <input value={email} onChange={e => setEmail(e.target.value)} />
      {!valid && email && <span>Invalid email</span>}     {/* live validation */}
      <button disabled={!valid}>Submit</button>           {/* conditional disable */}
    </>
  );
}
```

- ✅ **Instant validation** as you type
- ✅ **Conditionally disable** the submit button
- ✅ **Format on the fly** — force uppercase, insert dashes in a card number
- ✅ **One field drives another** — country picker changes the state list
- ✅ **Programmatic control** — reset with `setEmail("")`

## The cost

Every keystroke = a state update = a re-render. Invisible on a small form. On a 50-field form with all state in one parent, typing can lag. Fixes: local state per field, debouncing, or `react-hook-form` (uncontrolled by design).

---

<a name="uncontrolled"></a>
# 7. Uncontrolled Components

**The DOM keeps the value. React reads it only when it needs to.**

```jsx
function NameForm() {
  const inputRef = useRef(null);

  function handleSubmit(e) {
    e.preventDefault();
    alert(inputRef.current.value);   // reach into the DOM and READ it
  }

  return (
    <form onSubmit={handleSubmit}>
      <input ref={inputRef} defaultValue="Vishal" />
      <button>Submit</button>
    </form>
  );
}
```

- `ref` = a direct handle to the real DOM node.
- `defaultValue` (not `value`) = set the initial value, then **stop managing it**.
- **No re-render while typing.** React isn't involved until submit.

## Side by side

| | **Controlled** | **Uncontrolled** |
|---|---|---|
| Value lives in | React state | the DOM node |
| Attributes | `value` + `onChange` | `defaultValue` / `defaultChecked` |
| Read the value | anytime, from state | on demand, via `ref` |
| Re-renders while typing | yes, every keystroke | no |
| Live validation | easy | hard |
| Dynamic disable/format | easy | hard |
| Reset the form | `setState("")` | `ref.current.value = ""` |
| Code volume | more | less |
| Feels like | the React way | the vanilla JS way |

## When uncontrolled is right

- **File inputs** — `<input type="file" />` is **always uncontrolled**. Its value is read-only for security (JS must not be able to set a file path). You *must* use a ref.
- **Simple forms** where you only need values at submit time.
- **Integrating a non-React library** that manages its own DOM.
- **Performance-critical large forms** — exactly why `react-hook-form` is fast.

## Which is the default?

**Controlled.** React's docs recommend it and it keeps `UI = f(state)` intact — the value lives in your state, so you can validate, transform and test it. Reach for uncontrolled with a specific reason.

> **Interview line:** *"Controlled means React state is the single source of truth — `value` plus `onChange`. Uncontrolled means the DOM holds the value and you read it with a ref, using `defaultValue`. I default to controlled because it enables live validation and keeps UI a function of state, but I use uncontrolled for file inputs, which have no choice, and for large forms where per-keystroke re-renders matter."*

---

<a name="reusable"></a>
# 8. Reusable Components

Not a React feature — a **design skill**. It's about designing a good **props API**.

## The problem: a component that only works in one place

```jsx
function SaveButton() {
  return <button className="btn-primary" onClick={saveUser}>Save User</button>;
}
```

Hardcoded label, style, and action. Need a "Delete Post" button? Copy-paste and edit — now two files to fix when the design changes.

## The fix: make the variable parts props

```jsx
function Button({ variant = "primary", size = "md", disabled, onClick, children }) {
  return (
    <button
      className={`btn btn-${variant} btn-${size}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

<Button onClick={save}>Save</Button>
<Button variant="danger" onClick={remove}>Delete</Button>
<Button variant="ghost" size="sm" disabled>Loading…</Button>
```

## The five rules

**1. Configuration goes in props; behavior comes in as callbacks.**
The component never knows *what* saving means — it just calls `onClick`.

**2. Use `children` for content you can't predict.** Anything between the tags arrives as the `children` prop — the most powerful reuse tool in React:

```jsx
function Card({ title, children }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      <div className="card-body">{children}</div>   {/* anything at all */}
    </div>
  );
}

<Card title="Profile">
  <Avatar /> <p>Bio here</p> <Button>Edit</Button>
</Card>
```

**3. Give sensible defaults.** `variant = "primary"` means the common case is `<Button>Save</Button>` with zero config.

**4. Forward extra props** so consumers aren't fenced in:

```jsx
function Button({ variant = "primary", children, ...rest }) {
  return <button className={`btn btn-${variant}`} {...rest}>{children}</button>;
}

<Button type="submit" aria-label="Save" data-testid="save">Save</Button>
// type, aria-label and data-testid all pass through — no prop needed for each
```

**5. Keep it dumb.** A reusable component should not fetch, read your store, or know your routes. The moment it does, it's tied to *this* app.

## ⚠️ The trap: over-abstraction

```jsx
// ❌ 14 boolean props = unusable and unreadable
<Button isPrimary isLarge hasIcon iconLeft isLoading isRounded isFullWidth ... />
```

**Rule of thumb: wait for the third duplicate before abstracting.** Two similar things might diverge; three is a pattern.

> **The balance:** *too specific → can't reuse it. Too generic → too painful to use.* Aim for **obvious in the common case, possible in the rare case**.

---

<a name="composition"></a>
# 9. Composition vs Inheritance

**React's official position: use composition. Inheritance is essentially never needed.**

## Inheritance (the OOP instinct — don't)

```jsx
class Button extends React.Component { render() { return <button>...</button>; } }
class DangerButton extends Button { ... }   // ❌ don't
```

Problems: rigid single-parent hierarchies, unclear which method to override, fragile base class (change the parent, break every child), and it simply doesn't map to functions — **you can't extend a function**.

## Composition: build big things out of small things

**Technique 1 — `children` (containment).** When you don't know what goes inside:

```jsx
function Modal({ children, onClose }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal">{children}</div>
    </div>
  );
}

<Modal onClose={close}>
  <h2>Delete this?</h2>
  <Button variant="danger">Confirm</Button>
</Modal>
```

`Modal` provides the *behavior* (overlay, close-on-click); the caller provides the *content*.

**Technique 2 — named slots.** Multiple holes? Pass JSX as regular props:

```jsx
function Layout({ sidebar, header, content }) {
  return (
    <div className="layout">
      <header>{header}</header>
      <aside>{sidebar}</aside>
      <main>{content}</main>
    </div>
  );
}

<Layout header={<Navbar />} sidebar={<Menu />} content={<Feed />} />
```

> **Elements are just objects** (Part 1, §6) — so you can pass them around like any other value. That fact is what makes composition so flexible.

**Technique 3 — specialization.** "DangerButton is a Button with specific props" — express it by *rendering* the general one, not extending it:

```jsx
// instead of: class DangerButton extends Button
function DangerButton(props) {
  return <Button variant="danger" {...props} />;
}
```

**Technique 4 — wrapping (the HOC idea).** A function that takes a component and returns an enhanced one:

```jsx
function withBorder(Component) {
  return function Wrapped(props) {
    return <div className="bordered"><Component {...props} /></div>;
  };
}
const BorderedCard = withBorder(Card);
```

## Composition vs inheritance

| | **Inheritance** | **Composition** |
|---|---|---|
| Relationship | `DangerButton` **is a** `Button` | `Modal` **has** children |
| Coupling | tight — child depends on parent internals | loose — communicate only via props |
| Flexibility | one parent, fixed at definition time | mix freely, decide at runtime |
| Works with functions? | no | yes |
| React's stance | avoid | **use this** |

## "But how do I share non-UI logic?"

That's the real question inheritance was trying to answer, and React has a better one:

- **Same UI, different data** → **props**
- **Same logic, different UI** → **custom hooks** (`useUsers`, `useFetch`, `useLocalStorage`)
- **Same wrapper, different inner** → **composition / HOC**
- **Plain utility logic** → **a normal JS function**. Not everything needs to be a component.

> **Interview line:** *"React recommends composition over inheritance. Containment via `children`, specialization by rendering a general component with preset props, and custom hooks for shared logic. Inheritance couples a child to a base class's internals and doesn't work with function components at all."*

---

<a name="interview"></a>
# 10. Interview questions & answers

### Q: "Functional vs class components — which and why?"
> *"Functional components are functions that take props and return JSX; class components extend `React.Component` and use `render()` plus lifecycle methods. Since hooks in React 16.8, functions can do everything classes can, with less boilerplate, no `this` binding issues, and — crucially — reusable stateful logic via custom hooks. I write functional components. Classes still appear in legacy code, and error boundaries are the one thing that still requires a class."*

### Q: "What actually made hooks better than classes?"
> *"Three things. `this` binding bugs disappear entirely. Related logic stays together — `useEffect` puts setup and cleanup side by side, where a class splits one concern across `componentDidMount` and `componentWillUnmount`. And stateful logic became reusable through custom hooks, replacing HOCs and render props, which caused deeply nested wrapper hell."*

### Q: "What is a Pure Component?"
> *"Two senses. Conceptually, a pure component renders the same output for the same props with no side effects — React requires this since it may call your component extra times. Mechanically, `React.PureComponent` for classes and `React.memo` for functions implement `shouldComponentUpdate` with a shallow props comparison, so the component skips re-rendering when props are unchanged."*

### Q: "Why might `React.memo` not work?"
> *"Because the comparison is shallow — `===` one level deep. If a parent passes an inline object, array, or arrow function, a new reference is created every render, so the comparison always fails and the component re-renders anyway. The fix is `useMemo` for values and `useCallback` for functions to keep references stable."*

### Q: "`React.memo` vs `useMemo` vs `useCallback`?"
> *"`React.memo` memoizes a whole component to skip re-rendering. `useMemo` memoizes a computed value inside a component. `useCallback` memoizes a function reference — essentially `useMemo` returning a function. The last two mainly exist to keep references stable so `React.memo` and effect dependency arrays actually work."*

### Q: "Does a re-render mean a DOM update?"
> *"No. A re-render just means the component function ran again and produced a new virtual DOM tree. React diffs it, and only actual differences reach the real DOM. That's why most 'unnecessary re-renders' are harmless — the wasted work is the render and diff, not DOM writes."*

### Q: "Container vs presentational components?"
> *"Containers handle how things work — data fetching, state, business logic — and pass results down. Presentational components handle how things look and receive everything through props. The benefit is reusable, easily testable leaf components. Worth noting Dan Abramov walked the pattern back after hooks: custom hooks give the same separation without the extra wrapper. I follow the principle, not the folder structure."*

### Q: "Controlled vs uncontrolled components?"
> *"Controlled means React state is the single source of truth — you pass `value` and `onChange`, so every keystroke goes through state. Uncontrolled means the DOM holds the value and you read it with a ref, using `defaultValue` for the initial value. Controlled enables live validation, conditional disabling and formatting, at the cost of a re-render per keystroke. I default to controlled; I use uncontrolled for file inputs, which are always uncontrolled, and for very large forms."*

### Q: "Why is `<input type=\"file\" />` always uncontrolled?"
> *"Its value is read-only for security — JavaScript can't set a file path programmatically, or a page could trick the browser into uploading arbitrary files from your disk. So React can't control it; you read the selected files through a ref."*

### Q: "My input won't accept typing. Why?"
> *"I almost certainly passed `value` without `onChange`, which locks the input to a state value that never changes. Either add an `onChange` handler, use `defaultValue` for an uncontrolled input, or add `readOnly` if it's intentionally not editable."*

### Q: "Composition vs inheritance in React?"
> *"React strongly favors composition. Use `children` for containment, JSX passed as props for named slots, and render a general component with preset props for specialization. Inheritance couples a child to a base class's internals, breaks down as hierarchies grow, and doesn't work with function components at all. For sharing logic rather than UI, the answer is custom hooks."*

### Q: "How do you decide when to extract a reusable component?"
> *"When I see the third duplicate. Two similar things may still diverge; three is a pattern. I keep reusable components dumb — no fetching, no store access — expose behavior through callbacks, use `children` for unpredictable content, provide sensible defaults, and spread remaining props onto the root element. The failure mode to avoid is a component with a dozen boolean flags — that's a sign it should be several components or restructured around composition."*

### Q: "What rules must a component follow?"
> *"Capitalized name, so JSX compiles it as a component reference rather than a DOM tag string. Return valid JSX or `null`. Be pure during render — no side effects, no mutating props or state directly; those belong in event handlers or `useEffect`. And hooks only at the top level, never inside conditionals or loops."*

### Q: "Can a component return `null`?"
> *"Yes — returning `null` renders nothing, which is the normal way to conditionally hide a component. It still mounts and its hooks still run; it just produces no DOM output."*

---

<a name="cheatsheet"></a>
# 11. Quick revision cheat sheet

```
FUNCTIONAL      function that takes props, returns UI. THE default since React 16.8.
                Capitalized · returns JSX or null · pure during render
                · hooks only at top level.

CLASS           extends React.Component + render(). Legacy.
                this.props / this.state / this.setState (MERGES).
                Pain: `this` binding, split lifecycle, verbose, no logic reuse.
                Still required for: ERROR BOUNDARIES only.

PURE            (a) conceptually: same props → same UI, no side effects. REQUIRED.
                (b) optimization: skip re-render if props unchanged.
                    class → React.PureComponent    function → React.memo
                SHALLOW compare (===) → inline {} [] () => {} ALWAYS break it
                → stabilize with useMemo / useCallback. Profile before using.

SMART / DUMB    smart = how it WORKS (state, fetch, store)
                dumb  = how it LOOKS (props only, no logic) → reusable + testable
CONTAINER/PRES  same idea, formal name. Dan Abramov walked it back post-hooks
                → custom hooks give the same split with no wrapper component.

CONTROLLED      value={state} + onChange   → React state is source of truth
                ✅ live validation, disable, format, reset   ❌ re-render/keystroke
                BUG: value without onChange = frozen input
UNCONTROLLED    defaultValue + ref         → the DOM is source of truth
                ✅ no re-renders, less code  ❌ no live validation
                <input type="file"> is ALWAYS uncontrolled (security)
                DEFAULT TO CONTROLLED.

REUSABLE        config → props · behaviour → callbacks · content → children
                sensible defaults · spread {...rest} · keep it dumb
                abstract on the THIRD duplicate, not the second
                avoid the 14-boolean-props component

COMPOSITION     children (containment) · JSX-as-props (slots)
                · render general w/ preset props (specialization) · HOC (wrapping)
INHERITANCE     ❌ never in React — tight coupling, can't extend a function

SHARING WHAT?   same UI, diff data     → props
                same logic, diff UI    → CUSTOM HOOK
                same wrapper, diff in  → composition / HOC
                plain logic            → a normal JS function
```

## Quick decision guide

```
Building a new component?            → functional, always
Seeing `this` / render()?            → legacy class, refactor candidate
Expensive + same props repeatedly?   → React.memo (measure first!)
Component fetches data?              → split markup into a dumb child,
                                       or extract logic into a custom hook
Form input?                          → controlled (value + onChange) by default
File input?                          → uncontrolled, no choice
Arbitrary content inside?            → children
"X is a special kind of Y"?          → render Y with preset props, don't extend
Need to share logic, not UI?         → custom hook
```

---

## Connects to

- **[Part 1 — React Fundamentals](01-react-fundamentals.md):** components form the tree (§5), elements are plain objects (§6) — which is why JSX can be passed as props here, and why an unnecessary re-render usually costs nothing (§9).
- **JSX deep-dive (next):** `children`, fragments, conditional rendering, lists & `key`.
- **Props & State:** the data half of `UI = f(state)`; controlled inputs live here.
- **Hooks:** `useState`, `useEffect`, `useRef`, `useMemo`/`useCallback`, and custom hooks — the modern replacement for containers and HOCs.
- **Performance:** `React.memo`, the Profiler, virtualization for long lists.
- **Patterns / HOC:** HOCs, render props, compound components — all composition.
- **Forms:** controlled vs uncontrolled at scale, `react-hook-form`.
- **Error handling:** error boundaries — the last class-only feature.

## Suggested next topics

1. **JSX deep-dive** — recommended next; makes VDOM, reconciliation and `key` click.
2. **Props & State** — then straight into hooks.
3. **Lifecycle / `useEffect`** — the natural follow-on from class lifecycle here.

*— End of Part 2: Components —*
