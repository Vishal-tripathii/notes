# TypeScript Study Notes — Part 02

## Interfaces vs Type Aliases ⭐⭐⭐⭐⭐

**Topics:** what each can express · `extends` vs `&` · the silent-`never` trap · declaration merging · module augmentation · which to default to.

---

## 1. The one rule

> **`interface` describes the shape of an object. `type` gives a name to *any* type — including shapes, but also unions, primitives, tuples and computed types.**

Everything else in this note follows from that. For a plain object shape they are almost interchangeable — and interviewers know that, so the real question they're asking is *"do you know the three places they differ?"*

The formal wording:

> **Definition — Interface:** a named declaration that describes the shape an object (or class, or function) must conform to. It is open — it can be reopened and extended after declaration.
> **Definition — Type Alias:** a name bound to a type expression. It is closed — once declared, it cannot be reopened or added to.

### Start simple — here they're identical

```ts
interface User {
  id: number;
  name: string;
}

type User = {
  id: number;
  name: string;
};
```

Same checking, same errors, same everything. A `User` from one is assignable to a `User` from the other, because TypeScript is **structurally typed** — it compares shapes, not names.

```ts
interface Point { x: number; y: number }
type Coord    = { x: number; y: number };

const p: Point = { x: 1, y: 2 };
const c: Coord = p;              // ✅ fine — same shape, different name, TS doesn't care
```

---

## 2. What only `type` can do

`interface` is limited to object-ish shapes. A type alias can name anything:

```ts
type ID       = string | number;              // ✅ union            — interface can't
type Status   = 'idle' | 'loading' | 'done';  // ✅ literal union    — interface can't
type Name     = string;                        // ✅ primitive alias  — interface can't
type Pair     = [number, string];              // ✅ tuple            — interface can't
type Callback = (e: Event) => void;            // ✅ (interface can, but awkwardly)
type Keys     = keyof User;                    // ✅ computed         — interface can't
type Partial2<T> = { [K in keyof T]?: T[K] };  // ✅ mapped type      — interface can't
```

Roughly: **anything that isn't `{ … }` needs a `type`.**

```
        type ────────────────────────────────────┐
         │                                       │
         ├── unions, primitives, tuples          │  interface CANNOT
         ├── mapped / conditional types          │  express these
         │                                       │
         └── object shapes ◄──── interface ──────┘  both can do these
```

---

## 3. What only `interface` can do — declaration merging

Declare the same interface name twice and TypeScript **merges** them. Declare the same type alias twice and it's an error.

```ts
interface Window { title: string }
interface Window { version: number }
// → Window now has BOTH title and version  ✅

type Box = { a: number };
type Box = { b: number };
// ❌ Error: Duplicate identifier 'Box'
```

This looks like a footgun — and inside your own codebase it is, since two people can silently extend the same interface from different files. But it's the **only** way to add properties to types you don't own:

```ts
// adding a property to the global Window object
declare global {
  interface Window {
    dataLayer: unknown[];
  }
}

window.dataLayer.push({ event: 'page_view' });   // ✅ typed, no `as any`
```

```ts
// adding `user` to Express's Request, after auth middleware sets it
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; roles: string[] };
    }
  }
}
```

That's **module augmentation**, and it's impossible with a type alias. If you're publishing a library whose types consumers may need to extend, `interface` is the right call.

---

## 4. `extends` vs `&` — they are not the same

Both compose. They behave differently when there's a **conflict**, and this is the best interview question in the topic.

```ts
interface A { x: number }
interface B extends A { x: string }
// ❌ Error: Interface 'B' incorrectly extends 'A'.
//    Types of property 'x' are incompatible. Type 'string' is not assignable to 'number'.
```

Loud, immediate, on the line that caused it. Now the intersection:

```ts
type A = { x: number };
type B = A & { x: string };
// ✅ no error here…

const b: B = { x: 1 };        // ❌ Type 'number' is not assignable to type 'never'
const b2: B = { x: 'hi' };    // ❌ Type 'string' is not assignable to type 'never'
```

Because `number & string` collapses to `never`, `B` is a type **nothing can satisfy** — and you don't find out at the declaration, you find out later at every use site, with a confusing error.

```
extends                              &
──────────────────────────           ──────────────────────────
checks compatibility eagerly         merges blindly
error at the DECLARATION  ✅          property becomes `never`
"B incorrectly extends A"            error at every USE  ⚠️
```

`extends` is a **constraint** — "B must be a valid A." `&` is a **merge** — "smash these together and hope."

> On large codebases the TS team also notes `interface extends` is cheaper for the compiler: the result is cached, whereas intersections are re-evaluated. It's a real but minor effect — mention it only if pushed.

---

## 5. Which should you default to?

```
Is it an object shape?
├── no  → type            (union, tuple, primitive, mapped…)
└── yes
    ├── will others extend it / is it public API?  → interface
    └── otherwise                                  → either; pick one and be consistent
```

**Practical default: `interface` for object shapes, `type` for everything else.** Reasons, in order of how much they actually matter:

1. `type` is the only option for unions/tuples/computed types, so you'll need it anyway.
2. `interface` gives better error messages — TS reports the interface *name* rather than expanding the whole shape inline.
3. `interface` supports augmentation if requirements change later; converting an interface to a type alias is trivial, the reverse is not.

**Honest answer if asked "does it really matter?"** — No, not for a plain shape. Consistency within a codebase matters far more than the choice. What matters is knowing *why* you can't always choose.

---

## 6. In practice

```ts
// ── Angular: shape from the API → interface; the state machine → type
export interface User {
  id: number;
  name: string;
  roles: Role[];
}

export type Role = 'admin' | 'editor' | 'viewer';        // union → must be a type

export type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };                   // discriminated union → Part 04
```

```ts
// ── React: props are an object shape, so interface reads well
interface ButtonProps {
  variant: Variant;
  onClick: () => void;
  children: React.ReactNode;
}

type Variant = 'primary' | 'secondary' | 'ghost';        // union → type
```

Note how naturally the split falls out: **data shapes are interfaces, the vocabulary describing them is types.**

Both work with `implements`, so this choice never blocks a class:

```ts
class ApiUser implements User { … }        // ✅ works with interface
class ApiUser implements UserType { … }    // ✅ also works with a type alias object shape
```

---

## Interview Q&A

**Q: What's the difference between an interface and a type alias?**
> A type alias can name *any* type — unions, tuples, primitives, mapped types. An interface only describes object shapes. In exchange, interfaces support declaration merging, which is what makes module augmentation possible. For a plain object shape they're interchangeable.

**Q: Which do you use, and why?**
> `interface` for object shapes, `type` for everything else. Interfaces give cleaner error messages and stay extensible for consumers; unions and computed types force a type alias anyway. But consistency in a codebase beats the choice itself.

**Q: What is declaration merging, and when have you actually used it?**
> Two interfaces with the same name merge into one. It's how you add properties to types you don't own — adding `dataLayer` to `Window`, or `user` to Express's `Request` after auth middleware sets it. Type aliases throw a duplicate-identifier error instead.

**Q: `interface B extends A` vs `type B = A & …` — is there a real difference?**
> Yes, on conflict. `extends` checks compatibility and errors at the declaration — "B incorrectly extends A." An intersection merges blindly, so `number & string` silently becomes `never`, and you get a confusing error at every use site instead. `extends` is a constraint; `&` is a merge.

**Q: Predict:**
```ts
type A = { x: number };
type B = A & { x: string };
const b: B = { x: 1 };
```
> Error on the last line: `Type 'number' is not assignable to type 'never'`. `B['x']` is `number & string`, which is `never` — the type is uninhabitable.

**Q: If they're structurally identical, can I assign one to the other?**
> Yes. TypeScript is structurally typed — it compares shapes, not declaration names. An `interface Point` value is assignable to a `type Coord` with the same members and vice versa.

---

## Follow-ups (challenge questions)

- *API design:* you're publishing a shared types package used by four teams. One team needs an extra field on `User` for their vertical. What breaks if you exported `User` as a type alias, and how does declaration merging change the answer — including the downside of letting them merge?
- *Failure mode:* a teammate writes `type Props = BaseProps & OwnProps` and a property silently becomes `never`, so a component "just never accepts that prop." How would you spot this from the error message alone, and what's the one-line refactor that surfaces it at the declaration instead?
- *Scale:* declaration merging means any file can widen an interface. In a 200-file app, how would you stop an accidental `interface User { … }` in a feature folder from silently merging with the shared one — and does the answer differ for a library versus an app?

---

**Previous:** [Part 01 — Basic Types & Inference](01-basic-types-and-inference.md) · **Next:** [Part 03 — `any` / `unknown` / `never` / `void`](03-any-unknown-never-void.md)
