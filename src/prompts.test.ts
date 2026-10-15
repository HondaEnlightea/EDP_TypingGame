import { describe, expect, it, vi } from 'vitest';
import { parsePhrases, parseWordPools } from './phrases';
import { buildWordPools, generatePrompt, isFixedCombination } from './prompts';
import phrasesData from './data/phrases.json';
import slotData from './data/slot-words.json';

describe('6問ループと単語抽選', () => {
  const phrases = parsePhrases(phrasesData);
  const slot = parseWordPools(slotData);
  const pools = buildWordPools(phrases, slot);

  it('スロット・既存問題・固定枠の6語をすべてプールに含める', () => {
    for (const [i, initial] of (['E', 'D', 'P'] as const).entries()) {
      for (const word of [...slot[initial], ...phrases.map(phrase => phrase.words[i]!)]) expect(pools[initial]).toContain(word);
      expect(new Set(pools[initial].map(word => word.toLowerCase())).size).toBe(pools[initial].length);
    }
    const fixedOnly = buildWordPools([]);
    expect(fixedOnly).toEqual({ E: ['Electric', 'Echigo'], D: ['Data', 'Dangerous'], P: ['Processing', 'People'] });
  });

  it('3回以上ループしても1問目と4問目だけ固定し、固定枠では抽選しない', () => {
    const random = vi.fn(() => .3);
    for (let i = 0; i < 24; i++) {
      const before = random.mock.calls.length;
      const phrase = generatePrompt(i, pools, random);
      if (i % 6 === 0) expect(phrase.words).toEqual(['Electric', 'Data', 'Processing']);
      else if (i % 6 === 3) expect(phrase.words).toEqual(['Echigo', 'Dangerous', 'People']);
      else expect(random.mock.calls.length - before).toBe(3);
      if (i % 6 === 0 || i % 6 === 3) expect(random.mock.calls.length).toBe(before);
    }
  });

  it('E・D・Pを別々の乱数で選び、登録済みの3単語の組に限定しない', () => {
    const custom = buildWordPools([{ id: 'custom', words: ['Emerald', 'Delta', 'Phoenix'], meaningJa: 'テスト', tags: [] }], {
      E: ['Engineer'], D: ['Deadline'], P: ['Panic'],
    });
    const random = vi.fn().mockReturnValueOnce(.25).mockReturnValueOnce(.99).mockReturnValueOnce(0);
    expect(generatePrompt(1, custom, random).words).toEqual(['Emerald', 'Dangerous', 'Panic']);
    expect(random).toHaveBeenCalledTimes(3);
  });

  it('重複語の大文字小文字を区別せず、固定の組が偶然そろっても再抽選しない', () => {
    const custom = buildWordPools([{ id: 'case', words: ['ELECTRIC', 'DATA', 'PROCESSING'], meaningJa: 'テスト', tags: [] }]);
    expect(custom.E.filter(word => word.toLowerCase() === 'electric')).toHaveLength(1);
    const random = vi.fn(() => .999999);
    expect(generatePrompt(1, custom, random).words).toEqual(['Echigo', 'Dangerous', 'People']);
    expect(random).toHaveBeenCalledTimes(3);
  });

  it('単語集の空リスト、頭文字違い、記号、不正な形式を拒否する', () => {
    for (const invalid of [null, { version: 2, words: slot }, { version: 1, words: { ...slot, E: [] } },
      { version: 1, words: { ...slot, D: ['People'] } }, { version: 1, words: { ...slot, P: ['P!'] } }]) {
      expect(() => parseWordPools(invalid)).toThrow();
    }
  });

  it('Enormousを除外し、同じ組にあったDragonとPowerは残す', () => {
    expect(pools.E.map(word => word.toLowerCase())).not.toContain('enormous');
    expect(pools.D).toContain('Dragon');
    expect(pools.P).toContain('Power');
  });

  it('固定位置やIDではなく3単語の組で英語とShortの対象を判定する', () => {
    expect(isFixedCombination(['Electric', 'Data', 'Processing'])).toBe(true);
    expect(isFixedCombination(['ECHIGO', 'DANGEROUS', 'PEOPLE'])).toBe(true);
    expect(isFixedCombination(['Electronic', 'Data', 'Processing'])).toBe(false);
    expect(isFixedCombination(['Electric', 'Dangerous', 'People'])).toBe(false);
    expect(isFixedCombination(['Electric', 'Data'])).toBe(false);
  });
});
