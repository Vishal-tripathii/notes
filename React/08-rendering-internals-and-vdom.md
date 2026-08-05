# React Study Notes — Part 8

## Rendering Internals & the Virtual DOM (Element → VDOM → Fiber → Reconciliation → Diffing → Render → Commit → Paint)

> **Format:** The first half traces **one concrete update through the entire pipeline**, step by step. The second half explains each mechanism properly — what it is, what problem it solved, what it costs — with code only where a snippet carries a point words can't.
>
> **Roadmap:** covers both "Part 5 — React Rendering Internals" and "Part 6 — Virtual DOM" (they are one story, so they're combined here).
>
> **Continues:** [Part 1 — Fundamentals](01-react-fundamentals.md) · [Part 3 — JSX](03-jsx-deep-dive.md) · [Part 6 — Lifecycle](06-lifecycle.md) · [Part 7 — Hooks](07-hooks.md).

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
4. [Fiber Architecture](#fiber)
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

## The distinction that causes the most confusion

> **Render** — React calling your component function to obtain a description of the UI. It produces React Elements. **It does not touch the DOM.**

Almost every misconception about React performance comes from conflating three separate things that people casually call "rendering."

**A render** is your function executing. It's a JavaScript function call that returns objects. Nothing appears, nothing changes, no browser work happens. **A commit** is React applying differences to the real DOM — this is where actual mutation occurs. **A paint** is the browser drawing pixels, which only happens if the commit changed something the browser needs to redraw.

The gap between the first and the last is where the confusion lives. A component can re-render fifty times and cause **zero** DOM operations, because each render produced an identical element tree and the diff found nothing to do. The cost was fifty function calls and fifty comparisons — measured in microseconds, invisible to a user.

This is why "unnecessary re-renders" is a much less alarming phrase than it sounds, and why chasing every one of them in DevTools without profiling is one of the most common wastes of effort in React work.

## The three things that trigger a render — and the things that don't

There are exactly three causes. **Initial mount**, when `createRoot(...).render()` first runs. **A state update** in that component, via `setState` or `dispatch`. And **a parent re-rendering**, which by default re-renders every child.

What's absent from that list is as instructive as what's on it. Mutating a plain variable doesn't trigger a render — React isn't watching your variables. Mutating an object that happens to be in state doesn't either, because React never sees a new reference and concludes nothing changed. Changing a ref doesn't, by design — that's the entire point of refs. Each of those produces the same confusing symptom: the data is correct and the screen is stale.

## Why a parent re-render re-renders every child

This surprises people, and the reasoning behind it is worth understanding rather than just accepting.

When a parent re-renders, React does **not** check whether each child's props changed before calling it. It just calls them all. That sounds wasteful until you consider the alternative: comparing props costs something too, and for the overwhelming majority of components — a button, a label, a small div — running the function is cheaper than checking whether you need to. React makes the bet that re-running is cheaper than comparing, which is correct in the common case.

There's a second reason it matters less than it seems. Even when a child re-renders needlessly, it produces the same element tree it produced before, so reconciliation finds no differences and **nothing reaches the DOM**. The expensive part of the pipeline never runs.

Where this becomes a genuine problem is narrow: a child that's genuinely expensive to render — a chart computing a layout, a table transforming thousands of rows — re-running when its inputs haven't changed. That's the case `React.memo` exists for, and it's why memo should follow profiling rather than precede it.

## Where the update starts

One practical detail follows from all this: **an update propagates downward from the component whose state changed**, not from the root.

If state lives in a deeply nested component, only that component and its descendants re-render; everything above and beside it is untouched. If the same state is lifted to `App`, then `App` and its entire tree re-render on every change — including siblings whose props are identical.

That's the real performance argument for the "keep state as low as possible" rule from [Part 5](05-state.md). Lifting state isn't just an architectural preference; it widens the blast radius of every update.

## Initial render vs update

The two paths differ meaningfully. On the **initial render** there is no previous tree, so there's nothing to compare — every fiber is flagged as a placement, every DOM node is created, and React attaches the whole subtree in a single insertion rather than node by node. On an **update**, the work-in-progress tree is built against the existing one, most fibers are found to be unchanged, and only the differences are flagged.

That asymmetry is why mounting a large component is often noticeably more expensive than updating it, and why remounting something unnecessarily — by changing its `key`, or by defining a component inside another component — is such a costly mistake.

---

<a name="fiber"></a>
# 4. Fiber Architecture

> **Fiber** — React's reconciliation engine, introduced in React 16, in which the component tree is represented as a linked list of "fiber" nodes that can be processed incrementally, allowing rendering work to be paused, resumed, prioritized or discarded.

## The problem: recursion cannot be paused

To understand why Fiber exists you need to see precisely what was wrong before it, and the flaw is more fundamental than "it was slow."

The old reconciler — retroactively called the **stack reconciler** — walked the component tree with ordinary recursion. `render` called itself for each child, and each nested call sat on the JavaScript call stack. This is the natural way to traverse a tree, and it worked correctly.

The problem is a property of recursion itself: **the traversal's position is stored in the call stack, which you do not control.** There is no way to stop halfway, hand the thread back to the browser, and resume later, because "where am I in the tree" exists only as a stack of pending function calls that the engine unwinds when it's ready. You cannot serialize it, pause it, or abandon it.

The consequence was that once a render started, it ran to completion — occupying the single main thread for its full duration.

```
user types a character
     ↓
React begins rendering 5,000 components (recursive, unstoppable)
     ↓
... 300ms of blocked main thread ...
     ↓
browser finally free to process the keystroke and paint
```

For those 300 milliseconds nothing else could happen. No input handling, no animation frames, no scrolling. The character the user typed appeared a third of a second after they typed it. And because every render was equally unstoppable, there was **no way to express that the keystroke mattered more than the list update** — priority didn't exist as a concept.

## What Fiber changed

Fiber replaced recursion with an **explicit, iterative work loop over a linked list.** Rather than relying on the call stack to remember position, React keeps that information in its own data structure — which means it can put the structure down and pick it up again.

A fiber node holds both the work to be done and the pointers needed to traverse without recursion. The three pointers — `child` (down), `sibling` (across), `return` (up) — encode the same tree the call stack used to, but as data React owns:

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

Traversal then becomes a loop rather than a recursion:

```js
while (nextUnitOfWork && !shouldYieldToBrowser()) {
  nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
}
// if we yielded, resume from nextUnitOfWork later
```

`nextUnitOfWork` is an ordinary variable holding a fiber. React processes one fiber, checks whether it has used its time slice, and if so **stores that variable and returns control to the browser**. The browser handles input and paints a frame. Then React resumes from exactly the same fiber.

That's the whole trick, and it's worth stating plainly because it sounds more mysterious than it is: **Fiber made the traversal position a variable instead of the call stack.** Everything else follows from that.

## Each fiber is processed in two passes

Traversal isn't a single visit per node. React performs a **begin** phase going down — where it calls the component function, produces children, and creates or reuses their fibers — and a **complete** phase coming back up, where it finalises the node and bubbles its effect flags toward the parent.

This matters because it's what makes the effect list possible. By the time React returns to the root, each fiber has collected the flags of everything beneath it, so React knows exactly which nodes need DOM work without re-walking the tree in the commit phase.

## Double buffering — why abandoning work is free

Fiber maintains **two complete trees** at all times: the `current` tree, which corresponds to what's on screen, and the `work-in-progress` tree, which React is building. Each fiber's `alternate` pointer links it to its counterpart in the other tree, so React can reuse fiber objects between renders rather than allocating a new tree from scratch each time.

React builds into the work-in-progress tree, mutating nothing the user can see. When the render completes, committing is a **single pointer swap** — `root.current` now points at the new tree, and the old one becomes the scratch space for the next render.

The consequence is the one that makes concurrency possible: **incomplete work exists only in a tree nothing is displaying, so discarding it costs nothing.** React can be 80% through rendering a large update, receive a higher-priority one, throw the entire work-in-progress tree away, and start over — with no cleanup, no rollback, and no visible artifact.

This is the same technique as double buffering in graphics, and for the same reason: never show a partially drawn frame.

## What actually improved

The most common misconception about Fiber is that it made React faster. **It did not.** A render performs the same total work and takes roughly the same total time. If anything, the bookkeeping adds a small overhead.

What changed is that the work became **divisible and abandonable**. That's an architectural change, not a performance one — but it's the change that made everything since possible: priority lanes, interruptible rendering, transitions, Suspense, and streaming server rendering all depend on being able to stop mid-render.

The user-facing improvement is **responsiveness**, not speed. The same 300ms of work now happens in sixty five-millisecond slices with the browser free in between, so the interface stays alive throughout instead of freezing and then catching up.

| | Stack reconciler (≤15) | Fiber (16+) |
|---|---|---|
| Traversal | recursion | iterative loop over a linked list |
| Position stored in | the JS call stack | a variable React owns |
| Interruptible | ❌ impossible | ✅ yields every few ms |
| Priorities | none — all work equal | lanes: urgent vs deferrable |
| Abandoning work | impossible | free — discard the WIP tree |
| Long renders | freeze the page | stay responsive |
| Enabled | — | Suspense, transitions, concurrent rendering |

---

<a name="scheduling"></a>
# 5. Scheduling

> **Scheduling** — deciding *when* and *in what order* React performs rendering work, based on the priority of each update.

Once work became interruptible, a new question appeared that hadn't existed before: **when you pause, what should happen next?** Fiber provides the ability to stop; the scheduler provides the policy for when to stop and what to resume.

## The constraint: one thread, many claimants

Everything in a browser tab shares a single main thread — your JavaScript, style recalculation, layout, painting, and event handling. They cannot run simultaneously. If React occupies that thread for 300 milliseconds, nothing else happens for 300 milliseconds, no matter how fast the machine is.

The scheduler's job is to make sure React never holds the thread long enough for a user to notice. It works in **time slices of roughly five milliseconds** — chosen because it's comfortably inside a 16ms frame budget, leaving room for the browser's own work. After each slice React checks whether anything more urgent is waiting: a pending input event, a frame that needs painting. If so, it yields.

```
──── 5ms ────┬──── browser ────┬──── 5ms ────┬──── browser ────┬─── …
React works  │ input + paint   │ React works │ input + paint   │
```

The total work is unchanged. What changed is that the browser gets regular openings to handle a keystroke, which is the difference between an interface that feels responsive and one that feels frozen.

Conceptually this is similar to `requestIdleCallback`, but React ships its own scheduler implementation for consistent cross-browser behaviour and finer control over priority.

## Lanes — the priority system

> **Lane** — React's internal priority label for an update, determining how urgently it must be processed.

Not all updates deserve the same treatment, and the scheduler encodes that as a priority ordering:

```
URGENT   ┌ discrete input   click, keypress, typing   must feel instant
         │ continuous input scroll, drag, mouse move
         │ default          normal setState
         │ transition       startTransition updates   interruptible
IDLE     └ idle             offscreen / prefetch      whenever there's room
```

The reasoning behind the ordering is perceptual rather than technical. A user notices a delay between pressing a key and seeing the character far more readily than a delay in a list updating beneath it. Discrete input is therefore the highest priority, because it's where human perception is least forgiving.

Higher-priority work **interrupts** lower-priority work already in progress. If React is halfway through rendering a transition and a click arrives, it abandons the work-in-progress tree, handles the click through to commit and paint, then restarts the transition from the beginning.

Restarting rather than resuming might sound wasteful, and sometimes it is — but it's usually correct, because the click likely changed the state the transition was rendering from. Resuming would commit a tree computed from stale inputs. And the discard itself is free, for the double-buffering reason from §4.

## Batching, and why it improved in React 18

> **Batching** — grouping multiple state updates occurring in the same tick into a single re-render.

Batching predates Fiber conceptually but is a scheduling behaviour. When you call three setters in one handler, React doesn't render three times. It queues each update, lets the handler finish, then processes the whole queue in one render pass.

Without this you'd render once per setter, and the user could briefly see intermediate states — a form showing "saved" while still displaying stale data, for instance. Batching is as much a correctness feature as a performance one.

This is also the real explanation for why state appears "asynchronous." It isn't async in the promise sense — nothing is awaiting anything. It's **scheduled**: the update sits in a queue until React processes it, which is after your function has finished running. Combined with the fact that the state variable in the current render is a frozen snapshot, that fully explains why reading state immediately after setting it gives the old value.

Before React 18, batching applied **only inside React's own event handlers**. Updates in a promise callback, a `setTimeout`, or a native event listener each triggered their own render, because those code paths didn't flow through React's batching wrapper. React 18's `createRoot` routes everything through the scheduler, so batching became **automatic everywhere**.

`flushSync` is the deliberate escape hatch — it forces a synchronous render, which you occasionally need when the next line of code must read an updated DOM. Using it routinely defeats the point of batching.

---

<a name="concurrent"></a>
# 6. Concurrent Rendering

> **Concurrent rendering** — React's ability to prepare multiple versions of the UI at the same time, interrupting, pausing, resuming or abandoning render work so urgent updates are never blocked by less urgent ones.

## What "concurrent" does and doesn't mean

The word causes trouble, so start by ruling out the wrong reading. **This is not multithreading.** There are no workers, no parallelism, and everything still runs on a single thread. React cannot render two components simultaneously any more than it could before.

"Concurrent" here means *interleaved* — React can have several renders in flight and switch between them, in the same way an operating system interleaves processes on one CPU core. Nothing runs at the same instant; the machine just switches fast enough that everything stays responsive.

## The problem it addresses

Before concurrent features, every update was equally urgent and every render ran to completion. Consider a search box that filters ten thousand rows. Each keystroke sets state, which triggers a render, which performs the filtering — say 200 milliseconds. During those 200ms the main thread is busy, so **the character the user typed cannot appear on screen**. The input lags behind the keyboard, which is one of the most viscerally broken-feeling things an interface can do.

The pre-concurrent workaround was **debouncing**: wait 300ms after typing stops, then filter. It works, but it's a blunt instrument. It delays the results for everyone regardless of how fast their machine is, it's a guessed constant rather than a response to actual conditions, and if you debounce the input value itself you delay the feedback the user most wanted to be instant.

## What concurrent rendering does instead

The insight is that the problem isn't the amount of work — it's that all of it was treated as equally urgent. Concurrent rendering lets you **say which update matters more**.

```jsx
function handleChange(e) {
  setQuery(e.target.value);                       // urgent — the input must feel instant
  startTransition(() => {
    setResults(filterHugeList(e.target.value));   // non-urgent — interruptible
  });
}
```

Now there are two updates with different priorities from a single event. The input update commits immediately, so the character appears at once. The filtering renders in the background in interruptible slices — and if another keystroke arrives mid-render, that work is **thrown away** and restarted with the newer query rather than being completed and committed with a stale result.

```
type "R"   → start filtering...
type "Re"  → ABANDON that work, restart with "Re"
type "Rea" → ABANDON, restart with "Rea"
(pause in typing) → finish → commit results
```

The difference from debouncing is worth naming precisely: **debouncing is a guess about timing; a transition is a statement about importance.** React figures out the timing from actual conditions — a fast machine may complete the filtering between keystrokes and never need to abandon anything, while a slow one degrades gracefully.

`useDeferredValue` provides the same capability from the other direction, for when you receive a value rather than owning the setter that produces it.

## What it costs

Concurrency is why several rules that previously seemed pedantic became genuinely load-bearing.

**The render phase must be pure.** This was always the documented rule, but before concurrency you could often violate it without consequence, because render ran once per update. Now a render may run several times for one logical update and have its results discarded, so a side effect in render can fire two or three times, or fire for a tree that's never committed.

**Strict Mode double-invokes components and effects in development** precisely to surface code that breaks this assumption. It's not arbitrary strictness; it's a test for a property concurrency now depends on.

**Tearing became possible.** This is the subtle one.

> **Tearing** — a visual inconsistency where, during one concurrent render pass, different components read different values of the same external data source.

If a component reads state that lives outside React — a Redux store, `localStorage`, `navigator.onLine` — and React pauses mid-render, that external state can change during the pause. Components rendered before the pause then hold the old value while components rendered after hold the new one, and both get committed together. One render pass, two different truths, visible on screen at the same time.

This cannot happen with React state, because React controls it and keeps it consistent for the duration of a render. It only arises at the boundary with external stores, which is exactly why `useSyncExternalStore` was added — it gives React a formal way to read an external source and guarantee a consistent snapshot across a render pass. This is why every state-management library had to adopt it to work correctly with React 18.

## How you turn it on

Concurrent features are **opt-in per update, not per application**. Using `createRoot` from React 18 makes them available, but simply upgrading doesn't make your renders interruptible — regular `setState` still renders eagerly and synchronously.

A render becomes concurrent only when something marks it: `startTransition`, `useDeferredValue`, or a Suspense boundary. This gradual-adoption design is deliberate — it let React 18 ship without breaking existing applications, and it means you can introduce concurrency exactly where you've measured a problem.

| | Legacy rendering | Concurrent rendering |
|---|---|---|
| Update priority | all equal | urgent vs transition vs idle |
| A long render | blocks input and paint | yields every ~5ms |
| Stale in-progress work | must complete | discarded and restarted |
| Handling slow updates | debounce (a timing guess) | mark as a transition (a statement of importance) |
| Enables | — | Suspense, streaming SSR, `useDeferredValue` |

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

## The claim to be careful about

The common statement is "the Virtual DOM is faster than the real DOM," and it's the answer interviewers are usually probing when they ask about it — because it's not right.

The comparison is category-confused to begin with: the Virtual DOM isn't an alternative to the DOM, it's a staging layer *in front of* it. Every change still ends up in the real DOM. Nothing is avoided; the question is only how much.

And on raw speed, **React is slower than well-written manual DOM code.** If you know that exactly one text node changed and you write `node.textContent = "1"`, that beats React's approach, which additionally builds a full element tree, builds or reuses a fiber tree, walks both trees comparing, produces an effect list, and then does the same single write. The Virtual DOM adds work — that's simply true.

## What it actually buys

Three things, none of which is "raw speed."

**Consistently near-optimal updates without effort.** The hand-written version is faster, but only if you write it correctly every time, for every interaction, in every component, and keep it correct through every refactor. In practice nobody does. React's floor is much higher than a typical hand-written implementation's average, and it stays high as the application grows.

**Batching and ordering.** Because React computes the full change set before touching the DOM, it can apply everything in one coordinated pass. A naive implementation performs its writes as it discovers them, interleaved with reads, which is exactly the layout-thrashing pattern from §1. React eliminates that by construction.

**A programming model.** This is the largest benefit and the one least related to performance. You describe *what the UI is for the current state* instead of *how to transition from one state to another*. That eliminates an entire category of bug — the "I forgot to reset that class on the error path" family — which is what made React worth adopting in the first place.

> **Interview phrasing:** *"The Virtual DOM isn't a performance trick that beats manual DOM work — hand-optimized imperative code wins on raw speed because React adds a diffing step. It's a way to get near-optimal updates while writing declarative code. The real win is that React computes the whole change set before touching the DOM, so it batches mutations and avoids layout thrashing, and that you never have to hand-write transition logic."*

---

<a name="keys"></a>
# 8. Keys & O(n) Diffing

## Why the naive approach is impossible

Comparing two arbitrary trees and computing the minimal set of transformations between them is a well-studied problem, and the optimal algorithms run in **O(n³)**. That's not a hand-wave — it's the actual complexity of general tree edit distance.

For a UI, that's fatal. A modest page has a thousand nodes, and a billion operations per update is not something you can do sixty times a second. A general-purpose diffing algorithm cannot be used for rendering, full stop.

## React's trade

React reaches **O(n)** — a single pass — not by finding a cleverer algorithm but by **declining to solve the general problem**. It adopts two assumptions that are almost always true of real user interfaces, and accepts producing non-minimal results in the cases where they aren't:

**Assumption 1: elements of different types produce entirely different trees.** If a `<div>` becomes a `<section>`, React doesn't search inside for salvageable subtrees. It destroys and rebuilds. In practice this is nearly always right — when a wrapper's type changes, the content genuinely is different — and searching for cross-type similarities is precisely the expensive part of the general algorithm.

**Assumption 2: the developer can tell React which children are stable across renders.** That hint is the `key`. Without it, matching children between two lists would require the expensive general comparison; with it, matching is a hash lookup.

Both assumptions convert a search problem into a lookup problem, which is what collapses the complexity.

## What a key actually promises

> **A key is a promise: "this element represents the same logical item as the element with this key in the previous render."**

That framing explains everything about how keys behave. React takes the promise at face value — it doesn't verify it and can't. When you supply a key, you are asserting identity, and React acts on that assertion. If the assertion is false, React does exactly the wrong thing with complete confidence.

Which is why the index-as-key bug is so severe. An index asserts "the item at position 0 last render is the same logical item as the item at position 0 this render" — a statement that is false the moment anything is inserted, deleted, filtered, or sorted. React believes it, applies the same-type rule, keeps the existing DOM node, and swaps its contents. Everything attached to that node — a checkbox's checked state, an input's typed text, focus, scroll position, an in-progress animation — stays put and now belongs to a different item.

The result is a UI that displays correct data with incorrect state attached to it. No error, no warning, nothing to catch in a test that only checks rendered text. It's the most convincing argument in React for understanding a mechanism rather than following a rule.

## The rules, and their reasons

| Rule | Reason |
|---|---|
| **Stable across renders** | the key *is* the identity. `Math.random()` gives every item a new identity each render, so React destroys and recreates every node, every time — worse than no key |
| **Unique among siblings only** | matching happens within one list, so two separate lists may both use `1, 2, 3` without conflict |
| **On the outermost element returned from `.map()`** | React matches the children of one parent; a key on a nested element is matching in the wrong list |
| **Not readable as a prop** | React consumes it for reconciliation; pass it again under another name if the component needs the value |

Index keys are acceptable in exactly one situation, and all three conditions must hold: the list is genuinely static — never reordered, filtered, inserted into or deleted from — the items hold no state of any kind, and no stable identifier exists. In practice that's rare enough that reaching for an index should feel like a decision rather than a default.

## What the heuristics cost

React's diff is linear but **not minimal**, and it's worth knowing where it gives up ground. Moving a subtree from one parent to a different parent destroys and recreates it, because React never compares nodes across different levels of the tree — it only ever compares a node with the node in the same position in the other tree, and children with children of the same parent.

So relocating a large component in the hierarchy loses all its state and rebuilds its DOM, even though an ideal algorithm would recognise it as a move. React accepts that: near-optimal results at linear cost beats optimal results at cubic cost, and the case is rare enough in real interfaces that the trade is clearly worth it.

---

<a name="interview"></a>
# 9. Interview questions & answers

### Q: "What is the Virtual DOM?"
> *"An in-memory tree of plain JavaScript objects — React Elements — describing what the UI should look like. When state changes, React builds a new tree, compares it with the previous one, and derives the minimal set of real DOM operations. It exists because those objects are cheap to create and compare, while real DOM mutations are expensive since they can trigger style recalculation, layout and paint."*

### Q: "Is the Virtual DOM faster than the real DOM?"
> *"That comparison doesn't quite work — the Virtual DOM is a staging layer in front of the DOM, not a replacement for it. And it's not faster than well-written manual DOM code: hand-optimized imperative updates beat React because React adds a diffing step on top of the same final write. What it gives you is consistently near-optimal updates while you write declarative code, and because React computes the whole change set before touching the DOM, it batches mutations and avoids layout thrashing."*

### Q: "Why are DOM operations expensive?"
> *"Not because setting a property is slow, but because of what follows. Changing geometry forces the browser to recalculate styles and re-run layout, which is interdependent across the tree — one element's width can cascade through thousands of nodes. It gets worse with layout thrashing, where alternating writes and reads forces a synchronous layout on every iteration instead of one batched layout at the end."*

### Q: "What is reconciliation?"
> *"The algorithm React uses to compare the new element tree with the previous one and determine the minimum DOM changes. The general tree-diffing problem is O(n³), which is unusable for a UI, so React gets to O(n) by declining to solve the general problem: it assumes elements of different types produce entirely different trees, so it destroys rather than searching for similarities, and it relies on keys to tell it which children correspond across renders. Both assumptions turn a search into a lookup."*

### Q: "What happens when an element's type changes?"
> *"React tears down the entire old subtree and builds the new one from scratch — all component state inside is lost and DOM nodes are recreated. It never tries to find similarities across a type change. That's also the mechanism behind using a `key` to reset a component: changing the key makes React treat it as a different element and remount it."*

### Q: "What do keys do and why is index-as-key a problem?"
> *"A key is a promise that this element is the same logical item as the one with that key last render. React takes the promise at face value — it can't verify it. An index asserts that position equals identity, which is false as soon as anything is inserted, deleted or reordered. React believes it, applies the same-type rule, keeps the existing DOM node and swaps the content — so the node's state, like a checked checkbox or typed input, stays put and now belongs to the wrong item. It's a correctness bug that produces correct data with wrong state attached, and nothing throws."*

### Q: "What is Fiber and what problem did it solve?"
> *"React 16's reconciliation engine. The old reconciler traversed the tree with recursion, and the fundamental problem isn't that recursion is slow — it's that its position lives in the call stack, which you don't control, so it can't be paused. Once a render started it ran to completion, blocking the main thread; a large render froze input and animation for hundreds of milliseconds, and there was no way to say one update mattered more than another. Fiber represents the tree as a linked list with child, sibling and return pointers and processes it in an explicit loop, so the traversal position is a variable React owns. That's what lets it yield to the browser every few milliseconds and resume."*

### Q: "Did Fiber make React faster?"
> *"No — a render performs the same total work and takes about the same total time; the bookkeeping adds slight overhead. What it made the work is divisible and abandonable, which is an architectural change rather than a performance one. That's what enabled everything since: priority lanes, transitions, Suspense, streaming SSR. The user-facing improvement is responsiveness — the same 300ms happens in sixty small slices with the browser free in between, so the interface never freezes."*

### Q: "What is a fiber node?"
> *"An object per component holding both the work to be done and the pointers to traverse without recursion: type, key, the corresponding DOM node, child, sibling and return pointers, pending and memoized props, memoized state — which is where the hooks linked list lives — effect flags, priority lanes, and an alternate pointer to its counterpart in the other tree."*

### Q: "What are the two trees React maintains?"
> *"The current tree, corresponding to what's on screen, and the work-in-progress tree React is building. Each fiber's `alternate` points to its counterpart, so fibers are reused between renders rather than reallocated. React builds into the WIP tree without touching anything visible and commits by swapping a single pointer. It's double buffering — never show a partially drawn frame — and it's why abandoning a render is free: the incomplete work only ever existed in a tree nobody was displaying."*

### Q: "Explain the render phase versus the commit phase."
> *"The render phase calls components, builds the new tree and diffs it, producing a list of DOM changes. It's pure and interruptible — React may pause, restart or discard it, so it can run several times for one logical update. The commit phase applies those changes to the DOM and runs effects; it's synchronous and uninterruptible, because a half-applied UI would be visibly broken. That split is the reason side effects belong in effects and 'did' lifecycle methods rather than in render."*

### Q: "What happens in the commit phase exactly?"
> *"Three sub-phases. Before mutation, where the DOM is still the old version — `getSnapshotBeforeUpdate` runs there to measure things like scroll position. Mutation, where React inserts, updates and deletes nodes, runs layout-effect cleanups and `componentWillUnmount`, and swaps the current pointer. Then layout, where the DOM is new but not yet painted — `componentDidMount`, `componentDidUpdate` and `useLayoutEffect` run and refs are attached. After the browser paints, passive effects — `useEffect` — run asynchronously."*

### Q: "Why does `useLayoutEffect` prevent a flicker?"
> *"It runs in the layout sub-phase of the commit, after the DOM is updated but before the browser paints, so a measure-and-adjust happens within the same frame and the intermediate state is never visible. `useEffect` runs after paint, so the same adjustment shows as a flash. The trade-off is that `useLayoutEffect` blocks painting, so slow work there delays the frame directly."*

### Q: "What is concurrent rendering?"
> *"React's ability to work on multiple versions of the UI at once — pausing, resuming and abandoning render work so urgent updates aren't blocked. It's not multithreading; it's interleaving on one thread, like an OS switching between processes on one core. Updates carry priorities, so a keystroke can interrupt a heavy list render, and the interrupted work is discarded and restarted with fresh input rather than committing a result computed from stale state."*

### Q: "How is a transition different from debouncing?"
> *"Debouncing is a guess about timing — you pick a delay constant and it applies to everyone regardless of their machine, and it delays the results for everybody. A transition is a statement about importance: you tell React this update matters less than input, and React works out the timing from actual conditions. On a fast machine the work may finish between keystrokes and never be interrupted; on a slow one it degrades gracefully instead of hitting a fixed delay."*

### Q: "Do you have to do anything to get concurrent rendering?"
> *"You need `createRoot` from React 18, but it's opt-in per update rather than per app — upgrading alone doesn't make renders interruptible. A render becomes concurrent only when something marks it: `startTransition`, `useDeferredValue`, or Suspense. That gradual-adoption design is deliberate, so React 18 could ship without breaking existing apps."*

### Q: "What is tearing?"
> *"A visual inconsistency where, during one concurrent render pass, different components read different values of the same external data source — because React paused mid-render and the store changed during the pause. Components rendered before and after the pause hold different values and both get committed. It can't happen with React state, since React keeps that consistent for the duration of a render; it only arises at the boundary with external stores. `useSyncExternalStore` guarantees a consistent snapshot, which is why Redux and Zustand had to adopt it for React 18."*

### Q: "Why does a parent re-rendering re-render all its children?"
> *"Because React doesn't check whether props changed before calling a child. Comparing props costs something too, and for most components re-running the function is cheaper than checking whether you need to. It also matters less than it sounds: the child usually produces an identical tree, the diff finds nothing, and no DOM operations happen. `React.memo` opts a component out of that default, which is worth it only when the component is genuinely expensive."*

### Q: "Does a re-render mean a DOM update?"
> *"No. A re-render just means the component function ran again and produced a new element tree. React diffs it, and only actual differences reach the real DOM. That's why most 'unnecessary re-renders' are harmless — the wasted work is the render and the diff, not DOM writes."*

### Q: "Where does an update start from?"
> *"From the component whose state changed, propagating downward — not from the root. Everything above and beside it is untouched. That's the real performance argument for keeping state as low in the tree as possible: lifting state to the root means every update re-renders the entire application, including siblings whose props haven't changed."*

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
| **Keys** | A promise of identity across renders. Index keys assert position = identity, which is false the moment a list changes. |
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
                the win: near-optimal updates for free + batching (no thrashing)
                         + the declarative model itself

FIBER           a persistent WORK UNIT per component:
                {type, key, stateNode, child, sibling, return,
                 pendingProps, memoizedProps, memoizedState(hooks),
                 flags, lanes, alternate}
                child/sibling/return → traversable by LOOP, not recursion
                ⭐ THE INSIGHT: traversal position becomes a VARIABLE React owns,
                   not the call stack → so it can pause and resume
                two passes per node: BEGIN (down, build children)
                                     COMPLETE (up, bubble effect flags)

BEFORE FIBER    stack reconciler: recursion — position lives in the CALL STACK,
                which you don't control → CANNOT pause → 300ms freezes,
                and NO concept of priority

DOUBLE BUFFER   current tree (on screen) ↔ work-in-progress tree (being built)
                linked by `alternate` (fibers are REUSED, not reallocated)
                commit = ONE pointer swap
                → abandoning a render is FREE (nothing was displaying it)

RENDER          React CALLED YOUR FUNCTION. Produces elements. NO DOM touched.
                render ≠ commit ≠ paint
                50 renders can cause 0 DOM operations
TRIGGERS        1. initial mount  2. setState in this component  3. PARENT re-rendered
                React does NOT check props first (comparing costs too) — memo opts out
                NOT triggered by: mutating a variable / object in state / a ref
STARTS FROM     the component whose state changed, propagating DOWN — not the root
                → the real reason to keep state LOW in the tree
MOUNT vs UPDATE mount: no previous tree → everything is a Placement, one insertion
                update: built against the existing tree, only differences flagged
                → remounting unnecessarily is expensive

RECONCILIATION  compare new tree vs old → minimal DOM change list
DIFFING         general tree diff is O(n³) — a BILLION ops for 1000 nodes, unusable
                React = O(n) by DECLINING the general problem, via 2 assumptions:
                  1. DIFFERENT TYPE → destroy the subtree, rebuild
                     (don't search for similarities — that's the expensive part)
                     (all state lost — this is how key={id} resets a component)
                  2. the DEVELOPER supplies identity → the KEY
                     (turns matching from a search into a lookup)
                same TYPE → keep the node, patch changed props
                     (focus, scroll, selection, transitions, state all survive)
                output: the EFFECT LIST — fibers flagged Placement/Update/Deletion
                COST: moving a subtree across parents = destroy + recreate
                      (React never compares across tree levels)

KEYS            ⭐ a PROMISE: "same logical item as the key with this value last render"
                React takes it at FACE VALUE — it can't verify it
                no key → match by POSITION → inserting at the front rewrites every row
                index  → asserts position = identity → FALSE on any insert/delete/sort
                         → React keeps the node and swaps the content
                         → STATE ATTACHES TO THE WRONG ITEM
                         → correct data, wrong screen, NOTHING THROWS
                rules: stable (never Math.random) · unique among SIBLINGS
                       · outermost mapped element · not readable as a prop
                index OK only if: static list AND no state AND no stable id

RENDER PHASE    calls components · builds elements · builds the WIP fiber tree
                · reconciles · diffs · flags fibers
                PURE · INTERRUPTIBLE · NO DOM touched · MAY RUN SEVERAL TIMES
                → this is WHY side effects can't live in render

COMMIT PHASE    synchronous, UNINTERRUPTIBLE (a half-applied UI would be broken)
                1. BEFORE MUTATION  old DOM still present → getSnapshotBeforeUpdate
                2. MUTATION         DOM writes · layout-effect cleanups
                                    · componentWillUnmount · SWAP current pointer
                3. LAYOUT           new DOM, NOT yet painted → componentDidMount/Update
                                    · useLayoutEffect · refs attached
                → 🎨 PAINT →  passive effects: useEffect (async, after paint)

SCHEDULING      ONE main thread shared by JS, layout, paint and input
                ~5ms slices (inside a 16ms frame), then YIELD
                total work unchanged — the browser just gets regular openings
                LANES (urgent → idle):
                  discrete input (click/key) > continuous (scroll/drag)
                  > default setState > transition > idle
                  (ordering is PERCEPTUAL — humans notice input delay most)
                higher priority INTERRUPTS lower → the WIP tree is DISCARDED
                  and RESTARTED (not resumed — the inputs likely changed)
                BATCHING: React 17 = only React handlers · React 18 = EVERYWHERE
                          (createRoot routes everything through the scheduler)
                          escape hatch: flushSync
                "state seems async" = it's SCHEDULED (queued), plus the snapshot rule

CONCURRENT      interleaving on ONE thread — NOT multithreading, no parallelism
                BEFORE: all updates equally urgent + blocking
                        workaround = DEBOUNCE (a guessed constant, delays everyone)
                AFTER:  startTransition / useDeferredValue mark work NON-URGENT
                        → keystroke commits instantly, heavy render yields,
                          stale work is thrown away and restarted
                ⭐ debounce = a guess about TIMING · transition = a statement of IMPORTANCE
                opt-in PER UPDATE (createRoot enables; marking activates)
                COSTS: render must be PURE (may run many times, results discarded)
                       · Strict Mode double-invokes to expose impurity
                       · TEARING at the boundary with EXTERNAL stores
                         (React state can't tear — React keeps it consistent)
                         → useSyncExternalStore guarantees one snapshot per pass

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
- **[Part 7 — Hooks](07-hooks.md):** `memoizedState` on a fiber *is* the hooks linked list; `useLayoutEffect` vs `useEffect` is commit-phase timing; `useSyncExternalStore` exists because of tearing.
- **[Part 9 — Performance](09-performance.md):** why children re-render by default, and when memoization is actually worth it.
- **Suspense & SSR:** streaming and selective hydration, both built on Fiber's interruptibility.

## Suggested next topics

1. **Custom Hooks** — recommended next.
2. **React Patterns** — compound components, control props, provider pattern.
3. **Suspense, SSR & CSR** — streaming, hydration, Next.js.

*— End of Part 8: Rendering Internals & the Virtual DOM —*

