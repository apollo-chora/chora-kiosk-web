import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ContentDirective } from '../../i18n/content.directive';
import { KioskLanguage } from '../../i18n/i18n';
import { IconComponent } from '../../shared/icon/icon.component';
import { formatWhen } from '../../shared/when';
import type { CompanionWeak } from './companions-weak';
import { lineParts, placeSpots } from './paper-extract';

type Shown = Extract<CompanionWeak, { state: 'review' | 'saved' }>;

/**
 * W52 (K182): how a Companion read its marked test, over the panel and inside the scene, so the footer
 * and its Next stay put: the paper full size on the left; on the right each question that lost marks,
 * its marks, the answer and the teacher's note, and under it the weak spot whose own words name it
 * (paper-extract.ts), with any that name no single question listed apart. The paper's text and the
 * weak spots are content (English, K41). Static: no request, no write; the prepared run or a LIVE one.
 * K206 (W90): Pingu's essay is one open question; its answer is listed line by line as the page draws it,
 * the teacher's underlines kept and each line's margin beside it (a tick, or the teacher's hint).
 */
@Component({
  selector: 'kiosk-paper-pop',
  imports: [TranslatePipe, ContentDirective, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'paper-pop', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'paper-pop-h' },
  template: `
    <div class="paper-pop__sheet glass">
      <img class="paper-pop__paper" [src]="weak().paper.src" [alt]="'comp.weakPaper' | translate: { title: weak().paper.title, subtitle: weak().paper.subtitle }" />
      <div class="paper-pop__side">
        <div class="paper-pop__head">
          <h3 id="paper-pop-h">{{ 'comp.paperHead' | translate: { name: name(), title: weak().paper.title } }}</h3>
          @if (weak().source === 'live') {
            <span class="live-tag">{{ 'live.tag' | translate }}</span>
          } @else {
            <span class="stamp"><kiosk-icon name="clock" />{{ 'stamp.prepared' | translate: { when: when() } }}</span>
          }
          <button class="btn btn-primary btn-sm" data-act="paperClose" (click)="closed.emit()">{{ 'xr.close' | translate }}</button>
        </div>
        @if (extract(); as x) {
          @if (x.known) {
            <p class="paper-pop__how">{{ 'comp.paperHow' | translate }}</p>
          } @else {
            <p class="paper-pop__earlier">{{ 'comp.paperEarlier' | translate }}</p>
          }
          <div class="paper-pop__list">
            @for (l of x.lost; track l.n) {
              <article class="pp-q" [attr.data-q]="l.n">
                @if (weak().paper.doc === 'essay') {
                  <h4 class="pp-q__h">{{ 'comp.paperEssay' | translate: { got: l.got, marks: l.marks } }}</h4>
                } @else {
                  <h4 class="pp-q__h">{{ (l.marks === 1 ? 'comp.paperQ1' : 'comp.paperQ') | translate: { n: l.n, got: l.got, marks: l.marks } }}</h4>
                }
                <p class="pp-q__stem" kioskContent>{{ l.q }}</p>
                @if (l.lines) {
                  <p class="pp-q__answerH"><b>{{ 'comp.paperAnswer' | translate }}</b></p>
                  <ol class="pp-lines">
                    @for (ln of l.lines; track $index) {
                      @let part = parts(ln);
                      <li class="pp-line">
                        <span class="pp-line__text" kioskContent
                          >{{ part.before }}@if (part.underline) {<u>{{ part.underline }}</u>}{{ part.after }}</span
                        >
                        <span class="pp-line__margin">
                          @if (ln.margin === 'tick') {
                            <span class="pp-line__tick" role="img" [attr.aria-label]="'comp.paperTick' | translate">✓</span>
                          } @else {
                            <span class="pp-line__hint" kioskContent>{{ ln.margin }}</span>
                          }
                        </span>
                      </li>
                    }
                  </ol>
                } @else {
                  <p class="pp-q__answer"><b>{{ 'comp.paperAnswer' | translate }}</b>&ngsp;<span kioskContent>{{ l.answer }}</span></p>
                }
                @if (l.note) {
                  <p class="pp-q__note"><b>{{ 'comp.paperTeacher' | translate }}</b>&ngsp;<span kioskContent>{{ l.note }}</span></p>
                }
                @if (x.known) {
                  @if (l.spots.length) {
                    <p class="pp-q__spotH">{{ 'comp.paperSpot' | translate }}</p>
                    @for (s of l.spots; track s.proposed_edge_id) {
                      <div class="pp-spot" [attr.data-spot]="s.proposed_edge_id">
                        <b class="pp-spot__label" kioskContent>{{ s.concept_label }}</b>
                        <span class="pp-spot__summary" kioskContent>{{ s.summary }}</span>
                      </div>
                    }
                  } @else {
                    <p class="pp-q__none">{{ 'comp.paperNone' | translate }}</p>
                  }
                }
              </article>
            }
            @if (x.apart.length) {
              <section class="pp-apart">
                <h4 class="pp-apart__h">{{ 'comp.paperApart' | translate }}</h4>
                @for (s of x.apart; track s.proposed_edge_id) {
                  <div class="pp-spot" [attr.data-spot]="s.proposed_edge_id">
                    <b class="pp-spot__label" kioskContent>{{ s.concept_label }}</b>
                    <span class="pp-spot__summary" kioskContent>{{ s.summary }}</span>
                  </div>
                }
              </section>
            }
          </div>
        } @else {
          <p class="msg-error">{{ 'hook.loadFailed' | translate }}</p>
        }
      </div>
    </div>
  `,
})
export class PaperPopComponent {
  readonly weak = input.required<Shown>();
  /** The Companion's name, as the scene shows it. */
  readonly name = input.required<string>();
  readonly closed = output<void>();
  private readonly lang = inject(KioskLanguage).lang;

  /** The lost marks and where each weak spot sits; null when the paper's questions could not be read (logged at open). */
  protected readonly extract = computed(() => {
    const w = this.weak();
    if (!w.paper.questions) return null;
    const edges = w.edges;
    return { ...placeSpots(w.paper.questions, edges ?? []), known: edges !== null };
  });

  protected when(): string {
    return formatWhen(this.weak().paper.preparedAt.toISOString(), this.lang());
  }

  protected readonly parts = lineParts;
}
