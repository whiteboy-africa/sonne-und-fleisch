// Die Wache über den Takt der Angaben — nur in der Entwicklung.
//
// Dreimal ist derselbe Abstand hier verlorengegangen, ohne dass es
// jemandem aufgefallen wäre: die Werte standen im Stylesheet, kamen aber
// nie im Bild an. Einmal, weil ein pauschaler Reset
// (`.press-experience :is(h1, h2, p, …) { margin: 0 }`, Gewicht 0-1-1)
// schwerer wog als die Bauteilregel (0-1-0). Einmal, weil `margin-top:
// auto` in einer früheren Regel stand als die spätere, die denselben
// Rand setzte. Und einmal, weil eine Spalte kein Flex-Kontext war und
// `auto` deshalb gar nichts zu verteilen hatte.
//
// Keiner dieser drei Fehler sieht im Stylesheet nach einem Fehler aus.
// Man sieht sie nur, wenn man **misst**. Also misst hier jemand.
//
// Die Wache läuft ausschließlich unter `import.meta.env.DEV` und schreibt
// in die Konsole; im Bau ist sie nicht dabei.

/** Was gemessen wird, und woran es scheitern darf. */
type Takt = {
  /** Wofür — steht in der Warnung. */
  ansicht: string;
  titel: Element | null;
  autor: Element | null;
  klappentext: Element | null;
  zitat: Element | null;
  /** Was unter dem Zitat kommt: Trenner oder Fussblock. */
  danach: Element | null;
  /** Der Block, an dessen Fuss das Zitat sitzen soll. */
  spalte: Element | null;
};

const luft = (oben: Element, unten: Element) =>
  Math.round(unten.getBoundingClientRect().top - oben.getBoundingClientRect().bottom);

/**
 * Prüft die drei Beziehungen und meldet jede, die bricht — mit den
 * gemessenen Zahlen, nicht mit einem Namen. Wer die Warnung liest, soll
 * nicht suchen müssen, sondern sehen, wie weit es daneben liegt.
 */
export function taktPruefen(takt: Takt) {
  const { ansicht, titel, autor, klappentext, zitat, danach, spalte } = takt;
  if (!titel || !autor || !klappentext || !zitat) return;

  const klagen: string[] = [];

  // 1. Titel und Name gehören zusammen, der Text ist das Nächste.
  const eng = luft(titel, autor);
  const weit = luft(autor, klappentext);
  if (weit < eng * 3) {
    klagen.push(
      `Autor→Klappentext ist ${weit} px, muss mindestens das Dreifache von ` +
        `Titel→Autor (${eng} px) sein, also ≥ ${eng * 3} px.`,
    );
  }

  // 2. Klappentext wird gelesen, also braucht er Durchschuss.
  const stil = getComputedStyle(klappentext);
  const durchschuss = parseFloat(stil.lineHeight) / parseFloat(stil.fontSize);
  if (!(durchschuss >= 1.65)) {
    klagen.push(`Klappentext-Zeilenhöhe ist ${durchschuss.toFixed(2)}×, muss ≥ 1,65 sein.`);
  }

  // 3. Der Überschuss gehört über das Zitat, nicht darunter.
  if (danach) {
    const unten = luft(zitat, danach);
    const soll = 2.5 * parseFloat(getComputedStyle(document.documentElement).fontSize);
    if (Math.abs(unten - soll) > 8) {
      klagen.push(
        `Zitat→Abschluss ist ${unten} px, soll rund ${Math.round(soll)} px sein (2,5rem).`,
      );
    }
  }
  if (spalte) {
    const rest = Math.round(
      spalte.getBoundingClientRect().bottom - zitat.getBoundingClientRect().bottom,
    );
    if (rest > 8) {
      klagen.push(
        `Unter dem Zitat stehen ${rest} px ungenutzt — der Überschuss gehört ` +
          `darüber. Sitzt \`margin-top: auto\` in der Regel, die auch wirklich ` +
          `gewinnt, und ist die Spalte ein Flex-Kontext?`,
      );
    }
  }

  if (klagen.length > 0) {
    console.warn(
      `[Takt] ${ansicht}: ${klagen.length} Regel(n) gebrochen\n  ` + klagen.join('\n  '),
    );
  }
}
