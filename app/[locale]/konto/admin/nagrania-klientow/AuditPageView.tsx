'use client';

import { useEffect, useRef } from 'react';
import { logAdminPageView } from './actions';

/**
 * Invisible Client Component that logs admin page view via Server Action.
 * Uses useEffect to avoid logging during prefetch or Strict Mode double-render.
 */
export default function AuditPageView({ page }: { page: string }) {
  const logged = useRef(false);

  useEffect(() => {
    if (!logged.current) {
      logged.current = true;
      logAdminPageView(page);
    }
  }, [page]);

  return null;
}
