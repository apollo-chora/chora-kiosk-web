/**
 * The governance board's values (K9): the production O+ dashboard's IMDA board as captured on
 * 10 Aug 2026 (mockup IMDA, line 3559; the capture
 * 2e-oplus-imda-all-four-dimensions-d4-requires-attention-four-fails.png). Static by ruling: the
 * laptop runs no telemetry engine, so GET /bff/oplus/dimensions is never called. The colours are
 * the mockup's, on the redesign palette (no violet, R11).
 */
export const IMDA_CAPTURED_ON = '2026-08-10';

export type ImdaSignal = 'green' | 'amber' | 'red';

export interface ImdaDimension {
  readonly id: 'd1' | 'd2' | 'd3' | 'd4';
  readonly color: string;
  readonly signal: ImdaSignal;
  /** Pass, partial, fail and the items counted. */
  readonly p: number;
  readonly pa: number;
  readonly f: number;
  readonly n: number;
}

export const IMDA_CAPTURE: readonly ImdaDimension[] = [
  { id: 'd1', color: '#1976d2', signal: 'amber', p: 6, pa: 1, f: 2, n: 9 },
  { id: 'd2', color: '#0891b2', signal: 'green', p: 0, pa: 2, f: 2, n: 4 },
  { id: 'd3', color: '#0f7a4d', signal: 'amber', p: 5, pa: 2, f: 3, n: 10 },
  { id: 'd4', color: '#d97706', signal: 'red', p: 4, pa: 0, f: 4, n: 8 },
];

/** The signal's words (mockup signalHTML): green baseline, red attention, amber partial. */
export const SIGNAL_KEY: Readonly<Record<ImdaSignal, string>> = { green: 'gov.baseline', red: 'gov.attention', amber: 'gov.partial' };
