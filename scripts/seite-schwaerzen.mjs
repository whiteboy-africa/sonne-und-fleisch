// Schwaerzt eine echte Buchseite — registerhaltig.
//
// Die Balken werden nicht erfunden, sondern auf den Satz gelegt, der da
// steht: das Bild wird zeilenweise nach Druckfarbe abgesucht, und ueber
// jede gefundene Zeile kommt **ein durchgehender Balken** — von der ersten
// bis zur letzten Type der Zeile, ohne Luecken zwischen den Woertern. Er
// sitzt damit genau auf der Grundlinie des Buches, in seiner Zeilenhoehe
// und in seinem Satzspiegel.
//
// Die Kolumne (laufender Titel und Seitenzahl) bleibt stehen: die
// Buchhaltung ueberlebt, entzogen wird nur der Inhalt.
//
// Wichtig: die Balken werden **in das Bild gerechnet**, bevor es
// ausgeliefert wird. Was darunter stand, ist danach weg — kein Overlay,
// unter dem sich der Text wieder hervorholen liesse.
//
// **`--klar` schwaerzt nicht.** Dieselbe Seite, derselbe Papierton,
// dieselbe Breite und Guete — nur ohne Balken. Das ist die Fensterseite:
// die eine offene Stelle, um die herum alles geschwaerzt ist. Sie muss
// durch dieselbe Muehle laufen wie ihre Nachbarn, sonst liegt sie im
// Blaettern in einem anderen Papierton und einer anderen Schaerfe
// daneben — und dann sieht man, dass sie aus einer anderen Quelle kommt.
//
// **`--stanze <von> <bis>`** laesst ein Band der Seite frei — Anteile
// der Seitenhoehe, etwa `--stanze 0.42 0.68`. Dort kommt kein Balken hin,
// und der Satz darunter wird mit Papier zugedeckt: es entsteht eine
// saubere Luecke im geschwaerzten Block. Das ist die Stanze der
// Schlussseite, in der der Stempel sitzt.
//
// Die Luecke muss **im Bild** entstehen und nicht als weisses Rechteck
// darueber: sonst stuende unter dem Stempel noch der Satz des Buches,
// nur verdeckt — und was geschwaerzt ist, soll weg sein, nicht zugedeckt.
//
//   node scripts/seite-schwaerzen.mjs <roh.png> <ziel.webp> [--kopf 0.11] [--klar]
//                                     [--stanze 0.42 0.68]

import sharp from 'sharp';

const [, , quelle, ziel, ...rest] = process.argv;
if (!quelle || !ziel) {
  console.error('Aufruf: node scripts/seite-schwaerzen.mjs <roh.png> <ziel.webp>');
  process.exit(1);
}

/** Ohne Balken ausspielen — die Fensterseite. */
const klar = rest.includes('--klar');
/** Das freigelassene Band: [von, bis] als Anteil der Seitenhoehe. */
const stanze = rest.includes('--stanze')
  ? [Number(rest[rest.indexOf('--stanze') + 1]), Number(rest[rest.indexOf('--stanze') + 2])]
  : null;
/** Anteil der Seitenhoehe, der oben ungeschwaerzt bleibt (Kolumne). */
const kopfAnteil = Number(rest[rest.indexOf('--kopf') + 1]) || 0.11;
/** Ab wieviel Druckfarbe eine Bildzeile als Textzeile gilt. */
const tinteSchwelle = 0.012;
/*
 * **Der Bogen wird schwarz auf weiss ausgespielt, nicht auf Papierton.**
 *
 * Hier stand `#ece8dd` und wurde in die Datei hineinmultipliziert. Im
 * Dokument liegt dieselbe Seite aber noch einmal mit
 * `mix-blend-mode: multiply` auf der cremefarbenen Buehne — der Ton kam
 * also **zweimal** drauf. Papier hoch zwei: aus (236, 232, 221) wurde
 * rund (218, 211, 192), spuerbar dunkler und braeunlicher als die Seiten
 * ringsum. Genau das sah man der Leseprobe an.
 *
 * Den Ton gibt jetzt die Buehne, und zwar einmal. Die Datei bleibt neutral.
 */
/** Breite der ausgelieferten Seite. */
const zielBreite = 1150;

const wuerfel = (saat) => {
  let zahl = (Math.abs(saat) * 9301 + 49297) % 233280;
  return () => {
    zahl = (zahl * 9301 + 49297) % 233280;
    return zahl / 233280;
  };
};

const bild = sharp(quelle);
const { width, height } = await bild.metadata();

// Graustufen, roh: fuer jede Bildzeile zaehlen, wie viel Farbe drauf ist.
const { data, info } = await sharp(quelle)
  .greyscale()
  .raw()
  .toBuffer({ resolveWithObject: true });

const zeilen = [];
const kopfBis = Math.round(info.height * kopfAnteil);
let laufend = null;
for (let y = kopfBis; y < info.height; y += 1) {
  let tinte = 0;
  let links = info.width;
  let rechts = 0;
  for (let x = 0; x < info.width; x += 1) {
    if (data[y * info.width + x] < 128) {
      tinte += 1;
      if (x < links) links = x;
      if (x > rechts) rechts = x;
    }
  }
  const anteil = tinte / info.width;
  if (anteil >= tinteSchwelle) {
    if (!laufend) laufend = { von: y, bis: y, links, rechts };
    else {
      laufend.bis = y;
      laufend.links = Math.min(laufend.links, links);
      laufend.rechts = Math.max(laufend.rechts, rechts);
    }
  } else if (laufend) {
    // Zu duenn, um eine Zeile zu sein — Trennstriche, Staub.
    if (laufend.bis - laufend.von >= info.height * 0.004) zeilen.push(laufend);
    laufend = null;
  }
}
if (laufend) zeilen.push(laufend);

const inStanze = (y, h) =>
  stanze !== null &&
  y + h > info.height * stanze[0] &&
  y < info.height * stanze[1];

const balken = [];
for (const zeile of zeilen) {
  const hoehe = zeile.bis - zeile.von + 1;
  // Etwas Luft nach oben und unten: ein Balken deckt die Zeile, nicht die
  // Zeile plus die halbe naechste.
  const y = Math.max(0, zeile.von - Math.round(hoehe * 0.16));
  const h = Math.round(hoehe * 1.22);
  const breite = zeile.rechts - zeile.links + 1;
  // In der Stanze steht kein Balken — dort ist Papier.
  if (inStanze(y, h)) continue;
  balken.push({
    left: zeile.links,
    top: y,
    width: Math.min(breite, info.width - zeile.links),
    height: h,
  });
}

// Vor den Balken wird der ganze Satzspiegel mit Papier ueberdeckt.
//
// Ohne das blieben in den Wortluecken zwischen den Balken einzelne
// Buchstaben des echten Satzes stehen — Oberlaengen, Kommata, ein „d" hier,
// ein „g" dort. Zum Zusammensetzen reicht das nicht, aber es widerspricht
// der ganzen Sache: was geschwaerzt ist, ist weg, nicht halb da. Die
// Luecken sollen Papier zeigen, nicht Restsatz.
const spiegel =
  zeilen.length > 0
    ? {
        links: Math.min(...zeilen.map((z) => z.links)),
        rechts: Math.max(...zeilen.map((z) => z.rechts)),
        oben: Math.min(...zeilen.map((z) => z.von)),
        unten: Math.max(...zeilen.map((z) => z.bis)),
      }
    : null;

const auflagen = [];
if (spiegel) {
  const rand = Math.round(info.width * 0.01);
  const links = Math.max(0, spiegel.links - rand);
  const oben = Math.max(0, spiegel.oben - rand);
  auflagen.push({
    input: {
      create: {
        width: Math.min(info.width - links, spiegel.rechts - links + rand * 2),
        height: Math.min(info.height - oben, spiegel.unten - oben + rand * 2),
        channels: 3,
        background: '#ffffff',
      },
    },
    left: links,
    top: oben,
  });
}

auflagen.push(...balken.map((b) => ({
  input: {
    create: {
      width: b.width,
      height: b.height,
      channels: 3,
      background: '#0a0a0a',
    },
  },
  left: b.left,
  top: b.top,
})));

const gefuellt = await sharp(quelle)
  .composite(klar ? [] : auflagen)
  .png()
  .toBuffer();

const skaliert = await sharp(gefuellt)
  .resize({ width: zielBreite })
  .toBuffer({ resolveWithObject: true });

const ergebnis = await sharp(skaliert.data).webp({ quality: 86 }).toFile(ziel);

console.log(
  `${ziel}: ${ergebnis.width}x${ergebnis.height}, ${Math.round(ergebnis.size / 1024)} KB — ` +
    (klar
      ? `klar, ${zeilen.length} Zeilen erkannt (nicht geschwaerzt)`
      : `${zeilen.length} Zeilen erkannt, ${balken.length} Balken`),
);
