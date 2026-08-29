import type { APIRoute } from 'astro';
import { alleBuecher, nummernFolge, bandPfad } from '../buecher';

/*
 * **Die Tabelle der alten Adressen.**
 *
 * Die Baende lagen einmal unter `/programm/{slug}` — dem Dateinamen als
 * Adresse. Jetzt liegen sie unter `/band-{nn}`, und jeder alte Weg fuehrt
 * dauerhaft dorthin. Ein Verweis, der irgendwo im Netz oder in einer Mail
 * steht, soll nicht ins Leere laufen, nur weil hier umgeraeumt wurde.
 *
 * **301, nicht 302, und nicht per Meta-Refresh.** Astros eingebaute
 * `redirects` erzeugen im statischen Bau eine HTML-Seite mit
 * `<meta http-equiv="refresh">` — das ist eine Seite, die sich
 * weiterreicht, keine Weiterleitung. Cloudflare Pages liest dagegen die
 * Datei `_redirects` im Wurzelverzeichnis und antwortet damit selbst,
 * bevor irgendein HTML entsteht.
 *
 * Die Datei wird **hier ausgerechnet und nicht von Hand gepflegt**: die
 * Nummer eines Bandes haengt an seiner Stelle in der Reihe, und die
 * verschiebt sich, sobald ein Band dazukommt. Eine handgeschriebene
 * Tabelle waere beim ersten neuen Band falsch.
 *
 * Sonderobjekte haben keine Bandseite. Das Blatt und das Heft leiten
 * deshalb dorthin, wo sie wirklich liegen: in den Stapel und auf ihre
 * eigene Adresse.
 *
 * **Warum die Datei hier `weiterleitungen.txt` heisst.** Cloudflare will
 * sie als `_redirects` im Wurzelverzeichnis. Astro nimmt aber jede Datei
 * unter `src/pages/`, deren Name mit einem Unterstrich beginnt, vom
 * Routing aus — `_redirects.ts` waere nie gebaut worden (erst als die
 * Datei im `dist` fehlte, fiel das auf). Sie wird deshalb unter diesem
 * Namen erzeugt und am Ende des Baus umbenannt; das erledigt die kleine
 * Integration in `astro.config.mjs`.
 */
export const GET: APIRoute = async () => {
  const buecher = await alleBuecher();
  const nummern = nummernFolge(buecher);

  const zeilen = buecher.map((buch, position) => {
    const nummer = nummern[position];
    // Der Blindband hat keine Bandseite: er ist eine offene Stelle, kein
    // Buch. Sein alter Weg fuehrt in den Stapel, wo er liegt.
    const ziel = buch.data.magazin
      ? '/magazin'
      : nummer && !buch.data.blind
        ? bandPfad(nummer)
        : '/';
    return `/programm/${buch.id}  ${ziel}  301`;
  });

  const text = [
    '# Erzeugt beim Bauen aus src/pages/weiterleitungen.txt.ts — nicht von Hand aendern.',
    '# Die Baende lagen einmal unter /programm/{slug}.',
    ...zeilen,
    '',
  ].join('\n');

  return new Response(text, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
