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
    ansehen: pflicht<HTMLButtonElement>(wurzel, '[data-ansehen]'),
    zurueck: pflicht<HTMLButtonElement>(wurzel, '[data-zurueck]'),
    vor: pflicht<HTMLButtonElement>(wurzel, '[data-vor]'),
    ticks: Array.from(wurzel.querySelectorAll<HTMLButtonElement>('[data-tick]')),
    panel: pflicht(wurzel, '[data-panel]'),
    panelInhalt: pflicht<HTMLElement>(wurzel, '[data-panel-inhalt]'),
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
    el.ansehen.disabled = imFokus;
    el.ansehen.setAttribute('aria-label', `${buch.title} ansehen`);
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
  el.ansehen.addEventListener('click', () => engine?.presentBook(aktiverIndex));
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
        modus = naechsterModus;
        gewaehlterIndex = index;
        blaetternAnsichtSetzen();
        panelSetzen();
        vorleseSetzen();
      },
      // Der Text fährt mit dem Band mit: erst hinaus, dann kommt der neue
      // von der anderen Seite herein. Die ganze Detailseite wechselt, als
      // stünden alle Bände nebeneinander auf einer Linie.
      onSwap: (index, richtung) => {
        const strecke = 56 * richtung;
        const hinaus = el.panelInhalt.animate(
          [
            { transform: 'translateX(0)', opacity: 1 },
            { transform: `translateX(${-strecke}px)`, opacity: 0 },
          ],
          { duration: 210, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
        );

        const umschalten = () => {
          gewaehlterIndex = index;
          aktiverIndex = index;
          seite = 'vorn';
          panelSetzen();
          blaetternAnsichtSetzen();
          vorleseSetzen();
          // Erst die alte Bewegung loeschen, dann die neue starten. Sonst
          // bliebe der Text bei „durchsichtig und verschoben" stehen, falls
          // die Eintrittsbewegung nicht durchkommt — die Endlage von
          // `fill: forwards` haelt sich sonst ewig.
          hinaus.cancel();
          el.panelInhalt.animate(
            [
              { transform: `translateX(${strecke}px)`, opacity: 0 },
              { transform: 'translateX(0)', opacity: 1 },
            ],
            { duration: 280, easing: 'cubic-bezier(0, 0, 0.2, 1)' },
          );
        };

        hinaus.finished.then(umschalten).catch(umschalten);
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
