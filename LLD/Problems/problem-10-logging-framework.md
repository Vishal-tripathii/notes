# LLD Problem 10 — Logging Framework

> Worked end-to-end using the **[LLD Problem-Solving Framework](../04-lld-problem-solving-framework.md)**. Signature challenge: adding a new log level or output sink **WITHOUT touching existing handlers** (Chain of Responsibility + Open/Closed).

---

## Table of Contents

1. [Requirements & scope](#requirements)
2. [Actors & entities](#actors)
3. [Class design](#class-design)
4. [Patterns applied](#patterns)
5. [Core code](#code)
6. [Concurrency](#concurrency)
7. [Extensibility](#extensibility)
8. [Interview Q&A](#interview)
9. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements & scope

**Functional:**
1. Log messages at a **level**: `DEBUG < INFO < WARN < ERROR` (increasing severity).
2. Route a message to **one or more sinks**: console, file, remote service.
3. **Filter** — each sink/handler only processes messages at or above its configured minimum level.
4. **Consistent formatting** — every log line looks the same: `[timestamp] [LEVEL] message (context)`.

**Non-functional:**
- **Extensible** — adding a new level (e.g. `TRACE`, `FATAL`) or a new sink (e.g. Slack webhook) must not require editing existing handler classes.
- **Single access point** — the whole app logs through one logger, not N independently-configured instances.
- Reasonably fast — logging must not become the bottleneck of the hot path it's instrumenting.

> Scope note: this is a *framework* problem, not a *distributed logging pipeline* problem (no Kafka/ELK here) — the interesting part is entirely in the **object design**, which is why it's a favorite for testing Chain of Responsibility and Open/Closed in a 35-minute slot.

---

<a name="actors"></a>
# 2. Actors & entities

| Entity | Role |
|---|---|
| **Logger** (Singleton) | The single global entry point the app calls: `Logger.getInstance().log(level, msg)`. Owns the handler chain and the list of sinks. |
| **LogHandler** (Chain of Responsibility base) | Abstract handler with a `level`, a `nextHandler` reference, `setNext()`, and `handle(logMessage)`. |
| **DebugHandler / InfoHandler / WarnHandler / ErrorHandler** | Concrete handlers, each wired to the next in severity order. Each decides: "does this level match me? write it — then, regardless, pass it along the chain." |
| **LogSink** (Strategy) | Interface for *where* a message physically goes: `write(logMessage)`. |
| **ConsoleSink / FileSink / RemoteSink** | Concrete strategies implementing `write()`. |
| **LogMessageBuilder** (Builder) | Assembles a structured `LogMessage` (timestamp + level + context + message) via fluent chaining instead of a fat constructor. |

**Nouns → classes:** Logger, LogHandler, LogSink, LogMessage.
**Verbs → methods:** `log()`, `handle()`, `write()`, `setNext()`, `build()`.

---

<a name="class-design"></a>
# 3. Class design

```
                         ┌─────────────────────┐
     app code ────────▶  │   Logger (Singleton) │
                         │  - chain: LogHandler  │
                         │  - sinks: LogSink[]   │
                         │  + log(level, msg)    │
                         └──────────┬───────────┘
                                    │ builds LogMessage, then
                                    │ chain.handle(logMessage)
                                    ▼
     ┌───────────────┐   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
     │ DebugHandler  │──▶│  InfoHandler  │──▶│  WarnHandler  │──▶│ ErrorHandler  │──▶ null
     │ level: DEBUG  │   │ level: INFO   │   │ level: WARN   │   │ level: ERROR  │
     └───────┬───────┘   └───────┬───────┘   └───────┬───────┘   └───────┬───────┘
             │ if msg.level      │ if msg.level      │ if msg.level      │ if msg.level
             │ >= DEBUG:         │ >= INFO:          │ >= WARN:          │ >= ERROR:
             │ write to sinks    │ write to sinks    │ write to sinks    │ write to sinks
             ▼                   ▼                   ▼                   ▼
     ┌───────────────────────────────────────────────────────────────────────┐
     │                    LogSink (Strategy interface)                       │
     │        ConsoleSink   ·   FileSink   ·   RemoteSink                    │
     └───────────────────────────────────────────────────────────────────────┘

     LogMessage built by:
     new LogMessageBuilder().setLevel(WARN).setContext("OrderService").setMessage("retry #2").build()
     → { timestamp, level, context, message }
```

**Relationships:**
- `Logger` **has-a** chain of `LogHandler` (composition, 1 → chain-of-N).
- `Logger` **has-a** list of `LogSink` (composition, 1 → N).
- Each `LogHandler` **has-a** reference to the *next* `LogHandler` (self-referential composition — the chain itself).
- `DebugHandler`/`InfoHandler`/`WarnHandler`/`ErrorHandler` **is-a** `LogHandler` (inheritance from one abstract base).
- `ConsoleSink`/`FileSink`/`RemoteSink` **is-a** `LogSink` (interface implementation).

---

<a name="patterns"></a>
# 4. Patterns applied

## Chain of Responsibility — THE core pattern
A log call doesn't get routed by a big `if/else if (level === 'DEBUG') ... else if (level === 'INFO') ...`. Instead, the `LogMessage` is handed to the **first** handler in the chain (`DebugHandler`), and it walks itself down:

```
log(WARN, "disk 90% full")
  → DebugHandler.handle(msg)   → WARN >= DEBUG → writes to sinks → passes to next
  → InfoHandler.handle(msg)    → WARN >= INFO  → writes to sinks → passes to next
  → WarnHandler.handle(msg)    → WARN >= WARN  → writes to sinks → passes to next
  → ErrorHandler.handle(msg)   → WARN <  ERROR → does NOT write  → passes to next (null, chain ends)
```

(This example uses the common "handle at my level and every level below me matches, pass along regardless" shape — some interviewers instead want each handler to write *only* at its own exact level and let the sink-level minimum do filtering; **say out loud which variant you're building**, both are valid and the interviewer usually doesn't care which as long as you're consistent.)

**Why this is the signature move:** to add a `TRACE` level, you write **one new class** — `TraceHandler extends LogHandler` — and insert it at the front of the chain (`traceHandler.setNext(debugHandler)`). **Zero existing handler classes change.** That's Open/Closed in its purest LLD form: open for extension (new handler), closed for modification (nobody touches `DebugHandler` or `InfoHandler`). Same story for a new sink — write `SlackSink implements LogSink`, register it with the Logger; no handler ever knows or cares how many sinks exist.

Contrast with the naive version: a single `log(level, msg)` method with a `switch(level)` — every new level means **editing that switch**, which is exactly the kind of change Open/Closed exists to prevent (every edit to shared code risks breaking every existing level).

## Singleton — for the Logger instance
One `Logger` per process, reached via `Logger.getInstance()`, so every part of the app writes through the same chain + sink configuration instead of each module spinning up its own logger with its own settings.

**Why this is a *legitimate* Singleton** (cross-ref [`System-design/22-design-patterns.md`](../../System-design/22-design-patterns.md#creational), which flags Singleton as "often an anti-pattern when overused"):
- A logger is genuinely a **one-of-a-kind cross-cutting resource** — like the file handle or the network connection to the remote sink — where a *second* instance would mean split configuration (one part of the app logging to console-only, another to file-only, drifting apart) and duplicated resources (two open file handles racing on the same log file).
- Contrast with the anti-pattern case: using Singleton for something like a domain service or repository just to get a "global" instance — that hides dependencies, makes unit testing hard (can't inject a mock), and creates hidden coupling between unrelated modules. A `UserService` Singleton is usually a DI failure in disguise.
- The tell: ask *"would having two of these ever be correct?"* For a logger — no, almost never (you don't want half your app's logs going to a different sink than the other half). For a `UserService` — yes, easily (a mock in tests, a tenant-scoped instance in multi-tenant systems). That's the line between a legitimate Singleton and an anti-pattern one.

## Strategy — for output sinks
`ConsoleSink`, `FileSink`, `RemoteSink` all implement the same `write(logMessage)` interface. The `Logger` (or each handler) holds a list of sinks and calls `write()` on all of them without knowing which concrete type it's talking to — swap sinks, add sinks, or run several at once, with zero change to the handler chain. This is a second, independent axis of extensibility from Chain of Responsibility: CoR extends *which levels get processed*, Strategy extends *where processed messages go*.

## Builder — for constructing the log message
A `LogMessage` has several optional/composable fields (timestamp is auto-set, level is required, context is optional, message is required, and a real system might add `stackTrace`, `requestId`, `userId`...). Rather than a constructor with a growing parameter list, `LogMessageBuilder` assembles it fluently:
```js
new LogMessageBuilder().setLevel(Level.ERROR).setContext("PaymentService").setMessage("charge failed").build();
```
This avoids telescoping constructors and keeps `LogMessage` itself immutable once built.

---

<a name="code"></a>
# 5. Core code (JavaScript ES6)

```js
// ---------- Level enum ----------
const Level = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

// ---------- LogMessage + Builder ----------
class LogMessage {
  constructor({ timestamp, level, context, message }) {
    this.timestamp = timestamp;
    this.level = level;
    this.context = context;
    this.message = message;
  }
  toString() {
    const levelName = Object.keys(Level).find(k => Level[k] === this.level);
    return `[${this.timestamp}] [${levelName}]${this.context ? ` (${this.context})` : ""} ${this.message}`;
  }
}

class LogMessageBuilder {
  setLevel(level)     { this._level = level; return this; }
  setContext(context) { this._context = context; return this; }
  setMessage(message) { this._message = message; return this; }
  build() {
    return new LogMessage({
      timestamp: new Date().toISOString(),
      level: this._level,
      context: this._context,
      message: this._message,
    });
  }
}

// ---------- LogSink (Strategy) ----------
class LogSink {
  write(_logMessage) { throw new Error("write() must be implemented"); }
}
class ConsoleSink extends LogSink {
  write(logMessage) { console.log(logMessage.toString()); }
}
class FileSink extends LogSink {
  constructor(filePath) { super(); this.filePath = filePath; this.buffer = []; }
  write(logMessage) { this.buffer.push(logMessage.toString()); /* flushed async, see §6 */ }
}
class RemoteSink extends LogSink {
  constructor(endpoint) { super(); this.endpoint = endpoint; }
  write(logMessage) { this._enqueue(logMessage); /* batched async, see §7 */ }
  _enqueue(logMessage) { /* push to an outbound queue, not implemented here */ }
}

// ---------- LogHandler (Chain of Responsibility) ----------
class LogHandler {
  constructor(level) { this.level = level; this.nextHandler = null; }
  setNext(handler) { this.nextHandler = handler; return handler; } // returns handler → chainable
  handle(logMessage, sinks) {
    if (logMessage.level >= this.level) {
      sinks.forEach(sink => sink.write(logMessage));
    }
    if (this.nextHandler) this.nextHandler.handle(logMessage, sinks);
  }
}
class DebugHandler extends LogHandler { constructor() { super(Level.DEBUG); } }
class InfoHandler  extends LogHandler { constructor() { super(Level.INFO); } }
class WarnHandler  extends LogHandler { constructor() { super(Level.WARN); } }
class ErrorHandler extends LogHandler { constructor() { super(Level.ERROR); } }

// ---------- Logger (Singleton) ----------
class Logger {
  constructor() {
    if (Logger._instance) return Logger._instance;

    this.sinks = [new ConsoleSink()];

    // wire the chain once, in severity order
    const debug = new DebugHandler();
    const info  = new InfoHandler();
    const warn  = new WarnHandler();
    const error = new ErrorHandler();
    debug.setNext(info).setNext(warn).setNext(error);
    this.chainHead = debug;

    Logger._instance = this;
  }
  static getInstance() { return Logger._instance || new Logger(); }

  addSink(sink) { this.sinks.push(sink); }

  log(level, message, context) {
    const logMessage = new LogMessageBuilder()
      .setLevel(level).setContext(context).setMessage(message).build();
    this.chainHead.handle(logMessage, this.sinks);
  }
  debug(msg, ctx) { this.log(Level.DEBUG, msg, ctx); }
  info(msg, ctx)  { this.log(Level.INFO, msg, ctx); }
  warn(msg, ctx)  { this.log(Level.WARN, msg, ctx); }
  error(msg, ctx) { this.log(Level.ERROR, msg, ctx); }
}

// usage
const logger = Logger.getInstance();
logger.addSink(new FileSink("./app.log"));
logger.warn("disk 90% full", "DiskMonitor");
```

---

<a name="concurrency"></a>
# 6. Concurrency

**Is the Singleton logger a bottleneck?** In a Node.js server, "concurrent" request handlers are really interleaved on a single event loop (not true parallel threads), so `logger.log()` calls don't race on CPU the way they would in a multi-threaded language — there's no lock needed just to call `chainHead.handle()`. The risk isn't the Singleton itself; it's what a sink does **inside** `write()`.

**The real danger: blocking I/O in a sink.** If `FileSink.write()` did a synchronous `fs.writeFileSync()` on every call, every concurrent request handler that logs would stall behind that disk write — the "one global logger" becomes a de facto bottleneck not because it's a Singleton, but because it's doing **synchronous I/O on the hot path**.

**Fix: buffer/queue writes instead of blocking on each one.**
```js
class FileSink extends LogSink {
  constructor(filePath, flushIntervalMs = 1000) {
    super();
    this.filePath = filePath;
    this.buffer = [];
    setInterval(() => this._flush(), flushIntervalMs);
  }
  write(logMessage) { this.buffer.push(logMessage.toString()); }   // O(1), non-blocking
  _flush() {
    if (this.buffer.length === 0) return;
    const chunk = this.buffer.splice(0).join("\n") + "\n";
    fs.appendFile(this.filePath, chunk, () => {});                  // async, fire-and-forget
  }
}
```
`write()` just pushes to an in-memory array and returns immediately — the request handler is never blocked on disk. A timer (or a size threshold) periodically flushes the buffer with an async append.

**Why order isn't always guaranteed — and when that matters.** Once writes are buffered and flushed asynchronously, two things can reorder log lines relative to true wall-clock event order: (1) two concurrent handlers both push to the buffer, and the flush writes them in *push* order, which is fine — but if a `RemoteSink` retries a failed batch while a newer batch is already queued, the retry can land *after* the newer batch; (2) `ConsoleSink` (synchronous) and `FileSink` (buffered) can show the *same* event at different relative positions across the two outputs, since one writes immediately and the other on a delay.
- **Doesn't matter** for the common case: dashboards, general debugging, and human-read logs where "roughly chronological, all timestamped correctly" is enough — the `LogMessage.timestamp` field, not physical write order, is the source of truth for ordering.
- **Does matter** when you need a strict causal audit trail (e.g. financial transaction logs, security audit logs) — there you either (a) write synchronously for that specific sink despite the cost, (b) attach a monotonically increasing sequence number at the `LogMessageBuilder` step (not the flush step) so consumers can always reconstruct true order regardless of flush timing, or (c) use a single-writer queue per sink so writes for that sink are strictly FIFO even if flushed in batches.

---

<a name="extensibility"></a>
# 7. Extensibility

### "Now add a log-level override per-module"
Requirement: `OrderService` should log at `DEBUG` even though the global minimum is `WARN`.
- Give `Logger.log()` an optional module/context-aware minimum-level map: `Map<context, Level>`.
- Each handler's "does this apply to me" check becomes: `const effectiveMin = overrides.get(logMessage.context) ?? this.level; if (logMessage.level >= effectiveMin) ...` — wait, that's not quite right either, since the *chain* itself represents the level ladder. Cleaner: keep the global minimum as *which handler to enter the chain at*, and add a **per-context threshold check inside `Logger.log()`** before invoking the chain at all:
```js
log(level, message, context) {
  const minLevel = this.overrides.get(context) ?? this.globalMinLevel;
  if (level < minLevel) return;               // filtered before even entering the chain
  const logMessage = new LogMessageBuilder()...build();
  this.chainHead.handle(logMessage, this.sinks);
}
```
- **No handler class changes** — the override lives in `Logger`, which is exactly where "global policy that can be locally overridden" belongs. `Logger.setOverride("OrderService", Level.DEBUG)` is the whole API surface.

### "Now add async batched remote shipping"
Requirement: ship logs to a remote logging service (e.g. Datadog-style), batched, not one HTTP call per log line.
- `RemoteSink` already sits behind the same `LogSink` interface — no handler or `Logger` change needed (this is the Strategy payoff).
- Implementation: accumulate messages in an internal buffer (same shape as `FileSink`'s), flush on **whichever comes first** — a size threshold (e.g. 100 messages) or a time threshold (e.g. every 2s) — via a batched `POST /logs { entries: [...] }`.
- Add retry-with-backoff on flush failure, and cap buffer size with a drop-oldest (or drop-newest, document which) policy so a remote outage can't grow unbounded memory.
```js
class RemoteSink extends LogSink {
  constructor(endpoint, { batchSize = 100, flushMs = 2000 } = {}) {
    super();
    this.endpoint = endpoint; this.batchSize = batchSize; this.buffer = [];
    setInterval(() => this._flush(), flushMs);
  }
  write(logMessage) {
    this.buffer.push(logMessage);
    if (this.buffer.length >= this.batchSize) this._flush();
  }
  async _flush() {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.buffer.length);
    try { await fetch(this.endpoint, { method: "POST", body: JSON.stringify({ entries: batch }) }); }
    catch (e) { /* retry/backoff policy here; consider re-queueing `batch` */ }
  }
}
```
- Both extensions land in **new code paths** (`overrides` map, `RemoteSink` internals) — `DebugHandler`/`InfoHandler`/`WarnHandler`/`ErrorHandler` are untouched in both cases, which is the whole point of the design.

---

<a name="interview"></a>
# 8. Interview Q&A

### Q: "Walk me through how a single log call flows through your design."
> *"The app calls `Logger.getInstance().warn(msg, context)`. The Logger builds a structured `LogMessage` via the builder, then hands it to the head of the handler chain — `DebugHandler`. Each handler checks if the message's level qualifies, writes it to every registered sink if so, and always passes it to the next handler regardless, until the chain ends at `ErrorHandler`."*

### Q: "How do I add a new log level, say TRACE, below DEBUG, without breaking anything?"
> *"I write one new class, `TraceHandler extends LogHandler`, and splice it in front of the chain — `traceHandler.setNext(debugHandler)` — then point `Logger`'s chain head at it. None of the existing handler classes change. That's the whole value of Chain of Responsibility here: each handler only knows about its own level and 'the next one,' so the chain is extensible without being editable."*

### Q: "Isn't Singleton generally considered bad practice? Why is it fine here?"
> *"Singleton becomes an anti-pattern when it's used to fake a global for something that should be dependency-injected — it hides coupling and kills testability. A logger is different: there's genuinely supposed to be one shared instance per process, because two independently-configured loggers would mean parts of the app disagreeing about where logs go, or two file handles racing on the same log file. The test I use is 'would a second instance ever be correct?' — for a logger, essentially never; for something like a UserService, yes, easily — that's the anti-pattern case."*

### Q: "How would you add a new output sink, like Slack alerts on ERROR?"
> *"Sinks are a Strategy — `LogSink` is an interface with `write()`, and `ConsoleSink`/`FileSink`/`RemoteSink` all implement it independently of the handler chain. I'd add a `SlackSink implements LogSink` and register it with `logger.addSink(new SlackSink(webhookUrl))`. No handler needs to know it exists — they just call `write()` on every sink in the list."*

### Q: "Doesn't a single global Logger become a concurrency bottleneck under load?"
> *"Not from the Singleton itself — in Node.js there's no thread contention on a plain method call. The actual risk is a sink doing blocking I/O inside `write()`. I'd make sinks like FileSink and RemoteSink buffer messages in memory and flush asynchronously on a timer or size threshold, so `write()` is O(1) and never blocks the request path. The trade-off is that write order across sinks (or after a retry) isn't strictly guaranteed anymore, which is fine for normal logs since I rely on the message's own timestamp for ordering, but would need a sequence number or synchronous writes if I needed a strict audit trail."*

### Q: "How would you support a per-module log level override, like DEBUG for one service but WARN everywhere else?"
> *"I'd keep a `Map` of context → minimum level on the Logger, checked before the message even enters the handler chain: if the message's level is below that context's effective minimum, it's dropped immediately. That keeps the override logic in one place — the Logger, which already owns global policy — and again, zero handler classes change."*

---

<a name="cheatsheet"></a>
# 9. Cheat Sheet

- **Core pattern:** Chain of Responsibility — `LogHandler` base with `setNext()`/`handle()`; DEBUG→INFO→WARN→ERROR chain, each checks-and-passes-along.
- **New level = new handler class, spliced into the chain.** New sink = new `LogSink` implementation, registered on the Logger. **Neither touches existing handlers** — that's Open/Closed in action.
- **Singleton:** one `Logger` per process — legitimate here because two loggers would mean split config/duplicated resources; contrast with Singleton-as-anti-pattern when it's really a DI failure hiding a hard-to-test dependency.
- **Strategy:** `LogSink` interface — Console/File/Remote are interchangeable, orthogonal to the level chain.
- **Builder:** `LogMessageBuilder` assembles timestamp+level+context+message fluently — avoids telescoping constructors.
- **Concurrency:** Singleton isn't the bottleneck; **blocking sink I/O** is. Buffer + async-flush writes (timer or size threshold) instead of writing per call.
- **Ordering:** buffering can reorder physical writes — rely on the `timestamp` (or a sequence number) as source of truth, not write order, unless you need a strict audit trail.
- **Extend — per-module override:** context→minLevel map checked in `Logger.log()` before the chain runs.
- **Extend — async batched remote shipping:** `RemoteSink` buffers + flushes on size/time threshold with retry/backoff, all inside the sink — no handler changes.

*— LLD Problem 10 complete —*
