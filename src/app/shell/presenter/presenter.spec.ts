import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { ReadinessService } from '../../kiosk-api/readiness.service';
import { readinessExample } from '../../kiosk-api/readiness.testing';
import { ResetService, ResetStatus } from '../../kiosk-api/reset.service';
import { LiveService } from '../../live/live.service';
import { provideLive } from '../../live/live.providers';
import { IDLE_WAIT_KEY } from '../idle-wait';
import { KioskStore } from '../kiosk.store';
import { ResetCardComponent } from '../reset-card.component';
import { PresenterPanelComponent } from './presenter-panel.component';

const tick = () => new Promise((r) => setTimeout(r, 0));

async function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive()],
  });
  await TestBed.inject(KioskLanguage).ready();
  const store = TestBed.inject(KioskStore);
  const backend = TestBed.inject(HttpTestingController);
  const f = TestBed.createComponent(PresenterPanelComponent);
  store.togglePresenter();
  await f.whenStable();
  const el = f.nativeElement as HTMLElement;
  const click = async (sel: string) => {
    (el.querySelector(sel) as HTMLElement).click();
    await f.whenStable();
  };
  return { store, backend, f, el, click };
}

describe('the presenter panel (K19, D3)', () => {
  it('opens on Run: the jumps, the status buttons, the talking point and the keys', async () => {
    const { el } = await setup();
    expect(el.querySelector('.p-head b')!.textContent).toBe('Presenter');
    expect([...el.querySelectorAll('.p-tabs button')].map((b) => b.textContent!.trim())).toEqual([
      'Run',
      'Talking points',
      'Readiness',
      'Sessions',
    ]);
    const jumps = [...el.querySelectorAll('[data-act="jump"]')] as HTMLButtonElement[];
    expect(jumps.map((b) => b.dataset['to'])).toEqual([
      'idle', 'h1', 'h2', 'h3', 'h4', 'h5', 'hall', 'maps', 'comp', 'dash', 'grade', 'engine', 'crews', 'safety', 'gov', 'local',
    ]);
    expect(jumps[1].textContent!.trim()).toBe('1 Your map');
    expect(jumps[0].classList.contains('on')).toBe(true);
    expect(el.querySelector('.p-talk')!.textContent).toContain('Invite them in');
    expect(el.querySelector('.p-keys')!.textContent).toContain('start over (resets)');
  });

  it('a jump whose scene is not built yet is off, and says so', async () => {
    const { el } = await setup();
    const h3 = el.querySelector('[data-act="jump"][data-to="h3"]') as HTMLButtonElement;
    expect(h3.disabled).toBe(true);
    expect((el.querySelector('[data-act="jump"][data-to="idle"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('Reset everything ends the demo session; the idle timer pauses and resumes; the credits play', async () => {
    const { store, el, click } = await setup();
    const end = vi.spyOn(store, 'endSession').mockResolvedValue();
    await click('[data-act="resetAll"]');
    expect(end).toHaveBeenCalledTimes(1);
    await click('[data-act="pauseIdle"]');
    expect(store.idlePaused()).toBe(true);
    expect(el.querySelector('[data-act="pauseIdle"]')!.textContent).toContain('Resume the idle timer');
    await click('[data-act="playCredits"]');
    expect(store.creditsShown()).toBe(true);
  });

  it('K143: Run sets the idle reset to 2, 5, 8 or 15 minutes, 8 at first; the pause stays', async () => {
    localStorage.removeItem(IDLE_WAIT_KEY);
    const { store, el, click } = await setup();
    expect(el.querySelector('.p-idle-wait .p-sec')!.textContent).toBe('Reset when idle for');
    const waits = () => [...el.querySelectorAll('[data-act="idleMinutes"]')] as HTMLButtonElement[];
    const pressed = () => waits().filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset['min']);
    expect(waits().map((b) => b.textContent!.trim())).toEqual(['2 min', '5 min', '8 min', '15 min']);
    expect(pressed()).toEqual(['8']);
    expect(waits().filter((b) => b.classList.contains('on')).map((b) => b.dataset['min'])).toEqual(['8']);
    await click('[data-act="idleMinutes"][data-min="5"]');
    expect(store.idleMinutes()).toBe(5);
    expect(pressed()).toEqual(['5']);
    expect(waits().filter((b) => b.getAttribute('aria-pressed') === 'false')).toHaveLength(3);
    expect(el.querySelector('[data-act="pauseIdle"]')).not.toBeNull();
    localStorage.removeItem(IDLE_WAIT_KEY);
  });

  it('turns live calls off for a bad network, and back on', async () => {
    const { el, click } = await setup();
    const live = TestBed.inject(LiveService);
    await click('[data-act="liveSim"]');
    expect(live.presenterOff()).toBe(true);
    expect(el.querySelector('[data-act="liveSim"]')!.textContent).toContain('Turn live calls back on');
    await click('[data-act="liveSim"]');
    expect(live.presenterOff()).toBe(false);
  });

  it('Talking points shows now and next', async () => {
    const { store, el, click } = await setup();
    store.openScene('hall');
    await click('[data-act="ptab"][data-tab="talk"]');
    const talks = el.querySelectorAll('.p-talk');
    expect(talks[0].textContent).toContain('Match the exhibit to the person');
    // K140: a released grade grows the active Companion, so the hall's beat steers visitors to Companions first.
    expect(talks[0].textContent).toContain('Show Companions before Grading');
    expect(talks[1].textContent).toContain('This is Chora’s real map');
  });

  it('K155: step 4’s talking point says the critic accepted the draft, never that it flagged anything', async () => {
    const { store, el, click, f } = await setup();
    store.setTalkKey('h4');
    await click('[data-act="ptab"][data-tab="talk"]');
    const now = () => el.querySelectorAll('.p-talk')[0].textContent?.replace(/\s+/g, ' ').trim();
    expect(now()).toContain(
      'Same person, now a teacher. The critic AI accepted this draft, but one option could also be right: ask the AI for a new draft, or edit it by hand. The teacher stays in charge.',
    );
    await TestBed.inject(KioskLanguage).setLang('zh');
    await f.whenStable();
    expect(now()).toContain('审题 AI 通过了这份草稿，但有一个选项也可能是对的');
    expect(now()).not.toContain('指出了文字上的问题');
  });

  it('Readiness reads the conductor, shows the live row first and checks again on request', async () => {
    const { el, click, backend, f } = await setup();
    await click('[data-act="ptab"][data-tab="ready"]');
    const get = backend.expectOne((r) => r.method === 'GET' && r.url === '/api/v1/kiosk/readiness');
    get.flush(
      readinessExample({
        snapshot: { state: 'ok', prepared_at: '2026-10-20T06:02:00Z', restored_at: null, marker: 'match' },
        last_reset: { outcome: 'failed', finished_at: '2026-10-20T06:40:00Z', took_s: 12, failed_phase: 'restoring_data', failed_step: 'rebootstrap_emulator' },
      }),
    );
    await tick();
    await f.whenStable();
    const rows = [...el.querySelectorAll('.p-row')].map((r) => r.textContent!.trim());
    expect(rows[0]).toBe('Live calls: on. The opening check at 20 Oct, 09:00 reached every model.');
    expect(rows).toContain('Prepared start: made 20 Oct, 14:02; the last reset failed part way, so do not start a demo session');
    expect(rows).toContain('Ollama key: works');
    expect(rows).toContain('Google Vertex AI key: works · live pictures today: 9 of 50 (this computer’s daily cap)');
    expect(rows.some((r) => r.startsWith('Last reset failed at: ') && r.endsWith(', while rebuilding the message queues'))).toBe(true);
    expect(rows.join('\n')).not.toMatch(/spend/);
    const checkAgain = vi.spyOn(TestBed.inject(ReadinessService), 'checkAgain').mockResolvedValue();
    await click('[data-act="readyAgain"]');
    expect(checkAgain).toHaveBeenCalledTimes(1);
  });

  it('Sessions reads today’s anonymous counts, and says so when it cannot', async () => {
    const { el, click, backend, f } = await setup();
    await click('[data-act="ptab"][data-tab="visits"]');
    backend
      .expectOne((r) => r.method === 'GET' && r.url === '/api/v1/kiosk/visits')
      .flush({ day: '2026-10-20', counts: { started: 40, hook_done: 30, hall: 20, maps: 10, comp: 0, dash: 5, grade: 6, engine: 7 } });
    await tick();
    await f.whenStable();
    const lines = [...el.querySelectorAll('.p-visit')].map((r) => `${r.querySelector('span')!.textContent!.trim()}=${r.querySelector('b')!.textContent}`);
    expect(lines.slice(0, 2)).toEqual(['Hook started=40', 'Hook finished=30']);
    expect(lines).toHaveLength(8);
    expect((el.querySelectorAll('.p-visit .bar i')[2] as HTMLElement).style.width).toBe('50%');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await click('[data-act="ptab"][data-tab="run"]');
    await click('[data-act="ptab"][data-tab="visits"]');
    // A count past "Hook started" (Grading is counted per visit; D8's stack walk, 19 Oct: 6 against 4) is the
    // longest bar, and no bar runs past its track: the mockup scaled by "Hook started" and drew 150%, clipped.
    backend.expectOne('/api/v1/kiosk/visits').flush({ day: '2026-10-20', counts: { started: 4, hook_done: 3, hall: 3, maps: 2, comp: 3, dash: 3, grade: 6, engine: 0 } });
    await tick();
    await f.whenStable();
    expect([...el.querySelectorAll('.p-visit .bar i')].map((i) => (i as HTMLElement).style.width)).toEqual(['67%', '50%', '50%', '33%', '50%', '50%', '100%', '0%']);
    await click('[data-act="ptab"][data-tab="run"]');
    await click('[data-act="ptab"][data-tab="visits"]');
    backend.expectOne('/api/v1/kiosk/visits').flush({}, { status: 503, statusText: 'Unavailable' });
    await tick();
    await f.whenStable();
    expect(el.querySelector('.p-body')!.textContent).toContain('The counts could not be read right now.');
    vi.restoreAllMocks();
  });

  it('the × closes it', async () => {
    const { store, click } = await setup();
    await click('.p-head .x');
    expect(store.presenterOpen()).toBe(false);
  });
});

describe('the reset card (K70, K112, ADR-260 D9)', () => {
  async function card(status: ResetStatus | null, unreachable = false) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideKioskI18n(),
        { provide: ResetService, useValue: { status: () => status, unreachable: () => unreachable } },
      ],
    });
    await TestBed.inject(KioskLanguage).ready();
    const f = TestBed.createComponent(ResetCardComponent);
    await f.whenStable();
    return f.nativeElement as HTMLElement;
  }
  const phase = (id: string, state: string) => ({ id, state, started_at: null, finished_at: null });

  it('ticks off the conductor’s phases in plain words, with the measured estimate', async () => {
    const el = await card({
      reset_id: 'r',
      state: 'running',
      phase: 'restoring_data',
      phases: [phase('pausing', 'done'), phase('restoring_data', 'running'), phase('clearing_queues_and_pictures', 'pending'), phase('starting', 'pending')],
      started_at: '',
      finished_at: null,
      took_s: null,
      estimate_s: 31,
      failed_phase: null,
      failed_step: null,
    } as ResetStatus);
    expect(el.querySelector('h2')!.textContent).toBe('Getting ready for the next visitor');
    expect(el.querySelector('.rc-in > p')!.textContent).toBe('Putting everything back to the prepared start. This takes about 31 seconds.');
    const items = [...el.querySelectorAll('.rc-steps li')];
    expect(items.map((li) => li.className)).toEqual(['done', 'run', '', '']);
    expect(items[1].textContent).toContain('Putting back the prepared maps, questions and Companions');
    expect(items[0].querySelector('svg')).not.toBeNull();
    expect(el.querySelector('.rc-why')!.textContent).toBe('Every visitor starts from the same prepared start.');
    expect(el.querySelector('.rc-failed')).toBeNull();
    expect(el.querySelector('.rc-ring')).not.toBeNull();
  });

  it('follows a phase list of another length as sent', async () => {
    const el = await card({
      state: 'running',
      phases: [phase('pausing', 'running'), phase('starting', 'pending')],
      estimate_s: 20,
    } as unknown as ResetStatus);
    expect(el.querySelectorAll('.rc-steps li').length).toBe(2);
  });

  it('before any reset was measured it gives no number of seconds', async () => {
    const el = await card({ state: 'running', phases: [], estimate_s: null } as unknown as ResetStatus);
    expect(el.querySelector('.rc-in > p')!.textContent).toBe('Putting everything back to the prepared start.');
  });

  it('a failed reset stops the spinner and asks for the presenter', async () => {
    const el = await card({
      state: 'failed',
      phases: [phase('pausing', 'done'), phase('restoring_data', 'failed')],
      estimate_s: 31,
      failed_phase: 'restoring_data',
      failed_step: 'guard_marker',
    } as unknown as ResetStatus);
    expect(el.querySelector('.rc-ring')).toBeNull();
    expect(el.querySelector('.rc-failed')!.textContent).toBe('Chora could not get ready. Please ask the presenter.');
  });

  it('an unreachable conductor reads as failed too', async () => {
    const el = await card({ state: 'failed', phases: [], estimate_s: null } as unknown as ResetStatus, true);
    expect(el.querySelector('.rc-failed')).not.toBeNull();
  });
});
