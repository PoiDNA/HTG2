# HTG2 — Wytyczne deweloperskie

## Stack
Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4, Supabase (PostgreSQL + RLS + Auth), Stripe, Bunny Stream (HLS), LiveKit Cloud (WebRTC), Resend, Vercel.

## Środowiska

| Środowisko | Branch | Vercel |
|---|---|---|
| **Production** | `main` | Current — htgcyou.com |
| **Preview** | każdy PR branch | automatyczny deploy per branch |

Zmiany wchodzą na produkcję wyłącznie przez squash merge do `main`.

## Krok 0 każdej sesji
- `git worktree list` → zamknij/usuń worktrees, nad którymi nie pracujesz
- Max 3 długowieczne worktrees per maszyna

## Branch workflow

### Tworzenie brancha
- **Zawsze nowy branch z aktualnego `origin/main`**
- Nazewnictwo: `ai/<owner>/<YYYY-MM-DD>-<cel>` (cel max 3 słowa)
  - Przykład: `ai/lk/2026-04-01-auth-fix`
- Starego brancha nigdy nie reanimuj

### Zakazy
- **ZAKAZ `git pull` i `git merge`** — wyłącznie: `git fetch origin` + `git rebase origin/main`
- **ZAKAZ globalnego formatowania** (Prettier na całym repo, masowy import sort)
- **ZAKAZ cichego update `package.json`** — nigdy nie instaluj npm packages bez zgody usera
- Jeśli instalujesz paczkę: osobny commit z package.json + package-lock.json jako pierwszy commit w PR
- **Konflikt w `package-lock.json`: NIE rozwiązuj ręcznie** → abort rebase → nowy branch z `origin/main` → odtwórz zmianę deps jako osobny krok

### Po squash merge
**Lokalny branch jest zamknięty — żadnego dalszego commita.** Squash merge zmienia hashe, branch traci powiązanie z main. Usuń worktree i branch natychmiast.

## Progi synchronizacji

**ZAWSZE `git fetch origin` przed oceną behind/ahead.**

Porównuj do `origin/main`, nie lokalnego `main`.

1. **Mały drift (≤10), bez hot-zones** → `git rebase origin/main`
2. **Średni drift (11-49) LUB dotknięte hot-zones** → rebase jeśli brak konfliktów; przy konflikcie → od razu nowy branch z `origin/main`
3. **Duży drift (>50) LUB duże konflikty (>2 pliki / >20 linii)** → abort → nowy branch → cherry-pick minimalnego scope

## Hot-zone files

Dotknięcie = wcześniejszy refresh. Konflikt w hot-zone = nowy branch.

- `middleware.ts`
- `app/layout.tsx`, `app/[locale]/layout.tsx`
- `next.config.ts`
- `package.json`, `package-lock.json`
- `lib/supabase/*.ts`
- `app/api/auth/**`

## Checklisty

### Przed commitem
- `git diff --stat` + `git status --short` — brak plików poza zakresem zadania

### Przed PR
- `npm run build` musi przejść

### Przed merge
- `gh pr status` — źródło prawdy (nie lokalny git)

### Tworzenie PR
- `gh pr edit --add-label status:active`

## Model merge

- **PR NIE dotyka CODEOWNERS** + CI green + up-to-date → `gh pr merge --auto --squash` → **zakończ pracę**
- **PR dotyka CODEOWNERS** → wystaw PR, podaj link koordynatorowi → **zakończ sesję**

## Definition of Done

- **Po merge:** natychmiast usuń worktree → usuń branch
- **Po porzuceniu:** `./scripts/archive-worktree.sh <ścieżka-lub-branch>` → dopiero potem usunięcie
- **Po auto-merge:** cleanup dopiero po faktycznym merge, nie wcześniej

## Archiwizacja i restore

- Skrypt: `./scripts/archive-worktree.sh`
- Archiwa w: `~/.htg2-archives/<branch>/`
- **Restore:** nowy branch z `origin/main` → `git apply *.patch`. Jeśli patch nie aplikuje (baza odjechała): czytaj `.patch` jako tekst → odtwórz zmiany semantycznie w nowym kodzie.
