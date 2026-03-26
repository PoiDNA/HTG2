/**
 * Fix unparsed yearly subscriptions from WIX migration
 * These had Unicode apostrophes or unusual plan name formats.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const MONTH_MAP: Record<string, string> = {
  'stycze\u0144': '01', 'luty': '02', 'marzec': '03', 'kwiecie\u0144': '04',
  'maj': '05', 'czerwiec': '06', 'lipiec': '07', 'sierpie\u0144': '08',
  'wrzesie\u0144': '09', 'pa\u017adziernik': '10', 'listopad': '11', 'grudzie\u0144': '12',
};

const UNLIMITED = '2099-12-31T23:59:59.000Z';

function gen12(start: string): string[] {
  const [y, m] = start.split('-').map(Number);
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    let nm = m + i, ny = y;
    if (nm > 12) { nm -= 12; ny++; }
    months.push(`${ny}-${String(nm).padStart(2, '0')}`);
  }
  return months;
}

// Manually mapped unparsed yearly plans
const FIXES: Array<{ email: string; start: string }> = [
  // "12 Pakietow do Stycznia 2027" = luty 2026 -> styczen 2027
  { email: 'melerska8@gmail.com', start: '2026-02' },
  { email: 'jezierskajoanna@o2.pl', start: '2026-02' },
  { email: 'kamila@limfa.pl', start: '2026-02' },
  // "12 Pakietow do Kwietnia 2026" = maj 2025 -> kwiecien 2026
  { email: 'werbena8@onet.pl', start: '2025-05' },
  // "12M do Grudzien 2025" = styczen 2025 -> grudzien 2025
  { email: 'melania_b@o2.pl', start: '2025-01' },
  // "12 Pakietow do Grudnia 2026" = styczen 2026 -> grudzien 2026
  { email: 'melania_b@o2.pl', start: '2026-01' },
  { email: 'wwkwiat@vp.pl', start: '2026-01' },
  { email: 'karolina.podsiadlik@gmail.com', start: '2026-01' },
  { email: 'goch@autograf.pl', start: '2026-01' },
  { email: 'elakuc1@op.pl', start: '2026-01' },
  { email: 'kacper.domeradzki@gmail.com', start: '2026-01' },
  { email: 'ania.schally@gmail.com', start: '2026-01' },
  // "HTG 12-2025 Set" = styczen 2025 -> grudzien 2025
  { email: 'yoannagwarek@gmail.com', start: '2025-01' },
  { email: 'melerska8@gmail.com', start: '2025-01' },
  { email: 'malgosia.sobolewska@wp.pl', start: '2025-01' },
  // "12 Pakietow Sesji HTG" = pazdziernik 2025 -> wrzesien 2026
  { email: 'gozdzik.a@gmail.com', start: '2025-10' },
  { email: 'Ilonaszwedo7@gmail.com', start: '2025-10' },
  // "12M do Sierpien 2025" = wrzesien 2024 -> sierpien 2025
  { email: 'paliwoda66@hotmail.com', start: '2024-09' },
  // "12M do Pazdziernik 2025" = listopad 2024 -> pazdziernik 2025
  { email: 'lusa.lusa@interia.pl', start: '2024-11' },
  // "12M do Wrzesien 2025" = pazdziernik 2024 -> wrzesien 2025
  { email: 'ewa.kaliniak@yahoo.com', start: '2024-10' },
  // "12 miesiecy Sesji HTG" = wrzesien 2025 -> sierpien 2026
  { email: 'paliwoda66@hotmail.com', start: '2025-09' },
  // "12M - do Kwiecien 2026" = maj 2025 -> kwiecien 2026
  { email: 'terkul@o2.pl', start: '2025-05' },
  // "12 miesiecy - Sesje HTG" = sierpien 2025 -> lipiec 2026
  { email: 'karol.mroz@op.pl', start: '2025-08' },
  { email: 'porady.psychologiczne24@gmail.com', start: '2025-08' },
  { email: 'siemiatkowska.joanna@gmail.com', start: '2025-08' },
];

async function main() {
  console.log('🔧 Fixing unparsed yearly subscriptions\n');

  const { data: yearlyProd } = await supabase.from('products').select('id').eq('slug', 'pakiet-roczny').single();
  const { data: allSets } = await supabase.from('monthly_sets').select('id, month_label');
  const setMap = new Map(allSets?.map(s => [s.month_label, s.id]) || []);

  // Get users
  const allUsers: any[] = [];
  let page = 1;
  while (true) {
    const { data: { users } } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (!users || users.length === 0) break;
    allUsers.push(...users);
    if (users.length < 1000) break;
    page++;
  }
  const userByEmail = new Map(allUsers.map(u => [u.email?.toLowerCase(), u]));

  let created = 0, skipped = 0;

  for (const fix of FIXES) {
    const user = userByEmail.get(fix.email.toLowerCase());
    if (!user) {
      console.log(`\u26a0\ufe0f User not found: ${fix.email}`);
      continue;
    }

    const months = gen12(fix.start);
    let ok = 0;

    for (const ml of months) {
      const { data: existing } = await supabase.from('entitlements')
        .select('id')
        .eq('user_id', user.id)
        .eq('scope_month', ml)
        .eq('source', 'wix')
        .maybeSingle();

      if (existing) { skipped++; continue; }

      // Ensure monthly set exists
      if (!setMap.has(ml)) {
        const [y, m] = ml.split('-');
        const NAMES: Record<string, string> = {
          '01':'Stycze\u0144','02':'Luty','03':'Marzec','04':'Kwiecie\u0144','05':'Maj','06':'Czerwiec',
          '07':'Lipiec','08':'Sierpie\u0144','09':'Wrzesie\u0144','10':'Pa\u017adziernik','11':'Listopad','12':'Grudzie\u0144'
        };
        const title = `Sesje ${NAMES[m]} ${y}`;
        const slug = `sesje-${title.split(' ')[1].toLowerCase().replace(/\u0105/g,'a').replace(/\u0107/g,'c').replace(/\u0119/g,'e').replace(/\u0142/g,'l').replace(/\u0144/g,'n').replace(/\u00f3/g,'o').replace(/\u015b/g,'s').replace(/\u017a/g,'z').replace(/\u017c/g,'z')}-${y}`;
        const { data: monthlyProd } = await supabase.from('products').select('id').eq('slug', 'pakiet-miesieczny').single();
        const { data: newSet } = await supabase.from('monthly_sets').upsert({
          product_id: monthlyProd!.id, title, slug, month_label: ml, is_published: true,
        }, { onConflict: 'slug' }).select('id').single();
        if (newSet) setMap.set(ml, newSet.id);
        console.log(`  \ud83d\udce6 Created set: ${ml} \u2192 ${title}`);
      }

      await supabase.from('entitlements').insert({
        user_id: user.id,
        product_id: yearlyProd!.id,
        type: 'yearly',
        scope_month: ml,
        monthly_set_id: setMap.get(ml) || null,
        valid_from: `${ml}-01`,
        valid_until: UNLIMITED,
        is_active: true,
        source: 'wix',
      });
      created++;
      ok++;
    }

    if (ok > 0) {
      console.log(`\u2705 ${fix.email} \u2192 ${fix.start} +12 (${ok} new)`);
    }
  }

  console.log(`\n=== FIX COMPLETE ===`);
  console.log(`Created: ${created}`);
  console.log(`Skipped (already exist): ${skipped}`);

  const { count } = await supabase.from('entitlements').select('id', { count: 'exact', head: true });
  console.log(`Total entitlements in DB: ${count}`);
}

main().catch(console.error);
