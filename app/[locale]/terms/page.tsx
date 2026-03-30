import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n-config';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Legal' });
  return { title: t('terms_title') };
}

/* ------------------------------------------------------------------ */
/*  Reusable styled components for legal pages                        */
/* ------------------------------------------------------------------ */
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-xl font-serif font-semibold text-htg-fg mt-10 mb-4">{title}</h2>
      {children}
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-htg-fg leading-relaxed mb-3">{children}</p>;
}

function UL({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc pl-6 space-y-2 mb-4 text-htg-fg leading-relaxed">{children}</ul>;
}

function Info({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-htg-surface border border-htg-card-border rounded-lg p-4 my-4 text-sm text-htg-fg leading-relaxed">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl md:text-4xl font-serif font-bold text-htg-fg mb-2">
        Zasady naszej wspólnej przestrzeni
      </h1>
      <p className="text-htg-fg-muted text-sm mb-2">Regulamin Sesji Hacking&nbsp;The&nbsp;Game</p>
      <p className="text-htg-fg-muted text-sm mb-8">Wersja 2.0 · obowiązuje od 1 kwietnia 2025&nbsp;r.</p>

      {/* ── Intro ── */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-5 mb-10 text-sm text-htg-fg leading-relaxed">
        <p className="mb-3">
          Zależy nam, aby każda Sesja HTG odbywała się w atmosferze zaufania i bezpieczeństwa.
          Ten dokument opisuje zasady, które chronią zarówno Ciebie, jak i nas — abyśmy mogli
          w pełni skupić się na tym, co najważniejsze: Twoim rozwoju.
        </p>
        <p>
          Jeśli masz pytania dotyczące regulaminu, napisz do nas: <a href="mailto:htg@htg.cyou" className="text-htg-sage hover:underline">htg@htg.cyou</a>.
        </p>
      </div>

      {/* ── Table of Contents ── */}
      <nav className="bg-htg-card border border-htg-card-border rounded-xl p-5 mb-10">
        <p className="text-sm font-semibold text-htg-fg mb-3">Spis treści</p>
        <ol className="columns-1 md:columns-2 gap-6 text-sm text-htg-fg-muted space-y-1">
          {[
            ['definicje', '1. Kim jesteśmy'],
            ['sesja', '2. Jak działają sesje HTG'],
            ['platnosci', '3. Płatności i zwroty'],
            ['terminy', '4. Zmiany terminów'],
            ['charakter', '5. Charakter sesji'],
            ['nagrania', '6. Nagrania i poufność'],
            ['prawa-autorskie', '7. Prawa autorskie'],
            ['publikacja', '8. Publikacja sesji'],
            ['prywatnosc', '9. Prywatność i dane osobowe'],
            ['reklamacje', '10. Reklamacje'],
            ['sila-wyzsza', '11. Siła wyższa'],
            ['zmiany', '12. Zmiany regulaminu'],
            ['postanowienia', '13. Postanowienia końcowe'],
          ].map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="hover:text-htg-sage transition-colors">{label}</a>
            </li>
          ))}
        </ol>
      </nav>

      {/* ── Content ── */}
      <div className="space-y-2">

        {/* ── 1. Kim jesteśmy ── */}
        <Section id="definicje" title="1. Kim jesteśmy">
          <UL>
            <li><strong>Operator</strong> — Pilot PSA z siedzibą w Warszawie, ul.&nbsp;RONDO ONZ&nbsp;1, 00-124 Warszawa, NIP&nbsp;5253085101, REGON&nbsp;544401249. To my odpowiadamy za organizację Sesji HTG.</li>
            <li><strong>Zespół HTG</strong> — osoby prowadzące sesje w ramach inicjatywy Hacking&nbsp;The&nbsp;Game. Kontaktują się z Tobą z adresów e-mail w domenie @htg.cyou.</li>
            <li><strong>Sesja HTG</strong> — jednorazowe, około 90-minutowe spotkanie online o charakterze rozwoju osobistego, prowadzone z wykorzystaniem autorskiej metodyki HTG.</li>
            <li><strong>Uczestnik</strong> — osoba fizyczna (pełnoletnia), która zawiera z nami umowę na Sesję HTG. Osoby w wieku 16–17 lat mogą uczestniczyć za pisemną zgodą rodzica lub opiekuna prawnego.</li>
            <li><strong>Dzień roboczy</strong> — poniedziałek–piątek z wyłączeniem dni ustawowo wolnych od pracy.</li>
          </UL>
        </Section>

        {/* ── 2. Jak działają sesje HTG ── */}
        <Section id="sesja" title="2. Jak działają sesje HTG">
          <P>Sesja odbywa się online. Aby w pełni z niej skorzystać, prosimy o przygotowanie:</P>
          <UL>
            <li>Stabilnego łącza internetowego.</li>
            <li>Sprawnej kamery i mikrofonu.</li>
            <li>Spokojnego miejsca, w którym możesz swobodnie rozmawiać.</li>
          </UL>
          <Info>
            <strong>Punktualność.</strong> Szanujemy Twój czas i prosimy o wzajemność.
            Jeśli spóźnisz się więcej niż 15&nbsp;minut, sesja odbędzie się w skróconym czasie —
            opłata nie ulega zmianie. Zachęcamy, aby przygotować sprzęt kilka minut wcześniej.
          </Info>
        </Section>

        {/* ── 3. Płatności i zwroty ── */}
        <Section id="platnosci" title="3. Płatności i zwroty">
          <UL>
            <li>Sesja HTG jest opłacana z góry. Umowa zostaje zawarta z momentem zaksięgowania pełnej opłaty.</li>
            <li>Płatność odbywa się przez stronę htgcyou.com (Stripe — karty, BLIK, Przelewy24), przelew bankowy lub gotówkę.</li>
            <li>Brak zapłaty w ciągu 24&nbsp;godzin od złożenia zamówienia anuluje rezerwację.</li>
            <li>Faktury generowane są automatycznie — znajdziesz je w panelu klienta i otrzymasz e-mailem.</li>
          </UL>

          <h3 className="text-lg font-serif font-medium text-htg-fg mt-6 mb-3">Prawo odstąpienia (14 dni)</h3>
          <P>
            Jako konsument masz prawo odstąpić od umowy w ciągu <strong>14 dni</strong> od jej zawarcia,
            bez podania przyczyny. Wystarczy napisać na <a href="mailto:htg@htg.cyou" className="text-htg-sage hover:underline">htg@htg.cyou</a> (wzór
            oświadczenia znajdziesz na końcu tego regulaminu).
          </P>
          <Info>
            <strong>Ważne:</strong> Jeśli Sesja HTG zostanie w pełni zrealizowana przed upływem 14 dni,
            prawo odstąpienia wygasa — pod warunkiem, że wyraziłeś/aś na to wyraźną zgodę przed rozpoczęciem sesji
            i przyjąłeś/aś do wiadomości utratę prawa do odstąpienia. Taki checkbox pojawi się przy rezerwacji.
          </Info>
          <P>Zwrot środków nastąpi w ciągu 14 dni od otrzymania Twojego oświadczenia, tą samą metodą, jaką dokonałeś/aś płatności.</P>
        </Section>

        {/* ── 4. Zmiany terminów ── */}
        <Section id="terminy" title="4. Zmiany terminów">
          <h3 className="text-lg font-serif font-medium text-htg-fg mt-4 mb-3">Z Twojej inicjatywy</h3>
          <UL>
            <li>Termin sesji uzgadniamy po opłaceniu — otrzymasz propozycję e-mailem.</li>
            <li>Możesz jednorazowo zmienić termin <strong>najpóźniej 7 dni</strong> przed planowaną datą.</li>
            <li>Zaproponujemy pierwszy wolny termin. Ze względu na popularność sesji czas oczekiwania może wynosić 6–8 miesięcy.</li>
          </UL>

          <h3 className="text-lg font-serif font-medium text-htg-fg mt-6 mb-3">Z naszej inicjatywy</h3>
          <P>
            Jeśli z ważnych przyczyn będziemy musieli przesunąć sesję, zaproponujemy nowy termin.
            Gdy ten termin Ci nie odpowiada, <strong>wybór należy do Ciebie</strong>:
          </P>
          <UL>
            <li>Przyjęcie innego wolnego terminu.</li>
            <li>Voucher ważny 12&nbsp;miesięcy.</li>
            <li>Pełny zwrot wpłaconej kwoty.</li>
          </UL>
        </Section>

        {/* ── 5. Charakter sesji ── */}
        <Section id="charakter" title="5. Charakter sesji i Twoja odpowiedzialność">
          <Info>
            <p className="mb-3">
              <strong>Sesje HTG mają charakter wyłącznie inspiracyjny i rozwojowy.</strong> Metody,
              z których korzystamy (w tym praca z intuicją i percepcją), są formą eksploracji
              świadomości — ich odbiór jest wysoce subiektywny i indywidualny.
            </p>
            <p className="mb-3">
              Nasze spotkania <strong>nie są formą diagnozy, terapii psychologicznej,
              psychoterapii, porady medycznej, prawnej ani finansowej</strong>. Jeśli zmagasz się
              z problemami zdrowotnymi, psychicznymi lub potrzebujesz profesjonalnej pomocy —
              zachęcamy do kontaktu z odpowiednim specjalistą.
            </p>
            <p className="mb-3">
              <strong>Jeśli jesteś w kryzysie psychicznym lub zagrożeniu życia</strong>, prosimy
              o kontakt z Telefon Zaufania (116 123) lub Centrum Wsparcia (800 70 2222).
              Sesja HTG nie jest odpowiednim pierwszym krokiem w takiej sytuacji.
            </p>
            <p>
              Zespół HTG dzieli się swoimi wglądami, jednak to Ty jesteś kreatorem swojego życia.
              Zachęcamy do samodzielnego podejmowania decyzji i korzystania z konsultacji specjalistycznych
              przed podjęciem istotnych zmian zdrowotnych, zawodowych lub finansowych.
            </p>
          </Info>
          <P>
            Odpowiedzialność Operatora z tytułu Sesji HTG jest ograniczona do kwoty zapłaconej za Sesję.
            Ograniczenie to nie dotyczy szkód wyrządzonych umyślnie lub z rażącego niedbalstwa.
          </P>
          <P>Operator nie gwarantuje osiągnięcia określonych rezultatów — każdy proces rozwoju jest indywidualny.</P>
        </Section>

        {/* ── 6. Nagrania i poufność ── */}
        <Section id="nagrania" title="6. Nagrania i poufność">
          <P>
            Sesja HTG jest nagrywana w formie audio i wideo. <strong>Przed rozpoczęciem sesji poprosimy
            Cię o wyraźną zgodę na nagrywanie.</strong> Jeśli nie wyrażasz zgody — sesja odbędzie się
            bez nagrania.
          </P>

          <h3 className="text-lg font-serif font-medium text-htg-fg mt-6 mb-3">Twoje nagranie</h3>
          <UL>
            <li>Nagranie udostępnimy Ci w panelu klienta w ciągu 7&nbsp;dni od sesji.</li>
            <li>Nagranie służy Twojemu <strong>prywatnemu użytkowi</strong> — możesz do niego swobodnie wracać.</li>
            <li>Prosimy o niepublikowanie nagrania w internecie, mediach społecznościowych ani nieudostępnianie
              go osobom trzecim bez naszej pisemnej zgody. Chroni to zarówno Twoją prywatność,
              jak i prywatność osób prowadzących.</li>
          </UL>

          <h3 className="text-lg font-serif font-medium text-htg-fg mt-6 mb-3">Nasza odpowiedzialność za poufność</h3>
          <P>
            Zespół HTG traktuje treść każdej sesji jako poufną. Informacje, które nam powierzasz,
            nie będą udostępniane osobom trzecim — z wyjątkiem sytuacji wynikających z prawa
            lub publikacji sesji na warunkach opisanych poniżej.
          </P>

          <h3 className="text-lg font-serif font-medium text-htg-fg mt-6 mb-3">Prośba o edycję nagrania</h3>
          <P>
            Jeśli po obejrzeniu nagrania chciałbyś/chciałabyś, aby jakiś fragment został usunięty
            z ewentualnej publikacji — zgłoś to do <strong>7 dni od udostępnienia nagrania</strong> w panelu klienta.
            Dołożymy starań, by uwzględnić Twoją prośbę.
          </P>
        </Section>

        {/* ── 7. Prawa autorskie ── */}
        <Section id="prawa-autorskie" title="7. Prawa autorskie">
          <P>
            Jesteśmy twórcami formatu HTG — autorskie prawa majątkowe do formy sesji i nagrania
            pozostają przy Operatorze. Ty zachowujesz prawo do prywatnego korzystania z nagrania
            na warunkach opisanych powyżej.
          </P>
          <P>
            Pola eksploatacji, na których możemy wykorzystywać nagranie (wyłącznie po uzyskaniu
            Twojej odrębnej zgody na publikację):
          </P>
          <UL>
            <li>Publikacja w internecie, w tym na stronach www i w mediach społecznościowych.</li>
            <li>Wykorzystanie w materiałach edukacyjnych i informacyjnych.</li>
          </UL>
        </Section>

        {/* ── 8. Publikacja sesji ── */}
        <Section id="publikacja" title="8. Publikacja sesji">
          <Info>
            <p className="mb-3">
              <strong>Twoja sesja jest domyślnie prywatna.</strong> Nie publikujemy żadnych materiałów
              z Twojej sesji bez Twojej wyraźnej, odrębnej zgody.
            </p>
            <p>
              Publikacja wybranych sesji (np. na YouTube lub htgcyou.com) pomaga obniżać koszty organizacji
              sesji i inspirować inne osoby. Jeśli chcesz, aby Twoja sesja mogła zostać opublikowana,
              poprosimy Cię o odrębną zgodę — możesz wybrać zakres:
            </p>
          </Info>
          <UL>
            <li><strong>Publikacja pełna</strong> — cała zmontowana sesja.</li>
            <li><strong>Publikacja fragmentu</strong> — wyłącznie wybrane fragmenty.</li>
            <li><strong>Publikacja po anonimizacji</strong> — z ukryciem Twojej tożsamości.</li>
            <li><strong>Brak zgody na publikację</strong> — Twoja sesja pozostaje w pełni prywatna.</li>
          </UL>
          <P>
            Przed publikacją sesja przechodzi montaż, w którym dbamy o kontekst wypowiedzi
            i usuwamy treści mogące naruszyć Twoją godność lub prywatność.
          </P>
          <P>
            Zgodę na publikację możesz wycofać w dowolnym momencie, pisząc
            na <a href="mailto:htg@htg.cyou" className="text-htg-sage hover:underline">htg@htg.cyou</a>.
            Dołożymy starań, aby usunąć opublikowane materiały w rozsądnym terminie.
          </P>
        </Section>

        {/* ── 9. Prywatność ── */}
        <Section id="prywatnosc" title="9. Prywatność i dane osobowe">
          <P>
            Chronimy Twoje dane zgodnie z RODO. Szczegóły — jakie dane zbieramy, w jakim celu,
            jak długo je przechowujemy i jakie masz prawa — znajdziesz
            w <a href="/pl/privacy" className="text-htg-sage hover:underline">Polityce Prywatności</a>.
          </P>
          <Info>
            Podczas Sesji HTG mogą być poruszane tematy dotyczące zdrowia, przekonań czy życia osobistego.
            Przetwarzanie takich danych odbywa się wyłącznie na podstawie Twojej <strong>wyraźnej zgody</strong> (art.&nbsp;9 ust.&nbsp;2 lit.&nbsp;a RODO),
            którą wyrażasz przy rejestracji konta. Możesz ją wycofać w dowolnym momencie w panelu klienta.
          </Info>
        </Section>

        {/* ── 10. Reklamacje ── */}
        <Section id="reklamacje" title="10. Reklamacje">
          <UL>
            <li>Reklamacje prosimy zgłaszać na adres <a href="mailto:htg@htg.cyou" className="text-htg-sage hover:underline">htg@htg.cyou</a> w ciągu 14 dni od zdarzenia.</li>
            <li>Rozpatrzymy reklamację w ciągu 30 dni i poinformujemy Cię o wyniku e-mailem.</li>
            <li>Jeśli nie jesteś zadowolony/a z rozstrzygnięcia, możesz skorzystać z <strong>platformy ODR</strong> (<a href="https://ec.europa.eu/odr" className="text-htg-sage hover:underline" target="_blank" rel="noopener noreferrer">ec.europa.eu/odr</a>) lub zwrócić się do właściwego <strong>rzecznika konsumentów</strong>.</li>
          </UL>
        </Section>

        {/* ── 11. Siła wyższa ── */}
        <Section id="sila-wyzsza" title="11. Siła wyższa">
          <P>
            Żadna ze stron nie odpowiada za niewykonanie zobowiązań spowodowane siłą wyższą —
            czyli zdarzeniami nadzwyczajnymi, nieprzewidywalnymi i niezależnymi od stron
            (np. awarie infrastruktury, klęski żywiołowe, akty władzy publicznej).
          </P>
        </Section>

        {/* ── 12. Zmiany regulaminu ── */}
        <Section id="zmiany" title="12. Zmiany regulaminu">
          <UL>
            <li>Możemy zmienić regulamin z ważnych przyczyn (np. zmiana przepisów prawa, zmiana zakresu usług). Nową wersję opublikujemy na htgcyou.com.</li>
            <li>Zmiany nie dotyczą sesji już opłaconych — dla nich obowiązuje regulamin z dnia zawarcia umowy.</li>
            <li>Jeśli nie akceptujesz nowych warunków, możesz zrezygnować z niewykorzystanych sesji i uzyskać zwrot kosztów.</li>
          </UL>
        </Section>

        {/* ── 13. Postanowienia końcowe ── */}
        <Section id="postanowienia" title="13. Postanowienia końcowe">
          <UL>
            <li>W sprawach nieuregulowanych zastosowanie mają przepisy prawa polskiego.</li>
            <li>Spory rozstrzygane będą przez sąd właściwy zgodnie z przepisami Kodeksu postępowania cywilnego.</li>
            <li>Regulamin wchodzi w życie z dniem opublikowania na htgcyou.com.</li>
            <li>Przetwarzanie płatności obsługuje Pilot PSA.</li>
          </UL>
        </Section>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* ZAŁĄCZNIK A — Wzór odstąpienia                            */}
        {/* ══════════════════════════════════════════════════════════ */}
        <div className="mt-16 border-t-2 border-htg-card-border pt-10">
          <h2 className="text-lg font-serif font-semibold text-htg-fg mb-4">
            Załącznik A – Wzór oświadczenia o odstąpieniu od umowy
          </h2>
          <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 text-sm text-htg-fg font-mono leading-relaxed space-y-2">
            <p><strong>Tytuł maila:</strong> Rezygnacja z sesji</p>
            <p className="mt-3">Ja, [imię i nazwisko], niniejszym informuję o moim odstąpieniu od umowy o pojedynczą Sesję HTG zawartą w dniu opłacenia sesji.</p>
            <p className="mt-2">Data wpłaty: ___/___/20__</p>
            <p>Imię i nazwisko: ___________________</p>
            <p>Adres: _______________________________</p>
            <p>E‑mail: _______________________________</p>
            <p>Podpis (tylko wersja papierowa, skan)</p>
            <p>Data: ___/___/20__</p>
          </div>
          <P>
            Oświadczenie wyślij na adres: <a href="mailto:htg@htg.cyou" className="text-htg-sage hover:underline">htg@htg.cyou</a>.
          </P>
        </div>

        {/* ── Klauzula informacyjna RODO ── */}
        <div className="mt-12 border-t border-htg-card-border pt-8">
          <h2 className="text-lg font-serif font-semibold text-htg-fg mb-4">
            Klauzula informacyjna (art.&nbsp;13 RODO)
          </h2>
          <div className="space-y-4 text-sm text-htg-fg leading-relaxed">
            <P><strong>Administrator danych:</strong> Pilot PSA z siedzibą w Warszawie, ul.&nbsp;RONDO ONZ&nbsp;1, 00-124 Warszawa, NIP&nbsp;5253085101, REGON&nbsp;544401249 (e‑mail: htg@htg.cyou).</P>
            <div>
              <p className="font-semibold mb-2">Cel i podstawa przetwarzania</p>
              <UL>
                <li>Realizacja umowy Sesji HTG (art.&nbsp;6 ust.&nbsp;1 lit.&nbsp;b RODO).</li>
                <li>Przetwarzanie danych wrażliwych (przekonania, zdrowie) — wyłącznie za Twoją wyraźną zgodą (art.&nbsp;9 ust.&nbsp;2 lit.&nbsp;a RODO).</li>
                <li>Nagrywanie sesji — na podstawie Twojej odrębnej zgody przed sesją.</li>
                <li>Obowiązki księgowe (art.&nbsp;6 ust.&nbsp;1 lit.&nbsp;c RODO).</li>
                <li>Informowanie i marketing — wyłącznie za zgodą (art.&nbsp;6 ust.&nbsp;1 lit.&nbsp;a RODO).</li>
              </UL>
            </div>
            <div>
              <p className="font-semibold mb-2">Odbiorcy danych</p>
              <P>Dostawcy IT i płatności: Vercel (hosting), Supabase (baza danych), Stripe (płatności), Cloudflare (CDN), Bunny.net (nagrania), Resend (e-mail).</P>
            </div>
            <div>
              <p className="font-semibold mb-2">Okres przechowywania</p>
              <UL>
                <li>Dane rozliczeniowe — do 5 lat od zakończenia roku podatkowego.</li>
                <li>Nagrania sesji — maksymalnie 24 miesiące od sesji (30 dni przed usunięciem otrzymasz powiadomienie).</li>
                <li>Dane konta — do momentu usunięcia konta.</li>
                <li>Dane marketingowe — do cofnięcia zgody.</li>
              </UL>
            </div>
            <div>
              <p className="font-semibold mb-2">Twoje prawa</p>
              <UL>
                <li>Dostęp, sprostowanie, usunięcie danych.</li>
                <li>Ograniczenie przetwarzania, sprzeciw, przeniesienie danych.</li>
                <li>Wycofanie zgody w dowolnym momencie (w panelu klienta lub e-mailem).</li>
                <li>Skarga do <strong>Prezesa UODO</strong> (Urzędu Ochrony Danych Osobowych).</li>
              </UL>
            </div>
            <P>Podanie danych jest dobrowolne, lecz niezbędne do rezerwacji terminu Sesji HTG. Dane nie będą wykorzystywane do zautomatyzowanego podejmowania decyzji ani profilowania.</P>
          </div>
        </div>

        {/* ── Kontakt ── */}
        <div className="mt-10 bg-htg-surface rounded-xl p-6 text-center">
          <p className="text-sm text-htg-fg-muted mb-1">Kontakt w sprawie regulaminu:</p>
          <p className="font-semibold text-htg-fg">
            <a href="mailto:htg@htg.cyou" className="text-htg-sage hover:underline">htg@htg.cyou</a>
          </p>
          <p className="text-xs text-htg-fg-muted mt-2">Pilot PSA · NIP 525-308-51-01 · REGON 544401249</p>
          <p className="text-xs text-htg-fg-muted">ul. RONDO ONZ 1, 00-124 Warszawa</p>
        </div>
      </div>
    </div>
  );
}
