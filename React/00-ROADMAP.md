# ⚛️ React Study Notes — Master Roadmap

> **Purpose:** the study plan for the React track — from "what is React" to how production React apps are built in 2025–26. 21 parts, ordered so each depends only on what came before. Same conventions as the [JavaScript](../javascript/00-ROADMAP.md), [Angular](../Angular/00-ROADMAP.md) and [Node.js](../nodejs/) tracks.
>
> **Target:** interview-ready for a 3–5-year React role — deep fundamentals (rendering, hooks, state) **plus** the modern stack: React 19, Server Components / Next.js, React Router, TanStack Query, React Hook Form, Testing Library, TypeScript.
>
> **Versions:** updated to **React 19.2** (October 2025). Version-sensitive facts say so; re-check the docs for anything newer.
>
> 📋 **[Interview Question Bank](QNA-INTERVIEW-BANK.md)** — ~230 questions across 34 sections, answered in spoken form. Drill from there; use the parts to fix gaps.

---

## How to study each part

```
1. Concept        → what it is, in one sentence
2. Why it exists  → what people did BEFORE it, and what hurt
3. How internally → what React actually does (render, commit, fiber, scheduler)
4. Write it       → type the code yourself
5. Break it       → make the common mistake on purpose (stale closure, index keys, missing cleanup)
6. Answer it      → the interview questions, out loud
7. Compress it    → the cheat sheet at the end of each part
```

---

## Progress tracker

| # | Part | Priority | Status |
|---|---|---|---|
| 01 | [React Fundamentals](01-react-fundamentals.md) — SPA/MPA, declarative, components, JSX, one-way data flow, how react-dom paints | ⭐⭐⭐⭐☆ | ✅ done |
| 02 | [Components](02-components.md) — functional vs class, pure, smart/dumb, controlled/uncontrolled, composition | ⭐⭐⭐⭐⭐ | ✅ done |
| 03 | [JSX Deep Dive](03-jsx-deep-dive.md) — createElement, conditional rendering, lists & keys, escaping | ⭐⭐⭐⭐☆ | ✅ done |
| 04 | [Props](04-props.md) — read-only, passing functions/components, children, prop drilling, TS vs PropTypes | ⭐⭐⭐⭐⭐ | ✅ done |
| 05 | [State](05-state.md) — snapshots, derived state, immutable & functional updates, batching, lifting | ⭐⭐⭐⭐⭐ | ✅ done |
| 06 | [Lifecycle](06-lifecycle.md) — mount/update/unmount, error boundaries, class → hooks, Strict Mode | ⭐⭐⭐⭐☆ | ✅ done (updated) |
| 07 | [Hooks](07-hooks.md) — rules, useState, useEffect, useContext, useReducer, useMemo, useCallback, useRef, the rest | ⭐⭐⭐⭐⭐ | ✅ done (updated) |
| 08 | [Rendering Internals & VDOM](08-rendering-internals-and-vdom.md) — fiber, reconciliation, scheduling, concurrent rendering | ⭐⭐⭐⭐⭐ | ✅ done (updated) |
| 09 | [Performance](09-performance.md) — memo, code splitting, lazy/Suspense, bundles, assets, React Compiler | ⭐⭐⭐⭐☆ | ✅ done (updated) |
| 10 | [Higher-Order Components](10-hoc.md) — HOCs vs hooks vs render props | ⭐⭐⭐☆☆ | ✅ done |
| 11 | [State Management](11-state-management.md) — state types, server state, Context, Context vs Redux vs Zustand | ⭐⭐⭐⭐☆ | ✅ done |
| 12 | [Async JavaScript in React](12-async-javascript.md) — fetch, loading/errors, retry, polling, debounce, AbortController, races | ⭐⭐⭐⭐☆ | ✅ done |
| 13 | 🆕 [React 19 & 19.2](13-react-19-and-19-2.md) — Actions, useActionState, useFormStatus, useOptimistic, use(), ref as prop, Activity, useEffectEvent | ⭐⭐⭐⭐⭐ | ✅ done |
| 14 | 🆕 [Server Components & Next.js](14-server-components-and-nextjs.md) — CSR/SSR/SSG/ISR, hydration, streaming, 'use client', 'use server', App Router | ⭐⭐⭐⭐⭐ | ✅ done |
| 15 | 🆕 [Routing (React Router)](15-routing-react-router.md) — nested routes, params, loaders/actions, protected & lazy routes, v7 | ⭐⭐⭐⭐☆ | ✅ done |
| 16 | 🆕 [Forms](16-forms.md) — React Hook Form, zod, server errors, field arrays, form actions, accessible forms | ⭐⭐⭐⭐☆ | ✅ done |
| 17 | 🆕 [Data Fetching: TanStack Query & Redux Toolkit](17-data-fetching-tanstack-query-and-redux-toolkit.md) — query keys, staleTime, mutations, optimistic updates, RTK, RTK Query | ⭐⭐⭐⭐⭐ | ✅ done |
| 18 | 🆕 [Testing](18-testing.md) — Testing Library, user-event, MSW, hooks, async UI, Playwright | ⭐⭐⭐⭐☆ | ✅ done |
| 19 | 🆕 [TypeScript with React](19-typescript-with-react.md) — props, children, events, hooks, context, native props, generics | ⭐⭐⭐⭐☆ | ✅ done |
| 20 | 🆕 [Portals, Refs & Modals](20-portals-refs-and-modals.md) — createPortal, accessible modals, `<dialog>`, callback refs, positioning | ⭐⭐⭐☆☆ | ✅ done |
| 21 | 🆕 [Styling & Accessibility](21-styling-and-accessibility.md) — CSS Modules, Tailwind, CSS-in-JS, headless UI, semantic JSX, focus, ARIA | ⭐⭐⭐⭐☆ | ✅ done |

**Gap review (Nov 2026):** Parts 13–21 added; corrections in Parts 06 (Strict Mode in 19, `useEffect` timing, error boundaries + `react-error-boundary` + root error callbacks), 07 (`useTransition` — transition the update, compute in render; `forwardRef` not deprecated yet; React Compiler as a separate tool), 08 (transition example), 09 (React Compiler status); Q&A bank sections 26–34 added.

---

# Phases

**PHASE 1 — Foundations (01–05):** what React is, components, JSX, props, state. Everything else assumes these.

**PHASE 2 — How React really works (06–08):** lifecycle, hooks, and the render/commit pipeline. The "senior" questions live here.

**PHASE 3 — Building well (09–12):** performance, reuse patterns, state management, async work.

**PHASE 4 — The modern stack (13–17):** React 19, Server Components & Next.js, routing, forms, data fetching. This is how most React jobs look in 2025–26.

**PHASE 5 — Production quality (18–21):** testing, TypeScript, portals/modals, styling & accessibility.

---

# Interview priority — what to revise last

| Priority | Topics |
|---|---|
| ⭐⭐⭐⭐⭐ | State & snapshots · Hooks (useEffect cleanup, stale closures, deps) · Rendering & reconciliation (keys, re-renders) · Components & props · React 19 · Server Components · TanStack Query |
| ⭐⭐⭐⭐☆ | Lifecycle & error boundaries · Performance (memo, splitting, Compiler) · State management (Context vs Redux vs Zustand) · Async (races, AbortController) · Routing · Forms · Testing · TypeScript · Styling & a11y |
| ⭐⭐⭐☆☆ | HOCs & render props · Portals & refs · JSX details |

**If you have one week left:** state + hooks (05, 07) → rendering & keys (08) → React 19 + Server Components (13, 14) → TanStack Query (17) → testing (18). Then answer the Q&A bank out loud.

---

# Suggested schedule

| Week | Parts |
|---|---|
| 1 | 01 Fundamentals · 02 Components · 03 JSX · 04 Props |
| 2 | 05 State · 06 Lifecycle · 07 Hooks |
| 3 | 08 Rendering internals · 09 Performance |
| 4 | 10 HOCs · 11 State management · 12 Async |
| 5 | 13 React 19 · 14 Server Components & Next.js · 15 Routing |
| 6 | 16 Forms · 17 Data fetching · 18 Testing |
| 7 | 19 TypeScript · 20 Portals & modals · 21 Styling & a11y · build a project + revision |

**Build something:** a small app using React Router (or Next.js), TanStack Query against a real or MSW-mocked API, a React Hook Form + zod form, an accessible modal, and tests with Testing Library. Building it exposes more gaps than re-reading.

---

## Connects to

- **[JavaScript track](../javascript/00-ROADMAP.md)** — closures, `this`, the event loop, promises: everything React is built on.
- **[Angular track](../Angular/00-ROADMAP.md)** — [Part 25](../Angular/25-angular-vs-react.md) compares the two; SSR, a11y and testing parts mirror each other.
- **[Node.js track](../nodejs/)** — the API side of data fetching, auth and testing.
- **[System Design track](../System-design/00-ROADMAP.md)** — CDN, caching and SSR delivery.

*— One part at a time: understand it, write the code, say the answers out loud. —*
