import en from '../../i18n/en.json';
import zh from '../../i18n/zh.json';
import { SKILL_WORDS } from './companion-words';

// Every skill production's catalogue can wake (consumption domain/companion/seedspec/seedspec.go,
// the 27 SkillKey rows) has plain words in both tables, so no stage-up shows a raw key (K138 W5:
// the walk saw reminder_bell). The words are production's own (chora-web familiar_skill), but for
// the two the approved mockup words itself (cx.skill.explainAnew, cx.skill.recapScribe).
const PRODUCTION_SKILLS = [
  'explain_anew', 'quiz_me', 'worked_example', 'socratic_drill', 'flashcard_forge', 'step_checker', 'polyglot',
  'map_sight', 'weakness_sight', 'progress_mirror', 'recap_scribe', 'photo_sight', 'reminder_bell', 'path_weaver',
  'kg_explore', 'goal_scribe', 'atom_forge', 'study_calendar', 'web_research', 'source_reader', 'fact_check',
  'duel_second', 'dawn_briefing', 'watchful_eye', 'long_weaving', 'twin_rituals', 'weave_mastery',
];

describe('SKILL_WORDS', () => {
  it('names every skill production can wake, in English and in Chinese', () => {
    const tables = { en: en as Record<string, string>, zh: zh as Record<string, string> };
    const missing = PRODUCTION_SKILLS.flatMap((k) => {
      const key = SKILL_WORDS[k];
      if (!key) return [`${k}: no key`];
      return (['en', 'zh'] as const).filter((l) => !tables[l][key]?.trim()).map((l) => `${k}: no ${l} words`);
    });
    expect(missing).toEqual([]);
  });

  it('says Reminder for reminder_bell, as production does', () => {
    expect([(en as Record<string, string>)[SKILL_WORDS['reminder_bell']], (zh as Record<string, string>)[SKILL_WORDS['reminder_bell']]]).toEqual(['Reminder', '提醒']);
  });
});
