# JavaScript Study Notes — Part 29

## Strict Mode & Type Coercion — Deep Dive ⭐⭐⭐⭐☆

**Topics:** what strict mode changes and when it's on · how objects turn into primitives (`valueOf`, `toString`, `Symbol.toPrimitive`) · the real `==` rules step by step · the famous weird outputs (`[] == ![]`, `[] + {}`) explained.

> **Continues from:** [Part 00 §6–7](00-js-fundamentals.md) (coercion basics, `==` vs `===`). Part 00 gives the rules of thumb; this part gives the actual algorithm, so you can *work out* any "weird JavaScript" question instead of memorising it.

---

## 1. Strict mode — what it is and when it's on

> **Definition:** strict mode is a safer version of JavaScript that turns several silent mistakes into **errors** and removes a few confusing features.

**It's on automatically in:** every **ES module** (`import`/`export`, `<script type="module">`), every **class body**, and code compiled by most tools (TypeScript, Babel output). Otherwise you turn it on with `'use strict';` at the top of a file or function.

> 🧠 **Remember:** if your code uses `import` or `class`, you're **already in strict mode.**

**What changes:**

| Situation | Sloppy (old) mode | Strict mode |
|---|---|---|
| assign to an undeclared variable: `x = 5` | creates a **global** silently | `ReferenceError` ✅ |
| `this` in a plain function call `fn()` | the global object (`window`) | **`undefined`** |
| assign to a read-only / frozen property | silently ignored | `TypeError` |
| add a property to a non-extensible object | silently ignored | `TypeError` |
| `delete` an undeletable property | returns `false` | `TypeError` |
| duplicate parameter names `function f(a, a)` | allowed | `SyntaxError` |
| `with` statement, octal literal `010` | allowed | `SyntaxError` |
| `arguments` changes when a parameter changes | yes (they're linked) | no (separate) |
| `eval` creating variables in the outer scope | yes | no |

**Why it matters for interviews:** many "predict the output" answers change with strict mode — `this` in a detached function ([Part 03](03-this-call-apply-bind.md)), writes to frozen objects ([Part 04](04-objects.md)). When you answer, say which mode you're assuming.

---

## 2. How an object becomes a primitive (`ToPrimitive`)

When an object is used where a primitive is needed (`obj + 1`, `` `${obj}` ``, `obj == 'x'`), JavaScript converts it using a **hint** — what it would *like* to get:

| Hint | When | Tries in order |
|---|---|---|
| `'string'` | template literals, `String(obj)`, object as a property key | `toString()` → `valueOf()` |
| `'number'` | `-`, `*`, `/`, `<`, `>`, unary `+`, `Number(obj)` | `valueOf()` → `toString()` |
| `'default'` | `+` (binary) and `==` | like `'number'` — **except `Date`**, which uses `'string'` |

The first method that returns a **primitive** wins. For plain objects and arrays, `valueOf()` returns the object itself (not a primitive), so **`toString()` is what actually gets used**:

```js
String({});        // '[object Object]'
String([]);        // ''
String([1, 2]);    // '1,2'
String([null]);    // ''      — null/undefined elements become empty
```

**You can control it** with `Symbol.toPrimitive`:

```js
const money = {
  amount: 42,
  [Symbol.toPrimitive](hint) {
    return hint === 'string' ? `₹${this.amount}` : this.amount;
  },
};
`${money}`;      // '₹42'
money * 2;       // 84
money + 1;       // 43  (hint 'default' → number here)
```

---

## 3. The `+` operator

```
a + b:
  1. convert both to primitives (hint 'default')
  2. if EITHER is a string → convert both to strings and join
  3. otherwise → convert both to numbers and add
```

```js
1 + '2';          // '12'
'3' - 1;          // 2      — minus is always numeric
[] + [];          // ''     — '' + ''
[] + {};          // '[object Object]'
1 + null;         // 1      — null → 0
1 + undefined;    // NaN    — undefined → NaN
true + true;      // 2
'5' * '2';        // 10
```

`{} + []` typed **alone at the start of a console line** gives `0`: the `{}` is read as an empty code block, leaving `+[]` → `0`. Inside an expression (like `console.log({} + [])`) it's `'[object Object]'`.

---

## 4. The real `==` rules

`===` never converts. `==` follows these steps (simplified, but enough for every interview question):

```
x == y:
  1. Same type?                         → compare like ===
  2. null == undefined                  → true   (and they equal NOTHING else)
  3. number vs string                   → convert the string to a number
  4. boolean vs anything                → convert the BOOLEAN to a number first (true → 1, false → 0)
  5. object vs primitive                → convert the object to a primitive (ToPrimitive), then compare again
  6. otherwise                          → false
```

Step 4 is the one that surprises people:

```js
'1' == true;     // true  — true → 1, then '1' → 1
'2' == true;     // false — true → 1, '2' → 2
[] == false;     // true  — false → 0, [] → '' → 0
null == 0;       // false — rule 2: null only equals undefined
null >= 0;       // true 😱 — relational operators DON'T use the == rules; null → 0
```

### Working out `[] == ![]` (true!)

```
[] == ![]
1. ![] → false          (any object is truthy, so ![] is false)
2. [] == false          → rule 4: false → 0
3. [] == 0              → rule 5: [] → '' (toString)
4. '' == 0              → rule 3: '' → 0
5. 0 == 0               → true
```

> 🧠 **Remember the order:** **booleans become numbers first, objects become primitives, strings become numbers.** And `null` only equals `undefined`.

Which is exactly why the advice is: **use `===` always**, except `x == null` to check "null or undefined" in one go.

---

## 5. Truthy, falsy, and `!!`

The 8 falsy values: `false, 0, -0, 0n, '', null, undefined, NaN`. Everything else is truthy — including `'0'`, `'false'`, `[]`, `{}`, and `new Boolean(false)` (an object!).

```js
!!'0';            // true
!![];             // true
if ([]) { /* runs */ }
[] == false;      // also true 😵 — truthiness and == are DIFFERENT rules
```

That last pair is the whole lesson: **`if (x)` checks truthiness; `x == false` runs the `==` algorithm.** They don't agree.

---

## Interview Q&A

**Q: What does strict mode change?**
> It turns silent mistakes into errors — assigning to an undeclared variable throws instead of creating a global, writes to read-only properties throw — and `this` in a plain function call is `undefined` instead of the global object. It also bans things like `with` and duplicate parameter names. ES modules and class bodies are always strict.

**Q: Why is `[] == ![]` true?**
> `![]` is `false` because arrays are truthy. Then `[] == false`: the boolean becomes `0`, the array becomes the primitive `''` via `toString`, `''` becomes `0`, and `0 == 0` is true. It's a chain of `==` conversion rules — the reason to use `===`.

**Q: How does JavaScript convert an object to a primitive?**
> With a hint — string, number or default. For a number or default hint it calls `valueOf` then `toString`; for a string hint, `toString` then `valueOf`; the first primitive result wins. Plain objects and arrays return themselves from `valueOf`, so `toString` decides. `Symbol.toPrimitive` overrides all of it.

**Q: Why is `null >= 0` true but `null == 0` false?**
> Relational comparisons convert `null` to the number `0`, so `0 >= 0` is true. `==` has a special rule: `null` only equals `undefined` and nothing else.

**Q: When is `==` acceptable?**
> `x == null` — it's true for both `null` and `undefined`, which is often exactly the check you want. Everywhere else use `===`.

---

## Follow-ups (challenge questions)

- *Failure mode:* old code does `if (count == false)` to mean "no items." What happens when `count` is `'0'` from a form field, or `[]`?
- *Consistency:* the same file is loaded once as a classic `<script>` and once as a module. Which behaviours can differ, and how would you spot that in a bug report?

---

## Cheat Sheet

```
STRICT MODE: on in ES modules + classes (+ 'use strict')
  undeclared assign → ReferenceError · fn() this → undefined · frozen write → TypeError
  no with, no duplicate params, arguments not linked

ToPrimitive(hint): number/default → valueOf, toString · string → toString, valueOf
  objects/arrays: valueOf returns itself → toString wins
  String({}) '[object Object]' · String([]) '' · String([1,2]) '1,2'
  Symbol.toPrimitive overrides

a + b: either string → join strings · else numbers
  [] + [] = '' · [] + {} = '[object Object]' · 1 + null = 1 · 1 + undefined = NaN
  {} + [] alone in console = 0 (block + +[])

==: same type → === · null == undefined only · number vs string → number
    boolean → number FIRST · object → primitive · then repeat
  [] == ![] → true · '2' == true → false · null == 0 false but null >= 0 true

truthiness (if) ≠ == false · falsy: false 0 -0 0n '' null undefined NaN
USE === · except x == null
```

---

**Previous:** [Part 28 — Numbers & Dates](28-numbers-and-dates.md) · **Next:** [Part 30 — Events in Depth](30-events-in-depth.md)
