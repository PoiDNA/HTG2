import { useTranslations } from 'next-intl';
import { Quote } from 'lucide-react';

export default function TestimonialsSection() {
  const t = useTranslations('Home');

  // Placeholder testimonials
  const testimonials = [
    { text: 'Sesje z Natalią zmieniły moje podejście do codzienności. Polecam każdemu.', author: 'Anna K.' },
    { text: 'Bardzo ciepła atmosfera i profesjonalne podejście. Wracam regularnie.', author: 'Marek W.' },
    { text: 'Dostęp online to świetne rozwiązanie — mogę słuchać w swoim tempie.', author: 'Ewa L.' },
  ];

  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-serif font-bold text-htg-fg mb-4">
            {t('testimonials_title')}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((item, i) => (
            <div key={i} className="bg-htg-card border border-htg-card-border rounded-xl p-6">
              <Quote className="w-8 h-8 text-htg-lavender/40 mb-3" />
              <p className="text-htg-fg mb-4 italic leading-relaxed">
                &ldquo;{item.text}&rdquo;
              </p>
              <p className="text-htg-fg-muted text-sm font-medium">— {item.author}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
