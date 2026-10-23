import { NgTemplateOutlet } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { ConceptLensMapComponent } from '../../aplus/my-knowledge/concept-lens-map/concept-lens-map.component';
import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { provideLive } from '../../live/live.providers';
import { FooterSlot } from '../../shell/footer-slot';
import { KioskStore } from '../../shell/kiosk.store';
import { provideTourBeats } from '../../shell/tour/tour-beats';
import { quietBeats } from '../../shell/tour/tour.testing';
import { MapsExhibit } from './maps-exhibit';
import { MAPS_ZOOM_MS, MapsSceneComponent } from './maps-scene.component';
import { G, GOALS, PENDING, atlasManifest, card, hawker, nature, water } from './maps-world.testing';
import { keepServedOrder } from '../../shared/visit-order.testing';

@Component({
  imports: [MapsSceneComponent, NgTemplateOutlet],
  template: `<main id="scene"><kiosk-maps-scene /></main>
    <footer id="bottom">
      @if (footer(); as tpl) {
        <ng-container [ngTemplateOutlet]="tpl" />
      }
    </footer>`,
})
class HostComponent {
  protected readonly footer = inject(FooterSlot).template;
}

const isSugg = (goal: string) => (r: { url: string; params: { get(k: string): string | null } }) =>
  r.url === '/api/v1/me/concept-graph/suggestions' && r.params.get('goalId') === goal;

// The atlas (mockup SCENES.maps, atlasHTML, regionHTML and openRegion, lines 4689 to 4784; K36, K37,
// K42, K63): three equal regions, one per map, each with its count, its Companion and its concepts as
// small hexes; a click zooms into the region, which shows production's map: the lens pills, the
// campaign HUD and the lens, the gold glow on the ideas a practice set waits on (K37) and the fog of
// waiting suggestions, never a hidden batch (K64). Back steps out: the region to the atlas, the atlas
// to the hall; the way back sits at the footer's right-most end.
describe('MapsSceneComponent (the atlas and a region)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<HostComponent>;
  let el: HTMLElement;
  let store: KioskStore;

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  async function answer(maps: Record<string, unknown> = { [G.water]: water(), [G.nature]: nature(), [G.hawker]: hawker() }): Promise<void> {
    (await vi.waitFor(() => http.expectOne('/api/v1/me/maps'))).flush({ items: GOALS.map(card) });
    for (const g of GOALS) {
      (await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${g}/graph`))).flush(maps[g] as object);
      (await vi.waitFor(() => http.expectOne(isSugg(g)))).flush({ suggestions: PENDING[g] });
    }
    await vi.waitFor(() => expect(TestBed.inject(MapsExhibit).status()).toBe('ready'));
    await settle();
  }

  async function shown(maps?: Record<string, unknown>): Promise<void> {
    fixture = TestBed.createComponent(HostComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(atlasManifest());
    await answer(maps);
    store.go('maps');
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [...keepServedOrder(), provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive()] });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(KioskStore);
    await TestBed.inject(KioskLanguage).ready();
  });
  afterEach(() => {
    vi.useRealTimers();
    TestBed.inject(MapsExhibit).forget();
  });

  const text = (n: Element | null | undefined) => n?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const regions = () => [...el.querySelectorAll('svg.atlas > g.region')];
  const footer = () => [...el.querySelectorAll('#bottom .fb-right button')].map((b) => text(b));
  const lens = () => fixture.debugElement.query(By.directive(ConceptLensMapComponent))?.componentInstance as ConceptLensMapComponent | undefined;

  /** Clicks a region and lets its zoom finish. */
  async function open(i: number): Promise<void> {
    vi.useFakeTimers();
    regions()[i].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(MAPS_ZOOM_MS);
    vi.useRealTimers();
    await settle();
  }

  it('the atlas: its head and three regions in the world’s order, each with its count, Companion and minis', async () => {
    await shown();
    expect(text(el.querySelector('.ex-head .crumb'))).toBe('Explore · Maps');
    expect(text(el.querySelector('.ex-head h2'))).toBe('A learner’s atlas');
    expect(regions().map((r) => r.getAttribute('data-id'))).toEqual(['goal.water', 'goal.nature', 'goal.hawker']);
    expect(regions().map((r) => text(r.querySelector('.r-title')))).toEqual(['Singapore’s water', 'City in Nature', 'Hawker culture']);
    expect(regions().map((r) => text(r.querySelector('.r-count')))).toEqual(['5 ideas · 2 won', '3 ideas · 1 won', '3 ideas · 1 won']);
    expect(regions().map((r) => text(r.querySelector('.r-comp')))).toEqual(['With Pingu', 'With Nova', 'With Ember']);
    expect(regions().map((r) => text(r.querySelector('.r-open')))).toEqual(['Click to open', 'Click to open', 'Click to open']);
    const minis = [...regions()[0].querySelectorAll('path.mini')];
    expect(minis.length).toBe(5);
    expect(minis.filter((m) => m.classList.contains('r')).length).toBe(1);
    expect(minis.filter((m) => m.classList.contains('f')).length).toBe(2);
    expect(regions().map((r) => r.querySelector('circle.blob')?.getAttribute('cx'))).toEqual(['330', '800', '1270']);
  });

  it('K173: at the atlas the footer is the tour’s; Back (the tour’s first beat), Esc and “Back to Explore” return to the hall', async () => {
    await shown();
    quietBeats();
    await settle();
    expect(footer()).toEqual(['How was this made?', 'Back to Explore', 'Done, end the demo session', 'Back', 'Next']);
    store.back();
    await vi.waitFor(() => expect(store.scene()).toBe('hall'));
    store.go('maps');
    store.escapeUp();
    expect(store.scene()).toBe('hall');
    store.go('maps');
    (el.querySelector('#bottom .fb-right [data-act="toHall"]') as HTMLButtonElement).click();
    expect(store.scene()).toBe('hall');
  });

  it('a click zooms into the region, then shows its map: crumb, pills, HUD and production’s lens on the root', async () => {
    await shown();
    vi.useFakeTimers();
    regions()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    const svg = el.querySelector('svg.atlas') as SVGElement;
    expect(svg.style.transform).toBe('scale(2.2)');
    expect(svg.style.transformOrigin).toBe('330px 300px');
    expect(svg.style.opacity).toBe('0');
    await vi.advanceTimersByTimeAsync(MAPS_ZOOM_MS);
    vi.useRealTimers();
    await settle();
    expect(el.querySelector('svg.atlas')).toBeNull();
    expect(text(el.querySelector('.ex-head .crumb'))).toBe('Explore · Maps › Singapore’s water');
    expect(text(el.querySelector('.ex-head h2'))).toBe('Singapore’s water');
    const pills = [...el.querySelectorAll('.lens-pills .lens-pill')];
    expect(pills.map((p) => [text(p), p.getAttribute('aria-checked')])).toEqual([
      ['Explore', 'true'],
      ['Growth', 'false'],
      ['Mastery', 'false'],
    ]);
    expect(text(el.querySelector('.lens-cap b'))).toBe('Explore');
    expect(text(el.querySelector('.lens-cap'))).toBe(
      'Explore shows your whole map as it stands: every idea and how they link. Pick any idea to move it to the centre.',
    );
    expect(text(el.querySelector('.camp-hud'))).toBe('Pingu marches on Reservoirs2 of 5 hexes won');
    expect(el.querySelector('#maplens chora-aplus-concept-lens-map')).not.toBeNull();
    expect(lens()?.focusId()).toBe(`${G.water}-root`);
    expect(lens()?.lens()).toBe('explore');
  });

  describe('K173: the tour asks for a view (the atlas, or Singapore’s water)', () => {
    it('a scene built for the tour’s water opens straight on it, once; the next scene starts on the atlas again', async () => {
      TestBed.inject(MapsExhibit).want('goal.water');
      await shown();
      expect(el.querySelector('svg.atlas')).toBeNull();
      expect(text(el.querySelector('.ex-head h2'))).toBe('Singapore’s water');
      expect(lens()?.focusId()).toBe(`${G.water}-root`);
      expect(TestBed.inject(MapsExhibit).wanted()).toBeNull();
      fixture.destroy();
      fixture = TestBed.createComponent(HostComponent);
      el = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();
      await answer();
      expect(regions().length).toBe(3);
    });

    it('the scene reports what it shows, for Back’s own view: the atlas, a region, or an open drawer', async () => {
      await shown();
      const maps = TestBed.inject(MapsExhibit);
      expect(maps.viewing()).toBe('atlas');
      await open(1);
      expect(maps.viewing()).toBe('goal.nature');
      (el.querySelector('#maplens [data-testid^="concept-lens-node-"]') as Element).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await settle();
      expect(maps.viewing()).toBe('drawer');
    });

    it('with the atlas on screen, water zooms in as a click does; the atlas then closes the region, its drawer and its paint', async () => {
      await shown();
      vi.useFakeTimers();
      TestBed.inject(MapsExhibit).want('goal.water');
      fixture.detectChanges();
      expect((el.querySelector('svg.atlas') as SVGElement).style.transform).toBe('scale(2.2)');
      await vi.advanceTimersByTimeAsync(MAPS_ZOOM_MS);
      vi.useRealTimers();
      await settle();
      expect(text(el.querySelector('.ex-head h2'))).toBe('Singapore’s water');
      (el.querySelector('.lens-pills .lens-pill:nth-child(2)') as HTMLButtonElement).click();
      await settle();
      TestBed.inject(MapsExhibit).want('atlas');
      await settle();
      expect(regions().length).toBe(3);
      TestBed.inject(MapsExhibit).want('goal.water');
      await vi.waitFor(async () => {
        await settle();
        expect(lens()?.lens()).toBe('explore');
      });
    });
  });

  it('K173: in a region the footer has no “Back to the atlas”: Back returns to the atlas (the beat’s own view, ruling a), Back again to the hall', async () => {
    TestBed.runInInjectionContext(() => provideTourBeats());
    await shown();
    await open(1);
    expect(footer()).toEqual(['How was this made?', 'Back to Explore', 'Done, end the demo session', 'Back', 'Next']);
    store.back();
    await vi.waitFor(async () => {
      await settle();
      expect(regions().length).toBe(3);
    });
    expect(store.scene()).toBe('maps');
    store.back();
    await vi.waitFor(() => expect(store.scene()).toBe('hall'));
  });

  it('the Growth pill paints the lens and rests it on the first idea to grow; Explore returns to the root', async () => {
    await shown();
    await open(0);
    (el.querySelectorAll('.lens-pills .lens-pill')[1] as HTMLButtonElement).click();
    await settle();
    expect(lens()?.lens()).toBe('growth');
    expect(lens()?.focusId()).toBe('w-res');
    expect(text(el.querySelector('.lens-cap b'))).toBe('Growth');
    expect(text(el.querySelector('.lens-cap'))).toBe(
      'Growth bookmarks your learning edges: the ideas your Companion flagged as weak spots, tinted so you can see where to explore next.',
    );
    expect(el.querySelectorAll('.lens-pills .lens-pill')[1].getAttribute('aria-checked')).toBe('true');
    (el.querySelectorAll('.lens-pills .lens-pill')[0] as HTMLButtonElement).click();
    await settle();
    expect(lens()?.focusId()).toBe(`${G.water}-root`);
  });

  it('K204, K214: in Chinese the Mastery caption leads with its tab’s own 掌握 in bold, with no space before the rest', async () => {
    await TestBed.inject(KioskLanguage).setLang('zh');
    await shown();
    await open(0);
    (el.querySelectorAll('.lens-pills .lens-pill')[2] as HTMLButtonElement).click();
    await settle();
    expect(el.querySelector('.lens-cap b')?.textContent).toBe('掌握');
    expect(el.querySelector('.lens-cap')?.textContent?.trim()).toBe('掌握展示你已经证明掌握的部分：你拿下的每个概念都会着色，让你看到地图有多少已经是你的。');
  });

  it('glows the unwon ideas a prepared practice set waits on at their next rung (K37), never a won one', async () => {
    await shown();
    await open(0);
    expect([...(lens()?.glowIds() ?? [])].sort()).toEqual(['w-res', 'w-used']);
    await open2(2);
    // Hawker's set is for rung 4 and UNESCO stands on rung 3: nothing to practise there yet.
    expect(lens()?.glowIds()).toEqual([]);
  });

  it('fogs the visible batches’ waiting ideas around their idea, never a hidden fresh one (K64)', async () => {
    await shown();
    await open(0);
    expect(lens()?.fogGhosts().map((f) => [f.suggestionId, f.focalConceptId])).toEqual([
      ['s-ro', 'w-desal'],
      ['s-intake', 'w-desal'],
    ]);
  });

  it('once the march is won the HUD says the Companion awaits its orders', async () => {
    await shown({ [G.water]: water([], { 'w-res': { rungsCleared: 6, currentRungCorrect: 0, wonAt: '2026-10-20T03:00:00Z', cooling: false, advancedToday: true } }), [G.nature]: nature(), [G.hawker]: hawker() });
    await open(0);
    expect(text(el.querySelector('.camp-hud'))).toBe('Your companion awaits its marching orders, choose a hex to press on.3 of 5 hexes won');
  });

  it('reads the atlas again on every entry', async () => {
    await shown();
    fixture.destroy();
    fixture = TestBed.createComponent(HostComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await answer({ [G.water]: water([{ id: 'w-ro', title: 'Reverse osmosis', under: 'w-desal' }]), [G.nature]: nature(), [G.hawker]: hawker() });
    expect(text(regions()[0].querySelector('.r-count'))).toBe('6 ideas · 2 won');
  });

  it('an atlas that cannot be read says so, never empty regions', async () => {
    fixture = TestBed.createComponent(HostComponent);
    el = fixture.nativeElement as HTMLElement;
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush({}, { status: 503, statusText: 'Service Unavailable' });
    await vi.waitFor(() => expect(TestBed.inject(MapsExhibit).status()).toBe('failed'));
    await settle();
    expect(text(el.querySelector('.msg-error'))).toBe('This step could not reach Chora. Please ask the presenter.');
    expect(regions().length).toBe(0);
    expect(err).toHaveBeenCalled();
  });

  /** Back to the atlas, then into another region. */
  async function open2(i: number): Promise<void> {
    TestBed.inject(MapsExhibit).want('atlas');
    await settle();
    await open(i);
  }
});
