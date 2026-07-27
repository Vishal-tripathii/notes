# React Study Notes — Part 1

## React Fundamentals (React Basics: What, Why, SPA/MPA, Declarative, Components, JSX, Data Flow, Architecture)

> **Format:** Written as **conceptual "how it works"** notes with the 14-question framework in mind (what / why / how internally / when / trade-offs / mistakes / interview Q / quick revision). Diagrams included. Fresh-start friendly.
>
> **Roadmap:** Part 1 → React Basics. Next sub-topics in Part 1: Components (functional/class/controlled…) and JSX (rules, fragments, conditional rendering, keys).

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
9. [Interview questions & answers](#interview)
10. [Quick revision cheat sheet](#cheatsheet)

---

<a name="what"></a>
# 1. What is React?

**React is a JavaScript *library* for building user interfaces** — component-based UIs that stay in sync with your data.

- Created by **Facebook (Meta)**, 2013, open source. Powers Facebook, Instagram, Netflix, WhatsApp Web.
- Concerns only the **view layer** (the "V" in MVC). Its one job: **render UI and keep it in sync with your data.**

## Library, not framework (interview point)
A **framework** (Angular) gives everything out of the box and dictates structure — routing, state, HTTP, forms. React does **only UI**; you assemble the rest: **React Router** (routing), **Redux/Zustand** (state), **fetch/Axios/React Query** (data). Tradeoff: more freedom & flexibility, but more decisions.

> One-liner: *"React is a declarative, component-based JavaScript library for building UIs, maintained by Meta. It handles the view layer and keeps the UI in sync with state efficiently via a Virtual DOM."*

---

<a name="why"></a>
# 2. Why React?

**The problem it solves:** with plain JS you **manually manipulate the DOM** on every data change → keeping UI in sync is error-prone spaghetti as the app grows.

**Advantages (why it won):**
1. **Declarative** — describe *what* the UI should be; React handles DOM updates → fewer "UI out of sync" bugs.
2. **Component-based** — reusable, composable pieces.
3. **Virtual DOM** — efficient updates; computes the *minimal* real-DOM changes.
4. **One-way data flow** — predictable, debuggable.
5. **Huge ecosystem + community + jobs** — the practical winner; backed by Meta.
6. **"Learn once, write anywhere"** — web (`react-dom`) and mobile (`react-native`) share the mental model.

> The winning combo: **Virtual DOM** (performance without manual DOM work) + **component composability** + Meta's backing.

---

<a name="spa-mpa"></a>
# 3. SPA vs MPA

## MPA (Multi-Page Application) — traditional
Every navigation fetches a **whole new HTML page** from the server → **full page reload**.
```
click link → browser requests /about → server sends full about.html → FULL RELOAD
```
Each URL = a separate HTML document the server builds (classic PHP, Rails, WordPress).

## SPA (Single-Page Application) — the React model
Browser loads **one** HTML page + a JS bundle **once**; then **JavaScript takes over**. Navigation **swaps content on the fly**, updates the URL via the History API, and fetches only **data (JSON)** as needed.
```
load index.html + JS bundle ONCE
click "About"   → JS swaps content, updates URL → NO reload
click "Contact" → JS swaps content, fetches JSON if needed → NO reload
```

| | **MPA** | **SPA (React)** |
|---|---|---|
| Navigation | Full reload, new HTML each time | JS swaps content, no reload |
| Server sends | Full HTML per page | HTML once, then JSON data |
| Feel | Traditional website | Fast, app-like, smooth |
| First load | Faster (small HTML) | Slower (big JS bundle) |
| SEO | Easy (full HTML from server) | Harder (content built client-side) |
| Server load | Higher (renders every page) | Lower (renders data only) |

- **SPA pros:** fast navigation, app-like UX, less server load, clean frontend ↔ API split.
- **SPA cons:** heavier initial JS download, **SEO challenges** (crawler may see an empty shell), needs client-side routing.

> Nuance (→ Part 15): **SSR / Next.js** blurs the line — SPA smoothness *plus* server-rendered HTML for SEO + fast first paint. "SPA vs MPA" evolves into "CSR vs SSR."

---

<a name="declarative"></a>
# 4. Declarative vs Imperative

- **Imperative** = step-by-step instructions on ***how*** to reach the result; you manually command each change.
- **Declarative** = **describe *what*** the end result should be; the system figures out how.

```js
// IMPERATIVE (vanilla JS) — command every DOM step
const li = document.createElement("li");
li.textContent = "New item";
document.querySelector("#list").appendChild(li);
```
```jsx
// DECLARATIVE (React) — describe what the UI IS for the current data
function List({ items }) {
  return <ul>{items.map(i => <li key={i.id}>{i.text}</li>)}</ul>;
}
```
You never say "create an `li` and append it" — you say *"the list is these items"*, and when `items` changes React updates the DOM to match.

> Analogy: imperative = **turn-by-turn directions**; declarative = **give the destination**, GPS finds the route. Basis of **`UI = f(state)`** — your UI is a function of your state.

---

<a name="components"></a>
# 5. Component-Based Architecture

React apps are built from **components**: independent, reusable, composable pieces of UI. Each is **self-contained** (own structure, logic, optional state) and returns a piece of UI.
```
        App
       / | \
  Header Main Footer
          |
    ┌─────┴─────┐
  Sidebar    ProductList
                 |
             ProductCard  (reused many times)
```
Build big UIs by **nesting small components** (composition), like functions calling functions.

**Benefits:** reusability · maintainability (fix once, fixed everywhere) · separation of concerns · testability · team scaling.

> Analogy: **Lego blocks** snap into anything. An app = a **tree of components**, `App` at the root.

---

<a name="jsx"></a>
# 6. JSX (overview — full rules in the dedicated JSX topic)

**JSX** = syntax extension to write **HTML-like markup inside JavaScript**.
```jsx
const element = <h1 className="title">Hello!</h1>;
```
- **Not HTML, not magic** — Babel compiles it to plain JS:
  ```js
  React.createElement("h1", { className: "title" }, "Hello!")
  ```
- That call returns a **React element** — a plain JS object *describing* UI (not a real DOM node yet).
- **Optional** (you could hand-write `createElement`) but universally used for readability.
- Embed JS with `{ }`: `<p>Count: {count}</p>`.

> For now: **JSX is a readable syntax for building the tree of description-objects React turns into DOM.** Ties to `UI = f(state)`.

---

<a name="dataflow"></a>
# 7. One-Way Data Flow

Data flows **one direction: top → down**, parent → child, via **props**.
```
   [Parent]  owns the state (data)
      │  passes data DOWN via props
      ▼
   [Child]   receives props (read-only), displays them
      │  to change parent's data → calls a callback passed down
      ▲
      └──── "actions up"
```
- Parent passes data **down** as props.
- Child **cannot** modify the parent's data directly; the parent passes a **callback** down, the child **calls it**, the parent updates its own state.
- Motto: **"Data down, actions up."**

**Why:** **predictability.** Data flows one way, so you always know where data comes from (its owner above) and where it changes (only its owner) → easy to trace bugs. Contrast **two-way binding** (Angular), where data and UI update each other and cause-and-effect gets murky.

> Interview phrasing: *"React enforces unidirectional data flow — state lives in a parent and flows down through props; children request changes by invoking callbacks, giving a single source of truth and predictable updates."*

---

<a name="architecture"></a>
# 8. React Architecture Overview

How the pieces connect into one pipeline:
```
  You write COMPONENTS (functions)  ──return──▶  JSX
        │                                          │ (Babel compiles)
        │                                          ▼
     STATE + PROPS feed in                 React ELEMENTS (Virtual DOM = plain-object tree)
        │                                          │
        └──── state changes → re-run components ──▶│
                                                   ▼
                                        RECONCILIATION (diff new tree vs old)
                                                   │
                                                   ▼
                                   react-dom COMMITS minimal changes → REAL DOM → browser paints
```
Core concepts (the map):
- **Components** — functions returning UI (§5).
- **Props & State** — data in; state = a component's own data (next parts).
- **JSX** — how you describe UI (§6).
- **Virtual DOM + Reconciliation** — efficient real-DOM updates (Parts 5 & 6).
- **One-way data flow** — how data moves (§7).

**Platform-agnostic (interview note):** the `react` package holds the core (components, elements, reconciliation); a separate **renderer** does the output — `react-dom` (browser), `react-native` (mobile). Same brain, different hands.

> Whole thing in one sentence: **You write components (functions) that describe the UI as a function of state using JSX; React builds a virtual tree, diffs it when state changes, and efficiently updates the real DOM — declaratively, data flowing one way.**

---

<a name="interview"></a>
# 9. Interview questions & answers

### Q: "Is React a library or a framework?"
> *"A library. It handles only the view layer — rendering UI and keeping it in sync with state. It doesn't prescribe routing, global state, or data fetching; you add React Router, Redux or Zustand, and a data layer yourself. That's more flexibility but more assembly, versus a full framework like Angular that ships all of it."*

### Q: "What problem does React solve?"
> *"Keeping the UI in sync with changing data. In plain JS you manually manipulate the DOM on every change, which is error-prone and hard to scale. React lets you declaratively describe the UI as a function of state, and it updates the DOM for you efficiently through a Virtual DOM."*

### Q: "SPA vs MPA?"
> *"An MPA loads a fresh full HTML page from the server on every navigation — full reloads. An SPA loads one HTML page and a JS bundle once, then JavaScript swaps the content on the fly and only fetches data, so navigation is instant and app-like. React builds SPAs. The tradeoff is a heavier initial load and weaker default SEO, which SSR or Next.js addresses."*

### Q: "Declarative vs imperative — where does React sit?"
> *"React is declarative. Imperative code gives step-by-step instructions on how to mutate the DOM; declarative code describes what the UI should look like for the current state and lets React work out the DOM changes. It's the destination-vs-turn-by-turn-directions distinction, and it's why React code is more readable and less bug-prone."*

### Q: "What is one-way data flow and why does it matter?"
> *"Data flows down from parent to child through props, and children can't mutate parent data directly — they call callbacks the parent passed down, and the parent updates its own state. 'Data down, actions up.' It matters because it makes the app predictable: there's a single source of truth and you always know where data originates and where it can change, which makes debugging far easier than two-way binding."*

### Q: "Walk me through React's architecture."
> *"You write components — functions that return JSX. JSX compiles to createElement calls that produce React elements, a virtual tree. When state changes, React re-runs the affected components to get a new tree, reconciles it by diffing against the previous tree, and the renderer — react-dom in the browser — commits only the minimal changes to the real DOM. The core is platform-agnostic; the renderer decides the output target."*

---

<a name="cheatsheet"></a>
# 10. Quick revision cheat sheet

- **React** = declarative, component-based JS **library** for UIs (view layer), by Meta.
- **Why** = no manual DOM · reusable components · Virtual DOM performance · one-way flow · huge ecosystem.
- **SPA** = one HTML load, JS swaps content (no reloads); **MPA** = full reload per page. React builds SPAs.
- **Declarative** = describe *what* (React); **Imperative** = command *how* (vanilla JS). `UI = f(state)`.
- **Component-based** = UI from reusable, composable pieces (Lego / tree).
- **JSX** = HTML-like syntax → compiles to `React.createElement` → element objects.
- **One-way data flow** = data down via props, actions up via callbacks → predictable.
- **Architecture** = components + JSX → Virtual DOM → reconciliation → react-dom → real DOM.
- **Library vs framework** · **`react` core vs `react-dom`/`react-native` renderer** — common interview one-liners.

### Next up (Part 1 continued)
- **Components** — functional vs class, controlled vs uncontrolled, container vs presentational, composition vs inheritance.
- **JSX deep-dive** — rules, expressions, fragments, conditional rendering, lists & keys.

*— End of Part 1: React Fundamentals (React Basics) —*
