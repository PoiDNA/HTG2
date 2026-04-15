import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { getEffectiveStaffMember } from '@/lib/admin/effective-staff';
import { Users, Mail, Calendar, Hash } from 'lucide-react';
import { SESSION_CONFIG } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function TranslatorClientsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return null;

  const db = createSupabaseServiceRole();
  const todayStr = new Date().toISOString().split('T')[0];

  const { staffMember } = await getEffectiveStaffMember();
  const translatorId = staffMember?.id ?? null;

  // Step 1: slot IDs for this translator
  const { data: mySlotRows } = translatorId
    ? await db.from('booking_slots').select('id').eq('translator_id', translatorId)
    : { data: [] };
  const mySlotIds = (mySlotRows || []).map((s: any) => s.id);

  const { data: bookings } = mySlotIds.length > 0
    ? await db
        .from('bookings')
        .select(`id, session_type, status, topics, user_id, slot:booking_slots(slot_date, start_time)`)
        .in('slot_id', mySlotIds)
        .in('status', ['confirmed', 'completed', 'pending_confirmation'])
        .order('created_at', { ascending: false })
    : { data: [] };

  const userIds = [...new Set((bookings || []).map((b: any) => b.user_id).filter(Boolean))];
  const { data: profiles } = userIds.length > 0
    ? await db.from('profiles').select('id, email, display_name').in('id', userIds)
    : { data: [] };
  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  // Build client map
  type ClientEntry = {
    id: string;
    email: string;
    name: string;
    totalSessions: number;
    lastSession: string;
    nextSession: string | null;
    sessions: { date: string; time: string; type: string; status: string; topics: string | null }[];
  };

  const clientMap = new Map<string, ClientEntry>();

  for (const b of (bookings || [])) {
    const client: any = profileMap.get(b.user_id);
    const slot: any = Array.isArray(b.slot) ? b.slot[0] : b.slot;
    if (!client?.id) continue;

    if (!clientMap.has(client.id)) {
      clientMap.set(client.id, {
        id: client.id,
        email: client.email || '',
        name: client.display_name || client.email || '—',
        sessions: [],
        totalSessions: 0,
        lastSession: '',
        nextSession: null,
      });
    }

    const c = clientMap.get(client.id)!;
    c.totalSessions++;
    const dateStr = slot?.slot_date || '';
    c.sessions.push({ date: dateStr, time: slot?.start_time?.slice(0, 5) || '', type: b.session_type, status: b.status, topics: b.topics });
    if (dateStr > c.lastSession) c.lastSession = dateStr;
    if (dateStr >= todayStr && b.status !== 'completed') {
      if (!c.nextSession || dateStr < c.nextSession) c.nextSession = dateStr;
    }
  }

  const clients = Array.from(clientMap.values()).sort((a, b) => {
    if (a.nextSession && !b.nextSession) return -1;
    if (!a.nextSession && b.nextSession) return 1;
    return b.lastSession.localeCompare(a.lastSession);
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-htg-indigo" />
          <h2 className="text-2xl font-serif font-bold text-htg-fg">Moi klienci</h2>
        </div>
        <span className="text-sm text-htg-fg-muted">{clients.length} klientów</span>
      </div>

      {clients.length === 0 ? (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-8 text-center">
          <Users className="w-12 h-12 text-htg-fg-muted mx-auto mb-4" />
          <p className="text-htg-fg-muted">Brak klientów z zarezerwowanymi sesjami.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {clients.map(client => (
            <div key={client.id} className="bg-htg-card border border-htg-card-border rounded-xl overflow-hidden">
              <div className="p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-htg-indigo/20 flex items-center justify-center shrink-0">
                    <span className="text-htg-indigo font-bold text-sm">
                      {client.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-htg-fg truncate">{client.name}</p>
                    <p className="text-xs text-htg-fg-muted flex items-center gap-1">
                      <Mail className="w-3 h-3" /> {client.email}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0 text-xs text-htg-fg-muted">
                  <span className="flex items-center gap-1">
                    <Hash className="w-3 h-3" /> {client.totalSessions} sesji
                  </span>
                  {client.nextSession && (
                    <span className="flex items-center gap-1 text-htg-sage font-medium">
                      <Calendar className="w-3 h-3" /> Następna: {client.nextSession}
                    </span>
                  )}
                </div>
              </div>
              <div className="border-t border-htg-card-border px-5 py-3 bg-htg-surface/30">
                <div className="flex flex-wrap gap-2">
                  {client.sessions.slice(0, 6).map((s, i) => (
                    <div
                      key={i}
                      className={`text-xs px-2.5 py-1.5 rounded-lg border ${
                        s.date >= todayStr && s.status !== 'completed'
                          ? 'border-htg-sage/30 bg-htg-sage/10 text-htg-fg'
                          : 'border-htg-card-border text-htg-fg-muted'
                      }`}
                    >
                      <span>{s.date} {s.time}</span>
                      <span className="ml-1 opacity-60">
                        {SESSION_CONFIG[s.type as SessionType]?.labelShort || s.type}
                      </span>
                    </div>
                  ))}
                  {client.sessions.length > 6 && (
                    <span className="text-xs text-htg-fg-muted px-2 py-1.5">
                      +{client.sessions.length - 6} więcej
                    </span>
                  )}
                </div>
                {client.sessions[0]?.topics && (
                  <p className="text-xs text-htg-fg-muted mt-2 line-clamp-2">
                    📝 {client.sessions[0].topics}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
