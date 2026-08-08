# JavaScript Study Notes — Part 06

## Strings & Regex ⭐⭐⭐☆☆

**Topics:** common string methods · template literals · regex basics (`test`, `match`, `replace`, common patterns).

---

## 1. Strings Are Primitives but Have Methods

> **Definition:** a JS `string` is an immutable primitive sequence of UTF-16 code units; string "methods" don't mutate it — they always return a brand-new string.

```js
const s = 'Hello World';
s.length;                    // 11
s.toUpperCase(); s.toLowerCase();
s.slice(0, 5);                // 'Hello' — supports negative indices
s.split(' ');                  // ['Hello', 'World']
s.trim(); s.trimStart(); s.trimEnd();
s.includes('World');            // true
s.replace('World', 'JS');        // replaces FIRST match only
s.replaceAll('l', 'L');           // replaces ALL matches
s.padStart(15, '*');               // '****Hello World'
s.at(-1);                            // 'd' — negative indexing, unlike bracket notation
```
`s[0] = 'h'` silently fails (throws in strict mode) — proof the string itself never changes.

## 2. Template Literals

> **Definition:** string literals delimited by backticks that support embedded expression interpolation (`${...}`) and multi-line text without escape characters; when prefixed by a function reference, they become a **tagged template**, invoking that function with the literal's string pieces and interpolated values passed separately.

```js
const name = 'V';
`Hello, ${name}!`;                 // interpolation
`Line 1
Line 2`;                            // multi-line, no \n needed

function highlight(strings, ...values) {  // tagged template — receives the literal
  return strings.reduce((acc, str, i) =>   // pieces and interpolated values separately
    `${acc}${str}${values[i] ? `<b>${values[i]}</b>` : ''}`, '');
}
highlight`Score: ${95}/100`; // 'Score: <b>95</b>/100' — the mechanism behind styled-components
```

## 3. Regex Basics

> **Definition:** a regular expression is a pattern object describing a set of matching strings, used with methods like `.test()` (boolean match check), `.match()`/`.matchAll()` (extract matches), and `.replace()` (substitute matches).

```js
/\d+/.test('abc123');            // true — .test() returns boolean, does it match at all
'abc123'.match(/\d+/);            // ['123', index: 3, ...] — first match + metadata
'a1b2c3'.match(/\d/g);              // ['1','2','3'] — g flag: ALL matches, simpler array
'2024-01-15'.replace(/(\d+)-(\d+)-(\d+)/, '$2/$3/$1'); // '01/15/2024' — capture groups in replacement
```

**Common patterns:**
```js
/^[^\s@]+@[^\s@]+\.[^\s@]+$/          // basic email
/^\s*$/                                 // whitespace only
/^\d+$/                                   // digits only
/^[a-zA-Z]+$/                              // letters only
```

## Hands-on

```js
const reverseString = (s) => s.split('').reverse().join('');

const isPalindrome = (s) => {
  const clean = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean === reverseString(clean);
};

const isAnagram = (a, b) => {
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '').split('').sort().join('');
  return normalize(a) === normalize(b);
};
```

---

## Interview Q&A

**Q: Are strings mutable in JS?**
> No — every string method returns a new string. `str[0] = 'x'` silently does nothing (or throws in strict mode).

**Q: `match` vs `test` vs `matchAll`?**
> `test()` on a regex returns a boolean, cheapest check. `match()` on a string returns match details (or `null`); without the `g` flag it includes capture groups and index, with `g` it's just a flat array of matches, losing group info. `matchAll()` returns an iterator of full match objects (with groups) even with `g` — the fix for that limitation.

**Q: What's a tagged template literal actually for?**
> It's a function call in disguise — the function receives the literal string pieces and the interpolated values as separate arguments, letting you control how they combine. It's the mechanism `styled-components` and safe SQL-templating libraries use to process/escape interpolated values instead of just concatenating them.

---

## Follow-ups (challenge questions)

- *Failure mode:* a regex like `/^(a+)+$/` matching against a long string of `'aaaaaaaaaaaaaaaaaaaaaaaaaaaa!'` can hang the process — what's happening (catastrophic backtracking), and how would you notice it's your regex causing a production timeout rather than "something's just slow"?
- *Security:* building a regex from user input (`new RegExp(userInput)`) — what's the actual risk, and how does it connect to the ReDoS failure mode above?

---
*(Lower priority topic — kept intentionally lean per the roadmap's ⭐⭐⭐☆☆ weighting; expand only if a real interview surfaces something specific here.)*

---

**Previous:** [Part 05 — Arrays](05-arrays.md) · **Next:** [Part 07 — Destructuring & Spread/Rest](07-destructuring-and-spread-rest.md)
