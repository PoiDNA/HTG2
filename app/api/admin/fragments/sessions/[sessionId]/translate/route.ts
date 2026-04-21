import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrEditor } from '@/lib/admin/auth';
import {
  translateSessionFragmentsAndSegments,
  TRANSLATE_TARGETS,
  type TranslateTarget,
  type TranslateScope,
} from '@/lib/services/translate-fragments-segments';

/**
 * POST /api/admin/fragments/sessions/[sessionId]/translate
 *
 * Auto-tłumaczenie Claude wszystkich Momentów i segmentów aktywnego importu
 * tej sesji na EN/DE/PT (albo podzbiór). Nadpisuje istniejące tłumaczenia.
 *
 * Body (opcjonalne):
 *   - targets?: Array<'en'|'de'|'pt'>   (default: wszystkie trzy)
 *   - scope?:   'fragments'|'segments'|'all'  (default: 'all')
 *
 * Uprawnienia: admin + editor. Tłumacze NIE mogą wywoływać tego endpointu —
 * to droga do masowego overwrite i dotyczy wszystkich locale, nie tylko ich.
 */
type Params = { params: Promise<{ sessionId: string }> };

const ALLOWED_SCOPES: TranslateScope[] = ['fragments', 'segments', 'all'];

export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireAdminOrEditor();
  if ('error' in auth) return auth.error;

  const { sessionId } = await params;

  const body = await req.json().catch(() => ({}));
  const rawTargets = body?.targets;
  const rawScope = body?.scope;

  let targets: TranslateTarget[] | undefined;
  if (rawTargets !== undefined) {
    if (!Array.isArray(rawTargets)) {
      return NextResponse.json({ error: 'targets must be an array of locale codes' }, { status: 400 });
    }
    const valid = rawTargets.filter((t): t is TranslateTarget =>
      typeof t === 'string' && (TRANSLATE_TARGETS as readonly string[]).includes(t),
    );
    if (valid.length === 0) {
      return NextResponse.json(
        { error: `No valid targets — allowed: ${TRANSLATE_TARGETS.join(', ')}` },
        { status: 400 },
      );
    }
    targets = valid;
  }

  let scope: TranslateScope | undefined;
  if (rawScope !== undefined) {
    if (typeof rawScope !== 'string' || !ALLOWED_SCOPES.includes(rawScope as TranslateScope)) {
      return NextResponse.json(
        { error: `scope must be one of: ${ALLOWED_SCOPES.join(', ')}` },
        { status: 400 },
      );
    }
    scope = rawScope as TranslateScope;
  }

  // Gate: wersja PL musi być zaakceptowana przez admina/edytora.
  const { data: tmpl, error: tmplErr } = await auth.supabase
    .from('session_templates')
    .select('pl_approved_at')
    .eq('id', sessionId)
    .maybeSingle();

  if (tmplErr) {
    return NextResponse.json({ error: `DB error: ${tmplErr.message}` }, { status: 500 });
  }
  if (!tmpl) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  if (!tmpl.pl_approved_at) {
    return NextResponse.json(
      { error: 'Wersja PL nie została zaakceptowana. Admin/Editor musi zatwierdzić wersję PL przed auto-tłumaczeniem.' },
      { status: 403 },
    );
  }

  try {
    const result = await translateSessionFragmentsAndSegments({
      sessionId,
      targets,
      scope,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Translation failed';
    console.error('[admin/fragments/translate] failed', { sessionId, err: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
