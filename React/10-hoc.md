# React Study Notes — Part 10

## Higher Order Components (HOC)

> **Format:** Explanation-led notes. Each idea is explained in prose first — what it is, why it exists, what it costs — with code used only to illustrate a point that words alone can't carry.
>
> **Roadmap:** the roadmap's "Part 9 — Higher Order Components".
>
> **Continues:** [Part 2 — Components](02-components.md) · [Part 7 — Hooks](07-hooks.md) · [Part 8 — Rendering Internals](08-rendering-internals-and-vdom.md).

---

## Table of Contents

1. [What is a HOC?](#what)
2. [Why use a HOC?](#why)
3. [How it works](#how)
4. [Authentication HOC](#auth)
5. [Logging HOC](#logging)
6. [Permission HOC](#permission)
7. [Loading HOC](#loading)
8. [Real-world examples](#realworld)
9. [HOC vs Hooks](#vs-hooks)
10. [HOC vs Render Props](#vs-render-props)
11. [Conventions & pitfalls](#conventions)
12. [Interview questions & answers](#interview)
13. [Quick revision cheat sheet](#cheatsheet)

---

<a name="what"></a>
# 1. What is a HOC?

> **Definition:** a Higher Order Component is a function that takes a component as an argument and returns a new component with additional props, behaviour, or rendering wrapped around it.

The most important thing to understand before anything else is a categorical one: **a HOC is a function, not a component.** This trips up almost everyone learning the pattern, because the name contains the word "component." You never render a HOC. You *call* it, and what it hands back is the thing you render.

The name comes from an ordinary JavaScript idea you have already used many times. A **higher-order function** is a function that takes a function and returns a function — `map`, `filter`, and every decorator you've ever written work this way. A Higher Order Component is exactly that idea moved up one level of abstraction: instead of operating on functions, it operates on components. And because in modern React a component *is* just a function, the two are structurally identical. `withLogging(add)` and `withLogging(Button)` have the same shape; only what's being wrapped differs.

This leads to the second thing worth internalising: **HOCs are not a React feature.** There is no `React.hoc()`, no special syntax, nothing in the library that knows about them. The pattern is simply what falls out of the fact that components are ordinary values in JavaScript — they can be passed to functions, stored in variables, and returned. React never had to add support for HOCs because there was nothing to add. The community discovered the pattern, gave it a name, and it became a convention.

Every HOC does three things, and the third is what gives the pattern its power. It **takes a component**. It **returns a new component** — a different function, which React will treat as a distinct component type. And inside that new component, it **renders the original**, typically passing along everything it received plus whatever the HOC itself computed.

That last step is where the behaviour gets injected. The wrapper does some work — checks authentication, subscribes to a store, tracks a page view — and then hands the results down as props to the component it was given. The wrapped component receives ordinary props and has no idea a wrapper exists.

One constraint is absolute: **a HOC must never modify the component it receives.** Adding a method to it, changing its prototype, or reassigning anything on it would affect every other place that component is used, including places that never asked for the HOC's behaviour. A HOC is a *pure function of a component* — it takes one in and produces a new one, leaving the input untouched. This is the same discipline as immutable state updates, applied to components.

---

<a name="why"></a>
# 2. Why use a HOC?

## The problem: logic that repeats across unrelated components

The situation that motivates HOCs is specific, and recognising it matters more than memorising the syntax. It arises when several components — which otherwise have nothing to do with each other — all need the same *behaviour*, not the same *appearance*.

Consider three pages that must be behind a login: a dashboard, a settings page, and a profile page. Each needs to check whether a user is authenticated, redirect if not, and render normally if so. They share no markup, no data, no visual relationship. What they share is a **rule**.

Written naively, that rule gets copy-pasted into all three:

```jsx
function Dashboard() {
  const user = getUser();
  if (!user) return <Navigate to="/login" />;      // ← the same three lines
  return <div>Dashboard</div>;                     //   in every protected page
}
```

The immediate cost is maintenance: change the redirect path and you edit three files. The real cost is worse. Add a fourth protected page six months later and someone forgets the check entirely — and now there's a security-shaped hole that no test catches, because nothing is broken, something is merely *absent*.

## Why the obvious solutions don't work

The instinct is to extract the logic into a component. But that doesn't fit, because this logic isn't UI you *insert* into a page — it's a decision about **whether the page renders at all**, plus data the page then consumes. A regular component can render children conditionally, but you'd have to wrap every usage by hand at every call site, which is the same duplication wearing a different costume.

The second instinct — extract it into a plain function — is the right shape, but **before hooks it was impossible.** The logic involves state (the current user) and lifecycle (subscribing to auth changes, cleaning up on unmount), and until React 16.8, only class components could hold either. There was no mechanism for putting "subscribe to the auth store and re-render when it changes" into a function you could call from anywhere.

That constraint is the entire historical reason HOCs exist. If you want to understand the pattern rather than just use it, hold onto this: **HOCs were the answer to "how do I reuse stateful logic when only classes can have state?"** The answer was to put the state in a wrapper class and let it feed a simple component underneath.

## What the pattern gives you

With a HOC, the rule is written once and applied by composition:

```jsx
const Dashboard = withAuth(DashboardPage);
const Settings  = withAuth(SettingsPage);
const Profile   = withAuth(ProfilePage);
```

Three consequences follow. **The logic exists in exactly one place**, so changing it changes every consumer. **The pages know nothing about authentication** — `DashboardPage` is a plain component that receives a `user` prop, which makes it trivially testable and reusable in contexts where auth doesn't apply. And **applying the rule is a visible, deliberate act** — you can grep for `withAuth` and see every protected page, which you cannot do with three lines scattered inside function bodies.

The category of problem HOCs address has a name: **cross-cutting concerns**. These are behaviours that cut *across* the natural structure of an application rather than living inside any one part of it — authentication, permissions, logging, analytics, theming, internationalisation, error handling. They don't belong to the dashboard or the settings page; they apply to many things that are otherwise unrelated.

> **The mental model that helps most:** a HOC is a **decorator**, in the same sense as middleware around a request handler. The handler stays focused on its job; the middleware wraps it and handles the concern surrounding it. Nothing about the handler changes to accommodate the middleware.

---

<a name="how"></a>
# 3. How it works

## The anatomy

Every HOC has the same four-part skeleton, and each part has a reason:

```jsx
function withExtraProps(WrappedComponent) {          // ① takes a component
  return function Enhanced(props) {                  // ② returns a NEW component
    const extra = useSomething();                    // ③ does its own work

    return <WrappedComponent {...props} extra={extra} />;   // ④ renders the original
  };
}
```

Step ① is the input — note that it's the component *itself*, the function, not an element. You pass `Profile`, never `<Profile />`. Step ② is what makes this a HOC rather than a helper: it produces a genuinely new component that React will mount, render, and manage like any other. Step ③ is where the shared behaviour lives — this is the code you were trying to avoid duplicating. Step ④ is where everything comes together, and it deserves close attention because two separate things happen on that one line.

The `{...props}` spread **passes through** everything the caller supplied. This is easy to forget and produces a confusing bug when you do: the wrapped component silently receives none of its props, so it renders with `undefined` everywhere and no error explains why. The `extra={extra}` **injects** what the HOC computed. Together they mean the wrapped component sees a merged set of props — its own, plus the HOC's contribution — and can't tell which came from where.

## What actually happens in the component tree

This is the structural fact that determines both the power and the eventual downfall of the pattern.

```
what you render          what React sees
──────────────────────────────────────────
<EnhancedProfile />  →   <WithAuth>            ← the HOC's wrapper component
                            └── <Profile />    ← your original, receiving props
```

**A HOC adds a real component to the tree.** It's not a compile-time transformation or a syntactic trick — the wrapper is a component that mounts, renders, holds state, and appears in React DevTools. One HOC means one extra layer. Three HOCs mean three extra layers, each of which renders before the component you actually care about.

For a single HOC this is unremarkable. The consequences compound, and §9 covers what happens when they do.

## Rule 1 — call HOCs at module scope, never during render

This is the most common and most damaging mistake with the pattern, and it's worth understanding *why* it's wrong rather than just remembering that it is.

```jsx
// ❌ a NEW component type on every render
function App() {
  const Enhanced = withAuth(Profile);
  return <Enhanced />;
}
```

Recall from [Part 8](08-rendering-internals-and-vdom.md) that reconciliation's first rule is: **if an element's type differs from the previous render, destroy the entire old subtree and build a new one.** React doesn't look for similarities across a type change.

A HOC returns a *new function object* every time it's called. Calling it inside `App` means every render of `App` produces a different function, which React reads as a different component type. So on every single render, React unmounts the entire subtree and mounts a fresh one — state resets, effects re-run their cleanups and setups, data refetches, focus is lost, and any animation restarts.

The symptom is bizarre and hard to trace: a form that clears itself while you type, or a request that fires in an endless loop. Nothing in the code looks wrong. The fix is simply to call the HOC once, where the module loads:

```jsx
const Enhanced = withAuth(Profile);      // ✅ created once
function App() { return <Enhanced />; }
```

This is the same rule, for the same reason, as declaring `React.lazy()` at module scope.

## Rule 2 — always spread the props through

Covered above, but stated separately because it's the other half of the two things you must not forget. If you write `<WrappedComponent extra={extra} />` without the spread, everything the caller passed evaporates.

## Composing several HOCs

Because a HOC takes a component and returns a component, its output is valid input to another HOC. That composability is genuinely elegant:

```jsx
const Enhanced = withAuth(withLogging(withTheme(Dashboard)));
```

It reads inside-out — `withTheme` is applied first and ends up innermost; `withAuth` is applied last and ends up outermost. That inversion is confusing enough that most codebases introduce a `compose` helper, which flattens the nesting and lets you read the list in order.

**Order is not cosmetic.** `withAuth(withLoading(X))` checks authentication first and loading second; reverse them and you might show a loading spinner to a user who should have been redirected to the login page. When HOCs each control whether rendering proceeds, the sequence determines the logic.

---

<a name="auth"></a>
# 4. Authentication HOC

Authentication is the canonical HOC example because it demonstrates the pattern's core value clearly: it's a rule, it applies to many unrelated components, and it decides whether a component renders at all.

The behaviour has three distinct states, and handling all three is what makes a real implementation more than a one-line check. While the auth status is still being determined — typically an async call on page load — the component must render neither the protected content nor the redirect. If the user is unauthenticated, it redirects and renders nothing. Only in the third case does the wrapped component render, with the user injected as a prop.

```jsx
function withAuth(WrappedComponent) {
  return function WithAuth(props) {
    const { user, loading } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
      if (!loading && !user) navigate("/login");
    }, [user, loading, navigate]);

    if (loading) return <Spinner />;      // still checking — don't decide yet
    if (!user)   return null;             // redirecting — render nothing
    return <WrappedComponent {...props} user={user} />;
  };
}
```

**The `loading` guard is the detail most implementations get wrong.** Without it, the logic sees `user === null` during the brief window before the session resolves, concludes the user is logged out, and redirects. The visible effect is that refreshing any protected page flashes the login screen for a moment before bouncing back — a bug users notice immediately and developers often can't reproduce on a fast local machine.

What this achieves is worth stating plainly: `Dashboard` contains no authentication code whatsoever. It receives a `user` prop and renders. It can be tested by passing a fake user, rendered in Storybook without an auth provider, and reused in a context where the auth rule differs — all because the concern was moved outside it.

## The class-era version, and why it matters

Seeing the original form makes the historical motivation concrete:

```jsx
function withAuth(WrappedComponent) {
  return class extends React.Component {
    state = { user: null, loading: true };

    componentDidMount() {
      authService.getUser().then(user => this.setState({ user, loading: false }));
    }

    render() {
      if (this.state.loading) return <Spinner />;
      if (!this.state.user) return <Redirect to="/login" />;
      return <WrappedComponent {...this.props} user={this.state.user} />;
    }
  };
}
```

The wrapper is a **class**, because it needs state and `componentDidMount`. The wrapped component stays a simple function. That division of labour — state in the wrapper, presentation in the wrapped component — is the entire reason the pattern existed. Before hooks, this was the *only* way to give many function components access to shared stateful logic without turning each of them into a class.

---

<a name="logging"></a>
# 5. Logging HOC

Logging and analytics are a natural fit for the pattern because the requirement is identical everywhere and genuinely orthogonal to what any component does. Twenty pages need "record a page view when this mounts," differing only in a label. None of them should contain analytics code — that's someone else's concern leaking into your product logic.

```jsx
function withLogging(WrappedComponent, label) {
  const name = label || WrappedComponent.displayName || WrappedComponent.name || "Component";

  return function WithLogging(props) {
    useEffect(() => {
      const start = performance.now();
      console.log(`[${name}] mounted`, props);
      return () => console.log(`[${name}] unmounted after ${(performance.now() - start).toFixed(0)}ms`);
    }, []);

    return <WrappedComponent {...props} />;
  };
}
```

Two aspects are worth noting beyond the logging itself.

**This HOC takes a second argument.** A HOC is an ordinary function, so nothing stops it accepting configuration alongside the component. This is extremely common in practice — most real HOCs are parameterised, because the behaviour is shared but the details differ per usage.

**The fallback chain for the name** (`label` → `displayName` → `name` → `"Component"`) exists because a wrapped component might itself be a wrapper, and anonymous arrow-function components have no `name` at all. Without a deliberate fallback, your logs fill with `undefined`, which defeats the purpose of logging.

The analytics variant is structurally identical and simply does something more useful than writing to the console — tracking a page view, starting a session timer, or reporting time-on-page when the component unmounts. The important observation is that the *shape* is the same: mount, do something, clean up on unmount, and pass everything through untouched.

---

<a name="permission"></a>
# 6. Permission HOC

Permissions are authentication at a finer granularity. Authentication asks "who are you"; permissions ask "are you allowed to do this specific thing." The structure is nearly identical, which is exactly why the two compose so naturally.

```jsx
function withPermission(WrappedComponent, requiredPermission) {
  return function WithPermission(props) {
    const { permissions, loading } = useAuth();

    if (loading) return <Spinner />;
    if (!permissions.includes(requiredPermission)) {
      return <AccessDenied required={requiredPermission} />;
    }
    return <WrappedComponent {...props} />;
  };
}
```

Notice that the failure case here **renders a different component** rather than redirecting. That distinction matters for the HOC-versus-hooks discussion later: a hook cannot do this. A hook runs *inside* a component and can influence what that component renders, but it cannot decide that a completely different component should render in its place. Only a wrapper has that authority.

## The two calling conventions

Because `withPermission` needs both a component and configuration, it can be written in two forms. The direct form takes both at once — simple to read, awkward to compose. The **curried** form takes configuration first and returns a function awaiting the component:

```jsx
withPermission("admin:read")(Dashboard)
```

The curried form looks stranger but exists for a practical reason: it works with `compose`. Because each curried call produces a function of exactly one argument — a component — you can chain them without nesting. This is why `connect(mapState)(Component)` from React-Redux is shaped the way it is, and why library HOCs so often have that double-call signature. It isn't gratuitous functional-programming style; it's what makes composition readable.

## ⚠️ The security caveat interviewers look for

**A client-side permission check is a user-experience feature, not a security boundary.** Every byte of your JavaScript runs on a machine the user controls. They can open DevTools, modify the permissions array, and render the admin panel. There is no version of this that is secure.

What the HOC actually provides is that users don't see controls they can't use, don't click buttons that will fail, and get a clear "access denied" message instead of a confusing error. **Every permission must also be enforced on the server**, where the user cannot reach it. The HOC hides the button; the API must reject the request.

---

<a name="loading"></a>
# 7. Loading HOC

Almost every data-driven component needs the same branching: show a spinner while loading, show an error if the request failed, show an empty state if there's no data, and only then render the real content. That's four `if` statements repeated in every list, table, and detail view in the application.

```jsx
function withLoading(WrappedComponent) {
  return function WithLoading({ isLoading, ...props }) {
    if (isLoading) return <Spinner />;
    return <WrappedComponent {...props} />;      // isLoading is NOT passed down
  };
}
```

The destructuring in the parameter list is deliberate and worth explaining, because it's a small technique that appears throughout well-written HOCs. By pulling `isLoading` out and spreading only the rest, the HOC **consumes** that prop — it uses it and removes it from what continues downward. The wrapped component never receives `isLoading`, which is correct: it has no business knowing about a loading state it doesn't manage. This keeps the wrapped component's prop interface clean and prevents an unused prop from ending up on a DOM element.

Extended to handle all four states, the same HOC removes a genuine amount of repetition:

```jsx
function withAsyncStates(WrappedComponent, { Loading = Spinner, Error = ErrorMessage } = {}) {
  return function WithAsyncStates({ isLoading, error, data, ...props }) {
    if (isLoading) return <Loading />;
    if (error)     return <Error error={error} />;
    if (!data)     return <EmptyState />;
    return <WrappedComponent data={data} {...props} />;
  };
}
```

This is a genuinely strong use of the pattern for three reasons. The logic is identical everywhere, so there's nothing to customise per component. It's pure branching with no UI opinions of its own — the fallback components are injectable. And it removes boilerplate from every consumer without them having to know it exists.

A related pre-hooks pattern went further and put the *fetching itself* inside the HOC — a `withData(Component, url)` that performed the request, managed loading and error state, and injected the result. This is precisely what `connect()` did for Redux and what pre-hooks data libraries did for HTTP. It's also precisely what `useQuery` replaced, which is a useful preview of the next two sections.

---

<a name="realworld"></a>
# 8. Real-world examples

You have almost certainly used HOCs without labelling them as such:

| HOC | From | What it injects |
|---|---|---|
| `connect(mapState, mapDispatch)(C)` | React-Redux (legacy) | store state + dispatch as props |
| `withRouter(C)` | React Router v5 | `history`, `location`, `match` |
| `withStyles(styles)(C)` | Material-UI v4 | a `classes` prop |
| `withTranslation()(C)` | react-i18next | a `t` translation function |
| `withApollo(C)` | Apollo Client (legacy) | the GraphQL client |
| `React.memo(C)` | **React itself** | memoized re-render behaviour |
| `React.forwardRef(C)` | **React itself** | ref forwarding |

Two observations about this list carry more weight than the list itself.

**The last two entries are HOCs built into React.** `React.memo` takes a component and returns an enhanced component — that is the definition, exactly. So does `forwardRef`. Anyone who has memoized a component has written a HOC without thinking of it that way, and this is a good answer to give when an interviewer asks whether you've used the pattern.

**Every other entry says "legacy" or has been superseded.** `connect` became `useSelector` and `useDispatch`. `withRouter` became `useNavigate` and `useParams`. `withTranslation` became `useTranslation`. `withApollo` became `useQuery`. `withStyles` became `useTheme` and styled APIs.

That migration is not a coincidence or a fashion. Every one of those libraries independently concluded that a hook served their users better than a HOC, and they all made the change within a couple of years of hooks shipping. Understanding *why* they all reached the same conclusion is the substance of the next section — and it's a much better interview answer than "hooks are more modern."

---

<a name="vs-hooks"></a>
# 9. HOC vs Hooks

## Problem 1 — wrapper hell

Every HOC adds a real component to the tree. That cost is invisible with one and unbearable with five. Real production code from the pre-hooks era routinely looked like this:

```jsx
export default withRouter(connect(mapStateToProps)(withStyles(styles)(withTranslation()(withAuth(Dashboard)))));
```

Which produces a DevTools tree where your actual component is buried six levels deep beneath wrappers whose names are themselves nested function-call strings. Debugging means scrolling past all of them to find the one component that renders anything. Each layer is also a real render pass, so the cost isn't purely cosmetic — though the readability damage is by far the bigger problem.

## Problem 2 — prop collisions, silent and untraceable

This is the most insidious flaw, because it produces no error at all.

```jsx
const Enhanced = withAuth(withUserData(Profile));
// withAuth injects      user={authUser}
// withUserData injects  user={profileUser}
// → one silently overwrites the other
```

Both HOCs believe they own the prop name `user`. One wins based on the order of composition, and nothing anywhere reports the conflict — no warning, no type error, no runtime failure. The component simply receives the wrong user and behaves subtly incorrectly. Finding this requires reading the source of every HOC in the chain.

Hooks make the problem structurally impossible, because **you name the values yourself at the point of use**:

```jsx
const { user: authUser } = useAuth();
const { user: profileUser } = useUserData();
```

There is nowhere for a collision to hide, because there is no shared namespace being written into.

## Problem 3 — the origin of props is invisible

Look at a component signature from a heavily-HOC'd codebase and ask where each prop comes from:

```jsx
function Dashboard({ user, t, classes, history, dispatch, data, isLoading }) { ... }
```

You cannot tell. Some are passed by the parent; others are injected by wrappers several files away. Answering the question means finding the export statement, reading the composition chain, and opening each HOC to see what it provides. With hooks, every value's origin is on the line that produced it — the call site *is* the documentation.

## Problem 4 — statics and refs are lost

A HOC returns a new function, so anything attached to the original component doesn't come along:

```jsx
Page.getInitialProps = () => {...};
const Enhanced = withAuth(Page);
Enhanced.getInitialProps    // undefined
```

The standard fix is the `hoist-non-react-statics` package, which copies non-React statics onto the wrapper. Refs have a parallel problem — `ref` isn't a normal prop, so it attaches to the wrapper rather than the wrapped component unless the HOC explicitly plumbs it through with `forwardRef`. Both are boilerplate that every well-written HOC must include and that hooks never need, because hooks don't wrap anything.

There's a fifth problem worth mentioning briefly: **HOCs are notoriously difficult to type in TypeScript**, because you're expressing "this returns a component whose props are the original's props minus the ones I inject, plus any I require." That type is genuinely hard to write and harder to read. Hooks are trivial by comparison — a function with a return type.

## The same logic, both ways

Comparing the two implementations side by side makes the difference concrete. The HOC version wraps `DashboardPage` from outside and hands it a `user` prop. The hook version is called from inside `Dashboard` and returns the values directly, leaving the component in control of what happens next:

```jsx
function useRequireAuth() {
  const { user, loading } = useAuthState();
  const navigate = useNavigate();
  useEffect(() => { if (!loading && !user) navigate("/login"); }, [user, loading]);
  return { user, loading };
}

function Dashboard() {
  const { user, loading } = useRequireAuth();
  if (loading) return <Spinner />;
  return <div>Welcome {user.name}</div>;
}
```

No wrapper component exists. The values have names the component chose. Someone reading `Dashboard` can see in one line that it requires authentication.

## The comparison

| | **HOC** | **Custom Hook** |
|---|---|---|
| Adds components to the tree | ✅ yes | ❌ no |
| Prop name collisions | possible, silent | impossible — you name variables |
| Where values come from | opaque | visible at the call site |
| Composing several | nesting / `compose` | sequential lines |
| Static methods | lost (needs hoisting) | unaffected |
| Refs | need `forwardRef` plumbing | unaffected |
| TypeScript | notoriously hard to type | straightforward |
| Can conditionally render / wrap | ✅ **yes** | ❌ no |
| Works with class components | ✅ **yes** | ❌ no |

## When a HOC is still the right answer

Hooks won decisively, but not universally, and knowing the exceptions separates a memorised answer from an understood one.

**A hook cannot decide whether a component renders, or wrap it in anything.** This is the fundamental limitation, and it follows directly from where a hook executes. A hook runs *inside* a component's body — by the time it runs, that component is already rendering. It can influence the return value, but it cannot replace the component with a different one, and it cannot place the component inside an error boundary, a provider, or any surrounding markup. Only something *outside* the component can do that:

```jsx
function withErrorBoundary(Component, Fallback) {
  return function (props) {
    return (
      <ErrorBoundary fallback={<Fallback />}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}
```

No hook can express this, and no hook ever will, because it requires wrapping.

**Class components cannot use hooks.** In a legacy codebase with class components that need shared logic, a HOC remains the only mechanism available.

And of course the two HOCs built into React — `React.memo` and `forwardRef` — remain in daily use, because both are inherently about wrapping.

```
Need to inject BEHAVIOUR or DATA into a component     → custom hook
Need to WRAP a component in other markup/logic        → HOC
Need to conditionally render a DIFFERENT component    → HOC
Working with class components                         → HOC
Everything else                                       → custom hook
```

---

<a name="vs-render-props"></a>
# 10. HOC vs Render Props

Render props were the other pre-hooks answer to the same question, and the two patterns were genuine rivals for several years. Understanding the difference between them illuminates why hooks superseded both.

> **Render prop** — a pattern where a component receives a function as a prop and calls it to determine what to render, passing its internal state as arguments.

The mechanism inverts the HOC's direction. Instead of a wrapper handing props *down* to a fixed component, a component holding some state calls a function you gave it and hands the state *back* to you, letting you decide what to render with it:

```jsx
function MouseTracker({ children }) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  // ... subscribe to mousemove
  return children(pos);            // hand the state BACK to the caller
}

<MouseTracker>{({ x, y }) => <p>{x}, {y}</p>}</MouseTracker>
```

## The structural difference that explains everything else

**A HOC composes at definition time.** You call `withMouse(Component)` once, when the module loads, and the relationship is fixed from then on. The HOC cannot see the props the component will eventually receive, because it ran long before any rendering happened.

**A render prop composes at render time.** The function is called during rendering, inside JSX, which means the sharing logic has access to everything available at that moment — props, state, other context. It's dynamic in a way HOCs structurally cannot be.

From that single distinction, every other difference follows. Because you write the callback's parameter names yourself, **collisions are impossible** — the same reason hooks avoid them. Because the data flow is visible right there in the JSX, **there's no mystery about where values come from**. And because the composition is dynamic, the shared logic **can depend on runtime values**.

## Render props' fatal flaw

The problem appears the moment you need more than one:

```jsx
<MouseTracker>
  {mouse => (
    <ThemeProvider>
      {theme => (
        <UserData>
          {user => (
            <ActualComponent mouse={mouse} theme={theme} user={user} />
          )}
        </UserData>
      )}
    </ThemeProvider>
  )}
</MouseTracker>
```

Three shared concerns, and the component that actually does something is buried six levels deep in a pyramid of callbacks. This became known as **callback hell** or the **pyramid of doom**, and it's the mirror image of the HOC problem: HOCs produced wrapper hell in the *component tree*, render props produced callback hell in the *JSX*. Neither pattern degraded gracefully as the number of concerns grew.

## How hooks resolved both

```jsx
function Component() {
  const mouse = useMouse();
  const theme = useTheme();
  const user  = useUser();
}
```

Flat, named, no wrappers, no nesting, no pyramid, no collisions. Three lines, and adding a fourth concern adds a fourth line rather than another level of indentation or another wrapper component.

This is the clearest possible illustration of what hooks actually contributed. Both earlier patterns solved logic reuse **by adding structure** — a wrapper component in one case, a nested callback in the other. Hooks solved it by adding **no structure at all**. The logic is shared through an ordinary function call, and the component tree is unchanged.

| | **HOC** | **Render Props** | **Hooks** |
|---|---|---|---|
| Composed at | definition time | render time | render time |
| Prop collisions | ✅ possible, silent | ❌ impossible | ❌ impossible |
| Where data comes from | opaque | obvious | obvious |
| Logic can use props | ❌ no | ✅ yes | ✅ yes |
| Multiple concerns | wrapper hell (tree) | callback hell (JSX) | flat lines |
| Adds to the tree | ✅ yes | ✅ yes | ❌ **no** |

---

<a name="conventions"></a>
# 11. Conventions & pitfalls

## Naming and display names

By convention a HOC is named `withSomething` — `withAuth`, `withRouter`, `withStyles`. The prefix signals at a glance that this is a function taking a component, not a component itself.

Setting a `displayName` on the returned component is not optional in practice. React derives DevTools names from the function name, and a HOC's inner function is often anonymous or generically named, so without an explicit `displayName` your tree fills with `Unknown` and `Anonymous` entries. Since the whole point of DevTools is understanding structure, and HOCs *add* structure, omitting this actively works against you:

```jsx
WithAuth.displayName = `withAuth(${WrappedComponent.displayName || WrappedComponent.name || "Component"})`;
```

The convention of nesting the wrapped name inside the HOC name is what produces those long `withRouter(Connect(Dashboard))` labels — verbose, but they tell you exactly what was applied and in what order.

## Hoisting statics and forwarding refs

Both were explained in §9 as flaws; here they are as obligations. If your HOC will be applied to components that carry static methods, copy them with `hoist-non-react-statics`. If it will be applied to components a parent needs a ref to, wrap the returned component in `forwardRef` and pass the ref down. Neither is automatic, and omitting them produces failures that appear far from the HOC itself.

## The pitfall list

```
❌ calling a HOC inside render          → new type each render → remount + state loss
❌ forgetting {...props}                → the wrapped component loses its props
❌ no displayName                       → undebuggable DevTools tree
❌ mutating the wrapped component       → breaks it everywhere else
❌ prop name collisions                 → silent, no warning
❌ not hoisting statics                 → getInitialProps and friends disappear
❌ not forwarding refs                  → parents can't reach the DOM node
❌ over-composing                       → 5 wrappers around 1 component
```

---

<a name="interview"></a>
# 12. Interview questions & answers

### Q: "What is a Higher Order Component?"
> *"A function that takes a component and returns a new component with added behaviour or props. It's the component-level version of a higher-order function, and it isn't a React API — it's a pattern that emerges from components being ordinary functions. The classic examples are `connect` from React-Redux and `withRouter` from React Router, and `React.memo` and `forwardRef` are HOCs built into React itself."*

### Q: "What problem do HOCs solve?"
> *"Sharing cross-cutting logic across unrelated components — authentication, permissions, logging, theming, data fetching. Before hooks, stateful logic could only live in classes, so there was no way to extract 'subscribe to the auth store and re-render' into a plain function. A HOC let you write it once in a wrapper and apply it to any component without touching that component's source."*

### Q: "How do you write one?"
> *"Take a component, return a new component that renders the original with extra props. Two things are mandatory: spread the incoming props through, or the wrapped component loses them; and call the HOC at module scope, never inside render — calling it during render creates a new component type each time, so React unmounts and remounts the subtree and all state is lost."*

### Q: "Why is calling a HOC inside a component a bug?"
> *"Because reconciliation compares element types. A HOC returns a new function every call, so calling it during render produces a different type each render. React sees a type change, destroys the entire subtree and mounts a fresh one — state resets, effects re-run, data refetches. It's the same reason `React.lazy` must be declared at module scope."*

### Q: "What are the downsides of HOCs?"
> *"Four main ones. Wrapper hell — each HOC adds a real component, so a few of them bury your component under five layers in DevTools. Silent prop-name collisions, where two HOCs inject the same prop name and one overwrites the other with no warning. Opaque prop origins — the component signature doesn't tell you where anything came from. And lost static methods and refs, which need `hoist-non-react-statics` and `forwardRef` plumbing. They're also notoriously hard to type in TypeScript."*

### Q: "HOCs vs custom hooks?"
> *"Hooks are the modern default. They share logic without adding anything to the tree, you name the returned values yourself so collisions are impossible, and the origin of every value is visible at the call site. That's why every major library migrated — `connect` became `useSelector`, `withRouter` became `useNavigate`, `withTranslation` became `useTranslation`. HOCs remain right when you need to wrap a component rather than augment it — putting it inside an error boundary, or conditionally rendering a different component entirely — and for class components, which can't use hooks."*

### Q: "Is there anything a HOC can do that a hook can't?"
> *"Yes. A hook runs inside a component, so by the time it executes that component is already rendering — it can't decide the component shouldn't render at all, replace it with a different component, or wrap it in surrounding markup like an error boundary or a provider. Only something outside the component can do that. And hooks don't work in class components."*

### Q: "What are render props, and how do they compare?"
> *"A component that takes a function as a prop — often `children` — and calls it with its internal state, letting the caller decide what to render. Compared to HOCs, composition happens at render time rather than definition time, which means no prop collisions and an obvious data flow, and the sharing logic can depend on props. The downside is that combining several produces deeply nested JSX — callback hell — where HOCs produce nested wrapper components. Both patterns solved reuse by adding structure; hooks solved it by adding none."*

### Q: "Are `React.memo` and `forwardRef` HOCs?"
> *"Yes — both take a component and return an enhanced component. `React.memo` adds a shallow props comparison to skip re-renders; `forwardRef` lets a ref pass through to an inner node. They're the two HOCs almost everyone uses without thinking of them as HOCs."*

### Q: "Is a `withPermission` HOC a security mechanism?"
> *"No — it's a UX mechanism. Everything on the client runs on a machine the user controls, so hiding a button doesn't protect the endpoint behind it. Every permission check has to be enforced server-side; the HOC just prevents users from seeing controls they can't use and gives them a clear message instead of a failed request."*

### Q: "How do you handle multiple HOCs cleanly?"
> *"A `compose` helper — `compose(withAuth, withLogging, withTheme)(Component)` — which flattens the nesting and reads in order. Order still matters: `withAuth(withLoading(X))` checks auth before loading, and reversing it could show a spinner to someone who should have been redirected to login. If I need more than two or three, that's usually a sign the logic should be custom hooks instead."*

---

<a name="cheatsheet"></a>
# 13. Quick revision cheat sheet

```
HOC             a FUNCTION that takes a component and returns a NEW component
                const Enhanced = withX(Component)
                NOT a React API — a pattern (components are just functions)
                the component-level version of a higher-order function
                must NOT mutate the input — it WRAPS it (pure fn of a component)

ANATOMY         ① take a component  ② return a NEW component
                ③ do its own work   ④ render the original with {...props} + extras

🔥 TWO RULES    1. call it at MODULE SCOPE, never inside render
                   inside render = a new component TYPE every render
                   → React remounts, state lost, effects re-run, data refetched
                   (same reason React.lazy must be at module scope)
                2. ALWAYS spread {...props} → or the component loses everything

TREE EFFECT     <Enhanced /> → <WithX> → <Wrapped />
                a HOC adds a REAL component to the tree ← the core cost

WHY IT EXISTS   cross-cutting concerns: auth · permissions · logging · analytics
                · theming · i18n · data fetching · loading states
                HISTORICAL REASON: pre-hooks, only CLASSES could hold state,
                so a wrapper class was the only way to share stateful logic

EXAMPLES        withAuth        loading → spinner · no user → redirect · else inject user
                                ⚠️ the LOADING guard prevents a login flash on refresh
                withLogging     mount/unmount/analytics; takes a config argument
                                name fallback: label → displayName → name → "Component"
                withPermission  role check → renders a DIFFERENT component (AccessDenied)
                                ⚠️ UX ONLY, NOT SECURITY — enforce on the server
                withLoading     destructures isLoading out → CONSUMES it, doesn't pass it
                                fuller: loading / error / empty / data

CALLING FORMS   withThing(Component, config)     direct — simpler to read
                withThing(config)(Component)     curried — each call takes ONE arg
                                                 → this is why it composes

COMPOSING       withAuth(withLogging(withTheme(C)))   — reads INSIDE-OUT
                compose(withAuth, withLogging)(C)     — flatter, reads in order
                ⚠️ ORDER MATTERS: auth before loading, or you spinner a logged-out user

REAL WORLD      connect()(C)          React-Redux  → useSelector/useDispatch
                withRouter(C)         Router v5    → useNavigate/useParams
                withStyles()(C)       MUI v4       → useTheme/styled
                withTranslation()(C)  i18next      → useTranslation
                withApollo(C)         Apollo       → useQuery
                React.memo(C)         React        ← STILL a HOC
                React.forwardRef(C)   React        ← STILL a HOC
                → every library HOC became a hook. That migration IS the verdict.

FOUR PROBLEMS   WRAPPER HELL       6 layers around 1 component in DevTools
                PROP COLLISIONS    two HOCs inject `user` → one silently wins,
                                   no error, no warning, wrong data
                OPAQUE ORIGINS     ({user, t, classes, history}) — from where?
                LOST STATICS/REFS  needs hoist-non-react-statics + forwardRef
                (+ TypeScript typing is genuinely painful)

HOC vs HOOKS    hooks: no tree changes · YOU name the values (no collisions)
                       · visible origin · flat composition · easy TS
                HOC still wins when you must:
                  · WRAP a component (error boundary, provider, markup)
                  · CONDITIONALLY render a DIFFERENT component
                  · support CLASS components
                WHY hooks can't: a hook runs INSIDE the component — by then it's
                already rendering, so it can't replace or wrap it
                RULE: inject data/behaviour → HOOK · wrap the component → HOC

RENDER PROPS    <Tracker>{data => <UI/>}</Tracker> — a function prop returning UI
                HOC          composes at DEFINITION time (static, can't see props)
                render prop  composes at RENDER time (dynamic, CAN use props)
                render props ✅ no collisions, obvious data flow
                             ❌ nesting several = CALLBACK HELL pyramid
                HOC = wrapper hell in the TREE · render props = hell in the JSX
                → BOTH solved reuse by ADDING STRUCTURE.
                  Hooks solved it by adding NONE.

CONVENTIONS     name it `withSomething`
                displayName = `withAuth(${Wrapped.displayName || Wrapped.name})`
                hoistNonReactStatics(WithX, Wrapped)
                forwardRef if the wrapped component needs a ref

PITFALLS        ❌ HOC inside render · ❌ forgetting {...props} · ❌ no displayName
                ❌ mutating the wrapped component · ❌ prop collisions
                ❌ statics not hoisted · ❌ refs not forwarded · ❌ 5-deep composition
```

---

## Connects to

- **[Part 7 — Hooks](07-hooks.md):** custom hooks are the modern replacement for almost every HOC; the "wrapper hell" HOCs caused is the problem hooks were designed to solve.
- **[Part 8 — Rendering Internals](08-rendering-internals-and-vdom.md):** why calling a HOC during render remounts the subtree — reconciliation's type-change rule.
- **[Part 2 — Components](02-components.md):** composition vs inheritance; a HOC is the "wrapping" composition technique.
- **[Part 9 — Performance](09-performance.md):** `React.memo` is itself a HOC.
- **[Part 6 — Lifecycle](06-lifecycle.md):** error boundaries — the clearest case where a HOC is still required.
- **Custom Hooks:** the pattern that replaced this one.
- **Design patterns:** render props, compound components, control props.

## Suggested next topics

1. **Custom Hooks** — recommended next; the direct successor to this pattern.
2. **React Patterns** — compound components, control props, provider pattern.
3. **State Management** — Context, Redux, Zustand.

*— End of Part 10: Higher Order Components —*
