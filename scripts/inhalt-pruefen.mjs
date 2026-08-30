// Prueft die Inhalte auf das, was beim Bauen nicht auffaellt.
//
// `astro build` merkt, wenn das Schema verletzt ist. Es merkt nicht, wenn
// ein Umschlag beim Normalisieren beschnitten wird, wenn eine Leseprobe
// die Seite nicht fuellt, wenn ein Band echte Seiten und gezeichnete
// Balken mischt oder wenn zwei Baende dieselbe `reihenfolge` tragen —
// bei doppelten Zahlen ist die Sortierung zufaellig.
//
//   node scripts/inhalt-pruefen.mjs
//
// Meldet und beendet mit 1, wenn etwas gefunden wurde.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const INHALT = 'src/content/buecher';
const funde = [];
const melde = (art, wo, text) => funde.push({ art, wo, text });

const dateien = (await readdir(INHALT)).filter((n) => n.endsWith('.md'));
const buecher = [];
for (const name of dateien) {
  const roh = await readFile(join(INHALT, name), 'utf8');
  const kopf = roh.split('\n---')[0].slice(4);
  // Kommentare gehoeren nicht zum sichtbaren Text; sie duerfen „offen"
  // und „Platzhalter" sagen, ohne dass es auf die Seite kommt.
  const ohneKommentar = kopf.replace(/^\s*#.*$/gm, '');
  // Blatt, Heft und Rohling sind keine Buecher: sie tragen ihr eigenes
  // Mass und brauchen keine Seitenzahl.
  const sonder = /^\s*(blatt|magazin|blind):/m.test(kopf);
  buecher.push({ name: name.slice(0, -3), kopf, roh, ohneKommentar, sonder });
}

// --- Reihenfolge: jede Zahl nur einmal
const zahlen = new Map();
for (const b of buecher) {
  const m = b.kopf.match(/^reihenfolge:\s*(\d+)/m);
  if (!m) { melde('reihenfolge', b.name, 'fehlt'); continue; }
  const n = m[1];
  if (zahlen.has(n)) melde('reihenfolge', b.name, `Zahl ${n} doppelt (auch ${zahlen.get(n)})`);
  else zahlen.set(n, b.name);
}

// --- Bilder: existieren sie, und welches Verhaeltnis haben sie
const HAUSMASS = 2 / 3, TOLERANZ = 0.015;
for (const b of buecher) {
  for (const m of b.roh.matchAll(/^\s*(?:-\s*)?(cover_bild|ruecken_bild|bild|schluss):\s*(\/\S+)/gm)) {
    const [, feld, pfad] = m;
    const datei = join('public', pfad);
    try { await stat(datei); } catch { melde('Bild fehlt', b.name, `${feld}: ${pfad}`); continue; }
    // `cover-normalisieren.mjs` laesst Sonderlinge in Ruhe.
    if (feld !== 'cover_bild' || b.sonder) continue;
    const { width, height } = await sharp(datei).metadata();
    const v = width / height;
    const ab = Math.abs(v - HAUSMASS) / HAUSMASS;
    if (ab > TOLERANZ)
      melde('Umschlag wird beschnitten', b.name,
        `${pfad} ${width}x${height} = ${v.toFixed(4)}, ${(ab * 100).toFixed(1)} % vom Hausmass`);
  }
  for (const m of b.roh.matchAll(/^\s*-\s*(\/buecher\/\S+)/gm)) {
    try { await stat(join('public', m[1])); } catch { melde('Bild fehlt', b.name, m[1]); }
  }
}

// --- Leseproben: Laenge, gemessen in sichtbaren Zeichen
const sicht = (z) => z
  .replace(/\[\[\|(\d+)\]\]/g, (_, n) => '#'.repeat(+n))
  .replace(/\[\[([^|\]]*)(\|(\d+))?\]\]/g, (_, t, __, n) => (t || '') + '#'.repeat(+(n || 0)));
for (const b of buecher) {
  const bloecke = [...b.roh.matchAll(/^(\s*)text: >-\n((?:\1[ ]+\S.*\n|\n)+)/gm)];
  for (const [i, m] of bloecke.entries()) {
    const abs = m[2].split(/\n\s*\n/).map((x) => sicht(x.replace(/\s+/g, ' ').trim())).filter(Boolean);
    const n = abs.reduce((s, x) => s + x.length, 0);
    const seite = i === 0 ? 'A' : 'B';
    /*
     * **Nur zaehlen, nicht urteilen.** Hier stand eine Schwelle — unter
     * 1.450 Zeichen „zu kurz" —, und sie war falsch: nachgemessen im Bild
     * fuellen Dolly, Dom Bosco und Patmos ihre Seite auf 100 %, obwohl
     * sie nur 1.038 bis 1.273 Zeichen tragen.
     *
     * Wie viele Zeichen eine Seite haelt, haengt an drei Dingen, die je
     * Band verschieden sind: am Format (`breite_verhaeltnis` macht die
     * Spalte schmaler), an der Schrift (`leseprobe_schrift` — Times
     * setzt enger als die Hausserife, das sind neun Zeichen je Zeile
     * Unterschied) und an der Zahl der Absaetze. Eine Zahl fuer alle gibt
     * es darum nicht.
     *
     * Gemessen wird im Bild: Band aufschlagen und
     * `document.querySelector('.blatt__satz')` nach `scrollHeight` gegen
     * `clientHeight` fragen. 100 % ist voll, darueber faellt der Rest
     * unter den Beschnitt.
     */
    melde('Leseprobe, Umfang', `${b.name} ${seite}`, `${n} Zeichen`);
  }
}

// --- Gemischte Medien: eine Seite echt, die andere gezeichnet
for (const b of buecher) {
  const hatBild = /^\s*bild:\s*\//m.test(b.roh);
  const hatText = /^\s*text: >-/m.test(b.roh);
  if (hatBild && hatText && !/bild:[\s\S]*?text: >-/.test(b.roh))
    melde('gemischt', b.name, 'echte Seiten und gezeichnete Balken im selben Band');
  // Je Seite eines Wendebandes gezaehlt, nicht ueber die ganze Datei.
  const haelften = b.roh.split(/^rueckseite:/m);
  for (const [i, h] of haelften.entries()) {
    if (!/^\s*bild:\s*\//m.test(h)) continue;
    const seite = i === 0 ? 'A' : 'B';
    const schwarz = (h.match(/^\s*-\s*\/buecher\/\S+schwarz/gm) || []).length;
    if (schwarz !== 4)
      melde('geschwaerzte Seiten', `${b.name} ${seite}`, `${schwarz} statt 4`);
    if (!/^\s*schluss:\s*\//m.test(h))
      melde('Schlussseite fehlt', `${b.name} ${seite}`, 'bild gesetzt, aber kein schluss');
  }
}

// --- Kopfdaten
for (const b of buecher) {
  for (const feld of ['titel', 'kurztitel', 'autor', 'klappentext', 'zitat', 'zitat_von']) {
    if (!new RegExp(`^${feld}:`, 'm').test(b.kopf)) melde('Feld fehlt', b.name, feld);
  }
  const kl = b.kopf.match(/^klammer: >-\n((?:  .*\n)+)/m);
  if (kl) {
    const t = kl[1].split('\n').map((z) => z.trim()).join(' ').trim();
    if (t.length > 200) melde('Klammer zu lang', b.name, `${t.length} Zeichen (max 200)`);
  }
  if (/Platzhalter|TODO|TBD|Lorem/i.test(b.ohneKommentar))
    melde('Platzhalter im sichtbaren Text', b.name, '');
  if (!/^seiten_zahl:/m.test(b.kopf) && !b.sonder) melde('seiten_zahl fehlt', b.name, '');
}

const nach = {};
for (const f of funde) (nach[f.art] ??= []).push(f);
for (const [art, liste] of Object.entries(nach)) {
  console.log(`\n${art} (${liste.length})`);
  for (const f of liste) console.log(`  ${f.wo}${f.text ? ' — ' + f.text : ''}`);
}
if (!funde.length) console.log('nichts gefunden');
