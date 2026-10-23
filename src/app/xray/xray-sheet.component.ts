import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { DashboardExhibit } from '../exhibits/dashboard/dashboard-exhibit';
import { KioskLanguage } from '../i18n/i18n';
import { XrayService } from '../kiosk-api/xray.service';
import { lastVerdictRow, setCriticVerdict } from '../live/kinds/critic-verdict';
import { VIA_PICTURE, VIA_TEXT } from '../live/live-row.component';
import { QuestionJobsService } from '../product-api/question-jobs.service';
import { IconComponent } from '../shared/icon/icon.component';
import type { IconName } from '../shared/icon/icons';
import { formatClockSeconds } from '../shared/when';
import { KioskStore } from '../shell/kiosk.store';
import { HookStory } from '../story/hook-story';
import { TeacherStudio } from '../story/teacher-studio';
import { BehindTheScenes, XrayKind } from './behind-the-scenes';

/** One row of the panel (mockup traceItem, line 6277), its text in the current language. */
interface TraceRow {
  readonly cls: 'ok' | 'sim' | 'wait';
  readonly icon: IconName;
  readonly title: string;
  /** Simulated on this laptop (K15): the row carries the "Simulated on local" tag. */
  readonly sim: boolean;
  readonly sub: string;
  /** The sub is content a model wrote (a critic's note): English in every language (K41). */
  readonly content: boolean;
  readonly time: string;
}

/** A stage as the product reads give it (the serve door's trace through the xray, a job's trace). */
interface Stage {
  readonly name: string;
  readonly status: string;
  readonly completed_at?: string | null;
  readonly accepted?: boolean | null;
  readonly notes?: string | null;
}

/** The record a run's panel reads when it opens: none for the kinds that need no read. */
type RunRecord = { readonly state: 'none' } | { readonly state: 'loading' } | { readonly state: 'ready'; readonly stages: readonly Stage[] } | { readonly state: 'failed' };

const TITLE: Readonly<Record<XrayKind, string>> = {
  q: 'xr.q',
  words: 'xr.words',
  draft: 'xr.rev',
  rev: 'xr.rev',
  maps: 'xr.maps',
  comp: 'xr.comp',
  dash: 'xr.dash',
  grade: 'xr.grade',
};

/**
 * "Behind the scenes" (K75; mockup xrayHTML, line 6283). The descriptive kinds say how a scene works;
 * a run's kinds (step 3's question, step 4's draft, words and picture) show its stages from product
 * reads only: the conductor's xray of a prepared campaign set, a LIVE set's own trace, the draft's job.
 * The crew records no stage durations on the kiosk (each row starts and ends at once: the call runs in
 * the parked agent), so a row shows the time its stage finished. Every safety screen is said to be
 * simulated on this laptop (K15); a model is named by its role and provider, and the only model id is
 * the image model a prepared picture's run stamped (K72).
 */
@Component({
  selector: 'kiosk-xray-sheet',
  imports: [TranslatePipe, IconComponent],
  template: `
    @if (kind(); as k) {
      <div class="kicker">{{ 'xr.kicker' | translate }}</div>
      <h2>{{ title[k] | translate }}</h2>
      @if (record().state === 'failed') {
        <p class="msg-error">{{ 'hook.loadFailed' | translate }}</p>
      } @else {
        <ul class="trace">
          @for (r of rows(); track $index) {
            <li [class]="r.cls">
              <span class="ic"><kiosk-icon [name]="r.icon" /></span>
              <div>
                <b>{{ r.title }}@if (r.sim) {<span class="tag-sim">{{ 'xr.sim' | translate }}</span>}</b>
                <span [attr.lang]="r.content ? 'en' : null">{{ r.sub }}</span>
              </div>
              <span class="t">{{ r.time }}</span>
            </li>
          }
        </ul>
        @if (!handEdit()) {
          <p class="trace-foot">{{ 'xr.gateway' | translate }}{{ 'xr.gap' | translate }}{{ 'xr.modelsNote' | translate }}</p>
        }
      }
      <div class="close-row">
        <button class="btn btn-quiet btn-sm" data-act="xrayEngine" (click)="toEngine()">{{ 'xr.engine' | translate }}</button>
        <button class="btn btn-primary btn-sm" data-act="closeOverlay" (click)="store.closeOverlays()">{{ 'xr.close' | translate }}</button>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class XraySheetComponent {
  protected readonly store = inject(KioskStore);
  private readonly dash = inject(DashboardExhibit);
  private readonly story = inject(HookStory);
  private readonly studio = inject(TeacherStudio);
  private readonly xray = inject(XrayService);
  private readonly jobs = inject(QuestionJobsService);
  private readonly translate = inject(TranslateService);
  private readonly lang = inject(KioskLanguage).lang;
  protected readonly kind = inject(BehindTheScenes).kind;
  protected readonly title = TITLE;
  protected readonly record = signal<RunRecord>({ state: 'none' });

  /** The last revision of the part a run's kind shows. */
  private readonly lastRevision = computed(() => {
    const part = this.kind() === 'rev' ? 'b' : 'a';
    return this.studio.revisions().filter((r) => r.part === part).slice(-1)[0] ?? null;
  });
  protected readonly handEdit = computed(() => this.kind() === 'words' && this.lastRevision()?.how === 'hand');

  protected readonly rows = computed((): readonly TraceRow[] => {
    this.lang();
    const t = (k: string, params?: Readonly<{ [p: string]: string }>) => this.translate.instant(k, params) as string;
    const row = (cls: TraceRow['cls'], icon: IconName, title: string, sub: string, o: { sim?: boolean; content?: boolean; time?: string } = {}): TraceRow => ({
      cls,
      icon,
      title,
      sub,
      sim: o.sim ?? false,
      content: o.content ?? false,
      time: o.time ?? '',
    });
    // The gateway's screen (Cloud Model Armor in the full platform), for calls no crew guardrail node sees (mockup simGwItem).
    const simGateway = row('sim', 'shield', t('trace.safetyGw'), t('xr.safetyGwNote'), { sim: true });
    // A crew's own guardrail node, input or output side (mockup simItem).
    const simCrew = (side: 'in' | 'out') =>
      row('sim', 'shield', t(side === 'out' ? 'trace.safetyOut' : 'trace.safetyIn'), `${t('xr.safetyNote')} · ${side === 'out' ? 'guardrail_post' : 'guardrail_pre'}`, { sim: true });
    const role = (key: string, step?: string) => [t(key), VIA_TEXT, ...(step ? [step] : [])].join(' · ');
    const now = t('hist.now');

    switch (this.kind()) {
      case 'maps':
        return [...[1, 2, 3, 4, 5].map((i) => row('ok', 'info', t(`xr.m${i}`), t(`xr.m${i}n`))), simGateway];
      case 'comp':
        return [
          simGateway,
          row('ok', 'check', t('xr.c1'), t('xr.c1n') + t('xr.paren', { m: `${t('mdl.explorer')} · ${VIA_TEXT}` })),
          row('ok', 'check', t('xr.c2'), t('xr.c2n')),
          row('ok', 'info', t('xr.c3'), t('xr.c3n')),
          // K158 D2: the local edition declares the paper not screened (ADR-259 D6), never a pass.
          row('ok', 'info', t('comp.ab.weak'), t('xr.weakNoScreen') + t('xr.paren', { m: `${t('live.st.companion')} · ${VIA_PICTURE}` })),
          row('ok', 'info', t('xr.c4'), t('xr.c4n')),
        ];
      case 'dash': {
        const rows = [row('ok', 'info', t('xr.d1'), t('xr.d1n')), simGateway, row('ok', 'check', t('xr.d2'), t('xr.d2n')), row('ok', 'info', t('xr.d3'), t('xr.d3n'))];
        // The bank holding the step 4 copy says where its pictures come from (ruling on T3.11 Q1: K119, K66);
        // another bank with pictures in its own words (K159, W27).
        const picked = this.dash.picked();
        if (picked?.step4) rows.push(row('ok', 'info', t('xr.d4'), t('xr.d4n')));
        else if (picked?.pictures) rows.push(row('ok', 'info', t('xr.d4'), t('xr.d4nScene')));
        // After a submit (mockup dashXrayItems): the rules' marking, and the open answer's way if one was written.
        const a = this.dash.attempt();
        if (!a || a.status !== 'submitted') return rows;
        rows.push(row('ok', 'check', t('dbx.xr1'), t('dbx.xr1n')));
        const wroteOpen = (a.take?.questions ?? []).some((q) => q.question_type === 'oe' && !!a.answers.get(q.test_set_question_id)?.trim());
        if (!wroteOpen) return rows;
        rows.push(
          a.grading?.state === 'RELEASED'
            ? row('ok', 'check', t('dbx.xr2'), t('dbx.xr2done'))
            : row('wait', 'clock', t('dbx.xr2'), t('dbx.xr2n', { x: t('ex.grade.title') })),
        );
        return rows;
      }
      case 'grade':
        return [
          simCrew('in'),
          row('ok', 'check', t('xr.g1'), `${t('xr.g1n')} (oe_evaluator)`),
          row('ok', 'check', t('xr.g2'), `${t('xr.g2n')} (oe_moderator)`),
          simCrew('out'),
          row('ok', 'info', t('xr.g3'), t('xr.g3n')),
        ];
      case 'q': {
        const stages = this.stages();
        if (!stages) return [];
        const run = this.story.questionRun();
        const verdict = setCriticVerdict(stages);
        return [
          ...(has(stages, 'guardrail_pre') ? [simCrew('in')] : []),
          row('ok', 'check', t('xr.writer'), role('mdl.writer', 'generate'), { time: clock(finished(stages, 'generate')) }),
          row('ok', 'check', t('xr.critic') + (verdict?.accepted ? t('xr.sep') + t('xr.criticVq') : ''), role('mdl.critic', 'critique'), { time: clock(finished(stages, 'critique')) }),
          ...(has(stages, 'guardrail_post') ? [simCrew('out')] : []),
          run?.live ? row('ok', 'check', t('xr.servedLive'), t('xr.servedLiveNote'), { time: now }) : row('ok', 'check', t('xr.served'), t('xr.servedNote'), { time: now }),
        ];
      }
      case 'draft': {
        const stages = this.stages();
        if (!stages) return [];
        const verdict = lastVerdictRow(stages);
        const scene = this.studio.picture()?.mode === 'scene';
        return [
          ...(has(stages, 'guardrail_pre') ? [simCrew('in')] : []),
          row('ok', 'check', t('xr.writer'), role('mdl.writer'), { time: clock(finished(stages, 'generate')) }),
          ...(has(stages, 'render_image')
            ? [row('ok', 'check', scene ? t('trace.image') : t('xr.drawn'), scene ? VIA_PICTURE : 'Kroki', { time: clock(finished(stages, 'render_image')) })]
            : []),
          row('ok', 'info', t('xr.critic'), verdict?.notes ?? '', { content: true, time: clock(verdict?.completed_at) }),
          ...(has(stages, 'guardrail_post') ? [simCrew('out')] : []),
        ];
      }
      case 'words': {
        if (this.handEdit()) return [row('ok', 'pen', t('xr.hand'), t('xr.handNote'), { time: now })];
        const stages = this.stages();
        if (!stages) return [];
        const verdict = lastVerdictRow(stages);
        return [
          ...(has(stages, 'guardrail_pre') ? [simCrew('in')] : []),
          row('ok', 'check', t('xr.newDraft'), role('mdl.writer', 'ai_draft'), { time: clock(finished(stages, 'generate')) }),
          row('ok', 'check', t('xr.recheck') + (verdict?.accepted ? t('xr.sep') + t('crews.v.decision') : ''), role('mdl.critic'), { time: clock(verdict?.completed_at) }),
          ...(has(stages, 'guardrail_post') ? [simCrew('out')] : []),
        ];
      }
      case 'rev': {
        const r = this.lastRevision();
        if (!r) return [];
        const picture = (time: string) =>
          this.studio.picture()?.mode === 'scene'
            ? row('ok', 'check', t('xr.imageEdit'), r.model ? `${r.model} · ${VIA_PICTURE}` : VIA_PICTURE, { time })
            : row('ok', 'check', t('xr.drawn'), 'Kroki', { time });
        // K150: a live change shows only the stages its job ran (a direct edit has no writer).
        if (r.trace) {
          return [
            simGateway,
            ...r.trace.flatMap((st) =>
              st.name === 'generate'
                ? [row('ok', 'check', t('xr.rewrite'), role('mdl.writer'), { time: clock(st.completed_at) })]
                : st.name === 'render_image'
                  ? [picture(clock(st.completed_at))]
                  : [],
            ),
          ];
        }
        // A prepared picture (made through the writer before K150), or a live job with no trace.
        const time = r.madeAt ? formatClockSeconds(r.madeAt.toISOString()) : now;
        return [simGateway, row('ok', 'check', t('xr.rewrite'), role('mdl.writer')), picture(time)];
      }
      case null:
        return [];
    }
  });

  constructor() {
    void this.load();
  }

  private stages(): readonly Stage[] | null {
    const r = this.record();
    return r.state === 'ready' ? r.stages : null;
  }

  /** A run's kinds read their record once, when the panel opens. */
  private async load(): Promise<void> {
    const kind = this.kind();
    if (kind !== 'q' && kind !== 'draft' && kind !== 'words') return;
    if (this.handEdit()) return;
    this.record.set({ state: 'loading' });
    try {
      this.record.set({ state: 'ready', stages: await this.read(kind) });
    } catch (err: unknown) {
      console.error(`[kiosk] Behind the scenes (${kind}) could not be read: ${err instanceof Error ? err.message : String(err)}`);
      this.record.set({ state: 'failed' });
    }
  }

  private async read(kind: 'q' | 'draft' | 'words'): Promise<readonly Stage[]> {
    if (kind === 'q') {
      const run = this.story.questionRun();
      if (!run) throw new Error('step 3 shows no question whose run is known');
      if (run.live) {
        if (!run.trace) throw new Error('the LIVE question set carries no trace');
        // A served campaign trace keeps no notes but a guardrail's (SanitizeServedTrace).
        return run.trace.map(({ name, status, completed_at, accepted }) => ({ name, status, completed_at, accepted }));
      }
      return (await this.xray.campaignSet(run)).stages;
    }
    const draft = this.studio.draft();
    if (!draft) throw new Error('step 4 shows no draft');
    const job = await this.jobs.read(draft.atomId, draft.jobId);
    return job.pipeline_trace ?? [];
  }

  protected toEngine(): void {
    this.store.closeOverlays();
    this.store.openScene('engine');
  }
}

const has = (stages: readonly Stage[], name: string) => stages.some((s) => s.name === name);

/** When the stage last finished, or null when no row of it did. */
function finished(stages: readonly Stage[], name: string): string | null {
  return stages.filter((s) => s.name === name && s.status !== 'FAILED' && s.completed_at).slice(-1)[0]?.completed_at ?? null;
}

const clock = (iso: string | null | undefined) => (iso ? formatClockSeconds(iso) : '');
