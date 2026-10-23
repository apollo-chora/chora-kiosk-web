import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../i18n/i18n';
import { ResetPhase, ResetService, ResetStatus } from '../kiosk-api/reset.service';
import { ResetCardComponent } from './reset-card.component';

const RING = 2 * Math.PI * 28;
const phase = (id: ResetPhase['id'], state: ResetPhase['state']): ResetPhase => ({ id, state, started_at: null, finished_at: null });

function running(over: Partial<ResetStatus> = {}): ResetStatus {
  return {
    reset_id: 'r1',
    state: 'running',
    phase: 'restoring_data',
    phases: [phase('pausing', 'done'), phase('restoring_data', 'running'), phase('clearing_queues_and_pictures', 'pending'), phase('starting', 'pending')],
    started_at: '2026-10-21T12:07:24Z',
    finished_at: null,
    took_s: null,
    estimate_s: 32,
    failed_phase: null,
    failed_step: null,
    ...over,
  };
}

async function card(first: ResetStatus | null, unreachable = false) {
  const resets = { status: signal<ResetStatus | null>(first), unreachable: signal(unreachable) };
  TestBed.configureTestingModule({ providers: [...provideKioskI18n(), { provide: ResetService, useValue: resets }] });
  const lang = TestBed.inject(KioskLanguage);
  await lang.ready();
  // Fake timers hold zoneless change detection's own timer, so each test drives it.
  const f = TestBed.createComponent(ResetCardComponent);
  f.detectChanges();
  const el = f.nativeElement as HTMLElement;
  const later = (ms: number) => {
    vi.advanceTimersByTime(ms);
    f.detectChanges();
  };
  return { resets, lang, f, el, later };
}

const ring = (el: HTMLElement) => el.querySelector('.rc-ring');
const fill = (el: HTMLElement) => Number(ring(el)!.getAttribute('data-fill'));
const secs = (el: HTMLElement) => el.querySelector('.rc-secs')!.textContent!.trim();
const turning = (el: HTMLElement) => ring(el)!.classList.contains('rc-turning');
/** Angular's own scheduler timers run out; what is left is the card's tick. */
const timersLeft = () => {
  vi.runOnlyPendingTimers();
  return vi.getTimerCount();
};

describe('the reset card while it waits (W56)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('says, under the estimate, that it may take a minute or so', async () => {
    const { el } = await card(running());
    const estimate = el.querySelector('.rc-in > p')!;
    expect(estimate.textContent).toBe('Putting everything back to the prepared start. This takes about 32 seconds.');
    expect(estimate.nextElementSibling!.classList.contains('rc-note')).toBe(true);
    expect(el.querySelector('.rc-note')!.textContent).toBe('It may take a minute or so. Thank you for waiting.');
  });

  it('says it in Chinese under 中文', async () => {
    const { f, el, lang } = await card(running());
    await lang.setLang('zh');
    f.detectChanges();
    expect(el.querySelector('.rc-note')!.textContent).toBe('可能需要一分钟左右，感谢你耐心等待。');
    expect(secs(el)).toBe('0 秒');
  });

  it('fills the ring over the measured estimate and counts the seconds up inside it', async () => {
    const { el, later } = await card(running());
    expect(el.querySelector('.rc-spin')).toBeNull();
    expect(fill(el)).toBe(0);
    expect(secs(el)).toBe('0 s');
    expect(turning(el)).toBe(false);
    later(16_000);
    expect(secs(el)).toBe('16 s');
    expect(fill(el)).toBeCloseTo(0.45, 2);
    // The drawn arc is the fill, not a number beside it.
    const offset = Number(el.querySelector('.rc-arc')!.getAttribute('stroke-dashoffset'));
    expect(offset).toBeCloseTo(RING * (1 - fill(el)), 0);
    expect(turning(el)).toBe(false);
    later(15_000);
    expect(fill(el)).toBeGreaterThan(0.85);
    expect(turning(el)).toBe(false);
  });

  it('past the estimate the ring holds near full and turns, and the seconds keep counting', async () => {
    const { el, later } = await card(running());
    later(33_000);
    expect(turning(el)).toBe(true);
    const held = fill(el);
    expect(held).toBeGreaterThan(0.85);
    expect(held).toBeLessThan(1);
    later(20_000);
    expect(fill(el)).toBe(held);
    expect(secs(el)).toBe('53 s');
    expect(turning(el)).toBe(true);
  });

  it('with no measured estimate the ring turns from the start and the seconds count', async () => {
    const { el, later } = await card(running({ estimate_s: null }));
    expect(el.querySelector('.rc-in > p')!.textContent).toBe('Putting everything back to the prepared start.');
    expect(turning(el)).toBe(true);
    later(5_000);
    expect(secs(el)).toBe('5 s');
  });

  it('before the conductor has answered the ring turns', async () => {
    const { el } = await card(null);
    expect(turning(el)).toBe(true);
    expect(secs(el)).toBe('0 s');
  });

  it('on the previous reset’s status, before the new one is answered, the ring turns; the new reset counts from its own start', async () => {
    const { resets, el, later } = await card(running({ reset_id: 'r0', state: 'done', phase: null, took_s: 31, estimate_s: 31 }));
    expect(turning(el)).toBe(true);
    later(2_000);
    resets.status.set(running());
    later(0);
    expect(turning(el)).toBe(false);
    expect(fill(el)).toBe(0);
    expect(secs(el)).toBe('0 s');
    later(4_000);
    expect(secs(el)).toBe('4 s');
  });

  it('a later reset counts from its own start, not the first one’s', async () => {
    const { resets, el, later } = await card(running());
    later(20_000);
    resets.status.set(running({ state: 'failed', failed_phase: 'restoring_data', failed_step: 'guard_marker' }));
    later(0);
    resets.status.set(running({ reset_id: 'r2' }));
    later(0);
    expect(secs(el)).toBe('0 s');
    expect(fill(el)).toBe(0);
  });

  it('the running phase is marked run, the finished ones done with their check', async () => {
    const { el } = await card(running());
    const items = [...el.querySelectorAll('.rc-steps li')];
    expect(items.map((li) => li.className)).toEqual(['done', 'run', '', '']);
    expect(items[0].querySelector('svg')).not.toBeNull();
    expect(items[1].querySelector('i')).not.toBeNull();
    expect(el.querySelector('.rc-why')!.textContent).toBe('Every visitor starts from the same prepared start.');
  });

  it('ticks only while the reset runs: once it is done no timer is left', async () => {
    const { resets, f } = await card(running());
    expect(timersLeft()).toBeGreaterThan(0);
    resets.status.set(running({ state: 'done', phase: null, took_s: 32 }));
    f.detectChanges();
    expect(timersLeft()).toBe(0);
  });

  it('ticks only while the card is up: destroyed, no timer is left', async () => {
    const { f } = await card(running());
    expect(timersLeft()).toBeGreaterThan(0);
    f.destroy();
    expect(timersLeft()).toBe(0);
  });

  it('a failed reset shows no ring and no note, only the failure line, and nothing ticks', async () => {
    const { el } = await card(
      running({ state: 'failed', phases: [phase('pausing', 'done'), phase('restoring_data', 'failed')], failed_phase: 'restoring_data', failed_step: 'guard_marker' }),
    );
    expect(ring(el)).toBeNull();
    expect(el.querySelector('.rc-note')).toBeNull();
    const failed = el.querySelector('.rc-failed')!;
    expect(failed.getAttribute('role')).toBe('alert');
    expect(failed.textContent).toBe('Chora could not get ready. Please ask the presenter.');
    expect(timersLeft()).toBe(0);
  });

  it('an unreachable conductor reads as failed: no ring', async () => {
    const { el } = await card(running(), true);
    expect(ring(el)).toBeNull();
    expect(el.querySelector('.rc-failed')).not.toBeNull();
    expect(timersLeft()).toBe(0);
  });
});

describe('the reset card under prefers-reduced-motion (W56)', () => {
  it('stops the ring’s turn and the running dot’s spin and pulse; the fill and the seconds are not animations', async () => {
    TestBed.configureTestingModule({ providers: [...provideKioskI18n(), { provide: ResetService, useValue: { status: signal(running()), unreachable: signal(false) } }] });
    await TestBed.inject(KioskLanguage).ready();
    TestBed.createComponent(ResetCardComponent).detectChanges();
    // The card's own styles, as parsed (comments and prose are not rules).
    const reduced = [...document.styleSheets]
      .flatMap((s) => [...s.cssRules])
      .filter((r): r is CSSMediaRule => r instanceof CSSMediaRule && r.media.mediaText.includes('prefers-reduced-motion: reduce'))
      .flatMap((m) => [...m.cssRules] as CSSStyleRule[]);
    // Emulated encapsulation adds [_ngcontent-...] to each part of a selector.
    const stilled = (part: RegExp) => reduced.some((r) => part.test(r.selectorText) && r.style.getPropertyValue('animation') === 'none');
    expect(stilled(/\.rc-turn(?![\w-])/)).toBe(true);
    expect(stilled(/li\.run\S*\s+i(?![\w-])/)).toBe(true);
  });
});
