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

## What `EventEmitter` actually is

It isn't an Angular-only invention bolted on from nowhere — `EventEmitter<T>` is a thin subclass of RxJS's `Subject`. `.emit(value)` is just `.next(value)` under a friendlier name. That's why you *can* technically `.subscribe()` to an `@Output()` from TypeScript, though you almost never do — the template's `(event)="handler($event)"` binding subscribes (and cleans up) for you automatically.

One detail that's a real interview trap: **`.emit()` runs synchronously by default.** The parent's handler executes immediately, in the same call stack, before `.emit()` returns to whatever line called it. It is not a Promise, not debounced, not deferred to a microtask.

## A full, real example

```ts
// employee-card.component.ts
@Component({
  selector: 'app-employee-card',
  template: `
    <div class="card">
      <h3>{{ employee.name }}</h3>
      <p>{{ employee.role }}</p>
      <button (click)="onDeleteClick()">Delete</button>
    </div>
  `,
})
export class EmployeeCardComponent {
  @Input()  employee!: Employee;
  @Output() delete = new EventEmitter<number>();   // always type it — never leave this as EventEmitter<any>

  onDeleteClick() {
    this.delete.emit(this.employee.id);   // announces WHAT happened, not what should happen next
  }
}
```

```ts
// employee-list.component.ts
@Component({
  selector: 'app-employee-list',
  template: `
    @for (emp of employees(); track emp.id) {
      <app-employee-card [employee]="emp" (delete)="removeEmployee($event)" />
    }
  `,
})
export class EmployeeListComponent {
  employees = signal<Employee[]>([/* ... */]);

  removeEmployee(id: number) {
    // the PARENT decides what "delete" means — confirm first, call an API, or just filter locally
    this.employees.update(list => list.filter(e => e.id !== id));
  }
}
```

```
EmployeeCardComponent                    EmployeeListComponent
delete.emit(3)   ─────────────────────►  removeEmployee($event)
                                                    $event === 3
```

**Why this indirection matters:** `EmployeeCardComponent` never calls an API, never touches an array, never knows it's even inside a list. It only knows *"a delete was requested for this employee."* Drop the same component into a page that shows a confirmation dialog first, and nothing inside the card changes — only the parent's `(delete)` handler does. That reusability is the entire reason `@Output` exists instead of the child reaching up and mutating shared state directly.

## Real use cases you'll actually build

```
Row/card component        →  (delete), (edit), (select) — child announces intent, parent decides the action
Custom form control        →  (valueChange) — a color picker, star rating, custom dropdown
Modal / dialog             →  (closed), (confirmed) — child reports its own outcome
Stepper / wizard           →  (stepChange) — announces navigation, parent tracks the current step
Infinite scroll             →  (scrolledToEnd) — child detects the DOM event, parent decides to fetch more
```

## Common `@Output` mistakes

- **Leaving it untyped** (`EventEmitter<any>`) — the whole benefit of typed events is lost, and the parent gets no compile-time guarantee of the payload shape.
- **Emitting the entire internal component state** instead of just what changed — couples the parent to the child's internal shape.
- **Assuming `.emit()` is async** — writing code that depends on the parent's handler running "later." It runs immediately, synchronously, in the same call stack.

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

`@Input`/`@Output` are for *data*. Sometimes what you need instead is to **call a method directly** on a child — there's no data to pass, just an action to trigger imperatively, right now. That's what `ViewChild` is for.

## A full, real example: an imperative modal

```ts
// confirm-modal.component.ts
@Component({
  selector: 'app-confirm-modal',
  template: `
    @if (visible) {
      <div class="backdrop">
        <div class="dialog">
          <p>{{ message }}</p>
          <button (click)="close()">Cancel</button>
        </div>
      </div>
    }
  `,
})
export class ConfirmModalComponent {
  visible = false;
  message = '';

  open(message: string) {   // an imperative API — there's no natural "input" for "open right now"
    this.message = message;
    this.visible = true;
  }

  close() {
    this.visible = false;
  }
}
```

```ts
// employee-list.component.ts
@Component({
  template: `
    <button (click)="onDeleteClick(emp)">Delete</button>
    <app-confirm-modal #confirmModal />
  `,
})
export class EmployeeListComponent {
  @ViewChild('confirmModal') modal!: ConfirmModalComponent;   // the CHILD INSTANCE itself, not its data

  onDeleteClick(emp: Employee) {
    this.modal.open(`Delete ${emp.name}?`);   // calling a method directly — this is what ViewChild buys you
  }
}
```

There genuinely isn't a clean `@Input`/`@Output` way to say *"open right now, with this message"* without over-engineering an input/output pair for a one-off imperative action. `ViewChild` is the escape hatch for exactly that.

## Two important details

**On a plain DOM element you get an `ElementRef`. On a component you get the actual component instance** — which is why `this.modal.open(...)` works directly.

```ts
@ViewChild('searchBox')    searchBox!: ElementRef<HTMLInputElement>;   // element → ElementRef
@ViewChild('confirmModal') modal!: ConfirmModalComponent;               // component → the instance itself
```

**You can also query by type instead of template reference name** — more common in real code, since it doesn't require adding a `#ref` to the template:

```ts
@ViewChild(ConfirmModalComponent) modal!: ConfirmModalComponent;
@ViewChildren(EmployeeCardComponent) cards!: QueryList<EmployeeCardComponent>;   // ALL matching children
```

## The `static` flag

This one confuses people, and interviews ask it directly.

```ts
@ViewChild('box', { static: true })  box!: ElementRef;   // available in ngOnInit
@ViewChild('box', { static: false }) box!: ElementRef;   // available in ngAfterViewInit (default)
```

The rule is about **whether the element can possibly be conditionally absent**:

```
Element is always in the DOM             →  static: true   → ready in ngOnInit
Element is inside @if / @for / *ngIf     →  static: false  → ready in ngAfterViewInit
```

`<app-confirm-modal>` above has no `@if` around it, so `static: true` would be legal there — but `static: false` (the default) is always safe, which is why most code just omits the flag rather than reasoning about it each time. Get it backwards — `static: true` on something inside a conditional block — and you read `undefined` in `ngOnInit`, because Angular hasn't resolved that block yet.

## Real use cases you'll actually build

```
Imperative widgets                →  Modal.open()/close(), VideoPlayer.play()/pause(), Toast.show()
Focus management                   →  focus the first invalid field after a failed form submit
DOM measurement                     →  getBoundingClientRect() to position a tooltip/popover
Wrapping a non-Angular JS library  →  handing a chart/editor library the raw <div> it needs to mount into
Triggering animations               →  starting a CSS/Web Animations API sequence on demand
```

The common thread: **something has to happen right now, imperatively** — not "whenever this data changes." If it can be expressed as data flowing down, prefer `@Input`; reach for `ViewChild` only when you genuinely need to *call* something.

---

<a name="contentchild"></a>
# 6. ⭐ `ContentChild` — reaching into projected content

Here's the distinction that matters, and it trips people up because both sound like "get me a child":

```
ViewChild     →  things in MY OWN template — I wrote them, I control them
ContentChild  →  things the PARENT projected into me via <ng-content> — I don't control what's there
```

## Real example #1 — `ContentChildren`: a Tabs component

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
    <ng-content />   <!-- the actual <app-tab> content renders here -->
  `,
})
export class TabsComponent implements AfterContentInit {
  @ContentChildren(TabComponent) tabs!: QueryList<TabComponent>;   // MULTIPLE projected children

  ngAfterContentInit() {
    this.tabs.first.active = true;   // available HERE, not in ngOnInit — the projected content wasn't ready yet
  }

  select(tab: TabComponent) {
    this.tabs.forEach(t => t.active = (t === tab));
  }
}
```

`TabsComponent` never wrote `<app-tab title="Profile">` — the *parent* did. That's exactly why the query resolves in `ngAfterContentInit` and not `ngOnInit`: Angular has to finish projecting the parent's content into `<ng-content>` first.

## Real example #2 — `ContentChild` (singular): a form-field wrapper

This is the pattern behind every UI library's form-field wrapper component (`mat-form-field` and equivalents) — it shows a label and an error message around *whatever input the caller projects in*, without knowing in advance what that input actually is.

```html
<!-- the parent decides what goes inside — could be any control -->
<app-form-field label="Email">
  <input formControlName="email" />
</app-form-field>
```

```ts
@Component({
  selector: 'app-form-field',
  template: `
    <label>{{ label }}</label>
    <ng-content />
    @if (control?.invalid && control?.touched) {
      <span class="error">This field is required</span>
    }
  `,
})
export class FormFieldComponent implements AfterContentInit {
  @Input() label = '';
  @ContentChild(NgControl) control?: NgControl;   // ONE projected control — whatever it turns out to be

  ngAfterContentInit() {
    // control is now the projected <input formControlName="email">'s NgControl
  }
}
```

`FormFieldComponent` has no idea whether the caller will project an `<input>`, a `<select>`, or a custom control — `ContentChild(NgControl)` reads whatever was actually projected and reacts to *its* validity. That's the whole reason this pattern scales to an entire component library instead of one hardcoded field type.

## `ContentChild` vs `ContentChildren`

```
ContentChild(Type)      →  ONE projected match      →  the form-field reading its single projected control
ContentChildren(Type)   →  QueryList of ALL matches  →  tabs reading every projected <app-tab>
```

Same singular/plural split as `ViewChild`/`ViewChildren` — it isn't a different concept, just "one" vs "all."

## Why two sets of lifecycle hooks exist

```
ngAfterContentInit  →  projected content is ready   (ContentChild / ContentChildren)
ngAfterViewInit     →  my own template is ready     (ViewChild / ViewChildren)
```

Content arrives from the parent and gets projected in *before* the component finishes rendering its own template around it — that ordering is exactly why content resolves first.

## Signal queries

The modern equivalents avoid the timing problem entirely — no hook to remember, no `static` flag:

```ts
searchBox = viewChild<ElementRef>('searchBox');
tabs      = contentChildren(TabComponent);
modal     = viewChild.required(ConfirmModalComponent);
control   = contentChild(NgControl);
```

They're signals, so you read them (`this.tabs()`) whenever you like and get `undefined` until they actually exist — no more guessing which lifecycle hook is "early enough."

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
- **Assuming `EventEmitter.emit()` is asynchronous.** It runs the parent's handler synchronously, in the same call stack — code that depends on it "happening later" is a real bug.
- **Reading a `ViewChild` in `ngOnInit`** without `static: true` → `undefined`.
- **Using `static: true` on an element inside `@if`** → also `undefined`, because it may not exist yet.
- **Confusing `ViewChild` with `ContentChild`** — own template vs projected content — and **`ContentChild` with `ContentChildren`** — one match vs a `QueryList` of all matches.
- **Forgetting `()` on signal inputs** — `employee.name` is undefined; `employee().name` is the value.
- **Prop drilling five levels deep** instead of using a service.

---

<a name="interview"></a>
# 10. Common interview questions

### Q: How do components communicate in Angular?

Parent to child through `@Input`, child to parent through `@Output` with an `EventEmitter`. If a parent needs direct access to a child instance there's `ViewChild`, and `ContentChild` for content projected in by a parent. For components that aren't related in the tree, a shared service — usually with a signal or a `BehaviorSubject` — is the answer.

### Q: `ViewChild` vs `ContentChild`?

`ViewChild` queries elements in the component's **own** template. `ContentChild` queries elements the parent **projected in** through `ng-content`. They resolve at different times too — content in `ngAfterContentInit`, view in `ngAfterViewInit`. A real example: a Tabs component uses `ContentChildren` to read the `<app-tab>` elements the caller projected in; a Modal component's caller uses `ViewChild` to call `.open()` on it directly.

### Q: Is `EventEmitter.emit()` synchronous or asynchronous?

Synchronous by default. `EventEmitter<T>` is a thin wrapper over RxJS's `Subject`, and `.emit()` is just `.next()` — the parent's handler runs immediately, in the same call stack, before `.emit()` returns. It's not a Promise and isn't deferred to a microtask, which matters if code after the `.emit()` call assumes the parent hasn't reacted yet.

### Q: When would you actually reach for `ViewChild` in a real app instead of `@Input`/`@Output`?

Whenever the interaction is a one-off imperative action rather than data flowing through the tree — opening a modal, focusing an input after a failed validation, calling `play()`/`pause()` on a video player, or handing a raw DOM node to a non-Angular library like a chart or rich-text editor. If it can be expressed as data, `@Input` stays the better default; `ViewChild` is for "call this method right now."

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

> *"Angular components communicate along the tree. Parent to child is `@Input`, which is really just property binding onto a component instead of a DOM element, and child to parent is `@Output` with an `EventEmitter` — a thin wrapper over RxJS's `Subject` that emits synchronously, so the parent's handler runs immediately in the same call stack. The child announces that something happened without knowing what the parent will do about it. Two-way binding is those two combined under the `x` / `xChange` convention. Modern Angular replaces the decorators with `input()`, `output()` and `model()`, which are signal-based, so inputs compose directly with `computed` instead of needing setters or `ngOnChanges`. When a parent needs to call a method directly on a child — open a modal, focus an input, wrap a non-Angular library — `ViewChild` reaches into its own template; `ContentChild`/`ContentChildren` reaches into content the parent projected in through `ng-content`, which is why there are separate `ngAfterViewInit` and `ngAfterContentInit` hooks, and why the `static` flag exists for elements that might not be rendered yet. And for components that aren't parent and child at all, the answer is a shared service provided in root, holding state in a signal."*

---

## Connects to

- **[Part 03 — Templates](03-templates-and-data-binding.md):** `[(x)]` desugaring, `ng-content`, and template reference variables.
- **[Part 07 — Lifecycle](07-lifecycle-hooks.md):** `ngOnChanges`, and why content and view hooks fire at different times.
- **[Part 08 — DI](08-dependency-injection-and-services.md):** how two components end up with the same service instance.
- **[Part 11 — Signals](11-signals.md):** `input()`, `output()`, `model()` and signal queries in full.
- **[Part 16 — State Management](16-state-management.md):** when a shared service should become a store.

*— End of Part 06 —*
