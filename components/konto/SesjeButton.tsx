import { Link } from '@/i18n-config';
import { Play } from 'lucide-react';

export default function SesjeButton() {
  return (
    <Link
      href="/konto/sluchaj"
      className="flex flex-col items-center justify-center gap-2 p-6 group"
    >
      <div className="flex items-center gap-3">
        <div className="shrink-0 w-16 h-16 rounded-full bg-htg-sage flex items-center justify-center shadow-xl shadow-htg-sage/25 group-hover:brightness-110 transition-[filter]">
          <Play className="w-7 h-7 text-white ml-1" />
        </div>
        <span className="text-[58px] font-serif font-bold leading-none text-htg-fg">S</span>
      </div>
      <span className="text-sm font-serif font-semibold text-htg-fg-muted opacity-0 group-hover:opacity-100 transition-opacity duration-500">Sesje</span>
    </Link>
  );
}
