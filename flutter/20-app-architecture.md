# Flutter Study Notes — Part 20

## App Architecture ⭐⭐⭐⭐☆

**Topics:** layered/clean architecture (presentation → domain → data) · why the domain layer shouldn't import Flutter · feature-first vs layer-first structure · DI in Flutter · MVVM mapped onto Flutter.

---

## 1. Layered/Clean Architecture Applied to Flutter

> **Definition:** a three-layer separation — **presentation** (widgets + the state-management layer driving them — BLoC/Cubit/Riverpod/`ChangeNotifier`), **domain** (business logic, use cases, entities — pure, framework-agnostic rules), **data** (repositories, data sources — the actual HTTP client/database, [Part 13](13-networking-and-json-serialization.md)) — each layer depending only on the one(s) beneath it, never the reverse.

```
presentation  →  domain  →  data
(widgets,        (business    (repositories,
 BLoC/Cubit/       logic,       HTTP clients,
 Riverpod)         entities,    local DB)
                   use cases)
```

```dart
// DOMAIN — pure Dart, no Flutter import, no HTTP import, just the RULE
class CalculateOrderTotal {
  double call(List<OrderItem> items, double taxRate) {
    final subtotal = items.fold(0.0, (sum, item) => sum + item.price * item.quantity);
    return subtotal * (1 + taxRate);
  }
}

// DATA — knows about Dio/HTTP, implements a domain-defined interface
class ApiOrderRepository implements OrderRepository {
  final Dio _dio;
  ApiOrderRepository(this._dio);
  @override
  Future<List<OrderItem>> getItems(String orderId) async { /* ... */ return []; }
}

// PRESENTATION — knows about widgets/BLoC, orchestrates domain + data
class OrderCubit extends Cubit<OrderState> {
  final OrderRepository _repository;
  final CalculateOrderTotal _calculateTotal;
  OrderCubit(this._repository, this._calculateTotal) : super(OrderInitial());
  Future<void> loadOrder(String id) async {
    final items = await _repository.getItems(id);
    final total = _calculateTotal(items, 0.08);
    emit(OrderLoaded(items, total));
  }
}
```

## 2. Why the Domain Layer Shouldn't Import Flutter

> **The rule:** domain-layer classes (`CalculateOrderTotal`, entity classes, use-case classes) should have **zero** `package:flutter/...` imports — pure Dart only.

**Why, precisely:** business rules ("how is an order total calculated," "what makes a user eligible for a discount") are conceptually independent of *how* they're displayed or *where* the data came from — they should be identical whether displayed via a widget, run in a backend service, or invoked from a CLI script. Keeping the domain layer pure-Dart means it can be [unit tested with the plain Dart `test` package](../dart/16-testing-in-dart.md#5-pure-dart-unit-test-vs-flutter-widget-test) — no widget tree, no simulated rendering — and, concretely, it's shared, reused, and testable in exactly the same way whether or not Flutter is even part of the picture. A domain class importing `flutter/material.dart` is a signal that presentation logic has leaked somewhere it doesn't belong.

## 3. Feature-First vs Layer-First Folder Structure

> **Definition — Layer-first:** top-level folders are the architectural layers (`presentation/`, `domain/`, `data/`), with each feature's files scattered across all three. **Feature-first:** top-level folders are features/domains (`orders/`, `auth/`, `profile/`), each internally organized by layer.

```
// LAYER-FIRST                          // FEATURE-FIRST
lib/                                    lib/
  presentation/                           orders/
    order_screen.dart                       presentation/order_screen.dart
    profile_screen.dart                      domain/calculate_order_total.dart
  domain/                                    data/api_order_repository.dart
    calculate_order_total.dart              auth/
    validate_profile.dart                     presentation/login_screen.dart
  data/                                       domain/...
    api_order_repository.dart                 data/...
    api_profile_repository.dart
```
**The scaling argument for each:** layer-first is simple and intuitive for a small app, but as feature count grows, understanding or modifying "everything related to Orders" means jumping between three distantly-separated top-level folders, and it's easy for unrelated features' files to become interleaved and hard to isolate. Feature-first keeps everything related to one feature colocated, making it much easier to reason about, test, or even physically extract a whole feature (into a separate package/module) in isolation — the tradeoff is slightly more nested structure per feature and a bit more upfront folder-scaffolding per new feature added.

## 4. Dependency Injection in Flutter

> **Definition:** providing a class's dependencies (a repository, a use case) from the outside rather than having it construct them internally — enabling substitution (a mock in tests, a different implementation in different environments). Common approaches: **manual** constructor injection (as shown in §1), **`get_it`** (a simple service-locator package), **`injectable`** (code-generation on top of `get_it`), or letting Riverpod's own provider graph serve as the DI mechanism directly.

```dart
// get_it — service locator style
final getIt = GetIt.instance;
void setupDependencies() {
  getIt.registerLazySingleton<Dio>(() => Dio());
  getIt.registerLazySingleton<OrderRepository>(() => ApiOrderRepository(getIt<Dio>()));
}
// usage, anywhere:
final repository = getIt<OrderRepository>();

// Riverpod as DI — the provider graph itself IS the dependency graph (Part 09)
final dioProvider = Provider((ref) => Dio());
final orderRepositoryProvider = Provider((ref) => ApiOrderRepository(ref.watch(dioProvider)));
```

## 5. MVVM as It Maps onto Flutter

> **Definition:** Model-View-ViewModel maps onto Flutter reasonably directly — **View** is the widget tree (`build()` methods, purely declarative rendering), **ViewModel** is whatever holds and exposes UI-ready state and handles user actions (a `Cubit`, a `Bloc`, a `ChangeNotifier`, or a Riverpod `StateNotifier` — the exact tool varies, but the *role* is consistent), and **Model** is the domain/data layers underneath.

```
View (widget, build())  ⇄  ViewModel (Cubit/ChangeNotifier/StateNotifier)  ⇄  Model (domain + data)
   dumb, declarative           holds state, exposes methods,                  business logic,
   rendering only               calls into the Model layer                     data access
```
The View should ideally contain **zero** business logic — it renders whatever the ViewModel currently exposes and forwards user actions to it, mirroring the exact same "presentation is dumb, logic lives elsewhere" principle as [Angular's smart vs dumb component pattern](../Angular/23-architecture-and-patterns.md).

---

## Interview Q&A

**Q: Why shouldn't the domain layer have any Flutter imports?**
> Business rules are conceptually independent of how they're displayed or where their data comes from — they should behave identically whether invoked from a widget, a backend service, or a test script. Keeping the domain layer pure Dart means it's testable with the plain, fast `test` package with no widget tree needed at all, and it stays genuinely reusable and framework-agnostic. A Flutter import appearing in domain code is a signal that presentation concerns have leaked into a layer that should be indifferent to them.

**Q: Feature-first vs layer-first folder structure — what's the scaling argument for feature-first?**
> Layer-first groups files by architectural role first, feature second — which is simple for a small app but means understanding or changing everything related to one feature requires jumping across several distant top-level folders as the app grows, and unrelated features' files become interleaved. Feature-first colocates everything related to one feature, making it far easier to reason about, test, or extract a whole feature in isolation as the app scales, at the cost of a bit more structural boilerplate per feature.

**Q: How does MVVM map onto a typical modern Flutter app?**
> The View is the widget tree — purely declarative rendering with no business logic of its own. The ViewModel is whatever state-management construct holds UI-ready state and exposes methods for user actions to call — a Cubit, Bloc, ChangeNotifier, or Riverpod StateNotifier, the specific tool varies but the role is consistent. The Model is the domain and data layers beneath, providing the actual business rules and data access the ViewModel orchestrates.

---

## Follow-ups (challenge questions)

- *Consistency:* a `Cubit` (nominally the ViewModel layer) directly calls `Dio().get(...)` inline instead of going through a repository interface — walk through the concrete testing and maintenance cost of this shortcut once the team later needs to add caching, switch HTTP clients, or write a unit test for that Cubit's logic without hitting a real network.
- *Scale:* a layer-first-structured app grows to 40 screens across 12 features — estimate the practical cost (in terms of file-jumping and onboarding difficulty for a new developer) versus a feature-first restructure, and identify at what rough feature count the tradeoff tends to flip in most teams' real experience.
- *Failure mode:* a `get_it`-registered singleton repository holds an internal cache that's never invalidated across the app's lifetime — walk through how this specific DI/lifecycle choice (a singleton, registered once, living forever) can cause stale data to persist far longer than intended, and contrast it with a scoped/per-screen-lifetime dependency instead.

---

**Previous:** [Part 19 — Testing](19-testing.md) · **Next:** [Part 21 — Flutter Internals](21-flutter-internals.md)
