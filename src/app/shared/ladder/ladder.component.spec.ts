import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { LadderComponent } from './ladder.component';

@Component({
  imports: [LadderComponent],
  template: `<kiosk-ladder [cleared]="cleared()" />`,
})
class HostComponent {
  readonly cleared = signal(0);
}

// A concept's six-rung ladder (mockup ladderHTML, line 4109; rungs from campaign.model.ts): the
// cleared rungs lit (on), the next one gold (now), the rest waiting.
describe('LadderComponent', () => {
  async function shown(cleared: number): Promise<HTMLElement> {
    TestBed.configureTestingModule({ providers: [...provideKioskI18n()] });
    await TestBed.inject(KioskLanguage).ready();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.cleared.set(cleared);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }
  const classes = (el: HTMLElement) => [...el.querySelectorAll('.ladder > .rungpill')].map((p) => p.className);

  it('names the six rungs in order', async () => {
    const el = await shown(0);
    expect([...el.querySelectorAll('.ladder > .rungpill')].map((p) => p.textContent?.trim())).toEqual(['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create']);
  });

  it('lights the cleared rungs and marks the next one', async () => {
    expect(classes(await shown(5))).toEqual(['rungpill on', 'rungpill on', 'rungpill on', 'rungpill on', 'rungpill on', 'rungpill now']);
  });

  it('a fresh concept waits on its first rung; a won one has every rung lit and none next', async () => {
    expect(classes(await shown(0))).toEqual(['rungpill now', 'rungpill', 'rungpill', 'rungpill', 'rungpill', 'rungpill']);
    TestBed.resetTestingModule();
    expect(classes(await shown(6)).every((c) => c === 'rungpill on')).toBe(true);
  });
});
