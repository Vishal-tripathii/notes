# Angular Study Notes — Part 05

## Pipes (Built-ins, Pure vs Impure, Custom, `async`)

> **Format:** taught in small steps — each idea derived from the problem it solves, with flow diagrams and short snippets for illustration.
>
> **Roadmap:** [Part 05](00-ROADMAP.md) · **Priority:** ⭐⭐⭐☆☆
>
> **Continues:** [Part 03 — Templates](03-templates-and-data-binding.md) · [Part 11 — Signals](11-signals.md) · [Part 12 — RxJS](12-rxjs.md).

---

## Table of Contents

1. [What is a pipe?](#what)
2. [Why they exist](#why)
3. [Built-ins worth knowing](#builtins)
4. [Pure vs impure](#pure-impure) ⭐
5. [Writing your own](#custom)
6. [The `async` pipe](#async) ⭐
7. [Why there is no `filter` or `sort` pipe](#no-filter) ⭐
8. [Pipe vs method vs computed](#comparison)
9. [Common mistakes](#mistakes)
10. [Common interview questions](#interview)
11. [The 60-second summary](#summary)

---

<a name="what"></a>
# 1. What is a pipe?

A pipe transforms a value **for display**, inside the template.

```html
<p>{{ price | currency }}</p>
```

```
1234.5
   │
   │ currency
   ▼
$1,234.50
```

The component keeps the raw number. The template shows a formatted string. Neither has to know about the other.

---

<a name="why"></a>
# 2. Why they exist

Without pipes, formatting has to live somewhere — and both options are bad.

**Option A: format in the class.**

```ts
export class ProductComponent {
  price = 1234.5;
  formattedPrice = '$' + this.price.toFixed(2);   // the same value, stored twice
}
```

Two fields that must stay in sync. Change one, forget the other, and the screen is wrong.

**Option B: format in the template.**

```html
{{ '$' + price.toFixed(2) }}
```

Now presentation logic is scattered across every template that shows a price, and none of it is reusable.

A pipe is the third option: **a named, reusable transformation that lives outside both.**

```html
{{ price | currency }}
```

---

<a name="builtins"></a>
# 3. Built-ins worth knowing

```html
{{ name | uppercase }}                      ALICE
{{ today | date:'dd MMM yyyy' }}            05 Aug 2026
{{ price | currency:'INR' }}                ₹1,234.50
{{ ratio | percent }}                       75%
{{ obj | json }}                            debugging
{{ items | slice:0:5 }}                     first five
{{ map | keyvalue }}                        iterate an object
```

**Parameters** come after a colon. **Chaining** flows left to right:

```html
{{ today | date:'fullDate' | uppercase }}
```

---

<a name="pure-impure"></a>
# 4. ⭐ Pure vs impure — the whole ballgame

This is the part interviews care about.

Every pipe is **pure** by default. A pure pipe only re-runs when its input **changes by reference**.

```
price = 100    →  pipe runs
price = 100    →  pipe skipped (same value)
price = 200    →  pipe runs
```

That's a big deal, because template expressions are evaluated on every change-detection cycle — which can be many times per second. A pure pipe mostly *skips*.

Now the catch. Reference comparison means **mutations are invisible**:

```ts
this.items.push(newItem);                 // same reference → pure pipe does NOT re-run
this.items = [...this.items, newItem];    // new reference  → pipe re-runs ✅
```

An **impure** pipe opts out of that optimisation:

```ts
@Pipe({ name: 'myPipe', pure: false })
```

```
Pure    → runs when the input REFERENCE changes
Impure  → runs on EVERY change detection cycle
```

Impure means the pipe can be running hundreds of times a second. Angular ships a few deliberately — `async`, `json`, `keyvalue`, `slice` — because they have no other way to work. Yours should almost never be one.

---

<a name="custom"></a>
# 5. Writing your own

```ts
@Pipe({ name: 'timeAgo' })
export class TimeAgoPipe implements PipeTransform {
  transform(value: Date, suffix = 'ago'): string {
    const mins = Math.floor((Date.now() - value.getTime()) / 60000);
    return `${mins}m ${suffix}`;
  }
}
```

```html
{{ post.createdAt | timeAgo }}
{{ post.createdAt | timeAgo:'earlier' }}
```

The shape is fixed: implement `PipeTransform`, and `transform(value, ...args)` where the first parameter is the piped value and the rest are the colon-separated arguments.

Like components and directives, a pipe must appear in the consuming component's `imports`.

---

<a name="async"></a>
# 6. ⭐ The `async` pipe — the one you'll use most

Consuming an Observable manually means four things to remember:

```ts
export class UserComponent implements OnInit, OnDestroy {
  user?: User;
  private sub?: Subscription;

  ngOnInit() {
    this.sub = this.service.getUser().subscribe(u => this.user = u);
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();       // forget this → memory leak
  }
}
```

The `async` pipe collapses all of it:

```ts
user$ = this.service.getUser();
```

```html
@if (user$ | async; as user) {
  <p>{{ user.name }}</p>
}
```

It does three jobs:

```
subscribes         when the view is created
unwraps            gives you the latest emitted value
unsubscribes       automatically on destroy   ← the leak, gone
```

And a fourth that matters later: it calls `markForCheck()`, which is what makes Observables work with `OnPush` change detection ([Part 10](10-change-detection-and-zonejs.md)).

This is why `async` is an impure pipe — it has to check on every cycle whether a new value arrived.

⚠️ Using `| async` twice on the same Observable creates **two subscriptions** — two HTTP calls. The `as` alias above is the fix.

---

<a name="no-filter"></a>
# 7. ⭐ Why there is no `filter` or `sort` pipe

A very common interview question, and the reasoning is instructive.

You'd expect Angular to ship these. It deliberately doesn't.

```html
<li *ngFor="let u of users | filterBy:search">   <!-- ✗ don't -->
```

The problem is pure vs impure, and neither option works:

**Make it pure** → it won't re-run when you `push` to the array, because the reference didn't change. Your filter silently goes stale.

**Make it impure** → it runs on *every change detection cycle*, filtering the whole list many times per second, on every keystroke elsewhere on the page.

So do the filtering in the component instead, where it runs when the data actually changes:

```ts
filtered = computed(() =>
  this.users().filter(u => u.name.includes(this.search()))
);
```

```html
@for (u of filtered(); track u.id) { … }
```

Same declarative feel, none of the cost.

---

<a name="comparison"></a>
# 8. Pipe vs method vs computed

```
{{ format(x) }}       method    → runs EVERY change detection cycle    ✗
{{ x | format }}      pure pipe → runs only when x changes             ✅
computed(() => …)     signal    → recalculates only when deps change   ✅
```

A pipe is essentially **memoisation you get for free** — which is exactly why `{{ getTotal() }}` is a mistake and `{{ total | currency }}` isn't.

Rough guide: pipe for *display formatting*, `computed` for *derived data*.

---

<a name="mistakes"></a>
# 9. Common mistakes

- **Writing an impure pipe** because "it wasn't updating." The real fix is usually a new array reference.
- **`| async` used twice** on the same Observable → duplicate subscriptions. Alias with `as`.
- **Filtering or sorting in a pipe** — §7.
- **Heavy work inside `transform`** — even a pure pipe runs on every reference change.
- **Forgetting to add the pipe to `imports`** → *"The pipe 'x' could not be found."*

---

<a name="interview"></a>
# 10. Common interview questions

### Q: What's the difference between a pure and an impure pipe?

A pure pipe only re-runs when its input changes by reference, so Angular skips it on most change detection cycles. An impure pipe runs on every cycle. Pure is the default and almost always what you want — impure is for pipes that can't detect their own changes, like `async`.

### Q: My pipe isn't updating when I add to an array. Why?

Because the array reference didn't change — `push` mutates in place, so a pure pipe correctly decides nothing happened. The fix is to replace the array with a new one, not to make the pipe impure.

### Q: What does the `async` pipe do?

It subscribes to an Observable, gives the template the latest value, and unsubscribes automatically when the component is destroyed — so it removes the whole `OnDestroy` cleanup burden. It also calls `markForCheck`, which is what makes Observables work under `OnPush`.

### Q: Why doesn't Angular provide a filter or sort pipe?

Because neither variant works. A pure one won't notice in-place mutations, so it goes stale. An impure one runs on every change detection cycle and re-filters the entire list constantly. Filtering belongs in the component, where it runs when the data actually changes.

### Q: Pipe or method call in the template?

A method call runs on every change detection cycle. A pure pipe only re-runs when its input changes, so it's effectively free memoisation. Use a pipe for formatting and a computed signal for derived data.

---

<a name="summary"></a>
# 11. The 60-second summary

> *"A pipe transforms a value for display inside the template, so the component keeps the raw data and the formatting stays reusable. Pipes are pure by default, meaning they only re-run when the input changes by reference — that's what makes them cheaper than a method call, which re-evaluates on every change detection cycle. The trade-off is that in-place mutations are invisible to a pure pipe, so you replace the array rather than mutating it. Impure pipes run on every cycle and should be rare; Angular ships a few, notably `async`, which subscribes, unwraps the latest value, unsubscribes on destroy and calls `markForCheck` so Observables work with OnPush. Angular deliberately doesn't ship filter or sort pipes, because a pure one goes stale on mutation and an impure one re-filters the list constantly — that work belongs in the component or a computed signal."*

---

## Connects to

- **[Part 03 — Templates](03-templates-and-data-binding.md):** where pipes are used, and why template expressions must stay cheap.
- **[Part 10 — Change Detection](10-change-detection-and-zonejs.md):** why purity matters and what `markForCheck` does.
- **[Part 11 — Signals](11-signals.md):** `computed()` as the answer for derived data.
- **[Part 12 — RxJS](12-rxjs.md):** the Observables the `async` pipe consumes.
- **[Part 18 — Performance](18-performance.md):** pipes vs method calls in templates.

*— End of Part 05 —*
