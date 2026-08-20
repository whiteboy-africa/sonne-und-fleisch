// Zentrale Beschriftungen des Regals und der prozedural gezeichneten Cover.
// Diese eine Datei steuert Wortmarke, Kollektionszeile, Aufdruck auf dem
// gezeichneten Cover, Ruecken-Kuerzel und die Standard-Linkbeschriftung.

export const siteConfig = {
  title: 'Sonne und Fleisch — Verlag',
  applicationName: 'Sonne und Fleisch',
  description:
    'Das Programm des Verlags Sonne und Fleisch als begehbares Regal: jeden Band herausziehen, drehen und lesen, was darin steht.',
  wordmark: 'SONNE UND FLEISCH',
  collectionName: 'VERLAG',
  editionEyebrow: 'AUS DEM PROGRAMM',
  // Aufdruck auf dem gezeichneten Cover und auf der Rueckseite.
  coverImprint: 'SONNE UND FLEISCH',
  coverTagline: 'VERLAG',
  // Kuerzel unten auf dem Buchruecken.
  spineMark: 'SF',
  bookLinkLabel: 'Zum Buch',
  /**
   * Steht unten rechts im Regal, wo sonst die Bedienhinweise staenden.
   * Eine Zeile, Versalien.
   */
  slogan: 'PERMANENT DETERRITORIALIZATION',
  socialImageAlt:
    'Ein Regal mit den Bänden des Verlags Sonne und Fleisch, ein Band nach vorn gezogen.',
  /**
   * Solange das hier `false` ist, traegt jede Seite `noindex` und die Seite
   * taucht in keiner Suchmaschine auf. Der zweite Riegel liegt in
   * `public/_headers` (X-Robots-Tag), der auch fuer Bilder und die Sitemap
   * gilt — beide gehoeren umgestellt, wenn der Verlag oeffentlich wird.
   */
  suchmaschinen: false,
  /**
   * Handy-Fluss: auf schmalen Schirmen verlaesst die Bedienung die feste
   * Lage und fliesst als normale Seite unter der Leinwand her. Die
   * Leinwand selbst bleibt fest und ganz hinten. Auf `false` gestellt
   * verhaelt sich alles wie zuvor.
   */
  handyFluss: true,
  /**
   * Der aufschlagbare Band. Auf `false` gestellt bleibt alles wie zuvor:
   * der Umschlag laesst sich nicht anklicken, die Zeile „Leseprobe" steht
   * nicht in den Angaben, und die Baende tragen keine Probe mit sich.
   */
  leseprobe: true,
  /**
   * Wohin „Vormerken" am Ende der Leseprobe fuehrt, solange ein Band nicht
   * lieferbar ist. Ist er lieferbar, geht die Zeile stattdessen an seinen
   * eigenen Bestell-Link.
   */
  vormerkenAdresse: 'salve@sonneundfleisch.com',
  /**
   * Wie der Band aufgeht. Zwei Wege, beide fertig gebaut:
   *
   * - `pages3d` — der Deckel klappt auf, und **echte Blaetter** schlagen um.
   *   Jedes ist ein gebeugtes Netz an einer Knochenkette und woelbt sich
   *   mitten in der Drehung wie Papier (`blaetter-rig.ts`).
   * - `lichtschnitt` — der aeltere Weg: der Deckel klappt auf, die Blaetter
   *   sind starre schwarze Ebenen, die vorbeifliegen. Billiger zu rechnen.
   *
   * Am Schreibtisch `pages3d`, auf Fingergeraeten `lichtschnitt`: dort
   * zaehlt jedes Bild, und die Knochenketten sind noch nicht auf schwachen
   * Telefonen gemessen. Zum Vergleichen laesst sich beides umstellen; der
   * aeltere Weg bleibt unveraendert liegen.
   */
  oeffnenModus: {
    schreibtisch: 'pages3d',
    handy: 'lichtschnitt',
  },
} as const;

/** Die beiden Wege, auf denen ein Band aufgeht. */
export type OeffnenModus = 'pages3d' | 'lichtschnitt';
