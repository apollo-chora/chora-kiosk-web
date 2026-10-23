import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CampaignPracticeService } from '../aplus/daily-dose/campaign-practice/campaign-practice.service';
import type { PreparedChoice } from '../kiosk-api/manifest.service';
import { servePrepared } from './prepared-practice';

const SET: PreparedChoice<'practice_set'> = {
  key: 'set.water.res.r6',
  kind: 'practice_set',
  hidden: false,
  params: {},
  records: { goal_id: 'g-water', concept_id: 'w-res', concept_key: 'reservoirs', rung: 6, trace_id: 't', question_count: 1 },
  preparedAt: new Date('2026-10-20T05:40:00Z'),
};
const CANDIDATE = { stem: 'Why build reservoirs?', options: [{ option_id: 'a', text: 'Rain' }, { option_id: 'b', text: 'Sun' }] };

// A prepared practice set served through production's serve door (h3 = A): only a ready set is shown;
// anything else would start a generation no LIVE press asked for (K50), so it fails loud.
describe('servePrepared', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  const serve = () => servePrepared(TestBed.inject(CampaignPracticeService), SET);
  const door = (r: { url: string; params: { get(k: string): string | null } }) =>
    r.url === '/api/v1/me/goals/g-water/campaign/questions' && r.params.get('concept_id') === 'w-res' && r.params.get('rung') === '6';

  it('serves the set at its own goal, concept and rung, and shows its first question', async () => {
    const q = serve();
    http.expectOne(door).flush({ status: 'ready', questions: { candidates: [CANDIDATE] } });
    expect((await q).stem).toBe('Why build reservoirs?');
  });

  it('refuses a set the door does not have ready (a miss would generate)', async () => {
    const q = serve();
    http.expectOne(door).flush({ status: 'requested' });
    await expect(q).rejects.toThrow(/answered requested for prepared set set\.water\.res\.r6/);
  });

  it('refuses a ready set that holds no question it can show', async () => {
    const q = serve();
    http.expectOne(door).flush({ status: 'ready', questions: { candidates: [] } });
    await expect(q).rejects.toThrow(/holds no question/);
  });
});
