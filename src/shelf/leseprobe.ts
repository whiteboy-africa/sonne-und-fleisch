// Der aufgeschlagene Band.
//
// Gelesen wird nicht in der Szene, sondern im Dokument: 3D traegt die
// Anfahrt, und genau dort, wo Text auf einer Textur unscharf wuerde, kommt
// die scharfe HTML-Doppelseite darueber. Diese Datei ist die Papierhaelfte
// davon — sie baut die Seiten, blaettert, faengt die Tasten und schliesst
// wieder zu. Die Anfahrt selbst steht in `ShelfEngine.ts`.
//
// Eine Regel traegt das Ganze: **was geschwaerzt ist, existiert hier
// nicht.** Die Balken sind leere Elemente, die schwarzen Seiten enthalten
// keinen Text. Wer den Quelltext liest, liest nichts, was das Buch nicht
// hergibt.

import type { BookExcerpt, CatalogBook, ExcerptPart } from './katalog';
import { balkenLage, balkenMuster } from './schwaerzung';
import {
  abdruckBild,
  abdruckVerhaeltnis,
  stempelAbdruck,
  stempelSaat,
} from './stempel';
import { siteConfig } from './verlag-config';

/**
 * Was von der Seite gebraucht wird, die gerade vorn liegt. Ein Wendeband
 * hat zwei davon; ein gewoehnlicher Band ist selbst seine erste Seite.
 */
export type Seitendaten = {
  title: string;
  shortTitle: string;
  /** Steht als laufender Titel auf der linken Seite. */
  author: string;
  accent: string;
  cover: string;
  excerpt?: BookExcerpt;
};

/*
 * Wie viele geschwaerzte Seiten hinter dem Fenster liegen. Vier, und daraus
 * werden mit dem Fenster und der Schlussseite genau **drei Doppelseiten**:
 * das Fenster (links die Probe, rechts geschwaerzt), eine ganz geschwaerzte
 * Doppelseite, und die Schlussdoppelseite (links geschwaerzt, rechts die
 * Seite mit der ausgestanzten Zeile). Mehr waren es einmal, und dann sah man beim
 * Blaettern fast nur noch Schwarz — der Entzug wirkt, wenn er einmal
 * dasteht, nicht wenn man sich durch ihn hindurchklickt.
 */
const schwarzeSeiten = 4;

/** Ab hier wird einzeln geblaettert statt in Doppelseiten. */
const handyBreite = 768;

/**
 * Die Uebergabe zwischen Szene und Dokument. Kurz genug, dass sie als ein
 * Bild durchgeht, lang genug, dass nichts springt.
 */
const uebergabeZeit = 120;

/**
 * Wie lange ein Blatt zum Umschlagen braucht. Laenger als der frueher hier
 * stehende harte Schnitt (120 ms), weil ein Blatt eine Bewegung ist und
 * kein Wechsel — aber kurz genug, dass schnelles Blaettern nicht wartet.
 */
const wendeZeit = 440;

/**
 * Wie weit sich das Blatt beim Umschlagen aus der Ebene neigt — die freie
 * Ecke kommt der Kamera entgegen, wie bei Papier, das man anhebt.
 *
 * Hier stand einmal eine Kette aus acht ineinandersteckenden Gliedern, die
 * sich wirklich bog, wie die Knochenkette im Blaetter-Rig. In Standbildern
 * sah sie richtig aus und in Bewegung falsch: eine lebende Seite laesst
 * sich in CSS nur biegen, indem man sie in Streifen schneidet, und
 * geschnittene Kanten zeichnen sich beim Drehen als Naehte ab — auch mit
 * Ueberlappung, weil jede Streifenkante einzeln geglaettet wird. Ein Blatt
 * aus einem Stueck hat keine Naht; die Natuerlichkeit kommt stattdessen
 * aus Neigung, Hub und dem Licht, das ueber die Seite laeuft.
 */
const wendeNeigung = 7;
/** Wie weit das Blatt sich dabei aus der Seite hebt. */
const wendeHub = 40;

/** So weit laesst sich die Seite vergroessern. */
const lupeGrenze = 4;
/** Ein Doppelklick geht auf diese Stufe — und wieder zurueck. */
const lupeStufe = 2.4;

/**
 * Wie breit die Blaetterzone an jeder Aussenkante ist, als Anteil der
 * Rahmenbreite. Die Mitte bleibt frei.
 *
 * Auf dem Telefon stand hier 0,5 — die ganze Seite war Blaetterzone, links
 * zurueck, rechts vor. Das ging, solange der Finger nichts anderes zu
 * sagen hatte. Mit dem Doppeltipp geht es nicht mehr: **zwei Gesten
 * koennen nicht dieselbe Flaeche haben.** Ein Tipp, der umschlaegt, und
 * ein Tipp, der vergroessert, sind an derselben Stelle nicht zu
 * unterscheiden — der erste Tipp haette die Seite schon umgeschlagen,
 * bevor der zweite ankommt.
 *
 * Also dieselbe Aufteilung wie am Schreibtisch: aussen wird geblaettert,
 * in der Mitte wird vergroessert. Ein Drittel sind auf 375 Bildpunkten
 * noch 127 — bequem fuer einen Daumen.
 */
const blaetterKante = 0.34;

/** Zwei Tipper gelten als Doppeltipp, wenn sie so dicht beieinander liegen. */
const doppelTippZeit = 300;
const doppelTippWeg = 34;

/*
 * Zeilen auf einer ganz geschwaerzten Seite. Grosszuegig gerechnet: nach
 * dem Setzen wird auf ganze Zeilen gekuerzt (`zeilenKuerzen`), damit unten
 * keine angeschnittene stehenbleibt. Wie viele hineinpassen, haengt vom
 * Fenster ab — auf dem Telefon sind es mehr als am Schreibtisch.
 */
const balkenZeilen = 34;

/** Wo die aufgeschlagene Doppelseite in der Szene steht, im Fenster. */
export type Rahmen = {
  links: number;
  oben: number;
  breite: number;
  hoehe: number;
};

export type LeseprobeHaken = {
  /**
   * Die Anfahrt in 3D. Ruft `uebergabe`, sobald der Band so weit offen ist,
   * dass die Doppelseite uebernehmen soll — von da an liest man HTML.
   */
  anfahren: (uebergabe: () => void, fertig: () => void) => void;
  /**
   * Wo die Doppelseite in der Szene gerade steht. Danach richtet sich die
   * Doppelseite im Dokument aus, bevor sie sichtbar wird.
   */
  rahmen: () => Rahmen | null;
  /** Der Rueckweg zum stehenden Band. */
  zurueckfahren: (fertig: () => void) => void;
  /** Meldung fuer Vorlesegeraete. */
  melden: (text: string) => void;
};

type Seitenart =
  | { art: 'fenster'; nummer: number; probe: BookExcerpt }
  | { art: 'schwarz'; nummer: number; bild?: string }
  | { art: 'schluss'; nummer: number; bild?: string };

/**
 * Eine Seite ist entweder das Fenster, eine geschwaerzte Seite oder die
 * Schlusstafel. Mehr Zustaende hat der Band nicht.
 */
function seitenFolge(probe: BookExcerpt): Seitenart[] {
  const folge: Seitenart[] = [
    { art: 'fenster', nummer: probe.page, probe },
  ];
  for (let i = 1; i <= schwarzeSeiten; i += 1) {
    // Liegt die echte Seite geschwaerzt vor, wird sie gezeigt; sonst
    // zeichnet die Seite ihre Balken selbst.
    const echt = probe.blackImages?.[i - 1];
    folge.push({
      art: 'schwarz',
      nummer: probe.page + i,
      ...(echt ? { bild: echt } : {}),
    });
  }
  folge.push({
    art: 'schluss',
    nummer: probe.page + schwarzeSeiten + 1,
    ...(probe.closingImage ? { bild: probe.closingImage } : {}),
  });
  return folge;
}

/** Wie in `mount.ts`: fehlt die Huelle, ist die Seite kaputt, nicht leer. */
function noetig<T extends Element>(wurzel: ParentNode, wahl: string): T {
  const element = wurzel.querySelector<T>(wahl);
  if (!element) throw new Error(`Leseprobe: Element fehlt — ${wahl}`);
  return element;
}

export function leseprobeAnhaengen(wurzel: HTMLElement, haken: LeseprobeHaken) {
  const schale = noetig<HTMLElement>(wurzel, '[data-leseprobe]');
  const band = noetig<HTMLElement>(wurzel, '[data-leseprobe-band]');
  const rahmen = noetig<HTMLElement>(wurzel, '[data-leseprobe-rahmen]');
  const spanne = noetig<HTMLElement>(wurzel, '[data-leseprobe-spanne]');
  const grund = noetig<HTMLElement>(wurzel, '[data-leseprobe-grund]');
  const zuKnopf = noetig<HTMLButtonElement>(wurzel, '[data-leseprobe-zu]');

  let offen = false;
  /** Waehrend Anfahrt und Rueckweg: die Bedienung ruht. */
  let inBewegung = false;
  let folge: Seitenart[] = [];
  let stelle = 0;
  let ausloeser: HTMLElement | null = null;
  let eigenerSchritt = false;
  let radKonto = 0;
  let radSperre = 0;
  let radZuletzt = 0;

  // --- Die Lupe ------------------------------------------------------------
  //
  // Eine echte Buchseite auf einem Schirm ist klein: 7,81 Zoll Hoehe auf
  // 590 Pixel ergibt eben eine kleine Schrift. Statt zwischen „echter Satz"
  // und „lesbar" zu waehlen, darf man hineingehen — mit zwei Fingern, und
  // am Schreibtisch mit Strg und dem Rad (so kommt auch das Kneifen auf dem
  // Trackpad an) oder mit einem Doppelklick.
  let lupe = 1;
  let lupeX = 0;
  let lupeY = 0;
  /** Zeiger, die gerade auf der Seite liegen — fuer das Kneifen. */
  const finger = new Map<number, { x: number; y: number }>();
  let kneifAbstand = 0;
  let kneifLupe = 1;
  let schiebtVon: { x: number; y: number; lx: number; ly: number } | null = null;
  let gezogen = 0;
  /**
   * Der letzte Tipp mit dem Finger. Ein Doppeltipp wird hier selbst
   * gezaehlt und nicht dem `dblclick` des Browsers ueberlassen: auf
   * Fingergeraeten haengt der davon ab, ob der Browser das Tippen nicht
   * schon fuer seinen eigenen Zoom verbraucht hat.
   */
  let letzterTipp: { zeit: number; x: number; y: number } | null = null;
  /** Womit zuletzt angefasst wurde — Finger oder Maus. */
  let letzterZeigerTyp = 'mouse';
  /** Das Blatt, das gerade umschlaegt — hoechstens eines. */
  let wender: HTMLElement | null = null;

  /*
   * **Auf dem Telefon steht dieselbe Doppelseite wie am Schreibtisch.**
   *
   * Hier stand die Abfrage nach Schirmbreite und Fingergeraet, und darunter
   * wurde einzeln geblaettert: eine Seite so hoch wie das Geraet, getippt
   * auf die linke oder rechte Haelfte. Das war als Zugestaendnis an den
   * kleinen Schirm gedacht und nahm ihm das Buch: man stand mitten in
   * einer Seite, ohne je den Band gesehen zu haben, und der Satz war
   * vorgezoomt, statt dass man selbst hineingeht.
   *
   * Jetzt liegt der Band auch in der Hand aufgeschlagen da — beide Seiten,
   * klein, und man zieht sich heran, was man lesen will. Dafuer ist die
   * Lupe da (Kneifen, Doppeltipp in der Mitte, Schieben mit einem Finger).
   *
   * Der Weg zurueck steht noch: `handyBreite` und alles, was an
   * `--einzeln` haengt, ist unangetastet. Wer die Einzelseite wieder will,
   * gibt hier die Medienabfrage zurueck und nimmt in `leseprobe.css` die
   * Einrueckung des Telefonblocks wieder heraus.
   */
  const einzeln = () => false;

  const wenigerBewegung = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- Seiten

  /**
   * Die Kolumne, wie im gedruckten Band: **links der Autor, rechts der
   * Titel** — und die Ziffer jeweils aussen. So steht es in Yellow Fever,
   * und so steht es hier auch, wo die Seite nachgebaut ist.
   */
  function kolumne(nummer: number, rechts: boolean) {
    const kopf = document.createElement('p');
    kopf.className = 'blatt__kolumne';
    const name = document.createElement('span');
    name.className = 'blatt__laufender';
    name.textContent = rechts ? aktuellerTitel : aktuellerAutor;
    const zahl = document.createElement('span');
    zahl.className = 'blatt__zahl';
    zahl.textContent = String(nummer);
    // Die Buchhaltung ueberlebt, auch wo der Inhalt entzogen ist: erst die
    // Zahl, dann der Titel — oder umgekehrt, je nach Seite.
    kopf.append(...(rechts ? [name, zahl] : [zahl, name]));
    return kopf;
  }

  function stueckAnhaengen(absatz: HTMLElement, stueck: ExcerptPart, saat: number) {
    if ('text' in stueck) {
      absatz.append(document.createTextNode(stueck.text));
      return;
    }
    // Der Balken ist ein Loch, keine Farbe: er hat die Tiefe des Raums
    // hinter der Seite, nicht die Schwaerze einer Druckfarbe.
    const balken = document.createElement('span');
    const lage = balkenLage(saat);
    balken.className = `balken${stueck.last ? ' balken--schluss' : ''}`;
    balken.style.setProperty('--zeichen', String(stueck.bar));
    balken.style.setProperty('--dreh', `${lage.dreh.toFixed(3)}deg`);
    balken.style.setProperty('--ueberhang', `${lage.ueberhang.toFixed(3)}em`);
    balken.setAttribute('aria-label', 'geschwärzt');
    absatz.append(balken);
  }

  function fensterBlatt(
    titel: string,
    seite: Seitenart & { art: 'fenster' },
    rechts: boolean,
  ) {
    const blatt = document.createElement('article');

    // Liegt die echte Seite als Bild vor, ist alles schon drauf: Kolumne,
    // Umbruch, Schwaerzungen. Wir legen nichts darueber — das waere ein
    // zweiter Satz ueber dem ersten.
    if (seite.probe.image) {
      blatt.className = 'blatt blatt--fenster blatt--bild';
      const bild = document.createElement('img');
      bild.className = 'blatt__bild';
      bild.src = seite.probe.image;
      bild.alt = `Leseprobe aus ${titel}, Seite ${seite.nummer}`;
      bild.decoding = 'async';
      blatt.append(bild);
      return blatt;
    }

    blatt.className = 'blatt blatt--fenster';
    blatt.append(kolumne(seite.nummer, rechts));

    const satz = document.createElement('div');
    satz.className = 'blatt__satz';
    seite.probe.paragraphs.forEach((stuecke, index) => {
      const absatz = document.createElement('p');
      const letzter = index === seite.probe.paragraphs.length - 1;
      absatz.className = `blatt__absatz${letzter ? ' blatt__absatz--abbruch' : ''}`;
      stuecke.forEach((stueck, stelle) =>
        stueckAnhaengen(absatz, stueck, seite.nummer * 31 + index * 7 + stelle),
      );
      satz.append(absatz);
    });
    blatt.append(satz);
    return blatt;
  }

  function schwarzBlatt(
    titel: string,
    seite: Seitenart & { art: 'schwarz' },
    rechts: boolean,
  ) {
    const blatt = document.createElement('article');
    // Kein Text, nur Balken. Vorlesegeraete bekommen den einen Satz, der
    // hier zu sagen ist.
    blatt.setAttribute('aria-label', 'Seite geschwärzt');

    // Die echte Seite, schon beim Ausspielen geschwaerzt: die Balken sitzen
    // auf den Zeilen des Buches, die Kolumne steht noch, und unter den
    // Balken ist nichts mehr — auch nicht im Bild.
    if (seite.bild) {
      blatt.className = 'blatt blatt--schwarz blatt--bild';
      const bild = document.createElement('img');
      bild.className = 'blatt__bild';
      bild.src = seite.bild;
      bild.alt = '';
      bild.decoding = 'async';
      blatt.append(bild);
      return blatt;
    }

    blatt.className = 'blatt blatt--schwarz';
    blatt.append(kolumne(seite.nummer, rechts));

    const satz = document.createElement('div');
    satz.className = 'blatt__satz blatt__satz--voll';
    satz.setAttribute('aria-hidden', 'true');
    balkenMuster(seite.nummer, balkenZeilen).forEach((muster, index) => {
      const zeile = document.createElement('span');
      zeile.className = `balken-zeile${muster.einzug ? ' balken-zeile--einzug' : ''}`;
      zeile.style.setProperty('--breite', `${(muster.breite * 100).toFixed(1)}%`);
      muster.stuecke.forEach((gewicht, stelle) => {
        const lage = balkenLage(seite.nummer * 97 + index * 5 + stelle);
        const stueck = document.createElement('span');
        stueck.className = 'balken balken--stueck';
        stueck.style.setProperty('--gewicht', gewicht.toFixed(3));
        stueck.style.setProperty('--dreh', `${lage.dreh.toFixed(3)}deg`);
        zeile.append(stueck);
      });
      satz.append(zeile);
    });
    blatt.append(satz);
    return blatt;
  }

  /**
   * Die letzte Seite ist keine Tafel, sondern **eine Seite des Buches**.
   *
   * Hier stand einmal eine leere, cremefarbene Flaeche mit zwei Zeilen in
   * der Mitte — und damit brach das Buch an seiner wichtigsten Stelle die
   * eigene Regel: alles davor war Satz, Kolumne, Schwaerzung. Jetzt laufen
   * Kolumne, Seitenzahl und Balken weiter, und in den Balkenblock ist ein
   * sauberes Rechteck gestanzt: die Balken hoeren darueber auf und fangen
   * darunter wieder an. In der Stanze steht der Abdruck.
   *
   * Das ist der Stempel des Zensors auf der geschwaerzten Seite — nicht
   * ein Werbeschild, das man dahinter geklebt hat.
   */
  function schlussBlatt(
    buch: CatalogBook,
    seite: Seitenart & { art: 'schluss' },
    rechts: boolean,
  ) {
    const blatt = document.createElement('article');
    blatt.className = 'blatt blatt--schwarz blatt--schluss';

    /*
     * **Die echte Schlussseite.**
     *
     * Liegt sie vor, wird nichts gezeichnet: das Bild ist die Seite, samt
     * Kolumne, Zeilenfall und Schwaerzung aus dem Druck. In seiner Mitte
     * ist beim Ausspielen eine Zone ausgespart (`--stanze`), und genau
     * darueber legt sich der Stempel.
     *
     * Ohne sie faellt die Seite auf den Nachbau zurueck. Das faellt auf,
     * sobald die Seiten davor echt sind — andere Schrift, anderes Papier,
     * anderer Zeilenfall.
     */
    if (seite.bild) {
      blatt.classList.add('blatt--bild');
      const bild = document.createElement('img');
      bild.className = 'blatt__bild';
      bild.src = seite.bild;
      bild.alt = '';
      bild.decoding = 'async';
      blatt.append(bild, stanze());
      return blatt;
    }

    blatt.append(kolumne(seite.nummer, rechts));

    const satz = document.createElement('div');
    satz.className = 'blatt__satz blatt__satz--voll';

    /*
     * Wo die Stanze sitzt: nach gut einem Drittel der Zeilen. Der Block
     * darueber traegt genug Balken, dass die Seite als geschwaerzte Seite
     * gelesen wird, bevor das Loch kommt.
     */
    const stanzeNach = Math.round(balkenZeilen * 0.38);
    const zeilen = balkenMuster(seite.nummer, balkenZeilen);
    zeilen.forEach((muster, index) => {
      const zeile = document.createElement('span');
      zeile.className = `balken-zeile${muster.einzug ? ' balken-zeile--einzug' : ''}`;
      zeile.setAttribute('aria-hidden', 'true');
      zeile.style.setProperty('--breite', `${(muster.breite * 100).toFixed(1)}%`);
      muster.stuecke.forEach((gewicht, stelle) => {
        const lage = balkenLage(seite.nummer * 97 + index * 5 + stelle);
        const stueck = document.createElement('span');
        stueck.className = 'balken balken--stueck';
        stueck.style.setProperty('--gewicht', gewicht.toFixed(3));
        stueck.style.setProperty('--dreh', `${lage.dreh.toFixed(3)}deg`);
        zeile.append(stueck);
      });
      satz.append(zeile);
      if (index === stanzeNach - 1) satz.append(stanze());
    });
    blatt.append(satz);
    return blatt;

    /**
     * In der Stanze stehen zwei Dinge, und beide fuehren an dieselbe
     * Stelle: **ein Abdruck** und **eine Zeile**.
     *
     * Der Abdruck ist der Gegenstand — Gummi auf Papier, schief
     * aufgesetzt, mit Aussetzern (`stempel.ts`). Er sagt, was mit dem
     * Buch ist: weiter nur auf Papier. Die Zeile darunter ist die
     * Bedienung und traegt keinen Ton: klein, grau, einzeilig.
     *
     * **Keine Ziffern.** Hier stand einmal „Weiter nur im Band — 224
     * Seiten"; eine Zahl an dieser Stelle ist eine Auskunft, und
     * Auskuenfte gibt diese Seite nicht. Gezaehlt wird auf dieser Seite
     * nur, was zur Buchhaltung gehoert: die Seitenzahl in der Kolumne.
     */
    function stanze() {
      const tafel = document.createElement('div');
      // Ueber einem echten Blatt schwebt sie in der ausgesparten Zone,
      // im Nachbau ersetzt sie zwei bis drei Balkenzeilen.
      tafel.className = seite.bild
        ? 'blatt__stanze blatt__stanze--auf-bild'
        : 'blatt__stanze';

      // Lieferbar heisst: es gibt etwas zu kaufen. Sonst wird vorgemerkt —
      // ein Postfach ist der einzige Weg, der von hier aus offen steht.
      const lieferbar = buch.availability === 'Verfügbar' && Boolean(buch.orderUrl);
      const adresse = lieferbar
        ? (buch.orderUrl as string)
        : `mailto:${siteConfig.vormerkenAdresse}?subject=${encodeURIComponent(
            `Vormerken — ${buch.title}`,
          )}`;

      const abdruck = stempelAbdruck(stempelSaat(buch.title));
      const stempel = document.createElement('a');
      stempel.className = 'blatt__stempel';
      stempel.href = adresse;
      // Der Abdruck ist ein Gegenstand, keine zweite Schaltflaeche: die
      // Zeile darunter fuehrt an dieselbe Stelle und steht in der
      // Tastenfolge. Zweimal hintereinander dasselbe Ziel anzuspringen
      // waere ein Weg zu viel — dieselbe Regel wie beim Umschlag.
      stempel.tabIndex = -1;
      // Gelesen wird der Wortlaut aus dem Bild — fuer Vorlesegeraete
      // muss er trotzdem irgendwo stehen.
      stempel.setAttribute('aria-label', 'Nur auf Papier');
      stempel.style.setProperty('--dreh', `${abdruck.dreh.toFixed(2)}deg`);
      stempel.style.setProperty('--tinte', abdruck.tinte);
      stempel.style.setProperty('--tinte-druck', abdruck.tinteGedrueckt);
      stempel.style.setProperty('--abdruck', `url("${abdruckBild}")`);
      stempel.style.setProperty('--abdruck-verhaeltnis', abdruckVerhaeltnis.toFixed(4));

      const ziel = document.createElement('a');
      ziel.className = 'blatt__vormerken';
      ziel.href = adresse;
      ziel.textContent = lieferbar ? 'Bestellen' : 'Vormerken';
      const pfeil = document.createElement('span');
      pfeil.setAttribute('aria-hidden', 'true');
      pfeil.textContent = '↗';
      ziel.append(' ', pfeil);

      tafel.append(stempel, ziel);
      return tafel;
    }
  }

  function blattBauen(seite: Seitenart, titel: string, buch: CatalogBook, rechts: boolean) {
    if (seite.art === 'fenster') return fensterBlatt(titel, seite, rechts);
    if (seite.art === 'schwarz') return schwarzBlatt(titel, seite, rechts);
    return schlussBlatt(buch, seite, rechts);
  }

  // -------------------------------------------------------------- Blaettern

  let aktuellesBuch: CatalogBook | null = null;
  let aktuellerTitel = '';
  let aktuellerAutor = '';

  function zeigen() {
    if (!aktuellesBuch) return;
    const solo = einzeln();
    spanne.classList.toggle('leseprobe__spanne--einzeln', solo);
    rahmen.classList.toggle('leseprobe__rahmen--einzeln', solo);
    spanne.replaceChildren();

    if (solo) {
      const seite = folge[stelle];
      // Eine **echte gesetzte Seite** bringt ihre Raender selbst mit. Der
      // Rahmen des Telefons hat aber die Masse des Geraets, nicht die des
      // Buches — und ein Bild, das darin nicht aufgeht, wird eingepasst und
      // bekommt ringsum Papier. Das las sich als zweiter Rand um die
      // Raender, die im Scan schon stehen. Traegt die Seite ein Bild,
      // nimmt der Rahmen deshalb das Format des Buches an.
      rahmen.classList.toggle(
        'leseprobe__rahmen--scan',
        (seite?.art === 'fenster' && Boolean(seite.probe.image)) ||
          (seite?.art === 'schwarz' && Boolean(seite.bild)),
      );
      spanne.append(blattBauen(seite, aktuellerTitel, aktuellesBuch, false));
    } else {
      rahmen.classList.remove('leseprobe__rahmen--scan');
      const links = folge[stelle * 2];
      const rechts = folge[stelle * 2 + 1];
      /*
       * Kein Sonderfall mehr: die Schlussdoppelseite ist eine Doppelseite
       * wie die anderen — links geschwaerzt, rechts die Seite mit der
       * Stanze. Frueher nahm die Tafel die ganze Spanne und war das
       * einzige, was im ganzen Band nicht nach Buch aussah.
       */
      spanne.classList.remove('leseprobe__spanne--tafel');
      rahmen.classList.remove('leseprobe__rahmen--tafel');
      if (links) spanne.append(blattBauen(links, aktuellerTitel, aktuellesBuch, false));
      if (rechts) spanne.append(blattBauen(rechts, aktuellerTitel, aktuellesBuch, true));
    }
    zeilenKuerzen();
    schale.classList.toggle('ist-am-anfang', stelle === 0);
    // `zeigen()` baut die Spanne neu — ein Blatt von vorher gehoert weg.
    schale.classList.toggle('ist-am-ende', stelle >= letzteStelle());
  }

  /**
   * Kuerzt die geschwaerzten Seiten auf ganze Zeilen.
   *
   * Der Satzspiegel ist beschnitten; ohne das stuende unten die Oberkante
   * einer halben Zeile und saehe aus wie eine Linie, die dort nicht
   * hingehoert. Gemessen wird einmal — Zeilenabstand aus den ersten beiden
   * Zeilen, dann wird der Rest in einem Zug entfernt. Zeile fuer Zeile
   * wegzunehmen und jedesmal nachzumessen kostete ein Bild.
   */
  function zeilenKuerzen() {
    spanne
      .querySelectorAll<HTMLElement>('.blatt__satz--voll')
      .forEach((satz) => {
        const zeilen = Array.from(satz.children) as HTMLElement[];
        if (zeilen.length < 2) return;
        const abstand = zeilen[1].offsetTop - zeilen[0].offsetTop;
        if (abstand <= 0) return;
        // Die letzte Zeile braucht keinen Abstand mehr unter sich.
        const luecke = abstand - zeilen[0].offsetHeight;
        const passen = Math.max(
          1,
          Math.floor((satz.clientHeight + luecke) / abstand),
        );
        zeilen.slice(passen).forEach((zeile) => zeile.remove());
      });
  }

  /**
   * Setzt Vergroesserung und Verschiebung. Verschoben wird nur so weit, dass
   * kein Rand der Seite in den Rahmen hereinrutscht — sonst haette man
   * schwarze Ecken neben dem Papier.
   */
  function lupeSetzen() {
    // Die Uebergabe hat hier womoeglich noch einen Uebergang liegen; die
    // Lupe soll aber sofort folgen, nicht in 120 ms nachziehen.
    rahmen.style.transition = '';
    // Geschoben wird hoechstens so weit, bis die Kante des Bandes am
    // Bildrand steht. Ist der Band in einer Richtung kleiner als das
    // Fenster, gibt es dort nichts zu schieben.
    const breite = rahmen.offsetWidth * lupe;
    const hoehe = rahmen.offsetHeight * lupe;
    const grenzeX = Math.max(0, (breite - window.innerWidth) / 2);
    const grenzeY = Math.max(0, (hoehe - window.innerHeight) / 2);
    lupeX = Math.max(-grenzeX, Math.min(grenzeX, lupeX));
    lupeY = Math.max(-grenzeY, Math.min(grenzeY, lupeY));
    rahmen.style.transform =
      lupe === 1
        ? ''
        : `translate(${lupeX.toFixed(2)}px, ${lupeY.toFixed(2)}px) scale(${lupe.toFixed(4)})`;
    if (lupe > 1) rahmen.dataset.lupe = 'an';
    else delete rahmen.dataset.lupe;
  }

  /**
   * Vergroessert um einen Punkt herum: was unter dem Zeiger liegt, bleibt
   * unter dem Zeiger. Ohne das zoomt man immer in die Mitte und verliert die
   * Stelle, die man gerade lesen wollte.
   */
  function lupeAendern(ziel: number, punktX: number, punktY: number) {
    const vorher = lupe;
    const neu = Math.max(1, Math.min(lupeGrenze, ziel));
    if (neu === vorher) return;
    // Der Bezugspunkt ist die Mitte des **unverschobenen** Bandes; der
    // Kasten ist ja schon verschoben und vergroessert.
    const kasten = rahmen.getBoundingClientRect();
    const px = punktX - (kasten.left + kasten.width / 2 - lupeX);
    const py = punktY - (kasten.top + kasten.height / 2 - lupeY);
    const faktor = neu / vorher;
    lupeX = px - (px - lupeX) * faktor;
    lupeY = py - (py - lupeY) * faktor;
    lupe = neu;
    if (lupe === 1) {
      lupeX = 0;
      lupeY = 0;
    }
    lupeSetzen();
  }

  /**
   * Liegt der Punkt in der freien Mitte — also dort, wo nicht geblaettert
   * wird? Vergroessert ist die ganze Seite frei: dann faellt das Blaettern
   * ohnehin aus, und der Doppeltipp findet ueberall zurueck.
   */
  function imFreienFeld(punktX: number) {
    if (lupe > 1) return true;
    const kasten = rahmen.getBoundingClientRect();
    const anteil = (punktX - kasten.left) / kasten.width;
    return anteil > blaetterKante && anteil < 1 - blaetterKante;
  }

  /** Beim Umblaettern faengt die neue Seite unvergroessert an. */
  function lupeZurueck() {
    lupe = 1;
    lupeX = 0;
    lupeY = 0;
    lupeSetzen();
  }

  /** Die letzte Stelle — bei Doppelseiten die halbe Zahl der Seiten. */
  function letzteStelle() {
    return einzeln() ? folge.length - 1 : Math.ceil(folge.length / 2) - 1;
  }

  /**
   * Raeumt ein umschlagendes Blatt weg. Wer schnell blaettert, soll nicht
   * warten muessen: das laufende Blatt faellt einfach an seinen Platz, und
   * das naechste faengt an.
   */
  function wenderWeg() {
    wender?.remove();
    wender = null;
  }

  /**
   * Laesst ein Blatt umschlagen.
   *
   * Das Blatt hat zwei Seiten: vorn die Seite, die man verlaesst, hinten
   * die, auf der man landet — genau wie Papier. Deshalb wird das alte
   * Element **verschoben** und nicht kopiert, und die Rueckseite ist ein
   * Abzug der neuen Seite. Waehrend es sich dreht, liegt die fertige neue
   * Doppelseite schon darunter; das Blatt deckt sie nur noch zu, bis es
   * liegt.
   */
  function wenden(alt: HTMLElement, neu: HTMLElement, richtung: 1 | -1) {
    wenderWeg();
    const blatt = document.createElement('div');
    blatt.className = `wender ${richtung === 1 ? 'wender--vor' : 'wender--zurueck'}`;
    blatt.setAttribute('aria-hidden', 'true');
    for (const [seite, inhalt] of [
      ['vorn', alt],
      ['hinten', neu],
    ] as const) {
      const flaeche = document.createElement('div');
      flaeche.className = `wender__flaeche wender__flaeche--${seite}`;
      flaeche.append(
        seite === 'vorn' ? inhalt : (inhalt.cloneNode(true) as HTMLElement),
      );
      // Das Licht, das ueber die Seite laeuft, waehrend sie sich hebt: es
      // tut, was die Woelbung taete, ohne die Seite zu zerschneiden.
      const glanz = document.createElement('div');
      glanz.className = 'wender__glanz';
      flaeche.append(glanz);
      blatt.append(flaeche);
    }

    spanne.append(blatt);
    wender = blatt;

    const ende = richtung === 1 ? -180 : 180;
    const neigung = richtung === 1 ? -wendeNeigung : wendeNeigung;
    const lauf = blatt.animate(
      [
        {
          transform: 'rotateY(0deg) rotateX(0deg) translateZ(0px)',
          '--glanz': '0',
        },
        {
          transform: `rotateY(${ende * 0.5}deg) rotateX(${neigung}deg) translateZ(${wendeHub}px)`,
          '--glanz': '1',
          offset: 0.5,
        },
        {
          transform: `rotateY(${ende}deg) rotateX(0deg) translateZ(0px)`,
          '--glanz': '0',
        },
      ] as unknown as Keyframe[],
      {
        duration: wendeZeit,
        /*
         * Zieht an, laeuft aus: ein Blatt wird angehoben und faellt dann.
         *
         * Die Stuetzpunkte muessen in x aufsteigen. Hier stand einmal
         * `cubic-bezier(0.34, 0.02, 0.2, 1)` — mit x2 kleiner als x1, und
         * damit faltet sich die Kurve: das Blatt stand schon nach einem
         * Viertel der Zeit senkrecht und war fuer den Rest der Bewegung
         * unsichtbar.
         */
        easing: 'cubic-bezier(0.42, 0.04, 0.32, 1)',
        fill: 'forwards',
      },
    );
    const aufraeumen = () => {
      if (wender === blatt) wenderWeg();
    };
    lauf.finished.then(aufraeumen).catch(aufraeumen);
    // Netz: in einem verborgenen Fenster laufen Animationen nicht, und das
    // Blatt bliebe sonst fuer immer quer im Bild stehen.
    window.setTimeout(aufraeumen, wendeZeit + 600);
  }

  function blaettern(richtung: 1 | -1) {
    if (!offen || inBewegung) return;
    const ziel = stelle + richtung;
    // Vor dem Fenster ist nichts, hinter der Schlusstafel auch nicht.
    if (ziel < 0 || ziel > letzteStelle()) return;

    // Die Seite, die verlassen wird: beim Vorwaertsblaettern die rechte,
    // rueckwaerts die linke. Auf dem Telefon gibt es nur die eine.
    const vorher = [...spanne.querySelectorAll<HTMLElement>('.blatt')];
    const tafelVorher = spanne.classList.contains('leseprobe__spanne--tafel');
    const alteSeite =
      richtung === 1 ? vorher[vorher.length - 1] : vorher[0];

    stelle = ziel;
    lupeZurueck();
    wenderWeg();
    zeigen();

    // In die Schlusstafel hinein und aus ihr heraus wird nicht umgeschlagen:
    // sie ist keine Seite, sondern eine Tafel ueber die ganze Spanne, und
    // ein Blatt mit ihr als Rueckseite saehe aus wie ein Satzfehler.
    const tafelJetzt = spanne.classList.contains('leseprobe__spanne--tafel');
    const nachher = [...spanne.querySelectorAll<HTMLElement>('.blatt')];
    const neueSeite = richtung === 1 ? nachher[0] : nachher[nachher.length - 1];
    if (
      alteSeite &&
      neueSeite &&
      !tafelVorher &&
      !tafelJetzt &&
      !wenigerBewegung()
    ) {
      wenden(alteSeite, neueSeite, richtung);
    }
    const seite = einzeln() ? folge[stelle] : folge[stelle * 2];
    haken.melden(
      seite?.art === 'schluss'
        ? 'Ende der Leseprobe'
        : seite?.art === 'fenster'
          ? `Seite ${seite.nummer}`
          : `Seite ${(seite as { nummer: number }).nummer}, geschwärzt`,
    );
  }

  // ---------------------------------------------------------------- Öffnen

  function oeffnen(buch: CatalogBook, gezeigt: Seitendaten, von: HTMLElement | null) {
    if (offen || inBewegung) return;
    const probe = gezeigt.excerpt;
    if (!probe) return;
    const titel = gezeigt.shortTitle;
    aktuellesBuch = buch;
    aktuellerTitel = titel;
    aktuellerAutor = gezeigt.author;
    folge = seitenFolge(probe);
    // Das Licht auf dem Papier kommt aus dem Umschlag der Seite, die man
    // gerade liest — dieselbe Farbe, die in der Szene auf den Band faellt.
    lupeZurueck();
    rahmen.style.setProperty('--akzent', gezeigt.accent);
    spanne.style.setProperty('--akzent', gezeigt.accent);
    spanne.style.setProperty('--umschlag', gezeigt.cover);
    // Breite durch Hoehe — dasselbe Mass, mit dem der Band im Regal gebaut
    // wird. Sonst stuende eine 5,06x7,81-Seite in einem A5-Rahmen.
    spanne.style.setProperty('--seitenverhaeltnis', String(buch.widthRatio));
    rahmen.style.setProperty('--seitenverhaeltnis', String(buch.widthRatio));
    // Die Schrift des Bandes, wenn er eine mitbringt — sonst die Hausserife.
    if (buch.excerptFont) {
      rahmen.style.setProperty('--schrift-probe', buch.excerptFont);
    } else {
      rahmen.style.removeProperty('--schrift-probe');
    }
    stelle = 0;
    ausloeser = von;
    offen = true;
    inBewegung = true;

    // Der Weg zurueck gehoert zum Browser: wer den Band aufschlaegt, hat
    // eine Stelle mehr in der Geschichte, und der Zurueck-Knopf klappt ihn
    // wieder zu.
    eigenerSchritt = true;
    history.pushState({ leseprobe: buch.id }, '');

    wurzel.classList.add('ist-aufgeschlagen');
    zeigen();

    const uebergabe = () => {
      schale.hidden = false;
      // Die Doppelseite legt sich zuerst genau auf die, die in der Szene
      // aufgeschlagen daliegt — gemessen, nicht gerechnet —, und faehrt von
      // dort in ihre eigene Lage. Meist ist das ein Weg von wenigen Pixeln;
      // sichtbar waere er nur, wenn er fehlte.
      // Nur bei der Doppelseite. Auf dem Telefon steht im Dokument eine
      // einzelne Seite, und die ist so hoch wie das Geraet — sie hat weder
      // die Breite noch das Verhaeltnis der Doppelseite in der Szene. Sie
      // dorthin zu zwingen hiesse, sie fuer 120 ms platt zu druecken. Dort
      // genuegt das Ueberblenden.
      const ziel = einzeln() ? null : haken.rahmen();
      if (ziel && ziel.breite > 1 && ziel.hoehe > 1) {
        const jetzt = rahmen.getBoundingClientRect();
        const breit = ziel.breite / jetzt.width;
        const hoch = ziel.hoehe / jetzt.height;
        const dx = ziel.links + ziel.breite / 2 - (jetzt.left + jetzt.width / 2);
        const dy = ziel.oben + ziel.hoehe / 2 - (jetzt.top + jetzt.height / 2);
        rahmen.style.transition = 'none';
        rahmen.style.transform =
          `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) ` +
          `scale(${breit.toFixed(4)}, ${hoch.toFixed(4)})`;
        void rahmen.offsetHeight;
        rahmen.style.transition = `transform ${uebergabeZeit}ms ease-out`;
        rahmen.style.transform = '';
        window.setTimeout(() => {
          rahmen.style.transition = '';
          // Nicht blind leeren: von hier an gehoert die Transformation der
          // Lupe. (Beim Aufschlagen steht sie auf 1, also raeumt das auf.)
          lupeSetzen();
        }, uebergabeZeit + 40);
      }
      // Einmal messen lassen, sonst faengt der Uebergang nicht an: der
      // Browser fasst Einblenden und Sichtbarwerden sonst zu einem Schritt
      // zusammen. Ein erzwungenes Nachrechnen genuegt — auf ein Bild zu
      // warten waere anfaellig, denn in einem verborgenen Fenster kommt
      // keines.
      void schale.offsetHeight;
      schale.classList.add('ist-da');
    };
    const fertig = () => {
      inBewegung = false;
      band.focus({ preventScroll: true });
      haken.melden(`${titel}, Seite ${probe.page}. Leseprobe aufgeschlagen.`);
    };

    if (wenigerBewegung()) {
      // Ohne Bewegung: kein Anflug, keine Blaetter — die Doppelseite steht
      // sofort da.
      uebergabe();
      fertig();
      return;
    }
    haken.anfahren(uebergabe, fertig);
  }

  function schliessen(ueberGeschichte = false) {
    if (!offen) return;
    // Erst den eigenen Schritt aus der Geschichte nehmen, sonst bleibt er
    // liegen und der Zurueck-Knopf tut beim naechsten Mal nichts.
    if (!ueberGeschichte && eigenerSchritt) {
      eigenerSchritt = false;
      history.back();
      return;
    }
    eigenerSchritt = false;
    offen = false;
    inBewegung = true;
    schale.classList.remove('ist-da');

    const fertig = () => {
      inBewegung = false;
      // Das Regal kommt erst zurueck, wenn der Band wirklich zu ist. Frueher
      // fiel die Tafel schon ueber den halb geschlossenen Band — zwei
      // Ansichten uebereinander, von denen keine stimmte.
      wurzel.classList.remove('ist-aufgeschlagen');
      schale.hidden = true;
      wenderWeg();
      spanne.replaceChildren();
      aktuellesBuch = null;
      // Der Fokus geht dorthin zurueck, wo er herkam.
      ausloeser?.focus({ preventScroll: true });
      ausloeser = null;
      haken.melden('Band zugeklappt');
    };

    if (wenigerBewegung()) {
      fertig();
      return;
    }
    // Erst blendet die Doppelseite ab und gibt den Band frei, wie er
    // aufgeschlagen dasteht — dann erst schlagen die Blaetter zurueck.
    // Beides zugleich waere ein Durcheinander aus zwei Buechern.
    window.setTimeout(() => haken.zurueckfahren(fertig), uebergabeZeit);
  }

  // --------------------------------------------------------------- Bedienung

  grund.addEventListener('pointerdown', (ereignis) => {
    ereignis.preventDefault();
    schliessen();
  });
  zuKnopf.addEventListener('click', () => schliessen());

  // Geblaettert wird an den Aussenkanten der Spanne. Die Mitte bleibt frei,
  // damit man Text mit der Maus anfassen kann, ohne umzublaettern.
  rahmen.addEventListener('click', (ereignis) => {
    if (!offen || inBewegung) return;
    if ((ereignis.target as HTMLElement).closest('a')) return;
    // Wer geschoben hat, wollte schieben und nicht blaettern.
    if (gezogen > 6) return;
    // Vergroessert wird nicht geblaettert: dort fasst man die Seite an.
    if (lupe > 1) return;
    const kasten = rahmen.getBoundingClientRect();
    const anteil = (ereignis.clientX - kasten.left) / kasten.width;
    const kante = blaetterKante;
    if (anteil <= kante) blaettern(-1);
    else if (anteil >= 1 - kante) blaettern(1);
  });

  // Doppelklick geht hinein und wieder heraus — am Schreibtisch der
  // kuerzeste Weg. Auf dem Telefon zaehlt der Doppeltipp weiter unten
  // selbst; kaeme hier noch ein `dblclick` dazu, schaltete die Lupe
  // zweimal und stuende wieder, wo sie war.
  rahmen.addEventListener('dblclick', (ereignis) => {
    if (!offen || inBewegung) return;
    if (letzterZeigerTyp === 'touch') return;
    // In der Blaetterzone hat der erste Klick laengst umgeschlagen. Dort
    // noch zu vergroessern hiesse: eine Seite weiter, und dann hinein.
    if (!imFreienFeld(ereignis.clientX)) return;
    ereignis.preventDefault();
    lupeAendern(lupe > 1 ? 1 : lupeStufe, ereignis.clientX, ereignis.clientY);
  });

  rahmen.addEventListener('pointermove', (ereignis) => {
    if (!offen) return;

    // Zwei Finger: der Abstand zwischen ihnen ist die Vergroesserung.
    const gemerkt = finger.get(ereignis.pointerId);
    if (gemerkt) {
      gemerkt.x = ereignis.clientX;
      gemerkt.y = ereignis.clientY;
    }
    if (finger.size >= 2) {
      const [a, b] = [...finger.values()];
      const abstand = Math.hypot(a.x - b.x, a.y - b.y);
      if (kneifAbstand > 8 && abstand > 8) {
        // Wer gekniffen hat, hat nicht getippt. Sonst schlaegt der Klick,
        // der beim Loslassen des letzten Fingers kommt, noch eine Seite um.
        gezogen = 999;
        lupeAendern(
          (kneifLupe * abstand) / kneifAbstand,
          (a.x + b.x) / 2,
          (a.y + b.y) / 2,
        );
      }
      return;
    }

    // Ein Finger auf der vergroesserten Seite: schieben.
    if (schiebtVon) {
      const dx = ereignis.clientX - schiebtVon.x;
      const dy = ereignis.clientY - schiebtVon.y;
      gezogen = Math.abs(dx) + Math.abs(dy);
      lupeX = schiebtVon.lx + dx;
      lupeY = schiebtVon.ly + dy;
      lupeSetzen();
      return;
    }

    if (lupe > 1) {
      rahmen.dataset.kante = '';
      return;
    }
    const kasten = rahmen.getBoundingClientRect();
    const anteil = (ereignis.clientX - kasten.left) / kasten.width;
    const kante = blaetterKante;
    const zurueck = anteil <= kante && stelle > 0;
    const vor = anteil >= 1 - kante && stelle < letzteStelle();
    rahmen.dataset.kante = zurueck ? 'zurueck' : vor ? 'vor' : '';
  });

  rahmen.addEventListener('pointerdown', (ereignis) => {
    if (!offen || inBewegung) return;
    letzterZeigerTyp = ereignis.pointerType;
    finger.set(ereignis.pointerId, { x: ereignis.clientX, y: ereignis.clientY });
    gezogen = 0;
    if (finger.size === 2) {
      const [a, b] = [...finger.values()];
      kneifAbstand = Math.hypot(a.x - b.x, a.y - b.y);
      kneifLupe = lupe;
      schiebtVon = null;
      return;
    }
    if (finger.size === 1 && lupe > 1) {
      schiebtVon = {
        x: ereignis.clientX,
        y: ereignis.clientY,
        lx: lupeX,
        ly: lupeY,
      };
      rahmen.setPointerCapture(ereignis.pointerId);
    }
  });

  /*
   * Der Doppeltipp. Er steht **vor** `fingerWeg`, damit `finger` den
   * eigenen Zeiger noch enthaelt: ein Tipp ist genau ein Finger, und das
   * laesst sich nur zaehlen, solange er noch mitgezaehlt wird.
   *
   * Er wirkt nur im freien Feld. In der Blaetterzone haette der erste
   * Tipp die Seite schon umgeschlagen — man vergroesserte dann die
   * naechste Seite statt der, die man gemeint hat.
   */
  rahmen.addEventListener('pointerup', (ereignis) => {
    if (!offen || inBewegung) return;
    if (ereignis.pointerType !== 'touch') return;
    if (finger.size > 1 || gezogen > 6 || !imFreienFeld(ereignis.clientX)) {
      letzterTipp = null;
      return;
    }
    const jetzt = performance.now();
    const zweiter =
      letzterTipp !== null &&
      jetzt - letzterTipp.zeit < doppelTippZeit &&
      Math.hypot(
        ereignis.clientX - letzterTipp.x,
        ereignis.clientY - letzterTipp.y,
      ) < doppelTippWeg;
    if (zweiter) {
      letzterTipp = null;
      lupeAendern(lupe > 1 ? 1 : lupeStufe, ereignis.clientX, ereignis.clientY);
      return;
    }
    letzterTipp = { zeit: jetzt, x: ereignis.clientX, y: ereignis.clientY };
  });

  const fingerWeg = (ereignis: PointerEvent) => {
    finger.delete(ereignis.pointerId);
    if (finger.size < 2) kneifAbstand = 0;
    if (finger.size === 0) schiebtVon = null;
    // Wer nach dem Aufziehen einen Finger hebt, will meistens schieben.
    // Ohne das muesste er beide Finger heben und noch einmal aufsetzen —
    // die Hand macht das in einem Zug, die Bedienung soll es auch.
    if (finger.size === 1 && lupe > 1 && !schiebtVon) {
      const [rest] = [...finger.values()];
      schiebtVon = { x: rest.x, y: rest.y, lx: lupeX, ly: lupeY };
      gezogen = 999;
    }
  };
  rahmen.addEventListener('pointerup', fingerWeg);
  rahmen.addEventListener('pointercancel', fingerWeg);
  rahmen.addEventListener('pointerleave', (ereignis) => {
    // Beim Aufziehen darf ein Finger ueber den Rand wandern — die Seite
    // ist dann laengst groesser als der Rahmen, und aussen liegt bloss
    // Schwarz. Wer hier aufraeumt, bricht die Bewegung mitten im Kneifen
    // ab: der zweite Finger faellt aus `finger`, und das Aufziehen haelt
    // an, obwohl beide Finger noch auf dem Glas liegen.
    if (schiebtVon || finger.size >= 2) return;
    fingerWeg(ereignis);
  });

  // Scrollen blaettert. Ein Rad-Ereignis kommt in Schueben; gezaehlt wird
  // erst ab einer Schwelle, sonst fliegen fuenf Seiten auf einmal vorbei.
  schale.addEventListener(
    'wheel',
    (ereignis) => {
      if (!offen || inBewegung) return;
      ereignis.preventDefault();

      // Zwei Finger auseinander auf dem Trackpad (und Strg mit dem Mausrad)
      // kommen als Rad-Ereignis mit gedrueckter Strg-Taste an. Das ist
      // Vergroessern, kein Blaettern — dieselbe Unterscheidung wie im Regal.
      if (ereignis.ctrlKey || ereignis.metaKey) {
        // Ein Trackpad meldet viele kleine Schritte, ein Mausrad einen
        // grossen (etwa 100 auf einmal). Ohne Deckel springt die Seite beim
        // Rad um ein Drittel pro Rastung; mit ihm bleibt beides brauchbar.
        const schritt = Math.max(
          0.88,
          Math.min(1.14, 1 - ereignis.deltaY * 0.0032),
        );
        lupeAendern(lupe * schritt, ereignis.clientX, ereignis.clientY);
        return;
      }

      // Vergroessert wird nicht geblaettert, sondern geschoben.
      if (lupe > 1) {
        lupeX -= ereignis.deltaX;
        lupeY -= ereignis.deltaY;
        lupeSetzen();
        return;
      }


      const jetzt = performance.now();
      if (jetzt < radSperre) return;
      // Nach einer Pause faengt das Zaehlen von vorn an — sonst addiert sich
      // der Nachlauf des letzten Wischens zum naechsten.
      if (jetzt - radZuletzt > 320) radKonto = 0;
      radZuletzt = jetzt;
      radKonto += ereignis.deltaY + ereignis.deltaX;
      if (Math.abs(radKonto) < 42) return;
      blaettern(radKonto > 0 ? 1 : -1);
      radKonto = 0;
      radSperre = jetzt + 220;
    },
    { passive: false },
  );

  // Tasten: waagerecht wird geblaettert, ESC klappt zu. Der Rest gehoert
  // nicht hierher — ein aufgeschlagener Band wendet nicht und wechselt
  // nicht den Band.
  window.addEventListener(
    'keydown',
    (ereignis) => {
      if (!offen) return;
      if (ereignis.key === 'Escape') {
        ereignis.preventDefault();
        ereignis.stopPropagation();
        // Herangefahren faehrt ESC erst zurueck und schliesst dann. Sonst
        // waere der einzige Weg aus der Vergroesserung das Zuklappen.
        if (lupe > 1) lupeZurueck();
        else schliessen();
        return;
      }
      // Eine gehaltene Taste blaettert nicht durch das ganze Buch: bei vier
      // Doppelseiten waere man mit einem Anschlag hinten und saehe nur ein
      // Flackern. Ein Druck, eine Seite.
      const geblaettert = ['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', ' '];
      if (ereignis.repeat && geblaettert.includes(ereignis.key)) {
        ereignis.preventDefault();
        ereignis.stopPropagation();
        return;
      }
      if (ereignis.key === 'ArrowRight' || ereignis.key === 'PageDown' || ereignis.key === ' ') {
        ereignis.preventDefault();
        ereignis.stopPropagation();
        blaettern(1);
        return;
      }
      if (ereignis.key === 'ArrowLeft' || ereignis.key === 'PageUp') {
        ereignis.preventDefault();
        ereignis.stopPropagation();
        blaettern(-1);
        return;
      }
      // Der Tastenfokus bleibt im aufgeschlagenen Band. Ohne das wandert er
      // hinter die Doppelseite ins Regal, wo gerade nichts zu bedienen ist —
      // und `aria-modal` waere eine Behauptung ohne Deckung.
      if (ereignis.key === 'Tab') {
        const halter = Array.from(
          band.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
        );
        if (halter.length === 0) {
          ereignis.preventDefault();
          band.focus({ preventScroll: true });
          return;
        }
        const erster = halter[0];
        const letzter = halter[halter.length - 1];
        const aktiv = document.activeElement;
        if (ereignis.shiftKey && (aktiv === erster || aktiv === band)) {
          ereignis.preventDefault();
          letzter.focus();
        } else if (!ereignis.shiftKey && aktiv === letzter) {
          ereignis.preventDefault();
          erster.focus();
        } else if (aktiv && !band.contains(aktiv)) {
          ereignis.preventDefault();
          erster.focus();
        }
        return;
      }
      // Alles Uebrige wird abgefangen, damit das Regal darunter nichts
      // davon mitbekommt: kein Wenden, kein Bandwechsel.
      if (ereignis.key === 'f' || ereignis.key === 'F' || ereignis.key.startsWith('Arrow')) {
        ereignis.preventDefault();
        ereignis.stopPropagation();
      }
    },
    // Fangend, damit die Taste vor dem Regal hier ankommt.
    true,
  );

  window.addEventListener('popstate', () => {
    if (offen) schliessen(true);
  });

  // Zwischen Doppelseite und Einzelseite wechseln, wenn sich das Fenster
  // aendert — sonst steht auf dem gedrehten Telefon eine halbe Spanne.
  window.addEventListener('resize', () => {
    if (!offen) return;
    const grenze = letzteStelle();
    if (stelle > grenze) stelle = grenze;
    lupeSetzen();
    zeigen();
  });

  return {
    oeffnen,
    schliessen: () => schliessen(),
    istOffen: () => offen,
    /** Auch waehrend Anfahrt und Rueckweg ruht die Bedienung des Regals. */
    istBesetzt: () => offen || inBewegung,
  };
}

export type Leseprobe = ReturnType<typeof leseprobeAnhaengen>;
