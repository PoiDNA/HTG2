'use client';

import { Link } from '@/i18n-config';
import { useUserRole } from '@/lib/useUserRole';

/**
 * Footer links visible only to staff/admin/translator users.
 * Staff/admin → Regulamin Operatora
 * Translator → Regulamin Tłumacza
 */
export default function StaffFooterLinks() {
  const { isStaff, isTranslator, loading } = useUserRole();

  if (loading) return null;

  if (isTranslator && !isStaff) {
    return (
      <>
        <span className="text-white/30" aria-hidden="true">·</span>
        <Link
          href="/translator-terms"
          className="whitespace-nowrap hover:text-white transition-colors"
        >
          Regulamin Tłumacza
        </Link>
      </>
    );
  }

  if (isStaff) {
    return (
      <>
        <span className="text-white/30" aria-hidden="true">·</span>
        <Link
          href="/operator-terms"
          className="whitespace-nowrap hover:text-white transition-colors"
        >
          Regulamin Operatora
        </Link>
      </>
    );
  }

  return null;
}
