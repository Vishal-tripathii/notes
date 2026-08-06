# Angular Study Notes — Part 09

## NgModules vs Standalone

> **Roadmap:** [Part 09](00-ROADMAP.md) · **Priority:** ⭐⭐⭐⭐☆ — modern for writing, legacy for reading.
>
> **Continues:** [Part 01 — Bootstrap](01-angular-architecture-and-bootstrap.md) · [Part 08 — DI](08-dependency-injection-and-services.md) · [Part 24 — Migration](24-legacy-vs-modern-and-migration.md).

---

## Table of Contents

1. [What NgModules were for](#what)
2. [Why it hurt](#pain) ⭐
3. [Standalone components](#standalone)
4. [`provideX()` replaces `forRoot()`](#provide)
5. [They coexist](#coexist)
6. [Migrating](#migrating)
7. [Interview Q&A](#interview)
8. [The 60-second summary](#summary)

---

<a name="what"></a>
# 1. What NgModules were for

Before Angular 14, a component couldn't be used until a module **declared** it.

```ts
@NgModule({
  declarations: [AppComponent, HeaderComponent, EmployeeCardComponent],
  imports:      [BrowserModule, HttpClientModule, RouterModule.forRoot(routes)],
  providers:    [EmployeeService],
  bootstrap:    [AppComponent],
})
export class AppModule {}
```

```
declarations  components/directives/pipes THIS module owns
imports       other modules whose exports we want to use
exports       what other modules may use from us
providers     services
bootstrap     the root component (root module only)
```

The idea was a compilation boundary — a unit bigger than a component that Angular could compile and lazy-load together.

---

<a name="pain"></a>
# 2. ⭐ Why it hurt

Three rules caused most of the pain.

**A component can be declared in exactly one module.** Declare it twice and you get *"Type X is part of the declarations of 2 modules."*

**Sharing requires a three-step dance.** To use a component from another module you must declare it, export it, then import its module:

```
ModuleA: declarations: [CardComponent]
         exports:      [CardComponent]     ← step 2, easy to forget
ModuleB: imports:      [ModuleA]           ← now <app-card> works
```

**Imports are all-or-nothing.** Import a module for one component and you pull in everything it exports — which is why tree-shaking struggled.

And the information was always in the wrong place: to know what a component depends on, you had to open a *different* file.

---

<a name="standalone"></a>
# 3. Standalone components

The component declares its own dependencies, in its own file:

```ts
@Component({
  selector: 'app-employee-list',
  imports: [EmployeeCardComponent, DatePipe, RouterLink],
  template: `…`,
})
export class EmployeeListComponent {}
```

```
NgModule    dependencies live in a SEPARATE file
Standalone  dependencies live WITH the component
```

No declarations, no exports, no module to create. To use a component elsewhere, import the component itself.

---

<a name="provide"></a>
# 4. `provideX()` replaces `forRoot()`

Modules registered features through imports, with a `forRoot()`/`forChild()` convention to avoid duplicate service instances:

```ts
imports: [HttpClientModule, RouterModule.forRoot(routes)]
```

Standalone apps use provider functions instead:

```ts
bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimations(),
  ],
});
```

Two wins: they're plain functions, so they tree-shake properly, and the `forRoot` vs `forChild` trap disappears.

---

<a name="coexist"></a>
# 5. They coexist

You don't migrate everything at once.

```ts
// use a standalone component inside an old module
@NgModule({ imports: [EmployeeCardComponent] })   // in imports, NOT declarations

// use a legacy module's providers in a standalone app
providers: [importProvidersFrom(SomeLegacyModule)]
```

⚠️ The classic mistake: putting a standalone component in `declarations`. It goes in `imports`.

---

<a name="migrating"></a>
# 6. Migrating

Angular ships a schematic that does most of it:

```bash
ng generate @angular/core:standalone
```

It runs in three passes, in this order:

```
1. convert components/directives/pipes to standalone
2. remove the now-unnecessary NgModules
3. switch main.ts to bootstrapApplication
```

---

<a name="interview"></a>
# 7. Interview Q&A

### Q: What is an NgModule?

A container that declares which components, directives and pipes belong to it, imports other modules whose exports it needs, exports what other modules may use, and registers providers. Before standalone components it was mandatory — a component was unusable until some module declared it.

### Q: Why were standalone components introduced?

NgModules were indirection that mostly created work. A component's dependencies lived in a separate file, sharing needed a declare-export-import dance, imports were all-or-nothing so tree-shaking suffered, and a component could only be declared once. Standalone components put the `imports` on the component itself, so the information lives where it's used and the module layer disappears.

### Q: What was `forRoot()` for?

It let a module be imported in the root with providers and in feature modules without them — so services like the router weren't instantiated multiple times. `provideRouter()` and friends replace it; being plain functions, they also tree-shake properly.

### Q: Can standalone and NgModules coexist?

Yes. A standalone component goes in an NgModule's `imports` array — not `declarations`. Going the other way, `importProvidersFrom()` pulls a legacy module's providers into a standalone bootstrap.

### Q: What's the difference between `imports` in an NgModule and in a component?

They look identical and mean different things. In an NgModule, `imports` takes other **modules**. In a standalone component, `imports` takes the **components, directives and pipes** its own template uses.

---

<a name="summary"></a>
# 8. The 60-second summary

> *"An NgModule declared which components belonged to it, imported other modules, exported what others could use, and registered providers. The problem was indirection: a component's dependencies lived in a different file, sharing required declaring then exporting then importing, a component could only be declared in one module, and module imports were all-or-nothing so tree-shaking suffered. Standalone components put an `imports` array on the component itself, so dependencies live with the thing that uses them. Feature registration moved from `forRoot()` module imports to provider functions like `provideRouter` and `provideHttpClient`, which tree-shake properly. The two coexist — a standalone component goes in a module's `imports`, and `importProvidersFrom` brings legacy module providers into a standalone bootstrap — and there's a schematic that migrates an app in three passes."*

---

## Connects to

- **[Part 01 — Bootstrap](01-angular-architecture-and-bootstrap.md):** `bootstrapApplication` vs `bootstrapModule`.
- **[Part 08 — DI](08-dependency-injection-and-services.md):** where providers are registered.
- **[Part 14 — Routing](14-routing.md):** lazy loading a module vs a component.
- **[Part 24 — Migration](24-legacy-vs-modern-and-migration.md):** planning a real migration.

*— End of Part 09 —*
