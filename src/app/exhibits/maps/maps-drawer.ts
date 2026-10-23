import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { CampaignPracticeService, type CampaignQuestion } from '../../aplus/daily-dose/campaign-practice/campaign-practice.service';
import type { ConceptSuggestion } from '../../aplus/discovery-graph/concept-graph.model';
import { ConceptGraphService } from '../../aplus/discovery-graph/concept-graph.service';
import type { PreparedChoice } from '../../kiosk-api/manifest.service';
import { LiveService, type LiveOutcome } from '../../live/live.service';
import { questionAt, type QResult } from '../../live/kinds/q.live';
import { liveRows } from '../../shared/sugg/sugg-list';
import type { SuggRowState } from '../../shared/sugg/sugg-rows.component';
import { VisitDecisions } from '../../shared/sugg/visit-decisions';
import { VisitTally } from '../../shared/visit-tally';
import { CompanionsExhibit, type CompanionAnswer, type CompanionGrew } from '../companions/companions-exhibit';
import { servePrepared } from '../prepared-practice';
import { MapsExhibit, type AtlasRegion } from './maps-exhibit';

export type DrawerTab = 'overview' | 'sugg';

/** The idea's practice in the drawer: none until Practise, then the prepared set's question (or a LIVE one, K103). */
export type DrawerPractice =
  | { readonly state: 'none' | 'loading' | 'failed' }
  | {
      readonly state: 'ready';
      readonly question: CampaignQuestion;
      /** The prepared set's own time (K101): the LIVE row's stamp. */
      readonly preparedAt: Date;
      readonly rung: number;
      /** Set when a LIVE q press replaced the question: the answer is graded against that set (K103). */
      readonly freshSetId?: string;
    };

/** Fresh ideas around one idea: from a LIVE press just now, or the hidden batch it fell back to (K64); they join its one list (K189). */
export interface DrawerFresh {
  readonly source: 'live' | 'prepared';
  readonly preparedAt: Date | null;
  /** A LIVE group's stamp time; null reads "just now" (the latest press this scene made). */
  readonly liveAt?: Date | null;
  /** When the press that made this group answered (kept for its stamp once a newer press lands). */
  readonly at?: Date | null;
  readonly rows: readonly { readonly suggestion: ConceptSuggestion; readonly state: SuggRowState }[];
}

type FreshRow = DrawerFresh['rows'][number];

/** Rows a minute or more apart came from different presses. */
const PRESS_GAP_MS = 60_000;

/**
 * W41, W46: an idea's fresh batches, one per press, newest first, for the top of its one list (K189). The
 * drawer keeps its presses only while the scene lives; the product keeps their ideas pending until
 * decided, and VisitDecisions keeps the decided ones for the demo session. But the snapshot also holds
 * the golden run's pending rows (some named by no manifest batch, W46), so a product row joins only when
 * THIS demo session made it: created after `since` (the last reset; no time to go by, no product row),
 * at this idea, outside every prepared batch, and an idea, never a link (K189 (2), W62). Each press keeps
 * its own time, for the LIVE row's stamp.
 */
export function visitFresh(
  kept: readonly DrawerFresh[] | undefined,
  focal: string,
  pending: readonly ConceptSuggestion[],
  decided: ReadonlyMap<string, { readonly suggestion: ConceptSuggestion; readonly state: 'added' | 'dropped' }>,
  batchIds: ReadonlySet<string>,
  since: string | null,
): DrawerFresh[] {
  const latest = (kept ?? []).findIndex((g) => g.source === 'live');
  const mine: DrawerFresh[] = (kept ?? []).map((g, i) => (g.source !== 'live' ? g : { ...g, liveAt: i === latest ? null : (g.at ?? null) }));
  const after = since ? Date.parse(since) : NaN;
  if (Number.isNaN(after)) return mine;
  const shown = new Set(mine.flatMap((g) => g.rows.map((r) => r.suggestion.suggestionId)));
  const ours = (s: ConceptSuggestion) =>
    s.kind !== 'edge' && s.focalConceptId === focal && !batchIds.has(s.suggestionId) && !shown.has(s.suggestionId) && Date.parse(s.createdAt ?? '') > after;
  const rows: FreshRow[] = [
    ...pending.filter(ours).map((s): FreshRow => ({ suggestion: s, state: decided.get(s.suggestionId)?.state ?? 'pending' })),
    ...[...decided.values()].filter((d) => ours(d.suggestion) && !pending.some((s) => s.suggestionId === d.suggestion.suggestionId)).map((d): FreshRow => ({ suggestion: d.suggestion, state: d.state })),
  ].sort((a, b) => Date.parse(a.suggestion.createdAt ?? '') - Date.parse(b.suggestion.createdAt ?? ''));
  const presses: FreshRow[][] = [];
  for (const r of rows) {
    const last = presses.at(-1);
    const prev = last?.at(-1);
    if (last && prev && Date.parse(r.suggestion.createdAt ?? '') - Date.parse(prev.suggestion.createdAt ?? '') < PRESS_GAP_MS) last.push(r);
    else presses.push([r]);
  }
  const fromProduct = presses.reverse().map((p): DrawerFresh => {
    const at = new Date(p[0].suggestion.createdAt as string);
    return { source: 'live', preparedAt: null, liveAt: at, at, rows: p };
  });
  return [...mine, ...fromProduct];
}

/**
 * K138 W12: an idea's climb as its last graded answer left it (the grade returns the record's rungs and
 * count). It holds only against the map read it was answered on: the next read of the maps is the record.
 */
export interface AnsweredClimb {
  readonly read: object;
  readonly rungsCleared: number;
  readonly currentRungCorrect: number;
}

/** A hex won in the drawer this visit: the EXP comes from the ledger (K135), waited for after the win. */
export interface DrawerWin {
  readonly conceptId: string;
  readonly grew: 'waiting' | CompanionGrew | null;
}

/**
 * The region's concept drawer (mockup conceptDrawerHTML, openConcept and answerMap, lines 4756,
 * 4785 and 4818; K36, K42, K50, K135): which idea is open and on which tab, its practice and the
 * answer. Practice serves only a set the golden run prepared, at the idea's next rung, so no serve
 * starts a generation (K50); a win re-reads the atlas and credits the map's Companion, both as the
 * Companions exhibit does. Provided by the maps scene, so a new entry starts closed.
 */
@Injectable()
export class MapsDrawer {
  private readonly exhibit = inject(MapsExhibit);
  private readonly practiceApi = inject(CampaignPracticeService);
  private readonly companions = inject(CompanionsExhibit);
  private readonly concepts = inject(ConceptGraphService);
  private readonly decisions = inject(VisitDecisions);
  private readonly tally = inject(VisitTally);

  private readonly conceptSig = signal<string | null>(null);
  private readonly tabSig = signal<DrawerTab>('overview');
  private readonly practiceSig = signal<DrawerPractice>({ state: 'none' });
  private readonly answerSig = signal<CompanionAnswer>({ state: 'none' });
  private readonly climbsSig = signal<ReadonlyMap<string, AnsweredClimb>>(new Map());
  private readonly refreshedSig = signal<ReadonlySet<string>>(new Set());
  private readonly wonSig = signal<DrawerWin | null>(null);
  private readonly freshSig = signal<ReadonlyMap<string, readonly DrawerFresh[]>>(new Map());
  private readonly busySig = signal(false);
  private readonly decideFailedSig = signal(false);
  /** Counts the ideas opened: a call that outlives its idea writes nothing. */
  private opened = 0;
  /** K218: a LIVE question that ended while the answer was being graded, held until the grade says whether the hex is won. */
  private lateQ: { readonly conceptId: string; readonly outcome: LiveOutcome } | null = null;

  private readonly live = inject(LiveService);

  constructor() {
    // Gap (a), W79: the outcomes come from the one LIVE door while the scene lives, so a press answered after
    // its drawer has closed (its row destroyed with it) still lands; the rows bind none. A key whose middle
    // names no region (`sugg:hook:`, `q:comp:`) is another exhibit's.
    const stop = this.live.onOutcome((key, o) => {
      const [kind, short, focal] = key.split(':');
      const region = focal ? this.exhibit.regions().find((r) => r.key.split('.')[1] === short) : undefined;
      if (region && kind === 'sugg') this.onSuggOutcome(region, focal, o);
      else if (region && kind === 'q') this.onQOutcome(focal, o);
    });
    inject(DestroyRef).onDestroy(stop);
  }

  readonly concept = this.conceptSig.asReadonly();
  readonly tab = this.tabSig.asReadonly();
  readonly practice = this.practiceSig.asReadonly();
  readonly answer = this.answerSig.asReadonly();
  readonly climbs = this.climbsSig.asReadonly();
  /** The ideas answered right this visit: no longer due (mockup terrainHTML's answered). */
  readonly refreshed = this.refreshedSig.asReadonly();
  readonly won = this.wonSig.asReadonly();
  /** Fresh ideas on screen, by the idea they grow around (kept while the scene is open). */
  readonly fresh = this.freshSig.asReadonly();
  readonly busy = this.busySig.asReadonly();
  readonly decideFailed = this.decideFailedSig.asReadonly();

  /** An idea's click (Overview) or a fog ghost's (Suggestions, on its idea). */
  open(conceptId: string, tab: DrawerTab = 'overview'): void {
    if (this.conceptSig() !== conceptId) {
      this.opened++;
      this.practiceSig.set({ state: 'none' });
      this.answerSig.set({ state: 'none' });
      this.wonSig.set(null);
      this.lateQ = null;
    }
    this.conceptSig.set(conceptId);
    this.tabSig.set(tab);
  }

  close(): void {
    this.opened++;
    this.conceptSig.set(null);
    this.tabSig.set('overview');
    this.practiceSig.set({ state: 'none' });
    this.answerSig.set({ state: 'none' });
    this.wonSig.set(null);
    this.lateQ = null;
  }

  setTab(tab: DrawerTab): void {
    if (this.conceptSig()) this.tabSig.set(tab);
  }

  /** The prepared practice set at the idea's next rung (mockup R.q), or null: none prepared, or the idea is won. */
  setFor(region: AtlasRegion, conceptId: string): PreparedChoice<'practice_set'> | null {
    const m = this.exhibit.manifest();
    const node = region.map.campaign?.nodes[conceptId];
    if (!m || node?.wonAt) return null;
    const rung = (node?.rungsCleared ?? 0) + 1;
    return m.choices('practice_set').find((c) => c.records.goal_id === region.goalId && c.records.concept_id === conceptId && c.records.rung === rung) ?? null;
  }

  /**
   * Practise: the prepared set through production's serve door. The Companions are read first when
   * they are not yet, so a win's credit can be told apart from the growth before it (creditWin).
   */
  async practise(region: AtlasRegion): Promise<void> {
    const id = this.conceptSig();
    if (!id || this.practiceSig().state !== 'none') return;
    const set = this.setFor(region, id);
    if (!set) return;
    const companions = this.companions.status() === 'ready' ? Promise.resolve() : this.companions.load();
    const opened = this.opened;
    // W79: a LIVE question written for this idea at this rung this demo session (K186: its only one) shows again in its place.
    const done = this.live.state(`q:${region.key.split('.')[1]}:${id}`)();
    const live = done?.status === 'done' ? questionAt(done.result as QResult, set.records.rung) : null;
    if (live) {
      await companions;
      if (opened === this.opened) this.practiceSig.set({ state: 'ready', question: live.question, preparedAt: set.preparedAt, rung: set.records.rung, freshSetId: live.freshSetId });
      return;
    }
    this.practiceSig.set({ state: 'loading' });
    try {
      const [question] = await Promise.all([servePrepared(this.practiceApi, set), companions]);
      if (opened !== this.opened) return;
      this.practiceSig.set({ state: 'ready', question, preparedAt: set.preparedAt, rung: set.records.rung });
    } catch (err: unknown) {
      console.error(`[kiosk] ${err instanceof Error ? err.message : String(err)}`);
      if (opened === this.opened) this.practiceSig.set({ state: 'failed' });
    }
  }

  /** An option picked (mockup answerMap): graded by production; a win re-reads the atlas and credits the Companion. */
  async choose(region: AtlasRegion, optionId: string): Promise<void> {
    const id = this.conceptSig();
    const p = this.practiceSig();
    if (!id || p.state !== 'ready' || this.answerSig().state !== 'none') return;
    const opened = this.opened;
    this.answerSig.set({ state: 'checking', selected: optionId });
    try {
      const result = await firstValueFrom(
        this.practiceApi.answer(region.goalId, {
          concept_id: id,
          rung: p.rung,
          question_index: p.question.sourceIndex,
          selected_option_id: optionId,
          ...(p.freshSetId ? { fresh_set_id: p.freshSetId } : {}),
        }),
      );
      if (opened !== this.opened) return;
      const late = this.takeLateQ();
      this.answerSig.set({ state: 'done', selected: optionId, result });
      if (!result.won) {
        const climb = { read: region.map, rungsCleared: result.rungs_cleared, currentRungCorrect: result.current_rung_correct };
        this.climbsSig.update((m) => new Map(m).set(id, climb));
      }
      this.tally.answered();
      if (result.correct) this.refreshedSig.update((s) => new Set(s).add(id));
      if (!result.won) {
        if (late) this.onQOutcome(late.conceptId, late.outcome);
        return;
      }
      this.wonSig.set({ conceptId: id, grew: 'waiting' });
      const title = region.map.concepts.find((c) => c.conceptId === id)?.title ?? '';
      await this.exhibit.enter();
      const grew = await this.companions.creditWin(region.companionId, title);
      if (opened === this.opened) this.wonSig.set({ conceptId: id, grew });
    } catch (err: unknown) {
      console.error(`[kiosk] the atlas answer was not graded: ${err instanceof Error ? err.message : String(err)}`);
      if (opened !== this.opened) return;
      const late = this.takeLateQ();
      this.answerSig.set({ state: 'failed', selected: optionId });
      if (late) this.onQOutcome(late.conceptId, late.outcome);
    }
  }

  private takeLateQ(): { readonly conceptId: string; readonly outcome: LiveOutcome } | null {
    const late = this.lateQ;
    this.lateQ = null;
    return late;
  }

  /** Every suggestion a prepared batch holds on this map, shown or hidden: a fresh idea is any other (W41). */
  batchIds(region: AtlasRegion): ReadonlySet<string> {
    const m = this.exhibit.manifest();
    return new Set((m?.choices('suggestions') ?? []).filter((c) => c.records.goal_id === region.goalId).flatMap((c) => c.records.suggestion_ids));
  }

  /** The golden run's batch around an idea that the story shows (visible), or the hidden fresh one behind its LIVE row (K64). */
  batch(region: AtlasRegion, focal: string, hidden: boolean): PreparedChoice<'suggestions'> | null {
    const m = this.exhibit.manifest();
    return m?.choices('suggestions').find((c) => c.hidden === hidden && c.records.goal_id === region.goalId && c.records.focal_concept_id === focal) ?? null;
  }

  /**
   * A LIVE fresh-ideas press ended (mockup live.sugg and wonAskHTML): its ideas, or, when it gave none,
   * the idea's hidden prepared batch (K64), labelled prepared, join the top of the idea's one list (K189, R1).
   */
  onSuggOutcome(region: AtlasRegion, focal: string, o: LiveOutcome): void {
    if (o.status === 'stopped') return;
    const live = liveRows(o);
    let fresh: DrawerFresh;
    if (live) {
      fresh = { source: 'live', preparedAt: null, at: o.status === 'done' ? o.at : null, rows: live };
    } else {
      const batch = this.batch(region, focal, true);
      if (!batch) {
        console.error(`[kiosk] no prepared fresh ideas around ${focal}: the LIVE press gave none and nothing stands behind it`);
        return;
      }
      const waiting = new Map(region.hiddenPending.map((s) => [s.suggestionId, s]));
      const rows = batch.records.suggestion_ids.flatMap((id) => (waiting.has(id) ? [{ suggestion: waiting.get(id) as ConceptSuggestion, state: 'pending' as const }] : []));
      fresh = { source: 'prepared', preparedAt: batch.preparedAt, rows };
    }
    // W41: each press keeps its own batch, newest first; an idea a newer press repeats shows only there, and an
    // earlier press that found nothing new gives way.
    const ids = new Set(fresh.rows.map((r) => r.suggestion.suggestionId));
    const earlier = (this.freshSig().get(focal) ?? []).map((g) => ({ ...g, rows: g.rows.filter((r) => !ids.has(r.suggestion.suggestionId)) })).filter((g) => g.rows.length > 0);
    this.freshSig.update((m) => new Map(m).set(focal, [fresh, ...earlier]));
  }

  /** Add or Dismiss one suggestion (K42: real calls), kept for the visit; the atlas is read again, so an added idea shows. */
  async decide(region: AtlasRegion, suggestionId: string, action: 'accept' | 'dismiss', fresh: boolean): Promise<void> {
    if (this.busySig()) return;
    this.busySig.set(true);
    this.decideFailedSig.set(false);
    try {
      await firstValueFrom(action === 'accept' ? this.concepts.acceptSuggestion(suggestionId) : this.concepts.dismissSuggestion(suggestionId));
      const shown = [...region.pending, ...region.hiddenPending, ...[...this.freshSig().values()].flat().flatMap((f) => f.rows.map((r) => r.suggestion))];
      const decided = shown.find((s) => s.suggestionId === suggestionId);
      if (decided) this.decisions.record(decided, action);
      else console.error(`[kiosk] the decided suggestion ${suggestionId} is not on screen: later scenes will not show it`);
      if (fresh) {
        const mark = action === 'accept' ? 'added' : 'dropped';
        this.freshSig.update((m) => new Map([...m].map(([k, gs]) => [k, gs.map((f) => ({ ...f, rows: f.rows.map((r) => (r.suggestion.suggestionId === suggestionId ? { ...r, state: mark } : r)) }))])));
      }
      await this.exhibit.enter();
    } catch (err: unknown) {
      console.error(`[kiosk] the suggestion ${suggestionId} was not decided: ${err instanceof Error ? err.message : String(err)}`);
      this.decideFailedSig.set(true);
    } finally {
      this.busySig.set(false);
    }
  }

  /**
   * A LIVE q press on the idea `conceptId` ended: while its practice is on screen at that rung, the fresh
   * set's question replaces the prepared one (K103); a missed one leaves it (K45). Off screen, Practise
   * finds it when the idea opens again (W79). K218: a hex won takes no more questions, so a question
   * ending after the win is dropped, never shown; one ending while the answer is graded waits for the grade.
   */
  onQOutcome(conceptId: string, o: LiveOutcome): void {
    const p = this.practiceSig();
    if (o.status !== 'done' || p.state !== 'ready' || this.conceptSig() !== conceptId) return;
    if (this.wonSig()?.conceptId === conceptId) return;
    if (this.answerSig().state === 'checking') {
      this.lateQ = { conceptId, outcome: o };
      return;
    }
    const live = questionAt(o.result as QResult, p.rung);
    if (!live) return;
    this.practiceSig.set({ ...p, question: live.question, freshSetId: live.freshSetId });
    this.answerSig.set({ state: 'none' });
  }
}
