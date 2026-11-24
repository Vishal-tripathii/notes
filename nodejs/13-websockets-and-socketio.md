# Node.js Study Notes — Part 13

## Real-Time — WebSockets, Socket.IO, Rooms, Scaling, and When to Use SSE Instead

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.
>
> **Why this matters:** chat, live notifications, dashboards, collaborative editing, live tracking — all need the **server to push** data the moment it happens. Node is great at holding thousands of idle connections ([Part 1 §9](01-javascript-execution-model.md)), but real-time apps break in specific ways once you have more than one server.
>
> **Continues from:** [JD file §3](JD-NodeFullStack-3YR-QNA.md) (Socket.IO Q&A) and [System-design Part 26](../System-design/26-websockets-and-realtime.md) (real-time at the system level).

---

## Table of Contents

1. [The problem: HTTP can't push](#problem)
2. [The options: polling, SSE, WebSockets](#options)
3. [How a WebSocket connection works](#ws)
4. [⭐ Socket.IO — what it adds](#socketio)
5. [Rooms and namespaces](#rooms)
6. [⭐ Authentication](#auth)
7. [⭐ Scaling to many servers](#scaling)
8. [Reliability: reconnects, missed messages, backpressure](#reliability)
9. [Interview Questions & Answers](#interview)
10. [Cheat Sheet](#cheatsheet)

---

<a name="problem"></a>
# 1. The problem: HTTP can't push

Normal HTTP is **ask → answer**. The server can't speak until the client asks. For "new message arrived," the client would have to keep asking "anything new?"

> **Analogy 📞 — letters vs a phone call.** HTTP is sending letters: you write, they reply, done. A WebSocket is a phone call: once connected, **either side can talk at any time**, until someone hangs up.

---

<a name="options"></a>
# 2. The options: polling, SSE, WebSockets

| | How | Direction | Good for |
|---|---|---|---|
| **Short polling** | client asks every N seconds | client → server | simple, rarely-changing data; easy to cache |
| **Long polling** | client asks; server holds the request open until there's news | mostly server → client | fallback when nothing else works |
| **Server-Sent Events (SSE)** | one long HTTP response the server keeps writing to | **server → client only** | notifications, live feeds, progress bars, **streaming AI responses** |
| **WebSocket** | a persistent two-way connection | **both ways** | chat, multiplayer, collaborative editing, live cursors |

**SSE is underrated.** It's plain HTTP (works through most proxies, simple to secure with cookies), the browser's `EventSource` **reconnects automatically**, and it's a few lines in Express:

```js
app.get('/events', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  bus.on('notification', send);
  req.on('close', () => bus.off('notification', send));     // no listener leak (Part 2.5 §4)
});
```

> 🧠 **Remember:** **server talks only → SSE. Both talk → WebSocket.**

---

<a name="ws"></a>
# 3. How a WebSocket connection works

1. The client sends a normal HTTP request with `Upgrade: websocket`.
2. The server answers `101 Switching Protocols`.
3. The same TCP connection now carries WebSocket **frames** in both directions, until either side closes it.

In Node, the low-level library is **`ws`** (fast, no extras). Each open connection costs a little memory but **no thread** — one Node process can hold tens of thousands of mostly-idle connections.

Things raw WebSockets **don't** give you: automatic reconnection, rooms, acknowledgements, a fallback when WebSockets are blocked, or a way to broadcast across several servers. That's what Socket.IO adds.

---

<a name="socketio"></a>
# 4. ⭐ Socket.IO — what it adds

**Socket.IO is not plain WebSocket** — it's its own protocol on top (a plain WebSocket client can't talk to a Socket.IO server). It adds:

- **automatic reconnection** with backoff
- **fallback to HTTP long-polling** if WebSockets are blocked
- **named events** with any JSON data (`emit('chat:message', {...})`)
- **acknowledgements** — a callback when the other side received the message
- **rooms** — broadcast to a group
- **adapters** — broadcast across multiple servers (§7)

```js
import { Server } from 'socket.io';
const io = new Server(httpServer, { cors: { origin: 'https://app.example.com' } });

io.on('connection', (socket) => {
  socket.on('chat:send', async (msg, ack) => {
    const saved = await Message.create({ ...msg, from: socket.data.userId });  // validate first!
    io.to(`room:${msg.roomId}`).emit('chat:new', saved);   // everyone in the room
    ack({ ok: true, id: saved.id });                        // tell the sender it worked
  });

  socket.on('disconnect', (reason) => { /* clean up presence, typing indicators */ });
});
```

| Send to | Code |
|---|---|
| just this client | `socket.emit(...)` |
| everyone in a room | `io.to('room:42').emit(...)` |
| everyone in a room except the sender | `socket.to('room:42').emit(...)` |
| everyone | `io.emit(...)` |

Treat every incoming event like an HTTP request: **validate** the data, **check permissions**, **rate-limit**.

---

<a name="rooms"></a>
# 5. Rooms and namespaces

- **Room** = a named group of sockets, on the server side only. `socket.join('room:42')`. Clients don't see rooms; the server decides who's in which.
- Common patterns: one room per chat (`room:<id>`), **one room per user** (`user:<id>`) so you can reach all of a user's tabs and devices with `io.to('user:17').emit(...)`.
- **Namespace** = a separate channel on the same connection (`/admin`, `/chat`), with its own handlers and middleware. Use to separate features or permission levels.
- **Check permission before `join`** — "is this user a member of room 42?" Otherwise anyone can listen to any room by asking.

---

<a name="auth"></a>
# 6. ⭐ Authentication

Authenticate **once, at connection time**, in middleware:

```js
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;             // client: io(url, { auth: { token } })
    const user = await verifyAccessToken(token);
    socket.data.userId = user.id;
    socket.join(`user:${user.id}`);
    next();
  } catch {
    next(new Error('unauthorized'));                        // connection refused
  }
});
```

- Prefer `handshake.auth` (sent in the connection message) over putting tokens in the URL query string — URLs end up in logs.
- Cookie-based sessions work too (the browser sends cookies with the handshake) — then also restrict `cors.origin`, since this is where CSRF-like problems would appear.
- **Tokens expire, connections don't.** A socket can stay open for hours after the access token expired. Decide: re-check on sensitive events, disconnect when the token expires, or have the client send a fresh token. And when a user is banned or logs out, **disconnect their sockets** (`io.in('user:17').disconnectSockets()`).

---

<a name="scaling"></a>
# 7. ⭐ Scaling to many servers

**The problem:** user A is connected to server 1, user B to server 2. A sends a message to their shared room. Server 1 emits to the room — but only knows about **its own** sockets. **B never gets it.**

```
          ┌──── server 1 (A connected) ─┐
LB ──────┤                              ├── both subscribe to Redis ──▶ message reaches B ✅
          └──── server 2 (B connected) ─┘
```

**Fix 1 — an adapter:** the **Redis adapter** (`@socket.io/redis-adapter`; or the Redis Streams / Postgres / MongoDB adapters) makes every `io.to(room).emit()` go through Redis pub/sub, so every server delivers it to its own local sockets. One line of setup; your code doesn't change.

**Fix 2 — sticky sessions (needed for Socket.IO's polling fallback):** while a client is on HTTP long-polling, several HTTP requests belong to one session and must reach the **same** server. Configure the load balancer for sticky sessions (cookie or IP based). If you force `transports: ['websocket']` only, you don't need stickiness — but you lose the fallback.

**Also:**
- The load balancer must allow WebSocket upgrades and have an **idle timeout longer than your heartbeat interval**, or it silently cuts idle connections ([Part 6.5 §3](06.5-production-http-timeouts-keepalive-caching.md)).
- Deploys disconnect everyone on that server → clients reconnect (spread the reconnects; expect a spike).
- Under `cluster`/PM2 on one machine, the same rules apply — use `@socket.io/sticky` + an adapter.

---

<a name="reliability"></a>
# 8. Reliability: reconnects, missed messages, backpressure

- **Messages sent while a client was disconnected are lost** by default. For chat, **the database is the source of truth**: on reconnect the client asks "give me messages after id X" over normal HTTP or an event. (Socket.IO 4.6+ has "connection state recovery" for short disconnects, but don't rely on it for important data.)
- **Use acknowledgements** for messages that must arrive, and let the client retry with a message id so the server can ignore duplicates.
- **Heartbeats:** Socket.IO pings regularly to detect dead connections (a phone that went into a tunnel doesn't send a "close").
- **Slow clients:** a client on a bad connection can't receive as fast as you send; the buffered data piles up in your server's memory. Don't blast high-frequency updates to everyone — throttle (send position updates 5×/sec, not 60×), send only changes, or drop stale updates (Socket.IO `volatile` emits).
- **Presence ("online" indicators):** keep it in Redis with expiry, since a user may have several tabs on several servers.

---

<a name="interview"></a>
# 9. Interview Questions & Answers

### Q1. WebSockets vs SSE vs polling — how do you choose?
> "If only the server needs to push — notifications, feeds, progress, streaming AI output — SSE: plain HTTP, automatic reconnection, simple. If both sides send often — chat, multiplayer, collaboration — WebSockets. Polling is fine for data that changes rarely and is simplest to cache and scale."

### Q2. What does Socket.IO add on top of WebSockets?
> "Automatic reconnection, fallback to long-polling, named events, acknowledgements, rooms and namespaces, and adapters to broadcast across servers. The trade-off is it's its own protocol — a plain WebSocket client can't connect to it."

### Q3. How do you scale Socket.IO across several servers?
> "Two things. An adapter, usually the Redis adapter, so a broadcast on one server reaches sockets connected to the others. And sticky sessions at the load balancer if the long-polling fallback is enabled, since its HTTP requests must reach the same server. Plus a load-balancer idle timeout longer than the heartbeat."

### Q4. How do you authenticate a WebSocket connection?
> "In connection middleware: the client sends its token in the handshake's `auth` field, the server verifies it, stores the user on `socket.data`, and joins a per-user room. Then permission checks on every event and before joining rooms. Since connections outlive token expiry, I either re-validate on sensitive actions or disconnect when the token expires, and disconnect all of a user's sockets on logout or ban."

### Q5. A user was offline for 30 seconds. How do they get the messages they missed?
> "WebSocket messages aren't stored, so the database is the source of truth. On reconnect the client asks for messages after the last id it has, and the server sends the gap. Acknowledgements and message ids let the client retry sends without creating duplicates."

### Q6. How would you send a notification to one specific user who has three tabs open?
> "Join every socket to a room named after the user when it connects — `user:17` — then `io.to('user:17').emit(...)`. With the Redis adapter it reaches all their tabs, whichever server they're on."

---

<a name="cheatsheet"></a>
# 10. Cheat Sheet

```
HTTP = letters (ask → answer) · WebSocket = phone call (both talk anytime)
server talks only → SSE (plain HTTP, EventSource auto-reconnects) · both talk → WebSocket
polling = simple, cacheable, for rarely-changing data

WS handshake: HTTP Upgrade → 101 → frames both ways · `ws` = raw library
Socket.IO = own protocol: reconnect, long-poll fallback, events, acks, rooms, adapters

socket.emit = this client · io.to(room).emit = room · socket.to(room) = room minus sender
rooms: room:<chatId>, user:<userId> (all tabs/devices) · check permission before join
validate + authorize + rate-limit EVERY event

AUTH: io.use() middleware · handshake.auth.token (not the URL) · socket.data.userId
tokens expire, sockets don't → re-check / disconnect · disconnectSockets() on logout/ban

SCALE: Redis adapter (broadcast across servers) + sticky sessions (for polling fallback)
       LB idle timeout > heartbeat · deploys = reconnect spike

RELIABILITY: offline messages lost → DB is the truth, fetch "after id X" on reconnect
             acks + message ids · heartbeats · throttle / volatile for slow clients
             presence in Redis with expiry
```
