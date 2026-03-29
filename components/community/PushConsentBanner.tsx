'use client';

import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { toast } from 'sonner';

const DISMISS_KEY = 'htg-push-dismissed';
const DISMISS_DAYS = 7;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PushConsentBanner() {
  const [show, setShow] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (!vapidKey) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    if (Notification.permission !== 'default') return;

    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const dismissedAt = parseInt(dismissed);
      if (Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000) return;
    }

    setShow(true);
  }, [vapidKey]);

  const handleEnable = async () => {
    setSubscribing(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error('Powiadomienia zostały zablokowane w przeglądarce');
        setShow(false);
        return;
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey!) as BufferSource,
      });

      const subJson = subscription.toJSON();

      await fetch('/api/community/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
        }),
      });

      toast.success('Powiadomienia włączone!');
      setShow(false);
    } catch (err) {
      console.error('Push subscription error:', err);
      toast.error('Nie udało się włączyć powiadomień');
    } finally {
      setSubscribing(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="bg-htg-card border border-htg-card-border rounded-xl p-4 mb-4 flex items-center gap-3">
      <Bell className="w-5 h-5 text-htg-sage shrink-0" />
      <p className="text-sm text-htg-fg flex-1">
        Włącz powiadomienia, aby wiedzieć o nowych postach i komentarzach.
      </p>
      <button
        onClick={handleEnable}
        disabled={subscribing}
        className="px-3 py-1.5 bg-htg-sage text-white rounded-lg text-sm font-medium hover:bg-htg-sage-dark transition-colors disabled:opacity-50 whitespace-nowrap"
      >
        {subscribing ? 'Włączanie...' : 'Włącz'}
      </button>
      <button
        onClick={handleDismiss}
        className="p-1 text-htg-fg-muted hover:text-htg-fg"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
