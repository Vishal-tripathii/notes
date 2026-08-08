# Scenario Bank — Master Backlog

> The full candidate list for the scenario bank, organized into the 15 topic folders under `scenario-bank/`. This is a **backlog**, not content — nothing here is answered until it's actually taught, discussed, and agreed on in chat, per [`00-README.md`](00-README.md). Working through it is ad hoc: pull whatever question is relevant when it's relevant, check it off here, move on. No fixed order, no forced coverage.
>
> Definition-style items (marked *(def)*) need to be turned into a "what happens when / what would you do" scenario before they earn an entry — see the Quality Gate in the README. They're kept in the list because they're still worth understanding, but the saved entry should scenario-ify them, not restate them.

---

## Progress tracker

| # | Category | Folder | Status |
|---|---|---|---|
| 01 | Distributed Systems & Reliability | `01-distributed-systems-reliability/` | ✅ done (26/26) |
| 02 | API Design | `02-api-design/` | ✅ done (20/20) |
| 03 | Databases | `03-databases/` | ✅ done (21/21) |
| 04 | Caching | `04-caching/` | ✅ done (11/11) |
| 05 | Messaging / Event-Driven Systems | `05-messaging-event-driven/` | ✅ done (11/11) |
| 06 | Frontend Architecture | `06-frontend-architecture/` | ✅ done (25/25) |
| 07 | Node.js / Runtime | `07-nodejs-runtime/` | ✅ done (10/10) |
| 08 | Security | `08-security/` | ✅ done (9/9) |
| 09 | Docker / Infrastructure | `09-docker-infrastructure/` | ✅ done (11/11) |
| 10 | System Design | `10-system-design/` | ✅ done (17/17) |
| 11 | Observability | `11-observability/` | ✅ done (8/8) |
| 12 | Concurrency | `12-concurrency/` | ✅ done (7/7) |
| 13 | File / Storage Systems | `13-file-storage-systems/` | ✅ done (7/7) |
| 14 | Multi-Tenancy | `14-multi-tenancy/` | ✅ done (9/9) |
| 15 | Offline-First / Distributed Client Systems | `15-offline-first/` | ✅ done (9/9) |
| 16 | Resume Deep-Dive | `16-resume-deep-dive/` | ✅ done (20/20) |

---

## 01 — Distributed Systems & Reliability

### Failure handling
- [x] How do you design idempotent APIs? → [`01-distributed-systems-reliability/resilience-patterns.md`](01-distributed-systems-reliability/resilience-patterns.md) *(also cross-linked from `02-api-design/api-design.md`)*
- [x] How do you handle retries? / exponential backoff / jitter / circuit breakers → [`01-distributed-systems-reliability/resilience-patterns.md`](01-distributed-systems-reliability/resilience-patterns.md)
- [x] What happens when a downstream service is unavailable? → [`cascading-failures-and-degradation.md`](01-distributed-systems-reliability/cascading-failures-and-degradation.md)
- [x] How do you prevent cascading failures? → [`cascading-failures-and-degradation.md`](01-distributed-systems-reliability/cascading-failures-and-degradation.md)
- [x] What is a retry storm? → [`cascading-failures-and-degradation.md`](01-distributed-systems-reliability/cascading-failures-and-degradation.md)
- [x] How do you handle partial failures? → [`cascading-failures-and-degradation.md`](01-distributed-systems-reliability/cascading-failures-and-degradation.md)
- [x] How do you design graceful degradation? → [`cascading-failures-and-degradation.md`](01-distributed-systems-reliability/cascading-failures-and-degradation.md)
- [x] What is bulkheading and when would you use it? → [`cascading-failures-and-degradation.md`](01-distributed-systems-reliability/cascading-failures-and-degradation.md)
- [x] How do you handle network timeouts? / how do you choose timeout values? → [`cascading-failures-and-degradation.md`](01-distributed-systems-reliability/cascading-failures-and-degradation.md)
- [x] What happens when a request succeeds but the response is lost? → [`message-delivery-guarantees.md`](01-distributed-systems-reliability/message-delivery-guarantees.md)
- [x] How do you prevent duplicate processing? → [`message-delivery-guarantees.md`](01-distributed-systems-reliability/message-delivery-guarantees.md)
- [x] How do you guarantee at-least-once processing doesn't create duplicate effects? → [`message-delivery-guarantees.md`](01-distributed-systems-reliability/message-delivery-guarantees.md)
- [x] How do you handle poison messages? → [`message-delivery-guarantees.md`](01-distributed-systems-reliability/message-delivery-guarantees.md)
- [x] What happens when a consumer crashes halfway through processing? → [`message-delivery-guarantees.md`](01-distributed-systems-reliability/message-delivery-guarantees.md)
- [x] How do you safely replay failed events? → [`message-delivery-guarantees.md`](01-distributed-systems-reliability/message-delivery-guarantees.md)
- [x] How do you handle out-of-order events? → [`message-delivery-guarantees.md`](01-distributed-systems-reliability/message-delivery-guarantees.md)

### Consistency
- [x] Strong consistency vs eventual consistency — when do you choose which? → [`consistency-and-transactions.md`](01-distributed-systems-reliability/consistency-and-transactions.md)
- [x] What happens when two services update the same entity simultaneously? → [`consistency-and-transactions.md`](01-distributed-systems-reliability/consistency-and-transactions.md)
- [x] How do you handle race conditions across services? → [`consistency-and-transactions.md`](01-distributed-systems-reliability/consistency-and-transactions.md)
- [x] How do you maintain consistency across multiple databases? → [`consistency-and-transactions.md`](01-distributed-systems-reliability/consistency-and-transactions.md)
- [x] How do you implement distributed transactions? / when would you use Saga? → [`consistency-and-transactions.md`](01-distributed-systems-reliability/consistency-and-transactions.md)
- [x] What is the transactional outbox pattern? → [`consistency-and-transactions.md`](01-distributed-systems-reliability/consistency-and-transactions.md)
- [x] How do you prevent lost updates? → [`consistency-and-transactions.md`](01-distributed-systems-reliability/consistency-and-transactions.md)
- [x] Optimistic vs pessimistic locking? → [`consistency-and-transactions.md`](01-distributed-systems-reliability/consistency-and-transactions.md) *(also relevant to 03-databases and 12-concurrency — cross-link there rather than re-writing)*
- [x] How do you handle stale reads? → [`consistency-and-transactions.md`](01-distributed-systems-reliability/consistency-and-transactions.md)
- [x] How do you deal with clock differences between services? → [`consistency-and-transactions.md`](01-distributed-systems-reliability/consistency-and-transactions.md)

---

## 02 — API Design

### REST
- [x] How do you design idempotent APIs? → [`02-api-design/api-design.md`](02-api-design/api-design.md)
- [x] How would you design a REST API? → [`rest-design-fundamentals.md`](02-api-design/rest-design-fundamentals.md)
- [x] PUT vs PATCH? / POST vs PUT? → [`rest-design-fundamentals.md`](02-api-design/rest-design-fundamentals.md)
- [x] When should an API return 202 Accepted? → [`rest-design-fundamentals.md`](02-api-design/rest-design-fundamentals.md)
- [x] How do you version APIs? / URI vs header versioning? → [`rest-design-fundamentals.md`](02-api-design/rest-design-fundamentals.md)
- [x] How do you design pagination? / offset vs cursor? → [`rest-design-fundamentals.md`](02-api-design/rest-design-fundamentals.md)
- [x] How do you design filtering/sorting? → [`rest-design-fundamentals.md`](02-api-design/rest-design-fundamentals.md)
- [x] How do you prevent clients from requesting excessive data? → [`rest-design-fundamentals.md`](02-api-design/rest-design-fundamentals.md)
- [x] How do you design bulk APIs? / how do you handle partial success in bulk operations? → [`rest-design-fundamentals.md`](02-api-design/rest-design-fundamentals.md)
- [x] How do you design API error responses? → [`rest-design-fundamentals.md`](02-api-design/rest-design-fundamentals.md)
- [x] How do you make APIs backward compatible? / how do you deprecate an API? → [`rest-design-fundamentals.md`](02-api-design/rest-design-fundamentals.md)
- [x] How do you handle API rate limiting? / token bucket vs leaky bucket? → [`rest-design-fundamentals.md`](02-api-design/rest-design-fundamentals.md)
- [x] How do you design API authentication? / authn vs authz? → [`rest-design-fundamentals.md`](02-api-design/rest-design-fundamentals.md) *(cross-link from 08-security when covered)*
- [x] RBAC vs ABAC? → [`rest-design-fundamentals.md`](02-api-design/rest-design-fundamentals.md) *(cross-link from 08-security when covered)*
- [x] How do you securely expose tenant-specific APIs? → [`rest-design-fundamentals.md`](02-api-design/rest-design-fundamentals.md) *(deeper isolation angle lands in 14-multi-tenancy)*

### Scenario questions
- [x] Your API suddenly receives 100× traffic. What changes? → [`api-scenario-debugging.md`](02-api-design/api-scenario-debugging.md)
- [x] One customer is consuming 80% of your API capacity. What do you do? → [`api-scenario-debugging.md`](02-api-design/api-scenario-debugging.md)
- [x] A client keeps retrying the same request. How do you protect your API? → [`api-scenario-debugging.md`](02-api-design/api-scenario-debugging.md)
- [x] An API response takes 10 seconds. How do you debug it? → [`api-scenario-debugging.md`](02-api-design/api-scenario-debugging.md)
- [x] Your API is returning duplicate records. Where do you investigate? → [`api-scenario-debugging.md`](02-api-design/api-scenario-debugging.md)
- [x] An API works locally but times out in production. What do you check? → [`api-scenario-debugging.md`](02-api-design/api-scenario-debugging.md)

---

## 03 — Databases

### Query/performance
- [x] How do database indexes work? → [`query-performance.md`](03-databases/query-performance.md)
- [x] When can an index make performance worse? → [`query-performance.md`](03-databases/query-performance.md)
- [x] Why isn't the database using your index? → [`query-performance.md`](03-databases/query-performance.md)
- [x] How do you identify a slow query? / what is an execution plan? → [`query-performance.md`](03-databases/query-performance.md)
- [x] What causes an N+1 query problem? → [`query-performance.md`](03-databases/query-performance.md)
- [x] How do you optimize a query without changing functionality? → [`query-performance.md`](03-databases/query-performance.md)
- [x] How do you design indexes for a high-write system? → [`query-performance.md`](03-databases/query-performance.md)
- [x] What happens when a table/collection becomes extremely large? → [`query-performance.md`](03-databases/query-performance.md)
- [x] How do you archive old data? → [`query-performance.md`](03-databases/query-performance.md)

### Transactions
- [x] What are ACID properties? → [`transactions-and-isolation.md`](03-databases/transactions-and-isolation.md)
- [x] What isolation levels exist? → [`transactions-and-isolation.md`](03-databases/transactions-and-isolation.md)
- [x] What is a dirty read? / what is a phantom read? → [`transactions-and-isolation.md`](03-databases/transactions-and-isolation.md)
- [x] What causes deadlocks? / how do you prevent deadlocks? → [`transactions-and-isolation.md`](03-databases/transactions-and-isolation.md)
- [x] Optimistic vs pessimistic locking? → cross-linked to [`01-distributed-systems-reliability/consistency-and-transactions.md`](01-distributed-systems-reliability/consistency-and-transactions.md)
- [x] When should you use transactions? → [`transactions-and-isolation.md`](03-databases/transactions-and-isolation.md)
- [x] What happens if a transaction partially fails? → [`transactions-and-isolation.md`](03-databases/transactions-and-isolation.md)

### Scaling
- [x] Vertical vs horizontal scaling? → [`scaling-and-sharding.md`](03-databases/scaling-and-sharding.md)
- [x] Read replicas — when do you use them? → [`scaling-and-sharding.md`](03-databases/scaling-and-sharding.md)
- [x] What happens when the primary database goes down? / how do you design database failover? → [`scaling-and-sharding.md`](03-databases/scaling-and-sharding.md)
- [x] When would you shard a database? / how do you choose a shard key? → [`scaling-and-sharding.md`](03-databases/scaling-and-sharding.md)
- [x] What happens when your shard key creates a hot partition? → [`scaling-and-sharding.md`](03-databases/scaling-and-sharding.md) *(also relevant to 10-system-design)*
- [x] How do you migrate a huge database without downtime? → [`scaling-and-sharding.md`](03-databases/scaling-and-sharding.md)

---

- [x] Why use caching? / where would you place a cache? → [`caching-fundamentals.md`](04-caching/caching-fundamentals.md)
- [x] Client cache vs CDN vs application cache vs database cache? → [`caching-fundamentals.md`](04-caching/caching-fundamentals.md)
- [x] Cache-aside vs write-through vs write-behind? → [`caching-fundamentals.md`](04-caching/caching-fundamentals.md)
- [x] What is cache invalidation? / why is it difficult? → [`cache-failure-modes.md`](04-caching/cache-failure-modes.md)
- [x] What happens when cached data becomes stale? → [`cache-failure-modes.md`](04-caching/cache-failure-modes.md)
- [x] How do you prevent cache stampede? → [`cache-failure-modes.md`](04-caching/cache-failure-modes.md)
- [x] What is cache penetration? / what is cache avalanche? → [`cache-failure-modes.md`](04-caching/cache-failure-modes.md)
- [x] What happens when Redis goes down? / should your application fail if the cache is unavailable? → [`cache-failure-modes.md`](04-caching/cache-failure-modes.md)
- [x] How do you decide TTL? → [`caching-fundamentals.md`](04-caching/caching-fundamentals.md)
- [x] How do you cache user-specific data safely? → [`caching-fundamentals.md`](04-caching/caching-fundamentals.md)
- [x] How do you invalidate cache after a database update? → [`caching-fundamentals.md`](04-caching/caching-fundamentals.md)

---

## 05 — Messaging / Event-Driven Systems

- [x] Queue vs pub/sub? / Kafka vs RabbitMQ? → [`messaging-fundamentals.md`](05-messaging-event-driven/messaging-fundamentals.md)
- [x] When would you use asynchronous processing? → [`messaging-fundamentals.md`](05-messaging-event-driven/messaging-fundamentals.md)
- [x] What happens if a consumer crashes? → cross-linked to [`01-distributed-systems-reliability/message-delivery-guarantees.md`](01-distributed-systems-reliability/message-delivery-guarantees.md)
- [x] At-most-once vs at-least-once vs exactly-once? / why is exactly-once difficult? → [`messaging-fundamentals.md`](05-messaging-event-driven/messaging-fundamentals.md)
- [x] How do you implement idempotent consumers? → cross-linked to [`01-distributed-systems-reliability/message-delivery-guarantees.md`](01-distributed-systems-reliability/message-delivery-guarantees.md)
- [x] How do you retry failed messages? / what is a dead-letter queue? → cross-linked to [`01-distributed-systems-reliability/message-delivery-guarantees.md`](01-distributed-systems-reliability/message-delivery-guarantees.md)
- [x] How do you handle poison messages? → cross-linked to [`01-distributed-systems-reliability/message-delivery-guarantees.md`](01-distributed-systems-reliability/message-delivery-guarantees.md)
- [x] How do you guarantee message ordering? / what happens if messages arrive out of order? → cross-linked to [`01-distributed-systems-reliability/message-delivery-guarantees.md`](01-distributed-systems-reliability/message-delivery-guarantees.md)
- [x] How do you scale consumers? / what is consumer backpressure? → [`messaging-fundamentals.md`](05-messaging-event-driven/messaging-fundamentals.md)
- [x] How do you handle a consumer lagging behind? / what if the producer is faster than consumers? → [`messaging-fundamentals.md`](05-messaging-event-driven/messaging-fundamentals.md)
- [x] How do you replay events? / event sourcing — when would you use it? → [`messaging-fundamentals.md`](05-messaging-event-driven/messaging-fundamentals.md) *(replay mechanics cross-linked to 01)*

---

## 06 — Frontend Architecture

### Rendering
- [x] CSR vs SSR vs SSG vs ISR? / when should you use each? → [`06-frontend-architecture/frontend-rendering.md`](06-frontend-architecture/frontend-rendering.md)
- [x] What happens during hydration? / what causes hydration mismatch? → [`rendering-performance.md`](06-frontend-architecture/rendering-performance.md)
- [x] How do you reduce JavaScript bundle size? / code splitting vs lazy loading? → [`rendering-performance.md`](06-frontend-architecture/rendering-performance.md)
- [x] What should be loaded eagerly? / how do you optimize initial page load? → [`rendering-performance.md`](06-frontend-architecture/rendering-performance.md)
- [x] How does browser caching affect frontend performance? → [`rendering-performance.md`](06-frontend-architecture/rendering-performance.md)

### State
- [x] Local state vs global state? / when should state go into Redux/Zustand/etc.? → [`state-management.md`](06-frontend-architecture/state-management.md)
- [x] Server state vs client state? / why use React Query/SWR? → [`state-management.md`](06-frontend-architecture/state-management.md)
- [x] How do you prevent unnecessary re-renders? / how do you debug excessive rendering? → [`state-management.md`](06-frontend-architecture/state-management.md)
- [x] What causes stale state? → [`state-management.md`](06-frontend-architecture/state-management.md)
- [x] How do you handle optimistic updates? / what happens if an optimistic update fails? → [`state-management.md`](06-frontend-architecture/state-management.md)

### Angular-specific
- [x] Default vs OnPush change detection? / what triggers Angular change detection? → [`angular-cross-links.md`](06-frontend-architecture/angular-cross-links.md) *(full depth in `Angular/10-...`)*
- [x] Why does a parent re-render? / how can a child avoid unnecessary work? → [`angular-cross-links.md`](06-frontend-architecture/angular-cross-links.md)
- [x] What does trackBy actually solve? → [`angular-cross-links.md`](06-frontend-architecture/angular-cross-links.md)
- [x] How does Angular DI determine service instances? / how do you create component-scoped services? → [`angular-cross-links.md`](06-frontend-architecture/angular-cross-links.md) *(full depth in `Angular/08-...`)*
- [x] What happens during Angular bootstrapping? → [`angular-cross-links.md`](06-frontend-architecture/angular-cross-links.md) *(full depth in `Angular/01-...`)*
- [x] How does Angular compile templates? → [`angular-cross-links.md`](06-frontend-architecture/angular-cross-links.md) *(full depth in `Angular/22-...`)*
- [x] What happens during lazy loading? → [`angular-cross-links.md`](06-frontend-architecture/angular-cross-links.md) *(full depth in `Angular/14-...`)*
- [x] What causes memory leaks with RxJS? → [`angular-cross-links.md`](06-frontend-architecture/angular-cross-links.md) *(full depth in `Angular/12-...`)*

### React-specific
- [x] What causes a component to re-render? → [`react-internals.md`](06-frontend-architecture/react-internals.md)
- [x] useMemo vs useCallback? / when do memoization techniques hurt performance? → [`react-internals.md`](06-frontend-architecture/react-internals.md)
- [x] How does reconciliation work? / what does the key actually do? / why shouldn't array indexes always be used as keys? → [`react-internals.md`](06-frontend-architecture/react-internals.md)
- [x] Controlled vs uncontrolled components? → [`react-internals.md`](06-frontend-architecture/react-internals.md)
- [x] How do stale closures happen? → cross-linked to [`state-management.md`](06-frontend-architecture/state-management.md)
- [x] How does React batching work? → [`react-internals.md`](06-frontend-architecture/react-internals.md)
- [x] Context vs external state management? → [`react-internals.md`](06-frontend-architecture/react-internals.md)
- [x] Server Components vs Client Components? → [`react-internals.md`](06-frontend-architecture/react-internals.md)

---

## 07 — Node.js / Runtime

- [x] How does the Node.js event loop work? → [`event-loop-and-concurrency.md`](07-nodejs-runtime/event-loop-and-concurrency.md)
- [x] What happens when you perform CPU-heavy work? / why does Node handle many concurrent requests despite being single-threaded? → [`event-loop-and-concurrency.md`](07-nodejs-runtime/event-loop-and-concurrency.md)
- [x] What happens when one request blocks the event loop? → [`event-loop-and-concurrency.md`](07-nodejs-runtime/event-loop-and-concurrency.md)
- [x] process.nextTick() vs setImmediate()? / microtasks vs macrotasks? → [`event-loop-and-concurrency.md`](07-nodejs-runtime/event-loop-and-concurrency.md)
- [x] Worker threads vs child processes? / cluster vs worker threads? → [`event-loop-and-concurrency.md`](07-nodejs-runtime/event-loop-and-concurrency.md)
- [x] How do you handle CPU-intensive operations? → [`event-loop-and-concurrency.md`](07-nodejs-runtime/event-loop-and-concurrency.md)
- [x] What causes Node.js memory leaks? / how do you investigate increasing heap usage? → [`node-memory-and-streams.md`](07-nodejs-runtime/node-memory-and-streams.md)
- [x] What is backpressure in Node streams? / how do streams improve memory usage? → [`node-memory-and-streams.md`](07-nodejs-runtime/node-memory-and-streams.md)
- [x] How do you handle large file uploads? / why shouldn't you load a 10 GB file into memory? → [`node-memory-and-streams.md`](07-nodejs-runtime/node-memory-and-streams.md)
- [x] How do you gracefully shut down a Node service? → [`node-memory-and-streams.md`](07-nodejs-runtime/node-memory-and-streams.md)

---

## 08 — Security

- [x] How do you prevent SQL/NoSQL injection? → [`app-security-fundamentals.md`](08-security/app-security-fundamentals.md)
- [x] XSS vs CSRF? / how does CSRF happen? / why does SameSite cookie configuration matter? → [`app-security-fundamentals.md`](08-security/app-security-fundamentals.md)
- [x] JWT vs session-based authentication? → [`auth-and-tokens.md`](08-security/auth-and-tokens.md)
- [x] Where should tokens be stored? / access token vs refresh token? → [`auth-and-tokens.md`](08-security/auth-and-tokens.md)
- [x] How do you revoke JWTs? / how do you rotate refresh tokens? → [`auth-and-tokens.md`](08-security/auth-and-tokens.md)
- [x] How do you prevent brute-force attacks? / how do you implement rate limiting? → [`app-security-fundamentals.md`](08-security/app-security-fundamentals.md) *(rate limiting mechanics cross-linked to 02-api-design)*
- [x] How do you securely upload files? / how do you prevent path traversal? → [`app-security-fundamentals.md`](08-security/app-security-fundamentals.md)
- [x] How do you protect internal APIs? → [`app-security-fundamentals.md`](08-security/app-security-fundamentals.md)
- [x] How do you manage secrets? / what happens if an API key leaks? / how do you rotate credentials without downtime? → [`app-security-fundamentals.md`](08-security/app-security-fundamentals.md)

---

## 09 — Docker / Infrastructure

- [x] Container vs VM? → [`docker-fundamentals.md`](09-docker-infrastructure/docker-fundamentals.md)
- [x] What actually happens when a container starts? / image vs container? / layered filesystem? → [`docker-fundamentals.md`](09-docker-infrastructure/docker-fundamentals.md)
- [x] Why are Docker images large? / how do you reduce image size? / multi-stage builds? → [`docker-fundamentals.md`](09-docker-infrastructure/docker-fundamentals.md)
- [x] What happens when a container crashes? → [`container-operations.md`](09-docker-infrastructure/container-operations.md)
- [x] How do you persist database data in Docker? / volume vs bind mount? → [`docker-fundamentals.md`](09-docker-infrastructure/docker-fundamentals.md)
- [x] What happens when the container is deleted? → [`docker-fundamentals.md`](09-docker-infrastructure/docker-fundamentals.md)
- [x] How do containers communicate? / bridge network vs host network? → [`docker-fundamentals.md`](09-docker-infrastructure/docker-fundamentals.md)
- [x] How do you expose a service securely? → [`container-operations.md`](09-docker-infrastructure/container-operations.md)
- [x] What happens if your container runs out of memory? → [`container-operations.md`](09-docker-infrastructure/container-operations.md)
- [x] How do you handle container health checks? → [`container-operations.md`](09-docker-infrastructure/container-operations.md)
- [x] How do you perform zero-downtime deployments? → [`container-operations.md`](09-docker-infrastructure/container-operations.md) *(also relevant to 10-system-design)*

---

## 10 — System Design

### Scaling
- [x] Your API gets 10× traffic. What breaks first? → cross-linked to [`02-api-design/api-scenario-debugging.md`](02-api-design/api-scenario-debugging.md)
- [x] Your database becomes the bottleneck. What do you do? → [`scaling-scenarios.md`](10-system-design/scaling-scenarios.md)
- [x] One endpoint gets 90% of traffic. What do you change? → [`scaling-scenarios.md`](10-system-design/scaling-scenarios.md)
- [x] One tenant becomes 100× larger than everyone else. What happens? → [`scaling-scenarios.md`](10-system-design/scaling-scenarios.md) *(deeper isolation angle in 14-multi-tenancy)*
- [x] How do you prevent a hot partition? → cross-linked to [`03-databases/scaling-and-sharding.md`](03-databases/scaling-and-sharding.md)
- [x] How do you scale WebSocket connections? → [`scaling-scenarios.md`](10-system-design/scaling-scenarios.md)
- [x] How do you scale background workers? → [`scaling-scenarios.md`](10-system-design/scaling-scenarios.md)

### Reliability
- [x] Your database goes down. What happens? → [`reliability-and-deployment.md`](10-system-design/reliability-and-deployment.md)
- [x] Redis goes down. What happens? → cross-linked to [`04-caching/cache-failure-modes.md`](04-caching/cache-failure-modes.md)
- [x] Kafka goes down. What happens? → [`reliability-and-deployment.md`](10-system-design/reliability-and-deployment.md)
- [x] One microservice becomes extremely slow. What happens? → cross-linked to [`01-distributed-systems-reliability/cascading-failures-and-degradation.md`](01-distributed-systems-reliability/cascading-failures-and-degradation.md)
- [x] An external API is unavailable for 30 minutes. What happens? → cross-linked to [`01-distributed-systems-reliability/cascading-failures-and-degradation.md`](01-distributed-systems-reliability/cascading-failures-and-degradation.md)
- [x] Your deployment introduces a bug. How do you recover? → [`reliability-and-deployment.md`](10-system-design/reliability-and-deployment.md)
- [x] Two services disagree about the same data. What happens? → cross-linked to [`01-distributed-systems-reliability/consistency-and-transactions.md`](01-distributed-systems-reliability/consistency-and-transactions.md)

### Deployment
- [x] How do you deploy without downtime? / blue-green vs rolling deployment? / canary deployment? → cross-linked to [`09-docker-infrastructure/container-operations.md`](09-docker-infrastructure/container-operations.md)
- [x] How do you rollback a bad deployment? → [`reliability-and-deployment.md`](10-system-design/reliability-and-deployment.md)
- [x] What happens if database schema changes aren't backward compatible? → [`reliability-and-deployment.md`](10-system-design/reliability-and-deployment.md)
- [x] How do you perform zero-downtime migrations? → cross-linked to [`03-databases/scaling-and-sharding.md`](03-databases/scaling-and-sharding.md)

---

## 11 — Observability

- [x] Logs vs metrics vs traces? → [`observability-fundamentals.md`](11-observability/observability-fundamentals.md)
- [x] What should you log? / what should you not log? → [`observability-fundamentals.md`](11-observability/observability-fundamentals.md)
- [x] How do you trace a request across microservices? / what is distributed tracing? / correlation/request IDs? → [`observability-fundamentals.md`](11-observability/observability-fundamentals.md)
- [x] How do you detect memory leaks? / how do you detect a slow database? → [`observability-fundamentals.md`](11-observability/observability-fundamentals.md)
- [x] How do you distinguish application latency from network latency? → [`observability-fundamentals.md`](11-observability/observability-fundamentals.md)
- [x] What metrics indicate system saturation? → [`observability-fundamentals.md`](11-observability/observability-fundamentals.md)
- [x] What are SLIs, SLOs and SLAs? → [`observability-fundamentals.md`](11-observability/observability-fundamentals.md)
- [x] How do you design alerts without creating alert fatigue? → [`observability-fundamentals.md`](11-observability/observability-fundamentals.md)

---

## 12 — Concurrency

- [x] What is a race condition? / how does a race condition occur in a web API? → [`concurrency-fundamentals.md`](12-concurrency/concurrency-fundamentals.md)
- [x] How do you prevent double booking? / how do you prevent two users from buying the last item? → [`concurrency-fundamentals.md`](12-concurrency/concurrency-fundamentals.md) *(flagship scenario)*
- [x] Optimistic vs pessimistic locking? → cross-linked to [`01-distributed-systems-reliability/consistency-and-transactions.md`](01-distributed-systems-reliability/consistency-and-transactions.md)
- [x] What is a deadlock? / how do you prevent deadlocks? → cross-linked to [`03-databases/transactions-and-isolation.md`](03-databases/transactions-and-isolation.md)
- [x] How do you safely increment a counter concurrently? → [`concurrency-fundamentals.md`](12-concurrency/concurrency-fundamentals.md)
- [x] How do distributed locks work? / when should you not use distributed locks? → [`concurrency-fundamentals.md`](12-concurrency/concurrency-fundamentals.md)
- [x] How do you make a job processor concurrency-safe? → [`concurrency-fundamentals.md`](12-concurrency/concurrency-fundamentals.md)

---

## 13 — File / Storage Systems

- [x] Object storage vs filesystem? / why use S3 instead of storing files in the database? → [`object-storage-fundamentals.md`](13-file-storage-systems/object-storage-fundamentals.md)
- [x] How do presigned URLs work? → [`object-storage-fundamentals.md`](13-file-storage-systems/object-storage-fundamentals.md)
- [x] How do you upload a 10 GB file? / multipart upload? → [`object-storage-fundamentals.md`](13-file-storage-systems/object-storage-fundamentals.md)
- [x] How do you resume failed uploads? → [`object-storage-fundamentals.md`](13-file-storage-systems/object-storage-fundamentals.md)
- [x] How do you prevent unauthorized downloads? → [`object-storage-fundamentals.md`](13-file-storage-systems/object-storage-fundamentals.md)
- [x] How do you version objects? / how do you handle deleted objects? → [`object-storage-fundamentals.md`](13-file-storage-systems/object-storage-fundamentals.md)
- [x] How do you design image/video processing pipelines? / what happens if processing fails halfway through? → [`object-storage-fundamentals.md`](13-file-storage-systems/object-storage-fundamentals.md)

---

## 14 — Multi-Tenancy

- [x] What is multi-tenancy? / shared database vs database-per-tenant? / shared collection vs tenant-specific collections? → [`multi-tenancy-fundamentals.md`](14-multi-tenancy/multi-tenancy-fundamentals.md)
- [x] How do you guarantee tenant isolation? / how do you prevent cross-tenant data leaks? → [`multi-tenancy-fundamentals.md`](14-multi-tenancy/multi-tenancy-fundamentals.md)
- [x] How do you implement tenant-aware authorization? → [`multi-tenancy-fundamentals.md`](14-multi-tenancy/multi-tenancy-fundamentals.md)
- [x] How do you handle tenant-specific configuration? → [`multi-tenancy-fundamentals.md`](14-multi-tenancy/multi-tenancy-fundamentals.md)
- [x] How do you handle a tenant with massive traffic? / tenant-level rate limiting? / tenant-specific caching? → [`multi-tenancy-fundamentals.md`](14-multi-tenancy/multi-tenancy-fundamentals.md)
- [x] How do you migrate one tenant independently? → [`multi-tenancy-fundamentals.md`](14-multi-tenancy/multi-tenancy-fundamentals.md)
- [x] **"Your API accidentally returned another tenant's data. How would you investigate and prevent it from happening again?"** → [`multi-tenancy-fundamentals.md`](14-multi-tenancy/multi-tenancy-fundamentals.md) *(flagship scenario)*

---

## 15 — Offline-First / Distributed Client Systems

- [x] What does offline-first mean? / how do you synchronize local and server state? → [`offline-first-fundamentals.md`](15-offline-first/offline-first-fundamentals.md)
- [x] What happens when the same record is modified offline by two users? / how do you resolve conflicts? / last-write-wins vs conflict-free approaches? → [`offline-first-fundamentals.md`](15-offline-first/offline-first-fundamentals.md)
- [x] How do you queue offline mutations? / how do you retry synchronization? → [`offline-first-fundamentals.md`](15-offline-first/offline-first-fundamentals.md)
- [x] How do you guarantee offline mutations aren't duplicated? → [`offline-first-fundamentals.md`](15-offline-first/offline-first-fundamentals.md)
- [x] What happens if the app crashes during synchronization? → [`offline-first-fundamentals.md`](15-offline-first/offline-first-fundamentals.md)
- [x] How do you handle schema migrations for local databases? → [`offline-first-fundamentals.md`](15-offline-first/offline-first-fundamentals.md)
- [x] How do you detect connectivity changes? → [`offline-first-fundamentals.md`](15-offline-first/offline-first-fundamentals.md)
- [x] How do you prevent stale local data from overwriting newer server data? → [`offline-first-fundamentals.md`](15-offline-first/offline-first-fundamentals.md)

---

---

## 16 — Resume Deep-Dive

> Not from the original 250-item master list — generated 2026-08-09 from a direct read of Vishal's resume (Flairlabs, 3+ years). Unlike categories 01–15, these entries are **frameworks with fill-in prompts**, not asserted answers — the interviewer's actual question is "why did *you* choose X," which only Vishal can answer; each entry gives the technical reasoning a strong answer needs and marks exactly what's project-specific to fill in.

- [x] RAG Platform (Postgres+Qdrant architecture, SHA-256 dedup edge case, partial ingestion failure, chunking strategy, grounding/hallucination, dual-write sync) → [`rag-platform.md`](16-resume-deep-dive/rag-platform.md)
- [x] Multi-Tenant Workforce SaaS (Flutter Web choice, OR-Tools vs greedy, infeasible allocation, solve-time at scale, reallocation concurrency, deboarding, Excel bulk import, Azure SAS tokens) → [`multi-tenant-workforce-saas.md`](16-resume-deep-dive/multi-tenant-workforce-saas.md)
- [x] Offline-First Healthcare / AMDHA (trigger-based sync, Realm conflict resolution, OCR confidence, multi-tenant+offline scoping, PHI-on-device risk, offline reference-data validation) → [`offline-first-healthcare.md`](16-resume-deep-dive/offline-first-healthcare.md)
- [x] AI Assistant Platform / JULES (Bedrock vs self-hosted RAG, Zustand/SWR boundary, concrete WCAG/keyboard-nav work) → [`ai-assistant-jules.md`](16-resume-deep-dive/ai-assistant-jules.md)
- [x] Enterprise Angular Apps / NCP & CAP (dynamic/conditional forms, offline photo capture + queued upload, BehaviorSubject→signals migration, Ionic/Capacitor native quirks) → [`enterprise-angular-apps.md`](16-resume-deep-dive/enterprise-angular-apps.md)
- [x] Cross-cutting (multi-tenant + offline-first combined, Mongo vs Postgres+Qdrant per-product reasoning, honest AI-coding-tool usage, "walk me through a production issue you fixed") → [`cross-cutting.md`](16-resume-deep-dive/cross-cutting.md)

---

*Update the checkbox and the progress tracker status whenever an item graduates into a saved scenario. Don't reorganize this file's item order — append cross-links, don't restructure.*
