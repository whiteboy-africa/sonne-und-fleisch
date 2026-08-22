// Der Schwebezustand als Licht, nicht als Aufhellung.
//
// Die harte Regel: **der Schwebezustand darf die Farben des Umschlags
// niemals veraendern.** Kein `emissive`, keine Tonwertaenderung am
// Cover-Material. Licht bewegt sich **um** den Gegenstand herum, nie in das
// Bild hinein. Was frueher hier stand — ein `emissive` von 0,075 auf beiden
// Deckelflaechen — war genau die Aufhellung, die weg sollte: sie zieht jede
// Farbe in Richtung Weiss und nimmt dem Umschlag die Saettigung.
//
// Drei Mittel bleiben, die das nicht tun:
//
// **A — Kantenlicht.** Ein duenner, warmweisser Saum an der Silhouette.
// Der Auftrag laesst die Wahl zwischen einem Fresnel-Term im Material und
// einem Streiflicht, das aufblendet. Es sind beide noetig, und zwar aus
// einem Grund, den man erst am Bild sieht:
//
// Ein Band liegt flach, die Kamera steht kaum 14 Grad darueber. Seine
// Blockkante zeigt der Kamera damit fast frontal ins Gesicht — dort gibt es
// gar keinen streifenden Winkel, den ein Fresnel-Term fassen koennte.
// Nachgemessen: der Term allein hat 749 von 2,8 Millionen Bildpunkten
// erreicht, sichtbar erst bei sechzehnfacher Verstaerkung. Er zeichnet die
// aeussere Silhouette richtig, aber die Blockkante bleibt ihm verschlossen.
//
// Also kommt das **Streiflicht** dazu: ein flaches, warmes Licht von vorn
// seitlich, das nur den **Koerper** des Bandes trifft — Deckel, Ruecken,
// Buchblock. Was aufleuchtet, ist der Papierschnitt und der schmale
// Kartonrand, der rings um das Umschlagbild stehenbleibt. Der Band ist
// einen Schritt ins Licht getreten, das Bild darauf ist dasselbe geblieben.
//
// Dieses Licht ist **keine Lampe in der Szene**, sondern ein Term im
// Material — und zwar aus einem harten Grund: three.js prueft die Ebenen
// eines Lichts gegen die **Kamera**, nicht gegen das angeleuchtete Objekt
// (`WebGLRenderer`, `object.isLight && object.layers.test( camera.layers )`).
// Eine Lampe laesst sich damit nicht auf einzelne Netze richten; sie haette
// entweder alles getroffen oder nichts. Im Material dagegen liegt die
// Trennung ohnehin schon: Deckel und Buchblock haben ihre eigenen
// Materialien, die Umschlagflaechen ihre. Wer den Term nur in die ersten
// haengt, kann das Cover gar nicht erreichen — die Zusage steht nicht in
// einer Rechnung, sondern in der Verdrahtung.
//
// **B — Lichtschwenk.** Das Fuehrungslicht wandert ein paar Grad um den
// Band herum. Der Glanz wandert mit, der Band selbst dreht sich um kein
// Grad. Farbton und Saettigung bleiben, nur die Lage der Glanzstelle
// aendert sich — und genau die darf sich aendern.
//
// **C — Der Raum tritt zurueck.** Nicht das Ziel wird heller, alles andere
// wird dunkler. Der Raum ist schwarz, es gibt weder Boden noch Wand: das
// Grundlicht ist nur auf den Gegenstaenden zu sehen. „Grundlicht faehrt
// zurueck" und „alle uebrigen Baende faehren zurueck" sind hier also
// dasselbe Bild — deshalb sitzt die Daempfung in den Materialien der
// Nachbarn und nicht in den Lichtern. Wuerde sie in den Lichtern sitzen,
// ginge das Ziel mit herunter, und die Abnahme sagt ausdruecklich: die
// Nachbarn dunkeln ab, nicht das Ziel.
//
// Alle Zeiten und Staerken stehen unten in **einem** Block — wie `takt` und
// `form` in `blaetter-rig.ts`. Gedaempft wird ueberall mit
// `1 - exp(-lambda * delta)`, wie im uebrigen Regal.

import * as THREE from 'three';

/**
 * Die vier Mittel, einzeln umlegbar — zum Vergleichen nebeneinander. Alle
 * vier aus heisst: Schweben aendert kein einziges Bildpunkt.
 *
 * `sheenSweep` ist hier die Erlaubnis, nicht der Ort: **wo** das Glanzband
 * faehrt, entscheidet die Stufe (`stufen`). Im Stapel faehrt es nicht, in
 * der Betrachtung schon.
 */
export const HOVER_FX = {
  rim: true,
  swing: true,
  recede: true,
  /**
   * Das Glanzband ist **aus**, in beiden Ansichten. Es las sich wie
   * Produktglanz — der Wisch, mit dem ein Werbebild seine Ware poliert.
   * Getragen wird der Schwebezustand jetzt von Saum, Rand und der
   * Giftfarbe auf der Leseprobe-Zeile.
   *
   * Der Weg dorthin steht noch da, nur abgeschaltet. Zum Ausprobieren
   * braucht es beide Schalter:
   *
   *     __PRESS_LIBRARY__.hoverFx.sheenSweep = true
   *     __PRESS_LIBRARY__.hoverStufen.betrachtung.sheen = true
   */
  sheenSweep: false,
  /**
   * DETAIL_CLEARCOAT_BOOST — die Eskalationsstufe, standardmaessig aus.
   * Legt in der Betrachtung, und nur solange der Zeiger auf dem Band liegt,
   * etwas mehr Lack auf den Umschlag. Zum Ausprobieren, falls Saum und Rand
   * noch zu leise bleiben. Der Lack aendert nur den Glanz, nie die Farbe.
   */
  detailClearcoatBoost: false,
};

/**
 * Zwei Stufen, weil die beiden Ansichten verschieden viel Raum haben.
 *
 * Im **Stapel** liegen Nachbarn herum: der Rueckzug traegt die Bewegung,
 * der Saum ist der Beiklang. Diese Werte sind eingestellt und stehen fest —
 * hier wird nicht mehr gedreht.
 *
 * In der **Betrachtung** gibt es keine Nachbarn, die zuruecktreten
 * koennten. Dort muss der Raum selbst weichen: die Randabdunklung zieht
 * sich weit zusammen und traegt die Bewegung, der Saum kommt doppelt so
 * stark und mit weicherem Uebergang, und der Schwenk holt weiter aus.
 */
export const stufen = {
  stapel: {
    /** Vielfaches der Saumstaerke. Eins ist die eingestellte Grundstaerke. */
    saumFaktor: 1,
    /** Auf in etwa 150 ms, ab in etwa 200 ms. */
    saumAn: 20,
    saumAb: 15,
    /** Ab welchem Streifwinkel der Saum anfaengt. Hoeher heisst schmaler. */
    saumSchwelle: 0.72,
    /** Um so viel Grad wandert das Fuehrungslicht. */
    schwenkGrad: 12,
    /** Wie schwarz die Raender werden und wie weit der helle Kern reicht. */
    randStaerke: 0.5,
    randInnen: 0.4,
    /** Kein Glanzband im Stapel. */
    sheen: false,
  },
  betrachtung: {
    saumFaktor: 2,
    /** Auf in etwa 100 ms, ab in etwa 250 ms. */
    saumAn: 30,
    saumAb: 12,
    /** Weicher Uebergang: der Saum ist breiter als im Stapel. */
    saumSchwelle: 0.55,
    schwenkGrad: 26,
    /** Der Rand traegt hier die ganze Bewegung — er zieht sich weit zu. */
    randStaerke: 0.88,
    randInnen: 0.2,
    /** Auch hier kein Glanzband — siehe `HOVER_FX.sheenSweep`. */
    sheen: false,
  },
} as const;

export type Stufe = keyof typeof stufen;

/** Zeiten, Winkel und Staerken des Schwebezustands. Eine Stelle. */
export const licht = {
  // — A, Kantenlicht —
  /** Wie hell der Saum hoechstens wird, additiv auf das fertige Bild. */
  saumStaerke: 0.34,
  /** Warmweiss. Ein Streiflicht, kein Neon. */
  saumFarbe: '#fff2da',
  /** Wie hell das Streiflicht hoechstens brennt, additiv auf das fertige Bild. */
  streifStaerke: 0.55,
  /**
   * Wie hart es abfaellt. Ueber eins heisst: die Flaechen, die sich ihm
   * zuwenden, bekommen es fast allein — es bleibt ein Streiflicht und wird
   * kein zweites Grundlicht.
   */
  streifHaerte: 1.6,
  /**
   * Wo es steht: von vorn rechts, gut zwanzig Grad ueber dem Boden.
   *
   * Ganz flach waere sauberer gedacht, aber falsch gesehen: ein Band liegt,
   * und die Kamera steht kaum vierzehn Grad darueber. Seine Blockkante ist
   * dann auf zwei, drei Bildpunkte zusammengedrueckt — ein Haarstrich, der
   * nichts erzaehlt. Von zwanzig Grad faellt das Licht ausserdem auf den
   * schmalen Kartonrand, der rings um das Umschlagbild stehenbleibt, und
   * **der** ist der Saum, den man sieht: ein Rahmen um das Bild, das Bild
   * selbst unveraendert.
   */
  streifOrt: [2.8, 2.0, 4.4] as [number, number, number],
  /** Wo er seine volle Staerke hat. Knapp unter 1: die aeusserste Kante. */
  saumEnde: 0.985,

  // — Der Lack auf dem Umschlag —
  /**
   * Eine Broschur ist kaschiert, und kaschiertes Papier glaenzt. Ohne
   * diesen Lack hatte der Umschlag fast keine Glanzstelle — und ein
   * Lichtschwenk, dessen Glanz man nicht wandern sieht, ist kein Schwenk.
   * Lack aendert **nur** den Glanz: die Farbe darunter bleibt, wie sie ist.
   *
   * Erst standen hier 0,35 bei 0,25 Rauheit. Das war eine frische Folie
   * unter Ladenlicht: ueber dem oberen Umschlagdrittel lag ein breiter
   * heller Schleier, der nicht im Bild steckte, und der Band sah aus wie
   * fotografiert fuer einen Katalog. Jetzt ist es eine matte Kaschierung,
   * die schon eine Weile am Kiosk lag — weniger Lack, und der Glanz, den es
   * noch gibt, laeuft breit aus statt sich zu einem Fleck zu ziehen. Zu
   * sehen ist er immer noch, sonst waere der Schwenk umsonst.
   */
  lack: 0.22,
  lackRauheit: 0.4,
  /** Was `detailClearcoatBoost` beim Schweben in der Betrachtung dazulegt. */
  lackZugabe: 0.15,

  // — B, Lichtschwenk —
  /** In etwa 300 ms, hin wie zurueck. Ohne Nachfedern. */
  schwenkLambda: 10,

  // — C, Der Raum tritt zurueck —
  /** Um so viel gehen die Nachbarn zurueck: ein Fuenftel. */
  rueckzug: 0.2,
  /** In etwa 200 ms. */
  rueckzugLambda: 15,
  /** Wie weit der helle Kern ruhend reicht (Anteil der Bilddiagonale). */
  randInnenRuhe: 0.54,
  /** Auch die Randabdunklung braucht ihre 200 ms. */
  randLambda: 15,

  // — sheenSweep, abgeschaltet und neu eingestellt —
  //
  // In seiner ersten Fassung war es ein schmaler, harter Streifen, der in
  // 400 ms ueber den Umschlag fuhr: der Politurwisch aus dem Werbebild.
  // Falls es je wieder angeschaltet wird, soll es lesen wie eine Wolke, die
  // vorbeizieht — also langsamer, viel breiter und halb so hell.
  /** Einmal ueber den Umschlag, in etwa 800 ms. Doppelt so lang wie vorher. */
  wischDauer: 0.8,
  /** Von wo nach wo, in halben Umschlagbreiten. Am Ende bleibt es liegen. */
  wischVon: -1.15,
  wischBis: 0.55,
  /**
   * Dreimal so breit wie vorher: kein Streifen mehr, sondern ein weicher
   * Verlauf ueber eine halbe Umschlagbreite — eine Kante hat er nicht.
   */
  wischBreite: 1.86,
  /** Halb so hell wie vorher. Es soll vorbeiziehen, nicht polieren. */
  wischStaerke: 0.07,
};

/** `1 - exp(-lambda * delta)`, wie im uebrigen Regal. */
export function daempfen(
  jetzt: number,
  ziel: number,
  lambda: number,
  delta: number,
) {
  return THREE.MathUtils.lerp(jetzt, ziel, 1 - Math.exp(-lambda * delta));
}

/**
 * Die Griffe an einem Material, ueber die der Schwebezustand es erreicht.
 * Es sind reine Uniform-Halter: wer sie dreht, aendert nichts an der
 * Beschreibung des Materials und braucht kein Neuuebersetzen.
 */
export type LichtGriff = {
  /** 0 bis 1 — Staerke des Kantenlichts. */
  saum: { value: number };
  /** 0 bis 1 — wie weit der Gegenstand zuruecktritt. */
  daempfung: { value: number };
  /** Lage des Glanzbands in halben Breiten; unter -8 heisst: kein Band. */
  wisch: { value: number };
  /** Die halbe Breite des Gegenstands, damit das Band ueber ihn passt. */
  wischSpanne: { value: number };
};

/** Ein Griff, der ins Leere geht — fuer Materialien ohne Einbau. */
export function leererGriff(): LichtGriff {
  return {
    saum: { value: 0 },
    daempfung: { value: 0 },
    wisch: { value: -9 },
    wischSpanne: { value: 1 },
  };
}

const saumFarbe = new THREE.Color(licht.saumFarbe);

/**
 * Die Richtung zum Streiflicht, im Blickraum. Eine Stelle fuer alle
 * Materialien — `ShelfEngine` schreibt sie jedes Bild neu, weil sie von der
 * Lage der Kamera abhaengt.
 */
export const streifRichtung = { value: new THREE.Vector3(0, 0, 1) };

/**
 * Ab welchem Streifwinkel der Saum anfaengt — als Uniform, weil die beiden
 * Stufen verschieden breite Saeume tragen. Eine Stelle fuer alle Baende:
 * es schwebt ohnehin immer nur einer.
 */
export const saumSchwelle: { value: number } = {
  value: stufen.stapel.saumSchwelle,
};

const kameraDreh = new THREE.Quaternion();

/**
 * Rechnet `streifOrt` in die Blickrichtung um, die der Shader braucht.
 *
 * Ueber die Drehung der Kamera, nicht ueber `matrixWorldInverse`: die wird
 * erst im Zeichnen aufgefrischt, und dann haenge das Licht ein Bild
 * hinterher.
 */
export function streifRichtungSetzen(kamera: THREE.Camera) {
  kameraDreh.copy(kamera.quaternion).invert();
  streifRichtung.value
    .set(...licht.streifOrt)
    .normalize()
    .applyQuaternion(kameraDreh);
}

/**
 * Haengt Kantenlicht, Daempfung und Glanzband in ein Material.
 *
 * Beides greift **nach** der Beleuchtung, direkt am fertigen Bildpunkt:
 * die Daempfung als Faktor, der Saum als Summand. Das Material selbst —
 * Farbe, Textur, Rauheit, `emissive` — bleibt unangetastet.
 *
 * `saum` schaltet den Fresnel-Term zu, `streif` das flache Licht. Beim
 * Koerper gilt beides. Beim **Blatt** nur der Fresnel-Term: ein Blatt hat
 * keinen Deckel und keinen Block, seine Bogenflaechen *sind* sein Umschlag —
 * ein Streiflicht darauf waere genau die verbotene Aufhellung. Der Fresnel
 * greift dort trotzdem, weil der Bogen sich woelbt und seine Normalen sich
 * an den Kanten wirklich wegdrehen.
 */
export function lichtEinbauen(
  material: THREE.Material,
  optionen: { saum: boolean; streif?: boolean; spanne: number },
): LichtGriff {
  const griff = leererGriff();
  griff.wischSpanne.value = Math.max(0.001, optionen.spanne);

  const vorher = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    vorher?.call(material, shader, renderer);
    shader.uniforms.uSaum = griff.saum;
    shader.uniforms.uDaempfung = griff.daempfung;
    shader.uniforms.uWisch = griff.wisch;
    shader.uniforms.uWischSpanne = griff.wischSpanne;
    shader.uniforms.uSaumFarbe = { value: saumFarbe };
    shader.uniforms.uStreifRichtung = streifRichtung;
    shader.uniforms.uSaumSchwelle = saumSchwelle;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vLichtOrt;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vLichtOrt = position.xy;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uSaum;
uniform float uDaempfung;
uniform float uWisch;
uniform float uWischSpanne;
uniform vec3 uSaumFarbe;
uniform vec3 uStreifRichtung;
uniform float uSaumSchwelle;
varying vec2 vLichtOrt;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
// C — der Raum tritt zurueck. Ein Faktor auf das fertige Bild: der Ton
// bleibt, der Gegenstand geht ins Schwarz des Raums zurueck.
gl_FragColor.rgb *= 1.0 - uDaempfung;
${
  optionen.saum
    ? `
// A — Kantenlicht, erster Teil: der Fresnel-Term. Nur streifende Winkel;
// unterhalb der Schwelle liefert das \`smoothstep\` exakt null, und die zur
// Kamera zeigende Flaeche bleibt unveraendert.
{
  float lichtBlick = clamp( dot( normalize( vViewPosition ), normal ), 0.0, 1.0 );
  float lichtSaum = smoothstep( uSaumSchwelle, ${licht.saumEnde.toFixed(3)}, 1.0 - lichtBlick );
  gl_FragColor.rgb += uSaumFarbe * ( lichtSaum * uSaum * ${licht.saumStaerke.toFixed(3)} );
}`
    : ''
}${
  optionen.streif
    ? `
// A — Kantenlicht, zweiter Teil: das flache Licht. Es liegt im Material und
// nicht in der Szene, damit es die Umschlagflaechen nicht erreichen kann.
{
  float lichtStreif = max( dot( normal, uStreifRichtung ), 0.0 );
  gl_FragColor.rgb += uSaumFarbe * ( pow( lichtStreif, ${licht.streifHaerte.toFixed(2)} ) * uSaum * ${licht.streifStaerke.toFixed(3)} );
}`
    : ''
}
// sheenSweep — ein breites, schwaches Glanzband, das einmal flach ueber
// den Umschlag faehrt. Unter -8 liegt kein Band an.
if ( uWisch > -8.0 ) {
  float lichtOrt = vLichtOrt.x / uWischSpanne;
  float lichtBand = 1.0 - smoothstep( 0.0, ${licht.wischBreite.toFixed(3)}, abs( lichtOrt - uWisch ) );
  gl_FragColor.rgb += uSaumFarbe * ( lichtBand * lichtBand * ${licht.wischStaerke.toFixed(3)} );
}`,
      );
  };

  // Ohne eigenen Schluessel gibt der Renderer diesem Material das
  // uebersetzte Programm eines gleich beschriebenen Materials **ohne**
  // Einbau — die Beschreibung allein unterscheidet die beiden nicht.
  material.customProgramCacheKey = () =>
    `hoverlicht:${optionen.saum ? 'saum' : ''}${optionen.streif ? 'streif' : ''}`;
  material.needsUpdate = true;
  return griff;
}
