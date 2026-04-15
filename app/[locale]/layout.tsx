import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../globals.css";
import ThemeProvider from "@/components/ThemeProvider";
// LocaleSwitcher is rendered inside SiteNav (via GlobalShell)
import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { locales, routing } from "@/i18n-config";
import { Toaster } from "sonner";
import { cookies, headers } from "next/headers";
import { isAnyPortal, isPilotSite } from "@/lib/portal";
import { getDesignVariant, canSwitchVariant } from "@/lib/design-variant";
import { DesignVariantProvider } from "@/lib/design-variant-context";
import { createSupabaseServer } from "@/lib/supabase/server";
import GlobalShellV1 from "@/components/variants/v1/GlobalShell";
import GlobalShellV2 from "@/components/variants/v2/GlobalShell";
import GlobalShellV3 from "@/components/variants/v3/GlobalShell";
import DesertCanvas from "@/components/DesertCanvas";
import DesignVariantSwitcher from "@/components/DesignVariantSwitcher";
import { PlayerProvider } from "@/lib/player-context";
import GlobalPlayer from "@/components/player/GlobalPlayer";
import StickyPlayer from "@/components/variants/v3/StickyPlayer";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);

  // Pilot site — separate metadata, no HTG branding
  const headersList = await headers();
  if (isPilotSite(headersList.get('x-forwarded-host') || headersList.get('host'))) {
    const isPilotEn = locale === 'en';
    return {
      title: { absolute: isPilotEn ? 'PILOT — Educational and personal development platforms' : 'PILOT — Platformy edukacyjne i rozwojowe' },
      description: isPilotEn
        ? 'Online platforms for learning and personal growth — built and operated with care. PILOT PSA, Warsaw.'
        : 'Platformy internetowe dla uczenia się i rozwoju osobistego. PILOT Prosta Spółka Akcyjna, Warszawa.',
      metadataBase: new URL('https://pilot.place'),
      robots: { index: true, follow: true },
      openGraph: {
        type: 'website',
        siteName: 'PILOT',
        title: isPilotEn ? 'PILOT — Educational and personal development platforms' : 'PILOT — Platformy edukacyjne i rozwojowe',
        description: isPilotEn ? 'Online platforms for learning and personal growth' : 'Platformy edukacyjne i rozwojowe osobistego',
        url: 'https://pilot.place',
        locale: isPilotEn ? 'en_US' : 'pl_PL',
      },
    };
  }

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
      locale: ({ pl: 'pl_PL', en: 'en_US', de: 'de_DE', pt: 'pt_PT' } as Record<string, string>)[locale] || 'pl_PL',
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

  const headersList = await headers();
  const effectiveHost = headersList.get('x-forwarded-host') || headersList.get('host');

  // Pilot site — allow de/pt locales before next-intl notFound() guard
  if (isPilotSite(effectiveHost)) {
    const PILOT_LOCALES = ['pl', 'en', 'de', 'pt'];
    if (!PILOT_LOCALES.includes(locale)) notFound();
    if (locale === 'pl' || locale === 'en') setRequestLocale(locale);
    const messages = locale === 'pl' || locale === 'en' ? await getMessages() : {};
    return (
      <html lang={locale}>
        <head>
          <link rel="icon" href="/pilot-favicon.png" type="image/png" />
          <link rel="apple-touch-icon" href="/pilot-favicon.png" />
        </head>
        <body className="bg-white text-stone-800 antialiased min-h-screen">
          <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-teal-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-semibold">
            Przejdź do treści
          </a>
          <NextIntlClientProvider messages={messages} locale={locale}>
            {children}
          </NextIntlClientProvider>
        </body>
      </html>
    );
  }

  // Standard HTG site — validate next-intl locale
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  const isNagrania = isAnyPortal(effectiveHost);

  // Design variant (cookie-based, admin-only switching)
  const cookieStore = await cookies();
  const variant = getDesignVariant(cookieStore);

  // Check if user can switch variants (admin or tester)
  let showSwitcher = false;
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) showSwitcher = canSwitchVariant(user.email);
  } catch { /* not logged in — no switcher */ }

  // Select shell based on variant
  const Shell = variant === 'v3' ? GlobalShellV3
              : variant === 'v2' ? GlobalShellV2
              : GlobalShellV1;

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
        {/* Anti-flash: apply dark class + variant-specific CSS vars before paint */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try{
              var t=localStorage.getItem('htg-theme');
              var dark=t==='dark'||(v==='v3'&&!t)||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches);
              var d=document.documentElement;
              var v=${JSON.stringify(variant)};
              var palettes={
                v1:{bg:'#14100E',fg:'#E8DCD6',fm:'rgba(232,220,214,0.6)',c:'#221A1E',cb:'#322830',s:'#1C1418'},
                v2:{bg:'#0F172A',fg:'#E2E8F0',fm:'rgba(226,232,240,0.55)',c:'#1E293B',cb:'#334155',s:'#1A2332'},
                v3:{bg:'#0C0A09',fg:'#E7E5E4',fm:'rgba(231,229,228,0.50)',c:'#1C1917',cb:'#292524',s:'#171412'}
              };
              var lightPalettes={
                v1:{bg:'#F4F6FB',fg:'#1E293B',fm:'rgba(30,41,59,0.55)',c:'#FFFFFF',cb:'rgba(71,85,105,0.10)',s:'rgba(71,85,105,0.04)'},
                v2:{bg:'#F4F6FB',fg:'#1E293B',fm:'rgba(30,41,59,0.55)',c:'#FFFFFF',cb:'rgba(71,85,105,0.10)',s:'rgba(71,85,105,0.04)'},
                v3:{bg:'#FAFAF9',fg:'#292524',fm:'rgba(41,37,36,0.50)',c:'#FFFFFF',cb:'rgba(41,37,36,0.06)',s:'rgba(41,37,36,0.03)'}
              };
              var p=dark?palettes[v]:lightPalettes[v];
              if(dark) d.classList.add('dark');
              d.style.setProperty('--color-htg-bg',p.bg);
              d.style.setProperty('--color-htg-fg',p.fg);
              d.style.setProperty('--color-htg-fg-muted',p.fm);
              d.style.setProperty('--color-htg-card',p.c);
              d.style.setProperty('--color-htg-card-border',p.cb);
              d.style.setProperty('--color-htg-surface',p.s);
              if(v==='v3'){
                d.style.setProperty('--color-htg-indigo','#B8860B');
                d.style.setProperty('--color-htg-indigo-light','#D4A840');
              }
            }catch(e){}
          })();
        `}} />
      </head>
      <body className={`bg-htg-bg text-htg-fg antialiased min-h-screen flex flex-col transition-colors duration-300${variant === 'v1' ? ' desert-active' : ''}`}>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-htg-sage focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-semibold">
          {(await getTranslations({ locale, namespace: 'Nav' }))('skip_to_content')}
        </a>
        <NextIntlClientProvider messages={messages} locale={locale}>
          <ThemeProvider variant={variant}>
            {variant === 'v1' && <DesertCanvas />}
            <DesignVariantProvider variant={variant}>
              <PlayerProvider>
                <Shell isNagrania={isNagrania}>
                  {children}
                </Shell>
                {variant === 'v3' && <GlobalPlayer />}
                {variant === 'v3' && <StickyPlayer />}
                {showSwitcher && <DesignVariantSwitcher currentVariant={variant} locale={locale} />}
              </PlayerProvider>
            </DesignVariantProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
