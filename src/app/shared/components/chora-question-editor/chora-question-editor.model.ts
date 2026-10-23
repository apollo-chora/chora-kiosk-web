/**
 * Editable counterpart of `QuestionReview`: the inline question/option editor
 * shared by the A+ batch composer (draft candidates, pre-Accept) and the A+
 * test-set editor (published atoms → AtomRevision). Renders in the
 * `chora-question-review` visual style (A/B/C/D lettered options, correct
 * highlight, explainers) but with editable fields + add/remove options.
 *
 * Mutations flow through a single `EditableQuestion` value (two-way `model()`),
 * and validation (exactly-one-correct, ≥2 options, non-empty text) is a pure
 * function shared by the editor (inline errors) and the host (gate Save/Accept).
 */

import type { QuestionReview } from '../chora-question-review/chora-question-review.model';

export interface EditableOption {
  /** Stable id for existing options; `null` for a freshly-added option: the
   * backend assigns a UUIDv7 on persist (questions_handler buildPatch / accept
   * override). Grading is option_id-based, so preserving ids matters. */
  option_id: string | null;
  label: string;
  is_correct: boolean;
  explainer: string;
}

export interface EditableQuestion {
  readonly question_type: 'mcq' | 'oe';
  prompt: string;
  /** MCQ only. */
  options: EditableOption[];
  /** OE only. */
  model_answer: string;
}

export interface QuestionValidation {
  readonly valid: boolean;
  /** i18n keys under `shared.question_editor.error.*`. */
  readonly errors: readonly string[];
}

export const MIN_MCQ_OPTIONS = 2;
export const MAX_MCQ_OPTIONS = 6;

/** A blank option for the "add option" affordance. */
export function blankOption(): EditableOption {
  return { option_id: null, label: '', is_correct: false, explainer: '' };
}

/** Normalise a read-only QuestionReview into the editable shape (deep copy). */
export function toEditableQuestion(review: QuestionReview): EditableQuestion {
  return {
    question_type: review.question_type,
    prompt: (review.prompt ?? '').toString(),
    options: review.options.map((o) => ({
      option_id: o.option_id || null,
      label: o.label ?? '',
      is_correct: o.is_correct === true,
      explainer: o.explainer ?? '',
    })),
    model_answer: review.model_answer ?? '',
  };
}

/**
 * Validate an edited question. MCQ: non-empty prompt, ≥2 options, every option
 * label non-empty, EXACTLY one correct. OE: non-empty prompt (model answer is
 * optional). Returns i18n error keys for inline display.
 */
export function validateEditableQuestion(q: EditableQuestion): QuestionValidation {
  const errors: string[] = [];
  if (!q.prompt.trim()) {
    errors.push('shared.question_editor.error.prompt_required');
  }
  if (q.question_type === 'mcq') {
    if (q.options.length < MIN_MCQ_OPTIONS) {
      errors.push('shared.question_editor.error.min_options');
    }
    if (q.options.length > MAX_MCQ_OPTIONS) {
      errors.push('shared.question_editor.error.max_options');
    }
    if (q.options.some((o) => !o.label.trim())) {
      errors.push('shared.question_editor.error.option_label_required');
    }
    // Per-option explainer is OPTIONAL (ADR-189 / CHO-1826): a hand-authored
    // question may leave any/all explainers blank; the domain accepts empty and
    // AI generation still auto-fills them. No explainer-required gate here.
    const correctCount = q.options.filter((o) => o.is_correct).length;
    if (correctCount !== 1) {
      errors.push('shared.question_editor.error.exactly_one_correct');
    }
  }
  return { valid: errors.length === 0, errors };
}
