// Test data for step 4's specs: the manifest's step 4 draft and its prepared word chips, and
// creation's job reads in their wire shape. Test-only (never imported by the app).
import list from '../../../kiosk/world/prepared-choices.json';
import { MANIFEST_FORMAT, type PrewarmManifestWire } from '../kiosk-api/manifest.service';
import type { WordRevisionTemplate } from '../live/kinds/word-revision';

export const ATOM = 'a-newater';
export const TEMPLATE = list.templates.word_revision as WordRevisionTemplate;

/** A prepared draft or word revision: its records and its stamp. */
function draftChoice(kind: 'question_draft' | 'word_revision', job: string, at: string, params: Record<string, unknown>, from?: string, picture?: Record<string, string>) {
  return {
    kind,
    stage: 'main',
    hidden: false,
    prepared_at: at,
    run_at: at,
    params_sha256: 'x',
    params,
    records: {
      atom_id: ATOM,
      job_id: job,
      draft_id: `d-${job}`,
      question_type: 'mcq',
      image_url: null,
      image_gcs_uri: null,
      image_mode: null,
      ...(picture ?? {}),
      ...(from ? { from_draft_id: from } : {}),
    },
  };
}

export const INSTRUCTION = { r: 'Turn it into a real-life scenario', s: 'Make the question simpler', e: 'Add a one-line explanation' };

export function studioManifest(): PrewarmManifestWire {
  return {
    format: MANIFEST_FORMAT,
    made_at: '2026-10-20T06:30:00Z',
    commit: 'c',
    list_sha256: 'l',
    world: { 'atom.water.newater-process': ATOM },
    templates: { word_revision: TEMPLATE },
    choices: {
      'draft.h4': draftChoice('question_draft', 'j-v1', '2026-10-20T05:47:30Z', { atom: 'atom.water.newater-process' }, undefined, {
        image_url: '/pictures/h4.png',
        image_gcs_uri: 'gs://kiosk/h4.png',
        image_mode: 'mermaid',
      }),
      'pic.uv': picChoice('uv', 'mermaid', null, '2026-10-20T06:00:50Z'),
      'pic.where': picChoice('where', 'mermaid', null, '2026-10-20T06:01:40Z'),
      'pic.uv.where': picChoice('uv.where', 'mermaid', null, '2026-10-20T06:02:30Z'),
      'pic.illus': picChoice('illus', 'scene', null, '2026-10-20T06:03:20Z'),
      'pic.illus.sketch': picChoice('illus.sketch', 'scene', 'pic.illus', '2026-10-20T06:04:10Z'),
      'pic.illus.photo': picChoice('illus.photo', 'scene', 'pic.illus', '2026-10-20T06:05:00Z'),
      'pic.sketch.photo': picChoice('sketch.photo', 'scene', 'pic.illus.sketch', '2026-10-20T06:05:50Z'),
      'pic.photo.sketch': picChoice('photo.sketch', 'scene', 'pic.illus.photo', '2026-10-20T06:06:40Z'),
      // K203 (W87): the list's prompt is the pre-filled request, byte for byte.
      'pic.illus.photo.tanks': picChoice('illus.photo.tanks', 'scene', 'pic.illus.photo', '2026-10-20T06:07:30Z', TANKS_PROMPT),
      'pic.sketch.photo.tanks': picChoice('sketch.photo.tanks', 'scene', 'pic.sketch.photo', '2026-10-20T06:08:20Z', TANKS_PROMPT),
      'words.r': draftChoice('word_revision', 'j-r', '2026-10-20T05:48:20Z', { from: 'draft.h4', instruction: INSTRUCTION.r }, 'd-j-v1'),
      'words.s': draftChoice('word_revision', 'j-s', '2026-10-20T05:48:50Z', { from: 'draft.h4', instruction: INSTRUCTION.s }, 'd-j-v1'),
      'words.e': draftChoice('word_revision', 'j-e', '2026-10-20T05:49:20Z', { from: 'draft.h4', instruction: INSTRUCTION.e }, 'd-j-v1'),
      'words.r.s': draftChoice('word_revision', 'j-rs', '2026-10-20T05:50:50Z', { from: 'words.r', instruction: INSTRUCTION.s }, 'd-j-r'),
    },
  };
}

/** A prepared picture regenerate on the chain's one draft (PREPARED-CHOICES.md 5.6). */
export function picChoice(name: string, mode: 'mermaid' | 'scene', source: string | null, at: string, prompt = PIC_PROMPT(name)) {
  return {
    kind: 'picture_regen' as const,
    stage: 'main',
    hidden: false,
    prepared_at: at,
    run_at: at,
    params_sha256: 'x',
    params: { draft: 'draft.h4', source, mode, prompt },
    records: {
      atom_id: ATOM,
      parent_job_id: 'j-v1',
      draft_id: 'd-j-v1',
      regen_job_id: `r-${name}`,
      mode,
      source_image_gcs_uri: source ? `gs://kiosk/${source}.png` : null,
      image_url: `/pictures/pic.${name}.png`,
      image_gcs_uri: `gs://kiosk/pic.${name}.png`,
    },
  };
}

export const PIC_PROMPT = (name: string) => `The prompt for pic.${name}.`;
export const TANKS_PROMPT = 'Show steel tanks and membrane units instead of the glass and sponges';

export const opt = (id: string, label: string, is_correct = false, explainer = '') => ({ option_id: id, label, is_correct, explainer });

export const V1_OPTIONS = [opt('o1', 'Microfiltration'), opt('o2', 'Reverse osmosis'), opt('o3', 'UV disinfection', true), opt('o4', 'Chlorination')];
export const V1_STEM = 'The diagram shows how used water becomes NEWater. Which stage destroys germs that slip through the membranes?';

export function candidate(job: string, prompt: string, options = V1_OPTIONS) {
  return { draft_id: `d-${job}`, type: 'mcq', prompt, mcq_payload: { options }, model_used: 'gpt-oss:120b' };
}

/**
 * creation's job read: the draft, and its trace as creation's SINGLE lane writes it (recorded from the stack:
 * draft.h4 in exhibits/engine/crews.recorded.json, words.f in kiosk/stack/tests/words-trace.recorded.json). One
 * critique row carries the verdict and the critic's note; there is no critique_verdict row.
 */
export function jobRead(job: string, prompt: string, options = V1_OPTIONS, verdict = { accepted: true, notes: 'Option D, chlorination, also destroys germs.' }) {
  return {
    job_id: job,
    atom_id: ATOM,
    status: 'succeeded',
    candidate_questions: [candidate(job, prompt, options)],
    pipeline_trace: [
      { name: 'validate_input', status: 'ACCEPTED' },
      { name: 'guardrail_pre', status: 'COMPLETED', notes: 'not_screened (local edition)' },
      { name: 'generate', status: 'COMPLETED', attempt: 1, input_tokens: 1460, output_tokens: 520, notes: 'candidate produced' },
      { name: 'guardrail_post', status: 'COMPLETED', attempt: 1, notes: 'not_screened (local edition)' },
      { name: 'critique', status: verdict.accepted ? 'ACCEPTED' : 'REJECTED', attempt: 1, input_tokens: 1980, output_tokens: 240, notes: verdict.notes, accepted: verdict.accepted, suggested_revisions: [] },
      { name: 'quality_gate', status: 'ACCEPTED', attempt: 1, notes: verdict.notes },
      { name: 'publish_completed', status: 'COMPLETED', attempt: 1, notes: 'accepted' },
    ],
  };
}

export const jobUrl = (job: string) => `/api/atoms/${ATOM}/question-jobs/${job}`;
