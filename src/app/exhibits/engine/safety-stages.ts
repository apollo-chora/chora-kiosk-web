/** One evidence crop (tools/art writes them to public/assets/safety, K74); a side crop sits beside the first. */
export interface SafetyCrop {
  readonly k: string;
  readonly side?: boolean;
}

/** One check of the pipeline (mockup SAFETY_STAGES, line 6006). */
export interface SafetyStage {
  readonly id: 'judge' | 'redteam' | 'gate' | 'runtime' | 'drift';
  readonly phase: 'pre' | 'post';
  /** Its crops hide ids, links or leaked words (sf.maskNote). */
  readonly masked?: boolean;
  /** It lists the red team's six attack types. */
  readonly attacks?: boolean;
  /** It carries a note (sf.note.<id>). */
  readonly note?: boolean;
  /** Simulated on this laptop (K15). */
  readonly sim?: boolean;
  readonly crops: readonly SafetyCrop[];
}

/** The five checks: three before release, two after (K73). */
export const SAFETY_STAGES: readonly SafetyStage[] = [
  { id: 'judge', phase: 'pre', masked: true, crops: [{ k: 'judge-floors' }, { k: 'judge-oplus' }] },
  { id: 'redteam', phase: 'pre', attacks: true, crops: [{ k: 'redteam-six-blocked' }] },
  { id: 'gate', phase: 'pre', masked: true, note: true, crops: [{ k: 'gate-blocked-leak' }, { k: 'gate-crew-nothing', side: true }] },
  { id: 'runtime', phase: 'post', sim: true, crops: [{ k: 'runtime-armor' }] },
  { id: 'drift', phase: 'post', crops: [{ k: 'drift-gate-planted' }, { k: 'drift-record', side: true }] },
];

/** The red team's six attack types, as the gate's log names them (mockup SAFETY_ATTACKS). */
export const SAFETY_ATTACKS = ['prompt_injection', 'jailbreak', 'pii_exfiltration', 'toxicity', 'bias', 'system_prompt_leak'] as const;

/** Every string the page needs (the mockup's safetySelfCheck), so a missing one fails a test, never a screen. */
export function safetyStringKeys(): string[] {
  const keys: string[] = [];
  for (const s of SAFETY_STAGES) {
    keys.push(`sf.st.${s.id}`, `sf.sub.${s.id}`, `sf.say.${s.id}`, `sf.rule.${s.id}`);
    if (s.note) keys.push(`sf.note.${s.id}`);
    for (const c of s.crops) keys.push(`sf.c.${c.k}.meta`, `sf.c.${c.k}`);
  }
  for (const a of SAFETY_ATTACKS) keys.push(`sf.atk.${a}`);
  return keys;
}
