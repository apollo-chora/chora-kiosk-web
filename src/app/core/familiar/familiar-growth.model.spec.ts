import { describe, expect, it } from 'vitest';

import {
  BREED_ADJECTIVE,
  STAGE_NAMES,
  breedStageLabel,
  learnerFamiliarName,
  normalizeLoadoutView,
  normalizeSkillInvokeResult,
  normalizeSkillParamsSchema,
} from './familiar-growth.model';
import type { LoadoutView } from './familiar-growth.model';
import type { BreedSpecies } from '../../shared/components/breed-art/breed-art.component';

describe('normalizeSkillInvokeResult: Seeker citations + Search-Suggestions chip (P5 Far Sight, CHO-2113)', () => {
  it('maps snake_case search_entry_point_html + web citations (direct consumption hop)', () => {
    const r = normalizeSkillInvokeResult({
      skill_key: 'fact_check',
      reply: 'Supported.',
      result_kind: 'chat',
      citations: [
        { url: 'https://nasa.gov/earth', title: 'Earth', snippet: 'round', domain: 'nasa.gov' },
      ],
      search_entry_point_html: '<div class="chip">suggest</div>',
    });
    expect(r.citations.length).toBe(1);
    expect(r.citations[0]).toEqual({
      url: 'https://nasa.gov/earth',
      title: 'Earth',
      snippet: 'round',
      domain: 'nasa.gov',
    });
    expect(r.searchEntryPointHtml).toBe('<div class="chip">suggest</div>');
  });

  it('maps camelCase searchEntryPointHtml (FamiliarBridge camelising hop)', () => {
    const r = normalizeSkillInvokeResult({ reply: 'x', searchEntryPointHtml: '<b>chip</b>' });
    expect(r.searchEntryPointHtml).toBe('<b>chip</b>');
  });

  it('drops un-renderable citations (missing url or title): the citation mandate', () => {
    const r = normalizeSkillInvokeResult({
      reply: 'x',
      citations: [
        { title: 'no url', snippet: 's', domain: 'd' },
        { url: 'https://x', snippet: 's' },
        { url: 'https://ok', title: 'ok' },
      ],
    });
    expect(r.citations.length).toBe(1);
    expect(r.citations[0].url).toBe('https://ok');
  });

  it('non-Seeker / hedge results get empty citations + empty chip (keys omitted upstream)', () => {
    const r = normalizeSkillInvokeResult({ skill_key: 'progress_mirror', reply: 'hi', result_kind: 'chat' });
    expect(r.citations).toEqual([]);
    expect(r.searchEntryPointHtml).toBe('');
  });
});

/**
 * CHO-2179: the issued web-search queries (ADR-231 D4/D5).
 *
 * The Google chip already SHOWS these as clickable pills, but the chip's links
 * ride the grounding-redirect infrastructure that EXPIRES (~30 days). These are
 * plain strings: they never expire, so they are the durable "what I searched".
 * They must survive both wire hops (FamiliarBridge camelises; a direct
 * consumption call does not): and must never be fabricated.
 */
describe('normalizeSkillInvokeResult: web search queries (CHO-2179)', () => {
  it('maps snake_case web_search_queries (direct consumption hop)', () => {
    const r = normalizeSkillInvokeResult({
      skill_key: 'fact_check',
      reply: 'Supported.',
      web_search_queries: ['shape of the earth', 'oblate spheroid'],
    });
    expect(r.webSearchQueries).toEqual(['shape of the earth', 'oblate spheroid']);
  });

  it('maps camelCase webSearchQueries (FamiliarBridge camelising hop)', () => {
    const r = normalizeSkillInvokeResult({
      reply: 'x',
      webSearchQueries: ['who is the prime minister of singapore'],
    });
    expect(r.webSearchQueries).toEqual(['who is the prime minister of singapore']);
  });

  it('drops blank + non-string entries (vendor text is not to be trusted)', () => {
    const r = normalizeSkillInvokeResult({
      reply: 'x',
      web_search_queries: ['good query', '', '   ', 42, null, 'another'],
    });
    expect(r.webSearchQueries).toEqual(['good query', 'another']);
  });

  it('never fabricates a query: an absent/malformed key yields []', () => {
    expect(normalizeSkillInvokeResult({ reply: 'x' }).webSearchQueries).toEqual([]);
    expect(
      normalizeSkillInvokeResult({ reply: 'x', web_search_queries: 'not-an-array' }).webSearchQueries,
    ).toEqual([]);
  });
});

/**
 * CHO-2362 - per-Skill param sheets on the loadout (paramsSchema).
 *
 * The BE loadout skills list carries `params_schema` per sheet-bearing grant
 * (rendered from the domain SkillParamSheets table); the FamiliarBridge
 * camelises it to `paramsSchema` on the wire. Rows without the field have no
 * editable params. The normaliser coalesces BOTH spellings (the model's
 * standing dual-spelling defence) and never fabricates a schema.
 */
describe('normalizeSkillParamsSchema (CHO-2362)', () => {
  it('keeps the closed spec fields for every known param type', () => {
    const schema = normalizeSkillParamsSchema({
      scope: { type: 'enum', values: ['weak', 'concept_ref', 'due'], default: 'weak' },
      count: { type: 'int', min: 3, max: 5, default: '3' },
      claim: { type: 'text', maxLen: 200, required: true },
      concept: { type: 'concept_ref' },
      edge: { type: 'growth_edge_ref' },
    });
    expect(schema).toEqual({
      scope: { type: 'enum', values: ['weak', 'concept_ref', 'due'], default: 'weak' },
      count: { type: 'int', min: 3, max: 5, default: '3' },
      claim: { type: 'text', maxLen: 200, required: true },
      concept: { type: 'concept_ref' },
      edge: { type: 'growth_edge_ref' },
    });
  });

  it('drops entries with an unrecognised type (no control can render them)', () => {
    const schema = normalizeSkillParamsSchema({
      window: { type: 'enum', values: ['week'], default: 'week' },
      mystery: { type: 'hologram' },
    });
    expect(schema).toEqual({
      window: { type: 'enum', values: ['week'], default: 'week' },
    });
  });

  it('sanitises malformed spec fields instead of trusting the wire', () => {
    const schema = normalizeSkillParamsSchema({
      scope: { type: 'enum', values: ['weak', 42, null], default: 7, required: 'yes' },
    });
    expect(schema).toEqual({ scope: { type: 'enum', values: ['weak'] } });
  });

  it('returns undefined for an absent or malformed schema', () => {
    expect(normalizeSkillParamsSchema(undefined)).toBeUndefined();
    expect(normalizeSkillParamsSchema(null)).toBeUndefined();
    expect(normalizeSkillParamsSchema('not-an-object')).toBeUndefined();
    expect(normalizeSkillParamsSchema([])).toBeUndefined();
    expect(normalizeSkillParamsSchema({})).toBeUndefined();
    expect(normalizeSkillParamsSchema({ ghost: { type: 'hologram' } })).toBeUndefined();
  });
});

describe('normalizeLoadoutView (CHO-2362)', () => {
  const baseGrant = {
    skillKey: 'quiz_me',
    skillKind: 'active',
    slotCost: 1,
    equipped: true,
    unlockedVia: 'species_path',
    unlockedAtStage: 4,
    catalogueActive: true,
  };
  const baseView = {
    familiarId: 'fam-1',
    skillGrants: ['quiz_me'],
    equippedSkills: ['quiz_me'],
    skillSlotsUnlocked: 3,
    slotsUsed: 1,
    evolutionTier: 'adept',
    growthStage: 4,
  };

  it('coalesces the camel paramsSchema spelling (FamiliarBridge hop)', () => {
    const view = normalizeLoadoutView({
      ...baseView,
      grants: [
        { ...baseGrant, paramsSchema: { count: { type: 'int', min: 3, max: 5, default: '3' } } },
      ],
    } as unknown as LoadoutView);
    expect(view.grants[0].paramsSchema).toEqual({
      count: { type: 'int', min: 3, max: 5, default: '3' },
    });
    expect(view.familiarId).toBe('fam-1');
    expect(view.grants[0].skillKey).toBe('quiz_me');
  });

  it('coalesces the snake params_schema spelling (non-camelising hop) and strips it', () => {
    const view = normalizeLoadoutView({
      ...baseView,
      grants: [
        {
          ...baseGrant,
          params_schema: { window: { type: 'enum', values: ['week', 'all'], default: 'all' } },
        },
      ],
    } as unknown as LoadoutView);
    expect(view.grants[0].paramsSchema).toEqual({
      window: { type: 'enum', values: ['week', 'all'], default: 'all' },
    });
    expect('params_schema' in (view.grants[0] as unknown as Record<string, unknown>)).toBe(false);
  });

  it('leaves a sheetless grant schema-free (the honest no-editable-params state)', () => {
    const view = normalizeLoadoutView({
      ...baseView,
      grants: [{ ...baseGrant, skillKey: 'reminder_bell' }],
    } as unknown as LoadoutView);
    expect(view.grants[0].paramsSchema).toBeUndefined();
    expect(view.grants[0].skillKey).toBe('reminder_bell');
  });
});

/**
 * Stage-0 vocabulary: the learner-facing word is POD, never "Egg".
 *
 * The Stage-0 artwork IS the Pod (`/assets/familiars/pods/pod-standard.png`)
 * and every Stage-0 i18n VALUE says Pod ("Your Pod", "An iridescent Pod", "A
 * mysterious Pod"). Only the CODE-side spellings stay `egg` (i18n KEYS, field
 * names, routes), so `STAGE_NAMES[0]` must remain the key segment 'egg' while
 * anything that reaches a learner's eyes reads "Pod".
 */
describe('Stage-0 display vocabulary is Pod, not Egg', () => {
  it('BREED_ADJECTIVE stage 0 reads "Pod" for every species', () => {
    for (const [species, table] of Object.entries(BREED_ADJECTIVE)) {
      expect(table[0], `species ${species}`).toBe('Pod');
    }
  });

  it('breedStageLabel is "Pod" at stage 0 for a revealed species', () => {
    expect(breedStageLabel('dragon', 0)).toBe('Pod');
    expect(breedStageLabel('penguin', 0)).toBe('Pod');
  });

  it('breedStageLabel is "Pod" at stage 0 when the species is still unknown', () => {
    // The LIVE pre-hatch case: the breed is a mystery until the awakening, so
    // the wire carries an empty species. Falling through to STAGE_NAMES[0]
    // would print the raw i18n key segment 'egg' at the learner.
    expect(breedStageLabel('' as BreedSpecies, 0)).toBe('Pod');
  });

  it('leaves the STAGE_NAMES i18n key segments untouched', () => {
    // These are KEYS (familiar_grimoire.stage.egg, aplus.familiar.stage.egg),
    // not display text - renaming them would orphan the translations.
    expect(STAGE_NAMES[0]).toBe('egg');
  });

  it('keeps the hatched stage labels breed-flavoured', () => {
    expect(breedStageLabel('owl', 1)).toBe('Owlet');
    expect(breedStageLabel('fox', 6)).toBe('Vulpine');
    expect(breedStageLabel('' as BreedSpecies, 3)).toBe(STAGE_NAMES[3]);
  });
});

/**
 * `learnerFamiliarName` - the placeholder-name guard.
 *
 * chora-consumption seeds the `name` column on a pre-hatch row purely to
 * satisfy a NOT NULL constraint (growth.go: "Default the legacy name +
 * specialization columns so the row satisfies NOT NULL constraints. UI computes
 * the breed-aware nickname at display time"). The learner's own name only ever
 * arrives with the hatch POST, which is the same call that moves the Familiar
 * off Stage 0 - so while unhatched there is NO learner name, whatever the wire
 * carries.
 */
describe('learnerFamiliarName (pre-hatch placeholder guard)', () => {
  it('suppresses the server placeholder on an unhatched pod', () => {
    expect(learnerFamiliarName(0, 'Egg', null)).toBe('');
  });

  it('suppresses ANY stored name pre-hatch (structural, not a string match)', () => {
    // The guard keys on the growth stage, never on the literal "Egg": a
    // placeholder the backend changes tomorrow must not leak through.
    expect(learnerFamiliarName(0, 'Pod', null)).toBe('');
    expect(learnerFamiliarName(0, 'unnamed-familiar', null)).toBe('');
  });

  it('returns the learner name once hatched', () => {
    expect(learnerFamiliarName(1, 'Ember', '2026-07-02T00:00:00Z')).toBe('Ember');
    expect(learnerFamiliarName(4, 'Vesper', '2026-07-02T00:00:00Z')).toBe('Vesper');
  });

  it('treats a roster summary with no hatchedAt field by stage alone', () => {
    // FamiliarSummary carries no hatchedAt, so the stage is the only signal.
    expect(learnerFamiliarName(0, 'Egg')).toBe('');
    expect(learnerFamiliarName(2, 'Sage')).toBe('Sage');
  });

  it('returns "" for an absent name rather than fabricating one', () => {
    expect(learnerFamiliarName(3, undefined, '2026-07-02T00:00:00Z')).toBe('');
  });

  /**
   * The three real lifecycle rows (familiar 6a57dc45-…, plus its siblings).
   * State 2 is the one worth pinning: CHO-2229 reveals the breed AHEAD of
   * naming, so a pod can be revealed and still unnamed. The name is committed
   * by the hatch POST, which is also what sets hatched_at and moves the stage,
   * so "revealed" alone must NOT unlock the stored name.
   */
  it('walks the real lifecycle: unrevealed -> revealed-unnamed -> hatched+named', () => {
    // 1. name="Egg", species NULL, stage 0, hatched_at NULL, revealed_at NULL.
    expect(learnerFamiliarName(0, 'Egg', null)).toBe('');
    // 2. revealed_at set, still stage 0, still the placeholder name.
    expect(learnerFamiliarName(0, 'Egg', null)).toBe('');
    // 3. hatched with a learner-chosen name.
    expect(learnerFamiliarName(1, 'Pingu', '2026-08-06T10:05:00Z')).toBe('Pingu');
  });

  /**
   * The guard must fail SAFE: it suppresses only when BOTH signals agree the
   * Familiar is pre-hatch. A row whose stage lags behind its hatched_at still
   * shows its name - losing a name the learner chose is the worse failure.
   */
  it('never suppresses a name once hatched_at is set, even at a lagging stage 0', () => {
    expect(learnerFamiliarName(0, 'Pingu', '2026-08-06T10:05:00Z')).toBe('Pingu');
  });
});
