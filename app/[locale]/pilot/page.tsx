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

export const metadata: Metadata = {
  title: { absolute: "PILOT — Bezpieczne platformy edukacyjne i rozwojowe" },
  description:
    "Cyberbezpieczeństwo i administracja serwisów edukacyjnych. PILOT Prosta Spółka Akcyjna.",
};

const SERVICES = [
  {
    icon: BookOpen,
    title: "Serwisy edukacyjne i rozwojowe",
    description:
      "Projektujemy, budujemy i administrujemy platformy internetowe wspierające procesy edukacyjne i rozwój kompetencji. Dbamy o niezawodność, wydajność i bezpieczeństwo każdego serwisu.",
  },
  {
    icon: Shield,
    title: "Cyberbezpieczeństwo",
    description:
      "Rdzeń naszych kompetencji. Minimalizacja powierzchni ataku, segmentacja środowisk, oceny bezpieczeństwa i wsparcie przy wdrożeniach zgodnych z przepisami o ochronie danych.",
  },
  {
    icon: Server,
    title: "Infrastruktura i przetwarzanie danych",
    description:
      "Sieci dostarczania treści (CDN), hosting i zarządzanie danymi. Systemy projektowane z myślą o wydajności i ochronie prywatności.",
  },
  {
    icon: FlaskConical,
    title: "Badania i rozwój",
    description:
      "Prace badawczo-rozwojowe nad rozwiązaniami na styku edukacji, technologii i bezpieczeństwa cyfrowego.",
  },
] as const;

export default async function PilotPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="font-serif">
      {/* ── Hero ──────────────────────────────────────────────── */}
      <header className="relative overflow-hidden bg-stone-900">
        {/* Subtle texture overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }} />
        <div className="relative mx-auto max-w-4xl px-6 py-24 text-center sm:py-32">
          {/* Decorative line */}
          <div className="mx-auto mb-8 h-px w-16 bg-amber-600/60" />
          <h1 className="font-serif text-5xl font-light tracking-wide text-white sm:text-6xl lg:text-7xl">
            PILOT
          </h1>
          <div className="mx-auto mt-6 h-px w-24 bg-gradient-to-r from-transparent via-amber-600/50 to-transparent" />
          <p className="mt-8 font-sans text-lg font-light tracking-wide text-stone-300 sm:text-xl">
            Bezpieczne platformy edukacyjne i rozwojowe
          </p>
          <a
            href="mailto:mail@pilot.place"
            className="mt-10 inline-flex items-center gap-2 border border-amber-700/40 bg-amber-700/10 px-8 py-3 font-sans text-sm font-medium tracking-widest text-amber-200 uppercase transition-all hover:border-amber-600/60 hover:bg-amber-700/20 hover:text-amber-100"
          >
            Kontakt
            <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </a>
        </div>
      </header>

      <main id="main-content">
        {/* ── O nas ────────────────────────────────────────────── */}
        <section className="border-b border-stone-200 bg-white">
          <div className="mx-auto max-w-3xl px-6 py-20 sm:py-28">
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-stone-200" />
              <h2 className="font-serif text-sm font-normal tracking-[0.3em] text-stone-400 uppercase">
                O nas
              </h2>
              <div className="h-px flex-1 bg-stone-200" />
            </div>
            <div className="mt-10 space-y-6 font-serif text-lg leading-[1.8] text-stone-600 max-w-prose mx-auto text-center">
              <p>
                PILOT Prosta Spółka Akcyjna to firma technologiczna łącząca
                kompetencje z zakresu cyberbezpieczeństwa z budową
                i&nbsp;administracją serwisów internetowych w&nbsp;branży edukacyjnej
                i&nbsp;rozwojowej.
              </p>
              <p className="text-stone-800 font-medium italic">
                Bezpieczeństwo przetwarzanych danych stanowi fundament
                każdego naszego projektu.
              </p>
              <p>
                Spółka została zarejestrowana w&nbsp;2026 roku i&nbsp;działa jako prosta
                spółka akcyjna (PSA). Działamy z&nbsp;dwóch lokalizacji&nbsp;— siedziby
                w&nbsp;Warszawie przy Rondzie ONZ oraz oddziału w&nbsp;Krakowie.
              </p>
            </div>
          </div>
        </section>

        {/* ── Usługi ───────────────────────────────────────────── */}
        <section className="bg-stone-50">
          <div className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-stone-300/60" />
              <h2 className="font-serif text-sm font-normal tracking-[0.3em] text-stone-400 uppercase">
                Zakres działalności
              </h2>
              <div className="h-px flex-1 bg-stone-300/60" />
            </div>
            <div className="mt-14 grid gap-0 sm:grid-cols-2">
              {SERVICES.map((svc, i) => {
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

        {/* ── Podejście do bezpieczeństwa ──────────────────────── */}
        <section className="border-y border-stone-200 bg-white">
          <div className="mx-auto max-w-3xl px-6 py-20 sm:py-28">
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-stone-200" />
              <h2 className="font-serif text-sm font-normal tracking-[0.3em] text-stone-400 uppercase">
                Bezpieczeństwo
              </h2>
              <div className="h-px flex-1 bg-stone-200" />
            </div>
            <div className="mx-auto mt-10 max-w-prose text-center">
              <p className="font-serif text-lg leading-[1.8] text-stone-600">
                Projektujemy procesy i&nbsp;systemy z&nbsp;uwzględnieniem wymogów RODO oraz
                standardów branżowych. Stosujemy zasadę minimalizacji danych,
                kontrolę dostępu i&nbsp;monitorowanie infrastruktury.
              </p>
              <div className="mx-auto mt-10 flex flex-wrap justify-center gap-6 font-sans text-xs tracking-[0.2em] text-stone-400 uppercase">
                <span className="border border-stone-200 px-4 py-2">RODO</span>
                <span className="border border-stone-200 px-4 py-2">Minimalizacja danych</span>
                <span className="border border-stone-200 px-4 py-2">Kontrola dostępu</span>
                <span className="border border-stone-200 px-4 py-2">Monitoring</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Kontakt + dane rejestrowe ────────────────────────── */}
        <section className="bg-stone-900 text-stone-300">
          <div className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
            <div className="grid gap-16 sm:grid-cols-2">
              {/* Kontakt */}
              <div>
                <h2 className="font-serif text-sm font-normal tracking-[0.3em] text-stone-500 uppercase">
                  Kontakt
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
                      <p className="font-sans text-xs tracking-[0.2em] text-stone-500 uppercase">Siedziba</p>
                      <p className="mt-1 font-serif">Rondo ONZ 1, 00-124 Warszawa</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <MapPin className="mt-1 h-5 w-5 shrink-0 text-stone-600" strokeWidth={1.5} />
                    <div>
                      <p className="font-sans text-xs tracking-[0.2em] text-stone-500 uppercase">Oddział</p>
                      <p className="mt-1 font-serif">ul. Opolska 110, 31-323 Kraków</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dane rejestrowe */}
              <div>
                <h2 className="font-serif text-sm font-normal tracking-[0.3em] text-stone-500 uppercase">
                  Dane rejestrowe
                </h2>
                <dl className="mt-8 space-y-4 font-sans text-sm">
                  {[
                    ["Firma", "PILOT Prosta Spółka Akcyjna"],
                    ["Forma prawna", "Prosta Spółka Akcyjna (PSA)"],
                    ["KRS", "0001233166"],
                    ["NIP", "5253085101"],
                    ["REGON", "544401249"],
                    ["Kapitał akcyjny", "100\u00a0000,00 PLN"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between border-b border-stone-800 pb-3">
                      <dt className="text-stone-500">{label}</dt>
                      <dd className="text-stone-300 tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            {/* Footer line */}
            <div className="mt-16 flex items-center justify-between border-t border-stone-800 pt-8">
              <p className="font-sans text-xs text-stone-600">
                &copy; {new Date().getFullYear()} PILOT PSA
              </p>
              <a
                href="/privacy"
                className="font-sans text-xs text-stone-600 underline underline-offset-2 transition-colors hover:text-stone-400"
              >
                Polityka prywatności
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
