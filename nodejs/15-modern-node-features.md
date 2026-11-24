# Node.js Study Notes — Part 15

## Modern Node — Release Cycle, and the Built-ins That Replaced Packages

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.
>
> **Why this matters:** Node changed a lot between versions 16 and 24. Things that used to need a package — `node-fetch`, `nodemon`, `dotenv`, `jest`, `uuid` — are now built in. Knowing this signals you work with current Node, and it removes dependencies (fewer packages = fewer security risks, [Part 7.5 §7](07.5-security-beyond-auth.md)).
>
> ⚠️ **Versions move fast.** The version numbers below were correct as of late 2025/2026; check the Node changelog for the exact version you run.

---

## Table of Contents

1. [Which Node version to use — LTS](#lts)
2. [⭐ Built-ins that replace packages](#replacements)
3. [The built-in test runner](#test)
4. [Other useful modern APIs](#apis)
5. [Interview Questions & Answers](#interview)
6. [Cheat Sheet](#cheatsheet)

---

<a name="lts"></a>
# 1. Which Node version to use — LTS

- Node releases a new **major** version every ~6 months.
- **Even numbers (20, 22, 24…) become LTS** — Long-Term Support: about 30 months of fixes. **Odd numbers (21, 23, 25…) are short-lived**, for trying new things.
- **Production: always an Active or Maintenance LTS version.** Upgrade before your version reaches end-of-life — after that, security fixes stop.
- Pin the version: `"engines": { "node": ">=22" }`, an `.nvmrc` file, and the same version in your Docker base image and CI.

> 🧠 **Remember:** **even = steady (use in prod), odd = experimental.**

---

<a name="replacements"></a>
# 2. ⭐ Built-ins that replace packages

| You used to install | Now built in | Since (roughly) |
|---|---|---|
| `node-fetch`, `axios` (for simple calls) | global **`fetch`**, `Request`, `Response`, `FormData` (powered by undici) | Node 18, stable in 21 |
| `nodemon` | **`node --watch app.js`** — restarts on file changes | 18.11, stable in 22 |
| `dotenv` | **`node --env-file=.env app.js`**, `process.loadEnvFile()` | 20.6 / 21.7 |
| `jest`/`mocha` (for simple suites) | **`node:test`** + `node:assert` — runner, mocks, fake timers, coverage | stable in 20 |
| `uuid` | **`crypto.randomUUID()`** | 14.17 |
| `lodash.clonedeep` | **`structuredClone(obj)`** | 17 |
| `abort-controller` | global **`AbortController`**, `AbortSignal.timeout()`, `AbortSignal.any()` | 15 / 17.3 / 20 |
| `ws` (as a *client*) | global **`WebSocket`** client | 22 |
| `ts-node` (for simple cases) | **type stripping**: `node file.ts` ([Part 14 §3](14-typescript-with-node.md)) | on by default 23.6 / 22.18 |
| `glob` (basic) | **`fs.glob()`** | 22 (experimental at first — check your version) |
| `minimist`/`yargs` (basic) | **`util.parseArgs()`** | 18.3 |
| `chalk` (basic colours) | **`util.styleText()`** | 20.12 / 21.7 |
| `sqlite3` | **`node:sqlite`** (still experimental-ish — check status) | 22.5 |

You don't have to remove a package that works. But for **new** code, prefer the built-in: one less dependency to update and trust.

---

<a name="test"></a>
# 3. The built-in test runner

```js
// pricing.test.js
import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { orderTotal } from './pricing.js';

describe('orderTotal', () => {
  test('adds items', () => {
    assert.equal(orderTotal([{ price: 100, qty: 2 }]), 200);
  });

  test('calls the logger once', () => {
    const log = mock.fn();
    orderTotal([], { log });
    assert.equal(log.mock.callCount(), 1);
  });
});
```

```bash
node --test                                  # finds *.test.js etc. and runs them
node --test --watch                          # re-run on changes
node --test --experimental-test-coverage     # coverage report
```

Includes `mock.fn()`, `mock.method()`, `mock.timers` (fake timers), `beforeEach`/`afterEach`, snapshots (newer versions), and parallel test files. Good for libraries and small/medium services; Jest/Vitest still have the bigger ecosystem. Testing concepts: [Part 10](10-testing.md).

---

<a name="apis"></a>
# 4. Other useful modern APIs

```js
// timers as promises — no more new Promise(r => setTimeout(r, ms))
import { setTimeout as sleep } from 'node:timers/promises';
await sleep(500);

// stream/promises — awaitable pipeline (Part 9.5 §7)
import { pipeline } from 'node:stream/promises';
await pipeline(src, transform, dest);

// events.once — await an event (Part 2.5 §5)
import { once } from 'node:events';
await once(server, 'listening');

// top-level await in ES modules (Part 4 §2)
const config = await loadConfig();

// ESM path helpers (Part 5.5 §4)
import.meta.dirname; import.meta.filename;

// require() of ES modules without top-level await — Node 22.12+ / 20.19+ (Part 4 §Q4)

// AsyncLocalStorage — request context (Part 10.5 §6)

// the permission model — restrict fs / child_process / workers (Part 7.5 §8)
// node --permission --allow-fs-read=./data app.js

// Promise.withResolvers(), Array.prototype.findLast, Object.groupBy, Set methods (union/intersection)
// — newer JavaScript features that come with newer V8 versions
```

**Single executable applications (SEA)** — package a Node app into one binary file for distribution (CLI tools). Exists, still evolving.

---

<a name="interview"></a>
# 5. Interview Questions & Answers

### Q1. Which Node version would you run in production, and why?
> "An LTS version — the even-numbered releases, which get about 30 months of support. Odd releases are short-lived. I pin it in `engines`, `.nvmrc`, the Docker image and CI, and plan upgrades before end-of-life so we keep getting security fixes."

### Q2. What packages has modern Node made unnecessary?
> "`fetch` is built in, so `node-fetch` isn't needed for simple calls; `node --watch` replaces nodemon; `--env-file` replaces dotenv; `node:test` covers basic testing; `crypto.randomUUID()` replaces `uuid`; `structuredClone` replaces deep-clone helpers; and recent versions can run TypeScript files directly by stripping types. Fewer dependencies means less to update and less supply-chain risk."

### Q3. Is Node's built-in `fetch` production ready?
> "Yes, it's been stable since Node 21 and is built on undici with connection pooling. Two things to remember: it has no default timeout, so pass `AbortSignal.timeout()`, and it doesn't reject on HTTP error statuses, so check `res.ok`."

### Q4. Would you use `node:test` instead of Jest?
> "For a library or a small service, yes — no dependencies, fast, and it has mocks, fake timers and coverage. For a larger app where the team relies on Jest or Vitest features and plugins, I'd keep those. The testing ideas are the same either way."

---

<a name="cheatsheet"></a>
# 6. Cheat Sheet

```
LTS = even majors (20, 22, 24) → production · odd = short-lived · upgrade before EOL
pin: engines + .nvmrc + Docker image + CI

BUILT-INS (new code: prefer these)
fetch (no timeout! check res.ok) · node --watch · node --env-file=.env
node --test + node:assert + mock · crypto.randomUUID() · structuredClone()
AbortController / AbortSignal.timeout / .any · global WebSocket client
node file.ts (type stripping) · fs.glob · util.parseArgs · util.styleText

ALSO: timers/promises (await sleep) · stream/promises pipeline · events.once
      top-level await · import.meta.dirname · require(esm) · AsyncLocalStorage
      --permission model

"fewer packages = fewer things to update and to trust"
```
