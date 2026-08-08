# LLD Problem 11 — Notification System (class design)

> Worked end-to-end using the **[LLD Problem-Solving Framework](../04-lld-problem-solving-framework.md)**. **Signature challenge:** adding a new channel or enrichment step without touching dispatch logic. **Note:** `../../System-design/` also has (or will have) an HLD version of a notification system focused on system-scale fan-out/queueing — this file is the **CLASS design** for one dispatch service.

---

## Table of Contents

1. [Requirements & scope](#requirements)
2. [Actors & entities](#actors)
3. [Class design](#design)
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
1. Users **subscribe** to notification types (e.g. `"order.shipped"`, `"comment.reply"`) — and can unsubscribe.
2. A notification is **dispatched** to every subscriber via one or more channels: **email, SMS, push**.
3. Before actually sending, a notification can be **enriched** — a retry policy (resend on transient failure) and per-user **rate limiting** (don't spam the same user).
4. Each subscriber has a **channel preference** (e.g. "notify me by push, fall back to email").

**Non-functional (LLD framing, not HLD scale):**
- **Open/Closed:** adding a channel (WhatsApp) or an enrichment step (quiet hours) must not require editing `NotificationService`'s dispatch loop.
- **Isolation:** one subscriber's send failure must never block or crash delivery to the rest.
- **Single Responsibility:** sending, retrying, and rate-limiting are three separate concerns — none of them should live inside one bloated method.

**Out of scope (that's the HLD version's job):** message queues, delivery guarantees across servers, horizontal scaling of workers, template rendering pipelines. This file designs the **object model of one dispatch service** — the classes, their relationships, and the code inside them.

---

<a name="actors"></a>
# 2. Actors & entities

| Class | Role |
|---|---|
| `NotificationService` | The **Subject** in Observer. Holds the subscriber registry, exposes `subscribe`/`unsubscribe`/`publish`, fans out to all interested subscribers. |
| `Notification` | Base data object — event type, payload, target subscriber. |
| `NotificationChannel` (interface/Strategy) | `send(notification)`. One implementation per medium. |
| `EmailChannel`, `SMSChannel`, `PushChannel` | Concrete channels — swap freely, service never checks "if email then... else if sms..." |
| `Subscriber` | A user — id, contact info, subscribed event types, preferred channel. |
| `NotificationDecorator` (base) | Wraps a `NotificationChannel`, implements the *same* `send()` interface, adds behavior, then delegates to the wrapped channel. |
| `RetryDecorator` | Wraps a channel; on failure, retries N times with backoff before giving up. |
| `RateLimitDecorator` | Wraps a channel; checks a per-user send count/window before allowing the send through. |
| `ChannelFactory` | Given a subscriber's preference (`"email"` / `"sms"` / `"push"`), returns the right concrete `NotificationChannel` instance. |

---

<a name="design"></a>
# 3. Class design

```
                     ┌─────────────────────────┐
                     │   NotificationService    │  ← Subject (Observer)
                     │───────────────────────────│
                     │ - subscribers: Map        │
                     │───────────────────────────│
                     │ + subscribe(sub, event)   │
                     │ + unsubscribe(sub, event) │
                     │ + publish(event, payload) │──► notifyAll() loops subscribers
                     └────────────┬──────────────┘
                                  │ notifies
                                  ▼
                     ┌──────────────────────────┐
                     │        Subscriber         │  ← Observer
                     │────────────────────────────│
                     │ id, contact, preference    │
                     │ update(notification)       │
                     └────────────┬───────────────┘
                                  │ preference: "email" | "sms" | "push"
                                  ▼
                     ┌──────────────────────────┐
                     │      ChannelFactory       │  ← Factory
                     └────────────┬───────────────┘
                                  │ creates
                                  ▼
        ┌─────────────────────────────────────────────────┐
        │     NotificationChannel  (interface: send())     │  ← Strategy
        └───────────────────────┬───────────────────────────┘
                                 │ implemented by
             ┌───────────────────┼──────────────────┐
             ▼                   ▼                  ▼
      EmailChannel          SMSChannel          PushChannel

        Decorator chain wraps ANY concrete channel before send:

  RetryDecorator ──wraps──► RateLimitDecorator ──wraps──► EmailChannel
       .send()                    .send()                   .send()
       (retry loop)         (check + record rate)          (actual send)

  Client calls the OUTERMOST .send() → each layer does its bit → delegates inward.
```

**Relationships:**
- `NotificationService` **has-a** collection of `Subscriber`s per event type → **Observer**.
- `ChannelFactory` **creates** a `NotificationChannel` → **Factory**.
- `NotificationDecorator` **implements** `NotificationChannel` AND **has-a** `NotificationChannel` (the wrapped one) → **Decorator**. This is the classic "implements the interface it wraps" shape — a decorated channel is still, as far as the caller is concerned, just a channel.

---

<a name="patterns"></a>
# 4. Patterns applied

### Observer — the subscription model
Subscribers register interest in event types (`"order.shipped"`); they don't poll, the service pushes to them. `NotificationService.publish(event, payload)` looks up everyone subscribed to that event type and calls `notifyAll()`. This decouples **event producers** (whatever code calls `publish`) from **event consumers** (subscribers) — the producer has no idea who's listening or how many.

### Factory — picking the right channel
Every subscriber has a channel preference, but `NotificationService` shouldn't contain `if (pref === "email") new EmailChannel() else if (pref === "sms") ...`. That's a growing if/else that violates Open/Closed every time a channel is added. `ChannelFactory.create(preference)` centralizes that mapping in **one** place — the service just asks the factory for "a channel" and gets back something that satisfies the `send()` interface.

### Decorator — THE emphasis pattern
The naive approach: one `NotificationSender` class with a `send()` method that does retry logic, rate-limit checks, AND the actual network call, all inline:
```js
send(notification) {
  if (isRateLimited(notification.userId)) return;
  for (let i = 0; i < 3; i++) {
    try { actuallySend(notification); return; }
    catch (e) { /* backoff */ }
  }
}
```
This is a **God method**. It mixes three responsibilities (rate limiting, retrying, sending) in one place, so:
- Want retry WITHOUT rate limiting for an admin broadcast? Can't — they're welded together.
- Want to add a THIRD enrichment (e.g. dedup)? Edit this method again, risk breaking the other two.
- Testing retry logic means also mocking rate-limit state, even though they're unrelated.

**Decorator fixes this by making each concern its own class**, each wrapping the next, each satisfying the same `send()` interface:
```
RetryDecorator(RateLimitDecorator(EmailChannel))
```
- `RetryDecorator.send()` — retries, then delegates to `this.wrapped.send()`.
- `RateLimitDecorator.send()` — checks the limit, then delegates to `this.wrapped.send()`.
- `EmailChannel.send()` — the actual work, no delegation (base case).

Each class has **exactly one reason to change** (Single Responsibility). Want the admin broadcast without rate limiting? Build `new RetryDecorator(new EmailChannel())` — skip the `RateLimitDecorator` layer entirely, no code duplicated, no existing class touched. Want to add `LoggingDecorator`? Write one new class; nothing else changes. This is Open/Closed in action: **open for extension (new decorators), closed for modification (existing decorators/channels untouched)**.

---

<a name="code"></a>
# 5. Core code

```js
// ---- Observer: NotificationService (Subject) ----
class NotificationService {
  constructor() {
    this.subscribersByEvent = new Map(); // eventType -> Set<Subscriber>
  }

  subscribe(subscriber, eventType) {
    if (!this.subscribersByEvent.has(eventType)) {
      this.subscribersByEvent.set(eventType, new Set());
    }
    this.subscribersByEvent.get(eventType).add(subscriber);
  }

  unsubscribe(subscriber, eventType) {
    this.subscribersByEvent.get(eventType)?.delete(subscriber);
  }

  publish(eventType, payload) {
    const subscribers = this.subscribersByEvent.get(eventType);
    if (!subscribers) return;
    this.notifyAll([...subscribers], eventType, payload);
  }

  notifyAll(subscribers, eventType, payload) {
    for (const subscriber of subscribers) {
      const notification = new Notification(eventType, payload, subscriber);
      subscriber.update(notification);
    }
  }
}

class Subscriber {
  constructor(id, contact, preference) {
    this.id = id;
    this.contact = contact;
    this.preference = preference; // "email" | "sms" | "push"
  }

  update(notification) {
    const baseChannel = ChannelFactory.create(this.preference, this.contact);
    const channel = new RetryDecorator(new RateLimitDecorator(baseChannel, this.id));
    channel.send(notification);
  }
}

class Notification {
  constructor(eventType, payload, subscriber) {
    this.eventType = eventType;
    this.payload = payload;
    this.subscriber = subscriber;
  }
}

// ---- Strategy: Channel interface ----
class NotificationChannel {
  send(notification) {
    throw new Error("send() must be implemented");
  }
}

class EmailChannel extends NotificationChannel {
  constructor(address) { super(); this.address = address; }
  send(notification) {
    console.log(`Emailing ${this.address}: ${notification.payload}`);
  }
}

class SMSChannel extends NotificationChannel { /* send() texts this.phone */ }
class PushChannel extends NotificationChannel { /* send() pushes to this.deviceToken */ }

// ---- Factory ----
class ChannelFactory {
  static create(preference, contact) {
    switch (preference) {
      case "email": return new EmailChannel(contact);
      case "sms":   return new SMSChannel(contact);
      case "push":  return new PushChannel(contact);
      default: throw new Error(`Unknown channel preference: ${preference}`);
    }
  }
}

// ---- Decorator base ----
class NotificationDecorator extends NotificationChannel {
  constructor(wrappedChannel) {
    super();
    this.wrapped = wrappedChannel;
  }
  send(notification) {
    this.wrapped.send(notification); // default: just delegate
  }
}

class RetryDecorator extends NotificationDecorator {
  constructor(wrappedChannel, maxRetries = 3) {
    super(wrappedChannel);
    this.maxRetries = maxRetries;
  }
  send(notification) {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.wrapped.send(notification); // delegate inward
        return;
      } catch (err) {
        if (attempt === this.maxRetries) throw err;
        // backoff before next attempt (omitted: setTimeout/exponential delay)
      }
    }
  }
}

class RateLimitDecorator extends NotificationDecorator {
  constructor(wrappedChannel, userId, limit = 5, windowMs = 60_000) {
    super(wrappedChannel);
    this.userId = userId;
    this.limit = limit;
    this.windowMs = windowMs;
    this.sendLog = []; // timestamps, per user (in-memory here; Redis in real HLD)
  }
  send(notification) {
    const now = Date.now();
    this.sendLog = this.sendLog.filter(t => now - t < this.windowMs);
    if (this.sendLog.length >= this.limit) {
      console.log(`Rate limited: user ${this.userId}`);
      return; // swallow, don't throw — a skipped send isn't an error
    }
    this.sendLog.push(now);
    this.wrapped.send(notification); // delegate inward
  }
}

// ---- Usage ----
const service = new NotificationService();
const alice = new Subscriber("u1", "alice@mail.com", "email");
service.subscribe(alice, "order.shipped");
service.publish("order.shipped", { orderId: 42 });
// → alice.update() builds RetryDecorator(RateLimitDecorator(EmailChannel)) and sends
```

---

<a name="concurrency"></a>
# 6. Concurrency

**The question:** `publish()` may fan out to thousands of subscribers. Should `notifyAll` fire all sends in parallel, or throttle them?

- **Fully parallel** (`Promise.all` over every subscriber): fastest, but a spike of 10,000 simultaneous outbound calls can exhaust sockets/connections, trip the email/SMS provider's own rate limit, and turn one slow subscriber's channel into a pile of un-awaited promises consuming memory.
- **Fully sequential:** safe but far too slow — 10,000 subscribers × 100ms/send ≈ 17 minutes for one publish.
- **Bounded concurrency (worker-pool / batch) — the answer:** process subscribers in batches of size `N` (e.g. 50), await each batch, move to the next. This caps in-flight sends, respects downstream provider limits, and still finishes in `total/N` batches rather than `total` sequential steps.

```js
async function dispatchBatched(subscribers, notificationFactory, batchSize = 50) {
  for (let i = 0; i < subscribers.length; i += batchSize) {
    const batch = subscribers.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(sub => safeSend(sub, notificationFactory(sub)))
    );
  }
}

async function safeSend(subscriber, notification) {
  try {
    await subscriber.update(notification); // update() -> decorator chain -> send()
  } catch (err) {
    // isolate: log and move on, never let one failure abort the batch
    console.error(`Delivery failed for ${subscriber.id}:`, err.message);
  }
}
```

**Failure isolation is the key detail:** `Promise.allSettled` (not `Promise.all`) means one subscriber's channel throwing (bad phone number, provider timeout after retries exhausted) doesn't reject the whole batch and doesn't stop the remaining subscribers in that batch — or the next batch — from being processed. Each `send()` failure is caught, logged, and the loop moves on. In a real system this failed notification would also be pushed to a **dead-letter queue** for later inspection instead of silently disappearing.

---

<a name="extensibility"></a>
# 7. Extensibility

### "Now add a WhatsApp channel"
1. `class WhatsAppChannel extends NotificationChannel { send(notification) { /* WhatsApp API call */ } }`
2. Add one case to `ChannelFactory.create()`: `case "whatsapp": return new WhatsAppChannel(contact);`
3. Done. `NotificationService`, `Subscriber.update()`, `RetryDecorator`, `RateLimitDecorator` — **zero changes**. They only ever depend on the `NotificationChannel` interface, never on a concrete class.

### "Now add per-user quiet hours (no push between 10pm–8am)"
Two valid shapes, both keep dispatch logic untouched:
- **As another decorator:** `QuietHoursDecorator` wraps the channel; `send()` checks the current time against the subscriber's quiet-hours window and either delegates (`this.wrapped.send()`) or silently queues/drops for later — same shape as `RateLimitDecorator`. Compose it in: `new RetryDecorator(new QuietHoursDecorator(new RateLimitDecorator(pushChannel)))`.
- **As a Strategy swap:** if quiet hours should defer rather than drop, `QuietHoursDecorator.send()` can instead push the notification onto a "deferred" queue that a scheduler flushes at 8am, still without `NotificationService` knowing quiet hours exist.

Either way, this is exactly why Decorator was chosen over a bloated `send()`: a brand-new cross-cutting concern (time-of-day, not retry, not rate limit) slots in as one more layer instead of one more `if` branch inside an already-overloaded method.

---

<a name="interview"></a>
# 8. Interview Q&A

### Q: "Walk me through how you'd design this."
> *"There are two distinct concerns: how a subscriber gets notified at all — that's Observer, the service publishes an event and every subscriber for that event type gets notified. And how a single notification actually goes out — that's a Strategy for picking the channel plus a Decorator chain for wrapping it with retry and rate-limit behavior before the real send happens."*

### Q: "How do you add a new channel without touching dispatch logic?"
> *"The service, the decorators, and the subscription logic never reference a concrete channel class — they only call `.send()` on whatever satisfies the `NotificationChannel` interface. Adding WhatsApp means writing one new class with a `send()` method and adding one line to the factory's switch statement. Nothing in `NotificationService` or `RetryDecorator` changes, because they were never coupled to *which* channel — that's the whole point of Strategy plus a Factory to construct it."*

### Q: "Why Decorator instead of just putting retry and rate-limit logic inside each channel, or inside one `send` method?"
> *"Putting it inside each channel means duplicating retry logic three times, once per channel, and any bug fix has to be applied three times. Putting it all in one method mixes three responsibilities that change for different reasons — that's a Single Responsibility violation and it's hard to test or reuse partially. Decorator lets each concern be one small class that wraps the next, so I can compose exactly the behavior I want — retry-then-ratelimit, or just retry, or add a fourth layer later — without editing any existing class."*

### Q: "What happens if one subscriber's send fails during a mass publish?"
> *"It shouldn't take down the batch. I wrap each individual send in a try/catch — or use `Promise.allSettled` instead of `Promise.all` if it's async — log the failure, and continue with the rest. In a real system I'd also route the failed notification to a dead-letter queue instead of just dropping it."*

### Q: "Would you send to all subscribers in parallel?"
> *"Not unbounded. Firing thousands of simultaneous sends risks exhausting connections and hitting the email/SMS provider's own rate limits. I'd batch — process, say, 50 subscribers at a time, await the batch with `allSettled`, then move to the next batch. That bounds concurrency while still being far faster than fully sequential."*

### Q: "How would you add quiet hours — no push notifications between 10pm and 8am?"
> *"As another decorator in the chain — a `QuietHoursDecorator` that checks the subscriber's local time before delegating to the wrapped channel, and either drops, defers, or lets it through. It composes with the existing `RetryDecorator` and `RateLimitDecorator` without changing them, which is exactly the case Decorator is built for — a new cross-cutting concern becomes one more layer, not one more `if` branch in a growing method."*

---

<a name="cheatsheet"></a>
# 9. Cheat Sheet

- **Shape:** Observer (subscription/fan-out) + Strategy (channel choice) + Factory (channel construction) + Decorator (enrichment chain before send).
- **Observer:** `NotificationService` = Subject, `Subscriber` = Observer; `subscribe/unsubscribe/publish` → `notifyAll`.
- **Factory:** `ChannelFactory.create(preference)` — one place mapping preference → concrete `NotificationChannel`, avoids if/else sprawl.
- **Decorator (the emphasis pattern):** `NotificationDecorator` implements `NotificationChannel` AND wraps one; `send()` does its bit then delegates inward. `RetryDecorator(RateLimitDecorator(EmailChannel))`.
- **Why Decorator wins:** one class per concern (SRP), compose freely per use case, add new concerns (quiet hours, logging, dedup) as new layers — zero edits to existing classes (Open/Closed).
- **New channel:** new class + one factory line. Zero changes to service/decorators.
- **New enrichment (quiet hours):** new decorator layer. Zero changes to dispatch logic.
- **Concurrency:** bounded batches (worker-pool), not fully parallel or fully sequential.
- **Failure isolation:** `Promise.allSettled` / try-catch per subscriber — one bad send never blocks the rest; failed ones → dead-letter queue.

*— LLD Problem 11 complete —*
