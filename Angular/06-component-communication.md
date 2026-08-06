# Angular Study Notes — Part 06

## Component Communication (`@Input`, `@Output`, signal APIs, `ViewChild`, `ContentChild`, shared services)

> **Format:** taught in small steps. This part is genuinely code-shaped, so the snippets carry more of the weight than usual — each one is a working example, not a fragment.
>
> **Roadmap:** [Part 06](00-ROADMAP.md) · **Priority:** ⭐⭐⭐⭐⭐
>
> **Continues:** [Part 03 — Templates](03-templates-and-data-binding.md) · [Part 07 — Lifecycle](07-lifecycle-hooks.md) · [Part 08 — DI](08-dependency-injection-and-services.md).

---

## Table of Contents

1. [`@Input()` — parent to child](#input)
2. [`@Output()` — child to parent](#output)
3. [Two-way binding, revisited](#twoway)
4. [The modern signal-based API](#signals) ⭐
5. [`ViewChild` — reaching into your own template](#viewchild)
6. [`ContentChild` — reaching into projected content](#contentchild) ⭐
7. [Unrelated components — the shared service](#service)
8. [Choosing between them](#choosing)
9. [Common mistakes](#mistakes)
10. [Common interview questions](#interview)
11. [The 60-second summary](#summary)

---

Your app is a tree of components. This part is about how the nodes talk to each other. There are four situations, and each has its own tool:

```
Parent  →  Child                 @Input()
Child   →  Parent                @Output()
Parent reaches INTO child        ViewChild / ContentChild
Two unrelated components         a shared service
```

---

<a name="input"></a>
# 1. `@Input()` — parent to child

The child declares what it accepts:

```ts
@Component({
  selector: 'app-employee-card',
  template: `
    <div class="card">
      <h3>{{ employee.name }}</h3>
      <p>{{ employee.role }}</p>
    </div>
  `,
})
export class EmployeeCardComponent {
  @Input() employee!: Employee;
}
```

The parent passes it down:

```html
<app-employee-card [employee]="selectedEmployee" />
```

```
Parent
  │  [employee]="selectedEmployee"
  ▼
Child   @Input() employee
```

That's it. It's a property binding ([Part 03](03-templates-and-data-binding.md)) where the target property happens to live on a component instead of a DOM element.

## Useful input options

```ts
@Input({ required: true }) employee!: Employee;   // compile error if the parent omits it

@Input({ alias: 'user' }) employee!: Employee;    // parent writes [user], class uses employee

@Input({ transform: booleanAttribute }) disabled = false;
// now <app-card disabled> works — the bare attribute becomes true
```

`required` is worth using by default. Without it, a forgotten input silently becomes `undefined` and you debug a template error instead of seeing the mistake at the call site.

## Reacting when an input changes

Two ways. A **setter**, when you care about one input:

```ts
@Input() set employee(value: Employee) {
  this._employee = value;
  this.loadPermissions(value.id);   // runs on every new value
}
```

Or **`ngOnChanges`**, when you need several inputs at once, or want to compare old and new:

```ts
ngOnChanges(changes: SimpleChanges) {
  if (changes['employee'] && !changes['employee'].firstChange) {
    console.log(changes['employee'].previousValue, '→', changes['employee'].currentValue);
  }
}
```

More on the lifecycle in [Part 07](07-lifecycle-hooks.md).

---

<a name="output"></a>
# 2. `@Output()` — child to parent

The child can't call the parent. It **emits an event**, and the parent decides what that means.

```ts
@Component({
  selector: 'app-employee-card',
  template: `
    <div class="card">
      <h3>{{ employee.name }}</h3>
      <button (click)="delete.emit(employee.id)">Delete</button>
    </div>
  `,
})
export class EmployeeCardComponent {
  @Input()  employee!: Employee;
  @Output() delete = new EventEmitter<number>();
}
```

```html
<app-employee-card
  [employee]="emp"
  (delete)="removeEmployee($event)" />
```

```
Child                              Parent
delete.emit(3)  ────────────────►  removeEmployee($event)
                                              $event === 3
```

`$event` is whatever you passed to `emit()` — typed by the generic on `EventEmitter<number>`.

**Why this indirection matters:** the child stays reusable. It announces *"a delete was requested"* without knowing whether the parent will show a confirmation dialog, call an API, or ignore it entirely.

---

<a name="twoway"></a>
# 3. Two-way binding, revisited

You already know from [Part 03](03-templates-and-data-binding.md) that `[(x)]` is just an input plus an output. Now you can see the full picture:

```ts
export class SearchBoxComponent {
  @Input()  value = '';
  @Output() valueChange = new EventEmitter<string>();

  onType(text: string) {
    this.valueChange.emit(text);
  }
}
```

```html
<app-search-box [(value)]="query" />
```

The `Change` suffix is the entire contract. Name them `value` and `valueChange` and two-way binding works.

---

<a name="signals"></a>
# 4. ⭐ The modern signal-based API

Angular 17.1+ replaces the decorators with functions. Same concepts, better ergonomics.

```ts
export class EmployeeCardComponent {
  // inputs — these are SIGNALS, so you call them
  employee = input.required<Employee>();
  compact  = input(false);

  // output
  delete = output<number>();

  // two-way in one line
  selected = model(false);

  onDelete() {
    this.delete.emit(this.employee().id);   // note the ()
  }
}
```

```html
<h3>{{ employee().name }}</h3>
```

Three genuine improvements:

**They're signals**, so they work with `computed()` without any extra wiring:

```ts
employee = input.required<Employee>();
displayName = computed(() => `${this.employee().name} (${this.employee().role})`);
```

That replaces the setter-plus-recompute pattern entirely.

**`model()` gives both halves at once** — no more declaring `value` and `valueChange` separately.

**`input.required()` is enforced by the type system**, so the property is never `undefined`.

```
DECORATOR                           SIGNAL
@Input() x                     →    x = input()
@Input({required:true}) x!     →    x = input.required()
@Output() y = new EventEmitter →    y = output()
@Input() v + @Output() vChange →    v = model()
```

Decorators still work and are everywhere in existing code. Write new components with signals — see [Part 11](11-signals.md).

---

<a name="viewchild"></a>
# 5. `ViewChild` — reaching into your own template

Sometimes a parent needs the actual child object, not just to pass data down. Focusing an input, calling `open()` on a modal, reading a canvas.

```ts
@Component({
  template: `
    <input #searchBox />
    <app-modal #confirmModal />
    <button (click)="focusSearch()">Focus</button>
  `,
})
export class PageComponent implements AfterViewInit {
  @ViewChild('searchBox') searchBox!: ElementRef<HTMLInputElement>;
  @ViewChild('confirmModal') modal!: ModalComponent;

  ngAfterViewInit() {
    this.searchBox.nativeElement.focus();
  }

  confirm() {
    this.modal.open();          // calling a child component's method directly
  }
}
```

Two important details.

**On a plain element you get an `ElementRef`. On a component you get the component instance** — which is why `this.modal.open()` works.

**You can also query by type**, which is more common than by reference name:

```ts
@ViewChild(ModalComponent) modal!: ModalComponent;
@ViewChildren(EmployeeCardComponent) cards!: QueryList<EmployeeCardComponent>;
```

## The `static` flag

This one confuses people, and interviews ask it.

```ts
@ViewChild('box', { static: true })  box!: ElementRef;   // available in ngOnInit
@ViewChild('box', { static: false }) box!: ElementRef;   // available in ngAfterViewInit (default)
```

The rule is about **whether the element can be conditionally absent**:

```
Element is always in the DOM             →  static: true   → ready in ngOnInit
Element is inside @if / @for / *ngIf     →  static: false  → ready in ngAfterViewInit
```

If it's inside a conditional block, Angular can't resolve it before the first render — so it can't be `static`. Get this wrong and you read `undefined` in `ngOnInit`.

---

<a name="contentchild"></a>
# 6. ⭐ `ContentChild` — reaching into projected content

Here's the distinction that matters:

```
ViewChild     →  things in MY OWN template
ContentChild  →  things the PARENT projected into me via <ng-content>
```

```html
<!-- the parent writes this -->
<app-tabs>
  <app-tab title="Profile">…</app-tab>
  <app-tab title="Settings">…</app-tab>
</app-tabs>
```

```ts
@Component({
  selector: 'app-tabs',
  template: `
    <nav>
      @for (tab of tabs; track tab.title) {
        <button (click)="select(tab)">{{ tab.title }}</button>
      }
    </nav>
    <ng-content />
  `,
})
export class TabsComponent implements AfterContentInit {
  @ContentChildren(TabComponent) tabs!: QueryList<TabComponent>;

  ngAfterContentInit() {
    this.tabs.first.active = true;   // available HERE, not in ngOnInit
  }
}
```

The tabs weren't written by `TabsComponent` — they were handed to it. That's why they arrive at `ngAfterContentInit` and not `ngAfterViewInit`.

This is the whole reason Angular has two sets of lifecycle hooks:

```
ngAfterContentInit  →  projected content is ready   (ContentChild)
ngAfterViewInit     →  my own template is ready     (ViewChild)
```

## Signal queries

The modern equivalents avoid the timing problem entirely:

```ts
searchBox = viewChild<ElementRef>('searchBox');
tabs      = contentChildren(TabComponent);
modal     = viewChild.required(ModalComponent);
```

They're signals, so you read them whenever you like and get `undefined` until they exist. No `static` flag, no hook to remember.

---

<a name="service"></a>
# 7. Unrelated components — the shared service

`@Input`/`@Output` only work along a parent–child edge. When two components sit in different branches of the tree, threading data through five intermediate components — "prop drilling" — is miserable.

The answer is a service holding shared state:

```ts
@Injectable({ providedIn: 'root' })
export class CartService {
  private items = signal<Item[]>([]);

  readonly count = computed(() => this.items().length);

  add(item: Item) {
    this.items.update(list => [...list, item]);
  }
}
```

```ts
// ProductComponent — deep in one branch
private cart = inject(CartService);
addToCart(item: Item) { this.cart.add(item); }
```

```ts
// HeaderComponent — a completely different branch
private cart = inject(CartService);
count = this.cart.count;      // updates automatically
```

```
        AppComponent
        /          \
   Header          ProductPage
      │                 │
      └──── CartService ┘      ← both inject the same instance
```

Neither component knows the other exists. The service is the meeting point.

How they get the *same* instance is [Part 08](08-dependency-injection-and-services.md); managing that state properly is [Part 16](16-state-management.md).

---

<a name="choosing"></a>
# 8. Choosing between them

```
Data down to a direct child        →  @Input / input()
Event up to a direct parent        →  @Output / output()
Both directions on one value       →  model()  (or x + xChange)
Call a method on a child           →  ViewChild
Inspect projected children         →  ContentChild
Components in different branches   →  shared service
```

One guideline worth internalising: **prefer inputs and outputs**. `ViewChild` couples the parent to the child's internals, so reach for it only when you truly need imperative control — focus, open, play, scroll.

---

<a name="mistakes"></a>
# 9. Common mistakes

- **Mutating an `@Input` object inside the child.** The parent owns that object; mutate it and the parent's state changes behind its back. Emit an event instead.
- **Reading a `ViewChild` in `ngOnInit`** without `static: true` → `undefined`.
- **Using `static: true` on an element inside `@if`** → also `undefined`, because it may not exist yet.
- **Confusing `ViewChild` with `ContentChild`** — own template vs projected content.
- **Forgetting `()` on signal inputs** — `employee.name` is undefined; `employee().name` is the value.
- **Prop drilling five levels deep** instead of using a service.

---

<a name="interview"></a>
# 10. Common interview questions

### Q: How do components communicate in Angular?

Parent to child through `@Input`, child to parent through `@Output` with an `EventEmitter`. If a parent needs direct access to a child instance there's `ViewChild`, and `ContentChild` for content projected in by a parent. For components that aren't related in the tree, a shared service — usually with a signal or a `BehaviorSubject` — is the answer.

### Q: `ViewChild` vs `ContentChild`?

`ViewChild` queries elements in the component's **own** template. `ContentChild` queries elements the parent **projected in** through `ng-content`. They resolve at different times too — content in `ngAfterContentInit`, view in `ngAfterViewInit`.

### Q: What does the `static` flag do?

It controls when the query is resolved. `static: true` resolves before the first change detection run, so the result is available in `ngOnInit` — but only works if the element is unconditionally present. If it's inside `@if` or `@for`, it must be `static: false`, resolving in `ngAfterViewInit`. Signal-based queries remove the problem entirely.

### Q: What's the advantage of `input()` over `@Input()`?

Signal inputs are signals, so they compose directly with `computed()` and `effect()` instead of needing a setter or `ngOnChanges` to react to changes. `input.required()` is enforced by the type system, and `model()` declares a two-way binding in one line instead of an input plus a matching `Change` output.

### Q: How would two unrelated components share state?

A service provided in root, so both inject the same instance, holding the state in a signal or `BehaviorSubject`. Both components read and update through the service rather than knowing about each other.

### Q: Should a child modify an object it received as an input?

No — the parent owns it, and mutating it changes the parent's state invisibly. The child should emit an event and let the parent decide.

---

<a name="summary"></a>
# 11. The 60-second summary

> *"Angular components communicate along the tree. Parent to child is `@Input`, which is really just property binding onto a component instead of a DOM element, and child to parent is `@Output` with an `EventEmitter` — the child announces that something happened without knowing what the parent will do about it. Two-way binding is those two combined under the `x` / `xChange` convention. Modern Angular replaces the decorators with `input()`, `output()` and `model()`, which are signal-based, so inputs compose directly with `computed` instead of needing setters or `ngOnChanges`. When a parent needs the child object itself, `ViewChild` queries its own template and `ContentChild` queries content projected in through `ng-content` — which is why there are separate `ngAfterViewInit` and `ngAfterContentInit` hooks, and why the `static` flag exists for elements that might not be rendered yet. And for components that aren't parent and child at all, the answer is a shared service provided in root, holding state in a signal."*

---

## Connects to

- **[Part 03 — Templates](03-templates-and-data-binding.md):** `[(x)]` desugaring, `ng-content`, and template reference variables.
- **[Part 07 — Lifecycle](07-lifecycle-hooks.md):** `ngOnChanges`, and why content and view hooks fire at different times.
- **[Part 08 — DI](08-dependency-injection-and-services.md):** how two components end up with the same service instance.
- **[Part 11 — Signals](11-signals.md):** `input()`, `output()`, `model()` and signal queries in full.
- **[Part 16 — State Management](16-state-management.md):** when a shared service should become a store.

*— End of Part 06 —*
