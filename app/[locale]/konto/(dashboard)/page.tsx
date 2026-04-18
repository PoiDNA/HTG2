import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { redirect } from '@/i18n-config';
import { cookies } from 'next/headers';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/roles';
import { IMPERSONATE_USER_COOKIE } from '@/lib/admin/impersonate-const';
import { getDesignVariant } from '@/lib/design-variant';
import ActiveCallsWidget from '@/components/quick-call/ActiveCallsWidget';
import LatestYouTubeBanner from '@/components/konto/LatestYouTubeBanner';
import { getLatestYoutubeVideo } from '@/lib/services/latest-youtube-video';
import VodLibrarySection from './_sections/VodLibrarySection';
import RemainingSessionsSection from './_sections/RemainingSessionsSection';
import SanctuaryHero from './_sections/SanctuaryHero';
import ContinueCard from './_sections/ContinueCard';
import MomentsButton from '@/components/konto/MomentsButton';
import SesjeButton from '@/components/konto/SesjeButton';
import RadioWidget from '@/components/fragments/RadioWidget';

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
        redirect({href: '/konto/admin', locale});
      } else {
        const { data: profile } = await sessionClient.from('profiles').select('role').eq('id', user.id).single();
        if (profile?.role === 'admin') redirect({href: '/konto/admin', locale});
      }
    }
  }

  const variant = getDesignVariant(cookieStore);
  const latestVideo = await getLatestYoutubeVideo(locale);

  const ytCard = latestVideo ? (
    <LatestYouTubeBanner
      youtubeId={latestVideo.youtube_id}
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

        {/* YT po lewej / kręgi po prawej w kolumnie */}
        <div className="flex items-start gap-6 mb-6">
          {ytCard && <div className="flex-1 self-stretch min-h-[160px] relative">{ytCard}</div>}
          <div className="flex flex-col gap-6 shrink-0 ml-auto">
            <MomentsButton />
            <SesjeButton />
          </div>
        </div>

        <Suspense fallback={<SectionSkeleton title="Biblioteka audio" />}>
          <VodLibrarySection locale={locale} />
        </Suspense>

        <RadioWidget />

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

        {/* YT po lewej / kręgi po prawej w kolumnie */}
        <div className="flex items-start gap-6 mb-6">
          {ytCard && <div className="flex-1 self-stretch min-h-[160px] relative">{ytCard}</div>}
          <div className="flex flex-col gap-6 shrink-0 ml-auto">
            <MomentsButton />
            <SesjeButton />
          </div>
        </div>

        <Suspense fallback={<SectionSkeleton title="Nagrania z sesji" />}>
          <VodLibrarySection locale={locale} />
        </Suspense>

        <RadioWidget />

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

      {/* YT / Momenty / Sesje */}
      <div className={`grid grid-cols-1 ${ytCard ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-4 mb-6`}>
        {ytCard}
        <MomentsButton />
        <SesjeButton />
      </div>

      <Suspense fallback={<SectionSkeleton title="Twoja Biblioteka" />}>
        <VodLibrarySection locale={locale} />
      </Suspense>

      <RadioWidget />

      <Suspense fallback={<SectionSkeleton title="Pozostałe Sesje" />}>
        <RemainingSessionsSection locale={locale} />
      </Suspense>
    </div>
  );
}
