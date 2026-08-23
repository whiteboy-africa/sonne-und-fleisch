// Das Heft als Gegenstand: zwei Papierbloecke und ein paar lebende
// Blaetter dazwischen.
//
// Ein Heft mit vierundzwanzig Seiten hat zwoelf Blaetter. Alle zwoelf als
// gebeugte Netze mit je einer Knochenkette und zwei Texturen zu tragen,
// waere Verschwendung: zu sehen sind immer nur die paar um die
// aufgeschlagene Doppelseite herum. Alles andere ist ein Papierstapel, und
// ein Papierstapel ist ein Quader.
//
// Deshalb drei Teile:
//
// - **Zwei Bloecke**, links und rechts vom Bund. Sie tragen die Dicke und
//   den Papierschnitt und wachsen beim Blaettern ineinander ueber. Zwei
//   Quader, keine Textur, zwei Zeichenaufrufe.
// - **Ein lebendes Fenster** von fuenf Blaettern um die Doppelseite herum:
//   das eine, das gerade umschlaegt, und zwei zu jeder Seite. Nur diese
//   fuenf sind gebeugte Netze, nur sie tragen Bilder.
// - **Ein Vorrat an Texturen**, der mit dem Fenster wandert. Was aus dem
//   Fenster faellt, wird freigegeben. Wer das Heft von vorn bis hinten
//   durchblaettert, haelt am Ende nicht mehr Speicher als am Anfang.
//
// Die Blattmechanik selbst kommt aus `seiten-rig.ts` und ist dieselbe wie
// beim aufgeschlagenen Band. Verschieden ist nur, wer die Haltung vorgibt:
// dort ein Fahrplan, hier die Hand.
//
// **Seitenzaehlung.** Blatt k traegt vorn die Seite 2k+1 und hinten die
// Seite 2k+2 — Blatt 0 also den Umschlag und die zweite Seite. Der Stand
// `stelle` ist die Zahl der umgeschlagenen Blaetter: bei 0 ist das Heft zu
// und der Umschlag vorn, bei 1 steht die Doppelseite 2|3, bei k die
// Doppelseite 2k|2k+1.

import * as THREE from 'three';
import { damp, seitenRigBauen, type SeitenRig } from './seiten-rig';

export const magazinForm = {
  /**
   * So viele Blaetter leben gleichzeitig: das umschlagende und zwei zu
   * jeder Seite. Weniger, und beim schnellen Blaettern taucht ein Blatt aus
   * dem Nichts auf; mehr kostet Texturen, die niemand ansieht.
   */
  fenster: 2,
  /** Segmente laengs der Wendeachse. Etwas feiner als beim Band: das Heft
   *  steht nah an der Kamera, und dort sieht man jede Kante. */
  segmente: 30,
  /** Dicke eines Blattes in Szeneneinheiten. */
  blattDicke: 0.0016,
  /**
   * Wie stark sich ein Blatt in der Mitte der Drehung woelbt, wenn nichts
   * daran zieht. Etwas weniger als beim Band — Heftpapier ist steifer als
   * ein Buchblatt und wirft einen flacheren Bogen.
   */
  bogen: 0.62,
  /** Wie viel Woelbung eine gezogene Ecke hoechstens dazulegt. */
  bogenZug: 0.55,
  /**
   * **Die Woelbung im Stillstand.** Ein aufgeschlagenes Heft liegt nicht
   * flach da: die Seiten stehen unter Spannung, ihre Aussenkanten heben
   * sich vom Bund weg. Ohne das ist die Doppelseite ein Scan auf einer
   * Tafel — der Gegenstand verschwindet, und uebrig bleibt ein Betrachter.
   *
   * Sie folgt einem Kosinus ueber den Stand des Blattes: voll auf der einen
   * Ruhelage, null in der Senkrechten, voll und andersherum auf der
   * anderen. So kippt sie mitten im Umschlagen nicht um, sondern geht durch
   * null — genau dort, wo die Woelbung aus der Bewegung ihr Groesstes hat.
   * Das Vorzeichen ist gegenlaeufig zum Umschlagbogen, und das muss es
   * sein: die Aussenkanten sollen dem Betrachter entgegenkommen. Andersherum
   * tauchen sie hinter die Papierbloecke, und dann liegen zwei cremefarbene
   * Platten ueber der halben Doppelseite.
   */
  ruheBogen: -0.22,
  /** Daempfung im Lauf. */
  lambda: 13,
  /** Und beim Schnappen, wenn die Ecke losgelassen wird. */
  lambdaSchnapp: 22,
  /** Papierton des Heftes — heller als der Buchblock, es ist Neupapier. */
  papier: '#ded9cc',
  /** Der Schnitt an den Blockkanten. */
  schnitt: '#cfc9b8',
} as const;

/** Der Stand des Heftes, Bild fuer Bild. */
export type MagazinStand = {
  /** Umgeschlagene Blaetter. 0 ist zu, `blaetter` ist ganz durch. */
  stelle: number;
  /**
   * Das Blatt, das gerade in der Hand liegt. `anteil` ist sein Stand
   * zwischen den beiden Ruhelagen, `bogen` die Woelbung, die die Hand ihm
   * gibt. Ohne Zug ist das `null`, und alle Blaetter liegen in ihrer
   * Ruhelage.
   */
  zug: { blatt: number; anteil: number; bogen: number } | null;
  /**
   * Eine eben losgelassene Ecke schnappt: kurz nach dem Loslassen laeuft
   * die Daempfung schneller, damit das Blatt zufaellt statt zu treiben.
   */
  schnapp: boolean;
  /** Harter Wechsel statt Bewegung. */
  ohneBewegung: boolean;
};

export type MagazinRig = {
  gruppe: THREE.Group;
  /** Zwoelf Blaetter bei vierundzwanzig Seiten. */
  blaetter: number;
  /** Halbe Breite und halbe Hoehe der Doppelseite — fuer die Kamera. */
  halbeBreite: number;
  halbeHoehe: number;
  setzen: (stand: MagazinStand, delta: number) => void;
  /** Wie viele Seitenbilder gerade im Speicher liegen. */
  texturen: () => number;
  /**
   * Der Stand jedes lebenden Blattes, 0 bis 1. Steht in der Diagnose, weil
   * sich sonst nicht pruefen laesst, **ob** ein Blatt umschlaegt oder bloss
   * springt — im Bild sieht beides nach einem Bild aus.
   */
  staende: () => Array<{ blatt: number; anteil: number }>;
  entsorgen: () => void;
};

/**
 * Baut das Heft. `breite` und `hoehe` sind die **einer Seite**, nicht der
 * Doppelseite — aufgeschlagen ist es doppelt so breit.
 */
export function magazinRigBauen(werte: {
  breite: number;
  hoehe: number;
  seiten: number;
  ordner: string;
  anisotropie: number;
  /** Wird gerufen, sobald das erste Seitenpaar wirklich da ist. */
  bereit?: () => void;
}): MagazinRig {
  const { breite, hoehe, seiten, ordner } = werte;
  const blaetter = Math.ceil(seiten / 2);
  const dicke = magazinForm.blattDicke;

  const gruppe = new THREE.Group();
  gruppe.name = 'magazin';

  const muell: Array<{ dispose: () => void }> = [];
  const merken = <T extends { dispose: () => void }>(stueck: T) => {
    muell.push(stueck);
    return stueck;
  };

  // --- Die beiden Bloecke ---------------------------------------------------
  //
  // Sie tragen die Dicke des Heftes und seinen Papierschnitt. Ein Quader je
  // Seite, in der Tiefe skaliert: das ist der ganze Rest des Heftes.
  const blockStoff = merken(
    new THREE.MeshStandardMaterial({
      color: magazinForm.schnitt,
      roughness: 0.94,
      metalness: 0,
    }),
  );
  const deckStoff = merken(
    new THREE.MeshStandardMaterial({
      color: magazinForm.papier,
      roughness: 0.95,
      metalness: 0,
    }),
  );
  // Der Quader waechst vom Bund nach aussen und von z = 0 nach hinten;
  // skaliert wird nur in der Tiefe.
  /*
   * Etwas kleiner als ein Blatt. Eine gewoelbte Seite hebt sich vom Block
   * ab, und ein Quader in voller Groesse schaut dann ringsum darunter
   * hervor — ein cremefarbener Rand um eine Seite, die keinen hat.
   */
  const blockForm = merken(
    new THREE.BoxGeometry(breite * 0.985, hoehe * 0.985, 1),
  );
  blockForm.translate(breite * 0.985 * 0.5, 0, -0.5);

  const bloecke = [0, 1].map((seite) => {
    // Die Deckflaeche bekommt Papier, die vier Kanten den Schnitt.
    const netz = new THREE.Mesh(blockForm, [
      blockStoff,
      blockStoff,
      blockStoff,
      blockStoff,
      deckStoff,
      deckStoff,
    ]);
    netz.name = seite === 0 ? 'block-links' : 'block-rechts';
    // Links wird gespiegelt statt gedreht: so bleibt der Bund bei x = 0.
    if (seite === 0) netz.scale.x = -1;
    gruppe.add(netz);
    return netz;
  });
  const [blockLinks, blockRechts] = bloecke;

  // --- Das lebende Fenster --------------------------------------------------
  const imFenster = magazinForm.fenster * 2 + 1;
  /** Vorderseiten der Blaetter im Fenster (ungerade Seiten). */
  const stoffeVorn: THREE.MeshStandardMaterial[] = [];
  /** Rueckseiten (gerade Seiten). */
  const stoffeHinten: THREE.MeshStandardMaterial[] = [];

  for (let i = 0; i < imFenster; i += 1) {
    stoffeVorn.push(
      merken(
        new THREE.MeshStandardMaterial({
          color: magazinForm.papier,
          roughness: 0.95,
          metalness: 0,
          side: THREE.FrontSide,
        }),
      ),
    );
    stoffeHinten.push(
      merken(
        new THREE.MeshStandardMaterial({
          color: magazinForm.papier,
          roughness: 0.95,
          metalness: 0,
          side: THREE.BackSide,
        }),
      ),
    );
  }

  const rig: SeitenRig = seitenRigBauen({
    breite,
    hoehe,
    blaetter: imFenster,
    z: 0,
    blattAbstand: 0,
    // Der Bund liegt im Ursprung: an ihm haengt die ganze Doppelseite, und
    // die Kamera steht mittig darueber.
    bund: 0,
    seite: 1,
    form: { segmente: magazinForm.segmente, lambda: magazinForm.lambda },
    stoff: (i) => [stoffeVorn[i], stoffeHinten[i]],
  });
  gruppe.add(rig.gruppe);

  // --- Der Texturvorrat -----------------------------------------------------
  const lader = new THREE.TextureLoader();
  const vorrat = new Map<number, THREE.Texture>();
  let ersteGemeldet = false;

  /**
   * Holt die Textur einer Seite. Gerade Seiten liegen auf der **Rueckseite**
   * eines Blattes: von hinten gesehen ist eine Ebene seitenverkehrt, also
   * wird ihre Textur waagerecht gespiegelt. Sonst stuende jede linke Seite
   * im Spiegel.
   */
  function seitenTextur(nummer: number): THREE.Texture | null {
    if (nummer < 1 || nummer > seiten) return null;
    const da = vorrat.get(nummer);
    if (da) return da;
    const pfad = `${ordner}/${String(nummer).padStart(4, '0')}.webp`;
    const textur = lader.load(pfad, () => {
      if (ersteGemeldet) return;
      ersteGemeldet = true;
      werte.bereit?.();
    });
    textur.colorSpace = THREE.SRGBColorSpace;
    textur.anisotropy = werte.anisotropie;
    textur.generateMipmaps = true;
    textur.minFilter = THREE.LinearMipmapLinearFilter;
    if (nummer % 2 === 0) {
      textur.wrapS = THREE.RepeatWrapping;
      textur.repeat.x = -1;
      textur.offset.x = 1;
    }
    vorrat.set(nummer, textur);
    return textur;
  }

  /** Welches Heftblatt liegt gerade in welchem Fensterplatz? */
  let fensterVon = Number.NaN;

  /**
   * Schiebt das Fenster auf `stelle` und gibt frei, was herausgefallen ist.
   *
   * Gebraucht werden die Blaetter `stelle - fenster` bis `stelle + fenster`;
   * alles darueber hinaus ist Block. Der Vorrat traegt danach hoechstens
   * zwei Bilder je lebendem Blatt — bei fuenf Blaettern also zehn, egal wie
   * dick das Heft ist.
   */
  function fensterSetzen(stelle: number): boolean {
    const von = stelle - magazinForm.fenster;
    if (von === fensterVon) return false;
    fensterVon = von;

    const gebraucht = new Set<number>();
    for (let platz = 0; platz < imFenster; platz += 1) {
      const blatt = von + platz;
      const vorn = blatt * 2 + 1;
      const hinten = blatt * 2 + 2;
      const gueltig = blatt >= 0 && blatt < blaetter;
      const texturVorn = gueltig ? seitenTextur(vorn) : null;
      const texturHinten = gueltig ? seitenTextur(hinten) : null;
      if (texturVorn) gebraucht.add(vorn);
      if (texturHinten) gebraucht.add(hinten);
      stoffeVorn[platz].map = texturVorn;
      stoffeVorn[platz].needsUpdate = true;
      stoffeHinten[platz].map = texturHinten;
      stoffeHinten[platz].needsUpdate = true;
      rig.blaetter[platz].netz.visible = gueltig;
    }

    // Was aus dem Fenster gefallen ist, wird freigegeben. Das ist die
    // ganze Zusage „der Speicher bleibt flach": ohne diese vier Zeilen
    // haelt ein Durchblaettern am Ende alle Seiten.
    for (const [nummer, textur] of vorrat) {
      if (gebraucht.has(nummer)) continue;
      textur.dispose();
      vorrat.delete(nummer);
    }
    return true;
  }

  // --- Der Stand ------------------------------------------------------------
  //
  // Zwei Dinge muessen hier auseinandergehalten werden, und das Vermischen
  // war ein Fehler, den man erst im Bild sah: **der Stand gehoert dem
  // Blatt, nicht dem Fensterplatz.**
  //
  // Beim Blaettern wandert das Fenster um eins weiter. Haengt der Stand am
  // Platz, wechselt in jedem Platz das Blatt, jeder Platz gilt als „neu"
  // und wird auf sein Ziel gesetzt — das Blatt, das gerade umschlagen
  // sollte, steht im selben Bild schon drueben. Es dreht sich nie, es
  // springt. Haengt der Stand am Blatt, laeuft es weiter, waehrend das
  // Fenster unter ihm durchrutscht.
  //
  // Die **Knochen** dagegen gehoeren dem Platz: sie stecken im Netz, und
  // das Netz bleibt liegen, wo es liegt. Rutscht ein anderes Blatt in einen
  // Platz, werden sie deshalb einmal hart gesetzt statt gedaempft — sonst
  // fuehre das neue Blatt aus der Haltung des alten heraus.
  //
  // Aus demselben Grund wird die **Woelbung** aus dem laufenden Stand
  // gerechnet und nicht aus dem Ziel: aus dem Ziel waere sie im selben
  // Bild, in dem der Befehl kommt, schon wieder null, und das Blatt drehte
  // sich starr wie eine Klappe.
  const staende = new Map<number, number>();
  /** Welches Heftblatt lag zuletzt in welchem Fensterplatz? */
  const belegt = new Array<number>(imFenster).fill(Number.NaN);

  function setzen(stand: MagazinStand, delta: number) {
    const stelle = THREE.MathUtils.clamp(stand.stelle, 0, blaetter);
    fensterSetzen(stelle);

    // Ein harter Wechsel ist ein sehr grosser Zeitschritt: die Daempfung
    // erreicht ihr Ziel in einem Bild, und die Woelbung faellt weg.
    const schritt = stand.ohneBewegung ? 1 : delta;
    const lambda = stand.schnapp
      ? magazinForm.lambdaSchnapp
      : magazinForm.lambda;

    const von = stelle - magazinForm.fenster;
    for (let platz = 0; platz < imFenster; platz += 1) {
      const blatt = von + platz;
      if (blatt < 0 || blatt >= blaetter) {
        belegt[platz] = Number.NaN;
        continue;
      }

      const gezogen = stand.zug?.blatt === blatt ? stand.zug : null;
      // Ruhelage: alles vor dem Stand ist umgeschlagen, alles ab dem Stand
      // liegt noch rechts.
      const ziel = gezogen ? gezogen.anteil : blatt < stelle ? 1 : 0;

      let anteil: number;
      if (gezogen || stand.ohneBewegung) {
        anteil = ziel;
      } else {
        const vorher = staende.get(blatt);
        anteil =
          vorher === undefined ? ziel : damp(vorher, ziel, lambda, schritt);
      }
      staende.set(blatt, anteil);

      // Die Woelbung: was im Stillstand da ist, plus was die Bewegung oder
      // die Hand dazulegt.
      const ruhe = magazinForm.ruheBogen * Math.cos(Math.PI * anteil);
      const bogen = stand.ohneBewegung
        ? ruhe
        : ruhe +
          (gezogen
            ? gezogen.bogen
            : rig.bogenAusZeit(anteil, magazinForm.bogen));

      // Ist gerade ein anderes Blatt in diesen Platz gerutscht, werden die
      // Knochen hart gesetzt: sie tragen sonst noch die Haltung des
      // Vorgaengers und fuehren sichtbar aus ihr heraus.
      const gewechselt = belegt[platz] !== blatt;
      belegt[platz] = blatt;
      rig.haltungSetzen(
        platz,
        { anteil, bogen },
        gewechselt ? 1 : schritt,
      );

      // --- Wer liegt ueber wem -------------------------------------------
      //
      // Eine einzige Reihenfolge ueber alle Blaetter geht nicht, denn die
      // beiden Seiten sind gegenlaeufig gestapelt: **rechts** liegt das
      // naechste Blatt obenauf und die spaeteren darunter; **links** liegt
      // das zuletzt umgeschlagene obenauf und die frueheren darunter. Wer
      // beides mit derselben Ordnung bedient, versteckt links das oberste
      // Blatt unter seinem Vorgaenger — und dann steht auf der linken Seite
      // eine Seite zu frueh.
      //
      // Also zaehlt jede Seite ihren Abstand von ihrer **eigenen** Spitze,
      // und wer gerade umschlaegt, liegt ueber allem: er gehoert in diesem
      // Augenblick zu keiner von beiden.
      const oben =
        Math.max(stelle, blaetter - stelle) * dicke + imFenster * dicke;
      const inBewegung = anteil > 0.002 && anteil < 0.998;
      const rang = Math.max(
        0,
        anteil >= 0.5 ? stelle - 1 - blatt : blatt - stelle,
      );
      rig.blaetter[platz].netz.position.z = inBewegung
        ? oben + dicke
        : oben - rang * dicke;
    }

    // Was aus dem Fenster gefallen ist, braucht keinen Stand mehr.
    for (const blatt of staende.keys()) {
      if (blatt < von || blatt >= von + imFenster) staende.delete(blatt);
    }

    // Die Bloecke: links so dick wie das Geblaetterte, rechts wie der Rest.
    // Bei zugeschlagenem Heft ist links nichts, und der Quader verschwindet.
    const linksDick = Math.max(stelle * dicke, 0.0001);
    const rechtsDick = Math.max((blaetter - stelle) * dicke, 0.0001);
    blockLinks.visible = stelle > 0;
    blockRechts.visible = stelle < blaetter;
    blockLinks.scale.z = linksDick;
    blockLinks.position.z = linksDick;
    blockRechts.scale.z = rechtsDick;
    blockRechts.position.z = rechtsDick;
  }

  function entsorgen() {
    rig.entsorgen();
    gruppe.removeFromParent();
    vorrat.forEach((textur) => textur.dispose());
    vorrat.clear();
    staende.clear();
    muell.forEach((stueck) => stueck.dispose());
    muell.length = 0;
  }

  // Der zugeschlagene Stand, bevor das erste Bild gezeichnet wird.
  setzen({ stelle: 0, zug: null, schnapp: false, ohneBewegung: true }, 1);

  return {
    gruppe,
    blaetter,
    halbeBreite: breite,
    halbeHoehe: hoehe * 0.5,
    setzen,
    texturen: () => vorrat.size,
    staende: () =>
      [...staende.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([blatt, anteil]) => ({
          blatt,
          anteil: Number(anteil.toFixed(3)),
        })),
    entsorgen,
  };
}
