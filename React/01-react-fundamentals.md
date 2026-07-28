# React Study Notes — Part 1

## React Fundamentals (What, Why, SPA/MPA, Declarative, Components, JSX, Data Flow, Architecture, react-dom)

> **Format:** Conceptual **"how it works"** notes, written fresh-start friendly — every term translated, nothing assumed. Follows the 14-question framework (what / why / how internally / when to use / when to avoid / pros / cons / performance / common mistakes / interview Qs / code examples / advanced / quick revision).
>
> **Continues:** Part 1 → React Basics. Next: **JSX deep-dive** (rules, fragments, conditional rendering, lists & `key`), then **Components** (functional vs class, controlled vs uncontrolled), then **Props & State**.

---

## Table of Contents

1. [What is React?](#what)
2. [Why React?](#why)
3. [SPA vs MPA](#spa-mpa)
4. [Declarative vs Imperative](#declarative)
5. [Component-Based Architecture](#components)
6. [JSX (overview)](#jsx)
7. [One-Way Data Flow](#dataflow)
8. [React Architecture Overview](#architecture)
9. [How react-dom actually paints (walkthrough)](#reactdom)
10. [Interview questions & answers](#interview)
11. [Quick revision cheat sheet](#cheatsheet)

---

<a name="what"></a>
# 1. What is React?

**React is a JavaScript library for building user interfaces.**

Break the sentence down:

- **JavaScript library** — just a `.js` package you install. Not a language, not a framework. *You* call *its* functions.
- **User interfaces** — the visible part: buttons, lists, forms, modals. React does **not** do databases, servers, or business logic.

**The one job React does:** keep what's on screen **in sync** with your data.

```
your data  ────►  React  ────►  what the user sees
(state)                          (real DOM / screen)

data changes ────► React re-renders ────► screen updates automatically
```

You change the data; React changes the screen. You never touch the screen yourself.

- Created by **Facebook (Meta)**, **2013**, open source. Powers Facebook, Instagram, Netflix, WhatsApp Web.
- Concerns only the **view layer** (the "V" in MVC).

## Library, not framework (classic interview point)

| | **Framework** (Angular) | **Library** (React) |
|---|---|---|
| Gives you | routing, forms, HTTP, state — everything | only the UI layer |
| Who's in charge | the framework calls your code | you call React |
| You must choose | nothing | router, state manager, data fetching |

React deliberately does **only the view**. You bolt on the rest:
- routing → **React Router**
- global state → **Redux / Zustand / Context**
- server data → **fetch / Axios / React Query**

**Trade-off:** more freedom, more decisions. Two React codebases can look completely different.

> **One-liner:** *"React is a declarative, component-based JavaScript library for building UIs, built by Meta in 2013. It handles the view layer and keeps the UI in sync with state efficiently using a Virtual DOM."*

---

<a name="why"></a>
# 2. Why React?

## Life before React — manual DOM manipulation

Say a cart count appears in three places. With plain JavaScript:

```js
// user adds an item — now YOU must update every place it appears
cart.push(item);
document.getElementById("cart-count").textContent   = cart.length;
document.getElementById("header-badge").textContent = cart.length;
document.getElementById("checkout-total").textContent = getTotal(cart);
if (cart.length > 0) document.getElementById("empty-msg").style.display = "none";
```

The problems:
1. **You** must remember every place that data appears. Miss one → the UI is wrong ("out of sync" bug).
2. As features grow, this becomes untraceable spaghetti — dozens of DOM pokes per action.
3. The data lives in one place, the truth on screen lives in another, and **nothing guarantees they match**.

## With React

```jsx
<span>Cart: {cart.length}</span>
```

Change `cart` → every place that reads `cart` updates itself. **You describe the UI once; React does the syncing.**

## The 6 reasons React won

1. **Declarative** — describe *what* it should look like, not *how* to change it → a whole class of sync bugs disappears.
2. **Component-based** — build once, reuse everywhere.
3. **Virtual DOM** — fast, minimal updates without hand-optimizing.
4. **One-way data flow** — data moves in one direction, so bugs are traceable.
5. **Ecosystem + jobs** — biggest community, backed by Meta.
6. **"Learn once, write anywhere"** — same mental model for web (`react-dom`) and mobile (`react-native`).

> The killer combo: **Virtual DOM** (speed without effort) + **components** (reuse) + **Meta's backing** (trust).

---

<a name="spa-mpa"></a>
# 3. SPA vs MPA

This is about **what happens when you click a link**.

## MPA — Multi-Page Application (traditional)

Every page is a separate HTML document built by the server.

```
click "About"
   ↓
browser asks server for /about
   ↓
server builds & sends a WHOLE new HTML page
   ↓
browser THROWS AWAY the current page, renders the new one
   ↓
⚪ white flash — FULL PAGE RELOAD
```

Everything resets: JS state gone, scroll position gone, CSS/JS re-parsed.
Examples: WordPress, classic PHP, Rails, Django.

## SPA — Single-Page Application (the React model)

The browser downloads **one** HTML shell + a JS bundle **once**. After that, JavaScript runs the show.

```
first visit
   ↓
download index.html (nearly empty!) + bundle.js   ← slow-ish, happens ONCE
   ↓
React takes over, renders the page
   ↓
click "About"
   ↓
NO server page request. React swaps the content in place.
URL updated via the History API (so back/forward still work)
   ↓
needs data? → fetches JSON only (a few KB), not a whole page
```

The HTML file is basically empty:

```html
<body>
  <div id="root"></div>       <!-- React fills this -->
  <script src="bundle.js"></script>
</body>
```

## Comparison

| | **MPA** | **SPA (React)** |
|---|---|---|
| Navigation | full reload, white flash | instant, no flash |
| First load | fast (small HTML) | slower (big JS bundle) |
| Later navigation | slow (full page each time) | fast (JSON only) |
| Server sends | full HTML per page | HTML once, then JSON |
| Server load | high (renders every page) | low (serves data) |
| SEO | great by default | weak by default — needs SSR |
| Feels like | a website | an app |

**The core trade-off:** an SPA pays a **slower first load** to buy **instant everything afterwards**. That's why Gmail, Figma and Netflix are SPAs — but a blog or news site often isn't.

**The SEO problem, plainly:** a crawler that doesn't execute JavaScript sees `<div id="root"></div>` — an empty page.

> **Nuance (→ Part on SSR/CSR):** **SSR / Next.js** blurs the line — server-rendered HTML for SEO and fast first paint, *plus* SPA smoothness after hydration. "SPA vs MPA" evolves into "CSR vs SSR."

---

<a name="declarative"></a>
# 4. Declarative vs Imperative

The single biggest mental shift when learning React.

**Analogy — getting to a restaurant:**
- **Imperative** = turn-by-turn directions: *"go 200m, turn left, right at the lights, park behind the building."* You specify every **step**.
- **Declarative** = the destination: *"take me to Domino's."* You specify the **outcome**; someone else works out the steps.

React is the second one.

## In code

**Imperative (vanilla JS)** — you write every step:

```js
const btn = document.createElement("button");
btn.textContent = "Add";
btn.className = "primary";
btn.addEventListener("click", handleAdd);
document.body.appendChild(btn);

// later, when loading starts:
btn.disabled = true;
btn.className = "primary disabled";
btn.textContent = "Adding...";
```

**Declarative (React)** — you write the destination:

```jsx
<button className={loading ? "primary disabled" : "primary"} disabled={loading}>
  {loading ? "Adding..." : "Add"}
</button>
```

You never wrote "change the text", "add the class", "set disabled". You described **what it should be when `loading` is true** — React figures out the DOM edits.

## Why it matters practically

| | **Imperative** | **Declarative** |
|---|---|---|
| You manage | every *transition* between states | just the *states* themselves |
| Typical bug | "I forgot to reset the class on the error path" | mostly disappears |
| Reading code | replay the steps mentally to know the UI | look at it — the UI is right there |

**The formula that carries everything:**

```
UI = f(state)
```

The UI is a **function of state**. Same state in → same screen out. Change the state, get a new screen. You never mutate the screen directly.

---

<a name="components"></a>
# 5. Component-Based Architecture

**A component is a reusable, self-contained piece of UI.** In modern React it's just a **function that returns UI**.

```jsx
function Button({ label }) {
  return <button className="btn">{label}</button>;
}
```

Used like a custom HTML tag:

```jsx
<Button label="Save" />
<Button label="Cancel" />
```

> **Analogy:** Lego bricks. Small pieces (Button, Input, Avatar) snap into bigger pieces (LoginForm, Navbar), which snap into pages.

## Composition — the component tree

A real app is a **tree**:

```
        App
         │
   ┌─────┼──────┐
Navbar  Feed   Footer
         │
    ┌────┴────┐
  Post      Post          ← same component, different data
    │
 ┌──┴───┐
Avatar LikeButton
```

Each component:
- has its **own logic and its own look**,
- can hold its **own state**,
- can be **reused** anywhere,
- can be **tested in isolation**.

## Two rules that make components work

**1. Names must be Capitalized.**
`<button>` = real HTML button. `<Button>` = your component. That's literally how JSX tells them apart — lowercase compiles to the string `"button"`, capitalized compiles to a reference to your function. A lowercase component name renders as an unknown HTML tag and shows nothing.

**2. Components must be pure-ish** — same props in, same UI out. No surprise side effects during render.

## Why this beats one big file

| One giant HTML/JS file | Components |
|---|---|
| copy-paste the same card 20 times | write `<Card />` once, use 20 times |
| fix a bug in 20 places | fix in 1 place |
| everything can touch everything | each piece is isolated |
| impossible to test a part | test `Button` on its own |

**Benefits:** reusability · maintainability · separation of concerns · testability · team scaling.

---

<a name="jsx"></a>
# 6. JSX (overview — full rules in the JSX deep-dive)

**JSX is HTML-looking syntax written inside JavaScript.**

```jsx
const el = <h1 className="title">Hello, {name}</h1>;
```

## The single most important fact about JSX

**The browser cannot read JSX.** It is not HTML and not valid JavaScript. A build tool (Babel / Vite / SWC) **compiles it away** before it ever reaches the browser.

```jsx
// what you write
<h1 className="title">Hello</h1>

// what it compiles to
React.createElement("h1", { className: "title" }, "Hello")

// what that function RETURNS — a plain JavaScript object
{
  type: "h1",
  props: { className: "title", children: "Hello" }
}
```

That plain object is called a **React element**. This is the foundation of everything else:

> **JSX → `createElement()` → plain JS objects → that tree of objects IS the Virtual DOM.**

When people say "Virtual DOM", they mean *this tree of lightweight JS objects describing the UI*. Cheap to create, cheap to compare — which is exactly why React can diff two versions fast.

So JSX is **syntax sugar** — pure convenience. You *could* hand-write `createElement` calls; nobody wants to.

## The rules (and why each exists)

| Rule | Reason |
|---|---|
| `className` not `class` | `class` is a reserved word in JS |
| `htmlFor` not `for` | `for` is a JS loop keyword |
| `onClick` not `onclick` (camelCase) | it's a JS object property, not an HTML attribute |
| Must return **one** root element | a function returns one value → wrap in a `<div>` or a **Fragment** `<>...</>` |
| Every tag must close: `<img />`, `<br />` | it compiles to function calls — they need an explicit end |
| `{ }` to embed JavaScript | anything inside `{}` is evaluated as a JS **expression** |

## `{ }` holds expressions, not statements

```jsx
{ user.name }              ✅ expression
{ 2 + 2 }                  ✅
{ items.map(...) }         ✅ returns a value
{ cond ? <A/> : <B/> }     ✅ ternary IS an expression
{ if (cond) { ... } }      ❌ if-statements are NOT expressions
```

That's exactly **why** React code is full of ternaries and `&&` — you can't put an `if` inside JSX, so you use expressions that produce a value.

---

<a name="dataflow"></a>
# 7. One-Way Data Flow

**Data flows down the tree, parent → child. Never sideways, never up.**

```
        App          state lives here: user = "Vishal"
         │
         │  props (down) ↓
      Navbar
         │  props (down) ↓
      Avatar          receives user, can only READ it
```

- A parent passes data to a child via **props**.
- Props are **read-only**. A child must never modify what it received.
- A sibling cannot hand data to another sibling directly.

## "But my child needs to change the data!"

It doesn't change it. The parent passes down a **function**; the child **calls** it; the parent updates its own state — and the new value flows back down as a prop.

```jsx
function Parent() {
  const [count, setCount] = useState(0);
  //         data ↓            behaviour ↓
  return <Child count={count} onIncrement={() => setCount(count + 1)} />;
}

function Child({ count, onIncrement }) {
  // Child does NOT own count. It just asks: "please increment."
  return <button onClick={onIncrement}>{count}</button>;
}
```

```
Parent ──── count (data) ────►  Child
Parent ──── onIncrement ─────►  Child
   ▲                              │
   └──── child CALLS it ──────────┘   "an event happened"

then Parent updates state → new count flows DOWN again
```

**Motto: "Data down, actions up."**
Moving state to the nearest common parent so two components can share it is called **lifting state up**.

## Why enforce one direction?

Because when the UI is wrong you can **trace it**. There's exactly one path a value could have taken to reach the screen — walk up the tree and you find its owner. With two-way binding (old Angular), A changes B while B changes A, and cause-and-effect becomes unfollowable.

**The cost:** **prop drilling** — threading a prop through 5 components that don't care about it just to reach the 6th. Fixes (later parts): **Context API**, **Redux / Zustand**.

> **Interview phrasing:** *"React enforces unidirectional data flow — state lives in a parent and flows down through props; children request changes by invoking callbacks. That gives a single source of truth and predictable, traceable updates."*

---

<a name="architecture"></a>
# 8. React Architecture Overview

Everything above, connected into one picture:

```
        YOU WRITE                    BUILD STEP                RUNTIME
┌──────────────────────┐      ┌────────────────────┐   ┌──────────────────┐
│  Components (JSX)    │ ───► │ Babel/Vite compiles│──►│ createElement()  │
│  + state             │      │ JSX away           │   │ calls run        │
└──────────────────────┘      └────────────────────┘   └────────┬─────────┘
                                                                │
                                                                ▼
                                                    ┌───────────────────────┐
                                                    │  VIRTUAL DOM          │
                                                    │  tree of plain JS     │
                                                    │  objects {type,props} │
                                                    └───────────┬───────────┘
                                                                │
                        state changes → build a NEW tree        │
                                                                ▼
                                                    ┌───────────────────────┐
                                                    │  RECONCILIATION       │
                                                    │  diff old vs new tree │
                                                    │  → minimal change list│
                                                    └───────────┬───────────┘
                                                                │
                                                                ▼
                                                    ┌───────────────────────┐
                                                    │  react-dom            │
                                                    │  applies ONLY those   │
                                                    │  changes to real DOM  │
                                                    └───────────────────────┘
```

## The update cycle in words

1. Something happens — a click, a fetch resolves.
2. You call `setState` → React marks that component as needing re-render.
3. React **re-runs the component function** → produces a **new** Virtual DOM tree.
4. React **diffs** new tree vs old tree — **reconciliation**.
5. React computes the **minimum set of real DOM operations**.
6. `react-dom` applies just those. Everything untouched stays untouched.

## Why the Virtual DOM is fast (the honest version)

Not because JS objects are magic — because **real DOM operations are expensive**. Touching the real DOM can trigger layout recalculation and repaint. Comparing two plain JS objects is cheap.

> ⚠️ **Interview nuance:** the Virtual DOM is **not** "faster than hand-written DOM code." Perfectly hand-optimized imperative code will always beat it, because diffing is extra work. The VDOM's real win is that you get **near-optimal updates for free** while writing simple declarative code.

## The two packages

| Package | Job |
|---|---|
| `react` | components, hooks, elements, diffing — **platform-agnostic** (the brain) |
| `react-dom` | actually touches the browser DOM — **the renderer** (the hands) |

Swap the renderer and the same React knowledge targets other platforms: `react-native` (mobile), `react-three-fiber` (3D). **That** is what "learn once, write anywhere" actually means.

> **Whole thing in one sentence:** *You write components that describe the UI as a function of state using JSX; React builds a virtual tree, diffs it when state changes, and the renderer efficiently patches the real DOM — declaratively, with data flowing one way.*

---

<a name="reactdom"></a>
# 9. How react-dom actually paints (full walkthrough)

Follow one tiny app all the way to pixels.

```jsx
function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div className="box">
      <h1>Count: {count}</h1>
      <button onClick={() => setCount(count + 1)}>+1</button>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Counter />);
```

The HTML file is just `<div id="root"></div>` — completely empty.

## Phase 1 — First render (mount)

**Step 1 — JSX is already gone.** Before the browser sees your code, the build tool compiled it:

```js
React.createElement("div", { className: "box" },
  React.createElement("h1", null, "Count: ", 0),
  React.createElement("button", { onClick: fn }, "+1")
)
```

**Step 2 — those calls return plain objects** (the Virtual DOM — nothing more):

```js
{
  type: "div",
  props: {
    className: "box",
    children: [
      { type: "h1",     props: { children: ["Count: ", 0] } },
      { type: "button", props: { onClick: fn, children: "+1" } }
    ]
  }
}
```

**No DOM involved yet.** This is just a *description* sitting in memory.

**Step 3 — `react-dom` reads the description and builds real DOM nodes:**

```js
document.createElement("div")     → div.className   = "box"
document.createElement("h1")      → h1.textContent  = "Count: 0"
document.createElement("button")  → button.textContent = "+1"
// stitch them together, then ONE insertion:
root.appendChild(div)
```

React builds the whole subtree **detached from the page**, then attaches it in a **single** operation. One insert, not three.

**Step 4 — the browser paints.** The moment the DOM changed:

```
DOM changed → Style   (which CSS applies?)
            → Layout  (where & how big is everything?)
            → Paint   (draw pixels)
            → Composite (put layers on screen)
```

Screen shows `Count: 0` and a button.

## Phase 2 — You click `+1`

**Step 1 — `setCount(1)` runs.** React does **not** touch the DOM. It marks `Counter` as dirty and schedules work.

**Step 2 — React re-runs your function.** `Counter()` executes again with `count = 1`, producing a **brand new** object tree:

```js
{ type: "div", props: { className: "box", children: [
    { type: "h1",     props: { children: ["Count: ", 1] } },   // ← 0 became 1
    { type: "button", props: { onClick: fn, children: "+1" } }
]}}
```

> 🔑 **The thing beginners get wrong: re-render ≠ repaint.** "Re-render" means *the function ran and produced a new description.* Still **zero DOM operations** at this point.

**Step 3 — reconciliation (the diff).** React walks old vs new, side by side:

```
old                              new                     verdict
──────────────────────────────────────────────────────────────────────
div.box            vs   div.box                  same type, same props → SKIP
  h1 "Count: 0"    vs     h1 "Count: 1"          same type, TEXT DIFFERS → PATCH
  button "+1"      vs     button "+1"            identical → SKIP
```

Result: a change list with exactly **one** entry.

**Step 4 — `react-dom` applies only that:**

```js
h1TextNode.nodeValue = "Count: 1";   // literally the only DOM write
```

The `<div>` is untouched. The `<button>` is untouched — not recreated, so it doesn't lose focus, and anything typed elsewhere isn't wiped.

**Step 5 — the browser repaints.** Because only a text node changed, the browser can often do a small repaint instead of laying out the whole page again.

## The whole trip in one diagram

```
   click
     │
     ▼
setCount(1)                    ← no DOM touched
     │
     ▼
Counter() re-runs              ← no DOM touched   ("re-render")
     │
     ▼
new VDOM tree (plain objects)  ← no DOM touched
     │
     ▼
diff old vs new  ──────────────► change list: [ h1 text: "0" → "1" ]
     │
     ▼
react-dom: h1.nodeValue = "Count: 1"    ← THE ONLY REAL DOM WRITE
     │
     ▼
browser: Style → Layout → Paint → Composite
     │
     ▼
   pixels
```

## Why bother with the middle steps?

| | Naive vanilla JS | React |
|---|---|---|
| Approach | `root.innerHTML = ...` — rebuild everything | patch one text node |
| DOM nodes destroyed | all 3 | 0 |
| Button loses focus / state | yes | no |
| Layout cost | full re-layout | minimal |

React spends a little cheap JavaScript work (diffing) to avoid expensive DOM work. That's the entire bargain.

## Three takeaways

1. **`react` decides *what* changed; `react-dom` decides *how* to apply it.** That split is why the same components can render to mobile — swap the renderer, keep the brain.
2. **Re-render ≠ repaint.** Your component function running is cheap and normal. Only the diff *result* reaches the DOM.
3. **React never rebuilds the page — it surgically edits.** Untouched nodes keep their identity, so focus, scroll position and CSS transitions all survive.

---

<a name="interview"></a>
# 10. Interview questions & answers

### Q: "Is React a library or a framework?"
> *"A library. It handles only the view layer — routing, state management and data fetching come from separate packages you choose. Angular is a framework because it ships all of that and dictates your app's structure. The trade-off is flexibility versus decision fatigue."*

### Q: "What problem does React solve?"
> *"Keeping the UI in sync with changing data. In plain JS you manually manipulate the DOM on every change, so you have to remember every place a value appears — error-prone and unscalable. React lets you declaratively describe the UI as a function of state and updates the DOM for you, minimally, via the Virtual DOM."*

### Q: "What is the Virtual DOM and why does React use it?"
> *"The Virtual DOM is a lightweight in-memory tree of plain JavaScript objects that describes the UI. When state changes, React builds a new tree, diffs it against the previous one, and applies only the minimal set of changes to the real DOM. It's used because real DOM operations are expensive — they trigger layout and repaint — while comparing JS objects is cheap. You get near-optimal DOM updates without writing imperative update code."*

### Q: "Is the Virtual DOM always faster than direct DOM manipulation?"
> *"No. Perfectly hand-written imperative DOM code will beat it, because diffing is extra work. React's value is consistently good updates while you write simple declarative code — it optimizes the common case so you don't have to."*

### Q: "Declarative vs imperative — explain with an example."
> *"Imperative means writing the steps: create the element, set its text, add a class, later remove it. Declarative means describing the result — `disabled={loading}` — and letting React work out the steps. The benefit is you only manage states, not transitions between states, which eliminates a whole class of 'I forgot to reset that' bugs."*

### Q: "What is JSX? Can browsers run it?"
> *"JSX is HTML-like syntax inside JavaScript. Browsers cannot run it — a compiler like Babel transforms it into `React.createElement()` calls at build time, which return plain JavaScript objects. Those objects form the Virtual DOM. JSX is purely syntactic sugar that makes UI structure readable."*

### Q: "Why `className` instead of `class`?"
> *"Because JSX compiles to JavaScript and `class` is a reserved keyword. Same reason `for` becomes `htmlFor`. These are JavaScript object keys, not HTML attributes."*

### Q: "Why must component names be capitalized?"
> *"JSX uses casing to decide what to compile to. Lowercase becomes a string — a real DOM tag like `\"div\"`. Capitalized becomes a reference to your component function. A lowercase component name would be treated as an unknown HTML element and render nothing."*

### Q: "What's one-way data flow, and how does a child update the parent?"
> *"Data flows down from parent to child through read-only props. A child never mutates them — the parent passes down a callback, the child calls it to signal an event, and the parent updates its own state. The new value then flows back down. Moving state to the nearest common parent so siblings can share it is called lifting state up."*

### Q: "SPA vs MPA — trade-offs?"
> *"An MPA fetches a fresh HTML page from the server on every navigation, so the page fully reloads. An SPA loads one HTML shell and a JS bundle once, then swaps content client-side and fetches only JSON. SPAs have a slower first load and weaker default SEO, but every subsequent navigation is instant and server load is lower. SSR frameworks like Next.js exist to fix the first-load and SEO downsides."*

### Q: "Walk me through what happens when I call setState."
> *"React marks the component as needing a re-render — it doesn't touch the DOM. It re-runs the component function to produce a new Virtual DOM tree, diffs that against the previous tree, and produces a minimal change list. Then react-dom commits only those changes to the real DOM, and the browser runs style, layout, paint and composite. The important distinction is that a re-render is just the function running again — only the diff result reaches the DOM."*

### Q: "What's the difference between `react` and `react-dom`?"
> *"`react` is the platform-agnostic core — components, hooks, elements, reconciliation. `react-dom` is the renderer that actually manipulates browser DOM nodes. Because they're separate, the same core drives other renderers like react-native. React decides what changed; the renderer decides how to apply it."*

---

<a name="cheatsheet"></a>
# 11. Quick revision cheat sheet

```
REACT           = JS library for UIs. View layer only. Meta, 2013.
CORE IDEA       = UI = f(state).  Change data → screen follows.
LIBRARY vs FW   = React gives UI only; you pick router/state/http.

DECLARATIVE     = describe the destination, not the turns.
IMPERATIVE      = you write every DOM step yourself.

COMPONENT       = function that returns UI. MUST be Capitalized.
                  Reusable, isolated, composable → forms a tree.

JSX             = HTML-ish syntax in JS. Browsers CAN'T run it.
                  Babel → React.createElement() → plain JS objects.
                  class→className, for→htmlFor, onclick→onClick.
                  ONE root element. All tags self-close. {} = expressions only.

VIRTUAL DOM     = that tree of plain JS objects.
                  Fast because real DOM ops are expensive, not because JS is magic.

RECONCILIATION  = diff old VDOM vs new VDOM → minimal real DOM edits.

RE-RENDER ≠ REPAINT
                  re-render = your function ran again (cheap, no DOM)
                  repaint   = browser drew pixels (only after a real DOM write)

DATA FLOW       = one-way, parent → child, via read-only props.
                  Child signals up by CALLING a callback prop.
                  "Data down, actions up."
                  Shared state → lift it to the common parent.
                  Pain point: prop drilling → Context / Redux.

SPA             = one HTML + JS bundle; JS handles navigation; fetches JSON.
                  slow first load, instant after, weak SEO → fix with SSR.
MPA             = server sends a full new page each click; full reload.

PACKAGES        react     = components, hooks, diffing (platform-agnostic, the brain)
                react-dom = the renderer that touches the browser DOM (the hands)
                (swap renderer → react-native, react-three-fiber)

THE PIPELINE
JSX → createElement() → VDOM objects → diff → minimal DOM patch
    → Style → Layout → Paint → Composite → pixels
```

**The three sentences that carry everything:**
1. `UI = f(state)` — you describe, React updates.
2. JSX is sugar for `createElement`, which returns plain objects — and those objects **are** the Virtual DOM.
3. Data goes **down** as props, events come **up** as callbacks.

---

## Connects to

- **Part 2 (next) — JSX deep-dive:** rules, fragments, conditional rendering, lists & `key`. `key` plugs directly into the reconciliation step in §9 — it tells React "same item, just moved" instead of "destroy and rebuild."
- **Components deep-dive:** functional vs class, composition vs inheritance, controlled vs uncontrolled, container vs presentational.
- **Props & State:** the data half of `UI = f(state)`.
- **Rendering internals / Virtual DOM:** the full reconciliation and Fiber story that §8–§9 sketch.
- **SSR / CSR:** the real answer to the SPA SEO and first-load problems in §3.
- **State management:** the answer to prop drilling in §7.

## Suggested next topics

1. **JSX deep-dive** — recommended next; makes VDOM, reconciliation and `key` click.
2. **Components** — functional vs class, controlled vs uncontrolled.
3. **Props & State** — then straight into hooks.

*— End of Part 1: React Fundamentals —*
