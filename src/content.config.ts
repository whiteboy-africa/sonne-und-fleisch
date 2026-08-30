import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { MOTIVE, VERFUEGBARKEITEN } from './shelf/katalog';

/**
 * Die Leseprobe: eine offene Stelle in einem sonst geschwaerzten Block.
 * Jede Seite eines Wendebandes hat ihre eigene.
 *
 * **Im laufenden Text wird nicht mehr geschwaerzt.** Hier gab es einmal
 * `[[Klartext]]` — eine Marke, aus der beim Uebersetzen ein Balken wurde,
 * so breit wie der Klartext lang, und der Klartext selbst verliess den
 * Build nicht. Im Bild sah das nach Schema aus: immer dieselben kurzen
 * Balken an denselben Stellen, mitten im Satz. Die Schwaerzungen im Text
 * kommen jetzt aus der Druckdatei, wo sie hingehoeren.
 *
 * Geschwaerzt wird nur noch flaechig: die untere Haelfte der rechten
 * Seite und die ganze Seite danach — dort volle Zeilen
 * (`shelf/schwaerzung.ts`).
 */
const leseprobe = z
  .object({
    // Die Seitenzahl, auf der das Fenster steht — die **im Buch**, nicht die
    // im PDF. Sie steht in der Kolumne und in der Zeile „Leseprobe — S. 47".
    seite: z.number().int().min(1),
    // Genau eine Buchseite Prosa — die linke Seite der aufgeschlagenen
    // Doppelseite. Sie laeuft bis an den Fuss und geht rechts weiter.
    text: z.string().optional(),
    /**
     * Die rechte Seite, und zwar nur ihr oberes Stueck: der Satz laeuft
     * bis etwa zur Haelfte, dann kommen die Balken bis zum Fuss.
     *
     * **Wo er aufhoert, ist eine redaktionelle Entscheidung, kein
     * Messwert** — er soll an einer Stelle enden, an der man weiterlesen
     * will. Darum steht der Bruch hier als eigenes Feld und wird nicht
     * beim Aufschlagen ausgerechnet.
     *
     * Ohne `fortsetzung` bleibt die rechte Seite ganz geschwaerzt, wie
     * frueher.
     */
    fortsetzung: z.string().optional(),
    /**
     * Die **echte gesetzte Seite** als Bild, etwa
     * "/buecher/yellow-fever/leseprobe-s30.webp". Ist sie da, wird sie
     * gezeigt statt des gesetzten Textes: dann steht dort der Satz des
     * Buches mit seinen Schriften, seinem Umbruch und seinen gedruckten
     * Schwaerzungen, nicht unser Nachbau.
     *
     * Aus dem Druck-PDF geholt, auf Papierton multipliziert und als WebP
     * abgelegt (siehe AGENTS.md, „Echte Seiten aus dem Druck-PDF").
     */
    bild: z.string().optional(),
    /**
     * Die Seiten hinter dem Fenster, ebenfalls als echte Seiten — schon
     * geschwaerzt ausgespielt (`scripts/seite-schwaerzen.mjs`). In der
     * Reihenfolge, in der sie kommen. Wo keine mehr da ist, zeichnet die
     * Seite ihre Balken selbst.
     */
    /**
     * Die **halbe Seite** als echtes Bild: oben laeuft der Satz weiter,
     * unten faengt die Schwaerzung an. Ausgespielt mit
     * `node scripts/seite-schwaerzen.mjs … --kopf 0.55` — der Anteil sagt,
     * wie viel oben stehenbleibt.
     *
     * Das Gegenstueck zu `fortsetzung`: bei gesetztem Text entscheidet
     * der Redakteur, wo abgebrochen wird, bei einer echten Seite die
     * Zahl im Aufruf.
     */
    halb: z.string().optional(),
    geschwaerzt: z.array(z.string()).optional(),
    /**
     * Die **Schlussseite** als echte Seite — geschwaerzt, aber mit einer
     * ausgesparten Zone in der Mitte, in der der Stempel sitzt
     * (`node scripts/seite-schwaerzen.mjs … --stanze 0.40 0.66`).
     *
     * Ohne sie zeichnet die Schlussseite ihre Balken selbst. Das faellt
     * auf, sobald die Seiten davor echt sind: andere Schrift, anderes
     * Papier, anderer Zeilenfall — man sieht dem Band an, dass die
     * letzte Doppelseite nachgebaut ist.
     */
    schluss: z.string().optional(),
  })
  .refine((werte) => Boolean(werte.text || werte.bild), {
    message: 'Eine Leseprobe braucht entweder `text` oder `bild`.',
  });

// Ein Buch = eine Datei in src/content/buecher/. Der Dateiname ist der Slug
// und damit die Adresse (/programm/<slug>) und der stabile Schluessel fuer
/*
 * **Der Untertitel der einzelnen Geschichte**, nicht des Bandes. Manche
 * Buecher tragen einen auf dem Titelblatt („oder: The Life and Times of
 * Robert Duval") oder auf dem Umschlag („10.000 Dead Martyrs — A Study on
 * Sensitivity"). Er gehoert dorthin, wo der Titel steht, und nirgends
 * sonst: nicht in die Programmliste, nicht in og:title, nicht in
 * og:description.
 *
 * **Sechzig Zeichen.** In der Detailspalte stehen ihm zwei Zeilen zu;
 * mehr, und er faengt an, dem Klappentext den Platz wegzunehmen und liest
 * sich wie einer. Die Grenze bricht den Bau ab statt zu warnen — eine
 * Warnung im Bau sieht niemand.
 *
 * **Eine Zeile.** Ein `|`-Block brachte einen Zeilenumbruch mit, und der
 * stand dann mitten im Untertitel. (Andersherum ist nichts zu pruefen:
 * `>-` faltet den Umbruch zu einem Leerzeichen, davon ist hinterher
 * nichts mehr zu sehen.)
 */
const untertitelFeld = z
  .string()
  .superRefine((wert, ctx) => {
    /*
     * `superRefine` und nicht `refine`: die Funktionsform von `refine`
     * bringt ihre Nachricht in dieser Zod-Fassung nicht durch, und im Bau
     * stand dann „Invalid input" — eine Meldung, die weder das Feld noch
     * die Zahl nennt und mit der niemand etwas anfangen kann.
     */
    if (wert.includes('\n')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Der Untertitel ist eine Zeile. Ohne „|" schreiben.',
      });
    }
    if (wert.length > 60) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Der Untertitel steht unter dem Titel und hat dort zwei Zeilen: höchstens 60 Zeichen, hier ${wert.length}.`,
      });
    }
  })
  .optional();

// Cover-Dateien unter public/buecher/<slug>/.
const buecher = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/buecher' }),
  schema: z.object({
    titel: z.string(),
    // Kurzfassung des Titels. Steht im Regal unter dem Band und auf dem
    // gedruckten Buchruecken — beides ist schmal, also kurz halten.
    // Fehlt sie, nimmt die Seite den vollen Titel.
    kurztitel: z.string().optional(),
    // Siehe `untertitelFeld` oben.
    untertitel: untertitelFeld,
    autor: z.string(),
    // Klappentext: erscheint im Regal, wenn der Band herausgezogen ist.
    // Zwei bis vier Saetze, mehr passt nicht ins Panel.
    klappentext: z.string(),
    /**
     * **Die Klammer: beide Seiten in ein paar Saetzen.** Sie steht im
     * Programm als Eintragstext und auf der Bandseite als Zeile unter
     * dem Titelpaar — ueberall dort, wo eine Zeile fuer den **ganzen**
     * Band gebraucht wird und nicht fuer eine seiner Geschichten.
     *
     * In der Betrachtung im Regal steht sie **nicht**: dort ist immer
     * genau eine Seite vorn, und die hat ihren eigenen Klappentext.
     *
     * Der Klappentext gehoert **einer** Seite; im Verzeichnis stand
     * damit nur die Haelfte des Bandes, und die zweite Geschichte kam
     * gar nicht vor. Das hier ist die andere Textsorte: was zwischen den
     * beiden liegt.
     *
     *     Ein Klaeffer in einem Wiener Hinterhof, eine Ziege an den
     *     Tafeln von Damaskus. Tiere, an denen Menschen sich erklaeren.
     *
     * Zwei bis drei Saetze: erst beide Geschichten in je einem Halbsatz,
     * dann der Satz, der sie zusammenhaelt. Die Nummer gehoert nicht
     * hinein — die steht in ihrer eigenen Spalte.
     *
     * Ohne Angabe faellt das Programm auf den Klappentext der ersten
     * Seite zurueck. Das ist eine Notloesung; wer einen Band einstellt,
     * schreibt die Zeile.
     *
     * **Hoechstens 200 Zeichen**, und das prueft der Bau: die Klammer
     * steht in einer Liste zwischen zwei Umschlaegen und hat dort drei
     * bis vier Zeilen Platz. Laenger, und sie ist kein Eintrag mehr,
     * sondern ein zweiter Klappentext.
     */
    klammer: z.string().max(200, 'Die Klammer fasst sich kurz: höchstens 200 Zeichen.').optional(),
    // Ein Satz aus dem Buch (oder darueber) und wer ihn sagt.
    zitat: z.string(),
    zitat_von: z.string(),
    // Freitext, etwa "Broschur · 224 Seiten" oder "Leinen · 96 Seiten".
    format: z.string(),
    // Einer von drei Zustaenden: Verfuegbar, In Vorbereitung, Vergriffen.
    verfuegbarkeit: z.enum(VERFUEGBARKEITEN).default('In Vorbereitung'),

    /**
     * Die Schrift, in der der Band gesetzt ist — fuer die nachgebauten
     * Seiten der Leseprobe. Ohne Angabe die Hausserife.
     *
     * Yellow Fever ist in Times New Roman gesetzt (steht so in der
     * Druckdatei); die nachgebauten Seiten daneben sollen nicht in einer
     * anderen Serife stehen. Als CSS-Schriftfolge eintragen, etwa
     * `'Times New Roman', Times, serif`.
     */
    leseprobe_schrift: z.string().optional(),
    // Gesamtumfang des Bandes. Steht am Ende der Leseprobe: „Weiter nur
    // im Band — 224 Seiten". Ohne Angabe faellt die Zahl aus dem Satz.
    seiten_zahl: z.number().int().min(1).optional(),
    // Die Leseprobe der ersten Seite. Fehlt sie, laesst sich der Band
    // nicht aufschlagen und die Zeile „Leseprobe" steht nicht da.
    leseprobe: leseprobe.optional(),

    // Angaben nur fuer die Buchseite, nicht fuers Regal.
    isbn: z.string().optional(),
    preis: z.string().optional(),
    // Wohin die Bestellzeile auf der Buchseite fuehrt. Ohne Angabe steht
    // dort nur der Zustand als Text.
    bestell_link: z.string().optional(),
    erscheinungsdatum: z.date().optional(),
    uebersetzung_aus: z.string().optional(),
    reihe: z.string().optional(),

    // Aussehen des Bandes im Regal. Das Cover wird aus diesen Werten
    // gezeichnet — es braucht keine Bilddatei.
    cover_farbe: z.string().default('#2b2622'),
    akzent_farbe: z.string().default('#d99a3f'),
    schrift_farbe: z.string().default('#f2e9db'),
    // Eines von neunzehn festen Mustern fuer den Cover-Aufdruck.
    /**
     * **Wo der Band im Stapel liegt — unabhaengig von seiner Nummer.**
     *
     * Ohne Angabe gilt `reihenfolge`: Platz und Nummer sind dann dasselbe,
     * und der erste Band eines Stapels liegt obenauf. Wer einen Band
     * woanders hinlegen will, ohne das Programm umzunummerieren, setzt
     * hier einen eigenen Sortierschluessel. **Zwischenwerte sind
     * erlaubt** — 4,5 legt ihn zwischen den mit 4 und den mit 5.
     *
     * Die Nummer bleibt davon unberuehrt; sie kommt weiter aus
     * `reihenfolge`.
     */
    stapelplatz: z.number().optional(),
    motiv: z.enum(MOTIVE).default('lattice'),
    // Szeneneinheiten, keine Zentimeter: eine Einheit sind etwa 105 mm.
    // A5 hoch entspricht 2,0. Die Dicke folgt dem Umfang — ein 96-Seiter
    // liegt bei 0,07, ein 384-Seiter bei 0,24. Die Breite rechnet das Regal
    // aus der Hoehe (Taschenbuchformat), sie steht nicht hier.
    // Ab 1,0: niedrig genug fuer ein quer liegendes Blatt.
    hoehe: z.number().min(1.0).max(2.6).default(2),
    // Ab 0,008: duenn genug fuer ein einzelnes Blatt.
    dicke: z.number().min(0.004).max(0.2).default(0.078),
    // Breite geteilt durch Hoehe. Vorgabe ist A5 (0,705), und dabei bleibt
    // es vorerst fuer alle Baende.
    //
    // Wer das echte Format eines Buches eintragen will, rechnet es aus dem
    // Druckfile: Breite eines Deckels geteilt durch die Bogenhoehe. Dann
    // wird das Umschlagbild nicht mehr ins A5-Format gequetscht. Die Dicke
    // folgt genauso aus der Breite des Ruecken-Streifens, geteilt durch die
    // Bogenhoehe und mal der Buchhoehe.
    // Ueber 1 heisst Querformat — dafuer gibt es das Blatt im Stapel, das
    // kein Buch ist.
    breite_verhaeltnis: z.number().min(0.4).max(1.8).default(148 / 210),
    // Eigenes Cover-Bild fuer die Vorderseite, etwa
    // "/buecher/mein-buch/cover.webp". Hochformat, moeglichst 2:3.
    // Ersetzt nur die Vorderseite; Ruecken, Rueckseite und Kanten
    // behalten die Farben von oben.
    cover_bild: z.string().optional(),
    // Bild fuer den Buchruecken, etwa "/buecher/mein-buch/ruecken.webp".
    // Hochkant, schmal — beim Druckbogen der Streifen zwischen den beiden
    // Deckeln. Ohne Angabe wird der Ruecken aus den Farben gezeichnet.
    ruecken_bild: z.string().optional(),
    // Leichter wandernder Glanz auf dem Einband. Sparsam einsetzen.
    lebendig: z.boolean().default(false),
    /**
     * Blindband: der unbedruckte Rohling am Ende der Reihe. Sein Umschlag
     * bleibt leer, im Programm steht er als letzter Eintrag, und die
     * Bestellzeile lautet „Einsenden". Seine Nummer ergibt sich wie bei
     * allen anderen aus der Reihenfolge — steht `reihenfolge` hoch genug,
     * ruecken echte Baende automatisch davor.
     */
    blind: z.boolean().default(false),
    /**
     * Blatt statt Buch: ein einzelner Bogen ohne Buchblock und ohne
     * Ruecken. Fuer das Bild im Stapel, das kein Band ist.
     */
    blatt: z.boolean().default(false),

    /**
     * Magazin statt Buch: ein Heft, das sich blaettern laesst.
     *
     * Steht dieser Block da, ist der Eintrag kein Band, sondern ein
     * Sonderobjekt wie das Blatt — ohne Nummer, ohne Marke in der Leiste,
     * nicht im Programm und nicht in der Sitemap. Angeklickt schlaegt es
     * nicht auf wie ein Band, sondern geht in seine eigene Leseposition.
     *
     * Die Seiten liegen als WebP unter `ordner` und heissen `0001.webp`
     * aufwaerts; sie kommen aus `npm run magazin:build` und nicht von Hand.
     * `seiten` muss gerade sein — ein Heft hat Doppelseiten.
     *
     * Herunterladen gibt es nicht. Das Heft ist zum Blaettern da; wer eine
     * Datei mitnimmt, hat es nicht gelesen, sondern kopiert.
     */
    magazin: z
      .object({
        // So viele Seiten liegen im Ordner. Der Bau meldet die Zahl.
        seiten: z.number().int().min(2).refine((zahl) => zahl % 2 === 0, {
          message: 'Ein Heft hat eine gerade Seitenzahl.',
        }),
        ordner: z.string().default('/magazin/pages'),
      })
      .optional(),

    // Wendeband (tête-bêche): das Buch hat zwei Vorderseiten. Die zweite
    // ist kopfüber auf die Rückseite gedruckt — man dreht den Band um und
    // stellt ihn auf den Kopf, dann fängt die andere Geschichte an.
    //
    // Fehlt dieser Block, ist es ein gewöhnliches Buch: auf der Rückseite
    // steht dann das Zitat.
    rueckseite: z
      .object({
        titel: z.string(),
        kurztitel: z.string().optional(),
        // Siehe `untertitelFeld` oben. Jede Geschichte hat ihren eigenen.
        untertitel: untertitelFeld,
        // Ohne Angabe steht dieselbe Person wie vorn.
        autor: z.string().optional(),
        // Die Einführung in die andere Geschichte.
        klappentext: z.string(),
        zitat: z.string().optional(),
        zitat_von: z.string().optional(),
        // Eigenes Bild für die zweite Vorderseite.
        cover_bild: z.string().optional(),
        // Die zweite Geschichte hat ihre eigene Leseprobe — das Fenster
        // sitzt in ihrem Text, nicht in dem der ersten.
        leseprobe: leseprobe.optional(),
        // Eigene Farben und eigenes Muster. Ohne Angabe die von vorn.
        cover_farbe: z.string().optional(),
        akzent_farbe: z.string().optional(),
        schrift_farbe: z.string().optional(),
        motiv: z.enum(MOTIVE).optional(),
      })
      .optional(),

    // Platz im Regal. Ohne Angabe sortiert das Regal von hoch nach
    // niedrig, damit die Reihe ruhig steht.
    reihenfolge: z.number().optional(),
    // Entwuerfe erscheinen nicht im Regal, nicht im Programm und nicht
    // in der Sitemap.
    entwurf: z.boolean().default(false),
  }),
});

// Verlagsseiten (Verlag, Kontakt, Impressum, Datenschutz) als Markdown,
// damit sie im CMS bearbeitbar sind, ohne Astro anzufassen.
const seiten = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/seiten' }),
  schema: z.object({
    titel: z.string(),
    // Zeile unter dem Titel, optional.
    untertitel: z.string().optional(),
    // Platz in der Fusszeile. Kleinere Zahl steht weiter links.
    reihenfolge: z.number().default(100),
    // Nicht in der Fusszeile zeigen (Seite bleibt ueber ihre Adresse
    // erreichbar).
    versteckt: z.boolean().default(false),
    // Fliesstext in der Buchserife statt im Mono — fuer Texte, die aus
    // einem Buch heraus sprechen (Traktat, Leseprobe).
    buchtext: z.boolean().default(false),
    // Zeigt unten einen Weg zurueck zum neuesten Band. Fuer die Seite mit
    // den Einsendungen: dorthin kommt man ueber die freie Stelle hinter
    // dem letzten Band, und von dort muss man auch wieder zurueck.
    zurueck_zum_neuesten: z.boolean().default(false),
  }),
});

export const collections = { buecher, seiten };
