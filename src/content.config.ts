import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { MOTIVE, VERFUEGBARKEITEN } from './shelf/katalog';

/**
 * Die Leseprobe: eine einzige offene Stelle in einem sonst geschwaerzten
 * Block. Jede Seite eines Doppelbandes hat ihre eigene.
 *
 * Geschwaerzt wird **im Text selbst**, nicht ueber eine Liste von
 * Positionen daneben: `[[hier steht der Klartext]]` wird zum Balken. Was
 * zwischen den Klammern steht, verlaesst den Build nicht — es wird beim
 * Uebersetzen herausgeschnitten und kommt nie ins HTML. Nur seine Laenge
 * bleibt uebrig und wird zur Breite des Balkens. Wer einen Balken ohne
 * Klartext will, schreibt `[[|18]]` fuer achtzehn Zeichen Breite.
 *
 * Eine Liste von Positionen waere beim ersten Umschreiben des Satzes
 * verrutscht; im Text kann das nicht passieren.
 */
const leseprobe = z
  .object({
    // Die Seitenzahl, auf der das Fenster steht — die **im Buch**, nicht die
    // im PDF. Sie steht in der Kolumne und in der Zeile „Leseprobe — S. 47".
    seite: z.number().int().min(1),
    // Hoechstens eine Buchseite Prosa. Sie hoert mitten im Satz auf; den
    // Rest der letzten Zeile schliesst ein Balken.
    text: z.string().optional(),
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
    geschwaerzt: z.array(z.string()).optional(),
  })
  .refine((werte) => Boolean(werte.text || werte.bild), {
    message: 'Eine Leseprobe braucht entweder `text` oder `bild`.',
  });

// Ein Buch = eine Datei in src/content/buecher/. Der Dateiname ist der Slug
// und damit die Adresse (/programm/<slug>) und der stabile Schluessel fuer
// Cover-Dateien unter public/buecher/<slug>/.
const buecher = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/buecher' }),
  schema: z.object({
    titel: z.string(),
    // Kurzfassung des Titels. Steht im Regal unter dem Band und auf dem
    // gedruckten Buchruecken — beides ist schmal, also kurz halten.
    // Fehlt sie, nimmt die Seite den vollen Titel.
    kurztitel: z.string().optional(),
    autor: z.string(),
    // Klappentext: erscheint im Regal, wenn der Band herausgezogen ist.
    // Zwei bis vier Saetze, mehr passt nicht ins Panel.
    klappentext: z.string(),
    // Ein Satz aus dem Buch (oder darueber) und wer ihn sagt.
    zitat: z.string(),
    zitat_von: z.string(),
    // Freitext, etwa "Broschur · 224 Seiten" oder "Leinen · 96 Seiten".
    format: z.string(),
    // Einer von drei Zustaenden: Verfuegbar, In Vorbereitung, Vergriffen.
    verfuegbarkeit: z.enum(VERFUEGBARKEITEN).default('In Vorbereitung'),

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

    // Doppelcover (tête-bêche): das Buch hat zwei Vorderseiten. Die zweite
    // ist kopfüber auf die Rückseite gedruckt — man dreht den Band um und
    // stellt ihn auf den Kopf, dann fängt die andere Geschichte an.
    //
    // Fehlt dieser Block, ist es ein gewöhnliches Buch: auf der Rückseite
    // steht dann das Zitat.
    rueckseite: z
      .object({
        titel: z.string(),
        kurztitel: z.string().optional(),
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
