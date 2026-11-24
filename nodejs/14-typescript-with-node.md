# Node.js Study Notes — Part 14

## TypeScript with Node — Setup, Running It, Typing Express, and Validating at Runtime

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.
>
> **Why this matters:** most Node jobs at 3–4 years use TypeScript. Interviewers don't ask about advanced type puzzles as much as practical things: "how do you run TS in Node?", "how do you type `req.user`?", "why isn't TypeScript enough to validate a request body?" This part answers those.
>
> **Scope:** TypeScript **in a Node backend**. The language itself (generics, unions, utility types) belongs to the JavaScript/TypeScript track.

---

## Table of Contents

1. [What TypeScript actually does](#what)
2. [⭐ Types disappear at runtime](#runtime)
3. [Ways to run TypeScript in Node](#run)
4. [A sensible `tsconfig.json`](#tsconfig)
5. [ESM vs CommonJS with TypeScript](#modules)
6. [Typing Express](#express)
7. [⭐ Validate at the boundary: zod + inferred types](#zod)
8. [Types for config, errors, and `any` vs `unknown`](#patterns)
9. [Interview Questions & Answers](#interview)
10. [Cheat Sheet](#cheatsheet)

---

<a name="what"></a>
# 1. What TypeScript actually does

TypeScript = JavaScript + **types you write down**. A checker (`tsc`) reads them and complains **before the code runs** if something doesn't fit.

```ts
function total(items: { price: number; qty: number }[]): number {
  return items.reduce((t, i) => t + i.price * i.qty, 0);
}
total([{ price: '10', qty: 1 }]);   // ❌ error at build time: string is not number
```

What you get: typos and wrong shapes caught while typing, much better autocomplete, safer refactoring (rename a field → every use that breaks is listed), and types as documentation.

> **Analogy 📐 — an architect's drawing.** The drawing is checked before building starts and catches mistakes early. But the drawing isn't part of the house — once built, nobody can see it.

---

<a name="runtime"></a>
# 2. ⭐ Types disappear at runtime

**This is the most important idea in this part.** TypeScript types are removed when the code is compiled or run. Node only ever runs JavaScript.

So TypeScript can **not** check data that arrives while the app is running — request bodies, query strings, environment variables, JSON from another API, database documents:

```ts
type CreateUser = { email: string; age: number };

app.post('/users', (req, res) => {
  const body = req.body as CreateUser;   // ⚠️ just a promise to the compiler — nothing is checked
  body.age.toFixed();                    // 💥 crashes if the client sent { age: "twelve" }
});
```

`as CreateUser` doesn't check anything. You told TypeScript "trust me." For outside data you need a **runtime validator** — §7.

> 🧠 **Remember:** **TypeScript checks your code. It does not check your users.**

---

<a name="run"></a>
# 3. Ways to run TypeScript in Node

| Way | How | Type-checks? | Use for |
|---|---|---|---|
| **`tsc` then `node`** | compile `src/*.ts` → `dist/*.js`, run the JS | ✅ | production builds — classic and simple |
| **`tsx`** | `npx tsx watch src/index.ts` — compiles on the fly with esbuild | ❌ (strips types only) | development, scripts |
| **Node's built-in type stripping** | `node src/index.ts` — on by default in Node 23.6+ and 22.18+ (earlier: `--experimental-strip-types`) | ❌ | dev and simple apps; only "erasable" TS syntax (no `enum`, no `namespace`, no parameter properties) |
| **bundlers** (esbuild, swc) | very fast build to JS | ❌ | big projects, serverless bundles |

**The tools that don't type-check are fast because they just delete the types.** So in every setup, run **`tsc --noEmit`** in CI (and in your editor) to actually check the types:

```json
"scripts": {
  "dev": "tsx watch src/index.ts",
  "build": "tsc -p tsconfig.json",
  "typecheck": "tsc --noEmit",
  "start": "node dist/index.js"
}
```

Use **source maps** (`"sourceMap": true` + `node --enable-source-maps`) so stack traces in production point to your `.ts` lines, not the compiled JS.

---

<a name="tsconfig"></a>
# 4. A sensible `tsconfig.json`

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",              // modern JS — Node 20+ supports it
    "module": "NodeNext",            // follow Node's own ESM/CJS rules
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,                  // ⭐ the most important line
    "noUncheckedIndexedAccess": true,// arr[i] might be undefined — make me check
    "esModuleInterop": true,
    "skipLibCheck": true,            // don't type-check every .d.ts in node_modules (faster)
    "sourceMap": true
  },
  "include": ["src"]
}
```

**`strict: true`** turns on the checks that actually find bugs — most importantly `strictNullChecks` ("this might be `null`/`undefined` — handle it"). Without `strict`, TypeScript lets most mistakes through. Turn it on from day one; adding it later to a big codebase is painful.

Install Node's types: `npm i -D @types/node` (and `@types/express` etc. for libraries that don't ship their own types).

---

<a name="modules"></a>
# 5. ESM vs CommonJS with TypeScript

With `"module": "NodeNext"`, TypeScript follows Node's rules ([Part 4](04-modules.md)):

- `"type": "module"` in `package.json` → your `.ts` files compile to ES modules.
- **In ESM, relative imports need the file extension — and you write `.js` even in a `.ts` file:**
  ```ts
  import { createApp } from './app.js';   // ✅ points at the compiled output
  import { createApp } from './app';      // ❌ Node can't find it at runtime
  ```
  This looks wrong the first time; it's correct, because Node runs the compiled `.js`.
- With native type stripping or `tsx`, `.ts` extensions in imports can also be allowed (`allowImportingTsExtensions` / `rewriteRelativeImportExtensions`), but pick one convention for the project.

---

<a name="express"></a>
# 6. Typing Express

```ts
import express, { Request, Response, NextFunction } from 'express';

type Params = { id: string };
type Query  = { include?: string };

app.get('/orders/:id', async (req: Request<Params, unknown, unknown, Query>, res: Response) => {
  const order = await orders.find(req.params.id);   // req.params.id is a string ✅
  res.json(order);
});
```

**Adding `req.user` (set by your auth middleware)** — extend Express's types once, globally:

```ts
// src/types/express.d.ts
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: 'user' | 'admin' };
    }
  }
}
export {};
```

Now `req.user?.role` is typed everywhere. It's still `?` (optional), because TypeScript can't know the auth middleware ran — check it, or use a small helper that throws 401 when it's missing.

Error middleware has four parameters — type them so Express recognises it:

```ts
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => { /* ... */ });
```

---

<a name="zod"></a>
# 7. ⭐ Validate at the boundary: zod + inferred types

The best pattern: **write the schema once** with a runtime validator, and **let TypeScript derive the type from it**. Then the check and the type can never disagree.

```ts
import { z } from 'zod';

const CreateUser = z.object({
  email: z.string().email(),
  age: z.number().int().min(13),
  role: z.enum(['user', 'admin']).default('user'),
});
type CreateUser = z.infer<typeof CreateUser>;   // { email: string; age: number; role: 'user' | 'admin' }

app.post('/users', async (req, res) => {
  const result = CreateUser.safeParse(req.body);           // ✅ real runtime check
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });
  const user = await userService.create(result.data);      // result.data is typed AND verified
  res.status(201).json(user);
});
```

Validate **everything that comes from outside**: request bodies, params, query strings, headers you use, environment variables ([Part 4.5 §6](04.5-npm-packages-and-configuration.md)), responses from third-party APIs, messages from queues. Inside your own code, trust the types.

Alternatives with the same idea: `valibot`, `typebox` (works nicely with Fastify), `class-validator` (NestJS style).

---

<a name="patterns"></a>
# 8. Types for config, errors, and `any` vs `unknown`

**`any` vs `unknown`:**
- `any` switches type checking **off** — anything goes, mistakes included. Avoid it.
- `unknown` means "could be anything — **prove** what it is before using it." Use it for outside data and caught errors.

```ts
try { await charge(); }
catch (err: unknown) {                          // catch variables are unknown in strict mode
  if (err instanceof AppError) return res.status(err.status).json({ code: err.code });
  throw err;
}
```

**Make impossible states impossible** with union types:

```ts
type PaymentResult =
  | { status: 'paid'; chargeId: string }
  | { status: 'failed'; reason: string };

function handle(r: PaymentResult) {
  if (r.status === 'paid') r.chargeId;   // TypeScript knows chargeId exists here
  else r.reason;                         // and reason here
}
```

**Typed Mongoose models:** define an interface and pass it to `Schema<IUser>` / `model<IUser>()`, or infer it from the schema with `InferSchemaType<typeof userSchema>`. Remember `.lean()` results are plain objects, not documents ([Part 8](08-mongodb-and-mongoose.md)).

---

<a name="interview"></a>
# 9. Interview Questions & Answers

### Q1. Does TypeScript validate API request bodies?
> "No. Types are erased at runtime — Node only runs JavaScript. `req.body as CreateUser` is just an assertion; nothing checks it. For anything from outside — bodies, query params, env vars, third-party responses — I validate at runtime with something like zod, and infer the TypeScript type from the schema so they always match."

### Q2. How do you run TypeScript in Node?
> "For production, usually compile with `tsc` and run the JavaScript, with source maps enabled. For development, `tsx` or Node's built-in type stripping, which runs `.ts` directly. Those fast tools don't type-check, so `tsc --noEmit` runs in CI and the editor."

### Q3. What does `strict: true` do, and why does it matter?
> "It turns on the strict family of checks, the most important being `strictNullChecks` — values that may be `null` or `undefined` must be handled before use. Without it TypeScript misses a large class of real bugs. It should be on from the start of a project."

### Q4. How do you add a `user` property to Express's `Request` type?
> "With declaration merging: a `.d.ts` file that declares `global { namespace Express { interface Request { user?: ... } } }`. It's optional because the compiler can't know the auth middleware ran, so protected handlers check it or use a helper that throws 401."

### Q5. `any` vs `unknown`?
> "`any` turns type checking off for that value. `unknown` accepts anything but forces you to narrow it — with a type guard, `instanceof`, or a schema parse — before using it. I use `unknown` for outside data and caught errors, and avoid `any`."

### Q6. Why do ESM imports in a `.ts` file end in `.js`?
> "Because with `NodeNext` resolution, TypeScript leaves import paths as written, and at runtime Node loads the compiled `.js` files and requires extensions in ESM. So the import names the file that will actually exist."

---

<a name="cheatsheet"></a>
# 10. Cheat Sheet

```
TS = JS + types checked BEFORE running · types are ERASED at runtime
"TypeScript checks your code, not your users"  → validate outside data at runtime (zod)
`as Type` = a promise to the compiler, NOT a check

RUN: tsc → node dist (prod) · tsx watch (dev) · node file.ts (type stripping, Node 22.18+/23.6+)
fast tools DON'T type-check → tsc --noEmit in CI · sourceMap + --enable-source-maps

tsconfig: target ES2022 · module/moduleResolution NodeNext · strict: true ⭐
          noUncheckedIndexedAccess · skipLibCheck · @types/node
ESM: import './app.js' even from .ts

EXPRESS: Request<Params, ResBody, ReqBody, Query> · req.user via declare global namespace Express
ZOD: const S = z.object(...); type T = z.infer<typeof S>; S.safeParse(req.body)
     validate bodies, params, query, env, 3rd-party responses, queue messages

any = checking OFF · unknown = prove it first (catch (err: unknown))
unions to model states: { status: 'paid', chargeId } | { status: 'failed', reason }
```
