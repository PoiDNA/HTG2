import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const metadata = {
  title: 'Regulamin Tłumacza · HTG',
};

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
    <div className="border-l-2 border-htg-indigo/40 pl-4 my-4 text-sm text-htg-fg-muted italic leading-relaxed">
      {children}
    </div>
  );
}

export default async function TranslatorTermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl md:text-4xl font-serif font-bold text-htg-fg mb-2">
        Nasza umowa współpracy
      </h1>
      <p className="text-htg-fg-muted text-sm mb-2">Regulamin Tłumacza/ki Sesji&nbsp;HTG</p>
      <p className="text-htg-fg-muted text-sm mb-8">Wersja 1.0 · obowiązuje od 14&nbsp;kwietnia 2026&nbsp;r.</p>

      {/* Intro */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-5 mb-10 text-sm text-htg-fg leading-relaxed">
        <p className="mb-3">Witaj.</p>
        <p className="mb-3">
          Dziękujemy, że jesteś. Twoja praca sprawia, że Sesje HTG mogą dotrzeć do
          osób, które mówią w&nbsp;innym języku — i&nbsp;to jest naprawdę ważne.
        </p>
        <p className="mb-3">
          Ten dokument jest naszą umową. Napisaliśmy go tak, jak się rozmawia:
          po ludzku, ale bez pomijania rzeczy, które muszą być zapisane.
        </p>
        <p className="mb-3">
          <strong>Po co on w ogóle jest?</strong> Pracujemy z osobami w bardzo
          intymnych momentach ich życia. Polskie prawo wymaga, żebyśmy mieli
          jasne zasady z każdą osobą, która uczestniczy w tych sesjach — w tym
          z Tobą jako tłumaczem/ką. To chroni Klientów, Ciebie i nas.
        </p>
        <p>
          Pytania? Napisz: <a href="mailto:htg@htg.cyou" className="text-htg-indigo hover:underline">htg@htg.cyou</a>.
        </p>
      </div>

      {/* Table of contents */}
      <nav className="bg-htg-card border border-htg-card-border rounded-xl p-5 mb-10">
        <p className="text-sm font-semibold text-htg-fg mb-3">Spis treści</p>
        <ol className="columns-1 md:columns-2 gap-6 text-sm text-htg-fg-muted space-y-1">
          {[
            ['kim-jestesmy', '1. Kim jesteśmy'],
            ['charakter', '2. Charakter naszej współpracy'],
            ['rola', '3. Twoja rola podczas sesji'],
            ['obecnosc', '4. Obecność i gotowość techniczna'],
            ['zastepstwa', '5. Kiedy nie możesz — powiedz nam'],
            ['rozliczenia', '6. Rozliczenia'],
            ['nagrania', '7. Nagrania i prawa autorskie'],
            ['poufnosc', '8. Poufność'],
            ['materialy', '9. Materiały od Klienta — usuń w 30 dni'],
            ['dane', '10. Dane osobowe Klientów'],
            ['platforma', '11. Tłumaczenia platformy'],
            ['odpowiedzialnosc', '12. Odpowiedzialność'],
            ['rozstanie', '13. Kiedy się rozstajemy'],
            ['zmiany', '14. Zmiany regulaminu'],
            ['koniec', '15. Na koniec'],
          ].map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="hover:text-htg-indigo transition-colors">{label}</a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-2">

        {/* 1. Kim jesteśmy */}
        <Section id="kim-jestesmy" title="1. Kim jesteśmy">
          <UL>
            <li><strong>Administrator Serwisu</strong> — Pilot&nbsp;PSA, ul.&nbsp;Rondo&nbsp;ONZ&nbsp;1, 00-124&nbsp;Warszawa, NIP&nbsp;5253085101. To z nami podpisujesz tę umowę.</li>
            <li><strong>Natalia (Prowadząca)</strong> — autorka i osoba prowadząca każdą Sesję HTG.</li>
            <li><strong>Tłumacz/ka</strong> — Ty. Osoba, która świadczy usługę tłumaczenia lub interpretacji podczas sesji i/lub tłumaczy treści platformy HTG na przypisany język.</li>
            <li><strong>Klient</strong> — osoba, która zarezerwowała sesję i z którą wspólnie pracujecie.</li>
            <li><strong>Sesja HTG</strong> — sesja odbywająca się na poziomie głębokiej świadomości siebie i Klienta, rozpoznanej przez Natalię.</li>
            <li><strong>Regulamin Użytkowników</strong> — regulamin akceptowany przez Klientów, dostępny na <a href="/pl/terms" className="text-htg-indigo hover:underline">htgcyou.com/pl/terms</a>. Obowiązuje również Ciebie w zakresie poufności, sposobu nagrywania i charakteru sesji.</li>
          </UL>
        </Section>

        {/* 2. Charakter */}
        <Section id="charakter" title="2. Charakter naszej współpracy">
          <P>
            Jesteś z nami jako niezależna osoba, nie jako pracownik. Każda sesja
            wymagająca tłumaczenia to osobne zaproszenie — przyjmujesz je albo nie,
            my zapraszamy albo nie, bez urazy z żadnej strony.
          </P>
          <P>
            Nasza współpraca opiera się na wzajemnym zaufaniu: Ty zapewniasz
            rzetelność i jakość tłumaczenia, my zapewniamy Ci dostęp do sesji,
            platformy i terminarz z odpowiednim wyprzedzeniem.
          </P>
          <Why>
            <em>Dlaczego tak?</em> Bo sesje rodzą się z intuicji Natalii, a potrzeba
            konkretnego języka zależy od tego, kto aktualnie jest Klientem. Nie
            możemy planować z rocznym wyprzedzeniem — ale możemy być ze sobą szczerzy.
          </Why>
        </Section>

        {/* 3. Rola */}
        <Section id="rola" title="3. Twoja rola podczas sesji">
          <P>
            Twoją rolą jest rzetelna i precyzyjna interpretacja tego, co mówi
            Natalia i Klient — w trybie symultanicznym lub konsekutywnym, w
            zależności od ustaleń. Nie interpretujesz, nie komentujesz, nie
            dodajesz od siebie treści merytorycznych.
          </P>
          <UL>
            <li><strong>Wierność przekazu.</strong> Tłumaczysz sens, intencję i emocjonalny ton wypowiedzi — nie tylko słowa. W sesji liczy się każdy niuans.</li>
            <li><strong>Neutralność.</strong> Nie oceniasz Klienta, nie wyrażasz opinii o treści sesji podczas jej trwania ani po niej.</li>
            <li><strong>Dyskrecja.</strong> Nie ingerujesz w przebieg sesji poza swoją rolą tłumaczenia, chyba że Natalia Cię o to poprosi.</li>
          </UL>
          <Why>
            <em>Dlaczego to piszemy?</em> Bo sesja to przestrzeń zaufania Klienta.
            Każde niepotrzebne słowo od strony Zespołu — w tym tłumacza — może tę
            przestrzeń naruszyć. Twoja niewidzialność jest jednym z naszych zobowiązań wobec Klienta.
          </Why>
        </Section>

        {/* 4. Obecność */}
        <Section id="obecnosc" title="4. Obecność i gotowość techniczna">
          <UL>
            <li><strong>Punktualność.</strong> Dołączasz do sesji co najmniej 10&nbsp;minut przed jej rozpoczęciem, z działającą kamerą i mikrofonem.</li>
            <li><strong>Stabilne połączenie.</strong> Zapewniasz łącze internetowe wystarczające do wideo-rozmowy bez zakłóceń.</li>
            <li><strong>Spokojna przestrzeń.</strong> Sesja odbywa się z miejsca, w którym nikt postronny nie zobaczy ekranu ani nie usłyszy rozmowy.</li>
            <li><strong>Gotowość językowa.</strong> Przed sesją zapoznajesz się z dostępnymi informacjami o jej temacie (jeśli Natalia je udostępniła), żeby zapewnić jak najwyższą jakość tłumaczenia specjalistycznej terminologii.</li>
          </UL>
        </Section>

        {/* 5. Zastępstwa */}
        <Section id="zastepstwa" title="5. Kiedy nie możesz — powiedz nam">
          <P>
            Jeśli wypadasz z sesji —{' '}
            <strong>napisz lub zadzwoń jak najszybciej</strong>, najlepiej bezpośrednio
            do osoby koordynującej w Zespole HTG.
          </P>
          <P>
            <strong>Organizacja zastępstwa należy do Zespołu HTG</strong> — nie szukasz
            zastępcy samodzielnie ani nie przekazujesz sesji innej osobie bez naszej zgody.
          </P>
        </Section>

        {/* 6. Rozliczenia */}
        <Section id="rozliczenia" title="6. Rozliczenia">
          <P>
            Stawkę za sesję ustalamy indywidualnie przed pierwszą sesją i potwierdzamy
            mailowo lub słownie. Możliwe modele:
          </P>
          <UL>
            <li><strong>Stawka za sesję</strong> — stała kwota za każdą przeprowadzoną sesję, płatna po jej zakończeniu lub w cyklu miesięcznym, według uzgodnień.</li>
            <li><strong>Przez nas</strong> — Administrator Serwisu wypłaca Ci ustaloną kwotę na podstawie faktury lub innego dokumentu zgodnego z Twoją formą działalności.</li>
          </UL>
          <P>
            Jeśli sesja się nie odbyła z przyczyn niezależnych od Ciebie (np. Klient
            odwołał, Natalia zmieniła skład) — należy Ci się uzgodnione wcześniej
            wynagrodzenie za gotowość, jeśli zostało to odrębnie ustalone. W braku
            takiego ustalenia wynagrodzenie za niezrealizowaną sesję nie przysługuje.
          </P>
        </Section>

        {/* 7. Nagrania */}
        <Section id="nagrania" title="7. Nagrania i prawa autorskie do tłumaczenia">
          <P>
            Tu musimy być precyzyjni. Każda sesja jest nagrywana — Klient o tym wie
            i wyraża na to zgodę.
          </P>
          <P><strong>Z chwilą rozpoczęcia sesji:</strong></P>
          <UL>
            <li>
              <strong>Wszystkie prawa autorskie</strong> do nagrania — w tym do
              tłumaczenia wykonanego przez Ciebie w jego trakcie — należą wyłącznie
              do Administratora Serwisu, na wszystkich polach eksploatacji, bez
              ograniczeń czasu i terytorium, odpłatnie i nieodpłatnie.
            </li>
            <li>
              <strong>Tłumaczenia pisemne</strong> (napisy, transkrypcje, opisy)
              wykonane na zlecenie HTG są w całości własnością Administratora Serwisu
              od momentu ich przekazania.
            </li>
            <li>
              <strong>Zgadzasz się, żebyśmy używali Twojego głosu</strong> z nagrania
              sesji — w bibliotece HTG, w materiałach edukacyjnych, w wersjonowanych
              kopiach nagrania — bez dodatkowego wynagrodzenia poza honorarium za sesję.
            </li>
          </UL>
          <P>
            <strong>Nie nagrywasz sesji samodzielnie.</strong> Żadnego prywatnego
            dyktafonu, screen recordera, zrzutów ekranu. Oficjalne nagranie robi
            Zespół HTG i tylko ono istnieje.
          </P>
          <Why>
            <em>Dlaczego to jest ważne?</em> Nagrania sesji to wrażliwe materiały —
            zarówno dla Klientów, jak i dla Prowadzącej. Musimy mieć pewność, że
            żadna ich kopia nie krąży poza systemem HTG.
          </Why>
        </Section>

        {/* 8. Poufność */}
        <Section id="poufnosc" title="8. Poufność">
          <P>
            Wszystko, co usłyszysz podczas sesji i w związku z nią — kim jest
            Klient, co przeżywa, co powiedział, co poczuł — <strong>zostaje między
            nami. Na zawsze.</strong>
          </P>
          <P>
            Nie opowiadasz o tym nikomu, nie publikujesz w social mediach, nie
            używasz jako przykładu na szkoleniach. Nawet anonimowo. Nawet po
            zakończeniu naszej współpracy.
          </P>
          <P>
            Jeśli chcesz publicznie wspomnieć o tym, że współpracujesz z HTG
            (np. w bio), możesz to zrobić wyłącznie w formie uzgodnionej z Zespołem HTG.
          </P>
        </Section>

        {/* 9. Materiały */}
        <Section id="materialy" title="9. Materiały od Klienta — usuń w ciągu 30 dni">
          <P>
            Czasem Klient lub Natalia prześlą Ci materiały przed sesją: opis tematu,
            słownik pojęć, dokumenty. <strong>W ciągu 30&nbsp;dni od sesji usuwasz
            to wszystko ze swojego komputera, telefonu, chmury i skrzynki mailowej.</strong>
          </P>
          <Why>
            <em>Dlaczego?</em> To są dane osobowe, powierzone nam w zaufaniu. RODO
            wymaga, żeby takie materiały nie leżały u nikogo dłużej niż trzeba.
            Im krócej żyją, tym bezpieczniejszy jest Klient — i Ty.
          </Why>
        </Section>

        {/* 10. Dane */}
        <Section id="dane" title="10. Dane osobowe Klientów — formalność, ale ważna">
          <P>
            W trakcie sesji masz dostęp do danych osobowych Klienta. Formalnie:{' '}
            <strong>administratorem tych danych jest Administrator Serwisu, a Ty
            przetwarzasz je w naszym imieniu</strong> — wyłącznie w celu wykonania
            tłumaczenia. Niniejszy regulamin pełni funkcję umowy powierzenia danych
            w rozumieniu art.&nbsp;28 RODO.
          </P>
          <P>
            W praktyce: danych Klienta nie używasz do niczego innego niż sama sesja.
            Jeśli wydarzy się coś niepokojącego (zgubiony telefon, wgląd osoby
            postronnej) — daj nam znać w ciągu 24&nbsp;godzin na{' '}
            <a href="mailto:htg@htg.cyou" className="text-htg-indigo hover:underline">htg@htg.cyou</a>.
          </P>
        </Section>

        {/* 11. Tłumaczenia platformy */}
        <Section id="platforma" title="11. Tłumaczenia platformy HTG">
          <P>
            Jeśli Twoja współpraca obejmuje tłumaczenie lub weryfikację treści
            platformy htgcyou.com (teksty UI, komunikaty, opisy), obowiązują
            Cię dodatkowo poniższe zasady:
          </P>
          <UL>
            <li>
              <strong>Jakość i spójność.</strong> Tłumaczenia zachowują ton i styl
              platformy HTG — spokojny, ludzki, wolny od żargonu.
            </li>
            <li>
              <strong>Korekty przez system.</strong> Sugestie poprawek zgłaszasz
              przez panel tłumacza w htgcyou.com. Nie edytujesz bezpośrednio
              plików kodu ani nie kontaktujesz się z deweloperami poza ustalonymi
              kanałami.
            </li>
            <li>
              <strong>Własność tłumaczeń.</strong> Wszystkie tłumaczenia platformy
              wykonane przez Ciebie stają się własnością Administratora Serwisu
              z chwilą ich przekazania, na takich samych zasadach jak nagrania sesji
              (zob. pkt&nbsp;7).
            </li>
          </UL>
        </Section>

        {/* 12. Odpowiedzialność */}
        <Section id="odpowiedzialnosc" title="12. Odpowiedzialność">
          <P>
            Sesje HTG są pracą rozwojową, nie terapią ani diagnozą medyczną. Twoja
            rola to tłumaczenie — nie jesteś odpowiedzialny/a za treść merytoryczną
            sesji ani za efekty pracy Natalii z Klientem.
          </P>
          <P>
            Wobec nas odpowiadasz za to, co zrobisz umyślnie lub z rażącego
            niedbalstwa — w szczególności za naruszenie poufności, samodzielne
            nagrywanie lub ujawnienie danych Klienta.
          </P>
        </Section>

        {/* 13. Rozstanie */}
        <Section id="rozstanie" title="13. Kiedy się rozstajemy">
          <P>
            Współpracę może w każdej chwili zakończyć każda ze stron, bez podawania
            przyczyny i bez wypowiedzenia. Po prostu przestają płynąć zaproszenia
            albo Ty mówisz, że już nie chcesz — i to jest okej.
          </P>
          <P>
            <strong>Po zakończeniu współpracy nadal Cię obowiązują:</strong> poufność
            (pkt&nbsp;8), prawa do nagrań i tłumaczeń (pkt&nbsp;7), obowiązek usunięcia
            materiałów Klientów (pkt&nbsp;9). To jedyne rzeczy, które żyją dłużej
            niż sama współpraca.
          </P>
          <P>
            Administrator Serwisu może zakończyć współpracę ze skutkiem natychmiastowym
            w przypadku rażącego naruszenia regulaminu — w szczególności samodzielnego
            nagrywania sesji, ujawnienia danych Klienta lub naruszenia poufności.
          </P>
        </Section>

        {/* 14. Zmiany */}
        <Section id="zmiany" title="14. Zmiany regulaminu">
          <P>
            Możemy ten regulamin zmieniać — prawo się zmienia, my też się uczymy.
          </P>
          <P>
            <strong>O każdej zmianie napiszemy Ci e-maila na co najmniej 14&nbsp;dni
            przed wejściem zmian w życie.</strong> Jeśli nie zgadzasz się na nową
            wersję — odpisz, kończymy współpracę przed datą zmian, bez żalu.
            Jeśli przyjmiesz kolejne zaproszenie do sesji po dacie zmian, traktujemy
            to jako zgodę na nową wersję.
          </P>
        </Section>

        {/* 15. Na koniec */}
        <Section id="koniec" title="15. Na koniec">
          <P>
            W sprawach nieuregulowanych obowiązuje prawo polskie. Integralną częścią
            naszej współpracy jest <strong>Regulamin Sesji HTG dla Uczestników</strong>{' '}
            (<a href="/pl/terms" className="text-htg-indigo hover:underline">htgcyou.com/pl/terms</a>)
            — akceptując ten dokument, potwierdzasz, że go znasz i że będziesz go
            respektować w zakresie dotyczącym osób ze strony Zespołu HTG.
          </P>
          <P>
            Wszystkie pytania, wątpliwości, prośby —{' '}
            <a href="mailto:htg@htg.cyou" className="text-htg-indigo hover:underline">htg@htg.cyou</a>.
          </P>
          <P>Dziękujemy, że jesteś.</P>
        </Section>

      </div>

      <div className="bg-htg-indigo/10 border border-htg-indigo/30 rounded-xl p-5 mt-12 text-sm text-htg-fg leading-relaxed">
        <p>
          <strong>Chcesz coś dopisać albo zmienić?</strong> Jeśli czytając ten
          regulamin poczułeś/aś, że czegoś tu brakuje — napisz do nas:{' '}
          <a href="mailto:htg@htg.cyou" className="text-htg-indigo hover:underline font-medium">htg@htg.cyou</a>.
          Chcemy, żeby ten dokument był dobry dla obu stron.
        </p>
      </div>
    </div>
  );
}
