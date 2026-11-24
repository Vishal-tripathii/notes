# React Study Notes — Part 14

## Server Components, SSR & Next.js App Router ('use client', 'use server', Streaming, Hydration, Rendering Strategies)

> **Why this part exists:** in 2025–26 most new React apps are built with a framework — usually **Next.js** — and React's own docs recommend starting with one. The biggest idea in modern React is **Server Components**. Interviewers ask: "What's the difference between a Server and a Client Component?", "When do you need `'use client'`?", "What causes a hydration error?"
>
> ⚠️ **Versions:** React Server Components are stable in **React 19**. Next.js changes fast — the App Router became the default in Next 13 (2023); Next 15 (Oct 2024) stopped caching `fetch` by default; Next 16 (Oct 2025) made Turbopack the default bundler and introduced "Cache Components" (`'use cache'`). Check the docs for your version; the *concepts* below don't change.

---

## Table of Contents

1. [CSR, SSR, SSG, ISR — the rendering menu](#strategies)
2. [⭐ Hydration — and hydration errors](#hydration)
3. [Streaming SSR and Suspense](#streaming)
4. [⭐ Server Components — what they are](#rsc)
5. [⭐ `'use client'` — the boundary](#use-client)
6. [Server Functions / Server Actions — `'use server'`](#use-server)
7. [Next.js App Router in one page](#nextjs)
8. [Data fetching & caching in the App Router](#caching)
9. [Interview Q&A](#interview)
10. [Cheat Sheet](#cheatsheet)

---

<a name="strategies"></a>
# 1. CSR, SSR, SSG, ISR — the rendering menu

| | Where/when HTML is made | Good for | Cost |
|---|---|---|---|
| **CSR** (client-side rendering — plain Vite SPA) | in the browser, after JS downloads | dashboards behind login | blank page until JS runs; poor SEO |
| **SSR** (server-side rendering) | on the server, **every request** | personalised public pages, SEO | a server per request; slower TTFB if data is slow |
| **SSG** (static generation) | once, **at build time** | docs, marketing, blogs | stale until the next build |
| **ISR** (incremental static regeneration — Next.js) | at build time, then **re-generated in the background** every N seconds or on demand | product pages, news | a bit of staleness |
| **Streaming SSR** | server sends HTML **in pieces** as each part is ready | pages with one slow section | needs Suspense boundaries |

In Next.js you can mix these **per route** (and even per component). See [Angular Part 21](../Angular/21-ssr-and-hydration.md) — same ideas, different framework.

---

<a name="hydration"></a>
# 2. ⭐ Hydration — and hydration errors

Server-rendered HTML is **visible but not interactive** — no click handlers yet. **Hydration** is React, in the browser, walking that existing HTML, attaching event listeners and state, instead of re-creating the DOM:

```js
import { hydrateRoot } from 'react-dom/client';
hydrateRoot(document.getElementById('root'), <App />);   // vs createRoot for client-only apps
```

> **Analogy 🎭 — a stage set built before the actors arrive.** The set (HTML) is already there; hydration is the actors (JavaScript) walking on and taking their places — not rebuilding the set.

**Hydration error / mismatch:** the HTML the browser renders on hydration doesn't match the server's HTML. React 19 shows one error with a **diff**. Common causes:

| Cause | Example | Fix |
|---|---|---|
| time / randomness | `new Date().toLocaleTimeString()`, `Math.random()` | render on the client only (in `useEffect`), or pass the value from the server |
| browser-only checks in render | `typeof window !== 'undefined' ? … : …` | move into `useEffect`, or a client-only component |
| locale / time zone differences | date formatted on a UTC server vs the user's zone | format with a fixed time zone, or on the client |
| invalid HTML | `<div>` inside `<p>`, `<a>` inside `<a>` | fix the markup |
| browser extensions changing the DOM | password managers, translators | usually harmless; `suppressHydrationWarning` on that element only |

`useId` exists precisely so generated ids match on server and client ([Part 7](07-hooks.md)).

**Selective hydration (React 18+):** with Suspense boundaries, parts of the page hydrate independently, and React hydrates **first** the part the user clicks on.

---

<a name="streaming"></a>
# 3. Streaming SSR and Suspense

Without streaming, the server waits for **all** data before sending **any** HTML — one slow query delays the whole page.

With streaming (`renderToPipeableStream` in Node, `renderToReadableStream` on the edge; frameworks do this for you), the server sends the page shell immediately and **streams each Suspense boundary's content** when its data is ready:

```jsx
<Layout>
  <ProductDetails />                       {/* fast — in the first chunk */}
  <Suspense fallback={<ReviewsSkeleton />}>
    <Reviews />                            {/* slow — streamed in later, replacing the skeleton */}
  </Suspense>
</Layout>
```

In Next.js, a `loading.tsx` file is an automatic Suspense boundary around a page.

---

<a name="rsc"></a>
# 4. ⭐ Server Components — what they are

> **Definition:** a **React Server Component (RSC)** runs **only on the server** (or at build time). It can be `async`, read databases and files directly, and its code is **never sent to the browser** — only its rendered result is.

```jsx
// app/products/[id]/page.jsx — a Server Component by default in the Next.js App Router
import { db } from '@/lib/db';

export default async function ProductPage({ params }) {
  const { id } = await params;
  const product = await db.product.findUnique({ where: { id } });   // ✅ direct DB access — no API needed
  return (
    <article>
      <h1>{product.name}</h1>
      <p>{product.description}</p>
      <AddToCartButton productId={product.id} />   {/* a Client Component for interactivity */}
    </article>
  );
}
```

**What they give you:**
- **Less JavaScript** shipped: a markdown renderer or date library used only in a Server Component adds **0 KB** to the browser bundle.
- **Data fetching next to the component**, on the server, close to the database — no `useEffect` + loading spinner + API endpoint.
- **Secrets stay on the server** (DB credentials, API keys).

**What they can't do:** no `useState`, `useEffect`, `useContext`, no event handlers (`onClick`), no browser APIs. Anything interactive must be a **Client Component**.

> 🧠 **Remember:** **Server Components = fetch & show. Client Components = click & change.**

**Server Components are not the same as SSR.** SSR turns components into **HTML** for the first page load (and Client Components are SSR'd too). Server Components are components that **only ever run on the server** and send a serialised result (the "RSC payload") — also on later navigations, without full HTML.

---

<a name="use-client"></a>
# 5. ⭐ `'use client'` — the boundary

```jsx
'use client';                                  // ← first line of the file

import { useState } from 'react';

export function AddToCartButton({ productId }) {
  const [adding, setAdding] = useState(false);
  return <button onClick={() => addToCart(productId)} disabled={adding}>Add to cart</button>;
}
```

- `'use client'` marks a **boundary**: this file **and everything it imports** become Client Components (they're bundled for the browser — and still SSR'd to HTML on first load).
- You only need it at the **entry points** of interactive pieces — not on every file.
- **Push `'use client'` down the tree:** keep the page a Server Component and make only the small interactive leaves client components. Putting `'use client'` at the top of a layout makes the whole subtree client-side and loses the benefits.

**The composition rules:**

| | Allowed? |
|---|---|
| Server Component renders a Client Component | ✅ yes |
| Server → Client props | ✅ only **serialisable** values: strings, numbers, plain objects, arrays, Dates, promises, Server Functions — **not** regular functions or class instances |
| Client Component **imports** a Server Component | ❌ no — it would become a client component |
| Server Component passed **as `children`** to a Client Component | ✅ yes — the standard trick |

```jsx
// Server Component
<ClientTabs>                 {/* client: handles which tab is open */}
  <ServerRenderedList />     {/* still a Server Component, passed as children */}
</ClientTabs>
```

Use the `server-only` package in files that must never reach the browser (it errors at build time if imported from client code).

---

<a name="use-server"></a>
# 6. Server Functions / Server Actions — `'use server'`

A **Server Function** is an async function that runs on the server but can be **called from the client** — React handles the network request for you.

```jsx
// app/actions.js
'use server';

import { revalidatePath } from 'next/cache';

export async function addComment(formData) {
  const session = await auth();                          // ⚠️ always check who's calling
  if (!session) throw new Error('Not signed in');
  const text = String(formData.get('text') ?? '').trim();
  if (!text) return { error: 'Comment is empty' };       // ⚠️ always validate
  await db.comment.create({ data: { text, userId: session.userId } });
  revalidatePath('/posts');                               // refresh cached pages that show comments
}
```

```jsx
// any component — works even before JS loads
<form action={addComment}>
  <textarea name="text" />
  <button>Post</button>
</form>
```

- Used as a form `action` (or via `useActionState`, [Part 13](13-react-19-and-19-2.md)), it's often called a **Server Action**.
- ⚠️ **Every Server Function is a public HTTP endpoint.** Anyone can call it with any arguments. **Authenticate, authorise and validate inside it** — the fact that a button is hidden in the UI protects nothing.
- Good for mutations (create, update, delete). For reading data, Server Components are the primary tool.

---

<a name="nextjs"></a>
# 7. Next.js App Router in one page

Routes are **folders** inside `app/`; special file names have special jobs:

```
app/
  layout.tsx          root layout — wraps every page (persistent: doesn't re-mount on navigation)
  page.tsx            the "/" page
  loading.tsx         Suspense fallback for this segment
  error.tsx           error boundary for this segment ('use client' required)
  not-found.tsx       404 for this segment
  products/
    page.tsx          "/products"
    [id]/
      page.tsx        "/products/:id"  → receives params
  (marketing)/        route group — organises folders without adding to the URL
  api/hello/route.ts  an API endpoint (GET/POST handlers)
```

| Need | Next.js tool |
|---|---|
| navigation | `<Link href="/products/1">` (prefetches), `useRouter()` from `next/navigation` (client) |
| redirect / 404 | `redirect('/login')`, `notFound()` |
| read the URL in a client component | `usePathname()`, `useSearchParams()`, `useParams()` |
| SEO metadata | `export const metadata = {...}` or `generateMetadata()` |
| images & fonts | `next/image` (sizes, lazy loading, modern formats), `next/font` |
| auth checks before a page renders | middleware / proxy, or checks in the layout/page |
| static pages for dynamic routes | `generateStaticParams()` |

**Pages Router (older Next.js):** `pages/` folder, `getServerSideProps` / `getStaticProps`, no Server Components. Still in many codebases — the two routers can coexist during migration.

---

<a name="caching"></a>
# 8. Data fetching & caching in the App Router

This is where Next.js versions differ most — so describe it as **"choose per route whether data is static, cached or dynamic,"** then name your version's mechanism:

- **Fetch in Server Components** with `await` — no `useEffect`.
- Fetch **in parallel**, not one after another: `const [user, orders] = await Promise.all([getUser(), getOrders()])`.
- **Static vs dynamic:** a route that reads cookies/headers/search params, or uncached data, renders **per request**; otherwise it can be rendered once and cached.
- **Revalidation:** time-based (`export const revalidate = 60`, or `fetch(url, { next: { revalidate: 60 } })`) or on-demand after a mutation (`revalidatePath('/posts')`, `revalidateTag('posts')`).
- **Version notes:** in Next 14, `fetch` was cached by default (a common source of "why is my data stale?"); **Next 15 made it uncached by default**; **Next 16** adds the opt-in `'use cache'` directive ("Cache Components") to mark exactly what is cached.
- **Client-side data** (live, user-specific, frequently changing): TanStack Query in Client Components is still normal ([Part 17](17-data-fetching-tanstack-query-and-redux-toolkit.md)).

**Other frameworks:** React Router v7 "framework mode" (formerly Remix) with loaders/actions ([Part 15](15-routing-react-router.md)), TanStack Start, Astro (islands) — same server/client split, different APIs.

---

<a name="interview"></a>
# 9. Interview Q&A

### Q: "Server Components vs Client Components?"
> *"Server Components run only on the server — they can be async and read the database directly, and their code isn't sent to the browser, so they cut bundle size. They can't use state, effects or event handlers. Client Components, marked with `'use client'`, are the interactive parts — they run in the browser (and are server-rendered for the first load). I keep pages as Server Components and push `'use client'` down to the small interactive leaves."*

### Q: "Is a Server Component the same as SSR?"
> *"No. SSR renders components to HTML for the first load — Client Components get SSR'd too, then hydrate. Server Components never run in the browser at all; they send a serialised result, including on client-side navigations. They're complementary: an App Router page uses both."*

### Q: "Can a Client Component render a Server Component?"
> *"It can't import one — that would turn it into client code. But a Server Component can pass another Server Component to it as `children` or another prop, and that works. Props from server to client must be serialisable — no regular functions."*

### Q: "What causes a hydration mismatch, and how do you fix it?"
> *"The client's first render differs from the server HTML — usually dates or random values, `typeof window` checks in render, locale or time-zone differences, or invalid HTML like a div inside a p. Fix it by rendering browser-specific values after mount in an effect, passing the value from the server, fixing the markup, or using `useId` for ids."*

### Q: "What are Server Actions, and what's the security catch?"
> *"Async functions marked `'use server'` that the client can call — commonly as a form `action` — and React handles the request. The catch is that each one is a public endpoint: anyone can call it with any input, so it must authenticate, authorise and validate on every call, regardless of what the UI shows."*

### Q: "SSR vs SSG vs ISR?"
> *"SSR renders on every request — fresh and personalised, but costs server time each request. SSG renders once at build time — fastest, but stale until rebuilt. ISR is SSG that regenerates in the background on a timer or on demand. Next.js lets you pick per route."*

---

<a name="cheatsheet"></a>
# 10. Cheat Sheet

```
CSR = browser · SSR = per request · SSG = build time · ISR = SSG + background refresh · streaming = in pieces
HYDRATION = attach React to server HTML (hydrateRoot) — "actors walk onto a pre-built set"
MISMATCH causes: Date/random · typeof window in render · locale/TZ · invalid HTML · extensions
  → render in effect · pass from server · fix markup · useId
STREAMING: shell first, each <Suspense> streams when ready · Next loading.tsx = Suspense

SERVER COMPONENTS: server only · async · direct DB · 0 KB JS · no state/effects/onClick
  "Server = fetch & show · Client = click & change" · RSC ≠ SSR
'use client' = boundary (file + its imports) · push it DOWN to the leaves
  server → client props must be SERIALISABLE · client can't import server · server can be passed as children
'use server' = Server Function callable from client (form action = Server Action)
  PUBLIC ENDPOINT → auth + validate inside · revalidatePath/Tag after mutations

NEXT APP ROUTER: app/ folders · layout / page / loading / error ('use client') / not-found · [id] · route.ts
  <Link> prefetch · next/navigation hooks · metadata · next/image · next/font · generateStaticParams
  caching: per-route static/dynamic · revalidate · Next 15 fetch uncached by default · Next 16 'use cache'
  Pages Router (getServerSideProps) = older, still common
```

---

## Connects to

- **[Part 13 — React 19](13-react-19-and-19-2.md):** Actions, `useActionState`, `use()` — the client half of this.
- **[Part 8 — Rendering internals](08-rendering-internals-and-vdom.md):** Suspense, concurrent rendering, selective hydration.
- **[Part 9 — Performance](09-performance.md):** bundle size — Server Components are the biggest lever.
- **[Part 15 — Routing](15-routing-react-router.md):** React Router's framework mode as the alternative to Next.js.

## Suggested next topics

1. **Routing** — React Router in plain React apps.
2. **Data fetching** — TanStack Query for client-side server state.
