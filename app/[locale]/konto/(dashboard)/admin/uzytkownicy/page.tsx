import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales, Link } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { redirect } from 'next/navigation';
import { Users, Search, Crown, Shield, User } from 'lucide-react';
import CreateUserButton from './CreateUserButton';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function AdminUsersPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; role?: string; page?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Admin' });

  // Verify admin via session (server client), then use service role for data
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user || !isAdminEmail(user.email ?? '')) redirect(`/${locale}/konto`);

  const supabase = createSupabaseServiceRole();

  const pageSize = 50;
  const page = parseInt(sp.page || '1');
  const offset = (page - 1) * pageSize;

  // Build query
  let query = supabase.from('profiles').select('id, display_name, email, role, wix_member_id, created_at', { count: 'exact' });

  if (sp.role && sp.role !== 'all') {
    query = query.eq('role', sp.role);
  }

  if (sp.q) {
    query = query.or(`email.ilike.%${sp.q}%,display_name.ilike.%${sp.q}%`);
  }

  const { data: users, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  // Role stats
  const [admins, moderators, allCount, withWix] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'moderator'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).not('wix_member_id', 'is', null),
  ]);

  const totalPages = Math.ceil((count || 0) / pageSize);

  const roleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <Crown className="w-4 h-4 text-htg-warm" />;
      case 'moderator': return <Shield className="w-4 h-4 text-htg-sage" />;
      default: return <User className="w-4 h-4 text-htg-fg-muted" />;
    }
  };

  const roleBadge = (role: string) => {
    const styles = {
      admin: 'bg-htg-warm/20 text-htg-warm-text',
      moderator: 'bg-htg-sage/20 text-htg-sage-dark',
      user: 'bg-htg-surface text-htg-fg-muted',
    };
    return styles[role as keyof typeof styles] || styles.user;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-htg-indigo" />
          <h2 className="text-2xl font-serif font-bold text-htg-fg">{t('users')}</h2>
        </div>
        <CreateUserButton />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-htg-card border border-htg-card-border rounded-lg p-4">
          <p className="text-xs text-htg-fg-muted">Łącznie</p>
          <p className="text-2xl font-bold text-htg-fg">{allCount.count ?? 0}</p>
        </div>
        <div className="bg-htg-card border border-htg-card-border rounded-lg p-4">
          <p className="text-xs text-htg-fg-muted">Admini</p>
          <p className="text-2xl font-bold text-htg-warm">{admins.count ?? 0}</p>
        </div>
        <div className="bg-htg-card border border-htg-card-border rounded-lg p-4">
          <p className="text-xs text-htg-fg-muted">Prowadzący</p>
          <p className="text-2xl font-bold text-htg-sage">{moderators.count ?? 0}</p>
        </div>
        <div className="bg-htg-card border border-htg-card-border rounded-lg p-4">
          <p className="text-xs text-htg-fg-muted">Z WIX</p>
          <p className="text-2xl font-bold text-htg-fg">{withWix.count ?? 0}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-4">
        <form className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-htg-fg-muted" />
            <input
              name="q"
              type="text"
              defaultValue={sp.q || ''}
              placeholder="Szukaj po email lub nazwie..."
              className="w-full pl-10 pr-4 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-sm text-htg-fg placeholder:text-htg-fg-muted focus:outline-none focus:border-htg-sage"
            />
          </div>
          <select
            name="role"
            defaultValue={sp.role || 'all'}
            className="px-4 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-sm text-htg-fg"
          >
            <option value="all">Wszystkie role</option>
            <option value="admin">Admin</option>
            <option value="moderator">Prowadzący</option>
            <option value="user">Użytkownik</option>
          </select>
          <button type="submit" className="px-4 py-2 bg-htg-sage text-white rounded-lg text-sm font-medium hover:bg-htg-sage-dark transition-colors">
            Filtruj
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-htg-card-border bg-htg-surface">
                <th className="text-left py-3 px-4 text-htg-fg-muted font-medium">Użytkownik</th>
                <th className="text-left py-3 px-4 text-htg-fg-muted font-medium">Email</th>
                <th className="text-left py-3 px-4 text-htg-fg-muted font-medium">Rola</th>
                <th className="text-left py-3 px-4 text-htg-fg-muted font-medium">WIX</th>
                <th className="text-left py-3 px-4 text-htg-fg-muted font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {(users || []).map((u) => (
                <tr key={u.id} className="border-b border-htg-card-border last:border-0 hover:bg-htg-surface/50 cursor-pointer">
                  <td className="py-3 px-4">
                    <Link href={`/konto/admin/uzytkownicy/${u.id}`} className="flex items-center gap-2">
                      {roleIcon(u.role)}
                      <span className="text-htg-fg font-medium hover:text-htg-indigo transition-colors">{u.display_name || '—'}</span>
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-htg-fg-muted">
                    <Link href={`/konto/admin/uzytkownicy/${u.id}`} className="hover:text-htg-fg transition-colors">
                      {u.email || '—'}
                    </Link>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleBadge(u.role)}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {u.wix_member_id ? (
                      <span className="text-xs text-htg-sage">✓ Migrowany</span>
                    ) : (
                      <span className="text-xs text-htg-fg-muted">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-htg-fg-muted text-xs">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString('pl') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-htg-card-border">
            <p className="text-xs text-htg-fg-muted">
              Strona {page} z {totalPages} ({count} użytkowników)
            </p>
            <div className="flex gap-1">
              {page > 1 && (
                <Link href={`/konto/admin/uzytkownicy?page=${page - 1}${sp.q ? '&q=' + sp.q : ''}${sp.role ? '&role=' + sp.role : ''}`}
                  className="px-3 py-1 bg-htg-surface rounded text-xs text-htg-fg hover:bg-htg-card-border">
                  ← Poprz.
                </Link>
              )}
              {page < totalPages && (
                <Link href={`/konto/admin/uzytkownicy?page=${page + 1}${sp.q ? '&q=' + sp.q : ''}${sp.role ? '&role=' + sp.role : ''}`}
                  className="px-3 py-1 bg-htg-surface rounded text-xs text-htg-fg hover:bg-htg-card-border">
                  Nast. →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
