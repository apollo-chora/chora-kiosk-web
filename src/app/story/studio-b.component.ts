import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ContentDirective } from '../i18n/content.directive';
import { LIVE_KINDS } from '../live/live-kinds';
import { LiveRowComponent } from '../live/live-row.component';
import { LiveService } from '../live/live.service';
import { IconComponent } from '../shared/icon/icon.component';
import { StudioHistoryComponent } from './studio-history.component';
import { PICTURE_LIVE_KEY, TeacherStudio, WORDS_LIVE_KEY, type PictureChip } from './teacher-studio';
import { BehindTheScenes, type XrayKind } from '../xray/behind-the-scenes';

const MODE_KEY = { diagram: 'img.modeDiagram', flat: 'img.modeIllus', sketch: 'img.modeSketch', photo: 'img.modePhoto', scene: 'hist.picture' } as const;

/**
 * Step 4b, the picture (mockup studioBHTML, lines 4343 to 4361): the question the visitor checked
 * in 4a, the picture on screen with its mode and the AI mark, the critic's first note until any
 * picture change is on screen (then pic.fixedText: picture changes are not re-checked; K155), the
 * shared version history, the diagram chips then the restyles (K113), the typed change and the
 * LIVE redo on the picture's LIVE row, and the kept stamp (K56). `reviewing` is read-only (K46).
 * The redo is offered only on a prepared picture (K147): a redo re-runs the last instruction on the
 * same source, so after a live change it draws a near-identical picture; the chips and the typed
 * change stay.
 */
@Component({
  selector: 'kiosk-studio-b',
  imports: [TranslatePipe, ContentDirective, IconComponent, LiveRowComponent, StudioHistoryComponent],
  templateUrl: './studio-b.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudioBComponent {
  protected readonly studio = inject(TeacherStudio);
  protected readonly bts = inject(BehindTheScenes);
  /** How the picture on screen was made (mockup studioBHTML's q.how): the draft's, or the last change to it. */
  protected readonly xrayKind = computed((): XrayKind => (this.studio.revisions().some((r) => r.part === 'b') ? 'rev' : 'draft'));
  private readonly live = inject(LiveService);

  readonly reviewing = input(false);

  protected readonly liveKey = PICTURE_LIVE_KEY;
  protected readonly pictureOn = this.live.canPress('picture');
  protected readonly whyOff = this.live.whyOff('picture');
  protected readonly waitKey = LIVE_KINDS.picture.budget === 'single' ? 'live.waitShort' : 'live.waitLong';
  protected readonly calling = computed(() => this.live.state(PICTURE_LIVE_KEY)()?.status === 'calling');
  protected readonly busy = computed(() => this.calling() || this.live.state(WORDS_LIVE_KEY)()?.status === 'calling');
  protected readonly modeKey = computed(() => MODE_KEY[this.studio.picture()?.style ?? 'diagram']);
  protected readonly explainer = computed(() => this.studio.draft()?.question.options.find((o) => o.is_correct)?.explainer ?? '');
  protected readonly criticKey = computed(() => {
    const c = this.studio.firstCritic();
    return c ? (c.accepted ? 'critic.accepted' : 'critic.rejected') : null;
  });
  protected readonly typedText = signal('');
  /** K189 (3): "Send to the AI" waits for words, and the same words as the last typed change are no new request. */
  protected readonly sendOff = computed(() => {
    const t = this.typedText().trim();
    return !t || t === this.studio.lastPictureTyped();
  });
  /** The redo row's stamp: the prepared picture's own time; a live one says so itself. */
  protected readonly redoStamp = computed(() => {
    const r = this.studio.lastPicture();
    return r?.how === 'prepared' ? r.madeAt : null;
  });

  constructor() {
    // K203 (W87): the tanks request arrives pre-filled in the box, ready to send (the visitor may edit it).
    effect(() => {
      const offer = this.studio.tanksOffer();
      if (offer) this.typedText.set(offer.prefill);
    });
  }

  protected chipOff(c: PictureChip): boolean {
    return this.studio.pictureUsed().has(c) || this.busy() || this.reviewing() || !this.studio.canPictureChip();
  }

  protected sendTyped(e: Event): void {
    e.preventDefault();
    const text = this.typedText();
    if (this.sendOff()) return;
    this.typedText.set('');
    (e.target as HTMLFormElement).reset();
    void this.studio.picTyped(text);
  }

  protected letter(i: number): string {
    return String.fromCharCode(65 + i);
  }
}
