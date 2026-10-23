import papers from '../../../../kiosk/world/papers/papers.json';
import type { ProposedGrowthEdge } from '../../product-api/growth-edges.service';
import { lineParts, paperQuestions, placeSpots, type PaperQuestion } from './paper-extract';
import recorded from './paper-runs.recorded.json';

// W52 (K182): the paper popup's extract. The analyser's weak spots carry no question reference, so a
// weak spot sits under the lost-mark question whose key words (papers.json `spot_words`) its own words
// name: its title first, then its summary; exactly one question places it, none or several leave it
// apart; a lost mark with no weak spot says so. Full-mark questions take no part.

/** papers.json's own questions (kiosk/world/papers, with spot_words since 789a5852d). */
function questionsOf(key: string): unknown {
  const p = papers.papers.find((x) => x.key === key);
  if (!p) throw new Error(`papers.json has no ${key}`);
  return p.questions;
}

const runs = recorded.runs as Record<string, { upload_id: string; proposed_edges: ProposedGrowthEdge[] }>;
/** Each lost mark's question number and the titles placed under it, then the titles left apart. */
function placed(key: string, run: string): { lost: Record<number, string[]>; apart: string[] } {
  const x = placeSpots(paperQuestions(key, questionsOf(key)), runs[run].proposed_edges);
  return { lost: Object.fromEntries(x.lost.map((l) => [l.n, l.spots.map((s) => s.concept_label)])), apart: x.apart.map((s) => s.concept_label) };
}

const edge = (id: string, concept_label: string, summary = ''): ProposedGrowthEdge => ({ proposed_edge_id: id, concept_label, summary, strength: 0.8, suggested_difficulty: 'standard' });
const q = (n: Partial<PaperQuestion> & { got: number; marks: number }): PaperQuestion => ({ q: 'Q', answer: 'A', note: '', ...n });

describe('placeSpots (W52) on the six recorded reads of the three papers', () => {
  it('gemma4 (the LIVE reader, K179): every lost mark gets its one weak spot, none left apart', () => {
    expect(placed('paper.water', 'gemma4.water')).toEqual({
      lost: { 1: ["Singapore's Four National Taps"], 3: ['Desalination Process (Reverse Osmosis)'], 5: ['Economics of Water Production'] },
      apart: [],
    });
    expect(placed('paper.nature', 'gemma4.nature')).toEqual({
      lost: { 2: ['Otter Dietary Habits'], 3: ['Ecological Functions of Mangroves'], 4: ['Supertree Structure and Function'], 5: ['Evapotranspiration Cooling'] },
      apart: [],
    });
    expect(placed('paper.hawker', 'gemma4.hawker')).toEqual({
      lost: { 1: ['UNESCO Heritage Classifications'], 3: ['Singaporean Coffee-Shop Terminology'], 5: ['Urban Planning and Public Health History'], 6: ['Teh Tarik Preparation'] },
      apart: [],
    });
  });

  it('the golden Gemini reviews: placed by the summary where the title names no question, and teh tarik named by none', () => {
    expect(placed('paper.water', 'prepared.water')).toEqual({
      // "Membrane Separation Stages in Desalination" names no question; its summary names reverse osmosis and microfiltration.
      // "Energy Requirements of Desalination" is placed by its title, though its summary also names reverse osmosis.
      lost: { 1: ["Singapore's Four National Taps"], 3: ['Membrane Separation Stages in Desalination'], 5: ['Energy Requirements of Desalination'] },
      apart: [],
    });
    expect(placed('paper.nature', 'prepared.nature').apart).toEqual([]);
    expect(placed('paper.hawker', 'prepared.hawker')).toEqual({
      lost: {
        1: ['UNESCO Heritage Classifications: Tangible vs. Intangible'],
        3: ['Traditional Nanyang Drink Customization and Dialect Terminology'],
        5: ['Historical Purpose and Development of Hawker Centres'],
        6: [],
      },
      apart: [],
    });
  });
});

describe('placeSpots (W52) on the take that froze the prepared papers (snapshot 01a15d6e, gemma4)', () => {
  it('places all 11 lost marks, one weak spot each, none apart', () => {
    expect(placed('paper.water', 'take.water')).toEqual({
      // "Desalination Process: Salt Removal" names no question by its title ("Removal" is not "remove salt"); its summary names microfiltration and reverse osmosis.
      lost: { 1: ["Singapore's Four National Taps"], 3: ['Desalination Process: Salt Removal'], 5: ['Energy Costs of Desalination'] },
      apart: [],
    });
    expect(placed('paper.nature', 'take.nature')).toEqual({
      lost: { 2: ['Otter Diet and Classification'], 3: ['Ecological Functions of Mangroves'], 4: ['Sustainable Architecture: Supertrees'], 5: ['Plant Transpiration and Cooling'] },
      apart: [],
    });
    expect(placed('paper.hawker', 'take.hawker')).toEqual({
      lost: { 1: ['UNESCO Intangible Cultural Heritage'], 3: ['Singaporean Coffee Nomenclature'], 5: ['Historical Purpose of Hawker Centres'], 6: ['Teh Tarik Preparation Technique'] },
      apart: [],
    });
  });
});

describe('placeSpots (W52), the rule', () => {
  const two = [q({ q: 'otters', got: 0, marks: 1, spot_words: ['otter'] }), q({ q: 'cooling', got: 1, marks: 2, spot_words: ['cool', 'transpiration'] })];

  it('a word matches case apart from the start of a word, never inside one', () => {
    const x = placeSpots(two, [edge('a', 'Smooth-coated Otters'), edge('b', 'Potters and kilns'), edge('c', 'Cooling streets'), edge('d', 'Evapotranspiration')]);
    expect(x.lost.map((l) => l.spots.map((s) => s.proposed_edge_id))).toEqual([['a'], ['c']]);
    expect(x.apart.map((s) => s.proposed_edge_id)).toEqual(['b', 'd']);
  });

  it('the title decides first; the summary only when the title names no question', () => {
    const x = placeSpots(two, [edge('a', 'Otter diets', 'they cool off in water'), edge('b', 'Why streets feel better', 'transpiration from leaves')]);
    expect(x.lost.map((l) => l.spots.map((s) => s.proposed_edge_id))).toEqual([['a'], ['b']]);
  });

  it('a title or a summary naming two questions places nothing: the weak spot is listed apart', () => {
    const x = placeSpots(two, [edge('a', 'Otters keep cool'), edge('b', 'Wildlife', 'otters and cooling')]);
    expect(x.lost.map((l) => l.spots)).toEqual([[], []]);
    expect(x.apart.map((s) => s.proposed_edge_id)).toEqual(['a', 'b']);
  });

  it('two weak spots naming one question both sit under it, in the read’s order', () => {
    const x = placeSpots(two, [edge('a', 'Otter diets'), edge('b', 'Otters hunt fish')]);
    expect(x.lost[0].spots.map((s) => s.proposed_edge_id)).toEqual(['a', 'b']);
  });

  it('only lost marks take part: a full-mark question is never listed, and a weak spot naming only its topic is apart', () => {
    const x = placeSpots([q({ q: 'Johor', got: 1, marks: 1 }), ...two], [edge('a', 'The Johor water agreement')]);
    expect(x.lost.map((l) => [l.n, l.q])).toEqual([
      [2, 'otters'],
      [3, 'cooling'],
    ]);
    expect(x.apart.map((s) => s.proposed_edge_id)).toEqual(['a']);
  });

  it('carries each lost mark’s marks, answer and teacher’s note', () => {
    const [l] = placeSpots([q({ q: 'Name the main food of otters.', answer: 'Seaweed', note: 'Otters eat mostly fish.', got: 0, marks: 1, spot_words: ['otter'] })], []).lost;
    expect(l).toEqual({ n: 1, q: 'Name the main food of otters.', marks: 1, got: 0, answer: 'Seaweed', note: 'Otters eat mostly fish.', spots: [] });
  });
});

describe('paperQuestions (W52)', () => {
  it('reads papers.json’s questions as they are, every lost mark carrying its spot_words', () => {
    expect(paperQuestions('paper.water', questionsOf('paper.water')).map((x) => [x.got, x.marks])).toEqual([
      [1, 2],
      [1, 1],
      [0, 2],
      [1, 1],
      [0, 2],
      [2, 2],
    ]);
    for (const p of papers.papers) {
      const lost = paperQuestions(p.key, p.questions).filter((x) => x.got < x.marks);
      expect(lost.every((x) => (x.spot_words?.length ?? 0) > 0)).toBe(true);
    }
  });

  it('refuses a lost-mark question with no spot_words, naming the paper and the question', () => {
    expect(() => paperQuestions('paper.water', [q({ got: 2, marks: 2 }), q({ got: 0, marks: 2 })])).toThrow("papers.json's paper.water question 2 lost marks and names no spot_words");
    expect(() => paperQuestions('paper.water', [q({ got: 0, marks: 2, spot_words: [] })])).toThrow('question 1 lost marks and names no spot_words');
  });

  it('refuses a paper with no questions, or a question that is not one', () => {
    expect(() => paperQuestions('paper.water', undefined)).toThrow("papers.json's paper.water has no questions");
    expect(() => paperQuestions('paper.water', [{ q: 'Q', marks: 'two', got: 0 }])).toThrow("papers.json's paper.water question 1 is not a question");
  });
});

// K206 (W90): Pingu's essay (papers.json layout "essay") is one open question whose answer is the learner's
// lines, each with the teacher's margin: a tick, or a hint beside the words underlined in red.
describe('the essay (K206)', () => {
  const essay = (lines: unknown) => [{ q: 'Q', marks: 8, got: 4, answer: 'A', note: 'N', spot_words: ['newater'], lines }];

  it('reads the essay’s one question with its seven lines, each margin a tick or the teacher’s hint', () => {
    const [e, ...more] = paperQuestions('paper.water.essay', questionsOf('paper.water.essay'));
    expect(more).toEqual([]);
    expect([e.got, e.marks]).toEqual([4, 8]);
    expect(e.lines?.map((l) => l.margin)).toEqual(['tick', '?', 'who uses most?', 'tick', 'tick', '?', 'just salt?']);
    expect(e.lines?.map((l) => l.text).join(' ')).toBe(e.answer);
    expect(e.lines?.[5].underline).toBe('because seawater is very dirty');
  });

  it('refuses a line that is not one, or whose underline is not in its text, naming the paper, the question and the line', () => {
    expect(() => paperQuestions('paper.water.essay', essay('A line'))).toThrow("papers.json's paper.water.essay question 1 is not a question");
    expect(() => paperQuestions('paper.water.essay', essay([{ text: 'A', margin: 'tick' }, { text: 'B', margin: '' }]))).toThrow("papers.json's paper.water.essay question 1 line 2 is not a line");
    expect(() => paperQuestions('paper.water.essay', essay([{ text: 'A b', margin: '?', underline: 'c' }]))).toThrow("papers.json's paper.water.essay question 1 line 1's underline is not in its text");
  });

  it('its one lost mark carries its lines, and the essay’s weak spots sit under it by the essay’s own words', () => {
    const x = placeSpots(paperQuestions('paper.water.essay', questionsOf('paper.water.essay')), [
      edge('a', 'How NEWater is treated'),
      edge('b', 'Who uses NEWater'),
      edge('c', 'Why desalination costs more'),
      edge('d', 'Brine disposal'),
      edge('e', 'Rainfall in Johor'),
    ]);
    expect(x.lost.map((l) => [l.n, l.got, l.marks, l.lines?.length])).toEqual([[1, 4, 8, 7]]);
    expect(x.lost[0].spots.map((s) => s.proposed_edge_id)).toEqual(['a', 'b', 'c', 'd']);
    expect(x.apart.map((s) => s.proposed_edge_id)).toEqual(['e']);
  });

  it('a marked test’s questions carry no lines', () => {
    expect(placeSpots(paperQuestions('paper.water', questionsOf('paper.water')), []).lost.every((l) => l.lines === undefined)).toBe(true);
  });

  it('lineParts splits a line about its underline; a line with none is all before', () => {
    expect(lineParts({ text: 'The challenge is that it is expensive because seawater is very dirty.', margin: '?', underline: 'because seawater is very dirty' })).toEqual({
      before: 'The challenge is that it is expensive ',
      underline: 'because seawater is very dirty',
      after: '.',
    });
    expect(lineParts({ text: 'One challenge is that some people do not like the idea of drinking it.', margin: 'tick' })).toEqual({
      before: 'One challenge is that some people do not like the idea of drinking it.',
      underline: '',
      after: '',
    });
  });
});
