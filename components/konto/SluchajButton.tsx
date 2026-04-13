import { Link } from '@/i18n-config';
import { Play } from 'lucide-react';

export default function SluchajButton() {
  return (
    <Link
      href="/konto/sluchaj"
      className="flex items-center justify-center gap-3 bg-htg-card border-2 border-htg-card-border rounded-xl p-6 hover:border-htg-sage/50 transition-colors group min-w-[180px]"
    >
      <div className="w-12 h-12 rounded-full bg-htg-sage/20 flex items-center justify-center group-hover:bg-htg-sage/30 transition-colors">
        <Play className="w-6 h-6 text-htg-sage ml-0.5" />
      </div>
      <span className="text-lg font-serif font-semibold text-htg-fg">Słuchaj</span>
    </Link>
  );
}
