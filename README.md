# Sonne und Fleisch

Die Seite des Verlags. Statisch gebaut mit Astro, deutsch, ohne Datenbank.

Die Startseite ist ein Regal: die Bände liegen als Stapel auf schwarzem Grund.
Ziehen dreht die Ansicht um die Stapel, das Mausrad und die Pfeile blättern
durch den Katalog, und ein Klick zieht einen Band heraus. Liegt er vorn, lässt
er sich frei drehen — auch umdrehen und auf den Kopf stellen, was bei
Doppelbänden die zweite Geschichte nach vorn holt.

Dasselbe Programm steht als Liste unter `/programm` — die ist auch ohne 3D
lesbar und für Suchmaschinen da.

## Loslegen

```bash
npm install
```

```bash
npm run dev
```

Danach: <http://localhost:4321>

## Ein Buch anlegen

Entweder eine Datei in `src/content/buecher/` anlegen (Vorlage: eine der
bestehenden), oder die Oberfläche unter `/admin/` benutzen.

Der Dateiname ist der Slug und damit die Adresse: `lenz.md` wird zu
`/programm/lenz`. Umschlagbilder gehören nach `public/buecher/<slug>/`.

## Die Redaktionsoberfläche

Liegt unter `/admin/` (Sveltia CMS, liegt als Datei im Projekt, kein fremder
Server).

**Lokal, sofort einsatzbereit:** `npm run dev` starten, in Chrome
<http://localhost:4321/admin/> öffnen, „Work with Local Repository" wählen und
den Projektordner freigeben. Änderungen landen direkt in den Dateien.

**Über GitHub — dafür fehlen noch zwei Schritte:**

1. Eine GitHub-OAuth-App anlegen (Settings → Developer settings → OAuth Apps).
   Als Callback die Adresse des Auth-Dienstes aus Schritt 2 eintragen.
2. Den kleinen Auth-Dienst von Sveltia als Cloudflare Worker veröffentlichen
   (<https://github.com/sveltia/sveltia-cms-auth>) und dort Client-ID und
   Secret der OAuth-App hinterlegen.

Ohne diese zwei Schritte funktioniert der Knopf „Sign In with GitHub" nicht —
das lokale Arbeiten aber schon.

## Bauen und veröffentlichen

```bash
npm run build
```

Das Ergebnis liegt in `dist/` und ist reines HTML, CSS, JavaScript und Bilder.
Es kann auf Cloudflare Pages, Netlify oder jeden Webserver.

Die Produktionsadresse steht in `astro.config.mjs` (`site`) und muss bei einer
eigenen Domain angepasst werden — davon hängen die Adressen in der Sitemap ab.

## Was noch fehlt

- **Impressum und Datenschutz** sind Entwürfe mit Platzhaltern in eckigen
  Klammern. Die müssen ausgefüllt werden, bevor die Seite online geht.
- **Die Musterbücher** (Rimbaud, Büchner, Lautréamont, Lasker-Schüler,
  Baudelaire, Novalis) sind Platzhalter für das echte Programm. Auch die aus
  den Beispielcovern angelegten Bände haben nur Titel, Autor und Umschlag —
  alles andere ist Fülltext.

## Herkunft des Regals

Die 3D-Ansicht beruht auf „The Complete Shelf" aus dem Mint Playground
(MIT-Lizenz, siehe `LICENSE-mint-playground`). Umgebaut auf Astro, auf
liegende Stapel und auf Broschuren; Einzelheiten in `AGENTS.md`.
