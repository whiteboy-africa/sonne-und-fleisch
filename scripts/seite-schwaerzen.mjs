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
//   node scripts/seite-schwaerzen.mjs <roh.png> <ziel.webp> [--kopf 0.11]

import sharp from 'sharp';

const [, , quelle, ziel, ...rest] = process.argv;
if (!quelle || !ziel) {
  console.error('Aufruf: node scripts/seite-schwaerzen.mjs <roh.png> <ziel.webp>');
  process.exit(1);
}

/** Anteil der Seitenhoehe, der oben ungeschwaerzt bleibt (Kolumne). */
const kopfAnteil = Number(rest[rest.indexOf('--kopf') + 1]) || 0.11;
/** Ab wieviel Druckfarbe eine Bildzeile als Textzeile gilt. */
const tinteSchwelle = 0.012;
/** Papierton, auf den der Bogen multipliziert wird. */
const papier = '#ece8dd';
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

const balken = [];
for (const zeile of zeilen) {
  const hoehe = zeile.bis - zeile.von + 1;
  // Etwas Luft nach oben und unten: ein Balken deckt die Zeile, nicht die
  // Zeile plus die halbe naechste.
  const y = Math.max(0, zeile.von - Math.round(hoehe * 0.16));
  const h = Math.round(hoehe * 1.22);
  const breite = zeile.rechts - zeile.links + 1;
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
  .composite(auflagen)
  .png()
  .toBuffer();

const skaliert = await sharp(gefuellt)
  .resize({ width: zielBreite })
  .toBuffer({ resolveWithObject: true });

const ergebnis = await sharp(skaliert.data)
  .composite([
    {
      input: {
        create: {
          width: skaliert.info.width,
          height: skaliert.info.height,
          channels: 3,
          background: papier,
        },
      },
      blend: 'multiply',
    },
  ])
  .webp({ quality: 86 })
  .toFile(ziel);

console.log(
  `${ziel}: ${ergebnis.width}x${ergebnis.height}, ${Math.round(ergebnis.size / 1024)} KB — ` +
    `${zeilen.length} Zeilen erkannt, ${balken.length} Balken`,
);
