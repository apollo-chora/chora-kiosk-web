import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DashAttempt, DashBank, DashboardExhibit } from '../exhibits/dashboard/dashboard-exhibit';
import { KioskLanguage, provideKioskI18n } from '../i18n/i18n';
import { provideLive } from '../live/live.providers';
import { KioskStore } from '../shell/kiosk.store';
import { BehindTheScenes, DescriptiveKind } from './behind-the-scenes';
import { XraySheetComponent } from './xray-sheet.component';

// "Behind the scenes" (K75; mockup xrayHTML, line 6283), the kinds that describe how a scene works
// rather than one run: the atlas, a Companion, the dashboard and a grade. The safety screens are said
// to be simulated on this laptop (K15); every model call leaves through the gateway (K8).
describe('Behind the scenes: the descriptive kinds', () => {
  let fixture: ComponentFixture<XraySheetComponent>;
  let el: HTMLElement;
  let store: KioskStore;
  const picked = signal<Pick<DashBank, 'key' | 'step4' | 'pictures'> | null>(null);
  const attempt = signal<Partial<DashAttempt> | null>(null);

  async function shown(kind: DescriptiveKind): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideKioskI18n(),
        ...provideLive(),
        { provide: DashboardExhibit, useValue: { picked: picked.asReadonly(), attempt: attempt.asReadonly() } },
      ],
    });
    store = TestBed.inject(KioskStore);
    await TestBed.inject(KioskLanguage).ready();
    TestBed.inject(BehindTheScenes).open(kind);
    fixture = TestBed.createComponent(XraySheetComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  beforeEach(() => {
    picked.set(null);
    attempt.set(null);
  });

  const text = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  // A row's title without its "Simulated on local" tag (the tag is spaced by CSS, mockup .tag-sim).
  const titles = () =>
    [...el.querySelectorAll('.trace li > div > b')].map((b) => [...b.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join('').trim());
  const tagged = () => [...el.querySelectorAll('.trace li')].map((li) => li.querySelector('b .tag-sim')?.textContent?.trim() ?? '');
  const classes = () => [...el.querySelectorAll('.trace li')].map((li) => li.className);

  it('opens the overlay with its kind', async () => {
    await shown('maps');
    expect(store.overlay()).toBe('xray');
    expect(TestBed.inject(BehindTheScenes).kind()).toBe('maps');
  });

  it('the atlas: five facts about a learner’s map, then the gateway’s screen, simulated', async () => {
    await shown('maps');
    expect(text('.kicker')).toBe('Behind the scenes');
    expect(text('h2')).toBe('How a learner’s map works');
    expect(titles()).toEqual([
      'A goal is a map',
      'Suggestions come from a Companion',
      'Courses share your ideas',
      'Six rungs',
      'Practice questions are written for you',
      'Safety screen at the model gateway',
    ]);
    expect(tagged()).toEqual(['', '', '', '', '', 'Simulated on local']);
    expect(classes().at(-1)).toBe('sim');
    expect(text('.trace li:last-child .tag-sim')).toBe('Simulated on local');
    // W9 (K138 pass 4): every row names a role and a provider only (F38), so the footer claims no model that ran.
    expect(text('.trace-foot')).toBe('Every model call leaves through one door: the model gateway. Model names come from this computer’s model config file.');
  });

  it('a Companion: the gateway’s screen, then what it does, naming the explorer by its role, never a model id', async () => {
    await shown('comp');
    expect(text('h2')).toBe('How a Companion works');
    expect(titles()).toEqual(['Safety screen at the model gateway', 'Suggests from a won idea', 'Quizzes on your map', 'Greets you with your daily dose', 'Read my marked test', 'Grows with you']);
    expect(tagged()).toEqual(['Simulated on local', '', '', '', '', '']);
    // K158 D2: the analyser's paper is not screened on the local edition, and says so (never a pass).
    expect(text('.trace li:nth-child(5) > div > span')).toBe(
      'The paper was not screened: this local edition skips the image safety check, takes only the prepared papers, and reads only the essay live. (Companion AI · Google Vertex AI)',
    );
    expect(text('.trace li:nth-child(2) > div > span')).toBe('Suggestions grow only from ideas you have won, written through the model gateway. (explorer model · Ollama)');
  });

  it('a grade: the input and output screens simulated around the evaluator and the moderator, then a person', async () => {
    await shown('grade');
    expect(text('h2')).toBe('How a grade is made');
    expect(titles()).toEqual(['Safety screen (input)', 'Evaluator AI', 'Moderator AI', 'Safety screen (output)', 'A person reviews and releases']);
    expect(tagged()).toEqual(['Simulated on local', '', '', 'Simulated on local', '']);
    expect(text('.trace li:nth-child(1) > div > span')).toContain('guardrail_pre');
    expect(text('.trace li:nth-child(2) > div > span')).toBe('Scores the answer against the rubric the question was published with. (oe_evaluator)');
    expect(text('.trace li:nth-child(4) > div > span')).toContain('guardrail_post');
  });

  it('the dashboard before a take: rules pick the cards, the greeting by AI, banks feed assessments', async () => {
    await shown('dash');
    expect(text('h2')).toBe('How your dashboard works');
    expect(titles()).toEqual(['Today’s cards are picked by rules', 'Safety screen at the model gateway', 'The greeting is written by AI', 'Banks feed assessments']);
    expect(tagged()[1]).toBe('Simulated on local');
  });

  it('the water bank, which holds the step 4 copy, adds where its pictures come from (ruling on T3.11 Q1, K119, K66)', async () => {
    picked.set({ key: 'water', step4: true, pictures: true });
    await shown('dash');
    expect(titles()).toEqual(['Today’s cards are picked by rules', 'Safety screen at the model gateway', 'The greeting is written by AI', 'Banks feed assessments', 'Pictures']);
    expect(text('.trace li:last-child > div > span')).toBe('Q2 is a copy of the AI’s step 4 draft and its diagram, prepared for the demo; Q3’s picture is from the image model. Both carry the AI mark.');
    picked.set({ key: 'nature', step4: false, pictures: false });
    fixture.detectChanges();
    expect(titles().at(-1)).toBe('Banks feed assessments');
  });

  it('W27 (K159): another bank with pictures says where they come from in its own words', async () => {
    picked.set({ key: 'hawker', step4: false, pictures: true });
    await shown('dash');
    expect(titles().at(-1)).toBe('Pictures');
    expect(text('.trace li:last-child > div > span')).toBe('Q2’s and Q3’s pictures were made by the image model for this demo, and both carry the AI mark.');
  });

  it('the dashboard after a submit: the rules marked the choices; an open answer waits for the grading crew, then shows released', async () => {
    picked.set({ key: 'water', step4: true, pictures: true });
    attempt.set({ status: 'submitted', held: true, grading: { state: 'SUBMITTED' } as DashAttempt['grading'], take: { questions: [{ question_type: 'mcq', test_set_question_id: 'tsq-1' }, { question_type: 'oe', test_set_question_id: 'tsq-3' }] } as unknown as DashAttempt['take'], answers: new Map([['tsq-1', 'o2'], ['tsq-3', 'Four taps.']]) });
    await shown('dash');
    expect(titles().slice(-3)).toEqual(['Pictures', 'Multiple choice marked by rules', 'Open answer: AI grading, then a person']);
    expect(classes().at(-1)).toBe('wait');
    expect(text('.trace li:last-child > div > span')).toBe('In the full platform the grading crew starts by itself when you submit. Here it runs only when you send your answer, in “Get an answer graded”.');
    attempt.update((a) => ({ ...a, grading: { state: 'RELEASED' } as DashAttempt['grading'] }));
    fixture.detectChanges();
    expect(classes().at(-1)).toBe('ok');
    expect(text('.trace li:last-child > div > span')).toBe('Scored by the grading crew, checked, and released by you as the instructor.');
  });

  it('a take with no open answer written shows the rules’ marking only', async () => {
    picked.set({ key: 'nature', step4: false, pictures: false });
    attempt.set({ status: 'submitted', held: false, grading: { state: 'GRADED' } as DashAttempt['grading'], take: { questions: [{ question_type: 'mcq', test_set_question_id: 'tsq-1' }, { question_type: 'oe', test_set_question_id: 'tsq-3' }] } as unknown as DashAttempt['take'], answers: new Map([['tsq-1', 'o2'], ['tsq-3', '  ']]) });
    await shown('dash');
    expect(titles().at(-1)).toBe('Multiple choice marked by rules');
  });

  it('Open the Engine Room closes the panel and opens the door; Close only closes', async () => {
    await shown('grade');
    store.go('grade');
    (el.querySelector('[data-act="xrayEngine"]') as HTMLButtonElement).click();
    expect(store.overlay()).toBeNull();
    expect(store.scene()).toBe('engine');
    TestBed.inject(BehindTheScenes).open('grade');
    fixture.detectChanges();
    (el.querySelector('[data-act="closeOverlay"]') as HTMLButtonElement).click();
    expect(store.overlay()).toBeNull();
    expect(store.scene()).toBe('engine');
  });

  it('reads in Chinese', async () => {
    await shown('maps');
    await TestBed.inject(KioskLanguage).setLang('zh');
    fixture.detectChanges();
    expect(text('h2')).not.toBe('How a learner’s map works');
    expect(text('.trace li:last-child .tag-sim')).not.toBe('Simulated on local');
    expect(text('.trace-foot')).toContain('模型名称来自这台电脑的模型配置文件。');
    expect(text('.trace-foot')).not.toContain('实际运行');
  });
});
