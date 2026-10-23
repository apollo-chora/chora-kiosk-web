import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { SessionService } from '../../kiosk-api/session.service';
import type { PrewarmManifestWire } from '../../kiosk-api/manifest.service';
import { provideLive } from '../../live/live.providers';
import { LiveAvailability } from '../../live/live.service';
import { KioskStore } from '../../shell/kiosk.store';
import { TeacherStudio } from '../../story/teacher-studio';
import { CompanionsExhibit } from '../companions/companions-exhibit';
import { DashboardExhibit } from './dashboard-exhibit';
import { DashboardSceneComponent } from './dashboard-scene.component';
import { MINT, READS, WATER_MAP, WATER_QS, created, dashManifest, takeRead } from './dashboard-world.testing';

// The take's side panels (mockup dashPicPanelHTML, dashImgPanelHTML and dashPicMode, lines 5296, 5304
// and 5292): the step 4 copy's picture with the mode it was made in, the AI mark (K66) and when it was
// prepared; after a Keep in step 4 the line says this assessment holds the version prepared for the
// demo (K119, the orchestrator's Q1 A, 18 Oct; dbx.notKept retired); the open question's picture with
// its caption. The today strip's Daily Dose (dashTodayHTML, line 5574) opens
// Companions' dose for the active goal (K160, amending K49's note). The talking point follows the take
// (SCENES.dash review, line 5393).
describe('DashboardSceneComponent (side panels, the Daily Dose, the talking point)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<DashboardSceneComponent>;
  let el: HTMLElement;
  const kept = signal<{ readonly n: number } | null>(null);
  const GREETING = '/api/companion/greeting';
  const exhibit = () => TestBed.inject(DashboardExhibit);

  async function settle(): Promise<void> {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  beforeEach(async () => {
    kept.set(null);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideKioskI18n(),
        ...provideLive(),
        { provide: LiveAvailability, useValue: { text: signal(true).asReadonly(), picture: signal(true).asReadonly() } },
        { provide: TeacherStudio, useValue: { kept: kept.asReadonly() } },
        { provide: CompanionsExhibit, useValue: { openDoseFor: async () => undefined } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(KioskLanguage).ready();
  });

  afterEach(() => {
    exhibit().forget();
    TestBed.inject(SessionService).drop();
  });

  /** The dashboard on the given manifest and water map. */
  async function open(manifest: PrewarmManifestWire = dashManifest(), map: object = WATER_MAP): Promise<void> {
    fixture = TestBed.createComponent(DashboardSceneComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(manifest);
    (await vi.waitFor(() => http.expectOne('/api/v1/me/maps/g-water/graph'))).flush(map);
    (await vi.waitFor(() => http.expectOne('/api/me/dashboard'))).flush({ streak: { current_streak_days: 6 } });
    (await vi.waitFor(() => http.expectOne('/api/v1/me/mana'))).flush({ gcid: 'g', balance_units: 1240 });
    for (const [b, ts] of [['b-water', 'ts-water'], ['b-nature', 'ts-nature'], ['b-hawker', 'ts-hawker']]) {
      (await vi.waitFor(() => http.expectOne(`/api/v1/question-banks/${b}`))).flush(READS[b]);
      (await vi.waitFor(() => http.expectOne(`/api/v1/test-sets/${ts}`))).flush(READS[ts]);
    }
    await vi.waitFor(() => expect(exhibit().status()).toBe('ready'));
    await settle();
  }

  const text = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const texts = (sel: string) => Array.from(el.querySelectorAll(sel)).map((n) => n.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  const click = async (sel: string, i = 0) => {
    (el.querySelectorAll(sel)[i] as HTMLElement).click();
    await settle();
  };

  /** The water bank's take, on question 1. */
  async function takeWater(qs = WATER_QS): Promise<void> {
    await click('.db-bank[data-id="bank.water"]');
    await click('[data-act="dbxTake"]');
    (await vi.waitFor(() => http.expectOne('/api/v1/kiosk/session'))).flush(MINT);
    (await vi.waitFor(() => http.expectOne('/api/v1/assessments'))).flush(created('as-water', 'Water for Life: Unit 1 quiz'), { status: 201, statusText: 'Created' });
    (await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-water/submissions'))).flush({ submission_id: 'sub-water', attempt_number: 1 }, { status: 201, statusText: 'Created' });
    (await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-water'))).flush(takeRead('as-water', 'Water for Life: Unit 1 quiz', qs));
    await vi.waitFor(() => expect(exhibit().attempt()?.status).toBe('in_progress'));
    await settle();
  }

  describe('the take’s side panels', () => {
    it('a question with no picture has no panel; the step 4 copy shows its picture, its mode, the AI mark and when it was prepared (K119, K66)', async () => {
      await open();
      await takeWater();
      expect(el.querySelector('.dbx-card')?.classList.contains('two')).toBe(false);
      expect(el.querySelector('.dbx-side')).toBeNull();
      await click('[data-act="dbxNext"]');
      expect(el.querySelector('.dbx-card.two .dbx-main + .dbx-side')).not.toBeNull();
      expect(text('.dbx-side-h b')).toBe('Picture for the question');
      expect(text('.dbx-side-h .mode-tag')).toBe('Diagram');
      const img = el.querySelector('.dbx-pic img');
      expect(img?.getAttribute('src')).toBe('/p/w2.png');
      expect(img?.getAttribute('alt')).toBe('Diagram: the stages that turn used water into NEWater');
      expect(text('.dbx-pic .ai-mark')).toBe('Generated with AI');
      expect(texts('.dbx-ver > span')).toEqual(['Prepared 20 Oct, 13:58 from the AI draft']);
      expect(el.querySelector('.dbx-ver kiosk-prepared-info button[data-act="preparedInfo"]')).not.toBeNull();
    });

    it('after a Keep in step 4 the line says this assessment holds the version prepared for the demo (Q1 A; dbx.notKept retired)', async () => {
      kept.set({ n: 3 });
      await open();
      await takeWater();
      await click('[data-act="dbxNext"]');
      expect(texts('.dbx-ver > span')).toEqual([
        'Prepared 20 Oct, 13:58 from the AI draft',
        'You kept your version in step 4; this assessment holds the version prepared for the demo.',
      ]);
      expect(el.querySelector('.dbx-ver .dbx-warn')).toBeNull();
    });

    it('the open question shows its picture with its caption and no mode tag', async () => {
      await open();
      await takeWater();
      await click('[data-act="dbxNext"]');
      await click('[data-act="dbxNext"]');
      expect(el.querySelector('.dbx-card.two textarea#dbxtext')).not.toBeNull();
      expect(el.querySelector('.dbx-side-h .mode-tag')).toBeNull();
      const img = el.querySelector('.dbx-pic img');
      expect(img?.getAttribute('src')).toBe('/p/taps.png');
      expect(img?.getAttribute('alt')).toBe('Singapore’s four water taps in one imagined view, pictured by the image model.');
      expect(text('.dbx-pic .ai-mark')).toBe('Generated with AI');
      expect(texts('.dbx-ver > span')).toEqual(['Singapore’s four water taps in one imagined view, pictured by the image model.']);
    });

    it('a step 4 copy whose take read carries no picture says so loudly and shows no panel', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await open();
      await takeWater(WATER_QS.map((q) => (q.qid === 'q-w2' ? { ...q, img: undefined } : q)));
      await click('[data-act="dbxNext"]');
      expect(el.querySelector('.dbx-side')).toBeNull();
      expect(error).toHaveBeenCalledWith(expect.stringContaining('tsq-w2'));
      error.mockRestore();
    });

    it('a copy whose picture is not its draft’s own shows it with no mode, said loudly', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const m = dashManifest();
      const draft = m.choices['draft.h4'];
      await open({ ...m, choices: { ...m.choices, 'draft.h4': { ...draft, records: { ...(draft.records as object), image_url: '/p/other.png' } } } });
      await takeWater();
      await click('[data-act="dbxNext"]');
      expect(el.querySelector('.dbx-pic img')?.getAttribute('src')).toBe('/p/w2.png');
      expect(el.querySelector('.dbx-side-h .mode-tag')).toBeNull();
      expect(error).toHaveBeenCalledWith(expect.stringContaining('copy.water.q2'));
      error.mockRestore();
    });
  });

  describe('the today strip’s Daily Dose (K160)', () => {
    it('opens Companions on the active goal’s Companion at today’s dose, the cards and greeting Companions shows; no note here', async () => {
      const openDoseFor = vi.fn(async () => undefined);
      Object.assign(TestBed.inject(CompanionsExhibit), { openDoseFor });
      const scene = vi.spyOn(TestBed.inject(KioskStore), 'openScene');
      await open();
      const btn = el.querySelector('[data-act="dbDose"]') as HTMLButtonElement;
      expect(btn.textContent?.trim()).toBe('Today’s Daily Dose');
      btn.click();
      await settle();
      expect(openDoseFor).toHaveBeenCalledWith('c-pingu');
      expect(scene).toHaveBeenCalledWith('comp');
      // K49's note and its greeting call are gone: the greeting is Companions' own, beside the cards (K54, K127).
      expect(el.querySelector('.db-dose-note')).toBeNull();
      expect(el.textContent).not.toContain('In Chora this opens today’s five practice cards');
      http.expectNone(GREETING);
    });

    it('a goal with no Companion attached opens nothing, said loudly', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const openDoseFor = vi.fn(async () => undefined);
      Object.assign(TestBed.inject(CompanionsExhibit), { openDoseFor });
      const scene = vi.spyOn(TestBed.inject(KioskStore), 'openScene');
      const { attachedFamiliarId: _id, attachedFamiliarName: _name, ...bare } = WATER_MAP;
      await open(dashManifest(), bare);
      (el.querySelector('[data-act="dbDose"]') as HTMLButtonElement).click();
      await settle();
      expect(error).toHaveBeenCalledWith(expect.stringContaining('no Companion'));
      expect(openDoseFor).not.toHaveBeenCalled();
      expect(scene).not.toHaveBeenCalled();
      error.mockRestore();
    });
  });

  it('the talking point follows the take: dash on the list, dashTake while sitting it (mockup review key)', async () => {
    const store = TestBed.inject(KioskStore);
    await open();
    expect(store.talkKey()).toBe('dash');
    await takeWater();
    expect(store.talkKey()).toBe('dashTake');
    await click('[data-act="dbxPrev"]');
    expect(store.talkKey()).toBe('dash');
  });
});
