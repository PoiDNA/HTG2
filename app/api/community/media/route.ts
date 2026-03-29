import { NextRequest, NextResponse } from 'next/server';
import { requireCommunityAuth } from '@/lib/community/auth';
import { downloadFile } from '@/lib/bunny-storage';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * GET /api/community/media?path=community/groupId/file.jpg
 *
 * Auth-gated media proxy. Streams files from Bunny Storage after verifying
 * the user has access to the group that owns the file.
 *
 * Returns stable URLs so browser/CDN can cache effectively.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCommunityAuth();
  if ('error' in auth) return auth.error;

  const { user, isAdmin, isStaff, supabase } = auth;
  const path = req.nextUrl.searchParams.get('path');

  if (!path || !path.startsWith('community/')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  // Extract groupId from path: community/{groupId}/...
  const segments = path.split('/');
  if (segments.length < 3) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }
  const groupId = segments[1];

  // Verify group access (unless admin/staff)
  if (!isAdmin && !isStaff) {
    const { data: membership } = await supabase
      .from('community_memberships')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      // Check if group is public (public groups allow read access)
      const { data: group } = await supabase
        .from('community_groups')
        .select('visibility')
        .eq('id', groupId)
        .single();

      if (!group || group.visibility !== 'public') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
  }

  try {
    const { buffer, contentType } = await downloadFile(path);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=86400, immutable',
        'ETag': `"${path}"`,
      },
    });
  } catch (err) {
    console.error('Media proxy error:', err);
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
