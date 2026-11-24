# Angular Study Notes — Part 28

## Animations — the Old `@angular/animations` Way and the New `animate.enter` / `animate.leave`

> **Roadmap:** [Part 28](00-ROADMAP.md) · **Priority:** ⭐⭐⭐☆☆
>
> **Continues:** [Part 04 — Directives](04-directives.md) (`@if`/`@for` add and remove elements) · [javascript Part 32](../javascript/32-browser-rendering-and-loading.md) (why `transform`/`opacity` are the cheap things to animate).
>
> ⚠️ **Version note:** Angular **20.2** deprecated the `@angular/animations` package in favour of native CSS animations driven by `animate.enter` / `animate.leave`. You'll meet **both** — old code everywhere, new code going forward.

---

## Table of Contents

1. [The problem Angular animations solve](#problem)
2. [Plain CSS first](#css)
3. [⭐ The new way: `animate.enter` / `animate.leave`](#new)
4. [The old way: `@angular/animations`](#old)
5. [Migrating, and which to use](#which)
6. [Performance and accessibility](#perf)
7. [Interview Q&A](#interview)
8. [The 60-second summary](#summary)

---

<a name="problem"></a>
# 1. The problem Angular animations solve

CSS can animate an element that **stays** on the page (hover, a class toggle). The hard part is elements that **appear and disappear**:

- **Entering:** `@if (open) { <div class="panel"> }` — the element is created; you want it to fade/slide in.
- **Leaving:** when `open` becomes false, Angular **removes** the element immediately — there's nothing left to animate.

> **Analogy 🎭 — an actor leaving the stage.** Without help, the actor vanishes the instant their scene ends. An exit animation means the stage manager waits for them to walk off before closing the curtain.

So the framework has to **wait** for a leave animation to finish before removing the element. That's the one job CSS can't do alone.

---

<a name="css"></a>
# 2. Plain CSS first

For anything that doesn't enter or leave, you need no Angular feature at all — bind a class and let CSS transition it:

```html
<button [class.active]="isActive()">Save</button>
```

```css
button { transition: background-color 200ms, transform 200ms; }
button.active { background-color: var(--primary); transform: scale(1.05); }
```

> 🧠 **Remember:** **staying on the page → CSS class. Entering/leaving → `animate.enter`/`animate.leave`.**

---

<a name="new"></a>
# 3. ⭐ The new way: `animate.enter` / `animate.leave` (v20.2+)

Put a CSS class name on the element. Angular adds it at the right moment and, for leaving, **waits for the CSS animation to end** before removing the element.

```html
@if (open()) {
  <div class="panel" animate.enter="slide-in" animate.leave="fade-out">
    Hello
  </div>
}
```

```css
.slide-in  { animation: slide-in 200ms ease-out; }
.fade-out  { animation: fade-out 150ms ease-in forwards; }

@keyframes slide-in { from { transform: translateY(-8px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes fade-out { to { opacity: 0; } }
```

- **`animate.enter="cls"`** — the class is added when the element is inserted, and removed after its animation finishes.
- **`animate.leave="cls"`** — the class is added when the element is about to be removed; Angular removes it **after** the animation/transition ends.
- Works with `@if`, `@for` (each item), `@switch`, and route changes.
- Bind dynamically: `[animate.enter]="direction() === 'left' ? 'from-left' : 'from-right'"`.
- **Using a JS animation library (GSAP, Web Animations API)?** Use the event form and tell Angular when you're done:
  ```html
  <div (animate.leave)="onLeave($event)">…</div>
  ```
  ```ts
  onLeave(event: AnimationCallbackEvent) {
    const a = event.target.animate([{ opacity: 1 }, { opacity: 0 }], 200);
    a.onfinish = () => event.animationComplete();   // now Angular may remove it
  }
  ```

No module to import, no `provideAnimations()`, no animations package in your bundle — it's plain CSS the browser runs (and can run off the main thread for `transform`/`opacity`).

---

<a name="old"></a>
# 4. The old way: `@angular/animations`

What you'll find in most existing apps:

```ts
// app.config.ts
providers: [provideAnimationsAsync()]   // or provideAnimations() / BrowserAnimationsModule in NgModule apps
```

```ts
@Component({
  selector: 'app-panel',
  animations: [
    trigger('fade', [
      transition(':enter', [style({ opacity: 0 }), animate('200ms', style({ opacity: 1 }))]),
      transition(':leave', [animate('150ms', style({ opacity: 0 }))]),
    ]),
  ],
  template: `@if (open()) { <div @fade>Hello</div> }`,
})
export class PanelComponent { open = input(false); }
```

Vocabulary to recognise:
- **`trigger('name', [...])`** — bound in the template as `@name` or `[@name]="state"`.
- **`state('open', style({...}))`** — named states, animated between with **`transition('open => closed', ...)`**.
- **`:enter` / `:leave`** — aliases for `void => *` and `* => void` (element added/removed).
- **`query()` + `stagger()`** — animate children one after another (list items cascading in).
- **Route animations** — a trigger on the `<router-outlet>` wrapper keyed by route data.
- `(@fade.done)="..."` — callback when an animation finishes.

Downsides that led to the deprecation: an extra ~60 KB package, a separate DSL to learn, animations run through Angular's JS engine instead of native CSS, and it needed Zone.js-era plumbing.

---

<a name="which"></a>
# 5. Migrating, and which to use

| Situation | Use |
|---|---|
| hover/active/toggle effects | CSS + class binding |
| element enters/leaves (`@if`, `@for`, routes) | **`animate.enter` / `animate.leave`** (v20.2+) |
| older Angular version | `@angular/animations` (still works; deprecated, not removed) |
| complex timelines, physics, scroll-linked | a JS library via `(animate.leave)` + `animationComplete()`, or the Web Animations API |
| page-to-page transitions | the router's **View Transitions** support: `provideRouter(routes, withViewTransitions())` — the browser cross-fades between pages |

Migrating: rewrite each `trigger` as CSS `@keyframes` + `animate.enter`/`animate.leave` classes. Remove `provideAnimations*()` when nothing uses the old package any more. `stagger` becomes CSS `animation-delay: calc(var(--i) * 40ms)` with `[style.--i]="$index"`.

---

<a name="perf"></a>
# 6. Performance and accessibility

- **Animate only `transform` and `opacity`** — they skip layout and paint ([javascript Part 32 §3](../javascript/32-browser-rendering-and-loading.md)). Animating `height`, `width` or `top` causes reflow every frame.
- Keep UI animations short: **150–300 ms**. Longer feels sluggish.
- **Respect "reduce motion":** some users get dizzy or sick from motion. Turn big motion off for them:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  }
  ```
- Never hide important information *only* in an animation.

---

<a name="interview"></a>
# 7. Interview Q&A

### Q: Why can't plain CSS animate an element leaving an `@if`?
When the condition becomes false, Angular removes the element from the DOM straight away, so there's nothing left for CSS to animate. Something has to delay the removal until the animation finishes — that's what `animate.leave` (or the old `:leave` transition) does.

### Q: How do you animate an element in and out in modern Angular?
Add `animate.enter="some-class"` and `animate.leave="other-class"` on the element, and define those classes with CSS keyframes or transitions. Angular applies the classes at the right moments and waits for the leave animation to end before removing the element. For JS animation libraries, use `(animate.leave)` and call `event.animationComplete()` when done.

### Q: What happened to `@angular/animations`?
It was deprecated in Angular 20.2 in favour of native CSS with `animate.enter`/`animate.leave`. It still works, and plenty of apps use it — `trigger`, `state`, `transition`, `:enter`/`:leave`, `query`/`stagger`, registered with `provideAnimationsAsync()`. New code should use the native approach.

### Q: How do you keep animations smooth and accessible?
Animate `transform` and `opacity` only, keep them short, and respect `prefers-reduced-motion` by disabling large motion for users who ask for it.

---

<a name="summary"></a>
# 8. The 60-second summary

> *"CSS handles anything that stays on the page — bind a class and transition it. The hard case is elements that enter or leave, because Angular removes a leaving element immediately. Since Angular 20.2 you put `animate.enter` and `animate.leave` class names on the element; Angular adds them at the right time and waits for the leave animation to finish before removing it — plain CSS, no extra package. The older `@angular/animations` package — triggers, states, `:enter`/`:leave`, `stagger` — is deprecated but still everywhere in existing code. Either way, animate only transform and opacity, keep it under 300 milliseconds, and respect `prefers-reduced-motion`."*

---

## Connects to

- **[Part 04 — Directives](04-directives.md):** `@if`/`@for` are what create and destroy the elements being animated.
- **[Part 14 — Routing](14-routing.md):** `withViewTransitions()` for page transitions.
- **[Part 30 — Accessibility](30-accessibility-and-i18n.md):** reduced motion.
- **[Part 24 — Migration](24-legacy-vs-modern-and-migration.md):** the deprecation in context.

*— End of Part 28 —*
