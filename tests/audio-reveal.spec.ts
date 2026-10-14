import { expect, test } from '@playwright/test';
import narrationData from '../src/data/narration.json' with { type: 'json' };

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
  await input.pressSequentially('eg');
  await expect(input).toHaveValue('eg');
  await expect(page.locator('#word-display .current')).toHaveText('a');
  await expect(page.locator('#word-display .current.reeling')).toHaveCount(0);
  await page.clock.runFor(230);
  await expect(page.locator('#word-display .reeling')).toHaveCount(0);
  await input.pressSequentially('aodangopan');
  await expect(page.locator('#score-value')).toHaveText('12');
  await expect(input).toHaveValue('');
  expect(await page.locator('#word-display .reeling').count()).toBeGreaterThan(0);
  await page.getByRole('button', { name: '演出をオフにする' }).click();
  await expect(page.locator('#word-display .reeling')).toHaveCount(0);
  await expect(input).toBeFocused();
  await page.getByRole('button', { name: '終了' }).click();
  await page.getByRole('button', { name: 'もう一度' }).click();
  await expect(page.locator('#word-display .reeling')).toHaveCount(0);
});

test('3単語完成でSingleを鳴らし、読み上げは即時に始め、重なっても中断しない', async ({ page }) => {
  await page.addInitScript((recordings: Record<string, string>) => {
    type Entry = { kind: 'effect' | 'speech' | 'pause'; text: string; overlap?: boolean; at: number };
    const log: Entry[] = [];
    (window as Window & { audioLog?: Entry[] }).audioLog = log;
    const active = new Set<HTMLMediaElement>();
    const caption = (url: string): string | undefined => Object.entries(recordings).find(([, file]) => new URL(url).pathname.endsWith(file))?.[0];
    const originalPlay = HTMLMediaElement.prototype.play;
    const originalPause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.play = function () {
      const text = caption(this.src);
      log.push({ kind: text ? 'speech' : 'effect', text: text ?? this.src, overlap: active.size > 0, at: performance.now() });
      active.add(this);
      this.addEventListener('ended', () => active.delete(this), { once: true });
      return originalPlay.call(this).catch(error => { active.delete(this); throw error; });
    };
    HTMLMediaElement.prototype.pause = function () {
      log.push({ kind: 'pause', text: caption(this.src) ?? this.src, at: performance.now() });
      active.delete(this);
      originalPause.call(this);
    };
  }, narrationData);
  await page.goto('/');
  await page.getByRole('button', { name: 'はじめる' }).click();
  const logs = () => page.evaluate(() => (window as Window & { audioLog?: { kind: string; text: string; overlap?: boolean; at: number }[] }).audioLog!);
  await expect.poll(async () => (await logs()).some(entry => entry.kind === 'speech' && entry.text === 'Egao Dango Pan')).toBe(true);
  const opening = await logs();
  expect(opening.find(entry => entry.kind === 'speech')!.at - opening.find(entry => entry.kind === 'effect')!.at).toBeLessThan(60);
  const input = page.getByRole('textbox');
  await input.press('x');
  await input.pressSequentially('EgaoDangoPa');
  expect((await logs()).filter(entry => entry.kind === 'effect' && entry.text.includes('Single'))).toHaveLength(0);
  expect((await logs()).filter(entry => entry.kind === 'cancel')).toHaveLength(0);
  await input.press('n');
  const next = await page.locator('#word-display').getAttribute('aria-label');
  await expect.poll(async () => (await logs()).some(entry => entry.kind === 'speech' && entry.text === next)).toBe(true);
  let log = await logs();
  expect(log.filter(entry => entry.kind === 'effect' && entry.text.includes('Single'))).toHaveLength(1);
  expect(log.filter(entry => entry.kind === 'cancel')).toHaveLength(0);
  expect(log.filter(entry => entry.kind === 'pause')).toHaveLength(0);
  expect(log.some(entry => entry.overlap)).toBe(true);
  await page.getByRole('button', { name: '音をオフにする' }).click();
  await expect(input).toBeFocused();
  const effectsBefore = (await logs()).filter(entry => entry.kind === 'effect').length;
  await input.press('e');
  expect((await logs()).filter(entry => entry.kind === 'effect')).toHaveLength(effectsBefore);
  await page.getByRole('button', { name: '音をオンにする' }).click();
  await page.getByRole('button', { name: '終了' }).click();
  log = await logs();
  expect(log.filter(entry => entry.kind === 'effect' && entry.text.includes('Short'))).toHaveLength(2);
  expect(log.some(entry => entry.overlap)).toBe(true);
  await page.getByRole('button', { name: 'もう一度' }).click();
  await expect(page.locator('#score-value')).toHaveText('0');
  expect((await logs()).filter(entry => entry.kind === 'effect' && entry.text.includes('Short'))).toHaveLength(3);
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

test('36問のローカル読み上げをデコードでき、出題直後に再生が始まる', async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { narrationDelay?: number }).narrationDelay = -1;
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this.src.includes('/narration/')) {
        const requested = performance.now();
        this.addEventListener('playing', () => { (window as Window & { narrationDelay?: number }).narrationDelay = performance.now() - requested; }, { once: true });
      }
      return original.call(this);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'はじめる' }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { narrationDelay?: number }).narrationDelay ?? -1)).toBeGreaterThanOrEqual(0);
  const delay = await page.evaluate(() => (window as Window & { narrationDelay?: number }).narrationDelay!);
  // Output-device initialization varies; immediate play() ordering is checked above.
  expect(delay).toBeLessThan(1000);
  console.log(`ローカル読み上げの再生開始: ${delay.toFixed(0)}ms`);
  await page.getByRole('button', { name: '終了' }).click();
  const durations = await page.evaluate(async recordings => {
    const context = new AudioContext();
    try {
      return await Promise.all(Object.values(recordings).map(async path => {
        const response = await fetch(new URL(path, location.href));
        if (!response.ok) throw new Error(path);
        return (await context.decodeAudioData(await response.arrayBuffer())).duration;
      }));
    } finally { await context.close(); }
  }, narrationData);
  expect(durations).toHaveLength(36);
  expect(durations.every(duration => duration > .1)).toBe(true);
});
