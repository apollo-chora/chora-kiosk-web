/**
 * BreedArtComponent: renders the per-breed × per-stage visual for a
 * Familiar.
 *
 * Per the 2026-06-28 Familiar redesign: 5 hero breeds ship full art
 * (dragon/phoenix/owl/fox/penguin × 7 stages). Non-hero breeds
 * (cat/turtle/wolf/raven) display the Dragon art with a `breed-pending`
 * watermark until/if their canon lands.
 *
 * The component is purely presentational: it reads `species`, `stage`,
 * `shiny`, `mood`, `size` inputs and renders the matching transparent
 * cut-out from `chora-web/public/assets/familiars/{species}/{species}-stage-{N}.png`
 * (the sole deployed asset root per angular.json: no `src/assets` copy).
 *
 * When real art lands for the 7 other breeds, drop new files at the
 * `{species}/{species}-stage-{N}.png` path: no template changes needed.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

import { TranslatePipe } from '@ngx-translate/core';

export type BreedSpecies =
  | 'owl'
  | 'fox'
  | 'cat'
  | 'dragon'
  | 'phoenix'
  | 'turtle'
  | 'wolf'
  | 'raven'
  | 'penguin'
  | '';

export type BreedStage = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Reactive mood state: drives subtle CSS animation overlays. */
export type BreedMood = 'idle' | 'curious' | 'sleepy' | 'celebrating';

/** Display size presets. */
export type BreedSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

// Hero breeds with full shipped art (7 stages each) under
// /assets/familiars/{breed}/. Non-hero breeds (cat/turtle/wolf/raven) fall
// back to dragon art with a `breed-pending` watermark until/if their canon
// lands. Exported for the species-registry drift guard (CHO-2037), which pins
// this set to chora-contracts/companion/species_registry.json heroes.
export const CANON_BREEDS: ReadonlySet<BreedSpecies> = new Set([
  'dragon',
  'phoenix',
  'owl',
  'fox',
  'penguin',
]);

// Breed-neutral Pod art for the PRE-HATCH (Stage 0 egg) and UNKNOWN-breed
// (empty species) states. The breed is a hatch-time reveal (ADR-149 §3.3), so
// a Stage-0 egg has no breed to show, and a species-less roster row is
// "unknown": NOT "dragon". Both render this Pod, never the Dragon (bug #15:
// "dragon placeholder regardless of breed").
const POD_ART = '/assets/familiars/pods/pod-standard.png';

@Component({
  selector: 'chora-breed-art',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './breed-art.component.html',
  styleUrl: './breed-art.component.scss',
})
export class BreedArtComponent {
  readonly species = input.required<BreedSpecies>();
  readonly stage = input.required<BreedStage>();
  readonly shiny = input<boolean>(false);
  readonly mood = input<BreedMood>('idle');
  readonly size = input<BreedSize>('md');
  /** Visual-only label (e.g., breed name + stage); component does not localize.*/
  readonly altText = input<string>('Familiar');

  /**
   * Bare mode: render the figure with no fill/border frame. Familiar art
   * PNGs are transparent cut-outs, so a framed context (e.g. the profile
   * portrait) that already provides its own container should pass this to
   * avoid an accent tint behind the transparent image.
   */
  readonly bare = input<boolean>(false);

  /**
   * Pre-hatch (Stage 0 egg) OR an unresolved/empty species. The breed is a
   * hatch-time reveal (ADR-149 §3.3): a Stage-0 egg has no breed to show, and a
   * species-less roster row is "unknown", not "dragon". Both render the
   * breed-neutral Pod: NEVER the Dragon (bug #15).
   */
  readonly isPrehatch = computed<boolean>(
    () => this.stage() === 0 || this.species() === '',
  );

  /**
   * Resolve the source PNG path.
   *   • pre-hatch / unknown → the breed-neutral Pod (never Dragon);
   *   • canon breed         → its own art;
   *   • post-hatch NON-canon (cat/turtle/wolf/raven) → Dragon art + a
   *     `breed-pending` watermark: a DISCLOSED interim until their canon
   *     ships, not a silent default.
   */
  readonly artUrl = computed<string>(() => {
    if (this.isPrehatch()) return POD_ART;
    const sp = this.species();
    const effective: BreedSpecies = CANON_BREEDS.has(sp) ? sp : 'dragon';
    return `/assets/familiars/${effective}/${effective}-stage-${this.stage()}.png`;
  });

  /** True only for the post-hatch Dragon-substitution (a named non-canon breed). */
  readonly isFallback = computed<boolean>(() => {
    const sp = this.species();
    return !this.isPrehatch() && sp !== '' && !CANON_BREEDS.has(sp);
  });

  readonly dimensions = computed<{ readonly width: number; readonly height: number }>(() => {
    switch (this.size()) {
      case 'xs': return { width: 48,  height: 48  };
      case 'sm': return { width: 96,  height: 96  };
      case 'md': return { width: 160, height: 160 };
      case 'lg': return { width: 240, height: 240 };
      case 'xl': return { width: 360, height: 360 };
    }
  });
}
