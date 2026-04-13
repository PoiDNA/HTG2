import { createSupabaseServer } from '@/lib/supabase/server';
import { Link } from '@/i18n-config';
import { CalendarDays, Play } from 'lucide-react';

function getGreeting(displayName: string): string {
  const hour = new Date().getHours();
  const name = displayName || '';
  if (hour < 12) return `Dzień dobry${name ? `, ${name}` : ''}`;
  if (hour < 18) return `Witaj${name ? `, ${name}` : ''}`;
  return `Dobry wieczór${name ? `, ${name}` : ''}`;
}

function formatRelativeDate(slotDate: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const session = new Date(slotDate);
  session.setHours(0, 0, 0, 0);
  const diffDays = Math.round((session.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Dziś';
  if (diffDays === 1) return 'Jutro';
  if (diffDays < 0) return 'Zakończona';
  return `Za ${diffDays} dni`;
}

/**
 * V2 "Sanctuary" Hero — greeting + next session card (or calm start / integration).
 * Server component.
 */
export default async function SanctuaryHero({ locale }: { locale: string }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Fetch display name
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();

  const displayName = profile?.display_name || '';

  // Fetch next upcoming session
  const todayStr = new Date().toISOString().split('T')[0];
  const { data: nextBookings } = await supabase
    .from('bookings')
    .select(`
      id, session_type, status,
      slot:booking_slots!inner(slot_date, start_time)
    `)
    .eq('user_id', user.id)
    .in('status', ['confirmed', 'pending_confirmation'])
    .gte('booking_slots.slot_date', todayStr)
    .order('slot_date', { referencedTable: 'booking_slots', ascending: true })
    .limit(1);

  const nextBooking = nextBookings?.[0];
  const nextSlot = nextBooking?.slot
    ? (Array.isArray(nextBooking.slot) ? nextBooking.slot[0] : nextBooking.slot)
    : null;

  // Check if user had a session in last 7 days (integration state)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { count: recentCompletedCount } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .gte('created_at', weekAgo.toISOString());

  const hasRecentSession = (recentCompletedCount ?? 0) > 0;
  const greeting = getGreeting(displayName);

  return (
    <div className="mb-10">
      {/* Greeting */}
      <p className="text-sm text-htg-fg-muted mb-6">{greeting}</p>

      {/* Main card */}
      {nextSlot ? (
        /* Next session card */
        <div className="bg-htg-card border border-htg-card-border rounded-2xl p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-htg-fg-muted uppercase tracking-wider mb-2">
                Następna sesja
              </p>
              <p className="text-2xl font-serif font-semibold text-htg-fg mb-1">
                {formatRelativeDate(nextSlot.slot_date)}
              </p>
              <p className="text-sm text-htg-fg-muted">
                {nextSlot.slot_date} · {nextSlot.start_time}
              </p>
            </div>
            <CalendarDays className="w-8 h-8 text-htg-indigo/40 shrink-0" />
          </div>
          <Link
            href="/konto/sesje-indywidualne"
            className="inline-flex items-center gap-2 mt-6 px-5 py-3 bg-htg-indigo text-white rounded-xl text-sm font-medium hover:bg-htg-indigo-light transition-colors"
          >
            Rozpocznij sesję
          </Link>
        </div>
      ) : hasRecentSession && !nextBooking ? (
        /* Integration state */
        <div className="bg-htg-card border border-htg-card-border rounded-2xl p-8">
          <p className="text-lg font-serif text-htg-fg mb-2">
            Jesteś w czasie integracji po sesji.
          </p>
          <p className="text-sm text-htg-fg-muted mb-4">
            Wróć, gdy poczujesz gotowość.
          </p>
          <Link
            href="/konto/sesje-indywidualne"
            className="text-sm text-htg-fg-muted hover:text-htg-fg transition-colors"
          >
            Przejdź do biblioteki →
          </Link>
        </div>
      ) : (
        /* No session — calm start */
        <div className="bg-htg-card border border-htg-card-border rounded-2xl p-8">
          <p className="text-lg font-serif text-htg-fg mb-2">
            Nie masz zaplanowanej sesji.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <Link
              href="/konto"
              className="inline-flex items-center gap-2 px-5 py-3 bg-htg-sage text-white rounded-xl text-sm font-medium hover:bg-htg-sage-dark transition-colors"
            >
              <Play className="w-4 h-4" />
              Spokojny start
            </Link>
            <Link
              href="/konto/sesje-indywidualne"
              className="inline-flex items-center gap-2 px-5 py-3 border border-htg-card-border rounded-xl text-sm font-medium text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors"
            >
              Zaplanuj sesję
            </Link>
          </div>
          <p className="text-xs text-htg-fg-muted/60 mt-3">Krótka, uziemiająca sesja</p>
        </div>
      )}
    </div>
  );
}
