'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n-config';
import { useUserRole } from '@/lib/useUserRole';

/**
 * Shows "Zaloguj" button when not logged in, nothing when logged in
 * (since the UserPanelNav dropdown in SiteNav handles the logged-in state).
 */
export default function HeaderAuthButton() {
  const t = useTranslations('Nav');
  const { isLoggedIn, loading } = useUserRole();

  if (loading || isLoggedIn) return null;

  return (
    <Link
      href="/login"
      className="bg-htg-sage text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-htg-sage-dark transition-colors"
    >
      {t('login')}
    </Link>
  );
}
