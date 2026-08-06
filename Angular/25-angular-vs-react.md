# Angular Study Notes — Part 25

## Angular vs React

> **Roadmap:** [Part 25](00-ROADMAP.md) · **Priority:** ⭐⭐⭐☆☆ — a common closing question. The trap is sounding like a partisan.
>
> **Cross-reference:** the [React track](../React/) covers the other side.

---

## 1. The core difference

```
REACT     a LIBRARY for rendering UI. You assemble the rest.
ANGULAR   a FRAMEWORK. Routing, HTTP, forms, DI and testing included, versioned together.
```

Everything else follows from that.

---

## 2. Side by side

| | React | Angular |
|---|---|---|
| Scope | rendering only | full platform |
| Language | JS or TS (optional) | TypeScript (effectively required) |
| Templates | JSX — JavaScript | HTML templates with binding syntax |
| Reactivity | re-render + VDOM diff | Zone.js / signals, direct DOM updates |
| State sharing | props, Context, external store | **dependency injection** |
| Async | promises, hooks, libraries | **RxJS**, built in |
| Data binding | one-way + callbacks | one-way, plus `[(ngModel)]` two-way |
| Routing | pick a library | `@angular/router` |
| HTTP | fetch/axios | `HttpClient` |
| Forms | pick a library | two built-in systems |
| Tooling | Vite, your own setup | CLI with schematics and `ng update` |
| Structure | your choice | conventional |

---

## 3. The four differences that actually matter

**Dependency injection.** React has no equivalent — you use Context or import a module directly. Angular's hierarchical injector is a genuinely different capability: swapping an implementation, scoping an instance per component, and mocking in tests all fall out of it.

**RxJS as a first-class citizen.** React reaches for a library when async gets complex. In Angular, cancellation, debouncing and retries are the default vocabulary. Higher ceiling, steeper floor.

**Change detection.** React re-renders a component and diffs a virtual DOM. Angular checks bindings across a component tree and updates the DOM directly — no VDOM. Signals move Angular toward fine-grained updates, which is closer to Solid or Vue than to React.

**Upgrades.** `ng update` runs codemods against your source. React ecosystem upgrades are a coordination problem across independent packages.

---

## 4. Honest trade-offs

```
REACT WINS                        ANGULAR WINS
smaller apps, faster start        large apps, many developers
flexible — pick your stack        consistent — every app looks the same
bigger job market                 enterprise, long-lived codebases
smaller bundle floor              batteries included, one upgrade path
lower initial learning curve      more capability once you're past it
```

Neither is "better". React trades consistency for flexibility; Angular trades flexibility for consistency. Which is correct depends on team size and how long the code has to live.

---

## 5. Interview Q&A

### Q: What's the main difference between Angular and React?

React is a library for rendering UI — you assemble routing, state, HTTP and forms yourself, so every codebase differs. Angular is a full framework shipping all of that from one vendor, versioned together with a CLI that can codemod your source across upgrades. You trade flexibility for consistency, which is why Angular is common in large, long-lived enterprise apps.

### Q: Which would you choose for a new project?

It depends on team size and lifespan. For a small team or a product that needs to move fast and stay light, React. For a large team on a codebase expected to live for years — especially with several developers rotating through — Angular's conventions and upgrade path pay for themselves. I wouldn't pick either on preference alone.

### Q: What does Angular have that React doesn't?

Real dependency injection, most significantly — hierarchical injectors give you scoping and swappable implementations that Context doesn't. Plus RxJS as a first-class citizen for complex async, and a CLI that migrates your code across major versions.

### Q: How does change detection differ from React's rendering?

React re-renders a component and reconciles a virtual DOM to work out what changed. Angular has no virtual DOM — it checks template bindings across the component tree and updates the DOM directly, triggered by Zone.js patching async APIs. Signals move it further, toward updating only what actually reads a changed value.

---

## 6. The 60-second summary

> *"React is a rendering library and Angular is a full framework — that single difference explains the rest. In React you choose your router, state library, HTTP client and form library, so codebases diverge; Angular ships all of it, versioned together, with a CLI that codemods your source on upgrade. The genuinely distinct capabilities on Angular's side are hierarchical dependency injection, which has no React equivalent, and RxJS being first-class for complex async. Rendering differs too: React diffs a virtual DOM, while Angular checks bindings and updates the DOM directly, with signals moving it toward fine-grained updates. The trade is flexibility versus consistency — React starts faster and stays lighter, Angular scales better across large teams and long-lived codebases. I'd choose on team size and lifespan, not preference."*

---

## Connects to

- **[React track](../React/)** — the same topics from the other side.
- **[Part 08 — DI](08-dependency-injection-and-services.md):** the biggest conceptual gap coming from React.
- **[Part 10 — Change Detection](10-change-detection-and-zonejs.md):** versus the VDOM diff.
- **[Part 12 — RxJS](12-rxjs.md):** versus promises and hooks.

*— End of Part 25 —*
