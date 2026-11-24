# JavaScript Study Notes — Part 34

## Async Iteration — `for await`, Async Generators, Paginated APIs & Streams ⭐⭐⭐☆☆

**Topics:** the async iterator protocol · `for await...of` · `async function*` · consuming a paginated API lazily · reading a `fetch` response stream · cleanup with `return()`/`break` · `Array.fromAsync` · when to use this vs `Promise.all`.

> **Continues from:** [Part 14](14-generators-and-iterators.md) (sync iterators and generators) and [Part 12](12-async-await.md) (`async`/`await`). Put them together and you get a way to handle **data that arrives over time, one piece at a time** — pages from an API, chunks of a download, messages from a socket.

---

## 1. The idea

| | Gives you | Example |
|---|---|---|
| a value | one thing, now | `42` |
| a promise | one thing, **later** | `fetch(url)` |
| an iterable | **many** things, now | an array |
| an **async iterable** | **many** things, **later**, one at a time | pages of results, file chunks, chat messages |

> **Analogy 📬 — a magazine subscription.** An array is a box set delivered all at once. A promise is one parcel that arrives later. An async iterable is a subscription: issues arrive one by one, and you read each when it comes.

The protocol is the same as sync iterators ([Part 14 §1](14-generators-and-iterators.md)), except `next()` returns a **promise** of `{ value, done }`, and the method is keyed by `Symbol.asyncIterator`.

---

## 2. `for await...of`

```js
for await (const chunk of someAsyncIterable) {
  console.log(chunk);      // waits for each item before the loop body runs
}
```

- Works inside `async` functions and at the top level of ES modules.
- Also works on a **normal array of promises** — it awaits each in order: `for await (const r of [p1, p2, p3])`. ⚠️ All three promises already started; if `p3` rejects early, you may not hear about it until the loop reaches it. For a fixed list of promises, `Promise.all` is usually better.

---

## 3. Async generators — `async function*`

The easiest way to *make* an async iterable: an `async` function that can `yield`.

```js
async function* countdown(from) {
  for (let i = from; i > 0; i--) {
    await new Promise(r => setTimeout(r, 1000));   // wait a second
    yield i;                                        // hand out the next value
  }
}

for await (const n of countdown(3)) console.log(n);   // 3 … 2 … 1 (one per second)
```

Inside, you can use both `await` (wait for things) and `yield` (hand out values). Nothing runs until someone asks for the next value — it's **lazy**, like sync generators.

---

## 4. ⭐ Real use: paginated APIs

The classic interview task: "load all users from an API that returns 100 at a time."

```js
async function* fetchAllUsers() {
  let cursor = null;
  do {
    const url = `/api/users?limit=100${cursor ? `&cursor=${cursor}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { items, nextCursor } = await res.json();
    yield* items;                // hand out each user of this page, one by one
    cursor = nextCursor;
  } while (cursor);
}

// the caller doesn't know or care about pages
for await (const user of fetchAllUsers()) {
  await sendNewsletter(user);
  if (stoppedByAdmin) break;    // stops fetching more pages — lazy ✅
}
```

Why this is nice:
- **Lazy:** a page is only fetched when the loop needs more items. `break` after 10 users = only one request.
- **Memory:** you never hold all users at once.
- **Clean separation:** paging logic in one place, processing logic in another.
- **Backpressure for free:** the next page isn't requested until the caller has handled the current items. (Cursor pagination: [database Part 10](../database/10-pagination.md).)

---

## 5. Reading a `fetch` response as a stream

`response.body` is a `ReadableStream`, and in modern browsers and Node it's async-iterable:

```js
const res = await fetch('/big-export.csv');
const decoder = new TextDecoder();
let received = 0;

for await (const chunk of res.body) {          // chunk = Uint8Array
  received += chunk.length;
  showProgress(received / Number(res.headers.get('content-length')));
  handleText(decoder.decode(chunk, { stream: true }));   // stream:true handles characters split across chunks
}
```

This is how you show **download progress**, or render **streaming responses** as they arrive — chat/AI answers token by token, server-sent logs. (In older browsers use `res.body.getReader()` and call `read()` in a loop.)

Node's streams are async-iterable too ([nodejs Part 9.5 §9](../nodejs/09.5-streams-deep-dive.md)).

---

## 6. Cleanup: `break`, `return()` and `finally`

When a `for await` loop ends early (`break`, `return`, or a thrown error), JavaScript calls the iterator's **`return()`** method. For an async generator, that runs its **`finally`** block — so put cleanup there:

```js
async function* readMessages(socket) {
  try {
    while (true) yield await nextMessage(socket);
  } finally {
    socket.close();       // runs on break / error / normal end ✅
  }
}

for await (const msg of readMessages(ws)) {
  if (msg.type === 'bye') break;     // → finally runs → socket closed
}
```

---

## 7. Helpers

```js
const users = await Array.fromAsync(fetchAllUsers());   // collect everything into an array (recent; check support)
```

Without `Array.fromAsync`:

```js
const users = [];
for await (const u of fetchAllUsers()) users.push(u);
```

Only collect when you really need everything — the whole point of async iteration is usually *not* holding it all at once.

---

## 8. Async iteration vs `Promise.all`

| Situation | Use |
|---|---|
| a known, fixed set of independent requests | `Promise.all` — runs them **in parallel** |
| data that arrives over time, or "keep fetching until done" | async iterator — **one after another**, lazy |
| many items, but limited parallelism | a promise pool ([Part 25 §6](25-coding-and-machine-coding-round.md)) |

Async iteration is **sequential** by nature. If you need speed and the items are independent, it's the wrong tool.

---

## Interview Q&A

**Q: What's an async iterator?**
> Like a normal iterator, but `next()` returns a promise of `{ value, done }` and it's found under `Symbol.asyncIterator`. You consume it with `for await...of`, which waits for each value. It models data that arrives over time — pages, chunks, messages.

**Q: How would you fetch all pages of a paginated API?**
> An async generator that loops: fetch a page with the current cursor, `yield*` its items, move to the next cursor, stop when there isn't one. The caller just writes `for await (const item of fetchAll())`. It's lazy — pages are fetched only as needed, and `break` stops further requests.

**Q: What happens when you `break` out of a `for await` loop?**
> The loop calls the iterator's `return()` method. For an async generator, that triggers its `finally` block, so that's where to close connections or release resources.

**Q: When would you not use `for await`?**
> When the items are independent and known up front — then `Promise.all` runs them in parallel instead of one by one. And for a fixed array of already-started promises, `for await` can delay noticing an early rejection.

---

## Follow-ups (challenge questions)

- *Scale:* `fetchAllUsers()` above is strictly sequential. How would you prefetch the next page while the current one is being processed, without losing the laziness?
- *Failure mode:* page 37 of 50 fails with a 503. What does the caller see, and how would you add retries inside the generator without the caller changing?

---

## Cheat Sheet

```
value (1, now) · promise (1, later) · iterable (many, now) · ASYNC ITERABLE (many, later)
"a magazine subscription"
protocol: Symbol.asyncIterator → next() returns Promise<{ value, done }>
consume: for await (const x of it) { ... }   (async fn or module top level)
make:    async function* gen() { await ...; yield x; }   — lazy

PAGINATION: async generator loops pages, yield* items, stops when no next cursor
  lazy · low memory · break = no more requests
fetch stream: for await (const chunk of res.body) + TextDecoder({stream:true}) → progress, streaming AI
cleanup: break/throw → iterator.return() → generator's finally runs
Array.fromAsync(it) collects (only if you need it all)
sequential by nature → independent fixed set? Promise.all · limited parallel? promise pool
```

---

**Previous:** [Part 33 — Front-End Security](33-frontend-security.md) · **Next:** [Part 35 — Build Tooling](35-build-tooling.md)
