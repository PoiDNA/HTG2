/**
 * Import Asysta Sessions (migracja 2 — sesje.xlsx)
 *
 * Imports scheduled sessions from the second migration spreadsheet.
 * Handles multiple session types: natalia_asysta, natalia_solo, natalia_agata, natalia_para.
 * Creates auth users, profiles, booking_slots, orders, and bookings.
 *
 * Idempotent — safe to re-run (uses import_key with |m2 suffix for deduplication).
 *
 * Usage: npx tsx scripts/import-asysta-sessions.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ═══════════════════════════════════════════════════════════════
// SESSION TYPE CONFIG
// ═══════════════════════════════════════════════════════════════

const SESSION_CONFIG: Record<string, { duration: number; price: number }> = {
  natalia_asysta: { duration: 90, price: 1600 },
  natalia_solo:   { duration: 120, price: 1100 },
  natalia_agata:  { duration: 90, price: 1600 },
  natalia_para:   { duration: 120, price: 1600 },
};

// Date threshold: sessions before this date are considered already paid
const PAID_CUTOFF = '2026-03-24';

interface SessionImport {
  email: string;
  name?: string;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:MM
  type: string;       // session type key
  paymentNotes?: string;
}

// ═══════════════════════════════════════════════════════════════
// SESSION DATA — extracted from "migracja 2 - sesje.xlsx"
// ═══════════════════════════════════════════════════════════════

const SESSION_DATA: SessionImport[] = [
  { email: 'edyta.magdalena@interia.pl', name: 'E. Borzymowska', date: '2026-02-24', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'karola303@gmail.com', name: 'Karolina Kowalczyk', date: '2026-02-24', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'ala_borys@wp.pl', name: 'Ala Borys', date: '2026-02-25', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'janusz.szatanik@gmail.com', date: '2026-02-25', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'melerska8@gmail.com', name: 'Monika Melerska', date: '2026-02-25', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'daniela.ostrowicka@gmail.com', date: '2026-02-25', startTime: '18:00', type: 'natalia_asysta' },
  { email: 'mjablonska16@wp.pl', name: 'Monika Jabłońska', date: '2026-03-02', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'mayanek@gmail.com', name: 'Ela Kowalska', date: '2026-03-02', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'rudnicki.michal@gmail.com', date: '2026-03-02', startTime: '18:00', type: 'natalia_asysta' },
  { email: 'monikajaskowska-bablok@wp.pl', date: '2026-03-03', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'kantormonika25@gmail.com', date: '2026-03-03', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'aniastrak2@gmail.com', name: 'Anna Strąk', date: '2026-03-03', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'edith.oc@op.pl', name: 'Edyta Ociepa', date: '2026-03-03', startTime: '18:00', type: 'natalia_asysta' },
  { email: 'glozynska@o2.pl', name: 'Gosia Głożyńska', date: '2026-03-04', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'iloczy@wp.pl', name: 'Ilona Czyż', date: '2026-03-04', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'urszula.wenta@gmail.com', date: '2026-03-04', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'o.kosecki@nawino.com', name: 'Kosecki', date: '2026-03-09', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'andrzejczmarta639@gmail.com', name: 'Andrzejczak Marta', date: '2026-03-09', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'urszula.radomska@vp.pl', date: '2026-03-09', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'emilkaszcz1@icloud.com', name: 'Emilia Zwolak', date: '2026-03-10', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'df9@wp.pl', name: 'Kosecka Ilona', date: '2026-03-10', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'zawalinska2@o2.pl', name: 'Sokołowska Iwona', date: '2026-03-10', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'lukas1111st@gmail.com', name: 'Starojciec Łukasz', date: '2026-03-10', startTime: '18:00', type: 'natalia_asysta' },
  { email: 'spraynow.ksz@gmail.com', name: 'Szlęzak Kamil', date: '2026-03-11', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'aniolek632.ab@gmail.com', name: 'Anna Brenner', date: '2026-03-11', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'miara.j@wp.pl', name: 'Justyna Miara', date: '2026-03-11', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'agagotthardt@icloud.com', date: '2026-03-16', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'jjstrek35@yahoo.com', name: 'Justyna Strek', date: '2026-03-16', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'monikamostert85@gmail.com', date: '2026-03-16', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'bognakrawczyk8@gmail.com', date: '2026-03-16', startTime: '18:00', type: 'natalia_asysta' },
  { email: 'bsliwerska@wp.pl', date: '2026-03-17', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'bea9@onet.eu', name: 'Nguyen Beata', date: '2026-03-17', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'dmat120902@gmail.com', name: 'Daria Matuszczak', date: '2026-03-17', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'katarzyna.raczy@gmail.com', date: '2026-03-18', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'anna.angel.buda@gmail.com', name: 'Anna Buda', date: '2026-03-18', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'j.grzesiak84@gmail.com', name: 'Joanna Grzesiak', date: '2026-03-18', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'helena.borys@gmail.com', date: '2026-03-23', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'jeanpaul.mroz@gmail.com', name: 'Jean Paul Mroz', date: '2026-03-23', startTime: '12:00', type: 'natalia_agata' },
  { email: 'zuzanna.szu@poczta.onet.pl', name: 'Szubrych Zuzanna', date: '2026-03-23', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'edyta.pawluczuk@interia.eu', date: '2026-03-23', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'm_niemietz@icloud.com', name: 'Gosia Niemietz', date: '2026-03-23', startTime: '18:00', type: 'natalia_asysta' },
  { email: 'grzegorz.potoczny1@gmail.com', date: '2026-03-24', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'yoannalach@gmail.com', name: 'Joanna Lach', date: '2026-03-24', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'mwwg@poczta.onet.pl', name: 'Głowacka Magda', date: '2026-03-24', startTime: '18:00', type: 'natalia_asysta' },
  { email: 'emali1@o2.pl', name: 'Laurentowska Ela', date: '2026-03-25', startTime: '09:00', type: 'natalia_solo' },
  { email: 'kacper.domeradzki@gmail.com', date: '2026-03-25', startTime: '15:00', type: 'natalia_solo' },
  { email: 'edyta_slowik@wp.pl', name: 'Edyta Słowik', date: '2026-03-30', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'magdalena-domaradzka@wp.pl', date: '2026-03-30', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'zuzannasudnik91@gmail.com', date: '2026-03-30', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'edyt_28@wp.pl', name: 'Kurylak Edyta', date: '2026-03-31', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'maciej.roszkowski.photo@gmail.com', date: '2026-03-31', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'annaskwarko@gmail.com', name: 'Anna Mosur', date: '2026-03-31', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'salsaprim@wp.pl', name: 'Skawińska Dagmara', date: '2026-03-31', startTime: '18:00', type: 'natalia_asysta' },
  { email: 'm.grabowska34@gmail.com', date: '2026-04-01', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'alaszura@gmail.com', name: 'Ala Szura', date: '2026-04-01', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'szymon-trafas@o2.pl', date: '2026-04-06', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'isabellkluczynski@gmail.com', date: '2026-04-06', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'annamurawska8682@gmail.com', date: '2026-04-06', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'jeanne2@o2.pl', name: 'Joanna Pielak', date: '2026-04-07', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'm.topolnicka-krolikowska@wp.pl', date: '2026-04-07', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'robertpolak1@wp.pl', date: '2026-04-07', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'gorska-m@wp.pl', name: 'Gosia Górska', date: '2026-04-08', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'grychtol.sylwia@gmail.com', date: '2026-04-08', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'karolin82@wp.pl', name: 'Szumska', date: '2026-04-08', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'danakarol59@gmail.com', name: 'Danuta Lempert', date: '2026-04-13', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'aleksandrawroblewska7@gmail.com', date: '2026-04-13', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'niemiec77777@wp.pl', name: 'Chorąży Stanisław', date: '2026-04-14', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'dominikaszczeplik@gmail.com', date: '2026-04-14', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'magdalena.witecka@wp.pl', date: '2026-04-14', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'wiesiopilarz200@wp.pl', name: 'Fiolek', date: '2026-04-15', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'katarzyna-stasiak83@o2.pl', date: '2026-04-15', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'anna2822@tlen.pl', name: 'Anna Brzozowska', date: '2026-04-15', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'magdalenan304@gmail.com', name: 'Nowak Magda', date: '2026-04-20', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'heymer@wp.pl', date: '2026-04-20', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'arkadiuszslowik@wp.pl', date: '2026-04-20', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'astrix2244@wp.pl', name: 'Pawiński Marcin', date: '2026-04-21', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'malgorzatakrakowiak0981@gmail.com', date: '2026-04-21', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'd2752@o2.pl', name: 'Radzimińska Gosia', date: '2026-04-21', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'izabelakopacz2@gmail.com', date: '2026-04-22', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'kamafuller@proton.me', name: 'Kama Fuller', date: '2026-04-22', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'parypa@o2.pl', name: 'Parypińska Kasia', date: '2026-04-22', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'abednarczykm@vp.pl', name: 'Ania Bednarczyk', date: '2026-04-27', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'marcinkowska.basia@gmail.com', date: '2026-04-27', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'anna.sobala69@wp.pl', date: '2026-04-27', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'iwonavarga@gmail.com', name: 'Iwona Varga', date: '2026-04-28', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'hapka.pawel@gmail.com', date: '2026-04-28', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'bozka.vip@gmail.com', name: 'Porwolik Bożena', date: '2026-04-28', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'kwiatkowska.ewe@gmail.com', name: 'Ewelina', date: '2026-04-29', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'alicjakurzawa@gmail.com', date: '2026-04-29', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'urszulalewczuk1@gmail.com', date: '2026-05-04', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'ewa.wlodarczyk@free.fr', date: '2026-05-04', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'pawellc30@gmail.com', name: 'Cieślewicz Paweł', date: '2026-05-05', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'muszkamala39@gmail.com', name: 'Gosia Bielecka', date: '2026-05-05', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'monika.kalamarz698@gmail.com', date: '2026-05-05', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'goch@autograf.pl', name: 'Stankiewicz Gosia', date: '2026-05-06', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'meja.jaworska@gmail.com', name: 'Marzena Jaworska', date: '2026-05-06', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'agnieszkaannaolesinska@gmail.com', name: 'Olesińska Aga', date: '2026-05-06', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'jadwigaweglowska12@gmail.com', date: '2026-05-18', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'kasiag77@o2.pl', name: 'Kasia Mazur', date: '2026-05-18', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'kw563102@gmail.com', name: 'Wójcik Kasia', date: '2026-05-18', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'ewakorczewska16@gmail.com', date: '2026-05-19', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'anna.koszewskakob@interia.pl', name: 'Koszewska Ania', date: '2026-05-19', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'joanna.konieczna@gmail.com', date: '2026-05-20', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'tomasz@doktordobrze.pl', name: 'Jakóbelski Tomasz', date: '2026-05-20', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'martabapeer84@icloud.com', name: 'Bapeer Marta', date: '2026-05-25', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'dupametaverse@gmail.com', name: 'Tomasz Kowalski', date: '2026-05-25', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'karol.mroz@op.pl', date: '2026-05-25', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'takaja76@o2.pl', name: 'Marzena Efir', date: '2026-05-26', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'asutula@op.pl', name: 'Anna Pająk', date: '2026-05-26', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'srokamarc@gmail.com', name: 'Marcin Sroka', date: '2026-05-26', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'rafalbulacinski@gmail.com', date: '2026-05-27', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'lilianna.zdun@gmail.com', name: 'Marta Krupa', date: '2026-05-27', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'kryckipawel@gmail.com', date: '2026-06-01', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'anna.horodyskaa@gmail.com', date: '2026-06-01', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'wiolakorzeniowska.prywatny@gmail.com', date: '2026-06-01', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'magdalena.jakubowska1960@gmail.com', date: '2026-06-02', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'danutka617@wp.pl', name: 'Kopec Danuta', date: '2026-06-02', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'mgo@wp.eu', name: 'Magda', date: '2026-06-02', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'aniastachniak@tlen.pl', date: '2026-06-03', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'urszula.galazyn@gmail.com', date: '2026-06-03', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'tereniasz@op.pl', name: 'Sztygowska Teresa', date: '2026-06-03', startTime: '15:00', type: 'natalia_asysta' },
  { email: 'poziomka198@gmail.com', name: 'Barbara Iwańska', date: '2026-06-08', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'ewaepline@gmail.com', name: 'Ewa Peplowska', date: '2026-06-08', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'aniceta.maryniak@gmail.com', date: '2026-06-09', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'goldmm@wp.pl', name: 'Mariola Matuszek', date: '2026-06-09', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'martarzy1@gmail.com', name: 'Rzymka Marta', date: '2026-06-10', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'zofija.roma@gmail.com', name: 'Romanowska', date: '2026-06-10', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'piotrszymanski15@icloud.com', date: '2026-06-15', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'sandra.modrzejewska@gmail.com', date: '2026-06-15', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'max.med@vp.pl', name: 'Bogusława Tomczyk', date: '2026-06-16', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'malgogrz@yahoo.com', name: 'Gosia Grzywna', date: '2026-06-16', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'k_jarek6@wp.pl', name: 'Jarek Królikowski', date: '2026-06-17', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'katrineme29@wp.pl', name: 'Negowska Kasia', date: '2026-06-17', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'slawomir.michalski@icloud.com', date: '2026-06-22', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'natalia.warych@wp.pl', date: '2026-06-22', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'gawrela@wp.pl', name: 'Ela Gawryluk', date: '2026-06-23', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'amayermst@gmail.com', name: 'Ania Mayer', date: '2026-06-23', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'salon@renataskarbek.pl', name: 'Renata Skarbek', date: '2026-06-24', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'iwona.gankowska@gmail.com', date: '2026-06-24', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'joasia.120475@gmail.com', name: 'Kozłowska Joanna', date: '2026-06-29', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'ulatoma@gmail.com', name: 'Ula Toma', date: '2026-06-29', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'malvamorea@gmail.com', name: 'Gosia Prokop', date: '2026-06-30', startTime: '09:00', type: 'natalia_asysta' },
  { email: 'fewa28@gmail.com', name: 'Frąxkowiak Ewa', date: '2026-06-30', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'patrycja.pta@gmail.com', name: 'Ptaszynska', date: '2026-07-01', startTime: '09:00', type: 'natalia_asysta', paymentNotes: 'potwierdzić termin z jej córką' },
  { email: 'martha.paliwoda@gmail.com', date: '2026-07-01', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'front3r@gmail.com', name: 'Maciej Zając', date: '2025-11-10', startTime: '12:00', type: 'natalia_asysta' },
  { email: 'ibentlej@interia.eu', date: '2026-05-17', startTime: '11:00', type: 'natalia_para' },
];

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Determine booking & payment status based on session date vs cutoff */
function getStatuses(date: string): { bookingStatus: string; paymentStatus: string } {
  if (date < PAID_CUTOFF) {
    return { bookingStatus: 'confirmed', paymentStatus: 'confirmed_paid' };
  }
  return { bookingStatus: 'pending_confirmation', paymentStatus: 'pending_verification' };
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log('🔄 Import sesji — migracja 2 (sesje.xlsx)\n');
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
    const config = SESSION_CONFIG[s.type];
    if (!config) {
      console.log(`  ❌ ${email} — unknown session type: ${s.type}`);
      skipped.push(`${email} (unknown type: ${s.type})`);
      continue;
    }

    const importKey = `${email}|${s.date}|${s.startTime}|m2`;
    const endTime = addMinutes(s.startTime, config.duration);
    const { bookingStatus, paymentStatus } = getStatuses(s.date);

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
          session_type: s.type,
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
      const amountPaid = paymentStatus === 'confirmed_paid' ? config.price : 0;
      const orderStatus = paymentStatus === 'confirmed_paid' ? 'paid' : 'pending';
      const { data: newOrder, error: orderErr } = await supabase
        .from('orders')
        .insert({
          user_id: userId,
          status: orderStatus,
          total_amount: config.price * 100,    // in grosz
          amount_paid: amountPaid * 100,       // in grosz
          currency: 'pln',
          source: 'import',
          payment_method: 'transfer',
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
          session_type: s.type,
          order_id: orderId,
          status: bookingStatus,
          confirmed_at: bookingStatus === 'confirmed' ? new Date().toISOString() : null,
        });

      if (bookingErr) {
        console.log(`  ❌ ${email} ${s.date} — booking failed: ${bookingErr.message}`);
        skipped.push(`${email} ${s.date} (booking: ${bookingErr.message})`);
        continue;
      }
      bookingsCreated++;
    }

    console.log(`  ✅ ${email} → ${s.date} ${s.startTime} [${s.type}] (${bookingStatus})`);
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
    .not('status', 'is', null);
  const { count: totalOrders } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'import');

  console.log(`\nDB verification:`);
  console.log(`  Imported slots (all):  ${totalSlots}`);
  console.log(`  All bookings:          ${totalBookings}`);
  console.log(`  Import orders:         ${totalOrders}`);
}

main().catch(console.error);
