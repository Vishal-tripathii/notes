# Angular Study Notes — Part 04

## Directives (Attribute, Structural, the `*` Desugaring, `@if` / `@for`, `@defer`)

> **Format:** taught in small steps — each idea derived from the problem it solves, with flow diagrams and short snippets for illustration.
>
> **Roadmap:** [Part 04](00-ROADMAP.md) · **Priority:** ⭐⭐⭐☆☆
>
> **Continues:** [Part 02 — Components](02-components.md) · [Part 03 — Templates](03-templates-and-data-binding.md) · [Part 18 — Performance](18-performance.md).

---

## Table of Contents

1. [What is a directive?](#what)
2. [The three kinds](#kinds)
3. [Attribute directives — the problem they solve](#attribute-problem)
4. [Writing one](#writing)
5. [Structural directives — what the `*` really means](#structural) ⭐
6. [`*ngFor` and the trackBy problem](#trackby) ⭐
7. [The modern control flow](#control-flow)
8. [`@defer` — lazy loading at the template level](#defer)
9. [Writing your own structural directive](#custom-structural)
10. [Common mistakes](#mistakes)
11. [Common interview questions](#interview)
12. [The 60-second summary](#summary)

---

<a name="what"></a>
# 1. What is a directive?

A directive is a class that **adds behaviour to an element**.

That's it. No template of its own, no markup — just behaviour attached to markup that already exists.

```html
<button appTooltip="Save your work">Save</button>
        └────────┬────────┘
            a directive
```

The button already exists. The directive gives it something extra.

Here's the fact that reframes everything: **a component is just a directive with a template.**

```
Directive   =  behaviour
Component   =  behaviour  +  template
```

Same underlying machinery. That's why they share selectors, host bindings, lifecycle hooks and DI.

---

<a name="kinds"></a>
# 2. The three kinds

```
Component            renders its own template     <app-card>
Attribute directive  changes appearance/behaviour <div appHighlight>
Structural directive changes the DOM STRUCTURE    <div *ngIf="x">
```

The last one is the interesting one — §5.

---

<a name="attribute-problem"></a>
# 3. Attribute directives — the problem they solve

Say you want a paragraph to highlight when you hover it.

Without a directive:

```ts
ngAfterViewInit() {
  this.el.addEventListener('mouseenter', () => this.el.style.background = 'yellow');
  this.el.addEventListener('mouseleave', () => this.el.style.background = '');
}
```

Now you want the same on a table row. And a card. And a nav item.

You copy that code four times.

The behaviour is real and reusable, but it has nowhere to live — it isn't a component, because it doesn't render anything.

A directive is that home:

```html
<p appHighlight>Hover me</p>
<tr appHighlight>…</tr>
<div appHighlight>…</div>
```

Write once. Attach anywhere.

---

<a name="writing"></a>
# 4. Writing one

```ts
@Directive({
  selector: '[appHighlight]',
  host: {
    '(mouseenter)': 'onEnter()',
    '(mouseleave)': 'onLeave()',
  },
})
export class HighlightDirective {
  private el = inject(ElementRef);

  onEnter() { this.el.nativeElement.style.background = 'yellow'; }
  onLeave() { this.el.nativeElement.style.background = ''; }
}
```

Three things to notice.

**The selector is in square brackets.** `'[appHighlight]'` means *"match any element carrying this attribute."* That's why directives attach instead of render.

**`ElementRef` gives you the host element**, injected like any dependency.

**Host bindings do the event wiring** — the same mechanism from [Part 02](02-components.md).

⚠️ `nativeElement` touches the DOM directly, which breaks server-side rendering. `Renderer2` is the safe alternative — [Part 22](22-angular-internals.md).

---

<a name="structural"></a>
# 5. ⭐ Structural directives — what the `*` really means

Structural directives don't change how an element *looks*. They decide whether it **exists at all**.

```html
<div *ngIf="loggedIn">Welcome</div>
```

If `loggedIn` is false, that div isn't hidden. It is **not in the DOM**.

Now — where does the `*` come from?

It's sugar. Angular expands it:

```html
<!-- what you write -->
<div *ngIf="loggedIn">Welcome</div>

<!-- what Angular expands it to -->
<ng-template [ngIf]="loggedIn">
  <div>Welcome</div>
</ng-template>
```

Look at what happened:

```
*ngIf  →  wrap the element in an <ng-template>
       →  turn *ngIf into a property binding [ngIf]
```

And now three things you already half-knew suddenly make sense.

**Why `ng-template` exists** ([Part 03](03-templates-and-data-binding.md)) — it's the blueprint that structural directives render on demand.

**Why the element isn't in the DOM** — it lives inside a template that was never rendered.

**Why you can't put two structural directives on one element** — each wants to wrap that element in its own `ng-template`, and Angular can't decide which wraps which. That's what `ng-container` is for:

```html
<ng-container *ngIf="user">
  <div *ngFor="let role of user.roles">{{ role }}</div>
</ng-container>
```

Nothing magical. Just a wrap-and-rename.

---

<a name="trackby"></a>
# 6. ⭐ `*ngFor` and the trackBy problem

```html
<li *ngFor="let item of items; let i = index">{{ i }} — {{ item.name }}</li>
```

Now here's the problem that `trackBy` exists to solve.

When `items` changes, Angular has to work out what's different. By default it compares by **object identity**.

Refetch your list from an API and every object is brand new — even if the data is identical:

```
old:  [ {id:1}, {id:2}, {id:3} ]      ← objects from the first fetch
new:  [ {id:1}, {id:2}, {id:3} ]      ← different objects, same data

Angular sees: nothing matches
Angular does: destroy all 3 rows, create 3 new ones
```

Every DOM node is thrown away and rebuilt. You lose focus, scroll position, and any animation in progress — and on a large list it's genuinely slow.

`trackBy` tells Angular what *identity* means:

```ts
trackById(index: number, item: Item) {
  return item.id;
}
```

```html
<li *ngFor="let item of items; trackBy: trackById">
```

```
Angular now compares by id
       ↓
same ids → same rows → DOM untouched
```

---

<a name="control-flow"></a>
# 7. The modern control flow

Angular 17 introduced block syntax:

```html
@if (loggedIn) {
  <p>Welcome</p>
} @else {
  <p>Please log in</p>
}

@for (item of items; track item.id) {
  <li>{{ item.name }}</li>
} @empty {
  <li>No items</li>
}

@switch (status) {
  @case ('loading') { <spinner /> }
  @case ('error')   { <p>Failed</p> }
  @default          { <p>Done</p> }
}
```

Four reasons this replaced `*ngIf`:

**No imports.** `*ngIf` is a directive from `CommonModule` — forget the import, get an error. Blocks are built into the template compiler.

**Real `@else`.** Previously you needed a separate `ng-template` and an `else` reference.

**`@empty`.** The empty-list case used to need a second `*ngIf` beside your loop.

**Better type narrowing.** Inside `@if (user)`, TypeScript knows `user` isn't null.

And the change that matters most:

> **`track` is mandatory in `@for`.**

It was optional in `*ngFor`, so almost nobody used it, and lists silently rebuilt themselves on every update. Making it required turned a performance trap into a compile error.

```html
@for (item of items; track item.id) {   ← won't compile without track
```

Use `track item.id` when you have an id. `track $index` only when items have no stable identity.

---

<a name="defer"></a>
# 8. `@defer` — lazy loading at the template level

The same block syntax gives you deferred loading:

```html
@defer (on viewport) {
  <app-heavy-chart [data]="data" />
} @placeholder {
  <div class="skeleton"></div>
} @loading {
  <spinner />
}
```

The chart's JavaScript isn't in the initial bundle at all. It downloads when the placeholder scrolls into view.

Triggers include `on viewport`, `on interaction`, `on hover`, `on idle`, `on timer(2s)`, and `when <condition>`.

Before this, lazy loading was a routing concern — you could only split at route boundaries. Now you can split *inside* a page. More in [Part 18](18-performance.md).

---

<a name="custom-structural"></a>
# 9. Writing your own structural directive

Now that you know `*` means "wrap in an `ng-template`", writing one is straightforward. You need two things injected:

```ts
@Directive({ selector: '[appIfRole]' })
export class IfRoleDirective {
  private tpl  = inject(TemplateRef<any>);        // the blueprint
  private view = inject(ViewContainerRef);        // where to put it

  @Input() set appIfRole(role: string) {
    if (this.hasRole(role)) {
      this.view.createEmbeddedView(this.tpl);     // render it
    } else {
      this.view.clear();                          // remove it
    }
  }
}
```

```html
<button *appIfRole="'admin'">Delete</button>
```

```
TemplateRef       =  the markup, not yet rendered
ViewContainerRef  =  the slot in the DOM where it can go

createEmbeddedView()  →  in
clear()               →  out
```

The `@Input` is a **setter** so it re-runs whenever the value changes.

---

<a name="mistakes"></a>
# 10. Common mistakes

- **Two structural directives on one element** — use `ng-container`.
- **`*ngFor` without `trackBy`** — silent, expensive DOM rebuilds. (`@for` won't let you.)
- **`track $index` when items have real ids** — reorder the list and Angular reuses the wrong rows.
- **Touching `nativeElement.style` directly** — breaks SSR; prefer host bindings or `Renderer2`.
- **Building a component when a directive was needed** — if it renders no markup of its own, it's a directive.

---

<a name="interview"></a>
# 11. Common interview questions

### Q: What are the three types of directives?

Components, which render their own template; attribute directives, which change appearance or behaviour of an existing element; and structural directives, which add or remove elements from the DOM. A component is really just a directive with a template.

### Q: What does `*ngIf` actually compile to?

The `*` is shorthand. Angular wraps the element in an `<ng-template>` and turns the directive into a property binding on it — so `*ngIf="x"` becomes `<ng-template [ngIf]="x">`. That's why the element genuinely isn't in the DOM when the condition is false, and why you can't put two structural directives on one element.

### Q: Why is `track` mandatory in `@for` when `trackBy` was optional?

Because without it Angular compares list items by object identity. Refetch a list from an API and every object is new, so every row gets destroyed and recreated — losing focus, scroll and animations, and costing real time on large lists. `trackBy` fixed that but was easy to forget, so the new syntax makes it a compile error instead of a silent performance bug.

### Q: What's the difference between `*ngIf` and hiding with CSS?

`*ngIf` removes the element from the DOM entirely — the component is destroyed, its subscriptions are cleaned up, and it stops being change-detected. `[hidden]` or `display: none` keeps everything alive and just makes it invisible. Use `*ngIf` for expensive or rarely-shown content; use CSS when you're toggling frequently and want to keep state.

### Q: How would you write a structural directive?

Inject `TemplateRef` — the markup blueprint — and `ViewContainerRef` — the slot in the DOM. Then call `createEmbeddedView(templateRef)` to render it and `clear()` to remove it, driven by an `@Input` setter so it re-evaluates when the value changes.

---

<a name="summary"></a>
# 12. The 60-second summary

> *"A directive is a class that adds behaviour to an element, and a component is just a directive that also has a template. There are attribute directives, which change how an existing element looks or behaves, and structural directives, which add or remove elements from the DOM. The asterisk on a structural directive is shorthand — Angular wraps the element in an `ng-template` and turns the directive into a property binding on it, which is why the element is genuinely absent rather than hidden, and why only one structural directive is allowed per element. Modern Angular replaces `*ngIf` and `*ngFor` with the `@if` and `@for` blocks, which need no imports, support `@else` and `@empty` natively, narrow types properly, and make `track` mandatory so lists stop silently rebuilding their DOM. To write my own structural directive I inject `TemplateRef` and `ViewContainerRef` and render or clear the view from an input setter."*

---

## Connects to

- **[Part 02 — Components](02-components.md):** a component is a directive with a template; host bindings are shared.
- **[Part 03 — Templates](03-templates-and-data-binding.md):** `ng-template` and `ng-container`, which structural directives depend on.
- **[Part 18 — Performance](18-performance.md):** `track`, `@defer`, and the cost of rebuilding lists.
- **[Part 22 — Internals](22-angular-internals.md):** `Renderer2` and why direct DOM access breaks SSR.

*— End of Part 04 —*
