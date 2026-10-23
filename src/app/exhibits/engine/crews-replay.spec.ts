import list from '../../../../kiosk/world/prepared-choices.json';
import type { KioskQuestionJob } from '../../product-api/question-jobs.service';
import { MANIFEST_FORMAT, type ManifestChoiceWire, PrewarmManifest } from '../../kiosk-api/manifest.service';
import type { WordRevisionTemplate } from '../../live/kinds/word-revision';
import { crewsTimeline } from './crews-replay';
import recorded from './crews.recorded.json';

// The crews timeline (mockup SCENES.crews, line 5935): this morning's prepared run as its own records
// show it (K101), recorded from the stack: the visible suggestion batch, draft.h4's writer, critic and
// renderer from its job's trace, and the illustration restyle.
const CHOICES = recorded.choices as unknown as Record<string, ManifestChoiceWire>;
const JOB = recorded.job as unknown as KioskQuestionJob;

function manifest(choices: Record<string, ManifestChoiceWire> = CHOICES): PrewarmManifest {
  return new PrewarmManifest({
    format: MANIFEST_FORMAT,
    made_at: '2026-10-18T05:16:18Z',
    commit: 'c',
    list_sha256: 'l',
    world: {},
    templates: { word_revision: list.templates.word_revision as WordRevisionTemplate },
    choices,
  });
}

const withTrace = (trace: readonly object[]): KioskQuestionJob => ({ ...JOB, pipeline_trace: trace }) as unknown as KioskQuestionJob;

describe('crewsTimeline', () => {
  it('stamps each prepared stage with its own record’s time, in the story’s order', () => {
    const t = crewsTimeline(manifest(), JOB);
    expect(t.rows).toEqual([
      { key: 'tl.sugg', at: '2026-10-18T04:38:47.000Z' },
      { key: 'tl.q', at: '2026-10-18T04:44:41.667059+00:00' },
      { key: 'tl.c', at: '2026-10-18T04:44:45.600579+00:00' },
      { key: 'tl.d', at: '2026-10-18T04:44:45.795536+00:00' },
      { key: 'tl.i', at: '2026-10-18T04:50:11.000Z' },
    ]);
  });

  it('names the image model the illustration’s own run stamped, never a constant (K72)', () => {
    expect(crewsTimeline(manifest(), JOB).imageModel).toBe('gemini-3-pro-image');
    const { models: _dropped, ...unstamped } = CHOICES['pic.illus'] as ManifestChoiceWire & { models?: unknown };
    expect(crewsTimeline(manifest({ ...CHOICES, 'pic.illus': unstamped as ManifestChoiceWire }), JOB).imageModel).toBeNull();
  });

  it('a send-back and a second pass: the writer’s and critic’s last rows, the critic’s verdict row', () => {
    const trace = [
      { name: 'generate', status: 'COMPLETED', attempt: 1, completed_at: '2026-10-18T04:44:41Z' },
      { name: 'critique', status: 'REJECTED', attempt: 1, accepted: false, completed_at: '2026-10-18T04:44:45Z' },
      { name: 'generate', status: 'COMPLETED', attempt: 2, completed_at: '2026-10-18T04:44:52Z' },
      { name: 'critique', status: 'ACCEPTED', attempt: 2, accepted: true, completed_at: '2026-10-18T04:44:56Z' },
      { name: 'render_image', status: 'COMPLETED', attempt: 2, completed_at: '2026-10-18T04:44:57Z' },
    ];
    expect(crewsTimeline(manifest(), withTrace(trace)).rows.slice(1, 4)).toEqual([
      { key: 'tl.q', at: '2026-10-18T04:44:52Z' },
      { key: 'tl.c', at: '2026-10-18T04:44:56Z' },
      { key: 'tl.d', at: '2026-10-18T04:44:57Z' },
    ]);
  });

  it('refuses a record that does not tell the story it would be shown under, never invents a time', () => {
    const rows = JOB.pipeline_trace ?? [];
    expect(() => crewsTimeline(manifest(), withTrace(rows.filter((r) => r.name !== 'generate')))).toThrow(/draft.h4.*no completed generate row/);
    expect(() => crewsTimeline(manifest(), withTrace(rows.filter((r) => r.name !== 'render_image')))).toThrow(/draft.h4.*no completed render_image row/);
    const rejected = rows.map((r) => (r.name === 'critique' ? { ...r, status: 'REJECTED', accepted: false } : r));
    expect(() => crewsTimeline(manifest(), withTrace(rejected))).toThrow(/draft.h4.*critic did not accept/);
    const { 'pic.illus': _illus, ...noIllus } = CHOICES;
    expect(() => crewsTimeline(manifest(noIllus), JOB)).toThrow(/no prepared choice pic.illus/);
  });
});
