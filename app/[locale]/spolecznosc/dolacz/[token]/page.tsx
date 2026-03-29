'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Loader2, Check, XCircle } from 'lucide-react';

export default function InviteJoinPage({ params }: { params: Promise<{ token: string; locale: string }> }) {
  const [token, setToken] = useState<string>('');
  const [locale, setLocale] = useState<string>('pl');
  const [info, setInfo] = useState<{
    group_name: string; group_description: string; group_slug: string;
    is_valid: boolean; is_member: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    params.then(p => {
      setToken(p.token);
      setLocale(p.locale);
      fetch(`/api/community/invite/${p.token}`)
        .then(r => r.json())
        .then(data => {
          if (data.error) setError(data.error);
          else setInfo(data);
          setLoading(false);
        })
        .catch(() => { setError('Nie udało się załadować zaproszenia'); setLoading(false); });
    });
  }, [params]);

  const handleJoin = async () => {
    setJoining(true);
    try {
      const res = await fetch(`/api/community/invite/${token}`, { method: 'POST' });
      const data = await res.json();

      if (data.joined || data.already_member) {
        setJoined(true);
        setTimeout(() => {
          router.push(`/${locale}/spolecznosc/${data.group_slug || info?.group_slug}`);
        }, 1500);
      } else if (data.error) {
        setError(data.error);
      }
    } catch {
      setError('Nie udało się dołączyć');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-htg-fg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <XCircle className="w-12 h-12 text-red-400" />
        <p className="text-htg-fg-muted text-center">{error}</p>
      </div>
    );
  }

  if (!info) return null;

  if (info.is_member) {
    router.push(`/${locale}/spolecznosc/${info.group_slug}`);
    return null;
  }

  return (
    <div className="flex justify-center items-center min-h-[50vh]">
      <div className="bg-htg-card border border-htg-card-border rounded-2xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-htg-sage/10 flex items-center justify-center mx-auto mb-4">
          <Users className="w-8 h-8 text-htg-sage" />
        </div>

        <h1 className="text-2xl font-serif font-bold text-htg-fg mb-2">
          Zaproszenie do grupy
        </h1>

        <h2 className="text-lg font-medium text-htg-fg mb-1">
          {info.group_name}
        </h2>

        {info.group_description && (
          <p className="text-sm text-htg-fg-muted mb-6">
            {info.group_description}
          </p>
        )}

        {!info.is_valid ? (
          <p className="text-sm text-red-400">Zaproszenie wygasło lub osiągnęło limit.</p>
        ) : joined ? (
          <div className="flex items-center justify-center gap-2 text-htg-sage">
            <Check className="w-5 h-5" />
            <span className="font-medium">Dołączono! Przekierowuję...</span>
          </div>
        ) : (
          <button
            onClick={handleJoin}
            disabled={joining}
            className="flex items-center justify-center gap-2 w-full py-3 bg-htg-sage text-white rounded-xl font-medium hover:bg-htg-sage-dark transition-colors disabled:opacity-50"
          >
            {joining ? <Loader2 className="w-5 h-5 animate-spin" /> : <Users className="w-5 h-5" />}
            Dołącz do grupy
          </button>
        )}
      </div>
    </div>
  );
}
