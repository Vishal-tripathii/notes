# React Study Notes — Part 15

## Routing with React Router (v6 → v7, Nested Routes, Params, Loaders & Actions, Protected Routes, Lazy Routes)

> **Why this part exists:** almost every React app has more than one page, and React itself has no router. React Router is the most used one. Interviews ask about nested routes, params vs query strings, protected routes, and "how does it work without reloading the page?"
>
> **Versions:** React Router **v6** (2021) is in most existing code; **v6.4** (2022) added "data routers" with loaders/actions; **v7** (Nov 2024) merged in **Remix** and is imported from `react-router` (the old `react-router-dom` package still works and re-exports it). v7 is mostly backwards-compatible with v6 code.
>
> **Continues from:** [Part 1 §3](01-react-fundamentals.md) (SPA vs MPA) · [Part 9 §6](09-performance.md) (route-level code splitting) · QNA §15.

---

## Table of Contents

1. [How client-side routing works](#how)
2. [⭐ The basics: routes, links, navigation](#basics)
3. [⭐ Nested routes and `<Outlet>`](#nested)
4. [Params vs query strings](#params)
5. [⭐ Data routers: loaders & actions (v6.4+)](#data)
6. [⭐ Protected routes](#protected)
7. [Lazy routes, errors, and 404s](#lazy)
8. [The three modes of React Router v7, and alternatives](#v7)
9. [Interview Q&A](#interview)
10. [Cheat Sheet](#cheatsheet)

---

<a name="how"></a>
# 1. How client-side routing works

```
user clicks <Link to="/products/42">
→ React Router calls history.pushState → the URL changes, NO request to the server
→ the router matches "/products/42" against your routes
→ React renders <ProductPage /> in place of the old page
```

> **Analogy 📺 — changing the TV channel vs buying a new TV.** A normal link (MPA) gets a whole new page from the server. Client-side routing just changes what's on the same screen.

Two consequences:
- The **back button** works because the router listens to `popstate`.
- The **server must return `index.html` for every path** (an "SPA fallback"), or refreshing on `/products/42` gives a 404 ([Angular Part 31 §7](../Angular/31-configuration-and-app-startup.md) — same problem, same fix).

---

<a name="basics"></a>
# 2. ⭐ The basics: routes, links, navigation

```jsx
import { BrowserRouter, Routes, Route, Link, NavLink, useNavigate } from 'react-router';   // v6: 'react-router-dom'

function App() {
  return (
    <BrowserRouter>
      <nav>
        <NavLink to="/" end>Home</NavLink>                 {/* NavLink adds an "active" class */}
        <NavLink to="/products">Products</NavLink>
      </nav>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/:id" element={<ProductPage />} />
        <Route path="*" element={<NotFound />} />          {/* catch-all 404 */}
      </Routes>
    </BrowserRouter>
  );
}
```

**Navigating from code** (after a form submit, a login):

```jsx
const navigate = useNavigate();
navigate('/products/42');
navigate('/login', { replace: true });                 // replace history entry (no "back" to here)
navigate(-1);                                          // go back
navigate('/checkout', { state: { from: 'cart' } });   // pass data (read with useLocation().state)
```

- ⚠️ Use `<Link>` / `<NavLink>`, **not** `<a href>` — an `<a>` makes a full page reload and loses all state.
- ⚠️ Don't call `navigate()` during render — do it in an event handler or effect (or render `<Navigate to="…" />`).
- `BrowserRouter` = clean URLs (`/products/42`, needs server config). `HashRouter` = `/#/products/42` (works on any static host, uglier).

---

<a name="nested"></a>
# 3. ⭐ Nested routes and `<Outlet>`

Most apps have a **layout** (header, sidebar) that stays while the inner page changes:

```jsx
<Routes>
  <Route element={<AppLayout />}>                     {/* layout route — no path */}
    <Route index element={<Dashboard />} />           {/* "/" */}
    <Route path="products" element={<Products />}>
      <Route path=":id" element={<ProductDetails />} />   {/* "/products/42" */}
    </Route>
    <Route path="settings" element={<Settings />} />
  </Route>
  <Route path="/login" element={<Login />} />         {/* outside the layout */}
</Routes>
```

```jsx
function AppLayout() {
  return (
    <>
      <Header />
      <Sidebar />
      <main><Outlet /></main>          {/* the matched child route renders HERE */}
    </>
  );
}
```

- **`<Outlet />`** = "put the child route's page here."
- **`index`** route = what shows at the parent's exact path.
- The layout **stays mounted** while you move between its children — its state and effects aren't reset.
- Child paths are **relative** (`":id"`, not `"/products/:id"`).

> 🧠 **Remember:** **layout route + `<Outlet>` = a frame that stays, with a picture that changes.**

---

<a name="params"></a>
# 4. Params vs query strings

```jsx
// URL: /products/42?tab=reviews&page=2

const { id } = useParams();                         // "42" — always a STRING
const [searchParams, setSearchParams] = useSearchParams();
searchParams.get('tab');                            // "reviews"
setSearchParams({ tab: 'specs', page: '1' });       // updates the URL (and history)
```

| | Route param (`:id`) | Query string (`?tab=…`) |
|---|---|---|
| Identifies | **which** thing (product 42) | **how** to show it (tab, filters, sort, page) |
| Required? | yes, part of the path | optional |
| Example | `/users/:userId/orders/:orderId` | `?status=paid&sort=date` |

**Put UI state that should survive a refresh or be shareable in the URL** — filters, search terms, pagination, selected tab. Then the back button and copy-link work for free.

⚠️ Params are **strings**: `Number(id)` before using them as numbers, and validate them.

---

<a name="data"></a>
# 5. ⭐ Data routers: loaders & actions (v6.4+)

The classic way to load data is `useEffect` in each page — causing **waterfalls** (layout loads, then the page starts fetching, then a child starts fetching) and loading spinners everywhere. Data routers let each route declare **what data it needs**, loaded **before** (and in parallel with) rendering:

```jsx
import { createBrowserRouter, RouterProvider, useLoaderData, Form, redirect } from 'react-router';

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <ErrorPage />,                    // error boundary for this route tree
    children: [
      {
        path: 'products/:id',
        element: <ProductPage />,
        loader: async ({ params }) => {             // runs BEFORE the page renders
          const res = await fetch(`/api/products/${params.id}`);
          if (res.status === 404) throw new Response('Not found', { status: 404 });
          return res.json();
        },
        action: async ({ request, params }) => {    // runs when a <Form> on this route submits
          const formData = await request.formData();
          await fetch(`/api/products/${params.id}/reviews`, { method: 'POST', body: formData });
          return redirect(`/products/${params.id}`);
        },
      },
    ],
  },
]);

<RouterProvider router={router} />
```

```jsx
function ProductPage() {
  const product = useLoaderData();                  // the loader's result
  return (
    <>
      <h1>{product.name}</h1>
      <Form method="post">                          {/* submits to this route's action */}
        <textarea name="text" />
        <button>Add review</button>
      </Form>
    </>
  );
}
```

What you get:
- Loaders for **all matched routes run in parallel** → no waterfalls.
- After an action, the router **re-runs loaders automatically** so data is fresh.
- `useNavigation().state` (`'idle' | 'loading' | 'submitting'`) for global loading indicators.
- `useFetcher()` — call a loader/action **without navigating** (like-button, inline edit).
- Errors thrown in loaders/actions go to the route's `errorElement` (`useRouteError()` reads them).

Many teams combine loaders with **TanStack Query** (the loader prefetches into the query cache) — [Part 17](17-data-fetching-tanstack-query-and-redux-toolkit.md).

---

<a name="protected"></a>
# 6. ⭐ Protected routes

**Option A — a wrapper component** (works with any router setup):

```jsx
function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;   // remember where they were
  return children;
}

<Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
// or as a layout route wrapping many children: <Route element={<RequireAuth><Outlet /></RequireAuth>}>
```

After login: `navigate(location.state?.from?.pathname ?? '/', { replace: true })`.

**Option B — in a loader** (data routers), so the page's data isn't even fetched:

```jsx
loader: async () => {
  const user = await getUser();
  if (!user) throw redirect('/login');
  return loadDashboard();
}
```

⚠️ **This is UX, not security.** A user can open DevTools and call your API directly. The **server must check** authentication and permissions on every request ([nodejs Part 7](../nodejs/07-authentication-and-security.md)). Role-based UI (`{user.isAdmin && <AdminLink />}`) only hides doors that the server must keep locked anyway.

---

<a name="lazy"></a>
# 7. Lazy routes, errors, and 404s

**Load each page's code only when visited** — the biggest bundle-size win ([Part 9 §6](09-performance.md)):

```jsx
const Reports = lazy(() => import('./pages/Reports'));

<Route path="/reports" element={
  <Suspense fallback={<PageSpinner />}><Reports /></Suspense>
} />
```

Data routers also support a `lazy` property on the route itself (`lazy: () => import('./reports.route')`), which loads the component **and** its loader together.

- **Errors:** `errorElement` (data routers) catches errors from rendering, loaders and actions for that route subtree. For `<Routes>` setups, wrap pages in an error boundary ([Part 6 §5](06-lifecycle.md)).
- **404:** a `path="*"` route, plus `throw new Response('Not found', { status: 404 })` from loaders for missing records.
- **Scroll position:** `<ScrollRestoration />` (data routers) restores scroll on back/forward and scrolls to top on new pages.
- **Page title & focus:** set `document.title` per page (or React 19's `<title>`, [Part 13 §7](13-react-19-and-19-2.md)) and move focus to the new page's heading for screen-reader users ([Part 21](21-styling-and-accessibility.md)).

---

<a name="v7"></a>
# 8. The three modes of React Router v7, and alternatives

| Mode | Setup | Gives you |
|---|---|---|
| **Declarative** | `<BrowserRouter>` + `<Routes>` | basic routing — v6-style |
| **Data** | `createBrowserRouter` + `RouterProvider` | loaders, actions, `errorElement`, pending UI |
| **Framework** (Remix merged in) | Vite plugin, `routes.ts` / file-based routes | SSR, code splitting, type-safe loader data, server actions — a full framework like Next.js |

**Alternatives:** **TanStack Router** (fully type-safe routes and search params, built-in data loading); **Next.js App Router** (file-based, Server Components — [Part 14](14-server-components-and-nextjs.md)); **Wouter** (tiny).

---

<a name="interview"></a>
# 9. Interview Q&A

### Q: "How does client-side routing work?"
> *"The router intercepts navigation, updates the URL with the History API's `pushState` — no request for a new page — matches the path against the route config and renders the matching component. It listens to `popstate` so back and forward work. The server needs a fallback that returns `index.html` for every path, or refreshing a deep link 404s."*

### Q: "What are nested routes and `<Outlet>`?"
> *"Child routes render inside their parent's element at the `<Outlet />`. That gives persistent layouts — a header and sidebar that stay mounted while the inner page changes, keeping their state. An `index` route is what renders at the parent's exact path."*

### Q: "Route params vs query params?"
> *"Params are part of the path and identify which resource — `/products/:id`, read with `useParams`. Query params are optional and describe how to show it — filters, sort, page, tab — read and written with `useSearchParams`. I keep shareable UI state like filters in the query string so refresh, back and copy-link work. Both are strings."*

### Q: "What are loaders and actions?"
> *"In data routers, a loader fetches a route's data before it renders, and loaders for all matched routes run in parallel, which removes useEffect waterfalls. An action handles a `<Form>` submission for that route, after which loaders re-run automatically. Errors go to the route's `errorElement`."*

### Q: "How do you implement a protected route?"
> *"A wrapper component — or a layout route — that renders `<Navigate to='/login' replace>` with the current location in state when there's no user, and the children otherwise; or a loader that throws `redirect('/login')`. And it's only UX: the server must enforce authentication and authorisation on every request."*

### Q: "Why use `<Link>` instead of `<a href>`?"
> *"An `<a href>` makes the browser load a new page from the server, losing all React state and re-downloading the app. `<Link>` updates the URL client-side and just re-renders."*

---

<a name="cheatsheet"></a>
# 10. Cheat Sheet

```
CLIENT ROUTING: pushState (no server request) → match → render · popstate for back
"change the channel, don't buy a new TV" · server needs SPA fallback to index.html
v6: react-router-dom · v6.4: data routers · v7: import from 'react-router' (Remix merged)

<BrowserRouter><Routes><Route path element/></Routes> · path="*" = 404 · HashRouter = /#/ URLs
<Link>/<NavLink> not <a href> · useNavigate(): navigate(to, { replace, state }), navigate(-1)
no navigate() in render → <Navigate to="…" />

NESTED: layout route + <Outlet/> · index route · relative child paths · layout stays mounted
useParams() (strings!) = WHICH · useSearchParams() = HOW (filters/sort/page) → shareable state in URL

DATA ROUTERS: createBrowserRouter + RouterProvider
  loader (before render, parallel → no waterfalls) → useLoaderData()
  action (from <Form method="post">) → loaders re-run · redirect()
  errorElement + useRouteError · useNavigation().state · useFetcher (no navigation) · ScrollRestoration

PROTECTED: wrapper → <Navigate to="/login" replace state={{ from }} /> · or loader throw redirect()
  UX ONLY — server enforces auth
LAZY: lazy(() => import()) + <Suspense> per route · route.lazy in data routers
v7 modes: declarative · data · framework (SSR) · alternatives: TanStack Router, Next.js
```

---

## Connects to

- **[Part 9 — Performance](09-performance.md):** route-level code splitting and preloading.
- **[Part 14 — Server Components & Next.js](14-server-components-and-nextjs.md):** file-based routing in Next.js.
- **[Part 17 — Data fetching](17-data-fetching-tanstack-query-and-redux-toolkit.md):** loaders + TanStack Query.
- **[Part 16 — Forms](16-forms.md):** `<Form>` and actions.

## Suggested next topics

1. **Forms** — React Hook Form + zod.
2. **Data fetching** — TanStack Query.
