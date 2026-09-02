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
 */
const iconAusschnitt = { left: 135, top: 48, width: 260, height: 260 };

/** Was Dienste beim Teilen erwarten: 1200x630, also 1,905:1. */
const teileBreite = 1200;
const teileHoehe = 630;

await mkdir(ziel, { recursive: true });

const bild = sharp(quelle);
const { width, height } = await bild.metadata();
console.log(`Quelle ${width}x${height}`);

for (const kante of [32, 180, 192, 512]) {
  await sharp(quelle)
    .extract(iconAusschnitt)
    .resize(kante, kante, { kernel: 'lanczos3' })
    .png()
    .toFile(`${ziel}/icon-${kante}.png`);
  console.log(`  icon-${kante}.png`);
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
