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

### Beide Wege in den Band gehoeren zusammen

Der Umschlag und die Zeile „Leseprobe — S. xx" fuehren an dieselbe Stelle,
also leuchten sie gemeinsam:

- Zeiger auf dem Band → die Zeile faerbt sich in die Giftfarbe
  (`.ist-schwebend .leseprobe-zeile` in `styles/leseprobe.css`).
- Zeiger auf der Zeile → der Band geht in denselben Schwebezustand
  (`engine.schwebeErzwingen()`, verdrahtet in `mount.ts`; der Tastenfokus
  zaehlt mit).

Dazu `cursor: pointer` auf dem anfassbaren Band.

Auf Fingergeraeten laeuft **nichts** davon: ein Finger, der den Umschlag
beruehrt, hat ihn schon angefasst. Nachgemessen unter `(pointer: coarse)`:
kein veraenderter Bildpunkt, keine Klasse, keine Randabdunklung.

## Was offen ist

Der naechste ausformulierte Schritt steht unten unter „Offen: die
Handy-Ansicht des aufgeschlagenen Bandes". `docs/offen/` gibt es nicht
mehr: beide Auftraege, die dort lagen, sind gebaut — das Blatt ohne Nummer
und der Schwebezustand als Licht. Gebaut ist inzwischen auch das Heft
(siehe „Das Magazin") und der Blindband aus dem Stapel genommen.

## Offen: die Handy-Ansicht des aufgeschlagenen Bandes

Der naechste grosse Schritt, noch nicht gebaut. Ziel: unter 768px ein
einziger Dokumentfluss, nichts `fixed`, nichts `sticky`.

Reihenfolge von oben nach unten: Kopf mit Wortmarke und „Zurueck zum
Stapel"; der Band, mittig, 80–85 % der Breite; auf seiner Hoehe links und
rechts nur die Nachbarnummern (nie Titel) mit grossen unsichtbaren
Tippflaechen; direkt darunter der Wenden-Knopf; dann der Textblock
(Augenbraue, Titel, Autor, Klappentext, Zitat, Haarlinie, Angaben, „Zum
Buch"); ganz unten die Nummernleiste als normales Fusselement.

Weg faellt dabei die untere Tafel-Konstruktion. Gesten: waagerechtes
Wischen ueber dem Band blaettert (Winkelschwelle 30 Grad, damit Scrollen
gewinnt), Doppeltippen auf den Umschlag wendet. `dvh` statt `vh`,
`env(safe-area-inset-bottom)` am Seitenende, keine waagerechte Ueberlauf,
Tippziele mindestens 44px.

## Das Magazin: ein Blaetterobjekt, kein Betrachter

Im Stapel liegt ein Heft. Es ist flacher und groesser als die Baende und
traegt das Format seiner Druckdatei (0,679 statt 0,705) — man sieht schon
von weitem, dass es nicht dazugehoert. Ein Klick fuehrt geradewegs in eine
Leseposition: der Umschlag geht unterwegs auf, die erste Doppelseite steht.

Es ist ausdruecklich **kein PDF-Betrachter**. Kein Zoom, keine freie
Kamera, kein Vollbild, kein Zaehler, keine Werkzeugleiste. Wer ein Heft
durchblaettert, dreht nicht am Zoom.

### Eine Entfernung

Sie kommt aus dem Fenster und aus nichts sonst (`heftAbstand`): die
Doppelseite soll darin stehen, ganz und mit etwas Luft — 78 % der Hoehe,
hoechstens 90 % der Breite. Auf dem Telefon steht eine Seite allein.

**Kein Weg fuehrt daran vorbei.** Rad, Strg-Rad (das Kneifen auf dem
Trackpad), zwei Finger, Doppelklick: alles laeuft ins Leere, OrbitControls
ist abgeschaltet. Nachgemessen mit sechsunddreissig Radereignissen, einer
Kneifgeste und einem Doppelklick — Abstand und Bildgroesse Ziffer fuer
Ziffer unveraendert.

Das Heft **faehrt dabei nicht zur Kamera**. Es bleibt liegen, wo es lag,
richtet sich auf und waechst auf seine wahre Groesse; die Kamera kommt zu
ihm. Deshalb gibt es hier kein Gegenstueck zu `aufschlagFuellung`, das mit
einer CSS-Zeile uebereinstimmen muesste: es kommt kein Dokument darueber,
das Heft ist von Anfang bis Ende ein Gegenstand in der Szene.

### Geblaettert wird auf vier Wegen

Alle vier meinen dasselbe, und mehr Bedienung gibt es nicht:

- **Die Ecke ziehen.** Am aeusseren Drittel einer Seite (`heftKante`) nimmt
  man das Blatt in die Hand. Der Bogen folgt der Hand: der Grundbogen der
  Bewegung, dazu was die Hand senkrecht daran zieht — wer die Ecke
  hochzieht, rollt das Blatt staerker ein. Loslassen ueber der Haelfte
  laesst es durchfallen, darunter zurueck, und beides schnappt
  (`lambdaSchnapp` 22 statt 13).
- **Auf die Aussenkante klicken.** Derselbe Streifen, nur kurz gedrueckt.
- **Die Pfeiltasten.** Sie schnappen nicht: eine Taste ist kein Loslassen,
  dort soll man das Blatt umschlagen sehen.
- **Wischen** — auf dem Telefon tippen, siehe unten.

In der Mitte liegt der Bund; dort greift niemand nach einer Seite. Ein
kurzer Klick **daneben** ist der Ausgang, ebenso ESC und der Zurueck-Knopf
des Browsers (beim Oeffnen wird ein Geschichtsschritt abgelegt).

### Zwei Zeilen, sonst nichts

Unter dem Heft stehen genau zwei Zeilen: **ZURUECK ZUM STAPEL** und **PDF
HERUNTERLADEN**. Sie sind keine Werkzeuge — sie blaettern nicht, zaehlen
nicht, zeigen nichts an. Die eine fuehrt hinaus, die andere zur Datei.

Alles andere geht weg (`styles/magazin.css`): Kopfzeile, Tafel,
Nachbarschaft, der Weg zurueck, die Parole. Die **Nummernleiste** bleibt
stehen, gedimmt und **ohne aktive Marke** — das Heft hat keine Nummer, also
kann keine Marke ihm gehoeren. Die Marke wird dabei nicht ueberschrieben,
sondern gar nicht erst gesetzt (`blaetternAnsichtSetzen` in `mount.ts`):
eine ueberschriebene Marke bliebe eine Marke, sie saehe nur anders aus.

Die beiden Zeilen sind `fixed`, nicht `absolute`. Auf dem Telefon fliesst
die Bedienung des Regals als normale Seite unter der Leinwand her
(`handyFluss`), und `.press-experience` ist dort viel hoeher als das
Fenster — absolut gesetzt landeten sie vierhundert Bildpunkte unterhalb des
Randes.

### Auf dem Telefon

Eine Seite steht allein, und die beiden **Schirmhaelften** blaettern. Nicht
die Haelften der Doppelseite: einzeln steht der Bund am Rand, mal links,
mal rechts, je nachdem welche Seite gerade dran ist — wer von ihm aus
rechnet, blaettert bei jedem zweiten Tippen rueckwaerts. Ein Tipp ueber
oder unter der Seite schliesst.

### Der Speicher bleibt flach

Ein Heft mit vierundzwanzig Seiten hat zwoelf Blaetter. Alle zwoelf als
gebeugte Netze mit Knochenkette und je zwei Texturen zu tragen, waere
Verschwendung — zu sehen sind immer nur die paar um die aufgeschlagene
Doppelseite herum. Deshalb drei Teile (`shelf/magazin-rig.ts`):

- **Zwei Bloecke**, links und rechts vom Bund, in der Tiefe skaliert. Sie
  tragen die Dicke und den Papierschnitt und wachsen beim Blaettern
  ineinander ueber. Zwei Quader, keine Textur.
- **Ein lebendes Fenster** von fuenf Blaettern: das umschlagende und zwei
  zu jeder Seite (`magazinForm.fenster`).
- **Ein Texturvorrat**, der mit dem Fenster wandert. Was herausfaellt, wird
  freigegeben.

Nachgemessen ueber drei Durchlaeufe von vorn bis hinten und zurueck:
hoechstens acht Seitenbilder gleichzeitig, Geometrien und Texturen ohne
Zuwachs, 14 bis 24 Zeichenaufrufe. `__PRESS_LIBRARY__.diagnostics().heft`
zeigt Stand, Fenster, Vorrat, Entfernung und den gemessenen Schirmrahmen.

### Drei Dinge, die man beim Anfassen wissen muss

- **Der Bund gehoert dem Rig, nicht dem Buchkoerper.** `seitenRigBauen`
  bekommt ihn als `bund`: beim Band liegt er auf `-breite / 2`, weil der
  Buchkoerper um seine Mitte gebaut ist; beim Heft auf 0, weil dort der
  Bund die Mitte der Doppelseite ist und Bloecke wie Kamera daran haengen.
  Erbt das Heft die Lage des Bandes, steht es um eine halbe Seitenbreite
  neben der Kamera — und das sieht man erst, wenn die gemessenen Zahlen
  stimmen und das Bild nicht.
- **Der Stand gehoert dem Blatt, nicht dem Fensterplatz.** Beim Blaettern
  wandert das Fenster um eins weiter. Haengt der Stand am Platz, gilt jeder
  Platz als neu und wird auf sein Ziel gesetzt — das Blatt, das umschlagen
  sollte, steht im selben Bild schon drueben. Es dreht sich nie, es
  springt. Die **Knochen** dagegen gehoeren dem Platz: rutscht ein anderes
  Blatt hinein, werden sie einmal hart gesetzt statt gedaempft.
- **Die beiden Seiten sind gegenlaeufig gestapelt.** Rechts liegt das
  naechste Blatt obenauf, links das zuletzt umgeschlagene. Wer beides mit
  derselben Ordnung bedient, versteckt links das oberste unter seinem
  Vorgaenger, und die linke Seite steht eine Doppelseite zu frueh. Wer
  gerade umschlaegt, liegt ueber allem — er gehoert in diesem Augenblick zu
  keiner von beiden.

### Sonderobjekt-Regeln

Wie beim Blatt: keine Nummer, keine Marke in der Leiste, kein Wenden, keine
Nachbarschaft, kein Statusblock. Pfeile und Durchlauf gehen daran vorbei
(`ausserDerReihe` in `katalog.ts`). Nicht im Programm, keine Seite unter
`/programm/<slug>`, nicht in der Sitemap. `/magazin` oeffnet direkt in die
Leseposition — einen Zug spaeter als `onReady`, weil `onReady` noch **im**
Erbauer faellt und `engine` erst danach seinen Wert bekommt.

### Ohne Bewegung

`prefers-reduced-motion` macht aus der Anfahrt einen harten Wechsel: die
Leseposition steht sofort, das Blatt springt ohne Bogen um. Die Anfahrt
faellt dabei nicht bloss aus dem Bild, sondern **aus** — sonst stuende die
Leseposition zwar da, waere aber eine Sekunde lang nicht anzufassen, weil
das Blaettern auf „offen" wartet.

Nachpruefen laesst sich das ohne Systemeinstellung:

```
__PRESS_LIBRARY__.ohneBewegung(true)
```

### Woher die Seiten kommen

`npm run magazin:build` (`scripts/magazin-bauen.mjs`) rastert die ersten
vierundzwanzig Seiten von `content/magazin.pdf` nach
`public/magazin/pages/0001.webp` aufwaerts — lange Kante 2048, WebP q80,
zusammen 4,6 MB. Es warnt ab 25 MB. Keine Vorschaubilder: das Heft laedt im
Fenster nach, eine zweite Groesse waere ein zweiter Satz Dateien, den nie
jemand sieht.

Gerastert wird mit **Swift und PDFKit** (`magazin-rendern.swift`), weil auf
diesem Rechner weder Poppler noch ImageMagick noch Ghostscript liegen.
Zwei Fallen stecken darin, beide umgangen:

- **Retina.** `NSImage.lockFocus` rastert auf dem Bildschirm, den es findet
  — an einem Retina-Schirm kommen doppelt so viele Bildpunkte heraus wie
  bestellt. Hier wird in einen `CGContext` mit ausgerechneter Pixelgroesse
  gezeichnet: was bestellt ist, kommt heraus, auf jedem Rechner dasselbe.
- **`/Rotate`.** `PDFPage.draw` wendet es an — aber nur, solange man es
  nicht selbst auch tut. Damit die Drehung an einer Stelle steht, wird sie
  von Hand in die Matrix gelegt und der Seite vorher abgenommen. Diese
  Ausgabe hat ueberall `/Rotate 0`; der Weg steht trotzdem da.

Dabei faellt die Datei ab, auf die „PDF herunterladen" zeigt:
`public/magazin/magazin.pdf`, dieselben vierundzwanzig Seiten aus denselben
Rastern, 6,4 MB. **Nicht** die Druckdatei — die hat 125 MB und
sechsundsiebzig Seiten. Was man herunterlaedt, ist genau das, was man
geblaettert hat.

Gebaut wird das PDF von Hand (`scripts/pdf-aus-bildern.mjs`), weil ein PDF
ein JPEG **so wie es ist** tragen kann: der Datenstrom bekommt `/DCTDecode`
und wird Byte fuer Byte uebernommen. Jeder andere Weg dekodiert das Bild
und kodiert es neu — dann waere die heruntergeladene Seite nicht mehr
dieselbe. Nachgemessen: zwei Laeufe, Byte fuer Byte dasselbe Ergebnis, PDF
wie WebP.

### Ein Rig, zwei Abnehmer

Die Blattmechanik steht in `shelf/seiten-rig.ts` und wird von der
Leseprobe (`blaetter-rig.ts`) und vom Heft (`magazin-rig.ts`) benutzt:
Knochenkette laengs der Wendeachse, Drehung im ersten Knochen, Biegung als
halber Sinus ueber die uebrigen.

Verschieden ist nur, **wann** ein Blatt welche Haltung hat. Die Leseprobe
faehrt eine Kaskade aus einer einzigen Zahl; das Heft blaettert einzeln und
auf Zuruf, und dort kommt die Woelbung aus der Hand. Die gemeinsame Sprache
ist deshalb die **Haltung** und nicht die Zeit: `anteil` sagt, wie weit das
Blatt herum ist, `bogen`, wie stark es sich woelbt. Eine gemeinsame
Zeitkurve haette einen von beiden falsch bedient.

Aus demselben Grund wird die Woelbung aus dem **laufenden** Stand gerechnet
und nicht aus dem Ziel: aus dem Ziel waere sie im selben Bild, in dem der
Befehl kommt, schon wieder null, und das Blatt drehte sich starr wie eine
Klappe.

Aus `bandinopla/quick_flipbook` (BSD-2) ist **kein Code** uebernommen
worden; es liegt nicht in diesem Baum. Deshalb gibt es weiterhin keine
`THIRD_PARTY_NOTICES.md`.

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

Ein Klick auf den Umschlag im aufgeschlagenen Zustand (oder auf die Zeile
„Leseprobe — S. 47" in den Angaben) schlaegt den Band auf. Der Band faehrt
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
