import { getCollection, type CollectionEntry } from 'astro:content';
import type { BookExcerpt, CatalogBook, ExcerptPart } from './shelf/katalog';
import { siteConfig } from './shelf/verlag-config';

export type Buch = CollectionEntry<'buecher'>;

/**
 * Alle veroeffentlichten Buecher in Regal-Reihenfolge.
 *
 * Ohne `reihenfolge` sortiert das Regal von hoch nach niedrig — so steht die
 * Reihe ruhig und kippt optisch nicht. Sobald ein Buch eine `reihenfolge`
 * traegt, stehen diese Buecher zuerst und in genau dieser Ordnung.
 */
export async function alleBuecher(): Promise<Buch[]> {
  const buecher = await getCollection('buecher', ({ data }) => !data.entwurf);
  return buecher.sort((links, rechts) => {
    const a = links.data.reihenfolge;
    const b = rechts.data.reihenfolge;
    if (a !== undefined && b !== undefined) return a - b;
    if (a !== undefined) return -1;
    if (b !== undefined) return 1;
    return rechts.data.hoehe - links.data.hoehe;
  });
}

/** Eine der beiden Vorderseiten, so wie sie in der Liste erscheint. */
export type Umschlagseite = {
  cover_bild?: string;
  cover_farbe: string;
  akzent_farbe: string;
};

export type ProgrammEintrag = {
  buch: Buch;
  nummer: string;
  /** Bei Doppelbaenden beide Titel, mit Schraegstrich. */
  titel: string;
  /** Beide Namen, mit Schraegstrich — schreibt eine Person beide
      Geschichten, steht sie nur einmal da. */
  autor: string;
  /** Ein Umschlag, bei Doppelbaenden zwei. */
  seiten: Umschlagseite[];
};

/**
 * Das Programm als Liste: der neueste Band oben, der aelteste unten.
 *
 * Die Releasenummer haengt am Buch, nicht an der Zeile — sie kommt aus der
 * Regalordnung (001 ist der erste Band) und bleibt deshalb dieselbe, egal wie
 * herum die Liste sortiert ist.
 *
 * In der Liste stehen nur Baende. Der Blindband (`blind`), das Blatt
 * (`blatt`) und das Heft (`magazin`) fallen heraus: das erste ist die
 * offene Stelle, das zweite ein Bogen Papier, das dritte eine Zeitschrift —
 * alle drei gehoeren in den Stapel, nicht in die Bibliografie. Die Nummern
 * der uebrigen Baende aendern sich nicht: gezaehlt wird vor dem
 * Aussortieren.
 */
export async function programmListe(): Promise<ProgrammEintrag[]> {
  const buecher = await alleBuecher();
  const nummern = nummernFolge(buecher);
  return buecher
    .map((buch, position) => {
      const d = buch.data;
      const hinten = d.rueckseite;
      // Ohne eigene Angabe erbt die zweite Seite Autor und Farben von vorn.
      const autorHinten = hinten?.autor ?? d.autor;
      const namen =
        hinten && autorHinten !== d.autor
          ? `${d.autor} / ${autorHinten}`
          : d.autor;

      return {
        buch,
        nummer: nummern[position] ?? '',
        titel: hinten ? `${d.titel} / ${hinten.titel}` : d.titel,
        autor: namen,
        seiten: [
          {
            cover_farbe: d.cover_farbe,
            akzent_farbe: d.akzent_farbe,
            ...(d.cover_bild ? { cover_bild: d.cover_bild } : {}),
          },
          ...(hinten
            ? [
                {
                  cover_farbe: hinten.cover_farbe ?? d.cover_farbe,
                  akzent_farbe: hinten.akzent_farbe ?? d.akzent_farbe,
                  ...(hinten.cover_bild ? { cover_bild: hinten.cover_bild } : {}),
                },
              ]
            : []),
        ],
      };
    })
    .filter(
      ({ buch }) =>
        !buch.data.blind && !buch.data.blatt && !buch.data.magazin,
    )
    .reverse();
}


/**
 * Uebersetzt den Text einer Leseprobe in Absaetze aus Text- und
 * Balkenstuecken — und schneidet dabei heraus, was geschwaerzt ist.
 *
 * `[[Klartext]]` wird zu einem Balken, der so breit ist wie der Klartext
 * lang. Der Klartext selbst bleibt hier: er geht nicht in den Rueckgabewert
 * und steht deshalb in keinem ausgelieferten HTML. Das ist der ganze Sinn
 * der Sache — ein Balken, unter dem etwas steht, das sich im Quelltext
 * nachlesen liesse, waere keiner.
 *
 * `[[|18]]` setzt einen Balken ohne Klartext, achtzehn Zeichen breit.
 *
 * Endet die Probe auf einem Balken, schliesst dieser die letzte Zeile ab
 * (`last`) — der Satz hoert mitten drin auf, und der Rest ist weg.
 */
function leseprobeLesen(
  text: string | undefined,
  seite: number,
  bild?: string,
  geschwaerzt?: string[],
): BookExcerpt {
  const seiten = geschwaerzt?.length ? { blackImages: geschwaerzt } : {};
  // Liegt die echte Seite als Bild vor, gibt es nichts zu setzen: das Buch
  // hat seinen Satz schon, samt gedruckter Schwaerzung.
  if (bild) return { page: seite, paragraphs: [], image: bild, ...seiten };
  if (!text) return { page: seite, paragraphs: [], ...seiten };
  const marke = /\[\[([^\]]*)\]\]/g;
  const absaetze = text
    .split(/\n\s*\n/)
    .map((absatz) => absatz.trim())
    .filter((absatz) => absatz.length > 0);

  const paragraphs = absaetze.map((absatz) => {
    const stuecke: ExcerptPart[] = [];
    let gelesen = 0;
    for (const treffer of absatz.matchAll(marke)) {
      const davor = absatz.slice(gelesen, treffer.index);
      if (davor) stuecke.push({ text: davor.replace(/\s+/g, ' ') });
      const inhalt = treffer[1];
      // „|18" heisst: achtzehn Zeichen breit, ohne Klartext darunter.
      const eigeneBreite = /^\|\s*(\d+)$/.exec(inhalt);
      const zeichen = eigeneBreite
        ? Number(eigeneBreite[1])
        : inhalt.trim().length;
      // Zu schmal liest sich wie ein Druckfehler, zu breit sprengt die
      // Spalte. Zwei bis vierzig Zeichen.
      stuecke.push({ bar: Math.min(40, Math.max(2, zeichen)) });
      gelesen = (treffer.index ?? 0) + treffer[0].length;
    }
    const rest = absatz.slice(gelesen);
    if (rest) stuecke.push({ text: rest.replace(/\s+/g, ' ') });
    return stuecke;
  });

  // Der letzte Balken des letzten Absatzes schliesst die Zeile.
  const letzter = paragraphs.at(-1);
  const abschluss = letzter?.at(-1);
  if (abschluss && 'bar' in abschluss) abschluss.last = true;

  return { page: seite, paragraphs, ...seiten };
}

/** Adresse der Buchseite. */
export function buchPfad(buch: Buch): string {
  return `/programm/${buch.id}`;
}

/**
 * Uebersetzt einen Eintrag der Sammlung in den Datensatz, den die
 * Regal-Engine erwartet. Diese Funktion ist die einzige Stelle, an der die
 * deutschen Feldnamen der Inhalte auf die englischen der uebernommenen
 * Engine treffen.
 */
export function alsKatalogBuch(
  buch: Buch,
  position = 0,
  nummer?: string,
): CatalogBook {
  const d = buch.data;
  return {
    id: buch.id,
    // Blatt und Heft bekommen keine — sie stehen nicht in der Reihe.
    release: nummer ?? (ausserDerReihe(buch) ? '' : releasenummer(position)),
    title: d.titel,
    shortTitle: d.kurztitel ?? d.titel,
    author: d.autor,
    description: d.klappentext,
    quote: d.zitat,
    quoteBy: d.zitat_von,
    format: d.format,
    availability: d.verfuegbarkeit,
    url: buchPfad(buch),
    linkLabel: siteConfig.bookLinkLabel,
    cover: d.cover_farbe,
    accent: d.akzent_farbe,
    ink: d.schrift_farbe,
    motif: d.motiv,
    height: d.hoehe,
    thickness: d.dicke,
    widthRatio: d.breite_verhaeltnis,
    ...(d.cover_bild ? { coverImage: d.cover_bild } : {}),
    ...(d.ruecken_bild ? { spineImage: d.ruecken_bild } : {}),
    ...(d.lebendig ? { living: true } : {}),
    ...(d.bestell_link ? { orderUrl: d.bestell_link } : {}),
    ...(d.seiten_zahl ? { pages: d.seiten_zahl } : {}),
    ...(d.leseprobe_schrift ? { excerptFont: d.leseprobe_schrift } : {}),
    ...(d.leseprobe
      ? {
          excerpt: leseprobeLesen(
            d.leseprobe.text,
            d.leseprobe.seite,
            d.leseprobe.bild,
            d.leseprobe.geschwaerzt,
          ),
        }
      : {}),
    ...(d.blind ? { blind: true } : {}),
    ...(d.blatt ? { sheet: true } : {}),
    ...(d.magazin
      ? {
          magazine: {
            pages: d.magazin.seiten,
            folder: d.magazin.ordner,
          },
        }
      : {}),
    ...(d.rueckseite
      ? {
          back: {
            title: d.rueckseite.titel,
            shortTitle: d.rueckseite.kurztitel ?? d.rueckseite.titel,
            // Ohne eigene Angabe steht dieselbe Person wie vorn.
            author: d.rueckseite.autor ?? d.autor,
            description: d.rueckseite.klappentext,
            quote: d.rueckseite.zitat ?? d.zitat,
            quoteBy: d.rueckseite.zitat_von ?? d.zitat_von,
            cover: d.rueckseite.cover_farbe ?? d.cover_farbe,
            accent: d.rueckseite.akzent_farbe ?? d.akzent_farbe,
            ink: d.rueckseite.schrift_farbe ?? d.schrift_farbe,
            motif: d.rueckseite.motiv ?? d.motiv,
            ...(d.rueckseite.cover_bild
              ? { coverImage: d.rueckseite.cover_bild }
              : {}),
            ...(d.rueckseite.leseprobe
              ? {
                  excerpt: leseprobeLesen(
                    d.rueckseite.leseprobe.text,
                    d.rueckseite.leseprobe.seite,
                    d.rueckseite.leseprobe.bild,
                    d.rueckseite.leseprobe.geschwaerzt,
                  ),
                }
              : {}),
          },
        }
      : {}),
  };
}

/** Hat der Band zwei Vorderseiten? */
export function istDoppelband(buch: Buch): boolean {
  return buch.data.rueckseite !== undefined;
}

/** Dreistellige Releasenummer, wie sie auf dem Buchruecken steht. */
export function releasenummer(position: number): string {
  return String(position + 1).padStart(3, '0');
}

/** Liegt der Eintrag bloss im Stapel, ohne in der Reihe zu stehen? */
export function ausserDerReihe(buch: Buch): boolean {
  return buch.data.blatt || buch.data.magazin !== undefined;
}

/**
 * Die Nummern des ganzen Programms, in Regalordnung.
 *
 * **Blatt und Heft zaehlen nicht mit.** Keins von beiden ist ein Band: sie
 * haben keinen Ruecken, keine Nummer und keinen Platz in der Reihe — sie
 * liegen im Stapel, und man kommt an sie heran, indem man sie anfasst. Ohne
 * diese Ausnahme ruecken alle Baende hinter ihnen weiter, und der
 * Blindband, der die offene Stelle markiert, traegt ploetzlich 011 statt
 * 009.
 */
export function nummernFolge(buecher: Buch[]): Array<string | undefined> {
  let zaehler = 0;
  return buecher.map((buch) =>
    ausserDerReihe(buch) ? undefined : releasenummer(zaehler++),
  );
}

/** Der ganze Katalog, fertig fuer die Engine. */
export async function katalogFuerRegal(): Promise<CatalogBook[]> {
  const buecher = await alleBuecher();
  const nummern = nummernFolge(buecher);
  return buecher.map((buch, position) =>
    alsKatalogBuch(buch, position, nummern[position]),
  );
}
