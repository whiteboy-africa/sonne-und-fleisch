// Bewegungsmodell der liegenden Stapel.
//
// Die Buecher liegen flach aufeinander, Cover nach oben. Wer blaettert, zieht
// den naechsten Band seitlich aus seinem Stapel und stellt ihn davor auf;
// der vorige geht denselben Weg zurueck. Die Baender darueber rutschen nach.
//
// Achsen: X ist die Reihe der Stapel, Y die Hoehe, Z die Tiefe (+Z zur
// Kamera). Ein Buchkoerper wird stehend gebaut (Breite X, Hoehe Y, Dicke Z,
// Vorderdeckel auf +Z). `pitch` kippt ihn: 0 heisst aufrecht mit Cover zur
// Kamera, -PI/2 heisst flach liegend mit Cover nach oben.
//
// Grundlage war das Reihen-Regal des Mint-Playground-Templates
// (MIT, siehe LICENSE-mint-playground); Posen, Layout und Kollision sind
// fuer die Stapel neu geschrieben.

export const flatPitch = -Math.PI / 2;
/** Der aufgestellte Band lehnt sich leicht zurueck, sonst wirkt er wie geklebt. */
export const leanBack = -0.14;
export const uprightPitch = 0;

const presentedScale = 1.03;
const maximumFocusScale = 1.08;
const collisionMargin = 0.035;
/** Groesste seitliche/tiefe Abweichung eines gestapelten Bandes. */
export const maxStackJitter = 0.06;
/** Der aufgestellte Band steht ein Stueck vor dem Stapel. */
const pulledClearance = 0.16;
/**
 * Wie weit ein Band beim Herausziehen aus der Stapelachse wandert. Er stellt
 * sich neben seinen Stapel, nicht davor — sonst verdeckt er ihn ganz.
 */
export const pulledSideStep = 0.62;

export type BookPose = {
  /** Seitlicher Versatz im Stapelplatz. */
  x: number;
  /** Hoehe der Buchmitte ueber der Platte. */
  y: number;
  /** Tiefe: 0 ist die Stapelachse, groesser ist naeher an der Kamera. */
  z: number;
  /** Drehung um die Hochachse — im Stapel die Schieflage. */
  yaw: number;
  /** Kippen: -PI/2 liegt flach, 0 steht aufrecht. */
  pitch: number;
  scale: number;
};

/**
 * Der Platz eines Bandes: wo er im Stapel liegt und wie schief. Wird beim
 * Aufbau einmal gewuerfelt (deterministisch aus dem Index) und danach nur
 * noch in `stackY` fortgeschrieben, wenn darunter ein Band fehlt.
 */
export type BookPlace = {
  /** Hoehe der Buchmitte im Stapel, ueber der Platte. */
  stackY: number;
  jitterX: number;
  jitterZ: number;
  jitterYaw: number;
  height: number;
  thickness: number;
};

export type MotionBookSize = {
  width: number;
  height: number;
  thickness: number;
};

export type MotionLayout = {
  /** Oberkante der Platte, auf der die Stapel liegen. */
  floorTop: number;
  /** Tiefe, in der der aufgestellte Band steht. */
  pulledZ: number;
  presentedScale: number;
  collisionMargin: number;
};

export type BrowseMotionPhase =
  | 'retreat-current'
  | 'turn-current'
  | 'shelve-current'
  | 'extract-next'
  | 'turn-next'
  | 'settle-next';

export const browsePhaseDuration: Record<BrowseMotionPhase, number> = {
  'retreat-current': 0.13,
  'turn-current': 0.12,
  'shelve-current': 0.1,
  'extract-next': 0.12,
  'turn-next': 0.15,
  'settle-next': 0.1,
};

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smooth(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

/**
 * Immer dieselbe Unordnung: aus dem Index gerechnet, nicht gewuerfelt. Sonst
 * lagen die Stapel bei jedem Aufruf anders und die Kollisionspruefung haette
 * keinen festen Bezug.
 */
export function stackJitter(index: number) {
  const a = Math.sin(index * 12.9898) * 43758.5453;
  const b = Math.sin(index * 78.233) * 12345.6789;
  const c = Math.sin(index * 39.425) * 24634.6345;
  const frac = (value: number) => value - Math.floor(value);
  return {
    jitterX: (frac(a) - 0.5) * 2 * maxStackJitter,
    jitterZ: (frac(b) - 0.5) * 2 * maxStackJitter,
    jitterYaw: (frac(c) - 0.5) * 0.16,
  };
}

export function createMotionLayout(books: MotionBookSize[]): MotionLayout {
  const maxHeight = books.reduce(
    (maximum, book) => Math.max(maximum, book.height),
    2,
  );
  const maxThickness = books.reduce(
    (maximum, book) => Math.max(maximum, book.thickness),
    0.2,
  );

  // Der zurueckgelehnte Band ist tiefer als er dick ist: die Neigung legt
  // einen Teil seiner Hoehe in die Tiefe. Ohne diesen Anteil steht er der
  // Kollisionspruefung nach im Stapel, und keine Bewegung kaeme durch.
  const leanedDepth =
    Math.abs(Math.cos(leanBack)) * maxThickness +
    Math.abs(Math.sin(leanBack)) * maxHeight;

  return {
    floorTop: 0,
    // Der liegende Stapel ist so tief wie das hoechste Buch lang ist. Davor
    // muss der aufgestellte Band Platz haben, ohne ihn zu schneiden — plus
    // Luft fuer die Schieflage der gestapelten Baende.
    pulledZ:
      maxHeight * 0.5 +
      leanedDepth * 0.5 * maximumFocusScale +
      maxStackJitter +
      collisionMargin +
      pulledClearance,
    presentedScale,
    collisionMargin,
  };
}

/** Hoehe der Buchmitte, wenn der Band aufrecht auf der Platte steht. */
function standingY(place: BookPlace, layout: MotionLayout) {
  const lean = Math.abs(leanBack);
  return (
    layout.floorTop +
    place.height * 0.5 * Math.cos(lean) +
    place.thickness * 0.5 * Math.sin(lean)
  );
}

/** Der Band liegt in seinem Stapel. */
export function stackedBookPose(
  place: BookPlace,
  _layout: MotionLayout,
): BookPose {
  return {
    x: place.jitterX,
    y: place.stackY,
    z: place.jitterZ,
    yaw: place.jitterYaw,
    pitch: flatPitch,
    scale: 1,
  };
}

/** Der Band steht aufgestellt vor seinem Stapel. */
export function presentedBookPose(
  place: BookPlace,
  layout: MotionLayout,
): BookPose {
  return {
    x: pulledSideStep,
    y: standingY(place, layout),
    z: layout.pulledZ,
    yaw: 0,
    pitch: leanBack,
    scale: layout.presentedScale,
  };
}

export function browseMotionPose(
  phase: BrowseMotionPhase,
  progress: number,
  place: BookPlace,
  layout: MotionLayout,
): BookPose {
  const t = smooth(progress);
  const stand = standingY(place, layout);

  switch (phase) {
    // Der aufgestellte Band legt sich hin, noch vor dem Stapel.
    case 'retreat-current':
      return {
        x: lerp(pulledSideStep, place.jitterX, t),
        y: lerp(stand, place.stackY, t),
        z: layout.pulledZ,
        yaw: lerp(0, place.jitterYaw, t),
        pitch: lerp(leanBack, flatPitch, t),
        scale: lerp(layout.presentedScale, 1, t),
      };
    // ... und schiebt sich zurueck in den Stapel.
    case 'turn-current':
      return {
        x: place.jitterX,
        y: place.stackY,
        z: lerp(layout.pulledZ, place.jitterZ, t),
        yaw: place.jitterYaw,
        pitch: flatPitch,
        scale: 1,
      };
    // Kurzes Setzen, damit der Stapel nicht schnappt.
    case 'shelve-current':
      return stackedBookPose(place, layout);
    // Der naechste Band rutscht flach aus dem Stapel heraus.
    case 'extract-next':
      return {
        x: lerp(place.jitterX, pulledSideStep, t),
        y: place.stackY,
        z: lerp(place.jitterZ, layout.pulledZ, t),
        yaw: lerp(place.jitterYaw, 0, t),
        pitch: flatPitch,
        scale: 1,
      };
    // ... richtet sich auf.
    case 'turn-next':
      return {
        x: pulledSideStep,
        y: lerp(place.stackY, stand, t),
        z: layout.pulledZ,
        yaw: 0,
        pitch: lerp(flatPitch, leanBack, t),
        scale: 1,
      };
    case 'settle-next':
      return {
        x: pulledSideStep,
        y: stand,
        z: layout.pulledZ,
        yaw: 0,
        pitch: leanBack,
        scale: lerp(1, layout.presentedScale, t),
      };
  }
}

/**
 * Vom aufgestellten Band in die Betrachtung: er richtet sich ganz auf, kommt
 * naeher und ruecht zur Seite, damit das Textfeld daneben Platz hat.
 */
export function focusedBookPose(
  progress: number,
  place: BookPlace,
  layout: MotionLayout,
  focusX: number,
  focusZ: number,
  focusScale: number,
): BookPose {
  const value = clamp01(progress);
  const clearanceProgress = smooth(Math.min(1, value / 0.55));
  const presentationProgress = smooth(Math.max(0, (value - 0.55) / 0.45));
  const stand = standingY(place, layout);

  return {
    x: lerp(pulledSideStep, focusX, presentationProgress),
    y: lerp(stand, stand + 0.14, clearanceProgress),
    z: lerp(layout.pulledZ, focusZ, clearanceProgress),
    yaw: 0,
    pitch: lerp(leanBack, uprightPitch, clearanceProgress),
    scale: lerp(layout.presentedScale, focusScale, presentationProgress),
  };
}

// --- Kollision ---------------------------------------------------------------

export type BookVolume = {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  scale: number;
  width: number;
  height: number;
  thickness: number;
};

type Axis = { x: number; z: number };

function dot(left: Axis, right: Axis) {
  return left.x * right.x + left.z * right.z;
}

/**
 * Ausdehnung eines gekippten Bandes. Flach liegend ist die Buchhoehe die
 * Tiefe und die Dicke die Hoehe; aufrecht ist es umgekehrt.
 */
function extentsFor(volume: BookVolume) {
  const flatness = Math.abs(Math.sin(volume.pitch));
  const uprightness = Math.abs(Math.cos(volume.pitch));
  return {
    x: volume.width * volume.scale,
    y:
      (uprightness * volume.height + flatness * volume.thickness) *
      volume.scale,
    z:
      (uprightness * volume.thickness + flatness * volume.height) *
      volume.scale,
  };
}

function axesFor(volume: BookVolume) {
  const cosine = Math.cos(volume.yaw);
  const sine = Math.sin(volume.yaw);
  return {
    width: { x: cosine, z: -sine },
    depth: { x: sine, z: cosine },
  };
}

/**
 * Zwei Baende stossen zusammen, wenn sich ihre Hoehenabschnitte ueberlappen
 * *und* ihre Grundflaechen. Ohne die Hoehenpruefung wuerde jeder Stapel als
 * Dauerkollision gelten — dort liegt ja alles uebereinander.
 *
 * In der Hoehe wird ohne Rand geprueft und ein Zehntelmillimeter Toleranz
 * gelassen: gestapelte Buecher beruehren sich, das ist keine Kollision.
 */
export function bookVolumesOverlap(
  left: BookVolume,
  right: BookVolume,
  margin = collisionMargin,
) {
  const leftSize = extentsFor(left);
  const rightSize = extentsFor(right);

  const verticalGap =
    Math.abs(right.y - left.y) - (leftSize.y + rightSize.y) * 0.5;
  if (verticalGap > -0.002) return false;

  const leftAxes = axesFor(left);
  const rightAxes = axesFor(right);
  const axes = [
    leftAxes.width,
    leftAxes.depth,
    rightAxes.width,
    rightAxes.depth,
  ];
  const centerDelta = { x: right.x - left.x, z: right.z - left.z };
  const leftHalfWidth = leftSize.x * 0.5 + margin * 0.5;
  const leftHalfDepth = leftSize.z * 0.5 + margin * 0.5;
  const rightHalfWidth = rightSize.x * 0.5 + margin * 0.5;
  const rightHalfDepth = rightSize.z * 0.5 + margin * 0.5;

  return axes.every((axis) => {
    const distance = Math.abs(dot(centerDelta, axis));
    const leftRadius =
      leftHalfWidth * Math.abs(dot(leftAxes.width, axis)) +
      leftHalfDepth * Math.abs(dot(leftAxes.depth, axis));
    const rightRadius =
      rightHalfWidth * Math.abs(dot(rightAxes.width, axis)) +
      rightHalfDepth * Math.abs(dot(rightAxes.depth, axis));
    return distance < leftRadius + rightRadius;
  });
}
