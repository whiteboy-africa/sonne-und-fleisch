# Sonne und Fleisch — Verlagsseite

Astro, statisch, deutsch. Die Startseite ist ein begehbares Regal in 3D: die
Bände liegen als Stapel auf schwarzem Grund, man blättert durch, zieht einen
Band heraus und stellt ihn auf.

## Entwicklung

```
npm run dev
```

Wichtig: **Änderungen an `src/content.config.ts` brauchen einen Neustart des
Servers.** Astro hält das Sammlungs-Schema im Cache; sonst fallen Bücher, die
nicht mehr zum alten Schema passen, stillschweigend aus dem Regal.

## Wo was liegt

```
src/content/buecher/*.md   Ein Buch, eine Datei. Dateiname = Adresse.
src/content/seiten/*.md    Verlag, Kontakt, Impressum, Datenschutz.
src/content.config.ts      Das Schema. Einzige Wahrheit über die Felder.
src/buecher.ts             Übersetzt die deutschen Felder auf die Engine.
src/shelf/                 Das 3D-Regal (siehe unten).
public/buecher/<slug>/     Umschlagbilder.
public/admin/config.yml    Die Redaktionsoberfläche. Muss zum Schema passen.
```

## Das Regal

Übernommen aus dem Mint-Playground-Template „The Complete Shelf" (MIT-Lizenz,
siehe `LICENSE-mint-playground`) und in drei Punkten umgebaut:

1. **Aus React wurde Astro.** `ShelfEngine.ts`, `cover-art.ts` und
   `book-motion.ts` sind reines TypeScript; die Bedienung steht in
   `mount.ts` und hängt direkt am DOM (`components/Regal.astro`).
2. **Aus der stehenden Reihe wurden liegende Stapel.** `book-motion.ts` ist
   dafür neu geschrieben: Posen haben jetzt Höhe (`y`) und Kippwinkel
   (`pitch`), die Kollisionsprüfung rechnet in drei Achsen, und die Bände
   über einem herausgezogenen Buch rutschen nach.
3. **Aus Hardcover wurde Broschur.** Dünner, A5-Verhältnis, keine
   Kapitalbänder, keine überstehenden Deckel.

Der Adapter für ein fremdes Asset-Archiv wurde entfernt.

### Bedienung

Eine Regel trägt das Ganze: **herausgezogen wird nur, was man anklickt** —
das Buch selbst, seine Nummer in der Leiste oder der Knopf. Rad, Pfeile und
Tasten wählen bloß aus, sie holen nichts heraus.

- Beim Ankommen liegt alles im Stapel (`atRest`).
- Ziehen dreht die Ansicht um die Stapel. Der aufgestellte Band bleibt
  dabei stehen — man kann um ihn herumgehen und seine Rückseite ansehen.
  (Früher legte er sich ab einer Schwelle wieder hin; das ist raus.)
- In der Betrachtung dreht Ziehen den Band selbst, ohne Anschlag. Die
  Kamera kreist dort nicht (`enableRotate = false`), sonst ließe sich der
  Band nie auf den Kopf stellen.
- Welche Seite eines Doppelbandes vorn liegt, liest `seiteAblesen` aus der
  Lage des Bandes ab — nicht aus dem Knopfdruck. Deshalb stimmt die
  Beschreibung auch, wenn von Hand gedreht wird.

### Regeln, die man beim Anfassen kennen muss

- **Drehreihenfolge.** Die `content`-Gruppe eines Bandes steht auf
  `rotation.order = 'YXZ'`. Erst kippen, dann um die Hochachse drehen —
  andersherum stellt die Schieflage den liegenden Band auf die Kante.
- **Die Kollisionsprüfung darf nie dauerhaft blockieren.** Wird eine Pose
  länger als `motionStallLimit` abgelehnt, wird sie durchgelassen. Ein kurzes
  Durchdringen ist besser als ein Regal, das für immer stehenbleibt.
- **Der Stapel rutscht erst nach, wenn der Band draußen ist** (am Ende von
  `extract-next`). Umgekehrt fällt das Buch von oben in den herausfahrenden
  Band.
- **Die Zeichenfläche einer Textur braucht das Seitenverhältnis der Fläche
  am Buch.** Sonst zieht die Textur den Aufdruck in die Länge — beim
  Buchrücken war er zeitweise um das Dreifache gestaucht.
- **Cover-Bilder werden nur um den aktiven Band herum geladen**
  (`coverPreloadRange`). Alle auf einmal zu laden kostet bei einem gewachsenen
  Programm mehrere hundert Megabyte Grafikspeicher — das killt Telefone.
- **Ohne WebGL zeigt die Seite einen Ausweg** auf `/programm`. Ohne den bliebe
  eine schwarze Fläche stehen.

## Schriften

Drei Rollen, benannt ausschliesslich in `src/styles/basis.css`:

- `--schrift` (IBM Plex Mono) ist die **Bedienung**: Navigation, Marken,
  Ziffern, Nummernleiste, Angaben, Klappentexte.
- `--schrift-plakat` (Anton) traegt **alle Titel in Schaugroesse**.
- `--schrift-buch` (Source Serif) spricht **aus dem Buch heraus**: Zitate
  (aufrecht, nie kursiv) und der Traktat unter `/deterritorialization`.

Das ist ein Versuch und widerspricht der frueheren Regel „eine einzige
Schrift". Rueckbau: `git revert 28451c5`.

## Wechsel zwischen Baenden: der Abblender

Beim Seitwaertswechsel faehrt nichts. Das Licht geht in 150 ms aus, im
Dunkeln (150 ms) werden Band und Text getauscht, in 320 ms kommt es wieder.
Die Engine meldet Bild fuer Bild, wie viel Licht da ist
(`onWipeFrame(licht)`); Szenenbelichtung und Deckkraft der Tafel haengen an
diesem einen Wert. Die Zeiten stehen als `abblendAb`, `abblendHalten` und
`abblendAuf` in `ShelfEngine.ts`.

Davor gab es eine seitliche Fahrt („Wipe"). Sie zerfiel optisch in zwei
Haelften, weil der Grund der Tafel den Band rechts verdeckte. Zurueckholen:
`git revert 448adbe`.

## Nachbarschaft am Bildrand

Statt gerahmter Pfeile stehen links und rechts gedimmte Zeilen mit der
Nummer des Nachbarbandes; beim Darueberfahren waechst sein Titel heraus —
im aufgeschlagenen Band nach 14 Zeichen gekappt, im Stapel nach 24. Kein
Umlauf: auf Band 001 faellt die linke Zeile weg, auf dem
letzten steht rechts „Vakant" und fuehrt zu den Einsendungen. Auf
Fingergeraeten wird die Nachbarschaft gar nicht gebaut — dort wischt man
unten auf der Tafel.

`/?band=008` schlaegt einen Band direkt auf.

## Doppelcover (tête-bêche)

Manche Bände haben zwei Vorderseiten: die zweite Geschichte steht kopfüber auf
der Rückseite. Im Frontmatter ist das der Block `rueckseite`.

Beim Ablegen gilt: **das Bild der zweiten Seite wird aufrecht gespeichert.**
Die Engine dreht die Textur beim Drucken selbst um 180 Grad. Kommt der
Umschlag als fertiger Druckbogen (Rückseite kopfüber | Rücken | Vorderseite),
muss die linke Hälfte also erst um 180 Grad gedreht werden — siehe
`public/buecher/yellow-fever/`.

Beim Betrachten wendet der Knopf „Flip book" (oder die Taste F) den Band um die Querachse:
das dreht ihn um *und* stellt ihn auf den Kopf, genau wie in der Hand.

## Bilder

Beim Zerlegen eines Druckbogens: **erst schneiden, dann drehen — in zwei
getrennten Durchgängen.** Hängt man `.rotate()` in derselben Kette an
`.extract()`, dreht das Bildwerkzeug zuerst den ganzen Bogen, und der Schnitt
trifft die falsche Hälfte. Genau so ist einmal die Vorderseite als Rückseite
gelandet.

- Umschläge als **WebP, etwa 900 px breit**. Größer bringt am Bildschirm
  nichts und kostet auf dem Handy Ladezeit und Grafikspeicher.
- Ein Bild nie unter demselben Dateinamen austauschen — der Cache zeigt sonst
  weiter das alte. Neuer Name, Pfad im Frontmatter nachziehen.

## Farben und Schriften

Schwarz und Off-White, dazu eine Giftfarbe (`--accent`) für aktive Zustände.
Sonst nichts: alles Farbige kommt von den Umschlägen. Eine einzige Schrift,
ein technischer Mono (IBM Plex Mono), klein gesetzt; groß ist nur das Buch
selbst. Keine Editorial-Serifen, keine Designschul-Groteske, keine großen
Plakattitel.

Nummeriert wird dreistellig — 001, 002, 003 — wie Katalognummern eines
Labels. Diese Nummer steht auch auf dem Buchrücken.

Die Werte stehen in `src/styles/basis.css` und gelten überall — auch die
3D-Szene (`ShelfEngine.ts`, `roomColor`) muss dazu passen. Die Parole unten
rechts steht in `src/shelf/verlag-config.ts`.

## Nicht auffindbar

Der Verlag steht online, soll aber vorerst in keiner Suchmaschine auftauchen.
Zwei Riegel sorgen dafuer, und beide gehoeren zusammen:

- `suchmaschinen: false` in `src/shelf/verlag-config.ts` setzt in jeder Seite
  `<meta name="robots" content="noindex, nofollow">` und laesst den
  Sitemap-Verweis im Kopf weg.
- `public/_headers` schickt `X-Robots-Tag: noindex, nofollow` zu **jeder**
  Datei — auch zu den Umschlaegen (sonst Bildersuche) und zur Sitemap.

`public/robots.txt` verbietet absichtlich **nichts**. Ein `Disallow: /` wuerde
die Bots von der noindex-Zeile fernhalten; eine von aussen verlinkte Adresse
kaeme dann trotzdem als nackter Treffer in die Ergebnisse.

Oeffentlich wird die Seite, indem man `suchmaschinen` auf `true` stellt und
den Block in `public/_headers` loescht.

## Deutsch

Sichtbarer Text trägt echte Umlaute. In Code-Kommentaren und Commit-Nachrichten
wird die ASCII-Ersatzschreibung benutzt (ae/oe/ue), wie im Gnadenthal-Repo.

## Reihenfolge im Regal

`reihenfolge` im Frontmatter, **jede Zahl nur einmal**. Bei doppelten Zahlen
ist die Sortierung zufällig. Ohne Angabe sortiert das Regal von hoch nach
niedrig.

## Dokumentation

Astro: https://docs.astro.build
