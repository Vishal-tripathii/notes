# Angular Study Notes — Part 00

## TypeScript for Angular

> **Status:** 🟡 in progress — started from "already comfortable," being filled in as gaps surface in interview prep. Covered so far: `any` vs `unknown`, `interface` vs `type`. Still open: type aliases, classes & access modifiers, enums, generics, utility types, union & literal types, optional chaining, nullish coalescing, non-null assertion, decorators & metadata, strict mode.
>
> **Roadmap:** [Part 00](00-ROADMAP.md) · **Priority:** ⭐⭐⭐⭐☆
>
> **Continues into:** [Part 08 — DI](08-dependency-injection-and-services.md) (decorators/metadata), [Part 11 — Signals](11-signals.md), [Part 15 — Forms](15-forms.md) (typed reactive forms all lean on generics).

---

## Table of Contents

1. [`any` vs `unknown`](#any-unknown) ⭐
2. [`interface` vs `type`](#interface-type) ⭐
3. [Interview Q&A](#interview)
4. [The 60-second summary](#summary)

---

<a name="any-unknown"></a>
# 1. ⭐ `any` vs `unknown`

`any` turns off type checking completely — the compiler stops watching that value. And the "off" is contagious: anything you read out of an `any` becomes `any` too, so the unsafety spreads through the code that touches it.

`unknown` is the type-safe version: it can hold anything, same as `any`, but you're not allowed to *do* anything with it until you've proven what it is.

```ts
let a: any = fetchThirdPartyResponse();
a.user.email.toLowerCase();        // compiles fine — crashes at runtime if the shape is wrong

let u: unknown = fetchThirdPartyResponse();
u.user.email.toLowerCase();        // ❌ compile error — "u is of type unknown"

if (typeof u === 'object' && u !== null && 'user' in u) {
  // now you've proven something about the shape — safe to narrow further
}
```

```
any      →  "trust me"  — escape hatch, spreads unsafety to everything it touches
unknown  →  "prove it"  — same flexibility, but forces a narrowing check first
```

Where `unknown` actually shows up:

```ts
catch (e: unknown) { ... }     // TS 4.4+ default catch-clause type — errors aren't guaranteed to be Error
JSON.parse(raw)                // returns any today, but the discipline is to treat it as unknown
fetchThirdPartyApi()           // any response you don't control
```

⚠️ `JSON.parse` is still typed `any` by TypeScript itself — the "treat it as unknown" discipline is something *you* enforce (a wrapper function, a schema validator like `zod`), not something the compiler gives you for free.

---

<a name="interface-type"></a>
# 2. ⭐ `interface` vs `type`

Both describe shapes. The real differences:

| | `interface` | `type` |
|---|---|---|
| Declaration merging | ✅ two `interface Foo {}` blocks combine | ❌ duplicate `type` = compile error |
| Unions / tuples | ❌ can't express `'a' \| 'b'` | ✅ `type Status = 'idle' \| 'error'` |
| Extending | `extends` (can extend a class too) | `&` intersection |
| Object shapes | ✅ | ✅ |

```ts
interface User { id: string; name: string; }
interface User { email: string; }        // merges — User now has all three fields
// this is how you augment a third-party type, e.g. extending Express's Request

type Status = 'idle' | 'loading' | 'error';   // interface literally cannot express this
type ReadonlyUser = Readonly<User>;           // mapped types are type-only too
```

Practical rule: **`interface` for object shapes meant to be extended** — component `@Input` props, service contracts, anything a consumer might augment — **`type` for unions, tuples, and mapped/conditional types**, which `interface` can't express at all.

⚠️ In an Angular codebase specifically: `@Input() config: SomeInterface` reads the same either way, but if you're merging third-party ambient types (e.g. augmenting a library's exported interface) it has to be an `interface` — `type` can't do that.

---

<a name="interview"></a>
# 3. Interview Q&A

### Q: `any` vs `unknown`?

`unknown` is the type-safe `any` — it accepts any value but won't let you use it until you narrow it, so the compiler still protects you. `any` opts out of the type system entirely, and that unsafety is contagious to whatever it touches next.

### Q: When would you actually reach for `unknown` instead of `any`?

Anywhere a value enters the app without a shape guarantee — a `catch` clause, a third-party API response, `JSON.parse` output. You get the flexibility of `any` at the boundary without silently losing type safety the moment someone reads a property off it.

### Q: `interface` vs `type` — which do you default to?

`interface` for object shapes I expect to be extended or merged — component props, service contracts. `type` for anything `interface` structurally can't do: unions, tuples, mapped types. For a plain one-off object shape either works; the deciding factor is usually "will this need declaration merging or a union" rather than a strict rule.

### Q: Can a class `implement` a `type`?

Yes — `implements` works with both `interface` and an object-shaped `type` alias. It only breaks down if the `type` is a union or something else that isn't a plain object shape, since a class can't structurally satisfy a union.

---

<a name="summary"></a>
# 4. The 60-second summary

> *"`unknown` is the type-safe version of `any` — same flexibility to hold anything, but the compiler forces you to narrow it before you can use it, so unsafety doesn't leak into the rest of the code. `any` turns type checking off entirely and that's contagious. For `interface` vs `type`: they overlap for plain object shapes, but `interface` supports declaration merging and is the conventional choice for extensible shapes like component props, while `type` is required for unions, tuples, and mapped types that `interface` structurally can't express."*

---

## Connects to

- **[Part 08 — DI](08-dependency-injection-and-services.md):** decorators & metadata — the next TS topic this part still needs.
- **[Part 15 — Forms](15-forms.md):** typed reactive forms lean on generics, also still open here.
- **[React track](../React/):** props typing uses the same `interface`/`type` judgment call.

*— Part 00, in progress — updated as more TypeScript topics get explained in chat. —*
