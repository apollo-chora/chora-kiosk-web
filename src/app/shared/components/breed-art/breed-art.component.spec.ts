import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import type {
  BreedMood,
  BreedSize,
  BreedSpecies,
  BreedStage,
} from './breed-art.component';
import { BreedArtComponent } from './breed-art.component';
// KIOSK: ngx-translate's pipe needs its whole provider set, not the bare service class.
import { provideTranslateService } from '@ngx-translate/core';

describe('BreedArtComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [BreedArtComponent],
      providers: [provideHttpClient(), provideTranslateService()], // KIOSK
    });
  });

  function mount(opts: {
    species: BreedSpecies;
    stage: BreedStage;
    shiny?: boolean;
    mood?: BreedMood;
    size?: BreedSize;
  }) {
    const fixture = TestBed.createComponent(BreedArtComponent);
    fixture.componentRef.setInput('species', opts.species);
    fixture.componentRef.setInput('stage', opts.stage);
    if (opts.shiny !== undefined) fixture.componentRef.setInput('shiny', opts.shiny);
    if (opts.mood) fixture.componentRef.setInput('mood', opts.mood);
    if (opts.size) fixture.componentRef.setInput('size', opts.size);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('resolves Dragon image path for the requested stage', () => {
    const { el } = mount({ species: 'dragon', stage: 3 });
    const img = el.querySelector('.breed-art__image') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/assets/familiars/dragon/dragon-stage-3.png');
  });

  it.each(['dragon', 'phoenix', 'owl', 'fox', 'penguin'] as const)(
    'renders own art (no fallback watermark) for hero breed %s',
    (species) => {
      const { el } = mount({ species, stage: 4 });
      const img = el.querySelector('.breed-art__image') as HTMLImageElement;
      expect(img.getAttribute('src')).toBe(
        `/assets/familiars/${species}/${species}-stage-4.png`,
      );
      expect(el.querySelector('[data-testid="breed-art-pending"]')).toBeNull();
    },
  );

  it('falls back to Dragon art for non-hero breeds and shows watermark', () => {
    // cat/turtle/wolf/raven have no shipped canon -> dragon fallback + watermark.
    const { el } = mount({ species: 'cat', stage: 5 });
    const img = el.querySelector('.breed-art__image') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/assets/familiars/dragon/dragon-stage-5.png');
    expect(el.querySelector('[data-testid="breed-art-pending"]')).not.toBeNull();
  });

  it('renders the breed-neutral Pod for a Stage-0 egg (never the Dragon)', () => {
    // Pre-hatch: the breed is a hatch-time reveal (ADR-149 §3.3), so a Stage-0
    // egg: even a canon breed: shows the Pod, not a dragon-stage-0 sprite.
    const { el } = mount({ species: 'fox', stage: 0 });
    const img = el.querySelector('.breed-art__image') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/assets/familiars/pods/pod-standard.png');
    expect(el.querySelector('[data-testid="breed-art-pending"]')).toBeNull();
  });

  it('renders the Pod (not the Dragon) for an unknown/empty species', () => {
    // A species-less roster row is "unknown", NOT a dragon (bug #15).
    const { el } = mount({ species: '', stage: 2 });
    const img = el.querySelector('.breed-art__image') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/assets/familiars/pods/pod-standard.png');
    expect(el.querySelector('[data-testid="breed-art-pending"]')).toBeNull();
  });

  it('renders a hatched SHINY Fox Kit (Stage 1) as fox art: never a dragon (bug #15)', () => {
    const { el } = mount({ species: 'fox', stage: 1, shiny: true });
    const img = el.querySelector('.breed-art__image') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/assets/familiars/fox/fox-stage-1.png');
    expect(el.querySelector('.breed-art__shiny')).not.toBeNull();
    expect(el.querySelector('[data-testid="breed-art-pending"]')).toBeNull();
  });

  it('does NOT show fallback watermark for Dragon', () => {
    const { el } = mount({ species: 'dragon', stage: 1 });
    expect(el.querySelector('[data-testid="breed-art-pending"]')).toBeNull();
  });

  it('toggles shiny badge', () => {
    const { el } = mount({ species: 'dragon', stage: 6, shiny: true });
    expect(el.querySelector('.breed-art__shiny')).not.toBeNull();
    expect(el.querySelector('.breed-art')?.classList.contains('is-shiny')).toBe(true);
  });

  it('propagates mood as data attribute', () => {
    const { el } = mount({ species: 'dragon', stage: 2, mood: 'celebrating' });
    expect(el.querySelector('.breed-art')?.getAttribute('data-mood')).toBe('celebrating');
  });

  it('scales dimensions per size preset', () => {
    const { el: elXs } = mount({ species: 'dragon', stage: 0, size: 'xs' });
    const imgXs = elXs.querySelector('.breed-art__image') as HTMLImageElement;
    expect(imgXs.getAttribute('width')).toBe('48');
    const { el: elLg } = mount({ species: 'dragon', stage: 0, size: 'lg' });
    const imgLg = elLg.querySelector('.breed-art__image') as HTMLImageElement;
    expect(imgLg.getAttribute('width')).toBe('240');
  });

  it('is framed (not bare) by default', () => {
    const { el } = mount({ species: 'dragon', stage: 1 });
    expect(el.querySelector('.breed-art')?.classList.contains('is-bare')).toBe(
      false,
    );
  });

  it('renders a bare, frameless figure when bare=true', () => {
    // Bare = no fill/border frame, for transparent PNG cut-outs (e.g. the
    // Familiar profile portrait) that must not sit on an accent tint.
    const fixture = TestBed.createComponent(BreedArtComponent);
    fixture.componentRef.setInput('species', 'dragon');
    fixture.componentRef.setInput('stage', 1);
    fixture.componentRef.setInput('bare', true);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.breed-art')?.classList.contains('is-bare')).toBe(
      true,
    );
  });
});
