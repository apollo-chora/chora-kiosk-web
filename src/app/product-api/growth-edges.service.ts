import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ProductApiError } from './product-api-error';

/**
 * The weakness analyser's job and its review (ADR-205; K158). The wire is production's
 * (chora-web growth-edge-review/weakness-review.models.ts): consumption's job read
 * (growth_edge_uploads_handler.go:67-97, the panel only while AWAITING_REVIEW) and the edge's
 * resume route, which forwards the orchestrator's answer verbatim (weakness_resume_handler.go:48,
 * weakness_router.py:87-100: a LOWERCASE status, and the panel under `panel`).
 *
 * The kiosk only ever confirms (D7: no reiterate, another model call), adds no struggle and asks
 * for no output (D4); the model-call guard refuses any other body. The upload is the LIVE kind
 * `weak` (live/kinds/weak.live.ts): it starts the analyser, so it never goes through this client.
 */
export type WeaknessUploadStatus = 'QUEUED' | 'ANALYZING' | 'AWAITING_REVIEW' | 'COMPLETED' | 'FAILED';
export type EdgeDifficulty = 'easier' | 'standard' | 'harder';

/** A proposed Growth Edge, the learner-facing reframe (the raw descriptor never reaches the page, ADR-205 D5). */
export interface ProposedGrowthEdge {
  readonly proposed_edge_id: string;
  readonly concept_label: string;
  readonly summary: string;
  readonly suggested_angles?: readonly string[];
  /** How shaky: 1 very weak, 0 mastered. */
  readonly strength: number;
  readonly suggested_difficulty: EdgeDifficulty;
}

export interface WeaknessReviewPanel {
  readonly familiar?: { readonly familiar_id: string; readonly name: string; readonly species?: string };
  readonly proposed_edges: readonly ProposedGrowthEdge[];
  readonly candidate_struggles: readonly { readonly concept_key: string; readonly concept_label: string }[];
  readonly available_outputs: readonly { readonly kind: string; readonly mana_price: number; readonly default_selected?: boolean }[];
}

export interface WeaknessUploadJob {
  readonly upload_id: string;
  readonly status: WeaknessUploadStatus;
  readonly review?: WeaknessReviewPanel;
  readonly upserted_growth_edge_ids?: readonly string[];
  readonly failure_reason?: string;
  readonly review_ready_at?: string;
}

/** One bounded decision on a proposed edge: keep it, drop it, or fold it into another of the same panel. */
export interface EdgeDecision {
  readonly proposed_edge_id: string;
  readonly decision: 'accept' | 'reject' | 'merge';
  readonly merge_into_id?: string;
  readonly difficulty?: EdgeDifficulty;
}

const UPLOADS = '/api/v1/me/growth-edges/uploads';

@Injectable({ providedIn: 'root' })
export class GrowthEdgesService {
  private readonly http = inject(HttpClient);

  async job(uploadId: string): Promise<WeaknessUploadJob> {
    const url = `${UPLOADS}/${encodeURIComponent(uploadId)}`;
    try {
      return await firstValueFrom(this.http.get<WeaknessUploadJob>(url));
    } catch (err: unknown) {
      throw ProductApiError.from('GET', url, err);
    }
  }

  /** Confirms the review; resolves only when the orchestrator answers it completed. */
  async confirm(uploadId: string, edges: readonly EdgeDecision[]): Promise<void> {
    for (const e of edges) {
      if (e.decision === 'merge' && !e.merge_into_id) throw new Error(`[kiosk] the review of ${uploadId}: ${e.proposed_edge_id} is merged into no other weak spot`);
    }
    const url = `${UPLOADS}/${encodeURIComponent(uploadId)}/resume`;
    let answer: { readonly status?: string } | null;
    try {
      answer = await firstValueFrom(this.http.post<{ status?: string } | null>(url, { action: 'confirm', edges, added_struggles: [], selected_outputs: [] }));
    } catch (err: unknown) {
      throw ProductApiError.from('POST', url, err);
    }
    const status = String(answer?.status ?? '').trim().toLowerCase();
    if (status !== 'completed') throw new Error(`[kiosk] POST ${url}: the review of ${uploadId} answered ${status || 'no status'}, not completed`);
  }
}
