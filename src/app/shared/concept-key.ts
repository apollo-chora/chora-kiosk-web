/**
 * Production's concept key (consumption `domain/concept_graph/concept_node.go:185`): lower-case, each
 * run of characters outside `a-z0-9` becomes one `-`, trimmed of `-`. The serve door adopts a prepared
 * set by this key (V1), so the story asks it to decide which new idea has a prepared question (h3 = A).
 *
 * Go lower-cases with `strings.ToLower`, one rune to one rune; JavaScript's `toLowerCase` may expand a
 * character (U+0130 becomes "i" and a combining dot), so each character is lower-cased alone and only
 * its first code point is kept, which is the rune Go gives.
 */
export function normalizeConceptKey(title: string): string {
  let out = '';
  let lastDash = false;
  for (const ch of title) {
    const lower = String.fromCodePoint(ch.toLowerCase().codePointAt(0) as number);
    if ((lower >= 'a' && lower <= 'z') || (lower >= '0' && lower <= '9')) {
      out += lower;
      lastDash = false;
    } else if (!lastDash && out.length > 0) {
      out += '-';
      lastDash = true;
    }
  }
  return out.replace(/^-+|-+$/g, '');
}
