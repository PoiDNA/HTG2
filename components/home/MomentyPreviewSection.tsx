import { getHomepageMomenty } from '@/lib/services/homepage-momenty';
import MomentyPlayer from './MomentyPlayer';

export default async function MomentyPreviewSection() {
  const moments = await getHomepageMomenty(4);

  if (moments.length === 0) return null;

  return (
    <section className="py-16 md:py-24 bg-htg-surface">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-serif font-bold text-htg-fg mb-4">
            Momenty wybranych sesji
          </h2>
          <p className="text-htg-fg-muted text-lg max-w-2xl mx-auto">
            Wybrane impulsy z archiwum — rotacja tygodniowa.
          </p>
        </div>

        <div className="flex justify-center">
          <MomentyPlayer moments={moments} />
        </div>
      </div>
    </section>
  );
}
