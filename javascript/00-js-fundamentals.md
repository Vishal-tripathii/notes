# JavaScript Study Notes — Part 00

## JS Fundamentals ⭐⭐⭐⭐☆

**Topics:** Execution Context · Call Stack · Hoisting · TDZ · `var`/`let`/`const` · Primitive vs Reference · Type Coercion · `==` vs `===` · `typeof` · `Object.is()` · `null` vs `undefined` · `Symbol` · `BigInt`.

---

## 1. Execution Context & Call Stack

> **Definition — Execution Context:** the internal representation of the environment in which the currently running code is evaluated — it tracks what variables/functions exist, what `this` refers to, and a reference to the outer (lexical) environment.
> **Definition — Call Stack:** the data structure the engine uses to track function calls in progress — a LIFO stack of execution contexts, where whatever is on top is the code currently executing.

Before running code, the engine builds an **execution context** — a box holding what variables exist, what `this` is, and what outer scope it can see. Two phases:

```
CREATION PHASE                          EXECUTION PHASE
Scan without running.                   Run line by line.
Set up scope chain, `this`,        →    Assign real values,
hoist var/function decls.               execute statements.
```

This two-phase model is *why* hoisting, the TDZ, and closures all work the way they do.

The **call stack** is a LIFO stack of execution contexts — calling a function pushes a frame, returning pops it. Single stack = single-threaded = one thing runs at a time. Uncontrolled recursion overflows it (`RangeError: Maximum call stack size exceeded`).

```js
function multiply(a, b) { return a * b; }
function square(n) { return multiply(n, n); }
console.log(square(5)); // stack: [global] → [global,square] → [global,square,multiply] → pops back down
```

## 2. Hoisting

**The one rule:**

> **Nothing moves. The engine learns every declaration in a scope *before* it runs the first line of that scope — but only the declaration, never the assignment.**

"Hoisting" is a teaching word, not a mechanism. No code is physically lifted anywhere. It's just §1's creation phase, viewed from the outside.

The formal wording:

> **Definition:** the JS engine's behavior of processing variable and function declarations during the creation phase, before any code executes — making the declared name known throughout its scope from the very top, regardless of where in the code it's physically written.

### Start simple

```js
console.log(a);
var a = 5;
console.log(a);
```

This prints `undefined`, then `5`. Not a `ReferenceError` — the name `a` already exists on line 1.

### What actually happens

The engine runs the scope in two passes:

```
CREATION PHASE  (scan, don't run)        EXECUTION PHASE  (run line by line)
─────────────────────────────────        ────────────────────────────────────
sees:  var a                             console.log(a)   → undefined
sets:  a = undefined                     a = 5            → assignment finally runs
                                         console.log(a)   → 5
```

So the declaration `var a` is known from the top; the assignment `= 5` stays exactly where you wrote it. That split is the entire concept:

```
var a = 5;
│      │
│      └── assignment  → stays put, runs in the execution phase
└───────── declaration → known from the start of the scope
```

### Functions are different — the body comes too

```js
foo();                          // ✅ 'hi'
function foo() { console.log('hi'); }
```

A **function declaration** is hoisted *with its whole body*, so it's fully callable before its own line. That's why you can define helpers at the bottom of a file and call them at the top.

```
CREATION PHASE
sees:  function foo
sets:  foo = [the complete function]     ← not undefined
```

### The trap: function *expressions*

```js
bar();                                   // ❌ TypeError: bar is not a function
var bar = function () { console.log('hi'); };
```

Read it as `var bar = <something>`. The engine only sees `var bar` in the creation phase — the function on the right-hand side is a *value in an assignment*, and assignments don't run early.

```
CREATION PHASE            EXECUTION PHASE
bar = undefined     →     bar()   → calling undefined → TypeError
                          bar = function(){...}   (too late)
```

Note the error type: **`TypeError`, not `ReferenceError`**. `bar` exists — it just isn't a function yet. Interviewers ask for that distinction specifically.

### Summary table

| Declaration | What the creation phase sets | Usable before its line? |
|---|---|---|
| `function foo(){}` | binding + full body | yes, fully callable |
| `var` | binding, = `undefined` | yes, but value is `undefined` |
| fn expression via `var` | just the `var` (`undefined`) | no — `TypeError`, calling `undefined` |
| `let`/`const`/`class` | binding only, uninitialized | no — `ReferenceError`, the TDZ (§3) |

## 3. The Temporal Dead Zone

> **Definition:** the span, within a block, between the start of that block's scope and the point where a `let`/`const`/`class` declaration is actually evaluated — during which the binding exists (it's hoisted) but is uninitialized, and accessing it throws a `ReferenceError`.

`let`/`const` **are** hoisted (common trap: people say they aren't) — just left **uninitialized** from block start until their declaration line runs. Touching them in that window throws, rather than silently giving `undefined`.

```js
{
  console.log(x); // ReferenceError: Cannot access 'x' before initialization
  let x = 10;
}
```

**Why it exists:** turns a silent bug into a loud, immediate one, right where the misuse happens.

## 4. `var` vs `let` vs `const`

> **Definitions:** `var` — a **function-scoped**, hoistable variable declaration, initialized to `undefined` during hoisting, that can be redeclared and reassigned freely. `let` — a **block-scoped** variable declaration that can be reassigned but not redeclared in the same scope. `const` — a **block-scoped** variable declaration that must be initialized at declaration and cannot be reassigned afterward.

| | `var` | `let` | `const` |
|---|---|---|---|
| Scope | function | block | block |
| Redeclare | allowed | `SyntaxError` | `SyntaxError` |
| Reassign | allowed | allowed | `TypeError` |
| Global attach | yes (`window.x`) | no | no |

```js
for (var i = 0; i < 3; i++) setTimeout(() => console.log(i), 0); // 3,3,3 — one shared i
for (let j = 0; j < 3; j++) setTimeout(() => console.log(j), 0); // 0,1,2 — fresh binding/iteration
```

`const` locks the **binding**, not the contents: `const arr=[1]; arr.push(2)` is fine; `arr = [3]` throws.

**Rule:** default `const`, use `let` only when reassignment is needed, avoid `var` entirely.

## 5. Primitive vs Reference Types

> **Definition:** a **primitive** is an immutable value of one of JS's basic types (`string`, `number`, `boolean`, `undefined`, `null`, `symbol`, `bigint`), compared and copied **by value**. A **reference type** is any object — including arrays and functions — whose variable holds a pointer to a location on the heap, compared and copied **by reference**.

Primitives (`string`, `number`, `boolean`, `undefined`, `null`, `symbol`, `bigint`) copy **by value**. Objects/arrays/functions copy **by reference** (a pointer to the heap).

```js
let a = 10, b = a; b = 20; console.log(a);        // 10 — copy
let o1 = {x:1}, o2 = o1; o2.x = 99; console.log(o1.x); // 99 — same object

function mutate(o) { o.x = 'changed'; }
function reassign(o) { o = { x: 'new' }; }
const orig = { x: 'original' };
mutate(orig);   console.log(orig.x); // 'changed' — mutated through the reference
reassign(orig); console.log(orig.x); // still 'changed' — reassigning the param doesn't touch caller
```

**Precise phrasing:** JS is always pass-by-value; for objects, the value copied is the *reference itself*.

## 6. Type Coercion

> **Definition:** the automatic (implicit) or explicit conversion of a value from one data type to another — e.g. a string to a number, or an object to a primitive.

```js
1 + '1'     // '11'  — + does string concat if either side is a string
'5' - 1     // 4     — - always numeric
+'42'       // 42    — unary + explicitly coerces
[] + []     // ''    — both toString() to '', concat
1 + true    // 2     — true → 1
```

**Falsy values, all seven:** `false, 0, -0, 0n, '', null, undefined, NaN`. Everything else (`[]`, `{}`, `'0'`) is truthy.

## 7. `==` vs `===`

> **Definition:** `==` (loose/abstract equality) compares two values for equality **after** converting them to a common type if they differ. `===` (strict equality) compares both **value and type**, with no type conversion — two values are only equal if they're already the same type and value.

```js
1 == '1'            // true  — coerced
1 === '1'            // false
null == undefined     // true  — special-cased to each other only
null === undefined     // false
NaN == NaN               // false — NaN never equals anything, even itself
```

**Rule:** default `===`. Accepted exception: `x == null` as shorthand for "null or undefined."

## 8. `typeof` and its one famous lie

> **Definition:** `typeof` is a unary operator that returns a string naming the type of its operand (`'string'`, `'number'`, `'boolean'`, `'undefined'`, `'object'`, `'function'`, `'symbol'`, `'bigint'`).

```js
typeof null   // 'object'  ← the lie
typeof []     // 'object'  — use Array.isArray() to distinguish from plain objects
typeof 10n    // 'bigint'
```

`typeof null === 'object'` is a preserved 1995 engine bug (all-zero pointer got the object type tag). Permanent — fixing it would break the web.

## 9. `Object.is()` vs `===`

> **Definition:** `Object.is()` is a method that determines whether two values are the *same value*, using slightly stricter/different semantics than `===` specifically for `NaN` and signed zero (`+0`/`-0`).

```js
Object.is(NaN, NaN) // true  (=== gives false)
Object.is(0, -0)     // false (=== gives true)
```
Everything else, identical to `===`. Mostly relevant internally (React's bail-out equality check).

## 10. `null` vs `undefined`

> **Definition:** `undefined` is the automatic value of a variable that has been declared but not assigned, or of a missing property/function argument/return value — set by the **engine**. `null` is a primitive value that must be **explicitly assigned** to represent the intentional, deliberate absence of any object value.

`undefined` = engine says "not assigned yet" (unset var, missing arg, missing prop, no `return`). `null` = developer says "intentionally empty," always explicit, never a default.

## 11. `Symbol`

> **Definition:** a primitive data type introducing values that are guaranteed unique and immutable, typically used as non-colliding object property keys.

Guaranteed-unique primitive, even with identical descriptions.

```js
const id = Symbol('id');
const user = { name: 'V', [id]: 123 };
Object.keys(user);        // ['name'] — symbol keys hidden from normal enumeration
JSON.stringify(user);      // '{"name":"V"}' — hidden here too
```
Use case: collision-proof metadata keys; underlies `Symbol.iterator` ([Part 14](14-generators-and-iterators.md)).

## 12. `BigInt`

> **Definition:** a primitive numeric type that can represent integers with arbitrary precision, beyond the safe range a `Number` can represent exactly.

`Number` loses precision past `Number.MAX_SAFE_INTEGER` (2^53−1). `BigInt` (`10n`) stays exact but can't mix with `Number` in arithmetic without explicit conversion.

```js
Number.MAX_SAFE_INTEGER + 2; // 9007199254740992 — wrong, precision lost
9007199254740993n + 1n;       // 9007199254740994n — exact
```

---

## Interview Q&A

**Q: Walk through what happens when a function is called.**
> New execution context pushed onto the call stack. Creation phase scans the body, sets up the scope chain, `this`, and hoists `var`/`function` decls. Execution phase runs it with real values. Context pops on return.

**Q: Is `let` hoisted?**
> Yes — created in the creation phase like `var`, just left uninitialized until its declaration line, which is the TDZ. Touching it early throws instead of silently giving `undefined`.

**Q: Why does `typeof null` return `'object'`?**
> A bug from the original engine's type-tagging — `null`'s all-zero pointer accidentally matched the object tag. Known, permanent, can't be fixed without breaking the web.

**Q: `==` vs `===` — ever a reason to use `==`?**
> `===` by default. The one accepted exception is `x == null`, which catches both `null` and `undefined` in one check.

**Q: Are objects passed by reference?**
> Not exactly — JS is always pass-by-value; for objects the value copied is the reference itself. Mutating through it is visible to the caller; reassigning the parameter is not.

**Q: Predict:** `typeof NaN`, `NaN === NaN`, `Object.is(NaN,NaN)`, `[1] == 1`
> `'number'`, `false`, `true`, `true` (`[1]` → `'1'` → `1`).

---

## Follow-ups (challenge questions)

- *Scale/perf:* if a function recurses 50,000 levels deep, what actually breaks, and why doesn't `let`'s block scoping help there?
- *Consistency:* two modules both do `if (x == null)` vs `if (x === undefined)` — where would that difference actually change behavior in practice?
- *Failure mode:* `JSON.parse(JSON.stringify(obj))` is a common "deep clone" hack — what three kinds of data does it silently corrupt or drop, and when would that ship a real bug?

---

**Next:** [Part 01 — Scope & Closures](01-scope-and-closures.md)
