import { isFixedCombination } from './prompts';

export interface AudioRuntime {
  createClip(url: string): HTMLAudioElement;
  speech: SpeechSynthesis | undefined;
  createUtterance(text: string): SpeechSynthesisUtterance;
  hidden(): boolean;
}

/** Effects play independently; narration finishes before reading the latest prompt. */
export class GameAudio {
  private readonly single: HTMLAudioElement[];
  private readonly short: HTMLAudioElement[];
  private readonly active = new Map<HTMLAudioElement, number>();
  private serial = 0;
  private utterance: SpeechSynthesisUtterance | undefined;
  private words = '';
  private revision = 0;
  private spokenRevision = -1;
  private playing = false;
  private enabled = true;

  constructor(private readonly baseUrl: string, private readonly runtime: AudioRuntime = {
    createClip: url => new Audio(url),
    speech: 'speechSynthesis' in window ? window.speechSynthesis : undefined,
    createUtterance: text => new SpeechSynthesisUtterance(text),
    hidden: () => document.hidden,
  }) {
    this.single = Array.from({ length: 4 }, () => this.createClip('Quiz-Ding_Dong04-4(Single).mp3', .3));
    this.short = [this.createClip('Quiz-Ding_Dong04-1(Short).mp3', .4)];
    runtime.speech?.addEventListener('voiceschanged', () => this.speak());
    runtime.speech?.getVoices();
  }

  private createClip(name: string, volume: number): HTMLAudioElement {
    const clip = this.runtime.createClip(`${this.baseUrl}${name}`);
    clip.preload = 'auto';
    clip.volume = volume;
    clip.addEventListener('ended', () => this.active.delete(clip));
    clip.addEventListener('error', () => this.active.delete(clip));
    return clip;
  }

  start(words: readonly string[]): void {
    this.stop();
    this.playing = true;
    this.words = words.join(' ');
    ++this.revision;
    this.playEffect(true);
    this.speak();
  }

  letter(): void {
    if (this.playing && isFixedCombination(this.words.split(' '))) this.playEffect(false);
  }

  complete(nextWords: readonly string[]): void {
    if (!this.playing) return;
    const completedFixed = isFixedCombination(this.words.split(' '));
    this.words = nextWords.join(' ');
    ++this.revision;
    this.playEffect(completedFixed);
    this.speak();
  }

  finish(): void {
    this.stop();
    this.playEffect(true);
  }

  stop(): void {
    this.playing = false;
    this.words = '';
    this.suspend();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.suspend();
    else this.speak();
  }

  suspend(): void {
    if (this.utterance) {
      this.utterance.onend = this.utterance.onerror = null;
      this.utterance = undefined;
      this.runtime.speech?.cancel();
    }
    for (const clip of this.active.keys()) { clip.pause(); clip.currentTime = 0; }
    this.active.clear();
  }

  resume(): void { this.speak(); }

  private playEffect(short: boolean): void {
    const pool = short ? this.short : this.single;
    let clip = pool.find(item => !this.active.has(item));
    if (!clip) {
      // A success must not restart another tone that is still sounding.
      clip = this.createClip(short ? 'Quiz-Ding_Dong04-1(Short).mp3' : 'Quiz-Ding_Dong04-4(Single).mp3', short ? .4 : .3);
      pool.push(clip);
    }
    this.playClip(clip);
  }

  private playClip(clip: HTMLAudioElement): void {
    if (!this.enabled || this.runtime.hidden()) return;
    clip.currentTime = 0;
    const token = ++this.serial;
    this.active.set(clip, token);
    const failed = (): void => { if (this.active.get(clip) === token) this.active.delete(clip); };
    try {
      void clip.play().catch(failed);
    } catch { failed(); }
  }

  private speak(): void {
    if (!this.enabled || !this.playing || this.runtime.hidden() || this.spokenRevision === this.revision || this.utterance || !this.words) return;
    const speech = this.runtime.speech;
    if (!speech) return;
    const voices = speech.getVoices().filter(voice => voice.localService);
    const english = isFixedCombination(this.words.split(' '));
    const voice = english
      ? voices.find(voice => /^en(?:[-_]|$)/i.test(voice.lang) && /zira/i.test(voice.name)) ?? voices.find(voice => /^en[-_]us$/i.test(voice.lang)) ?? voices.find(voice => /^en(?:[-_]|$)/i.test(voice.lang))
      : voices.find(voice => /^ja(?:[-_]|$)/i.test(voice.lang));
    if (!english && !voices.length) return;
    const utterance = this.runtime.createUtterance(this.words);
    utterance.voice = voice ?? null;
    utterance.lang = english ? 'en-US' : 'ja-JP';
    utterance.rate = english ? .85 : 1.3;
    utterance.volume = .8;
    const revision = this.revision;
    const done = (): void => {
      if (this.utterance !== utterance) return;
      this.utterance = undefined;
      this.spokenRevision = revision;
      this.speak();
    };
    utterance.onend = done;
    utterance.onerror = done;
    this.utterance = utterance;
    try { speech.speak(utterance); } catch {
      this.utterance = undefined;
      this.spokenRevision = revision;
    }
  }
}
