# React Study Notes — Part 16

## Forms (Controlled vs Uncontrolled recap, React Hook Form, zod Validation, Server Errors, Field Arrays, React 19 Form Actions, Accessible Forms)

> **Why this part exists:** forms are where most real React bugs and performance problems live — and "how do you handle a big form with validation?" is a standard 3–4-year question. This part goes from the basics to how teams actually build forms today.
>
> **Continues from:** [Part 2 §6–7](02-components.md) (controlled vs uncontrolled) · [Part 13](13-react-19-and-19-2.md) (form actions) · QNA §14.

---

## Table of Contents

1. [Controlled vs uncontrolled — 60-second recap](#recap)
2. [A hand-written form, done properly](#manual)
3. [⭐ React Hook Form](#rhf)
4. [⭐ Schema validation with zod](#zod)
5. [Server-side errors](#server-errors)
6. [Dynamic fields: `useFieldArray`](#field-array)
7. [Using UI-library inputs: `Controller`](#controller)
8. [React 19 form actions — when they're enough](#actions)
9. [⭐ Accessible forms and good UX](#a11y)
10. [Interview Q&A](#interview)
11. [Cheat Sheet](#cheatsheet)

---

<a name="recap"></a>
# 1. Controlled vs uncontrolled — 60-second recap

| | Controlled | Uncontrolled |
|---|---|---|
| Where the value lives | React state (`value` + `onChange`) | the DOM (read with a ref or `FormData`) |
| Re-render per keystroke | yes | no |
| Good for | live validation, formatting as you type, dependent fields | big forms, file inputs, simple submit-and-read |

Full detail: [Part 2 §6–7](02-components.md). The key fact for this part: **React Hook Form is uncontrolled by default** — that's why it's fast.

---

<a name="manual"></a>
# 2. A hand-written form, done properly

Fine for 2–5 fields:

```jsx
function LoginForm({ onLogin }) {
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const update = (e) => setValues(v => ({ ...v, [e.target.name]: e.target.value }));

  function validate(v) {
    const errs = {};
    if (!v.email.includes('@')) errs.email = 'Enter a valid email';
    if (v.password.length < 8) errs.password = 'At least 8 characters';
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate(values);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSubmitting(true);
    try { await onLogin(values); }
    catch (err) { setErrors({ form: err.message }); }
    finally { setSubmitting(false); }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" value={values.email} onChange={update} aria-invalid={!!errors.email} />
      {errors.email && <p role="alert">{errors.email}</p>}
      {/* …password… */}
      {errors.form && <p role="alert">{errors.form}</p>}
      <button disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}
```

Notice everything you had to write by hand: values, errors, touched/submitting state, the validation, error display, preventing double submit. That's what libraries remove.

---

<a name="rhf"></a>
# 3. ⭐ React Hook Form

The most-used form library. It **registers** inputs as uncontrolled and reads them through refs, so typing doesn't re-render the whole form.

```jsx
import { useForm } from 'react-hook-form';

function SignupForm({ onSubmit }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { name: '', email: '' } });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>      {/* handleSubmit validates first */}
      <label htmlFor="name">Name</label>
      <input id="name" {...register('name', { required: 'Name is required' })} />
      {errors.name && <p role="alert">{errors.name.message}</p>}

      <label htmlFor="email">Email</label>
      <input id="email" type="email"
        {...register('email', {
          required: 'Email is required',
          pattern: { value: /^\S+@\S+$/, message: 'Enter a valid email' },
        })}
      />
      {errors.email && <p role="alert">{errors.email.message}</p>}

      <button disabled={isSubmitting}>Sign up</button>        {/* isSubmitting is true while onSubmit's promise runs */}
    </form>
  );
}
```

- **`register('name', rules)`** returns `name`, `ref`, `onChange`, `onBlur` — spread it onto the input.
- **`handleSubmit(fn)`** runs validation; `fn` is called only with valid data.
- **`formState`**: `errors`, `isSubmitting`, `isDirty`, `isValid`, `touchedFields`… (read only what you use — RHF only re-renders for the parts you subscribe to).
- **`watch('field')`** to react to a value (re-renders); **`setValue`**, **`reset(newValues)`** (e.g. after loading data to edit), **`getValues`**.
- **When validation runs:** `useForm({ mode: 'onSubmit' | 'onBlur' | 'onChange' | 'onTouched' })` — `onTouched` (validate a field after the user first leaves it) is a good default UX.

> 🧠 **Remember:** **`register` connects, `handleSubmit` guards, `formState.errors` explains.**

Alternatives: **Formik** (older, controlled → slower on big forms, in many existing codebases), **TanStack Form** (newer, type-safe).

---

<a name="zod"></a>
# 4. ⭐ Schema validation with zod

Writing rules inline gets messy, and you end up repeating them on the server. A **schema** describes the whole form once — and TypeScript types come from it for free.

```jsx
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

const signupSchema = z.object({
  name: z.string().min(2, 'At least 2 characters'),
  email: z.string().email('Enter a valid email'),
  age: z.coerce.number().int().min(18, 'You must be 18+'),      // inputs give strings → coerce
  password: z.string().min(8, 'At least 8 characters'),
  confirm: z.string(),
}).refine(d => d.password === d.confirm, {
  message: 'Passwords do not match',
  path: ['confirm'],                                            // show the error on the confirm field
});

type SignupValues = z.infer<typeof signupSchema>;               // TS type generated from the schema

const { register, handleSubmit, formState: { errors } } = useForm<SignupValues>({
  resolver: zodResolver(signupSchema),
});
```

Why this is the common setup:
- **One source of truth** for rules — and the **same schema can validate on the server** (Node API or a Server Action), so client and server never disagree.
- Cross-field rules (`refine`) and conditional rules are easy.
- Types are inferred — no separate `interface` to keep in sync ([Part 19](19-typescript-with-react.md)).

(Yup and Valibot are alternatives with the same idea.)

⚠️ **Client-side validation is for UX only.** Anyone can skip your form and call the API directly. **The server must validate too** ([nodejs Part 14 §7](../nodejs/14-typescript-with-node.md)).

---

<a name="server-errors"></a>
# 5. Server-side errors

Some errors only the server knows — "email already registered":

```jsx
const { setError } = useForm();

async function onSubmit(data) {
  const res = await fetch('/api/signup', { method: 'POST', body: JSON.stringify(data) });
  if (res.status === 409) {
    setError('email', { message: 'This email is already registered' });   // shows on the field
    return;
  }
  if (!res.ok) {
    setError('root.server', { message: 'Something went wrong. Please try again.' });
    return;
  }
  navigate('/welcome');
}
// {errors.root?.server && <p role="alert">{errors.root.server.message}</p>}
```

Have the API return **field-level errors** in a consistent shape (`{ errors: { email: '…' } }`) so the form can map them onto fields.

---

<a name="field-array"></a>
# 6. Dynamic fields: `useFieldArray`

"Add another phone number", invoice line items, multiple addresses:

```jsx
const { control, register } = useForm({ defaultValues: { phones: [{ number: '' }] } });
const { fields, append, remove } = useFieldArray({ control, name: 'phones' });

{fields.map((field, index) => (
  <div key={field.id}>                                    {/* ⚠️ field.id, NOT index, as the key */}
    <input {...register(`phones.${index}.number`)} />
    <button type="button" onClick={() => remove(index)}>Remove</button>
  </div>
))}
<button type="button" onClick={() => append({ number: '' })}>Add phone</button>
```

Using the index as `key` here causes the classic "removing row 1 deletes the wrong input's text" bug ([Part 3 §8](03-jsx-deep-dive.md)). Note `type="button"` — a plain `<button>` inside a form **submits** it.

---

<a name="controller"></a>
# 7. Using UI-library inputs: `Controller`

Components like a date picker, a MUI `Select` or a rich-text editor don't expose a native input to `register`. Wrap them in `Controller`:

```jsx
<Controller
  name="startDate"
  control={control}
  rules={{ required: 'Pick a date' }}
  render={({ field, fieldState }) => (
    <DatePicker value={field.value} onChange={field.onChange} onBlur={field.onBlur}
                error={fieldState.error?.message} />
  )}
/>
```

---

<a name="actions"></a>
# 8. React 19 form actions — when they're enough

For simple forms, React 19's built-in tools may be all you need ([Part 13 §2](13-react-19-and-19-2.md)):

```jsx
const [state, formAction, isPending] = useActionState(async (prev, formData) => {
  const result = signupSchema.safeParse(Object.fromEntries(formData));   // same zod schema
  if (!result.success) return { errors: result.error.flatten().fieldErrors };
  await api.signup(result.data);
  return { errors: {} , done: true };
}, { errors: {} });

<form action={formAction}>
  <input name="email" />
  {state.errors.email && <p role="alert">{state.errors.email[0]}</p>}
  <button disabled={isPending}>Sign up</button>
</form>
```

| Use | When |
|---|---|
| **form actions + `useActionState`** | simple forms, Server Actions in Next.js, progressive enhancement (works before JS) |
| **React Hook Form + zod** | many fields, live validation, dynamic field arrays, complex UI-library inputs, wizards |

They can be combined (RHF on the client, a Server Action to submit).

---

<a name="a11y"></a>
# 9. ⭐ Accessible forms and good UX

- **Every input has a `<label>`** linked by `htmlFor`/`id` (or wrapping the input). A placeholder is **not** a label — it disappears when you type. `useId()` generates ids safely with SSR.
- **Errors:** mark the field `aria-invalid="true"`, link the message with `aria-describedby`, and use `role="alert"` (or a live region) so screen readers announce it. On submit with errors, **move focus to the first invalid field** (React Hook Form does this by default: `shouldFocusError`).
- **Use the right input types** — `type="email"`, `inputMode="numeric"`, `autoComplete="email"` / `"current-password"` / `"one-time-code"` — for mobile keyboards and password managers.
- **Don't disable the submit button as the only feedback** — show *why* it can't submit.
- **Validate on blur / after first submit**, not on every keystroke from the start (shouting "invalid email" after one letter is hostile).
- **Prevent double submit** (disable while `isSubmitting`) and **keep the user's input** if the request fails.

```jsx
<label htmlFor={id}>Email</label>
<input id={id} type="email" autoComplete="email"
       aria-invalid={!!errors.email} aria-describedby={errors.email ? `${id}-error` : undefined}
       {...register('email')} />
{errors.email && <p id={`${id}-error`} role="alert">{errors.email.message}</p>}
```

---

<a name="interview"></a>
# 10. Interview Q&A

### Q: "How would you build a large form with validation?"
> *"React Hook Form with a zod schema through `zodResolver`. RHF keeps inputs uncontrolled, so typing doesn't re-render the whole form; zod defines all the rules — including cross-field ones — in one schema that also gives the TypeScript type and can be reused to validate on the server. `useFieldArray` for dynamic rows, `Controller` for UI-library inputs, `setError` for server errors, and accessible labels and error messages."*

### Q: "Why is React Hook Form faster than a controlled form?"
> *"A controlled form stores every field in React state, so each keystroke re-renders the form component and its children. RHF registers inputs as uncontrolled and reads values through refs; it only re-renders the parts subscribed to a specific piece of form state, like one field's error."*

### Q: "Where should validation happen?"
> *"Both sides. Client-side validation is for fast feedback; it can be bypassed, so the server must validate every request. Sharing one zod schema between them keeps the rules consistent. On the client I validate on blur or after the first submit rather than on every keystroke."*

### Q: "How do you show an error the server returned, like 'email already taken'?"
> *"Map it onto the field with `setError('email', { message })`, or onto a form-level `root` error for general failures. It helps if the API returns field-level errors in a consistent shape."*

### Q: "Do React 19 form actions replace React Hook Form?"
> *"For simple forms — especially with Server Actions in Next.js — `<form action>` with `useActionState` is often enough, and it works before JavaScript loads. For big forms with live validation, dynamic fields and complex inputs, React Hook Form is still the better tool. They can be combined."*

### Q: "What makes a form accessible?"
> *"Real labels tied to inputs, errors linked with `aria-describedby` and announced with `role='alert'`, `aria-invalid` on bad fields, focus moved to the first error on submit, proper input types and autocomplete attributes, and full keyboard support."*

---

<a name="cheatsheet"></a>
# 11. Cheat Sheet

```
controlled = state per keystroke (live logic) · uncontrolled = DOM holds value (fast) — RHF is uncontrolled
hand-written form OK for 2–5 fields: values, errors, submitting, validate, preventDefault

REACT HOOK FORM
useForm({ defaultValues, resolver, mode: 'onTouched' })
{...register('name', rules)} · handleSubmit(onValid) · formState { errors, isSubmitting, isDirty }
watch / setValue / reset / getValues · setError('field' | 'root.server', { message })
useFieldArray → fields.map(f => key={f.id}) — NOT index · type="button" for non-submit buttons
Controller for UI-library inputs (date pickers, selects)
"register connects, handleSubmit guards, errors explain"

ZOD: z.object({...}).refine(cross-field, { path }) · z.coerce.number() · z.infer<typeof schema>
zodResolver(schema) · SAME schema on the server · client validation = UX only

REACT 19: <form action> + useActionState — simple forms, Server Actions, works pre-JS

A11Y: <label htmlFor> (placeholder ≠ label) · aria-invalid · aria-describedby · role="alert"
      focus first error · type/inputMode/autoComplete · validate on blur · prevent double submit
```

---

## Connects to

- **[Part 2 — Components](02-components.md):** controlled vs uncontrolled in depth.
- **[Part 13 — React 19](13-react-19-and-19-2.md):** form actions, `useActionState`, `useFormStatus`, `useOptimistic`.
- **[Part 19 — TypeScript](19-typescript-with-react.md):** typing forms and `z.infer`.
- **[Part 21 — Accessibility](21-styling-and-accessibility.md):** labels, errors and focus in context.

## Suggested next topics

1. **Data fetching & mutations** — TanStack Query `useMutation`.
2. **Testing forms** — React Testing Library + user-event.
