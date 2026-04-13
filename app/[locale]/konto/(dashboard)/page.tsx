import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/roles';
import { IMPERSONATE_USER_COOKIE } from '@/lib/admin/impersonate-const';
import { getDesignVariant } from '@/lib/design-variant';
import ActiveCallsWidget from '@/components/quick-call/ActiveCallsWidget';
import LatestYouTubeBanner from '@/components/konto/LatestYouTubeBanner';
import { getLatestYoutubeVideo } from '@/lib/services/latest-youtube-video';
import NextSessionSection from './_sections/NextSessionSection';
import VodLibrarySection from './_sections/VodLibrarySection';
import RemainingSessionsSection from './_sections/RemainingSessionsSection';
import SanctuaryHero from './_sections/SanctuaryHero';
import ContinueCard from './_sections/ContinueCard';
import SluchajButton from '@/components/konto/SluchajButton';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

function SectionSkeleton({ title }: { title: string }) {
  return (
    <div className="mb-10 animate-pulse">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-5 h-5 rounded bg-htg-surface" />
        <h2 className="text-lg font-serif font-semibold text-htg-fg">{title}</h2>
      </div>
      <div className="space-y-3">
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-4 h-20" />
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-4 h-20" />
      </div>
    </div>
  );
}

export default async function AccountDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Redirect admin to admin dashboard (unless impersonating a user)
  const cookieStore = await cookies();
  const isImpersonating = !!cookieStore.get(IMPERSONATE_USER_COOKIE)?.value;
  if (!isImpersonating) {
    const sessionClient = await createSupabaseServer();
    const { data: { user } } = await sessionClient.auth.getUser();
    if (user) {
      const isAdminByEmail = isAdminEmail(user.email ?? '');
      if (isAdminByEmail) {
        redirect(`/${locale}/konto/admin`);
      } else {
        const { data: profile } = await sessionClient.from('profiles').select('role').eq('id', user.id).single();
        if (profile?.role === 'admin') redirect(`/${locale}/konto/admin`);
      }
    }
  }

  const variant = getDesignVariant(cookieStore);
  const latestVideo = await getLatestYoutubeVideo(locale);

  const ytBanner = latestVideo ? (
    <LatestYouTubeBanner
      youtubeId={latestVideo.youtube_id}
      title={latestVideo.title}
      thumbnailUrl={latestVideo.thumbnail_url}
    />
  ) : null;

  // ─── V2 "Sanctuary" — focused listening ─────────────────────
  if (variant === 'v2') {
    return (
      <div>
        {/* ActiveCalls only as critical exception */}
        <ActiveCallsWidget locale={locale} />

        <Suspense fallback={<SectionSkeleton title="Następna sesja" />}>
          <SanctuaryHero locale={locale} />
        </Suspense>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          {ytBanner && <div className="flex-1 min-w-0">{ytBanner}</div>}
          <SluchajButton />
        </div>

        <Suspense fallback={<SectionSkeleton title="Biblioteka audio" />}>
          <VodLibrarySection locale={locale} />
        </Suspense>

        <Suspense fallback={<SectionSkeleton title="Pozostałe Sesje" />}>
          <RemainingSessionsSection locale={locale} />
        </Suspense>
      </div>
    );
  }

  // ─── V3 "Sanctum" — continuity ──────────────────────────────
  if (variant === 'v3') {
    return (
      <div>
        {/* ActiveCalls only as critical exception */}
        <ActiveCallsWidget locale={locale} />

        <Suspense fallback={<SectionSkeleton title="Kontynuuj" />}>
          <ContinueCard locale={locale} />
        </Suspense>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          {ytBanner && <div className="flex-1 min-w-0">{ytBanner}</div>}
          <SluchajButton />
        </div>

        <Suspense fallback={<SectionSkeleton title="Nagrania z sesji" />}>
          <VodLibrarySection locale={locale} />
        </Suspense>

        <Suspense fallback={<SectionSkeleton title="Pozostałe Sesje" />}>
          <RemainingSessionsSection locale={locale} />
        </Suspense>
      </div>
    );
  }

  // ─── V1 default ─────────────────────────────────────────────
  return (
    <div>
      <ActiveCallsWidget locale={locale} />

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        {ytBanner && <div className="flex-1 min-w-0">{ytBanner}</div>}
        <SluchajButton />
      </div>

      <Suspense fallback={<SectionSkeleton title="Twoja Biblioteka" />}>
        <VodLibrarySection locale={locale} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="Pozostałe Sesje" />}>
        <RemainingSessionsSection locale={locale} />
      </Suspense>
    </div>
  );
}
