import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../i18n/i18n';
import { provideLive } from '../live/live.providers';
import { AboutSheetComponent } from './about-sheet.component';
import { CreditsComponent } from './credits.component';
import { FrameHeaderComponent } from './frame-header.component';
import { IdleWarnComponent } from './idle-warn.component';
import { KioskStore } from './kiosk.store';
import { IdleSceneComponent } from './scenes/idle-scene.component';
import { KIOSK_TIMING } from './kiosk-timing';

function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive()] });
  return { store: TestBed.inject(KioskStore), lang: TestBed.inject(KioskLanguage) };
}

async function render<T>(type: Type<T>) {
  const f = TestBed.createComponent(type);
  await f.whenStable();
  return { f, el: f.nativeElement as HTMLElement };
}

describe('the frame header (K22, K32, K33, K25, D3)', () => {
  it('shows the wordmark, the sub-title and the three tools', async () => {
    setup();
    await TestBed.inject(KioskLanguage).ready();
    const { el } = await render(FrameHeaderComponent);
    expect(el.querySelector('.wordmark')!.textContent).toBe('CHORA');
    expect(el.querySelector('.brand-sub')!.textContent).toBe('Student project showcase · NUS-ISS');
    expect(el.querySelector('[data-act="credits"]')!.textContent).toContain('Credits');
    expect(el.querySelector('[data-act="credits"] svg')).not.toBeNull();
    expect(el.querySelector('[data-act="disclosure"]')!.textContent).toContain('About the app');
  });

  it('the Credits chip shows the credits; About the app opens its sheet', async () => {
    const { store } = setup();
    const { el } = await render(FrameHeaderComponent);
    (el.querySelector('[data-act="credits"]') as HTMLButtonElement).click();
    expect(store.creditsShown()).toBe(true);
    (el.querySelector('[data-act="disclosure"]') as HTMLButtonElement).click();
    expect(store.overlay()).toBe('disclosure');
  });

  it('EN and 中文 switch the interface, and the chosen one is marked', async () => {
    const { lang } = setup();
    await lang.ready();
    const { f, el } = await render(FrameHeaderComponent);
    (el.querySelector('[data-lang="zh"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    await f.whenStable();
    expect(lang.lang()).toBe('zh');
    expect(el.querySelector('[data-lang="zh"]')!.classList.contains('on')).toBe(true);
    expect(el.querySelector('[data-lang="en"]')!.classList.contains('on')).toBe(false);
    expect(el.querySelector('.brand-sub')!.textContent).toBe('学生项目展示 · NUS-ISS');
  });

  it('three clicks on the wordmark open the presenter panel', async () => {
    const { store } = setup();
    const { el } = await render(FrameHeaderComponent);
    const brand = el.querySelector('#brand') as HTMLElement;
    brand.click();
    brand.click();
    brand.click();
    expect(store.presenterOpen()).toBe(true);
  });
});

describe('the credits page (K16, K17, K201)', () => {
  // K201 (amends K183, K184's layout and K185): the programme line; two columns about a hairline rule,
  // the team on the left ("Project team members" over the three names stacked, K185's order) and the
  // Programme Chief over the Academic Supervisor on the right (K184's titles); then "Contact for this
  // project" over the owner's email; then how to close. No asterisk and no footnote. Only the labels
  // translate: the names, titles and the email stay in English in both languages (K17, K184).
  const text = (n: Element | null | undefined) => n?.textContent?.replace(/\s+/g, ' ').trim();
  const lines = (el: HTMLElement) => Array.from(el.querySelectorAll('.c-line'));
  const team = (el: HTMLElement) => ({
    label: text(el.querySelector('.c-cols > .c-col.team > .c-lbl')),
    names: Array.from(el.querySelectorAll('.c-cols > .c-col.team > .c-names > div')).map(text),
  });
  const faculty = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('.c-cols > .c-col.fac > .c-fac')).map((b) => ['.c-lbl', '.c-person', '.c-title'].map((c) => text(b.querySelector(c))));
  const contact = (el: HTMLElement) => ['.c-lbl', '.c-mail'].map((c) => text(el.querySelector(`.c-contact > ${c}`)));
  const NAMES = ['Dale Leung', 'Walfarid Hermawan Limbong', 'Htet Aung', 'Heng Boon Kui', 'Darryl Ng'];
  const FACULTY_EN = [
    ['Programme Chief', 'Heng Boon Kui', 'Chief, MTech Software Engineering Programme'],
    ['Academic Supervisor', 'Darryl Ng', 'Senior Lecturer & Consultant, Software Systems Practice'],
  ];

  it('reads, top to bottom: the programme, the two columns, the contact, then how to close', async () => {
    setup();
    const { el } = await render(CreditsComponent);
    expect(lines(el).map((n) => n.className.replace('c-line', '').trim())).toEqual(['c-org', 'c-cols', 'c-contact', 'c-close']);
    expect(text(lines(el)[0])).toBe('NUS-ISS · Master of Technology in Software Engineering');
    expect(text(lines(el)[3])).toBe('Click anywhere to close');
    // The team is the first column (the first read), the faculty the second, beside it.
    expect(Array.from(el.querySelector('.c-cols')!.children).map((c) => c.className)).toEqual(['c-col team', 'c-col fac']);
  });

  it('the left column: "Project team members" over Dale Leung, Walfarid Hermawan Limbong and Htet Aung, one to a line', async () => {
    setup();
    const { el } = await render(CreditsComponent);
    expect(team(el)).toEqual({ label: 'Project team members', names: ['Dale Leung', 'Walfarid Hermawan Limbong', 'Htet Aung'] });
  });

  it('the right column: the Programme Chief block above the Academic Supervisor, each its label, name, then official title', async () => {
    setup();
    const { el } = await render(CreditsComponent);
    expect(faculty(el)).toEqual(FACULTY_EN);
  });

  it('the contact: "Contact for this project" over the owner’s email', async () => {
    setup();
    const { el } = await render(CreditsComponent);
    expect(contact(el)).toEqual(['Contact for this project', 'daleleung76@gmail.com']);
  });

  it('no asterisk and no footnote: every name appears once, plain, with no mark, sup or dagger', async () => {
    setup();
    const { el } = await render(CreditsComponent);
    const all = el.textContent!;
    expect(all).not.toContain('*');
    expect(all).not.toContain('\u2020');
    expect(el.querySelector('sup, .c-ast, .c-note')).toBeNull();
    for (const name of NAMES) expect(all.split(name).length - 1, name).toBe(1);
  });

  it('one type system: the four labels share one style class, and the five names sit in the name slots', async () => {
    setup();
    const { el } = await render(CreditsComponent);
    expect(Array.from(el.querySelectorAll('.c-lbl')).map(text)).toEqual(['Project team members', 'Programme Chief', 'Academic Supervisor', 'Contact for this project']);
    expect(Array.from(el.querySelectorAll('.c-names > div, .c-person')).map(text)).toEqual(['Dale Leung', 'Walfarid Hermawan Limbong', 'Htet Aung', 'Heng Boon Kui', 'Darryl Ng']);
  });

  it('in Chinese only the labels and the close hint translate; the names, titles and email stay in English', async () => {
    const { lang } = setup();
    await lang.setLang('zh');
    const { el } = await render(CreditsComponent);
    expect(text(lines(el)[0])).toBe('NUS-ISS · Master of Technology in Software Engineering');
    expect(team(el)).toEqual({ label: '项目团队成员', names: ['Dale Leung', 'Walfarid Hermawan Limbong', 'Htet Aung'] });
    expect(faculty(el)).toEqual([
      ['课程主任', 'Heng Boon Kui', 'Chief, MTech Software Engineering Programme'],
      ['学术导师', 'Darryl Ng', 'Senior Lecturer & Consultant, Software Systems Practice'],
    ]);
    expect(contact(el)).toEqual(['项目联系方式', 'daleleung76@gmail.com']);
    expect(text(lines(el)[3])).toBe('点击任意位置关闭');
    expect(el.textContent).not.toContain('*');
  });
});

describe('"Still there?" (K18)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('counts down on the ring and in words, and "I’m still here" keeps the visit', async () => {
    const { store } = setup();
    await TestBed.inject(KioskLanguage).ready();
    store.openScene('hall');
    await vi.advanceTimersByTimeAsync(KIOSK_TIMING.idleWait.defaultMinutes * 60_000 + KIOSK_TIMING.tickMs);
    // Fake timers hold zoneless change detection's own timer, so this test drives it.
    const f = TestBed.createComponent(IdleWarnComponent);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('#ringtext')!.textContent).toBe('15');
    expect(el.querySelector('p')!.textContent).toBe('This resets in 15 seconds for the next visitor.');
    await vi.advanceTimersByTimeAsync(5000);
    f.detectChanges();
    expect(el.querySelector('#ringtext')!.textContent).toBe('10');
    const offset = Number(el.querySelector('#ringbar')!.getAttribute('stroke-dashoffset'));
    expect(offset).toBeCloseTo(2 * Math.PI * 52 * (1 - 10 / 15), 1);
    (el.querySelector('[data-act="stay"]') as HTMLButtonElement).click();
    expect(store.overlay()).toBeNull();
  });
});

describe('About the app (K33, K84, K85)', () => {
  it('compares the full platform with this demo in eleven rows, the safety screen flagged (K128, K168, K179; K172, W43)', async () => {
    const { store } = setup();
    await TestBed.inject(KioskLanguage).ready();
    store.openOverlay('disclosure');
    const { el } = await render(AboutSheetComponent);
    expect(el.querySelector('h2')!.textContent).toBe('About Chora');
    const rows = el.querySelectorAll('table.disclose tbody tr');
    expect(rows.length).toBe(11);
    // K179: the marked test is read on Ollama (a words model), Gemini on Vertex draws pictures only.
    expect(rows[1].textContent).toContain('one of them also reads the marked test papers in Companions');
    expect(rows[2].textContent).not.toContain('marked test');
    expect(rows[2].textContent).toContain('to draw pictures.');
    expect([...rows].find((r) => r.textContent?.includes('Where what you type goes'))?.textContent).toContain('Words and the marked test papers go to Ollama');
    // K128 and K168: the embedding row, right after the pictures, naming the Save that calls it.
    expect(rows[3].querySelector('td')!.textContent).toBe('AI for matching topics');
    expect(rows[3].textContent).toContain('after “Save my choices” on a marked test');
    expect(rows[4].classList.contains('flag')).toBe(true);
    expect(rows[4].textContent).toContain('Simulated on local');
    expect(el.querySelectorAll('table.disclose tr.flag').length).toBe(1);
    // K172 (W43): payments after sign-in; nothing is paid here, and mana returns with every demo session.
    expect(rows[7].querySelector('td')!.textContent).toBe('Payments');
    expect(rows[7].querySelectorAll('td')[1].textContent).toContain('Stripe');
    // The owner (K172): name Stripe, and say plainly it is not connected here; nothing reads as a working payment.
    expect(rows[7].querySelectorAll('td')[2].textContent).toBe('Stripe is not connected in this local version: nothing is paid on this computer. Mana goes back to the prepared balance after each demo session');
    expect(rows[9].textContent).toContain('Not enabled on this computer');
    (el.querySelector('[data-act="closeOverlay"]') as HTMLButtonElement).click();
    expect(store.overlay()).toBeNull();
  });
});

describe('the start screen (K1, K16, K25, K31)', () => {
  it('asks the story’s question, with a start button in each language', async () => {
    setup();
    await TestBed.inject(KioskLanguage).ready();
    const { el } = await render(IdleSceneComponent);
    expect(el.querySelector('h1')!.textContent).toBe('Where does Singapore’s water come from?');
    expect(el.querySelector('[data-act="start"][data-lang="en"]')!.textContent).toBe('Start in English');
    expect(el.querySelector('[data-act="start"][data-lang="zh"]')!.textContent).toBe('用中文开始');
    expect(el.querySelector('.clickhint')!.textContent).toContain('Click anywhere to begin');
  });

  it('用中文开始 starts the story in Chinese; a click anywhere else starts it in the language shown', async () => {
    const { store, lang } = setup();
    await lang.ready();
    const start = vi.spyOn(store, 'startStory').mockResolvedValue();
    const { el } = await render(IdleSceneComponent);
    (el.querySelector('[data-act="start"][data-lang="zh"]') as HTMLButtonElement).click();
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenLastCalledWith('zh');
    (el.querySelector('.hero h1') as HTMLElement).click();
    expect(start).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenLastCalledWith(undefined);
  });
});
