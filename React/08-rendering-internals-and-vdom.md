# React Study Notes — Part 8

## Rendering Internals & the Virtual DOM ⭐ (Element → VDOM → Fiber → Reconciliation → Diffing → Render → Commit → Paint)

> **Format:** Conceptual **"how it works"** notes, fresh-start friendly. Built around a **single example traced step by step through the entire pipeline**, with definitions, before/after comparisons, interview Q&A and a cheat sheet.
>
> **Roadmap:** covers both "Part 5 — React Rendering Internals" and "Part 6 — Virtual DOM" (they are one story, so they're combined here).
>
> **Continues:** [Part 1 — Fundamentals](01-react-fundamentals.md) · [Part 2 — Components](02-components.md) · [Part 3 — JSX](03-jsx-deep-dive.md) · [Part 4 — Props](04-props.md) · [Part 5 — State](05-state.md) · [Part 6 — Lifecycle](06-lifecycle.md) · [Part 7 — Hooks](07-hooks.md).

---

## Table of Contents

1. [The DOM — and why it's the bottleneck](#dom)
2. [The Complete Pipeline (the walkthrough)](#pipeline)
   - [Step 0 — What existed before the click](#step0)
   - [Step 1 — React Element](#step1)
   - [Step 2 — Virtual DOM](#step2)
   - [Step 3 — Fiber Tree](#step3)
   - [Step 4 — Reconciliation](#step4)
   - [Step 5 — Diffing](#step5)
   - [Step 6 — Render Phase](#step6)
   - [Step 7 — Commit Phase](#step7)
   - [Step 8 — Browser Paint](#step8)
3. [Rendering vs Re-rendering](#rerender)
4. [Fiber Architecture (before & after)](#fiber)
5. [Scheduling](#scheduling)
6. [Concurrent Rendering](#concurrent)
7. [Real DOM vs Virtual DOM — the honest comparison](#comparison)
8. [Keys & O(n) Diffing](#keys)
9. [Interview questions & answers](#interview)
10. [Quick summary table](#summary)
11. [Quick revision cheat sheet](#cheatsheet)

---

<a name="dom"></a>
# 1. The DOM — and why it's the bottleneck

> **DOM (Document Object Model)** — the browser's in-memory, tree-shaped representation of an HTML document, where every element, attribute and piece of text is an object with properties and methods JavaScript can read and modify.

```html
<div id="app">
  <h1>Hello</h1>
</div>
```

```
document
  └── html
       └── body
            └── div#app
                 └── h1
                      └── "Hello"
```

## Why DOM operations are expensive

The common explanation — "the DOM is slow" — is imprecise and gets challenged in interviews. Here's what's actually true.

**Reading or writing a DOM property is not, by itself, slow.** `element.id = "x"` is a fast property assignment. What's expensive is what the browser must do *afterwards* to keep the screen correct:

```
1. STYLE      recalculate which CSS rules apply to which elements
2. LAYOUT     compute the exact position and size of every affected element   ← expensive
   (a.k.a. REFLOW)
3. PAINT      fill in pixels — colors, text, borders, shadows
4. COMPOSITE  assemble the painted layers onto the screen
```

**Layout is the costly step**, because geometry is interdependent: making one element wider can push its siblings, resize its parent, and cascade through a large part of the tree. Changing one element's width can force re-measurement of thousands of nodes.

The second cost is **layout thrashing** — alternating writes and reads:

```js
for (const el of elements) {
  el.style.width = el.offsetWidth + 10 + "px";   // WRITE then READ
}
```

The browser normally batches style changes and runs one layout at the end. But `offsetWidth` is a *read* requiring up-to-date geometry, so the browser must flush and run layout **immediately** — every iteration. A hundred elements means a hundred synchronous layouts.

> **This is the real problem React solves.** Not that individual DOM calls are slow, but that a naive update strategy performs far more of them than necessary, in a worse order.

---

<a name="pipeline"></a>
# 2. The Complete Pipeline

```
State Change
     │
     ▼
React Element
     │
     ▼
Virtual DOM
     │
     ▼
Fiber Tree
     │
     ▼
Reconciliation
     │
     ▼
Diffing
     │
     ▼
Render Phase
     │
     ▼
Commit Phase
     │
     ▼
Browser Paint
```

## The example

```jsx
function Counter() {
  const [count, setCount] = useState(0);

  return (
    <>
      <h1>{count}</h1>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </>
  );
}
```

Initially:

```
count = 0
```

The user clicks:

```
setCount(1)
```

Now let's watch what React actually does.

---

<a name="step0"></a>
## Step 0 — What existed before the click

Before tracing the update, know what's already in memory. On the first render React built **two** things and kept them both.

```
CURRENT FIBER TREE                REAL DOM
(React's memory)                  (the browser)

  Counter Fiber                     <h1>0</h1>
    │  memoizedState: 0             <button>Increment</button>
    ├── h1 Fiber ──────────────►  (points at the real <h1> node)
    └── button Fiber ──────────►  (points at the real <button> node)
```

Each Fiber holds a pointer (`stateNode`) to the actual DOM node it produced. **This is the memory React will compare against.** Without it there is nothing to diff.

---

<a name="step1"></a>
## Step 1 — React Element

`setCount(1)` doesn't touch the DOM. It stores the new value and marks `Counter` as needing work.

React then **calls your function again**:

```jsx
Counter()     // this time, useState returns 1
```

Your JSX was compiled away long ago. What actually runs is:

```js
jsx(Fragment, { children: [
  jsx("h1", { children: 1 }),
  jsx("button", { onClick: fn, children: "Increment" })
]})
```

And what those calls **return** is plain objects:

```js
{
  type: "h1",
  props: { children: 1 }
}
```

```js
{
  type: "button",
  props: { onClick: fn, children: "Increment" }
}
```

These are **React Elements**.

> **React Element = a plain JavaScript object describing what the UI should look like.**

Three things to hold onto:

```
It is NOT a DOM node        — nothing is on screen yet
It is IMMUTABLE             — React never edits it; it makes a new one
It is CHEAP                 — an object literal, microseconds
```

That last point is the whole economic argument. Building a full description of your UI costs almost nothing, so React can afford to build it *entirely* on every update and then decide what to keep.

---

<a name="step2"></a>
## Step 2 — Virtual DOM

Those elements nest into a tree:

```
Fragment
   │
   ├── h1
   │     1
   │
   └── button
         "Increment"
```

This in-memory tree is the **Virtual DOM**.

> Think of it as React's **blueprint** of the UI.

There are now **two blueprints** in existence:

```
OLD blueprint          NEW blueprint
  h1 → 0                 h1 → 1
  button                 button
```

Having both is the entire point. React can't know what changed unless it holds the previous description alongside the new one.

⚠️ **The Virtual DOM is not a faster DOM.** It's a *staging area* — a place cheap enough to build and compare, so the expensive real DOM gets touched as little as possible.

---

<a name="step3"></a>
## Step 3 — Fiber Tree

React doesn't work directly with those elements. It converts them into **Fiber Nodes**.

```
Counter Fiber
     │
     ├── h1 Fiber
     │
     └── button Fiber
```

An element is a throwaway description. A **Fiber is a persistent work unit** storing everything React needs to manage that component over time:

```
Component type          the function or tag name
Props                   pendingProps + memoizedProps
State                   memoizedState — the hooks list lives here
DOM node                stateNode — a pointer to the real element
Parent                  return  ↑
Child                   child   ↓
Sibling                 sibling →
Priority                lanes
Pending updates         the update queue
Effect flags            Placement · Update · Deletion
Alternate               ↔ the matching fiber in the other tree
```

**Why the three pointers matter.** They turn the tree into a structure you can walk with a plain loop instead of recursion:

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

Which means React can process one node, **stop**, and remember exactly where it was — in a variable, not in the call stack.

## The two trees (double buffering)

React keeps **two** fiber trees at all times:

```
current            ← what is on screen right now
work-in-progress   ← what React is building
```

Linked node-to-node by `alternate`:

```
current tree                work-in-progress tree
  Counter  ◄──alternate──►   Counter
    h1     ◄──alternate──►     h1
   button  ◄──alternate──►    button
```

React builds the new tree **without touching anything visible**. When it's ready, one pointer flips:

```
before:  root.current ──► tree A  (on screen)
                          tree B  (being built)

after:   root.current ──► tree B  (on screen)
                          tree A  (recycled for next time)
```

> This is why interrupting a render is **free** — the half-finished work lives in a tree nobody is looking at. Throw it away, nothing is lost. Same idea as double buffering in graphics: never show a half-drawn frame.

---

<a name="step4"></a>
## Step 4 — Reconciliation

Now React asks one question:

> **"What changed?"**

```
Old UI                New UI
<h1>0</h1>            <h1>1</h1>
<button>              <button>
```

React walks both trees, node by node, comparing. **This comparison process is Reconciliation.**

It follows three rules, in order:

```
1. Different TYPE?      → destroy the whole old subtree, build new
                          (all state inside is LOST)

2. Same TYPE?           → KEEP the DOM node, patch only what differs
                          (focus, scroll, selection, state all survive)

3. A list of children?  → match by KEY, not by position
```

For our click:

```
Counter  vs  Counter   → same type → keep going
  h1     vs  h1        → same type → check props
  button vs  button    → same type → check props
```

Nothing is being destroyed. React is patching in place.

### Rule 1 in practice — the type-change trap

```jsx
function Page({ loading }) {
  if (loading) return <div><Form /></div>;
  return <section><Form /></section>;    // Form's state is WIPED when loading flips
}
```

Even though `Form` is unchanged, the wrapper's type changed, so React destroys the subtree and remounts. The same rule is also a **tool** — it's exactly why `key={userId}` resets a component's state.

---

<a name="step5"></a>
## Step 5 — Diffing

Inside reconciliation, React compares the actual props of each matched pair. **This is diffing.**

```
h1
  old props: { children: 0 }
  new props: { children: 1 }
  → children differs → UPDATE the text

button
  old props: { onClick: fn, children: "Increment" }
  new props: { onClick: fn, children: "Increment" }
  → identical → SKIP
```

Difference?

```
Only the text.

NOT  button
NOT  Counter
NOT  the <h1> element itself

Only    0
        ↓
        1
```

React records this on the `h1` fiber as a flag:

```
h1 Fiber → flags: Update
```

## The change list

By the end of the walk React has an **effect list** — only the fibers needing real DOM work:

```
effect list:  [ h1 → Update text "0" → "1" ]
```

One entry. That is the entire output of the render phase.

## Another example — lists

```
Old            New
<ul>           <ul>
  A              A
  B              B
  C              D
</ul>          </ul>
```

Diff result:

```
Change   C
         ↓
         D

One DOM update.
```

## Why keys matter — the same list, inserted at the front

```
Old            New
<ul>           <ul>
  A              X      ← inserted
  B              A
  C              B
</ul>            C
               </ul>
```

**Without keys**, React matches by *position*:

```
pos 0:  A vs X   → different → PATCH
pos 1:  B vs A   → different → PATCH
pos 2:  C vs B   → different → PATCH
pos 3:  —  vs C  → CREATE

4 operations — every row rewritten to insert one item.
```

**With keys**, React matches by *identity*:

```
old:  A:a  B:b  C:c
new:  X:x  A:a  B:b  C:c

"a, b, c exist in both → same elements, untouched.
 x is new → insert one node."

1 operation.
```

## 🔥 And why `key={index}` breaks

An index describes a *position*, not an item — so it looks like a key and behaves like none.

```
BEFORE                      AFTER deleting item 0

key=0  [ ] Buy milk         key=0  [✓] Walk dog    ← wrong checkbox!
key=1  [✓] Walk dog         key=1  [ ] Pay bills
key=2  [ ] Pay bills
```

React sees `key=0` in both trees → rule 2 → **keep the DOM node, swap the text**. The node keeps its state — the checked box, typed input, focus — and that state is now attached to the wrong item.

> The data is right. The screen is wrong. Nothing throws. This is a **correctness** bug, not a performance one.

---

<a name="step6"></a>
## Step 6 — Render Phase

Everything in steps 1–5 *was* the render phase. Collected:

```
During the render phase React:
  1. calls your component functions
  2. builds new React Elements
  3. builds the work-in-progress Fiber tree
  4. performs reconciliation
  5. diffs and flags the minimal changes
```

Two properties define this phase:

```
❗ The real DOM is NOT touched here.
❗ It can be paused, restarted, or thrown away entirely (React 18).
```

And one rule follows directly:

> **The render phase must be pure.** No fetching, no subscriptions, no DOM writes, no `setState` — because this code may run two or three times for a single logical update, and its results may be discarded.

That single sentence is why side effects live in `useEffect`, and why `componentWillMount` and friends were deprecated ([Part 6 §7](06-lifecycle.md)).

---

<a name="step7"></a>
## Step 7 — Commit Phase

Now React applies the changes.

```
DOM

Before          After
<h1>0</h1>  ↓   <h1>1</h1>
```

Three ordered sub-phases:

```
┌── 1. BEFORE MUTATION ─────────────────────────────┐
│  the DOM is still OLD                             │
│  · getSnapshotBeforeUpdate — measure the old DOM  │
│    (e.g. capture scroll position)                 │
└───────────────────────────────────────────────────┘
┌── 2. MUTATION ────────────────────────────────────┐
│  React writes to the real DOM                     │
│  · h1TextNode.nodeValue = "1"    ← the ONE write  │
│  · layout-effect cleanups run                     │
│  · componentWillUnmount runs                      │
│  · root.current pointer SWAPS to the new tree     │
└───────────────────────────────────────────────────┘
┌── 3. LAYOUT ──────────────────────────────────────┐
│  DOM is NEW, but nothing painted yet              │
│  · refs are attached  (ref.current = node)        │
│  · componentDidMount / componentDidUpdate         │
│  · useLayoutEffect                                │
└───────────────────────────────────────────────────┘
                      ↓
             🎨 BROWSER PAINTS
                      ↓
            · useEffect (passive, async)
```

```
❗ Unlike the render phase, the commit phase CANNOT be interrupted.
```

Because a half-applied commit would be visibly broken — half the new UI, half the old.

**Two practical facts fall straight out of this diagram:**

```
useLayoutEffect runs BEFORE paint   → measure + adjust with no visible flash
                                      but it BLOCKS painting
useEffect       runs AFTER paint    → user sees content sooner
                                      but a visual adjustment here flickers
```

---

<a name="step8"></a>
## Step 8 — Browser Paint

React's job is done. The browser takes over:

```
DOM changed
    ↓
STYLE       which CSS rules apply?
    ↓
LAYOUT      where and how big is everything?    ← the expensive one
    ↓
PAINT       draw the pixels
    ↓
COMPOSITE   assemble the layers
```

```
Screen changes

    0
    ↓
    1
```

The user sees the update.

Because only a text node changed — not a size or position — the browser can often skip a full layout and do a small repaint. **That's the payoff of the whole pipeline: one text write instead of rebuilding a subtree.**

---

<a name="rerender"></a>
# 3. Rendering vs Re-rendering

> **Render** — React calling your component function to obtain a description of the UI. It produces React Elements. **It does not touch the DOM.**

This is the most misunderstood point in React, so state it plainly: **"re-render" means "React called your function again."** It does not mean anything appeared on screen.

```
render   = your function ran, producing a new element tree     (cheap, no DOM)
commit   = React applied differences to the real DOM           (expensive)
paint    = the browser drew pixels                             (expensive)
```

## Initial render

```
Counter()
    ↓
React Elements
    ↓
Fiber tree built from scratch
    ↓
DOM nodes CREATED
    ↓
appended in ONE insertion
```

There is no previous tree, so nothing to diff — every node is a "Placement."

## Re-render

```
Counter()  runs again
    ↓
NEW elements
    ↓
work-in-progress fiber tree
    ↓
DIFF against the current tree
    ↓
only the differences reach the DOM
```

## What triggers a render — exactly three causes

```
1. Initial mount        createRoot(...).render(<App />)
2. A state update       setState / dispatch in THIS component
3. A parent re-rendered by default, ALL children re-render
```

Not in the list: mutating a variable, mutating an object in state, or changing a ref. None of those notify React.

## What actually re-runs

```jsx
<App>
  <Navbar />
  <Counter />     ← state changed here
  <Footer />
</App>
```

State changed inside `Counter`, so React executes `Counter()` and everything **below** it. `Navbar` and `Footer` are untouched — the update started at `Counter`.

But flip it — put the state in `App`:

```jsx
function App() {
  const [count, setCount] = useState(0);
  return <><Navbar /><Counter count={count} /><Footer /></>;
}
```

Now:

```
App()      runs
Navbar()   runs   ← props identical, but it runs anyway
Counter()  runs
Footer()   runs   ← props identical, but it runs anyway
```

> **By default, when a component re-renders, all of its children re-render** — React does *not* check whether their props changed first. Comparing props costs something too, and re-running a function is usually cheaper.

That sounds alarming and usually isn't:

```
Navbar re-renders  → produces an IDENTICAL element tree
                   → the diff finds NOTHING
                   → ZERO DOM operations
```

**Re-render ≠ repaint.** The cost was one function call and one comparison, both cheap. It matters only when a child is genuinely expensive — and that's exactly when `React.memo` earns its keep, trading a shallow prop comparison for a skipped subtree.

---

<a name="fiber"></a>
# 4. Fiber Architecture (before & after)

> **Fiber** — React's reconciliation engine, introduced in React 16, in which the component tree is represented as a linked list of "fiber" nodes that can be processed incrementally, allowing rendering work to be paused, resumed, prioritized or discarded.

## BEFORE — the stack reconciler (React ≤ 15)

The old reconciler walked the tree with **plain recursion**. Each nested call sat on the JavaScript call stack.

Recursion has a property that turned out to be fatal: **you cannot pause it.** Once you start, the stack unwinds only when the whole traversal finishes. The intermediate state lives in the call stack, which you don't control.

```
Big Render
██████████████████████████
        Browser Frozen
```

```
user types a character
     ↓
React begins rendering 5,000 components (recursive, unstoppable)
     ↓
... 300ms of blocked main thread ...
     ↓
browser finally free to process the keystroke and paint
```

No clicks, no typing, no animation, no scroll for the whole duration. And there was no way to say "the keystroke matters more than this list update" — every render had identical priority and ran to completion.

## AFTER — Fiber

```
████   pause   ██   pause   ███   pause   ██   done
  │      │      │     │      │     │       │
  │   browser   │  browser   │  browser    │
  │   handles   │  handles   │  handles    │
  │   a click   │  a paint   │  a keypress │
```

React replaced recursion with an **explicit, iterative work loop over a linked list**:

```js
// conceptually:
while (nextUnitOfWork && !shouldYieldToBrowser()) {
  nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
}
// if we yielded, resume from nextUnitOfWork on the next frame
```

Because "where am I" is a variable rather than the call stack, React processes one fiber, checks whether it has used its ~5ms slice, and if so **returns control to the browser** — then picks up exactly where it left off.

## What changed

| | Stack reconciler (≤15) | Fiber (16+) |
|---|---|---|
| Traversal | recursion | iterative loop over a linked list |
| Interruptible | ❌ impossible | ✅ yields every few ms |
| Priorities | none — all work equal | lanes: urgent vs deferrable |
| Abandoning work | impossible | free — discard the WIP tree |
| Long renders | freeze the page | stay responsive |
| Enabled | — | Suspense, transitions, concurrent rendering |

> ⚠️ **Fiber did not make rendering faster.** The total work is the same. It made the work **divisible and abandonable** — which is what later unlocked priorities, transitions, Suspense and streaming SSR. The user-facing improvement is responsiveness, not speed.

---

<a name="scheduling"></a>
# 5. Scheduling

> **Scheduling** — deciding *when* and *in what order* React performs rendering work, based on the priority of each update.

Once work is interruptible, a question follows immediately: when you pause, what next? That's the scheduler's job.

## The core idea

The browser's main thread is single-threaded and shared: JavaScript, layout, paint and input handling all compete for it. If React occupies it for 300ms, nothing else happens for 300ms.

React works in **time slices of roughly 5ms**, then checks whether the browser has more urgent work — a pending keystroke, a frame to paint — and yields if so.

```
──── 5ms ────┬──── browser ────┬──── 5ms ────┬──── browser ────┬─── …
React works  │ input + paint   │ React works │ input + paint   │
```

## The 10,000-row example

```
Huge Table
10,000 rows
```

**Without scheduling:**

```
Render everything
       ↓
   UI freezes
       ↓
user clicks — nothing happens for 400ms
```

**With scheduling:**

```
render 100 rows
       ↓
     pause
       ↓
 user clicks → handled IMMEDIATELY
       ↓
continue rendering
       ↓
     pause
       ↓
    finish
```

## Priorities (lanes)

> **Lane** — React's internal priority label for an update, determining how urgently it must be processed.

```
URGENT   ┌ discrete input   click, keypress, typing   must feel instant
         │ continuous input scroll, drag, mouse move
         │ default          normal setState
         │ transition       startTransition updates   interruptible
IDLE     └ idle             offscreen / prefetch      whenever there's room
```

Higher priority **interrupts** lower priority:

```
transition render (50% done)
        ↓  click arrives
   THROW AWAY the work-in-progress tree
        ↓
   handle the click, commit, paint
        ↓
   restart the transition from scratch
```

Discarding is free — that work only existed in a tree nobody was displaying.

## Batching

> **Batching** — grouping multiple state updates occurring in the same tick into a single re-render.

```jsx
setA(1);
setB(2);
setC(3);
```

```
setA → queue
setB → queue
setC → queue
handler ends → process the queue → ONE render → ONE diff → ONE commit
```

```
React 17:  batched only inside React event handlers
React 18:  batched EVERYWHERE — promises, setTimeout, native listeners (createRoot)
escape hatch: flushSync — forces a synchronous render
```

This is also why state looks "asynchronous": it isn't async in the promise sense, it's **scheduled**.

---

<a name="concurrent"></a>
# 6. Concurrent Rendering (React 18)

> **Concurrent rendering** — React's ability to prepare multiple versions of the UI at the same time, interrupting, pausing, resuming or abandoning render work so urgent updates are never blocked by less urgent ones.

It is **not** multithreading. Everything still runs on one thread. "Concurrent" means *interleaved* — like an operating system interleaving processes on one CPU.

## The scenario

The user types:

```
R
Re
Rea
Reac
React
```

Meanwhile a huge list is filtering on every keystroke.

**Without concurrent rendering:**

```
keypress "R"
     ↓
render + filter 10,000 items  ████████████ 200ms (blocking)
     ↓
"R" finally appears

Result:  Keyboard Lag
```

**With concurrent rendering:**

```
Typing     ── HIGH priority ──►  committed immediately
Filtering  ── LOW  priority ──►  rendered in the background,
                                 interrupted by each keystroke
```

```jsx
function handleChange(e) {
  setQuery(e.target.value);                       // urgent — the input
  startTransition(() => {
    setResults(filterHugeList(e.target.value));   // non-urgent — the list
  });
}
```

React can **interrupt the filtering work to keep typing smooth** — and when it does, the stale half-finished filter is discarded rather than committed:

```
type "R"   → start filtering...
type "Re"  → ABANDON that work, restart with "Re"
type "Rea" → ABANDON, restart with "Rea"
(pause in typing) → finish → commit results
```

Compare to the old workaround:

```
debounce      → a guessed timing constant that delays EVERYTHING
transition    → a semantic statement: "this matters less than input"
```

This capability is exposed by `startTransition` and `useDeferredValue`.

## What changed

| | Legacy rendering | Concurrent rendering |
|---|---|---|
| Update priority | all equal | urgent vs transition vs idle |
| A long render | blocks input and paint | yields every ~5ms |
| Stale in-progress work | must complete | discarded and restarted |
| Handling slow updates | debounce (a timing guess) | mark as a transition (semantic) |
| Enables | — | Suspense, streaming SSR, `useDeferredValue` |

## What it costs

```
render must be PURE      it may run several times, results thrown away
Strict Mode double-runs  in dev, to expose code that breaks that assumption
TEARING becomes possible external state read mid-render can differ between
                         components → useSyncExternalStore fixes it
```

> **Tearing** — a visual inconsistency where, during one concurrent render pass, different components read different values of the same external data source.

## Enabling it

Concurrent features are opt-in **per update**, not per app. `createRoot` (React 18+) makes them available; a render becomes concurrent only when you mark it — `startTransition`, `useDeferredValue`, or Suspense. Ordinary `setState` still renders eagerly.

---

<a name="comparison"></a>
# 7. Real DOM vs Virtual DOM — the honest comparison

| | **Real DOM** | **Virtual DOM** |
|---|---|---|
| What it is | the browser's live document tree | plain JS objects in memory |
| Lives in | the browser engine | your JavaScript heap |
| Cost to create a node | heavy — wired into layout/paint | trivial — an object literal |
| Changing it | may trigger style/layout/paint | changes nothing visible |
| Updating strategy | you specify each operation | you describe the end state |
| Directly visible | yes | no |

## ⚠️ The answer interviewers are testing for

> **The Virtual DOM is not faster than direct DOM manipulation.**

Perfectly hand-written imperative code that updates exactly the one text node that changed will always beat React, because React additionally builds a tree and diffs it. **The Virtual DOM adds work.**

What it buys is different:

1. **Consistently good updates for free** — declarative code, near-minimal DOM operations, no hand-optimizing.
2. **Batching** — many logical changes collapse into one coordinated DOM update, avoiding layout thrashing.
3. **A programming model** — you describe *what the UI is*, not *how to transition between states*, which eliminates a whole category of bugs.

> **Interview phrasing:** *"The Virtual DOM isn't a performance trick that beats manual DOM work — it's a way to get near-optimal updates while writing declarative code. The win is that React batches and minimizes real DOM mutations, which are the genuinely expensive part because they trigger layout and paint."*

---

<a name="keys"></a>
# 8. Keys & O(n) Diffing

## The theoretical problem

Comparing two arbitrary trees and finding the minimal set of transformations is a solved problem in computer science, with an optimal complexity of **O(n³)**. For a thousand nodes that's a billion operations — per update. Unusable.

React reaches **O(n)** by refusing to solve the general problem. It applies two assumptions that are almost always true of real interfaces, and accepts being non-optimal in the rare cases where they aren't:

```
1. Two elements of DIFFERENT TYPES produce different trees
   → don't search for similarities inside; destroy and rebuild

2. The developer can hint which children are stable across renders
   → that hint is the KEY
```

## What a key means

> **A key is a promise: "this element represents the same logical item as the element with this key in the previous render."**

```
no key   → match by POSITION → insert at the front rewrites every row
index    → positional → looks like a key, behaves like none
stable id→ true identity → minimal operations, state stays with its item
```

## The rules

| Rule | Detail |
|---|---|
| **Stable** | same item → same key across renders. Never `Math.random()` — that recreates every node every render |
| **Unique among siblings** | only within one list. Two different lists may both use `1, 2, 3` |
| **On the outermost element** returned from `.map()` | not on a child inside it |
| **Not readable as a prop** | React consumes `key`. Need it inside? `<Row key={id} id={id} />` |

## When index-as-key is acceptable

Only when **all three** hold:

```
1. The list is static — never reordered, filtered, inserted into, or deleted from
2. Items have no state (no inputs, no toggles, no focus)
3. There is genuinely no stable id available
```

## The cost of the heuristics

React's diff is O(n) but **not minimal**. Moving a subtree from one parent to another destroys and recreates it, because React never compares across different levels of the tree. React accepts that trade: near-optimal results at linear cost beats optimal results at cubic cost.

---

<a name="interview"></a>
# 9. Interview questions & answers

### Q: "What is the Virtual DOM?"
> *"An in-memory tree of plain JavaScript objects — React Elements — describing what the UI should look like. When state changes, React builds a new tree, compares it with the previous one, and derives the minimal set of real DOM operations. It exists because those objects are cheap to create and compare, while real DOM mutations are expensive since they can trigger style recalculation, layout and paint."*

### Q: "Is the Virtual DOM faster than the real DOM?"
> *"That comparison doesn't quite work — the Virtual DOM is a staging layer, not a replacement. And it's not faster than well-written manual DOM code: hand-optimized imperative updates will beat React because React adds a diffing step. What it gives you is consistently near-optimal updates for free while you write declarative code, plus batching so many logical changes become one coordinated DOM update instead of many interleaved reads and writes."*

### Q: "Why are DOM operations expensive?"
> *"Not because setting a property is slow, but because of what follows. Changing geometry forces the browser to recalculate styles and re-run layout, which is interdependent across the tree — one element's width can cascade through thousands of nodes. It gets worse with layout thrashing, where alternating writes and reads forces a synchronous layout on every iteration instead of one batched layout at the end."*

### Q: "What is reconciliation?"
> *"The algorithm React uses to compare the new element tree with the previous one and work out the minimum DOM changes. The general tree-diffing problem is O(n³), which is unusable, so React gets to O(n) with two heuristics: elements of different types produce entirely different trees, so the old subtree is destroyed; and keys tell React which children correspond to which across renders."*

### Q: "What happens when an element's type changes?"
> *"React tears down the entire old subtree and builds the new one from scratch — all component state inside is lost and DOM nodes are recreated. It never tries to find similarities across a type change. That's also the mechanism behind using a `key` to reset a component: changing the key makes React treat it as a different element and remount it."*

### Q: "What do keys do and why is index-as-key a problem?"
> *"Keys give list items a stable identity so React can match elements across renders instead of comparing by position. Without them, inserting at the front makes React patch every row rather than insert one node. An index is positional, so it changes meaning whenever the list is reordered or filtered — React sees the same key, assumes the same element, keeps the existing DOM node and just swaps the content. So component state like a checked checkbox or typed input ends up attached to the wrong item. That's a correctness bug, not just a performance one."*

### Q: "What is Fiber and what problem did it solve?"
> *"Fiber is React 16's reconciliation engine. The old reconciler traversed the tree with recursion, and recursion can't be paused — once a render started it ran to completion, blocking the main thread. A large render froze input and animation for hundreds of milliseconds. Fiber represents the tree as a linked list of fiber nodes with child, sibling and return pointers, and processes them in an explicit loop. Because the traversal position is a variable rather than the call stack, React can yield to the browser every few milliseconds and resume later."*

### Q: "Did Fiber make React faster?"
> *"Not in raw throughput — a render takes about the same total time. It made the work divisible and abandonable, which is what enabled everything since: priority lanes, interruptible rendering, transitions, Suspense and streaming SSR. The user-facing improvement is responsiveness, not speed."*

### Q: "What is a fiber node?"
> *"An object per component holding the work to be done and the pointers to traverse without recursion: type, key, the corresponding DOM node, child, sibling and return pointers, pending and memoized props, memoized state — which is where the hooks list lives — effect flags, priority lanes, and an alternate pointer to its counterpart in the other tree."*

### Q: "What are the two trees React maintains?"
> *"The current tree, which is what's on screen, and the work-in-progress tree, which React is building. Each fiber's `alternate` points to its counterpart. React builds the WIP tree without touching anything visible and commits by swapping a single pointer. It's double buffering — the same idea as never showing a partially drawn frame in graphics. It's also why abandoning a render is free: the incomplete work exists only in a tree nobody is displaying."*

### Q: "Explain the render phase versus the commit phase."
> *"The render phase calls components, builds the new tree and diffs it, producing a list of DOM changes. It's pure and interruptible — React may pause, restart or discard it, so it may run several times for one update. The commit phase applies those changes to the DOM and runs effects; it's synchronous and uninterruptible, because a half-applied UI would be visibly broken. That split is why side effects belong in effects and lifecycle 'did' methods, never in render."*

### Q: "What happens in the commit phase exactly?"
> *"Three sub-phases. Before mutation, where the DOM is still the old version — `getSnapshotBeforeUpdate` runs there to measure things like scroll position. Mutation, where React inserts, updates and deletes nodes, runs layout-effect cleanups and `componentWillUnmount`, and swaps the current pointer. Then layout, where the DOM is new but not yet painted — `componentDidMount`, `componentDidUpdate` and `useLayoutEffect` run and refs are attached. After the browser paints, passive effects — `useEffect` — run asynchronously."*

### Q: "Why does `useLayoutEffect` prevent a flicker?"
> *"It runs in the layout sub-phase of the commit, after the DOM is updated but before the browser paints, so a measurement-and-adjustment happens within the same frame and the intermediate state is never visible. `useEffect` runs after paint, so the same adjustment would be seen as a flash. The trade-off is that `useLayoutEffect` blocks painting, so slow work there delays the frame."*

### Q: "What is concurrent rendering?"
> *"React's ability to work on multiple versions of the UI at once — pausing, resuming and abandoning render work so urgent updates aren't blocked. It's not multithreading; it's interleaving on one thread. Updates get priorities, so a keystroke can interrupt a heavy list render, and the interrupted work is discarded and restarted with fresh input rather than committing something stale."*

### Q: "Do you have to do anything to get concurrent rendering?"
> *"You need `createRoot` from React 18, but concurrency is opt-in per update rather than per app. A render only becomes interruptible when you mark it — `startTransition`, `useDeferredValue`, or Suspense. Regular `setState` still renders eagerly."*

### Q: "What is tearing?"
> *"A visual inconsistency where, during one concurrent render pass, different components read different values of the same external data source — because React paused mid-render and the external store changed. It only arises with state outside React's control. `useSyncExternalStore` fixes it by guaranteeing every component in a render pass sees the same snapshot, which is why libraries like Redux and Zustand adopted it."*

### Q: "Why does a parent re-rendering re-render all its children?"
> *"Because React doesn't check whether props changed before calling a child — comparing props costs something too, and re-running a function is usually cheap. Also, most re-renders produce an identical tree, so the diff finds nothing and no DOM operations happen at all. `React.memo` opts a component out of that default, trading a shallow comparison for a possible skip — worth it only when the component is genuinely expensive."*

### Q: "Does a re-render mean a DOM update?"
> *"No. A re-render just means the component function ran again and produced a new element tree. React then diffs it, and only actual differences reach the real DOM. That's why most 'unnecessary re-renders' are harmless — the wasted work is the render and diff, not DOM writes."*

---

<a name="summary"></a>
# 10. Quick summary table

| Concept | Meaning |
|---|---|
| **React Element** | A plain, immutable JavaScript object describing the UI. Not a DOM node. |
| **Virtual DOM** | The in-memory tree of React Elements — a staging area, not a faster DOM. |
| **Fiber** | React's internal work-unit holding type, props, state, hooks, pointers, priority and effect flags. |
| **Fiber Tree** | The linked-list tree of fibers React traverses iteratively, so work can pause and resume. |
| **Double buffering** | Two trees — `current` (on screen) and `work-in-progress` (being built) — swapped by one pointer. Makes abandoning work free. |
| **Reconciliation** | Determining what changed between the old and new trees: different type → rebuild; same type → patch; lists → match by key. |
| **Diffing** | Comparing corresponding nodes' props to find the minimal updates, producing the effect list. |
| **Keys** | Stable identity for list items so React matches by identity instead of position. Index keys attach state to the wrong item. |
| **Render Phase** | React computes the next UI. Pure. No DOM mutations. Interruptible in concurrent mode. |
| **Commit Phase** | React applies DOM updates, swaps the tree, attaches refs and runs layout effects. Synchronous, cannot be interrupted. |
| **Browser Paint** | Style → Layout → Paint → Composite. Then passive effects (`useEffect`) run. |
| **Re-render** | Your function ran again. It does **not** mean the DOM changed. |
| **Scheduling** | Deciding when React works and in what order, using ~5ms slices and priority lanes. |
| **Concurrent Rendering** | Interleaving render work on one thread so urgent updates aren't blocked; interrupted work is discarded and restarted. |

---

<a name="cheatsheet"></a>
# 11. Quick revision cheat sheet

```
DOM             the browser's live tree of element objects
WHY IT'S COSTLY not the property write — the STYLE → LAYOUT → PAINT → COMPOSITE
                pipeline it triggers. LAYOUT (reflow) is the expensive part:
                geometry is interdependent, one change cascades.
                LAYOUT THRASHING = alternating write/read forces sync layout each time

REACT ELEMENT   a plain, IMMUTABLE JS object describing UI
                { type, props, key, ref } — type: string = DOM tag, fn = component
                cheap to create · immutable → you always have old AND new to compare

VIRTUAL DOM     the in-memory tree of React Elements — a STAGING AREA, not a fast DOM
                ⚠️ NOT faster than hand-written DOM code (it adds a diff step)
                the win: near-optimal updates for free + batching + declarative model

FIBER           a persistent WORK UNIT per component:
                {type, key, stateNode, child, sibling, return,
                 pendingProps, memoizedProps, memoizedState(hooks),
                 flags, lanes, alternate}
                child/sibling/return → traversable by LOOP, not recursion
                → position is a VARIABLE, not the call stack → pause & resume

DOUBLE BUFFER   current tree (on screen) ↔ work-in-progress tree (being built)
                linked by `alternate` · commit = ONE pointer swap
                → abandoning a render is FREE (nothing was displaying it)

RENDER          React CALLED YOUR FUNCTION. Produces elements. NO DOM touched.
                re-render ≠ repaint. 50 renders can cause 0 DOM operations.
TRIGGERS        1. initial mount  2. setState in this component  3. PARENT re-rendered
                (React does NOT check props first — React.memo opts out)
                NOT triggered by: mutating a variable / object / ref

RECONCILIATION  compare new tree vs old → minimal DOM change list
DIFFING         optimal general tree diff = O(n³) → unusable
                React = O(n) via heuristics:
                  1. DIFFERENT TYPE → destroy the whole subtree, rebuild
                     (all state lost — this is how key={id} resets a component)
                  2. SAME TYPE → keep the node, patch only changed props
                     (focus, scroll, selection, transitions, state all survive)
                  3. LISTS → match by KEY, not position
                output: the EFFECT LIST — only fibers flagged Placement/Update/Deletion
                cost: moving a subtree across parents = destroy + recreate

KEYS            "this is the same logical item as last render"
                no key → match by POSITION → inserting at the front rewrites every row
                index  → positional → React keeps the node and swaps content
                         → STATE ATTACHES TO THE WRONG ITEM (a correctness bug)
                rules: stable · unique among SIBLINGS · outermost mapped element
                       · not readable as a prop · never Math.random()
                index OK only if: static list + no state + no stable id

RENDER PHASE    calls components · builds elements · builds the WIP fiber tree
                · reconciles · diffs · flags fibers
                PURE · INTERRUPTIBLE · NO DOM touched · may run many times
                → this is WHY side effects can't live in render

COMMIT PHASE    synchronous, UNINTERRUPTIBLE (a half-applied UI would be broken)
                1. BEFORE MUTATION  old DOM still present → getSnapshotBeforeUpdate
                2. MUTATION         DOM writes · layout-effect cleanups
                                    · componentWillUnmount · SWAP current pointer
                3. LAYOUT           new DOM, NOT yet painted → componentDidMount/Update
                                    · useLayoutEffect · refs attached
                → 🎨 PAINT →  passive effects: useEffect (async, after paint)

FIBER: BEFORE/AFTER
                ≤15 stack: recursion → CANNOT pause → 300ms freezes, no priorities
                16+ fiber: loop + linked list → yields every ~5ms, work is abandonable
                ⚠️ Fiber didn't make rendering FASTER — it made work DIVISIBLE

SCHEDULING      ~5ms slices, then yield to the browser for input + paint
                LANES (urgent → idle):
                  discrete input (click/key) > continuous (scroll/drag)
                  > default setState > transition > idle
                higher priority INTERRUPTS lower; interrupted work is discarded
                BATCHING: React 17 = only React handlers · React 18 = EVERYWHERE
                          (createRoot) · escape hatch: flushSync
                "state seems async" = it's SCHEDULED, processed as a queue

CONCURRENT      interleaving on ONE thread — NOT multithreading
                BEFORE: every update equal priority + blocking; workaround = debounce
                        (a timing guess that delays everything)
                AFTER:  startTransition / useDeferredValue mark work NON-URGENT
                        → keystroke wins, heavy render yields, stale work discarded
                opt-in PER UPDATE (createRoot enables it; marking activates it)
                COSTS: render must be PURE · Strict Mode double-invokes to expose
                       impurity · TEARING for external stores → useSyncExternalStore

THE PIPELINE
State change → your function runs → React Elements (VDOM) → Fiber tree (WIP)
  → RENDER PHASE (pure, interruptible): reconcile + diff → effect list
  → COMMIT PHASE (sync): before-mutation → mutation (+ tree swap) → layout
  → 🎨 Browser: Style → Layout → Paint → Composite → pixels
  → useEffect
```

---

## Connects to

- **[Part 1 — Fundamentals](01-react-fundamentals.md):** §9 there walks the same `Counter` update at a beginner level — this part is the deep version.
- **[Part 3 — JSX](03-jsx-deep-dive.md):** where React Elements come from, and the `key` rules from the consumer's side.
- **[Part 6 — Lifecycle](06-lifecycle.md):** the render/commit split is the reason every lifecycle method sits where it does, and why the `will` methods were deprecated.
- **[Part 7 — Hooks](07-hooks.md):** `memoizedState` on a fiber *is* the hooks linked list; `useLayoutEffect` vs `useEffect` is the commit-phase timing; `useSyncExternalStore` exists because of tearing.
- **[Part 2 — Components](02-components.md):** `React.memo` opts out of the "parent re-renders → children re-render" default.
- **Performance:** the Profiler, when memoization pays, list virtualization, the React Compiler.
- **Suspense & SSR:** streaming and selective hydration, both built on Fiber's interruptibility.

## Suggested next topics

1. **Performance optimization** — recommended next; profiling, memoization, virtualization, code splitting.
2. **Custom Hooks** — the payoff of Part 7.
3. **Suspense, SSR & CSR** — streaming, hydration, Next.js.

*— End of Part 8: Rendering Internals & the Virtual DOM —*
