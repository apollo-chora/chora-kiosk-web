/**
 * Shared "question review" model: the answer-key view of a single question
 * (MCQ options with correct flag + grounding/explainer, or OE model answer +
 * rubric, plus the optional question / model-answer illustrations).
 *
 * Both the A+ test-set editor's "Included questions" reveal and the R+
 * assessment monitor's questions panel render this same shape via
 * `<chora-question-review>`, so the normalised type + the parser from the
 * AUTHOR question projection (`GET /api/atoms/{atomId}/questions/{questionId}`)
 * live here, shared, rather than duplicated per surface.
 *
 * AUTHOR-ONLY: `model_answer` + `answer_image_url` carry the answer key and
 * MUST NOT be rendered on any learner surface pre-grade.
 */

export interface QuestionReviewOption {
  readonly option_id: string;
  /** Display text of the option (the BE author projection ships it as `label`). */
  readonly label: string;
  readonly is_correct: boolean;
  /** Per-option grounding / rationale ("why this is right/wrong"). */
  readonly explainer: string | null;
}

export interface QuestionReviewRubricRow {
  readonly title: string;
  readonly description: string | null;
  readonly weight: number | null;
}

export interface QuestionReview {
  readonly question_type: 'mcq' | 'oe';
  /** The question stem/prompt (hosts may already show it; fallback source). */
  readonly prompt?: string | null;
  readonly options: readonly QuestionReviewOption[];
  readonly model_answer: string | null;
  readonly rubric: readonly QuestionReviewRubricRow[];
  readonly question_image_url: string | null;
  readonly answer_image_url: string | null;
}

/**
 * One OE rubric criterion as the AUTHOR projection ships it. Field names vary
 * by source: a legacy flat `[{ title, weight }]` array vs the live
 * `oe.rubric.criteria[]`, which carries `{ description, weight_percent }`.
 */
interface AuthorOeRubricCriterion {
  readonly criterion_id?: string;
  readonly title?: string;
  readonly description?: string | null;
  readonly weight?: number | null;
  readonly weight_percent?: number | null;
}

/** OE rubric: either a flat criteria array OR an object wrapping `criteria`. */
type AuthorOeRubric =
  | readonly AuthorOeRubricCriterion[]
  | { readonly criteria?: readonly AuthorOeRubricCriterion[] }
  | null;

/**
 * Raw shape of the AUTHOR question projection
 * (`GET /api/atoms/{atomId}/questions/{questionId}`, operationId getQuestion).
 * Verified live 2026-06-20: `question.mcq.options[]` carries
 * `{option_id, label, is_correct, explainer}` and `question.mcq.{image_url,
 * answer_image_url}`. The OE branch is modelled defensively (no live sample at
 * authoring time) so an OE question still renders its model answer + rubric.
 */
export interface AuthorQuestionRaw {
  readonly question?: {
    readonly type?: string | null;
    readonly prompt?: string | null;
    readonly mcq?: {
      readonly image_url?: string | null;
      readonly answer_image_url?: string | null;
      readonly options?: readonly {
        readonly option_id?: string;
        readonly label?: string;
        readonly text?: string;
        readonly is_correct?: boolean;
        readonly explainer?: string | null;
      }[];
    } | null;
    readonly oe?: {
      readonly model_answer?: string | null;
      readonly image_url?: string | null;
      readonly answer_image_url?: string | null;
      readonly rubric?: AuthorOeRubric;
    } | null;
  } | null;
}

/** Normalise the AUTHOR question projection into a `QuestionReview`. */
export function toQuestionReview(raw: AuthorQuestionRaw): QuestionReview {
  const q = raw?.question ?? {};
  const mcq = q.mcq ?? null;
  const oe = q.oe ?? null;
  const question_type: 'mcq' | 'oe' = mcq
    ? 'mcq'
    : oe
      ? 'oe'
      : q.type === 'oe'
        ? 'oe'
        : 'mcq';

  const options: QuestionReviewOption[] = (mcq?.options ?? []).map((o) => ({
    option_id: o.option_id ?? '',
    label: (o.text?.trim() || o.label?.trim()) ?? '',
    is_correct: o.is_correct === true,
    explainer: o.explainer ?? null,
  }));

  // oe.rubric ships either as a flat criteria array (legacy) or wrapped in
  // `{ criteria: [...] }` (the live AUTHOR projection). Normalise both, and
  // accept either field naming (title/description, weight/weight_percent).
  const rawRubric = oe?.rubric ?? null;
  const criteria: readonly AuthorOeRubricCriterion[] = !rawRubric
    ? []
    : Array.isArray(rawRubric)
      ? rawRubric
      : ((rawRubric as { criteria?: readonly AuthorOeRubricCriterion[] })
          .criteria ?? []);
  const rubric: QuestionReviewRubricRow[] = criteria.map((r) => ({
    // The live form uses `description` as the criterion name → its title.
    title: (r.title?.trim() || r.description?.trim()) ?? '',
    // Only the legacy form carries a SEPARATE description alongside a title.
    description: r.title ? (r.description ?? null) : null,
    weight: r.weight ?? r.weight_percent ?? null,
  }));

  return {
    question_type,
    prompt: q.prompt ?? null,
    options,
    model_answer: oe?.model_answer ?? null,
    rubric,
    question_image_url: mcq?.image_url ?? oe?.image_url ?? null,
    answer_image_url: mcq?.answer_image_url ?? oe?.answer_image_url ?? null,
  };
}
