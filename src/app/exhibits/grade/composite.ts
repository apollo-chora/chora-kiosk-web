/** One rubric criterion's weight, as the grading read projects the test set's snapshot (grading_review_handler.go:99-107). */
export interface RubricWeight {
  readonly criterionId: string;
  readonly weight: number;
}

/** One criterion's score and maximum, as the grading crew scored it (or as the person's stepper leaves it). */
export interface CriterionMark {
  readonly criterionId: string;
  readonly score: number;
  readonly max: number;
}

/**
 * The open answer's points from its criterion scores: production's own rule, ported from the
 * orchestrator's `domain/oe_grading_crew/scoring.py` compute_composite (lines 9-10 and 92-133; the
 * crew stores its result as points_earned and delivery persists it verbatim):
 *
 *     normalised    = sum_i ( weight_i / sum(weight) x clamp01(score_i / max_i) )
 *     points_earned = round(normalised x points_possible, 2)
 *
 * The sum runs over the rubric: a criterion with no score counts 0, a maximum of 0 or less counts
 * as 1, and the arithmetic keeps the Python order so the result is the same double. An empty
 * rubric or a weight sum of 0 or less cannot ground a grade and throws, as scoring.py does.
 */
export function composite(rubric: readonly RubricWeight[], marks: readonly CriterionMark[], pointsPossible: number): number {
  if (!rubric.length) throw new Error('scoring: rubric has no criteria');
  const weightSum = rubric.reduce((n, c) => n + c.weight, 0);
  if (!(weightSum > 0)) throw new Error(`scoring: rubric weight-sum is ${weightSum} (<= 0); cannot normalise`);
  const byId = new Map(marks.map((m) => [m.criterionId, m]));
  let normalised = 0;
  for (const c of rubric) {
    const m = byId.get(c.criterionId);
    const ratio = m ? clamp01(m.score / (m.max > 0 ? m.max : 1)) : 0;
    normalised += (c.weight / weightSum) * ratio;
  }
  return roundHalfEven2(normalised * pointsPossible);
}

/**
 * Python's round(x, 2) for a double: the exact binary value rounded to 2 places, a true tie to
 * the even hundredth. toFixed rounds the exact value too but breaks a tie upward; a double sits
 * exactly on a half-hundredth only when it is an odd number of eighths (x.125, .375, .625, .875).
 */
export function roundHalfEven2(x: number): number {
  if (Number.isInteger(x * 8) && !Number.isInteger(x * 4)) {
    const lo = Math.floor(x * 100);
    return (lo % 2 === 0 ? lo : lo + 1) / 100;
  }
  return Number(x.toFixed(2));
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
