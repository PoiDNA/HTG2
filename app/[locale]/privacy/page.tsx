import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (locale === 'en') {
    return {
      title: { absolute: 'Privacy Policy | PILOT PSA' },
      description: 'Privacy policy of PILOT Prosta Spółka Akcyjna — how we collect, use and protect your personal data.',
      alternates: {
        canonical: 'https://pilot.place/en/privacy',
        languages: {
          pl: 'https://pilot.place/pl/privacy',
          en: 'https://pilot.place/en/privacy',
          'x-default': 'https://pilot.place/pl/privacy',
        },
      },
    };
  }
  return {
    title: { absolute: 'Polityka Prywatności | PILOT PSA' },
    description: 'Polityka prywatności PILOT Prosta Spółka Akcyjna — jak zbieramy, wykorzystujemy i chronimy Twoje dane osobowe.',
    alternates: {
      canonical: 'https://pilot.place/pl/privacy',
      languages: {
        pl: 'https://pilot.place/pl/privacy',
        en: 'https://pilot.place/en/privacy',
        'x-default': 'https://pilot.place/pl/privacy',
      },
    },
  };
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

  const isEn = locale === 'en';

  if (isEn) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl md:text-4xl font-serif font-bold text-htg-fg mb-2">
          Privacy Policy
        </h1>
        <p className="text-htg-fg-muted text-sm mb-8">PILOT Prosta Spółka Akcyjna · Version 1.0</p>

        <div className="space-y-2">
          <Section id="controller" title="1. Data Controller">
            <div className="bg-htg-card border border-htg-card-border rounded-xl p-5 mb-4">
              <p className="font-semibold text-htg-fg">
                <a href="https://pilot.place" target="_blank" rel="noopener noreferrer" className="text-htg-sage hover:underline">Pilot PSA</a>
              </p>
              <p className="text-sm text-htg-fg-muted mt-1">ul. RONDO ONZ 1, 00-124 Warsaw, Poland</p>
              <p className="text-sm text-htg-fg-muted">VAT: PL5253085101 · REGON: 544401249</p>
              <p className="text-sm text-htg-fg-muted mt-1">E-mail: <a href="mailto:mail@pilot.place" className="text-htg-sage hover:underline">mail@pilot.place</a></p>
              <p className="text-sm text-htg-fg-muted mt-1">Website: <a href="https://pilot.place" target="_blank" rel="noopener noreferrer" className="text-htg-sage hover:underline">pilot.place</a></p>
            </div>
          </Section>

          <Section id="data" title="2. What data we collect">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-htg-card-border rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-htg-surface">
                    <th className="text-left p-3 font-medium text-htg-fg border-b border-htg-card-border">Category</th>
                    <th className="text-left p-3 font-medium text-htg-fg border-b border-htg-card-border">Examples</th>
                    <th className="text-left p-3 font-medium text-htg-fg border-b border-htg-card-border">Source</th>
                  </tr>
                </thead>
                <tbody className="text-htg-fg">
                  <tr className="border-b border-htg-card-border">
                    <td className="p-3">Identification data</td>
                    <td className="p-3 text-htg-fg-muted">name, surname, address</td>
                    <td className="p-3 text-htg-fg-muted">booking form</td>
                  </tr>
                  <tr className="border-b border-htg-card-border">
                    <td className="p-3">Contact data</td>
                    <td className="p-3 text-htg-fg-muted">e-mail, phone</td>
                    <td className="p-3 text-htg-fg-muted">form / correspondence</td>
                  </tr>
                  <tr className="border-b border-htg-card-border">
                    <td className="p-3">Billing data</td>
                    <td className="p-3 text-htg-fg-muted">VAT no., company address, account no.</td>
                    <td className="p-3 text-htg-fg-muted">invoice / payment processor</td>
                  </tr>
                  <tr className="border-b border-htg-card-border">
                    <td className="p-3">Technical data</td>
                    <td className="p-3 text-htg-fg-muted">IP address, cookies, logs</td>
                    <td className="p-3 text-htg-fg-muted">browser</td>
                  </tr>
                  <tr className="border-b border-htg-card-border">
                    <td className="p-3">Session recording</td>
                    <td className="p-3 text-htg-fg-muted">video and audio</td>
                    <td className="p-3 text-htg-fg-muted">HTG Session</td>
                  </tr>
                  <tr>
                    <td className="p-3">Marketing data*</td>
                    <td className="p-3 text-htg-fg-muted">newsletter preferences</td>
                    <td className="p-3 text-htg-fg-muted">consent</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-htg-fg-muted mt-2">* Collected only after explicit consent.</p>
          </Section>

          <Section id="purposes" title="3. Purposes and legal bases">
            <UL>
              <li><strong>Performance of the HTG Session contract</strong> — Art. 6(1)(b) GDPR</li>
              <li><strong>Sensitive data</strong> (beliefs, health) — Art. 9(2)(a) GDPR (explicit consent)</li>
              <li><strong>Recording and publication of sessions</strong> (image, voice) — consent given at booking, which is a condition of the contract</li>
              <li><strong>Accounting obligations</strong> — Art. 6(1)(c) GDPR</li>
              <li><strong>Protection of legal claims</strong> (legitimate interest) — Art. 6(1)(f) GDPR</li>
              <li><strong>Marketing</strong> — Art. 6(1)(a) GDPR (only with consent)</li>
            </UL>
          </Section>

          <Section id="recipients" title="4. Recipients of data">
            <P>Your data may be shared with the following parties:</P>
            <UL>
              <li><strong>Vercel</strong> — application hosting</li>
              <li><strong>Cloudflare</strong> — DNS, CDN, DDoS protection</li>
              <li><strong>Supabase</strong> — database and authentication</li>
              <li><strong>Stripe</strong> — payment processing</li>
              <li><strong>Bunny.net</strong> — recording storage and streaming</li>
              <li><strong>Resend</strong> — transactional email delivery</li>
              <li><strong>Legal and accounting firms</strong> — legal and financial services</li>
            </UL>
            <P>Some of our providers (Vercel, Cloudflare, Stripe) may process data outside the European Economic Area, based on standard contractual clauses or an EU adequacy decision.</P>
          </Section>

          <Section id="retention" title="5. Retention periods">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-htg-card-border rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-htg-surface">
                    <th className="text-left p-3 font-medium text-htg-fg border-b border-htg-card-border">Data type</th>
                    <th className="text-left p-3 font-medium text-htg-fg border-b border-htg-card-border">Period</th>
                  </tr>
                </thead>
                <tbody className="text-htg-fg">
                  <tr className="border-b border-htg-card-border">
                    <td className="p-3">Billing data</td>
                    <td className="p-3 text-htg-fg-muted">5 years from end of tax year</td>
                  </tr>
                  <tr className="border-b border-htg-card-border">
                    <td className="p-3">Session recordings</td>
                    <td className="p-3 text-htg-fg-muted">Max. 24 months from session, then permanently deleted</td>
                  </tr>
                  <tr className="border-b border-htg-card-border">
                    <td className="p-3">Account data</td>
                    <td className="p-3 text-htg-fg-muted">Until account deletion by user</td>
                  </tr>
                  <tr>
                    <td className="p-3">Marketing data</td>
                    <td className="p-3 text-htg-fg-muted">Until consent is withdrawn</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <P>You will receive an e-mail notification 30 days before a recording is deleted. You may request earlier deletion by writing to mail@pilot.place.</P>
            <P>Upon account deletion, recordings are erased, except for data required for accounting or legal claims. Correspondence is retained for the duration of the contract and the applicable limitation period.</P>
          </Section>

          <Section id="rights" title="6. Your rights">
            <P>Under the GDPR, you have the following rights:</P>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {[
                'Right of access',
                'Right to rectification',
                'Right to erasure',
                'Right to restriction of processing',
                'Right to object',
                'Right to data portability',
              ].map((right) => (
                <div key={right} className="flex items-center gap-2 text-sm text-htg-fg bg-htg-surface rounded-lg px-4 py-3">
                  <span className="text-htg-sage">✓</span>
                  {right}
                </div>
              ))}
            </div>
            <P>You may withdraw consent to the processing of sensitive data at any time in your client panel.</P>
            <P>You have the right to lodge a complaint with the <strong>President of the Personal Data Protection Office</strong> (UODO, Poland).</P>
          </Section>

          <Section id="cookies" title="7. Cookies">
            <P>We use technical cookies (authentication, language and theme preferences), analytical, and marketing cookies. A consent banner is shown on your first visit — you can adjust your preferences at any time.</P>
            <P>Providing data is voluntary, but necessary to book an HTG Session. Data will not be used for automated decision-making or profiling.</P>
          </Section>

          <Section id="monitoring" title="8. Session monitoring">
            <P>To keep your recordings safe and out of unauthorised hands, the system monitors:</P>
            <UL>
              <li>Number of active authentication sessions — limit of 3 devices per account</li>
              <li>Number of simultaneous playbacks — limit of 1 device per account</li>
            </UL>
          </Section>

          {/* ── Contact ── */}
          <div className="mt-10 bg-htg-surface rounded-xl p-6 text-center">
            <p className="text-sm text-htg-fg-muted mb-1">Personal data enquiries:</p>
            <p className="font-semibold text-htg-fg">
              <a href="mailto:mail@pilot.place" className="text-htg-sage hover:underline">mail@pilot.place</a>
            </p>
            <p className="text-xs text-htg-fg-muted mt-2"><a href="https://pilot.place" target="_blank" rel="noopener noreferrer" className="text-htg-sage hover:underline">pilot.place</a> · Pilot PSA · ul. RONDO ONZ 1, 00-124 Warsaw</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl md:text-4xl font-serif font-bold text-htg-fg mb-2">
        Polityka Prywatności
      </h1>
      <p className="text-htg-fg-muted text-sm mb-8">PILOT Prosta Spółka Akcyjna · Wersja 1.0</p>

      <div className="space-y-2">
        <Section id="administrator" title="1. Administrator danych">
          <div className="bg-htg-card border border-htg-card-border rounded-xl p-5 mb-4">
            <p className="font-semibold text-htg-fg">
              <a href="https://pilot.place" target="_blank" rel="noopener noreferrer" className="text-htg-sage hover:underline">Pilot PSA</a>
            </p>
            <p className="text-sm text-htg-fg-muted mt-1">ul. RONDO ONZ 1, 00-124 Warszawa</p>
            <p className="text-sm text-htg-fg-muted">NIP 525-308-51-01 · REGON 544401249</p>
            <p className="text-sm text-htg-fg-muted mt-1">E-mail: <a href="mailto:mail@pilot.place" className="text-htg-sage hover:underline">mail@pilot.place</a></p>
            <p className="text-sm text-htg-fg-muted mt-1">Strona: <a href="https://pilot.place" target="_blank" rel="noopener noreferrer" className="text-htg-sage hover:underline">pilot.place</a></p>
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
          <P>30 dni przed usunięciem nagrania otrzymasz powiadomienie e-mailem. Możesz poprosić o wcześniejsze usunięcie nagrania, pisząc na mail@pilot.place.</P>
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
            <a href="mailto:mail@pilot.place" className="text-htg-sage hover:underline">mail@pilot.place</a>
          </p>
          <p className="text-xs text-htg-fg-muted mt-2"><a href="https://pilot.place" target="_blank" rel="noopener noreferrer" className="text-htg-sage hover:underline">pilot.place</a> · Pilot PSA · ul. RONDO ONZ 1, 00-124 Warszawa</p>
        </div>
      </div>
    </div>
  );
}
