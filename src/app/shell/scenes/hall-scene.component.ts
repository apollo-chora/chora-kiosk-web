import { ChangeDetectionStrategy, Component, TemplateRef, computed, inject, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { CompanionsExhibit } from '../../exhibits/companions/companions-exhibit';
import { CardArtComponent } from '../../shared/art/card-art.component';
import type { CardArtName } from '../../shared/art/card-art';
import { BreedArtComponent, type BreedSpecies, type BreedStage } from '../../shared/components/breed-art/breed-art.component';
import { IconComponent } from '../../shared/icon/icon.component';
import { provideSceneFooter } from '../footer-slot';
import { KioskStore } from '../kiosk.store';
import { KioskTour, type TourExhibit } from '../tour/kiosk-tour';
import { TourFooterComponent } from '../tour/tour-footer.component';
import { provideTourNav } from '../tour/tour-nav';

interface LearnerCard {
  readonly to: TourExhibit;
  readonly key: string;
  /** The drawing; the Companions card draws its Companions instead. */
  readonly art: CardArtName | null;
}

/** The four learner exhibits in the mockup's order (SCENES.hall); the Engine Room's card follows them. */
const LEARNER_CARDS: readonly LearnerCard[] = [
  { to: 'maps', key: 'ex.maps', art: 'card_maps' },
  { to: 'comp', key: 'ex.comp', art: null },
  { to: 'dash', key: 'ex.dash', art: 'card_dash' },
  { to: 'grade', key: 'ex.grade', art: 'card_grade' },
];

/**
 * Explore, the hall (mockup SCENES.hall and exCard, lines 4644 to 4660; K3, K7, K10, K24, K39):
 * the four learner exhibits and the Engine Room's door, each card opening its scene and counting
 * the visit (openScene). The Companions card draws the learner's three Companions at the stages
 * their growth reads give, read again each time the hall shows (K173 ruling 3), so a level-up and
 * Grading's +30 hold when the visitor comes back (K42). The hall is the tour's hub (K173): Next starts
 * it at card 1, a card starts it at that card; the footer is the tour's (Done, then Next). W91 (K207): a sixth tile,
 * "Your own goal", opens the still storyboard of the full product, off the tour and not counted as a visit.
 */
@Component({
  selector: 'kiosk-hall-scene',
  imports: [TranslatePipe, CardArtComponent, BreedArtComponent, IconComponent, TourFooterComponent],
  templateUrl: './hall-scene.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HallSceneComponent {
  protected readonly store = inject(KioskStore);
  private readonly tour = inject(KioskTour);
  private readonly companions = inject(CompanionsExhibit);
  private readonly footer = viewChild<TemplateRef<unknown>>('footer');
  protected readonly learnerCards = LEARNER_CARDS;

  /** The Companions in their maps' order, as the growth reads (and any win since) left them; none until read. */
  protected readonly mates = computed(() =>
    this.companions.status() === 'ready'
      ? this.companions.roster().map((c) => ({
          id: c.id,
          name: c.growth.displayName || c.map.attachedFamiliarName || '',
          species: c.growth.species as BreedSpecies,
          stage: c.growth.growthStage as BreedStage,
        }))
      : [],
  );

  constructor() {
    provideSceneFooter(this.footer);
    if (this.companions.status() === 'idle') void this.companions.load();
    else void this.companions.refreshGrowth();
    provideTourNav();
  }

  /** A card starts the tour at that exhibit's first beat (and counts the visit). */
  protected open(to: TourExhibit): void {
    void this.tour.openCard(to);
  }

  /** W91: the storyboard of your own goal; no beat, and the presenter's visit events have none for it. */
  protected openOwn(): void {
    this.store.go('own');
  }
}
