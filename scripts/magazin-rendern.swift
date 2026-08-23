// Rendert Seiten eines PDF als PNG. Der halbe Weg von `magazin-bauen.mjs`:
// hier wird gerastert, dort wird daraus WebP.
//
// Warum Swift und nicht ein Bildwerkzeug: auf diesem Rechner liegt weder
// Poppler noch ImageMagick noch Ghostscript. PDFKit liegt im System, und
// es rastert dieselbe Datei, die auch die Druckerei bekommt.
//
// Zwei Fallen stecken darin, und beide sind hier umgangen:
//
// **Retina.** `NSImage.lockFocus` rastert auf dem Bildschirm, den es
// gerade findet — an einem Retina-Schirm kommen doppelt so viele Bildpunkte
// heraus wie bestellt, an einem anderen nicht. Das Ergebnis haengt damit am
// Arbeitsplatz und nicht an der Datei. Hier wird deshalb in einen
// `CGContext` mit ausgerechneter Pixelgroesse gezeichnet: was bestellt ist,
// kommt heraus, auf jedem Rechner dasselbe.
//
// **`/Rotate`.** Eine PDF-Seite kann eine gedrehte Anzeige verlangen, ohne
// dass ihr Inhalt gedreht waere. `PDFPage.draw(with:to:)` wendet das an —
// aber nur, solange man es nicht selbst auch tut. Damit die Drehung an
// **einer** Stelle steht und nachlesbar ist, wird sie hier von Hand in die
// Matrix gelegt und der Seite vorher abgenommen.
//
// Diese Ausgabe hat ueberall `/Rotate 0`; der Weg steht trotzdem da, weil
// die naechste Druckdatei ihn braucht, sobald jemand einen Bogen kopfueber
// ablegt.
//
// **Die Schnittzugabe faellt weg.** Eine Druckdatei ist groesser als das
// fertige Heft: rings um jede Seite liegen ein paar Millimeter Zugabe, in
// die das Bild hineinlaeuft, damit beim Beschneiden keine Blitzer
// stehenbleiben. Wer sie mitrastert, bekommt sie im Bild — und bei einem
// Element, das ueber den Bund laeuft, sieht man es dann **zweimal**: einmal
// im Anschnitt der linken Seite, einmal im Anschnitt der rechten.
//
// Wie viel Zugabe es ist, steht in der Datei und muss nicht geschaetzt
// werden: die `TrimBox` ist das beschnittene Format, die `CropBox` das
// ungeschnittene. Hier gilt die TrimBox, sobald sie kleiner ist. Diese
// Ausgabe hat 8,5 Punkt (3 mm) auf jeder Seite.
//
//   swift scripts/magazin-rendern.swift <pdf> <zielordner> <seiten> <kante>

import Foundation
import PDFKit
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let argumente = CommandLine.arguments
guard argumente.count >= 5,
      let seitenZahl = Int(argumente[3]),
      let langeKante = Int(argumente[4])
else {
  FileHandle.standardError.write(
    "Aufruf: swift magazin-rendern.swift <pdf> <ziel> <seiten> <kante>\n"
      .data(using: .utf8)!)
  exit(2)
}

let quelle = URL(fileURLWithPath: argumente[1])
let ziel = URL(fileURLWithPath: argumente[2], isDirectory: true)

guard let dokument = PDFDocument(url: quelle) else {
  FileHandle.standardError.write("Kein lesbares PDF: \(quelle.path)\n".data(using: .utf8)!)
  exit(1)
}

try? FileManager.default.createDirectory(at: ziel, withIntermediateDirectories: true)

let farbraum = CGColorSpace(name: CGColorSpace.sRGB)!
let bis = min(seitenZahl, dokument.pageCount)

for stelle in 0..<bis {
  guard let seite = dokument.page(at: stelle) else { continue }

  // Die Drehung von Hand: der Seite abnehmen, damit `draw` sie nicht ein
  // zweites Mal anwendet, und weiter unten in die Matrix legen.
  let drehung = ((seite.rotation % 360) + 360) % 360
  seite.rotation = 0

  // Das beschnittene Format, wenn es eins gibt — sonst die ganze Seite.
  let ganz = seite.bounds(for: .cropBox)
  let beschnitten = seite.bounds(for: .trimBox)
  let box: PDFDisplayBox =
    (beschnitten.width < ganz.width || beschnitten.height < ganz.height)
      ? .trimBox : .cropBox
  let kasten = seite.bounds(for: box)
  // Nach der Drehung stehen Breite und Hoehe ueber Kreuz.
  let quer = drehung == 90 || drehung == 270
  let breitePt = quer ? kasten.height : kasten.width
  let hoehePt = quer ? kasten.width : kasten.height

  let massstab = Double(langeKante) / Double(max(breitePt, hoehePt))
  let breite = Int((Double(breitePt) * massstab).rounded())
  let hoehe = Int((Double(hoehePt) * massstab).rounded())

  guard let stift = CGContext(
    data: nil,
    width: breite,
    height: hoehe,
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: farbraum,
    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
  ) else {
    FileHandle.standardError.write("Kein Zeichengrund fuer Seite \(stelle + 1)\n".data(using: .utf8)!)
    exit(1)
  }

  // Papierweiss darunter: eine Druckseite hat keinen durchsichtigen Grund,
  // und ohne Fuellung stuenden die unbedruckten Stellen schwarz da.
  stift.setFillColor(CGColor(colorSpace: farbraum, components: [1, 1, 1, 1])!)
  stift.fill(CGRect(x: 0, y: 0, width: breite, height: hoehe))

  stift.saveGState()
  stift.scaleBy(x: CGFloat(massstab), y: CGFloat(massstab))
  // Erst drehen, dann den Kasten in den Ursprung schieben — andersherum
  // dreht sich die Seite um eine Ecke, die nicht ihre ist.
  switch drehung {
  case 90:
    stift.translateBy(x: kasten.height, y: 0)
    stift.rotate(by: .pi / 2)
  case 180:
    stift.translateBy(x: kasten.width, y: kasten.height)
    stift.rotate(by: .pi)
  case 270:
    stift.translateBy(x: 0, y: kasten.width)
    stift.rotate(by: -.pi / 2)
  default:
    break
  }
  // **Nicht** noch einmal um den Ursprung des Kastens verschieben:
  // `draw(with:to:)` legt den gewaehlten Kasten von sich aus in den
  // Ursprung. Bei der CropBox faellt eine zweite Verschiebung nicht auf —
  // die faengt bei (0,0) an. Bei der TrimBox faengt sie bei (8,5|8,5) an,
  // und dann rutscht die Seite um die Schnittzugabe nach links unten:
  // oben und rechts bleibt weisses Papier stehen, ein Rahmen um die Seite.
  seite.draw(with: box, to: stift)
  stift.restoreGState()

  guard let bild = stift.makeImage() else {
    FileHandle.standardError.write("Seite \(stelle + 1) liess sich nicht rastern\n".data(using: .utf8)!)
    exit(1)
  }

  let name = String(format: "%04d.png", stelle + 1)
  let datei = ziel.appendingPathComponent(name)
  guard let schreiber = CGImageDestinationCreateWithURL(
    datei as CFURL, UTType.png.identifier as CFString, 1, nil
  ) else {
    FileHandle.standardError.write("Kein Schreiber fuer \(name)\n".data(using: .utf8)!)
    exit(1)
  }
  CGImageDestinationAddImage(schreiber, bild, nil)
  guard CGImageDestinationFinalize(schreiber) else {
    FileHandle.standardError.write("\(name) liess sich nicht schreiben\n".data(using: .utf8)!)
    exit(1)
  }

  let zugabe = box == .trimBox
    ? String(format: "Zugabe %.1f pt", kasten.origin.x)
    : "ohne Zugabe"
  print("\(name)\t\(breite)x\(hoehe)\tdreh \(drehung)\t\(zugabe)")
}

print("fertig\t\(bis)\t\(dokument.pageCount)")
