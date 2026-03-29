'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { useState, useCallback, useRef } from 'react';
import { Image as ImageIcon, Send, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { MediaUpload } from './MediaUpload';
import { MentionSuggestion } from './MentionSuggestion';
import type { Attachment, TipTapContent } from '@/lib/community/types';

interface PostEditorProps {
  groupId: string;
  placeholder?: string;
  onSubmit: (content: TipTapContent, attachments: Attachment[]) => Promise<void>;
  compact?: boolean; // For comment input
}

export function PostEditor({ groupId, placeholder, onSubmit, compact = false }: PostEditorProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: compact ? false : undefined,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-htg-sage underline' },
      }),
      Placeholder.configure({
        placeholder: placeholder || (compact ? 'Napisz komentarz...' : 'Co chcesz powiedzieć?'),
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'text-htg-sage font-medium',
        },
        suggestion: MentionSuggestion(groupId),
      }),
    ],
    onUpdate: ({ editor: e }) => {
      setIsEmpty(e.isEmpty);
    },
    editorProps: {
      attributes: {
        class: compact
          ? 'prose prose-sm max-w-none focus:outline-none min-h-[40px] px-3 py-2'
          : 'prose prose-sm max-w-none focus:outline-none min-h-[60px] sm:min-h-[80px] px-4 py-3',
      },
    },
  });

  const handleSubmit = useCallback(async () => {
    if (!editor || isEmpty) return;
    setSubmitting(true);

    try {
      const content = editor.getJSON() as TipTapContent;
      await onSubmit(content, attachments);
      editor.commands.clearContent();
      setIsEmpty(true);
      setAttachments([]);
      setShowUpload(false);
    } catch (err) {
      toast.error('Nie udało się opublikować posta');
    } finally {
      setSubmitting(false);
    }
  }, [editor, attachments, onSubmit, isEmpty]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (compact && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [compact, handleSubmit]);

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleUploadComplete = (attachment: Attachment) => {
    setAttachments(prev => [...prev, attachment]);
  };

  return (
    <div className={`bg-htg-card border border-htg-card-border ${compact ? 'rounded-lg' : 'rounded-xl'}`}>
      <div onKeyDown={handleKeyDown}>
        <EditorContent editor={editor} />
      </div>

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex gap-2 px-3 pb-2 flex-wrap">
          {attachments.map((att, i) => (
            <div key={i} className="relative group w-20 h-20 rounded-lg overflow-hidden bg-htg-surface">
              {att.type === 'image' && (
                <img
                  src={`/api/community/media?path=${att.url}`}
                  alt=""
                  className="w-full h-full object-cover"
                />
              )}
              <button
                onClick={() => removeAttachment(i)}
                className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload area */}
      {showUpload && (
        <div className="px-3 pb-2">
          <MediaUpload
            groupId={groupId}
            onUploadComplete={handleUploadComplete}
            maxFiles={4 - attachments.length}
          />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-htg-card-border">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setShowUpload(!showUpload)}
            disabled={attachments.length >= 4}
            className="p-2 rounded-lg text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors disabled:opacity-50"
            title="Dodaj zdjęcie"
          >
            <ImageIcon className="w-5 h-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !editor || isEmpty}
          className="flex items-center gap-2 px-4 py-2 bg-htg-sage text-white rounded-lg font-medium text-sm hover:bg-htg-sage-dark transition-colors disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          {compact ? '' : <span className="hidden sm:inline">Opublikuj</span>}
        </button>
      </div>
    </div>
  );
}
