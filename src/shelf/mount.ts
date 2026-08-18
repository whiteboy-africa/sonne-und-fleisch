// Bedienoberfläche des Regals. Ersetzt die React-Komponente des
// Ursprungs-Templates: derselbe Zustand (aktiver Band, Modus, Status),
// nur direkt am DOM statt über einen Framework-Umweg.

import { ShelfEngine, type BookSide, type ShelfMode } from './ShelfEngine';
import type { CatalogBook } from './katalog';
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
    wischHinweis: pflicht<HTMLElement>(wurzel, '[data-wisch-hinweis]'),
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
  };

  let engine: ShelfEngine | null = null;
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

  const gesamt = katalognummer(katalog.length);
  /**
   * Wohin die freie Stelle nach dem letzten Band fuehrt. Vorerst die
   * Kontaktseite; sobald dort der Abschnitt fuer Einsendungen steht, zeigt
   * die Sprungmarke genau dorthin.
   */
  const einsendungen = '/kontakt#einsendungen';

  function blaetternAnsichtSetzen() {
    const buch = katalog[aktiverIndex];
    const imFokus = modus !== 'browse';
    el.blaetternZahl.textContent = katalognummer(aktiverIndex + 1);
    el.blaetternTitel.textContent = buch.shortTitle;
    el.blaetternAutor.textContent = buch.author;
    // Die Nachbarn stehen namentlich am Rand. Kein Umlauf: vor dem ersten
    // Band ist nichts, nach dem letzten die freie Stelle.
    const davor = aktiverIndex - 1;
    const danach = aktiverIndex + 1;
    const amAnfang = davor < 0;
    const amEnde = danach > katalog.length - 1;
    const gekuerzt = (titel: string) =>
      titel.length > 24 ? `${titel.slice(0, 23).trimEnd()}…` : titel;
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
      el.nachbarZahlZurueck.textContent = katalognummer(davor + 1);
      el.nachbarTitelZurueck.textContent = `— ${nachbarTitel(davor)}`;
      el.zurueck.setAttribute(
        'aria-label',
        `Vorheriger Band — ${katalog[davor].title}`,
      );
    }

    // Nach dem letzten Band kommt kein Umlauf, sondern die freie Stelle:
    // die naechste Nummer, noch ohne Buch, und der Weg zu den Einsendungen.
    if (amEnde) {
      el.nachbarZahlVor.textContent = katalognummer(katalog.length + 1);
      el.nachbarTitelVor.textContent = 'Vakant —';
      el.vor.setAttribute(
        'aria-label',
        `${katalognummer(katalog.length + 1)} — vakant. Zu den Einsendungen`,
      );
    } else {
      el.nachbarZahlVor.textContent = katalognummer(danach + 1);
      el.nachbarTitelVor.textContent = `${nachbarTitel(danach)} —`;
      el.vor.setAttribute(
        'aria-label',
        `Nächster Band — ${katalog[danach].title}`,
      );
    }
    el.ticks.forEach((tick, index) => {
      const ist = index === aktiverIndex;
      tick.classList.toggle('is-active', ist);
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
    el.panelAugenbraue.textContent = katalognummer(gewaehlterIndex + 1);
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
    el.wendenText.textContent = doppelband
      ? seite === 'vorn'
        ? `Wenden zu „${buch.back?.shortTitle ?? ''}“`
        : `Wenden zu „${buch.shortTitle}“`
      : 'Band wenden';
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
    const ziel = aktiverIndex + richtung;
    // Vor dem ersten Band ist nichts.
    if (ziel < 0) return;
    // Nach dem letzten die freie Stelle: dort geht es zu den Einsendungen.
    if (ziel > katalog.length - 1) {
      window.location.href = einsendungen;
      return;
    }
    if (modus === 'browse') engine?.presentBook(ziel);
    else engine?.inspectOther(ziel, richtung);
  }
  // Pfeiltaste rechts am letzten Band fuehrt ebenfalls zu den Einsendungen.
  // Alles andere macht die Engine selbst; sie schlaegt an den Enden an.
  window.addEventListener('keydown', (ereignis) => {
    if (ereignis.key !== 'ArrowRight') return;
    if (aktiverIndex !== katalog.length - 1) return;
    const ziel = ereignis.target as HTMLElement | null;
    if (ziel?.isContentEditable || ziel instanceof HTMLInputElement) return;
    window.location.href = einsendungen;
  });

  el.zurueck.addEventListener('click', () => nachbar(-1));
  el.vor.addEventListener('click', () => nachbar(1));
  // Ein Klick auf die Nummer holt den Band heraus und stellt ihn auf. Die
  // Beschreibung kommt erst, wenn man dann auf den Band selbst klickt.
  el.ticks.forEach((tick, index) => {
    tick.addEventListener('click', () => {
      // Im Regal: nur herausholen. Beim aufgeschlagenen Band: direkt zum
      // naechsten weiterblättern, ohne Umweg über das Regal.
      if (modus === 'browse') engine?.presentBook(index);
      else engine?.inspectOther(index);
    });
  });
  // Kurzer Hinweis beim Aufschlagen: dass die Textfläche weiterblättert,
  // sieht man ihr nicht an. Er geht von selbst wieder weg — und sofort,
  // sobald wirklich gewischt wurde.
  let hinweisUhr: number | undefined;
  function wischHinweisZeigen() {
    if (!matchMedia('(pointer: coarse)').matches) return;
    if (gewaehlterIndex === null || katalog.length < 2) return;
    const text =
      gewaehlterIndex === 0
        ? 'Unten nach rechts wischen → nächster Band'
        : gewaehlterIndex === katalog.length - 1
          ? '← Unten nach links wischen → vorheriger Band'
          : 'Unten wischen blättert weiter';
    el.wischHinweis.textContent = text;
    el.wischHinweis.classList.add('is-sichtbar');
    window.clearTimeout(hinweisUhr);
    hinweisUhr = window.setTimeout(wischHinweisVerstecken, 2800);
  }

  function wischHinweisVerstecken() {
    window.clearTimeout(hinweisUhr);
    el.wischHinweis.classList.remove('is-sichtbar');
  }

  // Geblättert wird unten auf der Tafel. Über dem Band bleibt die Hand
  // zum Drehen und Zoomen frei.
  let wischStart: { x: number; y: number } | null = null;
  el.panel.addEventListener('pointerdown', (ereignis) => {
    if (ereignis.pointerType !== 'touch') return;
    wischStart = { x: ereignis.clientX, y: ereignis.clientY };
  });
  el.panel.addEventListener('pointerup', (ereignis) => {
    if (!wischStart || ereignis.pointerType !== 'touch') return;
    const dx = ereignis.clientX - wischStart.x;
    const dy = ereignis.clientY - wischStart.y;
    wischStart = null;
    // Senkrecht ist Lesen, waagerecht ist Blättern.
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (gewaehlterIndex === null) return;
    wischHinweisVerstecken();
    engine?.inspectOther(gewaehlterIndex + (dx > 0 ? 1 : -1));
  });
  el.panel.addEventListener('pointercancel', () => {
    wischStart = null;
  });

  el.zurRegal.addEventListener('click', () => engine?.returnToShelf());
  el.wenden.addEventListener('click', () => engine?.flipBook());

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
        if (modus === 'inspect' && vorher !== 'inspect') wischHinweisZeigen();
        if (modus === 'browse' || modus === 'returning') {
          wischHinweisVerstecken();
          wipeAufraeumen();
        }
      },
      // Der Wechsel ist ein Abblender: das Licht geht aus, im Dunkeln
      // wechselt der Text, dann kommt das Licht zurueck. Nichts faehrt
      // seitwaerts — die Engine sagt Bild fuer Bild, wie viel Licht da ist.
      onSwap: (index) => {
        wischHinweisVerstecken();
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
      onReady: () => {
        wurzel.classList.add('is-ready');
        wurzel.querySelector('[data-ladeschirm]')?.setAttribute('aria-hidden', 'true');
      },
    });
  }

  void starten().catch(aufgeben);

  // Astro laedt Seiten im Browser neu ein; ein zurueckgelassener
  // WebGL-Kontext waere ein Leck.
  window.addEventListener('beforeunload', () => {
    abgebrochen = true;
    engine?.dispose();
    engine = null;
  });
}
