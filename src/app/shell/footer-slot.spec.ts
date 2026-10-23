import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, TemplateRef, inject, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { FooterSlot, provideSceneFooter } from './footer-slot';

@Component({
  selector: 'kiosk-test-scene-a',
  template: `<ng-template #footer><button id="a-next">Next A</button></ng-template>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class SceneA {
  private readonly footer = viewChild<TemplateRef<unknown>>('footer');
  constructor() {
    provideSceneFooter(this.footer);
  }
}

@Component({
  selector: 'kiosk-test-scene-b',
  template: `<ng-template #footer><button id="b-back">Back to Explore</button></ng-template>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class SceneB {
  private readonly footer = viewChild<TemplateRef<unknown>>('footer');
  constructor() {
    provideSceneFooter(this.footer);
  }
}

@Component({
  imports: [NgTemplateOutlet, SceneA, SceneB],
  template: `
    @switch (scene()) {
      @case ('a') { <kiosk-test-scene-a /> }
      @case ('b') { <kiosk-test-scene-b /> }
    }
    <footer id="bottom">
      @if (footer(); as tpl) { <ng-container [ngTemplateOutlet]="tpl" /> }
    </footer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Shell {
  readonly scene = signal<'a' | 'b' | 'none'>('a');
  readonly footer = inject(FooterSlot).template;
}

describe('FooterSlot: a scene’s footer in the frame (mockup renderBottom)', () => {
  it('shows the footer of the scene that is showing, and only while it shows', async () => {
    const f = TestBed.createComponent(Shell);
    await f.whenStable();
    const bottom = () => (f.nativeElement as HTMLElement).querySelector('#bottom')!;
    expect(bottom().querySelector('#a-next')).not.toBeNull();
    f.componentInstance.scene.set('b');
    await f.whenStable();
    expect(bottom().querySelector('#a-next')).toBeNull();
    expect(bottom().querySelector('#b-back')).not.toBeNull();
    f.componentInstance.scene.set('none');
    await f.whenStable();
    expect(bottom().children.length).toBe(0);
  });

  it('a scene leaving never clears the footer of the scene that replaced it', () => {
    const slot = TestBed.inject(FooterSlot);
    const a = {} as TemplateRef<unknown>;
    const b = {} as TemplateRef<unknown>;
    slot.set(a);
    slot.set(b);
    slot.clear(a);
    expect(slot.template()).toBe(b);
    slot.clear(b);
    expect(slot.template()).toBeNull();
  });
});
