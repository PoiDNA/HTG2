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
    <div className="font-sans">
      {/* ── Hero ──────────────────────────────────────────────── */}
      <header className="bg-white">
        <div className="mx-auto max-w-4xl px-6 py-20 text-center sm:py-28">
          <h1 className="text-4xl font-bold tracking-tight text-stone-900 sm:text-5xl">
            PILOT
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-teal-700 font-medium sm:text-xl">
            Bezpieczne platformy edukacyjne i rozwojowe
          </p>
        </div>
      </header>

      <main id="main-content">
        {/* ── O nas ────────────────────────────────────────────── */}
        <section className="bg-stone-50">
          <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
            <h2 className="text-2xl font-semibold text-stone-900 sm:text-3xl">
              O nas
            </h2>
            <div className="mt-6 space-y-4 text-stone-700 leading-relaxed max-w-prose">
              <p>
                PILOT Prosta Spółka Akcyjna to firma technologiczna łącząca
                kompetencje z zakresu cyberbezpieczeństwa z budową
                i administracją serwisów internetowych w branży edukacyjnej
                i rozwojowej. Bezpieczeństwo przetwarzanych danych stanowi
                fundament każdego naszego projektu.
              </p>
              <p>
                Spółka została zarejestrowana w 2026 roku i działa jako prosta
                spółka akcyjna (PSA). Działamy z dwóch lokalizacji — siedziby
                w Warszawie przy Rondzie ONZ oraz oddziału w Krakowie.
              </p>
            </div>
          </div>
        </section>

        {/* ── Usługi ───────────────────────────────────────────── */}
        <section className="bg-white">
          <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
            <h2 className="text-2xl font-semibold text-stone-900 sm:text-3xl">
              Co robimy
            </h2>
            <div className="mt-10 grid gap-8 sm:grid-cols-2">
              {SERVICES.map((svc) => {
                const Icon = svc.icon;
                return (
                  <div
                    key={svc.title}
                    className="rounded-2xl border border-stone-200 bg-white p-8 transition-shadow hover:shadow-md"
                  >
                    <Icon className="h-8 w-8 text-teal-600" strokeWidth={1.5} />
                    <h3 className="mt-4 text-xl font-semibold text-stone-900">
                      {svc.title}
                    </h3>
                    <p className="mt-3 text-stone-600 leading-relaxed">
                      {svc.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Podejście do bezpieczeństwa ──────────────────────── */}
        <section className="bg-stone-50">
          <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
            <h2 className="text-2xl font-semibold text-stone-900 sm:text-3xl">
              Podejście do bezpieczeństwa
            </h2>
            <p className="mt-6 text-stone-700 leading-relaxed max-w-prose">
              Projektujemy procesy i systemy z uwzględnieniem wymogów RODO oraz
              standardów branżowych. Stosujemy zasadę minimalizacji danych,
              kontrolę dostępu i monitorowanie infrastruktury.
            </p>
          </div>
        </section>

        {/* ── Dane rejestrowe + kontakt ────────────────────────── */}
        <section className="bg-white border-t border-stone-200">
          <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
            <h2 className="text-2xl font-semibold text-stone-900 sm:text-3xl">
              Kontakt
            </h2>

            <div className="mt-8 space-y-4 text-stone-700">
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" strokeWidth={1.5} />
                <a
                  href="mailto:mail@pilot.place"
                  className="text-teal-700 underline underline-offset-2 hover:text-teal-900"
                >
                  mail@pilot.place
                </a>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" strokeWidth={1.5} />
                <div>
                  <p className="font-medium text-stone-900">Siedziba</p>
                  <p>Rondo ONZ 1, 00-124 Warszawa</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" strokeWidth={1.5} />
                <div>
                  <p className="font-medium text-stone-900">Oddział</p>
                  <p>ul. Opolska 110, 31-323 Kraków</p>
                </div>
              </div>
            </div>

            {/* Dane rejestrowe */}
            <div className="mt-12 rounded-2xl border border-stone-200 bg-stone-50 p-8">
              <h3 className="text-lg font-semibold text-stone-900">
                Dane rejestrowe
              </h3>
              <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm text-stone-600 sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-stone-500">Firma</dt>
                  <dd>PILOT Prosta Spółka Akcyjna</dd>
                </div>
                <div>
                  <dt className="font-medium text-stone-500">Forma prawna</dt>
                  <dd>Prosta Spółka Akcyjna (PSA)</dd>
                </div>
                <div>
                  <dt className="font-medium text-stone-500">KRS</dt>
                  <dd>0001233166</dd>
                </div>
                <div>
                  <dt className="font-medium text-stone-500">NIP</dt>
                  <dd>5253085101</dd>
                </div>
                <div>
                  <dt className="font-medium text-stone-500">REGON</dt>
                  <dd>544401249</dd>
                </div>
                <div>
                  <dt className="font-medium text-stone-500">
                    Kapitał akcyjny
                  </dt>
                  <dd>100 000,00 PLN</dd>
                </div>
              </dl>
            </div>

            {/* Polityka prywatności placeholder */}
            <p className="mt-8 text-sm text-stone-400">
              <a href="/privacy" className="underline underline-offset-2 hover:text-stone-600">
                Polityka prywatności
              </a>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
