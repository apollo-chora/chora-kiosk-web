import { ChangeDetectionStrategy, Component, TemplateRef, inject, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { CardArtComponent } from '../../shared/art/card-art.component';
import { CardArtName } from '../../shared/art/card-art';
import { provideSceneFooter } from '../../shell/footer-slot';
import { KioskStore, SceneId } from '../../shell/kiosk.store';
import { TourFooterComponent } from '../../shell/tour/tour-footer.component';
import { provideTourNav } from '../../shell/tour/tour-nav';

interface EngineTile {
  readonly to: SceneId;
  readonly art: CardArtName;
  readonly key: string;
  readonly warn: boolean;
}

/** The four pages, AI safety after the crews (mockup SCENES.engine as amended, line 6125). */
const TILES: readonly EngineTile[] = [
  { to: 'crews', art: 'tile_crews', key: 'eng.crews', warn: false },
  { to: 'safety', art: 'tile_safety', key: 'eng.safety', warn: false },
  { to: 'gov', art: 'tile_gov', key: 'eng.gov', warn: false },
  { to: 'local', art: 'tile_local', key: 'eng.local', warn: true },
];

/**
 * The Engine Room's door (mockup SCENES.engine, line 6125; K4, K8, K10): four tiles, each opening its
 * page, the comparison with the full platform marked. Back, Esc and Back to Explore return to the hall
 * (mockup back and escapeUp); the door offers no Behind the scenes and no Done (K63). It reads nothing.
 */
@Component({
  selector: 'kiosk-engine-scene',
  imports: [TranslatePipe, CardArtComponent, TourFooterComponent],
  template: `
    <div class="exhibit">
      <div class="ex-head">
        <div>
          <div class="crumb">{{ 'eng.kicker' | translate }}</div>
          <h2>{{ 'eng.title' | translate }}</h2>
          <p>{{ 'eng.sub' | translate }}</p>
        </div>
      </div>
      <div class="eng-tiles eng-tiles--4">
        @for (t of tiles; track t.to) {
          <button class="eng-tile" [class.warn]="t.warn" data-act="open" [attr.data-to]="t.to" (click)="store.openScene(t.to)">
            <div class="art"><kiosk-card-art [name]="t.art" /></div>
            <h3>{{ t.key + '.title' | translate }}</h3>
            <p>{{ t.key + '.body' | translate }}</p>
          </button>
        }
      </div>
    </div>

    <ng-template #footer><kiosk-tour-footer /></ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EngineSceneComponent {
  protected readonly store = inject(KioskStore);
  private readonly footer = viewChild<TemplateRef<unknown>>('footer');
  protected readonly tiles = TILES;

  constructor() {
    provideSceneFooter(this.footer);
    provideTourNav();
  }
}
