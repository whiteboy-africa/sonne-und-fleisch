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
/**
 * Breite zu Hoehe eines Taschenbuchs (A5: 148 zu 210). Die Breite wird aus
 * der Hoehe gerechnet, damit jeder Band dasselbe Format hat, egal wie hoch
 * er gesetzt ist.
 */
const paperbackRatio = 148 / 210;

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
/** Abstand der Stapel voneinander, entlang der Reihe. */
const pileSpacing = 1.95;
const clamp = THREE.MathUtils.clamp;
/**
 * Haengt eine Bewegung so lange an der Kollisionspruefung, wird sie
 * durchgelassen. Ein Band, der kurz einen anderen schneidet, ist besser als
 * ein Regal, das sich nicht mehr ruehrt — und beim Nachrutschen der Stapel
 * gibt es zwangslaeufig Augenblicke, in denen sich zwei Baende ueberlagern.
 */
const motionStallLimit = 0.25;
const focusInDuration = 0.46;
const focusOutDuration = 0.34;
const desktopDetailWidthRatio = 0.41;
const compactDetailWidthRatio = 0.48;
const desktopDetailMaxWidth = 620;
const compactDetailMaxWidth = 570;
const desktopFocusX = -0.58;
const desktopFocusZ = 2.95;
const desktopFocusScale = 1.08;
const mobileFocusZ = 2.62;
const mobileFocusScale = 0.92;
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
  private presentedIndex: number | null = 0;
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
  /** Fortschritt der Wende-Bewegung: 0 ist vorn, 1 ist gewendet. */
  private flipAmount = 0;
  private lastInputTime = 0;
  private pointerDown = false;
  private pointerId: number | null = null;
  private pointerStartX = 0;
  private pointerLastX = 0;
  private pointerTravel = 0;
  private reducedMotion = false;
  private focusCameraPosition = new THREE.Vector3();
  private focusCameraTarget = new THREE.Vector3();
  private responsiveBrowseCamera = browseCamera.clone();
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
    this.renderer.toneMappingExposure = 0.94;
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
    this.controls.minDistance = 2.7;
    this.controls.maxDistance = 7.2;
    this.controls.minPolarAngle = Math.PI * 0.22;
    this.controls.maxPolarAngle = Math.PI * 0.78;

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
        };
      }
    ).__PRESS_LIBRARY__ = {
      diagnostics: () => this.getDiagnostics(),
      focus: (index) => this.focusBook(index),
      browse: (index) => this.browseTo(index),
      returnToShelf: () => this.returnToShelf(),
    };
  }

  private setupScene() {
    // Der Raum ist Kopierpapier-Grau, kein warmes Papier. Die Umschlaege
    // sind das einzige Farbige hier.
    this.scene.background = new THREE.Color(roomColor);
    this.scene.fog = new THREE.Fog(roomColor, 8, 19);

    // Wenig Grundlicht: die Schatten sollen schwarz werden, nicht grau.
    const hemisphere = new THREE.HemisphereLight("#cfd4d8", "#000000", 0.28);
    this.scene.add(hemisphere);

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
      if (!this.pileOrder[pile]) this.pileOrder[pile] = [];
      this.pileOrder[pile].push(index);
    });

    this.motionLayout = createMotionLayout(
      this.runtimeBooks.map((book) => ({
        width: book.width,
        height: book.data.height,
        thickness: book.data.thickness,
      })),
    );

    // Der erste Band steht von Anfang an aufgestellt vor seinem Stapel und
    // liegt deshalb nicht darin.
    this.takeFromPile(0);
    this.loadCoversNear(0);
    this.runtimeBooks.forEach((book, index) => {
      this.commitBookPose(
        book,
        index === 0
          ? presentedBookPose(book.place, this.motionLayout)
          : stackedBookPose(book.place, this.motionLayout),
        false,
      );
    });

  }

  /**
   * Schreibt fuer jeden Band fort, wie hoch er in seinem Stapel liegt. Fehlt
   * ein Band (weil es vorn aufgestellt ist), rutschen die darueber nach.
   */
  private updateStackTargets() {
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
    // Taschenbuch: die Breite folgt der Hoehe. Ein Hauch Abweichung, damit
    // die Stapelkanten nicht wie geschnitten aussehen.
    const width = book.height * paperbackRatio * (1 + ((index % 5) - 2) * 0.004);
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


    const frontTexture = toTexture(createFrontCover(book), this.renderer);
    const spineTexture = toTexture(createSpineCover(book), this.renderer, 4);

    // Doppelcover: hinten steht keine Klappentext-Rueckseite, sondern eine
    // zweite Vorderseite — und zwar kopfueber. Genau so ist ein
    // tête-bêche-Band gedruckt: umdrehen genuegt nicht, man muss ihn auch
    // auf den Kopf stellen.
    const zweiteSeite = backFaceAsBook(book);
    const backTexture = toTexture(
      zweiteSeite ? createFrontCover(zweiteSeite) : createBackCover(book),
      this.renderer,
    );
    if (zweiteSeite) {
      backTexture.center.set(0.5, 0.5);
      backTexture.rotation = Math.PI;
    }
    const textures = [frontTexture, spineTexture, backTexture];

    const frontSurface = new THREE.Mesh<
      THREE.PlaneGeometry,
      THREE.MeshPhysicalMaterial
    >(
      new THREE.PlaneGeometry(width - 0.012, book.height - 0.012),
      new THREE.MeshPhysicalMaterial({
        map: frontTexture,
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

    const spineSurface = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.max(0.02, depth - 0.006), book.height - 0.014),
      new THREE.MeshPhysicalMaterial({
        map: spineTexture,
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
    this.canvas.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("blur", this.handleWindowBlur);
  }

  private handleWheel = (event: WheelEvent) => {
    if (this.mode !== "browse") return;
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
    if (this.mode !== "browse") return;
    this.pointerDown = true;
    this.pointerId = event.pointerId;
    this.pointerStartX = event.clientX;
    this.pointerLastX = event.clientX;
    this.pointerTravel = 0;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private handlePointerMove = (event: PointerEvent) => {
    this.updatePointer(event);
    if (this.mode !== "browse") return;

    if (this.pointerDown && event.pointerId === this.pointerId) {
      this.pendingFocusIndex = null;
      const delta = event.clientX - this.pointerLastX;
      this.pointerLastX = event.clientX;
      this.pointerTravel += Math.abs(delta);
      this.targetScrollIndex = clamp(
        this.targetScrollIndex - delta / Math.max(105, this.canvas.clientWidth * 0.11),
        0,
        this.runtimeBooks.length - 1,
      );
      this.lastInputTime = performance.now();
      this.canvas.classList.add("is-dragging");
      return;
    }

    this.updateHover();
  };

  private handlePointerUp = (event: PointerEvent) => {
    if (event.pointerId !== this.pointerId) return;
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
      if (hit !== null) this.focusBook(hit);
    }
  };

  private handlePointerCancel = (event: PointerEvent) => {
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

  private handleWindowBlur = () => {
    this.pointerDown = false;
    this.pointerId = null;
    this.canvas.classList.remove("is-dragging");
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      this.returnToShelf();
      return;
    }
    if ((event.key === "r" || event.key === "R") && this.mode === "inspect") {
      this.resetFocusView();
      return;
    }
    if (this.mode !== "browse") return;

    if (event.key === "ArrowRight") {
      event.preventDefault();
      this.browseBy(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      this.browseBy(-1);
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
    this.selectedIndex = index;
    this.focusProgress = 0;
    this.mode = "focusing";
    this.runtimeBooks.forEach((book) => {
      book.targetHover = 0;
    });
    this.callbacks.onMode(this.mode, index);
    this.callbacks.onStatus(
      `${this.runtimeBooks[index].data.shortTitle} wird herausgezogen`,
    );
  }

  private updateBrowseMotion(delta: number) {
    if (this.browseMotionPhase === "idle") {
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
      this.camera.position.lerp(
        this.responsiveBrowseCamera,
        1 - Math.exp(-(this.reducedMotion ? 18 : 7) * delta),
      );
      this.camera.lookAt(browseTarget);
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
        this.responsiveBrowseCamera,
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
        this.selectedIndex = null;
        this.mode = "browse";
        if (this.side !== "vorn") {
          this.side = "vorn";
          this.callbacks.onSide(this.side);
        }
        this.callbacks.onMode(this.mode, null);
        this.callbacks.onStatus(`${this.booksData.length} Bände im Regal`);
        this.canvas.focus({ preventScroll: true });
      }
    }

    const nextActive = clamp(
      Math.round(this.scrollIndex),
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

    // Die Wende laeuft weich, damit man sieht, was passiert.
    this.flipAmount = damp(
      this.flipAmount,
      this.side === "hinten" ? 1 : 0,
      this.reducedMotion ? 22 : 7,
      delta,
    );

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
      this.commitBookPose(selected, {
        ...pose,
        pitch: pose.pitch + this.flipAmount * Math.PI,
      });
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
        const settled = damp(book.pose.y, book.place.stackY, 9, delta);
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
    const focusDistance = isMobile ? 5.8 : 5.4;
    const verticalHalfSpan =
      Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * focusDistance;
    const clampedProgress = clamp(progress, 0, 1);
    const horizontalOffset = isMobile
      ? 0
      : detailWidth * 0.5 * clampedProgress;
    const verticalOffset = isMobile
      ? (0.28 / verticalHalfSpan) * height * 0.5 * clampedProgress
      : 0;

    if (clampedProgress <= 0.001) {
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

  private frameFocusedBook(
    worldPosition: THREE.Vector3,
    compositionProgress = 1,
  ) {
    const isMobile = this.canvas.clientWidth < 760;
    const focusDistance = isMobile ? 5.8 : 5.4;
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
    const blickX = schmal ? pulledSideStep : pulledSideStep * 0.5;
    browseTarget.x = blickX;
    this.responsiveBrowseCamera.set(
      blickX,
      schmal ? 2.6 : browseCamera.y,
      schmal ? 9.4 : browseCamera.z,
    );
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.fov = width < 600 ? 33 : width < 920 ? 30 : 27;
    this.camera.updateProjectionMatrix();
    if (this.mode === "browse" && this.focusProgress < 0.01) {
      this.camera.clearViewOffset();
      this.camera.position.copy(this.responsiveBrowseCamera);
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
    for (
      let i = Math.max(0, index - coverPreloadRange);
      i <= Math.min(this.runtimeBooks.length - 1, index + coverPreloadRange);
      i += 1
    ) {
      const runtime = this.runtimeBooks[i];
      if (!runtime || runtime.coverRequested) continue;
      const bild = runtime.data.coverImage;
      if (!bild && !runtime.data.back?.coverImage) continue;
      runtime.coverRequested = true;
      if (bild) void this.loadCustomFace(runtime, bild, "front");
      const hinten = runtime.data.back?.coverImage;
      if (hinten) void this.loadCustomFace(runtime, hinten, "back");
    }
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
    seite: "front" | "back",
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
          : runtime.backSurface.material;
      const proceduralTexture = material.map;
      material.map = texture;
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

  browseTo(index: number) {
    if (this.mode !== "browse") return;
    const next = clamp(Math.round(index), 0, this.runtimeBooks.length - 1);
    this.pendingFocusIndex = null;
    this.targetScrollIndex = next;
    this.lastInputTime = performance.now() - 1000;
  }

  focusBook(index = this.activeIndex) {
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
  flipBook() {
    if (this.selectedIndex === null) return;
    if (this.mode !== "inspect" && this.mode !== "focusing") return;
    if (!this.runtimeBooks[this.selectedIndex].data.back) return;
    this.side = this.side === "vorn" ? "hinten" : "vorn";
    this.callbacks.onSide(this.side);
    this.callbacks.onStatus(
      this.side === "hinten"
        ? "Die andere Seite liegt oben"
        : "Die erste Seite liegt oben",
    );
  }

  resetFocusView() {
    if (this.mode !== "inspect" || this.selectedIndex === null) return;
    if (this.side !== "vorn") {
      this.side = "vorn";
      this.callbacks.onSide(this.side);
    }
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
    this.canvas.removeEventListener("keydown", this.handleKeyDown);
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
