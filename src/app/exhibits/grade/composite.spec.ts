import { composite, roundHalfEven2, type CriterionMark, type RubricWeight } from './composite';

// The grade a release stores is production's own composite (the orchestrator's
// domain/oe_grading_crew/scoring.py compute_composite, lines 9-10 and 92-133): each rubric
// criterion's weight over the weight sum times its score over its maximum (clamped to 0..1), times
// the points possible, rounded to 2 places the way Python's round() does. Every expected value
// below was computed by that file itself (scoring.py loaded by path on 2026-10-18), and the two
// "as recorded" rows are the golden run's samples as the grading read gives them.
describe('composite (scoring.py compute_composite)', () => {
  const R: RubricWeight[] = [
    { criterionId: 'c1', weight: 0.4 },
    { criterionId: 'c2', weight: 0.4 },
    { criterionId: 'c3', weight: 0.2 },
  ];
  const m = (...xs: [number, number][]): CriterionMark[] => xs.map(([score, max], i) => ({ criterionId: `c${i + 1}`, score, max }));

  const CASES: [string, RubricWeight[], CriterionMark[], number, number][] = [
    ['strong as recorded', R, m([1, 1], [1, 1], [1, 1]), 10, 10],
    ['weak as recorded', R, m([0, 1], [0.2, 1], [0, 1]), 10, 0.8],
    ['strong, trade-off 1 to 0 (the walk)', R, m([1, 1], [1, 1], [0, 1]), 10, 8],
    ['strong, independence 1 to 0', R, m([1, 1], [0, 1], [1, 1]), 10, 6],
    ['weak, independence 0.2 to 1', R, m([0, 1], [1, 1], [0, 1]), 10, 4],
    ['weak, independence 0.2 to 0', R, m([0, 1], [0, 1], [0, 1]), 10, 0],
    [
      'percentage weights',
      [
        { criterionId: 'a', weight: 50 },
        { criterionId: 'b', weight: 30 },
        { criterionId: 'c', weight: 20 },
      ],
      [
        { criterionId: 'a', score: 3, max: 4 },
        { criterionId: 'b', score: 1, max: 3 },
        { criterionId: 'c', score: 2, max: 2 },
      ],
      10,
      6.75,
    ],
    ['a rubric criterion with no score counts 0', R, m([1, 1], [1, 1]), 10, 8],
    ['an over-max score is clamped', R, m([3, 1], [1, 1], [1, 1]), 10, 10],
    ['a max of 0 counts as 1', R, m([1, 0], [0, 0], [1, 1]), 10, 6],
    [
      'a tie rounds half to even (7.125)',
      [
        { criterionId: 'a', weight: 1 },
        { criterionId: 'b', weight: 7 },
      ],
      [
        { criterionId: 'a', score: 1, max: 1 },
        { criterionId: 'b', score: 0, max: 1 },
      ],
      57,
      7.12,
    ],
    [
      'a tie rounds half to even (0.625)',
      [
        { criterionId: 'a', weight: 5 },
        { criterionId: 'b', weight: 3 },
      ],
      [
        { criterionId: 'a', score: 1, max: 1 },
        { criterionId: 'b', score: 0, max: 1 },
      ],
      1,
      0.62,
    ],
    ['2.675 is below its half', [{ criterionId: 'a', weight: 1 }], [{ criterionId: 'a', score: 2.675, max: 10 }], 10, 2.67],
    [
      'a tie rounds half to even (0.375)',
      [
        { criterionId: 'a', weight: 3 },
        { criterionId: 'b', weight: 5 },
      ],
      [
        { criterionId: 'a', score: 1, max: 1 },
        { criterionId: 'b', score: 0, max: 1 },
      ],
      1,
      0.38,
    ],
  ];

  it.each(CASES)('%s', (_name, rubric, marks, possible, expected) => {
    expect(composite(rubric, marks, possible)).toBe(expected);
  });

  it('an empty rubric cannot ground a grade, said loudly', () => {
    expect(() => composite([], [], 10)).toThrow('rubric has no criteria');
  });

  it('a weight sum of 0 cannot be normalised, said loudly', () => {
    expect(() => composite([{ criterionId: 'a', weight: 0 }], [], 10)).toThrow('rubric weight-sum is 0');
  });

  // Each expectation is Python's own round(x, 2) for the same double.
  it('rounds the exact value, half to even only on a true tie', () => {
    expect(roundHalfEven2(0.8000000000000002)).toBe(0.8);
    expect(roundHalfEven2(6.000000000000001)).toBe(6);
    expect(roundHalfEven2(0.125)).toBe(0.12);
    expect(roundHalfEven2(0.875)).toBe(0.88);
    expect(roundHalfEven2(1.005)).toBe(1);
    expect(roundHalfEven2(1.0050000000000001)).toBe(1.01);
    expect(roundHalfEven2(1.015)).toBe(1.01);
  });
});
