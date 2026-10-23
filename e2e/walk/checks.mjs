// The walk's ruling checks (T4.1), pure functions so each one is tested against a planted defect
// (checks.test.mjs). Nothing here imports kiosk-web's own code: a check that shares the screen's
// formatter or rule agrees with the screen by construction and proves nothing.
//
// A result is { id, rule, pass, expected, actual }. `pass` is true, false, or 'fixture': on the dev
// fixture server a passing record check is fixture data, never a pass; a failing one still fails.

const ZONE = 'Asia/Singapore';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** The verdict of a check that held, on its source: the stack's records, or the fixture world's. */
export function verdict(ok, source = 'stack') {
  if (source !== 'stack' && source !== 'fixture') throw new Error(`[walk] unknown record source ${source}`);
  if (!ok) return false;
  return source === 'fixture' ? 'fixture' : true;
}

/** A record's time as a prepared stamp writes it: "18 Oct, 12:38" or "10月18日 12:38", Singapore time. */
export function formatStampWhen(iso, lang) {
  const ms = typeof iso === 'string' ? Date.parse(iso) : NaN;
  if (Number.isNaN(ms)) throw new Error(`[walk] not a time: ${iso}`);
  const p = Object.fromEntries(PARTS.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const month = Number(p.month);
  const day = Number(p.day);
  if (lang === 'zh') return `${month}月${day}日 ${p.hour}:${p.minute}`;
  if (lang === 'en') return `${day} ${MONTHS[month - 1]}, ${p.hour}:${p.minute}`;
  throw new Error(`[walk] unknown language ${lang}`);
}

const STAMP_RE = {
  en: /\b\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec), \d{2}:\d{2}\b/g,
  zh: /\d{1,2}月\d{1,2}日 \d{2}:\d{2}/g,
};

/** Every date and time on a screen's text (a bare clock is not a stamp). */
export function stampTimes(text, lang) {
  const re = STAMP_RE[lang];
  if (!re) throw new Error(`[walk] unknown language ${lang}`);
  return [...String(text).matchAll(re)].map((m) => m[0]);
}

/**
 * K101: every stamp on the screen reads a record's own time, and the choices this step shows
 * (`expect`, manifest choice keys) each have theirs on screen. `extra` names other known times
 * (ISO) a screen may show, such as the snapshot's own time on the presenter panel.
 */
export function checkStamps({ id, text, lang, manifest, expect, extra = [], source = 'stack' }) {
  const choices = manifest?.choices ?? {};
  for (const k of expect) {
    if (!choices[k]) throw new Error(`[walk] ${id}: the manifest has no choice ${k}`);
  }
  const known = new Set([...Object.values(choices).map((c) => formatStampWhen(c.prepared_at, lang)), ...extra.map((iso) => formatStampWhen(iso, lang))]);
  const found = stampTimes(text, lang);
  const unknown = [...new Set(found.filter((t) => !known.has(t)))];
  const missing = expect.filter((k) => !found.includes(formatStampWhen(choices[k].prepared_at, lang)));
  return {
    id,
    rule: 'K101',
    pass: verdict(unknown.length === 0 && missing.length === 0, source),
    expected: expect.map((k) => `${k} ${formatStampWhen(choices[k].prepared_at, lang)}`),
    actual: { found, unknown, missing },
  };
}

/** K83: on-screen copy says "demo session", never "visit"; "visitor" stays, and paths are not copy. */
export function visitWords(values) {
  const out = [];
  for (const v of values) {
    for (const m of String(v).replace(/\S*\/\S*/g, ' ').matchAll(/\bvisits?\b/gi)) out.push(m[0]);
  }
  return out;
}

/** K80: "pass mark" on screen; "floor" only quoted, as the word the build log uses. */
export function floorWords(values) {
  const out = [];
  for (const v of values) {
    for (const m of String(v).replace(/[“"]floors?[”"]/gi, ' ').matchAll(/\bfloors?\b/gi)) out.push(m[0]);
  }
  return out;
}

const SPEND_KEY = /spend|cost|budget|price|usd|dollar|billing/i;

/** K105: the paths of any spend-like field in a read (the readiness board has no spend row). */
export function spendKeys(obj, at = '') {
  const out = [];
  if (obj === null || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    const path = at ? `${at}.${k}` : k;
    if (SPEND_KEY.test(k)) out.push(path);
    out.push(...spendKeys(v, path));
  }
  return out;
}

/** K105: spend words or money on a screen. */
export function spendText(text) {
  return [...String(text).matchAll(/\bspend(?:ing)?\b|\bcosts?\b|\b(?:US|S)\$\s?\d+(?:[.,]\d+)*|\$\s?\d+(?:[.,]\d+)*/gi)].map((m) => m[0]);
}

function finite(id, name, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`[walk] ${id}: ${name} is not a number (${v})`);
  return v;
}

/**
 * K135, K102: a credit is the change in the credited Companion's growth read across the step,
 * made of exactly the expected events (a set of deltas: two credits may land in either order),
 * whose running totals chain from the first read, and the screen's number is their sum. Never a
 * constant: a later step starts from whatever the earlier ones left.
 */
export function creditCheck({ id, companionId, before, after, events, deltas, screen, source = 'stack' }) {
  if (before.companionId !== companionId || after.companionId !== companionId) {
    throw new Error(`[walk] ${id}: reads of two Companions (${before.companionId}, ${after.companionId}) cannot be compared`);
  }
  const from = finite(id, 'the first read', before.expCumulative);
  const to = finite(id, 'the second read', after.expCumulative);
  const fresh = events
    .filter((e) => e.companionId === companionId && finite(id, 'an event', e.expCumulativeAfter) > from && e.expCumulativeAfter <= to)
    .sort((a, b) => a.expCumulativeAfter - b.expCumulativeAfter);
  const want = deltas.reduce((s, d) => s + d, 0);
  let running = from;
  const chained = fresh.every((e) => {
    running += finite(id, 'an event delta', e.expDelta);
    return e.expCumulativeAfter === running;
  });
  const sorted = (xs) => [...xs].sort((a, b) => a - b).join(',');
  const sameSet = sorted(fresh.map((e) => e.expDelta)) === sorted(deltas);
  const ok = to - from === want && sameSet && chained && (screen === null || screen === want);
  return {
    id,
    rule: id,
    pass: verdict(ok, source),
    expected: { deltas, sum: want },
    actual: { delta: to - from, from, to, events: fresh.map((e) => `${e.source} +${e.expDelta} -> ${e.expCumulativeAfter}`), screen },
  };
}

/** W1, the invariant: with no stepper changed the released total is exactly the AI's own. */
export function releasedEqualsAi({ aiPoints, released, possible, source = 'stack' }) {
  const ai = finite('W1', 'the AI points', aiPoints);
  const got = finite('W1', 'the released points', released);
  const max = finite('W1', 'the points possible', possible);
  return { id: 'W1', rule: 'W1', pass: verdict(got === ai && got >= 0 && got <= max, source), expected: ai, actual: got };
}

const id = '[^/]+';
const MODEL_CALLS = [
  ['POST', new RegExp(`^/api/v1/me/concept-graph/suggestions/generate$`), 'sugg', 'suggestion batch'],
  ['POST', new RegExp(`^/api/v1/me/goals/${id}/campaign/questions/fresh$`), 'q', 'fresh practice set'],
  ['POST', new RegExp(`^/api/atoms/${id}/question-jobs/${id}/regenerate-image$`), 'picture', 'picture regenerate'],
  ['POST', new RegExp(`^/api/v1/me/assessments/${id}/submissions/${id}/request-grading$`), 'grade', 'grading crew'],
  ['POST', /^\/api\/v1\/kiosk\/readiness$/, 'check', 'opening check'],
];
const WRITES = [
  ['POST', /^\/api\/v1\/kiosk\/(session|visits|reset)$/, 'kiosk'],
  ['POST', new RegExp(`^/api/v1/me/concept-graph/suggestions/${id}/(accept|dismiss)$`), 'suggestion decision'],
  ['POST', new RegExp(`^/api/atoms/${id}/question-jobs/${id}/accept$`), 'question accept'],
  ['POST', new RegExp(`^/api/v1/me/goals/${id}/campaign/questions/answer$`), 'campaign answer'],
  ['POST', /^\/api\/v1\/assessments$/, 'assessment create'],
  ['POST', new RegExp(`^/api/v1/me/assessments/${id}/submissions$`), 'submission start'],
  ['PATCH', new RegExp(`^/api/v1/me/assessments/${id}/submissions/${id}$`), 'submission save'],
  ['POST', new RegExp(`^/api/v1/me/assessments/${id}/submissions/${id}/submit$`), 'submission submit'],
  ['POST', new RegExp(`^/api/atoms/${id}/session$`), 'atom attempt start'],
  ['POST', new RegExp(`^/api/atoms/${id}/session/submit$`), 'atom attempt submit'],
  ['PATCH', new RegExp(`^/api/v1/assessments/${id}/submissions/${id}/grades$`), 'grade edit'],
  ['POST', new RegExp(`^/api/v1/assessments/${id}/submissions/${id}/approve$`), 'grade approve'],
  ['POST', new RegExp(`^/api/v1/assessments/${id}/release-results$`), 'results release'],
];

/**
 * The LIVE tripwire: is this request a model call, and which LIVE kind? It judges the request,
 * not only the path: a greeting carrying a prepared turn id is a replay (K49), and an AI draft
 * is a model call where a hand edit's question job is not. A write it does not know is named
 * `unclassified`, so a new model call cannot pass unseen.
 */
export function classifyRequest({ method, url, body }, { preparedTurnIds }) {
  const path = new URL(url, 'http://walk.invalid').pathname;
  const m = method.toUpperCase();
  if (m === 'GET' || m === 'HEAD') {
    const serveDoor = new RegExp(`^/api/v1/me/goals/${id}/campaign/questions$`).test(path);
    return { kind: 'read', live: null, rule: serveDoor ? 'serve door' : 'read', serveDoor };
  }
  if (m === 'POST' && path === '/api/companion/greeting') {
    return preparedTurnIds.has(body?.turn_id)
      ? { kind: 'replay', live: null, rule: 'greeting replay', serveDoor: false }
      : { kind: 'model', live: 'greet', rule: 'greeting', serveDoor: false };
  }
  if (m === 'POST' && new RegExp(`^/api/atoms/${id}/question-jobs$`).test(path)) {
    return body?.type === 'ai_draft'
      ? { kind: 'model', live: 'words', rule: 'word revision', serveDoor: false }
      : { kind: 'write', live: null, rule: 'question job', serveDoor: false };
  }
  for (const [verb, re, live, rule] of MODEL_CALLS) {
    if (m === verb && re.test(path)) return { kind: 'model', live, rule, serveDoor: false };
  }
  for (const [verb, re, rule] of WRITES) {
    if (m === verb && re.test(path)) return { kind: 'write', live: null, rule, serveDoor: false };
  }
  return { kind: 'write', live: null, rule: 'unclassified', serveDoor: false };
}

/** The serve door must answer a ready set: a miss draws on the tap budget and may request generation. */
export function serveDoorReady(body) {
  return body !== null && typeof body === 'object' && body.status === 'ready';
}

/** K139: in step 1 exactly one idea glows, and it is the expected one. */
export function glowCheck({ glowIds, expectId }) {
  return { id: 'K139', rule: 'K139', pass: glowIds.length === 1 && glowIds[0] === expectId, expected: [expectId], actual: glowIds };
}

/**
 * K41: the English interface strings found verbatim in the Chinese interface's text (content,
 * marked lang="en", is left out by the caller). A value is judged by its fragments between
 * placeholders, each of at least two words; a one-word value is too short to judge by text. A key
 * the Chinese table (`zhTable`) keeps identical to English is approved English, never a leak.
 */
export function interfaceLeaks(text, enTable, zhTable = {}) {
  const out = [];
  for (const [key, value] of Object.entries(enTable)) {
    if (zhTable[key] === value) continue;
    const fragments = String(value)
      .split(/\{\{[^}]+\}\}/)
      .map((f) => f.replace(/\s+/g, ' ').trim())
      .filter((f) => f.length >= 8 && f.split(' ').filter((w) => /[A-Za-z]/.test(w)).length >= 2);
    if (fragments.some((f) => text.includes(f))) out.push(key);
  }
  return out;
}

/** K133: the screen shows the model's text exactly as the record holds it. */
export function aiTextExact({ shown, record }) {
  const ok = typeof shown === 'string' && typeof record === 'string' && record.length > 0 && shown.includes(record);
  return { id: 'K133', rule: 'K133', pass: ok, expected: record, actual: ok ? record : String(shown).slice(0, 300) };
}

/** Raw string keys on screen: only tokens that are real keys of the string table. */
export function rawKeys(text, keySet) {
  const tokens = String(text).match(/\b[a-zA-Z][a-zA-Z0-9_-]*(?:\.[a-zA-Z0-9_-]+)+\b/g) ?? [];
  return [...new Set(tokens.filter((t) => keySet.has(t)))];
}

/**
 * Python's round(x, 2) on the exact double: the nearest hundredth, a true tie to the even one. A
 * double lies exactly on a half-hundredth only when it is an odd number of eighths; otherwise
 * toFixed already rounds the exact binary value to the nearest.
 */
export function roundHalfEven2(x) {
  if (Number.isInteger(x * 8) && !Number.isInteger(x * 4)) {
    const lo = Math.floor(x * 100);
    return (lo % 2 === 0 ? lo : lo + 1) / 100;
  }
  return Number(x.toFixed(2));
}

/**
 * W1's rule, the grading crew's own scorer (orchestrator domain/oe_grading_crew/scoring.py,
 * compute_composite; delivery stores the result verbatim): points_possible x
 * sum(w_i / sum(w) x clamp01(score_i / max_i)), rounded to 2 places. A criterion with no score
 * counts 0, a maximum of 0 or less counts as 1; an empty rubric or a weight sum of 0 or less throws.
 */
export function compositePoints({ rubric, scores, possible }) {
  if (!Array.isArray(rubric) || rubric.length === 0) throw new Error('[walk] W1: the rubric has no criteria');
  const weightSum = rubric.reduce((s, c) => s + finite('W1', 'a weight', c.weight), 0);
  if (!(weightSum > 0)) throw new Error(`[walk] W1: the rubric weight sum is ${weightSum}, which cannot normalise`);
  const byId = new Map(scores.map((s) => [String(s.criterion_id), s]));
  let normalised = 0;
  for (const c of rubric) {
    const s = byId.get(String(c.criterion_id));
    let ratio = 0;
    if (s) {
      const max = finite('W1', 'a max_score', s.max_score) > 0 ? s.max_score : 1;
      ratio = Math.min(1, Math.max(0, finite('W1', 'a score', s.score) / max));
    }
    normalised += (c.weight / weightSum) * ratio;
  }
  return roundHalfEven2(normalised * finite('W1', 'the points possible', possible));
}

/** W1: the released total is exactly the rubric composite of the criterion scores the review left. */
export function releasedFollowsRubric({ id, rubric, scores, possible, released, source = 'stack' }) {
  const want = compositePoints({ rubric, scores, possible });
  const got = finite(id, 'the released points', released);
  return { id: `W1 ${id}`, rule: 'W1', pass: verdict(got === want, source), expected: want, actual: got };
}

const BARE_404 = /\[console\.error\] Failed to load resource: the server responded with a status of 404\b/;

/**
 * The errors a fixture world causes by lacking a route production has (`gaps`): the 404 naming the
 * route, kiosk-web's own error naming it, and as many bare "Failed to load resource" 404 console
 * lines (which name no route) as there were such 404s, by position. Everything else is `rest`.
 */
export function gapErrors(errors, gaps) {
  const named = errors.map((e) => gaps.some((re) => re.test(e)));
  let bare = errors.filter((e, i) => named[i] && e.includes('[http 404]')).length;
  const excused = [];
  const rest = [];
  errors.forEach((e, i) => {
    if (named[i]) excused.push(e);
    else if (bare > 0 && BARE_404.test(e)) {
      excused.push(e);
      bare -= 1;
    } else rest.push(e);
  });
  return { excused, rest };
}

/**
 * K80's numbers at their source: the instruction-following pass mark of one eval policy
 * (min_scores.instruction_following, read from the uncommented line). None, or two, throws: the
 * walk must not judge the screen against a number it guessed.
 */
export function passMark(policyText, name) {
  const found = [...String(policyText).matchAll(/^[ \t]*instruction_following:[ \t]*([0-9]+(?:\.[0-9]+)?)/gm)].map((m) => Number(m[1]));
  if (found.length !== 1) throw new Error(`[walk] K80: ${name} has ${found.length} live instruction_following lines, not one`);
  return found[0];
}

const PASS_MARK_TERM = { en: 'pass mark', zh: '合格线' };

/**
 * K80: the AI judge's pass marks in plain words: the term "pass mark" (合格线 in Chinese), each
 * mark written to one place as a whole number (3.5, 3.0), and "floor" only quoted as the log's word.
 */
export function passMarkCheck({ text, lang, marks }) {
  const term = PASS_MARK_TERM[lang];
  if (!term) throw new Error(`[walk] K80: unknown language ${lang}`);
  const s = String(text);
  const want = marks.map((m) => finite('K80', 'a pass mark', m).toFixed(1));
  const missingMarks = want.filter((m) => !new RegExp(`(?<![0-9.])${m.replace('.', '\\.')}(?![0-9])`).test(s));
  const floor = floorWords([s]);
  const hasTerm = s.includes(term);
  return {
    id: `K80 the AI judge says "${term}"`,
    rule: 'K80',
    pass: hasTerm && missingMarks.length === 0 && floor.length === 0,
    expected: { term, marks: want, floor: 'only quoted' },
    actual: { term: hasTerm, missingMarks, floor },
  };
}

/** K81: no LIVE control on "Agent crews at work"; `onPage` is the proof the page drew at all. */
export function noLiveCheck({ onPage, live }) {
  return { id: 'K81 no LIVE run on Agent crews at work', rule: 'K81', pass: onPage === true && live.length === 0, expected: { onPage: true, live: [] }, actual: { onPage, live } };
}

/** K82: the decision log row's line says it is a snapshot of a past log, with the prepared stamps' clock mark. */
export function snapshotNoteCheck({ text, expect, clock }) {
  if (!expect) throw new Error('[walk] K82: no expected line');
  const shown = typeof text === 'string' ? text.trim() : null;
  return { id: 'K82 the decision log says it is a snapshot of a past log', rule: 'K82', pass: shown === expect && clock === true, expected: { text: expect, clock: true }, actual: { text: shown, clock } };
}

/**
 * Step 3's "Behind the scenes" (K75): the panel opened on the question's own kind, read that run's
 * xray, and drew its stages (the writer and the critic at least) without a load failure.
 */
export function xrayPanelCheck({ open, title, expectTitle, rows, failed, reads, path, source = 'stack' }) {
  const read = reads.includes(path);
  const ok = open === true && title === expectTitle && rows >= 2 && failed === false && read;
  return {
    id: "step 3's Behind the scenes shows the question's own run",
    rule: 'K75',
    pass: verdict(ok, source),
    expected: { open: true, title: expectTitle, rows: '2 or more', read: path },
    actual: { open, title, rows, failed, read },
  };
}

const spaced = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * K145: the option to press, found on screen by its text. `pick` is a stored position in the
 * question's pinned options (the record's order: delivery's payload_snapshot, creation's MCQOption,
 * whose `label` is the text) or 'key' (the one option the record marks correct). The screen may
 * show them in any order (production's per-learner shuffle) but must show exactly the stored set.
 */
export function pickOption({ id, options, shown, pick }) {
  if (!Array.isArray(options) || options.length === 0) throw new Error(`[walk] ${id}: the record has no options`);
  const texts = options.map((o) => spaced(o.text ?? o.label));
  const onScreen = shown.map(spaced);
  if ([...texts].sort().join('\n') !== [...onScreen].sort().join('\n')) {
    throw new Error(`[walk] ${id}: the screen shows ${JSON.stringify(onScreen)}, not the record's options ${JSON.stringify(texts)}`);
  }
  let at;
  if (pick === 'key') {
    const keys = options.flatMap((o, i) => (o.is_correct === true ? [i] : []));
    if (keys.length !== 1) throw new Error(`[walk] ${id}: the record marks ${keys.length} options correct, not one`);
    at = keys[0];
  } else if (Number.isInteger(pick) && pick >= 0 && pick < options.length) {
    at = pick;
  } else {
    throw new Error(`[walk] ${id}: pick ${JSON.stringify(pick)} is neither 'key' nor a stored position of ${options.length}`);
  }
  const hits = onScreen.flatMap((t, i) => (t === texts[at] ? [i] : []));
  if (hits.length !== 1) throw new Error(`[walk] ${id}: the option "${texts[at]}" shows ${hits.length} times`);
  return { index: hits[0], optionId: options[at].option_id, text: texts[at], correct: options[at].is_correct === true };
}

/** An option's display text as the serve door keys it and kiosk-web shows it: text, else label. */
function displayText(o) {
  return spaced(String(o?.text ?? '').trim() || String(o?.label ?? '').trim());
}

/**
 * K149: the answer key of a stored campaign set (consumption's campaign_question_sets.questions_payload,
 * the BatchCandidatePayload the qgen crew landed: a {candidates} object, a bare array or one candidate;
 * options flat or under mcq_payload, as campaignquestion/grade.go decodes them). Returns each
 * multiple-choice candidate's stem and the display text of its one correct option.
 */
export function keysFromPayload(payloadText, id) {
  let doc;
  try {
    doc = JSON.parse(payloadText);
  } catch {
    throw new Error(`[walk] ${id}: the stored payload is not JSON`);
  }
  const out = [];
  for (const [i, { stem, options }] of candidatesOf(doc).entries()) {
    if (options.length === 0) continue;
    if (!stem) throw new Error(`[walk] ${id}: candidate ${i} has no stem`);
    if (options.some((o) => !displayText(o))) throw new Error(`[walk] ${id}: candidate ${i} has an option with no display text`);
    const keys = options.filter((o) => o?.is_correct === true);
    if (keys.length !== 1) throw new Error(`[walk] ${id}: candidate ${i} has ${keys.length} correct options, not one`);
    out.push({ stem, key: displayText(keys[0]) });
  }
  if (out.length === 0) throw new Error(`[walk] ${id}: the stored payload holds no multiple-choice candidate`);
  return out;
}

/** K149: keys kept as {stem, options (texts), correct (index)}: world.json's atoms[].mcq, the fixture world's practice questions. */
export function keysFromIndexed(questions, id) {
  return questions.map((q, i) => {
    const stem = spaced(q?.stem);
    if (!stem) throw new Error(`[walk] ${id}: question ${i} has no stem`);
    const texts = (q?.options ?? []).map(spaced);
    if (new Set(texts).size !== texts.length) throw new Error(`[walk] ${id}: question ${i} shows an option twice`);
    if (!Number.isInteger(q?.correct) || q.correct < 0 || q.correct >= texts.length) throw new Error(`[walk] ${id}: question ${i} has no correct option at ${JSON.stringify(q?.correct)}`);
    return { stem, key: texts[q.correct] };
  });
}

/** K149: the key of the question whose stem the screen shows; exactly one record must match. */
export function keyForStem(keys, stem, id) {
  const hits = keys.filter((k) => k.stem === spaced(stem));
  if (hits.length === 0) throw new Error(`[walk] ${id}: the stem on screen "${spaced(stem).slice(0, 80)}" is none of the record's questions`);
  if (hits.length > 1) throw new Error(`[walk] ${id}: the stem on screen matches ${hits.length} records`);
  return hits[0].key;
}

/** K149: the screen position of the option whose text is `want`, whatever order the options show in. */
export function pickText({ id, shown, want }) {
  if (!Array.isArray(shown) || shown.length === 0) throw new Error(`[walk] ${id}: the screen shows no options`);
  const hits = shown.map(spaced).flatMap((t, i) => (t === spaced(want) ? [i] : []));
  if (hits.length !== 1) throw new Error(`[walk] ${id}: the key "${spaced(want)}" shows ${hits.length} times among ${JSON.stringify(shown.map(spaced))}`);
  return hits[0];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The read-only psql invocation inside the kiosk's Postgres container (oracleCommand, censusCommand). */
function psqlArgs(container, db, vars) {
  if (typeof container !== 'string' || !container) throw new Error('[walk] the oracle needs the Postgres container');
  return ['exec', '-i', '-e', 'PGOPTIONS=-c default_transaction_read_only=on', container, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...vars.flatMap((v) => ['-v', v]), '-U', 'migrate', '-d', db, '-f', '-'];
}

/**
 * K149's test-only oracle on the stack: one read-only SELECT of the set's stored payload, run with
 * docker exec inside the kiosk's Postgres container as the migrate login over the socket (trust in
 * the container, compose.yaml; no password anywhere), the session read-only by PGOPTIONS. The ids go
 * in as psql variables, quoted by psql, and are refused unless they are a UUID and a rung.
 */
export function oracleCommand({ container, conceptId, rung }) {
  if (typeof conceptId !== 'string' || !UUID.test(conceptId)) throw new Error(`[walk] the oracle's concept ${JSON.stringify(conceptId)} is not a UUID`);
  if (!Number.isInteger(rung) || rung < 1 || rung > 6) throw new Error(`[walk] the oracle's rung ${JSON.stringify(rung)} is not 1 to 6`);
  return {
    args: psqlArgs(container, 'chora_consumption', [`cid=${conceptId}`, `rung=${rung}`]),
    sql: "SELECT questions_payload::text FROM campaign_question_sets WHERE concept_id = :'cid'::uuid AND rung = :'rung'::smallint AND generation_status = 'ready' AND deleted_at IS NULL;\n",
  };
}

// ----- Section S: the reset loop for every new visitor (WALK-PLAYBOOK S; K151, K143, K149) -----

/**
 * K151: readiness's `session_started_since_reset` (conductor API.md section 3, a plain boolean) says
 * what the loop expects: false after a reset that finished done, true once a demo session started.
 * A missing or non-boolean field fails: a conductor without it cannot drive the prompt.
 */
export function sinceResetCheck({ id, readiness, expect }) {
  if (typeof expect !== 'boolean') throw new Error(`[walk] ${id}: expect must be a boolean`);
  const v = readiness?.session_started_since_reset;
  return { id, rule: 'K151', pass: typeof v === 'boolean' && v === expect, expected: { session_started_since_reset: expect }, actual: { session_started_since_reset: v === undefined ? 'absent' : v } };
}

/**
 * After a reset: readiness ready, the snapshot's marker matching, and the last reset done and
 * finished after `pressedAt` (ms; 2 s slack for the stamp's precision): an older reset proves
 * nothing about this one. On fixtures the time is fixture data, so ready and done is 'fixture'.
 */
export function resetReadback({ id, readiness, pressedAt, source = 'stack' }) {
  if (!Number.isFinite(pressedAt)) throw new Error(`[walk] ${id}: pressedAt must be a time in ms`);
  const snap = readiness?.snapshot;
  const last = readiness?.last_reset;
  const fresh = typeof last?.finished_at === 'string' && Date.parse(last.finished_at) >= pressedAt - 2000;
  const ok = readiness?.overall === 'ready' && snap?.marker === 'match' && last?.outcome === 'done';
  return {
    id,
    rule: 'T4.1 c',
    pass: source === 'stack' ? ok && fresh : ok ? verdict(true, source) : false,
    expected: { overall: 'ready', marker: 'match', last_reset: 'done', finished: `after ${new Date(pressedAt).toISOString()}` },
    actual: { overall: readiness?.overall, marker: snap?.marker, last_reset: last?.outcome, finished_at: last?.finished_at },
  };
}

/** K151: a reload or Continue runs no reset: the last reset reads exactly as it did before. */
export function lastResetSame({ id, before, readiness }) {
  if (typeof before?.finished_at !== 'string' || typeof before?.outcome !== 'string') throw new Error(`[walk] ${id}: no earlier last_reset (before) to compare with`);
  const now = readiness?.last_reset;
  return { id, rule: 'K151', pass: now?.finished_at === before.finished_at && now?.outcome === before.outcome, expected: { outcome: before.outcome, finished_at: before.finished_at }, actual: now ?? null };
}

/**
 * The start state every visitor gets (K101, the owner's 19 Oct rule): each Companion's EXP, the
 * mana, the streak and the six story ideas, value for value equal to the walk's start, the ideas
 * pending. The streak is not compared across 00:00 UTC (the restored streak counts one more day).
 */
export function loopStateCheck({ id, start, now }) {
  const names = Object.keys(start?.exp ?? {});
  if (names.length === 0) throw new Error(`[walk] ${id}: the start state holds no Companion`);
  const ideaIds = Object.keys(start?.ideas ?? {});
  if (ideaIds.length === 0) throw new Error(`[walk] ${id}: the start state holds no ideas`);
  const diffs = [];
  for (const n of new Set([...names, ...Object.keys(now?.exp ?? {})])) {
    if (start.exp[n] !== now?.exp?.[n]) diffs.push(`${n} EXP ${start.exp[n]} -> ${now?.exp?.[n]}`);
  }
  if (start.mana !== now?.mana) diffs.push(`mana ${start.mana} -> ${now?.mana}`);
  const sameDay = start.utcDay === now?.utcDay;
  if (sameDay && start.streak !== now?.streak) diffs.push(`streak ${start.streak} -> ${now?.streak}`);
  for (const i of new Set([...ideaIds, ...Object.keys(now?.ideas ?? {})])) {
    if (start.ideas[i] !== 'pending') diffs.push(`idea ${i} was ${start.ideas[i]} at the start, not pending`);
    if (now?.ideas?.[i] !== 'pending') diffs.push(`idea ${i} reads ${now?.ideas?.[i] ?? 'absent'}, not pending`);
  }
  return { id, rule: 'T4.1 c', pass: diffs.length === 0, expected: start, actual: { now, diffs }, ...(sameDay ? {} : { note: 'the walk crossed 00:00 UTC, so the streak is not compared' }) };
}

/**
 * K139: step 1 fans the batch's face-down ideas around Desalination, each once. With `shows` (W48,
 * K174) only the first `shows` ideas in the batch's own order show: the lens fills the slots whose
 * ghost clears every idea in its input order, and the story passes the batch's suggestion_ids.
 */
export function ghostCheck({ shownIds, expectIds, shows }) {
  if (!Array.isArray(expectIds) || expectIds.length === 0) throw new Error('[walk] ghostCheck: the batch has no ideas');
  if (shows !== undefined && !(Number.isInteger(shows) && shows >= 1 && shows <= expectIds.length)) {
    throw new Error(`[walk] ghostCheck: shows ${shows} is not a count from 1 to the batch's ${expectIds.length}`);
  }
  const want = (shows === undefined ? [...expectIds] : expectIds.slice(0, shows)).sort();
  const got = [...shownIds].sort();
  return { id: 'K139 the face-down ideas', rule: 'K139', pass: got.length === want.length && got.every((g, i) => g === want[i]), expected: want, actual: got };
}

/** The candidates of a BatchCandidatePayload, with their options flat or under mcq_payload (grade.go). */
function candidatesOf(doc) {
  const candidates = Array.isArray(doc) ? doc : Array.isArray(doc?.candidates) ? doc.candidates : [doc];
  return candidates.map((c) => ({ stem: spaced(c?.stem), options: Array.isArray(c?.options) && c.options.length > 0 ? c.options : (c?.mcq_payload?.options ?? []) }));
}

/** K149: the option texts of the served question showing `stem`, in the serve door's own order. */
export function servedOrder({ body, stem, id }) {
  if (!serveDoorReady(body)) throw new Error(`[walk] ${id}: the serve door's answer is not a ready set`);
  const doc = typeof body.questions === 'string' ? JSON.parse(body.questions) : body.questions;
  const hits = candidatesOf(doc).filter((c) => c.stem === spaced(stem) && c.options.length > 0);
  if (hits.length !== 1) throw new Error(`[walk] ${id}: the stem "${spaced(stem).slice(0, 80)}" is none of the served questions (${hits.length} matches)`);
  return hits[0].options.map(displayText);
}

const factorial = (n) => (n <= 1 ? 1 : n * factorial(n - 1));

/**
 * K149: each demo session draws its own option order. `served` is the serve door's order, `visits`
 * the order each visit showed (two or more). Every visit showing the served order is no shuffle at
 * all (by chance 1 in n!^k); two visits differing is a fresh draw. All visits showing one drawn order
 * is 1 in n! by chance, or an order the session's end kept: one sample cannot tell them apart, so it
 * is said ('not-judged'), never passed.
 */
export function visitOrderCheck({ id, served, visits, source = 'stack' }) {
  if (!Array.isArray(served) || served.length < 2) throw new Error(`[walk] ${id}: the served question needs two options or more`);
  if (!Array.isArray(visits) || visits.length < 2) throw new Error(`[walk] ${id}: the order needs two visits to compare`);
  const set = [...served].map(spaced).sort().join('\n');
  const joined = visits.map((v) => v.map(spaced).join('\n'));
  const base = { id, rule: 'K149', expected: 'a fresh order each visit, never the served order every time', actual: { served, visits } };
  if (visits.some((v) => [...v].map(spaced).sort().join('\n') !== set)) return { ...base, pass: false, note: 'a visit showed another option set' };
  if (joined.every((j) => j === served.map(spaced).join('\n'))) return { ...base, pass: false, note: 'every visit showed the served order: no shuffle' };
  if (new Set(joined).size > 1) return { ...base, pass: verdict(true, source) };
  return { ...base, pass: 'not-judged', note: `every visit showed the same drawn order: 1 in ${factorial(served.length) ** (visits.length - 1)} by chance, or an order the session's end kept` };
}

const CENSUS = {
  'fresh sets': { db: 'chora_consumption', table: 'campaign_fresh_question_sets' },
  'question jobs': { db: 'chora_creation', table: 'question_generation_jobs' },
};
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * The playbook's S5 read-back "no LIVE question set and no question job made since the reset": one
 * read-only count of the rows created after `since`, by the oracle's route (oracleCommand). Only the
 * two tables named; `since` must be an RFC 3339 time and goes in as a psql variable.
 */
export function censusCommand({ container, what, since }) {
  const c = CENSUS[what];
  if (!c) throw new Error(`[walk] no census of ${JSON.stringify(what)}`);
  if (typeof since !== 'string' || !RFC3339.test(since) || !Number.isFinite(Date.parse(since))) throw new Error(`[walk] the census's since ${JSON.stringify(since)} is not an RFC 3339 time`);
  return { args: psqlArgs(container, c.db, [`since=${since}`]), sql: `SELECT count(*) FROM ${c.table} WHERE created_at > :'since'::timestamptz;\n` };
}

/** psql's tuples-only answer to a count: exactly one non-negative integer, else the census failed. */
export function censusCount(text, id) {
  const t = String(text ?? '').trim();
  if (!/^\d+$/.test(t)) throw new Error(`[walk] ${id}: the census answered ${JSON.stringify(text)}, not one count`);
  return Number(t);
}

const IDLE_WAITS = ['2', '5', '8', '15'];

/**
 * K143: the presenter's Run tab offers the idle waits 2, 5, 8 and 15 minutes, and exactly the one
 * chosen reads aria-pressed="true" (the others "false"). `buttons` are the [data-act=idleMinutes]
 * controls' data-min and aria-pressed, as the page has them.
 */
export function idleSettingCheck({ buttons, minutes }) {
  if (!IDLE_WAITS.includes(String(minutes))) throw new Error(`[walk] an idle wait of ${minutes} minutes is not offered`);
  const offered = buttons.map((b) => String(b.min)).sort((a, b) => Number(a) - Number(b));
  const pressed = buttons.filter((b) => b.pressed === 'true').map((b) => String(b.min));
  const ok = offered.join(',') === IDLE_WAITS.join(',') && pressed.length === 1 && pressed[0] === String(minutes) && buttons.every((b) => b.pressed === 'true' || b.pressed === 'false');
  return { id: `K143 the idle wait reads ${minutes} minutes`, rule: 'K143', pass: ok, expected: { offered: IDLE_WAITS, pressed: [String(minutes)] }, actual: { offered, pressed } };
}

/**
 * K135, K102: the EXP a screen says a Companion earned. kiosk-web writes a credit as "+N EXP ..." or
 * "earns N EXP" in English and "获得 N 点经验值" in Chinese (no plus sign); "a / b EXP" is the progress
 * bar and "+N XP" the dose's offer, neither a credit.
 */
export function creditNumbers(text) {
  return [...String(text ?? '').matchAll(/(?<!\/\s*)(?<![\d.])(\d+)\s*(?:EXP\b|点经验值)/g)].map((m) => Number(m[1]));
}

/** K101: the window of the assessment a take created (delivery's scheduled_open_at and scheduled_close_at). */
export function windowTimes(body) {
  const a = body?.data ?? body;
  const from = a?.scheduled_open_at;
  const to = a?.scheduled_close_at;
  if (typeof from !== 'string' || !from || typeof to !== 'string' || !to) throw new Error(`[walk] the created assessment carries no window: ${JSON.stringify(body)?.slice(0, 200)}`);
  return [from, to];
}

/**
 * K173, the beat table as ruled 21 Oct (WALK-PLAYBOOK section T): the walk's own copy, never read from
 * kiosk-web's tour (a check that reads its expectation from the code it checks cannot fail).
 */
const TOUR = [
  // K219, W95 (the owner's three screens): the maps stop is five beats: "Design your own goals" in three screens,
  // the atlas, Singapore's water.
  { exhibit: 'maps', titleKey: 'ex.maps.title', beats: ['M1', 'M2', 'M3', 'M4', 'M5'] },
  { exhibit: 'comp', titleKey: 'ex.comp.title', beats: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'] },
  { exhibit: 'dash', titleKey: 'ex.dash.title', beats: ['D1', 'D2'] },
  { exhibit: 'grade', titleKey: 'ex.grade.title', beats: ['G1', 'G2', 'G3'] },
  { exhibit: 'engine', titleKey: 'ex.engine.title', beats: ['E1', 'E2', 'E3', 'E4', 'E5'] },
];

/** K173: each beat in order with the marker the footer must show on it ("{exhibit}, n of m"), from `t`. */
export function tourMarkers(t) {
  const say = (key, p) => {
    const v = t(key, p);
    if (typeof v !== 'string') throw new Error(`[walk] tourMarkers: no string ${key}`);
    return v;
  };
  return TOUR.flatMap((s) => s.beats.map((id, i) => ({ id, exhibit: s.exhibit, marker: say('tour.marker', { x: say(s.titleKey), n: i + 1, m: s.beats.length }) })));
}

/**
 * K173 (the owner: "click at the same spot to move forward"): Next's box, in page pixels with the
 * pointer away, is the same on the hall (the first box) and on every beat.
 */
export function nextBoxCheck({ boxes }) {
  if (!Array.isArray(boxes) || boxes.length < 2) throw new Error('[walk] nextBoxCheck: nothing to compare, the hall and at least one beat are needed');
  const [first, ...rest] = boxes;
  const same = (b) => b.x === first.x && b.y === first.y && b.w === first.w && b.h === first.h;
  const moved = rest.filter((b) => !same(b));
  return { id: 'K173 Next keeps its place on every beat', rule: 'K173', pass: moved.length === 0, expected: { ...first, on: boxes.length }, actual: { moved } };
}

/** K189 (1) and (2): step 2's list holds the batch's ideas only (no link row), each with its own Add. */
export function eachAddCheck({ rows, adds, ideas }) {
  return { id: 'K189 step 2 lists ideas only, each with its own Add', rule: 'K189', pass: ideas > 0 && rows === ideas && adds === ideas, expected: { rows: ideas, adds: ideas }, actual: { rows, adds } };
}

/** K189 (3): a LIVE button with nothing to act on yet is greyed; buttons maps a name to disabled (null: absent). */
export function greyedCheck({ id, buttons }) {
  const names = Object.keys(buttons ?? {});
  if (names.length === 0) throw new Error(`[walk] ${id}: no button to judge`);
  const notGreyed = names.filter((n) => buttons[n] !== true).map((n) => `${n}: ${buttons[n] === null ? 'absent' : 'enabled'}`);
  return { id, rule: 'K189', pass: notGreyed.length === 0, expected: Object.fromEntries(names.map((n) => [n, 'greyed'])), actual: { notGreyed } };
}

/** Every shown item is one of the allowed (K186's LIVE labels, K189 (2)'s row kinds), and something is shown. */
export function onlyFromCheck({ id, rule, shown, allowed }) {
  if (!Array.isArray(allowed) || allowed.length === 0) throw new Error(`[walk] ${id}: nothing is allowed`);
  const other = (shown ?? []).filter((s) => !allowed.includes(s));
  return { id, rule, pass: (shown ?? []).length > 0 && other.length === 0, expected: allowed, actual: { shown, other } };
}

/** The shown line is the string with a non-empty fill in its one slot (the slot written as U+0000). */
export function fillCheck({ id, rule, shown, template }) {
  const parts = template.split('\u0000');
  if (parts.length !== 2) throw new Error(`[walk] ${id}: the string needs exactly one slot`);
  const [head, tail] = parts;
  const ok = typeof shown === 'string' && shown.length > head.length + tail.length && shown.startsWith(head) && shown.endsWith(tail);
  const fill = ok ? shown.slice(head.length, shown.length - tail.length) : null;
  return { id, rule, pass: ok && fill.trim() === fill && !/\n/.test(fill), expected: template.replace('\u0000', '{name}'), actual: shown };
}

/** K188: every map is a pure tree: one root, one parent per idea, six children at most, no lateral link. */
export function treeCheck({ id, graph }) {
  const concepts = graph?.concepts ?? [];
  if (concepts.length === 0) throw new Error(`[walk] ${id}: the map has no concept`);
  const title = new Map(concepts.map((c) => [c.conceptId, c.title]));
  const edges = graph.edges ?? [];
  const lateral = edges.filter((e) => e.class !== 'hierarchy').map((e) => `${title.get(e.sourceConceptId)} - ${title.get(e.targetConceptId)}`);
  const parents = new Map(concepts.map((c) => [c.conceptId, 0]));
  const children = new Map(concepts.map((c) => [c.conceptId, 0]));
  for (const e of edges.filter((x) => x.class === 'hierarchy')) {
    parents.set(e.targetConceptId, (parents.get(e.targetConceptId) ?? 0) + 1);
    children.set(e.sourceConceptId, (children.get(e.sourceConceptId) ?? 0) + 1);
  }
  const roots = concepts.filter((c) => parents.get(c.conceptId) === 0).map((c) => c.title);
  const manyParents = concepts.filter((c) => parents.get(c.conceptId) > 1).map((c) => c.title);
  const overSix = concepts.filter((c) => children.get(c.conceptId) > 6).map((c) => c.title);
  return { id, rule: 'K188', pass: lateral.length === 0 && roots.length === 1 && manyParents.length === 0 && overSix.length === 0, expected: { roots: 1, lateral: [], manyParents: [], overSix: [] }, actual: { roots, lateral, manyParents, overSix } };
}

/** The idea titled parent holds exactly the named children, by its parent-child links (K196's hawker tree). */
export function childrenCheck({ id, rule, graph, parent, children }) {
  const concepts = graph?.concepts ?? [];
  const p = concepts.find((c) => c.title === parent);
  const title = new Map(concepts.map((c) => [c.conceptId, c.title]));
  const held = p ? (graph.edges ?? []).filter((e) => e.class === 'hierarchy' && e.sourceConceptId === p.conceptId).map((e) => title.get(e.targetConceptId)) : null;
  const sorted = (xs) => [...xs].sort();
  return { id, rule, pass: held !== null && JSON.stringify(sorted(held)) === JSON.stringify(sorted(children)), expected: { [parent]: sorted(children) }, actual: { [parent]: held === null ? 'not on the map' : sorted(held) } };
}

/** W55: Next on E5 opens the tour's end dialog over it, its title as written, the focus on Done. */
export function tourEndCheck({ shown, title, focused, expectTitle }) {
  return { id: 'W55 Next on E5 opens the end of the tour, the focus on Done', rule: 'W55', pass: shown === true && title === expectTitle && focused === 'tourEndDone', expected: { shown: true, title: expectTitle, focused: 'tourEndDone' }, actual: { shown, title, focused } };
}

/** The shown items are exactly the expected ones, each once, in any order (K187's three chips). */
export function exactSetCheck({ id, rule, shown, expected }) {
  if (!Array.isArray(expected) || expected.length === 0) throw new Error(`[walk] ${id}: nothing is expected`);
  const got = shown ?? [];
  const sorted = (xs) => [...xs].sort();
  const pass = got.length === expected.length && new Set(got).size === got.length && JSON.stringify(sorted(got)) === JSON.stringify(sorted(expected));
  return { id, rule, pass, expected: sorted(expected), actual: { shown: got, other: got.filter((s) => !expected.includes(s)), missing: expected.filter((s) => !got.includes(s)) } };
}

/** W77: no page read names a retired embedding model, and readiness names a current one (texts maps a page to its text). */
export function retiredModelCheck({ id, rule, texts, current, retired }) {
  const pages = Object.keys(texts ?? {});
  if (pages.length === 0) throw new Error(`[walk] ${id}: no page was read`);
  const named = Object.fromEntries(pages.map((p) => [p, retired.filter((r) => texts[p].includes(r))]).filter(([, rs]) => rs.length > 0));
  const currentOk = typeof current === 'string' && current !== '' && !retired.includes(current);
  return { id, rule, pass: currentOk && Object.keys(named).length === 0, expected: { current: 'a model that is not retired', retiredNamed: {} }, actual: { current, retiredNamed: named } };
}

/** K196: every idea's box lies inside the lens frame (half a pixel of rounding allowed), and some idea is drawn. */
export function insideFrameCheck({ id, rule, frame, nodes }) {
  const tol = 0.5;
  const inside = (n) => n.x >= frame.x - tol && n.y >= frame.y - tol && n.x + n.w <= frame.x + frame.w + tol && n.y + n.h <= frame.y + frame.h + tol;
  const outside = (nodes ?? []).filter((n) => !inside(n)).map((n) => n.title);
  return { id, rule, pass: (nodes ?? []).length > 0 && outside.length === 0, expected: { outside: [] }, actual: { nodes: (nodes ?? []).length, outside } };
}

/** K202: every link of the map is drawn (a too-short one is not drawn at all), each at least minPx on screen. */
export function linkLengthCheck({ id, rule, lengths, edgeCount, minPx }) {
  const tol = 0.5;
  const short = (lengths ?? []).filter((l) => !(l >= minPx - tol));
  const drawnAll = (lengths ?? []).length === edgeCount;
  return { id, rule, pass: edgeCount > 0 && drawnAll && short.length === 0, expected: { drawn: edgeCount, minPx }, actual: { drawn: (lengths ?? []).length, edgeCount, short } };
}

/** K204: no node's box overlaps the caption card's (touching, or half a pixel of rounding, is clear). */
export function clearOfCheck({ id, rule, nodes, card }) {
  const tol = 0.5;
  const overlaps = (n) => card && n.x < card.x + card.w - tol && n.x + n.w > card.x + tol && n.y < card.y + card.h - tol && n.y + n.h > card.y + tol;
  const under = (nodes ?? []).filter(overlaps).map((n) => n.title);
  return { id, rule, pass: !!card && (nodes ?? []).length > 0 && under.length === 0, expected: { under: [] }, actual: { card: card ?? null, nodes: (nodes ?? []).length, under } };
}

/** K204 (K214's zh): the clicked lens tab is the active one, its caption the ruled copy (whitespace aside), its bold lead the tab's word. */
export function captionCheck({ id, rule, paint, active, lead, text, want }) {
  const norm = (t) => (typeof t === 'string' ? t.replace(/\s+/g, ' ').trim() : null);
  const pass = active === paint && norm(lead) === want.lead && norm(text) === norm(want.text);
  return { id, rule, pass, expected: { active: paint, lead: want.lead, text: want.text }, actual: { active, lead: norm(lead), text: norm(text) } };
}

/** K209: no visitor-facing "laptop": the word in any case or plural on any screen, and in Chinese 笔记本电脑 or 笔记本. */
export function noLaptopCheck({ id, screen, lang, text }) {
  const t = typeof text === 'string' ? text : '';
  const patterns = [/\blaptops?\b/gi, ...(lang === 'zh' ? [/笔记本(电脑)?/g] : [])];
  const hits = [];
  for (const re of patterns) {
    for (const m of t.matchAll(re)) hits.push(t.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30));
  }
  return { id, rule: 'K209', pass: t.trim().length > 0 && hits.length === 0, expected: { hits: [] }, actual: { screen, lang, chars: t.length, hits } };
}

/** K208: every line of text in the diagram lies inside its own box (half a pixel of rounding allowed). */
export function linesInBoxesCheck({ id, boxes }) {
  const tol = 0.5;
  const inside = (l, b) => l.x >= b.x - tol && l.y >= b.y - tol && l.x + l.w <= b.x + b.w + tol && l.y + l.h <= b.y + b.h + tol;
  const outside = [];
  const empty = [];
  for (const b of boxes ?? []) {
    if (!(b.lines ?? []).length) empty.push(b.name);
    for (const l of b.lines ?? []) if (!inside(l, b.box)) outside.push({ box: b.name, text: l.text });
  }
  const pass = (boxes ?? []).length > 0 && empty.length === 0 && outside.length === 0;
  return { id, rule: 'K208', pass, expected: { outside: [], empty: [] }, actual: { boxes: (boxes ?? []).length, outside, empty } };
}

/** W73, K189 (2): the press's ideas head the one list, each tagged LIVE, and no other row is (rows in screen order). */
export function freshOnTopCheck({ id, rule, rows, fresh }) {
  const want = new Set(fresh ?? []);
  const top = (rows ?? []).slice(0, want.size);
  const headOk = want.size > 0 && top.length === want.size && top.every((r) => want.has(r.id) && r.live === true);
  const taggedElsewhere = (rows ?? []).slice(want.size).filter((r) => r.live === true).map((r) => r.id);
  return { id, rule, pass: headOk && taggedElsewhere.length === 0, expected: { top: [...want], live: 'on those rows only' }, actual: { rows, taggedElsewhere } };
}

/** A LIVE key's subject, as LiveService keys it: its kind and its last part (`sugg:water:c1` is `sugg:c1`). */
const subjectOf = (key) => `${key.slice(0, key.indexOf(':'))}:${key.slice(key.lastIndexOf(':') + 1)}`;

/** K186: the spent subject's row is on screen, and no LIVE button on screen is for that subject. */
export function spentCheck({ id, key, rowKeys, buttonKeys }) {
  const subject = subjectOf(key);
  const rowShown = (rowKeys ?? []).some((k) => subjectOf(k) === subject);
  const left = (buttonKeys ?? []).filter((k) => subjectOf(k) === subject);
  return { id, rule: 'K186', pass: rowShown && left.length === 0, expected: { row: subject, buttons: [] }, actual: { rowShown, buttons: left } };
}

/** W74: a missed call shows its line (failed, or late with its seconds), and right after it the fallback's own prepared stamp. */
export function missedStampCheck({ id, rule, stamps, failed, lateTemplate, prepared }) {
  const [head, tail] = lateTemplate.split('\u0000');
  const late = (s) => s.startsWith(head) && s.endsWith(tail) && /^\d+$/.test(s.slice(head.length, s.length - tail.length));
  const at = (stamps ?? []).findIndex((s) => s === failed || late(s));
  return { id, rule, pass: at >= 0 && stamps[at + 1] === prepared, expected: { line: failed, then: prepared }, actual: { stamps } };
}

/** K190: once the idea holds six, every row left is greyed (no room, or on the map), at least one for want of room, none with an Add, and no Add all. */
export function fullListCheck({ id, rule, rows, fullText, dupText, addAll }) {
  const list = rows ?? [];
  const bad = list.filter((r) => r.adds !== 0 || (r.state !== fullText && r.state !== dupText));
  const anyFull = list.some((r) => r.state === fullText);
  return { id, rule, pass: list.length > 0 && anyFull && bad.length === 0 && addAll === false, expected: { rows: fullText, adds: 0, addAll: false }, actual: { rows: list, addAll } };
}

/**
 * K201: the credits page as ruled, top to bottom: the programme line; the team's label over its three
 * names in K185's order; the Programme Chief over the Academic Supervisor, each its label and name; the
 * contact's label over the owner's email; the close hint; and no asterisk anywhere (the footnote is gone).
 */
export function creditsCheck({ id, page, want }) {
  const fields = ['org', 'teamLabel', 'names', 'faculty', 'contactLabel', 'mail', 'close'];
  const differ = fields.filter((f) => JSON.stringify(page?.[f] ?? null) !== JSON.stringify(want[f]));
  const asterisk = typeof page?.text === 'string' && page.text.includes('*');
  return { id, rule: 'K201', pass: differ.length === 0 && !asterisk, expected: want, actual: { differ: Object.fromEntries(differ.map((f) => [f, page?.[f] ?? null])), asterisk } };
}

/**
 * W99 (the owner: "keep clicking Next ... from beginning till end"), W100: every press changes what the
 * scene shows. States are in press order, the first the screen before the first press; `view` is the
 * scene's own read (its text), never the footer's marker: a marker that moves over an unchanged view is
 * the dead Next the owner pressed three times. A state named in `exempt` is one the target cannot show.
 */
export function viewChangeCheck({ id, rule, states, exempt = [] }) {
  const list = states ?? [];
  const unchanged = [];
  const empty = list.filter((s) => typeof s.view !== 'string' || s.view.trim() === '').map((s) => s.at);
  for (let i = 1; i < list.length; i += 1) {
    if (exempt.includes(list[i].at)) continue;
    if (list[i].view === list[i - 1].view) unchanged.push({ from: list[i - 1].at, to: list[i].at });
  }
  const pass = list.length >= 2 && empty.length === 0 && unchanged.length === 0;
  return { id, rule, pass, expected: { unchanged: [], presses: Math.max(0, list.length - 1) }, actual: { presses: Math.max(0, list.length - 1), unchanged, empty, exempt: exempt.filter((e) => list.some((s) => s.at === e)) } };
}

/** W97: every LIVE row's box lies inside its own card's box (half a pixel of rounding allowed), and some row is read. */
export function liveRowsInCardsCheck({ id, rule, rows }) {
  const tol = 0.5;
  const outside = [];
  const noCard = [];
  for (const r of rows ?? []) {
    if (!r.card) {
      noCard.push(r.key);
      continue;
    }
    const c = r.card;
    const by = {
      top: Math.max(0, Math.round(c.y - r.row.y)),
      right: Math.max(0, Math.round(r.row.x + r.row.w - (c.x + c.w))),
      bottom: Math.max(0, Math.round(r.row.y + r.row.h - (c.y + c.h))),
      left: Math.max(0, Math.round(c.x - r.row.x)),
    };
    const inside = r.row.x >= c.x - tol && r.row.y >= c.y - tol && r.row.x + r.row.w <= c.x + c.w + tol && r.row.y + r.row.h <= c.y + c.h + tol;
    if (!inside) outside.push({ key: r.key, state: r.state, by });
  }
  const pass = (rows ?? []).length > 0 && noCard.length === 0 && outside.length === 0;
  return { id, rule, pass, expected: { outside: [], noCard: [] }, actual: { rows: (rows ?? []).length, outside, noCard } };
}

/** K219: each wanted string is a whole line of the screen's text (whitespace collapsed), in the order given. */
export function linesInOrderCheck({ id, rule, text, want }) {
  const lines = (typeof text === 'string' ? text : '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  let at = 0;
  let missing = null;
  for (const w of want ?? []) {
    const i = lines.indexOf(w, at);
    if (i < 0) {
      missing = w;
      break;
    }
    at = i + 1;
  }
  const pass = (want ?? []).length > 0 && lines.length > 0 && missing === null;
  return { id, rule, pass, expected: want, actual: { missing, lines: lines.slice(0, 60) } };
}

/** K217: the screen's figures are exactly the ruled files, in order, each loaded (a wrong record passes every other check). */
export function figuresCheck({ id, rule, imgs, files }) {
  if (!Array.isArray(files) || files.length === 0) throw new Error(`[walk] ${id}: no figure is expected`);
  const shown = (imgs ?? []).map((m) => {
    let name = '';
    try {
      name = new URL(m.src).pathname.split('/').pop() ?? '';
    } catch {
      name = '';
    }
    return { file: name, loaded: m.loaded === true };
  });
  const wrong = files.map((f, i) => ({ at: i + 1, want: f, shown: shown[i]?.file ?? null, loaded: shown[i]?.loaded ?? false })).filter((x) => x.shown !== x.want || !x.loaded);
  const pass = shown.length === files.length && wrong.length === 0;
  return { id, rule, pass, expected: files, actual: { shown, wrong } };
}

/**
 * K220: every approved string is on the page with its slots ({{x}}) filled, and none of the old wording
 * is (whitespace collapsed on both sides). A slot matches any run of text without a brace.
 */
export function copyCheck({ id, rule, text, want, gone }) {
  const flat = (s) => s.replace(/\s+/g, ' ').trim();
  const page = flat(typeof text === 'string' ? text : '');
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const asRe = (tpl) => new RegExp(flat(tpl).split(/\{\{\w+\}\}/).map(esc).join('[^{}]+?'));
  const missing = (want ?? []).filter((w) => !asRe(w).test(page));
  const stillShown = (gone ?? []).filter((g) => page.includes(flat(g)));
  const pass = page.length > 0 && (want ?? []).length > 0 && missing.length === 0 && stillShown.length === 0;
  return { id, rule, pass, expected: { missing: [], stillShown: [] }, actual: { missing, stillShown } };
}
