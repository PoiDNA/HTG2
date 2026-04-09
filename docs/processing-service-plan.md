# Plan: Izolowany serwis przetwarzania dla HTG (kontekst klienta + Mapa Uwarunkowań)

> **Iteracja 15** — finalne synchronizacje z recenzji v14: (1) `attempt_id` dodany do body reserve-version i advisory write-back w §2 tabeli + §2.2 KROK 1, (2) `expected_advisory_count` transport przez status callback heartbeat przed KROK 1, (3) `processing_jobs.processing_run_id UNIQUE` constraint defensive, (4) reconcile prose zsynchronizowane z SQL (reconcile z `expected_advisory_count=NULL` + znalezione advisories → `done_partial`), (5) `done_partial` jako terminal state we wszystkich regułach lease/cleanup, (6) walidacja `advisory_type` i `subject_*` match między reserve-version/write-back i `processing_jobs` (nie tylko lease), (7) `done_partial_unknown_expected` opcjonalny sub-status (lub pojedynczy `done_partial` jako wspólny), (8) `expected_advisory_count` server-side sanity check (anomalia jeśli worker zaniża), (9) HTG2 zwraca 409 z `error_code` strings dla unique constraint violations na accepted, (10) purge webhook wording naprawiony ("inny sekret kierunkowy"), (11) global rule: walidacja `attempt_id` przed idempotency lookup we wszystkich mutacjach. Zmiany oznaczone `[v15]`.

> **Słownik nazewnictwa `[v7]`:** w dokumencie konsekwentnie używane neutralne nazwy techniczne:
> - "processing service" / "worker service" / "htg-processing" zamiast "AI processing service"
> - "flow" / "pipeline step" / "module" zamiast "agent"
> - "model call" / "external model API" zamiast "AI call"
> - "output validator" / "consistency checker" zamiast "Critic AI"
> - "wygenerowany tekst niezgodny ze źródłami" zamiast "halucynacja"
> - "zewnętrzne modele językowe (Claude, Whisper)" zamiast "AI subprocessors"
> - System "przetwarza dane i wykonuje logikę" — nie "myśli" ani "rozumie"
> - Legacy URL paths (`/api/processing/*`) bez marketingowego "AI"
> - Oficjalna nazwa produktu "Claude Agent SDK" zachowana wyłącznie jako cytowana nazwa vendor SDK; w kontekście kodu/komentarzy nazywana "vendor orchestration SDK"

## 0. Invariants — co musi być zawsze prawdą `[v3]`

Jedna strona reguł, które każde żądanie / handler / worker muszą spełniać. Jeśli któraś jest naruszona, system jest w niezdefiniowanym stanie i odmawia działania.

**I1 — Consent gate w jednym miejscu. Dossier jest immutable per run, nie cache między runami `[v13]`.** Zgoda walidowana wyłącznie po stronie HTG2 (nowa RPC + tabela `app_settings`), nigdy nie cache'owana po stronie workera. **Każdy nowy `processing_run_id` robi świeży eksport z HTG2 — żaden reuse Dossier między runami.** Tabela `dossiers` po stronie workera jest **audit trail**, nie cache: zawiera snapshot danych używanych przez konkretny run do celów debugowania (run inspector) + podstawa dla reconcile/purge/invalidacji (`consent_fingerprint` jest **atrybutem audytu** per row, używanym wyłącznie do wyszukiwania wierszy do wykasowania gdy consent się zmienił). Porównanie fingerprintów NIGDY nie pozwala pominąć ponownego wywołania HTG2 w trakcie runa — fingerprint służy do purge matching, nie do skipowania eksportu. Kod processing service ma grep-block w CI na wzorce typu `if fingerprint == cached: skip_export`.

**I2 — Logiczny snapshot per batch, bez długich transakcji DB `[v5]`.** Każdy eksport (single lub batch) ma jeden **logiczny** `snapshot_at` ustawiony na początku requestu. Batch iteruje userów **sekwencyjnie (lub w małych partiach do 4)**, każdy w osobnej krótkiej transakcji read-only (< 1s). Fingerprint sprawdzany **na początku i na końcu** per user; jeśli się zmienił w trakcie — ten user w `stale_users[]`, reszta normalnie zwraca dossier.

**Reakcja workera na `stale_users`:** jedno pełne retry całego batcha. Jeśli drugi raz ci sami userzy są stale → **traktowani jako `not_analyzable`** (nie jako fail całego joba). Job **kończy się sukcesem z częściowym wynikiem**, UC1 Group Advisor działa na uczestnikach z valid dossier.

**Formalna algebra `[v10]`.** Niech:
- `N` = liczba uczestników w żądaniu batch (input batch size),
- `NA₀` = zbiór userów `not_analyzable` wykrytych w **pre-check HTG2 przed** odpowiedzią na `export-dossiers-batch` (brak consent, brak participant row, profil, itd.). **Batch request wysłany do handlera eksportu NIE zawiera userów z NA₀** — są flagowani w odpowiedzi eksport endpointa bez próby budowy Dossier. Stały przed pipeline workera.
- Batch iteruje `{input} \ NA₀`,
- **Pierwszy przebieg** (batch iteruje `{input} \ NA₀`):
  - `A₁` = valid Dossier po pierwszym przebiegu (gate pass przy starcie I końcu, fingerprint stabilny),
  - `S₁` = **fingerprint drift z pass→pass**: user **przeszedł** gate zarówno na początku jak i na końcu przebiegu, ale **fingerprint zmienił się** (np. nowy wiersz `consent_records` z `granted=true` ale innym timestamp/template_generation — user nadal ma ważne zgody, tylko stan się zmienił) `[v11]`,
  - `NA₁` = **gate failure w trakcie**: user przeszedł gate na początku, ale **na końcu gate nie przechodzi** (np. nowy wiersz z `granted=false` — wycofanie zgody). Semantycznie: **real consent loss**, nie tylko stan refresh `[v11]`,
  - `A₁ ∪ S₁ ∪ NA₁ = {input} \ NA₀`, rozłączne,

Predykat rozróżniający:
- `A₁`: `gate(start) = pass AND gate(end) = pass AND fingerprint(start) == fingerprint(end)`
- `S₁`: `gate(start) = pass AND gate(end) = pass AND fingerprint(start) != fingerprint(end)`
- `NA₁`: `gate(start) = pass AND gate(end) = fail` (gate = `check_processing_export_consent` per booking lub meeting-level per user)
- **Drugi przebieg** (retry batcha — wszyscy z `S₁` + odświeżenie `A₁` żeby wykryć między-przebieg drift):
  - Batch retry iteruje `{input} \ NA₀ \ NA₁`,
  - `A₂` = valid Dossier po drugim przebiegu (świeży fingerprint, wszystkie gate'y passed),
  - `S₂` = `stale` po drugim przebiegu (fingerprint drift w drugim przebiegu),
  - `NA₂` = users którzy **między pierwszym a drugim przebiegiem** lub **w drugim przebiegu** stracili zgodę / participant row (np. user z `A₁` wycofał `sensitive_data` między przebiegami — jest `not_analyzable` w drugim, nie `stale`) `[v10]`,
  - `A₂ ∪ S₂ ∪ NA₂ = ({input} \ NA₀ \ NA₁)`, rozłączne,
- `analyzable` = **końcowy zbiór = `A₂`** (tylko userzy z valid Dossier po ostatnim przebiegu),
- `unusable` = `NA₀ ∪ NA₁ ∪ NA₂ ∪ S₂`.

**Kluczowa zmiana względem v9:** `NA` nie jest stały między przebiegami. V9 miało "NA stały przed pipeline" + `C` (valid w A₁, zmieniony fingerprint w A₂). V10 rozdziela:
- **drift fingerprintu w drugim przebiegu** (user nadal ma ważne zgody, po prostu fingerprint inny) → `S₂`
- **explicit loss zgody między przebiegami** (user wycofał consent, participant left meeting, soft-delete itd.) → `NA₂`

Oba scenariusze są nieakceptowalne dla UC1 advisory, ale rozróżnienie daje lepszy error reporting. V9 zbiór `C` był podzbiorem tego co teraz mieści się w `NA₂ ∪ S₂`.

**Rozłączność procesowa:** każdy user ląduje w dokładnie jednym zbiorze per ostatni przebieg w którym był evaluowany. `NA₀` (pre-check) jest rozłączne z wszystkim poniższym bo batch ich nie przetwarza. `NA₁` rozłączne z `A₁/S₁` bo pochodzą z różnych klas klasyfikacji pierwszego przebiegu. Podobnie drugi przebieg.

**Warunek sukcesu joba (per grupa, nie per meeting) `[v10]`:** UC1 advisory jest produkowany **per grupa** z proposal, nie globalnie per meeting. Wcześniejsza wersja v8-v9 miała jeden próg `|analyzable| >= K` dla całego batcha, co nie odpowiadało rzeczywistości (2 analyzable userów rozrzucnych po 3 grupach nie daje żadnej relacji w żadnej grupie). Nowy model:
- Dla każdej grupy `g` w proposal: `analyzable_g = {u ∈ g : u ∈ A₂}` (członkowie grupy z valid Dossier).
- Grupa `g` jest analyzable wtedy gdy `|analyzable_g| >= K`, gdzie `K = 2` per grupa.
- Output Group Advisor produkuje advisory **tylko dla grup analyzable**. Grupy z `|analyzable_g| < K` są w output flagowane jako `skipped: insufficient_analyzable_members`, bez propozycji.
- Job sukces: **co najmniej jedna grupa** ma advisory (`∃g: |analyzable_g| >= K`). Job failed: `∀g: |analyzable_g| < K` → `error_code='insufficient_analyzable_groups'`.

Przykłady (v10):
- N=10, 2 grupy × 5 uczestników. |NA₀|=0, |A₂|=6 (3 w g1, 3 w g2) → obie grupy analyzable → **success**, 2 advisory.
- N=10, 2 grupy × 5. |A₂|=3 (3 w g1, 0 w g2) → g1 analyzable, g2 skipped → **success** (częściowy, 1 advisory).
- N=10, 2 grupy × 5. |A₂|=2 (1 w g1, 1 w g2) → żadna grupa analyzable → **failed** insufficient_analyzable_groups.
- N=12, 3 grupy × 4. |NA₀|=8, |A₂|=4 (2 w g1, 1 w g2, 1 w g3) → tylko g1 analyzable → **success** (1 advisory).

**Brak jednej gigantycznej transakcji RR** — limit batcha N≤16, timeout 60s, tylko odczyty. Wycofane z v3: "jedna transakcja RR".

**I3 — Idempotencja write-back `[v13]`.** Każdy POST od workera do HTG2 ma `Idempotency-Key` w jednym z formatów zależnie od typu:
- **UC2 (mapa_uwarunkowan):** `{processing_run_id}:mapa_uwarunkowan:{version}` — 3 segmenty, jedna advisory per run.
- **UC1 (group_enrichment):** `{processing_run_id}:group_enrichment:{proposal_id}:{group_index}:{version}` — 5 segmentów, wiele advisory per run (po jednej per grupa).
- **Status callback `done/failed`:** `{job_id}:{terminal_status}` — niezależne od typu joba.
- **reserve-version** to nie ma `Idempotency-Key` — ma natywną idempotencję przez PK `version_reservations(processing_run_id, advisory_type, subject_key)`.

Powtórny POST z tym samym kluczem zwraca pierwszy wynik bez ponownego zapisu. **Klucz nigdy nie jest reużywany po TTL** — nowy run workera = nowy `processing_run_id` = nowy klucz.

**I4 — Każdy claim ma cytat. Narracja = strict paraphrase cited claims `[v4]`.** Każdy strukturalny claim w outpucie workera musi mieć niepuste `citations[]`, gdzie każdy citation jest poprawnym `(source_table, source_id)` istniejącym w Dossier tego runa. Dodatkowo: **pole `narrative_text` w output JSON jest definiowane promptem jako "strict paraphrase of already-cited claims w tym samym outpucie"** — nie może wprowadzać nowych fact claims. Output validator sprawdza to jako **blocking check** (nie "sygnał"). Hard validator nie łapie tego bo to NL, ale output validator blokuje. Świadome ograniczenie: narracja może być stylistycznie niedoskonała, ale prawnie nie wprowadza niecytowanej faktografii.

**I5 — Output strukturalny w polach hard-gate'owanych.** Wszystkie pola, na których działają hard validators (Python, deterministic), są **strukturalne** (enums, ID z zamkniętych list, JSON Schema). Natural language w polach narracyjnych jest poza hard validatorami — od NL bierze output validator (model call), który **też jest blocking**.

**I6 — Brak treści klienta poza glossary w embeddings.** CI grep blokuje jakikolwiek `embedding(` poza modułem `doctrine_embeddings/`. Treść klienta nigdy nie trafia do vector store.

**I7 — Brak audio binarnego po stronie workera.** Worker przetwarza wyłącznie tekst z `session_client_insights.transcript` (sesje) i — od Phase 2 — `client_recordings.transcript` (głosówki transcribowane po stronie HTG2). Żadnych signed URLs do audio, żadnych pobrań plików.

**I8 — Output validator 100% blocking dla wszystkich swoich checków. Brak override `[v8]`.** Hard validators (deterministic) + output validator (model call) razem stanowią blocking gate. Każdy check output validator — czy to schema consistency, narrative paraphrase check, vocabulary adherence w NL, czy rule-based sanity — **blokuje** przy fail. Brak rozróżnienia "sygnał vs hard fail". Output z `validator_fail` **nie trafia do staff review**, `processing_runs.status='failed'`. **Retry policy:** max 2 auto-retry z nowym seedem modelu (temperature=0.2 → 0.5), potem terminal fail. **Brak human override** — ani Natalia, ani admin techniczny nie mogą "nadpisać" validator_fail w UI. Jedyna ścieżka: zmiana promptu lub doktryny (PR-gated), re-run. False positive rate output validator mierzony w Phase 1 shadow; jeśli > 20%, trigger redesign output validator (osobny tracker). **Engineer-only debug view** w run inspectorze (nie w staff UI) pokazuje failed runs z surowym outputem + powodem validator_fail — do debugowania, nie do akceptacji.

**I9 — Doktryna immutable po tagu.** Każdy run zapisuje `doctrine_version` jako semver tag + `red_flags_version` osobno (red flags mogą ewoluować niezależnie od reszty doktryny `[v4]`). Doktryna pod tagiem nigdy się nie zmienia.

**I10 — Subject zawsze pełen, dedykowane kolumny `[v4]`.** UC1 advisory wymaga `(meeting_id, group_proposal_id)`. UC2 wymaga `user_id`. CHECK constraints w schemacie, brak NULL-a w polach kluczowych dla danego typu. **`processing_jobs` też ma dedykowane kolumny** `subject_user_id`, `subject_meeting_id`, `subject_group_proposal_id` — unique constraints na kolumnach, NIE na JSONB extract (mitygacja recenzji: JSONB NULL semantics jest zawodne).

---

## Context

HTG wspiera klientów w rozwoju duchowości, uświadamianiu i pokonywaniu ograniczeń psychiki i duchowości. Praca z klientem rozkłada się na wiele artefaktów — punkty przesyłane przed sesją (`bookings.topics`), głosówki przed/po (`client_recordings`), 3-fazowe transkrypty sesji (`session_client_insights`), nagrania i diaryzacja 5-osobowych Spotkań HTG (`htg_meeting_recordings` + `htg_speaking_events`), profile uczestników (D1/D2/D3), historyczne insights. Personel (Natalia + asystentki + admin) musi te artefakty rozumieć **łącznie**, w **doktrynie HTG**, żeby podjąć dwie decyzje:

1. **UC1 — przyporządkowanie do grup w 5-osobowych Spotkaniach.** Dziś deterministyczny algorytm w `lib/meetings/grouping.ts` (snake distribution + greedy) balansuje grupy po D1/D2/D3, z manualnym override D1. Brakuje warstwy jakościowej.
2. **UC2 — Mapa Uwarunkowań klienta.** Net-new koncept. Strukturalna mapa fizycznych i niefizycznych wpływów/manipulacji (życie, percepcja, kontakt z duszą), wersjonowana w czasie.

Serwis przetwarzania MUSI działać w **odizolowanym środowisku** (osobne repo/serwis/DB/sekrety/klucze), niezwiązanym z architekturą HTG2.

## 1. Topologia repo i deploymentu

- **Repo:** nowe `htg-processing`. Brak współdzielonego kodu.
- **Stack:** **Python 3.12 + vendor orchestration SDK** (oficjalna nazwa vendora: "Claude Agent SDK (Python)" — używamy jako nazwy zależności, w kodzie i komentarzach opisujemy jako "vendor orchestration SDK"). Decyzja usera.
- **Runtime:** Fly.io / Railway w eu-central. FastAPI + Jinja/htmx dla staff review UI. Workery Arq na Redisie (Upstash).
- **DB:** dedykowany Supabase project `htg-processing-db`. Osobne klucze, osobne RLS, osobne backupy.
- **Sekrety:** Doppler / 1Password Connect. **Osobny Anthropic workspace** dla `htg-processing` — wymaga osobnej DPA Anthropic.
- **Identyfikatory modeli:** w kodzie pinujemy snapshoty API IDs (`claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`). Marketing names tylko w README.
- **Auth dla staff:** osobny pool użytkowników (Supabase Auth projektu htg-processing).
- **Embeddings (decyzja referencyjna `[v3]`):** **Phase 0 i 1 — wyłącznie lokalne `sentence-transformers` (model multilingual MiniLM lub `paraphrase-multilingual-mpnet-base-v2`)**, bez żadnego subprocessor embeddingowego. Voyage zostaje jako opcjonalny upgrade w Phase 3 jeśli jakość polskiego nie wystarczy — wtedy z osobną DPA. **§4 i §17 zsynchronizowane: jedna decyzja, jedna ścieżka.**

## 2. Komunikacja z HTG2

| Kanał | Inicjator | Endpoint | Zawartość |
|---|---|---|---|
| Single export | worker → HTG2 | `POST /api/processing/export-dossier` | Snapshot dla `(booking_id, user_id)`. HTG2 weryfikuje HMAC + re-waliduje consent. |
| Batch export | worker → HTG2 | `POST /api/processing/export-dossiers-batch` | N userów UC1, **logiczny `snapshot_at` + krótkie odczyty per user**, `stale_users[]` jeśli fingerprint się zmienił w trakcie `[v5]` |
| ~~Write-back advisory~~ (zastąpione przez v15 poniżej) | | | |
| Job start (UC1) | HTG2 → worker | `POST /api/processing/jobs/start` | `{job_id, job_type, subject_*}`. HTG2 najpierw tworzy `processing_jobs` row z `processing_run_id`, potem wywołuje worker. |
| Job start (UC2) `[v5]` | worker → HTG2 | `POST /api/processing/jobs/create` | Staff UI workera żąda utworzenia joba; HTG2 tworzy `processing_jobs` row z `processing_run_id` i zwraca `{job_id}`. Worker wrzuca na własną kolejkę Arq. Jedno źródło prawdy dla `processing_jobs` = HTG2. |
| Job status | worker → HTG2 | `POST /api/processing/jobs/:id/status` | UC1/UC2 progress + heartbeat |
| Purge webhook | HTG2 → worker | `POST /webhooks/processing/purge` | `deleted_at` / wycofanie zgody — **ten sam format podpisu co worker→HTG2, ale sekret `HMAC_SECRET_HTG2_TO_WORKER` i nonce namespace `processing:nonce:*`** `[v15]`, weryfikowane po stronie workera |
| Consent fingerprints | worker → HTG2 | `POST /api/processing/consent-fingerprints` | Body: lista **scope items** `[{user_id, bookings_used[]}]` (nie same user_id — fingerprint jest scope-keyed `[v10]`). Resp: lista par `{scope_key, fingerprint_or_null}`. **Rate limit 1 req/s per KID, max 500 scope items per req** |
| Reserve version `[v15]` | worker → HTG2 | `POST /api/processing/advisory/reserve-version` | Body: `{processing_run_id, attempt_id, advisory_type, subject_key}`. Resp: `{version: int}`. Idempotent przez PK `version_reservations`. Lease ownership check (§8). Rate limit 10 req/s per KID (§2.1). |
| Write-back advisory `[v15]` | worker → HTG2 | `POST /api/processing/advisory` | Body dla UC2: `{processing_run_id, attempt_id, advisory_type:'mapa_uwarunkowan', subject_user_id, version, payload}`. Body dla UC1: `{processing_run_id, attempt_id, advisory_type:'group_enrichment', subject_meeting_id, subject_group_proposal_id, group_index, version, payload}`. Header `Idempotency-Key` zgodnie z I3. Lease ownership check. Rate limit 10 req/s per KID. |

**Brak** bezpośredniego dostępu workera do Postgresa HTG2.

### 2.1 Transport security

- **Sygnatura:** `HMAC-SHA256(secret, timestamp || ":" || nonce || ":" || sha256(canonical_body))`
- **Canonical body `[v4]`:** UTF-8 bytes po `JSON.stringify` z **alfabetycznym sortowaniem kluczy** (rekurencyjnie), bez whitespace. Po obu stronach ten sam serializer (Python: `json.dumps(..., sort_keys=True, separators=(',',':'), ensure_ascii=False)`; TS: równoważny). **Zakaz float** w polach podpisywanych — tylko `string | int | bool | null | array | object`. Koszty i duration jako integer w groszach/milisekundach. **Unicode NFC normalization** obowiązkowa dla wszystkich stringów (Python: `unicodedata.normalize('NFC', s)`; TS: `s.normalize('NFC')`). Kontrakt test weryfikuje identyczne bajty dla fixture JSON z polskimi znakami diakrytycznymi.
- **Headery:** `X-Processing-Timestamp`, `X-Processing-Nonce`, `X-Processing-Signature`, `X-Processing-Key-Id`. Write-back i status callbacki dodatkowo: `Idempotency-Key`.
- **Anti-replay `[v8]`:** **Współdzielony Upstash Redis** (nie LRU lokalne) — Vercel ma wiele instancji, lokalna pamięć nie deduplikuje między nimi. **Keyspace per verifier** (spójne z §20.3): HTG2 weryfikuje inbound od workera przez `SET htg2:nonce:{nonce} 1 EX 600 NX`, worker weryfikuje inbound od HTG2 przez `SET processing:nonce:{nonce} 1 EX 600 NX`. Każda strona ma ACL tylko na własny prefix (§20.3). Powtórzony nonce → `409 replay_detected`. TTL podpisu = 5 minut, TTL klucza Redis = 10 minut.
- **Model kluczy `[v5]`:** **dwa osobne HMAC secrety**, nie jeden współdzielony:
  - `HMAC_SECRET_WORKER_TO_HTG2` — podpisuje żądania z workera do HTG2 (export, write-back, job status callback, consent-fingerprints, jobs/create)
  - `HMAC_SECRET_HTG2_TO_WORKER` — podpisuje żądania z HTG2 do workera (jobs/start dla UC1, purge webhook)
  - Kompromitacja jednego sekretu nie daje pełnej impersonacji w obie strony.
- **Rotacja kluczy:** 2 active KIDs per direction (`v1`, `v2`), rotation cadence 90 dni, KID w headerze. Incident response: revoke + force rotation procedure w §20.
- **Rate limiting per endpoint `[v13]`:** każdy endpoint ma twardy limit (Redis token bucket w Upstash):
  - `export-dossier` (single): 10 req/s per KID
  - `export-dossiers-batch`: 2 req/s per KID
  - `advisory` (write-back): 10 req/s per KID (podniesione z 5/s — UC1 może wywoływać wiele write-backów per job per grupa)
  - `advisory/reserve-version`: 10 req/s per KID (podniesione z 5/s dla UC1 multi-advisory)
  - `jobs/create` (UC2 staff UI): 2 req/s per KID
  - `jobs/start` (UC1 admin): 2 req/s per KID
  - `jobs/:id/status` (status callback + heartbeat): 2 req/s per (KID, job_id) — heartbeat co 30s + retry; agregate per KID cap 50 req/s
  - `consent-fingerprints`: 1 req/s per KID
  - `purge` (HTG2 → worker): 10 req/s per KID

  Przekroczenie → `429 rate_limit` z `Retry-After` header. Każdy bucket jest w Upstash Redis key `htg2:ratelimit:{endpoint}:{KID}` lub `processing:ratelimit:{endpoint}:{KID}` zależnie od kierunku.
- **Idempotency contract:**
  - Write-back klucz `[v14]`: zdefiniowany w I3 — **jeden kontrakt w I3 jest źródłem prawdy**. UC2: `{processing_run_id}:mapa_uwarunkowan:{version}`. UC1: `{processing_run_id}:group_enrichment:{proposal_id}:{group_index}:{version}`. Żadne "generic" `{run_id}:{type}:{version}` nie obowiązuje — to był stary kontrakt z v3-v11, wycofany w v13.
  - Status callback klucz: `{job_id}:{terminal_status}` (gdzie `terminal_status ∈ {done, failed}`)
  - Powtórny POST z tym samym kluczem → 200 z tym samym wynikiem co pierwszy raz
  - **Reguła:** worker **nigdy nie reużywa** klucza po TTL — nowy run = nowy `processing_run_id` = nowy klucz.
  - **Implementacja jako DB-enforced atomic `[v9]`:** tabela `idempotency_keys(key PRIMARY KEY, response_body JSONB, response_status INT, created_at TIMESTAMPTZ)` po obu stronach (processing-service DB + HTG2 DB). **UNIQUE constraint na `key`** wymusza atomowość na poziomie DB — dwa równoległe requesty z tym samym kluczem: pierwszy wygra `INSERT ... ON CONFLICT DO NOTHING RETURNING`, drugi dostanie `0 rows affected` i musi odczytać istniejący response:
```sql
INSERT INTO idempotency_keys (key, response_body, response_status)
VALUES ($1, $2, $3)
ON CONFLICT (key) DO NOTHING
RETURNING key;
-- Jeśli 0 rows: idempotency hit, zwróć zachowany
SELECT response_body, response_status FROM idempotency_keys WHERE key = $1;
```
**Biznesowy write musi być w tej samej transakcji co insert klucza.** Dla write-back advisory:
```sql
BEGIN;
INSERT INTO idempotency_keys (key, ...) VALUES (...) ON CONFLICT DO NOTHING;
-- jeśli 0 rows → SELECT existing, ROLLBACK, return cached
INSERT INTO processing_advisories (...) VALUES (...);
UPDATE idempotency_keys SET response_body = advisory_row WHERE key = ...;
COMMIT;
```
Brak wyścigu check-then-insert. **Przechowujemy pełen response_body**, nie tylko hash, żeby drugi request zwrócił identyczną odpowiedź. Poprzednia wersja v5-v8 mówiła o "walidacji app-level sprawdza czy klucz istnieje" — to był scenariusz wyścigowy, v9 eliminuje go przez atomowy CONFLICT.
  - TTL 7 dni zarządzany background jobem (`DELETE FROM idempotency_keys WHERE created_at < now() - interval '7 days'`). Nowy klucz po TTL jest re-insertable (stary jest pokasowany). Test: inject stale entry → cleanup job → re-insert możliwy.
  - Kod workera ma asercję "klucz pochodzi z aktualnego `processing_run_id`" — to chroni przed buggy re-use w tym samym runie; kolizja kryptograficzna UUID jest poza model threat.
- **Schema versioning:** każdy export response ma `export_schema_version` (semver). Worker contract-test weryfikuje wersję w przedziale `[min, max)`. HTG2 publikuje OpenAPI 3.1 spec jako CI artefakt (nie shared code).
- **Authority callback statusu `[v13]`:** Callback `POST /api/processing/jobs/:id/status` z `done` zawiera:
  - **UC2:** `{result_advisory_id: UUID}` — singular, Mapa to jedna advisory.
  - **UC1:** `{result_advisory_ids: [{advisory_id, group_index}, ...]}` — lista par, po jednej na grupę z `|analyzable_g| >= K`.

  HTG2 kolejność walidacji (krytyczne dla lease `[v13]`): (1) walidacja `attempt_id == current_attempt_id` PRZED idempotency lookup — stary worker po utracie lease dostanie `409 lease_lost` nawet jeśli idempotency key pasuje; (2) idempotency lookup; (3) dla UC2: `result_advisory_id` istnieje z matching `processing_run_id`; (4) dla UC1: dla każdego elementu `result_advisory_ids[]` sprawdza:
  - `processing_advisories.id = advisory_id`
  - `processing_advisories.processing_run_id = job.processing_run_id` (anti-hijack)
  - `processing_advisories.subject_group_proposal_id = job.subject_group_proposal_id`
  - **`processing_advisories.group_index = callback_item.group_index`** (v13 anti-swap — bez tego worker mógłby podpiąć advisory grupy 0 pod `group_index=2`)

  W tej samej transakcji HTG2 wstawia wiersze `processing_job_advisories(job_id, advisory_id, group_index)`. Brak prior write-back lub mismatch group_index → `409 advisory_not_found` lub `409 group_index_mismatch`. Pusty `result_advisory_ids[]` w UC1 → `400 empty_advisories` (job z 0 grupami analyzable powinien już skończyć z `failed:insufficient_analyzable_groups`, nie `done`). Status idempotent (drugi callback z tym samym `Idempotency-Key` = no-op, zwraca cached response).

### 2.2 Happy path, heartbeat i recovery dla async jobów `[v5]`

**Job creation (oba UC):**
1. UC1: admin w HTG2 UI → HTG2 sam tworzy `processing_jobs` row (generuje `processing_run_id`), potem `POST /api/processing/jobs/start` do workera z `{job_id, processing_run_id, subject_*}`.
2. UC2: staff w UI workera → worker `POST /api/processing/jobs/create` do HTG2 z `{subject_user_id}`; HTG2 tworzy `processing_jobs` row (generuje `processing_run_id`) i zwraca `{job_id, processing_run_id}`; worker wrzuca na własną kolejkę Arq.
3. **Jedyne źródło prawdy dla `processing_jobs` to HTG2.** Worker trzyma własny `processing_runs` jako lustro + pracę.

**Happy path:**
1. Worker bierze job z kolejki.
2. **Check-in jako idempotentny lease z `attempt_id` `[v10]`:** worker generuje losowy `attempt_id` (UUID) dla tej próby przetwarzania. **`attempt_id` JEST wymagany we WSZYSTKICH kolejnych status callbackach dla tego joba** (running check-in, heartbeat, done, failed) — HTG2 odrzuca callbacki z `attempt_id != current_attempt_id` jako `409 lease_lost`. Worker wywołuje `POST /api/processing/jobs/:id/status` z `{status:'running', attempt_id, heartbeat_at: now}`. HTG2:
   - Jeśli job `status='pending'` → UPDATE na `running`, zapisz `current_attempt_id = $attempt_id`, return 200.
   - Jeśli job `status='running'` AND `current_attempt_id = $attempt_id` → idempotent hit, return 200 (ten sam worker powtarza check-in po utracie odpowiedzi sieciowej).
   - Jeśli job `status='running'` AND `current_attempt_id != $attempt_id` AND `last_heartbeat_at > now() - 5min` → 409 `lease_held` (inny worker trzyma żywą dzierżawę).
   - Jeśli job `status='running'` AND `current_attempt_id != $attempt_id` AND `last_heartbeat_at < now() - 5min` → zombie lease, UPDATE `current_attempt_id = $attempt_id`, return 200 (nowy worker przejmuje stare zadanie po expiry).
   - Jeśli job terminal (`done`/`failed`) → 409 `job_already_terminal`.
   - Jeśli job `status='cancelled'` (admin cancel podczas running) → 409 `job_cancelled` `[v10]`. Heartbeat loop wykrywa to → `lease_state["alive"] = False` → pipeline wait_for next check_lease → PipelineAbort → worker nie robi write-back.

   Worker czeka na 200 przed startem pipeline. Jeśli 200 zginie w sieci → worker retry z tym samym `attempt_id` → idempotent hit po stronie HTG2 → ten sam stan dzierżawy. Jeśli 409 `lease_held` → worker oddaje job do kolejki, **nie startuje pipeline**.

   **Schema extension `[v9]`:** `processing_jobs` dostaje kolumny `current_attempt_id UUID` i (już mamy) `heartbeat_at`. Test Phase 0: worker A ustawia running z attempt_1, lost 200; A retry z attempt_1 → 200 (idempotent). Worker B z attempt_2 → 409. Worker A padł; po 5 min worker C z attempt_3 → 200 (zombie takeover).
3. **Heartbeat co 30s** podczas długich kroków (Opus) `[v8]`: **osobny asyncio task** (`asyncio.create_task(heartbeat_loop(job_id))`) niezależny od głównego pipeline workera. Heartbeat wykonywany nawet podczas długiego blokującego wywołania modelu (które trwa w `asyncio.to_thread` lub równoważnym). `POST .../status` z `{status:'running', heartbeat_at}`. Brak heartbeatu > 5 min → job uważany za stuck (cleanup job). Heartbeat **jest potwierdzony 200** przed kontynuacją — utrata łączności > 90s powoduje worker abort + requeue. **Nie używamy sleepa w głównym wątku pipeline** — chroni przed sytuacją "GC pause albo długi call modelu blokuje heartbeat i cleanup fałszywie oznacza stuck".

**Lifecycle heartbeat task jako fail-fast lease `[v9]`.** Heartbeat NIE jest fire-and-forget — to **lease z fail-fast flagą**. Poprzednia wersja v8 używała `except Exception: log; return` co mogło cicho zabić pętlę, podczas gdy pipeline dalej liczył Opusa przez minuty i robił write-back → sieroty advisories + stuck job.

Wzorzec v9:
```python
# Shared state (mutable holder, widoczny z obu tasków)
lease_state = {"alive": True, "failure_reason": None}

async def heartbeat_loop(job_id, run_id, attempt_id, lease_state):
    consecutive_failures = 0
    while lease_state["alive"]:
        try:
            resp = await post_status(job_id, run_id, {
                "status": "running",
                "attempt_id": attempt_id,  # [v10] w każdym callbackcie
                "heartbeat_at": now(),
            })
            if resp.status == 200:
                consecutive_failures = 0
            elif resp.status == 409:
                # [v10] Job został anulowany (job_cancelled) lub inny worker przejął lease (lease_lost)
                body = resp.json()
                lease_state["alive"] = False
                lease_state["failure_reason"] = body.get("error", "callback_409")
                log.warn("heartbeat received 409, aborting pipeline", job_id=job_id, reason=lease_state["failure_reason"])
                return
            else:
                consecutive_failures += 1
        except (NetworkError, TimeoutError) as e:
            consecutive_failures += 1
            log.warn("heartbeat failed", attempt=consecutive_failures, error=str(e))
        if consecutive_failures >= 3:
            lease_state["alive"] = False
            lease_state["failure_reason"] = "heartbeat_lease_lost"
            log.error("heartbeat lease lost — signaling pipeline abort", job_id=job_id)
            return  # task ends, main pipeline wykryje przy następnym check
        await asyncio.sleep(30)

# Main pipeline sprawdza lease przed każdym kosztownym krokiem
async def run_pipeline(job_id, run_id, lease_state):
    check_lease(lease_state)  # raise PipelineAbort jeśli not alive
    dossier = await dossier_builder.build(...)
    check_lease(lease_state)  # PRZED Opus call
    mapa = await mapping_specialist.generate(dossier)
    check_lease(lease_state)  # PRZED write-back
    await write_back_advisory(mapa)
```

Main pipeline MUSI wywołać `check_lease()` **przed każdym kosztownym wywołaniem modelu i przed write-back**. Jeśli lease jest lost → `PipelineAbort` exception, worker nie robi write-back, job pozostaje bez sierot.

Wzorzec cleanup (gdy lease OK i pipeline normalnie kończy):
```python
try:
    hb_task = asyncio.create_task(heartbeat_loop(job_id, run_id, lease_state))
    await run_pipeline(job_id, run_id, lease_state)
    lease_state["alive"] = False  # poinformuj heartbeat o czystym exit
finally:
    hb_task.cancel()
    try:
        await asyncio.wait_for(hb_task, timeout=5)
    except (asyncio.CancelledError, asyncio.TimeoutError):
        pass
```

**Inwariant lease:** max jedna aktywna pętla heartbeat per `(job_id, run_id, attempt_id)` (patrz §2.1 attempt_id lease). Dwa workery dla tego samego `run_id` — drugi nie może startować pipeline bez uzyskania check-in confirmation z matching `attempt_id`.

Test Phase 0:
- Worker crash mid-pipeline → `hb_task.done() is True` po cleanup, lease expired, cleanup job po 5 min oznacza stuck.
- Network outage 90s → heartbeat 3 failures → `lease_state["alive"] = False` → next `check_lease()` w pipeline rzuca PipelineAbort → worker nie robi write-back → job failed z `error_code='heartbeat_lease_lost'`.
- Normal exit → `hb_task.cancel()` → `wait_for(timeout=5)` → czysty shutdown.
4. Pipeline: Dossier Builder → Reasoner → Specialist/Advisor → hard validators → output validator.
5. Sukces pipeline `[v12]`:
   - **KROK 1 (UC2):** Worker `POST /api/processing/advisory/reserve-version` → HTG2 zwraca `version`. Worker `POST /api/processing/advisory` z `Idempotency-Key = {processing_run_id}:mapa_uwarunkowan:{version}` → HTG2 zapisuje `processing_advisories` (`status='draft'`, `processing_run_id`, `subject_user_id`, `group_index=NULL`) i zwraca `{advisory_id}`.
   - **KROK 1 (UC1):** Worker dla każdej grupy `g` z `|analyzable_g| >= K` (per-group threshold z I2):
     - `POST /reserve-version` z `subject_key='group_enrichment:{proposal_id}:{group_index}'` → zwraca version dla tej grupy.
     - `POST /advisory` z `Idempotency-Key = {run_id}:group_enrichment:{proposal_id}:{group_index}:{version}` → zapisuje wiersz z `group_index`.
   - **KROK 2 (UC2):** Worker `POST /api/processing/jobs/:id/status` z `{status:'done', attempt_id, result_advisory_id}` i `Idempotency-Key = {job_id}:done`. HTG2 w jednej transakcji: weryfikuje `attempt_id`, `advisory.processing_run_id == job.processing_run_id`, `UPDATE processing_jobs SET status='done', result_advisory_id=?`.
   - **KROK 2 (UC1):** Worker `POST /status` z `{status:'done', attempt_id, result_advisory_ids: [{advisory_id, group_index}, ...]}`. HTG2 weryfikuje wszystkie advisory + wstawia `processing_job_advisories` rows + `UPDATE processing_jobs SET status='done'` (bez `result_advisory_id` — zostaje NULL dla UC1).
   - Callback z nieważnym `attempt_id` → `409 lease_lost`.
   - Kroki 1 i 2 MUSZĄ być w tej kolejności.
6. **Retry callbacka `[v5]`:** jeśli KROK 2 nie dostanie 200, worker retry z exponential backoff (1s, 3s, 9s, 27s, 81s, max 5 retry). Klucz idempotencji ten sam, więc powtórzenia są bezpieczne.
7. Staff akceptuje → `processing_advisories.status='accepted'`.

**Recovery — stuck job:**
- **Heartbeat-based detection `[v5]`:** cleanup job w HTG2 co 5 min: szuka `processing_jobs` z `status='running'` bez heartbeatu > 5 min.
- **STALE dla pending `[v6]`:** cleanup też szuka `status='pending'` z `created_at` > 10 min bez pojedynczego check-inu. To łapie scenariusz "job utworzony ale worker nigdy nie wziął" (crash kolejki, zły deploy, brak workerów). Akcja: `status='failed'` z `error_code='pending_timeout'`, admin notification. Test Phase 0: brak workerów + utworzenie joba → po 10 min `failed`.
- **Wall-clock cap `[v6]`:** każdy job ma twardą górną granicę wall-clock od `created_at`: UC1 = 30 min, UC2 = 45 min (Opus dłuższy). Przekroczenie nawet przy żywym heartbeatem → cleanup ustawia `failed` z `error_code='wall_clock_exceeded'`. Chroni przed retry-loop przez Reasoner + zmieniające się consent.
- **Reconcile przez kolumnę `processing_run_id` + type-specific multi-advisory `[v13]`:** cleanup używa dedykowanej kolumny `processing_jobs.processing_run_id`. Query per typ joba:
  - **UC2 (mapa_uwarunkowan) — singular:**
    ```sql
    SELECT advisory.id FROM processing_advisories advisory
    WHERE advisory.processing_run_id = job.processing_run_id
      AND advisory.advisory_type = 'mapa_uwarunkowan'
      AND advisory.subject_user_id = job.subject_user_id
      AND advisory.status = 'draft';
    ```
    Jeśli dokładnie jedno matching → sierota reconcile: `UPDATE processing_jobs SET status='done', result_advisory_id = found_id`. Jeśli 0 → `failed:timeout_no_advisory`. Jeśli > 1 → `failed:reconcile_ambiguous` (nie powinno się zdarzyć przez unique index, ale defensywnie).

  - **UC1 (group_enrichment) — plural `[v13]`:**
    ```sql
    SELECT advisory.id, advisory.group_index FROM processing_advisories advisory
    WHERE advisory.processing_run_id = job.processing_run_id
      AND advisory.advisory_type = 'group_enrichment'
      AND advisory.subject_meeting_id = job.subject_meeting_id
      AND advisory.subject_group_proposal_id = job.subject_group_proposal_id
      AND advisory.status = 'draft'
    ORDER BY advisory.group_index;
    ```
    Jeśli ≥ 1 matching → sierota reconcile odtwarza plural callback:
    ```sql
    BEGIN;
    INSERT INTO processing_job_advisories (job_id, advisory_id, group_index)
      SELECT job.id, a.id, a.group_index FROM found_advisories a;
    UPDATE processing_jobs SET status='done' WHERE id = job.id;
    COMMIT;
    ```
    **Reconcile z explicit partial marker `[v14]`:** `processing_jobs` dostaje nową kolumnę `expected_advisory_count INT` (NULL dla UC2, set przez worker przed KROK 1 dla UC1 = liczba grup analyzable). Reconcile sprawdza:
    ```sql
    IF count(found_advisories) = job.expected_advisory_count THEN
      status := 'done';
    ELSIF count(found_advisories) > 0 THEN
      status := 'done_partial';
      error_code := 'reconcile_partial_advisory_set';
    ELSE
      status := 'failed';
      error_code := 'timeout_no_advisory';
    END IF;
    ```
    Status `done_partial` jest nowy (enum `processing_jobs.status` rozszerzony o `done_partial`). Staff UI rozpoznaje `done_partial` i pokazuje explicit warning "Ta propozycja ma niekompletny zestaw advisory — X z Y grup. Uruchom ponownie jeśli chcesz pełen wynik." Brak tej reguły → staff widział `done` z cichą degradacją bez sygnału.

    **Reconcile z `expected_advisory_count IS NULL` `[v15]`:** jeśli worker crashnął przed heartbeat ustawiającym `expected_advisory_count` ale zdążył zapisać advisories, reconcile SQL `count(found_advisories) > 0` evaluate'uje się na true mimo NULL expected. Logika:
    - `expected_advisory_count IS NOT NULL AND count = expected` → `done`
    - `expected_advisory_count IS NOT NULL AND count < expected` → `done_partial`
    - `expected_advisory_count IS NULL AND count > 0` → `done_partial` z `error_code='reconcile_partial_unknown_expected'`
    - `count = 0` → `failed:timeout_no_advisory`

    Preferujemy `done_partial` nad `failed` gdy istnieją advisories — staff widzi istniejące wyniki zamiast tracić je do `failed` status. Warning w UI jest wystarczającym sygnałem o braku kompletności.
  - Jeśli 0 matching → `failed:timeout_no_advisory`.

  Per typ używamy **tylko kolumn NOT NULL dla danego typu** (wymuszonych przez CHECK constraints §8 i §6.1).
- **Orphan drafts GC `[v12]`:** `processing_advisories` ze `status='draft'` bez linkowania do żadnego joba — sprawdzane **w obu kierunkach** (UC2 przez `result_advisory_id`, UC1 przez `processing_job_advisories`):
```sql
UPDATE processing_advisories SET status='expired', error_code='orphan_draft_gc'
 WHERE status = 'draft'
   AND created_at < now() - interval '7 days'
   AND NOT EXISTS (SELECT 1 FROM processing_jobs WHERE result_advisory_id = processing_advisories.id)
   AND NOT EXISTS (SELECT 1 FROM processing_job_advisories WHERE advisory_id = processing_advisories.id);
```
Semantycznie odrębny od `rejected` (merytoryczne odrzucenie przez personel) — `expired` to odrzucenie operacyjne. Staff UI nie pokazuje `expired` draftów. Poprzednia v7-v11 szukała tylko przez `result_advisory_id` — UC1 orphan drafts (z multi-advisory modelu) nigdy nie były łapane.
- **Brak override dla staffu:** admin nie może ręcznie "wznowić" joba. Jedyna ścieżka: nowy job z nowym `processing_run_id`.
- **Limit retry:** `processing_jobs.retry_count` maks 2.

**Wymóg kolejki (nie konkretna semantyka biblioteki) `[v5]`:** **at-least-once delivery + idempotency po stronie workera**. Worker zachowuje się poprawnie nawet przy podwójnej dostawie tego samego joba: sprawdza `processing_jobs.status` + `heartbeat_at` przed startem; jeśli już `running` z świeżym heartbeatem, drugi worker oddaje job. Testy integracyjne muszą pokrywać scenariusz at-least-once.

## 3. Kontrakt ingestion + consent gate

### 3.0 As-is `[v3]`

Migracje `049_client_recordings_canonical`, `050_client_recordings_audit`, `051_client_insights`, `054_session_client_insights_audit`, commit `0409153` (PRE-1) — **wszystkie na `origin/main`** (zweryfikowane przeciwko `origin/main` w trakcie pisania planu, zob. footer §14). **Reguła procesowa:** Phase 0 implementacja PR-y odwołują się do migration filename + commit hash, nie do pamięci zespołu. CI sanity check w nowym repo `htg-processing`: skrypt `make verify-htg2-deps` listuje oczekiwane migration files w HTG2 i weryfikuje że istnieją w określonym tagu HTG2.

`check_analytics_consent(p_booking_id)` w `supabase/migrations/051_client_insights.sql:74-99` faktycznie:

```
RETURN count(DISTINCT user_id) FROM consent_records
  WHERE booking_id = p_booking_id
    AND consent_type = 'session_recording_capture'
    AND granted = true
  >= (CASE session_type WHEN 'natalia_para' THEN 2 ELSE 1 END)
```

Czyli: tylko liczba `session_recording_capture` ≥ wymagana liczba dla typu sesji. Nie sprawdza `sensitive_data`, feature flag, modelu wycofania, ani `template_generation`. `consent_records` w mig 001 nie ma `withdrawn_at` ani `template_version` — append-only z `granted=false` jako wycofanie wymaga eksplicytnej reguły.

### 3.1 Target gate (Phase 0 deliverables po stronie HTG2) `[v3]`

**1. Migracja: `consent_records.template_generation INT NOT NULL DEFAULT 0`** — **integer, nie string**. Etykiety `pre-0`, `pre-1` zostają w UI/dokumentacji, ale porównanie w bazie używa monotonicznego inta. Mapping w jednym miejscu (stała w `lib/consent/template.ts`):
```
TEMPLATE_PRE_0 = 0   // historyczne
TEMPLATE_PRE_1 = 1   // 0409153 — 3 fazy, zewnętrzne modele językowe (Whisper, Claude), art. 9
TEMPLATE_PRE_2 = 2   // przyszłość
```
**Reguła release:** każda zmiana copy zgody = bump `template_generation`. CI lint w `app/api/live/consent/route.ts` sprawdza że stała `CONSENT_TEMPLATE_GENERATION` została zbumpowana jeśli `consentTexts` się zmieniły.

**Backfill (jednorazowy) — content-based, nie data-based `[v6]`:**

```sql
-- Pre-check: zapisz liczbę kandydatów
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM public.consent_records
   WHERE consent_type IN ('session_recording_capture', 'session_recording_access')
     AND consent_text LIKE '%Wstęp%'
     AND consent_text LIKE '%Sesja%'
     AND consent_text LIKE '%Podsumowanie%'
     AND (consent_text LIKE '%OpenAI%' OR consent_text LIKE '%Whisper%')
     AND (consent_text LIKE '%Anthropic%' OR consent_text LIKE '%Claude%')
     AND consent_text LIKE '%art. 9%';
  -- Expected range: 5 < v_count < 10000 (sanity check)
  IF v_count < 5 OR v_count > 10000 THEN
    RAISE EXCEPTION 'Backfill sanity check failed: % matching rows (expected 5-10000). Abort.', v_count;
  END IF;
  RAISE NOTICE 'Backfill will update % consent_records rows', v_count;
END $$;

-- Actual backfill
UPDATE public.consent_records
   SET template_generation = 1
 WHERE consent_type IN ('session_recording_capture', 'session_recording_access')
   AND consent_text LIKE '%Wstęp%'
   AND consent_text LIKE '%Sesja%'
   AND consent_text LIKE '%Podsumowanie%'
   AND (consent_text LIKE '%OpenAI%' OR consent_text LIKE '%Whisper%')
   AND (consent_text LIKE '%Anthropic%' OR consent_text LIKE '%Claude%')
   AND consent_text LIKE '%art. 9%';

-- Post-check: verify no rows with PRE-1 markers remained with template_generation=0 [v7]
-- (symetria z pre-check: pełny zestaw wzorców, nie tylko dwa podzbiory)
DO $$
DECLARE v_leaked INT;
BEGIN
  SELECT count(*) INTO v_leaked FROM public.consent_records
   WHERE template_generation = 0
     AND consent_type IN ('session_recording_capture', 'session_recording_access')
     AND consent_text LIKE '%Wstęp%'
     AND consent_text LIKE '%Sesja%'
     AND consent_text LIKE '%Podsumowanie%'
     AND (consent_text LIKE '%OpenAI%' OR consent_text LIKE '%Whisper%')
     AND (consent_text LIKE '%Anthropic%' OR consent_text LIKE '%Claude%')
     AND consent_text LIKE '%art. 9%';
  IF v_leaked > 0 THEN
    RAISE EXCEPTION 'Backfill leak: % rows with full PRE-1 markers still have template_generation=0', v_leaked;
  END IF;
END $$;
```

**Rollback procedura `[v8]`:** migracja jest w jednej transakcji z trzema twardymi `RAISE EXCEPTION`: (1) pre-check `v_count < 5 OR v_count > 10000` → abort (2) post-check `v_leaked > 0` → abort. Dowolne exception rollback'uje całą transakcję — **żadnej trwałej zmiany, nawet częściowej**. Manual recovery: inżynier analizuje `consent_text` rekordów które nie pasują do wzorca (tłumaczenia, custom admin insert, skrócony copy), rozszerza reguły `LIKE` w nowym PR migracyjnym. Poprzednia wersja v6 mówiła o "10% odchyleniu" — to było nieprecyzyjne i nie miało odwzorowania w SQL, wycofane na rzecz twardych zero-tolerance warunków.

**Audit row:** jeśli `public.admin_audit_log` istnieje (migracja 037 na `origin/main` — zweryfikowane przez `make verify-htg2-deps`), migracja zapisuje row z `action='template_generation_backfill'`, `details=jsonb_build_object('updated_count', v_count)`. Jeśli tabela nie istnieje — migracja loguje przez `RAISE NOTICE` (nie padnie). Conditional: `IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='admin_audit_log') THEN INSERT ... END IF`.

Źródło prawdy to treść `consent_text`, nie zegar. Jeśli copy kiedykolwiek zostanie przetłumaczone (np. en), nowa migracja będzie potrzebna z rozszerzonymi wzorcami + `template_generation = 2`.

**2. Append-only model wycofań + helper funkcja.**
```sql
CREATE OR REPLACE FUNCTION public.consent_current(p_user_id UUID, p_type TEXT)
RETURNS public.consent_records LANGUAGE sql STABLE AS $$
  SELECT * FROM public.consent_records
   WHERE user_id = p_user_id AND consent_type = p_type
   ORDER BY created_at DESC, id DESC   -- tie-break przez id [v3]
   LIMIT 1
$$;
```
**Determinizm `[v3]`:** drugi klucz `id DESC` chroni przed flippingiem przy równoczesnych zapisach lub identycznych timestampach.

**3. Feature flag w `app_settings`, nie `current_setting` `[v3]`.**

`current_setting('app.client_analytics_enabled')` w środowisku z poolingiem / wieloma workerami / Vercel functions jest zawodny. Zamiast tego:
```sql
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
INSERT INTO public.app_settings (key, value) VALUES
  ('client_analytics_enabled', 'false'::jsonb),
  ('processing_export_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
```
RPC i Next handler oba czytają z `app_settings` w **tej samej transakcji** co consent gate (`SELECT value FROM app_settings WHERE key = ... FOR SHARE`). Nigdy z env. Zmiana flagi to single audit row + cache invalidation w aplikacji.

**`PROCESSING_EXPORT_ENABLED` granularity (decyzja `[v3]`):** Phase 1 — **global flag** (`app_settings.processing_export_enabled`). Phase 2 — dorabiamy `consent_records.consent_type = 'processing_export'` jako per-user opt-in (oddzielny od `session_recording_capture`); admin musi wtedy explicite uzyskać dodatkową zgodę. To zamknięte, **wyjmuję z open questions**.

**4. Wspólna helper function dla obu RPC `[v3]`.**

Mitygacja recenzji "dwa równoległe RPC = semantic drift": tworzymy wewnętrzną funkcję, której używają oba RPC. Stary `check_analytics_consent` przepisany żeby ją wywoływał:
```sql
CREATE OR REPLACE FUNCTION public._consent_capture_count_ok(p_booking_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_booking bookings%ROWTYPE;
  v_required INT;
  v_capture_count INT;
BEGIN
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  IF v_booking IS NULL THEN RETURN false; END IF;
  v_required := CASE WHEN v_booking.session_type = 'natalia_para' THEN 2 ELSE 1 END;
  SELECT count(DISTINCT user_id) INTO v_capture_count
    FROM public.consent_records
   WHERE booking_id = p_booking_id
     AND consent_type = 'session_recording_capture'
     AND granted = true;
  RETURN v_capture_count >= v_required;
END;
$$;
```
Stary `check_analytics_consent` deleguje do tej helper. Nowy `check_processing_export_consent` używa tej samej helper + dodatkowych warunków. **Jedna definicja semantyki "wystarczające zgody na nagrywanie".**

**5. Dwa nowe RPC — booking-level i meeting-level `[v4]`:**

Wcześniejsza wersja miała jeden `check_processing_export_consent(p_booking_id, p_user_id, ...)`, ale UC1 batch eksportuje uczestników spotkania grupowego którzy **nie dzielą wspólnego `booking_id`** (to są uczestnicy `htg_meeting_participants`, każdy z własnym historykiem bookingów). Helper `_consent_capture_count_ok(booking_id)` jest natural dla UC2 (jedna sesja 1:1 lub para), ale dla UC1 nie ma sensu.

Dwa RPC z jedną wspólną semantyką per-user:

```sql
-- Wspólny per-user sprawdzacz TYLKO dla globalnych gate'ów [v10]
-- NIE sprawdza session_recording_capture ani template_generation — te są booking-scoped
-- i walidowane osobno per booking w handlerze eksportu (przed włączeniem insights do Dossier).
-- Poprzednia wersja v6-v9 globalizowała capture przez consent_current(user, type) — błąd modelu.
CREATE OR REPLACE FUNCTION public._user_export_consent_ok(
  p_user_id UUID,
  p_require_sensitive BOOLEAN
) RETURNS TABLE(passed BOOLEAN, missing TEXT[]) ...
-- Sprawdza tylko globalne gate'y:
--   jeśli p_require_sensitive → consent_current(p_user_id, 'sensitive_data').granted = true
--   app_settings.processing_export_enabled = true
--   app_settings.client_analytics_enabled = true
--   (Phase 2, opcjonalne) consent_current(p_user_id, 'processing_export').granted = true
-- Zwraca missing = ['sensitive_data', 'processing_export_disabled', 'client_analytics_disabled', 'processing_export_consent']

-- UC2 booking-level (zachowuje semantykę `natalia_para`) [v10]
CREATE OR REPLACE FUNCTION public.check_processing_export_consent(
  p_booking_id UUID,
  p_user_id UUID,
  p_require_sensitive BOOLEAN
) RETURNS TABLE(passed BOOLEAN, missing TEXT[]) ...
-- AND:
--   1. _consent_capture_count_ok(p_booking_id)          -- 1 dla solo, 2 dla natalia_para
--   2. _user_export_consent_ok(p_user_id, p_require_sensitive)  -- tylko globalne gate'y
--   3. Precyzyjny predykat użytkownik-booking-template [v10]:
--      EXISTS (
--        SELECT 1 FROM public.consent_records cr
--         WHERE cr.user_id = p_user_id
--           AND cr.booking_id = p_booking_id
--           AND cr.consent_type = 'session_recording_capture'
--           AND cr.granted = true
--           AND cr.template_generation >= 1                  -- [v10] per-booking template check
--           AND cr.id = (
--             SELECT id FROM public.consent_records
--              WHERE user_id = p_user_id AND booking_id = p_booking_id
--                AND consent_type = 'session_recording_capture'
--              ORDER BY created_at DESC, id DESC LIMIT 1
--           )
--      )
--      -- Inline "consent_current per (user, booking, type)". Sprawdza że NAJNOWSZY
--      -- wiersz consent dla tego usera dla tego bookingu jest granted=true i ma
--      -- wystarczający template_generation. capture+template walidowane per booking,
--      -- nie globalnie — zgodne z v10 booking-scoped fingerprint model.
-- Invariant danych: przy tworzeniu bookingu natalia_para aplikacja MUSI zapisać
-- consent_records dla OBYDWU userów z tym samym booking_id — test integracyjny w
-- `app/api/live/consent/route.ts` sprawdza. Bez tego inwariantu RPC i stary
-- _consent_capture_count_ok rozjadą się na edge case'ach.

-- UC1 meeting-level (bez booking_id — uczestnicy spotkania grupowego) [v10]
CREATE OR REPLACE FUNCTION public.check_processing_export_consent_meeting(
  p_meeting_id UUID,
  p_user_id UUID,
  p_require_sensitive BOOLEAN
) RETURNS TABLE(passed BOOLEAN, missing TEXT[]) ...
-- AND:
--   1. _user_export_consent_ok(p_user_id, p_require_sensitive) — TYLKO globalne gate'y
--      (sensitive_data + feature flags). NIE sprawdza capture bo capture jest per booking,
--      a meeting nie jest związany z jednym konkretnym booking_id.
--   2. EXISTS (SELECT 1 FROM htg_meeting_participants
--                WHERE meeting_id = p_meeting_id AND user_id = p_user_id AND status = 'joined')
--   3. UWAGA: capture walidowane PER BOOKING w handlerze eksportu przed włączeniem insights
--      z danego booking do Dossier (patrz §3.2 build algorithm). Meeting RPC nie zna booking_id.
--      Jeśli user nie ma ŻADNEGO bookingu z valid capture, Dossier będzie pusty w session/pre/post,
--      ale Dossier MOŻE istnieć z samymi meetings[] jeśli user brał udział w Spotkaniach.
```

**Eksport UC1 dla każdego uczestnika czerpie z `session_client_insights` dla dowolnych jego bookingów** (nie tylko powiązanych ze spotkaniem), ale tylko tych gdzie booking-level `check_processing_export_consent` przeszło historycznie (sprawdzane per booking przed włączeniem insights do Dossier). To oznacza że w Dossier UC1 mogą być insights tylko z sesji, na które user wyraził consent capture. Spotkania grupowe mają własną ścieżkę przez `check_processing_export_consent_meeting`.

**`p_require_sensitive` w obecnej polityce `[v4]`:** zgodnie z §9 (jednolita polityka art. 9) **handler zawsze przekazuje `p_require_sensitive = TRUE`** w Phase 1. Parametr zostaje w sygnaturze RPC jako przyszłościowy dźwignik na wypadek gdyby DPO dopuścił bardziej granularne interpretacje w Phase 3+, ale w kodzie MVP to stała. Kod processing service NIE ma publicznej ścieżki `sensitive=false`.

**E2E test blocking dla `natalia_para`:** test `check_processing_export_consent` pokrywa scenariusz "booking par + tylko 1 z 2 zgód capture" → `passed=false`. Test property-based sprawdza implikację: jeśli `_consent_capture_count_ok=false`, to `check_processing_export_consent=false` bezwzględnie.

**E2E test dla UC1 meeting-level `[v4]`:** test "uczestnik spotkania bez `sensitive_data`" → `passed=false, missing=['sensitive_data']`. Test "uczestnik nie w `htg_meeting_participants`" → `passed=false, missing=['not_participant']`.

**6. Migracje:** `processing_advisories` (NULL-safe, §8), `processing_jobs` (§6.1), `processing_export_audit` (rozszerzenie wzorca z mig 054).

**7. Endpointy:** patrz §2 + §2.1.

### 3.2 Co eksport zwraca + algorytm `bookings_used[]` `[v10]`

**Algorytm wyboru `bookings_used[]` po stronie HTG2 eksport handler:**

Dla single eksport (`POST /api/processing/export-dossier` dla `(booking_id, user_id)`):
1. Walidacja: `check_processing_export_consent(booking_id, user_id, require_sensitive=true).passed` musi być true. Jeśli nie → 409.
2. `bookings_used = [booking_id]` — jedna pozycja, ten sam który był wywołany.

Dla batch eksport UC1 (`POST /api/processing/export-dossiers-batch` dla `(meeting_id, [user_id,...])`):
1. Walidacja per user: `check_processing_export_consent_meeting(meeting_id, user_id, require_sensitive=true).passed` — jeśli false, user w `not_analyzable[]` response.
2. Dla każdego valid usera, build `bookings_used[]`:
```sql
-- Wszystkie bookingi usera z validowanym capture per booking, niekasowane [v11]
-- UWAGA natalia_para: drugi uczestnik pary NIE jest w bookings.user_id,
-- ale MA wiersz w consent_records z tym samym booking_id. Źródłem prawdy
-- o "user brał udział w bookingu" są consent_records, nie bookings.user_id.
SELECT DISTINCT b.id FROM public.bookings b
 JOIN public.consent_records cr ON cr.booking_id = b.id
 WHERE cr.user_id = p_user_id                           -- [v11] join przez consent_records
   AND cr.consent_type = 'session_recording_capture'
   AND b.status IN ('confirmed', 'completed')
   AND EXISTS (
     SELECT 1 FROM public.session_client_insights sci
      WHERE sci.booking_id = b.id
        AND sci.status = 'ready'
        AND lower(p_user_id::text) = ANY(ARRAY(SELECT lower(unnest(sci.client_user_ids))))  -- [v13] defensywny lowercase match na wypadek różnic formatowania
   )
   AND EXISTS (
     -- Per-booking capture+template check (inline consent_current per (user, booking))
     SELECT 1 FROM public.consent_records cr2
      WHERE cr2.user_id = p_user_id
        AND cr2.booking_id = b.id
        AND cr2.consent_type = 'session_recording_capture'
        AND cr2.granted = true
        AND cr2.template_generation >= 1
        AND cr2.id = (SELECT id FROM public.consent_records
                       WHERE user_id = p_user_id AND booking_id = b.id
                         AND consent_type = 'session_recording_capture'
                       ORDER BY created_at DESC, id DESC LIMIT 1)
   )
 ORDER BY b.id;  -- deterministic sort dla stabilnego scope_key
```
3. Insights włączone do Dossier pochodzą wyłącznie z `session_client_insights WHERE booking_id IN bookings_used`.
4. Dossier's `meetings[]` buduje się z `htg_meeting_participants WHERE user_id = p_user_id` — niezależnie od bookingów (meeting participation to osobna ścieżka danych, nie insights).
5. `scope_key = SHA256(user_id || ':' || string_agg(sorted bookings_used, ','))`.
6. `consent_fingerprint` hash nad `sensitive_data` globalnie + każdym `(booking_id, latest_consent_record_id, granted, template_generation, created_at)` z `bookings_used[]`.

**Konsekwencje:**
- User bez żadnego bookingu z valid capture, ale będący w meetings → Dossier z pustym `session/pre/post`, tylko `meetings[]`. UC1 może go analizować (wypowiedzi w spotkaniach są osobnym źródłem).
- User ze wszystkimi bookingami bez capture → Dossier z samym `meetings[]`, `bookings_used = []`.
- Dossier zawsze istnieje po pass walidacji `_user_export_consent_ok`, nawet jeśli pusty sesyjnie.

**Export response body shape `[v11]`:** `POST /api/processing/export-dossier` (single) zwraca JSON:
```json
{
  "user_id": "uuid",
  "snapshot_at": "iso8601",
  "export_schema_version": "1.0.0",
  "scope_key": "sha256-hex",
  "bookings_used": ["uuid", "uuid"],
  "consent_fingerprint": "sha256-hex",
  "dossier_data": { "pre": {...}, "session": {...}, ... }
}
```
`POST /api/processing/export-dossiers-batch` (batch UC1) zwraca:
```json
{
  "snapshot_at": "iso8601",
  "results": [
    { "user_id": "uuid", "status": "ok", "scope_key": "...", "bookings_used": [...], "consent_fingerprint": "...", "dossier_data": {...} },
    { "user_id": "uuid", "status": "stale" },
    { "user_id": "uuid", "status": "not_analyzable", "missing": ["sensitive_data"] }
  ]
}
```
Worker używa `scope_key` i `consent_fingerprint` przy zapisie do `dossiers` table (§7 schema).

### 3.2.1 Co eksport zwraca (data shape)

- `bookings.topics` (mig 003 linia 110)
- `client_recordings` (mig 049): `id, type ∈ {before,after}, duration_seconds, created_at, booking_id`. **`storage_url` nie eksportowany w MVP.** Treść = Phase 2 deliverable po stronie HTG2.
- `session_client_insights` (mig 051): pełen JSONB `transcript` + insights + `analysis_model` + `analysis_prompt_version`. Bez re-derivation (ryzyko §17 risk #1).
- `htg_meeting_recordings` + `htg_speaking_events` filtrowane do uczestnika, eksportujemy text turns z diaryzacji (już istnieją po stronie HTG2). Bez audio.
- `htg_participant_profiles` (mig 019): D1/D2/D3 + `score_merytoryczny_override`. **`admin_notes` nie eksportujemy** (patrz §17 risk #9).
- prior `processing_advisories` dla tego usera

### 3.3 Audio access flow

**Worker NIE pobiera plików audio/video w MVP.** Tekst pochodzi wyłącznie z `session_client_insights.transcript` (już wygenerowane przez `lib/client-analysis/transcribe-audio.ts`).

**Ograniczenie MVP:** głosówki klienta (`client_recordings`) **nie są dziś transcribowane** — pipeline obejmuje tylko fazy live session. Konsekwencja: worker zna tylko **metadane** głosówek. Treść głosówek **nie zasila** UC1/UC2 w Phase 1. **Natalia musi to wiedzieć podczas pairwise review w Phase 1 — pairwise w shadow mode nie testuje pełnej wizji produktu, tylko częściowy sygnał.** (§17 risk uzupełniony.)

**Phase 2 deliverable po stronie HTG2:** rozszerzyć `lib/client-analysis/transcribe-audio.ts` o ścieżkę dla `client_recordings` (Whisper, zapis do `client_recordings.transcript JSONB`). Po stronie processing service — żadnej pracy.

### 3.4 Normalizacja → Client Dossier

```
Dossier [v10] {
  user_id, snapshot_at,
  export_schema_version,
  scope_key,                         -- [v10] deterministic hash: SHA256(user_id || sorted(bookings_used[]))
  bookings_used: [booking_id, ...],  -- [v10] lista bookingów faktycznie włączonych do Dossier
  consent_fingerprint,               -- [v10] liczony nad sensitive_data globalnie + session_recording_capture per booking_used
  pre:    { topics, before_recordings_meta: [...] },
  session:{ transcript_segments, phase_insights, journey_summary },
  post:   { after_recordings_meta: [...] },
  meetings:[{ meeting_id, participant_turns_text, group_members }],
  history:{ prior_dossiers: [...], prior_advisories: [...] },
  provenance: [{source_table, source_id, fetched_at, span?}]
}
```

**Klucz cache po stronie workera `[v10]`:** `dossiers` tabela ma PRIMARY KEY `(scope_key, snapshot_at)`, nie `(user_id, snapshot_at)`. Ten sam user z różnym zestawem `bookings_used` to różne Dossier rows.

### 3.5 `consent_fingerprint`

**Fingerprint jest specyficzny dla zakresu zgód użytych w Dossier `[v9]`.** `sensitive_data` jest globalny per user (bo dotyczy ochrony kategorii danych), ale `session_recording_capture` jest **booking-scoped** w modelu HTG2 (jedna zgoda per `booking_id`, różne bookingi niezależne). Wcześniejsza wersja v5-v8 traktowała obie jako globalne — psuło to purge i reconcile dla klientów z wieloma bookingami (wycofanie zgody dla booking A błędnie unieważniało Dossier zbudowane z booking B).

```
fingerprint = SHA256(
  -- sensitive_data: globalny per user
  CASE
    WHEN consent_current(user_id, 'sensitive_data') IS NULL
      THEN "absent:sensitive_data"
    ELSE "sensitive:" || consent_current(user_id, 'sensitive_data').id
      || ":" || consent_current(user_id, 'sensitive_data').granted
      || ":" || consent_current(user_id, 'sensitive_data').template_generation
      || ":" || consent_current(user_id, 'sensitive_data').created_at::text
  END
  ||
  -- session_recording_capture: booking-scoped, tylko bookingi FAKTYCZNIE użyte w Dossier
  "|captures:" ||
  (for each booking_id in dossier.bookings_used (sorted):
    IF latest_consent_record(user_id, booking_id, 'session_recording_capture') IS NULL
      THEN "absent:" || booking_id
      ELSE booking_id || ":" || record.id
        || ":" || record.granted
        || ":" || record.template_generation                 -- [v11] włączone w fingerprint
        || ":" || record.created_at::text
    joined by ";"
  )
)
```

**`template_generation` w hashu `[v11]`:** backfill PRE-2 (podnoszący z 1 do 2) albo `UPDATE consent_records SET template_generation` in-place zmienia fingerprint → cascade purge. Poprzednia v10 pominęła `template_generation` — błąd, bo `check_processing_export_consent` wymaga `template_generation >= 1` jako gate, a zmiana wersji template bez purge by to omijała.

**Konsekwencje `[v9]`:**
- Dossier zawiera pole `bookings_used[]` — lista `booking_id` z których pobierano insights/topics. Tylko te są hashowane w fingerprincie.
- Wycofanie zgody capture dla bookingu B **nie unieważnia** Dossier jeśli B nie był użyty.
- Dodanie nowego bookingu do zakresu (rebuild Dossier) → nowy `bookings_used[]` → nowy fingerprint → nowy Dossier row (stary kasowany przez retention TTL, nie purge).
- `check_processing_export_consent_meeting` **NIE** używa globalnego capture gate — używa per-booking lookupu dla każdego bookingu przed włączeniem insights do Dossier. Meeting-level RPC sprawdza tylko `_user_export_consent_ok` (sensitive_data + feature flag + template_generation), a filtrowanie `session_client_insights` per-booking odbywa się w handlerze eksportu przed normalizacją Dossier.

**Semantyka "absent":** jeśli dla danego `user_id`/booking nie ma żadnego wiersza w `consent_records`, fingerprint zawiera stały marker `"absent:<key>"` zamiast `NULL`. Pierwsze utworzenie wiersza (nawet z `granted=false`) zmienia fingerprint → cascade purge. Obie strony (HTG2 w eksport endpoincie i w consent-fingerprints; worker w lokalnym Dossier cache'u) **muszą liczyć identycznie** — implementacja żyje w współdzielonym modelu (Python side port identyczny z SQL side) **z contract testem** porównującym oba outputy na 30 fixtures (w tym puste, częściowo obecne, różne `granted`, różne `template_generation`, różne kombinacje booking sets).

**Procesowe zabezpieczenie `[v3]`:** zmiana copy zgody w `app/api/live/consent/route.ts` **zawsze** wymaga bumpu `CONSENT_TEMPLATE_GENERATION`. CI lint blokuje PR jeśli `consentTexts` zmieniony bez bumpu stałej. Bez tego fingerprint kłamie i purge/reconcile spóźniają się.

**Brak `sequence_number` `[v3]`:** wycofany na rzecz pełnego polegania na fingerprint + nightly reconcile. `sequence_number` per user wymagałby centralnej atomowej numeracji w każdej ścieżce mutacji zgody (consent route, admin override, migracje) — kruche, łatwo o luki. Fingerprint + nightly reconcile pokrywa ten sam scenariusz przy małej skali HTG.

## 4. Warstwa doktryny

```
doctrine/
  v0.1.0/
    index.yaml
    vocabulary.md
    framings/
      mapa-uwarunkowan.md
      grupa-5-osobowa.md
    rules/
      pairing-principles.yaml
      red-flags.yaml
      output-schema.json          # JSON Schema dla outputów UC1 i UC2
      doctrine-tags.yaml          # zamknięta lista ID tagów doktryny — JEDYNY input dla validatora vocabulary
    prompts/
      doctrine_reasoner.system.md
      mapping_specialist.system.md
      group_advisor.system.md
    glossary.jsonl                # term/definicja per linia → embedding (sentence-transformers, lokalnie)
```

**Embedding decyzja referencyjna `[v3]`:** **lokalne `sentence-transformers`** — `paraphrase-multilingual-mpnet-base-v2` lub równoważny model multilingual. Zerowa lista subprocessorów dla embeddingów. Voyage to opcjonalny upgrade w Phase 3 z osobną DPA, **nie default**.

**Governance — Phase 1 (decyzja usera):** doktrynę v0.1 autoruje **inżynier** na podstawie strukturalnych wywiadów z Natalią. Phase 3 — przekazanie autorstwa Natalii.

Doktryna wersjonowana semverem. **Immutable po tagowaniu.**

## 5. Topologia modułów przetwarzania

| Moduł pipeline | Model API ID | Rola | Wejście | Wyjście |
|---|---|---|---|---|
| **Orchestrator** | `claude-haiku-4-5-20251001` | Sekwencjonuje run, enforce step budget, retry. Bez domain reasoningu. | UC1/UC2 request | run plan |
| **Dossier Builder** | `claude-haiku-4-5-20251001` | Wywołuje eksport endpoint HTG2, normalizuje, sprawdza fingerprint. Tool-use only. | booking_id/user_id | Dossier |
| **Doctrine Reasoner** | `claude-sonnet-4-6` | Tłumaczy obserwacje na **tagi z `doctrine-tags.yaml`** (zamknięta lista ID, nie wolny tekst). Retrieval z `glossary.jsonl` (lokalne pgvector). | Dossier slice + doctrine prompt | tagged observations (struct) |
| **Mapping Specialist (UC2)** | `claude-opus-4-6` (1M) | Produkuje Mapę. 3 warstwy. Każdy claim cytuje provenance ID. | pełen Dossier + tagi + doktryna | Mapa JSON + narrative |
| **Group Advisor (UC1)** | `claude-sonnet-4-6` | Bierze deterministyczny output `lib/meetings/grouping.ts` + dossiery. Doradczy. | propozycja grup + dossiery + reguły | structured advisory per grupa |
| **Output Validator** (wewnętrzna nazwa modułu: `output_validator`, historyczny alias: "Critic") `[v8]` | `claude-sonnet-4-6` | Po hard validatorach. Sprawdza spójność reasoningu z `framings/`, semantyczną sensowność, narrative paraphrase check. **Blocking** (I8). | output + reguły | verdict + issues |

## 6. Przepływy decyzyjne

### 6.0 UC1 i UC2 oba async `[v3]`

Oba use case'y używają tej samej kolejki `processing_jobs` — UC2 też (Opus 1M trwa minuty, blokowanie UI nie ma sensu). Niespójność z v2 naprawiona.

### UC2 — Mapa Uwarunkowań (async) `[v6]`

**Zsynchronizowane z §2.2 — HTG2 jest jedynym źródłem prawdy dla `processing_jobs` i `processing_run_id`.**

1. Staff w UI workera klika "Stwórz Mapę" dla `user_id`.
2. Backend workera (FastAPI) POST `/api/processing/jobs/create` do HTG2 z `{job_type:'mapa_uwarunkowan', subject_user_id}`. HTG2:
   a. Sprawdza unique constraint (aktywny UC2 job per user): jeśli istnieje już `pending`/`running` job dla tego usera → zwraca **istniejący** `{job_id, processing_run_id}` (idempotent — drugi klik UX nie rzuca 409).
   b. Inaczej tworzy nowy `processing_jobs` row ze `status='pending'`, generuje `processing_run_id` (default `gen_random_uuid()`).
   c. Zwraca `{job_id, processing_run_id}` do workera.
3. Worker wrzuca job na własną kolejkę Arq z `{job_id, processing_run_id, subject_user_id}`. Staff UI pokazuje `job_id` + status polling do workera.
4. Worker bierze job, generuje `attempt_id` UUID, wykonuje check-in: `POST .../jobs/:id/status` z `{status:'running', attempt_id, heartbeat_at: now}` `[v11]`. **Worker czeka na 200 z HTG2 przed startem** Dossier Builder (§2.2 rule). `attempt_id` wymagany we wszystkich kolejnych callbackach dla tego joba.
5. Orchestrator → Dossier Builder (eksport dla user_id) → Doctrine Reasoner → Mapping Specialist (Opus 1M) → hard validators → output validator. Heartbeat co 30s podczas długich kroków.
6. Failure → `processing_runs.status='failed'`, push status `failed`, NIE trafia do staff review (I8).
7. Sukces → KROK 1 zapis nowej wersji w `mapa_versions` (processing-service DB) + write-back `POST /api/processing/advisory` (HTG2 zapisuje jako draft). KROK 2 push status `done` z `result_advisory_id` (§2.2 happy path).
8. Staff review UI pokazuje diff vs poprzedniej wersji. Accept / edit / reject. Akceptacja zmienia `processing_advisories.status='accepted'` w HTG2.

### UC1 — Wzbogacenie propozycji grup (async)

1. Admin w `/prowadzacy/spotkania-htg/profile-uczestnikow/` klika "Wzbogać propozycję grup" przy konkretnym `htg_group_proposals.id`.
2. HTG2 sprawdza: czy istnieje już aktywny job dla tej `(meeting_id, group_proposal_id)` → jeśli tak, zwraca istniejący (limit 1 per propozycja `[v3]`). Inaczej tworzy `processing_jobs` row + POST do workera.
3. Worker: Orchestrator → Dossier Builder wywołuje **batch export** dla wszystkich uczestników. **Logiczny snapshot (§I2) `[v8]`:** jeden `snapshot_at` dla całego batcha, krótkie odczyty read-only per user, fingerprint check na początku i na końcu per user, `stale_users[]` + retry zgodnie z formalną algebrą I2. **Nie jest to jedna transakcja RR** — unikamy długich blokad.
4. **Limity batch `[v3]`:** N ≤ 16 (HTG meeting max 12 + bufor), body ≤ 10 MB, timeout 60s. Przy N > 16 (theoretical) → paginacja z deterministycznym sortem.
5. **Per-user gate w batch:** każdy user przechodzi indywidualny consent check; brak consentu → `not_analyzable[]` w response, batch nie failuje. **Endpoint NIE zwraca jednego AND globalnego** — to jest one-request-many-checks pattern.
6. Doctrine Reasoner → Group Advisor per grupa. Hard validators → output validator.
7. Sukces → write-back advisory + status `done`. Admin polluje `GET /api/processing/jobs/:id` co 5s (limit 1 active polling per browser tab).
8. Admin akceptuje, edytuje lub odrzuca w UI HTG2.

### 6.1 Schema `processing_jobs` (HTG2) `[v4]`

**Dedykowane kolumny** zamiast unique na JSONB extract — JSONB NULL semantics jest zawodne w PostgreSQL, a dedykowane kolumny dają twarde NOT NULL constraints i czystsze indeksy.

```sql
CREATE TABLE public.processing_jobs (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type                    TEXT NOT NULL CHECK (job_type IN ('group_enrichment','mapa_uwarunkowan')),
  status                      TEXT NOT NULL CHECK (status IN ('pending','running','done','done_partial','failed','cancelled')),  -- [v14] done_partial dla reconcile UC1 z niekompletnym zestawem

  -- Processing run identity [v5] — pierwszej klasy kolumna dla reconcile, nie JSONB extract
  processing_run_id                UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,  -- [v15] UNIQUE defensive dla lease check safety

  -- Dedykowane subject columns [v4]
  subject_user_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_meeting_id          UUID REFERENCES public.htg_meetings(id) ON DELETE CASCADE,
  subject_group_proposal_id   UUID REFERENCES public.htg_group_proposals(id) ON DELETE CASCADE,

  payload                     JSONB NOT NULL DEFAULT '{}'::jsonb,    -- dodatkowe dane (np. requested_by)
  result_advisory_id          UUID REFERENCES public.processing_advisories(id),  -- [v11] UC2 only; UC1 ma wiele advisories linkowanych przez processing_job_advisories
  error_code                  TEXT,                                   -- never raw model output
  retry_count                 INT NOT NULL DEFAULT 0,
  heartbeat_at                TIMESTAMPTZ,                            -- [v5] stuck detection
  current_attempt_id          UUID,                                    -- [v9] idempotent lease dla workera
  expected_advisory_count     INT,                                     -- [v14] UC1: liczba grup analyzable; NULL dla UC2 (zawsze 1)
                                                                        -- [v15] transport przez pierwszy heartbeat callback po pipeline analysis:
                                                                        -- worker oblicza |analyzable_groups| z I2 algebra po batch export,
                                                                        -- wysyła w kolejnym heartbeat: POST /jobs/:id/status
                                                                        -- z {status:'running', attempt_id, heartbeat_at, expected_advisory_count}
                                                                        -- HTG2 akceptuje expected_advisory_count tylko jeśli current value jest NULL
                                                                        -- (jednorazowe ustawienie, nie można modyfikować po initial set).
  created_by                  UUID REFERENCES auth.users(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Per-typ constraint [v9] — OBA typy zerują niewymagane kolumny (I10 spójność)
  CONSTRAINT mapa_job_subject CHECK (
    job_type <> 'mapa_uwarunkowan' OR (
      subject_user_id IS NOT NULL
      AND subject_meeting_id IS NULL
      AND subject_group_proposal_id IS NULL
    )
  ),
  CONSTRAINT group_job_subject CHECK (
    job_type <> 'group_enrichment' OR (
      subject_meeting_id IS NOT NULL
      AND subject_group_proposal_id IS NOT NULL
      AND subject_user_id IS NULL   -- [v9] zerowanie, spójne z invariantem I10
    )
  )
);

CREATE INDEX processing_jobs_status_idx ON public.processing_jobs (status, created_at);
CREATE INDEX processing_jobs_run_id_idx ON public.processing_jobs (processing_run_id);  -- [v5]
CREATE INDEX processing_jobs_heartbeat_idx ON public.processing_jobs (heartbeat_at)  -- [v5]
  WHERE status = 'running';

-- Limit 1 aktywny UC1 job per propozycja grup (NULL-safe, na dedykowanej kolumnie)
CREATE UNIQUE INDEX processing_jobs_unique_active_uc1
  ON public.processing_jobs (subject_group_proposal_id)
  WHERE job_type = 'group_enrichment' AND status IN ('pending','running');

-- Limit 1 aktywny UC2 job per user (zapobiega podwójnym Opus runom)
CREATE UNIQUE INDEX processing_jobs_unique_active_uc2
  ON public.processing_jobs (subject_user_id)
  WHERE job_type = 'mapa_uwarunkowan' AND status IN ('pending','running');

-- [v11] Tabela pośrednia dla UC1 (wiele advisory per job — po jednym na grupę)
CREATE TABLE public.processing_job_advisories (
  job_id      UUID NOT NULL REFERENCES public.processing_jobs(id) ON DELETE CASCADE,
  advisory_id UUID NOT NULL REFERENCES public.processing_advisories(id) ON DELETE CASCADE,
  group_index INT NOT NULL,        -- numer grupy w proposal (dla sortowania w UI)
  PRIMARY KEY (job_id, advisory_id),
  UNIQUE (job_id, group_index),    -- [v12] jedno advisory per grupa per job
  UNIQUE (advisory_id)              -- [v13] advisory nie może być linkowana do dwóch jobów (defensive)
);
CREATE INDEX processing_job_advisories_job_idx ON public.processing_job_advisories(job_id);
```

**UC1 write-back `[v11]`:** worker dla każdej grupy z `|analyzable_g| >= K` wykonuje osobny `reserve-version` + `advisory` write-back. Każda grupa = jeden wiersz w `processing_advisories` + jeden wiersz w `processing_job_advisories` linkujący do joba. KROK 2 callback `done` zawiera listę wszystkich `advisory_ids[]` (nie pojedynczy `result_advisory_id`). HTG2 w transakcji zapisuje wszystkie linki w `processing_job_advisories` i ustawia `processing_jobs.status='done'`. Dla UC2 `result_advisory_id` zostaje singular (tylko jedna Mapa per user per run).

**Decyzja `processing_jobs` w HTG2 (zamykam open question `[v3]`):** w HTG2, bo admin UI musi pokazać status bez cross-service joinów i bo `result_advisory_id` ma FK do `processing_advisories`. Processing service trzyma własny `processing_runs` jako lustro własnej pracy.

## 7. Schema processing-service DB

```
dossiers              -- [v11] Explicit kolumny dla reconcile query (nie tylko JSONB):
                      --   scope_key TEXT NOT NULL          (PK part 1)
                      --   snapshot_at TIMESTAMPTZ NOT NULL (PK part 2)
                      --   user_id UUID NOT NULL            (indexed, reconcile query)
                      --   bookings_used UUID[] NOT NULL    (indexed GIN, purge per booking)
                      --   consent_fingerprint TEXT NOT NULL
                      --   export_schema_version TEXT NOT NULL
                      --   dossier_data JSONB NOT NULL      (full Dossier payload)
                      --   purged_at TIMESTAMPTZ            (soft delete dla retention audit)
                      -- Indexes: CREATE INDEX ON dossiers(user_id) WHERE purged_at IS NULL;
                      --          CREATE INDEX ON dossiers USING GIN(bookings_used) WHERE purged_at IS NULL;
doctrine_versions     -- mirror tagged doctrine releases, content-hashed
doctrine_embeddings   -- pgvector dla glossary.jsonl per version (sentence-transformers local)
processing_runs            -- (id, uc, status, started_at, cost_usd, tokens_in/out)
processing_steps           -- (run_id, step_name, model, prompt_version, doctrine_version, input_hash, output, latency_ms, cost_usd)
mapa_versions         -- UC2 outputy
group_advisories      -- UC1 outputy
staff_reviews         -- (advisory_id, reviewer, verdict, edits, rejection_reason)
eval_cases            -- golden cases YAML
eval_runs             -- regresje per doctrine_version + per prompt_version
purge_log             -- audit propagacji deletion
webhook_inbox         -- idempotent receipt log
idempotency_keys      -- [v10] PK (key), response_body JSONB, response_status INT, created_at TIMESTAMPTZ; DB-enforced atomic ON CONFLICT DO NOTHING (§2.1 v9); biznesowy write w tej samej transakcji; TTL 7 dni zarządzany background cleanup job
reconcile_runs        -- nightly reconcile audit
```

## 8. Write-back contract — `processing_advisories` `[v3]`

**Naprawione: UC1 unikalność po `group_proposal_id`, nie po `meeting_id`.** Admin może wielokrotnie wygenerować propozycję dla tego samego spotkania; każda jest osobnym subjectem advisory.

```sql
CREATE TABLE public.processing_advisories (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisory_type           TEXT NOT NULL CHECK (advisory_type IN ('group_enrichment','mapa_uwarunkowan')),
  subject_user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_meeting_id      UUID REFERENCES public.htg_meetings(id) ON DELETE CASCADE,
  subject_group_proposal_id UUID REFERENCES public.htg_group_proposals(id) ON DELETE CASCADE,  -- [v3]
  group_index             INT,                        -- [v12] UC1 only: index grupy w proposal (0-N)
  version                 INT NOT NULL,
  doctrine_version        TEXT NOT NULL,
  processing_run_id       UUID NOT NULL,              -- [v5] powiązanie z processing_jobs.processing_run_id (nie enforced FK, bo processing_jobs może zostać pokasowane po DONE retention)
  payload                 JSONB NOT NULL,
  accepted_by             UUID REFERENCES auth.users(id),
  accepted_at             TIMESTAMPTZ,
  status                  TEXT NOT NULL CHECK (status IN ('draft','accepted','rejected','superseded','expired')),  -- [v7] 'expired' dla orphan GC
  error_code              TEXT,                        -- [v7] kod dla statusów niemerytorycznych (orphan_draft_gc, ...); NULL dla draft/accepted
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- error_code semantyka [v8]: NULL dla stanów merytorycznych, NOT NULL dla operacyjnych
  CONSTRAINT error_code_semantics CHECK (
    (status IN ('draft','accepted','rejected','superseded') AND error_code IS NULL)
    OR (status = 'expired' AND error_code IS NOT NULL)
  ),

  -- Per-typ wymagania pól (I10)
  CONSTRAINT mapa_subject_required CHECK (
    advisory_type <> 'mapa_uwarunkowan' OR (
      subject_user_id IS NOT NULL
      AND subject_meeting_id IS NULL
      AND subject_group_proposal_id IS NULL
    )
  ),
  CONSTRAINT group_subject_required CHECK (
    advisory_type <> 'group_enrichment' OR (
      subject_meeting_id IS NOT NULL
      AND subject_group_proposal_id IS NOT NULL
      AND subject_user_id IS NULL   -- [v9] spójne zerowanie z processing_jobs + I10
      AND group_index IS NOT NULL   -- [v12] UC1 wymaga group_index
    )
  ),
  CONSTRAINT mapa_no_group_index CHECK (   -- [v12] UC2 nie ma group_index
    advisory_type <> 'mapa_uwarunkowan' OR group_index IS NULL
  )
);

-- NULL-safe unikalność per typ [v3]:
CREATE UNIQUE INDEX processing_advisories_mapa_uniq
  ON public.processing_advisories (subject_user_id, version)
  WHERE advisory_type = 'mapa_uwarunkowan';

CREATE UNIQUE INDEX processing_advisories_group_uniq
  ON public.processing_advisories (subject_group_proposal_id, group_index, version)  -- [v12] proposal + group + version
  WHERE advisory_type = 'group_enrichment';

-- Reconcile support [v5]
CREATE INDEX processing_advisories_run_id_idx ON public.processing_advisories (processing_run_id);

-- [v14] Max 1 accepted advisory per (proposal, group_index) — ochrona DB przed race na akceptację
CREATE UNIQUE INDEX processing_advisories_group_accepted_uniq
  ON public.processing_advisories (subject_group_proposal_id, group_index)
  WHERE advisory_type = 'group_enrichment' AND status = 'accepted';

-- [v14] Max 1 accepted Mapa per user — ochrona DB przed race na akceptację
CREATE UNIQUE INDEX processing_advisories_mapa_accepted_uniq
  ON public.processing_advisories (subject_user_id)
  WHERE advisory_type = 'mapa_uwarunkowan' AND status = 'accepted';
```

RLS: admins only. **Payload nigdy nie zawiera raw transcriptu.**

**UC1 advisory supersede lifecycle `[v13]`:** gdy admin ponownie uruchamia UC1 dla tego samego `proposal_id`, powstają nowe advisories z nową `version`. **Stare `accepted` advisories NIE są automatycznie `superseded`** — supersede dopiero gdy staff zaakceptuje nową wersję:

```sql
-- Staff akceptuje advisory(id=X, version=V, group_index=G, proposal_id=P):
BEGIN;
UPDATE processing_advisories
   SET status='superseded'
 WHERE advisory_type='group_enrichment'
   AND subject_group_proposal_id=P
   AND group_index=G
   AND status='accepted'
   AND version < V;
UPDATE processing_advisories SET status='accepted', accepted_at=now(), accepted_by=$user WHERE id=X;
COMMIT;
```

Staff UI **filtruje per `(proposal_id, group_index)`** pokazując tylko najnowszą non-expired advisory (kolejność: `accepted > draft > rejected/superseded/expired`). Brak tej reguły → staff widzi mix starych i nowych wersji. Dla UC2 zasada jest symetryczna per `subject_user_id`.

**API response na unique constraint violation `[v15]`:** przy równoległej akcept race HTG2 endpoint akceptacji przechwytuje PostgreSQL `unique_violation` error:
```
409 Conflict
{
  "error_code": "advisory_already_accepted",
  "message": "Inna sesja już zaakceptowała advisory dla tej grupy/usera",
  "conflicting_advisory_id": "uuid"
}
```
Stabilny `error_code` zamiast surowego błędu DB. Drugi admin widzi w UI komunikat "Ta advisory została już zaakceptowana przez {username}. Odśwież aby zobaczyć aktualny stan."

**Atomowe version allocation przez rezerwację + cykl zależności naprawiony `[v10]`:**

**Problem cyklu zależności:** worker musi znać `version` żeby zbudować `Idempotency-Key = {run_id}:{type}:{version}`, ale `version` alokuje HTG2 dopiero w write-back. Rozwiązanie: **osobny endpoint rezerwacji wersji** wywoływany przed write-back. Worker:
1. `POST /api/processing/advisory/reserve-version` z `{processing_run_id, advisory_type, subject_*, attempt_id}` → HTG2 atomowo alokuje version, zapisuje `version_reservations(run_id, type, subject, version)`, zwraca `{allocated_version}`.
2. Worker buduje `Idempotency-Key` zgodnie z I3 (format zależny od typu).
3. `POST /api/processing/advisory` z Idempotency-Key + `attempt_id` → HTG2 zapisuje `processing_advisories` z `version=allocated_version`, match z reservation.

**Lease + subject match check w `reserve-version` i `advisory` `[v15]`:** oba endpointy przed wykonaniem akcji walidują że caller ma aktywny lease **i** że typ/subject pasują do joba:
```sql
SELECT current_attempt_id, status, job_type,
       subject_user_id, subject_meeting_id, subject_group_proposal_id
  FROM processing_jobs
 WHERE processing_run_id = $1
 LIMIT 1;  -- processing_run_id UNIQUE [v15]

-- Wymagania:
-- 1. Job istnieje (z `processing_run_id` z requestu)
-- 2. status = 'running' (not 'done'/'done_partial'/'failed'/'cancelled'/'pending')
-- 3. current_attempt_id = $attempt_id z requestu
-- 4. job.job_type maps do request.advisory_type:
--    'mapa_uwarunkowan' job ↔ advisory_type 'mapa_uwarunkowan'
--    'group_enrichment' job ↔ advisory_type 'group_enrichment'
-- 5. Subject match:
--    UC2: request.subject_user_id = job.subject_user_id
--    UC1: request.subject_meeting_id = job.subject_meeting_id
--         AND request.subject_group_proposal_id = job.subject_group_proposal_id
--         AND request.group_index >= 0 (dozwolony dla UC1)
-- Brak któregokolwiek → 409 z odpowiednim error_code:
--   409 lease_lost (punkt 3)
--   409 job_terminal (punkt 2)
--   409 subject_mismatch (punkty 4, 5)
--   404 job_not_found (punkt 1)
```

**Kolejność walidacji [v15]:** (1) job exists, (2) job not terminal, (3) attempt_id match, (4) subject/type match, **(5) idempotency lookup** — walidacja lease i subject przed idempotency gwarantuje że stary worker lub worker z błędnym subjectem nie dostanie cached 200.

Bez tej walidacji stary worker po utracie lease mógłby "spalić" wersje lub zapisać advisory poza zakresem biznesowym joba (np. worker UC1 przypadkowo próbuje zapisać UC2 advisory).

**Idempotencja rezerwacji:** powtórne wywołanie `reserve-version` z tym samym `(run_id, type, subject)` → zwraca istniejącą rezerwację, nie alokuje nowej (tabela `version_reservations` ma PRIMARY KEY na `(run_id, type, subject_key)`).

**Schema:**
```sql
CREATE TABLE public.advisory_version_counters (
  advisory_type TEXT NOT NULL,
  subject_key   TEXT NOT NULL,              -- format [v10]: '{advisory_type}:{user_id_or_proposal_id_as_text}'
  next_version  INT NOT NULL DEFAULT 2,    -- [v10] start 2 (nie 1) — eliminuje off-by-one
  PRIMARY KEY (advisory_type, subject_key)
);

CREATE TABLE public.version_reservations (
  processing_run_id  UUID NOT NULL,
  advisory_type      TEXT NOT NULL,
  subject_key        TEXT NOT NULL,
  version            INT NOT NULL,
  reserved_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (processing_run_id, advisory_type, subject_key)
);
```

**Format `subject_key` `[v12]`:** ustalony jako `'{advisory_type}:{subject_id}[:{group_index}]'`:
- UC2: `'mapa_uwarunkowan:{subject_user_id}'`
- UC1: `'group_enrichment:{subject_group_proposal_id}:{group_index}'` — `group_index` jest stałym identyfikatorem grupy w proposal (0, 1, 2, ...). UC1 worker wywołuje `reserve-version` **osobno dla każdej grupy** z różnym `subject_key`, otrzymuje różne wersje. Poprzednia v11 nie zawierała `group_index` — powodowało to że wszystkie grupy w tym samym proposal dostawały tę samą wersję (luka recenzji v11).

**Alokacja (w transakcji `reserve-version` handlera) `[v11]`:** lock-first pattern eliminuje race. Poprzednia v10 miała check-then-insert: dwa równoległe requesty mogły oba zobaczyć "miss" w SELECT i oba inkrementować licznik mimo jednej realnej rezerwacji.

```sql
BEGIN;
-- Krok 1: atomowy insert locka rezerwacji (wygrywa jeden z równoległych)
INSERT INTO version_reservations (processing_run_id, advisory_type, subject_key, version, reserved_at)
VALUES ($1, $2, $3, -1, now())      -- -1 = placeholder, pending allocation
ON CONFLICT (processing_run_id, advisory_type, subject_key) DO NOTHING
RETURNING TRUE AS won_lock;

-- Krok 2: jeśli lock wygrany (pierwsze wywołanie), alokuj wersję
-- Jeśli lock przegrany (replay), zwróć istniejącą wersję bez inkrementu licznika
IF won_lock THEN
  INSERT INTO advisory_version_counters (advisory_type, subject_key, next_version)
  VALUES ($2, $3, 2)                  -- start 2, pierwsza alokowana wersja = 1
  ON CONFLICT (advisory_type, subject_key)
  DO UPDATE SET next_version = advisory_version_counters.next_version + 1
  RETURNING next_version - 1 AS allocated_version;

  UPDATE version_reservations SET version = allocated_version
    WHERE processing_run_id = $1 AND advisory_type = $2 AND subject_key = $3;

  RETURN allocated_version;
ELSE
  -- [v13] ELSE branch z explicit SELECT FOR UPDATE + retry na wypadek outside-transaction race
  -- (INSERT ON CONFLICT DO NOTHING commituje natychmiast, więc potencjalnie widzimy wiersz
  -- z version=-1 zanim winner commitnie UPDATE). Używamy SELECT ... FOR UPDATE żeby czekać
  -- na winner's transaction commit, plus max 3 retry z 100ms backoff dla skrajnych przypadków.
  LOOP
    SELECT version INTO allocated_version FROM version_reservations
      WHERE processing_run_id = $1 AND advisory_type = $2 AND subject_key = $3
      FOR UPDATE;
    IF allocated_version > -1 THEN
      EXIT;
    END IF;
    PERFORM pg_sleep(0.1);  -- 100ms backoff; [v14] max cumulative sleep budget 500ms w otwartej transakcji — nigdy więcej, bo trzymamy locki/snapshot
    retries := retries + 1;
    IF retries >= 3 THEN
      RAISE EXCEPTION 'reserve_version_else_branch_timeout';
    END IF;
  END LOOP;
  RETURN allocated_version;
END IF;
COMMIT;
```

Kluczowe: `INSERT ON CONFLICT DO NOTHING` na `version_reservations` jest atomowym locikiem. Tylko wygrywający insert wykonuje increment licznika. Pozostali czekają na row lock i czytają już zaalokowaną wersję. Brak możliwości podwójnego bumpu licznika.

**Off-by-one:** przy pierwszym insercie counter nie istnieje → `INSERT` wstawi `next_version=2`, `ON CONFLICT` nie aktywuje się → `RETURNING next_version - 1 = 1`. Przy drugim: `DO UPDATE SET next_version = 2+1 = 3` → `RETURNING 2`. Kolejne: 3, 4, ...

**Rate limit + GC `[v13]`:** `reserve-version` endpoint ma rate limit 10 req/s per KID (§2.1 v13).

**Czy placeholder `version=-1` może istnieć w committed state?** W opisanym flow (pojedyncza transakcja INSERT → UPDATE counter → UPDATE reservation → COMMIT) placeholder **nie powinien** committed z `-1`. Jeśli counter INSERT failuje, cała transakcja rollback'uje — wiersz nie istnieje.

Cleanup job jest więc **defensywny** dla scenariuszy outside-transaction:
- Bug implementacyjny (ktoś zapomniał atomowości)
- Manual insert do `version_reservations` przez ops/debug
- Replikacja/backup restore z inconsistent state

```sql
-- Cleanup background job co godzinę
DELETE FROM version_reservations
 WHERE version = -1 AND reserved_at < now() - interval '1 hour';
```
**NIE** cofamy licznika przy cleanup (licznik monotoniczny, "dziura" w wersjach jest akceptowana). Jeśli cleanup znalazłby wiersze z `-1` w produkcji, **PagerDuty alert** — sygnał że atomowość transakcji została złamana, wymaga ręcznego investigate.

**Retry tego samego `processing_run_id` zachowuje tę samą wersję.** Idempotent `reserve-version` zwraca istniejący wiersz z `version_reservations`, nie alokuje nowej. Test Phase 0: concurrent double-submit `reserve-version` → tylko jeden increment `advisory_version_counters`, oba requesty zwracają tę samą `version`.

## 9. Consent + RODO controls

- **Hard gate server-side w HTG2** (`check_processing_export_consent` + `app_settings`), nie w processing service.
- `consent_fingerprint` na każdym Dossier. Mutacja consentu → `POST /webhooks/processing/purge` z **scope-specific payloadem `[v11]`**:
  - `{event: 'sensitive_data_change', user_id}` — wycofanie/zmiana `sensitive_data` → purge **wszystkich** Dossier tego usera (fingerprint zawiera sensitive_data globalnie, każdy scope usera się zmienił).
  - `{event: 'capture_change', user_id, booking_id}` — wycofanie/zmiana `session_recording_capture` dla konkretnego bookingu → purge **tylko** Dossier których `bookings_used[]` zawiera ten `booking_id`.
  - `{event: 'user_soft_delete', user_id}` — purge wszystkich Dossier usera + usunięcie z `processing_export_subjects`.
  - `{event: 'recording_soft_delete', user_id, booking_id}` — soft delete konkretnego `client_recordings` → purge Dossier których `bookings_used[]` zawiera `booking_id` (insights z tego bookingu są częścią Dossier).

  Worker po otrzymaniu webhook wykonuje SELECT na lokalnej `dossiers` z odpowiednim WHERE (scope-specific) i kaskaduje delete tylko matching Dossierów, nie wszystkich Dossierów usera. Poprzednia v10 opisywała purge jako user-wide młotek co cofało korzyści z booking-scoped fingerprintów.
- **Webhook reconciliation `[v10]`:** nightly job po stronie workera wysyła listę swoich aktywnych scope items `{user_id, bookings_used[]}` wyciągnięte z lokalnej tabeli `dossiers` przez `SELECT DISTINCT user_id, bookings_used FROM dossiers WHERE purged_at IS NULL` (max 500 per request, paginowane, HMAC). Endpoint `POST /api/processing/consent-fingerprints` zwraca scope-keyed fingerprinty. Worker porównuje z lokalnie zapisanym `consent_fingerprint` w każdym Dossier row — różnica lub `null` → cascade purge tego Dossier row. Audit każdego wywołania w `processing_export_audit` z `type='fingerprint_check'`, `scopes_count`, `matched_count`.
- **`webhook_inbox`:** idempotent receipt log. Powtórzony webhook = no-op. Brak `sequence_number` (§3.5). DLQ po 5 nieudanych próbach + alert.
- **RODO art. 9 — jednolita polityka `[v4]`:** **Cały eksport Dossier wymaga `sensitive_data` consent** — niezależnie od UC1 czy UC2, niezależnie od warstwy Mapy. Powód: transkrypt sesji zawiera treści wrażliwe (zdrowie, trauma, religia/duchowość) które mogą wpływać na każdą decyzję processing service, nie tylko warstwę 3 Mapy. Rozróżnienie "warstwa 1-2 bez sensitive / warstwa 3 z sensitive" **wycofane** (było niespójne: §9 mówił "cały eksport", §15 testowało "layer 3 withheld" — sprzeczność naprawiona).
  - **Konsekwencja dla UC1:** każdy uczestnik spotkania bez `sensitive_data` → `not_analyzable[]` w batchu, deterministyczna ocena stoi.
  - **Konsekwencja dla UC2:** brak `sensitive_data` → UC2 nie startuje w ogóle (job terminal fail z kodem `consent_missing_sensitive`).
  - **Phase 1 shadow test users:** fixture test usera musi mieć **wszystkie wymagane zgody** (`session_recording_capture` z `template_generation=1` + `sensitive_data`) — staging/synthetic ludzie są utworzeni z pełnym stackiem zgód.
  - **Phase 2 `processing_export` per-user opt-in (jeśli wprowadzony):** osobny typ zgody + AND z `session_recording_capture` i `sensitive_data`. Logika: `capture AND sensitive AND processing_export = allow`. UI komunikuje klientowi że to dodatkowa zgoda poza samą analizą po stronie HTG2.
  - **Phase 0 blocker:** pisemna opinia DPO o całym eksporcie pod art. 9. Bez opinii — Phase 0 legal green nie startuje.
- **Retention:** Dossiery TTL 90 dni. Mapa versions 365 dni. `processing_steps.output` redagowany do hashy po 30 dniach. Encrypted audit bucket (KMS) jako Phase 0 deliverable proceduralny. Trade-off: po 91 dniach run inspector pokazuje meta + cytaty z `mapa_versions.citations[]`, nie pełen Dossier.
- **DPA Anthropic:** osobny workspace = osobna DPA.
- **Audit trail:** `processing_export_audit` z `processing_run_id`, `consent_fingerprint`, `passed`, `missing[]`, `latency_ms`.
- **Upstash Redis jako współdzielony komponent infrastruktury `[v4]`:** używany przez HTG2 (anti-replay nonce store) **i** processing service (anti-replay + Arq queue). To **współdzielony state** — nie narusza logicznej izolacji (brak współdzielonej bazy danych klientów, brak współdzielonego kodu), ale jest świadomym elementem infrastruktury w ROPA / DPIA jako "shared operational store". Separacja na poziomie Redis keyspace: `htg2:nonce:*` vs `processing:nonce:*` vs `processing:arq:*`. Osobne ACL tokens per aplikacja. Upstash region = eu-central (minimize latency do Supabase). Rotacja tokens 90 dni równolegle z HMAC KID rotation.

## 10. Evals & quality `[v3]`

**Hard validators (Python, deterministic, BLOCKING — I4, I5):**

Działają **wyłącznie na strukturalnych polach** outputu, nie na narracji.

1. **JSON Schema validation** całego output blob przeciwko `rules/output-schema.json`.
2. **Citation existence:** dla każdego `claim.citations[]` — sprawdzenie że `(source_table, source_id)` istnieje w Dossier dla tego runa. Zero claimów bez cytatu. **Definicja claimu (I4):** strukturalne pole z `claim_text` + `citations[]` + `tags[]`. Narracja narrative w polu `narrative_text` jest **out-of-scope** dla validatora cytatów (mitygacja recenzji "claim w narracji jest nieostry").
3. **Tag whitelist:** `claim.tags[]` mogą zawierać tylko ID z `doctrine-tags.yaml` aktywnej `doctrine_version`. **Walidator NIE szuka terminów w narracji** — tylko sprawdza enum w polu strukturalnym (mitygacja recenzji "vocabulary adherence po polsku to NLP, fałszywe pozytywy").
4. **Required red flags:** parser `rules/red-flags.yaml` definiuje, które flagi MUSZĄ być obecne dla danego inputu (np. "jeśli w `htg_speaking_events` user mówi <5% czasu, MUST flag `risk_withdrawal`"). Sprawdzenie deterministyczne, na strukturalnych polach Dossier.
5. **Schema-level contradiction check:** ograniczone do **strukturalnych enum conflicts** (np. ten sam claim ma `flag=dominates` i `flag=withdrawn` jednocześnie). **Brak ogólnego "no-contradiction lints na NL"** — wycofany jako nierozstrzygalny (mitygacja recenzji #15).

**Wycofane z v2 `[v3]`:**
- "Vocabulary adherence: wszystkie terminy doktryny w outpucie" — zastąpione enum check na `tags[]`
- "No-contradiction lints" na natural language — ograniczone do schema enum conflicts

**Output validator (Sonnet, BLOCKING per I8) `[v5]`:** odpalany po hard validatorach. **Wszystkie checki output validator są blocking** — zgodnie z I8 brak rozróżnienia "sygnał vs hard fail". Checki:
- spójność reasoningu z `framings/*.md` — blocking
- semantyczna sensowność claimów — blocking
- narrative paraphrase check (I4): narracja nie wprowadza nowych fact claims spoza `claims[]` — blocking
- tagi w narracji spoza `doctrine-tags.yaml` — **blocking** (wcześniejsze "sygnał, nie hard fail" wycofane jako niespójne z I8)

**`validator_fail` = `processing_runs.status='failed'` (I8).** Nie trafia do staff review. Retry policy `[v9]`: max 2 auto-retry **całego generation path** (Doctrine Reasoner → Mapping Specialist → output validator) z nowym seedem, potem terminal fail. Retry TYLKO outputu validatora jest wycofany — byłby niebezpieczny: ten sam output raz przechodziłby, raz nie (false stability). Retry całego pipeline zapewnia że validator ocenia **różny** output (nowy seed w Specialist → nowa treść → nowa walidacja). Koszty Opus uwzględniane w `wasted_opus_usd`. Alternatywa: utrzymanie **deterministycznego validator** (temperature=0) nie jest możliwa bo validator sam jest LLM-based i podlega drift modelu. Output validator FPR mierzony w Phase 1; > 20% = trigger redesign.

**Ryzyko narracji (nazwane w §17 risk #1):** output validator jest model-based, nie deterministic. "Strict paraphrase check" nie daje formalnego dowodu — jest to heurystyka. I4 invariant dotyczy pól strukturalnych (deterministic), narracja pozostaje "best effort" blokowana przez output validator. Staff review instrukcja operacyjnie wymaga od reviewera double-check narracji vs listy cytowanych claimów.

**Pairwise human review:**
- Co 2 tygodnie Natalia robi blind A/B na 5 losowych accepted outputach
- **Minimal N kumulacja przed doctrine MAJOR bump `[v3]`:** 30 review (≈ 12 tygodni × 5/2tyg) zanim cokolwiek może wymusić bump MAJOR
- **N=5 co 2 tygodnie jest hałaśliwe** — używamy do **trendu**, nie do single-point decyzji
- Win rate per doctrine version w `eval_runs`

**Golden set:** Phase 1 — inżynier autoruje 10 case'ów per UC w pair session z Natalią. Cel Phase 3 — 50 per UC.

**Regression gate:** każdy doctrine PR + każda zmiana prompta uruchamia hard validators na pełnym eval set. Hard validators muszą przejść **100%** (binarne). Brak procentowych "5% drift" gate'ów.

## 11. RAG vs long context

Korpus klienta mieści się w 1M Opusa. **Brak vector store na content klienta.** Jedyny pgvector to glossary doktryny (lokalne `sentence-transformers`). CI grep blokuje `embedding(` poza `doctrine_embeddings/` (I6).

## 12. Observability

- **Run inspector UI** w processing service: jedna strona per `processing_run_id`, pełen DAG, każdy step z modelem, prompt_version, doctrine_version, kosztem.
- **Cost tracking** per step. Aggregaty per UC, doctrine version, klient. Budget alarms.
- **`wasted_opus_usd` metric `[v4]`:** suma kosztów kroków Opus w runach terminalnie `failed` (hard validators fail lub validator_fail × max retry). Dashboard pokazuje ratio `wasted_opus_usd / total_opus_usd`. Alert przy > 15% tygodniowo — sygnał że output validator ma false positive problem lub prompty Specialisty produkują niedoinżynierowany output. Trigger redesign output validatora (§I8 policy).
- **Output validator false positive rate:** w Phase 1 shadow mode mierzymy "ile runów output validator odrzucił mimo że human review byłby akceptowalny". Metoda: wszystkie `failed` runy output validator są tagowane przez inżyniera w run inspectorze jako "legitimate block" / "false positive". Tygodniowy raport. FPR > 20% → eskalacja.
- **Strukturalne logi** JSON, trace ID = `processing_run_id`.
- **Prompt version pinning** semverem, PR-gated.

## 13. Phasing `[v3]`

**Phase 0 — Foundations.**

Po stronie HTG2 (PR-y):
- Migracja `consent_records.template_generation INT` + **backfill content-based** przez `consent_text LIKE` (§3.1 punkt 1), **nie po dacie** `[v5]`
- Migracja `app_settings`
- RPC `consent_current` + `_consent_capture_count_ok` + `check_processing_export_consent`
- Stary `check_analytics_consent` przepisany na delegację do helper (testy property-based)
- Migracja `processing_advisories` z `subject_group_proposal_id` + partial unique indexes
- Migracja `processing_jobs` z unique constraint na aktywne UC1 per proposal
- Migracja `processing_export_audit`
- Endpointy: §2 (single, batch, write-back, job start, job status callback, purge, consent-fingerprints)
- Feature flagi: `app_settings.client_analytics_enabled`, `app_settings.processing_export_enabled`
- OpenAPI 3.1 spec jako CI artefakt
- CI lint: `app/api/live/consent/route.ts` zmiana copy = bump `CONSENT_TEMPLATE_GENERATION`

Po stronie workera:
- Repo `htg-processing`, CI, deploy Fly.io, processing-service DB
- Doktryna v0.1.0 (vocabulary stub + framingi stub + `output-schema.json` + `doctrine-tags.yaml` zamknięta lista + `red-flags.yaml`)
- Lokalne `sentence-transformers` embedding pipeline dla glossary
- **Smoke test embedder w środowisku produkcyjnym `[v4]`:** pre-deploy benchmark: load model → embed 100 sample phrases → measure RAM peak, cold start, p95 latency. Wymóg: cold start < 30s, RAM peak < 1.5GB, p95 inference < 200ms. Jeśli nie przechodzi, wybór mniejszego modelu (np. `distiluse-multilingual-cased`) lub dedicated worker pool.
- 5 modułów pipeline stub
- Hard validators (Python, bez LLM)
- Staff review UI (login + listing + accept/reject)
- Engineer-only debug view w run inspectorze dla failed runs (I8)
- `webhook_inbox` + nightly reconcile job + **stale job cleanup** (§2.2)
- `make verify-htg2-deps` **przeciwko pinowanemu tagowi HTG2** (nie `main`) `[v4]` — release workera bumpuje `HTG2_CONTRACT_TAG` w `.env.release` jako explicit commit lub tag; contract testy zielenią się tylko przeciwko tej wersji
- Round-trip integration test

Procedury / legal:
- **Osobny Anthropic workspace + DPA podpisana** (BLOCKER `[v3]`: tylko dla "legal green", nie dla "technical green")
- **PRE-2 zamknięty** (DPO opinia o subprocessorach + DPA + retention `session_client_insights`)
- **Pisemna opinia DPO o art. 9 dla całego eksportu Dossier** (zakres: UC1 group enrichment + UC2 Mapa Uwarunkowań, jednolita polityka §9 — cały Dossier, nie tylko części Mapy) `[v6]`
- Encrypted audit bucket (KMS, dostęp DPO + Natalia, wpis ROPA)

**Exit gates Phase 0 — rozdzielone `[v3]`:**

| Gate | Kryterium | Co odblokuje |
|---|---|---|
| **Technical green** | Round-trip test zielony, hard validators działają, contract test zielony, e2e `natalia_para` zielony — **na synthetic fixtures + test users** | Phase 1 shadow mode na test users |
| **Legal green** | Wszystkie blockery prawne zamknięte, ROPA wpis, encrypted audit bucket, opinia DPO | Phase 1 shadow mode na **realnych klientach z consentem** |

Bez tego rozdzielenia ryzyko: zespół albo blokuje Phase 0 "na zawsze" czekając na legal, albo omija blockery testem syntetycznym. Rozdział sprawia że technical work nie czeka na legal, ale realnych klientów dotykamy dopiero po legal green.

**Phase 1 — MVP shadow mode (UC1 + UC2 równolegle).**

- Doktryna v1.0.0 — inżynier z Natalią (4 sesje × 90 min Loom + transkrypcja → draft)
- 10 golden cases per UC pair session
- **Jasne komunikowanie Natalii:** shadow mode w Phase 1 jest **z definicji ślepy** na treść głosówek (Phase 2 deliverable HTG2) i na `admin_notes` (decyzja MVP). Pairwise review w Phase 1 testuje **częściowy sygnał**, nie pełną wizję produktu.
- 5 reali UC1 + 5 reali UC2 vs Natalia ground truth

**Exit gate Phase 1:** 10 golden cases per UC, hard validators 100%, Natalia podpisuje qualitative accuracy z explicit znajomością ograniczeń, zero consent violations w `processing_export_audit`, koszt UC2 < cap PLN/Mapa, DTO contract test zielony.

**Phase 2 — Production gradual.**

- UC1 live dla adminów (async pattern)
- UC2 live dla 5 ochotników z explicit `sensitive_data` consent
- **HTG2 dolicza Whisper pipeline dla `client_recordings`** → eksport głosówek z treścią
- Doktryna v2.0.0
- Eval set 20 per UC
- Rozważenie `staff_hypotheses` jako alternatywy dla `admin_notes`
- Dorobienie `consent_type='processing_export'` jeśli per-user opt-in jest wymagany

**Exit gate Phase 2:** UC1 accept rate ≥60%, UC2 pairwise win rate ≥50%, zero provenance violations, koszt w budżecie. **Zero provenance violations ≠ prawda o kliencie** — to tylko wewnętrzna spójność (§17 risk #1).

**Phase 3 — Production full + przekazanie autorstwa.**

- UC2 live dla wszystkich klientów z consentem
- Natalia commituje doktrynę samodzielnie (GitHub web UI lub CMS jeśli friction)
- Quartalna review cadence
- Regresje hard validators w CI
- Miesięczny pairwise review
- **Voyage upgrade rozważany** jeśli polski quality lokalnych embeddingów niewystarczający (z DPA)

**Zasada:** nie dodajemy modułów pipeline, use case'ów ani RAG ponad glossary, dopóki Phase 3 nie jest stabilne 8 tygodni.

## 14. Krytyczne pliki HTG2 (zweryfikowane na `origin/main` w trakcie pisania planu)

- `lib/meetings/grouping.ts` — algorytm grupowania (UC1)
- `lib/client-analysis/analyze.ts`, `lib/client-analysis/prompt.ts`, `lib/client-analysis/types.ts` — Sonnet 3.5 pipeline (czytamy output)
- `lib/client-analysis/transcribe-audio.ts` — Whisper-1 (wzorzec do rozszerzenia w Phase 2)
- `supabase/migrations/051_client_insights.sql` — RPC `check_analytics_consent` (as-is reference), schema `session_client_insights`
- `supabase/migrations/054_session_client_insights_audit.sql` — wzorzec audit trail
- `supabase/migrations/049_client_recordings_canonical.sql` — głosówki + soft-delete
- `supabase/migrations/050_client_recordings_audit.sql` — audit nagrań
- `supabase/migrations/019_participant_profiles.sql` — D1/D2/D3 + admin_notes (UC1)
- `supabase/migrations/035_booking_recordings.sql`, `036_recording_security_fixes.sql` — istniejące consent gating
- `supabase/migrations/001_htg_schema.sql` — `consent_records` (linia 42), wymaga rozszerzenia o `template_generation` w Phase 0
- `supabase/migrations/003_booking_system.sql` — `bookings.topics` linia 110
- `app/api/live/consent/route.ts` — gdzie HTG2 zapisuje `consent_records` (PRE-1)
- `lib/__tests__/consent-text-scope.test.ts` — testy copy zgody PRE-1

> **CI invariant `[v3]`:** repo `htg-processing` ma `make verify-htg2-deps` które listuje powyższe pliki + commit hash i sprawdza ich istnienie w określonym tagu HTG2. Plan przestaje opierać się na "pamięci zespołu".

## 15. Verification

**Po Phase 0 (technical green):**
- Eksport endpoint manual test (curl + HMAC + valid timestamp/nonce):
  - booking + consent + `template_generation>=1` + `sensitive_data` (jednolita polityka §9) → 200 z dossier `[v5]`
  - bez consent → 409 `consent_missing` z konkretnym `missing[]`
  - bez `sensitive_data` → 409 `consent_missing` z `missing=['sensitive_data']` `[v5]`
  - późniejszy `granted=false` → 409 (test `consent_current` tie-break)
  - `app_settings.processing_export_enabled = false` → 409
  - replay nonce → 409 `replay_detected` (test Upstash Redis)
  - bez `Idempotency-Key` na write-back → 400
- Test reconcile: zmieniony fingerprint w HTG2 → nightly job kasuje stale dossiery
- Test purge: webhook z `granted=false` → cascade delete + audit
- Test `natalia_para`: e2e booking par + tylko 1 z 2 zgód capture → 409 (test przez `_consent_capture_count_ok`, obaj userzy źródłowo z `consent_records`, nie `bookings.user_id`) `[v5]`
- Test `natalia_para`: e2e gdzie drugi uczestnik (NIE `bookings.user_id`) prosi o eksport → sprawdza że RPC go rozpoznaje przez `consent_records.user_id` `[v5]`
- Test contract canonical body: ten sam JSON (w tym polskie diakrytyki NFC + stringi UUID) w Pythonie i TS daje ten sam HMAC
- Test idempotency po TTL: worker używa tego samego klucza 8 dni po pierwszym użyciu → cleanup job wyczyścił stary wiersz → nowy INSERT działa jak pierwszy raz (bo klucz pochodzi z nowego run_id, nie reuse w tym samym runie) `[v10]`
- Test idempotency concurrent: dwa równoległe requesty z tym samym `Idempotency-Key` → tylko jeden INSERT (dzięki `ON CONFLICT DO NOTHING`), drugi dostaje cached response_body `[v10]`
- Test heartbeat stuck detection: worker umiera mid-run → cleanup job po 5 min oznacza stuck job z timeout `[v5]`
- Test reconcile przez `processing_jobs.processing_run_id` column: zawieszony job + istniejący draft advisory z matching `processing_run_id` + subject → cleanup job domyka (anti-hijack double check) `[v5]`
- Hard validators: synthetic Mapa output z brakującymi citations → blocked
- Hard validators: synthetic Mapa z tagiem spoza `doctrine-tags.yaml` → blocked
- Output validator blocking test: synthetic Mapa z narracją wprowadzającą fact claim bez cytatu → output validator blokuje, `processing_runs.status='failed'` `[v5]`
- Batch export partial success test: batch N=5 gdzie 1 user staje się stale po 2 retry → job kończy `done` z 4 analyzable + 1 not_analyzable, nie failuje całości `[v5]`
- Batch export total fail test `[v12]`: UC1 job z 2 grupami × 3 uczestników gdzie w żadnej grupie nie ma ≥2 analyzable → `insufficient_analyzable_groups` (nie per-user próg)
- Test UC1 multi-advisory `[v12]`: UC1 z 3 grupami × 4 uczestników, wszystkie analyzable → `reserve-version` wywołany 3× z różnymi `group_index`, 3 różne version, 3 advisories w `processing_advisories`, 3 wiersze w `processing_job_advisories`, `processing_jobs.status='done'`, `result_advisory_id IS NULL`
- Test UC1 częściowy sukces `[v12]`: 3 grupy, tylko 2 analyzable → 2 advisories + 2 `processing_job_advisories` rows, grupa 3 skipped w output
- Test UC1 unique constraint `[v12]`: próba drugiego `reserve-version` z tym samym `(run_id, group_enrichment, proposal_id, group_index)` → idempotent, zwraca tę samą wersję
- Test scope-keyed fingerprint auth `[v12]`: worker pyta o fingerprint scope z `bookings_used` zawierający booking którego nie eksportował → odpowiedź `null` (blokada sondowania), nawet jeśli user jest w `processing_export_subjects`
- Contract test `client_user_ids` format `[v13]`: wywołanie `bookings_used[]` SELECT na realnych `session_client_insights` rows (minimum 5 different bookings) → sprawdzenie że każdy `client_user_ids[]` entry jest valid UUID lowercase, join z `p_user_id::text` produkuje spodziewane wyniki dla znanych userów (w tym drugiego uczestnika `natalia_para`)
- Test `group_index` stability `[v13]`: UC1 job dla proposal P z 3 grupami. Admin modyfikuje proposal (rotate grup). Ponowny UC1 job → nowe advisories z `group_index` zgodnym z nową kolejnością. Stare advisories zachowują historyczny `group_index` — staff UI przez filter per (proposal, group_index) może pokazywać mieszane wersje, ale unique constraints na DB gwarantują że nie ma dwóch live `accepted` per `(proposal, group_index)`. Rekomendacja produktowa: proposal, po wygenerowaniu advisory, nie powinien być modyfikowany (immutable pod kątem grupowania)
- Test authority callback group_index swap `[v13]`: worker wysyła `{advisory_id: X, group_index: 2}` gdzie `X.group_index = 0` → HTG2 zwraca `409 group_index_mismatch`
- Test reconcile UC1 multi-advisory `[v13]`: UC1 job timeout po wpisie 2 z 3 advisories, worker crash przed callback → cleanup znajduje 2 matching advisories, wstawia 2 wiersze w `processing_job_advisories`, oznacza `status='done'`. Staff widzi 2 grupy, 3 brakuje
- Test UC1 advisory supersede `[v13]`: pierwszy job → 3 accepted advisories (g0, g1, g2). Drugi job → 3 draft advisories z nową wersją. Staff accepts g0 nowej wersji → stary g0 ma status `superseded`, g1 i g2 starej wersji nadal `accepted`, g1 i g2 nowej wersji nadal `draft`. Staff UI filtruje per (proposal, group_index) wybierając najnowszą accepted
- Test race na dwóch równoległych akceptacjach UC1 `[v14]`: dwóch adminów jednocześnie klika "accept" dla dwóch draft advisories tej samej grupy `(proposal=P, group_index=G)` → jeden wygrywa (zapisuje `accepted`), drugi dostaje `409` z powodu `processing_advisories_group_accepted_uniq` partial unique index
- Test race na dwóch równoległych akceptacjach UC2 `[v14]`: dwóch adminów jednocześnie klika "accept" dla dwóch draft Map tego samego `subject_user_id` → jeden wygrywa, drugi 409 z `processing_advisories_mapa_accepted_uniq`
- Test lease ownership w write-back `[v14]`: worker A ustawia `attempt_id=attempt_1`, pipeline sukces. Admin cancel'uje (lub 5+ min brak heartbeat). Worker B przejmuje z `attempt_id=attempt_2`. Stary worker A próbuje write-back z `attempt_1` → 409 `lease_lost` nie ma dostępu do advisory write
- Test lease ownership w reserve-version `[v14]`: analogicznie — stary worker próbuje `reserve-version` po utracie lease → 409 `lease_lost`, wersja nie jest alokowana
- Test `done_partial` reconcile `[v14]`: UC1 job z `expected_advisory_count=3`. Worker zapisuje 2 draft advisories i crashes przed status callback. Reconcile znajduje 2 matching advisories → `status='done_partial'`, `error_code='reconcile_partial_advisory_set'`. Staff UI pokazuje warning o niekompletnym zestawie
- Pending timeout test: utwórz job, nie startuj workera → po 10 min `status='failed'` z `error_code='pending_timeout'` `[v6]`
- Wall-clock cap test: UC2 job trwa > 45 min (mock wolnego Opus) z żywym heartbeatem → cleanup i tak `failed` z `wall_clock_exceeded` `[v6]`
- UC2 idempotent test: drugi POST do `/jobs/create` dla tego samego `subject_user_id` z active `pending/running` jobem → zwraca ten sam `{job_id, processing_run_id}`, nie 409 `[v6]`
- Check-in confirmation test: mock 500 na pierwszym status callback → worker retry 3x, potem requeue job bez startu pipeline `[v6]`
- Orphan draft GC test: draft `processing_advisories` bez linku starszy > 7 dni → `status='expired'` z `error_code='orphan_draft_gc'` (nie `rejected` — `expired` = operacyjne GC, `rejected` = merytoryczne staff decision) `[v8]`
- `make verify-htg2-deps` zielony przeciwko pinowanemu tagowi HTG2

**Po Phase 0 (legal green):**
- Wszystkie blockery prawne zamknięte
- ROPA wpis dla `htg-processing`
- Encrypted audit bucket gotowy
- Pierwszy round-trip na **realnym** test user z realnym consentem zielony

**Po Phase 1 (shadow):**
- Run inspector pokazuje pełny DAG z modelem (API ID), doctrine_version, prompt_version, kosztem
- `pytest tests/evals/uc1.py` + `tests/evals/uc2.py` — hard validators 100%
- Cost test: 1 Mapa = koszt Opusa w budżecie
- Consent test: UC2 dla usera bez `sensitive_data` → job terminal fail z `consent_missing_sensitive`, worker NIE startuje runa `[v4]`
- Consent test: UC1 batch z jednym uczestnikiem bez `sensitive_data` → ten user w `not_analyzable[]`, reszta przetwarzana normalnie `[v4]`
- Pairwise: Natalia daje verdict ≥3/5 outputów per UC jako "useful w shadow mode" **mając świadomość ograniczeń (brak głosówek, brak admin_notes)**

**Po Phase 2:**
- Pierwszy real-world UC1 advisory zaakceptowany (async działa)
- Pierwsza Mapa zaakceptowana przez Natalię
- `processing_export_audit` z `processing_run_id` dla każdego eksportu
- Reconcile log: 0 rozjazdów przez 7 dni z rzędu

## 16. Must-fix przed produkcją `[v3]`

**Blocking dla "technical green Phase 0":**

1. NULL-safe `processing_advisories` z `subject_group_proposal_id` w UC1 unikalności (§8)
2. HMAC z timestamp + nonce + KID rotation + Idempotency-Key + canonical body spec + Upstash Redis nonce store (§2.1)
3. RPC `check_processing_export_consent` (booking-level, UC2) + `check_processing_export_consent_meeting` (meeting-level, UC1) + helpery `_consent_capture_count_ok`, `_user_export_consent_ok` (§3.1 punkty 4-5) `[v6]`
4. `consent_records.template_generation INT` migracja + backfill + CI lint (§3.1 punkt 1)
5. `consent_current` z tie-break `id DESC` (§3.1 punkt 2)
6. `app_settings` tabela zamiast `current_setting` (§3.1 punkt 3)
7. `processing_jobs` w HTG2 + unique constraint na aktywne UC1 per proposal (§6.1)
8. Hard validators **wyłącznie na polach strukturalnych** (§10)
9. Output validator blocking, nie miękki (I8) (I8)
10. Batch export z **logicznym snapshotem** (krótkie odczyty per user, `stale_users[]`, retry) + per-user gate + N≤16 (§6 UC1, §I2) `[v5]`
11. `make verify-htg2-deps` w CI (§14)
12. E2E test `natalia_para` (§3.1 punkt 5)

**Blocking dla "legal green Phase 0":**

13. Pisemna opinia DPO dla całego eksportu Dossier pod art. 9 (§9) — **nie tylko Mapy**, zakres obejmuje UC1 group enrichment + UC2 Mapa Uwarunkowań `[v7]`
14. PRE-2 zamknięty + DPA Anthropic dla nowego workspace
15. Encrypted audit bucket (KMS, dostęp, ROPA wpis)
16. ROPA wpis dla całego serwisu htg-processing

**Nice-to-have (Phase 2):**

17. SSE / WebSocket dla UC1 status zamiast polling
18. Decyzja `staff_hypotheses` jako alternatywa dla `admin_notes`
19. Whisper dla `client_recordings` (po stronie HTG2)
20. `consent_type='processing_export'` per-user opt-in

## 17. Acknowledged risks

1. **Compound error przez `session_client_insights` `[v8]`.** Mapa buduje na warstwie pośredniej (Sonnet 3.5 journey extraction), która może produkować **wygenerowany tekst niezgodny ze źródłami** (w dokumencie używamy tylko opisu technicznego: tekst zawiera twierdzenia niemożliwe do zweryfikowania przeciwko wejściu). Output validator + hard validators sprawdzają tylko provenance vs Dossier, nie rzeczywistość. **`zero provenance violations` ≠ prawda o kliencie.** Mitygacja: pairwise human review jako veto + Phase 1 shadow mode. **Phase 2 transcript głosówek dodaje sygnał, ale NIE naprawia problemu niezgodnego tekstu warstwy `session_client_insights`** — to są dwa różne problemy.

**Dodatkowo `[v8]`:** I4 gwarantuje "każdy strukturalny claim ma cytat", ale **nie gwarantuje "zero nieuzasadnionego tekstu dla człowieka"**. Narracja jest sprawdzana tylko przez output validator (model call, nie deterministic). Staff czytający Mapę dostaje narrację jako główny nośnik sensu; jeśli output validator przepuści subtelne "twierdzenie bez fundamentu" w narracji, human reader może mu zaufać. Mitygacja procesowa: **staff review instrukcja explicitnie mówi "sprawdź, czy każde zdanie narracji możesz powiązać z którymś claim'iem listowanym w Mapie"** — przeszkolenie reviewerów, nie kod.

2. **Art. 9 dla "duchowości".** Definicja prawna duchowych treści jest niepewna. **Warstwy 1-2 też mogą zawierać dane wrażliwe** (zdrowie, trauma z transkryptu). Mitygacja: pisemna opinia DPO **o całym eksporcie**, conservative default = cały eksport wymaga `sensitive_data`.

3. **DTO dryft.** Brak shared package = ryzyko cichego rozjazdu. Mitygacja: `export_schema_version` + contract test po obu stronach + canonical body spec + OpenAPI w CI.

4. **`session_client_insights` jako single point of truth.** Mitygacja: contract testy, version pin `analysis_prompt_version`, alert w CI.

5. **Natalia jako bottleneck Phase 1.** Mitygacja: structured Loom interview process, time-box, jasna definicja Phase 1 done.

6. **Async UX dla UC1.** Polling co 5s + spinner. Może frustrować adminów dla małych spotkań. Mitygacja: UC1 advisory jako "wzbogacenie opcjonalne", admin może akceptować deterministyczną propozycję bez czekania. Limit 1 active polling per browser tab.

7. **Pomijanie głosówek w MVP.** Phase 1 shadow mode jest **z definicji ślepy** na ten sygnał. Natalia musi to wiedzieć podczas pairwise review.

8. **Pomijanie `admin_notes` w MVP.** Group Advisor może pominąć ważny kontekst. Phase 2 decyzja o `staff_hypotheses` jako jawnym artefakcie.

9. **Walidatory NL byłyby fałszywie pozytywne.** Stąd ograniczenie hard validators do strukturalnych pól (tagi z zamkniętej listy ID, citations, schema enums). NL detection zostaje na output validator (LLM, nie deterministic).

10. **Spójność wyników między starym a nowym RPC.** Mitygacja: wspólna helper function `_consent_capture_count_ok` + property-based test implikacji.

11. **Lokalne embeddingi mogą mieć słabszy polski.** Trade-off: zerowa lista subprocessorów. Phase 3 możliwy upgrade do Voyage z osobną DPA.

12. **Pairwise N=5 co 2 tygodnie jest hałaśliwe.** Używamy do trendu, nie do single-point decyzji. Doctrine MAJOR bump wymaga 30 review kumulacji.

## 18. Open questions (zredukowane `[v3]`)

Decyzje, które domknąłem w tekście i wyjąłem z tej listy:
- ~~`processing_jobs` w HTG2 czy agencie~~ → HTG2 (§6.1)
- ~~`PROCESSING_EXPORT_ENABLED` global vs per-user~~ → global w Phase 1, per-user opt-in w Phase 2 (§3.1 punkt 3)
- ~~Append-only consent_records vs `withdrawn_at`~~ → append-only z `consent_current` helper (§3.1 punkt 2)
- ~~Voyage vs lokalne~~ → lokalne `sentence-transformers` w Phase 1, Voyage opcjonalne Phase 3 (§4)

Pozostają otwarte:

1. **DPO-of-record** dla nowego serwisu. Wymagany przed legal green Phase 0.
2. **Opus budget cap** miesięczny + fallback (degrade do Sonnet 4.6 na cap-breach).
3. **Retention `processing_steps.output`** — 30 dni → hash, czy dłużej? Spięcie z SLA śledztwa po incydencie + ROPA.
4. **Dostęp klienta do swojej Mapy w Phase 3** — UI staff-only, czy client-facing?
5. **Format doctrine interview z Natalią** — Loom + transkrypcja vs live coworking?
6. **Hosting:** Fly.io vs Railway? Wpływa na Upstash region, latency do Supabase eu-central.

## 19. Edge cases — SQL/app `[v4]`

Lista scenariuszy krawędziowych które muszą być pokryte testami Phase 0. To jest operacyjna checklista, nie nowe funkcje.

1. **Brak rekordu `sensitive_data` dla usera.** `consent_current(user_id, 'sensitive_data')` zwraca NULL. Gate: `passed=false, missing=['sensitive_data']`. Fingerprint: używamy stałego markera `"absent"` w miejscu id/granted/template_generation/created_at dla tego typu. Test: pierwszy eksport po założeniu konta (user bez żadnych zgód).

2. **Wycofanie zgody w trakcie batch runu.** User A ma consent na początku batcha, wycofuje w trakcie (nowy `consent_records` row z `granted=false`). Drugi fingerprint check na końcu batcha wykrywa zmianę → user A w `stale_users[]`. Worker retry pełnego batcha, user A wraca jako `not_analyzable`. Pozostali userzy przetworzeni normalnie. Test: mock `consent_records` insert w trakcie handler execution.

3. **User UC1 nie ma żadnego bookingu.** Uczestnik spotkania może być pracownikiem HTG, bez historii sesji 1:1. `check_processing_export_consent_meeting` sprawdza tylko `htg_meeting_participants` i `_user_export_consent_ok` — oba przechodzą nawet bez bookingu. Dossier dla tego usera zawiera tylko `meetings[]`, puste `session`/`pre`/`post`. Hard validator akceptuje pusty `session`. Test: staff użytkownik jako uczestnik testowy.

4. **Recording soft-deleted między eksportem a analizą.** Między handlerem eksport a Dossier Builder (różne momenty w czasie) `client_recordings.deleted_at` zostaje ustawione. Worker już pobrał metadane. Hard validator przy citation check znajdzie citation do `source_id` który już nie istnieje w żywym HTG2. **Reguła:** citation check operuje **na Dossier snapshot**, nie na żywym HTG2 — Dossier jest immutable po utworzeniu. Separat: purge webhook kasuje Dossier, retry.

5. **Doctrine version mismatch.** `processing_runs.doctrine_version` w DB nie pasuje do żadnego wiersza w `doctrine_versions` (np. ktoś usunął stary tag). Run inspector pokazuje `doctrine_version_orphan` w UI. Nie blokuje istniejących runów ale alarmuje. Test: manual insert orphan row.

6. **Output validator timeout.** Sonnet output validator call timeout (rzadkie ale możliwe). Treated jako retry trigger (I8: max 2 retry), potem terminal fail z `error_code='validator_timeout'`. Test: mock Anthropic API timeout.

7. **Opus 1M context overflow.** Rozgadany klient + historia > 1M tokenów. Dossier Builder musi mieć guard: jeśli estimated tokens > 900k, pre-emptive job fail z `error_code='dossier_too_large'`, admin dostaje info żeby wybrać subset. Nie próbujemy magic truncation. Test: synthetic dossier z 1.2M tokenów.

8. **Race na `processing_jobs` podczas cancelowania przez admina `[v13]`.** Admin cancel'uje job w momencie kiedy worker właśnie commituje write-back. Admin update: `status='cancelled'`. Worker next step: status callback `done` → HTG2 widzi `cancelled`, zwraca `409 job_cancelled` (nie `job_already_terminal` — rozróżnienie z v10: terminal = done/failed, cancelled to osobny stan). Worker heartbeat loop wykrył już wcześniej ten 409 i ustawił `lease_state.alive=False`, więc pipeline już aborted przed write-back. Advisory row (jeśli powstał) istnieje jako draft i jest zbierana przez orphan draft GC po 7 dniach. Test: orkiestrowany race.

9. **Purge webhook dla usera nieistniejącego w processing-service DB.** HTG2 wysyła purge dla user_id którego worker jeszcze nigdy nie eksportował. Idempotent no-op, audit log `purge_no_target`. Test: purge świeżego usera.

10. **Hot-reload `doctrine` bez bumpu `doctrine_version`.** Inżynier edytuje plik w repo, zapomina bumpnąć tag. CI lint w `htg-processing` PR sprawdza: każda zmiana pliku w `doctrine/vX.Y.Z/` wymaga że `doctrine/index.yaml.version` jest większa niż na `main`. PR blokowany inaczej.

11. **Out-of-order webhook delivery dla consent change.** HTG2 wysyła webhook "granted=false" (seq=5), potem "granted=true" (seq=6) — ale seq=5 przyszedł drugi. Worker: fingerprint check dla usera → aktualny stan w HTG2 to `granted=true` (z `consent_current`). Worker ignoruje outdated webhook (fingerprint nie pasuje do rzeczywistości). Reconcile job wyłapie dryft. Test: webhook replay w odwrotnej kolejności.

12. **Anti-replay race.** Dwa żądania z tym samym nonce w krótkim oknie (network retry po obu stronach). Upstash `SET htg2:nonce:X 1 EX 600 NX` (lub `processing:nonce:X` dla drugiego kierunku) — pierwszy wygra, drugi dostanie `409 replay_detected`. Inicjator retry z nowym nonce. Test: concurrent curl z tym samym nonce `[v8]`.

13. **Idempotency key reuse po TTL `[v10]`.** Worker w buggy state próbuje reużyć klucz 8 dni po użyciu. Stary klucz został usunięty przez cleanup job (TTL 7 dni), więc `INSERT ON CONFLICT DO NOTHING` po prostu wstawi nowy wiersz z nowym response_body. Worker kod ma asercję "klucz pochodzi z aktualnego `processing_run_id`" — to chroni przed buggy re-use w tym samym runie. Wygaśnięcie po TTL + re-insert jest bezpieczne, bo nowy klucz oznacza nowy commit semantyczny. Test: inject stale entry → cleanup job background usuwa → nowy insert z tym samym kluczem → 200 jak normalne.

14. **`htg_participant_profiles` bez D1/D2/D3 dla uczestnika spotkania.** Profil nie istnieje (nowy user). UC1 Group Advisor dostaje pustą sekcję profile w Dossier. Reguła promptu: "jeśli brak profile, nie generuj sugestii D1 delta dla tego usera". Hard validator: OK jeśli brak sugestii dla brak-profile uczestnika. Test: mock spotkanie z 1 uczestnikiem bez profilu.

15. **Consent wycofany po pierwszym eksporcie ale przed UC2 Mapa.** User eksportowany, Dossier zbudowany, Reasoner tagował, Specialist o chwilę zacznie Opus call. Purge webhook przychodzi → `processing_runs.status='cancelled'`, Dossier kasowany, Opus NIE jest uruchamiany. Koszt: już poniesiony Reasoner cost, ale nie Opus. Zliczane w `cost_usd`, nie w `wasted_opus_usd`. Test: webhook timing mid-run.

16. **Write-back 200 ale callback nie dochodzi `[v5]`.** Advisory zapisane w HTG2 jako draft, worker próbuje POST status `done`, dostaje timeout. Retry z exponential backoff (1s, 3s, 9s, 27s, 81s). Przed wyczerpaniem retry job pozostaje w `running` z heartbeatem. Jeśli wszystkie retry fail + brak heartbeat > 5 min → cleanup job podłącza advisory przez `processing_run_id` match. Test: mock 500 na status endpoint.

17. **Purge webhook podczas zapisu `mapa_versions` `[v5]`.** Worker w trakcie commitu wersji Mapy do swojej DB; purge webhook przychodzi. Kolejność: najpierw kończymy bieżącą transakcję (zapis Mapy), potem przetwarzamy webhook z inboxa. Purge wykonuje cascade delete na `mapa_versions` włącznie z właśnie zapisaną wersją. Test: concurrent write + webhook arrival.

18. **Idempotent write-back przy utracie response `[v12]`.** Worker POST advisory, HTG2 200 ale network drop — worker retry z tym samym `Idempotency-Key`. HTG2: `INSERT ON CONFLICT DO NOTHING` w `idempotency_keys` zwraca 0 rows → SELECT existing → zwraca cached `response_body` (pełny JSON, nie hash) z cached `response_status`. Test: mock network failure po stronie workera, sprawdź że drugi POST nie tworzy drugiego wiersza w `processing_advisories`, a odpowiedź identyczna do pierwszego.

## 20. Security operations `[v5]`

Operacyjne procedury bezpieczeństwa i incident response — nie feature'y, ale must-have przed legal green Phase 0.

### 20.1 Model kluczy i rotacja

- **Dwa osobne HMAC secrety** (§2.1): `HMAC_SECRET_WORKER_TO_HTG2` i `HMAC_SECRET_HTG2_TO_WORKER` `[v8]`. Separacja direction prevents full impersonation przy wycieku jednego sekretu.
- **Rotacja planowana:** co 90 dni, koordynowana między Doppler (processing service) i Vercel env (HTG2). Window: 7 dni z 2 active KIDs (`v1` i `v2`), obie strony akceptują oba klucze, stary KID revoke po 7 dniach.
- **Rotacja emergency (kompromitacja):** procedura w runbooku:
  1. Revoke compromised KID w obu środowiskach (1 min).
  2. Rotate Upstash tokens używane przez tę aplikację (5 min).
  3. Wygeneruj nowy KID, deploy do obu środowisk (30 min).
  4. Audit: przejrzyj `processing_export_audit` i logi HTG2 za okres ekspozycji, flaguj anomalie (różne IP, dziwne wzorce żądań).
  5. Jeśli wyciek potwierdzony → DPO notification, potencjalnie Notify supervisory authority w 72h (RODO art. 33).

### 20.2 Debug view (failed runs) — controls

- **Osobna rola** `processing_debug_engineer` w Supabase Auth projektu htg-processing. Przypisanie wymaga podpisu DPO + engineer lead.
- **Audit każdego odczytu:** tabela `debug_view_audit` loguje `(user, processing_run_id, accessed_at, ip, purpose)`. Purpose jest wymagany jako free-text (co najmniej 20 znaków).
- **Retencja surowych outputów failed runów:** 14 dni, potem automatic hash redaction (krótsza niż 30 dni dla succeed runów, bo zawierają pełne PII bez użytku biznesowego).
- **Zakaz eksportu:** UI nie ma download button. Copy-paste z przeglądarki jest technically possible ale audited (MDM policy dla engineer machines).
- **2FA obowiązkowe** dla roli `processing_debug_engineer`.
- **Okresowy review:** raz na miesiąc DPO dostaje raport z `debug_view_audit` — kto, ile, jakie purposes.

### 20.3 Upstash Redis — shared operational store `[v6]`

**Model nonce uproszczony: każda strona weryfikuje nonce wyłącznie dla inbound traffic we własnym prefiksie. Brak cross-namespace read.**

- **Keyspace separation:**
  - `htg2:nonce:*` — nonce weryfikacyjne dla inbound requestów do HTG2 (od workera: export, write-back, job status callback, consent-fingerprints, jobs/create). **Zapisywane i czytane tylko przez HTG2.**
  - `processing:nonce:*` — nonce weryfikacyjne dla inbound requestów do workera (od HTG2: jobs/start UC1, purge webhook). **Zapisywane i czytane tylko przez processing service.**
  - `processing:arq:*` — Arq queue (worker coordination), tylko processing service.
  - `processing:ratelimit:*` — token buckets dla endpointów po stronie workera.
  - `htg2:ratelimit:*` — token buckets dla endpointów po stronie HTG2.
- **ACL tokens — minimalne uprawnienia bez cross-read:**
  - HTG2 token: `+@read +@write` tylko na `htg2:*`. Brak dostępu do `processing:*`.
  - Processing service token: `+@read +@write` tylko na `processing:*`. Brak dostępu do `htg2:*`.
  - **Zakaz** FLUSHDB, FLUSHALL, CONFIG, SCAN bez prefix na obu tokenach.
  - Jeśli Upstash plan nie wspiera prefix ACL (Enterprise required) → **blocker Phase 0**, wymagane **dwa osobne projekty Upstash** (HTG2 own + processing own) od dnia 0, nie "rozważenie Phase 3".
- **Verification Phase 0:** pre-deploy smoke test sprawdza czy wybrany Upstash plan faktycznie daje prefix ACL. Jeśli nie → fallback do dwóch projektów.
- **Incident response przy wycieku tokenu:** rotate natychmiast, flush dotkniętego keyspace (nonce niedostępne 10 min — naturalny retry działa), audit Redis access logs z Upstash.
- **Blast radius:** kompromitacja jednego tokenu = anti-replay zniwelowane + (dla workera) queue poison + rate limits wyłączone tylko na jednej stronie. W DPIA jako osobny przepływ danych infrastrukturalnych. Mitygacja: Upstash audit logs + alert na anomalie.

### 20.4 Consent-fingerprints endpoint — enumeration defense `[v6]`

- **Auth:** ten sam HMAC stack co reszta endpointów worker→HTG2.
- **Scope constraint przez dedykowaną tabelę `processing_export_subjects` `[v9]`:** poprzednia wersja v6-v8 używała `processing_export_audit` jako źródła scope. Audit jest operacyjnie kruchy — retention, migracja ETL lub błąd może wyciąć wiersze, powodując że legalni userzy dostają `null` i reconcile błędnie purge'uje cache. V9 wprowadza **trwały rejestr autoryzacji scope**:
```sql
CREATE TABLE public.processing_export_subjects (
  service_id      TEXT NOT NULL,            -- derived z HMAC KID
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (service_id, user_id)
);
```
Każdy udany eksport robi `INSERT ON CONFLICT DO UPDATE SET last_seen_at = now()`. 

**Cleanup na hard delete + soft delete `[v10]`:** FK `ON DELETE CASCADE` czyści przy **hard delete** z `auth.users` (rzadkie w HTG2). Dla **soft delete** (pole `deleted_at` w profilach lub użytkownikach), HTG2 musi explicit dodać cleanup w soft-delete flow:
```sql
-- W soft-delete handlerze HTG2:
DELETE FROM public.processing_export_subjects WHERE user_id = p_user_id;
-- Plus trigger purge webhook do workera [v10]
```
Audit log (`processing_export_audit`) zostaje, ale tylko do raportów DPO, nie do autoryzacji. Minimalizacja: po soft delete user znika z autoryzacji scope, reconcile zwraca `null` dla wszystkich jego scope items → worker kasuje Dossiery.

**Scope-keyed autoryzacja `[v12]`:** poprzednie v10-v11 używały user-level check (`service_id + user_id`), co pozwalało workerowi pytać o arbitralne `bookings_used[]` dla znanego usera i sondować booking-level consent. V12: autoryzacja sprawdza że **żądany zestaw `bookings_used[]` jest podzbiorem bookingów które worker wcześniej eksportował**. Rozszerzenie schematu:
```sql
CREATE TABLE public.processing_export_subject_bookings (
  service_id      TEXT NOT NULL,
  user_id         UUID NOT NULL,
  booking_id      UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (service_id, user_id, booking_id),
  FOREIGN KEY (service_id, user_id) REFERENCES processing_export_subjects(service_id, user_id) ON DELETE CASCADE
);
```
Każdy udany eksport dla `(user_id, booking_ids[])` robi upsert zarówno `processing_export_subjects` (user-level) jak i `processing_export_subject_bookings` (per-booking) dla każdego bookingu z `bookings_used[]`.

Query scope dla consent-fingerprints:
```sql
-- Dla każdego scope item {user_id, bookings_used[]}:
-- 1. Walidacja user-level
EXISTS (
  SELECT 1 FROM processing_export_subjects
  WHERE service_id = <derived_from_kid> AND user_id = <scope.user_id>
)
AND
-- 2. Walidacja że KAŻDY booking w bookings_used[] był wcześniej eksportowany
NOT EXISTS (
  SELECT 1 FROM unnest(<scope.bookings_used>) AS req_bk
  WHERE NOT EXISTS (
    SELECT 1 FROM processing_export_subject_bookings
    WHERE service_id = <derived_from_kid>
      AND user_id = <scope.user_id>
      AND booking_id = req_bk
  )
)
```
Worker nie może pytać o fingerprint dla bookingu którego nigdy nie eksportował. Blokuje sondowanie consent'u arbitralnych bookingów.

**`service_id` jest derived z zweryfikowanego KID** (mapowanie `kid_to_service` po stronie HTG2, np. `kid='v1-processing' → service='htg-processing-v1'`). Dozwoleni są userzy + bookingi, dla których dany integrator kiedykolwiek w historii widział eksport.
- **Cold start edge case `[v10]`:** pierwszy user dodawany do processing-service DB już ma wpis w `processing_export_subjects` z momentu udanego eksportu. Reconcile zawsze ma wpis wcześniejszy niż pierwsze wywołanie fingerprint check. Brak chicken-and-egg. (Poprzednia v9 mówiła o `processing_export_audit` — błędna referencja, scope v10 to `processing_export_subjects`.)
- **Rate limit `[v11]`:** **per-KID** (nie globalnie) — 1 req/sekundę per HMAC key identifier, max **500 scope items** per request (zsynchronizowane z §2 kanałami — poprzednia v6 mówiła 1000 `user_ids`, v10 zmieniła na scope items 500, §20.4 nie był zsynchronizowany). Token bucket w `htg2:ratelimit:fingerprints:{KID}`. Przekroczenie → 429 z nagłówkiem `Retry-After`.
- **Audit `[v13]`:** każde wywołanie w `processing_export_audit` z `type='fingerprint_check'`, `scopes_count` (liczba scope items w request body), `matched_count` (liczba scope items zwróconych z non-null fingerprint), `latency_ms`, `caller_service_id`, `kid`. Raport tygodniowy do DPO. Poprzednia wersja v6-v12 używała `user_ids_count` — niepoprawnie, request v10+ niesie scope items, nie same user_ids.
- **Request body `[v10]`:** `{scopes: [{user_id, bookings_used: [uuid, ...]}, ...]}`. Każdy scope item reprezentuje jeden Dossier cache entry po stronie workera. HTG2 dla każdego oblicza scope-keyed fingerprint (§3.5 v10) i zwraca.
- **Response `[v10]`:** `{results: [{scope_key, fingerprint_or_null}, ...]}` gdzie `scope_key = SHA256(user_id || sorted(bookings_used[]))`. `null` dla (a) scope purgowany (consent wycofany dla któregoś bookingu lub sensitive_data), (b) user nigdy nie istniał, (c) scope poza autoryzacją (user nie w `processing_export_subjects` dla tego KID). **Indistinguishable** — worker nie może rozróżnić tych przypadków, blokuje enumerację.
- **Walidacja formatu `[v6]`:** UUID v4 regex check przed query; nieprawidłowe UUID → 400 z komunikatem (nie wchodzi do scope check).
- **Residual risk w DPIA `[v12]`:** nawet przy kompromitacji HMAC atakujący jest ograniczony **rate limitem per KID**: 1 req/s × 500 scope items/req = **500 sprawdzonych scope items na sekundę**, czyli max ~43.2 mln scope items/dzień przy ciągłym maksymalnym obciążeniu. Dodatkowo **scope-keyed autoryzacja** (v12): atakujący może pytać wyłącznie o subset bookingów które zostały wcześniej eksportowane przez ten service_id — nie może "zgadywać" arbitralnych booking IDs. To jest **throughput zapytań o znane historyczne eksporty**, nie brute-force. Mitygacje: (a) uniform `null` response bez ujawniania stanu, (b) audit log każdego żądania z alertami na burst > 500 req/godz, (c) SLA DPO do revocation HMAC < 15 min przy incydencie, (d) scope-keyed autoryzacja blokuje sondowanie nieznanych bookingów. Scenariusz losowego zgadywania jest niepraktyczny — 43 mln scope items/dzień vs realna liczba eksportów HTG (rząd tysięcy).

### 20.5 ROPA / DPIA wpisy

Obowiązkowe wpisy przed legal green Phase 0:

1. **Processing activity:** "Wspomaganie decyzji personelu oparte na przetwarzaniu tekstu z udziałem zewnętrznych modeli językowych" — UC1 group enrichment + UC2 Mapa Uwarunkowań. Podstawa prawna: art. 6(1)(a) zgoda + art. 9(2)(a) explicit consent (sensitive_data).
2. **Data categories:** transkrypty sesji (art. 9), głosówki metadata (Phase 1), D1/D2/D3 scores, booking.topics.
3. **Subprocessors:** Anthropic (Claude Sonnet/Opus/Haiku jako zewnętrzne modele językowe — osobny workspace, osobna DPA), (opcjonalnie Phase 3) Voyage (embeddingi).
4. **Infrastructure:** Supabase EU (processing-service DB), Fly.io/Railway EU (runtime), Upstash EU (Redis shared), Doppler (secrets). Wszystkie EU-resident.
5. **Retention:** Dossier 90d, Mapa 365d, processing_steps.output 30d→hash, debug_view failed 14d→hash, encrypted audit bucket 2 lata.
6. **Data subjects' rights:** purge webhook pipeline dla art. 17 (prawo do bycia zapomnianym); export dla art. 20 (portability) — staff operator-mediated.
7. **Cross-border transfers:** brak (wszystko EU-resident).
8. **Risk assessment:** shared Upstash jako single point of failure + engineer debug view z raw PII + compound error `session_client_insights` → Mapa (§17 risk #1).
9. **DPO sign-off:** wymagany przed legal green.
