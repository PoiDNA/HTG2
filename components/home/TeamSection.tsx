import { useTranslations } from 'next-intl';
import { User } from 'lucide-react';

export default function TeamSection() {
  const t = useTranslations('Home');

  const team = [
    { name: 'Natalia HTG', role: t('team_natalia'), email: 'natalia@htg.cyou' },
    { name: 'Agata HTG', role: t('team_agata'), email: 'agata@htg.cyou' },
    { name: 'Justyna HTG', role: t('team_justyna'), email: 'justyna@htg.cyou' },
  ];

  return (
    <section className="py-16 md:py-24 bg-htg-surface">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-serif font-bold text-htg-fg mb-4">
            {t('team_title')}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {team.map((member) => (
            <div key={member.email} className="text-center">
              <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-htg-lavender/20 flex items-center justify-center">
                <User className="w-10 h-10 text-htg-lavender" />
              </div>
              <h3 className="font-serif font-semibold text-lg text-htg-fg mb-1">{member.name}</h3>
              <p className="text-htg-fg-muted text-sm">{member.role}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
