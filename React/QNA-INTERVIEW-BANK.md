# ⚛️ React Interview Question Bank — Answered

> **How to use:** cover the answer, say yours out loud, then compare — speaking still finds gaps that reading hides. But unlike a plain drill sheet, this bank is written to work as a **standalone crash course**: every answer opens with a plain definition, then the tradeoff/reasoning behind it, then a short code snippet wherever the concept has real shape in code. If someone has time for exactly one file before an interview and never opens the rest of the `React/` notes folder, this is the one that gets them ready.
>
> **~202 questions · 25 sections**

---

## Sections

| | Topic | Note |
|---|---|---|
| 1 | [React Architecture](#s1) | [Part 01](01-react-fundamentals.md) |
| 2 | [JSX](#s2) | [Part 03](03-jsx-deep-dive.md) |
| 3 | [Components](#s3) | [Part 02](02-components.md) |
| 4 | [Rendering & Reconciliation](#s4) | [Part 08](08-rendering-internals-and-vdom.md) |
| 5 | [State](#s5) | [Part 05](05-state.md) |
| 6 | [Hooks](#s6) | [Part 07](07-hooks.md) |
| 7 | [useEffect](#s7) | [Part 06](06-lifecycle.md), [07](07-hooks.md) |
| 8 | [React Fiber](#s8) | [Part 08](08-rendering-internals-and-vdom.md) |
| 9 | [Props](#s9) | [Part 04](04-props.md) |
| 10 | [Context](#s10) | [Part 11](11-state-management.md) |
| 11 | [Re-rendering](#s11) | [Part 08](08-rendering-internals-and-vdom.md), [09](09-performance.md) |
| 12 | [Performance](#s12) | [Part 09](09-performance.md) |
| 13 | [Event System](#s13) | — |
| 14 | [Forms](#s14) | [Part 02](02-components.md) |
| 15 | [Routing](#s15) | — |
| 16 | [Build System](#s16) | [Part 09](09-performance.md) |
| 17 | [React Internals](#s17) ⭐ | [Part 08](08-rendering-internals-and-vdom.md) |
| 18 | [React 18+](#s18) | [Part 07](07-hooks.md), [08](08-rendering-internals-and-vdom.md) |
| 19 | [State Management](#s19) | [Part 11](11-state-management.md) |
| 20 | [Senior "Why" Questions](#s20) ⭐ | — |
| 21 | [Custom Hooks](#s21) | [Part 07](07-hooks.md), [10](10-hoc.md) |
| 22 | [Error Handling](#s22) | [Part 06](06-lifecycle.md), [12](12-async-javascript.md) |
| 23 | [Data Fetching & Server State](#s23) | [Part 12](12-async-javascript.md), [11](11-state-management.md) |
| 24 | [Testing](#s24) | — |
| 25 | [Scenario & Debugging](#s25) ⭐ | — |

> Sections 13, 15 and 24 aren't covered by a dedicated note file in this folder — the answers here are self-contained, drawing on general React/tooling knowledge where the notes don't reach.

---

<a name="s1"></a>
# 1. React Architecture

### What is React?
React is a JavaScript library — not a framework — for building user interfaces out of components, whose one job is keeping what's on screen in sync with your data.

You describe the UI as a function of state, and React works out how to update the DOM to match. It concerns itself only with the view layer: routing, state management and data fetching are separate packages you choose, unlike a framework such as Angular that ships all of that as one versioned unit. Created by Facebook (Meta) in 2013, it's the "V" in MVC and nothing more.

### Why was React created?
React exists because manually keeping the DOM in sync with changing data doesn't scale — the same piece of data shown in three places means three manual DOM updates every time it changes, and forgetting one produces a UI silently out of sync with its own data.

React's answer was to stop editing the DOM directly and start *describing* the UI: re-describe the whole thing on every change and let the library diff it against what's currently rendered, applying only the minimal update. That trades a class of "I forgot to update that span" bugs for a small, constant diffing cost.

### What problems does React solve?
Two, at heart. Keeping the UI in sync with data without you personally tracking which parts need to change — the direct answer to why React was created. And composition: building complex UI out of small, reusable, independently testable pieces rather than one large, tangled file where every part can touch every other part.

Both are force multipliers as an app grows — hand-written DOM sync gets *harder* per feature added, while a component library of small pieces gets easier to extend, since new UI is mostly assembly of things that already exist and already work.

### What is declarative programming, and how does React embody it?
Declarative code describes the desired result and lets something else work out the steps to get there, as opposed to imperative code, which spells out every step.

The analogy: imperative is turn-by-turn taxi directions; declarative is naming the destination. In React you write `disabled={loading}`, not "find the button, add a class, remove it later" — the whole DOM transition is implied by the state, so you only ever manage states, not the transitions between them, which is where most manual-DOM bugs come from.

```jsx
// imperative — you write every step
btn.disabled = true;
btn.className = "primary disabled";

// declarative — you describe the destination
<button className={loading ? "primary disabled" : "primary"} disabled={loading} />
```

### Why is React called a library instead of a framework?
Because it does only rendering — routing, state management, data fetching, forms and build tooling are all separate packages you choose and wire in yourself, rather than a single opinionated bundle a framework hands you.

A framework calls your code and dictates structure; with React, you call React's functions and structure the app yourself. The tradeoff is flexibility versus consistency — two React codebases can look completely different, where two Angular codebases look similar by construction.

### How does React differ from Angular?
React is a rendering library that diffs a virtual DOM; Angular is a full framework that ships routing, HTTP, forms and dependency injection together and checks live bindings to update the DOM directly, without a virtual DOM step.

Angular has real DI and RxJS built in; React has neither, and you reach for community packages instead. The practical tradeoff is the same one as library-vs-framework generally: React gives you freedom and more decisions to make, Angular gives you a prescribed structure and less to decide.

### What is ReactDOM, and why is React split into two packages?
`react-dom` is the renderer that actually manipulates the browser DOM; `react` itself is platform-agnostic — it produces a description of the UI (elements, hooks, the diffing algorithm) with no idea what platform that description will be painted onto.

Splitting rendering from the "brain" is what makes "learn once, write anywhere" literally true: swap the renderer and the same component code targets another platform — `react-native` for mobile, `react-three-fiber` for 3D — without React itself changing.

### What happens when `createRoot()` is called?
It creates a root container tied to a real DOM node and enables React 18's concurrent features — but nothing renders yet. `createRoot` only prepares the container; it's the subsequent `root.render(<App />)` call that actually triggers the first render.

```jsx
const root = createRoot(document.getElementById("root"));  // container ready, nothing painted yet
```

### How does React bootstrap an application, end to end?
`root.render(<App />)` starts the first render, which builds the whole fiber tree describing the entire UI in memory before touching the browser at all. Only once that's complete does React create the real DOM nodes and insert the finished subtree into the page in a single operation — rather than incrementally building it up node by node in the visible document, which would mean the user briefly sees a half-built page.

```jsx
root.render(<App />);   // builds the fiber tree first, then commits it in one shot
```

### What is the render tree, and how does it relate to your file structure?
The render tree is the tree of components actually rendered for the *current* state, which can differ from your file/import structure since conditional rendering means a component may or may not appear on a given render.

React's internal fiber tree (see [§8](#s8)) is the concrete, evolving representation of this — it's rebuilt and diffed against the previous version on every update, which is the mechanism the rest of the architecture (reconciliation, diffing, commit) operates on.

---

<a name="s2"></a>
# 2. JSX

### What is JSX, and is it HTML?
JSX is a syntax extension that lets you write markup inside JavaScript; it isn't part of the language and isn't HTML — a compiler (Babel, SWC, esbuild) transforms it into ordinary function calls before it ever reaches the browser.

It looks like HTML on purpose, but under the casing and naming it's plain JavaScript, which is exactly why `className` replaces `class`, `onClick` replaces `onclick`, attributes are camelCase, and every tag must self-close.

```jsx
<h1 className="title">Hello</h1>
// compiles to roughly:
jsx("h1", { className: "title", children: "Hello" })
```

### How is JSX converted into JavaScript, and what does the result look like at runtime?
A build tool compiles each JSX element into a function call that returns a plain JavaScript object — a React Element — describing a type and its props; nothing on screen exists yet at this point, it's just a description sitting in memory.

Modern React (17+) compiles to `jsx()`/`jsxs()` calls from the automatic `react/jsx-runtime`, which is why you no longer need to `import React` in every file that uses JSX — older code compiled to `React.createElement()` directly, which is why it did.

```js
{ type: "h1", props: { className: "title", children: "Hello" } }
```

### Why must a component return only one root element, and what is a Fragment?
A component compiles down to a single function call that returns a single value, so JSX can't have two sibling root elements any more than a JavaScript function can `return a, b`.

The historical fix was wrapping everything in an extra `<div>`, but that div is a real DOM node that can break `flex`/`grid` layouts or produce invalid HTML inside a `<table>`. A **Fragment** (`<>...</>` or the long form `<React.Fragment>`) groups children without adding any DOM node at all — only the long form accepts a `key`, needed when mapping over items that each render multiple siblings.

```jsx
{items.map(item => (
  <React.Fragment key={item.id}>
    <dt>{item.term}</dt><dd>{item.definition}</dd>
  </React.Fragment>
))}
```

### Why do component names have to start with a capital letter?
Because that casing is literally how the compiler decides what to emit — lowercase compiles to a string (`jsx("div", …)`, a real DOM tag), capitalized compiles to a variable reference (`jsx(MyComponent, …)`, your function).

Write `<myComponent />` expecting your component and React looks for an HTML element named `mycomponent` instead — it renders nothing your component logic produced, and typically shows a blank or broken spot with no error explaining why.

### What can go inside `{ }` in JSX, and what can't?
Only JavaScript **expressions** — anything that could sit on the right side of `const x = ______` — because each `{ }` becomes an argument in a function call, and function arguments must be expressions, not statements.

That single restriction is why React code leans so heavily on ternaries, `&&` and `.map()`: an `if` statement, a `for` loop or a `const` declaration produces no value, so none of them are legal inside `{ }`. You can still use `if`/`for` — just above the `return`, assigning the result to a variable first.

```jsx
{ cond ? <A /> : <B /> }     // ✅ ternary is an expression
{ items.map(i => <Row/>) }   // ✅ returns an array
{ if (cond) {...} }          // ❌ statement — syntax error
```

### What's the famous `{items.length && <List/>}` bug, and how do you avoid it?
`&&` returns its left operand when that's falsy — and when `items.length` is `0`, that's the number `0`, not the boolean `false`. React renders numbers, so a stray literal `"0"` appears on the page instead of nothing.

React ignores `false`, `null`, `undefined` and `""` when rendering, but not `0` or `NaN` — that's the trap. The fix is forcing a real boolean before the `&&`, or using a ternary, which is always safe regardless of the value's type.

```jsx
{items.length && <List />}         // ❌ renders "0" on an empty array
{items.length > 0 && <List />}     // ✅ forces a boolean
{items.length ? <List /> : null}   // ✅ ternary is always safe
```

### What are keys and why does React need them for lists?
A key is a stable identity you attach to each element in a list, so reconciliation can tell "this is the same logical item, just possibly moved" apart from "this is a genuinely different item" across renders.

Without keys, React matches list children purely by position — inserting an item at the front makes every subsequent item look "changed" at its position, so React patches all of them instead of inserting one node, and worse, may reuse a DOM node (with its internal state — a checked box, typed text, focus) for what is now a logically different item.

```jsx
{users.map(user => <li key={user.id}>{user.name}</li>)}
```

### Why is using the array index as a key a problem, and when is it acceptable?
An index describes *position*, not identity, so it "changes meaning" the moment the list is reordered, filtered, or has items inserted or removed — React believes the key is unchanged and reuses the DOM node for what is now a different item, silently moving that node's state (a checkbox's checked value, a typed input, focus) onto the wrong row.

It's acceptable only when all three hold at once: the list is genuinely static (never reordered/filtered/inserted/deleted), items carry no per-item state, and there is truly no stable id available — a narrow combination in practice, so a real id, slug, or a `crypto.randomUUID()` generated once at creation time is the safer default.

### How does React protect against XSS in JSX?
React escapes any string embedded via `{ }` before inserting it into the DOM, so injected markup like `<img src=x onerror=...>` renders as inert literal text rather than executing — this happens automatically and you can't opt in accidentally.

The one deliberate escape hatch is `dangerouslySetInnerHTML={{ __html: … }}`, whose verbose name and unusual `__html` key are intentional friction, meant to make you stop and sanitize (e.g. with DOMPurify) before using it on anything a user could have influenced.

---

<a name="s3"></a>
# 3. Components

### What is a React component?
A component is a function that takes props and returns a description of UI — not a class instance, not a DOM node, just an ordinary function React calls with one argument (the props object) whenever it needs to know what to render.

`<Welcome name="V" age={25} />` is really `Welcome({ name: "V", age: 25 })` — JSX attributes are just collected into one object, and destructuring the parameter (`{ name }`) is purely a readability convention, not a special mechanism.

### Function components vs class components — which do you use and why?
Function components are plain functions returning JSX; class components extend `React.Component` and implement `render()` plus lifecycle methods. Since hooks shipped in React 16.8, functions can do everything classes can, with less boilerplate, no `this` confusion, and — the decisive advantage — logic that's reusable across components via custom hooks.

Classes still work and appear throughout legacy code, but new code should be functional; the one thing that still requires a class is error boundaries (`getDerivedStateFromError`/`componentDidCatch` have no hook equivalent).

### Is a component re-created on every render, and if so, how does its state survive?
The *function is called again* on every render — every local variable and inner function inside its body is recreated from scratch — but the component's identity and its state persist, because React stores state on the fiber (its slot in the internal tree), not inside the function call itself.

That's the entire reason `useState` needs to exist rather than a plain `let`: a plain variable would reset to its initial value on every call, while `useState` hands back the value React has been holding onto for this specific component instance since the last render.

### Why must components be pure during render, and what does "pure" mean here?
Pure means: same props and state in, same JSX out, with no observable side effects along the way — no mutating an outside variable, no writing to the DOM, no firing a network request from inside the function body.

React reserves the right to call your component more than once for a single update, discard a render's result entirely, or interrupt it partway through (concurrent rendering) — and in development, Strict Mode deliberately double-invokes components to smoke out impurity. A side effect in render fires an unpredictable number of times; effects and event handlers exist precisely so side effects have a place that isn't render.

```jsx
// ❌ impure — mutates something outside the function during render
let total = 0;
function Price({ amount }) { total += amount; return <span>₹{amount}</span>; }
```

### What actually causes a component to re-render?
Exactly three things: its own state changed (a setter or `dispatch` call), its parent re-rendered (children re-render by default, unrelated to whether their own props changed), or a context value it consumes changed.

Props changing isn't a separate fourth cause — props only change *because* the parent re-rendered and passed new values, so it collapses into the second cause. Nothing else triggers a render: mutating a ref, mutating a plain variable, or mutating state/props in place are all invisible to React.

### Can a parent re-render without a child re-rendering?
Yes, two independent techniques. Wrap the child in `React.memo` so React shallow-compares its new props against the old and skips the re-render when they're equal. Or pass the child through as `children` from a *grandparent* that isn't re-rendering — because the child's element object is then created up there and handed down unchanged, its reference stays identical and the middle component re-rendering doesn't recreate it.

```jsx
// the grandparent creates ExpensiveChild's element; Parent just renders {children}
<Parent><ExpensiveChild /></Parent>
```

### Container/presentational (smart/dumb) components — what's the idea, and is it still current?
The idea: a component should either manage data (fetch, hold state, know about the store — "smart"/"container") or purely display it via props ("dumb"/"presentational"), not both — which makes the presentational half reusable, trivially testable with `render(<X props={...}/>)`, and safe for a designer or junior to touch without touching data logic.

The pattern predates hooks and existed largely as a workaround: before hooks, the *only* way to give a component state was to make it a class, so people wrapped dumb display components in stateful container classes just to feed them data. Dan Abramov, who popularized the pattern, later walked it back — a custom hook now gives the same separation (logic in the hook, markup in the component) without an extra wrapper layer in the tree.

```jsx
function useUsers() { /* fetch + state lives here */ return { users, loading }; }
function UserList() { const { users, loading } = useUsers(); /* pure display */ }
```

### Composition vs inheritance in React — what's React's official stance, and why?
React's position is: use composition, essentially never use inheritance — and the practical reason is blunt: **you can't extend a function component**, so inheritance doesn't even apply to most React code written today, and even for classes it produces a rigid, fragile hierarchy where changing a base class can silently break every subclass.

Composition covers everything inheritance was trying to solve: `children` for containment when you don't know what goes inside ("has-a" rather than "is-a"), JSX passed as regular props for named slots, rendering a general component with preset props for specialization (`DangerButton` renders `<Button variant="danger" {...props}/>` rather than extending `Button`), and HOCs for wrapping. For sharing non-UI *logic* specifically, the answer is a custom hook, not a class hierarchy at all.

```jsx
function Modal({ children, onClose }) {          // containment
  return <div className="overlay" onClick={onClose}><div className="modal">{children}</div></div>;
}
function DangerButton(props) { return <Button variant="danger" {...props} />; }   // specialization
```

---

<a name="s4"></a>
# 4. Rendering & Reconciliation

### What does "rendering" actually mean in React, and does it touch the DOM?
Rendering means React calling your component function to obtain a description of the UI — it produces React Elements (plain objects), and critically, **it does not touch the real DOM at all**. Actually applying anything to the browser is a separate later step called the commit.

Conflating "render" with "the screen changed" is the single most common source of confusion in React performance discussions — a component can render fifty times in a row and cause zero DOM writes, because each render produced an identical element tree and the diff found nothing to update.

### What triggers a render?
The initial mount (`root.render()` runs for the first time), a state update in that component (`setState`/`dispatch`), or a parent re-rendering — which by default re-renders every child regardless of whether that child's own props changed, because React doesn't check first; it just calls it, on the bet that calling is usually cheaper than comparing.

### What is reconciliation, and what does diffing mean inside it?
Reconciliation is the algorithm that compares the new element tree against the previous one to decide what actually changed and needs a real DOM update; diffing is the specific comparison step — walking matched pairs of nodes and comparing their props to find exactly which ones differ.

The output of the whole process is a small list of concrete DOM operations — not a rebuild of the page, just the minimal patch.

### What is the Virtual DOM?
A lightweight in-memory tree of plain JavaScript objects (React Elements) describing what the UI should look like — not DOM nodes, not anything the browser knows about. React keeps the previous tree, builds a new one on every update, and diffs the two to compute the minimal real DOM change. It's a staging area in front of the DOM, not a faster replacement for it.

### Why does React use a Virtual DOM?
Because real DOM operations are expensive — they can trigger style recalculation, layout and paint — while comparing plain JS objects is cheap. That lets you write the simple mental model "just re-describe the whole UI on every change" while React quietly reduces that description to a handful of surgical real-DOM edits, rather than you hand-tracking exactly which nodes need to change for every possible state transition.

### Is the Virtual DOM always faster than direct DOM manipulation?
No — a hand-optimized, correctly-targeted imperative DOM update (`node.textContent = "1"`) will always beat React, because React additionally builds an element tree, diffs it against the previous one, and only then performs the same underlying write. The diffing step is pure extra work compared to already knowing exactly what changed.

What the Virtual DOM actually buys you is *consistently* near-optimal updates without writing that imperative logic by hand for every interaction in every component — and because React computes the whole change set before touching the DOM, it can batch writes and avoid interleaved-write-then-read layout thrashing that a naive imperative implementation tends to fall into.

### How does React compare two trees (the diffing heuristics)?
React uses two rules that trade optimality for linear-time speed rather than solving general tree diffing, which is provably O(n³) and unusable for a UI updating sixty times a second.

**Different element type at the same position** → React doesn't search for salvageable pieces inside; it destroys the entire old subtree and builds fresh (all internal state is lost). **Same type** → React keeps the existing DOM node, patches only the props that differ, and recurses into children. For **lists of children**, matching is done by `key`, not by position — turning what would otherwise be an expensive search into a cheap identity lookup.

```jsx
// wrapper type changes → Form's state is wiped even though Form itself didn't change
{loading ? <div><Form/></div> : <section><Form/></section>}
```

### What happens if you change an element's `key`?
React treats it as an entirely different element — even if the type and everything else is identical, it unmounts the old component instance (destroying its state) and mounts a brand-new one in its place.

That's a bug when it happens by accident — `key={Math.random()}` regenerates a new key every render, so every item is destroyed and recreated on every update — but it's also a deliberate, useful technique: `key={userId}` forces a component to fully reset (all its internal `useState` cleared) whenever `userId` changes, which is often cleaner than an effect that manually resets six pieces of state.

### Why is reconciliation O(n) instead of the theoretically-optimal O(n³)?
Because a general algorithm for the minimum edit distance between two arbitrary trees is O(n³) — for a page with a thousand nodes that's roughly a billion operations per update, not something you can do sixty times a second. React deliberately declines to solve the general problem.

It gets to O(n) via two assumptions that are almost always true of real UIs: different element types produce genuinely different subtrees (so don't search for similarities, just rebuild — turning a search into a decision), and the developer supplies identity for list children via `key` (turning matching into a hash lookup instead of a search). Both assumptions occasionally give non-minimal results — moving a subtree across parents is destroy-and-recreate rather than a recognized "move," since React never compares nodes across different levels of the tree — but the tradeoff of near-optimal-at-linear-cost over optimal-at-cubic-cost is clearly worth it for real interfaces.

### Does React update the whole DOM on every render?
No — it re-runs component functions and rebuilds the description on every render, but the diff step means only the DOM nodes whose *output* actually changed are touched; everything else, including large untouched subtrees, is skipped entirely and keeps its identity, focus, scroll position and any in-progress CSS transitions.

---

<a name="s5"></a>
# 5. State

### What is state, and why doesn't a plain variable work for it?
State is data a component owns that persists across re-renders and, when changed through its setter, causes a re-render. A plain `let count = 0` inside a component fails for two independent reasons at once: changing it tells React nothing (nothing schedules a re-render), and even if something did trigger a re-render, the function body runs top-to-bottom again on every call, so a locally-declared variable resets to its initial value every time.

`useState` fixes both: React stores the value outside your function, attached to this specific component instance in the tree, so it survives the function being called again — and the setter both updates that stored value and tells React to re-render.

```jsx
const [count, setCount] = useState(0);   // value survives; setter both updates AND notifies React
```

### Why can't state be modified directly — why does `setState`/the setter exist?
Two independent reasons. React wouldn't be notified — nothing schedules a re-render from a plain assignment, so the UI silently falls out of sync with the data. And React decides whether anything changed by comparing **references** (`Object.is`), not by deep-inspecting contents — mutating an object or array in place keeps the same reference, so React (and anything downstream comparing by reference, like `React.memo`) concludes nothing changed at all.

```jsx
this.employee.name = 'Ravi';                        // ❌ same reference — invisible to React
setUser({ ...user, name: 'Ravi' });                  // ✅ new reference — detected
```

### Why is state treated as a snapshot rather than a live variable?
Because the state variable you read in a given render is a `const` captured in *that render's* function call — it cannot change mid-render, no matter what happens afterward. The setter doesn't reassign that variable; it schedules React to run the component function again, and only the *next* call to `useState` returns the new value.

This one fact explains a whole family of behaviors that otherwise look like bugs: logging `count` immediately after calling its setter shows the old value, because the setter only scheduled an update — it didn't rewrite the variable in the current closure.

```jsx
setCount(count + 1);
console.log(count);   // still the OLD value — this render's snapshot never changes
```

### Why does calling `setCount(count + 1)` three times in one handler only increment by one, and how do you fix it?
All three calls read `count` from the *same* frozen snapshot of the current render, so all three compute and schedule the identical "set to old-value-plus-one" — the last one scheduled simply overwrites the earlier ones' effect rather than compounding with them.

The fix is the functional updater form, which receives whatever the *latest* queued value actually is rather than reading the stale closed-over variable — so each call composes with the one before it instead of all reading the same starting point.

```jsx
setCount(count + 1); setCount(count + 1); setCount(count + 1);   // ❌ net +1
setCount(c => c + 1); setCount(c => c + 1); setCount(c => c + 1); // ✅ net +3
```

### Why are state updates batched, and what changed in React 18?
Batching groups every state update that happens within one tick into a single re-render, rather than rendering once per `setState` call — without it, three setters in one click handler would cause three renders, and the user could briefly glimpse an inconsistent intermediate UI between them.

Before React 18, batching only applied *inside React's own event handlers* — a `setState` inside a `setTimeout`, a raw promise `.then()`, or a native (non-React-attached) event listener each caused its own separate render. React 18's `createRoot` made batching **automatic everywhere**, closing that inconsistency without any opt-in required. `flushSync` remains as a deliberate escape hatch for the rare case where the next line of code needs the DOM already updated.

### What is derived state, and why should you avoid storing it separately?
Derived state is any value fully computable from existing props or state — a total, a filtered list, a validity flag — and the rule is: compute it during render, don't store a separate copy of it in `useState`.

Storing it separately (and syncing it with a `useEffect`) creates two sources of truth that can disagree, forces an extra render on every change (the stale value shows briefly before the effect corrects it), and requires every code path that touches the underlying data to remember to keep the derived copy in sync — miss one and you get a silently wrong number. If the computation is genuinely expensive, wrap the *computation* in `useMemo` — that's still derived, just cached, not a second source of truth.

```jsx
// 🚩 an effect whose only job is setState from other state = derived state in disguise
useEffect(() => setTotal(items.reduce((s, i) => s + i.price, 0)), [items]);
const total = items.reduce((s, i) => s + i.price, 0);   // ✅ just compute it
```

### What is lifting state up, and when should you avoid over-lifting it?
Lifting state up means moving `useState` to the nearest common ancestor of the components that need to share it, then passing the value and a setter/callback down as props — the children become controlled, receiving their value from above rather than owning it, which is the only mechanism for sibling-to-sibling communication since siblings can't see each other's state directly.

The rule for *where* to lift it is the lowest point in the tree where every component that needs it is still a descendant — lifting higher than necessary means more prop-passing and a wider re-render blast radius, since the owner and its entire subtree re-render on every change. State lifted all the way to `App` "just in case" re-renders the whole application on every keystroke.

### When should you use `useRef` instead of `useState`?
When the value's change doesn't need to be reflected on screen — a timer id, a previous value, an instance-style flag, a DOM node handle. `useRef` gives you persistence across renders (unlike a plain variable) without triggering a re-render when mutated (unlike state) — you mutate `.current` in place rather than replacing it through a setter.

The decision rule: if the UI must display the value, it's state; if it's bookkeeping the UI never shows, it's a ref.

```jsx
const renderCount = useRef(0);
renderCount.current++;   // tracked across renders, but changing it renders nothing
```

---

<a name="s6"></a>
# 6. Hooks

### What is a Hook?
A special function, provided by React, that lets a function component "hook into" React features — state, lifecycle-equivalent effects, context, refs — that previously existed only on class components. It's identified by its `use` prefix (a real convention, not decoration: it's what the linter uses to enforce the Rules of Hooks), and it's callable only from a React function component or another custom hook.

### Why were Hooks introduced, and what problems did they solve?
Three specific problems with classes, not merely a boilerplate reduction. Sharing stateful logic between components required HOCs or render props, both of which worked by adding wrapper components to the tree — enough of them produced "wrapper hell," a pyramid of components in DevTools where the one doing real work is buried several layers deep. Related logic was scattered across lifecycle methods (a subscription's setup in `componentDidMount`, its teardown in `componentWillUnmount`, its update-handling in `componentDidUpdate`), while unrelated concerns that merely happened to run at the same moment were jammed together in one method. And `this` binding was a constant, confusing source of bugs — forgetting to bind a handler produced a runtime error far from its actual cause.

Custom hooks fixed the reuse problem specifically by extracting logic **without adding anything to the component tree at all** — the biggest structural change, since containers and most HOCs largely disappeared from the ecosystem once hooks shipped.

### How does React remember hook state across renders, at a high level?
Each component instance has its own ordered list of hook objects, attached to its fiber (its slot in React's internal tree) rather than living inside the function body that runs on every render. On the first render React appends one hook object per hook call; on every later render it walks that same list in the same order, handing back each stored value — which is what lets state survive the component function being called again and again, since the list itself lives outside the function call.

### What are the Rules of Hooks, and why do they exist?
Two rules: only call hooks at the top level (never inside a conditional, loop, nested function, or after an early `return`), and only call them from React function components or from other custom hooks.

The reason is mechanical: React does **not** identify hooks by name — it stores each hook's data in a per-component ordered list, indexed purely by the sequence in which the hook calls happen. On every render, React walks that list in order and hands out slot 0, then slot 1, then slot 2, matching purely by position. If a hook call becomes conditional, the *number* of hooks called can differ between renders, so from that point on every subsequent hook reads or writes the wrong slot — state silently lands in the wrong variable, and a cleanup can run against the wrong setup. `eslint-plugin-react-hooks` enforces both rules mechanically because a violation produces no error, just quietly wrong behavior.

```jsx
if (showName) { const [name] = useState(""); }   // ❌ slot 0 only sometimes
const [age] = useState(0);                        // ❌ lands in slot 0 or slot 1 depending on the branch
```

### What happens internally when `useState()` runs?
On the first render, React creates a hook object holding the initial value and a dispatch function, appends it to that component's hook list, and returns `[value, dispatch]`. On every subsequent render, React reads the *next* hook object in that same list (positionally, per the Rules of Hooks above), applies any queued updates to it, and returns the current value paired with the same dispatch function — which is why the setter's identity is stable across renders even though the component function runs again each time.

### Why does `useRef()` not trigger a re-render when its value changes?
Because a ref is just a plain mutable object (`{ current: ... }`) that React hands back **unchanged** on every render — there's no setter, no subscription, nothing watching `.current`. Mutating it is invisible to React by design, which is exactly the point: it's for values React doesn't need to react to.

```jsx
const ref = useRef(0);
ref.current++;   // changes silently — no re-render, no notification to React
```

### When should `useMemo()` be used?
Two genuinely distinct cases, and conflating them is why people misapply it. First, a computation that's measurably expensive — verify with the Profiler, since most work (small filters, string concatenation, basic math) is effectively free on modern engines and not worth memoizing. Second — and more common in practice — keeping an object or array's **reference** stable across renders, so a `React.memo`'d child's shallow comparison can actually succeed, or so an effect's dependency array stops firing on every render.

It's a hint, not a guarantee: React may discard a cached value (e.g. to reclaim memory), so code must remain correct if the computation runs again — memoization can only affect performance, never behavior.

```jsx
const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);  // stable ref for a Context provider
```

### When should `useCallback()` be used?
When a function is passed to a `React.memo`-wrapped child, or listed in a dependency array, and its **reference identity** needs to stay stable across renders — without it, an inline arrow function is a brand-new object every render, which defeats a memoized child's props comparison and re-fires any effect that depends on it. `useCallback(fn, deps)` is literally `useMemo(() => fn, deps)` — the same underlying mechanism, specialized for functions.

Critically, `useCallback` alone does nothing: it only pays off when something downstream actually *compares* the reference (a memoized child, an effect dependency, a custom-hook dependency). Wrapping a handler passed to a plain, non-memoized `<button>` accomplishes nothing but adds overhead.

```jsx
const handleSave = useCallback(() => save(id), [id]);   // useless unless MemoChild is React.memo'd
```

### Why does `useReducer()` exist, and when would you reach for it over `useState`?
`useReducer` centralizes related state transitions into one pure function — `(state, action) => newState` — rather than expressing each transition inline wherever it happens. It's the right tool when several fields change together, when update logic is complex or duplicated across handlers, or when the next state depends non-trivially on the previous one.

The conceptual shift is what matters: components stop describing *how* to update state and start describing *what happened* (`dispatch({ type: "SUBMIT" })`), while the reducer owns the consequences — which makes "impossible states" (loading true alongside an error already set) unreachable by construction, since every transition produces one complete, consistent state object. `dispatch`'s identity is also permanently stable, unlike a handler recreated on every render, so it's safe in dependency arrays without `useCallback`.

```jsx
function reducer(state, action) {
  switch (action.type) {
    case "SUBMIT":  return { status: "loading", data: null, error: null };
    case "SUCCESS": return { status: "success", data: action.payload, error: null };
    default: return state;
  }
}
```

### `useMemo` vs `useCallback` vs `React.memo` — what does each actually memoize?
`useMemo` caches the **result** of calling a function — a value. `useCallback` caches the **function itself** — its reference, not its result; it's `useMemo(() => fn, deps)` in disguise. `React.memo` wraps a whole **component** and skips its re-render entirely when its new props are shallow-equal to the old ones.

They operate at three different scopes — a computed value, a function reference, a component's render — but all three exist for the same underlying reason: React compares by reference (`Object.is`), and a component function body recreates every literal, object, array and inline arrow fresh on every render, so without memoization those references silently change even when the underlying data hasn't.

---

<a name="s7"></a>
# 7. useEffect

### What is `useEffect()`, and why is the thing it runs called a "side effect"?
`useEffect` is the escape hatch for synchronizing a component with something *outside* React's own rendering — a subscription, a timer, a network request, direct DOM measurement, `document.title`. It's called a side effect because it's a consequence beyond the function's return value: rendering is supposed to be pure (same input, same output, nothing else happens), so anything with an observable consequence outside that — firing a request, starting a timer, writing to the DOM — doesn't belong in the render body and belongs in an effect instead.

### When does `useEffect()` execute, and why does it run after rendering rather than during it?
It runs asynchronously, after React has committed the DOM changes **and the browser has painted** — not synchronously during render, and not even synchronously right after the DOM update. That ordering exists specifically so an effect can never block the visual update: the user sees the new screen first, and the effect (which may do slow work like a network call) runs afterward. Running effects during render would also violate render's purity requirement, since render must be side-effect-free and possibly repeatable.

```
render → DOM update → 🎨 browser paints → useEffect runs
```

### What is the dependency array, and what do its three forms mean?
The list of every reactive value (props, state, or anything derived from them) the effect reads. React compares each element against its value from the previous render using `Object.is`; if any differ, it runs the previous effect's cleanup and then re-runs the effect.

`useEffect(fn)` with **no array** runs after every single render. `useEffect(fn, [])` with an **empty array** runs once, after mount only, because with nothing to compare, nothing can ever be "different." `useEffect(fn, [a, b])` runs after mount and again whenever `a` or `b` changes.

### When does cleanup run, and why is thinking of it as "unmount code" wrong?
The cleanup function returned from an effect runs **before every re-run of that effect** — not only on unmount. The correct framing is: cleanup is the reverse of setup, not a special unmount-only hook. If an effect subscribes to a chat room keyed by `roomId`, changing `roomId` unsubscribes from the old room (cleanup) before subscribing to the new one (the re-run's setup) — automatically, with no separate method to remember.

```
mount        → setup
deps change  → cleanup(old) → setup(new)
unmount      → cleanup
```

A class component needed three separate, coordinated lifecycle methods to express the same thing correctly, and it was extremely common to forget the middle case (`componentDidUpdate`) and leak the old subscription.

### Why shouldn't cleanup functions be optional — what happens if you skip them?
Anything an effect starts running independently of the component's lifetime — a subscription, a timer, an event listener — must be explicitly stopped, or it keeps firing after the component is gone. Because it typically closes over the component's scope, the component can never be garbage collected while that callback is still registered somewhere — navigate to and from the page fifty times and you accumulate fifty zombie listeners, all still running.

The visible symptom is usually the console warning about calling `setState` on an unmounted component — a listener or timer fired and tried to update a component that no longer exists.

### What are the common causes of an infinite loop in `useEffect`, and how do you fix each?
Four recurring causes. No dependency array at all combined with a `setState` inside the effect — it re-renders, which re-runs the effect (no array = every render), which calls `setState` again, forever. An object/array/function literal recreated inline in the dependency array — it's a new reference every render, so the comparison never succeeds and the effect never "settles." Setting the very piece of state the effect also depends on. And a parent that re-renders *because of* the child's effect, creating a loop across components.

Fixes: add a correct dependency array, keep dependencies as primitives (destructure `obj.id` rather than depending on `obj`), wrap non-primitive dependencies in `useMemo`/`useCallback`, or use a functional state update so you can legitimately drop that value from the dependency array altogether.

```jsx
useEffect(() => { setCount(count + 1); }, [count]);   // ❌ infinite: sets the thing it depends on
```

### What is a stale closure, and how does it happen inside `useEffect`?
A stale closure is a function that captured props or state from an earlier render and keeps using those frozen values forever, because the closure that reads them was never recreated. The classic case: an effect with an empty dependency array starts a `setInterval` whose callback reads `count` — that callback was created once, during the first render, with `count` frozen at its initial value, and since the effect (correctly, per its lying dependency array) never re-runs, that stale callback keeps reading `0` on every tick.

The dependency array is a *claim* — "this effect uses nothing outside these values" — and a stale closure means the claim was false. Fixes: use a functional update (`setCount(c => c + 1)`, which never reads the captured value at all), tell the truth in the array (add `count`, accepting the interval gets rebuilt on every change), or keep the latest value in a ref that the interval reads instead.

```jsx
useEffect(() => {
  const id = setInterval(() => setCount(c => c + 1), 1000);  // ✅ never reads a captured value
  return () => clearInterval(id);
}, []);
```

### What's the race condition in `useEffect`-based data fetching, and how do you fix it?
Responses do not necessarily arrive in the order their requests were sent. If a user types "a" (slow request fires) then quickly "ab" (fast request fires), the fast response for "ab" can land first — correctly updating the results — only for the slow, now-stale response for "a" to land afterward and silently overwrite it, leaving the screen showing results for a query the user has already moved past. Nothing throws, and it often only reproduces on a slow connection, which is exactly why it ships unnoticed.

The fix belongs in the effect's **cleanup**, because cleanup is precisely "undo whatever the previous effect started," and an in-flight request is part of what it started: either a `cancelled` boolean checked before calling the setter, or better, an `AbortController` whose `signal` is passed to `fetch` and whose `abort()` is called in cleanup — which actually cancels the network request rather than merely ignoring its eventual response.

```jsx
useEffect(() => {
  const controller = new AbortController();
  fetch(`/api/search?q=${query}`, { signal: controller.signal }).then(r => r.json()).then(setResults);
  return () => controller.abort();
}, [query]);
```

### Why shouldn't derived data be computed inside `useEffect`?
Because it creates a second source of truth and an extra render for no benefit. Computing `fullName` in an effect and storing it in its own state means the screen briefly shows the stale value before the effect corrects it (an unnecessary extra render), and the two values — the derived one and the source it came from — can drift apart if any code path forgets to keep them in sync. If it's genuinely derivable, it's just a variable computed during render — which can never be wrong, since there's nothing separate to keep synchronized — and `useMemo` only if that computation is measurably expensive.

### `useEffect` vs `useLayoutEffect` — what's the actual difference, and when do you need the layout version?
`useEffect` runs asynchronously, after the browser has painted. `useLayoutEffect` has the identical API but runs synchronously, after the DOM has been mutated but **before** the browser paints — which means it blocks painting while it runs.

Use `useLayoutEffect` only when you must measure the DOM and then synchronously adjust it before the user sees anything — positioning a tooltip so it doesn't overflow the viewport is the canonical case. Doing that measure-then-adjust work in a regular `useEffect` means the user briefly sees the pre-adjustment position flash before it corrects, because paint already happened first. Reaching for `useLayoutEffect` by default is a needless performance cost, since it holds up every paint.

```
useEffect:        render → DOM update → 🎨 PAINT → effect     (possible flash)
useLayoutEffect:  render → DOM update → effect → 🎨 PAINT     (no flash, blocks paint)
```

---

<a name="s8"></a>
# 8. React Fiber

### What is Fiber, and what specific problem was it introduced to solve?
Fiber is React's reconciliation engine, introduced in React 16, in which the component tree is represented as a linked list of "fiber" nodes that React can process incrementally — pausing, resuming, prioritizing, or discarding work — instead of walking the tree with ordinary recursion.

The problem it solved is more fundamental than "recursion is slow": recursion's traversal position lives on the JavaScript call stack, which you don't control, so there's no way to pause it partway through and hand control back to the browser. Once a render started under the old ("stack") reconciler, it ran to completion, occupying the main thread for its full duration — a render of 5,000 components could block input handling and painting for hundreds of milliseconds, with no way to say a keystroke mattered more than a background list update, because priority as a concept didn't exist.

### How is a fiber node structured, and why do the three pointers matter?
A fiber is a plain object holding everything React needs to manage one unit of work over time: component type, props (pending and memoized), state (`memoizedState`, where the hooks linked list actually lives), a pointer to the corresponding real DOM node (`stateNode`), effect flags, a priority `lanes` value, and three tree pointers — `child` (first child, down), `sibling` (next child at the same level, across), `return` (parent, up).

Those three pointers encode the same tree a call stack used to represent implicitly, but as data React owns — which is what turns traversal into an ordinary loop instead of recursion, and makes "where am I in this traversal" a variable React can save and resume, rather than something baked irretrievably into pending stack frames.

```
     Counter
        │ child
        ▼
       h1 ──sibling──► button
        │ return           │ return
        └──────┬───────────┘
               ▼
            Counter
```

### What is double buffering, and why does it make abandoning a render free?
React maintains **two** complete fiber trees at all times: `current` (what's actually on screen) and `work-in-progress` (what React is currently building), linked node-to-node by an `alternate` pointer so fibers can be reused between renders instead of reallocated from scratch.

React builds entirely into the work-in-progress tree without touching anything the user can see; committing is then a **single pointer swap** — `root.current` now points at the new tree, and the old one becomes scratch space for next time. The consequence: half-finished work only ever exists in a tree nobody is displaying, so discarding it — because a higher-priority update arrived mid-render — costs nothing and leaves no visible trace. It's the same technique as double buffering in graphics, for the same reason: never show a half-drawn frame.

### Did Fiber make React faster?
No — a render performs essentially the same total amount of work and takes roughly the same total time as it would under the old reconciler; the extra bookkeeping (building fiber objects, tracking pointers) arguably adds a small amount of overhead rather than removing any.

What actually changed is that the work became **divisible and abandonable** — an architectural property, not a raw-speed one — and that property is what everything since depends on: priority lanes, interruptible rendering, transitions, Suspense, streaming SSR. The user-facing improvement is *responsiveness*: the same 300ms of total work now happens across dozens of five-millisecond slices with the browser free to handle input and paint in between, so the interface stays alive throughout instead of freezing and then catching up all at once.

### What is scheduling, and how do lanes decide priority?
Scheduling is React's decision about *when* and *in what order* to perform rendering work, since a browser tab has exactly one main thread shared by JavaScript, layout, paint and input handling. React works in roughly 5ms time slices — comfortably inside a 16ms frame budget — and checks after each slice whether something more urgent is waiting, yielding to the browser if so.

A **lane** is React's internal priority label for an update. The ordering is perceptual, not technical: discrete user input (click, keypress) is most urgent because humans notice input lag hardest, then continuous input (scroll, drag), then a default `setState`, then a `startTransition` update, then idle/offscreen work whenever there's spare time. Higher-priority work interrupts lower — and because of double buffering, the interrupted work-in-progress tree is simply discarded and the render **restarted** (not resumed) from the newer, more current inputs, rather than committing a result computed against stale data.

### What is the render phase, and why must it be pure?
The render phase is everything up through diffing: calling your component functions, building the new element tree, building the work-in-progress fiber tree, reconciling it against the current tree, and flagging what differs — and critically, **no DOM is touched during any of it**. In concurrent React, this phase is interruptible: it may be paused, restarted, or thrown away entirely for a single logical update.

Because it can run more than once and its result can be discarded, the render phase must be pure — no fetching, no subscriptions, no DOM writes, no `setState` calls that aren't wrapped correctly. That single constraint is the reason side effects belong in `useEffect` (which runs in the safe, later commit-adjacent window) rather than directly in a component body, and it's why the deprecated `will`-prefixed class lifecycle methods (which ran in this phase and could execute several times per logical update) were replaced.

### What is the commit phase, and how is it different from the render phase?
The commit phase applies the render phase's computed changes to the real DOM, attaches refs, and runs layout effects — and unlike the render phase, it is **synchronous and cannot be interrupted**, because a half-applied DOM update would leave the user looking at a visibly broken, inconsistent UI.

It breaks into three ordered sub-phases: *before mutation* (the DOM is still old — `getSnapshotBeforeUpdate` reads it here, e.g. to capture scroll position before it changes), *mutation* (React actually writes to the DOM, runs layout-effect cleanups and `componentWillUnmount`, and swaps the `current` pointer to the new tree), and *layout* (the DOM is new but not yet painted — refs attach, `componentDidMount`/`componentDidUpdate` and `useLayoutEffect` run here). Only after all three does the browser paint, and passive effects (`useEffect`) run asynchronously after that.

### Why is reconciliation described as O(n) rather than the true O(n³) for general tree diffing?
Computing the true minimum edit distance between two arbitrary trees is O(n³) — for a page with a thousand nodes, roughly a billion comparisons per update, which is simply unusable at interactive speed. React sidesteps the general problem entirely rather than solving it faster.

It gets to a single O(n) pass via two deliberate assumptions: elements of different types are assumed to produce entirely different subtrees (so the algorithm destroys and rebuilds instead of searching for salvageable pieces inside), and identity for list children is supplied explicitly by the developer via `key` (turning what would be an expensive search into a cheap lookup). Both assumptions are almost always correct for real UIs, and where they're wrong — moving a subtree to a different parent, say — the result is non-minimal (destroy-and-recreate instead of a recognized move), a tradeoff React accepts because near-optimal-at-linear-cost beats optimal-at-cubic-cost for anything rendering interactively.

### What does concurrent rendering actually mean, and is it multithreading?
No — there's no parallelism and everything still runs on one thread; "concurrent" here means React can *interleave* several renders in flight, similar to how an operating system switches between processes on a single CPU core, never running two at the literal same instant but switching fast enough that the interface stays responsive throughout.

It's built directly on Fiber's interruptibility: an update marked with `startTransition` or `useDeferredValue` can be paused mid-render so an urgent update (a keystroke) commits first, and the interrupted work is discarded and restarted from fresh inputs afterward, rather than completing and committing a result computed against now-stale state. Concurrent features are opt-in per-update, not automatic just from using `createRoot` — you need to actually mark something as a transition or deferred value for it to behave this way.

---

<a name="s9"></a>
# 9. Props

### What are props, and why are they read-only?
Props are the inputs to a component — data passed down from its parent, collected by React into a single object and handed to the component function as its argument. They're read-only by *contract*, not by any language-level enforcement: a component must never reassign or mutate what it receives, because the parent owns that data and React's whole model assumes a component is a (mostly) pure function of its props and state.

If a child could freely change its props, the same piece of data would effectively have two owners, and nothing about the system could tell you which one to trust. Since JavaScript doesn't freeze props objects, "read-only" is a discipline you enforce yourself, not a guardrail that stops you — mutating `props.user.name` appears to work and then breaks confusingly somewhere else.

### Why shouldn't a child component mutate a prop it received, even indirectly?
The parent doesn't know it happened and has no reason to re-render, so its own state ends up silently disagreeing with what's now on screen — the exact bug class React exists to prevent. It's especially dangerous with objects and arrays, since a prop like `items` is a *reference* to the parent's actual data structure — `items.push(x)` inside the child mutates the parent's array directly, from below, invisibly.

And because React compares by reference to decide whether to re-render, mutating an object in place often doesn't even reliably trigger the parent's own re-render, so the visible symptom is "the data changed but nothing on screen reflects it." The correct pattern is deriving a new value locally if a transformed version is needed, or calling a callback prop so the *owner* decides how to update its own state.

```jsx
// ❌ child mutates the parent's array through a reference
function Cart({ items }) { items.push(newItem); return <List items={items} />; }
// ✅ child asks; parent owns the update
function Cart({ items, onAdd }) { return <button onClick={() => onAdd(newItem)}>Add</button>; }
```

### How does a child communicate back to its parent, given that data only flows down?
The parent passes a callback function down as a prop; the child calls it to announce that something happened, and the parent decides what that means and updates its own state accordingly — the new value then flows back down as a fresh prop on the next render. The child never learns or cares what the callback actually does; it just reports an event, which is what keeps it reusable across contexts where the parent's reaction differs.

By convention the prop is named `on` + event (`onSave`, `onDelete`) and the parent's handler is named `handle` + event (`handleSave`), though nothing enforces this beyond convention.

```jsx
function Parent() {
  const [count, setCount] = useState(0);
  return <Child count={count} onIncrement={() => setCount(c => c + 1)} />;
}
function Child({ count, onIncrement }) { return <button onClick={onIncrement}>{count}</button>; }
```

### What's the difference between passing a component as an element versus as a reference (as a prop)?
An **element**, like `<Layout header={<Navbar />} />`, is an already-built object with its props fixed by the caller at the point it was written — the receiving component can only place it, not add or change its props. A **reference**, like `<List ItemComponent={UserRow} />`, is the function itself, not yet called — the receiver does the actual rendering and supplies whatever props it wants (typically different data per item), which is exactly what a generic list or table needs.

The parameter name receiving a component reference must still be capitalized (`ItemComponent`, not `itemComponent`), or JSX compiles `<itemComponent />` as a lowercase DOM tag string instead of a reference to the value.

```jsx
function List({ items, ItemComponent }) {
  return <ul>{items.map(item => <ItemComponent key={item.id} {...item} />)}</ul>;
}
```

### What is `props.children`, and why is it described as the most important prop in React?
`children` is whatever markup sits between a component's opening and closing tags — it's an ordinary prop, not special syntax; `<Card>Hi</Card>` compiles to exactly the same thing as `<Card children="Hi" />`. It matters more than any other prop because it **inverts control**: a wrapper component (a `Modal`, a `Card`) provides behavior and layout but has zero opinions about content, so it works for literally anything you put inside it, rather than having to anticipate every possible use case through a growing list of specific props.

It isn't always an array — a single child is just one element, not an array of one — so blindly calling `children.map()` breaks; `React.Children.map(children, fn)` handles every shape safely.

```jsx
function Modal({ children, onClose }) {
  return <div className="overlay" onClick={onClose}><div className="modal">{children}</div></div>;
}
<Modal onClose={close}><h2>Delete this?</h2><Button variant="danger">Confirm</Button></Modal>
```

### How do you set default values for props, and what's the gotcha with `null`?
The modern way is a default parameter in the destructuring: `function Button({ variant = "primary" })` — plain JavaScript, no React API involved. The legacy `Component.defaultProps` object still works on class components but was **removed for function components in React 19**; new code should always use default parameters.

The gotcha: a default parameter only kicks in when the value is `undefined` — not for any other falsy value, and specifically not for `null`, which JavaScript treats as an explicit "no value" rather than a missing one. `<Box count={0} />` correctly keeps `0`, but `<Box count={null} />` renders `null`, not the default — use `??` in the body if you need to catch both.

```jsx
function Box({ count = 10 }) { return <p>{count}</p>; }
<Box count={0} />     // renders 0 — a real value, not replaced
<Box count={null} />  // renders nothing — null is NOT caught by the default
```

### What is prop drilling, and is it always a problem?
Prop drilling is passing a prop through components that don't themselves use it, purely to reach a descendant several levels down — every intermediate component's signature ends up "lying" about what it actually needs, which hurts reuse (that component now requires a prop it never touches) and makes refactors painful (adding a new shared value means editing every file in the chain).

It's genuinely fine at one or two levels — the dependency stays explicit and traceable in the component's own signature, which is arguably *better* than the hidden dependency Context introduces. The first fix to reach for beyond that is **composition** — restructure so the consuming component is created higher up, where the data already lives, and passed down as `children`, so the middle layers never see the prop at all; only if the data is genuinely global does Context become the right tool, and only if state changes very frequently does a store like Zustand/Redux beat Context specifically because those support subscribing to slices.

```jsx
// composition: Avatar is created in App, where `user` lives — Dashboard/Sidebar never see it
<Dashboard><Sidebar><Avatar user={user} /></Sidebar></Dashboard>
```

### TypeScript vs PropTypes for validating props — what's the state of play, and why?
TypeScript checks prop types at **compile time**, as you type, with full editor autocomplete and safe rename-refactors, at zero runtime cost since annotations are stripped entirely at build time. PropTypes checks at **runtime**, in development builds only, logging a console warning if a passed prop doesn't match the declared shape — it costs nothing in production (the checks are stripped), but the feedback loop is slower (you have to actually render the broken case to see the warning) and it gives none of TypeScript's autocomplete or refactor safety.

React 19 **removed `propTypes` support for function components entirely**, which reflects where the ecosystem already was — PropTypes is now purely a legacy/interview-recognition topic, and TypeScript is the standard for new code.

```tsx
type ButtonProps = { label: string; onClick: (id: number) => void; children: React.ReactNode };
```

---

<a name="s10"></a>
# 10. Context

### What is the Context API, and what's the most important framing for understanding it?
Context is a mechanism for passing a value down through the component tree without threading it through every intermediate component's props. The framing that prevents almost every misuse of it: **Context is a transport mechanism, not a state manager** — it has no store, no reducers, no middleware, no devtools, and critically, no selectors, meaning no built-in way for a consumer to subscribe to just *part* of a value. The state itself still lives in ordinary `useState`/`useReducer` somewhere; Context's only job is delivering it.

```jsx
const ThemeContext = createContext();
function App() { return <ThemeContext.Provider value={theme}><Page /></ThemeContext.Provider>; }
function Button() { const theme = useContext(ThemeContext); return <button className={theme} />; }
```

### Does Context replace Redux (or a state library generally)?
No — they solve different categories of problem. Context is transport: it delivers a value down the tree without props, and nothing more. A state library adds an actual store with a defined update pattern, middleware for side effects, devtools with time-travel debugging, and — the capability Context genuinely lacks — selector-based subscriptions, so a component reading one slice of the store doesn't re-render when an unrelated slice changes.

Context plus `useReducer` covers a meaningful chunk of what people used Redux for (centralized, testable transition logic distributed app-wide), but the two aren't in the same category, and Context specifically has no answer to frequently-changing shared state, where the lack of selectors becomes a real performance problem.

### How does `useContext` find the value it returns, and what does "positional, not global" mean?
When a component calls `useContext(SomeContext)`, React walks **up** the fiber tree from that component looking for the nearest `<SomeContext.Provider>` ancestor, and returns whatever `value` it's currently supplying — falling back to the `createContext(default)` argument only if no matching provider exists anywhere above it at all.

"Positional, not global" means a component doesn't receive "the theme" as some singleton — it receives whatever the *nearest* provider above its specific position in the tree happens to be supplying. Move the same component elsewhere in the tree and it can receive an entirely different value, because the lookup restarts from wherever it's actually rendered. Nesting the same context provider deliberately overrides the value for a subtree — a light-themed modal inside an otherwise dark-themed page, say — since the walk stops at the *first* match.

### What causes context consumers to re-render, and why can't `React.memo` stop it?
Every component that calls `useContext` for a given context re-renders whenever that provider's `value` changes (compared with `Object.is`) — **all of them, unconditionally**, not just the ones reading whatever part of the value actually differed, because there is no built-in way to subscribe to only a slice.

`React.memo` genuinely cannot help here, and this surprises people the first time they hit it: memo compares *props*, and context is delivered through an entirely separate channel that bypasses props comparison altogether. A memoized component that reads context re-renders on every context change regardless of its memo wrapper.

### Why can Context hurt performance, and what's the classic mistake that makes it worse?
Because it has no selector granularity — a context holding `{ user, theme, cart }` re-renders every consumer whenever *any* of the three changes, even a consumer that only ever reads `theme`. It's a radio broadcast model: everyone tuned in hears everything, whether or not it's meant for them.

The classic mistake that compounds this: `<Context.Provider value={{ user, setUser }}>` constructs a brand-new object literal on every render of the provider component, so even when `user` itself hasn't changed, every consumer sees a "new" value by reference and re-renders anyway — a theme toggle near the app root can cascade a full re-render through hundreds of unrelated components.

```jsx
<Context.Provider value={{ user, setUser }}>          // ❌ new object every render
<Context.Provider value={useMemo(() => ({ user, setUser }), [user])}>   // ✅ stable
```

### How do you optimize a Context that's causing performance problems?
Three complementary techniques. **Memoize the value object** with `useMemo`, so the reference stays stable when nothing meaningful changed. **Split one large context into several** by concern — `UserContext`, `ThemeContext`, `CartContext` — so a consumer only re-renders when the specific slice it reads actually changes, and specifically split by **update frequency** too, since bundling a rarely-changing value with a frequently-changing one drags the rare consumers along on every change of the frequent one. **Separate state from dispatch into two contexts** when using `useReducer` — since `dispatch`'s identity never changes, components that only dispatch (a logout button, say) and never read the value itself then never re-render from that context at all.

If you need genuine per-slice subscription rather than these workarounds, that's the specific gap a store like Zustand fills.

---

<a name="s11"></a>
# 11. Re-rendering

### What causes re-renders, and what does NOT cause them?
Causes: the component's own state changed, its parent re-rendered, or a context value it consumes changed. Does **not** cause a re-render: mutating a ref's `.current`, mutating state or a prop object in place (React never sees a new reference), reassigning a plain local variable inside the component body, or anything else React simply isn't told about via a setter or `dispatch`.

### Why does a parent re-rendering re-render all of its children by default?
Because React does **not** check whether a child's props actually changed before calling it again — it just calls every child, unconditionally, on the bet that for the overwhelming majority of components (a button, a label, a small div), actually running the function is cheaper than the cost of comparing props first to decide whether to skip it.

This matters far less than it sounds, in practice: an unnecessarily re-rendered child usually produces the exact same element tree it produced last time, so the diff finds nothing different and **zero DOM operations happen** — the entire wasted cost is one function call and one comparison, both measured in microseconds. It becomes a real problem only for components that are *themselves* genuinely expensive to render (a chart recomputing a layout, a table transforming thousands of rows), which is precisely the case `React.memo` exists for.

### What does `React.memo()` do, and how is it different from `shouldComponentUpdate`?
`React.memo` wraps a component so React shallow-compares its new props against the previous ones before re-rendering, and skips the render (and the entire subtree beneath it) when they're all equal by `Object.is` — it's the opt-in that turns "re-render because my parent did" into "re-render only if my own inputs actually changed." It's the function-component equivalent of `React.PureComponent`/`shouldComponentUpdate` from class components, with one detail worth knowing precisely: a custom comparator's return value is *inverted* relative to `shouldComponentUpdate` — returning `true` from a `React.memo` comparator means "these props are equal, skip the render," the opposite of what `true` meant in the class-era method.

```jsx
const Header = React.memo(function Header({ title }) { return <h1>{title}</h1>; });
```

### Why might `React.memo` fail to prevent a re-render even though it's applied?
Because its comparison is shallow and by reference, and a component function recreates every object literal, array literal, and inline arrow function fresh on every single render — even with identical *contents*, `{a:1} === {a:1}` is `false`, so if any prop is written inline in JSX, the comparison fails every time and the memoized component re-renders regardless, adding a wasted comparison cost on top for nothing.

A specific and near-universal trap: memoizing a component that takes `children` — the nested JSX creates a brand-new element object on every render of the parent, so the comparison can essentially never succeed, which makes memoizing wrapper components pointless almost by definition. The fix is stabilizing whatever's being passed with `useMemo` (objects/arrays) or `useCallback` (functions), or hoisting genuine constants to module scope so they're created exactly once.

```jsx
<MemoChild style={{ color: "red" }} onSave={() => save()} />   // ❌ both new every render — memo always misses
```

### Is there an alternative to `React.memo` worth trying first?
Yes — composition. Since a JSX element is just an object, if an expensive child's element is *created* in a grandparent that isn't re-rendering, and passed down through an intermediate component as `children`, then when that middle component re-renders, it receives the **identical element object reference** it received before — React's reconciler sees the same reference and skips that subtree with no comparison overhead at all.

Moving where an element is *created* moves what re-renders — this is a genuinely underused technique, and recognizing it demonstrates understanding of *why* memo works (reference stability) rather than just knowing memo exists as an API to reach for.

```jsx
// ExpensiveChild's element is built in the grandparent; Parent re-rendering doesn't recreate it
<Parent><ExpensiveChild /></Parent>
```

### Shallow comparison vs deep comparison — why did React choose shallow?
Shallow compares each prop one level deep with `Object.is` (essentially reference equality for objects/arrays), so its cost is proportional to the *number* of props, regardless of how large or nested the data inside them is. Deep comparison recursively inspects contents, so its cost is proportional to the *size* of the data — which for a large object or array can easily cost more than just re-rendering the component would have.

Shallow is only *correct* as a strategy because of the paired convention of immutable updates: if state and props are never mutated in place, then "the reference changed" and "the data changed" are always the same fact — a changed reference reliably means changed data, and an unchanged reference reliably means unchanged data. The two rules — shallow comparison and immutability — always travel together for exactly this reason.

### Why does changing an object's reference (without changing its actual values) still trigger a re-render?
Because React's comparison is by identity, not by content — `{a: 1} === {a: 1}` evaluates to `false` even though the two objects hold identical data, since they're two distinct allocations in memory. If a parent constructs a new object with the same values on every render (an inline literal is the common culprit), a memoized child sees "different props" every time regardless of whether anything meaningfully changed, which is precisely what defeats `React.memo` when props aren't stabilized with `useMemo`.

---

<a name="s12"></a>
# 12. Performance

### What is memoization in React, and where does React apply it?
Memoization is caching a result keyed by its inputs, so repeating the same inputs returns the cached result instead of recomputing. React exposes it at three distinct scopes: `useMemo` caches a **value** inside a component, `useCallback` caches a **function reference**, and `React.memo` caches — effectively skips — a whole **component's** re-render.

All three exist for the same underlying reason: React compares by reference, and a component body recreates every inline literal fresh on every render, so without deliberate memoization, references silently change even when nothing meaningfully did — memoization is mostly an identity-stability tool that happens to also cache expensive computations, not primarily a speed trick.

### Before reaching for any optimization, how should you diagnose what's actually slow?
By recognizing that "the app is slow" describes at least three unrelated problems with unrelated fixes, and applying the wrong one wastes real effort while making nothing measurably better. **Slow to load** is a bundle-size problem (nothing has rendered because the JS hasn't finished downloading and compiling) — fixed by code splitting and asset optimization. **Slow to respond** is an expensive-render problem (typing lags, clicks feel sticky because expensive work occupies the main thread) — fixed by memoization, transitions, and virtualization. **Slow to paint** is a DOM/CSS problem (the browser itself struggles with node count or layout complexity) — fixed by reducing DOM nodes and virtualizing long lists.

The **React DevTools Profiler** shows which components rendered, how long each took, and *why* (props changed, hooks changed, parent rendered) — measure with it before optimizing, since every technique here has a real cost (memory, comparison overhead, a network round-trip, a loading spinner) and applying any of them blindly can make the application measurably worse.

### What is code splitting, and what's the mechanism underneath it?
Code splitting breaks one large JavaScript bundle into multiple smaller chunks loaded on demand, so users download only the code required for what they're actually doing right now — without it, a homepage visitor downloads the admin panel, a charting library, and a rich-text editor before anything on screen has rendered at all.

The underlying primitive is a dynamic `import()` — an expression returning a promise, which the bundler recognizes as a **split point**: it cuts that module and its dependencies into a separate chunk file and leaves behind code that fetches it over the network when the expression actually runs. This is a plain-JavaScript, bundler-level capability, not something React itself provides — `React.lazy` and `Suspense` are just the ergonomic glue for using it inside a component tree. Route-level splitting is the highest-leverage place to start, typically cutting 40–70% off the initial bundle for comparatively little work, because a user is only ever on one route at a time.

```jsx
const Settings = lazy(() => import("./Settings"));
<Suspense fallback={<Spinner />}><Settings /></Suspense>
```

### How does `React.lazy` actually work internally, and why is a `Suspense` ancestor mandatory?
When React renders a lazy component whose module hasn't finished loading, that component **throws the pending promise**. React catches it, walks up the tree to find the nearest `Suspense` boundary, and renders that boundary's fallback in its place; when the promise resolves, React re-renders and the real component takes over. It's genuinely exception propagation — the same mechanism error boundaries use — which is exactly why an ancestor `Suspense` is required rather than optional: there's nowhere else for the thrown promise to be caught.

Two rules follow from the mechanics: the `lazy()` call must live at module scope, not inside a component — calling it during render produces a new component *type* every render, so reconciliation destroys and remounts the whole subtree on every single render (state lost, effects re-run, data refetched) — and every lazy component needs a `Suspense` somewhere above it, or React throws an actual unhandled error.

### What is Suspense, and is it only for lazy-loaded components?
A component that renders a fallback UI while something below it in the tree isn't ready yet — the nearest `Suspense` ancestor catches a thrown pending promise (the same mechanism error boundaries use for thrown errors) and shows its fallback until that promise resolves.

It's not only for `React.lazy`, even though that's its most common everyday use. It's a general "this subtree isn't ready" mechanism, also used by data-fetching libraries that integrate with it and by streaming server rendering to reveal a page in pieces as each piece's data becomes ready — `React.lazy` is simply the first and most widespread application of a more general capability.

### What is `React.memo` and when should you actually use it (and not)?
`React.memo` wraps a component so React skips re-rendering it (and its whole subtree) when its new props are shallowly equal to the previous ones. Use it when the component is measurably expensive (verified in the Profiler), when it re-renders often with genuinely unchanged props, and ideally when it sits near the top of a large, otherwise-expensive subtree, so skipping it skips everything below too.

Don't use it on cheap components (a button, a label) — the comparison itself can cost more than just re-running the function would have. Don't use it when props are inline objects/arrays/functions that change every render anyway (the comparison always fails, adding cost for zero benefit) — and don't apply it "just in case" everywhere by default, which is a measurable net slowdown dressed up as an optimization.

### `useMemo` vs `useCallback` — restate precisely, and when is memoization actively the wrong choice?
`useMemo(fn, deps)` caches the **return value** of calling `fn`; `useCallback(fn, deps)` caches `fn` **itself** as a stable reference — `useCallback(fn, deps)` is literally `useMemo(() => fn, deps)`. Use `useMemo` for expensive computations or for keeping an object/array's identity stable (e.g. a Context provider's `value`); use `useCallback` specifically when a function is passed to a memoized child or listed in a dependency array.

It's the wrong choice when the computation is cheap — `useMemo` still stores a function, a dependency array, and a result, and still compares dependencies on every render, so for trivial work (simple arithmetic, string concatenation, filtering twenty items) you pay more in bookkeeping than you'd save. It's also a hint, not a guarantee: React may discard a cached value at its discretion (e.g. to free memory), so correctness must never depend on the cache actually surviving.

### What is tree shaking, and what commonly breaks it?
Tree shaking is the build-time elimination of exported code that nothing in your app actually imports. It depends entirely on ES Modules being **statically analyzable** — `import`/`export` are hoisted and can't be conditional or computed, so the bundler can prove, without running anything, exactly which exports are reachable, and delete the rest with confidence.

It commonly breaks three ways: **namespace imports** (`import * as _ from "lodash"` references the whole module object, so nothing can be narrowed out of it), **CommonJS-only dependencies** (`require` is a runtime function call whose target and exports can both be conditional, so the bundler can't prove anything is unused and must keep it all — this is why plain `lodash`, a CJS package, doesn't shake while `lodash-es` does), and **barrel files** (`export *` re-export indexes) — importing one small component from a barrel can drag in everything else the barrel touches, since eliminating the rest requires side-effect analysis to succeed cleanly through every re-exported module, and often it just doesn't; icon libraries are the classic victim, where two named imports can pull in a thousand icons.

### How would you make a very long list (e.g. 10,000 rows) fast?
Virtualization — rendering only the rows currently visible in the viewport (plus a small buffer), and recycling DOM nodes as the user scrolls rather than creating one permanent node per row. Ten thousand rows becomes roughly twenty rendered DOM nodes, which is a difference of *order of magnitude*, not a percentage improvement — genuinely more impactful than any amount of memoization applied to the same list, because memoization only avoids re-running work that was already going to be cheap per row; it does nothing about the sheer number of DOM nodes existing at once. Pair it with stable keys and, if row components are individually expensive, `React.memo` on the row — but virtualization is the technique doing the actual heavy lifting.

---

<a name="s13"></a>
# 13. Event System

### How does React handle events internally — does it attach a listener per element?
No — React attaches a small number of listeners at the **root container** (historically at `document`, now at the root DOM node since React 17) and uses event delegation: the native event bubbles up to that single listener, and React works out from the event's target which component's handler should actually run, then calls it.

This is a deliberate memory and setup-cost tradeoff: a list of a thousand rows each with their own `onClick` would mean attaching and detaching a thousand real DOM listeners as rows come and go. One delegated listener at the root handles every row, and adding or removing rows costs nothing extra in listener management.

### What are Synthetic Events, and why does React wrap native events at all?
A SyntheticEvent is React's cross-browser wrapper around the underlying native browser event — it exposes the same familiar interface (`preventDefault()`, `stopPropagation()`, `target`) so you write one handler that behaves identically regardless of which browser is running it, rather than working around each browser's historical quirks and inconsistencies in event objects yourself. `e.nativeEvent` gives you the real underlying native event if you ever need to drop down to it directly.

(One historical footnote worth knowing for older material: event *pooling*, where the synthetic event object was reused and its fields nulled out after the handler returned — requiring `e.persist()` to keep using it asynchronously — was removed in React 17. Any tutorial mentioning `e.persist()` predates that change.)

### Why doesn't React attach a real listener to every individual element?
Primarily memory and setup/teardown cost at scale. Attaching and removing a native listener per element for every mount/unmount of every row in a large, frequently-changing list is real, repeated work; one delegated listener at a shared ancestor handles arbitrarily many descendants uniformly, and mounting or unmounting rows doesn't touch the listener registration at all.

### What is event delegation, and how does bubbling make it possible?
Event delegation means listening on a common ancestor and using the event's `target` (and the DOM path it traveled) to work out which specific descendant element the interaction actually originated from — it fundamentally relies on native DOM events **bubbling** upward from the element they occurred on, through every ancestor, up to the root, where React's single listener is waiting to intercept them.

### Bubbling vs capturing — does React support both?
Bubbling travels from the event's target element **upward** toward the root; capturing travels the opposite direction, from the root **down** toward the target, before bubbling begins. React supports both phases explicitly: a plain `onClick` handler fires during the bubble phase, while `onClickCapture` fires during the capture phase, letting you intercept an event before it reaches — or regardless of whether it's stopped by — a descendant's own bubble-phase handler.

### If two components need the same shared logic (e.g. a mouse-position tracker), how would you architect that today versus the pre-hooks era?
Today, a custom hook (`useMousePosition()`) that any component calls directly — each call gets independent, isolated state, with zero components added to the tree and the returned values named explicitly at the call site, so there's no possibility of a naming collision between two different pieces of shared logic. Pre-hooks, this required either a Higher-Order Component wrapping the consumer in an extra layer (risking prop-name collisions between multiple HOCs and "wrapper hell" in DevTools) or a render-props component whose children function received the tracked state, which avoided collisions but produced deeply nested "callback hell" JSX once you needed more than one or two shared concerns at once. Hooks solved the same reuse problem as both older patterns while adding **no structure at all** to the tree — a flat function call rather than a wrapper component or a nested callback.

```jsx
function useMousePosition() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const handler = e => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);
  return pos;
}
```

---

<a name="s14"></a>
# 14. Forms

### Controlled vs uncontrolled components — what's the actual distinction?
In a **controlled** component, React state is the single source of truth for the input's value: the DOM element's `value` is driven from state, and every keystroke fires an `onChange` that updates that state, which then re-renders the input with the new value — the character you see was put there by React re-rendering, not by the browser's default text-editing behavior. In an **uncontrolled** component, the DOM itself holds the value, and React only reaches in to read it when it needs to, typically via a `ref` at submit time, using `defaultValue`/`defaultChecked` to set only the *initial* value and then stepping back entirely.

```jsx
// controlled — React re-renders the input on every keystroke
<input value={name} onChange={e => setName(e.target.value)} />
// uncontrolled — the DOM holds the value; React reads it on demand
<input ref={inputRef} defaultValue="Vishal" />
```

### Why default to controlled inputs, and when is uncontrolled the right call instead?
Controlled inputs keep the value inside React state, so you can validate as the user types, conditionally disable a submit button, transform input on the fly (force uppercase, insert dashes), or drive one field from another — none of which is straightforward when the value is only knowable at the moment you happen to read it from the DOM. React's own guidance defaults to controlled specifically because it keeps `UI = f(state)` intact.

Uncontrolled is the right call for `<input type="file">`, which is **always** uncontrolled by browser design — its value is read-only to JavaScript for security, since letting a script programmatically set a file path could trick the browser into uploading arbitrary files from disk — and it's also the pragmatic choice for very large forms, where a controlled input re-renders the owning component on every single keystroke, which becomes noticeable with fifty-plus fields in one component; libraries like React Hook Form use uncontrolled inputs internally for exactly this reason.

### What's the beginner bug where an input "won't accept typing," and what causes it?
Passing `value` to an input without a matching `onChange` handler. The input is locked to whatever the state value currently is, but nothing ever updates that state, so every keystroke's visual result is immediately overwritten back to the frozen value on the very next render — the input appears completely unresponsive to typing. React also warns about this pattern in the console. The fixes are adding a real `onChange`, switching to `defaultValue` for a genuinely uncontrolled input, or adding `readOnly` if the field being locked is actually intentional.

```jsx
<input value={name} />                          // ❌ locked — no onChange, nothing updates state
<input value={name} onChange={e => setName(e.target.value)} />   // ✅
```

### What's the performance tradeoff of controlled forms, and how do you mitigate it at scale?
A controlled input re-renders its owning component on every keystroke, because each character triggers a state update. For a handful of fields this is completely invisible; for a form with fifty-plus fields all sharing one parent's state, typing can measurably lag, since every keystroke re-renders the whole form. The mitigations: isolate each field into its own small component (so a keystroke in one field only re-renders that field, not the whole form), or switch to uncontrolled inputs read via refs — which is precisely why `react-hook-form` is popular: it deliberately uses uncontrolled inputs to avoid re-rendering the entire form on every keystroke, wiring up validation and submission around that constraint.

### When should form validation actually run — on every keystroke, on blur, or on submit?
At minimum, on submit, so a user is never blocked from attempting to send the form. Per-field feedback on **blur** (when the user leaves a field) is the standard middle ground — it tells them something's wrong without interrupting them mid-keystroke. Validating on every keystroke shows an error before the user has even finished typing a valid value, which reads as hostile UX (a password field flagging "too short" while they're still three characters into typing a fine password). In practice, most real applications reach for a library — React Hook Form is popular in part *because* it defaults to uncontrolled inputs, sidestepping the re-render-per-keystroke cost that a hand-rolled controlled-form validation setup would otherwise incur.

---

<a name="s15"></a>
# 15. Routing

### How does React Router (client-side routing) work?
It listens to changes in the URL (via the browser's History API), matches the current path against your route configuration, and renders the matching component — swapping content client-side with **no full page reload** and no request to the server for a new HTML document, since routing here is purely a rendering decision inside JavaScript that already has the app loaded.

### Client-side routing vs server-side routing — what's the tradeoff?
Server-side (traditional MPA) routing means every navigation is a fresh HTTP request: the server returns a complete HTML page, and the browser discards the old one and re-parses the new one from scratch. Client-side routing means JavaScript intercepts navigation, updates the URL via `pushState`, and swaps components in place.

The tradeoff: client-side routing means in-memory state survives navigation and transitions feel instant, at the cost of a heavier first load (the whole app's JS has to arrive before the *first* route can render) and the server needing to be configured to return the app's `index.html` for every possible client-side path rather than 404ing on unknown routes.

### `BrowserRouter` vs `HashRouter` — what's the actual difference and when would you pick each?
`BrowserRouter` uses the real History API to produce clean URLs like `/employees/42`, but it requires server configuration — every path the client-side router might handle needs to be routed back to the app's `index.html`, or a direct visit/refresh to a deep link 404s, since the server has never heard of that path. `HashRouter` encodes the route after a `#` (`/#/employees/42`), which the browser never actually sends to the server as part of the request path, so it works with zero server configuration on any static host — at the cost of uglier URLs and generally worse SEO, since crawlers historically treat the fragment differently (or not at all).

### What are nested routes, and what problem do they solve?
Nested routes render a child route's component **inside** a parent route's own output, via an `<Outlet />` placeholder in the parent — giving you a persistent layout shell (a header, a sidebar) that stays mounted across navigations between the child routes, with only the inner `<Outlet />` content actually swapping. Without nesting, every route would need to re-render the entire shell itself, remounting the header and sidebar (losing their state, re-running their effects) on every single navigation.

### Route parameters vs query parameters — what's the distinction?
Route parameters are dynamic segments baked into the path itself, like `/employees/:id`, read with `useParams()` — they typically identify *which resource* you're looking at. Query parameters (`?page=2&sort=name`) modify *how* that resource's view is presented rather than identifying it, and are read with `useSearchParams()`. The practical rule of thumb: if the value changes what data the page is even about, it's a route param; if it changes how already-identified data is displayed or filtered, it's a query param.

### How would you implement a protected route, and what security caveat matters here?
A wrapper component that checks the current auth state and either renders its children (the protected content) or redirects to a login page — typically preserving the originally-attempted URL (often via a query param or router state) so the user can be sent back there after successfully logging in.

The caveat that matters, and that interviewers specifically probe for: **this is a UX feature, not a security boundary.** Every byte of client-side JavaScript runs on a machine the user fully controls — they can open DevTools and simply not navigate through your router at all, or call your API directly. A protected route only prevents an honest user from finding a door that wouldn't open anyway; the actual authorization decision must be enforced by the server on every request, independent of whatever the client's router decided to show.

### How does lazy-loaded routing tie back to code splitting?
`React.lazy` combined with a dynamic `import()` at the route level, wrapped in `<Suspense>`, means each route's code downloads only on first navigation to it, rather than all routes shipping together in the initial bundle — and since a user is only ever on one route at a time, route-level splitting is consistently the single highest-leverage bundle-size fix available in most applications (see [§12](#s12) and [§16](#s16)). Modern routers (React Router's data APIs, Next.js's `<Link>`) additionally **preload** a route's chunk on hover/focus of its link, so by the time the user actually clicks, the code has often already finished downloading and the navigation feels instant despite still being split.

```jsx
const Reports = lazy(() => import("./Reports"));
<Route path="/reports" element={<Suspense fallback={<Spinner/>}><Reports/></Suspense>} />
```

---

<a name="s16"></a>
# 16. Build System

### What actually happens when you run a production build (e.g. `npm run build`)?
The build tool starts at your entry file, resolves and compiles JSX/TypeScript to plain JavaScript, follows every `import` to build a full dependency graph, bundles that graph into output files (splitting at dynamic `import()` boundaries into separate chunks), then applies a stack of production-only optimizations — tree shaking, minification, dead code elimination via `process.env.NODE_ENV` replacement — and writes the result to `dist/` with content-hashed filenames, so changing one file invalidates only that file's cache entry for returning visitors.

### What is Vite, and why is its dev server so much faster than a bundler like Webpack for local development?
Vite is a build tool that deliberately uses **two different strategies** for development versus production. In development it doesn't bundle at all — it serves `index.html` immediately and, when the browser's native `<script type="module">` requests a specific file, Vite transforms *just that one file* on demand (using esbuild, in roughly a millisecond) and returns it; the browser then requests that file's own imports the same way, recursively, relying on browsers' native ES Module support to avoid needing a bundling step to run the app at all during development.

The consequence is that cold start time becomes nearly **independent of total project size** — a ten-file app and a two-thousand-file app both start in a few hundred milliseconds, because Vite only ever compiles what the browser actually asks for, and a hot update re-transforms one changed file rather than rebuilding a dependency graph. Webpack, by contrast, bundles the *entire* application in JavaScript before the dev server can serve anything at all, so its startup time scales with project size — 30 to 90 seconds isn't unusual on a large codebase.

### For production, does Vite still bundle, and with what?
Yes — for production, Vite switches to **Rollup**, because shipping hundreds of individually-requested, unbundled ES Modules to real users over the network would be far worse than bundling them, even though native-ESM-on-demand is the right call for a local dev server talking to one browser on localhost. The one-liner worth remembering: Vite is native ESM plus esbuild in development, and Rollup in production.

### What is tree shaking, and why does it require ES Modules specifically?
Tree shaking is the build-time removal of exported code that nothing in your application actually imports. It requires ES Modules because `import`/`export` statements are **statically analyzable** — they're hoisted, and neither their target nor their presence can be conditional or computed at runtime — so a bundler can prove, without executing any code, exactly which exports are reachable from your entry point, and delete everything else with full confidence.

CommonJS (`require`/`module.exports`) breaks this guarantee entirely: `require` is an ordinary function call that can be wrapped in a conditional or take a computed string argument, and `module.exports` can be reassigned based on runtime logic — so a bundler genuinely cannot prove anything is safe to remove, and must keep it all. This is the concrete reason a CJS-only dependency (classic `lodash`) can't be tree-shaken while its ESM sibling (`lodash-es`) can.

### What is dead code elimination, and how is it different from tree shaking?
Dead code elimination removes statements that can never execute *within* a single module — unreachable branches, and conditions the compiler can prove are always false or always true. Tree shaking removes exported *bindings* nothing imports, working *across* the whole module graph. Related, both build-time, but operating at different scopes.

The case that matters most in practice: `process.env.NODE_ENV`. React's source contains thousands of lines of development-only code (warnings for missing keys, prop validation, hook-order checks) wrapped in `if (process.env.NODE_ENV !== "production")`. At build time, the bundler textually replaces that expression with the literal string `"production"`, the condition folds to `false`, and the entire guarded branch is deleted from the output — not skipped at runtime, genuinely absent from the file. This is the specific reason React's production build is roughly half the size of its development build, and why accidentally shipping a dev build to production is doubly costly: you ship the warning machinery *and* it actually executes on every render.

### Webpack — what are the five or so core concepts worth being able to name?
**Entry** — where the module graph starts. **Output** — where the bundled files are written, typically with a content hash in the filename for per-chunk cache busting. **Loaders** — transform non-JavaScript files; the framing that makes this click is that Webpack fundamentally only understands JavaScript, and loaders teach it everything else (CSS, images, TypeScript, SVG). **Plugins** — hook into the whole build lifecycle rather than transforming individual files one at a time. **Mode** — `development` or `production`, where production automatically turns on minification, tree shaking, and the `NODE_ENV` dead-code-elimination described above. Two more terms worth having ready: `SplitChunksPlugin`, which automatically extracts code shared across entry points into common chunks (a vendors bundle, say), and Hot Module Replacement, which swaps a changed module into the running app without a full page reload, preserving component state.

### What is Hot Module Replacement (HMR), and why does it matter for dev experience?
HMR swaps a changed module into the already-running application in the browser, without a full page reload — so editing a component's markup or logic shows the change almost instantly while the rest of the app's in-memory state (a filled-in form, an open modal, scroll position) is preserved rather than wiped by a full refresh.

It matters because a full reload after every edit means re-navigating back to whatever state you were testing before you can see the effect of a change — for anything more than a couple of clicks deep, that adds up to real, repeated friction across a working session. Both Vite and Webpack support it, though Vite's on-demand dev model means an HMR update only ever has to re-transform the one file that actually changed.

### What is esbuild, and what's the tradeoff it makes for its speed?
A bundler and transpiler written in **Go** rather than JavaScript, running roughly 10–100× faster than JS-based tooling — the speed comes from being compiled to native machine code, parallelizing genuinely across all CPU cores, and being architected from the ground up to minimize the number of intermediate AST passes. Vite uses it specifically for pre-bundling dependencies once and for stripping TypeScript type annotations during development.

The tradeoff worth knowing precisely, because it surprises people migrating from a `ts-loader`-based setup: **esbuild does not type-check TypeScript at all** — it simply deletes the type annotations and moves on, treating a type error exactly the same as valid code. Actual type checking has to come from your editor's language server or a separate `tsc --noEmit` run in CI; this is a deliberate trade of build-time type safety for raw transformation speed.

### Why is Rollup the standard choice for building libraries specifically, rather than Webpack?
Rollup is ESM-first and produces flat, minimal output with very little wrapper/runtime code around your actual exports — where Webpack's output includes a module runtime and registry, which is acceptable overhead baked into an application's own bundle but is unwanted, unnecessary weight in a package that other people's applications will then bundle *again*. Rollup also pioneered tree shaking as a bundler feature and remains excellent at it, which matters more for a library (where every unused byte directly costs every consumer) than for a typical application build. Most application developers use Rollup indirectly today, through Vite's production build step, without configuring it themselves.

### What's the toolchain trend worth naming — where is this heading?
The whole JavaScript build toolchain is migrating from tools written *in* JavaScript to tools written in compiled languages, chasing the same order-of-magnitude speed win esbuild demonstrated. **SWC** (Rust) is the Babel/Terser replacement used by Next.js. **Turbopack** and **Rolldown** are Rust-based bundlers being built as eventual successors to Webpack and Rollup respectively. Being able to name this trend — and that esbuild's Go implementation kicked it off — signals awareness of where the tooling is actually heading rather than only knowing today's snapshot.

---

<a name="s17"></a>
# 17. ⭐ React Internals

### How does React know which specific component instance to update when you call a setter?
Every component instance has a corresponding fiber node positioned in the fiber tree. Calling a setter marks *that specific fiber* as having pending work and schedules a render starting from the root, which then walks down to exactly the fibers that actually need re-processing. A component's identity across renders comes from its position in the tree plus its type — and for list children specifically, from its `key`, which is what lets React tell "the same logical item, just moved" apart from "a genuinely different item now sitting at this position."

### How does React store hook state internally?
On the fiber, as a **linked list of hook objects** — the fiber's `memoizedState` points at the first hook, and each hook object points to the next. This is a lower-level, mechanical restatement of the same fact as "React stores hook state outside your function": the actual data structure is a positional linked list, not a name-keyed map of any kind.

### How does React know which `useState()` call belongs to which variable?
It doesn't — and that's the point. There is no name stored anywhere in the mechanism; React relies entirely on hook calls happening in the *exact same order* on every render, so the first `useState` call always gets the first hook object in the list, the second call always gets the second, and so on, purely by position. Your variable name (`count`, `age`, whatever you destructured it as) exists only in your own source code — React never sees it and never needs to.

### Why is consistent hook call order so critical, and what breaks if it isn't?
Because position in the hooks linked list is a hook's *only* identity as far as React is concerned — there's no name-based lookup happening anywhere. If a conditional (`if (x) { useState(...) }`) changes how many hooks actually run between one render and the next, every hook called *after* that point shifts to a different position in the list than it occupied before, and gets handed back a stored value that actually belongs to a completely different hook call. State silently lands in the wrong variable, or a cleanup runs against setup it was never paired with — with no error, no warning beyond what the ESLint rule catches statically before you even run the code.

### Walk through how reconciliation actually works, mechanically.
React builds a new work-in-progress fiber tree from the current one, comparing each corresponding node pairwise against its previous version. Same type at that position → reuse the fiber, update its props, and recurse into its children. Different type → discard that entire subtree and rebuild fresh, with no attempt to search for salvageable pieces inside it. For a list of children specifically, matching happens by `key` when one is supplied, and falls back to plain positional matching when it isn't. Nodes that end up needing an actual DOM change get flagged with an effect type (Placement/Update/Deletion); the commit phase then walks only the flagged nodes and applies exactly those changes to the real DOM.

### How are fibers actually linked together, and why does that specific structure matter?
Three pointers, not a children array: `child` (the first child, pointing down), `sibling` (the next child at the same level, pointing across), and `return` (the parent, pointing up). That structure is precisely what makes the tree walkable with an ordinary iterative loop instead of recursion — and being walkable by a loop is what makes it *pausable*, since "where am I right now" becomes a plain variable React can save and later resume from, rather than something implicitly encoded in a stack of pending recursive calls that you have no way to snapshot.

### What is a fiber node, concretely, and why does React keep two entire trees rather than one?
A fiber is a plain JavaScript object representing one unit of work for one component instance: its type, its props (pending and memoized), its state (`memoizedState`, where the hooks list lives), effect flags describing what DOM work it needs, a priority `lanes` value, a `stateNode` pointer to its corresponding real DOM node, the three tree-traversal pointers from the previous answer, and an `alternate` pointer to its counterpart fiber in the *other* tree. React keeps exactly two trees — `current` (what's actually on screen) and `work-in-progress` (what's currently being built) — so it can construct the entire next version of the UI without mutating anything visible, and then commit by flipping a single root pointer, rather than mutating the live, on-screen tree in place as it goes (which would risk showing a half-updated UI if anything went wrong or got interrupted partway through).

### How does React decide the order in which to process pending updates?
Every update is assigned a priority **lane** based on where it originated — a discrete user interaction like a click or keypress is treated as urgent because humans notice input lag most acutely, continuous input (scroll, drag) ranks next, an ordinary `setState` is "default" priority, a `startTransition`-wrapped update is explicitly non-urgent and interruptible, and idle/offscreen work runs last, whenever there's genuinely spare time. React processes higher-priority lanes first, does the actual work in small time-boxed chunks (roughly 5ms slices), and checks between each chunk whether the browser urgently needs the main thread back — yielding if so.

### Why do renders sometimes get interrupted mid-way, and why is that safe to do?
Because something more urgent arrived while a lower-priority render was in progress — if React is partway through rendering an expensive filtered list when a keystroke fires, it abandons or pauses that work-in-progress render so the keystroke can be handled and painted immediately, then restarts (not resumes) the abandoned work afterward, typically with fresher inputs anyway since the interrupting event likely changed the very state the paused render was computing from. It's safe specifically because interrupted work only ever existed in the work-in-progress tree — a tree nothing is currently displaying — so throwing it away leaves nothing broken or half-applied anywhere the user can see; this is exactly the double-buffering guarantee from [§8](#s8).

### What exactly happens during the commit phase, in order?
Three sequential sub-phases, and the whole thing runs synchronously and cannot be interrupted, since a half-applied commit would leave the DOM visibly, incoherently broken. **Before mutation:** the DOM is still the *old* version — `getSnapshotBeforeUpdate` reads it here (e.g. capturing scroll position before it's about to shift). **Mutation:** React actually writes to the real DOM, runs any layout-effect cleanups and `componentWillUnmount` for things being removed, and swaps the `current` tree pointer over to the newly-built tree. **Layout:** the DOM is now the *new* version but hasn't been painted yet — refs get attached here, and `componentDidMount`/`componentDidUpdate`/`useLayoutEffect` all run in this window, synchronously, before the browser paints. Only after all three does the browser actually paint, and passive effects (`useEffect`) run asynchronously sometime after that.

---

<a name="s18"></a>
# 18. React 18+

### What is Concurrent Rendering, in one clean statement?
React's ability to prepare a UI update in the background — pausing, resuming, or abandoning that work as priorities shift — without blocking the main thread from handling more urgent work in the meantime. It isn't a single feature you flip on; it's a capability that specific opt-in features (`startTransition`, `useDeferredValue`, Suspense) are built on top of, and simply upgrading to React 18's `createRoot` doesn't make your renders concurrent by itself — nothing is marked as non-urgent until you explicitly say so.

### What is automatic batching, and specifically what changed from React 17 to React 18?
Automatic batching means React groups **every** state update occurring within one tick into a single re-render, no matter where in the code those updates originated. Before React 18, batching only happened *inside React's own event handlers* — a `setState` call inside a `setTimeout` callback, a raw promise `.then()`, or a listener attached directly with `addEventListener` (bypassing React's synthetic event system) each triggered its own separate render, because those code paths never passed through React's batching wrapper. React 18's `createRoot` routes every update through the scheduler uniformly, so the exact same code that used to cause two renders in a `.then()` callback now causes just one.

```jsx
setQuery(value);                            // urgent — the input must update now
startTransition(() => setResults(filter(value)));   // marked non-urgent, interruptible
```

### What does `startTransition()` do, and how is `useTransition()` different from it?
`startTransition(callback)` marks the state update(s) inside `callback` as **non-urgent** — React keeps the current UI fully interactive while it renders the new one in the background, and will interrupt that background render entirely if something more urgent (a keystroke, a click) arrives in the meantime. `useTransition()` is the hook form of the same capability, additionally returning an `isPending` boolean you can use to show a subtle loading indicator specifically for the in-flight, non-urgent update, without blocking anything else.

### What does `useDeferredValue()` do, and how is it different from `useTransition`?
`useDeferredValue(value)` returns a lagging copy of a value you don't own the setter for — one that catches up to the real value in a low-priority, interruptible background render rather than immediately. It solves the same underlying problem as `useTransition` (keep something non-urgent from blocking urgent work) but from the *receiving* end: `useTransition` is for when you're the one calling `setState` and can wrap that call; `useDeferredValue` is for when you only receive a value (via props, say) and can't wrap its origin, so instead you defer how *you* use it downstream.

```jsx
const deferredQuery = useDeferredValue(query);
const results = useMemo(() => filterHuge(deferredQuery), [deferredQuery]);
```

### What is Suspense, and what does it actually mean for a component to "suspend"?
Suspense is a boundary component that renders a fallback UI while something below it in the tree isn't ready yet — originally built for `React.lazy` code-loading, and now used more broadly for data fetching in frameworks that integrate with it, and for streaming server rendering. Mechanically, a component "suspends" by throwing a pending promise during render; the nearest ancestor `Suspense` catches it (the same underlying mechanism as an error boundary catching a thrown error) and shows its fallback until that promise resolves, at which point React re-renders the real content in its place.

### What is hydration, and what is selective hydration specifically an improvement over?
Hydration is the process of attaching React to server-rendered HTML that's already sitting in the DOM — building the fiber tree over the *existing* markup and wiring up event listeners, rather than tearing it down and recreating it from scratch on the client. **Selective hydration** improves on plain hydration by letting different parts of the page hydrate independently and out of order, prioritized by where the user actually interacts — clicking a component that hasn't finished hydrating yet causes React to hydrate *that* part first, ahead of whatever order it would otherwise have followed. Before selective hydration, hydration was effectively all-or-nothing: one large, slow section anywhere on the page could block the entire page from becoming interactive.

### What is streaming SSR, and what specifically does it fix?
The server sends HTML to the browser in progressively arriving pieces as each piece becomes ready, rather than waiting for the entire page — including its slowest data dependency — to finish rendering before sending anything at all. The fast, immediately-available shell of the page arrives first and becomes visible right away, while slower sections stream in behind their own Suspense boundaries as their data resolves — so one slow database query on one part of the page no longer holds the *entire* page's first paint hostage.

### Why does concurrent rendering specifically require the render phase to be pure, more strictly than before?
Because a render may now legitimately execute more than once for a single logical update — paused, restarted, or its result outright discarded — where under the older, non-concurrent model a render effectively only ever ran once per update, so violations of the "render must be pure" rule often went unnoticed even when technically present. Under concurrency, a side effect placed directly in a component body can now fire two or three times for what the user experiences as a single interaction, or fire for a tree that never even ends up committed to the DOM at all. React 18 Strict Mode's deliberate double-invocation of components and effects in development exists specifically to surface this class of bug before it reaches production, where it would otherwise appear intermittently and be much harder to reproduce.

### What is tearing, and why did it require a new hook (`useSyncExternalStore`) to fix properly?
Tearing is a visual inconsistency where, during a single concurrent render pass, different components end up reading *different* values of the same external data source — because React paused mid-render, the external store's value changed during that pause, and components rendered before versus after the pause captured different snapshots of it, with both getting committed together in the same visible frame. This specifically can't happen with ordinary React state, since React fully controls it and keeps it internally consistent for the entire duration of a render — it only arises at the boundary with state living *outside* React's control (a Redux/Zustand store, `localStorage`, `navigator.onLine`). `useSyncExternalStore` exists to close exactly that gap: it gives React a formal way to read an external source while guaranteeing one consistent snapshot across an entire concurrent render pass, which is why every state-management library had to adopt it to work correctly under React 18.

---

<a name="s19"></a>
# 19. State Management

### What's the single most important question to ask before deciding where a piece of state should live?
Whether it comes from a server. If it does, it's **server state** — a cache of data the server owns, not state your application owns — and the right tool is a query library (React Query, SWR), regardless of how many components need to read it. Answering this question first, before "how many components need it," removes most of what people mistakenly put into a global store to begin with, because a large fraction of "shared state" in a typical app is actually fetched data.

### What's the difference between shared state and global state, and why does conflating them cause real problems?
Shared state has a **natural owner** — there exists a specific component in the tree that contains every consumer that needs the value (a form's fields and its submit button, say) — and the correct fix is lifting it to that nearest common ancestor. Global state has **no sensible owner short of the root** (the authenticated user, the theme) — there's no natural container for "everyone in the app who might need to know the theme" except the very top.

Conflating the two is the classic over-correction: filter values shared between a filter bar and a results list are *shared* state with an obvious common parent, not global state — moving them into Context or a store makes them harder to trace (an implicit dependency instead of a prop visible in the signature) while gaining literally nothing, since a plain lift already solves it cleanly.

### Why is server state described as "a different category that changes everything," and what four properties follow from that?
Because every other kind of state your application genuinely **owns** — you create it, you're the only thing that ever changes it, so it's correct by definition at any given moment. Server state you fundamentally **don't own** — the server does, and your copy is only a snapshot that was accurate at the moment it arrived and may already be wrong by the time you read it, with nothing in your code able to detect that on its own.

Four properties follow directly. It's **asynchronous**, so loading/error/empty states are a required part of its lifecycle, not an edge case to bolt on later. It **goes stale silently** — another user's edit or a background job can invalidate your copy with no signal reaching your code at all. **Ownership is shared** across multiple clients, introducing genuine conflicts and races that simply don't exist for a dropdown's open/closed flag. And it **needs real caching** to be usable at all — refetching on every navigation is wasteful and feels slow, never refetching means it silently rots — which means expiry policies, deduplication of concurrent identical requests, and background revalidation: a genuinely hard problem with essentially nothing to do with React itself.

### Why is putting server data (API responses) into Redux considered the classic architectural mistake?
Because you end up hand-writing a cache from scratch — loading flags, error flags, timestamps, invalidation logic — repeated per resource across the codebase with subtly inconsistent behavior between them, plus a substantial amount of boilerplate (action types, a reducer case, a thunk, a selector) just to express "fetch a list of users." And critically, **none of the actually hard parts get solved by doing this**: Redux is a synchronous state container with no built-in opinion about caching, deduplication, retry, or revalidation, so all of that has to be implemented by hand, incompletely, in every project that takes this route. A query library (React Query, SWR, RTK Query) starts from the premise that this is a cache-management problem, not a state-management problem, and handles deduplication, stale-while-revalidate, refetch-on-focus, and retry as configuration rather than code you write per resource.

### What is the decision framework for choosing where state should live, in order?
1. **Does it come from a server?** → server state, use a query library, regardless of read breadth. 2. **Does only one component use it?** → local state, `useState`/`useReducer`, and stay there as long as possible — this is the default, not a fallback. 3. **Do a few related components use it?** → shared state, lift to the nearest common ancestor, or try composition (creating the consumer where the data already lives, passed as `children`) before reaching for anything heavier. 4. **Is it genuinely application-wide?** → split by update frequency: rarely-changing (theme, auth, locale) suits Context; frequently-changing (a cart, live collaborative data) suits Zustand or Redux specifically because those support subscribing to slices, which Context structurally cannot do.

### Context vs Zustand vs Redux — how do you actually choose between them?
**Context** ships with React (zero dependency) and is genuinely ideal for a handful of rarely-changing values — theme, auth, locale — but every single consumer re-renders on any change to the provider's value, with no selectors and no devtools. **Zustand** is a small library whose central advantage is precisely the gap Context has: components subscribe to *slices* of the store, so a component reading `user` doesn't re-render when `cart` changes elsewhere, and it also works outside React components entirely (readable/writable from plain utility functions or event handlers). **Redux** brings a single enforced store shape, a mature middleware ecosystem, and powerful devtools with time-travel debugging — genuine value on a large team or a genuinely complex domain, genuine overhead on a small app; Redux Toolkit removed most of the historical "too much boilerplate" complaint, and RTK Query folds server-state handling into the same ecosystem.

### Why is Redux Toolkit ("RTK") worth knowing about specifically, beyond "modern Redux"?
Classic Redux required substantial boilerplate per feature — hand-written action type constants, action creator functions, a switch-statement reducer, manual immutable-spread updates — spread across several files. RTK collapses all of that into a single `createSlice` call, bundles Immer under the hood (so you write code that *looks* like it's mutating state directly, and Immer produces an immutable update from it behind the scenes), wires up thunks for async logic, and configures devtools automatically. This single change removed most of the "Redux is too verbose" objection that drove teams toward Context or Zustand throughout the pre-RTK era.

---

<a name="s20"></a>
# 20. ⭐ Senior "Why" Questions

### Why does React use a Virtual DOM instead of just updating the DOM directly?
Not because the Virtual DOM is inherently faster than the real DOM — a hand-written, perfectly-targeted minimal DOM update always wins on raw speed, since React's approach does that same final write *plus* an element-tree build and a diff on top of it. It's because writing those minimal, correct updates by hand for every possible state transition, in every component, and keeping them correct through every subsequent refactor is exactly where real-world bugs come from. The Virtual DOM buys a simpler programming model — describe the whole UI for the current state and let React reduce that to the minimum real change — trading a small, predictable amount of runtime performance for a large, compounding amount of correctness.

### Why is immutability important in React, beyond "it's a best practice"?
Because it makes change detection an O(1) operation. If data is never mutated in place, then "the reference changed" and "the data changed" become the exact same fact — checking `prev !== next` is a complete, sufficient answer regardless of how large or nested the data is. Mutate in place instead, and reference comparison starts lying: the data did change, but the reference didn't, so React (and `React.memo`, `useMemo`, and every effect dependency array — all of which rely on the identical comparison) concludes nothing happened and silently skips work that should have run.

### Why are keys necessary for lists, at a level deeper than "React tells you to add them"?
Because React needs a notion of **identity** across renders, and position in a list is not identity — it's just where an item currently happens to sit. Without keys, inserting an item at the front of a list makes every subsequent item look "changed" purely by virtue of occupying a different position than it did before, so React ends up patching every single row instead of inserting the one genuinely new node — and worse, it may reuse a DOM node (with its live internal state: a checked checkbox, typed input text, focus) for what is now, logically, a completely different item.

### Why are Hooks strictly order-dependent — what would break otherwise?
Because call order is a hook's *only* identity to React — there is no name-based lookup anywhere in the mechanism. React stores hook state in a positional linked list attached to the fiber, and has zero access to the variable names you happened to destructure a hook's return value into. Consistent call order across every render is the *entire* mechanism that lets React reliably hand the correct stored value back to the correct hook call; break that ordering with a conditional hook call, and every hook after the divergence point silently reads or writes a slot that actually belongs to a different hook.

### Why do refs deliberately not trigger re-renders?
Because a ref exists specifically to hold a value *outside* React's rendering data flow — it's a plain mutable box React hands back unchanged on every render, with no setter and therefore nothing to notify anything of a change. That's the entire design intent, not an oversight: refs are for values that genuinely shouldn't drive what's rendered — a DOM node handle, a timer id, a previous value kept for comparison — and forcing a re-render on every mutation of one would defeat the purpose of having an escape hatch from React's own reactivity model at all.

### Why doesn't `setState()` update the value immediately?
Because it schedules an update rather than performing one synchronously, and that scheduling is what makes two other important things possible. **Batching** — multiple `setState` calls within one event handler collapse into a single re-render instead of one render per call, avoiding both wasted work and a user glimpsing inconsistent intermediate UI states. And **prioritization** — React can defer a non-urgent (`startTransition`) update behind a more urgent one. It also has a consistency benefit independent of both: the state value read within a given render is a fixed snapshot for that render's entire duration, which means it literally cannot change value partway through a single function call — a property that would be impossible to guarantee if the setter mutated the variable synchronously and in place.

### Why do effects run after painting rather than before it?
So that they can never delay what the user actually sees. React commits the DOM changes, the browser paints, and only then does `useEffect` run — if effects instead ran *before* paint by default, every subscription setup, every network request kickoff, every piece of ordinary effect logic would push back the moment the user sees the visual update, even though most effects have nothing to do with what's visually on screen. `useLayoutEffect` exists specifically as the escape hatch for the narrow, genuine exception — measuring the DOM and then synchronously adjusting it before the user can see the pre-adjustment state at all.

### Why is reconciliation O(n) instead of the theoretically correct O(n³)?
Because a fully general algorithm for the minimum edit distance between two arbitrary trees is provably O(n³) — for a page with a thousand nodes, that's on the order of a billion comparisons per single update, which is simply unusable at interactive frame rates. React deliberately swaps optimal results for a linear-time approximation via two heuristic assumptions: elements of a different type are assumed to produce entirely different subtrees (so React destroys and rebuilds rather than searching inside for anything salvageable), and identity for list children is supplied explicitly by the developer through `key` rather than inferred (turning an expensive search into a cheap lookup). Both assumptions hold for the overwhelming majority of real UI changes, and the rare cases where they don't (a genuine "move" of a subtree to a different parent, which React treats as destroy-then-recreate) are an accepted cost of collapsing the complexity to a single linear pass.

### Why was Fiber introduced, at the architectural level rather than the feature level?
Because the previous recursive reconciler's traversal position lived on the JavaScript call stack — a structure React does not control and cannot pause, snapshot, or resume. Once a render began, it ran to completion, however long that took, occupying the single main thread for its entire duration; a genuinely large render could block input handling and animation for hundreds of milliseconds with absolutely nothing else able to run in the meantime. Fiber re-represents the tree as an explicit linked-list structure React owns and walks with an ordinary iterative loop instead of recursion, which means "where am I in this traversal" becomes a plain variable React can save and resume from — the specific property that everything built on top of it since (transitions, Suspense, streaming SSR, prioritized updates) depends on.

### Why is React declarative rather than imperative, at a deeper level than "it's the modern style"?
Because the imperative alternative doesn't scale with the number of states a UI can be in. With direct, hand-written DOM manipulation, every new piece of state multiplies the number of possible *transitions* you must correctly handle by hand — and a single missed transition (forgetting to reset a class on one particular error path, say) leaves the UI in a state that's simply wrong, with no mechanism to notice or correct it. Declaring what the output should look like for a *given* state, rather than how to transition from any one state to any other, means there are no transitions to write at all — React derives every transition by re-describing the whole UI and diffing, so an entire category of "I forgot to reset that on one path" bugs structurally cannot occur.

### Why should components be pure, beyond "React's docs say so"?
Because React explicitly reserves the right to call your component function more than once for a single logical update, to discard a render's result entirely without ever committing it, and — under concurrent rendering — to interrupt a render partway through. Strict Mode double-invokes components (and effects) deliberately in development specifically to expose impurity that would otherwise hide until it caused an intermittent, hard-to-reproduce production bug. If rendering has an observable side effect, that side effect fires an unpredictable — and generally *increasing* — number of times as React's internals evolve to do more of this kind of speculative, discardable work.

### Why does React discourage copying a prop into state ("derived state")?
Because it duplicates the source of truth — now there are two values (the original prop, and the state copy that started from it) that must somehow stay in sync, and they *will* drift apart the moment any code path forgets to keep them aligned, with the classic visible symptom being a component that keeps showing stale data even after its props have clearly changed underneath it (since `useState(props.value)` only reads the prop on the very first render, by design). Computing the value fresh during render instead of copying it into a separate piece of state means there's nothing separate to keep synchronized at all — it can never be "out of date," because it's recalculated from the current source every single time.

### Why does a Context value change re-render every consumer, with no way around it via `React.memo`?
Because Context is fundamentally a subscription with **no selector mechanism** — React tracks which components called `useContext` for a given context and re-renders literally all of them whenever that provider's value changes by `Object.is`, with genuinely no built-in way for React to know which *part* of that value any individual consumer actually cares about. And `React.memo` specifically cannot intervene here because it compares *props*, and context is delivered through an entirely separate channel that bypasses props comparison altogether — a memoized component reading context still re-renders on every context change regardless of its memo wrapper. This is precisely the missing capability that a selector-based store (Zustand, Redux with `useSelector`) exists to provide when granular, per-slice subscription genuinely matters.

### Why does React use shallow comparison rather than deep comparison for things like `React.memo`?
Because deep comparison's cost scales with the *size* of the data being compared, and for a sufficiently large or deeply nested prop, that comparison can easily cost more than simply re-rendering the component would have — defeating the entire point of the optimization. Shallow comparison's cost instead scales only with the *number* of props, which is bounded and predictable regardless of how large any individual prop's contents are. It's only *correct* as a strategy, though, because of the paired convention of immutable updates: if data is genuinely never mutated in place, a changed reference reliably means changed data and an unchanged reference reliably means unchanged data — which is exactly why these two rules (shallow comparison, immutable updates) always appear together and neither one is sound without the other.

---

<a name="s21"></a>
# 21. Custom Hooks

### What is a custom hook, exactly, and what does the `use` prefix actually mean?
A custom hook is simply a function whose name starts with `use` and which calls other hooks internally — it is not a distinct React feature or API, just a **convention** that lets you extract stateful logic out of a component and reuse it elsewhere. The `use` prefix isn't decoration: it's specifically what tells `eslint-plugin-react-hooks` that the Rules of Hooks (top-level calls only, called only from components or other hooks) apply to this particular function, so the linter can actually enforce them.

```jsx
function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  return [on, () => setOn(o => !o)];
}
```

### What problem do custom hooks solve that HOCs and render props didn't solve as well?
HOCs and render props both shared logic by **adding structure to the component tree** — a HOC wraps the component in an extra, real, rendered layer (producing "wrapper hell" once you compose several: prop-name collisions between HOCs that both happen to inject the same prop name, opaque prop origins where you can't tell from a component's signature which prop came from where, lost static methods and refs needing manual plumbing); a render prop instead nests a callback inside your JSX, producing "callback hell" — a pyramid of nested functions once you need more than one or two shared concerns at once. A custom hook shares logic through an ordinary function call: **no wrapper component, no nesting, and the returned values are named by you at the call site**, so there's nowhere for a naming collision to hide and no ambiguity about where any given value came from.

```jsx
// hooks: flat, named, no tree changes — versus wrapper hell or a callback pyramid
const mouse = useMouse();
const theme = useTheme();
const user  = useUser();
```

### Do two components that both call the same custom hook share any state?
No — this is the single most common misconception about custom hooks. Each call to a custom hook gets its own completely independent `useState`/`useEffect`/etc. state, exactly as if you'd copy-pasted the hook's body into each calling component separately. A custom hook shares *logic* (the code, the pattern, the behavior), not *values* — if you actually need two components to read and write the *same* live value, that's what Context or a shared store is for, and a custom hook alone doesn't provide it.

### What are the rules for writing and calling a custom hook?
Exactly the same Rules of Hooks that apply to built-in hooks, since a custom hook is ultimately just a function that calls other hooks internally: call it only at the top level of a component or another custom hook (never inside a conditional, loop, or nested function), and call it only from a component or another hook — never from a plain, ordinary JavaScript function or a class method. The `use` naming convention is precisely what lets the ESLint plugin recognize and enforce both rules on it automatically, same as it does for `useState` and `useEffect` themselves.

### When should you actually extract a custom hook, and what are some common examples?
When the same stateful pattern shows up in more than one component (the common threshold cited is the *third* occurrence, not the second — two similar things might still diverge, three is a real pattern), or when a single component has accumulated so much incidental logic that reading it obscures what it's actually rendering. Common, genuinely useful examples: `useDebounce` (delay committing a fast-changing value), `useLocalStorage` (sync a piece of state with `localStorage`), `useFetch`/`useAsync` (loading/error/data state around an async call), `useMediaQuery` (track a CSS media query's match state), and `usePrevious` (retain the value from the render before this one, via a ref updated inside an effect that runs *after* render).

```jsx
function usePrevious(value) {
  const ref = useRef();
  useEffect(() => { ref.current = value; });   // runs AFTER render — captures this render's value
  return ref.current;                          // so during THIS render, it's still the PREVIOUS one
}
```

---

<a name="s22"></a>
# 22. Error Handling

### What is an error boundary, and why must it still be a class component?
An error boundary is a component that catches JavaScript errors thrown anywhere in its child tree **during rendering** (also lifecycle methods and constructors) and renders a fallback UI in place of the tree that crashed, rather than letting the whole application unmount into a blank white screen — which is what happens with no boundary at all, since React 16 made "a corrupted UI is worse than no UI" a deliberate default.

It must still be a class specifically because it needs `getDerivedStateFromError` (a static method, run in the render phase, that returns state used to show the fallback) and `componentDidCatch` (run in the commit phase, where the actual side effect of logging the error belongs) — neither has a hook equivalent, which makes error boundaries the one genuinely remaining reason to write a class component in modern React; most teams reach for the `react-error-boundary` package rather than hand-writing one.

```jsx
class ErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }   // render phase — pure
  componentDidCatch(error, info) { logToService(error, info.componentStack); }  // commit phase — effects OK
  render() { return this.state.hasError ? <h1>Something went wrong.</h1> : this.props.children; }
}
```

### What do error boundaries *not* catch, and why not?
They don't catch errors in event handlers, in async code (`setTimeout` callbacks, promise `.then`/`.catch` chains), during server-side rendering, or errors thrown inside the boundary component itself. The reason is structural: a boundary only hooks into React's own render/commit pipeline — event handlers and async callbacks execute *outside* that pipeline entirely, at a point where React genuinely isn't on the call stack and therefore has no opportunity to intercept anything thrown there.

```jsx
async function handleClick() {
  try { await save(); } catch (e) { setError(e); }   // ordinary try/catch, outside React's pipeline
}
```

### If error boundaries can't catch async errors, how do you route one to a boundary anyway?
Catch the error with an ordinary `try/catch` (or a promise `.catch()`) where it actually occurs, store it in local state, and then — critically — **throw it during the next render** rather than at the point it was caught; only a throw that happens *during rendering* is something a boundary can actually intercept.

```jsx
const [error, setError] = useState(null);
if (error) throw error;                              // thrown during render — now the boundary sees it
useEffect(() => { fetchData().catch(setError); }, []);
```

### Where should error boundaries actually be placed in the tree — one at the root, or several?
Around each independent, self-contained section rather than a single one wrapping the entire application. A single top-level boundary turns *any* error anywhere in the app into the exact same full-page fallback — which is only marginally better than the unmounted blank screen it's meant to prevent. Wrapping smaller, independent sections individually (a chart widget, a comments panel) means one section failing shows a small, localized "couldn't load this" message in its own place, while the rest of the page keeps working completely normally.

### What are the three distinct categories of failure in async data fetching, and why does lumping them together produce a useless error message?
**Network errors** — no connection, DNS failure, CORS rejection — where `fetch` itself actually rejects; generally worth retrying. **HTTP errors** — the server responded, just with a 4xx/5xx status; `fetch` does **not** reject for these, so you must check `res.ok` yourself, and the right response genuinely differs by status: a 404 means "doesn't exist" (don't retry), a 401 means "log in again," a 500 means "server broke" (a retry might actually help). **Parsing errors** — the response body wasn't valid JSON, usually because an HTML error page or a proxy's own error response came back instead of the expected payload; `.json()` itself rejects here. Treating all three as one generic "Something went wrong" throws away information the user (and your own retry logic) genuinely needs — a network blip calls for "try again," a 404 calls for "this doesn't exist," and neither message is right for the other case.

---

<a name="s23"></a>
# 23. Data Fetching & Server State

### Why is fetching data with plain `useEffect` + `useState` considered a problem, if it technically works?
It works, but you personally own everything surrounding it: loading and error state, cancelling the request on unmount, guarding against race conditions when a fast second request's response lands before a slow first one's, refetching when the window regains focus, caching so the same resource isn't fetched twice by two different components, and deduplicating concurrent identical requests. That's a meaningful amount of code, and it's *the same code, rewritten slightly differently*, at nearly every call site in a typical application — which is exactly the repeated, error-prone pattern a query library exists to eliminate.

### What exactly is the race condition in `useEffect`-based data fetching, and what's the actual fix?
Responses do not necessarily arrive back in the order their requests were sent. If a prop changes quickly from `id=1` to `id=2`, both requests fire, and the response for `id=1` happens to be slower — it can arrive *after* the response for `id=2` and silently overwrite the correct, current data with stale data for a component the user has already moved past. The fix belongs specifically in the effect's cleanup function, since cleanup's actual job is "undo whatever the previous effect started," and an in-flight request is part of what it started: either a `cancelled` flag checked before calling the setter, or better, an `AbortController` that genuinely cancels the request rather than merely ignoring its eventual response.

```jsx
useEffect(() => {
  let cancelled = false;
  fetchUser(id).then(u => { if (!cancelled) setUser(u); });
  return () => { cancelled = true; };
}, [id]);
```

### What makes server state a categorically different kind of state, and why does `useState` not address any of what makes it hard?
Client state is something you own — a modal's open/closed flag, a form draft — created and exclusively mutated by your own code, so it's correct by definition at any given moment. Server state is a **cache** of data that genuinely lives somewhere else and can change independently of your application, without your code ever being told. That means staleness (has this gone out of date since it arrived?), invalidation (when do I discard this and refetch?), and deduplication (are two components about to fire the same request?) are all fundamentally your problems to solve — and none of them are addressed by `useState`, which has no concept of "this value might be wrong right now" at all.

### What do React Query / SWR actually give you that hand-rolled `useEffect` fetching doesn't?
Request **deduplication**, so two components independently requesting the same resource at the same time produce exactly one network call rather than two. **Caching keyed by the request**, so navigating back to already-fetched data can render instantly from cache while a fresh copy quietly revalidates in the background (stale-while-revalidate). **Automatic background refetching** on window focus and network reconnection — which is how the UI notices a change that happened somewhere your code can't directly observe. **Retry with backoff**, and **loading/error state exposed as defaults you read**, rather than three separate `useState` calls you wire up by hand at every single call site.

### Why is putting fetched server data into Redux (or any general-purpose client store) often the wrong call?
Because you inherit a caching problem that the store was never designed to solve: when does this specific piece of data actually go stale, who's responsible for refetching after another user's edit lands, and how do two components independently requesting the same resource avoid triggering two separate network calls? A general client-state store has no built-in opinion about any of that — it's a synchronous container for state *you* own, and server data is specifically state you *don't* own. Server state belongs in something purpose-built to cache it (React Query, SWR, RTK Query); the store is then free to hold only what the client genuinely owns and controls.

---

<a name="s24"></a>
# 24. Testing

### What should you actually test in a React component, and what should you deliberately avoid testing?
Test **behavior a user can observe**: what renders for given props, what happens after a specific interaction, which callbacks actually fire and with what arguments. Deliberately avoid testing internal state values directly, private helper methods, or any other implementation detail — those change on essentially every refactor even when the component's externally-visible behavior hasn't changed at all, so tests that assert on them break constantly for no real reason and actively discourage refactoring.

### What is React Testing Library's core testing principle, and why does it make tests more durable?
Query the rendered DOM the way an actual user would — by visible text, an accessible label, or an ARIA role — rather than by CSS class name, a `data-testid` used as a first resort, or reaching into component internals. That's specifically what makes tests survive a refactor: rename a CSS class, restructure the internal markup, or swap a component's internal implementation entirely, and a test asserting "a button labelled Save exists and is enabled" keeps passing regardless, because it never depended on any of the things that changed.

### How do you test a component that fetches data, without hitting a real network?
Mock at the **network boundary**, not at the component boundary — a tool like MSW (Mock Service Worker) intercepts the actual outgoing HTTP request and returns a fixture response, so the component under test runs its genuine, real production code path (the actual fetch call, the actual state transitions) rather than a stubbed-out version of itself that might not match what really happens in production. Then assert on what eventually appears using `findBy*` queries specifically, since those wait for the async update to land rather than immediately failing before the data has resolved.

### How do you test a custom hook in isolation, without a component to render it inside?
With Testing Library's `renderHook`, which mounts the hook inside a minimal internal test component you never have to write yourself and hands back its live return value (and a way to trigger re-renders). Interactions that trigger a state update inside the hook need to be wrapped in `act(...)` so React fully flushes the resulting updates before your assertions run against the result.

### What is `act()` actually for, and when do you need to reach for it explicitly?
It tells React: "I'm about to trigger one or more updates — process all of them completely before handing control back, so nothing is left half-applied when the next line of test code runs." Testing Library already wraps the vast majority of ordinary user interactions (`fireEvent`, `userEvent`) in `act` for you automatically behind the scenes; you'll typically only need to reach for it explicitly when testing a hook directly via `renderHook` or when manually triggering a state update outside of Testing Library's own interaction helpers.

---

<a name="s25"></a>
# 25. ⭐ Scenario & Debugging

> These can't be memorized, which is exactly why they're asked.

### "An input loses focus on every keystroke. Why?"
**What's wrong:** the input's containing component is being *defined* inside another component's function body, so a brand-new function (and therefore a brand-new component *type*) is created on every single render of the outer component. **Why:** React's reconciliation rule for a changed element type is to destroy the entire old subtree and mount a fresh one from scratch — even though "the same" input conceptually appears before and after, React sees a genuinely different type at that position, and the DOM node (along with its focus) is destroyed and recreated on every keystroke. **Fix:** move the component's definition outside the parent, to module scope, so its identity stays stable across every render.

### "A list re-orders and the wrong rows now show the wrong internal state. Why?"
**What's wrong:** the list is keyed by array index. **Why:** an index describes *position*, not identity — after a reorder, whatever is now at index 0 gets index 0's key regardless of which logical item it actually is, so React reuses the DOM node (and its internal state, like a checked checkbox) that used to belong to a completely different item now sitting at that position. **Fix:** key by a stable, data-derived id instead of the array index.

### "`setCount(count + 1)` called three times only increments by one. Why?"
**What's wrong:** all three calls read `count` from the same frozen closure — the snapshot belonging to this specific render. **Why:** state is a `const` for the duration of a given render; it cannot change mid-render no matter how many times you call the setter, so all three calls compute and schedule the identical "old value plus one," and the last one scheduled simply overwrites the earlier two rather than compounding with them. **Fix:** use the functional updater form, `setCount(c => c + 1)`, which reads whatever the latest already-queued value actually is rather than the stale closed-over variable.

### "`useEffect` runs in an infinite loop. Diagnose it."
**What's wrong:** almost always one of two things — the effect sets a piece of state that's also listed in its own dependency array, or a dependency is an object/array/function literal that gets recreated fresh on every single render. **Why:** in the first case, setting the state re-runs the render, which recomputes the dependency, which re-runs the effect, forever; in the second, a literal like `{ id }` or an inline arrow function is a *new reference* every render even when its contents are identical, so `Object.is` reports "changed" every single time regardless of whether anything meaningful actually did. **Fix:** derive the value during render instead of syncing it through an effect, or stabilize the offending dependency with `useMemo`/`useCallback`.

### "A `React.memo`-wrapped component still re-renders on every parent render. Why?"
**What's wrong:** at least one prop is a new reference on every render — an inline arrow function, an inline object literal, or an array literal written directly in JSX. **Why:** `React.memo`'s comparison is shallow and by reference; `{a:1} === {a:1}` is `false` even with identical contents, so the comparison fails every time regardless of whether the underlying data actually changed, and the memoized component re-renders exactly as if it weren't memoized at all — plus the wasted cost of the failed comparison itself. **Fix:** wrap the function in `useCallback` and the object/array in `useMemo`, or restructure so the offending value isn't constructed inline at that call site at all.

### "Data on screen is stale after a prop changes. Why?"
**What's wrong:** the classic derived-state bug — a prop was copied into local state with `useState(props.value)`, and that initializer only ever runs on the component's **first** render, by design. **Why:** subsequent changes to `props.value` never reach that state variable at all, because nothing re-runs the initializer on later renders — `useState`'s argument is read exactly once, at mount. **Fix:** compute the value fresh during render instead of copying it into state, or — if a genuine, independently-editable local copy really is needed (an editable form pre-filled from a prop, say) — force a full remount by keying the component on whatever identifies "a new source value," e.g. `key={item.id}`.

### "The app freezes while typing into a search box filtering a large list. Diagnose and fix, in order."
**What's wrong:** the entire list is being filtered synchronously on every single keystroke, and that filtering work is blocking the main thread long enough that the browser can't paint the character the user just typed until the filtering finishes. **Fix, roughly in order of how much each buys you:** memoize the filtering computation with `useMemo` so it only re-runs when the underlying list or query actually changes; wrap the results-producing update in `startTransition` (or apply `useDeferredValue` to the query) so React can keep the input itself feeling instant while the expensive re-render happens in the background and gets interrupted by further typing; and virtualize the rendered list so only the currently-visible rows exist as real DOM nodes at all, which is usually the single largest win of the three.

### "Everything in the app seems to re-render whenever anything changes, anywhere. Why?"
**What's wrong:** almost always a single Context holding too much unrelated state, combined with an inline object literal as its `value` — `value={{ user, theme, cart }}`. **Why:** every consumer of a context re-renders on *any* change to that provider's value, with no built-in way to subscribe to only part of it — so a component reading only `theme` re-renders when `cart` changes elsewhere, and the inline object literal makes it worse by being a fresh reference on every single render of the provider, so even genuinely unrelated re-renders of the provider component cascade into every consumer regardless. **Fix:** split the context by concern (and specifically by update frequency), and wrap the value in `useMemo`.

### "State updates seem to work fine inside an event handler, but not inside a `setTimeout`. Why?"
**What's wrong (on React 17 and earlier specifically):** an inconsistency in when batching applied. **Why:** batching only happened *inside React's own event handlers* pre-18 — a `setState` inside a `setTimeout` callback, a raw promise `.then()`, or a native (non-React) event listener each triggered its own separate render, because those code paths never passed through React's batching wrapper, producing extra renders and sometimes visibly inconsistent intermediate states. **Fix:** React 18's automatic batching (via `createRoot`) closed this gap entirely — the exact same code now batches uniformly no matter where the `setState` call physically originates.

### "Why does my component render twice in development, but not in production?"
**What's wrong:** nothing — this is expected, deliberate behavior, not a bug to work around. **Why:** React 18 Strict Mode intentionally double-invokes components and effects in development specifically to surface impurity and missing effect cleanup before either reaches production, where the same underlying bug would instead show up intermittently and be far harder to reproduce and diagnose. **What to actually do about it:** if the double-invocation causes a *visibly broken* result — two subscriptions instead of one, two network requests firing instead of one — that indicates a genuine bug (usually missing or incorrect effect cleanup) that would also eventually surface in production whenever that effect happens to re-run for a real reason; the fix is proper cleanup, never suppressing the double-invocation itself with a `useRef` "has already run" flag, which hides the diagnostic without addressing the actual defect.

---

## Before an interview

```
1. Cover the answers. Say yours ALOUD. Section 25 first — least memorisable.
2. Stumble on one → open the linked Part, reread that section only.
3. Highest yield: 4 (reconciliation), 8 (Fiber), 17 (internals), 20 (the whys), 25 (scenarios).
4. Then build something. Notes stop helping before an interview does.
```

*— End of question bank —*
