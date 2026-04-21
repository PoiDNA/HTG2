import { getLocales } from "expo-localization";
import { messages, type Locale, type MessageKey } from "@htg/shared";

const SUPPORTED: Locale[] = ["pl", "en", "de", "pt"];

export function detectLocale(): Locale {
  const preferred = getLocales()[0]?.languageCode?.toLowerCase();
  if (preferred && SUPPORTED.includes(preferred as Locale)) {
    return preferred as Locale;
  }
  return "pl";
}

let currentLocale: Locale = detectLocale();

export function setLocale(locale: Locale): void {
  if (SUPPORTED.includes(locale)) {
    currentLocale = locale;
  }
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(key: MessageKey, values?: Record<string, string | number>): string {
  const bundle = messages[currentLocale] ?? messages.pl;
  let str = bundle[key] ?? messages.en[key] ?? key;
  if (values) {
    for (const [k, v] of Object.entries(values)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return str;
}
