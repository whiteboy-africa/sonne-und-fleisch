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
// **Zwei Groessen, ein Lauf.** Aus denselben Rastern fallen zwei Saetze:
// `pages/` mit langer Kante 2048 fuer den Schreibtisch, `pages-klein/` mit
// 1400 fuer Telefone. Beide entstehen immer zusammen — wer nur einen baut,
// laesst die Haelfte der Geraete auf Dateien zeigen, die es nicht gibt.
//
// Der Grund ist der Grafikspeicher, nicht die Leitung. Das Heft haelt
// vierzehn Seitenbilder gleichzeitig; bei 1374 x 2048 sind das rund
// 210 MB, und das killt Telefone. Bei 1400 langer Kante ist es die
// Haelfte. Frueher stand hier, eine zweite Groesse sehe nie jemand — das
// galt, solange das Heft vierundzwanzig Seiten hatte und niemand
// heranzoomen konnte.
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
/** Und der kleine Satz daneben, nach derselben Regel benannt. */
const zielKlein = path.join(wurzel, 'public', 'magazin', 'pages-klein');

/**
 * So viele Seiten. Die ganze Ausgabe — das Heft im Regal ist die Ausgabe
 * und nicht ihr Anfang. Mehr als das Heft hat, rastert der Swift-Teil
 * ohnehin nicht; er meldet die wahre Zahl zurueck.
 */
const seiten = 76;
/** Lange Kante in Bildpunkten, am Schreibtisch. */
const kante = 2048;
/**
 * Und auf dem Telefon. Nicht kleiner: bei drei Bildpunkten je CSS-Pixel
 * will eine ruhende Seite rund 1570 davon, und darunter sieht man dem
 * Satzspiegel das Rechnen an.
 */
const kanteKlein = 1400;
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
  for (const ordner of [ziel, zielKlein]) {
    rmSync(ordner, { recursive: true, force: true });
    mkdirSync(ordner, { recursive: true });
  }

  const saetze = [
    { ordner: ziel, kante: null, gesamt: 0, masse: '' },
    { ordner: zielKlein, kante: kanteKlein, gesamt: 0, masse: '' },
  ];

  for (const name of pngs) {
    // Einmal von der Platte, zweimal verkleinert: das Rastern ist der
    // teure Teil, und die kleine Groesse faellt aus demselben Bild.
    const bild = await readFile(path.join(roh, name));
    for (const satz of saetze) {
      const aus = path.join(satz.ordner, name.replace(/\.png$/, '.webp'));
      const stufe = sharp(bild);
      if (satz.kante) stufe.resize({ height: satz.kante, fit: 'inside' });
      const ergebnis = await stufe.webp({ quality: guete, effort: 6 }).toFile(aus);
      satz.gesamt += ergebnis.size;
      satz.masse = `${ergebnis.width}x${ergebnis.height}`;
    }
  }

  for (const satz of saetze) {
    const mb = (satz.gesamt / 1048576).toFixed(1);
    console.log(
      `${pngs.length} Seiten von ${imHeft} nach ` +
        `${path.relative(wurzel, satz.ordner)}/ — ` +
        `${satz.masse}, WebP q${guete}, zusammen ${mb} MB`,
    );
    if (satz.gesamt > warnAb) {
      console.warn(
        `\nWarnung: ${mb} MB in ${path.basename(satz.ordner)} ist mehr als\n` +
          'die 25 MB, die hier die Grenze sind. Das Heft laedt seine Seiten\n' +
          'zwar im Fenster nach und gibt sie wieder frei, aber wer\n' +
          'cover-to-cover blaettert, holt am Ende alles. Weniger Seiten,\n' +
          'kuerzere Kante oder geringere Guete.',
      );
    }
  }
} finally {
  rmSync(roh, { recursive: true, force: true });
}
