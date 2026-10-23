import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { PreparedChoice, PrewarmManifest } from '../../kiosk-api/manifest.service';
import { ReadinessService } from '../../kiosk-api/readiness.service';
import type { WeakParams, WeakResult } from '../../live/kinds/weak.live';
import { LiveService, type LiveOutcome } from '../../live/live.service';
import { GrowthEdgesService, type EdgeDecision, type ProposedGrowthEdge } from '../../product-api/growth-edges.service';
import { paperQuestions, type PaperQuestion } from './paper-extract';

/** The papers' titles and questions, as the build serves kiosk/world/papers/papers.json (D5, W52). */
const PAPERS_JSON = '/papers/papers.json';

/**
 * W42 (K170): a Save is the job's COMPLETED, never the resume POST's answer (the orchestrator's graph
 * answers at once; consumption completes the job only after it embeds on Vertex, about 5 s online). The
 * job is read until it says so, within this bound.
 */
export const WEAK_SAVE_POLL_MS = 1000;
export const WEAK_SAVE_TRIES = 15;

/** K206 (W90): a Companion's documents in "Read my marked test": its marked test and, for Pingu, a marked one-page essay. */
export type WeakDoc = 'test' | 'essay';

/** The picked Companion's prepared paper: the file the build serves, its titles and its prepared run. */
export interface WeakPaper {
  readonly key: string;
  /** K206: which document it is, by its papers.json record (layout "essay" is the essay). */
  readonly doc: WeakDoc;
  readonly src: string;
  readonly title: string;
  readonly subtitle: string;
  /** The prepared run's own time, the job's review_ready_at (K101, D6). */
  readonly preparedAt: Date;
  /** What a LIVE read of the same paper sends (live/kinds/weak.live.ts). */
  readonly live: WeakParams;
  /** W52: the paper's own questions for its popup; null when papers.json's record could not be read (logged). */
  readonly questions: readonly PaperQuestion[] | null;
}

/** The visitor's choice on one proposed weak spot; a merge names the kept weak spot it folds into. */
export interface WeakChoice {
  readonly decision: EdgeDecision['decision'];
  readonly into: string | null;
}

export type CompanionWeak =
  | { readonly state: 'loading' | 'failed' }
  | {
      readonly state: 'review';
      readonly paper: WeakPaper;
      /** The prepared run (D6), or the visitor's LIVE run of the same paper. */
      readonly source: 'prepared' | 'live';
      readonly uploadId: string;
      readonly edges: readonly ProposedGrowthEdge[];
      readonly choices: ReadonlyMap<string, WeakChoice>;
      readonly saving: boolean;
      readonly saveFailed: boolean;
      /** W42: the job did not complete within the bound; a second Save cannot complete it (the graph is done) until the reset. */
      readonly notSaved: boolean;
    }
  | {
      readonly state: 'saved';
      readonly paper: WeakPaper;
      readonly source: 'prepared' | 'live';
      readonly kept: number;
      /** W52: the run's proposed weak spots, for the popup; null when the paper was saved before this visit and the job read carries none. */
      readonly edges: readonly ProposedGrowthEdge[] | null;
    };

type Review = Extract<CompanionWeak, { state: 'review' }>;
type Saved = Extract<CompanionWeak, { state: 'saved' }>;
/** A reading on show: at its review, or saved. */
export type WeakShown = Review | Saved;

/**
 * K206 (W90): Pingu's essay, read only LIVE. Before any press it lists nothing; a LIVE read that is done
 * lists its run; one that misses, or LIVE reading off, lists the golden run's prepared reading of the same
 * essay (K45), read by id at open as the test's is, so it is there the moment it is needed.
 */
export interface CompanionEssay {
  readonly paper: WeakPaper;
  /** The visitor's LIVE read of the essay, once one is done: its review, then saved. */
  readonly live: WeakShown | null;
  /** A LIVE read missed: the prepared reading shows in its place. */
  readonly missed: boolean;
  /** The golden run's reading of the essay, left at its review (D6). */
  readonly prepared: CompanionWeak;
}

/** What the essay lists: its LIVE run, else (after a miss, or with LIVE reading off) its prepared reading, else nothing yet. */
export function essayReading(e: CompanionEssay, liveOff: boolean): CompanionWeak | null {
  return e.live ?? (e.missed || liveOff ? e.prepared : null);
}

/** K206: the panel's foot, over every document's reading on show (one Save saves them all). */
export interface WeakFoot {
  /** A reading is at its review and can still be saved: Save shows. */
  readonly save: boolean;
  readonly canSave: boolean;
  readonly saving: boolean;
  readonly saveFailed: boolean;
  /** W42: a reading's Save did not complete; it cannot be saved again before the reset. */
  readonly notSaved: boolean;
  /** The weak spots kept over every reading saved, for the saved line; null while none is saved. */
  readonly kept: number | null;
}

export function weakFoot(readings: readonly (CompanionWeak | null)[]): WeakFoot {
  const review = readings.filter((r): r is Review => r?.state === 'review');
  const saved = readings.filter((r): r is Saved => r?.state === 'saved');
  const due = review.filter((r) => !r.notSaved);
  return {
    save: due.length > 0,
    canSave: due.length > 0 && due.every(canSave),
    saving: due.some((r) => r.saving),
    saveFailed: due.some((r) => r.saveFailed),
    notSaved: review.some((r) => r.notSaved),
    kept: saved.length ? saved.reduce((n, r) => n + r.kept, 0) : null,
  };
}

/** The kept weak spots another can fold into: the panel's others the visitor keeps. */
export function intoTargets(w: Review, edgeId: string): readonly ProposedGrowthEdge[] {
  return w.edges.filter((e) => e.proposed_edge_id !== edgeId && w.choices.get(e.proposed_edge_id)?.decision === 'accept');
}

/** Save is offered once every merge folds into a weak spot that is kept, and none is on its way. */
export function canSave(w: Review): boolean {
  if (w.saving || w.notSaved) return false;
  return w.edges.every((e) => {
    const c = w.choices.get(e.proposed_edge_id);
    return c?.decision !== 'merge' || (!!c.into && w.choices.get(c.into)?.decision === 'accept');
  });
}

/**
 * Companions' fourth ability, the weakness analyser (K158; D5 to D7): per Companion this visit, its
 * prepared paper's run read from the product (the run itself, left at its review by the golden run,
 * D6), the visitor's choice on each proposed weak spot (each starts kept, as production's review
 * does), and the confirm. A paper already reviewed since the last reset shows what was kept then,
 * from the job. A Companion with no prepared paper, or a run that is neither at its review nor
 * completed, is a loud failure, never an empty panel. K206 and K210: a marked test keeps its prepared
 * reading and has no LIVE read; Pingu's second document, its essay, is the one LIVE read (CompanionEssay),
 * and one Save confirms every document's reading on show, each on its own upload.
 */
@Injectable({ providedIn: 'root' })
export class CompanionWeakness {
  private readonly http = inject(HttpClient);
  private readonly growthEdges = inject(GrowthEdgesService);
  private readonly readiness = inject(ReadinessService);
  private readonly liveWhyOff = inject(LiveService).whyOff('weak');
  private readonly sig = signal<ReadonlyMap<string, CompanionWeak>>(new Map());
  private readonly essaySig = signal<ReadonlyMap<string, CompanionEssay>>(new Map());
  private papers: Promise<ReadonlyMap<string, PaperRecord>> | null = null;
  /** Counts visitors: a read that outlives its visit (a reset) writes nothing. */
  private visit = 0;

  /** Every Companion's marked test this visit, by its id. */
  readonly all = this.sig.asReadonly();
  /** K206: every Companion's essay this visit, by its id (Pingu's alone in the world). */
  readonly essays = this.essaySig.asReadonly();
  /**
   * K206: LIVE reading is off (the opening check did not find the reader, or the presenter turned live calls
   * off), so the essay lists its prepared reading at once. A call running (busy) is not off: during the essay's
   * own call nothing is listed until it ends.
   */
  readonly liveOff = computed(() => {
    const why = this.liveWhyOff();
    return why === 'off' || why === 'not_wired';
  });
  /**
   * W42 (K170, as K177 amends it): Save is off while readiness reports live.save off (the embedding tier
   * alone; the internet being down is one of its reasons): the Save's job completes only after consumption
   * embeds on Vertex. A failing reader or picture no longer turns it off. The prepared review still shows (K45).
   */
  readonly saveOff = computed(() => !!this.readiness.readiness() && !this.readiness.save());

  /**
   * Opens the ability for a Companion: its papers sorted by their papers.json layout (one marked test, and
   * Pingu's essay), each prepared run read by id; kept through the visit; a failed read is tried again.
   */
  async open(companionId: string, manifest: PrewarmManifest): Promise<void> {
    const test = this.sig().get(companionId);
    const essay = this.essaySig().get(companionId);
    const testDue = !test || test.state === 'failed';
    const essayDue = essay?.prepared.state === 'failed';
    if (!testDue && !essayDue) return;
    const choices = manifest.choices('weakness_paper').filter((c) => c.records.companion_id === companionId);
    if (!choices.length) {
      console.error(`[kiosk] no prepared paper for ${companionId}: the golden run prepares one per Companion's map (PREPARED-CHOICES 5.13)`);
      this.set(companionId, { state: 'failed' });
      return;
    }
    const visit = this.visit;
    if (testDue) this.set(companionId, { state: 'loading' });
    let docs: { readonly test: Doc; readonly essay: Doc | null };
    try {
      docs = documents(companionId, choices, await this.readPapers());
    } catch (err: unknown) {
      console.error(`[kiosk] ${companionId}'s marked test could not be read: ${messageOf(err)}`);
      if (visit === this.visit && testDue) this.set(companionId, { state: 'failed' });
      if (visit === this.visit && essay && essayDue) this.setEssay(companionId, { ...essay, prepared: { state: 'failed' } });
      return;
    }
    if (visit !== this.visit) return;
    const reads: Promise<void>[] = [];
    if (testDue) reads.push(this.readRun(companionId, 'marked test', docs.test, visit, (w) => this.set(companionId, w)));
    const e = docs.essay;
    if (e && (!essay || essayDue)) {
      this.setEssay(companionId, { paper: e.paper, live: essay?.live ?? null, missed: essay?.missed ?? false, prepared: { state: 'loading' } });
      reads.push(this.readRun(companionId, 'essay', e, visit, (w) => this.put(companionId, 'essay', w)));
    }
    await Promise.all(reads);
  }

  /** A prepared run read by id: saved when completed, its review when parked there; anything else is a loud failure. */
  private async readRun(companionId: string, what: string, doc: Doc, visit: number, put: (w: CompanionWeak) => void): Promise<void> {
    const upload = doc.choice.records.upload_id;
    try {
      const job = await this.growthEdges.job(upload);
      if (visit !== this.visit) return;
      if (job.status === 'COMPLETED') {
        // The ids are `omitempty` (growth_edge_uploads_handler.go:71) over a NOT NULL column: no field is none kept.
        put({ state: 'saved', paper: doc.paper, source: 'prepared', kept: job.upserted_growth_edge_ids?.length ?? 0, edges: job.review?.proposed_edges ?? null });
      } else if (job.status === 'AWAITING_REVIEW' && job.review?.proposed_edges.length) {
        put(review(doc.paper, 'prepared', job.upload_id, job.review.proposed_edges));
      } else {
        throw new Error(`the prepared run ${upload} is ${job.status}, not at its review`);
      }
    } catch (err: unknown) {
      console.error(`[kiosk] ${companionId}'s ${what} could not be read: ${messageOf(err)}`);
      if (visit === this.visit) put({ state: 'failed' });
    }
  }

  /**
   * The reading on show for one of a Companion's documents: the marked test's own; the essay's LIVE run, or
   * its prepared reading after a miss or with LIVE reading off, or none before its press (K206).
   */
  reading(companionId: string, doc: WeakDoc): CompanionWeak | null {
    if (doc === 'test') return this.sig().get(companionId) ?? null;
    const e = this.essaySig().get(companionId);
    return e ? essayReading(e, this.liveOff()) : null;
  }

  /** Keep, Not this one, or Same as another here (its target picked next, with into()), on one document's reading. */
  decide(companionId: string, doc: WeakDoc, edgeId: string, decision: WeakChoice['decision']): void {
    this.update(companionId, doc, edgeId, (c) => ({ decision, into: decision === 'merge' ? c.into : null }));
  }

  /** A merge folds into a weak spot kept in the same document's reading (K206: never across documents). */
  into(companionId: string, doc: WeakDoc, edgeId: string, targetId: string): void {
    const w = this.reading(companionId, doc);
    if (w?.state !== 'review' || !intoTargets(w, edgeId).some((e) => e.proposed_edge_id === targetId)) return;
    this.update(companionId, doc, edgeId, (c) => (c.decision === 'merge' ? { ...c, into: targetId } : c));
  }

  /**
   * Save my choices: the review confirmed (D7). K206: one press confirms every document's reading still at
   * its review (the test's, and the essay's when one is on show), each on its own upload with its own
   * decisions; the Companion keeps the weak spots the visitor kept.
   */
  async save(companionId: string): Promise<void> {
    const due = (['test', 'essay'] as const).flatMap((doc) => {
      const w = this.reading(companionId, doc);
      return w?.state === 'review' && !w.notSaved ? [{ doc, w }] : [];
    });
    if (!due.length || !due.every(({ w }) => canSave(w)) || this.saveOff()) return;
    const visit = this.visit;
    for (const { doc, w } of due) this.put(companionId, doc, { ...w, saving: true, saveFailed: false });
    await Promise.all(due.map(({ doc, w }) => this.saveOne(companionId, doc, w, visit)));
  }

  private async saveOne(companionId: string, doc: WeakDoc, w: Review, visit: number): Promise<void> {
    const decisions = w.edges.map((e): EdgeDecision => {
      const c = w.choices.get(e.proposed_edge_id) as WeakChoice;
      if (c.decision === 'reject') return { proposed_edge_id: e.proposed_edge_id, decision: 'reject' };
      if (c.decision === 'merge') return { proposed_edge_id: e.proposed_edge_id, decision: 'merge', merge_into_id: c.into as string, difficulty: e.suggested_difficulty };
      return { proposed_edge_id: e.proposed_edge_id, decision: 'accept', difficulty: e.suggested_difficulty };
    });
    try {
      await this.growthEdges.confirm(w.uploadId, decisions);
    } catch (err: unknown) {
      console.error(`[kiosk] ${companionId}'s review of ${w.uploadId} was not saved: ${messageOf(err)}`);
      if (visit === this.visit) this.put(companionId, doc, { ...w, saving: false, saveFailed: true });
      return;
    }
    const last = await this.completed(w.uploadId, visit);
    if (visit !== this.visit) return;
    if (last === 'COMPLETED') {
      this.put(companionId, doc, { state: 'saved', paper: w.paper, source: w.source, kept: decisions.filter((d) => d.decision === 'accept').length, edges: w.edges });
      return;
    }
    console.error(`[kiosk] ${companionId}'s review of ${w.uploadId} is not COMPLETED after its confirm (last read: ${last}): not saved, and no second Save can complete it before the reset`);
    this.put(companionId, doc, { ...w, saving: false, notSaved: true });
  }

  /** The job read until it says COMPLETED, FAILED stops it at once; the last status read, or why none was. */
  private async completed(uploadId: string, visit: number): Promise<string> {
    let last = 'no read';
    for (let i = 0; i < WEAK_SAVE_TRIES && visit === this.visit; i++) {
      if (i > 0) await new Promise((resolve) => setTimeout(resolve, WEAK_SAVE_POLL_MS));
      if (visit !== this.visit) break;
      try {
        last = (await this.growthEdges.job(uploadId)).status;
      } catch (err: unknown) {
        last = `a failed read (${messageOf(err)})`;
        continue;
      }
      if (last === 'COMPLETED' || last === 'FAILED') break;
    }
    return last === 'AWAITING_REVIEW' || last === 'ANALYZING' || last === 'QUEUED' ? `${last}, ${WEAK_SAVE_TRIES} reads, ${WEAK_SAVE_POLL_MS} ms apart` : last;
  }

  /**
   * A LIVE read of the essay ended (K206: the only LIVE read here): a run that is done is listed; a miss lists
   * the essay's prepared reading in its place (K45); "Stop waiting" leaves the essay waiting for its press.
   */
  onLive(companionId: string, o: LiveOutcome): void {
    if (o.status === 'stopped') return;
    const e = this.essaySig().get(companionId);
    if (!e) {
      console.error(`[kiosk] a LIVE read for ${companionId} ended ${o.status}, but ${companionId} has no essay open`);
      return;
    }
    if (o.status === 'missed') {
      this.setEssay(companionId, { ...e, missed: true });
      return;
    }
    const r = o.result as WeakResult;
    this.setEssay(companionId, { ...e, live: review(e.paper, 'live', r.uploadId, r.review.proposed_edges), missed: false });
  }

  /** A new visitor starts on a fresh read. */
  forget(): void {
    this.visit++;
    this.papers = null;
    this.sig.set(new Map());
    this.essaySig.set(new Map());
  }

  private readPapers(): Promise<ReadonlyMap<string, PaperRecord>> {
    if (!this.papers) {
      this.papers = firstValueFrom(this.http.get<{ papers?: readonly PaperRecord[] }>(PAPERS_JSON))
        .then((j) => new Map((j.papers ?? []).map((p) => [p.key, p] as const)))
        .catch((err: unknown) => {
          this.papers = null;
          throw new Error(`${PAPERS_JSON} could not be read: ${messageOf(err)}`);
        });
    }
    return this.papers;
  }

  private update(companionId: string, doc: WeakDoc, edgeId: string, f: (c: WeakChoice) => WeakChoice): void {
    const w = this.reading(companionId, doc);
    const c = w?.state === 'review' ? w.choices.get(edgeId) : undefined;
    if (w?.state !== 'review' || !c || w.saving || w.notSaved) return;
    this.put(companionId, doc, { ...w, saveFailed: false, choices: new Map(w.choices).set(edgeId, f(c)) });
  }

  /** Writes one document's reading back: the test's own; the essay's LIVE run or its prepared one, as the reading's source says. */
  private put(companionId: string, doc: WeakDoc, w: CompanionWeak): void {
    if (doc === 'test') {
      this.set(companionId, w);
      return;
    }
    const e = this.essaySig().get(companionId);
    if (!e) throw new Error(`[kiosk] ${companionId} has no essay open to write its reading to`);
    const live = (w.state === 'review' || w.state === 'saved') && w.source === 'live';
    this.setEssay(companionId, live ? { ...e, live: w } : { ...e, prepared: w });
  }

  private set(companionId: string, w: CompanionWeak): void {
    this.sig.update((m) => new Map(m).set(companionId, w));
  }

  private setEssay(companionId: string, e: CompanionEssay): void {
    this.essaySig.update((m) => new Map(m).set(companionId, e));
  }
}

/** One paper in papers.json; its questions are checked only for the popup (W52), so a bad record never stops the review. */
interface PaperRecord {
  readonly key: string;
  readonly title: string;
  readonly subtitle: string;
  /** K206: "essay" for an essay; a marked test has none. */
  readonly layout?: unknown;
  readonly questions?: unknown;
}

/** One of a Companion's prepared papers: its prepared choice and the paper the panel shows. */
interface Doc {
  readonly choice: PreparedChoice<'weakness_paper'>;
  readonly paper: WeakPaper;
}

/** K206: a Companion's prepared papers by their papers.json layout, refused loudly unless one marked test and at most one essay. */
function documents(companionId: string, choices: readonly PreparedChoice<'weakness_paper'>[], papers: ReadonlyMap<string, PaperRecord>): { test: Doc; essay: Doc | null } {
  const docs = choices.map((choice): Doc => {
    const t = papers.get(choice.key);
    if (!t) throw new Error(`${PAPERS_JSON} names no ${choice.key}`);
    if (t.layout !== undefined && t.layout !== 'essay') throw new Error(`${PAPERS_JSON}'s ${choice.key} has a layout the kiosk does not know: ${String(t.layout)}`);
    const file = String(choice.params['paper'] ?? '');
    const paper: WeakPaper = {
      key: choice.key,
      doc: t.layout === 'essay' ? 'essay' : 'test',
      src: `/papers/${encodeURIComponent(file)}`,
      title: t.title,
      subtitle: t.subtitle,
      preparedAt: choice.preparedAt,
      live: { paper: file, sha256: choice.records.sha256, goalId: choice.records.goal_id, uploadKind: choice.params['upload_kind'] as WeakParams['uploadKind'] },
      questions: popupQuestions(companionId, choice.key, t.questions),
    };
    return { choice, paper };
  });
  const tests = docs.filter((d) => d.paper.doc === 'test');
  const essays = docs.filter((d) => d.paper.doc === 'essay');
  if (tests.length !== 1 || essays.length > 1) {
    throw new Error(`${companionId} has ${tests.length} marked tests and ${essays.length} essays prepared, where the panel shows one test and at most one essay`);
  }
  return { test: tests[0], essay: essays[0] ?? null };
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function popupQuestions(companionId: string, key: string, raw: unknown): readonly PaperQuestion[] | null {
  try {
    return paperQuestions(key, raw);
  } catch (err: unknown) {
    console.error(`[kiosk] ${companionId}'s paper popup cannot list its lost marks: ${messageOf(err)}`);
    return null;
  }
}

function review(paper: WeakPaper, source: Review['source'], uploadId: string, edges: readonly ProposedGrowthEdge[]): Review {
  const choices = new Map(edges.map((e) => [e.proposed_edge_id, { decision: 'accept', into: null } as WeakChoice] as const));
  return { state: 'review', paper, source, uploadId, edges, choices, saving: false, saveFailed: false, notSaved: false };
}
