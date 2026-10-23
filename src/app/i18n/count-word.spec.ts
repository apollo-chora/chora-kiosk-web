import { countWord } from './count-word';

// A count in running copy, spelled as the approved copy spells its numbers ("three ideas"):
// words up to twelve in both languages (Chinese counts two as 两 before a measure word), digits
// beyond, and anything that is not a whole number as written.
describe('countWord', () => {
  it('spells one to twelve in English', () => {
    expect([1, 2, 3, 6, 12].map((n) => countWord(n, 'en'))).toEqual(['one', 'two', 'three', 'six', 'twelve']);
  });

  it('spells one to twelve in Chinese, two as 两', () => {
    expect([1, 2, 3, 6, 10, 12].map((n) => countWord(n, 'zh'))).toEqual(['一', '两', '三', '六', '十', '十二']);
  });

  it('writes digits past twelve, and for zero, a fraction or a negative', () => {
    expect([13, 0, 2.5, -1].map((n) => countWord(n, 'en'))).toEqual(['13', '0', '2.5', '-1']);
    expect(countWord(20, 'zh')).toBe('20');
  });
});
