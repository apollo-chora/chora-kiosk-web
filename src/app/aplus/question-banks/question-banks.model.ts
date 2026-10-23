// TODO(dedup): promote question-banks.{model,service}.ts to shared/ and have R+ + A+
// both import it (Phase-A.2 follow-up). This file is a deliberate surface-isolated
// copy of features/surfaces/rplus/question-banks/question-banks.model.ts so Wave 1
// can ship the A+ workbench without import churn on the live R+ feature.
/**
 * QuestionBank model: A+ (Creator) workbench: reusable question pools.
 *
 * A `QuestionBank` is an author-owned, reusable pool of question references
 * (each question IS an atom intra-domain). A+ is the authoring/curation
 * workbench: it creates banks and curates their membership; assembling a
 * TestSet for delivery is R+'s job, so the assemble shapes/mapper present in
 * the R+ copy are intentionally ABSENT here.
 *
 * Wire types are snake_case (`BackendQuestionBank*`); the FE model is camelCase
 * (`QuestionBank`). Mapping happens at the service boundary
 * (`question-banks.service.ts`): the SAME idiom as `offerings.model.ts`. The
 * aggregate key on the wire is `question_bank_id` (NOT `id`), mapped → `id`
 * here (mirrors the offerings `assessment_id` → `id` lesson). Fail-loud: no
 * fixture fallback; the model mirrors the wire honestly (no invented fields).
 */

/** Bank visibility. BE contract: PRIVATE (owner-only) | TENANT_INTERNAL (tenant). */
export type QuestionBankVisibility = 'PRIVATE' | 'TENANT_INTERNAL';

/** FE (camelCase) membership row: one question's place in the bank. */
export interface QuestionBankItem {
  readonly questionId: string;
  /**
   * Host LearningAtom id of this question, resolved server-side (GET
   * /questions enriches each row via QuestionLookup). The bank keys on
   * `questionId`, but the workbench row conveniences (preview/edit/tags/clone)
   * address /api/atoms/{atomId}: so this is the id those actions MUST use
   * (`questionId` is the questions-table PK, NOT an atom id). Empty only on a
   * legacy/un-enriched response.
   */
  readonly atomId: string;
  /** Question stem/prompt: the human-readable row label (vs the opaque id). */
  readonly prompt: string;
  /** Canonical question type (mcq | oe): drives the row's type badge. */
  readonly questionType: string;
  readonly position: number;
  readonly addedAt: string;
}

/** FE (camelCase) question bank. */
export interface QuestionBank {
  readonly id: string;
  readonly tenantId: string;
  readonly ownerGcid: string;
  readonly name: string;
  readonly description: string;
  readonly visibility: QuestionBankVisibility;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Membership rows; populated by the detail GET (may be omitted on lists). */
  readonly items: readonly QuestionBankItem[];
}

/** FE (camelCase) "my banks" page. */
export interface QuestionBankPage {
  readonly items: readonly QuestionBank[];
  readonly total: number;
}

// ── Wire (snake_case) shapes ────────────────────────────────────────────────

/** Wire membership row. */
export interface BackendQuestionBankItem {
  readonly question_id: string;
  /** Host atom id (creation-question-banks v1.3.0: GET /questions enrichment). */
  readonly atom_id?: string;
  readonly question_type?: string;
  /** Question prompt (creation-question-banks v1.4.0: row-label enrichment). */
  readonly prompt?: string;
  readonly position?: number;
  readonly added_at?: string;
}

/** Wire question bank. */
export interface BackendQuestionBank {
  readonly question_bank_id: string;
  readonly tenant_id: string;
  readonly owner_gcid: string;
  readonly name: string;
  readonly description?: string;
  readonly visibility: string;
  readonly tags?: readonly string[];
  readonly created_at: string;
  readonly updated_at: string;
  readonly items?: readonly BackendQuestionBankItem[];
}

/** Wire "my banks" list response. */
export interface BackendQuestionBankPage {
  readonly items?: readonly BackendQuestionBank[];
  readonly total?: number;
}

/** Wire bank-questions list response (creation-question-banks v1.5.0 paged). */
export interface BackendQuestionBankItemsPage {
  readonly items?: readonly BackendQuestionBankItem[];
  readonly total?: number;
  readonly page?: number;
  readonly page_size?: number;
}

/** FE (camelCase) one page of a bank's questions + the total match count. */
export interface QuestionBankItemPage {
  readonly items: readonly QuestionBankItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/** Server-side filter/sort/paginate params for the bank's question list. */
export interface ListQuestionsParams {
  readonly q?: string;
  readonly types?: readonly string[]; // question_type filter (mcq/oe)
  readonly sort?: string; // "field:dir" over position | added_at | prompt
  readonly page?: number;
  readonly pageSize?: number;
}

/** Map the wire bank-questions page to the FE page (defensive defaults). */
export function mapBackendQuestionBankItemPage(
  resp: BackendQuestionBankItemsPage,
): QuestionBankItemPage {
  return {
    items: (resp.items ?? []).map(mapBackendQuestionBankItem),
    total: resp.total ?? 0,
    page: resp.page ?? 1,
    pageSize: resp.page_size ?? 20,
  };
}

// ── i18n key builders (single source of truth for badge cells) ──────────────

/** i18n key for a visibility value (badge cell + create-form option share this). */
export function visibilityLabelKey(value: string): string {
  return `aplus.question_banks.visibility_value.${value}`;
}

// ── Mappers (wire → FE) ─────────────────────────────────────────────────────

/** Map one wire membership row to the FE model (defensive defaults). */
export function mapBackendQuestionBankItem(i: BackendQuestionBankItem): QuestionBankItem {
  return {
    questionId: i.question_id,
    atomId: i.atom_id ?? '',
    prompt: i.prompt ?? '',
    questionType: i.question_type ?? '',
    position: i.position ?? 0,
    addedAt: i.added_at ?? '',
  };
}

/**
 * Map one wire bank to the FE model. `visibility` is cast to its union: an
 * unexpected token still renders (its badge i18n key resolves to the raw token)
 * rather than throwing and blanking the page on a single odd row.
 */
export function mapBackendQuestionBank(b: BackendQuestionBank): QuestionBank {
  return {
    id: b.question_bank_id,
    tenantId: b.tenant_id,
    ownerGcid: b.owner_gcid,
    name: b.name,
    description: b.description ?? '',
    visibility: b.visibility as QuestionBankVisibility,
    tags: b.tags ?? [],
    createdAt: b.created_at,
    updatedAt: b.updated_at,
    items: (b.items ?? []).map(mapBackendQuestionBankItem),
  };
}

/** Map the wire "my banks" page to the FE page (defensive defaults). */
export function mapBackendQuestionBankPage(resp: BackendQuestionBankPage): QuestionBankPage {
  return {
    items: (resp.items ?? []).map(mapBackendQuestionBank),
    total: resp.total ?? 0,
  };
}
