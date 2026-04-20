# RFC: Information Architecture nawigacji

**Status:** Draft
**Data:** 2026-04-20
**Zakres:** IA nawigacji aplikacji HTG (header + mobile overlay + slide-over). Bez stylingu, bez animacji, bez rozszerzania locale.

---

## 0. Notatki robocze z lektury kodu

- **[components/SiteNav.tsx](components/SiteNav.tsx)** — główny client component headera. Łączy Locale/Font/Theme, NotificationBell, dropdown "Menu" dla zalogowanych, HeaderAuthButton dla wylogowanych i hamburger mobile. Stan lokalny: `menuOpen`, `mobileOpen` ([SiteNav.tsx:32-33](components/SiteNav.tsx:32)). Zależności: `useUserRole`, `useTranslations('Nav')`, `@/i18n-config` (Link/usePathname/useRouter), `createSupabaseBrowser`. Używany w trzech shellach (v1/v2/v3).
- **[components/NavLinks.tsx](components/NavLinks.tsx)** — cienki client component. Trzy stałe linki top-level: `/konto`, `/konto/sesje-indywidualne`, `/spolecznosc` ([NavLinks.tsx:7-11](components/NavLinks.tsx:7)). Widoczny "for all users (logged in and out)" wg komentarza, ale wszystkie trzy cele są auth-gated w middleware (`/konto*` i `/spolecznosc*` wymagają sesji). Używany w v1/v2/v3 GlobalShell.
- **[components/LocaleSwitcher.tsx](components/LocaleSwitcher.tsx)** — własny dropdown, osobny od SiteNav. Stan lokalny `open`, pisze do localStorage `htg-locale` + PATCH `/api/profile/locale` ([LocaleSwitcher.tsx:42-56](components/LocaleSwitcher.tsx:42)). Renderowany z poziomu SiteNav (desktop: [SiteNav.tsx:75](components/SiteNav.tsx:75); mobile: [SiteNav.tsx:261](components/SiteNav.tsx:261)).
- **[components/ScrollHeader.tsx](components/ScrollHeader.tsx)** — sticky wrapper z 3 stanami `top | hidden | visible` i `data-scroll-state` atrybutem ([ScrollHeader.tsx:23-53](components/ScrollHeader.tsx:23)). Wewnętrzne elementy reagują na `group-data-[scroll-state=visible|hidden]` — np. Locale/Font/Theme fade'ują się podczas scrolla ([SiteNav.tsx:74](components/SiteNav.tsx:74)).
- **[i18n-config.ts](i18n-config.ts)** — locales: `['pl','en','de','pt']` ([i18n-config.ts:4](i18n-config.ts:4)). Tylko 4, nie 6. `localePrefix: 'always'`. Pathnames per-locale dla większości tras; sekcje `/konto/admin`, `/prowadzacy`, `/publikacja`, `/tlumacz` bez tłumaczenia. LocaleSwitcher dodatkowo filtruje do `VISIBLE_LOCALES = ['pl','en','de','pt']` ([LocaleSwitcher.tsx:17](components/LocaleSwitcher.tsx:17)) — dziś zbiór pokrywa się 1:1 z `locales`.
- **[components/variants/v1/GlobalShell.tsx](components/variants/v1/GlobalShell.tsx)** — grid `auto_1fr_auto` z logo | NavLinks | SiteNav, max-w-6xl, tło solid bg-htg-card. Brak SlideOverMenu.
- **[components/variants/v2/GlobalShell.tsx](components/variants/v2/GlobalShell.tsx)** — flex justify-between, max-w-7xl, blur `bg-htg-card/60 backdrop-blur-lg`. Struktura identyczna z v1 (logo, NavLinks w środku, SiteNav po prawej). Brak SlideOverMenu.
- **[components/variants/v3/GlobalShell.tsx](components/variants/v3/GlobalShell.tsx)** — ultra-slim header z **SlideOverMenu** po lewej ([v3/GlobalShell.tsx:26](components/variants/v3/GlobalShell.tsx:26)) obok logo, plus NavLinks i SiteNav. max-w-5xl.
- **[components/variants/v3/SlideOverMenu.tsx](components/variants/v3/SlideOverMenu.tsx)** — full-height panel z 9 linkami ([v3/SlideOverMenu.tsx:13-23](components/variants/v3/SlideOverMenu.tsx:13)), w tym: Nagrania, Spotkania, Momenty, Społeczność, Wiadomości, Znajomi, Podarowane sesje, Aktualizacja, Pytania badawcze. Częściowo duplikuje zawartość dropdownu z SiteNav.
- **[middleware.ts](middleware.ts)** — auth-gate wszystkiego poza `PUBLIC_PATHS = ['/login','/privacy','/terms','/auth','/host','/host-v2','/host-v3','/host-v4','/pilot']` ([middleware.ts:46](middleware.ts:46)). Odczyt roli po stronie klienta (`useUserRole`) dla UI; server-side bramki dla admin/staff/translator w podkatalogach. Consent gate dla `/konto/*` (poza `/konto/zgody` i admin).
- **[lib/useUserRole.ts](lib/useUserRole.ts)** — czyta `profiles.role` z Supabase + fallback do email allowlist. Udostępnia `isAdmin | isStaff | isTranslator | isLoggedIn` ([useUserRole.ts:18-27](lib/useUserRole.ts:18)).
- **[app/[locale]/layout.tsx](app/[locale]/layout.tsx)** — wybiera shell przez cookie: `variant === 'v3' ? V3 : v2 ? V2 : V1` ([layout.tsx:155-157](app/[locale]/layout.tsx:155)). Switcher UI widoczny tylko dla userów przechodzących `canSwitchVariant(email)` ([layout.tsx:151](app/[locale]/layout.tsx:151)) — czyli wariant jest **produkcyjnie wybrany przez cookie**, nie per-user; admini/testerzy mogą go zmieniać.
- **[components/DesignVariantSwitcher.tsx](components/DesignVariantSwitcher.tsx)** — floating pill bottom-left, 3 przyciski v1/v2/v3, server action `setDesignVariant`.

---

## 0.5 Stan faktyczny routingu vs docelowy model produktowy

Ważne rozróżnienie, które RFC trzyma oddzielnie:

- **Stan faktyczny routingu (ground truth).** Middleware na głównym hoście gate'uje **wszystko** poza listą `PUBLIC_PATHS = ['/login','/privacy','/terms','/auth','/host','/host-v2','/host-v3','/host-v4','/pilot']` ([middleware.ts:46](middleware.ts:46)). To znaczy: `/` (landing), `/sesje`, `/sesje-indywidualne`, `/subskrypcje`, `/momenty/share/[token]` **nie są dziś publiczne**. Niezalogowany user wchodzący na `/` jest redirectowany na `/login`.
- **Docelowy model produktowy (hipoteza).** Istnienie osobnych pathnames per-locale dla `/sesje`, `/sesje-indywidualne`, `/subskrypcje` w [i18n-config.ts:27-44](i18n-config.ts:27) sugeruje intencję marketingową (strony do SEO, shareable). Nazewnictwo wariantów `/host-v2..v4` jako publicznych potwierdza, że marketing-landingi są rozważane.

**Konsekwencja dla IA:** wszystko, co niniejszy RFC mówi o "public shell", "MarketingLinks" czy "Desktop public" w sekcji 4, jest **propozycją docelowego modelu**, a nie opisem istniejącej IA. Jeśli produkt zdecyduje, że główny host nie ma w docelowym modelu publicznego headera (bo całość wymaga logowania i strony marketingowe żyją pod subdomenami typu `pilot.place` / `/host`), to cała propozycja 4.1 i 4.3 upada i zostaje tylko account shell.

To pytanie wylądowało jako decyzja #0 w sekcji 3.

---

## 1. Stan obecny (ground truth)

### 1.1 Komponenty składające się na header

| Komponent | Plik | Rola |
|---|---|---|
| `ScrollHeader` | [components/ScrollHeader.tsx](components/ScrollHeader.tsx) | Sticky kontener z atrybutem `data-scroll-state` |
| `HeaderLogo` | [components/HeaderLogo.tsx](components/HeaderLogo.tsx) | Logo + link do `/` |
| `NavLinks` | [components/NavLinks.tsx](components/NavLinks.tsx) | 3 linki top-level (Nagrania/Sesje/Społeczność) |
| `SiteNav` | [components/SiteNav.tsx](components/SiteNav.tsx) | Dropdown "Menu", mobile overlay, Locale/Font/Theme, bell, auth button |
| `LocaleSwitcher` | [components/LocaleSwitcher.tsx](components/LocaleSwitcher.tsx) | Osobny dropdown, montowany wewnątrz SiteNav |
| `FontSizeToggle` | [components/FontSizeToggle.tsx](components/FontSizeToggle.tsx) | Toggle rozmiaru fontu |
| `ThemeToggle` | [components/ThemeToggle.tsx](components/ThemeToggle.tsx) | Toggle motywu |
| `HeaderAuthButton` | [components/HeaderAuthButton.tsx](components/HeaderAuthButton.tsx) | CTA "Zaloguj" dla wylogowanych |
| `NotificationBell` | [components/community/NotificationBell.tsx](components/community/NotificationBell.tsx) | Licznik powiadomień społeczności |
| `SlideOverMenu` | [components/variants/v3/SlideOverMenu.tsx](components/variants/v3/SlideOverMenu.tsx) | **Tylko v3** — panel z linkami od lewej |

### 1.2 Stan lokalny

- `SiteNav`: `useState` `menuOpen`, `mobileOpen` ([SiteNav.tsx:32-33](components/SiteNav.tsx:32)); `useRef` na dropdown; dwa `useEffect` (outside-click, route-change close).
- `LocaleSwitcher`: `useState` `open`, `useRef` ([LocaleSwitcher.tsx:28-29](components/LocaleSwitcher.tsx:28)).
- `SlideOverMenu`: `useState` `open` ([v3/SlideOverMenu.tsx:30](components/variants/v3/SlideOverMenu.tsx:30)).
- `ScrollHeader`: `useState` `state`, `useRef` `lastY` ([ScrollHeader.tsx:23-24](components/ScrollHeader.tsx:23)).
- `useUserRole`: globalny hook z własnym `useState`, subskrybuje `supabase.auth.onAuthStateChange`.
- **Brak zunifikowanego nav-store/context.** Każdy dropdown zarządza własnym `open` niezależnie.

### 1.3 Elementy auth-aware

- Dropdown "Menu" i cała jego zawartość: tylko gdy `!loading && isLoggedIn` ([SiteNav.tsx:82](components/SiteNav.tsx:82)).
- `NotificationBell`: tylko zalogowani ([SiteNav.tsx:79](components/SiteNav.tsx:79)).
- `HeaderAuthButton`: tylko wylogowani ([SiteNav.tsx:183](components/SiteNav.tsx:183)).
- Linki role-gated w dropdownie: Admin (isAdmin), Operator (isStaff && !isAdmin), Panel Tłumacza (isTranslator && !isStaff && !isAdmin) ([SiteNav.tsx:147-164](components/SiteNav.tsx:147)).
- Label "Konto użytkownika" nad user menu — tylko dla `hasPrivilegedZone` ([SiteNav.tsx:123](components/SiteNav.tsx:123)).
- `NavLinks` nie jest auth-aware w kodzie komponentu, ale wszystkie trzy cele (`/konto`, `/konto/sesje-indywidualne`, `/spolecznosc`) są zablokowane przez middleware.

### 1.4 Locale

- Konfiguracja: `['pl','en','de','pt']` w [i18n-config.ts:4](i18n-config.ts:4).
- `localePrefix: 'always'` — każdy URL ma prefix.
- LocaleSwitcher pokazuje te same 4 ([LocaleSwitcher.tsx:17](components/LocaleSwitcher.tsx:17)).
- **Nie znaleziono** 22+ locale nigdzie w kodzie — to były tylko założenia wejściowego planu.

### 1.5 Warianty shella (v1/v2/v3)

- Wszystkie trzy są kompilowane i aktywne ([layout.tsx:17-19](app/[locale]/layout.tsx:17)).
- Wybór przez cookie `design-variant`, czytane w SSR ([layout.tsx:144](app/[locale]/layout.tsx:144)).
- Switcher UI — tylko dla `canSwitchVariant(email)`, więc zwykli userzy dostają jeden wariant (domyślnie v1).
- Różnice strukturalne IA:
  - v1: grid 3-kol, bez SlideOver, solid bg.
  - v2: flex, bez SlideOver, blur bg, szerszy layout.
  - v3: flex, **dodatkowy SlideOverMenu** po lewej, wąski layout, sticky player.
- Różnice w zawartości nawigacyjnej: **v3 dubluje user menu w SlideOver** — te same linki pojawiają się i w SlideOver, i w dropdownie SiteNav.

### 1.6 Elementy dziś w mobile overlay ([SiteNav.tsx:197-272](components/SiteNav.tsx:197))

- Email użytkownika (jeśli zalogowany).
- Linki `accountMenuItems` (Aktualizacje, Centrum Kontaktu) — tylko zalogowani.
- Linki `userMenuItems` (Nagrania, Sesje, Momenty, Społeczność, Znajomi, Podarowane) — tylko zalogowani.
- Linki role-gated (Admin | Operator | Panel Tłumacza).
- Przycisk Wyloguj.
- **Stopka overlay**: `LocaleSwitcher` + `FontSizeToggle` + `ThemeToggle` + (dla wylogowanych) link Zaloguj.
- Brak `NotificationBell` w mobile overlay — różnica względem desktopu.
- Brak `NavLinks` w mobile — top-level linki (Nagrania/Sesje/Społeczność) na mobile są renderowane wewnątrz overlay jako część user menu.

---

## 2. Route groups i IA

### 2.1 Public routes (bez logowania)

**Ground truth — zgodnie z [middleware.ts:46](middleware.ts:46), publiczne są wyłącznie:**

- `/login`, `/privacy`, `/terms` (+ `/auth/*` callback).
- `/host`, `/host-v2`, `/host-v3`, `/host-v4` — warianty landing dla prowadzących.
- `/pilot` — osobna marka (dodatkowo cały host `pilot.place` ma własną bramę, [middleware.ts:195](middleware.ts:195)).

**NIE są publiczne na głównym hoście (wbrew temu, co mogłoby sugerować istnienie pathnames):**

- `/` (landing, [app/[locale]/page.tsx](app/[locale]/page.tsx)) — **dziś redirect do `/login` dla niezalogowanych.**
- `/sesje`, `/sesje-indywidualne`, `/subskrypcje` — istnieją jako top-level z tłumaczeniami ([i18n-config.ts:27-44](i18n-config.ts:27)), ale gate'owane.
- `/momenty/share/[token]`, `/spolecznosc/dolacz/[token]` — mimo że semantycznie to share-landingi (token w URL sugeruje external-facing), dziś też wymagają sesji.
- `/operator-terms`, `/translator-terms` — brak w `PUBLIC_PATHS`.
- `/spotkanie/[sessionId]`, `/live/[sessionId]`, `/polaczenie/[callId]` — gate'owane mimo tokenu w URL.

**To jest luka produktowa, nie feature.** Do decyzji zespołu (pytanie #0 w sekcji 3) — czy któreś z powyższych mają być faktycznie publiczne.

### 2.2 Account routes (wymagają sesji)

- Cała gałąź `/konto/*` poza `/konto/zgody` (consent gate) i `/konto/admin` (wyższa rola).
- `/spolecznosc`, `/spolecznosc/[slug]`, `/spolecznosc/zapisane`, `/spolecznosc/dolacz/[token]`.
- Z [app/[locale]/konto/(dashboard)](app/[locale]/konto/(dashboard)): route group `(dashboard)` — sidebar + 20+ podsekcji (nagrania, sesje, momenty, pytania, polubieni, podarowane, subskrypcje, wiadomości, zamówienia, zgody, aktualizacja, spotkanie-wstepne, spotkania-grupowe, sesja-panel, watch, odbierz-prezent).
- Route group `(listening)` → `/konto/sluchaj`.

### 2.3 Role-gated routes

- `isAdmin` → `/konto/admin/*` (22+ podstron, [app/[locale]/konto/admin](app/[locale]/konto/admin)) — bez tłumaczenia.
- `isStaff` → `/prowadzacy/*` (grafik, klienci, sesje, spotkania, spotkania-htg, statystyki, symulator, symulator-live).
- `isStaff` także → `/publikacja/*` (archiwum, dodaj, edytor, moje, nagrania, sesje).
- `isTranslator` → `/tlumacz/*` (grafik, klienci, sesje) oraz `/konto/tlumacz`.

### 2.4 Proponowane grupy top-level nawigacji

Na podstawie faktycznej struktury (nie "Osobiste/Biznes/Firma"):

- **Public shell**: Landing + entry points (Zaloguj, Host).
- **User shell** (zwykły zalogowany): Nagrania (`/konto`), Sesje (`/konto/sesje-indywidualne`), Momenty (`/konto/momenty`), Społeczność (`/spolecznosc`). To 4 główne kategorie consumer-facing.
- **Utility drawer** (w każdym shellu): Aktualizacje, Wiadomości, Znajomi, Podarowane, Zgody, Wyloguj, Locale/Font/Theme.
- **Privileged zone** (role-gated, pojawia się jako osobna sekcja): Admin | Operator (`/prowadzacy`) | Publikacja | Tłumacz.

---

## 3. Decyzje do podjęcia

0. **Czy główny host w ogóle ma mieć publiczny header?**
   Dziś middleware redirectuje niezalogowanych z `/` na `/login` — cała aplikacja jest de facto closed-access na `htgcyou.com`. Marketing-landingi żyją osobno (`/host*`, `pilot.place`). Przed projektowaniem "public shella" trzeba odpowiedzieć: czy docelowo `htgcyou.com/` jest marketing-landingiem (wtedy `/sesje`, `/subskrypcje` też publiczne i RFC sekcja 4.1/4.3 ma sens), czy zostaje gated i widzimy tylko `/login` (wtedy public shell = trywialny: logo + `/login`, a cała sekcja 4.1/4.3 znika).

1. **Public vs account header — jeden komponent z wariantami czy dwa komponenty?**
   Dziś `SiteNav` zawiera obie ścieżki przez `isLoggedIn`. Czy rozbić na `<PublicSiteNav>` i `<AccountSiteNav>` dla czystszego SSR-gating (bo dziś `useUserRole` client-side powoduje miganie dla loading state)?

2. **NavLinks dla wylogowanych — co pokazujemy?**
   Wszystkie 3 cele NavLinks są auth-gated. Czy ukrywać NavLinks dla wylogowanych, pokazywać marketing-linki (`/sesje`, `/subskrypcje`), czy trzymać stałe i polegać na middleware-redirect do `/login`?

3. **Zduplikowane menu w v3 (SlideOverMenu vs SiteNav dropdown) — która jest kanoniczna?**
   [v3/SlideOverMenu.tsx:13-23](components/variants/v3/SlideOverMenu.tsx:13) ma 9 linków; [SiteNav.tsx:22-29](components/SiteNav.tsx:22) ma 6 w `userMenuItems` + 2 w `accountMenuItems`. Różnice: SlideOver ma "Pytania badawcze", "Wiadomości"; SiteNav ma "Aktualizacje", "Centrum Kontaktu". Czy konsolidować do jednej prawdy?

4. **LocaleSwitcher — zostaje osobnym komponentem czy wchłaniany do unified nav?**
   Dziś jest osobny, ale montowany z wewnątrz SiteNav. Dla przyszłego redesignu — jedno źródło open-state, czy dalej niezależne dropdowny?

5. **Scroll-state fade dla Locale/Font/Theme** ([SiteNav.tsx:74](components/SiteNav.tsx:74)) — zachowujemy tę mechanikę (elementy znikają podczas scrollowania), czy IA redesign ją eliminuje?

6. **Theme + FontSize na mobile** — dziś w stopce overlay. Zostają w drawerze, przenoszą się do `/konto/ustawienia` (nie istnieje jeszcze), czy znikają na mobile?

7. **NotificationBell na mobile** — dziś nieobecny. Czy dodać do mobile overlay header, do drawera, czy zostawić desktop-only?

8. **Privileged zone UX — sprzeczność header vs dashboard.** Dziś linki Admin/Operator/Tłumacz w headerze są **mutually-exclusive** (`!isAdmin && !isStaff` etc., [SiteNav.tsx:153-164](components/SiteNav.tsx:153)), ale account dashboard layout traktuje role **addytywnie**: admin dostaje własny zestaw + publikacja, staff ma swój, publikacja osobny ([app/[locale]/konto/(dashboard)/layout.tsx:218](app/[locale]/konto/(dashboard)/layout.tsx:218)). Decyzja "wszystkie role które user ma" dotyczy nie tylko headera, ale spójności całego portalu — rozstrzygnięcie musi objąć oba miejsca jednocześnie.

9. **Konsolidacja wariantów** — czy RFC ma planować zejście z 3 shelli do 1 (i w jakiej kolejności), czy IA ma działać równolegle dla v1/v2/v3?

10. **Consent gate UX** — `/konto/zgody` jest obsługiwana przez middleware-redirect ([middleware.ts:321](middleware.ts:321)). Czy header pokazuje cokolwiek innego dla userów z brakującymi zgodami (np. banner, zablokowane linki)?

11. **Portal shells** (`isNagrania`/`isSesja`/`isPilot` — [middleware.ts:85-87](middleware.ts:85)) — czy IA RFC je adresuje, czy są poza zakresem i pozostają z wyciętym headerem (`!isNagrania` guard w każdym GlobalShell)?

---

## 4. Propozycja IA

**Zastrzeżenie:** cała sekcja 4.1 i 4.3 (Desktop/Mobile public) zakłada pozytywną odpowiedź na decyzję #0. Jeśli główny host zostaje gated, punkty 4.1 i 4.3 sprowadzają się do `[Logo] [Locale|Theme|FontSize] [Zaloguj]` i nie wymagają nowego `MarketingLinks`.

**Zastrzeżenie #2 — shell nie jest "tylko opakowaniem".** Account area ma własny layout z warunkowym sidebarem per-rola ([app/[locale]/konto/(dashboard)/layout.tsx:174](app/[locale]/konto/(dashboard)/layout.tsx:174), [:218](app/[locale]/konto/(dashboard)/layout.tsx:218), [:252](app/[locale]/konto/(dashboard)/layout.tsx:252)) — `admin` / `staff` / `publikacja` mają zestawy sidebarów, a zwykły user nie ma sidebaru wcale. To znaczy, że IA headera i IA dashboardu **już dziś się rozjeżdżają**: header trzyma jedną listę (`userMenuItems`), a dashboard drugą (`userItems` + role zestawy). Docelowa propozycja musi zdecydować, czy to dwa niezależne poziomy IA (header = globalna, sidebar = lokalna kontekstowa) czy jedna zunifikowana. Niniejszy RFC **nie proponuje unifikacji sidebar ↔ header** — skupia się wyłącznie na headerze, ale oznacza ten rozjazd jako dług.

Założenie dla headera: jeden zestaw komponentów nawigacyjnych, parametryzowany przez `isLoggedIn` i `role`. 4 permutacje (desktop × mobile × public × account) obsługiwane przez jedną strukturę danych. Sidebar dashboardu pozostaje odrębnym subsystemem.

### 4.1 Desktop public

Layout: `[Logo] [MarketingLinks] [Locale | Theme | FontSize] [Zaloguj]`.

- `HeaderLogo` — zostaje bez zmian.
- **Nowy:** `MarketingLinks` (publiczne linki marketingowe). Dziś NavLinks pokazuje auth-gated linki wylogowanym — to bug IA. Rozwiązanie: nowy komponent lub parametryzacja NavLinks przez props `items`.
- `LocaleSwitcher`, `ThemeToggle`, `FontSizeToggle` — zostają.
- `HeaderAuthButton` — zostaje.
- **Refactor:** `SiteNav` dzieli się na `<PublicHeaderTools>` i `<AccountHeaderTools>`; w public nie ma dropdownu "Menu".

### 4.2 Desktop account

Layout: `[Logo] [AccountNavLinks] [Locale|Theme|FontSize] [Bell] [UserMenu]`.

- `AccountNavLinks` — zastępuje obecny `NavLinks` (4 cele zamiast 3: Nagrania, Sesje, **Momenty**, Społeczność). Moment jest dziś w dropdownie, ale zasługuje na top-level po IA (widoczny w SlideOverMenu jako odrębna kategoria).
- `UserMenu` (dropdown) — uproszczony: email, Utility (Aktualizacje, Wiadomości, Znajomi, Podarowane), Privileged (jedna sekcja z wszystkimi rolami które ma user), Wyloguj. "Centrum Kontaktu" → merge z Wiadomościami (do potwierdzenia czy to jest ta sama funkcja).
- `NotificationBell` — zostaje.
- **SlideOverMenu (v3) — decyzja UX, nie dedup.** Dziś to **desktopowy affordance** siedzący stale obok logo w v3 ([v3/GlobalShell.tsx:26](components/variants/v3/GlobalShell.tsx:26)); komponent jest explicite "Used on desktop and mobile" ([v3/SlideOverMenu.tsx:25](components/variants/v3/SlideOverMenu.tsx:25)). Usunięcie go nie jest więc "scaleniem duplikatu", tylko **zmianą głównego wzorca nawigacji wariantu v3** (v3 przestaje mieć lewy hamburger jako główny entry point). Alternatywy: (a) usunąć zupełnie — v3 wygląda jak v2; (b) zachować jako desktop affordance, ale zsynchronizować zawartość z UserMenu; (c) promować do persistent sidebara. Bez decyzji produktowej RFC nie rozstrzyga — flaguje jako pytanie #3.

### 4.3 Mobile public

Layout: `[Logo] [Hamburger]`. Drawer: `[MarketingLinks] [Locale|Theme|FontSize] [Zaloguj]`.

- Ten sam zestaw co desktop public, zapakowany w overlay.

### 4.4 Mobile account

Layout: `[Logo] [Bell] [Hamburger]`. Drawer: `[email] [AccountNavLinks (4 top-level)] [Utility] [Privileged] [Locale|Theme|FontSize] [Wyloguj]`.

- **Zmiana względem dziś**: `NotificationBell` dodany na pasku mobile (poza overlay, widoczny w headerze).
- **Zmiana**: top-level linki wyraźnie oddzielone od utility (dziś `userMenuItems` miesza Nagrania/Sesje/Momenty/Społeczność z Znajomi/Podarowane).

### 4.5 Komponenty: zostaje / refactor / usunięty

| Komponent | Los | Uzasadnienie |
|---|---|---|
| `ScrollHeader` | zostaje | Mechanika działa, nie jest tematem IA |
| `HeaderLogo` | zostaje | Atomowy |
| `NavLinks` | **refactor** | Parametryzacja przez `items` (public/account zestaw), dodać Momenty do account |
| `SiteNav` | **refactor/split** | Rozbić na `PublicHeaderTools` + `AccountHeaderTools` + `MobileDrawer`; obecne `userMenuItems`/`accountMenuItems` przenieść do osobnego `nav-config.ts` jako single source of truth |
| `LocaleSwitcher` | zostaje, **dług stanowy** | Działa; ma **własny `open`-state + osobny outside-click handler** ([LocaleSwitcher.tsx:28-40](components/LocaleSwitcher.tsx:28)). To jawne ograniczenie dzisiejszej IA — header ma 3 niezależne open-state (Menu, Locale, ewentualnie SlideOver) bez koordynacji. Unifikacja wymaga decyzji #4 |
| `FontSizeToggle`, `ThemeToggle` | zostają | Atomowe |
| `HeaderAuthButton` | zostaje | Atomowe |
| `NotificationBell` | zostaje, **mobile exposure** | Dodać na mobile pasku |
| `SlideOverMenu` (v3) | **usunięty lub zredefiniowany** | Decyzja #3; najprawdopodobniej usunąć i polegać na unified MobileDrawer |
| `DesignVariantSwitcher` | zostaje | Poza scope IA |

---

## 5. Migracja

Kolejność kroków. **Cel** (nie gwarancja) — każdy krok mergeable niezależnie bez regresji dla 3 shelli i auth flows. Realnie każdy krok dotyka kodu renderowanego przez SSR-cookie-switch w [app/[locale]/layout.tsx:154](app/[locale]/layout.tsx:154) i wymaga przetestowania wszystkich 3 wariantów.

**Krok 1 — Audyt dwóch list (nie scalanie).**
Wyciągnąć do `lib/nav-config.ts` jako **dwie oddzielne struktury**, nie scaloną listę: `siteNavItems` (z [SiteNav.tsx:16-29](components/SiteNav.tsx:16)) i `slideOverItems` (z [v3/SlideOverMenu.tsx:13-23](components/variants/v3/SlideOverMenu.tsx:13)). Różnice (SlideOver: `Pytania badawcze`, `Wiadomości`; SiteNav: `Aktualizacje`, `Centrum Kontaktu`, role-gated, logout) wymagają decyzji produktowej przed unifikacją — ekstrakcja je jedynie uwidacznia. Zero zmian zachowania.

**Krok 2 — Parametryzacja NavLinks.**
NavLinks przyjmuje prop `items`. v1/v2/v3 GlobalShell przekazują dotychczasową listę. Otwiera drogę do public-wariantu **jeśli** decyzja #0 to odblokuje.

**Krok 3 — SSR auth state dla headera.**
Osobny, bardziej ambitny krok niż poprzednia wersja. Żeby realnie usunąć flicker loading-state widoczny dziś z powodu client-side `useUserRole().loading` ([useUserRole.ts:29](lib/useUserRole.ts:29) robi `supabase.auth.getUser()` + osobny fetch `profiles.role` po stronie klienta), trzeba:
1. Pobrać sesję + rolę po stronie serwera w [app/[locale]/layout.tsx](app/[locale]/layout.tsx) (dokładnie to co robi już `canSwitchVariant` dla switchera).
2. Przekazać `{ user, role }` jako propsy do shelli → SiteNav.
3. `useUserRole` zostaje jako fallback dla reaktywności po `onAuthStateChange`, ale initial render ma dane z SSR, więc dropdown/menu renderuje się bez migania.

Bez tego kroku sam split komponentów nie likwiduje flickera — `<PublicSiteNav>` / `<AccountSiteNav>` wybierany przez client-side `isLoggedIn` dalej będzie migać między renderami. To zmiana znacznie szersza niż "dodać split" — wymaga dotknięcia layoutu i props-threading przez 3 shelle.

**Krok 4 — Public header split (opcjonalne, zależy od decyzji #0).**
Jeśli docelowy model produktowy ma publiczny header: dodać `<PublicSiteNav>` wybierany w GlobalShell na podstawie SSR `user` (nie client-side `isLoggedIn`). Jeśli nie: krok pomijany.

**Krok 5 — v3 SlideOverMenu (decyzja layoutowa, nie refactor).**
Ten krok **nie jest czystym deduplikowaniem danych**. Dotknięcie v3 wymaga wcześniejszej decyzji #3 (sekcja 3): czy v3 traci lewy affordance całkowicie, czy SlideOver zachowany ale z zawartością z `nav-config.ts`, czy promowany do persistent sidebara. Dopóki decyzja nie zapada, v3 zostaje bez zmian.

**Krok 6 — Mobile NotificationBell.**
Dodany warunkowy render bell na mobile pasku (poza overlay).

**Krok 7 — Top-level Momenty (i szerszy rozjazd header ↔ dashboard).**
AccountNavLinks zmienia z 3 na 4 cele. Usunięcie Momentów z `userMenuItems`. **Uwaga**: to łata tylko header. Dashboard ma własną nav ([app/[locale]/konto/(dashboard)/layout.tsx:174](app/[locale]/konto/(dashboard)/layout.tsx:174)) która dla zwykłego usera w większości wariantów nie istnieje, a dla ról uprzywilejowanych ma własne zestawy. Pełne uspójnienie header ↔ dashboard nav wymaga osobnego RFC.

**Krok 8 — Konsolidacja wariantów (opcjonalnie, długoterminowo).**
Jeśli decyzja #9 = schodzimy do 1: poza scope niniejszej migracji; osobne RFC.

---

## 6. Co JEST poza zakresem

- Animacje, transitions, CSS polish.
- Styling, kolory, typografia, ikonografia.
- Redesign footera (`Footer.tsx`).
- Rozszerzanie listy locale poza `['pl','en','de','pt']`.
- Nowy design system lub biblioteka komponentów.
- Konsolidacja shelli v1/v2/v3 do jednego (osobny RFC).
- Portal shells (`nagrania.htg.cyou`, `sesja.htg.cyou`, `pilot.place`) — mają własną logikę w middleware; IA głównej aplikacji im nie dotyka.
- Host/marketing landing pages (`/host*`) — osobne UX.
- Reorganizacja `/konto/admin/*`, `/prowadzacy/*`, `/publikacja/*`, `/tlumacz/*` wewnątrz (sidebary tych paneli).
- Pilot site (osobna marka).
- Consent gate UX (banner, blokowanie linków).
- Changes w `useUserRole` / auth flow.

---

## Pytania bez odpowiedzi (do rozmowy z zespołem produktowym)

1. Czy `/sesje`, `/sesje-indywidualne`, `/subskrypcje` mają być publiczne (marketing), czy zostają auth-gated tak jak dziś? W i18n-config są zdefiniowane jako top-level z tłumaczeniami — sugeruje to public intent.
2. Czy "Aktualizacje" i "Centrum Kontaktu" (dziś osobne pozycje w SiteNav) i "Wiadomości" (dziś w SlideOverMenu) to trzy różne produkty czy duplikujące się etykiety?
3. Czy "Pytania badawcze" (w SlideOverMenu, ukryte dla v1/v2) ma być dostępne we wszystkich shellach?
4. Czy user może jednocześnie mieć role admin + translator (zmiana IA dla role-gated zone z mutually-exclusive na additive)?
5. Czy docelowy plan to schodzenie z 3 wariantów do 1 — i jeśli tak, który wariant wygrywa (v1 to dziś prawdopodobny domyślny)?
6. Czy IA ma przewidywać persistent sidebar dla `/konto/*` (dziś już istnieje `CollapsibleSidebar` w `(dashboard)` route group)? Jeśli tak, jak się ma do headera?
7. Czy Pilot site i portale (nagrania/sesja) kiedykolwiek będą korzystać ze wspólnej IA, czy pozostają osobnymi SKU z minimalnym headerem?
8. Scope LocaleSwitcher na przyszłość — czy lista zostaje na 4 locale, czy jest plan dodania kolejnych (memory wspomina "i18n expansion" — 6 PRs).
