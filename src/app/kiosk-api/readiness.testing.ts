// Test-only: the readiness board the specs read.
import type { Readiness } from './readiness.service';

// The conductor's example body (services/chora-kiosk-conductor/API.md section 3, fixed at
// 9562d818b, with K158's reader at 1d11018c2), turned all green: Ollama for the text tiers, Vertex AI
// for pictures, embeddings and the weakness analyser's reader.
export function readinessExample(over: Partial<Readiness> = {}): Readiness {
  return {
    generated_at: '2026-10-20T06:02:11Z',
    overall: 'ready',
    session_started_since_reset: false,
    live: { text: { on: true, off_reason: null }, picture: { on: true, off_reason: null }, reader: { on: true, off_reason: null }, save: { on: true, off_reason: null } },
    opening_check: { state: 'passed', checked_at: '2026-10-20T01:00:04Z' },
    services: { state: 'ok', running: 20, expected: 20, down: [] },
    snapshot: { state: 'ok', prepared_at: '2026-10-20T06:02:00Z', restored_at: '2026-10-20T06:31:40Z', marker: 'match' },
    providers: { ollama: 'works', vertex: 'works' },
    text_models: { 'deepseek-v4-pro': 'works', 'gpt-oss:120b': 'works' },
    internet: 'up',
    pictures: { day: '2026-10-20', used: 9, cap: 50 },
    model_config: {
      state: 'valid',
      roles: {
        hard: { provider: 'ollama', model: 'deepseek-v4-pro' },
        middle: { provider: 'ollama', model: 'gpt-oss:120b' },
        light: { provider: 'ollama', model: 'gpt-oss:120b' },
        companion: { provider: 'ollama', model: 'gpt-oss:120b' },
        image: { provider: 'vertex', model: 'gemini-3-pro-image' },
        embedding: { provider: 'vertex', model: 'text-embedding-004' },
        reader: { provider: 'vertex', model: 'gemini-3.8-flash' },
      },
    },
    last_reset: { outcome: 'done', finished_at: '2026-10-20T06:31:52Z', took_s: 31, failed_phase: null, failed_step: null },
    disk: { state: 'ok', free_percent: 61 },
    memory: { state: 'ok', headroom_mib: 1840, unmeasured: ['chora-kiosk-conductor', 'docker-api-proxy'] },
    ports: { state: 'ok', published: 1 },
    databases: { state: 'ok' },
    telemetry: 'none_by_design',
    ...over,
  };
}
