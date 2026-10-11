import { inputText } from './phrases';
import type { Phrase } from './phrases';

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
  private deck: Phrase[] = [];

  constructor(private readonly phrases: readonly Phrase[], private readonly random: () => number = Math.random) {
    const first = phrases[0];
    if (!first) throw new Error('1件以上のお題が必要です。');
    this.phrase = first;
  }

  start(mode: Mode, now: number): void {
    this.mode = mode;
    this.phase = 'playing';
    this.position = this.score = this.misses = this.completed = this.combo = this.maxCombo = 0;
    this.startedAt = now;
    this.elapsedMs = 0;
    // Start with a short romaji prompt, then shuffle the remaining phrases.
    this.phrase = this.phrases[0]!;
    this.deck = this.shuffle(this.phrases.slice(1));
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
      this.phrase = this.nextPhrase();
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

  private shuffle(source: readonly Phrase[]): Phrase[] {
    const result = [...source];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [result[i], result[j]] = [result[j]!, result[i]!];
    }
    return result;
  }

  private nextPhrase(): Phrase {
    if (this.deck.length === 0) {
      this.deck = this.shuffle(this.phrases);
      // Avoid repeating the last phrase across a deck boundary.
      if (this.deck.length > 1 && this.deck[this.deck.length - 1]?.id === this.phrase.id) {
        [this.deck[0], this.deck[this.deck.length - 1]] = [this.deck[this.deck.length - 1]!, this.deck[0]!];
      }
    }
    return this.deck.pop()!;
  }
}
