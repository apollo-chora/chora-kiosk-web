// The walk's ruling checks as pure functions (T4.1). Each check has a case that must pass and a
// planted defect that must fail it: a check that cannot fail is not a check.
// Run: node --test e2e/walk/checks.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatStampWhen,
  stampTimes,
  checkStamps,
  visitWords,
  floorWords,
  spendKeys,
  spendText,
  creditCheck,
  releasedEqualsAi,
  classifyRequest,
  serveDoorReady,
  glowCheck,
  interfaceLeaks,
  aiTextExact,
  rawKeys,
  roundHalfEven2,
  compositePoints,
  releasedFollowsRubric,
  gapErrors,
  passMark,
  passMarkCheck,
  noLiveCheck,
  snapshotNoteCheck,
  xrayPanelCheck,
  pickOption,
  keysFromPayload,
  keysFromIndexed,
  keyForStem,
  pickText,
  oracleCommand,
  sinceResetCheck,
  resetReadback,
  lastResetSame,
  loopStateCheck,
  ghostCheck,
  servedOrder,
  visitOrderCheck,
  censusCommand,
  censusCount,
  idleSettingCheck,
  creditNumbers,
  windowTimes,
  tourMarkers,
  nextBoxCheck,
  eachAddCheck,
  greyedCheck,
  onlyFromCheck,
  fillCheck,
  treeCheck,
  childrenCheck,
  tourEndCheck,
  exactSetCheck,
  retiredModelCheck,
  insideFrameCheck,
  noLaptopCheck,
  linesInBoxesCheck,
  linkLengthCheck,
  clearOfCheck,
  captionCheck,
  freshOnTopCheck,
  spentCheck,
  missedStampCheck,
  fullListCheck,
  creditsCheck,
  viewChangeCheck,
  liveRowsInCardsCheck,
  linesInOrderCheck,
  figuresCheck,
  copyCheck,
} from './checks.mjs';

const MANIFEST = {
  choices: {
    'sugg.water.desal': { kind: 'suggestions', prepared_at: '2026-10-18T04:38:00Z' },
    'greet.pingu': { kind: 'greeting', prepared_at: '2026-10-18T04:56:10Z' },
    'pic.uv': { kind: 'picture_regen', prepared_at: '2026-10-18T05:00:00Z' },
  },
};

test('formatStampWhen writes the record time in Asia/Singapore, in each language', () => {
  assert.equal(formatStampWhen('2026-10-18T04:38:00Z', 'en'), '18 Oct, 12:38');
  assert.equal(formatStampWhen('2026-10-18T04:38:00Z', 'zh'), '10月18日 12:38');
  // Past midnight in Singapore the day moves on.
  assert.equal(formatStampWhen('2026-10-18T16:05:00Z', 'en'), '19 Oct, 00:05');
  assert.throws(() => formatStampWhen('yesterday', 'en'), /not a time/);
});

test('stampTimes finds every date and time on a screen', () => {
  assert.deepEqual(stampTimes('Prepared 18 Oct, 12:38 then Prepared 9 Oct, 07:05', 'en'), ['18 Oct, 12:38', '9 Oct, 07:05']);
  assert.deepEqual(stampTimes('准备于 10月18日 12:38', 'zh'), ['10月18日 12:38']);
  assert.deepEqual(stampTimes('No stamp here, 12:38 alone is a clock', 'en'), []);
});

test('K101: every prepared stamp reads its own record time', () => {
  const ok = checkStamps({ id: 'h2', text: 'Ideas from Pingu. Prepared 18 Oct, 12:38', lang: 'en', manifest: MANIFEST, expect: ['sugg.water.desal'] });
  assert.equal(ok.pass, true, JSON.stringify(ok));
  // Planted: a stamp written from the clock, not from a record.
  const now = checkStamps({ id: 'h2', text: 'Prepared 18 Oct, 22:41', lang: 'en', manifest: MANIFEST, expect: [] });
  assert.equal(now.pass, false);
  assert.deepEqual(now.actual.unknown, ['18 Oct, 22:41']);
  // Planted: the screen shows another record's time for this step's choice.
  const wrong = checkStamps({ id: 'h4b', text: 'Prepared 18 Oct, 12:56', lang: 'en', manifest: MANIFEST, expect: ['pic.uv'] });
  assert.equal(wrong.pass, false);
  assert.deepEqual(wrong.actual.missing, ['pic.uv']);
  // A step naming a choice the manifest lacks is refused loudly, never skipped.
  assert.throws(() => checkStamps({ id: 'x', text: '', lang: 'en', manifest: MANIFEST, expect: ['sugg.nope'] }), /sugg\.nope/);
  // Chinese stamps read the same records.
  assert.equal(checkStamps({ id: 'h2', text: '准备于 10月18日 12:38', lang: 'zh', manifest: MANIFEST, expect: ['sugg.water.desal'] }).pass, true);
  // Extra known times (the snapshot's own time on the presenter panel) are allowed only when named.
  assert.equal(checkStamps({ id: 'p', text: 'made 18 Oct, 13:34', lang: 'en', manifest: MANIFEST, expect: [], extra: ['2026-10-18T05:34:00Z'] }).pass, true);
  // On fixtures a passing stamp check is fixture data, never a pass; a failing one still fails.
  assert.equal(checkStamps({ id: 'h2', text: 'Prepared 18 Oct, 12:38', lang: 'en', manifest: MANIFEST, expect: ['sugg.water.desal'], source: 'fixture' }).pass, 'fixture');
  assert.equal(checkStamps({ id: 'h2', text: 'Prepared 18 Oct, 22:41', lang: 'en', manifest: MANIFEST, expect: [], source: 'fixture' }).pass, false);
});

test('K83: "visit" is gone from on-screen copy; the visitor and the API paths stay', () => {
  assert.deepEqual(visitWords(['Done ends the demo session and puts everything back for the next visitor.', 'Visitors see prepared results.']), []);
  assert.deepEqual(visitWords(['GET /api/v1/kiosk/visits answered 204']), []);
  assert.deepEqual(visitWords(['Each visit takes a minute', 'Visits today']), ['visit', 'Visits']);
});

test('K80: "floor" appears only quoted as the build log word', () => {
  assert.deepEqual(floorWords(['Each against its pass mark (the log calls it a “floor”).', 'the log calls it a "floor"']), []);
  assert.deepEqual(floorWords(['The writer floor is 3.5', 'Floors']), ['floor', 'Floors']);
});

test('K105: no spend row in the readiness read or on the board', () => {
  const board = { overall: 'ready', live: { text: { on: true } }, pictures: { day: '2026-10-20', used: 3, cap: 50 }, providers: { ollama: 'works' } };
  assert.deepEqual(spendKeys(board), []);
  assert.deepEqual(spendKeys({ ...board, providers: { ollama: 'works', ollama_spend_usd: 0.45 } }), ['providers.ollama_spend_usd']);
  assert.deepEqual(spendText('Ollama key: works. Pictures today: 3 of 50.'), []);
  assert.deepEqual(spendText('Spend today: US$0.45'), ['Spend', 'US$0.45']);
});

const PINGU = '4468bbd0-6fd6-77dc-aa5f-c38cd27693ea';
const NOVA = 'b4463c8d-5671-70bd-9693-1500a5413cf3';

test('K135 and K102: a credit is the growth read delta on the credited Companion, never a constant', () => {
  const win = creditCheck({
    id: 'K135',
    companionId: PINGU,
    before: { companionId: PINGU, expCumulative: 32 },
    after: { companionId: PINGU, expCumulative: 65 },
    events: [
      { companionId: PINGU, source: 'campaign_node_won', expDelta: 25, expCumulativeAfter: 65 },
      { companionId: PINGU, source: 'campaign_rung_cleared', expDelta: 8, expCumulativeAfter: 40 },
      { companionId: PINGU, source: 'daily_dose_open', expDelta: 2, expCumulativeAfter: 32 },
    ],
    deltas: [8, 25],
    screen: 33,
  });
  assert.equal(win.pass, true, JSON.stringify(win));
  // The same rule from another start (F32 live: the dose credit came first).
  const later = creditCheck({
    id: 'K135',
    companionId: PINGU,
    before: { companionId: PINGU, expCumulative: 35 },
    after: { companionId: PINGU, expCumulative: 68 },
    events: [
      { companionId: PINGU, source: 'campaign_rung_cleared', expDelta: 8, expCumulativeAfter: 43 },
      { companionId: PINGU, source: 'campaign_node_won', expDelta: 25, expCumulativeAfter: 68 },
    ],
    deltas: [8, 25],
    screen: 33,
  });
  assert.equal(later.pass, true, JSON.stringify(later));
  // The two credits may land in either order (pass 2 saw 25 then 8): a set of deltas, not a sequence.
  const swapped = creditCheck({
    ...winArgs(),
    events: [
      { companionId: PINGU, source: 'campaign_node_won', expDelta: 25, expCumulativeAfter: 57 },
      { companionId: PINGU, source: 'campaign_rung_cleared', expDelta: 8, expCumulativeAfter: 65 },
    ],
  });
  assert.equal(swapped.pass, true, JSON.stringify(swapped));
  // Planted: the right sum from the wrong events (one +33) fails.
  assert.equal(creditCheck({ ...winArgs(), events: [{ companionId: PINGU, source: 'x', expDelta: 33, expCumulativeAfter: 65 }] }).pass, false);
  // Planted: events whose running totals do not chain from the first read fail.
  assert.equal(
    creditCheck({
      ...winArgs(),
      events: [
        { companionId: PINGU, source: 'a', expDelta: 8, expCumulativeAfter: 41 },
        { companionId: PINGU, source: 'b', expDelta: 25, expCumulativeAfter: 65 },
      ],
    }).pass,
    false,
  );
  // Planted: the screen stopped at the first rise.
  assert.equal(creditCheck({ ...winArgs(), screen: 8 }).pass, false);
  // Planted (F32 as found): a correct dose answer credits nothing.
  const dose = creditCheck({
    id: 'K102',
    companionId: PINGU,
    before: { companionId: PINGU, expCumulative: 65 },
    after: { companionId: PINGU, expCumulative: 65 },
    events: [],
    deltas: [3],
    screen: null,
  });
  assert.equal(dose.pass, false);
  assert.equal(dose.actual.delta, 0);
  // Planted: the credit went to another Companion than the one checked.
  const elsewhere = creditCheck({
    id: 'K102',
    companionId: PINGU,
    before: { companionId: PINGU, expCumulative: 65 },
    after: { companionId: PINGU, expCumulative: 65 },
    events: [{ companionId: NOVA, source: 'atom_session', expDelta: 3, expCumulativeAfter: 23 }],
    deltas: [3],
    screen: 3,
  });
  assert.equal(elsewhere.pass, false);
  // Reads of two different Companions are refused, never compared.
  assert.throws(() => creditCheck({ ...winArgs(), after: { companionId: NOVA, expCumulative: 65 } }), /two Companions/);
  // On fixtures a passing credit is fixture data.
  assert.equal(creditCheck({ ...winArgs(), source: 'fixture' }).pass, 'fixture');
});

function winArgs() {
  return {
    id: 'K135',
    companionId: PINGU,
    before: { companionId: PINGU, expCumulative: 32 },
    after: { companionId: PINGU, expCumulative: 65 },
    events: [
      { companionId: PINGU, source: 'campaign_rung_cleared', expDelta: 8, expCumulativeAfter: 40 },
      { companionId: PINGU, source: 'campaign_node_won', expDelta: 25, expCumulativeAfter: 65 },
    ],
    deltas: [8, 25],
    screen: 33,
  };
}

test('W1: with no stepper changed the released total is exactly the AI total', () => {
  assert.equal(releasedEqualsAi({ aiPoints: 7.6, released: 7.6, possible: 10 }).pass, true);
  // Planted (pass 1 as found): the released grade was rebuilt by another rule.
  assert.equal(releasedEqualsAi({ aiPoints: 7.6, released: 2, possible: 10 }).pass, false);
  assert.equal(releasedEqualsAi({ aiPoints: 7.6, released: 7.60001, possible: 10 }).pass, false);
  assert.throws(() => releasedEqualsAi({ aiPoints: 7.6, released: null, possible: 10 }), /not a number/);
});

test('the LIVE tripwire judges the request, not only the path', () => {
  const turns = new Set(['turn-greet-pingu']);
  const c = (method, url, body) => classifyRequest({ method, url, body }, { preparedTurnIds: turns });
  // Model calls: each LIVE kind, and the presenter's Check again.
  assert.equal(c('POST', '/api/companion/greeting', { companion_id: PINGU, turn_id: 'turn-fresh' }).live, 'greet');
  assert.equal(c('POST', '/api/v1/me/concept-graph/suggestions/generate', {}).live, 'sugg');
  assert.equal(c('POST', '/api/v1/me/goals/g1/campaign/questions/fresh', { concept_id: 'c', rung: 6 }).live, 'q');
  assert.equal(c('POST', '/api/atoms/a1/question-jobs', { type: 'ai_draft', prompt: 'Explain why' }).live, 'words');
  assert.equal(c('POST', '/api/atoms/a1/question-jobs/j1/regenerate-image', { mode: 'illustration' }).live, 'picture');
  assert.equal(c('POST', '/api/v1/me/assessments/a1/submissions/s1/request-grading', null).live, 'grade');
  assert.equal(c('POST', '/api/v1/kiosk/readiness', {}).live, 'check');
  // Not model calls: a greeting replay of a prepared turn (K49), the serve door, writes, reads.
  const replay = c('POST', '/api/companion/greeting', { companion_id: PINGU, turn_id: 'turn-greet-pingu' });
  assert.equal(replay.live, null);
  assert.equal(replay.kind, 'replay');
  const door = c('GET', '/api/v1/me/goals/g1/campaign/questions?concept_id=c&rung=6', null);
  assert.equal(door.live, null);
  assert.equal(door.serveDoor, true);
  assert.equal(c('POST', '/api/v1/me/concept-graph/suggestions/s1/accept', {}).kind, 'write');
  assert.equal(c('POST', '/api/atoms/a1/question-jobs/j1/accept', {}).kind, 'write');
  assert.equal(c('POST', '/api/v1/me/goals/g1/campaign/questions/answer', { concept_id: 'c', selected_option_id: 'o' }).kind, 'write');
  assert.equal(c('GET', '/api/v1/me/companions/x/growth', null).kind, 'read');
  // The dose card's attempt, and the grading review's edit, approval and release, are writes.
  assert.equal(c('POST', '/api/atoms/a1/session', {}).rule, 'atom attempt start');
  assert.equal(c('POST', '/api/atoms/a1/session/submit', { selected_option_id: 'o' }).rule, 'atom attempt submit');
  assert.equal(c('PATCH', '/api/v1/assessments/a1/submissions/s1/grades', { question_edits: [] }).rule, 'grade edit');
  assert.equal(c('POST', '/api/v1/assessments/a1/submissions/s1/approve', {}).rule, 'grade approve');
  assert.equal(c('POST', '/api/v1/assessments/a1/release-results', {}).rule, 'results release');
  // A write the walk does not know is named, so a new model call cannot pass unseen.
  assert.equal(c('POST', '/api/v1/me/something/new', {}).rule, 'unclassified');
  // A question job that is not an AI draft (a hand edit's copy) is a write.
  assert.equal(c('POST', '/api/atoms/a1/question-jobs', { type: 'manual' }).live, null);
});

test('the serve door answers ready, or the walk spent a tap', () => {
  assert.equal(serveDoorReady({ status: 'ready', questions: { candidates: [] } }), true);
  assert.equal(serveDoorReady({ status: 'requested' }), false);
  assert.equal(serveDoorReady({}), false);
  assert.equal(serveDoorReady(null), false);
});

test('K139: in step 1 exactly one idea glows, Desalination', () => {
  assert.equal(glowCheck({ glowIds: ['desal'], expectId: 'desal' }).pass, true);
  assert.equal(glowCheck({ glowIds: ['desal', 'newater'], expectId: 'desal' }).pass, false);
  assert.equal(glowCheck({ glowIds: ['newater'], expectId: 'desal' }).pass, false);
  assert.equal(glowCheck({ glowIds: [], expectId: 'desal' }).pass, false);
});

test('K41: the Chinese interface carries no English interface string', () => {
  const en = { 'h2.add': 'Add all three to my map', 'nav.done': 'Done', 'stamp.prepared': 'Prepared {{when}}' };
  assert.deepEqual(interfaceLeaks('添加到我的地图 准备于 10月18日 12:38', en), []);
  assert.deepEqual(interfaceLeaks('Add all three to my map 准备于', en), ['h2.add']);
  // A one-word value (a name, "Done") is too short to judge by text alone.
  assert.deepEqual(interfaceLeaks('Done', en), []);
  // A value the approved Chinese table keeps in English (the programme's name) is not a leak.
  const enOrg = { ...en, 'credits.org': 'NUS-ISS · Master of Technology in Software Engineering' };
  const zh = { 'h2.add': '全部加入我的地图', 'credits.org': 'NUS-ISS · Master of Technology in Software Engineering' };
  assert.deepEqual(interfaceLeaks('NUS-ISS · Master of Technology in Software Engineering', enOrg, zh), []);
  assert.deepEqual(interfaceLeaks('NUS-ISS · Master of Technology in Software Engineering Add all three to my map', enOrg, zh), ['h2.add']);
});

test('K133: AI text is shown exactly as the model wrote it', () => {
  // A model's em dash, built from its code point (the team's own text never holds one).
  const model = `Reverse osmosis ${String.fromCharCode(0x2014)} pushing water through a membrane 💧 **fast**`;
  assert.equal(aiTextExact({ shown: `Idea: ${model}.`, record: model }).pass, true);
  assert.equal(aiTextExact({ shown: 'Reverse osmosis, pushing water through a membrane fast', record: model }).pass, false);
});

test('raw string keys on screen are caught only when they are real keys', () => {
  const keys = new Set(['h2.add', 'cx.dose.aiGreetingBefore', 'reset.s2']);
  assert.deepEqual(rawKeys('Pingu says hi. h2.add cx.dose.aiGreetingBefore', keys), ['h2.add', 'cx.dose.aiGreetingBefore']);
  assert.deepEqual(rawKeys('e.g. 18 Oct, 12:38 and gpt-oss.120b', keys), []);
});

// W1's rule is the grading crew's own scorer (orchestrator domain/oe_grading_crew/scoring.py,
// compute_composite): points_possible x sum(w_i / sum(w) x clamp01(score_i / max_i)), round(x, 2).
const RUBRIC = [
  { criterion_id: 'sources', weight: 0.4 },
  { criterion_id: 'reasons', weight: 0.4 },
  { criterion_id: 'tradeoff', weight: 0.2 },
];
const marks = (a, b, c) => [
  { criterion_id: 'sources', score: a, max_score: 1 },
  { criterion_id: 'reasons', score: b, max_score: 1 },
  { criterion_id: 'tradeoff', score: c, max_score: 1 },
];

test('roundHalfEven2 is Python round(x, 2) on the exact double', () => {
  assert.equal(roundHalfEven2(0.125), 0.12);
  assert.equal(roundHalfEven2(0.375), 0.38);
  assert.equal(roundHalfEven2(2.625), 2.62);
  assert.equal(roundHalfEven2(2.675), 2.67);
  assert.equal(roundHalfEven2(1.005), 1);
  assert.equal(roundHalfEven2(7.999999999), 8);
});

test('W1 compositePoints: the cases the orchestrator gave from the golden records', () => {
  assert.equal(compositePoints({ rubric: RUBRIC, scores: marks(1, 1, 1), possible: 10 }), 10);
  assert.equal(compositePoints({ rubric: RUBRIC, scores: marks(0, 0.2, 0), possible: 10 }), 0.8);
  assert.equal(compositePoints({ rubric: RUBRIC, scores: marks(1, 1, 0), possible: 10 }), 8);
  assert.equal(compositePoints({ rubric: RUBRIC, scores: marks(1, 0.2, 0), possible: 10 }), 4.8);
  // A criterion with no score counts 0; a maximum of 0 counts as 1; an over-max score is clamped.
  assert.equal(compositePoints({ rubric: RUBRIC, scores: marks(1, 1, 1).slice(0, 2), possible: 10 }), 8);
  assert.equal(compositePoints({ rubric: RUBRIC, scores: [{ criterion_id: 'sources', score: 1, max_score: 0 }], possible: 10 }), 4);
  assert.equal(compositePoints({ rubric: RUBRIC, scores: marks(3, 1, 1), possible: 10 }), 10);
  assert.throws(() => compositePoints({ rubric: [], scores: [], possible: 10 }), /no criteria/);
  assert.throws(() => compositePoints({ rubric: [{ criterion_id: 'x', weight: 0 }], scores: [], possible: 10 }), /weight/);
});

test('W1 releasedFollowsRubric: the stored total is the rubric composite of the scores the review left', () => {
  assert.equal(releasedFollowsRubric({ id: 'strong', rubric: RUBRIC, scores: marks(1, 1, 0), possible: 10, released: 8 }).pass, true);
  // Planted (pass 1 as found): the plain sum of criterion scores, 2 of 10.
  const sum = releasedFollowsRubric({ id: 'strong', rubric: RUBRIC, scores: marks(1, 1, 0), possible: 10, released: 2 });
  assert.equal(sum.pass, false);
  assert.equal(sum.expected, 8);
  assert.equal(releasedFollowsRubric({ id: 'weak', rubric: RUBRIC, scores: marks(0, 0.2, 0), possible: 10, released: 0.8, source: 'fixture' }).pass, 'fixture');
});

test('fixture gaps excuse only the errors naming a route the fixture world lacks', () => {
  const gaps = [/\/api\/v1\/me\/companions\/[^/]+\/growth-events/];
  const bare = 'K [console.error] Failed to load resource: the server responded with a status of 404 (Not Found)';
  const errors = [
    'K [http 404] GET /api/v1/me/companions/p1/growth-events',
    bare,
    'K [console.error] [kiosk] the quiz answer was not graded: GET /api/v1/me/companions/p1/growth-events: 404 UNKNOWN',
  ];
  assert.deepEqual(gapErrors(errors, gaps), { excused: errors, rest: [] });
  // Planted: another route's 404 and its bare console line stay errors, even when the line reads the same.
  const other = [...errors, 'K [http 404] GET /api/v1/me/assessments/a1', bare];
  assert.deepEqual(gapErrors(other, gaps), { excused: errors, rest: ['K [http 404] GET /api/v1/me/assessments/a1', bare] });
  // No gap 404, no bare line excused.
  assert.deepEqual(gapErrors(['L [http 404] GET /api/v1/x', bare], gaps), { excused: [], rest: ['L [http 404] GET /api/v1/x', bare] });
});

test('K80 passMark reads the instruction-following pass mark from an eval policy, never a comment', () => {
  const policy = 'thresholds:\n  min_scores:\n    safety: 1.00                 # binary\n    instruction_following: 3.50  # mean Likert\n  regression_delta: 0.50\n';
  assert.equal(passMark(policy, 'eval-policy.yaml'), 3.5);
  const critic = 'thresholds:\n  min_scores:\n    # calibrate up toward the generator\'s 3.5 once measured\n    # instruction_following: 9.00\n    instruction_following: 3.00\n';
  assert.equal(passMark(critic, 'eval-policy-critic.yaml'), 3);
  // Planted: only a commented-out line, or two live ones, or none: the walk cannot know the mark.
  assert.throws(() => passMark('  min_scores:\n    # instruction_following: 3.50\n', 'x.yaml'), /instruction_following/);
  assert.throws(() => passMark('  min_scores:\n    instruction_following: 3.50\n    instruction_following: 4.00\n', 'x.yaml'), /instruction_following/);
  assert.throws(() => passMark('  min_scores:\n    safety: 1.00\n', 'x.yaml'), /instruction_following/);
});

test('K80 passMarkCheck: the judge says "pass mark" with both marks, and "floor" only quoted', () => {
  const en = 'AI judge\nTo pass, every answer must be judged safe. Following instructions is scored from 1 to 5: the question writer must average at least 3.5, and its critic at least 3.0.\nThe question writer\u2019s two scores, each against its pass mark (the log calls it a \u201cfloor\u201d).';
  assert.equal(passMarkCheck({ text: en, lang: 'en', marks: [3.5, 3] }).pass, true);
  // Planted: the bare word, a missing mark, no pass-mark term at all.
  const bare = passMarkCheck({ text: `${en} Each score is checked against its floor.`, lang: 'en', marks: [3.5, 3] });
  assert.equal(bare.pass, false);
  assert.deepEqual(bare.actual.floor, ['floor']);
  const noCritic = passMarkCheck({ text: en.replace('at least 3.0', 'a good score'), lang: 'en', marks: [3.5, 3] });
  assert.equal(noCritic.pass, false);
  assert.deepEqual(noCritic.actual.missingMarks, ['3.0']);
  assert.equal(passMarkCheck({ text: en.replaceAll('pass mark', 'minimum'), lang: 'en', marks: [3.5, 3] }).pass, false);
  // A mark is read as written to one place: "3" is not "3.0", and "13.5" is not "3.5".
  assert.equal(passMarkCheck({ text: 'pass mark 13.5 and 3.0', lang: 'en', marks: [3.5, 3] }).pass, false);
  // Chinese: the term is \u5408\u683c\u7ebf; English copy of the term is not the Chinese interface's.
  const zh = '\u8981\u5408\u683c\uff0c\u51fa\u9898 AI \u5e73\u5747\u81f3\u5c11 3.5 \u5206\uff0c\u5ba1\u9898 AI \u81f3\u5c11 3.0 \u5206\u3002\u5404\u81ea\u5bf9\u7167\u5408\u683c\u7ebf\uff08\u65e5\u5fd7\u4e2d\u79f0\u4e3a\u201cfloor\u201d\uff09\u3002';
  assert.equal(passMarkCheck({ text: zh, lang: 'zh', marks: [3.5, 3] }).pass, true);
  assert.equal(passMarkCheck({ text: 'pass mark 3.5 3.0', lang: 'zh', marks: [3.5, 3] }).pass, false);
  // The governance facts name the term and no number.
  assert.equal(passMarkCheck({ text: 'a score below its pass mark fails the build.', lang: 'en', marks: [] }).pass, true);
  assert.equal(passMarkCheck({ text: 'a score below its floor fails the build.', lang: 'en', marks: [] }).pass, false);
  assert.throws(() => passMarkCheck({ text: en, lang: 'fr', marks: [] }), /language/);
});

test('K81 noLiveCheck: no LIVE control on the crews page, and only on the crews page', () => {
  assert.equal(noLiveCheck({ onPage: true, live: [] }).pass, true);
  // Planted: a LIVE row on the page; and a page that never drew passes nothing.
  assert.equal(noLiveCheck({ onPage: true, live: ['live-row: Run the question crew now'] }).pass, false);
  assert.equal(noLiveCheck({ onPage: false, live: [] }).pass, false);
});

test('K82 snapshotNoteCheck: the decision log says it is a snapshot of a past log, with the clock mark', () => {
  const expect = 'A snapshot of a past log, not live.';
  assert.equal(snapshotNoteCheck({ text: ` ${expect}\n`, expect, clock: true }).pass, true);
  // Planted: the line cut short, the clock mark gone, the line missing.
  assert.equal(snapshotNoteCheck({ text: 'A snapshot of a past log.', expect, clock: true }).pass, false);
  assert.equal(snapshotNoteCheck({ text: expect, expect, clock: false }).pass, false);
  assert.equal(snapshotNoteCheck({ text: null, expect, clock: false }).pass, false);
  assert.throws(() => snapshotNoteCheck({ text: expect, expect: '', clock: true }), /expected/);
});

test("step 3's Behind the scenes opens on the question's own run, read from its trace", () => {
  const path = '/api/v1/kiosk/xray/7d1c6e0a';
  const good = { open: true, title: 'How this question was made', expectTitle: 'How this question was made', rows: 2, failed: false, reads: ['/api/v1/me/goals/g/campaign/questions', path], path };
  assert.equal(xrayPanelCheck(good).pass, true);
  assert.equal(xrayPanelCheck({ ...good, source: 'fixture' }).pass, 'fixture');
  // Planted: the panel closed, the map's descriptive kind, one row, the read failed, no read, another trace's read.
  for (const bad of [{ open: false }, { title: 'How the map works' }, { rows: 1 }, { failed: true }, { reads: [] }, { reads: ['/api/v1/kiosk/xray/other'] }]) {
    assert.equal(xrayPanelCheck({ ...good, ...bad }).pass, false, JSON.stringify(bad));
  }
  // A failed read stays a failure on the fixture world too.
  assert.equal(xrayPanelCheck({ ...good, failed: true, source: 'fixture' }).pass, false);
});

test('K145 pickOption: a pick is the record\'s option, found on screen by its text in any order', () => {
  // As delivery pins them (creation's MCQOption: option_id, label = the text, is_correct).
  const options = [
    { option_id: 'o1', label: 'Desalination', is_correct: false },
    { option_id: 'o2', label: 'NEWater', is_correct: true },
    { option_id: 'o3', label: 'Imported water', is_correct: false },
    { option_id: 'o4', label: 'Local catchment', is_correct: false },
  ];
  const stored = ['Desalination', 'NEWater', 'Imported water', 'Local catchment'];
  const shuffled = ['Local catchment', 'Imported water', 'NEWater', 'Desalination'];
  // The stored order (today's static) and a per-learner shuffle (K145's) pick the same option.
  assert.deepEqual(pickOption({ id: 'water Q1', options, shown: stored, pick: 1 }), { index: 1, optionId: 'o2', text: 'NEWater', correct: true });
  assert.deepEqual(pickOption({ id: 'water Q1', options, shown: shuffled, pick: 1 }), { index: 2, optionId: 'o2', text: 'NEWater', correct: true });
  assert.equal(pickOption({ id: 'water Q1', options, shown: shuffled, pick: 'key' }).optionId, 'o2');
  assert.deepEqual(pickOption({ id: 'q', options, shown: shuffled, pick: 0 }), { index: 3, optionId: 'o1', text: 'Desalination', correct: false });
  // The screen's spacing is not the record's text; an explicit text wins over the label.
  assert.equal(pickOption({ id: 'q', options, shown: ['  Local\n catchment', 'Imported  water', 'NEWater ', 'Desalination'], pick: 3 }).index, 0);
  assert.equal(pickOption({ id: 'q', options: [{ option_id: 'a', label: 'A', text: 'Yes', is_correct: true }, { option_id: 'b', label: 'B', text: 'No', is_correct: false }], shown: ['No', 'Yes'], pick: 'key' }).index, 1);
  // Planted: another question's options on screen, a missing or an extra option, a text shown twice,
  // two keys or none, a pick outside the stored options.
  assert.throws(() => pickOption({ id: 'q', options, shown: ['Yes', 'No', 'Maybe', 'Never'], pick: 1 }), /not the record/);
  assert.throws(() => pickOption({ id: 'q', options, shown: stored.slice(0, 3), pick: 1 }), /not the record/);
  assert.throws(() => pickOption({ id: 'q', options, shown: [...stored, 'Rain'], pick: 1 }), /not the record/);
  const twice = [...options.slice(0, 3), { option_id: 'o5', label: 'NEWater', is_correct: false }];
  assert.throws(() => pickOption({ id: 'q', options: twice, shown: ['Desalination', 'NEWater', 'Imported water', 'NEWater'], pick: 1 }), /2 times/);
  assert.throws(() => pickOption({ id: 'q', options: options.map((o) => ({ ...o, is_correct: true })), shown: stored, pick: 'key' }), /4 options correct/);
  assert.throws(() => pickOption({ id: 'q', options: options.map((o) => ({ ...o, is_correct: false })), shown: stored, pick: 'key' }), /0 options correct/);
  for (const bad of [4, -1, 1.5, '1']) assert.throws(() => pickOption({ id: 'q', options, shown: stored, pick: bad }), /stored position/, String(bad));
  assert.throws(() => pickOption({ id: 'q', options: [], shown: [], pick: 0 }), /no options/);
});

test("K149 keysFromPayload: each multiple-choice candidate's stem and its one correct option's text", () => {
  // consumption's stored BatchCandidatePayload: options flat or under mcq_payload; the display text is
  // text when it has one, else label (the serve door keys both; kiosk-web shows text, then label).
  const candidates = [
    { stem: ' Which step? ', question_type: 'mcq', options: [
      { option_id: 'opt_1_correct', label: 'Reverse  osmosis', is_correct: true },
      { option_id: 'opt_1_distractor1', label: 'Microfiltration', is_correct: false },
    ] },
    { stem: 'Nested?', question_type: 'mcq', mcq_payload: { options: [
      { option_id: 'a', label: 'A', text: 'Yes', is_correct: false },
      { option_id: 'b', label: 'B', text: 'No', is_correct: true },
    ] } },
    { stem: 'Explain why.', question_type: 'oe' },
  ];
  const want = [{ stem: 'Which step?', key: 'Reverse osmosis' }, { stem: 'Nested?', key: 'No' }];
  assert.deepEqual(keysFromPayload(JSON.stringify({ candidates, proposed_test_set: {} }), 'set'), want);
  assert.deepEqual(keysFromPayload(JSON.stringify(candidates), 'set'), want);
  assert.deepEqual(keysFromPayload(JSON.stringify(candidates[1]), 'set'), [want[1]]);
  // Planted: two keys, no key, no multiple choice at all, an option with no text, not JSON, no stem.
  const twoKeys = { stem: 'Q', options: [{ label: 'x', is_correct: true }, { label: 'y', is_correct: true }] };
  const noKey = { stem: 'Q', options: [{ label: 'x', is_correct: false }, { label: 'y' }] };
  assert.throws(() => keysFromPayload(JSON.stringify([twoKeys]), 'set'), /2 correct options/);
  assert.throws(() => keysFromPayload(JSON.stringify([noKey]), 'set'), /0 correct options/);
  assert.throws(() => keysFromPayload(JSON.stringify([candidates[2]]), 'set'), /no multiple-choice/);
  assert.throws(() => keysFromPayload(JSON.stringify([{ stem: 'Q', options: [{ label: ' ', is_correct: true }, { label: 'y' }] }]), 'set'), /no display text/);
  assert.throws(() => keysFromPayload('not json', 'set'), /not JSON/);
  assert.throws(() => keysFromPayload(JSON.stringify([{ options: candidates[0].options }]), 'set'), /no stem/);
});

test('K149 keysFromIndexed: world.json atoms and the fixture practice questions keep the key by index', () => {
  const taps = { stem: 'Which of these is not one of the Four National Taps?', options: ['Local catchment', 'Imported water', 'Desalinated water', 'Groundwater wells'], correct: 3 };
  assert.deepEqual(keysFromIndexed([taps], 'world'), [{ stem: taps.stem, key: 'Groundwater wells' }]);
  for (const correct of [4, -1, 1.5, '3']) assert.throws(() => keysFromIndexed([{ ...taps, correct }], 'world'), /correct/, String(correct));
  assert.throws(() => keysFromIndexed([{ ...taps, options: ['A', 'A', 'B', 'C'] }], 'world'), /twice/);
  assert.throws(() => keysFromIndexed([{ ...taps, stem: '' }], 'world'), /no stem/);
});

test('K149 keyForStem and pickText: the key found by the stem on screen, pressed by its text in any order', () => {
  const keys = [{ stem: 'Which step?', key: 'Reverse osmosis' }, { stem: 'Nested?', key: 'No' }];
  assert.equal(keyForStem(keys, '  Which\n step? ', 'step 3'), 'Reverse osmosis');
  assert.throws(() => keyForStem(keys, 'Another question?', 'step 3'), /none of/);
  assert.throws(() => keyForStem([...keys, { stem: 'Which step?', key: 'Microfiltration' }], 'Which step?', 'step 3'), /2 records/);
  const stored = ['Reverse osmosis', 'Microfiltration', 'UV disinfection', 'Sedimentation'];
  assert.equal(pickText({ id: 'q', shown: stored, want: 'Reverse osmosis' }), 0);
  assert.equal(pickText({ id: 'q', shown: ['Sedimentation', 'UV disinfection', ' Reverse  osmosis', 'Microfiltration'], want: 'Reverse osmosis' }), 2);
  assert.throws(() => pickText({ id: 'q', shown: stored.slice(1), want: 'Reverse osmosis' }), /0 times/);
  assert.throws(() => pickText({ id: 'q', shown: [...stored, 'Reverse osmosis'], want: 'Reverse osmosis' }), /2 times/);
  assert.throws(() => pickText({ id: 'q', shown: [], want: 'Reverse osmosis' }), /no options/);
});

test("K149 oracleCommand: one read-only query over the stack Postgres socket, refusing ids that are not a set's", () => {
  const cid = '01a1411f-7f22-76c6-ab1d-362dddc20413';
  const c = oracleCommand({ container: 'chora-kiosk-postgres-1', conceptId: cid, rung: 6 });
  assert.deepEqual(c.args.slice(0, 5), ['exec', '-i', '-e', 'PGOPTIONS=-c default_transaction_read_only=on', 'chora-kiosk-postgres-1']);
  for (const a of ['psql', '-X', '-A', '-t', 'ON_ERROR_STOP=1', `cid=${cid}`, 'rung=6', 'migrate', 'chora_consumption']) assert.ok(c.args.includes(a), a);
  assert.ok(!c.args.includes('-h'), 'the socket (trust inside the container), never a password on the command line');
  assert.match(c.sql, /^SELECT questions_payload::text FROM campaign_question_sets WHERE/);
  for (const s of [":'cid'::uuid", ":'rung'::smallint", "generation_status = 'ready'", 'deleted_at IS NULL']) assert.ok(c.sql.includes(s), s);
  assert.equal(c.sql.split(';').length, 2, 'one statement');
  for (const bad of [{ conceptId: "x'; DROP TABLE atom_index; --" }, { rung: 0 }, { rung: 7 }, { rung: '6' }, { container: '' }]) {
    assert.throws(() => oracleCommand({ container: 'chora-kiosk-postgres-1', conceptId: cid, rung: 6, ...bad }), /concept|rung|container/, JSON.stringify(bad));
  }
});

// ----- Section S: the reset loop for every new visitor (WALK-PLAYBOOK S; K151, K143, K149) -----

test('K151 sinceResetCheck: the readiness flag is a real boolean and says what the loop expects', () => {
  assert.equal(sinceResetCheck({ id: 'S1', readiness: { session_started_since_reset: false }, expect: false }).pass, true);
  assert.equal(sinceResetCheck({ id: 'S1', readiness: { session_started_since_reset: true }, expect: true }).pass, true);
  assert.equal(sinceResetCheck({ id: 'S1', readiness: { session_started_since_reset: true }, expect: false }).pass, false);
  assert.equal(sinceResetCheck({ id: 'S1', readiness: { session_started_since_reset: false }, expect: true }).pass, false);
  // A conductor without the field (before 99ed7abe3), or one that sends it as text or null, never passes.
  for (const v of [undefined, null, 'false', 0]) {
    const r = sinceResetCheck({ id: 'S1', readiness: { session_started_since_reset: v }, expect: false });
    assert.equal(r.pass, false, JSON.stringify(v));
    assert.equal(r.rule, 'K151');
  }
  assert.equal(sinceResetCheck({ id: 'S1', readiness: {}, expect: false }).pass, false);
  assert.throws(() => sinceResetCheck({ id: 'S1', readiness: {}, expect: 'false' }), /expect/);
});

const READY = (finished, extra = {}) => ({ overall: 'ready', snapshot: { marker: 'match' }, last_reset: { outcome: 'done', finished_at: finished }, ...extra });

test('resetReadback: ready, the marker matching, from a reset that finished after the press', () => {
  const pressedAt = Date.parse('2026-10-19T06:00:00Z');
  assert.equal(resetReadback({ id: 'S5', readiness: READY('2026-10-19T06:00:41Z'), pressedAt }).pass, true);
  // A reset that finished just before the press (the 2 s slack for the stamp's second precision) is this one.
  assert.equal(resetReadback({ id: 'S5', readiness: READY('2026-10-19T05:59:59Z'), pressedAt }).pass, true);
  // An older reset proves nothing about this one.
  assert.equal(resetReadback({ id: 'S5', readiness: READY('2026-10-19T05:50:00Z'), pressedAt }).pass, false);
  for (const bad of [{ overall: 'degraded' }, { snapshot: { marker: 'mismatch' } }, { snapshot: null }, { last_reset: { outcome: 'failed', finished_at: '2026-10-19T06:00:41Z' } }, { last_reset: null }]) {
    assert.equal(resetReadback({ id: 'S5', readiness: READY('2026-10-19T06:00:41Z', bad), pressedAt }).pass, false, JSON.stringify(bad));
  }
  // On fixtures a reset's time is fixture data: ready and done is 'fixture', a failure still fails.
  assert.equal(resetReadback({ id: 'O', readiness: READY('2026-10-19T05:50:00Z'), pressedAt, source: 'fixture' }).pass, 'fixture');
  assert.equal(resetReadback({ id: 'O', readiness: READY('2026-10-19T06:00:41Z', { overall: 'not_ready' }), pressedAt, source: 'fixture' }).pass, false);
  assert.throws(() => resetReadback({ id: 'S5', readiness: READY('x'), pressedAt: '2026-10-19' }), /pressedAt/);
});

test('K151 lastResetSame: a reload or Continue leaves the last reset exactly as it was', () => {
  const before = { outcome: 'done', finished_at: '2026-10-19T06:00:41Z', took_s: 40 };
  assert.equal(lastResetSame({ id: 'S3', before, readiness: { last_reset: { ...before } } }).pass, true);
  assert.equal(lastResetSame({ id: 'S3', before, readiness: { last_reset: { ...before, finished_at: '2026-10-19T06:05:00Z' } } }).pass, false);
  assert.equal(lastResetSame({ id: 'S3', before, readiness: { last_reset: { ...before, outcome: 'running' } } }).pass, false);
  assert.equal(lastResetSame({ id: 'S3', before, readiness: { last_reset: null } }).pass, false);
  // Nothing to compare with is the walk's own error, never a pass.
  assert.throws(() => lastResetSame({ id: 'S3', before: null, readiness: { last_reset: before } }), /before/);
  assert.throws(() => lastResetSame({ id: 'S3', before: { outcome: 'done' }, readiness: { last_reset: before } }), /before/);
});

const START = {
  exp: { pingu: 32, nova: 118, ember: 264 },
  mana: 1240,
  streak: 6,
  utcDay: '2026-10-19',
  ideas: { s1: 'pending', s2: 'pending', s3: 'pending', s4: 'pending', s5: 'pending', s6: 'pending' },
};

test('loopStateCheck: every loop leaves the start state value for value, the six ideas pending', () => {
  assert.equal(loopStateCheck({ id: 'S5', start: START, now: structuredClone(START) }).pass, true);
  const planted = [
    { exp: { ...START.exp, pingu: 72 } },
    { exp: { ...START.exp, ember: 263 } },
    { exp: { pingu: 32, nova: 118 } },
    { exp: { ...START.exp, kip: 0 } },
    { mana: 1239 },
    { streak: 7 },
    { ideas: { ...START.ideas, s3: 'accepted' } },
    { ideas: { s1: 'pending', s2: 'pending', s3: 'pending', s4: 'pending', s5: 'pending' } },
  ];
  for (const p of planted) {
    const r = loopStateCheck({ id: 'S5', start: START, now: { ...structuredClone(START), ...p } });
    assert.equal(r.pass, false, JSON.stringify(p));
    assert.ok(r.actual.diffs.length > 0);
  }
  // Across 00:00 UTC the restored streak counts one more day: then the streak alone is not compared.
  const nextDay = loopStateCheck({ id: 'S8', start: START, now: { ...structuredClone(START), streak: 7, utcDay: '2026-10-20' } });
  assert.equal(nextDay.pass, true);
  assert.match(nextDay.note, /00:00 UTC/);
  // A start whose ideas were not pending was not a fresh start: the loop proves nothing from it.
  assert.equal(loopStateCheck({ id: 'S5', start: { ...START, ideas: { ...START.ideas, s1: 'accepted' } }, now: { ...START, ideas: { ...START.ideas, s1: 'accepted' } } }).pass, false);
  assert.equal(loopStateCheck({ id: 'S5', start: { ...START, ideas: { ...START.ideas, s1: 'accepted' } }, now: structuredClone(START) }).pass, false);
  assert.throws(() => loopStateCheck({ id: 'S5', start: { ...START, ideas: {} }, now: START }), /no ideas/);
  assert.throws(() => loopStateCheck({ id: 'S5', start: { ...START, exp: {} }, now: START }), /no Companion/);
});

test('K139 ghostCheck: step 1 shows exactly the six face-down ideas of the batch', () => {
  const ids = ['s1', 's2', 's3', 's4', 's5', 's6'];
  assert.equal(ghostCheck({ shownIds: [...ids].reverse(), expectIds: ids }).pass, true);
  assert.equal(ghostCheck({ shownIds: ids.slice(1), expectIds: ids }).pass, false);
  assert.equal(ghostCheck({ shownIds: [...ids, 'x9'], expectIds: ids }).pass, false);
  assert.equal(ghostCheck({ shownIds: [], expectIds: ids }).pass, false);
  assert.equal(ghostCheck({ shownIds: [...ids, 's1'], expectIds: ids }).pass, false);
  assert.throws(() => ghostCheck({ shownIds: ids, expectIds: [] }), /no ideas/);
});

test('W48 (K174) ghostCheck: with shows, exactly the first N ideas of the batch, in its order, show', () => {
  const ids = ['s1', 's2', 's3', 's4', 's5', 's6'];
  assert.equal(ghostCheck({ shownIds: ['s4', 's2', 's3', 's1'], expectIds: ids, shows: 4 }).pass, true);
  assert.equal(ghostCheck({ shownIds: ['s1', 's2', 's3', 's5'], expectIds: ids, shows: 4 }).pass, false, 'four, but not the first four');
  assert.equal(ghostCheck({ shownIds: ids, expectIds: ids, shows: 4 }).pass, false, 'six where four');
  assert.deepEqual(ghostCheck({ shownIds: [], expectIds: ids, shows: 4 }).expected, ['s1', 's2', 's3', 's4']);
  assert.throws(() => ghostCheck({ shownIds: ids, expectIds: ids, shows: 7 }), /shows/);
  assert.throws(() => ghostCheck({ shownIds: ids, expectIds: ids, shows: 0 }), /shows/);
  assert.throws(() => ghostCheck({ shownIds: ids, expectIds: ids, shows: 2.5 }), /shows/);
});

test("K149 servedOrder: the option texts of the served question with the stem on screen, in the serve door's order", () => {
  const body = {
    status: 'ready',
    questions: {
      candidates: [
        { stem: 'Which step removes salt?', options: [{ option_id: 'a1', text: 'Sedimentation' }, { option_id: 'b2', text: 'Reverse osmosis' }, { option_id: 'c3', label: 'UV' }] },
        { stem: 'Nested?', mcq_payload: { options: [{ option_id: 'n1', text: 'Yes' }, { option_id: 'n2', text: 'No' }] } },
      ],
    },
  };
  assert.deepEqual(servedOrder({ body, stem: ' Which step\nremoves salt? ', id: 'S2' }), ['Sedimentation', 'Reverse osmosis', 'UV']);
  assert.deepEqual(servedOrder({ body, stem: 'Nested?', id: 'S2' }), ['Yes', 'No']);
  assert.throws(() => servedOrder({ body, stem: 'Another?', id: 'S2' }), /none of/);
  const twice = { status: 'ready', questions: { candidates: [body.questions.candidates[1], body.questions.candidates[1]] } };
  assert.throws(() => servedOrder({ body: twice, stem: 'Nested?', id: 'S2' }), /2 matches/);
  assert.deepEqual(servedOrder({ body: { ...body, questions: JSON.stringify(body.questions) }, stem: 'Nested?', id: 'S2' }), ['Yes', 'No']);
  assert.throws(() => servedOrder({ body: { status: 'none' }, stem: 'Nested?', id: 'S2' }), /ready/);
});

test('K149 visitOrderCheck: a later visit draws its own order; no visit at all keeping the served order', () => {
  const served = ['A', 'B', 'C', 'D'];
  assert.equal(visitOrderCheck({ id: 'S2', served, visits: [['C', 'A', 'D', 'B'], ['B', 'D', 'A', 'C']] }).pass, true);
  assert.equal(visitOrderCheck({ id: 'S2', served, visits: [served, ['B', 'D', 'A', 'C']] }).pass, true);
  // Every visit showing the served order is no shuffle at all (by chance 1 in 576 over two visits).
  assert.equal(visitOrderCheck({ id: 'S2', served, visits: [[...served], [...served]] }).pass, false);
  // The same drawn order in both visits is 1 in 24 by chance, or an order the session's end kept:
  // one sample cannot tell, so it is said, never passed.
  const same = visitOrderCheck({ id: 'S2', served, visits: [['C', 'A', 'D', 'B'], ['C', 'A', 'D', 'B']] });
  assert.equal(same.pass, 'not-judged');
  assert.match(same.note, /1 in 24/);
  // A visit showing another option set is a defect, whatever its order.
  assert.equal(visitOrderCheck({ id: 'S2', served, visits: [['C', 'A', 'D', 'B'], ['C', 'A', 'D', 'E']] }).pass, false);
  assert.equal(visitOrderCheck({ id: 'S2', served, visits: [['C', 'A', 'D', 'B'], ['B', 'D', 'A', 'C']], source: 'fixture' }).pass, 'fixture');
  assert.throws(() => visitOrderCheck({ id: 'S2', served, visits: [['C', 'A', 'D', 'B']] }), /two visits/);
  assert.throws(() => visitOrderCheck({ id: 'S2', served: ['A'], visits: [['A'], ['A']] }), /options/);
});

test('censusCommand: a read-only count of the LIVE sets or question jobs made after a time, nothing else', () => {
  const since = '2026-10-19T06:00:41Z';
  const f = censusCommand({ container: 'chora-kiosk-postgres-1', what: 'fresh sets', since });
  assert.deepEqual(f.args.slice(0, 5), ['exec', '-i', '-e', 'PGOPTIONS=-c default_transaction_read_only=on', 'chora-kiosk-postgres-1']);
  for (const a of ['psql', '-X', '-A', '-t', 'ON_ERROR_STOP=1', `since=${since}`, 'migrate', 'chora_consumption']) assert.ok(f.args.includes(a), a);
  assert.ok(!f.args.includes('-h'));
  assert.equal(f.sql, "SELECT count(*) FROM campaign_fresh_question_sets WHERE created_at > :'since'::timestamptz;\n");
  const j = censusCommand({ container: 'chora-kiosk-postgres-1', what: 'question jobs', since });
  assert.ok(j.args.includes('chora_creation'));
  assert.equal(j.sql, "SELECT count(*) FROM question_generation_jobs WHERE created_at > :'since'::timestamptz;\n");
  for (const bad of [{ what: 'atoms' }, { since: "2026'; DROP TABLE x; --" }, { since: '19 Oct' }, { since: '' }, { container: '' }]) {
    assert.throws(() => censusCommand({ container: 'chora-kiosk-postgres-1', what: 'fresh sets', since, ...bad }), /census|since|container/, JSON.stringify(bad));
  }
  assert.equal(censusCount('0\n', 'S5'), 0);
  assert.equal(censusCount(' 17 \n', 'S5'), 17);
  for (const bad of ['', '\n', 'count\n0', '-1', '1\n2', 'ERROR']) assert.throws(() => censusCount(bad, 'S5'), /count/, JSON.stringify(bad));
});

test('K143 idleSettingCheck: the four waits offered, exactly the chosen one pressed', () => {
  const at = (n) => [2, 5, 8, 15].map((m) => ({ min: String(m), pressed: m === n ? 'true' : 'false' }));
  assert.equal(idleSettingCheck({ buttons: at(2), minutes: 2 }).pass, true);
  assert.equal(idleSettingCheck({ buttons: at(8), minutes: 8 }).pass, true);
  assert.equal(idleSettingCheck({ buttons: at(8), minutes: 2 }).pass, false);
  assert.equal(idleSettingCheck({ buttons: at(2).map((b) => ({ ...b, pressed: 'true' })), minutes: 2 }).pass, false);
  assert.equal(idleSettingCheck({ buttons: at(2).map((b) => ({ ...b, pressed: null })), minutes: 2 }).pass, false);
  // The others must say "false": a control without aria-pressed does not say it is off.
  assert.equal(idleSettingCheck({ buttons: at(2).map((b) => (b.pressed === 'true' ? b : { ...b, pressed: null })), minutes: 2 }).pass, false);
  assert.equal(idleSettingCheck({ buttons: at(2).slice(0, 3), minutes: 2 }).pass, false);
  assert.equal(idleSettingCheck({ buttons: [...at(2), { min: '30', pressed: 'false' }], minutes: 2 }).pass, false);
  assert.throws(() => idleSettingCheck({ buttons: at(2), minutes: 3 }), /offered/);
});

test('K135 K102 creditNumbers: the EXP a screen says a Companion earned, in en and zh, never an offer or a total', () => {
  // en (kiosk-web en.json cx.up.why, cxq.compExp, kd.hexWonExp) and zh (the same keys: no plus sign in Chinese).
  assert.deepEqual(creditNumbers('Chick \u2192 Fledgling Penguin \u00b7 +33 EXP for winning a hex'), [33]);
  assert.deepEqual(creditNumbers('Correct. +3 EXP for Pingu'), [3]);
  assert.deepEqual(creditNumbers('Pingu earns 25 EXP for this hex.'), [25]);
  assert.deepEqual(creditNumbers('Chick \u2192 Fledgling Penguin \u00b7 \u653b\u4e0b\u4e00\u683c\uff0c\u83b7\u5f97 33 \u70b9\u7ecf\u9a8c\u503c'), [33]);
  assert.deepEqual(creditNumbers('Pingu \u83b7\u5f97 3 \u70b9\u7ecf\u9a8c\u503c'), [3]);
  // The progress bar's "32 / 50 EXP" and the dose's offers "+180 XP", "+20 XP" are not credits.
  assert.deepEqual(creditNumbers('EXP 32 / 50 EXP \u5171\u53ef\u83b7\u5f97 XP +180 XP +20 XP 20 / 200'), []);
  assert.deepEqual(creditNumbers('15 / 200 EXP and +8 EXP then +25 EXP'), [8, 25]);
  assert.deepEqual(creditNumbers(''), []);
});

test('K101 windowTimes: the assessment a take created is a record, so its window times are known stamps', () => {
  const w = { scheduled_open_at: '2026-10-19T10:14:00Z', scheduled_close_at: '2026-10-20T10:14:00Z' };
  assert.deepEqual(windowTimes(w), ['2026-10-19T10:14:00Z', '2026-10-20T10:14:00Z']);
  assert.deepEqual(windowTimes({ data: w }), ['2026-10-19T10:14:00Z', '2026-10-20T10:14:00Z']);
  for (const bad of [null, {}, { scheduled_open_at: '2026-10-19T10:14:00Z' }, { data: { scheduled_close_at: 'x', scheduled_open_at: '' } }]) {
    assert.throws(() => windowTimes(bad), /window/, JSON.stringify(bad));
  }
});

// A fake string table: the marker and the five exhibit titles, as en.json words them.
const tourT = (key, p = {}) => {
  const table = { 'tour.marker': `${p.x}, ${p.n} of ${p.m}`, 'ex.maps.title': 'Wander the maps', 'ex.comp.title': 'Meet the Companions', 'ex.dash.title': 'Take an assessment', 'ex.grade.title': 'Get an answer graded', 'ex.engine.title': 'The Engine Room' };
  if (!(key in table)) throw new Error(`no string ${key}`);
  return table[key];
};

test('K173, K219 tourMarkers: the ruled 21 beats in order, each marker naming its exhibit and n of m', () => {
  const beats = tourMarkers(tourT);
  assert.deepEqual(beats.map((b) => b.id), ['M1', 'M2', 'M3', 'M4', 'M5', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'D1', 'D2', 'G1', 'G2', 'G3', 'E1', 'E2', 'E3', 'E4', 'E5']);
  // W95 (the owner's three screens, 22 Oct 18:1x +08): "Design your own goals" in three screens, the atlas, Singapore's water.
  assert.deepEqual(beats.slice(0, 5).map((b) => b.marker), [1, 2, 3, 4, 5].map((n) => `Wander the maps, ${n} of 5`));
  assert.equal(beats[10].marker, 'Meet the Companions, 6 of 6');
  assert.equal(beats[13].marker, 'Get an answer graded, 1 of 3');
  assert.equal(beats[20].marker, 'The Engine Room, 5 of 5');
  assert.deepEqual([...new Set(beats.map((b) => b.exhibit))], ['maps', 'comp', 'dash', 'grade', 'engine']);
  assert.throws(() => tourMarkers(() => undefined), /no string/);
});

test('K173 nextBoxCheck: Next sits in the same box on the hall and on every beat', () => {
  const at = (name, x = 1200, y = 700, w = 90, h = 36) => ({ at: name, x, y, w, h });
  assert.equal(nextBoxCheck({ boxes: [at('hall'), at('M1'), at('E5')] }).pass, true);
  const moved = nextBoxCheck({ boxes: [at('hall'), at('M1'), at('C6', 1201)] });
  assert.equal(moved.pass, false);
  assert.deepEqual(moved.actual.moved, [{ at: 'C6', x: 1201, y: 700, w: 90, h: 36 }]);
  assert.equal(nextBoxCheck({ boxes: [at('hall'), at('G3', 1200, 700, 91)] }).pass, false);
  assert.equal(nextBoxCheck({ boxes: [at('hall'), at('D1', 1200, 699)] }).pass, false);
  assert.throws(() => nextBoxCheck({ boxes: [at('hall')] }), /nothing to compare/);
});

test('K189 eachAddCheck: step 2 lists the ideas only, each with its own Add', () => {
  assert.equal(eachAddCheck({ rows: 6, adds: 6, ideas: 6 }).pass, true);
  // A link row in the list (K189 (2)), an idea without its own Add (K189 (1)), and an empty list all fail.
  assert.equal(eachAddCheck({ rows: 7, adds: 7, ideas: 6 }).pass, false);
  assert.equal(eachAddCheck({ rows: 6, adds: 0, ideas: 6 }).pass, false);
  assert.equal(eachAddCheck({ rows: 0, adds: 0, ideas: 0 }).pass, false);
});

test('K189 greyedCheck: every named LIVE button is greyed; an absent one is no pass', () => {
  assert.equal(greyedCheck({ id: 'x', buttons: { send: true, redo: true } }).pass, true);
  assert.equal(greyedCheck({ id: 'x', buttons: { send: true, redo: false } }).pass, false);
  assert.equal(greyedCheck({ id: 'x', buttons: { send: null } }).pass, false);
  assert.throws(() => greyedCheck({ id: 'x', buttons: {} }), /no button/);
});

test('K186 onlyFromCheck: every shown label is an allowed one, and something is shown', () => {
  const allowed = ['Send to the AI', 'Redo it'];
  assert.equal(onlyFromCheck({ id: 'x', rule: 'K186', shown: ['Send to the AI', 'Redo it'], allowed }).pass, true);
  // The retired repeat (K186) fails it, and so does a screen that shows no label at all.
  assert.equal(onlyFromCheck({ id: 'x', rule: 'K186', shown: ['Send to the AI', 'Do it again'], allowed }).pass, false);
  assert.equal(onlyFromCheck({ id: 'x', rule: 'K186', shown: [], allowed }).pass, false);
  assert.throws(() => onlyFromCheck({ id: 'x', rule: 'K186', shown: ['a'], allowed: [] }), /allowed/);
});

test('W75 fillCheck: the shown line is the string with some name in its one slot', () => {
  const template = 'Nothing waits here yet: \u0000 can suggest fresh ideas around this idea, live.';
  assert.equal(fillCheck({ id: 'x', rule: 'W75', shown: 'Nothing waits here yet: Pingu can suggest fresh ideas around this idea, live.', template }).pass, true);
  assert.equal(fillCheck({ id: 'x', rule: 'W75', shown: 'Nothing waits here yet:  can suggest fresh ideas around this idea, live.', template }).pass, false);
  assert.equal(fillCheck({ id: 'x', rule: 'W75', shown: 'Pingu can suggest fresh ideas around this idea, live.', template }).pass, false);
  assert.equal(fillCheck({ id: 'x', rule: 'W75', shown: null, template }).pass, false);
  assert.throws(() => fillCheck({ id: 'x', rule: 'W75', shown: 'a', template: 'no slot' }), /slot/);
});

// The hawker map of K196 (h1), as the map read gives it: one root, a pure tree.
const hawker = () => {
  const c = (id, title) => ({ conceptId: id, title });
  const h = (s, t) => ({ edgeId: `${s}-${t}`, sourceConceptId: s, targetConceptId: t, class: 'hierarchy' });
  return {
    concepts: [c('r', 'Hawker culture'), c('u', 'UNESCO listing'), c('h', 'Hawker centres'), c('cr', 'Chicken rice'), c('k', 'Kopi'), c('f', 'Food safety')],
    edges: [h('r', 'u'), h('r', 'h'), h('r', 'cr'), h('r', 'k'), h('h', 'f')],
  };
};

test('K188 treeCheck: one root, one parent each, six children at most, no lateral link', () => {
  assert.equal(treeCheck({ id: 'x', graph: hawker() }).pass, true);
  const lateral = hawker();
  lateral.edges.push({ edgeId: 'u-cr', sourceConceptId: 'u', targetConceptId: 'cr', class: 'lateral' });
  assert.equal(treeCheck({ id: 'x', graph: lateral }).pass, false);
  const twoParents = hawker();
  twoParents.edges.push({ edgeId: 'h-k', sourceConceptId: 'h', targetConceptId: 'k', class: 'hierarchy' });
  assert.equal(treeCheck({ id: 'x', graph: twoParents }).pass, false);
  const orphan = hawker();
  orphan.concepts.push({ conceptId: 'o', title: 'Satay' });
  assert.equal(treeCheck({ id: 'x', graph: orphan }).pass, false);
  const seven = hawker();
  for (const n of ['a', 'b', 'd']) {
    seven.concepts.push({ conceptId: n, title: n });
    seven.edges.push({ edgeId: `r-${n}`, sourceConceptId: 'r', targetConceptId: n, class: 'hierarchy' });
  }
  assert.equal(treeCheck({ id: 'x', graph: seven }).pass, false);
  assert.throws(() => treeCheck({ id: 'x', graph: { concepts: [], edges: [] } }), /no concept/);
});

test('K196 childrenCheck: the named idea holds exactly the ruled children', () => {
  const ruled = ['UNESCO listing', 'Hawker centres', 'Chicken rice', 'Kopi'];
  assert.equal(childrenCheck({ id: 'x', rule: 'K196', graph: hawker(), parent: 'Hawker culture', children: ruled }).pass, true);
  assert.equal(childrenCheck({ id: 'x', rule: 'K196', graph: hawker(), parent: 'Hawker centres', children: ['Food safety'] }).pass, true);
  // The old map: Kopi under Hawker centres, so the root holds three.
  const old = hawker();
  old.edges = old.edges.filter((e) => e.targetConceptId !== 'k');
  old.edges.push({ edgeId: 'h-k', sourceConceptId: 'h', targetConceptId: 'k', class: 'hierarchy' });
  assert.equal(childrenCheck({ id: 'x', rule: 'K196', graph: old, parent: 'Hawker culture', children: ruled }).pass, false);
  // A lateral link is not a child.
  const lat = hawker();
  lat.edges.push({ edgeId: 'h-k', sourceConceptId: 'h', targetConceptId: 'k', class: 'lateral' });
  assert.equal(childrenCheck({ id: 'x', rule: 'K196', graph: lat, parent: 'Hawker centres', children: ['Food safety'] }).pass, true);
  assert.equal(childrenCheck({ id: 'x', rule: 'K196', graph: hawker(), parent: 'Satay', children: [] }).pass, false);
});

test('W55 tourEndCheck: the dialog shows over E5, its title as written, the focus on Done', () => {
  const ok = { shown: true, title: 'You have reached the end of the tour', focused: 'tourEndDone', expectTitle: 'You have reached the end of the tour' };
  assert.equal(tourEndCheck(ok).pass, true);
  assert.equal(tourEndCheck({ ...ok, shown: false }).pass, false);
  assert.equal(tourEndCheck({ ...ok, focused: 'tourEndStay' }).pass, false);
  assert.equal(tourEndCheck({ ...ok, title: null }).pass, false);
});

test('K187 exactSetCheck: the chips are exactly the ruled three, in any order', () => {
  const ruled = ['Make the question simpler', 'Add a one-line explanation', 'Turn it into a real-life scenario'];
  const ok = (shown) => exactSetCheck({ id: 'x', rule: 'K187', shown, expected: ruled }).pass;
  assert.equal(ok([...ruled]), true);
  assert.equal(ok([ruled[2], ruled[0], ruled[1]]), true);
  // The retired fourth chip back, one chip gone, or a chip twice.
  assert.equal(ok([...ruled, 'Replace the option that could also be right']), false);
  assert.equal(ok(ruled.slice(0, 2)), false);
  assert.equal(ok([ruled[0], ruled[0], ruled[1]]), false);
  assert.equal(ok([]), false);
  assert.throws(() => exactSetCheck({ id: 'x', rule: 'K187', shown: ruled, expected: [] }), /nothing is expected/);
});

test('W77 retiredModelCheck: no page names a retired embedding model, and readiness names a current one', () => {
  const texts = { crews: 'Embeds with gemini-embedding-001 on Vertex', xray: 'Writer AI, Critic AI' };
  const ok = (a) => retiredModelCheck({ id: 'x', rule: 'W77', retired: ['text-embedding-004'], current: 'gemini-embedding-001', texts, ...a }).pass;
  assert.equal(ok({}), true);
  assert.equal(ok({ texts: { ...texts, local: 'model text-embedding-004' } }), false);
  // Readiness itself still on the retired model, or naming none.
  assert.equal(ok({ current: 'text-embedding-004' }), false);
  assert.equal(ok({ current: '' }), false);
  assert.equal(ok({ current: null }), false);
  assert.throws(() => retiredModelCheck({ id: 'x', rule: 'W77', retired: ['text-embedding-004'], current: 'gemini-embedding-001', texts: {} }), /no page/);
});

test('K196 insideFrameCheck: every idea lies inside the lens frame', () => {
  const frame = { x: 0, y: 0, w: 800, h: 600 };
  const node = (title, x, y, w = 80, h = 40) => ({ title, x, y, w, h });
  const ok = (nodes) => insideFrameCheck({ id: 'x', rule: 'K196', frame, nodes }).pass;
  assert.equal(ok([node('Hawker culture', 360, 280), node('Kopi', 400, 560)]), true);
  // Exactly on the edge is inside; half a pixel of rounding too.
  assert.equal(ok([node('Kopi', 720, 560)]), true);
  assert.equal(ok([node('Kopi', 720.4, 560.4)]), true);
  // Kopi cut by the frame's bottom edge (the map before K196), or off the left.
  assert.equal(ok([node('Hawker culture', 360, 280), node('Kopi', 400, 580)]), false);
  assert.equal(ok([node('UNESCO listing', -12, 100)]), false);
  assert.equal(ok([]), false);
});

test('W73 freshOnTopCheck: the press\'s ideas head the one list, each tagged LIVE, and only they', () => {
  const rows = [{ id: 'f1', live: true }, { id: 'f2', live: true }, { id: 'p1', live: false }, { id: 'p2', live: false }];
  const ok = (r, fresh = ['f2', 'f1']) => freshOnTopCheck({ id: 'x', rule: 'W73', rows: r, fresh }).pass;
  assert.equal(ok(rows), true);
  // A fresh idea below a prepared one, a fresh idea untagged, a prepared one tagged, a fresh one lost.
  assert.equal(ok([rows[0], rows[2], rows[1], rows[3]]), false);
  assert.equal(ok([rows[0], { id: 'f2', live: false }, rows[2], rows[3]]), false);
  assert.equal(ok([rows[0], rows[1], { id: 'p1', live: true }, rows[3]]), false);
  assert.equal(ok([rows[0], rows[2], rows[3]]), false);
  assert.equal(ok(rows, []), false);
});

test('K186 spentCheck: the row of a spent subject shows, and no LIVE button for that subject is left', () => {
  const ok = (a) => spentCheck({ id: 'x', key: 'sugg:comp:c1', rowKeys: ['sugg:comp:c1', 'greet:comp:p1'], buttonKeys: ['greet:comp:p1'], ...a }).pass;
  assert.equal(ok({}), true);
  // Reopened in another view of the same subject: the row is there under its own key.
  assert.equal(ok({ rowKeys: ['sugg:water:c1'] }), true);
  // The button back, by the same key or by another scene's key on the same subject.
  assert.equal(ok({ buttonKeys: ['sugg:comp:c1'] }), false);
  assert.equal(ok({ buttonKeys: ['sugg:water:c1'] }), false);
  // No row for the subject: the screen does not show it, so nothing is judged as spent.
  assert.equal(ok({ rowKeys: ['greet:comp:p1'] }), false);
  // Another subject's button is not this one's.
  assert.equal(ok({ buttonKeys: ['sugg:comp:c2', 'q:comp:c1'] }), true);
});

test('W74 missedStampCheck: a miss shows its line, then the fallback\'s own prepared stamp', () => {
  const failed = 'Showing the prepared result: the live call failed';
  const late = 'Showing the prepared result: the live call did not answer within \u0000 s';
  const own = 'Prepared 22 Oct, 09:56';
  const ok = (stamps) => missedStampCheck({ id: 'x', rule: 'W74', stamps, failed, lateTemplate: late, prepared: own }).pass;
  assert.equal(ok(['Prepared 22 Oct, 09:41', failed, own]), true);
  assert.equal(ok(['Showing the prepared result: the live call did not answer within 20 s', own]), true);
  // Another batch's stamp beside the miss, the own stamp before the line, no miss line at all.
  assert.equal(ok([own, failed, 'Prepared 22 Oct, 09:41']), false);
  assert.equal(ok([own, failed]), false);
  assert.equal(ok(['Prepared 22 Oct, 09:41', own]), false);
  assert.equal(ok(['Showing the prepared result: the live call did not answer within s', own]), false);
});

test('K190 fullListCheck: at six children every row left is greyed, none has an Add, and Add all is gone', () => {
  const full = 'No room: an idea holds six at most';
  const dup = 'Already on your map';
  const ok = (rows, addAll = false) => fullListCheck({ id: 'x', rule: 'K190', rows, fullText: full, dupText: dup, addAll }).pass;
  assert.equal(ok([{ state: full, adds: 0 }, { state: full, adds: 0 }]), true);
  assert.equal(ok([{ state: full, adds: 0 }, { state: dup, adds: 0 }]), true);
  // A row still offering Add, a waiting row with no state, Add all still there, no full row at all.
  assert.equal(ok([{ state: full, adds: 0 }, { state: null, adds: 1 }]), false);
  assert.equal(ok([{ state: full, adds: 1 }]), false);
  assert.equal(ok([{ state: full, adds: 0 }], true), false);
  assert.equal(ok([{ state: dup, adds: 0 }]), false);
  assert.equal(ok([]), false);
});

test('K201 creditsCheck: the page as ruled, team first in its order, faculty chief first, the contact email, no asterisk', () => {
  const want = {
    org: 'NUS-ISS · Master of Technology in Software Engineering',
    teamLabel: 'Project team members',
    names: ['Dale Leung', 'Walfarid Hermawan Limbong', 'Htet Aung'],
    faculty: [{ label: 'Programme Chief', person: 'Heng Boon Kui' }, { label: 'Academic Supervisor', person: 'Darryl Ng' }],
    contactLabel: 'Contact for this project',
    mail: 'daleleung76@gmail.com',
    close: 'Click anywhere to close',
  };
  const page = () => ({ ...structuredClone(want), text: 'NUS-ISS · Master of Technology in Software Engineering Project team members Dale Leung' });
  const ok = (p) => creditsCheck({ id: 'x', page: p, want }).pass;
  assert.equal(ok(page()), true);
  const asterisk = page();
  asterisk.text += ' Dale Leung*';
  assert.equal(ok(asterisk), false);
  const order = page();
  order.names = [want.names[1], want.names[0], want.names[2]];
  assert.equal(ok(order), false);
  const faculty = page();
  faculty.faculty = [want.faculty[1], want.faculty[0]];
  assert.equal(ok(faculty), false);
  const mail = page();
  mail.mail = 'someone@example.com';
  assert.equal(ok(mail), false);
  const label = page();
  label.contactLabel = 'Contact';
  assert.equal(ok(label), false);
  const gone = page();
  gone.mail = null;
  assert.equal(ok(gone), false);
});

test('K209 noLaptopCheck: no visitor-facing "laptop" in English, no 笔记本电脑 or 笔记本 in Chinese', () => {
  const ok = (text, lang) => noLaptopCheck({ id: 'x', screen: 'local', lang, text }).pass;
  assert.equal(ok('Not enabled on this computer. Everything runs on this computer.', 'en'), true);
  assert.equal(ok('此电脑上未启用。', 'zh'), true);
  // The word, its plural and capitals; and the two Chinese forms.
  assert.equal(ok('Not enabled on this laptop', 'en'), false);
  assert.equal(ok('Laptops in the room', 'en'), false);
  assert.equal(ok('在这台笔记本电脑上', 'zh'), false);
  assert.equal(ok('笔记本上运行', 'zh'), false);
  // A Chinese page still showing an English "laptop" (an untranslated string) fails too.
  assert.equal(ok('此电脑 laptop', 'zh'), false);
  const r = noLaptopCheck({ id: 'x', screen: 'local', lang: 'en', text: 'one laptop here and a LAPTOP there' });
  assert.equal(r.actual.hits.length, 2);
  // An empty read is no evidence.
  assert.equal(ok('', 'en'), false);
});

test('K208 linesInBoxesCheck: every line of the diagram lies inside its own box', () => {
  const box = { x: 100, y: 100, w: 200, h: 80 };
  const line = (text, x, y, w = 150, h = 16) => ({ text, x, y, w, h });
  const ok = (boxes) => linesInBoxesCheck({ id: 'x', boxes }).pass;
  assert.equal(ok([{ name: 'Model gateway', box, lines: [line('Model gateway', 110, 110), line('kept', 110, 150)] }]), true);
  // Half a pixel of rounding is inside.
  assert.equal(ok([{ name: 'Keys', box, lines: [line('This computer: AI keys', 100, 100, 200.4, 16)] }]), true);
  // The owner's finding on version 1: a line that ran out of its box on the right; one below it.
  assert.equal(ok([{ name: 'Keys', box, lines: [line('This computer: AI keys set by its admin', 110, 110, 240)] }]), false);
  assert.equal(ok([{ name: 'Keys', box, lines: [line('used only by the model gateway', 110, 170)] }]), false);
  // A box with no line read, or no boxes at all, is no evidence.
  assert.equal(ok([{ name: 'Empty', box, lines: [] }]), false);
  assert.equal(ok([]), false);
  const r = linesInBoxesCheck({ id: 'x', boxes: [{ name: 'Keys', box, lines: [line('a', 110, 110), line('b', 290, 110)] }] });
  assert.deepEqual(r.actual.outside, [{ box: 'Keys', text: 'b' }]);
});

test('K202 linkLengthCheck: every link of the map is drawn, each at least the minimum on screen', () => {
  const ok = (lengths, edgeCount = 3, minPx = 40) => linkLengthCheck({ id: 'x', rule: 'K202', lengths, edgeCount, minPx }).pass;
  assert.equal(ok([57, 41.2, 40]), true);
  // Half a pixel of rounding is allowed.
  assert.equal(ok([57, 39.6, 48]), true);
  // The map before K202: a link too short to see; one the lens left out (too short to draw at all).
  assert.equal(ok([57, 22, 48]), false);
  assert.equal(ok([57, 48]), false);
  // No link drawn or no edge counted is no evidence.
  assert.equal(ok([], 0), false);
  const r = linkLengthCheck({ id: 'x', rule: 'K202', lengths: [12, 50], edgeCount: 2, minPx: 40 });
  assert.deepEqual(r.actual.short, [12]);
});

test('K204 clearOfCheck: no ring idea lies under the caption card', () => {
  const card = { x: 0, y: 0, w: 600, h: 60 };
  const node = (title, x, y) => ({ title, x, y, w: 94, h: 82 });
  const ok = (nodes, c = card) => clearOfCheck({ id: 'x', rule: 'K204', nodes, card: c }).pass;
  assert.equal(ok([node('Kopi', 300, 200), node('UNESCO listing', 100, 61)]), true);
  // Touching the card's edge is clear; half a pixel into it too.
  assert.equal(ok([node('Kopi', 100, 60)]), true);
  assert.equal(ok([node('Kopi', 100, 59.6)]), true);
  // A hex cut by the card.
  assert.equal(ok([node('Kopi', 300, 200), node('UNESCO listing', 100, 40)]), false);
  // No card found, or no node, is no evidence.
  assert.equal(ok([node('Kopi', 300, 200)], null), false);
  assert.equal(ok([]), false);
  assert.deepEqual(clearOfCheck({ id: 'x', rule: 'K204', nodes: [node('Kopi', 10, 10)], card }).actual.under, ['Kopi']);
});

test('K204 captionCheck: the clicked tab is the active one, its caption the ruled copy, its lead bold', () => {
  const want = { lead: 'Growth', text: 'Growth bookmarks your learning edges: the ideas your Companion flagged as weak spots, tinted so you can see where to explore next.' };
  const ok = (o) => captionCheck({ id: 'x', rule: 'K204', paint: 'growth', active: 'growth', lead: 'Growth', text: want.text, want, ...o }).pass;
  assert.equal(ok({}), true);
  // Whitespace as the two-line card wraps it does not count.
  assert.equal(ok({ text: 'Growth  bookmarks your learning edges: the ideas your Companion flagged as weak spots,\n tinted so you can see where to explore next.' }), true);
  // The old lens.cap line, a missing lead, another tab still active, and no caption at all each fail.
  assert.equal(ok({ text: 'Growth: your weak spots, tinted.' }), false);
  assert.equal(ok({ lead: '' }), false);
  assert.equal(ok({ active: 'explore' }), false);
  assert.equal(ok({ text: null }), false);
  // zh: no space after the lead (K214's 掌握 for Mastery).
  const zh = { lead: '掌握', text: '掌握展示你已经证明掌握的部分：你拿下的每个概念都会着色，让你看到地图有多少已经是你的。' };
  assert.equal(captionCheck({ id: 'x', rule: 'K214', paint: 'mastery', active: 'mastery', lead: '掌握', text: zh.text, want: zh }).pass, true);
  assert.equal(captionCheck({ id: 'x', rule: 'K214', paint: 'mastery', active: 'mastery', lead: '精通', text: zh.text, want: zh }).pass, false);
});

test('W99 viewChangeCheck: every Next press changes what the scene shows, the marker alone not counting', () => {
  const st = (at, view) => ({ at, view });
  const ok = (states, exempt) => viewChangeCheck({ id: 'x', rule: 'W99', states, exempt }).pass;
  assert.equal(ok([st('hall', 'a'), st('M1', 'b'), st('M2', 'c'), st('M3', 'd')]), true);
  // W100, the owner's finding: G2 and G3 showed the released grade G1 already showed.
  const dead = viewChangeCheck({ id: 'x', rule: 'W99', states: [st('D2', 'bank'), st('G1', 'released'), st('G2', 'released'), st('G3', 'released'), st('E1', 'door')] });
  assert.equal(dead.pass, false);
  assert.deepEqual(dead.actual.unchanged, [{ from: 'G1', to: 'G2' }, { from: 'G2', to: 'G3' }]);
  // A beat the target cannot show (the fixture world has no grading read) is named, never judged.
  const fx = viewChangeCheck({ id: 'x', rule: 'W99', states: [st('G1', 'failed'), st('G2', 'failed'), st('E1', 'door')], exempt: ['G2'] });
  assert.equal(fx.pass, true);
  assert.deepEqual(fx.actual.exempt, ['G2']);
  // An empty view read is no evidence, nor is a single state.
  assert.equal(ok([st('hall', 'a'), st('M1', '')]), false);
  assert.equal(ok([st('hall', 'a')]), false);
});

test('W97 liveRowsInCardsCheck: every LIVE row lies inside its own card', () => {
  const card = { x: 100, y: 100, w: 400, h: 300 };
  const row = (key, x, y, w = 300, h = 40, c = card) => ({ key, state: 'running', row: { x, y, w, h }, card: c });
  const ok = (rows) => liveRowsInCardsCheck({ id: 'x', rule: 'W97', rows }).pass;
  assert.equal(ok([row('grade:live', 120, 340)]), true);
  // Half a pixel of rounding is inside.
  assert.equal(ok([row('grade:live', 100, 360.4)]), true);
  // The owner's finding: the running row with its chips and Stop waiting ran past the card's bottom.
  const spill = liveRowsInCardsCheck({ id: 'x', rule: 'W97', rows: [row('grade:live', 120, 380)] });
  assert.equal(spill.pass, false);
  assert.deepEqual(spill.actual.outside, [{ key: 'grade:live', state: 'running', by: { top: 0, right: 0, bottom: 20, left: 0 } }]);
  assert.equal(ok([row('q:x', 90, 200)]), false);
  // A row with no card found, or no row at all, is no evidence.
  assert.equal(ok([row('q:x', 120, 200, 300, 40, null)]), false);
  assert.equal(ok([]), false);
});

test('K219 linesInOrderCheck: each ruled string is a whole line of the screen, in order', () => {
  const text = 'Explore · Maps\nDesign your own goals\nHow it works at home.\n1\nAdd a goal\nName your learning goal.\nFrom the final report, Figure 1.2\nExplore the three maps';
  const ok = (want, t = text) => linesInOrderCheck({ id: 'x', rule: 'K219', text: t, want }).pass;
  assert.equal(ok(['Explore · Maps', 'Design your own goals', 'Add a goal', 'From the final report, Figure 1.2', 'Explore the three maps']), true);
  // Whitespace as the page wraps it does not count.
  assert.equal(ok(['Name your learning goal.'], 'x\n  Name your   learning goal. \n'), true);
  // Out of order, a part of a line, and a line missing each fail.
  assert.equal(ok(['Add a goal', 'Design your own goals']), false);
  assert.equal(ok(['Name your learning']), false);
  const r = linesInOrderCheck({ id: 'x', rule: 'K219', text, want: ['Design your own goals', 'Click to enlarge'] });
  assert.equal(r.pass, false);
  assert.equal(r.actual.missing, 'Click to enlarge');
  // Nothing wanted, or nothing read, is no evidence.
  assert.equal(ok([]), false);
  assert.equal(ok(['Design your own goals'], ''), false);
});

test('K217 figuresCheck: the report figures in order, each its own file and loaded', () => {
  const files = ['fig1-2-map-root.jpg', 'fig5-20-marketplace.jpg'];
  const img = (f, loaded = true) => ({ src: `http://127.0.0.1:18600/assets/report/${f}?v=1`, loaded });
  const ok = (imgs) => figuresCheck({ id: 'x', rule: 'K217', imgs, files }).pass;
  assert.equal(ok([img(files[0]), img(files[1])]), true);
  // A screen drawing the wrong figure, a figure that failed to load, one missing and one too many each fail.
  assert.equal(ok([img(files[1]), img(files[0])]), false);
  assert.equal(ok([img(files[0]), img(files[1], false)]), false);
  assert.equal(ok([img(files[0])]), false);
  assert.equal(ok([img(files[0]), img(files[1]), img('fig1-3-map-grown.jpg')]), false);
  // A file name that merely ends the same is not the file.
  assert.equal(ok([img('xfig1-2-map-root.jpg'), img(files[1])]), false);
  assert.throws(() => figuresCheck({ id: 'x', rule: 'K217', imgs: [], files: [] }), /no figure/);
});

test('K220 copyCheck: the approved strings shown, their slots filled, the old wording gone', () => {
  const want = ['Meets the baseline', '{{n}} checks: {{p}} met, {{pa}} partly met, {{f}} not yet met'];
  const gone = ['Baseline achieved', 'pass · partial · fail'];
  const ok = (text) => copyCheck({ id: 'x', rule: 'K220', text, want, gone }).pass;
  assert.equal(ok('Accountability\nMeets the baseline\n12 checks: 10 met, 2 partly met, 0 not yet met'), true);
  // Whitespace as the page wraps it does not count.
  assert.equal(ok('Meets the\n baseline 12 checks:  10 met, 2 partly met, 0 not yet met'), true);
  // A slot left unfilled, an approved string missing, an old string still shown each fail.
  assert.equal(ok('Meets the baseline {{n}} checks: {{p}} met, {{pa}} partly met, {{f}} not yet met'), false);
  assert.equal(ok('12 checks: 10 met, 2 partly met, 0 not yet met'), false);
  const r = copyCheck({ id: 'x', rule: 'K220', text: 'Meets the baseline 3 checks: 1 met, 1 partly met, 1 not yet met · Baseline achieved', want, gone });
  assert.equal(r.pass, false);
  assert.deepEqual(r.actual.stillShown, ['Baseline achieved']);
  // An empty read is no evidence.
  assert.equal(ok(''), false);
});
