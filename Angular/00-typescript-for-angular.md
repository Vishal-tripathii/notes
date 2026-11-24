# Angular Study Notes — Part 00

## TypeScript for Angular

> **Status:** ✅ complete — the TypeScript you actually need for Angular work and interviews: `any` vs `unknown`, `interface` vs `type`, classes & access modifiers, union & literal types, enums, generics, utility types, `?.` / `??` / `!`, decorators & metadata, and `strict` mode.
>
> **Roadmap:** [Part 00](00-ROADMAP.md) · **Priority:** ⭐⭐⭐⭐☆
>
> **Continues into:** [Part 08 — DI](08-dependency-injection-and-services.md) (decorators/metadata), [Part 11 — Signals](11-signals.md), [Part 15 — Forms](15-forms.md) (typed reactive forms all lean on generics).

---

## Table of Contents

1. [`any` vs `unknown`](#any-unknown) ⭐
2. [`interface` vs `type`](#interface-type) ⭐
   - [2.1 Classes & access modifiers](#classes)
   - [2.2 Union & literal types, narrowing](#unions) ⭐
   - [2.3 Enums — and why many teams use unions instead](#enums)
   - [2.4 Generics](#generics) ⭐
   - [2.5 Utility types](#utility) ⭐
   - [2.6 `?.`, `??` and the non-null assertion `!`](#null-ops)
   - [2.7 Decorators & metadata](#decorators)
   - [2.8 `strict` mode and Angular's strict templates](#strict)
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

### Q: Why do people prefer union types over enums?

A union like `'draft' | 'published'` is erased at compile time, so it adds no runtime code, works directly with string values from an API, and gives the same autocomplete and checking. Numeric enums also accept any number. Enums are still fine — `const enum` or string enums — but unions plus an `as const` object cover most cases.

### Q: `Partial`, `Pick`, `Omit`, `Record` — give a use for each.

`Partial<User>` for an update payload where every field is optional; `Pick<User, 'id' | 'name'>` for a list-row view; `Omit<User, 'password'>` for what the API returns; `Record<Status, string>` for a lookup table that must have a label for every status.

### Q: What does the `!` after a property mean?

The non-null assertion — "trust me, this isn't null or undefined." `@Input() user!: User` tells TypeScript the property will be set later. It removes the check rather than adding one, so if you're wrong you get a runtime error. Signal inputs with `input.required()` avoid needing it.

### Q: What does `strictTemplates` do?

It makes the Angular compiler type-check templates as strictly as TypeScript code — input types, event types, and null checks inside `@if` and pipes. It catches bugs like passing a string to a number input at build time. New projects have it on.

### Q: When would you actually reach for `unknown` instead of `any`?

Anywhere a value enters the app without a shape guarantee — a `catch` clause, a third-party API response, `JSON.parse` output. You get the flexibility of `any` at the boundary without silently losing type safety the moment someone reads a property off it.

### Q: `interface` vs `type` — which do you default to?

`interface` for object shapes I expect to be extended or merged — component props, service contracts. `type` for anything `interface` structurally can't do: unions, tuples, mapped types. For a plain one-off object shape either works; the deciding factor is usually "will this need declaration merging or a union" rather than a strict rule.

### Q: Can a class `implement` a `type`?

Yes — `implements` works with both `interface` and an object-shaped `type` alias. It only breaks down if the `type` is a union or something else that isn't a plain object shape, since a class can't structurally satisfy a union.

---

<a name="classes"></a>
# 2.1 Classes & access modifiers

Angular components, services, directives and pipes are all classes, so these show up everywhere.

```ts
export class EmployeeService {
  private cache = new Map<number, Employee>();   // only usable inside this class
  protected baseUrl = '/api/employees';          // this class + subclasses (and the component's TEMPLATE)
  readonly maxPageSize = 50;                     // can't be reassigned after construction
  #secret = 'x';                                 // JavaScript private field — private even at runtime

  constructor(private http: HttpClient) {}       // "parameter property": declares + assigns this.http
}
```

| Modifier | Who can use it | Note |
|---|---|---|
| `public` (default) | everyone | |
| `protected` | the class and subclasses | **Angular templates can read `protected` members** (v14+) — a good way to keep template-only fields out of the public API |
| `private` | only the class | TypeScript-only: removed at runtime. **Templates can't use `private` members** (compile error with strict templates) |
| `#field` | only the class | real JavaScript privacy ([javascript Part 09](../javascript/09-classes.md)) |
| `readonly` | can be set once | combine freely: `private readonly http = inject(HttpClient)` |

`implements OnInit` doesn't change behaviour — Angular calls `ngOnInit` if it exists — but it makes the compiler check you spelled it correctly.

---

<a name="unions"></a>
# 2.2 ⭐ Union & literal types, narrowing

```ts
type Status = 'idle' | 'loading' | 'success' | 'error';   // a value must be one of these strings
let s: Status = 'loading';
s = 'done';   // ❌ compile error
```

**Discriminated unions** — model states so impossible combinations can't exist:

```ts
type LoadState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };

function render(s: LoadState<User[]>) {
  switch (s.status) {
    case 'loading': return 'Loading…';
    case 'success': return `${s.data.length} users`;   // TypeScript KNOWS data exists here
    case 'error':   return s.message;
  }
}
```

Compare with `{ loading: boolean; data?: T; error?: string }`, which allows nonsense like loading **and** error at once.

**Narrowing** — TypeScript works out the type inside a check: `typeof x === 'string'`, `x instanceof HttpErrorResponse`, `'data' in x`, `if (x)`, and `@if (user(); as u)` in templates.

> 🧠 **Remember:** **model states as a union with a `status` field.** The compiler then stops you reading `data` before it exists.

---

<a name="enums"></a>
# 2.3 Enums — and why many teams use unions instead

```ts
enum Role { Admin = 'ADMIN', Editor = 'EDITOR', Viewer = 'VIEWER' }   // string enum
if (user.role === Role.Admin) { … }
```

- **Numeric enums** (`enum Dir { Up, Down }` → 0, 1) accept any number in older TS versions and are confusing in API data — prefer **string** enums.
- Enums **generate runtime code** (an object). Union types don't.
- To use an enum in a template, expose it on the component: `protected Role = Role;`.

The common modern alternative — a union plus an `as const` object, giving values *and* a type:

```ts
export const ROLES = ['ADMIN', 'EDITOR', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];          // 'ADMIN' | 'EDITOR' | 'VIEWER'
```

Both are fine; be consistent within a codebase.

---

<a name="generics"></a>
# 2.4 ⭐ Generics

A **generic** is a type parameter — "this works for any type `T`, and keeps track of which one."

> **Analogy 📦 — a labelled box.** `Box<Book>` and `Box<Shoe>` are the same box design, but the label tells you what comes out.

You already use them constantly in Angular:

```ts
this.http.get<Employee[]>('/api/employees');        // Observable<Employee[]>
signal<string | null>(null);                        // WritableSignal<string | null>
new FormControl<string>('', { nonNullable: true });  // FormControl<string>
new InjectionToken<AppConfig>('APP_CONFIG');
input.required<Employee>();
```

Writing your own:

```ts
// a typed wrapper used by every API service
interface Page<T> { items: T[]; nextCursor: string | null; }

getPage<T>(url: string): Observable<Page<T>> {
  return this.http.get<Page<T>>(url);
}

// constraints — T must have an id
function byId<T extends { id: number }>(list: T[], id: number): T | undefined {
  return list.find(x => x.id === id);
}
```

⚠️ `http.get<User>()` **doesn't check the response** — it's a type assertion. The server can send anything; validate untrusted data at runtime if it matters ([nodejs Part 14 §2](../nodejs/14-typescript-with-node.md) — same idea).

---

<a name="utility"></a>
# 2.5 ⭐ Utility types

Built-in types that **transform** another type:

| Utility | Gives you | Typical Angular use |
|---|---|---|
| `Partial<T>` | every property optional | PATCH payload, `patchValue` data |
| `Required<T>` | every property required | config after defaults are applied |
| `Readonly<T>` | can't assign properties | state objects you must not mutate |
| `Pick<T, 'a' \| 'b'>` | only those keys | a list-row view model |
| `Omit<T, 'password'>` | everything except those keys | what you send to the client; a create-form without `id` |
| `Record<K, V>` | object with keys `K`, values `V` | `Record<Status, string>` label lookup |
| `ReturnType<typeof fn>` | what a function returns | type a value from a factory |
| `NonNullable<T>` | removes `null`/`undefined` | after a guard |
| `Awaited<T>` | unwraps a Promise | result of an async loader |

```ts
type NewEmployee = Omit<Employee, 'id' | 'createdAt'>;            // the create form
type EmployeeUpdate = Partial<NewEmployee>;                       // the PATCH body
const statusLabel: Record<Status, string> = {                     // compile error if a status is missing ✅
  idle: 'Idle', loading: 'Loading…', success: 'Done', error: 'Failed',
};
```

---

<a name="null-ops"></a>
# 2.6 `?.`, `??` and the non-null assertion `!`

```ts
user?.address?.city            // undefined instead of crashing if user/address is missing
const size = pageSize ?? 20;   // fallback ONLY for null/undefined (0 stays 0) — javascript Part 04 §5
@Input() user!: User;          // "!" = definite assignment: "Angular will set this, trust me"
const el = this.ref()!.nativeElement;   // "!" = "not null here, trust me"
```

The `!` **removes** a check — it doesn't add one. If you're wrong, it crashes at runtime. Prefer real checks, or APIs that make it unnecessary: `input.required<User>()` instead of `@Input() user!: User`, and `viewChild.required(...)`.

In templates, `?.` works the same: `{{ user()?.name }}`.

---

<a name="decorators"></a>
# 2.7 Decorators & metadata

A **decorator** is a function that attaches information to a class or member: `@Component`, `@Injectable`, `@Input`, `@HostListener`.

```ts
@Component({ selector: 'app-card', template: '…' })   // metadata: "this class is a component, here's how"
export class CardComponent {}
```

What matters for interviews:
- In Angular, decorators are mostly **read by the compiler** (AOT, [Part 22](22-angular-internals.md)) and turned into static definitions on the class (`ɵcmp`, `ɵfac`) — they're not runtime magic.
- Angular uses TypeScript's **"experimental" decorators**, not the newer standard (TC39) decorators.
- The trend is **away from decorators**: `inject()` instead of constructor parameter decorators (`@Inject`, `@Optional`), and `input()`/`output()`/`viewChild()` functions instead of `@Input`/`@Output`/`@ViewChild`. Class decorators (`@Component`, `@Injectable`) remain.

---

<a name="strict"></a>
# 2.8 `strict` mode and Angular's strict templates

`"strict": true` in `tsconfig.json` turns on TypeScript's strict checks — most importantly **`strictNullChecks`** (null/undefined must be handled) and **`noImplicitAny`**. New Angular projects have it on.

Angular adds its own options in `angularCompilerOptions`:

```jsonc
"angularCompilerOptions": {
  "strictTemplates": true,                 // type-check templates like TS code
  "strictInjectionParameters": true,       // error if a dependency can't be resolved
  "strictInputAccessModifiers": true       // respect private/readonly on inputs
}
```

With **`strictTemplates`**, these become **build errors** instead of runtime surprises:

```html
<app-pager [pageSize]="'20'" />        <!-- ❌ string passed to a number input -->
<p>{{ user().address.city }}</p>       <!-- ❌ address may be undefined -->
<input (input)="search($event.target.value)" />   <!-- ❌ target may be null — cast or use a template ref -->
```

> 🧠 **Remember:** `strict` = TypeScript checks your **class**; `strictTemplates` = Angular checks your **template**. Keep both on.

The full TypeScript track lives in [`../typescript/`](../typescript/00-ROADMAP.md).

---

<a name="summary"></a>
# 4. The 60-second summary

> *"`unknown` is the type-safe version of `any` — same flexibility to hold anything, but the compiler forces you to narrow it before you can use it, so unsafety doesn't leak into the rest of the code. `any` turns type checking off entirely and that's contagious. For `interface` vs `type`: they overlap for plain object shapes, but `interface` supports declaration merging and is the conventional choice for extensible shapes like component props, while `type` is required for unions, tuples, and mapped types that `interface` structurally can't express."*

---

## Connects to

- **[Part 08 — DI](08-dependency-injection-and-services.md):** decorators & metadata — the next TS topic this part still needs.
- **[Part 15 — Forms](15-forms.md):** typed reactive forms lean on generics, also still open here.
- **[React track](../React/):** props typing uses the same `interface`/`type` judgment call.

*— End of Part 00 —*
