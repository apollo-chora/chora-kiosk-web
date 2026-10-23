import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { KioskStore } from '../kiosk.store';
import { StartCheck } from '../start-check';
import { IdleSceneComponent } from './idle-scene.component';

// K164 W31: the start screen keeps K151's answer fresh while it shows (StartCheck.watch, from the
// moment it mounts to the moment it leaves), and the button pressed before an answer is fresh says it
// is checking, with a small spinner, until the store acts.
describe('IdleSceneComponent (K164 W31)', () => {
  let fixture: ComponentFixture<IdleSceneComponent>;
  let el: HTMLElement;
  const checking = signal<'en' | 'zh' | 'any' | null>(null);
  const watch = { started: 0, stopped: 0 };

  beforeEach(async () => {
    checking.set(null);
    watch.started = watch.stopped = 0;
    TestBed.configureTestingModule({
      providers: [
        ...provideKioskI18n(),
        { provide: KioskStore, useValue: { checking: checking.asReadonly(), startStory: vi.fn(async () => undefined) } },
        { provide: StartCheck, useValue: { watch: () => (watch.started++, () => void watch.stopped++) } },
      ],
    });
    await TestBed.inject(KioskLanguage).ready();
    fixture = TestBed.createComponent(IdleSceneComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  const label = (lang: 'en' | 'zh') => el.querySelector(`[data-act="start"][data-lang="${lang}"]`)?.textContent?.replace(/\s+/g, ' ').trim();
  const spin = (lang: 'en' | 'zh') => el.querySelector(`[data-act="start"][data-lang="${lang}"] .db-spin`);

  it('watches while it shows and stops when it leaves', () => {
    expect(watch).toEqual({ started: 1, stopped: 0 });
    fixture.destroy();
    expect(watch).toEqual({ started: 1, stopped: 1 });
  });

  it('the pressed button says it is checking, with a spinner, and is marked busy; the other keeps its words', () => {
    expect([label('en'), label('zh')]).toEqual(['Start in English', '用中文开始']);
    checking.set('en');
    fixture.detectChanges();
    expect(label('en')).toBe('Checking…');
    expect(spin('en')).not.toBeNull();
    expect(el.querySelector('[data-act="start"][data-lang="en"]')?.getAttribute('aria-busy')).toBe('true');
    expect([label('zh'), spin('zh')]).toEqual(['用中文开始', null]);
  });

  it('in Chinese the pressed button checks in Chinese; a click anywhere checks on the language shown', async () => {
    await TestBed.inject(KioskLanguage).setLang('zh');
    checking.set('any');
    fixture.detectChanges();
    expect(label('zh')).toBe('正在检查……');
    expect(label('en')).toBe('Start in English');
  });
});
