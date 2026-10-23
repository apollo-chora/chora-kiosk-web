import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';

// KIOSK: ngx-translate's pipe needs its own service, so production's stub translate service is dropped.
import { provideTranslateService } from '@ngx-translate/core';
import { ChoraQuestionEditorComponent } from './chora-question-editor.component';

import {
  EditableQuestion,
  toEditableQuestion,
  validateEditableQuestion,
} from './chora-question-editor.model';

function mcq(overrides: Partial<EditableQuestion> = {}): EditableQuestion {
  return {
    question_type: 'mcq',
    prompt: 'What is 2 + 2?',
    options: [
      { option_id: 'o1', label: '3', is_correct: false, explainer: 'Off by one.' },
      { option_id: 'o2', label: '4', is_correct: true, explainer: 'Right.' },
    ],
    model_answer: '',
    ...overrides,
  };
}

describe('chora-question-editor model', () => {
  it('validates a well-formed MCQ as valid', () => {
    expect(validateEditableQuestion(mcq()).valid).toBe(true);
  });

  it('flags zero-correct and multi-correct MCQs', () => {
    const none = mcq({
      options: [
        { option_id: 'a', label: 'a', is_correct: false, explainer: '' },
        { option_id: 'b', label: 'b', is_correct: false, explainer: '' },
      ],
    });
    expect(validateEditableQuestion(none).errors).toContain(
      'shared.question_editor.error.exactly_one_correct',
    );
    const two = mcq({
      options: [
        { option_id: 'a', label: 'a', is_correct: true, explainer: '' },
        { option_id: 'b', label: 'b', is_correct: true, explainer: '' },
      ],
    });
    expect(validateEditableQuestion(two).valid).toBe(false);
  });

  it('flags <2 options, empty labels, and empty prompt', () => {
    expect(
      validateEditableQuestion(mcq({ options: [mcq().options[0]] })).errors,
    ).toContain('shared.question_editor.error.min_options');
    expect(
      validateEditableQuestion(
        mcq({
          options: [
            { option_id: 'a', label: '', is_correct: true, explainer: '' },
            { option_id: 'b', label: 'b', is_correct: false, explainer: '' },
          ],
        }),
      ).errors,
    ).toContain('shared.question_editor.error.option_label_required');
    expect(validateEditableQuestion(mcq({ prompt: '  ' })).errors).toContain(
      'shared.question_editor.error.prompt_required',
    );
  });

  it('allows missing/partial per-option explainers (ADR-189: optional)', () => {
    // Some blank, some filled: valid as long as labels + exactly-one-correct hold.
    const partial = mcq({
      options: [
        { option_id: 'a', label: 'a', is_correct: true, explainer: '' },
        { option_id: 'b', label: 'b', is_correct: false, explainer: 'x' },
      ],
    });
    const v1 = validateEditableQuestion(partial);
    expect(v1.errors).not.toContain(
      'shared.question_editor.error.option_explainer_required',
    );
    expect(v1.valid).toBe(true);
    // All explainers blank: still valid.
    const allBlank = mcq({
      options: [
        { option_id: 'a', label: 'a', is_correct: true, explainer: '' },
        { option_id: 'b', label: 'b', is_correct: false, explainer: '' },
      ],
    });
    expect(validateEditableQuestion(allBlank).valid).toBe(true);
  });

  it('toEditableQuestion deep-copies a QuestionReview (new option ids preserved, blanks → null)', () => {
    const ed = toEditableQuestion({
      question_type: 'mcq',
      prompt: 'p',
      options: [
        { option_id: 'x', label: 'L', is_correct: true, explainer: 'e' },
        { option_id: '', label: 'M', is_correct: false, explainer: null },
      ],
      model_answer: null,
      rubric: [],
      question_image_url: null,
      answer_image_url: null,
    });
    expect(ed.options[0].option_id).toBe('x');
    expect(ed.options[1].option_id).toBeNull();
    expect(ed.options[1].explainer).toBe('');
  });
});

describe('ChoraQuestionEditorComponent', () => {
  let fixture: ComponentFixture<ChoraQuestionEditorComponent>;
  let component: ChoraQuestionEditorComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ChoraQuestionEditorComponent],
      providers: [provideTranslateService()], // KIOSK
    });
    fixture = TestBed.createComponent(ChoraQuestionEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('question', mcq());
    fixture.componentRef.setInput('testIdPrefix', 'q1');
    fixture.detectChanges();
  });

  it('setCorrect makes exactly one option correct', () => {
    component.setCorrect(0);
    const opts = component.question().options;
    expect(opts.map((o) => o.is_correct)).toEqual([true, false]);
  });

  it('addOption appends a blank option; removeOption deletes by index', () => {
    component.addOption();
    expect(component.question().options.length).toBe(3);
    expect(component.question().options[2].label).toBe('');
    component.removeOption(2);
    expect(component.question().options.length).toBe(2);
  });

  it('refuses to remove below the 2-option minimum', () => {
    expect(component.canRemoveOption()).toBe(false);
    component.removeOption(0);
    expect(component.question().options.length).toBe(2);
  });

  it('refuses to add above the 6-option maximum', () => {
    for (let i = 0; i < 4; i++) component.addOption(); // 2 → 6
    expect(component.question().options.length).toBe(6);
    expect(component.canAddOption()).toBe(false);
    component.addOption();
    expect(component.question().options.length).toBe(6);
  });

  it('editing the label and prompt flows through the model', () => {
    component.setOptionLabel(0, 'three');
    component.setPrompt('new prompt');
    expect(component.question().options[0].label).toBe('three');
    expect(component.question().prompt).toBe('new prompt');
  });

  it('letters options A, B, C…', () => {
    expect(component.optionLetter(0)).toBe('A');
    expect(component.optionLetter(2)).toBe('C');
  });

  it('renders every text field as a wrapping textarea so long content is fully visible (no single-line clipping)', () => {
    const el = fixture.nativeElement as HTMLElement;
    const fields = [
      '[data-testid="q1-prompt"]',
      '[data-testid="q1-option-0"]',
      '[data-testid="q1-explainer-0"]',
    ].map((sel) => el.querySelector(sel));

    for (const field of fields) {
      expect(field).toBeTruthy();
      // Must be a textarea (an <input> cannot wrap → long option text clips).
      // Height is grown to scrollHeight in an afterRenderEffect (see component).
      expect((field as HTMLElement).tagName).toBe('TEXTAREA');
    }
  });
});
