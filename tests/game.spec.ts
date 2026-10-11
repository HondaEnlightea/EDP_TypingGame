import { expect, test } from '@playwright/test';

test('開始・ミス・お題の完成・結果・再プレイを一通り遊べる', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#preview-display')).toHaveText('ElectricDataProcessing');
  await expect(page.getByRole('button', { name: 'はじめる' })).toBeVisible();
  await page.screenshot({ path: 'test-results/preview-ready.png', fullPage: true });
  await page.getByRole('button', { name: 'はじめる' }).click();
  const input = page.getByRole('textbox', { name: 'タイピング入力' });
  await expect(input).toBeFocused();
  await input.press('x');
  await expect(input).toHaveValue('');
  await expect(page.getByRole('status')).toContainText('次は「e」');
  await input.pressSequentially('EGAO');
  await expect(input).toHaveValue('egao');
  await input.press('Space');
  await input.press('Backspace');
  await expect(input).toHaveValue('egao');
  await page.screenshot({ path: 'test-results/preview-playing.png', fullPage: true });
  await input.pressSequentially('DangoPan');
  await expect(page.locator('#score-value')).toHaveText('12');
  await expect(input).toHaveValue('');
  await expect(page.locator('#word-display')).not.toHaveText(/Egao.*Dango.*Pan/);
  await page.getByRole('button', { name: '終了' }).click();
  await expect(page.locator('#result-score')).toHaveText('12');
  await expect(page.locator('#result-completed')).toHaveText('1 組');
  await expect(page.locator('#result-misses')).toHaveText('1');
  await expect(page.locator('#result-accuracy')).toHaveText('92.3%');
  await page.screenshot({ path: 'test-results/preview-result.png', fullPage: true });
  const replay = page.getByRole('button', { name: 'もう一度' });
  await expect(replay).toBeFocused();
  await replay.click();
  await expect(input).toBeFocused();
  await expect(page.locator('#score-value')).toHaveText('0');
  await input.press('e');
  await expect(input).toHaveValue('e');
  expect(errors).toEqual([]);
});

test('完成の演出中も入力でき、オフと再プレイで粒子を消せる', async ({ page }) => {
  await page.addInitScript(() => {
    const random = Math.random;
    let calls = 0;
    // Make the first shuffle put a special prompt next; retain natural particle positions.
    Math.random = () => calls++ < 34 ? 24 / 35 : random();
  });
  await page.goto('/');
  await page.getByRole('radio', { name: '練習' }).check();
  await page.getByRole('button', { name: 'はじめる' }).click();
  const input = page.getByRole('textbox');
  await input.pressSequentially('EgaoDangoPan');
  expect(await page.locator('.sparkle').count()).toBeGreaterThan(0);
  await expect(page.locator('#word-display')).toHaveClass(/is-special/);
  const next = (await page.locator('#word-display').innerText()).toLowerCase();
  await input.press(next[0]!);
  await expect(page.locator('#score-value')).toHaveText('13');
  await expect.poll(() => page.locator('.sparkle').count()).toBe(0);
  await page.screenshot({ path: 'test-results/preview-special.png', fullPage: true });
  await input.pressSequentially(next.slice(1));
  expect(await page.locator('.sparkle').evaluateAll(nodes => new Set(nodes.map(node => (node as HTMLElement).style.color)).size)).toBeGreaterThan(20);
  await page.screenshot({ path: 'test-results/preview-sparkles.png', fullPage: true });
  await page.getByRole('button', { name: '演出をオフにする' }).click();
  await expect(page.locator('.sparkle')).toHaveCount(0);
  await expect(input).toBeFocused();
  await input.pressSequentially((await page.locator('#word-display').innerText()).toLowerCase());
  await expect(page.locator('.sparkle')).toHaveCount(0);
  await page.getByRole('button', { name: '演出をオンにする' }).click();
  await page.getByRole('button', { name: '終了' }).click();
  await page.getByRole('button', { name: 'もう一度' }).click();
  await expect(page.locator('.sparkle')).toHaveCount(0);
  await expect(input).toHaveValue('');
  await expect(page.locator('#score-value')).toHaveText('0');
});

test('動きを抑える設定では粒子や繰り返すアニメーションを停止する', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#preview-display .prompt-word').first()).toHaveCSS('animation-name', 'none');
  expect(await page.locator('#preview-display').evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
  await page.getByRole('button', { name: 'はじめる' }).click();
  await page.getByRole('textbox').pressSequentially('EgaoDangoPan');
  await expect(page.locator('.sparkle')).toHaveCount(0);
  await expect(page.locator('#score-value')).toHaveText('12');
  await page.getByRole('button', { name: '終了' }).click();
  await expect(page.locator('.sparkle')).toHaveCount(0);
  await expect(page.locator('#result-score')).toHaveText('12');
});

test('見本を左から一文字ずつポップし、演出オフと開始時に停止する', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const pops: string[] = [];
    (window as Window & { previewPops?: string[] }).previewPops = pops;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      if (this.matches('#preview-display .glyph')) pops.push(this.textContent ?? '');
      return animate.apply(this, args);
    };
  });
  await page.goto('/');
  await page.clock.runFor(1000);
  const pops = await page.evaluate(() => (window as Window & { previewPops?: string[] }).previewPops!);
  expect(pops.slice(0, 3)).toEqual(['E', 'l', 'e']);
  const preview = page.locator('#preview-display');
  await expect(preview).toHaveText('ElectricDataProcessing');
  await expect(preview.locator('.initial')).toHaveCount(3);
  await expect(preview.locator('.initial').first()).toHaveCSS('color', 'rgb(23, 23, 237)');
  await expect(preview.locator('.glyph:not(.initial)').first()).toHaveCSS('color', 'rgb(102, 112, 138)');
  expect(await page.locator('.preview-sparkle').count()).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/preview-pop.png', fullPage: true });
  await page.getByRole('button', { name: '演出をオフにする' }).click();
  await expect(page.locator('.sparkle')).toHaveCount(0);
  expect(await preview.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
  const disabled = await page.evaluate(() => (window as Window & { previewPops?: string[] }).previewPops!.length);
  await page.clock.runFor(1200);
  expect(await page.evaluate(() => (window as Window & { previewPops?: string[] }).previewPops!.length)).toBe(disabled);
  await page.getByRole('button', { name: '演出をオンにする' }).click();
  await page.clock.runFor(500);
  await expect(page.locator('.preview-sparkle').first()).toBeAttached();
  await page.getByRole('button', { name: 'はじめる' }).click();
  await expect(page.locator('.preview-sparkle')).toHaveCount(0);
  const stopped = await page.evaluate(() => (window as Window & { previewPops?: string[] }).previewPops!.length);
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => (window as Window & { previewPops?: string[] }).previewPops!.length)).toBe(stopped);
  await page.getByRole('button', { name: '終了' }).click();
  await page.getByRole('button', { name: 'モード変更' }).click();
  await page.clock.runFor(500);
  expect(await page.evaluate(() => (window as Window & { previewPops?: string[] }).previewPops!.at(-1))).toBe('E');
});

test('60秒で自動終了し、再プレイは新しい60秒で始まる', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: 'はじめる' }).click();
  await page.getByRole('textbox').press('e');
  await page.clock.fastForward(60_100);
  await expect(page.getByRole('heading', { name: 'タイムアップ' })).toBeVisible();
  await expect(page.locator('#result-score')).toHaveText('1');
  await expect(page.locator('#result-time')).toHaveText('60.0 秒');
  await page.getByRole('button', { name: 'もう一度' }).click();
  await expect(page.locator('#time-value')).toHaveText('60秒');
  await expect(page.getByRole('textbox')).toBeEnabled();
  await page.clock.fastForward(59_000);
  await expect(page.locator('#game-view')).toBeVisible();
  await page.clock.fastForward(1100);
  await expect(page.locator('#result-view')).toBeVisible();
});

test('練習モードに時間制限はなく、終了後にモードを選び直せる', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('radio', { name: '練習' }).check();
  await page.getByRole('button', { name: 'はじめる' }).click();
  await page.clock.fastForward(90_000);
  await expect(page.locator('#game-view')).toBeVisible();
  await expect(page.locator('#time-label')).toHaveText('経過時間');
  await page.getByRole('textbox').pressSequentially('egaoda');
  await page.getByRole('button', { name: '終了' }).click();
  await expect(page.locator('#result-score')).toHaveText('6');
  await page.getByRole('button', { name: 'もう一度' }).click();
  await expect(page.locator('#time-label')).toHaveText('経過時間');
  await page.getByRole('button', { name: '終了' }).click();
  await page.getByRole('button', { name: 'モード変更' }).click();
  await page.getByRole('radio', { name: '60秒' }).check();
  await page.getByRole('button', { name: 'はじめる' }).click();
  await expect(page.locator('#time-label')).toHaveText('残り時間');
});

test('長押し、IME、貼り付けでスコアが増えず、フォーカスを戻して続行できる', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'はじめる' }).click();
  const input = page.getByRole('textbox');
  await input.dispatchEvent('keydown', { key: 'e', repeat: true });
  await input.dispatchEvent('compositionstart', { data: '' });
  await input.dispatchEvent('keydown', { key: 'e', isComposing: true, keyCode: 229 });
  await expect(page.getByRole('status')).toContainText('日本語入力をOFF');
  await input.dispatchEvent('compositionend', { data: 'え' });
  await input.dispatchEvent('paste');
  await expect(page.getByRole('status')).toContainText('1文字ずつ');
  await expect(page.locator('#score-value')).toHaveText('0');
  await page.locator('#score-value').click();
  await expect(page.getByRole('status')).toContainText('お題をクリック');
  await input.click();
  await input.press('e');
  await expect(input).toHaveValue('e');
  await expect(page.locator('#score-value')).toHaveText('1');
});

test('入力しなかった結果は0点、正確率は未計測として表示する', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'はじめる' }).click();
  await page.getByRole('button', { name: '終了' }).click();
  await expect(page.locator('#result-score')).toHaveText('0');
  await expect(page.locator('#result-accuracy')).toHaveText('—');
  await expect(page.getByRole('heading', { name: '結果' })).toBeVisible();
});

test('外部素材への通信なしで起動し、狭い画面でも横にはみ出さない', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).hostname !== '127.0.0.1') external.push(request.url());
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'EDP', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/preview-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'はじめる' }).click();
  await page.getByRole('textbox').pressSequentially('EgaoDangoPan');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '終了' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(external).toEqual([]);
});
