# React Study Notes — Part 21

## Styling & Accessibility (CSS Modules, Tailwind, CSS-in-JS, Component Libraries, Headless UI, Semantic JSX, Focus, ARIA, a11y Testing)

> **Why this part exists:** "How do you style components in your project, and why?" and "How do you make a React app accessible?" are both common — and the honest answers involve trade-offs, not a single right tool.
>
> **Continues from:** [Part 3](03-jsx-deep-dive.md) (`className`, `style`) · [Part 20](20-portals-refs-and-modals.md) (accessible modals) · [Angular Part 30](../Angular/30-accessibility-and-i18n.md) (the same accessibility principles, Angular flavour).

---

## Table of Contents

**Styling**
1. [The options at a glance](#options)
2. [CSS Modules](#modules)
3. [⭐ Tailwind CSS](#tailwind)
4. [CSS-in-JS — runtime vs zero-runtime](#cssinjs)
5. [Component libraries and headless UI](#libraries)
6. [Conditional classes, variants, theming](#variants)

**Accessibility**

7. [⭐ Semantic JSX first](#semantic)
8. [⭐ Keyboard and focus in React](#focus)
9. [ARIA in JSX, and announcing changes](#aria)
10. [Testing accessibility](#a11y-test)
11. [Interview Q&A](#interview)
12. [Cheat Sheet](#cheatsheet)

---

<a name="options"></a>
# 1. The options at a glance

| Approach | How | Pros | Cons |
|---|---|---|---|
| **global CSS / Sass** | `import './styles.css'` | simple, standard | class names collide across the app |
| **CSS Modules** | `import s from './Button.module.css'` → `s.primary` | scoped class names, plain CSS, zero runtime | separate files; dynamic styles via classes |
| **Tailwind** | utility classes in JSX: `className="px-4 py-2 rounded"` | fast to build, consistent design tokens, tiny CSS output | long class lists; a vocabulary to learn |
| **runtime CSS-in-JS** (styled-components, Emotion) | styles written in JS, injected at runtime | dynamic styles from props, co-located | runtime cost; awkward with Server Components and streaming |
| **zero-runtime CSS-in-JS** (vanilla-extract, Panda CSS, Linaria, StyleX) | written in TS, extracted to CSS at build time | type-safe, no runtime cost | build setup |
| **inline `style={{}}`** | style object | truly dynamic values (positions, progress %) | no pseudo-classes, media queries or hover |

> **Analogy 👗 — clothes.** Global CSS = one shared wardrobe (things get mixed up). CSS Modules = each person's own labelled drawer. Tailwind = a box of standard building pieces you combine. CSS-in-JS = a tailor making each outfit on the spot (flexible, but takes time).

Current mainstream picks: **Tailwind** or **CSS Modules**, often with a headless component library. Runtime CSS-in-JS is common in older codebases; styled-components announced **maintenance mode** in 2025, which pushed many teams away from runtime CSS-in-JS.

---

<a name="modules"></a>
# 2. CSS Modules

```css
/* Button.module.css */
.button { padding: 8px 16px; border-radius: 6px; }
.primary { background: var(--color-primary); color: white; }
```

```jsx
import styles from './Button.module.css';

<button className={`${styles.button} ${styles.primary}`}>Save</button>
// rendered: class="Button_button__x7a2 Button_primary__k91c" — unique, can't collide
```

Built into Vite and Next.js — no setup. Use **CSS variables** for theming (`var(--color-primary)`), switched by a class or `data-theme` on `<html>`.

---

<a name="tailwind"></a>
# 3. ⭐ Tailwind CSS

```jsx
<button className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700
                   focus-visible:outline focus-visible:outline-2 disabled:opacity-50">
  Save
</button>
```

- Each class does **one thing** (`px-4` = horizontal padding). Variants: `hover:`, `focus-visible:`, `disabled:`, `md:` (breakpoint), `dark:`.
- Only classes you **use** end up in the CSS file → tiny output.
- Design tokens (colours, spacing, fonts) are defined once in the theme — consistent UI across a team.
- **Don't build class names dynamically:** `` `bg-${color}-500` `` isn't detected by the scanner → the class is missing. Map to full class names: `{ primary: 'bg-blue-600', danger: 'bg-red-600' }[variant]`.
- Reuse comes from **components**, not from copying long class strings.
- Tailwind v4 (2025) moved configuration into CSS (`@theme`) and got much faster.

---

<a name="cssinjs"></a>
# 4. CSS-in-JS — runtime vs zero-runtime

```jsx
// styled-components / Emotion — runtime
const Button = styled.button`
  padding: 8px 16px;
  background: ${(p) => (p.$variant === 'danger' ? 'crimson' : 'royalblue')};
`;
```

The cost: styles are generated **in the browser while rendering**, which adds JavaScript, CPU work per render, and complexity with **Server Components** (they need a client boundary) and streaming SSR. React 18 added `useInsertionEffect` specifically for these libraries ([Part 7 §10](07-hooks.md)).

**Zero-runtime** libraries keep the "write styles in TS" experience but extract real CSS at build time — no runtime cost. Choose them if the team wants typed, co-located styles in a modern app.

---

<a name="libraries"></a>
# 5. Component libraries and headless UI

| Kind | Examples | You get |
|---|---|---|
| **full, styled** | MUI, Ant Design, Chakra UI, Mantine | ready-made components with a look; fastest for admin/internal apps |
| **headless** (behaviour + accessibility, no styles) | Radix UI, React Aria, Headless UI, Ariakit | dialogs, menus, comboboxes, tabs with correct keyboard and ARIA — you style them |
| **copy-in components** | **shadcn/ui** (Radix + Tailwind) | the component source copied into your repo — fully yours to change |

The pattern a senior answer mentions: **use headless primitives for complex widgets** (combobox, menu, dialog, date picker). Building those accessibly by hand takes weeks; libraries have already solved focus, keyboard and screen-reader behaviour.

---

<a name="variants"></a>
# 6. Conditional classes, variants, theming

```jsx
import clsx from 'clsx';

<button className={clsx('btn', variant === 'primary' && 'btn-primary', { 'btn-loading': loading })} />
```

- **`clsx`** (or `classnames`) — build `className` from conditions without string bugs. With Tailwind, **`tailwind-merge`** resolves conflicts (`px-2` vs `px-4`).
- **Variants:** `cva` (class-variance-authority) maps props to class sets — the pattern behind shadcn/ui.
- **Dark mode / themes:** CSS variables on `:root` and `[data-theme="dark"]`, plus `prefers-color-scheme`. Avoid theme switching by re-rendering the whole app through Context if CSS variables can do it.
- **Inline styles** only for truly dynamic values: `style={{ width: `${progress}%` }}`. Custom properties work too: `style={{ '--progress': progress }}`.

---

<a name="semantic"></a>
# 7. ⭐ Semantic JSX first

JSX makes it easy to write `<div>` for everything. Don't — the right element gives keyboard support and screen-reader meaning **for free**:

```jsx
// ❌ not focusable, no Enter/Space, announced as nothing useful
<div className="btn" onClick={save}>Save</div>

// ✅
<button type="button" onClick={save}>Save</button>
```

| Need | Use |
|---|---|
| action | `<button type="button">` (inside forms, `type="submit"` only for submit) |
| navigation | `<a href>` / router `<Link>` — not `<span onClick={navigate}>` |
| structure | `<header> <nav> <main> <footer>`, headings in order, lists as `<ul>/<li>` |
| form fields | `<label htmlFor>` + input ([Part 16 §9](16-forms.md)) |
| icon-only button | `<button aria-label="Close">` + `aria-hidden` on the icon |
| images | `alt="what it shows"`, or `alt=""` if decorative |

JSX notes: `htmlFor` not `for`; `aria-*` and `data-*` attributes are written as-is (`aria-expanded={open}`); boolean ARIA values should be real booleans or `"true"/"false"`.

> 🧠 **Remember:** **the first rule of ARIA is: don't use ARIA if a native element does it.** And **`<div onClick>` is a bug.**

---

<a name="focus"></a>
# 8. ⭐ Keyboard and focus in React

- **Everything works with the keyboard** — Tab, Shift+Tab, Enter, Space, Escape, arrows in menus/lists. Try the app without a mouse.
- **Visible focus:** never remove outlines without replacing them; style `:focus-visible`.
- **Focus after actions:** after deleting an item, move focus somewhere sensible (the next item, the list heading); after opening a modal, into it; after closing, back to the opener ([Part 20 §4](20-portals-refs-and-modals.md)).
- **Route changes (SPA):** the browser doesn't announce a new "page". Set the title (React 19 `<title>`) and move focus to the new page's `<h1>` (with `tabIndex={-1}`) after navigation.
- **Skip link:** a first focusable "Skip to main content" link.
- **Conditional rendering removes focus:** if the focused element unmounts, focus falls to `<body>` — move it deliberately with a ref.
- `autoFocus` sparingly — it can confuse screen-reader users when a page loads.

```jsx
function Page({ title, children }) {
  const h1 = useRef(null);
  useEffect(() => { h1.current?.focus(); }, [title]);        // after each navigation
  return (<><title>{title}</title><h1 ref={h1} tabIndex={-1}>{title}</h1>{children}</>);
}
```

---

<a name="aria"></a>
# 9. ARIA in JSX, and announcing changes

For custom widgets, ARIA describes state:

```jsx
<button aria-expanded={open} aria-controls="faq-1" onClick={() => setOpen(o => !o)}>Shipping</button>
<div id="faq-1" hidden={!open}>…</div>

<input aria-invalid={!!error} aria-describedby={error ? 'email-error' : undefined} />
<span id="email-error" role="alert">{error}</span>
```

**Announcing dynamic changes** — "Saved", "3 results", "Item added to cart" — that sighted users see but screen-reader users wouldn't hear:

```jsx
<div aria-live="polite" className="sr-only">{statusMessage}</div>   {/* keep it MOUNTED; change its text */}
```

The live region must exist **before** the message changes (render it always, update the text). `role="alert"` (assertive) for errors. A visually-hidden `.sr-only` class hides text visually but keeps it for screen readers. Use `useId()` for `aria-describedby`/`aria-labelledby` ids so they're unique and SSR-safe.

---

<a name="a11y-test"></a>
# 10. Testing accessibility

| Tool | Catches |
|---|---|
| **`eslint-plugin-jsx-a11y`** | `<div onClick>` without keyboard support, missing `alt`, labels, invalid ARIA — while you type |
| **React Testing Library's `getByRole`** | if a test can't find "button named Save", users of assistive tech probably can't either ([Part 18 §3](18-testing.md)) |
| **axe** — `jest-axe` / `vitest-axe`, `@axe-core/playwright`, axe DevTools extension | contrast, missing names, bad ARIA, landmark issues |
| **Lighthouse** | quick overall score |
| **manual:** keyboard-only walk-through, a screen reader (VoiceOver / NVDA), zoom to 200% | focus traps, confusing order, things tools can't judge |

```jsx
import { axe } from 'vitest-axe';
test('signup form has no a11y violations', async () => {
  const { container } = render(<SignupForm />);
  expect(await axe(container)).toHaveNoViolations();
});
```

Automated tools find only part of the problems — the keyboard walk-through is the cheapest high-value manual check. Standard to aim for: **WCAG 2.2 AA**.

---

<a name="interview"></a>
# 11. Interview Q&A

### Q: "How do you style React components, and why?"
> *"It depends on the team. My usual choice is Tailwind or CSS Modules: CSS Modules give scoped class names with plain CSS and no runtime cost; Tailwind gives consistent design tokens and fast building with a tiny CSS output. For complex widgets I use a headless library like Radix or React Aria and style it. Runtime CSS-in-JS like styled-components is flexible but adds runtime cost and friction with Server Components, so I'd pick a zero-runtime option if the team wants CSS in TypeScript."*

### Q: "What's wrong with `<div onClick>`?"
> *"A div isn't focusable, doesn't respond to Enter or Space, and isn't announced as a button, so keyboard and screen-reader users can't use it. A `<button type='button'>` does all of that for free. The jsx-a11y lint plugin flags it."*

### Q: "How do you make a React app accessible?"
> *"Semantic elements first, ARIA only for custom widgets; everything keyboard-operable with visible focus; deliberate focus management for modals, deletions and route changes; labels and linked error messages in forms; live regions for dynamic messages. I lean on headless accessible libraries for complex widgets, lint with jsx-a11y, use role-based queries in tests, run axe in CI, and do keyboard and screen-reader checks by hand."*

### Q: "How do you announce 'Saved' to a screen reader?"
> *"A live region — an element with `aria-live='polite'`, rendered from the start and visually hidden — whose text I update. Screen readers announce changes to it. For errors, `role='alert'`."*

### Q: "Why can't you build Tailwind class names dynamically?"
> *"Tailwind scans source files for complete class names at build time, so `` `bg-${color}-500` `` is never seen and the class isn't generated. Map variants to full class strings instead."*

---

<a name="cheatsheet"></a>
# 12. Cheat Sheet

```
STYLING
global CSS (collisions) · CSS Modules (scoped, zero runtime) · Tailwind (utilities, tokens, tiny CSS)
runtime CSS-in-JS (styled-components/Emotion: dynamic, runtime cost, RSC friction; s-c in maintenance)
zero-runtime CSS-in-JS (vanilla-extract, Panda, StyleX) · inline style only for dynamic values
libraries: full (MUI, AntD, Chakra) · HEADLESS (Radix, React Aria, Headless UI) · shadcn/ui (copy-in)
clsx / tailwind-merge / cva variants · themes via CSS variables + data-theme · no dynamic Tailwind names

ACCESSIBILITY
semantic first: <button>, <a>/<Link>, <label htmlFor>, landmarks, headings · "<div onClick> is a bug"
icon buttons aria-label · alt text · htmlFor · aria-* booleans
keyboard: Tab/Enter/Space/Esc/arrows · :focus-visible · focus after delete / modal / route change
SPA route change → <title> + focus <h1 tabIndex={-1}> · skip link
live region aria-live="polite" (always mounted, change text) · role="alert" for errors · useId for ids
TEST: eslint-plugin-jsx-a11y · getByRole · axe (vitest-axe / Playwright) · keyboard + screen reader
target WCAG 2.2 AA
```

---

## Connects to

- **[Part 16 — Forms](16-forms.md):** accessible labels and errors.
- **[Part 18 — Testing](18-testing.md):** role queries and axe in tests.
- **[Part 20 — Portals & modals](20-portals-refs-and-modals.md):** focus management in dialogs.
- **[Angular Part 30](../Angular/30-accessibility-and-i18n.md):** the same principles, plus i18n.

## Suggested next topics

1. **Machine coding** — build an accessible dropdown, tabs and modal.
2. Revisit **Part 9 — Performance** with styling choices in mind.
