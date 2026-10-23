import type { KioskLang } from './i18n';

const WORDS: Record<KioskLang, readonly string[]> = {
  en: ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'],
  // Before a measure word (个) Chinese counts two as 两.
  zh: ['一', '两', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'],
};

/** A count in running copy as the approved copy spells numbers ("three ideas"): a word up to twelve, else digits. */
export function countWord(n: number, lang: KioskLang): string {
  return Number.isInteger(n) && n >= 1 && n <= WORDS[lang].length ? WORDS[lang][n - 1] : String(n);
}
