import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { ConceptGraph, ConceptSuggestion } from '../../aplus/discovery-graph/concept-graph.model';
import { ContentDirective } from '../../i18n/content.directive';

/**
 * What became of a suggestion this visit: waiting, added, dismissed, or its title already on the map;
 * or (KIOSK, K176, K190) its idea already holds six, so it is greyed with no Add.
 */
export type SuggRowState = 'pending' | 'added' | 'dropped' | 'dup' | 'full';

/** The owner's rule (K174, K176): a hex holds at most six children. */
export const MAX_CHILDREN = 6;

export interface SuggRow {
  readonly id: string;
  readonly title: string;
  readonly rationale: string;
  readonly state: SuggRowState;
  /** From a fresh batch (the mockup's fresh act names), and live when a LIVE press made it (its tag, K101). */
  readonly fresh?: boolean;
  readonly live?: boolean;
}

/** A row in the one list of waiting ideas (K189): an added or dismissed idea has left it. */
export type ListRow = SuggRow & { readonly state: Exclude<SuggRowState, 'added' | 'dropped'> };

export interface SuggDecision {
  readonly id: string;
  readonly choice: 'accept' | 'dismiss';
  readonly fresh: boolean;
}

const STATE_KEY: Record<Exclude<ListRow['state'], 'pending'>, string> = {
  dup: 'kd.sugg.dup',
  full: 'kd.sugg.full',
};

/**
 * The one list of a Companion's waiting ideas (mockup suggListHTML, line 4742; K189), shared by the
 * hook, Companions and the atlas: the kind, a fresh idea's LIVE tag when a LIVE press made it, the
 * concept's title and why (content, English in every language, K41), then Add and Dismiss on a waiting
 * row, or why it cannot be added. The title is a bdi, never a span: the mockup styles every span in a
 * row as its why.
 */
@Component({
  selector: 'kiosk-sugg-rows',
  imports: [TranslatePipe, ContentDirective],
  template: `
    <div class="sugg">
      @for (r of rows(); track r.id) {
        <div class="sugg-row" [class.dup]="r.state === 'dup'">
          <b
            ><em class="sugg-kind">{{ (r.state === 'dup' ? 'kd.kindOnMap' : 'kd.kindNew') | translate }}</em>
            @if (r.live) {
              <em class="live-tag sugg-live">{{ 'live.tag' | translate }}</em>
            }
            <bdi kioskContent>{{ r.title }}</bdi></b
          >
          <span kioskContent>{{ r.rationale }}</span>
          @if (r.state !== 'pending') {
            <em class="sugg-state">{{ stateKey[r.state] | translate }}</em>
          } @else if (!viewOnly()) {
            <div class="acts">
              <button class="btn btn-curiosity btn-sm" [attr.data-act]="act(r) + 'Accept'" [disabled]="disabled()" (click)="decide.emit({ id: r.id, choice: 'accept', fresh: !!r.fresh })">
                {{ 'kd.accept' | translate }}
              </button>
              @if (dismiss()) {
                <button class="link" [attr.data-act]="act(r) + 'Dismiss'" [disabled]="disabled()" (click)="decide.emit({ id: r.id, choice: 'dismiss', fresh: !!r.fresh })">
                  {{ 'kd.dismiss' | translate }}
                </button>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuggRowsComponent {
  readonly rows = input.required<readonly ListRow[]>();
  readonly viewOnly = input(false);
  readonly disabled = input(false);
  /** False: Add alone (story step 2, where a dismissed idea could keep the story from its step 3). */
  readonly dismiss = input(true);
  readonly decide = output<SuggDecision>();
  protected readonly stateKey = STATE_KEY;

  /** The mockup's data-act names: suggAccept and suggDismiss, or freshAccept and freshDismiss. */
  protected act(r: ListRow): 'sugg' | 'fresh' {
    return r.fresh ? 'fresh' : 'sugg';
  }
}

/**
 * A product suggestion as a row, with what this visit did to it (nothing yet: waiting); null for a link
 * between two ideas, since the lists show ideas only (K189 (2); W62: no link, on this map or off it). A
 * waiting idea the map already holds by its title, case apart, reads "on your map" (K157): marked, never
 * hidden. KIOSK (K176): a waiting idea an Add would break the hex rules with says why instead.
 */
export function suggRow(s: ConceptSuggestion, state: SuggRowState | null, map: ConceptGraph): SuggRow | null {
  if (s.kind === 'edge') return null;
  const base = { id: s.suggestionId, title: s.title ?? '', rationale: s.rationale ?? '' };
  if (state !== null && state !== 'pending') return { ...base, state };
  if (onMap(s, map)) return { ...base, state: 'dup' };
  // KIOSK (K176 as K189 (1) and K190 amend it): the cap counts the idea's actual children, nothing reserved;
  // once it holds six, the rest are greyed.
  const focal = s.focalConceptId;
  return { ...base, state: focal && childCount(map, focal) >= MAX_CHILDREN ? 'full' : 'pending' };
}

/** How many children an idea has: its parent-child links (a lateral link is not one). */
export function childCount(map: ConceptGraph, conceptId: string): number {
  return map.edges.filter((e) => e.sourceConceptId === conceptId && e.class === 'hierarchy').length;
}

/** Whether the map already holds the idea a suggestion offers, by its title, case apart (K157). */
export function onMap(s: ConceptSuggestion, map: ConceptGraph): boolean {
  const title = s.title?.trim().toLowerCase();
  return !!title && map.concepts.some((c) => c.title.trim().toLowerCase() === title);
}
