// Prueft die gebaute Seite darauf, dass kein Platzhalter in den Kopfdaten
// steht.
//
// Warum ueberhaupt: `og:description` und `<meta name="description">` sind
// das, was in der Vorschau eines Messengers steht und was eine
// Suchmaschine zitiert. „Platzhalter fuer die lange Beschreibung" waere
// dort kein Schoenheitsfehler, sondern eine falsche Auskunft ueber den
// Verlag — und zwar an der einen Stelle, die man nicht sieht, wenn man
// die Seite ansieht.
//
// Die Bandseite faengt den Fall schon ab (`Bandseite.astro` setzt einen
// Satz ein, der immer stimmt). Diese Pruefung sorgt dafuer, dass es nicht
// an dieser einen Zeile haengt: sie liest das fertige HTML.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const WURZEL = 'dist';
const VERDAECHTIG = /platzhalter|lorem ipsum|tbd|todo/i;
const KOPFDATEN =
  /<meta\s+(?:name="description"|property="og:(?:title|description)")\s+content="([^"]*)"/gi;

async function* htmlDateien(ordner) {
  for (const eintrag of await readdir(ordner, { withFileTypes: true })) {
    const pfad = join(ordner, eintrag.name);
    if (eintrag.isDirectory()) yield* htmlDateien(pfad);
    else if (eintrag.name.endsWith('.html')) yield pfad;
  }
}

const funde = [];
for await (const datei of htmlDateien(WURZEL)) {
  const html = await readFile(datei, 'utf8');
  for (const treffer of html.matchAll(KOPFDATEN)) {
    if (VERDAECHTIG.test(treffer[1])) funde.push([datei, treffer[1].slice(0, 90)]);
  }
}

if (funde.length === 0) {
  console.log('Kopfdaten sauber: kein Platzhalter in description oder og:*.');
  process.exit(0);
}

console.error(`Platzhalter in den Kopfdaten von ${funde.length} Stelle(n):`);
for (const [datei, text] of funde) console.error(`  ${datei}\n    ${text}`);
process.exit(1);
