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
import { getDesignVariant } from "@/lib/design-variant";
import { DesignVariantProvider } from "@/lib/design-variant-context";
import { isAdminEmail } from "@/lib/roles";
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

  // Check admin for switcher visibility
  let isAdmin = false;
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) isAdmin = isAdminEmail(user.email);
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
            <DesignVariantProvider variant={variant}>
              <Shell isNagrania={isNagrania}>
                {children}
              </Shell>
              {isAdmin && <DesignVariantSwitcher currentVariant={variant} locale={locale} />}
            </DesignVariantProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
