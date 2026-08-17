// Kopiert die Redaktionsoberflaeche aus node_modules nach public/admin/.
//
// Die Datei ist knapp zwei Megabyte gross und aendert sich nur mit der
// Paketversion — sie gehoert deshalb nicht ins Repository, sondern wird bei
// jeder Installation und vor jedem Bau frisch gelegt. So laeuft die
// Oberflaeche trotzdem vom eigenen Server und nicht von einem fremden CDN.

import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const quelle = 'node_modules/@sveltia/cms/dist/sveltia-cms.js';
const ziel = 'public/admin/sveltia-cms.js';

if (!existsSync(quelle)) {
  console.warn(
    `[cms] ${quelle} fehlt — erst "npm install" ausfuehren. /admin/ bleibt bis dahin leer.`,
  );
  process.exit(0);
}

await mkdir('public/admin', { recursive: true });
await copyFile(quelle, ziel);
console.log(`[cms] ${ziel} gelegt.`);
