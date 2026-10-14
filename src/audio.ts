export interface AudioRuntime {
  createClip(url: string): HTMLAudioElement;
  speech: SpeechSynthesis | undefined;
  createUtterance(text: string): SpeechSynthesisUtterance;
  hidden(): boolean;
}

/** Effects take priority; only the latest prompt is retained for narration. */
export class GameAudio {
  private readonly single: HTMLAudioElement[];
  private readonly short: HTMLAudioElement;
  private readonly active = new Map<HTMLAudioElement, number>();
  private readonly watchdogs = new Map<HTMLAudioElement, ReturnType<typeof setTimeout>>();
  private speechTimer: ReturnType<typeof setTimeout> | undefined;
  private utterance: SpeechSynthesisUtterance | undefined;
  private words = '';
  private narrated = false;
  private playing = false;
  private enabled = true;
  private cursor = 0;
  private serial = 0;

  constructor(baseUrl: string, private readonly runtime: AudioRuntime = {
    createClip: url => new Audio(url),
    speech: 'speechSynthesis' in window ? window.speechSynthesis : undefined,
    createUtterance: text => new SpeechSynthesisUtterance(text),
    hidden: () => document.hidden,
  }) {
    this.single = Array.from({ length: 6 }, () => runtime.createClip(`${baseUrl}Quiz-Ding_Dong04-4(Single).mp3`));
    this.short = runtime.createClip(`${baseUrl}Quiz-Ding_Dong04-1(Short).mp3`);
    for (const clip of [...this.single, this.short]) {
      clip.preload = 'auto';
      clip.volume = clip === this.short ? .45 : .24;
      clip.addEventListener('ended', () => this.settle(clip, this.active.get(clip)));
      clip.addEventListener('error', () => this.settle(clip, this.active.get(clip)));
    }
    runtime.speech?.addEventListener('voiceschanged', () => this.scheduleSpeech());
  }

  start(words: readonly string[]): void {
    this.stop();
    this.playing = true;
    this.words = words.join(' ');
    this.narrated = false;
    this.playClip(this.short);
  }

  prompt(words: readonly string[]): void {
    this.cancelSpeech();
    this.words = words.join(' ');
    this.narrated = false;
    this.scheduleSpeech();
  }

  score(): void {
    if (!this.playing) return;
    this.cancelSpeech();
    const clip = this.single[this.cursor++ % this.single.length]!;
    this.playClip(clip);
  }

  finish(): void {
    this.stop();
    this.playClip(this.short);
  }

  stop(): void {
    this.playing = false;
    this.words = '';
    this.cancelSpeech();
    for (const clip of [...this.single, this.short]) {
      clip.pause();
      clip.currentTime = 0;
    }
    for (const timer of this.watchdogs.values()) clearTimeout(timer);
    this.watchdogs.clear();
    this.active.clear();
    this.cursor = 0;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.cancelSpeech();
      for (const clip of this.active.keys()) clip.pause();
      for (const timer of this.watchdogs.values()) clearTimeout(timer);
      this.watchdogs.clear();
      this.active.clear();
    } else this.scheduleSpeech();
  }

  suspend(): void {
    this.cancelSpeech();
    for (const clip of this.active.keys()) clip.pause();
    for (const timer of this.watchdogs.values()) clearTimeout(timer);
    this.watchdogs.clear();
    this.active.clear();
  }

  resume(): void { this.scheduleSpeech(); }

  private cancelSpeech(): void {
    clearTimeout(this.speechTimer);
    this.speechTimer = undefined;
    if (this.utterance) {
      this.utterance.onend = this.utterance.onerror = null;
      this.utterance = undefined;
      this.runtime.speech?.cancel();
    }
  }

  private playClip(clip: HTMLAudioElement): void {
    if (!this.enabled || this.runtime.hidden()) return;
    this.cancelSpeech();
    clearTimeout(this.watchdogs.get(clip));
    clip.pause();
    clip.currentTime = 0;
    const token = ++this.serial;
    this.active.set(clip, token);
    // Recover from media backends that never dispatch an end/error event.
    const duration = Number.isFinite(clip.duration) ? Math.min(clip.duration, 10) : 3;
    this.watchdogs.set(clip, setTimeout(() => {
      if (this.active.get(clip) !== token) return;
      clip.pause();
      this.settle(clip, token);
    }, duration * 1000 + 500));
    try {
      void clip.play().catch(() => this.settle(clip, token));
    } catch { this.settle(clip, token); }
  }

  private settle(clip: HTMLAudioElement, token: number | undefined): void {
    if (token === undefined || this.active.get(clip) !== token) return;
    this.active.delete(clip);
    clearTimeout(this.watchdogs.get(clip));
    this.watchdogs.delete(clip);
    this.scheduleSpeech();
  }

  private scheduleSpeech(): void {
    clearTimeout(this.speechTimer);
    if (!this.enabled || !this.playing || this.runtime.hidden() || this.active.size || this.narrated || this.utterance || !this.words) return;
    this.speechTimer = setTimeout(() => this.speak(), 80);
  }

  private speak(): void {
    if (!this.enabled || !this.playing || this.runtime.hidden() || this.active.size || this.narrated || this.utterance) return;
    const speech = this.runtime.speech;
    if (!speech) return;
    const voices = speech.getVoices().filter(voice => voice.localService);
    const voice = voices.find(voice => /^en[-_]/i.test(voice.lang)) ?? voices.find(voice => voice.default) ?? voices[0];
    if (!voice) return;
    const utterance = this.runtime.createUtterance(this.words);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = 1.2;
    utterance.volume = .8;
    const done = (): void => {
      if (this.utterance !== utterance) return;
      this.utterance = undefined;
      this.narrated = true;
    };
    utterance.onend = done;
    utterance.onerror = done;
    this.utterance = utterance;
    try { speech.speak(utterance); } catch { done(); }
  }
}
