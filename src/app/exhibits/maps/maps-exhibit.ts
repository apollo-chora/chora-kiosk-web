import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { ConceptSuggestion } from '../../aplus/discovery-graph/concept-graph.model';
import { ConceptGraphService } from '../../aplus/discovery-graph/concept-graph.service';
import type { MapGraph } from '../../aplus/my-knowledge/maps.model';
import { MapsService } from '../../aplus/my-knowledge/maps.service';
import { ManifestService, type PrewarmManifest } from '../../kiosk-api/manifest.service';
import { GOAL_KEYS, type GoalKey } from '../world-goals';

/** What the maps scene shows: the atlas, or one region's map. */
export type MapsView = 'atlas' | GoalKey;

/** One of the learner's maps as the atlas shows it: the map read, its Companion and its waiting suggestions. */
export interface AtlasRegion {
  readonly key: GoalKey;
  readonly goalId: string;
  readonly title: string;
  readonly companionId: string;
  readonly companionName: string;
  readonly map: MapGraph;
  readonly rootId: string;
  /** The waiting suggestions the visitor may see (the hidden fresh batches kept out, K64). */
  readonly pending: readonly ConceptSuggestion[];
  /** The hidden fresh batches' waiting suggestions: shown only when a LIVE press misses (K64). */
  readonly hiddenPending: readonly ConceptSuggestion[];
}

/**
 * The atlas's reads (mockup atlasHTML and visitMap; K36, K42): the learner's maps from the product,
 * which must be exactly the world's three goals, each map's graph and its waiting suggestions. Read
 * again on every entry, so whatever the visit changed in another scene shows (orchestrator, 18 Oct,
 * answer 2); the maps on screen stay up while a re-read runs. Forgotten when the visit ends.
 */
@Injectable({ providedIn: 'root' })
export class MapsExhibit {
  private readonly manifests = inject(ManifestService);
  private readonly maps = inject(MapsService);
  private readonly concepts = inject(ConceptGraphService);

  private readonly statusSig = signal<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  private readonly regionsSig = signal<readonly AtlasRegion[]>([]);
  private readonly manifestSig = signal<PrewarmManifest | null>(null);
  private readonly wantSig = signal<{ readonly view: MapsView; readonly seq: number } | null>(null);
  private readonly viewingSig = signal<MapsView | 'drawer'>('atlas');
  private wants = 0;
  private reading: Promise<void> | null = null;
  /** Counts visitors: a read that outlives its visit (a reset) writes nothing. */
  private visit = 0;

  readonly status = this.statusSig.asReadonly();
  readonly regions = this.regionsSig.asReadonly();
  readonly manifest = this.manifestSig.asReadonly();
  /** K173: the tour's view for the maps scene, until the scene has applied it (each scene starts on the atlas). */
  readonly wanted = this.wantSig.asReadonly();

  /** K173 (Back's own view first): what the maps scene shows, as it reports it: the atlas, a region, or an idea's drawer. */
  readonly viewing = this.viewingSig.asReadonly();

  setViewing(view: MapsView | 'drawer'): void {
    this.viewingSig.set(view);
  }

  /** K173: the tour asks for the atlas, or a region (its hero map, Singapore's water). */
  want(view: MapsView): void {
    this.wantSig.set({ view, seq: ++this.wants });
  }

  /** The scene applied the tour's view: a scene built later starts on the atlas, as before the tour. */
  applied(seq: number): void {
    if (this.wantSig()?.seq === seq) this.wantSig.set(null);
  }

  /** Reads the atlas on entering it; a read already running is shared. */
  enter(): Promise<void> {
    if (!this.reading) {
      this.reading = this.read().finally(() => {
        this.reading = null;
      });
    }
    return this.reading;
  }

  forget(): void {
    this.visit++;
    this.wantSig.set(null);
    this.statusSig.set('idle');
    this.regionsSig.set([]);
    this.manifestSig.set(null);
  }

  private async read(): Promise<void> {
    const visit = this.visit;
    if (this.statusSig() !== 'ready') this.statusSig.set('loading');
    try {
      const m = await this.manifests.load();
      const listed = new Set((await firstValueFrom(this.maps.listMaps())).map((c) => c.goalId));
      const world = GOAL_KEYS.map((key) => ({ key, goalId: m.world(key) }));
      const missing = world.filter((w) => !listed.has(w.goalId));
      if (missing.length) throw new Error(`[kiosk] the atlas lacks the world's maps ${missing.map((w) => `${w.key} ${w.goalId}`).join(', ')}`);
      const extra = [...listed].filter((id) => !world.some((w) => w.goalId === id));
      if (extra.length) throw new Error(`[kiosk] the atlas holds maps the world does not: ${extra.join(', ')}`);
      const regions: AtlasRegion[] = [];
      for (const { key, goalId } of world) {
        const map = await firstValueFrom(this.maps.getGraph(goalId));
        if (!map.attachedFamiliarId) throw new Error(`[kiosk] the map of ${key} names no Companion`);
        if (!map.rootConceptId) throw new Error(`[kiosk] the map of ${key} names no root`);
        const list = await firstValueFrom(this.concepts.getSuggestions(undefined, goalId));
        regions.push({
          key,
          goalId,
          title: map.title,
          companionId: map.attachedFamiliarId,
          companionName: map.attachedFamiliarName ?? '',
          map,
          rootId: map.rootConceptId,
          pending: list.suggestions.filter((s) => !m.hiddenSuggestionIds.has(s.suggestionId)),
          hiddenPending: list.suggestions.filter((s) => m.hiddenSuggestionIds.has(s.suggestionId)),
        });
      }
      if (visit !== this.visit) return;
      this.manifestSig.set(m);
      this.regionsSig.set(regions);
      this.statusSig.set('ready');
    } catch (err: unknown) {
      if (visit !== this.visit) return;
      console.error(`[kiosk] the atlas could not be read: ${err instanceof Error ? err.message : String(err)}`);
      this.statusSig.set('failed');
    }
  }
}
