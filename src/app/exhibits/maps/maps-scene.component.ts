import { ChangeDetectionStrategy, Component, DestroyRef, TemplateRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { CampaignNodeState, FogGhost } from '../../aplus/my-knowledge/campaign.model';
import {
  campaignHexState,
  isDueNode,
  isShakyNode,
  roundedHexPath,
  wonDescendantCount,
  type PaintLens,
} from '../../aplus/my-knowledge/concept-lens-map/concept-lens';
import { ConceptLensMapComponent } from '../../aplus/my-knowledge/concept-lens-map/concept-lens-map.component';
import { ContentDirective } from '../../i18n/content.directive';
import { KioskLanguage } from '../../i18n/i18n';
import { LiveRowComponent } from '../../live/live-row.component';
import { IconComponent } from '../../shared/icon/icon.component';
import type { IconName } from '../../shared/icon/icons';
import { LadderComponent } from '../../shared/ladder/ladder.component';
import { RevealDirective } from '../../shared/reveal.directive';
import { freshGroup, waitingList } from '../../shared/sugg/sugg-list';
import { SuggRowsComponent, type SuggDecision } from '../../shared/sugg/sugg-rows.component';
import { VisitDecisions } from '../../shared/sugg/visit-decisions';
import { formatWhen, singaporeDay } from '../../shared/when';
import { provideSceneFooter } from '../../shell/footer-slot';
import { KioskStore } from '../../shell/kiosk.store';
import { TourFooterComponent } from '../../shell/tour/tour-footer.component';
import { provideTourNav } from '../../shell/tour/tour-nav';
import { CompanionsExhibit } from '../companions/companions-exhibit';
import type { GoalKey } from '../world-goals';
import { ATLAS_CX, batchRows, regionCounts, regionMinis } from './atlas.model';
import { ReadinessService } from '../../kiosk-api/readiness.service';
import { MapsDrawer, visitFresh, type AnsweredClimb, type DrawerTab } from './maps-drawer';
import { MapsExhibit, type AtlasRegion, type MapsView } from './maps-exhibit';
import { MAP_LENS_CHROME, MAP_LENS_FRAME } from '../../shared/lens-frames';
import { XrayButtonComponent } from '../../xray/xray-button.component';
import { VisitOrderPipe } from '../../shared/visit-order';
import { PreparedInfoComponent } from '../../shared/prepared-info/prepared-info.component';

/** The zoom into a region before its map shows (mockup openRegion's wait). */
export const MAPS_ZOOM_MS = 420;
const TABS: readonly DrawerTab[] = ['overview', 'sugg'];

/** The campaign line of an idea (mockup campLine): won (today, or when) with what it holds; its climb; or claimed. */
type CampLine =
  | { readonly kind: 'won'; readonly today: boolean; readonly when: string; readonly held: number }
  | { readonly kind: 'climbing'; readonly rungs: number; readonly next: number; readonly counted: number }
  | { readonly kind: 'claimed' };
const PAINTS: readonly { key: Exclude<PaintLens, 'familiar'>; icon: IconName }[] = [
  { key: 'explore', icon: 'lens_explore' },
  { key: 'growth', icon: 'lens_growth' },
  { key: 'mastery', icon: 'lens_mastery' },
];

/**
 * The learner's atlas (mockup SCENES.maps, atlasHTML, regionHTML and openRegion, lines 4689 to 4784;
 * K36, K37, K42, K63): three equal regions, one per map; a click zooms into a region, which shows
 * production's map as-is: the lens pills, the campaign HUD and the lens, the gold glow on the ideas
 * a prepared practice set waits on, and the fog of waiting suggestions (never a hidden batch, K64).
 * The atlas is read again on every entry. Back steps out: a region to the atlas, the atlas to the hall.
 */
@Component({
  selector: 'kiosk-maps-scene',
  imports: [TranslatePipe, ContentDirective, IconComponent, ConceptLensMapComponent, LadderComponent, LiveRowComponent, RevealDirective, SuggRowsComponent, XrayButtonComponent, VisitOrderPipe, PreparedInfoComponent, TourFooterComponent],
  providers: [MapsDrawer],
  templateUrl: './maps-scene.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapsSceneComponent {
  protected readonly exhibit = inject(MapsExhibit);
  protected readonly store = inject(KioskStore);
  protected readonly lang = inject(KioskLanguage).lang;
  protected readonly drawer = inject(MapsDrawer);
  private readonly companions = inject(CompanionsExhibit);
  private readonly decisions = inject(VisitDecisions);
  private readonly readiness = inject(ReadinessService);
  private readonly footer = viewChild<TemplateRef<unknown>>('footer');
  protected readonly hexPath = roundedHexPath();
  protected readonly paints = PAINTS;
  protected readonly tabs = TABS;
  protected readonly markers = ['A', 'B', 'C', 'D'];
  /** The map's frame (MAP_LENS_FRAME): with the drawer open, the lens's shiftX centres its focus in the strip left visible. */
  protected readonly frame = MAP_LENS_FRAME;
  /** K204: the caption card over the frame's top-left corner, which the picked idea's ring keeps clear of. */
  protected readonly chrome = MAP_LENS_CHROME;

  private readonly regionKey = signal<GoalKey | null>(null);
  /** The region being zoomed into, before its map shows. */
  protected readonly zooming = signal<number | null>(null);
  protected readonly paint = signal<Exclude<PaintLens, 'familiar'>>('explore');
  private zoomTimer: ReturnType<typeof setTimeout> | null = null;

  /** The atlas's regions: each map's title, count, Companion and minis about its centre. */
  protected readonly atlas = computed(() =>
    this.exhibit.regions().map((r, i) => ({ key: r.key, title: r.title, companion: r.companionName, cx: ATLAS_CX[i], counts: regionCounts(r.map), minis: regionMinis(r.map, ATLAS_CX[i]) })),
  );

  protected readonly region = computed(() => this.exhibit.regions().find((r) => r.key === this.regionKey()) ?? null);

  /** The campaign HUD (mockup hudHTML): the march, or production's unassigned line once it is won; the won count. */
  protected readonly hud = computed(() => {
    const r = this.region();
    if (!r) return null;
    const nodes = r.map.campaign?.nodes ?? {};
    const march = r.map.concepts.find((c) => c.conceptId === r.map.campaign?.focusConceptId);
    const { n, won } = regionCounts(r.map);
    return { march: march && !nodes[march.conceptId]?.wonAt ? march.title : null, name: r.companionName, won, n };
  });

  /** The unwon ideas a prepared practice set waits on at their next rung (K37: the ideas to click next). */
  protected readonly glowIds = computed(() => {
    const r = this.region();
    const m = this.exhibit.manifest();
    if (!r || !m) return [];
    const nodes = r.map.campaign?.nodes ?? {};
    const on = new Set(r.map.concepts.map((c) => c.conceptId));
    const ids = m
      .choices('practice_set')
      .filter((c) => c.records.goal_id === r.goalId && on.has(c.records.concept_id))
      .filter((c) => !nodes[c.records.concept_id]?.wonAt && c.records.rung === (nodes[c.records.concept_id]?.rungsCleared ?? 0) + 1)
      .map((c) => c.records.concept_id);
    return [...new Set(ids)];
  });

  /** The visible batches' ideas still waiting, fanned around their idea (never a hidden batch, K64; none already on the map). */
  protected readonly fogGhosts = computed<readonly FogGhost[]>(() => {
    const r = this.region();
    const m = this.exhibit.manifest();
    if (!r || !m) return [];
    return fogOf(r, m.choices('suggestions').filter((c) => !c.hidden && c.records.goal_id === r.goalId).flatMap((c) => c.records.suggestion_ids), this.decisions.all());
  });

  /** Where the lens rests (mockup lensFocusFor): the root, or under Growth the first idea to grow that is not won. */
  protected readonly focusId = computed(() => {
    const r = this.region();
    if (!r) return '';
    if (this.paint() === 'growth') {
      const nodes = r.map.campaign?.nodes ?? {};
      const grow = r.map.concepts.find((c) => (isShakyNode(c) || isDueNode(c)) && !nodes[c.conceptId]?.wonAt);
      if (grow) return grow.conceptId;
    }
    return r.rootId;
  });

  /** The lens rests on the open idea (mockup openConcept), else as focusId says. */
  protected readonly lensFocus = computed(() => this.drawer.concept() ?? this.focusId());

  /** The open idea's Overview (mockup overviewTabHTML): terrain, campaign line, ladder, practice; and its one list of waiting ideas (K189). */
  protected readonly view = computed(() => {
    const r = this.region();
    const id = this.drawer.concept();
    const node = r?.map.concepts.find((c) => c.conceptId === id);
    if (!r || !id || !node) return null;
    const nodes = r.map.campaign?.nodes ?? {};
    const st = climbAfterAnswer(nodes[id], this.drawer.climbs().get(id), r.map);
    const cs = campaignHexState(st, true);
    const due = isDueNode(node) && !this.drawer.refreshed().has(id);
    // Answer 3: Due alone when due; shaky only when not due (the seed's due cue carries a Growth Edge too).
    const terrain = [...(due ? ['due'] : []), ...(isShakyNode(node) && !isDueNode(node) ? ['shaky'] : []), ...(node.mastered ? ['mastered'] : [])];
    let camp: CampLine = { kind: 'claimed' };
    if (cs === 'province' && st?.wonAt) {
      camp = { kind: 'won', today: singaporeDay(st.wonAt) === singaporeDay(new Date().toISOString()), when: formatWhen(st.wonAt, this.lang()), held: wonDescendantCount(id, r.map.edges, nodes) };
    } else if ((cs === 'frontier-climbing' || cs === 'frontier-cooling') && st) {
      camp = { kind: 'climbing', rungs: st.rungsCleared, next: Math.min(6, st.rungsCleared + 1), counted: st.currentRungCorrect };
    }
    const won = cs === 'province';
    const set = this.drawer.setFor(r, id);
    const ready = this.readiness.readiness();
    // W46: only this demo session's presses: rows made after the last reset (or the snapshot's restore).
    const since = ready?.last_reset?.finished_at ?? ready?.snapshot?.restored_at ?? null;
    const decided = this.decisions.all();
    // K189 (2), R1: one list of the idea's waiting ideas, this demo session's fresh ones on top, then its shown
    // batch (a won idea's own; the root's batch stays behind its LIVE row, ruled 18 Oct).
    const visible = won && id !== r.rootId ? this.drawer.batch(r, id, false) : null;
    const batched = visible ? batchRows(visible.records.suggestion_ids, r.pending, decided, r.map) : [];
    const groups = visitFresh(this.drawer.fresh().get(id), id, r.pending, decided, this.drawer.batchIds(r), since).map((f) => freshGroup(f, r.map));
    const list = waitingList(batched, groups, visible?.preparedAt ?? null);
    const suggKey = `sugg:${r.key.split('.')[1]}:${id}`;
    return {
      region: r,
      id,
      title: node.title,
      terrain: terrain.length ? terrain : ['explore'],
      camp,
      cleared: won ? 6 : (st?.rungsCleared ?? 0),
      won,
      set: set ? { preparedWhen: formatWhen(set.preparedAt.toISOString(), this.lang()) } : null,
      liveKey: `q:${r.key.split('.')[1]}:${id}`,
      suggKey,
      hiddenAt: this.drawer.batch(r, id, true)?.preparedAt ?? null,
      batched: batched.length > 0,
      list,
      // K101, gap (b): each prepared batch listed is stamped at its own time, the fallback's beside its miss.
      preparedAt: list.preparedAt,
      fallbackAt: list.fallbackAt,
      // Condition (a): a list its ideas left says plainly where they went, so it emptied only once it held some.
      emptyKey: list.added ? 'kd.sugg.allOnMap' : 'kd.sugg.none',
      emptied: list.rows.length === 0 && (batched.length > 0 || groups.some((g) => g.rows.length > 0)),
    };
  });

  /**
   * The open idea's Suggestions (mockup suggTabHTML): the root has only its LIVE row until it has ideas
   * (ruled 18 Oct over the mockup's kd.sugg.root, since the root holds a real prepared batch); an idea
   * not won is locked; a won idea with a batch behind it (shown, or hidden behind the LIVE row, K64)
   * shows its one list (K189) and the LIVE row, saying so when none wait; with no batch, only that line.
   */
  protected readonly sugg = computed(() => {
    const v = this.view();
    if (!v) return null;
    if (v.id === v.region.rootId) return { ...v, kind: 'list' as const, empty: v.emptied };
    if (!v.won) return { ...v, kind: 'locked' as const, empty: false };
    if (v.batched || v.hiddenAt) return { ...v, kind: 'list' as const, empty: v.list.rows.length === 0 };
    return { ...v, kind: 'none' as const, empty: true };
  });

  constructor() {
    provideSceneFooter(this.footer);
    void this.exhibit.enter();
    // K173: the tour's view, applied once: a scene built for it opens straight on it; with the atlas on screen a region zooms in.
    let entered = false;
    effect(() => {
      const w = this.exhibit.wanted();
      if (w) {
        untracked(() => this.applyWanted(w.view, entered));
        this.exhibit.applied(w.seq);
      }
      entered = true;
    });
    effect(() => this.exhibit.setViewing(this.drawer.concept() ? 'drawer' : (this.regionKey() ?? 'atlas')));
    provideTourNav();
    inject(DestroyRef).onDestroy(() => {
      if (this.zoomTimer) clearTimeout(this.zoomTimer);
    });
  }

  /** A region's click (mockup openRegion): the atlas zooms about it, then its map shows. */
  protected openRegion(i: number): void {
    const r = this.exhibit.regions()[i];
    if (!r || this.zooming() !== null) return;
    this.zooming.set(i);
    this.zoomTimer = setTimeout(() => {
      this.zoomTimer = null;
      this.zooming.set(null);
      this.paint.set('explore');
      this.regionKey.set(r.key);
    }, MAPS_ZOOM_MS);
  }

  /** K173: the tour's view: the atlas; or a region, zoomed into when the atlas has been on screen, else opened straight. */
  private applyWanted(view: MapsView, entered: boolean): void {
    if (view === 'atlas') return this.toAtlas();
    const i = this.exhibit.regions().findIndex((r) => r.key === view);
    this.drawer.close();
    if (entered && i >= 0 && this.regionKey() === null && this.zooming() === null) return this.openRegion(i);
    if (this.zoomTimer) clearTimeout(this.zoomTimer);
    this.zoomTimer = null;
    this.zooming.set(null);
    this.paint.set('explore');
    this.regionKey.set(view);
  }

  protected toAtlas(): void {
    this.drawer.close();
    this.regionKey.set(null);
    this.paint.set('explore');
  }

  /** "Practise today's dose" (mockup doseFromMap): this map's Companion on its dose, counted as a Companions visit. */
  protected doseFromMap(r: AtlasRegion): void {
    void this.companions.openDoseFor(r.companionId);
    this.store.openScene('comp');
  }

  protected optionClass(optionId: string): string {
    const a = this.drawer.answer();
    if (a.state !== 'done') return '';
    if (optionId === a.result.correct_option_id) return 'right';
    return optionId === a.selected ? 'miss' : '';
  }

  protected decide(r: AtlasRegion, d: SuggDecision): void {
    void this.drawer.decide(r, d.id, d.choice, d.fresh);
  }

  protected setPaint(k: Exclude<PaintLens, 'familiar'>): void {
    this.paint.set(k);
  }

  protected zoomOrigin(i: number): string {
    return `${ATLAS_CX[i]}px 300px`;
  }

}

/**
 * K138 W12: the open idea's climb as its last graded answer left it (the record's count and rungs come back
 * with the grade, as the hook's drawer reads them), while the map on screen is the read it was answered on.
 */
function climbAfterAnswer(st: CampaignNodeState | undefined, climb: AnsweredClimb | undefined, read: object): CampaignNodeState | undefined {
  if (!climb || climb.read !== read) return st;
  return { cooling: false, advancedToday: false, ...st, rungsCleared: climb.rungsCleared, currentRungCorrect: climb.currentRungCorrect };
}

/** The fog ghosts of a region's prepared ideas: waiting, not decided this visit, not already on the map. */
function fogOf(r: AtlasRegion, ids: readonly string[], decided: ReadonlyMap<string, unknown>): readonly FogGhost[] {
  const titles = new Set(r.map.concepts.map((c) => c.title));
  const waiting = new Map(r.pending.map((s) => [s.suggestionId, s]));
  return ids.flatMap((id) => {
    const s = waiting.get(id);
    if (!s || decided.has(id) || (s.title && titles.has(s.title))) return [];
    return [{ suggestionId: id, title: s.title ?? '', focalConceptId: s.focalConceptId ?? '' }];
  });
}
