import { createClient } from '@supabase/supabase-js';

/**
 * Supabase client with SERVICE ROLE key — bypasses RLS entirely.
 * Use ONLY in server-side admin code. Never expose to the client.
 */
export function createSupabaseServiceRole() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
