# JavaScript Study Notes — Part 30

## Events in Depth ⭐⭐⭐⭐☆

**Topics:** `target` vs `currentTarget` · `preventDefault` vs `stopPropagation` vs `stopImmediatePropagation` · events that don't bubble (and their bubbling twins) · listener options (`once`, `passive`, `signal`) · removing listeners correctly · custom events · keyboard, input and form events · pointer events.

> **Continues from:** [Part 21](21-dom-manipulation-and-event-delegation.md) (bubbling, capturing, delegation). That part explains *how events travel*; this part covers the controls you use on them every day — and the questions interviewers use to check you've actually built UIs.

---

## 1. `event.target` vs `event.currentTarget`

> **Definition:** `event.target` is the element **where the event started** (what the user actually clicked). `event.currentTarget` is the element **whose listener is running right now**.

```html
<ul id="list">
  <li><span>Buy milk</span></li>
</ul>
```

```js
list.addEventListener('click', (e) => {
  e.target;          // the <span> — where the click actually happened
  e.currentTarget;   // the <ul>   — where THIS listener is attached
});
```

> **Analogy 🔔 — a doorbell in an apartment block.** `target` = the flat whose button was pressed. `currentTarget` = the person at the front desk currently hearing the ring.

They're the same element only when you click exactly the element with the listener. In event delegation you use `e.target.closest('li')` to find the item, and `e.currentTarget` when you need the container. ⚠️ `currentTarget` is only set **while the listener runs** — log the event later (or `await` first) and it's `null`.

---

## 2. Stopping things: three different methods

| Method | What it stops | What it does NOT stop |
|---|---|---|
| `e.preventDefault()` | the browser's **default action** — following a link, submitting a form, checking a checkbox, scrolling on a wheel event | the event still bubbles to other listeners |
| `e.stopPropagation()` | the event travelling to **other elements** (further up or down) | other listeners on the **same** element; the default action |
| `e.stopImmediatePropagation()` | other elements **and** the remaining listeners on the same element | the default action |

```js
form.addEventListener('submit', (e) => {
  e.preventDefault();             // stay on the page; handle the submit with fetch()
  save(new FormData(form));
});

link.addEventListener('click', (e) => {
  e.preventDefault();             // don't navigate
  openInModal(link.href);
});
```

> 🧠 **Remember:** `preventDefault` = **"browser, don't do your usual thing."** `stopPropagation` = **"other elements, don't hear about this."** They're unrelated — you often need one without the other.

⚠️ **Avoid `stopPropagation` as a habit.** It breaks event delegation, analytics and "click outside to close" logic elsewhere on the page that listen higher up. Prefer checking `e.target` in the outer handler.

`e.defaultPrevented` tells a later listener that someone already called `preventDefault()`.

---

## 3. Events that don't bubble — and their twins

Some events **don't bubble**, so event delegation on a parent never hears them:

| Doesn't bubble | Bubbling twin — use for delegation |
|---|---|
| `focus` / `blur` | **`focusin` / `focusout`** |
| `mouseenter` / `mouseleave` | **`mouseover` / `mouseout`** (fire again for child elements — filter with `e.target`) |
| `load`, `error` on images/scripts | listen in the **capture** phase on the parent: `addEventListener('error', fn, true)` |

```js
// highlight whichever field in the form has focus — one listener for all inputs
form.addEventListener('focusin', (e) => e.target.classList.add('active'));
form.addEventListener('focusout', (e) => e.target.classList.remove('active'));
```

`scroll` on an element doesn't bubble to `document` either (except the page's own scroll).

---

## 4. Listener options and removing listeners

```js
el.addEventListener('click', handler, {
  once: true,          // remove itself after the first call
  passive: true,       // promise: "I won't call preventDefault()" → browser can scroll immediately
  capture: true,       // run in the capture phase (Part 21 §2)
  signal: controller.signal,   // remove when controller.abort() is called
});
```

**`passive: true`** matters for `touchstart`, `touchmove` and `wheel`. Without it, the browser must wait for your handler before scrolling (in case you call `preventDefault`), which makes scrolling feel laggy. Browsers already default `touchstart`/`touchmove`/`wheel` on `window`/`document` to passive.

**Removing a listener needs the exact same function (and same `capture` value):**

```js
el.addEventListener('click', () => doThing());
el.removeEventListener('click', () => doThing());   // ❌ does nothing — a DIFFERENT function

const onClick = () => doThing();
el.addEventListener('click', onClick);
el.removeEventListener('click', onClick);           // ✅ same reference
```

Easiest modern way to remove many listeners at once — an `AbortController`:

```js
const controller = new AbortController();
window.addEventListener('resize', onResize, { signal: controller.signal });
window.addEventListener('keydown', onKey, { signal: controller.signal });
controller.abort();     // both removed — perfect for component cleanup
```

---

## 5. Custom events

Your own components can announce things using the same event system:

```js
// inside a <date-picker> component
this.dispatchEvent(new CustomEvent('date-change', {
  detail: { date: '2026-01-15' },   // your data goes in `detail`
  bubbles: true,                     // custom events DON'T bubble unless you say so
  composed: true,                    // cross Shadow DOM boundaries (web components)
}));

// anywhere above it
document.addEventListener('date-change', (e) => console.log(e.detail.date));
```

`dispatchEvent` runs listeners **synchronously**, like Node's `emit` ([nodejs Part 2.5](../nodejs/02.5-eventemitter-process-and-errors.md)). For a plain in-page event bus without DOM elements, `new EventTarget()` works too.

---

## 6. Keyboard, input and form events

**Keyboard:**
- Use **`keydown`** (`keypress` is deprecated).
- **`e.key`** = the character or name (`'a'`, `'Enter'`, `'Escape'`, `'ArrowUp'`) — use this for meaning. **`e.code`** = the physical key (`'KeyA'`) — use for games/shortcuts that depend on position, not language. `e.keyCode` is deprecated.
- Modifier keys: `e.ctrlKey`, `e.metaKey` (⌘ on Mac), `e.shiftKey`, `e.altKey`.
- `e.repeat` is `true` when the key is being held down.

**Text fields:**
- **`input`** fires on **every change** (typing, paste, autofill, drag-drop) — use it for live search and validation.
- **`change`** fires when the value is **committed** — text fields on blur, checkboxes/selects immediately.
- Typing in Chinese/Japanese/Korean: ignore `input` while `e.isComposing` is true (or between `compositionstart` and `compositionend`), or you'll search for half-typed characters.

**Forms:**
- Listen to the form's **`submit`**, not the button's `click` — `submit` also fires when the user presses Enter.
- `new FormData(form)` reads all the fields; `Object.fromEntries(new FormData(form))` gives a plain object.

---

## 7. Pointer events — mouse, touch and pen in one API

Instead of separate `mousedown`/`touchstart` handlers, use **pointer events**: `pointerdown`, `pointermove`, `pointerup`, `pointercancel`. `e.pointerType` tells you `'mouse'`, `'touch'` or `'pen'`.

For dragging, call `el.setPointerCapture(e.pointerId)` on `pointerdown` — the element keeps receiving moves even if the pointer leaves it. Add CSS `touch-action: none` on draggable elements so the browser doesn't scroll instead.

**`click` still works on touch screens** and with the keyboard (Enter/Space on buttons) — so for "do something when activated," `click` on a real `<button>` is the most accessible choice.

---

## Interview Q&A

**Q: `event.target` vs `event.currentTarget`?**
> `target` is where the event started — the element actually clicked, possibly a child. `currentTarget` is the element whose listener is running. In event delegation, the listener is on the parent, so `currentTarget` is the parent and I use `target.closest(...)` to find the item that was clicked.

**Q: `preventDefault` vs `stopPropagation`?**
> `preventDefault` stops the browser's default action — following a link, submitting a form — but the event still travels. `stopPropagation` stops the event reaching other elements but doesn't cancel the default action. `stopImmediatePropagation` also stops other listeners on the same element. I avoid `stopPropagation` unless necessary because it breaks delegation and outside-click handling elsewhere.

**Q: Why doesn't my delegated `focus` listener work?**
> `focus` and `blur` don't bubble. Use `focusin` and `focusout`, which do — or listen to `focus` in the capture phase.

**Q: Why doesn't `removeEventListener` remove my listener?**
> It needs the exact same function reference and the same capture setting. Passing a new arrow function creates a different function. Keep the handler in a variable, or register with an `AbortController` signal and call `abort()`.

**Q: What does `{ passive: true }` do?**
> It promises the handler won't call `preventDefault`, so the browser can start scrolling immediately instead of waiting for the handler. It makes touch and wheel scrolling smoother.

**Q: `input` vs `change` events?**
> `input` fires on every edit — typing, paste, autofill — so it's right for live search and validation. `change` fires when the value is committed — on blur for text fields, immediately for checkboxes and selects.

---

## Follow-ups (challenge questions)

- *Failure mode:* a dropdown closes when you click "outside" it, using a `document` click listener. Inside the dropdown, someone adds `stopPropagation()` to a button. What breaks, and how would you implement "click outside" without relying on propagation tricks?
- *Scale:* a canvas drawing app attaches `pointermove` handlers that redraw on every event (hundreds per second). How would `requestAnimationFrame` ([Part 32](32-browser-rendering-and-loading.md)) and `getCoalescedEvents()` help?

---

## Cheat Sheet

```
target = where it started · currentTarget = whose listener is running (null after await)
preventDefault = "browser, skip your default" · stopPropagation = "other elements, don't hear"
stopImmediatePropagation = also other listeners on the same element
avoid stopPropagation habitually (breaks delegation / click-outside)

don't bubble → use twins: focus/blur → focusin/focusout · mouseenter/leave → mouseover/out
img/script load/error → capture phase on the parent

options: once · passive (smooth scroll) · capture · signal (AbortController)
remove needs SAME function + same capture → or controller.abort()

CustomEvent(name, { detail, bubbles: true, composed }) · dispatchEvent is synchronous
keys: keydown + e.key (meaning) / e.code (position) · keyCode & keypress deprecated
input = every edit · change = committed · ignore while e.isComposing
form: listen to submit (Enter works) · Object.fromEntries(new FormData(form))
pointer events = mouse + touch + pen · setPointerCapture for drags · click on <button> = accessible
```

---

**Previous:** [Part 29 — Strict Mode & Coercion](29-strict-mode-and-coercion-deep-dive.md) · **Next:** [Part 31 — Proxy & Reflect](31-proxy-and-reflect.md)
