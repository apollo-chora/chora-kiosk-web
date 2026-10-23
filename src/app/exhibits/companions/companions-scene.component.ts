import { ChangeDetectionStrategy, Component, DestroyRef, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { formatHoursUntil } from '../../aplus/daily-dose/daily-dose.model';
import { breedStageLabel, type GrowthStage } from '../../core/familiar/familiar-growth.model';
import { ConceptLensMapComponent } from '../../aplus/my-knowledge/concept-lens-map/concept-lens-map.component';
import { ContentDirective } from '../../i18n/content.directive';
import { KioskLanguage } from '../../i18n/i18n';
import { BreedArtComponent, type BreedSpecies, type BreedStage } from '../../shared/components/breed-art/breed-art.component';
import { LiveRowComponent } from '../../live/live-row.component';
import { IconComponent } from '../../shared/icon/icon.component';
import { LadderComponent } from '../../shared/ladder/ladder.component';
import { RevealDirective } from '../../shared/reveal.directive';
import { freshGroup, waitingList } from '../../shared/sugg/sugg-list';
import { SuggRowsComponent, suggRow } from '../../shared/sugg/sugg-rows.component';
import { formatDay, formatWhen } from '../../shared/when';
import { provideSceneFooter } from '../../shell/footer-slot';
import { KioskStore } from '../../shell/kiosk.store';
import { TourFooterComponent } from '../../shell/tour/tour-footer.component';
import { provideTourNav } from '../../shell/tour/tour-nav';
import { ABILITY_WORDS, REASON_WORDS, SKILL_WORDS, UNSHIPPED_TOOLS } from './companion-words';
import { CompanionsExhibit, type CompanionView } from './companions-exhibit';
import { CompanionWeakness, intoTargets, weakFoot, type CompanionWeak, type WeakChoice } from './companions-weak';
import { PaperPopComponent } from './paper-pop.component';
import { COMP_LENS_FRAME } from '../../shared/lens-frames';
import { XrayButtonComponent } from '../../xray/xray-button.component';
import { VisitOrderPipe } from '../../shared/visit-order';
import { PreparedInfoComponent } from '../../shared/prepared-info/prepared-info.component';

/**
 * A quiz question longer than this (stem and options, in characters) sets the drawer dense (D8's stack
 * walk en-28, ruling (a)): the mockup's questions run about 200, the golden run's rung-6 Reservoirs
 * question 815, which left two of its four options below the fold at 1366 x 768.
 */
const LONG_QUESTION = 400;

/** Production's learner wording for the model tier a stage reaches (familiar.component.ts mindLabelKey). */
const MIND: Readonly<Record<string, string>> = {
  'flash-lite': 'cx.mind.quick',
  flash: 'cx.mind.sharp',
  'flash-reasoning': 'cx.mind.deep',
  pro: 'cx.mind.deepest',
};

/**
 * Companions at work (mockup SCENES.comp, lines 4879 to 4906, K38): the roster of the learner's
 * three Companions, each bound to one map, its map in production's lens (framed in the mockup's
 * COMP_BOX) with its march and hexes won, and the profile sheet of the one picked (mockup
 * profileSheetHTML, production's hero card simplified): production's breed art and stage name,
 * the goal, the four tiles, the EXP bar as production shows it, and the march as Focus. After a
 * won hex the tiles that changed are lit, and a changed stage shows production's stage-up moment
 * on top (mockup stageUpHTML), every number from the growth, ledger and loadout reads. Today's
 * dose takes the map's place (mockup doseHTML): its header, one card at a time and the rail with
 * the Companion's greeting.
 */
@Component({
  selector: 'kiosk-companions-scene',
  imports: [TranslatePipe, ContentDirective, IconComponent, BreedArtComponent, ConceptLensMapComponent, LiveRowComponent, SuggRowsComponent, LadderComponent, RevealDirective, XrayButtonComponent, VisitOrderPipe, PreparedInfoComponent, TourFooterComponent, PaperPopComponent],
  templateUrl: './companions-scene.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanionsSceneComponent {
  protected readonly exhibit = inject(CompanionsExhibit);
  protected readonly weakness = inject(CompanionWeakness);
  protected readonly intoTargets = intoTargets;
  protected readonly longQuiz = computed(() => {
    const q = this.exhibit.quiz();
    return q.state === 'ready' && q.question.stem.length + q.question.options.reduce((n, o) => n + o.text.length, 0) > LONG_QUESTION;
  });
  protected readonly store = inject(KioskStore);
  protected readonly lang = inject(KioskLanguage).lang;
  protected readonly markers = ['A', 'B', 'C', 'D'];
  /** The map's frame (COMP_LENS_FRAME): with the drawer open, the lens's shiftX centres its focus in the strip left visible. */
  protected readonly frame = COMP_LENS_FRAME;
  private readonly footer = viewChild<TemplateRef<unknown>>('footer');
  /**
   * K189 (2): the drawer's one list of waiting ideas, its fresh batches at the top, newest first, and the
   * Suggest drawer's prepared ones under them (none after a won hex: that list is its ask's alone).
   */
  protected readonly list = computed(() => {
    const map = this.exhibit.selected()?.map;
    if (!map) return waitingList([], []);
    const f = this.exhibit.fresh();
    return waitingList(
      this.exhibit.rows().flatMap((r) => suggRow(r.suggestion, r.state, map) ?? []),
      f.map((g) => freshGroup(g, map)),
      this.exhibit.focal()?.preparedAt ?? null,
    );
  });
  /**
   * "Read my marked test" on show (K158), null until the marked test has a reading: K206 (W90), the document
   * on show (Pingu's essay as a second tab), its paper and reading, and the foot over every document's reading,
   * since one Save saves them all. The essay's LIVE row stamps the prepared reading only while it is the one
   * listed (after a miss, or with LIVE off: K101, K45).
   */
  protected readonly weakPanel = computed(() => {
    const c = this.exhibit.selected();
    const test = this.exhibit.weak();
    if (!c || (test?.state !== 'review' && test?.state !== 'saved')) return null;
    const essay = this.exhibit.essay();
    const essayReading = essay ? this.weakness.reading(c.id, 'essay') : null;
    const doc = this.exhibit.weakDoc();
    const reading = doc === 'essay' ? essayReading : test;
    const shown = reading?.state === 'review' || reading?.state === 'saved' ? reading : null;
    const preparedShown = !!essay && !!essayReading && essayReading !== essay.live && (essayReading.state === 'review' || essayReading.state === 'saved');
    return {
      doc,
      essay,
      paper: doc === 'essay' && essay ? essay.paper : test.paper,
      failed: reading?.state === 'failed',
      shown,
      review: shown?.state === 'review' ? shown : null,
      live: shown?.source === 'live',
      foot: weakFoot([test, essayReading]),
      essayPreparedAt: preparedShown && essay ? essay.paper.preparedAt : null,
    };
  });

  /** The dose header's countdown to the next dose, ticked each second (mockup cxTickCountdown). */
  private readonly now = signal(Date.now());

  protected readonly doseView = computed(() => {
    const c = this.exhibit.selected();
    const d = this.exhibit.dose();
    if (!c || d?.state !== 'ready') return null;
    const card = d.read.cards[d.index];
    const greet = this.exhibit.greeting();
    const grew = this.exhibit.grew();
    const prepared = greet?.prepared ?? null;
    const live = greet?.live ?? null;
    return {
      read: d.read,
      index: d.index,
      total: d.read.cards.length,
      card,
      body: d.atoms.get(card.atomId)?.body ?? null,
      answered: !!this.exhibit.answerOf(card.atomId),
      playable: card.reason === 'campaign' || this.exhibit.playable(card.atomId),
      why: REASON_WORDS[card.reason] ?? null,
      campaign: card.reason === 'campaign',
      day: formatDay(d.read.servedOn, this.lang()),
      countdown: formatHoursUntil(d.read.nextDoseAt, new Date(this.now())),
      quote: live?.greeting ?? prepared?.text ?? null,
      // A greeting prepared before this visit's win says so, and its time moves into that line (mockup aiGreetingBefore).
      before: !live && prepared && grew ? { when: this.when(prepared.preparedAt), focus: grew.wonTitle } : null,
      preparedAt: !live && prepared && !grew ? prepared.preparedAt : null,
    };
  });

  protected readonly sheet = computed(() => {
    const c = this.exhibit.selected();
    if (!c) return null;
    const g = c.growth;
    const matured = g.growthStage >= 6;
    const grew = this.exhibit.grew();
    const was = grew?.from;
    const mindKey = (x: typeof g) => MIND[x.effectiveLlmTier] ?? MIND['flash-lite'];
    const up = grew?.stageUp;
    return {
      c,
      name: this.name(c),
      epithet: breedStageLabel(g.species, g.growthStage as GrowthStage),
      mindKey: mindKey(g),
      matured,
      pct: matured || g.expNextThreshold === 0 ? 100 : Math.min(100, Math.round((g.expCurrent / g.expNextThreshold) * 100)),
      lit: !!grew,
      changed: {
        stage: !!was && was.growthStage !== g.growthStage,
        mind: !!was && mindKey(was) !== mindKey(g),
        total: !!was && was.expCumulative !== g.expCumulative,
        abilities: !!was && was.unlockedTools.length !== g.unlockedTools.length,
      },
      up:
        grew && up
          ? {
              fromStage: grew.from.growthStage as BreedStage,
              fromLabel: breedStageLabel(g.species, grew.from.growthStage as GrowthStage),
              gained: grew.gained,
              slots: up.slots,
              woke: up.woke.map((w) => ({ key: w.key, words: SKILL_WORDS[w.key] ?? null, active: w.active })),
              abilities: up.abilities.map((k) => ({ key: k, words: ABILITY_WORDS[k] ?? null, unshipped: UNSHIPPED_TOOLS.has(k) })),
            }
          : null,
    };
  });

  constructor() {
    provideSceneFooter(this.footer);
    const tick = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(tick));
    provideTourNav();
    // Lead 6b: a read that failed (a 502 while a reset ran elsewhere) is tried again when the scene opens again.
    if (this.exhibit.status() === 'idle' || this.exhibit.status() === 'failed') void this.exhibit.load();
    // K173 ruling (3): EXP credited elsewhere since the last read (Grading's release) shows on entry.
    else void this.exhibit.refreshGrowth();
  }

  /** A proposed weak spot's three choices (K158); a panel of one has nothing to be the same as. */
  protected weakChoices(w: Extract<CompanionWeak, { state: 'review' }>, edgeId: string): { key: WeakChoice['decision']; label: string; on: boolean }[] {
    const now = w.choices.get(edgeId)?.decision;
    const all: { key: WeakChoice['decision']; label: string }[] = [
      { key: 'accept', label: 'comp.weakKeep' },
      { key: 'reject', label: 'comp.weakDrop' },
      ...(w.edges.length > 1 ? [{ key: 'merge' as const, label: 'comp.weakMerge' }] : []),
    ];
    return all.map((d) => ({ ...d, on: d.key === now }));
  }

  /** The saved line for how many weak spots the Companion keeps: none, one (K161), or more. */
  protected savedKey(kept: number): string {
    if (kept === 0) return 'comp.weakSavedNone';
    return kept === 1 ? 'comp.weakSavedOne' : 'comp.weakSaved';
  }

  /** The map's won hexes (the mockup's hudHTML counts them over every concept on the map). */
  protected won(c: CompanionView): number {
    return Object.values(c.map.campaign?.nodes ?? {}).filter((n) => !!n.wonAt).length;
  }

  /** A dose option's class once graded: the server says only right or wrong, so only the visitor's pick is marked. */
  protected doseOptionClass(optionId: string): string {
    const a = this.exhibit.doseQuiz()?.answer;
    if (a?.state !== 'done' || a.selected !== optionId) return '';
    return a.correct ? 'right' : 'miss';
  }

  /** An option's class once graded: the key is right, the visitor's other pick a miss. */
  protected optionClass(optionId: string): string {
    const a = this.exhibit.quizAnswer();
    if (a.state !== 'done') return '';
    if (optionId === a.result.correct_option_id) return 'right';
    return optionId === a.selected ? 'miss' : '';
  }

  protected when(at: Date): string {
    return formatWhen(at.toISOString(), this.lang());
  }

  protected name(c: CompanionView): string {
    return c.growth.displayName || c.map.attachedFamiliarName || '';
  }

  protected species(c: CompanionView): BreedSpecies {
    return c.growth.species;
  }

  protected stage(c: CompanionView): BreedStage {
    return c.growth.growthStage as BreedStage;
  }
}
