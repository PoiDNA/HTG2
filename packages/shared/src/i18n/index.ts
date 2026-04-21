export type Locale = "pl" | "en" | "de" | "pt";

export type MessageKey =
  | "app.name"
  | "nav.sessions"
  | "nav.library"
  | "nav.moments"
  | "nav.profile"
  | "auth.login.title"
  | "auth.login.email"
  | "auth.login.sendMagicLink"
  | "auth.login.signInWithApple"
  | "auth.login.magicLinkSent"
  | "auth.logout"
  | "sessions.empty"
  | "sessions.live"
  | "sessions.recorded"
  | "sessions.startsAt"
  | "player.play"
  | "player.pause"
  | "player.skipForward"
  | "player.skipBack"
  | "live.join"
  | "live.leave"
  | "live.connecting"
  | "live.connected"
  | "live.reconnecting"
  | "errors.generic"
  | "errors.network"
  | "errors.notEntitled";

type Bundle = Record<MessageKey, string>;

const pl: Bundle = {
  "app.name": "HTG",
  "nav.sessions": "Sesje",
  "nav.library": "Biblioteka",
  "nav.moments": "Momenty",
  "nav.profile": "Profil",
  "auth.login.title": "Zaloguj się",
  "auth.login.email": "Adres email",
  "auth.login.sendMagicLink": "Wyślij link logowania",
  "auth.login.signInWithApple": "Zaloguj przez Apple",
  "auth.login.magicLinkSent": "Sprawdź swoją skrzynkę — wysłaliśmy link.",
  "auth.logout": "Wyloguj",
  "sessions.empty": "Brak sesji do wyświetlenia",
  "sessions.live": "NA ŻYWO",
  "sessions.recorded": "Nagranie",
  "sessions.startsAt": "Start: {time}",
  "player.play": "Odtwórz",
  "player.pause": "Pauza",
  "player.skipForward": "+15s",
  "player.skipBack": "−15s",
  "live.join": "Dołącz",
  "live.leave": "Wyjdź",
  "live.connecting": "Łączenie…",
  "live.connected": "Połączono",
  "live.reconnecting": "Wznawianie połączenia…",
  "errors.generic": "Coś poszło nie tak",
  "errors.network": "Błąd sieci — sprawdź połączenie",
  "errors.notEntitled": "Ta sesja wymaga aktywnej subskrypcji",
};

const en: Bundle = {
  "app.name": "HTG",
  "nav.sessions": "Sessions",
  "nav.library": "Library",
  "nav.moments": "Moments",
  "nav.profile": "Profile",
  "auth.login.title": "Sign in",
  "auth.login.email": "Email address",
  "auth.login.sendMagicLink": "Send magic link",
  "auth.login.signInWithApple": "Sign in with Apple",
  "auth.login.magicLinkSent": "Check your inbox — we sent a sign-in link.",
  "auth.logout": "Sign out",
  "sessions.empty": "No sessions to show",
  "sessions.live": "LIVE",
  "sessions.recorded": "Recording",
  "sessions.startsAt": "Starts: {time}",
  "player.play": "Play",
  "player.pause": "Pause",
  "player.skipForward": "+15s",
  "player.skipBack": "−15s",
  "live.join": "Join",
  "live.leave": "Leave",
  "live.connecting": "Connecting…",
  "live.connected": "Connected",
  "live.reconnecting": "Reconnecting…",
  "errors.generic": "Something went wrong",
  "errors.network": "Network error — check your connection",
  "errors.notEntitled": "This session requires an active subscription",
};

const de: Bundle = {
  ...en,
  "nav.sessions": "Sitzungen",
  "nav.library": "Bibliothek",
  "nav.moments": "Momente",
  "nav.profile": "Profil",
  "auth.login.title": "Anmelden",
  "auth.login.email": "E-Mail-Adresse",
  "auth.login.sendMagicLink": "Anmeldelink senden",
  "auth.login.signInWithApple": "Mit Apple anmelden",
};

const pt: Bundle = {
  ...en,
  "nav.sessions": "Sessões",
  "nav.library": "Biblioteca",
  "nav.moments": "Momentos",
  "nav.profile": "Perfil",
  "auth.login.title": "Entrar",
  "auth.login.email": "E-mail",
  "auth.login.sendMagicLink": "Enviar link mágico",
  "auth.login.signInWithApple": "Entrar com Apple",
};

export const messages: Record<Locale, Bundle> = { pl, en, de, pt };
