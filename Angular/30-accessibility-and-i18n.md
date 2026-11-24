# Angular Study Notes — Part 30

## Accessibility (a11y) & Internationalization (i18n)

> **Roadmap:** [Part 30](00-ROADMAP.md) · **Priority:** ⭐⭐⭐⭐☆ — asked a lot for enterprise, government, banking and e-commerce roles.
>
> **Continues:** [Part 29 — Material & CDK](29-angular-material-and-cdk.md) (`cdk/a11y`) · [Part 05 — Pipes](05-pipes.md) (date/currency pipes and locale) · [javascript Part 28](../javascript/28-numbers-and-dates.md) (`Intl`).
>
> "a11y" = **a**ccessibilit**y** (11 letters in between). "i18n" = **i**nternationalizatio**n** (18 letters). "l10n" = localization.

---

## Table of Contents

**Accessibility**
1. [What accessibility means, and why it's your job](#a11y-why)
2. [⭐ Semantic HTML first, ARIA second](#semantic)
3. [⭐ Keyboard and focus](#keyboard)
4. [Announcing changes to screen readers](#announce)
5. [Accessibility in Angular specifically](#a11y-angular)
6. [How to test accessibility](#a11y-test)

**Internationalization**

7. [The two approaches: compile-time vs runtime](#i18n-approaches)
8. [⭐ Angular's built-in i18n (`@angular/localize`)](#localize)
9. [Plurals and gender — ICU messages](#icu)
10. [Dates, numbers, currency and `LOCALE_ID`](#locale)
11. [Right-to-left languages](#rtl)
12. [Interview Q&A](#interview)
13. [The 60-second summary](#summary)

---

<a name="a11y-why"></a>
# 1. What accessibility means, and why it's your job

Accessibility = **people with disabilities can use the app**: blind users with screen readers, people who can't use a mouse (keyboard or switch users), low-vision users who zoom to 200%, colour-blind users, people with motion sensitivity.

It's also often **a legal requirement** (ADA in the US, the European Accessibility Act, India's RPwD rules for public services), and the standard everyone refers to is **WCAG 2.2, level AA**.

> **Analogy ♿ — a ramp next to the stairs.** It costs little if you build it with the building, a lot to add later — and it helps prams, trolleys and suitcases too. Accessible apps are also easier to use for everyone, and easier to test.

---

<a name="semantic"></a>
# 2. ⭐ Semantic HTML first, ARIA second

The browser gives a lot of accessibility **for free** — if you use the right element.

```html
<!-- ❌ looks like a button, but: no keyboard focus, no Enter/Space, screen reader says "group" -->
<div class="btn" (click)="save()">Save</div>

<!-- ✅ focusable, Enter and Space work, announced as "Save, button" -->
<button type="button" (click)="save()">Save</button>
```

| Need | Use | Not |
|---|---|---|
| an action | `<button>` | `<div (click)>` |
| go somewhere | `<a routerLink>` / `<a href>` | `<span (click)="router.navigate()">` |
| page structure | `<header>`, `<nav>`, `<main>`, `<footer>`, headings `<h1>`–`<h6>` in order | divs everywhere |
| form fields | `<label for>` (or wrap the input) + `<input>` | placeholder as the only label |
| data in rows/columns | `<table>` with `<th>` | a grid of divs |

**ARIA** (`role`, `aria-*` attributes) is for when HTML has no element for what you built — a custom tabs widget, a combobox:

```html
<button [attr.aria-expanded]="open()" aria-controls="menu-1">Options</button>
<ul id="menu-1" role="menu" [hidden]="!open()"> … </ul>

<button aria-label="Close dialog">✕</button>          <!-- icon-only buttons need a text label -->
<span class="spinner" aria-hidden="true"></span>      <!-- decorative: hide from screen readers -->
```

> 🧠 **Remember the first rule of ARIA:** **don't use ARIA if a native element does the job.** Wrong ARIA is worse than none.

Images: meaningful → `alt="Asha's profile photo"`; decorative → `alt=""`. Colour: never the *only* signal (add an icon or text to red errors); text contrast at least **4.5:1**.

---

<a name="keyboard"></a>
# 3. ⭐ Keyboard and focus

Unplug the mouse and use the app. Everything must work with **Tab, Shift+Tab, Enter, Space, Escape and arrow keys**.

- **Visible focus:** never `outline: none` without a replacement. Style `:focus-visible` (shows for keyboard users, not mouse clicks).
- **Logical tab order:** follow the DOM order. Avoid positive `tabindex` values. `tabindex="0"` makes a custom element focusable; `tabindex="-1"` makes it focusable by code only.
- **Modals:** move focus **into** the dialog when it opens, **trap** it there (Tab cycles inside), close on **Escape**, and **return focus** to the button that opened it. The CDK Dialog / `cdkTrapFocus` does all of this ([Part 29 §4](29-angular-material-and-cdk.md)).
- **Single-page app route changes:** the browser doesn't move focus or announce anything when Angular swaps the page. After navigation, move focus to the new page's `<h1>` (or main region) and set a page **title**:
  ```ts
  // route config — the Router sets document.title for you
  { path: 'employees', component: EmployeesPage, title: 'Employees | HR Portal' }
  ```
  ```ts
  // focus the heading after each navigation
  router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() =>
    afterNextRender(() => document.querySelector<HTMLElement>('main h1')?.focus(), { injector }));
  // (the h1 needs tabindex="-1" to be focusable by code)
  ```
- **Skip link:** a first focusable "Skip to main content" link for keyboard users.

---

<a name="announce"></a>
# 4. Announcing changes to screen readers

When something changes without a page load — "Saved", "3 results found", a validation error — sighted users see it; screen-reader users hear nothing unless you announce it.

```ts
private announcer = inject(LiveAnnouncer);        // @angular/cdk/a11y

save() {
  this.api.save(this.form.value).subscribe(() => this.announcer.announce('Employee saved', 'polite'));
}
```

Or in HTML: a region with `aria-live="polite"` (waits for a pause) or `role="alert"` (interrupts — for errors). Form errors: link the message to the field with `aria-describedby` and mark the field `aria-invalid="true"`.

---

<a name="a11y-angular"></a>
# 5. Accessibility in Angular specifically

- **Bind ARIA as attributes:** `[attr.aria-expanded]="open()"`, `[attr.aria-label]="label()"`. (`[aria-expanded]` as a *property* binding doesn't exist on most elements.)
- **Host bindings** for custom components: `host: { role: 'tab', '[attr.aria-selected]': 'selected()', '[tabindex]': 'selected() ? 0 : -1' }`.
- **`@angular/cdk/a11y`:** `FocusTrap`/`cdkTrapFocus`, `FocusMonitor` (keyboard vs mouse focus), `LiveAnnouncer`, `ListKeyManager`/`ActiveDescendantKeyManager` (arrow-key navigation in lists and menus), `cdkAriaLive`.
- **Angular Material** components are built to be accessible — one strong reason to use them.
- **Angular Aria** (`@angular/aria`, v21 developer preview) — headless accessible widgets (tabs, listbox, combobox, menu, tree, grid…) with keyboard and ARIA handled, unstyled.
- **Lint it:** `@angular-eslint` has template accessibility rules (`alt-text`, `label-has-associated-control`, `click-events-have-key-events`, `interactive-supports-focus`, …).

---

<a name="a11y-test"></a>
# 6. How to test accessibility

| Method | Catches |
|---|---|
| **Lighthouse / axe DevTools** browser extension | missing labels, low contrast, missing alt text, bad ARIA |
| **axe-core in tests** (`@axe-core/playwright`, `jest-axe`) | same checks, automatically in CI |
| **Keyboard-only walkthrough** | focus traps, invisible focus, unreachable controls — tools can't catch these |
| **Screen reader** (NVDA on Windows, VoiceOver on Mac) | whether it actually makes sense when heard |
| **Zoom to 200% / 400%**, OS "reduce motion" | layout breaking, motion sickness |

Automated tools find maybe **30–40%** of issues. The keyboard walkthrough is the cheapest high-value manual check.

---

<a name="i18n-approaches"></a>
# 7. The two approaches: compile-time vs runtime

| | **Angular i18n** (`@angular/localize`) | **Runtime libraries** (Transloco, ngx-translate) |
|---|---|---|
| How | translations are **baked into a separate build per language** | one build; translations loaded as JSON at runtime |
| Switching language | reload into another build (e.g. `/fr/`) | instantly, no reload |
| Performance | best — no lookup at runtime, smaller per-locale bundles | small runtime cost; translations fetched |
| Missing translation | caught at build time | appears at runtime as the key |
| Tooling | `ng extract-i18n` → XLIFF/JSON files for translators | JSON files you manage; good editor plugins |
| Good for | public sites, SEO, few language switches | apps where users switch language often, translations edited without redeploy |

Either is a legitimate choice — say *why* you'd pick one.

---

<a name="localize"></a>
# 8. ⭐ Angular's built-in i18n (`@angular/localize`)

```bash
ng add @angular/localize
```

**1. Mark text** in templates with `i18n`, and in TypeScript with `$localize`:

```html
<h1 i18n="@@employeesTitle">Employees</h1>                 <!-- @@id = a stable id -->
<input i18n-placeholder placeholder="Search by name" />     <!-- translate an attribute -->
<p i18n="page meaning|description for translators">Welcome back, {{ name() }}</p>
```

```ts
toast = $localize`:@@savedToast:Employee saved`;
```

**2. Extract** the messages into a file for translators:

```bash
ng extract-i18n --output-path src/locale        # creates messages.xlf (or --format json)
```

**3. Translate** — copy to `messages.fr.xlf`, fill in `<target>`s.

**4. Build** one bundle per language (in `angular.json`: `"i18n": { "sourceLocale": "en", "locales": { "fr": "src/locale/messages.fr.xlf" } }` and `"localize": true`):

```bash
ng build          # → dist/app/browser/en/ and dist/app/browser/fr/
```

Serve each folder at its own path (`/en/`, `/fr/`) with the right `<base href>`, and redirect users by their browser language or a chosen setting.

> 🧠 **Remember:** **mark → extract → translate → build per locale.** Use `@@ids` so text edits don't break translations.

---

<a name="icu"></a>
# 9. Plurals and gender — ICU messages

Languages pluralise differently (Russian and Arabic have several plural forms), so don't build sentences with `count + ' items'`:

```html
<span i18n>
  {count, plural,
    =0 {No messages}
    =1 {One message}
    other {{{count}} messages}
  }
</span>

<span i18n>{gender, select, female {She} male {He} other {They}} replied</span>
```

Also: **never concatenate translated fragments** (`'Hello ' + name + ', you have'…`) — word order differs between languages. Translate the whole sentence with placeholders.

---

<a name="locale"></a>
# 10. Dates, numbers, currency and `LOCALE_ID`

Angular's `DatePipe`, `DecimalPipe`, `CurrencyPipe`, `PercentPipe` format according to the **locale**:

```html
{{ price | currency:'INR' }}         <!-- ₹1,999.50 in en-IN -->
{{ today | date:'longDate' }}        <!-- 15 January 2026 / 15 janvier 2026 -->
{{ 1234567.891 | number:'1.0-2' }}   <!-- 12,34,567.89 in en-IN; 1 234 567,89 in fr -->
```

- With `@angular/localize` per-locale builds, the locale is set for each build automatically.
- Otherwise provide it: `{ provide: LOCALE_ID, useValue: 'en-IN' }` (and `registerLocaleData(localeEnIn)` for non-`en-US` locales in apps not using the localize builder).
- Time zones: the date pipe uses the browser's time zone unless you pass one: `{{ d | date:'short':'+0530' }}`. Store UTC, format locally ([javascript Part 28 §5](../javascript/28-numbers-and-dates.md)).
- In TypeScript, use `Intl.NumberFormat` / `Intl.DateTimeFormat` with the same locale.

---

<a name="rtl"></a>
# 11. Right-to-left languages

Arabic, Hebrew, Urdu and Farsi read right to left. Set `dir="rtl"` on `<html>` (the localize build does this for RTL locales) and write direction-neutral CSS:

```css
/* ❌ breaks in RTL */  .icon { margin-left: 8px; }
/* ✅ flips automatically */  .icon { margin-inline-start: 8px; }
```

Use **logical properties** (`margin-inline-start`, `padding-inline-end`, `inset-inline-start`, `text-align: start`). Angular Material and the CDK support RTL via the `Directionality` service (`dir` attribute).

---

<a name="interview"></a>
# 12. Interview Q&A

### Q: How do you make an Angular app accessible?
Semantic HTML first — real buttons, links, labels, headings and landmarks — and ARIA only where no native element exists. Everything usable by keyboard with visible focus; modals that trap and restore focus; focus moved and page titles set on route changes; dynamic messages announced with `LiveAnnouncer` or live regions; sufficient contrast and alt text. I lean on Material and the CDK a11y tools, lint with angular-eslint's accessibility rules, run axe in CI, and do keyboard and screen-reader checks by hand.

### Q: Why is `<div (click)>` a problem?
A div isn't focusable, doesn't respond to Enter or Space, and isn't announced as a button, so keyboard and screen-reader users can't use it. A `<button>` gives all of that for free. Adding `role="button"`, `tabindex` and key handlers to a div is possible, but it's more code to get the same result.

### Q: What should happen to focus when a modal opens and closes?
Move focus into the modal on open, keep Tab cycling inside it, close on Escape, and return focus to the element that opened it. The CDK Dialog or `cdkTrapFocus` handles this.

### Q: Angular's built-in i18n vs ngx-translate/Transloco?
Built-in i18n compiles a separate build per language — fastest at runtime, missing translations caught at build time, good for SEO — but switching language means loading a different build. Runtime libraries load JSON translations into one build, so users can switch instantly and translations can change without a redeploy, at a small runtime cost. I'd choose based on whether users switch languages in-session.

### Q: How do you handle plurals in translations?
ICU plural messages — `{count, plural, =0 {…} =1 {…} other {…}}` — because languages have different plural rules. And translate whole sentences with placeholders, never concatenate fragments, since word order varies by language.

### Q: How does Angular format dates and currency per country?
The date, number, currency and percent pipes follow `LOCALE_ID`, which per-locale builds set automatically or you provide yourself. Time zones default to the browser's, so I store UTC and format for display.

---

<a name="summary"></a>
# 13. The 60-second summary

> *"Accessibility means everyone can use the app, and it's often a legal requirement — WCAG 2.2 AA. Start with semantic HTML, because a real `<button>` is focusable, keyboard-operable and announced properly for free; use ARIA only where no native element exists. Make everything work by keyboard with visible focus, trap and restore focus in modals, move focus and set the title on route changes, and announce dynamic messages with `LiveAnnouncer`. The CDK a11y package, Material, angular-eslint's rules and axe in CI do much of the work, plus a keyboard walkthrough by hand. For i18n, Angular's `@angular/localize` marks text with `i18n` and `$localize`, extracts it for translators and builds one bundle per locale — fast and safe, but switching language means another build; Transloco-style libraries switch at runtime instead. Use ICU messages for plurals, never concatenate fragments, let pipes format by `LOCALE_ID`, and use logical CSS properties for right-to-left languages."*

---

## Connects to

- **[Part 29 — Material & CDK](29-angular-material-and-cdk.md):** focus traps, live announcer, dialog.
- **[Part 28 — Animations](28-animations.md):** `prefers-reduced-motion`.
- **[Part 14 — Routing](14-routing.md):** route `title`, focus after navigation.
- **[Part 31 — Configuration & startup](31-configuration-and-app-startup.md):** serving per-locale builds with the right base href.

*— End of Part 30 —*
