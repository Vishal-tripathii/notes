# Node.js Study Notes — Part 10

## Testing — Unit, Integration, Mocks, APIs, Databases, and Tests You Can Trust

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.
>
> **Why this matters:** at 3–4 years, interviewers expect you to have *written* tests, not just to know the words. The questions are practical: "how do you test a route that talks to MongoDB?", "what do you mock?", "why is this test flaky?" This part answers them with working examples.
>
> **Continues from:** [JD file §1](JD-NodeFullStack-3YR-QNA.md) (SOLID and dependency injection — the thing that makes code testable) and [Q&A bank §27](QNA-INTERVIEW-BANK.md).

---

## Table of Contents

1. [Why test, and what kinds of tests exist](#why)
2. [Choosing a test runner](#runner)
3. [Anatomy of a good test](#anatomy)
4. [⭐ Unit tests — and when to mock](#unit)
5. [⭐ Testing Express routes with supertest](#supertest)
6. [⭐ Testing code that uses a database](#database)
7. [Testing async code, errors and time](#async)
8. [⭐ Flaky tests — causes and fixes](#flaky)
9. [Coverage — what the number means](#coverage)
10. [Tests in CI](#ci)
11. [Interview Questions & Answers](#interview)
12. [Cheat Sheet](#cheatsheet)

---

<a name="why"></a>
# 1. Why test, and what kinds of tests exist

Tests let you **change code without fear**. Without them, every refactor or library upgrade is a gamble that you find out about in production.

| Kind | Tests | Speed | Catches |
|---|---|---|---|
| **Unit** | one function or class, dependencies replaced with fakes | milliseconds | logic mistakes — wrong calculation, missed edge case |
| **Integration** | several real parts together — route + service + a real test database | ~10–500 ms each | wiring mistakes — wrong query, missing middleware, bad DB index assumption |
| **End-to-end (E2E)** | the whole running system, like a user or client would | seconds | "the whole flow actually works" |

> **Analogy 🚗 — building a car.** Unit test: does the brake pad work on a test bench? Integration test: when you press the pedal, do the brakes actually stop the wheel? E2E test: drive the car around the block.

**The test pyramid:** many unit tests, a good number of integration tests, a few E2E tests. For a typical Node **API**, integration tests through the HTTP layer often give the most confidence per test — many teams lean on them more heavily (sometimes called the "testing trophy" shape). Say both: "lots of fast unit tests for logic, integration tests for every endpoint, a handful of E2E for critical flows."

---

<a name="runner"></a>
# 2. Choosing a test runner

| Runner | Notes |
|---|---|
| **Jest** | the most common in existing codebases; built-in mocks, fake timers, snapshots. ESM/TypeScript need some setup |
| **Vitest** | Jest-compatible API, fast, native ESM and TypeScript; popular in new projects |
| **`node:test`** | built into Node (stable since 20) — no dependency at all; `node --test`; mocks and fake timers included |
| Mocha + Chai | older but still around |

The concepts are the same in all of them. Examples below use Jest/Vitest syntax (`describe`, `it`, `expect`); `node:test` is shown in [Part 15 §3](15-modern-node-features.md).

---

<a name="anatomy"></a>
# 3. Anatomy of a good test

**Arrange → Act → Assert** (set up, do the thing, check the result):

```js
// pricing.js
export function orderTotal(items, { coupon } = {}) {
  const sum = items.reduce((t, i) => t + i.price * i.qty, 0);
  return coupon === 'SAVE10' ? Math.round(sum * 0.9) : sum;
}

// pricing.test.js
import { describe, it, expect } from 'vitest';
import { orderTotal } from './pricing.js';

describe('orderTotal', () => {
  it('adds price × quantity for every item', () => {
    const items = [{ price: 100, qty: 2 }, { price: 50, qty: 1 }];   // Arrange
    const total = orderTotal(items);                                  // Act
    expect(total).toBe(250);                                          // Assert
  });

  it('applies the SAVE10 coupon', () => {
    expect(orderTotal([{ price: 100, qty: 1 }], { coupon: 'SAVE10' })).toBe(90);
  });

  it('returns 0 for an empty cart', () => {
    expect(orderTotal([])).toBe(0);
  });
});
```

What makes a test good:
- **One behaviour per test**, with a name that reads as a sentence: "applies the SAVE10 coupon."
- **Test behaviour, not internals.** Check the output and the effects, not which private helper was called. Then refactoring doesn't break tests.
- **Independent:** each test sets up its own data and can run alone, in any order.
- **Edge cases:** empty, zero, null, very large, duplicate, the boundary (exactly 100 when the rule is "≥ 100").
- **Deterministic:** same result every run — no real clock, no random, no network (§8).

---

<a name="unit"></a>
# 4. ⭐ Unit tests — and when to mock

A **mock** (or stub/fake) is a stand-in for a real dependency, so you can test one piece alone.

**Testable code receives its dependencies** instead of creating them inside (dependency injection — [JD file §1](JD-NodeFullStack-3YR-QNA.md)):

```js
// ❌ hard to test — creates its own dependencies
export async function registerUser(data) {
  const exists = await User.findOne({ email: data.email });   // real DB, always
  if (exists) throw new ConflictError('Email taken');
  const user = await User.create(data);
  await sendgrid.send(welcomeEmail(user));                    // real email, always
  return user;
}

// ✅ dependencies passed in
export function makeUserService({ userRepo, mailer }) {
  return {
    async register(data) {
      if (await userRepo.findByEmail(data.email)) throw new ConflictError('Email taken');
      const user = await userRepo.create(data);
      await mailer.sendWelcome(user);
      return user;
    },
  };
}
```

```js
import { vi, it, expect } from 'vitest';

it('rejects an email that is already registered', async () => {
  const userRepo = { findByEmail: vi.fn().mockResolvedValue({ id: 1 }), create: vi.fn() };
  const mailer = { sendWelcome: vi.fn() };
  const service = makeUserService({ userRepo, mailer });

  await expect(service.register({ email: 'a@x.com' })).rejects.toThrow('Email taken');
  expect(userRepo.create).not.toHaveBeenCalled();      // nothing was created
  expect(mailer.sendWelcome).not.toHaveBeenCalled();   // no email went out
});
```

**What to mock — the rule of thumb:**

| Mock it | Don't mock it |
|---|---|
| things **outside your control**: email/SMS, payment APIs, third-party HTTP | the code you're testing |
| slow or non-deterministic things: time, randomness | simple pure helpers it uses |
| (in unit tests) the database/repository | (in integration tests) your own database — use a real test one |

⚠️ **Too much mocking** gives tests that pass while the real thing is broken — you end up testing your mocks. If a unit test needs ten mocks, the code probably does too much, or it deserves an integration test instead.

For outgoing HTTP calls, intercept at the network level rather than mocking your own client: **`nock`** or **MSW** (Mock Service Worker) — your real HTTP code runs, only the remote server is fake.

---

<a name="supertest"></a>
# 5. ⭐ Testing Express routes with supertest

**Split "make the app" from "start the server"** so tests can use the app without opening a real port:

```js
// app.js — builds and exports the app
export function createApp(deps) {
  const app = express();
  app.use(express.json());
  app.use('/users', usersRouter(deps));
  app.use(errorHandler);
  return app;
}

// server.js — the only file that listens
createApp(realDeps).listen(process.env.PORT);
```

```js
// users.test.js
import request from 'supertest';
import { createApp } from './app.js';

it('POST /users creates a user', async () => {
  const app = createApp(testDeps);

  const res = await request(app)
    .post('/users')
    .send({ email: 'a@x.com', name: 'Asha' })
    .expect(201);

  expect(res.body).toMatchObject({ email: 'a@x.com' });
  expect(res.body).not.toHaveProperty('password');      // check what must NOT leak
});

it('POST /users rejects a bad email with 400', async () => {
  await request(createApp(testDeps)).post('/users').send({ email: 'nope' }).expect(400);
});

it('GET /users/me needs a token', async () => {
  await request(createApp(testDeps)).get('/users/me').expect(401);
});
```

Test every endpoint for: the **happy path**, **validation errors (400)**, **auth (401/403)**, **not found (404)**, and that the **error format** is right.

---

<a name="database"></a>
# 6. ⭐ Testing code that uses a database

Three options, from most realistic to fastest:

| Option | How | Trade-off |
|---|---|---|
| **real DB in a container** | **Testcontainers** starts a throwaway MongoDB/Postgres in Docker for the test run | most realistic (real indexes, transactions); needs Docker; slower start |
| **in-memory MongoDB** | `mongodb-memory-server` downloads and runs a real `mongod` in-process | real MongoDB engine, no Docker; replica-set mode needed for transactions |
| **mock the repository** | unit tests only (§4) | fastest; doesn't test your queries at all |

```js
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongo;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});
afterEach(async () => {
  // clean slate for every test — no data leaks between tests
  for (const c of Object.values(mongoose.connection.collections)) await c.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
```

Rules:
- **Never run tests against a shared or production database.**
- **Each test creates the data it needs** (small factory helpers: `makeUser({ role: 'admin' })`) and cleans up after (or runs inside a transaction that's rolled back).
- Don't rely on data left by another test.

---

<a name="async"></a>
# 7. Testing async code, errors and time

**Always `await` (or `return`) the promise.** A test without it finishes before the assertion runs — and **passes even when the code is broken**:

```js
it('saves', () => {
  service.save(x).then(r => expect(r.ok).toBe(true));   // ❌ test ends first — always "passes"
});
it('saves', async () => {
  expect((await service.save(x)).ok).toBe(true);        // ✅
});
```

**Testing that something throws:**

```js
await expect(service.register(dup)).rejects.toThrow(ConflictError);   // async
expect(() => parse('bad')).toThrow('Invalid');                        // sync — wrap it in a function
```

**Time:** don't really wait. Use **fake timers** to jump the clock:

```js
vi.useFakeTimers();
const fn = vi.fn();
debounce(fn, 1000)();
vi.advanceTimersByTime(999);  expect(fn).not.toHaveBeenCalled();
vi.advanceTimersByTime(1);    expect(fn).toHaveBeenCalledOnce();
vi.useRealTimers();
```

For "today's date" logic, set the fake system time (`vi.setSystemTime(new Date('2026-01-31'))`) — and test month ends, leap years and time zones.

---

<a name="flaky"></a>
# 8. ⭐ Flaky tests — causes and fixes

A **flaky test** passes sometimes and fails sometimes with no code change. It's worse than no test: people learn to ignore red builds.

| Cause | Example | Fix |
|---|---|---|
| **shared state** | test B depends on a user created by test A | each test creates its own data; clean up after each test |
| **order dependence** | passes alone, fails in the full suite | same — make tests independent; run in random order to find these |
| **real time** | `setTimeout(…, 100)` then expect; `new Date()` near midnight | fake timers / fixed system time |
| **waiting by sleeping** | `await sleep(500)` "for the job to finish" | wait for the actual condition, or call the code directly |
| **real network** | calls a real third-party API | `nock`/MSW, or a local fake |
| **random data** | random emails that sometimes collide | unique ids, or fixed seed |
| **parallel tests sharing one DB** | two test files delete each other's data | a separate database (or schema) per worker |
| **unordered results** | `expect(list).toEqual([a, b])` but the query has no `sort` | sort in the query, or compare without caring about order |

**Fix it or delete it** — don't just re-run until green.

---

<a name="coverage"></a>
# 9. Coverage — what the number means

`vitest --coverage` / `jest --coverage` / `node --test --experimental-test-coverage` report which lines and branches ran during tests.

- Coverage tells you what's **untested**. It does **not** tell you what's **well tested** — a test with no assertions still "covers" lines.
- 100% is rarely worth chasing. Aim for high coverage on **business logic** and error paths; don't sweat config and glue code.
- Look at **branch** coverage (did both sides of the `if` run?), not only line coverage.

---

<a name="ci"></a>
# 10. Tests in CI

- Run tests on **every pull request**; block merging if they fail.
- Fast tests first (lint, type check, unit), slower ones after (integration, E2E).
- Use the same Node version as production (`engines` field / `.nvmrc`).
- `npm ci` for a clean, exact install ([Part 4.5 §4](04.5-npm-packages-and-configuration.md)).
- Real dependencies through Docker services or Testcontainers.

---

<a name="interview"></a>
# 11. Interview Questions & Answers

### Q1. Unit vs integration vs E2E tests?
> "Unit tests check one function or class with its dependencies faked — very fast, and a failure points straight at the problem. Integration tests check real pieces together, like a route plus service plus a test database — they catch wiring bugs unit tests can't. E2E tests run the whole system like a user — the most realistic and the slowest, so I keep few of them. For an API, I write unit tests for business logic and an integration test for every endpoint."

### Q2. How do you test an Express route?
> "I split building the app from listening on a port, then use supertest to send real HTTP requests to the app in-process. I check the status code, the body, and that nothing sensitive leaks, for the happy path, validation errors, auth failures and not-found."

### Q3. How do you test code that talks to MongoDB?
> "For integration tests, a real but throwaway database — `mongodb-memory-server` or Testcontainers — with each test creating its own data and the collections cleaned after each test. For unit tests of business logic, I inject a fake repository. I never test against a shared database."

### Q4. What should you mock?
> "Things outside my control or that make tests slow or random — third-party APIs, email, payments, time. In unit tests, also the repository. I don't mock the code under test, and I avoid mocking so much that I'm just testing my mocks; if a test needs a lot of mocks, an integration test is usually the better choice."

### Q5. How do you make code easier to test?
> "Pass dependencies in instead of creating them inside — constructor or function parameters. Keep business logic in services that don't know about Express or the database driver. Keep functions small and pure where possible."

### Q6. What causes flaky tests?
> "Shared state between tests, depending on test order, real timers or the current date, sleeping instead of waiting for a condition, real network calls, and tests running in parallel against the same database. The fixes are isolation per test, fake timers, network mocking and separate databases per worker."

### Q7. What does 90% code coverage tell you?
> "That 10% of the code never ran in tests. It doesn't tell you the other 90% is tested well — a test without assertions still counts as coverage. I use it to find untested areas, mainly in business logic and error handling, not as a target in itself."

### Q8. Why might an async test pass even though the code is broken?
> "If the test doesn't `await` or return the promise, the test function finishes before the assertion runs, so the runner records a pass. Always `await` the call, and use `expect(...).rejects` for expected failures."

---

<a name="cheatsheet"></a>
# 12. Cheat Sheet

```
UNIT (one piece, fakes) · INTEGRATION (real pieces + test DB) · E2E (whole system)
many unit · an integration test per endpoint · few E2E
"brake pad on a bench · press the pedal · drive around the block"

runners: Jest (common) · Vitest (fast, ESM/TS) · node:test (built in)

GOOD TEST: Arrange-Act-Assert · one behaviour · test behaviour not internals
           independent · edge cases · deterministic

TESTABLE CODE: inject dependencies (makeService({ repo, mailer }))
MOCK: third-party APIs, email, payments, time · (unit) the repo
DON'T MOCK: the code under test · your own DB in integration tests
HTTP to others: nock / MSW

ROUTES: createApp() separate from listen() → supertest(app).post(...).expect(201)
  test: happy path · 400 · 401/403 · 404 · error format · no leaked fields

DB: mongodb-memory-server / Testcontainers · own data per test · clean after each
    never a shared/prod DB

ASYNC: ALWAYS await · expect(...).rejects.toThrow() · fake timers · setSystemTime
FLAKY: shared state · order · real time · sleeps · network · parallel DB → isolate & fake
COVERAGE: shows what's UNtested, not what's well tested · watch branches
CI: every PR · fast first · same Node version · npm ci
```
