import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const metadata = {
  title: 'Regulamin Operatora · HTG',
};

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

function Why({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-htg-sage/40 pl-4 my-4 text-sm text-htg-fg-muted italic leading-relaxed">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default async function OperatorTermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl md:text-4xl font-serif font-bold text-htg-fg mb-2">
        Nasza umowa współpracy
      </h1>
      <p className="text-htg-fg-muted text-sm mb-2">Regulamin Operatora/ki Sesji&nbsp;HTG</p>
      <p className="text-htg-fg-muted text-sm mb-8">Wersja 1.0 · obowiązuje od 9&nbsp;kwietnia 2026&nbsp;r.</p>

      {/* ── Intro ── */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-5 mb-10 text-sm text-htg-fg leading-relaxed">
        <p className="mb-3">Witaj.</p>
        <p className="mb-3">
          Wiemy, że umowy i&nbsp;regulaminy nie są światem, w&nbsp;którym czujesz się
          jak w&nbsp;domu — bo Twój świat to obecność, intuicja i&nbsp;wrażliwość.
          Dlatego napisaliśmy ten dokument tak, jak się rozmawia: po&nbsp;ludzku.
        </p>
        <p className="mb-3">
          <strong>Po co on w&nbsp;ogóle jest?</strong> Pracujemy z&nbsp;osobami,
          które przychodzą do nas w&nbsp;bardzo intymnych momentach swojego życia.
          Polskie prawo wymaga, żebyśmy — jako podmiot świadczący im usługi —
          mieli jasno spisane zasady z&nbsp;każdą osobą, która współtworzy te sesje.
          To chroni naszych Klientów, chroni Ciebie, chroni nas, i&nbsp;pozwala nam
          wszystkim spokojnie pracować.
        </p>
        <p className="mb-3">
          <strong>Czego ten dokument nie robi?</strong> Nie zatrudnia Cię. Nie
          zobowiązuje Cię do żadnej minimalnej liczby sesji. Nie odbiera Ci
          wolności prowadzenia własnej drogi.
        </p>
        <p className="mb-3">
          <strong>Co robi?</strong> Spisuje kilka rzeczy, które naprawdę muszą być
          spisane — żebyśmy mogli się zająć tym, co ważne: pracą z&nbsp;drugim
          człowiekiem.
        </p>
        <p>
          Jeśli cokolwiek będzie niejasne — napisz: <a href="mailto:htg@htg.cyou" className="text-htg-sage hover:underline">htg@htg.cyou</a>.
          Naprawdę.
        </p>
      </div>

      {/* ── Table of Contents ── */}
      <nav className="bg-htg-card border border-htg-card-border rounded-xl p-5 mb-10">
        <p className="text-sm font-semibold text-htg-fg mb-3">Spis treści</p>
        <ol className="columns-1 md:columns-2 gap-6 text-sm text-htg-fg-muted space-y-1">
          {[
            ['kim-jestesmy', '1. Kim jesteśmy'],
            ['charakter', '2. Charakter naszej współpracy'],
            ['wybor', '3. Kto prowadzi sesję'],
            ['obecnosc', '4. Co bierzesz na siebie podczas sesji'],
            ['zastepstwa', '5. Kiedy nie możesz — powiedz nam'],
            ['rozliczenia', '6. Pieniądze — jak się rozliczamy'],
            ['nagrania', '7. Nagrania, Twój głos i Twój wizerunek'],
            ['poufnosc', '8. Poufność'],
            ['materialy', '9. Materiały od Klienta — usuń w 30 dni'],
            ['dane', '10. Dane Klientów'],
            ['konkurencja', '11. Sesje HTG i zakaz konkurencji'],
            ['odpowiedzialnosc', '12. Odpowiedzialność i charakter sesji'],
            ['rozstanie', '13. Kiedy się rozstajemy'],
            ['zmiany', '14. Zmiany regulaminu'],
            ['koniec', '15. Na koniec'],
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
        <Section id="kim-jestesmy" title="1. Kim jesteśmy">
          <UL>
            <li><strong>Administrator Serwisu</strong> — Pilot&nbsp;PSA, ul.&nbsp;Rondo&nbsp;ONZ&nbsp;1, 00-124&nbsp;Warszawa, NIP&nbsp;5253085101. To z nami podpisujesz tę umowę.</li>
            <li><strong>Natalia (Prowadząca)</strong> — autorka i osoba prowadząca każdą Sesję HTG.</li>
            <li><strong>Operator/ka</strong> — Ty. Osoba, która towarzyszy Natalii podczas Sesji z&nbsp;asystą.</li>
            <li><strong>Klient</strong> — osoba, która zarezerwowała sesję i&nbsp;z którą wspólnie pracujecie.</li>
            <li><strong>Sesja HTG</strong> — sesja, która odbywa się na poziomie głębokiej świadomości siebie i&nbsp;Klienta rozpoznanej przez Natalię.</li>
            <li><strong>Regulamin Użytkowników</strong> — regulamin, który akceptują nasi Klienci, dostępny na <a href="/pl/terms" className="text-htg-sage hover:underline">htgcyou.com/pl/terms</a>. Obowiązuje również Ciebie w&nbsp;zakresie, w&nbsp;jakim dotyczy osób ze strony Zespołu HTG (poufność, sposób nagrywania, charakter sesji). Prosimy, żebyś go przeczytał/a — to jest obietnica, którą razem składamy Klientowi.</li>
          </UL>
        </Section>

        {/* ── 2. Charakter ── */}
        <Section id="charakter" title="2. Charakter naszej współpracy">
          <P>
            Jesteś z&nbsp;nami jako niezależna osoba, nie jako pracownik. Każda sesja
            to osobne zaproszenie — przyjmujesz je albo nie, my zapraszamy albo nie,
            bez urazy z&nbsp;żadnej strony.
          </P>
          <Why>
            <em>Dlaczego tak?</em> Bo praca w&nbsp;HTG nie da się zaplanować na rok
            do przodu. Sesje rodzą się z&nbsp;intuicji Natalii i&nbsp;z&nbsp;tego, kogo
            Klient w&nbsp;danym momencie potrzebuje obok siebie.
          </Why>
        </Section>

        {/* ── 3. Wybór ── */}
        <Section id="wybor" title="3. To Klient i Natalia decydują, kto prowadzi">
          <P>
            Klient przy rezerwacji może wskazać Ciebie albo zostawić wybór nam.{' '}
            <strong>Natalia może w&nbsp;każdej chwili — nawet tuż przed sesją —
            zdecydować, że tę konkretną sesję poprowadzi z&nbsp;kimś innym albo sama.
            Bez podawania przyczyny</strong> — w&nbsp;szczególności z&nbsp;uwagi na dobro
            Klienta, charakter tematu sesji, dostępność kadry, dynamikę zespołu lub
            własną intuicję pracy.
          </P>
          <P>
            Prosimy, przyjmuj to z&nbsp;zaufaniem. To nie jest o&nbsp;Tobie — to jest
            o&nbsp;tym, że Natalia czuje, kto najlepiej posłuży konkretnemu człowiekowi
            w&nbsp;konkretnej chwili.
          </P>
          <Why>
            <em>Dlaczego musimy to zapisać?</em> Żeby w&nbsp;sytuacji nagłej zmiany
            nikt nie poczuł się skrzywdzony i&nbsp;nie było roszczeń. Wynagrodzenie
            za sesję, której ostatecznie nie prowadzisz, nie przysługuje.
          </Why>
          <P>
            Po zaakceptowaniu rezerwacji przez Zespół HTG <strong>sprawdzasz informację
            o&nbsp;terminie sesji</strong>, w&nbsp;której bierzesz udział. Dopiero z&nbsp;chwilą
            tej informacji powstaje Twoje zobowiązanie do bycia przy sesji.
          </P>
        </Section>

        {/* ── 4. Obecność ── */}
        <Section id="obecnosc" title="4. Co bierzesz na siebie podczas sesji">
          <UL>
            <li><strong>Obecność i&nbsp;punktualność.</strong> Dołączasz do sesji co najmniej 10&nbsp;minut przed jej rozpoczęciem, w&nbsp;gotowości technicznej (kamera i&nbsp;mikrofon).</li>
            <li><strong>Praca w&nbsp;HTG.</strong> Asystujesz Natalii. Nie wprowadzasz własnych narzędzi ani technik bez wcześniejszego ustalenia z&nbsp;Prowadzącą.</li>
            <li><strong>Spokojna przestrzeń.</strong> Sesja odbywa się z&nbsp;miejsca, w&nbsp;którym nikt postronny nie zobaczy ekranu ani nie usłyszy rozmowy.</li>
          </UL>
        </Section>

        {/* ── 5. Zastępstwa ── */}
        <Section id="zastepstwa" title="5. Kiedy nie możesz — powiedz nam">
          <P>
            Jeśli wypadasz z&nbsp;sesji (cokolwiek się dzieje w&nbsp;Twoim życiu),{' '}
            <strong>napisz lub zadzwoń jak najszybciej</strong> — najlepiej do Natalii
            bezpośrednio.
          </P>
          <P>
            <strong>Organizacja zastępstwa należy do Zespołu HTG</strong> — nie szukasz
            zastępcy samodzielnie ani nie przekazujesz sesji innej osobie bez zgody
            Natalii.
          </P>
        </Section>

        {/* ── 6. Rozliczenia ── */}
        <Section id="rozliczenia" title="6. Pieniądze — jak się rozliczamy">
          <P>
            Rozumiemy, że pracujemy w&nbsp;różnych konfiguracjach życiowych
            i&nbsp;podatkowych — dlatego oferujemy <strong>trzy modele rozliczeń</strong>,
            z&nbsp;których jeden ustalamy z&nbsp;Tobą indywidualnie przed pierwszą sesją.
            Wybór modelu potwierdzamy odrębnie (słownie lub mailowo wystarczy).
          </P>
          <UL>
            <li>
              <strong>Bezpośrednio z&nbsp;Klientem</strong> — Klient płaci bezpośrednio
              Tobie. Administrator Serwisu nie pośredniczy w&nbsp;tej płatności i&nbsp;nie
              jest jej stroną. Wszystko, co dalej (dokument księgowy, podatki) — to
              Twoja sprawa, zgodnie z&nbsp;formą prowadzonej przez Ciebie działalności.
            </li>
            <li>
              <strong>Przez nas</strong> — Klient płaci nam przez htgcyou.com.
              Administrator Serwisu po sesji wypłaca Ci ustaloną stawkę na podstawie
              uzgodnień, w&nbsp;zależności od formy współpracy.
            </li>
            <li>
              <strong>Stripe Connect</strong> — Klient płaci przez naszą stronę,
              a&nbsp;system Stripe automatycznie dzieli płatność: część trafia do nas,
              część bezpośrednio na Twoje konto Stripe Connect. Każdy/a rozlicza się
              ze swojej części samodzielnie.
            </li>
          </UL>
          <P>
            Jeśli sesja się nie odbyła (np.&nbsp;Klient się wycofał, Natalia poprowadziła
            ją z&nbsp;kimś innym), wynagrodzenie za nią nie przysługuje.
          </P>
        </Section>

        {/* ── 7. Nagrania ── */}
        <Section id="nagrania" title="7. Nagrania, Twój głos i Twój wizerunek">
          <P>
            Tu musimy być bardzo precyzyjni — przepraszamy za formalny ton w&nbsp;tym
            jednym miejscu, ale to serce naszego regulaminu.
          </P>
          <P>
            Każda sesja jest nagrywana — to integralna część usługi. Klient o&nbsp;tym
            wie i&nbsp;się na to godzi.
          </P>
          <P><strong>Z&nbsp;chwilą rozpoczęcia sesji:</strong></P>
          <UL>
            <li>
              <strong>Wszystkie prawa autorskie</strong> do nagrania, jego treści,
              montażu i&nbsp;wszystkiego, co powstanie w&nbsp;trakcie sesji (również tego,
              co Ty powiesz albo wniesiesz), <strong>należą wyłącznie do Administratora
              Serwisu</strong>, na wszystkich polach eksploatacji, bez ograniczeń czasu
              i&nbsp;terytorium, odpłatnie i&nbsp;nieodpłatnie. Obejmuje to też tłumaczenia
              i&nbsp;wersje językowe.
            </li>
            <li>
              <strong>Sesja HTG odbywa się na poziomie głębokiej świadomości siebie
              i&nbsp;Klienta rozpoznanej przez Natalię</strong> i&nbsp;pozostaje w&nbsp;całości
              własnością Prowadzącej i&nbsp;Administratora Serwisu. Nie zyskujesz do niej
              żadnych praw, w&nbsp;tym praw do jej samodzielnego stosowania, nauczania
              ani przekazywania innym poza Sesjami HTG (zob.&nbsp;pkt&nbsp;11).
            </li>
            <li>
              <strong>Zgadzasz się, żebyśmy używali Twojego wizerunku i&nbsp;głosu</strong>{' '}
              z&nbsp;nagrania — w&nbsp;bibliotece HTG, w&nbsp;social mediach, w&nbsp;materiałach
              edukacyjnych i&nbsp;marketingowych — bez dodatkowego wynagrodzenia poza
              honorarium za samą sesję.
            </li>
          </UL>
          <Why>
            <em>Dlaczego tak ostro?</em> Bo nagrania sesji to najważniejsze, co
            tworzymy w&nbsp;HTG. Dzielimy je dalej, montujemy, publikujemy, sprzedajemy
            w&nbsp;bibliotece — i&nbsp;nie możemy sobie pozwolić, żeby kiedykolwiek pojawiła
            się wątpliwość, czy mamy do tego prawo. To chroni i&nbsp;nas, i&nbsp;Klientów,
            którzy zaufali nam, że ich historia jest w&nbsp;bezpiecznych rękach.
          </Why>
          <P>
            <strong>I&nbsp;jeszcze jedno:</strong> nie nagrywasz sesji samodzielnie.
            Żadnego prywatnego dyktafonu, screen recordera, zrzutów ekranu „dla siebie".
            Oficjalne nagranie robi Zespół HTG i&nbsp;tylko ono istnieje.
          </P>
        </Section>

        {/* ── 8. Poufność ── */}
        <Section id="poufnosc" title="8. Poufność">
          <P>
            Wszystko, co usłyszysz na sesji i&nbsp;wokół sesji — kim jest Klient,
            co przeżywa, co powiedział, co poczuł — <strong>zostaje między nami.
            Na zawsze.</strong>
          </P>
          <P>
            Nie opowiadasz o&nbsp;tym bliskim, nie publikujesz w&nbsp;social mediach,
            nie używasz jako anegdoty na warsztatach. Nawet anonimowo. Nawet po latach.
            Nawet po zakończeniu naszej współpracy.
          </P>
          <P>
            Jeśli chcesz publicznie wspomnieć o&nbsp;tym, że współpracujesz z&nbsp;HTG
            (np.&nbsp;w&nbsp;bio w&nbsp;social mediach), możesz to zrobić wyłącznie
            w&nbsp;formie wcześniej ustalonej z&nbsp;Zespołem HTG.
          </P>
        </Section>

        {/* ── 9. Materiały ── */}
        <Section id="materialy" title="9. Materiały od Klienta — usuń w ciągu 30 dni">
          <P>
            Czasem Klient prześle Ci coś przed sesją: zdjęcie, dokument, opis sytuacji,
            wiadomość. <strong>W&nbsp;ciągu 30&nbsp;dni od sesji usuwasz to wszystko ze
            swojego komputera, telefonu, chmury i&nbsp;skrzynki mailowej.</strong>
          </P>
          <Why>
            <em>Dlaczego?</em> Bo to są dane osobowe drugiego człowieka, powierzone
            nam w&nbsp;zaufaniu. RODO (europejskie przepisy o&nbsp;ochronie danych) wymaga,
            żeby takie materiały nie leżały u&nbsp;nikogo „na wszelki wypadek". Im krócej
            żyją, tym bezpieczniejszy jest Klient — i&nbsp;Ty, gdyby kiedyś zaginął Ci
            telefon.
          </Why>
          <P>
            Jeśli będziemy potrzebować pisemnego potwierdzenia, że to zrobiłaś/eś —
            poprosimy, prześlesz nam krótkiego maila i&nbsp;sprawa załatwiona.
          </P>
        </Section>

        {/* ── 10. Dane ── */}
        <Section id="dane" title="10. Dane Klientów — formalność, ale ważna">
          <P>
            W&nbsp;trakcie sesji masz dostęp do danych osobowych Klienta. Formalnie:{' '}
            <strong>administratorem tych danych jest Administrator Serwisu, a&nbsp;Ty
            przetwarzasz je w&nbsp;naszym imieniu</strong>, wyłącznie po to, żeby
            przeprowadzić sesję. Niniejszy regulamin pełni w&nbsp;tym zakresie funkcję
            umowy powierzenia danych w&nbsp;rozumieniu art.&nbsp;28 RODO.
          </P>
          <P>
            W&nbsp;praktyce znaczy to tyle: dane Klienta są nasze, nie Twoje. Nie używaj
            ich do niczego innego niż sama sesja. Jeśli coś niepokojącego się stanie
            (np.&nbsp;zgubisz telefon, ktoś niepowołany zobaczył ekran) — daj nam znać
            w&nbsp;ciągu 24&nbsp;godzin na <a href="mailto:htg@htg.cyou" className="text-htg-sage hover:underline">htg@htg.cyou</a>.
          </P>
        </Section>

        {/* ── 11. Konkurencja ── */}
        <Section id="konkurencja" title="11. Sesje HTG i zakaz konkurencji">
          <P>
            Prosimy, byś traktowała czas spędzony przy Sesjach HTG jako naukę u&nbsp;źródła —
            ale <strong>nie jako licencję na samodzielne stosowanie zasad Sesji HTG</strong>.
          </P>
          <P>
            Bez pisemnej zgody Natalii nie prowadzisz samodzielnie sesji opartej
            o&nbsp;zasady HTG, nie nazywasz własnych usług nazwami nawiązującymi do HTG,
            nie reklamujesz się jako „prowadząca metody HTG" ani nie wykorzystujesz
            w&nbsp;swojej pracy elementów HTG w&nbsp;sposób mogący wprowadzić Klientów
            w&nbsp;błąd co do pierwowzoru.
          </P>
          <P>
            Możesz oczywiście prowadzić własną, niezależną pracę rozwojową — pod warunkiem,
            że jest wyraźnie Twoja i&nbsp;nie korzysta z&nbsp;naszego know-how.
          </P>
        </Section>

        {/* ── 12. Odpowiedzialność ── */}
        <Section id="odpowiedzialnosc" title="12. Odpowiedzialność i charakter sesji">
          <P>
            Sesje HTG są pracą rozwojową, nie terapią ani diagnozą medyczną. Nie obiecuj
            Klientowi rezultatów ani wyleczeń.
          </P>
          <P>
            Wobec nas odpowiadasz tylko za to, co zrobisz umyślnie albo z&nbsp;rażącego
            niedbalstwa — wszystkie ludzkie pomyłki mieszczą się w&nbsp;zaufaniu, którym
            Cię obdarzamy.
          </P>
        </Section>

        {/* ── 13. Rozstanie ── */}
        <Section id="rozstanie" title="13. Kiedy się rozstajemy">
          <P>
            Współpracę może w&nbsp;każdej chwili zakończyć każda ze stron, bez podawania
            przyczyny i&nbsp;bez wypowiedzenia. Po prostu przestają płynąć zaproszenia
            albo Ty mówisz, że już nie chcesz — i&nbsp;to jest okej.
          </P>
          <P>
            <strong>Po zakończeniu współpracy nadal Cię obowiązują:</strong> poufność
            (pkt&nbsp;8), prawa do nagrań i&nbsp;wizerunku (pkt&nbsp;7), obowiązek
            usunięcia materiałów Klientów (pkt&nbsp;9) i&nbsp;zakaz wykorzystywania
            zasad HTG (pkt&nbsp;11). To jedyne rzeczy, które żyją dłużej niż sama
            współpraca.
          </P>
          <P>
            Administrator Serwisu może zakończyć współpracę ze skutkiem natychmiastowym
            w&nbsp;przypadku rażącego naruszenia regulaminu — w&nbsp;szczególności
            samodzielnego nagrywania sesji, ujawnienia danych Klienta, naruszenia
            poufności lub naruszenia praw autorskich związanych z&nbsp;HTG.
          </P>
        </Section>

        {/* ── 14. Zmiany ── */}
        <Section id="zmiany" title="14. Zmiany regulaminu">
          <P>
            Możemy ten regulamin zmieniać — życie się zmienia, prawo się zmienia,
            my też się uczymy.
          </P>
          <P>
            <strong>O&nbsp;każdej zmianie napiszemy Ci e-maila na adres, którego używasz
            w&nbsp;korespondencji z&nbsp;nami, na co najmniej 14&nbsp;dni przed wejściem
            zmian w&nbsp;życie.</strong> W&nbsp;mailu znajdziesz krótkie podsumowanie
            zmian i&nbsp;nową wersję dokumentu.
          </P>
          <P>
            Jeśli się nie zgadzasz — odpisz, kończymy współpracę przed datą zmian,
            bez żalu z&nbsp;żadnej strony. Jeśli przyjmiesz kolejne zaproszenie do sesji
            po dacie zmian, traktujemy to jako zgodę na nową wersję.
          </P>
          <P>
            Sesje już zrealizowane rozliczamy zawsze według wersji regulaminu z&nbsp;dnia
            sesji.
          </P>
        </Section>

        {/* ── 15. Na koniec ── */}
        <Section id="koniec" title="15. Na koniec">
          <P>
            W&nbsp;sprawach nieuregulowanych obowiązuje prawo polskie. Integralną częścią
            naszej współpracy jest <strong>Regulamin Sesji HTG dla Uczestników</strong>{' '}
            (<a href="/pl/terms" className="text-htg-sage hover:underline">htgcyou.com/pl/terms</a>) —
            akceptując ten dokument, potwierdzasz, że go znasz i&nbsp;że będziesz go
            respektować w&nbsp;zakresie, w&nbsp;jakim dotyczy osób ze strony Zespołu HTG.
          </P>
          <P>
            Wszystkie pytania, wątpliwości, prośby — <a href="mailto:htg@htg.cyou" className="text-htg-sage hover:underline">htg@htg.cyou</a>.
          </P>
          <P>Dziękujemy, że jesteś.</P>
        </Section>

      </div>

      {/* ── Footer note: how to suggest changes ── */}
      <div className="bg-htg-sage/10 border border-htg-sage/30 rounded-xl p-5 mt-12 text-sm text-htg-fg leading-relaxed">
        <p>
          <strong>Chcesz coś dopisać albo zmienić?</strong> Jeśli czytając ten regulamin
          poczułaś/eś, że czegoś tu brakuje albo że jakiś zapis nie pasuje do Twojej
          pracy — napisz do nas: <a href="mailto:htg@htg.cyou" className="text-htg-sage hover:underline font-medium">htg@htg.cyou</a>.
          Naprawdę chcemy, żeby ten dokument był dobry dla obu stron.
        </p>
      </div>
    </div>
  );
}
