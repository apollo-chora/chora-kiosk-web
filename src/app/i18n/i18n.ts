import { DOCUMENT, Injectable, Provider, inject, signal } from '@angular/core';
import {
  MissingTranslationHandler,
  MissingTranslationHandlerParams,
  TranslateLoader,
  TranslateService,
  TranslationObject,
  provideMissingTranslationHandler,
  provideTranslateLoader,
  provideTranslateService,
} from '@ngx-translate/core';
import { Observable, firstValueFrom, of } from 'rxjs';

import en from './en.json';
import zh from './zh.json';

/** The kiosk's two interface languages (K25). Content stays English in both (K41). */
export type KioskLang = 'en' | 'zh';

const TABLES: Record<KioskLang, TranslationObject> = { en, zh };
const HTML_LANG: Record<KioskLang, string> = { en: 'en', zh: 'zh-Hans' };

/** The tables are bundled (the kiosk is offline), so loading is synchronous. */
@Injectable()
export class BundledTranslateLoader implements TranslateLoader {
  getTranslation(lang: string): Observable<TranslationObject> {
    const table = TABLES[lang as KioskLang];
    if (!table) throw new Error(`[kiosk] no string table for ${lang}`);
    return of(table);
  }
}

/** A key with no string is a defect: say so loudly, and show the key rather than nothing. */
@Injectable()
export class LoudMissingStrings implements MissingTranslationHandler {
  handle(params: MissingTranslationHandlerParams): string {
    console.error(`[kiosk] missing string ${params.key} (${params.translateService.getCurrentLang()})`);
    return params.key;
  }
}

@Injectable({ providedIn: 'root' })
export class KioskLanguage {
  private readonly translate = inject(TranslateService);
  private readonly document = inject(DOCUMENT);
  private readonly current = signal<KioskLang>('en');
  private readonly started: Promise<void>;

  /** The interface language now in use. */
  readonly lang = this.current.asReadonly();

  constructor() {
    this.started = this.apply('en');
  }

  /** Resolves once the starting language is in use. */
  ready(): Promise<void> {
    return this.started;
  }

  async setLang(lang: KioskLang): Promise<void> {
    if (!(lang in TABLES)) throw new Error(`[kiosk] no language ${String(lang)}`);
    await this.started;
    await this.apply(lang);
  }

  private async apply(lang: KioskLang): Promise<void> {
    await firstValueFrom(this.translate.use(lang));
    this.current.set(lang);
    this.document.documentElement.lang = HTML_LANG[lang];
  }
}

/**
 * A string in English whatever the interface language. Words the kiosk SENDS to a model are
 * content, and content is English only (K41): a chip's own words go to the AI in English under
 * Chinese too (K148).
 */
export function englishString(key: string): string {
  const s = (en as Record<string, unknown>)[key];
  if (typeof s !== 'string') throw new Error(`[kiosk] no English string ${key}`);
  return s;
}

// No fallback language: a Chinese string missing from the table must be reported, not
// replaced by English in silence.
export function provideKioskI18n(): Provider[] {
  return [
    provideTranslateService({
      loader: provideTranslateLoader(BundledTranslateLoader),
      missingTranslationHandler: provideMissingTranslationHandler(LoudMissingStrings),
      lang: 'en',
    }),
  ];
}
