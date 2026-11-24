# JavaScript Study Notes — Part 28

## Numbers & Dates ⭐⭐⭐⭐☆

**Topics:** why `0.1 + 0.2 !== 0.3` · rounding and money · `NaN` and how to check for it · `parseInt` vs `Number` · safe integers · `Date` traps (0-based months, UTC parsing, time zones) · `Intl` for formatting · `Temporal`.

> **Why this part exists:** numbers and dates cause a surprising share of real bugs — prices off by a cent, a birthday shown one day early, "NaN" on screen. They're also classic quick-fire interview questions.

---

## 1. Why `0.1 + 0.2 !== 0.3`

```js
0.1 + 0.2;            // 0.30000000000000004
0.1 + 0.2 === 0.3;    // false
```

> **Definition:** every JS `number` is a **64-bit floating-point** value (the IEEE 754 standard — the same as `double` in Java/C). It stores numbers in **binary**, and many simple decimals like `0.1` can't be written exactly in binary — just like `1/3` can't be written exactly in decimal (`0.3333…`). So `0.1` is stored as a tiny bit more than 0.1, and the small errors add up.

> **Analogy 📏 — measuring with a ruler that only has 1/3-inch marks.** You can't hit exactly 1 inch; you get "very close." Binary floating point is that ruler for decimals.

This is **not a JavaScript bug** — Python, Java and C give the same answer.

**How to compare decimals:**

```js
Math.abs((0.1 + 0.2) - 0.3) < Number.EPSILON;   // true — "close enough"
```

**How to handle money: don't use decimals at all.** Store **whole cents** (integers), and only format as rupees/dollars for display:

```js
const priceCents = 1999;                    // ₹19.99 stored as 1999 paise
const totalCents = priceCents * 3;          // 5997 — exact, integers don't drift
(totalCents / 100).toFixed(2);              // "59.97" — only for display
```

For serious financial maths, a decimal library (`decimal.js`, `big.js`), or `BigInt` for whole amounts.

> 🧠 **Remember:** **money = integers (cents).** Never add prices as `0.1 + 0.2`.

---

## 2. Rounding

```js
(1.005).toFixed(2);      // "1.00" 😱 — 1.005 is really 1.00499999… in binary
Math.round(2.5);         // 3
Math.round(-2.5);        // -2  — rounds toward +∞ on .5
Math.floor(-1.5);        // -2  — floor goes DOWN, not toward zero
Math.trunc(-1.5);        // -1  — just cuts off the decimals
```

- `toFixed(n)` returns a **string**, not a number.
- For display formatting (thousands separators, currency), use `Intl.NumberFormat` (§6), not `toFixed`.

---

## 3. `NaN`, `parseInt`, and converting strings to numbers

**`NaN`** ("Not a Number") is what you get from a failed numeric operation — `Number('abc')`, `0 / 0`, `Math.sqrt(-1)`. Weirdly, its type is `'number'`, and **it's not equal to anything, even itself.**

```js
NaN === NaN;            // false
isNaN('hello');         // true  ⚠️ — converts first: Number('hello') is NaN
Number.isNaN('hello');  // false ✅ — only true for the actual NaN value
Number.isNaN(NaN);      // true
[NaN].includes(NaN);    // true  (includes uses SameValueZero)
[NaN].indexOf(NaN);     // -1    (indexOf uses ===)
```

> 🧠 **Remember:** use **`Number.isNaN`**, never the global `isNaN`.

**Converting strings to numbers — they behave differently:**

| Input | `Number(x)` | `parseInt(x, 10)` | `parseFloat(x)` | `+x` |
|---|---|---|---|---|
| `'42'` | 42 | 42 | 42 | 42 |
| `'42px'` | NaN | **42** (stops at first non-digit) | 42 | NaN |
| `'3.9'` | 3.9 | **3** | 3.9 | 3.9 |
| `''` | **0** ⚠️ | NaN | NaN | 0 |
| `' 12 '` | 12 | 12 | 12 | 12 |
| `null` | 0 | NaN | NaN | 0 |

- **Always pass the radix** to `parseInt`: `parseInt(x, 10)`.
- Classic trick question: `['1', '2', '3'].map(parseInt)` → **`[1, NaN, NaN]`**. `map` passes `(value, index)`, so it calls `parseInt('2', 1)` and `parseInt('3', 2)` — base 1 is invalid and `3` isn't a binary digit. Fix: `.map(Number)` or `.map(s => parseInt(s, 10))`.
- ⚠️ `Number('')` is `0` — an empty form field silently becomes zero. Check for empty input first.

---

## 4. Big numbers: safe integers & `BigInt`

Integers are exact only up to **`Number.MAX_SAFE_INTEGER` = 2⁵³ − 1 = 9,007,199,254,740,991.** Above that, numbers start skipping:

```js
9007199254740992 === 9007199254740993;   // true 😱
Number.isSafeInteger(2 ** 53);           // false
```

**Real bug:** an API returns a 64-bit id like `1234567890123456789` (Twitter, Discord, database `BIGINT`s). `JSON.parse` turns it into a `number` and **silently changes the last digits.** Fix: send big ids as **strings** in JSON, or use `BigInt` (`123n`) in code. Note `JSON.stringify` can't serialize a `BigInt` by default — it throws.

Also: `Infinity`, `-Infinity` (`1 / 0`), and `-0` (`Object.is(-0, 0)` is `false` — [Part 00 §9](00-js-fundamentals.md)).

---

## 5. Dates — the traps

**Trap 1 — months start at 0, days start at 1:**

```js
new Date(2026, 0, 15);    // 15 January 2026  (month 0 = January)
new Date(2026, 12, 1);    // 1 January 2027 — overflows into next year, no error
date.getDay();            // day of the WEEK (0 = Sunday); getDate() is the day of the month
```

**Trap 2 — the same-looking string is parsed in different time zones:**

```js
new Date('2026-01-15');           // date-only ISO string → treated as UTC midnight
new Date('2026-01-15T00:00');     // date + time, no zone → treated as LOCAL time
```

So in India (UTC+5:30) the first is 5:30 a.m. on the 15th, but in New York (UTC−5) it's **7 p.m. on the 14th** — a birthday shown one day early. Other formats (`'01/15/2026'`) depend on the browser — never parse those.

**Trap 3 — `Date` objects are mutable:**

```js
const start = new Date();
const end = start;
end.setDate(end.getDate() + 7);   // ⚠️ start changed too — same object
const end2 = new Date(start);     // ✅ copy first
```

**Rules that avoid most date bugs:**
- **Store and send dates in UTC**, as ISO strings with a `Z` (`2026-01-15T10:30:00Z`) or as timestamps (`Date.now()`, milliseconds since 1970).
- **Convert to local time only when displaying**, with `Intl` (§6).
- A **date without a time** (a birthday, a due date) is not a moment in time — store it as the string `'2026-01-15'` and don't turn it into a `Date` at midnight.
- Measuring durations: use `performance.now()` (doesn't jump if the system clock changes).

**`Temporal`** — a new built-in date/time API (`Temporal.PlainDate`, `Temporal.ZonedDateTime`, …) that fixes all of this: immutable, months start at 1, explicit time zones. It's rolling out in browsers; until it's everywhere, libraries like `date-fns`, `dayjs` or `Luxon` are the usual choice.

> 🧠 **Remember:** **months from 0 · store UTC · show local · copy before changing.**

---

## 6. `Intl` — formatting for humans

`Intl` formats numbers, money, dates and lists correctly for any language and country — no libraries needed.

```js
new Intl.NumberFormat('en-IN').format(1234567.891);                         // "12,34,567.891"
new Intl.NumberFormat('en-US').format(1234567.891);                         // "1,234,567.891"
new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(1999.5);   // "₹1,999.50"
new Intl.NumberFormat('en', { notation: 'compact' }).format(1_250_000);     // "1.3M"

new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
  .format(new Date('2026-01-15T10:30:00Z'));                                // "15 Jan 2026, 4:00 pm"

new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(-1, 'day');   // "yesterday"
new Intl.ListFormat('en', { type: 'conjunction' }).format(['A', 'B', 'C']); // "A, B, and C"
['é', 'e', 'z'].sort(new Intl.Collator('fr').compare);                      // language-aware sorting
```

Create the formatter **once** and reuse it — creating one is relatively expensive.

---

## Interview Q&A

**Q: Why is `0.1 + 0.2` not `0.3`?**
> JavaScript numbers are 64-bit binary floating point, and decimals like 0.1 can't be represented exactly in binary, so tiny rounding errors appear. Every language using IEEE 754 does this. Compare with a tolerance like `Number.EPSILON`, and for money store integer cents or use a decimal library.

**Q: `isNaN` vs `Number.isNaN`?**
> The global `isNaN` converts its argument to a number first, so `isNaN('hello')` is true. `Number.isNaN` only returns true for the actual `NaN` value. Always use `Number.isNaN`. `NaN` is also never equal to itself, so `x === NaN` never works.

**Q: What does `['1','2','3'].map(parseInt)` return?**
> `[1, NaN, NaN]`. `map` passes the index as the second argument, which `parseInt` reads as the radix — `parseInt('2', 1)` and `parseInt('3', 2)` are invalid. Use `.map(Number)` or pass the radix explicitly.

**Q: A user's birthday shows one day early. What happened?**
> Most likely `new Date('2026-01-15')` — a date-only ISO string is parsed as UTC midnight, and displaying it in a time zone behind UTC shows the previous day. Treat date-only values as plain strings, or parse them as local dates, and only convert real moments in time between UTC and local.

**Q: How would you store and display dates in an app used in many countries?**
> Store and transmit moments as UTC — ISO strings with `Z` or timestamps — and convert to the user's time zone only when displaying, with `Intl.DateTimeFormat`. Store date-only values like birthdays as `YYYY-MM-DD` strings. Use a date library or `Temporal` for date arithmetic.

**Q: Why might a large id from an API be wrong in the browser?**
> Numbers are only exact up to 2^53 − 1. A 64-bit id parsed by `JSON.parse` becomes a number and loses its last digits. The API should send such ids as strings, or the client should use `BigInt` with a custom parser.

---

## Follow-ups (challenge questions)

- *Failure mode:* a shopping cart sums `item.price * qty` with prices like `19.99` and shows `59.97000000000001`. Where would you fix it — at storage, calculation, or display — and why is "just `toFixed(2)` at the end" not enough for invoices?
- *Consistency:* a server in UTC creates "today's report" at midnight; users in India see yesterday's date on it. Walk through what "today" means for each side.

---

## Cheat Sheet

```
0.1 + 0.2 = 0.30000000000000004 → binary floating point, not a JS bug
compare: Math.abs(a - b) < Number.EPSILON · MONEY = INTEGER CENTS (or decimal lib)
toFixed → string, and (1.005).toFixed(2) = "1.00" · display: Intl.NumberFormat

NaN !== NaN · use Number.isNaN (not isNaN) · includes(NaN) ✅ indexOf(NaN) ❌
Number('') = 0 ⚠️ · parseInt('42px', 10) = 42 · ALWAYS pass radix
['1','2','3'].map(parseInt) = [1, NaN, NaN]
safe up to 2^53 − 1 · big ids → strings / BigInt · JSON.stringify(1n) throws

DATES: months 0-11 · getDay = weekday, getDate = day of month
'2026-01-15' = UTC midnight · '2026-01-15T00:00' = local ⚠️
Date is mutable → new Date(d) to copy
store UTC (ISO + Z / timestamp) · show local with Intl.DateTimeFormat
date-only (birthday) → keep as 'YYYY-MM-DD' string
Temporal = the fix (rolling out) · meanwhile date-fns / dayjs / Luxon
Intl: NumberFormat (currency, compact) · DateTimeFormat · RelativeTimeFormat · ListFormat · Collator
```

---

**Previous:** [Part 27 — Workers & Parallelism](27-workers-and-parallelism.md) · **Next:** [Part 29 — Strict Mode & Coercion Deep Dive](29-strict-mode-and-coercion-deep-dive.md)
