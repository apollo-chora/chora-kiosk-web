import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { IconComponent } from './icon.component';
import { ICONS, IconName } from './icons';

@Component({
  imports: [IconComponent],
  template: `<kiosk-icon [name]="name()" />`,
})
class HostComponent {
  readonly name = signal<IconName>('check');
}

describe('IconComponent (inline SVG, no icon font, no network)', () => {
  it('renders the named icon as an inline svg element', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const svg = fixture.nativeElement.querySelector('kiosk-icon svg') as SVGElement | null;
    expect(svg).not.toBeNull();
    expect(svg!.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg!.querySelector('path')!.getAttribute('d')).toBe('M5 12.5l4.5 4.5L19 7.5');
  });

  it('is hidden from assistive technology (the button or text beside it carries the meaning)', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const svg = fixture.nativeElement.querySelector('kiosk-icon svg') as SVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });

  it('swaps the drawing when the name changes', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    fixture.componentInstance.name.set('clock');
    await fixture.whenStable();
    const svg = fixture.nativeElement.querySelector('kiosk-icon svg') as SVGElement;
    expect(svg.querySelector('circle')).not.toBeNull();
    expect(svg.querySelectorAll('svg').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('kiosk-icon svg').length).toBe(1);
  });

  it('keeps the mockup markup the stylesheet sizes by: the clock carries class="clock"', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.name.set('clock');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('kiosk-icon svg').getAttribute('class')).toBe('clock');
  });

  it('every icon is a self-contained svg that references nothing outside itself', () => {
    for (const [name, markup] of Object.entries(ICONS)) {
      expect(markup.startsWith('<svg '), name).toBe(true);
      expect(markup, name).not.toMatch(/(?:href|src)\s*=|url\(|https?:/);
    }
  });
});
