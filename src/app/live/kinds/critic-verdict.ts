/**
 * The critic's verdict on a draft, from its own job's `pipeline_trace` (creation's job read).
 * The qgen crew writes it two ways (qgen_crew.py `_trace_row`): the set lane adds a `critique`
 * row per call whose notes only count candidates, then one `critique_verdict` row per candidate
 * with `accepted` and the critic's notes; the single lane's `critique` row carries both itself.
 * The notes are the critic's own words (cut at 200 characters by the crew), shown as written (K133).
 */
export interface TraceRow {
  readonly name: string;
  readonly status: string;
  readonly notes?: string | null;
  readonly accepted?: boolean | null;
}

export interface CriticVerdict {
  readonly accepted: boolean;
  readonly notes: string;
}

/** The last row that carries a verdict, or null when none does (never read as accepted). */
export function criticVerdict(trace: readonly TraceRow[] | null | undefined): CriticVerdict | null {
  const last = lastVerdictRow(trace);
  return last ? { accepted: last.accepted === true, notes: last.notes ?? '' } : null;
}

/** The trace row `criticVerdict` reads, as the caller typed it (its times included). */
export function lastVerdictRow<R extends TraceRow>(trace: readonly R[] | null | undefined): (R & { readonly accepted: boolean }) | null {
  const rows = (trace ?? []).filter(
    (r): r is R & { readonly accepted: boolean } => (r.name === 'critique_verdict' || r.name === 'critique') && typeof r.accepted === 'boolean',
  );
  return rows[rows.length - 1] ?? null;
}

/**
 * The critic's verdict on a whole campaign set, from consumption's served trace (the set lane
 * always: the request carries a type plan; the served rows keep `accepted`, never the notes).
 * A send-back re-critiques only the rejected candidates, so the critic's final word is the
 * `critique_verdict` rows after its LAST `critique` call: accepted only when every one is, unknown
 * when that call left no verdict (never read as accepted).
 */
export function setCriticVerdict(
  trace: readonly { readonly name: string; readonly accepted?: boolean | null }[] | null | undefined,
): { readonly accepted: boolean } | null {
  const rows = trace ?? [];
  const lastCall = rows.map((r) => r.name).lastIndexOf('critique');
  if (lastCall < 0) return null;
  const verdicts = rows.slice(lastCall + 1).filter((r) => r.name === 'critique_verdict');
  if (verdicts.length === 0 || verdicts.some((r) => typeof r.accepted !== 'boolean')) return null;
  return { accepted: verdicts.every((r) => r.accepted === true) };
}
