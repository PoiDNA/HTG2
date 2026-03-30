'use client';

import { useEffect } from 'react';

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.body.classList.add('hide-footer');
    return () => document.body.classList.remove('hide-footer');
  }, []);

  return <>{children}</>;
}
