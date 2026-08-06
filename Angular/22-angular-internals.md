# Angular Study Notes — Part 22

## Angular Internals

> **Roadmap:** [Part 22](00-ROADMAP.md) · **Priority:** ⭐⭐⭐☆☆ — asked as one-line questions, not deep dives.
>
> **Continues:** [Part 01 — Bootstrap](01-angular-architecture-and-bootstrap.md) · [Part 10 — Change Detection](10-change-detection-and-zonejs.md).

---

## 1. ⭐ AOT vs JIT

```
JIT (Just-In-Time)     compile templates in the BROWSER, at runtime
AOT (Ahead-Of-Time)    compile templates at BUILD time     ← the default
```

```
JIT   ships the Angular compiler in your bundle       → bigger, slower start
      template errors appear when the page runs       → at 2am, in production

AOT   ships executable render code                    → smaller, faster start
      template errors appear during the build         → in CI, on the PR
```

There is no reason to use JIT today. It's a question about history, and the answer is "AOT, because errors move left and the compiler doesn't ship."

---

## 2. ⭐ Ivy vs ViewEngine

Ivy is the renderer and compiler that replaced ViewEngine in Angular 9. What it changed:

```
LOCALITY        each component compiles independently, knowing only itself
                → faster rebuilds, and libraries no longer need special compilation

TREE SHAKING    unused Angular features can be dropped from the bundle
                → the famous "hello world in a few KB"

DEBUGGING       readable generated code, better stack traces
                → ng.getComponent($0) in the console
```

The one-liner: **Ivy made compilation local, which made tree-shaking possible, which made bundles smaller.**

---

## 3. What a template compiles into

Not HTML strings. Executable instructions:

```html
<h1>{{ title }}</h1>
```

```js
// roughly what AOT emits
ɵɵelementStart(0, 'h1');
ɵɵtext(1);
ɵɵelementEnd();
// on update:
ɵɵadvance(1);
ɵɵtextInterpolate(ctx.title);
```

This is why change detection is fast and why template errors are caught at build time — by the time the browser sees it, your template is JavaScript.

---

## 4. `Renderer2`

Direct DOM access works in a browser and breaks everywhere else:

```ts
this.el.nativeElement.style.color = 'red';   // ❌ breaks SSR, web workers
```

```ts
private renderer = inject(Renderer2);
this.renderer.setStyle(this.el.nativeElement, 'color', 'red');   // ✅ platform-agnostic
```

`Renderer2` is an abstraction over the platform — the same code renders in the browser, on a server, or in a worker.

---

## 5. ⭐ Sanitization and XSS

Angular escapes interpolated values by default:

```html
{{ userInput }}      <!-- <script> becomes harmless text -->
```

And sanitizes bound HTML:

```html
<div [innerHTML]="userHtml"></div>    <!-- scripts and handlers stripped -->
```

Five security contexts: HTML, style, script, URL, resource URL.

The escape hatch is deliberately ugly, because it should be:

```ts
this.sanitizer.bypassSecurityTrustHtml(html);   // ⚠️ you now own the XSS risk
```

⚠️ Never call `bypassSecurityTrust*` on anything a user could influence. That's the interview point: Angular is secure by default, and the only way to create an XSS hole is to explicitly ask for one.

---

## 6. Dynamic components

```ts
private container = inject(ViewContainerRef);

show() {
  const ref = this.container.createComponent(ChartComponent);
  ref.setInput('data', this.data);
  // ref.destroy() when done
}
```

Used for modals, toasts, and anything rendered from a config object rather than written in a template.

---

## 7. `DestroyRef` and injection context

```ts
private destroyRef = inject(DestroyRef);
this.destroyRef.onDestroy(() => clearInterval(id));
```

Works in services and functions, not just components — which is why `takeUntilDestroyed()` exists ([Part 07](07-lifecycle-hooks.md)).

---

## 8. Interview Q&A

### Q: AOT vs JIT?

AOT compiles templates at build time, so the bundle contains executable render code and template errors surface during the build. JIT compiled in the browser, which meant shipping the compiler and finding template mistakes only when the page ran. AOT is the default and there's no reason to use JIT now.

### Q: What did Ivy change?

It made compilation local — each component compiles knowing only itself. That gave faster incremental builds, removed the need for special library compilation, and enabled real tree-shaking, so unused framework code drops out and bundles got much smaller. Debugging improved too.

### Q: Why use `Renderer2` instead of touching the DOM?

Because `nativeElement` assumes a browser. `Renderer2` abstracts the platform, so the same code works with server-side rendering or in a web worker.

### Q: How does Angular protect against XSS?

It escapes interpolated values and sanitizes bound HTML by default, across five security contexts. Values are only trusted if you explicitly call `bypassSecurityTrust*`, which you should never do with user-influenced content.

### Q: How do you render a component dynamically?

Inject `ViewContainerRef` and call `createComponent`, then set inputs on the returned reference and destroy it when finished. That's how modals and toasts get created from code rather than from a template.

---

## 9. The 60-second summary

> *"Angular compiles templates ahead of time into executable JavaScript instructions, so the compiler doesn't ship in the bundle and template errors surface during the build rather than at runtime — that's AOT, and JIT is the legacy alternative. Ivy replaced ViewEngine in Angular 9 and made compilation local, so each component compiles knowing only itself, which enabled proper tree-shaking and much smaller bundles. `Renderer2` abstracts DOM access so code works on the server as well as the browser, which is why direct `nativeElement` manipulation is discouraged. Angular sanitizes by default across five security contexts, escaping interpolation and stripping scripts from bound HTML, and the only way to create an XSS hole is to explicitly call `bypassSecurityTrust`. And `ViewContainerRef.createComponent` is how you render components dynamically for things like modals."*

---

## Connects to

- **[Part 01 — Bootstrap](01-angular-architecture-and-bootstrap.md):** AOT in the boot sequence.
- **[Part 04 — Directives](04-directives.md):** `TemplateRef` and `ViewContainerRef`.
- **[Part 10 — Change Detection](10-change-detection-and-zonejs.md):** what the compiled instructions are doing.
- **[Part 21 — SSR](21-ssr-and-hydration.md):** why platform-agnostic rendering matters.

*— End of Part 22 —*
