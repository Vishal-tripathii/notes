# Node.js Study Notes — Part 5

## Buffers — Binary Data, Encoding, UTF-8 & Base64

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.
>
> **Connects to:** [Part 2.8 §4](02.8-memory-management.md) (Buffers are **off-heap** — the container-OOM cause) and [Part 9.5](09.5-streams-deep-dive.md) (chunks are Buffers; multi-byte characters split across them).
>
> Small topic, two genuinely nasty gotchas: **`allocUnsafe`** (§2) and **`buf.buffer` pooling** (§6).

---

## Table of Contents

1. [Why Buffer exists](#why)
2. [Creating buffers](#creating)
3. [Encoding](#encoding)
4. [UTF-8](#utf8) ⭐
5. [Base64](#base64)
6. [Buffer vs ArrayBuffer](#vs) ⭐
7. [Buffers and memory](#memory) ⭐
8. [Interview Questions & Answers](#interview)
9. [Cheat Sheet](#cheatsheet)

---

<a name="why"></a>
# 1. Why Buffer exists

**JavaScript was designed for browsers and text. It had no way to represent raw bytes.** Node's whole job is I/O — files, TCP sockets, crypto, images, compressed data. None of that is text.

```js
const bytes = fs.readFileSync('photo.jpg', 'utf8');   // ❌ CORRUPTED
```

Reading a JPEG as UTF-8 finds byte sequences that aren't valid characters and replaces each with `U+FFFD` (�). **The data is destroyed, irreversibly** — no error, just a broken file when you write it back.

> ⭐ **Bytes are not text.** A string is bytes *plus an interpretation*. Interpret non-text bytes as text and you don't get an error — you get silent corruption.

```js
const buf = fs.readFileSync('photo.jpg');    // ✅ a Buffer — raw bytes, untouched
```

**The history matters:** Buffer shipped in 2009, six years before JavaScript had `TypedArray` (ES6, 2015). Node needed binary handling immediately and built its own. When `ArrayBuffer`/`Uint8Array` arrived, Node rebased Buffer on them rather than break every existing program:

```js
Buffer.from([1,2,3]) instanceof Uint8Array;   // true ⭐
```

---

<a name="creating"></a>
# 2. Creating buffers

```js
Buffer.alloc(10);                    // ✅ 10 zero-filled bytes — SAFE
Buffer.allocUnsafe(10);              // ⚠️ 10 bytes of WHATEVER WAS THERE
Buffer.from('hello');                // from a string (utf8 by default)
Buffer.from('aGk=', 'base64');       // from base64
Buffer.from([0x68, 0x69]);           // from a byte array
```

## ⚠️ `allocUnsafe` is a genuine security footgun

```js
const buf = Buffer.allocUnsafe(1024);
console.log(buf.toString());     // could contain FRAGMENTS OF OLD MEMORY
```

It skips zero-filling, so you get whatever the allocator last had there — **possibly another user's password, a session token, or decrypted data.** It's faster, which is why it exists, but only use it when you **immediately and completely overwrite every byte**:

```js
const buf = Buffer.allocUnsafe(len);
src.copy(buf);              // ✅ fine — every byte overwritten right away
```

> This has been a real CVE class. Node even sped up `alloc` specifically so people would stop reaching for `allocUnsafe`. **Default to `alloc`.**

**Pooling detail:** `allocUnsafe` under 4KB is carved from a shared 8KB internal pool — which matters for §6.

---

<a name="encoding"></a>
# 3. Encoding — the same bytes, read differently

**An encoding is the agreement about what the bytes mean.** The bytes don't change; the interpretation does.

```js
const buf = Buffer.from('Hi');

buf.toString('utf8');     // 'Hi'
buf.toString('hex');      // '4869'
buf.toString('base64');   // 'SGk='
buf;                      // <Buffer 48 69>   ← the actual bytes, always the same
```

| Encoding | Use for | Note |
|---|---|---|
| **`utf8`** | text | the default; variable width |
| **`base64`** | binary inside text (JSON, email, data URLs) | **+33% size** |
| **`hex`** | hashes, debugging | +100% size, human-readable |
| `latin1` | legacy byte-per-char | 1:1, never loses bytes |
| `utf16le` | Windows / JS-internal text | 2–4 bytes/char |

**Round-tripping through the wrong encoding destroys data:**
```js
Buffer.from(binary.toString('utf8'), 'utf8');       // ❌ lossy — invalid seqs → �
Buffer.from(binary.toString('base64'), 'base64');   // ✅ lossless
```

---

<a name="utf8"></a>
# 4. ⭐ UTF-8

**Variable width — 1 to 4 bytes per character.**

```
ASCII    'A'   → 1 byte    41
accented 'é'   → 2 bytes   c3 a9
CJK      '中'  → 3 bytes   e4 b8 ad
emoji    '😀'  → 4 bytes   f0 9f 98 80
```

Its design win: **ASCII is unchanged.** The first 128 characters are one byte each and byte-identical to ASCII, so every ASCII file is already valid UTF-8. That backwards compatibility is why it won.

## The gotcha: `string.length` is not byte length

```js
'héllo'.length;                    // 5   — UTF-16 code units
Buffer.byteLength('héllo');        // 6   — BYTES (é is 2)

'😀'.length;                       // 2 ⚠️ — a surrogate pair in UTF-16!
Buffer.byteLength('😀');           // 4   — bytes in UTF-8
[...'😀'].length;                  // 1   — actual characters
```

**Three different numbers for one emoji.** This breaks real things:

```js
if (username.length <= 20) ...        // ❌ 20 emoji = 80 bytes in your DB column
Buffer.byteLength(username) <= 20     // ✅ if the limit is STORAGE
[...username].length <= 20            // ✅ if the limit is what USERS SEE
```

> **Use `Buffer.byteLength()` for anything about storage or transmission** — `Content-Length`, column limits, payload caps. String `.length` answers a different question.

## The streams connection

A 64KB chunk boundary can land **mid-character**:

```
chunk 1 ends:   ... e4 b8      ← first 2 bytes of 中
chunk 2 begins: ad ...         ← the third
```

`chunk.toString()` on each independently yields two replacement characters and loses the original. **Same class of bug as split CSV lines** ([Part 9.5 §8](09.5-streams-deep-dive.md)) — and the fix is built in:

```js
const { StringDecoder } = require('string_decoder');
const decoder = new StringDecoder('utf8');
decoder.write(chunk);     // ⭐ holds incomplete byte sequences until complete
```

---

<a name="base64"></a>
# 5. Base64

**Encodes binary as 64 safe ASCII characters** (`A–Z a–z 0–9 + /`, padded with `=`).

**Why it exists:** many channels are text-only or mangle certain bytes — email bodies, JSON strings, URLs, HTML attributes. Base64 survives all of them.

```js
Buffer.from('hello').toString('base64');       // 'aGVsbG8='
Buffer.from('aGVsbG8=', 'base64').toString();  // 'hello'
```

**The 33% overhead, and why:**
```
3 bytes (24 bits) → 4 base64 chars (4 × 6 bits = 24 bits)
so 3 bytes in → 4 bytes out → +33%
```

```js
`data:image/png;base64,${buf.toString('base64')}`   // inline image
Buffer.from(jwt.split('.')[1], 'base64url')         // decode a JWT payload
```

> ⚠️ **Base64 is encoding, not encryption.** Anyone decodes it instantly — which is exactly why a JWT payload is readable by anyone ([Part 7 §4](07-authentication-and-security.md)).

**`base64url`** swaps `+/` for `-_` and drops padding, making it safe in URLs and filenames. JWTs use it.

---

<a name="vs"></a>
# 6. ⭐ Buffer vs ArrayBuffer

```
┌─────────────────────────────────────────────────────────────┐
│  ArrayBuffer          raw memory. A dumb block of bytes.    │
│                       You CANNOT read or write it directly. │
├─────────────────────────────────────────────────────────────┤
│  TypedArray / DataView    a VIEW over an ArrayBuffer.       │
│  (Uint8Array, Float64Array…)  This is how you access it.    │
├─────────────────────────────────────────────────────────────┤
│  Buffer               Node's Uint8Array subclass, plus      │
│                       encoding methods (toString, concat…)  │
└─────────────────────────────────────────────────────────────┘
```

```js
const ab = new ArrayBuffer(8);      // 8 bytes of raw memory
ab[0];                              // ❌ undefined — no direct access

const view = new Uint8Array(ab);    // a view — now readable
view[0] = 255;                      // ✅

const buf = Buffer.from(ab);        // Node's version, with extras
buf.toString('base64');             // ⭐ ArrayBuffer/Uint8Array can't do this
```

| | **ArrayBuffer** | **Buffer** |
|---|---|---|
| What | raw memory block | a `Uint8Array` **view** + extra methods |
| Standard | ES / browsers too | **Node only** |
| Direct access | ❌ needs a view | ✅ it *is* a view |
| Encoding methods | ❌ | ✅ `toString('base64')`, `concat`, `readInt32BE` |
| Memory | on-heap | **off-heap** ⭐ |

**In one line:** `Buffer extends Uint8Array`, and every `Uint8Array` is a *view over* an `ArrayBuffer`. So a Buffer always has an ArrayBuffer underneath.

## ⭐ The pooling trap

```js
const buf = Buffer.from('hi');       // 2 bytes
buf.buffer.byteLength;               // 8192 ⚠️ — not 2!
```

Small buffers are **slices of a shared 8KB pool**, so `buf.buffer` is the *whole pool*, not your data. Handing it somewhere exposes up to 8KB of unrelated buffers.

```js
new Uint8Array(buf.buffer);                                    // ❌ leaks other data
new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);    // ✅ correct
```

## The other sharing trap
```js
const a = Buffer.from('hello');
const b = a.subarray(0, 2);       // ⚠️ SHARES memory — not a copy
b[0] = 0x48;
a.toString();                     // 'Hello' — mutating b changed a!
```

`Array.prototype.slice` **copies**; `Buffer.subarray` (and the deprecated `Buffer.slice`) **share**. Same name, opposite behavior. For a real copy: `Buffer.from(a.subarray(0, 2))`.

---

<a name="memory"></a>
# 7. ⭐ Buffers and memory

Direct tie-in to [Part 2.8 §4](02.8-memory-management.md):

```
RSS = HEAP + EXTERNAL + code + stack
              ↑
       Buffers live HERE — OFF the V8 heap
```

**Buffer memory doesn't count against `--max-old-space-size` and barely appears in a heap snapshot.** So:

```
Heap: 400MB  ✅ healthy
RSS:  2.1GB  💥 container OOMKill, exit 137, no JS error
```

```js
process.memoryUsage().external;   // ⭐ where Buffer memory shows up
```

> **If a Node process dies with a clean heap, look at Buffers first.**

---

<a name="interview"></a>
# 8. Interview Questions & Answers

### Q1. Why does Buffer exist?
> "Because JavaScript had **no binary data type**, and Node's entire job is I/O — files, sockets, crypto, images. Strings are UTF-16 text, so reading a JPEG as a string finds byte sequences that aren't valid characters and replaces them with `U+FFFD`. **The data is silently and irreversibly corrupted** — no error, just a broken file when you write it back.
>
> Buffer gave Node a raw byte array plus encoding conversion — `toString('base64')`, `Buffer.concat`, and so on.
>
> **The historical part matters too:** Buffer shipped in 2009, six years before `TypedArray` existed. Once `ArrayBuffer`/`Uint8Array` landed, Node rebased Buffer on top of them rather than break everything — which is why `Buffer` today literally **is** a `Uint8Array` subclass.
>
> One operational note: **Buffer memory is off-heap**, so it doesn't count toward the V8 heap limit and won't show in a heap snapshot. That's why a container can get OOMKilled while the heap looks perfectly healthy."

### Q2. Difference between Buffer and ArrayBuffer?
> "**`ArrayBuffer` is raw memory — a block of bytes you can't read or write directly.** You need a *view*: a `TypedArray` like `Uint8Array`, or a `DataView`.
>
> **`Buffer` is Node's subclass of `Uint8Array`** — so it *is* a view, with binary-specific methods on top: `toString('base64'|'hex')`, `Buffer.concat`, `write`, `readInt32BE`. ArrayBuffer has none of that.
>
> Other differences: ArrayBuffer is **standard JavaScript** and works in browsers; Buffer is **Node-only**. And Buffer memory is allocated **off the V8 heap**.
>
> **The gotcha I'd flag: `buf.buffer` is not what people expect.** Small buffers are slices of a shared 8KB pool, so `buf.buffer.byteLength` can be 8192 for a two-byte buffer. Hand that raw ArrayBuffer to something and you expose unrelated data — you have to pass `buf.byteOffset` and `buf.byteLength` alongside it."

### Q3. `Buffer.alloc` vs `Buffer.allocUnsafe`?
> "`alloc` zero-fills; `allocUnsafe` doesn't, so it returns whatever was previously in that memory — potentially another request's data, a token, or decrypted content. It's faster, and it's caused real CVEs. **Only use it when you immediately overwrite every byte**, like a destination for a `copy()`. Default to `alloc` — Node optimized it specifically so people would stop reaching for the unsafe one."

### Q4. Why is `'😀'.length` 2?
> "Because `.length` counts **UTF-16 code units**, and emoji outside the Basic Multilingual Plane need a surrogate pair — two units. In UTF-8 it's 4 bytes, and it's 1 actual character. So one emoji gives three different numbers depending on the question: `.length` is 2, `Buffer.byteLength` is 4, `[...str].length` is 1. Use `byteLength` for storage and transmission, and spread or `Intl.Segmenter` for what a user perceives as characters."

### Q5. Why is base64 33% larger?
> "It packs 3 bytes — 24 bits — into 4 characters of 6 bits each, so every 3 bytes in become 4 bytes out, plus padding. That's the price of surviving text-only channels like JSON, email and data URLs. Worth remembering when someone base64s file uploads into a JSON body: a 10MB file becomes a 13.3MB request, and it's now a string in memory rather than something you streamed."

### Q6. Does `buf.slice()` copy?
> "**No — it shares memory**, the opposite of `Array.prototype.slice`. Mutating the slice mutates the original. `Buffer.slice` is deprecated in favor of `subarray` precisely to make the sharing explicit, but both behave the same. For a real copy: `Buffer.from(buf.subarray(a, b))`. Easy bug, because the method name implies otherwise."

### Q7. How do you handle a multi-byte character split across two stream chunks?
> "Use `StringDecoder` instead of calling `chunk.toString()` per chunk. A 64KB read can end halfway through a 3-byte character, so decoding each chunk independently produces replacement characters and loses data. `StringDecoder` holds incomplete byte sequences until the next chunk completes them. It's the same class of bug as splitting CSV lines on chunk boundaries — the boundary doesn't respect your data's structure."

---

<a name="cheatsheet"></a>
# 9. Cheat Sheet

### Why Buffer
```
JS had no binary type · Node is all I/O
reading binary as a string → invalid seqs become U+FFFD → SILENT CORRUPTION
⭐ bytes are not text — a string is bytes PLUS an interpretation

Buffer (2009) predates TypedArray (2015) → later rebased on it
   Buffer extends Uint8Array, which is a VIEW over an ArrayBuffer
```

### Creating
```
Buffer.alloc(n)         ✅ zero-filled — DEFAULT TO THIS
Buffer.allocUnsafe(n)   ⚠️ old memory — passwords/tokens. Only if you
                           overwrite EVERY byte immediately. Real CVE class.
Buffer.from(str | arr | arrayBuffer, encoding)
```

### Encodings
```
utf8 (default) · base64 (+33%) · hex (+100%) · latin1 (1:1) · utf16le
same bytes, different interpretation — the bytes never change
⚠️ round-tripping binary through utf8 is LOSSY; through base64 is not
```

### UTF-8 ⭐
```
1-4 bytes/char · ASCII unchanged (why it won)
'A' 1 · 'é' 2 · '中' 3 · '😀' 4

'😀'.length          = 2  ⚠️ UTF-16 surrogate pair
Buffer.byteLength()  = 4  ✅ for STORAGE / Content-Length / column limits
[...'😀'].length     = 1  ✅ for what USERS SEE

⭐ chunk boundaries split multi-byte chars → use StringDecoder, not toString()
```

### Base64
```
3 bytes (24 bits) → 4 chars (4×6 bits) → +33%, plus padding '='
for: JSON, email, data URLs, JWT payloads
⚠️ ENCODING, NOT ENCRYPTION — decoded instantly
base64url: +/ → -_ , no padding (URL/filename safe) — used by JWTs
```

### Buffer vs ArrayBuffer ⭐
```
ArrayBuffer  raw memory · NO direct access · standard/browser · on-heap
   ↓ needs a VIEW
Uint8Array / DataView
   ↓ Node's subclass
Buffer       + toString(enc), concat, write, readInt32BE · Node-only · OFF-HEAP

⚠️ POOLING: Buffer.from('hi').buffer.byteLength === 8192 (the shared pool!)
   → always pass buf.byteOffset + buf.byteLength with buf.buffer
⚠️ subarray/slice SHARE memory (Array.slice copies!)
   → real copy: Buffer.from(buf.subarray(a,b))
```

### Memory
```
RSS = heap + EXTERNAL(Buffers) + code + stack
Buffers are OFF-HEAP → invisible to --max-old-space-size and heap snapshots
→ heap 400MB healthy while RSS 2.1GB gets OOMKilled (exit 137, no JS error)
process.memoryUsage().external  ← look here
⭐ process dying with a clean heap? Buffers first.
```

---

*— Part 5 of the Node.js notes. Related: [Part 2.8 — Memory](02.8-memory-management.md) · [Part 9.5 — Streams](09.5-streams-deep-dive.md) · [Part 7 — Auth](07-authentication-and-security.md) —*
