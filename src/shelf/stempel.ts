// Der Abdruck auf der Schlussseite der Leseprobe.
//
// Dort stand einmal eine Bedienzeile — „Weiter nur im Band — 224 Seiten".
// Das war eine Beschriftung auf einer Seite, die sonst nur aus
// Gegenstaenden besteht: Balken, Kolumne, Seitenzahl. Jetzt steht in der
// Stanze ein Stempel: NUR AUF PAPIER, schief aufgesetzt, mit Aussetzern in
// der Farbe.
//
// **Der Abdruck ist ein Bild, die Farbe ist es nicht.**
//
// `public/stempel/nur-auf-papier.webp` ist ein echter Gummistempel-Abdruck,
// freigestellt: weiss ueberall, und die Deckung sitzt im **Alphakanal**.
// Er wird als `mask-image` ueber ein Feld gelegt, das `currentColor`
// traegt — damit kommt die Form aus der Datei und die Farbe aus CSS.
//
// Warum nicht einfach das farbige Bild einsetzen: dann waere die Tinte
// eingebrannt. So bleibt `STAMP_INK` umschaltbar, und der Abdruck kann
// unter dem Zeiger um acht Prozent nachdunkeln, ohne dass eine zweite
// Datei noetig waere.
//
// Hier stand vorher ein **gerechneter** Stempel: Rahmen und Schrift aus
// CSS, darueber eine SVG-Maske aus rund 235 Kreisen als Aussetzer. Der
// Weg funktionierte, aber er blieb eine Nachahmung — echte Gummierosion
// ist nicht rund, sie franst laengs der Faser aus. Die Rechnerei ist
// deshalb raus; was bleibt, ist der Aufsetzwinkel.

/**
 * Womit gestempelt wird. `scarlet` ist das Scharlach des Umschlagfadens —
 * gedeckt, kein Signalrot; `black` ist Stempelschwarz zum Vergleichen.
 * Umstellen und neu laden.
 */
export const STAMP_INK: 'scarlet' | 'black' = 'scarlet';

/** Die beiden Farben. Mehr gibt es nicht. */
const tinten = {
  scarlet: '#b3271e',
  black: '#1f1a14',
} as const;

/**
 * Unter dem Zeiger sinkt die Farbe um 8 Prozent nach — als druecke jemand
 * nach. Keine Bewegung, kein Wackeln; der Abdruck liegt, wo er liegt.
 */
const nachdruck = 0.08;

function dunkler(farbe: string, anteil: number) {
  const zahl = Number.parseInt(farbe.slice(1), 16);
  const kanal = [(zahl >> 16) & 255, (zahl >> 8) & 255, zahl & 255].map((wert) =>
    Math.max(0, Math.round(wert * (1 - anteil))),
  );
  return `#${kanal.map((wert) => wert.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Die freigestellte Maske und ihr Verhaeltnis.
 *
 * **Das Verhaeltnis muss stimmen.** Die Maske wird ueber das Feld gezogen
 * (`mask-size: 100% 100%`); steht das Feld in einem anderen Verhaeltnis
 * als die Datei, zieht das Ziehen jedes Korn ins Ovale — aus Aussetzern
 * werden Schlieren, und der Abdruck sieht nicht abgenutzt aus, sondern
 * verwaschen. Genau das ist dem gerechneten Vorgaenger passiert. Deshalb
 * steht die Zahl hier neben der Datei und die Stanze rechnet ihre Hoehe
 * daraus aus, statt sie zu setzen.
 */
export const abdruckBild = '/stempel/nur-auf-papier.webp';
/** 900 zu 246, gemessen an der freigestellten Datei. */
export const abdruckVerhaeltnis = 900 / 246;

/**
 * Ein Zufall, der keiner ist — dieselbe Saat, derselbe Winkel. Ein
 * Stempel, der beim zweiten Aufschlagen anders schief steht, ist keiner.
 */
function wuerfel(saat: number) {
  let zahl = (Math.abs(Math.round(saat)) * 9301 + 49297) % 233280;
  return () => {
    zahl = (zahl * 9301 + 49297) % 233280;
    return zahl / 233280;
  };
}

/** Ein Abdruck: wie schief er sitzt und in welcher Farbe. */
export type Abdruck = {
  /** Aufsetzwinkel, zwischen −4 und −7 Grad. Von Hand gestempelt. */
  dreh: number;
  tinte: string;
  tinteGedrueckt: string;
};

export function stempelAbdruck(saat: number): Abdruck {
  const zufall = wuerfel(saat);
  const tinte = tinten[STAMP_INK];
  return {
    dreh: -4 - zufall() * 3,
    tinte,
    tinteGedrueckt: dunkler(tinte, nachdruck),
  };
}

/** Aus einem Titel eine Saat: derselbe Band, derselbe Winkel. */
export function stempelSaat(text: string) {
  let zahl = 7;
  for (let i = 0; i < text.length; i += 1) zahl = (zahl * 31 + text.charCodeAt(i)) % 2147483647;
  return zahl;
}
