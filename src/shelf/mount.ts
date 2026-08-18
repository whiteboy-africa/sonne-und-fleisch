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
    ticks: Array.from(wurzel.querySelectorAll<HTMLButtonElement>('[data-tick]')),
    panel: pflicht<HTMLElement>(wurzel, '[data-panel]'),
    panelInhalt: pflicht<HTMLElement>(wurzel, '[data-panel-inhalt]'),
    panelText: pflicht<HTMLElement>(wurzel, '[data-panel-text]'),
    wischHinweis: pflicht<HTMLElement>(wurzel, '[data-wisch-hinweis]'),
    panelZahl: pflicht(wurzel, '[data-panel-zahl]'),
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
    seitenmarke: pflicht<HTMLElement>(wurzel, '[data-seitenmarke]'),
    status: pflicht(wurzel, '[data-status-text]'),
    vorlese: pflicht(wurzel, '[data-vorlese]'),
  };

  let engine: ShelfEngine | null = null;
  let aktiverIndex = 0;
  let gewaehlterIndex: number | null = null;
  let modus: ShelfMode = 'browse';
  let seite: BookSide = 'vorn';

  const gesamt = katalognummer(katalog.length);

  function blaetternAnsichtSetzen() {
    const buch = katalog[aktiverIndex];
    const imFokus = modus !== 'browse';
    el.blaetternZahl.textContent = katalognummer(aktiverIndex + 1);
    el.blaetternTitel.textContent = buch.shortTitle;
    el.blaetternAutor.textContent = buch.author;
    el.zurueck.disabled = aktiverIndex === 0;
    el.vor.disabled = aktiverIndex === katalog.length - 1;
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
    el.panelZahl.textContent = katalognummer(gewaehlterIndex + 1);
    el.panelTitel.textContent = gezeigt.title;
    el.panelAutor.textContent = gezeigt.author;
    el.panelKlappentext.textContent = gezeigt.description;
    el.panelZitat.textContent = `„${gezeigt.quote}“`;
    el.panelZitatVon.textContent = gezeigt.quoteBy;

    // Umdrehen kann man jeden Band. Nur beim Doppelcover steht auf der
    // anderen Seite eine zweite Geschichte — dann sagt der Knopf das auch.
    el.seitenmarke.hidden = !doppelband;
    el.wendenText.textContent = doppelband
      ? seite === 'vorn'
        ? `Flip zu „${buch.back?.shortTitle ?? ''}“`
        : `Flip zu „${buch.shortTitle}“`
      : 'Flip book';
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
      el.seitenmarke.textContent = seite === 'vorn' ? 'Seite A' : 'Seite B';
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
    const ziel = Math.min(
      katalog.length - 1,
      Math.max(0, aktiverIndex + richtung),
    );
    if (modus === 'browse') engine?.presentBook(ziel);
    else engine?.inspectOther(ziel);
  }
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
    `Regal mit ${katalog.length} Bänden. Pfeiltasten blättern, Ziehen dreht die Ansicht, Eingabetaste holt den Band nach vorn.`,
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
    el.status.textContent = 'Das Regal laesst sich hier nicht aufbauen';
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
        if (modus === 'browse') wischHinweisVerstecken();
      },
      // Der Text fährt mit dem Band mit — gleiche Richtung, gleiche Dauer,
      // gleiche Kurve, und beide Texte bewegen sich gleichzeitig: der alte
      // hinaus, der neue herein. Nacheinander sah es aus, als wische die
      // Seite in zwei Hälften. Kopf- und Fußzeile bleiben stehen; bewegt
      // wird nur der Block, der zum Band gehört.
      onSwap: (index, richtung, dauer, weg) => {
        wischHinweisVerstecken();
        const text = el.panelText;
        // Genau der Weg des Bandes, in Pixeln. Vorher fuhr der Text nur
        // seine eigene Tafelbreite — ein Drittel der Strecke in derselben
        // Zeit, und darum sah es aus wie zwei getrennte Hälften.
        const strecke = weg * richtung;
        // easeOutCubic, dieselbe Kurve, mit der die Engine den Band schiebt.
        const kurve = 'cubic-bezier(0.215, 0.61, 0.355, 1)';

        // Der alte Text bleibt als Kopie stehen und faehrt hinaus, waehrend
        // das Original schon den neuen Band zeigt und hereinkommt.
        const masse = text.getBoundingClientRect();
        const rahmen = wurzel.getBoundingClientRect();
        const kopie = text.cloneNode(true) as HTMLElement;
        kopie.setAttribute('aria-hidden', 'true');
        kopie.setAttribute('inert', '');
        kopie.classList.add('book-details__copy--kopie');
        Object.assign(kopie.style, {
          left: `${masse.left - rahmen.left}px`,
          top: `${masse.top - rahmen.top}px`,
          width: `${masse.width}px`,
          height: `${masse.height}px`,
        });
        kopie.scrollTop = text.scrollTop;
        // In die ganze Flaeche gehaengt, nicht in die Tafel: so faehrt der
        // Text neben dem Band ueber den Schirm und verschwindet erst am
        // Bildrand. Die Tafel ist ohnehin schwarz wie der Rest.
        wurzel.appendChild(kopie);

        const bewegung: KeyframeAnimationOptions = {
          duration: dauer,
          easing: kurve,
          fill: 'forwards',
        };
        const hinaus = kopie.animate(
          [
            { transform: 'translateX(0)' },
            { transform: `translateX(${-strecke}px)` },
          ],
          bewegung,
        );

        gewaehlterIndex = index;
        aktiverIndex = index;
        // Die Seite wird nicht zurueckgesetzt: sie kommt aus der Engine,
        // die beim Blaettern A bei A und B bei B laesst.
        panelSetzen();
        blaetternAnsichtSetzen();
        vorleseSetzen();
        text.scrollTop = 0;

        const herein = text.animate(
          [
            { transform: `translateX(${strecke}px)` },
            { transform: 'translateX(0)' },
          ],
          { duration: dauer, easing: kurve },
        );

        // Aufraeumen in jedem Fall: bricht eine Bewegung ab, bliebe die
        // Kopie sonst fuer immer ueber der Tafel liegen.
        const aufraeumen = () => {
          hinaus.cancel();
          kopie.remove();
        };
        Promise.allSettled([hinaus.finished, herein.finished]).then(
          aufraeumen,
          aufraeumen,
        );
      },
      onSide: (naechsteSeite) => {
        seite = naechsteSeite;
        panelSetzen();
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
