import { redirect } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { Link } from '@/i18n-config';
import { Heart, CheckCircle2, ArrowRight } from 'lucide-react';
import AcceptInviteButton from './AcceptInviteButton';

export default async function DolaczJakoPartnerPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Store token in redirect so user can come back after login
    redirect({href: {pathname: '/login', query: {redirect: `/konto/sesje-indywidualne/dolacz-jako-partner/${token}`}}, locale});
  }

  const db = createSupabaseServiceRole();

  // Fetch invite details
  const { data: companion } = await db
    .from('booking_companions')
    .select(`
      id, email, display_name, accepted_at, booking_id,
      bookings!inner (
        id, session_type, status,
        booking_slots!inner ( slot_date, start_time, end_time )
      )
    `)
    .eq('invite_token', token)
    .single();

  if (!companion) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <p className="text-htg-fg-muted">Zaproszenie jest nieważne lub wygasło.</p>
        <Link href="/konto" className="text-htg-sage text-sm hover:underline">
          Wróć do konta
        </Link>
      </div>
    );
  }

  const booking = (companion as any).bookings;
  const slot = (booking as any).booking_slots;
  const slotDate = slot
    ? new Date(slot.slot_date + 'T' + slot.start_time).toLocaleString('pl-PL', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null;

  const alreadyAccepted = !!companion.accepted_at;

  return (
    <div className="max-w-lg mx-auto py-12 px-4 space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="w-16 h-16 rounded-full bg-rose-500/15 flex items-center justify-center mx-auto">
          <Heart className="w-8 h-8 text-rose-400" />
        </div>
        <h1 className="text-2xl font-serif font-bold text-htg-fg">Sesja dla par</h1>
        <p className="text-htg-fg-muted text-sm">
          Zostałeś/aś zaproszony/a do wspólnej sesji HTG
        </p>
      </div>

      {/* Session info card */}
      <div className="bg-htg-card border border-htg-card-border rounded-2xl p-6 space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span className="text-htg-fg-muted">Typ sesji</span>
            <span className="font-medium text-htg-fg">Sesja dla par — Natalia</span>
          </div>
          {slotDate && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-htg-fg-muted">Termin</span>
              <span className="font-medium text-htg-fg capitalize">{slotDate}</span>
            </div>
          )}
          <div className="flex justify-between items-center text-sm">
            <span className="text-htg-fg-muted">Czas trwania</span>
            <span className="font-medium text-htg-fg">120 minut</span>
          </div>
        </div>

        {alreadyAccepted ? (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-htg-sage/10 text-htg-sage text-sm">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>Już zaakceptowałeś/aś to zaproszenie. Sesja pojawi się w Twoich sesjach.</span>
          </div>
        ) : (
          <AcceptInviteButton token={token} locale={locale} />
        )}
      </div>

      <p className="text-center text-xs text-htg-fg-muted/60">
        Po akceptacji sesja pojawi się w Twoim panelu konto → Sesje indywidualne
      </p>
    </div>
  );
}
