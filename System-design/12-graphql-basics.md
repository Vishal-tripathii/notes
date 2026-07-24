# System Design Study Notes — Part 12

## GraphQL (Basics)

> **Format:** Written as **Q&A** — my prompts are the questions, the explanations are the answers. Complete capture of the chat, reorganized and expanded. Diagrams, examples, and interview Q&A included.
>
> **Continues from:** Part 11 (API Design / REST). This is the dedicated GraphQL companion to the REST vs GraphQL comparison there.

---

## Table of Contents

1. [Core idea + analogy](#core)
2. [Why GraphQL (the problems it solves)](#why)
3. [How it works (the basics)](#how)
4. [REST vs GraphQL side by side](#vs)
5. [Advantages](#advantages)
6. [Disadvantages](#disadvantages)
7. [When to use GraphQL vs REST](#when)
8. [Interview questions & answers](#interview)
9. [Cheat Sheet — everything on one page](#cheatsheet)

---

<a name="core"></a>
# 1. Core idea + analogy

**GraphQL is a query language for APIs where the client asks for exactly the data it wants — no more, no less — in a single request.**

The name: **Graph** (data is a graph of connected things — users → posts → comments) + **QL** (Query Language). Created by Facebook in 2012, open-sourced 2015, born from the pain of building mobile apps on REST.

## Analogy: à la carte vs fixed menu 🍽️
- **REST** = a **fixed-menu (prix fixe)** restaurant. Order "Meal #3" → get *whatever comes with it* (even parts you don't want). Want a side too? **Separate order** (another kitchen trip).
- **GraphQL** = **à la carte**. Write *exactly* what you want on **one order slip** → kitchen brings precisely that, in one trip.

> **GraphQL lets the client design the response shape.** REST → *server* decides what each endpoint returns; GraphQL → *client* decides.

---

<a name="why"></a>
# 2. Why GraphQL (the problems it solves)

## Problem 1: Over-fetching
REST endpoints return a **fixed shape**, often more than needed.
```
GET /users/1   →   the WHOLE user object:
{ "id":1, "name":"Alice", "email":"...", "address":"...", "phone":"...",
  "createdAt":"...", "preferences":{...}, ... }

But the screen only needs NAME. Everything else was downloaded for nothing. 🗑️
```
On mobile with limited bandwidth, the waste adds up.

## Problem 2: Under-fetching (N+1 round trips)
One endpoint often **isn't enough**, so you make many calls.
```
Goal: show a user, their posts, and each post's comments.

REST:
  GET /users/1               → the user
  GET /users/1/posts         → their posts
  GET /posts/45/comments     → comments for post 45
  GET /posts/46/comments     → comments for post 46
  ... one call per post 😫    (the N+1 problem)
```
Multiple round trips = slow, especially on mobile.

## How GraphQL fixes both — one request, exact shape
```
POST /graphql

query {
  user(id: 1) {
    name                    ← only the fields you want
    posts {
      title
      comments {            ← nested data, same request
        text
      }
    }
  }
}
```
Response mirrors the query **exactly**:
```json
{
  "data": {
    "user": {
      "name": "Alice",
      "posts": [
        { "title": "Hello", "comments": [ { "text": "Nice!" } ] }
      ]
    }
  }
}
```
> **One request, precisely the data needed, nested relationships included.** No over-fetching, no under-fetching, no multiple round trips.

---

<a name="how"></a>
# 3. How it works (the basics)

## 1. A single endpoint
Unlike REST's many endpoints (`/users`, `/products`, `/users/1/orders`…), GraphQL has **one endpoint**, usually `/graphql`. All queries POST to it.

## 2. A strongly-typed schema
The server defines a **schema** — the contract of what exists and is queryable. Strongly typed:
```graphql
type User {
  id: ID!
  name: String!
  email: String!
  posts: [Post!]!        # a user has a list of posts
}

type Post {
  id: ID!
  title: String!
  comments: [Comment!]!
}
```
Self-documenting — tools can explore it (**introspection**), a big selling point.

## 3. Three operation types
- **Query** — read data (like GET).
- **Mutation** — change data: create/update/delete (like POST/PUT/DELETE).
- **Subscription** — real-time updates (server pushes changes, e.g. live chat).
```graphql
mutation {
  createUser(name: "Bob", email: "bob@mail.com") {
    id
    name
  }
}
```
> Under the hood, **resolvers** (functions) fetch the data for each field — worth knowing the word, but the schema + query model is the core.

---

<a name="vs"></a>
# 4. REST vs GraphQL side by side

```
REST                                  GraphQL
─────────────────────                 ─────────────────────
Many endpoints                        ONE endpoint (/graphql)
Server decides response shape         CLIENT decides response shape
Fixed data per endpoint               Exact fields requested
Multiple round trips for nested       One request for nested data
Over/under-fetching common            Solved
Easy HTTP caching (per URL)           Harder to cache
```

---

<a name="advantages"></a>
# 5. Advantages ✅

1. **No over-fetching** — get exactly the fields you ask for. Efficient, especially on mobile.
2. **No under-fetching** — nested/related data in a **single request**; no N+1 round trips.
3. **Client-driven** — front-end teams build new screens with new data combinations **without waiting for backend changes** (as long as fields exist in the schema). Speeds development.
4. **Strongly-typed, self-documenting schema** — schema is the contract; auto docs + autocomplete via introspection.
5. **Evolvable without versioning** — instead of `/v1`, `/v2` (Part 11), add new fields and **deprecate old ones** gradually. One evolving schema, no version explosion.
6. **Great for complex, data-rich UIs** — dashboards, mobile apps, anything pulling many related resources.

---

<a name="disadvantages"></a>
# 6. Disadvantages ❌

1. **Caching is harder** — the biggest one. REST caches beautifully (each URL is cacheable — browsers, CDNs, `Cache-Control`, Parts 5 & 6). GraphQL's **single POST endpoint** breaks standard HTTP/URL caching; you need client-side caching (Apollo, Relay).
2. **Complexity & learning curve** — schema, resolvers, and the GraphQL layer add setup. **Overkill for a simple API.**
3. **Server-side N+1 problem** — ironically GraphQL can *cause* N+1 on the backend: a query for 100 users' posts might fire 100 DB queries in resolvers. Fixed with **batching (DataLoader)** — extra work.
4. **Query-complexity / security risk** — a client can send a **deeply nested, expensive query** (a DoS vector). Needs **query depth limiting, complexity analysis, rate limiting** (Redis, Part 5.5).
5. **Non-standard errors & status codes** — GraphQL typically returns **200 OK even on errors** (errors in the body), breaking the clean HTTP status-code model from Part 11.
6. **Rate limiting is trickier** — can't rate-limit per endpoint (there's one); you limit by query cost.

---

<a name="when"></a>
# 7. When to use GraphQL vs REST

| Use **GraphQL** when… | Use **REST** when… |
|---|---|
| Clients have **varied, complex data needs** | The API is **simple / resource-based** |
| **Mobile apps** (minimize bandwidth + round trips) | You want **easy HTTP caching / CDNs** |
| Many **nested/related** resources (dashboards) | You want **simplicity + standard tooling** |
| Rapid front-end iteration | Public APIs where caching & simplicity matter |

> **Interview-safe take:** *"GraphQL for flexible, data-rich clients where over- and under-fetching hurt; REST for simple, cacheable, resource-based APIs. Not mutually exclusive — many systems use both."*

---

<a name="interview"></a>
# 8. Interview questions & answers

### Q: "What is GraphQL and why was it created?"
> *"GraphQL is a query language for APIs where the client asks for exactly the data it needs in a single request. Facebook created it to solve two REST pain points on mobile: over-fetching, where an endpoint returns more data than you need, and under-fetching, where you have to make many round trips to gather related data. With GraphQL, the client specifies the exact shape it wants — including nested relationships — and gets it back in one request from a single endpoint."*

### Q: "What are over-fetching and under-fetching?"
> *"Over-fetching is when a REST endpoint returns more fields than the client needs — like getting a whole user object when you only wanted the name — wasting bandwidth. Under-fetching is when one endpoint isn't enough, so you make multiple calls to assemble the data, like fetching a user, then their posts, then each post's comments. GraphQL solves both by letting the client request exactly the fields it wants, nested, in one query."*

### Q: "What's the biggest downside of GraphQL?"
> *"Caching. REST caches naturally because each endpoint is a unique URL that browsers and CDNs can cache. GraphQL uses a single POST endpoint, so standard HTTP caching doesn't apply, and you need specialized client-side caching like Apollo. There's also the server-side N+1 problem, where resolvers can fire many database queries, solved with batching, and query-complexity risks where a deeply nested query can overload the server, handled with depth limiting and rate limiting."*

### Q: "How does GraphQL handle versioning?"
> *"Differently from REST. Instead of /v1 and /v2, GraphQL evolves a single schema — you add new fields and deprecate old ones gradually, marking them deprecated so clients migrate over time. Since clients only request the fields they use, adding fields doesn't break anyone, so you often avoid explicit versioning altogether."*

### Q: "Query vs Mutation vs Subscription?"
> *"A Query reads data, like a GET. A Mutation changes data — create, update, or delete — like POST, PUT, or DELETE. A Subscription is for real-time updates, where the server pushes changes to the client over a persistent connection, useful for live chat or notifications."*

---

<a name="cheatsheet"></a>
# 9. Cheat Sheet — everything on one page

### Core
- **GraphQL** = query language; client requests **exact fields + nested data** in **one request** to **one endpoint** (`/graphql`).
- **Client** designs the response shape (REST → server designs it).
- By Facebook (2012), open-sourced 2015.

### Why (problems solved)
- **Over-fetching** — REST returns more than needed → GraphQL returns exact fields.
- **Under-fetching (N+1)** — REST needs many round trips → GraphQL nests in one request.

### How it works
- **Single endpoint** (POST `/graphql`).
- **Strongly-typed schema** (self-documenting via introspection).
- **3 operations:** Query (read), Mutation (write), Subscription (real-time).
- **Resolvers** fetch data per field.

### REST vs GraphQL
| | REST | GraphQL |
|---|---|---|
| Endpoints | Many | One |
| Response shape | Server-decided | Client-decided |
| Nested data | Multiple calls | One request |
| Over/under-fetch | Common | Solved |
| Caching | Easy (URL/HTTP) | Hard (single POST) |

### Advantages ✅
No over-fetch · no under-fetch · client-driven (fast FE iteration) · typed self-documenting schema · evolve without versioning · great for mobile/data-rich UIs.

### Disadvantages ❌
Caching hard (single POST) · complexity/overkill for simple APIs · server-side N+1 (needs DataLoader) · query-complexity DoS risk (depth limiting) · returns 200 on errors · trickier rate limiting.

### When
- **GraphQL:** varied/complex data, mobile, nested resources, rapid FE iteration.
- **REST:** simple, cacheable, resource-based, standard tooling.
- Many systems use **both**.

### Connects to
- Part 11: REST, over/under-fetching, versioning, rate limiting. · Parts 5 & 6: caching (why GraphQL caching is hard). · Part 5.5: rate limiting for query complexity.

### Suggested next topics
- **Message queues** (async, decoupling, spikes).
- **Load balancing in depth**.
- **Full system design walkthrough** (URL shortener / Instagram — ties all parts together).

*— End of Part 12 —*
