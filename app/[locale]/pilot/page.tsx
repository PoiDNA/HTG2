import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { locales } from "@/i18n-config";
import {
  BookOpen,
  Shield,
  Server,
  FlaskConical,
  Mail,
  MapPin,
  ArrowRight,
} from "lucide-react";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  if (locale === "en") {
    return {
      title: { absolute: "PILOT PSA — Secure platforms for learning and growth" },
      description:
        "PILOT PSA builds and operates online platforms for people on a path of learning and personal development — protected with care. Warsaw, Poland.",
      keywords: [
        "PILOT PSA",
        "PILOT Prosta Spółka Akcyjna",
        "education platform security",
        "secure e-learning",
        "data protection GDPR",
        "personal development platform",
        "pilot.place",
      ],
      alternates: {
        canonical: "https://pilot.place/en/pilot",
        languages: {
          "pl": "https://pilot.place/pl/pilot",
          "en": "https://pilot.place/en/pilot",
          "x-default": "https://pilot.place",
        },
      },
      openGraph: {
        type: "website",
        siteName: "PILOT PSA",
        title: "PILOT PSA — Secure platforms for learning and growth",
        description:
          "We build and operate online platforms for people who are growing — protected with care.",
        url: "https://pilot.place/en/pilot",
        locale: "en_US",
      },
    };
  }

  return {
    title: { absolute: "PILOT PSA — Bezpieczne platformy edukacyjne i rozwojowe" },
    description:
      "PILOT Prosta Spółka Akcyjna — cyberbezpieczeństwo i administracja serwisów edukacyjnych. KRS 0001233166, NIP 5253085101. Warszawa.",
    keywords: [
      "PILOT PSA",
      "Pilot Prosta Spółka Akcyjna",
      "Pilot spółka",
      "pilot.place",
      "cyberbezpieczeństwo",
      "serwisy edukacyjne",
      "platformy edukacyjne",
      "ochrona danych RODO",
    ],
    alternates: {
      canonical: "https://pilot.place",
      languages: {
        "pl": "https://pilot.place/pl/pilot",
        "en": "https://pilot.place/en/pilot",
        "x-default": "https://pilot.place",
      },
    },
    openGraph: {
      type: "website",
      siteName: "PILOT PSA",
      title: "PILOT PSA — Bezpieczne platformy edukacyjne i rozwojowe",
      description:
        "PILOT Prosta Spółka Akcyjna — cyberbezpieczeństwo i administracja serwisów edukacyjnych.",
      url: "https://pilot.place",
      locale: "pl_PL",
    },
  };
}

// ── Content ────────────────────────────────────────────────────

const PL = {
  tagline: "Przestrzeń do osobistego wzrostu — chroniona z\u00a0troską",
  contact_cta: "Kontakt",
  about_heading: "O nas",
  about_p1:
    "Tworzymy miejsca w\u00a0sieci, w\u00a0których ludzie uczą się, rozwijają i\u00a0odkrywają swój potencjał. Dbamy o\u00a0to, żeby każda taka przestrzeń była nie tylko funkcjonalna, ale przede wszystkim bezpieczna dla tych, którzy jej ufają.",
  about_italic: "Twoje dane są Twoje — i\u00a0traktujemy to poważnie.",
  about_p2:
    "PILOT PSA działa z\u00a0Warszawy i\u00a0Krakowa.",
  services_heading: "Zakres działalności",
  services: [
    {
      icon: BookOpen,
      title: "Platformy edukacyjne i rozwojowe",
      description:
        "Budujemy i prowadzimy serwisy internetowe dla ludzi, którzy chcą się rozwijać — kursy, społeczności, relacje. Zależy nam na tym, żeby działały bez zakłóceń i by użytkownicy czuli się w nich bezpiecznie.",
    },
    {
      icon: Shield,
      title: "Ochrona danych i bezpieczeństwo",
      description:
        "Zadbamy o to, żeby dane Twoich uczestników nie wpadły w niepowołane ręce. Bez żargonu, bez kompromisów — po prostu solidna ochrona tego, co najważniejsze.",
    },
    {
      icon: Server,
      title: "Stabilna infrastruktura",
      description:
        "Twój serwis powinien działać wtedy, gdy potrzebują go Twoi uczestnicy — nie tylko w godzinach biurowych. Zajmujemy się tym, żebyś Ty mógł skupić się na treści i ludziach.",
    },
    {
      icon: FlaskConical,
      title: "Badania i nowe rozwiązania",
      description:
        "Odpowiadamy na pytania, które mainstream dopiero zaczyna zadawać — jak łączyć technologię z rozwojem człowieka w sposób, który naprawdę jest potencjałem do głębszego rozumienia.",
    },
  ],
  security_heading: "Bezpieczeństwo",
  security_text:
    "Wierzymy, że zaufanie buduje się w\u00a0szczegółach. Zbieramy tylko to, co niezbędne, nigdy nie dzielimy się danymi bez powodu i\u00a0działamy zgodnie z\u00a0RODO — nie dlatego, że musimy, ale dlatego, że szanujemy ludzi, którzy nam ufają.",
  security_tags: ["RODO", "Tylko to, co potrzebne", "Bezpieczeństwo dostępu", "Pełna kontrola"],
  contact_heading: "Kontakt",
  office_label: "Siedziba",
  branch_label: "Oddział",
  registry_heading: "Dane rejestrowe",
  registry: [
    ["Firma", "PILOT Prosta Spółka Akcyjna"],
    ["KRS", "0001233166"],
    ["NIP", "5253085101"],
    ["REGON", "544401249"],
    ["Kapitał akcyjny", "100\u00a0000,00 PLN"],
  ],
  privacy_link: "Polityka prywatności",
};

const EN = {
  tagline: "A space for personal growth — protected with care",
  contact_cta: "Contact",
  about_heading: "About us",
  about_p1:
    "We create online spaces where people learn, grow, and discover their potential. We care deeply that every such space is not only reliable, but above all safe for those who trust it.",
  about_italic: "Your data is yours — and we take that seriously.",
  about_p2:
    "PILOT PSA operates from Warsaw and Kraków, Poland.",
  services_heading: "What we do",
  services: [
    {
      icon: BookOpen,
      title: "Educational & growth platforms",
      description:
        "We build and run online services for people on a path of growth — courses, communities, relationships. We make sure they work without interruption and that users feel safe inside them.",
    },
    {
      icon: Shield,
      title: "Data protection & security",
      description:
        "We ensure that your participants' data stays where it belongs. No jargon, no shortcuts — just solid protection for what matters most.",
    },
    {
      icon: Server,
      title: "Reliable infrastructure",
      description:
        "Your platform should be there when your participants need it — not just during office hours. We handle that, so you can focus on your content and your people.",
    },
    {
      icon: FlaskConical,
      title: "Research & new solutions",
      description:
        "We answer questions the mainstream is only beginning to ask — how to connect technology with human growth in a way that is truly a gateway to deeper understanding.",
    },
  ],
  security_heading: "Privacy & trust",
  security_text:
    "We believe trust is built in the details. We collect only what is necessary, never share data without reason, and operate in accordance with GDPR — not because we have to, but because we respect the people who trust us.",
  security_tags: ["GDPR", "Minimal data", "Access control", "Full transparency"],
  contact_heading: "Contact",
  office_label: "Headquarters",
  branch_label: "Branch",
  registry_heading: "Company details",
  registry: [
    ["Company", "PILOT Prosta Spółka Akcyjna"],
    ["KRS", "0001233166"],
    ["Tax ID (NIP)", "5253085101"],
    ["REGON", "544401249"],
    ["Share capital", "PLN\u00a0100\u00a0000.00"],
  ],
  privacy_link: "Privacy policy",
};

export default async function PilotPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = locale === "en" ? EN : PL;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "PILOT Prosta Spółka Akcyjna",
    alternateName: ["PILOT PSA", "Pilot spółka", "Pilot company"],
    url: "https://pilot.place",
    email: "mail@pilot.place",
    address: [
      {
        "@type": "PostalAddress",
        streetAddress: "Rondo ONZ 1",
        postalCode: "00-124",
        addressLocality: "Warszawa",
        addressCountry: "PL",
      },
      {
        "@type": "PostalAddress",
        streetAddress: "ul. Opolska 110",
        postalCode: "31-323",
        addressLocality: "Kraków",
        addressCountry: "PL",
      },
    ],
    taxID: "5253085101",
    legalName: "PILOT Prosta Spółka Akcyjna",
    description:
      locale === "en"
        ? "Technology company specialising in security and administration of educational platforms."
        : "Firma technologiczna specjalizująca się w cyberbezpieczeństwie i administracji serwisów edukacyjnych.",
    knowsAbout:
      locale === "en"
        ? ["cybersecurity", "educational platforms", "data protection", "IT infrastructure"]
        : ["cyberbezpieczeństwo", "platformy edukacyjne", "ochrona danych", "infrastruktura IT"],
  };

  return (
    <div className="font-serif">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ── Hero ──────────────────────────────────────────────── */}
      <header className="relative overflow-hidden bg-stone-900">
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }} />
        <div className="relative mx-auto max-w-4xl px-6 py-24 text-center sm:py-32">
          <div className="mx-auto mb-8 h-px w-16 bg-amber-600/60" />
          <h1 className="font-serif text-5xl font-light tracking-wide text-white sm:text-6xl lg:text-7xl">
            PILOT
          </h1>
          <div className="mx-auto mt-6 h-px w-24 bg-gradient-to-r from-transparent via-amber-600/50 to-transparent" />
          <p className="mt-8 font-sans text-lg font-light tracking-wide text-stone-300 sm:text-xl">
            {t.tagline}
          </p>
          {/* Language switcher */}
          <div className="mt-6 flex items-center justify-center gap-3 font-sans text-xs tracking-[0.15em] text-stone-500 uppercase">
            <a
              href="/pl/pilot"
              className={`transition-colors hover:text-stone-300 ${locale === "pl" ? "text-amber-400/80" : ""}`}
            >
              PL
            </a>
            <span className="text-stone-700">|</span>
            <a
              href="/en/pilot"
              className={`transition-colors hover:text-stone-300 ${locale === "en" ? "text-amber-400/80" : ""}`}
            >
              EN
            </a>
          </div>
          <a
            href="mailto:mail@pilot.place"
            className="mt-8 inline-flex items-center gap-2 border border-amber-700/40 bg-amber-700/10 px-8 py-3 font-sans text-sm font-medium tracking-widest text-amber-200 uppercase transition-all hover:border-amber-600/60 hover:bg-amber-700/20 hover:text-amber-100"
          >
            {t.contact_cta}
            <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </a>
        </div>
      </header>

      <main id="main-content">
        {/* ── O nas / About ────────────────────────────────────── */}
        <section className="border-b border-stone-200 bg-white">
          <div className="mx-auto max-w-3xl px-6 py-20 sm:py-28">
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-stone-200" />
              <h2 className="font-serif text-sm font-normal tracking-[0.3em] text-stone-400 uppercase">
                {t.about_heading}
              </h2>
              <div className="h-px flex-1 bg-stone-200" />
            </div>
            <div className="mt-10 space-y-6 font-serif text-lg leading-[1.8] text-stone-600 max-w-prose mx-auto text-center">
              <p>{t.about_p1}</p>
              <p className="text-stone-800 font-medium italic">{t.about_italic}</p>
              <p>{t.about_p2}</p>
            </div>
          </div>
        </section>

        {/* ── Usługi / Services ────────────────────────────────── */}
        <section className="bg-stone-50">
          <div className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-stone-300/60" />
              <h2 className="font-serif text-sm font-normal tracking-[0.3em] text-stone-400 uppercase">
                {t.services_heading}
              </h2>
              <div className="h-px flex-1 bg-stone-300/60" />
            </div>
            <div className="mt-14 grid gap-0 sm:grid-cols-2">
              {t.services.map((svc, i) => {
                const Icon = svc.icon;
                return (
                  <div
                    key={svc.title}
                    className={`group relative border border-stone-200 bg-white p-10 transition-all hover:bg-stone-900 hover:border-stone-800 ${
                      i === 0 ? "sm:rounded-tl-sm" : ""
                    } ${i === 1 ? "sm:rounded-tr-sm" : ""} ${
                      i === 2 ? "sm:rounded-bl-sm" : ""
                    } ${i === 3 ? "sm:rounded-br-sm" : ""}`}
                  >
                    <div className="mb-6 flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center border border-stone-200 group-hover:border-amber-700/40 transition-colors">
                        <Icon className="h-5 w-5 text-stone-400 group-hover:text-amber-500 transition-colors" strokeWidth={1.5} />
                      </div>
                      <div className="h-px flex-1 bg-stone-100 group-hover:bg-stone-700 transition-colors" />
                    </div>
                    <h3 className="font-serif text-lg font-medium text-stone-900 group-hover:text-white transition-colors">
                      {svc.title}
                    </h3>
                    <p className="mt-4 font-sans text-sm leading-relaxed text-stone-500 group-hover:text-stone-400 transition-colors">
                      {svc.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Bezpieczeństwo / Privacy & trust ─────────────────── */}
        <section className="border-y border-stone-200 bg-white">
          <div className="mx-auto max-w-3xl px-6 py-20 sm:py-28">
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-stone-200" />
              <h2 className="font-serif text-sm font-normal tracking-[0.3em] text-stone-400 uppercase">
                {t.security_heading}
              </h2>
              <div className="h-px flex-1 bg-stone-200" />
            </div>
            <div className="mx-auto mt-10 max-w-prose text-center">
              <p className="font-serif text-lg leading-[1.8] text-stone-600">
                {t.security_text}
              </p>
              <div className="mx-auto mt-10 flex flex-wrap justify-center gap-6 font-sans text-xs tracking-[0.2em] text-stone-400 uppercase">
                {t.security_tags.map((tag) => (
                  <span key={tag} className="border border-stone-200 px-4 py-2">{tag}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Kontakt / Contact ────────────────────────────────── */}
        <section className="bg-stone-900 text-stone-300">
          <div className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
            <div className="grid gap-16 sm:grid-cols-2">
              <div>
                <h2 className="font-serif text-sm font-normal tracking-[0.3em] text-stone-500 uppercase">
                  {t.contact_heading}
                </h2>
                <div className="mt-8 space-y-6">
                  <a
                    href="mailto:mail@pilot.place"
                    className="group flex items-center gap-4 text-lg text-amber-200/80 transition-colors hover:text-amber-100"
                  >
                    <Mail className="h-5 w-5 text-amber-600/60 group-hover:text-amber-500 transition-colors" strokeWidth={1.5} />
                    <span className="font-serif">mail@pilot.place</span>
                  </a>
                  <div className="flex items-start gap-4">
                    <MapPin className="mt-1 h-5 w-5 shrink-0 text-stone-600" strokeWidth={1.5} />
                    <div>
                      <p className="font-sans text-xs tracking-[0.2em] text-stone-500 uppercase">{t.office_label}</p>
                      <p className="mt-1 font-serif">Rondo ONZ 1, 00-124 Warszawa</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <MapPin className="mt-1 h-5 w-5 shrink-0 text-stone-600" strokeWidth={1.5} />
                    <div>
                      <p className="font-sans text-xs tracking-[0.2em] text-stone-500 uppercase">{t.branch_label}</p>
                      <p className="mt-1 font-serif">ul. Opolska 110, 31-323 Kraków</p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="font-serif text-sm font-normal tracking-[0.3em] text-stone-500 uppercase">
                  {t.registry_heading}
                </h2>
                <dl className="mt-8 space-y-4 font-sans text-sm">
                  {t.registry.map(([label, value]) => (
                    <div key={label} className="flex justify-between border-b border-stone-800 pb-3">
                      <dt className="text-stone-500">{label}</dt>
                      <dd className="text-stone-300 tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            <div className="mt-16 flex items-center justify-between border-t border-stone-800 pt-8">
              <p className="font-sans text-xs text-stone-600">
                &copy; {new Date().getFullYear()} PILOT PSA
              </p>
              <a
                href={locale === "en" ? "/en/privacy" : "/pl/privacy"}
                className="font-sans text-xs text-stone-600 underline underline-offset-2 transition-colors hover:text-stone-400"
              >
                {t.privacy_link}
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
