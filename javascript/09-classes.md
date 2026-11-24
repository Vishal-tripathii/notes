# JavaScript Study Notes — Part 09

## Classes ⭐⭐⭐⭐☆

**Topics:** constructor · static members · private fields (`#field`) · getters/setters · `extends` · `super`.

---

## 1. The Basics

> **Definition:** a `class` is syntax for defining a constructor function and its prototype methods together in one declaration — instances are created with `new`, and `class` bodies run in strict mode implicitly, with methods non-enumerable by default.

```js
class Account {
  #balance = 0;                        // private field — truly inaccessible outside the class
  static bankName = 'JS Bank';           // static — lives on the class itself, not instances
  static #accountCount = 0;               // private static

  constructor(owner) {
    this.owner = owner;
    Account.#accountCount++;
  }

  deposit(amount) { this.#balance += amount; return this.#balance; }

  get balance() { return this.#balance; }        // getter — accessed like a property
  set balance(value) {                              // setter — assigned like a property
    if (value < 0) throw new Error('Balance cannot be negative');
    this.#balance = value;
  }

  static getAccountCount() { return Account.#accountCount; } // called on the CLASS, not an instance
}

const acc = new Account('V');
acc.deposit(100);
console.log(acc.balance);      // 100 — via the getter, looks like a plain property read
acc.balance = -5;                // throws — via the setter
// console.log(acc.#balance);     // SyntaxError — see the warning below
```

> ⚠️ **`acc.#balance` outside the class is a *parse-time* error.** The engine checks private names before running anything, so if that line is in the file, **the whole file refuses to run** — not even the lines above it execute. It's not a runtime error you can `try/catch`. (To *test* whether an object has a private field from inside the class, use `#balance in obj`.)

## 2. `#field` vs the Old Closure/Underscore Conventions

> **Definition — Private field (`#field`):** a class member prefixed with `#`, whose name is only valid and resolvable inside the lexical body of the class that declared it — accessing or even *mentioning* it from outside is a `SyntaxError`, enforced by the engine itself.
> **Definition — Static member:** a property or method declared with `static`, attached to the class/constructor function itself rather than to individual instances.

| | `_balance` (convention) | closure (module pattern) | `#balance` (real private) |
|---|---|---|---|
| Actually enforced? | no — just a "please don't touch" signal | yes | yes |
| Accessible from outside? | yes, nothing stops you | no | no, `SyntaxError` on access attempt |
| Accessible from subclasses? | yes | n/a | no — even subclasses can't see a parent's `#field` |

`#field` is the modern, engine-enforced version of what closures ([Part 01](01-scope-and-closures.md)) simulated manually.

## 3. `extends` and `super`

> **Definition — `extends`:** class syntax that creates a derived class whose prototype chain links to the parent class's prototype, inheriting its instance methods.
> **Definition — `super`:** inside a constructor, `super(...)` calls the parent class's constructor against the instance being built; inside a method, `super.method()` calls the parent class's version of that method.

```js
class Animal {
  constructor(name) { this.name = name; }
  speak() { console.log(`${this.name} makes a sound`); }
}
class Dog extends Animal {
  constructor(name, breed) {
    super(name);          // MUST be called before using `this` — runs the parent constructor
    this.breed = breed;     // against the new instance being constructed
  }
  speak() {
    super.speak();          // calls the PARENT's version of the overridden method
    console.log(`${this.name} barks`);
  }
}
new Dog('Rex', 'Lab').speak();
// 'Rex makes a sound'
// 'Rex barks'
```
**What `super()` actually does under the hood:** runs the parent class's constructor, and **the parent constructor is the one that creates the object** — then `this` in the child refers to it. It's *similar* to `Animal.call(this, name)` in the old pattern ([Part 08](08-prototype-and-inheritance.md)), but not identical: with `.call`, the child had already created `this`. That difference is why extending built-ins (`Array`, `Error`, `Map`) only works properly with `class`. In a derived class, `this` doesn't exist until `super()` runs — touching it before that throws a `ReferenceError`.

---

## Interview Q&A

**Q: What does `super()` actually do?**
> It runs the parent class's constructor, which creates and initializes the object; after it returns, `this` in the child refers to that object. It's like `Parent.call(this, ...args)` in the old pattern, except the parent creates `this` instead of the child — which is why `class X extends Array` works and the old trick didn't. In a subclass, any reference to `this` before `super()` throws a `ReferenceError`.

**Q: How is `#field` different from the `_field` naming convention?**
> `_field` is purely a social convention — nothing stops external code from reading or writing it. `#field` is enforced by the engine itself: accessing it from outside the class is a `SyntaxError`, not just bad practice, and it's not even visible to subclasses.

**Q: Getters/setters — why use them instead of a plain property?**
> They let you run logic (validation, computed values, lazy calculation) while keeping the call site looking like a normal property access (`acc.balance` instead of `acc.getBalance()`). Common for validating writes (reject a negative balance) or exposing a private field read-only (getter with no matching setter).

**Q: Predict:**
```js
class Counter {
  #count = 0;
  increment() { return ++this.#count; }
}
class Sub extends Counter {}
const s = new Sub();
console.log(s.increment(), s.increment());
console.log(s.#count);
```
> **Nothing prints at all** — a `SyntaxError` is reported before the code runs. Private names are checked when the file is *parsed*, and `s.#count` outside `Counter` is invalid, so the whole script is rejected. Remove that last line and you get `1 2`: `#count` is private to `Counter`, so even a subclass can only use it through inherited methods like `increment()`.

---

## Follow-ups (challenge questions)

- *Consistency:* two subclasses both override `speak()` but only one remembers to call `super.speak()` first — what's the actual risk of forgetting, beyond "the parent behavior doesn't run"?
- *Failure mode:* a getter does an expensive computation (e.g. re-sorts a large array) every time it's read, and it's read in a hot render loop — what's the fix, and does it still look like "just a property" to the caller afterward?

---

**Previous:** [Part 08 — Prototype & Inheritance](08-prototype-and-inheritance.md) · **Next:** [Part 10 — Event Loop & Concurrency Model](10-event-loop-and-concurrency-model.md)
