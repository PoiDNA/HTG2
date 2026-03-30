'use client';

import { useState, useEffect } from 'react';
import { UserMinus, UserPlus, Search, Users, Mail } from 'lucide-react';

interface UserInfo {
  id: string;
  email: string;
  display_name: string | null;
}

export default function FavoritesList() {
  const [favorites, setFavorites] = useState<UserInfo[]>([]);
  const [followers, setFollowers] = useState<UserInfo[]>([]);
  const [searchEmail, setSearchEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadData() {
    const res = await fetch('/api/favorites/list');
    const data = await res.json();
    setFavorites(data.favorites || []);
    setFollowers(data.followers || []);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

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

      {/* Zaproszenia */}
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
    </div>
  );
}
