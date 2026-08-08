# API Design — Scenario Bank

---

### "How do you design idempotent APIs, and where would you use that?"

**Definition:** An operation is idempotent if calling it once or N times with the same input produces the same end state and (ideally) the same response. It's not about "no side effects" — it's about **the side effect not compounding on repeat**.

**Naturally idempotent vs not**

| Method | Idempotent? | Why |
|---|---|---|
| GET, HEAD, OPTIONS | ✅ | Read-only |
| PUT | ✅ | Full replace — applying the same state twice = same state |
| DELETE | ✅ | Gone stays gone (even if 2nd call returns 404 instead of 200) |
| PATCH | ⚠️ | Only if the patch is a **set**, not a **delta**. `PATCH {status: "shipped"}` is idempotent; `PATCH {increment: 1}` is not |
| POST | ❌ | Create semantics — the hard case, and the one interviewers actually want you to design |

**Designing idempotency for POST — the Idempotency-Key pattern** (what Stripe/PayPal do):

1. Client generates a unique key (UUID) per *logical* attempt — not per HTTP call. If the client retries after a timeout, it reuses the *same* key.
2. Client sends it as a header: `Idempotency-Key: 7d3f...`
3. Server logic on receipt:
   - Look up the key in an idempotency store.
   - **Not seen** → reserve the key, process the request, store `{key, request_hash, status, response}`, return response.
   - **Seen + completed** → skip reprocessing, replay the stored response verbatim (same status code, same body).
   - **Seen + still in-flight** (a concurrent duplicate) → return `409 Conflict` (or block briefly) — don't process twice in parallel.
   - **Seen but request body hash differs** → `422 Unprocessable Entity` — key reuse with different payload is a client bug, not a retry.
4. **Atomicity is the crux**: the "check + reserve" step must be a single atomic op, or two concurrent retries both pass the check and both execute. In practice: Redis `SETNX` on the key, or a DB **unique constraint** on `(idempotency_key)` where the second insert throws and you catch it as "already claimed."
5. **TTL** — keys expire (e.g. 24h), matching how long a client might plausibly retry.
6. **Scope the key** — per API credential/account, so two different customers can't collide on the same key.

**Where it's used (real use cases):**

- **Payments** — the textbook case. Network times out after the charge succeeded server-side; client retries; without a key you double-charge.
- **Order/booking creation** — same story, e.g. flight booking APIs.
- **Webhook delivery** — most webhook providers guarantee *at-least-once* delivery, meaning **the receiver must be idempotent**, not the sender. You dedupe on the webhook's event ID.
- **Message queue consumers** — SQS/Kafka at-least-once delivery means a consumer can see the same message twice; the handler needs to be idempotent (e.g. `UPSERT` instead of `INSERT`, or check a processed-events table).
- **Client SDKs with automatic retry** — any SDK that retries on 5xx/timeout needs idempotency underneath or it silently duplicates.

**Common mistakes** (what separates a good interview answer from a great one):

- Storing only "it succeeded" instead of the **full response** — replay must return the exact original response, not a freshly recomputed one.
- Treating idempotency key as optional/advisory instead of enforcing it with a DB constraint.
- Not handling the **concurrent in-flight** case (only handling "already completed").
- Making `PATCH` idempotent by accident-checking only the HTTP method, ignoring that the payload itself might be a relative delta.

**Tests:** idempotency vs safety, retry semantics, distributed systems reasoning, why POST is the hard case

*Axis: consistency · Source: real interview*

#### Follow-ups

- **Concurrency:** Two identical retries with the same idempotency key arrive at the exact same millisecond, both pass a naive `SELECT` check before either has inserted. How do you close that race?
  → The check-and-reserve has to be one atomic operation, not read-then-write. Use Redis `SETNX` (atomically fails if the key exists) or a DB `INSERT` with a unique constraint on the key column — the second insert throws, and I catch that as "already claimed" rather than doing a separate existence check first.

- **Failure:** The server crashes *after* charging the payment provider but *before* writing the idempotency record. The client retries. What happens now, and how do you prevent a double-charge here?
  → Without the record, the retry looks like a brand-new request and would charge again. The fix is ordering: reserve the idempotency key (status = "processing") in the *same transaction/step* as, or strictly before, the side-effecting call to the payment provider — so a crash after the charge but before marking "completed" is still detectable. On retry, I see status = "processing," which tells me a previous attempt may have gone out; the correct response is to check the payment provider directly (idempotency key passed through to them too, if they support it) rather than blindly re-charging.

- **Scale:** You're storing idempotency keys in Redis with a 24h TTL for a payments API doing 5,000 req/s. What's the memory footprint concern, and what's your eviction/fallback strategy if Redis restarts mid-window?
  → Rough sizing: 5,000 req/s × 86,400s × (key + response payload size) — even at a few hundred bytes per entry that's tens of GB across a day, so I'd cap what's cached (store a reference/hash of the response, not large payloads) and consider a shorter TTL than 24h if the business allows it. For Redis restart/data loss: Redis alone as the source of truth is risky — I'd back the idempotency record with a DB unique constraint as the durable source of truth, and use Redis only as a fast-path cache in front of it. If Redis loses the key, the DB constraint still prevents a duplicate insert; worst case is a slower path (hit the DB instead of a Redis hit), not a double-charge.

- **Client design:** If the frontend generates the idempotency key, how does a *retry* of the same click send the same key while a genuinely *new* click gets a new one? Doesn't every click just generate a fresh UUID?
  → The key belongs to the **attempt, not the HTTP request**. Generate it once, at the start of the user's intent — e.g. `useState(() => crypto.randomUUID())` when the checkout component mounts, not inside the submit handler. Every network attempt for *that same click* — including automatic retries from an axios/fetch retry interceptor — reuses that one key; the retry logic never generates a new one, it just resends with the same header.

  A second, deliberate click shouldn't even reach the network while the first is in flight — that's guarded client-side first, synchronously on click, before the async call starts:
  ```js
  const handlePay = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await pay({ headers: { 'Idempotency-Key': idempotencyKey } });
    } finally {
      setIsSubmitting(false); // or navigate away on success
    }
  };
  ```
  But the disabled-button guard is a client convenience, not a guarantee — double-tap before React re-renders the disabled state, bfcache restoring an old page state, two tabs open on the same checkout, or the client's own retry logic firing a second call after a timeout. That's exactly why the idempotency key exists server-side as a backstop that doesn't depend on the frontend behaving correctly.

  For surviving a page refresh mid-payment, in-memory state doesn't help — either persist the generated UUID in `sessionStorage` keyed by the cart/order draft ID and reuse it while that draft's payment is unresolved, or (what Stripe actually does) don't generate an arbitrary key per click at all — tie it to a **PaymentIntent ID** created server-side when checkout begins, and keep reusing that ID as the idempotency key for every confirm/retry against that one intent. A genuinely new payment means a new intent, which naturally gets a new ID.

  Net effect: the client doesn't need to perfectly serialize clicks — it just needs the *server* to serialize on the key. If two clicks somehow both fire with the same key before either request lands, that's the "seen + in-flight" case above: the second gets `409` or blocks and returns the first's result.

---
