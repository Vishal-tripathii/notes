# Angular Study Notes — Part 18

## Performance

> **Roadmap:** [Part 18](00-ROADMAP.md) · **Priority:** ⭐⭐⭐⭐☆
>
> **Continues:** [Part 10 — Change Detection](10-change-detection-and-zonejs.md) · [Part 11 — Signals](11-signals.md) · [Part 14 — Routing](14-routing.md).
>
> Each technique below has a quick ⇄ **React** snippet — the full framework-level comparison (philosophy, trade-offs) is [Part 25](25-angular-vs-react.md).

---

## Table of Contents

1. [Diagnose before you optimise](#diagnose) ⭐
2. [The two kinds of slow](#two-kinds)
3. [Runtime: `OnPush`](#onpush) ⭐
4. [Runtime: keep templates cheap](#templates) ⭐
5. [Runtime: `track` (and legacy `trackBy`)](#track)
6. [Runtime: virtual scrolling](#virtual)
7. [Runtime: stay out of the zone](#zone)
8. [Load: lazy routes](#lazy)
9. [Load: `@defer`](#defer) ⭐
10. [Load: budgets and images](#budgets)
11. [Interview Q&A](#interview)
12. [The 60-second summary](#summary)

---

<a name="diagnose"></a>
# 1. ⭐ Diagnose before you optimise

The wrong answer to "the app is slow" is a list of techniques. The right answer starts with **measuring**, because the fix depends entirely on which problem you have.

```
Chrome DevTools → Performance    where is time actually going?
Angular DevTools → Profiler      which components are being checked, and how often?
source-map-explorer              what is making the bundle big?
Network tab                      is it actually the API, not Angular at all?
```

Angular DevTools' profiler is the specific one people don't know: it records change detection cycles and shows you which components were checked and how long each took. Nine times out of ten it points straight at the culprit.

---

<a name="two-kinds"></a>
# 2. The two kinds of slow

Separate these before doing anything — the fixes have nothing in common:

```
SLOW TO LOAD        big bundle, too much JS before first paint
                    → lazy routes, @defer, budgets, images

SLOW TO INTERACT    too much work per change detection cycle
                    → OnPush, cheap templates, track, virtual scrolling
```

---

<a name="onpush"></a>
# 3. ⭐ Runtime: `OnPush`

From [Part 10](10-change-detection-and-zonejs.md) — the single biggest runtime lever.

```ts
@Component({ changeDetection: ChangeDetectionStrategy.OnPush })
```

Skipping a component skips its **entire subtree**, so putting `OnPush` high in the tree saves the most:

```
Dashboard (OnPush)      skipped
  └── Chart             never even visited
        └── Legend      never even visited
```

The contract is immutability — mutate an input object and the reference doesn't change, so the component never updates. Replace, don't mutate.

**Practical advice:** apply it to every new component by default. Retrofitting it onto an app that mutates freely is much harder than starting with it.

⇄ **React:**

```tsx
const Chart = React.memo(function Chart({ data }: { data: Data }) {
  return <canvas ... />;
});
// same contract as OnPush: memo only skips a re-render if props are REFERENCE-equal
```

---

<a name="templates"></a>
# 4. ⭐ Runtime: keep templates cheap

Template expressions re-evaluate on **every** change detection cycle. This is the most common self-inflicted performance bug:

```html
{{ calculateTotal() }}          ❌ runs on every cycle, forever
{{ items.filter(i => i.active).length }}   ❌ allocates an array every cycle
```

```html
{{ total() }}                   ✅ computed signal — cached
{{ total | currency }}          ✅ pure pipe — memoised
```

```
method call   →  every cycle
pure pipe     →  only when the input reference changes
computed()    →  only when a dependency changes
```

Same rule for getters — a getter is a method call wearing a disguise.

⇄ **React:** the identical trap, JSX instead of a template —

```tsx
<div>{calculateTotal()}</div>                              {/* ❌ runs every render */}
<div>{useMemo(() => calculateTotal(), [items])}</div>       {/* ✅ cached until items changes */}
```

---

<a name="track"></a>
# 5. Runtime: `track` (and legacy `trackBy`)

```html
@for (item of items; track item.id) { … }
```

Without a stable identity, Angular compares by object reference. Refetch a list and every object is new, so every row is destroyed and rebuilt — losing focus, scroll position and animations ([Part 04](04-directives.md)).

```
track      →  keyword, used with the modern @for block         →  MANDATORY, compile error without it
trackBy    →  a function you pass to the legacy *ngFor          →  OPTIONAL, easy to forget
```

```html
<!-- legacy *ngFor, for contrast -->
<li *ngFor="let item of items; trackBy: trackById">{{ item.name }}</li>
```
```ts
trackById(index: number, item: Item) { return item.id; }
```

`@for` makes `track` mandatory precisely because `trackBy` being optional is why so much legacy code silently rebuilds lists — full breakdown in [Part 04](04-directives.md#trackby).

⇄ **React:**

```tsx
{items.map(item => <Row key={item.id} {...item} />)}   // same rule: a stable key, never the array index
```

---

<a name="virtual"></a>
# 6. Runtime: virtual scrolling

10,000 rows means 10,000 DOM nodes, all being checked. Virtual scrolling renders only what's visible:

```html
<cdk-virtual-scroll-viewport itemSize="50" class="viewport">
  <div *cdkVirtualFor="let item of items">{{ item.name }}</div>
</cdk-virtual-scroll-viewport>
```

```
10,000 rows  →  ~20 rendered nodes, recycled as you scroll
```

Requires `@angular/cdk`. The fix when a table is slow no matter what else you do.

⇄ **React:**

```tsx
import { FixedSizeList } from 'react-window';

<FixedSizeList height={600} itemCount={10000} itemSize={50}>
  {({ index, style }) => <div style={style}>{items[index].name}</div>}
</FixedSizeList>
```

---

<a name="zone"></a>
# 7. Runtime: stay out of the zone

A `mousemove` handler triggers a full change detection cycle 60 times a second:

```ts
this.zone.runOutsideAngular(() => {
  window.addEventListener('mousemove', this.onMouseMove);
});

// re-enter only when there's something to show
this.zone.run(() => this.position.set(coords));
```

For animations, canvas work, scroll tracking, and third-party libraries with their own render loop.

⇄ **React:** no Zone.js to opt out of — React only re-renders on `setState`, so the equivalent discipline is keeping high-frequency data OUT of state until there's something to actually show:

```tsx
const posRef = useRef({ x: 0, y: 0 });
window.addEventListener('mousemove', e => { posRef.current = { x: e.clientX, y: e.clientY }; }); // no re-render at all
setPosition(coords);   // only call this when the UI actually needs to update
```

---

<a name="lazy"></a>
# 8. Load: lazy routes

```ts
{
  path: 'admin',
  loadChildren: () => import('./admin/admin.routes').then(m => m.ADMIN_ROUTES),
}
```

The dynamic `import()` creates a separate bundle chunk, downloaded only when the route is visited ([Part 14](14-routing.md)). The highest-leverage fix for a slow first paint.

Add `withPreloading(PreloadAllModules)` to fetch chunks in the background afterwards, so navigation still feels instant.

⇄ **React:**

```tsx
const AdminRoutes = React.lazy(() => import('./AdminRoutes'));

<Suspense fallback={<Spinner />}>
  <AdminRoutes />
</Suspense>
```

---

<a name="defer"></a>
# 9. ⭐ Load: `@defer`

Lazy loading *inside* a page, not just at route boundaries:

```html
@defer (on viewport) {
  <app-heavy-chart [data]="data" />
} @placeholder {
  <div class="skeleton"></div>
} @loading (after 100ms; minimum 500ms) {
  <app-spinner />
} @error {
  <p>Chart failed to load</p>
}
```

Triggers:

```
on viewport       when the placeholder scrolls into view    ← most useful
on interaction    on click or focus
on hover
on idle           when the browser is idle (the default)
on timer(3s)
when <expr>       your own condition
prefetch on ...   download early, render later
```

Before `@defer`, a heavy chart below the fold was in your initial bundle whether or not anyone scrolled to it.

⇄ **React:** same idea, but no built-in "on viewport" trigger — you supply that part yourself:

```tsx
const HeavyChart = React.lazy(() => import('./HeavyChart'));

{inViewport && (              // inViewport from your own IntersectionObserver hook
  <Suspense fallback={<Skeleton />}>
    <HeavyChart data={data} />
  </Suspense>
)}
```

---

<a name="budgets"></a>
# 10. Load: budgets and images

**Budgets** turn "the app got slowly bigger over two years" into a build failure on the PR that did it:

```json
// angular.json
"budgets": [
  { "type": "initial", "maximumWarning": "500kb", "maximumError": "1mb" },
  { "type": "anyComponentStyle", "maximumWarning": "4kb" }
]
```

**Images** are usually a bigger win than any JavaScript optimisation:

```html
<img ngSrc="hero.jpg" width="800" height="400" priority>
```

`NgOptimizedImage` enforces width/height (preventing layout shift), lazy-loads below-the-fold images automatically, and `priority` preloads the one that matters for LCP.

⇄ **React:**

```tsx
<img src="hero.jpg" width={800} height={400} loading="eager" fetchPriority="high" />
// or, in Next.js:
<Image src="/hero.jpg" width={800} height={400} priority />
```

Bundle budgets aren't built into CRA/Vite the way `angular.json` has them — enforced instead via `size-limit` or a webpack/Vite bundle-visualizer CI check.

---

<a name="interview"></a>
# 11. Interview Q&A

### Q: The app is slow. What do you do?

First measure, because slow-to-load and slow-to-interact have completely different fixes. Chrome's Performance panel and Angular DevTools' profiler tell me whether time is going into change detection and which components are being checked. If it's bundle size, source-map-explorer shows what's big. I don't apply techniques until I know which problem I have.

### Q: What does `OnPush` actually save?

It stops Angular checking a component unless an input reference changes, an event fires from within it, `markForCheck` is called, or an async pipe emits — and skipping a component skips its whole subtree. So placing it high in the tree removes the most work. The requirement is treating inputs as immutable.

### Q: Why is a method call in a template a problem?

Template expressions are re-evaluated on every change detection cycle, which can be many times a second. A method there runs every time, even when nothing it depends on has changed. A pure pipe or a computed signal only recalculates when its input actually changes.

### Q: What does `@defer` do that lazy routes don't?

Lazy routes split at route boundaries. `@defer` splits inside a page, so a heavy component below the fold isn't in the initial bundle and downloads only when its trigger fires — typically when it scrolls into view.

### Q: How would you make a 10,000-row table fast?

Virtual scrolling from the CDK, so only the visible rows exist in the DOM. Plus `OnPush` on the row component, `track` by a stable id so rows aren't rebuilt, and filtering in a computed signal rather than a pipe or a method call in the template.

### Q: What are budgets for?

Size limits in `angular.json` that fail the build when the bundle crosses them. They catch gradual bloat at the pull request that caused it, rather than a year later.

---

<a name="summary"></a>
# 12. The 60-second summary

> *"I separate slow-to-load from slow-to-interact first, because the fixes don't overlap, and I measure with Angular DevTools' profiler and the Performance panel before changing anything. For runtime, `OnPush` is the biggest lever — it skips a component and its entire subtree, so placing it high in the tree saves the most, at the cost of treating inputs as immutable. Templates must stay cheap, since expressions re-evaluate every cycle: computed signals and pure pipes instead of method calls. `track` stops lists rebuilding their DOM on every refetch, virtual scrolling caps how many nodes exist at all, and `runOutsideAngular` keeps high-frequency events from triggering cycles. For load time, lazy routes split the bundle at route boundaries and `@defer` splits inside a page, so a chart below the fold downloads only when it scrolls into view. Budgets fail the build when the bundle grows, and `NgOptimizedImage` handles the images, which are often the real problem."*

---

## Connects to

- **[Part 04 — Directives](04-directives.md):** `track` and `@defer` syntax.
- **[Part 05 — Pipes](05-pipes.md):** pure pipes as free memoisation.
- **[Part 10 — Change Detection](10-change-detection-and-zonejs.md):** what `OnPush` and `runOutsideAngular` are doing.
- **[Part 14 — Routing](14-routing.md):** lazy loading and preloading.
- **[Part 21 — SSR](21-ssr-and-hydration.md):** the other lever on first paint.
- **[Part 25 — Angular vs React](25-angular-vs-react.md):** the framework-level version of the ⇄ React comparisons above.

*— End of Part 18 —*
