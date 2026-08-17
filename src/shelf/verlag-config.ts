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
  socialImageAlt:
    'Ein Regal mit den Bänden des Verlags Sonne und Fleisch, ein Band nach vorn gezogen.',
  independentNote: 'Sonne und Fleisch — unabhängiger Verlag.',
} as const;
