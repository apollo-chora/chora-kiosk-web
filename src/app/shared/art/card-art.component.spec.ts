import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CardArtComponent } from './card-art.component';
import { CARD_ART, CardArtName } from './card-art';

@Component({
  imports: [CardArtComponent],
  template: `<div class="art"><kiosk-card-art [name]="name()" /></div>`,
})
class HostComponent {
  readonly name = signal<CardArtName>('card_maps');
}

describe('CardArtComponent (the hall cards drawn inline, offline)', () => {
  it('draws the named card as an inline svg, the mockup’s markup', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const svg = fixture.nativeElement.querySelector('.art > kiosk-card-art > svg') as SVGElement | null;
    expect(svg).not.toBeNull();
    expect(svg!.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg!.getAttribute('viewBox')).toBe('0 0 400 190');
    const want = new DOMParser().parseFromString(CARD_ART.card_maps, 'image/svg+xml').documentElement;
    expect(svg!.childElementCount).toBe(want.childElementCount);
  });

  it('takes no box of its own, so ".ex-card .art svg" sizes the drawing', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const host = fixture.nativeElement.querySelector('kiosk-card-art') as HTMLElement;
    expect(getComputedStyle(host).display).toBe('contents');
  });

  it('is hidden from assistive technology (the card’s title carries the meaning)', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
  });

  it('redraws when the name changes', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    fixture.componentInstance.name.set('card_engine');
    await fixture.whenStable();
    const svgs = fixture.nativeElement.querySelectorAll('svg');
    expect(svgs.length).toBe(1);
    // The Engine Room's drawing is white lines on the dark card; the others sit on a pale rect.
    expect(svgs[0].firstElementChild.tagName).toBe('g');
  });
});
