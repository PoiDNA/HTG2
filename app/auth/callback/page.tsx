'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { getRoleForEmail } from '@/lib/roles';
import { Loader2 } from 'lucide-react';

/**
 * Auth callback page — handles both:
 * 1. PKCE flow (code in query params, handled by middleware/route.ts)
 * 2. Implicit flow / magic link (access_token in URL fragment #)
 *
 * The URL fragment (#access_token=...) is NOT visible to the server,
 * so we need this client component to extract it.
 */
export default function AuthCallbackPage() {
  const [error, setError] = useState('');

  useEffect(() => {
    async function handleCallback() {
      const supabase = createSupabaseBrowser();

      // Check if we have a hash fragment with access_token
      const hash = window.location.hash;
      if (hash && hash.includes('access_token')) {
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (sessionError) {
            setError(sessionError.message);
            return;
          }

          // Auto-set role
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.email) {
              const expectedRole = getRoleForEmail(user.email);
              if (expectedRole) {
                await supabase.from('profiles').update({ role: expectedRole }).eq('id', user.id);
              }
            }
          } catch {}

          // Call centralized post-login hook
          try {
            await fetch('/api/auth/post-login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ consent: true }),
            });
          } catch {}

          const locale = window.location.pathname.split('/')[1] || 'pl';
          const isNagrania = window.location.hostname === 'nagrania.htg.cyou' || window.location.hostname === 'nagrania.localhost';
          window.location.href = `/${locale}${isNagrania ? '/konto/nagrania-sesji' : '/konto'}`;
          return;
        }
      }

      // If no hash fragment, check if we already have a session
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const locale = window.location.pathname.split('/')[1] || 'pl';
        const isNagraniaFallback = window.location.hostname === 'nagrania.htg.cyou' || window.location.hostname === 'nagrania.localhost';
        window.location.href = `/${locale}${isNagraniaFallback ? '/konto/nagrania-sesji' : '/konto'}`;
        return;
      }

      // No token found
      setError('Brak tokenu uwierzytelniania. Spróbuj zalogować się ponownie.');
    }

    handleCallback();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-htg-bg">
      <div className="text-center">
        {error ? (
          <div className="bg-htg-card border border-htg-card-border rounded-xl p-8 max-w-md">
            <p className="text-red-500 mb-4">{error}</p>
            <a href="/pl/login" className="text-htg-sage hover:underline">
              Wróć do logowania
            </a>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-htg-sage" />
            <p className="text-htg-fg-muted">Logowanie...</p>
          </div>
        )}
      </div>
    </div>
  );
}
