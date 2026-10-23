/** Waits `ms`, or rejects at once when the press is let go (late, stopped, session over). */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error(`aborted: ${String(signal.reason)}`));
      return;
    }
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error(`aborted: ${String(signal.reason)}`));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Never resolves; rejects when the signal aborts. Raced against an executor that may not listen. */
export function aborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error(`aborted: ${String(signal.reason)}`)), { once: true });
  });
}
