import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { WordRevisionTemplate } from '../live/kinds/word-revision';

/**
 * The golden run's manifest (conductor `GET /api/v1/kiosk/prewarm/manifest`; the shape is
 * kiosk/world/PREPARED-CHOICES.md section 6, which supersedes API.md section 6's draft). It
 * maps every prepared choice to the product records the screens read through the product
 * API, and every world key (`goal.water`, `companion.pingu`) to its id, so kiosk-web never
 * matches a record by its title. Frozen in the golden snapshot, so one read serves the app.
 */
export const MANIFEST_FORMAT = 'chora-kiosk/prewarm-manifest/v1';
const MANIFEST_URL = '/api/v1/kiosk/prewarm/manifest';

/** Each kind's `records` (PREPARED-CHOICES.md section 5). */
export interface ManifestRecords {
  readonly suggestions: {
    readonly goal_id: string;
    readonly focal_concept_id: string;
    readonly request_id: string;
    readonly suggestion_ids: readonly string[];
    readonly titles: readonly string[];
    readonly edge_suggestion_ids: readonly string[];
  };
  readonly practice_set: {
    readonly goal_id: string;
    readonly concept_id: string;
    readonly concept_key: string;
    readonly rung: number;
    readonly trace_id: string;
    readonly question_count: number;
  };
  readonly adoptable_set: {
    readonly goal_id: string;
    readonly suggestion_id: string;
    readonly title: string;
    readonly concept_key: string;
    readonly rung: number;
    readonly twin_concept_id: string;
    readonly twin_edge_id: string;
    readonly trace_id: string;
    readonly question_count: number;
  };
  readonly question_draft: {
    readonly atom_id: string;
    readonly job_id: string;
    readonly draft_id: string;
    readonly question_type: 'mcq' | 'oe';
    readonly image_url: string | null;
    readonly image_gcs_uri: string | null;
    readonly image_mode: 'mermaid' | 'scene' | null;
  };
  readonly word_revision: ManifestRecords['question_draft'] & { readonly from_draft_id: string };
  readonly picture_regen: {
    readonly atom_id: string;
    readonly parent_job_id: string;
    readonly draft_id: string;
    readonly regen_job_id: string;
    readonly mode: 'mermaid' | 'scene';
    readonly source_image_gcs_uri: string | null;
    readonly image_url: string;
    readonly image_gcs_uri: string;
  };
  readonly accept: {
    readonly atom_id: string;
    readonly job_id: string;
    readonly draft_id: string;
    readonly question_id: string;
    readonly image_url: string | null;
  };
  readonly manual_copy: {
    readonly atom_id: string;
    readonly manual_job_id: string;
    readonly from_job_id: string;
    readonly from_draft_id: string;
    readonly question_id: string;
    readonly image_url: string | null;
  };
  readonly bank: {
    readonly bank_id: string;
    readonly question_ids: readonly string[];
    readonly assemble_job_id: string;
    readonly test_set_id: string;
  };
  readonly graded_sample: {
    readonly assessment_id: string;
    readonly submission_id: string;
    readonly test_set_id: string;
    readonly test_set_question_id: string;
    readonly question_id: string;
    readonly ai_points_earned: number;
    readonly points_possible: number;
  };
  readonly greeting: { readonly companion_id: string; readonly turn_id: string; readonly model: string };
  readonly dose_open: {
    readonly goal_id: string;
    readonly dose_id: string;
    readonly served_on: string;
    readonly atom_ids: readonly string[];
    readonly greeting_companion_id: string | null;
  };
  /**
   * K158 (5.13): a prepared paper's analyser run, left at its review (D6); its prepared_at is the
   * job's review_ready_at. The panel the screen shows is the job's own read, never these copies.
   */
  readonly weakness_paper: {
    readonly upload_id: string;
    readonly goal_id: string;
    /** The Companion whose ability shows the paper (recorded, never sent, D11). */
    readonly companion_id: string;
    readonly sha256: string;
    readonly status: 'AWAITING_REVIEW';
    readonly proposed_edges: readonly { readonly id: string; readonly concept: string; readonly descriptor: string; readonly confidence: number }[];
  };
}

export type ManifestKind = keyof ManifestRecords;

export interface ManifestChoiceWire {
  readonly kind: ManifestKind;
  readonly stage: string;
  readonly hidden: boolean;
  readonly prepared_at: string;
  readonly run_at: string;
  readonly params_sha256: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly records: unknown;
  /** The models each tier routed to when this choice ran (the run step's stamp, K72); absent when unstamped. */
  readonly models?: Readonly<Record<string, string>>;
}

export interface PrewarmManifestWire {
  readonly format: string;
  readonly made_at: string;
  readonly commit: string;
  readonly list_sha256: string;
  readonly world: Readonly<Record<string, string>>;
  readonly templates: { readonly word_revision: WordRevisionTemplate };
  readonly choices: Readonly<Record<string, ManifestChoiceWire>>;
}

/** One prepared choice: its records, its parameters (a chip's prompt and mode) and its stamp. */
export interface PreparedChoice<K extends ManifestKind> {
  readonly key: string;
  readonly kind: K;
  readonly hidden: boolean;
  readonly params: Readonly<Record<string, unknown>>;
  readonly records: ManifestRecords[K];
  /** The record's own time from the golden run (ADR-259 D9 rule 1, K101): the screen's stamp. */
  readonly preparedAt: Date;
  /** The run's models stamp per tier (K72), when the run step recorded one. */
  readonly models?: Readonly<Record<string, string>>;
}

export class PrewarmManifest {
  /** Suggestions and edge suggestions of the hidden fresh batches (K64): off every read until shown. */
  readonly hiddenSuggestionIds: ReadonlySet<string>;

  constructor(private readonly wire: PrewarmManifestWire) {
    const hidden = new Set<string>();
    for (const c of Object.values(wire.choices)) {
      if (c.kind !== 'suggestions' || !c.hidden) continue;
      const r = c.records as ManifestRecords['suggestions'];
      for (const id of [...r.suggestion_ids, ...r.edge_suggestion_ids]) hidden.add(id);
    }
    this.hiddenSuggestionIds = hidden;
  }

  get wordRevisionTemplate(): WordRevisionTemplate {
    return this.wire.templates.word_revision;
  }

  world(key: string): string {
    const id = this.wire.world[key];
    if (!id) throw new Error(`[kiosk] the manifest has no world key ${key}`);
    return id;
  }

  has(key: string): boolean {
    return key in this.wire.choices;
  }

  choice<K extends ManifestKind>(key: string, kind: K): PreparedChoice<K> {
    const c = this.wire.choices[key];
    if (!c) throw new Error(`[kiosk] the manifest has no prepared choice ${key}`);
    if (c.kind !== kind) throw new Error(`[kiosk] prepared choice ${key} is a ${c.kind}, not a ${kind}`);
    return {
      key,
      kind,
      hidden: c.hidden,
      params: c.params,
      records: c.records as ManifestRecords[K],
      preparedAt: new Date(c.prepared_at),
      ...(c.models ? { models: c.models } : {}),
    };
  }

  /** Every prepared choice of a kind, in the manifest's order. */
  choices<K extends ManifestKind>(kind: K): PreparedChoice<K>[] {
    return Object.keys(this.wire.choices)
      .filter((key) => this.wire.choices[key].kind === kind)
      .map((key) => this.choice(key, kind));
  }
}

@Injectable({ providedIn: 'root' })
export class ManifestService {
  private readonly http = inject(HttpClient);
  private loaded: Promise<PrewarmManifest> | null = null;

  /** The manifest, read once; a failed read is reported and tried again on the next call. */
  load(): Promise<PrewarmManifest> {
    if (!this.loaded) {
      this.loaded = this.read().catch((err: unknown) => {
        this.loaded = null;
        throw err;
      });
    }
    return this.loaded;
  }

  private async read(): Promise<PrewarmManifest> {
    let wire: PrewarmManifestWire;
    try {
      wire = await firstValueFrom(this.http.get<PrewarmManifestWire>(MANIFEST_URL));
    } catch (err: unknown) {
      if (err instanceof HttpErrorResponse && err.status === 404) {
        throw new Error('[kiosk] no golden run has been made on this install: the prepared choices have no manifest');
      }
      const detail = err instanceof HttpErrorResponse ? `${err.status} ${err.statusText}` : String(err);
      throw new Error(`[kiosk] the prepared-choice manifest could not be read: ${detail}`);
    }
    if (wire.format !== MANIFEST_FORMAT) throw new Error(`[kiosk] manifest format ${wire.format} is not ${MANIFEST_FORMAT}`);
    return new PrewarmManifest(wire);
  }
}
