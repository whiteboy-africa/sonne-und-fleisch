// Der aufschlagbare Band: Deckel am Bund, ein Stapel Blaetter, die sich
// beim Umschlagen biegen.
//
// Die Blattmechanik selbst — Knochenkette, Biegung, Daempfung — steht seit
// dem Magazin in `seiten-rig.ts` und wird von beiden benutzt. Hier steht
// nur noch, **wann** welches Blatt dran ist: eine Kaskade, getrieben von
// einer einzigen Zahl, dem Stand des Aufschlagens. Das Magazin blaettert
// einzeln und auf Zuruf und rechnet sich seine Haltungen selbst aus.
//
// Wo Werte zu drehen sind, stehen sie oben in `takt` und `form` — an einer
// Stelle, nicht verstreut. Gedaempft wird ueberall mit
// `1 - exp(-lambda * delta)`, wie im uebrigen Regal.

import * as THREE from 'three';
import { balkenLage, balkenMuster } from './schwaerzung';
import {
  damp,
  easeUeberschwung,
  seitenRigBauen,
  seitenFormVorgabe,
} from './seiten-rig';

/**
 * Der Takt des Aufschlagens, in Anteilen der Gesamtbewegung (0 bis 1).
 * Die Zahlen folgen der Zeittabelle des Regals: Phasen von etwa einer
 * Zehntelsekunde, nichts unter 55 ms.
 */
export const takt = {
  /** Der Band faehrt flach heran. */
  anflugBis: 0.34,
  /** Der Deckel klappt auf — mit leichtem Ueberschwingen. */
  deckelVon: 0.16,
  deckelBis: 0.44,
  /** Das erste Blatt beginnt hier. */
  blaetterVon: 0.34,
  /** Jedes weitere Blatt faengt so viel spaeter an. */
  blattVersatz: 0.075,
  /** So lange braucht ein einzelnes Blatt fuer seine halbe Drehung. */
  blattDauer: 0.3,
  /** Ab hier uebernimmt die Doppelseite im Dokument. */
  uebergabeBei: 0.92,
} as const;

export const form = {
  /** Blaetter im Stapel. Das letzte ist das helle. */
  blaetter: 5,
  /** Segmente laengs der Wendeachse — so fein wird die Biegung. */
  segmente: seitenFormVorgabe.segmente,
  /**
   * Wie stark sich ein Blatt in der Mitte der Drehung woelbt, im Bogenmass
   * ueber die ganze Kette. Null waere eine starre Klappe; zu viel rollt das
   * Blatt zusammen.
   */
  bogen: 0.78,
  /** Der Deckel oeffnet nicht ganz flach — 170 Grad, wie in der Hand. */
  deckelWinkel: THREE.MathUtils.degToRad(170),
  /** Wie weit er dabei ueber sein Ziel hinausschwingt. */
  ueberschwung: 0.09,
  /** Daempfung der Knochen. Wie die Kamera im Fokus: lambda 13. */
  lambda: seitenFormVorgabe.lambda,
} as const;

const papierTon = '#d6d2c5';
const schwaerzungTon = '#0a0a0a';
/** Zeilen auf einem geschwaerzten Blatt in der Szene. */
const zeilenJeBlatt = 22;
/** Abstand zweier Blaetter im Stapel. */
const blattAbstand = 0.0011;

/**
 * Zeichnet eine geschwaerzte Seite auf eine Leinwand — nach derselben
 * Vorlage wie die Doppelseite im Dokument: derselbe Papierton, dieselbe
 * Kolumne mit ihrer Haarlinie, dasselbe Balkenmuster (`schwaerzung.ts`).
 *
 * In der Kolumne steht nicht der Titel des Bandes, sondern schlicht
 * „Sonne und Fleisch" links und „Vorschau" rechts. Die Blaetter fliegen in
 * einer halben Sekunde vorbei — lesen wird das niemand, und ein falscher
 * Titel waere schlechter als gar keiner. Sichtbar ist nur, dass dort eine
 * Kolumne steht und ein Strich darunter, und genau das soll man sehen.
 */
function schwaerzungLeinwand(saat: number, rechts: boolean): HTMLCanvasElement {
  const breite = 512;
  const hoehe = Math.round(breite / 0.705);
  const leinwand = document.createElement('canvas');
  leinwand.width = breite;
  leinwand.height = hoehe;
  const stift = leinwand.getContext('2d');
  if (!stift) return leinwand;

  stift.fillStyle = papierTon;
  stift.fillRect(0, 0, breite, hoehe);

  // Dieselben Verhaeltnisse wie im Dokument (siehe `styles/leseprobe.css`):
  // Seitenrand 12,3 % der Breite, Kopf bei 4,6 % der Hoehe.
  const rand = breite * 0.123;
  const spalte = breite - rand * 2;

  // Die Kolumne: gesperrte Versalien, Ziffer aussen, Haarlinie darunter.
  const kopfSchrift = Math.round(hoehe * 0.0135);
  stift.fillStyle = 'rgba(23, 20, 15, 0.82)';
  stift.font = `${kopfSchrift}px Georgia, 'Times New Roman', serif`;
  stift.textBaseline = 'alphabetic';
  const wort = rechts ? 'VORSCHAU' : 'SONNE UND FLEISCH';
  const gesperrt = wort.split('').join('\u2009');
  const kopfY = hoehe * 0.059;
  stift.textAlign = 'center';
  stift.fillText(gesperrt, breite / 2, kopfY);
  stift.textAlign = rechts ? 'right' : 'left';
  stift.font = `${Math.round(kopfSchrift * 1.25)}px Georgia, 'Times New Roman', serif`;
  stift.fillText(
    String(40 + (Math.abs(Math.round(saat)) % 40)),
    rechts ? breite - rand : rand,
    kopfY,
  );
  stift.textAlign = 'left';

  const linieY = Math.round(hoehe * 0.101);
  stift.fillRect(rand, linieY, spalte, Math.max(1, Math.round(hoehe * 0.0012)));

  const kopf = hoehe * 0.122;
  const satzHoehe = hoehe - kopf - hoehe * 0.05;
  const zeilenAbstand = satzHoehe / zeilenJeBlatt;
  const balkenHoehe = zeilenAbstand * 0.58;
  stift.fillStyle = schwaerzungTon;
  balkenMuster(saat, zeilenJeBlatt).forEach((zeile, index) => {
    const y = kopf + index * zeilenAbstand;
    const einzug = zeile.einzug ? spalte * 0.06 : 0;
    const zeilenBreite = spalte * zeile.breite - einzug;
    const lage = balkenLage(saat * 97 + index * 5);
    stift.save();
    stift.translate(rand + einzug, y);
    stift.rotate((lage.dreh * Math.PI) / 180);
    stift.fillRect(0, 0, zeilenBreite, balkenHoehe);
    stift.restore();
  });

  return leinwand;
}

export type BlaetterRig = {
  gruppe: THREE.Group;
  /**
   * Setzt den Stand der Bewegung. `anteil` 0 ist zu, 1 ist aufgeschlagen;
   * `delta` ist die Bildzeit fuer die Daempfung.
   */
  setzen: (anteil: number, delta: number) => void;
  entsorgen: () => void;
};

/**
 * Baut das Rig fuer **einen** Band. Es wird erst gebaut, wenn jemand den
 * Band aufschlaegt, und beim Zuklappen wieder abgeraeumt: ein Regal mit
 * zehn Baenden traegt sonst zehn Knochenketten und zehn Leinwaende mit
 * sich herum, die niemand ansieht.
 */
export function blaetterRigBauen(werte: {
  breite: number;
  hoehe: number;
  tiefe: number;
  /** +1: der Deckel liegt vorn. -1: der Band ist gewendet. */
  seite: 1 | -1;
  /** Der Umschlag des Bandes — dieselbe Textur wie am geschlossenen Buch. */
  deckelStoff: THREE.Material;
  /** Der Umschlag zeigt beim gewendeten Band nach hinten. */
  deckelGedreht: boolean;
  saat: number;
  anisotropie: number;
}): BlaetterRig {
  const { breite, hoehe, tiefe, seite, saat } = werte;
  const gruppe = new THREE.Group();
  gruppe.name = 'aufschlag-blaetter';

  const muell: Array<{ dispose: () => void }> = [];
  const merken = <T extends { dispose: () => void }>(stueck: T) => {
    muell.push(stueck);
    return stueck;
  };

  const papier = merken(
    new THREE.MeshStandardMaterial({
      color: papierTon,
      roughness: 0.93,
      side: THREE.DoubleSide,
    }),
  );

  // --- Das helle Blatt unter allem: das Fenster, auf dem das Riffeln endet.
  const fensterForm = merken(
    new THREE.PlaneGeometry(breite - 0.016, hoehe - 0.016),
  );
  const fenster = new THREE.Mesh(fensterForm, papier);
  fenster.position.z = seite * (tiefe * 0.5 - 0.0007);
  gruppe.add(fenster);

  // --- Die Blaetter. Die Mechanik kommt aus `seiten-rig.ts`; hier steht
  // nur, was auf ihnen steht und wann sie dran sind.
  const rig = seitenRigBauen({
    breite,
    hoehe: hoehe - 0.014,
    blaetter: form.blaetter,
    z: seite * tiefe * 0.5,
    blattAbstand,
    // Der Bund an der linken Kante des Buchkoerpers: der ist um seine
    // Mitte gebaut.
    bund: -breite * 0.5,
    seite,
    form: { segmente: form.segmente, lambda: form.lambda },
    stoff: (i) => {
      // Das letzte Blatt ist hell: seine Rueckseite wird die linke Seite
      // der aufgeschlagenen Doppelseite.
      if (i === form.blaetter - 1) return papier;
      const textur = new THREE.CanvasTexture(
        schwaerzungLeinwand(saat + i * 17, i % 2 === 1),
      );
      textur.colorSpace = THREE.SRGBColorSpace;
      textur.anisotropy = werte.anisotropie;
      merken(textur);
      return merken(
        new THREE.MeshStandardMaterial({
          map: textur,
          roughness: 0.95,
          side: THREE.DoubleSide,
        }),
      );
    },
  });
  gruppe.add(rig.gruppe);

  /** Wann dieses Blatt in der Gesamtbewegung dran ist. */
  const beginn = Array.from(
    { length: form.blaetter },
    (_, i) => takt.blaetterVon + i * takt.blattVersatz,
  );

  // --- Der Deckel. Aussen der Umschlag, innen Papier.
  const deckelAngel = new THREE.Group();
  deckelAngel.name = 'deckel';
  deckelAngel.position.set(-breite * 0.5, 0, seite * (tiefe * 0.5 + 0.0074));
  const deckelForm = merken(
    new THREE.PlaneGeometry(breite - 0.01, hoehe - 0.01),
  );
  const deckelAussen = new THREE.Mesh(deckelForm, werte.deckelStoff);
  deckelAussen.position.x = (breite - 0.01) * 0.5;
  if (werte.deckelGedreht) deckelAussen.rotation.y = Math.PI;
  const deckelInnen = new THREE.Mesh(deckelForm, papier);
  deckelInnen.position.set((breite - 0.01) * 0.5, 0, seite * -0.0018);
  deckelAngel.add(deckelAussen, deckelInnen);
  gruppe.add(deckelAngel);

  // Nach links auf: vorn gegen den Uhrzeigersinn, hinten andersherum.
  const richtung = seite === 1 ? -1 : 1;

  function setzen(anteil: number, delta: number) {
    const t = THREE.MathUtils.clamp(anteil, 0, 1);

    const deckel = THREE.MathUtils.clamp(
      (t - takt.deckelVon) / (takt.deckelBis - takt.deckelVon),
      0,
      1,
    );
    const deckelZiel =
      richtung * form.deckelWinkel * easeUeberschwung(deckel, form.ueberschwung);
    deckelAngel.rotation.y = damp(
      deckelAngel.rotation.y,
      deckelZiel,
      form.lambda,
      delta,
    );

    for (let i = 0; i < form.blaetter; i += 1) {
      const eigen = THREE.MathUtils.clamp(
        (t - beginn[i]) / takt.blattDauer,
        0,
        1,
      );
      rig.haltungSetzen(
        i,
        { anteil: eigen, bogen: rig.bogenAusZeit(eigen, form.bogen) },
        delta,
      );
    }
  }

  function entsorgen() {
    rig.entsorgen();
    gruppe.removeFromParent();
    muell.forEach((stueck) => stueck.dispose());
    muell.length = 0;
  }

  // Der geschlossene Stand, bevor das erste Bild gezeichnet wird.
  setzen(0, 1);

  return { gruppe, setzen, entsorgen };
}
