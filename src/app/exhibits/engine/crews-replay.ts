import type { PrewarmManifest } from '../../kiosk-api/manifest.service';
import { lastVerdictRow } from '../../live/kinds/critic-verdict';
import type { KioskQuestionJob } from '../../product-api/question-jobs.service';

/** The prepared records the crews timeline replays: the story's own suggestions, draft and illustration. */
export const CREWS_RECORDS = { sugg: 'sugg.water.desal', draft: 'draft.h4', illus: 'pic.illus' } as const;

export interface CrewsRow {
  /** A `tl.*` string key. */
  readonly key: string;
  /** The record's own time (K101): a trace row's as the crew wrote it, a choice's stamp as ISO text. */
  readonly at: string;
}

export interface CrewsTimeline {
  readonly rows: readonly CrewsRow[];
  /** The image model the illustration's run stamped (K72), or null when it carries no stamp. */
  readonly imageModel: string | null;
}

/**
 * This morning's prepared run as its records show it (mockup SCENES.crews, line 5935; K101): the visible
 * suggestion batch landing, draft.h4's writer, critic and renderer from its own job's trace, and the
 * illustration restyle landing. A record that does not tell the story its row says is refused, never
 * given a made-up time.
 */
export function crewsTimeline(manifest: PrewarmManifest, job: KioskQuestionJob): CrewsTimeline {
  const sugg = manifest.choice(CREWS_RECORDS.sugg, 'suggestions');
  const illus = manifest.choice(CREWS_RECORDS.illus, 'picture_regen');
  const trace = job.pipeline_trace ?? [];
  const where = `${CREWS_RECORDS.draft} (job ${job.job_id})`;
  const last = (name: string) => {
    const row = trace.filter((r) => r.name === name && r.status === 'COMPLETED' && r.completed_at).slice(-1)[0];
    if (!row?.completed_at) throw new Error(`[kiosk] ${where} has no completed ${name} row`);
    return row.completed_at;
  };
  const verdict = lastVerdictRow(trace);
  if (verdict?.accepted !== true || !verdict.completed_at) throw new Error(`[kiosk] ${where}: the critic did not accept the draft`);
  return {
    rows: [
      { key: 'tl.sugg', at: sugg.preparedAt.toISOString() },
      { key: 'tl.q', at: last('generate') },
      { key: 'tl.c', at: verdict.completed_at },
      { key: 'tl.d', at: last('render_image') },
      { key: 'tl.i', at: illus.preparedAt.toISOString() },
    ],
    imageModel: illus.models?.['image'] ?? null,
  };
}
