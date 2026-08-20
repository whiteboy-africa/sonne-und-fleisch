// Datentyp, den die Regal-Engine erwartet. Die Feldnamen sind englisch,
// weil sie aus dem uebernommenen Mint-Playground-Code stammen (MIT, siehe
// LICENSE-mint-playground). Die Verlagsinhalte selbst liegen deutsch in
// src/content/buecher/ und werden in src/buecher.ts auf diesen Typ gemappt.

export const MOTIVE = [
  'lattice',
  'corrosion',
  'efficiency',
  'network',
  'boom',
  'organization',
  'schematic',
  'flight',
  'circuit',
  'orbit',
  'branches',
  'wave',
  'runner',
  'gather',
  'maze',
  'fracture',
  'continuum',
  'windows',
  'steps',
] as const;

export type BookMotif = (typeof MOTIVE)[number];

/**
 * Die drei Zustaende, die ein Band im Programm haben kann. Freitext gab es
 * hier frueher — damit stand auf jeder Seite etwas anderes, und die Liste
 * liess sich nicht nach Zustand lesen.
 */
export const VERFUEGBARKEITEN = [
  'Verfügbar',
  'In Vorbereitung',
  'Vergriffen',
  // Der Blindband: die offene Stelle am Ende der Reihe.
  'Vakant',
] as const;

export type Verfuegbarkeit = (typeof VERFUEGBARKEITEN)[number];

/**
 * Ein Stueck Leseprobe: entweder Text oder ein Balken. Der Klartext unter
 * einem Balken existiert hier nicht mehr — er wurde beim Uebersetzen aus
 * dem Frontmatter herausgeschnitten (`src/buecher.ts`). Uebrig ist nur
 * seine Breite in Zeichen. Was geschwaerzt ist, steht in keinem HTML.
 */
export type ExcerptPart =
  | { text: string }
  | { bar: number; /** Schliesst die letzte Zeile ab. */ last?: true };

export type BookExcerpt = {
  /** Seitenzahl des Fensters, wie sie im Buch steht. */
  page: number;
  /** Absaetze, jeder aus Text- und Balkenstuecken. Leer, wenn `image` steht. */
  paragraphs: ExcerptPart[][];
  /**
   * Die echte gesetzte Seite als Bild. Ist sie da, zeigt das Fenster sie
   * statt des nachgebauten Satzes — samt Kolumne, Umbruch und den im Buch
   * **gedruckten** Schwaerzungen.
   */
  image?: string;
  /** Die geschwaerzten Folgeseiten als echte Seiten, der Reihe nach. */
  blackImages?: string[];
};

export type CatalogBook = {
  id: string;
  /** Releasenummer, dreistellig — steht auf dem Buchruecken. */
  release: string;
  title: string;
  shortTitle: string;
  author: string;
  description: string;
  quote: string;
  quoteBy: string;
  format: string;
  availability: string;
  url: string;
  cover: string;
  accent: string;
  ink: string;
  motif: BookMotif;
  height: number;
  thickness: number;
  /** Breite geteilt durch Hoehe. Kommt aus dem Umschlagbild. */
  widthRatio: number;
  /**
   * Optionales eigenes Cover-Bild fuer die Vorderseite. Dateien liegen unter
   * `public/buecher/<id>/` und werden als `/buecher/<id>/cover.webp`
   * angegeben. Fehlt das Bild oder laedt es nicht, bleibt das prozedural
   * gezeichnete Cover sichtbar.
   */
  coverImage?: string;
  /** Eigenes Bild fuer den Buchruecken. */
  spineImage?: string;
  /**
   * Blindband: ein unbedruckter Rohling am Ende der Reihe. Sein Umschlag
   * traegt nur das Verlagszeichen, kein Bild und keinen Titel.
   */
  blind?: boolean;
  /**
   * Blatt statt Buch: nur der Bogen selbst, kein Buchblock, kein Ruecken.
   * So sieht ein Poster im Stapel aus wie ein Poster und nicht wie ein
   * sehr duennes Buch.
   */
  sheet?: boolean;
  linkLabel?: string;
  living?: boolean;
  /**
   * Wohin bestellt wird. Nur gesetzt, wenn im Frontmatter ein
   * `bestell_link` steht — die Schlusstafel der Leseprobe braucht ihn.
   */
  orderUrl?: string;
  /** Gesamtumfang in Seiten — die Zahl auf der Schlusstafel. */
  pages?: number;
  /**
   * Die Leseprobe der ersten Seite. Fehlt sie, laesst sich der Band nicht
   * aufschlagen: kein Klick auf den Umschlag, keine Zeile in den Angaben.
   */
  excerpt?: BookExcerpt;
  /**
   * Zweite Vorderseite. Ist sie gesetzt, ist der Band ein Doppelcover
   * (tête-bêche): die zweite Geschichte steht kopfüber auf der Rückseite,
   * man dreht das Buch um und auf den Kopf.
   */
  back?: BookBackFace;
};

export type BookBackFace = {
  title: string;
  shortTitle: string;
  author: string;
  description: string;
  quote: string;
  quoteBy: string;
  cover: string;
  accent: string;
  ink: string;
  motif: BookMotif;
  coverImage?: string;
  /** Die zweite Geschichte hat ihre eigene Leseprobe. */
  excerpt?: BookExcerpt;
};
