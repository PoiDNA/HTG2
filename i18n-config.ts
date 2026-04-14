import { createNavigation } from 'next-intl/navigation';
import { defineRouting } from 'next-intl/routing';

export const locales = ['pl', 'en', 'de', 'pt'] as const;
export const defaultLocale = 'pl' as const;

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'always',
  pathnames: {
    '/': '/',

    // ─── Public / universal (no translation) ─────────────────────
    '/host': '/host',
    '/host-v2': '/host-v2',
    '/host-v3': '/host-v3',
    '/host-v4': '/host-v4',
    '/login': '/login',
    '/privacy': '/privacy',
    '/terms': '/terms',
    '/operator-terms': '/operator-terms',
    '/pilot': '/pilot',
    '/nagrania': '/nagrania',

    // ─── Top-level user-facing ───────────────────────────────────
    '/sesje': {
      pl: '/sesje',
      en: '/sessions',
      de: '/sitzungen',
      pt: '/sessoes',
    },
    '/sesje-indywidualne': {
      pl: '/sesje-indywidualne',
      en: '/individual-sessions',
      de: '/einzelsitzungen',
      pt: '/sessoes-individuais',
    },
    '/subskrypcje': {
      pl: '/subskrypcje',
      en: '/subscriptions',
      de: '/abonnements',
      pt: '/assinaturas',
    },
    '/spolecznosc': {
      pl: '/spolecznosc',
      en: '/community',
      de: '/gemeinschaft',
      pt: '/comunidade',
    },
    '/spolecznosc/[slug]': {
      pl: '/spolecznosc/[slug]',
      en: '/community/[slug]',
      de: '/gemeinschaft/[slug]',
      pt: '/comunidade/[slug]',
    },
    '/spolecznosc/dolacz/[token]': {
      pl: '/spolecznosc/dolacz/[token]',
      en: '/community/join/[token]',
      de: '/gemeinschaft/beitreten/[token]',
      pt: '/comunidade/participar/[token]',
    },
    '/spolecznosc/zapisane': {
      pl: '/spolecznosc/zapisane',
      en: '/community/saved',
      de: '/gemeinschaft/gespeichert',
      pt: '/comunidade/salvos',
    },
    '/spotkanie/[sessionId]': {
      pl: '/spotkanie/[sessionId]',
      en: '/meeting/[sessionId]',
      de: '/treffen/[sessionId]',
      pt: '/encontro/[sessionId]',
    },
    '/live/[sessionId]': '/live/[sessionId]',
    '/polaczenie/[callId]': {
      pl: '/polaczenie/[callId]',
      en: '/call/[callId]',
      de: '/anruf/[callId]',
      pt: '/chamada/[callId]',
    },

    // ─── /konto → /account ───────────────────────────────────────
    '/konto': {
      pl: '/konto',
      en: '/account',
      de: '/konto',
      pt: '/conta',
    },
    '/konto/aktualizacja': {
      pl: '/konto/aktualizacja',
      en: '/account/update',
      de: '/konto/aktualisierung',
      pt: '/conta/atualizacao',
    },
    '/konto/nagrania-klienta': {
      pl: '/konto/nagrania-klienta',
      en: '/account/client-recordings',
      de: '/konto/kundenaufnahmen',
      pt: '/conta/gravacoes-cliente',
    },
    '/konto/nagrania-sesji': {
      pl: '/konto/nagrania-sesji',
      en: '/account/session-recordings',
      de: '/konto/sitzungsaufnahmen',
      pt: '/conta/gravacoes-sessao',
    },
    '/konto/odbierz-prezent/[token]': {
      pl: '/konto/odbierz-prezent/[token]',
      en: '/account/redeem-gift/[token]',
      de: '/konto/geschenk-einloesen/[token]',
      pt: '/conta/resgatar-presente/[token]',
    },
    '/konto/podarowane-sesje': {
      pl: '/konto/podarowane-sesje',
      en: '/account/gifted-sessions',
      de: '/konto/geschenkte-sitzungen',
      pt: '/conta/sessoes-presenteadas',
    },
    '/konto/polubieni': {
      pl: '/konto/polubieni',
      en: '/account/favorites',
      de: '/konto/favoriten',
      pt: '/conta/favoritos',
    },
    '/konto/sesja-panel': {
      pl: '/konto/sesja-panel',
      en: '/account/session-panel',
      de: '/konto/sitzungs-panel',
      pt: '/conta/painel-sessao',
    },
    '/konto/sesje': {
      pl: '/konto/sesje',
      en: '/account/sessions',
      de: '/konto/sitzungen',
      pt: '/conta/sessoes',
    },
    '/konto/sesje-indywidualne': {
      pl: '/konto/sesje-indywidualne',
      en: '/account/individual-sessions',
      de: '/konto/einzelsitzungen',
      pt: '/conta/sessoes-individuais',
    },
    '/konto/sesje-indywidualne/dolacz-jako-partner/[token]': {
      pl: '/konto/sesje-indywidualne/dolacz-jako-partner/[token]',
      en: '/account/individual-sessions/join-as-partner/[token]',
      de: '/konto/einzelsitzungen/als-partner-beitreten/[token]',
      pt: '/conta/sessoes-individuais/participar-como-parceiro/[token]',
    },
    '/konto/sluchaj': {
      pl: '/konto/sluchaj',
      en: '/account/listen',
      de: '/konto/zuhoeren',
      pt: '/conta/ouvir',
    },
    '/konto/spotkania-grupowe': {
      pl: '/konto/spotkania-grupowe',
      en: '/account/group-meetings',
      de: '/konto/gruppentreffen',
      pt: '/conta/encontros-grupo',
    },
    '/konto/spotkania-grupowe/[sessionId]': {
      pl: '/konto/spotkania-grupowe/[sessionId]',
      en: '/account/group-meetings/[sessionId]',
      de: '/konto/gruppentreffen/[sessionId]',
      pt: '/conta/encontros-grupo/[sessionId]',
    },
    '/konto/spotkania-grupowe/dostepne': {
      pl: '/konto/spotkania-grupowe/dostepne',
      en: '/account/group-meetings/available',
      de: '/konto/gruppentreffen/verfuegbar',
      pt: '/conta/encontros-grupo/disponiveis',
    },
    '/konto/spotkanie-wstepne': {
      pl: '/konto/spotkanie-wstepne',
      en: '/account/intro-meeting',
      de: '/konto/einfuehrungstreffen',
      pt: '/conta/encontro-introdutorio',
    },
    '/konto/subskrypcje': {
      pl: '/konto/subskrypcje',
      en: '/account/subscriptions',
      de: '/konto/abonnements',
      pt: '/conta/assinaturas',
    },
    '/konto/tlumacz': {
      pl: '/konto/tlumacz',
      en: '/account/translator',
      de: '/konto/uebersetzer',
      pt: '/conta/tradutor',
    },
    '/konto/watch/[sessionId]': {
      pl: '/konto/watch/[sessionId]',
      en: '/account/watch/[sessionId]',
      de: '/konto/watch/[sessionId]',
      pt: '/conta/watch/[sessionId]',
    },
    '/konto/wiadomosci': {
      pl: '/konto/wiadomosci',
      en: '/account/messages',
      de: '/konto/nachrichten',
      pt: '/conta/mensagens',
    },
    '/konto/zamowienia': {
      pl: '/konto/zamowienia',
      en: '/account/orders',
      de: '/konto/bestellungen',
      pt: '/conta/pedidos',
    },
    '/konto/zgody': {
      pl: '/konto/zgody',
      en: '/account/consent',
      de: '/konto/einwilligungen',
      pt: '/conta/consentimentos',
    },

    // ─── /konto/admin (internal, no translation) ─────────────────
    '/konto/admin': '/konto/admin',
    '/konto/admin/kalendarz': '/konto/admin/kalendarz',
    '/konto/admin/kolejka': '/konto/admin/kolejka',
    '/konto/admin/nagrania-klientow': '/konto/admin/nagrania-klientow',
    '/konto/admin/naruszenia': '/konto/admin/naruszenia',
    '/konto/admin/podglad': '/konto/admin/podglad',
    '/konto/admin/sesje': '/konto/admin/sesje',
    '/konto/admin/sesje/[id]': '/konto/admin/sesje/[id]',
    '/konto/admin/skrzynka': '/konto/admin/skrzynka',
    '/konto/admin/sloty': '/konto/admin/sloty',
    '/konto/admin/spolecznosc': '/konto/admin/spolecznosc',
    '/konto/admin/subskrypcje': '/konto/admin/subskrypcje',
    '/konto/admin/tlumaczenia': '/konto/admin/tlumaczenia',
    '/konto/admin/uzytkownicy': '/konto/admin/uzytkownicy',
    '/konto/admin/uzytkownicy/[id]': '/konto/admin/uzytkownicy/[id]',
    '/konto/admin/zestawy': '/konto/admin/zestawy',
    '/konto/admin/zgloszenia': '/konto/admin/zgloszenia',

    // ─── /tlumacz (internal translator panel, no translation) ───
    '/tlumacz': '/tlumacz',
    '/tlumacz/sesje': '/tlumacz/sesje',
    '/tlumacz/grafik': '/tlumacz/grafik',
    '/tlumacz/klienci': '/tlumacz/klienci',
    '/translator-terms': '/translator-terms',

    // ─── /prowadzacy (internal staff, no translation) ────────────
    '/prowadzacy': '/prowadzacy',
    '/prowadzacy/grafik': '/prowadzacy/grafik',
    '/prowadzacy/klienci': '/prowadzacy/klienci',
    '/prowadzacy/sesje': '/prowadzacy/sesje',
    '/prowadzacy/sesje/[id]': '/prowadzacy/sesje/[id]',
    '/prowadzacy/spotkania': '/prowadzacy/spotkania',
    '/prowadzacy/spotkania-htg': '/prowadzacy/spotkania-htg',
    '/prowadzacy/spotkania-htg/[meetingId]': '/prowadzacy/spotkania-htg/[meetingId]',
    '/prowadzacy/spotkania-htg/[meetingId]/sesje': '/prowadzacy/spotkania-htg/[meetingId]/sesje',
    '/prowadzacy/spotkania-htg/nowe': '/prowadzacy/spotkania-htg/nowe',
    '/prowadzacy/spotkania-htg/odtwarzacz-symulator': '/prowadzacy/spotkania-htg/odtwarzacz-symulator',
    '/prowadzacy/spotkania-htg/peek/[sessionId]': '/prowadzacy/spotkania-htg/peek/[sessionId]',
    '/prowadzacy/spotkania-htg/profile-uczestnikow': '/prowadzacy/spotkania-htg/profile-uczestnikow',
    '/prowadzacy/spotkania-htg/symulator': '/prowadzacy/spotkania-htg/symulator',
    '/prowadzacy/statystyki': '/prowadzacy/statystyki',
    '/prowadzacy/symulator': '/prowadzacy/symulator',
    '/prowadzacy/symulator-live': '/prowadzacy/symulator-live',

    // ─── /publikacja (internal editor, no translation) ───────────
    '/publikacja': '/publikacja',
    '/publikacja/archiwum': '/publikacja/archiwum',
    '/publikacja/dodaj': '/publikacja/dodaj',
    '/publikacja/edytor/[id]': '/publikacja/edytor/[id]',
    '/publikacja/moje': '/publikacja/moje',
    '/publikacja/nagrania': '/publikacja/nagrania',
    '/publikacja/sesje': '/publikacja/sesje',
    '/publikacja/sesje/[id]': '/publikacja/sesje/[id]',
  },
});

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);

export type AppPathname = Parameters<typeof getPathname>[0]['href'];
