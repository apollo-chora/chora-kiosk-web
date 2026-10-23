import en from '../../i18n/en.json';
import zh from '../../i18n/zh.json';
import { Readiness, type LiveOffReason, type ResetStepId } from '../../kiosk-api/readiness.service';
import { readinessExample as body } from '../../kiosk-api/readiness.testing';
import { liveRow, readinessRows, type ReadyRow } from './readiness-rows';

const keys = (rows: ReturnType<typeof readinessRows>) => rows.map((r) => r.key);
const byKey = (rows: ReturnType<typeof readinessRows>) => Object.fromEntries(rows.map((r) => [r.key, r]));

describe('the presenter’s readiness rows (K19, K65, K101, K105; API.md section 3)', () => {
  it('a green board reads like the mockup’s, with the record’s own times and no spend row', () => {
    const rows = readinessRows(body(), 'en');
    expect(keys(rows)).toEqual([
      'ready.services.ok',
      'ready.snapshot.ok',
      'ready.ollama.works',
      'ready.vertex.works',
      'ready.net.up',
      'ready.reset.done',
      'ready.disk',
      'ready.models.valid',
      'ready.telemetry',
    ]);
    expect(rows.every((r) => r.state === 'ok')).toBe(true);
    expect(rows[1].params).toEqual({ when: '20 Oct, 14:02', restored: '20 Oct, 14:31' });
    expect(rows[3].params).toEqual({ used: 9, cap: 50 });
    expect(rows[5].params).toEqual({ when: '20 Oct, 14:31', s: 31 });
    // The conductor names every tier the models file holds, K158's reader among them.
    expect(rows[7].params).toEqual({ n: 7 });
    expect(JSON.stringify(rows)).not.toMatch(/spend|US\$|gemini|embed/);
  });

  it('writes record times in Chinese as 10月20日 14:02', () => {
    expect(readinessRows(body(), 'zh')[1].params).toEqual({ when: '10月20日 14:02', restored: '10月20日 14:31' });
  });

  it('turns a row red or amber when its check fails or warns', () => {
    const rows = byKey(
      readinessRows(
        body({
          services: { state: 'fail', running: 18, expected: 20, down: ['agent-qgen', 'chora-delivery'] },
          providers: { ollama: 'fails', vertex: 'unchecked' },
          internet: 'down',
          snapshot: { state: 'fail', prepared_at: '2026-10-20T06:02:00Z', restored_at: null, marker: 'mismatch' },
          disk: { state: 'warn', free_percent: 9 },
        }),
        'en',
      ),
    );
    expect(rows['ready.services.down']).toMatchObject({ state: 'bad', params: { running: 18, expected: 20, down: 'agent-qgen, chora-delivery' } });
    expect(rows['ready.snapshot.bad'].state).toBe('bad');
    expect(rows['ready.ollama.fails'].state).toBe('bad');
    expect(rows['ready.vertex.unchecked'].state).toBe('warn');
    expect(rows['ready.net.down'].state).toBe('bad');
    expect(rows['ready.disk']).toMatchObject({ state: 'warn', params: { n: 9 } });
  });

  it('a value the conductor could not read says so, never a zero that reads as a fact', () => {
    const rows = byKey(
      readinessRows(
        body({
          services: { state: 'fail', running: null, expected: null, down: [] },
          providers: {},
          pictures: null,
          disk: { state: 'fail', free_percent: null },
          model_config: { state: 'unavailable', roles: {} },
          memory: { state: 'fail', headroom_mib: null, unmeasured: ['chora-kiosk-conductor', 'docker-api-proxy'] },
        }),
        'en',
      ),
    );
    expect(rows['ready.services.unread'].state).toBe('bad');
    expect(rows['ready.providers.unread'].state).toBe('bad');
    expect(rows['ready.ollama.works']).toBeUndefined();
    expect(rows['ready.disk.unread'].state).toBe('bad');
    expect(rows['ready.models.unavailable'].state).toBe('bad');
    expect(rows['ready.memory.unmeasured'].state).toBe('bad');
    expect(JSON.stringify(Object.values(rows).map((r) => r.params))).not.toMatch(/null/);
  });

  it('Vertex AI working with the picture meter unread names no count', () => {
    const rows = byKey(readinessRows(body({ pictures: null }), 'en'));
    expect(rows['ready.vertex.worksNoMeter'].state).toBe('warn');
    expect(rows['ready.vertex.works']).toBeUndefined();
    expect(byKey(readinessRows(body({ pictures: { day: '2026-10-20', used: 50, cap: 50 } }), 'en'))['ready.vertex.works'].state).toBe('warn');
  });

  it('the snapshot’s marker: unknown wins, missing means no snapshot, and a failed reset leaves a part restore', () => {
    const snap = (marker: Readiness['snapshot']['marker'], state: Readiness['snapshot']['state'] = 'fail') =>
      keys(readinessRows(body({ snapshot: { state, prepared_at: marker === 'missing' ? null : '2026-10-20T06:02:00Z', restored_at: null, marker } }), 'en'))[1];
    expect(snap('unknown')).toBe('ready.snapshot.unknown');
    expect(snap('missing')).toBe('ready.snapshot.missing');
    expect(snap('mismatch')).toBe('ready.snapshot.bad');
    const partial = readinessRows(
      body({
        snapshot: { state: 'fail', prepared_at: '2026-10-20T06:02:00Z', restored_at: null, marker: 'match' },
        last_reset: { outcome: 'failed', finished_at: '2026-10-20T06:40:00Z', took_s: 12, failed_phase: 'restoring_data', failed_step: 'restore_database' },
      }),
      'en',
    )[1];
    expect(partial).toMatchObject({ key: 'ready.snapshot.partial', state: 'bad', params: { when: '20 Oct, 14:02' } });
  });

  it('says the prepared start was never restored before the first reset, and when no reset ran yet', () => {
    const rows = readinessRows(body({ snapshot: { state: 'ok', prepared_at: '2026-10-20T06:02:00Z', restored_at: null, marker: 'match' }, last_reset: null }), 'en');
    expect(keys(rows)).toContain('ready.snapshot.fresh');
    expect(keys(rows)).toContain('ready.reset.none');
  });

  it('names a failed reset by its phase and its step', () => {
    const rows = readinessRows(
      body({ last_reset: { outcome: 'failed', finished_at: '2026-10-20T06:40:00Z', took_s: 12, failed_phase: 'restoring_data', failed_step: 'rebootstrap_emulator' } }),
      'en',
    );
    expect(rows.find((r) => r.key === 'ready.reset.failedStep')).toMatchObject({ state: 'bad', phaseKey: 'reset.s2', stepKey: 'ready.step.rebootstrap_emulator' });
    const noStep = readinessRows(body({ last_reset: { outcome: 'failed', finished_at: 'x', took_s: 1, failed_phase: 'starting', failed_step: null } }), 'en');
    expect(noStep.find((r) => r.key === 'ready.reset.failed')).toMatchObject({ phaseKey: 'reset.s4' });
  });

  it('shows memory (spare under the caps, the two it does not measure named), ports and databases only when they warn or fail', () => {
    expect(keys(readinessRows(body(), 'en'))).not.toContain('ready.memory');
    const rows = readinessRows(
      body({ memory: { state: 'warn', headroom_mib: 300, unmeasured: ['chora-kiosk-conductor', 'docker-api-proxy'] }, ports: { state: 'fail', published: 2 }, databases: { state: 'fail' } }),
      'en',
    );
    expect(rows.find((r) => r.key === 'ready.memory')).toMatchObject({ state: 'warn', params: { mib: 300, names: 'chora-kiosk-conductor, docker-api-proxy' } });
    expect(rows.find((r) => r.key === 'ready.ports')).toMatchObject({ state: 'bad', params: { n: 2 } });
    expect(rows.find((r) => r.key === 'ready.databases')?.state).toBe('bad');
  });
});

describe('the reader row (K158 D8): the weakness analyser, shown only while its LIVE is off', () => {
  const readerOff = (why: LiveOffReason | null) => body({ live: { ...body().live, reader: { on: false, off_reason: why } } });

  it('a green board has no reader row', () => {
    expect(readinessRows(body(), 'en').some((r) => r.key === 'ready.readerOff')).toBe(false);
  });

  for (const why of ['no_reader_tier', 'not_checked', 'internet_down', 'vertex_fails', 'key_changed'] as const) {
    it(`off because ${why}: a warn row right after the providers, naming why`, () => {
      const rows = readinessRows(readerOff(why), 'en');
      const at = rows.findIndex((r) => r.key === 'ready.readerOff');
      expect(rows[at]).toEqual({ key: 'ready.readerOff', state: 'warn', params: {}, whyKey: `ready.why.${why}` });
      expect(rows[at - 1].key).toMatch(/^ready\.vertex\./);
      expect(rows[at + 1].key).toMatch(/^ready\.net\./);
    });
  }

  it('a conductor older than the reader tier (no live.reader) reads as not checked, never as on', () => {
    const r = body();
    const old = { ...r, live: { text: r.live.text, picture: r.live.picture } } as unknown as Readiness;
    expect(readinessRows(old, 'en').find((x) => x.key === 'ready.readerOff')).toMatchObject({ state: 'warn', whyKey: 'ready.why.not_checked' });
  });
});

describe('the live row (K65, K106; the off reasons in the order API.md section 3 rules)', () => {
  const off = (text: LiveOffReason | null, picture: LiveOffReason | null) => body({ live: { text: { on: text === null, off_reason: text }, picture: { on: picture === null, off_reason: picture }, reader: { on: true, off_reason: null } } });

  it('on, with the opening check’s day and time, as every other row names its day (W34: a check from yesterday read as today)', () => {
    expect(liveRow(body(), false, false, 'en')).toEqual({ key: 'ready.liveOn', state: 'ok', params: { t: '20 Oct, 09:00' } });
    expect(liveRow(body(), false, false, 'zh')).toEqual({ key: 'ready.liveOn', state: 'ok', params: { t: '10月20日 09:00' } });
  });

  for (const reason of ['model_gateway_down', 'not_checked', 'internet_down', 'ollama_fails', 'key_changed'] as const) {
    it(`text off because ${reason}: says so`, () => {
      expect(liveRow(off(reason, reason), false, false, 'en')).toEqual({ key: 'ready.liveOff', state: 'bad', params: {}, whyKey: `ready.why.${reason}` });
    });
  }

  for (const reason of ['model_gateway_down', 'not_checked', 'internet_down', 'vertex_fails', 'key_changed', 'picture_cap_spent'] as const) {
    it(`on except pictures because ${reason}: says why`, () => {
      expect(liveRow(off(null, reason), false, false, 'en')).toEqual({ key: 'ready.livePicOff', state: 'warn', params: {}, whyKey: `ready.why.${reason}` });
    });
  }

  it('while the check runs, before it ever ran, when the presenter turned it off, or when the conductor is unreachable', () => {
    expect(liveRow(body({ opening_check: { state: 'running', checked_at: null } }), false, false, 'en').key).toBe('ready.liveRunning');
    expect(liveRow(body({ opening_check: { state: 'never_run', checked_at: null } }), false, false, 'en')).toMatchObject({ key: 'ready.liveNever', state: 'bad' });
    expect(liveRow(body(), false, true, 'en')).toMatchObject({ key: 'ready.presenterOff', state: 'warn' });
    expect(liveRow(null, true, false, 'en')).toMatchObject({ key: 'ready.unreachable', state: 'bad' });
    expect(liveRow(body(), true, false, 'en')).toMatchObject({ key: 'ready.unreachable', state: 'bad' });
  });
});

describe('every row the board can show has its words in both languages', () => {
  it('each key, reason, phase and step the rows name is in the English and Chinese tables', () => {
    const reasons: LiveOffReason[] = ['model_gateway_down', 'not_checked', 'internet_down', 'ollama_fails', 'vertex_fails', 'key_changed', 'picture_cap_spent', 'no_reader_tier'];
    const steps: ResetStepId[] = ['stop_containers', 'guard_dsn', 'guard_marker', 'guard_tenant', 'restore_database', 'grant_connect', 'rebootstrap_emulator', 'restore_blob_root', 'start_containers', 'readiness'];
    const rows: ReadyRow[] = [
      ...reasons.flatMap((x) => [liveRow(body({ live: { text: { on: false, off_reason: x }, picture: { on: false, off_reason: x }, reader: { on: true, off_reason: null } } }), false, false, 'en'), liveRow(body({ live: { text: { on: true, off_reason: null }, picture: { on: false, off_reason: x }, reader: { on: true, off_reason: null } } }), false, false, 'en')]),
      ...reasons.flatMap((x) => readinessRows(body({ live: { ...body().live, reader: { on: false, off_reason: x } } }), 'en')),
      ...steps.flatMap((x) => readinessRows(body({ last_reset: { outcome: 'failed', finished_at: 'x', took_s: 1, failed_phase: 'starting', failed_step: x } }), 'en')),
      ...readinessRows(body({ services: { state: 'fail', running: null, expected: null, down: [] }, providers: {}, pictures: null, disk: { state: 'fail', free_percent: null }, model_config: { state: 'unavailable', roles: {} }, memory: { state: 'fail', headroom_mib: null, unmeasured: [] }, ports: { state: 'fail', published: 0 }, databases: { state: 'fail' } }), 'en'),
      ...readinessRows(body({ providers: { ollama: 'unchecked', vertex: 'fails' }, internet: 'unchecked', snapshot: { state: 'fail', prepared_at: null, restored_at: null, marker: 'unknown' }, memory: { state: 'warn', headroom_mib: 10, unmeasured: [] } }), 'en'),
      ...readinessRows(body({ snapshot: { state: 'fail', prepared_at: null, restored_at: null, marker: 'missing' }, pictures: null }), 'en'),
      liveRow(null, true, false, 'en'),
      liveRow(body(), false, true, 'en'),
      liveRow(body({ opening_check: { state: 'running', checked_at: null } }), false, false, 'en'),
      liveRow(body({ opening_check: { state: 'never_run', checked_at: null } }), false, false, 'en'),
    ];
    const named = new Set(rows.flatMap((r) => [r.key, r.whyKey, r.phaseKey, r.stepKey].filter((k): k is string => !!k)));
    const tables = [en, zh] as Record<string, string>[];
    const missing = [...named].filter((k) => tables.some((t) => !t[k]));
    expect(missing).toEqual([]);
    expect(named.size).toBeGreaterThan(40);
  });
});
