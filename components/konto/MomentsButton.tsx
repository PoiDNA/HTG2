import { Link } from '@/i18n-config';
import { Play } from 'lucide-react';

export default function MomentsButton() {
  return (
    <Link
      href="/konto/momenty"
      className="flex flex-row items-center gap-5 bg-htg-card border-2 border-htg-card-border rounded-xl px-6 py-4 hover:border-violet-400/50 transition-colors group h-full min-h-[100px]"
    >
      <div className="shrink-0 w-16 h-16 rounded-full bg-violet-400 flex items-center justify-center shadow-xl shadow-violet-400/25 group-hover:brightness-110 transition-[filter]">
        <Play className="w-7 h-7 text-white ml-1" />
      </div>
      <span className="text-2xl font-serif font-semibold text-htg-fg">Momenty</span>
    </Link>
  );
}
