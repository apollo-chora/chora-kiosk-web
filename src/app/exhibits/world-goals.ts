/** The learner's three goals, by their world keys, in the order the exhibits show them (mockup ATLAS and COMP_MAP). */
export const GOAL_KEYS = ['goal.water', 'goal.nature', 'goal.hawker'] as const;
export type GoalKey = (typeof GOAL_KEYS)[number];
