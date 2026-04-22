import { MessageSquare } from 'lucide-react';

export default function TestimonialsSection() {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-serif font-bold text-htg-fg mb-4">
            Komentarze i posty
          </h2>
          <p className="text-htg-fg-muted text-lg max-w-2xl mx-auto">
            Co mówią uczestnicy sesji.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-htg-card border border-htg-card-border rounded-xl p-6 flex flex-col gap-4"
            >
              <MessageSquare className="w-6 h-6 text-htg-fg-muted/30" />
              <div className="space-y-2">
                <div className="h-4 bg-htg-surface rounded w-full" />
                <div className="h-4 bg-htg-surface rounded w-5/6" />
                <div className="h-4 bg-htg-surface rounded w-3/4" />
              </div>
              <div className="h-3 bg-htg-surface rounded w-1/3 mt-auto" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
