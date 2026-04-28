import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';

const PRIVACY_LOCALES = ['pl', 'en', 'de', 'pt'] as const;
type PrivacyLocale = typeof PRIVACY_LOCALES[number];

export function generateStaticParams() {
  return PRIVACY_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const hreflang = {
    pl: 'https://pilot.place/pl/privacy',
    en: 'https://pilot.place/en/privacy',
    de: 'https://pilot.place/de/privacy',
    pt: 'https://pilot.place/pt/privacy',
    'x-default': 'https://pilot.place/pl/privacy',
  };
  const titles: Record<string, string> = {
    pl: 'Polityka Prywatności | PILOT PSA',
    en: 'Privacy Policy | PILOT PSA',
    de: 'Datenschutzerklärung | PILOT PSA',
    pt: 'Política de Privacidade | PILOT PSA',
  };
  const descs: Record<string, string> = {
    pl: 'Polityka prywatności PILOT Prosta Spółka Akcyjna — jak zbieramy, wykorzystujemy i chronimy Twoje dane osobowe.',
    en: 'Privacy policy of PILOT Prosta Spółka Akcyjna — how we collect, use and protect your personal data.',
    de: 'Datenschutzerklärung der PILOT Prosta Spółka Akcyjna — wie wir Ihre personenbezogenen Daten erheben, verarbeiten und schützen.',
    pt: 'Política de privacidade da PILOT Prosta Spółka Akcyjna — como recolhemos, utilizamos e protegemos os seus dados pessoais.',
  };
  return {
    title: { absolute: titles[locale] ?? titles.pl },
    description: descs[locale] ?? descs.pl,
    alternates: { canonical: `https://pilot.place/${locale}/privacy`, languages: hreflang },
  };
}

/* ── Shared layout components ── */
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

/* ── Content objects ── */
type Content = {
  title: string; version: string;
  s1: { title: string; address: string; vat: string; email_label: string; website_label: string };
  s2: { title: string; col1: string; col2: string; col3: string; footnote: string;
        rows: [string, string, string][] };
  s3: { title: string; items: React.ReactNode[] };
  s4: { title: string; intro: string; items: React.ReactNode[]; transfer: string };
  s5: { title: string; col1: string; col2: string; rows: [string, string][]; p1: string; p2: string };
  s6: { title: string; intro: string; rights: string[]; withdraw: string; complaint: React.ReactNode };
  s7: { title: string; p1: string; p2: string };
  s8: { title: string; intro: string; items: string[] };
  contact: { label: string; address: string };
};

const PL: Content = {
  title: 'Polityka Prywatności',
  version: 'PILOT Prosta Spółka Akcyjna · Wersja 1.1 (zgodna z Regulaminem HTG v4.1)',
  s1: { title: '1. Administrator danych', address: 'ul. RONDO ONZ 1, 00-124 Warszawa',
        vat: 'NIP 525-308-51-01 · REGON 544401249',
        email_label: 'E-mail', website_label: 'Strona' },
  s2: {
    title: '2. Jakie dane zbieramy', col1: 'Kategoria', col2: 'Przykłady', col3: 'Źródło',
    footnote: '* Zbierane wyłącznie po wyrażeniu zgody.',
    rows: [
      ['Dane identyfikacyjne', 'imię, nazwisko, adres', 'formularz rezerwacji'],
      ['Dane kontaktowe', 'e-mail, telefon', 'formularz / korespondencja'],
      ['Dane rozliczeniowe', 'NIP, adres firmy, nr rachunku', 'faktura / operator płatności'],
      ['Dane techniczne', 'adres IP, cookies, logi', 'przeglądarka'],
      ['Nagranie sesji', 'obraz i głos', 'przebieg Sesji HTG'],
      ['Dane marketingowe*', 'preferencje newslettera', 'zgoda'],
    ],
  },
  s3: {
    title: '3. Cele i podstawy przetwarzania',
    items: [
      <><strong>Realizacja umowy Sesji HTG</strong> (w tym nagrywanie sesji jako element usługi) — art. 6 ust. 1 lit. b RODO</>,
      <><strong>Publikacja sesji w kanałach HTG</strong> (Biblioteka Nagrań HTG, kanał YouTube HTG, htgcyou.com, tłumaczenia) — art. 6 ust. 1 lit. b RODO + art. 81 ust. 2 pkt 2 prawa autorskiego (wynagrodzenie za udział w nagraniu)</>,
      <><strong>Dane szczególnych kategorii</strong> ujawniane w trakcie sesji (zdrowie, przekonania, życie osobiste) — art. 9 ust. 2 lit. a RODO (wyraźna zgoda)</>,
      <><strong>Dodatkowe zgody publikacyjne (Z2 — media społecznościowe, Z3 — materiały informacyjne)</strong> — art. 6 ust. 1 lit. a RODO (zgoda dobrowolna, wycofalna)</>,
      <><strong>Obowiązki księgowe</strong> — art. 6 ust. 1 lit. c RODO</>,
      <><strong>Ochrona praw</strong> (uzasadniony interes) — art. 6 ust. 1 lit. f RODO</>,
      <><strong>Marketing</strong> — art. 6 ust. 1 lit. a RODO (wyłącznie za zgodą)</>,
    ],
  },
  s4: {
    title: '4. Odbiorcy danych', intro: 'Twoje dane mogą być przekazywane następującym podmiotom:',
    items: [
      <><strong>Vercel</strong> — hosting aplikacji</>,
      <><strong>Cloudflare</strong> — DNS, CDN, ochrona DDoS</>,
      <><strong>Supabase</strong> — baza danych i uwierzytelnianie</>,
      <><strong>Stripe</strong> — przetwarzanie płatności</>,
      <><strong>Bunny.net</strong> — przechowywanie i streaming nagrań</>,
      <><strong>LiveKit Cloud</strong> — transmisja sesji wideo (WebRTC)</>,
      <><strong>Resend</strong> — wysyłka e-maili transakcyjnych</>,
      <><strong>Tłumacze współpracujący z Zespołem HTG</strong> — w zakresie sesji, w których uczestniczą, oraz nagrań przekazywanych do tłumaczenia</>,
      <><strong>Kancelarie prawne i podmioty księgowe</strong> — obsługa prawna i rachunkowa</>,
    ],
    transfer: 'Niektórzy z naszych dostawców (Vercel, Cloudflare, Stripe, LiveKit, Resend) mogą przetwarzać dane poza Europejskim Obszarem Gospodarczym, na podstawie standardowych klauzul umownych Komisji Europejskiej oraz/lub na podstawie certyfikacji EU-US Data Privacy Framework.',
  },
  s5: {
    title: '5. Okres przechowywania', col1: 'Rodzaj danych', col2: 'Okres',
    rows: [
      ['Dane rozliczeniowe', '5 lat od końca roku podatkowego'],
      ['Nagranie oryginalne (panel klienta)', 'Co najmniej 24 miesiące od sesji'],
      ['Nagrania opublikowane w kanałach HTG', 'Bezterminowo (archiwum HTG, Biblioteka Subskrypcji, YouTube)'],
      ['Anonimizowane fragmenty (bez wizerunku lub ze zmienionym głosem)', 'Bezterminowo, bez ograniczeń kanału'],
      ['Kopie techniczne (backup)', 'Do 90 dni po usunięciu nagrania głównego'],
      ['Dane konta', 'Do usunięcia konta przez użytkownika'],
      ['Dane marketingowe', 'Do cofnięcia zgody'],
    ],
    p1: 'Możesz w każdej chwili poprosić o wcześniejsze usunięcie nagrania oryginalnego ze swojego panelu klienta, pisząc na htg@htg.cyou — uwzględnimy prośbę w ciągu 30 dni. Usunięcie nagrania w panelu klienta nie wpływa na nagrania już opublikowane w kanałach HTG.',
    p2: 'W przypadku usunięcia konta nagrania oryginalne są kasowane, z wyjątkiem: (a) danych księgowych (do 5 lat), (b) danych niezbędnych do obrony roszczeń (do przedawnienia), (c) nagrań i fragmentów opublikowanych w ramach pkt 8 Regulaminu — pozostają one w archiwum HTG.',
  },
  s6: {
    title: '6. Twoje prawa', intro: 'Na podstawie RODO przysługują Ci następujące prawa:',
    rights: ['Dostęp do danych', 'Sprostowanie danych', 'Usunięcie danych', 'Ograniczenie przetwarzania', 'Sprzeciw wobec przetwarzania', 'Przeniesienie danych'],
    withdraw: 'Zgodę na przetwarzanie danych wrażliwych oraz dodatkowe zgody publikacyjne (Z2 — media społecznościowe, Z3 — materiały informacyjne) możesz wycofać w dowolnym momencie w panelu klienta lub pisząc na htg@htg.cyou. Wycofanie nie wpływa na zgodność z prawem przetwarzania dokonanego wcześniej ani na publikację w kanałach HTG, która stanowi element umowy.',
    complaint: <>Masz prawo złożyć skargę do <strong>Prezesa Urzędu Ochrony Danych Osobowych</strong> (UODO).</>,
  },
  s7: {
    title: '7. Pliki cookies',
    p1: 'Używamy cookies technicznych (uwierzytelnianie, preferencje językowe i motywu), statystycznych oraz marketingowych. Przy pierwszej wizycie wyświetlamy baner zgód — możesz dostosować swoje preferencje.',
    p2: 'Podanie danych jest dobrowolne, lecz niezbędne do rezerwacji terminu Sesji HTG. Dane nie będą wykorzystywane do zautomatyzowanego podejmowania decyzji ani profilowania.',
  },
  s8: {
    title: '8. Monitoring sesji',
    intro: 'Dbając o to, by Twoje nagrania były bezpieczne i nie wpadły w niepowołane ręce, system monitoruje:',
    items: ['Liczbę aktywnych sesji uwierzytelniania — limit 3 urządzenia na konto', 'Liczbę jednoczesnych odtwarzań — limit 1 urządzenie na konto'],
  },
  contact: { label: 'Kontakt w sprawie danych osobowych:', address: 'Pilot PSA · ul. RONDO ONZ 1, 00-124 Warszawa' },
};

const EN: Content = {
  title: 'Privacy Policy',
  version: 'PILOT Prosta Spółka Akcyjna · Version 1.1 (aligned with HTG Terms v4.1)',
  s1: { title: '1. Data Controller', address: 'ul. RONDO ONZ 1, 00-124 Warsaw, Poland',
        vat: 'VAT: PL5253085101 · REGON: 544401249',
        email_label: 'E-mail', website_label: 'Website' },
  s2: {
    title: '2. What data we collect', col1: 'Category', col2: 'Examples', col3: 'Source',
    footnote: '* Collected only after explicit consent.',
    rows: [
      ['Identification data', 'name, surname, address', 'booking form'],
      ['Contact data', 'e-mail, phone', 'form / correspondence'],
      ['Billing data', 'VAT no., company address, account no.', 'invoice / payment processor'],
      ['Technical data', 'IP address, cookies, logs', 'browser'],
      ['Session recording', 'video and audio', 'HTG Session'],
      ['Marketing data*', 'newsletter preferences', 'consent'],
    ],
  },
  s3: {
    title: '3. Purposes and legal bases',
    items: [
      <><strong>Performance of the HTG Session contract</strong> (including session recording as part of the service) — Art. 6(1)(b) GDPR</>,
      <><strong>Publication of sessions on HTG channels</strong> (HTG Recording Library, HTG YouTube channel, htgcyou.com, translations) — Art. 6(1)(b) GDPR + Art. 81(2)(2) of the Polish Copyright Act (remuneration for participation in the recording)</>,
      <><strong>Special category data</strong> disclosed during the session (health, beliefs, personal life) — Art. 9(2)(a) GDPR (explicit consent)</>,
      <><strong>Additional publication consents (Z2 — social media, Z3 — informational materials)</strong> — Art. 6(1)(a) GDPR (voluntary, withdrawable consent)</>,
      <><strong>Accounting obligations</strong> — Art. 6(1)(c) GDPR</>,
      <><strong>Protection of legal claims</strong> (legitimate interest) — Art. 6(1)(f) GDPR</>,
      <><strong>Marketing</strong> — Art. 6(1)(a) GDPR (only with consent)</>,
    ],
  },
  s4: {
    title: '4. Recipients of data', intro: 'Your data may be shared with the following parties:',
    items: [
      <><strong>Vercel</strong> — application hosting</>,
      <><strong>Cloudflare</strong> — DNS, CDN, DDoS protection</>,
      <><strong>Supabase</strong> — database and authentication</>,
      <><strong>Stripe</strong> — payment processing</>,
      <><strong>Bunny.net</strong> — recording storage and streaming</>,
      <><strong>LiveKit Cloud</strong> — video session transmission (WebRTC)</>,
      <><strong>Resend</strong> — transactional email delivery</>,
      <><strong>Translators cooperating with the HTG Team</strong> — limited to sessions in which they participate and recordings forwarded for translation</>,
      <><strong>Legal and accounting firms</strong> — legal and financial services</>,
    ],
    transfer: 'Some of our providers (Vercel, Cloudflare, Stripe, LiveKit, Resend) may process data outside the European Economic Area, based on standard contractual clauses of the European Commission and/or under the EU-US Data Privacy Framework certification.',
  },
  s5: {
    title: '5. Retention periods', col1: 'Data type', col2: 'Period',
    rows: [
      ['Billing data', '5 years from end of tax year'],
      ['Original recording (client panel)', 'At least 24 months from the session'],
      ['Recordings published on HTG channels', 'Indefinitely (HTG archive, Subscription Library, YouTube)'],
      ['Anonymised excerpts (no image or voice altered to non-identifiable)', 'Indefinitely, no channel restrictions'],
      ['Technical backups', 'Up to 90 days after deletion of the main recording'],
      ['Account data', 'Until account deletion by user'],
      ['Marketing data', 'Until consent is withdrawn'],
    ],
    p1: 'You may at any time request earlier deletion of the original recording from your client panel by writing to htg@htg.cyou — we will honour the request within 30 days. Deleting a recording from the client panel does not affect recordings already published on HTG channels.',
    p2: 'Upon account deletion, original recordings are erased, except for: (a) accounting data (up to 5 years), (b) data necessary for legal defence (until time-barred), (c) recordings and excerpts published under section 8 of the Terms — these remain in the HTG archive.',
  },
  s6: {
    title: '6. Your rights', intro: 'Under the GDPR, you have the following rights:',
    rights: ['Right of access', 'Right to rectification', 'Right to erasure', 'Right to restriction of processing', 'Right to object', 'Right to data portability'],
    withdraw: 'You may withdraw consent to the processing of sensitive data and the additional publication consents (Z2 — social media, Z3 — informational materials) at any time in your client panel or by writing to htg@htg.cyou. Withdrawal does not affect the lawfulness of processing carried out beforehand and does not affect publication on HTG channels, which is part of the contract.',
    complaint: <>You have the right to lodge a complaint with the <strong>President of the Personal Data Protection Office</strong> (UODO, Poland).</>,
  },
  s7: {
    title: '7. Cookies',
    p1: 'We use technical cookies (authentication, language and theme preferences), analytical, and marketing cookies. A consent banner is shown on your first visit — you can adjust your preferences at any time.',
    p2: 'Providing data is voluntary, but necessary to book an HTG Session. Data will not be used for automated decision-making or profiling.',
  },
  s8: {
    title: '8. Session monitoring',
    intro: 'To keep your recordings safe and out of unauthorised hands, the system monitors:',
    items: ['Number of active authentication sessions — limit of 3 devices per account', 'Number of simultaneous playbacks — limit of 1 device per account'],
  },
  contact: { label: 'Personal data enquiries:', address: 'Pilot PSA · ul. RONDO ONZ 1, 00-124 Warsaw' },
};

const DE: Content = {
  title: 'Datenschutzerklärung',
  version: 'PILOT Prosta Spółka Akcyjna · Version 1.1 (im Einklang mit den HTG-AGB v4.1)',
  s1: { title: '1. Verantwortliche Stelle', address: 'ul. RONDO ONZ 1, 00-124 Warschau, Polen',
        vat: 'USt-IdNr.: PL5253085101 · REGON: 544401249',
        email_label: 'E-Mail', website_label: 'Website' },
  s2: {
    title: '2. Erhobene Daten', col1: 'Kategorie', col2: 'Beispiele', col3: 'Quelle',
    footnote: '* Nur nach ausdrücklicher Einwilligung erhoben.',
    rows: [
      ['Identifikationsdaten', 'Name, Vorname, Adresse', 'Buchungsformular'],
      ['Kontaktdaten', 'E-Mail, Telefon', 'Formular / Korrespondenz'],
      ['Abrechnungsdaten', 'USt-IdNr., Firmenadresse, Kontonr.', 'Rechnung / Zahlungsdienstleister'],
      ['Technische Daten', 'IP-Adresse, Cookies, Protokolle', 'Browser'],
      ['Sitzungsaufzeichnung', 'Video und Audio', 'HTG-Sitzung'],
      ['Marketingdaten*', 'Newsletter-Präferenzen', 'Einwilligung'],
    ],
  },
  s3: {
    title: '3. Zwecke und Rechtsgrundlagen',
    items: [
      <><strong>Erfüllung des HTG-Sitzungsvertrags</strong> (einschließlich der Sitzungsaufzeichnung als Bestandteil der Leistung) — Art. 6 Abs. 1 lit. b DSGVO</>,
      <><strong>Veröffentlichung von Sitzungen auf HTG-Kanälen</strong> (HTG-Aufzeichnungsbibliothek, HTG-YouTube-Kanal, htgcyou.com, Übersetzungen) — Art. 6 Abs. 1 lit. b DSGVO + Art. 81 Abs. 2 Nr. 2 des polnischen Urheberrechts (Vergütung für die Mitwirkung an der Aufzeichnung)</>,
      <><strong>Besondere Kategorien personenbezogener Daten</strong> (Gesundheit, Überzeugungen, Privatleben) — Art. 9 Abs. 2 lit. a DSGVO (ausdrückliche Einwilligung)</>,
      <><strong>Zusätzliche Veröffentlichungs-Einwilligungen (Z2 — soziale Medien, Z3 — Informationsmaterial)</strong> — Art. 6 Abs. 1 lit. a DSGVO (freiwillig, widerrufbar)</>,
      <><strong>Buchführungspflichten</strong> — Art. 6 Abs. 1 lit. c DSGVO</>,
      <><strong>Geltendmachung von Rechtsansprüchen</strong> (berechtigtes Interesse) — Art. 6 Abs. 1 lit. f DSGVO</>,
      <><strong>Marketing</strong> — Art. 6 Abs. 1 lit. a DSGVO (nur mit Einwilligung)</>,
    ],
  },
  s4: {
    title: '4. Empfänger der Daten', intro: 'Ihre Daten können an folgende Stellen weitergegeben werden:',
    items: [
      <><strong>Vercel</strong> — Application-Hosting</>,
      <><strong>Cloudflare</strong> — DNS, CDN, DDoS-Schutz</>,
      <><strong>Supabase</strong> — Datenbank und Authentifizierung</>,
      <><strong>Stripe</strong> — Zahlungsabwicklung</>,
      <><strong>Bunny.net</strong> — Speicherung und Streaming von Aufzeichnungen</>,
      <><strong>LiveKit Cloud</strong> — Übertragung von Video-Sitzungen (WebRTC)</>,
      <><strong>Resend</strong> — Transaktionale E-Mail-Zustellung</>,
      <><strong>Mit dem HTG-Team kooperierende Übersetzer</strong> — beschränkt auf Sitzungen, an denen sie teilnehmen, sowie auf zur Übersetzung weitergegebene Aufzeichnungen</>,
      <><strong>Rechts- und Buchhaltungskanzleien</strong> — rechtliche und buchhalterische Dienstleistungen</>,
    ],
    transfer: 'Einige unserer Anbieter (Vercel, Cloudflare, Stripe, LiveKit, Resend) können Daten außerhalb des Europäischen Wirtschaftsraums verarbeiten, auf Grundlage von Standardvertragsklauseln der Europäischen Kommission und/oder einer Zertifizierung nach dem EU-US Data Privacy Framework.',
  },
  s5: {
    title: '5. Speicherfristen', col1: 'Datenkategorie', col2: 'Frist',
    rows: [
      ['Abrechnungsdaten', '5 Jahre ab Ende des Steuerjahres'],
      ['Original-Aufzeichnung (Kundenpanel)', 'Mindestens 24 Monate nach der Sitzung'],
      ['Auf HTG-Kanälen veröffentlichte Aufzeichnungen', 'Unbefristet (HTG-Archiv, Abo-Bibliothek, YouTube)'],
      ['Anonymisierte Auszüge (ohne Bild oder mit unkenntlich gemachter Stimme)', 'Unbefristet, ohne Kanalbeschränkung'],
      ['Technische Sicherungskopien', 'Bis zu 90 Tage nach Löschung der Hauptaufzeichnung'],
      ['Kontodaten', 'Bis zur Löschung des Kontos durch den Nutzer'],
      ['Marketingdaten', 'Bis zum Widerruf der Einwilligung'],
    ],
    p1: 'Sie können jederzeit eine frühere Löschung der Original-Aufzeichnung aus Ihrem Kundenpanel verlangen, indem Sie an htg@htg.cyou schreiben — wir kommen der Bitte innerhalb von 30 Tagen nach. Die Löschung im Kundenpanel berührt nicht bereits auf HTG-Kanälen veröffentlichte Aufzeichnungen.',
    p2: 'Bei Kontolöschung werden Original-Aufzeichnungen gelöscht, mit Ausnahme von: (a) Buchhaltungsdaten (bis zu 5 Jahre), (b) Daten, die zur Verteidigung von Ansprüchen erforderlich sind (bis zur Verjährung), (c) Aufzeichnungen und Auszügen, die nach Punkt 8 der AGB veröffentlicht wurden — diese verbleiben im HTG-Archiv.',
  },
  s6: {
    title: '6. Ihre Rechte', intro: 'Gemäß DSGVO stehen Ihnen folgende Rechte zu:',
    rights: ['Recht auf Auskunft', 'Recht auf Berichtigung', 'Recht auf Löschung', 'Recht auf Einschränkung der Verarbeitung', 'Widerspruchsrecht', 'Recht auf Datenübertragbarkeit'],
    withdraw: 'Die Einwilligung zur Verarbeitung besonderer Datenkategorien sowie die zusätzlichen Veröffentlichungs-Einwilligungen (Z2 — soziale Medien, Z3 — Informationsmaterial) können Sie jederzeit in Ihrem Kundenpanel oder per E-Mail an htg@htg.cyou widerrufen. Der Widerruf berührt nicht die Rechtmäßigkeit der zuvor erfolgten Verarbeitung und nicht die Veröffentlichung auf HTG-Kanälen, die Bestandteil des Vertrags ist.',
    complaint: <>Sie haben das Recht, eine Beschwerde beim <strong>Präsidenten des Datenschutzamts</strong> (UODO, Polen) einzureichen.</>,
  },
  s7: {
    title: '7. Cookies',
    p1: 'Wir verwenden technische Cookies (Authentifizierung, Sprach- und Design-Einstellungen), statistische und Marketing-Cookies. Bei Ihrem ersten Besuch wird ein Einwilligungsbanner angezeigt — Sie können Ihre Einstellungen jederzeit anpassen.',
    p2: 'Die Angabe von Daten ist freiwillig, aber für die Buchung einer HTG-Sitzung erforderlich. Daten werden nicht für automatisierte Entscheidungsfindung oder Profiling verwendet.',
  },
  s8: {
    title: '8. Sitzungsüberwachung',
    intro: 'Um Ihre Aufzeichnungen zu schützen und unbefugten Zugriff zu verhindern, überwacht das System:',
    items: ['Anzahl aktiver Authentifizierungssitzungen — Limit 3 Geräte pro Konto', 'Anzahl gleichzeitiger Wiedergaben — Limit 1 Gerät pro Konto'],
  },
  contact: { label: 'Datenschutzanfragen:', address: 'Pilot PSA · ul. RONDO ONZ 1, 00-124 Warschau' },
};

const PT: Content = {
  title: 'Política de Privacidade',
  version: 'PILOT Prosta Spółka Akcyjna · Versão 1.1 (alinhada com os Termos HTG v4.1)',
  s1: { title: '1. Responsável pelo tratamento', address: 'ul. RONDO ONZ 1, 00-124 Varsóvia, Polónia',
        vat: 'NIF: PL5253085101 · REGON: 544401249',
        email_label: 'E-mail', website_label: 'Website' },
  s2: {
    title: '2. Dados que recolhemos', col1: 'Categoria', col2: 'Exemplos', col3: 'Fonte',
    footnote: '* Recolhidos apenas após consentimento explícito.',
    rows: [
      ['Dados de identificação', 'nome, apelido, morada', 'formulário de reserva'],
      ['Dados de contacto', 'e-mail, telefone', 'formulário / correspondência'],
      ['Dados de faturação', 'NIF, morada da empresa, nº de conta', 'fatura / operador de pagamento'],
      ['Dados técnicos', 'endereço IP, cookies, registos', 'browser'],
      ['Gravação de sessão', 'vídeo e áudio', 'Sessão HTG'],
      ['Dados de marketing*', 'preferências de newsletter', 'consentimento'],
    ],
  },
  s3: {
    title: '3. Finalidades e bases legais',
    items: [
      <><strong>Execução do contrato da Sessão HTG</strong> (incluindo a gravação da sessão como parte do serviço) — Art. 6.º, n.º 1, al. b) RGPD</>,
      <><strong>Publicação de sessões nos canais HTG</strong> (Biblioteca de Gravações HTG, canal YouTube HTG, htgcyou.com, traduções) — Art. 6.º, n.º 1, al. b) RGPD + Art. 81.º, n.º 2, ponto 2, da Lei polaca de Direitos de Autor (remuneração pela participação na gravação)</>,
      <><strong>Dados de categorias especiais</strong> revelados durante a sessão (saúde, convicções, vida pessoal) — Art. 9.º, n.º 2, al. a) RGPD (consentimento explícito)</>,
      <><strong>Consentimentos adicionais de publicação (Z2 — redes sociais, Z3 — materiais informativos)</strong> — Art. 6.º, n.º 1, al. a) RGPD (consentimento voluntário, revogável)</>,
      <><strong>Obrigações contabilísticas</strong> — Art. 6.º, n.º 1, al. c) RGPD</>,
      <><strong>Defesa de direitos</strong> (interesse legítimo) — Art. 6.º, n.º 1, al. f) RGPD</>,
      <><strong>Marketing</strong> — Art. 6.º, n.º 1, al. a) RGPD (apenas com consentimento)</>,
    ],
  },
  s4: {
    title: '4. Destinatários dos dados', intro: 'Os seus dados podem ser partilhados com as seguintes entidades:',
    items: [
      <><strong>Vercel</strong> — alojamento da aplicação</>,
      <><strong>Cloudflare</strong> — DNS, CDN, proteção DDoS</>,
      <><strong>Supabase</strong> — base de dados e autenticação</>,
      <><strong>Stripe</strong> — processamento de pagamentos</>,
      <><strong>Bunny.net</strong> — armazenamento e streaming de gravações</>,
      <><strong>LiveKit Cloud</strong> — transmissão de sessões de vídeo (WebRTC)</>,
      <><strong>Resend</strong> — envio de e-mails transacionais</>,
      <><strong>Tradutores que cooperam com a Equipa HTG</strong> — limitado às sessões em que participam e às gravações enviadas para tradução</>,
      <><strong>Escritórios jurídicos e contabilísticos</strong> — serviços jurídicos e financeiros</>,
    ],
    transfer: 'Alguns dos nossos fornecedores (Vercel, Cloudflare, Stripe, LiveKit, Resend) podem tratar dados fora do Espaço Económico Europeu, com base em cláusulas contratuais-tipo da Comissão Europeia e/ou na certificação EU-US Data Privacy Framework.',
  },
  s5: {
    title: '5. Prazos de conservação', col1: 'Tipo de dados', col2: 'Prazo',
    rows: [
      ['Dados de faturação', '5 anos a contar do fim do ano fiscal'],
      ['Gravação original (painel do cliente)', 'Pelo menos 24 meses após a sessão'],
      ['Gravações publicadas em canais HTG', 'Por tempo indeterminado (arquivo HTG, Biblioteca de Subscrição, YouTube)'],
      ['Excertos anonimizados (sem imagem ou com voz alterada de forma irreconhecível)', 'Por tempo indeterminado, sem restrição de canal'],
      ['Cópias técnicas (backup)', 'Até 90 dias após a eliminação da gravação principal'],
      ['Dados da conta', 'Até à eliminação da conta pelo utilizador'],
      ['Dados de marketing', 'Até à retirada do consentimento'],
    ],
    p1: 'Pode solicitar a qualquer momento a eliminação antecipada da gravação original do seu painel de cliente, escrevendo para htg@htg.cyou — atenderemos o pedido em 30 dias. A eliminação no painel de cliente não afeta gravações já publicadas nos canais HTG.',
    p2: 'Após a eliminação da conta, as gravações originais são apagadas, exceto: (a) dados contabilísticos (até 5 anos), (b) dados necessários para defesa de direitos (até prescrição), (c) gravações e excertos publicados ao abrigo do ponto 8 dos Termos — estes permanecem no arquivo HTG.',
  },
  s6: {
    title: '6. Os seus direitos', intro: 'Ao abrigo do RGPD, assistem-lhe os seguintes direitos:',
    rights: ['Direito de acesso', 'Direito de retificação', 'Direito ao apagamento', 'Direito à limitação do tratamento', 'Direito de oposição', 'Direito à portabilidade dos dados'],
    withdraw: 'Pode retirar o consentimento para o tratamento de dados sensíveis e os consentimentos adicionais de publicação (Z2 — redes sociais, Z3 — materiais informativos) a qualquer momento no seu painel de cliente ou escrevendo para htg@htg.cyou. A retirada não afeta a licitude do tratamento anterior nem a publicação nos canais HTG, que faz parte do contrato.',
    complaint: <>Tem o direito de apresentar uma reclamação à <strong>Autoridade de Proteção de Dados Pessoais</strong> (UODO, Polónia).</>,
  },
  s7: {
    title: '7. Cookies',
    p1: 'Utilizamos cookies técnicos (autenticação, preferências de idioma e tema), analíticos e de marketing. Na sua primeira visita é apresentado um banner de consentimento — pode ajustar as suas preferências a qualquer momento.',
    p2: 'A prestação de dados é voluntária, mas necessária para reservar uma Sessão HTG. Os dados não serão utilizados para decisões automatizadas nem para criação de perfis.',
  },
  s8: {
    title: '8. Monitorização de sessões',
    intro: 'Para manter as suas gravações seguras e fora de mãos não autorizadas, o sistema monitoriza:',
    items: ['Número de sessões de autenticação ativas — limite de 3 dispositivos por conta', 'Número de reproduções simultâneas — limite de 1 dispositivo por conta'],
  },
  contact: { label: 'Contacto para questões de dados pessoais:', address: 'Pilot PSA · ul. RONDO ONZ 1, 00-124 Varsóvia' },
};

const CONTENT: Record<PrivacyLocale, Content> = { pl: PL, en: EN, de: DE, pt: PT };

/* ── Page ── */
export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale === 'pl' || locale === 'en') setRequestLocale(locale);

  const lang = (PRIVACY_LOCALES as readonly string[]).includes(locale)
    ? (locale as PrivacyLocale)
    : 'pl';
  const c = CONTENT[lang];

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl md:text-4xl font-serif font-bold text-htg-fg mb-2">{c.title}</h1>
      <p className="text-htg-fg-muted text-sm mb-8">{c.version}</p>

      <div className="space-y-2">
        {/* 1 */}
        <Section id="s1" title={c.s1.title}>
          <div className="bg-htg-card border border-htg-card-border rounded-xl p-5 mb-4">
            <p className="font-semibold text-htg-fg">
              <a href="https://pilot.place" target="_blank" rel="noopener noreferrer" className="text-htg-sage hover:underline">Pilot PSA</a>
            </p>
            <p className="text-sm text-htg-fg-muted mt-1">{c.s1.address}</p>
            <p className="text-sm text-htg-fg-muted">{c.s1.vat}</p>
            <p className="text-sm text-htg-fg-muted mt-1">{c.s1.email_label}: <a href="mailto:mail@pilot.place" className="text-htg-sage hover:underline">mail@pilot.place</a></p>
            <p className="text-sm text-htg-fg-muted mt-1">{c.s1.website_label}: <a href="https://pilot.place" target="_blank" rel="noopener noreferrer" className="text-htg-sage hover:underline">pilot.place</a></p>
          </div>
        </Section>

        {/* 2 */}
        <Section id="s2" title={c.s2.title}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-htg-card-border rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-htg-surface">
                  <th className="text-left p-3 font-medium text-htg-fg border-b border-htg-card-border">{c.s2.col1}</th>
                  <th className="text-left p-3 font-medium text-htg-fg border-b border-htg-card-border">{c.s2.col2}</th>
                  <th className="text-left p-3 font-medium text-htg-fg border-b border-htg-card-border">{c.s2.col3}</th>
                </tr>
              </thead>
              <tbody className="text-htg-fg">
                {c.s2.rows.map(([cat, ex, src], i) => (
                  <tr key={i} className={i < c.s2.rows.length - 1 ? 'border-b border-htg-card-border' : ''}>
                    <td className="p-3">{cat}</td>
                    <td className="p-3 text-htg-fg-muted">{ex}</td>
                    <td className="p-3 text-htg-fg-muted">{src}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-htg-fg-muted mt-2">{c.s2.footnote}</p>
        </Section>

        {/* 3 */}
        <Section id="s3" title={c.s3.title}>
          <UL>{c.s3.items.map((item, i) => <li key={i}>{item}</li>)}</UL>
        </Section>

        {/* 4 */}
        <Section id="s4" title={c.s4.title}>
          <P>{c.s4.intro}</P>
          <UL>{c.s4.items.map((item, i) => <li key={i}>{item}</li>)}</UL>
          <P>{c.s4.transfer}</P>
        </Section>

        {/* 5 */}
        <Section id="s5" title={c.s5.title}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-htg-card-border rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-htg-surface">
                  <th className="text-left p-3 font-medium text-htg-fg border-b border-htg-card-border">{c.s5.col1}</th>
                  <th className="text-left p-3 font-medium text-htg-fg border-b border-htg-card-border">{c.s5.col2}</th>
                </tr>
              </thead>
              <tbody className="text-htg-fg">
                {c.s5.rows.map(([type, period], i) => (
                  <tr key={i} className={i < c.s5.rows.length - 1 ? 'border-b border-htg-card-border' : ''}>
                    <td className="p-3">{type}</td>
                    <td className="p-3 text-htg-fg-muted">{period}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <P>{c.s5.p1}</P>
          <P>{c.s5.p2}</P>
        </Section>

        {/* 6 */}
        <Section id="s6" title={c.s6.title}>
          <P>{c.s6.intro}</P>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {c.s6.rights.map((right) => (
              <div key={right} className="flex items-center gap-2 text-sm text-htg-fg bg-htg-surface rounded-lg px-4 py-3">
                <span className="text-htg-sage">✓</span>
                {right}
              </div>
            ))}
          </div>
          <P>{c.s6.withdraw}</P>
          <P>{c.s6.complaint}</P>
        </Section>

        {/* 7 */}
        <Section id="s7" title={c.s7.title}>
          <P>{c.s7.p1}</P>
          <P>{c.s7.p2}</P>
        </Section>

        {/* 8 */}
        <Section id="s8" title={c.s8.title}>
          <P>{c.s8.intro}</P>
          <UL>{c.s8.items.map((item, i) => <li key={i}>{item}</li>)}</UL>
        </Section>

        {/* Contact */}
        <div className="mt-10 bg-htg-surface rounded-xl p-6 text-center">
          <p className="text-sm text-htg-fg-muted mb-1">{c.contact.label}</p>
          <p className="font-semibold text-htg-fg">
            <a href="mailto:mail@pilot.place" className="text-htg-sage hover:underline">mail@pilot.place</a>
          </p>
          <p className="text-xs text-htg-fg-muted mt-2">
            <a href="https://pilot.place" target="_blank" rel="noopener noreferrer" className="text-htg-sage hover:underline">pilot.place</a>
            {' · '}{c.contact.address}
          </p>
        </div>
      </div>
    </div>
  );
}
