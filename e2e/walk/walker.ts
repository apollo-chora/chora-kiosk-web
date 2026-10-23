/**
 * The walk's instrument (T4.1): numbered screenshots with the mockup walk's layout audit, the
 * per-screen copy checks, the LIVE tripwire on the network, and report.json. A clean report is
 * not a clean screen: the screenshots are looked at too.
 */
import fs from 'node:fs';
import type { Page } from '@playwright/test';
import type { Manifest } from './api';
import { checkStamps, classifyRequest, floorWords, gapErrors, interfaceLeaks, rawKeys, serveDoorReady, verdict, visitWords } from './checks.mjs';

export type Lang = 'en' | 'zh';
export type Target = 'fixtures' | 'stack';
/** `fixture`: held on fixture data; `not-judged`: the fixture world cannot hold this record. */
export type Verdict = boolean | 'fixture' | 'not-judged';

export interface Check {
  readonly id: string;
  readonly rule: string;
  readonly pass: Verdict;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly shot?: string;
  readonly note?: string;
}

export interface WalkContext {
  readonly lang: Lang;
  readonly target: Target;
  readonly out: string;
  readonly baseURL: string;
  readonly commit: string;
  readonly liveAllow: ReadonlySet<string>;
  readonly tables: Readonly<Record<Lang, Readonly<Record<string, string>>>>;
  readonly manifest: Manifest;
  readonly preparedTurnIds: ReadonlySet<string>;
}

interface Call {
  readonly step: string;
  readonly method: string;
  readonly path: string;
  readonly kind: string;
  readonly live: string | null;
  readonly rule: string;
  readonly blocked: boolean;
  /** A write's request body, so a step can compare what it sent with what was stored. */
  readonly body?: unknown;
}

interface Audit {
  readonly issues: string[];
  readonly stageText: string;
  readonly sceneText: string;
  readonly interfaceText: string;
}

/**
 * Routes production has and the dev fixture world lacks (web's track to add). Only on fixtures, and
 * only the errors naming them; each is listed in the report under fixture_gaps.
 */
// growth-events left the list when web's b7f1c3b53 served it. The tour (T, K173) walks through the
// dashboard's and grading's beats, whose reads the fixture world does not serve (sections L and M are
// stack only for the same reason): on fixtures only, each excused error is still listed in the report.
const FIXTURE_GAPS: readonly RegExp[] = [
  /\[http 404\] GET \/api\/v1\/me\/mana$/,
  /\[http 404\] GET \/api\/me\/dashboard$/,
  /\[http 404\] GET \/api\/v1\/question-banks\/[^/ ]+$/,
  /\[kiosk\] the dashboard(?:'s (?:mana|streak))? could not be read: GET \/api\/(?:v1\/me\/mana|me\/dashboard|v1\/question-banks\/[^:]+): 404 UNKNOWN/,
  /\[kiosk\] the grading exhibit could not be read: \[kiosk\] sample\.weak is not graded on the same question as sample\.strong/,
  // The tour's own demo session (T) asks again for the greeting and the dose, which the fixture world has for none.
  /\[http 404\] POST \/api\/companion\/greeting$/,
  /\[kiosk\] the prepared greeting for [0-9a-f-]+ could not be read: POST \/api\/companion\/greeting: 404 Not Found NOT_FOUND: no fixture for POST \/api\/companion\/greeting$/,
  /\[http 404\] GET \/api\/companion\/daily-dose\?goal_id=[0-9a-f-]+$/,
  /\[kiosk\] [0-9a-f-]+'s dose could not be read: GET \/api\/companion\/daily-dose\?goal_id=[0-9a-f-]+: 404 UNKNOWN$/,
  // The fixture world answers a LIVE fresh-ideas press only around Desalination (make-fixtures.mjs): K's won
  // press (Z14, KIOSK_WALK_LIVE_ALLOW=sugg) misses there by design, so its fallback shows.
  /\[http 404\] POST \/api\/v1\/me\/concept-graph\/suggestions\/generate$/,
  /\[kiosk\] LIVE sugg:[a-z]+:[0-9a-f-]+ failed: POST \/api\/v1\/me\/concept-graph\/suggestions\/generate: 404 Not Found NOT_FOUND: no fixture for POST \/api\/v1\/me\/concept-graph\/suggestions\/generate$/,
];

/** Copy rules judged on every screenshot; a rule's summary passes only if no shot broke it. */
const SHOT_RULES = ['K83', 'K80', 'K41', 'raw-keys', 'K101-any'] as const;
type ShotRule = (typeof SHOT_RULES)[number];

export class Walker {
  readonly shots: string[] = [];
  readonly errors: string[] = [];
  readonly findings: { step: string; shot?: string; error?: string; issues?: string[] }[] = [];
  readonly checks: Check[] = [];
  readonly calls: Call[] = [];
  readonly notes: string[] = [];
  /** The JSON answer of every write, in order, so a step can judge what its write returned. */
  readonly writes: { step: string; rule: string; path: string; status: number; body: unknown }[] = [];
  /** Each serve door's answer, in order, so a step can read the served option order (K149). */
  readonly served: { step: string; path: string; body: unknown }[] = [];
  /** Each page's text, read where the walk visits it, for checks across pages (Z18: no retired model named). */
  readonly pageTexts = new Map<string, string>();
  /** The demo session the walk is in: 1 from the first Start, one more after each reset (K149). */
  visit = 1;
  /** The option order each visit showed a question in (K149), by its stem. */
  readonly orders: { visit: number; id: string; stem: string; shown: string[] }[] = [];
  private readonly shotRules = new Map<ShotRule, { shots: number; failed: Check[] }>(SHOT_RULES.map((r) => [r, { shots: 0, failed: [] }]));
  private readonly keySet: ReadonlySet<string>;
  private n = 0;
  private step = 'start';

  constructor(
    readonly page: Page,
    readonly ctx: WalkContext,
  ) {
    this.keySet = new Set(Object.keys(ctx.tables.en));
  }

  get source(): 'stack' | 'fixture' {
    return this.ctx.target === 'stack' ? 'stack' : 'fixture';
  }

  /** The interface string in the walk's language; a missing key is the walk's own error. */
  t(key: string, params: Record<string, string | number> = {}): string {
    const v = this.ctx.tables[this.ctx.lang][key];
    if (v === undefined) throw new Error(`[walk] no string ${key} in ${this.ctx.lang}`);
    return v.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => String(params[k] ?? `{{${k}}}`));
  }

  at(step: string): void {
    this.step = step;
  }

  async attach(): Promise<void> {
    const { page } = this;
    const base = new URL(this.ctx.baseURL).origin;
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') this.errors.push(`${this.step} [console.${m.type()}] ${m.text().slice(0, 400)}`);
    });
    page.on('pageerror', (e) => this.errors.push(`${this.step} [pageerror] ${String(e).slice(0, 400)}`));
    page.on('request', (r) => {
      const u = r.url();
      if (!u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:')) this.errors.push(`${this.step} [other-origin] ${r.method()} ${u.slice(0, 200)}`);
    });
    page.on('requestfailed', (r) => {
      if (r.failure()?.errorText !== 'net::ERR_BLOCKED_BY_CLIENT') this.errors.push(`${this.step} [failed] ${r.method()} ${r.url().replace(base, '')} ${r.failure()?.errorText}`);
    });
    page.on('response', async (r) => {
      const path = r.url().replace(base, '');
      if (r.status() >= 400) this.errors.push(`${this.step} [http ${r.status()}] ${r.request().method()} ${path}`);
      const c = classifyRequest({ method: r.request().method(), url: r.url(), body: null }, { preparedTurnIds: this.ctx.preparedTurnIds });
      if (c.kind === 'write' && path.startsWith('/api/')) {
        this.writes.push({ step: this.step, rule: c.rule, path, status: r.status(), body: await r.json().catch(() => null) });
        return;
      }
      if (!c.serveDoor) return;
      const body: unknown = await r.json().catch(() => null);
      this.served.push({ step: this.step, path, body });
      const ready = serveDoorReady(body);
      this.checks.push({
        id: `serve-door ${path}`,
        rule: 'K50',
        pass: verdict(ready, this.source),
        expected: 'ready',
        actual: (body as { status?: unknown } | null)?.status ?? null,
        note: 'a serve door that is not ready draws on the tap budget and may request generation',
      });
    });
    await page.route(
      (u) => u.origin === base && (u.pathname.startsWith('/api/') || u.pathname.startsWith('/bff/')),
      async (route) => {
        const req = route.request();
        let body: unknown = null;
        try {
          body = req.postDataJSON();
        } catch {
          body = null;
        }
        const c = classifyRequest({ method: req.method(), url: req.url(), body }, { preparedTurnIds: this.ctx.preparedTurnIds });
        const blocked = c.kind === 'model' && !(c.live !== null && this.ctx.liveAllow.has(c.live));
        const path = new URL(req.url()).pathname;
        this.calls.push({ step: this.step, method: req.method(), path, kind: c.kind, live: c.live, rule: c.rule, blocked, ...(c.kind === 'write' ? { body } : {}) });
        if (c.rule === 'unclassified') this.findings.push({ step: this.step, error: `an unclassified write: ${req.method()} ${path}` });
        if (blocked) {
          this.checks.push({ id: `LIVE ${c.live} at ${this.step}`, rule: 'T4.1 e', pass: false, expected: 'no model call unless allowed', actual: `${req.method()} ${path}` });
          await route.abort('blockedbyclient');
          return;
        }
        await route.continue();
      },
    );
  }

  /** Clicks a control, forced (the lens never settles). A LIVE control needs `live`. */
  async click(sel: string, opts: { nth?: number; settle?: number; live?: string } = {}): Promise<boolean> {
    const loc = this.page.locator(sel).nth(opts.nth ?? 0);
    try {
      const isLive = await loc.evaluate((e) => e.closest('[data-act="live"], [data-act="liveRedo"]') !== null, undefined, { timeout: 8000 });
      if (isLive && !(opts.live && this.ctx.liveAllow.has(opts.live))) {
        this.findings.push({ step: this.step, error: `refused to press LIVE ${sel}: not allowed in this walk` });
        return false;
      }
      await loc.click({ timeout: 8000, force: true });
    } catch (e) {
      this.findings.push({ step: this.step, error: `click ${sel} [${opts.nth ?? 0}]: ${String(e).split('\n')[0]}` });
      return false;
    }
    await this.page.waitForTimeout(opts.settle ?? 700);
    return true;
  }

  /**
   * A lens node's concept id by its label (a label wraps over several tspans, and the lens cuts a
   * long one with an ellipsis: it then matches the one title it begins); null when absent.
   */
  async nodeId(title: string): Promise<string | null> {
    return this.page.$$eval(
      'g.lens-node',
      (nodes, a) => {
        const label = (n: Element) => [...n.querySelectorAll('text.lens-label tspan')].map((s) => (s.textContent ?? '').trim()).join(' ');
        const exact = nodes.find((n) => label(n) === a.t);
        const cut = nodes.filter((n) => label(n).endsWith(a.ellipsis) && a.t.startsWith(label(n).slice(0, -1).trimEnd()));
        return (exact ?? (cut.length === 1 ? cut[0] : undefined))?.getAttribute('data-id') ?? null;
      },
      { t: title, ellipsis: String.fromCharCode(0x2026) },
    );
  }

  /** After a section stopped: close what may be open and go back to the hall, so the next one starts there. */
  async recover(): Promise<void> {
    await this.page.keyboard.press('Escape').catch(() => undefined);
    await this.closePresenter().catch(() => undefined);
    if ((await this.page.locator('[data-act="toHall"]').count()) > 0) await this.click('[data-act="toHall"]', { settle: 1500 });
    this.note(`recovered to ${(await this.page.locator('#scene .ex-card').count()) > 0 ? 'the hall' : 'a screen without the hall'}`);
  }

  async press(key: string, settle = 500): Promise<void> {
    await this.page.keyboard.press(key);
    await this.page.waitForTimeout(settle);
  }

  /** The JSON answer of the last write by this rule at or after `since` (an index into `writes`). */
  lastWrite(rule: string, since = 0): { path: string; status: number; body: unknown } | null {
    return [...this.writes.slice(since)].reverse().find((x) => x.rule === rule) ?? null;
  }

  record(check: Check): void {
    this.checks.push(check);
  }

  note(line: string): void {
    this.notes.push(`${this.step}: ${line}`);
  }

  fail(error: string): void {
    this.findings.push({ step: this.step, error });
  }

  /**
   * A numbered screenshot, then the layout audit and the copy rules on what it shows. `stamps`
   * names the manifest choices this screen shows prepared (K101); `extraTimes` other known times.
   * `still` leaves the pointer where it is: a pointer move is input, and would end "Still there?".
   */
  async snap(name: string, opts: { stamps?: string[]; extraTimes?: string[]; still?: boolean } = {}): Promise<Audit> {
    if (!opts.still) await this.page.mouse.move(2, 2);
    this.n += 1;
    const shot = `${this.ctx.lang}-${String(this.n).padStart(2, '0')}-${name}`;
    await this.page.screenshot({ path: `${this.ctx.out}/${shot}.png` });
    this.shots.push(shot);
    const audit = await this.page.evaluate(auditPage);
    const issues = [...audit.issues];
    const keys = rawKeys(audit.stageText, this.keySet);
    this.shotRule('raw-keys', shot, keys.length === 0, keys);
    this.shotRule('K83', shot, visitWords([audit.stageText]).length === 0, visitWords([audit.stageText]));
    this.shotRule('K80', shot, floorWords([audit.stageText]).length === 0, floorWords([audit.stageText]));
    if (this.ctx.lang === 'zh') {
      const leaks = interfaceLeaks(audit.interfaceText, this.ctx.tables.en, this.ctx.tables.zh);
      this.shotRule('K41', shot, leaks.length === 0, leaks);
    }
    const any = checkStamps({ id: shot, text: audit.sceneText, lang: this.ctx.lang, manifest: this.ctx.manifest, expect: [], extra: opts.extraTimes ?? [], source: this.source });
    this.shotRule('K101-any', shot, any.pass !== false, any.actual);
    if (opts.stamps) {
      this.checks.push({ ...checkStamps({ id: `K101 ${shot}`, text: audit.sceneText, lang: this.ctx.lang, manifest: this.ctx.manifest, expect: opts.stamps, extra: opts.extraTimes ?? [], source: this.source }), shot });
    }
    if (issues.length) this.findings.push({ step: this.step, shot, issues });
    return audit;
  }

  /**
   * The audit's positive control (a check that cannot fail is not a check): plants one defect of
   * each kind in the scene (a control under the footer, an element off the window, a raw string
   * key, the word "visit"), runs the same audit and the copy rules, removes the plants, and
   * records whether each was caught. Nothing is written and no screenshot is taken. Needs the footer.
   */
  async auditControl(): Promise<void> {
    await this.page.evaluate(() => {
      const scene = document.querySelector('#scene');
      if (!scene) throw new Error('no #scene to plant the audit control in');
      const stage = document.querySelector('#stage') as HTMLElement | null;
      const foot = document.querySelector('#bottom');
      if (!stage || !foot) throw new Error('no #stage or #bottom for the audit control');
      const scale = stage.getBoundingClientRect().width / stage.offsetWidth;
      const f = foot.getBoundingClientRect();
      const sc = scene.getBoundingClientRect();
      const under = document.createElement('button');
      under.className = 'walk-control';
      under.textContent = 'planted under the footer';
      under.style.cssText = `position:absolute;z-index:-1;left:${(f.left + f.width / 2 - sc.left) / scale}px;top:${(f.top + f.height / 2 - 8 - sc.top) / scale}px`;
      const off = document.createElement('div');
      off.className = 'walk-control';
      off.textContent = 'h2.add each visit';
      off.style.cssText = 'position:fixed;left:-400px;top:200px;width:300px;height:30px';
      scene.append(under, off);
    });
    const a = await this.page.evaluate(auditPage);
    await this.page.evaluate(() => document.querySelectorAll('.walk-control').forEach((e) => e.remove()));
    const caught = {
      'under-footer': a.issues.some((i) => i.startsWith('under-footer button.walk-control')),
      offscreen: a.issues.some((i) => i.startsWith('offscreen div.walk-control')),
      'raw-keys': rawKeys(a.stageText, this.keySet).includes('h2.add'),
      K83: visitWords([a.stageText]).length > 0,
    };
    this.record({ id: 'the audit catches each planted defect', rule: 'positive control', pass: Object.values(caught).every(Boolean), expected: 'all caught', actual: caught });
    const left = await this.page.locator('.walk-control').count();
    if (left > 0) this.fail(`the audit control left ${left} planted element(s) on the page`);
  }

  private shotRule(rule: ShotRule, shot: string, ok: boolean, actual: unknown): void {
    const r = this.shotRules.get(rule);
    if (!r) throw new Error(`[walk] unknown shot rule ${rule}`);
    r.shots += 1;
    if (!ok) r.failed.push({ id: `${rule} ${shot}`, rule, pass: false, expected: 'none', actual, shot });
  }

  /** The presenter panel: pause the idle timer (FINDINGS section 7), checked by its own label. */
  async pauseIdle(): Promise<void> {
    await this.openPresenter();
    await this.click('[data-act="ptab"][data-tab="run"]', { settle: 400 });
    const label = async () => (await this.page.locator('[data-act="pauseIdle"]').innerText({ timeout: 5000 })).trim();
    if ((await label()) === this.t('presenter.pauseIdle')) await this.click('[data-act="pauseIdle"]', { settle: 400 });
    const now = await label();
    this.record({ id: `idle paused at ${this.step}`, rule: 'T4.1 b', pass: now === this.t('presenter.resumeIdle'), expected: this.t('presenter.resumeIdle'), actual: now });
    await this.closePresenter();
  }

  async openPresenter(): Promise<void> {
    if (!(await this.presenterOpen())) await this.press('Backquote', 600);
    if (!(await this.presenterOpen())) this.fail('the presenter panel did not open on the backtick');
  }

  async closePresenter(): Promise<void> {
    if (await this.presenterOpen()) await this.press('Backquote', 500);
    if (await this.presenterOpen()) this.fail('the presenter panel did not close on the backtick');
  }

  private async presenterOpen(): Promise<boolean> {
    return (await this.page.locator('#presenter.open').count()) > 0;
  }

  /** On fixtures only: the errors the fixture world causes by lacking a route (checks.mjs gapErrors). */
  fixtureGaps(): { excused: string[]; rest: string[] } {
    return this.ctx.target === 'fixtures' ? gapErrors(this.errors, FIXTURE_GAPS) : { excused: [], rest: [...this.errors] };
  }

  /** The verdict of the whole walk: every check held and nothing went wrong on the way. */
  failures(): string[] {
    const bad: string[] = [];
    for (const c of this.allChecks()) if (c.pass === false) bad.push(`${c.rule} ${c.id}`);
    for (const f of this.findings) if (f.error) bad.push(`finding ${f.step}: ${f.error}`);
    for (const e of this.fixtureGaps().rest) bad.push(`error ${e}`);
    return bad;
  }

  allChecks(): Check[] {
    const summaries: Check[] = [...this.shotRules].map(([rule, r]) => ({
      id: `${rule} on every screenshot`,
      rule,
      // The stamps on screen are fixture data on fixtures; the copy rules judge kiosk-web's own text.
      pass: r.shots === 0 ? 'not-judged' : r.failed.length > 0 ? false : rule === 'K101-any' ? verdict(true, this.source) : true,
      expected: 'no offender',
      actual: { shots: r.shots, failed: r.failed.length },
    }));
    return [...this.checks, ...summaries, ...[...this.shotRules.values()].flatMap((r) => r.failed)];
  }

  writeReport(extra: Record<string, unknown> = {}): string {
    const file = `${this.ctx.out}/${this.ctx.lang}-report.json`;
    const checks = this.allChecks();
    const count = (v: Verdict) => checks.filter((c) => c.pass === v).length;
    const report = {
      lang: this.ctx.lang,
      viewport: '1366x768',
      target: this.ctx.target,
      base_url: this.ctx.baseURL,
      walk_commit: this.ctx.commit,
      manifest: { made_at: this.ctx.manifest.made_at, commit: this.ctx.manifest.commit, choices: Object.keys(this.ctx.manifest.choices).length },
      live_allowed: [...this.ctx.liveAllow],
      totals: { shots: this.shots.length, checks: checks.length, passed: count(true), failed: count(false), fixture: count('fixture'), not_judged: count('not-judged'), errors: this.errors.length, findings: this.findings.length },
      failures: this.failures(),
      fixture_gaps: this.fixtureGaps().excused,
      checks,
      errors: this.errors,
      findings: this.findings,
      notes: this.notes,
      calls: {
        model: this.calls.filter((c) => c.kind === 'model'),
        writes: this.calls.filter((c) => c.kind === 'write'),
        replays: this.calls.filter((c) => c.kind === 'replay').length,
        reads: this.calls.filter((c) => c.kind === 'read').length,
      },
      shots: this.shots,
      ...extra,
    };
    fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
    return file;
  }
}

/** In the page: qa-walk.js's audit on kiosk-web's stage, plus the texts the copy rules read. */
function auditPage(): Audit {
  const out: string[] = [];
  const stage = document.querySelector('#stage');
  if (!stage) return { issues: ['no #stage'], stageText: '', sceneText: '', interfaceText: '' };
  const hidden = (el: Element): boolean => {
    for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return true;
    }
    return false;
  };
  const closed = (el: Element): boolean => !!el.closest('#presenter:not(.open), .kdrawer:not(.open), .overlay:not(.show)');
  const label = (el: Element): string => `${el.tagName.toLowerCase()}.${String(el.className).split(' ').filter(Boolean).slice(0, 2).join('.')}`;
  stage.querySelectorAll('*').forEach((el) => {
    if (el.closest('svg') || closed(el) || hidden(el)) return;
    const cs = getComputedStyle(el);
    // 1. Containers whose content is clipped or scrolls.
    if (['auto', 'scroll', 'hidden'].includes(cs.overflowY) && el.scrollHeight > el.clientHeight + 3 && el.clientHeight > 0) out.push(`clipped-v ${label(el)} by ${el.scrollHeight - el.clientHeight}px`);
    if (['auto', 'scroll', 'hidden'].includes(cs.overflowX) && el.scrollWidth > el.clientWidth + 3 && el.clientWidth > 0) out.push(`clipped-h ${label(el)} by ${el.scrollWidth - el.clientWidth}px`);
    // 2. Buttons and chips whose label overflows.
    if (el.matches('button, .btn, .chip, .badge, .p-btn') && el.scrollWidth > el.clientWidth + 2) out.push(`label-overflow ${label(el)}: "${(el.textContent ?? '').trim().slice(0, 40)}"`);
    // 3. Visible elements that leave the window (the background map and the idle scrim bleed by
    // design). One inside a scrolling or clipping container is clipped there, which check 1 reports.
    if (el.closest('.bg-map, .idle-scrim, .interstitial')) return;
    for (let p = el.parentElement; p && p !== stage; p = p.parentElement) {
      if (['auto', 'scroll', 'hidden'].includes(getComputedStyle(p).overflowY)) return;
    }
    const r = el.getBoundingClientRect();
    if (r.width && r.height && (r.right > window.innerWidth + 2 || r.bottom > window.innerHeight + 2 || r.left < -2 || r.top < -2)) {
      out.push(`offscreen ${label(el)} (${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)})`);
    }
  });
  // 4. A scene control the footer covers (pass 1's W2: Submit under the footer, only its top edge clickable).
  stage.querySelectorAll('#scene button, #scene [data-act]').forEach((el) => {
    if (el.closest('svg') || closed(el) || hidden(el)) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return;
    const top = document.elementFromPoint(x, y);
    if (top && top.closest('#bottom')) out.push(`under-footer ${label(el)}: "${(el.textContent ?? '').trim().slice(0, 40)}"`);
  });
  // The interface's own text: visible text nodes outside content (lang="en") and the language buttons.
  const parts: string[] = [];
  const walker = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement;
    if (!el || el.closest('[lang="en"], [data-lang], svg') || hidden(el) || closed(el)) continue;
    const t = (node.textContent ?? '').trim();
    if (t) parts.push(t);
  }
  const text = (sel: string): string => (document.querySelector(sel) as HTMLElement | null)?.innerText ?? '';
  return {
    issues: [...new Set(out)].slice(0, 25),
    stageText: (stage as HTMLElement).innerText,
    sceneText: `${text('#scene')}\n${text('#bottom')}`,
    interfaceText: parts.join(' '),
  };
}
