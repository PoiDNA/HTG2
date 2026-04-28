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

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-serif font-medium text-htg-fg mt-6 mb-3">{children}</h3>;
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
      <p className="text-htg-fg-muted text-sm mb-3">Wersja 4.1 · obowiązuje od 28 kwietnia 2026&nbsp;r.</p>
      <p className="mb-8">
        <a
          href="/regulamin-htg-v4.1.docx"
          download
          className="inline-flex items-center gap-2 text-sm text-htg-sage hover:underline"
        >
          📄 Pobierz Regulamin (.docx)
        </a>
      </p>

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
            ['platnosci', '3. Zakup sesji, płatności i zwroty'],
            ['subskrypcje', '4. Subskrypcje'],
            ['terminy', '5. Zmiany terminów'],
            ['charakter', '6. Charakter sesji i odpowiedzialność'],
            ['nagrania', '7. Nagrania i poufność'],
            ['publikacja', '8. Publikacja sesji'],
            ['prawa-autorskie', '9. Prawa autorskie i metodyka HTG'],
            ['prywatnosc', '10. Prywatność i dane osobowe'],
            ['reklamacje', '11. Reklamacje i ADR'],
            ['sila-wyzsza', '12. Sytuacje nieprzewidziane'],
            ['zmiany', '13. Zmiany regulaminu'],
            ['postanowienia', '14. Postanowienia końcowe'],
            ['zalacznik-a', 'Załącznik A — Wzór odstąpienia'],
            ['zalacznik-b', 'Załącznik B — Klauzula RODO'],
            ['zalacznik-c', 'Załącznik C — Zgoda opiekuna (16–17)'],
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
            <li><strong>Administrator Serwisu</strong> — <a href="https://pilot.place" target="_blank" rel="noopener noreferrer" className="text-htg-sage hover:underline">Pilot PSA</a> z siedzibą w Warszawie, ul.&nbsp;RONDO ONZ&nbsp;1, 00-124 Warszawa, NIP&nbsp;5253085101, REGON&nbsp;544401249, e-mail: htg@htg.cyou. Administrator Serwisu jest stroną umowy z Uczestnikiem.</li>
            <li><strong>Zespół HTG</strong> — osoby prowadzące Sesje HTG i Spotkania w ramach inicjatywy Hacking&nbsp;The&nbsp;Game. Kontaktują się z Tobą z adresów e-mail w domenie @htg.cyou.</li>
            <li><strong>Prowadząca</strong> — Natalia, osoba prowadząca każdą Sesję HTG z wykorzystaniem autorskiej metodyki HTG.</li>
            <li><strong>Operator/ka sesji</strong> — osoba asystująca Prowadzącej podczas Sesji HTG. Uczestnik może wskazać preferowaną Operatorkę przy rezerwacji lub pozostawić wybór Zespołowi HTG.</li>
            <li><strong>Tłumacz/ka</strong> — osoba uczestnicząca w Sesji HTG lub Spotkaniu w roli tłumacza ustnego, tłumacząca przebieg sesji dla Uczestnika na inny język. Tłumacz/ka może być przydzielony/a przez Zespół HTG na życzenie Uczestnika lub gdy językiem sesji nie jest język ojczysty Uczestnika. Tłumacz/ka jest zobowiązany/a do zachowania poufności na zasadach pkt&nbsp;7.4.</li>
            <li><strong>Sesja HTG</strong> — jednorazowa, około 90-minutowa rozmowa online o&nbsp;charakterze rozwoju osobistego, prowadzona przez Prowadzącą samodzielnie lub w&nbsp;asyście Operatora/ki sesji, z&nbsp;wykorzystaniem autorskiej metodyki HTG.</li>
            <li><strong>Spotkanie</strong> — organizowane online wydarzenie grupowe dla kilku lub kilkunastu osób, o&nbsp;charakterze wymiany poglądów i&nbsp;pogłębiania świadomości, prowadzone przez Zespół HTG. Szczegóły w&nbsp;pkt&nbsp;2.</li>
            <li><strong>Uczestnik</strong> — osoba fizyczna, która zawiera z Administratorem Serwisu umowę na Sesję HTG lub Spotkanie. Uczestnikiem może być osoba pełnoletnia, posiadająca pełną zdolność do czynności prawnych, lub osoba w wieku 16–17 lat — wyłącznie po dostarczeniu pisemnej zgody przedstawiciela ustawowego (Załącznik&nbsp;C). Uczestnictwo osób poniżej 16. roku życia nie jest możliwe.</li>
            <li><strong>Zainteresowany</strong> — osoba, która złożyła zapytanie o&nbsp;Sesję HTG za pośrednictwem htgcyou.com, ale której rezerwacja nie została jeszcze zaakceptowana przez Zespół HTG. Z&nbsp;chwilą akceptacji Zainteresowany staje się Uczestnikiem.</li>
            <li><strong>Subskrypcja</strong> — usługa dostępu do Biblioteki Nagrań HTG. Szczegóły w pkt&nbsp;4.</li>
            <li><strong>Biblioteka Nagrań HTG</strong> — zbiór opublikowanych przez Administratora Serwisu nagrań Sesji HTG i Spotkań, dostępny w panelu klienta na htgcyou.com.</li>
            <li><strong>Konto</strong> — indywidualny panel klienta na htgcyou.com, służący do zawierania umów, dokonywania płatności, zarządzania zgodami i dostępu do nagrań.</li>
            <li><strong>Konsument</strong> — Uczestnik będący osobą fizyczną zawierającą umowę niezwiązaną bezpośrednio z jej działalnością gospodarczą lub zawodową (art.&nbsp;22<sup>1</sup>&nbsp;KC).</li>
            <li><strong>Dzień roboczy</strong> — poniedziałek–piątek z wyłączeniem dni ustawowo wolnych od pracy.</li>
          </UL>
        </Section>

        {/* ── 2. Jak działają sesje HTG ── */}
        <Section id="sesja" title="2. Jak działają sesje HTG">
          <H3>2.1 Prowadzenie sesji</H3>
          <P>Każda Sesja HTG jest prowadzona przez Natalię — samodzielnie lub w asyście Operatora/ki sesji. Przy rezerwacji wybierasz rodzaj sesji:</P>
          <UL>
            <li><strong>Sesja z Natalią</strong> — prowadzona samodzielnie przez Prowadzącą.</li>
            <li><strong>Sesja z asystą</strong> — prowadzona przez Natalię w asyście Operatora/ki sesji. Możesz wskazać preferowaną Operatorkę lub pozostawić wybór Zespołowi HTG.</li>
          </UL>

          <H3>2.2 Charakter udziału Operatora/ki</H3>
          <P>
            Przedmiotem umowy jest <strong>Sesja HTG prowadzona przez Natalię</strong>. Udział Operatora/ki ma charakter pomocniczy
            i <strong>nie jest świadczeniem gwarantowanym</strong>.
          </P>
          <P>
            Przy rezerwacji „Sesji z asystą" możesz wskazać preferowaną Operatorkę. Wskazanie jest preferencją organizacyjną,
            a nie zobowiązaniem umownym Administratora Serwisu — udział konkretnej Operatorki nie jest gwarantowany.
            Administrator Serwisu może w każdym momencie, bez podania przyczyny i bez uprzedzenia, przydzielić innego Operatora/kę
            albo zrezygnować z asysty na danej sesji. Zmiana Operatora/ki nie wpływa na cenę ani charakter sesji
            i nie stanowi podstawy do odstąpienia od umowy ani roszczenia o zwrot.
          </P>
          <P>Świadczeniem głównym pozostaje Sesja HTG z Natalią — to ono ma znaczenie dla treści umowy.</P>

          <H3>2.3 Prawo odmowy realizacji sesji</H3>
          <P>
            Administrator Serwisu zastrzega sobie prawo do odmowy realizacji Sesji HTG przed jej rozpoczęciem —
            w&nbsp;szczególności w&nbsp;przypadku, gdy zachowanie Zainteresowanego lub Uczestnika narusza zasady wzajemnego szacunku.
            W&nbsp;przypadku odmowy wniesiona zaliczka zostanie zwrócona w&nbsp;całości w&nbsp;terminie 7&nbsp;dni roboczych.
            Niniejsze postanowienie nie uchybia zasadom z&nbsp;pkt&nbsp;6 (Bezpieczeństwo przestrzeni).
          </P>

          <H3>2.4 Rezerwacja i przebieg</H3>
          <P>Co do zasady Sesja odbywa się online. Aby w&nbsp;pełni z&nbsp;niej skorzystać, prosimy o&nbsp;przygotowanie:</P>
          <UL>
            <li>stabilnego łącza internetowego,</li>
            <li>sprawnej kamery i mikrofonu,</li>
            <li>spokojnego miejsca, w którym możesz swobodnie rozmawiać.</li>
          </UL>
          <Info>
            <strong>Twój czas.</strong> Czas sesji jest zarezerwowany specjalnie dla Ciebie.
            Jeśli spóźnisz się więcej niż 15&nbsp;minut, sesja wciąż się odbędzie, ale potrwa odpowiednio krócej
            (opłata pozostaje bez zmian), aby nie zakłócać sesji kolejnych osób.
          </Info>
          <P>
            Awarie sprzętu lub problemy z internetem po Twojej stronie nie przedłużają czasu trwania sesji
            i nie stanowią podstawy do zwrotu kosztów. Jeśli problemy techniczne wystąpią po stronie Zespołu HTG —
            zrekompensujemy Ci ten czas lub ustalimy nowy termin bez dopłaty.
          </P>

          <H3>2.5 Spotkania</H3>
          <P>
            Spotkania są wydarzeniami grupowymi, online, dla kilku lub kilkunastu Uczestników. Prowadzone są
            w formule audio-wideo (każdy Uczestnik widzi i słyszy pozostałych) i mają charakter otwartej rozmowy.
          </P>
          <P>
            Udział w Spotkaniu rezerwujesz na htgcyou.com. Charakter grupowy oznacza, że Twoje wypowiedzi i wizerunek
            są widoczne dla pozostałych Uczestników, a po nagraniu i publikacji <strong>nie jest technicznie możliwe
            selektywne usunięcie Twoich wypowiedzi</strong> (są nierozerwalnie związane z wypowiedziami innych osób).
            Apelujemy o ostrożność w ujawnianiu danych szczególnie wrażliwych (zdrowie, intymność, traumy) —
            możesz w każdej chwili powstrzymać się od wypowiedzi.
          </P>
        </Section>

        {/* ── 3. Zakup sesji, płatności i zwroty ── */}
        <Section id="platnosci" title="3. Zakup sesji, płatności i zwroty">
          <H3>3.1 Zawarcie umowy</H3>
          <P>
            Sesję HTG rezerwujesz na htgcyou.com. Przy rezerwacji wybierasz rodzaj sesji, preferowany termin,
            opcjonalnie Operatorkę, dokonujesz płatności i przesyłasz zapytanie. <strong>Umowa zostaje zawarta
            z chwilą akceptacji rezerwacji przez Zespół HTG.</strong> Do tego momentu wpłacona kwota stanowi zaliczkę.
          </P>
          <P>
            W przypadku odmowy realizacji sesji przez Administratora Serwisu (pkt&nbsp;2.3) zaliczka zostanie
            zwrócona w całości w terminie 7&nbsp;dni roboczych, tą samą metodą płatności.
          </P>

          <H3>3.2 Płatności</H3>
          <UL>
            <li>Płatność odbywa się przez htgcyou.com (Stripe — karty, BLIK, Przelewy24) lub przelew bankowy.</li>
            <li>Faktury i dokumenty księgowe udostępniane są w panelu klienta i wysyłane e-mailem.</li>
          </UL>

          <H3>3.3 Prawo odstąpienia (14 dni)</H3>
          <P>
            Konsument ma prawo odstąpić od umowy w ciągu <strong>14 dni</strong> od jej zawarcia
            (tj. od dnia akceptacji rezerwacji), bez podania przyczyny. Wystarczy wysłać oświadczenie na htg@htg.cyou
            (wzór: Załącznik&nbsp;A).
          </P>
          <P><strong>Prawo odstąpienia wygasa wcześniej</strong> — wyłącznie wtedy, gdy:</P>
          <UL>
            <li><strong>Sesja indywidualna</strong> została w pełni wykonana przed upływem 14&nbsp;dni —
              pod warunkiem, że przed jej rozpoczęciem wyraźnie zażądałeś/aś rozpoczęcia świadczenia
              i przyjąłeś/aś do wiadomości utratę prawa odstąpienia (art.&nbsp;38 pkt&nbsp;1 ustawy o prawach konsumenta).</li>
            <li><strong>Treści cyfrowe (Subskrypcja)</strong> zostały Ci dostarczone przed upływem 14&nbsp;dni —
              pod warunkiem wyraźnej zgody przy zakupie i przyjęcia do wiadomości utraty prawa odstąpienia
              (art.&nbsp;38 pkt&nbsp;13 ustawy o prawach konsumenta).</li>
          </UL>
          <P>Odpowiednie oświadczenia są zbierane przez osobne checkboxy przy zakupie.</P>
          <P>
            Jeżeli zażądałeś/aś rozpoczęcia świadczenia przed upływem 14&nbsp;dni i odstępujesz po częściowym wykonaniu usługi,
            <strong> zapłacisz kwotę proporcjonalną do zakresu świadczeń spełnionych do chwili odstąpienia</strong>.
          </P>
          <P>Zwrot środków nastąpi w ciągu 14&nbsp;dni od otrzymania Twojego oświadczenia, tą samą metodą.</P>

          <H3>3.4 Faktury</H3>
          <P>Faktury są wystawiane na dane podane przy zakupie i udostępniane w panelu klienta.</P>
        </Section>

        {/* ── 4. Subskrypcje ── */}
        <Section id="subskrypcje" title="4. Subskrypcje — dostęp do Biblioteki Nagrań HTG">
          <H3>4.1 Warianty Subskrypcji</H3>
          <UL>
            <li><strong>Pojedyncze nagranie</strong> — jednorazowy zakup dostępu do wybranego, opublikowanego nagrania. Ważność dostępu: <strong>24&nbsp;miesiące</strong> od daty zakupu.</li>
            <li><strong>Pakiet miesięczny</strong> — dostęp do <strong>miesięcznego zestawu</strong> kilku nagrań publikowanego co miesiąc (oznaczonego nazwą miesiąca, np. „Pakiet styczeń 2026"). Ważność dostępu do zakupionego zestawu: <strong>24&nbsp;miesiące</strong> od daty zakupu.</li>
            <li><strong>Pakiet roczny</strong> — dostęp do <strong>dwunastu miesięcznych zestawów</strong> wybranych przez Uczestnika (kolejnych następujących po sobie albo dowolnych spośród dostępnych). Ważność dostępu do każdego z dwunastu zestawów: <strong>24&nbsp;miesiące</strong> od daty zakupu pakietu rocznego.</li>
          </UL>
          <P>
            Subskrypcje <strong>nie odnawiają się automatycznie</strong> — po wykorzystaniu zakupionego pakietu
            Uczestnik może dokonać kolejnego zakupu w dowolnym momencie. Płatność pobierana jest jednorazowo przy zakupie.
          </P>

          <H3>4.2 Brak zwrotów</H3>
          <P>
            Po dokonaniu zakupu Subskrypcji (pojedyncze nagranie, Pakiet miesięczny, Pakiet roczny) i udostępnieniu treści
            w panelu klienta, <strong>wpłacona kwota nie podlega zwrotowi</strong>. Subskrypcje są treściami cyfrowymi
            w rozumieniu art.&nbsp;38 pkt&nbsp;13 ustawy o prawach konsumenta — Uczestnik traci prawo odstąpienia
            z chwilą rozpoczęcia świadczenia po wyrażeniu wyraźnej zgody przy zakupie (osobny checkbox: „żądam udostępnienia
            treści cyfrowych przed upływem 14&nbsp;dni i przyjmuję do wiadomości utratę prawa odstąpienia").
          </P>

          <H3>4.3 Zmiana ceny</H3>
          <P>
            Cena każdej Subskrypcji jest ustalana w momencie zakupu i nie ulega zmianie dla już opłaconego pakietu
            przez cały 24-miesięczny okres ważności. Administrator Serwisu może zmieniać ceny przyszłych Subskrypcji
            w dowolnym momencie — zmiana cen nie ma zastosowania do zakupów dokonanych przed zmianą.
          </P>

          <H3>4.4 Wady treści cyfrowych</H3>
          <P>
            W przypadku wad treści cyfrowych przysługują Ci prawa z rozdziału 5b ustawy o prawach konsumenta
            (naprawa, wymiana, obniżenie ceny, odstąpienie).
          </P>

          <H3>4.5 Trwałość usługi</H3>
          <P>
            Gwarantujemy utrzymanie Biblioteki Nagrań HTG i dostępu do zakupionych Subskrypcji przez okres ich ważności
            (24&nbsp;miesiące od daty zakupu). W razie zaprzestania świadczenia usługi przed upływem tego okresu,
            poinformujemy Cię z co najmniej <strong>90-dniowym wyprzedzeniem</strong> i zwrócimy proporcjonalną część
            opłaty za niewykorzystany okres.
          </P>
        </Section>

        {/* ── 5. Zmiany terminów ── */}
        <Section id="terminy" title="5. Zmiany terminów">
          <H3>5.1 Z Twojej inicjatywy</H3>
          <UL>
            <li>Możesz zmienić termin sesji <strong>najpóźniej 7&nbsp;dni</strong> przed jej planowaną datą — bez dodatkowych kosztów.</li>
            <li>Zmianę zgłaszasz w panelu klienta lub pisząc na htg@htg.cyou.</li>
            <li>Z uwagi na ograniczoną dostępność Prowadzącej, czas oczekiwania na nowy termin może być wydłużony (nawet do kilku miesięcy).</li>
          </UL>

          <H3>5.2 Późne odwołanie i nieobecność</H3>
          <P>
            Odwołanie sesji lub zmiana terminu zgłoszone <strong>później niż 14&nbsp;dni od daty rezerwacji</strong>
            (rozumianej jako moment opłacenia sesji w całości lub w części) skutkuje tym, że
            <strong> Administrator Serwisu nie zwraca wpłaconych środków</strong>. Środki pokrywają zarezerwowany czas
            Prowadzącej oraz koszty organizacyjne Zespołu HTG.
          </P>
          <P>
            Powyższa zasada jest dodatkowo potwierdzana <strong>osobnym oświadczeniem (checkboxem)</strong>
            przy rezerwacji sesji — przed dokonaniem płatności Uczestnik wyraźnie akceptuje warunki odwołania.
          </P>
          <P>
            W udokumentowanych sytuacjach losowych (choroba, zdarzenie nagłe) Zespół HTG może zaproponować
            nowy termin bez dopłaty — według własnego uznania, z uwzględnieniem dostępności Prowadzącej.
          </P>
          <P>Niniejsze postanowienie nie uchybia prawu odstąpienia z pkt&nbsp;3.3.</P>

          <H3>5.3 Z naszej inicjatywy</H3>
          <P>
            Jeżeli z ważnych przyczyn musimy przesunąć Twoją sesję, niezwłocznie się z Tobą skontaktujemy.
            <strong> Wybór należy do Ciebie:</strong>
          </P>
          <UL>
            <li>inny wolny termin,</li>
            <li>voucher ważny 12&nbsp;miesięcy,</li>
            <li>pełny zwrot wpłaconej kwoty w terminie 7&nbsp;dni roboczych.</li>
          </UL>
        </Section>

        {/* ── 6. Charakter sesji ── */}
        <Section id="charakter" title="6. Charakter sesji i Twoja odpowiedzialność">
          <P>
            <strong>Sesje HTG mają charakter wyłącznie inspiracyjny i rozwojowy.</strong> Sesja HTG opiera się
            na niekonwencjonalnych sposobach pracy z intuicją i postrzeganiem pozazmysłowym. Ponieważ sposoby te
            wykraczają poza standardowe ramy naukowe, sesję należy traktować jako formę niemierzalnej inspiracji,
            a nie twardą wytyczną. Biorąc udział w sesji, akceptujesz jej subiektywny i eksperymentalny charakter.
          </P>
          <P>
            Nasze sesje <strong>nie są formą diagnozy, terapii psychologicznej, psychoterapii, porady medycznej,
            prawnej ani finansowej</strong>. Jeśli zmagasz się z problemami zdrowotnymi, psychicznymi lub potrzebujesz
            profesjonalnej pomocy — zachęcamy do kontaktu z odpowiednim specjalistą.
          </P>
          <Info>
            <strong>Sesja HTG nie jest interwencją kryzysową.</strong> Jeśli jesteś w kryzysie psychicznym
            lub zagrożeniu życia, prosimy o kontakt z:
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li><strong>Telefon Zaufania dla Dorosłych w Kryzysie Emocjonalnym</strong> — 116&nbsp;123 (bezpłatny, anonimowy)</li>
              <li><strong>Centrum Wsparcia dla Osób Dorosłych w Kryzysie</strong> — 800&nbsp;70&nbsp;22&nbsp;22 (24/7)</li>
              <li><strong>Telefon Zaufania dla Dzieci i Młodzieży</strong> — 116&nbsp;111</li>
            </ul>
          </Info>
          <P>
            Zespół HTG dzieli się swoimi wglądami, jednak to Ty jesteś kreatorem swojego życia. Zachęcamy
            do samodzielnego podejmowania decyzji i konsultacji specjalistycznych przed istotnymi zmianami zdrowotnymi,
            zawodowymi lub finansowymi.
          </P>

          <H3>6.1 Brak gwarancji rezultatów</H3>
          <P>
            Sesje HTG mają charakter rozwojowy i subiektywny — Administrator Serwisu nie składa obietnic
            ani gwarancji osiągnięcia określonych rezultatów życiowych, zdrowotnych czy finansowych.
          </P>

          <H3>6.2 Odpowiedzialność</H3>
          <P>
            Administrator Serwisu odpowiada wobec Konsumenta za niewykonanie lub nienależyte wykonanie umowy
            na zasadach ogólnych Kodeksu cywilnego.
          </P>
          <P>
            W zakresie dopuszczonym przepisami prawa, <strong>odpowiedzialność Administratora Serwisu wobec Uczestnika
            niebędącego Konsumentem</strong> jest ograniczona do równowartości ceny zapłaconej za daną Sesję HTG;
            ograniczenie to nie dotyczy szkód wyrządzonych umyślnie ani szkód na osobie.
          </P>
          <P>
            W relacji z Konsumentem <strong>wyłączamy odpowiedzialność wyłącznie za szkody pośrednie i utracone korzyści</strong>
            w zakresie dopuszczalnym przepisami; pełna odpowiedzialność za szkody na osobie i szkody wyrządzone umyślnie
            lub wskutek rażącego niedbalstwa pozostaje zachowana.
          </P>

          <H3>6.3 Bezpieczeństwo przestrzeni</H3>
          <P>
            Dbając o jakość przestrzeni i wzajemne bezpieczeństwo, Prowadzący ma prawo przerwać lub odmówić
            kontynuowania sesji, jeśli Uczestnik zachowuje się w sposób agresywny, naruszający granice osobiste
            lub znajduje się — w ocenie Prowadzącego — pod widocznym wpływem substancji psychoaktywnych.
            W takich rażących przypadkach opłata za sesję nie podlega zwrotowi. Niniejsze postanowienie dotyczy
            sytuacji zaistniałych w trakcie trwania sesji.
          </P>
        </Section>

        {/* ── 7. Nagrania i poufność ── */}
        <Section id="nagrania" title="7. Nagrania i poufność">
          <H3>7.1 Nagrywanie jako element usługi</H3>
          <P>
            Każda Sesja HTG jest nagrywana w formie audio i wideo. <strong>Nagrywanie stanowi integralną część
            usługi Sesji HTG</strong> i jest niezbędne do jej wykonania (m.in. Twój dostęp do nagrania w panelu klienta,
            dokumentacja procesu). Podstawą prawną przetwarzania danych w tym celu jest <strong>wykonanie umowy</strong>
            (art.&nbsp;6 ust.&nbsp;1 lit.&nbsp;b RODO).
          </P>
          <P>
            Bez zgody na nagrywanie nie jest technicznie możliwe wykonanie Sesji HTG — informujemy o tym wyraźnie
            przed zawarciem umowy.
          </P>

          <H3>7.2 Twój dostęp do nagrania</H3>
          <UL>
            <li>Nagranie udostępnimy Ci <strong>do odsłuchania w panelu klienta</strong> w ciągu 7&nbsp;dni od sesji.</li>
            <li>Nagranie służy Twojemu <strong>prywatnemu użytkowi</strong> — możesz do niego swobodnie wracać w panelu klienta.</li>
            <li>Wszystkie prawa autorskie majątkowe do nagrania (jako utworu audiowizualnego) przysługują Administratorowi Serwisu. Nagranie nie jest pobierane ani przekazywane Uczestnikowi w postaci pliku.</li>
            <li><strong>Publikowanie, udostępnianie, rozpowszechnianie lub kopiowanie nagrania</strong> (w całości lub we fragmentach) przez Uczestnika <strong>jest niedozwolone</strong>.</li>
          </UL>

          <H3>7.3 Zakaz samodzielnego nagrywania</H3>
          <P>
            Aby każdy mógł czuć się swobodnie, obowiązuje całkowity zakaz samodzielnego nagrywania sesji
            (audio, wideo, screen recording) przez Uczestnika. Oficjalne i jedyne nagranie realizuje Zespół HTG.
          </P>
          <P>
            Złamanie tego zakazu (np. potajemne nagrywanie) oznacza natychmiastowe przerwanie sesji bez możliwości
            zwrotu opłaty. Zastrzegamy sobie prawo do podjęcia kroków prawnych w przypadku naruszenia naszych dóbr
            osobistych i praw autorskich.
          </P>

          <H3>7.4 Poufność</H3>
          <P>
            Zespół HTG traktuje treść każdej sesji jako poufną. Informacje, które nam powierzasz, nie będą udostępniane
            osobom trzecim — z wyjątkiem sytuacji wynikających z prawa lub publikacji sesji na warunkach z pkt&nbsp;8.
          </P>
          <P>
            Zespół HTG może informować na htgcyou.com o aktualnie prowadzonych sesjach, wykorzystując wyłącznie imię
            Uczestnika (bez nazwiska), np. „sesja dla Anny".
          </P>

          <H3>7.5 Przechowywanie i usuwanie</H3>
          <UL>
            <li><strong>Nagranie oryginalne</strong> (pełna sesja w panelu klienta): co najmniej <strong>24&nbsp;miesiące</strong> od daty sesji.</li>
            <li><strong>Nagrania opublikowane</strong> w kanałach HTG (Biblioteka Nagrań HTG, kanał YouTube HTG, htgcyou.com): <strong>bezterminowo</strong> — stanowią archiwum HTG i są elementem usługi subskrypcyjnej oraz publicznej obecności inicjatywy.</li>
            <li><strong>Fragmenty wykorzystane w materiałach informacyjnych</strong>: bezterminowo, w zakresie udzielonych zgód.</li>
            <li><strong>Anonimizowane fragmenty</strong> (bez wizerunku albo ze zmienionym głosem do nierozpoznawalności + bez wskazania imienia/danych identyfikujących): bezterminowo, bez ograniczeń kanału.</li>
            <li><strong>Kopie techniczne (backup)</strong>: do 90&nbsp;dni po usunięciu nagrania głównego.</li>
          </UL>
          <P>
            Możesz w każdej chwili poprosić o wcześniejsze usunięcie nagrania oryginalnego ze swojego panelu klienta,
            pisząc na htg@htg.cyou — uwzględnimy prośbę w ciągu 30&nbsp;dni. Usunięcie nagrania w panelu klienta
            nie wpływa na nagrania już opublikowane w kanałach HTG na podstawie pkt&nbsp;8.
          </P>
          <P>
            W przypadku usunięcia konta nagrania oryginalne są kasowane, z wyjątkiem: (a)&nbsp;danych księgowych
            (do 5&nbsp;lat), (b)&nbsp;danych niezbędnych do obrony roszczeń (do przedawnienia),
            (c)&nbsp;nagrań i fragmentów opublikowanych w ramach pkt&nbsp;8 — pozostają one w archiwum HTG zgodnie
            z zasadami z pkt&nbsp;8.
          </P>
        </Section>

        {/* ── 8. Publikacja sesji ── */}
        <Section id="publikacja" title="8. Publikacja sesji">
          <P>
            Publikacja nagrań pomaga obniżać koszty organizacji i inspirować inne osoby. Model HTG zakłada,
            że <strong>publikacja sesji jest elementem usługi</strong> — cena Sesji HTG odzwierciedla ten model
            i obejmuje wynagrodzenie Uczestnika za udział w nagraniu publikowanym w kanałach HTG (zgodnie
            z art.&nbsp;81 ust.&nbsp;2 pkt&nbsp;2 ustawy o prawie autorskim i prawach pokrewnych).
          </P>

          <H3>8.1 Publikacja w kanałach HTG (element umowy)</H3>
          <P>
            Z chwilą zawarcia umowy o Sesję HTG udzielasz Administratorowi Serwisu <strong>bezterminowej,
            nieograniczonej terytorialnie i niewyłącznej zgody</strong> na publikację nagrania Twojej sesji
            (w całości lub we fragmentach, po montażu) w kanałach własnych HTG:
          </P>
          <UL>
            <li><strong>Biblioteka Nagrań HTG</strong> (panel klienta htgcyou.com, dostępna w ramach Subskrypcji),</li>
            <li><strong>kanał YouTube Hacking The Game</strong>,</li>
            <li><strong>strona htgcyou.com</strong> i podstrony,</li>
            <li><strong>tłumaczenia</strong> wskazanych powyżej publikacji na inne języki (napisy, lektor, dubbing) i ich rozpowszechnianie w wielojęzycznych wersjach Biblioteki, kanału YouTube i serwisu htgcyou.com.</li>
          </UL>
          <P>
            Zgoda obejmuje rozpowszechnianie wizerunku i głosu utrwalonego na nagraniu (art.&nbsp;81 ustawy o prawie autorskim).
          </P>
          <P>
            Publikacja w kanałach HTG nie wymaga osobnej zgody RODO, ponieważ stanowi element wykonania umowy
            (art.&nbsp;6 ust.&nbsp;1 lit.&nbsp;b RODO) — informujemy o tym wyraźnie przy rezerwacji.
          </P>

          <H3>8.2 Wskazanie fragmentów do wycięcia (7 dni)</H3>
          <P>
            Po udostępnieniu nagrania w panelu klienta masz <strong>7&nbsp;dni kalendarzowych</strong> na wskazanie fragmentów,
            które chcesz wyciąć z wersji publikowanej. Zgłoszenie wysyłasz w panelu klienta lub na htg@htg.cyou.
          </P>
          <P>
            <strong>Brak zgłoszenia w ciągu 7&nbsp;dni oznacza akceptację wersji publikowanej.</strong> Dołożymy starań,
            by uwzględnić wskazane fragmenty przy montażu, o ile nie uniemożliwia to zachowania spójności materiału.
            W razie konfliktu (wskazany fragment uniemożliwia publikację sensownego materiału) skontaktujemy się z Tobą.
          </P>

          <H3>8.3 Anonimizowane fragmenty</H3>
          <P>Administrator Serwisu ma prawo wykorzystywać <strong>fragmenty anonimizowane</strong> — tj. takie, w których:</P>
          <UL>
            <li>nie jest pokazywany wizerunek Uczestnika (np. tylko głos, lub kadr poza Uczestnikiem), <strong>lub</strong></li>
            <li>głos Uczestnika został zmieniony do nierozpoznawalności (modulacja, lektor, voice-over),</li>
          </UL>
          <P>oraz w których nie podaje się imienia ani innych danych identyfikujących Uczestnika.</P>
          <P>
            Tak anonimizowane fragmenty <strong>nie stanowią danych osobowych</strong> w rozumieniu RODO i mogą być wykorzystywane
            bez ograniczeń kanału — w mediach społecznościowych, materiałach informacyjnych, wystąpieniach publicznych
            Zespołu HTG itd.
          </P>

          <H3>8.4 Dodatkowe zgody (dobrowolne)</H3>
          <P>
            Poza publikacją w kanałach HTG, przy rezerwacji oraz w panelu klienta możesz udzielić dodatkowych,
            dobrowolnych zgód:
          </P>
          <UL>
            <li><strong>Zgoda Z2 — Media społecznościowe.</strong> Zezwalam na publikację nagrania (w całości lub we fragmentach, z moim wizerunkiem i głosem) w mediach społecznościowych Hacking&nbsp;The&nbsp;Game (Instagram, Facebook, TikTok, LinkedIn).</li>
            <li><strong>Zgoda Z3 — Materiały informacyjne.</strong> Zezwalam na wykorzystanie fragmentów nagrania w materiałach informacyjnych Administratora Serwisu (reklamy, newslettery, prezentacje, materiały eventowe).</li>
          </UL>
          <P>
            <strong>Zgody Z2 i Z3 są w pełni dobrowolne</strong> — odmowa nie wpływa na możliwość odbycia Sesji HTG
            ani na jej cenę. Każdą z tych zgód możesz wycofać w dowolnym momencie w panelu klienta lub pisząc na htg@htg.cyou.
          </P>

          <H3>8.5 Wycofanie zgód Z2 / Z3 po publikacji</H3>
          <P>Po wycofaniu Zgody Z2 lub Z3:</P>
          <UL>
            <li>usuniemy materiał z kanałów objętych zgodą <strong>w terminie do 30&nbsp;dni roboczych</strong> (dla materiałów montowanych z udziałem osób trzecich do 60&nbsp;dni),</li>
            <li>wycofanie nie wpływa na legalność publikacji dokonanej przed zgłoszeniem,</li>
            <li>nie odpowiadamy za kopie rozpowszechnione przez podmioty trzecie (np. re-uploady), poza obowiązkiem podjęcia rozsądnych działań w celu ich usunięcia,</li>
            <li>nie wpływa to na publikację w kanałach HTG (pkt&nbsp;8.1) ani na anonimizowane fragmenty (pkt&nbsp;8.3) — te wynikają z umowy, a nie z odrębnej zgody.</li>
          </UL>

          <H3>8.6 Spotkania — publikacja</H3>
          <P>
            Spotkania są nagrywane i mogą być publikowane w kanałach HTG (pkt&nbsp;8.1), wraz z tłumaczeniami,
            w ramach Subskrypcji oraz na kanale YouTube. Z uwagi na grupowy charakter Spotkań i nierozerwalność wypowiedzi,
            <strong> nie jest technicznie możliwe selektywne usunięcie wypowiedzi pojedynczego Uczestnika</strong> po nagraniu.
          </P>
          <P>
            Przed Spotkaniem informujemy o tym wyraźnie i prosimy o potwierdzenie zrozumienia (osobny checkbox).
            Brak potwierdzenia oznacza brak możliwości udziału w Spotkaniu.
          </P>

          <H3>8.7 Niepełnoletni</H3>
          <P>
            <strong>Nie publikujemy</strong> sesji ani wypowiedzi Uczestników poniżej 18.&nbsp;roku życia w żadnym kanale
            (Biblioteka, YouTube, media społecznościowe, materiały informacyjne) — niezależnie od zgody przedstawiciela
            ustawowego. W przypadku Uczestników 16–17&nbsp;lat sesja jest nagrywana wyłącznie do prywatnego użytku
            Uczestnika w panelu klienta i celów dokumentacyjnych.
          </P>
        </Section>

        {/* ── 9. Prawa autorskie ── */}
        <Section id="prawa-autorskie" title="9. Prawa autorskie i metodyka HTG">
          <H3>9.1 Prawa autorskie</H3>
          <P>Administratorowi Serwisu przysługują autorskie prawa majątkowe do:</P>
          <UL>
            <li>nagrań Sesji HTG i Spotkań jako utworów audiowizualnych,</li>
            <li>scenariuszy, opracowań pisemnych, materiałów edukacyjnych, oznaczeń graficznych,</li>
            <li>elementów twórczych metodyki HTG utrwalonych w formie utworu.</li>
          </UL>

          <H3>9.2 Know-how i tajemnica przedsiębiorstwa</H3>
          <P>
            Metodyka HTG, w zakresie, w jakim nie stanowi utworu w rozumieniu prawa autorskiego, jest chronionym
            <strong> know-how</strong> i <strong>tajemnicą przedsiębiorstwa</strong> Administratora Serwisu.
            Udział w Sesji HTG <strong>nie nadaje</strong> Uczestnikowi:
          </P>
          <UL>
            <li>prawa do nauczania, certyfikowania ani komercyjnego wykorzystywania metodyki HTG,</li>
            <li>prawa do tworzenia szkoleń, kursów lub materiałów opartych na metodyce HTG,</li>
            <li>prawa do posługiwania się oznaczeniami HTG.</li>
          </UL>

          <H3>9.3 Pola eksploatacji nagrań</H3>
          <P>
            W zakresie wynikającym z pkt&nbsp;8 Regulaminu, Administrator Serwisu może wykorzystywać nagrania
            na następujących polach eksploatacji:
          </P>
          <UL>
            <li>utrwalanie i zwielokrotnianie dowolną techniką,</li>
            <li>publikacja w internecie (Biblioteka Nagrań HTG, kanał YouTube HTG, htgcyou.com, a po uzyskaniu Zgody Z2 — także w mediach społecznościowych),</li>
            <li>wprowadzanie do obrotu w ramach Subskrypcji,</li>
            <li><strong>tłumaczenie nagrań na inne języki</strong> (napisy, lektor, dubbing) i ich rozpowszechnianie w wielojęzycznych wersjach Biblioteki Nagrań HTG, kanału YouTube i serwisu htgcyou.com,</li>
            <li>tworzenie kompilacji, montaży i materiałów informacyjnych (w zakresie Zgody Z3),</li>
            <li>wykorzystanie anonimizowanych fragmentów (pkt&nbsp;8.3) bez ograniczenia kanału.</li>
          </UL>
        </Section>

        {/* ── 10. Prywatność ── */}
        <Section id="prywatnosc" title="10. Prywatność, dane osobowe i dane wrażliwe">
          <P>
            Chronimy Twoje dane zgodnie z RODO. Szczegóły — jakie dane zbieramy, w jakim celu, jak długo
            je przechowujemy i jakie masz prawa — znajdziesz w Polityce Prywatności oraz Załączniku&nbsp;B.
          </P>

          <H3>10.1 Warstwy podstaw prawnych</H3>
          <UL>
            <li><strong>Założenie konta i realizacja umowy</strong> — dane zwykłe (imię, e-mail, dane rozliczeniowe, nagranie sesji) — art.&nbsp;6 ust.&nbsp;1 lit.&nbsp;b RODO.</li>
            <li><strong>Dane szczególnych kategorii ujawniane w trakcie sesji</strong> — art.&nbsp;9 ust.&nbsp;2 lit.&nbsp;a RODO (Twoja wyraźna zgoda).</li>
            <li><strong>Dodatkowe zgody publikacyjne (Z2, Z3)</strong> — art.&nbsp;6 ust.&nbsp;1 lit.&nbsp;a RODO + art.&nbsp;81 prawa autorskiego.</li>
            <li><strong>Marketing i informowanie o nowościach</strong> — art.&nbsp;6 ust.&nbsp;1 lit.&nbsp;a RODO.</li>
            <li><strong>Obowiązki księgowe</strong> — art.&nbsp;6 ust.&nbsp;1 lit.&nbsp;c RODO.</li>
          </UL>
          <P>
            Każdą zgodę możesz wycofać w dowolnym momencie. Wycofanie zgody nie wpływa na zgodność z prawem
            przetwarzania dokonanego przed wycofaniem.
          </P>

          <H3>10.2 Dane szczególnych kategorii</H3>
          <P>W trakcie Sesji HTG mogą zostać ujawnione dane szczególnych kategorii (art.&nbsp;9 RODO), w szczególności:</P>
          <UL>
            <li>dane o stanie zdrowia (fizycznym i psychicznym),</li>
            <li>dane o przekonaniach religijnych, światopoglądowych, politycznych,</li>
            <li>dane o życiu seksualnym i orientacji seksualnej,</li>
            <li>dane o przeszłości traumatycznej, uzależnieniach, relacjach rodzinnych.</li>
          </UL>
          <P>
            <strong>Nie jesteś zobowiązany/a ujawniać żadnych z tych danych</strong> — pracujesz z tym, na co masz gotowość.
            Dane są przetwarzane wyłącznie na podstawie Twojej wyraźnej, świadomej zgody (art.&nbsp;9 ust.&nbsp;2 lit.&nbsp;a RODO)
            i wyłącznie w celu wykonania Sesji HTG.
          </P>

          <H3>10.3 Dostęp do nagrań i danych</H3>
          <P>Dostęp do Twoich nagrań i danych mają wyłącznie:</P>
          <UL>
            <li>Prowadząca i przydzielony Operator/ka sesji (na zasadzie ścisłej potrzeby),</li>
            <li>przydzielony/a Tłumacz/ka — w zakresie sesji, w której uczestniczy, oraz w zakresie nagrań przekazywanych do tłumaczenia,</li>
            <li>osoby zajmujące się montażem i publikacją nagrań — w zakresie wynikającym z pkt&nbsp;8,</li>
            <li>administratorzy techniczni Administratora Serwisu (na zasadzie ścisłej potrzeby).</li>
          </UL>
          <P>
            Wszystkie te osoby są zobowiązane do zachowania poufności na podstawie umów o powierzenie przetwarzania
            (art.&nbsp;28 RODO) lub umów o zachowaniu poufności.
          </P>

          <H3>10.4 Brak automatyzacji i analityki na danych z sesji</H3>
          <P>
            Treść Sesji HTG (nagrania, wypowiedzi Uczestnika) <strong>nie jest przetwarzana w sposób zautomatyzowany</strong> —
            nie podlega profilowaniu, automatycznemu podejmowaniu decyzji w rozumieniu art.&nbsp;22 RODO, ani innym formom
            zautomatyzowanej analizy treści.
          </P>
          <P>
            Dane techniczne (logi, statystyki używania panelu klienta) są przetwarzane w celu utrzymania serwisu —
            bez powiązania z treścią sesji.
          </P>

          <H3>10.5 Wycofanie zgody</H3>
          <UL>
            <li>Wycofanie zgody na dane wrażliwe może uniemożliwić realizację kolejnych sesji.</li>
            <li>Wycofanie zgód publikacyjnych Z2/Z3 — pkt&nbsp;8.5.</li>
            <li>Wycofanie zgody marketingowej — w panelu klienta.</li>
            <li>Część danych może być nadal przechowywana, jeśli wymagają tego przepisy prawa lub obrona roszczeń.</li>
          </UL>
        </Section>

        {/* ── 11. Reklamacje ── */}
        <Section id="reklamacje" title="11. Reklamacje i pozasądowe rozwiązywanie sporów">
          <UL>
            <li>Reklamacje prosimy zgłaszać na adres htg@htg.cyou. Każdą sprawę rozpatrzymy w ciągu <strong>14&nbsp;dni</strong> od jej otrzymania i poinformujemy Cię o wyniku e-mailem.</li>
            <li>Jeśli nie jesteś zadowolony/a z rozstrzygnięcia, jako Konsument możesz skorzystać z pozasądowych metod rozwiązywania sporów: <strong>rzecznik konsumentów</strong> (powiatowy lub miejski), <strong>Wojewódzki Inspektorat Inspekcji Handlowej</strong>, <strong>stały polubowny sąd konsumencki</strong> przy WIIH.</li>
          </UL>
        </Section>

        {/* ── 12. Sytuacje nieprzewidziane ── */}
        <Section id="sila-wyzsza" title="12. Sytuacje nieprzewidziane (siła wyższa)">
          <P>
            Żadna ze stron nie odpowiada za niewykonanie zobowiązań spowodowane siłą wyższą — czyli zdarzeniami
            nadzwyczajnymi, nieprzewidywalnymi i niezależnymi od stron (np. awarie infrastruktury, klęski żywiołowe,
            akty władzy publicznej).
          </P>
          <P>
            W przypadku siły wyższej trwającej dłużej niż 30&nbsp;dni, Konsument ma prawo odstąpić od umowy
            z pełnym zwrotem wpłaconej kwoty.
          </P>
        </Section>

        {/* ── 13. Zmiany regulaminu ── */}
        <Section id="zmiany" title="13. Zmiany regulaminu">
          <UL>
            <li>Możemy zmienić regulamin z ważnych przyczyn (np. zmiana przepisów prawa, zmiana zakresu usług). Nową wersję opublikujemy na htgcyou.com.</li>
            <li>Dla umów już zawartych (Sesja HTG, zakupiona Subskrypcja) — obowiązuje regulamin z dnia zawarcia umowy / zakupu, przez cały okres ważności tej umowy / tego pakietu.</li>
            <li>Zmiana wyłącznie korzystna dla Uczestnika lub wynikająca bezpośrednio z przepisów prawa wchodzi w życie z dniem opublikowania.</li>
          </UL>
        </Section>

        {/* ── 14. Postanowienia końcowe ── */}
        <Section id="postanowienia" title="14. Postanowienia końcowe">
          <UL>
            <li>W sprawach nieuregulowanych zastosowanie mają przepisy prawa polskiego.</li>
            <li>Spory rozstrzygane będą przez sąd właściwy zgodnie z przepisami Kodeksu postępowania cywilnego (dla Konsumenta — sąd właściwy dla miejsca zamieszkania).</li>
            <li>Regulamin wchodzi w życie z dniem opublikowania na htgcyou.com.</li>
            <li>Przetwarzanie płatności obsługuje Pilot PSA.</li>
          </UL>
        </Section>

        {/* ── Załącznik A ── */}
        <Section id="zalacznik-a" title="Załącznik A — Wzór oświadczenia o odstąpieniu od umowy">
          <Info>
            <p className="mb-2"><strong>Adresat:</strong> Pilot PSA, ul. RONDO ONZ 1, 00-124 Warszawa, e-mail: htg@htg.cyou</p>
            <p className="mb-2">Ja/My(*) niniejszym informuję/informujemy(*) o moim/naszym(*) odstąpieniu od umowy o świadczenie następującej usługi:</p>
            <p className="mb-2 italic">[opis: Sesja HTG / Subskrypcja — wariant]</p>
            <p className="mb-1">Data zawarcia umowy: ___/___/_____</p>
            <p className="mb-1">Imię i nazwisko Konsumenta(-ów): ______________________</p>
            <p className="mb-1">Adres Konsumenta(-ów): _________________________________</p>
            <p className="mb-1">Podpis Konsumenta(-ów) (tylko jeżeli formularz jest przesyłany w wersji papierowej): ___________________</p>
            <p className="mb-2">Data: ___/___/_____</p>
            <p className="text-xs text-htg-fg-muted">*Niepotrzebne skreślić.</p>
          </Info>
        </Section>

        {/* ── Załącznik B ── */}
        <Section id="zalacznik-b" title="Załącznik B — Klauzula informacyjna RODO">
          <P>
            <strong>Administrator danych:</strong> Pilot PSA, ul.&nbsp;RONDO ONZ&nbsp;1, 00-124 Warszawa,
            NIP&nbsp;5253085101, REGON&nbsp;544401249. Kontakt: htg@htg.cyou.
          </P>
          <P><strong>Cele i podstawy przetwarzania:</strong> zob. pkt&nbsp;10.1 Regulaminu.</P>
          <P><strong>Odbiorcy danych (procesorzy i osoby upoważnione):</strong></P>
          <UL>
            <li>Vercel Inc. — hosting,</li>
            <li>Supabase Inc. — baza danych i autoryzacja,</li>
            <li>Stripe Inc. — płatności,</li>
            <li>Cloudflare Inc. — CDN, DNS,</li>
            <li>Bunny.net — hosting nagrań wideo,</li>
            <li>LiveKit Cloud — transmisja sesji wideo (WebRTC),</li>
            <li>Resend Inc. — wysyłka e-mail,</li>
            <li>Tłumacze współpracujący z Zespołem HTG — w zakresie sesji, w których uczestniczą, oraz nagrań przekazywanych do tłumaczenia,</li>
            <li>kancelarie prawne i biuro księgowe — w zakresie obsługi.</li>
          </UL>
          <P>
            <strong>Przekazywanie poza EOG:</strong> część dostawców (Vercel, Cloudflare, Stripe, LiveKit, Resend)
            może przetwarzać dane w USA na podstawie standardowych klauzul umownych Komisji Europejskiej oraz/lub
            na podstawie certyfikacji EU-US Data Privacy Framework.
          </P>
          <P><strong>Okresy przechowywania:</strong> zob. pkt&nbsp;4.5, 7.5 oraz Polityka Prywatności.</P>
          <P>
            <strong>Twoje prawa:</strong> dostęp, sprostowanie, usunięcie, ograniczenie przetwarzania, sprzeciw,
            przeniesienie, wycofanie zgody w dowolnym momencie, skarga do <strong>Prezesa UODO</strong> (uodo.gov.pl).
          </P>
          <P>
            Podanie danych jest dobrowolne, lecz niezbędne do rezerwacji Sesji HTG. Nie podejmujemy decyzji
            w sposób zautomatyzowany ani nie profilujemy Uczestników.
          </P>
        </Section>

        {/* ── Załącznik C ── */}
        <Section id="zalacznik-c" title="Załącznik C — Zgoda przedstawiciela ustawowego (Uczestnik 16–17 lat)">
          <P>
            Szablon do wydruku, podpisu i przesłania skanu na htg@htg.cyou.
          </P>
          <Info>
            <p className="mb-3">
              Ja, niżej podpisany/a <em>[imię i nazwisko]</em>, zamieszkały/a w <em>[adres]</em>, legitymujący/a się
              <em> [nr dokumentu]</em>, jako przedstawiciel ustawowy (rodzic/opiekun) <em>[imię i nazwisko podopiecznego]</em>,
              urodzonego/ej <em>[data]</em>, oświadczam, że:
            </p>
            <ol className="list-decimal pl-6 space-y-2">
              <li>Wyrażam zgodę na zawarcie przez podopiecznego umowy o Sesję HTG z Pilot PSA i na jego/jej udział w sesji bez mojej obecności.</li>
              <li>Zapoznałem/am się z Regulaminem i rozumiem niekonwencjonalny, rozwojowy charakter Sesji HTG; sesja <strong>nie zastępuje</strong> opieki medycznej ani psychologicznej.</li>
              <li>Wyrażam zgodę na przetwarzanie danych szczególnych kategorii podopiecznego ujawnionych w trakcie sesji (art.&nbsp;9 ust.&nbsp;2 lit.&nbsp;a RODO).</li>
              <li>Przyjmuję do wiadomości, że nagranie sesji podopiecznego <strong>nie będzie publikowane</strong> w Bibliotece Nagrań HTG, na YouTube, w mediach społecznościowych ani w materiałach informacyjnych (pkt&nbsp;8.7 Regulaminu).</li>
              <li>Biorę odpowiedzialność za udział podopiecznego w sesji w zakresie wynikającym z przepisów prawa.</li>
            </ol>
            <p className="mt-3">Data: ___/___/_____</p>
            <p>Czytelny podpis: ______________________</p>
          </Info>
        </Section>

      </div>
    </div>
  );
}
