# React Study Notes — Part 18

## Testing React (React Testing Library, user-event, Vitest/Jest, MSW, Testing Hooks, Async UI, Playwright)

> **Why this part exists:** "How do you test a component?" is asked in almost every 3–4-year interview, and the answer that impresses is about **testing behaviour like a user**, not implementation details. The general principles (pyramid, mocking, flaky tests) are in [nodejs Part 10](../nodejs/10-testing.md); this is the React-specific part.

---

## Table of Contents

1. [The philosophy: test what the user sees](#philosophy)
2. [Setup: Vitest (or Jest) + React Testing Library](#setup)
3. [⭐ Queries — how to find elements](#queries)
4. [⭐ Interacting with `user-event`](#user-event)
5. [⭐ Async UI: `findBy` and `waitFor`](#async)
6. [⭐ Mocking the network with MSW](#msw)
7. [Providers: router, query client, context](#providers)
8. [Testing custom hooks](#hooks)
9. [What not to do](#avoid)
10. [End-to-end with Playwright](#e2e)
11. [Interview Q&A](#interview)
12. [Cheat Sheet](#cheatsheet)

---

<a name="philosophy"></a>
# 1. The philosophy: test what the user sees

> *"The more your tests resemble the way your software is used, the more confidence they can give you."* — the guiding principle of Testing Library.

| ❌ Testing implementation | ✅ Testing behaviour |
|---|---|
| "state `count` is 3" | "the text **Count: 3** is on screen" |
| "`handleClick` was called" | "after clicking **Save**, the message **Saved** appears" |
| "the component has class `.btn-primary`" | "there is a button named **Save** and it's disabled while saving" |
| shallow-render and inspect children | render the real tree and use it |

Implementation tests break when you **refactor** (rename state, split a component) even though nothing is broken for users. Behaviour tests break only when **behaviour** breaks.

> **Analogy 🚗 — test-driving a car vs inspecting the engine wiring.** Users don't care which wire goes where; they care that the car starts and brakes.

The old tool, **Enzyme**, encouraged implementation testing (shallow rendering, reading state) and doesn't support modern React — if you see it, it's a migration item. `react-test-renderer/shallow` was removed in React 19.

---

<a name="setup"></a>
# 2. Setup: Vitest (or Jest) + React Testing Library

```bash
npm i -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

```js
// vitest.config.js (or inside vite.config.js)
export default { test: { environment: 'jsdom', setupFiles: './src/setupTests.js', globals: true } };
// src/setupTests.js
import '@testing-library/jest-dom/vitest';     // adds toBeInTheDocument, toBeDisabled, toHaveValue …
```

- **Vitest** is the natural choice for Vite projects (same config, very fast). **Jest** is still common in older and Next.js projects. The Testing Library code is identical in both.
- **jsdom** simulates the browser DOM in Node.

A first test:

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Counter } from './Counter';

test('increments when the button is clicked', async () => {
  const user = userEvent.setup();
  render(<Counter />);

  await user.click(screen.getByRole('button', { name: /increment/i }));

  expect(screen.getByText('Count: 1')).toBeInTheDocument();
});
```

---

<a name="queries"></a>
# 3. ⭐ Queries — how to find elements

**Which query** — in priority order (most like a real user first):

1. **`getByRole`** — `getByRole('button', { name: 'Save' })`, `getByRole('textbox', { name: 'Email' })`, `getByRole('heading', { level: 1 })`, `getByRole('checkbox')`. Uses the accessibility tree — what screen readers see.
2. **`getByLabelText('Email')`** — form fields by their label.
3. `getByPlaceholderText`, **`getByText`**, `getByDisplayValue`.
4. `getByAltText`, `getByTitle`.
5. **`getByTestId`** — last resort (`data-testid`), when nothing user-visible identifies the element.

A nice side effect: **if `getByRole` can't find your button, a screen reader probably can't either** — tests push you towards accessible markup.

**Which variant:**

| Variant | No match | Many matches | Async? | Use for |
|---|---|---|---|---|
| `getBy…` | **throws** | throws | no | something that should be there **now** |
| `queryBy…` | returns `null` | throws | no | asserting something is **not** there: `expect(screen.queryByText('Error')).not.toBeInTheDocument()` |
| `findBy…` | rejects after timeout | throws | **yes (await)** | something that **will appear** (after a fetch) |
| `getAllBy…` / `queryAllBy…` / `findAllBy…` | — | returns an array | | lists |

> 🧠 **Remember:** **get = there now · query = maybe not there · find = will be there soon.**

Use `screen.*` (not destructuring from `render`) — and `screen.debug()` prints the current DOM when a test fails mysteriously. `within(row).getByRole('button')` searches inside one element.

---

<a name="user-event"></a>
# 4. ⭐ Interacting with `user-event`

`user-event` simulates **real** interactions (focus, key presses, pointer events, in the right order). Prefer it over the lower-level `fireEvent`.

```jsx
const user = userEvent.setup();                         // once per test, before render

await user.type(screen.getByLabelText('Email'), 'asha@example.com');
await user.clear(screen.getByLabelText('Email'));
await user.click(screen.getByRole('button', { name: 'Submit' }));
await user.selectOptions(screen.getByLabelText('Role'), 'admin');
await user.keyboard('{Enter}');
await user.tab();                                       // move focus — test keyboard accessibility
await user.upload(screen.getByLabelText('Avatar'), new File(['x'], 'me.png', { type: 'image/png' }));
```

All `user-event` calls are **async** (v14) — always `await` them.

A form test:

```jsx
test('shows an error for an invalid email', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(<SignupForm onSubmit={onSubmit} />);

  await user.type(screen.getByLabelText(/email/i), 'not-an-email');
  await user.click(screen.getByRole('button', { name: /sign up/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email');
  expect(onSubmit).not.toHaveBeenCalled();
});
```

---

<a name="async"></a>
# 5. ⭐ Async UI: `findBy` and `waitFor`

```jsx
render(<UserProfile userId="1" />);

expect(screen.getByText(/loading/i)).toBeInTheDocument();          // the spinner right away
expect(await screen.findByRole('heading', { name: 'Asha' })).toBeInTheDocument();   // waits for the data
expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
```

- **`findBy…`** = "wait until it appears" (default timeout 1s). Use it for anything that appears after a fetch or timer.
- **`waitFor(() => expect(...))`** = retry an assertion until it passes — for things that aren't "an element appears" (a mock was called, an element disappears: `waitForElementToBeRemoved`).
- ⚠️ Don't put side effects (clicks) inside `waitFor` — it may run them many times.
- **"not wrapped in act(...)" warning** — a state update happened after the test thought it was done. Almost always fixed by **awaiting** the right thing (`findBy`, `await user.click`), not by adding `act()` manually.
- Timers: `vi.useFakeTimers()` + `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` for debounce tests.

---

<a name="msw"></a>
# 6. ⭐ Mocking the network with MSW

Mocking `fetch`/axios directly ties tests to *how* you fetch. **Mock Service Worker (MSW)** intercepts requests at the network level, so your real fetching code (fetch, axios, TanStack Query) runs unchanged.

```js
// src/mocks/handlers.js — MSW v2
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/users/:id', ({ params }) => HttpResponse.json({ id: params.id, name: 'Asha' })),
];
```

```js
// setupTests.js
import { setupServer } from 'msw/node';
import { handlers } from './mocks/handlers';
export const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));   // catch requests you forgot to mock
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

```jsx
test('shows an error when the API fails', async () => {
  server.use(http.get('/api/users/:id', () => new HttpResponse(null, { status: 500 })));   // override for this test
  render(<UserProfile userId="1" />, { wrapper: AllProviders });
  expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
});
```

Bonus: the **same handlers** can run in the browser during development (a mock API before the backend exists) and in Storybook.

---

<a name="providers"></a>
# 7. Providers: router, query client, context

Components often need providers. Make a reusable wrapper:

```jsx
function renderWithProviders(ui, { route = '/' } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },      // ⚠️ no retries → error tests don't wait 3× backoff
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>           {/* router in memory, start at any URL */}
        <ThemeProvider>{ui}</ThemeProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
```

- A **new `QueryClient` per test**, so cached data doesn't leak between tests.
- `MemoryRouter` (or `createMemoryRouter` for data routers) to test routes and params.
- For Redux: create a fresh store per test with `configureStore` and wrap in `<Provider>`.

---

<a name="hooks"></a>
# 8. Testing custom hooks

Usually, test a hook **through a component that uses it**. For reusable hooks (a library, `useDebounce`), use `renderHook`:

```jsx
import { renderHook, act } from '@testing-library/react';

test('useCounter increments', () => {
  const { result } = renderHook(() => useCounter(5));
  act(() => result.current.increment());               // state changes outside a component event → act()
  expect(result.current.count).toBe(6);
});

// with providers and changing props
const { result, rerender } = renderHook(({ id }) => useUser(id), {
  initialProps: { id: '1' }, wrapper: AllProviders,
});
rerender({ id: '2' });
```

(`@testing-library/react-hooks` was a separate package for this — now built into `@testing-library/react`.)

---

<a name="avoid"></a>
# 9. What not to do

- ❌ **Testing implementation details** — internal state, which child components rendered, CSS class names.
- ❌ **Huge snapshot tests** — `expect(tree).toMatchSnapshot()` on a whole page fails on every tiny change and people just press "update". Small, focused inline snapshots are OK.
- ❌ **Mocking child components** by default — it hides integration bugs. Mock the network (MSW) and slow/external things instead.
- ❌ **`getByTestId` everywhere** — prefer roles and labels.
- ❌ **Forgetting `await`** on `user-event` and `findBy` — tests pass or fail randomly.
- ❌ **Sharing state between tests** (one `QueryClient`, one store, leftover MSW overrides) → flaky tests.

---

<a name="e2e"></a>
# 10. End-to-end with Playwright

For a few critical flows (sign up, checkout), run the real app in a real browser:

```ts
test('user can add an item to the cart', async ({ page }) => {
  await page.goto('/products/42');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByRole('status')).toHaveText('Added to cart');
  await page.getByRole('link', { name: 'Cart (1)' }).click();
  await expect(page).toHaveURL('/cart');
});
```

Same role-based queries as Testing Library. Cypress is the other common choice. **Storybook** + its test runner / visual regression tools (Chromatic) cover component states visually. Keep E2E tests few — they're slow and the most likely to be flaky.

---

<a name="interview"></a>
# 11. Interview Q&A

### Q: "How do you test a React component?"
> *"With React Testing Library and Vitest or Jest: render it, find elements the way a user would — by role and label — interact with user-event, and assert on what's on the screen. I don't test internal state or implementation details, so refactors don't break tests. Network calls are mocked at the network level with MSW, and providers come from a shared render helper."*

### Q: "`getBy` vs `queryBy` vs `findBy`?"
> *"`getBy` expects the element to be there now and throws if not. `queryBy` returns null instead of throwing, so it's for asserting something is absent. `findBy` returns a promise and waits for the element to appear — for anything after a fetch or timer."*

### Q: "Why prefer `getByRole`?"
> *"It finds elements the way users and assistive technology do — a button by its accessible name, an input by its label — so tests survive markup changes, and if `getByRole` can't find something, a screen reader probably can't either. `getByTestId` is the last resort."*

### Q: "How do you test a component that fetches data?"
> *"Mock the API with MSW handlers — the real fetch code runs — render inside a fresh QueryClient with retries off, assert the loading state, then `await findBy…` the loaded content. For errors, override the handler in that test to return a 500 and assert the error message."*

### Q: "What does the 'not wrapped in act' warning mean?"
> *"A state update happened that the test didn't wait for — usually an async update after a fetch or timer finished after the assertions. The fix is to await the right thing, like `findBy` or `await user.click`, rather than sprinkling `act()` around."*

### Q: "How do you test a custom hook?"
> *"Ideally through a component that uses it. For reusable hooks, `renderHook` from Testing Library, wrapping updates in `act`, with a wrapper for any providers and `rerender` to change its arguments."*

---

<a name="cheatsheet"></a>
# 12. Cheat Sheet

```
TEST BEHAVIOUR, not implementation — "test-drive the car, don't inspect the wiring"
Vitest/Jest + jsdom + @testing-library/react + user-event + jest-dom · Enzyme/shallow = legacy

QUERIES (priority): getByRole(role, { name }) > getByLabelText > getByText > … > getByTestId
get = there now (throws) · query = maybe absent (null) · find = will appear (await)
screen.* · within(el) · screen.debug()

user = userEvent.setup() · await user.click / type / clear / selectOptions / keyboard / tab / upload
ASYNC: await findBy… · waitFor(assertion) (no side effects inside) · act warning → await properly
fake timers: vi.useFakeTimers + userEvent.setup({ advanceTimers })

MSW v2: http.get(path, () => HttpResponse.json(...)) · setupServer · server.use() per test
  onUnhandledRequest: 'error' · same handlers in browser/Storybook
PROVIDERS: renderWithProviders — NEW QueryClient per test (retry: false) · MemoryRouter · fresh store
HOOKS: renderHook(() => useX(), { wrapper, initialProps }) · act() · rerender
AVOID: impl details · giant snapshots · mocking children · testid everywhere · missing await · shared state
E2E: Playwright (getByRole too) / Cypress — few, critical flows
```

---

## Connects to

- **[nodejs Part 10 — Testing](../nodejs/10-testing.md):** the general principles (pyramid, mocking, flaky tests, CI).
- **[Part 16 — Forms](16-forms.md):** what to assert in form tests.
- **[Part 17 — Data fetching](17-data-fetching-tanstack-query-and-redux-toolkit.md):** QueryClient per test.
- **[Part 21 — Accessibility](21-styling-and-accessibility.md):** why role queries and accessible markup go together.

## Suggested next topics

1. **TypeScript with React** — typed props make many tests unnecessary.
2. **Accessibility** — the markup `getByRole` relies on.
