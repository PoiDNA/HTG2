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
        Regulamin Sesji Hacking&nbsp;The&nbsp;Game
      </h1>
      <p className="text-htg-fg-muted text-sm mb-8">Warszawa, 01 marca 2023 r. | Aktualizacja: marzec 2026</p>

      {/* ── Table of Contents ── */}
      <nav className="bg-htg-card border border-htg-card-border rounded-xl p-5 mb-10">
        <p className="text-sm font-semibold text-htg-fg mb-3">Spis treści</p>
        <ol className="columns-1 md:columns-2 gap-6 text-sm text-htg-fg-muted space-y-1">
          {[
            ['definicje', '1. Definicje'],
            ['oplaty', '2. Opłaty i zwroty'],
            ['zmiana-terminu', '3. Zmiana terminu'],
            ['zastrzezenia', '4. Zastrzeżenia medyczne'],
            ['prawa-autorskie', '5. Prawa autorskie'],
            ['pola-eksploatacji', '6. Pola eksploatacji'],
            ['wlasnosc', '7. Własność nagrań'],
            ['zakaz', '8. Zakaz upubliczniania'],
            ['edycja', '9. Prośba o edycję nagrania'],
            ['platnosci', '10. Płatności'],
            ['oswiadczenia', '11. Oświadczenia i zgody'],
            ['prywatnosc', '12. Ochrona prywatności'],
            ['odpowiedzialnosc', '13. Ograniczenie odpowiedzialności'],
            ['sila-wyzsza', '14. Siła wyższa'],
            ['zmiany', '15. Zmiany regulaminu'],
            ['postanowienia', '16. Postanowienia końcowe'],
          ].map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="hover:text-htg-sage transition-colors">{label}</a>
            </li>
          ))}
        </ol>
      </nav>

      {/* ── Content ── */}
      <div className="space-y-2">
        <Section id="definicje" title="1. Definicje">
          <UL>
            <li><strong>Sesja HTG</strong> — konsultacja prowadzona przez dwie osoby w ramach inicjatywy Hacking&nbsp;The&nbsp;Game (serwisy YouTube oraz htgcyou.com), mająca na celu rozwój osobisty, z udziałem osoby posługującej się postrzeganiem pozazmysłowym.</li>
            <li><strong>Operator</strong> — Pilot PSA z siedzibą w Warszawie, ul.&nbsp;RONDO ONZ&nbsp;1, 00-124 Warszawa, NIP&nbsp;5253085101, REGON&nbsp;544401249 — administrator Sesji HTG.</li>
            <li><strong>Uczestnik</strong> — osoba fizyczna zawierająca umowę o świadczenie Sesji HTG.</li>
            <li><strong>Zespół HTG</strong> — osoby prowadzące Sesje HTG, posługujące się adresami e‑mail w domenie @htg.cyou.</li>
            <li><strong>Dzień roboczy</strong> — poniedziałek–piątek z wyłączeniem dni ustawowo wolnych od pracy.</li>
          </UL>
        </Section>

        <Section id="oplaty" title="2. Opłaty i zwroty">
          <UL>
            <li>Sesja HTG jest opłacana z góry.</li>
            <li>Umowa zostaje zawarta z momentem zaksięgowania pełnej opłaty.</li>
            <li>Brak zapłaty w ciągu 24&nbsp;h od złożenia zamówienia anuluje rezerwację.</li>
            <li>Uczestnik ma <strong>14 dni</strong> na odstąpienie od umowy bez podania przyczyny (e‑mail: htg@htg.cyou).</li>
            <li>Jeżeli Sesja HTG zostanie w pełni wykonana przed upływem 14 dni, prawo odstąpienia wygasa.</li>
          </UL>
        </Section>

        <Section id="zmiana-terminu" title="3. Zmiana terminu">
          <UL>
            <li>Termin Sesji HTG uzgadniany jest po opłaceniu sesji.</li>
            <li>Jednorazowa zmiana terminu możliwa <strong>najpóźniej 7 dni</strong> przed planowaną datą.</li>
            <li>Zespół HTG proponuje pierwszy wolny termin; czas oczekiwania może wynosić 6–8 miesięcy.</li>
            <li>Usługodawca może przesunąć Sesję z ważnych przyczyn, proponując alternatywną datę.</li>
            <li>Jeśli zaproponowany termin nie odpowiada Uczestnikowi, może on przyjąć voucher ważny 12&nbsp;miesięcy.</li>
          </UL>
        </Section>

        <Section id="zastrzezenia" title="4. Zastrzeżenia medyczne">
          <Info>
            Prowadzący <strong>nie są lekarzami</strong> — nie udzielają porad medycznych ani diagnoz. Sesje HTG mają charakter wyłącznie rozwoju osobistego i nie zastępują profesjonalnej pomocy medycznej ani terapii.
          </Info>
        </Section>

        <Section id="prawa-autorskie" title="5. Prawa autorskie">
          <UL>
            <li>Wszystkie prawa osobiste i majątkowe związane z wykonaniem Sesji HTG należą do osób prowadzących sesję.</li>
            <li>Uczestnik, w momencie zapłaty, udziela prowadzącym licencji na opublikowanie sesji wedle ich uznania.</li>
          </UL>
        </Section>

        <Section id="pola-eksploatacji" title="6. Pola eksploatacji">
          <UL>
            <li>Publikacja w internecie, w tym na stronach www i w mediach społecznościowych.</li>
            <li>Używanie w materiałach informacyjnych.</li>
            <li>Wykorzystywanie w celach edukacyjnych.</li>
          </UL>
        </Section>

        <Section id="wlasnosc" title="7. Własność nagrań">
          <P>Sesja w postaci nagrania audio i wideo staje się własnością prowadzących Sesję HTG w momencie zapłaty.</P>
          <P>Nagranie jest udostępniane Uczestnikowi w panelu klienta w ciągu 7&nbsp;dni od sesji i ma charakter poufny.</P>
        </Section>

        <Section id="zakaz" title="8. Zakaz upubliczniania">
          <UL>
            <li>Zabrania się upubliczniania własnej sesji oraz sesji nieopublikowanych bez pisemnej zgody Zespołu HTG.</li>
            <li>Zakaz obejmuje media społecznościowe i udostępnianie osobom trzecim.</li>
            <li>Emisja zmontowanej sesji (np. na YouTube, htgcyou.com) może być związana z opłatami obniżającymi koszty organizacji Sesji HTG.</li>
          </UL>
        </Section>

        <Section id="edycja" title="9. Prośba o edycję nagrania">
          <P>Prośbę o wycięcie fragmentu Sesji HTG z publikacji można zgłosić do <strong>3 dni</strong> od dnia odbycia sesji.</P>
        </Section>

        <Section id="platnosci" title="10. Płatności">
          <UL>
            <li>Płatność za Sesję HTG odbywa się poprzez stronę htgcyou.com (Stripe — karty, BLIK, P24), przelew lub gotówkę.</li>
            <li>Przetwarzanie płatności obsługuje Pilot PSA.</li>
            <li>Faktury generowane automatycznie — dostępne w panelu klienta i wysyłane e-mailem.</li>
          </UL>
        </Section>

        <Section id="oswiadczenia" title="11. Oświadczenia i zgody">
          <UL>
            <li>Uczestnik bierze pełną odpowiedzialność za decyzje i działania podjęte na podstawie informacji uzyskanych w trakcie Sesji HTG.</li>
            <li>Prowadzący nie ponoszą odpowiedzialności za szkody wynikłe z uczestnictwa w Sesji HTG.</li>
            <li>Uczestnik zapewnia stabilne łącze internetowe, kamerę i mikrofon.</li>
            <li>Opóźnienie powyżej 15&nbsp;minut ze strony Uczestnika nie przedłuża Sesji ani nie uprawnia do zwrotu.</li>
          </UL>
        </Section>

        <Section id="prywatnosc" title="12. Ochrona prywatności">
          <P>Prowadzący zobowiązują się do ochrony prywatności uczestników zgodnie z RODO. Dane osobowe przetwarzane są wyłącznie w celu realizacji Sesji HTG. Szczegóły w <a href="/pl/privacy" className="text-htg-sage hover:underline">Polityce Prywatności</a>.</P>
        </Section>

        <Section id="odpowiedzialnosc" title="13. Ograniczenie odpowiedzialności">
          <UL>
            <li>Prowadzący nie ponoszą odpowiedzialności za decyzje zdrowotne, finansowe, zawodowe ani osobiste podjęte na podstawie sesji.</li>
            <li>Prowadzący nie gwarantują osiągnięcia określonych rezultatów.</li>
            <li>Łączna odpowiedzialność ograniczona jest do wysokości ceny Sesji.</li>
          </UL>
        </Section>

        <Section id="sila-wyzsza" title="14. Siła wyższa">
          <P>Strony nie odpowiadają za niewykonanie zobowiązań spowodowane siłą wyższą (zdarzenia nadzwyczajne, nieprzewidywalne i niezależne od stron).</P>
        </Section>

        <Section id="zmiany" title="15. Zmiany regulaminu">
          <UL>
            <li>Operator może zmienić regulamin z ważnych przyczyn (np. zmiana przepisów prawa). Zmiany publikowane są na htgcyou.com.</li>
            <li>Uczestnicy, którzy nie akceptują zmian, mogą zrezygnować z sesji i uzyskać zwrot kosztów za niewykorzystane sesje.</li>
          </UL>
        </Section>

        <Section id="postanowienia" title="16. Postanowienia końcowe">
          <UL>
            <li>W sprawach nieuregulowanych zastosowanie mają przepisy prawa polskiego.</li>
            <li>Spory będą rozstrzygane przez sąd właściwy dla siedziby Operatora.</li>
            <li>Regulamin wchodzi w życie z dniem opublikowania na htgcyou.com.</li>
          </UL>
        </Section>

        {/* ── Reklamacje ── */}
        <Section id="reklamacje" title="17. Reklamacje">
          <UL>
            <li>Reklamacje należy zgłaszać na adres: <strong>htg@htg.cyou</strong> w ciągu 14 dni od zdarzenia.</li>
            <li>Rozpatrzenie reklamacji następuje w ciągu 30 dni.</li>
          </UL>
        </Section>

        {/* ── Wzór odstąpienia ── */}
        <div className="mt-12 border-t border-htg-card-border pt-8">
          <h2 className="text-lg font-serif font-semibold text-htg-fg mb-4">
            Załącznik — Wzór oświadczenia o odstąpieniu od umowy
          </h2>
          <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 text-sm text-htg-fg font-mono leading-relaxed space-y-2">
            <p><strong>Tytuł maila:</strong> Rezygnacja z sesji</p>
            <p className="mt-3">Ja, [imię i nazwisko], niniejszym informuję o moim odstąpieniu od umowy o pojedynczą Sesję HTG zawartą w dniu opłacenia sesji.</p>
            <p className="mt-2">Data wpłaty: ___/___/20__</p>
            <p>Imię i nazwisko: ___________________</p>
            <p>Adres: _____________________________</p>
            <p>E‑mail: _____________________________</p>
            <p>Podpis (tylko wersja papierowa / skan)</p>
            <p>Data: ___/___/20__</p>
          </div>
        </div>

        {/* ── Kontakt ── */}
        <div className="mt-10 bg-htg-surface rounded-xl p-6 text-center">
          <p className="text-sm text-htg-fg-muted mb-1">Kontakt w sprawie regulaminu:</p>
          <p className="font-semibold text-htg-fg">htg@htg.cyou</p>
          <p className="text-xs text-htg-fg-muted mt-2">Pilot PSA · NIP 525-308-51-01 · REGON 544401249</p>
          <p className="text-xs text-htg-fg-muted">ul. RONDO ONZ 1, 00-124 Warszawa</p>
        </div>
      </div>
    </div>
  );
}
