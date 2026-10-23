import { describe, it, expect } from 'vitest';

import {
  authorQuestionToAtomContent,
  fromWireCognitiveLevel,
  toCreateRequest,
  toDifficultyBucket,
  toEditRequest,
  toWireCognitiveLevel,
  type AuthorQuestionWire,
  type McqContent,
  type OpenEndedContent,
} from './atom-authoring.model';

// Authoring-metadata wire-through (2026-06-03): the 1-5 slider maps to the
// qgen 3-bucket vocabulary {foundation, intermediate, advanced} (ADR-157) so
// difficulty ships as a string on the AI-assist metadata (the BE map<string,
// string> rejects ints) and the generator + critic condition on it.
describe('toDifficultyBucket', () => {
  it('maps 1-2 → foundation, 3 → intermediate, 4-5 → advanced', () => {
    expect(toDifficultyBucket(1)).toBe('foundation');
    expect(toDifficultyBucket(2)).toBe('foundation');
    expect(toDifficultyBucket(3)).toBe('intermediate');
    expect(toDifficultyBucket(4)).toBe('advanced');
    expect(toDifficultyBucket(5)).toBe('advanced');
  });
});

/**
 * CHO-1638: re-open converter. Maps the AUTHOR projection wire shape
 * (`mcq`/`oe` keys, answer key + minted image refs nested inside) to the
 * editable `AtomContent` that seeds the editor on re-open.
 */
describe('authorQuestionToAtomContent', () => {
  it('maps an MCQ author question to McqContent with answer key + both images', () => {
    const wire: AuthorQuestionWire = {
      question_id: 'q-1',
      type: 'mcq',
      prompt: 'Which stage forms clouds?',
      mcq: {
        options: [
          { option_id: 'a', label: 'Condensation', is_correct: true, explainer: 'Yes' },
          { option_id: 'b', label: 'Evaporation', is_correct: false, explainer: 'No' },
        ],
        image_url: 'https://signed.example/stem.png?X-Goog-Expires=899',
        answer_image_url: 'https://signed.example/ans.png?X-Goog-Expires=899',
      },
    };

    const content = authorQuestionToAtomContent(wire) as McqContent;

    expect(content).not.toBeNull();
    expect(content.type).toBe('mcq');
    expect(content.kind).toBe('manual');
    expect(content.prompt).toBe('Which stage forms clouds?');
    expect(content.mcq_payload.options).toHaveLength(2);
    expect(content.mcq_payload.options[0].is_correct).toBe(true);
    expect(content.mcq_payload.options[0].explainer).toBe('Yes');
    expect(content.image_url).toBe('https://signed.example/stem.png?X-Goog-Expires=899');
    expect(content.answer_image_url).toBe('https://signed.example/ans.png?X-Goog-Expires=899');
  });

  it('omits image fields when the wire carries none', () => {
    const wire: AuthorQuestionWire = {
      question_id: 'q-2',
      type: 'mcq',
      prompt: 'No images here',
      mcq: {
        options: [
          { option_id: 'a', label: 'A', is_correct: true, explainer: 'y' },
          { option_id: 'b', label: 'B', is_correct: false, explainer: 'n' },
        ],
      },
    };

    const content = authorQuestionToAtomContent(wire) as McqContent;

    expect('image_url' in content).toBe(false);
    expect('answer_image_url' in content).toBe(false);
  });

  // Uses the REAL author-projection shape: rubric is NESTED under `criteria`
  // with integer `weight_percent` + `description` (the chora-creation domain
  // shape), plus grader_tier + min/max_response_chars. The converter MUST
  // normalize this to the FE-flat OeRubricCriterion[] (weight_percent/100 →
  // weight, description → title) so oe-fields can `.map` it on re-open. The
  // prior fixture used the wrong flat shape, masking the crash that left the
  // edit-OE editor empty (oe-fields:159 `(rubric ?? []).map` on an object).
  it('maps an OE author question (nested rubric) to flat OpenEndedContent', () => {
    const wire: AuthorQuestionWire = {
      question_id: 'q-3',
      type: 'oe',
      prompt: 'Explain a simple electric circuit.',
      oe: {
        model_answer: 'A closed loop lets current flow from the battery through the bulb.',
        rubric: {
          criteria: [
            { criterion_id: 'c1', description: 'Role of the Battery', weight_percent: 30 },
            { criterion_id: 'c2', description: 'Roles of Wires and Bulb', weight_percent: 40 },
            { criterion_id: 'c3', description: 'Closed Circuit Condition', weight_percent: 30 },
          ],
        },
        grader_tier: 'T2',
        min_response_chars: 50,
        max_response_chars: 1500,
        image_url: 'https://signed.example/oe-stem.png',
        answer_image_url: 'https://signed.example/oe-ans.png',
      },
    };

    const content = authorQuestionToAtomContent(wire) as OpenEndedContent;

    expect(content.type).toBe('oe');
    expect(content.oe_payload.model_answer).toContain('closed loop');
    // Rubric normalized to a flat array (so oe-fields `.map` works on re-open).
    expect(Array.isArray(content.oe_payload.rubric)).toBe(true);
    expect(content.oe_payload.rubric).toHaveLength(3);
    expect(content.oe_payload.rubric![0].criterion_id).toBe('c1');
    expect(content.oe_payload.rubric![0].title).toBe('Role of the Battery'); // description → title
    expect(content.oe_payload.rubric![1].weight).toBeCloseTo(0.4); // weight_percent/100
    // Fractions still sum to 1.0 → the FE rubricWeightsValid gate passes.
    const sum = content.oe_payload.rubric!.reduce((a, c) => a + c.weight, 0);
    expect(sum).toBeCloseTo(1.0);
    // grader_tier + min/max carried (were dropped before).
    expect(content.oe_payload.grader_tier).toBe('T2');
    expect(content.oe_payload.min_response_chars).toBe(50);
    expect(content.oe_payload.max_response_chars).toBe(1500);
    expect(content.image_url).toBe('https://signed.example/oe-stem.png');
    expect(content.answer_image_url).toBe('https://signed.example/oe-ans.png');
  });

  it('maps an OE author question with no rubric (omits the key, no crash)', () => {
    const wire: AuthorQuestionWire = {
      question_id: 'q-4',
      type: 'oe',
      prompt: 'Open question, no rubric.',
      oe: { model_answer: 'Some answer.' },
    };
    const content = authorQuestionToAtomContent(wire) as OpenEndedContent;
    expect(content.type).toBe('oe');
    expect(content.oe_payload.model_answer).toBe('Some answer.');
    // No rubric → undefined (oe-fields `?? []` handles it); never an object.
    expect(content.oe_payload.rubric === undefined || Array.isArray(content.oe_payload.rubric)).toBe(true);
  });

  it('returns null for a type with no matching payload', () => {
    expect(
      authorQuestionToAtomContent({ question_id: 'q', type: 'mcq', prompt: 'p' }),
    ).toBeNull();
  });

  // ── BRANCH: node 14: `q.mcq.options ?? []` nullish (mcq present, no options).
  it('defaults MCQ options to [] when the wire omits options', () => {
    const wire: AuthorQuestionWire = {
      question_id: 'q-mcq-noopts',
      type: 'mcq',
      prompt: 'No options on the wire',
      mcq: {}, // truthy mcq object but options undefined → `?? []` fires
    };
    const content = authorQuestionToAtomContent(wire) as McqContent;
    expect(content).not.toBeNull();
    expect(content.mcq_payload.options).toEqual([]);
  });

  // ── BRANCH: nodes 20/21/22/23: per-criterion nullish/ternary fallbacks.
  // A rubric criterion missing criterion_id / description / weight_percent
  // exercises the `?? c{i+1}`, `?? ''`, `?? 0`, and `description ? {…} : {}`
  // fallback arms (each was only ever hit on the present side before).
  it('fills rubric-criterion defaults when criterion fields are absent', () => {
    const wire: AuthorQuestionWire = {
      question_id: 'q-oe-bare',
      type: 'oe',
      prompt: 'Bare rubric criteria.',
      oe: {
        model_answer: 'A model answer.',
        rubric: {
          criteria: [
            {}, // no criterion_id, no description, no weight_percent
            { criterion_id: 'c-explicit', description: 'Has text', weight_percent: 50 },
          ],
        },
      },
    };
    const content = authorQuestionToAtomContent(wire) as OpenEndedContent;
    const rubric = content.oe_payload.rubric!;
    expect(rubric).toHaveLength(2);
    // node 20: criterion_id ?? `c${i+1}` → synthesised id for index 0
    expect(rubric[0].criterion_id).toBe('c1');
    // node 21: description ?? '' → empty title
    expect(rubric[0].title).toBe('');
    // node 22: weight_percent ?? 0 → 0/100
    expect(rubric[0].weight).toBe(0);
    // node 23 (falsy arm): no description key spread when absent
    expect('description' in rubric[0]).toBe(false);
    // present-side companion: explicit criterion keeps its values + description key
    expect(rubric[1].criterion_id).toBe('c-explicit');
    expect(rubric[1].title).toBe('Has text');
    expect(rubric[1].description).toBe('Has text');
  });

  // ── BRANCH: node 24: `q.oe.model_answer ?? ''` nullish (oe present, no model_answer).
  it('defaults OE model_answer to empty string when omitted', () => {
    const wire: AuthorQuestionWire = {
      question_id: 'q-oe-noans',
      type: 'oe',
      prompt: 'No model answer.',
      oe: {}, // truthy oe object but model_answer undefined → `?? ''`
    };
    const content = authorQuestionToAtomContent(wire) as OpenEndedContent;
    expect(content.type).toBe('oe');
    expect(content.oe_payload.model_answer).toBe('');
  });

  // ── BRANCH: final `return null` for an unsupported discriminator value.
  it('returns null when the type is neither mcq nor oe', () => {
    const wire = {
      question_id: 'q-reserved',
      type: 'reserved_true_false',
      prompt: 'Coming soon type.',
    } as unknown as AuthorQuestionWire;
    expect(authorQuestionToAtomContent(wire)).toBeNull();
  });
});

// ── fromWireCognitiveLevel: null guard + hasOwnProperty hit/miss (nodes 0,1).
describe('fromWireCognitiveLevel', () => {
  it('returns null for null/undefined (node 0 true arm)', () => {
    expect(fromWireCognitiveLevel(null)).toBeNull();
    expect(fromWireCognitiveLevel(undefined)).toBeNull();
  });

  it('maps a recognised BE wire enum back to the FE label (node 1 true arm)', () => {
    expect(fromWireCognitiveLevel('knowledge')).toBe('remembering');
    expect(fromWireCognitiveLevel('synthesis')).toBe('creating');
    expect(fromWireCognitiveLevel('evaluation')).toBe('evaluating');
  });

  it('returns null for an unrecognised wire value (node 1 false arm)', () => {
    expect(fromWireCognitiveLevel('not-a-bloom-level')).toBeNull();
    // hasOwnProperty must be false even for inherited Object.prototype names.
    expect(fromWireCognitiveLevel('toString')).toBeNull();
  });
});

// ── toWireCognitiveLevel: forward map (companion to the reverse map).
describe('toWireCognitiveLevel', () => {
  it('maps every FE revised-Bloom label to its BE older-Bloom enum', () => {
    expect(toWireCognitiveLevel('remembering')).toBe('knowledge');
    expect(toWireCognitiveLevel('understanding')).toBe('comprehension');
    expect(toWireCognitiveLevel('applying')).toBe('application');
    expect(toWireCognitiveLevel('analyzing')).toBe('analysis');
    expect(toWireCognitiveLevel('evaluating')).toBe('evaluation');
    expect(toWireCognitiveLevel('creating')).toBe('synthesis');
  });
});

// ── toCreateRequest / toEditRequest exercise both the mcq and oe arms
// (nodes 10, 11) plus the buildOeWireBody field-presence branches
// (nodes 4-7) and imageFields branches (nodes 8, 9).
describe('toCreateRequest', () => {
  it('builds an MCQ create body with both image fields (mcq arm + image present)', () => {
    const content: McqContent = {
      kind: 'manual',
      type: 'mcq',
      prompt: 'MCQ prompt',
      mcq_payload: {
        options: [
          { option_id: 'a', label: 'A', is_correct: true, explainer: 'y' },
        ],
      },
      image_url: 'https://cdn.example/stem.png',
      answer_image_url: 'https://cdn.example/ans.png',
    };
    const body = toCreateRequest(content);
    expect(body.type).toBe('mcq');
    expect(body.prompt).toBe('MCQ prompt');
    expect(body.mcq_payload).toBe(content.mcq_payload);
    expect(body.image_url).toBe('https://cdn.example/stem.png');
    expect(body.answer_image_url).toBe('https://cdn.example/ans.png');
    expect('oe_payload' in body).toBe(false);
  });

  it('builds an MCQ create body with no images (imageFields false arms)', () => {
    const content: McqContent = {
      kind: 'manual',
      type: 'mcq',
      prompt: 'MCQ no image',
      mcq_payload: { options: [] },
    };
    const body = toCreateRequest(content);
    expect('image_url' in body).toBe(false);
    expect('answer_image_url' in body).toBe(false);
  });

  it('builds an OE create body with a full payload (all buildOeWireBody true arms)', () => {
    const content: OpenEndedContent = {
      kind: 'manual',
      type: 'oe',
      prompt: 'OE prompt',
      oe_payload: {
        model_answer: 'The answer.',
        rubric: [{ criterion_id: 'c1', title: 'Crit', weight: 1 }],
        min_response_chars: 10,
        max_response_chars: 200,
        grader_tier: 'T1',
      },
    };
    const body = toCreateRequest(content);
    expect(body.type).toBe('oe');
    expect(body.oe_payload!.model_answer).toBe('The answer.');
    expect(body.oe_payload!.rubric).toHaveLength(1);
    expect(body.oe_payload!.min_response_chars).toBe(10);
    expect(body.oe_payload!.max_response_chars).toBe(200);
    expect(body.oe_payload!.grader_tier).toBe('T1');
  });

  it('builds an OE create body omitting nullable fields (buildOeWireBody false arms)', () => {
    const content: OpenEndedContent = {
      kind: 'manual',
      type: 'oe',
      prompt: 'OE minimal',
      oe_payload: {
        // rubric undefined → node 4 false; the *_chars + grader_tier null → 5/6/7 false
        model_answer: 'Minimal answer.',
        min_response_chars: null,
        max_response_chars: null,
        grader_tier: null,
      },
    };
    const body = toCreateRequest(content);
    expect(body.oe_payload!.model_answer).toBe('Minimal answer.');
    expect('rubric' in body.oe_payload!).toBe(false);
    expect('min_response_chars' in body.oe_payload!).toBe(false);
    expect('max_response_chars' in body.oe_payload!).toBe(false);
    expect('grader_tier' in body.oe_payload!).toBe(false);
  });
});

describe('toEditRequest', () => {
  it('builds an MCQ patch body (mcq arm) carrying one image only', () => {
    const content: McqContent = {
      kind: 'manual',
      type: 'mcq',
      prompt: 'Edited MCQ',
      mcq_payload: { options: [] },
      image_url: 'https://cdn.example/edit-stem.png',
      // answer_image_url absent → imageFields node 9 false arm
    };
    const body = toEditRequest(content);
    expect(body.prompt).toBe('Edited MCQ');
    expect(body.mcq_payload).toBe(content.mcq_payload);
    expect(body.image_url).toBe('https://cdn.example/edit-stem.png');
    expect('answer_image_url' in body).toBe(false);
    expect('oe_payload' in body).toBe(false);
  });

  it('builds an OE patch body (oe arm) via buildOeWireBody', () => {
    const content: OpenEndedContent = {
      kind: 'manual',
      type: 'oe',
      prompt: 'Edited OE',
      oe_payload: {
        model_answer: 'Edited answer.',
        rubric: [],
      },
    };
    const body = toEditRequest(content);
    expect(body.prompt).toBe('Edited OE');
    expect(body.oe_payload!.model_answer).toBe('Edited answer.');
    // rubric defined (empty array) → node 4 true arm, round-trips as-is
    expect(body.oe_payload!.rubric).toEqual([]);
    expect('mcq_payload' in body).toBe(false);
  });
});
