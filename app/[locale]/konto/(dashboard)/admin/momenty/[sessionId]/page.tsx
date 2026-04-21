import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n-config';
import { redirect } from '@/i18n-config';
import { requireAdminOrEditor } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { notFound } from 'next/navigation';
import { ArrowLeft, Bookmark, BookOpen, AlertTriangle } from 'lucide-react';
import FragmentEditorClient from './FragmentEditorClient';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ locale: string; sessionId: string }> };

export default async function AdminFragmentEditorPage({ params }: Params) {
  const { locale, sessionId } = await params;
  setRequestLocale(locale);

  const result = await requireAdminOrEditor();
  if ('error' in result) return redirect({ href: '/konto', locale });

  const db = createSupabaseServiceRole();

  // Load session template
  const { data: session, error: sessionError } = await db
    .from('session_templates')
    .select('id, title, title_i18n, is_published, created_at')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) notFound();

  const title = (session.title_i18n as Record<string, string> | null)?.pl
    || session.title
    || session.id;

  // Load existing fragments (graceful fallback if table missing)
  let fragments: {
    id: string;
    ordinal: number;
    start_sec: number;
    end_sec: number;
    title: string;
    title_i18n?: Record<string, string>;
    description_i18n?: Record<string, string>;
    is_impulse?: boolean;
    impulse_order?: number | null;
    tags?: string[];
  }[] = [];

  let migrationsNeeded = false;

  let { data: fragsData, error: fragsError } = await db
    .from('session_fragments')
    .select('id, ordinal, start_sec, end_sec, title, title_i18n, description_i18n, is_impulse, impulse_order, tags')
    .eq('session_template_id', sessionId)
    .order('ordinal', { ascending: true });

  // Fallback: migracja 093 (tags) jeszcze nie uruchomiona — czytaj bez tags.
  if (fragsError?.code === '42703') {
    const retry = await db
      .from('session_fragments')
      .select('id, ordinal, start_sec, end_sec, title, title_i18n, description_i18n, is_impulse, impulse_order')
      .eq('session_template_id', sessionId)
      .order('ordinal', { ascending: true });
    fragsData = retry.data as typeof fragsData;
    fragsError = retry.error;
  }

  if (fragsError?.code === '42P01') {
    migrationsNeeded = true;
  } else if (!fragsError && fragsData) {
    fragments = fragsData.map(f => ({
      ...f,
      start_sec: Number(f.start_sec),
      end_sec: Number(f.end_sec),
      title_i18n: (f.title_i18n as Record<string, string>) ?? undefined,
      description_i18n: (f.description_i18n as Record<string, string>) ?? undefined,
      is_impulse: f.is_impulse ?? false,
      impulse_order: (f.impulse_order as number | null) ?? null,
      tags: Array.isArray(f.tags) ? (f.tags as string[]) : [],
    }));
  }

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        href={{ pathname: '/konto/admin/momenty' }}
        className="inline-flex items-center gap-1.5 text-sm text-htg-fg-muted hover:text-htg-fg transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Wróć do listy sesji
      </Link>

      {/* Header */}
      <div className="bg-htg-card border border-htg-card-border rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <Bookmark className="w-5 h-5 text-htg-sage mt-0.5 shrink-0" />
            <div>
              <h2 className="text-xl font-bold text-htg-fg">{title}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  session.is_published
                    ? 'bg-green-500/10 text-green-500'
                    : 'bg-htg-surface text-htg-fg-muted border border-htg-card-border'
                }`}>
                  {session.is_published ? 'opublikowana' : 'szkic'}
                </span>
                <span className="text-xs text-htg-fg-muted font-mono">{session.id.slice(0, 8)}…</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-htg-fg-muted">
            <BookOpen className="w-4 h-4" />
            <span>{fragments.length} {fragments.length === 1 ? 'Moment' : 'Momentów'}</span>
          </div>
        </div>
      </div>

      {/* Migration warning */}
      {migrationsNeeded && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-sm text-amber-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Tabela <code className="font-mono text-xs bg-amber-500/10 px-1 rounded">session_fragments</code> nie
            istnieje. Uruchom migracje 084–091 w Supabase SQL Editor przed edytowaniem Momentów.
          </span>
        </div>
      )}

      {/* Editor */}
      {!migrationsNeeded && (
        <FragmentEditorClient
          sessionId={sessionId}
          initialFragments={fragments}
          pageLocale={locale}
        />
      )}
    </div>
  );
}
