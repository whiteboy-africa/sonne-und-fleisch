// Baut aus dem einen Markenbild die Ableitungen: das Tab-Icon und das
// Bild, das beim Teilen eines Links erscheint.
//
// **Es ist ein Foto, kein Zeichen.** Daraus folgt beides:
//
// - Fuer das **Icon** wird eng zugeschnitten. Der ganze Mund bei 32 Punkten
//   ist ein rosa Fleck; was man dort noch erkennt, ist die rote Schrift auf
//   dunklem Gaumen. Also wird der Gaumen genommen und der Rest weggelassen.
// - Fuer das **Teilebild** wird auf 1,91:1 beschnitten und nicht auf
//   Schwarz gelegt. Balken oben und unten wuerden von den Diensten noch
//   einmal beschnitten, und uebrig bliebe ein Streifen.
//
// Die Quelle ist klein (509x374). Beide Ableitungen rechnen also hoch;
// das ist bei einer Vorschau in Kauf zu nehmen, ein schaerferes Original
// waere aber besser. Kommt eines, ersetzt es `content/marke/gaumen.png`
// und dieses Skript laeuft noch einmal.
//
//   node scripts/marke-bauen.mjs

import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

// Die Quelle liegt neben der Druckdatei des Hefts, nicht unter `public/`:
// sie wird nicht ausgeliefert, sondern nur gelesen. Unter `public/` waere
// sie 298 KB, die jeder Bau mitschleppt und niemand abruft.
const quelle = 'content/marke/gaumen.png';
const ziel = 'public/marke';

/*
 * Der Ausschnitt fuer das Icon, in Punkten der Quelle. Die Schrift steht
 * zwischen x 155 und 375 und zwischen y 115 und 240; das Quadrat liegt um
 * ihre Mitte und nimmt so viel Gaumen mit, dass die Zaehne den Rand noch
 * andeuten.
 *
 * **300 und nicht 260, weil das Icon rund ist.** Ein Kreis nimmt an der
 * Oberkante der Schrift nur noch `sqrt(r² - dy²)` an halber Breite her;
 * bei 260 blieben dort 244 Punkte fuer 240 Punkte Schrift, und das S und
 * das H stiessen an den Rand. Bei 300 sind es 286.
 */
const iconAusschnitt = { left: 115, top: 28, width: 300, height: 300 };

/** Was Dienste beim Teilen erwarten: 1200x630, also 1,905:1. */
const teileBreite = 1200;
const teileHoehe = 630;

await mkdir(ziel, { recursive: true });

const bild = sharp(quelle);
const { width, height } = await bild.metadata();
console.log(`Quelle ${width}x${height}`);

/**
 * Der runde Ausstich. Als Maske ueber das Bild gelegt (`dest-in`), nicht
 * als Rahmen darauf: ein gezeichneter Kreis haette eine Kante, die bei
 * 32 Punkten dicker waere als das, was sie einfasst.
 */
const kreis = (kante) =>
  Buffer.from(
    `<svg width="${kante}" height="${kante}"><circle cx="${kante / 2}" cy="${
      kante / 2
    }" r="${kante / 2}" fill="#fff"/></svg>`,
  );

for (const kante of [32, 180, 192, 512]) {
  /*
   * **Zwei Durchgaenge, nicht einer.** sharp hat eine feste Reihenfolge,
   * und `flatten` laeuft darin **vor** `composite`. In einer Kette
   * angehaengt haette es also das ungemaskte Bild aufgefuellt (wo es
   * nichts zu fuellen gab) und die Maske danach doch wieder Loecher
   * gestanzt — nachgemessen: Alpha 0 in der Ecke, obwohl Schwarz
   * dastehen sollte. Also erst maskieren, dann das Ergebnis auffuellen.
   */
  const rund = await sharp(quelle)
    .extract(iconAusschnitt)
    .resize(kante, kante, { kernel: 'lanczos3' })
    .composite([{ input: kreis(kante), blend: 'dest-in' }])
    .png()
    .toBuffer();

  /*
   * **Apple bekommt schwarze Ecken statt durchsichtiger.** iOS legt sein
   * eigenes abgerundetes Quadrat darueber und rechnet Transparenz nicht
   * heraus, sondern fuellt sie — je nach Ort mit Weiss. Ein weisser
   * Zwickel um den Kreis waere das Gegenteil dieser Seite. Schwarz ist
   * ihr Grund, also steht dort Schwarz.
   */
  const bild =
    kante === 180
      ? sharp(rund).flatten({ background: '#000000' })
      : sharp(rund);

  await bild.png().toFile(`${ziel}/icon-${kante}.png`);
  console.log(`  icon-${kante}.png${kante === 180 ? ' (Ecken schwarz)' : ''}`);
}

/*
 * `cover` schneidet mittig auf das Verhaeltnis und fuellt die Flaeche.
 * Oben und unten fallen dabei rund fuenfzig Punkte weg — Oberlippe und
 * Zunge. Der Zahnkranz und die Schrift bleiben, und die bleiben auch
 * gross genug, wenn ein Dienst die Vorschau noch einmal quadratisch
 * beschneidet.
 */
await sharp(quelle)
  .resize(teileBreite, teileHoehe, {
    fit: 'cover',
    position: 'centre',
    kernel: 'lanczos3',
  })
  .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
  .toFile(`${ziel}/teilen.jpg`);
console.log(`  teilen.jpg ${teileBreite}x${teileHoehe}`);
