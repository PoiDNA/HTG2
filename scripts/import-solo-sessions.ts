/**
 * Import Solo Sessions (Sesja 1:1 z Natalią)
 *
 * Imports scheduled natalia_solo sessions from the Terminy PDF/XLSX data.
 * Creates auth users, profiles, booking_slots, orders, and bookings.
 *
 * Idempotent — safe to re-run (uses import_key for deduplication).
 *
 * Usage: npx tsx scripts/import-solo-sessions.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SESSION_TYPE = 'natalia_solo';
const DURATION_MINUTES = 120;
const PRICE_PLN = 1100; // historical price for these bookings

interface SessionImport {
  email: string;
  name?: string;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:MM
  amountPaid: number; // PLN (0 = pending, partial, or full)
  paymentMethod: 'transfer' | 'barter' | 'cash' | 'other';
  paymentNotes?: string;
}

// ═══════════════════════════════════════════════════════════════
// SESSION DATA — extracted from Terminy PDF (April–November 2026)
// ═══════════════════════════════════════════════════════════════

const SESSION_DATA: SessionImport[] = [
  // ── April 2026 ──────────────────────────────────────────────
  { email: 'bernadetta.kolodziej@gmx.de', name: 'Bernadetta Kolodziej', date: '2026-04-02', startTime: '09:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'jolanta.zuber@interia.pl', name: 'Jolanta Żuber', date: '2026-04-02', startTime: '16:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'joannaliss2@gmail.com', name: 'Joanna Liss', date: '2026-04-03', startTime: '10:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'beata2b4@gmail.com', name: 'Beata', date: '2026-04-03', startTime: '14:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'terkul@o2.pl', name: 'Teresa Kulka', date: '2026-04-09', startTime: '09:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'basiadd@yahoo.co.uk', name: 'Barbara Davies', date: '2026-04-09', startTime: '12:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'ywone1972@wp.pl', name: 'Iwona Papilak', date: '2026-04-09', startTime: '16:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'amarkowska2021@gmail.com', name: 'Agnieszka Markowska', date: '2026-04-16', startTime: '10:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'renata.ula.rb@gmail.com', name: 'Renata', date: '2026-04-16', startTime: '15:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'piotr@janta.pl', name: 'Piotr Janta', date: '2026-04-17', startTime: '10:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'laskowska800415@gmail.com', name: 'Dorota Laskowska', date: '2026-04-23', startTime: '09:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'wioletastoltman@gmail.com', date: '2026-04-23', startTime: '16:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'ewa.kadzinska@gmail.com', name: 'Ewa Kadzińska', date: '2026-04-24', startTime: '10:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'radek.zakowski@gmail.com', date: '2026-04-24', startTime: '10:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'barszczakpat@gmail.com', name: 'Patrycja Barszczak', date: '2026-04-26', startTime: '10:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'justyna.chojnacka7@wp.pl', name: 'Justyna Chojnacka', date: '2026-04-30', startTime: '14:00', amountPaid: 1100, paymentMethod: 'transfer' },

  // ── May 2026 ────────────────────────────────────────────────
  { email: 'martaszczecinska.mail@gmail.com', name: 'Marta Szczecińska', date: '2026-05-01', startTime: '10:00', amountPaid: 1100, paymentMethod: 'transfer' },
  // 4 May 10:00 — no email, skipped
  { email: 'czernik.damian@gmail.com', date: '2026-05-07', startTime: '09:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'katdub@wp.pl', name: 'Katarzyna Kotarbińska', date: '2026-05-07', startTime: '14:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'evaskykauai@gmail.com', name: 'Eva Sky Lockwood', date: '2026-05-11', startTime: '09:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'd_labuz@op.pl', name: 'Dominika Łabuz', date: '2026-05-11', startTime: '14:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'paliwoda66@hotmail.com', name: 'Grażyna Paliwoda', date: '2026-05-11', startTime: '18:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'maja.bartczak@gmail.com', name: 'Maja Bartczak', date: '2026-05-12', startTime: '10:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'joannabuskiewicz@yahoo.co.uk', name: 'Joanna Buskiewicz', date: '2026-05-12', startTime: '14:00', amountPaid: 1100, paymentMethod: 'transfer', paymentNotes: 'prośba o 13:00' },
  // 12 May 16:00 — no email, skipped
  { email: 'jalocha.k@gmail.com', name: 'Ksenia', date: '2026-05-13', startTime: '10:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'fotozawodowo@gmail.com', name: 'Monika Kaczmarczyk', date: '2026-05-13', startTime: '14:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'slezakluiza@gmail.com', date: '2026-05-14', startTime: '09:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'yoannagwarek@gmail.com', date: '2026-05-14', startTime: '13:00', amountPaid: 1100, paymentMethod: 'transfer' },
  // 17 May 11:00 — "Tomek i Iwona", no email, skipped
  { email: 'sonyjoanl@gmail.com', date: '2026-05-21', startTime: '09:00', amountPaid: 1100, paymentMethod: 'transfer' },
  // bozenajj@gmail.com — no date assigned, skipped
  { email: 'ania.schally@gmail.com', date: '2026-05-21', startTime: '16:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'sarpedona11@gmail.com', name: 'Paulina Flicińska', date: '2026-05-22', startTime: '10:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'aliska@poczta.onet.pl', name: 'Alicja Skenda', date: '2026-05-28', startTime: '10:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'tutti9@wp.pl', name: 'Tutti', date: '2026-05-28', startTime: '14:00', amountPaid: 1100, paymentMethod: 'transfer' },

  // ── June 2026 ───────────────────────────────────────────────
  // 1 June 15:30, 2 June 15:30, 3 June 15:30 — no emails, skipped
  { email: 'lucynajola@onet.pl', name: 'Jolanta Sledziona', date: '2026-06-04', startTime: '09:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'kancelaria.emiliamisztal@gmail.com', name: 'Emilia Misztal', date: '2026-06-04', startTime: '15:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'poweriron1@gmail.com', name: 'Radek Skoczyński', date: '2026-06-08', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'monika.beatka@gmail.com', name: 'Monika Beatka', date: '2026-06-09', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'werbena8@onet.pl', date: '2026-06-10', startTime: '10:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'ana7765@wp.pl', name: 'Anna Sawicka', date: '2026-06-10', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'sabina.walkarz@interia.pl', name: 'Sabina Walkarz', date: '2026-06-11', startTime: '09:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'j.rabczuk@o2.pl', name: 'Asia Rabczuk', date: '2026-06-11', startTime: '15:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'malgorzatamueller04@gmail.com', date: '2026-06-15', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'anestka@gmail.com', name: 'Anna Nesteruk', date: '2026-06-16', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'witczakkatarzyna2@gmail.com', date: '2026-06-17', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  // 18 June 10:00 — no email, skipped
  { email: 'justyna.chojnacka7@wp.pl', name: 'Justyna Chojnacka', date: '2026-06-18', startTime: '16:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'cudlomilomi@gmail.com', name: 'Małgorzata Zienkiewicz', date: '2026-06-22', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'sylvia.dmoch@gmail.com', date: '2026-06-23', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'katarzyna.jedrusik@gmail.com', name: 'Katarzyna Jędrusik', date: '2026-06-24', startTime: '09:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'kantormonika25@gmail.com', name: 'Monika Kantor', date: '2026-06-24', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'greg-077@o2.pl', name: 'Grzegorz Parcheniak', date: '2026-06-25', startTime: '09:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'annaniklas77@icloud.com', name: 'Anna Niklas', date: '2026-06-25', startTime: '16:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'm.smieja@o2.pl', name: 'Małgosia Smieja', date: '2026-06-29', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'joannabuskiewicz@yahoo.co.uk', name: 'Joanna Buskiewicz', date: '2026-06-30', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },

  // ── July 2026 ───────────────────────────────────────────────
  { email: 'barszcz.iwona@gmail.com', name: 'Iwona Barszcz', date: '2026-07-01', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'malgonia0404@gmail.com', name: 'Monika Idec', date: '2026-07-02', startTime: '10:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: '29mona@interia.pl', name: 'Mona Cichoń', date: '2026-07-02', startTime: '14:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'ibentlej@interia.eu', name: 'Iwona Kosz', date: '2026-07-06', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'zawalinska2@o2.pl', name: 'Iwona Sokołowska', date: '2026-07-07', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'agnieszkabudek1@wp.pl', date: '2026-07-07', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'tomkier8@gmail.com', name: 'Tomek Kierzkowski', date: '2026-07-08', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'm.topolnicka-krolikowska@wp.pl', name: 'Martyna Topolnicka', date: '2026-07-09', startTime: '10:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'denis.zegota11@gmail.com', name: 'Denis', date: '2026-07-09', startTime: '14:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'dagmaryna@poczta.fm', name: 'Dagmara Dzikowska-Gabara', date: '2026-07-13', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'm.grazyna.koska@gmail.com', name: 'Grażyna Kośka', date: '2026-07-14', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'tojcia74@gmail.com', name: 'Dagmara', date: '2026-07-15', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'sylvia.dmoch@gmail.com', name: 'Sylwia Dmoch', date: '2026-07-15', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'pilatesrybnik@gmail.com', name: 'Karina Furmanek', date: '2026-07-16', startTime: '09:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'patrycjajakubowska03@gmail.com', name: 'Patrycja Jakubowska', date: '2026-07-16', startTime: '13:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'igos@rogers.com', name: 'Iwona Gos', date: '2026-07-20', startTime: '16:00', amountPaid: 1100, paymentMethod: 'transfer' },
  // 20 July 12:00 — no email, skipped
  { email: 'dobrawaczocher@gmail.com', name: 'Dobrawa Czocher', date: '2026-07-21', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  // 21 July 12:00 — no email, skipped
  { email: 'olga.borgosz@gmail.com', name: 'Olga Borgosz', date: '2026-07-22', startTime: '12:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'mayanek@gmail.com', name: 'Ela Kowalska', date: '2026-07-22', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'czarna0506@interia.pl', name: 'Urszula Trześniowska', date: '2026-07-23', startTime: '16:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'smollkatarzyna@gmail.com', name: 'Katarzyna Smoll', date: '2026-07-30', startTime: '09:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'roslinyszulc@poczta.e.pl', name: 'Henryk Szulc', date: '2026-07-30', startTime: '16:00', amountPaid: 1100, paymentMethod: 'transfer' },

  // ── August 2026 ─────────────────────────────────────────────
  { email: 'kasiawas40@wp.pl', date: '2026-08-03', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'slawinskamarta9@gmail.com', date: '2026-08-04', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'justynaspyrka@gmail.com', name: 'Justyna Spyrka', date: '2026-08-05', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'aldona-2@tlen.pl', name: 'Aldona Bzowska', date: '2026-08-06', startTime: '09:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'paulina.pawelczyk02@gmail.com', name: 'Paulina Pawelczyk', date: '2026-08-06', startTime: '13:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'r2kornacki@wp.pl', name: 'Kornacki Artur', date: '2026-08-10', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'g.heksel@promedpol.pl', name: 'Grażyna Heksel', date: '2026-08-11', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'anna.angel.buda@gmail.com', name: 'Anna Angelika Buda', date: '2026-08-12', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'maciejfijalkowski777@gmail.com', name: 'Maciej Fijalkowski', date: '2026-08-13', startTime: '09:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'melania_b@o2.pl', name: 'Melania', date: '2026-08-13', startTime: '13:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'luty.b@interia.pl', name: 'Barbara Luty', date: '2026-08-17', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  // 18 August 15:30 — no email, skipped
  { email: 'justiddz@gmail.com', name: 'Justyna Wałęza', date: '2026-08-19', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer', paymentNotes: 'wstępnie' },
  { email: 'moni.pawluczuk@gmail.com', name: 'Michał Pawluczuk', date: '2026-08-20', startTime: '09:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'kasia@danielec.fr', name: 'Kasia Danielec', date: '2026-08-20', startTime: '13:00', amountPaid: 1100, paymentMethod: 'transfer' },
  // 24 August 15:30 — no email, skipped
  { email: 'anna.kustosik@gmail.com', name: 'Anna Kustosik', date: '2026-08-25', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'niedzwiedziowaty@o2.pl', name: 'Niedźwiedziowaty', date: '2026-08-26', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'piotr@janta.pl', name: 'Piotr Janta', date: '2026-08-27', startTime: '09:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'alicja.malec444@gmail.com', name: 'Alicja Malec', date: '2026-08-27', startTime: '13:00', amountPaid: 1100, paymentMethod: 'transfer' },
  // 31 August 15:30 — no email, skipped

  // ── September 2026 ──────────────────────────────────────────
  { email: 'anna.kustosik@gmail.com', name: 'Anna Kustosik', date: '2026-09-01', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'gorska-m@wp.pl', name: 'Malgorzata Gorska', date: '2026-09-02', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'lucynaprusakiewicz@interia.pl', name: 'Lucyna Prusakiewicz', date: '2026-09-03', startTime: '09:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'kasia@danielec.fr', name: 'Kasia Danielec', date: '2026-09-03', startTime: '15:00', amountPaid: 1100, paymentMethod: 'transfer', paymentNotes: 'wstępna' },
  // 7 September 15:30 — no email, skipped
  { email: 'zawalinska2@o2.pl', date: '2026-09-08', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer', paymentNotes: 'wstępnie' },
  // 9 September 15:30 — no email, skipped
  { email: 'kancelaria.emiliamisztal@gmail.com', name: 'Emilia Misztal', date: '2026-09-04', startTime: '10:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'kalinurek@wp.pl', name: 'Agnieszka', date: '2026-09-10', startTime: '09:00', amountPaid: 1100, paymentMethod: 'transfer' },
  // 10 September 15:00 — no email, skipped
  { email: 'krzyzacy-33@wp.pl', name: 'Hanna Drapisz', date: '2026-09-17', startTime: '09:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'wojszdominika@gmail.com', name: 'Dominika Wojsz', date: '2026-09-17', startTime: '13:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'beataoum@interia.pl', name: 'Beata Klimas', date: '2026-09-24', startTime: '09:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'wwkwiat@vp.pl', name: 'Wioletta Kwiatkowska', date: '2026-09-24', startTime: '13:00', amountPaid: 1100, paymentMethod: 'transfer' },

  // ── October 2026 ────────────────────────────────────────────
  // 1 October 9:00 — no email, skipped
  { email: 'biankapodrozniczka@gmail.com', name: 'Bianka', date: '2026-10-01', startTime: '13:00', amountPaid: 1100, paymentMethod: 'transfer' },
  // 8 October 9:00 — no email, skipped
  { email: 'marlenakuliziak@gmail.com', name: 'Marlena Kuliziak', date: '2026-10-08', startTime: '13:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'urszula.galazyn@gmail.com', name: 'Urszula Głażyn', date: '2026-10-15', startTime: '09:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'ania.schally@gmail.com', name: 'Ania Schally', date: '2026-10-15', startTime: '13:00', amountPaid: 1100, paymentMethod: 'transfer' },
  { email: 'aldona.dudkowska@gmail.com', name: 'Aldona Dudkowska', date: '2026-10-16', startTime: '10:00', amountPaid: 1100, paymentMethod: 'transfer' },
  // 22 Oct 9:00, 22 Oct 13:00, 29 Oct 9:00, 29 Oct 13:00 — no emails, skipped
  { email: 'sabina.tylicka@gmail.com', name: 'Sabina Tylicka', date: '2026-10-30', startTime: '10:00', amountPaid: 1100, paymentMethod: 'transfer' },

  // ── November 2026 ───────────────────────────────────────────
  // 2-3 Nov — no emails, skipped
  { email: 'malgonia0404@gmail.com', name: 'Monika Idec - SYN', date: '2026-11-04', startTime: '15:30', amountPaid: 1100, paymentMethod: 'transfer' },
  // 5-20 Nov — no emails, skipped
];

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function paymentStatus(amountPaid: number, total: number): string {
  if (amountPaid >= total) return 'paid';
  if (amountPaid > 0) return 'partial';
  return 'pending';
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log('🔄 Import sesji 1:1 z Natalią\n');
  console.log(`Sessions to import: ${SESSION_DATA.length}`);

  // 1. Load existing auth users
  console.log('\n👤 Loading existing users...');
  const allUsers: any[] = [];
  let page = 1;
  while (true) {
    const { data: { users }, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !users || users.length === 0) break;
    allUsers.push(...users);
    if (users.length < 1000) break;
    page++;
  }
  const userByEmail = new Map(allUsers.map(u => [u.email?.toLowerCase(), u]));
  console.log(`  Found ${allUsers.length} existing auth users`);

  let usersCreated = 0, usersExisting = 0;
  let slotsCreated = 0, slotsSkipped = 0;
  let ordersCreated = 0, ordersSkipped = 0;
  let bookingsCreated = 0, bookingsSkipped = 0;
  const skipped: string[] = [];

  for (const s of SESSION_DATA) {
    const email = s.email.toLowerCase().trim();
    const importKey = `${email}|${s.date}|${s.startTime}`;
    const endTime = addMinutes(s.startTime, DURATION_MINUTES);

    // 2. Find or create user
    let userId: string;
    const existing = userByEmail.get(email);

    if (existing) {
      userId = existing.id;
      usersExisting++;
    } else {
      const tempPass = 'HTG_' + Math.random().toString(36).slice(2, 20) + '!Aa1';
      const { data: newUser, error } = await supabase.auth.admin.createUser({
        email,
        password: tempPass,
        email_confirm: true,
        user_metadata: { name: s.name || email.split('@')[0], source: 'session_import' },
      });
      if (error) {
        console.log(`  ❌ ${email} — create failed: ${error.message}`);
        skipped.push(`${email} (user create failed: ${error.message})`);
        continue;
      }
      userId = newUser.user.id;
      userByEmail.set(email, newUser.user);
      usersCreated++;
    }

    // 3. Upsert profile (preserve existing display_name)
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, display_name')
      .eq('id', userId)
      .maybeSingle();

    if (existingProfile) {
      // Only update email if not set
      await supabase.from('profiles').update({ email }).eq('id', userId);
    } else {
      await supabase.from('profiles').upsert({
        id: userId,
        email,
        display_name: s.name || email.split('@')[0],
      }, { onConflict: 'id' });
    }

    // 4. Upsert booking_slot
    const { data: existingSlot } = await supabase
      .from('booking_slots')
      .select('id')
      .eq('import_key', importKey)
      .maybeSingle();

    let slotId: string;
    if (existingSlot) {
      slotId = existingSlot.id;
      slotsSkipped++;
    } else {
      const { data: newSlot, error: slotErr } = await supabase
        .from('booking_slots')
        .insert({
          session_type: SESSION_TYPE,
          slot_date: s.date,
          start_time: s.startTime,
          end_time: endTime,
          status: 'booked',
          held_for_user: userId,
          import_key: importKey,
        })
        .select('id')
        .single();

      if (slotErr) {
        console.log(`  ❌ ${email} ${s.date} ${s.startTime} — slot failed: ${slotErr.message}`);
        skipped.push(`${email} ${s.date} ${s.startTime} (slot: ${slotErr.message})`);
        continue;
      }
      slotId = newSlot.id;
      slotsCreated++;
    }

    // 5. Upsert order
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('id')
      .eq('import_key', importKey)
      .maybeSingle();

    let orderId: string;
    if (existingOrder) {
      orderId = existingOrder.id;
      ordersSkipped++;
    } else {
      const status = paymentStatus(s.amountPaid, PRICE_PLN);
      const { data: newOrder, error: orderErr } = await supabase
        .from('orders')
        .insert({
          user_id: userId,
          status,
          total_amount: PRICE_PLN * 100,    // in grosz
          amount_paid: s.amountPaid * 100,  // in grosz
          currency: 'pln',
          source: 'import',
          payment_method: s.paymentMethod,
          payment_notes: s.paymentNotes || null,
          import_key: importKey,
        })
        .select('id')
        .single();

      if (orderErr) {
        console.log(`  ❌ ${email} ${s.date} — order failed: ${orderErr.message}`);
        skipped.push(`${email} ${s.date} (order: ${orderErr.message})`);
        continue;
      }
      orderId = newOrder.id;
      ordersCreated++;
    }

    // 6. Create booking (if not exists)
    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('id')
      .eq('user_id', userId)
      .eq('slot_id', slotId)
      .maybeSingle();

    if (existingBooking) {
      bookingsSkipped++;
    } else {
      const { error: bookingErr } = await supabase
        .from('bookings')
        .insert({
          user_id: userId,
          slot_id: slotId,
          session_type: SESSION_TYPE,
          order_id: orderId,
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
        });

      if (bookingErr) {
        console.log(`  ❌ ${email} ${s.date} — booking failed: ${bookingErr.message}`);
        skipped.push(`${email} ${s.date} (booking: ${bookingErr.message})`);
        continue;
      }
      bookingsCreated++;
    }

    console.log(`  ✅ ${email} → ${s.date} ${s.startTime}`);
  }

  // Summary
  console.log('\n════════════════════════════════════');
  console.log('✅ IMPORT COMPLETE');
  console.log('════════════════════════════════════');
  console.log(`Users created:    ${usersCreated}`);
  console.log(`Users existing:   ${usersExisting}`);
  console.log(`Slots created:    ${slotsCreated}`);
  console.log(`Slots skipped:    ${slotsSkipped} (already existed)`);
  console.log(`Orders created:   ${ordersCreated}`);
  console.log(`Orders skipped:   ${ordersSkipped} (already existed)`);
  console.log(`Bookings created: ${bookingsCreated}`);
  console.log(`Bookings skipped: ${bookingsSkipped} (already existed)`);

  if (skipped.length > 0) {
    console.log(`\n⚠️ Skipped entries (${skipped.length}):`);
    skipped.forEach(s => console.log(`  - ${s}`));
  }

  // Verify DB totals
  const { count: totalSlots } = await supabase
    .from('booking_slots')
    .select('id', { count: 'exact', head: true })
    .not('import_key', 'is', null);
  const { count: totalBookings } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('session_type', SESSION_TYPE)
    .eq('status', 'confirmed');
  const { count: totalOrders } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'import');

  console.log(`\nDB verification:`);
  console.log(`  Imported slots:    ${totalSlots}`);
  console.log(`  Confirmed bookings (natalia_solo): ${totalBookings}`);
  console.log(`  Import orders:     ${totalOrders}`);
}

main().catch(console.error);
