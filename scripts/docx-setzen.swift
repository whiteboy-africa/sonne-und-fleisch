// Setzt ein .docx in ein PDF — im Format, das im Dokument selbst steht.
//
// Warum ueberhaupt: die Leseprobe lebt von echten Seiten (Schrift,
// Satzspiegel, Seitenzahl). Aus einem .docx laesst sich das nicht ablesen;
// es hat keine harten Seitenumbrueche. Ein PDF hat sie.
//
// **Das ist nicht der Umbruch aus Word.** TextKit bricht die Zeilen selbst,
// mit denselben Schriften, demselben Satzspiegel und demselben
// Beschnittformat — aber nicht zwingend an denselben Stellen. Fuer die
// Seitenzahl einer Leseprobe ist das nah genug; wer die gedruckte Seite
// braucht, exportiert das PDF aus Word.
//
//   swift scripts/docx-setzen.swift <quelle.docx> <ziel.pdf>

import AppKit

let args = CommandLine.arguments
guard args.count >= 3 else {
  FileHandle.standardError.write("Aufruf: swift docx-setzen.swift <docx> <pdf>\n".data(using: .utf8)!)
  exit(2)
}
let quelle = URL(fileURLWithPath: args[1])
let ziel = URL(fileURLWithPath: args[2])

// Seitenformat und Raender stehen im Dokument, in Twips (1/1440 Zoll).
func twips(_ xml: String, _ tag: String, _ attr: String) -> Double? {
  guard let r = xml.range(of: "<w:\(tag)[^/]*/>", options: .regularExpression) else { return nil }
  let stueck = String(xml[r])
  guard let a = stueck.range(of: "w:\(attr)=\"[0-9]+\"", options: .regularExpression) else { return nil }
  return Double(String(stueck[a]).split(separator: "\"")[1])
}

let auspack = FileManager.default.temporaryDirectory
  .appendingPathComponent("docxsatz-\(quelle.lastPathComponent.hashValue)")
try? FileManager.default.removeItem(at: auspack)
let unzip = Process()
unzip.executableURL = URL(fileURLWithPath: "/usr/bin/unzip")
unzip.arguments = ["-o", "-q", quelle.path, "-d", auspack.path]
try unzip.run(); unzip.waitUntilExit()
let xml = (try? String(contentsOf: auspack.appendingPathComponent("word/document.xml"),
                       encoding: .utf8)) ?? ""

let breitePt = (twips(xml, "pgSz", "w") ?? 8640) / 20.0
let hoehePt  = (twips(xml, "pgSz", "h") ?? 12960) / 20.0
let oben     = (twips(xml, "pgMar", "top") ?? 1440) / 20.0
let unten    = (twips(xml, "pgMar", "bottom") ?? 1440) / 20.0
let links    = (twips(xml, "pgMar", "left") ?? 1440) / 20.0
let rechts   = (twips(xml, "pgMar", "right") ?? 1440) / 20.0

guard let text = try? NSAttributedString(
  url: quelle,
  options: [.documentType: NSAttributedString.DocumentType.officeOpenXML],
  documentAttributes: nil
) else {
  FileHandle.standardError.write("Kein lesbares .docx\n".data(using: .utf8)!)
  exit(1)
}

let speicher = NSTextStorage(attributedString: text)
let setzer = NSLayoutManager()
speicher.addLayoutManager(setzer)

let satzspiegel = NSSize(width: breitePt - links - rechts, height: hoehePt - oben - unten)
let seitenGroesse = NSSize(width: breitePt, height: hoehePt)

var kasten = NSRect(x: 0, y: 0, width: breitePt, height: hoehePt)
guard let ctx = CGContext(ziel as CFURL, mediaBox: &kasten, nil) else {
  FileHandle.standardError.write("Kein PDF-Ziel\n".data(using: .utf8)!)
  exit(1)
}

var seiten = 0
var gesetzt = 0
while gesetzt < setzer.numberOfGlyphs || seiten == 0 {
  let behaelter = NSTextContainer(containerSize: satzspiegel)
  behaelter.lineFragmentPadding = 0
  setzer.addTextContainer(behaelter)
  let bereich = setzer.glyphRange(for: behaelter)
  if bereich.length == 0 && seiten > 0 { break }

  ctx.beginPage(mediaBox: &kasten)
  let alt = NSGraphicsContext.current
  NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: true)
  ctx.saveGState()
  // Der Ursprung liegt unten links, der Satz laeuft von oben.
  ctx.translateBy(x: 0, y: hoehePt)
  ctx.scaleBy(x: 1, y: -1)
  ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
  ctx.fill(CGRect(origin: .zero, size: seitenGroesse))
  setzer.drawGlyphs(forGlyphRange: bereich, at: NSPoint(x: links, y: oben))
  ctx.restoreGState()
  NSGraphicsContext.current = alt
  ctx.endPage()

  gesetzt = NSMaxRange(bereich)
  seiten += 1
  if seiten > 2000 { break }
}
ctx.closePDF()
print("\(seiten) Seiten, \(Int(breitePt))x\(Int(hoehePt)) pt "
      + "(\(String(format: "%.2f", breitePt/72))x\(String(format: "%.2f", hoehePt/72)) Zoll)")
