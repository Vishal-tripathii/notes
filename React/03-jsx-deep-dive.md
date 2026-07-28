# React Study Notes — Part 3

## JSX Deep-Dive (createElement, Expressions, Fragments, Conditional Rendering, Lists & Keys, Props, Escaping)

> **Format:** Conceptual **"how it works"** notes, fresh-start friendly — every term translated, nothing assumed. Follows the 14-question framework (what / why / how internally / when to use / when to avoid / pros / cons / performance / common mistakes / interview Qs / code examples / advanced / quick revision).
>
> **Continues:** [Part 1 — React Fundamentals](01-react-fundamentals.md) · [Part 2 — Components](02-components.md). Next: **Props & State**, then **Hooks**.

---

## Table of Contents

1. [What JSX really is](#what)
2. [JSX is an expression, not markup](#expression)
3. [The `{ }` rule — expressions only](#braces)
4. [JSX ≠ HTML — the differences](#vs-html)
5. [One root element & Fragments](#fragments)
6. [Conditional rendering — five patterns](#conditional)
7. [What React renders vs ignores](#renders)
8. [Lists & Keys](#keys)
9. [Props in JSX — the details](#props)
10. [Security — JSX escapes by default](#security)
11. [Small things that trip people up](#gotchas)
12. [Interview questions & answers](#interview)
13. [Quick revision cheat sheet](#cheatsheet)

---

<a name="what"></a>
# 1. What JSX really is

```jsx
const el = <h1 className="title">Hello</h1>;
```

Compiles to:

```js
React.createElement("h1", { className: "title" }, "Hello")
```

Which **returns a plain object**:

```js
{
  type: "h1",
  props: { className: "title", children: "Hello" },
  key: null,
  ref: null
}
```

## The signature of `createElement`

```js
createElement(type, props, ...children)
```

| Argument | What it can be |
|---|---|
| `type` | a **string** `"div"` (real DOM tag) or a **function reference** `Button` (your component) |
| `props` | an object of everything you passed, or `null` |
| `children` | everything nested inside, appended into `props.children` |

**Lowercase vs Capitalized, mechanically:**

```jsx
<button />   →  createElement("button")   // a STRING    → real DOM tag
<Button />   →  createElement(Button)     // a REFERENCE → your function
```

Write `<button />` expecting your component and React looks for an HTML element named `button` — you get a plain HTML button with none of your logic. **That's the entire reason for the capitalization rule.**

## Nesting is just nested function calls

```jsx
<div>
  <h1>Hi</h1>
  <p>Bye</p>
</div>
```
```js
createElement("div", null,
  createElement("h1", null, "Hi"),
  createElement("p",  null, "Bye")
)
```

Inner calls run **first** (they're arguments), so React builds the tree bottom-up.

## 🆕 The modern transform (React 17+)

Notice you no longer write `import React from "react"` in every file. Since React 17 the compiler emits a different call:

```js
// old transform (React ≤16) — needed React in scope
React.createElement("h1", { className: "title" }, "Hello")

// new transform (React 17+) — auto-imported by the compiler
import { jsx as _jsx } from "react/jsx-runtime";
_jsx("h1", { className: "title", children: "Hello" })
```

`children` moved **into** the props object. Same behavior — faster, and no import boilerplate.

> **Interview point:** *"JSX compiles to `createElement` — or in React 17+, to `jsx()` from the automatic runtime, which is why the React import is no longer required."*

---

<a name="expression"></a>
# 2. JSX is an expression, not markup

The mental unlock: JSX evaluates to a **value** (an object), so it goes **anywhere a value is allowed**.

```jsx
// store in a variable
const greeting = <h1>Hello</h1>;

// return from a function
function getGreeting(user) {
  if (user) return <h1>Hello, {user.name}</h1>;
  return <h1>Hello, stranger</h1>;
}

// put in an array
const items = [<li key="a">A</li>, <li key="b">B</li>];

// put in an object
const config = { icon: <Star />, label: "Favourite" };

// pass as a prop
<Layout header={<Navbar />} />

// use in a ternary
{isLoggedIn ? <Dashboard /> : <Login />}
```

**None of this is special JSX behavior.** They're objects. Objects go where objects go. (This is exactly what makes the slot/composition patterns in [Part 2 §9](02-components.md) possible.)

---

<a name="braces"></a>
# 3. The `{ }` rule — expressions only

Inside `{ }`, JSX accepts **any JavaScript expression** — anything that *produces a value*.

```jsx
{ user.name }                    ✅
{ 2 + 2 }                        ✅  renders 4
{ formatDate(post.createdAt) }   ✅  a call returns a value
{ cond ? <A /> : <B /> }         ✅  ternary is an expression
{ items.map(i => <li/>) }        ✅  map returns an array
{ items.length > 0 }             ⚠️  valid, but booleans render NOTHING (§7)

{ if (cond) { ... } }            ❌ if is a STATEMENT — syntax error
{ for (...) { ... } }            ❌ statement
{ const x = 5 }                  ❌ statement
```

> **The test:** could you write `const x = ______;`? If yes, it's an expression and JSX accepts it.

That single restriction explains why React code looks the way it does — no `if` inside JSX, so you see ternaries, `&&` and `.map()` everywhere.

## Where `{ }` goes

```jsx
<img src={user.avatar} alt={user.name} />          {/* in an attribute */}
<p>Hello {user.name}, you have {n} messages</p>    {/* in content */}
```

**Never quote them:**

```jsx
<img src="{user.avatar}" />   {/* ❌ literally the string "{user.avatar}" */}
<img src={user.avatar} />     {/* ✅ */}
```

## `{{ }}` is not special syntax

```jsx
<div style={{ color: "red" }} />
```

That's `{` (enter JavaScript) + `{ color: "red" }` (an object literal). Two separate things that happen to touch.

---

<a name="vs-html"></a>
# 4. JSX ≠ HTML — the differences

| HTML | JSX | Why |
|---|---|---|
| `class` | `className` | `class` is a reserved JS keyword |
| `for` | `htmlFor` | `for` is a JS loop keyword |
| `onclick="..."` | `onClick={fn}` | camelCase JS property; takes a **function**, not a string |
| `tabindex` | `tabIndex` | camelCase for all multi-word attributes |
| `style="color:red"` | `style={{ color: "red" }}` | an **object**, camelCased keys |
| `<br>` `<img>` | `<br />` `<img />` | every tag must close |
| `<!-- comment -->` | `{/* comment */}` | comments are JS expressions here |

**Exceptions that keep their HTML names:** `data-*` and `aria-*` stay lowercase and hyphenated.

```jsx
<div data-testid="row" aria-label="Close" />   ✅ correct as-is
```

## The `style` object in detail

```jsx
<div style={{
  color: "red",
  backgroundColor: "#eee",   // camelCase, not background-color
  fontSize: 16,              // number → React appends "px" → "16px"
  lineHeight: 1.5,           // unitless properties stay unitless
  zIndex: 10                 // also unitless
}} />
```

React knows which CSS properties are unitless (`lineHeight`, `zIndex`, `opacity`, `flex`…) and only appends `px` to the rest.

> ⚠️ **Performance:** an inline `style={{...}}` creates a **new object every render**, which breaks `React.memo` on a child ([Part 2 §3](02-components.md)). Prefer CSS classes; hoist the object out of the component or `useMemo` it if you must.

---

<a name="fragments"></a>
# 5. One root element & Fragments

**Rule:** a component must return **one** element.

```jsx
// ❌ Syntax error — a function can't return two values
return (
  <h1>Title</h1>
  <p>Body</p>
);
```

Mechanically this would compile to `return createElement(...) createElement(...)` — meaningless.

**Old fix — a wrapper div:**

```jsx
return (
  <div>
    <h1>Title</h1>
    <p>Body</p>
  </div>
);
```

But that div is **real**: it lands in the DOM and it can break CSS. Inside a flex/grid container or a `<table>`, an extra div destroys the layout:

```jsx
<table>
  <tbody>
    <div>          {/* ❌ invalid HTML — browsers hoist it out of the table */}
      <tr>...</tr>
    </div>
  </tbody>
</table>
```

**The fix — Fragment.** Groups children **without producing a DOM node.**

```jsx
return (
  <>
    <h1>Title</h1>
    <p>Body</p>
  </>
);
```

Both forms:

```jsx
<>...</>                               // shorthand
<React.Fragment>...</React.Fragment>   // long form
```

Output HTML: just the `<h1>` and `<p>`. No wrapper. Nothing.

## ⚠️ The one case you need the long form: keys

**The shorthand `<>` cannot take a `key`.** When mapping and each item renders multiple siblings:

```jsx
{items.map(item => (
  <React.Fragment key={item.id}>     {/* ✅ must be the long form */}
    <dt>{item.term}</dt>
    <dd>{item.definition}</dd>
  </React.Fragment>
))}
```

`key` is the *only* prop a Fragment accepts.

---

<a name="conditional"></a>
# 6. Conditional rendering — five patterns

## Pattern 1 — Ternary (two outcomes)

```jsx
<div>{isLoggedIn ? <Dashboard /> : <Login />}</div>
```

## Pattern 2 — `&&` (show or show nothing)

```jsx
{hasError && <ErrorBanner />}
{unread > 0 && <Badge count={unread} />}
```

How it works: `&&` returns the **left** value if falsy, otherwise the right one. `false && <X/>` → `false` → React renders nothing.

## 🔥 Pattern 2's famous bug — the `0`

```jsx
{items.length && <List items={items} />}
```

When `items.length` is `0`, `&&` returns `0` — and **React renders `0`**, because `0` is a number and React renders numbers. A stray "0" appears on your page.

```
React IGNORES:  false · null · undefined · ""
React RENDERS:  0 · NaN                      ← the trap
```

**Three fixes:**

```jsx
{items.length > 0 && <List />}        // ✅ force a real boolean
{!!items.length && <List />}          // ✅ coerce with !!
{items.length ? <List /> : null}      // ✅ ternary is always safe
```

> Interviewers ask this constantly. It is the single most common JSX bug.

## Pattern 3 — Early return (cleanest for guard clauses)

```jsx
function Profile({ user, loading, error }) {
  if (loading) return <Spinner />;
  if (error)   return <Error message={error} />;
  if (!user)   return null;              // render nothing

  return <div>{user.name}</div>;         // the happy path, unindented
}
```

Best with several exclusive states — the main JSX stays flat and readable.

## Pattern 4 — Variable assignment (when the logic is messy)

```jsx
function Status({ state }) {
  let content;
  if (state === "loading")    content = <Spinner />;
  else if (state === "error") content = <Error />;
  else if (state === "empty") content = <EmptyState />;
  else                        content = <List />;

  return <div className="panel">{content}</div>;
}
```

You *can't* use `if` inside JSX — but you can use it **before** the `return` and drop the result in.

## Pattern 5 — Object lookup (many named branches)

```jsx
const VIEWS = {
  loading: <Spinner />,
  error:   <Error />,
  empty:   <EmptyState />,
  ready:   <List />,
};

return <div>{VIEWS[state] ?? <Fallback />}</div>;
```

## Which to use

```
2 outcomes                 → ternary
show / hide                → && (guard against 0!)
guard clauses, many states → early return
messy multi-step logic     → variable before return
many named states          → object lookup
nested ternaries           → ❌ never. Extract a component.
```

---

<a name="renders"></a>
# 7. What React renders vs ignores

Memorize this table:

| Value | Renders as |
|---|---|
| `"hello"` | hello |
| `42` | 42 |
| `0` | **0** ⚠️ |
| `NaN` | **NaN** ⚠️ |
| `true` / `false` | *nothing* |
| `null` | *nothing* |
| `undefined` | *nothing* |
| `""` | *nothing* |
| an array | each item rendered in order |
| a plain object | 💥 **Error:** "Objects are not valid as a React child" |

## The object error you *will* hit

```jsx
const user = { name: "V", age: 25 };
<p>{user}</p>                    // 💥 Objects are not valid as a React child
<p>{user.name}</p>               // ✅
<p>{JSON.stringify(user)}</p>    // ✅ for debugging
```

Very common when an API returns `{ message: "..." }` and you render the whole object instead of `.message`.

## Arrays render inline

```jsx
<div>{[<span key="a">A</span>, <span key="b">B</span>]}</div>
// → <div><span>A</span><span>B</span></div>
```

That's exactly why `.map()` works — it returns an array.

---

<a name="keys"></a>
# 8. Lists & Keys

```jsx
<ul>
  {users.map(user => (
    <li key={user.id}>{user.name}</li>
  ))}
</ul>
```

`.map()` transforms each data item into an element; the resulting array renders in order.

⚠️ **Use `map`, not `forEach`** — `forEach` returns `undefined`, so nothing renders.

## What `key` actually does

Recall reconciliation from [Part 1 §9](01-react-fundamentals.md). React diffs two trees. For **lists** it has a problem: is item #2 in the new list *the same item* as #2 in the old list, or a different one that shifted into that position?

**Without keys**, React compares **by position**:

```
old:  [A] [B] [C]
new:  [X] [A] [B] [C]        ← X was added at the FRONT

position 0:  A vs X   → different text → PATCH
position 1:  B vs A   → different text → PATCH
position 2:  C vs B   → different text → PATCH
position 3:  ---      → CREATE C

Result: 4 operations. React rewrote every single row.
```

**With keys**, React compares **by identity**:

```
old:  [A:a] [B:b] [C:c]
new:  [X:x] [A:a] [B:b] [C:c]

"Keys a, b, c appear in both trees → same elements, untouched.
 Key x is new → insert one node at the front."

Result: 1 operation.
```

> **`key` is React's answer to "which item is which."** It converts positional guessing into identity matching.

## 🔥 The index-as-key bug

```jsx
{items.map((item, index) => <li key={index}>{item}</li>)}   // ⚠️
```

An index key is **derived from position**, so it tells React nothing new — the item at position 0 always has `key=0`, even after the list changes.

**Concrete failure.** A todo list with checkboxes:

```
BEFORE                          AFTER deleting "Buy milk" (index 0)
key=0  [ ] Buy milk             key=0  [✓] Walk dog     ← wrong checkbox state!
key=1  [✓] Walk dog             key=1  [ ] Pay bills
key=2  [ ] Pay bills
```

React sees `key=0` in both trees and concludes *"same element, different text."* So it **patches the text and keeps the DOM node** — including its internal state: the checked checkbox, typed input text, focus, scroll position.

The checkmark that belonged to "Walk dog" is now on the wrong row. **The data is right, the UI is wrong.** Brutal to debug.

## Rules for keys

| Rule | Detail |
|---|---|
| **Stable** | same item → same key across renders. Never `Math.random()` — it recreates every node every render, destroying state and performance |
| **Unique among siblings** | only within one list. Two different lists may both use `1, 2, 3` |
| **On the outermost element** returned from `.map()` | not on a child inside it |
| **Not readable as a prop** | React consumes `key`. Need it inside? Pass it twice: `<Row key={id} id={id} />` |

## When is index-as-key acceptable?

Only when **all three** hold:
1. The list is **static** — never reordered, filtered, inserted into, or deleted from.
2. Items have **no state** (no inputs, no toggles, no focus).
3. There is genuinely **no stable id** available.

Otherwise use a real id: a database id, a slug, or a `crypto.randomUUID()` generated **once when the item is created** — never during render.

> **Interview answer:** *"Keys give list items a stable identity so reconciliation can match elements across renders instead of comparing by position. Without them React patches by index, which is wasteful and — worse — reuses DOM nodes for the wrong items, so component state like a checked checkbox or typed input ends up on the wrong row. Index keys have that same bug whenever the list is reordered or filtered."*

---

<a name="props"></a>
# 9. Props in JSX — the details

## Passing values

```jsx
<Button label="Save" />          // string → quotes
<Button count={5} />             // number → braces
<Button active />                // shorthand for active={true}
<Button items={[1,2,3]} />       // array
<Button user={{ id: 1 }} />      // object
<Button onSave={handleSave} />   // function REFERENCE — not handleSave()
<Button icon={<Star />} />       // JSX as a prop
```

## ⚠️ Function vs function call

```jsx
<button onClick={handleClick}>     ✅ pass the function; React calls it on click
<button onClick={handleClick()}>   ❌ calls it NOW during render, passes the return value
<button onClick={() => save(id)}>  ✅ correct way to pass an argument
```

The middle one is a classic beginner bug — and an infinite render loop if the handler sets state.

## The spread operator

```jsx
const props = { id: 1, name: "V" };
<User {...props} />                     // same as <User id={1} name="V" />

// override after the spread — later wins
<Button {...props} variant="danger" />
```

Powerful for pass-through components — but spreading blindly from an unknown source makes it impossible to see what a component receives. Be deliberate.

## `children` is just a prop

```jsx
<Card>Hello</Card>
// identical to:
<Card children="Hello" />
```

The nesting syntax is sugar. Anything between the tags becomes `props.children`.

---

<a name="security"></a>
# 10. Security — JSX escapes by default

```jsx
const userInput = "<img src=x onerror='steal()' />";
<div>{userInput}</div>
```

Renders the **literal text** `<img src=x onerror='steal()' />`. It does not execute. React escapes every string before inserting it — **built-in XSS protection**.

The escape hatch, named to scare you:

```jsx
<div dangerouslySetInnerHTML={{ __html: userInput }} />   // ⚠️ executes
```

Use only for content you fully trust, or sanitize with **DOMPurify** first. The verbose name and the `__html` key are deliberate friction — you can't do this by accident.

---

<a name="gotchas"></a>
# 11. Small things that trip people up

**Comments:**
```jsx
<div>
  {/* this is a JSX comment */}
  <p>Hi</p>
</div>
```
It's `{ }` containing a JS comment. A bare `// comment` inside JSX renders as text.

**Multi-line returns need parentheses:**
```jsx
return (          // ✅ paren on the SAME line as return
  <div>...</div>
);

return            // ❌ automatic semicolon insertion → returns undefined
  <div>...</div>;
```

**Whitespace:** JSX strips leading/trailing whitespace and blank lines between elements. To force a space:
```jsx
<b>Hello</b>{" "}<i>world</i>
```

**Booleans:** `<input disabled />` means `disabled={true}`. And `disabled={false}` correctly removes the attribute.

---

<a name="interview"></a>
# 12. Interview questions & answers

### Q: "What is JSX and why use it?"
> *"JSX is a syntax extension that lets you write HTML-like markup in JavaScript. It's compiled — by Babel, or SWC in modern tooling — into `React.createElement` calls, or `jsx()` from the automatic runtime in React 17+, which return plain JavaScript objects describing the UI. It's optional; you could write those calls by hand. It exists purely so the structure of the UI is visually obvious in the code."*

### Q: "Why do I no longer need `import React from 'react'`?"
> *"React 17 introduced the automatic JSX transform. The compiler imports `jsx` from `react/jsx-runtime` itself, so React doesn't need to be in scope. You still import React if you use `React.useState` or `React.Fragment` explicitly."*

### Q: "Why can't you use `if` inside JSX?"
> *"Because everything inside curly braces must be an expression — something that evaluates to a value that can be passed as a function argument. `if` is a statement; it produces nothing. That's why React code uses ternaries, `&&` and `.map()`, or moves the logic above the return statement."*

### Q: "Why must a component return a single root element?"
> *"Because it compiles to a function call, and a function can only return one value. You either wrap the children in an element or use a Fragment, which groups them without adding a DOM node."*

### Q: "When would you use a Fragment?"
> *"When a wrapper element would break the DOM or CSS — table rows inside a `tbody`, list items inside a `ul`, or children of a flex or grid container where an extra div changes the layout. `<>` is the shorthand; you need the full `<React.Fragment>` form when the fragment needs a `key`, which happens when mapping over items that each render multiple siblings."*

### Q: "What's the bug with `{items.length && <List />}`?"
> *"If the array is empty, `&&` returns `0` rather than `false`, and React renders `0` because it renders numbers. A stray zero appears on the page. React ignores `false`, `null`, `undefined` and empty string, but not `0` or `NaN`. Fix it with an explicit comparison like `length > 0`, double negation, or a ternary."*

### Q: "What are keys and why does React need them?"
> *"Keys give list items a stable identity so reconciliation can match elements between the old and new tree. Without them React matches by position, so inserting at the front makes it patch every row instead of inserting one. Worse, it may reuse a DOM node for a different logical item, which moves component state — a checked checkbox or typed input — to the wrong row."*

### Q: "Why is index as a key a problem?"
> *"An index is positional, so it changes meaning whenever the list is reordered, filtered, or has items inserted or deleted. React sees the same key and assumes the same element, so it keeps the existing DOM node and its state while swapping the content. It's acceptable only for a static list with no state and no stable id."*

### Q: "Do keys need to be globally unique?"
> *"No, only unique among siblings in the same array. Two separate lists can both use ids 1, 2, 3."*

### Q: "Can a component read its own `key` prop?"
> *"No. React consumes `key` for reconciliation and doesn't pass it through. If the component needs the value, pass it again under a different name, like `id`."*

### Q: "How does React protect against XSS?"
> *"React escapes any string embedded in JSX before rendering, so injected markup is displayed as text rather than executed. The escape hatch is `dangerouslySetInnerHTML`, which is deliberately verbose to make the risk explicit — you should sanitize with something like DOMPurify before using it."*

### Q: "`onClick={handleClick}` vs `onClick={handleClick()}`?"
> *"The first passes the function so React can call it on click. The second calls it immediately during render and passes the return value as the handler — usually `undefined`, and if it sets state, an infinite render loop. To pass arguments, wrap it in an arrow function."*

### Q: "Why `className` and not `class`?"
> *"JSX compiles to JavaScript and `class` is a reserved keyword. Same reason `for` becomes `htmlFor`. These become keys on a props object, not HTML attributes."*

### Q: "What happens if you render an object in JSX?"
> *"React throws 'Objects are not valid as a React child.' React can render strings, numbers, arrays and elements, but it has no way to display a plain object. You need to render a specific property, or stringify it for debugging."*

### Q: "What's the performance concern with inline styles or inline objects in JSX?"
> *"Each render creates a new object, so a memoized child sees a new prop reference every time and re-renders anyway, defeating `React.memo`. It also churns the garbage collector on large lists. Prefer CSS classes; if you need an inline object, hoist it outside the component or memoize it."*

---

<a name="cheatsheet"></a>
# 13. Quick revision cheat sheet

```
JSX             = HTML-ish syntax in JS. Browsers CAN'T run it.
COMPILES TO     createElement(type, props, ...children) → plain JS object
                React 17+: jsx() from "react/jsx-runtime" (no React import needed)
                <div/>  → createElement("div")  STRING    = real DOM tag
                <Div/>  → createElement(Div)    REFERENCE = your component

IT'S A VALUE    store in vars, return it, put in arrays/objects, pass as props

{ } RULE        EXPRESSIONS only (anything you could put after `const x =`)
                ✅ vars, calls, ternary, &&, .map()    ❌ if / for / const
                never quote it: src={x} not src="{x}"
                {{ }} = braces + object literal, not special syntax

VS HTML         class→className · for→htmlFor · onclick→onClick
                style="…" → style={{camelCase}} (numbers get "px")
                all tags self-close · {/* comments */}
                data-* and aria-* keep their HTML names

ONE ROOT        wrap in an element, or use a Fragment
FRAGMENT        <>…</> groups WITHOUT a DOM node
                needs a key? use <React.Fragment key={}> — shorthand can't take one

CONDITIONALS    2 outcomes      → ternary
                show/hide       → &&
                guard clauses   → early return
                messy logic     → variable before return
                many states     → object lookup
                nested ternaries → ❌ extract a component

RENDERS         "str" · 42 · 0 ⚠️ · NaN ⚠️ · arrays
IGNORES         true · false · null · undefined · ""
ERRORS ON       plain objects → "Objects are not valid as a React child"
🔥 THE 0 BUG    {items.length && <X/>} renders "0" when empty
                → use length > 0, !!length, or a ternary

KEYS            identity for reconciliation — "which item is which"
                no key → match by POSITION → rewrites rows, moves state
                index  → same bug on any reorder / filter / insert / delete
                RULES: stable · unique among SIBLINGS · on the outermost
                       mapped element · NOT readable as a prop
                never Math.random()
                index OK only if: static list + no state + no stable id

PROPS           str="x" · num={5} · bool shorthand · fn={handler} (no parens!)
                {...spread} — later props win
                children is just a prop
                onClick={fn} ✅   onClick={fn()} ❌ calls during render

SECURITY        strings auto-escaped → XSS-safe by default
                dangerouslySetInnerHTML = escape hatch → sanitize (DOMPurify)

PERF            inline {{style}} / arrays / arrow fns = NEW object each render
                → breaks React.memo on children
```

---

## Connects to

- **[Part 1 — React Fundamentals](01-react-fundamentals.md):** §6 introduced `createElement`; §9 walked the diff — this part's `key` section is the list half of that same reconciliation step.
- **[Part 2 — Components](02-components.md):** `children`, JSX-as-props and composition all rely on "elements are just objects" (§2 here). Inline objects breaking `React.memo` ties back to Part 2 §3.
- **Props & State (next):** the data that flows into these `{ }` slots.
- **Rendering internals / Virtual DOM:** the full reconciliation and Fiber story.
- **Performance:** memoization, stable references, list virtualization.
- **Forms:** controlled inputs are the `{ }` + `onChange` pattern at scale.

## Suggested next topics

1. **Props & State** — recommended next; the data half of `UI = f(state)`.
2. **Hooks** — `useState`, `useEffect`, and custom hooks.
3. **Rendering internals** — reconciliation, Fiber, batching.

*— End of Part 3: JSX Deep-Dive —*
