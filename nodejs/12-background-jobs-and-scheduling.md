# Node.js Study Notes — Part 12

## Background Jobs & Scheduling — Queues, BullMQ, Retries, Idempotency, Cron

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.
>
> **Why this matters:** some work doesn't belong inside an HTTP request — sending emails, resizing images, generating reports, calling slow partner APIs. Doing it in the request makes users wait and fails if anything hiccups. A job queue makes it fast, reliable and retryable — but only if you understand **"a job can run more than once."**
>
> **Continues from:** [Part 1.2 §6](01.2-event-loop-blocking-and-real-world-load.md) ("take it out of the request") and [System-design Part 13](../System-design/13-message-queues.md) (queues at the system level).

---

## Table of Contents

1. [Why move work out of the request](#why)
2. [How a job queue works](#how)
3. [⭐ BullMQ in practice](#bullmq)
4. [⭐ Retries, backoff and dead jobs](#retries)
5. [⭐ The golden rule: jobs must be idempotent](#idempotent)
6. [The "saved to DB but job never queued" problem](#outbox)
7. [Scheduled & repeating jobs (cron)](#cron)
8. [Running workers in production](#workers)
9. [Interview Questions & Answers](#interview)
10. [Cheat Sheet](#cheatsheet)

---

<a name="why"></a>
# 1. Why move work out of the request

```js
// ❌ everything inside the request
app.post('/signup', async (req, res) => {
  const user = await User.create(req.body);
  await sendWelcomeEmail(user);        // 1-3s, and fails if the email provider is down
  await createStripeCustomer(user);    // another second
  await resizeAvatar(user.avatar);     // CPU work — blocks the event loop
  res.status(201).json(user);          // user waited ~5s; any failure = signup "failed"
});

// ✅ do the essential part now, the rest in the background
app.post('/signup', async (req, res) => {
  const user = await User.create(req.body);
  await queue.add('welcome-email', { userId: user.id });
  await queue.add('stripe-customer', { userId: user.id });
  res.status(201).json(user);          // ~50ms
});
```

> **Analogy 🍔 — a fast-food counter.** The cashier takes your order and gives you a number right away. The kitchen cooks it. The cashier doesn't stand at the grill while the next customer waits.

**Good candidates:** emails/SMS/push, image and video processing, PDF/report generation, webhooks to other systems, data imports/exports, anything that calls a slow or flaky third party, anything that can be retried later.

**Bad candidates:** things the user needs in the response right now (the order id, validation errors).

---

<a name="how"></a>
# 2. How a job queue works

```
API (producer) ──add job──▶ [ QUEUE in Redis / SQS / RabbitMQ ] ──▶ worker 1 (consumer)
                                                                  ──▶ worker 2
                                                                  ──▶ worker 3
```

- **Producer** — your API adds a job: a name + a small payload (`{ userId: 42 }`).
- **Queue** — stores jobs safely until someone takes them.
- **Worker** — a separate process that takes jobs one at a time (or N at a time), does the work, and marks them done or failed.

Benefits: the API stays fast; you can **scale workers separately** from the API; spikes are smoothed out (jobs wait instead of overloading things); failures are **retried** automatically.

**Pass ids, not whole objects** — `{ userId: 42 }`, not the full user. The worker loads fresh data, and the queue stays small.

---

<a name="bullmq"></a>
# 3. ⭐ BullMQ in practice

**BullMQ** is the most common Node job queue. It uses **Redis**. (Alternatives: managed queues like AWS SQS or Google Cloud Tasks; RabbitMQ; `pg-boss` if you'd rather use Postgres.)

```js
// queue.js — used by the API to add jobs
import { Queue } from 'bullmq';
export const emailQueue = new Queue('email', { connection: { host: 'redis', port: 6379 } });

await emailQueue.add('welcome', { userId: 42 }, {
  attempts: 5,                                  // try up to 5 times
  backoff: { type: 'exponential', delay: 2000 },// wait 2s, 4s, 8s, 16s between tries
  removeOnComplete: 1000,                       // keep only the last 1000 finished jobs
  removeOnFail: 5000,
});
```

```js
// worker.js — a SEPARATE process
import { Worker } from 'bullmq';

const worker = new Worker('email', async (job) => {
  const user = await User.findById(job.data.userId);
  if (!user) return;                             // deleted meanwhile — nothing to do
  await mailer.sendWelcome(user);
}, { connection, concurrency: 10 });             // up to 10 jobs at once in this process

worker.on('failed', (job, err) => logger.warn({ jobId: job.id, err }, 'job failed'));
```

Useful features: `delay` (run in 10 minutes), `priority`, **rate limiting** a queue (max 100 jobs per second to a partner API), job progress, and a dashboard (Bull Board) to see waiting/failed jobs and retry them.

---

<a name="retries"></a>
# 4. ⭐ Retries, backoff and dead jobs

Jobs fail: the email provider is down, the network blips, a bug. Plan for it.

- **Retry with exponential backoff** — wait longer after each failure so a struggling service gets room to recover. Add jitter so thousands of jobs don't retry at the same second.
- **Don't retry what can't succeed.** A job for a deleted user or with invalid data will fail every time. Detect it and finish/fail it right away (BullMQ: throw an `UnrecoverableError`).
- **After the last attempt, keep the job as "failed"** (a dead-letter queue) — don't lose it. Alert when failed jobs pile up, and let a human inspect and retry them.
- **Set a timeout** for each job's work, so a hung call doesn't hold a worker forever.

---

<a name="idempotent"></a>
# 5. ⭐ The golden rule: jobs must be idempotent

**Queues guarantee "at least once," not "exactly once."** A job can run **twice** — for example the worker sends the email, then crashes *before* marking the job done; the queue thinks it failed and gives it to another worker.

> 🧠 **Remember:** **"Every job may run twice. Make running it twice harmless."**

**Idempotent** = doing it twice has the same effect as doing it once.

```js
// ❌ not idempotent — a retry charges the customer twice
async function chargeJob(job) {
  await stripe.charges.create({ amount: job.data.amount, customer: job.data.customerId });
}

// ✅ idempotent — the provider recognises the repeat
async function chargeJob(job) {
  await stripe.charges.create(
    { amount: job.data.amount, customer: job.data.customerId },
    { idempotencyKey: `order-${job.data.orderId}` }
  );
}
```

Ways to make jobs idempotent:
- **Check before doing:** "is `welcomeEmailSentAt` already set? then skip" — and set it right after.
- **Use idempotency keys** with external APIs that support them (Stripe, most payment providers).
- **Use unique constraints** — inserting the same `(orderId, type)` row twice fails harmlessly.
- **Use upserts / "set to value"** instead of "add 1" ([database Part 05.6](../database/05.6-mongodb-atomic-writes-upsert-bulk.md)).
- **Deduplicate jobs when adding:** give a job a fixed `jobId` (`welcome-${userId}`) — BullMQ won't add a second job with the same id while it exists.

---

<a name="outbox"></a>
# 6. The "saved to DB but job never queued" problem

```js
await Order.create(order);                  // ✅ saved
await queue.add('send-receipt', { orderId }); // 💥 Redis down / process crashes → no receipt, ever
```

The database write and the queue add are **two different systems** — one can succeed and the other fail. Options:

- **Accept and repair:** a periodic job finds orders without a receipt and queues them. Simple and often enough.
- **The outbox pattern:** in the **same database transaction** as the order, insert an "outbox" row (`{ type: 'send-receipt', orderId }`). A separate process reads unsent outbox rows and puts them on the queue, then marks them sent. Since the order and the outbox row are saved together, you can't have one without the other. Details: [System-design Part 13.5](../System-design/13.5-message-brokers-deep-dive.md).
- Either way the job may be queued twice → idempotent jobs (§5) again.

---

<a name="cron"></a>
# 7. Scheduled & repeating jobs (cron)

"Every night at 2 a.m., send the daily report." "Every 5 minutes, sync prices."

**The trap: `setInterval` or `node-cron` inside your API.** With **3 instances, the job runs 3 times.** With autoscaling, an unknown number of times. And it dies with each deploy.

Better options:
- **Queue-based repeatable jobs:** BullMQ `upsertJobScheduler` (older versions: `repeat` option) — the schedule lives in Redis, so exactly one job is created per tick, no matter how many workers run.
  ```js
  await reportQueue.upsertJobScheduler('daily-report', { pattern: '0 2 * * *', tz: 'Asia/Kolkata' });
  ```
- **The platform's scheduler:** Kubernetes `CronJob`, AWS EventBridge, GCP Cloud Scheduler — starts a short-lived process on a schedule.
- If you must run cron inside the app, take a **distributed lock** first (e.g. Redis `SET key NX EX`) so only one instance does the work.

Cron syntax refresher: `minute hour day-of-month month day-of-week` → `0 2 * * *` = 02:00 every day; `*/5 * * * *` = every 5 minutes. **Always state the time zone.**

---

<a name="workers"></a>
# 8. Running workers in production

- **Run workers as separate processes/containers from the API**, so heavy jobs don't slow API requests, and you can scale each independently (more workers when the queue grows).
- **Concurrency:** I/O-heavy jobs (emails, API calls) → higher concurrency per worker (10–50). CPU-heavy jobs (images, PDFs) → concurrency ≈ CPU cores, or worker threads ([Part 2 §6](02-nodejs-internals.md)).
- **Graceful shutdown:** on SIGTERM, call `worker.close()` — stops taking new jobs and waits for the current ones to finish ([Part 6.6](06.6-graceful-shutdown-health-checks-and-docker.md)).
- **Watch:** queue length (waiting jobs), job duration, failure rate, oldest waiting job age. A growing queue = workers can't keep up.
- **Redis for BullMQ** must not evict keys: set `maxmemory-policy noeviction`, or jobs can silently vanish.

---

<a name="interview"></a>
# 9. Interview Questions & Answers

### Q1. When would you use a background job instead of doing work in the request?
> "When the user doesn't need the result in the response, the work is slow or CPU-heavy, or it talks to something flaky — emails, image processing, reports, webhooks, third-party syncs. The request saves what's essential, queues a job, and responds quickly; workers do the rest with retries."

### Q2. How do retries work in a job queue, and what can go wrong?
> "A failed job is retried a few times with exponential backoff and jitter. After the last attempt it goes to a failed or dead-letter state for inspection and alerting. The big risk is side effects running twice, so jobs have to be idempotent, and errors that can never succeed shouldn't be retried at all."

### Q3. Why must jobs be idempotent?
> "Because queues deliver at least once. A worker can finish the work and crash before acknowledging it, so the job runs again. I make repeats harmless with 'already done?' checks, idempotency keys for external APIs, unique constraints, upserts, and deterministic job ids to avoid duplicates."

### Q4. You save an order and then queue a 'send receipt' job, but sometimes no receipt is sent. Why, and how do you fix it?
> "The DB write and the queue add are two systems — if the process crashes or Redis is down between them, the job is lost. Use the outbox pattern: write an outbox row in the same transaction as the order and have a relay publish it, or at least a periodic job that finds orders missing receipts. Either way the job must be idempotent."

### Q5. How do you run a scheduled job when the app runs on several instances?
> "Not with `setInterval` or `node-cron` in each instance — that runs it once per instance. I'd use the queue's repeatable jobs, where the schedule lives in Redis and creates exactly one job per tick, or the platform scheduler like a Kubernetes CronJob. As a fallback, a distributed lock so only one instance runs it."

### Q6. How do you size worker concurrency?
> "By the kind of work. I/O-bound jobs spend most of their time waiting, so one worker can run many at once. CPU-bound jobs block the event loop, so roughly one per core, or worker threads. Then I watch queue length and job duration and scale the number of worker processes."

---

<a name="cheatsheet"></a>
# 10. Cheat Sheet

```
REQUEST does the essentials · QUEUE + WORKERS do the rest
"cashier gives you a number; the kitchen cooks"
good for: email, images, PDFs, webhooks, imports, slow/flaky APIs
pass IDs in job data, not whole objects

BullMQ (Redis) · alternatives: SQS, Cloud Tasks, RabbitMQ, pg-boss
queue.add(name, data, { attempts, backoff: exponential, removeOnComplete })
new Worker(name, fn, { concurrency }) — separate process

RETRIES: exponential backoff + jitter · don't retry the impossible (UnrecoverableError)
         keep failed jobs (DLQ) + alert · per-job timeout

AT-LEAST-ONCE → "every job may run twice; make it harmless"
idempotency: already-done check · idempotency keys · unique constraints · upserts · fixed jobId

DB write + queue add = 2 systems → outbox pattern (same transaction) or a repair job

CRON: NOT setInterval/node-cron in every instance (runs N times)
      → BullMQ job scheduler · K8s CronJob / EventBridge · or a Redis lock
      '0 2 * * *' = 2 a.m. daily · always set the time zone

PROD: workers separate from API · I/O jobs high concurrency, CPU jobs ≈ cores
      worker.close() on SIGTERM · watch queue length + oldest job · Redis noeviction
```
