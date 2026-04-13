'use client';

import { Link } from '@/i18n-config';
import { useUserRole } from '@/lib/useUserRole';

/**
 * Footer links visible only to staff/admin users.
 * Currently: link to the Operator Regulamin (Operator terms of service).
 */
export default function StaffFooterLinks() {
  const { isStaff, loading } = useUserRole();

  if (loading || !isStaff) return null;

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
