# Offen: das Blatt gehoert nicht in die Nummerierung

Noch nicht gebaut, aber als Naechstes dran. Untersucht ist es schon; hier
steht, was dabei herauskam, damit niemand zweimal sucht.

## Was gewollt ist

Das Blatt (`blatt: true`, heute „Berge") ist kein Band. Es soll:

1. **keine Nummer tragen** — nicht in der Nummernleiste, nicht in der
   Bildunterschrift, nicht in den Angaben;
2. **nur ueber den Stapel erreichbar sein** — normales Blaettern nach links
   und rechts geht daran vorbei, man kommt hin, indem man den Stapel dreht
   oder das Blatt anklickt;
3. beim Weiterblaettern **aus** dem Blatt heraus: nach rechts zum **ersten**
   echten Band, nach links zum **letzten** echten Band — Vakant zaehlt nicht
   als echter Band.

Aus dem Programm (`/programm`) ist es bereits draussen, zusammen mit dem
Blindband — das macht `programmListe()` in `src/buecher.ts`.

## Wo die Nummer heute herkommt

Sie kommt an **vier** Stellen aus der Position im Katalog, nicht aus einem
gemeinsamen Wert. Das ist der eigentliche Umbau:

| Stelle | heute |
| --- | --- |
| `components/Regal.astro` | Nummernleiste zeichnet `katalognummer(index + 1)` je Eintrag; der angeschnittene Rest der Linie zeigt `katalog.length + 1` |
| `shelf/mount.ts` | `blaetternAnsichtSetzen()` setzt Bildunterschrift und beide Nachbarzeilen aus `aktiverIndex + 1` bzw. `davor/danach + 1` |
| `shelf/mount.ts` | `panelSetzen()` setzt die Augenbraue aus `gewaehlterIndex + 1` |
| `buecher.ts` | `release` fuer den Buchruecken, `programmListe()` und `/programm/<slug>` aus `releasenummer(position)` |

Der saubere Weg: **die Nummer einmal berechnen** (ein Zaehler ueber
`alleBuecher()`, der bei `blatt` nicht weiterzaehlt), sie als `release` an
den Katalog haengen und ueberall **diese** benutzen statt der Position. Das
Blatt bekommt keine. Auf seinem Ruecken steht sie ohnehin nicht — ein Blatt
hat keinen (`spineSurface.visible = !book.sheet`), aber `cover-art.ts`
zeichnet `book.release` auch auf den Ruecken anderer Baende, also muss der
leere Wert dort still durchgehen.

## Wo das Blaettern haengt

Auch das steht an mehreren Stellen und muss dieselbe Regel bekommen:

- `mount.ts` → `nachbar(richtung)` und die Nachbarzeilen in
  `blaetternAnsichtSetzen()`
- `ShelfEngine.ts` → `handleKeyDown` (Pfeiltasten, im Stapel
  `presentBook(activeIndex ± 1)`, im aufgeschlagenen Band
  `inspectOther(activeIndex ± 1)`)
- `ShelfEngine.ts` → `browseBy(direction)` (Wischen auf dem Telefon)

Vorschlag: **ein** Helfer in `shelf/katalog.ts`, den beide benutzen:

```ts
nachbarIndex(katalog, von, richtung): number | null
```

- steht man auf dem Blatt: `+1` → erster Eintrag ohne `sheet`;
  `-1` → letzter Eintrag ohne `sheet` und ohne `blind`;
- sonst: in der Richtung weitergehen und `sheet` ueberspringen;
- kein Umlauf an den Enden.

## Die Nummernleiste

Fuer das Blatt entfaellt die Marke. Damit stimmen die Stellen in
`el.ticks` nicht mehr mit den Katalogstellen ueberein — die Marken brauchen
also ihre Katalogstelle als `data-` Wert, und `mount.ts` liest sie von dort,
statt den Schleifenindex zu benutzen.

## Was zu pruefen ist

- Baende zaehlen 001 bis 008, Vakant 009, das Blatt gar nicht.
- Pfeiltasten, Wischen und die Nachbarzeilen gehen am Blatt vorbei.
- Vom Blatt aus: rechts 001, links Band 008 (nicht Vakant).
- Ein Klick auf das Blatt im Stapel holt es weiterhin heraus.
- `/programm` unveraendert: acht Baende, 001 bis 008.
