import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n-config';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Legal' });
  return { title: t('privacy_title') };
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-serif font-bold text-htg-fg mb-8">Polityka prywatności</h1>

      <div className="prose-htg space-y-6 text-htg-fg leading-relaxed">
        <h2 className="text-xl font-serif font-semibold mt-8 mb-4">1. Administrator danych</h2>
        <p>Administratorem Twoich danych osobowych jest HTG z siedzibą w Polsce. Kontakt: sesje@htg.cyou.</p>

        <h2 className="text-xl font-serif font-semibold mt-8 mb-4">2. Cele przetwarzania</h2>
        <p>Twoje dane przetwarzamy w celu:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Świadczenia usługi sesji rozwoju duchowego (podstawa: art. 6 ust. 1 lit. b RODO)</li>
          <li>Przetwarzania danych szczególnej kategorii dotyczących przekonań i stanu zdrowia (podstawa: art. 9 ust. 2 lit. a RODO — wyraźna zgoda)</li>
          <li>Obsługi płatności i wystawiania faktur (podstawa: art. 6 ust. 1 lit. c RODO)</li>
          <li>Komunikacji e-mailowej związanej z usługą (podstawa: art. 6 ust. 1 lit. f RODO)</li>
        </ul>

        <h2 className="text-xl font-serif font-semibold mt-8 mb-4">3. Dane szczególnej kategorii (art. 9 RODO)</h2>
        <p>Sesje rozwoju duchowego mogą dotyczyć przekonań, światopoglądu i zdrowia. Przetwarzanie tych danych odbywa się wyłącznie na podstawie Twojej wyraźnej zgody, którą możesz w każdej chwili wycofać w panelu klienta.</p>

        <h2 className="text-xl font-serif font-semibold mt-8 mb-4">4. Odbiorcy danych</h2>
        <p>Twoje dane mogą być przekazywane następującym podmiotom:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Stripe — obsługa płatności i fakturowania</li>
          <li>Supabase — przechowywanie danych i uwierzytelnianie</li>
          <li>Bunny.net — przechowywanie i streaming nagrań</li>
          <li>Vercel — hosting aplikacji</li>
          <li>Cloudflare — DNS, CDN i ochrona DDoS</li>
          <li>Resend — wysyłka e-maili transakcyjnych</li>
        </ul>

        <h2 className="text-xl font-serif font-semibold mt-8 mb-4">5. Retencja danych</h2>
        <p>Nagrania sesji indywidualnych: przechowywane maksymalnie 24 miesiące od daty sesji, po czym są fizycznie kasowane. 30 dni przed usunięciem otrzymasz powiadomienie e-mailem.</p>
        <p>Dane konta: przechowywane do momentu usunięcia konta przez użytkownika.</p>

        <h2 className="text-xl font-serif font-semibold mt-8 mb-4">6. Twoje prawa</h2>
        <p>Przysługuje Ci prawo do: dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, przenoszenia danych, sprzeciwu wobec przetwarzania oraz wycofania zgody. Kontakt: sesje@htg.cyou.</p>

        <h2 className="text-xl font-serif font-semibold mt-8 mb-4">7. Pliki cookies</h2>
        <p>Używamy wyłącznie niezbędnych plików cookies do działania serwisu (uwierzytelnianie, preferencje językowe i motywu). Nie stosujemy cookies reklamowych ani analitycznych firm trzecich.</p>

        <h2 className="text-xl font-serif font-semibold mt-8 mb-4">8. Monitoring sesji</h2>
        <p>W celu ochrony przed nieautoryzowanym udostępnianiem, monitorujemy liczbę aktywnych sesji uwierzytelniania (limit 3 urządzenia) oraz liczbę jednoczesnych odtwarzań (limit 1 urządzenie).</p>
      </div>
    </div>
  );
}
