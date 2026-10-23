import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, TemplateRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';

import { ConceptLensMapComponent } from '../aplus/my-knowledge/concept-lens-map/concept-lens-map.component';
import { HOOK_LENS_FRAME } from '../shared/lens-frames';
import { countWord } from '../i18n/count-word';
import { KioskLanguage } from '../i18n/i18n';
import { LiveRowComponent } from '../live/live-row.component';
import { IconComponent } from '../shared/icon/icon.component';
import { RevealDirective } from '../shared/reveal.directive';
import { freshGroup, waitingList } from '../shared/sugg/sugg-list';
import { SuggRowsComponent, suggRow } from '../shared/sugg/sugg-rows.component';
import { provideSceneFooter } from '../shell/footer-slot';
import { KIOSK_TIMING } from '../shell/kiosk-timing';
import { KioskStore } from '../shell/kiosk.store';
import { HookStory } from './hook-story';
import { StudioAComponent } from './studio-a.component';
import { StudioBComponent } from './studio-b.component';
import { TeacherStudio } from './teacher-studio';
import { XrayButtonComponent } from '../xray/xray-button.component';
import { BehindTheScenes } from '../xray/behind-the-scenes';
import { VisitOrderPipe } from '../shared/visit-order';

// The hook's frame on the mockup's 1600 by 757 scene (HOOK_BOX, DRAWER_EDGE, line 4169).
const SCENE_W = 1600;
const DRAWER_EDGE = 1036;
// K47: production's lens is framed right of the caption (#lenshost in _kiosk-additions.scss), and
// when the drawer opens its own shiftX centres the focus in the strip the drawer leaves visible
// (HOOK_LENS_FRAME, the same box).

interface Connector {
  readonly d: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/**
 * The story's steps 1 to 5 (mockup `SCENES.hook`, lines 4408 to 4432): production's lens with the
 * kiosk's glow (K37), the caption, and production's drawer kept to K36 (the Companion's
 * suggestions, then the new idea's terrain, ladder and question); then the teacher's studio, the
 * words under "Same you, new hat" (K34) and the picture, with "Keep and continue" (K56); then
 * "That's Chora" with the end credits (K16). The lens is remounted when the language changes: its labels are
 * computed with translate.instant(), which does not react.
 */
@Component({
  selector: 'kiosk-hook-scene',
  imports: [NgTemplateOutlet, TranslatePipe, ConceptLensMapComponent, IconComponent, LiveRowComponent, StudioAComponent, StudioBComponent, SuggRowsComponent, RevealDirective, XrayButtonComponent, VisitOrderPipe],
  templateUrl: './hook-scene.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HookSceneComponent {
  protected readonly story = inject(HookStory);
  protected readonly store = inject(KioskStore);
  protected readonly bts = inject(BehindTheScenes);
  protected readonly studio = inject(TeacherStudio);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly lang = inject(KioskLanguage).lang;
  /** Step 2's count, spelled (h2.title, h2.add; h2.titleOne and h2.addOne for a batch of one). */
  protected readonly branchN = computed(() => countWord(this.story.branchCount(), this.lang()));
  private readonly footer = viewChild<TemplateRef<unknown>>('footer');
  /**
   * K189: step 2's one list of waiting ideas, the fresh ones first, then Pingu's batch as the product holds
   * it now (an added idea has left it for the map), each held to the hex rules (K176, K190).
   */
  protected readonly list = computed(() => {
    const map = this.story.graph();
    if (!map) return null;
    const f = this.story.fresh();
    return waitingList(
      this.story.drawerSuggestions().flatMap((s) => suggRow(s, null, map) ?? []),
      f ? [freshGroup(f, map)] : [],
      this.story.branchPreparedAt(),
    );
  });
  /** K189 (1): "Add all" counts Pingu's waiting ideas that fit: all of them, some, or the last one by name. */
  protected readonly addAll = computed((): { readonly key: string; readonly params: Readonly<Record<string, string>> } | null => {
    const ids = this.story.addAllIds();
    const all = this.story.branchCount();
    if (ids.length === 0) return null;
    if (ids.length === all) return all === 1 ? { key: 'h2.addOne', params: {} } : { key: 'h2.add', params: { n: this.branchN() } };
    if (ids.length === 1) return { key: 'h2.addLast', params: { c: this.story.drawerSuggestions().find((s) => s.suggestionId === ids[0])?.title ?? '' } };
    return { key: 'h2.addSome', params: { n: countWord(ids.length, this.lang()), name: this.story.companionName() } };
  });

  protected readonly beats = [1, 2, 3, 4, 5] as const;
  protected readonly rungs = [1, 2, 3, 4, 5, 6] as const;
  protected readonly markers = ['A', 'B', 'C', 'D'];
  protected readonly connector = signal<Connector | null>(null);
  protected readonly shiftX = computed(() => (this.story.drawerOpen() ? HOOK_LENS_FRAME.drawerShift : 0));

  protected readonly branchTitle = computed(() => this.titleOf(this.story.branch()));
  protected readonly focusTitle = computed(() => this.story.focusConcept()?.title ?? '');
  /** The step 3 question's LIVE row stamp: the prepared twin's own time, none when nothing was prepared. */
  protected readonly questionPreparedAt = computed(() => {
    const p = this.story.practice();
    return p.state === 'prepared' || p.state === 'loading' || p.state === 'ready' ? (p.set?.preparedAt ?? null) : null;
  });
  /** The mockup's hookBackShown: Back shows past step 1, or on an untouched step 1 (back to the start screen). */
  protected readonly backShown = computed(() => this.story.step() > 1 || (this.story.maxStep() === 1 && this.story.skipped().length === 0));

  constructor() {
    provideSceneFooter(this.footer);
    // Lead 6b: a read that failed (a 502 while a reset ran elsewhere) is tried again when the scene opens again.
    if (this.story.status() === 'idle' || this.story.status() === 'failed') void this.story.load();
    inject(DestroyRef).onDestroy(this.store.setNav({ next: () => this.next(), back: () => this.back() }));
    effect(() => this.store.setTalkKey(this.story.talkKey()));
    effect(() => {
      if (!this.story.panel()) this.connector.set(null);
    });
    // K16: the end credits roll over "That's Chora" shortly after it shows.
    effect((onCleanup) => {
      if (this.story.beat() !== 5) return;
      const timer = setTimeout(() => this.store.playCredits(KIOSK_TIMING.endCreditsMs), KIOSK_TIMING.endCreditsDelayMs);
      onCleanup(() => clearTimeout(timer));
    });
  }

  /** The forward arrow: the story's next move, or from "That's Chora" on to the hall (mockup hookNext). */
  protected next(): void {
    if (this.story.beat() === 5) this.store.openScene('hall');
    else void this.story.next();
  }

  protected onSelect(conceptId: string): void {
    const s = this.story;
    if (s.beat() === 1) return s.chooseBranch(conceptId);
    if (s.beat() === 3 && !s.panel() && conceptId === s.focusConcept()?.conceptId) void s.openPanel();
  }

  protected back(): void {
    if (this.story.step() === 1 && this.story.maxStep() === 1 && this.story.skipped().length === 0) {
      this.story.forget();
      this.store.go('idle');
      return;
    }
    this.story.back();
  }

  /** The mockup's drawConnector (line 4088): from the new idea's tile to the drawer, once the lens settles. */
  protected drawConnector(): void {
    const focus = this.story.focusConcept();
    if (!this.story.panel() || !focus) return;
    const root = this.host.nativeElement;
    const scene = root.closest('#scene') ?? root.parentElement;
    const hex = root.querySelector(`#lenshost [data-id="${CSS.escape(focus.conceptId)}"]`);
    if (!scene || !hex) return;
    const s = scene.getBoundingClientRect();
    const r = hex.getBoundingClientRect();
    if (!s.width || !r.width) return;
    const k = s.width / SCENE_W;
    const x1 = (r.left + r.width * 0.95 - s.left) / k;
    const y1 = (r.top + r.height / 2 - s.top) / k;
    const x2 = DRAWER_EDGE + 16;
    const y2 = 132;
    this.connector.set({ d: `M${x1},${y1} C${x1 + 130},${y1} ${x2 - 150},${y2} ${x2},${y2}`, x1, y1, x2, y2 });
  }

  /** An option's class once graded: the key is right, the visitor's other pick a miss. */
  protected optionClass(optionId: string): string {
    const a = this.story.answer();
    if (a.state !== 'done') return '';
    if (optionId === a.result.correct_option_id) return 'right';
    return optionId === a.selected ? 'miss' : '';
  }

  private titleOf(conceptId: string | null): string {
    if (!conceptId) return '';
    return this.story.graph()?.concepts.find((c) => c.conceptId === conceptId)?.title ?? '';
  }
}
