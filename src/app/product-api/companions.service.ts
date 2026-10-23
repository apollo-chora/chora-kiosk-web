import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  normalizeGrowthEventsPage,
  normalizeLoadoutView,
  type FamiliarGrowthState,
  type GrowthEventsPage,
  type LoadoutView,
} from '../core/familiar/familiar-growth.model';
import { ProductApiError } from './product-api-error';

/**
 * The Companions' reads (K38, K102): one Companion's growth, which is all its profile sheet shows
 * (stage, stage name, species, EXP, the model tier behind "Mind", the unlocked abilities). The
 * gateway's companion bridge serves consumption's growth read camelCased and wrapped in {data}
 * (companionbridge.go GetCompanionGrowth, classifyWithEnvelope); production's own client reads the
 * pre-rename /familiars aliases, which the kiosk does not use (API-CONTRACT.md section 1).
 * The stage-up moment adds the EXP ledger (each credit with its source, {data}-wrapped like the
 * growth) and the loadout (slots and the skills that woke, unwrapped like production's getLoadout).
 */
@Injectable({ providedIn: 'root' })
export class CompanionsService {
  private readonly http = inject(HttpClient);

  growth(companionId: string): Promise<FamiliarGrowthState> {
    return this.enveloped<FamiliarGrowthState>(`/api/v1/me/companions/${encodeURIComponent(companionId)}/growth`);
  }

  /** The ledger, newest first (companion_growth_handlers.go handleListGrowthEvents), in production's normalised shape. */
  async growthEvents(companionId: string): Promise<GrowthEventsPage> {
    return normalizeGrowthEventsPage(await this.enveloped<unknown>(`/api/v1/me/companions/${encodeURIComponent(companionId)}/growth-events`));
  }

  async loadout(companionId: string): Promise<LoadoutView> {
    const url = `/api/v1/me/companions/${encodeURIComponent(companionId)}/skills`;
    let body: LoadoutView;
    try {
      body = await firstValueFrom(this.http.get<LoadoutView>(url));
    } catch (err: unknown) {
      throw ProductApiError.from('GET', url, err);
    }
    if (typeof body?.skillSlotsUnlocked !== 'number') throw new Error(`[kiosk] GET ${url} answered with no skillSlotsUnlocked`);
    return normalizeLoadoutView(body);
  }

  private async enveloped<T>(url: string): Promise<T> {
    let body: { data?: T };
    try {
      body = await firstValueFrom(this.http.get<{ data?: T }>(url));
    } catch (err: unknown) {
      throw ProductApiError.from('GET', url, err);
    }
    if (!body?.data) throw new Error(`[kiosk] GET ${url} answered with no {data} envelope`);
    return body.data;
  }
}
