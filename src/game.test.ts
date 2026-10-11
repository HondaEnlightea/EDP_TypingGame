import { describe, expect, it } from 'vitest';
import { ROUND_DURATION_MS, TypingGame } from './game';
import { inputText, parsePhrases } from './phrases';
import data from './data/phrases.json';

const phrases = parsePhrases(data);

describe('タイピングの進行と採点', () => {
  it('開始前の入力を無視し、初期のお題はEDPのジョーク名称にする', () => {
    const game = new TypingGame(phrases);
    expect(game.type('e', 0)).toBe('ignored');
    game.start('timed', 1000);
    expect(game.snapshot()).toMatchObject({ phase: 'playing', score: 0, accuracy: null, remainingMs: 60_000 });
    expect(inputText(game.snapshot().phrase)).toBe('echigodangerouspeople');
  });

  it('大文字を受け付け、ミスで進めず、正確率とコンボを計算する', () => {
    const game = new TypingGame(phrases);
    game.start('timed', 0);
    expect(game.type('E', 10)).toBe('correct');
    expect(game.type('x', 20)).toBe('miss');
    expect(game.snapshot()).toMatchObject({ score: 1, misses: 1, position: 1, combo: 0, maxCombo: 1, accuracy: 50 });
    game.type('C', 30);
    game.type('H', 40);
    expect(game.snapshot()).toMatchObject({ score: 3, misses: 1, combo: 2, maxCombo: 2, accuracy: 75 });
  });

  it('スペース・削除・記号・日本語・複数文字を採点しない', () => {
    const game = new TypingGame(phrases);
    game.start('practice', 0);
    for (const key of [' ', 'Backspace', 'Delete', '1', '-', 'え', 'echigo', 'Enter']) {
      expect(game.type(key, 1)).toBe('ignored');
    }
    expect(game.snapshot()).toMatchObject({ position: 0, score: 0, misses: 0, accuracy: null });
  });

  it('最後の文字で次のお題に進み、1巡内で重複しない', () => {
    const game = new TypingGame(phrases, () => 0.3);
    game.start('practice', 0);
    const seen = new Set<string>();
    for (let i = 0; i < phrases.length; i++) {
      const phrase = game.snapshot().phrase;
      expect(seen.has(phrase.id)).toBe(false);
      seen.add(phrase.id);
      const text = inputText(phrase);
      for (const [index, key] of [...text].entries()) {
        expect(game.type(key, 100)).toBe(index === text.length - 1 ? 'completed' : 'correct');
      }
      expect(game.snapshot().position).toBe(0);
      expect(game.snapshot().phrase.id).not.toBe(phrase.id);
    }
    expect(game.snapshot().completed).toBe(phrases.length);
  });

  it('終了直前の文字は加点し、終了時刻ちょうどの文字は加点しない', () => {
    const game = new TypingGame(phrases);
    game.start('timed', 100);
    expect(game.type('e', 100 + ROUND_DURATION_MS - 1)).toBe('correct');
    expect(game.type('c', 100 + ROUND_DURATION_MS)).toBe('finished');
    expect(game.snapshot()).toMatchObject({ phase: 'finished', score: 1, elapsedMs: 60_000, remainingMs: 0 });
    game.tick(999_999);
    expect(game.type('c', 999_999)).toBe('finished');
    expect(game.snapshot().score).toBe(1);
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
    expect(game.snapshot()).toMatchObject({ phase: 'finished', score: 1, elapsedMs: 91_000 });
  });

  it('再プレイはお題、計測、得点、ミス、コンボをすべて初期化する', () => {
    const game = new TypingGame(phrases);
    game.start('practice', 0);
    for (const key of inputText(game.snapshot().phrase)) game.type(key, 1000);
    game.type('x', 2000);
    game.finish(3000);
    game.start('timed', 4000);
    expect(game.snapshot()).toMatchObject({ phase: 'playing', mode: 'timed', score: 0, misses: 0, completed: 0, position: 0, combo: 0, maxCombo: 0, elapsedMs: 0, remainingMs: 60_000, accuracy: null });
    expect(game.snapshot().phrase.id).toBe(phrases[0]!.id);
    expect(game.type('E', 4001)).toBe('correct');
  });
});

describe('問題集の検証', () => {
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
