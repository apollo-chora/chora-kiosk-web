import type { ConceptGraph, ConceptSuggestion } from '../../aplus/discovery-graph/concept-graph.model';
import type { SuggRow } from './sugg-rows.component';
import { freshGroup, waitingList, type FreshGroup } from './sugg-list';

const idea = (id: string, title: string, focal = 'c-desal'): ConceptSuggestion => ({ suggestionId: id, kind: 'concept', status: 'pending', title, focalConceptId: focal, rationale: `Why ${title}` });
const row = (id: string, state: SuggRow['state'] = 'pending'): SuggRow => ({ id, title: id, rationale: '', state });
const MAP: ConceptGraph = { concepts: [{ conceptId: 'c-desal', title: 'Desalination', atomRefs: [] }], edges: [] };

// K189 (2), the owner's example: "starts with 6 ideas. If i click add to one idea, then 5 is left. If I
// trigger the 'live' button, and 2 are generated, then the total in the list should only see 7 concepts."
describe('waitingList (K189: one list of waiting ideas)', () => {
  const six = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

  it('the owner’s example: six, add one, five; a live press of two, seven, the fresh ones first', () => {
    expect(waitingList(six.map((id) => row(id)), []).rows).toHaveLength(6);
    const afterAdd = six.map((id) => row(id, id === 'p3' ? 'added' : 'pending'));
    expect(waitingList(afterAdd, []).rows.map((r) => r.id)).toEqual(['p1', 'p2', 'p4', 'p5', 'p6']);
    const press: FreshGroup = { source: 'live', preparedAt: null, rows: [row('f1'), row('f2')] };
    const list = waitingList(afterAdd, [press]);
    expect(list.rows.map((r) => r.id)).toEqual(['f1', 'f2', 'p1', 'p2', 'p4', 'p5', 'p6']);
    expect(list.rows.map((r) => [r.fresh ?? false, r.live ?? false])).toEqual([[true, true], [true, true], ...Array(5).fill([false, false])]);
  });

  it('added and dismissed ideas leave it; a full or on-the-map idea stays, greyed and marked', () => {
    const list = waitingList([row('a', 'added'), row('d', 'dropped'), row('f', 'full'), row('m', 'dup')], []);
    expect(list.rows.map((r) => [r.id, r.state])).toEqual([['f', 'full'], ['m', 'dup']]);
  });

  it('says whether any of its ideas went onto the map, and whether a prepared idea is left for the prepared stamp', () => {
    expect(waitingList([row('p1', 'added')], [])).toMatchObject({ rows: [], added: true, preparedLeft: false });
    expect(waitingList([row('p1', 'dropped')], [])).toMatchObject({ rows: [], added: false, preparedLeft: false });
    const fresh: FreshGroup = { source: 'live', preparedAt: null, rows: [row('f1', 'added'), row('f2')] };
    expect(waitingList([row('p1', 'added')], [fresh])).toMatchObject({ added: true, preparedLeft: false });
    expect(waitingList([row('p1')], [fresh])).toMatchObject({ preparedLeft: true });
  });

  describe('gap (b), K101, condition (a): the LIVE row’s prepared stamps, each at its batch’s own time, never over nothing', () => {
    const SHOWN = new Date('2026-10-20T05:31:00Z');
    const HIDDEN = new Date('2026-10-20T05:32:00Z');
    const fallback = (...rows: SuggRow[]): FreshGroup => ({ source: 'prepared', preparedAt: HIDDEN, rows });
    const press = (...rows: SuggRow[]): FreshGroup => ({ source: 'live', preparedAt: null, rows });

    it('before any press: the shown batch’s time while one of its ideas waits, else none', () => {
      expect(waitingList([row('p1')], [], SHOWN)).toMatchObject({ preparedAt: SHOWN, fallbackAt: null });
      expect(waitingList([row('p1', 'added')], [], SHOWN)).toMatchObject({ preparedAt: null, fallbackAt: null });
      expect(waitingList([row('p1')], [])).toMatchObject({ preparedAt: null, fallbackAt: null });
    });

    it('after a miss: the list stamps the shown batch alone, and the fallback it lists carries its own time beside the miss', () => {
      expect(waitingList([row('p1')], [fallback(row('h1'))], SHOWN)).toMatchObject({ preparedAt: SHOWN, fallbackAt: HIDDEN });
      expect(waitingList([], [fallback(row('h1'))], null)).toMatchObject({ preparedAt: null, fallbackAt: HIDDEN });
      // Its ideas all added or dismissed: no stamp over nothing.
      expect(waitingList([row('p1')], [fallback(row('h1', 'added'), row('h2', 'dropped'))], SHOWN)).toMatchObject({ preparedAt: SHOWN, fallbackAt: null });
    });

    it('once a later press lands: one prepared stamp, the shown batch’s while its ideas wait, else the fallback’s', () => {
      expect(waitingList([row('p1')], [press(row('f1')), fallback(row('h1'))], SHOWN)).toMatchObject({ preparedAt: SHOWN, fallbackAt: null });
      expect(waitingList([row('p1', 'added')], [press(row('f1')), fallback(row('h1'))], SHOWN)).toMatchObject({ preparedAt: HIDDEN, fallbackAt: null });
      expect(waitingList([row('p1', 'added')], [press(row('f1')), fallback(row('h1', 'dropped'))], SHOWN)).toMatchObject({ preparedAt: null, fallbackAt: null });
    });
  });

  it('a prepared fresh batch (the K64 fallback) joins as fresh, never tagged live; newest groups first, as given', () => {
    const fallback: FreshGroup = { source: 'prepared', preparedAt: new Date('2026-10-20T02:30:00Z'), rows: [row('h1')] };
    const press: FreshGroup = { source: 'live', preparedAt: null, liveAt: new Date('2026-10-21T12:15:00Z'), rows: [row('f1')] };
    const list = waitingList([row('p1')], [press, fallback]);
    expect(list.rows.map((r) => [r.id, r.live ?? false])).toEqual([['f1', true], ['h1', false], ['p1', false]]);
    expect(list.liveAt).toEqual(new Date('2026-10-21T12:15:00Z'));
  });

  it('K157: the newest live press that found nothing new says so; an older one does not', () => {
    const empty: FreshGroup = { source: 'live', preparedAt: null, rows: [] };
    expect(waitingList([row('p1')], [empty]).nothingNew).toBe(true);
    expect(waitingList([row('p1')], [{ source: 'live', preparedAt: null, rows: [row('f1')] }, empty]).nothingNew).toBe(false);
    expect(waitingList([row('p1')], []).nothingNew).toBe(false);
  });
});

describe('freshGroup (W62: a fresh batch shows only its ideas)', () => {
  it('drops every link, an off-map end or a cross link alike, and keeps each idea with its state', () => {
    const offMap: ConceptSuggestion = { suggestionId: 'l1', kind: 'edge', status: 'pending', sourceConceptId: 'c-otters', targetConceptId: 'c-elsewhere', class: 'lateral', rationale: '' };
    const cross: ConceptSuggestion = { suggestionId: 'l2', kind: 'edge', status: 'pending', sourceConceptId: 'c-desal', targetConceptId: 'c-root', class: 'hierarchy', rationale: '' };
    const g = freshGroup(
      { source: 'live', preparedAt: null, rows: [{ suggestion: idea('n1', 'Brine reuse'), state: 'pending' }, { suggestion: offMap, state: 'pending' }, { suggestion: cross, state: 'pending' }, { suggestion: idea('n2', 'Solar desalination'), state: 'added' }] },
      MAP,
    );
    expect(g.rows.map((r) => [r.id, r.title, r.state])).toEqual([
      ['n1', 'Brine reuse', 'pending'],
      ['n2', 'Solar desalination', 'added'],
    ]);
  });
});
