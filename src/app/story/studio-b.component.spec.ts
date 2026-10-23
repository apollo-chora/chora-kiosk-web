import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../i18n/i18n';
import type { PictureParams, PictureResult } from '../live/kinds/picture.live';
import { provideLive } from '../live/live.providers';
import { LIVE_EXECUTORS, LiveAvailability, LiveService, type LiveExecutor } from '../live/live.service';
import { StudioBComponent } from './studio-b.component';
import { TeacherStudio } from './teacher-studio';
import { V1_STEM, jobRead, jobUrl, studioManifest } from './studio-world.testing';
import { BehindTheScenes } from '../xray/behind-the-scenes';
import { VISIT_RANDOM } from '../shared/visit-order';
import { seededRandom } from '../shared/visit-order.testing';

// Step 4b on screen (mockup studioBHTML, lines 4343 to 4361): the question the visitor checked,
// the picture with its mode and the AI mark, the critic's first note until any picture change
// is on screen (K155), the shared history, the SET chips then the restyles, the typed change and the
// LIVE redo on the picture's LIVE row, and the kept stamp.
describe('StudioBComponent (step 4b, the picture)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<StudioBComponent>;
  let el: HTMLElement;
  let pics: { resolve: (r: PictureResult) => void; reject: (e: unknown) => void; params: PictureParams }[];

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  async function shown(reviewing = false): Promise<void> {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-30T02:05:00Z'));
    pics = [];
    const picture: LiveExecutor<PictureParams, PictureResult> = {
      run: (params) => new Promise<PictureResult>((resolve, reject) => pics.push({ resolve, reject, params })),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideKioskI18n(),
        ...provideLive(),
        { provide: LIVE_EXECUTORS, useValue: { picture } },
        { provide: LiveAvailability, useValue: { text: signal(true).asReadonly(), picture: signal(true).asReadonly() } },
        // K149 draws orders for practice questions; step 4's draft must never come through it.
        { provide: VISIT_RANDOM, useValue: seededRandom(7) },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(KioskLanguage).ready();
    const studio = TestBed.inject(TeacherStudio);
    const done = studio.load();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(studioManifest());
    await vi.waitFor(() => http.expectOne(jobUrl('j-v1')).flush(jobRead('j-v1', V1_STEM)));
    await done;
    fixture = TestBed.createComponent(StudioBComponent);
    fixture.componentRef.setInput('reviewing', reviewing);
    el = fixture.nativeElement as HTMLElement;
    await settle();
  }

  afterEach(() => {
    TestBed.inject(TeacherStudio).forget();
    TestBed.inject(LiveService).endSession();
    vi.useRealTimers();
  });

  const text = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const texts = (sel: string) => [...el.querySelectorAll(sel)].map((n) => n.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  const img = () => el.querySelector<HTMLImageElement>('#canvas img') as HTMLImageElement;
  const chip = (label: string) => [...el.querySelectorAll<HTMLButtonElement>('#chips .chip')].find((b) => b.textContent?.trim() === label) as HTMLButtonElement;
  async function press(label: string): Promise<void> {
    chip(label).click();
    await settle();
  }

  it('the draft’s own diagram, its mode and the AI mark; the critic’s first note; the diagram chips', async () => {
    await shown();
    expect(text('.studio-head .kicker')).toBe('Step 4 of 5 · Be the teacher · the picture');
    expect(text('.draft .label')).toBe('The question you checked · now direct its picture');
    expect(text('.draft .stem')).toBe(V1_STEM);
    expect(img().getAttribute('src')).toBe('/pictures/h4.png');
    expect(img().getAttribute('alt')).toBe('Picture for the question: Diagram');
    expect(text('.imgcard .mode-tag')).toBe('Diagram');
    expect(text('#canvas .ai-mark')).toBe('Generated with AI');
    expect(text('.critic')).toBe('Critic AI: accepted. Option D, chlorination, also destroys germs.');
    expect(el.querySelector('.critic')?.classList.contains('fixed')).toBe(false);
    expect(text('.ask-zone .q')).toBe('Tell the AI what to change');
    expect(texts('#chips .chip')).toEqual(['Add the UV step it missed', 'Show where NEWater goes', 'Turn it into an illustration']);
    // K75: the picture card asks how it was made (mockup studioBHTML's q.how).
    expect(el.querySelector('.imgcard .head [data-act="xray"]')?.getAttribute('data-kind')).toBe('draft');
  });

  it('a chip shows its prepared picture: the picture note replaces the critic’s, the history and the LIVE row say where it came from', async () => {
    await shown();
    const reveal = vi.spyOn(Element.prototype, 'scrollIntoView');
    await press('Add the UV step it missed');
    // K138 W7: the newest version's row reveals itself inside the draft card, which scrolls (the real draft is taller).
    expect(reveal.mock.contexts).toContain(el.querySelector('#hist .h-row.you:last-child'));
    reveal.mockRestore();
    expect(img().getAttribute('src')).toBe('/pictures/pic.uv.png');
    expect(el.querySelector('.critic')?.classList.contains('fixed')).toBe(true);
    // K155: the golden run's critic accepted the draft and asked for nothing, so the note claims no first note.
    expect(text('.critic')).toBe('Picture changes are not re-checked by the critic AI.');
    expect(texts('#hist .h-row.you')).toEqual(['v2 · Picture · You: “Add the UV step it missed” applied 10:05 · made 20 Oct, 14:00']);
    expect(el.querySelectorAll('#hist .h-row.you > span > kiosk-prepared-info button[data-act="preparedInfo"]').length).toBe(1);
    expect(text('#revstatus .badge')).toBe('Revised at your direction');
    expect(text('#revstatus .stamp')).toBe('Prepared 20 Oct, 14:00');
    expect(text('#revstatus .live-btn .live-label')).toBe('Redo it');
    expect(chip('Add the UV step it missed').disabled).toBe(true);
    (el.querySelector('.imgcard .head [data-act="xray"]') as HTMLButtonElement).click();
    expect(TestBed.inject(BehindTheScenes).kind()).toBe('rev');
  });

  it('K155 (the orchestrator’s Q3): any picture change shows the picture note, whichever chip came first', async () => {
    await shown();
    await press('Show where NEWater goes');
    expect(el.querySelector('.critic')?.classList.contains('fixed')).toBe(true);
    expect(text('.critic')).toBe('Picture changes are not re-checked by the critic AI.');
  });

  it('K155: in Chinese the note is the first sentence only', async () => {
    await shown();
    await press('Add the UV step it missed');
    await TestBed.inject(KioskLanguage).setLang('zh');
    await settle();
    expect(text('.critic')).toBe('配图的修改不会再经过审题 AI 审核。');
  });

  it('the illustration turns the chips into restyles', async () => {
    await shown();
    await press('Turn it into an illustration');
    expect(text('.imgcard .mode-tag')).toBe('Illustration');
    expect(text('.ask-zone .q')).toBe('Tell the AI how to restyle it');
    expect(texts('#chips .chip')).toEqual(['Make it a pencil sketch', 'Make it photorealistic']);
    await press('Make it photorealistic');
    expect(text('.imgcard .mode-tag')).toBe('Photorealistic');
    expect(img().getAttribute('src')).toBe('/pictures/pic.illus.photo.png');
    expect(chip('Make it photorealistic').disabled).toBe(true);
  });

  it('K203 (W87): after the first photo, the caption invites a better photo and the box holds the request, ready to send', async () => {
    await shown();
    expect(el.querySelector('.pic-tanks')).toBeNull();
    await press('Turn it into an illustration');
    expect(el.querySelector('.pic-tanks')).toBeNull();
    await press('Make it photorealistic');
    expect(text('.pic-tanks')).toBe(
      'Look closely at the filters. A real NEWater plant uses large steel tanks and membrane units, not glasses or sponges. Tell the AI to fix it: we have started the request for you.',
    );
    const input = el.querySelector<HTMLInputElement>('#revinput') as HTMLInputElement;
    expect(input.value).toBe('Show steel tanks and membrane units instead of the glass and sponges');
    expect((el.querySelector('form.ask [data-act="live"]') as HTMLButtonElement).disabled).toBe(false);
    // The caption sits above the box it speaks of.
    expect((el.querySelector('.pic-tanks') as Element).compareDocumentPosition(el.querySelector('form.ask') as Element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    (el.querySelector('form.ask') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect(pics.length).toBe(1));
    expect(pics[0].params.prompt).toBe('Show steel tanks and membrane units instead of the glass and sponges');
    await settle();
    expect(el.querySelector('.pic-tanks')).toBeNull();
  });

  it('K203: in Chinese the caption is translated and the request stays English (content is English only)', async () => {
    await shown();
    await TestBed.inject(KioskLanguage).setLang('zh');
    await settle();
    await press('改成插画');
    await press('改成写实照片风格');
    expect(text('.pic-tanks')).toBe('仔细看看过滤的部分。真正的新生水厂用的是大型钢罐和膜组件，而不是玻璃杯或海绵。请 AI 改正它：我们已经帮你写好了开头。');
    expect((el.querySelector<HTMLInputElement>('#revinput') as HTMLInputElement).value).toBe('Show steel tanks and membrane units instead of the glass and sponges');
  });

  it('a typed change goes to LIVE picture and shows the new picture as live', async () => {
    await shown();
    const input = el.querySelector<HTMLInputElement>('#revinput') as HTMLInputElement;
    input.value = 'Thicker arrows';
    input.dispatchEvent(new Event('input'));
    (el.querySelector('form.ask') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect(pics.length).toBe(1));
    await settle();
    expect(el.querySelector('#revstatus .live-status')).not.toBeNull();
    pics[0].resolve({ regenJobId: 'r', imageUrl: '/pictures/live.png', imageGcsUri: 'gs://kiosk/live.png', mode: 'mermaid' });
    await vi.waitFor(() => expect(TestBed.inject(TeacherStudio).revisions().length).toBe(1));
    await settle();
    expect(img().getAttribute('src')).toBe('/pictures/live.png');
    expect(texts('#hist .h-row.you')).toEqual(['v2 · Picture · You: “Thicker arrows” 10:05 · live']);
    expect(text('#revstatus .stamp')).toBe('Live, just now');
    // K155 Q3: a typed change that stays a diagram is a picture change too.
    expect(text('.critic')).toBe('Picture changes are not re-checked by the critic AI.');
    // W10: a typed change that stays a diagram keeps its badge.
    expect(text('.imgcard .mode-tag')).toBe('Diagram');
  });

  describe('W10: the badge is true of the picture on screen', () => {
    async function typedScene(words: string, url: string): Promise<void> {
      const input = el.querySelector<HTMLInputElement>('#revinput') as HTMLInputElement;
      input.value = words;
      input.dispatchEvent(new Event('input'));
      (el.querySelector('form.ask') as HTMLFormElement).dispatchEvent(new Event('submit'));
      await vi.waitFor(() => expect(pics.length).toBeGreaterThan(0));
      pics[pics.length - 1].resolve({ regenJobId: 'r', imageUrl: url, imageGcsUri: `gs://kiosk${url}`, mode: 'scene' });
      await vi.waitFor(() => expect(img().getAttribute('src')).toBe(url));
      await settle();
    }

    it('a typed change that ends in a scene reads "Picture", not the style it started from; both restyles stay open', async () => {
      await shown();
      await press('Turn it into an illustration');
      await press('Make it a pencil sketch');
      expect(text('.imgcard .mode-tag')).toBe('Pencil sketch');
      await typedScene('change it to crayon art', '/pictures/live-crayon.png');
      expect(text('.imgcard .mode-tag')).toBe('Picture');
      expect(img().getAttribute('alt')).toBe('Picture for the question: Picture');
      // The picture is crayon now, so a pencil sketch can be asked for again.
      expect(chip('Make it a pencil sketch').disabled).toBe(false);
      expect(chip('Make it photorealistic').disabled).toBe(false);
      await TestBed.inject(KioskLanguage).setLang('zh');
      await settle();
      expect(text('.imgcard .mode-tag')).toBe('配图');
    });

    it('a chip after it keeps its own label (K148: the chip goes live with its words)', async () => {
      await shown();
      await press('Turn it into an illustration');
      await typedScene('change it to crayon art', '/pictures/live-crayon.png');
      await press('Make it photorealistic');
      await vi.waitFor(() => expect(pics.length).toBe(2));
      pics[1].resolve({ regenJobId: 'r2', imageUrl: '/pictures/live-photo.png', imageGcsUri: 'gs://kiosk/live-photo.png', mode: 'scene' });
      await vi.waitFor(() => expect(img().getAttribute('src')).toBe('/pictures/live-photo.png'));
      await settle();
      expect(text('.imgcard .mode-tag')).toBe('Photorealistic');
    });
  });

  describe('K147: the LIVE row redoes only a prepared picture', () => {
    // A redo re-runs the last instruction on the same source, so after a live change the image
    // model draws a near-identical picture (the owner's two presses, 19 Oct). The chips and
    // "Send to the AI" stay; a prepared result can always be redone live (K42).
    async function typedLive(words: string, url: string): Promise<void> {
      const input = el.querySelector<HTMLInputElement>('#revinput') as HTMLInputElement;
      input.value = words;
      input.dispatchEvent(new Event('input'));
      (el.querySelector('form.ask') as HTMLFormElement).dispatchEvent(new Event('submit'));
      await vi.waitFor(() => expect(pics.length).toBeGreaterThan(0));
      pics[pics.length - 1].resolve({ regenJobId: 'r', imageUrl: url, imageGcsUri: `gs://kiosk${url}`, mode: 'mermaid' });
      await vi.waitFor(() => expect(img().getAttribute('src')).toBe(url));
      await settle();
    }

    it('after a typed live change: the row says live, just now, and offers no redo; chips and the typed change stay', async () => {
      await shown();
      await typedLive('Thicker arrows', '/pictures/live.png');
      expect(text('#revstatus .stamp')).toBe('Live, just now');
      expect(el.querySelector('#revstatus .live-btn')).toBeNull();
      expect(chip('Add the UV step it missed').disabled).toBe(false);
      // W58: "Send to the AI" waits for new words; a different typed change is a new request (K189).
      const send = el.querySelector<HTMLButtonElement>('form.ask .live-btn') as HTMLButtonElement;
      expect(send.disabled).toBe(true);
      await typedLive('Label each stage', '/pictures/live-2.png');
      expect(pics.length).toBe(2);
      expect(text('#revstatus .stamp')).toBe('Live, just now');
    });

    it('W58: "Send to the AI" is greyed until the box holds words; "Redo it" shows greyed until a change is made', async () => {
      await shown();
      const send = el.querySelector<HTMLButtonElement>('form.ask .live-btn') as HTMLButtonElement;
      expect(send.disabled).toBe(true);
      const input = el.querySelector<HTMLInputElement>('#revinput') as HTMLInputElement;
      input.value = 'Thicker arrows';
      input.dispatchEvent(new Event('input'));
      await settle();
      expect(send.disabled).toBe(false);
      expect(text('#revstatus .live-btn .live-label')).toBe('Redo it');
      expect((el.querySelector('#revstatus .live-btn') as HTMLButtonElement).disabled).toBe(true);
      expect(el.querySelector('#revstatus .stamp')).toBeNull();
    });

    it('a prepared picture keeps its LIVE redo (K42); once the redo lands live, the button goes away', async () => {
      await shown();
      await press('Add the UV step it missed');
      const redo = el.querySelector<HTMLButtonElement>('#revstatus .live-btn') as HTMLButtonElement;
      expect(redo.disabled).toBe(false);
      redo.click();
      await vi.waitFor(() => expect(pics.length).toBe(1));
      pics[0].resolve({ regenJobId: 'r', imageUrl: '/pictures/redo.png', imageGcsUri: 'gs://kiosk/redo.png', mode: 'mermaid' });
      await vi.waitFor(() => expect(img().getAttribute('src')).toBe('/pictures/redo.png'));
      await settle();
      expect(text('#revstatus .stamp')).toBe('Live, just now');
      expect(el.querySelector('#revstatus .live-btn')).toBeNull();
    });

    it('K148: a chip whose live call fails shows its prepared picture, says so, and offers Try again', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await shown();
      await typedLive('Thicker arrows', '/pictures/live.png');
      await press('Show where NEWater goes');
      await vi.waitFor(() => expect(pics.length).toBe(2));
      pics[1].reject(new Error('regenerate r failed: image_regen_author_empty'));
      await vi.waitFor(() => expect(img().getAttribute('src')).toBe('/pictures/pic.where.png'));
      await settle();
      expect(text('#revstatus .stamp')).toBe('Showing the prepared result: the live call failed');
      expect(text('#revstatus .live-btn .live-label')).toBe('Try again');
      expect(el.querySelector('#revstatus .msg-error')).toBeNull();
      err.mockRestore();
    });
  });

  it('K149 never reorders step 4’s draft: its options keep their stored order, the key where the critic says', async () => {
    await shown();
    const studio = TestBed.inject(TeacherStudio);
    const stored = studio.draft()?.question.options.map((o) => o.label);
    expect([...el.querySelectorAll('.draft .dopt')].map((d) => d.querySelectorAll('span')[1]?.textContent?.trim())).toEqual(stored);
  });

  it('once kept, the draft says so', async () => {
    await shown();
    const studio = TestBed.inject(TeacherStudio);
    const kept = studio.keep();
    http.expectOne(`${jobUrl('j-v1')}/accept`).flush({ persisted: [] });
    await kept;
    await settle();
    expect(text('.draft .stamp')).toBe('Kept. This version can now go into an assessment.');
  });

  it('reviewed (K46): read-only, the picture the visitor directed, no form', async () => {
    await shown(true);
    expect(el.querySelector('.studio')?.classList.contains('ro')).toBe(true);
    expect(text('.rv-note')).toBe('This is the picture you directed');
    expect(el.querySelector('form.ask')).toBeNull();
    expect([...el.querySelectorAll<HTMLButtonElement>('#chips .chip')].every((b) => b.disabled)).toBe(true);
  });
});
