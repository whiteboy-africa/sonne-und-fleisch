// @ts-check
import { rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

/**
 * Legt die Weiterleitungstabelle an ihren Platz.
 *
 * Gebaut wird sie von `src/pages/weiterleitungen.txt.ts` — dort steht,
 * warum sie nicht gleich `_redirects` heissen kann und was drinsteht.
 * Hier wird sie nur umbenannt: Cloudflare Pages sucht `_redirects` im
 * Wurzelverzeichnis der Auslieferung und beantwortet damit die alten
 * `/programm/{slug}`-Adressen mit einem echten 301, bevor irgendein HTML
 * entsteht.
 */
function weiterleitungen() {
  return {
    name: 'weiterleitungen',
    hooks: {
      /** @param {{ dir: URL, logger: { info: (text: string) => void } }} args */
      'astro:build:done': async ({ dir, logger }) => {
        const wurzel = fileURLToPath(dir);
        await rename(`${wurzel}weiterleitungen.txt`, `${wurzel}_redirects`);
        logger.info('_redirects geschrieben');
      },
    },
  };
}

export default defineConfig({
  // Produktionsadresse. Bei eigener Domain hier ersetzen.
  site: 'https://sonne-und-fleisch.pages.dev',
  integrations: [
    mdx(),
    weiterleitungen(),
    sitemap({
      // Die CMS-Oberflaeche gehoert nicht in die Sitemap. Entwuerfe stehen
      // ohnehin nicht im Programm und werden nicht gebaut.
      //
      // Und das Heft nicht: es ist kein Band der Reihe, es steht nicht im
      // Programm, und eine Zeitschrift, die man blaettert, ist kein
      // Dokument, das eine Suchmaschine indizieren soll. Dieselbe Regel
      // wie in `programmListe()`.
      filter: (seite) =>
        !seite.includes('/admin') &&
        !seite.includes('/magazin') &&
        !seite.includes('/weiterleitungen'),
    }),
  ],
  // Die Entwicklerleiste unten im Bild stoert beim Beurteilen der Szene.
  devToolbar: { enabled: false },
  // Saubere URLs ohne .html, wie beim Gnadenthal-Magazin.
  build: {
    format: 'directory',
  },
});
