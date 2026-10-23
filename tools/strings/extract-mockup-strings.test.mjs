import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildTables } from './extract-mockup-strings.mjs';

const MOCKUP = {
  STR: {
    en: { 'nav.next': 'Next', 'h3.titleA': '{c} is new on your map', 'draft.stem': 'A question', 'reset.s2': 'old' },
    zh: { 'nav.next': '下一步', 'h3.titleA': '“{c}”刚加入你的地图', 'reset.s2': '旧' },
  },
  PSTR: { en: { title: 'Presenter' }, zh: { title: '演示者' } },
  CONTENT_KEYS: ['draft.stem'],
};
const RULINGS = { overrides: { 'reset.s2': { ruling: 'K112', en: 'Prepared {when}', zh: '{when} 预先备好' } } };

test('drops content keys, prefixes presenter keys, applies rulings, converts placeholders', () => {
  const t = buildTables(MOCKUP, RULINGS);
  assert.deepEqual(t.en, {
    'nav.next': 'Next',
    'h3.titleA': '{{c}} is new on your map',
    'reset.s2': 'Prepared {{when}}',
    'presenter.title': 'Presenter',
  });
  assert.equal(t.zh['reset.s2'], '{{when}} 预先备好');
  assert.equal(t.zh['h3.titleA'], '“{{c}}”刚加入你的地图');
  assert.equal('draft.stem' in t.en, false);
});

test('refuses a ruling that overrides a key the mockup does not have', () => {
  assert.throws(
    () => buildTables(MOCKUP, { overrides: { 'no.such': { ruling: 'K999', en: 'x', zh: 'y' } } }),
    /K999 overrides no\.such/,
  );
});

test('reads the talking points as talk.<key>, in both languages', () => {
  const t = buildTables({ ...MOCKUP, TALK: { idle: { en: 'Invite them in.', zh: '邀请访客。' } } }, RULINGS);
  assert.equal(t.en['talk.idle'], 'Invite them in.');
  assert.equal(t.zh['talk.idle'], '邀请访客。');
});

test('adds new keys from the additions, and refuses one the mockup already has', () => {
  const additions = { 'reset.failed': { source: 'ADR-260 D9', en: 'Chora could not get ready.', zh: 'Chora 没能准备好。' } };
  const t = buildTables(MOCKUP, { ...RULINGS, additions });
  assert.equal(t.en['reset.failed'], 'Chora could not get ready.');
  assert.equal(t.zh['reset.failed'], 'Chora 没能准备好。');
  assert.throws(
    () => buildTables(MOCKUP, { ...RULINGS, additions: { 'nav.next': { source: 'x', en: 'a', zh: 'b' } } }),
    /addition nav\.next is already in the mockup/,
  );
  assert.throws(
    () => buildTables(MOCKUP, { ...RULINGS, additions: { 'x.y': { en: 'a', zh: 'b' } } }),
    /addition x\.y names no source/,
  );
});

test('drops retired keys, and refuses to retire one the mockup does not have', () => {
  const t = buildTables(MOCKUP, { ...RULINGS, retired: { 'h3.titleA': 'K113' } });
  assert.equal('h3.titleA' in t.en, false);
  assert.equal('h3.titleA' in t.zh, false);
  assert.throws(() => buildTables(MOCKUP, { ...RULINGS, retired: { 'no.such': 'K113' } }), /retires no\.such/);
});
