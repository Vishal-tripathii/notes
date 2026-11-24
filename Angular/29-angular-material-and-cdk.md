# Angular Study Notes — Part 29

## Angular Material & the CDK — Components, Theming, Overlay, Drag & Drop, Virtual Scroll

> **Roadmap:** [Part 29](00-ROADMAP.md) · **Priority:** ⭐⭐⭐☆☆
>
> **Continues:** [Part 18 — Performance](18-performance.md) (virtual scrolling) · [Part 20 — Testing](20-testing.md) (component harnesses) · [Part 30 — Accessibility](30-accessibility-and-i18n.md).
>
> **Why this part exists:** most enterprise Angular apps use Angular Material, and the CDK is where Angular's best low-level building blocks live. Interviewers ask "have you built a custom dropdown / modal / sortable list?" — the strong answer usually starts with "on top of the CDK."

---

## Table of Contents

1. [Material vs CDK — what's the difference?](#difference)
2. [Using Material components](#material)
3. [Theming (Material 3)](#theming)
4. [⭐ CDK Overlay & Dialog — modals, dropdowns, tooltips](#overlay)
5. [CDK Drag & Drop](#dragdrop)
6. [CDK Virtual Scroll](#virtual)
7. [Other CDK tools worth knowing](#other)
8. [Interview Q&A](#interview)
9. [The 60-second summary](#summary)

---

<a name="difference"></a>
# 1. Material vs CDK — what's the difference?

| | **Angular Material** (`@angular/material`) | **CDK** (`@angular/cdk`) — Component Dev Kit |
|---|---|---|
| What it is | ready-made **styled** components following Google's Material Design | **unstyled behaviour** building blocks |
| Examples | buttons, form fields, select, datepicker, table, dialog, snackbar | overlay, drag & drop, virtual scroll, a11y (focus trap, live announcer), layout breakpoints, portals |
| Use when | you're happy with the Material look (admin tools, internal apps) | you have your own design system but don't want to rebuild positioning, focus, keyboard handling |

> **Analogy 🏠 — a furnished flat vs the building's plumbing and wiring.** Material is the furnished flat: move in and use it. The CDK is the plumbing and wiring: you design the rooms yourself, but you don't have to reinvent water and electricity.

Material is **built on the CDK** — a `mat-select` uses the CDK overlay, a11y and keyboard helpers underneath.

---

<a name="material"></a>
# 2. Using Material components

```bash
ng add @angular/material      # installs, sets up a theme, fonts, and animations if needed
```

Standalone components import exactly what they use:

```ts
@Component({
  imports: [MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule],
  template: `
    <mat-form-field appearance="outline">
      <mat-label>Role</mat-label>
      <mat-select [formControl]="role">
        @for (r of roles; track r) { <mat-option [value]="r">{{ r }}</mat-option> }
      </mat-select>
      @if (role.hasError('required')) { <mat-error>Role is required</mat-error> }
    </mat-form-field>
    <button mat-flat-button (click)="save()">Save</button>
  `,
})
```

**Dialog** (very common):

```ts
private dialog = inject(MatDialog);

confirmDelete(emp: Employee) {
  this.dialog.open(ConfirmDialog, { data: { name: emp.name }, width: '400px' })
    .afterClosed()
    .subscribe(ok => { if (ok) this.delete(emp.id); });
}

// inside ConfirmDialog
data = inject(MAT_DIALOG_DATA);
ref  = inject(MatDialogRef<ConfirmDialog, boolean>);
// <button (click)="ref.close(true)">Delete</button>
```

**Table** with sorting and paging: `mat-table` + `MatSort` + `MatPaginator` with a `MatTableDataSource` for client-side data, or your own sort/page events calling the API for server-side data (large datasets).

---

<a name="theming"></a>
# 3. Theming (Material 3)

Current Material uses **Material 3** design and is themed with a Sass mixin that emits **CSS variables**:

```scss
@use '@angular/material' as mat;

html {
  color-scheme: light dark;                         // follows the user's OS setting
  @include mat.theme((
    color: (primary: mat.$azure-palette, tertiary: mat.$blue-palette),
    typography: Roboto,
    density: 0,
  ));
}
```

- Components read `--mat-sys-*` CSS variables, so **your own components can use them too**: `background: var(--mat-sys-surface)`.
- Customise one component with its "overrides" mixin (e.g. `mat.button-overrides(...)`) instead of fighting internal CSS.
- ⚠️ Don't target Material's internal classes (`.mat-mdc-…`) with `::ng-deep` — they change between versions ([Part 02 §8](02-components.md)). Use the theming API or CSS variables.

---

<a name="overlay"></a>
# 4. ⭐ CDK Overlay & Dialog — modals, dropdowns, tooltips

Building a dropdown or modal "by hand" means solving: rendering above everything (z-index, `overflow: hidden` parents), **positioning** next to a trigger and flipping when there's no room, closing on outside-click and Escape, **trapping focus** inside a modal and **returning focus** after, blocking page scroll. The CDK Overlay does all of it.

```ts
private overlay = inject(Overlay);

openMenu(trigger: HTMLElement) {
  const ref = this.overlay.create({
    positionStrategy: this.overlay.position()
      .flexibleConnectedTo(trigger)
      .withPositions([
        { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top' },   // below
        { originX: 'start', originY: 'top',    overlayX: 'start', overlayY: 'bottom' }, // flip above if no room
      ]),
    hasBackdrop: true,
    backdropClass: 'cdk-overlay-transparent-backdrop',
    scrollStrategy: this.overlay.scrollStrategies.reposition(),
  });
  ref.attach(new ComponentPortal(MenuComponent));
  ref.backdropClick().subscribe(() => ref.dispose());
  ref.keydownEvents().pipe(filter(e => e.key === 'Escape')).subscribe(() => ref.dispose());
}
```

Simpler options on top:
- **`@angular/cdk/dialog`** — `Dialog.open(Component)` with focus trap, Escape, backdrop and ARIA, but **no Material styling** (bring your own).
- **`cdkConnectedOverlay`** directive — declare the overlay in the template next to its trigger.
- **`cdk/menu`** — accessible menus with full keyboard support.

---

<a name="dragdrop"></a>
# 5. CDK Drag & Drop

Sortable lists and moving items between lists (Kanban boards) — with mouse, touch and keyboard-free basics, animations and auto-scroll.

```ts
@Component({
  imports: [CdkDropList, CdkDrag],
  template: `
    <ul cdkDropList (cdkDropListDropped)="drop($event)">
      @for (task of tasks(); track task.id) {
        <li cdkDrag>{{ task.title }}</li>
      }
    </ul>
  `,
})
export class TaskList {
  tasks = signal<Task[]>([]);
  drop(e: CdkDragDrop<Task[]>) {
    this.tasks.update(list => {
      const copy = [...list];
      moveItemInArray(copy, e.previousIndex, e.currentIndex);   // mutates — so copy first for signals/OnPush
      return copy;
    });
  }
}
```

Two lists: connect them with `[cdkDropListConnectedTo]` (or a `cdkDropListGroup` wrapper) and use `transferArrayItem` in the drop handler. Persist the new order to the API in the same handler.

---

<a name="virtual"></a>
# 6. CDK Virtual Scroll

Rendering 10,000 rows creates 10,000 DOM nodes — slow to create, slow to update. **Virtual scrolling** renders only the rows currently visible (plus a small buffer) and swaps them as you scroll.

```html
<cdk-virtual-scroll-viewport itemSize="48" style="height: 600px">
  <div *cdkVirtualFor="let emp of employees(); trackBy: trackById" class="row">
    {{ emp.name }}
  </div>
</cdk-virtual-scroll-viewport>
```

- The viewport needs a **fixed height**, and `itemSize` (row height in px) must be accurate for the fixed-size strategy.
- Variable-height rows need the experimental autosize strategy or a different library.
- Combine with infinite loading: listen to `scrolledIndexChange` and fetch the next page near the end.
- Trade-offs: Ctrl+F browser search can't find off-screen rows, and screen readers see only rendered rows — add `aria-rowcount`/`aria-rowindex` or offer pagination for accessibility. More in [Part 18 §6](18-performance.md).

---

<a name="other"></a>
# 7. Other CDK tools worth knowing

| Tool | Package | What it does |
|---|---|---|
| **BreakpointObserver** | `cdk/layout` | `observe(Breakpoints.Handset)` → an Observable of "is this a phone?" for layout logic in TS |
| **FocusTrap**, **FocusMonitor**, **LiveAnnouncer**, **ListKeyManager** | `cdk/a11y` | keep focus inside a modal, know if focus came from keyboard or mouse, announce messages to screen readers, arrow-key navigation in lists — see [Part 30](30-accessibility-and-i18n.md) |
| **Portal** | `cdk/portal` | render a component/template somewhere else in the DOM |
| **Clipboard** | `cdk/clipboard` | `cdkCopyToClipboard="text"` |
| **Stepper**, **Table**, **Tree**, **Accordion**, **Listbox**, **Menu** | various | unstyled, accessible behaviour for those widgets |
| **Testing harnesses** | `cdk/testing` | stable test APIs for components — [Part 20 §6.3](20-testing.md) |

Also new: **Angular Aria** (`@angular/aria`, developer preview in v21) — headless, accessible components (combobox, listbox, tabs, menu, accordion, tree, grid) that you style yourself; an alternative to building those on raw CDK pieces.

---

<a name="interview"></a>
# 8. Interview Q&A

### Q: What's the difference between Angular Material and the CDK?
Material is a set of ready-styled components following Material Design. The CDK is the unstyled behaviour underneath — overlays, positioning, focus trapping, drag and drop, virtual scrolling, keyboard navigation. If the app has its own design system, I build components on the CDK so I get the hard behaviour for free and style them myself.

### Q: How would you build a custom dropdown or modal?
On the CDK Overlay: it renders above the page, positions the panel next to the trigger and flips it when there's no room, gives a backdrop for outside clicks, and keyboard events for Escape. For a modal I'd use `@angular/cdk/dialog`, which adds focus trapping, focus restoration and ARIA roles. Building those by hand is where most custom dropdowns go wrong.

### Q: How do you render a list of 10,000 items efficiently?
Virtual scrolling with `cdk-virtual-scroll-viewport` and `*cdkVirtualFor`, so only visible rows are in the DOM — with a fixed viewport height and accurate item size. Or server-side pagination. Plus `track` by id, OnPush, and no method calls in the row template.

### Q: How do you customise a Material component's look?
Through the theming API — the `mat.theme` mixin, component override mixins and the `--mat-sys-*` CSS variables — not by overriding internal `.mat-mdc-*` classes with `::ng-deep`, which break on upgrades.

---

<a name="summary"></a>
# 9. The 60-second summary

> *"Angular Material is ready-made styled components; the CDK is the unstyled behaviour they're built on. With your own design system, build on the CDK: Overlay handles rendering above the page, positioning and flipping, backdrops and Escape; the Dialog adds focus trapping and ARIA; drag and drop gives sortable lists and Kanban boards with `moveItemInArray`; virtual scroll renders only visible rows of huge lists; and `cdk/a11y` has focus traps, live announcers and keyboard managers. Material 3 is themed with the `mat.theme` mixin and CSS variables — not with `::ng-deep` on internal classes. And Material components come with test harnesses so tests don't depend on their markup."*

---

## Connects to

- **[Part 18 — Performance](18-performance.md):** virtual scrolling as a runtime fix.
- **[Part 20 — Testing](20-testing.md):** component harnesses.
- **[Part 30 — Accessibility](30-accessibility-and-i18n.md):** the `cdk/a11y` tools in context.
- **[Part 15 — Forms](15-forms.md):** `mat-form-field` around reactive form controls; custom controls via `ControlValueAccessor`.

*— End of Part 29 —*
