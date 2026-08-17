// Prueft die Bewegungspfade gegen die Kollisionspruefung — ohne Browser.
//
// Warum das noetig ist: wird eine Pose abgelehnt, haelt die Bewegung an, bis
// die Notbremse nach `motionStallLimit` greift. Passiert das in mehreren
// Phasen, wird aus einer Bewegung von 0,7 Sekunden ein Ruckeln von mehreren
// Sekunden. Dieses Skript zeigt, welche Phase an welchem Punkt haengt.
//
// Aufruf:  node --experimental-strip-types scripts/kollision-pruefen.mjs

import {
  bookVolumesOverlap,
  browseMotionPose,
  createMotionLayout,
  focusedBookPose,
  presentedBookPose,
  stackJitter,
  stackedBookPose,
} from '../src/shelf/book-motion.ts';

// Dieselben Werte wie in ShelfEngine.ts.
const paperbackRatio = 148 / 210;
const booksPerPile = 6;
const pileSpacing = 2.3;
const desktopFocusX = -0.58;
const desktopFocusZ = 2.95;
const desktopFocusScale = 1.08;

// Das aktuelle Programm, so wie es im Regal steht.
const buecher = [
  { id: 'weine-nicht-artur', height: 2.0, thickness: 0.12 },
  { id: 'yellow-fever', height: 2.0, thickness: 0.14 },
  { id: 'robert-duval', height: 2.0, thickness: 0.19 },
  { id: 'sonne-und-fleisch', height: 2.0, thickness: 0.05 },
  { id: 'lenz', height: 1.92, thickness: 0.068 },
  { id: 'maldoror', height: 2.05, thickness: 0.181 },
  { id: 'meine-wunder', height: 1.98, thickness: 0.078 },
  { id: 'blumen-des-boesen', height: 2.05, thickness: 0.235 },
  { id: 'hymnen-an-die-nacht', height: 1.9, thickness: 0.055 },
];

function pilePerIndex(count) {
  const piles = Math.max(1, Math.ceil(count / booksPerPile));
  const base = Math.floor(count / piles);
  const rest = count % piles;
  const zuordnung = [];
  let pile = 0;
  let platz = base + (rest > 0 ? 1 : 0);
  for (let index = 0; index < count; index += 1) {
    if (platz === 0) {
      pile += 1;
      platz = base + (pile < rest ? 1 : 0);
    }
    zuordnung.push(pile);
    platz -= 1;
  }
  return zuordnung;
}

const pileOfIndex = pilePerIndex(buecher.length);
const layout = createMotionLayout(buecher);

const baende = buecher.map((b, index) => ({
  ...b,
  index,
  pile: pileOfIndex[index],
  x: pileOfIndex[index] * pileSpacing,
  width: b.height * paperbackRatio * (1 + ((index % 5) - 2) * 0.004),
  place: {
    stackY: 0,
    ...stackJitter(index),
    height: b.height,
    thickness: b.thickness,
  },
}));

/**
 * Die Stapel als veraenderliche Reihenfolge — genau wie in der Engine:
 * herausgezogen wird aus der Mitte, zurueckgelegt wird obenauf.
 */
const stapel = [];
baende.forEach((b) => (stapel[b.pile] ??= []).push(b.index));

function hoehenFortschreiben() {
  stapel.forEach((reihe) => {
    let cursor = layout.floorTop;
    reihe.forEach((index) => {
      const b = baende[index];
      b.place.stackY = cursor + b.thickness * 0.5;
      cursor += b.thickness;
    });
  });
}

function ausStapelNehmen(index) {
  const reihe = stapel[baende[index].pile];
  const at = reihe.indexOf(index);
  if (at >= 0) reihe.splice(at, 1);
  hoehenFortschreiben();
}

function zurueckInStapel(index) {
  const reihe = stapel[baende[index].pile];
  if (reihe.includes(index)) return;
  reihe.push(index);
  hoehenFortschreiben();
}

function volumen(band, pose) {
  return {
    id: band.id,
    x: band.x + pose.x,
    y: pose.y,
    z: pose.z,
    yaw: pose.yaw,
    pitch: pose.pitch,
    scale: pose.scale,
    width: band.width,
    height: band.height,
    thickness: band.thickness,
  };
}

/** Alle ruhenden Baende ausser dem bewegten. */
function ruhende(bewegt, praesentiert) {
  return baende
    .filter((b) => b.index !== bewegt)
    .map((b) =>
      volumen(
        b,
        b.index === praesentiert
          ? presentedBookPose(b.place, layout)
          : stackedBookPose(b.place, layout),
      ),
    );
}

const phasen = [
  'retreat-current',
  'turn-current',
  'shelve-current',
  'extract-next',
  'turn-next',
  'settle-next',
];

let treffer = 0;
console.log(`Stapel: ${pileOfIndex.join('')}   pulledZ = ${layout.pulledZ.toFixed(3)}\n`);

function pruefe(bewegt, phase, pose, praesentiert) {
  const mich = volumen(baende[bewegt], pose);
  for (const b of baende) {
    if (b.index === bewegt) continue;
    const anderer = volumen(
      b,
      b.index === praesentiert
        ? presentedBookPose(b.place, layout)
        : stackedBookPose(b.place, layout),
    );
    if (bookVolumesOverlap(mich, anderer, layout.collisionMargin)) return b.id;
  }
  return null;
}

// Ausgangslage: der erste Band steht vorn, liegt also nicht im Stapel.
hoehenFortschreiben();
ausStapelNehmen(0);
let praesentiert = 0;

for (let von = 0; von < baende.length - 1; von += 1) {
  const nach = von + 1;

  // 1. Der aufgestellte Band kommt zurueck — obenauf.
  zurueckInStapel(von);
  praesentiert = von;
  for (const phase of ['retreat-current', 'turn-current', 'shelve-current']) {
    for (let s = 0; s <= 20; s += 1) {
      const pose = browseMotionPose(phase, s / 20, baende[von].place, layout);
      const stoss = pruefe(von, phase, pose, null);
      if (stoss) {
        console.log(`STOSS  ${von}->${nach}  ${phase} bei ${((s / 20) * 100).toFixed(0)}%  ${baende[von].id} x ${stoss}`);
        treffer += 1;
        break;
      }
    }
  }

  // 2. Der naechste Band rutscht heraus — der Stapel steht dabei noch.
  for (let s = 0; s <= 20; s += 1) {
    const pose = browseMotionPose('extract-next', s / 20, baende[nach].place, layout);
    const stoss = pruefe(nach, 'extract-next', pose, null);
    if (stoss) {
      console.log(`STOSS  ${von}->${nach}  extract-next bei ${((s / 20) * 100).toFixed(0)}%  ${baende[nach].id} x ${stoss}`);
      treffer += 1;
      break;
    }
  }

  // 3. Jetzt erst rutscht der Stapel nach, dann richtet der Band sich auf.
  ausStapelNehmen(nach);
  for (const phase of ['turn-next', 'settle-next']) {
    for (let s = 0; s <= 20; s += 1) {
      const pose = browseMotionPose(phase, s / 20, baende[nach].place, layout);
      const stoss = pruefe(nach, phase, pose, null);
      if (stoss) {
        console.log(`STOSS  ${von}->${nach}  ${phase} bei ${((s / 20) * 100).toFixed(0)}%  ${baende[nach].id} x ${stoss}`);
        treffer += 1;
        break;
      }
    }
  }
  praesentiert = nach;
}

// Und das Herausziehen in die Betrachtung, fuer jeden Band einzeln.
for (let i = 0; i < baende.length; i += 1) {
  stapel.forEach((reihe, p) => (stapel[p] = baende.filter((b) => b.pile === p && b.index !== i).map((b) => b.index)));
  hoehenFortschreiben();
  for (let s = 0; s <= 20; s += 1) {
    const pose = focusedBookPose(s / 20, baende[i].place, layout, desktopFocusX, desktopFocusZ, desktopFocusScale);
    const mich = volumen(baende[i], pose);
    let stoss = null;
    for (const b of baende) {
      if (b.index === i) continue;
      if (bookVolumesOverlap(mich, volumen(b, stackedBookPose(b.place, layout)), layout.collisionMargin)) {
        stoss = b.id;
        break;
      }
    }
    if (stoss) {
      console.log(`STOSS  Betrachtung ${i} bei ${((s / 20) * 100).toFixed(0)}%  ${baende[i].id} x ${stoss}`);
      treffer += 1;
      break;
    }
  }
}

console.log(
  treffer === 0
    ? '\nKein Pfad wird abgelehnt — die Bewegung laeuft ohne Notbremse durch.'
    : `\n${treffer} Pfade werden abgelehnt. Jeder kostet bis zu 0,25 s Stillstand.`,
);
