# Container Operations — Scenario Bank

---

### "What happens when a container crashes?"

By default, a crashed container just... stops — nothing automatically brings it back unless something is explicitly configured to react to that. In a bare `docker run` setup with no restart policy, a crash means downtime until a human notices and manually restarts it.

**Restart policies** (`docker run --restart=on-failure` or `unless-stopped`, or the equivalent in `docker-compose.yml`) tell Docker to automatically restart the container when it exits unexpectedly. In an orchestrated environment (Kubernetes, ECS), this is handled at the orchestrator level instead — a crashed pod/task is detected and a replacement is scheduled automatically, often onto a healthy node if the crash was node-related.

The part that matters beyond "does it restart": **why did it crash**, and does restarting actually fix that, or just mask it? A container that crashes from an unhandled exception will crash again immediately on restart if the same input triggers it (a crash loop) — restart policies handle transient issues (a temporary resource spike, a flaky dependency at startup) but don't fix an underlying bug, and a tight, endless crash loop is itself worth alerting on rather than silently absorbing forever.

**Interview line:** *"By default a crashed container just stays down — nothing restarts it without an explicit restart policy or an orchestrator managing it. I'd set a restart policy for transient failures, but I also treat a crash loop — the same container crashing repeatedly right after each restart — as something to alert on, not silently absorb, because that usually means a real bug, not a transient blip that a restart actually fixes."*

**Tests:** container failure handling, crash loops

*Axis: recovery · Source: challenge question*

---

### "How do you expose a service securely?"

Not every container needs to be reachable from the public internet, and treating "runs in Docker" as inherently safe is the same mistake as trusting an "internal" API by default (see [`08-security/`](../08-security/)):

- **Only publish the ports that actually need external access** — a database container generally shouldn't have its port published to the host/internet at all; other containers on the same Docker network can already reach it by service name without a published port.
- **Put a reverse proxy in front** (nginx, Traefik, or a cloud load balancer) rather than exposing application containers directly — centralizes TLS termination, and means the app container itself doesn't need to handle HTTPS.
- **TLS/HTTPS for anything actually reachable externally** — never plain HTTP for a publicly-exposed service.
- **Network segmentation** — production containers on a network that isn't reachable from the public internet by default, only reachable through the explicit, controlled path (the reverse proxy/load balancer, and nothing else).
- **Authenticate at the service level too**, not just the network boundary — defense in depth, same principle as internal API protection.

**Interview line:** *"I only publish the ports that genuinely need external access — a database container generally doesn't need a published port at all if other containers can reach it on the internal Docker network by service name. Everything actually public sits behind a reverse proxy handling TLS termination, on a network segmented so nothing's reachable from the internet except through that explicit, controlled path."*

**Tests:** container network security, defense in depth

*Axis: failure · Source: challenge question*

---

### "What happens if your container runs out of memory?"

If a memory limit is set on the container (via cgroups, `docker run -m` or a Kubernetes resource limit) and the container's process tries to exceed it, the **kernel's OOM (out-of-memory) killer** kills the offending process — inside a container, this typically means the container's main process gets killed, and the container exits (Docker/the orchestrator then applies whatever restart policy is configured, as above). This is a hard kill, not a graceful shutdown — the process doesn't get a chance to clean up, finish in-flight work, or log a nice error; it's just terminated.

If **no** memory limit is set, the container can consume memory up to what the **host machine** has available — which risks starving other containers (or the host OS itself) of memory, potentially taking down unrelated services sharing that host, not just the one misbehaving container. This is exactly the bulkhead problem from category 01, applied to infrastructure: without a limit, one container's memory leak or spike isn't contained to itself.

**The response:** always set explicit memory limits per container (turns "one container can take down the whole host" into "one container gets OOM-killed, contained to itself"), monitor memory usage trending toward the limit as a leading indicator (so you catch a leak before it gets OOM-killed in production), and separately, actually investigate *why* a container is hitting its limit — a repeatedly OOM-killed container is a real bug (a leak, or a limit set too low for legitimate need), not something to just silently restart forever.

**Interview line:** *"With a memory limit set, the kernel's OOM killer hard-kills the container's process once it exceeds it — no graceful cleanup, just terminated, then whatever restart policy applies kicks in. Without a limit, a container can consume the whole host's memory and starve or crash unrelated containers sharing that host — that's the bulkhead problem applied to infrastructure. So I always set explicit limits, which contains the damage to one container, and I monitor memory trending toward the limit so I catch a leak before it gets killed in production rather than after."*

**Tests:** OOM handling, resource limits, bulkhead principle

*Axis: failure · Source: challenge question*

---

### "How do you handle container health checks?"

A health check is the orchestrator (or Docker itself) periodically asking a container "are you actually working, not just running?" — because a process can be technically alive (the container hasn't crashed) while being completely unable to serve traffic (deadlocked, stuck waiting on a dead dependency, out of database connections) — "process is running" and "process is healthy" are genuinely different questions, and only a health check answers the second one.

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
```

A good health-check endpoint doesn't just return `200 OK` unconditionally — it should verify the things that actually determine whether the service can do its job (can it reach its database? is a critical dependency reachable?) without being so strict that a *transient*, self-recovering blip in a non-critical dependency causes healthy instances to be needlessly killed and restarted (a failing health check in an orchestrator typically triggers exactly that — replacing the "unhealthy" instance).

Distinguish two kinds, common in Kubernetes: a **liveness** check answers "should this be restarted?" (is the process fundamentally stuck/deadlocked); a **readiness** check answers "should traffic be routed to this instance right now?" (a temporarily overloaded or still-starting-up instance might be alive but not ready) — conflating the two means a temporary overload gets treated as a crash-worthy failure instead of just being taken out of the load-balancing rotation until it recovers.

**Interview line:** *"A health check answers a different question than 'is the process running' — it's 'can this instance actually do its job right now.' I distinguish liveness, which answers whether it should be restarted because it's genuinely stuck, from readiness, which answers whether traffic should be routed to it right now — conflating the two means a temporarily overloaded but otherwise fine instance gets killed and restarted instead of just being pulled out of rotation until it recovers."*

**Tests:** liveness vs readiness, health check design

*Axis: recovery · Source: challenge question*

---

### "How do you perform zero-downtime deployments?"

The core requirement: at no point should the number of healthy instances serving traffic drop to zero, and no in-flight request should be dropped mid-response. Two common strategies:

**Rolling deployment** — replace old instances with new ones **gradually**, a few at a time: start a new instance, wait for its health check to pass, add it to the load balancer, *then* remove one old instance (send it `SIGTERM`, let it gracefully shut down — see [`07-nodejs-runtime/node-memory-and-streams.md`](../07-nodejs-runtime/node-memory-and-streams.md)), and repeat until all instances are the new version. Capacity dips only slightly during the transition (never to zero), and if the new version is broken, you find out partway through rather than after a full cutover.

**Blue-green deployment** — run the **entire new version** ("green") alongside the entire current version ("blue"), fully deployed and health-checked, then switch traffic over **all at once** (usually via a load balancer/router config change) once green is confirmed healthy. Instant cutover, and instant rollback (just switch traffic back to blue) if something's wrong — at the cost of needing double the infrastructure running simultaneously during the transition.

**Canary deployment** — a variant that routes only a **small percentage** of traffic to the new version first (5%, then 25%, then 100%, watching error rates/metrics at each step), rather than an all-or-nothing switch — catches a bad deploy while it's only affecting a small fraction of users, before it ever reaches everyone.

All three depend on the same underlying pieces: health checks (to know a new instance is actually ready before routing traffic to it) and graceful shutdown (so removing an old instance doesn't drop its in-flight requests) — the deployment strategy is really just different policies for *when* to shift traffic, built on top of those two more fundamental mechanisms.

**Interview line:** *"Rolling deployment replaces instances gradually, dipping capacity only slightly, never to zero. Blue-green runs the full new version alongside the old one and switches all traffic at once, which gives instant rollback at the cost of double the infrastructure during the transition. Canary routes a small percentage of traffic to the new version first and ramps up while watching metrics, so a bad deploy only affects a fraction of users before it's caught. All three actually depend on the same two things underneath — health checks to know an instance is really ready, and graceful shutdown so removing an old instance doesn't drop its in-flight requests."*

**Tests:** deployment strategies, zero-downtime mechanics

*Axis: recovery · Source: challenge question*

---
