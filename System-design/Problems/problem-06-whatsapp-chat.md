# Design Problem 06 — WhatsApp / Chat System

> Worked end-to-end using the **[Master Framework](../00-DESIGN-PROBLEM-FRAMEWORK.md)**. Applies Parts 13, 21, 26. Signature challenge: real-time bidirectional delivery + message ordering + offline delivery guarantees (a message must arrive even if the recipient was offline when it was sent).

---

## Table of Contents

1. [Requirements](#requirements)
2. [Capacity Estimation](#estimation)
3. [API Design](#api)
4. [Core: real-time delivery](#core)
5. [Offline delivery](#offline)
6. [Message ordering](#ordering)
7. [Database](#db)
8. [Scaling](#scaling)
9. [Full architecture](#arch)
9.5. [**How the real system does it**](#realworld)
10. [Interview Q&A](#interview)
11. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements *(Part 1)*

**Functional:**
1. 1:1 messaging between two users.
2. Group messaging (small groups, e.g. up to a few hundred members).
3. Delivery status per message: **sent → delivered → read** (single/double/blue tick).
4. Online/offline **presence** ("last seen", "online now").
5. *(Optional)* typing indicators, media messages, message history sync on new device.

**Non-functional:**
- **Low latency** — a message should reach an online recipient in well under a second.
- **Reliable delivery** — a message must **never be lost**, even if the recipient is offline, the app is killed, or a server crashes mid-flight — stronger than "eventually consistent," more like "eventually delivered, exactly once, in order."
- **Ordering** — messages within one conversation must render in the order they were sent, even if network paths/servers differ.
- **High availability** — chat is core product; connection layer must survive server failures.
- **Massive concurrency** — billions of users, hundreds of millions **simultaneously connected**, not just making requests.

> **Not** a read-heavy key-value problem like the URL shortener — this is **stateful, bidirectional, low-latency delivery**. Write path IS the read path: a message write must immediately "read" out to the recipient.

---

<a name="estimation"></a>
# 2. Capacity Estimation *(Part 3)*

Assume 500M DAU, each user online ~2 hours/day, sending ~40 messages/day.

- **Concurrent connections:** 500M × (2/24) ≈ **~40M concurrent open WebSocket connections** at peak. (Real WhatsApp scale is higher — this is illustrative.)
- **Messages/day:** 500M × 40 ≈ **20B messages/day**
- **Messages/sec (avg):** 20B ÷ 86,400 ≈ **~230K/s** average; peak (evenings, holidays) → **~1M+/s**
- **Storage:** 20B msgs/day × ~150B (text + metadata) ≈ **~3 TB/day** → media (photos/video) is far larger and stored separately in blob storage (S3-like), not the message DB.
- **Connection-server capacity:** each box can hold ~50K–100K sockets (memory + file descriptors) → **40M ÷ 100K ≈ ~400 connection servers** just for holding sockets, before business logic.

> The number that changes everything vs. a stateless HTTP service: **you're sizing by concurrent open connections, not requests/sec** (Part 26).

---

<a name="api"></a>
# 3. API Design *(Part 11)*

Two contracts: the **connection handshake** (once per session) and the **message frames** (many per session) over that same socket.

```
# 1) Connection handshake — HTTP upgraded to WebSocket
GET /ws/connect?token=<authToken>
Upgrade: websocket
→ 101 Switching Protocols
   (server records: userId → this connection, on this server)

# 2) Client → Server: send message (over the open socket)
{
  "type": "MESSAGE",
  "clientMsgId": "uuid-generated-on-device",   ← for idempotency/dedup
  "conversationId": "conv_123",
  "recipientId": "user_456",                    ← or groupId
  "body": "hey!",
  "clientTimestamp": 1723190000
}

# 3) Server → Client: deliver message
{
  "type": "MESSAGE",
  "messageId": "srv_98213",
  "conversationId": "conv_123",
  "senderId": "user_789",
  "seq": 4821,              ← per-conversation sequence number (ordering)
  "body": "hey!",
  "serverTimestamp": 1723190001
}

# 4) Delivery status acks (bidirectional, over the same socket)
{ "type": "ACK_DELIVERED", "messageId": "srv_98213" }
{ "type": "ACK_READ",      "messageId": "srv_98213" }

# 5) Fallback REST (non-real-time paths — history, media upload)
GET  /conversations/{id}/messages?before={seq}&limit=50   ← paginated history
POST /media/upload → returns mediaUrl to embed in a MESSAGE frame
```

`clientMsgId` matters: mobile networks retry, so the client may send the same message twice — the server dedups on `clientMsgId` before assigning a `messageId`/`seq`, guaranteeing **exactly-once** semantics from the sender's perspective.

---

<a name="core"></a>
# 4. Core: real-time delivery 🎯

The signature problem: how does a message typed on Alice's phone reach Bob's phone **instantly**, when both are connected to *a server*, but not necessarily the *same* server?

## Why WebSocket, not polling *(cross-ref Part 26)*

| | Short/long polling | WebSocket |
|---|---|---|
| Direction | client keeps asking | ⇄ both sides push anytime |
| Latency | one interval, or held-request overhead | near-instant, one frame |
| Overhead/msg | full HTTP headers each time | tiny frame, no headers |
| Fits chat? | ❌ chat is bidirectional & high-frequency | ✅ exactly the use case (Part 26 comparison table) |

Chat needs **both** directions constantly (Alice sends, Bob's "read" receipt flows back) at high frequency — precisely the case Part 26 says WebSockets win: *"both sides talk constantly? → WebSocket."* Each client holds **one persistent WebSocket** to a **connection server** for the app session; the handshake is `Upgrade: websocket` → `101 Switching Protocols`.

## The routing problem — sender and recipient live on different servers

```
Alice ── connected to ── Connection Server 1
Bob   ── connected to ── Connection Server 3

Alice sends a message to Bob. Server 1 does NOT hold Bob's socket.
It cannot write to a TCP connection it doesn't own. So: how does
the message get from Server 1 to Server 3?
```

This is exactly the **fan-out problem** from Part 26. Two ingredients solve it:

**(1) A user → connection-server lookup (routing table).** Every connection server, on accepting a socket, registers `userId → serverId` in a shared, fast store (**Redis**, key-value):
```
SET presence:user_456 = "conn-server-3"   (+ TTL / heartbeat refresh)
```
When Server 1 needs to deliver to Bob, it looks up `presence:user_456` → `conn-server-3`, then forwards the message there (direct RPC, or via ingredient 2).

**(2) A Pub/Sub backplane between connection servers.** Rather than every server opening point-to-point RPC to every other server, all connection servers **subscribe to a shared bus** (Redis Pub/Sub, or Kafka/NATS for higher durability):
```
        Alice ── Conn Server 1                 Conn Server 3 ── Bob
                     │                               ▲
                     └── publish(user_456, msg) ──▶ [ Pub/Sub bus ] ──▶ every server receives
                                                        it, but only Server 3 (which owns
                                                        Bob's socket) actually pushes it down.
```
Server 1 publishes "deliver this to user_456"; **every** connection server receives the event, but only the one holding Bob's live socket (found via the presence lookup, or because it's subscribed to a per-user channel) forwards it over the WebSocket. This decouples *"who received the send request"* from *"who holds the recipient's live connection"* — precisely Part 26's fan-out fix.

**Combining the two:** the presence table tells you *which* server owns the socket; the Pub/Sub bus (or a direct RPC once you know the server id) is *how* you get the message there. At scale, a common refinement is per-server Pub/Sub channels (`channel:conn-server-3`) instead of broadcasting every message to all N servers.

---

<a name="offline"></a>
# 5. Offline delivery

If the presence lookup for Bob returns **nothing** (no connection server owns his socket — phone is off / app killed / no network), the message can't be pushed live. It must not be dropped — this is where the *reliable delivery* requirement bites.

## Store-and-forward pattern

```
Alice sends "hey!" to Bob (offline)
        │
        ▼
Connection Server 1
        │
        ├──► 1. WRITE message to durable storage FIRST
        │       (per-conversation message store, e.g. Cassandra)
        │       — this is the source of truth; nothing is "sent"
        │         until this write succeeds.
        │
        ├──► 2. Enqueue into Bob's per-user "inbox" / undelivered-message queue
        │       (marks the message as pending delivery to user_456)
        │
        ├──► 3. Presence lookup: Bob not connected anywhere
        │       → trigger a mobile PUSH NOTIFICATION (APNs/FCM)
        │         "You have a new message" — wakes the OS-level
        │         notification, NOT the message content necessarily.
        │
        ▼
   (time passes — Bob's phone reconnects)
        │
        ▼
Bob opens app → new WebSocket handshake → Connection Server X
        │
        ├──► registers presence: user_456 → Server X
        ├──► drains Bob's per-user inbox/queue (all messages with
        │       seq > lastAckedSeq for each conversation)
        └──► pushes them down the fresh socket, in order
                → client sends ACK_DELIVERED for each
                → server marks them delivered, dequeues
```

Key points:
- The **durable write happens before** any delivery attempt — a message is "sent" the instant it's persisted, independent of whether the recipient is reachable.
- **Push notification ≠ message delivery.** APNs/FCM just wakes the device/app; the actual content is fetched over the WebSocket/REST channel once the client reconnects and authenticates — avoids relying on third-party push infra for guaranteed, ordered, decrypted delivery.
- The **per-user inbox is the retry mechanism** — on reconnect the client asks "give me everything after sequence N," which also covers "was connected but missed a message" from a network blip (Part 26: missed-message catch-up via sequence numbers).
- Delivery status (`sent` → `delivered` → `read`) is just state transitions on the stored message row, updated by ACK frames.

---

<a name="ordering"></a>
# 6. Message ordering

## Per-conversation sequence numbers, not global ones

Each **conversation** (1:1 or group) has its own monotonically increasing counter. Every message in that conversation gets the next `seq`:
```
conv_123:  seq 1 → seq 2 → seq 3 → seq 4 ...
conv_456:  seq 1 → seq 2 → seq 3 ...          ← independent counter, unrelated to conv_123
```
- The client renders a conversation by sorting on `seq` (or a hybrid `(seq, serverTimestamp)`), so out-of-order network delivery — Bob's client receiving message 4 before message 3 because they routed through different servers or retried — is corrected locally by buffering/reordering before render.
- **Why global ordering isn't needed:** nobody cares whether Alice's message to Bob happened "before" or "after" some unrelated message Charlie sent to Dave in a different conversation — there is no shared timeline across conversations. Enforcing a single global order across billions of independent conversations would mean **coordinating a single counter across the whole system** — a severe bottleneck and single point of contention for zero user-facing benefit. Scoping ordering to the conversation lets each conversation's counter live independently (even shard independently), which is exactly what horizontal scaling needs.
- Sequence numbers double as the **offline catch-up cursor** (Part 5): "send me everything in conv_123 after seq 41."

---

<a name="db"></a>
# 7. Database *(Part 8)*

Chat history is **write-heavy**, append-only, and always queried the same way: *"give me messages in conversation X, in a range of sequence numbers/time, most recent first."* No joins, no ad-hoc queries.

```
Partition key: conversationId
Clustering key: seq (or timestamp)   ← rows physically stored sorted by this

conversationId | seq | senderId | body | sentAt | deliveredAt | readAt
```

**Why a wide-column NoSQL store (Cassandra / DynamoDB / HBase) fits well:**
- **Write-optimized:** Cassandra's LSM-tree storage engine is built for high sustained write throughput (~1M msgs/sec peak, from estimation) — much better suited than a B-tree-indexed relational table under this write load.
- **Query pattern is a simple range scan:** "rows for `conversationId`, `seq` between X and Y" is *exactly* how wide-column stores are modeled — partition by `conversationId`, cluster/sort by `seq`. No complex joins needed, ever.
- **Horizontally scalable by design:** partitioning by `conversationId` spreads both storage and write load across the cluster naturally (see Scaling below) — each conversation's rows live together on one partition, so reads/writes never scatter across the cluster.
- **Tunable consistency:** Cassandra lets you choose per-query consistency (e.g. write to a quorum of replicas) — a good fit for "must not lose a message" without needing full relational ACID transactions, which chat doesn't need (no cross-row transactions across conversations).

A **separate** presence store (Redis, in-memory, TTL-based) holds ephemeral `userId → connectionServer` state — that data is *not* durable history, so it doesn't belong in Cassandra.

---

<a name="scaling"></a>
# 8. Scaling

Order of concern for this problem: **connection capacity → routing/presence → fan-out bus → storage.**

### Sharding connection servers
Connection servers don't shard data — they shard **sockets**. Users are simply distributed across the pool (by load, or consistent hashing on `userId` for some affinity), each server holding as many live sockets as memory/FDs allow (~50K–100K/box from the estimate). The **LB in front must be connection-aware / sticky** (Part 2.5 extended by Part 26): once a client's WebSocket lands on Server K, it stays pinned there for the session — you can't load-balance a single live socket across multiple backends.

### Presence service
The `userId → connectionServer` mapping is itself a hot, high-QPS key-value workload (every connect/disconnect writes it, every message send reads it) — **Redis**, sharded by `userId` hash, with a **TTL + heartbeat** so a crashed connection server's stale entries expire instead of black-holing messages forever.

### The Pub/Sub fan-out layer
A single Redis Pub/Sub instance or a single Kafka topic becomes the bottleneck at hundreds of connection servers × millions of messages/sec. Scale it by **partitioning the bus itself** — e.g. Kafka partitioned by `conversationId` or by target `connectionServerId`, so each connection server only subscribes to (and receives) traffic actually addressed to sockets it holds, instead of every server seeing every message. This turns "broadcast to all N servers" into "route to the 1 server that needs it," which is what keeps fan-out cost flat as the connection-server fleet grows.

### Database scaling
Cassandra shards (partitions) naturally by `conversationId` — add nodes, the consistent-hash ring redistributes partitions, no resharding logic to hand-write. Replication (Part 21) across nodes/racks/AZs gives both durability (no lost messages on node failure) and read availability for history queries.

### Group messaging fan-out
For a group of size N, one send fans out to N recipients — the sender's connection server publishes once per recipient (or once to a group-fanout worker) which then does the same per-user presence-lookup + push/queue flow as 1:1. Very large groups (broadcast channels) typically move to a different, more asynchronous delivery model rather than true real-time WebSocket push to every member.

---

<a name="arch"></a>
# 9. Full architecture diagram

```
[Alice's phone]                                      [Bob's phone]
      │  wss:// (persistent)                                │  wss:// (persistent)
      ▼                                                      ▼
[Connection-aware LB / sticky]                    [Connection-aware LB / sticky]
      │                                                      │
[Connection Server 1] ◀──────────────────────────▶ [Connection Server 3]
      │        (holds Alice's socket)                (holds Bob's socket, if online)
      │
      ├──► Presence Service (Redis: userId → connServerId, TTL+heartbeat)
      │        lookup Bob → conn-server-3 (or "offline")
      │
      ├──► Pub/Sub Backplane (Redis Pub/Sub / Kafka, partitioned)
      │        publish "deliver to user_456" ──► only Server 3 forwards to Bob's socket
      │
      ├──► Message Store (Cassandra, partition=conversationId, cluster=seq)
      │        durable write happens BEFORE delivery is attempted — source of truth
      │
      └──► If Bob offline: per-user inbox queue + Push Notification Service
               (APNs/FCM) wakes device → Bob reconnects → drains inbox by seq

[Media uploads] → separate blob storage (S3-like) + CDN, referenced by URL in messages
```

---

<a name="realworld"></a>
# 9.5 How the real system does it 🌐

WhatsApp is the best-documented case study in this whole folder, and the headline fact **directly challenges the estimate in §2 and §8**.

### The number that should change your answer

§8 assumes **~50K–100K sockets per box**. WhatsApp ran **~2 million concurrent connections per server.**

That's a **20–40× gap**, and it isn't hardware — it's the **concurrency model**:

| | Thread-per-connection (typical JVM/OS-thread model) | WhatsApp (Erlang/BEAM) |
|---|---|---|
| Unit per connection | An OS thread — ~1MB of stack, scheduled by the kernel | An **Erlang process** — ~**300 bytes**, scheduled by the BEAM VM |
| 2M connections means | 2M OS threads — impossible; the kernel scheduler dies long before the memory does | 2M lightweight processes — routine for BEAM |
| Failure blast radius | A crash can take the process/thread pool with it | Processes are **isolated**; one dying connection kills only its own process |

The design consequence: **the cost of an idle connection is what determines your fanout**, and a chat system is overwhelmingly idle connections. If holding a socket costs a megabyte, you're buying servers to hold silence. Erlang was built for telecom switches — massive numbers of mostly-idle, independently-failing connections — which is *exactly* the shape of a messaging app.

> **How to use it:** *"I'd size connection servers by what it costs to hold an idle socket, since a chat system is mostly idle connections. On a thread-per-connection model that's roughly a megabyte of stack each, so you're at tens of thousands per box. WhatsApp got to about two million per server on Erlang, where a connection is a ~300-byte VM process rather than an OS thread. I'd design for the pattern regardless — event-loop or green-thread concurrency, never thread-per-connection — but it's worth knowing the ceiling moves by more than an order of magnitude based on that one choice."*

That reframes the whole connection-tier sizing conversation, and it's the single most valuable thing to carry out of this problem.

### Other reference points worth having

- **~50 engineers** serving **900M users** at the point of the Facebook acquisition — the standing counter-example to "scale requires headcount." What bought it: a runtime whose concurrency and fault-isolation model matched the problem, and a deliberately narrow feature set.
- **~40 billion messages/day**; published figures from the ~500M-user era cite **~11,000 cores** and peaks around **70M messages/sec** across the fleet.
- **Every active connection is its own process**, holding that user's session state. Message delivery is then literally "send a message to that process" — Erlang's built-in primitive. The routing layer in §4 is doing by hand what BEAM provides natively, which is why the architecture looks so simple relative to its scale.

### The honest caveat

Don't over-index on "use Erlang." The interviewer is testing whether you understand **why** it fit — mostly-idle connections, cheap isolation, per-connection failure containment — not whether you'd pick that language. Go's goroutines, Rust's async tasks, or a Node/epoll event loop get you into the same regime. **The anti-pattern to name is thread-per-connection**, and that's the transferable lesson.

---

<a name="interview"></a>
# 10. Interview Q&A

### Q: "Why WebSockets instead of polling for chat?"
> *"Chat is genuinely bidirectional and high-frequency — both users send and receive constantly, including small control messages like read receipts. Polling either wastes requests on empty responses or adds latency, and even long polling is one request-response cycle per message. A WebSocket is a single persistent connection where either side can push instantly with almost no per-message overhead, which is exactly what a low-latency, bidirectional workload needs."*

### Q: "Alice and Bob are connected to different servers. How does Alice's message reach Bob?"
> *"I keep a presence registry in Redis mapping userId to the connection server that holds their socket. When Alice's server gets the message, it looks up Bob's entry — if he's connected somewhere, that lookup tells me which server. I don't want every connection server RPC-ing every other server directly, so I put a Pub/Sub bus — Redis Pub/Sub or Kafka — between them. Alice's server publishes the message; every connection server is subscribed, but only the one actually holding Bob's socket forwards it down the wire. That decouples 'who received the send' from 'who owns the live connection.'"*

### Q: "What happens if Bob is completely offline when Alice sends the message?"
> *"The message still gets written durably first — to the per-conversation store in Cassandra — before I even attempt delivery, so it's never lost regardless of whether Bob is reachable. It also goes into a per-user pending-delivery queue for Bob, and I trigger a push notification through APNs or FCM just to wake his device — the notification doesn't carry the real content, it just tells the app to reconnect. When Bob's client opens a fresh WebSocket, it registers presence again and drains its inbox — everything since its last acknowledged sequence number — in order."*

### Q: "How do you guarantee messages aren't lost or duplicated?"
> *"Not lost: the durable write to the message store happens before delivery is attempted, and it's the source of truth independent of connection state — offline just means delivery is deferred, not skipped, via the per-user queue. Not duplicated: the client generates a unique clientMsgId when it composes a message, and the server dedups on that before assigning a real messageId and sequence number, so a retried send from a flaky mobile network doesn't create two messages."*

### Q: "How do you keep messages in the right order?"
> *"I use a per-conversation sequence number, not a global one — each conversation has its own counter, and the client sorts and renders by that. Global ordering across every unrelated conversation in the system isn't something users perceive or need, and enforcing it would mean coordinating one counter across the whole platform, which is a massive bottleneck for zero benefit. Scoping it to the conversation also lets ordering and storage shard independently per conversation, which is what lets the system scale horizontally."*

### Q: "Why Cassandra (or a similar wide-column store) for message history instead of a relational database?"
> *"The access pattern is always the same: give me messages in one conversation in a sequence range, most recent first — no joins, no ad-hoc filters. That maps directly onto a wide-column model: partition by conversationId, cluster by sequence number, so the rows for one conversation are physically stored together and a range read is cheap. It's also write-optimized via an LSM-tree engine, which matters because chat is extremely write-heavy — hundreds of thousands to millions of messages per second at peak — and it shards naturally by conversationId as the cluster grows."*

### Q: "How do you scale the connection layer itself?"
> *"Connection servers are sized by concurrent open sockets, not requests per second, so I keep them as a dedicated fleet — tens of thousands of sockets per box — behind a load balancer that's connection-aware and keeps each socket sticky to one server for its session, since you can't split a single live WebSocket across backends. Presence lookups and the Pub/Sub bus both need to scale alongside that fleet — I'd partition the bus itself, for example by target connection-server id, so each server only receives traffic actually addressed to sockets it holds instead of seeing every message in the system."*

---

<a name="cheatsheet"></a>
# 11. Cheat Sheet

- **Shape:** stateful, bidirectional, low-latency delivery — NOT a stateless read-heavy lookup. Sized by **concurrent connections**, not QPS.
- **Estimate:** ~40M concurrent sockets, ~230K msgs/s avg (~1M+/s peak), ~3TB/day text (media separate).
- **Core:** persistent WebSocket per online client on a **connection server**; cross-server delivery solved by **presence lookup (Redis: userId→server) + Pub/Sub backplane** (fan-out, Part 26).
- **Offline:** durable write first → per-user pending-message queue → **push notification wakes device** (doesn't carry content) → client drains queue by sequence number on reconnect. Store-and-forward.
- **Ordering:** **per-conversation** sequence numbers, client-side reorder buffer; no global order needed — no shared timeline across unrelated conversations, and a global counter would bottleneck everything.
- **DB:** wide-column NoSQL (Cassandra) — partition by conversationId, cluster by seq; write-optimized, simple range-scan queries, shards naturally.
- **Scale:** sticky/connection-aware LB → shard connection servers by socket capacity → partition presence store and Pub/Sub bus (don't broadcast to every server) → replicate + partition Cassandra by conversationId.
- **Delivery status:** sent/delivered/read = state transitions on the stored message, driven by ACK frames over the same socket.
- **Dedup:** client-generated `clientMsgId` → exactly-once from the sender's perspective even under mobile retries.


**Real-world grounding (§9.5) — this one changes the sizing:**
- WhatsApp held **~2M concurrent connections per server**, vs the ~50–100K/box assumed in §2/§8 — a **20–40× gap** that comes from the concurrency model, not hardware.
- **An Erlang process is ~300 bytes vs ~1MB for an OS thread.** A chat system is mostly *idle* connections, so **the cost of holding an idle socket sets your fanout.** Name **thread-per-connection as the anti-pattern**; event-loop / green-threads (Go, Rust async, epoll) get you to the same regime.
- Reference points: **~50 engineers / 900M users** at acquisition; **~40B messages/day**; ~11,000 cores and ~70M msg/s peaks in the ~500M-user era.
- Every connection is its own process holding session state → delivery is literally "send to that process." *Don't say "use Erlang" — say why it fit: cheap isolation, per-connection failure containment.*

*— Design Problem 06 complete —*
