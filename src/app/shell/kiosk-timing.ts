/**
 * The shell's timings, as the approved mockup's CONFIG sets them (rulings in brackets).
 * Product timings, not deployment settings: a change here is a ruling.
 */
export const KIOSK_TIMING = {
  /**
   * K143 (amends K18's 90 s): no input for this many minutes on a scene, then the countdown. The
   * presenter's Run tab picks one of the choices, which this laptop's browser remembers (idle-wait.ts).
   */
  idleWait: { defaultMinutes: 8, choices: [2, 5, 8, 15] },
  /** K18: the "Still there?" countdown. */
  idleCountdownS: 15,
  /** K76: the start screen rolls the credits after 10 quiet minutes, and after each further quiet 10. */
  idleCreditsAfterMs: 600_000,
  /** How long those idle credits stay up. */
  idleCreditsHoldMs: 9_000,
  /** K32: the Credits button holds the page for a minute, or until a click or key. */
  creditsManualMs: 60_000,
  /** K16: the end credits over the story's last frame. */
  endCreditsMs: 7_000,
  /** K16: they roll this long after "That's Chora" shows (the mockup's 2.2 s). */
  endCreditsDelayMs: 2_200,
  /** How often the idle clock is read (the mockup's 250 ms tick). */
  tickMs: 250,
  /** How often the start screen checks its quiet time (the mockup's 5 s check). */
  creditsCheckMs: 5_000,
  /** D3: three clicks on the wordmark within this window open the presenter panel. */
  brandClicksMs: 700,
} as const;
