/**
 * The walk's own reads through the kiosk's one origin (T4.1 rule d: after a write the walk reads
 * the record back through the product's own read). It mints its own kiosk session, which signs
 * for the same prepared identity the screens use; the token is held in memory only, never printed
 * or written. Every read is strict: a missing field is an error, never a zero.
 */
import { request, type APIRequestContext } from '@playwright/test';

export interface Growth {
  readonly companionId: string;
  readonly displayName: string;
  readonly expCumulative: number;
  readonly growthStage: number;
}

export interface GrowthEvent {
  readonly companionId: string;
  readonly source: string;
  readonly expDelta: number;
  readonly expCumulativeAfter: number;
}

export interface ManifestChoice {
  readonly kind: string;
  readonly stage: string;
  readonly hidden: boolean;
  readonly prepared_at: string;
  readonly records: Record<string, unknown>;
}

export interface Manifest {
  readonly format: string;
  readonly made_at: string;
  readonly commit: string;
  readonly world: Record<string, unknown>;
  readonly choices: Record<string, ManifestChoice>;
}

const num = (where: string, v: unknown): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`[walk] ${where} is not a number (${JSON.stringify(v)})`);
  return v;
};
const str = (where: string, v: unknown): string => {
  if (typeof v !== 'string' || v === '') throw new Error(`[walk] ${where} is not a string (${JSON.stringify(v)})`);
  return v;
};

export class KioskApi {
  private constructor(
    private readonly ctx: APIRequestContext,
    private readonly token: string,
  ) {}

  static async open(baseURL: string): Promise<KioskApi> {
    const ctx = await request.newContext({ baseURL });
    const r = await ctx.post('/api/v1/kiosk/session', { data: {} });
    if (r.status() !== 200) throw new Error(`[walk] POST /api/v1/kiosk/session answered ${r.status()}`);
    const body = (await r.json()) as { access_token?: unknown };
    return new KioskApi(ctx, str('the session token', body.access_token));
  }

  async close(): Promise<void> {
    await this.ctx.dispose();
  }

  /** GET a JSON read as the kiosk session; anything but 200 is an error naming the route. */
  async get<T>(path: string): Promise<T> {
    const r = await this.ctx.get(path, { headers: { Authorization: `Bearer ${this.token}` } });
    if (r.status() !== 200) {
      const text = (await r.text()).slice(0, 300);
      throw new Error(`[walk] GET ${path} answered ${r.status()}: ${text}`);
    }
    return (await r.json()) as T;
  }

  async post(path: string, data: unknown): Promise<{ status: number; body: unknown }> {
    const r = await this.ctx.post(path, { data, headers: { Authorization: `Bearer ${this.token}` } });
    return { status: r.status(), body: await r.json().catch(() => null) };
  }

  /**
   * Ends the demo session through the conductor's reset (API.md section 5), for a stack walk whose
   * own Done could not run: a walk writes records, so it never leaves them on the kiosk.
   */
  async resetAndWait(budgetMs = 180_000): Promise<{ state: string; took_s: unknown }> {
    const started = await this.post('/api/v1/kiosk/reset', {});
    if (started.status !== 202) throw new Error(`[walk] POST /api/v1/kiosk/reset answered ${started.status}`);
    const until = Date.now() + budgetMs;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 2000));
      const g = await this.get<{ state?: string; took_s?: unknown }>('/api/v1/kiosk/reset').catch(() => null);
      if (g?.state === 'done' || g?.state === 'failed') return { state: g.state, took_s: g.took_s };
    }
    throw new Error(`[walk] the reset did not finish within ${budgetMs / 1000} s`);
  }

  async manifest(): Promise<Manifest> {
    const m = await this.get<Manifest>('/api/v1/kiosk/prewarm/manifest');
    if (m.format !== 'chora-kiosk/prewarm-manifest/v1') throw new Error(`[walk] the manifest's format is ${m.format}`);
    for (const [k, c] of Object.entries(m.choices)) str(`the manifest's ${k}.prepared_at`, c.prepared_at);
    return m;
  }

  /** identity's wallet read, the dashboard's mana (kiosk-web today.service.ts). */
  async mana(): Promise<number> {
    return num('GET /api/v1/me/mana balance_units', (await this.get<{ balance_units?: unknown }>('/api/v1/me/mana')).balance_units);
  }

  /** The composed dashboard read's streak; absent when its streak part failed, never read as 0. */
  async streak(): Promise<number> {
    const d = await this.get<{ streak?: { current_streak_days?: unknown } }>('/api/me/dashboard');
    return num('GET /api/me/dashboard streak.current_streak_days', d.streak?.current_streak_days);
  }

  readiness(): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>('/api/v1/kiosk/readiness');
  }

  async growth(companionId: string): Promise<Growth> {
    const where = `GET growth of ${companionId}`;
    const body = await this.get<{ data?: Record<string, unknown> }>(`/api/v1/me/companions/${encodeURIComponent(companionId)}/growth`);
    const d = body.data;
    if (!d) throw new Error(`[walk] ${where} answered with no {data} envelope`);
    return {
      companionId: str(`${where} companionId`, d['companionId']),
      displayName: str(`${where} displayName`, d['displayName']),
      expCumulative: num(`${where} expCumulative`, d['expCumulative']),
      growthStage: num(`${where} growthStage`, d['growthStage']),
    };
  }

  async growthEvents(companionId: string): Promise<GrowthEvent[]> {
    const where = `GET growth-events of ${companionId}`;
    const body = await this.get<{ data?: { events?: unknown } }>(`/api/v1/me/companions/${encodeURIComponent(companionId)}/growth-events`);
    const events = body.data?.events;
    if (!Array.isArray(events)) throw new Error(`[walk] ${where} answered with no events list`);
    return events.map((raw, i) => {
      const e = raw as Record<string, unknown>;
      // consumption's eventRecordResp (companion_growth_handlers.go): no companion id (the read is one
      // Companion's), and the running total is exp_total_after; either spelling, as the edge relays it.
      return {
        companionId,
        source: str(`${where} [${i}] source`, e['source']),
        expDelta: num(`${where} [${i}] exp_delta`, e['expDelta'] ?? e['exp_delta']),
        expCumulativeAfter: num(`${where} [${i}] exp_total_after`, e['expTotalAfter'] ?? e['exp_total_after']),
      };
    });
  }
}
