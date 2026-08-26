// Ein Blatt, das umschlaegt — die Mechanik, ohne den Anlass.
//
// Hier steht, **wie** ein Blatt eine Haltung einnimmt: ein `SkinnedMesh`
// mit einer Knochenkette laengs der Wendeachse, der erste Knochen traegt
// die Drehung, alle weiteren die Biegung. Hier steht **nicht**, welche
// Haltung wann gilt — das ist die Sache dessen, der das Rig benutzt.
//
// Genau an dieser Naht sind die beiden Abnehmer verschieden:
//
// - Die **Leseprobe** (`blaetter-rig.ts`) laesst fuenf Blaetter in einer
//   Kaskade durchfliegen. Eine einzige Zahl treibt alles: der Stand des
//   Aufschlagens. Die Woelbung ist eine Sinuswelle ueber die Zeit — null am
//   Anfang, null am Ende, am groessten in der Mitte.
// - Das **Magazin** (`magazin-rig.ts`) blaettert einzeln und auf Zuruf.
//   Die Woelbung kommt dort nicht aus der Zeit, sondern aus der Hand: wer
//   die Ecke zieht, biegt das Blatt, und beim Loslassen schnappt es.
//
// Eine gemeinsame Zeitkurve haette den einen oder den anderen falsch
// bedient. Eine gemeinsame **Haltung** bedient beide: `anteil` sagt, wie
// weit das Blatt herum ist, `bogen`, wie stark es sich dabei woelbt. Wer
// das Rig benutzt, rechnet sich diese zwei Zahlen aus und reicht sie
// herein.
//
// Warum ueberhaupt Knochen: eine starre Ebene, die um den Bund kippt, sieht
// aus wie eine Klappe. Papier wehrt sich, wenn man es anhebt — die freie
// Kante bleibt zurueck, das Blatt wirft einen Bogen, und erst am Ende legt
// es sich wieder gerade. Genau das ist der Unterschied zwischen einer
// umschlagenden Seite und einem Scharnier.
//
// Gedaempft wird mit `1 - exp(-lambda * delta)`, wie im uebrigen Regal.
// Ein `delta` von 1 setzt die Haltung praktisch sofort — so kommt der
// harte Wechsel zustande, den `prefers-reduced-motion` verlangt.

import * as THREE from 'three';

/** Wie fein und wie biegsam ein Blatt ist. */
export type SeitenForm = {
  /** Segmente laengs der Wendeachse — so fein wird die Biegung. */
  segmente: number;
  /** Daempfung der Knochen. Wie die Kamera im Fokus: lambda 13. */
  lambda: number;
  /**
   * Der Knick quer zur Wendeachse gilt nur, wenn hier `true` steht — die
   * Leseprobe braucht ihn nicht, das Heft schon.
   */
  verteilt: boolean;
  /**
   * **Wo die Drehung sitzt: im Scharnier oder in der Flaeche.**
   *
   * `false` (die Leseprobe): der erste Knochen traegt die ganze Drehung.
   * Das Blatt ist dann eine ebene Klappe am Bund, und die Woelbung kommt
   * als kleiner Zuschlag obendrauf. Fuer Blaetter, die vorbeifliegen,
   * genuegt das.
   *
   * `true` (das Heft): die Drehung wird ueber die **ganze Kette** verteilt,
   * nach demselben Profil wie die Woelbung. Gemessen wird dabei nicht von
   * der Ruhelage aus, sondern von der **Senkrechten** — das Blatt steht auf
   * halbem Weg gerade und legt sich nach beiden Seiten spiegelbildlich um.
   *
   * Der Unterschied ist der zwischen einer gefalteten Karte und einem
   * gebundenen Heft: eine Klappe knickt am Bund und ist dahinter eben, ein
   * Blatt kommt **senkrecht aus dem Bund heraus** und biegt sich erst
   * daneben in die Flaeche. Nachgemessen ueber den Weg vom Bund nach
   * aussen, in Seitenbreiten: die Klappe sinkt gleichmaessig durch
   * (0 → -0,13 an der Aussenkante, ohne Bauch), das gebundene Blatt hebt
   * sich in den ersten zehn Prozent auf +0,16 und legt sich dann flach.
   * Genau dieser Bauch am Bund ist es, den man an einem Heft sieht.
   */
  drehungVerteilt: boolean;
  /** Bis zu welchem Knochen die Kruemmung „innen" gilt. */
  innenBis: number;
  /**
   * **Wie weit die Kurve reicht, in Anteilen der Seite.** Null heisst: so
   * weit wie `innenBis` Knochen von Haus aus reichen (bei 26 Segmenten und
   * `innenBis` 8 sind das 31 Prozent).
   *
   * Beide Teile des Profils werden dann auf ihren Anteil **umgerechnet**,
   * nicht bloss verschoben: der woelbende Teil laeuft ueber die ersten so
   * viel Prozent der Kette ab, der zurueckbiegende ueber den Rest. Damit
   * wandert der Bauch nach aussen und der Rueckbogen bleibt trotzdem
   * drin — anders als beim blossen Strecken, bei dem er hinten aus der
   * Kette faellt und die Seite sich aufrollt.
   */
  innenAnteil: number;
  /** Wie stark sie innen woelbt und wie stark sie aussen zurueckbiegt. */
  innen: number;
  aussen: number;
  /**
   * **Wie viel von der Drehung in der Flaeche liegt** und wie viel im
   * Scharnier am Bund. Nur bei `drehungVerteilt` von Belang.
   *
   * 1 heisst: alles in der Flaeche — die Seite steht am Bund senkrecht und
   * legt sich ueber ihre ganze Laenge um. Das ist die staerkste Form und
   * zugleich die engste: die Seite muss den ganzen Weg in ihrer Flaeche
   * unterbringen, also faellt der Bauch hoch aus und sitzt dicht am Bund.
   *
   * Weniger heisst: das Scharnier nimmt einen Teil vorweg, die Seite
   * kommt schon schraeg aus dem Bund, und der Rest verteilt sich flacher
   * ueber mehr Papier. Ort und Hoehe des Bauchs haengen zusammen — wer ihn
   * nach aussen schieben will, ohne die Seite aufzurollen, muss ihn
   * zugleich flacher machen. Beide Griffe zusammen tun das.
   */
  flaechenAnteil: number;
  /** Der Knick quer zur Wendeachse, waehrend das Blatt umschlaegt. */
  falte: number;
};

export const seitenFormVorgabe: SeitenForm = {
  segmente: 26,
  lambda: 13,
  verteilt: false,
  drehungVerteilt: false,
  innenBis: 8,
  innenAnteil: 0,
  innen: 0.9,
  aussen: 0.25,
  flaechenAnteil: 1,
  falte: THREE.MathUtils.degToRad(2),
};

/**
 * Die Haltung eines Blattes. Mehr braucht es nicht: wie weit herum, und
 * wie stark gewoelbt.
 */
export type BlattHaltung = {
  /** 0 liegt flach im Stapel, 1 ist ganz umgeschlagen. */
  anteil: number;
  /**
   * Woelbung im Bogenmass ueber die ganze Kette. Null ist eine starre
   * Klappe; zu viel rollt das Blatt zusammen. Das Vorzeichen entscheidet,
   * wohin sich der Bogen wirft.
   */
  bogen: number;
  /**
   * Wie weit dieses Blatt ueber seine Ruhelage hinaus aufsteht.
   *
   * Ein Stapel Blaetter liegt nicht deckungsgleich: jedes folgende steht
   * ein Grad weiter offen, und dadurch faechert der Block auf. Ohne das
   * sind zwoelf Blaetter eine Platte.
   */
  faecher?: number;
};

export type SeitenBlatt = {
  netz: THREE.SkinnedMesh;
  kette: THREE.Bone[];
  /**
   * Der Stoff, von aussen wechselbar. Das Magazin tauscht darueber die
   * Seitenbilder seines lebenden Fensters, ohne das Rig neu zu bauen.
   */
  stoffSetzen: (stoff: THREE.Material | THREE.Material[]) => void;
};

export type SeitenRig = {
  gruppe: THREE.Group;
  blaetter: SeitenBlatt[];
  /** Bringt ein Blatt in seine Haltung. `delta` ist die Bildzeit. */
  haltungSetzen: (index: number, haltung: BlattHaltung, delta: number) => void;
  /**
   * Der Weg, den ein Blatt beim Umschlagen nimmt, wenn ihn nichts anderes
   * vorgibt: die Woelbung als Sinuswelle ueber die Bewegung, an beiden
   * Enden null. Die Leseprobe faehrt danach, das Magazin nur, solange
   * niemand zieht.
   */
  bogenAusZeit: (anteil: number, staerke: number) => number;
  /**
   * Wie weit ein Blatt in dieser Haltung **wirklich** reicht — vom Bund bis
   * zur freien Kante, in Szeneneinheiten, aufgeteilt in quer (`x`) und in
   * die Tiefe (`z`).
   *
   * Ein gewoelbtes Blatt ist schmaler als ein flaches: was sich in den
   * Bauch am Bund legt, fehlt in der Breite. Bei der Ruhelage des Heftes
   * sind das 16 Prozent. Wer die Kamera auf die Doppelseite einpasst, muss
   * mit dieser Zahl rechnen und nicht mit der Papierbreite, sonst steht das
   * Heft zu klein im Fenster.
   *
   * Gerechnet, nicht gemessen: die Kette wird einmal abgeschritten, Segment
   * fuer Segment, mit denselben Winkeln, die auch `haltungSetzen` verteilt.
   * So stimmt die Zahl von selbst, wenn jemand an der Form dreht.
   */
  spanne: (haltung: BlattHaltung) => { x: number; z: number; bauch: number };
  entsorgen: () => void;
};

/**
 * Baut `blaetter` Blaetter, am Bund uebereinander gestapelt.
 *
 * `stoff(index)` liefert das Material eines Blattes. Ein einzelnes gilt
 * fuer beide Seiten (dann muss es `DoubleSide` sein); ein Paar
 * `[vorn, hinten]` bedruckt Vorder- und Rueckseite verschieden — so traegt
 * ein Magazinblatt zwei Seitenzahlen, wie im Heft.
 *
 * Das Rig legt die Blaetter an, bewegt sie aber nicht von selbst. Wer es
 * baut, ruft `haltungSetzen` Bild fuer Bild.
 */
export function seitenRigBauen(werte: {
  breite: number;
  hoehe: number;
  /** Wie viele Blaetter im Stapel liegen. */
  blaetter: number;
  /** Wo der Stapel anfaengt, auf der Blickachse. */
  z: number;
  /** Abstand zweier Blaetter im Stapel. */
  blattAbstand: number;
  /**
   * Dicke eines Blattes. Null heisst: eine Ebene ohne Dicke — das genuegt,
   * solange man ein Blatt nur von vorn sieht.
   *
   * Ueber null wird daraus ein flacher Quader, und der hat **Kanten**. Das
   * ist der Unterschied zwischen einem Stapel Papier und einer Platte: was
   * einen Buchblock ausmacht, sieht man an seiner Schnittkante, nicht an
   * seiner Flaeche. Wer Dicke bestellt, muss `kante` mitgeben — die vier
   * Schmalseiten brauchen ihr eigenes Material.
   */
  tiefe?: number;
  kante?: THREE.Material;
  /**
   * Die Kante **am Bund**. Dort ist ein Heft geheftet, nicht geschnitten:
   * man sieht keinen Papierschnitt, man sieht einen Falz im Schatten. Mit
   * derselben hellen Kante wie aussen stand dort ein weisser Streifen
   * mitten im Bild — zwoelf Blattkanten uebereinander, alle beleuchtet.
   */
  bundKante?: THREE.Material;
  /**
   * Wo der Bund liegt, in Rig-Koordinaten — die Achse, um die sich jedes
   * Blatt dreht.
   *
   * Beim **Band** liegt er an der linken Kante des Buchkoerpers, und der
   * ist um seine Mitte gebaut: `-breite / 2`. Beim **Heft** liegt er im
   * Ursprung, denn dort ist der Bund die Mitte der Doppelseite und alles
   * andere haengt daran — die beiden Bloecke ebenso wie die Kamera.
   *
   * Ohne diesen Griff erbte das Heft die Lage des Bandes und stand um eine
   * halbe Seitenbreite neben der Kamera. Zu sehen war das erst, als die
   * gemessenen Zahlen stimmten und das Bild nicht.
   */
  bund: number;
  /** +1: der Stapel liegt vorn. -1: der Band ist gewendet. */
  seite: 1 | -1;
  stoff: (index: number) => THREE.Material | THREE.Material[];
  form?: Partial<SeitenForm>;
}): SeitenRig {
  const form: SeitenForm = { ...seitenFormVorgabe, ...werte.form };
  const { breite, hoehe, seite } = werte;

  const gruppe = new THREE.Group();
  gruppe.name = 'seiten-rig';

  const muell: Array<{ dispose: () => void }> = [];
  const merken = <T extends { dispose: () => void }>(stueck: T) => {
    muell.push(stueck);
    return stueck;
  };

  const segBreite = breite / form.segmente;
  const blaetter: SeitenBlatt[] = [];

  for (let i = 0; i < werte.blaetter; i += 1) {
    const tiefe = werte.tiefe ?? 0;
    const form3d = merken(
      tiefe > 0
        ? new THREE.BoxGeometry(breite, hoehe, tiefe, form.segmente, 1)
        : new THREE.PlaneGeometry(breite, hoehe, form.segmente, 1),
    );
    // Der Bund liegt bei x = 0, das Blatt reicht nach rechts.
    form3d.translate(breite * 0.5, 0, 0);
    kettenGewichteSetzen(form3d, segBreite, form.segmente);

    const stoff = werte.stoff(i);
    /*
     * Zwei Materialien, zwei Wege dorthin.
     *
     * **Ohne Dicke** heisst es: zweimal dieselben Dreiecke zeichnen, einmal
     * von vorn und einmal von hinten. So traegt ein Blatt aus einem Stueck
     * zwei verschiedene Seiten — ohne zweites Netz, das beim Biegen von der
     * Kette abkaeme.
     *
     * **Mit Dicke** bringt der Quader seine Gruppen schon mit: vier
     * Schmalseiten, dann vorn und hinten. Die vier bekommen den
     * Papierschnitt, die letzten beiden die Seiten.
     */
    // Reihenfolge beim Quader: +x, -x, +y, -y, +z, -z. Die zweite ist die
    // Kante am Bund — dort liegt der Falz, nicht der Schnitt.
    const stoffe: THREE.Material | THREE.Material[] =
      Array.isArray(stoff) && tiefe > 0 && werte.kante
        ? [
            werte.kante,
            werte.bundKante ?? werte.kante,
            werte.kante,
            werte.kante,
            stoff[0],
            stoff[1],
          ]
        : stoff;
    if (Array.isArray(stoff) && tiefe <= 0) {
      form3d.clearGroups();
      form3d.addGroup(0, Infinity, 0);
      form3d.addGroup(0, Infinity, 1);
    }

    const kette: THREE.Bone[] = [];
    for (let k = 0; k < form.segmente; k += 1) {
      const knochen = new THREE.Bone();
      knochen.position.x = k === 0 ? 0 : segBreite;
      if (k > 0) kette[k - 1].add(knochen);
      kette.push(knochen);
    }

    const netz = new THREE.SkinnedMesh(form3d, stoffe);
    netz.name = `seite-${i}`;
    netz.add(kette[0]);
    const skelett = new THREE.Skeleton(kette);
    merken(skelett);
    netz.bind(skelett);
    // Ein gebeugtes Netz verlaesst seinen urspruenglichen Kasten; ohne das
    // verschwindet das Blatt mitten in der Drehung aus dem Bild.
    netz.frustumCulled = false;
    netz.position.set(
      werte.bund,
      0,
      werte.z + seite * werte.blattAbstand * (werte.blaetter - i),
    );
    gruppe.add(netz);

    blaetter.push({
      netz,
      kette,
      stoffSetzen: (neu) => {
        if (Array.isArray(neu) && !Array.isArray(netz.material)) {
          form3d.clearGroups();
          form3d.addGroup(0, Infinity, 0);
          form3d.addGroup(0, Infinity, 1);
        }
        netz.material = neu;
      },
    });
  }

  // Nach links auf: vorn gegen den Uhrzeigersinn, hinten andersherum.
  const richtung = seite === 1 ? -1 : 1;

  /**
   * Verteilt Drehung und Biegung auf die Kette.
   *
   * Der erste Knochen traegt die ganze Drehung. Alle weiteren tragen nur
   * die Biegung, und die folgt ueber die Laenge einem halben Sinus: am Bund
   * und an der freien Kante keine Kruemmung, in der Mitte des Blattes die
   * meiste. Ein Blatt knickt nicht an der Kante, es woelbt sich in der
   * Flaeche.
   */
  /*
   * Das Profil der verteilten Drehung, einmal ausgerechnet.
   *
   * Zwei Anteile, und der zweite ist der wichtige: **innen** woelbt sich
   * das Blatt in die eine Richtung, **aussen** biegt es ein Stueck
   * zurueck. Erst dieses Zurueckbiegen macht aus einem Bogen ein Blatt
   * Papier — eine reine Kreisbahn liest sich wie ein Rohr, ein Blatt hat
   * einen Wendepunkt. Vorher stand hier ein halber Sinus, und genau der
   * ist die Kreisbahn.
   *
   * Normiert auf die Summe eins: die Knochenwinkel addieren sich dann
   * genau zur verlangten Woelbung, egal wie die beiden Staerken stehen.
   */
  const profil = (() => {
    const n = form.segmente;
    const roh = new Array<number>(n);
    let summe = 0;
    /*
     * Wo die Grenze zwischen innen und aussen liegt — von Haus aus dort,
     * wo `innenBis` Knochen enden. Wird sie verschoben, laeuft jeder der
     * beiden Teile ueber seinen neuen Abschnitt ab, in derselben Form.
     */
    const grenze =
      form.innenAnteil > 0
        ? THREE.MathUtils.clamp(form.innenAnteil, 0.1, 0.9) * (n - 1)
        : form.innenBis;

    /*
     * **Jeder Teil behaelt sein Gewicht.**
     *
     * Der woelbende und der zurueckbiegende Teil werden einzeln auf ihre
     * urspruengliche Summe gebracht, bevor das Ganze auf eins normiert
     * wird. Ohne das verschiebt schon das Umrechnen das Verhaeltnis
     * zwischen ihnen: der Teil, der mehr Knochen bekommt, bekommt dabei
     * auch mehr Gewicht — die Seite woelbt sich dann frueh und stark und
     * biegt hinten nicht mehr genug zurueck, also legt sie sich draussen
     * nicht mehr hin, sondern bleibt oben stehen (Rand +0,29 statt -0,01).
     *
     * Dieselbe Kruemmung ueber mehr Papier zu verteilen heisst: die Summe
     * bleibt, die Strecke waechst. Genau das steht hier.
     */
    let sollInnen = 0;
    let sollAussen = 0;
    for (let i = 0; i < n; i += 1) {
      if (i < form.innenBis) sollInnen += Math.sin(i * 0.2 + 0.25) * form.innen;
      else sollAussen += Math.cos(i * 0.3 + 0.09) * form.aussen;
    }

    let istInnen = 0;
    let istAussen = 0;
    const teil = new Array<boolean>(n);
    for (let i = 0; i < n; i += 1) {
      // Die Stelle im urspruenglichen Profil: innen auf [0, innenBis],
      // aussen auf [innenBis, n-1], jeweils gleichmaessig gedehnt.
      const drin = i < grenze;
      teil[i] = drin;
      const t = drin
        ? (i / Math.max(1e-6, grenze)) * form.innenBis
        : form.innenBis +
          ((i - grenze) / Math.max(1e-6, n - 1 - grenze)) *
            (n - 1 - form.innenBis);
      if (drin) {
        roh[i] = Math.sin(t * 0.2 + 0.25) * form.innen;
        istInnen += roh[i];
      } else {
        roh[i] = -Math.cos(t * 0.3 + 0.09) * form.aussen;
        istAussen += -roh[i];
      }
    }

    const massInnen = Math.abs(istInnen) > 1e-6 ? sollInnen / istInnen : 1;
    const massAussen = Math.abs(istAussen) > 1e-6 ? sollAussen / istAussen : 1;
    for (let i = 0; i < n; i += 1) {
      roh[i] *= teil[i] ? massInnen : massAussen;
      summe += roh[i];
    }
    if (Math.abs(summe) > 1e-6) {
      for (let i = 0; i < n; i += 1) roh[i] /= summe;
    }
    return roh;
  })();

  /*
   * Die Senkrechte: die Haltung auf halbem Weg, das Blatt steht auf dem
   * Bund. Von hier aus wird bei verteilter Drehung gerechnet — nach beiden
   * Seiten gleich weit und deshalb spiegelbildlich gewoelbt. Vom
   * Ruhepunkt aus gerechnet haette die eine Seite den doppelten Bogen und
   * die andere gar keinen.
   */
  const senkrecht = richtung * Math.PI * 0.5;

  /*
   * Die Woelbung aus der Bewegung verteilt sich als halber Sinus ueber die
   * Kette — am Bund und an der freien Kante null, in der Mitte am meisten.
   * Auf Summe eins gebracht, damit `bogen` weiter ein Winkel bleibt und
   * nicht bloss eine Zahl ohne Mass.
   */
  const welleProfil = (() => {
    const n = form.segmente;
    const roh = new Array<number>(n);
    let summe = 0;
    for (let i = 0; i < n; i += 1) {
      roh[i] = Math.sin((Math.PI * i) / (n - 1));
      summe += roh[i];
    }
    if (summe > 1e-6) for (let i = 0; i < n; i += 1) roh[i] /= summe;
    return roh;
  })();

  /**
   * Der Winkel **eines** Knochens. Die eine Stelle, an der steht, wie sich
   * Drehung und Woelbung auf die Kette verteilen — `haltungSetzen` stellt
   * danach, `spanne` schreitet danach ab.
   */
  function knochenWinkel(i: number, gedreht: number, bogen: number) {
    if (!form.drehungVerteilt) return i === 0 ? gedreht : bogen * profil[i];
    const inFlaeche = THREE.MathUtils.clamp(form.flaechenAnteil, 0, 1);
    const weg = gedreht - senkrecht;
    return (
      (i === 0 ? senkrecht + weg * (1 - inFlaeche) : 0) +
      weg * inFlaeche * profil[i] +
      bogen * welleProfil[i]
    );
  }

  /** Was `haltungSetzen` aus einer Haltung macht, in zwei Zahlen. */
  function haltungWinkel(haltung: BlattHaltung) {
    return {
      gedreht:
        richtung * Math.PI * easeInOut(haltung.anteil) + (haltung.faecher ?? 0),
      bogen: -richtung * haltung.bogen,
    };
  }

  function spanne(haltung: BlattHaltung) {
    const { gedreht, bogen } = haltungWinkel(haltung);
    let phi = 0;
    let x = 0;
    let z = 0;
    // Der Bauch: wie weit sich das Blatt unterwegs am weitesten aus der
    // Bundebene hebt. Wer eine Kamera darauf einpasst, muss ihn kennen —
    // die hoechste Stelle steht naeher, und naeher heisst groesser.
    let bauch = 0;
    for (let i = 0; i < form.segmente; i += 1) {
      phi += knochenWinkel(i, gedreht, bogen);
      x += segBreite * Math.cos(phi);
      z -= segBreite * Math.sin(phi);
      bauch = Math.max(bauch, Math.abs(z));
    }
    return { x, z, bauch };
  }

  function haltungSetzen(index: number, haltung: BlattHaltung, delta: number) {
    const blatt = blaetter[index];
    if (!blatt) return;
    const n = blatt.kette.length;
    // Die Woelbung ist der freien Kante entgegengesetzt: das Papier bleibt
    // zurueck, wenn man es am Bund anhebt.
    const { gedreht, bogen } = haltungWinkel(haltung);

    for (let i = 0; i < n; i += 1) {
      const welle = Math.sin((Math.PI * i) / (n - 1));
      // Der erste Knochen traegt die Drehung, alle weiteren die Woelbung —
      // und die folgt dem Profil oben, nicht mehr einem halben Sinus.
      //
      // Bei verteilter Drehung anders: dann steht im ersten Knochen nur
      // die Senkrechte, und der ganze Weg von dort zur Ruhelage liegt im
      // Profil. Das Blatt kommt so aus dem Bund heraus und legt sich
      // daneben hin, statt an einem Scharnier abzuknicken.
      const ziel = knochenWinkel(i, gedreht, bogen);
      const knochen = blatt.kette[i];
      knochen.rotation.y = damp(
        knochen.rotation.y,
        ziel,
        form.lambda * 2,
        delta,
      );

      // Der Knick quer dazu. Er greift nur auf der aeusseren Haelfte und
      // nur, solange sich etwas bewegt: eine Seite, die umschlaegt, faellt
      // nicht bloss um, sie wellt sich auch.
      const falteZiel =
        form.verteilt && i > form.innenBis
          ? Math.sign(gedreht) *
            form.falte *
            Math.sin(welle - 0.5) *
            Math.min(1, Math.abs(haltung.bogen) * 2)
          : 0;
      knochen.rotation.x = damp(
        knochen.rotation.x,
        falteZiel,
        form.lambda * 1.4,
        delta,
      );
    }
  }

  function entsorgen() {
    gruppe.removeFromParent();
    muell.forEach((stueck) => stueck.dispose());
    muell.length = 0;
    blaetter.length = 0;
  }

  return {
    gruppe,
    blaetter,
    haltungSetzen,
    bogenAusZeit: (anteil, staerke) =>
      staerke * Math.sin(Math.PI * Math.pow(THREE.MathUtils.clamp(anteil, 0, 1), 0.85)),
    spanne,
    entsorgen,
  };
}

export function easeInOut(wert: number) {
  const t = THREE.MathUtils.clamp(wert, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Federt einmal ueber das Ziel hinaus und kommt zurueck. */
export function easeUeberschwung(wert: number, staerke: number) {
  const t = THREE.MathUtils.clamp(wert, 0, 1);
  const c = 1 + staerke * 10;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

export function damp(
  jetzt: number,
  ziel: number,
  lambda: number,
  delta: number,
) {
  return THREE.MathUtils.lerp(jetzt, ziel, 1 - Math.exp(-lambda * delta));
}

/**
 * Haengt jeden Punkt des Netzes an die beiden Knochen links und rechts von
 * ihm — gewichtet nach seinem Abstand. Ohne das haette das Blatt keine
 * Ahnung, welcher Knochen es bewegt.
 */
function kettenGewichteSetzen(
  form3d: THREE.BufferGeometry,
  segBreite: number,
  segmente: number,
) {
  const punkte = form3d.attributes.position;
  const indizes: number[] = [];
  const gewichte: number[] = [];
  for (let i = 0; i < punkte.count; i += 1) {
    const x = punkte.getX(i);
    const roh = x / segBreite;
    const knochen = Math.min(segmente - 1, Math.max(0, Math.floor(roh)));
    const anteil = THREE.MathUtils.clamp(roh - knochen, 0, 1);
    const naechster = Math.min(segmente - 1, knochen + 1);
    indizes.push(knochen, naechster, 0, 0);
    gewichte.push(1 - anteil, anteil, 0, 0);
  }
  form3d.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indizes, 4));
  form3d.setAttribute(
    'skinWeight',
    new THREE.Float32BufferAttribute(gewichte, 4),
  );
}
