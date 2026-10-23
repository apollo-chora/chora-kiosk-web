// Test data for the grading exhibit's specs: the two graded samples as the golden run's manifest
// records them (PREPARED-CHOICES.md 5.10), the open question's published test set, and the
// instructor's grading reads (grading_review_handler.go:158-232). The rubric, the criterion scores
// and the AI totals are the golden run's own, as the stack's reads gave them on 2026-10-18: every
// criterion is scored out of 1 and weighted 0.4, 0.4 and 0.2, so the crew's total is weighted
// (scoring.py compute_composite), never the plain sum. Test-only.
import { MANIFEST_FORMAT, type ManifestKind, type PrewarmManifestWire } from '../../kiosk-api/manifest.service';

const choice = (kind: ManifestKind, records: Record<string, unknown>, preparedAt = '2026-10-20T06:10:00Z') => ({
  kind,
  stage: 'main',
  hidden: false,
  prepared_at: preparedAt,
  run_at: preparedAt,
  params_sha256: 'x',
  params: {},
  records,
});
const sample = (assessment: string, submission: string, points: number, preparedAt?: string) =>
  choice('graded_sample', { assessment_id: assessment, submission_id: submission, test_set_id: 'ts-grade', test_set_question_id: 'tsq-g', question_id: 'q-g', ai_points_earned: points, points_possible: 10 }, preparedAt);

export function gradeManifest(): PrewarmManifestWire {
  return {
    format: MANIFEST_FORMAT,
    made_at: '2026-10-20T06:30:00Z',
    commit: 'c',
    list_sha256: 'l',
    world: {},
    templates: { word_revision: { lines: [], option_line: '', option_line_explained: '' } },
    choices: {
      'accept.water.q3': choice('accept', { atom_id: 'a-g', job_id: 'j', draft_id: 'd', question_id: 'q-g', image_url: '/p/taps.png' }),
      'sample.strong': sample('as-s', 'sub-s', 10),
      // A minute after the strong one, as in the golden run (12:55, then 12:56).
      'sample.weak': sample('as-w', 'sub-w', 0.8, '2026-10-20T06:11:00Z'),
    },
  };
}

export const STRONG = 'Imported water depends on an agreement with Malaysia that ends in 2061, which is a risk.';
export const WEAK = 'Singapore is small and has no big rivers, so it needs more water sources.';

export const TEST_SET = {
  test_set_id: 'ts-grade',
  title: 'Water for Life: open question',
  state: 'PUBLISHED',
  total_points: 10,
  question_count: 1,
  questions: [
    {
      test_set_question_id: 'tsq-g',
      test_set_id: 'ts-grade',
      question_id: 'q-g',
      question_atom_id: 'a-g',
      question_type: 'oe',
      points: 10,
      display_order: 1,
      added_at: 'x',
      payload_snapshot: {
        stem: 'Why does Singapore also invest in NEWater and desalination?',
        model_answer: 'm',
        rubric: [
          { weight: 0.4, description: '2061 agreement risk', criterion_id: 'c1' },
          { weight: 0.4, description: 'Independence from rain and other countries', criterion_id: 'c2' },
          { weight: 0.2, description: 'Trade-off', criterion_id: 'c3' },
        ],
      },
    },
  ],
};

/** The rubric as the grading read projects it from the test set's snapshot (grading_review_handler.go:99-107). */
export const RUBRIC = [
  { criterion_id: 'c1', description: '2061 agreement risk', weight: 0.4 },
  { criterion_id: 'c2', description: 'Independence from rain and other countries', weight: 0.4 },
  { criterion_id: 'c3', description: 'Trade-off', weight: 0.2 },
];

type Crit = readonly [id: string, title: string, score: number, max: number, feedback: string];
const STRONG_CRIT: Crit[] = [
  ['c1', '2061 agreement risk', 1, 1, 'Learner states imported water depends on an agreement with Malaysia that ends in 2061 and explicitly calls it a risk.'],
  ['c2', 'Independence from rain and other countries', 1, 1, 'Learner says NEWater and desalination give Singapore water that does not depend on rain or on another country.'],
  ['c3', 'Trade-off', 1, 1, 'Learner identifies the trade-off that both NEWater and desalination use a lot of energy.'],
];
const WEAK_CRIT: Crit[] = [
  ['c1', '2061 agreement risk', 0, 1, 'No mention of the Johor agreement ending in 2061 or the risk of non-renewal.'],
  ['c2', 'Independence from rain and other countries', 0.2, 1, 'Hints at limited natural freshwater, but does not explain independence from rainfall or other countries.'],
  ['c3', 'Trade-off', 0, 1, 'No mention of energy, cost, or carbon trade-off.'],
];
/** The crew's totals for the two samples, as the golden run's records hold them (ai_points_earned). */
export const STRONG_AI = 10;
export const WEAK_AI = 0.8;

/**
 * The grading read of one open answer: graded by the crew, waiting for the person unless said
 * otherwise. `ai` is the crew's total as recorded (never derived here: a fixture that computed it
 * with the rule under test would agree with any rule).
 */
export function gradingRead(
  sub: string,
  text: string,
  crit: readonly Crit[],
  ai: number,
  over: { state?: string; review?: string; points?: number; comment?: string; rubric?: readonly object[] | null } = {},
) {
  const comment = over.comment ?? `The crew's comment on ${sub}.`;
  return {
    submission_id: sub,
    state: over.state ?? 'GRADED',
    review_status: over.review ?? 'PENDING_REVIEW',
    total_points_earned: over.points ?? ai,
    total_points_possible: 10,
    questions: [
      {
        test_set_question_id: 'tsq-g',
        question_id: 'q-g',
        question_type: 'oe',
        points_earned: over.points ?? ai,
        points_possible: 10,
        ai_points_earned: ai,
        comment,
        ai_comment: `The crew's comment on ${sub}.`,
        score_provenance: 'AI',
        comment_provenance: 'AI',
        oe_graded_at: '2026-10-20T06:10:00Z',
        learner_answer: { oe_response_text: text },
        ...(over.rubric === null ? {} : { rubric: over.rubric ?? RUBRIC }),
        criterion_scores: crit.map(([criterion_id, title, score, max_score, feedback]) => ({ criterion_id, title, score, max_score, feedback })),
      },
    ],
  };
}

export const STRONG_READ = () => gradingRead('sub-s', STRONG, STRONG_CRIT, STRONG_AI);
export const WEAK_READ = () => gradingRead('sub-w', WEAK, WEAK_CRIT, WEAK_AI);
export { STRONG_CRIT, WEAK_CRIT };

/** The session mint (conductor API.md section 2). */
export const MINT = { access_token: 't', token_type: 'Bearer', expires_in: 3600, gcid: 'g-visitor', tenant_id: 't', roles: ['learner', 'instructor'] };
