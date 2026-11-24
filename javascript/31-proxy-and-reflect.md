# JavaScript Study Notes — Part 31

## Proxy & Reflect ⭐⭐⭐☆☆

**Topics:** what a `Proxy` is · the common "traps" (`get`, `set`, `has`, `deleteProperty`, `apply`) · `Reflect` and why traps use it · real uses — validation, defaults, read-only views, logging, **reactivity** (how Vue works) · limits and costs.

> **Why this part exists:** "Build an object that logs every change" or "how does Vue know when data changed?" are real interview questions. The answer is `Proxy`. It's also how libraries like Immer, MobX and Vue 3 work under the hood.

---

## 1. What a Proxy is

> **Definition:** a `Proxy` wraps an object (the **target**) and lets you **intercept** operations on it — reading a property, writing one, deleting one, calling a function — through functions called **traps**, defined in a **handler** object.

```js
const user = { name: 'Asha', age: 30 };

const logged = new Proxy(user, {
  get(target, key) {
    console.log(`read ${String(key)}`);
    return target[key];
  },
});

logged.name;   // logs "read name", returns 'Asha'
```

> **Analogy 🛎️ — a hotel receptionist.** Guests never go straight to a room; they ask at the desk. The receptionist (the proxy) can answer, check ID, keep a log, or refuse — and then pass the request on to the room (the target).

The code using `logged` doesn't know it's a proxy — it looks and behaves like a normal object.

---

## 2. The traps you'll actually use

| Trap | Intercepts | Example |
|---|---|---|
| `get(target, key, receiver)` | reading `obj.key` | defaults, logging, computed values |
| `set(target, key, value, receiver)` | writing `obj.key = value` | validation, change tracking |
| `has(target, key)` | `key in obj` | hide private keys |
| `deleteProperty(target, key)` | `delete obj.key` | block deletes |
| `ownKeys(target)` | `Object.keys`, `for...in` | hide keys from enumeration |
| `apply(target, thisArg, args)` | calling a function proxy | timing, caching |
| `construct(target, args)` | `new` on a class proxy | counting instances |

**Rule for `set`:** return `true` if the write was accepted. Returning `false` makes the assignment throw a `TypeError` in strict mode.

---

## 3. `Reflect` — "do the normal thing"

`Reflect` has one method for every trap (`Reflect.get`, `Reflect.set`, `Reflect.has`, …) that performs the **default behaviour**. Inside a trap, use it to pass the operation on to the target correctly:

```js
const handler = {
  set(target, key, value, receiver) {
    console.log(`${String(key)} = ${value}`);
    return Reflect.set(target, key, value, receiver);   // ✅ default write, returns true/false
  },
};
```

Why not just `target[key] = value`? `Reflect` returns the right `true`/`false` result, and passing `receiver` keeps **getters/setters and inheritance** working correctly (they see the proxy as `this`, not the raw target).

> 🧠 **Remember:** **Proxy = intercept. Reflect = carry on as normal.** Most traps are "do something extra, then `return Reflect.same(...)`."

---

## 4. Real uses

### Validation

```js
function validated(obj) {
  return new Proxy(obj, {
    set(target, key, value, receiver) {
      if (key === 'age' && (!Number.isInteger(value) || value < 0)) {
        throw new TypeError('age must be a non-negative integer');
      }
      return Reflect.set(target, key, value, receiver);
    },
  });
}
const p = validated({});
p.age = 30;      // ok
p.age = -1;      // TypeError
```

### Default values instead of `undefined`

```js
const withDefault = (obj, fallback) =>
  new Proxy(obj, { get: (t, k, r) => (k in t ? Reflect.get(t, k, r) : fallback) });

const counts = withDefault({}, 0);
counts.apples++;          // 1 — no "undefined + 1 = NaN"
```

### Read-only view

```js
const readonly = (obj) => new Proxy(obj, {
  set() { throw new TypeError('read-only'); },
  deleteProperty() { throw new TypeError('read-only'); },
});
```

### ⭐ Reactivity — how Vue 3 knows data changed

```js
function reactive(obj, onChange) {
  return new Proxy(obj, {
    set(target, key, value, receiver) {
      const old = target[key];
      const ok = Reflect.set(target, key, value, receiver);
      if (old !== value) onChange(key, value);    // notify → re-render
      return ok;
    },
  });
}

const state = reactive({ count: 0 }, (k, v) => render());
state.count++;    // render() runs automatically
```

Vue 3 does this (plus a `get` trap that records which component read which property, so only those re-render). Vue 2 used `Object.defineProperty` getters/setters instead, which couldn't detect **new** properties or array index changes — that's exactly the limitation Proxy removed. (Angular uses a different approach — signals and zone-based change detection; React re-renders when you call `setState`.)

### Other real uses
- **Immer** gives you a proxy "draft" to mutate, records the changes, and produces a new immutable object.
- **Negative array indexes**, API clients where `api.users.get()` builds the URL from property names, mocking in tests.

---

## 5. Limits and costs

- **Proxies are slower** than plain objects — every operation runs your function. Fine for state objects, bad for hot loops over millions of items.
- **Nested objects aren't proxied automatically.** `state.user.name = 'x'` goes through the `get` for `user`, then writes to the plain inner object. Reactive libraries wrap nested objects lazily inside the `get` trap.
- **Identity:** `proxy !== target`. Comparing a proxy with the raw object, or using both as `Map` keys, gives surprising results.
- **Built-ins with internal slots** (`Map`, `Set`, `Date`, private `#fields`) break when proxied directly: `new Proxy(new Map(), {}).get('x')` throws, because `Map.prototype.get` needs the real Map as `this`. You have to bind methods to the target.
- `Proxy.revocable()` gives a proxy you can switch off later — useful for handing out temporary access.

---

## Interview Q&A

**Q: What is a Proxy?**
> A wrapper around an object that intercepts operations like reading, writing, deleting or calling, through handler functions called traps. The calling code uses it like the original object. Typical uses are validation, default values, logging, read-only views and change tracking.

**Q: Why use `Reflect` inside a trap?**
> `Reflect` performs the default behaviour for that operation and returns the correct result, like `true`/`false` for a set. Passing the `receiver` through keeps getters, setters and inheritance working with the proxy as `this`. So traps usually add their extra logic and then return `Reflect.<sameOperation>(...)`.

**Q: How does Vue 3 detect changes?**
> It wraps state in a Proxy. The `get` trap records which effect or component read each property, and the `set` trap triggers re-running only those. Vue 2 used `Object.defineProperty`, which couldn't detect added properties or array index assignments — Proxy fixed that.

**Q: Write an object that throws when you read a property that doesn't exist.**
> ```js
> const strict = (obj) => new Proxy(obj, {
>   get(t, k, r) {
>     if (!(k in t)) throw new ReferenceError(`Unknown property: ${String(k)}`);
>     return Reflect.get(t, k, r);
>   },
> });
> ```

**Q: What are the downsides of Proxy?**
> They're slower than plain objects, they don't wrap nested objects automatically, the proxy isn't identical to the target, and built-ins like `Map` or objects with private fields break unless methods are bound to the real target.

---

## Follow-ups (challenge questions)

- *Failure mode:* a team wraps their whole Redux-like store in a deep logging Proxy in production. What happens to performance, and what would you do instead?
- *Consistency:* `const p = reactive(user); someMap.set(user, 1); someMap.get(p)` — what's returned and why?

---

## Cheat Sheet

```
Proxy(target, handler) — intercept operations through TRAPS
"the receptionist between you and the room"
traps: get · set (return true!) · has · deleteProperty · ownKeys · apply · construct
Reflect.* = the default behaviour → "do extra, then return Reflect.same(...)"
pass receiver → getters/setters/inheritance stay correct

uses: validation · defaults · read-only · logging · REACTIVITY (Vue 3) · Immer drafts
Vue 2 = defineProperty (missed new keys / array index) → Vue 3 = Proxy

limits: slower · nested objects not auto-wrapped · proxy !== target
        Map/Set/Date/#private break unless methods bound to target
Proxy.revocable() → can be switched off
```

---

**Previous:** [Part 30 — Events in Depth](30-events-in-depth.md) · **Next:** [Part 32 — Browser Rendering & Loading](32-browser-rendering-and-loading.md)
