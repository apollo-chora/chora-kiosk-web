/**
 * The prompt for a words change (step 4a, K35): a NEW draft from the one on screen plus the
 * visitor's instruction. The golden run prepared every chip with the same template
 * (`templates.word_revision`, kiosk/world/PREPARED-CHOICES.md section 7), and LIVE `words`
 * reads it from the manifest, so a live redo asks the writer exactly what the prepared chip
 * asked. Only multiple-choice drafts are revised.
 */
export interface WordRevisionTemplate {
  readonly lines: readonly string[];
  readonly option_line: string;
  readonly option_line_explained: string;
}

/** The draft as the job read returns it (`candidate_questions[]`). */
export interface RevisableDraft {
  readonly prompt: string;
  readonly mcq_payload?: {
    readonly options: readonly { readonly label: string; readonly is_correct: boolean; readonly explainer?: string }[];
  } | null;
}

// The golden run's drafts have four options; a hand edit may hold up to production's MAX_MCQ_OPTIONS (6).
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

/** Fills each `{name}` once from `values`; a name the values lack is a broken template. */
function fill(text: string, values: Readonly<Record<string, string>>): string {
  return text.replace(/\{([a-z_]+)\}/g, (_whole, name: string) => {
    if (!(name in values)) throw new Error(`[kiosk] the word revision template has an unknown placeholder {${name}}`);
    return values[name];
  });
}

export function wordRevisionPrompt(template: WordRevisionTemplate, draft: RevisableDraft, instruction: string): string {
  const options = draft.mcq_payload?.options;
  if (!options) throw new Error('[kiosk] only multiple-choice drafts are revised');
  if (options.length > LETTERS.length) {
    throw new Error(`[kiosk] the draft has ${options.length} options, more than the ${LETTERS.length} letters`);
  }
  const correct = options.flatMap((o, i) => (o.is_correct ? [LETTERS[i]] : []));
  if (correct.length !== 1) throw new Error(`[kiosk] a revised draft needs exactly one correct option, found ${correct.length}`);

  const optionLines = options.map((o, i) =>
    o.explainer
      ? fill(template.option_line_explained, { letter: LETTERS[i], label: o.label, explainer: o.explainer })
      : fill(template.option_line, { letter: LETTERS[i], label: o.label }),
  );
  const values = { stem: draft.prompt, options: optionLines.join('\n'), answer: correct[0], instruction };
  return template.lines.map((line) => fill(line, values)).join('\n');
}
