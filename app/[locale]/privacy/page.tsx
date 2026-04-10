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

/* ── Shared components ── */
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

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl md:text-4xl font-serif font-bold text-htg-fg mb-2">
        Polityka Prywatności
      </h1>
      <p className="text-htg-fg-muted text-sm mb-8">PILOT Prosta Spółka Akcyjna · Wersja 1.0</p>

      <div className="space-y-2">
        <Section id="administrator" title="1. Administrator danych">
          <div className="bg-htg-card border border-htg-card-border rounded-xl p-5 mb-4">
            <p className="font-semibold text-htg-fg">Pilot PSA</p>
            <p className="text-sm text-htg-fg-muted mt-1">ul. RONDO ONZ 1, 00-124 Warszawa</p>
            <p className="text-sm text-htg-fg-muted">NIP 525-308-51-01 · REGON 544401249</p>
            <p className="text-sm text-htg-fg-muted mt-1">E-mail: <a href="mailto:htg@htg.cyou" className="text-htg-sage hover:underline">htg@htg.cyou</a></p>
          </div>
        </Section>

        <Section id="dane" title="2. Jakie dane zbieramy">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-htg-card-border rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-htg-surface">
                  <th className="text-left p-3 font-medium text-htg-fg border-b border-htg-card-border">Kategoria</th>
                  <th className="text-left p-3 font-medium text-htg-fg border-b border-htg-card-border">Przykłady</th>
                  <th className="text-left p-3 font-medium text-htg-fg border-b border-htg-card-border">Źródło</th>
                </tr>
              </thead>
              <tbody className="text-htg-fg">
                <tr className="border-b border-htg-card-border">
                  <td className="p-3">Dane identyfikacyjne</td>
                  <td className="p-3 text-htg-fg-muted">imię, nazwisko, adres</td>
                  <td className="p-3 text-htg-fg-muted">formularz rezerwacji</td>
                </tr>
                <tr className="border-b border-htg-card-border">
                  <td className="p-3">Dane kontaktowe</td>
                  <td className="p-3 text-htg-fg-muted">e-mail, telefon</td>
                  <td className="p-3 text-htg-fg-muted">formularz / korespondencja</td>
                </tr>
                <tr className="border-b border-htg-card-border">
                  <td className="p-3">Dane rozliczeniowe</td>
                  <td className="p-3 text-htg-fg-muted">NIP, adres firmy, nr rachunku</td>
                  <td className="p-3 text-htg-fg-muted">faktura / operator płatności</td>
                </tr>
                <tr className="border-b border-htg-card-border">
                  <td className="p-3">Dane techniczne</td>
                  <td className="p-3 text-htg-fg-muted">adres IP, cookies, logi</td>
                  <td className="p-3 text-htg-fg-muted">przeglądarka</td>
                </tr>
                <tr className="border-b border-htg-card-border">
                  <td className="p-3">Nagranie sesji</td>
                  <td className="p-3 text-htg-fg-muted">obraz i głos</td>
                  <td className="p-3 text-htg-fg-muted">przebieg Sesji HTG</td>
                </tr>
                <tr>
                  <td className="p-3">Dane marketingowe*</td>
                  <td className="p-3 text-htg-fg-muted">preferencje newslettera</td>
                  <td className="p-3 text-htg-fg-muted">zgoda</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-htg-fg-muted mt-2">* Zbierane wyłącznie po wyrażeniu zgody.</p>
        </Section>

        <Section id="cele" title="3. Cele i podstawy przetwarzania">
          <UL>
            <li><strong>Realizacja umowy Sesji HTG</strong> — art. 6 ust. 1 lit. b RODO</li>
            <li><strong>Dane wrażliwe</strong> (przekonania, zdrowie) — art. 9 ust. 2 lit. a RODO (wyraźna zgoda)</li>
            <li><strong>Nagrywanie i publikacja sesji</strong> (wizerunek, głos) — zgoda wyrażona przy rezerwacji sesji, stanowiąca warunek zawarcia umowy</li>
            <li><strong>Obowiązki księgowe</strong> — art. 6 ust. 1 lit. c RODO</li>
            <li><strong>Ochrona praw</strong> (uzasadniony interes) — art. 6 ust. 1 lit. f RODO</li>
            <li><strong>Marketing</strong> — art. 6 ust. 1 lit. a RODO (wyłącznie za zgodą)</li>
          </UL>
        </Section>

        <Section id="odbiorcy" title="4. Odbiorcy danych">
          <P>Twoje dane mogą być przekazywane następującym podmiotom:</P>
          <UL>
            <li><strong>Vercel</strong> — hosting aplikacji</li>
            <li><strong>Cloudflare</strong> — DNS, CDN, ochrona DDoS</li>
            <li><strong>Supabase</strong> — baza danych i uwierzytelnianie</li>
            <li><strong>Stripe</strong> — przetwarzanie płatności</li>
            <li><strong>Bunny.net</strong> — przechowywanie i streaming nagrań</li>
            <li><strong>Resend</strong> — wysyłka e-maili transakcyjnych</li>
            <li><strong>Kancelarie prawne i podmioty księgowe</strong> — obsługa prawna i rachunkowa</li>
          </UL>
          <P>Niektórzy z naszych dostawców (Vercel, Cloudflare, Stripe) mogą przetwarzać dane poza Europejskim Obszarem Gospodarczym, na podstawie standardowych klauzul umownych lub decyzji Komisji Europejskiej o adekwatności ochrony.</P>
        </Section>

        <Section id="przechowywanie" title="5. Okres przechowywania">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-htg-card-border rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-htg-surface">
                  <th className="text-left p-3 font-medium text-htg-fg border-b border-htg-card-border">Rodzaj danych</th>
                  <th className="text-left p-3 font-medium text-htg-fg border-b border-htg-card-border">Okres</th>
                </tr>
              </thead>
              <tbody className="text-htg-fg">
                <tr className="border-b border-htg-card-border">
                  <td className="p-3">Dane rozliczeniowe</td>
                  <td className="p-3 text-htg-fg-muted">5 lat od końca roku podatkowego</td>
                </tr>
                <tr className="border-b border-htg-card-border">
                  <td className="p-3">Nagrania sesji</td>
                  <td className="p-3 text-htg-fg-muted">Maks. 24 miesiące od sesji, potem fizyczne kasowanie</td>
                </tr>
                <tr className="border-b border-htg-card-border">
                  <td className="p-3">Dane konta</td>
                  <td className="p-3 text-htg-fg-muted">Do usunięcia konta przez użytkownika</td>
                </tr>
                <tr>
                  <td className="p-3">Dane marketingowe</td>
                  <td className="p-3 text-htg-fg-muted">Do cofnięcia zgody</td>
                </tr>
              </tbody>
            </table>
          </div>
          <P>30 dni przed usunięciem nagrania otrzymasz powiadomienie e-mailem. Możesz poprosić o wcześniejsze usunięcie nagrania, pisząc na htg@htg.cyou.</P>
          <P>W przypadku usunięcia konta nagrania są kasowane, z wyjątkiem danych niezbędnych do celów księgowych lub ochrony roszczeń. Korespondencja jest przechowywana przez okres obowiązywania umowy i przedawnienia roszczeń.</P>
        </Section>

        <Section id="prawa" title="6. Twoje prawa">
          <P>Na podstawie RODO przysługują Ci następujące prawa:</P>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {[
              'Dostęp do danych',
              'Sprostowanie danych',
              'Usunięcie danych',
              'Ograniczenie przetwarzania',
              'Sprzeciw wobec przetwarzania',
              'Przeniesienie danych',
            ].map((right) => (
              <div key={right} className="flex items-center gap-2 text-sm text-htg-fg bg-htg-surface rounded-lg px-4 py-3">
                <span className="text-htg-sage">✓</span>
                {right}
              </div>
            ))}
          </div>
          <P>Zgodę na przetwarzanie danych wrażliwych możesz wycofać w dowolnym momencie w panelu klienta.</P>
          <P>Masz prawo złożyć skargę do <strong>Prezesa Urzędu Ochrony Danych Osobowych</strong> (UODO).</P>
        </Section>

        <Section id="cookies" title="7. Pliki cookies">
          <P>Używamy cookies technicznych (uwierzytelnianie, preferencje językowe i motywu), statystycznych oraz marketingowych. Przy pierwszej wizycie wyświetlamy baner zgód — możesz dostosować swoje preferencje.</P>
          <P>Podanie danych jest dobrowolne, lecz niezbędne do rezerwacji terminu Sesji HTG. Dane nie będą wykorzystywane do zautomatyzowanego podejmowania decyzji ani profilowania.</P>
        </Section>

        <Section id="monitoring" title="8. Monitoring sesji">
          <P>Dbając o to, by Twoje nagrania były bezpieczne i nie wpadły w niepowołane ręce, system monitoruje:</P>
          <UL>
            <li>Liczbę aktywnych sesji uwierzytelniania — limit 3 urządzenia na konto</li>
            <li>Liczbę jednoczesnych odtwarzań — limit 1 urządzenie na konto</li>
          </UL>
        </Section>

        {/* ── Kontakt ── */}
        <div className="mt-10 bg-htg-surface rounded-xl p-6 text-center">
          <p className="text-sm text-htg-fg-muted mb-1">Kontakt w sprawie danych osobowych:</p>
          <p className="font-semibold text-htg-fg">
            <a href="mailto:htg@htg.cyou" className="text-htg-sage hover:underline">htg@htg.cyou</a>
          </p>
          <p className="text-xs text-htg-fg-muted mt-2">Pilot PSA · ul. RONDO ONZ 1, 00-124 Warszawa</p>
        </div>
      </div>
    </div>
  );
}
