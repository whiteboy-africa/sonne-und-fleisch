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

Ein Neustart reicht nicht immer: Astro legt die geparsten Einträge zusätzlich
in `.astro/data-store.json` ab. Kommt ein **neues Feld** ins Schema, steht in
diesem Speicher noch der Eintrag ohne das Feld — die Seite baut fehlerfrei,
das Feld ist bloß nirgends. Dann `rm .astro/data-store.json` und neu bauen.

Die Seiten des Heftes kommen nicht von Hand, sondern aus

```
npm run magazin:build
```

Das braucht `content/magazin.pdf` — die Druckdatei, 125 MB, absichtlich
**nicht** im Git. Fehlt sie, sagt der Bau das und bricht ab; die fertigen
Seiten unter `public/magazin/` bleiben davon unberuehrt.

## Loeschen und Bauen

**Geloescht wird nur in Cache- und Build-Ordnern:** `.astro/`, `dist/`,
`node_modules/`. Nie in `src/`, nie in `public/`, nie an Inhalten. Wer den
Schema-Cache leeren muss (`rm .astro/data-store.json`, siehe unten), bleibt
damit innerhalb dieser Ordner — alles andere ist Arbeit, die jemand gemacht
hat.

**Die Ausgabe von `npm run build` nicht durch `grep` filtern.** Ein
`grep -E "error|Complete!"` verschluckt jeden Fehlschlag, der weder das eine
noch das andere Wort enthaelt — dann sieht man gar nichts und haelt es fuer
gut gegangen. `| tail -20` zeigt das Ende ehrlich, mitsamt Grund.

## Wo was liegt

```
src/content/buecher/*.md   Ein Buch, eine Datei. Dateiname = Adresse.
src/content/seiten/*.md    Verlag, Kontakt, Impressum, Datenschutz.
src/content.config.ts      Das Schema. Einzige Wahrheit über die Felder.
src/buecher.ts             Übersetzt die deutschen Felder auf die Engine.
src/shelf/                 Das 3D-Regal (siehe unten).
public/buecher/<slug>/     Umschlagbilder.
public/magazin/pages/      Die Seiten des Heftes. Aus dem Bau, nicht von Hand.
content/magazin.pdf        Die Druckdatei dazu. Nicht im Git (125 MB).
public/admin/config.yml    Die Redaktionsoberfläche. Muss zum Schema passen.
```

## Das Regal

Übernommen aus dem Mint-Playground-Template „The Complete Shelf" (MIT-Lizenz,
siehe `LICENSE-mint-playground`) und in drei Punkten umgebaut:

1. **Aus React wurde Astro.** `ShelfEngine.ts`, `cover-art.ts` und
   `book-motion.ts` sind reines TypeScript; die Bedienung steht in
   `mount.ts` und hängt direkt am DOM (`components/Regal.astro`).
   Dazugekommen sind `seiten-rig.ts` (umschlagende Blaetter),
   `blaetter-rig.ts` (die Leseprobe), `magazin-rig.ts` (das Heft) und
   `hover-licht.ts` (der Schwebezustand).
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
- **Das Blatt braucht Luft im Stapel.** Der Bogen ist gewellt, aber Dicke
  und Kollisionspruefung rechnen mit einem flachen Quader von 0,006. Ohne
  Zugabe (`blattSenke`, `blattHebung`) taucht er dort, wo er durchhaengt,
  in den Deckel darunter — und eine Buchecke steht mitten im Bild.
- **Der Stapel rutscht erst nach, wenn der Band draußen ist** (am Ende von
  `extract-next`). Umgekehrt fällt das Buch von oben in den herausfahrenden
  Band.
- **Die Zeichenfläche einer Textur braucht das Seitenverhältnis der Fläche
  am Buch.** Sonst zieht die Textur den Aufdruck in die Länge — beim
  Buchrücken war er zeitweise um das Dreifache gestaucht.
- **Cover-Bilder werden nur um den aktiven Band herum geladen**
  (`coverPreloadRange`). Alle auf einmal zu laden kostet bei einem gewachsenen
  Programm mehrere hundert Megabyte Grafikspeicher — das killt Telefone.
  Wer weiter weg liegt, steht so lange in seiner Einbandfarbe da; das sieht
  aus wie ein Buch und stoert nicht. **Zwei Ausnahmen laden immer: was
  obenauf liegt, und das Blatt** (`blatt: true`) — bei dem ist das Bild der
  Gegenstand, ohne es waere es nur ein farbiges Rechteck und saehe nach
  Fehler aus. Das Heft laedt seinen Umschlag ohnehin: er ist die erste
  Seite (`/magazin/pages/0001.webp`), dieselbe Datei, die beim Blaettern
  zuoberst liegt.
- **Ohne WebGL zeigt die Seite einen Ausweg** auf `/programm`. Ohne den bliebe
  eine schwarze Fläche stehen.
- **Der Tastenhinweis [F] steht nur da, wo eine Taste ist**, und das
  Zeichen davor auch nicht. Beides faellt weg unter
  `(max-width: 767px), (pointer: coarse)` (`.wenden-knopf kbd` in
  `regal.css`). Zwei Bedingungen, weil eine allein nicht reicht: ein
  Telefon quer ist 844 Bildpunkte breit und faellt aus jeder Handy-Breite
  heraus, und in mancher Geraete-Nachstellung meldet `(pointer: coarse)`
  gar nichts. Gewendet wird dort mit dem Knopf.

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

### Der Wechsel muss zu Ende gehen, bevor man zurueckgeht

Der Wechsel legt den hinausgefahrenen Band **erst am Ende** wieder flach in
den Stapel; bis dahin steht seine Lage weiter auf Betrachtung — vorn,
gross, aufrecht. Im Betrachten faellt das nicht auf, dort ist ausser dem
einen Band alles ausgeblendet.

Wer aber mitten im Wechsel „Zurueck zum Stapel" drueckt, hatte zwei
Fehler auf einmal:

- Der Weg zurueck wurde **ueberfahren**: `updateWipe` laeuft in jedem Bild,
  auch in `returning`, und setzte am Ende wieder `mode = "inspect"`. Man
  drueckte zurueck und landete beim naechsten Band.
- Der hinausgefahrene Band blieb in seiner Betrachtungslage stehen,
  obwohl die Buchhaltung ihn laengst zurueckgelegt hatte. Er stand dann
  aufrecht mitten in einer liegenden Reihe — und **im Weg**: die
  Kollisionspruefung lehnt dort jede Pose ab, und das Blaettern haengt bis
  zur Notbremse (`motionStallLimit`). Nach ein paar Malen standen mehrere
  so herum, und es ruckelte.

Deshalb bringt `returnToShelf` einen laufenden Wechsel zuerst in einem Zug
zu Ende (`wipeFortschritt = 1`, dann `updateWipe(0)`) — dieselbe
Buchhaltung, derselbe Weg, nur ohne die Zeit dazwischen. Und die Lage folgt
der Buchhaltung: wer im Stapel liegt, bekommt die Lage des Stapels
(`imStapel`), auch wenn er der zuletzt betrachtete war.

Nachgemessen mit `diagnostics().verirrt` — Baende, die in einem Stapel
liegen und trotzdem nicht in dessen Lage stehen. Erlaubt ist genau einer,
der gerade faehrt. Dieselbe Folge (Band aufschlagen, Nachbarn anklicken,
sofort zurueck): vorher `mode: "inspect"` und `verirrt: 4`, danach
`mode: "browse"` und `verirrt: 0`.

## Nachbarschaft am Bildrand

Statt gerahmter Pfeile stehen links und rechts gedimmte Zeilen mit der
Nummer des Nachbarbandes; beim Darueberfahren waechst sein Titel heraus —
im aufgeschlagenen Band nach 14 Zeichen gekappt, im Stapel nach 24. Kein
Umlauf: auf Band 001 faellt die linke Zeile weg, auf dem
letzten steht rechts „Vakant" und fuehrt zu den Einsendungen. Auf
Fingergeraeten wird die Nachbarschaft gar nicht gebaut — dort wischt man
unten auf der Tafel.

`/?band=008` schlaegt einen Band direkt auf.

## Der Blindband

Am Ende der Reihe steht ein unbedruckter Rohling: `blind: true` im
Frontmatter, `reihenfolge: 999`, damit echte Baende immer davor ruecken.
Seine Nummer ergibt sich wie bei allen anderen aus der Position — heute
009, nach dem naechsten echten Band 010. Sein Umschlag wird nicht bemalt
(`drawBlindCover` in `cover-art.ts`): cremefarbener Karton, Papierkorn,
das Verlagszeichen unten in der Mitte, die Nummer auf dem Ruecken.

**Er liegt in keinem Stapel.** Eine offene Stelle ist nichts, was
herumliegt; ein Rohling zwischen den Baenden waere ein Gegenstand und
behauptete das Gegenteil. Im Regal ist er deshalb nicht zu sehen — er
bekommt keinen Platz im Stapel (`createBooks`), sein Koerper ist ausgeblendet,
solange er nicht der betrachtete ist, und beim Zurueckgehen bleibt er auch
nicht davor stehen, wie es ein Band taete.

**Station bleibt er trotzdem, und zwar die letzte.** Vom letzten echten
Band nach rechts kommt man zu ihm, und dort steht er allein: 009, „Vakant".
Weil es nichts herauszuziehen gibt, faellt der gewohnte Zweischritt („erst
herausholen, dann aufschlagen") aus — von der Nachbarzeile und von der
Leiste aus geht es geradewegs in die Betrachtung (`blindOeffnen`).

Sonst ist er ein Band wie jeder andere: er wird gewendet, abgeblendet,
angeklickt. Vier Stellen wissen von ihm — die Marke in der Leiste
(`ist-blind`, nur Kontur), die Bestellzeile („Einsenden" ins Postfach), die
Programmliste, aus der er herausfaellt, und `blindOeffnen`.

**In der Liste unter `/programm` steht er nicht** — genauso wenig wie das
Blatt (`blatt: true`) und das Heft (`magazin`). Die Liste ist die
Bibliografie der Baende; die offene Stelle, ein Aquarell und eine
Zeitschrift sind keine. Aussortiert wird in `programmListe()`
(`src/buecher.ts`), erst nach dem Zaehlen — die Nummern der uebrigen Baende
bleiben also, wie sie sind.
Heissen beide Seiten gleich, sagt der Wenden-Knopf „Seite B" statt eines
Titels.

## Der Schwebezustand: Licht, keine Aufhellung

Liegt der Zeiger auf einem Band, veraendert das die Farben seines Umschlags
**nicht**. Kein `emissive`, keine Tonwertaenderung. Was sich bewegt, ist das
Licht um den Band herum. Nachgemessen im Stapel, wo die Szene beweisbar
stillsteht: derselbe Umschlag ruhend und schwebend, Bildpunkt fuer
Bildpunkt — auf dem Cover null Unterschied. Der ganze Unterschied liegt auf
Silhouette, Blockkante, Glanzstelle und Rand.

Alles steht in `shelf/hover-licht.ts`: die gemeinsamen Werte in `licht`, die
stufenabhaengigen in `stufen`, dazu die Schalter in `HOVER_FX`. Beide Tafeln
haengen am Pruefstand und lassen sich im laufenden Bild drehen:

```
__PRESS_LIBRARY__.hoverFx.swing = false
__PRESS_LIBRARY__.hoverStufen.betrachtung.schwenkGrad = 40
__PRESS_LIBRARY__.diagnostics().schwebe   // Stufe, Saum, Lack, Rand, Schwenk
```

### Zwei Stufen

Die beiden Ansichten haben verschieden viel Raum, also bekommen sie
verschieden viel Licht.

| | Stapel | Betrachtung |
| --- | --- | --- |
| Saum | ×1, auf 150 ms / ab 200 ms | **×2**, auf 100 ms / ab 250 ms, breiterer Uebergang |
| Schwenk | 12° | **26°** |
| Randabdunklung | 0,50 | **0,88**, Kern zieht auf 20 % zu |
| Glanzband | aus | aus |

Im **Stapel** liegen Nachbarn herum: der Rueckzug traegt die Bewegung, der
Saum ist der Beiklang. Diese Werte sind eingestellt und stehen fest.

In der **Betrachtung** gibt es keine Nachbarn, die zuruecktreten koennten —
dort muss der Raum selbst weichen. Die Randabdunklung traegt hier die ganze
Bewegung; Saum und Schwenk kommen doppelt so stark dazu.

### Die drei Mittel

- **`rim` — Kantenlicht.** Ein warmweisser Saum an der Silhouette. Zwei
  Teile, weil einer nicht reicht: ein Fresnel-Term zeichnet die aeussere
  Kante, erreicht aber die Blockkante nicht — ein Band liegt flach, und die
  Kamera steht kaum 14 Grad darueber, da zeigt die Blockkante frontal zur
  Kamera und hat gar keinen streifenden Winkel. Dazu kommt deshalb ein
  **Streiflicht**, das nur den Koerper trifft: Deckel, Ruecken, Buchblock.
  Es liegt im Material und nicht als Lampe in der Szene, weil three.js
  Lichtebenen gegen die **Kamera** prueft und nicht gegen das angeleuchtete
  Netz (`object.isLight && object.layers.test( camera.layers )`) — eine
  Lampe haette entweder alles getroffen oder nichts. Im Material dagegen
  liegt die Trennung ohnehin: Koerper und Umschlagflaechen haben eigene
  Materialien, und der Term haengt nur in den ersten. Das Cover ist damit
  nicht rechnerisch unberuehrt, sondern unerreichbar.
- **`swing` — Lichtschwenk.** Das Fuehrungslicht wandert um die Hochachse,
  in etwa 300 ms, ohne Nachfedern. Der Glanz wandert mit, der Band dreht
  sich um kein Grad. Auf farbigen Bildpunkten verschiebt das den Farbton im
  Median um 0 Grad; nur die Glanzstelle selbst geht weiter, und genau die
  darf.
- **`recede` — der Raum tritt zurueck.** Im Stapel gehen die **anderen**
  Baende um 20 % zurueck, das Ziel bleibt unangetastet und wirkt dadurch
  heller. Die Daempfung sitzt in den Materialien der Nachbarn, nicht in den
  Lichtern: der Raum ist schwarz, es gibt weder Boden noch Wand, also ist
  „Grundlicht faehrt zurueck" hier dasselbe Bild wie „alle uebrigen Baende
  faehren zurueck" — nur trifft es so das Ziel nicht mit. Dazu die
  Randabdunklung ueber der Leinwand, deren heller Kern dem schwebenden Band
  folgt (`--schwebe-x`/`--schwebe-y` auf `.press-experience`); waere sie
  fest zentriert, dunkelte sie einen Band am Bildrand mit ab.
- **`sheenSweep` — das Glanzband, abgeschaltet.** Es las sich wie
  Produktglanz: der Wisch, mit dem ein Werbebild seine Ware poliert. In
  beiden Ansichten aus. Der Weg dorthin steht noch da und ist neu
  eingestellt, falls er je wieder gebraucht wird — 800 statt 400 ms,
  dreimal so breit (ein weicher Verlauf ueber eine halbe Umschlagbreite,
  keine Kante) und halb so hell. Es soll dann lesen wie eine Wolke, die
  vorbeizieht. Zum Ausprobieren braucht es beide Schalter:

  ```
  __PRESS_LIBRARY__.hoverFx.sheenSweep = true
  __PRESS_LIBRARY__.hoverStufen.betrachtung.sheen = true
  ```

  Es faehrt **einmal** je Aufschweben und bleibt dann liegen, nie in
  Schleife — nachgemessen: nach dem Lauf kein einziger veraenderter
  Bildpunkt mehr.

Getragen wird der Schwebezustand damit von dreien: Saum, Rand und der
Giftfarbe auf der Leseprobe-Zeile. Wer alle vier Schalter auslegt, bekommt
null veraenderte Bildpunkte — die Schalter sind das ganze Tor.

### Der Lack auf dem Umschlag

Eine Broschur ist kaschiert, und kaschiertes Papier glaenzt: `clearcoat`
0,22 bei `clearcoatRoughness` 0,4 auf der Umschlagflaeche. Vorher lag dort
fast keiner (0,05), und darum hatte der Umschlag kaum eine Glanzstelle — ein
Lichtschwenk, dessen Glanz man nicht wandern sieht, ist kein Schwenk.

Zwischendurch stand hier 0,35 bei 0,25 Rauheit. Das war eine frische Folie
unter Ladenlicht: ueber dem oberen Umschlagdrittel lag ein breiter heller
Schleier, der nicht im Bild steckte. Jetzt ist es eine matte Kaschierung,
die schon eine Weile am Kiosk lag — weniger Lack, und der Glanz, den es
noch gibt, laeuft breit aus statt sich zu einem Fleck zu ziehen.

Lack aendert **nur** den Glanz; die Farbe darunter bleibt. Nachgemessen
gegen den eingefrorenen Stapel: groesster Einzelunterschied 19 von 765, im
Mittel 1,0 — im Bild nicht zu unterscheiden. Ein Blatt bleibt roh,
unkaschiertes Papier glaenzt nicht.

`HOVER_FX.detailClearcoatBoost` (DETAIL_CLEARCOAT_BOOST, standardmaessig
**aus**) legt in der Betrachtung, und nur solange der Zeiger auf dem Band
liegt, 0,15 Lack dazu. Eine Eskalationsstufe zum Ausprobieren, falls Saum
und Rand zu leise bleiben.

### Ein Weg in den Band, nicht zwei

Aufgeschlagen wird der Band, indem man **den Umschlag anklickt**. Mehr
gibt es nicht.

Daneben stand einmal eine Zeile in den Angaben — „Leseprobe — S. 47" —,
und beide leuchteten gemeinsam: Zeiger auf dem Band faerbte die Zeile in
die Giftfarbe, Zeiger auf der Zeile schickte den Band in den
Schwebezustand. Das war huebsch und ist weg. Die Seitenzahl sagte
niemandem etwas, die Tafel hat den Platz nicht, und ein zweiter Weg zu
derselben Stelle ist einer zu viel.

Damit faellt auch die Kopplung: der Umschlag leuchtet von selbst, wenn
der Zeiger auf ihm liegt, und braucht kein Gegenstueck mehr. Auf
Fingergeraeten laeuft davon ohnehin nichts.

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

## Die Leseprobe: der aufgeschlagene Band

Ein Klick auf den Umschlag im aufgeschlagenen Zustand schlaegt den Band
auf — der einzige Weg hinein. Der Band faehrt
flach heran, der Deckel klappt auf, die Blaetter fliegen durch — **alle
schwarz** —, und das Riffeln bleibt auf der einen hellen Doppelseite stehen.
Die Leseprobe ist nicht der freie Anfang des Buches, sondern die einzige
offene Stelle in einem sonst geschwaerzten Block.

### Die eine Regel

**Was geschwaerzt ist, existiert im HTML nicht.** Die Balken sind leere
`<span>`, die ganz geschwaerzten Seiten enthalten keinen Text, und der
Klartext unter einem Balken wird schon beim Bauen herausgeschnitten
(`leseprobeLesen` in `src/buecher.ts`). Wer den Quelltext liest, liest
nichts, was das Buch nicht hergibt. Ein Balken, unter dem etwas steht, das
sich nachlesen liesse, waere keiner.

### Geschrieben wird im Frontmatter

```yaml
seiten_zahl: 224
leseprobe:
  seite: 47
  text: >-
    Artur zählte die Waggons, bis er bei [[siebzehn]] aufhörte […]
    und dann sagte sie noch, dass [[|17]]
```

`[[Klartext]]` wird zu einem Balken, so breit wie der Klartext lang ist;
`[[|17]]` setzt einen Balken ohne Klartext. Der letzte Balken schliesst die
letzte Zeile — der Satz bricht ab. Positionen in einer eigenen Liste zu
fuehren waere beim ersten Umschreiben des Satzes verrutscht; im Text kann
das nicht passieren.

Jede Seite eines Doppelbandes hat ihre eigene Probe (`rueckseite.leseprobe`).
Welche gilt, entscheidet die Lage des Bandes — dieselbe Regel wie bei der
Beschreibung. Ohne Probe schlaegt der Band auf dieser Seite nicht auf, und
die Zeile in den Angaben steht nicht da.

**So viel Text, dass die Seite voll wird — und nicht mehr, als auf dem
Telefon Platz hat.** Der Satzspiegel ist beschnitten (`overflow: hidden`);
laeuft der Text ueber, bricht die letzte Zeile mitten durch. Drei Absaetze
von je vier bis neun Zeilen sind die Groessenordnung.

### Wie der Band aufgeht: zwei Wege

`oeffnenModus` in `src/shelf/verlag-config.ts` waehlt, und zwar getrennt
nach Geraet: am Schreibtisch `pages3d`, auf Fingergeraeten `lichtschnitt`.

- **`pages3d`** — der Deckel klappt am Bund auf (170 Grad, mit leichtem
  Ueberschwingen), und dahinter schlagen **echte Blaetter** um. Jedes ist
  ein `SkinnedMesh` mit einer Knochenkette laengs der Wendeachse
  (`src/shelf/blaetter-rig.ts`). Die Kette traegt die Drehung; die Biegung
  kommt als zweiter, voruebergehender Anteil obendrauf und ist an beiden
  Enden null — flach im Stapel, flach im Aufgeschlagenen, gewoelbt nur
  dazwischen. Genau das unterscheidet eine umschlagende Seite von einem
  Scharnier: Papier bleibt mit der freien Kante zurueck, wenn man es am
  Bund anhebt.
- **`lichtschnitt`** — der aeltere Weg, unveraendert: starre schwarze
  Ebenen, die vorbeifliegen. Billiger zu rechnen, deshalb steht er auf
  Fingergeraeten. Zum Vergleichen laesst sich beides umstellen.

Die Blaetter tragen **dasselbe Schwaerzungsmuster** wie die Doppelseite im
Dokument: `src/shelf/schwaerzung.ts` ist die eine Quelle, aus der beide
zeichnen — das Dokument als Elemente, die Szene auf eine Leinwand. Die
Seiten im Bild und die Seiten zum Lesen kommen so aus demselben Buch.

Die Werte stehen gesammelt in `blaetter-rig.ts` (`takt` und `form`), nicht
verstreut: Beginn und Dauer je Blatt, Versatz zwischen ihnen, Bogenstaerke,
Deckelwinkel. Gedaempft wird ueberall mit `1 - exp(-lambda * delta)`, mit
denselben Lambdas wie das uebrige Regal (Fokus-Kamera 13).

**Das Rig entsteht erst beim Aufschlagen und wird beim Zuklappen wieder
abgeraeumt.** Nachgemessen: 67 Geometrien und 15 Texturen im Ruhezustand,
74 und 24 waehrend der Band offen ist, danach wieder 67 und 15. Zehn Baende
trugen sonst zehn Knochenketten und zehn Leinwaende mit sich herum, die
niemand ansieht.

### Die Uebergabe

3D traegt die Anfahrt, gelesen wird im Dokument. Genau dort, wo Text auf
einer Textur unscharf wuerde (`uebergabeBei`, bei 92–94 % der Bewegung),
kommt die scharfe HTML-Doppelseite darueber. Damit das nicht auffaellt,
wird der Band in der Szene **auf dieselbe Groesse gerechnet**, die die
Doppelseite im Dokument hat: `aufschlagFuellungHoehe`/`-Breite` in
`ShelfEngine.ts` und `height: min(82dvh, calc(94vw / 1.41))` in
`styles/leseprobe.css` sind dasselbe Mass. **Wer eines aendert, aendert das
andere mit** — sonst springt die Seite bei der Uebergabe.

Verlassen wird sich darauf trotzdem nicht: `leseprobeRahmen()` misst, wo die
aufgeschlagene Doppelseite gerade wirklich im Fenster steht, und die
Doppelseite im Dokument legt sich zuerst genau dorthin, bevor sie in 120 ms
in ihre eigene Lage faehrt. Gemessen statt gehofft. Nachgemessen betraegt der
Unterschied 0,1 Pixel — aber nur, weil das „Zuklappen" unter der
Doppelseite **absolut** sitzt und nicht in der Mitte mitzaehlt. Haengt man
es wieder in den Fluss, rutscht die Doppelseite um seine halbe Hoehe nach
oben, und die Uebergabe springt um achtzehn Pixel.

Aus demselben Grund ist das Papier in der Szene dunkler angesetzt
(`aufschlagPapier`, #d6d2c5) als im Dokument (#ece8dd): unter dem harten
Licht der Szene treffen sich die beiden erst so.

Beim Zuklappen laeuft es rueckwaerts: erst blendet die Doppelseite ab und
gibt den Band frei, wie er aufgeschlagen dasteht, dann erst schlagen die
Blaetter zurueck und der Deckel faellt zu. Das Regal (Tafel, Kopfzeile,
Nummernleiste) kommt **erst zurueck, wenn der Band wirklich zu ist** —
frueher fiel die Tafel schon ueber den halb geschlossenen Band, zwei
Ansichten uebereinander, von denen keine stimmte.

`prefers-reduced-motion` ueberspringt die ganze Anfahrt — die Doppelseite
steht sofort da.

### Herkunft der Technik

Das Blaettern ist nach einer bekannten Vorgehensweise **neu geschrieben**,
nicht uebernommen: Knochenkette laengs der Wendeachse, gestaffelte
Verzoegerung je Blatt, Biegung als Kurve ueber die Kette. Die Mechanik
selbst liegt seit dem Heft in `seiten-rig.ts` und wird von beiden benutzt
(siehe „Ein Rig, zwei Abnehmer"). Aus dem
Wawa-Sensei-Tutorial und seinem Starter-Repo (UNLICENSED) ist kein Code in
diesen Baum gelangt — auch kein heruntergeladener Text daraus. Deshalb gibt
es hier keine `THIRD_PARTY_NOTICES.md`; braeuchte man doch einmal Code aus
`bandinopla/quick_flipbook` (BSD-2), gehoerte dessen Lizenztext dorthin.

### Ein aufgeschlagener Band wendet nicht

Solange er offen ist, gehoert die Bedienung ihm: waagerechte Gesten und
Tasten blaettern **nur** in der Probe. Bandwechsel, Nachbarschaft am
Bildrand, Wenden-Knopf, [F] und der Weg zurueck ins Regal sind stillgelegt —
in der Engine ueber `aufschlagStufe !== "aus"`, in der Bedienung ueber
`leseprobe.istBesetzt()`. Zu geht es mit ESC, mit einem Klick ins Schwarze
oder mit dem Zurueck-Knopf des Browsers (beim Aufschlagen wird ein
Geschichtsschritt abgelegt). Danach steht die Betrachtung wieder genau so
da wie vorher — Kamera und Blickpunkt werden gemerkt und angefahren.

### Geblaettert wird

Vom Fenster aus vorwaerts: **eine** ganz geschwaerzte Doppelseite, dann die
Schlusstafel („Weiter nur im Band — 224 Seiten" und „Vormerken ↗"; ist der
Band lieferbar und hat er einen `bestell_link`, steht dort „Bestellen" und
der Weg fuehrt dorthin). Vor das Fenster und hinter die Tafel geht es nicht.
Mehr Schwarz war es einmal, und dann sah man beim Blaettern fast nur noch
schwarze Seiten — der Entzug wirkt, wenn er einmal dasteht, nicht wenn man
sich durch ihn hindurchklickt. Aus demselben Grund ist eine geschwaerzte
Zeile nicht **ein** Balken, sondern zwei bis vier mit Wortabstaenden
dazwischen, in Absaetzen mit Einzug: man soll sehen, dass hier Satz stand,
und nicht ein schwarzes Rechteck.

Auf dem Telefon (unter 768 px oder Fingergeraet) wird einzeln geblaettert:
Tippen auf die rechte oder linke Haelfte, und die Seite ist so hoch wie das
Geraet, nicht so hoch wie A5 — an A5 festzuhalten machte sie kurz und breit,
und der Text passte nicht mehr darauf.

### Abschalten

`leseprobe: false` in `src/shelf/verlag-config.ts`: kein Klick auf den
Umschlag, keine Zeile in den Angaben, kein Aufschlagen. Alles andere bleibt,
wie es war.

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

### Das Repo bleibt privat

**Das Heft liegt im Git.** Sechsundsiebzig Seitenbilder unter
`public/magazin/pages/`, dazu der kleine Satz daneben — die ganze Ausgabe.
Solange das Repo oeffentlich ist, laedt sie jeder ohne Anmeldung herunter:

```
raw.githubusercontent.com/<konto>/sonne-und-fleisch/main/public/magazin/pages/0001.webp
```

Das macht die Zeile „PDF herunterladen" zunichte, die genau deshalb von der
Seite genommen wurde. Auf der Seite ist das Heft zum Blaettern da; wer eine
Datei mitnimmt, hat es nicht gelesen, sondern kopiert — und ueber ein
offenes Repo nimmt er sie in einem Zug mit, samt dem Skript, das sie wieder
zusammensetzt.

Also: **Sichtbarkeit privat.** Cloudflare Pages baut aus privaten Repos
unveraendert weiter, die Verbindung laeuft ueber die GitHub-App.

Wer die Seiten doch aus dem Git nehmen will, braucht einen anderen Weg zum
Ausliefern — der Bau kann sie nicht erzeugen, denn `content/magazin.pdf`
liegt aus gutem Grund auch nicht im Repo.

### Die Seite, die es nicht gibt

`src/pages/404.astro` muss dableiben. Ohne `dist/404.html` beantwortet
Cloudflare Pages **jede** falsche Adresse mit `200` und irgendeinem Inhalt:
`/gibtesnicht` und `/magazin/pages/0077.webp` kamen beide als Erfolg
zurueck, 35 KB HTML mit dem Bildtyp einer Seite. Wer von aussen prueft, ob
eine Datei da ist, bekommt dann immer ja.

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
