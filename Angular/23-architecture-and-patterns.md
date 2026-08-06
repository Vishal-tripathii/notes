# Angular Study Notes — Part 23

## Architecture & Patterns

> **Roadmap:** [Part 23](00-ROADMAP.md) · **Priority:** ⭐⭐⭐☆☆ — one question, usually "how would you structure a large app?"
>
> **Continues:** [Part 08 — DI](08-dependency-injection-and-services.md) · [Part 16 — State](16-state-management.md).

---

## 1. ⭐ Smart vs dumb components

The most useful structural idea in frontend, and the one interviews ask about:

```
SMART (container)          DUMB (presentational)
injects services           no services
fetches data               receives @Input
handles events             emits @Output
knows the app              knows nothing — reusable anywhere
usually a route component  usually OnPush
```

```ts
// SMART — knows where data comes from
@Component({
  template: `
    @for (e of employees(); track e.id) {
      <app-employee-card [employee]="e" (delete)="remove($event)" />
    }
  `,
})
export class EmployeeListPage {
  private service = inject(EmployeeService);
  employees = toSignal(this.service.getAll(), { initialValue: [] });
  remove(id: number) { this.service.delete(id).subscribe(); }
}
```

```ts
// DUMB — knows nothing about the app
@Component({
  selector: 'app-employee-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmployeeCardComponent {
  employee = input.required<Employee>();
  delete   = output<number>();
}
```

**Why it pays:** dumb components are trivially testable, reusable across features, and safe to put on `OnPush`. The app's knowledge concentrates in a few smart components you can reason about.

---

## 2. Folder structure that survives

```
src/app/
├── core/            singletons: auth, interceptors, guards, error handling
│                    imported once, never feature-specific
├── shared/          dumb components, pipes, directives used everywhere
│                    NO services with state
└── features/
    ├── employees/
    │   ├── pages/        smart, route-level components
    │   ├── components/   dumb components for THIS feature only
    │   ├── services/
    │   └── employees.routes.ts
    └── admin/
```

Two rules keep it honest:

```
features NEVER import from each other  →  go through core or shared
shared holds NO state                  →  otherwise it's core
```

Cross-feature imports are how a codebase becomes a knot. If two features need the same thing, it belongs in `shared` or `core`.

---

## 3. The facade pattern

When a feature's components each inject four services, put one service in front:

```ts
@Injectable({ providedIn: 'root' })
export class EmployeeFacade {
  private api = inject(EmployeeApi);
  private store = inject(EmployeeStore);
  private notifications = inject(NotificationService);

  readonly employees = this.store.employees;
  readonly loading   = this.store.loading;

  load() {
    this.store.setLoading(true);
    this.api.getAll().subscribe({
      next: e => this.store.set(e),
      error: () => this.notifications.error('Failed to load'),
    });
  }
}
```

The component injects one thing and calls `facade.load()`. The orchestration moves out of the component, and swapping the store implementation touches one file.

⚠️ Don't add a facade that just forwards calls with no logic — that's indirection with no payoff.

---

## 4. Composition over inheritance

Angular components inherit awkwardly — metadata isn't inherited cleanly, and a base class quickly becomes a dumping ground.

```
❌  class EmployeeCard extends BaseCard
✅  a directive, a service, or content projection
```

`hostDirectives` composes behaviour without inheritance:

```ts
@Component({
  selector: 'app-card',
  hostDirectives: [TooltipDirective, DraggableDirective],
})
```

---

## 5. Interview Q&A

### Q: How would you structure a large Angular app?

Feature folders, with `core` for singletons like auth and interceptors, `shared` for stateless reusable components and pipes, and each feature owning its pages, components, services and routes. Two rules: features never import from each other, and `shared` holds no state. Route-level features are lazy loaded so the structure matches the bundle boundaries.

### Q: What's a smart vs dumb component?

A smart component injects services, fetches data and handles events — usually a route-level component. A dumb component takes inputs and emits outputs and knows nothing about the app, which makes it reusable, easy to test, and safe on `OnPush`. Concentrating app knowledge in a few smart components keeps the rest simple.

### Q: What's a facade?

A service that sits in front of several others so a component injects one thing instead of four. It moves orchestration out of components and makes the underlying implementation swappable. It's only worth it when there's real coordination — a pure pass-through is just indirection.

### Q: Why avoid component inheritance?

Angular metadata doesn't inherit cleanly and base classes accumulate unrelated logic. Composition works better — a directive for behaviour, a service for logic, content projection for structure, or `hostDirectives` to attach behaviour without a base class.

---

## 6. The 60-second summary

> *"I structure by feature, with a `core` folder for singletons like auth and interceptors, a `shared` folder for stateless reusable components and pipes, and each feature owning its own pages, components, services and routes — with the rules that features never import from each other and shared holds no state. Within a feature I separate smart from dumb components: smart ones inject services and fetch data, dumb ones only take inputs and emit outputs, which makes them reusable, testable and safe on `OnPush`. When a feature's components would each inject several services, a facade puts one service in front and moves orchestration out of the components. And I compose rather than inherit — directives, services and `hostDirectives` instead of base classes, since Angular metadata doesn't inherit cleanly."*

---

## Connects to

- **[Part 06 — Communication](06-component-communication.md):** inputs and outputs as the dumb-component contract.
- **[Part 08 — DI](08-dependency-injection-and-services.md):** the facade as a provider.
- **[Part 10 — Change Detection](10-change-detection-and-zonejs.md):** why dumb components can be `OnPush`.
- **[Part 14 — Routing](14-routing.md):** lazy loading along feature boundaries.

*— End of Part 23 —*
