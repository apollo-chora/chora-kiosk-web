import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ContentDirective } from '../i18n/content.directive';
import { LIVE_KINDS } from '../live/live-kinds';
import { LiveRowComponent } from '../live/live-row.component';
import { LiveService } from '../live/live.service';
import { ChoraQuestionEditorComponent } from '../shared/components/chora-question-editor/chora-question-editor.component';
import { validateEditableQuestion, type EditableQuestion } from '../shared/components/chora-question-editor/chora-question-editor.model';
import { IconComponent } from '../shared/icon/icon.component';
import { StudioHistoryComponent } from './studio-history.component';
import { TeacherStudio, WORDS_LIVE_KEY, WORD_CHIPS } from './teacher-studio';
import { BehindTheScenes, type XrayKind } from '../xray/behind-the-scenes';

/**
 * Step 4a, the words (mockup studioAHTML, lines 4326 to 4342): the draft with its key and its
 * critic's own notes, the append-only version history stamped with record times (K101), the
 * word chips (a NEW draft each, K35), the typed change and the LIVE redo on one LIVE row, and the
 * hand edit in production's question editor. `reviewing` is a step already passed (K46): read-only.
 */
@Component({
  selector: 'kiosk-studio-a',
  imports: [TranslatePipe, ContentDirective, IconComponent, LiveRowComponent, ChoraQuestionEditorComponent, StudioHistoryComponent],
  templateUrl: './studio-a.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudioAComponent {
  protected readonly studio = inject(TeacherStudio);
  protected readonly bts = inject(BehindTheScenes);
  /** How the words on screen were made (mockup studioAHTML's q.how): the draft, or the last change to them. */
  protected readonly xrayKind = computed((): XrayKind => (this.studio.revisions().some((r) => r.part === 'a') ? 'words' : 'draft'));
  private readonly live = inject(LiveService);

  readonly reviewing = input(false);

  protected readonly liveKey = WORDS_LIVE_KEY;
  protected readonly chips = WORD_CHIPS;
  protected readonly wordsOn = this.live.canPress('words');
  protected readonly wordsWhyOff = this.live.whyOff('words');
  protected readonly waitKey = LIVE_KINDS.words.budget === 'single' ? 'live.waitShort' : 'live.waitLong';
  protected readonly calling = computed(() => this.live.state(WORDS_LIVE_KEY)()?.status === 'calling');
  protected readonly busy = computed(() => this.calling() || this.studio.change().state === 'reading');

  protected readonly last = this.studio.lastWords;
  protected readonly handLast = computed(() => this.last()?.how === 'hand');
  protected readonly labelKey = computed(() => (this.handLast() ? 'draft.labelHand' : this.last() ? 'draft.labelNew' : 'draft.label'));
  protected readonly explainer = computed(() => this.studio.draft()?.question.options.find((o) => o.is_correct)?.explainer ?? '');
  protected readonly criticKey = computed(() => {
    const c = this.studio.draft()?.critic;
    if (!c) return null;
    if (this.last()) return c.accepted ? 'critic.recheckedAccepted' : 'critic.recheckedRejected';
    return c.accepted ? 'critic.accepted' : 'critic.rejected';
  });

  protected readonly typedText = signal('');
  /** K189 (3): "Send to the AI" waits for words, and the same words as the last typed change are no new request. */
  protected readonly sendOff = computed(() => {
    const t = this.typedText().trim();
    return !t || t === this.studio.lastTyped();
  });
  /** The redo row's stamp: the prepared change's own time; a live one says so itself, a hand edit has none. */
  protected readonly redoStamp = computed(() => {
    const r = this.last();
    return r?.how === 'prepared' ? r.madeAt : null;
  });
  protected readonly editQ = signal<EditableQuestion>({ question_type: 'mcq', prompt: '', options: [], model_answer: '' });
  protected readonly canSave = computed(() => validateEditableQuestion(this.editQ()).valid);

  constructor() {
    // Lead 6b: a read that failed (a 502 while a reset ran elsewhere) is tried again when the scene opens again.
    if (this.studio.status() === 'idle' || this.studio.status() === 'failed') void this.studio.load();
  }

  protected chipOff(c: (typeof WORD_CHIPS)[number]): boolean {
    return this.studio.used().has(c) || this.busy() || this.reviewing() || this.studio.editing() || !this.studio.canChip();
  }

  protected openEdit(): void {
    const q = this.studio.draft()?.question;
    if (!q) return;
    this.editQ.set({ ...q, options: q.options.map((o) => ({ ...o })) });
    this.studio.startEdit();
  }

  protected saveEdit(e: Event): void {
    e.preventDefault();
    this.studio.saveEdit(this.editQ());
  }

  protected sendTyped(e: Event): void {
    e.preventDefault();
    const text = this.typedText();
    if (this.sendOff()) return;
    this.typedText.set('');
    (e.target as HTMLFormElement).reset();
    void this.studio.typed(text);
  }

  protected letter(i: number): string {
    return String.fromCharCode(65 + i);
  }
}
