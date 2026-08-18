import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { CatalogBook } from "./katalog";
import {
  bookVolumesOverlap,
  browseMotionPose,
  browsePhaseDuration,
  createMotionLayout,
  flatPitch,
  focusedBookPose,
  presentedBookPose,
  pulledSideStep,
  stackJitter,
  stackedBookPose,
  type BookPlace,
  type BookPose,
  type BookVolume,
  type BrowseMotionPhase,
  type MotionLayout,
} from "./book-motion";
import {
  createBackCover,
  createFrontCover,
  createSpineCover,
} from "./cover-art";
import { siteConfig } from "./verlag-config";

export type ShelfMode = "browse" | "focusing" | "inspect" | "returning";
/** Bei Doppelbaenden: 'vorn' ist die erste Geschichte, 'hinten' die zweite. */
export type BookSide = "vorn" | "hinten";

type ShelfCallbacks = {
  onActiveIndex: (index: number) => void;
  onMode: (mode: ShelfMode, selectedIndex: number | null) => void;
  /** Welche der beiden Vorderseiten gerade oben ist. */
  onSide: (side: BookSide) => void;
  /**
   * Ein Seitwaertswechsel beginnt: der Text soll mitfahren. Richtung 1
   * heisst nach links hinaus, -1 nach rechts. `dauer` ist die Zeit in
   * Millisekunden, die der Band dafuer braucht — der Text muss dieselbe
   * nehmen, sonst zerfaellt der Wechsel in zwei Haelften.
   */
  onSwap: (
    index: number,
    richtung: 1 | -1,
    dauer: number,
    /** Wie weit der Band dabei ueber den Schirm faehrt, in Pixeln. */
    strecke: number,
  ) => void;
  onStatus: (message: string) => void;
  onReady: () => void;
};

type RuntimeBook = {
  data: CatalogBook;
  index: number;
  /** Nummer des Stapels, in dem der Band liegt. */
  pile: number;
  /** Platz im Stapel: Hoehe und Schieflage. */
  place: BookPlace;
  /** Ist das Cover-Bild schon angefordert? Verhindert Doppelladungen. */
  coverRequested: boolean;
  slot: THREE.Group;
  content: THREE.Group;
  inspectionIdle: THREE.Group;
  physical: THREE.Group;
  frontSurface: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshPhysicalMaterial
  >;
  /** Die Rueckseite — bei Doppelbaenden die zweite Vorderseite. */
  backSurface: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  spineSurface: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshPhysicalMaterial>;
  pickProxy: THREE.Mesh;
  livingMaterial?: THREE.ShaderMaterial;
  x: number;
  width: number;
  pose: BookPose;
  hover: number;
  targetHover: number;
  idleAmount: number;
  textures: THREE.Texture[];
};

// Die Stapel liegen auf dem Boden; der aufgestellte Band steht davor.
const browseCamera = new THREE.Vector3(0, 3.05, 8.3);
/**
 * Blickpunkt beim Blaettern. Das x wird beim Anpassen an die Fenstergroesse
 * gesetzt: der aufgestellte Band steht seitlich neben seinem Stapel, und auf
 * einem schmalen Fenster laeuft er sonst aus dem Bild.
 */
const browseTarget = new THREE.Vector3(0, 0.8, 0.5);
/** Schwarz. Kein Raum, keine Wand, kein Boden — nur die Umschlaege. */
const roomColor = "#000000";
/** Der Schnitt der Buchbloecke — billiges Werkdruckpapier, leicht vergilbt. */
const pageColor = new THREE.Color("#cbc3b0");
/** So viele Baende vor und hinter dem aktiven bekommen ihr Cover-Bild. */
const coverPreloadRange = 2;

/** So viele Baende liegen hoechstens in einem Stapel. */
const booksPerPile = 6;

/**
 * Teilt die Baende der Reihe nach in moeglichst gleich hohe Stapel. Sechs
 * Buecher werden 3+3, nicht 5+1 — ein einzelner Band neben einem Turm sieht
 * nach Versehen aus.
 */
function pilePerIndex(count: number) {
  const piles = Math.max(1, Math.ceil(count / booksPerPile));
  const base = Math.floor(count / piles);
  const rest = count % piles;
  const zuordnung: number[] = [];
  let pile = 0;
  let platz = base + (rest > 0 ? 1 : 0);
  for (let index = 0; index < count; index += 1) {
    if (platz === 0) {
      pile += 1;
      platz = base + (pile < rest ? 1 : 0);
    }
    zuordnung.push(pile);
    platz -= 1;
  }
  return zuordnung;
}
/**
 * Abstand der Stapel voneinander. Muss groesser sein als der seitliche
 * Versatz des herausgezogenen Bandes plus eine Buchbreite plus Rand — sonst
 * streift er beim Herausfahren den Nachbarstapel und die Bewegung haengt.
 */
const pileSpacing = 2.3;
const clamp = THREE.MathUtils.clamp;
/**
 * Haengt eine Bewegung so lange an der Kollisionspruefung, wird sie
 * durchgelassen. Ein Band, der kurz einen anderen schneidet, ist besser als
 * ein Regal, das sich nicht mehr ruehrt — und beim Nachrutschen der Stapel
 * gibt es zwangslaeufig Augenblicke, in denen sich zwei Baende ueberlagern.
 */
const motionStallLimit = 0.25;
const focusInDuration = 0.58;
const focusOutDuration = 0.42;
const desktopDetailWidthRatio = 0.41;
const compactDetailWidthRatio = 0.48;
const desktopDetailMaxWidth = 620;
const compactDetailMaxWidth = 570;
// Der Band steht links, das Textfeld rechts. Er soll das Bild nicht
// ausfuellen — mit Luft drumherum wirkt er wie ein Gegenstand, nicht wie
// ein Bildschirmfoto eines Covers.
const desktopFocusX = -0.42;
const desktopFocusZ = 2.55;
const desktopFocusScale = 0.82;
const mobileFocusZ = 2.36;
const mobileFocusScale = 0.79;
/**
 * So steht der Band da, wenn man ihn ansieht: leicht angedreht, damit der
 * Ruecken mitspricht und das Cover nicht wie ein flaches Bild klebt.
 */
/**
 * Der Blick beim Ankommen: steil von oben auf die Stapel und leicht
 * herumgedreht. Von dort sinkt die Kamera gedaempft in die normale Hoehe
 * und richtet sich gerade — einmal, beim Aufbau.
 */
const introElevation = 0.82;
/**
 * Die Drehung beim Ankommen. Sie kippt die Reihe der Stapel gegeneinander:
 * je mehr gedreht, desto hoeher steht der linke Stapel im Bild. Klein
 * halten, sonst wirkt die Ansicht schief.
 */
const introAzimuth = 0.15;
/**
 * So lange bleibt der Blick oben stehen, bevor er zu sinken beginnt. Ohne
 * dieses Halten ist die steile Ansicht nach einer halben Sekunde vorbei und
 * niemand sieht sie.
 */
const introHalten = 2.0;
/** Wie traege das Sinken danach ist. Klein heisst langsam. */
const introTempo = 0.45;

/**
 * Beim Wechsel in der Betrachtung fahren die Baende seitlich durchs Bild,
 * als staenden alle auf einer endlosen Linie nebeneinander. So weit fahren
 * sie dabei, und so lange dauert es.
 */
/** Grenzen des Zooms im Regal: naeher als 0,55 und weiter als 1,7 nicht. */
const zoomNah = 0.55;
const zoomFern = 1.7;

const wipeWeg = 4.6;
const wipeDauer = 0.52;

/** Belichtung der Szene, wenn der Blick normal nah steht. */
const grundBelichtung = 0.94;

const inspectDefaultYaw = 0.44;
const inspectDefaultPitch = -0.07;
/**
 * Eine Handbreit Schraeglage: der Buchruecken wandert unten nach rechts,
 * der Band steht nicht wie an der Wand ausgerichtet.
 */
const inspectDefaultRoll = 0.075;

const inspectionIdleLift = 0.014;
const inspectionIdlePitch = THREE.MathUtils.degToRad(0.28);
const inspectionIdleYaw = THREE.MathUtils.degToRad(0.48);
const inspectionIdleRoll = THREE.MathUtils.degToRad(0.22);


/**
 * Baut aus der zweiten Vorderseite einen vollwertigen Buchdatensatz, damit
 * der Cover-Zeichner sie genauso setzen kann wie die erste.
 */
function backFaceAsBook(book: CatalogBook): CatalogBook | null {
  const back = book.back;
  if (!back) return null;
  return {
    ...book,
    title: back.title,
    shortTitle: back.shortTitle,
    author: back.author,
    description: back.description,
    quote: back.quote,
    quoteBy: back.quoteBy,
    cover: back.cover,
    accent: back.accent,
    ink: back.ink,
    motif: back.motif,
    coverImage: back.coverImage,
  };
}

function damp(current: number, target: number, lambda: number, delta: number) {
  return THREE.MathUtils.damp(current, target, lambda, delta);
}

function easeOutCubic(value: number) {
  const t = 1 - clamp(value, 0, 1);
  return 1 - t * t * t;
}

function toTexture(
  canvas: HTMLCanvasElement,
  renderer: THREE.WebGLRenderer,
  anisotropy = 8,
) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(
    anisotropy,
    renderer.capabilities.getMaxAnisotropy(),
  );
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

function createLivingMaterial(color: string) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uStrength: { value: 0 },
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uStrength;
      uniform vec3 uColor;

      void main() {
        float diagonal = fract(vUv.x * 0.72 + vUv.y * 0.31 + uTime * 0.045);
        float sheen = smoothstep(0.44, 0.5, diagonal) * (1.0 - smoothstep(0.5, 0.57, diagonal));
        float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        float alpha = sheen * edge * uStrength * 0.32;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });
}

export class ShelfEngine {
  private canvas: HTMLCanvasElement;
  private booksData: CatalogBook[];
  private callbacks: ShelfCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private shelfGroup = new THREE.Group();
  private shelfFurniture = new THREE.Group();
  private runtimeBooks: RuntimeBook[] = [];
  /** Je Stapel die Baende von unten nach oben. */
  private pileOrder: number[][] = [];
  private pickTargets: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(10, 10);
  private animationFrame = 0;
  private resizeObserver: ResizeObserver;
  private mode: ShelfMode = "browse";
  private selectedIndex: number | null = null;
  private activeIndex = 0;
  private presentedIndex: number | null = null;
  /**
   * Beim Ankommen liegt alles im Stapel. Erst eine Eingabe holt den ersten
   * Band heraus — ohne diesen Zustand wuerde die Bewegung sofort von selbst
   * losgehen.
   */
  private atRest = true;
  /**
   * Der aufgestellte Band soll sich hinlegen, ohne dass ein anderer
   * herauskommt. Wird gesetzt, sobald jemand die Ansicht dreht: dann schaut
   * man die Stapel an, nicht einen einzelnen Band.
   */
  private layDownPending = false;
  /** Blickwinkel um die Stapel herum, vom Ziehen gesetzt. */
  private browseAzimuth = introAzimuth;
  private zielAzimuth = 0;
  /** Blickwinkel beim Aufsetzen des Zeigers — Bezugspunkt fuers Hinlegen. */
  /** Aufgelaufene Wischstrecke auf dem Telefon. */
  private wischWeg = 0;
  /** Zoom im Regal: 1 ist der Normalabstand, kleiner heisst naeher dran. */
  private zoom = 1;
  private zielZoom = 1;
  private browseElevation = introElevation;
  private zielElevation = 0;
  /** Laeuft das anfaengliche Sinken noch? */
  private introLaeuft = true;
  /** Wie lange der Blick schon oben steht. */
  private introGehalten = 0;
  /**
   * Band, der nach dem Zurueckgehen aufgeschlagen werden soll. So kommt man
   * aus der Betrachtung heraus direkt zum naechsten, ohne Umweg ueber das
   * Regal.
   */
  /**
   * Laeuft gerade ein Wechsel aus der Betrachtung heraus zum naechsten
   * Band? Dann bleibt die Kamera stehen, wo sie ist: der aufgestellte Platz
   * liegt in Weltkoordinaten immer an derselben Stelle, weil die Stapel
   * unter der Kamera durchrutschen. Ohne das faehrt die Kamera erst zum
   * Regal zurueck und wieder heran — genau der Umweg, den niemand will.
   */
  private swapZu: number | null = null;
  /** Laufender Seitwaertswechsel in der Betrachtung. */
  private wipeVon: number | null = null;
  private wipeNach: number | null = null;
  private wipeFortschritt = 0;
  private wipeRichtung: 1 | -1 = 1;
  /** Schwanken des aufgestellten Bandes, aus der Blaettergeschwindigkeit. */
  private schwanken = 0;
  private pendingFocusIndex: number | null = null;
  private browseMotionPhase: BrowseMotionPhase | "idle" = "idle";
  private browseMotionProgress = 0;
  /** Wie lange die laufende Bewegung schon an der Kollisionspruefung haengt. */
  private motionStallSeconds = 0;
  private motionBookIndex: number | null = null;
  private motionLayout: MotionLayout = createMotionLayout([]);
  private collisionRejects = 0;
  private lastCollisionPair: [string, string] | null = null;
  private scrollIndex = 0;
  private targetScrollIndex = 0;
  private focusProgress = 0;
  /** Welche Vorderseite oben ist. Nur bei Doppelbaenden veraenderbar. */
  private side: BookSide = "vorn";
  /** Freie Drehung des betrachteten Bandes, in Bogenmass. */
  private inspectYaw = inspectDefaultYaw;
  private inspectPitch = inspectDefaultPitch;
  /** Wohin gedreht werden soll — der Knopf setzt das Ziel, das Ziehen beides. */
  private zielYaw = inspectDefaultYaw;
  private zielPitch = inspectDefaultPitch;
  private lastInputTime = 0;
  private pointerDown = false;
  private pointerId: number | null = null;
  /** Alle Finger, die gerade auf dem Glas liegen. */
  private zeiger = new Map<number, { x: number; y: number }>();
  /** Fingerabstand und Zoom beim Ansetzen der zweiten Hand. */
  private kneifAbstand = 0;
  private kneifZoom = 1;
  /** Beginn der laufenden Wischbewegung — fuer den Schwung beim Loslassen. */
  private zeigerStartZeit = 0;
  private pointerStartY = 0;
  /** Auf dem Handy startet der Blick weiter hinten; nur einmal setzen. */
  private handyAbstandGesetzt = false;
  /**
   * Der betrachtete Band geht leicht mit der Hand mit: das Telefon meldet
   * seine Lage, der Band neigt sich ein paar Grad hinterher. Die erste
   * Meldung ist der Nullpunkt — sonst springt der Band, je nachdem wie man
   * das Geraet gerade haelt.
   */
  private neigungBasis: { beta: number; gamma: number } | null = null;
  private neigungYaw = 0;
  private neigungPitch = 0;
  private neigungGefragt = false;
  /**
   * Wenden im Regal: der Band kippt um seine Querachse, wie man ein Buch
   * in der Hand umdreht. Die zweite Geschichte steht kopfueber auf der
   * Rueckseite und kommt dadurch richtig herum zum Stehen.
   */
  private stehendGedreht = false;
  private stehendBasisPitch: number | null = null;
  private pointerStartX = 0;
  private pointerLastX = 0;
  private pointerLastY = 0;
  private pointerTravel = 0;
  private reducedMotion = false;
  private focusCameraPosition = new THREE.Vector3();
  private focusCameraTarget = new THREE.Vector3();
  private responsiveBrowseCamera = browseCamera.clone();
  /** Wiederverwendeter Rechenplatz, damit nicht jedes Bild einen Vektor anlegt. */
  private blickZiel = new THREE.Vector3();
  private lastTimestamp = 0;
  private lastDiagnosticsAt = 0;
  private isDisposed = false;

  constructor(
    canvas: HTMLCanvasElement,
    books: CatalogBook[],
    callbacks: ShelfCallbacks,
  ) {
    this.canvas = canvas;
    this.booksData = books;
    this.callbacks = callbacks;
    this.reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Kein filmischer Rolloff: die Lichter sollen ausbrennen und die
    // Schatten zulaufen, wie auf einem Blitzfoto.
    this.renderer.toneMapping = THREE.LinearToneMapping;
    this.renderer.toneMappingExposure = grundBelichtung;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.camera = new THREE.PerspectiveCamera(27, 1, 0.08, 80);
    this.camera.position.copy(browseCamera);
    this.camera.lookAt(browseTarget);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enabled = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = true;
    this.controls.enableZoom = true;
    this.controls.minDistance = 2.4;
    this.controls.maxDistance = 9;
    // Die Kamera dreht sich nicht mehr um das Buch — das Buch dreht sich in
    // der Hand. Nur so laesst es sich umdrehen und auf den Kopf stellen;
    // eine kreisende Kamera behaelt immer ihr Oben.
    this.controls.enableRotate = false;

    this.resizeObserver = new ResizeObserver(this.handleResize);
    this.setupScene();
    this.createBooks();
    this.bindEvents();
    this.resizeObserver.observe(canvas);
    this.handleResize();
    this.callbacks.onReady();
    this.callbacks.onStatus(`${this.booksData.length} Bände im Regal`);
    this.animate();

    (
      window as unknown as {
        __PRESS_LIBRARY__?: {
          diagnostics: () => ReturnType<ShelfEngine["getDiagnostics"]>;
          focus: (index: number) => void;
          browse: (index: number) => void;
          returnToShelf: () => void;
          aufschlagen: (index: number) => void;
          intro: () => void;
        };
      }
    ).__PRESS_LIBRARY__ = {
      diagnostics: () => this.getDiagnostics(),
      focus: (index) => this.focusBook(index),
      browse: (index) => this.browseTo(index),
      returnToShelf: () => this.returnToShelf(),
      // Schlaegt einen Band ohne Bewegung sofort auf. Nur zum Pruefen und
      // Einstellen — so laesst sich die Betrachtung ansehen, ohne auf die
      // Bewegung zu warten.
      aufschlagen: (index: number) => {
        const ziel = clamp(Math.round(index), 0, this.runtimeBooks.length - 1);
        if (this.presentedIndex !== null && this.presentedIndex !== ziel) {
          this.returnToPile(this.presentedIndex);
        }
        this.takeFromPile(ziel);
        this.atRest = false;
        this.layDownPending = false;
        this.wipeVon = null;
        this.wipeNach = null;
        this.browseMotionPhase = "idle";
        this.presentedIndex = ziel;
        this.selectedIndex = ziel;
        this.activeIndex = ziel;
        this.scrollIndex = ziel;
        this.targetScrollIndex = ziel;
        this.focusProgress = 1;
        this.mode = "inspect";
        this.controls.enabled = true;
        this.side = "vorn";
        this.callbacks.onActiveIndex(ziel);
        this.callbacks.onSide(this.side);
        this.callbacks.onMode(this.mode, ziel);
      },
      // Spielt den Ankunftsblick noch einmal ab — zum Einstellen von
      // Haltezeit, Hoehe und Tempo, ohne die Seite neu zu laden.
      intro: () => {
        this.browseElevation = introElevation;
        this.browseAzimuth = introAzimuth;
        this.zielElevation = 0;
        this.zielAzimuth = 0;
        this.introGehalten = 0;
        this.introLaeuft = true;
      },
    };
  }

  private setupScene() {
    // Der Raum ist Kopierpapier-Grau, kein warmes Papier. Die Umschlaege
    // sind das einzige Farbige hier.
    this.scene.background = new THREE.Color(roomColor);
    this.scene.fog = new THREE.Fog(roomColor, 8, 19);

    // Wenig Grundlicht: die Schatten sollen schwarz werden, nicht grau.
    const hemisphere = new THREE.HemisphereLight("#cfd4d8", "#000000", 0.42);
    this.scene.add(hemisphere);

    // Aufheller von vorn. Ohne Boden und Wand faellt kein Licht zurueck auf
    // die Stapel, und die Umschlaege saufen im Schwarz ab. Trifft nur die
    // Buecher — der Hintergrund bleibt schwarz, weil er kein Objekt ist.
    const fill = new THREE.DirectionalLight("#ffffff", 1.15);
    fill.position.set(1.6, 2.2, 7);
    this.scene.add(fill);

    // Ein hartes, kaltes Licht von vorn oben — Blitz, nicht Fensterlicht.
    const key = new THREE.DirectionalLight("#ffffff", 4.2);
    key.position.set(-3.1, 6.2, 6.4);
    key.castShadow = true;
    key.shadow.mapSize.set(
      window.innerWidth < 700 ? 1024 : 2048,
      window.innerWidth < 700 ? 1024 : 2048,
    );
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -2;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 22;
    key.shadow.bias = -0.0005;
    this.scene.add(key);

    // Eine schwache kalte Kante von hinten rechts, damit die Stapel nicht
    // im Schatten verschwinden.
    const rim = new THREE.DirectionalLight("#8f98a0", 0.55);
    rim.position.set(5, 3, -4);
    this.scene.add(rim);



    this.scene.add(this.shelfGroup);
    this.shelfGroup.add(this.shelfFurniture);
  }

  private createBooks() {
    const pileOfIndex = pilePerIndex(this.booksData.length);
    this.booksData.forEach((book, index) => {
      const pile = pileOfIndex[index];
      const runtime = this.createBook(book, index, pile * pileSpacing, pile);
      this.runtimeBooks.push(runtime);
      this.shelfGroup.add(runtime.slot);
      // Vorn im Katalog heisst oben im Stapel: die Reihenfolge wird beim
      // Stapeln umgedreht, damit 001 obenauf liegt und nicht darunter
      // verschwindet.
      if (!this.pileOrder[pile]) this.pileOrder[pile] = [];
      this.pileOrder[pile].unshift(index);
    });

    this.motionLayout = createMotionLayout(
      this.runtimeBooks.map((book) => ({
        width: book.width,
        height: book.data.height,
        thickness: book.data.thickness,
      })),
    );

    this.updateStackTargets();
    this.loadCoversNear(0);
    // Alle Baende liegen. Aufgestellt wird erst auf Verlangen.
    this.runtimeBooks.forEach((book) => {
      this.commitBookPose(
        book,
        stackedBookPose(book.place, this.motionLayout),
        false,
      );
    });

  }

  /**
   * Schreibt fuer jeden Band fort, wie hoch er in seinem Stapel liegt. Fehlt
   * ein Band (weil es vorn aufgestellt ist), rutschen die darueber nach.
   */
  private updateStackTargets() {
    // Nach dem Umschichten liegt oben womoeglich ein anderer Band.
    queueMicrotask(() => this.loadCoversNear(this.activeIndex));
    this.pileOrder.forEach((order) => {
      let cursor = this.motionLayout.floorTop;
      order.forEach((index) => {
        const book = this.runtimeBooks[index];
        if (!book) return;
        book.place.stackY = cursor + book.data.thickness * 0.5;
        cursor += book.data.thickness;
      });
    });
  }

  /** Der Band verlaesst seinen Stapel; die darueber rutschen nach. */
  private takeFromPile(index: number) {
    const pile = this.pileOrder[this.runtimeBooks[index]?.pile ?? 0];
    if (!pile) return;
    const at = pile.indexOf(index);
    if (at >= 0) pile.splice(at, 1);
    this.updateStackTargets();
  }

  /**
   * Der Band kommt zurueck — und zwar oben auf den Stapel, so wie man ein
   * Buch auch wirklich zuruecklegt. Die Reihenfolge im Stapel aendert sich
   * dadurch mit der Zeit.
   */
  private returnToPile(index: number) {
    const pile = this.pileOrder[this.runtimeBooks[index]?.pile ?? 0];
    if (!pile || pile.includes(index)) return;
    pile.push(index);
    this.updateStackTargets();
  }

  private createBook(
    book: CatalogBook,
    index: number,
    x: number,
    pile: number,
  ): RuntimeBook {
    // Die Breite folgt der Hoehe und dem Format des Buches. Kein
    // Zufallsversatz mehr: wer ein Umschlagbild hinterlegt, bekommt genau
    // dessen Verhaeltnis, sonst wird sein Cover verzerrt.
    const width = book.height * book.widthRatio;
    const depth = book.thickness;
    const slot = new THREE.Group();
    slot.name = `bookSlot:${book.id}`;
    slot.position.set(x, 0, 0);

    const content = new THREE.Group();
    content.name = `bookPresentation:${book.id}`;
    // Erst kippen, dann um die Hochachse drehen — sonst wuerde die
    // Schieflage den liegenden Band auf die Kante stellen.
    content.rotation.order = "YXZ";
    slot.add(content);
    const place: BookPlace = {
      stackY: 0,
      ...stackJitter(index),
      height: book.height,
      thickness: book.thickness,
    };
    const pose: BookPose = {
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: flatPitch,
      scale: 1,
    };

    const inspectionIdle = new THREE.Group();
    inspectionIdle.name = `bookInspectionIdle:${book.id}`;
    content.add(inspectionIdle);

    const physical = new THREE.Group();
    physical.name = `proceduralBook:${book.id}`;
    inspectionIdle.add(physical);

    const boardMaterial = new THREE.MeshPhysicalMaterial({
      color: book.cover,
      roughness: 0.78,
      metalness: 0,
      sheen: 0.36,
      sheenColor: new THREE.Color(book.ink),
      sheenRoughness: 0.82,
      clearcoat: book.motif === "gather" ? 0.12 : 0.03,
      clearcoatRoughness: 0.7,
    });
    const paperMaterial = new THREE.MeshStandardMaterial({
      color: pageColor,
      roughness: 0.88,
      metalness: 0,
    });

    // Der Buchblock einer Broschur sitzt fast randlos im Umschlag.
    const pageBlock = new THREE.Mesh(
      new RoundedBoxGeometry(
        width - 0.022,
        book.height - 0.026,
        Math.max(0.03, depth - 0.014),
        3,
        0.006,
      ),
      paperMaterial,
    );
    pageBlock.name = "pageBlock";
    pageBlock.castShadow = true;
    pageBlock.receiveShadow = true;
    physical.add(pageBlock);

    // Kein Deckel, sondern ein umgeschlagener Karton: duenn und randgleich.
    const boardGeometry = new RoundedBoxGeometry(
      width,
      book.height,
      0.008,
      3,
      0.004,
    );
    const frontBoard = new THREE.Mesh(boardGeometry, boardMaterial);
    frontBoard.name = "frontBoard";
    frontBoard.position.z = depth * 0.5;
    frontBoard.castShadow = true;
    frontBoard.receiveShadow = true;
    physical.add(frontBoard);

    const backBoard = new THREE.Mesh(boardGeometry, boardMaterial);
    backBoard.name = "backBoard";
    backBoard.position.z = -depth * 0.5;
    backBoard.castShadow = true;
    backBoard.receiveShadow = true;
    physical.add(backBoard);

    const spine = new THREE.Mesh(
      new RoundedBoxGeometry(0.016, book.height, depth + 0.004, 3, 0.005),
      boardMaterial,
    );
    spine.name = "spine";
    spine.position.x = -width * 0.5 + 0.007;
    spine.castShadow = true;
    physical.add(spine);


    // Wo ein eigener Umschlag nachgeladen wird, zeichnen wir keinen Ersatz:
    // sonst steht dort erst ein fremdes Cover mit fremdem Titel und wird
    // beim Eintreffen des Bildes ausgetauscht — das sieht nach Fehler aus.
    // Bis das Bild da ist, bleibt die Flaeche in der Einbandfarbe.
    const frontTexture = book.coverImage
      ? null
      : toTexture(createFrontCover(book), this.renderer);
    const spineTexture = book.spineImage
      ? null
      : toTexture(createSpineCover(book), this.renderer, 4);

    // Doppelcover: hinten steht keine Klappentext-Rueckseite, sondern eine
    // zweite Vorderseite — und zwar kopfueber. Genau so ist ein
    // tête-bêche-Band gedruckt: umdrehen genuegt nicht, man muss ihn auch
    // auf den Kopf stellen.
    const zweiteSeite = backFaceAsBook(book);
    const backTexture = zweiteSeite?.coverImage
      ? null
      : toTexture(
          zweiteSeite ? createFrontCover(zweiteSeite) : createBackCover(book),
          this.renderer,
        );
    if (zweiteSeite && backTexture) {
      backTexture.center.set(0.5, 0.5);
      backTexture.rotation = Math.PI;
    }
    const textures: THREE.Texture[] = [
      frontTexture,
      spineTexture,
      backTexture,
    ].filter((texture) => texture !== null);

    const frontSurface = new THREE.Mesh<
      THREE.PlaneGeometry,
      THREE.MeshPhysicalMaterial
    >(
      new THREE.PlaneGeometry(width - 0.012, book.height - 0.012),
      new THREE.MeshPhysicalMaterial({
        map: frontTexture,
        color: frontTexture ? 0xffffff : new THREE.Color(book.cover),
        roughness: 0.66,
        metalness: 0.02,
        clearcoat: book.motif === "gather" ? 0.18 : 0.05,
        clearcoatRoughness: 0.48,
      }),
    );
    frontSurface.name = "frontArtwork";
    frontSurface.position.z = depth * 0.5 + 0.006;
    physical.add(frontSurface);


    const backSurface = new THREE.Mesh<
      THREE.PlaneGeometry,
      THREE.MeshStandardMaterial
    >(
      new THREE.PlaneGeometry(width - 0.012, book.height - 0.012),
      new THREE.MeshStandardMaterial({
        map: backTexture,
        color: backTexture ? 0xffffff : new THREE.Color(book.cover),
        roughness: 0.72,
      }),
    );
    backSurface.name = "backArtwork";
    if (zweiteSeite) {
      // Das Bild der zweiten Seite haengt an derselben Flaeche; gedreht wird
      // ueber die Textur, nicht ueber das Netz.
      backSurface.userData.zweiteSeite = true;
    }
    backSurface.position.z = -depth * 0.5 - 0.006;
    backSurface.rotation.y = Math.PI;
    physical.add(backSurface);

    const spineSurface = new THREE.Mesh<
      THREE.PlaneGeometry,
      THREE.MeshPhysicalMaterial
    >(
      new THREE.PlaneGeometry(Math.max(0.02, depth - 0.006), book.height - 0.014),
      new THREE.MeshPhysicalMaterial({
        map: spineTexture,
        color: spineTexture ? 0xffffff : new THREE.Color(book.cover),
        roughness: 0.68,
        metalness: 0.015,
      }),
    );
    spineSurface.name = "spineArtwork";
    spineSurface.rotation.y = -Math.PI / 2;
    spineSurface.position.x = -width * 0.5 - 0.005;
    physical.add(spineSurface);

    let livingMaterial: THREE.ShaderMaterial | undefined;
    if (book.living) {
      livingMaterial = createLivingMaterial(book.accent);
      const shimmer = new THREE.Mesh(
        new THREE.PlaneGeometry(width - 0.014, book.height - 0.014),
        livingMaterial,
      );
      shimmer.name = "livingCoverShimmer";
      shimmer.position.z = depth * 0.5 + 0.012;
      inspectionIdle.add(shimmer);
    }

    const pickProxy = new THREE.Mesh(
      new THREE.BoxGeometry(width, book.height, depth + 0.04),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    pickProxy.name = `pick:${book.id}`;
    pickProxy.userData.bookIndex = index;
    inspectionIdle.add(pickProxy);
    this.pickTargets.push(pickProxy);

    return {
      data: book,
      index,
      pile,
      place,
      coverRequested: false,
      slot,
      content,
      inspectionIdle,
      physical,
      frontSurface,
      backSurface,
      spineSurface,
      pickProxy,
      livingMaterial,
      x,
      width,
      pose,
      hover: 0,
      targetHover: 0,
      idleAmount: 0,
      textures,
    };
  }

  private bindEvents() {
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointercancel", this.handlePointerCancel);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
    // Am Fenster, nicht am Canvas: wer ueber einen Knopf herausgezogen hat,
    // haelt den Tastenfokus dort — am Canvas kaeme nichts mehr an.
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("blur", this.handleWindowBlur);
  }

  private handleWheel = (event: WheelEvent) => {
    if (this.mode !== "browse") return;

    // Zwei Finger auseinander auf dem Trackpad (und Strg mit dem Mausrad
    // unter Windows) kommt als Rad-Ereignis mit gedrueckter Strg-Taste an.
    // Das ist Zoomen, kein Blaettern.
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      this.zielZoom = clamp(
        this.zielZoom * (1 + event.deltaY * 0.0027),
        zoomNah,
        zoomFern,
      );
      return;
    }
    event.preventDefault();
    this.pendingFocusIndex = null;
    const dominant =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    this.targetScrollIndex = clamp(
      this.targetScrollIndex + dominant * 0.0024,
      0,
      this.runtimeBooks.length - 1,
    );
    this.lastInputTime = performance.now();
  };

  private handlePointerDown = (event: PointerEvent) => {
    this.zeiger.set(event.pointerId, { x: event.clientX, y: event.clientY });
    // Zwei Finger heisst kneifen, nicht drehen: der Abstand zwischen ihnen
    // steuert den Zoom, das Drehen setzt so lange aus.
    if (this.zeiger.size === 2) {
      const [a, b] = [...this.zeiger.values()];
      this.kneifAbstand = Math.hypot(a.x - b.x, a.y - b.y);
      this.kneifZoom = this.zielZoom;
      this.pointerDown = false;
      this.canvas.classList.remove("is-dragging");
      return;
    }

    if (this.mode === "inspect") {
      this.pointerDown = true;
      this.pointerId = event.pointerId;
      this.pointerLastX = event.clientX;
      this.pointerLastY = event.clientY;
      this.wischWeg = 0;
      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.classList.add("is-dragging");
      return;
    }
    if (this.mode !== "browse") return;
    this.pointerDown = true;
    this.pointerId = event.pointerId;
    this.pointerStartX = event.clientX;
    this.pointerStartY = event.clientY;
    this.zeigerStartZeit = performance.now();
    this.pointerLastX = event.clientX;
    this.pointerLastY = event.clientY;
    this.pointerTravel = 0;
    this.wischWeg = 0;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private handlePointerMove = (event: PointerEvent) => {
    this.updatePointer(event);

    const gemerkt = this.zeiger.get(event.pointerId);
    if (gemerkt) {
      gemerkt.x = event.clientX;
      gemerkt.y = event.clientY;
    }

    // Zwei Finger: der Abstand zwischen ihnen ist der Zoom. Weiter
    // auseinander heisst naeher heran.
    if (this.zeiger.size >= 2) {
      const [a, b] = [...this.zeiger.values()];
      const abstand = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.kneifAbstand > 8 && abstand > 8 && this.mode === "browse") {
        this.zielZoom = clamp(
          this.kneifZoom * (this.kneifAbstand / abstand),
          zoomNah,
          zoomFern,
        );
        this.introLaeuft = false;
        this.introGehalten = introHalten;
        this.lastInputTime = performance.now();
      }
      return;
    }

    // Im Betrachten dreht das Ziehen den Band: waagerecht um die Hochachse,
    // senkrecht um die Querachse. Ohne Anschlag — man soll ihn umdrehen und
    // auf den Kopf stellen koennen.
    if (this.mode === "inspect") {
      if (!this.pointerDown || event.pointerId !== this.pointerId) return;
      const proPixel = Math.PI / Math.max(320, this.canvas.clientWidth * 0.42);
      const dx = event.clientX - this.pointerLastX;
      const dy = event.clientY - this.pointerLastY;

      // Auch mit dem Finger wird hier gedreht — geblaettert wird unten auf
      // der Textflaeche. Ueber dem Band bleibt die Hand zum Drehen und
      // Zoomen frei.
      this.zielYaw += dx * proPixel;
      this.zielPitch += dy * proPixel;
      this.pointerLastX = event.clientX;
      this.pointerLastY = event.clientY;
      return;
    }

    if (this.mode !== "browse") return;

    if (this.pointerDown && event.pointerId === this.pointerId) {
      // Ziehen dreht die Ansicht um die Stapel. Geblaettert wird mit dem
      // Rad, den Pfeilen, der Leiste unten oder den Pfeiltasten.
      const dx = event.clientX - this.pointerLastX;
      const dy = event.clientY - this.pointerLastY;
      this.pointerLastX = event.clientX;
      this.pointerLastY = event.clientY;
      this.pointerTravel += Math.abs(dx) + Math.abs(dy);

      // Auf dem Telefon dreht ein Finger die Ansicht genauso wie die Maus:
      // frueher blaetterte jedes waagerechte Wischen, und man kam nie um
      // die Stapel herum. Geblaettert wird jetzt mit Schwung — ein kurzer,
      // schneller Wisch beim Loslassen (siehe handlePointerUp).
      // Der aufgestellte Band bleibt beim Drehen stehen. Frueher legte er
      // sich ab einer gewissen Drehung wieder hin — damit kam man nie um
      // ihn herum, und seine Rueckseite bekam man nie zu sehen.
      const proPixel = Math.PI / Math.max(420, this.canvas.clientWidth * 0.6);
      // Wer selbst dreht, uebernimmt — Halten und Sinken hoeren auf.
      this.introLaeuft = false;
      this.introGehalten = introHalten;
      this.zielAzimuth -= dx * proPixel;
      this.zielElevation = clamp(
        this.zielElevation + dy * proPixel,
        -0.34,
        0.72,
      );
      this.lastInputTime = performance.now();
      this.canvas.classList.add("is-dragging");
      return;
    }

    this.updateHover();
  };

  private handlePointerUp = (event: PointerEvent) => {
    this.zeiger.delete(event.pointerId);
    if (this.zeiger.size < 2) this.kneifAbstand = 0;
    if (event.pointerId !== this.pointerId) return;

    // Ein kurzer, schneller Wisch quer blaettert weiter — langsames Ziehen
    // dreht bloss die Ansicht. So geht auf dem Handy beides: umherschauen
    // und blaettern.
    if (
      this.mode === "browse" &&
      event.pointerType === "touch" &&
      this.pointerDown
    ) {
      const weg = event.clientX - this.pointerStartX;
      const hoch = Math.abs(event.clientY - this.pointerStartY);
      const zeit = performance.now() - this.zeigerStartZeit;
      if (Math.abs(weg) > 60 && Math.abs(weg) > hoch * 1.4 && zeit < 400) {
        this.browseBy(weg > 0 ? -1 : 1);
      }
    }

    if (event.pointerType === "touch") this.neigungAnfragen();

    const wasClick = this.pointerTravel < 7 && Math.abs(event.clientX - this.pointerStartX) < 7;
    this.pointerDown = false;
    this.pointerId = null;
    this.canvas.classList.remove("is-dragging");
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    if (this.mode === "browse" && wasClick) {
      this.updatePointer(event);
      const hit = this.raycastBook();
      if (hit !== null) {
        // Zwei Schritte: ein liegender Band kommt erst heraus. Erst ein
        // Klick auf den bereits aufgestellten schlaegt ihn auf.
        if (hit === this.presentedIndex) this.focusBook(hit);
        else this.presentBook(hit);
      }
    }
  };

  private handlePointerCancel = (event: PointerEvent) => {
    this.zeiger.delete(event.pointerId);
    if (this.zeiger.size < 2) this.kneifAbstand = 0;
    if (event.pointerId !== this.pointerId) return;
    this.pointerDown = false;
    this.pointerId = null;
    this.canvas.classList.remove("is-dragging");
  };

  private handlePointerLeave = () => {
    if (!this.pointerDown) {
      this.runtimeBooks.forEach((book) => {
        book.targetHover = 0;
      });
      this.canvas.style.cursor = "grab";
    }
  };

  private handleNeigung = (event: DeviceOrientationEvent) => {
    if (event.beta === null || event.gamma === null) return;
    if (this.mode !== "inspect" && this.mode !== "focusing") return;
    if (!this.neigungBasis) {
      this.neigungBasis = { beta: event.beta, gamma: event.gamma };
    }
    // Hoechstens etwa acht Grad — es soll mitgehen, nicht herumfuchteln.
    this.neigungYaw = clamp(event.gamma - this.neigungBasis.gamma, -28, 28) * 0.005;
    this.neigungPitch =
      -clamp(event.beta - this.neigungBasis.beta, -28, 28) * 0.0032;
  };

  /**
   * Fragt beim ersten Fingertipp nach dem Lagesensor. iOS gibt ihn nur auf
   * eine Geste hin heraus, darum haengt es hier und nicht am Seitenaufbau.
   */
  private neigungAnfragen() {
    if (this.neigungGefragt) return;
    this.neigungGefragt = true;
    const klasse = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<string>;
        })
      | undefined;
    if (!klasse) return;
    if (typeof klasse.requestPermission === "function") {
      klasse
        .requestPermission()
        .then((antwort) => {
          if (antwort === "granted") {
            window.addEventListener("deviceorientation", this.handleNeigung);
          }
        })
        .catch(() => {});
      return;
    }
    window.addEventListener("deviceorientation", this.handleNeigung);
  }

  private handleWindowBlur = () => {
    this.zeiger.clear();
    this.kneifAbstand = 0;
    this.pointerDown = false;
    this.pointerId = null;
    this.canvas.classList.remove("is-dragging");
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    // Wer gerade in ein Feld schreibt, meint nicht das Regal.
    const ziel = event.target as HTMLElement | null;
    if (
      ziel?.isContentEditable ||
      ziel instanceof HTMLInputElement ||
      ziel instanceof HTMLTextAreaElement ||
      ziel instanceof HTMLSelectElement
    ) {
      return;
    }

    // F wendet den betrachteten Band.
    if (
      (event.key === "f" || event.key === "F") &&
      (this.mode === "inspect" || this.mode === "focusing")
    ) {
      event.preventDefault();
      this.flipBook();
      return;
    }
    // Im Regal wendet F den aufgestellten Band, damit man seine Rueckseite
    // ansehen kann, ohne ihn erst aufzuschlagen.
    if (
      (event.key === "f" || event.key === "F") &&
      this.mode === "browse" &&
      this.presentedIndex !== null
    ) {
      event.preventDefault();
      this.flipStehenden();
      return;
    }
    if (event.key === "Escape") {
      this.returnToShelf();
      return;
    }
    if ((event.key === "r" || event.key === "R") && this.mode === "inspect") {
      this.resetFocusView();
      return;
    }

    // Beim aufgeschlagenen Band blaettern die Pfeiltasten zum naechsten
    // Band weiter, ohne den Umweg ueber das Regal.
    if (this.mode === "inspect" || this.mode === "focusing") {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        this.inspectOther(this.activeIndex + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        this.inspectOther(this.activeIndex - 1);
      }
      return;
    }
    if (this.mode !== "browse") return;

    if (event.key === "ArrowRight") {
      event.preventDefault();
      // Im Regal holen die Pfeile den Band gleich heraus, wie die Nummern.
      this.presentBook(this.activeIndex + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      this.presentBook(this.activeIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      this.browseTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      this.browseTo(this.runtimeBooks.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.focusBook(this.activeIndex);
    }
  };

  private updatePointer(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private raycastBook() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickTargets, false)[0];
    return typeof hit?.object.userData.bookIndex === "number"
      ? (hit.object.userData.bookIndex as number)
      : null;
  }

  private updateHover() {
    const hit = this.raycastBook();
    this.runtimeBooks.forEach((book) => {
      book.targetHover = book.index === hit ? 1 : 0;
    });
    this.canvas.style.cursor = hit === null ? "grab" : "pointer";
  }

  private xAtIndex(index: number) {
    const lower = Math.floor(index);
    const upper = Math.min(this.runtimeBooks.length - 1, Math.ceil(index));
    const fraction = index - lower;
    return THREE.MathUtils.lerp(
      this.runtimeBooks[lower]?.x ?? 0,
      this.runtimeBooks[upper]?.x ?? 0,
      fraction,
    );
  }

  private volumeFor(book: RuntimeBook, pose: BookPose = book.pose): BookVolume {
    return {
      id: book.data.id,
      x: book.x + pose.x,
      y: book.slot.position.y + pose.y,
      z: book.slot.position.z + pose.z,
      yaw: pose.yaw,
      pitch: pose.pitch,
      scale: pose.scale,
      width: book.width,
      height: book.data.height,
      thickness: book.data.thickness,
    };
  }

  private collisionFor(book: RuntimeBook, pose: BookPose) {
    const proposed = this.volumeFor(book, pose);
    return (
      this.runtimeBooks.find(
        (other) =>
          other !== book &&
          bookVolumesOverlap(
            proposed,
            this.volumeFor(other),
            this.motionLayout.collisionMargin,
          ),
      ) ?? null
    );
  }

  private commitBookPose(
    book: RuntimeBook,
    pose: BookPose,
    guardCollision = true,
  ) {
    if (guardCollision) {
      const collidedWith = this.collisionFor(book, pose);
      if (collidedWith) {
        this.collisionRejects += 1;
        this.lastCollisionPair = [book.data.id, collidedWith.data.id];
        return false;
      }
    }

    book.pose = { ...pose };
    book.content.position.set(pose.x, pose.y, pose.z);
    book.content.rotation.y = pose.yaw;
    book.content.rotation.x = pose.pitch;
    book.content.scale.setScalar(pose.scale);
    return true;
  }

  private beginFocus(index: number) {
    if (
      this.mode !== "browse" ||
      this.browseMotionPhase !== "idle" ||
      this.presentedIndex !== index
    ) {
      return;
    }
    this.pendingFocusIndex = null;
    this.swapZu = null;
    this.selectedIndex = index;
    this.focusProgress = 0;
    this.mode = "focusing";
    // Der Lagesensor bekommt einen frischen Nullpunkt: gezaehlt wird ab
    // der Haltung, in der man den Band aufschlaegt.
    this.neigungBasis = null;
    this.neigungYaw = 0;
    this.neigungPitch = 0;

    // Wer die Rueckseite des stehenden Bandes anschaut und ihn aufschlaegt,
    // will die zweite Geschichte sehen — nicht wieder Seite A.
    const band = this.runtimeBooks[index];
    const zeigtRueckseite =
      band.data.back !== undefined && this.rueckseiteZurKamera(band);
    const seite: BookSide = zeigtRueckseite ? "hinten" : "vorn";
    // Seite B steht in ihrer gewohnten Ansicht — dieselbe, die auch das
    // Wenden mit F ergibt. Die Schraeglage mitzuspiegeln wurde versucht
    // und wieder verworfen: sie wurde eine Sekunde spaeter nachgezogen und
    // der Band kippte sichtbar nach.
    this.zielPitch = inspectDefaultPitch + (zeigtRueckseite ? Math.PI : 0);
    this.zielYaw = inspectDefaultYaw;
    this.inspectPitch = this.zielPitch;
    this.inspectYaw = this.zielYaw;
    if (seite !== this.side) {
      this.side = seite;
      this.callbacks.onSide(this.side);
    }
    this.runtimeBooks.forEach((book) => {
      book.targetHover = 0;
    });
    this.callbacks.onMode(this.mode, index);
    this.callbacks.onStatus(
      `${this.runtimeBooks[index].data.shortTitle} wird herausgezogen`,
    );
  }

  /** Schaut die Kamera auf den Deckel oder auf die Rueckseite des Bandes? */
  private rueckseiteZurKamera(band: RuntimeBook) {
    const deckelNormale = new THREE.Vector3(0, 0, 1).applyQuaternion(
      band.content.getWorldQuaternion(new THREE.Quaternion()),
    );
    const zurKamera = new THREE.Vector3()
      .subVectors(
        this.camera.position,
        band.content.getWorldPosition(new THREE.Vector3()),
      )
      .normalize();
    return deckelNormale.dot(zurKamera) < 0;
  }

  /**
   * Wendet den aufgestellten Band im Regal — die F-Taste, wie beim
   * aufgeschlagenen. Gedreht wird um die Querachse, nicht um die Hochachse:
   * die zweite Geschichte steht kopfueber auf der Rueckseite, und nur so
   * kommt sie richtig herum zum Stehen. Gedreht wird die Figur selbst,
   * nicht die Ansicht — dann stimmt auch, welche Seite beim Aufschlagen
   * vorn liegt.
   */
  flipStehenden() {
    if (this.mode !== "browse" || this.presentedIndex === null) return;
    const band = this.runtimeBooks[this.presentedIndex];
    if (this.stehendBasisPitch === null) {
      this.stehendBasisPitch = band.content.rotation.x;
    }
    this.stehendGedreht = !this.stehendGedreht;
    this.callbacks.onStatus(
      this.stehendGedreht
        ? `${band.data.back?.shortTitle ?? band.data.shortTitle} liegt vorn`
        : `${band.data.shortTitle} liegt vorn`,
    );
  }

  /**
   * Legt den aufgestellten Band zurueck, ohne einen neuen zu holen.
   * Ruft im Augenblick niemand auf: das Drehen der Ansicht laesst den Band
   * stehen, damit man ihn von allen Seiten ansehen kann. Der Weg zurueck
   * in den Stapel bleibt hier stehen, falls ihn wieder etwas braucht.
   */
  private layDown() {
    if (this.mode !== "browse") return;
    if (this.presentedIndex === null || this.layDownPending) return;
    this.layDownPending = true;
    this.pendingFocusIndex = null;
  }

  private updateBrowseMotion(delta: number) {
    // Hinlegen geht auch aus der Ruhe heraus.
    if (this.atRest && !this.layDownPending) return;
    if (this.browseMotionPhase === "idle") {
      if (this.layDownPending) {
        if (this.presentedIndex === null) {
          this.layDownPending = false;
          return;
        }
        this.motionBookIndex = this.presentedIndex;
        this.returnToPile(this.motionBookIndex);
        this.browseMotionPhase = "retreat-current";
        this.browseMotionProgress = 0;
      } else {
        if (this.presentedIndex === this.activeIndex) {
          if (this.pendingFocusIndex === this.activeIndex) {
            this.beginFocus(this.activeIndex);
          }
          return;
        }

        this.motionBookIndex = this.presentedIndex;
        this.browseMotionPhase =
          this.motionBookIndex === null ? "extract-next" : "retreat-current";
        if (this.motionBookIndex === null) {
          this.motionBookIndex = this.activeIndex;
        } else {
          // Der aufgestellte Band gehoert wieder in seinen Stapel — obendrauf.
          this.returnToPile(this.motionBookIndex);
        }
        this.browseMotionProgress = 0;
      }
    }

    const phase = this.browseMotionPhase;
    const motionIndex = this.motionBookIndex;
    if (motionIndex === null) return;
    const duration = this.reducedMotion
      ? Math.max(0.055, browsePhaseDuration[phase] * 0.45)
      : browsePhaseDuration[phase];
    const nextProgress = clamp(
      this.browseMotionProgress + delta / duration,
      0,
      1,
    );
    const movingBook = this.runtimeBooks[motionIndex];
    const proposedPose = browseMotionPose(
      phase,
      nextProgress,
      movingBook.place,
      this.motionLayout,
    );
    if (!this.commitBookPose(movingBook, proposedPose)) {
      this.motionStallSeconds += delta;
      if (this.motionStallSeconds < motionStallLimit) return;
      this.commitBookPose(movingBook, proposedPose, false);
    }
    this.motionStallSeconds = 0;

    this.browseMotionProgress = nextProgress;
    if (nextProgress < 1) return;

    this.browseMotionProgress = 0;
    switch (phase) {
      case "retreat-current":
        this.browseMotionPhase = "turn-current";
        break;
      case "turn-current":
        this.browseMotionPhase = "shelve-current";
        break;
      case "shelve-current":
        this.presentedIndex = null;
        if (this.layDownPending) {
          // Nur hinlegen, keinen neuen holen.
          this.layDownPending = false;
          this.motionBookIndex = null;
          this.browseMotionPhase = "idle";
          this.atRest = true;
          this.callbacks.onStatus(`${this.booksData.length} Bände im Regal`);
          break;
        }
        this.motionBookIndex = this.activeIndex;
        this.browseMotionPhase = "extract-next";
        break;
      case "extract-next":
        // Erst wenn der Band den Stapel wirklich verlassen hat, rutschen die
        // Baender darueber nach. Umgekehrt wuerde das Buch von oben in den
        // noch herausfahrenden Band fallen.
        this.takeFromPile(motionIndex);
        this.browseMotionPhase = "turn-next";
        break;
      case "turn-next":
        this.browseMotionPhase = "settle-next";
        break;
      case "settle-next":
        this.presentedIndex = motionIndex;
        this.motionBookIndex = null;
        this.browseMotionPhase = "idle";
        if (this.pendingFocusIndex === this.presentedIndex) {
          this.beginFocus(this.presentedIndex);
        }
        break;
    }
  }

  private animate = () => {
    if (this.isDisposed) return;
    this.animationFrame = requestAnimationFrame(this.animate);
    const timestamp = performance.now();
    const elapsed = timestamp / 1000;
    const delta = clamp((timestamp - this.lastTimestamp) / 1000 || 1 / 60, 0, 0.05);
    this.lastTimestamp = timestamp;

    this.updateState(delta, timestamp);
    this.updateBooks(delta, elapsed);

    // Von weit weg wirken die Stapel auf dem Handy zu dunkel — die
    // Umschlaege sind dort nur noch daumengross und verlieren gegen das
    // Schwarz. Statt an den Lampen zu drehen wird die Belichtung ein Stueck
    // angehoben, und nur solange der Blick weit weg steht. Nah heran und
    // im aufgeschlagenen Band bleibt alles, wie es war.
    const weit = this.mode === "browse" ? clamp(this.zoom - 1, 0, 0.45) : 0;
    this.renderer.toneMappingExposure = grundBelichtung * (1 + weit * 0.34);

    if (this.controls.enabled) this.controls.update();
    this.renderer.render(this.scene, this.camera);
    if (timestamp - this.lastDiagnosticsAt > 500) {
      const diagnostics = this.getDiagnostics();
      this.canvas.dataset.drawCalls = String(diagnostics.drawCalls);
      this.canvas.dataset.triangles = String(diagnostics.triangles);
      this.canvas.dataset.geometries = String(diagnostics.geometries);
      this.canvas.dataset.textures = String(diagnostics.textures);
      this.canvas.dataset.pixelRatio = String(diagnostics.pixelRatio);
      this.canvas.dataset.motionPhase = diagnostics.motionPhase;
      this.canvas.dataset.collisionFree = String(
        diagnostics.currentCollision === null,
      );
      this.canvas.dataset.collisionRejects = String(
        diagnostics.collisionRejects,
      );
      this.lastDiagnosticsAt = timestamp;
    }
  };

  private updateState(delta: number, timestamp: number) {
    if (this.mode === "browse") {
      if (!this.pointerDown && timestamp - this.lastInputTime > 150) {
        this.targetScrollIndex = damp(
          this.targetScrollIndex,
          Math.round(this.targetScrollIndex),
          this.reducedMotion ? 18 : 8.5,
          delta,
        );
      }
      this.scrollIndex = damp(
        this.scrollIndex,
        this.targetScrollIndex,
        this.reducedMotion ? 20 : 10,
        delta,
      );
      this.focusProgress = damp(this.focusProgress, 0, 10, delta);
      if (this.swapZu === null) {
        this.camera.position.lerp(
          this.blickpunkt(delta),
          1 - Math.exp(-(this.reducedMotion ? 18 : 7) * delta),
        );
        this.camera.lookAt(browseTarget);
      }
    } else if (this.mode === "focusing") {
      this.focusProgress = clamp(
        this.focusProgress +
          delta / (this.reducedMotion ? 0.08 : focusInDuration),
        0,
        1,
      );
      this.updateFocusCamera(delta);
      if (this.focusProgress >= 1) {
        this.mode = "inspect";
        this.controls.enabled = true;
        this.controls.target.copy(this.focusCameraTarget);
        this.callbacks.onMode(this.mode, this.selectedIndex);
        if (this.selectedIndex !== null) {
          this.callbacks.onStatus(
            `${this.runtimeBooks[this.selectedIndex].data.shortTitle} liegt vorn`,
          );
        }
      }
    } else if (this.mode === "returning") {
      this.controls.enabled = false;
      this.focusProgress = clamp(
        this.focusProgress -
          delta / (this.reducedMotion ? 0.08 : focusOutDuration),
        0,
        1,
      );
      this.applyFocusViewOffset(easeOutCubic(this.focusProgress));
      this.camera.position.lerp(
        this.blickpunkt(delta),
        1 - Math.exp(-(this.reducedMotion ? 24 : 14) * delta),
      );
      this.camera.lookAt(browseTarget);
      if (this.focusProgress <= 0) {
        if (this.selectedIndex !== null) {
          this.commitBookPose(
            this.runtimeBooks[this.selectedIndex],
            presentedBookPose(
              this.runtimeBooks[this.selectedIndex].place,
              this.motionLayout,
            ),
          );
          this.presentedIndex = this.selectedIndex;
        }
        this.runtimeBooks[this.selectedIndex ?? 0].content.rotation.z = 0;
        this.selectedIndex = null;
        this.mode = "browse";
        this.zielYaw = inspectDefaultYaw;
        this.zielPitch = inspectDefaultPitch;
        this.inspectYaw = inspectDefaultYaw;
        this.inspectPitch = inspectDefaultPitch;
        if (this.side !== "vorn") {
          this.side = "vorn";
          this.callbacks.onSide(this.side);
        }
        this.callbacks.onMode(this.mode, null);
        this.callbacks.onStatus(`${this.booksData.length} Bände im Regal`);
        this.canvas.focus({ preventScroll: true });
      }
    }

    // Der aktive Band ist das Ziel, nicht der Zwischenstand des Gleitens.
    // Sonst wandert die Auswahl beim Sprung von 002 nach 005 durch alle
    // Baende dazwischen — und jeder kaeme kurz heraus.
    const nextActive = clamp(
      Math.round(this.targetScrollIndex),
      0,
      this.runtimeBooks.length - 1,
    );
    if (nextActive !== this.activeIndex) {
      this.activeIndex = nextActive;
      this.loadCoversNear(this.activeIndex);
      this.callbacks.onActiveIndex(this.activeIndex);
    }
    this.shelfGroup.position.x = -this.xAtIndex(this.scrollIndex);
    if (this.mode === "browse") {
      this.updateBrowseMotion(delta);
    }
    this.updateWipe(delta);
  }

  /**
   * Wo die Kamera stehen soll: auf einer Kugel um die Stapel, deren Radius
   * aus der Fenstergroesse kommt und deren Winkel das Ziehen setzt.
   */
  private blickpunkt(delta: number) {
    // Beim Ankommen faellt der Blick langsam aus der Vogelperspektive in die
    // Normalhoehe. Danach folgt er dem Ziehen im gewohnten Tempo.
    if (this.introLaeuft) {
      // Erst halten, dann fallen.
      if (this.introGehalten < introHalten) {
        this.introGehalten += delta;
        return this.blickZiel.set(
          browseTarget.x + this.introAbstand() * Math.cos(this.introHoehe()) * Math.sin(this.introSeite()),
          browseTarget.y + this.introAbstand() * Math.sin(this.introHoehe()),
          browseTarget.z + this.introAbstand() * Math.cos(this.introHoehe()) * Math.cos(this.introSeite()),
        );
      }
      if (
        Math.abs(this.browseElevation - this.zielElevation) < 0.012 &&
        Math.abs(this.browseAzimuth - this.zielAzimuth) < 0.012
      ) {
        this.introLaeuft = false;
      }
    }
    const tempo = this.reducedMotion
      ? 20
      : this.introLaeuft
        ? introTempo
        : 8;
    this.browseAzimuth = damp(this.browseAzimuth, this.zielAzimuth, tempo, delta);
    this.browseElevation = damp(
      this.browseElevation,
      this.zielElevation,
      tempo,
      delta,
    );

    this.zoom = damp(this.zoom, this.zielZoom, this.reducedMotion ? 22 : 11, delta);

    const grund = this.responsiveBrowseCamera;
    const abstand = grund.distanceTo(browseTarget) * this.zoom;
    const flach = Math.hypot(grund.x - browseTarget.x, grund.z - browseTarget.z);
    const grundAzimut = Math.atan2(grund.x - browseTarget.x, grund.z - browseTarget.z);
    const grundHoehe = Math.atan2(grund.y - browseTarget.y, flach);

    const azimut = grundAzimut + this.browseAzimuth;
    // Nicht unter den Boden und nicht senkrecht von oben.
    const hoehe = clamp(grundHoehe + this.browseElevation, 0.02, 1.24);

    return this.blickZiel.set(
      browseTarget.x + abstand * Math.cos(hoehe) * Math.sin(azimut),
      browseTarget.y + abstand * Math.sin(hoehe),
      browseTarget.z + abstand * Math.cos(hoehe) * Math.cos(azimut),
    );
  }

  // Hilfsgroessen fuer den gehaltenen Ankunftsblick.
  private introAbstand() {
    return this.responsiveBrowseCamera.distanceTo(browseTarget) * this.zoom;
  }

  private introHoehe() {
    const grund = this.responsiveBrowseCamera;
    const flach = Math.hypot(grund.x - browseTarget.x, grund.z - browseTarget.z);
    return clamp(
      Math.atan2(grund.y - browseTarget.y, flach) + this.browseElevation,
      0.02,
      1.24,
    );
  }

  private introSeite() {
    const grund = this.responsiveBrowseCamera;
    return (
      Math.atan2(grund.x - browseTarget.x, grund.z - browseTarget.z) +
      this.browseAzimuth
    );
  }

  private updateBooks(delta: number, elapsed: number) {
    const motionFocus =
      this.mode === "returning"
        ? this.focusProgress
        : easeOutCubic(this.focusProgress);
    const isolated = this.selectedIndex !== null && motionFocus > 0.72;
    this.shelfFurniture.visible = !isolated;
    const focusX = window.innerWidth < 760 ? 0 : desktopFocusX;
    const focusZ =
      window.innerWidth < 760 ? mobileFocusZ : desktopFocusZ;
    const focusScale =
      window.innerWidth < 760 ? mobileFocusScale : desktopFocusScale;

    // Die freie Drehung laeuft der Hand weich hinterher.
    const drehTempo = this.reducedMotion ? 24 : 11;
    this.inspectYaw = damp(this.inspectYaw, this.zielYaw, drehTempo, delta);
    this.inspectPitch = damp(this.inspectPitch, this.zielPitch, drehTempo, delta);

    // Waehrend eines Seitwaertswechsels stehen zwei Baende nebeneinander:
    // der bisherige faehrt hinaus, der naechste kommt herein.
    if (this.wipeVon !== null && this.wipeNach !== null) {
      const t = easeOutCubic(this.wipeFortschritt);
      const hinaus = this.runtimeBooks[this.wipeVon];
      const herein = this.runtimeBooks[this.wipeNach];
      // Der Bezugspunkt der Reihe steht noch beim alten Band; der neue
      // muss den Abstand seiner Stapel dazurechnen, um an dieselbe Stelle
      // zu kommen.
      const versatz = hinaus.x - herein.x;
      const weg = wipeWeg * this.wipeRichtung;

      for (const [band, x, sichtbar] of [
        [hinaus, focusX - weg * t, true],
        [herein, focusX + versatz + weg * (1 - t), true],
      ] as const) {
        const pose = focusedBookPose(
          1,
          band.place,
          this.motionLayout,
          x,
          focusZ,
          focusScale,
        );
        this.commitBookPose(
          band,
          {
            ...pose,
            yaw: pose.yaw + this.inspectYaw,
            pitch: pose.pitch + this.inspectPitch,
          },
          false,
        );
        band.content.rotation.z = inspectDefaultRoll;
        band.content.visible = sichtbar;
      }
      this.runtimeBooks.forEach((band) => {
        if (band.index !== this.wipeVon && band.index !== this.wipeNach) {
          band.content.visible = false;
        }
      });
      this.shelfFurniture.visible = false;
      return;
    }

    if (this.selectedIndex !== null) {
      const selected = this.runtimeBooks[this.selectedIndex];
      const pose = focusedBookPose(
        motionFocus,
        selected.place,
        this.motionLayout,
        focusX,
        focusZ,
        focusScale,
      );
      // Ohne Kollisionspruefung: beim Betrachten ist der Rest des Regals
      // ausgeblendet, es gibt nichts zu treffen — eine Pruefung koennte die
      // Drehung nur blockieren.
      this.commitBookPose(
        selected,
        {
          ...pose,
          yaw: pose.yaw + (this.inspectYaw + this.neigungYaw) * motionFocus,
          pitch: pose.pitch + (this.inspectPitch + this.neigungPitch) * motionFocus,
        },
        false,
      );
      // Die Schraeglage liegt auf der Z-Achse. Sie gehoert nicht in die
      // Pose: nur der betrachtete Band hat sie, und die Kollisionspruefung
      // interessiert sie nicht.
      selected.content.rotation.z = inspectDefaultRoll * motionFocus;
      this.seiteAblesen(selected);
    }

    // Der gewendete Band dreht sich weich auf seine neue Lage.
    if (
      this.mode === "browse" &&
      this.presentedIndex !== null &&
      this.stehendBasisPitch !== null
    ) {
      const stehend = this.runtimeBooks[this.presentedIndex];
      stehend.content.rotation.x = damp(
        stehend.content.rotation.x,
        this.stehendBasisPitch + (this.stehendGedreht ? Math.PI : 0),
        this.reducedMotion ? 20 : 8,
        delta,
      );
    }

    this.runtimeBooks.forEach((book) => {
      book.hover = damp(book.hover, book.targetHover, 12, delta);

      const isSelected = book.index === this.selectedIndex;
      book.content.visible = !isolated || isSelected;

      // Liegt der Band ruhig im Stapel, folgt er der Hoehe, die ihm die
      // Stapelverwaltung zuweist — so rutscht der Stapel nach, wenn unten
      // ein Band herausgezogen wird.
      const isMoving =
        this.browseMotionPhase !== "idle" && book.index === this.motionBookIndex;
      const isOutOfPile =
        isSelected || book.index === this.presentedIndex;
      if (!isMoving && !isOutOfPile && book.pose.y !== book.place.stackY) {
        const settled = damp(book.pose.y, book.place.stackY, 6.5, delta);
        book.pose.y = settled;
        book.content.position.y = settled;
      }

      const idleTarget =
        isSelected && this.mode === "inspect" && !this.reducedMotion ? 1 : 0;
      book.idleAmount = damp(book.idleAmount, idleTarget, 5, delta);
      const idleStrength = isSelected ? book.idleAmount : 0;
      const idlePhase = elapsed * 0.78 + book.index * 0.37;
      book.inspectionIdle.position.y =
        Math.sin(idlePhase) * inspectionIdleLift * idleStrength;
      book.inspectionIdle.rotation.set(
        Math.sin(idlePhase * 0.73 + 0.8) *
          inspectionIdlePitch *
          idleStrength,
        Math.sin(idlePhase * 0.61) * inspectionIdleYaw * idleStrength,
        Math.sin(idlePhase * 0.89 + 1.7) *
          inspectionIdleRoll *
          idleStrength,
      );

      if (book.livingMaterial) {
        book.livingMaterial.uniforms.uTime.value = elapsed;
        const livingStrength =
          this.reducedMotion
            ? 0
            : isSelected
              ? 0.24 + motionFocus * 0.55
              : book.index === this.presentedIndex
                ? 0.24 + book.hover * 0.08
                : book.hover * 0.04;
        book.livingMaterial.uniforms.uStrength.value = damp(
          book.livingMaterial.uniforms.uStrength.value,
          livingStrength,
          5,
          delta,
        );
      }
    });
  }

  /**
   * Liest aus der Lage des Bandes ab, welche seiner beiden Seiten zur Kamera
   * zeigt, und meldet einen Wechsel. So stimmt die Beschreibung daneben
   * immer mit dem ueberein, was man sieht — egal ob gedreht oder geknoepft.
   */
  private seiteAblesen(selected: RuntimeBook) {
    if (!selected.data.back) return;
    if (this.mode !== "inspect") return;

    const deckelNormale = new THREE.Vector3(0, 0, 1).applyQuaternion(
      selected.content.getWorldQuaternion(new THREE.Quaternion()),
    );
    const zurKamera = new THREE.Vector3()
      .subVectors(this.camera.position, selected.content.getWorldPosition(new THREE.Vector3()))
      .normalize();
    const naechste: BookSide =
      deckelNormale.dot(zurKamera) >= 0 ? "vorn" : "hinten";
    if (naechste === this.side) return;

    this.side = naechste;
    this.callbacks.onSide(this.side);
    this.callbacks.onStatus(
      this.side === "hinten"
        ? "Die andere Seite liegt vorn"
        : "Die erste Seite liegt vorn",
    );
  }

  private updateFocusCamera(delta: number) {
    if (this.selectedIndex === null) return;
    const selected = this.runtimeBooks[this.selectedIndex];
    const worldPosition = new THREE.Vector3();
    selected.content.getWorldPosition(worldPosition);
    this.frameFocusedBook(worldPosition, easeOutCubic(this.focusProgress));
    this.camera.position.lerp(
      this.focusCameraPosition,
      1 - Math.exp(-(this.reducedMotion ? 28 : 13) * delta),
    );
    this.camera.lookAt(this.focusCameraTarget);
  }

  private applyFocusViewOffset(progress: number) {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const isMobile = width < 760;
    const detailWidth =
      width <= 1020
        ? Math.min(compactDetailMaxWidth, width * compactDetailWidthRatio)
        : Math.min(desktopDetailMaxWidth, width * desktopDetailWidthRatio);
    const clampedProgress = clamp(progress, 0, 1);
    const horizontalOffset = isMobile
      ? 0
      : detailWidth * 0.5 * clampedProgress;
    // Hochkant sitzt der Text im unteren Drittel. Schon im Regal wird das
    // Bild deshalb ein Stueck angehoben, sonst klebt der Stapel ueber der
    // Beschriftung und oben bleibt eine leere Flaeche stehen.
    const grundVersatz = isMobile ? height * 0.05 : 0;
    // Hochkant liegt die Tafel unten im Bild. Der Band rueckt so weit nach
    // oben, dass er ganz in der freien Flaeche darueber steht.
    const fokusVersatz = isMobile ? height * 0.17 : 0;
    const verticalOffset =
      grundVersatz + (fokusVersatz - grundVersatz) * clampedProgress;

    if (!isMobile && clampedProgress <= 0.001) {
      this.camera.clearViewOffset();
      return;
    }

    // Shift the composition through an asymmetric frustum. The camera and
    // OrbitControls can then keep the exact center of the book as their target.
    this.camera.setViewOffset(
      width,
      height,
      horizontalOffset,
      verticalOffset,
      width,
      height,
    );
  }

  /** Vorgabeabstand der Betrachtung, ohne eigenes Zutun. */
  private grundAbstand() {
    return this.canvas.clientWidth < 760 ? 7.4 : 5.4;
  }

  private frameFocusedBook(
    worldPosition: THREE.Vector3,
    compositionProgress = 1,
  ) {
    const isMobile = this.canvas.clientWidth < 760;
    const focusDistance = this.grundAbstand();
    this.applyFocusViewOffset(compositionProgress);

    this.focusCameraTarget.copy(worldPosition);
    this.focusCameraPosition.set(
      worldPosition.x + (isMobile ? 0 : 0.58),
      worldPosition.y + 0.12,
      worldPosition.z + focusDistance,
    );
  }

  private handleResize = () => {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const dprCap = width < 760 ? 1.5 : 1.75;
    // Schmales Fenster: ganz auf den aufgestellten Band zielen, der Stapel
    // steht dann links dahinter. Breites Fenster: dazwischen, dann sind
    // beide im Bild.
    const schmal = width < 760;
    // Auf dem Handy faengt der Blick knapp ein Drittel weiter hinten an —
    // dann sieht man die Nachbarstapel und hat Luft, sich umzusehen.
    if (schmal && !this.handyAbstandGesetzt) {
      this.handyAbstandGesetzt = true;
      this.zoom = 1.3;
      this.zielZoom = 1.3;
    }
    const blickX = schmal ? pulledSideStep * 0.55 : pulledSideStep * 0.5;
    browseTarget.x = blickX;
    // Hochkant sitzt der Text unten im Bild: der Blick geht etwas tiefer,
    // damit der Stapel nach oben rueckt statt in der Bildmitte zu kleben.
    browseTarget.y = schmal ? 0.35 : 0.8;
    // Auf dem Handy steht die Kamera weiter hinten: das Bild ist schmal,
    // und von naeher lief der Stapel links aus dem Bild.
    this.responsiveBrowseCamera.set(
      blickX,
      schmal ? 2.8 : browseCamera.y,
      schmal ? 10.6 : browseCamera.z,
    );
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.fov = width < 600 ? 33 : width < 920 ? 30 : 27;
    this.camera.updateProjectionMatrix();
    if (this.mode === "browse" && this.focusProgress < 0.01) {
      this.applyFocusViewOffset(0);
      // Delta null: die Fenstergroesse soll den Blick neu berechnen, aber
      // die Bewegung nicht vorspulen. Mit delta = 1 sprang das Sinken beim
      // Aufbau sofort um drei Viertel nach unten — der Ankunftsblick kam
      // nie zustande.
      this.camera.position.copy(this.blickpunkt(0));
      this.camera.lookAt(browseTarget);
    } else if (this.mode === "inspect" && this.selectedIndex !== null) {
      const worldPosition = new THREE.Vector3();
      this.runtimeBooks[this.selectedIndex].content.getWorldPosition(
        worldPosition,
      );
      this.frameFocusedBook(worldPosition);
    }
  };



  /**
   * Laedt die Cover-Bilder rund um den aktiven Band — und nur die. Wuerde
   * das Regal alle Umschlaege auf einmal laden, kostete jeder Band ein paar
   * hundert Kilobyte Download und mehrere Megabyte Grafikspeicher; bei einem
   * gewachsenen Programm reicht das, um ein Telefon abzuschiessen.
   */
  private loadCoversNear(index: number) {
    // Was obenauf liegt, sieht man — diese Umschlaege immer laden.
    this.pileOrder.forEach((reihe) => {
      const oben = reihe[reihe.length - 1];
      if (oben !== undefined) this.loadCover(oben);
    });

    for (
      let i = Math.max(0, index - coverPreloadRange);
      i <= Math.min(this.runtimeBooks.length - 1, index + coverPreloadRange);
      i += 1
    ) {
      this.loadCover(i);
    }
  }

  /** Laedt die Umschlagbilder eines Bandes, einmalig. */
  private loadCover(index: number) {
    const runtime = this.runtimeBooks[index];
    if (!runtime || runtime.coverRequested) return;
    const bild = runtime.data.coverImage;
    const hinten = runtime.data.back?.coverImage;
    const ruecken = runtime.data.spineImage;
    if (!bild && !hinten && !ruecken) return;
    runtime.coverRequested = true;
    if (bild) void this.loadCustomFace(runtime, bild, "front");
    if (hinten) void this.loadCustomFace(runtime, hinten, "back");
    if (ruecken) void this.loadCustomFace(runtime, ruecken, "spine");
  }

  /**
   * Haengt ein eigenes Umschlagbild an eine der beiden Seiten. Die zweite
   * Vorderseite ist kopfueber gedruckt, deshalb wird ihre Textur gedreht —
   * das Bild selbst liegt richtig herum in der Datei.
   *
   * Fehlt das Bild oder verbietet die Herkunft den Zugriff, bleibt das
   * gezeichnete Cover stehen.
   */
  private async loadCustomFace(
    runtime: RuntimeBook,
    coverImage: string,
    seite: "front" | "back" | "spine",
  ) {
    try {
      const texture = await new THREE.TextureLoader().loadAsync(coverImage);
      if (this.isDisposed) {
        texture.dispose();
        return;
      }

      texture.name = `customCover:${runtime.data.id}:${seite}`;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(
        8,
        this.renderer.capabilities.getMaxAnisotropy(),
      );
      if (seite === "back" && runtime.data.back) {
        texture.center.set(0.5, 0.5);
        texture.rotation = Math.PI;
      }

      const material =
        seite === "front"
          ? runtime.frontSurface.material
          : seite === "spine"
            ? runtime.spineSurface.material
            : runtime.backSurface.material;
      const proceduralTexture = material.map;
      material.map = texture;
      // Die Einbandfarbe stand nur als Platzhalter auf der Flaeche. Bliebe
      // sie stehen, wuerde sie sich mit dem Bild multiplizieren und das
      // Cover verdunkeln.
      material.color.set(0xffffff);
      material.needsUpdate = true;
      runtime.textures.push(texture);

      if (proceduralTexture) {
        const index = runtime.textures.indexOf(proceduralTexture);
        if (index >= 0) runtime.textures.splice(index, 1);
        proceduralTexture.dispose();
      }
    } catch {
      // Das gezeichnete Cover bleibt stehen.
    }
  }


  browseBy(direction: number) {
    if (this.mode !== "browse") return;
    this.browseTo(Math.round(this.targetScrollIndex) + direction);
  }

  /**
   * Waehlt einen Band aus, ohne ihn herauszuziehen. Liegt gerade alles im
   * Stapel, bleibt das so — herausgezogen wird nur auf Klick (`focusBook`).
   * Steht dagegen schon ein Band vorn, wechselt er.
   */
  browseTo(index: number) {
    if (this.mode !== "browse") return;
    const next = clamp(Math.round(index), 0, this.runtimeBooks.length - 1);
    this.pendingFocusIndex = null;
    this.targetScrollIndex = next;
    this.lastInputTime = performance.now() - 1000;
  }

  /**
   * Holt einen Band aus dem Stapel und stellt ihn auf — ohne die
   * Beschreibung zu oeffnen. Das ist der erste von zwei Schritten: erst
   * herausholen, dann (mit einem Klick auf den Band) aufschlagen.
   */
  /**
   * Waehlt einen Band aus der Betrachtung heraus: der aufgeschlagene geht
   * zurueck, der neue kommt heraus und wird gleich aufgeschlagen.
   */
  inspectOther(index: number) {
    const ziel = clamp(Math.round(index), 0, this.runtimeBooks.length - 1);
    if (this.mode === "browse") {
      this.focusBook(ziel);
      return;
    }
    if (this.mode !== "inspect" && this.mode !== "focusing") return;
    if (this.selectedIndex === null) return;
    if (ziel === this.selectedIndex) return;
    // Ein laufender Wechsel wird erst zu Ende gefahren.
    if (this.wipeVon !== null) return;

    // Die Baende stehen fuer diesen Augenblick nebeneinander auf einer
    // Linie: der aufgeschlagene faehrt zur Seite hinaus, der naechste kommt
    // von der anderen Seite herein. Kein Rueckweg ueber den Stapel.
    this.wipeVon = this.selectedIndex;
    this.wipeNach = ziel;
    this.wipeRichtung = ziel > this.selectedIndex ? 1 : -1;
    this.wipeFortschritt = 0;

    // Die Stapelbuchhaltung mitfuehren, damit das Regal stimmt, wenn man
    // spaeter zurueckgeht.
    this.returnToPile(this.wipeVon);
    this.takeFromPile(this.wipeNach);

    // Wer auf Seite B blaettert, will die zweite Geschichte des naechsten
    // Bandes sehen — nicht wieder bei A anfangen. Hat der naechste Band
    // keine zweite Seite, bleibt nur A uebrig.
    const zielHatZweiteSeite =
      this.runtimeBooks[ziel].data.back !== undefined;
    const zeigeHinten = this.side === "hinten" && zielHatZweiteSeite;
    const naechsteSeite: BookSide = zeigeHinten ? "hinten" : "vorn";

    this.controls.enabled = false;
    // Winkel und Zoom bleiben, wie man sie eingestellt hat: der naechste
    // Band kommt in derselben Haltung herein. Die Kamera wird dabei nicht
    // angefasst, also bleibt auch der Abstand.
    if (naechsteSeite !== this.side) {
      // Die andere Seite kommt nach vorn — der Band kippt um die Querachse.
      this.zielPitch += Math.PI;
    }
    // Alles sofort setzen, nichts darf nachlaufen. Besonders die
    // Schraeglage: wurde sie erst beim Ablesen der Seite umgekehrt, kippte
    // der Band eine Sekunde spaeter noch einmal nach — genau die komische
    // Nachjustierung, die nur bei den B-Seiten auftrat.
    this.inspectYaw = this.zielYaw;
    this.inspectPitch = this.zielPitch;

    if (naechsteSeite !== this.side) {
      this.side = naechsteSeite;
      this.callbacks.onSide(this.side);
    }
    this.callbacks.onSwap(
      ziel,
      this.wipeRichtung,
      (this.reducedMotion ? 0.12 : wipeDauer) * 1000,
      this.wipeWegInPixeln(),
    );
    this.callbacks.onStatus(
      `${this.runtimeBooks[ziel].data.shortTitle} kommt herein`,
    );
  }

  /**
   * Der Weg des Bandes beim Seitwaertswechsel, umgerechnet auf den Schirm.
   * Der Text daneben faehrt dieselbe Strecke — bei ungleichen Strecken
   * laufen die beiden Haelften verschieden schnell, und der Wechsel
   * zerfaellt genau in die zwei Haelften, die er nicht sein soll.
   */
  private wipeWegInPixeln() {
    const abstand = this.canvas.clientWidth < 760 ? 7.4 : 5.4;
    const halbeHoehe =
      Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * abstand;
    const proEinheit = Math.max(1, this.canvas.clientHeight) / (2 * halbeHoehe);
    return wipeWeg * proEinheit;
  }

  /** Fuehrt den Seitwaertswechsel weiter; true, solange er laeuft. */
  private updateWipe(delta: number) {
    if (this.wipeVon === null || this.wipeNach === null) return false;
    this.wipeFortschritt = clamp(
      this.wipeFortschritt + delta / (this.reducedMotion ? 0.12 : wipeDauer),
      0,
      1,
    );
    if (this.wipeFortschritt < 1) return true;

    // Angekommen: der neue Band ist der betrachtete. Der Bezugspunkt der
    // Reihe wandert mit, die Weltposition bleibt dabei gleich.
    const nach = this.wipeNach;
    this.selectedIndex = nach;
    this.activeIndex = nach;
    this.scrollIndex = nach;
    this.targetScrollIndex = nach;
    this.presentedIndex = nach;
    this.wipeVon = null;
    this.wipeNach = null;
    this.wipeFortschritt = 0;
    this.mode = "inspect";
    this.controls.enabled = true;
    this.callbacks.onActiveIndex(nach);
    this.callbacks.onMode(this.mode, nach);
    this.callbacks.onStatus(
      `${this.runtimeBooks[nach].data.shortTitle} liegt vorn`,
    );
    return false;
  }

  presentBook(index: number) {
    if (this.mode !== "browse") return;
    this.stehendGedreht = false;
    this.stehendBasisPitch = null;
    this.atRest = false;
    this.layDownPending = false;
    this.pendingFocusIndex = null;
    this.targetScrollIndex = clamp(
      Math.round(index),
      0,
      this.runtimeBooks.length - 1,
    );
    this.lastInputTime = performance.now() - 1000;
  }

  focusBook(index = this.activeIndex) {
    this.atRest = false;
    if (this.mode !== "browse") return;
    const next = clamp(Math.round(index), 0, this.runtimeBooks.length - 1);
    this.targetScrollIndex = next;
    this.scrollIndex = next;
    this.activeIndex = next;
    this.pendingFocusIndex = next;
    this.callbacks.onActiveIndex(next);
    this.callbacks.onStatus(
      `${this.runtimeBooks[next].data.shortTitle} wird geholt`,
    );
    if (
      this.browseMotionPhase === "idle" &&
      this.presentedIndex === next
    ) {
      this.beginFocus(next);
    }
  }

  returnToShelf() {
    if (this.mode === "browse" && this.pendingFocusIndex !== null) {
      this.pendingFocusIndex = null;
      this.callbacks.onStatus("Abgebrochen");
      return;
    }
    if (this.mode === "browse" || this.mode === "returning") return;
    this.controls.enabled = false;
    this.mode = "returning";
    this.callbacks.onMode(this.mode, this.selectedIndex);
    this.callbacks.onStatus("Zurück ins Regal");
  }

  /**
   * Wendet den betrachteten Band. Eine halbe Drehung um die Querachse dreht
   * ihn um *und* stellt ihn auf den Kopf — genau so kommt die zweite,
   * kopfueber gedruckte Vorderseite richtig herum zu stehen.
   */
  /**
   * Wendet den betrachteten Band: eine halbe Drehung um die Querachse dreht
   * ihn um *und* stellt ihn auf den Kopf. Genau so kommt bei einem
   * Doppelband die zweite, kopfueber gedruckte Vorderseite richtig herum zu
   * stehen. Welche Seite dann vorn liegt, liest die Engine aus der Lage des
   * Bandes ab — es macht keinen Unterschied, ob man den Knopf drueckt oder
   * mit der Hand dreht.
   */
  flipBook() {
    if (this.selectedIndex === null) return;
    if (this.mode !== "inspect" && this.mode !== "focusing") return;
    this.zielPitch += Math.PI;
  }

  resetFocusView() {
    if (this.mode !== "inspect" || this.selectedIndex === null) return;
    this.zielYaw = inspectDefaultYaw;
    this.zielPitch = inspectDefaultPitch;
    const selected = this.runtimeBooks[this.selectedIndex];
    const worldPosition = new THREE.Vector3();
    selected.content.getWorldPosition(worldPosition);
    this.frameFocusedBook(worldPosition);
    this.controls.target.copy(this.focusCameraTarget);
    this.camera.position.copy(this.focusCameraPosition);
    this.controls.update();
  }

  private findAnyCollision(): [string, string] | null {
    for (let leftIndex = 0; leftIndex < this.runtimeBooks.length; leftIndex += 1) {
      const left = this.runtimeBooks[leftIndex];
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < this.runtimeBooks.length;
        rightIndex += 1
      ) {
        const right = this.runtimeBooks[rightIndex];
        if (
          bookVolumesOverlap(
            this.volumeFor(left),
            this.volumeFor(right),
            this.motionLayout.collisionMargin,
          )
        ) {
          return [left.data.id, right.data.id];
        }
      }
    }
    return null;
  }

  getDiagnostics() {
    const info = this.renderer.info;
    return {
      mode: this.mode,
      side: this.side,
      // Blickwinkel in Grad ueber der Waagerechten — damit sich der
      // Ankunftsblick messen laesst statt schaetzen.
      introLaeuft: this.introLaeuft,
      introGehalten: Number(this.introGehalten.toFixed(2)),
      browseElevation: Number(this.browseElevation.toFixed(3)),
      blickhoeheGrad: Math.round(
        (Math.atan2(
          this.camera.position.y - browseTarget.y,
          Math.hypot(
            this.camera.position.x - browseTarget.x,
            this.camera.position.z - browseTarget.z,
          ),
        ) *
          180) /
          Math.PI,
      ),
      activeIndex: this.activeIndex,
      selectedIndex: this.selectedIndex,
      books: this.runtimeBooks.length,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      pixelRatio: this.renderer.getPixelRatio(),
      motionPhase: this.browseMotionPhase,
      collisionRejects: this.collisionRejects,
      lastCollisionPair: this.lastCollisionPair,
      currentCollision: this.findAnyCollision(),
      canvas: {
        width: this.canvas.width,
        height: this.canvas.height,
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight,
      },
    };
  }

  dispose() {
    this.isDisposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.canvas.removeEventListener("wheel", this.handleWheel);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointercancel", this.handlePointerCancel);
    this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    window.removeEventListener("deviceorientation", this.handleNeigung);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("blur", this.handleWindowBlur);

    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry?.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((material) => material?.dispose());
    });
    this.runtimeBooks.forEach((book) => {
      book.textures.forEach((texture) => texture.dispose());
    });
    this.renderer.dispose();
    delete (
      window as unknown as {
        __PRESS_LIBRARY__?: unknown;
      }
    ).__PRESS_LIBRARY__;
  }
}
