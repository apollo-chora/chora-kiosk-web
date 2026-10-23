import { formatClock, formatClockSeconds, formatDay, formatWhen, singaporeDay } from './when';

describe('formatWhen: a record’s own time, as K112 writes it', () => {
  it('reads "20 Oct, 14:02" in English and "10月20日 14:02" in Chinese, in Singapore time', () => {
    // 06:02 UTC is 14:02 in Singapore (UTC+8).
    expect(formatWhen('2026-10-20T06:02:11Z', 'en')).toBe('20 Oct, 14:02');
    expect(formatWhen('2026-10-20T06:02:11Z', 'zh')).toBe('10月20日 14:02');
  });

  it('crosses midnight by Singapore’s calendar, not the PC’s', () => {
    expect(formatWhen('2026-10-20T16:30:00Z', 'en')).toBe('21 Oct, 00:30');
    expect(formatWhen('2026-10-20T16:30:00Z', 'zh')).toBe('10月21日 00:30');
  });

  it('formats the clock alone for "the opening check at 09:00"', () => {
    expect(formatClock('2026-10-20T01:00:04Z')).toBe('09:00');
  });

  it('formats a crew stage to the second, as the crews timeline shows it (mockup SCENES.crews)', () => {
    // The orchestrator writes microseconds and an offset; draft.h4's writer finished at 04:44:41 UTC.
    expect(formatClockSeconds('2026-10-18T04:44:41.667059+00:00')).toBe('12:44:41');
    expect(formatClockSeconds('2026-10-20T16:00:04Z')).toBe('00:00:04');
  });

  it('refuses a time it cannot read, rather than printing "Invalid Date"', () => {
    expect(() => formatWhen('yesterday', 'en')).toThrow(/not a time: yesterday/);
    expect(() => formatClock('')).toThrow(/not a time/);
    expect(() => formatClockSeconds('soon')).toThrow(/not a time: soon/);
  });
});

describe('formatDay: the dose’s served day (a calendar date, no time zone to apply)', () => {
  it('reads "30 Oct 2026" in English and "2026 年 10 月 30 日" in Chinese (mockup cxToday)', () => {
    expect(formatDay('2026-10-30', 'en')).toBe('30 Oct 2026');
    expect(formatDay('2026-10-30', 'zh')).toBe('2026 年 10 月 30 日');
  });

  it('refuses anything but YYYY-MM-DD', () => {
    expect(() => formatDay('2026-10-30T00:00:00Z', 'en')).toThrow(/not a day/);
    expect(() => formatDay('', 'en')).toThrow(/not a day/);
    expect(() => formatDay('2026-13-01', 'en')).toThrow(/not a day/);
  });
});

describe('singaporeDay', () => {
  it('names the calendar day in Singapore, whatever the machine’s zone', () => {
    expect(singaporeDay('2026-10-20T15:59:00Z')).toBe('2026-10-20');
    expect(singaporeDay('2026-10-20T16:01:00Z')).toBe('2026-10-21');
  });
});
