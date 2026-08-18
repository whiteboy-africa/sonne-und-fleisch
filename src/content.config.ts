import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { MOTIVE, VERFUEGBARKEITEN } from './shelf/katalog';

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

    // Angaben nur fuer die Buchseite, nicht fuers Regal.
    isbn: z.string().optional(),
    preis: z.string().optional(),
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
    hoehe: z.number().min(1.4).max(2.4).default(2.0),
    dicke: z.number().min(0.02).max(0.4).default(0.08),
    // Breite geteilt durch Hoehe. Vorgabe ist A5 (0,705), und dabei bleibt
    // es vorerst fuer alle Baende.
    //
    // Wer das echte Format eines Buches eintragen will, rechnet es aus dem
    // Druckfile: Breite eines Deckels geteilt durch die Bogenhoehe. Dann
    // wird das Umschlagbild nicht mehr ins A5-Format gequetscht. Die Dicke
    // folgt genauso aus der Breite des Ruecken-Streifens, geteilt durch die
    // Bogenhoehe und mal der Buchhoehe.
    breite_verhaeltnis: z.number().min(0.4).max(1.2).default(148 / 210),
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
  }),
});

export const collections = { buecher, seiten };
