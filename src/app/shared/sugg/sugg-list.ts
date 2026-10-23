import type { ConceptGraph, ConceptSuggestion } from '../../aplus/discovery-graph/concept-graph.model';
import type { SuggResult } from '../../live/kinds/sugg.live';
import type { LiveOutcome } from '../../live/live.service';
import { suggRow, type ListRow, type SuggRow, type SuggRowState } from './sugg-rows.component';

/** A fresh batch: from a LIVE press, or the golden run's batch a missed press fell back to (K64). */
export interface FreshGroup {
  readonly source: 'live' | 'prepared';
  readonly preparedAt: Date | null;
  /** A LIVE press's own time when it was earlier this demo session (W41: read back from the product); null for just now. */
  readonly liveAt?: Date | null;
  readonly rows: readonly SuggRow[];
}

/**
 * A fresh batch kept as product suggestions with their states, as rows of the map it grows on: its
 * ideas only (K189 (2), W62), each held to the hex rules (K176, K190).
 */
export function freshGroup(
  f: {
    readonly source: FreshGroup['source'];
    readonly preparedAt: Date | null;
    readonly liveAt?: Date | null;
    readonly rows: readonly { readonly suggestion: ConceptSuggestion; readonly state: SuggRowState }[];
  },
  map: ConceptGraph,
): FreshGroup {
  return { source: f.source, preparedAt: f.preparedAt, liveAt: f.liveAt ?? null, rows: f.rows.flatMap((r) => suggRow(r.suggestion, r.state, map) ?? []) };
}

/**
 * A LIVE fresh-ideas press's own ideas: its rows when it answered, none when every idea it found was a
 * repeat (K157: the run completes "empty"), or null when it missed, so the caller shows its prepared
 * batch (K45, K64). An empty run is an answer, never a miss: no prepared batch stands in for it.
 */
export function liveRows(o: LiveOutcome): readonly { readonly suggestion: ConceptSuggestion; readonly state: 'pending' }[] | null {
  if (o.status !== 'done') return null;
  const r = o.result as SuggResult;
  if (r.status === 'empty') return [];
  return r.suggestions.length > 0 ? r.suggestions.map((s) => ({ suggestion: s as ConceptSuggestion, state: 'pending' as const })) : null;
}

/** The one list of an idea's waiting ideas (K189), and what the screen says around it. */
export interface WaitingList {
  /** Fresh ideas first, newest batch first, then the prepared ones; an added or dismissed idea has left. */
  readonly rows: readonly ListRow[];
  /** One of its ideas went onto the map: an emptied list says so (kd.sugg.allOnMap, W25), never a stamp over nothing. */
  readonly added: boolean;
  /** A prepared idea is still in the list, so its prepared stamp still tells the truth (K101). */
  readonly preparedLeft: boolean;
  /** The LIVE row's prepared stamp: the time of the prepared ideas it stands over (K101), null over none (condition (a)). */
  readonly preparedAt: Date | null;
  /** After a miss, the fallback batch listed in the live result's place (K64), at its own time beside the miss (gap (b)). */
  readonly fallbackAt: Date | null;
  /** The newest live press's own earlier time (W41); null for just now, or no press. */
  readonly liveAt: Date | null;
  /** The newest live press found nothing new (K157: live.suggEmpty). */
  readonly nothingNew: boolean;
}

/**
 * K189 (2), the owner's rule by example ("6 ideas, add one leaves 5, a live press adding 2 shows 7"):
 * prepared and fresh merged into one list of waiting ideas. A fresh idea keeps where it came from (its
 * LIVE tag when a LIVE press made it, K101); `fresh` is newest first, as the screens keep it. `shownAt` is
 * the prepared batch's own time. While the newest batch is a miss's fallback, the LIVE row stamps it
 * apart, beside the miss (gap (b)); otherwise its one prepared stamp is the shown batch's while one of its
 * ideas waits, else a fallback's while one of its ideas waits.
 */
export function waitingList(prepared: readonly SuggRow[], fresh: readonly FreshGroup[], shownAt: Date | null = null): WaitingList {
  const fromFresh = fresh.flatMap((g) => g.rows.map((r): SuggRow => ({ ...r, fresh: true, live: g.source === 'live' })));
  const all = [...fromFresh, ...prepared];
  const newest = fresh.find((g) => g.source === 'live');
  const preparedLeft = prepared.some(waiting);
  const shown = preparedLeft ? shownAt : null;
  const fallback = fresh.find((g) => g.source === 'prepared' && g.rows.some(waiting))?.preparedAt ?? null;
  const missed = fresh[0]?.source === 'prepared';
  return {
    rows: all.filter(waiting),
    added: all.some((r) => r.state === 'added'),
    preparedLeft,
    preparedAt: missed ? shown : (shown ?? fallback),
    fallbackAt: missed ? fallback : null,
    liveAt: newest?.liveAt ?? null,
    nothingNew: !!newest && fresh[0] === newest && newest.rows.length === 0,
  };
}

function waiting(r: SuggRow): r is ListRow {
  return r.state !== 'added' && r.state !== 'dropped';
}
