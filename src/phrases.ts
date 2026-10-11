export interface Phrase {
  readonly id: string;
  readonly words: readonly [string, string, string];
  readonly meaningJa: string;
  readonly tags: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parsePhrases(value: unknown): readonly Phrase[] {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.phrases) || value.phrases.length === 0) {
    throw new Error('問題集の形式を確認してください。version: 1 と1件以上のお題が必要です。');
  }
  const ids = new Set<string>();
  return value.phrases.map((row: unknown) => {
    if (!isRecord(row) || typeof row.id !== 'string' || row.id.trim() === '' || ids.has(row.id)) {
      throw new Error('お題には重複しないIDが必要です。');
    }
    if (!Array.isArray(row.words) || row.words.length !== 3 || !row.words.every((word: unknown, i: number) =>
      typeof word === 'string' && /^[a-z]+$/i.test(word) && word[0]?.toUpperCase() === ['E', 'D', 'P'][i])) {
      throw new Error(`${row.id}: E・D・Pの順に始まる英字の3単語を指定してください。`);
    }
    if (typeof row.meaningJa !== 'string' || row.meaningJa.trim() === '' || !Array.isArray(row.tags) ||
      !row.tags.every((tag: unknown) => typeof tag === 'string')) {
      throw new Error(`${row.id}: 説明文とタグを確認してください。`);
    }
    ids.add(row.id);
    return {
      id: row.id,
      words: [...row.words] as [string, string, string],
      meaningJa: row.meaningJa,
      tags: [...row.tags] as string[],
    };
  });
}

export function inputText(phrase: Phrase): string {
  return phrase.words.join('').toLowerCase();
}
