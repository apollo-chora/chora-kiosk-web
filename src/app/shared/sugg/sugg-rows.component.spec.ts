import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { ConceptGraph, ConceptSuggestion } from '../../aplus/discovery-graph/concept-graph.model';
import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { SuggRowsComponent, suggRow, type ListRow, type SuggDecision } from './sugg-rows.component';

const ROWS: ListRow[] = [
  { id: 's-mf', title: 'Microfiltration', rationale: 'Why microfiltration', state: 'pending', fresh: true, live: true },
  { id: 's-uv', title: 'UV disinfection', rationale: 'Why UV', state: 'pending', fresh: true, live: false },
  { id: 's-ro', title: 'Reverse osmosis', rationale: 'Why RO', state: 'pending' },
  { id: 's-res', title: 'Reservoirs', rationale: 'Why reservoirs', state: 'dup' },
];

/** The map a row is built against. */
const MAP: ConceptGraph = {
  concepts: [
    { conceptId: 'c-taps', title: 'Four National Taps', atomRefs: [] },
    { conceptId: 'c-import', title: 'Imported water', atomRefs: [] },
  ],
  edges: [],
};
const link = (id: string, source: string | undefined, target: string | undefined): ConceptSuggestion => ({
  suggestionId: id,
  kind: 'edge',
  status: 'pending',
  sourceConceptId: source,
  targetConceptId: target,
  class: 'hierarchy',
  rationale: 'Why linked',
});

describe('suggRow (K189 (2): the lists show ideas only)', () => {
  it('a concept keeps its own title', () => {
    const s: ConceptSuggestion = { suggestionId: 's-c', kind: 'concept', status: 'pending', title: 'Brine discharge', rationale: 'Why brine' };
    expect(suggRow(s, null, MAP)).toEqual({ id: 's-c', title: 'Brine discharge', rationale: 'Why brine', state: 'pending' });
  });

  it('a link between two ideas builds no row at all, on the map or off it (W62: never an idea not on this map)', () => {
    expect(suggRow(link('s-l', 'c-taps', 'c-import'), null, MAP)).toBeNull();
    expect(suggRow(link('s-l', 'c-taps', 'c-elsewhere'), 'pending', MAP)).toBeNull();
    expect(suggRow({ ...link('s-l', 'c-gone', undefined), class: 'lateral' }, 'added', MAP)).toBeNull();
  });

  it('K157: a waiting concept whose title is on the map already (case apart) is marked on the map; a decided one keeps its state', () => {
    const s: ConceptSuggestion = { suggestionId: 's-c', kind: 'concept', status: 'pending', title: 'imported WATER' };
    expect(suggRow(s, null, MAP)?.state).toBe('dup');
    expect(suggRow(s, 'pending', MAP)?.state).toBe('dup');
    expect(suggRow(s, 'added', MAP)?.state).toBe('added');
    expect(suggRow({ ...s, title: 'Imported water supply' }, null, MAP)?.state).toBe('pending');
  });
});

// K176 as K189 (1) and K190 amend it: a hex holds at most six children, counted from the map alone (no
// room is reserved behind "Add all", nor kept for any idea); once an idea holds six, its remaining ideas
// are greyed ("no room"), marked, never hidden.
describe('suggRow (the hex rules on Add)', () => {
  const kids = (n: number) => Array.from({ length: n }, (_, i) => ({ conceptId: `c-k${i}`, title: `Kid ${i}`, atomRefs: [] }));
  const under = (focal: string, n: number, cls: 'hierarchy' | 'lateral' = 'hierarchy') =>
    Array.from({ length: n }, (_, i) => ({ edgeId: `e-${focal}-${i}`, sourceConceptId: focal, targetConceptId: `c-k${i}`, class: cls, provenance: 'learner_authored' as const }));
  const withKids = (n: number, cls: 'hierarchy' | 'lateral' = 'hierarchy'): ConceptGraph => ({ concepts: [...MAP.concepts, ...kids(n)], edges: under('c-taps', n, cls) });
  const idea = (title = 'Brine discharge', id = 's-c'): ConceptSuggestion => ({ suggestionId: id, kind: 'concept', status: 'pending', title, focalConceptId: 'c-taps', rationale: 'Why' });

  it('a concept that would be a 7th child is full; with room for one it waits', () => {
    expect(suggRow(idea(), null, withKids(6))?.state).toBe('full');
    expect(suggRow(idea(), 'pending', withKids(6))?.state).toBe('full');
    expect(suggRow(idea(), null, withKids(5))?.state).toBe('pending');
  });

  it('K189 (1): the cap counts actual children only, so six waiting ideas under an empty idea are all addable', () => {
    for (let i = 0; i < 6; i++) expect(suggRow(idea(`Idea ${i}`, `s-${i}`), null, withKids(0))?.state).toBe('pending');
  });

  it('only parent-child links count as children; a decided row keeps its state; on the map wins', () => {
    expect(suggRow(idea(), null, withKids(6, 'lateral'))?.state).toBe('pending');
    expect(suggRow(idea(), 'added', withKids(6))?.state).toBe('added');
    expect(suggRow(idea(), 'dropped', withKids(6))?.state).toBe('dropped');
    expect(suggRow(idea('Kid 2'), null, withKids(6))?.state).toBe('dup');
  });

  it('a concept with no focal has no parent to fill', () => {
    const { focalConceptId: _, ...loose } = idea();
    expect(suggRow(loose, null, withKids(6))?.state).toBe('pending');
  });

  it('K190: nothing is kept for any idea: with one place left every waiting idea fits, the idea step 3 asks about too', () => {
    expect(suggRow(idea(), null, withKids(5))?.state).toBe('pending');
    expect(suggRow(idea('Reverse osmosis', 's-ro'), null, withKids(5))?.state).toBe('pending');
  });
});

@Component({
  imports: [SuggRowsComponent],
  template: `<kiosk-sugg-rows [rows]="rows()" [viewOnly]="viewOnly()" [disabled]="disabled()" [dismiss]="dismiss()" (decide)="decided.push($event)" />`,
})
class HostComponent {
  readonly rows = signal<readonly ListRow[]>(ROWS);
  readonly viewOnly = signal(false);
  readonly disabled = signal(false);
  readonly dismiss = signal(true);
  readonly decided: SuggDecision[] = [];
}

// The one list of waiting ideas the hook, Companions and the atlas share (mockup suggListHTML, line 4738;
// K189): each row's kind, a fresh idea's LIVE tag when a LIVE press made it, the concept's title and why,
// and Add and Dismiss on a waiting row, or why it cannot be added.
describe('SuggRowsComponent', () => {
  let host: HostComponent;
  let el: HTMLElement;
  let fixture: ComponentFixture<HostComponent>;

  async function shown(set?: (h: HostComponent) => void): Promise<void> {
    TestBed.configureTestingModule({ providers: [...provideKioskI18n()] });
    await TestBed.inject(KioskLanguage).ready();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    set?.(host);
    el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  }

  const text = (n: Element | null | undefined) => n?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const rows = () => [...el.querySelectorAll('kiosk-sugg-rows .sugg-row')];

  it('draws each row with its kind, title and why; a live idea carries the LIVE tag, a prepared one none', async () => {
    await shown();
    expect(rows().map((r) => text(r.querySelector('b .sugg-kind')))).toEqual(['New concept', 'New concept', 'New concept', 'On your map']);
    expect(rows().map((r) => text(r.querySelector('b > bdi')))).toEqual(['Microfiltration', 'UV disinfection', 'Reverse osmosis', 'Reservoirs']);
    expect(rows().map((r) => text(r.querySelector('b .sugg-live')))).toEqual(['LIVE', '', '', '']);
    expect(rows()[3].classList.contains('dup')).toBe(true);
    expect(text(rows()[0].querySelector(':scope > span'))).toBe('Why microfiltration');
  });

  it('marks the title and the why as English content (K41), and never draws the title as a span (the why’s style)', async () => {
    await shown();
    const title = rows()[0].querySelector('b > bdi') as HTMLElement;
    expect(title.getAttribute('lang')).toBe('en');
    expect(rows()[0].querySelector(':scope > span')?.getAttribute('lang')).toBe('en');
    expect(rows()[0].querySelector('b span')).toBeNull();
    expect(rows()[0].querySelector('b .sugg-kind')?.getAttribute('lang')).toBeNull();
  });

  it('a waiting row offers Add and Dismiss under the mockup’s act names, fresh or prepared; the others say why not', async () => {
    await shown();
    expect(rows().slice(0, 3).map((r) => [...r.querySelectorAll('.acts [data-act]')].map((b) => b.getAttribute('data-act')))).toEqual([
      ['freshAccept', 'freshDismiss'],
      ['freshAccept', 'freshDismiss'],
      ['suggAccept', 'suggDismiss'],
    ]);
    expect(text(rows()[3].querySelector('.sugg-state'))).toBe('Already on your map');
    expect(rows()[3].querySelector('.acts')).toBeNull();
  });

  it('K190: a full row is greyed with why in place of Add and Dismiss, in English and Chinese, a live one keeping its tag', async () => {
    const blocked: ListRow[] = [
      { id: 's-full', title: 'Brine discharge', rationale: 'Why brine', state: 'full' },
      { id: 's-full2', title: 'Brine reuse', rationale: 'Why reuse', state: 'full', fresh: true, live: true },
    ];
    await shown((h) => h.rows.set(blocked));
    expect(rows().map((r) => text(r.querySelector('.sugg-state')))).toEqual(['No room: an idea holds six at most', 'No room: an idea holds six at most']);
    expect(rows().every((r) => !r.querySelector('.acts'))).toBe(true);
    await TestBed.inject(KioskLanguage).setLang('zh');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(rows().map((r) => text(r.querySelector('.sugg-state')))).toEqual(['没有空位：每个想法最多六个下一级想法', '没有空位：每个想法最多六个下一级想法']);
    expect(text(rows()[1].querySelector('b .sugg-live'))).toBe('实时');
  });

  it('Add and Dismiss tell the caller which row, and whether it is fresh', async () => {
    await shown();
    (rows()[0].querySelector('[data-act="freshAccept"]') as HTMLButtonElement).click();
    (rows()[2].querySelector('[data-act="suggDismiss"]') as HTMLButtonElement).click();
    expect(host.decided).toEqual([
      { id: 's-mf', choice: 'accept', fresh: true },
      { id: 's-ro', choice: 'dismiss', fresh: false },
    ]);
  });

  it('K189 (1): a list without Dismiss (story step 2) offers Add alone', async () => {
    await shown((h) => h.dismiss.set(false));
    expect(rows().slice(0, 3).map((r) => [...r.querySelectorAll('.acts [data-act]')].map((b) => b.getAttribute('data-act')))).toEqual([['freshAccept'], ['freshAccept'], ['suggAccept']]);
  });

  it('Add and Dismiss are off while the caller is busy', async () => {
    await shown((h) => h.disabled.set(true));
    expect([...rows()[0].querySelectorAll('button')].every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it('view-only rows show no buttons', async () => {
    await shown((h) => h.viewOnly.set(true));
    expect(el.querySelector('kiosk-sugg-rows .acts')).toBeNull();
    expect(text(rows()[3].querySelector('.sugg-state'))).toBe('Already on your map');
  });
});
