import { expect, test } from '@playwright/test';

test('開始・ミス・お題の完成・結果・再プレイを一通り遊べる', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /その3文字を、\s*打ち込め。/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/preview-ready.png', fullPage: true });
  await page.getByRole('button', { name: 'タイピングを始める' }).click();
  const input = page.getByRole('textbox', { name: 'タイピング入力' });
  await expect(input).toBeFocused();
  await input.press('x');
  await expect(input).toHaveValue('');
  await expect(page.getByRole('status')).toContainText('ミス！');
  await input.pressSequentially('EGAO');
  await expect(input).toHaveValue('egao');
  await input.press('Space');
  await input.press('Backspace');
  await expect(input).toHaveValue('egao');
  await page.screenshot({ path: 'test-results/preview-playing.png', fullPage: true });
  await input.pressSequentially('DangoPan');
  await expect(page.locator('#completed-value')).toHaveText('1');
  await expect(page.locator('#score-value')).toHaveText('12');
  await expect(input).toHaveValue('');
  await expect(page.locator('#word-display')).not.toHaveText(/Egao.*Dango.*Pan/);
  await page.getByRole('button', { name: 'ここまでの結果を見る' }).click();
  await expect(page.locator('#result-score')).toHaveText('12');
  await expect(page.locator('#result-completed')).toHaveText('1 組');
  await expect(page.locator('#result-misses')).toHaveText('1');
  await expect(page.locator('#result-accuracy')).toHaveText('92.3%');
  await page.screenshot({ path: 'test-results/preview-result.png', fullPage: true });
  const replay = page.getByRole('button', { name: 'もう一度プレイ' });
  await expect(replay).toBeFocused();
  await replay.click();
  await expect(input).toBeFocused();
  await expect(page.locator('#score-value')).toHaveText('0');
  await expect(page.locator('#completed-value')).toHaveText('0');
  await expect(page.locator('#accuracy-value')).toHaveText('—');
  await input.press('e');
  await expect(input).toHaveValue('e');
  expect(errors).toEqual([]);
});

test('60秒で自動終了し、再プレイは新しい60秒で始まる', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: 'タイピングを始める' }).click();
  await page.getByRole('textbox').press('e');
  await page.clock.fastForward(60_100);
  await expect(page.getByRole('heading', { name: 'タイムアップ！' })).toBeVisible();
  await expect(page.locator('#result-score')).toHaveText('1');
  await expect(page.locator('#result-time')).toHaveText('60.0 秒');
  await page.getByRole('button', { name: 'もう一度プレイ' }).click();
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
  await page.getByRole('radio', { name: /じっくり練習/ }).check();
  await page.getByRole('button', { name: 'タイピングを始める' }).click();
  await page.clock.fastForward(90_000);
  await expect(page.locator('#game-view')).toBeVisible();
  await expect(page.locator('#time-label')).toHaveText('経過時間');
  await expect(page.locator('#time-track')).toBeHidden();
  await page.getByRole('textbox').pressSequentially('egaoda');
  await page.getByRole('button', { name: 'ここまでの結果を見る' }).click();
  await expect(page.locator('#result-score')).toHaveText('6');
  await page.getByRole('button', { name: 'もう一度プレイ' }).click();
  await expect(page.locator('#mode-label')).toHaveText('FREE PRACTICE');
  await page.getByRole('button', { name: 'ここまでの結果を見る' }).click();
  await page.getByRole('button', { name: 'モードを選ぶ' }).click();
  await page.getByRole('radio', { name: /60秒チャレンジ/ }).check();
  await page.getByRole('button', { name: 'タイピングを始める' }).click();
  await expect(page.locator('#time-label')).toHaveText('残り時間');
});

test('長押し、IME、貼り付けでスコアが増えず、フォーカスを戻して続行できる', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'タイピングを始める' }).click();
  const input = page.getByRole('textbox');
  await input.dispatchEvent('keydown', { key: 'e', repeat: true });
  await input.dispatchEvent('compositionstart', { data: '' });
  await input.dispatchEvent('keydown', { key: 'e', isComposing: true, keyCode: 229 });
  await expect(page.getByRole('status')).toContainText('日本語入力をOFF');
  await input.dispatchEvent('compositionend', { data: 'え' });
  await input.dispatchEvent('paste');
  await expect(page.getByRole('status')).toContainText('貼り付けは使えません');
  await expect(page.locator('#score-value')).toHaveText('0');
  await expect(page.locator('#accuracy-value')).toHaveText('—');
  await page.getByRole('heading', { name: 'What is EDP?' }).click();
  await expect(page.getByRole('status')).toContainText('入力欄をクリック');
  await input.click();
  await input.press('e');
  await expect(input).toHaveValue('e');
  await expect(page.locator('#score-value')).toHaveText('1');
});

test('入力しなかった結果は0点、正確率は未計測として表示する', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'タイピングを始める' }).click();
  await page.getByRole('button', { name: 'ここまでの結果を見る' }).click();
  await expect(page.locator('#result-score')).toHaveText('0');
  await expect(page.locator('#result-accuracy')).toHaveText('—');
  await expect(page.locator('#result-message')).toContainText('まずは1文字から');
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
  await page.getByRole('button', { name: 'タイピングを始める' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'ここまでの結果を見る' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(external).toEqual([]);
});
