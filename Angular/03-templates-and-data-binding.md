# Angular Study Notes — Part 03

## Templates & Data Binding

> **Format:** taught in small steps — each idea derived from the problem it solves, with flow diagrams for direction and short snippets for illustration.
>
> **Roadmap:** [Part 03](00-ROADMAP.md) · **Priority:** ⭐⭐⭐⭐☆
>
> **Continues:** [Part 02 — Components](02-components.md) · [Part 04 — Directives](04-directives.md) · [Part 06 — Communication](06-component-communication.md).

---

## Table of Contents

1. [What is a template?](#what)
2. [Why data binding exists](#why)
3. [The four types of binding](#four)
4. [Two-way binding is not a feature](#twoway) ⭐
5. [Property vs attribute](#property-vs-attribute) ⭐
6. [Class and style binding](#class-style)
7. [Template reference variables](#refvars)
8. [ng-container vs ng-template vs ng-content](#trio) ⭐
9. [What you can't write in a template](#restrictions)
10. [Common interview questions](#interview)
11. [The 60-second summary](#summary)

---

<a name="what"></a>
# 1. What is a template?

Start with a component:

```ts
export class UserComponent {
  name = "Alice";
}
```

This is just a TypeScript class. It holds data. It knows nothing about HTML.

Now you write this:

```html
<h1>{{ name }}</h1>
```

That HTML is the **template**.

So Angular has two worlds:

```
Component (TypeScript)
        │
        │  data binding
        ▼
Template (HTML)
```

The component **owns** the data.

The template **displays** the data.

Data binding is the bridge between them.

---

<a name="why"></a>
# 2. Why data binding exists

Without a framework, you update the DOM by hand:

```js
const h1 = document.querySelector("h1");
h1.textContent = user.name;
```

And you must do this again every single time `user.name` changes. Miss one, and the screen lies to the user.

The real problem isn't the typing. It's that **you** are responsible for remembering when to sync.

Angular takes that responsibility away.

You stop saying *how* to update:

```js
element.textContent = ...
```

You say *what* should be shown:

```html
{{ name }}
```

Angular figures out when to update the DOM.

That shift — from imperative to declarative — is the whole point of data binding.

---

<a name="four"></a>
# 3. The four types of binding

Every binding is just a question of **which direction the data flows**.

## Interpolation — display text

```html
<h1>{{ name }}</h1>
```

```
Component
    │
    ▼
Template (as text)
```

Angular takes `name = "Alice"` and renders `<h1>Alice</h1>`.

Use it for text content. That's all it does — the result is always a string.

## Property binding — set a DOM property

```ts
imageUrl = "cat.jpg";
```

```html
<img [src]="imageUrl">
```

```
Component
    │
    ▼
DOM property
```

The square brackets mean *"this is an expression, not a literal string."*

Whenever `imageUrl` changes, Angular updates the image.

This works for any DOM property: `[src]`, `[disabled]`, `[value]`, `[checked]`, `[hidden]`.

## Event binding — react to the user

Now reverse the arrow.

```html
<button (click)="save()">Save</button>
```

```
Browser event
      │
      ▼
Component method
```

Angular listens on the DOM and calls your method.

`$event` gives you the raw DOM event when you need it:

```html
<input (input)="onType($event)">
```

## Two-way binding — both at once

```html
<input [(ngModel)]="name">
```

```
Component
    ▲
    │
    ▼
  Input
```

Typing updates the component. Changing the component updates the input.

---

<a name="twoway"></a>
# 4. ⭐ Two-way binding is not a feature

This is worth understanding properly, because it looks like magic and isn't.

`[(ngModel)]="name"` is **shorthand**. Angular expands it into the two bindings you already know:

```html
<input [ngModel]="name" (ngModelChange)="name = $event">
```

A property binding down. An event binding back up.

Nothing magical.

And now the useful consequence: **any component can support `[(...)]`** just by following the naming convention.

```ts
@Input()  value!: string;
@Output() valueChange = new EventEmitter<string>();
```

```html
<app-search [(value)]="query">
```

Angular looks for an input named `value` and an output named `value` + `Change`. That suffix is the entire contract.

> In modern Angular, `value = model<string>()` declares both halves in one line — [Part 11](11-signals.md).

⚠️ `ngModel` needs `FormsModule` imported. Its absence is the most common cause of *"can't bind to ngModel."*

---

<a name="property-vs-attribute"></a>
# 5. ⭐ Property vs attribute

This is where candidates struggle, so slow down here.

Consider:

```html
<input value="John">
```

When the browser parses that HTML:

```
HTML attribute
      │
      ▼
DOM property
```

The attribute **initialises** the property. One time.

Now the user types `Johnny`.

```
Attribute:  value="John"      ← unchanged, frozen at page load
Property:   value = "Johnny"  ← the live value
```

They have drifted apart.

The attribute was the *starting* value. The property is the *current* value.

**Angular binds to the property**, because that's the live state:

```html
<input [value]="username">
```

You only need attribute binding when there is **no matching DOM property**:

```html
<td [attr.colspan]="span">
<button [attr.aria-label]="label">
<div [attr.data-id]="id">
```

`aria-*`, `data-*`, `colspan`, and SVG attributes have no property equivalent.

**Practical signal:** if Angular says *"Can't bind to 'x' since it isn't a known property"*, you either forgot an import, or you need `[attr.x]`.

---

<a name="class-style"></a>
# 6. Class and style binding

Same idea as property binding — declarative instead of imperative.

Instead of:

```js
element.classList.add("active");
```

You express the *condition*:

```html
<div [class.active]="isLoggedIn">
```

Meaning:

```
isLoggedIn true  →  class added
isLoggedIn false →  class removed
```

You never write the add/remove logic. You state the rule.

Styles work identically, and can carry a unit:

```html
<div [style.width.px]="width">
```

When the set of classes is genuinely dynamic, use the object forms:

```html
<div [ngClass]="{ active: isActive, done: isDone }">
```

Prefer `[class.x]` when you know the class name. It's simpler and faster.

---

<a name="refvars"></a>
# 7. Template reference variables

```html
<input #box>
<button (click)="box.focus()">Focus</button>
```

`#box` is a variable that points at the rendered thing.

```
box
 │
 ▼
HTMLInputElement
```

Put it on a plain element and you get the **DOM element**.

Put it on a component and you get the **component instance**:

```html
<app-user #user>
<button (click)="user.reload()">Reload</button>
```

That's a meaningful difference — you can call the component's own methods directly.

Note that `#box` only exists **inside the template**. To reach it from your class you need `ViewChild` — [Part 06](06-component-communication.md).

---

<a name="trio"></a>
# 8. ⭐ ng-container vs ng-template vs ng-content

Three similar names, three completely different jobs. Very common interview question.

## ng-container — grouping with no DOM

You need a structural directive, but you don't want another `<div>` cluttering your layout.

```html
<ng-container *ngIf="loggedIn">
  <h2>Welcome</h2>
  <p>Good to see you</p>
</ng-container>
```

Rendered output:

```
With a <div>:          With ng-container:
<div>                  <h2>Welcome</h2>
  <h2>Welcome</h2>     <p>Good to see you</p>
  <p>…</p>
</div>                 (no wrapper at all)
```

That matters more than it sounds — a stray `<div>` breaks flex and grid layouts.

It's also the fix for *"you can't put two structural directives on one element."*

## ng-template — a blueprint that isn't rendered

```html
<ng-template #loading>
  Loading…
</ng-template>
```

This produces **nothing**. It sits in memory until something asks Angular to render it.

```html
<div *ngIf="data; else loading">{{ data }}</div>
```

Every structural directive compiles into one of these behind the scenes — [Part 04](04-directives.md).

## ng-content — content projection

The parent passes markup *into* the child.

Parent:

```html
<app-card>
  <h2>Hello</h2>
</app-card>
```

Child template:

```html
<div class="card">
  <ng-content></ng-content>
</div>
```

Result:

```html
<div class="card">
  <h2>Hello</h2>
</div>
```

This is Angular's equivalent of React's `children`.

You can have multiple named slots:

```html
<ng-content select="[header]"></ng-content>
<ng-content></ng-content>
```

One subtle point worth remembering: projected content belongs to the **parent**. The parent creates it, and the parent's lifecycle governs it. That's exactly why Angular has two different hooks — `ngAfterContentInit` for projected content, `ngAfterViewInit` for the component's own template ([Part 07](07-lifecycle-hooks.md)).

## Side by side

| | Renders a DOM element? | Renders its children? |
|---|---|---|
| `ng-container` | No | Yes |
| `ng-template` | No | Only when told |
| `ng-content` | No | Yes — the parent's markup |

---

<a name="restrictions"></a>
# 9. What you can't write in a template

Templates are deliberately restricted. No `new`, no chained statements, no `window` or `document`.

Assignment is legal in **one** place only — event handlers:

```html
<button (click)="count = count + 1">
```

You do get:

- `?.` safe navigation — `user?.address?.city`
- `!` non-null assertion
- `$any(x)` to silence the type checker

---

<a name="interview"></a>
# 10. Common interview questions

### Q: Why shouldn't you call methods in templates?

```html
{{ calculateTotal() }}
```

Because Angular re-evaluates template expressions on **every change detection cycle** — which can be many times per second. An expensive method there runs constantly.

Prefer a cached value, a computed signal, or a getter that's genuinely cheap. More in [Part 18](18-performance.md).

### Q: Why does `[(ngModel)]` require FormsModule?

Because `ngModel` isn't part of Angular's template engine. It's a directive shipped in the forms package. Without importing it, Angular doesn't recognise the attribute — hence *"can't bind to ngModel."*

### Q: Why use property binding instead of interpolation?

Interpolation only produces **text**. Property binding sets any **property**, of any type:

```html
[disabled]="isBusy"     <!-- boolean -->
[value]="user"          <!-- string -->
[items]="list"          <!-- array -->
```

Interpolation for text content. Property binding for element and component properties.

### Q: `ng-container` vs a `div`?

A `div` is a real element in the DOM that can break your layout. `ng-container` is a logical grouping that leaves no trace.

---

<a name="summary"></a>
# 11. The 60-second summary

> *"Angular templates are declarative HTML views backed by a component class, and data binding is the mechanism that keeps the two in sync so I never touch the DOM directly. There are four binding forms: interpolation for text, property binding to set DOM properties, event binding to handle user interaction, and two-way binding, which is just shorthand for a property binding plus an event binding following the `x` / `xChange` convention. Angular binds to DOM properties by default because they hold the element's live state, while attribute binding covers the cases with no property equivalent — `aria-*`, `data-*`, `colspan`, SVG. Templates also give you reference variables, structural directives, and content projection through `ng-content`, with `ng-container` for grouping without a DOM node and `ng-template` for markup that only renders when asked."*

---

## Connects to

- **[Part 04 — Directives](04-directives.md):** what `*ngIf` compiles into, and the modern `@if` / `@for` blocks.
- **[Part 06 — Communication](06-component-communication.md):** `@Input` / `@Output`, and reaching a `#ref` with `ViewChild`.
- **[Part 07 — Lifecycle](07-lifecycle-hooks.md):** why content and view have separate hooks.
- **[Part 18 — Performance](18-performance.md):** the cost of expressions in templates.

*— End of Part 03 —*
