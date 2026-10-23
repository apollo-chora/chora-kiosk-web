import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { provideKioskI18n } from '../../i18n/i18n';
import { provideLive } from '../../live/live.providers';
import { CompanionsExhibit } from './companions-exhibit';
import { DOSE_OPEN, GROWTH, IDS, MAPS, PINGU_AFTER, PINGU_LOADOUT, companionsManifest, events, growthEvent, waterOnLastRung } from './companions-world.testing';

// What the atlas hands to Companions (K42: what the visit does carries across it; K135): a hex won in
// a map is credited exactly as a win in the Companions quiz (both credits waited for in the ledger,
// then the growth read once), so the hall's card and the Companion's sheet show it; and the drawer's
// "Practise today's dose" opens that map's Companion on its dose (mockup doseFromMap, line 6463).
describe('CompanionsExhibit, from the atlas', () => {
  let http: HttpTestingController;
  const exhibit = () => TestBed.inject(CompanionsExhibit);
  const EVENTS = `/api/v1/me/companions/${IDS.pingu}/growth-events`;
  const RUNG = growthEvent('ev-rung', 'campaign_rung_cleared', 8, 40, 1, 1);
  const WON = growthEvent('ev-won', 'campaign_node_won', 25, 65, 1, 2);

  beforeEach(() => {
    // The exhibit reads the store's overlay (W52's paper popup), and the store needs the language and LIVE providers.
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    exhibit().forget();
  });

  async function loaded(): Promise<void> {
    const done = exhibit().load();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(companionsManifest());
    for (const g of [IDS.water, IDS.nature, IDS.hawker]) await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${g}/graph`).flush(MAPS[g]));
    for (const c of [IDS.pingu, IDS.nova, IDS.ember]) await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${c}/growth`).flush(GROWTH[c]));
    await done;
  }

  it('a hex won in the atlas: the map read again, both credits waited for, the growth read; the win holds for the visit', async () => {
    await loaded();
    const credited = exhibit().creditWin(IDS.pingu, 'Reservoirs');
    await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${IDS.water}/graph`).flush(waterOnLastRung(true)));
    (await vi.waitFor(() => http.expectOne(EVENTS))).flush(events(WON, RUNG, DOSE_OPEN));
    (await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${IDS.pingu}/growth`))).flush(PINGU_AFTER);
    (await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${IDS.pingu}/skills`))).flush(PINGU_LOADOUT);
    const grew = await credited;
    expect(grew?.gained).toBe(33);
    expect(grew?.wonTitle).toBe('Reservoirs');
    expect(exhibit().roster().find((c) => c.id === IDS.pingu)?.growth.growthStage).toBe(2);
    expect(exhibit().grewOf(IDS.pingu)?.gained).toBe(33);
    const water = exhibit().roster().find((c) => c.id === IDS.pingu)?.map;
    expect(Object.values(water?.campaign?.nodes ?? {}).some((n) => !!n.wonAt)).toBe(true);
  });

  it('a win before the Companions were read is said loudly and credits nothing here (their growth before it is unknown)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await exhibit().creditWin(IDS.pingu, 'Reservoirs')).toBeNull();
    http.expectNone((r) => r.url.includes('/growth'));
    expect(String(err.mock.calls[0]?.[0])).toContain('before the Companions were read');
  });

  it('“Practise today’s dose” selects the map’s Companion and opens its dose, reading the Companions first if need be', async () => {
    const opening = exhibit().openDoseFor(IDS.nova);
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(companionsManifest());
    for (const g of [IDS.water, IDS.nature, IDS.hawker]) await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${g}/graph`).flush(MAPS[g]));
    for (const c of [IDS.pingu, IDS.nova, IDS.ember]) await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${c}/growth`).flush(GROWTH[c]));
    await vi.waitFor(() => expect(exhibit().view()).toBe('dose'));
    expect(exhibit().selected()?.id).toBe(IDS.nova);
    await vi.waitFor(() => http.expectOne((r) => r.url === '/api/companion/daily-dose' && r.params.get('goal_id') === IDS.nature));
    void opening;
  });
});
