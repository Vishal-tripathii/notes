# Angular Study Notes — Part 20

## Testing

> **Roadmap:** [Part 20](00-ROADMAP.md) · **Priority:** ⭐⭐⭐☆☆ — enough to answer confidently, not a full testing course.
>
> **Continues:** [Part 08 — DI](08-dependency-injection-and-services.md) · [Part 15 — Forms](15-forms.md).

---

## Table of Contents

1. [What to test](#what)
2. [Testing a service](#service) ⭐
3. [Testing HTTP](#http) ⭐
4. [Testing a component](#component)
5. [Mocking dependencies](#mocking) ⭐
6. [Async testing](#async)
   - [6.1 Test runners — Karma, Vitest, Jest](#runners) ⭐
   - [6.2 Testing signal inputs, OnPush and zoneless](#signals-testing) ⭐
   - [6.3 Component harnesses](#harness)
   - [6.4 End-to-end — Playwright / Cypress](#e2e)
7. [Interview Q&A](#interview)
8. [The 60-second summary](#summary)

---

<a name="what"></a>
# 1. What to test

```
✅  business logic in services
✅  a component's PUBLIC behaviour — inputs in, outputs out, what renders
✅  form validation rules
✅  guards, pipes, custom validators — pure functions, trivial to test

❌  private methods
❌  that Angular's own bindings work
❌  implementation details that change when you refactor
```

The test that survives refactoring asserts **what the user sees**, not how the class achieves it.

---

<a name="service"></a>
# 2. ⭐ Testing a service

A service with no Angular dependencies needs no Angular test setup at all:

```ts
describe('CartService', () => {
  it('adds an item and updates the total', () => {
    const service = new CartService();

    service.add({ id: 1, name: 'Book', price: 10, qty: 2 });

    expect(service.count()).toBe(1);
    expect(service.total()).toBe(20);
  });
});
```

This is the payoff for `providedIn: 'root'` plus constructor-light classes ([Part 07](07-lifecycle-hooks.md)): plain `new`, no `TestBed`, no DOM, milliseconds to run.

---

<a name="http"></a>
# 3. ⭐ Testing HTTP

`HttpTestingController` lets you assert on requests and hand back fake responses — no real network:

```ts
describe('EmployeeService', () => {
  let service: EmployeeService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        EmployeeService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service  = TestBed.inject(EmployeeService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());     // fails if any request went unhandled

  it('fetches employees', () => {
    const fake = [{ id: 1, name: 'Asha' }];

    service.getAll().subscribe(result => {
      expect(result).toEqual(fake);       // ← runs when we flush below
    });

    const req = httpMock.expectOne('/api/employees');
    expect(req.request.method).toBe('GET');
    req.flush(fake);                      // deliver the fake response
  });

  it('surfaces a 500', () => {
    let error: HttpErrorResponse | undefined;

    service.getAll().subscribe({ error: e => error = e });

    httpMock.expectOne('/api/employees')
      .flush('boom', { status: 500, statusText: 'Server Error' });

    expect(error?.status).toBe(500);
  });
});
```

```
expectOne(url)   assert exactly one matching request was made
req.flush(body)  deliver a response — this is what triggers subscribe
httpMock.verify()  assert nothing was left outstanding
```

---

<a name="component"></a>
# 4. Testing a component

```ts
describe('EmployeeCardComponent', () => {
  let fixture: ComponentFixture<EmployeeCardComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [EmployeeCardComponent] });
    fixture = TestBed.createComponent(EmployeeCardComponent);
  });

  it('renders the employee name', () => {
    fixture.componentRef.setInput('employee', { id: 1, name: 'Asha' });
    fixture.detectChanges();                       // ← required: run change detection

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h3')?.textContent).toContain('Asha');
  });

  it('emits delete with the id', () => {
    fixture.componentRef.setInput('employee', { id: 7, name: 'Ravi' });
    fixture.detectChanges();

    let emitted: number | undefined;
    fixture.componentInstance.delete.subscribe(id => emitted = id);

    fixture.nativeElement.querySelector('button').click();

    expect(emitted).toBe(7);
  });
});
```

⚠️ `fixture.detectChanges()` is the step everyone forgets. Without it the template never renders and every DOM assertion fails.

---

<a name="mocking"></a>
# 5. ⭐ Mocking dependencies

This is the concrete payoff of dependency injection ([Part 08](08-dependency-injection-and-services.md)) — swap the real service for a fake and the component never knows:

```ts
const fakeService = {
  getAll: () => of([{ id: 1, name: 'Asha' }]),
};

TestBed.configureTestingModule({
  imports: [EmployeeListComponent],
  providers: [
    { provide: EmployeeService, useValue: fakeService },   // ← the swap
  ],
});
```

Or a spy, when you need to assert it was called:

```ts
const spy = jasmine.createSpyObj('EmployeeService', ['getAll', 'delete']);
spy.getAll.and.returnValue(of([]));

// …later
expect(spy.delete).toHaveBeenCalledWith(7);
```

---

<a name="async"></a>
# 6. Async testing

```ts
// fakeAsync — control time synchronously. Best for timers and debounce.
it('debounces the search', fakeAsync(() => {
  component.searchControl.setValue('ang');
  tick(300);                            // fast-forward 300ms
  expect(service.search).toHaveBeenCalledOnce();
  flush();                              // drain any remaining timers
}));

// waitForAsync — for real promises you can't fast-forward
it('loads data', waitForAsync(() => {
  fixture.whenStable().then(() => {
    expect(component.employees().length).toBe(1);
  });
}));
```

```
fakeAsync + tick()   timers, debounce, intervals — synchronous and fast
waitForAsync         real async you can't control
```

Observables from `of()` are synchronous, so most component tests need neither.

---

<a name="runners"></a>
# 6.1 ⭐ Test runners — Karma, Vitest, Jest

| Runner | Where tests run | Status |
|---|---|---|
| **Karma + Jasmine** | a real browser (Chrome) | the old CLI default; Karma is no longer actively developed upstream |
| **Vitest** | Node with a simulated DOM (jsdom/happy-dom), or a real browser via Playwright | **default for new projects since Angular 21** (`ng test` uses the `@angular/build:unit-test` builder) |
| **Jest** | Node with jsdom | very common in existing enterprise apps, via community builders (e.g. `jest-preset-angular`) |

The Angular testing APIs — `TestBed`, `ComponentFixture`, `HttpTestingController` — are the **same in all three**. The differences are speed, the mocking API (`jasmine.createSpyObj` vs `vi.fn()` / `jest.fn()`), and whether you get a real browser.

```ts
// Jasmine
const api = jasmine.createSpyObj<EmployeeApi>('EmployeeApi', ['getAll']);
api.getAll.and.returnValue(of([]));

// Vitest (Jest is the same with jest.fn)
const api = { getAll: vi.fn().mockReturnValue(of([])) };
```

`fakeAsync`/`tick` rely on Zone.js. In a **zoneless** project, use the runner's fake timers (`vi.useFakeTimers()` + `vi.advanceTimersByTime()`) and `await fixture.whenStable()` instead.

---

<a name="signals-testing"></a>
# 6.2 ⭐ Testing signal inputs, OnPush and zoneless components

**Set signal inputs with `setInput`** — you can't assign to `input()` signals directly:

```ts
const fixture = TestBed.createComponent(EmployeeCardComponent);
fixture.componentRef.setInput('employee', { id: 1, name: 'Asha', role: 'Dev' });
fixture.detectChanges();                        // or: await fixture.whenStable()
expect(fixture.nativeElement.textContent).toContain('Asha (Dev)');
```

`setInput` also works for OnPush components — it marks the component for checking, exactly like a parent binding would. (Setting `component.someField = x` on an OnPush component and calling `detectChanges()` often does **nothing**, which is the classic "my OnPush test doesn't update" confusion.)

**Prefer `await fixture.whenStable()`** over manual `detectChanges()` in modern tests — it waits until Angular has finished rendering, which is also how zoneless apps update:

```ts
TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
// ...
component.count.set(5);
await fixture.whenStable();
expect(el.textContent).toContain('5');
```

**Testing a plain signal or `computed`** needs nothing special — they're synchronous:

```ts
const cart = TestBed.inject(CartService);
cart.add(book);
expect(cart.total()).toBe(10);
```

**Testing an `effect`:** effects are scheduled, so flush them with `TestBed.tick()` (v20+; it was `TestBed.flushEffects()` in v17–19) before asserting.

**Testing `httpResource` / HTTP:** same `HttpTestingController` as §3 — the resource's request is expected and flushed like any other, then `await fixture.whenStable()`.

---

<a name="harness"></a>
# 6.3 Component harnesses (Angular CDK)

Querying a Material component's DOM (`.mat-mdc-select-trigger`…) breaks every time Material changes its markup. **Harnesses** give you a stable, high-level API instead:

```ts
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatSelectHarness } from '@angular/material/select/testing';

const loader = TestbedHarnessEnvironment.loader(fixture);
const select = await loader.getHarness(MatSelectHarness.with({ selector: '#role' }));
await select.open();
await select.clickOptions({ text: 'Admin' });
expect(await select.getValueText()).toBe('Admin');
```

- Harnesses **wait for Angular automatically** — no `detectChanges()` sprinkling.
- The same harness works in unit tests and in E2E-style environments.
- You can write your own (`ComponentHarness`) for your design-system components so their tests survive markup changes.

---

<a name="e2e"></a>
# 6.4 End-to-end tests — Playwright / Cypress

Unit and component tests check pieces. **E2E tests** drive the real app in a real browser, the way a user does — login, add to cart, check out.

| | Playwright | Cypress |
|---|---|---|
| Browsers | Chromium, Firefox, WebKit (Safari engine) | Chromium-family, Firefox; WebKit experimental |
| Style | async/await, auto-waiting | chained commands, great interactive runner |
| Parallel / multi-tab | built in | paid dashboard / workarounds |

(Protractor, the old Angular E2E tool, is **deprecated and gone** — if a codebase still has it, that's a migration item.)

```ts
// Playwright
test('user can log in', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('asha@example.com');
  await page.getByLabel('Password').fill('secret');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText('Welcome, Asha')).toBeVisible();
});
```

Select elements by **role, label or text** (what users see) or a dedicated `data-testid` — never by CSS classes that designers change. Keep E2E tests **few and focused on critical flows**; they're slow and the most likely to be flaky. The general testing principles (pyramid, mocking, flaky tests) are the same as in [nodejs Part 10](../nodejs/10-testing.md).

---

<a name="interview"></a>
# 7. Interview Q&A

### Q: How do you test a component that depends on a service?

I provide a fake in the `TestBed` — `{ provide: RealService, useValue: fake }` — so the component gets the stub through normal dependency injection and never knows the difference. That's the practical reason DI matters: swapping implementations without touching the component.

### Q: How do you test an HTTP call?

With `HttpTestingController`. I subscribe to the service method, assert the expected request was made with `expectOne`, then call `flush` with a fake response to trigger the subscription. `httpMock.verify()` in `afterEach` fails the test if any request went unhandled.

### Q: `fakeAsync` vs `waitForAsync`?

`fakeAsync` gives me a virtual clock — `tick(300)` fast-forwards timers synchronously, which is how I test debouncing without waiting 300 real milliseconds. `waitForAsync` is for genuine asynchrony I can't control, where I wait on `fixture.whenStable()`.

### Q: Why does my DOM assertion fail?

Almost always a missing `fixture.detectChanges()`. Creating the component doesn't render it — change detection has to run before the template exists.

### Q: How do you set a signal input in a test?

`fixture.componentRef.setInput('name', value)` — signal inputs are read-only from outside, and `setInput` also marks OnPush components for checking, just like a real parent binding. Then `await fixture.whenStable()` (or `detectChanges()`) and assert on the DOM.

### Q: Karma, Jest or Vitest?

All three run the same `TestBed` tests. Karma uses a real browser and was the old default; Vitest is the default for new projects since Angular 21 and runs fast in Node with a simulated DOM (or a real browser via Playwright); Jest is common in existing apps. The practical differences are speed and the mocking API.

### Q: What are component harnesses for?

A stable testing API for components — especially Angular Material — so tests call `select.clickOptions({ text: 'Admin' })` instead of querying internal CSS classes that change between versions. Harnesses also wait for Angular to stabilise automatically.

### Q: Unit, component and E2E tests — what goes where?

Business logic and pure functions in fast unit tests; each component's behaviour with `TestBed` and mocked services; a few critical user journeys with Playwright or Cypress against the real app. Most tests at the bottom, few at the top.

### Q: What do you not test?

Private methods, Angular's own behaviour, and implementation details. I test public behaviour — inputs in, outputs out, what renders — because those survive a refactor and the internals don't.

---

<a name="summary"></a>
# 8. The 60-second summary

> *"I test business logic in services, a component's public behaviour, and pure things like validators, pipes and guards — not private methods or Angular itself. A service with no Angular dependencies can be tested with a plain `new`, no `TestBed` at all, which is the payoff for keeping constructors light. For HTTP I use `HttpTestingController`: subscribe, assert the request with `expectOne`, then `flush` a fake response, with `verify()` afterwards to catch unhandled requests. Component tests use `TestBed.createComponent` and a `ComponentFixture`, and the step people forget is `fixture.detectChanges()`, without which nothing renders. Dependencies get swapped through providers with `useValue` or a spy, which is dependency injection paying off directly. And for timing, `fakeAsync` with `tick` gives a virtual clock for debounce and intervals, while `waitForAsync` handles real asynchrony."*

---

## Connects to

- **[Part 08 — DI](08-dependency-injection-and-services.md):** providers, and why mocking is trivial.
- **[Part 15 — Forms](15-forms.md):** reactive forms as testable plain objects.
- **[Part 13 — HttpClient](13-httpclient-and-interceptors.md):** what `HttpTestingController` intercepts.

*— End of Part 20 —*
