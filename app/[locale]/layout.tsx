import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../globals.css";
import SiteNav from "@/components/SiteNav";
import HeaderAuthButton from "@/components/HeaderAuthButton";
import Footer from "@/components/Footer";
import ThemeProvider from "@/components/ThemeProvider";
import ThemeToggle from "@/components/ThemeToggle";
// LocaleSwitcher removed — Polish only for now
import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { locales, routing } from "@/i18n-config";
import { Link } from "@/i18n-config";

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
      index: true,
      follow: true,
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

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Anti-flash: apply dark class + override Tailwind CSS vars before paint */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try{
              var t=localStorage.getItem('htg-theme');
              var dark=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches);
              if(dark){
                var d=document.documentElement;
                d.classList.add('dark');
                d.style.setProperty('--color-htg-bg','#121018');
                d.style.setProperty('--color-htg-fg','#E8E4DC');
                d.style.setProperty('--color-htg-fg-muted','rgba(232,228,220,0.6)');
                d.style.setProperty('--color-htg-card','#1E1A28');
                d.style.setProperty('--color-htg-card-border','#2A2538');
                d.style.setProperty('--color-htg-surface','#1A1624');
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
            <header className="bg-htg-card border-b border-htg-card-border sticky top-0 z-50 transition-colors duration-300">
              <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-3">
                  <span className="text-2xl font-serif font-bold text-htg-indigo">HTG</span>
                  <span className="hidden sm:inline-block text-xs text-htg-fg-muted border-l border-htg-card-border pl-3">
                    Hacking The Game
                  </span>
                </Link>
                <div className="flex items-center gap-4">
                  <SiteNav />
                  <div className="hidden md:flex items-center gap-2">
                    <ThemeToggle />
                  </div>
                  <HeaderAuthButton />
                </div>
              </div>
            </header>

            <main id="main-content" className="flex-grow w-full">
              {children}
            </main>

            <Footer />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
