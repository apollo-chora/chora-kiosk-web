import type { ProposedGrowthEdge } from '../../product-api/growth-edges.service';

/** One question of a prepared paper, as kiosk/world/papers/papers.json holds it (content, English, K41). */
export interface PaperQuestion {
  readonly q: string;
  readonly marks: number;
  readonly answer: string;
  readonly got: number;
  /** The teacher's note in red ('' when none). */
  readonly note: string;
  /** W52: the key words a weak spot for this question names; on every question that lost marks. */
  readonly spot_words?: readonly string[];
  /** K206 (W90): an essay's answer as the learner wrote it, line by line, each with the teacher's margin. */
  readonly lines?: readonly PaperLine[];
}

/** One line of an essay's answer (papers.json layout "essay"): the learner's words and the teacher's margin. */
export interface PaperLine {
  readonly text: string;
  /** 'tick', or the teacher's hint beside the words underlined in red. */
  readonly margin: string;
  /** The words of `text` the teacher underlined, when any. */
  readonly underline?: string;
}

/** A question that lost marks, numbered as the paper prints it, with the weak spots placed under it. */
export interface LostMark {
  readonly n: number;
  readonly q: string;
  readonly marks: number;
  readonly got: number;
  readonly answer: string;
  readonly note: string;
  /** K206: an essay's lines; a marked test's question has none. */
  readonly lines?: readonly PaperLine[];
  readonly spots: readonly ProposedGrowthEdge[];
}

export interface PaperExtract {
  readonly lost: readonly LostMark[];
  /** The weak spots whose words name no lost-mark question, or more than one. */
  readonly apart: readonly ProposedGrowthEdge[];
}

/**
 * papers.json's questions for one paper, refused loudly when one is not a question or when a question
 * that lost marks names no spot_words (W52: the popup would otherwise say "no weak spot" for want of data).
 * K206: an essay's lines are checked too, each underline against its own line.
 */
export function paperQuestions(key: string, raw: unknown): PaperQuestion[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error(`papers.json's ${key} has no questions`);
  return raw.map((x: unknown, i): PaperQuestion => {
    const v = x as Partial<Record<keyof PaperQuestion, unknown>>;
    const words = v.spot_words;
    if (
      typeof v.q !== 'string' ||
      typeof v.marks !== 'number' ||
      typeof v.got !== 'number' ||
      typeof v.answer !== 'string' ||
      typeof v.note !== 'string' ||
      (words !== undefined && !(Array.isArray(words) && words.every((w) => typeof w === 'string' && w.trim() !== ''))) ||
      (v.lines !== undefined && !Array.isArray(v.lines))
    ) {
      throw new Error(`papers.json's ${key} question ${i + 1} is not a question`);
    }
    if (v.got < v.marks && !(Array.isArray(words) && words.length > 0)) throw new Error(`papers.json's ${key} question ${i + 1} lost marks and names no spot_words`);
    if (Array.isArray(v.lines)) v.lines.forEach((l: unknown, j) => paperLine(`papers.json's ${key} question ${i + 1} line ${j + 1}`, l));
    return x as PaperQuestion;
  });
}

/** One essay line, refused loudly when it is not one or its underline is not in its own words. */
function paperLine(where: string, raw: unknown): void {
  const l = (raw ?? {}) as Partial<Record<keyof PaperLine, unknown>>;
  const filled = (s: unknown): s is string => typeof s === 'string' && s.trim() !== '';
  if (!filled(l.text) || !filled(l.margin) || (l.underline !== undefined && !filled(l.underline))) throw new Error(`${where} is not a line`);
  if (l.underline !== undefined && !l.text.includes(l.underline)) throw new Error(`${where}'s underline is not in its text`);
}

/** K206: an essay line split about its underline, as the page draws it (the words before, underlined, after). */
export function lineParts(line: PaperLine): { readonly before: string; readonly underline: string; readonly after: string } {
  const at = line.underline ? line.text.indexOf(line.underline) : -1;
  if (at < 0 || !line.underline) return { before: line.text, underline: '', after: '' };
  return { before: line.text.slice(0, at), underline: line.underline, after: line.text.slice(at + line.underline.length) };
}

/**
 * W52 (K182): the analyser's weak spots carry no question reference, so each is placed by its own
 * words: its title first and, only when the title names no lost-mark question, its summary. A word
 * matches case apart from the start of a word ("otter" names Otters, never Potters). Exactly one
 * question named places it there; none or several leave it apart. A lost mark may hold none.
 */
export function placeSpots(questions: readonly PaperQuestion[], edges: readonly ProposedGrowthEdge[]): PaperExtract {
  const lost = questions.map((q, i) => ({ q, n: i + 1 })).filter(({ q }) => q.got < q.marks);
  const named = (text: string) => lost.filter(({ q }) => (q.spot_words ?? []).some((w) => startsWord(text, w)));
  const under = new Map<number, ProposedGrowthEdge[]>(lost.map(({ n }) => [n, []]));
  const apart: ProposedGrowthEdge[] = [];
  for (const e of edges) {
    const byTitle = named(e.concept_label);
    const hit = byTitle.length > 0 ? byTitle : named(e.summary);
    if (hit.length === 1) under.get(hit[0].n)?.push(e);
    else apart.push(e);
  }
  return {
    lost: lost.map(({ q, n }) => ({ n, q: q.q, marks: q.marks, got: q.got, answer: q.answer, note: q.note, ...(q.lines ? { lines: q.lines } : {}), spots: under.get(n) ?? [] })),
    apart,
  };
}

function startsWord(text: string, word: string): boolean {
  const w = word.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${w}`, 'iu').test(text);
}
