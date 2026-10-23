import { KIOSK_TIMING } from './kiosk-timing';

/** K143: the idle waits the presenter can pick, in minutes. */
export type IdleMinutes = (typeof KIOSK_TIMING.idleWait.choices)[number];

/** Where this laptop's browser keeps the presenter's idle wait: a per-viewer convenience, never shared state. */
export const IDLE_WAIT_KEY = 'chora-kiosk.idle-minutes';

export function isIdleMinutes(n: number): n is IdleMinutes {
  return (KIOSK_TIMING.idleWait.choices as readonly number[]).includes(n);
}

/** The remembered wait: 8 minutes when none is stored, and, said loudly, when the storage fails or holds a wait not offered. */
export function readIdleMinutes(): IdleMinutes {
  const fallback = KIOSK_TIMING.idleWait.defaultMinutes;
  let stored: string | null;
  try {
    stored = localStorage.getItem(IDLE_WAIT_KEY);
  } catch (err: unknown) {
    console.warn(`[kiosk] could not read the idle wait: ${message(err)}; waiting ${fallback} minutes`);
    return fallback;
  }
  if (stored === null) return fallback;
  const n = Number(stored);
  if (!isIdleMinutes(n)) {
    console.warn(`[kiosk] the stored idle wait "${stored}" is not offered; waiting ${fallback} minutes`);
    return fallback;
  }
  return n;
}

/** Remembers the presenter's choice across resets and reloads; a browser that cannot store it is told loudly. */
export function rememberIdleMinutes(minutes: IdleMinutes): void {
  try {
    localStorage.setItem(IDLE_WAIT_KEY, String(minutes));
  } catch (err: unknown) {
    console.warn(`[kiosk] could not remember the idle wait: ${message(err)}; ${minutes} minutes holds until this page reloads`);
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
