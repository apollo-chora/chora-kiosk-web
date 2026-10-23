import { normalizeConceptKey } from './concept-key';

// Production's concept key (consumption `domain/concept_graph/concept_node.go:185`, byte-identical to
// `learner_weakness.NormalizeConceptKey`): the key the serve door adopts a prepared set by (V1), so
// kiosk-web's h3 = A choice of "is this idea prepared" must compute exactly what the server does.
describe('normalizeConceptKey', () => {
  it("gives production's own answers (learner_weakness_test.go, select_learning_edges_test.go)", () => {
    const cases: Record<string, string> = {
      'Causes of Riverine Flooding': 'causes-of-riverine-flooding',
      '  multiple   spaces  ': 'multiple-spaces',
      'already-a-slug': 'already-a-slug',
      'Photosynthesis (C3 vs C4)!': 'photosynthesis-c3-vs-c4',
      '!!!': '',
      UPPER_snake_Case: 'upper-snake-case',
      Roots: 'roots',
      'Completing the square': 'completing-the-square',
      '  Photosynthesis!! ': 'photosynthesis',
      'Off-by-one errors': 'off-by-one-errors',
    };
    for (const [title, key] of Object.entries(cases)) expect(normalizeConceptKey(title), title).toBe(key);
  });

  it("gives the conductor's extra cases (prepared/support_test.go) and the story's own keys", () => {
    expect(normalizeConceptKey('Reverse Osmosis')).toBe('reverse-osmosis');
    expect(normalizeConceptKey('Reverse osmosis')).toBe('reverse-osmosis');
    expect(normalizeConceptKey('Café crème')).toBe('caf-cr-me');
    expect(normalizeConceptKey('Singapore’s water')).toBe('singapore-s-water');
  });

  it("lower-cases one character at a time as Go's strings.ToLower does (outputs of Go 1.26, run 17 Oct)", () => {
    // JavaScript's toLowerCase expands U+0130 to "i" plus a combining dot; Go maps it to "i" alone.
    expect(normalizeConceptKey('İstanbul')).toBe('istanbul');
    expect(normalizeConceptKey('Kelvin')).toBe('kelvin');
    expect(normalizeConceptKey('ǅemal')).toBe('emal');
    expect(normalizeConceptKey('ẞtraße')).toBe('tra-e');
    expect(normalizeConceptKey('Ⅻ Twelve')).toBe('twelve');
  });
});
