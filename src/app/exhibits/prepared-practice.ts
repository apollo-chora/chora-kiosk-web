import { firstValueFrom } from 'rxjs';

import { CampaignPracticeService, parseCampaignQuestions, type CampaignQuestion } from '../aplus/daily-dose/campaign-practice/campaign-practice.service';
import type { PreparedChoice } from '../kiosk-api/manifest.service';

/**
 * A prepared practice set served through production's serve door at its own goal, concept and rung
 * (h3 = A), shared by Companions and the atlas: only a ready set is shown, because anything else
 * would start a generation no LIVE button pressed (K50), so it fails loud.
 */
export async function servePrepared(api: CampaignPracticeService, set: PreparedChoice<'practice_set'>): Promise<CampaignQuestion> {
  const served = await firstValueFrom(api.load(set.records.goal_id, set.records.concept_id, set.records.rung));
  if (served.status !== 'ready') throw new Error(`the serve door answered ${served.status} for prepared set ${set.key}: it would have started a generation no LIVE button pressed`);
  const question = parseCampaignQuestions(served.questions)[0];
  if (!question) throw new Error(`the serve door's ready set for ${set.key} holds no question it can show`);
  return question;
}
