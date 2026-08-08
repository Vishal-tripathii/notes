# JavaScript Study Notes — Part 21

## DOM Manipulation & Event Delegation ⭐⭐⭐⭐⭐

**Topics:** querying/creating/modifying DOM nodes · event bubbling and capturing · event delegation.

---

## 1. Querying, Creating, Modifying Nodes

> **Definition:** the DOM (Document Object Model) is the tree of node objects representing an HTML document, which JS can query, create, and mutate at runtime to change what's rendered.

```js
document.getElementById('app');            // single element by id — fastest lookup
document.querySelector('.card.active');       // first match, full CSS selector syntax
document.querySelectorAll('.card');            // NodeList of ALL matches (static snapshot)

const el = document.createElement('div');
el.className = 'card';
el.textContent = 'Hello';                        // safe — treats content as plain text
el.innerHTML = '<b>Hello</b>';                     // parses as HTML — XSS risk with untrusted input
document.body.appendChild(el);
el.remove();                                          // modern, no parentNode.removeChild needed
```
**`textContent` vs `innerHTML`:** `textContent` sets literal text, safe against injecting markup/scripts. `innerHTML` parses its argument as HTML — assigning untrusted user input directly to `innerHTML` is a classic XSS vector.

## 2. Event Bubbling and Capturing

> **Definition — Bubbling:** after an event fires on its target element, it propagates **upward** through each ancestor in turn (target → parent → grandparent → ... → document) — the default phase most listeners run in.
> **Definition — Capturing:** the opposite direction — before reaching the target, the event first travels **downward** from the document through each ancestor to the target; a listener only runs during this phase if explicitly registered with `{ capture: true }`.

```js
// full event flow: CAPTURE phase (document → target) → TARGET → BUBBLE phase (target → document)
parent.addEventListener('click', () => console.log('parent capture'), { capture: true });
child.addEventListener('click', () => console.log('child target'));
parent.addEventListener('click', () => console.log('parent bubble')); // capture: false (default)

// clicking child logs: 'parent capture', 'child target', 'parent bubble'
```
`addEventListener`'s **third argument** (`options` object, or a boolean shorthand for `capture`) controls this — `{ capture: true }` (or just `true`) listens during the capture phase instead of the default bubble phase. Other useful options in that same object: `{ once: true }` (auto-removes after firing once), `{ passive: true }` (promises the handler won't call `preventDefault()`, letting the browser optimize scroll performance), and `{ signal: abortController.signal }` (removable via `AbortController`, [Part 20](20-browser-apis.md#4-abortcontroller)).

## 3. Event Delegation

> **Definition:** a pattern of attaching a **single** event listener to a common ancestor instead of one listener per individual child element, relying on event **bubbling** plus `event.target` (the actual element that triggered the event) to determine which specific child was interacted with.

```js
// WITHOUT delegation — one listener per item, re-attached every time an item is added
document.querySelectorAll('.list-item').forEach(item => {
  item.addEventListener('click', () => handleClick(item));
}); // items added LATER never get a listener unless you remember to re-run this

// WITH delegation — one listener on the parent, works for every current AND future item
document.querySelector('.list').addEventListener('click', (event) => {
  const item = event.target.closest('.list-item'); // find the actual item, even if the
  if (!item) return;                                   // click landed on a nested icon/span inside it
  handleClick(item);
});
```
**Why event delegation beats a listener per list item, concretely:**
- **Memory:** one listener total instead of N — matters a lot for large lists (thousands of rows).
- **"Just works" for dynamically added elements:** a new `.list-item` appended later is automatically covered, with zero extra code, since the listener lives on the stable parent, not the (possibly newly-created) child.
- **Simpler cleanup:** removing the list wholesale removes the single listener with it, instead of having to individually track and remove N listeners to avoid leaking them.

`event.target.closest(selector)` is the key piece — the actual element clicked might be a `<span>` or `<svg>` nested *inside* the list item, not the list item itself, and `closest()` walks up from there to find the nearest ancestor (or self) matching the selector.

---

## Interview Q&A

**Q: Why does event delegation beat a listener per list item?**
> Memory — one listener on a parent instead of one per child, which matters at scale with thousands of items. And it "just works" for elements added to the DOM later, since the listener already lives on a stable ancestor and relies on bubbling plus `event.target`/`closest()` to identify which child was actually clicked, rather than requiring a fresh listener attached at creation time for every new element.

**Q: Bubbling vs capturing, and what's `addEventListener`'s third argument for?**
> An event travels down from the document to the target first (capturing), then back up from the target to the document (bubbling) — most listeners run in the bubble phase by default. The third argument (a boolean, or an options object with `capture`) lets a listener opt into running during the capture phase instead, which is occasionally needed to intercept an event before a descendant's own handler runs, or to implement things like modal "click outside to close" logic reliably.

**Q: `textContent` vs `innerHTML` — when does the difference actually matter?**
> `textContent` always treats its argument as literal text; `innerHTML` parses it as HTML markup. It matters the moment untrusted or user-supplied content is involved — assigning it to `innerHTML` directly is a classic XSS vector, since any embedded `<script>` or event-handler attribute gets parsed and can execute. `textContent` is the safe default unless you specifically need to render markup, and even then it should go through a sanitizer first.

**Q: Predict what logs, and in what order.**
```js
document.body.addEventListener('click', () => console.log('body'));
document.getElementById('btn').addEventListener('click', () => console.log('button'));
// user clicks the button
```
> `button`, then `body` — the click fires on the target first (`button`), then bubbles up to `body`, whose listener (default bubble phase) fires next.

---

## Follow-ups (challenge questions)

- *Scale:* a table renders 50,000 rows, each with its own click listener for a "delete row" button — walk through the concrete memory/performance cost, and how delegating to a single listener on the `<table>` changes it.
- *Failure mode:* a delegated click handler uses `event.target.classList.contains('list-item')` instead of `event.target.closest('.list-item')` — what breaks the moment a list item contains any nested markup (an icon, a badge span) and a user clicks directly on that nested element?
- *Consistency:* `event.stopPropagation()` is called inside a capture-phase listener on a parent — does that also prevent the target's own listener from running, or only stop further propagation past that point? Trace the exact phase-by-phase effect.

---

**Previous:** [Part 20 — Browser APIs](20-browser-apis.md) · **Next:** [Part 22 — Performance Patterns](22-performance-patterns.md)
