import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/roles';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';
import { Link } from '@/i18n-config';
import { Plus, Settings, Play, Users, Eye, Radio } from 'lucide-react';

export default async function SpotkaniasHTGPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const isAdmin = isAdminEmail(user.email ?? '');
  const { staffMember } = await getEffectiveStaffMember();
  if (!isAdmin && !staffMember) redirect(`/${locale}/konto`);

  const db = createSupabaseServiceRole();

  // Active sessions — show peek buttons for admin/practitioner
  const isPractitioner = staffMember?.role === 'practitioner';
  const canPeek = isAdmin || isPractitioner;

  const { data: activeSessions } = canPeek ? await db
    .from('htg_meeting_sessions')
    .select(`
      id, status, started_at,
      htg_meetings ( name ),
      htg_meeting_participants ( count )
    `)
    .in('status', ['waiting', 'active', 'free_talk'])
    .order('started_at', { ascending: false }) : { data: null };

  const { data: meetings } = await db
    .from('htg_meetings')
    .select('*, htg_meeting_stages(count)')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-serif font-semibold text-htg-fg">Spotkania HTG</h2>
          <p className="text-sm text-htg-fg-muted mt-1">Konfiguracja spotkań grupowych</p>
        </div>
        <Link
          href="/prowadzacy/spotkania-htg/nowe"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-htg-sage text-white text-sm font-medium hover:bg-htg-sage/80 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nowe spotkanie
        </Link>
      </div>

      {/* ── Active sessions — peek section ────────────────────────────── */}
      {canPeek && activeSessions && activeSessions.length > 0 && (
        <div className="bg-htg-card border border-green-500/20 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-green-500/10 bg-green-500/5">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <Radio className="w-4 h-4 text-green-400/70" />
            <span className="text-sm font-semibold text-green-400/90">Spotkania trwające teraz</span>
          </div>
          <div className="divide-y divide-htg-card-border/50">
            {(activeSessions as any[]).map(s => (
              <div key={s.id} className="flex items-center justify-between px-5 py-4 gap-4">
                <div>
                  <p className="font-medium text-htg-fg text-sm">{s.htg_meetings?.name ?? 'Spotkanie'}</p>
                  <p className="text-xs text-htg-fg-muted mt-0.5">
                    {s.status === 'waiting' ? 'Oczekiwanie' : s.status === 'free_talk' ? 'Luźna rozmowa' : 'W trakcie'}
                    {s.started_at && ` · od ${new Date(s.started_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`}
                  </p>
                </div>
                <Link
                  href={`/prowadzacy/spotkania-htg/peek/${s.id}`}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg
                    bg-green-500/10 hover:bg-green-500/20 text-green-400
                    ring-1 ring-green-500/20 text-sm font-medium transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  Podgląd live
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {(!meetings || meetings.length === 0) ? (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-12 text-center">
          <Users className="w-10 h-10 text-htg-fg-muted/40 mx-auto mb-3" />
          <p className="text-htg-fg-muted text-sm">Brak spotkań. Utwórz pierwsze spotkanie HTG.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(meetings as any[]).map((m) => (
            <div key={m.id} className="bg-htg-card border border-htg-card-border rounded-xl p-5 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-htg-fg truncate">{m.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    m.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                    m.status === 'archived' ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' :
                    'bg-htg-surface text-htg-fg-muted'
                  }`}>
                    {m.status === 'active' ? 'Aktywne' : m.status === 'archived' ? 'Archiwum' : 'Szkic'}
                  </span>
                </div>
                <p className="text-xs text-htg-fg-muted">
                  Max {m.max_participants} uczestników · {m.allow_self_register ? 'Rejestracja otwarta' : 'Tylko zaproszeni'} · {m.participant_selection === 'lottery' ? 'Losowanie uczestników' : 'Dobór przez admina'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/prowadzacy/spotkania-htg/${m.id}`}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Konfiguruj
                </Link>
                <Link
                  href={`/prowadzacy/spotkania-htg/${m.id}/sesje`}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-htg-sage/10 hover:bg-htg-sage/20 text-htg-sage text-sm font-medium transition-colors"
                >
                  <Play className="w-4 h-4" />
                  Sesje
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
