# Angular Study Notes — Part 15

## Forms (Reactive vs Template-driven, Validators, FormArray, ControlValueAccessor)

> **Format:** code-heavy — forms are learned by reading them.
>
> **Roadmap:** [Part 15](00-ROADMAP.md) · **Priority:** ⭐⭐⭐⭐⭐
>
> **Continues:** [Part 12 — RxJS](12-rxjs.md) · [Part 06 — Communication](06-component-communication.md) · [Part 20 — Testing](20-testing.md).

---

## Table of Contents

1. [Two approaches, one decision](#two)
2. [Template-driven](#template-driven)
3. [Reactive](#reactive) ⭐
4. [The three building blocks](#blocks)
5. [Validators](#validators) ⭐
6. [Control state — and when to show errors](#state) ⭐
7. [`setValue` vs `patchValue`](#setvalue)
8. [`FormArray` — dynamic fields](#formarray)
9. [`valueChanges` — forms as streams](#valuechanges) ⭐
10. [`ControlValueAccessor` — your own form control](#cva) ⭐
11. [Typed forms](#typed)
12. [Interview Q&A](#interview)
13. [The 60-second summary](#summary)

---

<a name="two"></a>
# 1. Two approaches, one decision

```
TEMPLATE-DRIVEN     the form lives in the HTML
REACTIVE            the form lives in the TypeScript class
```

Both are supported and neither is deprecated. But the choice is nearly always the same one, and interviews want to hear *why*.

---

<a name="template-driven"></a>
# 2. Template-driven

```ts
user = { name: '', email: '' };
onSubmit(form: NgForm) { console.log(form.value); }
```

```html
<form #f="ngForm" (ngSubmit)="onSubmit(f)">
  <input name="name"  [(ngModel)]="user.name"  required minlength="3">
  <input name="email" [(ngModel)]="user.email" required email>
  <button [disabled]="f.invalid">Save</button>
</form>
```

Angular builds the form model **for you**, by scanning the template for `ngModel` directives. Needs `FormsModule`.

```
✅  fast for a login box or a 3-field filter
❌  validation logic is spread across HTML attributes
❌  can't unit test the form without rendering the component
❌  dynamic fields are painful
```

---

<a name="reactive"></a>
# 3. ⭐ Reactive

You build the model explicitly:

```ts
export class RegisterComponent {
  private fb = inject(FormBuilder);

  form = this.fb.nonNullable.group({
    name:  ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    age:   [0,  [Validators.min(18)]],
  });

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();     // reveal every error at once
      return;
    }
    this.api.register(this.form.getRawValue()).subscribe();
  }
}
```

```html
<form [formGroup]="form" (ngSubmit)="submit()">
  <input formControlName="name">
  <input formControlName="email">
  <button [disabled]="form.invalid">Register</button>
</form>
```

```
✅  the form is a plain object — unit testable with no DOM
✅  validation lives in one place
✅  valueChanges is an Observable — debounce, autosave, dependent fields
✅  dynamic add/remove is natural
❌  more setup for trivial forms
```

**The answer to "which one":** reactive for anything real. Template-driven only for a two-field form with no logic.

---

<a name="blocks"></a>
# 4. The three building blocks

```
FormControl   one field
FormGroup     an object of controls    { name, email }
FormArray     a list of controls       [ skill, skill, skill ]
```

They nest freely:

```ts
form = this.fb.nonNullable.group({
  name: [''],
  address: this.fb.nonNullable.group({      // nested group
    city: [''],
    zip:  [''],
  }),
  skills: this.fb.array<FormControl<string>>([]),   // dynamic list
});
```

```html
<div formGroupName="address">
  <input formControlName="city">
</div>
```

---

<a name="validators"></a>
# 5. ⭐ Validators

**Built-in:**

```ts
Validators.required
Validators.requiredTrue        // for an "I accept" checkbox
Validators.minLength(3)
Validators.email
Validators.pattern(/^\d{10}$/)
Validators.min(18) / max(99)
```

**Custom — a function returning an error object, or `null` for valid:**

```ts
export function noSpaces(control: AbstractControl): ValidationErrors | null {
  return control.value?.includes(' ') ? { noSpaces: true } : null;
}
```

```ts
username: ['', [Validators.required, noSpaces]]
```

Parameterised ones return the validator:

```ts
export function minAge(min: number): ValidatorFn {
  return (control) => control.value < min ? { minAge: { required: min } } : null;
}
```

**Cross-field validation goes on the GROUP**, not the control — because only the group can see both fields:

```ts
export const passwordsMatch: ValidatorFn = (group) => {
  const pw = group.get('password')?.value;
  const confirm = group.get('confirm')?.value;
  return pw === confirm ? null : { mismatch: true };
};

form = this.fb.nonNullable.group({
  password: ['', Validators.required],
  confirm:  ['', Validators.required],
}, { validators: passwordsMatch });      // ← second argument
```

```html
@if (form.hasError('mismatch') && form.get('confirm')?.touched) {
  <p>Passwords don't match</p>
}
```

**Async validators** return an Observable and go in a separate slot:

```ts
export function usernameTaken(api: UserService): AsyncValidatorFn {
  return (control) => api.checkUsername(control.value).pipe(
    map(taken => taken ? { taken: true } : null),
    first(),                        // ⚠️ MUST complete or the form stays PENDING
  );
}
```

```ts
username: ['', {
  validators: [Validators.required],
  asyncValidators: [usernameTaken(this.api)],
  updateOn: 'blur',                 // don't hit the API on every keystroke
}]
```

While it runs, the control's status is `PENDING` — useful for a spinner.

---

<a name="state"></a>
# 6. ⭐ Control state — and when to show errors

```
pristine / dirty        has the VALUE been changed?
untouched / touched     has the field been blurred?
valid / invalid         does it pass validation?
pending                 an async validator is running
```

The reason this matters: showing "required" on an empty field the user hasn't reached yet is hostile. The standard condition:

```html
@if (form.controls.email.invalid && form.controls.email.touched) {
  @if (form.controls.email.hasError('required')) { <p>Email is required</p> }
  @if (form.controls.email.hasError('email'))    { <p>Not a valid email</p> }
}
```

```
touched   → they left the field  → NOW tell them
dirty     → they typed something → good for autosave triggers
```

On submit, `markAllAsTouched()` reveals everything at once.

---

<a name="setvalue"></a>
# 7. `setValue` vs `patchValue`

```ts
this.form.setValue({ name: 'A', email: 'a@b.c', age: 30 });  // ALL controls required
this.form.patchValue({ name: 'A' });                          // partial — the rest untouched
```

```
setValue    strict — throws if you miss a control. Good for "load a full record".
patchValue  lenient — silently ignores missing keys. Good for partial updates.
```

⚠️ `patchValue` also ignores *unknown* keys silently, so a typo in a field name fails quietly.

---

<a name="formarray"></a>
# 8. `FormArray` — dynamic fields

```ts
form = this.fb.nonNullable.group({
  name: [''],
  skills: this.fb.array<FormControl<string>>([]),
});

get skills() {
  return this.form.controls.skills;
}

addSkill()             { this.skills.push(this.fb.nonNullable.control('', Validators.required)); }
removeSkill(i: number) { this.skills.removeAt(i); }
```

```html
<div formArrayName="skills">
  @for (skill of skills.controls; track $index) {
    <input [formControlName]="$index">
    <button (click)="removeSkill($index)">×</button>
  }
</div>
<button (click)="addSkill()">Add skill</button>
```

Note `[formControlName]="$index"` — inside a `FormArray` the name is the position.

---

<a name="valuechanges"></a>
# 9. ⭐ `valueChanges` — forms as streams

This is where reactive forms pay off ([Part 12](12-rxjs.md)):

```ts
// autosave, but not on every keystroke
this.form.valueChanges.pipe(
  debounceTime(1000),
  distinctUntilChanged(),
  switchMap(value => this.api.saveDraft(value)),
  takeUntilDestroyed(),
).subscribe();

// a dependent dropdown
this.form.controls.country.valueChanges.pipe(
  switchMap(country => this.api.getStates(country)),
  takeUntilDestroyed(),
).subscribe(states => this.states.set(states));
```

`statusChanges` does the same for `VALID` / `INVALID` / `PENDING`.

---

<a name="cva"></a>
# 10. ⭐ `ControlValueAccessor` — your own form control

To make `<app-rating formControlName="score">` work, Angular needs to know how to read and write your component. That contract is `ControlValueAccessor`:

```ts
@Component({
  selector: 'app-rating',
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => RatingComponent),
    multi: true,
  }],
  template: `
    @for (star of [1,2,3,4,5]; track star) {
      <span (click)="select(star)" [class.on]="star <= value">★</span>
    }
  `,
})
export class RatingComponent implements ControlValueAccessor {
  value = 0;
  private onChange = (v: number) => {};
  private onTouched = () => {};

  writeValue(v: number)                 { this.value = v; }      // form → component
  registerOnChange(fn: any)             { this.onChange = fn; }  // component → form
  registerOnTouched(fn: any)            { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean) { /* … */ }

  select(star: number) {
    this.value = star;
    this.onChange(star);      // tell the form
    this.onTouched();
  }
}
```

```
writeValue()        the form pushes a value INTO your component
registerOnChange()  the form hands you a callback to push values OUT
registerOnTouched() same, for blur
```

---

<a name="typed"></a>
# 11. Typed forms

Since Angular 14, forms are typed:

```ts
form = this.fb.nonNullable.group({
  name: [''],           // FormControl<string>
  age: [0],             // FormControl<number>
});

this.form.controls.name.value;     // string — autocompleted, checked
this.form.get('nmae');             // ❌ compile error, not a silent null
```

⚠️ Without `nonNullable`, `reset()` sets controls to `null`, so the type is `string | null`. Use `this.fb.nonNullable` unless you actually want nullable.

⚠️ `form.value` **excludes disabled controls**. Use `getRawValue()` when submitting, or you'll silently drop fields.

---

<a name="interview"></a>
# 12. Interview Q&A

### Q: Reactive vs template-driven?

Template-driven builds the form model from `ngModel` directives in the HTML — quick for something trivial, but validation is scattered across attributes and you can't test it without rendering. Reactive defines the model explicitly in the class, so it's a plain object I can unit test, validation lives in one place, and `valueChanges` gives me a stream for debouncing, autosave and dependent fields. I use reactive for anything with real logic.

### Q: How do you validate that two fields match?

The validator goes on the `FormGroup`, not on either control, because only the group can see both values. It returns an error object on the group, and the template checks `form.hasError('mismatch')`.

### Q: How do async validators work?

They return an Observable of an error object or null, and go in the `asyncValidators` slot. The control's status is `PENDING` while one runs. Two practical points: the Observable must complete, so I add `first()`, and I set `updateOn: 'blur'` so I'm not calling the API on every keystroke.

### Q: `setValue` vs `patchValue`?

`setValue` requires a value for every control and throws if one is missing — good when loading a complete record. `patchValue` updates only the keys you provide. The catch is that `patchValue` ignores unknown keys silently, so a typo in a field name fails quietly.

### Q: What is `FormArray` for?

A list of controls whose length changes at runtime — skills, phone numbers, line items on an invoice. You `push` and `removeAt`, and in the template each control is bound by its index.

### Q: How do you make your own component work with `formControlName`?

Implement `ControlValueAccessor` and register it via the `NG_VALUE_ACCESSOR` token with `multi: true`. `writeValue` receives values from the form, `registerOnChange` gives you the callback to send values back, and `registerOnTouched` reports blur.

### Q: When should validation errors be shown?

Not while they're still typing in a field they haven't finished. The usual condition is invalid **and** touched, so errors appear on blur. On submit I call `markAllAsTouched()` so every error appears at once.

### Q: Why is a field missing from `form.value`?

It's disabled. Disabled controls are excluded from `value` — use `getRawValue()` to include them.

---

<a name="summary"></a>
# 13. The 60-second summary

> *"Angular has two form systems. Template-driven builds the model from `ngModel` directives in the HTML, which is fine for a login box but scatters validation across attributes and can't be tested without rendering. Reactive forms define the model in the class using `FormControl`, `FormGroup` and `FormArray`, so the form is a plain object I can unit test, validation lives in one place, and `valueChanges` is an Observable I can debounce for autosave or dependent dropdowns. Validators are just functions returning an error object or null; cross-field rules like password confirmation go on the group, because only the group sees both controls. Async validators return an Observable, must complete, and usually run on blur so they don't hammer the API. Errors should display on invalid-and-touched, with `markAllAsTouched` on submit. `setValue` requires every control while `patchValue` is partial, `FormArray` handles dynamic lists, and implementing `ControlValueAccessor` lets my own component work with `formControlName`."*

---

## Connects to

- **[Part 03 — Templates](03-templates-and-data-binding.md):** `[(ngModel)]` and its desugaring.
- **[Part 12 — RxJS](12-rxjs.md):** `valueChanges` with `debounceTime` and `switchMap`.
- **[Part 06 — Communication](06-component-communication.md):** custom controls as components.
- **[Part 20 — Testing](20-testing.md):** why a reactive form is easy to test.

*— End of Part 15 —*
