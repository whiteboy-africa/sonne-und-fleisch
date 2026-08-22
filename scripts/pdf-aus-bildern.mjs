// Legt JPEG-Seiten in ein PDF, ohne sie noch einmal zu rechnen.
//
// Ein PDF kann ein JPEG **so wie es ist** tragen: der Datenstrom bekommt
// `/DCTDecode` und wird Byte fuer Byte uebernommen. Das ist der Grund,
// warum hier ein Dutzend Zeilen PDF von Hand stehen statt einer Bibliothek —
// jeder andere Weg dekodiert das Bild und kodiert es neu, und dann ist die
// heruntergeladene Seite nicht mehr dieselbe, die man geblaettert hat.
//
// Das erzeugte PDF ist so gross wie die Summe seiner Bilder plus ein paar
// hundert Byte Buchhaltung, und bei gleicher Eingabe Byte fuer Byte
// dasselbe: keine Zeitstempel, keine Kennungen, keine Zufallszahlen.

import { writeFile } from 'node:fs/promises';

/** Liest Breite und Hoehe aus den Rahmen eines JPEG. */
function jpegMasse(daten) {
  let i = 2; // ueber das SOI hinweg
  while (i < daten.length) {
    if (daten[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marke = daten[i + 1];
    // SOF0 bis SOF15, ohne die vier, die keine Rahmen sind.
    if (
      marke >= 0xc0 &&
      marke <= 0xcf &&
      marke !== 0xc4 &&
      marke !== 0xc8 &&
      marke !== 0xcc
    ) {
      return {
        hoehe: daten.readUInt16BE(i + 5),
        breite: daten.readUInt16BE(i + 7),
      };
    }
    i += 2 + daten.readUInt16BE(i + 2);
  }
  throw new Error('Kein SOF-Rahmen im JPEG.');
}

/**
 * Schreibt `bilder` (JPEG-Puffer) als PDF nach `ziel` — eine Seite je Bild,
 * jede Seite genau so gross wie ihr Bild bei `dpi`.
 */
export async function pdfAusJpegs(bilder, ziel, dpi = 150) {
  const stuecke = [];
  let laenge = 0;
  const schreiben = (was) => {
    const puffer = Buffer.isBuffer(was) ? was : Buffer.from(was, 'latin1');
    stuecke.push(puffer);
    laenge += puffer.length;
    return laenge;
  };

  // Objekt 1 ist der Katalog, 2 der Seitenbaum; danach je Seite drei:
  // Seite, Inhalt, Bild.
  const seitenIds = bilder.map((_, i) => 3 + i * 3);
  const orte = [];
  const merken = (nummer) => {
    orte[nummer] = laenge;
  };

  schreiben('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');

  merken(1);
  schreiben('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  merken(2);
  schreiben(
    `2 0 obj\n<< /Type /Pages /Count ${bilder.length} /Kids [${seitenIds
      .map((id) => `${id} 0 R`)
      .join(' ')}] >>\nendobj\n`,
  );

  bilder.forEach((jpeg, i) => {
    const { breite, hoehe } = jpegMasse(jpeg);
    // Punkte, nicht Bildpunkte: 72 Punkte auf ein Zoll.
    const breitePt = ((breite / dpi) * 72).toFixed(2);
    const hoehePt = ((hoehe / dpi) * 72).toFixed(2);
    const seite = seitenIds[i];
    const inhalt = seite + 1;
    const bild = seite + 2;

    merken(seite);
    schreiben(
      `${seite} 0 obj\n<< /Type /Page /Parent 2 0 R ` +
        `/MediaBox [0 0 ${breitePt} ${hoehePt}] ` +
        `/Resources << /XObject << /Bild ${bild} 0 R >> >> ` +
        `/Contents ${inhalt} 0 R >>\nendobj\n`,
    );

    // Das Bild fuellt die Seite: verschieben braucht es nicht, nur skalieren.
    const strom = `q\n${breitePt} 0 0 ${hoehePt} 0 0 cm\n/Bild Do\nQ\n`;
    merken(inhalt);
    schreiben(
      `${inhalt} 0 obj\n<< /Length ${strom.length} >>\nstream\n${strom}endstream\nendobj\n`,
    );

    merken(bild);
    schreiben(
      `${bild} 0 obj\n<< /Type /XObject /Subtype /Image ` +
        `/Width ${breite} /Height ${hoehe} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 ` +
        `/Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    );
    schreiben(jpeg);
    schreiben('\nendstream\nendobj\n');
  });

  const anzahl = 3 + bilder.length * 3;
  const xref = laenge;
  schreiben(`xref\n0 ${anzahl}\n0000000000 65535 f \n`);
  for (let i = 1; i < anzahl; i += 1) {
    schreiben(`${String(orte[i] ?? 0).padStart(10, '0')} 00000 n \n`);
  }
  schreiben(
    `trailer\n<< /Size ${anzahl} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );

  const fertig = Buffer.concat(stuecke);
  await writeFile(ziel, fertig);
  return fertig.length;
}
