# React Study Notes — Part 20

## Portals, Refs & Modals (createPortal, Event Bubbling through Portals, the native `<dialog>`, Focus Management, Callback Refs, Popovers & Tooltips)

> **Why this part exists:** every app has modals, dropdowns, tooltips and toasts — and they're where z-index bugs, "clicks go through the overlay," lost keyboard focus and accessibility failures happen. "Build a modal" is also a common machine-coding round.
>
> **Continues from:** [Part 7 §9–10](07-hooks.md) (`useRef`, `forwardRef`, `useImperativeHandle`) · [Part 13 §6](13-react-19-and-19-2.md) (ref as a prop, ref cleanup).

---

## Table of Contents

1. [The problem: "trapped" inside a parent](#problem)
2. [⭐ `createPortal`](#portal)
3. [⭐ Events bubble through the React tree, not the DOM](#bubbling)
4. [⭐ Building an accessible modal](#modal)
5. [The native `<dialog>` element](#dialog)
6. [Refs in depth: callback refs, lists of refs, measuring](#refs)
7. [Tooltips, dropdowns and positioning](#positioning)
8. [Interview Q&A](#interview)
9. [Cheat Sheet](#cheatsheet)

---

<a name="problem"></a>
# 1. The problem: "trapped" inside a parent

```jsx
<div className="card" style={{ overflow: 'hidden', position: 'relative', zIndex: 1 }}>
  <button onClick={() => setOpen(true)}>Delete</button>
  {open && <Modal />}          {/* ❌ clipped by overflow:hidden, stuck under other z-index layers */}
</div>
```

CSS `overflow: hidden`, `transform`, and stacking contexts (`z-index`) on **any ancestor** can clip or bury the modal — no matter how big its own `z-index` is.

> **Analogy 🖼️ — a poster inside a picture frame.** However big the poster, the frame cuts it off. A portal hangs the poster directly on the wall instead.

---

<a name="portal"></a>
# 2. ⭐ `createPortal`

`createPortal(children, domNode)` renders `children` into **a different DOM node** — usually directly under `<body>` — while it stays **in the same place in the React tree**.

```jsx
import { createPortal } from 'react-dom';

function Modal({ children }) {
  return createPortal(
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true">{children}</div>
    </div>,
    document.body                                   // or document.getElementById('modal-root')
  );
}
```

What stays the same as normal rendering:
- **props, state, and context** still come from where the component sits in the React tree (the modal can use the page's `ThemeContext`);
- it re-renders and unmounts with its parent.

What changes: only **where the DOM nodes live**.

Uses: modals, dialogs, toasts, tooltips, dropdown menus, full-screen overlays. With SSR, render portals only after mount (`document` doesn't exist on the server).

---

<a name="bubbling"></a>
# 3. ⭐ Events bubble through the React tree, not the DOM

A surprise interviewers like: an event inside a portal **bubbles to its React parents**, even though in the DOM it's somewhere else.

```jsx
function Card() {
  return (
    <div onClick={() => console.log('card clicked')}>
      <Modal><button>OK</button></Modal>       {/* the button's DOM is under <body> */}
    </div>
  );
}
// clicking OK logs "card clicked" — React bubbles along the COMPONENT tree
```

Usually helpful (handlers above the modal still work). When it isn't — a click inside the modal triggering the card's onClick — call `e.stopPropagation()` in the modal content, or check `e.target`.

---

<a name="modal"></a>
# 4. ⭐ Building an accessible modal

A modal is accessible when:

| Requirement | Why |
|---|---|
| `role="dialog"` + `aria-modal="true"` + `aria-labelledby` (its title) | screen readers announce it as a dialog with a name |
| **move focus into it** on open (first field or the dialog itself) | keyboard users start inside |
| **trap focus** — Tab cycles inside the modal | they can't tab "behind" it |
| **Escape closes** it | standard keyboard behaviour |
| **return focus** to the button that opened it on close | users don't lose their place |
| the page behind is **inert** (not clickable or readable) and doesn't scroll | otherwise screen readers wander behind |
| clicking the backdrop closes it (usually) | expected behaviour |

```jsx
function Modal({ open, onClose, title, children }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement;          // remember the opener
    dialogRef.current?.focus();                                // move focus in
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';                   // stop background scroll
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previouslyFocused?.focus();                              // return focus
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="backdrop" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="modal-title"
           tabIndex={-1} className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="modal-title">{title}</h2>
        {children}
        <button onClick={onClose}>Close</button>
      </div>
    </div>,
    document.body
  );
}
```

⚠️ Because `onClose` is a dependency, a parent that passes a new inline function on every render (`onClose={() => setOpen(false)}`) makes this effect re-run each render — focus jumps back to the dialog. Wrap the handler in `useCallback` in the parent, or read it through `useEffectEvent` (React 19.2, [Part 13 §10](13-react-19-and-19-2.md)) so the effect only depends on `open`.

This still lacks a proper **focus trap** (Tab can leave the dialog) — which is why in practice you use the native `<dialog>` (next section) or a headless library: **Radix UI Dialog**, **React Aria**, **Headless UI**, or MUI's `Modal`. They handle trapping, inert backgrounds, scroll locking and screen-reader edge cases.

> 🧠 **Remember the modal checklist:** **portal · role/label · focus in · trap · Escape · focus back · background inert.**

---

<a name="dialog"></a>
# 5. The native `<dialog>` element

Modern browsers have a built-in modal that does most of the hard parts:

```jsx
function ConfirmDialog({ open, onClose, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();     // modal: backdrop, focus moved in, page inert
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="confirm-title">   {/* onClose fires on Escape too */}
      <h2 id="confirm-title">Are you sure?</h2>
      {children}
      <form method="dialog"><button>Cancel</button></form>                  {/* closes the dialog */}
    </dialog>
  );
}
```

`showModal()` gives you: the **top layer** (always above everything — no portal or z-index needed), a `::backdrop` you can style, **Escape to close**, focus moved inside, and the rest of the page made **inert**. It also returns focus on close in modern browsers. Similar built-in: the **`popover`** attribute for non-modal popups (menus, tooltips) with light-dismiss.

---

<a name="refs"></a>
# 6. Refs in depth: callback refs, lists of refs, measuring

**Callback refs** — a function React calls with the DOM node (and, in React 19, whose returned function runs on removal):

```jsx
<input ref={(node) => { node?.focus(); }} />             // focus when it appears

<div ref={(node) => {                                    // measure / observe (React 19 cleanup)
  if (!node) return;
  const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
  ro.observe(node);
  return () => ro.disconnect();
}} />
```

Use a callback ref when you need to **react to the element appearing** (it may render later, conditionally) — a `useRef` + `useEffect` can miss elements that mount after the effect ran.

**A ref for every item in a list** — one `Map` in a ref, not an array of `useRef`s (hooks can't be called in loops):

```jsx
const itemRefs = useRef(new Map());

{items.map(item => (
  <li key={item.id} ref={(node) => {
    if (node) itemRefs.current.set(item.id, node);
    return () => itemRefs.current.delete(item.id);
  }}>{item.name}</li>
))}

// later
itemRefs.current.get(selectedId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
```

**Measuring before paint** (to position a tooltip without a flicker) → read the DOM in `useLayoutEffect` ([Part 7 §10](07-hooks.md)).

**Exposing methods instead of the DOM node** (`play()`, `reset()`) → `useImperativeHandle` ([Part 7 §10](07-hooks.md)) — sparingly.

⚠️ Refs are for **imperative escape hatches** (focus, scroll, measure, third-party widgets, media). If you're using a ref to change what's displayed, it should probably be state.

---

<a name="positioning"></a>
# 7. Tooltips, dropdowns and positioning

Positioning a popup next to its trigger, **flipping** it when there's no space below, keeping it on screen while scrolling, and closing it on outside-click and Escape is fiddly. Don't hand-roll it:

- **Floating UI** (`@floating-ui/react`) — positioning, flipping, shifting, plus hooks for hover/focus/dismiss and accessibility roles.
- **Headless component libraries** — Radix UI (Popover, Tooltip, DropdownMenu), React Aria, Headless UI — fully accessible, unstyled; **shadcn/ui** is a popular set of styled components built on Radix.
- **CSS anchor positioning** and the **`popover`** attribute are the coming native solutions (check browser support).

"Click outside to close" without breaking things:

```jsx
useEffect(() => {
  if (!open) return;
  const onPointerDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
  document.addEventListener('pointerdown', onPointerDown);
  return () => document.removeEventListener('pointerdown', onPointerDown);
}, [open]);
```

(If the popup is in a portal, check both the trigger's and the popup's elements.)

---

<a name="interview"></a>
# 8. Interview Q&A

### Q: "What is a portal and when do you use one?"
> *"`createPortal` renders children into a different DOM node — usually `document.body` — while keeping them in the same place in the React tree, so props, state and context work normally. I use it for modals, tooltips, dropdowns and toasts, so ancestors' `overflow: hidden` or stacking contexts can't clip or hide them."*

### Q: "If a button inside a portal is clicked, does a parent's onClick fire?"
> *"Yes. React events bubble through the React component tree, not the DOM tree, so a click inside a portal reaches React ancestors even though the DOM nodes live elsewhere. If that's unwanted, stop propagation inside the portal content."*

### Q: "How do you build an accessible modal?"
> *"Render it in a portal with `role='dialog'`, `aria-modal` and a label; move focus into it on open, trap Tab inside, close on Escape, return focus to the opener on close, and make the background inert and non-scrolling. In practice I'd use the native `<dialog>` with `showModal()` — which provides the top layer, backdrop, Escape and inertness — or a headless library like Radix or React Aria."*

### Q: "Callback ref vs `useRef`?"
> *"`useRef` gives a stable box whose `.current` React sets. A callback ref is a function React calls when the element mounts — and in React 19 its returned cleanup runs when it unmounts — so it's better for reacting to an element that appears later, measuring, attaching observers, or keeping refs to a dynamic list in a Map."*

### Q: "How would you handle refs for a list of items?"
> *"A single `useRef(new Map())` and a callback ref on each item that sets and deletes its entry by id. You can't call `useRef` inside a loop."*

---

<a name="cheatsheet"></a>
# 9. Cheat Sheet

```
PROBLEM: ancestor overflow/transform/z-index clips the modal — "poster cut by the frame"
createPortal(children, document.body) — DOM moves, React tree position (props/state/context) stays
events bubble through the REACT tree, not the DOM → stopPropagation inside if needed
SSR: no document on the server → portal after mount

MODAL CHECKLIST: portal · role="dialog" aria-modal aria-labelledby · focus in · TRAP
                 · Escape · focus back to opener · background inert + no scroll · backdrop click
→ native <dialog>.showModal() (top layer, ::backdrop, Escape, inert) · or Radix / React Aria / Headless UI
popover attribute for non-modal popups

REFS: callback ref (node) => {…; return cleanup} (React 19) — for late-mounting elements, observers
      list of refs → useRef(new Map()) + set/delete by id · measure before paint → useLayoutEffect
      expose methods → useImperativeHandle · refs = escape hatch, not display state
POSITIONING: Floating UI · Radix / React Aria / shadcn/ui · click-outside: pointerdown + contains()
```

---

## Connects to

- **[Part 7 — Hooks](07-hooks.md):** `useRef`, `useLayoutEffect`, `useImperativeHandle`.
- **[Part 21 — Accessibility](21-styling-and-accessibility.md):** focus management and ARIA in general.
- **[Angular Part 29](../Angular/29-angular-material-and-cdk.md):** the same problems solved by the Angular CDK Overlay.
- **[javascript Part 30](../javascript/30-events-in-depth.md):** event propagation in the DOM.

## Suggested next topics

1. **Styling & accessibility.**
2. **Machine coding:** build the modal and a dropdown from scratch.
