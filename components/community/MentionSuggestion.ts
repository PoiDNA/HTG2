import type { SuggestionOptions } from '@tiptap/suggestion';

interface MentionItem {
  id: string;
  label: string;
  avatar_url: string | null;
}

/**
 * TipTap Mention suggestion config.
 * Returns a suggestion object that fetches mentionable users from the API.
 */
export function MentionSuggestion(groupId: string): Partial<SuggestionOptions<MentionItem>> {
  return {
    items: async ({ query }) => {
      if (query.length < 1) return [];

      try {
        const params = new URLSearchParams({ q: query, group_id: groupId });
        const res = await fetch(`/api/community/mentions/search?${params}`);
        if (!res.ok) return [];
        return await res.json();
      } catch {
        return [];
      }
    },

    render: () => {
      let popup: HTMLElement | null = null;
      let component: {
        items: MentionItem[];
        selectedIndex: number;
        command: (item: MentionItem) => void;
      } | null = null;

      return {
        onStart: (props) => {
          popup = document.createElement('div');
          popup.className = 'mention-dropdown';
          popup.style.cssText = `
            position: absolute;
            z-index: 50;
            background: var(--color-htg-card);
            border: 1px solid var(--color-htg-card-border);
            border-radius: 0.5rem;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            max-height: 200px;
            overflow-y: auto;
            min-width: 200px;
          `;

          component = {
            items: props.items as MentionItem[],
            selectedIndex: 0,
            command: props.command as (item: MentionItem) => void,
          };

          renderItems();

          const rect = props.clientRect?.();
          if (rect && popup) {
            popup.style.left = `${rect.left}px`;
            popup.style.top = `${rect.bottom + 4}px`;
            popup.style.position = 'fixed';
          }

          document.body.appendChild(popup);
        },

        onUpdate: (props) => {
          if (component) {
            component.items = props.items as MentionItem[];
            component.selectedIndex = 0;
            component.command = props.command as (item: MentionItem) => void;
            renderItems();
          }
        },

        onKeyDown: (props) => {
          if (!component) return false;

          if (props.event.key === 'ArrowDown') {
            component.selectedIndex = (component.selectedIndex + 1) % component.items.length;
            renderItems();
            return true;
          }
          if (props.event.key === 'ArrowUp') {
            component.selectedIndex = (component.selectedIndex - 1 + component.items.length) % component.items.length;
            renderItems();
            return true;
          }
          if (props.event.key === 'Enter') {
            const item = component.items[component.selectedIndex];
            if (item) component.command(item);
            return true;
          }
          return false;
        },

        onExit: () => {
          popup?.remove();
          popup = null;
          component = null;
        },
      };

      function renderItems() {
        if (!popup || !component) return;

        popup.innerHTML = component.items.length === 0
          ? '<div style="padding: 8px 12px; color: var(--color-htg-fg-muted); font-size: 0.875rem;">Brak wyników</div>'
          : component.items.map((item, index) => `
            <div
              class="mention-item"
              data-index="${index}"
              style="
                padding: 8px 12px;
                cursor: pointer;
                font-size: 0.875rem;
                color: var(--color-htg-fg);
                background: ${index === component!.selectedIndex ? 'var(--color-htg-surface)' : 'transparent'};
                display: flex;
                align-items: center;
                gap: 8px;
              "
            >
              <span style="font-weight: 500;">@${item.label}</span>
            </div>
          `).join('');

        // Click handlers
        popup.querySelectorAll('.mention-item').forEach(el => {
          el.addEventListener('click', () => {
            const idx = parseInt(el.getAttribute('data-index') || '0');
            const item = component!.items[idx];
            if (item) component!.command(item);
          });
        });
      }
    },
  };
}
