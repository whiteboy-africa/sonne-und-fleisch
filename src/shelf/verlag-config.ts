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
  bookLinkLabel: 'Zum Band',
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
   * **Welcher Mono die Bedienung traegt.** Ein Token, das ueberall gilt:
   * es setzt `--schrift` in `basis.css` um, und `--schrift` ist die
   * einzige Stelle, an der die Bedienschrift benannt wird.
   *
   * - `space` — **Space Mono.** Die Entscheidung. Zwei Schnitte, 400
   *   und 700; die Zuordnung der neununddreissig 500er-Regeln auf diese
   *   beiden steht als eine Tafel in `basis.css`.
   * - `plex` — IBM Plex Mono, der Stand davor. Der Weg zurueck.
   * - `fragment` — Fragment Mono, ein einziger Schnitt. Bleibt zum
   *   Vergleichen eingebunden.
   *
   * Courier Prime ist raus: auf schwarzem Grund trug es bei 8 und 9 px
   * nicht, und der fette Schnitt, mit dem es doch stand, war eine
   * andere Seite.
   */
  FONT_MONO: 'space' as 'space' | 'plex' | 'fragment',
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
   * **Wie der Band wendet — im Stapel wie in der Betrachtung.**
   *
   * Gewendet wird durch eine **halbe** Drehung um die Querachse: die
   * dreht den Band um *und* stellt ihn auf den Kopf, und genau so kommt
   * die zweite, kopfueber gedruckte Vorderseite richtig herum zu stehen.
   * Daran liest `seiteAblesen` ab, welche Seite vorn liegt.
   *
   * `hoch` sind die ganzen Zusatzdrehungen um die **Hochachse**, die
   * gleichzeitig dazulaufen — das ist der Schwung. Auf `0` bleibt das
   * nackte Kippen uebrig, und das sah zu brav aus.
   *
   * `jedes` sagt, **wie selten** der Schwung kommt: bei `4` klappt der
   * Band dreimal schlicht um und dreht sich beim vierten Mal. Ein
   * Kunststueck, das jedes Mal kommt, ist keins mehr — es wird zur
   * Mechanik des Knopfes. So bleibt es eine Zugabe, und man drueckt
   * noch einmal, um zu sehen, ob es wieder passiert.
   *
   * Auf `1` gestellt dreht sich jedes Wenden.
   *
   * **Nur die Hochachse, und nur ganze Drehungen.** Zusatzdrehungen um
   * die Querachse gab es hier einmal (anderthalb statt einer halben):
   * der Kippwinkel lief damit ueber die Pole, und weil die
   * Inhaltsgruppe auf `rotation.order = 'YXZ'` steht, taumelte der Band
   * dort, statt sich zu drehen. Die Querachse macht ihre halbe Drehung
   * und sonst nichts.
   */
  wendeSpin: { hoch: 1, jedes: 4 },
  /**
   * Wie der Band aufgeht. Zwei Wege, beide fertig gebaut:
   *
   * - `pages3d` — der Deckel klappt auf, und **echte Blaetter** schlagen um.
   *   Jedes ist ein gebeugtes Netz an einer Knochenkette und woelbt sich
   *   mitten in der Drehung wie Papier (`blaetter-rig.ts`).
   * - `lichtschnitt` — der aeltere Weg: der Deckel klappt auf, die Blaetter
   *   sind starre schwarze Ebenen, die vorbeifliegen. Billiger zu rechnen.
   *
   * **Beide Male `pages3d`.** Auf dem Telefon stand hier `lichtschnitt`,
   * aus Vorsicht vor den Knochenketten — nachgesehen hat das niemand, und
   * im Bild war es eine Katastrophe: der Raum ist schwarz, und die starren
   * Ebenen des aelteren Weges sind es auch (`#0a0a0a`). Zu sehen war eine
   * gute Sekunde lang ein schwarzes Rechteck auf schwarzem Grund — kein
   * Umschlag, kein Papier, kein Balken. Das las sich nicht als Aufschlagen,
   * sondern als Fehler.
   *
   * `pages3d` kostet, was ein Band aufgeschlagen kostet: sieben Geometrien
   * und neun Texturen, gemessen, und danach wieder null. Das traegt ein
   * Telefon.
   *
   * Der aeltere Weg bleibt gebaut und umstellbar. Wer ihn wieder anschaltet,
   * sollte ihm vorher Papier geben — schwarz auf schwarz ist kein Bild.
   */
  oeffnenModus: {
    schreibtisch: 'pages3d',
    handy: 'pages3d',
  },
} as const;

/** Die beiden Wege, auf denen ein Band aufgeht. */
export type OeffnenModus = 'pages3d' | 'lichtschnitt';
