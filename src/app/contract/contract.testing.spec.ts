import { HttpClient, HttpParams, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { CampaignPracticeService } from '../aplus/daily-dose/campaign-practice/campaign-practice.service';
import { KIOSK_EDGE, RECORDING_FORMAT, type ContractRecording, allRecordings, checkRecording, recordingsOf, replay } from './contract.testing';

// The harness the contract specs use (W68, T3.3): a recording made by tools/contract/record.mjs from
// the running stack is replayed through a real API client, as the answer to the one GET the client
// sends, so the spec sees what the client makes of the stack's own answer. These cases test the
// harness itself, on recordings written here; the contract specs replay the recorded ones.
const rec = (over: Partial<ContractRecording> = {}): ContractRecording => ({
  contract: RECORDING_FORMAT,
  route: 'maps.graph',
  key: 'goal.water',
  keys: ['goal.water'],
  method: 'GET',
  path: '/api/v1/me/maps/{id}/graph',
  url: '/api/v1/me/maps/g-1/graph',
  recorded_at: '2026-10-22T03:00:00.000Z',
  edge: KIOSK_EDGE,
  manifest_commit: 'af2462e49',
  prepared_at: '2026-10-22T02:40:00Z',
  status: 200,
  body: { goalId: 'g-1', concepts: [{ id: 'k-1' }] },
  ...over,
});

describe('the contract harness', () => {
  let http: HttpTestingController;
  let client: HttpClient;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
  });

  afterEach(() => http.verify());

  it('answers the client’s one GET with the recorded body and returns what the client made of it', async () => {
    const out = await replay(http, rec(), () =>
      firstValueFrom(client.get<{ concepts: { id: string }[] }>('/api/v1/me/maps/g-1/graph')).then((b) => b.concepts.map((c) => c.id)),
    );
    expect(out).toEqual(['k-1']);
  });

  it('takes an Observable client as it is, and matches the query whatever order the client builds it in', async () => {
    const r = rec({ route: 'campaign.serve', url: '/api/v1/me/goals/g-1/campaign/questions?concept_id=k-1&rung=6', body: { status: 'ready' } });
    const params = new HttpParams().set('rung', '6').set('concept_id', 'k-1');
    const out = await replay(http, r, () => client.get<{ status: string }>('/api/v1/me/goals/g-1/campaign/questions', { params }));
    expect(out).toEqual({ status: 'ready' });
  });

  it('waits for a client that awaits before it sends (a session, a manifest)', async () => {
    const out = await replay(http, rec(), async () => {
      await Promise.resolve();
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      return firstValueFrom(client.get('/api/v1/me/maps/g-1/graph'));
    });
    expect(out).toEqual({ goalId: 'g-1', concepts: [{ id: 'k-1' }] });
  });

  it('fails naming the route when the client asks for another URL, and answers nothing', async () => {
    const p = replay(http, rec(), () => firstValueFrom(client.get('/api/v1/me/maps/g-2/graph')));
    await expect(p).rejects.toThrow('maps.graph goal.water: the client sent GET /api/v1/me/maps/g-2/graph, not GET /api/v1/me/maps/g-1/graph');
  });

  it('fails when a query value differs', async () => {
    const r = rec({ url: '/api/v1/me/goals/g-1/campaign/questions?concept_id=k-1&rung=6' });
    const p = replay(http, r, () => firstValueFrom(client.get('/api/v1/me/goals/g-1/campaign/questions', { params: { concept_id: 'k-1', rung: '5' } })));
    await expect(p).rejects.toThrow(/not GET \/api\/v1\/me\/goals\/g-1\/campaign\/questions\?concept_id=k-1&rung=6/);
  });

  it('fails when the client sends another method on the URL', async () => {
    const p = replay(http, rec(), () => firstValueFrom(client.post('/api/v1/me/maps/g-1/graph', {})));
    await expect(p).rejects.toThrow('maps.graph goal.water: the client sent POST /api/v1/me/maps/g-1/graph, not GET /api/v1/me/maps/g-1/graph');
  });

  it('fails when the client sends nothing', async () => {
    const p = replay(http, rec(), () => new Promise<never>(() => undefined));
    await expect(p).rejects.toThrow('maps.graph goal.water: the client sent no request');
  });

  it('drives a real production client through the BFF client, its query built as it builds it', async () => {
    const practice = TestBed.inject(CampaignPracticeService);
    const r = rec({ route: 'campaign.serve', key: 'set.water.res.r6', url: '/api/v1/me/goals/g-1/campaign/questions?concept_id=k-1&rung=6', body: { status: 'ready', concept_id: 'k-1', rung: 6 } });
    const out = await replay(http, r, () => practice.load('g-1', 'k-1', 6));
    expect(out).toMatchObject({ status: 'ready', concept_id: 'k-1', rung: 6 });
    await expect(replay(http, r, () => practice.load('g-1', 'k-1', 5))).rejects.toThrow(/the client sent GET \/api\/v1\/me\/goals\/g-1\/campaign\/questions\?concept_id=k-1&rung=5, not GET/);
  });

  it('answers the writes a client sends first with the answers the spec plants, then the recorded GET', async () => {
    const out = await replay(
      http,
      rec(),
      async () => {
        const made = await firstValueFrom(client.post<{ id: string }>('/api/v1/me/maps', { name: 'x' }));
        return firstValueFrom(client.get<{ goalId: string }>(`/api/v1/me/maps/${made.id}/graph`));
      },
      { before: [{ method: 'POST', url: '/api/v1/me/maps', body: { id: 'g-1' } }] },
    );
    expect(out).toEqual({ goalId: 'g-1', concepts: [{ id: 'k-1' }] });
  });

  it('fails naming the planted write when the client sends something else first', async () => {
    const p = replay(http, rec(), () => firstValueFrom(client.get('/api/v1/me/maps/g-1/graph')), {
      before: [{ method: 'POST', url: '/api/v1/me/maps', body: { id: 'g-1' } }],
    });
    await expect(p).rejects.toThrow('maps.graph goal.water: the client sent GET /api/v1/me/maps/g-1/graph, not POST /api/v1/me/maps (a planted write)');
  });

  it('runs the idle hook while the client waits on a timer before it sends', async () => {
    vi.useFakeTimers();
    try {
      const out = await replay(
        http,
        rec(),
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return firstValueFrom(client.get('/api/v1/me/maps/g-1/graph'));
        },
        { idle: () => vi.advanceTimersByTimeAsync(1000) },
      );
      expect(out).toEqual({ goalId: 'g-1', concepts: [{ id: 'k-1' }] });
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails naming the next request when the client asks again after its answer (a poll that never ends)', async () => {
    const p = replay(http, rec(), async () => {
      await firstValueFrom(client.get('/api/v1/me/maps/g-1/graph'));
      return firstValueFrom(client.get('/api/v1/me/maps/g-1/graph?again=1'));
    });
    await expect(p).rejects.toThrow('maps.graph goal.water: the client sent GET /api/v1/me/maps/g-1/graph?again=1 after its answer, and only the recorded GET is answered');
    http.match(() => true).forEach((r) => r.flush({}));
  });

  it('fails, never hangs, when the client does not finish after its answer', async () => {
    const p = replay(http, rec(), () => firstValueFrom(client.get('/api/v1/me/maps/g-1/graph')).then(() => new Promise<never>(() => undefined)));
    await expect(p).rejects.toThrow('maps.graph goal.water: the client did not finish after its answer');
  });

  it('passes the client’s own refusal through, so a client that rejects the stack’s answer fails its spec', async () => {
    const p = replay(http, rec({ body: { goalId: 'g-1' } }), () =>
      firstValueFrom(client.get<{ concepts?: unknown[] }>('/api/v1/me/maps/g-1/graph')).then((b) => {
        if (!b.concepts) throw new Error('[kiosk] no concepts');
        return b.concepts;
      }),
    );
    await expect(p).rejects.toThrow('[kiosk] no concepts');
  });
});

describe('a recording', () => {
  it('is a recorded GET from the kiosk edge, with a 2xx answer', () => {
    expect(() => checkRecording(rec())).not.toThrow();
    expect(() => checkRecording({ ...rec(), contract: 'other' } as unknown as ContractRecording)).toThrow(/maps\.graph goal\.water: not a contract recording/);
    expect(() => checkRecording(rec({ method: 'POST' as 'GET' }))).toThrow(/maps\.graph goal\.water: only GET answers are recorded/);
    expect(() => checkRecording(rec({ status: 404 }))).toThrow(/maps\.graph goal\.water: status 404 is not a 2xx answer/);
    expect(() => checkRecording(rec({ url: 'http://elsewhere/api/x' }))).toThrow(/maps\.graph goal\.water: the url is a path under \/api\//);
    expect(() => checkRecording(rec({ edge: 'http://127.0.0.1:18301' }))).toThrow(
      'maps.graph goal.water: recorded from http://127.0.0.1:18301, not the kiosk edge http://127.0.0.1:18080 (a dry run against the fixture server is not the stack’s contract)',
    );
  });

  it('is found by route, in key order, and a route with none fails loud', () => {
    const files = {
      './recorded/maps.graph.goal.water.json': rec(),
      './recorded/maps.graph.goal.hawker.json': rec({ key: 'goal.hawker', keys: ['goal.hawker'], url: '/api/v1/me/maps/g-2/graph' }),
      './recorded/maps.list.json': rec({ route: 'maps.list', key: null, keys: [], url: '/api/v1/me/maps' }),
    };
    expect(recordingsOf(files, 'maps.graph').map((r) => r.key)).toEqual(['goal.hawker', 'goal.water']);
    expect(recordingsOf(files, 'maps.list').map((r) => r.url)).toEqual(['/api/v1/me/maps']);
    expect(() => recordingsOf(files, 'companions.growth')).toThrow(
      'no recording of companions.growth: record the stack with tools/contract/record.mjs (on the orchestrator’s go, W68)',
    );
  });

  it('are all read at once, every file checked, none at all an empty list', () => {
    const files = {
      './recorded/maps.graph.goal.water.json': rec(),
      './recorded/maps.list.json': rec({ route: 'maps.list', key: null, keys: [], url: '/api/v1/me/maps' }),
    };
    expect(allRecordings(files).map((r) => `${r.route} ${r.key ?? '-'}`)).toEqual(['maps.graph goal.water', 'maps.list -']);
    expect(allRecordings({})).toEqual([]);
    expect(() => allRecordings({ './recorded/maps.list.json': rec({ route: 'maps.list', key: null, keys: [], url: '/api/v1/me/maps', status: 500 }) })).toThrow(
      'maps.list: status 500 is not a 2xx answer',
    );
  });

  it('must sit in the file its route and key name', () => {
    expect(() => recordingsOf({ './recorded/maps.graph.goal.nature.json': rec() }, 'maps.graph')).toThrow(
      './recorded/maps.graph.goal.nature.json holds maps.graph goal.water: a recording sits in <route>.<key>.json',
    );
  });
});
