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
import { siteConfig } from './verlag-config';

/**
 * Was von der Seite gebraucht wird, die gerade vorn liegt. Ein Doppelband
 * hat zwei davon; ein gewoehnlicher Band ist selbst seine erste Seite.
 */
export type Seitendaten = {
  title: string;
  shortTitle: string;
  accent: string;
  cover: string;
  excerpt?: BookExcerpt;
};

/*
 * Wie viele geschwaerzte Seiten hinter dem Fenster liegen. Drei: die rechte
 * Seite der Fenster-Doppelseite, dann eine ganz geschwaerzte Doppelseite,
 * dann die Schlusstafel. Mehr waren es einmal, und dann sah man beim
 * Blaettern fast nur noch Schwarz — der Entzug wirkt, wenn er einmal
 * dasteht, nicht wenn man sich durch ihn hindurchklickt.
 */
const schwarzeSeiten = 3;

/** Ab hier wird einzeln geblaettert statt in Doppelseiten. */
const handyBreite = 768;

/**
 * Die Uebergabe zwischen Szene und Dokument. Kurz genug, dass sie als ein
 * Bild durchgeht, lang genug, dass nichts springt.
 */
const uebergabeZeit = 120;

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
  | { art: 'schluss' };

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
  folge.push({ art: 'schluss' });
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

  const einzeln = () =>
    window.matchMedia(`(max-width: ${handyBreite - 1}px), (pointer: coarse)`)
      .matches;

  const wenigerBewegung = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- Seiten

  function kolumne(titel: string, nummer: number, rechts: boolean) {
    const kopf = document.createElement('p');
    kopf.className = `blatt__kolumne${rechts ? ' blatt__kolumne--rechts' : ''}`;
    const name = document.createElement('span');
    name.className = 'blatt__laufender';
    name.textContent = titel;
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

  function fensterBlatt(titel: string, seite: Seitenart & { art: 'fenster' }) {
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
    blatt.append(kolumne(titel, seite.nummer, false));

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
    blatt.append(kolumne(titel, seite.nummer, rechts));

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

  function schlussBlatt(buch: CatalogBook) {
    const blatt = document.createElement('article');
    blatt.className = 'blatt blatt--schluss';

    const tafel = document.createElement('div');
    tafel.className = 'blatt__tafel';

    const erste = document.createElement('p');
    erste.className = 'blatt__schlusszeile';
    erste.textContent = buch.pages
      ? `Weiter nur im Band — ${buch.pages} Seiten`
      : 'Weiter nur im Band';

    // Lieferbar heisst: es gibt etwas zu kaufen. Sonst wird vorgemerkt —
    // ein Postfach ist der einzige Weg, der von hier aus offen steht.
    const lieferbar = buch.availability === 'Verfügbar' && Boolean(buch.orderUrl);
    const ziel = document.createElement('a');
    ziel.className = 'blatt__vormerken';
    ziel.href = lieferbar
      ? (buch.orderUrl as string)
      : `mailto:${siteConfig.vormerkenAdresse}?subject=${encodeURIComponent(
          `Vormerken — ${buch.title}`,
        )}`;
    ziel.textContent = lieferbar ? 'Bestellen' : 'Vormerken';
    const pfeil = document.createElement('span');
    pfeil.setAttribute('aria-hidden', 'true');
    pfeil.textContent = '↗';
    ziel.append(' ', pfeil);

    tafel.append(erste, ziel);
    blatt.append(tafel);
    return blatt;
  }

  function blattBauen(seite: Seitenart, titel: string, buch: CatalogBook, rechts: boolean) {
    if (seite.art === 'fenster') return fensterBlatt(titel, seite);
    if (seite.art === 'schwarz') return schwarzBlatt(titel, seite, rechts);
    return schlussBlatt(buch);
  }

  // -------------------------------------------------------------- Blaettern

  let aktuellesBuch: CatalogBook | null = null;
  let aktuellerTitel = '';

  function zeigen() {
    if (!aktuellesBuch) return;
    const solo = einzeln();
    spanne.classList.toggle('leseprobe__spanne--einzeln', solo);
    spanne.replaceChildren();

    if (solo) {
      const seite = folge[stelle];
      spanne.append(blattBauen(seite, aktuellerTitel, aktuellesBuch, false));
    } else {
      const links = folge[stelle * 2];
      const rechts = folge[stelle * 2 + 1];
      // Die Schlusstafel nimmt die ganze Spanne: dort stehen keine Balken,
      // nur zwei Zeilen in der Mitte des Satzspiegels.
      if (links?.art === 'schluss') {
        spanne.classList.add('leseprobe__spanne--tafel');
        spanne.append(blattBauen(links, aktuellerTitel, aktuellesBuch, false));
      } else {
        spanne.classList.remove('leseprobe__spanne--tafel');
        if (links) spanne.append(blattBauen(links, aktuellerTitel, aktuellesBuch, false));
        if (rechts) spanne.append(blattBauen(rechts, aktuellerTitel, aktuellesBuch, true));
      }
    }
    zeilenKuerzen();
    schale.classList.toggle('ist-am-anfang', stelle === 0);
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

  /** Die letzte Stelle — bei Doppelseiten die halbe Zahl der Seiten. */
  function letzteStelle() {
    return einzeln() ? folge.length - 1 : Math.ceil(folge.length / 2) - 1;
  }

  function blaettern(richtung: 1 | -1) {
    if (!offen || inBewegung) return;
    const ziel = stelle + richtung;
    // Vor dem Fenster ist nichts, hinter der Schlusstafel auch nicht.
    if (ziel < 0 || ziel > letzteStelle()) return;
    stelle = ziel;
    zeigen();
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
    folge = seitenFolge(probe);
    // Das Licht auf dem Papier kommt aus dem Umschlag der Seite, die man
    // gerade liest — dieselbe Farbe, die in der Szene auf den Band faellt.
    spanne.style.setProperty('--akzent', gezeigt.accent);
    spanne.style.setProperty('--umschlag', gezeigt.cover);
    // Breite durch Hoehe — dasselbe Mass, mit dem der Band im Regal gebaut
    // wird. Sonst stuende eine 5,06x7,81-Seite in einem A5-Rahmen.
    spanne.style.setProperty('--seitenverhaeltnis', String(buch.widthRatio));
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
        const jetzt = spanne.getBoundingClientRect();
        const breit = ziel.breite / jetzt.width;
        const hoch = ziel.hoehe / jetzt.height;
        const dx = ziel.links + ziel.breite / 2 - (jetzt.left + jetzt.width / 2);
        const dy = ziel.oben + ziel.hoehe / 2 - (jetzt.top + jetzt.height / 2);
        spanne.style.transition = 'none';
        spanne.style.transform =
          `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) ` +
          `scale(${breit.toFixed(4)}, ${hoch.toFixed(4)})`;
        void spanne.offsetHeight;
        spanne.style.transition = `transform ${uebergabeZeit}ms ease-out`;
        spanne.style.transform = '';
        window.setTimeout(() => {
          spanne.style.transition = '';
          spanne.style.transform = '';
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
  spanne.addEventListener('click', (ereignis) => {
    if (!offen || inBewegung) return;
    if ((ereignis.target as HTMLElement).closest('a')) return;
    const kasten = spanne.getBoundingClientRect();
    const anteil = (ereignis.clientX - kasten.left) / kasten.width;
    const kante = einzeln() ? 0.5 : 0.34;
    if (anteil <= kante) blaettern(-1);
    else if (anteil >= 1 - kante) blaettern(1);
  });

  spanne.addEventListener('pointermove', (ereignis) => {
    if (!offen) return;
    const kasten = spanne.getBoundingClientRect();
    const anteil = (ereignis.clientX - kasten.left) / kasten.width;
    const kante = einzeln() ? 0.5 : 0.34;
    const zurueck = anteil <= kante && stelle > 0;
    const vor = anteil >= 1 - kante && stelle < letzteStelle();
    spanne.dataset.kante = zurueck ? 'zurueck' : vor ? 'vor' : '';
  });

  // Scrollen blaettert. Ein Rad-Ereignis kommt in Schueben; gezaehlt wird
  // erst ab einer Schwelle, sonst fliegen fuenf Seiten auf einmal vorbei.
  schale.addEventListener(
    'wheel',
    (ereignis) => {
      if (!offen || inBewegung) return;
      ereignis.preventDefault();
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
        schliessen();
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
