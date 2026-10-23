import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/**
 * Anonymous demo-session counts for the presenter (K19; conductor API.md section 4). The
 * event name is the whole record: no identifier, no address, no typed text. A count that
 * fails never interrupts the visitor; it is logged as an error.
 */
export const VISIT_EVENTS = ['started', 'hook_done', 'hall', 'maps', 'comp', 'dash', 'grade', 'engine'] as const;
export type VisitEvent = (typeof VISIT_EVENTS)[number];

export interface VisitCounts {
  readonly day: string;
  readonly counts: Readonly<Record<VisitEvent, number>>;
}

const VISITS_URL = '/api/v1/kiosk/visits';

@Injectable({ providedIn: 'root' })
export class VisitsService {
  private readonly http = inject(HttpClient);
  private readonly counts = signal<VisitCounts | null>(null);
  private readonly failedRead = signal(false);

  /** Today's counts, as last read, or null when they have not been read or could not be. */
  readonly today = this.counts.asReadonly();
  readonly unreadable = this.failedRead.asReadonly();

  /** Resolves true when the conductor counted it. Never rejects. */
  async record(event: VisitEvent): Promise<boolean> {
    try {
      await firstValueFrom(this.http.post(VISITS_URL, { event }));
      return true;
    } catch (err: unknown) {
      console.error(`[kiosk] the visit count ${event} was not recorded: ${detail(err)}`);
      return false;
    }
  }

  async loadToday(): Promise<void> {
    try {
      this.counts.set(await firstValueFrom(this.http.get<VisitCounts>(VISITS_URL)));
      this.failedRead.set(false);
    } catch (err: unknown) {
      this.counts.set(null);
      this.failedRead.set(true);
      console.error(`[kiosk] the visit counts could not be read: ${detail(err)}`);
    }
  }
}

function detail(err: unknown): string {
  return err instanceof HttpErrorResponse ? `${err.status} ${err.statusText}` : String(err);
}
