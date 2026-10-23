import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { LIVE_KINDS, LiveKind } from './live-kinds';
import { LIVE_EXECUTORS, LiveAvailability, LiveExecutor, LiveRunContext, LiveService } from './live.service';

// Test doubles for the seven kinds: each answers, fails or never answers as the case needs.
// The real executors are tested against Angular's HTTP testing tools in their own specs.
type Script = 'answer' | 'fail' | 'silent';

class ScriptedExecutor implements LiveExecutor<{ n: number }, string> {
  script: Script = 'answer';
  answerAfterMs = 1000;
  calls = 0;
  lastCtx: LiveRunContext | null = null;
  run(params: { n: number }, ctx: LiveRunContext): Promise<string> {
    this.calls++;
    this.lastCtx = ctx;
    if (this.script === 'silent') return new Promise(() => undefined);
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        ctx.stage((this as LiveExecutor<{ n: number }, string>).stagesFor?.(params)[0] ?? LIVE_KINDS[ctx.kind].stages[0], 'done');
        if (this.script === 'fail') reject(new Error('the job failed'));
        else resolve(`result ${params.n}`);
      }, this.answerAfterMs);
    });
  }
}
const ALL: LiveKind[] = ['q', 'sugg', 'words', 'picture', 'greet', 'grade', 'weak'];

function setup(opts: { text?: boolean; picture?: boolean; reader?: boolean; wired?: LiveKind[] } = {}) {
  const executors = Object.fromEntries((opts.wired ?? ALL).map((k) => [k, new ScriptedExecutor()])) as Partial<
    Record<LiveKind, ScriptedExecutor>
  >;
  const text = signal(opts.text ?? true);
  const picture = signal(opts.picture ?? true);
  const reader = signal(opts.reader ?? true);
  TestBed.configureTestingModule({
    providers: [
      { provide: LIVE_EXECUTORS, useValue: executors },
      { provide: LiveAvailability, useValue: { text: text.asReadonly(), picture: picture.asReadonly(), reader: reader.asReadonly() } },
    ],
  });
  return { live: TestBed.inject(LiveService), executors, text, picture, reader };
}

describe('LiveService: the one door to a model (T3.4, ADR-259 D11)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('names seven kinds with the K48 budgets: 20 s for one model, 45 s for a crew or a picture', () => {
    expect(Object.keys(LIVE_KINDS).sort()).toEqual([...ALL].sort());
    expect(LIVE_KINDS.sugg.limitMs).toBe(20_000);
    expect(LIVE_KINDS.greet.limitMs).toBe(20_000);
    expect(LIVE_KINDS.q.limitMs).toBe(45_000);
    expect(LIVE_KINDS.words.limitMs).toBe(45_000);
    expect(LIVE_KINDS.grade.limitMs).toBe(45_000);
    expect(LIVE_KINDS.picture.limitMs).toBe(45_000);
    expect(LIVE_KINDS.picture.providers).toEqual(['text', 'picture']);
    expect(LIVE_KINDS.words.providers).toEqual(['text']);
    // K158 D8: the weakness analyser reads on the reader tier alone; one stage, as nothing reports its two agents apart (F45).
    expect(LIVE_KINDS.weak.limitMs).toBe(45_000);
    expect(LIVE_KINDS.weak.providers).toEqual(['reader']);
    expect(LIVE_KINDS.weak.stages).toEqual(['companion']);
  });

  it('K158 D8: the weakness analyser follows the reader alone: on with text off, off with the reader off', () => {
    const textOff = setup({ text: false, picture: false });
    expect(textOff.live.canPress('weak')()).toBe(true);
    expect(textOff.live.canPress('q')()).toBe(false);
    TestBed.resetTestingModule();
    const readerOff = setup({ reader: false });
    expect(readerOff.live.whyOff('weak')()).toBe('off');
    expect(readerOff.live.canPress('q')()).toBe(true);
  });

  for (const kind of ALL) {
    describe(`kind ${kind}`, () => {
      it('answer: calling, then done with the result, stamped as just now', async () => {
        const { live, executors } = setup();
        const p = live.press(`${kind}:x`, kind, { n: 1 });
        const calling = live.state(`${kind}:x`)();
        expect(calling?.status).toBe('calling');
        expect(live.busy()).toBe(`${kind}:x`);
        await vi.advanceTimersByTimeAsync(1000);
        const done = await p;
        expect(done).toMatchObject({ status: 'done', kind, result: 'result 1' });
        expect(done.status === 'done' && done.at.getTime()).toBe(Date.now());
        expect(live.busy()).toBeNull();
        expect(executors[kind]!.calls).toBe(1);
      });

      it('late: no answer within its budget is a miss, labelled late, and the call is let go', async () => {
        const { live, executors } = setup();
        executors[kind]!.script = 'silent';
        const p = live.press(`${kind}:x`, kind, { n: 1 });
        await vi.advanceTimersByTimeAsync(LIVE_KINDS[kind].limitMs - 1);
        expect(live.state(`${kind}:x`)()?.status).toBe('calling');
        await vi.advanceTimersByTimeAsync(1);
        expect(await p).toMatchObject({ status: 'missed', reason: 'late', kind });
        expect(executors[kind]!.lastCtx!.signal.aborted).toBe(true);
        expect(live.busy()).toBeNull();
      });

      it('failed: an error is a miss, labelled failed, and reported loudly', async () => {
        const { live, executors } = setup();
        const errors: string[] = [];
        const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errors.push(a.join(' ')));
        executors[kind]!.script = 'fail';
        const p = live.press(`${kind}:x`, kind, { n: 1 });
        await vi.advanceTimersByTimeAsync(1000);
        expect(await p).toMatchObject({ status: 'missed', reason: 'failed', kind });
        expect(errors.join('\n')).toMatch(new RegExp(`\\[kiosk\\] LIVE ${kind}:x failed: .*the job failed`));
        spy.mockRestore();
      });

      it('off: with its provider down at the opening check, it cannot be pressed', async () => {
        const provider = kind === 'picture' ? 'picture' : kind === 'weak' ? 'reader' : 'text';
        const { live, executors } = setup({ [provider]: false });
        expect(live.canPress(kind)()).toBe(false);
        expect(live.whyOff(kind)()).toBe('off');
        await expect(live.press(`${kind}:x`, kind, { n: 1 })).rejects.toThrow(/LIVE .* is off/);
        expect(executors[kind]!.calls).toBe(0);
      });
    });
  }

  it('one call at a time: a second press while one runs is refused, and the button says busy', async () => {
    const { live, executors } = setup();
    void live.press('words:a', 'words', { n: 1 });
    expect(live.canPress('sugg')()).toBe(false);
    expect(live.whyOff('sugg')()).toBe('busy');
    await expect(live.press('sugg:b', 'sugg', { n: 2 })).rejects.toThrow(/another LIVE call is running/);
    expect(executors.sugg!.calls).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(live.canPress('sugg')()).toBe(true);
  });

  it('a picture needs the picture provider too; text kinds do not', () => {
    const { live } = setup({ picture: false });
    expect(live.canPress('picture')()).toBe(false);
    expect(live.canPress('words')()).toBe(true);
  });

  it('only the opening check turns LIVE off: a failed press leaves the kind pressable (K106)', async () => {
    const { live, executors } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    executors.words!.script = 'fail';
    const p = live.press('words:a', 'words', { n: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    await p;
    expect(live.canPress('words')()).toBe(true);
  });

  it('LIVE comes back on when a new opening check passes', () => {
    const { live, text } = setup({ text: false });
    expect(live.canPress('greet')()).toBe(false);
    text.set(true);
    expect(live.canPress('greet')()).toBe(true);
  });

  it('the presenter can turn every kind off for a bad network, and back on (K19 presenter panel)', async () => {
    const { live } = setup();
    expect(live.presenterOff()).toBe(false);
    live.setPresenterOff(true);
    for (const kind of ALL) expect(live.whyOff(kind)()).toBe('off');
    await expect(live.press('words:a', 'words', { n: 1 })).rejects.toThrow(/LIVE words is off: the presenter turned live calls off/);
    live.setPresenterOff(false);
    expect(live.canPress('words')()).toBe(true);
  });

  it('a kind with no wired executor is off, says so, and is never faked', async () => {
    const { live } = setup({ wired: ['words'] });
    expect(live.canPress('q')()).toBe(false);
    expect(live.whyOff('q')()).toBe('not_wired');
    await expect(live.press('q:a', 'q', { n: 1 })).rejects.toThrow(/LIVE q is not wired/);
  });

  it('stages tick off as the executor reports them, in the kind’s order', async () => {
    const { live } = setup();
    const p = live.press('words:a', 'words', { n: 1 });
    const before = live.state('words:a')();
    expect(before?.status === 'calling' && before.stages).toEqual([
      { id: 'writer', state: 'running' },
      { id: 'critic', state: 'pending' },
    ]);
    await vi.advanceTimersByTimeAsync(1000);
    await p;
  });

  it('a stage report moves the next stage to running', async () => {
    const { live, executors } = setup();
    executors.grade!.script = 'silent';
    void live.press('grade:a', 'grade', { n: 1 });
    executors.grade!.lastCtx!.stage('evaluator', 'done');
    const s = live.state('grade:a')();
    expect(s?.status === 'calling' && s.stages).toEqual([
      { id: 'evaluator', state: 'done' },
      { id: 'moderator', state: 'running' },
    ]);
    expect(() => executors.grade!.lastCtx!.stage('writer' as never, 'done')).toThrow(/grade has no stage writer/);
  });

  it('Stop waiting lets the call go, clears its state and frees the door; a late answer changes nothing', async () => {
    const { live, executors } = setup();
    const p = live.press('words:a', 'words', { n: 1 });
    live.stopWaiting();
    expect(live.state('words:a')()).toBeUndefined();
    expect(live.busy()).toBeNull();
    expect(executors.words!.lastCtx!.signal.aborted).toBe(true);
    expect(await p).toMatchObject({ status: 'stopped' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(live.state('words:a')()).toBeUndefined();
  });

  it('keeps each subject apart: a result never labels a different question (QA r4 E1-1)', async () => {
    const { live } = setup();
    const p = live.press('q:water:res', 'q', { n: 7 });
    await vi.advanceTimersByTimeAsync(1000);
    await p;
    expect(live.state('q:water:res')()?.status).toBe('done');
    expect(live.state('q:water:taps')()).toBeUndefined();
  });

  it('clear forgets a finished result once the screen shows something else, never a running call', async () => {
    const { live, executors } = setup();
    const done = live.press('words:a', 'words', { n: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    live.clear('words:a');
    expect(live.state('words:a')()).toBeUndefined();
    executors.words!.script = 'silent';
    void live.press('words:a', 'words', { n: 2 });
    live.clear('words:a');
    expect(live.state('words:a')()?.status).toBe('calling');
    expect(live.busy()).toBe('words:a');
  });

  it('K186: a key that has its live result is never pressed again this demo session; a miss may be, until one lands', async () => {
    const { live, executors } = setup();
    executors.sugg!.script = 'fail';
    const missed = live.press('sugg:water:res', 'sugg', { n: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    expect((await missed).status).toBe('missed');
    executors.sugg!.script = 'answer';
    const retry = live.press('sugg:water:res', 'sugg', { n: 2 });
    await vi.advanceTimersByTimeAsync(1000);
    expect((await retry).status).toBe('done');
    await expect(live.press('sugg:water:res', 'sugg', { n: 3 })).rejects.toThrow(/sugg:water:res already has its live result this demo session \(K186\)/);
    expect(executors.sugg!.calls).toBe(2);
    expect(live.state('sugg:water:res')()?.status).toBe('done');
    // A new request on the same row (K189: a new typed change in 4a or 4b) clears the key first.
    live.clear('sugg:water:res');
    const fresh = live.press('sugg:water:res', 'sugg', { n: 4 });
    await vi.advanceTimersByTimeAsync(1000);
    expect((await fresh).status).toBe('done');
    // A new demo session starts every key afresh.
    live.endSession();
    const next = live.press('sugg:water:res', 'sugg', { n: 5 });
    await vi.advanceTimersByTimeAsync(1000);
    expect((await next).status).toBe('done');
  });

  it('K186: a live result spends its subject on every exhibit (the story’s press spends the atlas’s and Companions’ row), until a reset', async () => {
    const { live } = setup();
    expect(live.spentAt('sugg:water:desal')()).toBeNull();
    const p = live.press('sugg:hook:desal', 'sugg', { n: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    await p;
    const at = live.spentAt('sugg:water:desal')();
    expect(at).toBeInstanceOf(Date);
    expect(live.spentAt('sugg:comp:desal')()).toEqual(at);
    // Another subject, or the same subject's other kind, is not spent.
    expect(live.spentAt('sugg:water:res')()).toBeNull();
    expect(live.spentAt('q:water:desal')()).toBeNull();
    await expect(live.press('sugg:water:desal', 'sugg', { n: 2 })).rejects.toThrow(/sugg:water:desal already has its live result this demo session \(K186\)/);
    live.endSession();
    expect(live.spentAt('sugg:comp:desal')()).toBeNull();
  });

  it('gap (a): every press’s outcome reaches its listeners, whether or not the row that pressed is still on screen', async () => {
    const { live, executors } = setup();
    const heard: string[] = [];
    // W79: with the press's own params, so a listener can tell which answer or change the outcome is for.
    const stop = live.onOutcome((key, o, params) => heard.push(`${key} ${o.status} n=${(params as { n: number }).n}`));
    const done = live.press('sugg:comp:c1', 'sugg', { n: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    executors.q!.script = 'fail';
    const missed = live.press('q:comp:c1', 'q', { n: 2 });
    await vi.advanceTimersByTimeAsync(1000);
    await missed;
    executors.greet!.script = 'silent';
    void live.press('greet:comp:pingu', 'greet', { n: 3 });
    // W79: the visitor's "Stop waiting" is told too (the grading screen says so); a demo session's end is not.
    live.stopWaiting();
    await vi.advanceTimersByTimeAsync(1000);
    void live.press('greet:comp:nova', 'greet', { n: 5 });
    live.endSession();
    await vi.advanceTimersByTimeAsync(1000);
    expect(heard).toEqual(['sugg:comp:c1 done n=1', 'q:comp:c1 missed n=2', 'greet:comp:pingu stopped n=3']);
    stop();
    const after = live.press('sugg:comp:c2', 'sugg', { n: 4 });
    await vi.advanceTimersByTimeAsync(1000);
    await after;
    expect(heard).toHaveLength(3);
  });

  it('refuses a key that does not start with its kind', async () => {
    const { live } = setup();
    await expect(live.press('sugg:x', 'q', { n: 1 })).rejects.toThrow(/key sugg:x does not belong to kind q/);
  });

  it('counts the demo session’s presses, and the end of the session clears everything', async () => {
    const { live } = setup();
    const p = live.press('greet:pingu', 'greet', { n: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    await p;
    expect(live.presses()).toBe(1);
    live.endSession();
    expect(live.presses()).toBe(0);
    expect(live.state('greet:pingu')()).toBeUndefined();
  });

  it('K150: a press can name its own stages (a direct picture edit has no writer), and they tick off in that order', async () => {
    const { live, executors } = setup();
    (executors.picture as ScriptedExecutor & LiveExecutor).stagesFor = () => ['image'];
    const p = live.press('picture:b', 'picture', { n: 1 });
    expect(live.state('picture:b')()).toMatchObject({ status: 'calling', stages: [{ id: 'image', state: 'running' }] });
    await vi.advanceTimersByTimeAsync(1000);
    await p;
    expect(live.state('picture:b')()?.status).toBe('done');
  });

  it('the end of the session reaches every executor that keeps something for it (K144)', () => {
    const { live, executors } = setup();
    const ended: LiveKind[] = [];
    for (const k of ['q', 'words'] as const) (executors[k] as ScriptedExecutor & LiveExecutor).endSession = () => void ended.push(k);
    live.endSession();
    expect(ended).toEqual(['q', 'words']);
  });

  it('ending the session during a call lets it go', async () => {
    const { live, executors } = setup();
    executors.sugg!.script = 'silent';
    const p = live.press('sugg:a', 'sugg', { n: 1 });
    live.endSession();
    expect(executors.sugg!.lastCtx!.signal.aborted).toBe(true);
    expect(await p).toMatchObject({ status: 'stopped' });
    expect(live.busy()).toBeNull();
  });
});
