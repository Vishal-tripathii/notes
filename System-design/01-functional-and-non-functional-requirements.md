# System Design Study Notes — Part 1

## Functional & Non-Functional Requirements (+ What is System Design)

> **Format:** This document is written as **Q&A** — my prompts are the questions, the explanations are the answers. It is a complete capture of the chat, reorganized and expanded into study material. Diagrams have been added for clarity.

---

## Table of Contents

1. [Q1: What are functional and non-functional requirements? (quick intro)](#q1)
2. [Q2: What is system design? (complete beginner)](#q2)
3. [Q3: Explain FR & NFR with real-life examples + interview questions](#q3)
4. [Q4: Uber exercise — my answers + feedback + best answers](#q4)
5. [Cheat Sheet — everything on one page](#cheatsheet)

---

<a name="q1"></a>
# Q1: What are functional and non-functional requirements?

## The core distinction

- **Functional requirements (FRs)** describe **what** the system does — the features and behaviors.
  - They answer: *"What should the system let users do?"*
- **Non-functional requirements (NFRs)** describe **how well** the system does it — the qualities and constraints.
  - They answer: *"How fast, how reliable, how scalable, how secure?"*

**A useful mental test:**
- If you can phrase it as *"The system shall let a user ___"* → it's usually **functional**.
- If you phrase it as *"The system shall be/do ___ (within some measurable limit)"* → it's usually **non-functional**.

---

## Functional requirements

These map directly to features.

**Example — URL shortener (a classic):**
- A user can submit a long URL and get back a short URL
- A user visiting the short URL is redirected to the original
- A user can create a custom alias (e.g. `short.ly/my-link`)
- A user can see click analytics for their links
- Links can expire after a set time

**Example — Twitter/X-like feed:**
- Post a tweet
- Follow/unfollow users
- View a home timeline of people you follow
- Like and retweet

> These are all **observable behaviors** a user or another system can trigger.

---

## Non-functional requirements

These are the **"-ilities"** plus a few others. The important ones in system design:

| Category | Question it answers | Example target |
|---|---|---|
| **Scalability** | Can it grow with load? | Handle 100M URLs, 10K reads/sec |
| **Availability** | How much uptime? | 99.99% (≈52 min downtime/year) |
| **Latency / Performance** | How fast per request? | Redirect in < 100ms (p99) |
| **Consistency** | Do all users see the same data? | Eventual vs. strong consistency |
| **Durability** | Can we lose data? | No data loss once written |
| **Reliability / Fault tolerance** | Survives failures? | Survive a node/AZ going down |
| **Security** | Who can do what? | Auth, encryption, rate limiting |
| **Maintainability / Cost** | Sustainable to run? | Fit within a budget |

> **The critical thing about NFRs:** they must be **measurable.**
> - ❌ "The system should be fast" (useless)
> - ✅ "p99 read latency under 100ms" (an engineering constraint you can design toward and test against)

---

## Why the distinction matters in design

**Key insight most beginners miss:** *NFRs drive your architecture more than FRs do.*

The functional requirements for a URL shortener are trivial — it's basically a hash map. What makes it an **interesting design problem** is the non-functional side: 100:1 read-to-write ratio, billions of URLs, sub-100ms redirects globally. Those NFRs are what force you into caching layers, CDNs, database sharding, and choosing eventual consistency.

**The workflow (interview + real design docs):**

1. **Clarify functional requirements** — scope the features, then *narrow* to the core 2–3 (you can't design everything).
2. **Nail down non-functional requirements** — get concrete numbers (scale, latency, availability). Often estimated from back-of-envelope math (DAU → QPS → storage).
3. **Then design** — every architectural choice should trace back to satisfying an NFR.

---

## A worked mini-example: "Design a pastebin"

**Functional:**
- Create a paste, get a URL
- Read a paste via its URL
- Optional expiration

**Non-functional:**
- Read-heavy (say 10:1 reads:writes)
- 10M new pastes/month
- Pastes up to 10MB
- 99.9% availability
- Reads served in < 200ms

**Why the NFRs decide the design:** That NFR set immediately tells you:
- Use **object storage (S3)** for large paste bodies rather than a relational DB
- Keep **metadata** in a fast-lookup store
- Put a **cache/CDN** in front for the read-heavy traffic

> The *functional* requirements alone would never have told you that.

---

<a name="q2"></a>
# Q2: What is system design? (complete beginner)

## What is system design?

**System design is deciding how to build software that many people use at once, reliably, without it falling over.**

When you write a small program — say a script that sorts a list — you don't need system design. It runs on one computer, one user, done.

But imagine building **WhatsApp**. Now you have:
- **Billions of messages** every day
- **Millions of people** online at the same moment
- Messages that **can't get lost**
- People **all over the world** who need it to feel fast
- A service that must **stay up** even when a computer somewhere breaks

No single computer can do that. So you figure out how to spread the work across **many computers**, store data in the right places, and keep everything coordinated. **That planning — how the pieces fit together — is system design.**

---

## Analogy: building a restaurant

| Cooking at home (small program) | Busy restaurant (real system) |
|---|---|
| You're the only cook | Multiple cooks working in parallel (**multiple servers**) |
| A few guests | A host managing who sits where (**load balancer**) |
| One fridge | A pantry and fridge for storage (**databases**) |
| Cook on demand | Pre-made popular items (**caching**) |
| — | A plan for when a cook calls in sick (**fault tolerance**) |
| — | A way to add staff on a busy Friday (**scalability**) |

> System design is being the person who plans that whole kitchen so it doesn't collapse under pressure. The recipes (code) matter, but *how the kitchen is organized* is the system.

---

## The core building blocks

| Term | Plain meaning | Restaurant version |
|---|---|---|
| **Client** | The user's device (phone, browser) | The customer |
| **Server** | A computer that does work for clients | A cook |
| **Database** | Where data is stored permanently | The pantry/fridge |
| **Load balancer** | Splits incoming traffic across servers | The host seating guests |
| **Cache** | Fast temporary storage for popular data | Pre-made dishes ready to serve |
| **API** | The agreed way clients ask servers for things | The menu (how you order) |

---

## What a system actually looks like

**The simplest possible web system:**

```
[Your phone]  ──asks for data──▶  [Server]  ──reads/writes──▶  [Database]
   (client)                                                    (storage)
```

**As it grows to handle more users:**

```
                        ┌──▶ [Server 1] ──┐
[Many phones] ──▶ [Load  │──▶ [Server 2] ──┤──▶ [Database]
                Balancer]│──▶ [Server 3] ──┘        ▲
                                                    │
                                              [Cache] (fast lookups)
```

> Same idea, just **more pieces to handle more load**. Almost all system design is variations on this theme: **add pieces to handle more users, more data, and more failures — while keeping it fast and correct.**

---

## The central tension: trade-offs

**Most important beginner lesson: there is rarely one "right" answer. Everything is a trade-off.**

- Want it **faster**? Add caching — but now data can be slightly stale.
- Want it to **never lose data**? Store multiple copies — but that costs more and is slower to write.
- Want to **handle more users**? Add servers — but now they need to coordinate, which adds complexity.

> A good system designer doesn't memorize "the answer." They understand the trade-offs and pick what fits the situation. That's why interviews ask you to **reason out loud** rather than recite.

---

## The learning roadmap

1. **Requirements** — what to build (functional) + constraints like scale/speed (non-functional).
2. **Estimation** — turn "1 million users" into real numbers (requests/second? storage?).
3. **Building blocks** — what each component (database, cache, load balancer, queue) does and when to use it.
4. **Putting it together** — design real systems (URL shortener, chat app, news feed) by combining blocks to meet requirements.
5. **Deep topics** — scaling databases, consistency, handling failures.

> **Definition to lock in:** System design = *planning how software components fit together so a system can serve many users quickly and reliably, while making smart trade-offs.*

---

<a name="q3"></a>
# Q3: Explain FR & NFR with real-life examples + interview questions

## Quick recap of the distinction

- **Functional (FR):** *What* the system does — the features. "A user can ___"
- **Non-functional (NFR):** *How well* it does it — the qualities. "The system must be ___ (fast/available/secure...)"

---

## Real-life example 1: Instagram

**Functional requirements (the features):**
- A user can upload a photo/video
- A user can follow other users
- A user can see a feed of posts from people they follow
- A user can like and comment on posts
- A user can search for other users

**Non-functional requirements (the qualities):**
- **Availability:** almost never down (people expect 24/7)
- **Low latency:** feed loads in under ~200ms
- **Scalability:** handle 500M+ daily users
- **Durability:** once your photo is uploaded, it must *never* be lost
- **Read-heavy:** far more people scroll than post — design must favor fast reads

> The features (FRs) are almost **boring**. What makes Instagram hard is the **non-functional** side.

---

## Real-life example 2: Banking / payment app

**Functional requirements:**
- A user can check their balance
- A user can transfer money to another account
- A user can view transaction history
- A user can pay a bill

**Non-functional requirements:**
- **Consistency (critical!):** transfer $100 → it must leave one account and arrive in the other — *never* both, never neither. **Top priority.**
- **Security:** bank-grade encryption, fraud detection, authentication
- **Durability:** transaction records can never be lost — ever
- **Availability:** high, but **correctness beats availability** — better to reject a transaction than process it wrong

**Instagram vs. Bank — the key lesson:**
- Instagram: a delayed "like" → nobody cares → **availability > perfect consistency**
- Bank: a wrong balance → disaster → **consistency > everything**

> 👉 **The same NFR categories exist for every system, but their priority order changes based on what the system does.** Recognizing which NFRs matter most for a given system is the real skill.

---

## Real-life example 3: Netflix / YouTube (video streaming)

**Functional requirements:**
- A user can search for a video
- A user can play/pause/seek a video
- A user gets recommendations
- A user can create a watchlist

**Non-functional requirements:**
- **Low latency + high throughput:** video streams smoothly without buffering
- **Availability:** 99.99%+
- **Scalability:** millions streaming simultaneously (peak evening hours)
- **Global reach:** a user in Tokyo and one in London both get fast playback (→ this NFR forces **CDNs**)

---

## The full "menu" of non-functional requirements

> Memorize these categories — in an interview you scan this list and pick the relevant ones.

| NFR | What it means | Ask yourself |
|---|---|---|
| **Scalability** | Handles growth in users/data | "How many users? Growing?" |
| **Availability** | Uptime; system stays reachable | "Can it ever be down?" |
| **Latency** | Speed of a single request | "How fast must a response be?" |
| **Throughput** | How many requests/sec total | "How much traffic overall?" |
| **Consistency** | All users see the same/correct data | "Must data be instantly correct everywhere?" |
| **Durability** | Data survives once stored | "Can we ever lose data?" |
| **Reliability** | Works correctly, survives failures | "What happens if a server dies?" |
| **Security** | Auth, encryption, protection | "Is data sensitive?" |
| **Maintainability** | Easy to change/operate | "Can the team evolve it?" |
| **Cost** | Affordable to run | "What's the budget?" |

> ⚠️ **Golden rule: an NFR must be measurable.**
> - ❌ "The system should be fast"
> - ✅ "p99 latency under 200ms"
>
> **"p99"** means *"99% of requests are faster than this"* — a common way to state latency targets.

---

## How to gather requirements in an interview

When the interviewer says *"Design Twitter,"* they're being deliberately vague to see if you ask good questions. **Do NOT start drawing boxes.** Spend the first ~5 minutes clarifying:

### Step 1 — Clarify functional scope, then narrow
> "Twitter has many features. Should I focus on the core: posting tweets, following users, and viewing a home timeline? Can I skip DMs, ads, and trending for now?"

Shows maturity — you can't design everything, so you scope down to the core 2–3 features.

### Step 2 — Pin down non-functional requirements with numbers
> - "How many daily active users — 100 million?"
> - "Is this read-heavy or write-heavy?" (Twitter: **read-heavy**)
> - "What latency is acceptable for loading the timeline?"
> - "Is it okay if a new tweet takes a few seconds to appear for followers?" (probing **consistency**)

### Step 3 — State your assumptions out loud so the interviewer can correct you.

> This clarification phase is **graded**. Candidates who skip it and start designing usually fail, because they solve the wrong problem.

---

## Common interview questions on requirements

**1. "What are the functional requirements for [system]?"**
→ List core user-facing features as "A user can ___" statements. Narrow to 2–4 core ones.

**2. "What are the non-functional requirements?"**
→ Scan the NFR menu. Pick the relevant ones *and state priority*: "For a payment system, consistency and durability come first; for a social feed, availability and latency come first."

**3. "Is this system read-heavy or write-heavy?"**
→ Drives the whole design. Social feeds, news, video = **read-heavy** (add caching/CDN). Analytics/logging = **write-heavy** (optimize for ingestion).

**4. "What's the read-to-write ratio?"**
→ e.g. Twitter is often cited as ~**100:1** reads to writes → justifies heavy caching.

**5. "Would you prioritize consistency or availability here?"**
→ Classic CAP-theorem trade-off. Bank → consistency. Social media → availability. **Always justify with the use case.**

**6. "What happens if this requirement changes — say 10x the users?"**
→ Tests whether your NFRs (and design) can scale.

---

## Worked example: Food delivery app (DoorDash / Uber Eats)

**Functional requirements:**
- A user can browse restaurants and menus
- A user can place an order
- A user can track their order in real time
- A driver can accept and deliver orders
- Payment processing

**Non-functional requirements (with priorities):**
- **Availability:** high — lost orders = lost money
- **Low latency:** browsing + order tracking feel instant
- **Consistency:** order state must be correct (can't be both "delivered" and "preparing")
- **Real-time updates:** live driver location tracking
- **Scalability:** handle dinner-time traffic spikes

---

<a name="q4"></a>
# Q4: Uber exercise — my answers, feedback & best answers

## Exercise prompt

> **Design a ride-sharing app like Uber.** Write out 3–4 functional requirements and 3–4 non-functional requirements (and which one matters *most*, and why).

---

## My submitted answers

**Functional requirements:**
- Users can log in
- Users can pick destination and pickup point
- Users can mark favorite locations
- Users can select the ride type (regular / premium)
- Drivers can reject and accept incoming ride requests
- Drivers can see the destination and ETA
- Drivers can mark ride as in-progress only after OTP received

**Non-functional requirements:**
- How many users at once handled by application
- During peak hours, how the fares are managed
- How too many ride requests are handled

---

## Feedback on functional requirements ✅

These were **strong**:

| My answer | Verdict |
|---|---|
| Users can log in | ✅ |
| Users can pick destination and pickup point | ✅ |
| Users can mark favorite locations | ✅ |
| Users can select ride type (regular/premium) | ✅ |
| Drivers can accept/reject incoming requests | ✅ |
| Drivers can see destination and ETA | ✅ |
| Drivers can start ride only after OTP verification | ✅ (great safety detail) |

**What was great:** Covered **both actors** (rider AND driver) — many beginners forget the driver side entirely. The OTP rule is a real safety feature Uber actually uses.

**Core FRs I missed** (the "heart" of a ride-share app):
- **Matching** — the system matches a rider to a nearby available driver (*the* core feature — everything else supports it)
- **Real-time location tracking** — rider sees the driver's car moving on the map
- **Fare calculation & payment** — the ride gets priced and charged
- **Rating** — rider and driver rate each other after the trip

> 💡 When listing FRs, ask: *"What's the single most important thing this app does?"* For Uber, it's **matching a rider with a driver**. Always make sure the core action is on your list.

---

## Feedback on non-functional requirements ⚠️

**Key learning moment.** I identified the right *concerns* — but phrased them as **questions**, not as **requirements**. This is the most common beginner mistake, and it's very fixable.

> An NFR is a **measurable target the system must hit**, not a question.

| My version (a question) | Rewritten as an NFR (a target) |
|---|---|
| "how many users at once" | "The system must support **10 million daily active users** and **100K concurrent ride requests**" |
| "how peak-hour fares are managed" | "The system must apply **surge pricing** and recalculate fares within **1 second** during peak demand" |
| "how too many requests are handled" | "The system must stay available and match riders within **~5 seconds even at peak load**" |

**Also noted:** "how fares are managed during peak hours" is actually closer to a **functional requirement** (surge pricing is a feature) *plus* an NFR (it must compute fast). Good instinct — just needs splitting.

---

## My "best answer" version

### Functional requirements
(⭐ = core; in an interview, focus on these)

- ⭐ A rider can request a ride (set pickup + destination)
- ⭐ The system **matches** the rider with a nearby available driver
- ⭐ A driver can accept or reject a ride request
- ⭐ Rider and driver see **real-time location** on a map during the trip
- A rider can select ride type (regular / premium)
- A driver starts the ride after **OTP verification**
- The system **calculates fare** (including surge pricing at peak) and processes payment
- Both parties can rate each other after the ride
- (Supporting) Users can log in; riders can save favorite locations

### Non-functional requirements (ranked — always rank them!)

1. **Availability (highest):** 99.9%+ uptime — a down app means lost rides and revenue.
2. **Low latency:** match a rider to a driver in **under ~5 seconds**; live location updates every 2–3 seconds.
3. **Scalability:** handle **10M+ daily users** and huge **peak-hour spikes** (Friday night, rain, events).
4. **Consistency (where it counts):** a driver can't be assigned to two rides at once; ride state (requested → accepted → in-progress → completed) must be correct.
5. **Location accuracy / real-time:** GPS updates must be timely and precise — the whole app depends on knowing where cars are.

### Ride state machine (referenced above)

```
[Requested] ──driver accepts──▶ [Accepted] ──OTP verified──▶ [In Progress] ──arrive──▶ [Completed]
     │                              │
     └──────no driver / cancel──────┴──▶ [Cancelled]
```

---

## The one takeaway to lock in

> **A functional requirement is a feature ("user can do X"). A non-functional requirement is a measurable quality target ("system does it within Y / at Z scale").**
> If your NFR is a question or has no number, it's not finished yet.

---

<a name="cheatsheet"></a>
# Cheat Sheet — everything on one page

### Definitions
- **System design** = planning how software components fit together to serve many users quickly & reliably, while making smart trade-offs.
- **Functional requirement (FR)** = *what* it does. Feature. "A user can ___"
- **Non-functional requirement (NFR)** = *how well* it does it. Measurable quality target.

### The requirement-gathering workflow (interview)
1. Clarify **functional** scope → narrow to core 2–4 features.
2. Pin down **non-functional** targets → get **numbers** (users, QPS, latency, availability).
3. State assumptions out loud.
4. *Then* design — every choice traces back to an NFR.

### NFR menu (scan & pick)
`Scalability · Availability · Latency · Throughput · Consistency · Durability · Reliability · Security · Maintainability · Cost`

### Golden rules
- ✅ NFRs must be **measurable** (❌ "fast" → ✅ "p99 < 200ms").
- 🎯 Always **rank** NFRs by priority for *this* system.
- ⚖️ Priority order changes by system: **Bank → consistency**; **Social media → availability**.
- 🔑 NFRs drive architecture more than FRs do.
- 🧠 There's rarely one right answer — everything is a **trade-off**.

### Read-heavy vs write-heavy
- **Read-heavy** (feeds, video, news) → caching + CDN. e.g. Twitter ~100:1 reads:writes.
- **Write-heavy** (analytics, logging) → optimize ingestion.

### Common interview questions
1. What are the functional requirements?
2. What are the non-functional requirements? (+ priority)
3. Read-heavy or write-heavy?
4. What's the read-to-write ratio?
5. Consistency or availability? (CAP trade-off — justify with use case)
6. What if the requirements 10x?

### Quick reference — priority by system type
| System | Top NFR priority |
|---|---|
| Banking / payments | Consistency, Durability, Security |
| Social media / feed | Availability, Latency |
| Video streaming | Latency, Throughput, Global reach (CDN) |
| Ride-sharing | Availability, Low-latency matching, Real-time location |

---

### Suggested next topics (not yet covered)
- **Capacity estimation** — turn "10M users" into QPS, storage, bandwidth.
- **CAP theorem** — the consistency vs. availability trade-off in depth.
- **Full system walkthrough** — design a URL shortener end-to-end.
- **How a request travels** — from a tap on your phone to the database and back.

*— End of Part 1 —*
