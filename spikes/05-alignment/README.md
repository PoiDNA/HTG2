# SPIKE-05 — Alignment Quality POC

**Pytanie:** czy automatyczne dopasowanie długiego nagrania tłumacza do zatwierdzonych segmentów tekstu (`session_speaker_segments.text_i18n[locale]`) jest wystarczająco dobre, żeby admin review nie stał się wąskim gardłem?

**Nie-cel:** produkcyjny kod. Spike jest throwaway. Wynikiem jest **decyzja + progi** do PR 6 (Alignment engine) i PR 7 (Review UI) planu Studio Tłumaczeń.

---

## Scope w jednym zdaniu

Nagrać 5 kontrolowanych wariantów tłumaczenia EN tej samej sesji PL (20 min), zbudować ręczny ground truth, przepuścić przez 5 kandydatów algorytmów, zmierzyć zestaw metryk (w tym biznesową `admin_minutes_per_audio_hour`), wybrać zwycięzcę, zdefiniować progi `auto`/`needs_review`/`missing`.

---

## Struktura katalogu

```
spikes/05-alignment/
├── README.md              ← ten plik
├── decision.md            ← finalna decyzja (wypełniamy na końcu)
├── fixtures/
│   ├── session-ground-truth.json   ← 80–150 segmentów PL + approved EN text_i18n
│   ├── recordings/                 ← audio (gitignored, patrz .gitignore)
│   │   ├── 01-clean.wav
│   │   ├── 02-pauses.wav
│   │   ├── 03-mistakes.wav
│   │   ├── 04-skips.wav
│   │   ├── 05-reorder-improv.wav
│   │   └── 01-clean-enhanced.wav   ← ten sam materiał po denoise/master
│   └── labels/
│       ├── TEMPLATE.labels.json    ← wzór ręcznego labelingu
│       └── {recording}.labels.json ← ground truth per nagranie
├── runners/
│   ├── a-whisperx-stt-mapping.py   ← WhisperX STT word timestamps + mapping
│   ├── b-whisper-fuzzy.py          ← Whisper STT + Needleman-Wunsch
│   ├── c-whisper-embed.ts          ← Whisper STT + embeddingi zdań
│   ├── d-mfa.py                    ← Montreal Forced Aligner (opcjonalny)
│   └── e-direct-forced-align.py    ← Forced alignment na concatenated approved EN text
└── metrics/
    ├── compare.py                  ← zbiera wyniki, generuje tabelę
    └── results.md                  ← porównanie
```

---

## Korekty v2 względem pierwotnego szkicu

| # | Korekta | Źródło |
|---|---|---|
| 1 | Runner A nazwany precyzyjnie — WhisperX to STT + alignment do własnego transkryptu, nie do naszego tekstu | feedback nr 1 |
| 2 | Dodany Runner E — direct forced alignment do *zatwierdzonego* tekstu (pomija STT errors) | feedback nr 2 |
| 3 | `decision.md` zawiera twardy gate: przed rolloutem DE/PT powtórzyć `01-clean`, `03-mistakes`, `04-skips` per język | feedback nr 3 |
| 4 | Reorder tolerowany w oknie ±2–3 segmentów; większe skoki → `needs_review` | feedback nr 4 |
| 5 | Dodana metryka biznesowa `admin_minutes_per_audio_hour` | feedback nr 5 |
| 6 | Estymacja 3–5 dni (nie 3), uwzględnia setup WhisperX/PyTorch/MFA | feedback nr 6 |
| 7 | Dodany enhanced wariant `01-clean-enhanced.wav` — alignment po denoise może wyglądać inaczej | feedback nr 7 |
| 8 | Labels zawierają `attempt_index` dla powtórek w scenariuszu mistakes | feedback nr 8 |

---

## Kandydaci algorytmów

### Runner A — WhisperX STT word timestamps + mapping to approved segments
Whisper robi STT, WhisperX dokłada word-level alignment do własnego transkryptu (wav2vec2). Następnie nasz kod mapuje te słowa do segmentów z `session-ground-truth.json` (Needleman-Wunsch po tokenach).

**To nie jest pełny forced alignment do naszego zatwierdzonego tekstu** — transkrypt Whisperu może zawierać błędy, które mapper musi obejść.

### Runner B — Whisper STT + Needleman-Wunsch na tokenach
Baseline bez WhisperX. Whisper segment-level → N-W mapping. Pozwala zmierzyć ile wnosi word-level alignment z runnera A.

### Runner C — Whisper STT + embeddingi zdań
Dla zdań gdzie tłumacz improwizuje lub odbiega, embeddingi (`paraphrase-multilingual-MiniLM-L12-v2`) mogą wyłapać semantyczne dopasowanie niedostępne dla N-W. Fallback / uzupełnienie dla A i B.

### Runner D — Montreal Forced Aligner *(opcjonalny)*
Klasyczny forced aligner (Kaldi-based). Dobre modele dla EN, słabsze dla DE/PT. Wysokie koszty setupu — jeśli nie zadziała w pierwsze pół dnia, pomijamy.

### Runner E — Direct forced alignment to approved text *(priorytet)*
Kluczowy eksperyment: **pomijamy STT i mapping**. Wejście = concatenated approved EN text + audio. Używamy aligner WhisperX-compatible (albo MFA) do wymuszenia alignmentu tekstu na audio.

Jeśli działa dobrze, to najlepszy kandydat produkcyjny — eliminuje warstwę błędów STT. Jeśli działa słabo (bo tłumacz odbiega od tekstu), fallback do A/B/C.

---

## Fixtures — 5 scenariuszy + 1 enhanced

| # | Plik | Scenariusz | Co testuje |
|---|---|---|---|
| 01 | `01-clean.wav` | Tłumacz czyta grzecznie | Baseline |
| 02 | `02-pauses.wav` | 5–15s pauz, oddechy | Odporność na ciszę |
| 03 | `03-mistakes.wav` | 3–4 powtórki, "let me repeat", kaszel | Wybór finalnej próby |
| 04 | `04-skips.wav` | 2 pominięte segmenty | Detekcja missing |
| 05 | `05-reorder-improv.wav` | Swap 2 zdań, 1 improwizacja | Tolerancja kolejności, flaga `needs_review` |
| 06 | `01-clean-enhanced.wav` | Scenariusz 01 po denoise/master | Czy enhancement zmienia jakość alignment |

Ostatni wariant (06) jest ważny operacyjnie: produkcyjny pipeline robi enhancement **przed** transcribe. Spike musi potwierdzić, że to nie pogarsza alignmentu (artefakty denoise) i nie daje fałszywego optymizmu bazując tylko na raw.

**Tło nagrania:** headset, pokój domowy, bez profesjonalnej akustyki. Nagrywamy worst-case dla alignment — nie dla jakości dźwięku.

**Osoba nagrywająca:** ktoś kto **realnie przypomina docelową tłumaczkę** pod względem akcentu i tempa. Czyta naturalnie, ale **nie perfekcyjnie**. Przyspieszenia/zwolnienia tempa mile widziane.

---

## Ground truth labeling

Narzędzie: Audacity (labels track export → CSV → JSON) albo prosty HTML player z znacznikami.

Template: [`fixtures/labels/TEMPLATE.labels.json`](fixtures/labels/TEMPLATE.labels.json)

Każdy rekord zawiera:
- `segment_id` — referencja do `session-ground-truth.json`
- `take_start_sec`, `take_end_sec` — granice w nagraniu tłumacza
- `attempt_index` — która próba jest *wybrana* (0 = pierwsza; dla mistakes często = 1 lub 2)
- `status` — `ok` | `skipped` | `improvised` | `out_of_order`
- `note` — notatka dla spike-running

Koszt: ~30 min / nagranie × 6 = 3h pracy. Artefakt zostaje jako zbiór regresyjny na przyszłość.

---

## Metryki (per scenariusz, nie uśrednione)

| Metryka | Definicja | Próg akceptacji (clean / dirty) |
|---|---|---|
| `start_error_ms` | \|predicted_start − gt_start\| | median ≤ 150 / 250 ms, p95 ≤ 600 / 1000 ms |
| `end_error_ms` | \|predicted_end − gt_end\| | median ≤ 300 / 500 ms, p95 ≤ 1000 / 1500 ms |
| `overlap_iou` | IoU predicted vs gt | median ≥ 0.85 / 0.70 |
| `% auto` | confidence ≥ próg | ≥ 80% clean, ≥ 60% dirty |
| `% needs_review` | confidence w środku | ≤ 20% clean, ≤ 35% dirty |
| `% missing` recall | wykryte skipy / wszystkie skipy | ≥ 0.90 dla scen. 04 |
| `% false_positive` | błędne matche | ≤ 5% |
| `reorder_correctness` | czy swap w oknie ±3 jest obsłużony | 100% dla lokalnych swapów |
| `latency_s_per_min_audio` | czas przetwarzania | ≤ 60 s / min audio |
| `cost_usd_per_min` | per minuta audio | ≤ $0.01 (tania) / $0.05 (premium) |
| **`admin_minutes_per_audio_hour`** | **metryka biznesowa** | **≤ 10 min / h audio** |

**Dlaczego `admin_minutes_per_audio_hour` dominuje:** 70% auto z łatwym review jest lepsze niż 90% auto z uciążliwą edycją zakresów. Mierzymy przez stopwatch podczas symulowanego review na wynikach algorytmu.

---

## Próg reorder — dlaczego ±2–3 segmenty

Pełna niezależność od `ordinal` generuje false positives (algorytm dopasowuje podobne zdania w odległych miejscach sesji). Lokalne swapy (np. tłumacz odwrócił kolejność 2 sąsiednich zdań) są realistyczne i powinny być tolerowane.

**Reguła:** matching w oknie `±reorder_window_segments` (domyślnie 3) akceptowany. Skok poza okno = `needs_review` z flagą `possible_reorder`.

---

## Scenariusze brudne — wymagania minimalne

| # | Scenariusz | Minimum pass |
|---|---|---|
| 01 | clean | 80%+ auto, median start_error ≤ 150ms |
| 02 | pauses | 85%+ auto, 0 false_positive z ciszy |
| 03 | mistakes | Wybrana próba z `attempt_index = last` dla ≥ 90% powtórek |
| 04 | skips | Missing recall ≥ 0.90 |
| 05 | reorder-improv | Lokalny swap: 100% poprawnie; improv: flaga `needs_review` |
| 06 | clean-enhanced | Wyniki nie gorsze niż 01 o więcej niż 10% absolute |

Jeśli żaden algorytm nie przechodzi scen. 04 (missing) — trzeba rozważyć zmianę UX: **checkboxy "pominąłem segment X" po stronie tłumacza**, żeby zmniejszyć oczekiwania wobec alignmentu.

---

## Decision framework

Wynik SPIKE-05 to `decision.md` — struktura:

```markdown
# Decyzja SPIKE-05

## Wybrany algorytm
{A | B | C | D | E | kombinacja}

## Progi
- confidence ≥ X → status 'auto'
- confidence Y–X → status 'needs_review'
- confidence < Y → status 'missing'
- reorder_window_segments = 3

## admin_minutes_per_audio_hour
- Scenariusz clean: {N} min
- Scenariusz dirty (średnia 02-05): {M} min

## Implikacje dla PR 6 (Alignment engine)
- Runtime: {Python worker GPU | Node | API}
- Koszt produkcyjny per godzinę audio: ${Z}
- Latencja: {L} × real-time

## Implikacje dla PR 7 (Review UI)
- Sortowanie po confidence rosnąco
- Inline edit range (drag handles) — wymagane
- Bulk accept — wymagane
- "Nagraj poprawkę" → krótki take + re-align tylko zakresu

## HARD GATE: DE/PT rollout
Przed włączeniem DE lub PT:
1. Nagrać scenariusze 01-clean, 03-mistakes, 04-skips w tym języku
2. Powtórzyć runner {wybrany} na tych fixtures
3. Potwierdzić: start_error median ≤ 250ms, missing recall ≥ 0.80
4. Jeśli nie przechodzi — osobny SPIKE-05-{locale}
```

---

## Koszt / czas

| Etap | Czas | Koszt $ |
|---|---|---|
| Setup środowiska (WhisperX, PyTorch, MFA) | 0.5–1 dzień | 0 |
| Nagranie 5 scenariuszy + enhanced | 4–5 h | 0 |
| Ground truth labeling (6 × 30 min) | 3 h | 0 |
| Implementacja runnerów A, B, C | 1–1.5 dnia | 0 |
| Runner E (direct forced alignment) | 0.5–1 dzień | 0 |
| Runner D (MFA) — opcjonalny | 0.5 dnia lub skip | 0 |
| Runs + zbieranie metryk + `admin_minutes` stopwatch | 0.5 dnia | ~$5 (Whisper OpenAI baseline) |
| Analiza + `decision.md` | 0.5 dnia | 0 |
| **RAZEM** | **3–5 dni** | **~$5** |

Estymacja obejmuje możliwość że setup WhisperX/MFA zje pół dnia dodatkowo jeśli GPU env nie jest gotowe.

---

## Co NIE jest w scope SPIKE-05

- Produkcyjny pipeline (PR 6)
- UI admina (PR 7)
- DE/PT — tylko EN w tym spike. DE/PT po decyzji, per hard-gate w `decision.md`
- Integracja z Supabase — spike działa na plikach + JSON
- Pełny enhancement pipeline — tylko jeden wariant `01-clean-enhanced` dla porównania

---

## Kolejność wykonania

1. ✅ Utworzenie katalogu + README + skeletons
2. Wyznaczenie osoby nagrywającej EN
3. Dzień 1: fixtures (nagrania + labeling + session-ground-truth.json)
4. Dzień 2–3: runnery A, B, C + runner E
5. Dzień 4: runs + metryki + stopwatch `admin_minutes_per_audio_hour`
6. Dzień 5: `decision.md` + prezentacja wyników

---

## Blocker

Bez osoby nagrywającej fixtures spike nie ma sensu. **Trzeba wskazać kogoś z zespołu mówiącego po angielsku naturalnie.**
