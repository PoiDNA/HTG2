import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../globals.css";
import ThemeProvider from "@/components/ThemeProvider";
// LocaleSwitcher removed — Polish only for now
import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { locales, routing } from "@/i18n-config";
import { Toaster } from "sonner";
import { cookies, headers } from "next/headers";
import { isNagraniaPortal } from "@/lib/portal";
import { getDesignVariant, canSwitchVariant } from "@/lib/design-variant";
import { DesignVariantProvider } from "@/lib/design-variant-context";
import { createSupabaseServer } from "@/lib/supabase/server";
import GlobalShellV1 from "@/components/variants/v1/GlobalShell";
import GlobalShellV2 from "@/components/variants/v2/GlobalShell";
import GlobalShellV3 from "@/components/variants/v3/GlobalShell";
import DesignVariantSwitcher from "@/components/DesignVariantSwitcher";

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
              var dark=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches);
              var d=document.documentElement;
              var v=${JSON.stringify(variant)};
              var palettes={
                v1:{bg:'#14100E',fg:'#E8DCD6',fm:'rgba(232,220,214,0.6)',c:'#221A1E',cb:'#322830',s:'#1C1418'},
                v2:{bg:'#0F172A',fg:'#E2E8F0',fm:'rgba(226,232,240,0.55)',c:'#1E293B',cb:'#334155',s:'#1A2332'},
                v3:{bg:'#0C0A09',fg:'#E7E5E4',fm:'rgba(231,229,228,0.50)',c:'#1C1917',cb:'#292524',s:'#171412'}
              };
              var lightPalettes={
                v1:{bg:'#FDF5F0',fg:'#3A2A30',fm:'rgba(58,42,48,0.6)',c:'#FFFFFF',cb:'rgba(155,74,92,0.08)',s:'rgba(155,74,92,0.04)'},
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
            }catch(e){}
          })();
        `}} />
      </head>
      <body className="bg-htg-bg text-htg-fg antialiased min-h-screen flex flex-col transition-colors duration-300">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-htg-sage focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-semibold">
          Przejdź do treści
        </a>
        <NextIntlClientProvider messages={messages} locale={locale}>
          <ThemeProvider variant={variant}>
            <DesignVariantProvider variant={variant}>
              <Shell isNagrania={isNagrania}>
                {children}
              </Shell>
              {showSwitcher && <DesignVariantSwitcher currentVariant={variant} locale={locale} />}
            </DesignVariantProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
