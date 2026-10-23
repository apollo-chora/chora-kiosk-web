import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { DailyDose, DailyDoseAtomCategory, DailyDoseComposition } from '../aplus/daily-dose/daily-dose.model';
import { ProductApiError } from './product-api-error';

/** One card of a dose, in the read's order. */
export interface DoseCard {
  readonly atomId: string;
  readonly title: string;
  readonly topic: string;
  readonly category: DailyDoseAtomCategory;
  readonly xp: number;
  /** consumption's dose_reason: campaign, ebbinghaus_review, weakness, curiosity or fresh. */
  readonly reason: string;
}

export interface DoseRead {
  readonly doseId: string;
  readonly servedOn: string;
  readonly nextDoseAt: string;
  readonly composition: DailyDoseComposition;
  readonly totalXp: number;
  readonly cards: readonly DoseCard[];
}

/** The read's legacy entries, which alone say why each card is there (companion_handlers.go dailyDoseResp). */
type DoseWire = Pick<DailyDose, 'doseId' | 'servedOn' | 'atoms' | 'composition' | 'totalXpAvailable' | 'nextDoseAt'> & {
  readonly entries?: readonly { readonly atom_id: string; readonly dose_reason: string }[];
};

/**
 * A goal's daily dose (K127, T2.18): GET /api/companion/daily-dose?goal_id=, never unscoped. The
 * gateway forwards consumption's body unchanged (phyllis.go GetDailyDose). Production's own client
 * also fetches the AI enrichment (daily-dose/ai, a model call) and a streak; the kiosk does neither:
 * the greeting is the K49 call. Kept: the cards, their reasons, the mix, the XP and the next dose's
 * time. Dropped: the legacy in-memory Companion's name, quote and greeting (F17).
 */
@Injectable({ providedIn: 'root' })
export class DoseService {
  private readonly http = inject(HttpClient);

  async open(goalId: string): Promise<DoseRead> {
    if (!goalId.trim()) throw new Error('[kiosk] a dose is opened for one goal only (T2.18): no goal id was given');
    const url = `/api/companion/daily-dose?goal_id=${encodeURIComponent(goalId)}`;
    let w: DoseWire;
    try {
      w = await firstValueFrom(this.http.get<DoseWire>('/api/companion/daily-dose', { params: { goal_id: goalId } }));
    } catch (err: unknown) {
      throw ProductApiError.from('GET', url, err);
    }
    const atoms = w?.atoms ?? [];
    const entries = w?.entries ?? [];
    if (atoms.length === 0) throw new Error(`[kiosk] GET ${url} answered a dose with no cards`);
    if (entries.length !== atoms.length) throw new Error(`[kiosk] GET ${url}: ${atoms.length} cards but ${entries.length} reasons`);
    const cards = atoms.map((a, i): DoseCard => {
      if (entries[i].atom_id !== a.atomId) throw new Error(`[kiosk] GET ${url}: card ${i + 1} is ${a.atomId} but its reason is for ${entries[i].atom_id}`);
      return { atomId: a.atomId, title: a.title, topic: a.topic, category: a.category, xp: a.xpOnComplete, reason: entries[i].dose_reason };
    });
    return { doseId: w.doseId, servedOn: w.servedOn, nextDoseAt: w.nextDoseAt, composition: w.composition, totalXp: w.totalXpAvailable, cards };
  }
}
