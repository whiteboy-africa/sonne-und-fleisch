// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // Produktionsadresse. Bei eigener Domain hier ersetzen.
  site: 'https://sonne-und-fleisch.pages.dev',
  integrations: [
    mdx(),
    sitemap({
      // Die CMS-Oberflaeche gehoert nicht in die Sitemap. Entwuerfe stehen
      // ohnehin nicht im Programm und werden nicht gebaut.
      //
      // Und das Heft nicht: es ist kein Band der Reihe, es steht nicht im
      // Programm, und eine Zeitschrift, die man blaettert, ist kein
      // Dokument, das eine Suchmaschine indizieren soll. Dieselbe Regel
      // wie in `programmListe()`.
      filter: (seite) =>
        !seite.includes('/admin') && !seite.includes('/magazin'),
    }),
  ],
  // Die Entwicklerleiste unten im Bild stoert beim Beurteilen der Szene.
  devToolbar: { enabled: false },
  // Saubere URLs ohne .html, wie beim Gnadenthal-Magazin.
  build: {
    format: 'directory',
  },
});
