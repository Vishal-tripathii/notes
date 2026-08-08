# JavaScript Study Notes — Part 08

## Prototype & Inheritance ⭐⭐⭐⭐⭐

**Topics:** the Prototype · the Prototype Chain and property lookup · Constructor Functions · `Object.create()` · how `class` desugars to prototypal inheritance.

---

## 1. Every Object Has a Hidden Link

> **Definition:** the prototype is an internal `[[Prototype]]` reference every object holds to another object, from which it inherits properties and methods; JS's inheritance model is built entirely on this object-to-object linking, not on classes copying a blueprint.

Every object has this hidden link (exposed as `__proto__`, but you should use `Object.getPrototypeOf`/`Object.setPrototypeOf` instead of touching `__proto__` directly). When you access a property JS doesn't find on the object itself, it walks that link upward.

```js
const animal = { eats: true };
const rabbit = Object.create(animal);   // rabbit's [[Prototype]] IS animal
rabbit.jumps = true;

console.log(rabbit.jumps); // true — own property
console.log(rabbit.eats);  // true — not own, found by walking up to animal
console.log(rabbit.flies); // undefined — walked all the way to null, not found
```

## 2. The Prototype Chain — Lookup Algorithm, Step by Step

> **Definition:** the prototype chain is the linked sequence of objects formed by following each object's `[[Prototype]]` reference until reaching `null`; property lookup walks this chain in order and returns the first match, or `undefined` if the chain is exhausted.

```
rabbit.eats
  1. Does rabbit have an OWN property 'eats'? No.
  2. Look at rabbit.[[Prototype]] → animal. Does animal have OWN 'eats'? Yes → return true.

rabbit.flies
  1. rabbit own? No.  2. animal own? No.  3. animal.[[Prototype]] → Object.prototype. Own? No.
  4. Object.prototype.[[Prototype]] → null. Chain ends → undefined.
```
Every plain object's chain eventually reaches `Object.prototype` (which is where `toString`, `hasOwnProperty`, etc. actually live) then `null`.

## 3. Constructor Functions

> **Definition:** an ordinary function intended to be called with the `new` keyword, which creates a new object, links its prototype to the constructor's `.prototype` property, executes the function body with `this` bound to that new object, and returns it.

```js
function Animal(name) { this.name = name; }
Animal.prototype.speak = function () { console.log(`${this.name} makes a sound`); };

const rex = new Animal('Rex');
rex.speak(); // 'Rex makes a sound' — speak() isn't on rex itself, found via rex.[[Prototype]]
```
`new Animal('Rex')` does four things: creates a new empty object; sets its `[[Prototype]]` to `Animal.prototype`; calls `Animal` with `this` bound to that new object ([Part 03](03-this-call-apply-bind.md), Rule 1); returns the object (unless the constructor explicitly returns another object).

**Why methods belong on the prototype, not inside the constructor:** put `this.speak = function(){}` inside `Animal` instead, and every single instance gets its **own copy** of that function — wasteful at scale. Putting it on `Animal.prototype` means all 10,000 instances share one copy, found via the chain.

## 4. Prototypal Inheritance (Manual)

```js
function Dog(name, breed) {
  Animal.call(this, name);                        // 1. inherit properties — run parent ctor
  this.breed = breed;                                // against the new instance's `this`
}
Dog.prototype = Object.create(Animal.prototype);    // 2. link the chain: Dog.prototype's own
                                                        // prototype IS Animal.prototype
Dog.prototype.constructor = Dog;                     // 3. fix the constructor pointer (step 2
                                                        // overwrote it to point at Animal)

const rex = new Dog('Rex', 'Labrador');
rex.speak();      // 'Rex makes a sound' — found on Animal.prototype, two links up
console.log(rex instanceof Dog, rex instanceof Animal); // true, true
```
**Use `Object.create`, not `new Animal()`, for step 2** — `new Animal()` would actually run the parent constructor with no arguments and pollute `Dog.prototype` with real instance data it shouldn't have.

## 5. How `class` Desugars

```js
class Animal2 {
  constructor(name) { this.name = name; }
  speak() { console.log(`${this.name} makes a sound`); }
}
class Dog2 extends Animal2 {
  constructor(name, breed) { super(name); this.breed = breed; }
}
```
This compiles to *exactly* the constructor-function pattern above: `speak` lands on `Animal2.prototype`, `extends` sets up the `Object.create`-style chain, and `super(name)` is literally `Animal2.call(this, name)`. **`class` is syntax, not a new inheritance model** — it just hides the boilerplate and adds guardrails (can't call a class constructor without `new`, methods are non-enumerable by default, TDZ for the class binding). Full depth in [Part 09](09-classes.md).

## 6. `Object.create(null)`

```js
const dict = Object.create(null); // no prototype chain AT ALL
dict.toString; // undefined — doesn't even inherit from Object.prototype
```
Use case: an object meant purely as a key-value dictionary, where you never want `hasOwnProperty`/`toString`/`__proto__` to be reachable or risk colliding with a real data key like `{"toString": "..."}`. (`Map` is generally the better modern tool for this — [Part 15](15-map-set-weakmap-weakset.md).)

---

## Interview Q&A

**Q: How does the prototype chain resolve a property lookup, step by step?**
> The engine checks the object's own properties first. If not found, it follows the object's internal `[[Prototype]]` link to the next object up and checks there, repeating until it either finds the property or reaches `null` (the end of every chain, past `Object.prototype`), at which point it returns `undefined`.

**Q: Why is `class` "just" syntax over what constructor functions already did?**
> Because it compiles down to exactly the same mechanism — methods still land on `.prototype`, `extends` still sets up an `Object.create`-based chain, `super()` is still just calling the parent constructor against the new `this`. `class` doesn't introduce a new inheritance model; it standardizes the syntax and adds safety (TDZ, can't call without `new`, non-enumerable methods).

**Q: `Object.create(null)` and why would you want it?**
> It creates an object with no prototype at all — not even `Object.prototype` — so there's zero risk of a data key colliding with an inherited method name like `toString` or `constructor`, and no inherited baggage. Useful for objects used strictly as dictionaries, though `Map` usually wins today.

**Q: Predict:**
```js
function Foo() {}
Foo.prototype.value = 42;
const f1 = new Foo(), f2 = new Foo();
Foo.prototype.value = 100;
console.log(f1.value, f2.value);
f1.value = 7;
console.log(f1.value, f2.value);
```
> `100 100` — both instances read `value` off the *same* shared `Foo.prototype` object, so changing the prototype's value changes what both see. Then `7 100` — assigning `f1.value = 7` creates a new **own** property on `f1` that shadows the prototype's, leaving `f2` (and the prototype itself) untouched.

---

## Follow-ups (challenge questions)

- *Scale:* 100,000 instances of a class each needing a `formattedDate` getter — computed fresh from `this.date` each call vs stored on the instance at construction time — which belongs on the prototype and which can't, and why?
- *Failure mode:* `for...in` walks inherited enumerable properties too — what breaks if you `for...in` over an object built with `Object.create(somePolyfilledPrototype)` and don't guard with `hasOwnProperty`/`Object.hasOwn`?
- *Consistency:* mutating `Array.prototype` directly (e.g. adding a custom `Array.prototype.last = function(){...}`) — why is this considered dangerous in a shared codebase, even though it "works"?

---

**Previous:** [Part 07 — Destructuring & Spread/Rest](07-destructuring-and-spread-rest.md) · **Next:** [Part 09 — Classes](09-classes.md)
