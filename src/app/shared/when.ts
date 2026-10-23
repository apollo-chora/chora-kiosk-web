import { KioskLang } from '../i18n/i18n';

/**
 * Record times on screen (ADR-259 D9 rule 1, K101, K112): "20 Oct, 14:02" in English,
 * "10月20日 14:02" in Chinese. Always Singapore time, the conductor's own day (API.md
 * section 1), whatever time zone the showroom PC happens to be set to.
 */
const ZONE = 'Asia/Singapore';

const parts = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  day: 'numeric',
  month: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const seconds = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function read(iso: string): Record<'day' | 'month' | 'hour' | 'minute', string> {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) throw new Error(`[kiosk] not a time: ${iso}`);
  const out = { day: '', month: '', hour: '', minute: '' };
  for (const p of parts.formatToParts(d)) {
    if (p.type === 'day' || p.type === 'month' || p.type === 'hour' || p.type === 'minute') out[p.type] = p.value;
  }
  return out;
}

export function formatWhen(iso: string, lang: KioskLang): string {
  const p = read(iso);
  const month = Number(p.month);
  const day = Number(p.day);
  return lang === 'zh' ? `${month}月${day}日 ${p.hour}:${p.minute}` : `${day} ${MONTHS[month - 1]}, ${p.hour}:${p.minute}`;
}

export function formatClock(iso: string): string {
  const p = read(iso);
  return `${p.hour}:${p.minute}`;
}

/** A crew stage's time to the second, "12:44:41" (the crews timeline, mockup SCENES.crews). */
export function formatClockSeconds(iso: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) throw new Error(`[kiosk] not a time: ${iso}`);
  return seconds.format(d);
}

/**
 * A calendar day the server already decided, "30 Oct 2026" or "2026 年 10 月 30 日" (mockup
 * cxToday): the dose's servedOn is consumption's own date, so no time zone is applied to it.
 */
export function formatDay(day: string, lang: KioskLang): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const month = m ? Number(m[2]) : 0;
  if (!m || month < 1 || month > 12) throw new Error(`[kiosk] not a day: ${day}`);
  const date = Number(m[3]);
  return lang === 'zh' ? `${m[1]} 年 ${month} 月 ${date} 日` : `${date} ${MONTHS[month - 1]} ${m[1]}`;
}

const dayParts = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** The Singapore calendar day of a record time, "2026-10-20" (the conductor's own day). */
export function singaporeDay(iso: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) throw new Error(`[kiosk] not a time: ${iso}`);
  return dayParts.format(d);
}
