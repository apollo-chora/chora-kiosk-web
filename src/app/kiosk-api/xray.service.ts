import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** One served pipeline step as the conductor's xray gives it (conductor API.md section 7). */
export interface XrayStageWire {
  readonly name: string;
  readonly status: string;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly duration_ms: number | null;
  readonly attempt: number | null;
  readonly accepted?: boolean;
  /** `simulated_on_local` on every guardrail step, null elsewhere. */
  readonly safety: string | null;
}

export interface XrayWire {
  readonly run_id: string;
  readonly kind: string;
  readonly trace_id: string;
  readonly generated_at: string | null;
  readonly stages: readonly XrayStageWire[];
  readonly decisions: readonly { readonly agent: string; readonly decision: string; readonly at: string; readonly model: string; readonly reasoning_summary: string }[];
}

/** The prepared campaign set an xray is composed for: a ready serve read's trace id and its (goal, concept, rung). */
export interface CampaignSetRun {
  readonly traceId: string;
  readonly goalId: string;
  readonly conceptId: string;
  readonly rung: number;
}

/**
 * "Behind the scenes" for a prepared campaign set (K75): the conductor composes it from product reads
 * only (the serve door's trace, the governance decisions) and stores nothing. Only for a set a ready
 * serve read showed, never speculatively.
 */
@Injectable({ providedIn: 'root' })
export class XrayService {
  private readonly http = inject(HttpClient);

  async campaignSet(run: CampaignSetRun): Promise<XrayWire> {
    const url = `/api/v1/kiosk/xray/${encodeURIComponent(run.traceId)}`;
    const params = { kind: 'campaign_set', goal_id: run.goalId, concept_id: run.conceptId, rung: String(run.rung) };
    try {
      return await firstValueFrom(this.http.get<XrayWire>(url, { params }));
    } catch (err: unknown) {
      const detail = err instanceof HttpErrorResponse ? `${err.status} ${err.statusText}` : String(err);
      throw new Error(`[kiosk] the xray of trace ${run.traceId} could not be read: ${detail}`);
    }
  }
}
