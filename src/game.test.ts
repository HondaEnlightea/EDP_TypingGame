import { describe, expect, it } from 'vitest';
import { ROUND_DURATION_MS, TypingGame } from './game';
import { inputText, parsePhrases } from './phrases';
import data from './data/phrases.json';

const phrases = parsePhrases(data);

describe('タイピングの進行と採点', () => {
  it('開始前の入力を無視し、ElectricDataProcessingから始める', () => {
    const game = new TypingGame(phrases);
    expect(game.type('e', 0)).toBe('ignored');
    game.start('timed', 1000);
    expect(game.snapshot()).toMatchObject({ phase: 'playing', score: 0, accuracy: null, remainingMs: 60_000 });
    expect(inputText(game.snapshot().phrase)).toBe('electricdataprocessing');
  });

  it('大文字を受け付け、ミスで進めず、正確率とコンボを計算する', () => {
    const game = new TypingGame(phrases);
    game.start('timed', 0);
    expect(game.type('E', 10)).toBe('correct');
    expect(game.type('x', 20)).toBe('miss');
    expect(game.snapshot()).toMatchObject({ score: 10, misses: 1, position: 1, combo: 0, maxCombo: 1, accuracy: 50 });
    game.type('L', 30);
    game.type('E', 40);
    expect(game.snapshot()).toMatchObject({ score: 30, misses: 1, combo: 2, maxCombo: 2, accuracy: 75 });
  });

  it('スペース・削除・記号・日本語・複数文字を採点しない', () => {
    const game = new TypingGame(phrases);
    game.start('practice', 0);
    for (const key of [' ', 'Backspace', 'Delete', '1', '-', 'え', 'echigo', 'Enter']) {
      expect(game.type(key, 1)).toBe('ignored');
    }
    expect(game.snapshot()).toMatchObject({ position: 0, score: 0, misses: 0, accuracy: null });
  });

  it('最後の文字で進み、6問ごとの1問目と4問目を固定する', () => {
    const game = new TypingGame(phrases, () => 0.3);
    game.start('practice', 0);
    for (let i = 0; i < 18; i++) {
      const phrase = game.snapshot().phrase;
      if (i % 6 === 0) expect(phrase.words).toEqual(['Electric', 'Data', 'Processing']);
      else if (i % 6 === 3) expect(phrase.words).toEqual(['Echigo', 'Dangerous', 'People']);
      else expect(phrase.id).toBe(`random-${i}`);
      const text = inputText(phrase);
      for (const [index, key] of [...text].entries()) {
        expect(game.type(key, 100)).toBe(index === text.length - 1 ? 'completed' : 'correct');
      }
      expect(game.snapshot().position).toBe(0);
      expect(game.snapshot().phrase.id).not.toBe(phrase.id);
    }
    expect(game.snapshot().completed).toBe(18);
  });

  it('終了直前の文字は加点し、終了時刻ちょうどの文字は加点しない', () => {
    const game = new TypingGame(phrases);
    game.start('timed', 100);
    expect(game.type('e', 100 + ROUND_DURATION_MS - 1)).toBe('correct');
    expect(game.type('c', 100 + ROUND_DURATION_MS)).toBe('finished');
    expect(game.snapshot()).toMatchObject({ phase: 'finished', score: 10, elapsedMs: 60_000, remainingMs: 0 });
    game.tick(999_999);
    expect(game.type('c', 999_999)).toBe('finished');
    expect(game.snapshot().score).toBe(10);
  });

  it('バックグラウンドから戻っても実際の経過時間で終了する', () => {
    const game = new TypingGame(phrases);
    game.start('timed', 0);
    game.tick(120_000);
    expect(game.snapshot()).toMatchObject({ phase: 'finished', elapsedMs: 60_000, remainingMs: 0 });
  });

  it('練習は60秒を過ぎても継続し、手動終了後の集計は固定される', () => {
    const game = new TypingGame(phrases);
    game.start('practice', 1000);
    game.tick(91_000);
    expect(game.snapshot()).toMatchObject({ phase: 'playing', elapsedMs: 90_000, remainingMs: null });
    game.type('e', 91_001);
    game.finish(92_000);
    game.finish(99_000);
    expect(game.snapshot()).toMatchObject({ phase: 'finished', score: 10, elapsedMs: 91_000 });
  });

  it('再プレイはお題、計測、得点、ミス、コンボをすべて初期化する', () => {
    const game = new TypingGame(phrases);
    game.start('practice', 0);
    for (const key of inputText(game.snapshot().phrase)) game.type(key, 1000);
    game.type('x', 2000);
    game.finish(3000);
    game.start('timed', 4000);
    expect(game.snapshot()).toMatchObject({ phase: 'playing', mode: 'timed', score: 0, misses: 0, completed: 0, position: 0, combo: 0, maxCombo: 0, elapsedMs: 0, remainingMs: 60_000, accuracy: null });
    expect(inputText(game.snapshot().phrase)).toBe('electricdataprocessing');
    expect(game.type('E', 4001)).toBe('correct');
    game.type('x', 4002);
    expect(game.snapshot()).toMatchObject({ score: 10, accuracy: 50, combo: 0 });
  });

  it('指定2組は最後の文字まで10点、通常問題は1点で正確率は文字数から求める', () => {
    const normal = { id: 'normal', words: ['Emerald', 'Delta', 'Phoenix'] as const, meaningJa: '', tags: [] };
    const game = new TypingGame([normal], () => 0);
    game.start('practice', 0);
    for (const key of inputText(game.snapshot().phrase)) game.type(key, 1);
    expect(game.snapshot()).toMatchObject({ score: 220, completed: 1, accuracy: 100, combo: 22 });
    expect(game.snapshot().phrase.words).toEqual(normal.words);
    game.type('e', 2);
    game.type('x', 3);
    expect(game.snapshot().score).toBe(221);
    expect(game.snapshot().accuracy).toBeCloseTo(23 / 24 * 100);
    for (const key of inputText(normal).slice(1)) game.type(key, 4);
    for (const key of inputText(normal)) game.type(key, 5);
    expect(inputText(game.snapshot().phrase)).toBe('echigodangerouspeople');
    const before = game.snapshot().score;
    for (const key of inputText(game.snapshot().phrase)) game.type(key, 6);
    expect(game.snapshot().score - before).toBe(210);
    expect(game.snapshot().completed).toBe(4);
  });

  it('ランダム枠で指定の組み合わせが出た場合も大文字小文字を問わず10倍にする', () => {
    const words = ['eLeCtRiC', 'dAtA', 'pRoCeSsInG'] as const;
    const game = new TypingGame([{ id: 'mixed', words, meaningJa: '', tags: [] }], () => 0);
    game.start('practice', 0);
    for (const key of inputText(game.snapshot().phrase)) game.type(key, 1);
    expect(game.snapshot().phrase.id).toBe('random-1');
    expect(game.snapshot().phrase.words).toEqual(words);
    for (const key of inputText(game.snapshot().phrase)) game.type(key, 2);
    expect(game.snapshot()).toMatchObject({ score: 440, completed: 2, accuracy: 100, combo: 44 });
  });
});

describe('問題集の検証', () => {
  it('24組のローマ字問題と2つのEDP名称を収録する', () => {
    expect(phrases.filter((phrase) => phrase.tags.includes('romaji'))).toHaveLength(24);
    expect(phrases.filter((phrase) => phrase.tags.includes('special')).map(inputText)).toEqual([
      'echigodangerouspeople', 'electronicdataprocessing',
    ]);
  });
  it('同じID、順番の違う頭文字、単語数、記号、空の問題集を拒否する', () => {
    const valid = data.phrases[0]!;
    const invalid = [
      { version: 1, phrases: [] },
      { version: 2, phrases: [valid] },
      { version: 1, phrases: [valid, valid] },
      { version: 1, phrases: [{ ...valid, words: ['People', 'Dangerous', 'Echigo'] }] },
      { version: 1, phrases: [{ ...valid, words: ['Echigo', 'Dangerous'] }] },
      { version: 1, phrases: [{ ...valid, words: ['Echigo!', 'Dangerous', 'People'] }] },
      { version: 1, phrases: [{ ...valid, meaningJa: '' }] },
      { version: 1, phrases: [{ ...valid, tags: [1] }] },
    ];
    for (const value of invalid) expect(() => parsePhrases(value)).toThrow();
  });
});
