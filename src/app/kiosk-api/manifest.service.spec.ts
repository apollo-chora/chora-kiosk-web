import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ManifestService, PrewarmManifestWire } from './manifest.service';

const URL_ = '/api/v1/kiosk/prewarm/manifest';

const WIRE: PrewarmManifestWire = {
  format: 'chora-kiosk/prewarm-manifest/v1',
  made_at: '2026-10-20T06:02:00Z',
  commit: '4c1bd996d',
  list_sha256: 'ab'.repeat(32),
  world: { 'goal.water': 'goal-1', 'concept.water.newater': 'c-newater', 'companion.pingu': 'comp-pingu' },
  templates: { word_revision: { lines: ['Question: {stem}', '{options}', 'Correct answer: {answer}', 'Instruction: {instruction}'], option_line: '{letter}. {label}', option_line_explained: '{letter}. {label} ({explainer})' } },
  choices: {
    'sugg.water.newater': {
      kind: 'suggestions', stage: 'main', hidden: false, prepared_at: '2026-10-20T05:41:12Z', run_at: '2026-10-20T05:40:58Z', params_sha256: 'cd'.repeat(32),
      params: { goal: 'goal.water', focal: 'concept.water.newater', min_count: 3, hidden: false },
      records: { goal_id: 'goal-1', focal_concept_id: 'c-newater', request_id: 'r1', suggestion_ids: ['s1', 's2', 's3'], titles: ['Microfiltration', 'Reverse osmosis', 'UV disinfection'], edge_suggestion_ids: ['e1'] },
    },
    'fresh.water.newater': {
      kind: 'suggestions', stage: 'main', hidden: true, prepared_at: '2026-10-20T05:43:00Z', run_at: '2026-10-20T05:42:40Z', params_sha256: 'ef'.repeat(32),
      params: { goal: 'goal.water', focal: 'concept.water.newater', min_count: 2, hidden: true },
      records: { goal_id: 'goal-1', focal_concept_id: 'c-newater', request_id: 'r2', suggestion_ids: ['f1', 'f2'], titles: ['Membrane fouling', 'Brine'], edge_suggestion_ids: ['fe1'] },
    },
    'draft.h4': {
      kind: 'question_draft', stage: 'main', hidden: false, prepared_at: '2026-10-20T05:48:03Z', run_at: '2026-10-20T05:47:20Z', params_sha256: '01'.repeat(32),
      params: { atom: 'atom.water.newater-process', question_type: 'mcq', image_for_stem: true, expect_image_mode: 'mermaid', metadata: null, prompt: 'Write one question' },
      records: { atom_id: 'atom-1', job_id: 'job-1', draft_id: 'd-1', question_type: 'mcq', image_url: '/blobs/q/1.png', image_gcs_uri: 'gs://b/q/1.png', image_mode: 'mermaid' },
    },
    'paper.water': {
      kind: 'weakness_paper', stage: 'main', hidden: false, prepared_at: '2026-10-20T06:30:50Z', run_at: '2026-10-20T06:30:10Z', params_sha256: '23'.repeat(32),
      params: { paper: 'paper-water.png', goal: 'goal.water', companion: 'companion.pingu', upload_kind: 'marked_test' },
      records: {
        upload_id: 'up-1', goal_id: 'goal-1', companion_id: 'comp-pingu', sha256: '45'.repeat(32), status: 'AWAITING_REVIEW',
        proposed_edges: [{ id: 'pe-1', concept: 'The Four National Taps', descriptor: 'Counted rainwater as a tap.', confidence: 0.5 }],
      },
    },
  },
};

function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  return { manifests: TestBed.inject(ManifestService), backend: TestBed.inject(HttpTestingController) };
}

describe('ManifestService: the golden run’s prepared choices (PREPARED-CHOICES.md section 6)', () => {
  it('reads the manifest once and answers world keys and choices from it', async () => {
    const { manifests, backend } = setup();
    const p = manifests.load();
    backend.expectOne(URL_).flush(WIRE);
    const m = await p;
    expect(m.world('goal.water')).toBe('goal-1');
    const sugg = m.choice('sugg.water.newater', 'suggestions');
    expect(sugg.records.suggestion_ids).toEqual(['s1', 's2', 's3']);
    expect(sugg.preparedAt.toISOString()).toBe('2026-10-20T05:41:12.000Z');
    expect(m.choice('draft.h4', 'question_draft').records.image_mode).toBe('mermaid');
    expect(m.wordRevisionTemplate.option_line).toBe('{letter}. {label}');
    await expect(manifests.load()).resolves.toBe(m);
    backend.verify();
  });

  it('K158: a prepared paper is the golden run’s analyser run left at its review: its upload, its Companion and its proposed weak spots', async () => {
    const { manifests, backend } = setup();
    const p = manifests.load();
    backend.expectOne(URL_).flush(WIRE);
    const m = await p;
    const [paper, ...more] = m.choices('weakness_paper');
    expect(more).toEqual([]);
    expect(paper.key).toBe('paper.water');
    expect(paper.records.upload_id).toBe('up-1');
    expect(paper.records.companion_id).toBe('comp-pingu');
    expect(paper.records.proposed_edges.map((e) => e.concept)).toEqual(['The Four National Taps']);
    expect(paper.preparedAt.toISOString()).toBe('2026-10-20T06:30:50.000Z');
    expect(paper.params['paper']).toBe('paper-water.png');
  });

  it('keeps hidden batches apart: their suggestions and edges stay off every map and suggestion read (K64)', async () => {
    const { manifests, backend } = setup();
    const p = manifests.load();
    backend.expectOne(URL_).flush(WIRE);
    const m = await p;
    expect([...m.hiddenSuggestionIds].sort()).toEqual(['f1', 'f2', 'fe1']);
  });

  it('refuses a world key or choice the golden run did not make, never matching by title', async () => {
    const { manifests, backend } = setup();
    const p = manifests.load();
    backend.expectOne(URL_).flush(WIRE);
    const m = await p;
    expect(() => m.world('goal.space')).toThrow(/no world key goal\.space/);
    expect(() => m.choice('sugg.water.space', 'suggestions')).toThrow(/no prepared choice sugg\.water\.space/);
    expect(() => m.choice('draft.h4', 'suggestions')).toThrow(/draft\.h4 is a question_draft, not a suggestions/);
  });

  it('refuses a manifest of another format', async () => {
    const { manifests, backend } = setup();
    const p = manifests.load();
    backend.expectOne(URL_).flush({ ...WIRE, format: 'chora-kiosk/prewarm-manifest/v0' });
    await expect(p).rejects.toThrow(/manifest format chora-kiosk\/prewarm-manifest\/v0 is not chora-kiosk\/prewarm-manifest\/v1/);
  });

  it('says plainly when no golden run was made on this install (404), and tries again on the next load', async () => {
    const { manifests, backend } = setup();
    const p = manifests.load();
    backend.expectOne(URL_).flush({ error: { code: 'NOT_FOUND', message: 'no manifest' } }, { status: 404, statusText: 'Not Found' });
    await expect(p).rejects.toThrow(/no golden run has been made on this install/);
    const again = manifests.load();
    backend.expectOne(URL_).flush(WIRE);
    await expect(again).resolves.toBeDefined();
  });
});
