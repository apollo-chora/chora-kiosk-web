import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ProductApiError } from './product-api-error';

/** The fields of production's composed dashboard read the today strip uses (gateway GET /api/me/dashboard). */
interface DashboardRead {
  readonly streak?: { readonly current_streak_days: number; readonly last_completion_at?: string };
  readonly part_errors?: Readonly<Record<string, string>>;
}

/**
 * The dashboard's today strip (K131) on the two reads the kiosk edge opened for it (D8, 07083b1d2,
 * GET only): the streak from production's composed dashboard read, whose streak object is ABSENT
 * when its streak part failed (unknown, never 0; its flattened currentStreakDays reads 0 then), and
 * the mana balance from identity's wallet read. Neither read records activity.
 */
@Injectable({ providedIn: 'root' })
export class TodayService {
  private readonly http = inject(HttpClient);

  async streakDays(): Promise<number> {
    const url = '/api/me/dashboard';
    const d = await this.get<DashboardRead>(url);
    if (typeof d?.streak?.current_streak_days !== 'number') {
      throw new Error(`[kiosk] GET ${url} carried no streak (part_errors streak: ${d?.part_errors?.['streak'] ?? 'none named'})`);
    }
    return d.streak.current_streak_days;
  }

  async manaBalance(): Promise<number> {
    const url = '/api/v1/me/mana';
    const w = await this.get<{ readonly balance_units?: number }>(url);
    if (typeof w?.balance_units !== 'number') throw new Error(`[kiosk] GET ${url} answered with no balance_units`);
    return w.balance_units;
  }

  private async get<T>(url: string): Promise<T> {
    try {
      return await firstValueFrom(this.http.get<T>(url));
    } catch (err: unknown) {
      throw ProductApiError.from('GET', url, err);
    }
  }
}
