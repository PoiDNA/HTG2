// Stała lista osób do bulk-assign nagrań w panelu sesji (admin + staff).
// Edycja = commit + deploy. Alternatywa DB-backed odrzucona dla scope MVP.
export const PRESET_SHARE_EMAILS = [
  'agata@htg.cyou',
  'justyna@htg.cyou',
  'tkulka25@gmail.com',
  'gooch.269@gmail.com',
  'drabarekmariusz@gmail.com',
  'aniapro713@gmail.com',
  'm.grabowska34@gmail.com',
  'biankapodrozniczka@gmail.com',
] as const;

export type PresetShareEmail = typeof PRESET_SHARE_EMAILS[number];
