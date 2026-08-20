// Der aufschlagbare Band: Deckel am Bund, ein Stapel Blaetter, die sich
// beim Umschlagen biegen.
//
// Die Technik ist bekannt und hier von Grund auf neu geschrieben: jedes
// Blatt ist ein `SkinnedMesh` mit einer Knochenkette laengs der
// Wendeachse. Die Kette traegt die Drehung; die Biegung kommt als zweiter,
// voruebergehender Anteil obendrauf und ist an beiden Enden der Bewegung
// null — flach im Liegen, flach im Aufgeschlagenen, gewoelbt nur dazwischen.
//
// Warum ueberhaupt Knochen: eine starre Ebene, die um den Bund kippt, sieht
// aus wie eine Klappe. Papier wehrt sich, wenn man es anhebt — die freie
// Kante bleibt zurueck, das Blatt wirft einen Bogen, und erst am Ende legt
// es sich wieder gerade. Genau das ist der Unterschied zwischen einer
// umschlagenden Seite und einem Scharnier.
//
// Wo Werte zu drehen sind, stehen sie oben in `takt` und `form` — an einer
// Stelle, nicht verstreut. Gedaempft wird ueberall mit
// `1 - exp(-lambda * delta)`, wie im uebrigen Regal.

import * as THREE from 'three';
import { balkenLage, balkenMuster } from './schwaerzung';

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
  segmente: 26,
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
  lambda: 13,
} as const;

const papierTon = '#d6d2c5';
const schwaerzungTon = '#0a0a0a';
/** Zeilen auf einem geschwaerzten Blatt in der Szene. */
const zeilenJeBlatt = 22;

function easeInOut(wert: number) {
  const t = THREE.MathUtils.clamp(wert, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Federt einmal ueber das Ziel hinaus und kommt zurueck. */
function easeUeberschwung(wert: number, staerke: number) {
  const t = THREE.MathUtils.clamp(wert, 0, 1);
  const c = 1 + staerke * 10;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

function damp(jetzt: number, ziel: number, lambda: number, delta: number) {
  return THREE.MathUtils.lerp(jetzt, ziel, 1 - Math.exp(-lambda * delta));
}

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

/** Ein Blatt: gebeugtes Netz plus die Kette, die es beugt. */
type Blatt = {
  netz: THREE.SkinnedMesh;
  kette: THREE.Bone[];
  /** Wann dieses Blatt in der Gesamtbewegung dran ist. */
  beginn: number;
};

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

  // --- Die Blaetter.
  const segBreite = breite / form.segmente;
  const blaetter: Blatt[] = [];

  for (let i = 0; i < form.blaetter; i += 1) {
    // Das letzte Blatt ist hell: seine Rueckseite wird die linke Seite der
    // aufgeschlagenen Doppelseite.
    const hell = i === form.blaetter - 1;
    const stoff = hell
      ? papier
      : merken(
          new THREE.MeshStandardMaterial({
            map: (() => {
              const textur = new THREE.CanvasTexture(
                schwaerzungLeinwand(saat + i * 17, i % 2 === 1),
              );
              textur.colorSpace = THREE.SRGBColorSpace;
              textur.anisotropy = werte.anisotropie;
              merken(textur);
              return textur;
            })(),
            roughness: 0.95,
            side: THREE.DoubleSide,
          }),
        );

    const form3d = merken(
      new THREE.PlaneGeometry(breite, hoehe - 0.014, form.segmente, 1),
    );
    // Der Bund liegt bei x = 0, das Blatt reicht nach rechts.
    form3d.translate(breite * 0.5, 0, 0);
    kettenGewichteSetzen(form3d, segBreite, form.segmente);

    const kette: THREE.Bone[] = [];
    for (let k = 0; k < form.segmente; k += 1) {
      const knochen = new THREE.Bone();
      knochen.position.x = k === 0 ? 0 : segBreite;
      if (k > 0) kette[k - 1].add(knochen);
      kette.push(knochen);
    }

    const netz = new THREE.SkinnedMesh(form3d, stoff);
    netz.name = `blatt-${i}`;
    netz.add(kette[0]);
    const skelett = new THREE.Skeleton(kette);
    merken(skelett);
    netz.bind(skelett);
    // Ein gebeugtes Netz verlaesst seinen urspruenglichen Kasten; ohne das
    // verschwindet das Blatt mitten in der Drehung aus dem Bild.
    netz.frustumCulled = false;
    // Am Bund angeschlagen, die Blaetter liegen uebereinander.
    netz.position.set(
      -breite * 0.5,
      0,
      seite * (tiefe * 0.5 + 0.0011 * (form.blaetter - i)),
    );
    gruppe.add(netz);

    blaetter.push({
      netz,
      kette,
      beginn: takt.blaetterVon + i * takt.blattVersatz,
    });
  }

  // --- Der Deckel. Aussen der Umschlag, innen Papier.
  const deckelAngel = new THREE.Group();
  deckelAngel.name = 'deckel';
  deckelAngel.position.set(
    -breite * 0.5,
    0,
    seite * (tiefe * 0.5 + 0.0074),
  );
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

    blaetter.forEach((blatt) => {
      const eigen = THREE.MathUtils.clamp(
        (t - blatt.beginn) / takt.blattDauer,
        0,
        1,
      );
      blattSetzen(blatt, eigen, richtung, delta);
    });
  }

  function entsorgen() {
    gruppe.removeFromParent();
    muell.forEach((stueck) => stueck.dispose());
    muell.length = 0;
  }

  // Der geschlossene Stand, bevor das erste Bild gezeichnet wird.
  setzen(0, 1);

  return { gruppe, setzen, entsorgen };
}

/**
 * Verteilt die Drehung auf die Kette.
 *
 * Der erste Knochen traegt die ganze Drehung des Blattes. Alle weiteren
 * tragen **nur** die Biegung, und die ist eine Sinuswelle ueber die Zeit:
 * null am Anfang, null am Ende, ihr Groesstes in der Mitte der Bewegung.
 * Deshalb liegt das Blatt im Stapel flach, wirft mitten im Umschlagen einen
 * Bogen und liegt aufgeschlagen wieder flach.
 *
 * Das Profil ueber die Laenge ist ein halber Sinus: am Bund und an der
 * freien Kante keine Kruemmung, in der Mitte des Blattes die meiste. Ein
 * Blatt knickt nicht an der Kante, es woelbt sich in der Flaeche.
 */
function blattSetzen(
  blatt: Blatt,
  anteil: number,
  richtung: number,
  delta: number,
) {
  const n = blatt.kette.length;
  const gedreht = richtung * Math.PI * easeInOut(anteil);
  // Die Woelbung ist der freien Kante entgegengesetzt: das Papier bleibt
  // zurueck, wenn man es am Bund anhebt.
  const bogen =
    -richtung * form.bogen * Math.sin(Math.PI * Math.pow(anteil, 0.85));

  let profilSumme = 0;
  for (let i = 1; i < n; i += 1) {
    profilSumme += Math.sin((Math.PI * i) / (n - 1));
  }

  for (let i = 0; i < n; i += 1) {
    const ziel =
      i === 0
        ? gedreht
        : (bogen * Math.sin((Math.PI * i) / (n - 1))) / (profilSumme || 1);
    const knochen = blatt.kette[i];
    knochen.rotation.y = damp(knochen.rotation.y, ziel, form.lambda * 2, delta);
  }
}

/**
 * Haengt jeden Punkt des Netzes an die beiden Knochen links und rechts von
 * ihm — gewichtet nach seinem Abstand. Ohne das haette das Blatt keine
 * Ahnung, welcher Knochen es bewegt.
 */
function kettenGewichteSetzen(
  form3d: THREE.BufferGeometry,
  segBreite: number,
  segmente: number,
) {
  const punkte = form3d.attributes.position;
  const indizes: number[] = [];
  const gewichte: number[] = [];
  for (let i = 0; i < punkte.count; i += 1) {
    const x = punkte.getX(i);
    const roh = x / segBreite;
    const knochen = Math.min(segmente - 1, Math.max(0, Math.floor(roh)));
    const anteil = THREE.MathUtils.clamp(roh - knochen, 0, 1);
    const naechster = Math.min(segmente - 1, knochen + 1);
    indizes.push(knochen, naechster, 0, 0);
    gewichte.push(1 - anteil, anteil, 0, 0);
  }
  form3d.setAttribute(
    'skinIndex',
    new THREE.Uint16BufferAttribute(indizes, 4),
  );
  form3d.setAttribute(
    'skinWeight',
    new THREE.Float32BufferAttribute(gewichte, 4),
  );
}
