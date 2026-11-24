# React Study Notes — Part 17

## Data Fetching with TanStack Query, and Redux Toolkit / RTK Query (Query Keys, staleTime, Mutations, Optimistic Updates, Infinite Scroll, createSlice)

> **Why this part exists:** [Part 11 §5](11-state-management.md) explains *why* server data is a different kind of state. This part is *how* — the tools almost every React job uses: **TanStack Query** (formerly React Query) for server state, and **Redux Toolkit** for the apps that use Redux.
>
> **Versions:** examples use **TanStack Query v5** (2023+) and **Redux Toolkit 2.x**. v5 renamed some things — noted below — because v4 code is everywhere.
>
> **Continues from:** [Part 11 — State management](11-state-management.md) · [Part 12 — Async JavaScript](12-async-javascript.md) (race conditions, retries, AbortController).

---

## Table of Contents

1. [Why not just `useEffect` + `fetch`?](#why)
2. [⭐ `useQuery` and query keys](#usequery)
3. [⭐ `staleTime` vs `gcTime` — how the cache works](#cache)
4. [⭐ Mutations and cache invalidation](#mutations)
5. [⭐ Optimistic updates](#optimistic)
6. [Pagination, infinite scroll, prefetching, Suspense](#more)
7. [Redux Toolkit — the modern Redux](#rtk)
8. [RTK Query — Redux's own data-fetching layer](#rtkq)
9. [Choosing](#choose)
10. [Interview Q&A](#interview)
11. [Cheat Sheet](#cheatsheet)

---

<a name="why"></a>
# 1. Why not just `useEffect` + `fetch`?

```jsx
useEffect(() => {
  let ignore = false;
  setLoading(true);
  fetch(`/api/users/${id}`)
    .then(r => r.json())
    .then(d => { if (!ignore) setUser(d); })
    .catch(e => { if (!ignore) setError(e); })
    .finally(() => { if (!ignore) setLoading(false); });
  return () => { ignore = true; };
}, [id]);
```

That handles the race condition ([Part 12 §12](12-async-javascript.md)) — and still has no:
- **caching** (go back to a page → spinner again),
- **de-duplication** (three components asking for the same user → three requests),
- **background refresh** (data goes stale while the tab sits open),
- **retries**, refetch on reconnect or window focus,
- shared loading/error state across components, pagination helpers, optimistic updates.

> **Analogy 📚 — a library vs buying a book every time.** `useEffect` + `fetch` buys the book again whenever you want to read it. A query library keeps a copy on the shelf, checks for new editions in the background, and lends the same copy to everyone who asks.

---

<a name="usequery"></a>
# 2. ⭐ `useQuery` and query keys

```jsx
// main.jsx
const queryClient = new QueryClient();
<QueryClientProvider client={queryClient}><App /></QueryClientProvider>
```

```jsx
import { useQuery } from '@tanstack/react-query';

function UserProfile({ userId }) {
  const { data, isPending, isError, error, isFetching } = useQuery({
    queryKey: ['users', userId],                          // the cache key — like a dependency array
    queryFn: ({ signal }) =>
      fetch(`/api/users/${userId}`, { signal }).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);   // fetch doesn't reject on 4xx/5xx — throw yourself
        return r.json();
      }),
  });

  if (isPending) return <Spinner />;                       // no data yet
  if (isError) return <ErrorMessage error={error} />;
  return <h1>{data.name} {isFetching && <SmallSpinner />}</h1>;   // isFetching = refreshing in background
}
```

**Query keys** are the most important idea:
- An **array** that uniquely identifies the data: `['users', userId]`, `['todos', { status: 'done', page: 2 }]`.
- **Same key = same cache entry** → components share data and requests are de-duplicated.
- **Key changes → new fetch** (like `useEffect` dependencies). Put **every variable the `queryFn` uses** in the key.
- Keys are hierarchical, so `invalidateQueries({ queryKey: ['users'] })` refreshes **every** users query.

Useful options: `enabled: !!userId` (wait until you have an id — dependent queries), `select: (d) => d.items` (transform/subscribe to part of the data), `retry: 3` (default 3 with backoff), `refetchOnWindowFocus` (default `true`).

⚠️ **v5 renames:** `isLoading` → **`isPending`** (no data yet), `cacheTime` → **`gcTime`**, `keepPreviousData` → **`placeholderData: keepPreviousData`**, and only the **object** syntax `useQuery({ ... })` is supported.

> 🧠 **Remember:** **the query key is the identity of the data. Same key, same data.**

---

<a name="cache"></a>
# 3. ⭐ `staleTime` vs `gcTime` — how the cache works

| Setting | Means | Default |
|---|---|---|
| **`staleTime`** | how long data counts as **fresh**. Fresh data is served from cache with **no refetch** | **0** — data is stale immediately |
| **`gcTime`** (was `cacheTime`) | how long **unused** data stays in memory after the last component using it unmounts | 5 minutes |

The default lifecycle with `staleTime: 0`:

```
mount component         → fetch, show spinner, cache result
navigate away + back    → show cached data INSTANTLY, refetch in the background (it's stale) → update if changed
window regains focus    → background refetch (stale)
nobody uses it for 5min → removed from cache (gcTime)
```

So "stale" ≠ "not shown". Stale data is still displayed — it just gets refreshed. Set `staleTime` to how often the data really changes: `staleTime: 60_000` for a product catalogue, `Infinity` for data that never changes in a session.

---

<a name="mutations"></a>
# 4. ⭐ Mutations and cache invalidation

Creating/updating/deleting uses `useMutation`. Afterwards, tell the cache what's now out of date:

```jsx
const queryClient = useQueryClient();

const addTodo = useMutation({
  mutationFn: (newTodo) => api.post('/todos', newTodo),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['todos'] });   // mark all todo lists stale → refetch the visible ones
  },
});

<button onClick={() => addTodo.mutate({ title })} disabled={addTodo.isPending}>Add</button>
{addTodo.isError && <p role="alert">{addTodo.error.message}</p>}
```

- **`invalidateQueries`** is the simplest, safest option — refetch from the server, which is the source of truth.
- Or update the cache directly with the server's response: `queryClient.setQueryData(['todos', id], updated)`.
- `mutateAsync` returns a promise if you need to `await` it (e.g. then navigate).

---

<a name="optimistic"></a>
# 5. ⭐ Optimistic updates

Update the UI immediately, roll back if the server says no:

```jsx
const toggleTodo = useMutation({
  mutationFn: (todo) => api.patch(`/todos/${todo.id}`, { done: !todo.done }),

  onMutate: async (todo) => {
    await queryClient.cancelQueries({ queryKey: ['todos'] });          // stop in-flight refetches overwriting us
    const previous = queryClient.getQueryData(['todos']);               // snapshot for rollback
    queryClient.setQueryData(['todos'], (old) =>
      old.map(t => t.id === todo.id ? { ...t, done: !t.done } : t));    // optimistic change
    return { previous };                                                // → context
  },
  onError: (_err, _todo, context) => {
    queryClient.setQueryData(['todos'], context.previous);              // roll back
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['todos'] });             // re-sync with the server either way
  },
});
```

Steps to say out loud: **cancel → snapshot → update → (error) roll back → (always) re-sync.** v5 also has a simpler form using `mutation.variables` to render the pending item in the UI without touching the cache. React 19's `useOptimistic` ([Part 13 §4](13-react-19-and-19-2.md)) does a similar job for component-local state.

---

<a name="more"></a>
# 6. Pagination, infinite scroll, prefetching, Suspense

**Pagination without a flash of loading:**

```jsx
const { data, isPlaceholderData } = useQuery({
  queryKey: ['products', page],
  queryFn: () => fetchProducts(page),
  placeholderData: keepPreviousData,     // keep showing page 1 while page 2 loads
});
```

**Infinite scroll:**

```jsx
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
  queryKey: ['feed'],
  queryFn: ({ pageParam }) => fetchFeed({ cursor: pageParam }),
  initialPageParam: null,                               // required in v5
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,   // undefined = no more pages
});
// data.pages.flatMap(p => p.items) · call fetchNextPage() from an IntersectionObserver sentinel
```

**Prefetching** (on hover, or in a router loader):

```jsx
onMouseEnter={() => queryClient.prefetchQuery({ queryKey: ['users', id], queryFn: () => fetchUser(id) })}
```

**Suspense:** `useSuspenseQuery` suspends instead of returning `isPending` — pair with `<Suspense>` and an error boundary.

**DevTools:** `@tanstack/react-query-devtools` shows every query, its key, status and cached data — the first place to look when "the data is stale."

---

<a name="rtk"></a>
# 7. Redux Toolkit — the modern Redux

Old Redux (action type constants, switch reducers, hand-written immutable updates) was famously verbose. **Redux Toolkit (RTK)** is now *the* official way to write Redux.

```js
// features/cart/cartSlice.js
import { createSlice } from '@reduxjs/toolkit';

const cartSlice = createSlice({
  name: 'cart',
  initialState: { items: [] },
  reducers: {
    addItem(state, action) {
      state.items.push(action.payload);          // looks like mutation — Immer makes it an immutable update ✅
    },
    removeItem(state, action) {
      state.items = state.items.filter(i => i.id !== action.payload);
    },
  },
});

export const { addItem, removeItem } = cartSlice.actions;     // action creators generated for you
export default cartSlice.reducer;
```

```js
// store.js
export const store = configureStore({ reducer: { cart: cartReducer } });   // DevTools + good defaults included
```

```jsx
// components
const items = useSelector((state) => state.cart.items);   // re-renders only when THIS value changes
const dispatch = useDispatch();
dispatch(addItem(product));
```

- **Immer** inside `createSlice` lets you write "mutating" code safely — **only inside RTK reducers**.
- **Selectors:** keep `useSelector` narrow. Returning a new object/array each time (`state => ({ a, b })` or `.filter(...)`) re-renders on every store change — use `createSelector` (memoised) for derived data.
- **Async logic:** `createAsyncThunk` (dispatches pending/fulfilled/rejected actions) — but for server data, prefer RTK Query below.

---

<a name="rtkq"></a>
# 8. RTK Query — Redux's own data-fetching layer

If the app already uses Redux, RTK Query plays the role of TanStack Query:

```js
export const api = createApi({
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  tagTypes: ['Todo'],
  endpoints: (build) => ({
    getTodos: build.query({ query: () => 'todos', providesTags: ['Todo'] }),
    addTodo: build.mutation({
      query: (body) => ({ url: 'todos', method: 'POST', body }),
      invalidatesTags: ['Todo'],                 // → getTodos refetches automatically
    }),
  }),
});
export const { useGetTodosQuery, useAddTodoMutation } = api;   // hooks generated for you
```

Same ideas (cache, de-duplication, invalidation) — with **tags** instead of query keys.

---

<a name="choose"></a>
# 9. Choosing

| Kind of state | Tool |
|---|---|
| **server data** (users, orders, products) | **TanStack Query** (or RTK Query if already on Redux, SWR for simple cases, or Server Components / router loaders — [Part 14](14-server-components-and-nextjs.md), [Part 15](15-routing-react-router.md)) |
| local UI state | `useState` / `useReducer` |
| shared client state, small app | Context, or **Zustand** |
| large shared client state, many developers, need devtools/time travel | **Redux Toolkit** |
| URL state (filters, page) | the router's search params |

The classic mistake: putting **server data in Redux** and hand-writing loading flags, caching and refetching — that's exactly what a query library does for you ([Part 11 §5](11-state-management.md)).

---

<a name="interview"></a>
# 10. Interview Q&A

### Q: "Why use TanStack Query instead of `useEffect` for fetching?"
> *"`useEffect` fetching gives me none of: caching, de-duplicating identical requests, background refetching of stale data, retries, refetch on focus or reconnect, pagination helpers, or optimistic updates — and I have to handle race conditions myself. TanStack Query treats server data as a cache keyed by query keys, so components share data and I write much less code."*

### Q: "What is a query key?"
> *"The identity of the cached data — an array like `['users', userId]`. The same key means the same cache entry, so requests are de-duplicated and data is shared; changing the key triggers a new fetch, like a dependency array. Every variable the query function uses belongs in the key, and keys are hierarchical, so invalidating `['users']` refreshes every user query."*

### Q: "`staleTime` vs `gcTime`?"
> *"`staleTime` is how long data counts as fresh — during that time it's served from cache with no refetch; the default is zero. `gcTime`, formerly `cacheTime`, is how long unused data stays in memory after the last component using it unmounts — five minutes by default. Stale data is still shown; it's just refetched in the background."*

### Q: "How do you do an optimistic update with TanStack Query?"
> *"In `onMutate`: cancel in-flight queries for that key, snapshot the current cache, write the optimistic value with `setQueryData`, and return the snapshot. In `onError`, restore the snapshot. In `onSettled`, invalidate the query to re-sync with the server."*

### Q: "What does Redux Toolkit change compared to old Redux?"
> *"`createSlice` generates action creators and the reducer from one object, and uses Immer so reducers can be written as mutations safely. `configureStore` sets up DevTools and middleware. RTK Query handles server data with generated hooks and tag-based invalidation. It removes most of the old boilerplate."*

### Q: "When would you still choose Redux?"
> *"For large, complex client-side state shared across many features and developers, where predictable updates, middleware and time-travel debugging are worth the structure. Not for server data — that's a query library's job — and not for small apps, where `useState`, Context or Zustand are simpler."*

---

<a name="cheatsheet"></a>
# 11. Cheat Sheet

```
useEffect+fetch lacks: cache · dedupe · background refresh · retries · focus refetch · optimistic
"a library shelf, not buying the book every time"

TANSTACK QUERY v5
QueryClientProvider · useQuery({ queryKey, queryFn, enabled, select, staleTime })
queryKey = identity: ['users', id] · same key = shared + deduped · key change = refetch · hierarchical
isPending (no data, was isLoading) · isFetching (background) · isError/error · throw on !res.ok
staleTime (fresh window, default 0) vs gcTime (unused retention, default 5m, was cacheTime)
useMutation({ mutationFn, onSuccess: invalidateQueries }) · setQueryData · mutateAsync
OPTIMISTIC: onMutate cancel → snapshot → setQueryData → return ctx · onError rollback · onSettled invalidate
placeholderData: keepPreviousData (pagination) · useInfiniteQuery(initialPageParam, getNextPageParam)
prefetchQuery on hover/loader · useSuspenseQuery · DevTools

REDUX TOOLKIT: createSlice (Immer "mutations") → actions + reducer · configureStore
useSelector(narrow!) · createSelector for derived · createAsyncThunk
RTK QUERY: createApi + endpoints · providesTags / invalidatesTags · generated hooks

CHOOSE: server data → Query · local → useState · small shared → Context/Zustand · big shared → RTK · filters → URL
```

---

## Connects to

- **[Part 11 — State management](11-state-management.md):** the server-state vs client-state framework this part implements.
- **[Part 12 — Async JavaScript](12-async-javascript.md):** what the library is doing for you (race conditions, retries, AbortController).
- **[Part 15 — Routing](15-routing-react-router.md):** prefetching in loaders.
- **[Part 18 — Testing](18-testing.md):** testing components that use queries (fresh `QueryClient` per test, MSW).

## Suggested next topics

1. **Testing** — RTL + MSW for components that fetch.
2. **TypeScript with React** — typing queries and selectors.
