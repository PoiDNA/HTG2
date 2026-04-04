import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../globals.css";
import SiteNav from "@/components/SiteNav";
import NavLinks from "@/components/NavLinks";
import Footer from "@/components/Footer";
import ThemeProvider from "@/components/ThemeProvider";
// LocaleSwitcher removed — Polish only for now
import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { locales, routing } from "@/i18n-config";
import { Link } from "@/i18n-config";
import { Toaster } from "sonner";
import { headers } from "next/headers";
import { isNagraniaPortal } from "@/lib/portal";
import HeaderLogo from "@/components/HeaderLogo";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  const languages: Record<string, string> = {
    'x-default': 'https://htgcyou.com/pl'
  };
  locales.forEach((l) => {
    languages[l] = `https://htgcyou.com/${l}`;
  });

  const title = t('title');
  const description = t('description');

  return {
    title: {
      default: title,
      template: `%s | HTG`,
    },
    description,
    metadataBase: new URL('https://htgcyou.com'),
    alternates: {
      canonical: `https://htgcyou.com/${locale}`,
      languages
    },
    robots: {
      index: false,
      follow: false,
    },
    openGraph: {
      type: 'website',
      siteName: 'HTG — Hacking The Game',
      title,
      description,
      url: `https://htgcyou.com/${locale}`,
      locale: locale === 'pl' ? 'pl_PL' : 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  const headersList = await headers();
  const isNagrania = isNagraniaPortal(headersList.get('host'));

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Block Dark Reader from mutating hero section */}
        <meta name="darkreader-lock" />
        <meta name="theme-color" content="#9B4A5C" />
        <meta name="msapplication-TileColor" content="#9B4A5C" />
        <meta name="msapplication-TileImage" content="https://htg2-cdn.b-cdn.net/images/mstile-150x150.png" />
        {/* Preload hero glow asset */}
        <link rel="preload" href="/hero/glow.avif" as="image" type="image/avif" fetchPriority="high" />
        {/* Anti-flash: apply dark class + override Tailwind CSS vars before paint */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try{
              var t=localStorage.getItem('htg-theme');
              var dark=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches);
              if(dark){
                var d=document.documentElement;
                d.classList.add('dark');
                d.style.setProperty('--color-htg-bg','#14100E');
                d.style.setProperty('--color-htg-fg','#E8DCD6');
                d.style.setProperty('--color-htg-fg-muted','rgba(232,220,214,0.6)');
                d.style.setProperty('--color-htg-card','#221A1E');
                d.style.setProperty('--color-htg-card-border','#322830');
                d.style.setProperty('--color-htg-surface','#1C1418');
              }
            }catch(e){}
          })();
        `}} />
      </head>
      <body className="bg-htg-bg text-htg-fg antialiased min-h-screen flex flex-col transition-colors duration-300">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-htg-sage focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-semibold">
          Przejdź do treści
        </a>
        <NextIntlClientProvider messages={messages} locale={locale}>
          <ThemeProvider>
            {!isNagrania && (
              <header className="bg-htg-card border-b border-htg-card-border sticky top-0 z-50 transition-colors duration-300">
                <div className="mx-auto max-w-6xl px-6 py-4 grid grid-cols-[auto_1fr_auto] items-center gap-4 relative">
                  <Link href="/" className="flex items-center" aria-label="Strona główna HTG">
                    <HeaderLogo />
                  </Link>
                  <NavLinks />
                  <div className="col-start-3 flex justify-end">
                    <SiteNav />
                  </div>
                </div>
              </header>
            )}

            <main id="main-content" className="flex-grow w-full">
              {children}
            </main>

            {!isNagrania && <Footer />}
            <Toaster richColors position="bottom-right" />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
