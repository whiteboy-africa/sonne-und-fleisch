// Bringt jeden Umschlag auf das eine Mass, das die Seite kennt.
//
// **Das Mass kommt vom Modell, und das Modell kennt jedes Objekt.**
//
// Verglichen wird gegen `breite_verhaeltnis`, wo ein Band eines traegt —
// sonst gegen das Hausmass 2:3, das als `--book-ratio` in
// `styles/basis.css` steht; wer es aendert, aendert es hier mit.
//
// **Ein einziges Mass fuer alle waere hier falsch**, und zwar nicht
// theoretisch: Yellow Fever traegt `0.648`, weil das sein wirkliches
// Druckformat ist (aus dem Bogen gerechnet, siehe `content.config.ts`).
// Auf A5 beschnitten verloere sein Umschlag acht Prozent Hoehe, ohne dass
// irgendwo ein A5-Buch entstuende. Das Blatt traegt `1.41` und liegt
// quer — auf A5 hochkant beschnitten bliebe von einem Aquarell die
// Mitte uebrig. Und das Heft traegt `0.671`.
//
// Die Regel lautet deshalb: **jeder Umschlag gegen das Mass seines
// eigenen Bandes.** Ein Paar steht damit immer in zwei gleich grossen
// Feldern — beide Seiten eines Bandes teilen sein Mass —, und das war der
// Grund fuer die ganze Uebung.
//
// **Was passiert.** Weicht eine Datei um mehr als anderthalb Prozent ab,
// wird sie mittig beschnitten — nie gestreckt. Ein gestreckter Umschlag
// ist schlimmer als ein beschnittener: beim Beschnitt fehlt ein Rand,
// beim Strecken stimmt kein Buchstabe mehr. Jede beschnittene Datei wird
// gemeldet, mit Name und urspruenglichem Verhaeltnis, damit falsch
// angelegte Kunst auffliegt statt still zurechtgerueckt zu werden.
//
// **Geschnitten wird in `dist/`, nicht in `public/`.** Zwei Gruende, und
// beide stehen in CLAUDE.md: in `public/` liegt Arbeit, die jemand
// gemacht hat, und die ruehrt ein Bauskript nicht an. Und ein Bild unter
// demselben Dateinamen auszutauschen laesst den Cache das alte weiter
// zeigen — beim Bau ins Ausgabeverzeichnis passiert das genau einmal,
// bei jedem Bau neu, ohne dass eine Quelldatei ihren Inhalt wechselt.
//
// **Welche Dateien.** Nur die, die im Frontmatter als Umschlag stehen
// (`cover_bild`, `rueckseite.cover_bild`). Unter `public/buecher/` liegt
// mehr: `ruecken.webp` ist ein Buchruecken (43 zu 1200) und
// `leseprobe-*.webp` sind Buchseiten. Beide sind keine Umschlaege, und
// beide auf A5 zu beschneiden waere Unsinn — der Ruecken wuerde zu einem
// Quadrat, von der Seite bliebe die Mitte.

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

/**
 * Das Hausmass — dieselbe Zahl wie `--book-ratio` in `basis.css`.
 *
 * **Nicht** der Vorgabewert aus dem Schema (`148 / 210`, A5): der
 * beschreibt den Buchkoerper in der Szene, nicht die Kunst. Die
 * Umschlaege sind zu zwei Dritteln 900 zu 1350. Gegen A5 geprueft
 * kostete der Beschnitt im Mittel 4,59 % und liess drei von sechzehn
 * Dateien unangetastet; gegen 2:3 sind es 2,64 % und acht.
 */
const VORGABE = 2 / 3;
/** Ab hier wird beschnitten. Darunter faellt es im Bild nicht auf. */
const TOLERANZ = 0.015;
const INHALTE = 'src/content/buecher';
const QUELLE = 'public';
const AUSGABE = 'dist';

/**
 * Holt die Umschlaege aus dem Frontmatter, jeden mit dem Mass **seines**
 * Bandes. Ohne YAML-Bibliothek, weil genau zwei Schluessel gebraucht
 * werden und beide auf einer Zeile stehen.
 */
async function umschlaege() {
  const liste = [];
  for (const name of await readdir(INHALTE)) {
    if (!name.endsWith('.md') && !name.endsWith('.mdx')) continue;
    const text = await readFile(join(INHALTE, name), 'utf8');
    const kopf = text.split('---')[1] ?? '';
    /*
     * **Buecher bekommen das Hausmass, Sonderobjekte ihr eigenes.**
     *
     * Ein Umschlag steht im Dokument immer in einem Feld von
     * `--book-ratio` — ein Mass fuer alle, sonst stehen in einer Liste
     * zwei Rasterhoehen nebeneinander. Die Datei auf dasselbe Mass zu
     * bringen heisst: am Ende beschneidet der Behaelter nichts mehr.
     *
     * `breite_verhaeltnis` zaehlt hier nur noch fuer die, die gar keine
     * Buecher sind: das Blatt liegt quer (1,41), das Heft hat sein
     * eigenes Format. Beide tauchen in keiner Liste auf, und auf A5
     * beschnitten waeren sie zerstoert.
     */
    const sonderling = /^\s*(blatt|magazin):/m.test(kopf);
    const mass = kopf.match(/^\s*breite_verhaeltnis:\s*([\d.]+)\s*$/m);
    const ziel = sonderling && mass ? Number(mass[1]) : VORGABE;
    for (const zeile of kopf.split('\n')) {
      const treffer = zeile.match(/^\s*cover_bild:\s*['"]?([^'"\s]+)['"]?\s*$/);
      if (treffer) liste.push({ pfad: treffer[1], ziel, band: name });
    }
  }
  return liste;
}

const funde = [];
const geschnitten = [];

for (const { pfad, ziel: ZIEL, band } of await umschlaege()) {
  const quelle = join(QUELLE, pfad);
  let bild;
  try {
    bild = sharp(quelle);
    var masse = await bild.metadata();
  } catch {
    funde.push(`fehlt: ${pfad}`);
    continue;
  }

  const verhaeltnis = masse.width / masse.height;
  const abweichung = Math.abs(verhaeltnis - ZIEL) / ZIEL;
  if (abweichung <= TOLERANZ) continue;

  /*
   * Mittig beschneiden. Welche Achse gekuerzt wird, entscheidet die
   * Richtung der Abweichung: ist das Bild zu schmal, faellt Hoehe weg;
   * ist es zu breit, faellt Breite weg. Gestreckt wird nie.
   */
  const zuSchmal = verhaeltnis < ZIEL;
  const breite = zuSchmal ? masse.width : Math.round(masse.height * ZIEL);
  const hoehe = zuSchmal ? Math.round(masse.width / ZIEL) : masse.height;
  const links = Math.round((masse.width - breite) / 2);
  const oben = Math.round((masse.height - hoehe) / 2);

  const ziel = join(AUSGABE, pfad);
  await mkdir(dirname(ziel), { recursive: true });
  await writeFile(
    ziel,
    await sharp(quelle)
      .extract({ left: links, top: oben, width: breite, height: hoehe })
      .webp({ quality: 88 })
      .toBuffer(),
  );

  geschnitten.push(
    `${pfad}  (${band}, Mass ${ZIEL.toFixed(4)})\n      ` +
      `${masse.width}x${masse.height} = ${verhaeltnis.toFixed(4)}, ` +
      `${(abweichung * 100).toFixed(1)} % daneben → ${breite}x${hoehe}`,
  );
}

console.log(`Umschlaege gegen das Mass ihres Bandes geprueft (Vorgabe ${VORGABE.toFixed(4)}).`);
if (geschnitten.length === 0) {
  console.log('  Alle innerhalb von 1,5 % — nichts zu tun.');
} else {
  console.log(`  ${geschnitten.length} mittig beschnitten:`);
  for (const zeile of geschnitten) console.log(`    ${zeile}`);
}
if (funde.length > 0) {
  console.error('  Fehlende Dateien:');
  for (const zeile of funde) console.error(`    ${zeile}`);
  process.exit(1);
}
