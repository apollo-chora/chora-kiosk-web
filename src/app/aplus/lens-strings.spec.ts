import { TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../i18n/i18n';
import type { ConceptEdge, ConceptNode } from './discovery-graph/concept-graph.model';
import type { MapCampaign } from './my-knowledge/campaign.model';
import { ConceptLensMapComponent } from './my-knowledge/concept-lens-map/concept-lens-map.component';

// The copied lens (T3.6) reads its strings as production does, `aplus.knowledge.*` through
// the translate service; here they resolve through the kiosk's own tables in both languages.
const CONCEPTS: ConceptNode[] = [
  { conceptId: 'root', title: 'Water', atomRefs: [] },
  { conceptId: 'res', title: 'Reservoirs', atomRefs: [] },
  { conceptId: 'new', title: 'NEWater', atomRefs: [] },
];
const EDGES: ConceptEdge[] = [
  { edgeId: 'e1', sourceConceptId: 'root', targetConceptId: 'res', class: 'hierarchy', provenance: 'learner_authored' },
  { edgeId: 'e2', sourceConceptId: 'root', targetConceptId: 'new', class: 'hierarchy', provenance: 'learner_authored' },
];
const CAMPAIGN: MapCampaign = {
  frontierTotal: 2,
  frontierWon: 1,
  canSeal: false,
  nodes: {
    res: { rungsCleared: 5, currentRungCorrect: 1, cooling: false, advancedToday: false },
    new: { rungsCleared: 6, currentRungCorrect: 0, cooling: false, advancedToday: false, wonAt: '2026-10-20T05:41:12Z' },
  },
};

async function mountLens(): Promise<HTMLElement> {
  const fixture = TestBed.createComponent(ConceptLensMapComponent);
  fixture.componentRef.setInput('concepts', CONCEPTS);
  fixture.componentRef.setInput('edges', EDGES);
  fixture.componentRef.setInput('focusId', 'root');
  fixture.componentRef.setInput('rootId', 'root');
  fixture.componentRef.setInput('campaign', CAMPAIGN);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const nodeLabel = (el: HTMLElement, id: string): string =>
  el.querySelector(`[data-id="${id}"]`)?.getAttribute('aria-label') ?? '';

describe('the copied lens reads the kiosk string tables (T3.6)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideKioskI18n()] });
  });

  it('labels the map and its hexes in English', async () => {
    await TestBed.inject(KioskLanguage).ready();
    const el = await mountLens();
    expect(el.querySelector('svg')?.getAttribute('aria-label')).toBe('Concept map, fisheye lens. Tap a concept to focus it.');
    expect(nodeLabel(el, 'res')).toContain('Climbing, 5 of 6 rungs');
    expect(nodeLabel(el, 'new')).toContain('Province');
    expect(nodeLabel(el, 'res')).not.toContain('aplus.knowledge');
  });

  it('labels the map and its hexes in Chinese, concept names staying English (K41)', async () => {
    await TestBed.inject(KioskLanguage).setLang('zh');
    const el = await mountLens();
    expect(el.querySelector('svg')?.getAttribute('aria-label')).toBe('概念地图，鱼眼视图。点击一个概念即可聚焦。');
    expect(nodeLabel(el, 'res')).toContain('攀登中：已完成 5/6 级');
    expect(nodeLabel(el, 'res')).toContain('Reservoirs');
    expect(nodeLabel(el, 'new')).toContain('领地');
  });
});
