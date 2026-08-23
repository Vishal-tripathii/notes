# Database Study Notes — Part 09

## Schema Design — Embedding vs Referencing

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.

---

## Table of Contents

1. [The decision factors](#factors)
2. [Worked case: User + Address (embed)](#user-address)
3. [Worked case: User + Orders (reference)](#user-orders)
4. [Worked case: Blog + Comments (depends)](#blog-comments)
5. [Worked case: Chat Messages (reference)](#chat)
6. [Interview Questions & Answers](#interview)
7. [Cheat Sheet](#cheatsheet)

---

<a name="factors"></a>
## 1. The decision factors

Every embed-vs-reference decision comes down to three questions, and the answer to each pulls in a different direction:

1. **How often is the data read together?** Almost always together → embedding avoids a second query/join to read it. Often read independently → referencing avoids pulling data you don't need.
2. **How large could the embedded array grow, unbounded?** MongoDB has a **hard 16MB document size cap**. An array that grows without bound (comments on a viral post, messages in a long-running chat) will eventually hit that ceiling if embedded — this isn't a theoretical concern, it's a real production failure mode.
3. **How often is the sub-data queried independently of the parent?** If you frequently need to query/update the sub-data on its own (e.g. "find this specific order regardless of which customer it belongs to"), embedding makes that awkward — you can't index or query embedded sub-documents as cleanly as a standalone collection.

---

<a name="user-address"></a>
## 2. Worked case: User + Address → **embed**

```js
{
  _id: 1,
  name: "Alice",
  address: { street: "123 Main St", city: "Springfield", zip: "12345" }
}
```

**Why embed:** always fetched together with the user (you rarely need "just the address" independent of its user), and bounded in size — a user has one address, not an unbounded, growing collection of them. No real downside to embedding here.

---

<a name="user-orders"></a>
## 3. Worked case: User + Orders → **reference**

```js
// users collection
{ _id: 1, name: "Alice" }

// orders collection, referencing the user
{ _id: 101, userId: 1, amount: 250, items: [...] }
```

**Why reference:** orders grow **unbounded** over a user's lifetime — a long-time customer could have thousands of orders, which would blow past the 16MB cap if embedded in the user document. Orders are also frequently queried **independently** of the user ("show me today's orders across all customers," "find order #101") — a pattern embedding makes much harder to serve efficiently.

---

<a name="blog-comments"></a>
## 4. Worked case: Blog + Comments → **depends**

This is the deliberately ambiguous case, and naming *why* it's ambiguous is the actual point:

- **Low comment volume, rarely queried independently** (a small internal blog) → embedding is fine, and you get the post + its comments in one read.
- **High comment volume, or comments need independent querying/moderation** (a public post that could go viral, or an admin needs to query/delete comments across all posts) → reference, same reasoning as User + Orders: unbounded growth risk plus a real need to query the sub-data on its own.

A credible answer names both branches and the factor that decides between them — not a single fixed answer, since the "right" choice genuinely depends on realistic scale and access pattern.

---

<a name="chat"></a>
## 5. Worked case: Chat Messages → **reference**

```js
// conversations collection
{ _id: 1, participants: [1, 2] }

// messages collection, referencing the conversation
{ _id: 501, conversationId: 1, senderId: 1, text: "hey", sentAt: ISODate(...) }
```

**Why reference:** unbounded growth (an active chat can accumulate millions of messages over its lifetime — guaranteed to hit the 16MB cap if embedded) combined with genuinely high write volume (every new message is a write) — embedding would mean every new message rewrites/grows the entire parent document, which gets progressively more expensive as the array grows, unlike an `insertOne` into a separate `messages` collection which stays cheap regardless of history size.

---

<a name="interview"></a>
## 6. Interview Questions & Answers

**Q: What actually decides embed vs reference — not the examples, the underlying factors?**
A: Three things: how often the data is read together with its parent (favors embedding), how large the embedded data could grow unbounded (the 16MB document cap makes this a hard constraint, not just a style preference, and favors referencing past a certain size), and how often the sub-data needs to be queried or updated independently of the parent (favors referencing, since embedded sub-documents are awkward to query/index on their own).

**Q: User + Address vs User + Orders — why opposite decisions?**
A: Address is bounded (one per user) and always read together with the user — embed. Orders are unbounded over a user's lifetime and frequently queried independently of the user (e.g. "find order #101," "today's orders across all customers") — reference.

**Q: Why can't you just embed chat messages in the conversation document?**
A: Two compounding problems: unbounded growth guaranteed to eventually hit MongoDB's 16MB document cap, and high write volume — every new message would mean rewriting/growing the entire conversation document, which gets more expensive as history accumulates, versus a cheap `insertOne` into a separate messages collection regardless of how much history already exists.

---

<a name="cheatsheet"></a>
## 7. Cheat Sheet

- Decision factors: (1) read-together frequency, (2) unbounded growth risk against the **16MB document cap**, (3) need to query sub-data independently.
- User + Address → embed (bounded, always together).
- User + Orders → reference (unbounded, queried independently).
- Blog + Comments → depends on volume + independent-query need — name both branches.
- Chat Messages → reference (unbounded + high write volume, embedding would make every write progressively more expensive).
- **SQL vs NoSQL:** this whole decision doesn't exist in SQL — relational modeling normalizes by default and reassembles via joins ([Part 01](01-joins.md)); Mongo's document model is what makes "embed vs reference" a real, per-relationship choice in the first place. Full comparison → [Part 20](20-sql-vs-nosql-comparison.md).
