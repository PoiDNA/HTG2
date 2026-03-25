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

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-serif font-bold text-htg-fg mb-8">Regulamin</h1>

      <div className="prose-htg space-y-6 text-htg-fg leading-relaxed">
        <h2 className="text-xl font-serif font-semibold mt-8 mb-4">1. Definicje</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Sesja indywidualna</strong> — prywatna sesja na żywo z Natalią HTG i asystentką, prowadzona przez WebRTC. Nagranie trafia wyłącznie do panelu klienta, który rezerwował sesję.</li>
          <li><strong>Sesja grupowa / archiwalna (VOD)</strong> — nagranie z warsztatu lub sesji grupowej, dostępne w ramach pakietów miesięcznych, rocznych lub zakupu pojedynczego.</li>
          <li><strong>Pakiet a la carte</strong> — zakup dostępu do wybranych sesji grupowych. Dostęp na 24 miesiące od zakupu.</li>
          <li><strong>Pakiet miesięczny</strong> — gotowy zestaw sesji z danego miesiąca. Dostęp na 24 miesiące od zakupu.</li>
          <li><strong>Pakiet roczny</strong> — pełny dostęp do katalogu sesji przez 12 miesięcy od zakupu (model wypożyczenia).</li>
        </ul>

        <h2 className="text-xl font-serif font-semibold mt-8 mb-4">2. Model subskrypcji</h2>
        <p>Pakiety a la carte i miesięczne: kupujesz dostęp na 24 miesiące — po zakupie treść jest Twoja na ten okres.</p>
        <p>Pakiet roczny: wypożyczasz pełny katalog na 12 miesięcy. Po upływie roku dostęp wygasa, chyba że przedłużysz subskrypcję.</p>

        <h2 className="text-xl font-serif font-semibold mt-8 mb-4">3. Treści cyfrowe — prawo odstąpienia</h2>
        <p>Zgodnie z art. 38 pkt 13 ustawy o prawach konsumenta, wyrażając zgodę na dostarczenie treści cyfrowych przed upływem terminu na odstąpienie od umowy, tracisz prawo do odstąpienia. Zgoda ta jest wymagana przy każdym zakupie.</p>

        <h2 className="text-xl font-serif font-semibold mt-8 mb-4">4. Sesje indywidualne — odwoływanie</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Zmiana terminu / bezkosztowe anulowanie: najpóźniej 24h przed sesją</li>
          <li>Anulowanie &lt; 24h przed sesją: przedpłata przepada</li>
          <li>Nieobecność bez uprzedzenia: przedpłata przepada</li>
          <li>Odwołanie przez HTG: pełny zwrot lub bezpłatna zmiana terminu</li>
        </ul>

        <h2 className="text-xl font-serif font-semibold mt-8 mb-4">5. Retencja nagrań</h2>
        <p>Nagrania sesji indywidualnych przechowywane są przez 24 miesiące od daty sesji. 30 dni przed usunięciem klient otrzymuje powiadomienie. Po upływie 24 miesięcy nagrania są fizycznie kasowane.</p>
        <p>Nagrania sesji grupowych: dostęp przez okres ważności zakupu (24 miesiące dla a la carte/monthly, 12 miesięcy dla pakietu rocznego).</p>

        <h2 className="text-xl font-serif font-semibold mt-8 mb-4">6. Ograniczenia korzystania</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Nagrania nie mogą być pobierane, kopiowane ani udostępniane osobom trzecim.</li>
          <li>Limit jednoczesnego odtwarzania: 1 urządzenie na konto.</li>
          <li>Limit aktywnych sesji logowania: 3 urządzenia na konto.</li>
        </ul>

        <h2 className="text-xl font-serif font-semibold mt-8 mb-4">7. Klauzula o braku charakteru medycznego</h2>
        <p>Sesje prowadzone w ramach HTG mają charakter rozwojowy i duchowy. Nie stanowią usług medycznych, psychologicznych ani terapeutycznych. Prowadzące nie są lekarzami ani licencjonowanymi terapeutami. W przypadku problemów zdrowotnych skonsultuj się z lekarzem.</p>

        <h2 className="text-xl font-serif font-semibold mt-8 mb-4">8. Płatności</h2>
        <p>Płatności obsługiwane przez Stripe (karty, BLIK, P24). Faktury generowane automatycznie i dostępne w panelu klienta. Możliwa również płatność przelewem tradycyjnym — aktywacja po potwierdzeniu wpłaty przez administratora.</p>

        <h2 className="text-xl font-serif font-semibold mt-8 mb-4">9. Kontakt</h2>
        <p>E-mail: sesje@htg.cyou</p>
      </div>
    </div>
  );
}
