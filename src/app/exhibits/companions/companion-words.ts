/**
 * Plain words for what a stage-up reveals. Production's overlay names raw keys like atom_search;
 * the mockup names them in plain words (stageUpHTML, line 2934).
 */

/**
 * The skills a stage can wake: every SkillKey production seeds (consumption seedspec.go), worded as
 * production's chora-web familiar_skill labels; the mockup's own two (CX_SKILL, line 2890) keep
 * the mockup's words. K138 W5: the walk saw reminder_bell shown as its raw key.
 */
export const SKILL_WORDS: Readonly<Record<string, string>> = {
  explain_anew: 'cx.skill.explainAnew',
  recap_scribe: 'cx.skill.recapScribe',
  quiz_me: 'cx.skill.quizMe',
  worked_example: 'cx.skill.workedExample',
  socratic_drill: 'cx.skill.socraticDrill',
  flashcard_forge: 'cx.skill.flashcardForge',
  step_checker: 'cx.skill.stepChecker',
  polyglot: 'cx.skill.polyglot',
  map_sight: 'cx.skill.mapSight',
  weakness_sight: 'cx.skill.weaknessSight',
  progress_mirror: 'cx.skill.progressMirror',
  photo_sight: 'cx.skill.photoSight',
  reminder_bell: 'cx.skill.reminderBell',
  path_weaver: 'cx.skill.pathWeaver',
  kg_explore: 'cx.skill.kgExplore',
  goal_scribe: 'cx.skill.goalScribe',
  atom_forge: 'cx.skill.atomForge',
  study_calendar: 'cx.skill.studyCalendar',
  web_research: 'cx.skill.webResearch',
  source_reader: 'cx.skill.sourceReader',
  fact_check: 'cx.skill.factCheck',
  duel_second: 'cx.skill.duelSecond',
  dawn_briefing: 'cx.skill.dawnBriefing',
  watchful_eye: 'cx.skill.watchfulEye',
  long_weaving: 'cx.skill.longWeaving',
  twin_rituals: 'cx.skill.twinRituals',
  weave_mastery: 'cx.skill.weaveMastery',
};

/** Production's tool ladder (mockup CX_ABILITY, line 3305; consumption growth/curve.go toolsByStage). */
export const ABILITY_WORDS: Readonly<Record<string, string>> = {
  cite_atom: 'cx.ability.citeAtom',
  atom_search: 'cx.ability.atomSearch',
  ebbinghaus_state: 'cx.ability.ebbinghausState',
  persona_lookup: 'cx.ability.personaLookup',
  score_atom_for_learner: 'cx.ability.scoreAtom',
};

/**
 * Ladder tools with no tool behind them yet (curve.go UnshippedLadderTools, ADR-249 A1a; mockup
 * CXP_UNSHIPPED, line 3327): tagged "not on yet" so no screen claims a working tool that is not there.
 */
export const UNSHIPPED_TOOLS: ReadonlySet<string> = new Set(['atom_search', 'ebbinghaus_state', 'persona_lookup', 'score_atom_for_learner']);

/**
 * Why a card is in the dose, by consumption's dose_reason (mockup cx.dose.why_*, line 3514). The
 * mockup had no fresh card; production's fresh top-up reads "fresh" while its category stays "new"
 * (daily_dose.go:339, companion_handlers.go doseReasonToCategory).
 */
export const REASON_WORDS: Readonly<Record<string, string>> = {
  campaign: 'cx.dose.why_campaign',
  ebbinghaus_review: 'cx.dose.why_review',
  weakness: 'cx.dose.why_weakness',
  curiosity: 'cx.dose.why_curiosity',
  fresh: 'cx.dose.why_fresh',
};
