// Bedienoberfläche des Regals. Ersetzt die React-Komponente des
// Ursprungs-Templates: derselbe Zustand (aktiver Band, Modus, Status),
// nur direkt am DOM statt über einen Framework-Umweg.

import { ShelfEngine, type BookSide, type ShelfMode } from './ShelfEngine';
import { nachbarIndex, type CatalogBook } from './katalog';
import { leseprobeAnhaengen } from './leseprobe';
import { siteConfig } from './verlag-config';

// Katalognummern: drei Stellen, fuehrende Nullen. 001, 002, 003.
const katalognummer = (zahl: number) => String(zahl).padStart(3, '0');

function pflicht<T extends Element>(wurzel: ParentNode, wahl: string): T {
  const element = wurzel.querySelector<T>(wahl);
  if (!element) throw new Error(`Regal: Element fehlt — ${wahl}`);
  return element;
}

export function regalStarten(wurzel: HTMLElement) {
  const datenScript = pflicht<HTMLScriptElement>(wurzel, '[data-regal-daten]');
  const katalog = JSON.parse(datenScript.textContent ?? '[]') as CatalogBook[];
  if (katalog.length === 0) return;

  const canvas = pflicht<HTMLCanvasElement>(wurzel, '[data-regal-canvas]');
  const el = {
    blaetternZahl: pflicht(wurzel, '[data-blaettern-zahl]'),
    blaetternTitel: pflicht(wurzel, '[data-blaettern-titel]'),
    blaetternAutor: pflicht(wurzel, '[data-blaettern-autor]'),
    zurueck: pflicht<HTMLButtonElement>(wurzel, '[data-zurueck]'),
    vor: pflicht<HTMLButtonElement>(wurzel, '[data-vor]'),
    nachbarZahlZurueck: pflicht(wurzel, '[data-nachbar-zahl-zurueck]'),
    nachbarTitelZurueck: pflicht(wurzel, '[data-nachbar-titel-zurueck]'),
    nachbarZahlVor: pflicht(wurzel, '[data-nachbar-zahl-vor]'),
    nachbarTitelVor: pflicht(wurzel, '[data-nachbar-titel-vor]'),
    ticks: Array.from(wurzel.querySelectorAll<HTMLButtonElement>('[data-tick]')),
    panel: pflicht<HTMLElement>(wurzel, '[data-panel]'),
    panelInhalt: pflicht<HTMLElement>(wurzel, '[data-panel-inhalt]'),
    panelText: pflicht<HTMLElement>(wurzel, '[data-panel-text]'),
    panelAugenbraue: pflicht(wurzel, '[data-panel-augenbraue]'),
    panelTitel: pflicht(wurzel, '[data-panel-titel]'),
    panelAutor: pflicht(wurzel, '[data-panel-autor]'),
    panelKlappentext: pflicht(wurzel, '[data-panel-klappentext]'),
    panelZitat: pflicht(wurzel, '[data-panel-zitat]'),
    panelZitatVon: pflicht(wurzel, '[data-panel-zitat-von]'),
    panelFormat: pflicht(wurzel, '[data-panel-format]'),
    panelVerfuegbarkeit: pflicht(wurzel, '[data-panel-verfuegbarkeit]'),
    panelLink: pflicht<HTMLAnchorElement>(wurzel, '[data-panel-link]'),
    panelLinkText: pflicht(wurzel, '[data-panel-link-text]'),
    zurRegal: pflicht<HTMLButtonElement>(wurzel, '[data-zum-regal]'),
    wenden: pflicht<HTMLButtonElement>(wurzel, '[data-wenden]'),
    wendenText: pflicht(wurzel, '[data-wenden-text]'),
    seitenmarken: Array.from(
      wurzel.querySelectorAll<HTMLElement>('[data-seitenmarke]'),
    ),
    status: pflicht(wurzel, '[data-status-text]'),
    vorlese: pflicht(wurzel, '[data-vorlese]'),
    leseprobeZeile: pflicht<HTMLButtonElement>(wurzel, '[data-leseprobe-zeile]'),
    leseprobeSeite: pflicht(wurzel, '[data-leseprobe-seite]'),
    heftZeilen: pflicht<HTMLElement>(wurzel, '[data-heft-zeilen]'),
    heftZu: pflicht<HTMLButtonElement>(wurzel, '[data-heft-zu]'),
  };

  let engine: ShelfEngine | null = null;
  /** Liegt ein Geschichtsschritt fuer das Heft auf dem Stapel? */
  let heftGeschichte = false;
  /** Hat der Zurueck-Knopf des Browsers geschlossen? */
  let heftVomZurueck = false;
  /**
   * Kopie weg, Verschiebung weg. Wird am Ende des Wechsels gerufen — und
   * sicherheitshalber auch, wenn die Betrachtung vorher verlassen wird:
   * sonst bliebe die Kopie liegen und der Text stuende verschoben da.
   */
  function wipeAufraeumen() {
    el.panelText.style.opacity = '';
    el.panel.classList.remove('is-wischend');
  }
  let aktiverIndex = 0;
  let gewaehlterIndex: number | null = null;
  let modus: ShelfMode = 'browse';
  let seite: BookSide = 'vorn';
  /** Liegt das Heft offen? Dann gehoert die Bedienung ihm. */
  let heftOffen = false;

  const gesamt = katalognummer(katalog.length);

  /**
   * Der aufgeschlagene Band. Die Anfahrt in 3D haengt an der Engine; hier
   * steht nur, wer sie anstoesst. Ist die Engine noch nicht da (oder
   * abgestuerzt), schlaegt die Doppelseite ohne Anflug auf — lesen muss man
   * koennen, auch wenn die Szene fehlt.
   */
  const leseprobe = leseprobeAnhaengen(wurzel, {
    anfahren: (uebergabe, fertig) => {
      if (engine) engine.leseprobeAnfahren(uebergabe, fertig);
      else {
        uebergabe();
        fertig();
      }
    },
    zurueckfahren: (fertig) => {
      if (engine) engine.leseprobeZurueck(fertig);
      else fertig();
    },
    rahmen: () => engine?.leseprobeRahmen() ?? null,
    melden: (text) => {
      el.vorlese.textContent = text;
    },
  });

  /**
   * Schlaegt den Band auf, der gerade vorn liegt — und zwar auf der Seite,
   * die man ansieht. Ein Doppelband hat zwei Geschichten und zwei Proben;
   * welche gilt, entscheidet die Lage des Bandes, nicht der Knopfdruck.
   */
  function leseprobeOeffnen(von: HTMLElement | null) {
    if (!siteConfig.leseprobe) return;
    if (modus === 'browse' || gewaehlterIndex === null) return;
    if (leseprobe.istBesetzt()) return;
    const buch = katalog[gewaehlterIndex];
    const gezeigt = seite === 'hinten' && buch.back ? buch.back : buch;
    if (!gezeigt.excerpt) return;
    leseprobe.oeffnen(buch, gezeigt, von);
  }

  function blaetternAnsichtSetzen() {
    const buch = katalog[aktiverIndex];
    const imFokus = modus !== 'browse';
    // Das Blatt traegt keine Nummer — dort bleibt die Zeile leer.
    el.blaetternZahl.textContent = buch.release;
    el.blaetternTitel.textContent = buch.shortTitle;
    el.blaetternAutor.textContent = buch.author;
    // Die Nachbarn stehen namentlich am Rand. Kein Umlauf: vor dem ersten
    // Band ist nichts, nach dem letzten die freie Stelle.
    const davor = nachbarIndex(katalog, aktiverIndex, -1);
    const danach = nachbarIndex(katalog, aktiverIndex, 1);
    const amAnfang = davor === null;
    const amEnde = danach === null;
    // Im aufgeschlagenen Band ist wenig Platz: dort wird frueher gekappt,
    // damit der Titel nicht in die Textspalte laeuft.
    const grenze = modus === 'browse' ? 24 : 14;
    const gekuerzt = (titel: string) =>
      titel.length > grenze
        ? `${titel.slice(0, grenze - 1).trimEnd()}…`
        : titel;
    // Liegt Seite B vorn, bleibt sie es auch beim Blaettern — dann gehoert
    // in die Nachbarzeile der Titel der zweiten Geschichte.
    const nachbarTitel = (index: number) => {
      const buch = katalog[index];
      const zweite = seite === 'hinten' && buch.back ? buch.back : buch;
      return gekuerzt(zweite.shortTitle);
    };
    // Vor dem ersten Band steht nichts — dann faellt die linke Zeile weg.
    el.zurueck.hidden = amAnfang;
    if (!amAnfang) {
      el.nachbarZahlZurueck.textContent = katalog[davor].release;
      el.nachbarTitelZurueck.textContent = `— ${nachbarTitel(davor)}`;
      el.zurueck.setAttribute(
        'aria-label',
        `Vorheriger Band — ${katalog[davor].title}`,
      );
    }

    // Nach dem letzten Band ist Schluss — die offene Stelle steht als
    // Blindband selbst in der Reihe.
    el.vor.hidden = amEnde;
    if (!amEnde) {
      el.nachbarZahlVor.textContent = katalog[danach].release;
      el.nachbarTitelVor.textContent = `${nachbarTitel(danach)} —`;
      el.vor.setAttribute(
        'aria-label',
        `Nächster Band — ${katalog[danach].title}`,
      );
    }
    el.ticks.forEach((tick) => {
      const index = Number(tick.dataset.stelle);
      // Solange das Heft offen ist, gehoert keine Marke niemandem: das Heft
      // traegt keine Nummer und steht in keiner Reihe. Eine leuchtende
      // Marke behauptete das Gegenteil.
      const ist = index === aktiverIndex && !heftOffen;
      tick.classList.toggle('is-active', ist);
      tick.classList.toggle('ist-blind', Boolean(katalog[index]?.blind));
      // Die Leiste bleibt auch im Fokus bedienbar.
      tick.disabled = false;
      if (ist) tick.setAttribute('aria-current', 'true');
      else tick.removeAttribute('aria-current');
    });
  }

  function panelSetzen() {
    const imFokus = modus !== 'browse';
    const buch = gewaehlterIndex === null ? null : katalog[gewaehlterIndex];
    wurzel.classList.toggle('is-focused', imFokus);
    wurzel.classList.toggle('is-browsing', !imFokus);
    el.panel.setAttribute('aria-hidden', String(!imFokus));
    el.panelInhalt.hidden = buch === null;
    if (!buch || gewaehlterIndex === null) {
      el.panel.setAttribute('aria-label', 'Angaben zum Band');
      return;
    }
    // Bei einem Doppelband gehoert zu jeder Seite eine eigene Geschichte.
    // Das Panel folgt dem Band: was oben liegt, steht hier.
    const doppelband = buch.back !== undefined;
    const gezeigt = seite === 'hinten' && buch.back ? buch.back : buch;

    el.panel.setAttribute('aria-label', `Angaben zu ${gezeigt.title}`);
    el.panelAugenbraue.textContent = buch.release;
    el.panelTitel.textContent = gezeigt.title;
    el.panelAutor.textContent = gezeigt.author;
    el.panelKlappentext.textContent = gezeigt.description;
    el.panelZitat.textContent = `„${gezeigt.quote}“`;
    el.panelZitatVon.textContent = gezeigt.quoteBy;

    // Umdrehen kann man jeden Band. Nur beim Doppelcover steht auf der
    // anderen Seite eine zweite Geschichte — dann sagt der Knopf das auch.
    el.seitenmarken.forEach((marke) => {
      marke.hidden = !doppelband;
    });
    // Heissen beide Seiten gleich — wie beim Blindband —, waere der Titel
    // im Knopf keine Auskunft. Dann sagt er schlicht, wohin es geht.
    const gleicherTitel = buch.back?.shortTitle === buch.shortTitle;
    el.wendenText.textContent = !doppelband
      ? 'Band wenden'
      : gleicherTitel
        ? seite === 'vorn'
          ? 'Wenden zu Seite B'
          : 'Wenden zu Seite A'
        : seite === 'vorn'
          ? `Wenden zu „${buch.back?.shortTitle ?? ''}“`
          : `Wenden zu „${buch.shortTitle}“`;
    el.wenden.setAttribute(
      'aria-label',
      doppelband
        ? seite === 'vorn'
          ? `Band wenden zu ${buch.back?.title ?? ''}`
          : `Band zurück wenden zu ${buch.title}`
        : `${buch.title} umdrehen`,
    );
    // Einheitlich kurz: „Seite A" oder „Seite B", bei jedem Doppelband
    // gleich und immer in der Giftfarbe.
    if (doppelband) {
      el.seitenmarken.forEach((marke) => {
        marke.textContent = seite === 'vorn' ? 'Seite A' : 'Seite B';
      });
    }
    // Die Leseprobe gehoert der Seite, die vorn liegt. Hat sie keine,
    // steht die Zeile nicht da — und der Band laesst sich dort auch nicht
    // aufschlagen.
    const probe = siteConfig.leseprobe ? gezeigt.excerpt : undefined;
    el.leseprobeZeile.hidden = !probe;
    if (probe) {
      el.leseprobeSeite.textContent = String(probe.page);
      el.leseprobeZeile.setAttribute(
        'aria-label',
        `Leseprobe aus ${gezeigt.title}, Seite ${probe.page}, aufschlagen`,
      );
    }
    el.panelFormat.textContent = buch.format;
    el.panelVerfuegbarkeit.textContent = buch.availability;
    el.panelLink.href = buch.url;
    el.panelLinkText.textContent = buch.linkLabel ?? siteConfig.bookLinkLabel;
  }

  function vorleseSetzen() {
    if (modus !== 'browse' && gewaehlterIndex !== null) {
      const buch = katalog[gewaehlterIndex];
      const gezeigt = seite === 'hinten' && buch.back ? buch.back : buch;
      const zusatz = buch.back
        ? seite === 'vorn'
          ? ' Erste von zwei Seiten.'
          : ' Zweite von zwei Seiten.'
        : '';
      el.vorlese.textContent = `${gezeigt.title} von ${gezeigt.author} liegt vorn.${zusatz}`;
      return;
    }
    const buch = katalog[aktiverIndex];
    el.vorlese.textContent = `${buch.title} von ${buch.author} ausgewählt.`;
  }

  // „Band herausziehen" tut genau das. Aufgeschlagen wird mit einem Klick
  // auf den Band.
  // Die Pfeile tun dasselbe wie die Nummern: einen Band weiter. Im Regal
  // holen sie ihn heraus, beim aufgeschlagenen Band blättern sie weiter.
  function nachbar(richtung: -1 | 1) {
    // Ein aufgeschlagener Band wechselt nicht den Band — und das Heft
    // kennt gar keine Nachbarn.
    if (leseprobe.istBesetzt() || heftOffen) return;
    // Am Blatt vorbei — und von ihm aus an die Enden der Reihe.
    const ziel = nachbarIndex(katalog, aktiverIndex, richtung);
    if (ziel === null) return;
    if (modus === 'browse') engine?.presentBook(ziel);
    else engine?.inspectOther(ziel, richtung);
  }
  el.zurueck.addEventListener('click', () => nachbar(-1));
  el.vor.addEventListener('click', () => nachbar(1));
  // Ein Klick auf die Nummer holt den Band heraus und stellt ihn auf. Die
  // Beschreibung kommt erst, wenn man dann auf den Band selbst klickt.
  el.ticks.forEach((tick) => {
    const index = Number(tick.dataset.stelle);
    tick.addEventListener('click', () => {
      if (leseprobe.istBesetzt() || heftOffen) return;
      // Im Regal: nur herausholen. Beim aufgeschlagenen Band: direkt zum
      // naechsten weiterblättern, ohne Umweg über das Regal.
      if (modus === 'browse') engine?.presentBook(index);
      else engine?.inspectOther(index);
    });
  });
  // Geblättert wird unten auf der Tafel. Über dem Band bleibt die Hand
  // zum Drehen und Zoomen frei.
  let wischStart: { x: number; y: number } | null = null;
  el.panel.addEventListener('pointerdown', (ereignis) => {
    if (ereignis.pointerType !== 'touch' || leseprobe.istBesetzt()) return;
    if (heftOffen) return;
    wischStart = { x: ereignis.clientX, y: ereignis.clientY };
  });
  el.panel.addEventListener('pointerup', (ereignis) => {
    if (!wischStart || ereignis.pointerType !== 'touch') return;
    if (leseprobe.istBesetzt()) return;
    const dx = ereignis.clientX - wischStart.x;
    const dy = ereignis.clientY - wischStart.y;
    wischStart = null;
    // Senkrecht ist Lesen, waagerecht ist Blättern.
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (gewaehlterIndex === null) return;
    engine?.inspectOther(gewaehlterIndex + (dx > 0 ? 1 : -1));
  });
  el.panel.addEventListener('pointercancel', () => {
    wischStart = null;
  });

  el.zurRegal.addEventListener('click', () => {
    if (leseprobe.istBesetzt() || heftOffen) return;
    engine?.returnToShelf();
  });
  el.wenden.addEventListener('click', () => {
    // Ein aufgeschlagener Band wendet nicht — und ein Heft ueberhaupt nie.
    if (leseprobe.istBesetzt() || heftOffen) return;
    engine?.flipBook();
  });
  // Die erste der beiden Zeilen unter dem Heft. Die zweite ist ein
  // gewoehnlicher Verweis auf die Datei und braucht kein Skript.
  el.heftZu.addEventListener('click', () => engine?.heftSchliessen());
  el.leseprobeZeile.addEventListener('click', () =>
    leseprobeOeffnen(el.leseprobeZeile),
  );
  // Beide Wege in den Band gehoeren zusammen: liegt der Zeiger auf der
  // Zeile, geht der Band in denselben Schwebezustand, als laege er auf dem
  // Umschlag. Der Tastenfokus zaehlt mit — wer sich mit der Tabulatortaste
  // hierher bewegt, sieht dasselbe.
  (['pointerenter', 'focus'] as const).forEach((art) =>
    el.leseprobeZeile.addEventListener(art, () => engine?.schwebeErzwingen(true)),
  );
  (['pointerleave', 'blur'] as const).forEach((art) =>
    el.leseprobeZeile.addEventListener(art, () => engine?.schwebeErzwingen(false)),
  );

  wurzel.querySelectorAll('[data-gesamt]').forEach((element) => {
    element.textContent = gesamt;
  });

  canvas.setAttribute(
    'aria-label',
    `Stapel mit ${katalog.length} Bänden. Pfeiltasten blättern, Ziehen dreht die Ansicht, Eingabetaste holt den Band nach vorn.`,
  );

  blaetternAnsichtSetzen();
  panelSetzen();
  vorleseSetzen();

  let abgebrochen = false;

  function aufgeben(grund: unknown) {
    // Kein WebGL, kein Speicher, abgeschossener Grafiktreiber: ohne diesen
    // Ausweg bliebe der Ladeschirm fuer immer stehen und die Seite waere
    // eine graue Flaeche. Stattdessen zeigen wir den Weg ins Programm.
    console.warn('Regal: 3D-Ansicht nicht moeglich.', grund);
    wurzel.classList.add('is-ready', 'ohne-3d');
    wurzel.querySelector('[data-ladeschirm]')?.setAttribute('aria-hidden', 'true');
    el.status.textContent = 'Der Stapel laesst sich hier nicht aufbauen';
    const ausweg = wurzel.querySelector<HTMLElement>('[data-ausweg]');
    if (ausweg) ausweg.hidden = false;
  }

  async function starten() {
    // Die Cover werden auf Canvas gezeichnet; ohne fertige Schriften
    // stehen sie in der Ersatzschrift.
    await document.fonts.ready;
    if (abgebrochen) return;
    engine = new ShelfEngine(canvas, katalog, {
      onActiveIndex: (index) => {
        aktiverIndex = index;
        blaetternAnsichtSetzen();
        vorleseSetzen();
      },
      onMode: (naechsterModus, index) => {
        const vorher = modus;
        modus = naechsterModus;
        gewaehlterIndex = index;
        blaetternAnsichtSetzen();
        panelSetzen();
        vorleseSetzen();
        if (modus === 'browse' || modus === 'returning') wipeAufraeumen();
      },
      // Der Wechsel ist ein Abblender: das Licht geht aus, im Dunkeln
      // wechselt der Text, dann kommt das Licht zurueck. Nichts faehrt
      // seitwaerts — die Engine sagt Bild fuer Bild, wie viel Licht da ist.
      onSwap: (index) => {
            gewaehlterIndex = index;
        aktiverIndex = index;
        // Die Seite wird nicht zurueckgesetzt: sie kommt aus der Engine,
        // die beim Blaettern A bei A und B bei B laesst.
        panelSetzen();
        blaetternAnsichtSetzen();
        vorleseSetzen();
        el.panelText.scrollTop = 0;
      },
      onWipeFrame: (licht) => {
        el.panelText.style.opacity = String(licht);
      },
      onWipeEnde: wipeAufraeumen,
      onSide: (naechsteSeite) => {
        seite = naechsteSeite;
        panelSetzen();
        // Auch die Nachbarzeilen: sie zeigen die Seite, auf der man landet.
        blaetternAnsichtSetzen();
        vorleseSetzen();
      },
      onStatus: (meldung) => {
        el.status.textContent = meldung;
      },
      // Das Heft raeumt den Schirm frei. Alles, was das Regal sonst
      // anbietet, verschwindet (`ist-heft` in `styles/magazin.css`); die
      // zwei Zeilen kommen. Der Zurueck-Knopf des Browsers schliesst
      // wieder, wie beim aufgeschlagenen Band.
      onHeft: (offen, buch) => {
        heftOffen = offen;
        wurzel.classList.toggle('ist-heft', offen);
        el.heftZeilen.hidden = !offen;
        // Die Leiste neu setzen: die aktive Marke faellt weg und kommt
        // wieder.
        blaetternAnsichtSetzen();
        if (offen) {
          el.vorlese.textContent = `${buch?.title ?? 'Das Heft'} liegt aufgeschlagen. Pfeiltasten blättern, Escape schließt.`;
          if (!heftGeschichte) {
            heftGeschichte = true;
            window.history.pushState({ heft: true }, '');
          }
        } else if (heftGeschichte) {
          heftGeschichte = false;
          // Kam das Schliessen selbst vom Zurueck-Knopf, ist der Schritt
          // schon abgeraeumt — noch einmal zurueck traege die Seite fort.
          if (!heftVomZurueck) window.history.back();
          heftVomZurueck = false;
        }
      },
      // Ein Klick auf den Umschlag des betrachteten Bandes. Ob daraus etwas
      // wird, entscheidet sich hier: nur wo eine Leseprobe liegt.
      onAufschlagen: () => leseprobeOeffnen(null),
      kannAufschlagen: () => {
        if (!siteConfig.leseprobe) return false;
        if (modus === 'browse' || gewaehlterIndex === null) return false;
        const buch = katalog[gewaehlterIndex];
        const gezeigt = seite === 'hinten' && buch.back ? buch.back : buch;
        return Boolean(gezeigt.excerpt);
      },
      onReady: () => {
        wurzel.classList.add('is-ready');
        wurzel.querySelector('[data-ladeschirm]')?.setAttribute('aria-hidden', 'true');
        // `/magazin` geht ohne Umweg in die Leseposition: kein Stapel, aus
        // dem man sich erst herausklicken muesste.
        //
        // Einen Zug spaeter, nicht sofort: `onReady` faellt noch **im**
        // Erbauer, und `engine` bekommt seinen Wert erst, wenn der fertig
        // ist. Ein Aufruf von hier ginge ins Leere — dieselbe Falle wie
        // beim Direkteinstieg ueber `/?band=`.
        if (wurzel.dataset.regalDirekt === 'magazin') {
          window.setTimeout(() => engine?.heftOeffnen(), 0);
          return;
        }
        // Wer mit /?band=008 kommt, will genau diesen Band aufgeschlagen
        // sehen — etwa auf dem Weg zurueck von den Einsendungen. Ein
        // einzelner Anstoss verpufft, solange der Band noch im Stapel
        // liegt: das Regal holt ihn erst heraus. Also so lange nachfassen,
        // bis er wirklich offen ist.
        const gewuenscht = Number(
          new URLSearchParams(window.location.search).get('band'),
        );
        if (
          Number.isInteger(gewuenscht) &&
          gewuenscht >= 1 &&
          gewuenscht <= katalog.length
        ) {
          const ziel = gewuenscht - 1;
          let versuche = 0;
          const aufschlagen = () => {
            if (modus !== 'browse') return;
            engine?.focusBook(ziel);
            versuche += 1;
            if (versuche < 16) window.setTimeout(aufschlagen, 260);
          };
          aufschlagen();
        }
      },
    });
  }

  void starten().catch(aufgeben);

  // Der Zurueck-Knopf des Browsers schliesst das Heft — derselbe Weg wie
  // beim aufgeschlagenen Band. Wer auf `/magazin` angekommen ist, hat
  // keinen Schritt davor: dann fuehrt der Knopf, wie er soll, aus der
  // Seite heraus.
  window.addEventListener('popstate', () => {
    if (!heftOffen) return;
    heftVomZurueck = true;
    engine?.heftSchliessen();
  });

  // Astro laedt Seiten im Browser neu ein; ein zurueckgelassener
  // WebGL-Kontext waere ein Leck.
  window.addEventListener('beforeunload', () => {
    abgebrochen = true;
    engine?.dispose();
    engine = null;
  });
}
