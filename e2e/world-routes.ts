import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Page, Route } from '@playwright/test';

// The routes the fixture world does not serve, shared by the fit specs and the tour's (W47): the dashboard's
// banks, test sets and take (take-fit), the grading samples' reads (grade-fit), the dose and its greeting
// (dose-fit). Moved here unchanged from those specs.

const ROOT = join(__dirname, '..');

export interface Choice {
  readonly kind: string;
  readonly records: Record<string, unknown>;
}
export const MANIFEST = (JSON.parse(readFileSync(join(ROOT, 'dev/fixtures/world/manifest.json'), 'utf8')) as { body: { choices: Record<string, Choice> } }).body.choices;

/**
 * Hawker culture's open question as the pass 6 shot shows it (p6-v8-hawker-q3-en.png), transcribed:
 * the golden run's longest stem.
 */
export const TEH_TARIK =
  'Look at the photograph below. A hawker at a Singapore hawker centre is pouring teh tarik from one steel mug into another, ' +
  'holding the two mugs far apart and letting a long stream of milky tea flow between them. Explain why teh tarik is ' +
  "'pulled' in this way, and then discuss why hands-on skills like this matter to Singapore's hawker culture. Support your " +
  'explanation with details you can see in the picture.';

export const BANKS = ['water', 'nature', 'hawker'] as const;
export const TITLES: Record<(typeof BANKS)[number], string> = { water: 'Water for Life: Unit 1 quiz', nature: 'Nature Ranger: Unit 1 quiz', hawker: 'Food Heritage: Unit 1 quiz' };

/** Each bank's three questions (K159: an MCQ, a picture MCQ, an open question with a picture). */
export function questionsOf(bank: (typeof BANKS)[number]) {
  const rec = MANIFEST[`bank.${bank}`].records as { question_ids: string[] };
  return rec.question_ids.map((qid, i) => {
    const accept = Object.values(MANIFEST).find((c) => c.kind === 'accept' && c.records['question_id'] === qid);
    const img = (accept?.records['image_url'] as string | null | undefined) ?? null;
    const type = i === 2 ? ('oe' as const) : ('mcq' as const);
    const stem = bank === 'hawker' && i === 2 ? TEH_TARIK : `${TITLES[bank]} question ${i + 1}?`;
    return { tsq: `tsq-${bank}-${i + 1}`, qid, type, stem, img };
  });
}

export async function routeTake(page: Page): Promise<void> {
  await page.route('**/api/me/dashboard', (route) => route.fulfill({ json: { currentStreakDays: 6, streak: { current_streak_days: 6 } } }));
  await page.route('**/api/v1/me/mana', (route) => route.fulfill({ json: { gcid: 'g', balance_units: 1240, lifetime_earned: 1500, lifetime_spent: 260, subsidy_breakdown: [] } }));
  for (const bank of BANKS) {
    const rec = MANIFEST[`bank.${bank}`].records as { bank_id: string; test_set_id: string };
    const qs = questionsOf(bank);
    await page.route(`**/api/v1/question-banks/${rec.bank_id}`, (route) =>
      route.fulfill({ json: { question_bank_id: rec.bank_id, tenant_id: 't', owner_gcid: 'g', name: bank, visibility: 'PRIVATE', created_at: 'x', updated_at: 'x', items: [] } }),
    );
    await page.route(`**/api/v1/test-sets/${rec.test_set_id}`, (route) =>
      route.fulfill({
        json: {
          test_set_id: rec.test_set_id,
          title: TITLES[bank],
          state: 'PUBLISHED',
          total_points: 30,
          question_count: 3,
          questions: qs.map((q, i) => ({
            test_set_question_id: q.tsq,
            test_set_id: rec.test_set_id,
            question_id: q.qid,
            question_atom_id: `a-${q.qid}`,
            question_type: q.type,
            points: 10,
            display_order: i + 1,
            added_at: 'x',
            payload_snapshot: q.type === 'mcq' ? { stem: q.stem, options: [{ option_id: `${q.tsq}-o1`, label: 'One', is_correct: true }] } : { stem: q.stem, model_answer: 'm', rubric: [] },
          })),
        },
      }),
    );
  }
  await page.route('**/api/v1/assessments', (route) =>
    route.fulfill({ json: { assessment_id: 'e2e-take', title: TITLES.hawker, scheduled_open_at: '2026-10-21T03:39:00Z', scheduled_close_at: '2026-10-22T03:39:00Z', max_attempts: 1 } }),
  );
  await page.route('**/api/v1/me/assessments/e2e-take/submissions', (route) => route.fulfill({ json: { submission_id: 'e2e-sub', status: 'in_progress' } }));
  await page.route('**/api/v1/me/assessments/e2e-take', (route) =>
    route.fulfill({
      json: {
        assessment_id: 'e2e-take',
        title: TITLES.hawker,
        state: 'OPEN',
        scheduled_open_at: '2026-10-21T03:39:00Z',
        scheduled_close_at: '2026-10-22T03:39:00Z',
        max_attempts: 1,
        learner_attempt_count: 1,
        learner_remaining_attempts: 0,
        questions: questionsOf('hawker').map((q, i) => ({
          test_set_question_id: q.tsq,
          question_id: q.qid,
          question_type: q.type,
          display_order: i + 1,
          points: 10,
          prompt: q.type === 'mcq' ? { stem: q.stem, image_url: q.img, options: [{ option_id: `${q.tsq}-o1`, label: 'A', text: 'One' }, { option_id: `${q.tsq}-o2`, label: 'B', text: 'Two' }] } : { stem: q.stem, image_url: q.img },
        })),
      },
    }),
  );
}

export interface Recorded {
  samples: Record<'sample.strong' | 'sample.weak', Record<string, string | number>>;
  accept_question_id: string;
  test_set: { test_set_id: string };
  reads: Record<'sample.strong' | 'sample.weak', { submission_id: string; questions: Record<string, unknown>[] }>;
}
export const REC = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'grading-recorded.json'), 'utf8')) as Recorded;
export const LIVE_A = 'e2e-live-assessment';
export const LIVE_S = 'e2e-live-submission';

/** The manifest from the fixture server, with the grading choices on the recorded records. */
export async function routeGrading(page: Page): Promise<{ answerGrade: () => void }> {
  await page.route('**/api/v1/kiosk/prewarm/manifest', async (route) => {
    const res = await route.fetch();
    const wire = await res.json();
    const choices = wire.choices;
    for (const k of ['sample.strong', 'sample.weak'] as const) choices[k] = { ...choices[k], records: REC.samples[k] };
    choices['accept.water.q3'] = { ...choices['accept.water.q3'], records: { ...choices['accept.water.q3'].records, question_id: REC.accept_question_id } };
    await route.fulfill({ response: res, json: wire });
  });
  await page.route(`**/api/v1/test-sets/${REC.test_set.test_set_id}`, (route) => route.fulfill({ json: REC.test_set }));
  for (const k of ['sample.strong', 'sample.weak'] as const) {
    const r = REC.samples[k];
    await page.route(`**/api/v1/assessments/${r['assessment_id']}/submissions/${r['submission_id']}/grading`, (route) => route.fulfill({ json: REC.reads[k] }));
  }
  // The LIVE press on typed words: create, start, save, submit, request grading, then the read,
  // held until the test lets the crew answer (the strong sample's grade on the fresh submission).
  let release: (() => void) | null = null;
  const graded = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/v1/assessments', (route) =>
    route.request().method() === 'POST' ? route.fulfill({ json: { assessment_id: LIVE_A, title: 't', scheduled_open_at: 'x', scheduled_close_at: 'y', max_attempts: 1 } }) : route.fallback(),
  );
  await page.route(`**/api/v1/me/assessments/${LIVE_A}/submissions`, (route) => route.fulfill({ json: { submission_id: LIVE_S } }));
  await page.route(`**/api/v1/me/assessments/${LIVE_A}/submissions/${LIVE_S}**`, (route: Route) => route.fulfill({ json: { grading_held: true } }));
  // Approve and release as the instructor: the read back is the same grade, released.
  let approved = false;
  await page.route(`**/api/v1/assessments/${LIVE_A}/submissions/${LIVE_S}/approve`, (route) => {
    approved = true;
    return route.fulfill({ json: { submission_id: LIVE_S, state: 'GRADED', review_status: 'APPROVED' } });
  });
  await page.route(`**/api/v1/assessments/${LIVE_A}/release-results`, (route) => route.fulfill({ json: { assessment_id: LIVE_A } }));
  await page.route(`**/api/v1/assessments/${LIVE_A}/submissions/${LIVE_S}/grading`, async (route) => {
    await graded;
    const read = { ...REC.reads['sample.strong'], submission_id: LIVE_S };
    await route.fulfill({ json: approved ? { ...read, state: 'RELEASED', review_status: 'APPROVED' } : read });
  });
  return { answerGrade: () => release?.() };
}

export const WORLD = (JSON.parse(readFileSync(join(ROOT, 'dev/fixtures/world/manifest.json'), 'utf8')) as { body: { world: Record<string, string> } }).body.world;

/**
 * Ember's prepared greeting as the pass 4 shot shows it (p4-38-comp-mate2-dose-en.png), transcribed
 * with its emoji left out and its dash written as a comma. The fixture world serves
 * no greeting, so the replay is routed here.
 */
export const EMBER =
  'Hey there! Ready for your daily dose of curiosity? I’m Ember, your Hawker-culture familiar, here to spark a fresh question, ' +
  'a fun fact, or a tiny challenge whenever you’re up for it. What would you like to dive into today, perhaps a quick puzzle, ' +
  'a bite-size science wonder, or a glimpse into a new concept? Let me know, and we’ll set the adventure in motion!';

/**
 * The fixture world serves no dose, and the stack's dose read is not a plain read (its first open of a
 * day credits EXP), so each dose is routed here in consumption's shape (companion_handlers.go
 * dailyDoseResp, as companions-world.testing.ts) with its cards' atom reads (the {atom} envelope).
 * The first card is Ember's as the pass 4 shot shows it; the rest are filler of the same size.
 */
export const CARDS = [
  { id: 'e2e-a1', topic: 'UNESCO listing', title: 'A living heritage', body: 'UNESCO added Singapore’s hawker culture to its list of intangible cultural heritage in December 2020.', reason: 'campaign', category: 'new', xp: 30 },
  { id: 'e2e-a2', topic: 'UNESCO listing', title: 'Who keeps it alive', body: 'Hawkers, patrons and the communities around each centre keep the culture alive.', reason: 'campaign', category: 'new', xp: 30 },
  { id: 'e2e-a3', topic: 'Hawker centres', title: 'Where it started', body: 'Hawker centres gathered street hawkers under one roof from the 1970s.', reason: 'ebbinghaus_review', category: 'review', xp: 20 },
  { id: 'e2e-a4', topic: 'Food heritage', title: 'A plate of history', body: 'Many hawker dishes carry the history of the people who brought them.', reason: 'weakness', category: 'stretch', xp: 50 },
  { id: 'e2e-a5', topic: 'Hawker centres', title: 'Open to all', body: 'A hawker centre seats people from every walk of life at the same tables.', reason: 'fresh', category: 'new', xp: 30 },
];

export async function routeDose(page: Page): Promise<void> {
  await page.route(/\/api\/companion\/daily-dose\?/, (route) =>
    route.fulfill({
      json: {
        generated_at: '2026-10-19T01:00:00Z',
        entries: CARDS.map((c) => ({ atom_id: c.id, topic: c.topic, title: c.title, dose_reason: c.reason })),
        doseId: 'e2e-dose',
        servedOn: '2026-10-19',
        atoms: CARDS.map((c) => ({ atomId: c.id, courseCode: 'E2E', title: c.title, summary: c.title, category: c.category, topic: c.topic, xpOnComplete: c.xp })),
        composition: { reviewPercent: 20, newPercent: 60, stretchPercent: 20 },
        totalXpAvailable: 160,
        nextDoseAt: '2026-10-19T16:00:00Z',
      },
    }),
  );
  await page.route(/\/api\/atoms\/e2e-a\d$/, (route) => {
    const c = CARDS.find((x) => route.request().url().endsWith(`/${x.id}`)) as (typeof CARDS)[number];
    return route.fulfill({
      json: {
        atom: {
          atom_id: c.id,
          atom_type: 'mcq',
          body: c.body,
          title: c.title,
          status: 'published',
          question_payload: { type: 'mcq', question_id: `q-${c.id}`, prompt: `Which is true of ${c.title}?`, options: [{ option_id: `${c.id}-o1`, text: 'The first' }, { option_id: `${c.id}-o2`, text: 'The second' }] },
        },
      },
    });
  });
}

export async function routeGreeting(page: Page, greeting: string): Promise<void> {
  await page.route(/\/api\/companion\/greeting$/, async (route) => {
    const body = route.request().postDataJSON() as { companion_id: string; turn_id: string };
    await route.fulfill({ json: { companion_id: body.companion_id, turn_id: body.turn_id, greeting, model: 'e2e', replayed: true } });
  });
}
