# Offen: der Schwebezustand als Licht, nicht als Aufhellung

Noch nicht gebaut. Auftrag liegt vor, Reihenfolge: **erst** das Blatt aus der
Nummerierung nehmen (siehe `blatt-ohne-nummer.md`), dann das hier.

## Die harte Regel

**Der Schwebezustand darf die Farben des Umschlags niemals veraendern.** Kein
`emissive`, keine Helligkeits- oder Tonwertaenderung am Cover-Material. Licht
bewegt sich **um** den Gegenstand herum, nie in das Bild hinein.

Prueffaehig: denselben Umschlag ruhend und im Schwebezustand aufnehmen und
die Bilder vergleichen — Farbton und Saettigung der Cover-Pixel muessen
unveraendert sein. Unterscheiden duerfen sich nur der Rand der Silhouette
und die Lage der Glanzstelle.

## Was zuerst weg muss

Heute liegt genau das Falsche drin: `umschlagHover` in `ShelfEngine.ts` hebt
`frontSurface.material.emissive` und `backSurface.material.emissive` um
0,075 an, wenn der Zeiger auf dem betrachteten Band liegt. Das ist die
Aufhellung, die ersetzt werden soll — in beiden Ansichten, Stapel wie
Betrachtung.

## Das Paket (beide Ansichten)

### A — Kantenlicht

Beim Aufschweben erscheint ein duenner, warmweisser Saum entlang der
Silhouette des Bandes: entweder ein Fresnel-Term im Material oder ein
Streiflicht von hinten/seitlich, das aufblendet. Zurueckhaltend — es soll
lesen als **einen Schritt ins Licht getreten**, nicht als Kontur. Die Kante
des Buchblocks gehoert mit in den Saum. Auf in etwa 150 ms, ab in 200 ms.

### B — Lichtschwenk

Das Fuehrungslicht wandert um 10 bis 15 Grad um den betrachteten Band herum,
in etwa 300 ms, und beim Verlassen zurueck. Der Glanz auf der Broschur
wandert sichtbar mit — **der Band selbst dreht sich um kein Grad.** Gedaempft
mit `1 - exp(-lambda * delta)`, ohne Nachfedern.

### C — Der Raum tritt zurueck (nur im Stapel)

Schwebt der Zeiger ueber einem Band im Stapel, gehen Grundlicht und die
Nachbarbaende um etwa 20 % zurueck, die Randabdunklung zieht sich leicht
zusammen (etwa 200 ms). **Das Material des Bandes bleibt unangetastet** — er
wirkt heller, weil alles andere dunkler wird. Beim Verlassen zurueck.

In der Betrachtung gibt es keine Nachbarn: dort nur die Randabdunklung, sehr
zurueckhaltend.

## Grundzusage (bleibt, wie sie ist)

- `cursor: pointer` auf dem anfassbaren Band.
- Die Zeile „Leseprobe — S. {seite}" geht im Schwebezustand auf volle
  Deckkraft (sie darf davor gedimmt sein).

## Schalter zum Vergleichen

`HOVER_FX`, einzeln umlegbar:

```
{ rim: true, swing: true, recede: true, sheenSweep: false }
```

`sheenSweep` ist die Alternative zum Schwenk und **standardmaessig aus**:
beim Aufschweben faehrt **einmal** ein breites, schwaches Glanzband flach
ueber den Umschlag (etwa 400 ms) und bleibt dann liegen. Nie in Schleife,
hoechstens einmal je Aufschweben. Dient dem A/B gegen den Schwenk.

Alle Zeiten und Staerken als benannte Konstanten in **einem** Block — wie
`takt` und `form` in `blaetter-rig.ts`.

## Finger

Auf Fingergeraeten gibt es keinen Schwebezustand. Nichts davon laeuft dort.

## Abnahme

- Cover-Pixel ruhend gegen schwebend: Farbton und Saettigung unveraendert.
- Saum sichtbar auf Silhouette **und** Blockkante.
- Der Schwenk bewegt den Glanz, ohne den Band zu drehen.
- Im Stapel dunkeln die **Nachbarn** ab, nicht das Ziel.
- Alle vier Schalter wirken unabhaengig voneinander.
- `sheenSweep` faehrt einmal und wiederholt sich nie.
