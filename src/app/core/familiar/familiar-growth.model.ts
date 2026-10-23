/**
 * Familiar Growth model: front-end shapes mirror the chora-gateway BFF
 * contract per `docs/m13/HANDOFF_FE_FAMILIAR_GROWTH_2026-05-13.md` §2.
 *
 * Per ADR-149: single canonical `growth_stage` axis (0-6) replaces the
 * legacy `age_stage` from ADR-116. Per-Familiar EXP drives stage; mana
 * tier caps the LLM ceiling per Mana × Growth matrix.
 */

import type { BreedSpecies } from '../../shared/components/breed-art/breed-art.component';

export type GrowthStage = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type StageName =
  | 'egg'
  | 'baby'
  | 'fledgling'
  | 'awakened'
  | 'structural'
  | 'teen'
  | 'matured';

export type Rarity = '' | 'common' | 'uncommon' | 'rare' | 'legendary';

export type LlmTier = 'flash-lite' | 'flash' | 'flash-reasoning' | 'pro';

// R3-1 (CHO-2013 P1) RETIREMENT: the KG-neighbours geometry (KgNeighbor /
// KgNeighborRevealedVia / visibleKgNeighbors / revealedNeighbors +
// PickKgNeighbor) is superseded by the awakening resonant-concept pick +
// ring radius. The BE surface 404s (kg-neighbors) / FailedPrecondition
// (gRPC); the FE types are removed here.

export interface FamiliarGrowthState {
  readonly familiarId: string;
  /**
   * chora-consumption speaks Companion on the wire (ADR-254 D9), so the
   * growth response is keyed `companionId`. The model keeps `familiarId`,
   * and the two names meet in `FamiliarGrowthService.getGrowth`.
   */
  readonly companionId?: string;
  readonly growthStage: GrowthStage;
  readonly stageName: StageName;
  readonly species: BreedSpecies;
  readonly shinyVariant: boolean;
  readonly rarity: Rarity;
  readonly expCurrent: number;
  readonly expNextThreshold: number;
  readonly expCumulative: number;
  readonly effectiveLlmTier: LlmTier;
  readonly effectiveMaxOutputTokens: number;
  readonly unlockedTools: readonly string[];
  readonly resonantAtomId: string;
  /**
   * Awakening resonant-concept pick (R3-1, CHO-2013 P1): the ring-radius
   * centre inside the bound Goal's subgraph. Empty until the learner picks
   * one. Supersedes the retired kg-neighbours geometry.
   */
  readonly resonantConceptId?: string;
  readonly ahaMomentConsumed: boolean;
  readonly ahaMomentActiveUntil: string | null;
  /**
   * CHO-2229 (reveal precedes naming): the breed-roll moment. Set on a
   * stage-0 pod once POST /reveal persists the roll: the ceremony resumes
   * past the crack step when present. Absent/null = unrevealed mystery pod.
   */
  readonly revealedAt?: string | null;
  readonly hatchedAt: string | null;
  readonly lastStageUpAt: string | null;
  /** Display name (e.g., "Eira"); empty pre-hatch. */
  readonly displayName?: string;
  /**
   * CHO-2030 (R3-9 named-tease): the species-Path entries that unlock at
   * the NEXT stage, computed server-side from the Path bands (single
   * source of truth: never forked into FE data). Present only on the
   * direct growth read; empty at the top stage; absent for legacy rows
   * without an active species Path.
   */
  readonly nextUnlocks?: readonly NextUnlock[];
}

/** One upcoming species-Path entry (CHO-2030 next-stage preview). */
export interface NextUnlock {
  readonly skillKey: string;
  readonly skillKind: SkillKind;
  readonly unlocksAtStage: number;
  /**
   * ADR-174 release state. false ⇒ the Skill will arrive owned-but-dark:
   * render as the R3-9 named-tease ("stirring, not yet awake"): named,
   * never hidden, never fake-usable.
   */
  readonly catalogueActive: boolean;
}

export interface FamiliarSummary {
  readonly familiarId: string;
  readonly displayName: string;
  readonly species: BreedSpecies;
  readonly growthStage: GrowthStage;
  readonly shinyVariant: boolean;
  readonly expCurrent: number;
  readonly expNextThreshold: number;
  readonly isActive: boolean;
}

// ── CHO-2013 P1 (R4-1/R4-2): Loadout + Skill invoke (Grimoire st2) ────────

/** Which axis minted the grant (mirrors the BE `unlocked_via` enum). */
export type SkillUnlockedVia = 'species_path' | 'admin_grant' | 'aha_preview';

/** ADR-218 R2-5: active Skills occupy slots; craft Skills are always-on. */
export type SkillKind = 'active' | 'craft';

/**
 * CHO-2362: the closed set of per-Skill param control shapes (mirrors the BE
 * `SkillParamKind` in chora-consumption skill_params.go, the single validation
 * authority the loadout schema is rendered from).
 */
export type SkillParamType =
  | 'enum'
  | 'int'
  | 'text'
  | 'concept_ref'
  | 'growth_edge_ref';

/**
 * One bounded parameter spec on a Skill's sheet (CHO-2362). Wire values ride
 * as STRINGS (int params as numeric strings); the spec only shapes the editor
 * control. `required` is an invoke-path contract - in the Ritual editor it is
 * a nudge ("Recommended"), never a block: the server deliberately does not
 * refuse publish on a missing required param.
 */
export interface SkillParamSpec {
  readonly type: SkillParamType;
  /** enum only - closed membership. */
  readonly values?: readonly string[];
  /** int only - inclusive bounds. */
  readonly min?: number;
  readonly max?: number;
  /** text only - rune cap (the BE counts runes, not UTF-16 units). */
  readonly maxLen?: number;
  /** Wire-string default; absent = no default. */
  readonly default?: string;
  readonly required?: boolean;
}

/**
 * A Skill's param sheet as the loadout carries it (CHO-2362): BE JSON key
 * `params_schema`, camelised to `paramsSchema` by the FamiliarBridge. Inner
 * keys are camel-safe (`maxLen` etc. survive camelisation unchanged). Rows
 * without the field have no editable params.
 */
export type SkillParamsSchema = Readonly<Record<string, SkillParamSpec>>;

/** One detailed loadout grant row (BE `grants[]` on GET /skills). */
export interface LoadoutGrant {
  readonly skillKey: string;
  readonly skillKind: SkillKind;
  readonly slotCost: number;
  readonly equipped: boolean;
  readonly unlockedVia: SkillUnlockedVia;
  readonly unlockedAtStage: number;
  /**
   * ADR-174 release state (CHO-2030). false = owned-but-dark dormant:
   * the loadout renders the R3-9 named-tease chip instead of actions;
   * equip 409s (SKILL_NOT_ACTIVE) and invoke is blocked server-side.
   */
  readonly catalogueActive: boolean;
  /**
   * CHO-2362: the Skill's editable-param sheet. Absent = the Skill has no
   * editable parameters (the Grimoire editor renders that state honestly).
   */
  readonly paramsSchema?: SkillParamsSchema;
}

/**
 * The loadout view (GET/PUT/DELETE .../skills[/{key}/equip]). Unwrapped
 * snake→camel from chora-consumption (the skills family is NOT {data:T}-
 * enveloped: see gateway ListFamiliarSkills). skillGrants = owned keys;
 * equippedSkills = the slot-consuming active set.
 */
export interface LoadoutView {
  readonly familiarId: string;
  /** The wire is keyed `companionId` (ADR-254 D9); met in normalizeLoadoutView. */
  readonly companionId?: string;
  readonly skillGrants: readonly string[];
  readonly equippedSkills: readonly string[];
  readonly grants: readonly LoadoutGrant[];
  readonly skillSlotsUnlocked: number;
  readonly slotsUsed: number;
  readonly evolutionTier: string;
  readonly growthStage: number;
}

/** Closed set of param types the FE can render a control for (CHO-2362). */
const KNOWN_SKILL_PARAM_TYPES = new Set<SkillParamType>([
  'enum',
  'int',
  'text',
  'concept_ref',
  'growth_edge_ref',
]);

/**
 * Normalise one raw param spec (CHO-2362). Returns null when the entry has no
 * recognised `type` - the editor cannot render a control it does not
 * understand, so the entry is dropped and that param simply stays absent
 * (the Skill runs on its default; the server remains the validator).
 * Optional fields are kept only when well-typed - never trusted raw.
 */
function normalizeSkillParamSpec(raw: unknown): SkillParamSpec | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const type = r['type'];
  if (!KNOWN_SKILL_PARAM_TYPES.has(type as SkillParamType)) return null;
  const spec: {
    type: SkillParamType;
    values?: readonly string[];
    min?: number;
    max?: number;
    maxLen?: number;
    default?: string;
    required?: boolean;
  } = { type: type as SkillParamType };
  if (Array.isArray(r['values'])) {
    spec.values = (r['values'] as unknown[]).filter(
      (v): v is string => typeof v === 'string',
    );
  }
  if (typeof r['min'] === 'number') spec.min = r['min'] as number;
  if (typeof r['max'] === 'number') spec.max = r['max'] as number;
  if (typeof r['maxLen'] === 'number') spec.maxLen = r['maxLen'] as number;
  if (typeof r['default'] === 'string') spec.default = r['default'] as string;
  if (r['required'] === true) spec.required = true;
  return spec;
}

/**
 * Normalise a raw `paramsSchema` value (CHO-2362). Undefined for anything
 * that is not a non-empty object of renderable specs - a malformed or empty
 * schema reads as "no editable parameters", never a fabricated editor.
 */
export function normalizeSkillParamsSchema(
  raw: unknown,
): SkillParamsSchema | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const out: Record<string, SkillParamSpec> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    const spec = normalizeSkillParamSpec(value);
    if (spec) out[name] = spec;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Reconcile one loadout grant row (CHO-2362): coalesce the camel
 * `paramsSchema` (FamiliarBridge hop) with the snake `params_schema` (a
 * non-camelising hop) per the model's standing dual-spelling defence, strip
 * the snake duplicate, and drop a malformed schema entirely. Every other
 * grant field passes through untouched.
 */
function normalizeLoadoutGrant(grant: LoadoutGrant): LoadoutGrant {
  const r = grant as unknown as Record<string, unknown>;
  const schema = normalizeSkillParamsSchema(
    r['paramsSchema'] ?? r['params_schema'],
  );
  if (r['paramsSchema'] === undefined && r['params_schema'] === undefined) {
    return grant;
  }
  const copy: Record<string, unknown> = { ...r };
  delete copy['params_schema'];
  if (schema) {
    copy['paramsSchema'] = schema;
  } else {
    delete copy['paramsSchema'];
  }
  return copy as unknown as LoadoutGrant;
}

/**
 * Reconcile a raw loadout view (CHO-2362): normalise each grant row's
 * paramsSchema spelling. Deliberately pass-through for everything else - the
 * skills family arrives unwrapped and already camel via the FamiliarBridge.
 */
export function normalizeLoadoutView(view: LoadoutView): LoadoutView {
  return {
    ...view,
    familiarId: view.familiarId || view.companionId || '',
    grants: (view.grants ?? []).map(normalizeLoadoutGrant),
  };
}

/**
 * Result-kind discriminator for the R4-4 invoke runner (CHO-2016). Every
 * pre-existing Skill (progress_mirror / recap_scribe / explain_anew / the
 * sight family) is "chat": the reply is narration only. quiz_me and
 * socratic_drill are "answerable": the narration FRAMES an items[] channel
 * of atom references the learner answers through the EXISTING atom-play
 * flow, not in the reply panel itself.
 */
export type SkillResultKind = 'chat' | 'answerable';

/**
 * Machine-readable provenance for why an answerable item was picked
 * (mirrors the BE's closed `answerableReason*` consts:
 * familiar_skill_invoke_answerable.go). An unrecognised value never reaches
 * the FE model (normalizeAnswerableItem falls it back to 'fresh_pick').
 */
export type AnswerableItemReason =
  | 'weak_spot'
  | 'concept_ref'
  | 'due_for_review'
  | 'fresh_pick';

/**
 * One atom REFERENCE in an answerable Skill reply's items[] channel
 * (CHO-2016). Carries learner-safe metadata ONLY: never a rendered
 * question/stem/options/answer-key (chora-consumption holds none of that;
 * see familiar_skill_invoke_answerable.go). The learner answers the
 * referenced atom for real credit through the EXISTING atom-play flow
 * (`/a/atoms/{atomId}/play`): this channel adds ZERO new submit path.
 */
export interface AnswerableItem {
  readonly atomId: string;
  readonly title: string;
  readonly topic: string;
  readonly difficulty: number;
  readonly reason: AnswerableItemReason;
}

/**
 * Result of the R4-4 single-step Skill invoke runner
 * (POST .../skills/{key}/invoke). `recorded` is true only when a
 * memory_note-sink Skill (recap_scribe) persisted its note this turn.
 *
 * CHO-2016: `resultKind` + `items` are ADDITIVE. Every pre-existing chat
 * Skill normalises to `resultKind: 'chat'`, `items: []` (the BE omits the
 * `items` key entirely for those; the FE never needs an extra null-check).
 */
/**
 * One grounded web SOURCE in a Seeker (fact_check / web_research) result's
 * citations channel (P5 Far Sight, CHO-2017; IMDA D2 mandate: the learner
 * always sees the sources a verdict/note rests on). `domain` is the DURABLE
 * citation surface (ADR-231 D4): the `url` is a Google grounding-api-redirect
 * that EXPIRES (~30d), so the FE renders "domain: title" and links the url.
 */
export interface SeekerCitation {
  readonly url: string;
  readonly title: string;
  readonly snippet: string;
  readonly domain: string;
}

export interface SkillInvokeResult {
  readonly skillKey: string;
  readonly reply: string;
  readonly recorded: boolean;
  readonly manaCharged: number;
  readonly turnId: string;
  readonly resultKind: SkillResultKind;
  readonly items: readonly AnswerableItem[];
  /**
   * Seeker family (P5 Far Sight): the grounded web sources the verdict/note
   * rests on (IMDA D2). Empty for every non-Seeker skill AND for a Seeker's
   * no-citation hedge (nothing grounded to cite).
   */
  readonly citations: readonly SeekerCitation[];
  /**
   * Seeker family: the Google Search-Suggestions chip HTML
   * (searchEntryPoint.renderedContent). The Far Sight surface MUST render it
   * verbatim (as trusted HTML) whenever non-empty: the Google ToS display
   * obligation (ADR-231 D5). Empty ⇒ no chip.
   */
  readonly searchEntryPointHtml: string;
  /**
   * Seeker family: the web-search queries the model actually ISSUED (CHO-2179).
   *
   * The chip above already shows these as clickable pills: but the chip's links
   * ride the grounding-redirect infrastructure that EXPIRES (~30 days, ADR-231
   * D4). These are plain strings: they never expire, so they are the durable
   * "what I searched", and they are what a persisted research note carries to
   * explain itself once the chip is dead.
   *
   * ⚠ TRANSPARENCY METADATA, NEVER KNOWLEDGE. Render them as *what was
   * searched*, visually distinct from the answer: never as content or fact.
   *
   * Non-empty even for a no-citation HEDGE (the familiar did search, and the
   * hedge asks the learner to rephrase: which is useless if it hides what it
   * tried). Empty ⇒ the vendor issued none; never fabricate one.
   */
  readonly webSearchQueries: readonly string[];
}

/** Closed set of item reasons the FE recognises (mirrors the BE consts). */
const KNOWN_ANSWERABLE_REASONS = new Set<AnswerableItemReason>([
  'weak_spot',
  'concept_ref',
  'due_for_review',
  'fresh_pick',
]);

/**
 * Normalise one raw answerable item, coalescing camelCase/snake_case
 * (`atomId`/`atom_id`) per the same dual-spelling defensive idiom as
 * {@link normalizeSkillInvokeResult}. Returns null for a malformed item
 * (no atomId in either casing) so the caller can drop it: never render a
 * card with nothing to link to.
 */
function normalizeAnswerableItem(raw: unknown): AnswerableItem | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const atomId = r['atomId'] ?? r['atom_id'];
  if (typeof atomId !== 'string' || atomId === '') return null;
  const reason = r['reason'];
  return {
    atomId,
    title: typeof r['title'] === 'string' ? (r['title'] as string) : '',
    topic: typeof r['topic'] === 'string' ? (r['topic'] as string) : '',
    difficulty:
      typeof r['difficulty'] === 'number' ? (r['difficulty'] as number) : 0,
    reason: KNOWN_ANSWERABLE_REASONS.has(reason as AnswerableItemReason)
      ? (reason as AnswerableItemReason)
      : 'fresh_pick',
  };
}

/**
 * Normalise a raw invoke-wire response into the canonical camelCase
 * {@link SkillInvokeResult}. CHO-2040 tail: the gateway FamiliarBridge
 * camelises the whole consumption body over the BFF (so the FE receives
 * `manaCharged` / `turnId` / `skillKey`), but a hop that does NOT camelise
 * (a direct consumption call, or a route not registered on FamiliarBridge)
 * delivers `mana_charged` / `turn_id` / `skill_key`. A naive direct cast then
 * left `manaCharged` undefined and the loadout mana chip hid its number.
 * Coalesce BOTH spellings for every dual-word field; single-word keys
 * (`reply` / `recorded`) are spelling-invariant. Fails soft to sane defaults
 * (never fabricates a reply).
 *
 * CHO-2016: `resultKind`/`result_kind` coalesce the same way, defaulting to
 * `'chat'` for every pre-existing Skill. `items` normalises to `[]` when
 * absent/non-array (chat Skills, or a non-camelising hop's omitted key) so
 * templates can iterate it unconditionally.
 */
/**
 * Normalise one raw Seeker citation, coalescing nothing (the fields are
 * single-word + spelling-invariant). Returns null when the source is not a
 * renderable citation: it MUST carry both a `url` and a `title` (you cannot
 * render a source you can neither name nor link), mirroring the BE citation
 * mandate (grounded.Hit.IsCitation).
 */
function normalizeSeekerCitation(raw: unknown): SeekerCitation | null {
  const c = (raw ?? {}) as Record<string, unknown>;
  const url = typeof c['url'] === 'string' ? (c['url'] as string) : '';
  const title = typeof c['title'] === 'string' ? (c['title'] as string) : '';
  if (url === '' || title === '') return null;
  return {
    url,
    title,
    snippet: typeof c['snippet'] === 'string' ? (c['snippet'] as string) : '',
    domain: typeof c['domain'] === 'string' ? (c['domain'] as string) : '',
  };
}

export function normalizeSkillInvokeResult(raw: unknown): SkillInvokeResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const mana = r['manaCharged'] ?? r['mana_charged'];
  const turn = r['turnId'] ?? r['turn_id'];
  const skill = r['skillKey'] ?? r['skill_key'];
  const resultKind = r['resultKind'] ?? r['result_kind'];
  const rawItems = r['items'];
  const rawCitations = r['citations'];
  // Seeker family (P5 Far Sight): the chip HTML rides camelCase (FamiliarBridge
  // hop) or snake_case (a non-camelising hop): coalesce both, same as mana/turn.
  const chip = r['searchEntryPointHtml'] ?? r['search_entry_point_html'];
  // CHO-2179: the issued web-search queries ride the same two hops. Vendor text:
  // keep only non-blank strings, and never invent one (an absent or malformed key
  // yields [], the honest "the vendor issued none" state).
  const rawQueries = r['webSearchQueries'] ?? r['web_search_queries'];
  return {
    skillKey: typeof skill === 'string' ? skill : '',
    reply: typeof r['reply'] === 'string' ? (r['reply'] as string) : '',
    recorded: r['recorded'] === true,
    manaCharged: typeof mana === 'number' ? mana : 0,
    turnId: typeof turn === 'string' ? turn : '',
    resultKind: resultKind === 'answerable' ? 'answerable' : 'chat',
    items: Array.isArray(rawItems)
      ? rawItems
          .map(normalizeAnswerableItem)
          .filter((x): x is AnswerableItem => x !== null)
      : [],
    citations: Array.isArray(rawCitations)
      ? rawCitations
          .map(normalizeSeekerCitation)
          .filter((x): x is SeekerCitation => x !== null)
      : [],
    searchEntryPointHtml: typeof chip === 'string' ? (chip as string) : '',
    webSearchQueries: Array.isArray(rawQueries)
      ? rawQueries
          .filter((q): q is string => typeof q === 'string')
          .map((q) => q.trim())
          .filter((q) => q !== '')
      : [],
  };
}

export interface HatchEggResponse {
  readonly state: FamiliarGrowthState;
  readonly species: BreedSpecies;
  readonly shinyVariant: boolean;
  readonly rarity: Exclude<Rarity, ''>;
  readonly rolledProbability: number;
}

/**
 * CHO-2235: the awakening reveal metaphor for a species (companion art
 * brief §2): avian/mythic/reptile HATCH, mammal WAKE, machine POWER-ON.
 * The BACKEND owns the species→class taxonomy (growth domain,
 * awakening.go) and the reveal response carries it: the FE never maps
 * species to classes itself.
 */
export type AwakeningClass = 'hatch' | 'wake' | 'power_on';

const AWAKENING_CLASSES: readonly AwakeningClass[] = [
  'hatch',
  'wake',
  'power_on',
];

/**
 * Normalise a wire value to a renderable awakening class. Mirrors the
 * backend's documented default: anything unrecognised reads as the
 * universal HATCH metaphor (a presentation fallback only: the BE's
 * totality test guarantees every storable species resolves explicitly).
 */
export function normalizeAwakeningClass(value: string | undefined): AwakeningClass {
  return (AWAKENING_CLASSES as readonly string[]).includes(value ?? '')
    ? (value as AwakeningClass)
    : 'hatch';
}

/**
 * CHO-2229: POST /reveal response: the persisted breed roll, rolled at the
 * reveal step so the learner names a companion they can see. Idempotent:
 * a re-POST returns the same roll with `alreadyRevealed` set.
 */
export interface RevealBreedResponse {
  readonly state: FamiliarGrowthState;
  readonly species: BreedSpecies;
  readonly shinyVariant: boolean;
  readonly rarity: Exclude<Rarity, ''>;
  readonly rolledProbability: number;
  readonly revealedAt: string;
  readonly alreadyRevealed: boolean;
  /** CHO-2235: hatch | wake | power_on for the rolled species. */
  readonly awakeningClass: AwakeningClass;
}

export interface BreedOdds {
  readonly species: Exclude<BreedSpecies, ''>;
  readonly probability: number;
  readonly rarity: Exclude<Rarity, ''>;
}

export interface PreviewEggOddsResponse {
  readonly eggSku: string;
  readonly odds: readonly BreedOdds[];
  readonly totalWeight: number;
  readonly distributionUpdatedAt: string;
}

/**
 * The FULL egg-SKU catalogue row, as chora-tenancy's admin read returns it
 * (D6). Distinct from PreviewEggOddsResponse, which is the learner-facing
 * disclosure and carries only the odds.
 *
 * The H+ editor round-trips this WHOLE object back through the admin upsert,
 * which replaces the row rather than patching it. Every field the upsert
 * consumes therefore has to survive the trip, or saving a breed distribution
 * silently wipes the price, the expiry windows or the purchasable flag off a
 * live SKU. The read-only extras below (odds, totals, the stamp) are ignored by
 * the write and exist for display.
 */
export interface AdminEggCatalogEntry {
  readonly sku: string;
  readonly tenantId?: string;
  readonly displayName: string;
  readonly description: string;
  readonly priceCents: number;
  readonly currency: string;
  readonly suggestedFocalAtomId: string;
  readonly breedDistribution: Readonly<Record<string, number>>;
  readonly purchasable: boolean;
  readonly isTrial: boolean;
  readonly softExpiryDays: number;
  readonly hardExpiryDays: number;
  readonly availableFrom?: string;
  readonly availableUntil?: string;
  /** Read-only projections; the upsert ignores them. */
  readonly odds?: readonly BreedOdds[];
  readonly distributionTotalWeight?: number;
  readonly distributionUpdatedAt?: string;
}

export interface EggSku {
  readonly sku: string;
  readonly displayName: string;
  readonly description: string;
  readonly priceMicros: number;
  readonly currency: string;
  readonly brandedTenantName?: string;
  readonly defaultFocalAtomSuggestions?: readonly string[];
  readonly includedInManaTier?: 'basic' | 'standard' | 'premium';
}

export interface EggCatalogResponse {
  readonly skus: readonly EggSku[];
}

export interface GrowthEventRecord {
  readonly eventId: string;
  readonly familiarId: string;
  readonly source: string;
  readonly sourceEventId: string;
  readonly expDelta: number;
  readonly expCumulativeAfter: number;
  readonly stageBefore: GrowthStage;
  readonly stageAfter: GrowthStage;
  readonly dailyCapHit: boolean;
  readonly occurredAt: string;
}

export interface GrowthEventsPage {
  readonly events: readonly GrowthEventRecord[];
  readonly nextPageToken: string;
}

/**
 * Reconcile ONE raw growth-event wire row into the canonical camelCase
 * {@link GrowthEventRecord} (CHO-2144). The chora-consumption HTTP handler
 * serves `exp_total_after` / `growth_event_id` / `awarded_at`
 * (familiar_growth_handlers.go::eventRecordResp) and the gateway FamiliarBridge
 * only camelises the body (classifyWithEnvelope: NO semantic rename), so the
 * FE actually receives `expTotalAfter` / `growthEventId` / `awardedAt`. A naive
 * cast then left `expCumulativeAfter` (the "Cumulative:" number), `eventId`
 * (the `@for` track key) and `occurredAt` (the timestamp) undefined. Coalesce
 * the wire spelling AND the OpenAPI/model spelling for every renamed field:
 * the same dual-spelling defence as {@link normalizeSkillInvokeResult}: so a
 * later BE alignment is a no-op here.
 *
 * NB: the wire carries only a `triggeredStageUp` boolean, NOT the
 * `stage_before`/`stage_after` numbers the OpenAPI contract declares, so the
 * numeric stage-up pill cannot render from this endpoint (a BE gap flagged on
 * CHO-2144). stageBefore/stageAfter therefore default to 0 (pill stays hidden)
 * until the handler emits the numbers; they still coalesce if a hop provides
 * them.
 */
export function normalizeGrowthEvent(raw: unknown): GrowthEventRecord {
  const r = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
  const clampStage = (v: unknown): GrowthStage => {
    const n = num(v);
    return n >= 0 && n <= 6 ? (n as GrowthStage) : 0;
  };
  return {
    eventId: str(
      r['eventId'] ?? r['growthEventId'] ?? r['event_id'] ?? r['growth_event_id'],
    ),
    familiarId: str(
      r['familiarId'] ??
        r['companionId'] ??
        r['familiar_id'] ??
        r['companion_id'],
    ),
    source: str(r['source']),
    sourceEventId: str(r['sourceEventId'] ?? r['source_event_id']),
    expDelta: num(r['expDelta'] ?? r['exp_delta']),
    expCumulativeAfter: num(
      r['expCumulativeAfter'] ??
        r['expTotalAfter'] ??
        r['exp_cumulative_after'] ??
        r['exp_total_after'],
    ),
    stageBefore: clampStage(r['stageBefore'] ?? r['stage_before']),
    stageAfter: clampStage(r['stageAfter'] ?? r['stage_after']),
    dailyCapHit: (r['dailyCapHit'] ?? r['daily_cap_hit']) === true,
    occurredAt: str(
      r['occurredAt'] ?? r['awardedAt'] ?? r['occurred_at'] ?? r['awarded_at'],
    ),
  };
}

/**
 * Reconcile a raw growth-events page (CHO-2144): map each row via
 * {@link normalizeGrowthEvent} and coalesce the page-token spelling.
 */
export function normalizeGrowthEventsPage(raw: unknown): GrowthEventsPage {
  const r = (raw ?? {}) as Record<string, unknown>;
  const events = Array.isArray(r['events'])
    ? (r['events'] as unknown[]).map(normalizeGrowthEvent)
    : [];
  const token = r['nextPageToken'] ?? r['next_page_token'];
  return { events, nextPageToken: typeof token === 'string' ? token : '' };
}

export interface FamiliarsRosterResponse {
  readonly familiars: readonly FamiliarSummary[];
}

/** Realtime push envelopes (SSE via chora-realtime: EventSource, NOT WebSocket; see architecture.md §6.11). */
export interface FamiliarStageUpEvent {
  readonly type: 'stage_up';
  readonly familiarId: string;
  readonly stageFrom: GrowthStage;
  readonly stageTo: GrowthStage;
  readonly stageName: StageName;
  readonly unlockedTools: readonly string[];
  readonly llmTierNew: LlmTier;
  readonly occurredAt: string;
}

export interface FamiliarExpAwardedEvent {
  readonly type: 'exp_awarded';
  readonly familiarId: string;
  readonly expDelta: number;
  readonly expCumulativeAfter: number;
  readonly source: string;
  readonly occurredAt: string;
}

export interface FamiliarBreedRevealedEvent {
  readonly type: 'breed_revealed';
  readonly familiarId: string;
  readonly species: BreedSpecies;
  readonly shinyVariant: boolean;
  readonly rarity: Exclude<Rarity, ''>;
  readonly rolledProbability: number;
  readonly occurredAt: string;
}

export interface FamiliarSourceRevelationEvent {
  readonly type: 'source_revelation';
  readonly familiarId: string;
  readonly windowExpiresAt: string;
  readonly previewLlmTier: LlmTier;
  readonly occurredAt: string;
}

export type FamiliarRealtimeEvent =
  | FamiliarStageUpEvent
  | FamiliarExpAwardedEvent
  | FamiliarBreedRevealedEvent
  | FamiliarSourceRevelationEvent;

/**
 * Stage threshold table (matches ADR-149 §"The 7 stages").
 *
 * These are i18n KEY SEGMENTS, not display copy: they compose
 * `familiar_grimoire.stage.{name}` (GrimoireDesignComponent.unlockStageNameKey).
 * Stage 0 therefore stays spelled `egg` per the owner's standing rule (i18n
 * VALUES only, code stays familiar/egg) - the learner reads the translated
 * value ("Dormant"), never this string. Anything that reaches the learner
 * directly goes through {@link breedStageLabel} instead, which says Pod at
 * stage 0.
 */
export const STAGE_NAMES: Readonly<Record<GrowthStage, StageName>> = {
  0: 'egg',
  1: 'baby',
  2: 'fledgling',
  3: 'awakened',
  4: 'structural',
  5: 'teen',
  6: 'matured',
};

export const STAGE_EXP_THRESHOLDS: Readonly<Record<GrowthStage, number>> = {
  0: 0,
  1: 0,
  2: 50,
  3: 200,
  4: 500,
  5: 1200,
  6: 3000,
};

/**
 * The learner-facing name for a Stage-0 Familiar.
 *
 * The Stage-0 artwork IS a pod (`/assets/familiars/pods/pod-standard.png`) and
 * every Stage-0 i18n value says Pod ("Your Pod", "An iridescent Pod", "A
 * mysterious Pod"). Only the code-side spellings stay `egg` (i18n keys, field
 * names, routes) - nothing a learner reads may say "Egg".
 *
 * A hard-coded English literal, like every other entry in
 * {@link BREED_ADJECTIVE}: these labels are composed from the breed table
 * rather than translated. Guarded by pod-vocabulary.i18n.spec.ts.
 */
export const POD_STAGE_LABEL = 'Pod';

/** Per-breed adjective for display composition ("Teen Dragon", "Teen Owl"). */
export const BREED_ADJECTIVE: Readonly<
  Record<Exclude<BreedSpecies, ''>, Readonly<Record<GrowthStage, string>>>
> = {
  dragon: {
    0: POD_STAGE_LABEL,
    1: 'Hatchling',
    2: 'Drakeling',
    3: 'Awakened Dragon',
    4: 'Growing Dragon',
    5: 'Teen Dragon',
    6: 'Angelic Dragon',
  },
  owl: {
    0: POD_STAGE_LABEL,
    1: 'Owlet',
    2: 'Fledgling Owl',
    3: 'Awakened Owl',
    4: 'Growing Owl',
    5: 'Teen Owl',
    6: 'Wise Owl',
  },
  fox: {
    0: POD_STAGE_LABEL,
    1: 'Kit',
    2: 'Young Fox',
    3: 'Awakened Fox',
    4: 'Growing Fox',
    5: 'Teen Fox',
    6: 'Vulpine',
  },
  cat: {
    0: POD_STAGE_LABEL,
    1: 'Kitten',
    2: 'Tabby',
    3: 'Awakened Cat',
    4: 'Growing Cat',
    5: 'Teen Cat',
    6: 'Matured Cat',
  },
  phoenix: {
    0: POD_STAGE_LABEL,
    1: 'Ember',
    2: 'Smoulder',
    3: 'Awakened Phoenix',
    4: 'Growing Phoenix',
    5: 'Teen Phoenix',
    6: 'Phoenix',
  },
  turtle: {
    0: POD_STAGE_LABEL,
    1: 'Shelling',
    2: 'Glider',
    3: 'Awakened Turtle',
    4: 'Growing Turtle',
    5: 'Teen Turtle',
    6: 'Sage Turtle',
  },
  wolf: {
    0: POD_STAGE_LABEL,
    1: 'Pup',
    2: 'Yearling',
    3: 'Awakened Wolf',
    4: 'Growing Wolf',
    5: 'Teen Wolf',
    6: 'Pack-Wolf',
  },
  raven: {
    0: POD_STAGE_LABEL,
    1: 'Chick',
    2: 'Corvid',
    3: 'Awakened Raven',
    4: 'Growing Raven',
    5: 'Teen Raven',
    6: 'Trickster Raven',
  },
  penguin: {
    0: POD_STAGE_LABEL,
    1: 'Chick',
    2: 'Fledgling Penguin',
    3: 'Awakened Penguin',
    4: 'Growing Penguin',
    5: 'Teen Penguin',
    6: 'Emperor Penguin',
  },
};

export function breedStageLabel(
  species: BreedSpecies,
  stage: GrowthStage,
): string {
  // Stage 0 is the breed-neutral Pod. The species is DELIBERATELY hidden until
  // the awakening ceremony, so a pre-hatch read carries an empty `species` and
  // the species-less branch below would print the raw key segment 'egg' at the
  // learner (live on the A+ dashboard cast strip until 2026-08-07). One rule
  // covers both the revealed and unrevealed pod.
  if (stage === 0) return POD_STAGE_LABEL;
  if (!species) return STAGE_NAMES[stage];
  return BREED_ADJECTIVE[species]?.[stage] ?? STAGE_NAMES[stage];
}

/**
 * The learner's own name for a Familiar, or `''` while it is still a Pod.
 *
 * chora-consumption seeds the `name` column on a pre-hatch row purely to
 * satisfy a NOT NULL constraint, and says so at the call site: "Default the
 * legacy name + specialization columns so the row satisfies NOT NULL
 * constraints. UI computes the breed-aware nickname at display time." The
 * learner's own name only ever arrives with the hatch POST
 * (`FamiliarGrowthService.hatch(id, { displayName })`) - there is no pre-hatch
 * rename route - and that same call moves the Familiar off Stage 0. So while
 * unhatched there is NO learner name, whatever the wire carries.
 *
 * The signal is STRUCTURAL (growth stage + hatchedAt), never a comparison
 * against the current placeholder text: a backend that changes "Egg" to
 * something else tomorrow must not leak the new one. Callers substitute their
 * own untitled-Pod copy for the empty string.
 *
 * `hatchedAt` is optional because `FamiliarSummary` (the roster shape) does not
 * carry it; there the stage alone decides.
 */
export function learnerFamiliarName(
  growthStage: number,
  displayName?: string,
  hatchedAt?: string | null,
): string {
  const preHatch = growthStage <= 0 && !hatchedAt;
  return preHatch ? '' : (displayName ?? '');
}
