import { inputText } from './phrases';
import type { Phrase, WordPools } from './phrases';
import { buildWordPools, ELECTRIC_PROMPT, generatePrompt } from './prompts';

export type Mode = 'timed' | 'practice';
export type Phase = 'ready' | 'playing' | 'finished';
export type InputOutcome = 'correct' | 'miss' | 'completed' | 'ignored' | 'finished';
export const ROUND_DURATION_MS = 60_000;

export interface GameSnapshot {
  readonly phase: Phase;
  readonly mode: Mode;
  readonly phrase: Phrase;
  readonly position: number;
  readonly score: number;
  readonly misses: number;
  readonly completed: number;
  readonly combo: number;
  readonly maxCombo: number;
  readonly accuracy: number | null;
  readonly elapsedMs: number;
  readonly remainingMs: number | null;
}

export class TypingGame {
  private phase: Phase = 'ready';
  private mode: Mode = 'timed';
  private phrase: Phrase;
  private position = 0;
  private score = 0;
  private misses = 0;
  private completed = 0;
  private combo = 0;
  private maxCombo = 0;
  private startedAt = 0;
  private elapsedMs = 0;
  private readonly pools: WordPools;

  constructor(phrases: readonly Phrase[], private readonly random: () => number = Math.random, additionalWords?: WordPools) {
    this.pools = buildWordPools(phrases, additionalWords);
    this.phrase = ELECTRIC_PROMPT;
  }

  start(mode: Mode, now: number): void {
    this.mode = mode;
    this.phase = 'playing';
    this.position = this.score = this.misses = this.completed = this.combo = this.maxCombo = 0;
    this.startedAt = now;
    this.elapsedMs = 0;
    this.phrase = ELECTRIC_PROMPT;
  }

  tick(now: number): void {
    if (this.phase !== 'playing') return;
    this.elapsedMs = Math.max(this.elapsedMs, now - this.startedAt, 0);
    if (this.mode === 'timed' && this.elapsedMs >= ROUND_DURATION_MS) {
      this.elapsedMs = ROUND_DURATION_MS;
      this.phase = 'finished';
    }
  }

  type(key: string, now: number): InputOutcome {
    this.tick(now);
    if (this.phase !== 'playing') return this.phase === 'finished' ? 'finished' : 'ignored';
    if (!/^[a-z]$/i.test(key)) return 'ignored';
    if (key.toLowerCase() !== inputText(this.phrase)[this.position]) {
      this.misses += 1;
      this.combo = 0;
      return 'miss';
    }
    this.score += 1;
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.position += 1;
    if (this.position === inputText(this.phrase).length) {
      this.completed += 1;
      this.position = 0;
      this.phrase = generatePrompt(this.completed, this.pools, this.random);
      return 'completed';
    }
    return 'correct';
  }

  finish(now: number): void {
    if (this.phase !== 'playing') return;
    this.tick(now);
    this.phase = 'finished';
  }

  snapshot(): GameSnapshot {
    const attempts = this.score + this.misses;
    return {
      phase: this.phase, mode: this.mode, phrase: this.phrase,
      position: this.position, score: this.score, misses: this.misses,
      completed: this.completed, combo: this.combo, maxCombo: this.maxCombo,
      accuracy: attempts === 0 ? null : (this.score / attempts) * 100,
      elapsedMs: this.elapsedMs,
      remainingMs: this.mode === 'timed' ? Math.max(0, ROUND_DURATION_MS - this.elapsedMs) : null,
    };
  }

}
