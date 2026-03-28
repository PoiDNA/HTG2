import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { sendWelcomeEmail } from '@/lib/email/resend';

// POST /api/auth/welcome — send welcome email for new users (called once after first login)
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name } = await req.json();

  try {
    const email = user.email;
    if (!email) return NextResponse.json({ sent: false });
    await sendWelcomeEmail(email, { name: name || email.split('@')[0] });
    return NextResponse.json({ sent: true });
  } catch (err) {
    console.error('Welcome email failed:', err);
    return NextResponse.json({ sent: false });
  }
}
