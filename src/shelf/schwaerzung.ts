// Das Muster einer geschwaerzten Seite — die eine Quelle fuer beide Orte,
// an denen es auftaucht: die Doppelseite im Dokument (`leseprobe.ts`) und
// die Blaetter, die beim Aufschlagen durch das Bild fliegen
// (`blaetter-rig.ts`). Beide zeichnen dasselbe Muster, damit die Seiten in
// der Szene und die Seiten im Dokument aus demselben Buch stammen.
//
// Eine Zeile ist **ein** durchgehender Balken. Zwischenraeume zwischen den
// Woertern gibt es nicht: geschwaerzt wird die Zeile, nicht Wort fuer Wort.
//
// (Es war einmal anders — zwei bis vier Balken mit Wortabstaenden. Das sah
// nach zensiertem Satz aus, aber eben auch nach ausgelassenen Woertern, die
// noch dastuenden. Ein Strich ueber die Zeile ist eindeutiger.)
//
// Dass hier trotzdem Satz stand und kein Rechteck, tragen die Zeilen selbst:
// Absaetze mit Einzug und kurzer Schlusszeile.

/** Eine Zeile einer geschwaerzten Seite. */
export type SchwarzZeile = {
  /** Anteil der Spaltenbreite, den die Zeile einnimmt. */
  breite: number;
  /** Erste Zeile eines Absatzes — sie rueckt ein. */
  einzug: boolean;
  /**
   * Gewichte der Balken in der Zeile. Heute immer genau einer — das Feld
   * bleibt, damit die drei Stellen, die es zeichnen, sich nicht aendern
   * muessen, falls die Zeile je wieder zerfaellt.
   */
  stuecke: number[];
};

/** Der Einzug einer Absatzzeile, in Zeilenhoehen. */
export const balkenEinzug = 1.4;

/**
 * Ein Zufall, der keiner ist: aus derselben Saat kommt dieselbe Seite.
 * Ein Buch aendert sich nicht, wenn man es zuklappt.
 */
function wuerfel(saat: number) {
  let zahl = (Math.abs(Math.round(saat)) * 9301 + 49297) % 233280;
  return () => {
    zahl = (zahl * 9301 + 49297) % 233280;
    return zahl / 233280;
  };
}

/** Das Muster einer ganz geschwaerzten Seite, Zeile fuer Zeile. */
export function balkenMuster(saat: number, zeilenZahl: number): SchwarzZeile[] {
  const zufall = wuerfel(saat);
  const zeilen: SchwarzZeile[] = [];
  let imAbsatz = 0;
  let absatzLaenge = 4 + Math.floor(zufall() * 5);
  for (let i = 0; i < zeilenZahl; i += 1) {
    const letzte = imAbsatz === absatzLaenge - 1 || i === zeilenZahl - 1;
    zeilen.push({
      // Volle Zeilen, nur die Schlusszeile eines Absatzes bricht kurz ab.
      breite: letzte ? 0.32 + zufall() * 0.42 : 1,
      einzug: imAbsatz === 0 && i > 0,
      // Ein Balken, durchgehend.
      stuecke: [1],
    });
    imAbsatz += 1;
    if (letzte) {
      imAbsatz = 0;
      absatzLaenge = 4 + Math.floor(zufall() * 5);
    }
  }
  return zeilen;
}

/**
 * Dreh- und Ueberhangwerte eines einzelnen Balkens. Auch die stehen fest:
 * derselbe Balken steht beim zweiten Aufschlagen genauso schief wie beim
 * ersten.
 */
export function balkenLage(saat: number) {
  const zahl = (Math.abs(Math.round(saat)) * 1103515245 + 12345) % 2147483648;
  const anteil = (zahl / 2147483648 + 1) % 1;
  return {
    // ±0,5 Grad: der Balken ist gedruckt, nicht gesetzt.
    dreh: anteil - 0.5,
    // Nur ein Hauch Ueberstand: der Balken soll ueber die Zeilenkante
    // hinausragen, aber die Leerzeichen daneben nicht auffressen — sonst
    // klebt das Wort davor am Balken.
    ueberhang: 0.05 + anteil * 0.1,
  };
}
