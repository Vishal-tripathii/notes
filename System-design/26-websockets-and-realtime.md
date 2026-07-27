# System Design Study Notes — Part 26

## WebSockets & Real-Time (Polling, SSE, WebSockets, Scaling Push)

> **Format:** Written as **Q&A** — my prompts are the questions, the explanations are the answers. Complete capture of the chat, reorganized and expanded. Diagrams, the four techniques, the scaling/fan-out problem, and interview Q&A included.
>
> **Continues:** builds on Part 2.5 (load balancers — now must be connection-aware), Part 5.5 (Redis Pub/Sub — the fan-out backplane), Part 14 (event-driven), and Part 7 (`wss://` = TLS).

---

## Table of Contents

1. [The problem: HTTP can't push](#problem)
2. [Polling: short & long](#polling)
3. [Server-Sent Events (one-way)](#sse)
4. [WebSockets (full-duplex)](#websockets)
5. [Comparison — pick the right tool](#comparison)
6. [The scaling problem (fan-out, sticky LB, Pub/Sub)](#scaling)
7. [Real examples](#examples)
8. [Interview questions & answers](#interview)
9. [Cheat Sheet — everything on one page](#cheatsheet)

---

<a name="problem"></a>
# 1. The problem: HTTP can't push

Normal HTTP is **request → response, client-initiated only** — the server can never speak first. But real-time features need the **server to push the moment something happens**, unasked:
- **chat** (a message arrives), **live notifications**, **live scores / stock tickers**, **collaborative editing** (Google Docs cursors), **multiplayer games**.

Plain HTTP has no push mechanism. Everything below either fakes it or enables it.

---

<a name="polling"></a>
# 2. Polling: short & long

## (a) Short polling
Client asks repeatedly on a timer: *"anything new?"*
```
Client: any new? → Server: no     (wait 3s)
Client: any new? → Server: no     (wait 3s)
Client: any new? → Server: yes, here's one
```
- **Pro:** trivial, plain HTTP, works everywhere.
- **Con:** **wasteful** (mostly "no" responses) and **laggy** (up to one interval of delay). Tighten interval → more waste; loosen → more latency. No good answer.

## (b) Long polling
Client asks; the **server holds the request open** until it has data (or a timeout), then responds. Client immediately re-asks.
```
Client: any new? → Server: ...(holds open)...
                   [message arrives] → Server responds NOW
Client: (immediately re-asks) → Server holds again...
```
- **Pro:** near-real-time, still plain HTTP → works through old proxies/firewalls. The classic pre-WebSocket hack.
- **Con:** still **one HTTP request/response per message** (header overhead), **half-duplex** (always client-asks-server-answers), reconnect churn under load.

---

<a name="sse"></a>
# 3. Server-Sent Events (one-way streaming)

A single long-lived HTTP connection the **server streams down** as events. Browser has built-in `EventSource` with **automatic reconnection**.
```
Client opens EventSource ─────────────▶ (stays open)
Server: data: score 1-0
Server: data: score 2-0     ← server pushes whenever; ONE direction only
Server: data: score 2-1
```
- **One-directional (server → client)**, text only, over normal HTTP.
- **Best for:** feeds, notifications, live scores, dashboards — only the *server* pushes, client just listens.
- **Simpler/cheaper than WebSockets** when the client doesn't need to stream back.

---

<a name="websockets"></a>
# 4. WebSockets (full-duplex, persistent)

A **persistent, bidirectional connection over a single TCP socket**. Once open, **both sides send anytime** with tiny per-message overhead.

## The upgrade handshake
Begins as an HTTP request with `Upgrade: websocket`; server agrees with **`101 Switching Protocols`**; the connection upgrades from HTTP to the WebSocket protocol on the same TCP connection. After that it's no longer HTTP.
```
Client → HTTP GET  Upgrade: websocket
Server → 101 Switching Protocols
   ═══════ now a persistent WebSocket ═══════
Client ⇄ Server   (either side sends frames anytime, both directions)
```
- URLs: **`ws://`** and **`wss://`** (TLS-encrypted, like https — Part 7).
- **Low overhead** — no per-message HTTP headers, just small frames.
- **Best for:** chat, multiplayer games, collaborative editing, live trading — **truly bidirectional, high-frequency**.

---

<a name="comparison"></a>
# 5. Comparison — pick the right tool

| Technique | Direction | Real-time? | Overhead | Use when |
|---|---|---|---|---|
| **Short polling** | client pulls | ❌ laggy | high (wasteful) | simplest, rarely-changing data |
| **Long polling** | client pulls (held) | ~yes | medium | need push but must use plain HTTP |
| **SSE** | server → client | ✅ | low | server-only push (feeds, notifications) |
| **WebSocket** | ⇄ both ways | ✅ | lowest per-msg | bidirectional, high-frequency (chat, games) |

> **Rule of thumb:** server-only push, text? → **SSE**. Both sides talk constantly? → **WebSocket**. Can't change infra / occasional updates? → **long polling**.

---

<a name="scaling"></a>
# 6. The scaling problem (where interviews go ⚠️)

WebSockets break the usual stateless assumptions because the connection is **stateful and long-lived**.

## (a) Persistent connections are expensive
Each open connection holds **memory + a file descriptor** for its whole life. You size a real-time server by **concurrent open connections** (often 100k+/box), not requests/sec → pushes you toward a **dedicated connection/gateway layer** separate from business logic.

## (b) The load balancer must be connection-aware
A normal LB sprays short, stateless requests anywhere (Part 2.5). A WebSocket is **pinned to one server for its whole life** — the LB must support the upgrade and keep the connection **sticky** to that backend (L4, or WebSocket-aware L7).

## (c) The fan-out problem — the big one
User **A** on **Server 1** sends a message to user **B** on **Server 3**. Server 1 **doesn't hold B's socket** — it can't reach B directly.
```
   A ── Server 1        Server 3 ── B
         │                  ▲
         └──publish──▶ [ Redis Pub/Sub ] ──▶ all servers push to their LOCAL sockets
```
**Solution: a Pub/Sub backplane.** Every server subscribes to a shared bus (**Redis Pub/Sub**, or Kafka/NATS). Server 1 *publishes* "message for B"; the bus fans out to all servers; **Server 3** (owns B's socket) pushes it down. Exactly Part 5.5 (Redis) + Part 14 (event-driven) at work. Usually paired with a **presence registry** (who's connected where).

## (d) Connection lifecycle
Long-lived connections die silently (laptop sleeps, network blip). You need:
- **Heartbeats (ping/pong)** — verify the socket is alive; drop dead ones to avoid leaking memory.
- **Automatic reconnection** with backoff (client side).
- **Missed-message handling** — on reconnect, catch up via sequence numbers / fetch-since.

---

<a name="examples"></a>
# 7. Real examples

- **Slack / WhatsApp** — WebSockets for live messages + presence.
- **Google Docs / Figma** — collaborative editing & cursors (bidirectional, high-frequency).
- **Multiplayer games** — low-latency state sync.
- **Trading dashboards** — often **SSE** (server-only price push) unless the client also sends on the channel.
- **Live notifications / "typing…"** — WebSocket or SSE depending on directionality.

---

<a name="interview"></a>
# 8. Interview questions & answers

### Q: "Why can't you just use HTTP for real-time?"
> *"HTTP is request-response and client-initiated, so the server can't push — it can only answer when asked. For chat or notifications the server needs to send data the instant something happens, which plain HTTP has no mechanism for. So you either fake push with polling or use a protocol that supports it, like SSE or WebSockets."*

### Q: "Short polling vs long polling?"
> *"Short polling asks on a fixed timer, so it wastes requests with mostly-empty responses and adds up to one interval of latency. Long polling holds the request open on the server until there's actually data, then responds and the client immediately re-asks — that's near-real-time and still plain HTTP, but it's still one request-response per message and it's half-duplex."*

### Q: "SSE vs WebSockets?"
> *"SSE is a one-way stream from server to client over normal HTTP, with built-in auto-reconnect — perfect when only the server needs to push, like a feed or live scores. WebSockets are full-duplex over a persistent TCP connection, so both sides can send anytime with low overhead — that's what you want for chat, games, or collaborative editing where the client streams back too. SSE is simpler; use WebSockets when you genuinely need bidirectional."*

### Q: "How does a WebSocket connection start?"
> *"It begins as an HTTP request with an Upgrade: websocket header. The server responds 101 Switching Protocols, and the same TCP connection upgrades from HTTP to the WebSocket protocol. After that it's a persistent full-duplex channel, using ws:// or wss:// for the TLS-encrypted version."*

### Q: "How do you scale WebSockets across many servers?"
> *"The connections are stateful and long-lived, so the load balancer has to keep each one sticky to the server that holds it, and you size servers by concurrent connections rather than requests per second. The key problem is fan-out: two users can be connected to different servers, so the server receiving a message may not hold the recipient's socket. You solve that with a Pub/Sub backplane — Redis Pub/Sub, Kafka, or similar — where the receiving server publishes the message and every server subscribes, so whichever one holds the recipient's connection pushes it down. You also keep a presence registry and use heartbeats to detect and clean up dead connections."*

### Q: "Why is the fan-out problem hard?"
> *"Because a WebSocket lives on exactly one server. When user A on server 1 messages user B on server 3, server 1 has no direct handle on B's socket. Without a shared bus, server 1 literally can't deliver it. The Pub/Sub backplane decouples 'who sent it' from 'who holds the connection' — the message is broadcast to all servers and only the one owning B's socket forwards it."*

### Q: "How do you handle a dropped connection?"
> *"Long-lived connections die silently, so I use heartbeat ping/pong to detect dead sockets and free their resources, auto-reconnect with backoff on the client, and a catch-up mechanism — sequence numbers or a fetch-since query — so a client that reconnects can retrieve the messages it missed while offline."*

---

<a name="cheatsheet"></a>
# 9. Cheat Sheet — everything on one page

### The problem
HTTP = request-response, client-initiated → **server can't push**. Real-time (chat, notifications, live data) needs push.

### Four techniques
| | Direction | Real-time | Overhead | When |
|---|---|---|---|---|
| Short poll | client pulls | ❌ laggy | high | simplest, rare changes |
| Long poll | client pulls (held) | ~yes | medium | need push, plain HTTP only |
| **SSE** | server→client | ✅ | low | server-only push (feeds) |
| **WebSocket** | ⇄ both | ✅ | lowest/msg | bidirectional (chat, games) |

### WebSocket handshake
HTTP `Upgrade: websocket` → **`101 Switching Protocols`** → same TCP becomes persistent full-duplex. `ws://` / `wss://` (TLS).

### Scaling (the interview meat)
- **Cost:** each connection = memory + FD; size by **concurrent connections**; use a dedicated gateway layer.
- **Sticky LB:** connection pinned to one server for its life (Part 2.5 must be connection-aware).
- **Fan-out:** A on Server1 → B on Server3; Server1 lacks B's socket → **Pub/Sub backplane (Redis/Kafka)**: publish → all servers → the one holding B pushes. + **presence registry**.
- **Lifecycle:** heartbeats (ping/pong) to drop dead sockets · auto-reconnect w/ backoff · missed-message catch-up (seq #).

### Connects to
- Part 2.5: LB must keep WebSocket connections sticky.
- Part 5.5: Redis Pub/Sub = the fan-out backplane.
- Part 14: event-driven fan-out. · Part 7: `wss://` = TLS.

### Suggested next topics
- **Observability** — logging/metrics/tracing.
- **Idempotency & Saga** — distributed transactions (extends Part 13).

*— End of Part 26 —*
