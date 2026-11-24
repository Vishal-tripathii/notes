# React Study Notes — Part 19

## TypeScript with React (Typing Props, children, Events, Hooks, Context, Refs, Generic Components, Extending HTML Props)

> **Why this part exists:** most React jobs at 3–4 years use TypeScript, and interviews check practical typing: "how do you type `children`?", "what's the type of an input's change event?", "how do you build a component that accepts all `<button>` props?" Language basics (generics, unions, utility types) are in [Angular Part 00](../Angular/00-typescript-for-angular.md) and [nodejs Part 14](../nodejs/14-typescript-with-node.md); this is the React-specific layer.
>
> **Continues from:** [Part 4 §9](04-props.md) (TypeScript vs PropTypes).

---

## Table of Contents

1. [Typing props](#props)
2. [⭐ `children` and other "renderable" types](#children)
3. [`React.FC` — and why many teams skip it](#fc)
4. [⭐ Events](#events)
5. [⭐ Hooks: `useState`, `useReducer`, `useRef`](#hooks)
6. [Context with a safe custom hook](#context)
7. [⭐ Extending native HTML props](#native)
8. [Generic components](#generic)
9. [Discriminated-union props](#unions)
10. [Typing custom hooks](#custom-hooks)
11. [Interview Q&A](#interview)
12. [Cheat Sheet](#cheatsheet)

---

<a name="props"></a>
# 1. Typing props

```tsx
type ButtonProps = {
  label: string;
  variant?: 'primary' | 'danger';        // optional, limited to these values
  disabled?: boolean;
  onClick: () => void;
};

export function Button({ label, variant = 'primary', disabled = false, onClick }: ButtonProps) {
  return <button className={variant} disabled={disabled} onClick={onClick}>{label}</button>;
}
```

- `type` or `interface` both work for props — pick one convention per codebase ([Angular Part 00 §2](../Angular/00-typescript-for-angular.md)).
- Defaults go in the **destructuring** (`variant = 'primary'`) — `defaultProps` is gone for function components in React 19 ([Part 4 §6](04-props.md)).
- Use **literal unions** (`'primary' | 'danger'`) instead of `string` — the compiler and autocomplete then know the allowed values.

---

<a name="children"></a>
# 2. ⭐ `children` and other "renderable" types

```tsx
type CardProps = {
  title: string;
  children: React.ReactNode;           // ✅ anything React can render: elements, strings, numbers, arrays, null
};

function Card({ title, children }: CardProps) {
  return <section><h2>{title}</h2>{children}</section>;
}
```

| Type | Accepts | Use for |
|---|---|---|
| **`React.ReactNode`** | elements, text, numbers, arrays, fragments, `null`, `undefined`, booleans | `children` and any "slot" prop — **the default** |
| `React.ReactElement` | exactly one JSX element | when you'll `cloneElement` it or need its props |
| `JSX.Element` | the result of a JSX expression | return types (usually inferred anyway) |
| `React.ComponentType<P>` | a component (function or class) — not yet rendered | "pass a component" props (`icon: ComponentType<IconProps>`) |
| `(arg: T) => React.ReactNode` | render prop | `renderItem` |

`React.PropsWithChildren<P>` adds `children?: ReactNode` to `P` for you.

---

<a name="fc"></a>
# 3. `React.FC` — and why many teams skip it

```tsx
const Button: React.FC<ButtonProps> = ({ label }) => <button>{label}</button>;
```

`React.FC` used to add `children` automatically (removed in React 18's types) and made generics awkward. Today it mostly just types the return value. Many teams prefer **typing the props parameter directly** (`function Button(props: ButtonProps)`) — simpler, works with generics. Either is acceptable; be consistent.

---

<a name="events"></a>
# 4. ⭐ Events

React events are typed by **event kind** and **element**:

```tsx
function SearchBox() {
  const [q, setQ] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value);
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); search(q); };
  const handleKey    = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Escape') setQ(''); };
  const handleClick  = (e: React.MouseEvent<HTMLButtonElement>) => console.log(e.clientX);

  return (
    <form onSubmit={handleSubmit}>
      <input value={q} onChange={handleChange} onKeyDown={handleKey} />
      <button onClick={handleClick}>Search</button>
    </form>
  );
}
```

| Event | Type |
|---|---|
| input/textarea/select change | `React.ChangeEvent<HTMLInputElement>` (or `HTMLTextAreaElement`, `HTMLSelectElement`) |
| form submit | `React.FormEvent<HTMLFormElement>` (React 19 types also have `SubmitEvent`) |
| click | `React.MouseEvent<HTMLButtonElement>` |
| key | `React.KeyboardEvent<…>` |
| focus/blur | `React.FocusEvent<…>` |

**Trick:** write the handler **inline** first (`onChange={e => …}`) — TypeScript infers `e`. Hover over it to see the type, then extract. Or type the handler itself: `const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => …`.

`e.target` vs `e.currentTarget`: `currentTarget` is typed as the element the handler is on; `target` may be a child ([javascript Part 30 §1](../javascript/30-events-in-depth.md)).

---

<a name="hooks"></a>
# 5. ⭐ Hooks: `useState`, `useReducer`, `useRef`

**`useState`** infers from the initial value. Add a type when the initial value doesn't tell the whole story:

```tsx
const [count, setCount] = useState(0);                       // number — inferred
const [user, setUser] = useState<User | null>(null);         // ✅ starts null, later a User
const [items, setItems] = useState<Item[]>([]);              // ✅ otherwise [] is never[]
```

**`useReducer`** — type actions as a **discriminated union**, so each action's payload is checked:

```tsx
type State = { status: 'idle' | 'loading' | 'error'; items: Item[]; error?: string };
type Action =
  | { type: 'fetch' }
  | { type: 'success'; items: Item[] }
  | { type: 'failure'; error: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'fetch':   return { ...state, status: 'loading' };
    case 'success': return { status: 'idle', items: action.items };     // TS knows .items exists here
    case 'failure': return { ...state, status: 'error', error: action.error };
  }
}
```

**`useRef`** — two different uses, two different types:

```tsx
const inputRef = useRef<HTMLInputElement>(null);     // DOM ref: starts null, React fills it
inputRef.current?.focus();                           // may be null → ?.

const timerRef = useRef<number | null>(null);        // mutable value you manage yourself
timerRef.current = window.setTimeout(tick, 1000);
```

(React 19's types require an argument: `useRef<T>(null)` / `useRef(initial)` — `useRef()` with no argument is an error.)

---

<a name="context"></a>
# 6. Context with a safe custom hook

```tsx
type AuthContextValue = { user: User | null; login: (u: User) => void; logout: () => void };

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');   // clear error + narrows the type
  return ctx;                                                               // AuthContextValue, not | undefined
}
```

No fake default objects, no `!` everywhere — the hook narrows the type once ([Part 11 §10](11-state-management.md)).

---

<a name="native"></a>
# 7. ⭐ Extending native HTML props

A design-system `<Button>` should accept **everything** a `<button>` accepts (`type`, `disabled`, `aria-*`, `onClick`…) plus its own props:

```tsx
type ButtonProps = React.ComponentProps<'button'> & {
  variant?: 'primary' | 'ghost';
  loading?: boolean;
};

export function Button({ variant = 'primary', loading = false, children, ...rest }: ButtonProps) {
  return (
    <button className={`btn btn-${variant}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Spinner /> : children}
    </button>
  );
}
```

- **`React.ComponentProps<'button'>`** = all props of `<button>` (in React 19 this includes `ref`, since ref is a prop).
- `React.ComponentPropsWithoutRef<'input'>` / `ComponentPropsWithRef` when you need to be explicit.
- **`Omit<React.ComponentProps<'input'>, 'size'> & { size: 'sm' | 'lg' }`** to replace a native prop with your own meaning.
- **`React.ComponentProps<typeof OtherComponent>`** = the props of another component — useful for wrappers.

---

<a name="generic"></a>
# 8. Generic components

A list or table that works for **any** item type and keeps it typed:

```tsx
type ListProps<T> = {
  items: T[];
  getKey: (item: T) => string | number;
  renderItem: (item: T) => React.ReactNode;
};

function List<T>({ items, getKey, renderItem }: ListProps<T>) {
  return <ul>{items.map(item => <li key={getKey(item)}>{renderItem(item)}</li>)}</ul>;
}

<List items={users} getKey={u => u.id} renderItem={u => u.name} />   // T inferred as User — u is typed
```

(In a `.tsx` arrow function, write `<T,>(props: ListProps<T>) => …` — the comma stops TS reading `<T>` as JSX.)

---

<a name="unions"></a>
# 9. Discriminated-union props

Make **impossible prop combinations** impossible:

```tsx
type AlertProps =
  | { kind: 'info'; message: string }
  | { kind: 'confirm'; message: string; onConfirm: () => void; onCancel: () => void };

function Alert(props: AlertProps) {
  if (props.kind === 'confirm') {
    return <Dialog onOk={props.onConfirm} onCancel={props.onCancel}>{props.message}</Dialog>;
  }
  return <p>{props.message}</p>;
}

<Alert kind="confirm" message="Delete?" />   // ❌ compile error: onConfirm/onCancel missing
```

Same idea for "either `href` (link) or `onClick` (button)" components and loading/success/error states.

---

<a name="custom-hooks"></a>
# 10. Typing custom hooks

```tsx
// return an object — names are clear, order doesn't matter (usually best)
function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  const toggle = useCallback(() => setOn(v => !v), []);
  return { on, toggle };
}

// return a tuple like useState — add `as const`, or TS infers (boolean | () => void)[]
function useToggleTuple(initial = false) {
  const [on, setOn] = useState(initial);
  return [on, () => setOn(v => !v)] as const;          // readonly [boolean, () => void]
}

// generic hook
function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : initial;      // ⚠️ `as T` trusts storage — validate if it matters
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)); }, [key, value]);
  return [value, setValue] as const;
}
```

Data from APIs: `fetch().then(r => r.json())` is `any`/`unknown` — TypeScript can't check the server. Validate with zod and infer the type from the schema ([Part 16 §4](16-forms.md)), or at least type the query function's return. Libraries like TanStack Query infer the data type from your `queryFn`.

---

<a name="interview"></a>
# 11. Interview Q&A

### Q: "How do you type `children`?"
> *"`React.ReactNode` — it covers elements, strings, numbers, arrays, fragments and null, so it's right for children and any slot prop. `ReactElement` only when I need exactly one element, and `ComponentType<P>` when a prop is a component to render later."*

### Q: "What's the type of an input's onChange event?"
> *"`React.ChangeEvent<HTMLInputElement>` — React's synthetic event type, parameterised by the element. Submit is `React.FormEvent<HTMLFormElement>`, clicks `React.MouseEvent<HTMLButtonElement>`. If unsure, I write the handler inline and let TypeScript infer it."*

### Q: "How do you make a Button that accepts all native button props?"
> *"Intersect `React.ComponentProps<'button'>` with my own props, destructure mine and spread the rest onto the `<button>`. `Omit` replaces a native prop I want to redefine. In React 19 that type also includes `ref`."*

### Q: "Should I use `React.FC`?"
> *"It's fine, but it no longer adds `children` since React 18's types, and it makes generic components awkward, so many teams just type the props parameter directly. Consistency matters more than the choice."*

### Q: "How do you type `useState` that starts as null?"
> *"Pass the type explicitly: `useState<User | null>(null)`. Same for an empty array, `useState<Item[]>([])`, otherwise it's inferred as `never[]`."*

### Q: "How do you type a context safely?"
> *"Create it with `undefined` as the default, and export a custom hook that reads it, throws a clear error if it's undefined, and returns the narrowed type. Then consumers never deal with undefined, and using it outside the provider fails loudly."*

---

<a name="cheatsheet"></a>
# 12. Cheat Sheet

```
props: type Props = {...} · literal unions ('primary' | 'danger') · defaults in destructuring
children: React.ReactNode (default) · ReactElement (one element) · ComponentType<P> (component) · (x) => ReactNode
React.FC optional — no implicit children since React 18 · typing props param directly is common

EVENTS: ChangeEvent<HTMLInputElement> · FormEvent<HTMLFormElement> · MouseEvent<HTMLButtonElement>
        KeyboardEvent · FocusEvent · tip: write inline, hover, extract · ChangeEventHandler<El>

useState<User | null>(null) · useState<Item[]>([])
useReducer: Action = discriminated union { type: 'success'; items } | …
useRef<HTMLInputElement>(null) → ref.current?.focus() · useRef<number | null>(null) for values
CONTEXT: createContext<T | undefined>(undefined) + useX() that throws → narrowed T

NATIVE PROPS: React.ComponentProps<'button'> & MyProps → spread ...rest · Omit<..., 'size'>
              ComponentProps<typeof Other> for wrappers
GENERIC: function List<T>(p: ListProps<T>) · arrow in .tsx: <T,>(…) =>
UNION PROPS: { kind: 'info' } | { kind: 'confirm'; onConfirm } → impossible combos = compile errors
CUSTOM HOOKS: return object, or tuple `as const` · API data is unknown → zod / typed queryFn
```

---

## Connects to

- **[Part 4 — Props](04-props.md):** TypeScript vs PropTypes.
- **[Part 16 — Forms](16-forms.md):** `z.infer` and typed React Hook Form.
- **[Angular Part 00](../Angular/00-typescript-for-angular.md):** the TypeScript language features used here (generics, unions, utility types).
- **[Part 20 — Portals & refs](20-portals-refs-and-modals.md):** typing refs on reusable components.

## Suggested next topics

1. **Portals, refs & modals.**
2. **Styling & accessibility.**
