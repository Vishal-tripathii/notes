# React Study Notes — Part 4

## Props (What, Read-only, Passing Data / Functions / Components, Defaults, children, Prop Drilling, Validation)

> **Format:** Conceptual **"how it works"** notes, fresh-start friendly — every term translated, nothing assumed. Follows the 14-question framework (what / why / how internally / when to use / when to avoid / pros / cons / performance / common mistakes / interview Qs / code examples / advanced / quick revision).
>
> **Roadmap:** this is the **Props** half of the roadmap's "Part 2 — Props & State". **State** follows in Part 5.
>
> **Continues:** [Part 1 — Fundamentals](01-react-fundamentals.md) · [Part 2 — Components](02-components.md) · [Part 3 — JSX Deep-Dive](03-jsx-deep-dive.md).

---

## Table of Contents

1. [What are Props?](#what)
2. [Read-only Nature](#readonly)
3. [Passing Data](#passing-data)
4. [Passing Functions](#passing-functions)
5. [Passing Components](#passing-components)
6. [Default Props](#defaults)
7. [The `children` Prop](#children)
8. [Prop Drilling](#drilling)
9. [Prop Validation (TypeScript / PropTypes)](#validation)
10. [Interview questions & answers](#interview)
11. [Quick revision cheat sheet](#cheatsheet)

---

<a name="what"></a>
# 1. What are Props?

**Props = the arguments you pass to a component.** Short for "properties."

```jsx
function Welcome({ name, age }) {
  return <p>{name} is {age}</p>;
}

<Welcome name="Vishal" age={25} />
```

Mechanically — and this is the whole thing — React collects your attributes into **one object** and calls your function with it:

```js
Welcome({ name: "Vishal", age: 25 })
```

So a component is **a function**, props are **its parameters**, and JSX is just a nicer way to write the call.

```
   normal JS                          React
────────────────────────────────────────────────────────────
function greet(name) {...}      function Welcome({name}) {...}
greet("Vishal")                 <Welcome name="Vishal" />
```

## Props vs State — the one-line distinction

| | **Props** | **State** |
|---|---|---|
| Who owns it | the **parent** | the **component itself** |
| Can the component change it? | **no** — read-only | yes, via the setter |
| Comes from | outside | inside |
| Analogy | function arguments | a variable inside the function |

> **The mental model:** props are what a component is **told**; state is what a component **remembers**.

## Two ways to receive them

```jsx
function Welcome(props)      { return <p>{props.name}</p>; }   // the whole object
function Welcome({ name })   { return <p>{name}</p>; }         // destructured — preferred
```

Destructuring is the norm because the signature becomes self-documenting — you see exactly what the component needs.

---

<a name="readonly"></a>
# 2. Read-only Nature

**A component must never modify its own props.** Hard rule.

```jsx
function Welcome({ name }) {
  name = name.toUpperCase();     // ❌ mutating a prop
  return <p>{name}</p>;
}

function Cart({ items }) {
  items.push(newItem);           // ❌ mutating the PARENT'S array!
  return <List items={items} />;
}
```

The second is the dangerous one. `items` is a **reference to the parent's array** — pushing to it silently changes the parent's data, from a child, without the parent knowing.

## Why the rule exists

**1. React's contract requires purity.** From [Part 2 §3](02-components.md): same props in → same UI out. React may call your component extra times or throw the result away. Mutating props breaks that guarantee and produces bugs that appear only sometimes.

**2. Mutating doesn't re-render anyway.** Changing a prop directly tells React nothing — nothing updates. You get "the data changed but the screen didn't," the exact bug React exists to prevent.

**3. It destroys traceability.** One-way data flow's promise is *"to know where a value came from, walk up the tree."* If children can edit what they receive, that promise is gone.

## What to do instead

```jsx
// need a transformed version? make a NEW value
function Welcome({ name }) {
  const upper = name.toUpperCase();   // ✅ derive, don't mutate
  return <p>{upper}</p>;
}

// need to actually change it? ask the owner
function Child({ items, onAdd }) {
  return <button onClick={() => onAdd(newItem)}>Add</button>;   // ✅
}

function Parent() {
  const [items, setItems] = useState([]);
  const handleAdd = item => setItems([...items, item]);   // ✅ new array
  return <Child items={items} onAdd={handleAdd} />;
}
```

## ⚠️ "Read-only" is shallow

JavaScript doesn't enforce this — React doesn't freeze your objects. Nothing *stops* `props.user.name = "x"`. It appears to work, then breaks confusingly. **It's a discipline, not a guardrail.**

> **Interview line:** *"Props are read-only by contract, not by enforcement. A component must treat them as immutable — derive new values instead of mutating, and request changes through callbacks the owner provided. Mutating props breaks React's purity assumption, doesn't trigger a re-render, and lets a child silently corrupt a parent's state."*

---

<a name="passing-data"></a>
# 3. Passing Data

## Every type, and the syntax rule

```jsx
<Profile
  name="Vishal"              // string → quotes (the only one)
  age={25}                   // number → braces
  isAdmin={true}             // boolean
  isAdmin                    // shorthand: same as isAdmin={true}
  tags={["a", "b"]}          // array
  user={{ id: 1 }}           // object (braces + object literal)
  onSave={handleSave}        // function
  icon={<Star />}            // JSX
  data={null}                // null
/>
```

**The rule: everything except a literal string needs `{ }`.**

```jsx
<Profile age="25" />     // ❌ the STRING "25" — "25" + 1 === "251"
<Profile age={25} />     // ✅ the NUMBER 25
```

## Spread — passing an object as props

```jsx
const user = { name: "V", age: 25, city: "Pune" };

<Profile {...user} />
// identical to <Profile name="V" age={25} city="Pune" />
```

Order matters — **later wins**:

```jsx
<Profile {...user} name="Override" />   // name is "Override"
<Profile name="Override" {...user} />   // name is "V" — spread clobbers it
```

Main use — **pass-through components**:

```jsx
function Button({ variant, children, ...rest }) {
  return <button className={`btn-${variant}`} {...rest}>{children}</button>;
}
// consumers pass type, aria-label, data-testid, onFocus… with no prop declared for each
```

⚠️ **Cost:** `<Profile {...props} />` from an unknown source makes it impossible to read what the component receives. Use deliberately — mainly for rest-props on primitive wrappers.

## ⚠️ Object and array props break memoization

```jsx
<Profile user={{ id: 1 }} tags={["a"]} />
```

Both literals are **created fresh every render** — new references, so a `React.memo`'d child sees "props changed" every time. Fix by hoisting the constant outside the component, or `useMemo` if it's computed.

---

<a name="passing-functions"></a>
# 4. Passing Functions

How children talk **back** to parents — the "actions up" half of one-way data flow.

```jsx
function Parent() {
  const [count, setCount] = useState(0);

  function handleIncrement() {
    setCount(c => c + 1);      // the parent updates ITS OWN state
  }

  return <Child count={count} onIncrement={handleIncrement} />;
}

function Child({ count, onIncrement }) {
  return <button onClick={onIncrement}>{count}</button>;
}
```

The child doesn't know what the function does, or that state exists. It just reports **"the button was clicked."** The parent decides what that means.

```
Parent ──── count (data) ──────►  Child
Parent ──── onIncrement ───────►  Child
   ▲                                │
   └──── child CALLS it ────────────┘   "something happened"

Parent updates state → new count flows DOWN
```

## Naming convention

| Position | Convention | Example |
|---|---|---|
| The **prop** (child's perspective) | `on` + Event | `onSave`, `onDelete`, `onChange` |
| The **handler** (parent's perspective) | `handle` + Event | `handleSave`, `handleDelete` |

```jsx
<Form onSubmit={handleSubmit} />
```

Not required, but universal — interviewers notice.

## ⚠️ Passing arguments — the #1 mistake

```jsx
<button onClick={handleDelete(id)}>       ❌ calls it during RENDER
<button onClick={() => handleDelete(id)}> ✅ passes a function that will call it
```

The first executes immediately while rendering and passes the **return value** as the handler. If `handleDelete` sets state → re-render → calls again → **infinite loop**.

## The event object

Handlers receive React's **SyntheticEvent** — a cross-browser wrapper over the native event with the same API (`e.target`, `e.preventDefault()`).

```jsx
<input onChange={e => setName(e.target.value)} />
<form onSubmit={e => { e.preventDefault(); save(); }} />
```

Both together:

```jsx
<button onClick={e => handleDelete(e, id)}>Delete</button>
```

## Inline arrow functions and performance

```jsx
<Child onSave={() => save(id)} />   // new function identity EVERY render
```

Two consequences:
1. A `React.memo`'d child re-renders anyway (props "changed").
2. In a `useEffect` dependency array, the effect re-runs every render.

Fix with `useCallback` — **when it matters**. For a plain DOM `<button>`, an inline arrow is completely fine; don't wrap everything preemptively.

---

<a name="passing-components"></a>
# 5. Passing Components

Because elements are just objects ([Part 3 §2](03-jsx-deep-dive.md)), you can pass **UI itself** as a prop.

## Form A — pass an element (already created)

```jsx
function Layout({ header, sidebar, content }) {
  return (
    <div>
      <header>{header}</header>
      <aside>{sidebar}</aside>
      <main>{content}</main>
    </div>
  );
}

<Layout header={<Navbar />} sidebar={<Menu />} content={<Feed />} />
```

`{<Navbar />}` = an already-built element object. `Layout` drops it into a slot. This is the **named slots** pattern.

## Form B — pass a component reference (not yet created)

```jsx
function List({ items, ItemComponent }) {      // Capitalized param — required!
  return (
    <ul>
      {items.map(item => <ItemComponent key={item.id} {...item} />)}
    </ul>
  );
}

<List items={users} ItemComponent={UserRow} />
<List items={posts} ItemComponent={PostCard} />
```

**Why capitalize the parameter?** Same JSX rule as always — `<ItemComponent />` compiles to a reference; `<itemComponent />` compiles to the string `"itemComponent"` and renders nothing.

## The crucial difference

| | `<Navbar />` (element) | `Navbar` (reference) |
|---|---|---|
| What it is | an object, already built | a function, not yet called |
| Can the receiver pass props? | **no** — already fixed | **yes** — it does the rendering |
| Render it many times? | it'd be the same element | yes, different props each time |
| Use for | fixed slots, layouts | lists, tables, generic renderers |

```jsx
// element: props baked in by the caller
<Layout header={<Navbar user={user} />} />

// reference: the receiver supplies the props
<Table rows={data} RowComponent={UserRow} />   // Table passes each row's data
```

## Form C — render props (a function that returns UI)

```jsx
function DataLoader({ url, render }) {
  const [data, setData] = useState(null);
  useEffect(() => { fetch(url).then(r => r.json()).then(setData); }, [url]);

  return render(data);       // hand the data BACK to the caller
}

<DataLoader url="/api/users" render={data =>
  data ? <UserList users={data} /> : <Spinner />
} />
```

The component owns the **logic**; the caller decides the **UI**. This was the main pre-hooks way to share stateful logic — **custom hooks replaced it** for most cases. Still worth recognizing; still used by libraries like Recharts and React Table.

---

<a name="defaults"></a>
# 6. Default Props

**Give a prop a fallback when the caller doesn't pass it.**

## ✅ The modern way — default parameters

```jsx
function Button({ variant = "primary", size = "md", disabled = false, children }) {
  return <button className={`btn-${variant} btn-${size}`}>{children}</button>;
}

<Button>Save</Button>                    // primary, md
<Button variant="danger">Delete</Button> // danger, md
```

Plain JavaScript — no React API involved.

## ❌ The old way — `defaultProps`

```jsx
Button.defaultProps = { variant: "primary" };   // legacy
```

**React 19 removed `defaultProps` for function components.** It still works for class components. New code uses default parameters — always.

## ⚠️ Defaults fire on `undefined`, not on falsy

```jsx
function Box({ count = 10 }) { return <p>{count}</p>; }

<Box />                  // 10   — undefined → default applies
<Box count={undefined}/> // 10   — same thing
<Box count={0} />        // 0    — 0 is a real value, NOT replaced
<Box count={null} />     // null → renders nothing. Defaults DON'T catch null!
```

`null` is an explicit "no value" and JS default parameters ignore it. Use `??` to catch both:

```jsx
function Box({ count }) {
  const n = count ?? 10;    // catches null AND undefined
}
```

## Defaults for object props — the memo trap

```jsx
function List({ items = [] }) { ... }   // ⚠️ NEW array every render
```

Usually harmless, but if `items` feeds a `useEffect` dependency or a memoized child, it churns. Hoist it:

```jsx
const EMPTY = [];                        // one stable reference
function List({ items = EMPTY }) { ... }
```

---

<a name="children"></a>
# 7. The `children` Prop

**Whatever sits between a component's opening and closing tags becomes `props.children`.**

```jsx
function Card({ children }) {
  return <div className="card">{children}</div>;
}

<Card>
  <h2>Title</h2>
  <p>Body</p>
</Card>
```

Not magic — nesting is sugar for a normal prop:

```jsx
<Card>Hello</Card>
<Card children="Hello" />     // identical
```

## Why it's the most important prop in React

It **inverts control**. Without `children`, a wrapper must anticipate everything that could go inside:

```jsx
// ❌ Modal has to anticipate everything
<Modal title="..." body="..." buttonText="..." showIcon iconType="..." />

// ✅ Modal provides behaviour; caller provides content
<Modal onClose={close}>
  <h2>Delete this?</h2>
  <Chart data={data} />
  <Button variant="danger">Confirm</Button>
</Modal>
```

`Modal` handles the overlay, the escape key, the focus trap. It has **zero opinions** about content. That's why it works everywhere. **It's also the cleanest fix for prop drilling** — see §8.

## What `children` can be

```jsx
<Card>Hello</Card>              // a string
<Card><p>Hi</p></Card>          // one element
<Card><p>A</p><p>B</p></Card>   // an ARRAY of elements
<Card>{items.map(...)}</Card>   // an array
<Card>{count}</Card>            // a number
<Card />                        // undefined
```

⚠️ **It's not always an array** — one child is one element, not an array of one. Don't call `children.map()` blindly. Use `React.Children.map(children, fn)`, which handles every shape safely.

## Advanced: children as a function

```jsx
function Toggle({ children }) {
  const [on, setOn] = useState(false);
  return children(on, () => setOn(!on));    // call children like a function
}

<Toggle>
  {(on, toggle) => (
    <button onClick={toggle}>{on ? "ON" : "OFF"}</button>
  )}
</Toggle>
```

Same idea as render props, delivered through `children`. Mostly superseded by hooks.

---

<a name="drilling"></a>
# 8. Prop Drilling

**Passing a prop through components that don't use it, only to reach a deep descendant.**

```jsx
function App() {
  const [user, setUser] = useState(null);
  return <Dashboard user={user} />;
}

function Dashboard({ user }) { return <Sidebar user={user} />; }  // doesn't use it
function Sidebar({ user })   { return <Profile user={user} />; }  // doesn't use it
function Profile({ user })   { return <Avatar  user={user} />; }  // doesn't use it
function Avatar({ user })    { return <img src={user.avatar} />; } // ✅ FINALLY uses it
```

```
App ──user──► Dashboard ──user──► Sidebar ──user──► Profile ──user──► Avatar
              (unused)            (unused)          (unused)          USES IT
```

## Why it's bad

1. **Noise** — three components declare a prop that lies about what they need.
2. **Fragile** — adding a `theme` prop means editing all five files.
3. **Kills reuse** — `Sidebar` now *requires* a `user` it never touches. You can't drop it elsewhere without inventing one.
4. **Refactoring pain** — insert a new layer and you thread everything through again.

## ⚠️ But: drilling is not automatically bad

**One or two levels is fine — explicit and traceable.** The problem is depth and breadth. Reaching for Context after one level creates hidden dependencies and harder tests. Don't over-correct.

## Fix 1 — Composition / `children` (most underrated)

Often you don't need a state manager, just a better tree shape:

```jsx
// ❌ drilling
function Dashboard({ user }) {
  return <Sidebar user={user} />;
}

// ✅ App composes; the middle layers never see `user`
function App() {
  const [user] = useState(null);
  return (
    <Dashboard>
      <Sidebar>
        <Avatar user={user} />     {/* created where the data lives */}
      </Sidebar>
    </Dashboard>
  );
}

function Dashboard({ children }) { return <div>{children}</div>; }
function Sidebar({ children })   { return <aside>{children}</aside>; }
```

`Avatar` is **created** in `App`, where `user` already exists — so it never travels. `Dashboard` and `Sidebar` become genuinely generic. **Try this before Context.**

## Fix 2 — Context API

For data that's genuinely global — current user, theme, locale, auth:

```jsx
const UserContext = createContext();

function App() {
  const [user, setUser] = useState(null);
  return (
    <UserContext.Provider value={user}>
      <Dashboard />           {/* no prop */}
    </UserContext.Provider>
  );
}

function Avatar() {
  const user = useContext(UserContext);   // reach in from anywhere below
  return <img src={user.avatar} />;
}
```

**Trade-offs:** implicit dependency (the signature no longer shows that `Avatar` needs a user), harder isolated testing, and **every consumer re-renders when the context value changes** — a poor fit for fast-changing state.

## Fix 3 — A state library

Redux / Zustand / Jotai — for large apps with complex shared state, plus devtools, middleware and time-travel debugging.

## The decision guide

```
1–2 levels deep              → just drill. It's fine and explicit.
Middle layers are generic    → composition / children  ← try this FIRST
Truly global, rarely changes → Context (theme, auth, locale)
Large + complex + frequent   → Redux / Zustand
```

> **Interview line:** *"Prop drilling is passing props through components that don't use them. It's not automatically bad — one or two levels is explicit and readable. It becomes a problem when intermediate components carry props they don't need, hurting reuse and refactoring. My first fix is composition — restructure so the component is created where the data lives, via `children`. If the data is genuinely global, Context. If state is large and changes often, a store like Zustand or Redux, since every Context consumer re-renders on any value change."*

---

<a name="validation"></a>
# 9. Prop Validation (TypeScript / PropTypes)

Props are just function arguments — nothing checks them by default. Pass a string where a number was expected and you find out at runtime, in production.

## Option A — TypeScript (the modern standard)

```tsx
type ButtonProps = {
  label: string;
  count: number;
  variant?: "primary" | "danger";   // ? = optional
  onClick: (id: number) => void;
  children: React.ReactNode;        // anything renderable
};

function Button({ label, count, variant = "primary", onClick, children }: ButtonProps) {
  return <button className={`btn-${variant}`}>{children}</button>;
}

<Button label={42} />   // 🔴 error in your EDITOR, before you save
```

**Why it wins:**
- Errors at **compile time**, not runtime.
- **Autocomplete** — the editor lists every prop and its type.
- **Safe refactoring** — rename a prop and every usage errors immediately.
- **Self-documenting** — the type *is* the API docs.
- **Zero runtime cost** — types vanish at build time.

**Types worth knowing:**

```tsx
children: React.ReactNode              // anything renderable
onClick: () => void                    // a function returning nothing
Icon: React.ComponentType              // a component REFERENCE
style: React.CSSProperties             // a style object
onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
```

## Option B — PropTypes (legacy)

```jsx
import PropTypes from "prop-types";

Button.propTypes = {
  label:    PropTypes.string.isRequired,
  count:    PropTypes.number,
  variant:  PropTypes.oneOf(["primary", "danger"]),
  onClick:  PropTypes.func,
  children: PropTypes.node,
};
```

Warns in the **console at runtime**, **development only** — stripped from production builds.

⚠️ **React 19 removed `propTypes` support for function components.** Purely legacy now. Know it for interviews and old codebases; don't reach for it in new code.

## Compared

| | **TypeScript** | **PropTypes** |
|---|---|---|
| When errors are caught | compile time (as you type) | runtime, dev only |
| Editor autocomplete | yes | no |
| Runtime cost | none | small (dev only) |
| Setup | build config needed | just an npm package |
| Status in React 19 | the standard | removed for function components |

> **Interview line:** *"TypeScript is the standard now — compile-time checking, autocomplete and safe refactors, with no runtime cost. PropTypes did runtime dev-only checks, and React 19 removed support for it on function components. In a plain-JS codebase, PropTypes on shared components beats nothing, but I'd push for TypeScript."*

---

<a name="interview"></a>
# 10. Interview questions & answers

### Q: "What are props?"
> *"Props are the inputs to a component — the data a parent passes down. React collects the JSX attributes into a single object and passes it as the component's argument, so a component is just a function and props are its parameters. They're read-only: the component can read them but never modify them."*

### Q: "Props vs state?"
> *"Props are owned by the parent and passed in, read-only from the child's perspective. State is owned by the component itself and can be changed with its setter, triggering a re-render. Props are what a component is told; state is what it remembers. If a value comes from outside and the component only displays it, it's props; if the component controls it over time, it's state."*

### Q: "Why are props immutable?"
> *"Because React assumes components are pure — same props, same output — and may re-run them freely. Mutating props breaks that, doesn't trigger a re-render so the UI won't update anyway, and lets a child silently corrupt a parent's data since objects are passed by reference. To change data, the child calls a callback and the owner updates its own state."*

### Q: "How does a child update a parent?"
> *"The parent passes a callback down as a prop. The child calls it to signal that something happened, and the parent updates its own state — the new value then flows back down. Data down, actions up. That keeps a single owner for each piece of state."*

### Q: "`onClick={handleClick}` vs `onClick={handleClick()}`?"
> *"The first passes the function so React calls it on click. The second invokes it during render and passes its return value as the handler — usually undefined, and an infinite loop if it sets state. To pass an argument, use an arrow function wrapper."*

### Q: "How do you pass a component as a prop — element vs reference?"
> *"`<Layout header={<Navbar />} />` passes an already-created element; the receiver just places it and can't change its props. `<List ItemComponent={UserRow} />` passes the function itself, so the receiver renders it and supplies props — which is what you need for lists where each item gets different data. The parameter must be capitalized, or JSX compiles it as a DOM tag string."*

### Q: "What's the `children` prop?"
> *"Whatever sits between a component's tags. It's an ordinary prop — `<Card>Hi</Card>` is identical to `<Card children=\"Hi\" />`. It's the main composition tool: a wrapper provides behaviour and layout while the caller supplies content, so the wrapper doesn't need to anticipate every use case. Note it isn't always an array — a single child is just an element — so use `React.Children.map` rather than `children.map`."*

### Q: "How do you set default prop values?"
> *"Default parameters in the destructuring: `function Button({ variant = 'primary' })`. The old `defaultProps` object is legacy and React 19 removed it for function components. One gotcha: defaults only apply for `undefined`, so `null` and `0` are passed through as real values — use `??` if you need to catch null too."*

### Q: "What is prop drilling and how do you fix it?"
> *"Passing props through components that don't use them just to reach a deeper one. It hurts readability and reuse because intermediate components declare props they don't need. First fix is composition — restructure so the consuming component is created where the data lives and passed as `children`, so it never travels. If the data is genuinely global like theme or auth, Context. For large, frequently changing shared state, a store like Zustand or Redux, since every Context consumer re-renders when the value changes."*

### Q: "Is prop drilling always bad?"
> *"No. One or two levels is explicit and easy to trace, which is often better than Context's hidden dependency. It becomes a problem with depth and breadth. Reaching for Context too early makes components harder to test and reuse in isolation."*

### Q: "Can you pass props to `props.children`?"
> *"Not directly, since they're already-created elements. You can clone them with `React.cloneElement` and inject props, or use `React.Children.map` to do it for each child — but the cleaner modern approach is Context, or a render prop where the parent calls `children` as a function with the values."*

### Q: "PropTypes vs TypeScript?"
> *"PropTypes validates at runtime in development only and logs console warnings. TypeScript checks at compile time, gives autocomplete and safe refactoring, and has no runtime cost. TypeScript is the standard now — and React 19 removed `propTypes` support for function components entirely."*

### Q: "Why do object and array props hurt performance?"
> *"An object or array literal in JSX creates a new reference on every render. A `React.memo` child compares props shallowly with `===`, so it sees a change every time and re-renders anyway. Same for effect dependency arrays — the effect re-runs each render. Fix by hoisting constants outside the component or memoizing computed values with `useMemo`."*

---

<a name="cheatsheet"></a>
# 11. Quick revision cheat sheet

```
PROPS           = a component's arguments. Parent → child, one object.
                <Welcome name="V" age={25} />  →  Welcome({name:"V", age:25})
                component = function · props = parameters · JSX = the call

PROPS vs STATE  props: owned by PARENT, read-only, from outside
                state: owned by SELF, changeable, from inside
                "props = what it's TOLD · state = what it REMEMBERS"

READ-ONLY       never mutate — derive a new value, or call a callback
                Why: purity contract · no re-render anyway · breaks traceability
                Not enforced by JS — it's a discipline

PASSING         string="x" (the only one without braces) · num={5} · bool shorthand
                arr={[]} · obj={{}} · fn={handler} · jsx={<X/>}
                {...spread} — LATER WINS
                ⚠️ inline {} and [] = new reference each render → breaks memo

FUNCTIONS       prop:    onSave      (on + Event)
                handler: handleSave  (handle + Event)
                onClick={fn}            ✅
                onClick={fn()}          ❌ runs during render → infinite loop
                onClick={() => fn(id)}  ✅ pass an argument
                event = SyntheticEvent (cross-browser wrapper)

COMPONENTS      element   <Layout header={<Nav />} />  → fixed, receiver can't add props
                reference <List Item={Row} />          → receiver renders + supplies props
                          ⚠️ parameter MUST be Capitalized
                render prop: render={data => <UI/>} — pre-hooks logic sharing

DEFAULTS        ✅ function Button({ variant = "primary" })
                ❌ Button.defaultProps — REMOVED in React 19 for function components
                fires on undefined ONLY — not on null or 0   (use ?? for null)
                object defaults → hoist a constant to keep the reference stable

CHILDREN        content between the tags. Just a prop.
                <Card>Hi</Card> === <Card children="Hi" />
                inverts control: wrapper = behaviour, caller = content
                ⚠️ NOT always an array → use React.Children.map
                children-as-function = render prop via children

PROP DRILLING   threading a prop through components that don't use it
                1–2 levels → FINE, explicit
                generic middle layers → COMPOSITION / children  ← try FIRST
                global + stable (theme/auth/locale) → Context
                large + frequent → Redux / Zustand
                Context cost: implicit dep · harder tests · ALL consumers re-render

VALIDATION      TypeScript → compile time · autocomplete · safe refactor · free
                PropTypes  → runtime, DEV ONLY · React 19 removed it for fn components
                children: React.ReactNode · Icon: React.ComponentType
```

---

## Connects to

- **[Part 2 — Components](02-components.md):** props are the API of a reusable component (§8 there); `children` and slots are the composition tools (§9 there); the memo/reference issue is §3 there.
- **[Part 3 — JSX Deep-Dive](03-jsx-deep-dive.md):** the `{ }` rules, spread, and why `<ItemComponent />` must be capitalized.
- **Part 5 — State (next):** the other half of the data story; `setState`, immutable updates, lifting state up.
- **Context API:** the real fix for deep prop drilling.
- **Hooks:** `useCallback` for stable function props; custom hooks replacing render props.
- **Forms:** controlled inputs are `value` + `onChange` props at scale.
- **TypeScript with React:** typing props, children, events and generic components.

## Suggested next topics

1. **State** — recommended next; `useState`, immutable updates, batching, lifting state up, derived state.
2. **Hooks** — `useEffect`, `useRef`, `useMemo`/`useCallback`, custom hooks.
3. **Context API** — the drilling fix, in depth.

*— End of Part 4: Props —*
