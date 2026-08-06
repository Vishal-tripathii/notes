# Angular Study Notes — Part 02

## Components

> **Format:** taught in small steps — each idea derived from the problem it solves, with flow diagrams and short snippets for illustration.
>
> **Roadmap:** [Part 02](00-ROADMAP.md) · **Priority:** ⭐⭐⭐⭐⭐
>
> **Continues:** [Part 01 — Bootstrap](01-angular-architecture-and-bootstrap.md) · [Part 03 — Templates](03-templates-and-data-binding.md) · [Part 04 — Directives](04-directives.md).

---

## Table of Contents

1. [What is a component?](#what)
2. [Why the decorator exists](#decorator)
3. [The metadata fields](#metadata)
4. [Selectors — how Angular finds your component](#selectors)
5. [The styling problem](#styling-problem)
6. [View encapsulation](#encapsulation) ⭐
7. [The three modes](#modes)
8. [Reaching outside the template](#escape-hatches)
9. [Host bindings](#host)
10. [Component or directive?](#vs-directive)
11. [Hands-on](#handson)
12. [Common interview questions](#interview)
13. [The 60-second summary](#summary)

---

<a name="what"></a>
# 1. What is a component?

A component is three things bundled together:

```
   class      →  the data and logic
   template   →  the markup
   styles     →  how it looks
```

One unit. One folder. One responsibility.

```ts
@Component({
  selector: 'app-employee-card',
  templateUrl: './employee-card.component.html',
  styleUrl: './employee-card.component.css',
})
export class EmployeeCardComponent {
  name = 'Asha';
}
```

And this is the unit of *everything* in Angular. A page is a component. A button is a component. The application root is a component.

Your whole app is a tree of them:

```
AppComponent
├── HeaderComponent
├── SidebarComponent
└── EmployeeListComponent
    └── EmployeeCardComponent  (×N)
```

---

<a name="decorator"></a>
# 2. Why the decorator exists

Take the decorator away and look at what's left:

```ts
export class EmployeeCardComponent {
  name = 'Asha';
}
```

A plain TypeScript class. Angular has no idea it exists, no idea what HTML belongs to it, no idea where to put it on the page.

The decorator supplies that missing information:

```
@Component({ … })     ←  metadata
        │
        ▼
Angular compiler reads it
        │
        ▼
generates render instructions
```

So `@Component` is not decoration. It's **the compiler's input**. It's how a class becomes something Angular can render.

Remember from [Part 01](01-angular-architecture-and-bootstrap.md) that this happens at *build* time, not in the browser.

---

<a name="metadata"></a>
# 3. The metadata fields

You'll use these constantly:

| Field | What it does |
|---|---|
| `selector` | How Angular finds it in a template |
| `template` / `templateUrl` | Inline markup vs external file |
| `styles` / `styleUrl` | This component's styles |
| `imports` | Standalone only — what this template uses |
| `providers` | Services scoped to *this component instance* ([Part 08](08-dependency-injection-and-services.md)) |
| `changeDetection` | `Default` or `OnPush` ([Part 10](10-change-detection-and-zonejs.md)) |
| `encapsulation` | How styles are scoped (§6) |
| `host` | Bindings on the component's own element (§9) |

Rule of thumb: use external template and style files unless the template is under about five lines.

---

<a name="selectors"></a>
# 4. Selectors — how Angular finds your component

The selector is the name you write in HTML to place the component.

```ts
selector: 'app-card'
```

```html
<app-card></app-card>
```

There are three forms, and the choice signals what kind of thing you're building:

```
'app-card'        element    <app-card>            ← components
'[appHighlight]'  attribute  <div appHighlight>    ← directives
'.card'           class      <div class="card">    ← rare
```

Components use element selectors. Directives use attribute selectors, because they attach to markup that already exists (§10).

The `app-` prefix isn't cosmetic. It stops your component colliding with a real HTML element or one from a third-party library.

⚠️ If you rename the class but not the selector, you get a blank page and no error worth reading.

---

<a name="styling-problem"></a>
# 5. The styling problem

Before understanding encapsulation, understand what it's protecting you from.

You write this in a card component:

```css
p { color: red; }
```

In plain CSS, that rule is **global**. It hits every `<p>` in the entire application — the header, the footer, some other team's page.

```
card.css:  p { color: red }
                    │
                    ▼
       every <p> in the whole app
```

The usual workaround is to invent naming conventions — BEM, prefixes, `.card__text` — so that nothing collides. That's discipline, not a guarantee. One mistake and something breaks three screens away.

Angular removes the discipline requirement entirely.

---

<a name="encapsulation"></a>
# 6. ⭐ View encapsulation

By default, styles written in a component **only apply to that component**.

And the mechanism isn't Shadow DOM. It's much simpler: Angular rewrites your CSS at build time.

What you write:

```html
<p>Hello</p>
```

```css
p { color: red; }
```

What Angular actually emits:

```html
<p _ngcontent-abc>Hello</p>
```

```css
p[_ngcontent-abc] { color: red; }
```

Every element in the template gets a unique attribute. Every selector gets that same attribute appended.

```
p { color: red }
       +
_ngcontent-abc
       ↓
p[_ngcontent-abc] { color: red }
       ↓
matches ONLY this component's paragraphs
```

So scoping falls out of ordinary **CSS specificity**. No browser feature involved, nothing to polyfill.

Nothing magical — just a build-time rewrite.

---

<a name="modes"></a>
# 7. The three modes

You can change the behaviour with the `encapsulation` field.

| Mode | What happens | Use when |
|---|---|---|
| `Emulated` *(default)* | Attribute rewriting, as above | Almost always |
| `None` | No scoping — styles go global | Deliberately global theme styles |
| `ShadowDom` | Real browser Shadow DOM | You need true isolation |

The difference between `None` and `ShadowDom` is worth being precise about:

```
Emulated    your styles stay in  ·  outside styles CAN reach in
None        your styles LEAK OUT ·  outside styles reach in
ShadowDom   your styles stay in  ·  outside styles CANNOT reach in
```

⚠️ **The trap:** setting `None` on one component pushes its styles into the *entire* application. It's a very common cause of "why did this component break another page?" — and because the damage is remote, it's hard to trace back.

---

<a name="escape-hatches"></a>
# 8. Reaching outside the template

Scoping is the default, so Angular gives you three deliberate ways out.

**`:host`** — style the component's own element:

```css
:host { display: block; padding: 1rem; }
```

**`:host-context(.dark)`** — react to something on an ancestor:

```css
:host-context(.dark) { background: #222; }
```

**`::ng-deep`** — pierce into a child component's internals:

```css
:host ::ng-deep .mat-input { border: none; }
```

`::ng-deep` is deprecated, and it's **global unless you pair it with `:host`**. Use it only when styling a third-party component gives you no other option.

---

<a name="host"></a>
# 9. Host bindings

Here's a problem you hit quickly.

You want to add a class when the card is selected. But the class belongs on `<app-card>` itself — the element your *parent* wrote — not on anything inside your template.

Without a mechanism for this, you'd do the ugly thing:

```html
<!-- card.component.html -->
<div [class.selected]="isSelected">   ← a pointless wrapper, only to have something to style
  …
</div>
```

Host bindings let you target the component's own element directly:

```ts
@Component({
  selector: 'app-card',
  host: {
    '[class.selected]': 'isSelected',   // class on <app-card> itself
    '(click)': 'select()',              // listener on <app-card> itself
  },
})
```

```
<app-card class="selected">   ← Angular puts it here
  …your template…
</app-card>
```

The older decorator form does the same job:

```ts
@HostBinding('class.selected') isSelected = false;
@HostListener('click') select() { … }
```

Both are valid. The `host` object is now preferred because it keeps all host behaviour visible in one place instead of scattered across the class.

---

<a name="vs-directive"></a>
# 10. Component or directive?

A question you'll face constantly once you start building shared UI.

The test is simple: **does it render markup of its own?**

```
Renders its own template   →  component   <app-modal>
Decorates existing markup  →  directive   <button appTooltip>
```

If you find yourself writing a component whose template is a single element you're merely adding behaviour to, it should be a directive — [Part 04](04-directives.md).

---

<a name="handson"></a>
# 11. Hands-on

Build these as standalone components. Between them they cover the whole part:

- **Button** — host bindings for `disabled` and a variant class.
- **Modal** — `:host` styling, and your first real need for content projection.
- **Accordion / Tabs** — components that manage children.
- **Confirmation Dialog** — the one you'll reuse in every project.

---

<a name="interview"></a>
# 12. Common interview questions

### Q: How does Angular scope component styles?

By default Angular uses **emulated encapsulation**. At build time it adds a unique attribute to every element in the component's template, and appends that attribute to every CSS selector in the component's stylesheet.

So scoping is just **specificity** — no Shadow DOM involved.

### Q: What's the difference between the three encapsulation modes?

`Emulated` scopes your styles in, but global styles can still reach in.

`None` disables scoping entirely, so your styles go global.

`ShadowDom` uses the browser's real Shadow DOM, isolating in **both** directions — your styles can't escape and outside styles can't enter.

### Q: What are `HostBinding` and `HostListener` for?

They bind properties and listen for events on the component's **own host element**, rather than on something inside its template.

Without them you'd add a wrapper element purely to have something to target. Modern Angular prefers the `host` object in the decorator metadata.

### Q: When would you write a directive instead of a component?

A component owns a template and renders markup. A directive adds behaviour to markup that already exists.

If I'm not rendering anything of my own — a tooltip, a highlight, an autofocus — it's a directive.

### Q: Why does the decorator matter?

Because it's the compiler's input, not decoration. It's the metadata Angular reads at build time to generate render instructions. Without it the class is just a class Angular knows nothing about.

---

<a name="summary"></a>
# 13. The 60-second summary

> *"A component is a class, a template, and styles bundled into one unit by the `@Component` decorator, and it's the building block for everything in Angular — the app is a tree of them. The decorator isn't cosmetic; it's metadata the compiler reads at build time to generate render instructions. Angular finds the component in a template through its selector, which is an element selector for components and an attribute selector for directives. Styles are scoped by default through emulated encapsulation: Angular stamps a unique attribute on every element in the template and appends it to every CSS selector, so scoping is just specificity rather than Shadow DOM. You can switch to `None` for global styles or `ShadowDom` for true isolation, and use `:host` and `:host-context` to style the component's own element. Host bindings let you put classes and listeners on the component's own element instead of adding a wrapper. And if something adds behaviour to existing markup rather than rendering its own, it should be a directive, not a component."*

---

## Common mistakes

- **`encapsulation: None` to "fix" a styling problem** — it leaks globally, forever, and the damage shows up somewhere else.
- **Forgetting `imports` on a standalone component** → *"`app-child` is not a known element."*
- **Logic in the template** — templates should read values, not compute them ([Part 18](18-performance.md)).
- **`::ng-deep` without `:host`** — it escapes the component entirely.
- **Renaming a class without its selector** — blank page, unhelpful error.

---

## Connects to

- **[Part 03 — Templates](03-templates-and-data-binding.md):** what goes inside the template.
- **[Part 04 — Directives](04-directives.md):** the other side of the component/directive choice.
- **[Part 06 — Communication](06-component-communication.md):** how components talk once you have more than one.
- **[Part 08 — DI](08-dependency-injection-and-services.md):** what `providers` in the metadata actually does.
- **[Part 10 — Change Detection](10-change-detection-and-zonejs.md):** `changeDetection: OnPush`.

*— End of Part 02 —*
