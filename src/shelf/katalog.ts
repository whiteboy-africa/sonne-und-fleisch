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
  linkLabel?: string;
  living?: boolean;
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
};
