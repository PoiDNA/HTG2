import { setRequestLocale } from 'next-intl/server';
import { locales, Link } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import {
  Eye, Calendar, Film, CreditCard, User, Mail, Clock, Shield, Crown,
} from 'lucide-react';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// Key staff members to display
const STAFF_EMAILS = [
  { email: 'natalia@htg.cyou', name: 'Natalia', description: 'Prowadząca sesje' },
  { email: 'agata@htg.cyou', name: 'Agata', description: 'Asystentka' },
  { email: 'justyna@htg.cyou', name: 'Justyna', description: 'Asystentka' },
  { email: 'marta@htg.cyou', name: 'Marta', description: 'Publikacja / edycja' },
  { email: 'ania@htg.cyou', name: 'Ania', description: 'Publikacja / edycja' },
  { email: 'dominika@htg.cyou', name: 'Dominika', description: 'Publikacja / edycja' },
];

export default async function AdminPreviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  // Verify admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    redirect(`/${locale}/konto`);
  }

  // Fetch profiles for all staff emails
  const staffEmails = STAFF_EMAILS.map(s => s.email);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, display_name, role, created_at')
    .in('email', staffEmails);

  // Fetch staff_members data
  const { data: staffMembers } = await supabase
    .from('staff_members')
    .select('id, name, email, role, slug, session_types, is_active, user_id')
    .in('email', staffEmails);

  // Fetch booking counts per staff user
  const staffUserIds = (profiles || []).map(p => p.id);
  const { data: bookings } = staffUserIds.length > 0
    ? await supabase
        .from('bookings')
        .select('id, user_id, status')
        .in('user_id', staffUserIds)
    : { data: [] };

  // Fetch entitlements per staff user
  const { data: entitlements } = staffUserIds.length > 0
    ? await supabase
        .from('entitlements')
        .select('id, user_id, is_active, plan_name')
        .in('user_id', staffUserIds)
    : { data: [] };

  // Fetch publication sessions assigned to staff emails
  const { data: pubSessions } = await supabase
    .from('publication_sessions')
    .select('id, assigned_editor, status, title')
    .in('assigned_editor', staffEmails);

  // Build enriched staff cards
  const staffCards = STAFF_EMAILS.map(staff => {
    const prof = (profiles || []).find(p => p.email === staff.email);
    const member = (staffMembers || []).find(s => s.email === staff.email);
    const userBookings = prof ? (bookings || []).filter(b => b.user_id === prof.id) : [];
    const userEntitlements = prof ? (entitlements || []).filter(e => e.user_id === prof.id) : [];
    const userPubSessions = (pubSessions || []).filter(ps => ps.assigned_editor === staff.email);

    const isSessionStaff = member?.role === 'practitioner' || member?.role === 'assistant';
    const isEditor = userPubSessions.length > 0 || staff.description.includes('Publikacja');

    return {
      ...staff,
      profile: prof,
      member,
      bookingCount: userBookings.length,
      confirmedBookings: userBookings.filter(b => b.status === 'confirmed').length,
      activeEntitlements: userEntitlements.filter(e => e.is_active).length,
      totalEntitlements: userEntitlements.length,
      pubSessionCount: userPubSessions.length,
      editingCount: userPubSessions.filter(ps => ps.status === 'editing').length,
      isSessionStaff,
      isEditor,
    };
  });

  const roleIcon = (role?: string) => {
    switch (role) {
      case 'admin': return <Crown className="w-4 h-4 text-htg-warm" />;
      case 'moderator': return <Shield className="w-4 h-4 text-htg-sage" />;
      default: return <User className="w-4 h-4 text-htg-fg-muted" />;
    }
  };

  const roleBadge = (role?: string) => {
    const styles: Record<string, string> = {
      admin: 'bg-htg-warm/20 text-htg-warm-text',
      moderator: 'bg-htg-sage/20 text-htg-sage-dark',
      publikacja: 'bg-htg-indigo/20 text-htg-indigo',
      user: 'bg-htg-surface text-htg-fg-muted',
    };
    return styles[role || 'user'] || styles.user;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Eye className="w-6 h-6 text-htg-indigo" />
        <h2 className="text-2xl font-serif font-bold text-htg-fg">Podgląd użytkowników</h2>
      </div>

      <p className="text-sm text-htg-fg-muted">
        Widok danych kluczowych pracowników — profil, rezerwacje, uprawnienia, przypisane sesje publikacji. Tryb tylko do odczytu.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {staffCards.map((card) => (
          <div key={card.email} className="bg-htg-card border border-htg-card-border rounded-xl p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${
                card.member?.role === 'practitioner' ? 'bg-htg-indigo' : 'bg-htg-sage'
              }`}>
                {card.name[0]}
              </div>
              <div className="flex-grow">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-medium text-htg-fg">{card.name}</h3>
                  {card.profile && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleBadge(card.profile.role)}`}>
                      {card.profile.role}
                    </span>
                  )}
                </div>
                <p className="text-sm text-htg-fg-muted">{card.description}</p>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-htg-fg-muted">
                <Mail className="w-4 h-4" />
                <span>{card.email}</span>
              </div>
              {card.profile && (
                <div className="flex items-center gap-2 text-htg-fg-muted">
                  <Clock className="w-4 h-4" />
                  <span>Konto od: {new Date(card.profile.created_at).toLocaleDateString('pl')}</span>
                </div>
              )}
              {card.member && (
                <div className="flex items-center gap-2 text-htg-fg-muted">
                  {roleIcon(card.profile?.role)}
                  <span>Staff: {card.member.role} {card.member.is_active ? '(aktywna)' : '(nieaktywna)'}</span>
                </div>
              )}
              {!card.profile && (
                <p className="text-xs text-htg-warm italic">Brak konta w systemie</p>
              )}
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-3">
              {card.isSessionStaff && (
                <div className="bg-htg-surface rounded-lg p-3 text-center">
                  <Calendar className="w-4 h-4 text-htg-indigo mx-auto mb-1" />
                  <p className="text-xl font-bold text-htg-fg">{card.confirmedBookings}</p>
                  <p className="text-xs text-htg-fg-muted">Sesje</p>
                </div>
              )}
              <div className="bg-htg-surface rounded-lg p-3 text-center">
                <CreditCard className="w-4 h-4 text-htg-sage mx-auto mb-1" />
                <p className="text-xl font-bold text-htg-fg">{card.activeEntitlements}</p>
                <p className="text-xs text-htg-fg-muted">Uprawnienia</p>
              </div>
              {card.isEditor && (
                <div className="bg-htg-surface rounded-lg p-3 text-center">
                  <Film className="w-4 h-4 text-htg-warm mx-auto mb-1" />
                  <p className="text-xl font-bold text-htg-fg">{card.pubSessionCount}</p>
                  <p className="text-xs text-htg-fg-muted">Publikacje</p>
                </div>
              )}
            </div>

            {/* Quick links */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-htg-card-border">
              {card.profile && (
                <Link
                  href={`/konto/admin/uzytkownicy?q=${encodeURIComponent(card.email)}`}
                  className="text-xs px-3 py-1.5 bg-htg-surface rounded-lg text-htg-fg-muted hover:text-htg-fg transition-colors"
                >
                  Profil
                </Link>
              )}
              {card.isSessionStaff && (
                <Link
                  href="/prowadzacy"
                  className="text-xs px-3 py-1.5 bg-htg-surface rounded-lg text-htg-fg-muted hover:text-htg-fg transition-colors"
                >
                  Panel prowadzącego
                </Link>
              )}
              {card.isEditor && (
                <Link
                  href="/publikacja"
                  className="text-xs px-3 py-1.5 bg-htg-surface rounded-lg text-htg-fg-muted hover:text-htg-fg transition-colors"
                >
                  Panel publikacji
                </Link>
              )}
              {card.bookingCount > 0 && (
                <Link
                  href={`/konto/admin/kalendarz`}
                  className="text-xs px-3 py-1.5 bg-htg-surface rounded-lg text-htg-fg-muted hover:text-htg-fg transition-colors"
                >
                  Kalendarz
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
