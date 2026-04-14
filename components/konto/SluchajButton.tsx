import { Link } from '@/i18n-config';
import { Play } from 'lucide-react';

export default function SluchajButton() {
  return (
    <Link
      href="/konto/sluchaj"
      className="flex flex-col items-center justify-center gap-3 bg-htg-card border-2 border-htg-card-border rounded-xl p-4 hover:border-htg-sage/50 transition-colors group h-full"
    >
      <div className="aspect-square h-[65%] rounded-full bg-htg-sage flex items-center justify-center shadow-xl shadow-htg-sage/25 group-hover:brightness-110 transition-[filter]">
        <Play className="w-[40%] h-[40%] text-white ml-[8%]" />
      </div>
      <span className="text-sm font-serif font-semibold text-htg-fg">Słuchaj</span>
    </Link>
  );
}
