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
  /** Bei Wendebaenden beide Titel, mit Schraegstrich. */
  titel: string;
  /** Beide Namen, mit Schraegstrich — schreibt eine Person beide
      Geschichten, steht sie nur einmal da. */
  autor: string;
  /**
   * Was im Verzeichnis steht: die **Klammer** um beide Seiten
   * (`klammer`), und nur wo die fehlt der Klappentext der ersten Seite
   * als Notloesung.
   *
   * Die Liste hat damit weiterhin keinen eigenen Text — sie hat einen
   * anderen: der Klappentext gehoert einer Geschichte, die Klammer
   * gehoert dem Band. Im Verzeichnis stand vorher nur die Haelfte jedes
   * Wendebands.
   */
  klappentext: string;
  /** Steht die Klammer wirklich da, oder ist es der Notbehelf? */
  geklammert: boolean;
  /** Ein Umschlag, bei Wendebaenden zwei. */
  seiten: Umschlagseite[];
  /** Ist es ein Wendeband? Dann steht die Marke daneben. */
  wendeband: boolean;
  /** Zustand — die einzige Angabe, die in der Liste steht. */
  stand: string;
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
        klappentext: d.klammer ?? d.klappentext,
        geklammert: d.klammer !== undefined,
        wendeband: hinten !== undefined,
        stand: d.verfuegbarkeit,
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
      ({ buch }) => !buch.data.blind && !buch.data.blatt && !buch.data.magazin,
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
function absaetzeLesen(text: string): ExcerptPart[][] {
  const marke = /\[\[([^\]]*)\]\]/g;
  const absaetze = text
    .split(/\n\s*\n/)
    .map((absatz) => absatz.trim())
    .filter((absatz) => absatz.length > 0);

  return absaetze.map((absatz) => {
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
}

/** Der letzte Balken schliesst die Zeile — der Satz bricht ab. */
function letztenBalkenSchliessen(absaetze: ExcerptPart[][]) {
  const abschluss = absaetze.at(-1)?.at(-1);
  if (abschluss && 'bar' in abschluss) abschluss.last = true;
}

function leseprobeLesen(
  text: string | undefined,
  seite: number,
  bild?: string,
  geschwaerzt?: string[],
  schluss?: string,
  fortsetzung?: string,
  halb?: string,
): BookExcerpt {
  const seiten = {
    ...(halb ? { halfImage: halb } : {}),
    ...(geschwaerzt?.length ? { blackImages: geschwaerzt } : {}),
    ...(schluss ? { closingImage: schluss } : {}),
  };
  // Liegt die echte Seite als Bild vor, gibt es nichts zu setzen: das Buch
  // hat seinen Satz schon, samt gedruckter Schwaerzung.
  if (bild) return { page: seite, paragraphs: [], image: bild, ...seiten };
  if (!text) return { page: seite, paragraphs: [], ...seiten };

  const paragraphs = absaetzeLesen(text);
  const continuation = fortsetzung ? absaetzeLesen(fortsetzung) : undefined;

  // Abgebrochen wird dort, wo die Probe wirklich aufhoert: laeuft der Satz
  // auf der rechten Seite weiter, schliesst der Balken dort — sonst auf
  // der linken.
  letztenBalkenSchliessen(continuation ?? paragraphs);

  return {
    page: seite,
    paragraphs,
    ...(continuation?.length ? { continuation } : {}),
    ...seiten,
  };
}

/**
 * **Die Adresse eines Bandes ist seine Nummer.** `/band-001`, und die
 * beiden Vorderseiten darunter als `/band-001/a` und `/band-001/b`.
 *
 * Frueher stand hier `/programm/{slug}` — der Dateiname als Adresse. Das
 * war ein Nebenprodukt der Ablage: dieselbe Sache hiess im Regal 001, auf
 * dem Buchruecken 001 und in der Adresszeile `weine-nicht-artur`. Jetzt
 * heisst sie ueberall gleich. Die alten Adressen leiten dauerhaft hierher
 * (`pages/_redirects.ts`).
 *
 * Ohne Nummer gibt es keine Bandseite: Blatt und Heft sind keine Baende.
 * Fuer sie fuehrt der Weg in den Stapel zurueck.
 */
export function bandPfad(nummer: string | undefined, seite?: 'a' | 'b'): string {
  if (!nummer) return '/';
  return seite ? `/band-${nummer}/${seite}` : `/band-${nummer}`;
}

/** Ein Band mit seiner Nummer — die Grundlage jeder Bandroute. */
export type Bandroute = { buch: Buch; nummer: string };

/**
 * Alle Baende, die eine eigene Seite bekommen — in Regalordnung, mit
 * ihrer Nummer.
 *
 * **Eine Liste, drei Abnehmer:** die Route `/band-{nn}`, die beiden
 * Tiefverweise darunter und die Tabelle der Weiterleitungen. Frueher
 * rechnete jede dieser Stellen die Nummern selbst aus; dann mussten drei
 * Stellen gleichzeitig geaendert werden, wenn ein Band dazukam.
 */
export async function bandRouten(): Promise<Bandroute[]> {
  const buecher = await alleBuecher();
  const nummern = nummernFolge(buecher);
  return buecher
    .map((buch, position) => ({ buch, nummer: nummern[position] }))
    .filter((eintrag): eintrag is Bandroute => Boolean(eintrag.nummer))
    /*
     * **Der Blindband bekommt keine.**
     *
     * Eine Bandseite ist die Textfassung eines Buches — Titelpaar, zwei
     * Klappentexte, zwei Zitate, Angaben, Bestellzeile. Der Rohling hat
     * von alledem nichts, weil es ihn nicht gibt; die Seite haette
     * Ueberschriften ueber leeren Feldern gezeigt und damit behauptet,
     * da sei ein Buch.
     *
     * Er bleibt, was er ist: eine offene Stelle im Stapel. Man kommt an
     * ihn heran, indem man ihn anfasst, und was zu sagen ist — was
     * eingeschickt werden soll und wohin — steht auf der Tafel daneben.
     */
    .filter(({ buch }) => !buch.data.blind);
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
    // Die Adresse ist die Nummer. Ohne Nummer — Blatt, Heft — gibt es
    // keine Bandseite, und der Verweis fuehrt in den Stapel zurueck.
    // Blatt, Heft und Blindband haben keine Bandseite — sie fuehren
    // dorthin zurueck, wo sie wirklich liegen.
    url: bandPfad(
      d.blind || ausserDerReihe(buch) ? undefined : (nummer ?? releasenummer(position)),
    ),
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
            d.leseprobe.schluss,
            d.leseprobe.fortsetzung,
            d.leseprobe.halb,
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
                    d.rueckseite.leseprobe.schluss,
                    d.rueckseite.leseprobe.fortsetzung,
                    d.rueckseite.leseprobe.halb,
                  ),
                }
              : {}),
          },
        }
      : {}),
  };
}

/** Hat der Band zwei Vorderseiten? */
export function istWendeband(buch: Buch): boolean {
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
