import { getCollection, type CollectionEntry } from 'astro:content';
import type { CatalogBook } from './shelf/katalog';
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

/**
 * Das Programm als Liste: der neueste Band oben, der aelteste unten.
 *
 * Die Releasenummer haengt am Buch, nicht an der Zeile — sie kommt aus der
 * Regalordnung (001 ist der erste Band) und bleibt deshalb dieselbe, egal wie
 * herum die Liste sortiert ist.
 */
export async function programmListe(): Promise<
  Array<{ buch: Buch; nummer: string }>
> {
  const buecher = await alleBuecher();
  return buecher
    .map((buch, position) => ({ buch, nummer: releasenummer(position) }))
    .reverse();
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
export function alsKatalogBuch(buch: Buch, position = 0): CatalogBook {
  const d = buch.data;
  return {
    id: buch.id,
    release: releasenummer(position),
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

/** Der ganze Katalog, fertig fuer die Engine. */
export async function katalogFuerRegal(): Promise<CatalogBook[]> {
  return (await alleBuecher()).map((buch, position) =>
    alsKatalogBuch(buch, position),
  );
}
