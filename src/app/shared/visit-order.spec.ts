import { TestBed } from '@angular/core/testing';

import { VISIT_RANDOM, VisitOrder, VisitOrderPipe } from './visit-order';
import { seededRandom } from './visit-order.testing';

// K149: the serve door orders a question's options by a hash of their text (F40), fair over many
// questions but the same for every visitor, so step 3's prepared answer sat at D for all of them.
// kiosk-web draws one order per question per demo session.
describe('VisitOrder (K149): one order per question per demo session', () => {
  const opts = (...ids: string[]) => ids.map((id) => ({ optionId: id, text: `text ${id}` }));
  const ids = (xs: readonly { optionId: string }[]) => xs.map((o) => o.optionId);
  const byId = (o: { optionId: string }) => o.optionId;

  function setup(seed: number) {
    TestBed.configureTestingModule({ providers: [{ provide: VISIT_RANDOM, useValue: seededRandom(seed) }] });
    return TestBed.inject(VisitOrder);
  }

  it('shows a question’s own options in a drawn order, every option once', () => {
    const order = setup(7);
    const shown = order.options(opts('a', 'b', 'c', 'd'), byId);
    expect([...ids(shown)].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(ids(shown)).not.toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps the order for the session: a re-render, a re-read or Back shows the same order', () => {
    const order = setup(7);
    const served = opts('a', 'b', 'c', 'd');
    const first = order.options(served, byId);
    expect(order.options(served, byId)).toBe(first);
    expect(ids(order.options(opts('a', 'b', 'c', 'd'), byId))).toEqual(ids(first));
    // The serve door's order may differ on a re-read; the question is the same set of options.
    expect(ids(order.options(opts('d', 'c', 'b', 'a'), byId))).toEqual(ids(first));
  });

  it('draws each question apart', () => {
    const order = setup(7);
    const a = ids(order.options(opts('a1', 'a2', 'a3', 'a4'), byId)).map((x) => x.slice(1));
    const b = ids(order.options(opts('b1', 'b2', 'b3', 'b4'), byId)).map((x) => x.slice(1));
    expect(a).not.toEqual(b);
  });

  it('the end of the session forgets every order: the next visitor gets a fresh draw', () => {
    const order = setup(7);
    const served = opts('a', 'b', 'c', 'd');
    const draws = new Set<string>();
    for (let i = 0; i < 6; i++) {
      draws.add(ids(order.options(served, byId)).join(''));
      order.forget();
    }
    expect(draws.size).toBeGreaterThan(1);
  });

  it('is fair: over many questions an answer served first lands at each letter about a quarter of the time', () => {
    const order = setup(2026);
    const at = [0, 0, 0, 0];
    for (let q = 0; q < 4000; q++) at[ids(order.options(opts(`k${q}`, `x${q}`, `y${q}`, `z${q}`), byId)).indexOf(`k${q}`)]++;
    for (const n of at) expect(n / 4000).toBeGreaterThan(0.22);
    for (const n of at) expect(n / 4000).toBeLessThan(0.28);
  });

  it('two options with one id cannot be told apart: refused loudly', () => {
    const order = setup(7);
    expect(() => order.options(opts('a', 'a', 'b'), byId)).toThrow(/option id a twice/);
  });

  it('the pipe reads either id field and returns the same array while the session lasts', () => {
    setup(7);
    const pipe = TestBed.runInInjectionContext(() => new VisitOrderPipe());
    const served = opts('a', 'b', 'c', 'd');
    const once = pipe.transform(served);
    expect(pipe.transform(served)).toBe(once);
    const dose = [{ option_id: 'p' }, { option_id: 'q' }, { option_id: 'r' }];
    expect(pipe.transform(dose).map((o) => o.option_id).sort()).toEqual(['p', 'q', 'r']);
  });
});
