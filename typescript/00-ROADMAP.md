# 🟦 TypeScript Study Notes — Master Roadmap

> **Purpose:** the full study plan for the TypeScript track — the type system sitting on top of the [JavaScript track](../javascript/00-ROADMAP.md), and the language your [Angular](../Angular/00-ROADMAP.md), [React](../React/) and [nodejs](../nodejs/) notes all assume. 17 parts, ordered so each depends only on what came before it. Every part is its own note file in this folder (`NN-topic-slug.md`), same convention as the other tracks.
>
> **Format per part:** a plain-language rule first, then the formal definition, code snippets, diagrams/traces, interview Q&A, and follow-up scenario-style challenge questions.
>
> **Target:** 80–85% interview coverage — conceptual understanding, correct defaults, and the ability to justify a choice rather than recite syntax.
>
> **Connects to:** [javascript/](../javascript/00-ROADMAP.md) (TS is a *compile-time* layer — every runtime behaviour question is still a JS question) · [Angular](../Angular/00-ROADMAP.md) (typed forms, DI generics, typed `HttpClient` — Part 14) · [React](../React/) (typed props/hooks/events — Part 15) · [nodejs](../nodejs/).

---

## Progress tracker

| # | Part | Priority | Status |
|---|---|---|---|
| 00 | [Why TypeScript & the Compiler](00-why-typescript-and-the-compiler.md) | ⭐⭐⭐☆☆ | ⬜ not started |
| 01 | [Basic Types & Inference](01-basic-types-and-inference.md) | ⭐⭐⭐⭐☆ | ⬜ not started |
| 02 | [Interfaces vs Type Aliases](02-interfaces-vs-type-aliases.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 03 | [`any` / `unknown` / `never` / `void`](03-any-unknown-never-void.md) | ⭐⭐⭐⭐⭐ | ✅ done |
| 04 | [Unions & Discriminated Unions](04-unions-and-discriminated-unions.md) | ⭐⭐⭐⭐⭐ | ⬜ not started |
| 05 | [Narrowing & Type Guards](05-narrowing-and-type-guards.md) | ⭐⭐⭐⭐⭐ | ⬜ not started |
| 06 | [Functions](06-functions.md) | ⭐⭐⭐☆☆ | ⬜ not started |
| 07 | [Generics](07-generics.md) | ⭐⭐⭐⭐⭐ | ⬜ not started |
| 08 | [Utility Types](08-utility-types.md) | ⭐⭐⭐⭐⭐ | ⬜ not started |
| 09 | [Classes in TypeScript](09-classes-in-typescript.md) | ⭐⭐⭐☆☆ | ⬜ not started |
| 10 | [Enums vs const Objects](10-enums-vs-const-objects.md) | ⭐⭐⭐☆☆ | ⬜ not started |
| 11 | [Modules & Declaration Files](11-modules-and-declaration-files.md) | ⭐⭐☆☆☆ | ⬜ not started |
| 12 | [Advanced Types](12-advanced-types.md) | ⭐⭐⭐☆☆ | ⬜ not started |
| 13 | [Strict Mode & Compiler Flags](13-strict-mode-and-compiler-flags.md) | ⭐⭐⭐⭐☆ | ⬜ not started |
| 14 | [TypeScript in Angular](14-typescript-in-angular.md) | ⭐⭐⭐⭐☆ | ⬜ not started |
| 15 | [TypeScript in React](15-typescript-in-react.md) | ⭐⭐⭐⭐☆ | ⬜ not started |
| 16 | [Type Drills](16-type-drills.md) | ⭐⭐⭐⭐⭐ | ⬜ not started |

**If you have one day left:** Parts 02, 03, 04, 05, 07, 08. Interface-vs-type, `unknown`-vs-`any`, discriminated unions, narrowing, generics and utility types carry almost every TypeScript interview.

---

# PHASE 0 — Foundations

## Part 00 — [Why TypeScript & the Compiler](00-why-typescript-and-the-compiler.md) ⭐⭐⭐☆☆

What TS actually is (a compile-time checker that **erases** to plain JS) · structural vs nominal typing · `tsc` and the build pipeline · `tsconfig.json` essentials · why types don't exist at runtime and what that costs you.

## Part 01 — [Basic Types & Inference](01-basic-types-and-inference.md) ⭐⭐⭐⭐☆

Primitives · arrays vs tuples · object types · when to annotate and when to let inference work · `const` vs `let` inference (literal widening) · type assertions (`as`) and why they're a promise, not a check.

---

# PHASE 1 — The type system proper

## Part 02 — [Interfaces vs Type Aliases](02-interfaces-vs-type-aliases.md) ⭐⭐⭐⭐⭐

What each *can* express · `extends` vs `&` and the silent-`never` trap · declaration merging and module augmentation · which to default to, and the honest answer to "does it matter?"

## Part 03 — [`any` / `unknown` / `never` / `void`](03-any-unknown-never-void.md) ⭐⭐⭐⭐⭐

The top type and the bottom type · why `any` is contagious · `unknown` as the safe boundary type · `never` for exhaustiveness checking · `void` vs `undefined` and the callback gotcha.

## Part 04 — [Unions & Discriminated Unions](04-unions-and-discriminated-unions.md) ⭐⭐⭐⭐⭐

Unions and intersections · literal types · the discriminated-union pattern for state modelling (`loading | success | error`) · why it beats three booleans.

## Part 05 — [Narrowing & Type Guards](05-narrowing-and-type-guards.md) ⭐⭐⭐⭐⭐

Control-flow analysis · `typeof`/`instanceof`/`in`/truthiness narrowing · user-defined type predicates (`x is Foo`) · assertion functions · `satisfies`.

## Part 06 — [Functions](06-functions.md) ⭐⭐⭐☆☆

Parameter/return typing · optional and default params · rest params · overloads (and why a union is usually better) · typing `this` · function-type syntax.

---

# PHASE 2 — Reuse & abstraction

## Part 07 — [Generics](07-generics.md) ⭐⭐⭐⭐⭐

Generic functions, interfaces and classes · constraints (`extends`) · defaults · inference · `keyof T` for type-safe property access · when a generic is over-engineering.

## Part 08 — [Utility Types](08-utility-types.md) ⭐⭐⭐⭐⭐

`Partial` · `Required` · `Readonly` · `Pick` · `Omit` · `Record` · `Exclude`/`Extract` · `NonNullable` · `ReturnType` · `Parameters` · `Awaited` — and rebuilding two of them from scratch.

## Part 09 — [Classes in TypeScript](09-classes-in-typescript.md) ⭐⭐⭐☆☆

`public`/`private`/`protected` (compile-time) vs `#private` (runtime) · `readonly` · parameter properties · `abstract` · `implements` vs `extends` · getters/setters.

## Part 10 — [Enums vs const Objects](10-enums-vs-const-objects.md) ⭐⭐⭐☆☆

Numeric vs string enums · what an enum actually compiles to · `const enum` and why it's discouraged · `as const` objects + literal unions as the modern default.

---

# PHASE 3 — Real projects

## Part 11 — [Modules & Declaration Files](11-modules-and-declaration-files.md) ⭐⭐☆☆☆

`import type` and type-only imports · `.d.ts` files · `declare global` · `@types/*` packages · writing types for an untyped library.

## Part 12 — [Advanced Types](12-advanced-types.md) ⭐⭐⭐☆☆

`keyof` / `typeof` / indexed access · mapped types · conditional types and `infer` · template literal types · recursive types. Read for comprehension, not memorisation.

## Part 13 — [Strict Mode & Compiler Flags](13-strict-mode-and-compiler-flags.md) ⭐⭐⭐⭐☆

What `strict: true` actually turns on · `strictNullChecks` (the important one) · `noImplicitAny` · `noUncheckedIndexedAccess` · `exactOptionalPropertyTypes` · migrating a loose codebase incrementally.

---

# PHASE 4 — Framework integration & drilling

## Part 14 — [TypeScript in Angular](14-typescript-in-angular.md) ⭐⭐⭐⭐☆

Typed reactive forms (`FormGroup<T>`, `NonNullableFormBuilder`) · generic `inject<T>()` and `InjectionToken<T>` · typed `HttpClient` responses · typing `input()`/`output()` and signals. Cross-references [Angular Part 15 — Forms](../Angular/15-forms.md) and [Part 13 — HttpClient](../Angular/13-httpclient-and-interceptors.md) rather than duplicating them.

## Part 15 — [TypeScript in React](15-typescript-in-react.md) ⭐⭐⭐⭐☆

Typing props (and why `React.FC` fell out of favour) · `useState<T>` · `useRef` (`RefObject` vs `MutableRefObject`) · `useReducer` with discriminated unions · event types · `PropsWithChildren` · generic components. Cross-references [React Part 04 — Props](../React/04-props.md).

## Part 16 — [Type Drills](16-type-drills.md) ⭐⭐⭐⭐⭐

A running file — "what type is this?" and "why doesn't this compile?" prediction questions, weighted toward Parts 02–05 and 07–08. Same format as [javascript Part 24](../javascript/24-output-based-question-drills.md): predict before revealing.

---

# Interview priority — what to revise last

| Priority | Topics |
|---|---|
| ⭐⭐⭐⭐⭐ | Interfaces vs Type Aliases · `any`/`unknown`/`never`/`void` · Discriminated Unions · Narrowing & Type Guards · Generics · Utility Types · Type Drills |
| ⭐⭐⭐⭐☆ | Basic Types & Inference · Strict Mode & Compiler Flags · TS in Angular · TS in React |
| ⭐⭐⭐☆☆ | Why TypeScript & the Compiler · Functions · Classes · Enums vs const Objects · Advanced Types |
| ⭐⭐☆☆☆ | Modules & Declaration Files |

---

*— Work through these in order. One part at a time, explained first, written after. —*
