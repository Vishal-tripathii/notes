# System Design Study Notes — Part 27

## Bloom Filter (Probabilistic Membership Testing)

> **Format:** Q&A style deep dive, same convention as Part 24 (Consistent Hashing) — the problem, the mechanism with a worked example, the math, and interview Q&A.
>
> **Continues:** the thing referenced but never explained under Part 5 (caching — "cache the not-found result, or a Bloom filter") and the Web Crawler problem (Problem 08 — dedup at billion-URL scale). This is that explanation, standalone.

---

## Table of Contents

1. [The problem: why it arises](#problem)
2. [The idea: a bit array + k hash functions](#idea)
3. [Worked example — insert and query by hand](#example)
4. [Why false positives happen, and why false negatives never do](#tradeoff)
5. [The math: sizing it, and the false-positive rate](#math)
6. [When to pick it](#when)
7. [Variants: counting, scalable, cuckoo filters](#variants)
8. [Where it's actually used](#used)
9. [Interview questions & answers](#interview)
10. [Cheat Sheet — everything on one page](#cheatsheet)

---

<a name="problem"></a>
# 1. The problem: why it arises

The recurring question across a lot of system design is deceptively simple: **"have I seen this before?"**

- Has this URL already been crawled? (Web Crawler, Problem 08)
- Does this username/email already exist, before I hit the DB to check? (signup flow)
- Is this cache key definitely **not** in the database, so I can skip the query entirely? (cache penetration, Part 5)
- Has this element already been processed in a stream, so I can skip re-processing it?

The obvious answer is a **hash set**: store every key you've seen, look it up in O(1). That works — until the set of "things seen" reaches billions of entries.

**Concretely (from the Web Crawler estimation):** a hash set of 10 billion URLs, at ~70–100 bytes per URL string, costs **~1TB** just to hold the keys — and that's before replication, before it needs to be fast (in-memory), and before you multiply it across a distributed fleet. That's not "expensive," that's often **not fits-in-memory at all**.

The core tension:
```
Need:     answer "seen before?" for billions of keys, FAST (memory-speed), CHEAP (small footprint)
Hash set: FAST ✅   CHEAP ❌  (stores every key in full)
```

A Bloom filter is the structure that trades away something you don't always need — **perfect accuracy** — to buy back the thing you do need: **memory**.

---

<a name="idea"></a>
# 2. The idea: a bit array + k hash functions

> **Definition:** a Bloom filter is a space-efficient probabilistic data structure that tests whether an element **might be** in a set — trading a small, tunable false-positive rate for a massive reduction in memory versus storing the actual elements.

The structure is almost embarrassingly simple:

- An array of **m bits**, all initialized to `0`. Not bytes — **bits**.
- **k independent hash functions**, each mapping any input to a position in `0 … m-1`.

**Insert(x):** run `x` through all `k` hash functions, and set **all k** resulting bit positions to `1`.

**Query(x):** run `x` through the same `k` hash functions, and check the resulting bit positions.
- If **any** of them is `0` → `x` was **definitely never inserted**.
- If **all** of them are `1` → `x` **might have been inserted** (or it's a collision — see §4).

```
Insert("cat")  →  hash1("cat"), hash2("cat"), hash3("cat")  →  set those 3 bits to 1
Query("cat")   →  same 3 positions  →  all 1?  → "maybe seen"
                                    →  any 0?   → "definitely not seen"
```

Notice what's **never stored**: the string `"cat"` itself. Only a scattering of `1` bits that `"cat"` happened to set — which is exactly why it's so much smaller than a hash set, and exactly why it can never tell you *which* elements are in it, or enumerate them.

---

<a name="example"></a>
# 3. Worked example — insert and query by hand

A tiny bit array, `m = 20` bits, `k = 3` hash functions, all bits start at `0`:

```
index:  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19
bit:    0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0
```

**Insert "cat"** — say `hash1("cat")=3`, `hash2("cat")=7`, `hash3("cat")=11`. Set those bits:

```
index:  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19
bit:    0  0  0  1  0  0  0  1  0  0  0  1  0  0  0  0  0  0  0  0
                 ↑           ↑           ↑
```

**Insert "dog"** — `hash1("dog")=5`, `hash2("dog")=7`, `hash3("dog")=14`. Bit 7 is already `1` (shared with "cat") — that's expected and fine:

```
index:  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19
bit:    0  0  0  1  0  1  0  1  0  0  0  1  0  0  1  0  0  0  0  0
```

**Query "cat"** — check bits 3, 7, 11 → all `1` → **"maybe present."** Correct — it was inserted.

**Query "fish"** — `hash1("fish")=3`, `hash2("fish")=9`, `hash3("fish")=14`. Bit 9 is `0` → **"definitely not present."** Correct, even though bits 3 and 14 happen to be `1` from other elements — **one zero is enough to prove absence**, no matter what the other bits say.

**Query "bird"** (never inserted) — say `hash1("bird")=5`, `hash2("bird")=7`, `hash3("bird")=11`. All three bits were set — by "cat" and "dog," coincidentally. The filter says **"maybe present"** — **wrong**. This is the false positive, and it's the entire cost of the structure.

```
"bird" was never inserted, but its 3 hash positions
happen to have all been set by OTHER elements  →  false positive
```

---

<a name="tradeoff"></a>
# 4. Why false positives happen, and why false negatives never do

**False positive — possible.** Bits are shared across every element ever inserted. As more elements go in, more bits flip to `1`, and eventually some *uninserted* element's k positions can all coincidentally already be `1` (the "bird" case above). The filter has no way to distinguish "these bits are 1 because of me" from "these bits are 1 because of everyone else."

**False negative — structurally impossible.** Insertion only ever sets bits to `1`; nothing ever flips a bit back to `0` (in the basic version — no deletion). So if `x` was actually inserted, its k bits are guaranteed still `1` forever, and a query for `x` will always find all k bits set. The one-sided guarantee is the whole design:

```
                  Bloom filter says "seen"     Bloom filter says "not seen"
Actually seen:    ✅ always correct             impossible — never happens
Actually unseen:  ⚠️ sometimes wrong (FP)       ✅ always correct
```

This asymmetry is *why* it's usable at all: you get a hard guarantee in one direction ("not seen" is always trustworthy) and a tunable error rate in the other ("seen" is only probably true). Every real use of a Bloom filter is built around putting the **cheap, safe check** ("definitely not seen? skip the expensive work") in front of an authoritative source that resolves the rare "maybe" case.

```
query → Bloom filter
          │
          ├── "definitely not seen"  →  skip the expensive lookup entirely  ✅ fast path
          └── "maybe seen"           →  fall through to the real check (DB / hash set / re-crawl-skip)
```

---

<a name="math"></a>
# 5. The math: sizing it, and the false-positive rate

Three knobs, and they trade off against each other:

- `n` — number of elements you'll insert
- `m` — size of the bit array
- `k` — number of hash functions

**False-positive probability**, for a filter with `n` elements inserted into `m` bits using `k` hash functions:

```
p ≈ (1 − e^(−kn/m))^k
```

Intuition without the derivation: more inserted elements (`n`) → more bits set → higher `p`. More bits (`m`) → sparser array → lower `p`. `k` has a sweet spot — too few hash functions and each element barely spreads out (bits collide more directly); too many and *every* insert sets so many bits that the whole array fills up fast.

**Optimal number of hash functions**, given `m` and `n` are already chosen:

```
k = (m/n) · ln(2)   ≈  0.693 · (m/n)
```

**Bits needed per element**, to hit a target false-positive rate `p`:

```
m/n = −(ln p) / (ln 2)²   ≈  1.44 · log₂(1/p)
```

**Worked sizing example:** you want to dedup **1 billion URLs** (`n = 1,000,000,000`) at a **1% false-positive rate** (`p = 0.01`):

```
m/n ≈ 1.44 · log₂(100) ≈ 1.44 × 6.64 ≈ 9.58 bits per element
m   ≈ 1,000,000,000 × 9.58 ≈ 9.58 billion bits ≈ ~1.2 GB
k   ≈ 0.693 × 9.58 ≈ 6.6 → round to 7 hash functions
```

**~1.2 GB to dedup a billion URLs at 1% error**, versus the ~70–100 GB a plain hash set of those same URLs would cost. That ~60–80× compression is the entire value proposition in one number. Want a lower error rate (0.1%)? `m/n` roughly doubles to ~14.4 bits/element — still a rounding error next to a hash set.

```
tighter false-positive target  →  more bits per element  →  bigger array, still tiny vs. a hash set
```

---

<a name="when"></a>
# 6. When to pick it

Reach for a Bloom filter when **all** of these are true:

- You need **approximate set membership**, not exact — occasional false positives are tolerable for your use case.
- The set is **large enough that storing it exactly is expensive** (memory, network transfer, or disk I/O to check).
- You can afford to **never delete** elements (or you're willing to use the counting variant, §7, at extra memory cost).
- You don't need to **enumerate** or **retrieve** the stored elements — a Bloom filter only answers "is X in here?", nothing else.
- A **false positive has a cheap fallback** — the "maybe" case can fall through to an authoritative, slower check (DB query, re-crawl skip, full comparison) without breaking correctness.

**Don't** reach for it when:
- You need exact membership with zero tolerance for error (e.g., checking a password against a banned-password list where a false positive locks out a legitimate password — usually fine; but checking "is this transaction ID already processed" for financial dedup where a false positive silently drops a legitimate transaction is *not* fine unless the fallback path is solid).
- The dataset is small enough that a plain hash set already fits comfortably in memory — the complexity isn't worth it.
- You need to delete elements and can't spare the extra memory a counting Bloom filter needs.

---

<a name="variants"></a>
# 7. Variants: counting, scalable, cuckoo filters

- **Counting Bloom filter** — replaces each bit with a small counter (e.g. 4 bits). Insert increments each of the k counters, delete decrements them, query checks all are non-zero. Supports deletion, at ~4× the memory of the basic bit-array version.
- **Scalable Bloom filter** — starts small and adds a new filter layer (with a tighter false-positive rate) once the current one fills past capacity, instead of requiring `n` to be known upfront.
- **Cuckoo filter** — an alternative structure (built on cuckoo hashing) that supports deletion natively without a counting overhead, and often has better space efficiency at low false-positive rates. Trade-off: worse behavior as the filter approaches full capacity (insert failures), and the design is more complex.

```
                  delete supported?     needs n upfront?     memory vs basic filter
Basic Bloom       no                    yes                  baseline
Counting Bloom    yes                   yes                  ~4×
Scalable Bloom    no                    no                    grows as needed
Cuckoo filter     yes (native)          yes                   often less, at low p
```

For most interview answers, naming the **basic filter + the false-positive/false-negative trade-off** is the core; mentioning **counting Bloom filter as the answer to "what if you need to delete?"** is the one follow-up worth having ready.

---

<a name="used"></a>
# 8. Where it's actually used

- **Web crawlers** — "have I seen this URL?" before enqueueing, at billion-URL scale (Problem 08).
- **Caching — cache penetration guard** (Part 5) — before querying the DB for a key, check a Bloom filter of "keys known to exist"; a "definitely not seen" skips the DB entirely instead of taking a guaranteed miss.
- **Databases** — Cassandra, HBase, and other LSM-tree stores keep a Bloom filter per SSTable so a read for a key that isn't in that file can skip the disk I/O entirely, checking only the files that might contain it.
- **Browsers** — Chrome's Safe Browsing historically used a Bloom filter (now a variant) to check a URL against a huge malicious-site list without shipping the whole list to every client.
- **Distributed systems / CDNs** — deduping requests, checking "have we already forwarded this," membership checks that would otherwise require a network round-trip to an authoritative store.
- **Package managers / spell checkers** — quick "does this word/package name exist" pre-check before a full dictionary/registry lookup.

---

<a name="interview"></a>
# 9. Interview questions & answers

### Q: "What problem does a Bloom filter solve?"
> *"Answering 'have I seen this before?' for a set so large that storing every element exactly — a hash set — costs too much memory. A Bloom filter answers approximate membership using a bit array and several hash functions instead of storing the elements themselves, which gets you orders-of-magnitude memory savings in exchange for a small, tunable false-positive rate."*

### Q: "How does it work, mechanically?"
> *"An array of m bits, all zero, plus k hash functions. Inserting an element hashes it k times and sets those k bit positions to 1. Querying hashes it the same k ways and checks those positions — if any bit is 0, the element was definitely never inserted; if all k are 1, it was probably inserted, but that could also be a coincidence from other elements sharing those same bit positions."*

### Q: "Can a Bloom filter give a false negative?"
> *"No, structurally impossible in the basic version. Insertion only ever sets bits to 1, never clears one back to 0. So if an element was actually inserted, its k bits are guaranteed to still be 1 whenever you query it later. False positives are possible — other elements can coincidentally set the same bits — but false negatives can't happen."*

### Q: "Why is that one-directional guarantee useful?"
> *"Because it lets you put the Bloom filter in front of an expensive, authoritative check as a fast pre-filter. 'Definitely not seen' is always trustworthy, so you skip the expensive check entirely. 'Maybe seen' just falls through to the real check to resolve the rare false positive. You only pay the expensive path on a small fraction of lookups instead of every one."*

### Q: "How do you size one — what determines the false-positive rate?"
> *"Three things trade off: the number of elements n, the bit-array size m, and the number of hash functions k. More bits per element lowers the false-positive rate; the optimal k is about 0.693 times m/n. As a rule of thumb, roughly 9.6 bits per element gets you about a 1% false-positive rate — for a billion elements that's about 1.2GB, versus tens of gigabytes for a real hash set of the same data."*

### Q: "Can you delete from a Bloom filter?"
> *"Not from the basic version — you can't just flip a bit back to 0, because that bit might be shared with other elements still in the set, and clearing it would introduce a false negative, which the structure is supposed to never produce. If you need deletion, use a counting Bloom filter — small counters instead of bits — at roughly 4x the memory."*

### Q: "Bloom filter vs a plain hash set — when would you NOT use a Bloom filter?"
> *"When the dataset is small enough that a hash set fits comfortably in memory already, when you need exact membership with no error tolerance and no cheap way to double-check a 'maybe,' or when you need to enumerate or retrieve the actual stored elements — a Bloom filter can only answer yes/no on membership, never 'what's in here.'"*

---

<a name="cheatsheet"></a>
# 10. Cheat Sheet — everything on one page

### The problem
- "Have I seen this before?" at a scale where a hash set of the actual elements is too much memory (e.g. 10B URLs ≈ ~1TB as a hash set).

### The structure
- `m`-bit array, all `0` · `k` independent hash functions.
- **Insert(x):** hash x k ways, set those k bits to `1`.
- **Query(x):** hash x the same k ways — any bit `0` → definitely not present; all bits `1` → maybe present.

### The guarantee
- **False positive:** possible (other elements' bits coincidentally overlap).
- **False negative:** impossible (bits only ever get set, never cleared).
- Pattern: Bloom filter as a cheap pre-filter → "definitely not" skips the expensive check; "maybe" falls through to the authoritative source.

### The math
- `p ≈ (1 − e^(−kn/m))^k`
- Optimal `k ≈ 0.693 · (m/n)`
- Bits/element for target `p`: `m/n ≈ 1.44 · log₂(1/p)` → **~9.6 bits/element for 1% FP rate**.
- 1B elements @ 1% FP ≈ **~1.2GB** vs ~70-100GB for a real hash set.

### When to pick it
- Large set, approximate membership OK, false positives have a cheap fallback, no need to delete or enumerate.
- Need deletion? → counting Bloom filter (~4× memory). Don't know `n` upfront? → scalable Bloom filter.

### Used by
Web crawlers (URL dedup, Problem 08) · caching / cache-penetration guard (Part 5) · Cassandra/HBase SSTable read-path skip · Chrome Safe Browsing · CDNs/distributed dedup · package managers.

### Connects to
- Part 5: caching — cache penetration fix.
- Problem 08 (Web Crawler): the original motivating example, dedup at billion-URL scale.
- Part 24: consistent hashing — a different "which bucket" problem, easy to conflate with "is it a member" (this note) in an interview; keep the two straight.

*— End of Part 27 —*
