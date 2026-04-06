'use client';

import { useState, useEffect } from 'react';
import { UserMinus, UserPlus, Users, Mail, Send, ChevronDown, ChevronUp, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';

interface UserInfo {
  id: string;
  email: string;
  display_name: string | null;
}

interface Invitation {
  id: string;
  email: string;
  inviter_name: string;
  personal_message: string | null;
  status: string;
  sent_at: string;
  expires_at: string;
  registered_at: string | null;
}

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export default function FavoritesList({ userDisplayName }: { userDisplayName?: string }) {
  const [favorites, setFavorites] = useState<UserInfo[]>([]);
  const [followers, setFollowers] = useState<UserInfo[]>([]);
  const [searchEmail, setSearchEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  // Invite state
  const [inviterName, setInviterName] = useState(userDisplayName || '');
  const [inviteEmail, setInviteEmail] = useState('');
  const [personalMessage, setPersonalMessage] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteMessage, setInviteMessage] = useState('');
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  async function loadData() {
    const res = await fetch('/api/favorites/list');
    const data = await res.json();
    setFavorites(data.favorites || []);
    setFollowers(data.followers || []);
    setLoading(false);
  }

  async function loadInvitations() {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('external_invitations')
      .select('id, email, inviter_name, personal_message, status, sent_at, expires_at, registered_at')
      .order('sent_at', { ascending: false });
    if (data) {
      // Lazy expire in UI: mark expired ones
      const now = new Date();
      setInvitations(data.map(inv => ({
        ...inv,
        status: inv.status === 'sent' && new Date(inv.expires_at) < now ? 'expired' : inv.status,
      })));
    }
  }

  useEffect(() => {
    loadData();
    loadInvitations();
  }, []);

  useEffect(() => {
    if (userDisplayName && !inviterName) setInviterName(userDisplayName);
  }, [userDisplayName]);

  async function handleAdd() {
    if (!searchEmail.trim()) return;
    setAdding(true);
    setMessage('');
    const res = await fetch('/api/favorites/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: searchEmail.trim() }),
    });
    const data = await res.json();
    if (data.success) {
      setSearchEmail('');
      setMessage('Dodano do znajomych ✓');
      loadData();
    } else {
      setMessage(data.error || 'Błąd');
    }
    setAdding(false);
  }

  async function handleRemove(userId: string) {
    await fetch('/api/favorites/remove', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favoriteUserId: userId }),
    });
    loadData();
  }

  async function handleInvite() {
    if (!inviteEmail.trim() || !inviterName.trim()) return;
    setInviteSending(true);
    setInviteMessage('');
    const res = await fetch('/api/invitations/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: inviteEmail.trim(),
        inviterName: inviterName.trim(),
        personalMessage: personalMessage.trim() || undefined,
      }),
    });
    const data = await res.json();
    if (data.success) {
      setInviteEmail('');
      setPersonalMessage('');
      setInviteMessage('Zaproszenie wysłane ✓');
      loadInvitations();
    } else {
      setInviteMessage(data.error || 'Błąd');
    }
    setInviteSending(false);
  }

  const sentCount = new Set(invitations.map(i => i.email)).size;
  const registeredCount = invitations.filter(i => i.status === 'registered').length;

  if (loading) return <div className="text-htg-fg-muted">Ładowanie...</div>;

  return (
    <div className="space-y-8">
      {/* Dodaj znajomego */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h2 className="font-serif font-bold text-lg text-htg-fg mb-4 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-htg-sage" />
          Dodaj znajomego
        </h2>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-htg-fg-muted" />
            <input
              type="email"
              value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Wpisz adres e-mail użytkownika..."
              className="w-full pl-10 pr-4 py-3 bg-htg-surface border border-htg-card-border rounded-lg text-htg-fg placeholder:text-htg-fg-muted/50 focus:outline-none focus:ring-2 focus:ring-htg-sage/50"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={adding || !searchEmail.trim()}
            className="bg-htg-sage text-white px-5 py-3 rounded-lg font-medium hover:bg-htg-sage-dark transition-colors disabled:opacity-50 shrink-0"
          >
            {adding ? '...' : 'Dodaj'}
          </button>
        </div>
        {message && (
          <p className={`mt-2 text-sm ${message.includes('✓') ? 'text-green-400' : 'text-red-400'}`}>
            {message}
          </p>
        )}
      </div>

      {/* Lista znajomych */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h2 className="font-serif font-bold text-lg text-htg-fg mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-htg-sage" />
          Lista znajomych
        </h2>
        {favorites.length === 0 ? (
          <p className="text-htg-fg-muted text-sm">Bez znajomych</p>
        ) : (
          <div className="space-y-3">
            {favorites.map(fav => (
              <div key={fav.id} className="flex items-center justify-between p-3 bg-htg-surface rounded-lg">
                <div>
                  <p className="text-htg-fg font-medium">{fav.display_name || fav.email?.split('@')[0]}</p>
                  <p className="text-htg-fg-muted text-xs">{fav.email}</p>
                </div>
                <button
                  onClick={() => handleRemove(fav.id)}
                  className="text-red-400 hover:text-red-300 transition-colors p-2"
                  title="Usuń ze znajomych"
                >
                  <UserMinus className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Zaproszenia (followers) */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h2 className="font-serif font-bold text-lg text-htg-fg mb-4 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-htg-indigo" />
          Zaproszenia
        </h2>
        {followers.length === 0 ? (
          <p className="text-htg-fg-muted text-sm">Bez zaproszeń</p>
        ) : (
          <div className="space-y-3">
            {followers.map(f => (
              <div key={f.id} className="flex items-center justify-between p-3 bg-htg-surface rounded-lg">
                <div>
                  <p className="text-htg-fg font-medium">{f.display_name || f.email?.split('@')[0]}</p>
                  <p className="text-htg-fg-muted text-xs">{f.email}</p>
                </div>
                {!favorites.find(fv => fv.id === f.id) && (
                  <button
                    onClick={async () => {
                      await fetch('/api/favorites/add', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: f.email }),
                      });
                      loadData();
                    }}
                    className="text-htg-sage hover:text-htg-sage-dark transition-colors p-2"
                    title="Dodaj do znajomych"
                  >
                    <UserPlus className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Zaproś do HTG */}
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <h2 className="font-serif font-bold text-lg text-htg-fg mb-4 flex items-center gap-2">
          <Send className="w-5 h-5 text-htg-warm" />
          Zaproś do HTG
        </h2>
        <p className="text-htg-fg-muted text-sm mb-4">
          Zaproś znajomego spoza HTG. Otrzyma e-mail z Twoim zaproszeniem.
        </p>

        {invitations.length > 0 && (
          <div className="flex items-center gap-4 mb-4 text-sm">
            <span className="text-htg-fg-muted">Wysłano: <strong className="text-htg-fg">{sentCount}</strong></span>
            <span className="text-htg-fg-muted">Dołączyło: <strong className="text-green-400">{registeredCount}</strong></span>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-sm text-htg-fg-muted mb-1 block">Twoje imię (widoczne w zaproszeniu)</label>
            <input
              type="text"
              value={inviterName}
              onChange={e => setInviterName(e.target.value)}
              maxLength={50}
              placeholder="Twoje imię..."
              className="w-full px-4 py-2.5 bg-htg-surface border border-htg-card-border rounded-lg text-htg-fg placeholder:text-htg-fg-muted/50 focus:outline-none focus:ring-2 focus:ring-htg-warm/50"
            />
          </div>
          <div>
            <label className="text-sm text-htg-fg-muted mb-1 block">E-mail zapraszanej osoby</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="jan@example.com"
              className="w-full px-4 py-2.5 bg-htg-surface border border-htg-card-border rounded-lg text-htg-fg placeholder:text-htg-fg-muted/50 focus:outline-none focus:ring-2 focus:ring-htg-warm/50"
            />
          </div>
          <div>
            <label className="text-sm text-htg-fg-muted mb-1 block">
              Osobista wiadomość <span className="text-htg-fg-muted/50">(opcjonalnie, max 250 znaków)</span>
            </label>
            <textarea
              value={personalMessage}
              onChange={e => setPersonalMessage(e.target.value)}
              maxLength={250}
              rows={2}
              placeholder="Np. Cześć! Polecam Ci te sesje, naprawdę warto..."
              className="w-full px-4 py-2.5 bg-htg-surface border border-htg-card-border rounded-lg text-htg-fg placeholder:text-htg-fg-muted/50 focus:outline-none focus:ring-2 focus:ring-htg-warm/50 resize-none"
            />
            <p className="text-xs text-htg-fg-muted/50 mt-1 text-right">{personalMessage.length}/250</p>
          </div>

          {/* Preview */}
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-1.5 text-sm text-htg-fg-muted hover:text-htg-fg transition-colors"
          >
            {showPreview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            Podgląd wiadomości
          </button>

          {showPreview && (
            <div className="border border-htg-card-border rounded-lg p-4 bg-htg-surface/50 text-sm space-y-2">
              <p className="text-htg-fg-muted text-xs">Temat: <strong className="text-htg-fg">{inviterName || 'Twoje imię'} zaprasza Cię do HTG</strong></p>
              <hr className="border-htg-card-border" />
              <p className="text-htg-fg">
                <strong>{inviterName || 'Twoje imię'}</strong> zaprasza Cię do społeczności HTG — Hacking The Game.
              </p>
              <p className="text-htg-fg-muted">
                HTG to przestrzeń rozwoju osobistego i duchowego, prowadzona przez Natalię. Dołącz, aby uzyskać dostęp do sesji grupowych, nagrań i społeczności.
              </p>
              {personalMessage && (
                <div className="border-l-4 border-amber-500/50 pl-3 py-1 italic text-htg-fg-muted">
                  &bdquo;{personalMessage}&rdquo;
                </div>
              )}
              <div className="pt-2">
                <span className="inline-block bg-htg-sage/20 text-htg-sage px-4 py-2 rounded-lg text-sm font-medium">
                  Dołącz do HTG →
                </span>
              </div>
            </div>
          )}

          <button
            onClick={handleInvite}
            disabled={inviteSending || !inviteEmail.trim() || !inviterName.trim()}
            className="w-full bg-htg-warm text-white py-3 rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            {inviteSending ? 'Wysyłanie...' : 'Wyślij zaproszenie'}
          </button>

          {inviteMessage && (
            <p className={`text-sm ${inviteMessage.includes('✓') ? 'text-green-400' : 'text-red-400'}`}>
              {inviteMessage}
            </p>
          )}
        </div>

        {/* Sent invitations list */}
        {invitations.length > 0 && (
          <div className="mt-6 pt-4 border-t border-htg-card-border">
            <h3 className="text-sm font-medium text-htg-fg-muted mb-3">Wysłane zaproszenia</h3>
            <div className="space-y-2">
              {invitations.map(inv => (
                <div key={inv.id} className="flex items-center justify-between p-3 bg-htg-surface rounded-lg">
                  <div className="min-w-0 flex-1">
                    <p className="text-htg-fg text-sm truncate">{inv.email}</p>
                    <p className="text-htg-fg-muted text-xs">
                      {new Date(inv.sent_at).toLocaleDateString('pl-PL')}
                    </p>
                  </div>
                  {inv.status === 'registered' && (
                    <span className="flex items-center gap-1 text-xs text-green-400 font-medium shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Dołączył/a
                    </span>
                  )}
                  {inv.status === 'sent' && (
                    <span className="flex items-center gap-1 text-xs text-amber-400 font-medium shrink-0">
                      <Clock className="w-3.5 h-3.5" />
                      Oczekuje
                    </span>
                  )}
                  {inv.status === 'expired' && (
                    <span className="flex items-center gap-1 text-xs text-htg-fg-muted font-medium shrink-0">
                      <XCircle className="w-3.5 h-3.5" />
                      Wygasło
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
