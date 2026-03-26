'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { isAdminEmail, isStaffEmail } from '@/lib/roles';
import type { User } from '@supabase/supabase-js';

export type UserRoleInfo = {
  user: User | null;
  role: string | null;
  isAdmin: boolean;
  isStaff: boolean;
  isLoggedIn: boolean;
  loading: boolean;
};

export function useUserRole(): UserRoleInfo {
  const [info, setInfo] = useState<UserRoleInfo>({
    user: null,
    role: null,
    isAdmin: false,
    isStaff: false,
    isLoggedIn: false,
    loading: true,
  });

  useEffect(() => {
    const supabase = createSupabaseBrowser();

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setInfo({ user: null, role: null, isAdmin: false, isStaff: false, isLoggedIn: false, loading: false });
        return;
      }

      // Fetch profile role
      let role: string | null = 'user';
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        if (profile?.role) role = profile.role;
      } catch {
        // fallback to email-based check
      }

      const email = user.email ?? '';
      const admin = role === 'admin' || isAdminEmail(email);
      const staff = admin || role === 'moderator' || isStaffEmail(email);

      setInfo({
        user,
        role,
        isAdmin: admin,
        isStaff: staff,
        isLoggedIn: true,
        loading: false,
      });
    }

    load();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    return () => subscription.unsubscribe();
  }, []);

  return info;
}
