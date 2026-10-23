import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { CampaignPracticeService, parseCampaignQuestions, type CampaignQuestion } from '../aplus/daily-dose/campaign-practice/campaign-practice.service';
import type { ConceptNode, ConceptSuggestion } from '../aplus/discovery-graph/concept-graph.model';
import { ConceptGraphService } from '../aplus/discovery-graph/concept-graph.service';
import type { CampaignAnswerResult, FogGhost } from '../aplus/my-knowledge/campaign.model';
import type { MapGraph } from '../aplus/my-knowledge/maps.model';
import { MapsService } from '../aplus/my-knowledge/maps.service';
import { ManifestService, type PreparedChoice, type PrewarmManifest } from '../kiosk-api/manifest.service';
import { VisitsService } from '../kiosk-api/visits.service';
import type { QResult } from '../live/kinds/q.live';
import { liveRows } from '../shared/sugg/sugg-list';
import { MAX_CHILDREN, childCount, onMap } from '../shared/sugg/sugg-rows.component';
import { LiveService, type LiveOutcome } from '../live/live.service';
import { normalizeConceptKey } from '../shared/concept-key';
import { VisitDecisions } from '../shared/sugg/visit-decisions';
import { VisitTally } from '../shared/visit-tally';
import type { XrayKind } from '../xray/behind-the-scenes';
import { TeacherStudio } from './teacher-studio';
import type { CampaignSetRun } from '../kiosk-api/xray.service';
import type { CampaignTraceStep } from '../live/kinds/q.live';

/** The story's goal and the idea step 1 rests on (K37: the glowing idea in view; K139: only Desalination glows). */
const GOAL_KEY = 'goal.water';
/** The story's LIVE keys: step 2's fresh ideas and step 3's question, each ending in its idea's id. */
const SUGG_KEY = 'sugg:hook:';
const Q_KEY = 'q:hook:';
/** K191 (water map A): Desalination hangs off the root beside Four National Taps, so step 1 rests on the root. */
const REST_KEY = 'concept.water.root';

export type HookPractice =
  | { readonly state: 'none' }
  | { readonly state: 'prepared'; readonly set: PreparedChoice<'adoptable_set'> }
  | { readonly state: 'loading'; readonly set: PreparedChoice<'adoptable_set'> }
  | {
      readonly state: 'ready';
      /** The prepared twin behind the question; null for a live question on an idea with none. */
      readonly set: PreparedChoice<'adoptable_set'> | null;
      readonly question: CampaignQuestion;
      /** When what is shown was made: the prepared record's time, or the live answer's. */
      readonly preparedAt: Date;
      /** A LIVE question's own set (Q-fresh, K103): its answers grade against its own key. */
      readonly freshSetId?: string;
      /** That LIVE set's own served trace, for Behind the scenes. */
      readonly liveTrace?: readonly CampaignTraceStep[] | null;
    }
  | { readonly state: 'failed'; readonly reason: string };

/** What made step 3's question, for Behind the scenes: the prepared set's run, or the LIVE set's own trace. */
export type QuestionRun = ({ readonly live: false } & CampaignSetRun) | { readonly live: true; readonly trace: readonly CampaignTraceStep[] | null };

/** The fresh ideas in step 2's drawer: a LIVE answer, or the prepared fresh batch when LIVE missed (K64). */
export interface HookFresh {
  readonly source: 'live' | 'prepared';
  readonly preparedAt: Date | null;
  readonly rows: readonly { readonly suggestion: ConceptSuggestion; readonly state: 'pending' | 'added' | 'dropped' }[];
}

export type HookAnswer =
  | { readonly state: 'none' }
  | { readonly state: 'checking'; readonly selected: string }
  | { readonly state: 'done'; readonly selected: string; readonly result: CampaignAnswerResult }
  | { readonly state: 'failed'; readonly selected: string; readonly reason: string };

/**
 * Steps 1 to 3 of the story (mockup `SCENES.hook`, lines 4169 to 4644) on the product's own reads:
 * the learner's water map, the Companion's pending suggestions around the won ideas that glow (by
 * the list, K139, only Desalination; the hidden fresh batches kept out until shown, K64), accept or
 * dismiss (K42), the new idea a prepared set is adopted by (V1), and that set's question. Which new idea has practice follows h3
 * = A: only an idea whose concept key equals a prepared twin's is served from the serve door, which
 * otherwise would start a generation no LIVE button pressed.
 *
 * Steps run 1 to 7 as the mockup counts them (1 your map, 2 it grows, 3 the new idea, 4 its
 * question, 5 the words, 6 the picture, 7 that's Chora); a step before `maxStep` is reviewed (K46).
 */
@Injectable({ providedIn: 'root' })
export class HookStory {
  private readonly manifests = inject(ManifestService);
  private readonly maps = inject(MapsService);
  private readonly concepts = inject(ConceptGraphService);
  private readonly decisions = inject(VisitDecisions);
  private readonly tally = inject(VisitTally);
  private readonly practiceApi = inject(CampaignPracticeService);
  private readonly studio = inject(TeacherStudio);
  private readonly visits = inject(VisitsService);

  constructor() {
    // Gap (a): the story takes its LIVE outcomes from the one LIVE door, so a press answered after its
    // drawer has gone (Back to step 1, the panel closed) still lands; the rows bind no outcome of their own.
    inject(LiveService).onOutcome((key, o) => {
      if (key.startsWith(SUGG_KEY)) this.onSuggOutcome(o, key.slice(SUGG_KEY.length));
      else if (key.startsWith(Q_KEY)) this.onQOutcome(o);
    });
  }

  private readonly statusSig = signal<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  private readonly errorSig = signal<string | null>(null);
  private readonly manifestSig = signal<PrewarmManifest | null>(null);
  private readonly graphSig = signal<MapGraph | null>(null);
  private readonly preparedIds = signal<ReadonlySet<string>>(new Set());
  private readonly pendingSig = signal<readonly ConceptSuggestion[]>([]);
  private readonly hiddenPendingSig = signal<readonly ConceptSuggestion[]>([]);
  private readonly freshSig = signal<HookFresh | null>(null);
  private readonly qLiveSig = signal(false);
  private readonly beatSig = signal<1 | 2 | 3 | 4 | 5>(1);
  private readonly subSig = signal<'a' | 'b'>('a');
  private readonly swapSig = signal(false);
  private readonly branchSig = signal<string | null>(null);
  private readonly acceptedSig = signal(false);
  private readonly skippedSig = signal<readonly string[]>([]);
  private readonly panelSig = signal(false);
  private readonly maxStepSig = signal(1);
  private readonly busySig = signal(false);
  private readonly focusSig = signal<ConceptNode | null>(null);
  private readonly practiceSig = signal<HookPractice>({ state: 'none' });
  private readonly answerSig = signal<HookAnswer>({ state: 'none' });
  private loading: Promise<void> | null = null;

  readonly status = this.statusSig.asReadonly();
  /** How far this visit got (K46): a step before it is reviewed, not redone. */
  readonly maxStep = this.maxStepSig.asReadonly();
  readonly error = this.errorSig.asReadonly();
  readonly graph = this.graphSig.asReadonly();
  readonly beat = this.beatSig.asReadonly();
  readonly sub = this.subSig.asReadonly();
  /** "Same you, new hat" over step 4a until the visitor continues (K34). */
  readonly swap = this.swapSig.asReadonly();
  readonly branch = this.branchSig.asReadonly();
  readonly accepted = this.acceptedSig.asReadonly();
  readonly panel = this.panelSig.asReadonly();
  /** Step 3's question's run (null until a question shows, or for a prepared set with no trace id). */
  readonly questionRun = computed((): QuestionRun | null => {
    const p = this.practiceSig();
    if (p.state !== 'ready') return null;
    if (p.freshSetId) return { live: true, trace: p.liveTrace ?? null };
    const focus = this.focusSig();
    const r = p.set?.records;
    if (!r?.trace_id || !focus) return null;
    return { live: false, traceId: r.trace_id, goalId: r.goal_id, conceptId: focus.conceptId, rung: r.rung };
  });
  /** Which "Behind the scenes" the footer opens (mockup hookXrayKind, line 4633): the beat's own work. */
  readonly xrayKind = computed((): XrayKind => {
    const b = this.beatSig();
    if (b === 3 && this.panelSig()) return 'q';
    if (b !== 4) return 'maps';
    const part = this.subSig() === 'a' ? 'a' : 'b';
    if (!this.studio.revisions().some((r) => r.part === part)) return 'draft';
    return part === 'a' ? 'words' : 'rev';
  });
  /** The ideas the visitor left out (h1's "one idea still glows" once there is one). */
  readonly skipped = this.skippedSig.asReadonly();
  readonly busy = this.busySig.asReadonly();
  readonly focusConcept = this.focusSig.asReadonly();
  readonly practice = this.practiceSig.asReadonly();
  readonly answer = this.answerSig.asReadonly();
  readonly fresh = this.freshSig.asReadonly();
  /** The question on screen came from a LIVE press (h3.bodyLive). */
  readonly qLive = this.qLiveSig.asReadonly();

  readonly companionName = computed(() => this.graphSig()?.attachedFamiliarName ?? '');
  readonly goalId = computed(() => this.manifestSig()?.world(GOAL_KEY) ?? '');
  /** When the chosen idea's prepared batch was made (its LIVE row's stamp, K101). */
  readonly branchPreparedAt = computed(() => this.batches().find((b) => b.records.focal_concept_id === this.branchSig())?.preparedAt ?? null);

  /** How many ideas the chosen idea's prepared batch holds (step 2 states it, K138 W3; stable after Add empties the pending read). */
  readonly branchCount = computed(() => this.batches().find((b) => b.records.focal_concept_id === this.branchSig())?.records.suggestion_ids.length ?? 0);

  /** The goal's prepared suggestion batches the story shows (not the hidden fresh ones), in run order. */
  private readonly batches = computed(() => {
    const m = this.manifestSig();
    if (!m) return [];
    const goal = m.world(GOAL_KEY);
    return m.choices('suggestions').filter((c) => !c.hidden && c.records.goal_id === goal);
  });

  /** The won ideas whose prepared batch still waits (a dismissed one no longer does): the glowing ideas to click (K37). */
  readonly frontier = computed(() => {
    const pending = new Set(this.pendingSig().map((s) => s.suggestionId));
    return this.batches()
      .filter((b) => b.records.suggestion_ids.some((id) => pending.has(id)))
      .map((b) => b.records.focal_concept_id);
  });

  /** The face-down suggestions fanned around each glowing idea (production's fog ghosts; never a hidden batch). */
  readonly fogGhosts = computed<readonly FogGhost[]>(() => {
    const open = new Set(this.frontier());
    const ids = this.batches().flatMap((b) => (open.has(b.records.focal_concept_id) ? b.records.suggestion_ids : []));
    const byId = new Map(this.pendingSig().map((s) => [s.suggestionId, s]));
    return ids.flatMap((id) => {
      const s = byId.get(id);
      return s ? [{ suggestionId: id, title: s.title ?? '', focalConceptId: s.focalConceptId ?? '' }] : [];
    });
  });

  /** The chosen idea's prepared batch, as pending in the product (K64: hidden ids never shown here). */
  readonly drawerSuggestions = computed(() => {
    const focal = this.branchSig();
    const batch = this.batches().find((b) => b.records.focal_concept_id === focal);
    if (!batch) return [];
    const byId = new Map(this.pendingSig().map((s) => [s.suggestionId, s]));
    return batch.records.suggestion_ids.flatMap((id) => (byId.has(id) ? [byId.get(id) as ConceptSuggestion] : []));
  });

  /** The chosen batch's prepared twin (V1): the set step 3's question comes from, for the idea it is adopted by. */
  private readonly twinSet = computed(() => {
    const batch = new Set(this.batches().find((b) => b.records.focal_concept_id === this.branchSig())?.records.suggestion_ids ?? []);
    const g = this.graphSig();
    return this.manifestSig()?.choices('adoptable_set').find((t) => t.records.goal_id === g?.goalId && batch.has(t.records.suggestion_id)) ?? null;
  });
  /** The twin's own suggestion was added this visit: its idea is on the map (whether its key matches is h3 = A's to say). */
  private readonly twinAdded = computed(() => {
    const set = this.twinSet();
    return !!set && this.decisions.all().get(set.records.suggestion_id)?.state === 'added';
  });
  /** One of the chosen batch's ideas went onto the map this visit. */
  private readonly batchAdded = computed(() => {
    const ids = this.batches().find((b) => b.records.focal_concept_id === this.branchSig())?.records.suggestion_ids ?? [];
    const decided = this.decisions.all();
    return ids.some((id) => decided.get(id)?.state === 'added');
  });
  /** K189 (1): step 2 may go on to step 3: the idea it asks about is on the map (with no twin, any of the batch's). */
  private readonly stepThreeReady = computed(() => (this.twinSet() ? this.twinAdded() : this.batchAdded()));
  /** K190: the idea step 3 asks about still waits, but its idea holds six already, so it can never join. */
  private readonly twinBlocked = computed(() => {
    const g = this.graphSig();
    const focal = this.branchSig();
    return !!this.twinSet() && !this.twinAdded() && !!g && !!focal && childCount(g, focal) >= MAX_CHILDREN;
  });
  /** K189 (1): the idea step 3 asks about while it still waits and room remains (h2.waitRO); null once it is on the map. */
  readonly waitsFor = computed(() => {
    const set = this.twinSet();
    return set && !this.twinAdded() && !this.twinBlocked() ? set.records.title : null;
  });
  /** K190: why step 2's Next skips step 3 (h2.fullSkip): the full idea and the idea that cannot join. */
  readonly fullSkip = computed(() => {
    const set = this.twinSet();
    if (!set || !this.twinBlocked()) return null;
    return { c: set.records.title, p: this.graphSig()?.concepts.find((c) => c.conceptId === this.branchSig())?.title ?? '' };
  });
  /** K189 (1): step 2's Next waits, greyed, until step 3's idea is on the map; K190: or goes on past step 3 when it cannot join. */
  readonly nextWaits = computed(
    () => this.beatSig() === 2 && this.branchSig() !== null && !this.reviewing() && !this.stepThreeReady() && !this.twinBlocked(),
  );
  /** "Leave them out" declines the batch, offered only until one of its ideas is added. */
  readonly branchUntouched = computed(() => !this.batchAdded());
  /**
   * K189 (1): what "Add all" adds: the batch's waiting ideas that fit under the chosen idea (the cap
   * counts its actual children), the one step 3 asks about first, never an idea already on the map.
   */
  readonly addAllIds = computed(() => {
    const g = this.graphSig();
    const focal = this.branchSig();
    if (!g || !focal) return [];
    const twin = this.twinSet()?.records.suggestion_id;
    const waiting = this.drawerSuggestions().filter((s) => !onMap(s, g));
    const order = [...waiting.filter((s) => s.suggestionId === twin), ...waiting.filter((s) => s.suggestionId !== twin)];
    return order.slice(0, Math.max(0, MAX_CHILDREN - childCount(g, focal))).map((s) => s.suggestionId);
  });

  readonly step = computed(() => {
    const b = this.beatSig();
    if (b <= 2) return b;
    if (b === 3) return this.panelSig() ? 4 : 3;
    if (b === 4) return this.subSig() === 'b' ? 6 : 5;
    return 7;
  });
  readonly reviewing = computed(() => this.step() < this.maxStepSig());
  /** The end of 4b with a picture change and nothing kept: the forward arrow reads "Keep and continue" (K56). */
  readonly keepPending = computed(
    () => this.beatSig() === 4 && this.subSig() === 'b' && !this.reviewing() && this.studio.lastPicture() !== null && this.studio.kept() === null,
  );
  /** The presenter's talking point for this beat (mockup SCENES.hook.review). */
  readonly talkKey = computed(() => (this.beatSig() === 4 && this.subSig() === 'b' ? 'h4b' : `h${this.beatSig()}`));

  readonly lensFocusId = computed(() => {
    const m = this.manifestSig();
    if (!m) return '';
    const b = this.beatSig();
    if (b === 1) return m.world(REST_KEY);
    if (this.panelSig() && this.focusSig()) return (this.focusSig() as ConceptNode).conceptId;
    return this.branchSig() ?? m.world(REST_KEY);
  });

  readonly glowIds = computed<readonly string[]>(() => {
    if (this.reviewing()) return [];
    const b = this.beatSig();
    if (b === 1) return this.frontier();
    if (b === 3 && this.acceptedSig() && !this.panelSig() && this.focusSig()) return [(this.focusSig() as ConceptNode).conceptId];
    return [];
  });

  readonly drawerOpen = computed(() => (this.beatSig() === 2 && this.branchSig() !== null) || this.panelSig());

  /** Reads the story's start; a second call while one reads joins it. */
  load(): Promise<void> {
    if (!this.loading) {
      this.loading = this.read().finally(() => {
        this.loading = null;
      });
    }
    return this.loading;
  }

  private async read(): Promise<void> {
    this.statusSig.set('loading');
    this.errorSig.set(null);
    try {
      const m = await this.manifests.load();
      this.manifestSig.set(m);
      const goal = m.world(GOAL_KEY);
      const g = await firstValueFrom(this.maps.getGraph(goal));
      this.graphSig.set(g);
      this.preparedIds.set(new Set(g.concepts.map((c) => c.conceptId)));
      await this.readPending();
      this.statusSig.set('ready');
    } catch (err: unknown) {
      this.fail(err);
    }
  }

  chooseBranch(focal: string): void {
    if (this.beatSig() !== 1 || this.branchSig() !== null || this.busySig() || !this.frontier().includes(focal)) return;
    this.branchSig.set(focal);
    this.freshSig.set(null);
    this.beatSig.set(2);
    this.markStep();
  }

  /**
   * "Add all" (h2.add, h2.addSome, h2.addLast): accept the batch's waiting ideas that fit (K189 (1)), the
   * one step 3 asks about first, then read what the product made of them and go on to step 3 once it is
   * on the map.
   */
  async acceptBranch(): Promise<void> {
    // Nothing waits that fits: the button is not shown, and a presenter's jump stops here.
    if (this.beatSig() !== 2 || this.acceptedSig() || this.reviewing() || this.busySig() || this.addAllIds().length === 0) return;
    const byId = new Map(this.drawerSuggestions().map((s) => [s.suggestionId, s]));
    const order = this.addAllIds().flatMap((id) => byId.get(id) ?? []);
    await this.decide('accept', order, async () => {
      this.graphSig.set(await firstValueFrom(this.maps.getGraph(this.goal())));
      if (this.stepThreeReady()) this.toQuestion();
    });
  }

  /**
   * K189 (1): one idea's own Add in step 2, one of the batch's or a fresh one; step 2 stays (its Next goes
   * on once the idea step 3 asks about is on the map). An added idea leaves the list for the map.
   */
  async addIdea(suggestionId: string): Promise<void> {
    if (this.beatSig() !== 2 || this.acceptedSig() || this.reviewing() || this.busySig()) return;
    const prepared = this.drawerSuggestions().find((s) => s.suggestionId === suggestionId);
    if (!prepared) return this.decideFresh(suggestionId, 'accept');
    await this.decide('accept', [prepared], async () => {
      this.graphSig.set(await firstValueFrom(this.maps.getGraph(this.goal())));
    });
  }

  /** Step 2 to step 3: the idea step 3 asks about glows, with its prepared question waiting (h3 = A). */
  private toQuestion(): void {
    const g = this.graphSig() as MapGraph;
    const focus = this.newIdeaToPractise(g, this.branchSig() as string);
    this.focusSig.set(focus.node);
    this.practiceSig.set(focus.set ? { state: 'prepared', set: focus.set } : { state: 'none' });
    this.acceptedSig.set(true);
    this.beatSig.set(3);
    this.markStep();
  }

  /** "Leave them out": a real dismiss (K42); step 1 returns with what still glows (K139: nothing, and Next goes on to the teacher). */
  async skipBranch(): Promise<void> {
    if (this.beatSig() !== 2 || this.acceptedSig() || this.reviewing() || this.busySig() || !this.branchUntouched()) return;
    const focal = this.branchSig() as string;
    await this.decide('dismiss', this.drawerSuggestions(), async () => {
      this.skippedSig.update((s) => [...s, focal]);
      this.branchSig.set(null);
      this.beatSig.set(1);
      this.maxStepSig.set(1);
    });
  }

  /** Step 3's drawer: the new idea's question from the serve door, only for a prepared set (h3 = A). */
  async openPanel(): Promise<void> {
    if (!this.acceptedSig() || this.panelSig() || this.reviewing() || !this.focusSig()) return;
    this.panelSig.set(true);
    this.beatSig.set(3);
    this.markStep();
    const p = this.practiceSig();
    if (p.state !== 'prepared') return;
    this.practiceSig.set({ state: 'loading', set: p.set });
    const concept = (this.focusSig() as ConceptNode).conceptId;
    try {
      const served = await firstValueFrom(this.practiceApi.load(this.goal(), concept, p.set.records.rung));
      if (served.status !== 'ready') {
        throw new Error(`[kiosk] the serve door answered ${served.status} for prepared set ${p.set.key}: it would have started a generation no LIVE button pressed`);
      }
      const question = parseCampaignQuestions(served.questions)[0];
      if (!question) throw new Error(`[kiosk] the serve door's ready set for ${p.set.key} holds no question it can show`);
      this.practiceSig.set({ state: 'ready', set: p.set, question, preparedAt: p.set.preparedAt });
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(reason);
      this.practiceSig.set({ state: 'failed', reason });
    }
  }

  /** A LIVE sugg press ended: its ideas joining the list, or the prepared fresh batch when it gave none (K64). */
  onSuggOutcome(o: LiveOutcome, focal: string | null = this.branchSig()): void {
    if (o.status === 'stopped') return;
    const live = liveRows(o);
    if (live) {
      this.freshSig.set({ source: 'live', preparedAt: null, rows: live });
      return;
    }
    const batch = (this.manifestSig() as PrewarmManifest)
      .choices('suggestions')
      .find((c) => c.hidden && c.records.focal_concept_id === focal && c.records.goal_id === this.goal());
    if (!batch) {
      console.error(`[kiosk] no prepared fresh ideas for ${String(focal)}: the LIVE press gave none and nothing stands behind it`);
      this.freshSig.set(null);
      return;
    }
    const byId = new Map(this.hiddenPendingSig().map((sg) => [sg.suggestionId, sg]));
    const rows = batch.records.suggestion_ids.flatMap((id) => (byId.has(id) ? [{ suggestion: byId.get(id) as ConceptSuggestion, state: 'pending' as const }] : []));
    this.freshSig.set({ source: 'prepared', preparedAt: batch.preparedAt, rows });
  }

  /** Add or Dismiss on one fresh idea; an added one is read back from the map. */
  async decideFresh(suggestionId: string, action: 'accept' | 'dismiss'): Promise<void> {
    const f = this.freshSig();
    if (!f || this.busySig()) return;
    this.busySig.set(true);
    try {
      const call = action === 'accept' ? this.concepts.acceptSuggestion(suggestionId) : this.concepts.dismissSuggestion(suggestionId);
      await firstValueFrom(call);
      const row = f.rows.find((r) => r.suggestion.suggestionId === suggestionId);
      if (row) this.decisions.record(row.suggestion, action);
      else console.error(`[kiosk] the decided fresh idea ${suggestionId} is not in its batch: the atlas will not show it`);
      const mark = action === 'accept' ? 'added' : 'dropped';
      this.freshSig.set({ ...f, rows: f.rows.map((r) => (r.suggestion.suggestionId === suggestionId ? { ...r, state: mark } : r)) });
      if (action === 'accept') this.graphSig.set(await firstValueFrom(this.maps.getGraph(this.goal())));
    } catch (err: unknown) {
      this.fail(err);
    } finally {
      this.busySig.set(false);
    }
  }

  /** A LIVE q press ended: a fresh set replaces the question (K103); a missed one leaves the prepared question. */
  onQOutcome(o: LiveOutcome): void {
    if (o.status !== 'done') return;
    const r = o.result as QResult;
    const question = r.questions[0];
    if (!question) {
      console.error(`[kiosk] the LIVE question set ${r.freshSetId} holds no question it can show`);
      return;
    }
    const p = this.practiceSig();
    const set = p.state === 'ready' || p.state === 'prepared' || p.state === 'loading' ? p.set : null;
    this.practiceSig.set({ state: 'ready', set, question, preparedAt: o.at, freshSetId: r.freshSetId, liveTrace: r.trace });
    this.answerSig.set({ state: 'none' });
    this.qLiveSig.set(true);
  }

  /** The rung the step 3 question sits on: the twin's, or a new idea's first. */
  practiceRung(): number {
    const p = this.practiceSig();
    return p.state === 'prepared' || p.state === 'loading' || p.state === 'ready' ? (p.set?.records.rung ?? 1) : 1;
  }

  /** One answer to the step 3 question, graded by rules on the server (no AI marks multiple choice). */
  async answerWith(optionId: string): Promise<void> {
    const p = this.practiceSig();
    if (p.state !== 'ready' || this.answerSig().state !== 'none' || this.reviewing()) return;
    this.answerSig.set({ state: 'checking', selected: optionId });
    try {
      const result = await firstValueFrom(
        this.practiceApi.answer(this.goal(), {
          concept_id: (this.focusSig() as ConceptNode).conceptId,
          rung: this.practiceRung(),
          question_index: p.question.sourceIndex,
          selected_option_id: optionId,
          ...(p.freshSetId ? { fresh_set_id: p.freshSetId } : {}),
        }),
      );
      this.answerSig.set({ state: 'done', selected: optionId, result });
      this.tally.answered();
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[kiosk] the step 3 answer was not graded: ${reason}`);
      this.answerSig.set({ state: 'failed', selected: optionId, reason });
    }
  }

  /** The footer's forward arrow (mockup hookNext): a step the visitor left untouched gets its prepared move. */
  async next(): Promise<void> {
    if (this.busySig()) return;
    if (this.reviewing()) return this.viewStep(this.step() + 1);
    const b = this.beatSig();
    if (b === 1) {
      const first = this.frontier()[0];
      if (first) this.chooseBranch(first);
      else this.toTeacher();
      return;
    }
    // K189 (1): Next waits, greyed, until the idea step 3 asks about is on the map; K190: when it cannot join
    // (its idea holds six), Next skips step 3 for the teacher, as "Leave them out" does.
    if (b === 2) {
      if (this.stepThreeReady()) return this.toQuestion();
      if (this.twinBlocked()) return this.toTeacher();
      return;
    }
    if (b === 3) return this.panelSig() || !this.acceptedSig() ? this.toTeacher() : this.openPanel();
    if (b === 4 && this.swapSig()) return this.dismissSwap();
    if (b === 4 && (this.studio.status() === 'idle' || this.studio.status() === 'loading')) await this.studio.load();
    if (b === 4 && this.studio.status() !== 'ready') return;
    // An untouched 4a gets its prepared change (the first chip) before the story moves on.
    if (b === 4 && this.subSig() === 'a') return this.studio.lastWords() ? this.toPicture() : this.studio.chip('scenario');
    if (b === 4) {
      // An untouched 4b gets its prepared change first; then "Keep and continue" is the teacher's approval (K56).
      if (!this.studio.lastPicture()) return this.studio.picChip('uv');
      if (!this.studio.kept()) await this.studio.keep();
      if (this.studio.kept()) this.toClosing();
    }
  }

  /** "Continue without keeping": learners still see the prepared version (h5.notKept). */
  continueNoKeep(): void {
    if (this.beatSig() !== 4 || this.subSig() !== 'b' || this.reviewing() || this.busySig()) return;
    this.toClosing();
  }

  /** Step 5, that's Chora: counted once for the presenter (mockup visit('hookDone')). */
  private toClosing(): void {
    const first = this.maxStepSig() < 7;
    this.beatSig.set(5);
    this.markStep();
    if (first) void this.visits.record('hook_done');
  }

  /**
   * The presenter's Jump to (mockup jumpTo): a beat already reached is reviewed; a later one is
   * reached by the story's own prepared moves, with the real calls they make (no model call).
   */
  async advanceToBeat(beat: 1 | 2 | 3 | 4 | 5): Promise<void> {
    const first = [0, 1, 2, 3, 5, 7][beat];
    if (this.maxStepSig() >= first) return this.viewStep(first);
    // A move that changes nothing (a refused read, a refused Keep) ends the jump: it is never retried.
    while (this.step() < first && this.statusSig() === 'ready') {
      const before = this.position();
      // The presenter's jump makes "Add all" step 2's prepared move, where the visitor's Next waits (K189 (1)).
      if (this.beatSig() === 2 && !this.stepThreeReady() && !this.twinBlocked()) await this.acceptBranch();
      else await this.next();
      if (this.position() === before) return;
    }
  }

  /** Where the story stands, for telling whether a move moved it. */
  private position(): string {
    const s = this.studio;
    return [this.step(), this.maxStepSig(), this.swapSig(), this.panelSig(), this.acceptedSig(), s.status(), s.revisions().length, s.kept() !== null].join('|');
  }

  back(): void {
    if (this.busySig() || this.step() <= 1) return;
    this.viewStep(this.step() - 1);
  }

  /** Shows an earlier (or the next reviewed) step without redoing it (K46). */
  viewStep(n: number): void {
    if (n < 1 || n > this.maxStepSig()) return;
    this.swapSig.set(false);
    this.studio.cancelEdit();
    if (n <= 2) {
      this.beatSig.set(n as 1 | 2);
      this.panelSig.set(false);
    } else if (n <= 4) {
      this.beatSig.set(3);
      this.panelSig.set(n === 4);
    } else if (n <= 6) {
      this.beatSig.set(4);
      this.subSig.set(n === 5 ? 'a' : 'b');
    } else {
      this.beatSig.set(5);
    }
  }

  /** "Same you, new hat": step 4 (K34), over the teacher's draft as it is read. */
  toTeacher(): void {
    this.beatSig.set(4);
    this.subSig.set('a');
    this.panelSig.set(false);
    this.swapSig.set(true);
    this.markStep();
    if (this.studio.status() === 'idle') void this.studio.load();
  }

  dismissSwap(): void {
    this.swapSig.set(false);
  }

  /** Step 4b, the picture, on the question the visitor checked. */
  toPicture(): void {
    if (this.beatSig() !== 4) return;
    this.studio.cancelEdit();
    this.subSig.set('b');
    this.markStep();
  }

  /** A new visitor starts at step 1 on a fresh read. */
  forget(): void {
    this.statusSig.set('idle');
    this.errorSig.set(null);
    this.manifestSig.set(null);
    this.graphSig.set(null);
    this.preparedIds.set(new Set());
    this.pendingSig.set([]);
    this.hiddenPendingSig.set([]);
    this.freshSig.set(null);
    this.qLiveSig.set(false);
    this.beatSig.set(1);
    this.subSig.set('a');
    this.swapSig.set(false);
    this.studio.forget();
    this.branchSig.set(null);
    this.acceptedSig.set(false);
    this.skippedSig.set([]);
    this.panelSig.set(false);
    this.maxStepSig.set(1);
    this.busySig.set(false);
    this.focusSig.set(null);
    this.practiceSig.set({ state: 'none' });
    this.answerSig.set({ state: 'none' });
  }

  private goal(): string {
    return (this.manifestSig() as PrewarmManifest).world(GOAL_KEY);
  }

  private markStep(): void {
    this.maxStepSig.update((m) => Math.max(m, this.step()));
  }

  private async readPending(): Promise<void> {
    const m = this.manifestSig() as PrewarmManifest;
    const list = await firstValueFrom(this.concepts.getSuggestions(undefined, this.goal()));
    this.pendingSig.set(list.suggestions.filter((s) => !m.hiddenSuggestionIds.has(s.suggestionId)));
    // K64: the hidden fresh batches stay off every read until a missed LIVE press shows one.
    this.hiddenPendingSig.set(list.suggestions.filter((s) => m.hiddenSuggestionIds.has(s.suggestionId)));
  }

  /** Accepts or dismisses the given suggestions of the chosen batch, in order, then re-reads. */
  private async decide(action: 'accept' | 'dismiss', list: readonly ConceptSuggestion[], then: () => Promise<void>): Promise<void> {
    this.busySig.set(true);
    try {
      for (const s of list) {
        const call = action === 'accept' ? this.concepts.acceptSuggestion(s.suggestionId) : this.concepts.dismissSuggestion(s.suggestionId);
        await firstValueFrom(call);
        this.decisions.record(s, action);
      }
      await then();
      await this.readPending();
    } catch (err: unknown) {
      this.fail(err);
    } finally {
      this.busySig.set(false);
    }
  }

  /** The ideas minted this visit under an idea: on the map now, not in the prepared map. */
  private mintedUnder(g: MapGraph, focal: string): ConceptNode[] {
    const prepared = this.preparedIds();
    const under = new Set(g.edges.filter((e) => e.sourceConceptId === focal).map((e) => e.targetConceptId));
    return g.concepts.filter((c) => !prepared.has(c.conceptId) && under.has(c.conceptId));
  }

  /**
   * The ideas the accept minted (on the map now, not in the prepared map, under the chosen idea),
   * and the one the chosen batch's prepared twin is for. The twin is found by the records: its
   * suggestion is in the batch the visitor accepted (K139: the V1 twin comes from Desalination's
   * ideas). The accept answers no concept id, so the minted idea is the one carrying the twin's
   * concept key by production's own rule, the key the product adopts the set by (h3 = A). With no
   * twin for the batch, the first new idea glows and its drawer says no question was prepared.
   */
  private newIdeaToPractise(g: MapGraph, focal: string): { node: ConceptNode | null; set: PreparedChoice<'adoptable_set'> | null } {
    const fresh = this.mintedUnder(g, focal);
    const set = this.twinSet();
    if (!set) return { node: fresh[0] ?? null, set: null };
    const node = fresh.find((c) => normalizeConceptKey(c.title) === set.records.concept_key);
    if (node) return { node, set };
    console.error(`[kiosk] the accept made no idea with ${set.key}'s concept key ${set.records.concept_key}: its prepared question cannot be adopted, so none is shown`);
    return { node: fresh[0] ?? null, set: null };
  }

  private fail(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[kiosk] the story could not read the product: ${message}`);
    this.errorSig.set(message);
    this.statusSig.set('failed');
  }
}
