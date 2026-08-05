# React Study Notes — Part 11

## State Management (State Types & the Context API)

> **Format:** Explanation-led notes. Each idea is argued in prose — what it is, why it exists, what it costs, and when it's the wrong choice — with code only where a snippet carries a point words can't.
>
> **Roadmap:** the roadmap's "Part 10 — State Management".
>
> **Continues:** [Part 5 — State](05-state.md) · [Part 7 — Hooks](07-hooks.md) · [Part 8 — Rendering Internals](08-rendering-internals-and-vdom.md) · [Part 9 — Performance](09-performance.md).

---

## Table of Contents

**Part A — State Types**
1. [Why the taxonomy matters more than any library](#taxonomy)
2. [Local State](#local)
3. [Shared State](#shared)
4. [Global State](#global)
5. [Server State — the category that changes everything](#server)
6. [The decision framework](#framework)

**Part B — The Context API**

7. [What Context is, and the framing that prevents misuse](#context-what)
8. [The three pieces and how the lookup works](#context-pieces)
9. [The re-render problem](#rerender)
10. [The patterns worth knowing](#patterns)
11. [When Context is the wrong tool](#wrong-tool)
12. [Context vs Redux vs Zustand](#comparison)
13. [Interview questions & answers](#interview)
14. [Quick revision cheat sheet](#cheatsheet)

---

# Part A — State Types

<a name="taxonomy"></a>
# 1. Why the taxonomy matters more than any library

The most consequential architectural mistake in React applications is treating all state as one kind of thing. Once a team decides "we use Redux" or "we use Context," the natural next move is to put everything in it — and that is where applications become painful to work in.

State differs along dimensions that genuinely change which tool is appropriate: **who owns it**, **how many components need it**, **how often it changes**, and — the dimension people miss entirely — **whether it can go stale without your knowledge**. That last one splits state into two fundamentally different categories, and conflating them causes more real-world pain than any other decision in this area.

So the useful skill isn't knowing Redux. It's being able to look at a piece of data and correctly say what kind of state it is. Get that right and the tool choice becomes almost mechanical.

---

<a name="local"></a>
# 2. Local State

> **Definition:** state owned and used by a single component, invisible to the rest of the application.

This is `useState` or `useReducer` inside a component, and it covers the large majority of state in a well-structured application — which surprises people who assume a "real" application needs a store.

What qualifies: whether a dropdown is open, the current value of an input, which tab is selected, whether a tooltip is showing, hover state, the current page of a paginated table, whether a section is expanded. None of it means anything outside the component that owns it.

Three characteristics define it. **Exactly one component reads and writes it.** It **dies with the component**. And **nothing else in the application would be affected** if it vanished.

## The rule: default here, and stay as long as possible

Start every piece of state local and move it only when a concrete requirement forces you to. This is the opposite of how many developers work — reaching for a global store first because it feels more scalable — and it is backwards.

Local state is easier to reason about, easier to test, has the narrowest possible re-render blast radius, and cannot be corrupted by an unrelated part of the application.

The cost of premature globalisation is worth naming explicitly, because it's usually invisible until it bites. A component with local state can be dropped anywhere in the tree, rendered twice on the same page with two independent states, and tested by simply mounting it. The moment its state moves into a store, it acquires an invisible dependency on that store's existence and shape — and two instances on one page now fight over the same value.

---

<a name="shared"></a>
# 3. Shared State

> **Definition:** state needed by a small number of related components, typically siblings or a component and its descendants.

This is the category most often misfiled as "global," and the distinction is worth being precise about.

Shared state has a **natural owner** — there exists a component in the tree that contains everyone who needs the data. A form's field values shared between inputs and a submit button. A selected row shared between a table and a detail panel. A wizard's current step shared across its screens. Filter values shared between a filter bar and a results list.

The solution is **lifting state up**: move it to the nearest common ancestor and pass it down. That isn't a compromise or a stepping stone to something better — for a bounded set of related components it is the correct answer, because the data flow stays explicit and traceable. Anyone reading the child's props can see exactly what it depends on.

## Why it gets confused with global state

Lifting can produce prop drilling, and prop drilling feels like a problem that demands a store. But **one or two levels of drilling is fine** — arguably better than Context, because the dependency remains visible in the component's signature and the component stays independently testable.

The problem only becomes real when data must traverse several layers of components that don't use it. Even then, the first fix is usually **composition** rather than Context: restructure so the consuming component is created where the data already lives and passed down as `children`, so the prop never travels at all. This is covered in [Part 4 §8](04-props.md), and it's underused precisely because Context is the more famous answer.

Reaching for Context or a store because you drilled a prop through two components is an over-correction that costs testability and reusability while gaining nothing.

---

<a name="global"></a>
# 4. Global State

> **Definition:** state that genuinely belongs to the whole application, needed by components in unrelated parts of the tree, with no sensible common owner.

The honest observation about global state is that **there is far less of it than people assume.** In most applications the real list is short: the authenticated user and session, the theme, the language or locale, feature flags, and possibly a notification or toast queue.

What distinguishes it is the **absence of a natural owner**. There is no component that contains "everyone who needs to know the theme" except the root — and putting state at the root purely so it can be passed down everywhere is precisely the situation Context exists for.

## The two properties that decide the vehicle

**Update frequency** determines whether Context's re-render behaviour is acceptable. A theme changes twice in a session, so re-rendering every consumer is irrelevant. A cart that updates on every click is a completely different proposition, and Context handles it badly.

**Read breadth** determines whether the machinery is worth it at all. If three components read the value, lifting is simpler and more explicit than introducing a provider.

## The failure mode

Treating "several components need this" as sufficient justification for global state. Filter values used by two components are **shared** state, not global state. Moving them to a store makes them harder to trace while gaining nothing, and it couples two components to a global shape they didn't need.

---

<a name="server"></a>
# 5. Server State — the category that changes everything

> **Definition:** data that originates from and is owned by a server, held in the client only as a cache.

This is the distinction that reframes the entire topic, and it most clearly separates people who have maintained a real application from people who have read about state management.

Every category above describes state your application **owns**. You create it, you are the only thing that changes it, and it is correct by definition. Server state is categorically different: **you do not own it.** The server does. What you're holding is a copy that was accurate at the moment it arrived and may already be wrong.

## The four properties that follow

**It is asynchronous.** Fetching takes time, so loading, error and empty states must exist for every piece of it — not as edge cases but as first-class parts of its lifecycle.

**It goes stale without telling you.** Another user edits the record. A background job updates a total. Your copy is silently wrong, and nothing in your application knows, because the change happened somewhere your code cannot observe. No amount of careful local state management detects this — it isn't a state management problem at all.

**Ownership is shared.** Multiple clients can modify the same data simultaneously, which introduces conflicts and race conditions that simply do not exist for a dropdown's open/closed state.

**It needs caching to be usable.** Refetching the same user profile on every navigation is wasteful and makes the application feel slow; never refetching makes it wrong. Getting this right means expiry policies, deduplication of concurrent requests for the same resource, and background revalidation — a genuinely hard problem that has nothing to do with React.

## Why putting server state in Redux is the classic mistake

For years the default architecture was to fetch in a thunk or saga and store the result in Redux, and it produced a recognisable set of problems.

You end up **hand-writing a cache** — loading flags, error flags, timestamps, invalidation logic — for every resource, repeated across the codebase with subtle inconsistencies between them. You **manually manage staleness**, which in practice usually means not managing it at all: data refreshes on mount and then rots until the user reloads the page. You write **large amounts of boilerplate** — three action types, a reducer case each, a thunk, a selector — to express "fetch a list of users."

And most importantly, **none of the hard parts get solved.** Redux is a synchronous state container. It has no opinion about caching, deduplication, retry, or revalidation, so you implement all of it yourself, incompletely, in every project.

## What server-state libraries do instead

React Query, SWR and RTK Query start from the premise that this is a **cache-management problem, not a state-management problem**, and solve it directly.

They **deduplicate** concurrent requests for the same resource, so three components asking for the same user produce one network request. They implement **staleness policies**, serving cached data instantly while revalidating in the background — which is how an interface feels fast without being wrong. They **refetch on window focus and on reconnection**, which is how the application notices someone else's change. And they provide **retry with backoff**, **pagination and infinite scroll**, and **optimistic updates with rollback** as built-in capabilities rather than patterns you reimplement per project.

The practical effect is that loading and error state stop being state you manage. They become properties of the query, and a large fraction of what used to live in your store disappears entirely.

---

<a name="framework"></a>
# 6. The decision framework

The procedure is short, and following it **in order** avoids nearly every state-management mistake.

**First: does it come from a server?** If yes, it's server state — use React Query or SWR, regardless of how many components read it. This question goes first because getting it wrong is by far the most expensive error, and answering it correctly removes most of what people would otherwise put in a global store.

**Does only one component use it?** Local state. Default here and stay here as long as possible.

**Do a few related components use it?** Shared state — lift to the nearest common ancestor, or restructure with composition.

**Is it genuinely application-wide?** Then split by update frequency. **Rarely changing** — theme, auth, locale, feature flags — suits Context. **Frequently changing** — a cart, editor state, live collaborative data — suits Zustand or Redux, because those let components subscribe to slices rather than re-rendering on every change.

The architecture that results is the split most well-maintained applications converge on:

```
server data     → React Query / SWR   (users, posts, orders — it's a CACHE)
global UI state → Context or Zustand  (theme, auth, sidebar, modals)
shared state    → lifted to a common parent
local state     → useState            (inputs, toggles, hover)
```

> **A strong interview answer:** *"The first question isn't which library — it's whether the data is server state. If it came from an API it's a cache, not state, and it needs a caching tool with staleness and deduplication. That single distinction removes most of what people put in a global store, and what's left is usually small enough that Context or Zustand handles it comfortably."*

---

# Part B — The Context API

<a name="context-what"></a>
# 7. What Context is, and the framing that prevents misuse

> **Definition:** Context is a mechanism for passing data through the component tree without threading props through every intermediate level.

The single most useful thing to understand about Context is what it is *not*.

**Context is a transport mechanism, not a state manager.** It moves a value from a provider down to consumers, bypassing the components in between. That is the entirety of what it does. It has no store, no reducers, no middleware, no devtools, and — the consequential omission — **no selectors**, meaning no way for a consumer to subscribe to only part of the value.

Almost every complaint that Context is slow, or that Context doesn't scale, traces back to treating it as a state manager. It isn't one. It is the plumbing you would otherwise build with props, and it is excellent at exactly that.

The state itself still lives in `useState` or `useReducer` somewhere. Context only carries it.

---

<a name="context-pieces"></a>
# 8. The three pieces and how the lookup works

**`createContext(defaultValue)`** creates a context object. It is essentially a token — a unique identity that providers and consumers use to find each other. The argument is a fallback, discussed below.

**`<Context.Provider value={...}>`** supplies a value to everything rendered beneath it. The `value` prop is the payload and can be anything: a primitive, an object, a function, or a combination.

**`useContext(Context)`** reads the value from the nearest provider above the calling component, and subscribes that component to changes.

## How the lookup actually works

When a component calls `useContext`, React walks **up** the fiber tree from that component, looking for the nearest provider of that specific context, and returns its current `value`.

Two consequences follow directly, and both explain behaviour that otherwise seems arbitrary.

**It is positional, not global.** A component doesn't receive "the theme" — it receives whatever the nearest `ThemeContext.Provider` above it happens to be supplying. Move the component elsewhere in the tree and it may get a different value, or none at all.

**Nesting the same context deliberately overrides it for a subtree.** Because the search stops at the first match, wrapping part of your tree in a second provider gives that subtree a different value. This is a genuine feature rather than an accident — a dark-themed page containing a light-themed modal, or a form section with different validation configuration.

## The default value, and when it applies

The argument to `createContext` is used **only when a component calls `useContext` with no matching provider anywhere above it.** This is narrower than people expect, and it's a common interview question.

It does **not** act as a fallback for `undefined`. A provider explicitly supplying `undefined` gives you `undefined`, not the default. The default exists for two situations: components rendered in isolation, such as in tests or Storybook, and genuinely optional context where a neutral value makes sense.

In production code the better practice is usually the opposite — leave the default undefined and **throw** when it's missing, which §10 covers.

## The Consumer, and why you rarely see it

Before hooks, consuming context required a render prop: `<Context.Consumer>{value => ...}</Context.Consumer>`. It works identically, but it nests inside your JSX, so reading three contexts meant three levels of indentation before reaching your actual markup.

`useContext` replaced it entirely for function components. The `Consumer` remains necessary only in **class components**, which cannot use hooks. Worth a sentence in an interview; not worth using in new code.

---

<a name="rerender"></a>
# 9. 🔥 The re-render problem

This is what separates a working Context implementation from one that quietly degrades an application, and it is the substance of most Context interview questions.

**Every component that calls `useContext` for a given context re-renders whenever that provider's `value` changes.** Not "components that use the part that changed" — *every consumer, unconditionally.*

And critically: **`React.memo` cannot prevent this.** Memo compares props, and context does not travel through props — it is delivered through a separate channel that bypasses the props comparison entirely. A memoized component that reads context will still re-render when that context changes, which is genuinely surprising the first time you hit it.

There is no built-in mechanism to subscribe to *part* of a context value. That single missing capability is why Context is not a state manager, and it is the root of all three problems below.

## Problem 1 — an unstable value

The most common Context bug, and it is invisible unless you profile.

```jsx
<UserContext.Provider value={{ user, setUser }}>
```

That object literal is constructed fresh on every render of the provider component. React compares by reference, sees a different object, and re-renders **every consumer in the application** — even when `user` has not changed at all. A theme toggle near the root can cascade a full re-render through hundreds of components.

The fix is `useMemo` on the value, keyed on what actually changed. This is not an optimization to consider later; for any provider that re-renders, it is the difference between Context working and Context being a performance problem.

## Problem 2 — one context holding too much

Bundling unrelated concerns into a single `AppContext` — user, theme, cart, locale — means a change to any one of them re-renders everyone reading any of them. A component that only cares about the locale re-renders when someone adds an item to their cart.

The fix is to **split contexts by concern and by update frequency**. Two separate providers cost almost nothing and confine each update to the components that actually care.

The update-frequency dimension matters as much as the topical one. A rarely-changing value and a frequently-changing value should never share a provider, however related they seem — the frequent one drags the infrequent one's consumers along with it on every change.

## Problem 3 — mixing state and setters

A large fraction of consumers only *dispatch*. A logout button calls `logout()` and never displays the user. Yet if state and setter share one context value, that button re-renders every time the state changes.

The fix is to **split state and dispatch into separate contexts.** Because `setState` and `dispatch` have permanently stable identities, the dispatch context's value never changes — so components consuming only it never re-render from context at all. This is the standard pattern in the Context + `useReducer` architecture and it is a substantial win in practice.

---

<a name="patterns"></a>
# 10. The patterns worth knowing

## Wrap each provider in its own component

Put the state, the logic and the memoized value inside a `ThemeProvider` component that renders `{children}`. This keeps the concern self-contained, keeps `App` readable, and means the provider's internals can change without touching anything else.

```jsx
function ThemeProvider({ children }) {
  const [theme, setTheme] = useState("dark");
  const toggle = useCallback(() => setTheme(t => t === "dark" ? "light" : "dark"), []);
  const value  = useMemo(() => ({ theme, toggle }), [theme, toggle]);   // ⚠️ essential

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
```

## Export a custom hook that throws when the provider is missing

Rather than exporting the context object and letting consumers call `useContext` directly, export a `useTheme()` that reads the context and throws a clear error if it's undefined.

This converts a confusing downstream failure — "cannot read property of undefined," three components away from the actual cause — into an immediate, explicit message naming the missing provider. It also means consumers never import the context object at all, so you can change its internal shape freely without touching them.

```jsx
function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
```

## Combine Context with `useReducer` for complex global state

Context handles distribution; `useReducer` handles the transition logic. Paired with the state/dispatch split from §9, this gives you most of Redux's architecture — centralised transitions, dispatched actions, a pure reducer you can unit-test without rendering anything — with no dependency at all.

What it lacks is devtools, middleware, and slice subscriptions. Those absences are exactly the point at which Redux or Zustand starts earning its place.

## Watch provider nesting as it grows

Eight nested providers in your root is a smell — not fatal, but a signal worth reading. Either flatten them with a small compose helper, or take it as evidence that some of that state belongs in a store rather than in Context.

---

<a name="wrong-tool"></a>
# 11. When Context is the wrong tool

**Frequently changing state.** Every consumer re-renders on every change with no way to narrow it. Form field values, a cart updating per click, mouse position, anything driven by an animation frame — all belong elsewhere.

**Server data.** For every reason in Part A: a fetched value in Context is a hand-rolled cache with none of the machinery that makes caching correct.

**Large state with many independent slices.** The absence of selectors means you either split into many contexts or accept broad re-renders. Past a certain size, that's a store's job.

**Replacing one or two levels of prop drilling.** You trade an explicit, visible dependency for an implicit one and gain nothing.

---

<a name="comparison"></a>
# 12. Context vs Redux vs Zustand

The comparison is clearest as trade-offs rather than a ranking.

**Context** ships with React, adds no dependency, and is ideal for a handful of rarely-changing values. Its limits are the absence of selectors, no devtools, and all-consumers-re-render on any change.

**Zustand** is a small library whose central advantage is precisely what Context lacks: components subscribe to **slices** of the store, so a component reading `user` doesn't re-render when `cart` changes. It also works outside React components, which makes it easy to read or update from utilities and event handlers. For frequently-changing global state, this is usually the right answer now.

**Redux** brings a single store, enforced patterns, powerful devtools with time-travel debugging, and a middleware ecosystem. That structure is genuine value on a large team or a complex domain, and genuine overhead on a small application. Redux Toolkit removes most of the historical boilerplate complaint, and RTK Query addresses server state within the same ecosystem.

| | **Context** | **Zustand** | **Redux (RTK)** |
|---|---|---|---|
| Dependency | none — built in | tiny | larger |
| Subscribe to a slice | ❌ no | ✅ yes | ✅ yes (selectors) |
| Re-render scope | **all consumers** | only slice subscribers | only selector subscribers |
| Devtools | ❌ | basic | ✅ time-travel |
| Middleware | ❌ | some | ✅ rich ecosystem |
| Usable outside React | ❌ | ✅ | ✅ |
| Best for | few, rarely-changing values | frequently-changing global state | large apps, big teams |

> **A good summary line:** *"Context is transport, not storage. It's the right tool for a few values that rarely change — theme, auth, locale. The moment I need components to subscribe to part of the state rather than all of it, Context has no answer and I'd reach for Zustand. And server data doesn't belong in any of them; it belongs in a query cache."*

## The common mistakes, collected

Putting **frequently-changing state** in Context, because the re-render cost isn't visible until the application is large. Passing an **inline object as `value`**, which defeats everything else you do. Building **one giant context** instead of several focused ones. Expecting **`React.memo` to stop context re-renders**. Using Context for **server data**. Reaching for it **too early**, when lifting or composition would do. And **omitting the missing-provider guard**, which turns a clear setup error into a confusing runtime failure far from its cause.

---

<a name="interview"></a>
# 13. Interview questions & answers

### Q: "How do you decide where a piece of state should live?"
> *"I ask whether it comes from a server first, because that's a different category — it's a cache, not state, and it needs React Query or SWR regardless of how many components read it. If it's client state, I default to local and only move it when something forces me: a few related components means lifting to a common ancestor, and genuinely application-wide means Context if it rarely changes or Zustand if it changes often. Starting local and moving upward is much safer than starting global, because a component with local state can be reused and tested independently."*

### Q: "What's the difference between global state and shared state?"
> *"Shared state has a natural owner — there's a component in the tree that contains everyone who needs it, so lifting to that ancestor is the right answer. Global state has no sensible owner short of the root, which is what Context exists for. People routinely misfile shared state as global: filter values used by two components are shared, and putting them in a store makes them harder to trace while gaining nothing."*

### Q: "What is server state and why is it different?"
> *"Data that originates from and is owned by a server, held on the client only as a cache. Every other kind of state you own — you create it and you're the only thing that changes it, so it's correct by definition. Server state you don't own: another user or a background job can change it and your copy is silently wrong, with nothing in your application able to detect that. It's also asynchronous, has shared ownership with conflicts, and needs real caching with expiry and deduplication. Those are cache-management problems, not state-management problems."*

### Q: "Why is putting API data in Redux considered an anti-pattern?"
> *"Because you end up hand-writing a cache. Loading flags, error flags, timestamps and invalidation logic for every resource, repeated inconsistently across the codebase, plus a lot of boilerplate for what's really 'fetch a list.' And none of the hard parts get solved — Redux is a synchronous container with no opinion about deduplication, staleness or revalidation, so you implement all of it yourself. React Query or RTK Query solve those directly: request deduplication, stale-while-revalidate, refetch on focus and reconnect, retry with backoff, optimistic updates with rollback."*

### Q: "What is the Context API?"
> *"A mechanism for passing a value down the tree without threading props through every level. The important framing is that it's transport, not storage — it has no store, no reducers, no middleware and, crucially, no selectors. The state still lives in `useState` or `useReducer`; Context just delivers it. Most complaints that Context doesn't scale come from treating it as a state manager."*

### Q: "How does `useContext` find its value?"
> *"React walks up the fiber tree from the calling component to the nearest provider of that context and returns its current value. Two things follow: it's positional rather than global, so the same component in a different part of the tree can get a different value; and nesting the same context deliberately overrides it for a subtree, which is how you get a dark page containing a light-themed modal."*

### Q: "When does the `createContext` default value apply?"
> *"Only when a component calls `useContext` with no matching provider anywhere above it. It's not a fallback for `undefined` — a provider explicitly supplying `undefined` gives you `undefined`. It's mainly useful for rendering components in isolation in tests or Storybook. In production I'd usually leave it undefined and have a custom hook throw, so a missing provider fails immediately with a clear message instead of producing a confusing error downstream."*

### Q: "Why does everything re-render when a context value changes?"
> *"Because there's no way to subscribe to part of a context value — every consumer re-renders when the provider's value changes, whether or not the part they use changed. And `React.memo` can't stop it, because memo compares props and context is delivered through a separate channel that bypasses props entirely. That missing selector capability is precisely why Context isn't a state manager."*

### Q: "What's the most common Context performance mistake?"
> *"Passing an inline object as `value`. It's a new reference on every render of the provider, so every consumer in the application re-renders even when nothing meaningful changed. Wrapping it in `useMemo` keyed on the real dependencies fixes it. Beyond that, splitting one large context into several by concern and update frequency, and separating state from dispatch — since dispatch is stable, components that only dispatch then never re-render from context at all."*

### Q: "How would you build global state with just React?"
> *"Context plus `useReducer`. The reducer centralises the transitions in one pure function that's testable without rendering anything, and Context distributes it. I'd split state and dispatch into two contexts so dispatch-only consumers don't re-render, memoize the state value, and expose custom hooks that throw if the provider is missing. That gives you most of Redux's architecture with no dependency — what you don't get is devtools, middleware and slice subscriptions, and needing those is the signal to move to Redux or Zustand."*

### Q: "Context vs Redux vs Zustand?"
> *"Context is built in and right for a few values that rarely change — theme, auth, locale — but every consumer re-renders on any change and there are no selectors or devtools. Zustand's main advantage is exactly that gap: components subscribe to slices, so a component reading the user doesn't re-render when the cart changes, and it works outside React too. Redux brings a single store, enforced patterns, time-travel devtools and a middleware ecosystem, which is real value on a large team and real overhead on a small app. Redux Toolkit removed most of the old boilerplate complaint."*

### Q: "When is Context the wrong choice?"
> *"Frequently changing state, because every consumer re-renders with no way to narrow it — form fields, a cart, mouse position. Server data, which needs a cache rather than transport. Large state with many independent slices, where the lack of selectors forces you to either fragment into many contexts or accept broad re-renders. And replacing one or two levels of prop drilling, where you trade an explicit dependency for an implicit one and gain nothing."*

### Q: "Is prop drilling always bad?"
> *"No. One or two levels is explicit and traceable, and the dependency is visible in the component's signature, which Context takes away. It becomes a problem with depth and breadth — several layers of components carrying props they don't use. My first fix is composition rather than Context: restructure so the consuming component is created where the data lives and passed as `children`, so the prop never travels. Context is for data that's genuinely global, not for avoiding two props."*

---

<a name="cheatsheet"></a>
# 14. Quick revision cheat sheet

```
THE POINT       the mistake isn't picking the wrong library — it's treating all
                state as ONE KIND OF THING
                dimensions that matter: who owns it · how many need it
                · how often it changes · CAN IT GO STALE WITHOUT YOU KNOWING

LOCAL           one component owns and uses it · dies with the component
                dropdowns · inputs · tabs · hover · tooltips · expanded sections
                ⭐ DEFAULT HERE — move only when forced
                cost of going global early: loses independent reuse, two instances
                on one page fight, needs the store to exist just to test

SHARED          a few related components · HAS a natural owner
                form fields · selected row + detail panel · wizard step · filters
                → LIFT to the nearest common ancestor
                1–2 levels of drilling is FINE (the dependency stays visible)
                deeper → try COMPOSITION first (create it where the data lives,
                pass as children → the prop never travels)

GLOBAL          no sensible owner short of the root
                ⚠️ FAR less of it than people assume:
                   auth/session · theme · locale · feature flags · toasts
                decide the vehicle by:
                  UPDATE FREQUENCY  rare → Context · frequent → Zustand/Redux
                  READ BREADTH      only 3 readers → just lift it
                failure mode: "several components need this" ≠ global

SERVER STATE ⭐ data OWNED BY THE SERVER, held on the client as a CACHE
                every other kind you OWN → correct by definition
                this one you DON'T → it can be wrong and you can't tell
                properties: ASYNC (loading/error/empty always)
                            · GOES STALE SILENTLY (someone else changed it)
                            · SHARED OWNERSHIP (conflicts, races)
                            · NEEDS CACHING (expiry, dedup, revalidation)
                🔥 API data in Redux = hand-writing a cache, badly, per resource
                   + huge boilerplate + none of the hard parts solved
                   (Redux is SYNCHRONOUS — no opinion on staleness or dedup)
                → React Query / SWR / RTK Query:
                   dedup · stale-while-revalidate · refetch on focus + reconnect
                   · retry w/ backoff · pagination · optimistic updates + rollback
                effect: loading/error stop being state you manage

THE FRAMEWORK   1. from a server?     → SERVER STATE (ask this FIRST)
                2. one component?     → local
                3. a few related?     → lift / composition
                4. app-wide + rare?   → Context
                5. app-wide + often?  → Zustand / Redux
                server data  → React Query/SWR
                global UI    → Context or Zustand
                shared       → lifted
                local        → useState

CONTEXT         ⭐ TRANSPORT, NOT STORAGE. No store, no reducers, no middleware,
                   NO SELECTORS. State still lives in useState/useReducer.
                createContext(default) → <Ctx.Provider value> → useContext(Ctx)
LOOKUP          walks UP the fiber tree to the NEAREST provider
                → POSITIONAL, not global (same component elsewhere = different value)
                → nesting the same context OVERRIDES it for that subtree (a feature)
DEFAULT VALUE   applies ONLY when there is NO provider above
                ❌ NOT a fallback for undefined (a provider giving undefined wins)
                mainly for tests/Storybook — in prod, THROW instead
CONSUMER        <Ctx.Consumer>{v => …}</Ctx.Consumer> — legacy render prop
                still needed in CLASS components only

🔥 RE-RENDER    EVERY consumer re-renders when value changes — not just those
                using the changed part. NO way to subscribe to a slice.
                ⚠️ React.memo CANNOT stop it — context bypasses props entirely
                P1 UNSTABLE VALUE  value={{a,b}} = new ref every render
                                   → EVERY consumer re-renders → useMemo it
                P2 ONE BIG CONTEXT locale consumer re-renders when the cart changes
                                   → split by CONCERN and by UPDATE FREQUENCY
                P3 STATE + SETTERS a logout button re-renders on every state change
                                   → SPLIT state and dispatch contexts
                                     (dispatch is stable → never re-renders)

PATTERNS        provider as its own component (state + logic + memoized value inside)
                custom hook that THROWS if the provider is missing
                  → turns "cannot read property of undefined" 3 components away
                    into an immediate, named error
                Context + useReducer = most of Redux with no dependency
                  (missing: devtools, middleware, slice subscriptions)
                8 nested providers = a smell → compose, or move some to a store

CONTEXT IS WRONG FOR
                frequently changing state (form fields, cart, mouse position)
                server data (needs a cache, not transport)
                large state with many slices (no selectors)
                replacing 1–2 levels of drilling (loses an explicit dependency)

CONTEXT vs ZUSTAND vs REDUX
                Context  built in · no selectors · ALL consumers re-render
                         · no devtools · best for few, rarely-changing values
                Zustand  SLICE SUBSCRIPTIONS (the exact gap Context has)
                         · works outside React · best for frequent global state
                Redux    single store · enforced patterns · TIME-TRAVEL devtools
                         · middleware ecosystem · RTK killed the boilerplate
                         · RTK Query covers server state

MISTAKES        frequently-changing state in Context · inline object as value
                · one giant context · expecting memo to help · server data in Context
                · reaching for it too early · no missing-provider guard
```

---

## Connects to

- **[Part 5 — State](05-state.md):** local state, lifting, derived state, and the communication patterns this part builds on.
- **[Part 4 — Props](04-props.md):** prop drilling and the composition fix that should be tried before Context.
- **[Part 7 — Hooks](07-hooks.md):** `useContext` and `useReducer` mechanics; why the provider value needs `useMemo`.
- **[Part 8 — Rendering Internals](08-rendering-internals-and-vdom.md):** why a new value reference re-renders consumers, and why context bypasses `React.memo`.
- **[Part 9 — Performance](09-performance.md):** reference stability, and profiling to find context-driven re-renders.
- **Data fetching:** React Query / SWR in depth — caching, invalidation, optimistic updates.

## Suggested next topics

1. **Custom Hooks** — recommended next; where most of this logic ends up living.
2. **Redux / Zustand in depth** — stores, selectors, middleware.
3. **Data fetching with React Query** — the server-state half, properly.

*— End of Part 11: State Management —*
