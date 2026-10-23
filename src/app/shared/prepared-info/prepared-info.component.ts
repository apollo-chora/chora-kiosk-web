import { ChangeDetectionStrategy, Component, ElementRef, Injectable, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { IconComponent } from '../icon/icon.component';

/** Which stamp's note is open: one at a time across the screen. */
@Injectable({ providedIn: 'root' })
export class PreparedInfoState {
  private next = 0;
  readonly open = signal<number | null>(null);
  id(): number {
    return ++this.next;
  }
}

/** The note's width, and the gutter it keeps from the window's edges. */
const NOTE_W = 320;
const GUTTER = 16;

/**
 * K161 W30: what "Prepared {when}" means, from every stamp that shows a prepared time. An info mark
 * after the stamp's words opens one general note under it (made in advance by the same AI pipeline,
 * shown without internet or when a live call runs late; a LIVE button asks the AI now). The note is
 * placed in the window (fixed) so a drawer's scroll box never clips it, under the mark or, in the
 * window's lower half, above it; a second tap, a tap elsewhere
 * or Esc closes it, and opening another stamp's note closes this one.
 */
@Component({
  selector: 'kiosk-prepared-info',
  imports: [TranslatePipe, IconComponent],
  template: `
    <button type="button" class="prep-info" data-act="preparedInfo" [attr.aria-label]="'stamp.whatLabel' | translate" [attr.aria-expanded]="isOpen()" (click)="toggle($event)">
      <kiosk-icon name="info" />
    </button>
    @if (isOpen()) {
      <span class="prep-note" role="note" [style.top.px]="at().top" [style.bottom.px]="at().bottom" [style.left.px]="at().left" (click)="$event.stopPropagation()">{{
        'stamp.what' | translate
      }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
  host: { '(document:click)': 'close()', '(document:keydown.escape)': 'close()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PreparedInfoComponent {
  private readonly state = inject(PreparedInfoState);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly me = this.state.id();
  protected readonly isOpen = computed(() => this.state.open() === this.me);
  /** Where the note sits in the window: under the mark, or above it when the mark is in the window's lower half. */
  protected readonly at = signal<{ top: number | null; bottom: number | null; left: number }>({ top: 0, bottom: null, left: 0 });

  protected toggle(e: Event): void {
    e.stopPropagation();
    if (this.isOpen()) {
      this.state.open.set(null);
      return;
    }
    // A transformed ancestor (#stage, 1600 x 900 scaled to the window, or a scene inside it) is the fixed
    // note's containing block: place the note in that box's own space, not the window's.
    const block = containingBlock(this.host.nativeElement);
    const box = block?.getBoundingClientRect();
    const scale = block && box && block.offsetWidth ? box.width / block.offsetWidth : 1;
    const w = block ? block.offsetWidth : window.innerWidth;
    const h = block ? block.offsetHeight : window.innerHeight;
    const r = this.host.nativeElement.getBoundingClientRect();
    const mark = { left: (r.left - (box?.left ?? 0)) / scale, top: (r.top - (box?.top ?? 0)) / scale, bottom: (r.bottom - (box?.top ?? 0)) / scale };
    const left = Math.round(Math.min(Math.max(mark.left - NOTE_W / 2, GUTTER), Math.max(GUTTER, w - NOTE_W - GUTTER)));
    const above = mark.top > h / 2;
    this.at.set(above ? { top: null, bottom: Math.round(h - mark.top + 6), left } : { top: Math.round(mark.bottom + 6), bottom: null, left });
    this.state.open.set(this.me);
  }

  protected close(): void {
    if (this.isOpen()) this.state.open.set(null);
  }
}

/** The nearest ancestor that makes a fixed child's containing block (a transform, filter or paint containment), if any. */
function containingBlock(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.transform !== 'none' || cs.filter !== 'none' || cs.perspective !== 'none' || /paint|layout|strict|content/.test(cs.contain)) return p;
  }
  return null;
}
