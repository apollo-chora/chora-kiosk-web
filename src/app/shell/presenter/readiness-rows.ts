import { KioskLang } from '../../i18n/i18n';
import { ProviderState, Readiness, RowState } from '../../kiosk-api/readiness.service';
import { ResetPhaseId } from '../../kiosk-api/reset.service';
import { formatWhen } from '../../shared/when';

/**
 * The presenter's readiness board (K19), built from the conductor's readiness body
 * (services/chora-kiosk-conductor/API.md section 3): the mockup's READY rows, with the record's
 * own times (K101) and no spend row (K105). A value the conductor could not read gets a row that
 * says so, never a number. Each row names its string key, the values it needs, and its dot: ok
 * (green), warn (amber), bad (red), as the mockup's p-row classes.
 */
export type RowTone = 'ok' | 'warn' | 'bad';

export interface ReadyRow {
  readonly key: string;
  readonly state: RowTone;
  readonly params: Readonly<Record<string, string | number>>;
  /** Further string keys the row's text takes as {{why}}, {{phase}} or {{step}}. */
  readonly whyKey?: string;
  readonly phaseKey?: string;
  readonly stepKey?: string;
}

const tone = (s: RowState): RowTone => (s === 'ok' ? 'ok' : s === 'warn' ? 'warn' : 'bad');
const providerTone = (p: ProviderState): RowTone => (p === 'works' ? 'ok' : p === 'unchecked' ? 'warn' : 'bad');
const providerKey = (prefix: string, p: ProviderState): string =>
  `${prefix}.${p === 'works' ? 'works' : p === 'fails' ? 'fails' : 'unchecked'}`;

const PHASE_KEY: Record<ResetPhaseId, string> = {
  pausing: 'reset.s1',
  restoring_data: 'reset.s2',
  clearing_queues_and_pictures: 'reset.s3',
  starting: 'reset.s4',
};

/**
 * The board's first row: whether visitors can press LIVE now, and why not (the conductor's off reason).
 * The opening check's time names its day, as every other row does (W34): the conductor runs the check as
 * the kiosk opens and a reset does not re-run it, so it is often yesterday's.
 */
export function liveRow(r: Readiness | null, unreachable: boolean, presenterOff: boolean, lang: KioskLang): ReadyRow {
  if (unreachable || !r) return { key: 'ready.unreachable', state: 'bad', params: {} };
  if (presenterOff) return { key: 'ready.presenterOff', state: 'warn', params: {} };
  const check = r.opening_check;
  if (check.state === 'running') return { key: 'ready.liveRunning', state: 'warn', params: {} };
  if (check.state === 'never_run' || !check.checked_at) return { key: 'ready.liveNever', state: 'bad', params: {} };
  if (!r.live.text.on) return { key: 'ready.liveOff', state: 'bad', params: {}, whyKey: `ready.why.${r.live.text.off_reason ?? 'not_checked'}` };
  if (!r.live.picture.on) {
    return { key: 'ready.livePicOff', state: 'warn', params: {}, whyKey: `ready.why.${r.live.picture.off_reason ?? 'not_checked'}` };
  }
  return { key: 'ready.liveOn', state: 'ok', params: { t: formatWhen(check.checked_at, lang) } };
}

export function readinessRows(r: Readiness, lang: KioskLang): ReadyRow[] {
  const rows: ReadyRow[] = [];

  const s = r.services;
  if (s.running === null || s.expected === null) rows.push({ key: 'ready.services.unread', state: 'bad', params: {} });
  else if (s.state === 'ok') rows.push({ key: 'ready.services.ok', state: 'ok', params: {} });
  else rows.push({ key: 'ready.services.down', state: tone(s.state), params: { running: s.running, expected: s.expected, down: s.down.join(', ') } });

  rows.push(snapshotRow(r, lang));

  const { ollama, vertex } = r.providers;
  if (!ollama || !vertex) {
    rows.push({ key: 'ready.providers.unread', state: 'bad', params: {} });
  } else {
    rows.push({ key: providerKey('ready.ollama', ollama), state: providerTone(ollama), params: {} });
    if (vertex !== 'works') rows.push({ key: providerKey('ready.vertex', vertex), state: providerTone(vertex), params: {} });
    else if (!r.pictures) rows.push({ key: 'ready.vertex.worksNoMeter', state: 'warn', params: {} });
    else rows.push({ key: 'ready.vertex.works', state: r.pictures.used >= r.pictures.cap ? 'warn' : 'ok', params: { used: r.pictures.used, cap: r.pictures.cap } });
  }
  // K158 D8: the weakness analyser's LIVE turns off alone, so it gets its own row while off. A
  // conductor older than the reader tier sends no live.reader: off, as not checked, never on.
  const reader = r.live.reader ?? { on: false, off_reason: null };
  if (!reader.on) rows.push({ key: 'ready.readerOff', state: 'warn', params: {}, whyKey: `ready.why.${reader.off_reason ?? 'not_checked'}` });

  rows.push({
    key: r.internet === 'up' ? 'ready.net.up' : r.internet === 'down' ? 'ready.net.down' : 'ready.net.unchecked',
    state: r.internet === 'up' ? 'ok' : r.internet === 'down' ? 'bad' : 'warn',
    params: {},
  });

  const last = r.last_reset;
  if (!last) rows.push({ key: 'ready.reset.none', state: 'ok', params: {} });
  else if (last.outcome === 'done') {
    rows.push({ key: 'ready.reset.done', state: 'ok', params: { when: formatWhen(last.finished_at, lang), s: last.took_s } });
  } else {
    const phase = last.failed_phase as ResetPhaseId | null;
    const phaseKey = phase ? PHASE_KEY[phase] : undefined;
    rows.push(
      last.failed_step
        ? { key: 'ready.reset.failedStep', state: 'bad', params: {}, phaseKey, stepKey: `ready.step.${last.failed_step}` }
        : { key: 'ready.reset.failed', state: 'bad', params: {}, phaseKey },
    );
  }

  rows.push(
    r.disk.free_percent === null
      ? { key: 'ready.disk.unread', state: 'bad', params: {} }
      : { key: 'ready.disk', state: tone(r.disk.state), params: { n: r.disk.free_percent } },
  );
  rows.push(
    r.model_config.state === 'valid'
      ? { key: 'ready.models.valid', state: 'ok', params: { n: Object.keys(r.model_config.roles).length } }
      : { key: 'ready.models.unavailable', state: 'bad', params: {} },
  );
  rows.push({ key: 'ready.telemetry', state: 'ok', params: {} });

  // Shown only when something is wrong: the mockup's board has no row for them.
  const mem = r.memory;
  if (mem.state !== 'ok') {
    rows.push(
      mem.headroom_mib === null
        ? { key: 'ready.memory.unmeasured', state: tone(mem.state), params: {} }
        : { key: 'ready.memory', state: tone(mem.state), params: { mib: mem.headroom_mib, names: mem.unmeasured.join(', ') } },
    );
  }
  if (r.ports.state !== 'ok') rows.push({ key: 'ready.ports', state: tone(r.ports.state), params: { n: r.ports.published } });
  if (r.databases.state !== 'ok') rows.push({ key: 'ready.databases', state: tone(r.databases.state), params: {} });
  return rows;
}

/** The prepared start: unknown wins (a marker unread), then no snapshot, a mismatch, a part restore after a failed reset. */
function snapshotRow(r: Readiness, lang: KioskLang): ReadyRow {
  const snap = r.snapshot;
  if (snap.marker === 'unknown') return { key: 'ready.snapshot.unknown', state: 'bad', params: {} };
  if (snap.marker === 'missing' || !snap.prepared_at) return { key: 'ready.snapshot.missing', state: 'bad', params: {} };
  if (snap.marker === 'mismatch') return { key: 'ready.snapshot.bad', state: 'bad', params: {} };
  const when = formatWhen(snap.prepared_at, lang);
  if (r.last_reset?.outcome === 'failed') return { key: 'ready.snapshot.partial', state: 'bad', params: { when } };
  if (snap.restored_at) return { key: 'ready.snapshot.ok', state: tone(snap.state), params: { when, restored: formatWhen(snap.restored_at, lang) } };
  return { key: 'ready.snapshot.fresh', state: tone(snap.state), params: { when } };
}
