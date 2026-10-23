import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { provideLive } from '../../live/live.providers';
import { LiveAvailability, LiveService } from '../../live/live.service';
import { CompanionsExhibit } from './companions-exhibit';
import { CompanionsSceneComponent } from './companions-scene.component';
import { GROWTH, IDS, MAPS, PINGU_AFTER, doseManifest, growth } from './companions-world.testing';
import { keepServedOrder } from '../../shared/visit-order.testing';

// K173 (web's beat table, ruled 21 Oct): the tour's Companions beats are Pingu's (the water map's
// Companion; Nova and Ember never in Next): C1 its intro, then Suggest, Quiz, Today's dose and Read my
// marked test. Back never writes: onto C4 it shows the dose only when this visit already read it.
// Ruling (3): the three growths are read again on every entry, so a +30 released in Grading shows.
describe('CompanionsExhibit (the tour’s beats, K173)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<CompanionsSceneComponent>;
  let el: HTMLElement;
  const DOSE = '/api/companion/daily-dose';
  const exhibit = () => TestBed.inject(CompanionsExhibit);

  async function settle(): Promise<void> {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        ...keepServedOrder(),
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideKioskI18n(),
        ...provideLive(),
        { provide: LiveAvailability, useValue: { text: signal(true).asReadonly(), picture: signal(true).asReadonly() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(KioskLanguage).ready();
    fixture = TestBed.createComponent(CompanionsSceneComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(doseManifest());
    for (const goal of [IDS.water, IDS.nature, IDS.hawker]) await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${goal}/graph`).flush(MAPS[goal]));
    for (const c of [IDS.pingu, IDS.nova, IDS.ember]) await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${c}/growth`).flush(GROWTH[c]));
    await vi.waitFor(() => expect(exhibit().status()).toBe('ready'));
    await settle();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    exhibit().forget();
    TestBed.inject(LiveService).endSession();
  });

  const text = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('C1: from Nova with an ability open, the beat shows Pingu’s intro with no ability open', async () => {
    exhibit().select(IDS.nova);
    void exhibit().openQuiz();
    await settle();
    await exhibit().tourShow(null, 'next');
    await settle();
    expect(exhibit().selected()?.id).toBe(IDS.pingu);
    expect(exhibit().view()).toBeNull();
    expect(el.querySelector('.comp-intro')).not.toBeNull();
  });

  it('C2: Pingu’s Suggest, read from the product (a read, no write)', async () => {
    exhibit().select(IDS.ember);
    const shown = exhibit().tourShow('suggest', 'next');
    await vi.waitFor(() => http.expectOne((r) => r.url === '/api/v1/me/concept-graph/suggestions' && r.params.get('goalId') === IDS.water).flush({ suggestions: [] }));
    await shown;
    expect(exhibit().selected()?.id).toBe(IDS.pingu);
    expect(exhibit().view()).toBe('suggest');
  });

  it('C4 by Next opens Pingu’s dose (the read that credits the day’s +2)', async () => {
    void exhibit().tourShow('dose', 'next');
    await settle();
    expect(exhibit().view()).toBe('dose');
    expect(http.match((r) => r.url === DOSE).length).toBe(1);
  });

  it('C4 by Back, with no dose read this visit, opens nothing: Pingu’s intro, the dose a click away (Back never writes)', async () => {
    await exhibit().tourShow('dose', 'back');
    await settle();
    http.expectNone((r) => r.url === DOSE);
    expect(exhibit().selected()?.id).toBe(IDS.pingu);
    expect(exhibit().view()).toBeNull();
    // That intro is C4's own view while no dose was read, so a second Back moves on (no loop on C4).
    expect(exhibit().tourShows('dose')).toBe(true);
    expect(exhibit().tourShows(null)).toBe(true);
    exhibit().select(IDS.nova);
    expect(exhibit().tourShows('dose')).toBe(false);
  });

  it('W100: tourDoseOpen holds only while Pingu’s dose is on screen, never on the intro that stands for C4 by Back', async () => {
    await exhibit().tourShow('dose', 'back');
    await settle();
    expect(exhibit().tourShows('dose')).toBe(true);
    expect(exhibit().tourDoseOpen()).toBe(false);
    void exhibit().tourShow('dose', 'next');
    await settle();
    expect(exhibit().tourDoseOpen()).toBe(true);
    // Another Companion's dose is not Pingu's: C4 by Next would still put Pingu's up.
    exhibit().select(IDS.nova);
    void exhibit().openDose();
    await settle();
    expect(exhibit().view()).toBe('dose');
    expect(exhibit().tourDoseOpen()).toBe(false);
  });

  it('ruling (3): the three growths are read again on every entry, so a release’s +30 shows on Pingu’s sheet', async () => {
    expect(exhibit().roster()[0].growth.expCumulative).toBe(32);
    fixture.destroy();
    fixture = TestBed.createComponent(CompanionsSceneComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    const plus30 = growth(IDS.pingu, 'Pingu', 'penguin', 2, 62, 12, 200, 'flash-lite', ['atom_search', 'cite_atom']);
    for (const c of [IDS.pingu, IDS.nova, IDS.ember]) await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${c}/growth`).flush(c === IDS.pingu ? plus30 : GROWTH[c]));
    await settle();
    expect(exhibit().roster()[0].growth.expCumulative).toBe(62);
    expect(exhibit().roster()[0].growth.growthStage).toBe(2);
    expect(text('.cx-mate.on')).toContain('Pingu');
  });

  it('a growth read again that fails keeps the last one and says so loudly', async () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errors.push(a.join(' ')));
    const again = exhibit().refreshGrowth();
    await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${IDS.pingu}/growth`).flush('boom', { status: 502, statusText: 'Bad Gateway' }));
    for (const c of [IDS.nova, IDS.ember]) http.match(`/api/v1/me/companions/${c}/growth`).forEach((r) => r.flush(GROWTH[c]));
    await again;
    expect(exhibit().roster()[0].growth.expCumulative).toBe(32);
    expect(errors.join('\n')).toContain("[kiosk] the Companions' growth could not be read again");
    expect(PINGU_AFTER.data.expCumulative).toBe(65);
  });
});
