/**
 * The scripted walk (T4.1): one demo session in one language, through the K138 walk list A to O,
 * the playbook's atlas (P), Engine Room (Q) and keys (R), then the guided tour (T) on a demo session
 * of its own, section Z's LIVE checks on another (Z) and, last, the reset loop for every new visitor
 * (S, on the stack),
 * with the ruling checks (K75, K79 to K85, K101, K102, K105, K112, K133, K135, K139, K143, K149,
 * K151, K41, W1) and a read-back through the product's own read after every write (rule d). Start
 * it with e2e/walk/run-walk.sh. KIOSK_WALK_UNTIL=<letter> stops after that section (development
 * only; the report says so).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { KioskApi, type Manifest } from './api';
import { aiTextExact, censusCommand, censusCount, creditCheck, creditNumbers, formatStampWhen, ghostCheck, glowCheck, idleSettingCheck, keyForStem, keysFromIndexed, keysFromPayload, lastResetSame, loopStateCheck, nextBoxCheck, childrenCheck, creditsCheck, eachAddCheck, exactSetCheck, fillCheck, freshOnTopCheck, fullListCheck, insideFrameCheck, missedStampCheck, retiredModelCheck, spentCheck, verdict, type Box, greyedCheck, onlyFromCheck, linkLengthCheck, clearOfCheck, captionCheck, noLaptopCheck, linesInBoxesCheck, tourEndCheck, treeCheck, type GraphLike, noLiveCheck, oracleCommand, passMark, passMarkCheck, pickOption, pickText, releasedEqualsAi, releasedFollowsRubric, resetReadback, serveDoorReady, servedOrder, sinceResetCheck, snapshotNoteCheck, spendKeys, spendText, tourMarkers, visitOrderCheck, windowTimes, xrayPanelCheck, type LastReset, type LoopState } from './checks.mjs';
import { Walker, type Lang, type Target } from './walker';

const WEB = path.resolve(__dirname, '..', '..');
const tables = {
  en: JSON.parse(fs.readFileSync(path.join(WEB, 'src/app/i18n/en.json'), 'utf8')) as Record<string, string>,
  zh: JSON.parse(fs.readFileSync(path.join(WEB, 'src/app/i18n/zh.json'), 'utf8')) as Record<string, string>,
};
// K80's pass marks at their source (REQUIREMENTS K80: the eval policies' min_scores, unchanged).
const POLICIES = path.resolve(WEB, '..', 'services', 'chora-ai-kernel-orchestrator', 'eval', 'gate');
const PASS_MARKS = ['eval-policy.yaml', 'eval-policy-critic.yaml'].map((f) => passMark(fs.readFileSync(path.join(POLICIES, f), 'utf8'), f));
// W77, K199: the embedding model the kiosk used before round 2's switch, which no page may still name.
const RETIRED_EMBEDDING = ['text-embedding-004'];
// K204's lens captions as ruled (REQUIREMENTS K204; K214: zh Mastery leads with its tab's 掌握): each tab's bold
// lead and its whole two-line caption (web: the lead, then a space in en and none in zh, then the rest).
const K204: Record<'explore' | 'growth' | 'mastery', Record<Lang, { lead: string; text: string }>> = {
  explore: {
    en: { lead: 'Explore', text: 'Explore shows your whole map as it stands: every idea and how they link. Pick any idea to move it to the centre.' },
    zh: { lead: '探索', text: '探索展示你整张地图现在的样子：每个概念和它们之间的连线。点任何一个概念，就把它移到中间。' },
  },
  growth: {
    en: { lead: 'Growth', text: 'Growth bookmarks your learning edges: the ideas your Companion flagged as weak spots, tinted so you can see where to explore next.' },
    zh: { lead: '成长', text: '成长为你标出学习边缘：学习伙伴标记为薄弱点的概念会被着色，让你看到下一步该往哪里探索。' },
  },
  mastery: {
    en: { lead: 'Mastery', text: 'Mastery shows what you have proven: every idea you have won is tinted, so you can see how much of the map is yours.' },
    zh: { lead: '掌握', text: '掌握展示你已经证明掌握的部分：你拿下的每个概念都会着色，让你看到地图有多少已经是你的。' },
  },
};
// K203 (W87): the caption after the first "Make it photorealistic", and the request box it pre-fills (content is
// English in both languages, K41).
const K203 = {
  caption: {
    en: 'Look closely at the filters. A real NEWater plant uses large steel tanks and membrane units, not glasses or sponges. Tell the AI to fix it: we have started the request for you.',
    zh: '仔细看看过滤的部分。真正的新生水厂用的是大型钢罐和膜组件，而不是玻璃杯或海绵。请 AI 改正它：我们已经帮你写好了开头。',
  } as Record<Lang, string>,
  box: 'Show steel tanks and membrane units instead of the glass and sponges',
};
// K205 (W89): what the Companion's greeting starts from, with its own name.
const K205: Record<Lang, (name: string) => string> = {
  en: (n) => `${n} remembers your goal, the weak spots it found in the papers you shared, and how much of your map you have won. Each greeting it writes starts from that.`,
  zh: (n) => `${n} 记得你的学习目标、它在你分享的试卷里发现的薄弱点，以及你已经拿下了多少地图。它写的每一句问候都从这些出发。`,
};
// K208 (W92): each box's state as web built version 2 (kept navy, replaced on this computer, left out of this demo).
const K208_STATES: Record<string, 'kept' | 'repl' | 'gone'> = Object.fromEntries([
  ...['svc', 'crews', 'gw', 'pics', 'embed'].map((b) => [b, 'kept'] as const),
  ...['lb', 'signin', 'gke', 'words', 'db', 'events', 'files', 'watch', 'keys', 'build'].map((b) => [b, 'repl'] as const),
  ...['waf', 'pay', 'mesh', 'more', 'safety', 'wif'].map((b) => [b, 'gone'] as const),
]);
// K206 (W90): the essay's caption as ruled (Pingu's), its LIVE button and the two document tabs (en; zh from the table).
const K206 = {
  caption: {
    en: 'Now we ask Pingu to read a new document: a one-page essay its learner wrote on an open question. Pingu reads it live, right now, and suggests the learning edges it finds.',
    zh: '现在请 Pingu 读一份新的文件：学习者就一道开放式问题写的一页短文。Pingu 会现场实时阅读，并提出它找到的学习边缘。',
  } as Record<Lang, string>,
  button: 'Read the essay with Pingu',
  tabs: ['Unit 1 test · read before', 'Unit 2 essay'],
};
// K207 (W91): the storyboard's line as ruled, and its five steps' labels (the stack's build; zh labels from the table).
const K207 = {
  line: {
    en: 'How it works at home: add your own goal, and a Companion hatches to learn it with you. This is a picture of the full Chora app; the kiosk shows it without taking a payment.',
    zh: '在家里怎么用：加入你自己的学习目标，一只学习伙伴就会孵化出来陪你学。这是完整 Chora 应用的示意图；展台只作展示，不会收费。',
  } as Record<Lang, string>,
  steps: ['1 · Add a goal', '2 · Buy a Pod', '3 · Send it to the map', '4 · Awaken it', '5 · It works your map'],
};
// K201's credits as ruled (REQUIREMENTS K201, K185's order): the names, the email and two labels in each language.
const K201 = {
  names: ['Dale Leung', 'Walfarid Hermawan Limbong', 'Htet Aung'],
  chief: 'Heng Boon Kui',
  supervisor: 'Darryl Ng',
  mail: 'daleleung76@gmail.com',
  labels: { en: { team: 'Project team members', contact: 'Contact for this project' }, zh: { team: '项目团队成员', contact: '项目联系方式' } },
} as const;
// The K138 walk list's letters, in the order walked: Companions before Grading (a release credits
// the active Companion +30, orchestrator pass 2), and Grading's samples before the dashboard's
// assessment (web's W8: an unreleased dashboard answer hides the samples); the atlas (P) after
// Companions, as in the playbook; then the Engine Room (the playbook's Q, after the dashboard as
// there) and the keys (R); the Done reset (O); the guided tour (T) on its own demo session from
// O's reset (its C4 and G3 write, and G3 must release the strong sample itself, after M's release
// was put back), ending with its own Done; section Z's LIVE checks (WALK-PLAYBOOK Z4, Z8) on a demo
// session of their own from the tour's reset, ending with their own Done; then the reset loop (S) from
// that reset, which always ends the walk (the owner, 19 Oct: WALK-PLAYBOOK section S).
const ORDER = 'ABCDEFGHIJKPMLQRNOTZS';
const until = process.env['KIOSK_WALK_UNTIL'] ?? 'S';
if (!ORDER.includes(until)) throw new Error(`[walk] KIOSK_WALK_UNTIL must be one letter of ${ORDER}`);

/**
 * K149: kiosk-web shuffles each served practice question's options once per demo session, so an answer
 * is pressed by the KEY's text, never by position. The served sets carry no key, so the key comes from
 * a test-only source kiosk-web cannot reach: on the stack, the set's stored candidates (consumption's
 * campaign_question_sets, read-only through the kiosk's Postgres socket); on fixtures, the fixture
 * world's own practice questions; for the dose's quick check, world.json's atoms (the seed's source).
 * The answer's own response still says whether the press was the key.
 */
interface KeySource {
  set(choiceKey: string): Promise<{ stem: string; key: string }[]>;
}

function stackKeys(m: Manifest): KeySource {
  return {
    async set(choiceKey) {
      const c = m.choices[choiceKey];
      if (!c) throw new Error(`[walk] the manifest has no choice ${choiceKey}`);
      // A twin's set is stored on the twin the golden run made; a visitor's accept adopts a copy (V1).
      const conceptId = String(c.records[c.kind === 'adoptable_set' ? 'twin_concept_id' : 'concept_id']);
      const rung = Number(c.records['rung']);
      const q = oracleCommand({ container: kioskPostgres(), conceptId, rung });
      const rows = execFileSync('docker', q.args, { input: q.sql, encoding: 'utf8' }).split('\n').filter((l) => l.trim());
      if (rows.length !== 1) throw new Error(`[walk] ${choiceKey}: ${rows.length} ready sets on concept ${conceptId} rung ${rung}, not one`);
      return keysFromPayload(rows[0] as string, choiceKey);
    },
  };
}

/** The kiosk's one Postgres container, for the walk's test-only reads (K149's oracle, S's census). */
function kioskPostgres(): string {
  const names = execFileSync('docker', ['ps', '--filter', 'label=com.docker.compose.project=chora-kiosk', '--filter', 'label=com.docker.compose.service=postgres', '--format', '{{.Names}}'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  if (names.length !== 1) throw new Error(`[walk] ${names.length} kiosk Postgres containers, not one: ${names.join(', ')}`);
  return names[0] as string;
}

function fixtureKeys(): KeySource {
  return {
    async set(choiceKey) {
      const mod = (await import(pathToFileURL(path.join(WEB, 'dev', 'world', 'mockup-world.mjs')).href)) as { PRACTICE_QUESTIONS: Record<string, { stem: string; options: string[]; correct: number }> };
      const q = mod.PRACTICE_QUESTIONS[choiceKey];
      if (!q) throw new Error(`[walk] the fixture world has no practice question for ${choiceKey}`);
      return keysFromIndexed([q], choiceKey);
    },
  };
}

/** The dose quick checks' keys: world.json's atoms, as the seed made them. */
function doseKeys(): { stem: string; key: string }[] {
  const world = JSON.parse(fs.readFileSync(path.resolve(WEB, '..', 'kiosk', 'world', 'world.json'), 'utf8')) as { atoms?: { mcq?: { stem: string; options: string[]; correct: number } }[] };
  return keysFromIndexed((world.atoms ?? []).flatMap((a) => (a.mcq ? [a.mcq] : [])), 'world.json');
}

/**
 * The screen position of the key among the visible options, found by the visible stem (K149).
 * Recorded with where it showed, so a report says whether the options moved.
 */
async function keyAt(w: Walker, a: { id: string; stem: string; options: string; keys: { stem: string; key: string }[] }): Promise<number> {
  const stems = await w.page.locator(`${a.stem}:visible`).allTextContents();
  if (stems.length !== 1) throw new Error(`[walk] ${a.id}: ${stems.length} question stems on screen, not one`);
  const shown = await w.page.locator(`${a.options}:visible`).evaluateAll((els) => els.map((b) => [...b.children].filter((c) => !c.classList.contains('mk')).map((c) => c.textContent ?? '').join('')));
  const want = keyForStem(a.keys, stems[0] as string, a.id);
  const at = pickText({ id: a.id, shown, want });
  w.note(`${a.id}: the key "${want}" shows at position ${at + 1} of ${shown.length}`);
  w.orders.push({ visit: w.visit, id: a.id, stem: spaced(stems[0]), shown: shown.map(spaced) });
  return at;
}

/** Judges a campaign answer by its own response: the pick was the key (and, for a win, it won). */
function answered(w: Walker, since: number, id: string, wantWon: boolean): void {
  const a = w.lastWrite('campaign answer', since);
  const body = (a?.body ?? null) as { correct?: unknown; won?: unknown } | null;
  const ok = body?.correct === true && (!wantWon || body.won === true);
  w.record({ id, rule: 'T4.1 d', pass: ok ? (w.source === 'stack' ? true : 'fixture') : false, expected: { correct: true, ...(wantWon ? { won: true } : {}) }, actual: a ? { status: a.status, correct: body?.correct, won: body?.won } : 'no answer was sent' });
}

/** The walk's key source for its target (K149). */
const keySources = new WeakMap<Walker, KeySource>();
function keySource(w: Walker): KeySource {
  let s = keySources.get(w);
  if (!s) {
    s = w.ctx.target === 'stack' ? stackKeys(w.ctx.manifest) : fixtureKeys();
    keySources.set(w, s);
  }
  return s;
}

/** A part of the walk the fixture world holds no records for: said in the report, never passed. */
function stackOnly(w: Walker, what: string): boolean {
  if (w.ctx.target !== 'fixtures') return false;
  w.record({ id: `${what}: walked on the stack only`, rule: 'T4.1', pass: 'not-judged', expected: 'the stack', actual: null, note: 'the fixture world has no routes for it' });
  return true;
}

const choice = (m: Manifest, key: string) => {
  const c = m.choices[key];
  if (!c) throw new Error(`[walk] the manifest has no choice ${key}`);
  return c;
};
const rec = (m: Manifest, key: string, field: string): unknown => {
  const v = choice(m, key).records[field];
  if (v === undefined || v === null) throw new Error(`[walk] the manifest's ${key} has no records.${field}`);
  return v;
};

test('the walk', async ({ page, baseURL }, info) => {
  const lang = info.project.metadata['lang'] as Lang;
  const target = process.env['KIOSK_WALK_TARGET'] as Target;
  const out = process.env['KIOSK_WALK_OUT'] as string;
  const api = await KioskApi.open(baseURL as string);
  const manifest = await api.manifest();
  const preparedTurnIds = new Set(
    Object.values(manifest.choices)
      .filter((c) => c.kind === 'greeting')
      .map((c) => String(c.records['turn_id'])),
  );
  const liveAllow = new Set((process.env['KIOSK_WALK_LIVE_ALLOW'] ?? '').split(',').filter(Boolean));
  const w = new Walker(page, { lang, target, out, baseURL: baseURL as string, commit: process.env['KIOSK_WALK_COMMIT'] ?? 'unknown', liveAllow, tables, manifest, preparedTurnIds });
  await w.attach();
  const readiness0 = await api.readiness();
  let resetDone = false;
  if (target === 'stack') {
    // K151: a demo session started since the last reset changed what the next visitor meets, and Start
    // would ask about it; the walk's start state and its loop both need the stack as a reset left it.
    const pre = sinceResetCheck({ id: 'the walk starts on a stack no demo session used since its last reset', readiness: readiness0, expect: false });
    w.record(pre);
    if (pre.pass !== true) {
      const file = w.writeReport({ walked: [], until, partial: true, refused: 'reset the stack first (presenter, Run tab, Reset everything now), then start the walk again' });
      await api.close();
      expect(w.failures(), `the walk refused to start (report ${file})`).toEqual([]);
      return;
    }
  }
  // The start every loop must bring back, read before the walk writes anything (stack only: the
  // fixture world has no wallet or composed dashboard read).
  const start = target === 'stack' ? await startState(w, api) : null;
  const sections: Record<string, () => Promise<void>> = {
    A: () => startScreen(w, readiness0),
    B: () => presenter(w, api),
    C: () => stepOne(w),
    D: () => stepTwo(w, api),
    E: () => stepThree(w, api),
    F: () => newHat(w),
    G: () => words(w),
    H: () => picture(w),
    I: () => closing(w),
    J: () => hall(w),
    K: () => companions(w, api),
    L: () => dashboard(w, api),
    M: () => grading(w, api),
    P: () => atlas(w, api),
    Q: () => engineRoom(w, api),
    R: () => keys(w, api),
    N: async () => w.note(lang === 'zh' ? 'this whole walk is the Chinese one (K41 checked on every screenshot)' : 'Chinese is the zh project'),
    O: async () => {
      resetDone = await doneReset(w, api, start, 'after Done', '');
    },
    T: async () => {
      // The tour's own demo session starts from O's reset and ends with its own Done.
      const fromReset = resetDone;
      resetDone = false;
      // The fixture world has no reset to finish (its readiness is static): there T starts from O's start screen.
      if (!fromReset && target === 'stack') throw new Error("the tour needs O's Done reset to have finished");
      resetDone = await tour(w, api, start);
    },
    Z: async () => {
      // Section Z's demo session starts from the tour's Done reset (on fixtures from its start screen) and ends with its own Done.
      const fromReset = resetDone;
      resetDone = false;
      if (!fromReset && target === 'stack') throw new Error("section Z needs the tour's Done reset to have finished");
      resetDone = await liveSession(w, api, start, fromReset);
    },
    S: async () => {
      if (stackOnly(w, 'section S, the reset loop')) return;
      // The loop starts from O's reset and writes again: until its own last reset finishes, the stack is changed.
      const fromReset = resetDone;
      resetDone = false;
      if (!fromReset) throw new Error("the loop needs the tour's Done reset (or O's) to have finished");
      resetDone = await resetLoop(w, api, start);
    },
  };
  const walked: string[] = [];
  // On the stack the walk always ends with O, the Done reset: it writes records and never leaves them.
  const letters = [...new Set([...ORDER.slice(0, ORDER.indexOf(until) + 1), ...(target === 'stack' ? ['O'] : [])])];
  for (const s of letters) {
    const run = sections[s];
    if (!run) throw new Error(`[walk] no section ${s}`);
    w.at(s);
    await test.step(`section ${s}`, async () => {
      try {
        await run();
        walked.push(s);
      } catch (e) {
        w.fail(`section ${s} stopped: ${String(e).split('\n')[0]}`);
        await w.recover().catch((r) => w.fail(`recovery after ${s} failed: ${String(r).split('\n')[0]}`));
      }
    });
  }
  if (target === 'stack' && !resetDone) {
    w.at('safety reset');
    const r = await api.resetAndWait().catch((e: unknown) => ({ state: `error: ${String(e).split('\n')[0]}`, took_s: null }));
    w.record({ id: "the walk's own Done did not finish: reset through the API", rule: 'T4.1 c', pass: false, expected: 'the Done reset in section O', actual: r });
  }
  const file = w.writeReport({ walked, until, partial: until !== 'S' });
  await api.close();
  console.log(`[walk] ${lang} report: ${file}`);
  expect(w.failures(), `the walk's failures (report ${file})`).toEqual([]);
});

/** A: the start screen, the credits and About the app (K84, K85 in the disclosure table). */
async function startScreen(w: Walker, readiness: Record<string, unknown>): Promise<void> {
  await w.page.goto('/', { waitUntil: 'networkidle' });
  await w.page.waitForTimeout(1500);
  if (w.ctx.lang === 'zh') await w.click('[data-act="lang"][data-lang="zh"]', { settle: 800 });
  await w.snap('start');
  await w.click('[data-act="credits"]', { settle: 900 });
  await w.snap('credits');
  // K201: team first in K185's order, the chief over the supervisor, the contact's email, no asterisk; the
  // faculty labels, the programme line and the close hint (not worded in K201) judged against the string table.
  const page = await w.page.evaluate(() => {
    const c = document.querySelector('#credits');
    const text = (sel: string) => c?.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
    return {
      text: (c as HTMLElement | null)?.innerText ?? '',
      org: text('.c-org'),
      teamLabel: text('.c-col.team .c-lbl'),
      names: [...(c?.querySelectorAll('.c-col.team .c-names > div') ?? [])].map((n) => (n.textContent ?? '').trim()),
      faculty: [...(c?.querySelectorAll('.c-col.fac .c-fac') ?? [])].map((f) => ({ label: (f.querySelector('.c-lbl')?.textContent ?? '').trim(), person: (f.querySelector('.c-person')?.textContent ?? '').trim() })),
      contactLabel: text('.c-contact .c-lbl'),
      mail: text('.c-mail'),
      close: text('.c-close'),
    };
  });
  const labels = K201.labels[w.ctx.lang];
  w.record(creditsCheck({ id: 'K201 the credits page as ruled', page, want: { org: w.t('credits.org'), teamLabel: labels.team, names: [...K201.names], faculty: [{ label: w.t('credits.chief'), person: K201.chief }, { label: w.t('credits.supervisor'), person: K201.supervisor }], contactLabel: labels.contact, mail: K201.mail, close: w.t('credits.close') } }));
  await w.click('#credits', { settle: 600 });
  await w.click('[data-act="disclosure"]', { settle: 800 });
  const table = await w.page.locator('#ov-disclosure').innerText();
  await w.snap('about-the-app');
  // K209 (W93): "laptop" became "computer" on every visitor screen.
  const r8 = w.ctx.lang === 'en' ? 'Not enabled on this computer' : w.t('local.r8h');
  const r9 = w.ctx.lang === 'en' ? 'Google’s Cloud Platform' : w.t('local.r9h');
  w.record({ id: 'K84 what you type', rule: 'K84', pass: table.includes(r8), expected: r8, actual: table.slice(0, 2000), note: w.ctx.lang === 'zh' ? 'zh judged against the string table' : undefined });
  w.record({ id: 'K85 picture requests', rule: 'K85', pass: table.includes(r9), expected: r9, actual: table.slice(0, 2000), note: w.ctx.lang === 'zh' ? 'zh judged against the string table' : undefined });
  w.record(noLaptopCheck({ id: 'K209 About the app: no "laptop"', screen: 'about', lang: w.ctx.lang, text: table }));
  await w.click('#ov-disclosure [data-act="closeOverlay"]', { settle: 500 });
  w.record({ id: 'K105 readiness read', rule: 'K105', pass: spendKeys(readiness).length === 0, expected: [], actual: spendKeys(readiness) });
}

/** B: the presenter panel: pause the idle timer first, readiness (K105, the snapshot's stamp), counts. */
async function presenter(w: Walker, api: KioskApi): Promise<void> {
  await w.pauseIdle();
  const r = await api.readiness();
  const snap = r['snapshot'] as { prepared_at?: string | null; restored_at?: string | null } | null;
  await w.openPresenter();
  await w.click('[data-act="ptab"][data-tab="ready"]', { settle: 1500 });
  const text = await w.page.locator('#presenter').innerText();
  const extra = [snap?.prepared_at, snap?.restored_at].filter((v): v is string => typeof v === 'string');
  await w.snap('presenter-ready', { extraTimes: extra });
  w.record({ id: 'K105 readiness board', rule: 'K105', pass: spendText(text).length === 0, expected: [], actual: spendText(text) });
  if (snap?.prepared_at) {
    const made = formatStampWhen(snap.prepared_at, w.ctx.lang);
    w.record({ id: 'K101 prepared start', rule: 'K101', pass: text.includes(made) ? (w.source === 'stack' ? true : 'fixture') : false, expected: made, actual: text.slice(0, 1500) });
  } else {
    w.record({ id: 'K101 prepared start', rule: 'K101', pass: false, expected: 'a snapshot prepared_at', actual: snap });
  }
  await w.click('[data-act="ptab"][data-tab="visits"]', { settle: 600 });
  await w.snap('presenter-counts');
  await w.click('[data-act="ptab"][data-tab="talk"]', { settle: 600 });
  await w.snap('presenter-talk');
  await w.closePresenter();
}

/** C: step 1, the map: only Desalination glows (K139). */
async function stepOne(w: Walker): Promise<void> {
  const m = w.ctx.manifest;
  await w.click(`[data-act="start"][data-lang="${w.ctx.lang}"]`, { settle: 3000 });
  await w.snap('h1-map');
  const glowIds = await w.page.$$eval('g.lens-node', (nodes) => nodes.filter((n) => n.querySelector('path.lens-glow')).map((n) => n.getAttribute('data-id') ?? ''));
  w.record(glowCheck({ glowIds, expectId: String(rec(m, 'sugg.water.desal', 'focal_concept_id')) }));
}

/** D: step 2, Desalination's prepared ideas, shown exactly as the model wrote them (K133). */
async function stepTwo(w: Walker, api: KioskApi): Promise<void> {
  const m = w.ctx.manifest;
  const desal = String(rec(m, 'sugg.water.desal', 'focal_concept_id'));
  await w.click(`g.lens-node[data-id="${desal}"]`, { settle: 2500 });
  const a = await w.snap('h2-ideas', { stamps: ['sugg.water.desal'] });
  const titles = rec(m, 'sugg.water.desal', 'titles') as string[];
  for (const title of titles) {
    w.record({ ...aiTextExact({ shown: a.sceneText, record: title }), id: `K133 idea ${title}` });
  }
  // K189 (1) and (2), before any Add: the list holds the batch's ideas only (no link row), each with its
  // own Add, and Next waits, greyed, with the card naming the idea step 3 asks about.
  const list = await w.page.evaluate(() => ({
    rows: document.querySelectorAll('#panel .sugg-row').length,
    adds: document.querySelectorAll('#panel .sugg-row [data-act="suggAccept"]').length,
    next: (document.querySelector('#bottom [data-act="next"]') as HTMLButtonElement | null)?.disabled ?? null,
    wait: (document.querySelector('#scene .wait-ro') as HTMLElement | null)?.innerText.trim() ?? null,
  }));
  w.record(eachAddCheck({ rows: list.rows, adds: list.adds, ideas: titles.length }));
  w.record(greyedCheck({ id: 'K189 step 2 Next waits, greyed, before the idea step 3 asks about is added', buttons: { next: list.next } }));
  const waitLine = w.t('h2.waitRO', { c: String(rec(m, 'v1.reverse-osmosis', 'title')) });
  w.record({ id: 'K189 step 2 the card names the idea Next waits for', rule: 'K189', pass: list.wait === waitLine, expected: waitLine, actual: list.wait });
  // K101 on the record itself: the stamp is the batch's own createdAt, as the product's read gives it.
  const batch = await batchRead(w, api, 'sugg.water.desal');
  const times = [...new Set(batch.map((s) => s.createdAt))];
  const want = times.length === 1 ? formatStampWhen(times[0] as string, w.ctx.lang) : null;
  w.record({ id: 'K101 h2 stamp is the batch record time', rule: 'K101', pass: want !== null && a.sceneText.includes(want) ? (w.source === 'stack' ? true : 'fixture') : false, expected: times, actual: a.sceneText.match(/\d{1,2} \w{3}, \d{2}:\d{2}|\d{1,2}月\d{1,2}日 \d{2}:\d{2}/g) });
}

interface SuggestionRow {
  readonly suggestionId: string;
  readonly status: string;
  readonly title: string;
  readonly createdAt: string;
}

/** The goal's suggestions read, the rows of one prepared batch (by the manifest's ids). */
async function batchRead(w: Walker, api: KioskApi, key: string): Promise<SuggestionRow[]> {
  const goal = String(rec(w.ctx.manifest, key, 'goal_id'));
  const ids = rec(w.ctx.manifest, key, 'suggestion_ids') as string[];
  const read = await api.get<{ suggestions?: SuggestionRow[] }>(`/api/v1/me/concept-graph/suggestions?goalId=${encodeURIComponent(goal)}`);
  if (!Array.isArray(read.suggestions)) throw new Error('the suggestions read has no suggestions list');
  return read.suggestions.filter((s) => ids.includes(s.suggestionId));
}

/** E: step 3, the ideas added, and the new idea's practice question (one serve read, no generation). */
async function stepThree(w: Walker, api: KioskApi): Promise<void> {
  const m = w.ctx.manifest;
  await w.click('[data-act="accept"]', { settle: 3500 });
  await w.snap('h3-map');
  // Rule d: after Add, no idea of the batch is still pending, and each one is on the map.
  const left = (await batchRead(w, api, 'sugg.water.desal')).filter((s) => s.status !== 'accepted');
  w.record({ id: 'read back the accepted batch', rule: 'T4.1 d', pass: left.length === 0 ? (w.source === 'stack' ? true : 'fixture') : false, expected: 'every idea accepted', actual: left.map((s) => `${s.title}: ${s.status}`) });
  const titles = rec(m, 'sugg.water.desal', 'titles') as string[];
  const missing: string[] = [];
  for (const t of titles) if (!(await w.nodeId(t))) missing.push(t);
  w.record({ id: 'every accepted idea is on the map', rule: 'T4.1 d', pass: missing.length === 0, expected: titles, actual: { missing } });
  const title = String(rec(m, 'v1.reverse-osmosis', 'title'));
  const node = await w.nodeId(title);
  if (!node) throw new Error(`no lens node labelled ${title} after the accept`);
  await w.click(`g.lens-node[data-id="${node}"]`, { settle: 3000 });
  await w.snap('h3-question', { stamps: ['v1.reverse-osmosis'] });
  await behindTheQuestion(w);
}

/** Step 3's "How was this made?" (K75): Behind the scenes on the question's own run, read from its xray. */
async function behindTheQuestion(w: Walker): Promise<void> {
  const trace = choice(w.ctx.manifest, 'v1.reverse-osmosis').records['trace_id'];
  const xray = `/api/v1/kiosk/xray/${encodeURIComponent(String(trace))}`;
  const since = w.calls.length;
  await w.click('#bottom [data-act="xray"][data-kind="q"]', { settle: 1500 });
  await w.page
    .waitForFunction(() => document.querySelectorAll('#xray-sheet ul.trace li').length >= 2 || document.querySelector('#xray-sheet .msg-error') !== null, undefined, { timeout: 8000 })
    .catch(() => undefined);
  const panel = await w.page.evaluate(() => {
    const sheet = document.querySelector('#xray-sheet');
    return {
      open: document.querySelector('#ov-xray')?.classList.contains('show') === true,
      title: sheet?.querySelector('h2')?.textContent?.trim() ?? null,
      rows: sheet?.querySelectorAll('ul.trace li').length ?? 0,
      failed: !!sheet?.querySelector('.msg-error'),
    };
  });
  await w.snap('h3-xray');
  w.pageTexts.set('Behind the scenes, step 3', await w.page.locator('#xray-sheet').innerText().catch(() => ''));
  const reads = w.calls.slice(since).filter((c) => c.method === 'GET').map((c) => c.path);
  const check = xrayPanelCheck({ ...panel, expectTitle: w.t('xr.q'), reads, path: xray, source: w.source });
  w.record(trace ? check : { ...check, pass: false, note: "the manifest's v1.reverse-osmosis has no records.trace_id" });
  await w.click('#ov-xray [data-act="closeOverlay"]', { settle: 600 });
}

/** F: "Same you, new hat" (K34), then on to the studio. */
async function newHat(w: Walker): Promise<void> {
  const since = w.writes.length;
  const at = await keyAt(w, { id: 'step 3', stem: '.q-stem', options: '[data-act="answer"]', keys: await keySource(w).set('v1.reverse-osmosis') });
  await w.click('[data-act="answer"]:visible', { nth: at, settle: 3000 });
  answered(w, since, 'the step 3 answer is correct', false);
  await w.snap('h3-answered', { stamps: ['v1.reverse-osmosis'] });
  await w.click('#bottom [data-act="next"]', { settle: 4000 });
  await w.snap('h4-new-hat');
  await w.click('[data-act="swapGo"]', { settle: 1500 });
}

/** 4a's two LIVE buttons: Send (the typed change) and Redo (the last change), and the studio's LIVE labels. */
async function wordsLive(w: Walker): Promise<{ send: boolean | null; redo: boolean | null; labels: string[] }> {
  return w.page.evaluate(() => {
    const off = (sel: string) => (document.querySelector(sel) as HTMLButtonElement | null)?.disabled ?? null;
    return {
      send: off('form.ask [data-act="live"]'),
      redo: off('#revstatus [data-act="live"]'),
      labels: [...document.querySelectorAll('#scene .live-label')].map((l) => (l as HTMLElement).innerText.trim()),
    };
  });
}

/** G: 4a, the words: the scenario chip (K187), its prepared revision (K101), the hand edit opened and left. */
async function words(w: Walker): Promise<void> {
  await w.snap('h4a-words');
  // K189 (3): a LIVE button with nothing to act on yet is greyed: Send until words are typed, Redo until a change.
  const before = await wordsLive(w);
  w.record(greyedCheck({ id: 'K189 4a Send and Redo are greyed before a change', buttons: { send: before.send, redo: before.redo } }));
  // K187 (Z9): three chips, simpler, a one-line explanation and a real-life scenario; the fourth ("Replace the option") is retired.
  const chips = await w.page.$$eval('[data-act="revText"]', (cs) => cs.map((c) => (c as HTMLElement).innerText.trim()));
  w.record(exactSetCheck({ id: 'K187 4a offers the three chips only', rule: 'K187', shown: chips, expected: [w.t('chip.simpler'), w.t('chip.explain'), w.t('chip.scenario')] }));
  await w.click('[data-act="revText"][data-kind="scenario"]', { settle: 3000 });
  await w.snap('h4a-scenario', { stamps: ['words.r'] });
  // K186: no "Do it again" anywhere: the studio's LIVE labels are Send and Redo, and nothing else.
  const after = await wordsLive(w);
  w.record(onlyFromCheck({ id: 'K186 4a offers no repeat: its LIVE labels are Send and Redo only', rule: 'K186', shown: after.labels, allowed: [w.t('live.send'), w.t('live.redo')] }));
  if (await w.click('[data-act="handEdit"]', { settle: 700 })) {
    await w.snap('h4a-hand-edit');
    await w.click('[data-act="handCancel"]', { settle: 600 });
  }
}

/** The picture on the canvas is the record's own (a screen drawing the wrong record passes every other check). */
async function pictureIs(w: Walker, key: string): Promise<void> {
  const want = new URL(String(rec(w.ctx.manifest, key, 'image_url')), w.ctx.baseURL).pathname;
  const shown = await w.page.$$eval('#canvas img', (imgs) => imgs.filter((i) => (i as HTMLImageElement).offsetWidth > 0).map((i) => (i as HTMLImageElement).src));
  const paths = shown.map((s) => new URL(s).pathname);
  w.record({ id: `picture ${key}`, rule: 'K138 H', pass: paths.includes(want) ? (w.source === 'stack' ? true : 'fixture') : false, expected: want, actual: paths });
}

/** H: 4b, the picture: the manifest's diagram, each prepared chip with its own stamp and picture, then Keep (one accept). */
async function picture(w: Walker): Promise<void> {
  await w.click('#bottom [data-act="next"]', { settle: 3500 });
  await w.snap('h4b-picture', { stamps: ['draft.h4'] });
  await pictureIs(w, 'draft.h4');
  for (const [kind, key] of [['uv', 'pic.uv'], ['where', 'pic.uv.where'], ['illus', 'pic.illus'], ['photo', 'pic.illus.photo'], ['sketch', 'pic.photo.sketch']]) {
    await w.click(`[data-act="rev"][data-kind="${kind}"]`, { settle: 3000 });
    await w.snap(`h4b-${kind}`, { stamps: [key as string] });
    await pictureIs(w, key as string);
    if (kind === 'photo') await tanksInvite(w);
  }
  const accepts = () => w.calls.filter((c) => c.method === 'POST' && /\/question-jobs\/[^/]+\/accept$/.test(c.path)).length;
  const before = accepts();
  await w.click('#bottom [data-act="next"]', { settle: 4000 });
  w.record({ id: 'Keep makes one accept', rule: 'K56', pass: accepts() - before === 1, expected: 1, actual: accepts() - before });
  await w.snap('h4b-kept');
}

/** W92 (K208): the diagram above the table, every box in its ruled state, every line of text inside its box; no "laptop" (K209). */
async function archDiagram(w: Walker): Promise<void> {
  const d = await w.page.evaluate(() => {
    const box = (e: Element) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const svg = document.querySelector('kiosk-arch-diagram svg.arch-svg');
    const table = document.querySelector('.ex-local .local-scroll table.disclose');
    const boxes = [...document.querySelectorAll('kiosk-arch-diagram g.arch-box[data-box]')].map((g) => {
      const rects = [...g.querySelectorAll('rect')];
      return {
        name: g.getAttribute('data-box') ?? '',
        state: g.getAttribute('data-state') ?? '',
        box: rects[0] ? box(rects[0]) : { x: 0, y: 0, w: 0, h: 0 },
        amber: rects.filter((r) => (r.getAttribute('fill') ?? '').toLowerCase() === '#f59e0b').length,
        dashed: rects[0]?.getAttribute('stroke-dasharray') ?? '',
        lines: [...g.querySelectorAll('text')].map((t) => ({ text: (t.textContent ?? '').trim(), ...box(t) })),
      };
    });
    const s = svg?.getBoundingClientRect();
    const t = table?.getBoundingClientRect();
    return { boxes, above: !!(s && t && s.bottom <= t.top + 0.5), lanes: document.querySelectorAll('kiosk-arch-diagram text.lane-t').length,
      legend: document.querySelectorAll('kiosk-arch-diagram text.lg').length, text: document.querySelector('#scene')?.textContent ?? '' };
  });
  w.record({ id: 'W92 the diagram above the table', rule: 'K208', pass: d.above && d.boxes.length > 0, expected: 'the diagram, then the table', actual: { boxes: d.boxes.length, above: d.above } });
  w.record(linesInBoxesCheck({ id: 'W92 every line of the diagram inside its box', boxes: d.boxes.filter((b) => b.name !== 'visitor') }));
  const states = Object.fromEntries(d.boxes.filter((b) => b.name !== 'visitor').map((b) => [b.name, b.state]));
  const marks = d.boxes.filter((b) => (b.state === 'repl' && b.amber !== 1) || (b.state === 'gone' && b.dashed !== '8 7') || (b.state === 'kept' && (b.amber !== 0 || b.dashed !== ''))).map((b) => b.name);
  w.record({ id: 'W92 each box kept, replaced or left out as ruled, and marked so', rule: 'K208', pass: Object.keys(states).length === Object.keys(K208_STATES).length && Object.entries(K208_STATES).every(([k, v]) => states[k] === v) && marks.length === 0 && d.lanes === 5 && d.legend === 3, expected: { states: K208_STATES, lanes: 5, legend: 3 }, actual: { states, marks, lanes: d.lanes, legend: d.legend } });
  w.record(noLaptopCheck({ id: 'K209 How this demo runs: no "laptop"', screen: 'local', lang: w.ctx.lang, text: d.text }));
}

/**
 * W90 (K206): Pingu's marked test panel holds two documents, the test first: the test keeps its prepared reading
 * and has no LIVE control; the essay tab (marked NEW) shows the essay's page, its caption and the one LIVE button,
 * aimed at Pingu's reader, with no spots before a press. The walk never presses it (a LIVE read is a model call).
 */
async function pinguPapers(w: Walker, pingu: string): Promise<void> {
  await w.click('[data-act="ability"][data-ab="weak"]', { settle: 2500 });
  const panel = `.cx-weak[data-cx-weak="${pingu}"]`;
  const test = await w.page.evaluate((sel) => {
    const p = document.querySelector(sel);
    const tabs = [...(p?.querySelectorAll('.cx-weak__docs [data-act="weakDoc"]') ?? [])];
    return {
      tabs: tabs.map((t) => ({ doc: t.getAttribute('data-doc'), pressed: t.getAttribute('aria-pressed'), label: (t.textContent ?? '').replace(/\s+/g, ' ').trim(), isNew: !!t.querySelector('.cx-doc__new') })),
      spots: p?.querySelectorAll('.cx-edge[data-edge]').length ?? 0,
      live: p ? p.querySelectorAll('[data-live], [data-act="live"]').length : -1,
      stamp: !!p?.querySelector('.cx-weak__foot .cx-weak__stamp .stamp'),
      save: !!p?.querySelector('.cx-weak__foot [data-act="weakSave"]'),
    };
  }, panel);
  await w.snap('comp-weak-test');
  const order = test.tabs.map((t) => t.doc).join(',');
  const labelsOk = w.ctx.lang !== 'en' || (test.tabs[0]?.label === K206.tabs[0] && (test.tabs[1]?.label ?? '').startsWith(K206.tabs[1]));
  w.record({ id: 'W90 two documents, the test first and pressed, the essay marked NEW', rule: 'K206', pass: order === 'test,essay' && test.tabs[0]?.pressed === 'true' && test.tabs[1]?.isNew === true && !test.tabs[0]?.isNew && labelsOk, expected: { tabs: K206.tabs, first: 'test', newOn: 'essay' }, actual: test.tabs });
  w.record({ id: 'W90 the test keeps its prepared reading and has no LIVE control', rule: 'K206', pass: test.spots > 0 && test.live === 0 && test.stamp && test.save, expected: { spots: '> 0', live: 0, stamp: true, save: true }, actual: test });
  await w.click(`${panel} .cx-weak__docs [data-act="weakDoc"][data-doc="essay"]`, { settle: 1500 });
  await w.snap('comp-weak-essay');
  const essay = await w.page.evaluate(({ sel, key }) => {
    const p = document.querySelector(sel);
    const btn = p?.querySelector(`[data-act="live"][data-key="${key}"]`);
    return {
      page: p?.querySelector('.cx-weak__paper img')?.getAttribute('src') ?? null,
      caption: p?.querySelector('.cx-weak__essayCap')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      row: !!p?.querySelector(`[data-live="${key}"]`),
      button: btn ? (btn.textContent ?? '').replace(/\s+/g, ' ').trim() : null,
      buttons: p ? p.querySelectorAll('[data-act="live"]').length : -1,
      spots: p?.querySelectorAll('.cx-edge[data-edge]').length ?? -1,
    };
  }, { sel: panel, key: `weak:comp:${pingu}` });
  w.record({ id: 'W90 the essay tab: its page and the ruled caption', rule: 'K206', pass: (essay.page ?? '').includes('paper-water-essay.png') && essay.caption === K206.caption[w.ctx.lang], expected: { page: 'paper-water-essay.png', caption: K206.caption[w.ctx.lang] }, actual: { page: essay.page, caption: essay.caption } });
  const buttonOk = essay.row && essay.buttons === 1 && essay.button !== null && (w.ctx.lang !== 'en' || essay.button.includes(K206.button));
  w.record({ id: 'W90 one LIVE button, aimed at Pingu\'s reader, no spots before a press', rule: 'K206', pass: buttonOk && essay.spots === 0, expected: { key: `weak:comp:${pingu}`, button: K206.button, spots: 0 }, actual: essay });
  await w.click(`${panel} .cx-weak__docs [data-act="weakDoc"][data-doc="test"]`, { settle: 1200 });
}

/** K210 (W90): Nova's and Ember's marked tests show one document, their prepared reading, and no LIVE read. */
async function oneDocument(w: Walker, name: string): Promise<void> {
  await w.click('[data-act="ability"][data-ab="weak"]', { settle: 2500 });
  await w.snap(`comp-weak-${name.toLowerCase()}`);
  const read = await w.page.evaluate(() => {
    const p = document.querySelector('.cx-weak');
    return { docs: p?.querySelectorAll('.cx-weak__docs').length ?? -1, live: p ? p.querySelectorAll('[data-live], [data-act="live"]').length : -1,
      spots: p?.querySelectorAll('.cx-edge[data-edge]').length ?? 0, stamp: !!p?.querySelector('.cx-weak__stamp .stamp') };
  });
  w.record({ id: `K210 ${name}'s marked test: one document, its prepared reading, no LIVE read`, rule: 'K210', pass: read.docs === 0 && read.live === 0 && read.spots > 0 && read.stamp, expected: { docs: 0, live: 0, spots: '> 0', stamp: true }, actual: read });
}

/** W89 (K205): the dose's greeting rail says what the Companion's greeting starts from, in its own name. */
async function railWhy(w: Walker, name: string): Promise<void> {
  const why = await w.page.locator('.cx-rail__why').first().textContent({ timeout: 3000 }).catch(() => null);
  const shown = why?.replace(/\s+/g, ' ').trim() ?? null;
  w.record({ id: `W89 ${name}'s rail: what its greeting starts from`, rule: 'K205', pass: shown === K205[w.ctx.lang](name), expected: K205[w.ctx.lang](name), actual: shown });
}

/** W87 (K203): after the first photo, the caption invites a better picture and the request box is pre-filled, its LIVE send ready. */
async function tanksInvite(w: Walker): Promise<void> {
  const read = await w.page.evaluate(() => ({
    caption: document.querySelector('p.pic-tanks')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    box: (document.querySelector('#revinput') as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? null,
    send: !!document.querySelector('form.ask [data-act="live"][data-key]'),
    above: (() => {
      const c = document.querySelector('p.pic-tanks')?.getBoundingClientRect();
      const f = document.querySelector('form.ask')?.getBoundingClientRect();
      return c && f ? c.bottom <= f.top + 0.5 : false;
    })(),
  }));
  w.record({ id: 'W87 the caption after the first photo', rule: 'K203', pass: read.caption === K203.caption[w.ctx.lang] && read.above, expected: K203.caption[w.ctx.lang], actual: read });
  w.record({ id: 'W87 the request box is pre-filled, its LIVE send ready', rule: 'K203', pass: read.box === K203.box && read.send, expected: K203.box, actual: { box: read.box, send: read.send } });
}

/** I: step 5 and the closing credits. */
async function closing(w: Walker): Promise<void> {
  if ((await w.page.locator('#credits.show').count()) > 0) {
    await w.snap('h5-credits');
    await w.click('#credits', { settle: 800 });
  }
  await w.snap('h5-close');
}

/** J: the hall: five exhibits and Done. */
async function hall(w: Walker): Promise<void> {
  await w.click('#bottom [data-act="next"]', { settle: 2500 });
  await w.snap('hall');
  await w.auditControl();
  // W91 (K207): the five tour exhibits, and a sixth tile, "Your own goal", after the Engine Room.
  const cards = await w.page.locator('#scene .ex-card[data-act="open"]').count();
  w.record({ id: 'the hall has five exhibits', rule: 'K138 J', pass: cards === 5, expected: 5, actual: cards });
  const order = await w.page.$$eval('#scene .hall .cards > .ex-card', (cs) => cs.map((c) => `${c.getAttribute('data-act')}:${c.getAttribute('data-to')}`));
  w.record({ id: 'W91 the hall\'s sixth tile is Your own goal, after the Engine Room', rule: 'K207', pass: order.length === 6 && order[5] === 'openOwn:own' && order[4] === 'open:engine', expected: ['...', 'open:engine', 'openOwn:own'], actual: order });
  w.record(noLaptopCheck({ id: 'K209 the hall: no "laptop"', screen: 'hall', lang: w.ctx.lang, text: await w.page.locator('body').innerText() }));
  await ownGoal(w);
}

/** W91 (K207): the storyboard from the hall: no call, no tour beat, its line as ruled, five steps, nothing to press inside it, Back to the hall. */
async function ownGoal(w: Walker): Promise<void> {
  const calls = w.calls.length;
  await w.click('#scene .hall .cards > .ex-card[data-act="openOwn"][data-to="own"]', { settle: 1500 });
  await w.snap('own-goal');
  const read = await w.page.evaluate(() => {
    const own = document.querySelector('#scene .own');
    return {
      shown: !!own,
      lede: own?.querySelector('.lede')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      steps: [...(own?.querySelectorAll('.own-steps > .own-step') ?? [])].map((st) => ({ n: st.getAttribute('data-step'), label: st.querySelector('.own-sn')?.textContent?.trim() ?? '' })),
      controls: own ? own.querySelectorAll('button, a, input, select, textarea, [data-act]').length : -1,
      marker: document.querySelector('#bottom .tour-marker')?.textContent?.trim() ?? '',
      text: own?.textContent ?? '',
    };
  });
  w.record({ id: 'W91 the storyboard\'s line', rule: 'K207', pass: read.lede === K207.line[w.ctx.lang], expected: K207.line[w.ctx.lang], actual: read.lede });
  const labels = read.steps.map((st) => st.label);
  const stepsOk = read.steps.length === 5 && read.steps.every((st, i) => st.n === String(i + 1) && st.label !== '') && (w.ctx.lang !== 'en' || labels.join('|') === K207.steps.join('|'));
  w.record({ id: 'W91 five steps, in order', rule: 'K207', pass: stepsOk, expected: w.ctx.lang === 'en' ? K207.steps : '5 labelled steps, 1 to 5', actual: read.steps, note: w.ctx.lang === 'zh' ? 'zh labels judged non-empty' : undefined });
  w.record({ id: 'W91 a still picture: nothing to press, no call, no tour beat', rule: 'K207', pass: read.shown && read.controls === 0 && w.calls.length === calls && read.marker === '', expected: { controls: 0, calls: 0, marker: '' }, actual: { controls: read.controls, calls: w.calls.slice(calls).map((c) => c.path), marker: read.marker } });
  w.record(noLaptopCheck({ id: 'K209 the storyboard: no "laptop"', screen: 'own', lang: w.ctx.lang, text: read.text }));
  await w.click('#bottom .fb-right [data-act="back"]', { settle: 1200 });
  w.record({ id: 'W91 Back returns to the hall', rule: 'K207', pass: await inHall(w), expected: 'the hall', actual: await w.page.locator('#scene').getAttribute('class') });
}

/** One Engine Room page from the door, and back to the door by the footer's Back (K40; W47 retired "Back to the Engine Room"). */
async function enginePage(w: Walker, to: string, body: () => Promise<void>): Promise<void> {
  await w.click(`#scene [data-act="open"][data-to="${to}"]`, { settle: 2500 });
  await body();
  await w.click('#bottom [data-act="back"]', { settle: 1500 });
}

/**
 * Q: the Engine Room (T3.10, T3.11): the door's four pages; Agent crews at work with no LIVE run
 * (K81), its timeline from the records, and the decision log said to be a snapshot (K82); AI safety's
 * five checks with the judge's pass marks (K80, the numbers from the eval policies); the governance
 * facts' "pass mark" (K80); How this demo runs. Every page is static or a read: no write, no LIVE.
 */
async function engineRoom(w: Walker, api: KioskApi): Promise<void> {
  await w.click('#scene [data-act="open"][data-to="engine"]', { settle: 2500 });
  await w.snap('engine');
  const pageText = async (name: string) => w.pageTexts.set(name, await w.page.locator('#scene').innerText());
  await pageText('the Engine Room');
  const tiles = await w.page.locator('#scene .eng-tile').count();
  w.record({ id: 'the Engine Room has four pages', rule: 'K138 Q', pass: tiles === 4, expected: 4, actual: tiles });
  await enginePage(w, 'crews', async () => {
    await w.page
      .waitForFunction(() => document.querySelectorAll('#scene .timeline .tl li').length >= 3 || document.querySelector('#scene .timeline .msg-error') !== null, undefined, { timeout: 10_000 })
      .catch(() => undefined);
    await w.snap('eng-crews');
    await pageText('Agent crews at work');
    const page = await w.page.evaluate(() => ({
      h2: document.querySelector('#scene h2')?.textContent?.trim() ?? null,
      drawn: document.querySelectorAll('#scene .crew-grid').length === 1 && document.querySelectorAll('#scene .decision').length === 1,
      live: [...document.querySelectorAll('#scene [data-act="live"], #scene [data-act="liveRedo"], #scene [data-live], #scene .live-row')].map(
        (e) => `${e.getAttribute('data-act') ?? e.className}: ${(e.textContent ?? '').trim().slice(0, 60)}`,
      ),
      timeline: document.querySelectorAll('#scene .timeline .tl li:not(.sim)').length,
      timelineFailed: document.querySelector('#scene .timeline .msg-error') !== null,
      note: document.querySelector('#scene .decision .snap-note')?.textContent ?? null,
      clock: document.querySelector('#scene .decision .snap-note svg.clock') !== null,
    }));
    w.record(noLiveCheck({ onPage: page.drawn && page.h2 === w.t('crews.title'), live: page.live }));
    // This morning's run from its own records, then the demo session's line (K101, K81).
    w.record({ id: 'the crews timeline reads its records', rule: 'K81', pass: !page.timelineFailed && page.timeline >= 2 ? (w.source === 'stack' ? true : 'fixture') : false, expected: 'the prepared run and this session', actual: { rows: page.timeline, failed: page.timelineFailed } });
    const expect = w.ctx.lang === 'en' ? 'A snapshot of a past log, not live.' : w.t('crews.snapshot');
    w.record({ ...snapshotNoteCheck({ text: page.note, expect, clock: page.clock }), ...(w.ctx.lang === 'zh' ? { note: 'zh judged against the string table' } : {}) });
  });
  await enginePage(w, 'safety', async () => {
    const judge = await w.page.locator('#scene .sf-detail').innerText();
    await w.snap('eng-safety-judge');
    await pageText('AI safety');
    w.record(passMarkCheck({ text: judge, lang: w.ctx.lang, marks: PASS_MARKS }));
    for (const s of ['redteam', 'gate', 'runtime', 'drift']) {
      await w.click(`#scene [data-act="sfStage"][data-id="${s}"]`, { settle: 800 });
      await w.snap(`eng-safety-${s}`);
    }
  });
  await enginePage(w, 'gov', async () => {
    const facts = await w.page.locator('#scene').innerText();
    await w.snap('eng-gov');
    await pageText('Governance');
    w.record({ ...passMarkCheck({ text: facts, lang: w.ctx.lang, marks: [] }), id: 'K80 the governance facts say the pass mark' });
  });
  await enginePage(w, 'local', async () => {
    await w.snap('eng-local');
    await pageText('How this demo runs');
    await archDiagram(w);
  });
  // W77, K193 (Z18): no page read names the retired embedding model, and readiness names the current one.
  const roles = ((await api.readiness())['model_config'] as { roles?: Record<string, { model?: string }> } | undefined)?.roles;
  const named = retiredModelCheck({ id: 'Z18 no page names the retired embedding model', rule: 'W77', texts: Object.fromEntries(w.pageTexts), current: roles?.['embedding']?.model ?? null, retired: RETIRED_EMBEDDING });
  const pagesClean = Object.keys((named.actual as { retiredNamed: Record<string, string[]> }).retiredNamed).length === 0;
  w.record(w.source === 'stack' ? named : { ...named, pass: pagesClean ? 'fixture' : false, note: "the fixture readiness names the fixture world's own model, so on fixtures only the pages are judged" });
  await w.click('#bottom [data-act="toHall"]', { settle: 2000 });
}


/** The hall is on screen (the playbook's E-head "Explore Chora"). */
async function inHall(w: Walker): Promise<boolean> {
  return (await w.page.locator('#scene .hall').count()) > 0;
}

/** What the screen shows instead of the hall: the scene's heading, or the tour's marker. */
async function whereAmI(w: Walker): Promise<string> {
  if (await inHall(w)) return 'the hall';
  const marker = await w.page.locator('#bottom .tour-marker').innerText().catch(() => '');
  const h = await w.page.locator('#scene h1, #scene h2').first().innerText().catch(() => '');
  return spaced(marker || h) || 'no heading';
}

/** The tour's footer marker ("Meet the Companions, 2 of 6"; on the hall, where Next starts). */
async function tourMarker(w: Walker): Promise<string> {
  return spaced(await w.page.locator('#bottom .tour-marker').innerText({ timeout: 5000 }).catch(() => ''));
}

/** Next's box in page pixels, the pointer away and the hover lift (0.2 s) settled, as web's tour spec measures it. */
async function nextBox(w: Walker): Promise<{ x: number; y: number; w: number; h: number }> {
  await w.page.mouse.move(1, 1);
  const next = w.page.locator('#bottom [data-act="next"]');
  await expect.poll(() => next.evaluate((el) => getComputedStyle(el).transform), { timeout: 5000 }).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  const b = await next.boundingBox();
  if (!b) throw new Error('Next is not on screen');
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
}

/** The kiosk writes since `from` that are not visit counts (a visit is counted on every hall card and Next entry). */
function nonVisitWrites(w: Walker, from: number): string[] {
  return w.writes.slice(from).filter((x) => x.path !== '/api/v1/kiosk/visits').map((x) => `${x.rule} ${x.path}`);
}

/**
 * P: the atlas (WALK-PLAYBOOK P1 to P4 and P9): three regions; Singapore's water with the story's six
 * ideas on its map; an idea's drawer and its practice question from the serve door; Esc to the hall.
 * Lens nodes are pressed by their element (the lens moves with each focus, trap 11), never by x and y.
 */
async function atlas(w: Walker, api: KioskApi): Promise<void> {
  const m = w.ctx.manifest;
  if (!(await inHall(w))) await w.press('Escape', 1500);
  const from = w.writes.length;
  await w.click('[data-act="open"][data-to="maps"]', { settle: 3500 });
  await w.snap('atlas');
  const regions = await w.page.$$eval('[data-act="region"]', (rs) => rs.map((r) => r.getAttribute('data-id') ?? ''));
  w.record({ id: 'P1 the atlas has three regions', rule: 'K36', pass: regions.length === 3 && new Set(regions).size === 3, expected: 3, actual: regions });
  await w.click('[data-act="region"][data-id="goal.water"]', { settle: 2500 });
  await w.snap('atlas-water');
  const titles = rec(m, 'sugg.water.desal', 'titles') as string[];
  const missing: string[] = [];
  for (const t of titles) if (!(await w.nodeId(t))) missing.push(t);
  w.record({ id: "P2 Singapore's water shows the story's six ideas", rule: 'K36', pass: missing.length === 0, expected: titles, actual: { missing } });
  const used = await w.nodeId('Used water');
  if (!used) throw new Error('no lens node labelled Used water on the water map');
  await w.click(`g.lens-node[data-id="${used}"]`, { settle: 2500 });
  const open = await w.page.locator('#panel.open').count();
  await w.snap('atlas-used');
  w.record({ id: 'P3 a press on Used water opens its drawer', rule: 'K36', pass: open === 1, expected: 1, actual: open });
  if (!stackOnly(w, "P4 Used water's practice question (the fixture world serves none)")) {
    const served = w.served.length;
    await w.click('#panel [data-act="practise"]', { settle: 3000 });
    const options = await w.page.locator('#panel [data-act="mapAnswer"]:visible').count();
    await w.snap('atlas-used-practice');
    w.record({ id: 'P4 Practise shows the served question and its options', rule: 'K50', pass: options >= 2 && w.served.length === served + 1, expected: { options: '2 or more', serveReads: 1 }, actual: { options, serveReads: w.served.length - served } });
  }
  await w.click('#panel [data-act="closeConcept"]', { settle: 1500 });
  await w.press('Escape', 1500);
  const hall = await inHall(w);
  w.record({ id: 'P9 the drawer closed, Esc returns to the hall', rule: 'K173', pass: hall, expected: 'the hall', actual: await whereAmI(w) });
  await wonHex(w, api);
  // K188: every map is a pure tree, by the product's map read; K196: the hawker map is h1, and its lens is shown.
  for (const key of ['goal.water', 'goal.nature', 'goal.hawker']) {
    const graph = await api.get<GraphLike>(`/api/v1/me/maps/${encodeURIComponent(String(m.world[key]))}/graph`);
    w.record(treeCheck({ id: `K188 ${key} is a pure tree`, graph }));
    if (key === 'goal.hawker') {
      w.record(childrenCheck({ id: 'K196 Hawker culture holds UNESCO listing, Hawker centres, Chicken rice, Kopi', rule: 'K196', graph, parent: 'Hawker culture', children: ['UNESCO listing', 'Hawker centres', 'Chicken rice', 'Kopi'] }));
      w.record(childrenCheck({ id: 'K196 Hawker centres holds Food safety', rule: 'K196', graph, parent: 'Hawker centres', children: ['Food safety'] }));
    }
  }
  await w.click('[data-act="open"][data-to="maps"]', { settle: 3500 });
  await w.click('[data-act="region"][data-id="goal.hawker"]', { settle: 2500 });
  await w.snap('atlas-hawker');
  // K202 (Z17, amends K196): seeded, the picked idea and its ring inside the frame, every link drawn and long enough.
  await ringChecks(w, '#maplens', 'the hawker map seeded', await hawkerGraph(w, api));
  w.record({ id: 'P no write but the visit counts', rule: 'T4.1 d', pass: nonVisitWrites(w, from).length === 0, expected: [], actual: nonVisitWrites(w, from) });
  await hawkerAdds(w, api);
  await lensCaptions(w);
  await w.press('Escape', 1500);
}

/** W88 (K204, K214): each lens tab, clicked, is the active one and shows its ruled two-line caption, its lead bold; Explore last, as the atlas opens. */
async function lensCaptions(w: Walker): Promise<void> {
  for (const paint of ['growth', 'mastery', 'explore'] as const) {
    await w.click(`.lens-bar .lens-row .lens-pills .lens-pill[data-act="paint"][data-paint="${paint}"]`, { settle: 1200 });
    await w.snap(`atlas-lens-${paint}`);
    const read = await w.page.evaluate(() => ({
      active: document.querySelector('.lens-bar .lens-pill[aria-checked="true"]')?.getAttribute('data-paint') ?? null,
      lead: document.querySelector('.lens-bar .lens-cap b')?.textContent ?? null,
      text: document.querySelector('.lens-bar .lens-cap')?.textContent ?? null,
    }));
    w.record(captionCheck({ id: `W88 the ${paint} tab's caption`, rule: paint === 'mastery' && w.ctx.lang === 'zh' ? 'K214' : 'K204', paint, ...read, want: K204[paint][w.ctx.lang] }));
  }
}

/**
 * P on the hex won at K. With no press on it, Z16 (W75): its Overview's ask is a plain line naming the
 * Companion. After K's won press (Z14), that press's outcome is listed there instead (W73: LiveService
 * feeds the atlas drawer too), the ask rightly gone. The fixture world's map does not move with an
 * answer (make-fixtures.mjs), so there the hex K won is not shown won.
 */
async function wonHex(w: Walker, api: KioskApi): Promise<void> {
  const won = String(rec(w.ctx.manifest, 'set.water.res.r6', 'concept_id'));
  const pressed = w.ctx.liveAllow.has('sugg');
  const id = pressed ? "Z14 (W73) at P: the won press's outcome is listed on the won hex" : 'Z16 (W75) the won hex Overview shows the ask line before a press';
  const rule = pressed ? 'W73' : 'W75';
  await w.click('[data-act="open"][data-to="maps"]', { settle: 3500 });
  await w.click('[data-act="region"][data-id="goal.water"]', { settle: 2500 });
  await w.click(`g.lens-node[data-id="${won}"]`, { settle: 2500 });
  await w.snap('atlas-won');
  const camp = spaced(await w.page.locator('#panel .camp-line').first().innerText({ timeout: 3000 }).catch(() => ''));
  if (!camp.startsWith(w.t('kd.wonToday'))) {
    w.record({ id, rule, pass: w.source === 'stack' ? false : 'not-judged', expected: w.t('kd.wonToday'), actual: camp, note: 'the hex K won is not shown won' });
    if (pressed) w.record({ id: "Z15 (W74) at P: a missed won press shows the fallback's own prepared stamp", rule: 'W74', pass: 'not-judged', expected: 'the won hex', actual: camp, note: 'the hex K won is not shown won' });
  } else if (pressed) {
    await judgeWonPress(w, api, won, 'at P', null);
  } else {
    const ask = await w.page.locator('#panel .sugg-ask').first().innerText({ timeout: 3000 }).catch(() => null);
    w.record(fillCheck({ id, rule, shown: ask?.trim() ?? null, template: w.t('kd.suggAsk', { name: '\u0000' }) }));
  }
  await w.click('#panel [data-act="closeConcept"]', { settle: 1500 });
  await w.press('Escape', 1500);
}

/** K196 (Z17) at P: Hawker centres' prepared ideas each added; the map stays a pure tree, holds them, and every idea is inside the frame. */
async function hawkerAdds(w: Walker, api: KioskApi): Promise<void> {
  const m = w.ctx.manifest;
  const centres = String(rec(m, 'sugg.hawker.centres', 'focal_concept_id'));
  const titles = rec(m, 'sugg.hawker.centres', 'titles') as string[];
  await w.click(`g.lens-node[data-id="${centres}"]`, { settle: 2500 });
  await w.click('#panel [data-act="kdtab"][data-tab="sugg"]', { settle: 2000 });
  await w.snap('atlas-hawker-centres-sugg');
  for (let i = 0; i < titles.length + 2 && (await w.page.locator('#panel [data-act="suggAccept"]:visible').count()) > 0; i += 1) {
    await w.click('#panel [data-act="suggAccept"]:visible', { settle: 2500 });
  }
  await w.click('#panel [data-act="closeConcept"]', { settle: 2000 });
  await w.snap('atlas-hawker-added');
  const graph = await api.get<GraphLike>(`/api/v1/me/maps/${encodeURIComponent(String(m.world['goal.hawker']))}/graph`);
  w.record(treeCheck({ id: "Z17 the hawker map after Hawker centres' ideas is a pure tree", graph }));
  const missing: string[] = [];
  for (const t of titles) if (!(await w.nodeId(t))) missing.push(t);
  w.record({ id: "Z17 Hawker centres' prepared ideas are on the map", rule: 'K196', pass: missing.length === 0, expected: titles, actual: { missing } });
  await ringChecks(w, '#maplens', "the hawker map after Hawker centres' ideas", graph);
}

/** A lens's frame (its SVG's box) and each idea's hex box, as the K188 rig measured them: what a visitor sees. */
/** The hawker map's graph, as the API holds it (its edge count is what the lens must draw). */
async function hawkerGraph(w: Walker, api: KioskApi): Promise<GraphLike> {
  return api.get<GraphLike>(`/api/v1/me/maps/${encodeURIComponent(String(w.ctx.manifest.world['goal.hawker']))}/graph`);
}

/**
 * W86 (K202) as web states it: the frame is the lens svg's box, its right edge cut at an open drawer's left edge;
 * the picked idea (g.lens-node--focus) and its ring (g.lens-node--ring) are the nodes that must sit inside it; each
 * drawn link's on-screen length is its path length times the svg's scale; the caption card (K204) is the atlas's.
 */
async function ringBoxes(w: Walker, host: string): Promise<{ frame: Box; nodes: (Box & { title: string })[]; lengths: number[]; minPx: number; card: Box | null }> {
  return w.page.evaluate((h) => {
    const box = (e: Element) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const svg = document.querySelector<SVGSVGElement>(`${h} svg.concept-lens__scene`);
    if (!svg) throw new Error(`no lens scene in ${h}`);
    const frame = box(svg);
    const drawer = document.querySelector('#panel.open');
    if (drawer) frame.w = Math.max(0, Math.min(frame.x + frame.w, drawer.getBoundingClientRect().x) - frame.x);
    const label = (n: Element) => [...n.querySelectorAll('text.lens-label tspan')].map((t) => (t.textContent ?? '').trim()).join(' ');
    const nodes = [...svg.querySelectorAll('g.lens-node--focus, g.lens-node--ring')].flatMap((n) => {
      const hex = n.querySelector('path.lens-hex');
      return hex ? [{ title: label(n), ...box(hex) }] : [];
    });
    const scale = svg.getScreenCTM()?.a ?? NaN;
    const lengths = [...svg.querySelectorAll<SVGPathElement>('path.lens-edge')].map((p) => p.getTotalLength() * scale);
    const cap = h === '#maplens' ? document.querySelector('.lens-bar .lens-cap') : null;
    return { frame, nodes, lengths, minPx: (40 * window.innerWidth) / 1366, card: cap ? box(cap) : null };
  }, host);
}

/** K202 (Z17): the picked idea and its ring inside the frame; every link drawn and at least 40 px at 1366; K204: none under the atlas's caption card. */
async function ringChecks(w: Walker, host: string, what: string, graph: GraphLike): Promise<void> {
  const r = await ringBoxes(w, host);
  w.record(insideFrameCheck({ id: `Z17 ${what}: the picked idea and its ring inside the frame`, rule: 'K202', frame: r.frame, nodes: r.nodes }));
  w.record(linkLengthCheck({ id: `Z17 ${what}: every link drawn, at least 40 px at 1366`, rule: 'K202', lengths: r.lengths, edgeCount: (graph.edges ?? []).length, minPx: r.minPx }));
  if (host === '#maplens') w.record(clearOfCheck({ id: `Z17 ${what}: no ring idea under the lens caption`, rule: 'K204', nodes: r.nodes, card: r.card }));
}

/** The LIVE rows on screen by key, and each LIVE button's key and label (K186: a spent subject has none). */
async function liveState(w: Walker): Promise<{ rows: string[]; buttons: { key: string; label: string }[] }> {
  return w.page.evaluate(() => ({
    rows: [...document.querySelectorAll('.live-row[data-live]')].map((r) => r.getAttribute('data-live') ?? ''),
    buttons: [...document.querySelectorAll('[data-act="live"][data-key]')].map((b) => ({
      key: b.getAttribute('data-key') ?? '',
      label: (b.querySelector('.live-label')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    })),
  }));
}

/** The stamps, in screen order, of the LIVE row of `kind` on `idea` (whichever scene its key names); null with no such row. */
async function liveStamps(w: Walker, kind: string, idea: string): Promise<string[] | null> {
  return w.page.evaluate(
    ({ k, i }) => {
      const row = [...document.querySelectorAll('.live-row[data-live]')].find((r) => {
        const key = r.getAttribute('data-live') ?? '';
        return key.startsWith(`${k}:`) && key.endsWith(`:${i}`);
      });
      return row ? [...row.querySelectorAll('.stamp')].map((s) => (s.textContent ?? '').replace(/\s+/g, ' ').trim()) : null;
    },
    { k: kind, i: idea },
  );
}

/** Waits up to `ms` until the LIVE row of `key` has an outcome (its calling line gone); false while it still calls. */
async function liveEnded(w: Walker, key: string, ms: number): Promise<boolean> {
  return w.page
    .waitForFunction(
      (k) => {
        const row = [...document.querySelectorAll('.live-row[data-live]')].find((r) => r.getAttribute('data-live') === k);
        return !!row && row.querySelector('.live-status') === null;
      },
      key,
      { timeout: ms },
    )
    .then(
      () => true,
      () => false,
    );
}

/** The one list of waiting ideas on screen, in order: each row's title, LIVE tag, state line and Add buttons. */
async function suggList(w: Walker): Promise<{ title: string; live: boolean; state: string | null; adds: number }[]> {
  return w.page.$$eval('.sugg-row', (rows) =>
    rows
      .filter((r) => r.getClientRects().length > 0)
      .map((r) => ({
        title: (r.querySelector('bdi')?.textContent ?? '').trim(),
        live: r.querySelector('.sugg-live') !== null,
        state: (r.querySelector('.sugg-state') as HTMLElement | null)?.innerText.trim() ?? null,
        adds: r.querySelectorAll('[data-act="suggAccept"], [data-act="freshAccept"]').length,
      })),
  );
}

/** What a LIVE row's stamps say became of its press: answered ("Live, ..."), missed (a fallback line), or neither. */
function outcomeOf(w: Walker, stamps: string[] | null): 'answered' | 'missed' | 'unclear' {
  const fills = (key: string, slot: string) => {
    const [head, tail] = w.t(key, { [slot]: '\u0000' }).split('\u0000') as [string, string];
    return (s: string) => s.length > head.length + tail.length && s.startsWith(head) && s.endsWith(tail);
  };
  const late = fills('live.fallback', 's');
  const liveAt = fills('live.doneAt', 'when');
  if ((stamps ?? []).some((s) => s === w.t('live.fallbackFailed') || late(s))) return 'missed';
  if ((stamps ?? []).some((s) => s === w.t('live.done') || liveAt(s))) return 'answered';
  return 'unclear';
}

/** The ideas a LIVE press made around `focal`: the goal's read's idea rows on it that no prepared batch holds (K189 (2): no link). */
async function pressIdeas(w: Walker, api: KioskApi, goalKey: string, focal: string): Promise<{ title: string; status: string }[]> {
  const prepared = new Set(Object.values(w.ctx.manifest.choices).flatMap((c) => (Array.isArray(c.records['suggestion_ids']) ? (c.records['suggestion_ids'] as string[]) : [])));
  const goal = String(w.ctx.manifest.world[goalKey]);
  const read = await api.get<{ suggestions?: { suggestionId: string; title?: string; status: string; kind?: string; focalConceptId?: string }[] }>(
    `/api/v1/me/concept-graph/suggestions?goalId=${encodeURIComponent(goal)}`,
  );
  if (!Array.isArray(read.suggestions)) throw new Error('the suggestions read has no suggestions list');
  return read.suggestions.filter((x) => x.focalConceptId === focal && x.kind !== 'edge' && !prepared.has(x.suggestionId)).map((x) => ({ title: x.title ?? '', status: x.status }));
}

/** The hidden batch (K64) the golden run prepared around an idea: what a missed press shows in its place. */
function hiddenBatch(m: Manifest, focal: string): string {
  const keys = Object.entries(m.choices)
    .filter(([, c]) => c.kind === 'suggestions' && c.hidden && c.records['focal_concept_id'] === focal)
    .map(([k]) => k);
  if (keys.length !== 1) throw new Error(`[walk] ${keys.length} hidden batches around ${focal}, not one`);
  return keys[0] as string;
}

/** Z15 (W74): a missed press shows its line, then the hidden batch's own prepared stamp. */
function missJudged(w: Walker, id: string, stamps: string[] | null, focal: string): void {
  const prepared = w.t('stamp.prepared', { when: formatStampWhen(choice(w.ctx.manifest, hiddenBatch(w.ctx.manifest, focal)).prepared_at, w.ctx.lang) });
  const c = missedStampCheck({ id, rule: 'W74', stamps: stamps ?? [], failed: w.t('live.fallbackFailed'), lateTemplate: w.t('live.fallback', { s: '\u0000' }), prepared });
  w.record({ ...c, pass: verdict(c.pass === true, w.source) });
}

const NO_SUGG = 'LIVE sugg is not allowed in this walk (KIOSK_WALK_LIVE_ALLOW)';

/**
 * Z14 (W73) at K: one LIVE fresh-ideas press on Pingu's won idea (approved: one press), the drawer
 * closed within 2 s by picking Nova, then Pingu picked again and Suggest opened, as web's gap (a) specs
 * do. Picking a Companion resets the quiz, and Suggest opens on the first prepared batch with waiting
 * ideas, so Companions may hold no view of the won idea to reopen: then that is noted (not judged) and
 * the outcome is judged at P, on the won hex. The fixture world answers a press only around
 * Desalination (make-fixtures.mjs), so there this press always misses.
 */
async function wonPress(w: Walker, api: KioskApi, pingu: string): Promise<void> {
  const m = w.ctx.manifest;
  const z14 = 'Z14 (W73) at K: the won press, its drawer closed mid-call, is listed when it opens again';
  if (!w.ctx.liveAllow.has('sugg')) {
    w.record({ id: z14, rule: 'W73', pass: 'not-judged', expected: 'one LIVE fresh-ideas press', actual: null, note: NO_SUGG });
    w.record({ id: "Z15 (W74) a missed press shows the fallback's own prepared stamp", rule: 'W74', pass: 'not-judged', expected: 'a missed LIVE call', actual: null, note: NO_SUGG });
    return;
  }
  const won = String(rec(m, 'set.water.res.r6', 'concept_id'));
  const nova = String(rec(m, 'greet.nova', 'companion_id'));
  const button = (await liveState(w)).buttons.find((b) => b.key.startsWith('sugg:') && b.key.endsWith(`:${won}`));
  if (!button) throw new Error(`no LIVE fresh-ideas button on the won idea ${won}`);
  const pressed = Date.now();
  if (!(await w.click(`[data-act="live"][data-key="${button.key}"]`, { live: 'sugg', settle: 300 }))) throw new Error('the won press did not go');
  await w.click(`[data-act="mate"][data-id="${nova}"]`, { settle: 300 });
  const closedMs = Date.now() - pressed;
  w.note(`Z14: the won press's drawer closed ${closedMs} ms after the press`);
  await w.page.waitForTimeout(w.source === 'stack' ? 25_000 : 2_000);
  await w.click(`[data-act="mate"][data-id="${pingu}"]`, { settle: 3000 });
  await w.click('[data-act="ability"][data-ab="suggest"]', { settle: 3000 });
  await w.snap('comp-won-press-reopened');
  if ((await liveStamps(w, 'sugg', won)) === null) {
    const on = spaced(await w.page.locator('#panel .kd-title').first().innerText({ timeout: 3000 }).catch(() => ''));
    w.record({ id: z14, rule: 'W73', pass: 'not-judged', expected: 'a view of the won idea', actual: { suggestOpensOn: on }, note: 'picking a Companion resets the quiz and Suggest opens on another idea, so Companions holds no view of the won idea to reopen; judged at P' });
    return;
  }
  await judgeWonPress(w, api, won, 'at K', closedMs);
}

/**
 * The won press's outcome where the won idea's LIVE row is on screen (K's reopened drawer, or P's won
 * hex). Answered: its ideas head the one list tagged LIVE, none lost in the read, and no button is left
 * for the idea (K186). Missed (Z15, W74): the hidden batch shows, its own prepared stamp right after the
 * miss's line, and the button offers Try again (K189).
 */
async function judgeWonPress(w: Walker, api: KioskApi, won: string, where: string, closedMs: number | null): Promise<void> {
  const m = w.ctx.manifest;
  const z14 = `Z14 (W73) ${where}: the won press, its drawer closed mid-call, is listed`;
  const z15 = `Z15 (W74) ${where}: a missed won press shows the fallback's own prepared stamp`;
  const late = closedMs !== null && closedMs > 2000;
  const note = closedMs === null ? undefined : `the drawer closed ${closedMs} ms after the press`;
  const stamps = await liveStamps(w, 'sugg', won);
  const outcome = outcomeOf(w, stamps);
  const rows = await suggList(w);
  const state = await liveState(w);
  if (outcome === 'answered') {
    const press = await pressIdeas(w, api, 'goal.water', won);
    const top = freshOnTopCheck({ id: z14, rule: 'W73', rows: rows.map((r) => ({ id: r.title, live: r.live })), fresh: press.map((x) => x.title) });
    w.record({ ...top, pass: verdict(top.pass === true && !late, w.source), ...(note ? { note } : {}) });
    const lost = press.filter((x) => x.status !== 'pending').map((x) => `${x.title}: ${x.status}`);
    w.record({ id: `Z14 ${where} read back: every idea of the won press waits, pending`, rule: 'W73', pass: verdict(press.length > 0 && lost.length === 0, w.source), expected: 'every idea pending', actual: { ideas: press.length, lost } });
    w.record(spentCheck({ id: `Z14 (K186) ${where}: the won idea has no LIVE fresh-ideas button left`, key: `sugg:x:${won}`, rowKeys: state.rows, buttonKeys: state.buttons.map((b) => b.key) }));
    w.record({ id: z15, rule: 'W74', pass: 'not-judged', expected: 'a missed LIVE call', actual: stamps, note: 'the won press was answered: no call missed' });
  } else if (outcome === 'missed') {
    missJudged(w, z15, stamps, won);
    const titles = rec(m, hiddenBatch(m, won), 'titles') as string[];
    const shown = rows.map((r) => r.title);
    const missing = titles.filter((t) => !shown.includes(t));
    w.record({ id: `${z14}: missed, so its fallback`, rule: 'W73', pass: verdict(missing.length === 0 && !late, w.source), expected: titles, actual: { shown, missing }, ...(note ? { note } : {}) });
    const retry = state.buttons.find((b) => b.key.startsWith('sugg:') && b.key.endsWith(`:${won}`));
    w.record({ id: `Z14 (K189) ${where}: the missed won press offers Try again`, rule: 'K189', pass: retry?.label === w.t('live.retry'), expected: w.t('live.retry'), actual: retry?.label ?? 'no LIVE button' });
  } else {
    w.record({ id: z14, rule: 'W73', pass: false, expected: 'the press answered or missed', actual: { stamps, rows: rows.length }, ...(note ? { note } : {}) });
  }
}

/**
 * Z: section Z's LIVE checks on a demo session of their own (WALK-PLAYBOOK Z4 and Z8), from the tour's
 * reset: Start, the glowing Desalination, one LIVE "Ask Pingu for fresh ideas" (approved: one press).
 * Answered: the press's ideas head step 2's one list tagged LIVE, the stamp line keeps "Prepared {when}"
 * beside "Live, just now", and no LIVE fresh-ideas button is left for Desalination (K186). Missed: Z15 on
 * its fallback. On the stack only (the fixture map grows only by a whole prepared batch), K190: then Done.
 */
async function liveSession(w: Walker, api: KioskApi, start: LoopState | null, fromReset: boolean): Promise<boolean> {
  const m = w.ctx.manifest;
  if (!w.ctx.liveAllow.has('sugg')) {
    w.record({ id: "Z4 (K190) six children close step 2's list", rule: 'K190', pass: 'not-judged', expected: 'one LIVE fresh-ideas press', actual: null, note: NO_SUGG });
    w.record({ id: 'Z8 (K186) a LIVE result spends its subject', rule: 'K186', pass: 'not-judged', expected: 'one LIVE fresh-ideas press', actual: null, note: NO_SUGG });
    return fromReset;
  }
  const desal = String(rec(m, 'sugg.water.desal', 'focal_concept_id'));
  w.visit += 1;
  await w.click(`[data-act="start"][data-lang="${w.ctx.lang}"]`, { settle: 3000 });
  await noPrompt(w, 'Z');
  await w.pauseIdle();
  await glowsAlone(w, 'Z');
  await w.click(`g.lens-node[data-id="${desal}"]`, { settle: 2500 });
  await w.snap('z-step2');
  const button = (await liveState(w)).buttons.find((b) => b.key.startsWith('sugg:') && b.key.endsWith(`:${desal}`));
  if (!button) throw new Error("no LIVE fresh-ideas button on step 2's Desalination");
  if (!(await w.click(`[data-act="live"][data-key="${button.key}"]`, { live: 'sugg', settle: 500 }))) throw new Error('the step 2 press did not go');
  const ended = await liveEnded(w, button.key, w.source === 'stack' ? 120_000 : 15_000);
  await w.snap('z-step2-live');
  const stamps = await liveStamps(w, 'sugg', desal);
  const outcome = outcomeOf(w, stamps);
  if (outcome === 'answered') {
    const press = await pressIdeas(w, api, 'goal.water', desal);
    const rows = await suggList(w);
    const top = freshOnTopCheck({ id: "Z4 the press's ideas head step 2's list, tagged LIVE", rule: 'K189', rows: rows.map((r) => ({ id: r.title, live: r.live })), fresh: press.map((x) => x.title) });
    w.record({ ...top, pass: verdict(top.pass === true, w.source) });
    const times = [...new Set((await batchRead(w, api, 'sugg.water.desal')).map((x) => x.createdAt))];
    const prepared = times.length === 1 ? w.t('stamp.prepared', { when: formatStampWhen(times[0] as string, w.ctx.lang) }) : null;
    const both = prepared !== null && (stamps ?? []).includes(prepared) && (stamps ?? []).includes(w.t('live.done'));
    w.record({ id: 'Z4 (K101) the stamp line keeps the prepared stamp beside "Live, just now"', rule: 'K101', pass: verdict(both, w.source), expected: [prepared, w.t('live.done')], actual: stamps });
    const state = await liveState(w);
    w.record(spentCheck({ id: 'Z8 (K186) step 2 has no LIVE fresh-ideas button left for Desalination', key: button.key, rowKeys: state.rows, buttonKeys: state.buttons.map((b) => b.key) }));
    if (!stackOnly(w, 'Z4 (K190) six children close the list (the fixture map grows only by a whole prepared batch)')) await sixChildren(w, api, desal, button.key);
  } else if (outcome === 'missed') {
    missJudged(w, "Z15 (W74) step 2's missed press shows the fallback's own prepared stamp", stamps, desal);
    w.record({ id: "Z4 (K190) six children close step 2's list", rule: 'K190', pass: 'not-judged', expected: 'an answered press', actual: stamps, note: 'the press missed: no fresh ideas to add' });
  } else {
    w.record({ id: "Z4 step 2's press answered or missed", rule: 'K190', pass: false, expected: 'an outcome', actual: { ended, stamps } });
  }
  // Esc does not leave the story: the presenter's Run tab jumps to the hall, as the tour's start does.
  await w.openPresenter();
  await w.click('[data-act="ptab"][data-tab="run"]', { settle: 400 });
  await w.click('[data-act="jump"][data-to="hall"]', { settle: 2500 });
  await w.closePresenter();
  return doneReset(w, api, start, 'after section Z', 'z-');
}

/** Z4 (K190), on the stack: the waiting ideas added one row at a time, never Reverse osmosis, until Desalination holds six. */
async function sixChildren(w: Walker, api: KioskApi, desal: string, key: string): Promise<void> {
  const m = w.ctx.manifest;
  const ro = String(rec(m, 'v1.reverse-osmosis', 'title'));
  const goal = String(m.world['goal.water']);
  const map = () => api.get<GraphLike>(`/api/v1/me/maps/${encodeURIComponent(goal)}/graph`);
  const held = (g: GraphLike) => g.edges.filter((e) => e.class === 'hierarchy' && e.sourceConceptId === desal).length;
  for (let guard = 0, n = held(await map()); n < 6 && guard < 12; guard += 1) {
    const rows = await suggList(w);
    const at = rows.findIndex((r) => r.adds > 0 && r.title !== ro);
    if (at < 0) break;
    const nth = rows.slice(0, at).filter((r) => r.adds > 0).length;
    await w.click('[data-act="suggAccept"]:visible, [data-act="freshAccept"]:visible', { nth, settle: 2500 });
    n = held(await map());
  }
  await w.snap('z-six');
  const graph = await map();
  const title = graph.concepts.find((c) => c.conceptId === desal)?.title ?? '';
  w.record({ id: 'Z4 Desalination holds six ideas, Reverse osmosis not among them', rule: 'K190', pass: held(graph) === 6 && !graph.concepts.some((c) => c.title === ro), expected: 6, actual: held(graph) });
  const rows = await suggList(w);
  const addAll = (await w.page.locator('[data-act="accept"]:visible').count()) > 0;
  w.record(fullListCheck({ id: 'Z4 at six every row left is greyed, with no Add and no Add all', rule: 'K190', rows: rows.map((r) => ({ state: r.state, adds: r.adds })), fullText: w.t('kd.sugg.full'), dupText: w.t('kd.sugg.dup'), addAll }));
  const line = spaced(await w.page.locator('.full-skip').first().innerText({ timeout: 3000 }).catch(() => ''));
  const want = w.t('h2.fullSkip', { p: title, c: ro });
  w.record({ id: 'Z4 the card says Next skips step 3', rule: 'K190', pass: line === want, expected: want, actual: line });
  const ros = (await batchRead(w, api, 'sugg.water.desal')).filter((x) => x.title === ro).map((x) => x.status);
  w.record({ id: 'Z4 read back: Reverse osmosis still waits, pending', rule: 'K190', pass: ros.length === 1 && ros[0] === 'pending', expected: ['pending'], actual: ros });
  const state = await liveState(w);
  w.record(spentCheck({ id: 'Z8 (K186) after the adds Desalination still has no LIVE fresh-ideas button', key, rowKeys: state.rows, buttonKeys: state.buttons.map((b) => b.key) }));
  await w.click('#bottom [data-act="next"]', { settle: 4000 });
  await w.snap('z-new-hat');
  const h = spaced(await w.page.locator('#scene h1, #scene h2').first().innerText().catch(() => ''));
  w.record({ id: 'Z4 Next lands on "Same you, new hat"', rule: 'K190', pass: h === w.t('h4.swapTitle'), expected: w.t('h4.swapTitle'), actual: h });
}

/**
 * R: the keys. Since the tour (K173, `tour-nav.ts`) the arrow keys follow Next and Back in every
 * exhibit, and Esc always returns to the hall, an open overlay (the paper popup, W52) closing first.
 * Back first shows the current beat's own view again when a free click moved off it, then the previous
 * beat (ruling a, 21 Oct). Never ArrowRight, Space or PageDown: in Grading Next releases (trap 12).
 */
async function keys(w: Walker, api: KioskApi): Promise<void> {
  const beats = tourMarkers((k, p) => w.t(k, p));
  const markerOf = (id: string) => (beats.find((b) => b.id === id) as { marker: string }).marker;
  if (!(await inHall(w))) await w.press('Escape', 1500);
  const from = w.writes.length;
  // The fixture world has no routes for the dashboard's and grading's reads (L and M are stack only too).
  const cards = w.ctx.target === 'stack' ? ([['comp', 'C1'], ['dash', 'D1'], ['grade', 'G1'], ['maps', 'M1']] as const) : ([['comp', 'C1'], ['maps', 'M1']] as const);
  if (w.ctx.target !== 'stack') stackOnly(w, 'R the dashboard and grading cards');
  for (const [to, first] of cards) {
    await w.click(`[data-act="open"][data-to="${to}"]`, { settle: 3000 });
    w.record({ id: `R a hall card opens ${first}`, rule: 'K173', pass: (await tourMarker(w)) === markerOf(first), expected: markerOf(first), actual: await tourMarker(w) });
    await w.press('Escape', 1500);
    await lands(w, `R Esc from ${first} returns to the hall`);
  }
  await w.press('Escape', 1000);
  await lands(w, 'R a second Esc in the hall stays there');
  // ArrowLeft is Back: from Companions' first beat to the atlas's last.
  await w.click('[data-act="open"][data-to="comp"]', { settle: 3000 });
  await w.press('ArrowLeft', 2500);
  w.record({ id: 'R ArrowLeft on C1 is Back, to M2', rule: 'K173', pass: (await tourMarker(w)) === markerOf('M2'), expected: markerOf('M2'), actual: await tourMarker(w) });
  await w.press('Escape', 1500);
  await lands(w, 'R Esc from M2 returns to the hall');
  // The paper popup (W52): the first Esc closes it and stays in Companions, the second goes to the hall.
  await w.click('[data-act="open"][data-to="comp"]', { settle: 3000 });
  await w.click('[data-act="ability"][data-ab="weak"]', { settle: 2500 });
  await saveGate(w, api);
  await w.click('[data-act="paperOpen"]', { settle: 1500 });
  const pop = await w.page.locator('.paper-pop').count();
  await w.snap('keys-paper-open');
  await w.press('Escape', 1200);
  const after = { pop: await w.page.locator('.paper-pop').count(), hall: await inHall(w), paper: await w.page.locator('.cx-weak__paper').count() };
  w.record({ id: 'R the paper popup: the first Esc closes it and stays in Companions', rule: 'W52', pass: pop === 1 && after.pop === 0 && !after.hall && after.paper > 0, expected: { open: 1, then: { pop: 0, hall: false, paper: 'shown' } }, actual: { open: pop, then: after } });
  await w.press('Escape', 1500);
  await lands(w, 'R the paper popup: the second Esc returns to the hall');
  // The atlas: a drawer open on a free click; Back shows M1's own view (the atlas, no drawer), then the hall.
  await w.click('[data-act="open"][data-to="maps"]', { settle: 3500 });
  await w.click('[data-act="region"][data-id="goal.water"]', { settle: 2500 });
  const used = await w.nodeId('Used water');
  if (!used) throw new Error('no lens node labelled Used water on the water map');
  await w.click(`g.lens-node[data-id="${used}"]`, { settle: 2500 });
  const drawer = await w.page.locator('#panel.open').count();
  await w.press('ArrowLeft', 2500);
  const atlasAgain = { drawer: await w.page.locator('#panel.open').count(), regions: await w.page.locator('[data-act="region"]').count(), marker: await tourMarker(w) };
  w.record({ id: 'R ArrowLeft with a drawer open shows M1 again: the atlas, the drawer closed', rule: 'K173', pass: drawer === 1 && atlasAgain.drawer === 0 && atlasAgain.regions === 3 && atlasAgain.marker === markerOf('M1'), expected: { before: 1, drawer: 0, regions: 3, marker: markerOf('M1') }, actual: { before: drawer, ...atlasAgain } });
  await w.press('ArrowLeft', 2000);
  await lands(w, 'R ArrowLeft on M1 returns to the hall');
  await w.snap('keys-hall');
  w.record({ id: 'R no write from the keys but the visit counts', rule: 'D3', pass: nonVisitWrites(w, from).length === 0, expected: [], actual: nonVisitWrites(w, from) });
}

/**
 * W42 (K170, as K177 amends it): the marked test's Save follows readiness's live.save. On, it is
 * offered (never pressed: a Save embeds on Vertex); off (the internet down is one reason), it is
 * disabled and the panel says so in plain words. The same walk online and offline checks both.
 */
async function saveGate(w: Walker, api: KioskApi): Promise<void> {
  const live = (await api.readiness())['live'] as Record<string, { on?: unknown } | null> | undefined;
  const on = live?.['save']?.on === true;
  const save = w.page.locator('#scene [data-act="weakSave"]');
  const shown = {
    buttons: await save.count(),
    disabled: await save.first().isDisabled({ timeout: 3000 }).catch(() => null),
    says: spaced(await w.page.locator('#scene .cx-weak__saveOff').innerText({ timeout: 1000 }).catch(() => '')),
  };
  const off = spaced(w.t('comp.weakSaveOff'));
  const ok = shown.buttons === 1 && (on ? shown.disabled === false && shown.says === '' : shown.disabled === true && shown.says === off);
  w.record({
    id: `W42 K177 the marked test's Save with live.save ${on ? 'on' : 'off'}`,
    rule: 'K177',
    pass: ok ? (w.source === 'stack' ? true : 'fixture') : false,
    expected: on ? { buttons: 1, disabled: false, says: '' } : { buttons: 1, disabled: true, says: off },
    actual: { liveSave: on, ...shown },
  });
  await w.snap(`weak-save-${on ? 'on' : 'off'}`);
}

/**
 * T: the guided tour (K173, WALK-PLAYBOOK T) on its OWN demo session, after O's reset: Start, the
 * presenter's jump to the hall, then Next alone through the 18 ruled beats (the marker on each, Back on
 * each, Next's box never moving); C4 opens the dose and G3 releases the strong sample, the only
 * writes; Back reviews and never undoes; Back across exhibits; Esc; a card into the middle; the visit
 * counts. No model call anywhere (the walk's LIVE tripwire). Ends with Done: the walk's next section
 * (S) starts from this reset. Returns whether that reset finished.
 */
async function tour(w: Walker, api: KioskApi, start: LoopState | null): Promise<boolean> {
  const m = w.ctx.manifest;
  const beats = tourMarkers((k, p) => w.t(k, p));
  const markerOf = (id: string) => (beats.find((b) => b.id === id) as { marker: string }).marker;
  const next = () => w.click('#bottom [data-act="next"]', { settle: 2500 }).then(() => undefined);
  const back = () => w.click('#bottom [data-act="back"]', { settle: 2500 }).then(() => undefined);
  const pingu = String(rec(m, 'greet.pingu', 'companion_id'));
  w.visit += 1;
  await w.click(`[data-act="start"][data-lang="${w.ctx.lang}"]`, { settle: 3000 });
  await noPrompt(w, 'T');
  await w.openPresenter();
  await w.click('[data-act="ptab"][data-tab="run"]', { settle: 400 });
  await w.click('[data-act="jump"][data-to="hall"]', { settle: 2500 });
  await w.closePresenter();
  await w.pauseIdle();

  // T1: Next alone through the 18 beats.
  w.at('T1');
  const hallMarker = w.t('tour.start', { x: w.t('ex.maps.title') });
  w.record({ id: 'T1 the hall says where Next starts, and has no Back', rule: 'K173', pass: (await tourMarker(w)) === hallMarker && (await w.page.locator('#bottom [data-act="back"]').count()) === 0, expected: hallMarker, actual: await tourMarker(w) });
  const boxes = [{ at: 'hall', ...(await nextBox(w)) }];
  const writesFrom = w.writes.length;
  const wrong: { beat: string; shown: string; back: number }[] = [];
  for (const [i, b] of beats.entries()) {
    if (b.id === 'G3') {
      await credit(w, api, { id: 'K173 T1 G3 the release credits Pingu', companionId: pingu, deltas: [30], screenSel: null, act: next });
    } else if (b.id === 'C4' && w.ctx.target === 'stack') {
      const before = (await api.growth(pingu)).expCumulative;
      await next();
      await w.page.waitForTimeout(2000);
      const delta = (await api.growth(pingu)).expCumulative - before;
      w.record({ id: 'T1 C4 the dose open credits Pingu +2 (the first of the UTC day) or +0', rule: 'K102', pass: delta === 0 || delta === 2, expected: [0, 2], actual: delta });
    } else {
      await next();
    }
    const shown = await tourMarker(w);
    const backs = await w.page.locator('#bottom [data-act="back"]:visible').count();
    if (shown !== b.marker || backs !== 1) wrong.push({ beat: b.id, shown, back: backs });
    boxes.push({ at: b.id, ...(await nextBox(w)) });
    await w.snap(`t1-${String(i + 1).padStart(2, '0')}-${b.id}`);
  }
  w.record({ id: 'T1 every beat shows its marker and a Back', rule: 'K173', pass: wrong.length === 0, expected: beats.map((b) => b.marker), actual: { wrong } });
  w.record(nextBoxCheck({ boxes }));
  if (!stackOnly(w, 'T1 G3 the approve and the release (the fixture world cannot load the grading exhibit)')) {
    const t1 = w.writes.slice(writesFrom);
    const count = (rule: string) => t1.filter((x) => x.rule === rule).length;
    w.record({ id: 'T1 G3 writes one approve and one release, and nothing else changes a record', rule: 'K173', pass: count('grade approve') === 1 && count('results release') === 1 && nonVisitWrites(w, writesFrom).every((x) => /^(grade approve|results release|atom attempt start) /.test(x)), expected: { approve: 1, release: 1 }, actual: nonVisitWrites(w, writesFrom) });
  }

  // T2: Next on E5 opens the end of the tour (W55, focus on Done); Stay in the hall ends it there, Pingu's
  // card at the stage the growth read gives.
  w.at('T2');
  await next();
  const end = await w.page.evaluate(() => ({
    shown: document.querySelector('#ov-tour-end')?.classList.contains('show') === true,
    title: (document.querySelector('#tour-end-title') as HTMLElement | null)?.innerText.trim() ?? null,
    focused: document.activeElement?.getAttribute('data-act') ?? null,
  }));
  await w.snap('t2-tour-end');
  w.record(tourEndCheck({ ...end, expectTitle: w.t('tour.endTitle') }));
  await w.click('#ov-tour-end [data-act="tourEndStay"]', { settle: 2500 });
  await w.snap('t2-hall');
  w.record({ id: 'T2 Stay in the hall ends the tour in the hall', rule: 'W55', pass: await inHall(w), expected: 'the hall', actual: await whereAmI(w) });
  if (w.ctx.target === 'stack') {
    const g = await api.growth(pingu);
    const src = await w.page.locator(`#scene .ex-card img[alt="${g.displayName}"]`).first().getAttribute('src').catch(() => null);
    const stage = Number(/-stage-(\d+)\.png$/.exec(src ?? '')?.[1] ?? NaN);
    w.record({ id: "T2 the hall's Companions card shows Pingu at the growth read's stage", rule: 'K173', pass: stage === g.growthStage, expected: g.growthStage, actual: { stage, src } });
  }

  // T3: Back reviews, never undoes: from E1 back to G3, G2, G1, each still released; Next to G2, G3.
  // On fixtures a G beat cannot show its view (no grading read), so the tour rightly moves on at once.
  w.at('T3');
  if (!stackOnly(w, 'T3 Back over the released grade')) await reviewByBack(w, markerOf, next, back);
  await toHall(w);

  // T4: Back across exhibits lands on the previous exhibit's last beat; Back on M1 is the hall.
  w.at('T4');
  const t4: { from: string; want: string; got: string }[] = [];
  // From the engine card's E1, Back lands on G3 (on fixtures G3 cannot show its view, but its marker shows).
  for (const [to, want] of [['comp', 'M2'], ['dash', 'C6'], ['engine', 'G3']] as const) {
    await toHall(w);
    await w.click(`[data-act="open"][data-to="${to}"]`, { settle: 3000 });
    await back();
    t4.push({ from: to, want: markerOf(want), got: await tourMarker(w) });
    if (want === 'C6') await w.snap('t4-c6-by-back');
  }
  w.record({ id: 'T4 Back on an exhibit\'s first beat shows the previous exhibit\'s last', rule: 'K173', pass: t4.every((x) => x.got === x.want), expected: t4.map((x) => x.want), actual: t4.map((x) => x.got) });
  await toHall(w);
  await w.click('[data-act="open"][data-to="maps"]', { settle: 3000 });
  await back();
  w.record({ id: 'T4 Back on M1 returns to the hall', rule: 'K173', pass: await inHall(w), expected: 'the hall', actual: await whereAmI(w) });

  // T5: Esc from a beat is the hall; card 3 then Next past D2 goes on to G1, not to card 1.
  w.at('T5');
  await toHall(w);
  await w.click('[data-act="open"][data-to="dash"]', { settle: 3000 });
  await next();
  await next();
  const afterD2 = await tourMarker(w);
  w.record({ id: 'T5 from card 3, Next past D2 is G1', rule: 'K173', pass: afterD2 === markerOf('G1'), expected: markerOf('G1'), actual: afterD2 });
  await w.press('Escape', 1500);
  await lands(w, 'T5 Esc from G1 returns to the hall');

  // T6: the visit counts: a card and a Next entry each count one; Back never does.
  w.at('T6');
  await toHall(w);
  const visits = (from: number) => w.calls.slice(from).filter((c) => c.method === 'POST' && c.path === '/api/v1/kiosk/visits').map((c) => (c.body as { event?: string } | null)?.event ?? '?');
  const v0 = w.calls.length;
  await w.click('[data-act="open"][data-to="comp"]', { settle: 3000 });
  const byCard = visits(v0);
  const v1 = w.calls.length;
  await back();
  const byBack = visits(v1);
  const v2 = w.calls.length;
  await next();
  const byNext = visits(v2);
  w.record({ id: 'T6 a card counts its exhibit, Back counts nothing, Next into another exhibit counts it', rule: 'K173', pass: byCard.join() === 'comp' && byBack.length === 0 && byNext.join() === 'comp', expected: { card: ['comp'], back: [], next: ['comp'] }, actual: { card: byCard, back: byBack, next: byNext } });
  await w.press('Escape', 1500);

  // The tour's demo session ends with Done, so S starts from this reset.
  w.at('T end');
  return doneReset(w, api, start, 'after the tour', 't-');
}

/** T3: from E1 (the engine card), Back to G3, G2, G1, each still released; Next to G2, G3; no write (K42). */
async function reviewByBack(w: Walker, markerOf: (id: string) => string, next: () => Promise<void>, back: () => Promise<void>): Promise<void> {
  const from = w.writes.length;
  await toHall(w);
  await w.click('[data-act="open"][data-to="engine"]', { settle: 3000 });
  const seen: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    await back();
    seen.push(await tourMarker(w));
  }
  await w.snap('t3-g1-released');
  for (let i = 0; i < 2; i += 1) {
    await next();
    seen.push(await tourMarker(w));
  }
  const want = ['G3', 'G2', 'G1', 'G2', 'G3'].map(markerOf);
  w.record({ id: 'T3 Back from E1 lands on G3, G2, G1, and Next returns to G2, G3', rule: 'K173', pass: seen.join('|') === want.join('|'), expected: want, actual: seen });
  w.record({ id: 'T3 Back and Next over a released grade write nothing (no second approve or release)', rule: 'K42', pass: nonVisitWrites(w, from).length === 0, expected: [], actual: nonVisitWrites(w, from) });
}

async function lands(w: Walker, id: string): Promise<void> {
  w.record({ id, rule: 'K173', pass: await inHall(w), expected: 'the hall', actual: await whereAmI(w) });
}

/** Esc until the hall shows: an open overlay (C6's paper popup) takes the first press (K173). */
async function toHall(w: Walker): Promise<void> {
  for (let i = 0; i < 3 && !(await inHall(w)); i += 1) await w.press('Escape', 1500);
  if (!(await inHall(w))) throw new Error(`three Esc presses did not reach the hall: ${await whereAmI(w)}`);
}

/**
 * A credit through the product's growth read (K135, K102): read the Companion before the act,
 * act, then poll until the expected number of new events lands (two events for a win), and check
 * the delta, the events and the screen's number. On fixtures the growth read is static.
 */
async function credit(w: Walker, api: KioskApi, a: { id: string; companionId: string; deltas: number[]; act: () => Promise<void>; screenSel: string | null }): Promise<void> {
  if (w.ctx.target === 'fixtures') {
    await a.act();
    w.record({ id: a.id, rule: a.id.split(' ')[0] as string, pass: 'not-judged', expected: a.deltas, actual: null, note: 'the fixture world has no growth ledger: judged on the stack only' });
    return;
  }
  const before = await api.growth(a.companionId);
  await a.act();
  let after = before;
  let events = await api.growthEvents(a.companionId);
  for (let i = 0; i < 20; i += 1) {
    after = await api.growth(a.companionId);
    events = await api.growthEvents(a.companionId);
    if (events.filter((e) => e.companionId === a.companionId && e.expCumulativeAfter > before.expCumulative).length >= a.deltas.length) break;
    await w.page.waitForTimeout(1000);
  }
  const text = a.screenSel ? await w.page.locator(a.screenSel).innerText().catch(() => '') : '';
  const sum = a.deltas.reduce((s, d) => s + d, 0);
  const shown = creditNumbers(text);
  const screen = a.screenSel === null ? null : shown.includes(sum) ? sum : (shown[0] ?? -1);
  w.record({
    ...creditCheck({ id: a.id, companionId: a.companionId, before, after, events, deltas: a.deltas, screen }),
    note: `screen numbers ${JSON.stringify(shown)}; the Companion named on screen: ${text.includes(after.displayName) ? after.displayName : 'not named'}`,
  });
}

/** K: Companions: the active Companion, its ideas, the quiz win (K135), the dose and its quick check (K102), Nova and Ember. */
async function companions(w: Walker, api: KioskApi): Promise<void> {
  const m = w.ctx.manifest;
  const pingu = String(rec(m, 'greet.pingu', 'companion_id'));
  await w.click('[data-act="open"][data-to="comp"]', { settle: 3000 });
  await w.snap('comp');
  const active = await w.page.locator('[data-act="mate"].on').getAttribute('data-id').catch(() => null);
  w.record({ id: 'Pingu is the active Companion', rule: 'F18', pass: active === pingu, expected: pingu, actual: active });
  await pinguPapers(w, pingu);
  await w.click('[data-act="ability"][data-ab="suggest"]', { settle: 3000 });
  await w.snap('comp-ideas');
  await w.click('[data-act="ability"][data-ab="quiz"]', { settle: 3000 });
  await w.snap('comp-quiz', { stamps: ['set.water.res.r6'] });
  const since = w.writes.length;
  const quizAt = await keyAt(w, { id: 'the Companions quiz', stem: '.q-stem', options: '[data-act="answer"]', keys: await keySource(w).set('set.water.res.r6') });
  await credit(w, api, { id: 'K135 the win', companionId: pingu, deltas: [8, 25], screenSel: '#scene', act: () => w.click('[data-act="answer"]:visible', { nth: quizAt, settle: 5000 }).then(() => undefined) });
  answered(w, since, 'the quiz answer is correct and wins the hex', true);
  await w.snap('comp-quiz-answered');
  await w.page.evaluate(() => {
    const b = document.querySelector('.kd-body');
    if (b) b.scrollTop = b.scrollHeight;
  });
  await w.snap('comp-quiz-verdict');
  // W75: before any press the won quiz's ask is a plain line naming the Companion.
  const ask = await w.page.locator('#scene .sugg-ask').first().innerText({ timeout: 3000 }).catch(() => null);
  w.record(fillCheck({ id: 'W75 the won ask shows its line before a press', rule: 'W75', shown: ask?.trim() ?? null, template: w.t('kd.suggAsk', { name: '\u0000' }) }));
  await wonPress(w, api, pingu);
  if (stackOnly(w, 'the daily dose and its quick check (K102)')) {
    await w.click('[data-act="toHall"]', { settle: 2000 });
    return;
  }
  await w.click('[data-act="ability"][data-ab="dose"]', { settle: 3500 });
  await w.snap('comp-dose', { stamps: ['greet.pingu'] });
  // W89 (K205): the dose's greeting rail says what the greeting starts from (stack only: the fixtures serve no greeting).
  await railWhy(w, 'Pingu');
  await w.click('[data-act="cxDosePlay"]', { settle: 2500 });
  await w.snap('comp-dose-quiz');
  const doseAt = await keyAt(w, { id: 'the dose quick check', stem: '#cxq-stem', options: '[data-act="cxqAnswer"]', keys: doseKeys() });
  const doseSince = w.writes.length;
  await credit(w, api, { id: 'K102 the dose answer', companionId: pingu, deltas: [3], screenSel: '#scene', act: () => w.click('[data-act="cxqAnswer"]:visible', { nth: doseAt, settle: 3000 }).then(() => undefined) });
  const dose = w.lastWrite('atom attempt submit', doseSince);
  w.record({ id: 'the dose quick check answer is correct', rule: 'T4.1 d', pass: (dose?.body as { is_correct?: unknown } | null)?.is_correct === true, expected: { is_correct: true }, actual: dose ? { status: dose.status, body: dose.body } : 'no answer was sent' });
  await w.snap('comp-dose-answered');
  await w.click('[data-act="cxqBack"]', { settle: 800 });
  for (const who of ['nova', 'ember']) {
    await w.click(`[data-act="mate"][data-id="${String(rec(m, `greet.${who}`, 'companion_id'))}"]`, { settle: 3000 });
    await w.snap(`comp-${who}`);
    await oneDocument(w, who === 'nova' ? 'Nova' : 'Ember');
    await w.click('[data-act="ability"][data-ab="suggest"]', { settle: 3000 });
    await w.snap(`comp-${who}-ideas`);
    // K202 (Z17): Ember's lens holds the hawker map: its picked idea and ring inside the frame, every link long enough.
    if (who === 'ember') await ringChecks(w, '#complens', "Ember's lens", await hawkerGraph(w, api));
    // K189 (2): the list shows ideas only, never a link row.
    const kinds = await w.page.$$eval('#scene .sugg-row .sugg-kind', (ks) => ks.map((k) => (k as HTMLElement).innerText.trim()));
    w.record(onlyFromCheck({ id: `K189 ${who}'s ideas list shows ideas only`, rule: 'K189', shown: kinds, allowed: [w.t('kd.kindNew'), w.t('kd.kindOnMap')] }));
    await w.click('[data-act="ability"][data-ab="dose"]', { settle: 3500 });
    await w.snap(`comp-${who}-dose`, { stamps: [`greet.${who}`] });
    await railWhy(w, who === 'nova' ? 'Nova' : 'Ember');
  }
  await w.click('[data-act="toHall"]', { settle: 2000 });
}

/**
 * A multiple-choice pick (K145): a stored position in the question's pinned options, or 'key' for the
 * option the record marks correct. Never a position on screen: the options may be shuffled per learner.
 */
type Pick = number | 'key';

interface PinnedQuestion {
  readonly test_set_question_id: string;
  readonly question_type?: string;
  readonly display_order: number;
  readonly payload_snapshot?: { readonly stem?: string; readonly options?: { option_id: string; label?: string; text?: string; is_correct?: boolean }[] };
}

/** What a take meant to send for each multiple-choice question (rule d's read-back, K145). */
type Intended = Map<string, { readonly optionId: string; readonly text: string; readonly correct: boolean; readonly moved: boolean }>;

const spaced = (s: string | null | undefined): string => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Takes one bank's assessment. Each question on screen is found in the test set's pinned copy by its
 * stem (so neither a question nor an option order matters); the k-th multiple-choice question of the
 * stored order takes picks[k], pressed by its text; the open question takes `open`.
 */
async function takeBank(w: Walker, api: KioskApi, bank: string, picks: readonly Pick[], open?: string): Promise<Intended> {
  const set = await api.get<{ questions?: PinnedQuestion[] }>(`/api/v1/test-sets/${encodeURIComponent(String(rec(w.ctx.manifest, `bank.${bank}`, 'test_set_id')))}`);
  const stored = [...(set.questions ?? [])].sort((a, b) => a.display_order - b.display_order);
  const mcqs = stored.filter((q) => q.question_type === 'mcq');
  if (mcqs.length !== picks.length) throw new Error(`${bank}: the test set has ${mcqs.length} multiple-choice questions, the walk picks ${picks.length}`);
  // The dashboard keys a bank by its manifest choice (bank.<name>), and reopens on the last result.
  const card = `[data-act="dbBank"][data-id="bank.${bank}"]`;
  if ((await w.page.locator(card).count()) === 0 && (await w.page.locator('[data-act="dbxList"]').count()) > 0) await w.click('[data-act="dbxList"]', { settle: 1000 });
  await w.click(card, { settle: 2500 });
  await w.snap(`dash-${bank}`);
  const created = w.writes.length;
  await w.click('[data-act="dbxTake"]', { settle: 4000 });
  // The take creates the visitor's own assessment: its window is that record's time, shown on the take (K101).
  let window: string[] = [];
  try {
    window = windowTimes(w.lastWrite('assessment create', created)?.body);
  } catch (e) {
    w.fail(`${bank}: ${String(e).split('\n')[0]}`);
  }
  await w.snap(`dash-${bank}-q1`, { extraTimes: window });
  const intended: Intended = new Map();
  for (let i = 0; i < stored.length; i += 1) {
    const screen = await w.page.evaluate(() => ({
      stem: document.querySelector('#scene .dbx-stem')?.textContent ?? '',
      open: document.querySelector('#scene textarea') !== null,
      options: [...document.querySelectorAll('#scene [data-act="dbxPick"]')].map((b) => [...b.children].filter((c) => !c.classList.contains('mk')).map((c) => c.textContent ?? '').join('')),
    }));
    if (screen.open) {
      if (open === undefined) throw new Error(`${bank} question ${i + 1}: an open question the walk has no answer for`);
      await w.page.locator('#scene textarea').first().fill(open);
      await w.snap(`dash-${bank}-open-answer`, { extraTimes: window });
    } else {
      const q = mcqs.find((x) => spaced(x.payload_snapshot?.stem) === spaced(screen.stem));
      if (!q) throw new Error(`${bank} question ${i + 1}: "${spaced(screen.stem).slice(0, 80)}" is none of the test set's multiple-choice stems`);
      const k = mcqs.indexOf(q);
      const p = pickOption({ id: `${bank} question ${i + 1}`, options: q.payload_snapshot?.options ?? [], shown: screen.options, pick: picks[k] as Pick });
      await w.click('[data-act="dbxPick"]', { nth: p.index, settle: 800 });
      const at = picks[k] === 'key' ? (q.payload_snapshot?.options ?? []).findIndex((o) => o.option_id === p.optionId) : (picks[k] as number);
      intended.set(q.test_set_question_id, { optionId: p.optionId, text: p.text, correct: p.correct, moved: p.index !== at });
    }
    if (i < stored.length - 1) await w.click('[data-act="dbxNext"]', { settle: 2000 });
  }
  const moved = [...intended.values()].filter((x) => x.moved).length;
  w.note(`${bank}: picked ${[...intended.values()].map((x) => `"${x.text}"${x.correct ? ' (key)' : ''}`).join(', ')}; ${moved} of ${intended.size} shown away from their stored place (K145's shuffle)`);
  await w.click('[data-act="dbxSubmit"]', { settle: 4000 });
  await w.snap(`dash-${bank}-submitted`, { extraTimes: window });
  return intended;
}

/** L: the dashboard: the water assessment, then City in Nature and Hawker culture (K79), each with its open answer held (K57). */
async function dashboard(w: Walker, api: KioskApi): Promise<void> {
  if (stackOnly(w, 'the dashboard (K57, K79)')) return;
  await w.click('[data-act="open"][data-to="dash"]', { settle: 3500 });
  await w.snap('dash');
  const grading = () => w.calls.filter((c) => c.live === 'grade').length;
  const before = grading();
  // The water bank's two keys (the orchestrator's picks on the 18 Oct snapshot, stored positions 1 and 2).
  const water = await takeBank(w, api, 'water', ['key', 'key'], 'Singapore invests in NEWater and desalination so it does not depend only on rain and on Johor, whose agreement ends in 2061; both use a lot of energy.');
  w.record({ id: 'K57 the open answer is held', rule: 'K57', pass: grading() === before, expected: 'no grading request', actual: grading() - before });
  await readSubmission(w, api, 'water', water);
  await w.click('[data-act="dbxToGrade"]', { settle: 3500 });
  await w.snap('grade-from-dash');
  await w.click('[data-act="toHall"]', { settle: 2000 });
  await w.click('[data-act="open"][data-to="dash"]', { settle: 3500 });
  // Since W27 (dfddb97c1) City in Nature and Hawker culture take water's mix: two multiple-choice
  // questions and one open question. One key and one other option each, so rule marking shows both
  // ways (K79); each open answer is held as water's is (K57), so no AI grade is asked for, online or not.
  const banks = [
    ['nature', ['key', 0], 'The street with rain trees feels cooler because their wide crowns shade the road and the water evaporating from their leaves cools the air, while the bare street soaks up the sun. Trees also clean the air and give birds and insects a home.'],
    ['hawker', [0, 'key'], 'The tea is pulled to cool it and to mix the tea and milk into a frothy top; the long stream between mugs held far apart shows the hawker\'s control. Skills like this take years of practice and pass from hawker to hawker, which keeps hawker culture alive.'],
  ] as const;
  for (const [bank, picks, open] of banks) {
    const held = grading();
    const intended = await takeBank(w, api, bank, [...picks], open);
    w.record({ id: `K57 ${bank}: the open answer is held`, rule: 'K57', pass: grading() === held, expected: 'no grading request', actual: grading() - held });
    // With an open question in the bank (every bank since W27) the screen explains both ways an
    // answer is marked (dbx.narrTitle, dbx.narrMcqH); "How your answers were marked" is the title of
    // a multiple-choice-only bank.
    const marks = w.ctx.lang === 'en' ? ['Two ways to mark an answer', 'Multiple choice: rules, no AI'] : null;
    const text = await w.page.locator('#scene').innerText();
    const missing = marks ? marks.filter((m) => !text.includes(m)) : [];
    w.record({ id: `K79 ${bank} marked by rules`, rule: 'K79', pass: marks ? missing.length === 0 : 'not-judged', expected: marks ?? 'the en walk judges the title', actual: marks ? { missing, text: text.slice(0, 300) } : text.slice(0, 600) });
    await readSubmission(w, api, bank, intended);
    await w.click('[data-act="dbxList"]', { settle: 1000 });
  }
  await w.click('[data-act="toHall"]', { settle: 2000 });
}

/**
 * Reads the submission the screen just submitted back through the instructor's grading read (rule
 * d; the learner's own read carries no marks before a release). Each multiple-choice row stores the
 * choice the screen's save sent and is marked by rules: its points are the question's when correct,
 * else 0 (K79). Each bank's open answer is held (K57; nature and hawker since W27): no AI grade on its row.
 */
async function readSubmission(w: Walker, api: KioskApi, bank: string, intended: Intended): Promise<void> {
  const submit = [...w.calls].reverse().find((c) => c.rule === 'submission submit');
  const ids = submit?.path.match(/^\/api\/v1\/me\/assessments\/([^/]+)\/submissions\/([^/]+)\/submit$/);
  if (!ids) {
    w.fail(`${bank}: no submission submit was seen, so nothing could be read back`);
    return;
  }
  const sent = new Map<string, string>();
  for (const c of w.calls) {
    if (c.rule !== 'submission save' || !c.path.endsWith(`/submissions/${ids[2]}`)) continue;
    for (const a of ((c.body as { answers?: { test_set_question_id?: string; mcq_choice_id?: string }[] } | null)?.answers ?? [])) {
      if (a.test_set_question_id && a.mcq_choice_id) sent.set(a.test_set_question_id, a.mcq_choice_id);
    }
  }
  const g = await api.get<{ state?: string; questions?: (GradedRow & { test_set_question_id: string; correct?: boolean; learner_answer?: { mcq_choice_id?: string }; oe_graded_at?: string })[] }>(
    `/api/v1/assessments/${ids[1]}/submissions/${ids[2]}/grading`,
  );
  const rows = g.questions ?? [];
  const mcq = rows.filter((r) => r.question_type === 'mcq');
  const bad = mcq
    .filter((r) => r.points_earned !== (r.correct === true ? r.points_possible : 0) || r.learner_answer?.mcq_choice_id !== sent.get(r.test_set_question_id))
    .map((r) => ({ q: r.test_set_question_id, correct: r.correct, points: `${r.points_earned}/${r.points_possible}`, stored: r.learner_answer?.mcq_choice_id, sent: sent.get(r.test_set_question_id) }));
  w.record({ id: `${bank}: each choice stored as sent and marked by rules`, rule: 'K79', pass: mcq.length > 0 && bad.length === 0, expected: 'points = possible when correct, else 0; stored choice = sent', actual: { state: g.state, mcq: mcq.length, bad } });
  // K145: the press landed on the option the walk meant (by text, whatever the shuffle), and delivery
  // marks it as the pinned record does.
  const off = [...intended.entries()]
    .filter(([q, x]) => sent.get(q) !== x.optionId || mcq.find((r) => r.test_set_question_id === q)?.correct !== x.correct)
    .map(([q, x]) => ({ q, meant: x.optionId, text: x.text, sent: sent.get(q), keyed: x.correct, marked: mcq.find((r) => r.test_set_question_id === q)?.correct }));
  w.record({ id: `${bank}: each pick is the record's option, marked as the record keys it`, rule: 'K145', pass: intended.size > 0 && intended.size === mcq.length && off.length === 0, expected: 'sent = the option meant; correct = its is_correct', actual: { picks: intended.size, mcq: mcq.length, off } });
  const oe = rows.filter((r) => r.question_type === 'oe');
  const graded = oe.filter((r) => r.ai_points_earned !== undefined || r.oe_graded_at !== undefined);
  w.record({ id: `${bank}: the open answer is held, no AI grade`, rule: 'K57', pass: oe.length === 1 && graded.length === 0, expected: 'one open answer, not graded', actual: { state: g.state, oe: oe.length, graded: graded.length } });
}

interface GradedRow {
  readonly question_id?: string;
  readonly question_type: string;
  readonly points_earned: number;
  readonly points_possible: number;
  readonly ai_points_earned?: number;
  readonly rubric?: { criterion_id: string; weight: number }[];
  readonly criterion_scores?: { criterion_id: string; title?: string; score: number; max_score: number }[];
}

/** The sample's open answer, from the instructor's grading read. */
async function oeRow(w: Walker, api: KioskApi, key: string): Promise<GradedRow> {
  const m = w.ctx.manifest;
  const read = await api.get<{ questions?: GradedRow[] }>(
    `/api/v1/assessments/${String(rec(m, key, 'assessment_id'))}/submissions/${String(rec(m, key, 'submission_id'))}/grading`,
  );
  const q = String(rec(m, key, 'question_id'));
  const row = (read.questions ?? []).find((r) => r.question_type === 'oe' && (r.question_id === undefined || r.question_id === q));
  if (!row?.rubric || !row.criterion_scores) throw new Error(`${key}: the grading read has no open answer with its rubric and criterion scores`);
  return row;
}

/** The criterion values the review shows now, mapped to criterion ids by their titles. */
async function shownScores(w: Walker, row: GradedRow): Promise<{ criterion_id: string; score: number; max_score: number }[]> {
  const rows = await w.page.$$eval('#scene .crow', (els) =>
    els.map((e) => ({ title: (e.querySelector('[lang="en"]')?.textContent ?? '').trim(), val: (e.querySelector('.val')?.textContent ?? '').trim() })),
  );
  return rows.map((r) => {
    const c = row.criterion_scores?.find((x) => (x.title ?? '').trim() === r.title);
    const v = /^([\d.]+)\/([\d.]+)$/.exec(r.val);
    if (!c || !v) throw new Error(`the review row "${r.title}" ${r.val} matches no criterion of the read`);
    return { criterion_id: c.criterion_id, score: Number(v[1]), max_score: Number(v[2]) };
  });
}

/**
 * M: grading. W1's rule (the crew's scorer, checks.mjs compositePoints): the AI's total follows its
 * rubric; the strong sample released unchanged stores exactly the AI's total; the weak one with one
 * stepper moved stores the composite of what the review shows, each read back after the release.
 */
async function grading(w: Walker, api: KioskApi): Promise<void> {
  if (stackOnly(w, 'grading (W1)')) return;
  const m = w.ctx.manifest;
  await w.click('[data-act="open"][data-to="grade"]', { settle: 3500 });
  await w.snap('grade');
  for (const s of ['strong', 'weak'] as const) {
    const key = `sample.${s}`;
    await w.click(`[data-act="sample"][data-s="${s}"]`, { settle: 3000 });
    await w.snap(`grade-${s}`);
    await w.click('[data-act="submitGrade"]', { settle: 3500 });
    await w.snap(`grade-${s}-graded`, { stamps: [key] });
    const before = await oeRow(w, api, key);
    const ai = before.ai_points_earned ?? before.points_earned;
    const rubric = before.rubric ?? [];
    const aiScores = before.criterion_scores ?? [];
    w.record({ ...releasedFollowsRubric({ id: `${s}: the AI total follows its rubric`, rubric, scores: aiScores, possible: before.points_possible, released: ai }) });
    w.record({ id: `W1 ${s}: the manifest's AI total is the record's`, rule: 'W1', pass: ai === Number(rec(m, key, 'ai_points_earned')), expected: rec(m, key, 'ai_points_earned'), actual: ai });
    if (s === 'weak') {
      await w.click('[data-act="adj"][data-c="0"][data-d="1"]', { settle: 800 });
      await w.snap('grade-weak-stepped');
    }
    const shown = await shownScores(w, before);
    // A release credits the active Companion production's submission_graded +30 (orchestrator, pass 2).
    await credit(w, api, { id: `the ${s} release credits the active Companion`, companionId: String(rec(m, 'greet.pingu', 'companion_id')), deltas: [30], screenSel: null, act: () => w.click('[data-act="release"]', { settle: 4000 }).then(() => undefined) });
    await w.snap(`grade-${s}-released`);
    const after = await oeRow(w, api, key);
    if (s === 'strong') w.record({ ...releasedEqualsAi({ aiPoints: ai, released: after.points_earned, possible: after.points_possible }), id: 'W1 strong released unchanged' });
    w.record({ ...releasedFollowsRubric({ id: `${s} released`, rubric, scores: shown, possible: after.points_possible, released: after.points_earned }), actual: { stored: after.points_earned, shown } });
  }
  await w.click('[data-act="toHall"]', { settle: 2000 });
}

const K112 = {
  en: ['Putting back the prepared maps, questions and Companions', 'Every visitor starts from the same prepared start.'],
  zh: ['恢复准备好的地图、题目和学习伙伴', '每位访客都从同一个准备好的起点开始。'],
};

/**
 * The start state every visitor gets (K101): each Companion's EXP, the mana, the streak and the six
 * story ideas, read before the walk writes and after every reset (checks.mjs loopStateCheck).
 */
async function startState(w: Walker, api: KioskApi): Promise<LoopState> {
  const m = w.ctx.manifest;
  const exp: Record<string, number> = {};
  for (const who of ['pingu', 'nova', 'ember']) exp[who] = (await api.growth(String(rec(m, `greet.${who}`, 'companion_id')))).expCumulative;
  const ids = rec(m, 'sugg.water.desal', 'suggestion_ids') as string[];
  const rows = await batchRead(w, api, 'sugg.water.desal');
  if (rows.length !== ids.length) throw new Error(`[walk] the suggestions read holds ${rows.length} of the batch's ${ids.length} ideas`);
  return { exp, mana: await api.mana(), streak: await api.streak(), utcDay: new Date().toISOString().slice(0, 10), ideas: Object.fromEntries(rows.map((r) => [r.suggestionId, r.status])) };
}

/** The reset card (K112): its four steps and lines, then it leaves (limit 180 s). */
async function resetCard(w: Walker, label: string, shot: string): Promise<void> {
  const card = await w.page.locator('#resetcard').innerText().catch(() => '');
  await w.snap(`${shot}reset-card`);
  const steps = await w.page.locator('#resetcard .rc-steps li').count();
  w.record({ id: label === 'after Done' ? 'K112 the reset card' : `K112 the reset card, ${label}`, rule: 'K112', pass: steps === 4 && K112[w.ctx.lang].every((l) => card.includes(l)), expected: { steps: 4, lines: K112[w.ctx.lang] }, actual: { steps, card } });
  await expect(w.page.locator('#resetcard')).not.toHaveClass(/show/, { timeout: 180_000 });
}

/**
 * The playbook's S5 read-back "no LIVE question set and no question job made since the reset", by the
 * oracle's route. The same count since 2000 must see the golden run's question jobs, or a 0 proves
 * nothing (a positive control).
 */
function census(w: Walker, label: string, since: string): void {
  const pg = kioskPostgres();
  const count = (what: 'fresh sets' | 'question jobs', t: string) => {
    const c = censusCommand({ container: pg, what, since: t });
    return censusCount(execFileSync('docker', c.args, { input: c.sql, encoding: 'utf8' }), `${label} ${what}`);
  };
  const made = { fresh: count('fresh sets', since), jobs: count('question jobs', since) };
  const ever = { fresh: count('fresh sets', '2000-01-01T00:00:00Z'), jobs: count('question jobs', '2000-01-01T00:00:00Z') };
  w.record({ id: `${label}: no LIVE question set and no question job made since the reset`, rule: 'T4.1 c', pass: made.fresh === 0 && made.jobs === 0 && ever.jobs > 0, expected: { since, made: { fresh: 0, jobs: 0 }, ever: 'jobs > 0 (the census sees rows)' }, actual: { made, ever } });
}

/**
 * The read-backs after a reset (O, S5, S7, S8): readiness ready from this reset with the marker
 * matching; on the stack also the K151 flag (cleared, or set again when the story already began,
 * as Start fresh does), the start state back value for value, and nothing generated since. Returns
 * whether this reset finished done.
 */
async function afterReset(w: Walker, api: KioskApi, start: LoopState | null, pressedAt: number, label: string, begun = false): Promise<boolean> {
  const r = begun ? await readinessAfterStart(api) : await api.readiness();
  w.record(resetReadback({ id: `${label}: ready, marker match, from this reset`, readiness: r, pressedAt, source: w.source }));
  const last = (r['last_reset'] ?? null) as LastReset | null;
  const done = typeof last?.finished_at === 'string' && Date.parse(last.finished_at) >= pressedAt - 2000 && last.outcome === 'done';
  if (!start) {
    w.record({ id: `${label}: the start state is back`, rule: 'T4.1 c', pass: 'not-judged', expected: 'the start state', actual: null, note: 'the fixture world has no wallet or composed dashboard read' });
    return done;
  }
  w.record(sinceResetCheck({ id: begun ? `${label}: the story it began counts as a demo session` : `${label}: no demo session since this reset`, readiness: r, expect: begun }));
  const now = await startState(w, api).catch((e: unknown) => String(e).split('\n')[0] as string);
  w.record(typeof now === 'string' ? { id: `${label}: the start state is back`, rule: 'T4.1 c', pass: false, expected: start, actual: now } : loopStateCheck({ id: `${label}: the start state is back, value for value`, start, now }));
  if (typeof last?.finished_at === 'string') census(w, label, last.finished_at);
  else w.fail(`${label}: readiness has no last_reset.finished_at to count from`);
  return done;
}

/**
 * O (and S8): Done from the hall: the reset card's four lines (K112), the reset to its end, then the
 * read-backs from a reset that finished after this Done (an older one proves nothing). Returns
 * whether such a reset finished.
 */
async function doneReset(w: Walker, api: KioskApi, start: LoopState | null, label: string, shot: string): Promise<boolean> {
  // Done is the footer's (trap 3); the presenter's Run tab has a "Reset everything now" of its own.
  const done = '#bottom [data-act="resetAll"]';
  if ((await w.page.locator(`${done}:visible`).count()) === 0) await w.click('[data-act="toHall"]', { settle: 2000 });
  const pressed = Date.now();
  await w.click(done, { settle: 1500 });
  await resetCard(w, label, shot);
  await w.snap(`${shot}after-reset`);
  return afterReset(w, api, start, pressed, label);
}

/**
 * K151's prompt as a visitor sees it: each button drawn (a box, no hidden or transparent ancestor, not
 * in a closed overlay), the lens drawn, the reset card up. Playwright's :visible counts an opacity 0
 * element as visible, and offsetParent is null for a fixed one, so neither is used.
 */
async function promptState(w: Walker): Promise<{ fresh: boolean; keep: boolean; lens: number; card: boolean }> {
  return w.page.evaluate(() => {
    const seen = (sel: string): boolean =>
      [...document.querySelectorAll(sel)].some((el) => {
        if (el.getClientRects().length === 0 || el.closest('.overlay:not(.show)')) return false;
        for (let e: Element | null = el; e; e = e.parentElement) {
          const cs = getComputedStyle(e);
          if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
        }
        return true;
      });
    return { fresh: seen('[data-act="freshStart"]'), keep: seen('[data-act="keepSession"]'), lens: document.querySelectorAll('g.lens-node').length, card: document.querySelector('#resetcard')?.classList.contains('show') === true };
  });
}

/** K151's prompt: both its buttons shown within 8 s of Start. */
async function promptShows(w: Walker): Promise<boolean> {
  for (let i = 0; i < 16; i += 1) {
    const p = await promptState(w);
    if (p.fresh && p.keep) return true;
    await w.page.waitForTimeout(500);
  }
  return false;
}

/** After a reset, Start asks nothing (K151's negative control) and opens step 1. */
async function noPrompt(w: Walker, label: string): Promise<void> {
  const p = await promptState(w);
  w.record({ id: `K151 ${label} Start after a reset asks nothing and opens step 1`, rule: 'K151', pass: !p.fresh && !p.keep && p.lens > 0, expected: { prompt: false, lens: 'drawn' }, actual: p });
}

/** Readiness once kiosk-web has recorded its start (it posts after asking, K151): polled for up to 8 s. */
async function readinessAfterStart(api: KioskApi): Promise<Record<string, unknown>> {
  let r = await api.readiness();
  for (let i = 0; i < 8 && r['session_started_since_reset'] !== true; i += 1) {
    await new Promise((ok) => setTimeout(ok, 1000));
    r = await api.readiness();
  }
  return r;
}

/** Step 1 on a fresh start (K139): only Desalination glows. */
async function glowsAlone(w: Walker, label: string): Promise<void> {
  const glowIds = await w.page.$$eval('g.lens-node', (nodes) => nodes.filter((n) => n.querySelector('path.lens-glow')).map((n) => n.getAttribute('data-id') ?? ''));
  w.record({ ...glowCheck({ glowIds, expectId: String(rec(w.ctx.manifest, 'sugg.water.desal', 'focal_concept_id')) }), id: `K139 ${label} only Desalination glows` });
}

/** Step 2 shows Desalination's six ideas after a click on it: a new visitor can play the story. */
async function reachesStepTwo(w: Walker, label: string, shot: string): Promise<void> {
  const m = w.ctx.manifest;
  await w.click(`g.lens-node[data-id="${String(rec(m, 'sugg.water.desal', 'focal_concept_id'))}"]`, { settle: 2500 });
  const a = await w.snap(shot);
  const titles = rec(m, 'sugg.water.desal', 'titles') as string[];
  const missing = titles.filter((t) => !a.sceneText.includes(t));
  w.record({ id: `${label} a click on Desalination shows its six ideas`, rule: 'K139', pass: missing.length === 0, expected: titles, actual: { missing } });
}

/** The presenter's idle wait (K143): pick it on the Run tab and read every option's aria-pressed back. */
async function setIdle(w: Walker, minutes: 2 | 8): Promise<void> {
  await w.openPresenter();
  await w.click('[data-act="ptab"][data-tab="run"]', { settle: 400 });
  await w.click(`[data-act="idleMinutes"][data-min="${minutes}"]`, { settle: 400 });
  const buttons = await w.page.$$eval('[data-act="idleMinutes"]', (bs) => bs.map((b) => ({ min: b.getAttribute('data-min'), pressed: b.getAttribute('aria-pressed') })));
  w.record(idleSettingCheck({ buttons, minutes }));
}

/**
 * K149 across visits: the option order this visit showed a question in, against every earlier visit
 * that showed it and the serve door's own order (read from its answer at or after `servedFrom`).
 */
function visitOrder(w: Walker, servedFrom: number): void {
  const id = `K149 visit ${w.visit} draws its own option order`;
  try {
    const now = w.orders[w.orders.length - 1];
    if (!now || now.visit !== w.visit) throw new Error('no option order was recorded in this visit');
    const earlier = w.orders.filter((o) => o.stem === now.stem && o.visit < now.visit);
    if (earlier.length === 0) throw new Error(`no earlier visit showed "${now.stem.slice(0, 60)}"`);
    const body = [...w.served.slice(servedFrom)].reverse().find((x) => serveDoorReady(x.body))?.body;
    if (body === undefined) throw new Error("no ready serve door answer for this visit's question");
    w.record(visitOrderCheck({ id, served: servedOrder({ body, stem: now.stem, id }), visits: [...earlier.map((o) => o.shown), now.shown], source: w.source }));
  } catch (e) {
    w.record({ id, rule: 'K149', pass: false, expected: 'two visits of one question to compare', actual: String(e).split('\n')[0] });
  }
}

/**
 * S: the reset loop for every new visitor (WALK-PLAYBOOK section S; the owner, 19 Oct; K151, K143,
 * K149), the walk's last section, on the stack only. However the last demo session ended (Done, a
 * reload then Continue or Start fresh, the idle reset, Done again), the next visitor gets the same
 * start state, read back value for value, and a step 1 that plays. Returns whether its last reset
 * finished, so the walk never leaves the stack changed.
 */
async function resetLoop(w: Walker, api: KioskApi, start: LoopState | null): Promise<boolean> {
  if (!start) throw new Error('the loop needs the start state read before the walk wrote anything');
  const m = w.ctx.manifest;
  const startBtn = `[data-act="start"][data-lang="${w.ctx.lang}"]`;
  const accepted = async (label: string) => {
    const left = (await batchRead(w, api, 'sugg.water.desal')).filter((x) => x.status !== 'accepted');
    w.record({ id: `${label}: the six ideas read accepted`, rule: 'T4.1 d', pass: left.length === 0, expected: 'every idea accepted', actual: left.map((x) => `${x.title}: ${x.status}`) });
  };

  // S1: the next visitor, after the last reset (the tour's Done, or O's): Start asks nothing; only Desalination glows, with four face-down ideas.
  w.at('S1');
  w.visit += 1;
  const r0 = await api.readiness();
  const o4 = (r0['last_reset'] ?? null) as LastReset | null;
  w.record(sinceResetCheck({ id: 'S1 before Start: no demo session since the reset', readiness: r0, expect: false }));
  await w.click(startBtn, { settle: 3000 });
  await noPrompt(w, 'S1');
  await w.pauseIdle();
  await w.snap('s1-step1');
  await glowsAlone(w, 'S1');
  const ghosts = await w.page.$$eval('g.lens-fog-ghost', (gs) => gs.map((g) => (g.getAttribute('data-testid') ?? '').replace(/^lens-fog-ghost-/, '')));
  // W48 (K174): a ghost that would touch an idea is left out. With K202's spacing (W86) all six of the
  // batch's face-down ideas clear every idea on Four National Taps, so six show, in its suggestion_ids
  // order (hook-story.ts fogGhosts keeps the batch's order; the lens fills its clear slots in that order).
  w.record({ ...ghostCheck({ shownIds: ghosts, expectIds: rec(m, 'sugg.water.desal', 'suggestion_ids') as string[], shows: 6 }), id: 'K139 S1 the six face-down ideas' });
  const onMap: string[] = [];
  for (const t of rec(m, 'sugg.water.desal', 'titles') as string[]) if (await w.nodeId(t)) onMap.push(t);
  w.record({ id: 'S1 none of the six ideas is on the map yet', rule: 'K139', pass: onMap.length === 0, expected: [], actual: onMap });
  w.record(sinceResetCheck({ id: 'S1 after Start: the conductor knows a demo session started', readiness: await readinessAfterStart(api), expect: true }));

  // S2: this visit changes the stack (Add all), then answers step 3's question: its options in this
  // visit's own order (K149), the answer graded by option id.
  w.at('S2');
  await reachesStepTwo(w, 'S2', 's2-step2');
  await w.click('[data-act="accept"]', { settle: 3500 });
  await accepted('S2');
  const node = await w.nodeId(String(rec(m, 'v1.reverse-osmosis', 'title')));
  if (!node) throw new Error('no lens node for the reverse osmosis idea after the accept');
  const servedFrom = w.served.length;
  await w.click(`g.lens-node[data-id="${node}"]`, { settle: 3000 });
  await w.snap('s2-question', { stamps: ['v1.reverse-osmosis'] });
  const since = w.writes.length;
  const at = await keyAt(w, { id: 'S2 step 3', stem: '.q-stem', options: '[data-act="answer"]', keys: await keySource(w).set('v1.reverse-osmosis') });
  visitOrder(w, servedFrom);
  await w.click('[data-act="answer"]:visible', { nth: at, settle: 3000 });
  answered(w, since, 'S2 the step 3 answer, pressed by its text, is graded correct', false);

  // S3: a browser reload is not a reset: Start now asks (K151), and nothing reset.
  w.at('S3');
  await w.page.goto('/', { waitUntil: 'networkidle' });
  await w.page.waitForTimeout(1500);
  await w.click(startBtn, { settle: 1500 });
  const asked = await promptShows(w);
  await w.snap('s3-prompt');
  w.record({ id: 'K151 S3 after a reload Start asks: Start fresh or Continue', rule: 'K151', pass: asked, expected: 'freshStart and keepSession shown', actual: asked ? 'shown' : 'no prompt' });
  if (!asked) throw new Error("K151's prompt did not show after a reload");
  w.record(lastResetSame({ id: 'S3 a reload runs no reset', before: o4, readiness: await api.readiness() }));

  // S4: Continue keeps the changed stack: the story, no reset card, the prompt gone, nothing reset.
  w.at('S4');
  await w.click('[data-act="keepSession"]', { settle: 3000 });
  await w.snap('s4-continue');
  const s4 = await promptState(w);
  w.record({ id: 'K151 S4 Continue opens the story on the changed stack, no reset card, the prompt gone', rule: 'K151', pass: !s4.fresh && !s4.keep && !s4.card && s4.lens > 0, expected: { prompt: false, card: false, lens: 'drawn' }, actual: s4 });
  w.record(lastResetSame({ id: 'S4 Continue runs no reset', before: o4, readiness: await api.readiness() }));
  await accepted('S4 Continue kept the change');
  w.note('S4: "the prompt does not come back in this session" is not walked: no way back to Start inside a session without ending it');

  // S5: another reload, then Start fresh: the reset (K112), then straight into the story (web
  // 0d5352db9: the visitor pressed Start), on the start state, read back value for value.
  w.at('S5');
  await w.page.goto('/', { waitUntil: 'networkidle' });
  await w.page.waitForTimeout(1500);
  await w.click(startBtn, { settle: 1500 });
  const again = await promptShows(w);
  w.record({ id: 'K151 S5 the next reload asks again', rule: 'K151', pass: again, expected: 'freshStart and keepSession shown', actual: again ? 'shown' : 'no prompt' });
  if (!again) throw new Error("K151's prompt did not show after the second reload");
  const fresh = Date.now();
  await w.click('[data-act="freshStart"]', { settle: 1500 });
  await resetCard(w, 'S5 Start fresh', 's5-');
  w.visit += 1;
  // The build shows the start screen for about 4 s before the story mounts (W16): wait up to 8 s.
  const cardGone = Date.now();
  const mounted = await w.page.locator('g.lens-node').first().waitFor({ state: 'attached', timeout: 8000 }).then(() => true, () => false);
  w.note(`S5: after the card left, the story ${mounted ? `mounted in ${((Date.now() - cardGone) / 1000).toFixed(1)} s` : 'did not mount within 8 s'}`);
  await w.page.waitForTimeout(1000);
  await noPrompt(w, 'S5 Start fresh');
  if (!(await afterReset(w, api, start, fresh, 'S5 Start fresh', true))) throw new Error('Start fresh did not finish a reset');

  // S6: the visitor Start fresh let in: Desalination glows alone and plays (no Add).
  w.at('S6');
  await w.snap('s6-step1');
  await glowsAlone(w, 'S6');
  await reachesStepTwo(w, 'S6', 's6-step2');

  // S7: the idle loop at the shortest wait (K143): touch nothing; "Still there?", its countdown, the reset.
  w.at('S7');
  await setIdle(w, 2);
  const label = (await w.page.locator('[data-act="pauseIdle"]').innerText()).trim();
  if (label === w.t('presenter.resumeIdle')) await w.click('[data-act="pauseIdle"]', { settle: 400 });
  const running = (await w.page.locator('[data-act="pauseIdle"]').innerText()).trim();
  w.record({ id: 'S7 the idle timer runs', rule: 'K143', pass: running === w.t('presenter.pauseIdle'), expected: w.t('presenter.pauseIdle'), actual: running });
  await w.closePresenter();
  // From here no click, key or pointer move until the reset card: any of them is input (K143).
  const quiet = Date.now();
  const warned = await w.page.locator('#ov-idle.show').waitFor({ state: 'visible', timeout: 150_000 }).then(() => true, () => false);
  const warnedAt = (Date.now() - quiet) / 1000;
  await w.snap('s7-still-there', { still: true });
  w.record({ id: 'K143 S7 "Still there?" after the 2 minutes set', rule: 'K143', pass: warned && warnedAt >= 118 && warnedAt <= 135, expected: 'about 120 s of no input', actual: { warned, after_s: Math.round(warnedAt) } });
  const carded = await w.page.locator('#resetcard.show').waitFor({ state: 'visible', timeout: 40_000 }).then(() => true, () => false);
  const cardAt = Date.now();
  const countdown = (cardAt - quiet) / 1000 - warnedAt;
  w.record({ id: 'K18 S7 the countdown ends in the reset card', rule: 'K143', pass: carded && countdown >= 13 && countdown <= 25, expected: 'the reset card about 15 s after "Still there?"', actual: { carded, countdown_s: Math.round(countdown) } });
  if (!carded) throw new Error('the idle countdown did not start a reset');
  await resetCard(w, 'S7 the idle reset', 's7-');
  await w.snap('s7-start-screen');
  if (!(await afterReset(w, api, start, cardAt - 15_000, 'S7 the idle reset'))) throw new Error('the idle reset did not finish');

  // S8: a second visitor in a row ends with Done from the hall: the same start state, value for value.
  w.at('S8');
  w.visit += 1;
  await w.click(startBtn, { settle: 3000 });
  await noPrompt(w, 'S8');
  await w.openPresenter();
  await w.click('[data-act="ptab"][data-tab="run"]', { settle: 400 });
  await w.click('[data-act="jump"][data-to="hall"]', { settle: 2500 });
  await w.closePresenter();
  const last = await doneReset(w, api, start, 'S8 Done again', 's8-');

  // S9: the presenter's idle wait back to 8 minutes, and the timer paused, for whoever walks next.
  w.at('S9');
  await setIdle(w, 8);
  await w.closePresenter();
  await w.pauseIdle();
  return last;
}
