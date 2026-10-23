/**
 * The seven LIVE kinds (API-CONTRACT.md section 3, ADR-259 D11; `weak` since K158): every
 * model call the kiosk makes is one of these, pressed by the visitor on a button labelled LIVE.
 *
 * Budgets (K48): 20 s for one model, 45 s for a crew or a picture. A press past its budget
 * falls back to the prepared result, labelled (K45). `providers` is what the opening check
 * must have found working for the kind to be pressable (K65, K106). `stages` are the
 * workers the screen ticks off as the executor reports them, in order (string keys
 * `live.st.<stage>`).
 */
export type LiveKind = 'q' | 'sugg' | 'words' | 'picture' | 'greet' | 'grade' | 'weak';
export type LiveProvider = 'text' | 'picture' | 'reader';
export type LiveStageId = 'writer' | 'critic' | 'explorer' | 'image' | 'companion' | 'evaluator' | 'moderator';

export interface LiveKindSpec {
  readonly budget: 'single' | 'crew' | 'image';
  readonly limitMs: number;
  readonly providers: readonly LiveProvider[];
  readonly stages: readonly LiveStageId[];
}

const SINGLE_MS = 20_000;
const CREW_MS = 45_000;

export const LIVE_KINDS: Readonly<Record<LiveKind, LiveKindSpec>> = {
  q: { budget: 'crew', limitMs: CREW_MS, providers: ['text'], stages: ['writer', 'critic'] },
  sugg: { budget: 'single', limitMs: SINGLE_MS, providers: ['text'], stages: ['explorer'] },
  words: { budget: 'crew', limitMs: CREW_MS, providers: ['text'], stages: ['writer', 'critic'] },
  // A picture's spec is written by a text model, then rendered by the image model.
  picture: { budget: 'image', limitMs: CREW_MS, providers: ['text', 'picture'], stages: ['writer', 'image'] },
  greet: { budget: 'single', limitMs: SINGLE_MS, providers: ['text'], stages: ['companion'] },
  grade: { budget: 'crew', limitMs: CREW_MS, providers: ['text'], stages: ['evaluator', 'moderator'] },
  // K158: the weakness analyser's extractor and diagnoser, both on the reader tier (D8). One stage:
  // nothing writes the job's ANALYZING (F45), so the two agents cannot be ticked off apart.
  weak: { budget: 'crew', limitMs: CREW_MS, providers: ['reader'], stages: ['companion'] },
};

/** How often an executor re-reads a running job. */
export const LIVE_POLL_MS = 1000;
