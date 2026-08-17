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
      filter: (seite) => !seite.includes('/admin'),
    }),
  ],
  // Saubere URLs ohne .html, wie beim Gnadenthal-Magazin.
  build: {
    format: 'directory',
  },
});
