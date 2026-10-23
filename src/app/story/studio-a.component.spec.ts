import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../i18n/i18n';
import type { WordsParams, WordsResult } from '../live/kinds/words.live';
import { provideLive } from '../live/live.providers';
import { LIVE_EXECUTORS, LiveAvailability, LiveService, type LiveExecutor } from '../live/live.service';
import { StudioAComponent } from './studio-a.component';
import { TeacherStudio } from './teacher-studio';
import { V1_OPTIONS, V1_STEM, candidate, jobRead, jobUrl, opt, studioManifest } from './studio-world.testing';
import { BehindTheScenes } from '../xray/behind-the-scenes';

const R_OPTIONS = [opt('o1', 'Microfiltration'), opt('o2', 'Reverse osmosis'), opt('o3', 'UV disinfection', true, 'UV light damages the germs’ DNA.'), opt('o4', 'Sedimentation')];

// Step 4a on screen (mockup studioAHTML, lines 4326 to 4342): the draft with its key, the
// critic's own notes, the append-only history with record times (K101), the word chips, the
// typed change and the LIVE redo (K35), and the hand edit in production's question editor.
describe('StudioAComponent (step 4a, the words)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<StudioAComponent>;
  let el: HTMLElement;
  let pending: { resolve: (r: WordsResult) => void; params: WordsParams }[];

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  async function shown(reviewing = false): Promise<void> {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-30T02:05:00Z'));
    pending = [];
    const words: LiveExecutor<WordsParams, WordsResult> = {
      run: (params) => new Promise<WordsResult>((resolve) => pending.push({ resolve, params })),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideKioskI18n(),
        ...provideLive(),
        { provide: LIVE_EXECUTORS, useValue: { words } },
        { provide: LiveAvailability, useValue: { text: signal(true).asReadonly(), picture: signal(true).asReadonly() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(KioskLanguage).ready();
    fixture = TestBed.createComponent(StudioAComponent);
    fixture.componentRef.setInput('reviewing', reviewing);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(studioManifest());
    await vi.waitFor(() => http.expectOne(jobUrl('j-v1')).flush(jobRead('j-v1', V1_STEM)));
    await vi.waitFor(() => expect(TestBed.inject(TeacherStudio).status()).toBe('ready'));
    await settle();
  }

  afterEach(() => {
    TestBed.inject(TeacherStudio).forget();
    TestBed.inject(LiveService).endSession();
    vi.useRealTimers();
  });

  const text = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const texts = (sel: string) => [...el.querySelectorAll(sel)].map((n) => n.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  const click = (sel: string) => (el.querySelector(sel) as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const options = () => [...el.querySelectorAll('.draft-opts .dopt')].map((d) => [...d.children].map((c) => c.textContent?.trim()).join(' '));
  const chipButton = (label: string) => [...el.querySelectorAll<HTMLButtonElement>('#chips .chip')].find((b) => b.textContent?.trim() === label) as HTMLButtonElement;

  async function pressScenario(): Promise<void> {
    chipButton('Turn it into a real-life scenario').click();
    await vi.waitFor(() =>
      http.expectOne(jobUrl('j-r')).flush(jobRead('j-r', 'Which stage destroys germs that slip through the membranes?', R_OPTIONS, { accepted: true, notes: '' })),
    );
    await vi.waitFor(() => expect(TestBed.inject(TeacherStudio).revisions().length).toBe(1));
    await settle();
  }

  it('v1: the writer AI’s draft with its key, the critic’s own notes and the prepared record’s time', async () => {
    await shown();
    expect(text('.studio-head .kicker')).toBe('Step 4 of 5 · Be the teacher · the words');
    expect(text('.studio-head h2')).toBe('The AI drafted this question. Check its words.');
    expect(text('.draft .label')).toContain('Draft by the writer AI · waiting for your review');
    expect(text('.draft .stem')).toBe(V1_STEM);
    expect(options()).toEqual(['A Microfiltration', 'B Reverse osmosis', 'C UV disinfection Answer', 'D Chlorination']);
    expect(el.querySelector('.dopt.key')?.textContent).toContain('UV disinfection');
    expect(el.querySelector('.d-explain')).toBeNull();
    expect(text('.pic-next')).toBe('Its picture comes next.');
    expect(text('.critic')).toBe('Critic AI: accepted. Option D, chlorination, also destroys germs.');
    expect(el.querySelector('.critic')?.classList.contains('ok')).toBe(false);
    expect(texts('#hist .h-row')).toEqual(['v1 · Drafted by the writer AI prepared 20 Oct, 13:47']);
    // W35: the mark sits in its stamp (the row's second grid column), never alone on a line of its own.
    expect(el.querySelectorAll('#hist .h-row > span > kiosk-prepared-info button[data-act="preparedInfo"]').length).toBe(1);
    expect(el.querySelectorAll('#hist .h-row > kiosk-prepared-info').length).toBe(0);
    expect(texts('#chips .chip')).toEqual(['Turn it into a real-life scenario', 'Make the question simpler', 'Add a one-line explanation']);
    // K75: the words card asks how the draft was made (mockup studioAHTML's q.how).
    const how = el.querySelector('.imgcard.words .head [data-act="xray"]') as HTMLButtonElement;
    expect(how.textContent?.trim()).toBe('How was this made?');
    expect(how.getAttribute('data-kind')).toBe('draft');
  });

  it('a chip shows its prepared draft as a new version, stamped with the visitor’s time and the record’s', async () => {
    await shown();
    await pressScenario();
    expect(text('.draft .label')).toContain('New draft by the writer AI · waiting for your review');
    expect(options()[3]).toBe('D Sedimentation');
    expect(text('.d-explain')).toBe('Why: UV light damages the germs’ DNA.');
    expect(text('.critic')).toBe('Critic AI re-checked the new draft: accepted.');
    expect(el.querySelector('.critic')?.classList.contains('ok')).toBe(true);
    expect(chipButton('Turn it into a real-life scenario').classList.contains('used')).toBe(true);
    expect(chipButton('Turn it into a real-life scenario').disabled).toBe(true);
    expect(texts('#hist .h-row.you')).toEqual(['v2 · Words · You: “Turn it into a real-life scenario” applied 10:05 · made 20 Oct, 13:48']);
    // W35: one rule for every prepared stamp (V11): the applied prepared version's stamp carries the mark too.
    expect(el.querySelectorAll('#hist .h-row.you > span > kiosk-prepared-info button[data-act="preparedInfo"]').length).toBe(1);
    expect(text('#revstatus .badge')).toBe('New draft written from your instruction');
    expect(text('#revstatus .stamp')).toBe('Prepared 20 Oct, 13:48');
    expect(text('#revstatus .live-btn .live-label')).toBe('Redo it');
    (el.querySelector('.imgcard.words .head [data-act="xray"]') as HTMLButtonElement).click();
    expect(TestBed.inject(BehindTheScenes).kind()).toBe('words');
  });

  it('a hand edit in production’s editor is the teacher’s own version, never re-checked', async () => {
    await shown();
    click('.draft .he-open');
    await settle();
    expect(el.querySelector('form.hand-edit chora-question-editor')).not.toBeNull();
    expect(el.querySelector('form.ask')).toBeNull();
    const stem = el.querySelector<HTMLTextAreaElement>('form.hand-edit textarea') as HTMLTextAreaElement;
    stem.value = 'Which stage kills germs left after the membranes?';
    stem.dispatchEvent(new Event('input'));
    await settle();
    (el.querySelector('form.hand-edit') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await settle();
    expect(el.querySelector('form.hand-edit')).toBeNull();
    expect(text('.draft .stem')).toBe('Which stage kills germs left after the membranes?');
    expect(text('.draft .label')).toContain('Edited by you · waiting for your review');
    expect(text('.critic')).toBe('Critic AI last checked v1. Hand edits are not re-checked.');
    expect(texts('#hist .h-row.you')).toEqual(['v2 · Words · Edited by you 10:05 · by hand']);
    expect(el.querySelector('#hist .h-row.you kiosk-prepared-info')).toBeNull();
    // R5: "Redo it" stays greyed: it would run the last AI change again and throw the hand edit away.
    expect((el.querySelector('#revstatus .live-btn') as HTMLButtonElement).disabled).toBe(true);
    expect(el.querySelector('#revstatus .stamp')).toBeNull();
  });

  it('while the teacher edits by hand, no chip can run', async () => {
    await shown();
    click('.draft .he-open');
    await settle();
    expect([...el.querySelectorAll<HTMLButtonElement>('#chips .chip')].map((b) => b.disabled)).toEqual([true, true, true]);
  });

  it('Cancel leaves the draft as it was', async () => {
    await shown();
    click('.draft .he-open');
    await settle();
    click('form.hand-edit [data-act="handCancel"]');
    await settle();
    expect(el.querySelector('form.hand-edit')).toBeNull();
    expect(texts('#hist .h-row.you')).toEqual([]);
  });

  it('a typed change goes to LIVE words and lands as a live version', async () => {
    await shown();
    const input = el.querySelector<HTMLInputElement>('#revtextinput') as HTMLInputElement;
    input.value = 'Use the word germs only once';
    input.dispatchEvent(new Event('input'));
    (el.querySelector('form.ask') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect(pending.length).toBe(1));
    await settle();
    expect(el.querySelector('#revstatus .live-status')).not.toBeNull();
    pending[0].resolve({ jobId: 'j-t', draft: candidate('j-t', 'Typed stem?') as WordsResult['draft'], critic: null, trace: null, modelUsed: null });
    await vi.waitFor(() => expect(TestBed.inject(TeacherStudio).revisions().length).toBe(1));
    await settle();
    expect(text('.draft .stem')).toBe('Typed stem?');
    expect(texts('#hist .h-row.you')).toEqual(['v2 · Words · You: “Use the word germs only once” 10:05 · live']);
    expect(el.querySelector('#hist .h-row.you kiosk-prepared-info')).toBeNull();
    expect(text('#revstatus .stamp')).toBe('Live, just now');
    expect(el.querySelector('.critic')).toBeNull();
    expect(input.value).toBe('');
  });

  it('a prepared draft that cannot be read says so on screen', async () => {
    await shown();
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    chipButton('Add a one-line explanation').click();
    await vi.waitFor(() => http.expectOne(jobUrl('j-e')).flush('boom', { status: 500, statusText: 'Server Error' }));
    await vi.waitFor(() => expect(TestBed.inject(TeacherStudio).change().state).toBe('failed'));
    await settle();
    expect(text('#revstatus .msg-error')).toBe('This step could not reach Chora. Please ask the presenter.');
    err.mockRestore();
  });

  it('the history keeps the last three versions and counts the earlier ones', async () => {
    await shown();
    const studio = TestBed.inject(TeacherStudio);
    for (const p of ['One?', 'Two?', 'Three?', 'Four?']) {
      studio.startEdit();
      studio.saveEdit({ question_type: 'mcq', prompt: p, options: V1_OPTIONS.map((o) => ({ ...o })), model_answer: '' });
    }
    await settle();
    expect(texts('#hist .h-row.more')).toEqual(['1 earlier version']);
    expect(texts('#hist .h-row.you').map((r) => r.slice(0, 2))).toEqual(['v3', 'v4', 'v5']);
  });

  it('reviewed (K46): read-only, the words the visitor directed, no form and no editing', async () => {
    await shown(true);
    expect(el.querySelector('.studio')?.classList.contains('ro')).toBe(true);
    expect(text('.rv-note')).toBe('These are the words you directed');
    expect(el.querySelector('form.ask')).toBeNull();
    expect(el.querySelector('.he-open')).toBeNull();
    expect([...el.querySelectorAll<HTMLButtonElement>('#chips .chip')].every((b) => b.disabled)).toBe(true);
  });

  describe('K189 (3), K186: a LIVE button with nothing to act on is greyed, and none repeats a live result', () => {
    const send = () => el.querySelector('form.ask button[data-act="live"]') as HTMLButtonElement;
    const redo = () => el.querySelector<HTMLButtonElement>('#revstatus .live-btn');
    async function type(words: string): Promise<void> {
      const input = el.querySelector<HTMLInputElement>('#revtextinput') as HTMLInputElement;
      input.value = words;
      input.dispatchEvent(new Event('input'));
      await settle();
    }
    async function typedLive(words: string, stem: string, n: number): Promise<void> {
      await type(words);
      (el.querySelector('form.ask') as HTMLFormElement).dispatchEvent(new Event('submit'));
      await vi.waitFor(() => expect(pending.length).toBe(n));
      pending[n - 1].resolve({ jobId: `j-t${n}`, draft: candidate(`j-t${n}`, stem) as WordsResult['draft'], critic: null, trace: null, modelUsed: null });
      await vi.waitFor(() => expect(text('.draft .stem')).toBe(stem));
      await settle();
    }

    it('W58: "Send to the AI" is greyed until the box holds words; "Redo it" shows greyed until a change is made', async () => {
      await shown();
      expect(send().disabled).toBe(true);
      await type('   ');
      expect(send().disabled).toBe(true);
      await type('Use the word germs only once');
      expect(send().disabled).toBe(false);
      expect(text('#revstatus .live-btn .live-label')).toBe('Redo it');
      expect(redo()?.disabled).toBe(true);
      expect(el.querySelector('#revstatus .stamp')).toBeNull();
      expect(el.querySelector('#revstatus .badge')).toBeNull();
    });

    it('W59: a prepared change offers one live redo; once it lands the button is gone for it', async () => {
      await shown();
      await pressScenario();
      expect(redo()?.disabled).toBe(false);
      (redo() as HTMLButtonElement).click();
      await vi.waitFor(() => expect(pending.length).toBe(1));
      pending[0].resolve({ jobId: 'j-redo', draft: candidate('j-redo', 'Redone stem?') as WordsResult['draft'], critic: null, trace: null, modelUsed: null });
      await vi.waitFor(() => expect(text('.draft .stem')).toBe('Redone stem?'));
      await settle();
      expect(redo()).toBeNull();
      expect(text('#revstatus .stamp')).toBe('Live, just now');
      expect(el.textContent).not.toContain('Do it again');
    });

    it('K189 (3): a different typed change is a new request; the same words again are the same change, greyed', async () => {
      await shown();
      await typedLive('Use the word germs only once', 'Typed stem?', 1);
      expect(redo()).toBeNull();
      expect(text('#revstatus .stamp')).toBe('Live, just now');
      await type('Use the word germs only once');
      expect(send().disabled).toBe(true);
      await typedLive('Name the two membranes', 'Second typed stem?', 2);
      expect(texts('#hist .h-row.you').map((r) => r.split(' · ')[0])).toEqual(['v2', 'v3']);
    });

    it('R5: a hand edit after a live change leaves no live stamp on the teacher’s own words', async () => {
      await shown();
      await typedLive('Use the word germs only once', 'Typed stem?', 1);
      click('.draft .he-open');
      await settle();
      const stem = el.querySelector<HTMLTextAreaElement>('form.hand-edit textarea') as HTMLTextAreaElement;
      stem.value = 'My own stem?';
      stem.dispatchEvent(new Event('input'));
      await settle();
      (el.querySelector('form.hand-edit') as HTMLFormElement).dispatchEvent(new Event('submit'));
      await settle();
      expect(el.querySelector('#revstatus .stamp')).toBeNull();
      expect(redo()?.disabled).toBe(true);
    });
  });
});
