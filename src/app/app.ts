import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ReadinessService } from './kiosk-api/readiness.service';
import { AboutSheetComponent } from './shell/about-sheet.component';
import { CreditsComponent } from './shell/credits.component';
import { FooterSlot } from './shell/footer-slot';
import { FrameHeaderComponent } from './shell/frame-header.component';
import { FreshStartComponent } from './shell/fresh-start.component';
import { IdleWarnComponent } from './shell/idle-warn.component';
import { KioskStore } from './shell/kiosk.store';
import { PresenterPanelComponent } from './shell/presenter/presenter-panel.component';
import { ResetCardComponent } from './shell/reset-card.component';
import { IdleSceneComponent } from './shell/scenes/idle-scene.component';
import { HallSceneComponent } from './shell/scenes/hall-scene.component';
import { OwnGoalSceneComponent } from './shell/scenes/own-goal-scene.component';
import { provideHallJumps } from './shell/scenes/hall-jumps';
import { provideTourBeats } from './shell/tour/tour-beats';
import { TourEndComponent } from './shell/tour/tour-end.component';
import { fitStage, StageFit } from './stage/stage-fit';
import { HookSceneComponent } from './story/hook-scene.component';
import { provideHookJumps } from './story/hook-jumps';
import { CompanionsSceneComponent } from './exhibits/companions/companions-scene.component';
import { provideCompanionsJumps } from './exhibits/companions/companions-jumps';
import { DashboardSceneComponent } from './exhibits/dashboard/dashboard-scene.component';
import { provideDashboardJumps } from './exhibits/dashboard/dashboard-jumps';
import { GradeSceneComponent } from './exhibits/grade/grade-scene.component';
import { provideEngineJumps } from './exhibits/engine/engine-jumps';
import { GovSceneComponent } from './exhibits/engine/gov-scene.component';
import { LocalSceneComponent } from './exhibits/engine/local-scene.component';
import { CrewsSceneComponent } from './exhibits/engine/crews-scene.component';
import { EngineSceneComponent } from './exhibits/engine/engine-scene.component';
import { SafetySceneComponent } from './exhibits/engine/safety-scene.component';
import { provideGradeJumps } from './exhibits/grade/grade-jumps';
import { provideMapsJumps } from './exhibits/maps/maps-jumps';
import { MapsSceneComponent } from './exhibits/maps/maps-scene.component';
import { XraySheetComponent } from './xray/xray-sheet.component';
import { VisitOrder } from './shared/visit-order';

/**
 * The root: one stage that fills the browser window (K22, no simulated kiosk frame),
 * scaled from the mockup's 1600x900 design grid, with the mockup's frame around the
 * scene: header, footer, overlays, the credits, the presenter panel and the reset card. Element ids and classes are the
 * mockup's, for its stylesheet and T4's walk.
 */
@Component({
  selector: 'kiosk-root',
  imports: [
    NgTemplateOutlet,
    TranslatePipe,
    FrameHeaderComponent,
    IdleSceneComponent,
    HookSceneComponent,
    HallSceneComponent,
    OwnGoalSceneComponent,
    MapsSceneComponent,
    CompanionsSceneComponent,
    DashboardSceneComponent,
    GradeSceneComponent,
    GovSceneComponent,
    LocalSceneComponent,
    CrewsSceneComponent,
    XraySheetComponent,
    EngineSceneComponent,
    SafetySceneComponent,
    CreditsComponent,
    IdleWarnComponent,
    FreshStartComponent,
    AboutSheetComponent,
    PresenterPanelComponent,
    ResetCardComponent,
    TourEndComponent,
  ],
  templateUrl: './app.html',
  host: {
    '(window:resize)': 'refit()',
    '(document:keydown)': 'onKey($event)',
    '(document:click)': 'store.markInput()',
    '(document:mousemove)': 'store.markInput()',
    '(document:mousedown)': 'store.markInput()',
    '(document:wheel)': 'store.markInput()',
    '(document:touchstart)': 'store.markInput()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly store = inject(KioskStore);
  protected readonly footer = inject(FooterSlot).template;
  protected readonly fit = signal<StageFit>(fitStage(window.innerWidth, window.innerHeight));
  private readonly sceneEl = viewChild.required<ElementRef<HTMLElement>>('scene');

  constructor() {
    // The conductor ran the opening check at its own start; read what it found (K65).
    void inject(ReadinessService).load();
    // The presenter's Jump to h1 to h5, the hall and the exhibits from any scene, and each visit forgotten at its end.
    provideHookJumps();
    provideHallJumps();
    provideCompanionsJumps();
    provideDashboardJumps();
    provideGradeJumps();
    provideEngineJumps();
    provideMapsJumps();
    // K173: what each beat of the guided tour shows.
    provideTourBeats();
    // K149: each visit draws its own option orders.
    const order = inject(VisitOrder);
    this.store.onEndSession(() => order.forget());

    // A new scene fades in (the mockup's render(true)).
    let shown: string | null = null;
    effect(() => {
      const scene = this.store.scene();
      const el = this.sceneEl().nativeElement;
      if (shown !== null && scene !== shown) {
        el.classList.remove('fade-in');
        void el.offsetWidth;
        el.classList.add('fade-in');
      }
      shown = scene;
    });
  }

  protected refit(): void {
    this.fit.set(fitStage(window.innerWidth, window.innerHeight));
  }

  protected onKey(e: KeyboardEvent): void {
    this.store.onKey(e, document.activeElement);
  }
}
