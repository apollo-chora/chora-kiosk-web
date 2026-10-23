import list from '../../../../kiosk/world/prepared-choices.json';
import { WordRevisionTemplate, wordRevisionPrompt } from './word-revision';

// LIVE `words` writes its prompt with the golden run's own template (kiosk/world/PREPARED-
// CHOICES.md section 7), read from the manifest; the list's `example` is the test vector the
// conductor and kiosk-web must both reproduce byte for byte.
const TEMPLATE = list.templates.word_revision as WordRevisionTemplate;
const EXAMPLE = list.templates.word_revision.example;

const option = (label: string, is_correct = false, explainer = '') => ({ label, is_correct, explainer });

describe('the word revision prompt (PREPARED-CHOICES.md section 7)', () => {
  it('reproduces the list’s own example byte for byte', () => {
    expect(wordRevisionPrompt(TEMPLATE, EXAMPLE.candidate, EXAMPLE.instruction)).toBe(EXAMPLE.prompt);
  });

  it('letters the options in the candidate’s order and names the correct one', () => {
    const p = wordRevisionPrompt(
      TEMPLATE,
      { prompt: 'Which?', mcq_payload: { options: [option('One'), option('Two'), option('Three', true)] } },
      'Make the question simpler',
    );
    expect(p).toContain('Question: Which?\nA. One\nB. Two\nC. Three\nCorrect answer: C\n');
    expect(p.endsWith('Instruction: Make the question simpler')).toBe(true);
  });

  it('substitutes once: text that looks like a placeholder stays as written', () => {
    const p = wordRevisionPrompt(TEMPLATE, { prompt: 'Is {answer} a word?', mcq_payload: { options: [option('{stem}', true), option('No')] } }, 'Keep {options}');
    expect(p).toContain('Question: Is {answer} a word?\nA. {stem}\nB. No\nCorrect answer: A\n');
    expect(p.endsWith('Instruction: Keep {options}')).toBe(true);
  });

  it('refuses a draft without exactly one correct option', () => {
    const none = { prompt: 'Q', mcq_payload: { options: [option('a'), option('b')] } };
    const two = { prompt: 'Q', mcq_payload: { options: [option('a', true), option('b', true)] } };
    expect(() => wordRevisionPrompt(TEMPLATE, none, 'x')).toThrow(/exactly one correct option, found 0/);
    expect(() => wordRevisionPrompt(TEMPLATE, two, 'x')).toThrow(/exactly one correct option, found 2/);
  });

  it('refuses a draft that is not a multiple-choice question, or has more options than letters', () => {
    expect(() => wordRevisionPrompt(TEMPLATE, { prompt: 'Explain.' }, 'x')).toThrow(/only multiple-choice drafts are revised/);
    const seven = { prompt: 'Q', mcq_payload: { options: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((l, i) => option(l, i === 0)) } };
    expect(() => wordRevisionPrompt(TEMPLATE, seven, 'x')).toThrow(/7 options, more than the 6 letters/);
  });

  it('letters up to six options, as many as the copied hand editor allows (MAX_MCQ_OPTIONS)', () => {
    const six = { prompt: 'Q', mcq_payload: { options: ['a', 'b', 'c', 'd', 'e', 'f'].map((l, i) => option(l, i === 5)) } };
    expect(wordRevisionPrompt(TEMPLATE, six, 'x')).toContain('E. e\nF. f\nCorrect answer: F\n');
  });

  it('refuses a template with a placeholder it does not know', () => {
    const bad: WordRevisionTemplate = { ...TEMPLATE, lines: [...TEMPLATE.lines, 'Level: {level}'] };
    expect(() => wordRevisionPrompt(bad, EXAMPLE.candidate, 'x')).toThrow(/unknown placeholder \{level\}/);
  });
});
