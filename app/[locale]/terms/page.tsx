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
      <p className="text-htg-fg-muted text-sm mb-8">Wersja 3.0 · obowiązuje od 1 kwietnia 2025&nbsp;r.</p>

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
            ['sila-wyzsza', '11. Sytuacje nieprzewidziane'],
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
            <li><strong>Zespół HTG</strong> — osoby prowadzące sesje w ramach inicjatywy Hacking&nbsp;The&nbsp;Game. Kontaktują się z Tobą z adresów e-mail w domenie @htg.cyou.</li>
            <li><strong>Sesja HTG</strong> — jednorazowe, około 90-minutowe spotkanie online o charakterze rozwoju osobistego, prowadzone z wykorzystaniem autorskiej metodyki HTG.</li>
            <li><strong>Uczestnik</strong> — osoba fizyczna (pełnoletnia), która zawiera z nami umowę na Sesję HTG. Osoby w wieku 16–17 lat mogą uczestniczyć wyłącznie po dostarczeniu pisemnego oświadczenia rodzica lub opiekuna prawnego na adres htg@htg.cyou przed rozpoczęciem sesji. Oświadczenie musi zawierać zgodę na udział oraz potwierdzenie, że opiekun rozumie niekonwencjonalny charakter pracy HTG i bierze odpowiedzialność za proces rozwojowy podopiecznego. Operator zastrzega sobie prawo do indywidualnej oceny możliwości realizacji sesji z osobą niepełnoletnią, z uwzględnieniem charakteru tematu i dobra uczestnika. Sesja osoby niepełnoletniej odbywa się bez obecności opiekuna, chyba że strony ustalą inaczej.</li>
            <li><strong>Operator</strong> — podmiot administrujący Pilot PSA z siedzibą w Warszawie, ul.&nbsp;RONDO ONZ&nbsp;1, 00-124 Warszawa, NIP&nbsp;5253085101, REGON&nbsp;544401249.</li>
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
            <strong>Twój czas.</strong> Czas sesji jest zarezerwowany specjalnie dla Ciebie.
            Jeśli spóźnisz się więcej niż 15&nbsp;minut, spotkanie wciąż się odbędzie,
            ale potrwa odpowiednio krócej (opłata pozostaje bez zmian), aby nie zakłócać
            sesji kolejnych osób. Zachęcamy, aby przygotować sprzęt kilka minut wcześniej.
          </Info>
          <P>
            Awarie sprzętu lub problemy z internetem po Twojej stronie nie przedłużają czasu
            trwania sesji i nie stanowią podstawy do zwrotu kosztów. Jeśli jednak problemy
            techniczne wystąpią po stronie Zespołu HTG — oczywiście zadbamy o to, by zrekompensować
            Ci ten czas lub ustalimy nowy termin.
          </P>
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
            <li>Zaproponujemy pierwszy wolny termin. Z uwagi na ograniczoną dostępność prowadzących i harmonogram sesji, czas oczekiwania na nowy termin może być wydłużony (nawet do kilku miesięcy).</li>
          </UL>

          <h3 className="text-lg font-serif font-medium text-htg-fg mt-6 mb-3">Nieobecność i późne odwołanie</h3>
          <P>
            Szanujemy czas naszych prowadzących oraz innych osób oczekujących na wolne terminy.
            Jeśli nie pojawisz się na sesji lub zgłosisz chęć zmiany terminu na mniej niż 7 dni
            przed spotkaniem, sesja przepada, a wniesiona opłata nie podlega zwrotowi. Zastrzegamy
            jednak, że w wyjątkowych, udokumentowanych sytuacjach losowych zawsze staramy się
            znaleźć wspólnie ludzkie rozwiązanie.
          </P>

          <h3 className="text-lg font-serif font-medium text-htg-fg mt-6 mb-3">Z naszej inicjatywy</h3>
          <P>
            Zdarzają się sytuacje losowe, na które nie mamy wpływu. Jeśli z ważnych przyczyn
            będziemy zmuszeni przesunąć Twoją sesję, natychmiast się z Tobą skontaktujemy,
            oferując nowy, priorytetowy termin. Gdy ten termin Ci nie odpowiada,
            <strong> wybór należy do Ciebie</strong>:
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
              <strong>Sesje HTG mają charakter wyłącznie inspiracyjny i rozwojowy.</strong> Metodyka HTG
              opiera się na niekonwencjonalnych metodach pracy z intuicją i postrzeganiem pozazmysłowym.
              Ponieważ metody te wykraczają poza standardowe ramy naukowe, sesję należy traktować jako
              formę niemierzalnej inspiracji, a nie twardą wytyczną. Biorąc udział w sesji,
              akceptujesz jej subiektywny i eksperymentalny charakter.
            </p>
            <p className="mb-3">
              Nasze spotkania <strong>nie są formą diagnozy, terapii psychologicznej,
              psychoterapii, porady medycznej, prawnej ani finansowej</strong>. Jeśli zmagasz się
              z problemami zdrowotnymi, psychicznymi lub potrzebujesz profesjonalnej pomocy —
              zachęcamy do kontaktu z odpowiednim specjalistą.
            </p>
            <p className="mb-3">
              <strong>Sesja HTG nie jest interwencją kryzysową.</strong> Jeśli jesteś w kryzysie
              psychicznym lub zagrożeniu życia, prosimy o kontakt z Telefonem Zaufania (116&nbsp;123)
              lub Centrum Wsparcia (800&nbsp;70&nbsp;2222). Sesja HTG nie jest odpowiednim pierwszym
              krokiem w takiej sytuacji.
            </p>
            <p>
              Zespół HTG dzieli się swoimi wglądami, jednak to Ty jesteś kreatorem swojego życia.
              Zachęcamy do samodzielnego podejmowania decyzji i korzystania z konsultacji specjalistycznych
              przed podjęciem istotnych zmian zdrowotnych, zawodowych lub finansowych.
            </p>
          </Info>

          <P>
            Sesja zakłada gotowość do udziału w rozmowie o charakterze rozwojowym. Jeśli jesteś
            w ostrym kryzysie psychicznym, ta forma wsparcia może nie być dla Ciebie odpowiednia
            na ten moment. Akceptując ten regulamin, potwierdzasz, że rozumiesz charakter Sesji HTG
            i że nie zastępuje ona leczenia medycznego ani terapii.
          </P>

          <P>
            Sesje HTG mają charakter rozwojowy i subiektywny, dlatego Operator nie składa obietnic
            ani gwarancji osiągnięcia określonych rezultatów życiowych, zdrowotnych czy finansowych.
            Wkładamy w nasze spotkania całą wiedzę i doświadczenie — pamiętaj jednak, że ze względów
            prawnych nasza odpowiedzialność finansowa związana z realizacją sesji jest ograniczona
            do kwoty, jaką za nią zapłaciłeś/aś (z wyłączeniem szkód wyrządzonych umyślnie
            lub wskutek rażącego niedbalstwa, zgodnie z bezwzględnie obowiązującymi przepisami prawa).
          </P>

          <h3 className="text-lg font-serif font-medium text-htg-fg mt-6 mb-3">Bezpieczeństwo przestrzeni</h3>
          <P>
            Dbając o jakość przestrzeni i wzajemne bezpieczeństwo, Prowadzący ma prawo przerwać
            lub odmówić kontynuowania sesji, jeśli Uczestnik zachowuje się w sposób agresywny,
            naruszający granice osobiste lub znajduje się pod widocznym wpływem substancji
            psychoaktywnych. W takich rażących przypadkach opłata za sesję nie podlega zwrotowi.
          </P>
        </Section>

        {/* ── 6. Nagrania i poufność ── */}
        <Section id="nagrania" title="6. Nagrania i poufność">
          <P>
            Każda Sesja HTG jest nagrywana w formie audio i wideo. Nagrywanie stanowi integralną
            część usługi — służy zarówno Twojemu prywatnemu użytkowi (nagranie udostępniamy
            w panelu klienta), jak i rozwojowi inicjatywy HTG (montaż, publikacja, materiały
            edukacyjne).
          </P>
          <Info>
            <strong>Przy rezerwacji sesji poprosimy Cię o potwierdzenie osobnym checkboxem:</strong> „Rozumiem,
            że sesja jest nagrywana i może zostać opublikowana po montażu. Mogę wskazać fragmenty
            do usunięcia w ciągu 7 dni od udostępnienia nagrania." Ta zgoda jest warunkiem realizacji
            usługi — bez niej nie możemy przeprowadzić sesji.
          </Info>

          <h3 className="text-lg font-serif font-medium text-htg-fg mt-6 mb-3">Twoje nagranie</h3>
          <UL>
            <li>Nagranie udostępnimy Ci w panelu klienta w ciągu 7&nbsp;dni od sesji.</li>
            <li>Nagranie służy Twojemu <strong>prywatnemu użytkowi</strong> — możesz do niego swobodnie wracać.</li>
            <li>Wszystkie prawa autorskie i majątkowe do nagrania przysługują Operatorowi.
              Publikowanie, udostępnianie lub rozpowszechnianie nagrania (w całości lub we fragmentach)
              przez Uczestnika jest <strong>niedozwolone</strong> — nagranie służy wyłącznie Twojemu
              prywatnemu użytkowi.</li>
          </UL>

          <h3 className="text-lg font-serif font-medium text-htg-fg mt-6 mb-3">Zakaz samodzielnego nagrywania</h3>
          <P>
            Aby każdy mógł czuć się swobodnie — zarówno Ty, jak i Prowadzący — obowiązuje
            całkowity zakaz samodzielnego nagrywania sesji (audio, wideo, screen recording)
            przez Uczestnika. Oficjalne i jedyne nagranie realizuje Zespół HTG i to ono
            zostaje Ci udostępnione na zasadach poufności.
          </P>
          <P>
            Aby chronić przestrzeń zaufania, prywatność Prowadzącego oraz autorską metodykę HTG,
            złamanie tego zakazu (np. potajemne nagrywanie) oznacza natychmiastowe przerwanie sesji
            bez możliwości zwrotu opłaty. Zastrzegamy sobie również prawo do podjęcia kroków
            prawnych w przypadku naruszenia naszych dóbr osobistych i praw autorskich.
          </P>

          <h3 className="text-lg font-serif font-medium text-htg-fg mt-6 mb-3">Nasza odpowiedzialność za poufność</h3>
          <P>
            Zespół HTG traktuje treść każdej sesji jako poufną. Informacje, które nam powierzasz,
            nie będą udostępniane osobom trzecim — z wyjątkiem sytuacji wynikających z prawa
            lub publikacji sesji na warunkach opisanych w pkt&nbsp;8.
          </P>

          <h3 className="text-lg font-serif font-medium text-htg-fg mt-6 mb-3">Wskazanie fragmentów do usunięcia</h3>
          <P>
            Przed publikacją Twojej sesji masz prawo wskazać fragmenty, które chcesz usunąć
            z materiału przeznaczonego do emisji. Zgłoś to do <strong>7 dni od udostępnienia
            nagrania</strong> w panelu klienta lub pisząc na <a href="mailto:htg@htg.cyou" className="text-htg-sage hover:underline">htg@htg.cyou</a>.
            Dołożymy starań, by uwzględnić Twoje wskazania przy montażu, o ile nie uniemożliwia
            to zachowania spójności materiału. Po upływie tego terminu uznajemy, że nie masz
            zastrzeżeń do publikacji nagrania.
          </P>

          <h3 className="text-lg font-serif font-medium text-htg-fg mt-6 mb-3">Przechowywanie i usuwanie nagrań</h3>
          <UL>
            <li>Nagrania sesji przechowujemy <strong>maksymalnie 24 miesiące</strong> od daty sesji.</li>
            <li>30 dni przed planowanym usunięciem nagrania otrzymasz powiadomienie e-mailem.</li>
            <li>Możesz poprosić o wcześniejsze usunięcie nagrania, pisząc na <a href="mailto:htg@htg.cyou" className="text-htg-sage hover:underline">htg@htg.cyou</a>. Co do zasady uwzględniamy taką prośbę w ciągu 30 dni, chyba że nagranie jest niezbędne do obrony roszczeń lub wymagane przepisami prawa.</li>
            <li>W przypadku usunięcia konta nagrania są kasowane, z wyjątkiem danych niezbędnych do celów księgowych (przechowywanych do 5 lat od końca roku podatkowego) lub ochrony roszczeń (do czasu ich przedawnienia).</li>
            <li>Korespondencja związana z realizacją sesji jest przechowywana przez okres obowiązywania umowy i przedawnienia roszczeń.</li>
          </UL>
        </Section>

        {/* ── 7. Prawa autorskie ── */}
        <Section id="prawa-autorskie" title="7. Prawa autorskie">
          <P>
            Operator jest wyłącznym właścicielem autorskich praw majątkowych do formatu sesji,
            metodyki HTG oraz nagrań sesji. Uczestnikowi przysługuje wyłącznie prawo do prywatnego
            odtwarzania nagrania własnej sesji w panelu klienta. Uczestnik nie nabywa żadnych praw
            do nagrania poza prawem do prywatnego użytku.
          </P>
          <P>Operator może wykorzystywać nagrania sesji na następujących polach eksploatacji:</P>
          <UL>
            <li>Publikacja w internecie, w tym na stronach www, w mediach społecznościowych i na platformach wideo (YouTube, Vimeo itp.).</li>
            <li>Wykorzystanie w materiałach edukacyjnych, szkoleniowych i informacyjnych.</li>
            <li>Tworzenie kompilacji, montaży i materiałów promocyjnych.</li>
          </UL>

          <h3 className="text-lg font-serif font-medium text-htg-fg mt-6 mb-3">Ochrona metodyki HTG</h3>
          <P>
            Udział w Sesji HTG nie nadaje Uczestnikowi żadnych uprawnień do nauczania,
            certyfikowania ani komercyjnego wykorzystywania autorskiej metodyki HTG
            w pracy z innymi ludźmi.
          </P>
        </Section>

        {/* ── 8. Publikacja sesji ── */}
        <Section id="publikacja" title="8. Publikacja sesji">
          <P>
            Rezerwując sesję, wyrażasz zgodę (osobnym checkboxem) na to, że Operator może opublikować
            nagranie Twojej sesji — w całości lub we fragmentach, po montażu — na YouTube,
            htgcyou.com oraz w innych kanałach HTG. Publikacja sesji pomaga obniżać koszty
            organizacji i inspirować inne osoby na ich drodze rozwoju.
          </P>

          <h3 className="text-lg font-serif font-medium text-htg-fg mt-6 mb-3">Twoje prawa przed publikacją</h3>
          <P>
            Przed publikacją masz prawo wskazać fragmenty, które chcesz usunąć z materiału
            przeznaczonego do emisji. Zgłoś to do <strong>7 dni od udostępnienia nagrania</strong> w panelu
            klienta lub pisząc na <a href="mailto:htg@htg.cyou" className="text-htg-sage hover:underline">htg@htg.cyou</a>.
            Dołożymy starań, by uwzględnić Twoje wskazania przy montażu, o ile nie uniemożliwia
            to zachowania spójności materiału.
          </P>
          <P>
            Przed publikacją sesja przechodzi montaż, w którym dbamy o kontekst wypowiedzi
            i usuwamy treści mogące naruszyć Twoją godność lub prywatność.
          </P>

          <h3 className="text-lg font-serif font-medium text-htg-fg mt-6 mb-3">Po publikacji</h3>
          <P>
            Po opublikowaniu materiału możesz poprosić o jego wycofanie, pisząc
            na <a href="mailto:htg@htg.cyou" className="text-htg-sage hover:underline">htg@htg.cyou</a>.
            Materiały pozostające pod kontrolą Operatora wycofamy w rozsądnym terminie
            techniczno-organizacyjnym. Wycofanie nie wpływa na legalność publikacji dokonanej
            przed zgłoszeniem. Operator nie odpowiada za kopie rozpowszechnione przez podmioty
            trzecie (np. re-uploady).
          </P>
        </Section>

        {/* ── 9. Prywatność ── */}
        <Section id="prywatnosc" title="9. Prywatność i dane osobowe">
          <P>
            Chronimy Twoje dane zgodnie z RODO. Szczegóły — jakie dane zbieramy, w jakim celu,
            jak długo je przechowujemy i jakie masz prawa — znajdziesz
            w <a href="/pl/privacy" className="text-htg-sage hover:underline">Polityce Prywatności</a>.
          </P>

          <h3 className="text-lg font-serif font-medium text-htg-fg mt-6 mb-3">Warstwy zgód</h3>
          <P>W HTG rozdzielamy różne podstawy przetwarzania danych:</P>
          <UL>
            <li><strong>Założenie konta i realizacja umowy</strong> — dane zwykłe (imię, e-mail, dane rozliczeniowe) przetwarzane na podstawie umowy (art.&nbsp;6 ust.&nbsp;1 lit.&nbsp;b RODO).</li>
            <li><strong>Dane szczególnie wrażliwe ujawniane w trakcie sesji</strong> (zdrowie, przekonania, życie osobiste) — przetwarzane wyłącznie na podstawie Twojej wyraźnej, świadomej zgody związanej z udziałem w sesji (art.&nbsp;9 ust.&nbsp;2 lit.&nbsp;a RODO). Tę zgodę wyrażasz odrębnie przed pierwszą sesją.</li>
            <li><strong>Nagranie i publikacja sesji</strong> (wizerunek, głos) — na podstawie wyraźnej zgody wyrażonej przy rezerwacji sesji (osobny checkbox). Zgoda obejmuje nagrywanie oraz możliwość publikacji po montażu.</li>
          </UL>
          <P>Każdą z powyższych zgód możesz wycofać niezależnie, w dowolnym momencie, w panelu klienta lub pisząc na <a href="mailto:htg@htg.cyou" className="text-htg-sage hover:underline">htg@htg.cyou</a>.</P>

          <h3 className="text-lg font-serif font-medium text-htg-fg mt-6 mb-3">Co oznacza wycofanie zgody?</h3>
          <UL>
            <li>Wycofanie zgody nie wpływa na zgodność z prawem przetwarzania dokonanego przed jej wycofaniem.</li>
            <li>Wycofanie zgody na przetwarzanie danych wrażliwych może uniemożliwić realizację kolejnych sesji — ponieważ ich charakter wymaga otwartości na tematy osobiste.</li>
            <li>Część danych może być nadal przechowywana, jeśli wymagają tego przepisy prawa (np. dane księgowe) lub obrona roszczeń.</li>
          </UL>
        </Section>

        {/* ── 10. Reklamacje ── */}
        <Section id="reklamacje" title="10. Reklamacje">
          <UL>
            <li>Reklamacje prosimy zgłaszać na adres <a href="mailto:htg@htg.cyou" className="text-htg-sage hover:underline">htg@htg.cyou</a>. Każdą sprawę rozpatrzymy w ciągu <strong>14 dni</strong> od jej otrzymania i poinformujemy Cię o wyniku e-mailem.</li>
            <li>Jeśli nie jesteś zadowolony/a z rozstrzygnięcia, możesz skorzystać z <strong>platformy ODR</strong> (<a href="https://ec.europa.eu/odr" className="text-htg-sage hover:underline" target="_blank" rel="noopener noreferrer">ec.europa.eu/odr</a>) lub zwrócić się do właściwego <strong>rzecznika konsumentów</strong>.</li>
          </UL>
        </Section>

        {/* ── 11. Siła wyższa ── */}
        <Section id="sila-wyzsza" title="11. Sytuacje nieprzewidziane (siła wyższa)">
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
            <li>Zmiany nie dotyczą sesji już opłaconych — dla nich obowiązuje regulamin z dnia zawarcia umowy, chyba że zmiana jest wyłącznie korzystna dla Uczestnika lub wynika bezpośrednio z obowiązujących przepisów prawa.</li>
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
                <li>Przetwarzanie danych wrażliwych ujawnianych w trakcie sesji (przekonania, zdrowie, życie osobiste) — wyłącznie za Twoją wyraźną, kontekstową zgodą (art.&nbsp;9 ust.&nbsp;2 lit.&nbsp;a RODO).</li>
                <li>Nagrywanie i publikacja sesji (wizerunek, głos) — na podstawie wyraźnej zgody wyrażonej przy rezerwacji sesji.</li>
                <li>Obowiązki księgowe (art.&nbsp;6 ust.&nbsp;1 lit.&nbsp;c RODO).</li>
                <li>Informowanie i marketing — wyłącznie za zgodą (art.&nbsp;6 ust.&nbsp;1 lit.&nbsp;a RODO).</li>
              </UL>
            </div>
            <div>
              <p className="font-semibold mb-2">Odbiorcy danych</p>
              <P>Dostawcy IT i płatności: Vercel (hosting), Supabase (baza danych), Stripe (płatności), Cloudflare (CDN), Bunny.net (nagrania), Resend (e-mail). Kancelarie prawne i podmioty świadczące obsługę księgową.</P>
            </div>
            <div>
              <p className="font-semibold mb-2">Przekazywanie danych poza EOG</p>
              <P>Niektórzy z naszych dostawców (Vercel, Cloudflare, Stripe) mogą przetwarzać dane poza Europejskim Obszarem Gospodarczym, na podstawie standardowych klauzul umownych lub decyzji Komisji Europejskiej o adekwatności ochrony.</P>
            </div>
            <div>
              <p className="font-semibold mb-2">Okres przechowywania</p>
              <UL>
                <li>Dane rozliczeniowe — do 5 lat od zakończenia roku podatkowego.</li>
                <li>Nagrania sesji — maksymalnie 24 miesiące od sesji (30 dni przed usunięciem otrzymasz powiadomienie).</li>
                <li>Dane konta — do momentu usunięcia konta (z zastrzeżeniem danych wymaganych przepisami prawa).</li>
                <li>Dane marketingowe — do cofnięcia zgody.</li>
                <li>Korespondencja — przez okres obowiązywania umowy i przedawnienia roszczeń.</li>
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
          <p className="text-sm text-htg-fg-muted mb-1">Kontakt w sprawie regulaminu i danych osobowych:</p>
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
