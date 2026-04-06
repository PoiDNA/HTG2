'use client';

import { useEffect, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

const ITEMS = [
  { href: '/konto', label: 'Biblioteka sesji', color: 'rgb(244, 63, 94)' },
  { href: '/konto/sesje-indywidualne', label: 'Sesje z Natalią', color: 'rgb(139, 92, 246)' },
  { href: '/spolecznosc', label: 'Społeczność', color: 'rgb(20, 184, 166)' },
  { href: '/konto/wiadomosci', label: 'Centrum Kontaktu', color: 'rgb(16, 185, 129)' },
  { href: '/konto/polubieni', label: 'Twoi Znajomi', color: 'rgb(251, 146, 60)' },
  { href: '/konto/podarowane-sesje', label: 'Podarowane sesje', color: 'rgb(244, 114, 182)' },
  { href: '/konto/aktualizacja', label: 'Aktualizacja', color: 'rgb(14, 165, 233)' },
];

function HexCell({ href, label, color, isActive, locale, highlighted }: {
  href: string; label: string; color: string; isActive: boolean; locale: string; highlighted: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const showLabel = hovered || highlighted;
  const emphasis = hovered || highlighted;

  return (
    <Link
      href={`/${locale}${href}`}
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="relative w-12 h-14 md:w-15 md:h-[70px] flex items-center justify-center transition-all duration-300"
        style={{
          clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
          transform: emphasis ? 'scale(1.12)' : 'scale(1)',
        }}
      >
        <div
          className="absolute inset-0 transition-opacity duration-300"
          style={{
            backgroundColor: color,
            opacity: emphasis ? 0.4 : isActive ? 0.25 : 0.08,
          }}
        />
        <div
          className="relative w-2 h-2 rounded-full z-10 transition-transform duration-300"
          style={{
            backgroundColor: color,
            transform: emphasis ? 'scale(1.6)' : 'scale(1)',
          }}
        />
      </div>

      <div
        className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 bg-htg-fg text-htg-bg text-[10px] font-medium rounded whitespace-nowrap pointer-events-none z-50 transition-opacity duration-300"
        style={{ opacity: showLabel ? 1 : 0 }}
      >
        {label}
      </div>
    </Link>
  );
}

export default function HoneycombNav({ locale }: { locale: string }) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);
  const [introIndex, setIntroIndex] = useState(-1);
  const introRan = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setVisible(y < lastScrollY.current || y < 80);
      lastScrollY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Intro animation: highlight each item left-to-right, once per page load
  useEffect(() => {
    if (introRan.current) return;
    introRan.current = true;

    let i = 0;
    const run = () => {
      setIntroIndex(i);
      i++;
      if (i < ITEMS.length) {
        setTimeout(run, 1500);
      } else {
        // Clear last highlight after 1.5s
        setTimeout(() => setIntroIndex(-1), 1500);
      }
    };
    // Start after a short delay
    setTimeout(run, 500);
  }, []);

  return (
    <div
      className={`sticky top-[64px] z-30 bg-htg-bg/80 backdrop-blur-md border-b border-htg-card-border transition-all duration-300 ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
      }`}
    >
      <div className="mx-auto max-w-6xl px-3 py-2 md:py-3">
        <div className="flex flex-wrap justify-center gap-1.5 md:gap-3">
          {ITEMS.map((item, idx) => {
            const fullHref = `/${locale}${item.href}`;
            const isActive = pathname === fullHref || (item.href !== '/konto' && pathname.startsWith(fullHref));

            return (
              <HexCell
                key={item.href}
                href={item.href}
                label={item.label}
                color={item.color}
                isActive={isActive}
                locale={locale}
                highlighted={introIndex === idx}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
