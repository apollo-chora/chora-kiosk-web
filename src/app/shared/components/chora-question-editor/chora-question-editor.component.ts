import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  model,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import {
  blankOption,
  EditableQuestion,
  MAX_MCQ_OPTIONS,
  MIN_MCQ_OPTIONS,
  validateEditableQuestion,
} from './chora-question-editor.model';

/**
 * Inline editor for a single question: the editable twin of
 * `chora-question-review`. Renders A/B/C/D lettered options with the correct
 * one highlighted (matching the review design) but every field is editable:
 * prompt, per-option text, the correct selector, per-option explainer, plus
 * add/remove option. Two-way bound via `model()`. Validation is surfaced for
 * inline display; hosts gate Save/Accept on `validateEditableQuestion`.
 *
 * AUTHOR/instructor-only: never wire to a learner pre-grade.
 */
@Component({
  selector: 'chora-question-editor',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chora-question-editor.component.html',
  styleUrl: './chora-question-editor.component.scss',
})
export class ChoraQuestionEditorComponent {
  /** Two-way edited question. Hosts MUST pass a UNIQUE `testIdPrefix` so the
   * per-option "correct" radio group names don't collide across instances. */
  readonly question = model.required<EditableQuestion>();
  readonly testIdPrefix = input<string>('');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // Grow each <textarea> to fit its content. We size from the element's OWN
    // scrollHeight (not cdkTextareaAutosize, whose measuring clone ignored our
    // line-height and landed one line short). Runs on initial render with
    // programmatically-set content AND on every edit/add/remove because the
    // `question()` read makes this re-run after each such render.
    afterRenderEffect(() => {
      this.question(); // track edits + structural option changes
      const areas =
        this.host.nativeElement.querySelectorAll<HTMLTextAreaElement>('textarea');
      for (const el of Array.from(areas)) {
        el.style.height = 'auto';
        // box-sizing:border-box ⇒ height must include the border; scrollHeight
        // covers content + padding, (offsetHeight - clientHeight) adds borders.
        el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
      }
    });
  }

  readonly isMcq = computed<boolean>(() => this.question().question_type === 'mcq');
  readonly validation = computed(() => validateEditableQuestion(this.question()));
  readonly canAddOption = computed<boolean>(
    () => this.question().options.length < MAX_MCQ_OPTIONS,
  );
  readonly canRemoveOption = computed<boolean>(
    () => this.question().options.length > MIN_MCQ_OPTIONS,
  );

  /** Radio-group name: unique per editor instance via the host's prefix. */
  readonly correctGroup = computed<string>(
    () => `chora-qe-correct-${this.testIdPrefix() || 'q'}`,
  );

  optionLetter(index: number): string {
    return String.fromCharCode(65 + index); // A, B, C, …
  }

  testId(suffix: string): string | null {
    const p = this.testIdPrefix();
    return p ? `${p}-${suffix}` : null;
  }

  // ── Mutations (immutable updates through the model signal) ─────────
  setPrompt(value: string): void {
    this.question.update((q) => ({ ...q, prompt: value }));
  }

  setModelAnswer(value: string): void {
    this.question.update((q) => ({ ...q, model_answer: value }));
  }

  setOptionLabel(index: number, value: string): void {
    this.question.update((q) => ({
      ...q,
      options: q.options.map((o, i) => (i === index ? { ...o, label: value } : o)),
    }));
  }

  setOptionExplainer(index: number, value: string): void {
    this.question.update((q) => ({
      ...q,
      options: q.options.map((o, i) =>
        i === index ? { ...o, explainer: value } : o,
      ),
    }));
  }

  /** Mark option `index` correct (exactly-one: clears the others). */
  setCorrect(index: number): void {
    this.question.update((q) => ({
      ...q,
      options: q.options.map((o, i) => ({ ...o, is_correct: i === index })),
    }));
  }

  addOption(): void {
    if (!this.canAddOption()) return;
    this.question.update((q) => ({ ...q, options: [...q.options, blankOption()] }));
  }

  removeOption(index: number): void {
    if (!this.canRemoveOption()) return;
    this.question.update((q) => ({
      ...q,
      options: q.options.filter((_, i) => i !== index),
    }));
  }
}
