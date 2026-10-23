import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { modelCallGuard } from '../live/live-http';
import { GrowthEdgesService } from './growth-edges.service';
import { ProductApiError } from './product-api-error';

const UPLOADS = '/api/v1/me/growth-edges/uploads';
const PANEL = {
  familiar: { familiar_id: 'pingu-1', name: 'Pingu' },
  proposed_edges: [{ proposed_edge_id: 'pe-1', concept_label: 'Reverse osmosis', summary: 'Grow here.', strength: 0.9, suggested_difficulty: 'standard' }],
  candidate_struggles: [],
  available_outputs: [],
};

function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([modelCallGuard])), provideHttpClientTesting()] });
  return { edges: TestBed.inject(GrowthEdgesService), backend: TestBed.inject(HttpTestingController) };
}

describe('GrowthEdgesService: the analyser job and its review (consumption growth_edge_uploads_handler.go; edge weakness_resume_handler.go)', () => {
  it('reads a job as consumption answers it: the panel only while it waits for review', async () => {
    const { edges, backend } = setup();
    const p = edges.job('up-1');
    backend.expectOne(`${UPLOADS}/up-1`).flush({ upload_id: 'up-1', status: 'AWAITING_REVIEW', review: PANEL });
    await expect(p).resolves.toEqual({ upload_id: 'up-1', status: 'AWAITING_REVIEW', review: PANEL });
  });

  it('a job read the product refuses is a typed error naming the call', async () => {
    const { edges, backend } = setup();
    const p = edges.job('up-1');
    backend.expectOne(`${UPLOADS}/up-1`).flush({ code: 'NOT_FOUND', message: 'no such upload' }, { status: 404, statusText: 'Not Found' });
    const err = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProductApiError);
    expect((err as ProductApiError).message).toBe(`GET ${UPLOADS}/up-1: 404 NOT_FOUND: no such upload`);
  });

  it('confirms the visitor’s decisions: no reiterate, no struggles added, no outputs (D4, D7)', async () => {
    const { edges, backend } = setup();
    const decisions = [
      { proposed_edge_id: 'pe-1', decision: 'accept' as const, difficulty: 'standard' as const },
      { proposed_edge_id: 'pe-2', decision: 'reject' as const },
      { proposed_edge_id: 'pe-3', decision: 'merge' as const, merge_into_id: 'pe-1', difficulty: 'standard' as const },
    ];
    const p = edges.confirm('up-1', decisions);
    const req = backend.expectOne(`${UPLOADS}/up-1/resume`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ action: 'confirm', edges: decisions, added_struggles: [], selected_outputs: [] });
    // The orchestrator's answer, forwarded verbatim by the edge: its status is lowercase.
    req.flush({ upload_id: 'up-1', status: 'completed', panel: null, interrupted: false, governance_status: 'approved' });
    await expect(p).resolves.toBeUndefined();
  });

  it('a confirm the orchestrator answers blocked, failed or anything but completed is a failure, named', async () => {
    for (const status of ['blocked', 'failed', 'awaiting_review', undefined]) {
      TestBed.resetTestingModule();
      const { edges, backend } = setup();
      const p = edges.confirm('up-1', [{ proposed_edge_id: 'pe-1', decision: 'accept' }]);
      backend.expectOne(`${UPLOADS}/up-1/resume`).flush({ upload_id: 'up-1', status });
      await expect(p).rejects.toThrow(new RegExp(`the review of up-1 answered ${String(status ?? 'no status')}, not completed`));
    }
  });

  it('a confirm the edge refuses is a typed error', async () => {
    const { edges, backend } = setup();
    const p = edges.confirm('up-1', [{ proposed_edge_id: 'pe-1', decision: 'accept' }]);
    backend.expectOne(`${UPLOADS}/up-1/resume`).flush({ code: 'WEAKNESS_RESUME_UNAVAILABLE', message: 'unwired' }, { status: 503, statusText: 'Service Unavailable' });
    await expect(p).rejects.toBeInstanceOf(ProductApiError);
  });

  it('refuses a merge with no edge to merge into before it leaves the page', async () => {
    const { edges, backend } = setup();
    await expect(edges.confirm('up-1', [{ proposed_edge_id: 'pe-1', decision: 'merge' }])).rejects.toThrow(/pe-1 is merged into no other weak spot/);
    backend.expectNone(`${UPLOADS}/up-1/resume`);
  });
});
