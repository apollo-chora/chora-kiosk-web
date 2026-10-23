/**
 * DailyDose model: A+ Daily Dose with Ebbinghaus spaced-repetition ordering
 * + per-Familiar nudge + streak integration (WS-12).
 *
 * `DailyDose` is the canonical Chora primitive for daily micro-learning
 * (per `domain-vocabulary` skill: never "daily quiz"). Each dose is
 * composed of N atoms ordered by Ebbinghaus retention urgency (low → medium →
 * high → unknown) by the chora-consumption Ebbinghaus Scheduler crew:
 *   - 'review'  → retention_state=low  (40%: Ebbinghaus overdue)
 *   - 'stretch' → retention_state=medium (30%: weakness/spaced-rep lag)
 *   - 'new'     → retention_state=unknown (30%: no history yet)
 *
 * WS-12-SR-2 (follow-up BE ask): `retention_state` is not yet in the atom
 * wire. Derived from `category` via `retentionStateFromCategory()` in
 * `spaced-repetition.service.ts` until BE adds it.
 *
 * WS-12-NUDGE (follow-up BE ask): per-Familiar recommended-atoms endpoint
 * (`GET /api/v1/familiars/{id}/recommended-atoms`) is NOT in bff-gateway.yaml
 * as of 2026-05-26. Familiar nudge is surfaced via `familiar_nudge` field
 * on the DailyDose response once BE ships this endpoint.
 *
 * The composition signal is emitted on `chora.consumption.daily_dose.served.v1`
 * per `pub-sub-topology` skill. This surface only reads its projection.
 */

export type DailyDoseAtomCategory = 'review' | 'new' | 'stretch';

export interface DailyDoseAtom {
  readonly atomId: string;
  readonly courseCode: string;
  readonly title: string;
  readonly summary: string;
  readonly category: DailyDoseAtomCategory;
  /** Topic name for the chip on the card. */
  readonly topic: string;
  /** Expected XP reward on successful playthrough. */
  readonly xpOnComplete: number;
  /**
   * Ebbinghaus retention state for this atom (WS-12-SR-2).
   * When absent, derive from `category` via `retentionStateFromCategory()`.
   * Drives the retention indicator colour using `--chora-retention-{state}`.
   */
  readonly retention_state?: 'high' | 'medium' | 'low' | 'unknown';
}

// ---------------------------------------------------------------------------
// Familiar nudge (WS-12-NUDGE)
// ---------------------------------------------------------------------------

/**
 * Per-Familiar nudge atom: surfaced at the top of the Daily Dose carousel
 * when the active Familiar recommends a specific atom for review.
 *
 * WS-12-NUDGE: `GET /api/v1/familiars/{id}/recommended-atoms` is NOT in
 * bff-gateway.yaml as of 2026-05-26. This field is optional on DailyDose
 * until BE ships the endpoint.
 *
 * Mana gating: if user's Familiar subscription tier is Basic, the nudge is
 * replaced by an upsell card ("Upgrade to Standard for Familiar review
 * suggestions"). `requires_standard_tier` signals this to the component.
 */
export interface FamiliarNudge {
  /** Display name of the recommending Familiar. */
  readonly familiar_name: string;
  /** UUIDv7 of the nudge atom. */
  readonly atom_id: string;
  /** Title of the nudge atom. */
  readonly atom_title: string;
  /**
   * When `true`, the user's mana subscription is Basic-tier and cannot
   * access Familiar nudges. Render upsell card instead.
   */
  readonly requires_standard_tier: boolean;
}

// ---------------------------------------------------------------------------
// Streak data (WS-12)
// ---------------------------------------------------------------------------

/**
 * Learner streak snapshot from the GraphQL `myStreak` resolver.
 * Mirrors `GqlStreakData` (core/graphql/types.ts) but retyped here to keep
 * the daily-dose model self-contained.
 */
export interface DailyDoseStreak {
  readonly currentDays: number;
  readonly longestStreak: number;
  /** ISO timestamp of the last activity that counted toward the streak. */
  readonly lastActivityAt: string;
  /** 'active' | 'at_risk' | 'broken' */
  readonly status: string;
}

export interface DailyDoseComposition {
  readonly reviewPercent: number;
  readonly newPercent: number;
  readonly stretchPercent: number;
}

/**
 * GreetingFrom: N-Familiar dispatch payload (CHO-1577).
 * Identifies which Familiar in the learner's roster is greeting them for
 * this dose. Absent when every Familiar is pre-hatch or the roster is empty.
 */
export interface GreetingFrom {
  /** UUIDv7 of the greeting Familiar. */
  readonly familiar_id: string;
  /** Display name of the greeting Familiar. */
  readonly name: string;
  /** Optional voice accent key (from configured_rules.voice_accent). */
  readonly voice_accent?: string;
  /**
   * Non-empty when a tie in topic-match count was resolved by GrowthExp
   * descending. Set to `'highest_growth_exp'` on tie; empty otherwise.
   */
  readonly tie_break_reason?: string;
}

/**
 * AtomBreakdown: dose composition by reason bucket (CHO-1577).
 * Replaces the earlier `composition` sub-object; separates the four
 * dose-reason buckets instead of the FE-side review/new/stretch buckets.
 */
export interface AtomBreakdown {
  readonly ebbinghaus: number;
  readonly weakness: number;
  readonly curiosity: number;
  readonly fresh: number;
}

/**
 * DoseScope: goal-scope disclosure for a goal-scoped dose (ADR-242 D2).
 *
 * Present ONLY when the request carried a `goal_id` AND that goal resolved (a
 * goal with no material still returns the block, with zeros). The three counts
 * are over the SERVED cards and sum to the card count, splitting them by where
 * they came from:
 *   - `from_goal`: atoms attached to the goal's own concepts
 *   - `on_topics`: atoms on the goal's topics but not attached to it
 *   - `broader`:   atoms from the learner's wider enrolment
 *
 * Optional by contract, not by convenience: no goal means no block, and the
 * surface must then say NOTHING about composition rather than assume a split.
 */
export interface DoseScope {
  /** UUIDv7 of the Goal the dose was scoped to. */
  readonly goal_id: string;
  readonly from_goal: number;
  readonly on_topics: number;
  readonly broader: number;
}

export interface DailyDose {
  readonly doseId: string;
  readonly servedOn: string; // ISO date
  readonly atoms: readonly DailyDoseAtom[];
  readonly composition: DailyDoseComposition;
  /** Familiar reward (XP + dust) summary copy. */
  readonly totalXpAvailable: number;
  /** ISO timestamp when the next dose becomes available. */
  readonly nextDoseAt: string;
  readonly familiarName: string;
  readonly familiarLevel: number;
  readonly familiarQuote: string;
  /**
   * Server-composed nudge copy describing THIS dose (`DoseMessageFor` in
   * chora-consumption). It is the authoritative empty-universe explanation
   * when `atoms` is empty ("No atoms queued yet ... enrol in a course"), so
   * the empty state renders it verbatim rather than guessing a reason
   * client-side. Optional: older/degraded responses may omit it, and the
   * component then falls back to local copy.
   */
  readonly message?: string;
  /**
   * Stage-adaptive Familiar greeting per ADR-149 (terse at Stages 1-2,
   * fluent at 4-6). Optional: only present when chora-consumption
   * successfully composes via the Familiar Agent Engine (us-central1).
   * F4 paydown 2026-05-13.
   */
  readonly familiarGreeting?: string;
  /**
   * 1-2 sentence Recommender Agent Engine narrative explaining why
   * today's atoms were picked. Optional: falls back to the
   * deterministic SM-2 + Ebbinghaus blurb when the engine is unhealthy
   * (per HANDOFF §3.5 graceful-degradation contract).
   * F4 paydown 2026-05-13.
   */
  readonly recommenderNarrative?: string;
  /**
   * N-Familiar dispatch (CHO-1577): identifies which Familiar in the
   * learner's N-Familiar roster is greeting them for this dose. Absent
   * when every Familiar is pre-hatch (Mystery Egg only) or the roster
   * is empty.
   */
  readonly greeting_from?: GreetingFrom;
  /**
   * Dose composition by domain-side reason bucket (CHO-1577).
   * Carries ebbinghaus / weakness / curiosity / fresh counts: more
   * granular than the FE-side `composition` which maps to
   * review/new/stretch.
   */
  readonly atom_breakdown?: AtomBreakdown;
  /**
   * Goal-scope disclosure (ADR-242 D2). Present only on a goal-scoped dose
   * whose goal resolved; absent otherwise, and the surface then discloses
   * nothing rather than inventing a split.
   */
  readonly scope?: DoseScope;
  /**
   * Per-Familiar nudge atom (WS-12-NUDGE).
   * Surfaced when the active Familiar recommends a specific atom for review.
   * Absent when: (a) endpoint not yet wired BE-side; (b) no active Familiar;
   * (c) Familiar has no recommendation. When `requires_standard_tier=true`,
   * the component renders an upsell card instead.
   */
  readonly familiar_nudge?: FamiliarNudge;
  /**
   * Learner streak snapshot (WS-12).
   * Populated from the GraphQL `myStreak` resolver by DailyDoseService.
   * Absent if the GraphQL call fails (non-blocking: streak is decorative).
   */
  readonly streak?: DailyDoseStreak;
}

/**
 * Wire shape of `GET /api/familiar/daily-dose/ai`: the async AI-enrichment
 * layer fetched AFTER the deterministic dose renders (progressive enhancement,
 * B2-C / ADR-196). Mirrors chora-consumption `dailyDoseAIResp` verbatim
 * (snake_case wire):
 *   - `greeting` : the real stage-adaptive Familiar greeting (ADR-149) that
 *                   supersedes the deterministic `DailyDose.familiarQuote`.
 *   - `narrative`: the Recommender's pick-rationale ("why these atoms").
 *   - `ai_picks` : recommended atom_ids (bare ids; surfacing them as cards is
 *                   a follow-up: they carry no title/summary/topic).
 *   - `degraded` : true when an engine was unavailable and `greeting` is only
 *                   a templated fallback; the FE then KEEPS its already-rendered
 *                   deterministic greeting rather than swapping a stub for a stub.
 */
export interface DailyDoseAiEnrichment {
  readonly greeting: string;
  readonly ai_picks: readonly string[];
  readonly narrative: string;
  readonly degraded: boolean;
}

/**
 * Discriminated-union state for daily-dose loading. Mirrors the
 * `AsyncState<T>` pattern used elsewhere in chora-web. F4 paydown:
 * removes the indefinite "Loading…" hang when the BFF returns 5xx.
 */
export type DailyDoseState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: DailyDose }
  | { readonly status: 'error'; readonly error: string };

/** Display helper: hours-remaining countdown string. */
export function formatHoursUntil(nextDoseIso: string, now: Date): string {
  const next = new Date(nextDoseIso).getTime();
  const diffMs = next - now.getTime();
  if (diffMs <= 0) return '00:00:00';
  const totalSec = Math.floor(diffMs / 1000);
  const hh = Math.floor(totalSec / 3600)
    .toString()
    .padStart(2, '0');
  const mm = Math.floor((totalSec % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const ss = (totalSec % 60).toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function categoryBadgeClass(category: DailyDoseAtomCategory): string {
  switch (category) {
    case 'review':
      return 'badge-info';
    case 'new':
      return 'badge-success';
    case 'stretch':
      return 'badge-warning';
    default:
      return 'badge-info';
  }
}
