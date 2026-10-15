import type { Phrase, WordPools } from './phrases';

export const PROMPT_CYCLE_LENGTH = 6;
export const ELECTRIC_PROMPT: Phrase = {
  id: 'electric-data-processing', words: ['Electric', 'Data', 'Processing'],
  meaningJa: '電気・データ・処理', tags: ['edp'],
};
export const ECHIGO_PROMPT: Phrase = {
  id: 'echigo-dangerous-people', words: ['Echigo', 'Dangerous', 'People'],
  meaningJa: '越後のヤバいやつら。', tags: ['edp'],
};

export function isFixedCombination(words: readonly string[]): boolean {
  return words.length === 3 && [ELECTRIC_PROMPT, ECHIGO_PROMPT].some(phrase =>
    words.every((word, i) => word.toLowerCase() === phrase.words[i]!.toLowerCase()));
}

export function buildWordPools(phrases: readonly Phrase[], additional?: WordPools): WordPools {
  const result: { E: string[]; D: string[]; P: string[] } = { E: [], D: [], P: [] };
  for (const [index, initial] of (['E', 'D', 'P'] as const).entries()) {
    const unique = new Map<string, string>();
    for (const word of [...(additional?.[initial] ?? []), ...phrases.map(phrase => phrase.words[index]!), ELECTRIC_PROMPT.words[index]!, ECHIGO_PROMPT.words[index]!]) {
      if (!unique.has(word.toLowerCase())) unique.set(word.toLowerCase(), word);
    }
    if (!unique.size) throw new Error(`${initial}の抽選用の単語が必要です。`);
    result[initial] = [...unique.values()];
  }
  return result;
}

export function generatePrompt(completed: number, pools: WordPools, random: () => number): Phrase {
  const slot = completed % PROMPT_CYCLE_LENGTH;
  if (slot === 0) return ELECTRIC_PROMPT;
  if (slot === 3) return ECHIGO_PROMPT;
  const pick = (words: readonly string[]): string => words[Math.floor(random() * words.length)]!;
  return {
    id: `random-${completed}`,
    words: [pick(pools.E), pick(pools.D), pick(pools.P)],
    meaningJa: '', tags: [],
  };
}
