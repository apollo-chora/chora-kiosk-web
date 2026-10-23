import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import {
  CampaignPracticeService,
  CampaignPracticeError,
  parseCampaignQuestions,
} from './campaign-practice.service';
import type {
  CampaignAnswerRequest,
  CampaignAnswerResult,
  CampaignQuestionsResponse,
} from '../../my-knowledge/campaign.model';

/**
 * The SANITISED campaign serve (Slice F): the qgen payload with the answer key
 * (`is_correct`) AND per-option `explainer` stripped pre-grade. A served option
 * carries only `option_id` + display `text`/`label`. Shape:
 * `{candidates:[{stem, question_type, options:[{option_id, label, text}]}],
 * proposed_test_set}`.
 */
const CANONICAL_PAYLOAD = {
  candidates: [
    {
      draft_id: 'draft-a',
      stem: 'What is 2 + 3?',
      question_type: 'mcq',
      intent: 'application',
      options: [
        { option_id: 'a', label: '4', text: '4' },
        { option_id: 'b', label: '5', text: '5' },
        { option_id: 'c', label: '6', text: '6' },
      ],
    },
    {
      draft_id: 'draft-b',
      stem: 'Which is even?',
      question_type: 'mcq',
      // nested mcq_payload form (the alt option location)
      mcq_payload: {
        options: [
          { option_id: 'x', text: '3' },
          { option_id: 'y', text: '4' },
        ],
      },
    },
  ],
  proposed_test_set: { order: ['draft-a', 'draft-b'] },
};

const READY_RESP: CampaignQuestionsResponse = {
  status: 'ready',
  concept_id: 'concept-1',
  concept_key: 'addition',
  rung: 3,
  questions: CANONICAL_PAYLOAD,
  source: 'question_bank',
};

const ANSWER_RESULT: CampaignAnswerResult = {
  correct: true,
  rung: 3,
  is_refresher: false,
  counted: true,
  cleared_rung: 0,
  won: false,
  paced_today: false,
  rungs_cleared: 2,
  current_rung_correct: 1,
  needed_correct: 2,
  retention_r: 0.83,
  // Post-grade reveal (Slice F): correct option + explainer arrive here.
  correct_option_id: 'b',
  explainer: 'Because 2 + 3 = 5.',
};

describe('parseCampaignQuestions (pure)', () => {
  it('normalises the sanitised serve into learner-facing questions', () => {
    const qs = parseCampaignQuestions(CANONICAL_PAYLOAD);
    expect(qs.length).toBe(2);
    expect(qs[0].stem).toBe('What is 2 + 3?');
    expect(qs[0].options.map((o) => o.optionId)).toEqual(['a', 'b', 'c']);
    expect(qs[0].options[1].text).toBe('5');
  });

  it('reads options nested under mcq_payload', () => {
    const qs = parseCampaignQuestions(CANONICAL_PAYLOAD);
    expect(qs[1].options.map((o) => o.optionId)).toEqual(['x', 'y']);
    expect(qs[1].options[0].text).toBe('3');
  });

  it('surfaces ONLY optionId + text (no answer-key/explainer fields ever leak)', () => {
    // Even a payload that regressed to carry is_correct + explainer must be
    // stripped to the learner-safe projection (defence: Slice F already
    // sanitises server-side).
    const qs = parseCampaignQuestions({
      candidates: [
        {
          stem: 'Q',
          options: [
            { option_id: 'a', text: '1', is_correct: false, explainer: 'nope' },
            { option_id: 'b', text: '2', is_correct: true, explainer: 'yes' },
          ],
        },
      ],
    });
    for (const o of qs[0].options) {
      expect(Object.keys(o).sort()).toEqual(['optionId', 'text']);
    }
  });

  it('prefers text over label, falling back to label when text is absent', () => {
    const qs = parseCampaignQuestions({
      candidates: [
        {
          stem: 'Q',
          options: [
            { option_id: 'a', label: 'Newton' }, // no text → use label
            { option_id: 'b', text: 'Einstein', label: 'ignored' },
          ],
        },
      ],
    });
    expect(qs[0].options[0].text).toBe('Newton');
    expect(qs[0].options[1].text).toBe('Einstein');
  });

  it('drops candidates without a stem or with fewer than 2 options', () => {
    const qs = parseCampaignQuestions({
      candidates: [
        { stem: '', options: [{ option_id: 'a', text: '1' }, { option_id: 'b', text: '2' }] },
        { stem: 'lonely', options: [{ option_id: 'a', text: '1' }] },
        { stem: 'ok', options: [{ option_id: 'a', text: '1' }, { option_id: 'b', text: '2' }] },
      ],
    });
    expect(qs.length).toBe(1);
    expect(qs[0].stem).toBe('ok');
  });

  // CHO-2252: dropping is a RENDER choice, but `question_index` is a PROTOCOL
  // field: it means the index into the SERVED candidates array, which is what
  // the backend grades against. Carry the served index so a drop can never make
  // the two disagree about which question the learner answered.
  it('records the SERVED index, not the filtered render position', () => {
    const qs = parseCampaignQuestions({
      candidates: [
        { stem: '', options: [{ option_id: 'a', text: '1' }, { option_id: 'b', text: '2' }] },
        { stem: 'lonely', options: [{ option_id: 'a', text: '1' }] },
        { stem: 'ok', options: [{ option_id: 'a', text: '1' }, { option_id: 'b', text: '2' }] },
      ],
    });
    // Rendered first, but it is the THIRD candidate on the wire.
    expect(qs[0].sourceIndex).toBe(2);
  });

  it('records sourceIndex == render index when nothing is dropped', () => {
    const qs = parseCampaignQuestions({
      candidates: [
        { stem: 'one', options: [{ option_id: 'a', text: '1' }, { option_id: 'b', text: '2' }] },
        { stem: 'two', options: [{ option_id: 'a', text: '1' }, { option_id: 'b', text: '2' }] },
      ],
    });
    expect(qs.map((q) => q.sourceIndex)).toEqual([0, 1]);
  });

  it('drops options with a blank option_id (unusable identity)', () => {
    const qs = parseCampaignQuestions({
      candidates: [
        {
          stem: 'Q',
          options: [
            { option_id: '', text: 'ghost' },
            { option_id: 'a', text: '1' },
            { option_id: 'b', text: '2' },
          ],
        },
      ],
    });
    expect(qs[0].options.map((o) => o.optionId)).toEqual(['a', 'b']);
  });

  it('returns [] for malformed / empty / non-object input', () => {
    expect(parseCampaignQuestions(null)).toEqual([]);
    expect(parseCampaignQuestions(undefined)).toEqual([]);
    expect(parseCampaignQuestions('nonsense')).toEqual([]);
    expect(parseCampaignQuestions({})).toEqual([]);
    expect(parseCampaignQuestions({ candidates: [] })).toEqual([]);
    expect(parseCampaignQuestions({ candidates: 'oops' })).toEqual([]);
  });
});

describe('CampaignPracticeService', () => {
  let service: CampaignPracticeService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CampaignPracticeService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // ── load ────────────────────────────────────────────────────────────
  describe('load', () => {
    it('GETs the node-scoped serve with concept_id and returns the ready body', () => {
      let got: CampaignQuestionsResponse | undefined;
      service.load('goal-1', 'concept-1').subscribe((r) => (got = r));
      const req = httpMock.expectOne((r) =>
        r.url.endsWith('/api/v1/me/goals/goal-1/campaign/questions'),
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('concept_id')).toBe('concept-1');
      req.flush(READY_RESP);
      expect(got?.status).toBe('ready');
      expect(got?.rung).toBe(3);
    });

    it('passes through poll statuses (none / requested / failed) as data, not errors', () => {
      const statuses: CampaignQuestionsResponse['status'][] = ['none', 'requested', 'failed'];
      for (const status of statuses) {
        let got: CampaignQuestionsResponse | undefined;
        service.load('goal-1', 'concept-1').subscribe((r) => (got = r));
        httpMock
          .expectOne((r) => r.url.endsWith('/api/v1/me/goals/goal-1/campaign/questions'))
          .flush({ status, concept_id: 'concept-1', concept_key: 'addition', rung: 1 });
        expect(got?.status).toBe(status);
      }
    });

    it('maps a 409 NODE_WON to a typed CampaignPracticeError', () => {
      let err: unknown;
      service.load('goal-1', 'concept-1').subscribe({ error: (e) => (err = e) });
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/me/goals/goal-1/campaign/questions'))
        .flush({ code: 'NODE_WON', message: 'this node is already won' }, {
          status: 409,
          statusText: 'Conflict',
        });
      expect(err).toBeInstanceOf(CampaignPracticeError);
      expect((err as CampaignPracticeError).status).toBe(409);
      expect((err as CampaignPracticeError).code).toBe('NODE_WON');
    });

    it('maps a 404 CONCEPT_NOT_FOUND and 422 CONCEPT_OUTSIDE_CAMPAIGN', () => {
      let e404: CampaignPracticeError | undefined;
      service.load('goal-1', 'c').subscribe({ error: (e) => (e404 = e as CampaignPracticeError) });
      httpMock
        .expectOne((r) => r.url.endsWith('/campaign/questions'))
        .flush({ code: 'CONCEPT_NOT_FOUND', message: 'not in graph' }, { status: 404, statusText: 'Not Found' });
      expect(e404?.code).toBe('CONCEPT_NOT_FOUND');

      let e422: CampaignPracticeError | undefined;
      service.load('goal-1', 'c').subscribe({ error: (e) => (e422 = e as CampaignPracticeError) });
      httpMock
        .expectOne((r) => r.url.endsWith('/campaign/questions'))
        .flush({ code: 'CONCEPT_OUTSIDE_CAMPAIGN', message: 'outside subtree' }, { status: 422, statusText: 'Unprocessable' });
      expect(e422?.status).toBe(422);
      expect(e422?.code).toBe('CONCEPT_OUTSIDE_CAMPAIGN');
    });

    it('falls back to an UNKNOWN code when the error body carries none', () => {
      let err: CampaignPracticeError | undefined;
      service.load('goal-1', 'c').subscribe({ error: (e) => (err = e as CampaignPracticeError) });
      httpMock
        .expectOne((r) => r.url.endsWith('/campaign/questions'))
        .flush(null, { status: 503, statusText: 'Service Unavailable' });
      expect(err?.status).toBe(503);
      expect(err?.code).toBe('UNKNOWN');
    });
  });

  // ── answer ──────────────────────────────────────────────────────────
  describe('answer', () => {
    const req: CampaignAnswerRequest = {
      concept_id: 'concept-1',
      rung: 3,
      question_index: 0,
      selected_option_id: 'b',
    };

    it('POSTs the answer body and returns the server verdict', () => {
      let got: CampaignAnswerResult | undefined;
      service.answer('goal-1', req).subscribe((r) => (got = r));
      const httpReq = httpMock.expectOne((r) =>
        r.url.endsWith('/api/v1/me/goals/goal-1/campaign/questions/answer'),
      );
      expect(httpReq.request.method).toBe('POST');
      expect(httpReq.request.body).toEqual(req);
      httpReq.flush(ANSWER_RESULT);
      expect(got?.correct).toBe(true);
      expect(got?.counted).toBe(true);
      // post-grade reveal fields pass through untouched
      expect(got?.correct_option_id).toBe('b');
      expect(got?.explainer).toContain('2 + 3');
    });

    it('maps 409 RUNG_NOT_UNLOCKED / SET_NOT_SERVABLE / NODE_WON to typed errors', () => {
      for (const code of ['RUNG_NOT_UNLOCKED', 'SET_NOT_SERVABLE', 'NODE_WON']) {
        let err: CampaignPracticeError | undefined;
        service.answer('goal-1', req).subscribe({ error: (e) => (err = e as CampaignPracticeError) });
        httpMock
          .expectOne((r) => r.url.endsWith('/campaign/questions/answer'))
          .flush({ code, message: code }, { status: 409, statusText: 'Conflict' });
        expect(err?.status).toBe(409);
        expect(err?.code).toBe(code);
      }
    });

    it('maps a 422 ErrInvalid to a typed error', () => {
      let err: CampaignPracticeError | undefined;
      service.answer('goal-1', req).subscribe({ error: (e) => (err = e as CampaignPracticeError) });
      httpMock
        .expectOne((r) => r.url.endsWith('/campaign/questions/answer'))
        .flush({ code: 'INVALID', message: 'bad rung' }, { status: 422, statusText: 'Unprocessable' });
      expect(err?.status).toBe(422);
      expect(err?.code).toBe('INVALID');
    });
  });
});
