/**
 * GoalService: A+ learner-owned Goal provider (ADR-204 §2/§3/§10).
 *
 * Wired LIVE to the gateway BFF:
 *   GET   /api/v1/me/goals       → { items, primaryLens }
 *   POST  /api/v1/me/goals       → GoalDTO   (create via the goal-set picker)
 *   PATCH /api/v1/me/goals/{id}  → GoalDTO   (status / note edits)
 *
 * Two precedents fused (chora-web no-stubs / fail-loud directive):
 *   - growth-edges.service.ts → BffClientService calls + i18n error mapping;
 *   - DashboardService        → a signal-backed discriminated `AsyncState`.
 *
 * The list is SECONDARY/additive dashboard data (like the growth-edges tally),
 * so the dashboard degrades gracefully: `primaryLens` and `activeGoal` are
 * computed to a safe default (curiosity / null) on loading/error/empty: a
 * degraded goals upstream must NEVER break the dashboard (ADR-204 §3). The
 * fail-loud surface is the picker (create/update), which renders 422 inline.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, take } from 'rxjs';

import { BffClientService } from '../../../core/services/bff-client.service';
import type {
  CreateGoalRequest,
  GoalDTO,
  GoalStatus,
  GoalsResponse,
  GoalsState,
  PrimaryLens,
  UpdateGoalPatch,
} from './goal.model';

/** Priority order used to pick the single Goal the dashboard surfaces. */
const SURFACE_PRIORITY: readonly GoalStatus[] = [
  'active',
  'maintenance',
  'achieved',
];

/**
 * chora-consumption speaks Companion on the wire (ADR-254 D9): a goal carries
 * `attachedCompanionId`, and a PATCH takes `attachedCompanionId` /
 * `detachCompanion`. A+ speaks Familiar in its own model, so the two names meet
 * here at the adapter boundary and nowhere else.
 */
interface GoalWire extends Omit<GoalDTO, 'attachedFamiliarId'> {
  readonly attachedCompanionId?: string;
}

function wireToGoal(wire: GoalWire): GoalDTO {
  const { attachedCompanionId, ...rest } = wire;
  return attachedCompanionId === undefined
    ? (rest as GoalDTO)
    : { ...(rest as GoalDTO), attachedFamiliarId: attachedCompanionId };
}

function patchToWire(patch: UpdateGoalPatch): Record<string, unknown> {
  const { attachedFamiliarId, detachFamiliar, ...rest } = patch;
  const wire: Record<string, unknown> = { ...rest };
  if (attachedFamiliarId !== undefined) {
    wire['attachedCompanionId'] = attachedFamiliarId;
  }
  if (detachFamiliar !== undefined) wire['detachCompanion'] = detachFamiliar;
  return wire;
}

@Injectable({ providedIn: 'root' })
export class GoalService {
  private readonly bff = inject(BffClientService);
  private static readonly BASE = '/api/v1/me/goals';

  private readonly _state = signal<GoalsState>({ status: 'loading' });
  readonly state = this._state.asReadonly();

  /**
   * BE-derived adaptive lens. DEFAULTS to `curiosity` on loading / error /
   * absent so the dashboard always has a safe layout to render (ADR-204 §3).
   */
  readonly primaryLens = computed<PrimaryLens>(() => {
    const s = this._state();
    return s.status === 'success' ? s.primaryLens : 'curiosity';
  });

  /** Every goal in the success payload, else empty. */
  readonly goals = computed<readonly GoalDTO[]>(() => {
    const s = this._state();
    return s.status === 'success' ? s.items : [];
  });

  /**
   * The single Goal the dashboard surfaces in the today-bar: the
   * highest-priority non-retired goal (active > maintenance > achieved).
   * `null` when the learner has no goal (or only retired ones), which drives
   * the "Set a goal" CTA. NEVER a retired goal.
   */
  readonly activeGoal = computed<GoalDTO | null>(() => {
    const s = this._state();
    if (s.status !== 'success') return null;
    for (const st of SURFACE_PRIORITY) {
      const found = s.items.find((g) => g.status === st);
      if (found) return found;
    }
    return null;
  });

  /** GET the goals list and publish to `state`. Idempotent (refresh/retry). */
  load(): void {
    this._state.set({ status: 'loading' });
    this.bff
      .get<GoalsResponse>(GoalService.BASE)
      .pipe(
        take(1),
        map(
          (res): GoalsState => ({
            status: 'success',
            items: (res.items ?? []).map((i) =>
              wireToGoal(i as unknown as GoalWire),
            ),
            primaryLens: res.primaryLens ?? 'curiosity',
          }),
        ),
        catchError((err: unknown) =>
          of<GoalsState>({ status: 'error', error: this.errorKey(err) }),
        ),
      )
      .subscribe((s) => this._state.set(s));
  }

  /** POST a new goal. The caller refreshes via `load()` on success. */
  create(req: CreateGoalRequest): Observable<GoalDTO> {
    return this.bff
      .post<GoalWire>(GoalService.BASE, req)
      .pipe(map(wireToGoal));
  }

  /** PATCH an existing goal (status / note edits). */
  update(id: string, patch: UpdateGoalPatch): Observable<GoalDTO> {
    return this.bff
      .patch<GoalWire>(`${GoalService.BASE}/${id}`, patchToWire(patch))
      .pipe(map(wireToGoal));
  }

  /**
   * DELETE a goal: the server soft-deletes it (204; NEVER hard-delete). A map
   * IS a Goal (ADR-214), so removing a whole map goes through this route. Raw
   * Observable: the caller renders its own inline error and refreshes.
   */
  delete(id: string): Observable<void> {
    return this.bff.delete<void>(`${GoalService.BASE}/${id}`);
  }

  /** Translate a GET error to an i18n key: never a raw BE body (Security). */
  private errorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status >= 500) return 'aplus.dashboard.goal.error_upstream';
      if (e.status === 401 || e.status === 403) {
        return 'aplus.dashboard.goal.error_unauthorised';
      }
    }
    return 'aplus.dashboard.goal.error_generic';
  }
}
