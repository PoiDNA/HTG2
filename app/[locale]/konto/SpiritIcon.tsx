import React from 'react';

/**
 * Ethereal metaphor icons for MOJE KONTO sidebar.
 * All icons: 20×20px, stroke=currentColor, strokeWidth=1.5, fill=none.
 * Compatible with Lucide visual style.
 */

export type SpiritIconType =
  | 'portal'      // Biblioteka sesji — koncentryczne koła
  | 'eye'         // Sesje z Natalią — otwarte oko
  | 'vesica'      // Społeczność — dwa splecione okręgi
  | 'feather'     // Centrum Kontaktu — pióro
  | 'crystal'     // Twoje Aktywacje — kryształ/romb
  | 'bond'        // Twoi Znajomi — trzy połączone punkty
  | 'offering'    // Podarowane sesje — kielich/czara
  | 'spiral';     // Aktualizacja — spirala

const base = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.5',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function Portal() {
  return (
    <svg {...base} aria-hidden="true">
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="3.5" />
      <circle cx="10" cy="10" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Eye() {
  return (
    <svg {...base} aria-hidden="true">
      <path d="M1.5 10 C4.5 4 15.5 4 18.5 10 C15.5 16 4.5 16 1.5 10" />
      <circle cx="10" cy="10" r="2.5" />
      <circle cx="10" cy="10" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Vesica() {
  return (
    <svg {...base} aria-hidden="true">
      <circle cx="7.5" cy="10" r="4.5" />
      <circle cx="12.5" cy="10" r="4.5" />
    </svg>
  );
}

function Feather() {
  return (
    <svg {...base} aria-hidden="true">
      <path d="M15 3 C17 6 14 13 8 17 L5 17" />
      <path d="M15 3 C12 4 8 11 5 17" />
      <line x1="10" y1="11" x2="12.5" y2="8.5" />
    </svg>
  );
}

function Crystal() {
  return (
    <svg {...base} aria-hidden="true">
      <path d="M10 2 L16 8 L10 18 L4 8 Z" />
      <line x1="4" y1="8" x2="16" y2="8" />
      <line x1="7" y1="4" x2="10" y2="8" />
      <line x1="13" y1="4" x2="10" y2="8" />
    </svg>
  );
}

function Bond() {
  return (
    <svg {...base} aria-hidden="true">
      <circle cx="10" cy="4" r="2" />
      <circle cx="4" cy="15" r="2" />
      <circle cx="16" cy="15" r="2" />
      <line x1="10" y1="6" x2="5" y2="13" />
      <line x1="10" y1="6" x2="15" y2="13" />
      <line x1="6" y1="15" x2="14" y2="15" />
    </svg>
  );
}

function Offering() {
  return (
    <svg {...base} aria-hidden="true">
      <path d="M5 4 L15 4 C15 8 13 10.5 10 11.5 C7 10.5 5 8 5 4" />
      <line x1="10" y1="11.5" x2="10" y2="16" />
      <line x1="7" y1="16" x2="13" y2="16" />
    </svg>
  );
}

function Spiral() {
  return (
    <svg {...base} aria-hidden="true">
      <path d="M10 10 C10 7.5 13 7.5 13 10 C13 13 7 13.5 7 10 C7 6 14.5 5.5 14.5 10 C14.5 15 5 15.5 5 10" />
    </svg>
  );
}

const icons: Record<SpiritIconType, () => React.ReactElement> = {
  portal: Portal,
  eye: Eye,
  vesica: Vesica,
  feather: Feather,
  crystal: Crystal,
  bond: Bond,
  offering: Offering,
  spiral: Spiral,
};

interface SpiritIconProps {
  type: SpiritIconType;
  className?: string;
}

export default function SpiritIcon({ type, className }: SpiritIconProps) {
  const Icon = icons[type];
  return (
    <span className={className} style={{ display: 'contents' }}>
      <Icon />
    </span>
  );
}
