# HTG2 — Wytyczne dla agentów AI

## Stack
Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4, Supabase (PostgreSQL + RLS + Auth), Stripe, Bunny Stream (HLS), LiveKit Cloud (WebRTC), Resend, Vercel.

## Krok 0 każdej sesji
- `git worktree list` → zamknij/usuń worktrees, nad którymi nie pracujesz
- Max 3 długowieczne worktrees per maszyna

## Branch workflow

### Tworzenie brancha
- **Zawsze nowy branch z aktualnego `origin/main`**
- Nazewnictwo: `ai/<owner>/<narzędzie>/<YYYY-MM-DD>-<cel>` (cel max 3 słowa)
  - Przykład: `ai/lk/claude/2026-04-01-auth-fix`
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

## Workflow: konwersja nagrań → Bunny → HTG2

Gdy user prosi o „konwertuj plik / wrzuć do Bunny / podepnij do usera", wykonaj poniższe kroki w kolejności.

### 1. Znajdź plik źródłowy

User podaje ścieżkę lokalną lub katalog. Jeśli katalog — plik do przetworzenia to ten o nazwie zgodnej z nazwą katalogu (bez rozszerzenia).

### 2. Konwersja do M4A (audio-only)

```bash
ffmpeg -i "plik.mp4" -vn -acodec copy "plik.m4a" -loglevel error
```

- Nigdy nie re-enkoduj audio — `-acodec copy` zachowuje jakość i jest natychmiastowe.
- Jeśli trzeba połączyć dwie ścieżki audio (dwa lektorzy):
  ```bash
  ffmpeg -i track_A.wav -i track_N.wav \
    -filter_complex "[0:a][1:a]amix=inputs=2:duration=longest:normalize=0[aout]" \
    -map "[aout]" -codec:a libmp3lame -q:a 2 output.mp3
  ```

### 3. Ustal docelowy folder na Bunny Storage (`htg2`)

| Typ sesji | Folder Bunny |
|-----------|-------------|
| Sesja 1-1 (indywidualna) | `1-1/` |
| Sesja grupowa bieżącego miesiąca | `htg-sessions-arch-MM-YYYY/` |
| Audio live / muzyka | `audio/live/` |

Folder archiwum: `htg-sessions-arch-04-2026` (rok i miesiąc sesji, nie daty uploadu).

### 4. Nazwa pliku na Bunny

Format: `Sesja <Typ> <YYYYMMDD> <Imię Nazwisko> <email>.m4a`

Przykłady:
- `Sesja 1-1 20260403 Beata Borkowska beata2b4@gmail.com.m4a`
- `Sesja z Natalią i Agatą 20260406 Anna Murawska annamurawska8682@gmail.com.m4a`

Znaki specjalne w curl: koduj przez `python3 -c "import urllib.parse; print(urllib.parse.quote('nazwa'))"`.

### 5. Upload do Bunny

```bash
curl -s -o /dev/null -w "%{http_code}" -X PUT \
  "https://storage.bunnycdn.com/htg2/<folder>/<encoded_filename>" \
  -H "AccessKey: $BUNNY_STORAGE_API_KEY" \
  -H "Content-Type: audio/mp4" \
  --data-binary @"plik.m4a"
# Oczekiwany wynik: 201
```

Credentials z `.env.local`:
- `BUNNY_STORAGE_API_KEY` — klucz do storage
- `BUNNY_STORAGE_HOSTNAME=storage.bunnycdn.com`
- Storage zone: `htg2`

### 6. Sprawdź / utwórz konto użytkownika

```typescript
// Szukaj po emailu we wszystkich stronach (max 5 × 1000)
for (let page = 1; page <= 5; page++) {
  const { data } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
  const u = data?.users?.find(u => u.email === email);
  if (u) return u;
}
// Jeśli nie znaleziono — utwórz:
await sb.auth.admin.createUser({
  email,
  email_confirm: true,
  user_metadata: { full_name: 'Imię Nazwisko' },
});
```

Używaj `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL` z `.env.local`.
Skrypty uruchamiaj z katalogu `/Users/lk/work/HTG2` przez:
```bash
env $(grep -v '^#' .env.local | xargs) npx tsx scripts/nazwa.ts
```

### 7. Utwórz rekord nagrania w DB

Tabela: `booking_recordings`

```typescript
await sb.from('booking_recordings').insert({
  source: 'import',
  status: 'ready',
  source_url: 'htg-sessions-arch-04-2026/nazwa.m4a',  // ścieżka względna w Bunny
  import_filename: 'nazwa.m4a',
  import_confidence: 'manual_review',
  session_date: '2026-04-06',   // data sesji (nie uploadu)
  title: 'Sesja z Natalią i Agatą — 2026-04-06 — Jan Kowalski',
  metadata: { cdn_path: 'htg-sessions-arch-04-2026/nazwa.m4a', parsed_email: email },
});
```

### 8. Przyznaj dostęp użytkownikowi

Tabela: `booking_recording_access`

```typescript
await sb.from('booking_recording_access').insert({
  recording_id: recId,
  user_id: userId,
  granted_reason: 'import_match',  // zawsze dla importów
});
```

Po wykonaniu kroku 8 użytkownik widzi nagranie w `/konto` → „Twoje nagrania".

### Gotowy skrypt — wzorzec

Patrz: `scripts/import-april-audio.ts` — pełny przykład dla wielu plików naraz (sprawdzenie duplikatów, tworzenie rekordów, przyznawanie dostępu).

---

## Archiwizacja i restore

- Skrypt: `./scripts/archive-worktree.sh`
- Archiwa w: `~/.htg2-archives/<branch>/`
- **Restore:** nowy branch z `origin/main` → `git apply *.patch`. Jeśli patch nie aplikuje (baza odjechała): czytaj `.patch` jako tekst → odtwórz zmiany semantycznie w nowym kodzie.
