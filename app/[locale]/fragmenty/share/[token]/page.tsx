import { setRequestLocale } from 'next-intl/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { Link } from '@/i18n-config';
import { Bookmark, Lock, Music, ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Udostępnione fragmenty — HTG',
};

type Props = { params: Promise<{ locale: string; token: string }> };

function formatTime(sec: number | null): string {
  if (sec == null) return '?';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

export default async function ShareTokenPage({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  // Login required — redirect to login with return URL
  if (!user) {
    redirect(`/${locale}/logowanie?next=/${locale}/fragmenty/share/${token}`);
  }

  const db = createSupabaseServiceRole();

  // Look up share (no rate-limit server-side here — the API route enforces it)
  const { data: share } = await db
    .from('category_shares')
    .select('id, category_id, owner_user_id, recipient_user_id, can_resave, expires_at, revoked_at')
    .eq('share_token', token)
    .is('revoked_at', null)
    .single();

  // Invalid / revoked
  if (!share) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <Lock className="w-12 h-12 text-htg-fg-muted mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-htg-fg mb-2">Link nieważny</h1>
          <p className="text-sm text-htg-fg-muted mb-6">
            Ten link do udostępnienia nie istnieje lub został unieważniony.
          </p>
          <Link href="/konto" className="text-htg-sage text-sm hover:underline">← Wróć do konta</Link>
        </div>
      </div>
    );
  }

  // Expired
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <Lock className="w-12 h-12 text-htg-fg-muted mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-htg-fg mb-2">Link wygasł</h1>
          <p className="text-sm text-htg-fg-muted mb-6">
            Ten link udostępniający wygasł. Poproś właściciela o nowy.
          </p>
          <Link href="/konto" className="text-htg-sage text-sm hover:underline">← Wróć do konta</Link>
        </div>
      </div>
    );
  }

  // Recipient restriction (direct share)
  if (share.recipient_user_id && share.recipient_user_id !== user.id) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <Lock className="w-12 h-12 text-htg-fg-muted mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-htg-fg mb-2">Brak dostępu</h1>
          <p className="text-sm text-htg-fg-muted mb-6">
            Ten link jest przypisany do innego konta.
          </p>
          <Link href="/konto" className="text-htg-sage text-sm hover:underline">← Wróć do konta</Link>
        </div>
      </div>
    );
  }

  // Fetch category
  const { data: category } = await db
    .from('user_categories')
    .select('id, name, color')
    .eq('id', share.category_id)
    .single();

  // Fetch saves in category (field allowlist — no owner PII)
  const { data: rawSaves } = await db
    .from('user_fragment_saves')
    .select(`
      id, fragment_type,
      custom_start_sec, custom_end_sec, custom_title,
      fallback_start_sec, fallback_end_sec,
      session_fragments(title),
      session_templates!inner(id, title, slug)
    `)
    .eq('category_id', share.category_id)
    .is('booking_recording_id', null)
    .order('created_at', { ascending: false })
    .limit(100);

  const saves = (rawSaves ?? []).map((s: any) => {
    const isCustom = s.fragment_type === 'custom';
    const startSec = isCustom ? s.custom_start_sec : s.fallback_start_sec;
    const endSec = isCustom ? s.custom_end_sec : s.fallback_end_sec;
    const fragmentTitle = s.custom_title
      ?? (Array.isArray(s.session_fragments) ? s.session_fragments[0]?.title : s.session_fragments?.title)
      ?? null;
    const st = Array.isArray(s.session_templates) ? s.session_templates[0] : s.session_templates;
    return {
      id: s.id,
      title: fragmentTitle ?? `${formatTime(startSec)} – ${formatTime(endSec)}`,
      startSec,
      endSec,
      sessionTitle: st?.title ?? null,
    };
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Back link */}
      <Link
        href="/konto"
        className="inline-flex items-center gap-1.5 text-sm text-htg-fg-muted hover:text-htg-fg mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Wróć do konta
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: category?.color ? `${category.color}20` : undefined }}
        >
          <Bookmark className="w-5 h-5" style={{ color: category?.color ?? undefined }} />
        </div>
        <div>
          <p className="text-xs text-htg-fg-muted uppercase tracking-wide">Udostępnione fragmenty</p>
          <h1 className="text-xl font-semibold text-htg-fg">{category?.name ?? 'Fragmenty'}</h1>
        </div>
      </div>

      {/* Resave note */}
      {share.can_resave && (
        <p className="text-xs text-htg-fg-muted bg-htg-surface border border-htg-card-border rounded-lg px-4 py-2 mb-6">
          Możesz zapisać te fragmenty do swojej biblioteki.
        </p>
      )}

      {/* Fragment list (read-only) */}
      {saves.length === 0 ? (
        <div className="text-center py-16 text-htg-fg-muted">
          <Bookmark className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Ta kategoria jest pusta.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {saves.map(save => (
            <div
              key={save.id}
              className="bg-htg-card border border-htg-card-border rounded-xl p-4"
            >
              <div className="flex items-center gap-1.5 text-xs text-htg-fg-muted mb-1">
                <Music className="w-3 h-3 text-htg-sage" />
                <span>{save.sessionTitle}</span>
              </div>
              <p className="text-htg-fg font-medium text-sm">{save.title}</p>
              <p className="text-xs text-htg-fg-muted mt-0.5">
                {formatTime(save.startSec)} – {formatTime(save.endSec)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
