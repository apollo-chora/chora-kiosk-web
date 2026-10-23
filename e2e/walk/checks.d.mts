// Types for checks.mjs (the walk's pure ruling checks), so the TypeScript walk calls them typed.
export type Lang = 'en' | 'zh';
export type Source = 'stack' | 'fixture';
export type Pass = boolean | 'fixture';

export interface Result {
  id: string;
  rule: string;
  pass: Pass;
  expected: unknown;
  actual: unknown;
}

export interface ManifestLike {
  choices: Record<string, { prepared_at: string }>;
}

export interface GrowthRead {
  companionId: string;
  expCumulative: number;
}

export interface GrowthEventLike extends GrowthRead {
  source: string;
  expDelta: number;
  expCumulativeAfter: number;
}

export interface Classified {
  kind: 'read' | 'write' | 'model' | 'replay';
  live: 'greet' | 'sugg' | 'q' | 'words' | 'picture' | 'grade' | 'check' | null;
  rule: string;
  serveDoor: boolean;
}

export function verdict(ok: boolean, source?: Source): Pass;
export function formatStampWhen(iso: string, lang: Lang): string;
export function stampTimes(text: string, lang: Lang): string[];
export function checkStamps(args: { id: string; text: string; lang: Lang; manifest: ManifestLike; expect: string[]; extra?: string[]; source?: Source }): Result & {
  actual: { found: string[]; unknown: string[]; missing: string[] };
};
export function visitWords(values: string[]): string[];
export function floorWords(values: string[]): string[];
export function spendKeys(obj: unknown, at?: string): string[];
export function spendText(text: string): string[];
export function creditCheck(args: {
  id: string;
  companionId: string;
  before: GrowthRead;
  after: GrowthRead;
  events: Array<{ companionId: string; source: string; expDelta: number; expCumulativeAfter: number }>;
  deltas: number[];
  screen: number | null;
  source?: Source;
}): Result;
export function releasedEqualsAi(args: { aiPoints: number; released: number; possible: number; source?: Source }): Result;
export function classifyRequest(req: { method: string; url: string; body: unknown }, known: { preparedTurnIds: ReadonlySet<string> }): Classified;
export function serveDoorReady(body: unknown): boolean;
export function glowCheck(args: { glowIds: string[]; expectId: string }): Result;
export function interfaceLeaks(text: string, enTable: Readonly<Record<string, string>>, zhTable?: Readonly<Record<string, string>>): string[];
export function aiTextExact(args: { shown: string; record: string }): Result;
export function rawKeys(text: string, keySet: ReadonlySet<string>): string[];

export interface RubricCriterion {
  criterion_id: string;
  weight: number;
}
export interface CriterionScore {
  criterion_id: string;
  score: number;
  max_score: number;
}
export function roundHalfEven2(x: number): number;
export function compositePoints(args: { rubric: RubricCriterion[]; scores: CriterionScore[]; possible: number }): number;
export function releasedFollowsRubric(args: { id: string; rubric: RubricCriterion[]; scores: CriterionScore[]; possible: number; released: number; source?: Source }): Result;
export function gapErrors(errors: string[], gaps: readonly RegExp[]): { excused: string[]; rest: string[] };
export function passMark(policyText: string, name: string): number;
export function passMarkCheck(args: { text: string; lang: Lang; marks: number[] }): Result & { actual: { term: boolean; missingMarks: string[]; floor: string[] } };
export function noLiveCheck(args: { onPage: boolean; live: string[] }): Result;
export function snapshotNoteCheck(args: { text: string | null; expect: string; clock: boolean }): Result;
export function xrayPanelCheck(args: { open: boolean; title: string | null; expectTitle: string; rows: number; failed: boolean; reads: string[]; path: string; source?: Source }): Result;
export interface PinnedOptionLike {
  option_id: string;
  label?: string;
  text?: string;
  is_correct?: boolean;
}
export function pickOption(args: { id: string; options: PinnedOptionLike[]; shown: string[]; pick: number | 'key' }): { index: number; optionId: string; text: string; correct: boolean };
export interface AnswerKey {
  stem: string;
  key: string;
}
export function keysFromPayload(payloadText: string, id: string): AnswerKey[];
export function keysFromIndexed(questions: Array<{ stem: string; options: string[]; correct: number }>, id: string): AnswerKey[];
export function keyForStem(keys: AnswerKey[], stem: string, id: string): string;
export function pickText(args: { id: string; shown: string[]; want: string }): number;
export function oracleCommand(args: { container: string; conceptId: string; rung: number }): { args: string[]; sql: string };

// Section S: the reset loop for every new visitor (WALK-PLAYBOOK S; K151, K143, K149).
export interface LastReset {
  outcome?: string;
  finished_at?: string;
  took_s?: unknown;
}
export interface LoopState {
  exp: Record<string, number>;
  mana: number;
  streak: number;
  utcDay: string;
  ideas: Record<string, string>;
}
export function sinceResetCheck(args: { id: string; readiness: Record<string, unknown>; expect: boolean }): Result;
export function resetReadback(args: { id: string; readiness: Record<string, unknown>; pressedAt: number; source?: Source }): Result;
export function lastResetSame(args: { id: string; before: LastReset | null | undefined; readiness: Record<string, unknown> }): Result;
export function loopStateCheck(args: { id: string; start: LoopState; now: LoopState }): Result & { note?: string; actual: { now: LoopState; diffs: string[] } };
export function ghostCheck(args: { shownIds: string[]; expectIds: string[]; shows?: number }): Result;
export function servedOrder(args: { body: unknown; stem: string; id: string }): string[];
export function visitOrderCheck(args: { id: string; served: string[]; visits: string[][]; source?: Source }): Omit<Result, 'pass'> & { pass: Pass | 'not-judged'; note?: string };
export function censusCommand(args: { container: string; what: 'fresh sets' | 'question jobs'; since: string }): { args: string[]; sql: string };
export function censusCount(text: string, id: string): number;
export function idleSettingCheck(args: { buttons: Array<{ min: string | null; pressed: string | null }>; minutes: number }): Result;
export function creditNumbers(text: string): number[];
export function windowTimes(body: unknown): [string, string];
export function tourMarkers(t: (key: string, params?: Record<string, string | number>) => string): Array<{ id: string; exhibit: string; marker: string }>;
export function nextBoxCheck(args: { boxes: Array<{ at: string; x: number; y: number; w: number; h: number }> }): Result;
export function eachAddCheck(args: { rows: number; adds: number; ideas: number }): Result;
export function greyedCheck(args: { id: string; buttons: Record<string, boolean | null> }): Result;
export function onlyFromCheck(args: { id: string; rule: string; shown: string[]; allowed: string[] }): Result;
export function fillCheck(args: { id: string; rule: string; shown: string | null; template: string }): Result;
export interface GraphLike {
  readonly concepts: ReadonlyArray<{ conceptId: string; title: string }>;
  readonly edges: ReadonlyArray<{ sourceConceptId: string; targetConceptId: string; class: string }>;
}
export function treeCheck(args: { id: string; graph: GraphLike }): Result;
export function childrenCheck(args: { id: string; rule: string; graph: GraphLike; parent: string; children: string[] }): Result;
export function tourEndCheck(args: { shown: boolean; title: string | null; focused: string | null; expectTitle: string }): Result;
export function exactSetCheck(args: { id: string; rule: string; shown: string[]; expected: string[] }): Result;
export function retiredModelCheck(args: { id: string; rule: string; texts: Record<string, string>; current: string | null; retired: string[] }): Result;
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export function insideFrameCheck(args: { id: string; rule: string; frame: Box; nodes: Array<Box & { title: string }> }): Result;
export function linkLengthCheck(args: { id: string; rule: string; lengths: number[]; edgeCount: number; minPx: number }): Result;
export function clearOfCheck(args: { id: string; rule: string; nodes: Array<Box & { title: string }>; card: Box | null }): Result;
export function captionCheck(args: { id: string; rule: string; paint: string; active: string | null; lead: string | null; text: string | null; want: { lead: string; text: string } }): Result;
export function noLaptopCheck(args: { id: string; screen: string; lang: string; text: string }): Result;
export function linesInBoxesCheck(args: { id: string; boxes: Array<{ name: string; box: Box; lines: Array<Box & { text: string }> }> }): Result;
export function freshOnTopCheck(args: { id: string; rule: string; rows: Array<{ id: string; live: boolean }>; fresh: string[] }): Result;
export function spentCheck(args: { id: string; key: string; rowKeys: string[]; buttonKeys: string[] }): Result;
export function missedStampCheck(args: { id: string; rule: string; stamps: string[]; failed: string; lateTemplate: string; prepared: string }): Result;
export function fullListCheck(args: { id: string; rule: string; rows: Array<{ state: string | null; adds: number }>; fullText: string; dupText: string; addAll: boolean }): Result;
export interface CreditsPage {
  readonly org: string | null;
  readonly teamLabel: string | null;
  readonly names: string[];
  readonly faculty: Array<{ label: string; person: string }>;
  readonly contactLabel: string | null;
  readonly mail: string | null;
  readonly close: string | null;
}
export function creditsCheck(args: { id: string; page: CreditsPage & { text: string }; want: CreditsPage }): Result;
export function viewChangeCheck(args: { id: string; rule: string; states: Array<{ at: string; view: string }>; exempt?: string[] }): Result;
export function liveRowsInCardsCheck(args: { id: string; rule: string; rows: Array<{ key: string; state: string; row: Box; card: Box | null }> }): Result;
export function linesInOrderCheck(args: { id: string; rule: string; text: string | null; want: string[] }): Result;
export function figuresCheck(args: { id: string; rule: string; imgs: Array<{ src: string; loaded: boolean }>; files: string[] }): Result;
export function copyCheck(args: { id: string; rule: string; text: string | null; want: string[]; gone: string[] }): Result;
