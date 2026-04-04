export type SpiritIconType =
  | 'portal'      // Biblioteka sesji
  | 'eye'         // Sesje z Natalią
  | 'vesica'      // Społeczność
  | 'feather'     // Centrum Kontaktu
  | 'crystal'     // Twoje Aktywacje
  | 'bond'        // Twoi Znajomi
  | 'offering'    // Podarowane sesje
  | 'spiral';     // Aktualizacja

const dotColor: Record<SpiritIconType, string> = {
  portal:   'bg-rose-500    dark:bg-rose-400',
  eye:      'bg-violet-500  dark:bg-violet-400',  // swap: Sesje z Natalią ← violet
  vesica:   'bg-teal-500    dark:bg-teal-400',
  feather:  'bg-emerald-500 dark:bg-emerald-400',
  crystal:  'bg-amber-400   dark:bg-amber-300',   // swap: Twoje Aktywacje ← amber
  bond:     'bg-orange-400  dark:bg-orange-300',
  offering: 'bg-pink-400    dark:bg-pink-300',
  spiral:   'bg-sky-500     dark:bg-sky-400',
};

interface SpiritIconProps {
  type: SpiritIconType;
}

export default function SpiritIcon({ type }: SpiritIconProps) {
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full transition-transform duration-200 group-hover:scale-[1.8] ${dotColor[type]}`}
    />
  );
}
