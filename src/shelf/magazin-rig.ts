// Das Heft als Gegenstand: zwoelf Blaetter, jedes mit Dicke, alle lebendig.
//
// Vorher standen hier zwei Papierbloecke und ein Fenster von fuenf lebenden
// Blaettern dazwischen. Das war sparsam und sah danach aus: zwei Quader
// lassen sich nicht faechern, nicht woelben und nicht umblaettern, und wo
// ein Blatt sich vom Block abhob, schaute cremefarbenes Papier hervor.
//
// Jetzt lebt jedes Blatt. Ein Heft mit vierundzwanzig Seiten hat zwoelf —
// das sind zwoelf gebeugte Netze, und die kosten weniger, als sie
// aussehen: eine Knochenkette ist Rechenarbeit, keine Zeichenarbeit.
//
// **Die Bilder bleiben im Fenster.** Was nicht lebt, ist die Textur, nicht
// das Blatt: nur die Seiten um die aufgeschlagene Doppelseite herum tragen
// ihr Bild, alle anderen stehen in Papierfarbe da. Vierundzwanzig Seiten zu
// je 1374 x 2048 waeren im Speicher eine Viertelmilliarde Byte — das killt
// Telefone, und zu sehen waeren sie ohnehin nur als Kante.
//
// **Seitenzaehlung.** Blatt k traegt vorn die Seite 2k+1 und hinten die
// Seite 2k+2 — Blatt 0 also den Umschlag und die zweite Seite. Der Stand
// `stelle` ist die Zahl der umgeschlagenen Blaetter: bei 0 ist das Heft zu
// und der Umschlag vorn, bei 1 steht die Doppelseite 2|3, bei k die
// Doppelseite 2k|2k+1.
//
// Die Blattmechanik selbst kommt aus `seiten-rig.ts` und ist dieselbe wie
// beim aufgeschlagenen Band. Verschieden ist nur, wer die Haltung vorgibt:
// dort ein Fahrplan, hier die Hand.

import * as THREE from 'three';
import { damp, seitenRigBauen, type SeitenRig } from './seiten-rig';

export const magazinForm = {
  /**
   * So viele Blaetter zu jeder Seite tragen ihr Bild. Alle anderen leben
   * zwar, stehen aber in Papierfarbe — als Kante sieht man ihnen das nicht
   * an.
   *
   * **Hier haengt der ganze Grafikspeicher.** Fuenf Blaetter (zwei zu jeder
   * Seite plus das aufgeschlagene) und die beiden aeusseren machen vierzehn
   * Seitenbilder — bei 1374 x 2048 rund 210 MB. Drei waren es einmal; das
   * ging, solange das Heft vierundzwanzig Seiten hatte und das Fenster an
   * den Enden anschlug. Bei sechsundsiebzig steht es immer offen, und aus
   * vierzehn Bildern waeren achtzehn geworden.
   */
  fenster: 2,
  /** Segmente laengs der Wendeachse. */
  segmente: 26,
  /**
   * Dicke eines Blattes in Szeneneinheiten — der Rueckfall, wenn niemand
   * eine mitgibt.
   *
   * Im Regal kommt sie aus dem Heft selbst: die `dicke` im Frontmatter
   * geteilt durch die Zahl der Blaetter. Sonst muesste man zwei Zahlen von
   * Hand zusammenhalten, und beim naechsten Wachsen des Heftes waere der
   * Block in der Leseposition dicker als der Gegenstand im Stapel.
   */
  blattDicke: 0.0022,
  /**
   * **Wie weit das Heft aufgeht.** Fast flach — den Koerper macht jetzt der
   * Bauch am Bund, nicht der Winkel.
   *
   * Hier standen einmal 19 Grad. Das war der Versuch, mit einer Schraeglage
   * zu ersetzen, was der Blattform fehlte: die Blaetter waren ebene
   * Klappen, und zwei ebene Klappen bei 180 Grad sind eine Tafel mit einem
   * Strich in der Mitte. Aufgestellt sahen sie aus wie eine Klappkarte.
   *
   * Seit die Drehung in der Flaeche liegt (`drehungVerteilt`), kommt jedes
   * Blatt senkrecht aus dem Bund und legt sich daneben hin — der Bauch am
   * Bund traegt die Form, und der Winkel darf zurueckgehen. Nachgemessen
   * gegen die Vorlage (Hub ueber der Bundebene, in Seitenbreiten): mit 8
   * Grad und `ruheBogen` -0,24 bleibt der mittlere Abstand ueber elf
   * Messpunkte bei 0,015.
   */
  oeffnung: THREE.MathUtils.degToRad(8),
  /**
   * **Wie weit der Block insgesamt auffaechert** — vom obersten Blatt bis
   * zum untersten, ueber die ganze Dicke. Ein Stapel Blaetter liegt nicht
   * deckungsgleich; aber er faechert um einen festen Betrag und nicht um
   * einen je Blatt.
   *
   * Hier stand einmal ein Winkel **pro Blatt** (0,9 Grad). Das ging,
   * solange das Heft zwoelf Blaetter hatte — zusammen knapp zehn Grad. Bei
   * achtunddreissig Blaettern sind daraus dreiunddreissig geworden: der
   * Block stand auf wie ein Kamm, die unteren Blaetter schwangen weit aus
   * der Bundebene, und von der Seite sah das Heft aus wie eine
   * aufgeblaetterte Muschel. Die Zahl gehoert dem Block, nicht dem Blatt —
   * ein dickeres Heft faechert nicht weiter auf, es faechert bloss feiner.
   */
  faecherGesamt: THREE.MathUtils.degToRad(10),
  /**
   * Wie viel von der Drehung in der Flaeche liegt (`flaechenAnteil` in
   * `seiten-rig.ts`). Der Rest sitzt als Schraeglage im Bund.
   */
  flaechenAnteil: 0.6,
  /**
   * Wie weit die Woelbung ueber die Seite reicht (`innenAnteil` dort). Von
   * Haus aus 31 Prozent — das klebte am Bund.
   */
  innenAnteil: 0.5,
  /**
   * Wie stark die Seite draussen zurueckbiegt (`aussen` in
   * `seiten-rig.ts`). Er ist die Gegenkraft zum Bauch: je weiter der Bauch
   * nach aussen reicht, desto mehr muss zurueckgebogen werden, damit die
   * Seite an der Aussenkante wieder flach liegt.
   */
  aussen: 0.75,
  /** Wie stark sich ein Blatt in der Mitte der Drehung woelbt. */
  bogen: 0.62,
  /** Wie viel Woelbung eine gezogene Ecke hoechstens dazulegt. */
  bogenZug: 0.55,
  /**
   * **Die Woelbung im Stillstand.** Ein aufgeschlagenes Heft liegt nicht
   * flach da: die Seiten stehen unter Spannung, ihre Aussenkanten heben
   * sich vom Bund weg.
   *
   * Sie folgt einem Kosinus ueber den Stand des Blattes: voll auf der einen
   * Ruhelage, null in der Senkrechten, voll und andersherum auf der
   * anderen. So kippt sie mitten im Umschlagen nicht um, sondern geht durch
   * null — genau dort, wo die Woelbung aus der Bewegung ihr Groesstes hat.
   *
   * Sie arbeitet gegen die `oeffnung`: der Winkel kippt die Haelfte weg,
   * dieser Bogen holt ihre Aussenkante wieder herunter. Deshalb gehoeren
   * die beiden Zahlen zusammen und lassen sich nicht einzeln stellen — wer
   * die eine aendert, muss die andere nachziehen.
   */
  ruheBogen: -0.24,
  /** Daempfung im Lauf. */
  lambda: 13,
  /** Und beim Schnappen, wenn die Ecke losgelassen wird. */
  lambdaSchnapp: 22,
  /** Papierton des Heftes — heller als der Buchblock, es ist Neupapier. */
  papier: '#ded9cc',
  /**
   * Der Ruecken. Dunkler als das Papier, aber kein Loch: von hinten ist er
   * die Aussenseite des Heftes und faengt Licht, im Bund ist er der Grund
   * des Tals und liegt im Schatten. Eine Farbe muss fuer beides reichen,
   * also liegt sie dazwischen.
   */
  ruecken: '#7d7669',
  /** Der Schnitt an den Blattkanten. */
  schnitt: '#cfc9b8',
  /**
   * Und der Falz am Bund. Dort ist ein Heft geheftet, nicht geschnitten —
   * man sieht keine Papierkante, man sieht einen Schatten. Mit derselben
   * hellen Kante wie aussen stand dort ein weisser Streifen mitten im
   * Bild: zwoelf Blattkanten uebereinander, alle beleuchtet.
   */
  falz: '#1a1814',
  /**
   * Der Glanz des Papiers. Ein Heft ist auf gestrichenem Papier gedruckt,
   * und gestrichenes Papier hat einen Schimmer — genau der macht aus einer
   * gedrehten Flaeche einen Gegenstand: das Licht wandert darueber,
   * waehrend das Heft sich bewegt.
   */
  rauheit: 0.58,
  lack: 0.34,
  lackRauheit: 0.3,
  /**
   * Wie stark das Papier seine Umgebung aufnimmt. Sparsam: eine Umgebung
   * liefert nicht nur Glanz, sondern auch Grundlicht, und zu viel davon
   * hebt die Schwaerzen — aus einer gedruckten Seite wird eine graue
   * Flaeche.
   */
  umgebung: 0.12,
} as const;

/** Der Stand des Heftes, Bild fuer Bild. */
export type MagazinStand = {
  /** Umgeschlagene Blaetter. 0 ist zu, `blaetter` ist ganz durch. */
  stelle: number;
  /**
   * Das Blatt, das gerade in der Hand liegt. `anteil` ist sein Stand
   * zwischen den beiden Ruhelagen, `bogen` die Woelbung, die die Hand ihm
   * gibt. Ohne Zug ist das `null`.
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
  /**
   * Wie weit sich die ruhende Seite aus der Bundebene hebt. Die Kamera
   * rechnet ihn auf ihre Entfernung drauf: der Bauch steht naeher als die
   * Ebene, auf die eingepasst wird, und naeher heisst im Bild groesser.
   */
  bauch: number;
  setzen: (stand: MagazinStand, delta: number) => void;
  /** Wie viele Seitenbilder gerade im Speicher liegen. */
  texturen: () => number;
  /**
   * Der Stand jedes Blattes, 0 bis 1. Steht in der Diagnose, weil sich
   * sonst nicht pruefen laesst, **ob** ein Blatt umschlaegt oder bloss
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
  /**
   * Wie viele Blaetter zu jeder Seite ihr Bild tragen. Ohne Angabe
   * `magazinForm.fenster`.
   *
   * Auf dem Telefon steht hier weniger. Der Speicher haengt allein an
   * dieser Zahl — nicht an der Seitenzahl des Heftes —, und ein enges
   * Fenster kostet nichts als ein paar Nachladungen mehr beim Blaettern.
   */
  fenster?: number;
  /**
   * Dicke **eines Blattes**. Ohne Angabe `magazinForm.blattDicke`. Wer den
   * Gegenstand kennt, reicht dessen Dicke geteilt durch die Blaetter
   * herein — dann stimmen Stapel und Leseposition ueberein.
   */
  blattDicke?: number;
  /** Die Umgebung, die das Papier spiegelt. */
  umgebung: THREE.Texture | null;
}): MagazinRig {
  const { breite, hoehe, seiten, ordner } = werte;
  const fenster = Math.max(1, Math.round(werte.fenster ?? magazinForm.fenster));
  const blaetter = Math.ceil(seiten / 2);
  const dicke = Math.max(1e-4, werte.blattDicke ?? magazinForm.blattDicke);
  // Der Faecher gehoert dem Block: sein Betrag steht fest, die Blaetter
  // teilen ihn unter sich auf.
  const faecherJeBlatt = magazinForm.faecherGesamt / Math.max(1, blaetter - 1);

  const gruppe = new THREE.Group();
  gruppe.name = 'magazin';

  const muell: Array<{ dispose: () => void }> = [];
  const merken = <T extends { dispose: () => void }>(stueck: T) => {
    muell.push(stueck);
    return stueck;
  };

  /*
   * Der Papierschnitt an den Blattkanten. Nicht eine Flaeche in einer
   * Farbe, sondern feine Linien: ein Buchblock ist ein Stapel Blaetter, und
   * man sieht ihm das an der Kante an. Eine glatte Flaeche liest sich als
   * Plastik.
   */
  const schnittBild = merken(schnittTextur());
  schnittBild.wrapS = THREE.RepeatWrapping;
  schnittBild.wrapT = THREE.RepeatWrapping;
  schnittBild.anisotropy = werte.anisotropie;
  const kantenStoff = merken(
    new THREE.MeshStandardMaterial({
      color: magazinForm.schnitt,
      map: schnittBild,
      roughness: 0.9,
      metalness: 0,
      envMap: werte.umgebung ?? null,
      envMapIntensity: magazinForm.umgebung * 0.6,
    }),
  );
  const falzStoff = merken(
    new THREE.MeshStandardMaterial({
      color: magazinForm.falz,
      roughness: 0.95,
      metalness: 0,
    }),
  );

  /** Vorderseiten der Blaetter (ungerade Seiten). */
  const stoffeVorn: THREE.MeshPhysicalMaterial[] = [];
  /** Rueckseiten (gerade Seiten). */
  const stoffeHinten: THREE.MeshPhysicalMaterial[] = [];

  /*
   * **Beide Seiten `FrontSide`.** Ein Blatt mit Dicke ist ein Quader, und
   * bei einem Quader zeigt jede Flaeche nach aussen: die Rueckseite hat
   * ihre eigene, nach hinten gerichtete Normale. Ein `BackSide`-Material
   * darauf wird weggeschnitten, sobald das Blatt umgeschlagen ist und diese
   * Flaeche zur Kamera zeigt — dann steht dort nichts als Papier.
   */
  const gestrichen = () =>
    merken(
      new THREE.MeshPhysicalMaterial({
        color: magazinForm.papier,
        roughness: magazinForm.rauheit,
        metalness: 0,
        clearcoat: magazinForm.lack,
        clearcoatRoughness: magazinForm.lackRauheit,
        envMap: werte.umgebung ?? null,
        envMapIntensity: magazinForm.umgebung,
        side: THREE.FrontSide,
      }),
    );
  for (let i = 0; i < blaetter; i += 1) {
    stoffeVorn.push(gestrichen());
    stoffeHinten.push(gestrichen());
  }

  const rig: SeitenRig = seitenRigBauen({
    breite,
    hoehe,
    blaetter,
    z: 0,
    blattAbstand: 0,
    // Der Bund liegt im Ursprung: an ihm haengt die ganze Doppelseite, und
    // die Kamera steht mittig darueber.
    bund: 0,
    seite: 1,
    // Ein Blatt hat Dicke, und an seiner Kante sieht man das Papier.
    tiefe: dicke,
    kante: kantenStoff,
    bundKante: falzStoff,
    form: {
      segmente: magazinForm.segmente,
      lambda: magazinForm.lambda,
      /*
       * Der Knick quer zur Wendeachse ist **aus**. Er haengt an der
       * Woelbung, und die ist hier auch im Stillstand da — also lief er
       * staendig mit und legte eine Welle in die Oberkante der Seiten. Eine
       * Seite, die still liegt, hat eine gerade Kante.
       */
      falte: 0,
      // Die Drehung liegt in der Flaeche, nicht im Scharnier — siehe
      // `drehungVerteilt` in `seiten-rig.ts`.
      drehungVerteilt: true,
      flaechenAnteil: magazinForm.flaechenAnteil,
      innenAnteil: magazinForm.innenAnteil,
      aussen: magazinForm.aussen,
    },
    stoff: (i) => [stoffeVorn[i], stoffeHinten[i]],
  });
  gruppe.add(rig.gruppe);

  /*
   * **Der Ruecken.**
   *
   * Zwoelf Blaetter, die alle am selben Strich haengen, sind noch kein
   * Heft — von hinten sah man zwoelf einzelne Kanten und dazwischen den
   * schwarzen Raum. Was fehlte, war das Stueck, das sie zusammenhaelt.
   *
   * Es ist eine halbe Roehre: so breit wie der Block dick ist, so hoch wie
   * die Seiten, und **nur die hintere Haelfte** (`thetaStart` Pi/2, Laenge
   * Pi — bei three.js liegt Theta null auf +z). Die vordere Haelfte waere
   * ein Wulst zwischen den beiden offenen Seiten; dort ist nichts.
   *
   * Der Halbmesser ist die halbe Blockdicke: die aeussersten Blaetter
   * liegen damit genau auf der Roehre und kommen tangential aus ihr heraus,
   * statt sie zu durchstossen. Beides zusammen — die Drehung in der Flaeche
   * und dieser Bogen darunter — ist der Grund, warum das Heft jetzt aus dem
   * Bund waechst und nicht mehr geknickt dasteht.
   */
  const rueckenHalb = ((blaetter - 1) * dicke) / 2;
  const rueckenStoff = merken(
    new THREE.MeshPhysicalMaterial({
      color: magazinForm.ruecken,
      roughness: 0.86,
      metalness: 0,
      clearcoat: magazinForm.lack * 0.5,
      clearcoatRoughness: magazinForm.lackRauheit,
      envMap: werte.umgebung ?? null,
      envMapIntensity: magazinForm.umgebung,
      side: THREE.DoubleSide,
    }),
  );
  const rueckenForm = merken(
    new THREE.CylinderGeometry(
      rueckenHalb,
      rueckenHalb,
      hoehe,
      20,
      1,
      true,
      Math.PI * 0.5,
      Math.PI,
    ),
  );
  const ruecken = new THREE.Mesh(rueckenForm, rueckenStoff);
  ruecken.name = 'heft-ruecken';
  gruppe.add(ruecken);

  // --- Der Texturvorrat -----------------------------------------------------
  const lader = new THREE.TextureLoader();
  const vorrat = new Map<number, THREE.Texture>();

  function seitenTextur(nummer: number): THREE.Texture | null {
    if (nummer < 1 || nummer > seiten) return null;
    const da = vorrat.get(nummer);
    if (da) return da;
    const pfad = `${ordner}/${String(nummer).padStart(4, '0')}.webp`;
    const textur = lader.load(pfad);
    textur.colorSpace = THREE.SRGBColorSpace;
    textur.anisotropy = werte.anisotropie;
    textur.generateMipmaps = true;
    textur.minFilter = THREE.LinearMipmapLinearFilter;
    vorrat.set(nummer, textur);
    return textur;
  }

  let fensterVon = Number.NaN;

  /**
   * Schiebt das Bilderfenster auf `stelle` und gibt frei, was herausgefallen
   * ist. Die Blaetter selbst bleiben, wo sie sind — nur ihre Bilder wandern.
   */
  function fensterSetzen(stelle: number) {
    const von = stelle - fenster;
    if (von === fensterVon) return;
    fensterVon = von;

    const gebraucht = new Set<number>();
    for (let blatt = 0; blatt < blaetter; blatt += 1) {
      /*
       * Das erste und das letzte Blatt tragen ihr Bild **immer**: aussen
       * liegen der Umschlag und die Rueckseite, und die sieht man, sobald
       * jemand das Heft herumdreht. Ein cremefarbenes Rechteck an dieser
       * Stelle saehe nach Fehler aus. Zwei Bilder, mehr kostet es nicht.
       */
      const aussen = blatt === 0 || blatt === blaetter - 1;
      const im =
        aussen || (blatt >= von && blatt < von + fenster * 2 + 1);
      const vorn = blatt * 2 + 1;
      const hinten = blatt * 2 + 2;
      const texturVorn = im ? seitenTextur(vorn) : null;
      const texturHinten = im ? seitenTextur(hinten) : null;
      if (texturVorn) gebraucht.add(vorn);
      if (texturHinten) gebraucht.add(hinten);
      if (stoffeVorn[blatt].map !== texturVorn) {
        stoffeVorn[blatt].map = texturVorn;
        stoffeVorn[blatt].needsUpdate = true;
      }
      if (stoffeHinten[blatt].map !== texturHinten) {
        stoffeHinten[blatt].map = texturHinten;
        stoffeHinten[blatt].needsUpdate = true;
      }
    }

    for (const [nummer, textur] of vorrat) {
      if (gebraucht.has(nummer)) continue;
      textur.dispose();
      vorrat.delete(nummer);
    }
  }

  // --- Der Stand ------------------------------------------------------------
  //
  // Der Stand gehoert dem Blatt: jedes traegt seinen eigenen, gedaempft.
  // Daraus wird auch die **Woelbung** gerechnet und nicht aus dem Ziel — aus
  // dem Ziel waere sie im selben Bild, in dem der Befehl kommt, schon wieder
  // null, und das Blatt drehte sich starr wie eine Klappe.
  const staende = new Array<number>(blaetter).fill(0);
  let ersterLauf = true;

  function setzen(stand: MagazinStand, delta: number) {
    const stelle = THREE.MathUtils.clamp(stand.stelle, 0, blaetter);
    fensterSetzen(stelle);
    // Die Mitte des Blocks in der Tiefe — siehe unten, wo sie abgezogen wird.
    const blockMitte = ((2 * stelle - blaetter + 1) / 2) * dicke;

    const schritt = stand.ohneBewegung ? 1 : delta;
    const lambda = stand.schnapp
      ? magazinForm.lambdaSchnapp
      : magazinForm.lambda;

    for (let blatt = 0; blatt < blaetter; blatt += 1) {
      const gezogen = stand.zug?.blatt === blatt ? stand.zug : null;
      const ziel = gezogen ? gezogen.anteil : blatt < stelle ? 1 : 0;

      let anteil: number;
      if (gezogen || stand.ohneBewegung || ersterLauf) {
        anteil = ziel;
      } else {
        anteil = damp(staende[blatt], ziel, lambda, schritt);
      }
      staende[blatt] = anteil;

      const ruhe = magazinForm.ruheBogen * Math.cos(Math.PI * anteil);
      const bogen = stand.ohneBewegung
        ? ruhe
        : ruhe +
          (gezogen
            ? gezogen.bogen
            : rig.bogenAusZeit(anteil, magazinForm.bogen));

      /*
       * Die Ruhelage ist nicht flach.
       *
       * Ein aufgeschlagenes Heft steht in einem stumpfen Winkel: der Bund
       * ist ein Tal, die beiden Haelften lehnen sich zurueck. Dazu der
       * Faecher — jedes Blatt steht ein Stueck weiter offen als das
       * darunter, sonst sind zwoelf Blaetter eine Platte.
       */
      const links = anteil >= 0.5;
      const rang = Math.max(0, links ? stelle - 1 - blatt : blatt - stelle);
      const offen = magazinForm.oeffnung + faecherJeBlatt * rang;
      const faecher = links ? -offen : offen;

      rig.haltungSetzen(blatt, { anteil, bogen, faecher }, schritt);

      /*
       * Und die Hoehe im Stapel. Von der aufgeschlagenen Stelle aus
       * gerechnet: was schon umgeschlagen ist, liegt darueber, was noch
       * kommt, darunter. Ein Blatt in Bewegung liegt ueber allem — es
       * gehoert in diesem Augenblick zu keiner von beiden Haelften.
       */
      const inBewegung = anteil > 0.002 && anteil < 0.998;
      const hoehe0 = inBewegung
        ? (stelle + 1.5) * dicke
        : links
          ? (blatt + 1) * dicke
          : (stelle - blatt) * dicke;
      /*
       * Und dann der ganze Block zurueck in die Mitte. Die Formeln oben
       * zaehlen von der aufgeschlagenen Stelle aus, und deren Nullpunkt
       * wandert beim Blaettern: vorn liegt fast alles rechts (unter null),
       * hinten fast alles links (ueber null). Der Block waere damit im
       * Verlauf des Heftes um seine ganze Dicke auf die Kamera zugerueckt.
       * Ein Heft wird beim Blaettern nicht dicker und ruecht auch nicht
       * naeher; nur die Blaetter wechseln die Seite. Seit der Ruecken da
       * ist, faellt es ausserdem sofort auf — er steht fest, der Block
       * wanderte an ihm vorbei.
       */
      rig.blaetter[blatt].netz.position.z = hoehe0 - blockMitte;
    }
    ersterLauf = false;
  }

  function entsorgen() {
    rig.entsorgen();
    gruppe.removeFromParent();
    vorrat.forEach((textur) => textur.dispose());
    vorrat.clear();
    muell.forEach((stueck) => stueck.dispose());
    muell.length = 0;
  }

  // Der zugeschlagene Stand, bevor das erste Bild gezeichnet wird.
  setzen({ stelle: 0, zug: null, schnapp: false, ohneBewegung: true }, 1);

  /*
   * Wie breit die Doppelseite **im Bild** ist: nicht zwei Papierbreiten,
   * sondern zweimal die Reichweite eines ruhenden Blattes. Der Bauch am
   * Bund frisst rund ein Sechstel der Breite; mit der Papierbreite
   * gerechnet stuende das Heft entsprechend zu klein im Fenster.
   */
  const ruhelage = rig.spanne({
    anteil: 0,
    bogen: magazinForm.ruheBogen,
    faecher: magazinForm.oeffnung,
  });
  const reichweite = Math.abs(ruhelage.x);

  return {
    gruppe,
    blaetter,
    halbeBreite: reichweite,
    halbeHoehe: hoehe * 0.5,
    bauch: ruhelage.bauch,
    setzen,
    texturen: () => vorrat.size,
    staende: () =>
      staende.map((anteil, blatt) => ({
        blatt,
        anteil: Number(anteil.toFixed(3)),
      })),
    entsorgen,
  };
}

/**
 * Der Papierschnitt als Bild: feine, ungleich helle Linien quer zur
 * Blattrichtung. Aus der Naehe sind es einzelne Blaetter, von weitem ein
 * Grau mit Struktur — und genau das unterscheidet einen Buchblock von einem
 * lackierten Klotz.
 */
function schnittTextur(): THREE.CanvasTexture {
  const hoehe = 256;
  const leinwand = document.createElement('canvas');
  leinwand.width = 8;
  leinwand.height = hoehe;
  const stift = leinwand.getContext('2d');
  if (stift) {
    stift.fillStyle = '#ffffff';
    stift.fillRect(0, 0, 8, hoehe);
    // Ein fester Wuerfel: derselbe Schnitt bei jedem Aufschlagen.
    let saat = 7;
    const wurf = () => {
      saat = (saat * 9301 + 49297) % 233280;
      return saat / 233280;
    };
    for (let y = 0; y < hoehe; y += 2) {
      const dunkel = 0.72 + wurf() * 0.28;
      stift.fillStyle = `rgba(0,0,0,${(1 - dunkel) * 0.9})`;
      stift.fillRect(0, y, 8, 1);
    }
  }
  const textur = new THREE.CanvasTexture(leinwand);
  textur.colorSpace = THREE.SRGBColorSpace;
  return textur;
}
