// Macht aus `content/magazin.pdf` die Seiten, die im Regal geblaettert
// werden: `public/magazin/pages/0001.webp` und so weiter.
//
//   npm run magazin:build
//
// Zwei Schritte, absichtlich getrennt: Swift/PDFKit rastert die Seiten als
// PNG (`magazin-rendern.swift`), sharp macht daraus WebP. Poppler,
// ImageMagick und Ghostscript liegen auf diesem Rechner nicht, PDFKit liegt
// im System.
//
// **Deterministisch.** Gleiche Datei, gleiche Ausgabe: feste Seitenzahl,
// feste Kantenlaenge, feste Guete, feste Reihenfolge, feste Namen. Vor dem
// Schreiben wird der Zielordner geleert — sonst blieben Seiten aus einem
// aelteren, laengeren Heft liegen und stuenden hinten im Blaettern herum.
//
// Keine Vorschaubilder. Das Heft laedt seine Seiten im Fenster um die
// aufgeschlagene Doppelseite herum und gibt den Rest wieder frei; eine
// zweite Groesse waere ein zweiter Satz Dateien, den nie jemand sieht.
//
// **Kein PDF.** Hier fiel einmal eine Datei zum Herunterladen ab. Das Heft
// ist zum Blaettern da; wer eine Datei mitnimmt, hat es nicht gelesen,
// sondern kopiert. Der Weg dorthin steht noch in
// `scripts/pdf-aus-bildern.mjs`, falls er je wieder gebraucht wird.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const wurzel = path.resolve(fileURLToPath(import.meta.url), '..', '..');

/** Die Druckdatei. Sie liegt nicht im Git — sie ist 125 MB gross. */
const quelle = path.join(wurzel, 'content', 'magazin.pdf');
/** Wohin die Seiten kommen. Wird vorher geleert. */
const ziel = path.join(wurzel, 'public', 'magazin', 'pages');

/**
 * So viele Seiten. Das Heft im Regal ist eine Leseprobe, kein Archiv —
 * die Ausgabe hat 76 Seiten, gezeigt werden die ersten 24.
 */
const seiten = 24;
/** Lange Kante in Bildpunkten. */
const kante = 2048;
/** Guete des WebP. */
const guete = 80;
/** Ab hier wird gewarnt: so viel laedt niemand mehr auf dem Telefon. */
const warnAb = 25 * 1024 * 1024;

if (!existsSync(quelle)) {
  console.error(
    `Keine Druckdatei unter ${path.relative(wurzel, quelle)}.\n` +
      'Sie liegt nicht im Git (125 MB). Wer die Seiten neu bauen will, legt\n' +
      'sie dorthin — die fertigen WebP im Regal bleiben davon unberuehrt.',
  );
  process.exit(1);
}

const roh = mkdtempSync(path.join(tmpdir(), 'magazin-'));

try {
  const gerastert = spawnSync(
    'swift',
    [
      path.join(wurzel, 'scripts', 'magazin-rendern.swift'),
      quelle,
      roh,
      String(seiten),
      String(kante),
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );

  if (gerastert.status !== 0) {
    console.error('Das Rastern ist fehlgeschlagen.');
    process.exit(gerastert.status ?? 1);
  }

  const schluss = gerastert.stdout
    .trim()
    .split('\n')
    .at(-1)
    ?.split('\t');
  const imHeft = Number(schluss?.[2] ?? 0);

  const pngs = readdirSync(roh)
    .filter((name) => name.endsWith('.png'))
    .sort();

  if (pngs.length === 0) {
    console.error('Das Rastern hat keine Seite geliefert.');
    process.exit(1);
  }

  // Leeren statt ueberschreiben: ein kuerzeres Heft laesst sonst die Seiten
  // des laengeren stehen.
  rmSync(ziel, { recursive: true, force: true });
  mkdirSync(ziel, { recursive: true });

  let gesamt = 0;
  let masse = '';
  for (const name of pngs) {
    const aus = path.join(ziel, name.replace(/\.png$/, '.webp'));
    const ergebnis = await sharp(await readFile(path.join(roh, name)))
      .webp({ quality: guete, effort: 6 })
      .toFile(aus);
    gesamt += ergebnis.size;
    masse = `${ergebnis.width}x${ergebnis.height}`;
  }

  const mb = (gesamt / 1048576).toFixed(1);
  console.log(
    `${pngs.length} Seiten von ${imHeft} nach ${path.relative(wurzel, ziel)}/ — ` +
      `${masse}, WebP q${guete}, zusammen ${mb} MB`,
  );

  if (gesamt > warnAb) {
    console.warn(
      `\nWarnung: ${mb} MB ist mehr als die 25 MB, die hier die Grenze sind.\n` +
        'Das Heft laedt seine Seiten zwar im Fenster nach, aber wer\n' +
        'cover-to-cover blaettert, holt am Ende alles. Weniger Seiten,\n' +
        'kuerzere Kante oder geringere Guete.',
    );
  }
} finally {
  rmSync(roh, { recursive: true, force: true });
}
