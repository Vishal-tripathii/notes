# ⚛️ React Interview Question Bank — Answered

> **How to use:** cover the answer, say yours out loud, then compare. Speaking finds gaps that reading hides.
>
> Answers are the *spoken* version, not the essay. Sections link to the note that explains them properly.
>
> **~205 questions · 25 sections**

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
| 14 | [Forms](#s14) | — |
| 15 | [Routing](#s15) | — |
| 16 | [Build System](#s16) | — |
| 17 | [React Internals](#s17) ⭐ | [Part 08](08-rendering-internals-and-vdom.md) |
| 18 | [React 18+](#s18) | [Part 12](12-async-javascript.md) |
| 19 | [State Management](#s19) | [Part 11](11-state-management.md) |
| 20 | [Senior "Why" Questions](#s20) ⭐ | — |
| 21 | [Custom Hooks](#s21) | [Part 07](07-hooks.md) |
| 22 | [Error Handling](#s22) | [Part 06](06-lifecycle.md) |
| 23 | [Data Fetching & Server State](#s23) | [Part 12](12-async-javascript.md) |
| 24 | [Testing](#s24) | — |
| 25 | [Scenario & Debugging](#s25) ⭐ | — |

> Sections 13–16, 20, 24 and 25 aren't covered by the notes in this folder — the answers here are self-contained.

---

<a name="s1"></a>
# 1. React Architecture

### What is React?
A JavaScript library for building user interfaces out of components. You describe what the UI should look like for a given state, and React works out how to update the DOM to match.

### Why was React created?
Facebook had UIs where many places displayed the same data, and keeping them in sync by hand-editing the DOM was error-prone. React's answer was to stop editing and start *describing* — re-describe the whole UI on every change and let the library figure out the minimal DOM update.

### What problems does React solve?
Keeping the DOM in sync with data, without you tracking which parts need changing. Plus composition — building complex UI from small, reusable, independently testable pieces.

### What is declarative programming?
You describe the desired result, not the steps to get there.
Imperative is giving a taxi driver turn-by-turn directions. Declarative is naming the destination.
In React you write "when logged in, show the dashboard", not "find the div, remove the login form, insert the dashboard".

### Why is React called a library instead of a framework?
Because it only does rendering. Routing, state management, data fetching, forms and build tooling are all your choice. A framework brings those with it and dictates structure; React deliberately doesn't.

### How does React differ from Angular?
React is a rendering library; Angular is a full framework shipping routing, HTTP, forms and dependency injection, versioned together. React re-renders and diffs a virtual DOM; Angular checks bindings and updates the DOM directly. Angular has real DI and RxJS built in; React has neither. The trade is flexibility versus consistency.

### What is ReactDOM?
The renderer that connects React to the browser DOM. React itself is platform-agnostic — it produces a description of UI, and a renderer turns it into something real. `react-dom` does browsers, `react-native` does mobile.

### What happens when `createRoot()` is called?
It creates a root container tied to a DOM node and enables React 18's concurrent features. Nothing renders yet — `root.render(<App />)` starts the first render, which builds the fiber tree and commits it to the DOM.

### How does React bootstrap an application?
`createRoot(document.getElementById('root'))` creates the root, then `render(<App/>)` triggers the initial render. React builds a fiber tree describing the whole UI, then in the commit phase creates the actual DOM nodes and inserts them.

### What is the render tree?
The tree of components actually rendered for the current state — which can differ from your file structure, since conditional rendering means a component may or may not appear. React's fiber tree is the internal representation of it.

---

<a name="s2"></a>
# 2. JSX

### What is JSX?
A syntax extension that lets you write markup inside JavaScript. It's not part of the language — a compiler turns it into ordinary function calls.

### Is JSX HTML?
No. It looks like HTML deliberately, but it's JavaScript. Hence `className` instead of `class`, `onClick` instead of `onclick`, camelCase attributes, and self-closing tags being mandatory.

### How is JSX converted into JavaScript?
A compiler (Babel, SWC, esbuild) transforms each element into a function call:

```jsx
<h1 className="title">Hello</h1>
// becomes roughly:
jsx('h1', { className: 'title', children: 'Hello' })
```

### What does Babel generate?
Calls to the JSX runtime — modern React uses `jsx()`/`jsxs()` from `react/jsx-runtime`, which is why you no longer need to import React in every file. Older versions generated `React.createElement()`, which is why you did.

### Why can JSX return only one root element?
Because each JSX element becomes one function call returning one object. Two siblings would mean returning two values, which JavaScript can't do. A fragment (`<>…</>`) solves it by giving them a parent that renders nothing.

### Why do components start with uppercase letters?
Because that's how the compiler distinguishes them. Lowercase becomes a string — `jsx('div', …)` — meaning a real DOM element. Uppercase becomes a variable reference — `jsx(MyComponent, …)`. Write `<myComponent />` and React looks for an HTML tag called "mycomponent".

### Why use `className` instead of `class`?
Because JSX compiles to JavaScript objects, and `class` is a reserved word. Same reason `for` becomes `htmlFor`.

### Can React work without JSX?
Yes — JSX is entirely optional sugar. You can call `createElement` directly. Nobody does, because nested calls become unreadable fast.

### How are JSX expressions evaluated?
Anything in `{}` is evaluated as a JavaScript expression at render time and its result is inserted. Note *expression*, not statement — you can use a ternary or `&&`, but not an `if` or a `for` loop.
⚠️ `{count && <List/>}` renders a literal `0` when count is zero, because `0` is falsy but still renderable. Use `count > 0 &&`.

---

<a name="s3"></a>
# 3. Components

### What is a React component?
A function that takes props and returns a description of UI. That's it — it's not a class instance or a DOM node, just a function React calls.

### Function vs Class components
Classes were the only way to hold state and lifecycle before hooks. Function components with hooks do everything classes do, with less boilerplate, no `this` confusion, and logic that's reusable across components. Classes still work but nothing new is built with them.

### Why are hooks only supported in function components?
Because hooks rely on React knowing which component is currently rendering, and calling them in a fixed order each time. Classes already have their own state mechanism (`this.state`) and lifecycle methods, so there was nothing to hook into — hooks were designed as the function-component equivalent.

### What happens when a component renders?
React calls your function with the current props, and you return a description of the UI. React compares that description with the previous one and works out the minimal DOM changes. Rendering is just calling a function — it doesn't necessarily touch the DOM at all.

### Is a component recreated every render?
The *function is called again* every render, so all local variables and functions inside it are recreated. But the component's identity and its state persist, because React stores state on the fiber, not in the function. That's the whole reason `useState` exists.

### Why should components be pure?
Because React may call your function more than once for a single update, may discard the result, and in Strict Mode deliberately double-invokes it in development. If rendering has side effects — mutating a variable, writing to the DOM, firing a request — those happen unpredictably. Render should only compute; effects belong in `useEffect`.

### What makes a component re-render?
Three things: its own state changed, its parent re-rendered, or a context it consumes changed. Note that props changing is not separately a cause — props change *because* the parent re-rendered.

### Can a parent re-render without the child re-rendering?
Yes, two ways. Wrap the child in `React.memo`, so it skips re-rendering when its props are shallow-equal. Or pass the child through as `children` — the element object is created by the grandparent, so its identity doesn't change when the middle component re-renders.

---

<a name="s4"></a>
# 4. Rendering & Reconciliation

### What is rendering?
React calling your component function to get a description of the UI. It does **not** mean touching the DOM — that's the commit phase, and it only happens where something actually differs.

### What triggers a render?
A state update, a parent re-rendering, or a context value change. Also the initial mount.

### What is reconciliation?
The algorithm that compares the new element tree with the previous one to decide what changed. It's the "work out the minimal DOM update" step.

### What is the Virtual DOM?
A lightweight JavaScript description of what the UI should look like — plain objects, not DOM nodes. React keeps the previous description, compares it with the new one, and applies only the differences.
It's like a blueprint before renovating a house: comparing two drawings is cheap, knocking down walls is not.

### Why does React use a Virtual DOM?
Because DOM operations are expensive and easy to do redundantly by hand. The VDOM lets you write "re-render everything on every change" — which is simple to reason about — while React quietly reduces that to a handful of real DOM edits.

### Does React update the whole DOM?
No. It re-runs your components and rebuilds the description, but only the DOM nodes whose output actually changed are touched.

### What is diffing?
The comparison step inside reconciliation: walking the two trees and marking what changed, was added, or was removed.

### How does React compare two trees?
With two heuristics that make it fast rather than perfect:
**Different element type → throw the subtree away** and rebuild. A `<div>` becoming a `<span>` isn't diffed, it's replaced.
**Same type → keep the node**, update the changed attributes, and recurse into children.
For lists, children are matched by **key**.

### Why are keys important?
Because without them, React matches list children by position. Insert an item at the top and every subsequent item looks "changed", so React updates them all — and any component state (an input's text, an open/closed toggle) ends up attached to the wrong item.
Keys are name tags: they let React tell that a student moved seats rather than assuming a different student sat down.

### What happens if keys change?
React treats it as a different element — it unmounts the old component and mounts a new one, destroying its state. That's a bug when done accidentally (e.g. `key={Math.random()}`), and a useful technique when done deliberately to reset a component.

---

<a name="s5"></a>
# 5. State

### What is state?
Data owned by a component that persists across renders and, when changed, causes a re-render.

### Why can't we modify state directly?
Two reasons. React wouldn't know it happened — nothing schedules a re-render. And React compares by reference to decide what changed, so mutating an object leaves the reference identical and optimisations like `memo` conclude nothing changed.

### Why is state immutable?
Because comparison becomes cheap. Checking `prev !== next` is one operation regardless of data size; deep-comparing objects is proportional to their size and often costs more than just re-rendering. Immutability is what makes shallow comparison a valid strategy.

### Why does `setState()` exist?
It's the notification channel. Assigning to a variable is invisible to React; calling the setter tells React "this component's state changed, schedule a re-render".

### Is `setState()` synchronous?
No — it schedules an update. The variable in your current scope keeps its old value until the next render.
It's putting a letter in the outbox: it's queued, not delivered.

```jsx
setCount(count + 1);
console.log(count);   // still the OLD value
```

### Why are state updates batched?
So multiple updates in one event produce one re-render instead of several. Three `setState` calls in a click handler shouldn't cause three renders — it's wasteful and can show intermediate states.
Batching is doing all your errands in one trip.

### What happens if you call `setState()` multiple times?
If you pass values, later calls overwrite earlier ones because they all read the same stale variable — `setCount(count+1)` three times increments by one. Pass an updater function instead: `setCount(c => c + 1)` queues three separate transformations and increments by three.

### Why does React sometimes delay updates?
Because of batching, and in React 18 because of prioritisation — a `startTransition` update is marked as non-urgent, so React can pause it to keep typing responsive and finish it afterwards.

---

<a name="s6"></a>
# 6. Hooks

### Why were Hooks introduced?
To give function components state and lifecycle, and — more importantly — to make **stateful logic reusable**. Before hooks, sharing logic meant HOCs or render props, which produced deeply nested "wrapper hell" and made data flow hard to trace.

### What problems did they solve?
Wrapper hell from HOCs and render props; related logic split across `componentDidMount`/`componentDidUpdate`/`componentWillUnmount`; the confusion of `this` in classes; and code sharing being possible only by changing the component hierarchy.

### Why can Hooks only be called at the top level?
Because React identifies hooks by **call order**, not by name. It stores them in a list on the fiber, and matches them positionally on every render. A hook inside an `if` or a loop changes that order between renders, so React hands the wrong stored value to the wrong hook.

### How does React remember hook state?
Each fiber has a linked list of hook objects. On the first render React appends one per hook call; on later renders it walks the list in the same order, returning each stored value. State lives on the fiber, not in your function — which is why it survives the function being called again.

### Why is hook order important?
Because that's the only identity a hook has.
Numbered lockers, not named ones: React opens locker 1, then 2, then 3. Skip one and everything after it is off by one.

### What happens internally when `useState()` runs?
On mount, React creates a hook object holding the initial value and a dispatch function, appends it to the fiber's list, and returns `[value, dispatch]`. On update, it reads the next hook in the list, applies any queued updates, and returns the new value with the same dispatch — which is why the setter is stable across renders.

### Why does `useRef()` not trigger renders?
Because it's just a plain mutable object (`{ current: … }`) that React hands back unchanged each render. There's no setter and no subscription, so mutating `.current` is invisible to React.
A sticky note on the fridge: you can change it, and nobody redecorates the kitchen.

### When should `useMemo()` be used?
For an expensive computation you don't want repeated on every render, or to keep an object/array reference stable when it's passed to a memoised child or used as a hook dependency. Not by default — it has its own cost, and most computations are cheaper than the bookkeeping.

### When should `useCallback()` be used?
When a function is passed to a `React.memo` child or used in a dependency array, and you need its identity stable. Without it, the function is recreated every render and the memo comparison always fails. `useCallback(fn, deps)` is exactly `useMemo(() => fn, deps)`.

### Why does `useReducer()` exist?
For state with several related fields or transitions that depend on the previous state. It moves the update logic out of the component into a pure function you can test independently — and the reducer is stable, so it never needs to be a dependency.

---

<a name="s7"></a>
# 7. useEffect

### What is `useEffect()`?
The escape hatch for synchronising a component with something outside React — a subscription, a timer, a network request, the document title.

### Why is it called a side effect?
Because it's an effect *beyond* the function's return value. Rendering should be pure: same props, same output, no observable consequences. Anything with a consequence — writing to the DOM, firing a request, setting a timer — is a side effect and belongs here.

### When does `useEffect()` execute?
After React has committed changes to the DOM **and the browser has painted**. It's asynchronous and non-blocking.

### Why does it execute after rendering?
So it can't block the visual update. The user sees the new screen first; the effect runs after. If effects ran during render they'd delay paint, and render must be pure anyway.

### What is the dependency array?
The list of values the effect reads. React compares each against the previous render with `Object.is`; if any differ, it runs cleanup and then the effect again.
`[]` means "only on mount". No array at all means "after every render".

### What happens when dependencies change?
React runs the **previous** effect's cleanup, then the new effect. Not just on unmount — on every dependency change.

### Why should cleanup functions exist?
Because anything an effect starts, it must be able to stop. A subscription, timer or listener left running after the component is gone keeps firing and holds a reference to the component, so it can't be garbage collected.

### When does cleanup execute?
Before the effect re-runs, and once more on unmount.

### Why shouldn't data be derived inside `useEffect()`?
Because it creates a second source of truth and an extra render. Computing `fullName` in an effect and storing it in state means the screen briefly shows stale data, and the two values can drift. Derive during render instead — it's just a variable, and `useMemo` if it's expensive.

### Difference between `useEffect()` and `useLayoutEffect()`
`useEffect` runs **after** paint, asynchronously. `useLayoutEffect` runs after DOM mutations but **before** paint, synchronously — so it blocks the browser from painting.
Use `useLayoutEffect` only when you must measure the DOM and change it before the user sees anything, such as positioning a tooltip. Otherwise it's a performance cost for nothing.

---

<a name="s8"></a>
# 8. React Fiber

### What is Fiber?
The rewrite of React's reconciler, shipped in React 16. A "fiber" is a plain JavaScript object representing one unit of work — one component instance — holding its type, props, state, and pointers to its child, sibling and parent.

### Why was Fiber introduced?
Because the old reconciler was recursive, and recursion can't be paused. Rendering a large tree occupied the main thread until it finished, so animations stuttered and typing lagged. Fiber replaced recursion with a linked-list walk React controls, which means it can stop partway through.

### How does Fiber improve rendering?
By making work **interruptible and resumable**. React does a chunk of work, checks whether the browser needs the main thread, and yields if so — picking up where it left off afterwards.
The old model was reading a book cover to cover without putting it down. Fiber is a stack of index cards you can set aside and return to.

### What is interruptible rendering?
React pausing mid-render to let higher-priority work — a click, a keystroke — happen first, then resuming or discarding the paused work.

### What is concurrent rendering?
React preparing multiple versions of the UI at the same time without blocking the main thread. It's not multithreading — it's the ability to start rendering, abandon it if something more urgent arrives, and never show a half-finished tree.

### What is scheduling?
Deciding *when* and *in what order* work runs. React assigns each update a priority (or "lane") and processes urgent ones first, yielding to the browser between chunks.

### How does React prioritize updates?
Discrete user input like clicks and typing is urgent and rendered synchronously. Updates wrapped in `startTransition` are non-urgent and can be interrupted or delayed. Offscreen and background work is lower still.

### What are render and commit phases?
**Render phase** — call components, build the work-in-progress fiber tree, diff. Interruptible, can be discarded, may run more than once. Must be pure.
**Commit phase** — apply the changes to the DOM, run refs and layout effects. Synchronous, cannot be interrupted, runs exactly once.

### Why are they separated?
Because interruption is only safe if the work has no visible consequences. Everything that can be thrown away is in the render phase; everything that changes what the user sees is quarantined in the commit phase and runs in one uninterruptible pass. Without that split, a paused render could leave the DOM half-updated.

---

<a name="s9"></a>
# 9. Props

### What are props?
The inputs to a component — data passed down from the parent. Together with state, they determine what the component renders.

### Why are props read-only?
Because the parent owns them. If a child could change its props, the same data would have two owners and neither could be trusted. React's contract is that a component is a pure function of props and state — mutating props breaks that.

### Why shouldn't child components modify props?
The parent won't know, won't re-render, and its own state will silently disagree with what's on screen. And since React compares by reference, mutating an object prop doesn't even reliably trigger an update.

### What is one-way data flow?
Data goes down through props; changes travel up through callbacks. Because there's exactly one direction, when a value is wrong you trace it upward to a single owner — instead of hunting through every component that might have written to it.

### How do children communicate with parents?
The parent passes a callback down as a prop, and the child calls it. The child announces what happened; the parent decides what it means. That keeps the child reusable — it doesn't know whether the parent will delete a record, show a dialog, or ignore it.

### Props vs State
Props come from outside and are read-only; state is owned by the component and is changeable. Props are arguments; state is memory. If a value can be computed from props, it shouldn't be state.

### Prop drilling
Passing data through components that don't use it, purely to reach a descendant several levels down.

### When does prop drilling become a problem?
When intermediate components take props they never read, so every change to the shape of that data touches files that don't care about it. Two or three levels is usually fine; deeper than that, or when the same value is threaded through many branches, reach for context or a store. Note that "children as a prop" often removes the drilling entirely without either.

---

<a name="s10"></a>
# 10. Context

### Why was Context introduced?
To let deeply nested components read a value without every layer passing it down — theme, current user, locale.

### Does Context replace Redux?
No. Context is a **transport** mechanism — it delivers a value down the tree. Redux is **state management** — it adds a defined update pattern, middleware, devtools and selector-based subscriptions. Context plus `useReducer` covers many cases Redux used to, but the two aren't the same category.

### When should Context be used?
For values that are genuinely global and change rarely: theme, authenticated user, language, a service instance. It's a poor fit for high-frequency state.

### What causes Context consumers to re-render?
Any change to the provider's `value`, compared with `Object.is`. Every consumer re-renders — even those reading a part of the value that didn't change, and even if wrapped in `React.memo`, since context isn't a prop.

### Why can Context hurt performance?
Because it has no selector. A context holding `{ user, theme, cart }` re-renders every consumer when *any* of the three changes.
It's a radio broadcast: everyone tuned in hears everything, whether or not it's for them.
And a classic mistake is `value={{ user, setUser }}` — a fresh object every render, so consumers re-render even when nothing changed.

### How can Context be optimized?
Split one context into several so consumers subscribe only to what they need. Memoise the value object with `useMemo` so its identity is stable. Put the state and the setter in separate contexts, since components that only dispatch don't need to re-render on value changes. If you need real selector granularity, use a store library instead.

---

<a name="s11"></a>
# 11. Re-rendering

### What causes re-renders?
Own state changed, parent re-rendered, or a consumed context value changed.

### What doesn't cause re-renders?
Mutating a ref's `.current`. Mutating state or props in place. Changing a plain variable inside the component. Anything React isn't told about.

### Parent re-render vs child re-render
By default a parent re-rendering re-renders all its children, regardless of whether their props changed — React doesn't check unless you ask it to with `React.memo`.

### Why does `React.memo()` exist?
To skip re-rendering a component when its props are shallow-equal to last time. It's the opt-in that turns "re-render because my parent did" into "re-render only if my inputs changed".

### When should `React.memo()` be avoided?
When the component is cheap to render — the comparison can cost more than the render. When its props change on nearly every render anyway, so the check always fails. And especially when props include inline objects, arrays or arrow functions, which are new references every time and make `memo` useless while still costing you the comparison.

### Why does changing an object reference trigger renders?
Because React compares with `Object.is` — reference equality for objects. `{a:1}` and `{a:1}` are different references, so they're treated as different. That's what makes inline props defeat `memo`.

### Shallow comparison vs deep comparison
Shallow compares each prop one level with `Object.is` — cost proportional to the *number of props*. Deep compares recursively — cost proportional to the *size of the data*. React chose shallow because it's predictable and cheap, and because immutable updates make it correct.

---

<a name="s12"></a>
# 12. Performance

### What is memoization?
Caching a result so it isn't recomputed when the inputs haven't changed. React exposes it in three places: `useMemo` for values, `useCallback` for functions, `React.memo` for whole components.

### `useMemo` vs `useCallback`
`useMemo` caches the **result** of calling a function. `useCallback` caches the **function itself**. `useCallback(fn, deps)` is literally `useMemo(() => fn, deps)`.

### `React.memo` vs `useMemo`
`React.memo` wraps a component and skips its re-render when props are shallow-equal. `useMemo` caches a value inside a component. Different scopes: one prevents a component running, the other prevents a computation running.

### Lazy loading
Deferring a component's code until it's needed, with `React.lazy(() => import('./Heavy'))` and a `<Suspense>` boundary for the fallback.

### Code splitting
Breaking the bundle into chunks that load independently, usually at dynamic `import()` boundaries — commonly per route.

### Suspense
A boundary that shows a fallback while something below it isn't ready. Originally for lazy-loaded components; now also for data fetching in frameworks that support it, and for streaming SSR.

### Why are stable keys important?
Because keys are how React identifies list items across renders. An unstable key — an array index in a reorderable list, or `Math.random()` — makes React unmount and remount components, destroying their state and doing far more DOM work than necessary.

### Windowing / virtualization
Rendering only the rows visible in the viewport plus a small buffer, recycling them as the user scrolls. Turns 10,000 DOM nodes into about 20. Necessary for long lists no matter how much you memoise.

### Why shouldn't expensive functions execute inside JSX?
Because JSX is evaluated on every render, so the function runs every time regardless of whether its inputs changed. Hoist it into a `useMemo` so it recalculates only when its dependencies do.

---

<a name="s13"></a>
# 13. Event System

### How does React handle events?
It doesn't attach a listener to each element. It attaches a small number of listeners at the **root container** and uses event delegation, mapping native events back to the components that should handle them.

### What are Synthetic Events?
React's wrapper around the native browser event, giving one consistent API across browsers. It has the same interface — `preventDefault`, `stopPropagation`, `target` — and `e.nativeEvent` gives you the real one.

### Why doesn't React attach listeners to every element?
Memory and speed. A list of a thousand rows with an onClick each would mean a thousand listeners to attach and detach. One delegated listener at the root handles them all, and adding or removing rows costs nothing extra.

### Event delegation
Listening on a common ancestor and using the event's target to work out which descendant it came from — relying on events bubbling up the tree.

### Bubbling vs Capturing
Bubbling travels from the target upward to the root; capturing travels root-downward to the target. React supports both — `onClick` is bubble phase, `onClickCapture` is capture phase.

### Why does React normalize events?
Because browsers historically disagreed about event names, properties and behaviour. Synthetic events give one predictable shape, so you write the handler once. (Note: event pooling, where the event object was reused and nulled out, was removed in React 17 — old tutorials mentioning `e.persist()` are out of date.)

---

<a name="s14"></a>
# 14. Forms

### Controlled vs uncontrolled components
**Controlled** — React state is the source of truth; the input's value comes from state and every keystroke goes through a change handler. **Uncontrolled** — the DOM holds the value and you read it when you need it, usually with a ref.

### Why use controlled inputs?
Because the value is in React, so you can validate as they type, conditionally disable a submit button, format input, or drive one field from another. With an uncontrolled input the value is only knowable at the moment you read it.

### `useRef` vs `useState` for form values
`useState` re-renders on every keystroke — necessary if the UI reacts to the value as it's typed. `useRef` doesn't re-render at all, so it's cheaper for a large form where you only care about the value at submit time.

### Form validation
Validate on submit at minimum, and on blur for per-field feedback. Validating on every keystroke shows an error before the user has finished typing, which reads as hostile. In practice most teams use a library — React Hook Form is popular precisely because it uses uncontrolled inputs to avoid re-rendering the whole form on every keystroke.

### Performance implications
A controlled form re-renders the component on every keystroke. For a handful of inputs that's irrelevant; for a form with fifty fields it's noticeable. The fixes are isolating each field into its own component, or using uncontrolled inputs with refs.

---

<a name="s15"></a>
# 15. Routing

### How does React Router work?
It listens to the browser's History API, matches the current URL against your route definitions, and renders the matching component. No server request is involved — it's rendering different components for different URLs.

### Client-side routing vs server-side routing
Server-side: every navigation is a request, the server returns a full HTML page, the browser replaces everything. Client-side: JavaScript intercepts the navigation, updates the URL with `pushState`, and swaps components — no reload, so in-memory state survives and transitions are instant. The cost is a slower first load and needing the server to serve `index.html` for every path.

### `BrowserRouter` vs `HashRouter`
`BrowserRouter` uses clean URLs (`/employees/42`) via the History API, but requires the server to return your app for any path. `HashRouter` puts the route after a `#`, which the server never sees, so it works on static hosts with no configuration — at the cost of uglier URLs and worse SEO.

### Nested routes
Routes rendered inside a parent route's component, via an `<Outlet />`. Gives you a persistent layout — sidebar and header stay mounted while the inner area changes.

### Route parameters
Dynamic segments like `/employees/:id`, read with `useParams()`. Distinct from query parameters (`?page=2`, read with `useSearchParams`), which modify the view rather than identifying the resource.

### Protected routes
A wrapper component that checks auth state and either renders its children or redirects to login, usually preserving the attempted URL so you can return there afterwards. Note this is UX, not security — the server must still authorize every request.

### Lazy loaded routes
`React.lazy` plus a dynamic `import()` at the route level, wrapped in `<Suspense>`. The route's code downloads on first visit rather than sitting in the initial bundle — the highest-leverage bundle-size fix in most apps.

---

<a name="s16"></a>
# 16. Build System

### What happens when you run `npm run build`?
Your tool compiles JSX and TypeScript to JavaScript, resolves every import into a dependency graph, bundles it into chunks, then optimises — tree shaking, minification, dead code elimination — and writes hashed files to `dist/` for cache busting.

### What is Vite?
A build tool with two modes: in development it serves your source as native ES modules with no bundling; for production it bundles with Rollup.

### Why is Vite faster than CRA?
Because it doesn't bundle in development. Create React App used webpack, which had to build your entire app before the dev server could serve anything — so startup time grew with project size. Vite serves modules on demand, so the browser requests only the files for the page you're on, and startup is roughly constant regardless of project size. Dependencies are pre-bundled once with esbuild.

### What is esbuild?
A bundler and transpiler written in Go, running highly parallel — often 10–100× faster than JavaScript-based tools. Vite uses it for dependency pre-bundling and transpilation.

### What is Rollup?
A JavaScript bundler with excellent tree shaking and clean output, used for Vite's production builds. Historically favoured for libraries, where output size and shape matter most.

### What is tree shaking?
Removing exported code that nothing imports. It works because ES modules are statically analysable — the bundler can prove a function is never referenced and drop it.
Like unpacking a suitcase and taking only what you'll actually wear.

### What is code splitting?
Breaking one bundle into several chunks that load independently, so the browser downloads only what the current page needs.

### What are chunks?
The individual output files a bundler produces — typically a main chunk, a vendor chunk for dependencies, and one per lazy-loaded route or component.

### What is Hot Module Replacement (HMR)?
Swapping a changed module into the running app without a full page reload, preserving component state. Edit a component and the change appears while your form stays filled in.

### What is bundling?
Following every import from your entry point to build a dependency graph, then combining those modules into files the browser can load efficiently — historically necessary because one request per module was too slow.

---

<a name="s17"></a>
# 17. ⭐ React Internals

### How does React know which component to update?
Every component instance has a fiber node, positioned in the tree. When you call a setter, React marks that fiber as having pending work and schedules a render from the root, walking down to the fibers that need re-rendering. Identity comes from position in the tree plus type — and for lists, the key.

### How does React store hook state?
On the fiber, as a **linked list of hook objects**. Each holds its own value and a queue of pending updates. The fiber points at the first hook; each hook points to the next.

### Why is hook order important?
Because React matches hooks by position in that list, not by name — it has no idea your first `useState` is called `count`. If a conditional changes how many hooks run, every hook after it lines up with the wrong stored object.

### How does React know which `useState()` belongs to which variable?
It doesn't. There's no name anywhere. It relies entirely on the calls happening in the same order every render, so the first call gets the first hook object, the second gets the second, and so on. The variable name is yours alone — React never sees it.

### How does reconciliation work?
React builds a new work-in-progress fiber tree from the current one, comparing each node with its previous version. Same type → reuse the node and update props; different type → discard the subtree and rebuild. Children are matched by key when present, by position otherwise. Nodes needing DOM changes get flagged, and the commit phase applies those flags.

### How are Fibers linked together?
Three pointers, not an array of children: `child` (first child), `sibling` (next child at the same level), and `return` (parent). That structure is what makes the tree walkable with a loop instead of recursion — and therefore pausable.

### What is a Fiber node?
A plain object representing one unit of work: the component type, its props, its state, its hook list, the effect flags, a pointer to the corresponding DOM node, and the three tree pointers. There's one per component instance, and React keeps two trees — current and work-in-progress — swapping them on commit.

### How does React schedule updates?
Each update gets a priority lane based on its origin — discrete input like a click is urgent, a `startTransition` update is not. React processes urgent lanes first, works in small chunks, and checks between chunks whether the browser needs the main thread.

### Why are renders sometimes interrupted?
Because something more urgent arrived. If you're typing while React renders an expensive filtered list, React abandons or pauses that render so the keystroke appears immediately, then resumes. The interrupted work is safe to discard because the render phase hasn't touched the DOM.

### What is the commit phase?
The step where React applies the computed changes to the real DOM, attaches refs, and runs effects — layout effects synchronously before paint, passive effects after. It's synchronous and uninterruptible, because the DOM must never be left half-updated.

---

<a name="s18"></a>
# 18. React 18+

### What is Concurrent Rendering?
React's ability to prepare a UI update without blocking the main thread — pausing, resuming, or abandoning a render as priorities change. It's not a feature you turn on; it's a capability that features like transitions and Suspense build on.

### What is automatic batching?
React 18 batches **all** state updates into one re-render, wherever they occur. Before 18, only updates inside React event handlers were batched — updates inside a `setTimeout`, a promise callback or a native event handler each caused their own render.

### What is `startTransition()`?
A way to mark an update as non-urgent. React keeps the old UI interactive while it renders the new one in the background, and will interrupt that work if something urgent arrives.

```jsx
setQuery(value);                            // urgent — the input must update now
startTransition(() => setResults(filter(value)));   // can wait
```

### What is `useTransition()`?
The hook version, which also gives you an `isPending` flag so you can show a subtle loading indicator while the non-urgent update is in flight.

### What is `useDeferredValue()`?
It gives you a lagging copy of a value. The urgent parts of the UI use the fresh value; the expensive parts use the deferred one, which updates when React has time. Same goal as `startTransition`, but for when you receive a value as a prop rather than owning the setter.

### What is Suspense?
A boundary that shows a fallback while a component below it isn't ready — code still downloading, or data still loading in a framework that supports it. It moves loading states out of every individual component and into the tree structure.

### What is streaming SSR?
The server sends HTML in pieces as it becomes ready, rather than waiting for the whole page. The shell arrives immediately while slower sections stream in behind their Suspense boundaries — so a slow database query no longer delays the entire page.

### What is hydration?
Attaching React to server-rendered HTML — adding event listeners and building the fiber tree over existing markup, rather than recreating it. It's what turns a static server-rendered page into an interactive one.

### What is selective hydration?
Hydrating parts of the page independently and out of order, prioritised by what the user interacts with. Click a component that hasn't hydrated yet and React hydrates that one first. Previously, hydration was all-or-nothing — one slow section blocked interactivity everywhere.

---

<a name="s19"></a>
# 19. State Management

### Why isn't Context enough?
Because it has no selector granularity. Every consumer re-renders when the provider's value changes, even if it reads only an unchanged part of it. It also has no update pattern, no middleware and no devtools. Fine for theme or user; painful for frequently-changing shared state.

### Redux vs Zustand vs MobX vs Recoil vs Jotai
**Redux (with Toolkit)** — one store, actions and reducers, excellent devtools and time travel. Verbose, but predictable at scale.
**Zustand** — a hook-shaped store with selector subscriptions and almost no boilerplate. The common default for new projects.
**MobX** — observable state with automatic dependency tracking; you mutate directly and it works. Different mental model, less explicit.
**Recoil / Jotai** — atomic state: many small independent pieces composed together, so only components reading a given atom re-render. Jotai is the smaller, actively-favoured one.

### Why does Redux require immutability?
So change detection is a reference comparison. `prev !== next` is one operation regardless of state size, which is what makes selectors and `connect`/`useSelector` cheap. It also enables time-travel debugging, since every past state still exists.

### Why are reducers pure?
Because the same state and action must always produce the same result. That makes them trivially testable, makes replaying actions deterministic, and is what time-travel debugging depends on.

### What is middleware?
A hook in the dispatch pipeline — code that sees every action before it reaches the reducer. It's where async and side effects live: thunk for functions, saga for generator-based flows, plus logging and analytics.

### What is Redux Toolkit?
The official, opinionated Redux package. It bundles Immer (so you write mutating-looking code that produces immutable updates), thunk, and devtools, and replaces hand-written action types and creators with `createSlice`.

### Why was Redux Toolkit introduced?
Because classic Redux required enormous boilerplate — action type constants, action creators, switch-statement reducers, manual spread operators — spread across several files per feature. RTK collapses that into one `createSlice` call, which removed most of the "Redux is too verbose" objection.

---

<a name="s20"></a>
# 20. ⭐ Senior "Why" Questions

### Why does React use a Virtual DOM instead of updating the DOM directly?
Not because the VDOM is faster than the DOM — a hand-written minimal DOM update always wins. It's because writing those minimal updates by hand, correctly, for every possible state change is where bugs come from. The VDOM buys you a simpler programming model: describe the whole UI for the current state, and let React reduce that to the minimum. You trade a little performance for a lot of correctness.

### Why is immutability important?
Because it makes change detection O(1). If data is never mutated, a changed value always means a changed reference, so `prev !== next` is a complete answer. Mutate, and reference comparison lies — which is what breaks `memo`, `useMemo` and dependency arrays.

### Why are keys necessary?
Because React needs to know *identity* across renders, and position is not identity. Without keys, inserting an item at the top makes every item look changed — so React updates them all, and component state ends up attached to the wrong rows.

### Why are Hooks order-dependent?
Because that's their only identity. React stores hook state in a positional list on the fiber and has no access to your variable names. Consistent call order is what lets React match the right stored value to the right hook.

### Why do refs not trigger re-renders?
Because a ref is deliberately outside React's data flow — a plain mutable object React hands back untouched. There's no setter to notify anything. That's the point: it's for values that shouldn't drive rendering, like a DOM node, a timer id, or a previous value.

### Why does `setState()` not update immediately?
Because it schedules work rather than doing it. That allows batching, so multiple updates in one event cause one render, and prioritisation, so React can defer non-urgent work. It also keeps each render's state a consistent snapshot — the value can't change halfway through your function.

### Why are effects executed after painting?
So they never delay what the user sees. React commits the DOM, the browser paints, then effects run. If they ran before paint, every subscription and fetch would push back the visual update. `useLayoutEffect` exists for the rare case where you *must* run before paint.

### Why is reconciliation O(n) instead of O(n³)?
Because a general algorithm for the minimum edit distance between two trees is O(n³), which is unusable for a UI. React swaps optimality for two heuristics: different element types mean the subtree is replaced rather than diffed, and keys give list children stable identity. Those assumptions hold almost always in real UIs and collapse the cost to a single linear pass.

### Why was Fiber introduced?
Because the old recursive reconciler couldn't be paused. A large render blocked the main thread until it finished, so animations froze and input lagged. Fiber turned the tree into a linked structure React walks with a loop, so it can yield to the browser and resume — which is what everything concurrent is built on.

### Why is React declarative?
Because the imperative alternative doesn't scale. With direct DOM manipulation, every new piece of state multiplies the transitions you must handle by hand, and a missed one leaves the UI inconsistent. Declaring the output for a given state means there are no transitions to write — React derives them.

### Why should components be pure?
Because React reserves the right to call your function more than once, to discard the result, and to interrupt it. In Strict Mode it double-invokes deliberately to expose impurity. If rendering has side effects, they'll happen an unpredictable number of times.

### Why does React discourage derived state?
Because it duplicates the source of truth. Copying a prop into state means two values that must be kept in sync, and they will drift — the classic symptom being a component that shows stale data after its props change. Compute it during render instead; that's just a variable, and it can never be out of date.

### Why does Context re-render consumers?
Because it's a subscription with no selector. React tracks which components read the context and re-renders all of them when the provider's value changes by `Object.is`. It can't know which part of the value each consumer cares about — so a store library with selectors is the answer when granularity matters.

### Why does React use shallow comparison?
Because deep comparison costs in proportion to your data's size and would frequently be more expensive than just re-rendering. Shallow comparison is bounded by the number of props and is completely predictable. It's only *correct* because immutable updates guarantee that changed data means a changed reference — which is why the two rules always appear together.

---

<a name="s21"></a>
# 21. Custom Hooks

### What is a custom hook?
A function starting with `use` that calls other hooks. It's not a React feature — just a convention that lets you extract stateful logic from a component and reuse it.

### What problem do custom hooks solve that HOCs didn't?
HOCs and render props shared logic by **wrapping components**, which nested the tree ("wrapper hell"), made it unclear where a prop came from, and caused name collisions when composing several. A custom hook shares logic without touching the hierarchy — you call it, and the tree is unchanged.

### Do two components using the same custom hook share state?
No. Each call gets its own independent state. A custom hook shares *logic*, not *values* — that's what context or a store is for. This is the single most common misconception about them.

### What are the rules for custom hooks?
The same as any hook: call them at the top level, and only from components or other hooks. The `use` prefix isn't decoration — it's how the linter knows to enforce those rules.

### When should you extract one?
When the same stateful pattern appears in more than one component, or when a component has so much logic that reading it obscures what it renders. Common examples: `useDebounce`, `useLocalStorage`, `useFetch`, `useMediaQuery`, `usePrevious`.

---

<a name="s22"></a>
# 22. Error Handling

### What is an error boundary?
A component that catches JavaScript errors thrown anywhere in its child tree during rendering, and shows a fallback UI instead of the tree unmounting.

### Why must error boundaries be class components?
Because the lifecycle methods they rely on — `getDerivedStateFromError` and `componentDidCatch` — have no hook equivalent. It's the one remaining reason to write a class, and most teams use a library like `react-error-boundary` rather than writing one.

### What don't error boundaries catch?
Errors in event handlers, in async code (`setTimeout`, promises), during server-side rendering, and errors thrown in the boundary itself. Boundaries only catch errors thrown during **rendering**, in lifecycle methods, and in constructors.

### How do you handle errors in event handlers then?
An ordinary `try/catch`, because those run outside React's rendering. Same for async work — a `.catch()` or `try/catch` around the await, setting error state that your component renders.

### Where should you place error boundaries?
Around each independent section rather than one at the app root. A failing chart should show "couldn't load chart" while the rest of the page keeps working — a single top-level boundary turns any error into a blank page.

---

<a name="s23"></a>
# 23. Data Fetching & Server State

### Why is fetching in `useEffect` considered a problem?
It works, but you own everything around it: loading and error state, cancellation on unmount, race conditions when a fast second request lands before a slow first, refetching on focus, caching, and deduplication when two components request the same data. That's a lot of code per call site, and it's the same code every time.

### What is the race condition in `useEffect` data fetching?
Props change from `id=1` to `id=2`, both requests fire, and the slower response for `id=1` arrives last — overwriting correct data with stale data. The fix is a cleanup flag or an `AbortController`:

```jsx
useEffect(() => {
  let cancelled = false;
  fetchUser(id).then(u => { if (!cancelled) setUser(u); });
  return () => { cancelled = true; };
}, [id]);
```

### What is server state, and why is it different from client state?
Client state you own — a modal being open, a form draft. Server state is a **cache** of data that lives elsewhere and can change without you. That means staleness, invalidation, refetching and deduplication are your problems — none of which `useState` addresses.

### What does React Query / SWR give you?
Caching keyed by request, automatic deduplication of identical concurrent requests, background refetching, stale-while-revalidate, retry with backoff, and loading/error state — all as defaults rather than code you write per call. It replaces most `useEffect` fetching.

### Why is putting server data in Redux often a mistake?
Because you inherit a caching problem the store wasn't designed for: when does it go stale, who refetches after another user's edit, how do two components requesting the same data avoid two calls. A store is built for client state; server state belongs in something built to cache it.

---

<a name="s24"></a>
# 24. Testing

### What should you test in a React component?
Behaviour the user can observe — what renders for given props, what happens on interaction, what callbacks fire. Not internal state, not implementation details, because those change on every refactor while the behaviour doesn't.

### What is React Testing Library's core principle?
Query the DOM the way a user would — by visible text, label, or role — rather than by class name or component internals. That's what makes tests survive refactoring: rename a component or restructure the markup, and a test asserting "a button labelled Save exists" still passes.

### How do you test a component that fetches data?
Mock at the network boundary, not the component boundary — a tool like MSW intercepts the request and returns a fixture, so the component under test runs its real code. Then assert on what appears once the data resolves, using `findBy` queries which wait.

### How do you test a custom hook?
With `renderHook`, which mounts it inside a test component and gives you its return value. Interactions that update state are wrapped in `act` so React flushes them before you assert.

### What is `act()` for?
It tells React "I'm about to trigger updates — process them fully before I assert". Testing Library wraps most interactions in it already; you'll usually only reach for it explicitly with hooks or manual state updates.

---

<a name="s25"></a>
# 25. ⭐ Scenario & Debugging

> These can't be memorised, which is exactly why they're asked.

### "An input loses focus on every keystroke. Why?"
The component containing the input is being defined *inside* another component's body, so it's a brand-new function on every render. React sees a different component type, unmounts the old subtree and mounts a new one — destroying the DOM node and its focus. Move the component definition outside.

### "A list re-orders and the wrong rows show the wrong state. Why?"
Keys are array indices. After a reorder, index 0 still maps to the first *position*, not the first *item*, so React reuses the component that was there — and its state, like a checked checkbox or typed text, stays behind with the position. Use a stable id.

### "`setCount(count + 1)` three times only increments by one. Why?"
All three read the same `count` from the current render's closure, so all three compute the same value and the last wins. Use the updater form — `setCount(c => c + 1)` — which queues three transformations applied in sequence.

### "`useEffect` runs in an infinite loop."
The effect sets state that's also in its dependency array, or a dependency is an object/array recreated inline every render, so `Object.is` always reports a change. Either derive the value during render instead, or stabilise the dependency with `useMemo`/`useCallback`.

### "A `React.memo` component still re-renders every time."
A prop is a new reference each render — an inline arrow function, an inline object, or an array literal. Shallow comparison sees a different value and gives up. Wrap the function in `useCallback` and the object in `useMemo`, or restructure so it isn't passed at all.

### "Data is stale after props change."
Classic derived-state bug: a prop was copied into state with `useState(props.value)`, which only runs on mount. Later prop changes never reach it. Compute during render instead of copying, or if you truly need to reset, change the component's `key` so it remounts.

### "The app freezes while typing in a search box over a large list."
Filtering the whole list synchronously on every keystroke, blocking the main thread. Fixes, in order: memoise the filtering with `useMemo`, wrap the results update in `startTransition` or use `useDeferredValue` so typing stays urgent, and virtualise the list so only visible rows render.

### "Everything re-renders whenever anything changes."
Almost always a context holding too much, with a value object recreated inline: `value={{ user, theme, cart }}`. Every consumer re-renders on every change to any of it. Split the contexts and memoise the value.

### "State updates work in an event handler but not in a `setTimeout`."
On React 17 or earlier, that's batching: updates inside React handlers were batched, but ones inside timeouts and promises weren't, so each caused its own render. React 18's automatic batching removed the inconsistency.

### "Why does my component render twice in development?"
Strict Mode deliberately double-invokes components and effects to surface impurity and missing cleanup. It's development-only. If the double-invocation causes a visible bug — two subscriptions, two requests — that's a real bug that would also appear in production whenever the effect re-runs. Don't suppress it with a ref.

---

## Before an interview

```
1. Cover the answers. Say yours ALOUD. Section 25 first — least memorisable.
2. Stumble on one → open the linked Part, reread that section only.
3. Highest yield: 4 (reconciliation), 8 (Fiber), 17 (internals), 20 (the whys), 25 (scenarios).
4. Then build something. Notes stop helping before an interview does.
```

*— End of question bank —*

