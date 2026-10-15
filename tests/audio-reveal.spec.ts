import { expect, test } from '@playwright/test';

test('EDPを固定し、短い切り替え中にも入力できる', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-14T00:00:00Z') });
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-10-14T00:01:00Z'));
  await page.getByRole('button', { name: 'はじめる' }).click();
  await expect(page.locator('#word-display .initial')).toHaveText(['E', 'D', 'P']);
  await expect(page.locator('#word-display .initial.reeling')).toHaveCount(0);
  expect(await page.locator('#word-display .reeling').count()).toBeGreaterThan(0);
  const rolling = page.locator('#word-display .reeling').last();
  const firstSymbol = await rolling.locator('.reel-cell').last().getAttribute('data-symbol');
  await page.clock.runFor(80);
  expect(await rolling.locator('.reel-cell').last().getAttribute('data-symbol')).not.toBe(firstSymbol);
  expect(await rolling.locator('.reel-strip').evaluate(el => el.getAnimations().length)).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/preview-reel.png', fullPage: true });
  const input = page.getByRole('textbox');
  await input.pressSequentially('el');
  await expect(input).toHaveValue('el');
  await expect(page.locator('#word-display .current')).toHaveText('e');
  await expect(page.locator('#word-display .current.reeling')).toHaveCount(0);
  await page.clock.runFor(230);
  await expect(page.locator('#word-display .reeling')).toHaveCount(0);
  await input.pressSequentially('ectricdataprocessing');
  await expect(page.locator('#score-value')).toHaveText('22');
  await expect(input).toHaveValue('');
  expect(await page.locator('#word-display .reeling').count()).toBeGreaterThan(0);
  await page.getByRole('button', { name: '演出をオフにする' }).click();
  await expect(page.locator('#word-display .reeling')).toHaveCount(0);
  await expect(input).toBeFocused();
  await page.getByRole('button', { name: '終了' }).click();
  await page.getByRole('button', { name: 'もう一度' }).click();
  await expect(page.locator('#word-display .reeling')).toHaveCount(0);
});

test('指定の2組は英語とShort、通常は日本語とSingleに切り替え、音を中断しない', async ({ page }) => {
  await page.addInitScript(() => {
    type Entry = { kind: 'effect' | 'speech' | 'cancel' | 'pause'; text: string; overlap?: boolean; at: number; lang?: string; voice?: string | null };
    const log: Entry[] = [];
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: class {
      voice = null;
      lang = '';
      rate = 1;
      volume = 1;
      onend = null;
      onerror = null;
      constructor(readonly text: string) {}
    } });
    (window as Window & { audioLog?: Entry[] }).audioLog = log;
    const active = new Set<HTMLMediaElement>();
    let talking = false;
    let utterance: SpeechSynthesisUtterance | undefined;
    const originalPlay = HTMLMediaElement.prototype.play;
    const originalPause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.play = function () {
      log.push({ kind: 'effect', text: this.src, overlap: talking, at: performance.now() });
      active.add(this);
      this.addEventListener('ended', () => active.delete(this), { once: true });
      return originalPlay.call(this).catch(error => { active.delete(this); throw error; });
    };
    HTMLMediaElement.prototype.pause = function () {
      log.push({ kind: 'pause', text: this.src, at: performance.now() });
      active.delete(this);
      originalPause.call(this);
    };
    Object.defineProperty(window, 'speechSynthesis', { value: {
      getVoices: () => [
        { lang: 'en-US', localService: true, default: true, name: 'Test English' },
        { lang: 'ja-JP', localService: true, default: false, name: 'Test Japanese' },
        { lang: 'en-US', localService: true, default: false, name: 'Microsoft Zira' },
      ],
      addEventListener: () => {},
      speak: (next: SpeechSynthesisUtterance) => {
        talking = true;
        utterance = next;
        log.push({ kind: 'speech', text: next.text, overlap: active.size > 0, at: performance.now(), lang: next.lang, voice: next.voice?.name ?? null });
        setTimeout(() => {
          if (utterance !== next) return;
          talking = false;
          utterance = undefined;
          next.onend?.call(next, {} as SpeechSynthesisEvent);
        }, 500);
      },
      cancel: () => {
        talking = false;
        log.push({ kind: 'cancel', text: utterance?.text ?? '', at: performance.now() });
        utterance = undefined;
      },
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'はじめる' }).click();
  const logs = () => page.evaluate(() => (window as Window & { audioLog?: { kind: string; text: string; overlap?: boolean; at: number; lang?: string; voice?: string | null }[] }).audioLog!);
  await expect.poll(async () => (await logs()).some(entry => entry.kind === 'speech' && entry.text === 'Electric Data Processing')).toBe(true);
  const opening = await logs();
  expect(opening.find(entry => entry.kind === 'speech')).toMatchObject({ lang: 'en-US', voice: 'Microsoft Zira' });
  expect(opening.find(entry => entry.kind === 'speech')!.at - opening.find(entry => entry.kind === 'effect')!.at).toBeLessThan(60);
  const input = page.getByRole('textbox');
  await input.press('x');
  await input.pressSequentially('ElectricDataProcessin');
  expect((await logs()).filter(entry => entry.kind === 'effect' && entry.text.includes('Single'))).toHaveLength(0);
  expect((await logs()).filter(entry => entry.kind === 'cancel')).toHaveLength(0);
  await input.press('g');
  const next = await page.locator('#word-display').getAttribute('aria-label');
  await expect.poll(async () => (await logs()).some(entry => entry.kind === 'speech' && entry.text === next)).toBe(true);
  let log = await logs();
  expect(log.filter(entry => entry.kind === 'effect' && entry.text.includes('Single'))).toHaveLength(0);
  expect(log.filter(entry => entry.kind === 'effect' && entry.text.includes('Short'))).toHaveLength(2);
  const nextEnglish = ['Electric Data Processing', 'Echigo Dangerous People'].includes(next!);
  expect(log.filter(entry => entry.kind === 'speech').at(-1)).toMatchObject({ lang: nextEnglish ? 'en-US' : 'ja-JP', voice: nextEnglish ? 'Microsoft Zira' : 'Test Japanese' });
  expect(log.filter(entry => entry.kind === 'cancel')).toHaveLength(0);
  expect(log.filter(entry => entry.kind === 'pause')).toHaveLength(0);
  expect(log.some(entry => entry.overlap)).toBe(true);
  await page.getByRole('button', { name: '音をオフにする' }).click();
  await expect(input).toBeFocused();
  const effectsBefore = (await logs()).filter(entry => entry.kind === 'effect').length;
  await input.press('e');
  expect((await logs()).filter(entry => entry.kind === 'effect')).toHaveLength(effectsBefore);
  await page.getByRole('button', { name: '音をオンにする' }).click();
  await input.pressSequentially(next!.replaceAll(' ', '').slice(1));
  log = await logs();
  expect(log.filter(entry => entry.kind === 'effect').at(-1)?.text).toContain(nextEnglish ? 'Short' : 'Single');
  await page.getByRole('button', { name: '終了' }).click();
  log = await logs();
  expect(log.filter(entry => entry.kind === 'effect' && entry.text.includes('Short'))).toHaveLength(nextEnglish ? 4 : 3);
  expect(log.some(entry => entry.overlap)).toBe(true);
  await page.getByRole('button', { name: 'もう一度' }).click();
  await expect(page.locator('#score-value')).toHaveText('0');
  expect((await logs()).filter(entry => entry.kind === 'effect' && entry.text.includes('Short'))).toHaveLength(nextEnglish ? 5 : 4);
});

test('配置された2つのMP3をブラウザで実際にデコードできる', async ({ page }) => {
  await page.goto('/');
  const durations = await page.evaluate(async () => {
    const context = new AudioContext();
    try {
      return await Promise.all(['Quiz-Ding_Dong04-4(Single).mp3', 'Quiz-Ding_Dong04-1(Short).mp3'].map(async name => {
        const response = await fetch(new URL(name, location.href));
        if (!response.ok) throw new Error(`${name}: ${response.status}`);
        return (await context.decodeAudioData(await response.arrayBuffer())).duration;
      }));
    } finally { await context.close(); }
  });
  for (const duration of durations) expect(duration).toBeGreaterThan(0);
  console.log(`MP3の長さ: Single=${durations[0]?.toFixed(3)}秒 / Short=${durations[1]?.toFixed(3)}秒`);
});
