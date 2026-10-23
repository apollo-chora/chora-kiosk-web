// Test data for the dashboard exhibit's specs: the three learner banks and the grading sample's
// bank as the golden run's manifest records them, and the bank and test-set reads. Test-only.
import { MANIFEST_FORMAT, type ManifestKind, type PrewarmManifestWire } from '../../kiosk-api/manifest.service';

const choice = (kind: ManifestKind, records: Record<string, unknown>, preparedAt = '2026-10-20T05:58:00Z') => ({
  kind,
  stage: 'main',
  hidden: false,
  prepared_at: preparedAt,
  run_at: preparedAt,
  params_sha256: 'x',
  params: {},
  records,
});
const bank = (id: string, questions: string[], testSet: string) => choice('bank', { bank_id: id, question_ids: questions, assemble_job_id: `j-${id}`, test_set_id: testSet });

export function dashManifest(): PrewarmManifestWire {
  return {
    format: MANIFEST_FORMAT,
    made_at: '2026-10-20T06:30:00Z',
    commit: 'c',
    list_sha256: 'l',
    world: { 'goal.water': 'g-water' },
    templates: { word_revision: { lines: [], option_line: '', option_line_explained: '' } },
    choices: {
      // The step 4 draft the copy was made from (K119): its picture and the mode it was made in.
      'draft.h4': choice('question_draft', { atom_id: 'a-w2', job_id: 'fj', draft_id: 'fd', question_type: 'mcq', image_url: '/p/w2.png', image_gcs_uri: 'gs://k/w2.png', image_mode: 'mermaid' }),
      'copy.water.q2': choice('manual_copy', { atom_id: 'a-w2', manual_job_id: 'mj', from_job_id: 'fj', from_draft_id: 'fd', question_id: 'q-w2', image_url: '/p/w2.png' }),
      'bank.water': bank('b-water', ['q-w1', 'q-w2', 'q-w3'], 'ts-water'),
      'bank.nature': bank('b-nature', ['q-n1', 'q-n2', 'q-n3'], 'ts-nature'),
      'bank.hawker': bank('b-hawker', ['q-h1', 'q-h2', 'q-h3'], 'ts-hawker'),
      'bank.grading': bank('b-grade', ['q-w3'], 'ts-grade'),
      // K159: the open question's picture and Hawker culture's two, from the accepts that made them.
      'accept.water.q3': choice('accept', { atom_id: 'a-w3', job_id: 'jw3', draft_id: 'dw3', question_id: 'q-w3', image_url: '/p/taps.png' }),
      'accept.hawker.q2': choice('accept', { atom_id: 'a-h2', job_id: 'jh2', draft_id: 'dh2', question_id: 'q-h2', image_url: '/p/kaya.png' }),
      'accept.hawker.q3': choice('accept', { atom_id: 'a-h3', job_id: 'jh3', draft_id: 'dh3', question_id: 'q-h3', image_url: '/p/teh.png' }),
      'sample.strong': choice('graded_sample', { assessment_id: 'as-s', submission_id: 'sub-s', test_set_id: 'ts-grade', test_set_question_id: 'tsq-s', question_id: 'q-w3', ai_points_earned: 9, points_possible: 10 }),
      'greet.pingu': choice('greeting', { companion_id: 'c-pingu', turn_id: 'turn-pingu', model: 'gpt-oss:120b' }, '2026-10-20T06:05:00Z'),
    },
  };
}

export const bankRead = (id: string, name: string) => ({ question_bank_id: id, tenant_id: 't', owner_gcid: 'g', name, visibility: 'PRIVATE', created_at: 'x', updated_at: 'x', items: [] });

type Q = { readonly tsq: string; readonly qid: string; readonly type: 'mcq' | 'oe'; readonly stem: string; readonly img?: string; readonly rubric?: readonly string[] };
export function testSetRead(id: string, title: string, qs: readonly Q[]) {
  return {
    test_set_id: id,
    title,
    state: 'PUBLISHED',
    total_points: qs.length * 10,
    question_count: qs.length,
    questions: qs.map((q, i) => ({
      test_set_question_id: q.tsq,
      test_set_id: id,
      question_id: q.qid,
      question_atom_id: `a-${q.qid}`,
      question_type: q.type,
      points: 10,
      display_order: i + 1,
      added_at: 'x',
      payload_snapshot:
        q.type === 'mcq'
          ? { stem: q.stem, options: [{ option_id: `${q.tsq}-o1`, label: 'One', is_correct: false }, { option_id: `${q.tsq}-o2`, label: 'Two', is_correct: true, explainer: `Why ${q.stem}` }] }
          : { stem: q.stem, model_answer: 'm', rubric: (q.rubric ?? []).map((d, j) => ({ criterion_id: `${q.tsq}-c${j + 1}`, title: `C${j + 1}`, description: d, weight: 1 })) },
    })),
  };
}

export const WATER_QS: Q[] = [
  { tsq: 'tsq-w1', qid: 'q-w1', type: 'mcq', stem: 'What is NEWater?' },
  { tsq: 'tsq-w2', qid: 'q-w2', type: 'mcq', stem: 'Which stage removes the finest particles?', img: '/p/w2.png' },
  { tsq: 'tsq-w3', qid: 'q-w3', type: 'oe', stem: 'Why does Singapore need four taps?', img: '/p/taps.png', rubric: ['Names when Johor’s water ends', 'Names a source that needs no rain', 'Explains the balance'] },
];
export const NATURE_QS: Q[] = [1, 2, 3].map((n) => ({ tsq: `tsq-n${n}`, qid: `q-n${n}`, type: 'mcq' as const, stem: `Nature question ${n}?` }));
// K159: Hawker culture takes water's mix (City in Nature keeps the plain multiple-choice shape here, so the
// generic multiple-choice-only path stays tested).
export const HAWKER_QS: Q[] = [
  { tsq: 'tsq-h1', qid: 'q-h1', type: 'mcq', stem: 'What does it mean to chope a seat?' },
  { tsq: 'tsq-h2', qid: 'q-h2', type: 'mcq', stem: 'Kaya is made mainly from which ingredients?', img: '/p/kaya.png' },
  { tsq: 'tsq-h3', qid: 'q-h3', type: 'oe', stem: 'Why is teh tarik pulled from one mug to another?', img: '/p/teh.png', rubric: ['Names the cooling', 'Names the froth', 'Ties it to the stall'] },
];

export const READS = {
  'b-water': bankRead('b-water', 'Singapore’s water'),
  'b-nature': bankRead('b-nature', 'City in Nature'),
  'b-hawker': bankRead('b-hawker', 'Hawker culture'),
  'ts-water': testSetRead('ts-water', 'Water for Life: Unit 1 quiz', WATER_QS),
  'ts-nature': testSetRead('ts-nature', 'Nature Ranger: Unit 1 quiz', NATURE_QS),
  'ts-hawker': testSetRead('ts-hawker', 'Food Heritage: Unit 1 quiz', HAWKER_QS),
} as Record<string, object>;

export const WATER_MAP = { goalId: 'g-water', title: 'Singapore’s water', rootConceptId: 'r', attachedFamiliarId: 'c-pingu', attachedFamiliarName: 'Pingu', concepts: [{ conceptId: 'r', title: 'Singapore’s water', atomRefs: [], provenance: 'learner_authored' }], edges: [] };

/** The session mint (conductor API.md section 2): the learner the create invites. */
export const MINT = { access_token: 't', token_type: 'Bearer', expires_in: 3600, gcid: 'g-visitor', tenant_id: 't', roles: ['learner', 'instructor'] };

/** Delivery's create answer: the window runs from now to +24 h (assessment_handler.go:301-308). */
export const created = (id: string, title: string) => ({ assessment_id: id, title, scheduled_open_at: '2026-10-30T02:00:00Z', scheduled_close_at: '2026-10-31T02:00:00Z', max_attempts: 1 });

/** The learner's take read: the questions with no key (assessment_handler.go:1724-1777). */
export function takeRead(id: string, title: string, qs: readonly Q[]) {
  return {
    assessment_id: id,
    title,
    state: 'OPEN',
    scheduled_open_at: '2026-10-30T02:00:00Z',
    scheduled_close_at: '2026-10-31T02:00:00Z',
    max_attempts: 1,
    learner_attempt_count: 1,
    learner_remaining_attempts: 0,
    questions: qs.map((q, i) => ({
      test_set_question_id: q.tsq,
      question_id: q.qid,
      question_type: q.type,
      display_order: i + 1,
      points: 10,
      prompt:
        q.type === 'mcq'
          ? { stem: q.stem, image_url: q.img ?? null, options: [{ option_id: `${q.tsq}-o1`, label: 'A', text: 'One' }, { option_id: `${q.tsq}-o2`, label: 'B', text: 'Two' }] }
          : { stem: q.stem, image_url: q.img ?? null },
    })),
  };
}

/** The instructor's grading read: one row per answer given (grading_review_handler.go:158-185). */
export const graded = (rows: { tsq: string; correct: boolean; choice: string }[]) => ({
  submission_id: 'sub',
  state: 'SUBMITTED',
  questions: rows.map((r) => ({ test_set_question_id: r.tsq, question_type: 'mcq', points_earned: r.correct ? 10 : 0, points_possible: 10, correct: r.correct, learner_answer: { mcq_choice_id: r.choice } })),
});
