import en from './en.json';
import zh from './zh.json';

type Table = Record<string, string>;
const EN = en as Table;
const ZH = zh as Table;

// The approved mockup's CONTENT_KEYS (apollo-kiosk-mockup.html line 2612): content Chora
// generates, English in every language (K41). In the build it comes from the APIs, so none
// of it may sit in an interface table.
const MOCKUP_CONTENT_KEYS = [
  'draft.stem', 'critic.noteText', 'critic.okText', 'critic.note', 'critic.ok', 'step.used', 'step.wrp',
  'step.mf', 'step.ro', 'step.uv', 'step.new', 'step.ind', 'step.res', 'why.mf', 'why.ro', 'why.uv',
  'grade.q', 'grade.r1', 'grade.r2', 'grade.r3', 'grade.c1', 'grade.c2', 'grade.c3', 'crews.v.reason',
  'cx.dose.greeting_pingu', 'cx.dose.greeting_nova', 'cx.dose.greeting_ember', 'cx.dose.narrative',
  'grade.adjNote',
];

// Separators the mockup joins sentences with: a space in English, nothing in Chinese.
const SEPARATORS = new Set(['sp.sentence', 'xr.gap']);

const placeholders = (s: string): string =>
  [...s.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');

/**
 * The Chinese strings with no Chinese in them, each on purpose: the English start's own label, the
 * programme's English name (K201), product names on the diagram (K208), numbers and units, and the
 * two separators. Any other Chinese string written in English is a key the translation missed.
 */
const ZH_LEFT_IN_ENGLISH = [
  'idle.startEn', 'idle.checkingEn', 'credits.org', 'arch.lane.ai', 'arch.words.s', 'arch.files.s', 'arch.wif.s',
  'arch.build.s2', 'cx.sheet.expOf', 'cx.dose.xp', 'sp.sentence', 'xr.gap',
];
const hasChinese = (s: string): boolean => /[　-〿一-鿿＀-￯]/.test(s);
const untranslated = (table: Table): string[] => Object.keys(table).filter((k) => !hasChinese(table[k]) && !ZH_LEFT_IN_ENGLISH.includes(k));

/** K209: "laptop" in English, 笔记本 (notebook computer) in Chinese. */
const saysLaptop = (s: string): boolean => /laptop|笔记本/i.test(s);
const laptopCensus = (table: Table): string[] => Object.keys(table).filter((k) => saysLaptop(table[k]));

describe('the interface string tables (T3.2)', () => {
  it('English and Chinese hold exactly the same keys', () => {
    const enKeys = Object.keys(EN).sort();
    const zhKeys = Object.keys(ZH).sort();
    expect(zhKeys).toEqual(enKeys);
    expect(enKeys.length).toBeGreaterThan(700);
  });

  it('hold no content key: content comes from the APIs and stays English (K41)', () => {
    for (const key of MOCKUP_CONTENT_KEYS) {
      expect(EN[key], key).toBeUndefined();
      expect(ZH[key], key).toBeUndefined();
    }
  });

  it('every string is text, and only the two separators may be blank', () => {
    for (const table of [EN, ZH]) {
      for (const [key, value] of Object.entries(table)) {
        expect(typeof value, key).toBe('string');
        if (!SEPARATORS.has(key)) expect(value.trim().length, key).toBeGreaterThan(0);
      }
    }
    expect(EN['sp.sentence']).toBe(' ');
    expect(ZH['sp.sentence']).toBe('');
  });

  it('each Chinese string takes the same placeholders as its English one', () => {
    for (const key of Object.keys(EN)) expect(placeholders(ZH[key]), key).toBe(placeholders(EN[key]));
  });

  it("uses ngx-translate's {{name}} placeholders only, none of the mockup's {name} left", () => {
    for (const table of [EN, ZH]) {
      for (const [key, value] of Object.entries(table)) {
        expect(value.replace(/\{\{[a-zA-Z0-9_]+\}\}/g, ''), key).not.toMatch(/[{}]/);
      }
    }
  });

  it('has no em dash or en dash anywhere (owner style rule)', () => {
    for (const table of [EN, ZH]) {
      for (const [key, value] of Object.entries(table)) expect(value, key).not.toMatch(/[\u2013\u2014]/);
    }
  });

  it('carries the presenter panel strings under presenter.*', () => {
    expect(EN['presenter.visitsToday']).toBe('Demo sessions today (anonymous, on this computer)');
    expect(ZH['presenter.title']).toBe('演示者');
  });

  it('says "prepared", never "this morning", in the seven K101 and K112 strings', () => {
    const ruled: Record<string, [string, string]> = {
      'reset.s2': ['Putting back the prepared maps, questions and Companions', '恢复准备好的地图、题目和学习伙伴'],
      'reset.why': ['Every visitor starts from the same prepared start.', '每位访客都从同一个准备好的起点开始。'],
      'h3.bodyB': [
        'One AI wrote it for this idea when the demo was prepared, and a second AI checked it before you saw it.',
        '一个 AI 在准备演示时为这个概念写好了这道题，另一个 AI 在你看到之前先审核过。',
      ],
      'crews.replay': ['The prepared run, then this demo session', '预先准备，然后是这场演示'],
      'xr.servedNote': [
        'Written once for this idea when the demo was prepared, and kept on your map; no new model call.',
        '在准备演示时为这个概念写好一次，保存在你的地图上；无需再次调用模型。',
      ],
      'h5.notKept': [
        'You moved on without keeping, so learners still see the prepared version.',
        '你没有保留就继续了，所以学习者看到的仍是预先准备的版本。',
      ],
      'db.src.morning': ['Prepared {{when}} from the AI draft', '{{when}} 根据 AI 草稿预先备好'],
    };
    for (const [key, [e, z]] of Object.entries(ruled)) {
      expect(EN[key], key).toBe(e);
      expect(ZH[key], key).toBe(z);
    }
    for (const table of [EN, ZH]) {
      for (const [key, value] of Object.entries(table)) {
        expect(value, key).not.toMatch(/this morning|morning’s|今早|今天早上|同一个早上/);
      }
    }
  });

  it('never claims the prepared results were made on this laptop, and has no Replay state (K101, K113)', () => {
    expect(EN['stamp.prepared']).toBe('Prepared {{when}}');
    expect(ZH['stamp.prepared']).toBe('{{when}} 预先备好');
    expect(EN['cx.dose.aiGreetingBefore']).toBe('Prepared {{when}}, before you won {{focus}}');
    expect(EN['xr.drawn']).toBe('Drawn locally (Kroki, offline)');
    expect(EN['db.windowVal']).toBe('{{from}} to {{to}}');
    for (const key of ['stamp.replay', 'stamp.replayPill', 'xr.replayNote', 'hist.replayCopy', 'rev.doneReplay', 'rev.savedFrom']) {
      expect(EN[key], key).toBeUndefined();
      expect(ZH[key], key).toBeUndefined();
    }
    for (const table of [EN, ZH]) {
      for (const [key, value] of Object.entries(table)) {
        if (key.startsWith('stamp.') || key === 'cx.dose.aiGreetingBefore') expect(value, key).not.toMatch(/this laptop|this computer|这台电脑|本机/);
        expect(value, key).not.toMatch(/labelled Replay|“回放”/);
      }
    }
  });

  it('says pictures are made on Google Vertex AI, never through the Gemini API (K124)', () => {
    expect(EN['crews.gemini']).toBe('Images via Google Vertex AI');
    expect(ZH['crews.gemini']).toBe('通过 Google Vertex AI 生成图像');
    for (const table of [EN, ZH]) {
      for (const [key, value] of Object.entries(table)) expect(value, key).not.toMatch(/Gemini API/);
    }
  });

  it('translates the credits labels only; names, titles and the email are not in the tables (K17, K201)', () => {
    expect(ZH['credits.supervisor']).toBe('学术导师');
    expect(ZH['credits.chief']).toBe('课程主任');
    expect(ZH['credits.org']).toBe(EN['credits.org']);
    for (const table of [EN, ZH]) {
      for (const [key, value] of Object.entries(table)) expect(value, key).not.toMatch(/Darryl Ng|Heng Boon Kui|Dale Leung|daleleung76@gmail\.com/);
    }
  });

  it('K206: the marked-test X-ray note says the kiosk takes only the prepared papers and reads only the essay live', () => {
    expect(EN['xr.weakNoScreen']).toBe('The paper was not screened: this local edition skips the image safety check, takes only the prepared papers, and reads only the essay live.');
    expect(ZH['xr.weakNoScreen']).toBe('试卷没有经过筛查：本地版跳过图像安全检查，只接受预先备好的试卷，并且只现场阅读那篇短文。');
  });

  it('K209: no visitor-facing string says laptop (the kiosk may be a Windows PC), in either language', () => {
    expect(laptopCensus(EN)).toEqual([]);
    expect(laptopCensus(ZH)).toEqual([]);
    // Every component template too, its comments aside: a string typed into a template is visitor-facing.
    const files = import.meta.glob(['/src/app/**/*.html', '/src/app/**/*.ts', '!/src/app/**/*.spec.ts', '!/src/app/**/*.testing.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const templates = Object.entries(files).flatMap(([f, src]) =>
      f.endsWith('.html') ? [[f, src]] : [...src.matchAll(/template:\s*`([\s\S]*?)`/g)].map((m) => [f, m[1]]),
    );
    expect(templates.length).toBeGreaterThan(30);
    expect(templates.filter(([, html]) => saysLaptop(html.replace(/<!--[\s\S]*?-->/g, ''))).map(([f]) => f)).toEqual([]);
  });

  it('K209: the census finds a planted laptop (its positive control), in English and in Chinese', () => {
    expect(laptopCensus({ ...EN, 'x.planted': 'It runs on this Laptop.' })).toEqual(['x.planted']);
    expect(laptopCensus({ ...ZH, 'x.planted': '它在这台笔记本电脑上运行。' })).toEqual(['x.planted']);
    expect(saysLaptop('<p>On this laptop</p>')).toBe(true);
    expect(saysLaptop('<!-- this laptop -->'.replace(/<!--[\s\S]*?-->/g, ''))).toBe(false);
    expect(saysLaptop('<p>On this computer</p>')).toBe(false);
  });

  it('every Chinese string is in Chinese, but the few left in English on purpose (the K41 walk)', () => {
    expect(untranslated(ZH)).toEqual([]);
    // The list holds only keys still in English, so a translated key cannot hide behind it.
    expect(ZH_LEFT_IN_ENGLISH.filter((k) => hasChinese(ZH[k] ?? '中'))).toEqual([]);
  });

  it('the untranslated census finds a planted English string (its positive control), a W90 key among them', () => {
    expect(untranslated({ ...ZH, 'comp.doc.essay': 'Unit 2 essay' })).toEqual(['comp.doc.essay']);
    expect(untranslated({ ...ZH, 'live.essay': 'Read the essay with {{name}}' })).toEqual(['live.essay']);
    expect(untranslated({ ...ZH, 'comp.doc.essay': '第 2 单元短文' })).toEqual([]);
    const translated: Table = { ...ZH, 'arch.lane.ai': '人工智能' };
    expect(ZH_LEFT_IN_ENGLISH.filter((k) => hasChinese(translated[k] ?? '中'))).toEqual(['arch.lane.ai']);
  });

  it('K204, K214: each lens caption is its bold lead, the sentence separator, then the rest, exactly as approved', () => {
    const approved: Record<string, [string, string]> = {
      explore: [
        'Explore shows your whole map as it stands: every idea and how they link. Pick any idea to move it to the centre.',
        '探索展示你整张地图现在的样子：每个概念和它们之间的连线。点任何一个概念，就把它移到中间。',
      ],
      growth: [
        'Growth bookmarks your learning edges: the ideas your Companion flagged as weak spots, tinted so you can see where to explore next.',
        '成长为你标出学习边缘：学习伙伴标记为薄弱点的概念会被着色，让你看到下一步该往哪里探索。',
      ],
      mastery: [
        'Mastery shows what you have proven: every idea you have won is tinted, so you can see how much of the map is yours.',
        '掌握展示你已经证明掌握的部分：你拿下的每个概念都会着色，让你看到地图有多少已经是你的。',
      ],
    };
    const leads: Record<string, [string, string]> = { explore: ['Explore', '探索'], growth: ['Growth', '成长'], mastery: ['Mastery', '掌握'] };
    for (const [k, [e, z]] of Object.entries(approved)) {
      expect([EN[`lens.lead.${k}`], ZH[`lens.lead.${k}`]], k).toEqual(leads[k]);
      expect(EN[`lens.lead.${k}`] + EN['sp.sentence'] + EN[`lens.cap.${k}`], k).toBe(e);
      expect(ZH[`lens.lead.${k}`] + ZH['sp.sentence'] + ZH[`lens.cap.${k}`], k).toBe(z);
    }
  });

  it('K201: the team label and the project contact label, in both languages; the footnote retired', () => {
    expect([EN['credits.kicker'], ZH['credits.kicker']]).toEqual(['Project team members', '项目团队成员']);
    expect([EN['credits.contact'], ZH['credits.contact']]).toEqual(['Contact for this project', '项目联系方式']);
    expect('credits.note' in EN).toBe(false);
    expect('credits.note' in ZH).toBe(false);
    for (const table of [EN, ZH]) for (const key of Object.keys(table).filter((k) => k.startsWith('credits.'))) expect(table[key], key).not.toContain('*');
  });
});
