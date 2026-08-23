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
  /** Bis zu welchem Knochen die Kruemmung „innen" gilt. */
  innenBis: number;
  /** Wie stark sie innen woelbt und wie stark sie aussen zurueckbiegt. */
  innen: number;
  aussen: number;
  /** Der Knick quer zur Wendeachse, waehrend das Blatt umschlaegt. */
  falte: number;
};

export const seitenFormVorgabe: SeitenForm = {
  segmente: 26,
  lambda: 13,
  verteilt: false,
  innenBis: 8,
  innen: 0.9,
  aussen: 0.25,
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
    const stoffe: THREE.Material | THREE.Material[] =
      Array.isArray(stoff) && tiefe > 0 && werte.kante
        ? [
            werte.kante,
            werte.kante,
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
    for (let i = 0; i < n; i += 1) {
      const innen =
        i < form.innenBis ? Math.sin(i * 0.2 + 0.25) * form.innen : 0;
      const aussen =
        i >= form.innenBis ? Math.cos(i * 0.3 + 0.09) * form.aussen : 0;
      roh[i] = innen - aussen;
      summe += roh[i];
    }
    if (Math.abs(summe) > 1e-6) {
      for (let i = 0; i < n; i += 1) roh[i] /= summe;
    }
    return roh;
  })();

  function haltungSetzen(index: number, haltung: BlattHaltung, delta: number) {
    const blatt = blaetter[index];
    if (!blatt) return;
    const n = blatt.kette.length;
    const gedreht =
      richtung * Math.PI * easeInOut(haltung.anteil) + (haltung.faecher ?? 0);
    // Die Woelbung ist der freien Kante entgegengesetzt: das Papier bleibt
    // zurueck, wenn man es am Bund anhebt.
    const bogen = -richtung * haltung.bogen;

    for (let i = 0; i < n; i += 1) {
      const welle = Math.sin((Math.PI * i) / (n - 1));
      // Der erste Knochen traegt die Drehung, alle weiteren die Woelbung —
      // und die folgt dem Profil oben, nicht mehr einem halben Sinus.
      const ziel = i === 0 ? gedreht : bogen * profil[i];
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
