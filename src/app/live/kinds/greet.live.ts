import { Injectable, inject } from '@angular/core';

import { LiveHttp } from '../live-http';
import { LiveExecutor, LiveRunContext } from '../live.service';

/**
 * The greeting-only call for one named Companion (K49; consumption
 * companion_greeting_handler.go): POST /api/companion/greeting {companion_id, turn_id}.
 * A fresh turn id calls the Companion's model (the LIVE press); the golden run's turn id
 * replays the stored greeting with no model call (the prepared greeting).
 */
const GREETING_URL = '/api/companion/greeting';

interface GreetingAnswer {
  readonly companion_id: string;
  readonly turn_id: string;
  readonly greeting: string;
  readonly model: string;
  readonly replayed: boolean;
}

export interface GreetParams {
  readonly companionId: string;
}

export interface Greeting {
  readonly greeting: string;
  /** The model that ran (K72). */
  readonly model: string;
  readonly turnId: string;
}

function freshTurnId(): string {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new Error('[kiosk] no crypto.randomUUID: the kiosk must be opened on 127.0.0.1 or localhost (a secure context)');
  }
  return crypto.randomUUID();
}

const toGreeting = (a: GreetingAnswer): Greeting => ({ greeting: a.greeting, model: a.model, turnId: a.turn_id });

@Injectable({ providedIn: 'root' })
export class GreetLive implements LiveExecutor<GreetParams, Greeting> {
  async run(params: GreetParams, ctx: LiveRunContext): Promise<Greeting> {
    const answer = await ctx.http.post<GreetingAnswer>(
      GREETING_URL,
      { companion_id: params.companionId, turn_id: freshTurnId() },
      ctx.signal,
    );
    ctx.stage('companion', 'done');
    return toGreeting(answer);
  }
}

/** The prepared greeting: the golden run's turn, replayed (ADR-259 D9 rule 2; no model call). */
@Injectable({ providedIn: 'root' })
export class PreparedGreetings {
  private readonly http = inject(LiveHttp);

  async read(companionId: string, turnId: string, signal = new AbortController().signal): Promise<Greeting> {
    const answer = await this.http.replay<GreetingAnswer>(GREETING_URL, { companion_id: companionId, turn_id: turnId }, signal);
    if (!answer.replayed) {
      throw new Error(`[kiosk] the prepared greeting ${turnId} was not a replay: a model call nobody pressed`);
    }
    return toGreeting(answer);
  }
}
