import Anthropic from '@anthropic-ai/sdk';
import type { TipTapContent, TipTapNode } from './types';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

const ALL_LOCALES = ['pl', 'en', 'de', 'pt'] as const;

const LOCALE_NAMES: Record<string, string> = {
  pl: 'Polish',
  en: 'English',
  de: 'German',
  pt: 'European Portuguese (PT-PT)',
};

// ─── TipTap JSON ↔ Text extraction ─────────────────────────────

interface TextSegment {
  path: number[];  // path to parent node in the tree
  index: number;   // index of the text node within parent's content
  text: string;
}

/**
 * Extract translatable text segments from TipTap JSON, preserving structure.
 * Skips: mentions, link URLs, emoji-only nodes.
 */
function extractTextSegments(content: TipTapContent): TextSegment[] {
  const segments: TextSegment[] = [];

  function walk(nodes: TipTapNode[], path: number[]) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      // Skip mention nodes — their label should not be translated
      if (node.type === 'mention') continue;

      // Collect text leaves
      if (node.type === 'text' && node.text) {
        segments.push({ path: [...path], index: i, text: node.text });
      }

      // Recurse into children
      if (node.content) {
        walk(node.content, [...path, i]);
      }
    }
  }

  if (content?.content) walk(content.content, []);
  return segments;
}

/**
 * Apply translated texts back into a deep-cloned TipTap structure.
 */
function applyTranslatedTexts(
  original: TipTapContent,
  segments: TextSegment[],
  translations: string[]
): TipTapContent {
  const clone: TipTapContent = JSON.parse(JSON.stringify(original));

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const translatedText = translations[i];
    if (!translatedText) continue;

    // Navigate to the parent node via path
    let current: TipTapNode[] = clone.content;
    for (const idx of seg.path) {
      if (!current[idx]?.content) break;
      current = current[idx].content!;
    }

    // Replace text at the index
    if (current[seg.index] && current[seg.index].type === 'text') {
      current[seg.index].text = translatedText;
    }
  }

  return clone;
}

/**
 * Extract plain text from TipTap content (for content_text search field).
 */
function extractPlainText(content: TipTapContent): string {
  const texts: string[] = [];
  function walk(nodes: TipTapNode[]) {
    for (const node of nodes) {
      if (node.text) texts.push(node.text);
      if (node.content) walk(node.content);
      if (node.type === 'mention' && node.attrs?.label) {
        texts.push(`@${node.attrs.label}`);
      }
    }
  }
  if (content?.content) walk(content.content);
  return texts.join(' ').trim();
}

// ─── Claude API Translation ─────────────────────────────────────

async function translateTexts(
  texts: string[],
  sourceLocale: string,
  targetLocale: string
): Promise<string[]> {
  if (texts.length === 0) return [];

  const client = new Anthropic();

  const numberedTexts = texts.map((t, i) => `[${i}] ${t}`).join('\n');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Translate the following text segments from ${LOCALE_NAMES[sourceLocale] || sourceLocale} to ${LOCALE_NAMES[targetLocale] || targetLocale}.

Rules:
- Keep the same numbered format [N] in the output
- Preserve names, URLs, @mentions exactly as-is
- Keep the same tone and formality
- This is from a spiritual development community — use appropriate language
- For Portuguese, use European Portuguese (PT-PT), not Brazilian

Input:
${numberedTexts}

Output (same format, translated):`,
    }],
  });

  // Parse the numbered response
  const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
  const lines = responseText.split('\n').filter(l => l.trim());
  const result: string[] = new Array(texts.length).fill('');

  for (const line of lines) {
    const match = line.match(/^\[(\d+)\]\s*(.*)/);
    if (match) {
      const idx = parseInt(match[1]);
      if (idx >= 0 && idx < texts.length) {
        result[idx] = match[2];
      }
    }
  }

  // Fill in any missing translations with originals
  for (let i = 0; i < result.length; i++) {
    if (!result[i]) result[i] = texts[i];
  }

  return result;
}

// ─── Main translation functions ─────────────────────────────────

/**
 * Translate a community post to all other locales.
 * Called via after() from the POST handler.
 */
export async function translatePost(postId: string, sourceLocale: string): Promise<void> {
  const db = createSupabaseServiceRole();

  // Fetch the post
  const { data: post } = await db.from('community_posts')
    .select('content, content_text')
    .eq('id', postId)
    .single();

  if (!post?.content) return;

  const content = post.content as TipTapContent;
  const segments = extractTextSegments(content);

  if (segments.length === 0) return;

  const targetLocales = ALL_LOCALES.filter(l => l !== sourceLocale);

  for (const targetLocale of targetLocales) {
    try {
      // Mark as translating
      await db.from('community_post_translations').upsert({
        post_id: postId,
        locale: targetLocale,
        content: content, // placeholder
        status: 'translating',
      }, { onConflict: 'post_id,locale' });

      // Translate text segments
      const translatedTexts = await translateTexts(
        segments.map(s => s.text),
        sourceLocale,
        targetLocale
      );

      // Apply translations to TipTap structure
      const translatedContent = applyTranslatedTexts(content, segments, translatedTexts);
      const translatedPlainText = extractPlainText(translatedContent);

      // Save translation
      await db.from('community_post_translations').upsert({
        post_id: postId,
        locale: targetLocale,
        content: translatedContent,
        content_text: translatedPlainText,
        status: 'done',
        translated_at: new Date().toISOString(),
      }, { onConflict: 'post_id,locale' });

    } catch (error) {
      console.error(`Failed to translate post ${postId} to ${targetLocale}:`, error);
      await db.from('community_post_translations').upsert({
        post_id: postId,
        locale: targetLocale,
        content: content,
        status: 'failed',
      }, { onConflict: 'post_id,locale' }).catch(() => {});
    }
  }

  // Bump post updated_at to trigger Realtime refresh for feed subscribers
  await db.from('community_posts')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', postId);
}

/**
 * Translate a community comment to all other locales.
 */
export async function translateComment(commentId: string, sourceLocale: string): Promise<void> {
  const db = createSupabaseServiceRole();

  const { data: comment } = await db.from('community_comments')
    .select('content, content_text')
    .eq('id', commentId)
    .single();

  if (!comment?.content) return;

  const content = comment.content as TipTapContent;
  const segments = extractTextSegments(content);

  if (segments.length === 0) return;

  const targetLocales = ALL_LOCALES.filter(l => l !== sourceLocale);

  for (const targetLocale of targetLocales) {
    try {
      await db.from('community_comment_translations').upsert({
        comment_id: commentId,
        locale: targetLocale,
        content: content,
        status: 'translating',
      }, { onConflict: 'comment_id,locale' });

      const translatedTexts = await translateTexts(
        segments.map(s => s.text),
        sourceLocale,
        targetLocale
      );

      const translatedContent = applyTranslatedTexts(content, segments, translatedTexts);
      const translatedPlainText = extractPlainText(translatedContent);

      await db.from('community_comment_translations').upsert({
        comment_id: commentId,
        locale: targetLocale,
        content: translatedContent,
        content_text: translatedPlainText,
        status: 'done',
        translated_at: new Date().toISOString(),
      }, { onConflict: 'comment_id,locale' });

    } catch (error) {
      console.error(`Failed to translate comment ${commentId} to ${targetLocale}:`, error);
      await db.from('community_comment_translations').upsert({
        comment_id: commentId,
        locale: targetLocale,
        content: content,
        status: 'failed',
      }, { onConflict: 'comment_id,locale' }).catch(() => {});
    }
  }
}
