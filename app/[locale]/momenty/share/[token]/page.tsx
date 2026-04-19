import { setRequestLocale } from 'next-intl/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { Link } from '@/i18n-config';
import { Lock, ArrowLeft } from 'lucide-react';
import SharePageClient from './SharePageClient';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Udostępnione Momenty — HTG',
};

type Props = { params: Promise<{ locale: string; token: string }> };

// Inline error page helper — keeps share-specific messaging vs. generic 404
function ShareError({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <Lock className="w-12 h-12 text-htg-fg-muted mx-auto mb-4" />
        <h1 className="text-xl font-semibold text-htg-fg mb-2">{title}</h1>
        <p className="text-sm text-htg-fg-muted mb-6">{message}</p>
        <Link
          href="/konto"
          className="inline-flex items-center gap-1.5 text-sm text-htg-sage hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Wróć do konta
        </Link>
      </div>
    </div>
  );
}

export default async function ShareTokenPage({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  // Auth is enforced by middleware — if we reach here the user is logged in.
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const db = createSupabaseServiceRole();

  // Look up share by token
  const { data: share } = await db
    .from('category_shares')
    .select('id, category_id, owner_user_id, recipient_user_id, can_resave, expires_at, revoked_at')
    .eq('share_token', token)
    .is('revoked_at', null)
    .single();

  if (!share) {
    return (
      <ShareError

        title="Link nieważny"
        message="Ten link do udostępnienia nie istnieje lub został unieważniony."
      />
    );
  }

  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return (
      <ShareError

        title="Link wygasł"
        message="Ten link udostępniający wygasł. Poproś właściciela o nowy."
      />
    );
  }

  if (share.recipient_user_id && share.recipient_user_id !== user.id) {
    return (
      <ShareError

        title="Brak dostępu"
        message="Ten link jest przypisany do innego konta."
      />
    );
  }

  // Fetch category info
  const { data: category } = await db
    .from('user_categories')
    .select('id, name, color')
    .eq('id', share.category_id)
    .single();

  // Fetch saves — include session_template_id for playback (needed client-side, not PII)
  // booking_recording saves cannot appear in shared categories by design
  const { data: rawSaves } = await db
    .from('user_fragment_saves')
    .select(`
      id, fragment_type,
      session_template_id,
      custom_start_sec, custom_end_sec, custom_title,
      fallback_start_sec, fallback_end_sec,
      session_fragments(title),
      session_templates!inner(id, title, slug)
    `)
    .eq('category_id', share.category_id)
    .is('booking_recording_id', null)
    .order('created_at', { ascending: false })
    .limit(100);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const saves = (rawSaves ?? []).map((s: any) => {
    const isCustom = s.fragment_type === 'custom';
    const startSec: number = isCustom ? (s.custom_start_sec ?? 0) : (s.fallback_start_sec ?? 0);
    const endSec: number   = isCustom ? (s.custom_end_sec ?? 0)   : (s.fallback_end_sec ?? 0);
    const fragmentTitle: string | null = s.custom_title
      ?? (Array.isArray(s.session_fragments) ? s.session_fragments[0]?.title : s.session_fragments?.title)
      ?? null;
    const st = Array.isArray(s.session_templates) ? s.session_templates[0] : s.session_templates;

    const fmt = (sec: number) => {
      const m = Math.floor(sec / 60);
      const ss = Math.floor(sec % 60);
      return `${m}:${ss.toString().padStart(2, '0')}`;
    };

    return {
      id: s.id as string,
      title: fragmentTitle ?? `${fmt(startSec)} – ${fmt(endSec)}`,
      start_sec: startSec,
      end_sec: endSec,
      duration: endSec - startSec,
      session_title: (st?.title ?? '') as string,
      session_slug: (st?.slug ?? null) as string | null,
      session_template_id: (s.session_template_id ?? st?.id ?? null) as string | null,
    };
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Back link */}
      <Link
        href="/konto"
        className="inline-flex items-center gap-1.5 text-sm text-htg-fg-muted hover:text-htg-fg mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Wróć do konta
      </Link>

      <SharePageClient
        shareToken={token}
        categoryName={category?.name ?? 'Momenty'}
        categoryColor={category?.color ?? null}
        canResave={share.can_resave}
        expiresAt={share.expires_at ?? null}
        saves={saves}
        userId={user.id}
      />
    </div>
  );
}
