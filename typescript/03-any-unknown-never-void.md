# TypeScript Study Notes — Part 03

## `any` / `unknown` / `never` / `void` ⭐⭐⭐⭐⭐

**Topics:** the top type and the bottom type · why `any` is contagious · `unknown` as the safe boundary · `never` for exhaustiveness checking · `void` vs `undefined` and the callback gotcha.

---

## 1. The one rule

> **`any` turns the type checker *off*. `unknown` keeps it on and makes you prove what the value is. `never` is a value that can't exist. `void` means "there's no useful return value."**

Two of these are about *not knowing* the type (`any`, `unknown`), and two are about *absence* (`never`, `void`). Candidates mix them up because they're taught as one list; they're really two pairs.

```
DON'T KNOW THE TYPE                    NOTHING TO RETURN
────────────────────                   ─────────────────
any      → stop checking  ❌            void   → ignore the return value
unknown  → check later    ✅            never  → it doesn't return at all
```

---

## 2. The assignability picture

This single diagram explains almost every question in this topic:

```
            unknown            ← TOP: everything is assignable TO it
               ▲
     ┌─────────┼─────────┐
  string    number     object  ← ordinary types
     └─────────┼─────────┘
               ▲
             never             ← BOTTOM: it is assignable TO everything
```

- **`unknown`** accepts anything, but you can do nothing with it until you narrow.
- **`never`** accepts nothing, but fits anywhere — because a value of it can never exist, so no rule can be violated.
- **`any`** sits outside the diagram entirely: it's assignable *both* directions. That's exactly why it's dangerous.

```ts
let u: unknown = 'hi';       // ✅ anything goes IN
let s: string = u;           // ❌ ...but nothing comes OUT without narrowing

let a: any = 'hi';           // ✅ in
let s2: string = a;          // ✅ out, unchecked  ← the hole
```

---

## 3. `any` — the checker, switched off

> **Definition:** `any` opts a value out of type checking entirely. Every operation on it is allowed and its result is also `any`.

```ts
const user: any = JSON.parse(raw);

user.name.toUpperCase();     // ✅ compiles
user.nmae.toUpperCase();     // ✅ compiles — typo, crashes at runtime
user.doesNotExist();         // ✅ compiles — crashes at runtime
user();                      // ✅ compiles — crashes at runtime
user.a.b.c.d;                // ✅ compiles — crashes at runtime
```

Not "loosely checked." **Not checked.** Every guarantee TypeScript exists to give you is gone for that value.

### It spreads

The real cost isn't the one `any` — it's that `any` is contagious:

```ts
function getConfig(): any { … }

const config = getConfig();          // any
const timeout = config.timeout;      // any  ← spread
const ms = timeout * 1000;           // any  ← spread
setTimeout(fn, ms);                  // any silently accepted here
```

One `any` at the top of a call chain quietly disables checking for everything downstream. This is why a codebase can be "100% TypeScript" and still crash constantly.

### Where it legitimately appears

`JSON.parse()` returns `any`. So does `catch (e)` before TS 4.4, and most untyped `@types`-less libraries. Those are exactly the boundaries where you should convert to `unknown` immediately.

---

## 4. `unknown` — the safe `any`

> **Definition:** `unknown` is the top type — every value is assignable to it, but it cannot be used until it has been narrowed to a specific type.

Same "I don't know what this is," opposite safety posture:

```ts
const data: unknown = JSON.parse(raw);

data.name;                   // ❌ 'data' is of type 'unknown'
data();                      // ❌
data.toUpperCase();          // ❌

if (typeof data === 'object' && data !== null && 'name' in data) {
  console.log(data.name);    // ✅ narrowed — now allowed
}
```

`unknown` doesn't remove the uncertainty; it **forces you to resolve it before use.** The compiler makes you write the check you should have written anyway.

| | `any` | `unknown` |
|---|---|---|
| Assign anything to it | ✅ | ✅ |
| Assign it to anything | ✅ (unsafe) | ❌ must narrow first |
| Access properties | ✅ unchecked | ❌ must narrow first |
| Call it | ✅ unchecked | ❌ must narrow first |
| Errors surface | at runtime 💥 | at compile time ✅ |

### The pattern that matters — typed boundaries

Every place data enters your app from outside — HTTP, `localStorage`, `postMessage`, a query param — the honest type is `unknown`, and you validate once:

```ts
function isUser(value: unknown): value is User {          // type predicate → Part 05
  return typeof value === 'object' && value !== null
    && 'id'   in value && typeof (value as User).id === 'number'
    && 'name' in value && typeof (value as User).name === 'string';
}

export function loadUser(raw: string): User | null {
  const parsed: unknown = JSON.parse(raw);                // ← any becomes unknown at the door
  return isUser(parsed) ? parsed : null;                  // ← validated once, typed forever after
}
```

```
outside world → unknown → [validate here, once] → User → rest of your app is safe
                            ↑
                one narrow, well-tested checkpoint
```

Compare with `any`, where the *entire application* is the unchecked surface. (In production, a schema library like Zod does the validating — same shape, less handwritten code.)

### `catch` clauses

Since TS 4.4, `useUnknownInCatchVariables` (part of `strict`) makes caught errors `unknown` instead of `any` — because anything can be thrown, not just `Error`:

```ts
try { … } catch (e) {
  e.message;                              // ❌ 'e' is of type 'unknown'
  if (e instanceof Error) e.message;      // ✅
}
```

---

## 5. `never` — the value that can't exist

> **Definition:** `never` is the bottom type — the type with no possible values. It describes code paths that never produce a value.

It appears in three places:

```ts
// 1. a function that never returns normally
function fail(msg: string): never { throw new Error(msg); }
function loop(): never { while (true) {} }

// 2. an impossible intersection
type Impossible = string & number;        // never

// 3. an exhausted union — the useful one
```

### The killer use case: exhaustiveness checking

This is *the* reason `never` is worth knowing, and the answer interviewers are fishing for.

```ts
type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'square'; size: number };

function area(shape: Shape): number {
  switch (shape.kind) {
    case 'circle': return Math.PI * shape.radius ** 2;
    case 'square': return shape.size ** 2;
    default:
      const _exhaustive: never = shape;   // ✅ compiles today
      return _exhaustive;
  }
}
```

Trace what the compiler knows in the `default` branch: `circle` and `square` are both handled, so nothing is left — `shape` narrows to `never`, and assigning `never` to `never` is fine.

Now a teammate adds a variant:

```ts
type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'square'; size: number }
  | { kind: 'triangle'; base: number; height: number };   // ← new
```

```
default branch: shape is now { kind: 'triangle'; … }, not never
                              ↓
❌ Type '{ kind: "triangle"; … }' is not assignable to type 'never'
```

**A compile error appears in every switch that forgot the new case** — including ones in files they never opened. Without it, `area()` silently returns `undefined` for triangles and you find out from a bug report.

That's the whole trick: `never` turns "I hope I updated everything" into a compiler-enforced guarantee.

---

## 6. `void` — no useful return value

> **Definition:** `void` is the return type of a function that doesn't return anything meaningful. It signals to the *caller* that the result should be ignored.

```ts
function log(msg: string): void {
  console.log(msg);
}
```

### `void` vs `undefined` — the gotcha

They are not the same, and the difference is deliberate:

```ts
const f: () => void = () => 42;        // ✅ ALLOWED — surprising!
const g: () => undefined = () => 42;   // ❌ Type 'number' is not assignable to 'undefined'
```

`void` means *"I will ignore whatever you return,"* not *"you must return nothing."* So a function returning something is a valid `() => void` — the caller just can't use it.

Why it's designed that way — this pattern would be illegal otherwise:

```ts
const src = [1, 2, 3];
const dest: number[] = [];

src.forEach(n => dest.push(n));
//                    ↑ push returns number, forEach's callback is typed () => void
//                      → allowed, because the return value is simply discarded
```

But the compiler still protects the caller:

```ts
const result = log('hi');
result.toString();          // ❌ 'result' is of type 'void'
```

As a *variable* type `void` is useless (`let x: void` can only hold `undefined`). It's a return-position type.

---

## 7. All four, side by side

| | Means | Assignable to… | Typical use |
|---|---|---|---|
| `any` | "stop checking" | anything (unsafe) | escape hatch — avoid; migrate to `unknown` |
| `unknown` | "not known yet" | nothing until narrowed | data crossing a boundary (JSON, `catch`, APIs) |
| `never` | "cannot happen" | everything | exhaustiveness checks, throwing functions |
| `void` | "no useful result" | — (return position) | callbacks, side-effect functions |

**The one-liner:** *"`any` is an escape hatch that disables the compiler; `unknown` is the honest version that keeps it on; `never` is the type of impossible code, which makes it perfect for exhaustiveness checks; `void` says the return value has no meaning."*

---

## Interview Q&A

**Q: `any` vs `unknown`?**
> Both mean "I don't know the type." `any` disables checking — you can access any property or call it, and errors surface at runtime. `unknown` accepts any value in but permits nothing until you narrow it, so errors surface at compile time. `unknown` is what `any` should have been.

**Q: Why is `any` considered harmful if it compiles fine?**
> Because it's contagious. Anything derived from an `any` is also `any`, so one loose return type at the top of a call chain silently disables checking for everything downstream. The codebase looks typed and behaves untyped.

**Q: Give a real use for `never`.**
> Exhaustiveness checking. In the `default` branch of a switch over a discriminated union, assign the value to a `never` variable. While every case is handled the value narrows to `never` and it compiles; the moment someone adds a union member, every unhandled switch fails to compile — instead of silently returning `undefined`.

**Q: `void` vs `undefined`?**
> `undefined` is a value. `void` means the caller should ignore the return value, so a function that *does* return something still satisfies `() => void` — which is why `arr.forEach(x => other.push(x))` compiles even though `push` returns a number. `() => undefined` would reject it.

**Q: `JSON.parse()` returns `any`. What do you do about it?**
> Immediately annotate it as `unknown` and validate at that boundary — a type predicate by hand, or a schema library like Zod. One checkpoint, then the rest of the app has a real type. Leaving it as `any` means the whole app is the unchecked surface.

**Q: Predict:**
```ts
let a: any = 'hello';
let u: unknown = 'hello';
let s1: string = a;
let s2: string = u;
```
> Line 3 compiles (`any` is assignable to anything). Line 4 errors: `Type 'unknown' is not assignable to type 'string'`.

---

## Follow-ups (challenge questions)

- *Migration:* you inherit a codebase with 400 `any`s and are told to turn on `strict`. Which `any`s do you convert to `unknown` first, and why does converting them in the wrong order create more compile errors than it fixes?
- *Failure mode:* a util is typed `function parse(json: string): any`. Six months later a field is renamed server-side and nothing fails to compile — the bug reaches production as `undefined is not a function`. Where exactly would `unknown` have caught it, and what would the error have been?
- *Design:* you add a fourth state to a `LoadState` discriminated union used in 30 components. With a `never` exhaustiveness check you get 30 compile errors; without it you get zero. Argue why 30 errors is the better outcome — and what you'd do if the team pushes back that it "blocks the build."

---

**Previous:** [Part 02 — Interfaces vs Type Aliases](02-interfaces-vs-type-aliases.md) · **Next:** [Part 04 — Unions & Discriminated Unions](04-unions-and-discriminated-unions.md)
