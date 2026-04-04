'use client';

import { usePathname } from 'next/navigation';
import { Link } from '@/i18n-config';

interface SidebarLinkProps {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  locale: string;
}

export default function SidebarLink({ href, label, icon: Icon, locale }: SidebarLinkProps) {
  const pathname = usePathname();
  const fullHref = `/${locale}${href}`;

  // Exact match for /konto (dashboard), prefix match for sub-pages
  const isActive =
    href === '/konto'
      ? pathname === fullHref
      : pathname.startsWith(fullHref);

  return (
    <Link
      href={href}
      className={`group flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
        isActive
          ? 'text-htg-fg bg-htg-surface'
          : 'text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface'
      }`}
    >
      <span className={`shrink-0 transition-all duration-200 origin-center group-hover:scale-110 group-hover:text-htg-indigo ${
        isActive ? 'text-htg-indigo' : ''
      }`}>
        <Icon className="w-5 h-5" />
      </span>
      {label}
    </Link>
  );
}
