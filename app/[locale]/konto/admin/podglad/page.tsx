import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { IMPERSONATE_COOKIE, startImpersonation } from '@/lib/admin/impersonate';
import { Eye, ExternalLink, Calendar, Users, Presentation } from 'lucide-react';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

const STAFF_LIST = [
  { email: 'natalia@htg.cyou',  label: 'Natalia',  description: 'Prowadząca sesje',   color: 'bg-htg-indigo' },
  { email: 'agata@htg.cyou',   label: 'Agata',    description: 'Asystentka',           color: 'bg-htg-sage' },
  { email: 'justyna@htg.cyou', label: 'Justyna',  description: 'Asystentka',           color: 'bg-htg-sage' },
  { email: 'marta@htg.cyou',   label: 'Marta',    description: 'Publikacja / edycja',  color: 'bg-htg-warm' },
  { email: 'ania@htg.cyou',    label: 'Ania',     description: 'Publikacja / edycja',  color: 'bg-htg-warm' },
  { email: 'dominika@htg.cyou',label: 'Dominika', description: 'Publikacja / edycja',  color: 'bg-htg-warm' },
];

export default async function AdminPreviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  if (!isAdminEmail(user.email ?? '')) redirect(`/${locale}/konto`);

  const db = createSupabaseServiceRole();

  // Current impersonation
  const cookieStore = await cookies();
  const currentViewAs = cookieStore.get(IMPERSONATE_COOKIE)?.value ?? null;

  // Fetch staff_members for the list
  const staffEmails = STAFF_LIST.map(s => s.email);
  const { data: staffMembers } = await db
    .from('staff_members')
    .select('id, name, email, role, is_active, session_types')
    .in('email', staffEmails);

  // Quick stats per staff member
  const staffMemberIds = (staffMembers ?? []).map(s => s.id);
  const { data: allBookings } = staffMemberIds.length
    ? await db.from('booking_slots')
        .select('id, session_type, status, slot_date, assistant_id')
        .in('status', ['booked', 'completed'])
    : { data: [] };

  const enriched = STAFF_LIST.map(s => {
    const member = (staffMembers ?? []).find(m => m.email === s.email);
    const isCurrentViewAs = member?.id === currentViewAs;

    const sessionCount = member
      ? (allBookings ?? []).filter(b =>
          member.role === 'practitioner'
            ? ['booked', 'completed'].includes(b.status)
            : b.assistant_id === member.id
        ).length
      : 0;

    return { ...s, member, sessionCount, isCurrentViewAs };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Eye className="w-6 h-6 text-htg-indigo" />
        <div>
          <h2 className="text-2xl font-serif font-bold text-htg-fg">Podgląd paneli</h2>
          <p className="text-sm text-htg-fg-muted">Otwórz panel dowolnego pracownika — pełna klikalność</p>
        </div>
      </div>

      {currentViewAs && (
        <div className="flex items-center gap-3 px-4 py-3 bg-htg-warm/10 border border-htg-warm/30 rounded-xl text-sm text-htg-warm">
          <Eye className="w-4 h-4 flex-shrink-0" />
          <span>Aktualnie przeglądasz czyjś panel. Wejdź na <a href={`/${locale}/prowadzacy`} className="underline font-medium">/prowadzacy</a> lub kliknij inną osobę poniżej.</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {enriched.map((s) => (
          <div
            key={s.email}
            className={`bg-htg-card border rounded-xl p-5 space-y-4 transition-colors
              ${s.isCurrentViewAs ? 'border-htg-warm/60 bg-htg-warm/5' : 'border-htg-card-border'}`}
          >
            {/* Avatar + info */}
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white font-bold ${s.color}`}>
                {s.label[0]}
              </div>
              <div>
                <p className="font-medium text-htg-fg">{s.label}</p>
                <p className="text-xs text-htg-fg-muted">{s.description}</p>
              </div>
              {s.isCurrentViewAs && (
                <span className="ml-auto text-[10px] px-2 py-0.5 bg-htg-warm/20 text-htg-warm rounded-full">Aktywny</span>
              )}
            </div>

            {/* Stats */}
            {s.member ? (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-htg-surface rounded-lg py-2">
                  <p className="text-xs text-htg-fg-muted">Sesje</p>
                  <p className="font-bold text-htg-fg">{s.sessionCount}</p>
                </div>
                <div className="bg-htg-surface rounded-lg py-2">
                  <p className="text-xs text-htg-fg-muted">Rola</p>
                  <p className="text-[10px] font-medium text-htg-fg">
                    {s.member.role === 'practitioner' ? 'prowad.' : 'asyst.'}
                  </p>
                </div>
                <div className="bg-htg-surface rounded-lg py-2">
                  <p className="text-xs text-htg-fg-muted">Status</p>
                  <p className={`text-[10px] font-medium ${s.member.is_active ? 'text-htg-sage' : 'text-htg-fg-muted'}`}>
                    {s.member.is_active ? 'aktywna' : 'nieaktywna'}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-htg-warm italic">Brak konta staff w systemie</p>
            )}

            {/* Quick links */}
            {s.member && (
              <div className="grid grid-cols-3 gap-1.5">
                <a
                  href={`/${locale}/prowadzacy`}
                  className="flex flex-col items-center gap-1 p-2 bg-htg-surface hover:bg-htg-card-border rounded-lg text-htg-fg-muted hover:text-htg-fg transition-colors text-[10px]"
                >
                  <Presentation className="w-3.5 h-3.5" />
                  Dashboard
                </a>
                <a
                  href={`/${locale}/prowadzacy/sesje`}
                  className="flex flex-col items-center gap-1 p-2 bg-htg-surface hover:bg-htg-card-border rounded-lg text-htg-fg-muted hover:text-htg-fg transition-colors text-[10px]"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  Sesje
                </a>
                <a
                  href={`/${locale}/prowadzacy/klienci`}
                  className="flex flex-col items-center gap-1 p-2 bg-htg-surface hover:bg-htg-card-border rounded-lg text-htg-fg-muted hover:text-htg-fg transition-colors text-[10px]"
                >
                  <Users className="w-3.5 h-3.5" />
                  Klienci
                </a>
              </div>
            )}

            {/* Open as button */}
            {s.member && (
              <form action={startImpersonation}>
                <input type="hidden" name="staffId" value={s.member.id} />
                <input type="hidden" name="locale" value={locale} />
                <button
                  type="submit"
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors
                    ${s.isCurrentViewAs
                      ? 'bg-htg-warm text-white hover:bg-htg-warm/90'
                      : 'bg-htg-indigo/20 text-htg-cream/80 hover:bg-htg-indigo/40'
                    }`}
                >
                  <ExternalLink className="w-4 h-4" />
                  {s.isCurrentViewAs ? 'Otwórz ponownie' : `Otwórz jako ${s.label}`}
                </button>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
