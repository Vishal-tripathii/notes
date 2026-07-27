# Node.js Study Notes — Part 1

## How JavaScript Actually Runs Your Code

> **Format:** Q&A — my prompts are the questions, the explanations are the answers. Written the way you'd *say* it in an interview, not as reference notes.
>
> **The framing that makes all of this click:** these aren't ten separate topics. They're **one story told at two levels.**
>
> - **The engine** (§1–7) — how your code actually runs, line by line.
> - **The scheduler** (§8–14) — how Node decides what runs *next*, when things take time.
>
> Almost every confusing JavaScript moment comes from mixing those two levels up.

```
┌───────────── THE ENGINE — how your code runs ──────────────┐
│  Execution Context → Call Stack → Scope → Closures         │
│  Hoisting → this → Prototypes                              │
└────────────────────────────────────────────────────────────┘
                          ↕  nothing crosses until the stack is EMPTY
┌───────────── THE SCHEDULER — what runs next ───────────────┐
│  Event Loop → Microtasks → Callback Queue                  │
└────────────────────────────────────────────────────────────┘
```

---

## Table of Contents

**Part A — The Engine**
1. [Execution Context](#ec)
2. [Call Stack](#stack)
3. [Lexical Scope](#scope)
4. [Closures](#closures) ⭐
5. [Hoisting & the TDZ](#hoisting)
6. [`this`](#this) ⭐
7. [Prototype Chain](#proto)

**Part B — The Scheduler**

8. [Single-threaded vs multi-threaded](#threads)
9. [The paradox: how is one thread async?](#paradox) ⭐
10. [The Event Loop](#loop)
11. [The two queues](#queues) ⭐
12. [What actually blocks](#blocking)
13. [Concurrency vs parallelism](#conc)
14. [Escaping the single thread — Workers](#escape)

**Part C**

15. [Interview Questions & Answers](#interview)
16. [Cheat Sheet](#cheatsheet)

---

# PART A — THE ENGINE

<a name="ec"></a>
# 1. Execution Context

## The problem it solves

When JavaScript is about to run some code, it needs to know three things: **what variables exist**, **what `this` refers to**, and **what outer code it can see**. It has to figure that out *before* running anything.

**An execution context is the box holding those answers.** One gets created every time code is about to run.

There are two kinds you'll care about:
- **Global context** — created once, when your file starts
- **Function context** — created **every single time a function is called**. Call a function three times, and three separate contexts exist, each with its own copy of the local variables.

## The part that explains everything: two phases

Here's the thing to actually remember. Creating a context happens in **two passes**, not one:

```
       ┌─────────── PHASE 1: CREATION ───────────┐
       │  Read through the code WITHOUT running  │
       │  it, and note down:                     │
       │    • what variables are declared        │
       │    • what functions are declared        │
       │    • what `this` will be                │
       │    • which outer scope this connects to │
       └─────────────────────────────────────────┘
                          ↓
       ┌─────────── PHASE 2: EXECUTION ──────────┐
       │  NOW run it line by line and actually   │
       │  assign the values                      │
       └─────────────────────────────────────────┘
```

**Why this matters:** JavaScript knows every variable in a scope *before* it runs the first line. That single fact explains hoisting, the temporal dead zone, and how closures capture variables — all three come back to this.

> **If you remember one thing from §1:** JavaScript reads your code twice — once to take inventory, once to run it.

---

<a name="stack"></a>
# 2. Call Stack

## What it is

The call stack is how JavaScript keeps track of **where it currently is** — which function is running right now, and where to return when it finishes.

It's a **stack**, so it's **LIFO — Last In, First Out**. Picture a stack of plates: you add to the top, you take from the top. Every time you **call** a function, JavaScript **pushes a frame** onto the top — that frame is the function's execution context from §1: its arguments, its local variables, and the address to return to. When the function **returns**, its frame is **popped** off. **Whatever's on top is what's executing right now.**

```js
function first()  { second(); console.log('first done'); }
function second() { third();  console.log('second done'); }
function third()  { console.log('third done'); }
first();
```

Watch the stack push and pop:

```
 call first()      first calls       second calls      third returns,
                   second            third             then second, then first
 ┌─────────┐       ┌─────────┐       ┌─────────┐       ┌─────────┐
 │         │       │         │       │ third   │  →    │         │
 │         │       │ second  │       │ second  │       │ second  │
 │ first   │       │ first   │       │ first   │       │ first   │
 │ GLOBAL  │       │ GLOBAL  │       │ GLOBAL  │       │ GLOBAL  │
 └─────────┘       └─────────┘       └─────────┘       └─────────┘
```

Output: `third done` → `second done` → `first done`. **The innermost call finishes first** — nothing below it on the stack can return until the frame above it pops. Each paused frame just sits there, remembering exactly where to resume.

## Only ONE stack

**JavaScript has exactly one call stack**, so it does one thing at a time — it's single-threaded by nature. There's no "meanwhile, over here"; if the stack is busy, everything else waits. This single fact is what the entire second half of this note — the event loop, async — is built on.

## Stack overflow (the favorite follow-up)

The stack has a **finite size**. If functions keep pushing frames without popping — the classic case being **recursion with no base case** — it fills up and you get:

```js
function boom() {
  boom();          // calls itself forever, never returns
}
boom();            // ❌ RangeError: Maximum call stack size exceeded
```

Each `boom()` pushes a new frame; none ever pop → overflow. Room is finite — roughly 11,000 frames. It's about how **deep** your calls go, not how much data you hold, and it's a **normal, catchable error**. (The site *Stack Overflow* is literally named after this.)

> 💡 **The related follow-up — stack vs heap:** the *stack* holds frames and primitives and tracks execution order; the *heap* is the unstructured memory where **objects** live. Variables on the stack hold **references** that point into the heap. That's why a returned function can keep an object alive after its frame is gone — see §4.

## How it connects to async / the event loop

This is the part interviewers really want. Since there's **one** call stack, JS can't just "wait" on a slow task — a timer, an API call — because that would **block** the stack and freeze the page. So async work is handled **off** the stack:

```
Call Stack ──(hands off async task)──▶ Web / Node APIs (timer, fetch, I/O)
                                              │  when done, the callback is queued
                                              ▼
                                        Callback / Microtask Queue
                                              │
     Event Loop: "is the call stack EMPTY? → push the next queued callback"
```

The event loop's whole job: **when the stack is empty, take the next callback from the queue and push it on.** So async callbacks never run while something is on the stack — which is exactly why `setTimeout(fn, 0)` still runs *after* your current synchronous code. The full mechanism — who does the waiting, and the two queues — is §9–11.

## Interview one-liner

> "The call stack is a LIFO structure the engine uses to track function execution — calling a function pushes a frame, returning pops it, and the top frame is what's running. There's a **single** stack, so JavaScript does one thing at a time; long-running work blocks it, which is why async tasks are offloaded and their callbacks are pushed back on only once the stack is empty. Exceed the size limit — usually infinite recursion — and you get a stack overflow."

## Quick Q&A to expect

### Q: Why is JavaScript single-threaded?
> "Because it has one call stack — one thing at a time. The upside is no locks and no race conditions (§8); the downside is CPU-heavy work blocks everything (§12)."

### Q: What causes a stack overflow?
> "Too many frames pushed without returning — almost always recursion with no base case. It's about call *depth*, not data size, and it's a catchable `RangeError`."

### Q: How does async work if there's only one stack?
> "The slow work is offloaded to libuv or the OS, so the stack doesn't wait. When it finishes, the callback is queued, and the **event loop pushes it back onto the stack only once the stack is empty** — which is why `setTimeout(fn, 0)` still runs after your current synchronous code (§9–11)."

### Q: Stack vs heap?
> "The stack holds function frames and primitives and tracks execution order; the heap is unstructured memory where objects live. Stack variables hold references pointing into the heap — which is what lets a closure keep an object alive after its frame pops (§4)."

---

<a name="scope"></a>
# 3. Lexical Scope

## What "lexical" means

**Lexical means "as written."** Where a function can look for variables is decided by **where you physically typed it in the file** — not by where it gets called from. It's fixed when you write the code and never changes.

```js
const name = 'global';

function outer() {
  const name = 'outer';

  function inner() {
    console.log(name);      // which `name` does this find?
  }

  return inner;
}

const fn = outer();
fn();                       // 'outer'  ← not 'global'
```

**`fn()` is called from the global scope, where `name` is `'global'`.** But it printed `'outer'`.

**Because `inner` was *written* inside `outer`.** When it needs a variable it can't find locally, it looks outward through the scopes it was *written* inside:

```
   inner's scope   →  no `name` here
        ↓
   outer's scope   →  found it! 'outer'   ← stops here
        ↓
   global scope    →  never even reached
```

That path is called the **scope chain**. Lookup goes **outward only**, and stops at the **first match**. If nothing has it, you get a `ReferenceError`.

> ⭐ **Hold onto this, because §6 is its exact opposite.** Scope is decided by **where a function is written**. `this` is decided by **how a function is called**. Mixing those two up causes more JavaScript confusion than anything else.

---

<a name="closures"></a>
# 4. ⭐ Closures

## The plain-language definition

**A closure is a function that still remembers the variables from where it was created, even after that place has finished running.**

It isn't a feature you turn on. It's what automatically happens when you combine §3 (functions look outward for variables) with the fact that functions can be returned and stored.

```js
function counter() {
  let count = 0;

  return function increment() {
    count++;
    return count;
  };
}

const c1 = counter();
console.log(c1());   // 1
console.log(c1());   // 2
console.log(c1());   // 3
```

## Why this should surprise you

**`counter()` finished on the very first line.** Its execution context was created, it ran, it returned. It's gone.

So `count` should be gone too. **It isn't.** It's still there, still incrementing.

Here's what actually happened:

```
   CALL STACK                     HEAP (longer-term memory)
   ┌──────────┐            ┌────────────────────────┐
   │          │            │  counter's variables   │
   │  (empty) │            │     count: 3           │◀── c1 still points here
   └──────────┘            └────────────────────────┘
   counter's frame
   was removed ✔
```

**The stack frame was discarded, but the variables weren't** — because the function you returned still points to them. JavaScript can't clean up something that's still being referenced.

## Each call makes a fresh one

```js
const c1 = counter();
const c2 = counter();
c1(); c1(); c1();     // 3
c2();                 // 1  ← completely separate
```

Every call to `counter()` creates a **new** execution context with a **new** `count`. `c1` and `c2` are looking at different boxes.

## The classic gotcha, explained

```js
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0);
}
// prints 3, 3, 3
```

**Why?** `var` creates **one single `i`** shared by the whole loop. The three callbacks all point at that same `i`. By the time they run — after the loop has finished — `i` is `3`. All three print `3`.

```js
for (let i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0);
}
// prints 0, 1, 2
```

**`let` creates a brand new `i` for each iteration**, so each callback captured a different one.

> ⭐ **The lesson, and it's the sentence to say in an interview: closures capture the *variable*, not a snapshot of its value.** What matters is what the variable holds **when the function runs**, not when it was created.

**Where you'll actually meet closures:** private data (a variable only the returned functions can touch), factory functions, middleware that captures config, and every callback that uses something from its enclosing request handler.

---

<a name="hoisting"></a>
# 5. Hoisting & the TDZ

## What hoisting really is

You'll hear "declarations are moved to the top." **Nothing moves.** Hoisting is just §1's creation phase seen from the outside: JavaScript noted every declaration *before* running line one, so they seem to exist early.

```js
console.log(a);      // undefined
console.log(b);      // ReferenceError: Cannot access 'b' before initialization
console.log(greet);  // [Function: greet]
console.log(arrow);  // undefined

var a = 1;
let b = 2;
function greet() {}
var arrow = () => {};
```

**Four different results.** Here's why each:

- **`var a`** — during creation, JavaScript registered `a` and set it to `undefined`. So it exists, with no useful value yet.
- **`let b`** — registered too, but deliberately left **uninitialized**. Touching it is an error until the `let` line runs.
- **`function greet()`** — function *declarations* are stored completely during creation. Fully usable before their line.
- **`var arrow`** — it's a `var` holding a function. The variable hoists (as `undefined`); the function doesn't exist until that line executes.

| Declaration | Exists early? | Set to | Usable before its line? |
|---|---|---|---|
| `var` | yes | `undefined` | yes, but you get `undefined` |
| `let` / `const` | yes | nothing | ❌ ReferenceError |
| `function` declaration | yes | the whole function | ✅ yes |
| arrow / function expression | follows its `var`/`let` | — | ❌ |
| `class` | yes | nothing | ❌ |

## The TDZ

The **Temporal Dead Zone** is the gap between entering a scope and reaching the `let`/`const` line. The variable **exists** but reading it is illegal.

```
{
   ← you enter the block. `b` exists but is unusable ─┐
   console.log(b);   // ReferenceError                │  TDZ
   let b = 2;        ←────────────────────────────── ends here
   console.log(b);   // 2  ✅
}
```

**How do we know it "exists"?** Because of the error message. An undeclared variable gives *"b is not defined"*. A TDZ variable gives *"Cannot access 'b' before initialization"* — JavaScript knows it's there, and is refusing.

> **Practical rule: `const` by default, `let` when you need to reassign, never `var`.** The TDZ turns a silent `undefined` bug into a loud crash — that's a feature, not an inconvenience.

---

<a name="this"></a>
# 6. ⭐ `this`

## The one rule

**`this` is not decided by where a function is written. It's decided by how it is called.** Look at the **call site** — the exact line doing the calling — and apply these in order. First match wins.

```
1. new Foo()               → this = the brand new object
2. foo.call(x) / .bind(x)  → this = whatever you explicitly passed
3. obj.foo()               → this = obj  (whatever is left of the dot)
4. foo()                   → this = undefined (strict) / globalThis (sloppy)

ARROW FUNCTIONS: none of these apply. An arrow has NO `this` of its own —
it uses whatever `this` was where it was WRITTEN. (§3 rules, not these.)
```

**Rule 3 is the one you use daily: look for the dot, and take whatever is to its left.**

```js
const user = {
  name: 'Ada',
  greet() { console.log(this.name); }
};

user.greet();     // 'Ada'   ← rule 3: `user` is left of the dot
```

## Why it "breaks"

```js
const fn = user.greet;
fn();                          // undefined  ⚠️
setTimeout(user.greet, 0);     // undefined  ⚠️
```

**In both cases there's no dot at the call site.** `fn()` is a bare call → rule 4 → `this` is `undefined`.

The subtle part: `user.greet` doesn't mean "the greet that belongs to user." **It just gets the function**, exactly like reading any property. The connection to `user` isn't stored in the function — it only exists at the moment you call it *with the dot*. Take the function out of the object and the connection is gone.

> ⭐ **The sentence to remember: `this` is lost the moment you detach a method from its object.** Passing `obj.method` as a callback detaches it.

**Two fixes:**
```js
setTimeout(() => user.greet(), 0);      // ✅ the dot survives — arrow calls it properly
setTimeout(user.greet.bind(user), 0);   // ✅ bind permanently attaches `this`
```

## Where arrows genuinely save you

```js
class Timer {
  constructor() { this.count = 0; }

  startBroken() {
    setInterval(function () {
      this.count++;      // ❌ setInterval calls it bare → rule 4 → not the Timer
    }, 1000);
  }

  startFixed() {
    setInterval(() => {
      this.count++;      // ✅ arrow has no `this`, so it uses startFixed's — the Timer
    }, 1000);
  }
}
```

> ⚠️ **The reverse is also true: never use an arrow as an object method.** It would capture whatever `this` was outside the object — usually the module — not the instance. Arrows are right for callbacks, wrong for methods.

---

<a name="proto"></a>
# 7. Prototype Chain

## The idea

JavaScript has no classes underneath. It has **objects that are linked to other objects.** When you ask an object for something it doesn't have, it asks the object it's linked to, and so on up the line.

```js
function Dog(name) { this.name = name; }
Dog.prototype.speak = function () { console.log(this.name + ' barks'); };

const rex = new Dog('Rex');
rex.speak();          // 'Rex barks'
```

`rex` has no `speak` of its own. Look at what happens:

```
   rex                       Dog.prototype             Object.prototype
 ┌──────────┐              ┌────────────────┐         ┌────────────────┐
 │ name:Rex │─────linked──▶│ speak: fn      │────────▶│ toString: fn   │──▶ null
 └──────────┘   to         │ constructor    │         │ hasOwnProperty │
                           └────────────────┘         └────────────────┘
  1. look here             2. found it! stop           3. would look here next
```

`rex.toString()` works too — that's found further up on `Object.prototype`. And `rex.fly()` walks the whole chain, finds nothing, hits `null`, and throws.

## The naming confusion, cleared up

Two similarly-named things trip everyone up:

- **`__proto__`** — *"the object I'm linked to."* Every object has one.
- **`.prototype`** — a property that **only exists on functions**. It's *"the object that instances made with `new` will be linked to."*

```js
rex.__proto__ === Dog.prototype;   // true — that's the whole relationship
```

**So `.prototype` isn't the function's own prototype. It's the prototype it hands out.**

## What `new` does — four steps

```js
const rex = new Dog('Rex');
```
1. Creates an empty object `{}`
2. Links it to `Dog.prototype`
3. Runs `Dog` with `this` set to that new object (so `this.name = name` works)
4. Returns it

## `class` is the same thing with nicer syntax

```js
class Dog {
  constructor(name) { this.name = name; }
  speak() { console.log(this.name + ' barks'); }   // goes on Dog.prototype
}
```
Identical machinery. `class` is sugar — worth saying explicitly in an interview.

> **Why any of this matters practically: methods live on the prototype, so 10,000 instances share ONE copy of each method** instead of each carrying its own. That's a real memory difference, and it's why `extends` works — it just links prototypes together.

---

# PART B — THE SCHEDULER

<a name="threads"></a>
# 8. Single-threaded vs multi-threaded

## Start with what a thread is

A **process** is a running program — `node app.js` is one. A **thread** is a worker inside it, following one list of instructions in order.

**A thread has exactly one call stack.** That's the connection back to §2: *one thread = one call stack = one thing at a time.*

```
   PROCESS (node app.js)
   ┌──────────────────────────────────────────┐
   │  shared memory (objects, closures)       │
   │                                          │
   │  ┌─ Thread A ─┐   ┌─ Thread B ─┐         │
   │  │ call stack │   │ call stack │         │  ← own stack each,
   │  └────────────┘   └────────────┘         │     shared memory
   └──────────────────────────────────────────┘
```

```
SINGLE-THREADED:  ─[task A]─[task B]─[task C]─▶   one at a time, in order

MULTI-THREADED:   ─[task A]──────▶
                  ─[task B]──────▶    all three at the same instant
                  ─[task C]──────▶    (needs 3 CPU cores)
```

| | Single-threaded | Multi-threaded |
|---|---|---|
| Uses multiple CPU cores | ❌ | ✅ |
| Shared-memory bugs | **impossible** | race conditions, deadlocks |
| Needs locks | never | yes, and they're hard |
| Good at | lots of **waiting** (I/O) | heavy **computing** |
| Examples | Node, Redis, Nginx | Java, Go, C++ |

## Why single-threaded is a feature, not a limitation

This is the part worth being able to explain, because it reframes the whole thing.

In a multi-threaded language, this line is **broken**:

```java
count = count + 1;    // Java, with two threads
```

That's really *three* steps: read `count`, add one, write it back. If two threads interleave between the read and the write, **one increment vanishes.** That's a **race condition** — and it's random, so it passes your tests and fails in production at 3am. Fixing it needs locks; locks bring deadlocks.

In JavaScript, this whole class of bug **cannot exist**:

```js
count = count + 1;    // ✅ always safe
```

Because the event loop can never interrupt code that's running (§10), your function always finishes before anything else starts.

> ⭐ **You trade the ability to use multiple cores for a guarantee of sanity: no locks, no race conditions, ever.** That's the deal.

## Interview one-liner

> "A thread is a worker with one call stack, so single-threaded means one thing at a time and multi-threaded means several at once across CPU cores. Multi-threading gives you parallelism but also shared-memory race conditions that need locks; single-threading gives up multi-core execution but eliminates that whole class of bugs — no locks, no races. Node's **JavaScript execution** is single-threaded, which is why it's simple and safe, but the **runtime** isn't: libuv uses a thread pool and the OS to do the waiting off-thread. So it's **single-threaded execution on a multi-threaded runtime** — ideal for I/O-bound work, weak for CPU-bound work."

## Q&A to expect

### Q: Is Node single-threaded?
> "The JavaScript execution is — one call stack, one thing at a time. The runtime isn't: libuv has a 4-thread pool and the OS handles network waiting (§9). The line to say is 'single-threaded execution, multi-threaded runtime.'"

### Q: Why is single-threaded a good thing?
> "No shared-memory race conditions and no locks, so a whole class of random production bugs simply can't exist, and the code is simpler. And for I/O-bound servers you don't need threads anyway, because the waiting is offloaded off-thread."

### Q: What's the downside of single-threaded?
> "You can't use multiple CPU cores for your JavaScript, and one CPU-heavy task blocks the entire process — every other user freezes until it finishes (§12)."

### Q: How does Node do many things at once then?
> "Concurrency, not parallelism (§13) — it interleaves many *waiting* tasks on one thread, and the actual I/O waiting happens off-thread in libuv or the OS. It handles thousands of connections at once but doesn't *compute* many at once."

### Q: How do you get true parallelism in Node?
> "`worker_threads` to move CPU-heavy work off the main thread, or `cluster` to run one process per core for more throughput (§14). Cluster divides blocking damage rather than fixing it."

---

<a name="paradox"></a>
# 9. ⭐ The paradox: how is one thread async?

## The thing that should bother you

```js
console.log('1');
fs.readFile('huge.txt', () => console.log('3'));   // takes 500ms
console.log('2');
// prints 1, 2, then 3 — and the app stayed responsive the entire 500ms
```

**If there's only one thread, who was watching that file for 500ms?** The one thread was busy printing `2` and carrying on. Somebody else did the waiting.

## The answer: Node is more than JavaScript

Node isn't one thing. It's **V8** (which runs your JavaScript) plus **libuv** (a C library that does the input/output). And libuv is very much multi-threaded.

```
┌──────────────────── NODE.JS PROCESS ───────────────────────────┐
│                                                                │
│   ┌──────────────────────┐      ┌─────────────────────────┐    │
│   │  V8                  │      │  libuv (C)              │    │
│   │  ── ONE THREAD ──    │      │  ── MANY THREADS ──     │    │
│   │                      │─────▶│                         │    │
│   │  your JavaScript     │ hand │  • the event loop       │    │
│   │  one call stack      │  off │  • a pool of 4 threads  │    │
│   │                      │◀─────│  • OS-level waiting     │    │
│   └──────────────────────┘ call └─────────────────────────┘    │
│         ↑                  back                                │
│    YOUR CODE IS HERE                THE WAITING IS HERE        │
└────────────────────────────────────────────────────────────────┘
```

> ⭐ **The sentence to say: "My JavaScript runs on one thread. The *waiting* doesn't."** Node hands slow work to libuv or the operating system, keeps going, and picks up the result later.

## The analogy that makes it stick 🍽️

**One waiter, many tables.**

- ❌ **A blocking waiter:** takes table 1's order, walks into the kitchen, and **stands there watching the food cook for 20 minutes.** Then delivers it, then finally goes to table 2. Tables 2–10 are furious.
- ✅ **Node's waiter:** takes table 1's order, hands the ticket to the kitchen, and **immediately** takes orders from tables 2, 3, 4. When the kitchen rings a bell, they deliver whatever's ready.

**One waiter serves 200 tables — not by moving faster, but by never standing still.** The cooks are the parallelism.

That's why Node handles ~10,000 connections on one thread: **web servers spend almost all their time waiting on networks and disks, not computing.**

## The nuance most people get wrong

"Async work goes to the thread pool" — **mostly false.** There are actually **two completely different mechanisms.**

### ⭐ Mechanism A — the operating system does it, zero threads
Network work — HTTP requests, database queries, sockets — uses a facility the OS already provides for watching many connections at once.

Node says *"tell me when any of these 10,000 connections has data"* and then **sleeps**. The OS wakes it for the specific one that's ready. **No Node thread is used or blocked.** This is the real reason Node scales.

### Mechanism B — a pool of 4 threads
Only for things the OS **can't** watch that way:
- `fs.*` — file operations
- `crypto.pbkdf2`, bcrypt — password hashing
- `zlib` — compression
- `dns.lookup()`

You can watch the limit yourself:

```js
const start = Date.now();
for (let i = 1; i <= 5; i++) {
  crypto.pbkdf2('pw', 'salt', 100000, 64, 'sha512', () =>
    console.log(`hash ${i}: ${Date.now() - start}ms`));
}
```
```
hash 1: ~600ms  ┐
hash 2: ~610ms  │ the first FOUR ran together — the pool is 4 threads
hash 3: ~620ms  │
hash 4: ~630ms  ┘
hash 5: ~1200ms  ← waited for a thread to free up ⚠️
```

| What you're doing | Handled by | Uses a pool thread? |
|---|---|---|
| HTTP request, DB query, socket | the OS | ❌ no |
| `fs.readFile` | thread pool | ✅ yes |
| bcrypt, `pbkdf2`, zlib | thread pool | ✅ yes |
| `setTimeout` | neither — just a timer | ❌ |
| `JSON.parse`, a `for` loop | **your own thread** | ⚠️ **blocks!** |

---

<a name="loop"></a>
# 10. The Event Loop

## What problem it solves

One call stack plus slow I/O would mean a frozen program. Node's answer: **don't wait.** Hand slow work off, keep running, come back to the result later.

The event loop is what "comes back later" means.

```
        ┌──────────────┐
        │  CALL STACK  │  ← your code runs here (§1-7)
        └──────┬───────┘
               │  you call fs.readFile / setTimeout / fetch
               ▼
        ┌──────────────────────────┐
        │   libuv + the OS         │  ← the WAITING happens here,
        │                          │     outside your thread
        └──────┬───────────────────┘
               │  it finishes → the callback is put in a queue
               ▼
        ┌────────────────────┐
        │      QUEUES        │
        └─────────┬──────────┘
                  ▼
         ┌─────────────────┐
         │   EVENT LOOP    │  "Is the stack empty? Then take the next
         └─────────────────┘   callback from a queue and run it."
```

> ⭐ **The event loop's entire job, in one sentence: when the call stack is empty, take the next waiting callback and run it.**

## The rule everything depends on

**The event loop cannot interrupt code that's running.** Your synchronous code runs to completion and empties the stack before *any* callback fires. No exceptions.

This is why `setTimeout(fn, 0)` doesn't mean "run now" — it means "run after everything currently happening, at the earliest":

```js
const start = Date.now();
setTimeout(() => console.log('fired after', Date.now() - start, 'ms'), 0);
while (Date.now() - start < 2000) {}    // block for 2 seconds
// prints: fired after ~2000 ms
```

**The timer was ready after 0ms. The loop just couldn't get a turn** until that `while` finished.

## Phases

The loop does a circuit of stages, each with its own queue:

```
   ┌─▶ timers      setTimeout / setInterval that are due
   │   pending     some system error callbacks
   │   poll   ⭐   incoming I/O — a file finished, a request arrived
   │   check       setImmediate
   └── close       'close' events

   ⚡ Between every stage, and after every callback, Node empties
      the nextTick queue and then the microtask queue (§11).
```

**Only three matter in practice: timers, poll, and check** — that's `setTimeout`, your actual I/O, and `setImmediate`.

**The poll stage is where Node sleeps.** With nothing to do, it parks there and waits for the OS to wake it. That's why an idle Node server sits at **0% CPU** rather than spinning.

---

<a name="queues"></a>
# 11. ⭐ The two queues

Not all callbacks are equal. There are two queues with **strict priority**, and knowing the order is a very common interview question.

```
MICROTASKS (high priority)      MACROTASKS / "callback queue" (low priority)
  .then / .catch / .finally       setTimeout, setInterval
  await resuming                  setImmediate
  queueMicrotask                  I/O callbacks (file read finished)
  process.nextTick (even higher)
```

## The rules

```
1. Run all synchronous code, until the stack is empty.
2. Empty the process.nextTick queue COMPLETELY.
3. Empty the microtask queue COMPLETELY
      — including any new microtasks added while doing so.
4. Take ONE macrotask and run it.
5. Go back to step 2.
```

**The key asymmetry: microtasks are drained completely; macrotasks are taken one at a time.**

## The canonical example

```js
console.log('1: sync start');
setTimeout(() => console.log('2: timeout'), 0);
Promise.resolve().then(() => console.log('3: promise'));
process.nextTick(() => console.log('4: nextTick'));
console.log('5: sync end');
```

```
1: sync start     ← plain code, runs immediately
5: sync end       ← plain code — the stack must empty before anything else
4: nextTick       ← highest priority queue
3: promise        ← microtask queue
2: timeout        ← macrotask, last
```

**Say the reasoning, not just the output:** sync first because nothing can interrupt it; then nextTick; then promises; then timers.

## Why microtasks are dangerous

Because they're drained *completely*, a queue that keeps refilling itself **never lets anything else run**:

```js
function starve() { Promise.resolve().then(starve); }
starve();
setTimeout(() => console.log('never runs'), 0);
```

The process is alive and pegged at 100% CPU, but no timer, no I/O, and no incoming request will ever be handled. **That's worse than a crash** — health checks may still pass while nothing works.

## `await` is just microtasks in disguise

```js
async function go() {
  console.log('A');
  await null;          // ← not a pause. This is a `.then()` boundary.
  console.log('C');    // everything below becomes a microtask
}
go();
console.log('B');
// A, B, C
```

**`await` doesn't block the thread.** It hands control back to the event loop and schedules the rest of the function as a microtask. That's why other requests keep being served while you `await`.

## Interview one-liner

> "JavaScript runs on one thread with one call stack, so it can't sit and wait on slow work. When you call something async, Node hands it to libuv or the OS and keeps executing; when that work finishes its callback is queued, and the event loop's job is to push the next queued callback onto the stack — but **only once the stack is empty**, because it can never interrupt running code. That's why synchronous code always finishes first and `setTimeout(0)` runs after it. There are two queues with strict priority: **microtasks** — promises and `await` — which drain completely, and **macrotasks** — timers and I/O — taken one at a time, so a promise callback always beats a `setTimeout(0)` scheduled at the same moment."

## Q&A to expect

### Q: What is the event loop?
> "The mechanism that pushes queued callbacks onto the call stack when it's empty, letting a single thread handle async work without waiting. It hands slow work off (§9), then runs the resulting callbacks later in priority order (§11)."

### Q: Can the event loop interrupt running code?
> "No. Synchronous code always runs to completion and empties the stack before any callback fires. That's the rule everything depends on — and it's why CPU-heavy work freezes everything (§12)."

### Q: What order do `setTimeout` and `Promise.then` run in?
> "The promise wins. `.then` is a microtask, and microtasks drain completely before any macrotask like `setTimeout` runs — even a `setTimeout(0)` scheduled first. Priority is: sync → `process.nextTick` → microtasks → macrotasks."

### Q: Does `await` block the thread?
> "No. `await` is a `.then()` boundary — it schedules the rest of the function as a microtask and yields control back to the loop, so other work keeps being served while you wait."

### Q: Why can Node handle ~10,000 connections on one thread?
> "Because those connections are mostly *waiting* on I/O, and the waiting happens off-thread in libuv or the OS (§9). Waiting is nearly free; only *computing* runs on your thread and blocks. Node is built for I/O-bound work, not CPU-bound work."

---

<a name="blocking"></a>
# 12. What actually blocks

Since one thread runs *your* code, **any computing you do freezes everyone.**

```js
app.get('/report', (req, res) => {
  let sum = 0;
  for (let i = 0; i < 1e10; i++) sum += i;   // 5 seconds of pure computing
  res.json({ sum });
});
```

For those 5 seconds: **no requests accepted, no callbacks, no timers, nothing.** One user just froze your entire server.

**The test to apply to any line: does this hand work to somebody else, or compute it here?**

```js
fs.readFile(...)      // ✅ hands off → thread free
fs.readFileSync(...)  // ❌ computes/waits HERE → everyone frozen
JSON.parse(huge)      // ❌ pure computing on your thread
array.sort()          // ❌ pure computing (fine if small, deadly at 10M items)
await fetch(...)      // ✅ hands off → thread free
while (true) {}       // ❌ the end of the world
```

> **`*Sync` functions are fine at startup** — loading config before the server accepts traffic, where nobody is waiting. **Never inside a request handler.**

---

<a name="conc"></a>
# 13. Concurrency vs parallelism

```
CONCURRENCY (Node):   handling many things by switching between them
  Thread 1: [A][B][A][C][B][C]──▶     one worker, taking turns

PARALLELISM:          doing many things at the same instant
  Core 1:   [A][A][A]──▶
  Core 2:   [B][B][B]──▶              multiple workers, literally at once
```

**Node is very concurrent but not parallel** (for your JavaScript). It holds 10,000 connections at once because they're all just **waiting**, and waiting costs nothing. It cannot *compute* 10,000 things at once.

> ⭐ **Concurrency is about structure — handling many things. Parallelism is about execution — doing many things.**

---

<a name="escape"></a>
# 14. Escaping the single thread — Workers

## Why workers exist

One thread means **CPU-heavy work blocks everything** — you can't offload *computation* the way you offload I/O, because there's no OS to hand it to; it's your code that has to run.
- **Browser:** heavy compute freezes the **UI** — no clicks, no scroll, no render.
- **Node:** heavy compute blocks the **event loop** — every other request freezes.

**Workers are the escape hatch: run JavaScript on a *separate thread*, in parallel, so the main thread stays free.**

## How workers work — the model

A worker is a **separate thread with its own memory and its own global scope**, running a separate script. The core design point:

> **Workers don't share memory with the main thread. They communicate by *message passing*.**

```
   MAIN THREAD                              WORKER THREAD
   ┌────────────────┐   postMessage(data)   ┌────────────────┐
   │ your app / UI  │ ────────────────────▶ │ heavy compute  │
   │                │                        │ (own memory,   │
   │  onmessage  ◀──┼──────────────────────  │  own globals)  │
   └────────────────┘   postMessage(result)  └────────────────┘
        stays free                            does the CPU work
```

Key mechanics:
- Communication is **`postMessage` / `onmessage`** — asynchronous.
- Data is **copied**, not shared, via the **structured clone** algorithm → no shared-mutable-state, so **no race conditions** (same safety guarantee as the single-thread model, §8).
- **No shared scope:** a worker can't touch the main thread's variables, and in the browser **can't touch the DOM** (no `window`/`document`). Pure computation in, result out.

## The three "workers" (know the distinction — common trap)

| | **Web Worker** | **Worker Thread** | **Service Worker** |
|---|---|---|---|
| Where | Browser | Node.js (`worker_threads`) | Browser |
| Purpose | Offload CPU work | Offload CPU work | **Not** CPU — a network **proxy** for caching / offline / push |
| DOM access | ❌ | ❌ | ❌ |

⚠️ **Service Workers are the odd one out** — not for parallel computation; they sit between app and network for offline/PWA caching. If "worker" comes up for *performance*, it means **Web Workers** (browser) or **worker_threads** (Node).

```js
// Browser Web Worker
const worker = new Worker('worker.js');
worker.postMessage({ numbers: bigArray });
worker.onmessage = (e) => console.log('result:', e.data);
// worker.js:  onmessage = (e) => postMessage(heavyCompute(e.data.numbers));
```

## `worker_threads` — for computing (Node)
```js
const { Worker } = require('worker_threads');
const w = new Worker('./heavy.js', { workerData: bigArray });
w.on('message', result => res.json(result));   // main thread stays free ✅
// heavy.js:
//   const { parentPort, workerData } = require('worker_threads');
//   parentPort.postMessage(heavyCompute(workerData));
```
A real thread with **its own memory** — nothing shared unless you explicitly ask, so you still don't get race conditions. Use it when one heavy task would otherwise freeze the loop: PDF generation, image processing, big data transforms.

## A real example — and how the worker "talks back"

An Express route that does heavy CPU work **without freezing the server**:

```js
// main.js
const { Worker } = require('worker_threads');

app.get('/heavy', (req, res) => {
  const worker = new Worker('./heavy.js', { workerData: 45 });

  // 👇 register a listener, then MOVE ON — the main thread does not block here
  worker.on('message', (result) => res.json({ result }));   // runs LATER
  worker.on('error',   (err)    => res.status(500).json({ error: err.message }));
});

app.get('/ping', (req, res) => res.send('still responsive!')); // works during /heavy
```
```js
// heavy.js — runs on its OWN thread
const { parentPort, workerData } = require('worker_threads');
const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2));
parentPort.postMessage(fib(workerData));   // 👈 send the answer back to main
```

**"Is the main thread listening to the worker?" — yes, but *listening* means it registered a callback, not that it's blocked waiting.** The worker doesn't "return" a value; it **emits a message**, and the main thread reacts to it as an event through the **same event loop** you already know (§9–11):

```
MAIN THREAD                                  WORKER THREAD
worker.on('message', cb)  ← register, then CONTINUE serving other requests
   │                                         fib(45) runs here (slow, this thread only)
   │                                         parentPort.postMessage(result)
   ▼                                                    │
event loop: 'message' event arrives ◀───────────────────┘
   → pushes cb onto the stack when empty → cb(result) → res.json(...)
```

- `worker.on('message', cb)` **registers a callback and returns immediately** — the main thread never pauses.
- `parentPort.postMessage(...)` delivers a **message event** to the main thread's event loop, which runs `cb` when the main stack is empty — exactly like a `setTimeout` or I/O callback firing.

**It's two-way**, both directions just `postMessage` + an `on('message')` listener:
- **Main → worker:** initial `workerData`, or later `worker.postMessage(x)` (worker listens via `parentPort.on('message', …)`).
- **Worker → main:** `parentPort.postMessage(result)` (main listens via `worker.on('message', …)`).

> One line: **the worker doesn't return a value — it emits a message, and the main thread reacts to it as an event through the event loop, exactly like any other async callback.**

## `cluster` — for throughput
```js
if (cluster.isPrimary) {
  for (let i = 0; i < os.cpus().length; i++) cluster.fork();
} else {
  require('./server');
}
```
Runs **N copies of your whole app**, one per CPU core, sharing a port. Use it to handle more requests per second.

> ⚠️ **`cluster` does not fix blocking — it divides the damage.** A 200ms block still freezes the worker it lands on. With 8 workers, 1/8th of users are hit instead of all of them. **Tolerance, not a fix.**
>
> And because each worker is a separate process with separate memory, **your app must be stateless** — sessions have to live in Redis, not in a variable.

## `worker_threads` vs `cluster` vs `child_process`
- **`worker_threads`** — threads sharing one process; for **CPU work**. Lightweight.
- **`cluster`** — one **process per core** for **throughput** (more req/sec), not for offloading a single heavy task.
- **`child_process` / `fork`** — separate **processes** (own memory); heavier, for running separate programs/scripts.

> **The rule:** one endpoint freezing everyone → **worker_threads**. Need more requests per second → **cluster**. Run a separate program → **child_process**.

## Sharing data — the escape hatches
- **`SharedArrayBuffer` + `Atomics`** — the *one* way to genuinely **share memory** (not copy) between threads. Fast for large numeric data, but you're back to needing `Atomics` to avoid races. Rarely needed.
- **Transferable objects** — instead of copying a big `ArrayBuffer`, **transfer ownership** (zero-copy). Fast, but the sender loses access to it.

## Benefits
1. **Keeps the main thread responsive** — UI stays smooth / event loop stays free.
2. **True parallelism** — actually uses multiple CPU cores (the one thing plain JS can't do).
3. **Safety preserved** — memory is copied, not shared, so no race conditions by default.

## Use cases
- **Browser:** image/video processing, canvas filters, parsing large JSON/CSV, encryption/hashing, physics/simulations — anything that would jank the UI.
- **Node:** PDF generation, image resizing/thumbnails, CPU-bound transforms, compression, heavy hashing.

> **The rule:** workers are for **CPU-bound** work. **Not** for I/O — I/O is already async and off-thread, so wrapping a DB call in a worker just adds overhead.

## Trade-offs / limitations (pros & cons)
| Pros | Cons |
|---|---|
| Main thread stays responsive | **Spawn cost** — thread startup + memory (use a **worker pool**) |
| True multi-core parallelism | **Message-passing cost** — data serialized/copied (structured clone); huge payloads can cost more than they save |
| No race conditions (copied memory) | **No shared state** — must architect around messages |
| | **No DOM** in the browser — compute only |
| | Added complexity, harder debugging |

## Interview one-liner

> "JavaScript is single-threaded, so CPU-heavy work blocks the main thread — the UI in the browser or the event loop in Node. Workers run a script on a separate thread in parallel so the main thread stays responsive. They don't share memory; they communicate through asynchronous message passing with `postMessage`, and data is copied via structured clone, which keeps the no-race-condition guarantee. In the browser they're Web Workers with no DOM access, and in Node they're worker_threads. They're for CPU-bound work like image processing or heavy computation, not for I/O, which is already async. The main costs are thread spawn overhead and serializing data across the boundary, which you manage with a worker pool and, when needed, SharedArrayBuffer for zero-copy sharing."

## Q&A to expect

### Q: Why do we need workers if JS is single-threaded?
> "To run CPU-heavy work off the main thread so the UI or event loop doesn't freeze — it's the one case you can't offload via async I/O, because computation has to actually run somewhere."

### Q: Do workers share memory with the main thread?
> "No, by default — they message-pass and data is copied via structured clone, which is why there are no race conditions. `SharedArrayBuffer` is the deliberate exception for zero-copy sharing, and then you need `Atomics`."

### Q: Can a Web Worker access the DOM?
> "No — it has no `window` or `document`. It computes and posts results back for the main thread to render."

### Q: Web Worker vs Service Worker?
> "Web Worker = parallel CPU work. Service Worker = a network proxy for caching, offline, and push. Same 'worker' name, completely different jobs."

### Q: worker_threads vs cluster vs child_process?
> "worker_threads = threads in one process for CPU work; cluster = one process per core for throughput; child_process = separate processes for running separate programs."

### Q: When would workers *hurt* performance?
> "For light tasks or I/O — the spawn and serialization overhead exceeds the benefit. Also when you copy huge payloads across the boundary, where the messaging cost outweighs the computation saved."

---

<a name="interview"></a>
# 15. Interview Questions & Answers

### Q1. What's a closure?
> "A function that still has access to the variables from where it was created, even after that outer function has finished running. It happens automatically because of lexical scope — the inner function looks outward for variables, and as long as it exists, those variables can't be cleaned up.
>
> The classic example is a counter: an outer function declares `count`, returns an inner function that increments it, and the count survives even though the outer function returned long ago. **And each call creates a fresh one** — two counters don't share state.
>
> **The detail that matters: a closure captures the variable, not a copy of its value.** That's why `var` in a loop with `setTimeout` prints `3,3,3` — there's one shared `i` and it's `3` by the time the callbacks run. `let` gives each iteration its own binding, so you get `0,1,2`."

### Q2. Is Node single-threaded?
> "The JavaScript execution is — one call stack, one thing at a time, which is why there are no locks or race conditions. But Node as a **runtime** isn't. It's V8 plus libuv, and libuv has a pool of four threads for file and crypto work.
>
> **And most network I/O doesn't even use those threads** — it uses the operating system's own facility for watching many connections, so 10,000 open sockets cost zero threads.
>
> **The way I'd summarize it: single-threaded execution, multi-threaded runtime.** My code runs on one thread; the waiting happens somewhere else."

### Q3. Explain the event loop.
> "Your JavaScript runs on one thread with one call stack. When you call something slow — a file read, a network request — Node hands it to libuv or the OS and **immediately continues**. It never sits and waits.
>
> When that work finishes, the callback goes into a queue. **The event loop's job is to notice when the call stack is empty and push the next queued callback onto it.**
>
> **The rule everything depends on is that the loop can't interrupt running code.** Synchronous code always finishes first — which is why `setTimeout(fn, 0)` means 'as soon as I'm free', not 'now'.
>
> There are two queues with strict priority: **microtasks** — promises and `await` — which are drained completely, and **macrotasks** — timers and I/O — taken one at a time. So a promise callback always runs before a `setTimeout(0)` scheduled at the same moment."

### Q4. What order does this print?
```js
console.log('1');
setTimeout(() => console.log('2'), 0);
Promise.resolve().then(() => console.log('3'));
process.nextTick(() => console.log('4'));
console.log('5');
```
> "**1, 5, 4, 3, 2.**
>
> The two `console.log`s are synchronous, so they run first and the stack has to empty before anything else can happen. Then `nextTick`, which has its own highest-priority queue. Then promise microtasks. Then the timer, because macrotasks come last.
>
> **The priority is: sync → nextTick → microtasks → macrotasks.**"

### Q5. How is `this` determined?
> "By **how the function is called**, not where it's written — which is the opposite of variable scope, and that's why it confuses people.
>
> Four rules, first match wins: `new` makes it the new object; `call`/`apply`/`bind` make it what you passed; a method call makes it whatever's left of the dot; and a plain call makes it `undefined` in strict mode.
>
> **Arrow functions are the exception** — they have no `this` of their own and use whatever was in scope where they were written.
>
> **The practical version: `this` is lost the moment you detach a method from its object.** `setTimeout(user.greet)` gives `undefined` because there's no dot at the call site. Fix it with an arrow wrapper or `.bind()`."

### Q6. Explain prototypal inheritance without using `class`.
```js
function Animal(name) { this.name = name; }
Animal.prototype.speak = function () { console.log(this.name + ' makes a sound'); };

function Dog(name, breed) {
  Animal.call(this, name);                       // 1. inherit the properties
  this.breed = breed;
}
Dog.prototype = Object.create(Animal.prototype); // 2. link the chain
Dog.prototype.constructor = Dog;                 // 3. fix the constructor pointer
```
> "Every object has a hidden link to another object. When you ask for a property it doesn't have, JavaScript follows that link upward until it finds it or hits `null`. The chain here is `rex → Dog.prototype → Animal.prototype → Object.prototype → null`.
>
> **Three things worth mentioning:** use `Object.create`, not `new Animal()` — the old approach ran the parent constructor with no arguments and polluted the prototype. **`.prototype` only exists on functions** and is what instances get linked *to*; `__proto__` is what an object is linked *from*. And `class` is purely syntax over exactly this.
>
> **Why it matters practically:** methods live on the prototype, so 10,000 instances share one copy instead of carrying their own."

### Q7. Why does `var` in a loop print `3,3,3`?
> "`var` is function-scoped, so the whole loop shares **one** `i`. All three callbacks point at that same variable, and by the time they run the loop has finished and `i` is `3`.
>
> `let` is block-scoped and creates a **new binding each iteration**, so each callback captured its own — `0,1,2`.
>
> **The underlying lesson is that closures capture variables, not values** — what matters is what the variable holds when the callback actually runs."

### Q8. Why are microtasks dangerous?
> "Because the loop drains the microtask queue **completely** before doing anything else. So a microtask that schedules another microtask creates an infinite loop that nothing can break into — no timer, no I/O, no incoming request ever runs again.
>
> **It's worse than a crash**, because the process stays alive: CPU at 100%, health checks possibly still passing, and nothing actually working.
>
> **And it doesn't need to be infinite** — a long chain of ten thousand promises delays all I/O until it finishes, so you get latency spikes with no blocking code anywhere."

### Q9. Why is Node good for I/O and bad for CPU work?
> "Because waiting is free and computing isn't. When you wait on a database, the work happens in the OS, not on your thread — so one thread can hold 10,000 connections that are all waiting.
>
> CPU work runs **on** that thread, and the event loop can't interrupt running code. So a 5-second calculation freezes every other user for 5 seconds.
>
> **For CPU-heavy work I'd use `worker_threads`**, which gets it off the main thread. **For throughput I'd use `cluster`** to run one process per core. But cluster doesn't fix blocking — it just means 1/8th of users get frozen instead of all of them."

---

<a name="cheatsheet"></a>
# 16. Cheat Sheet

### How it all connects
```
you call a function          → an EXECUTION CONTEXT is created      (§1)
                             → pushed onto the CALL STACK           (§2)
it looks for variables       → outward, by WHERE IT WAS WRITTEN     (§3)
it outlives its parent       → that's a CLOSURE                     (§4)
declarations known upfront   → HOISTING (from the creation phase)   (§5)
its `this` comes from        → the CALL SITE, not the definition    (§6)
missing properties           → looked up the PROTOTYPE CHAIN        (§7)
the stack finally empties    → the EVENT LOOP takes over           (§10)
it prefers                   → MICROTASKS over macrotasks          (§11)
```

### The 6 rules to never forget
```
1. The event loop CANNOT interrupt running code — sync always finishes first
2. Scope = WHERE WRITTEN.  `this` = HOW CALLED.  (exact opposites)
3. Closures capture the VARIABLE, not its value
4. `this` is lost the moment you detach a method from its object
5. Microtasks drain COMPLETELY before any macrotask runs
6. Your JavaScript is single-threaded — the WAITING is not
```

### Priority order
```
sync code → process.nextTick → microtasks (promises/await) → macrotasks (timers/IO)
```

### Hoisting
```
var          exists early, set to undefined  → you get undefined
let/const    exists early, UNUSABLE (TDZ)    → ReferenceError
function     fully available early           → ✅ works
class        TDZ, like let

"Cannot access before initialization" = TDZ (it exists, refused)
"is not defined"                      = it was never declared
```

### `this` — first match wins
```
new Foo()             → the new object
.call/.apply/.bind    → what you passed
obj.foo()             → obj (LEFT OF THE DOT)
foo()                 → undefined (strict)
arrow                 → NO own `this` — uses where it was WRITTEN

⚠️ setTimeout(obj.method) → detached → undefined
   fix: () => obj.method()   or   obj.method.bind(obj)
```

### Prototypes
```
__proto__   = what I'm linked to        (every object)
.prototype  = what my instances get     (FUNCTIONS ONLY)
rex.__proto__ === Dog.prototype

new = create {} → link it → run ctor with this → return
chain: obj → Ctor.prototype → Object.prototype → null
class = sugar. Methods on the prototype = ONE shared copy for all instances.
```

### Who handles the waiting
```
HTTP / DB / sockets          → the operating system   → 0 threads ⭐
fs, bcrypt, zlib, dns.lookup → thread pool (4)        → max 4 at once
setTimeout / setImmediate    → a loop timer           → 0 threads
JSON.parse, loops, sort, *Sync → YOUR THREAD          → ⚠️ BLOCKS EVERYONE
```

### Loop phases
```
timers → pending → poll(I/O) → check(setImmediate) → close
⚡ nextTick + microtasks drain between EVERY phase and after EVERY callback
💤 an idle Node process sleeps in `poll` at 0% CPU
```

### Scaling out
```
worker_threads → get CPU work off the main thread (one slow endpoint)
cluster        → one process per core (more requests/sec)
                 ⚠️ divides blocking damage, doesn't fix it
                 ⚠️ separate memory → your app must be STATELESS

concurrency = handling many at once (Node ✅)
parallelism = doing many at once (needs cores)
```

---

*— Part 1 of the Node.js notes. Next: [Part 1.2 — What this means under real load](01.2-event-loop-blocking-and-real-world-load.md) —*
