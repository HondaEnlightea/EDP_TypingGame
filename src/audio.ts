export interface AudioRuntime {
  createClip(url: string): HTMLAudioElement;
  speech: SpeechSynthesis | undefined;
  createUtterance(text: string): SpeechSynthesisUtterance;
  hidden(): boolean;
}

/** Effects play independently; narration finishes before reading the latest prompt. */
export class GameAudio {
  private readonly single: HTMLAudioElement[];
  private readonly short: HTMLAudioElement;
  private readonly active = new Map<HTMLAudioElement, number>();
  private serial = 0;
  private utterance: SpeechSynthesisUtterance | undefined;
  private narration: HTMLAudioElement | undefined;
  private narrationRevision = -1;
  private readonly recordings = new Map<string, HTMLAudioElement>();
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
  }, recordedPrompts: Readonly<Record<string, string>> = {}) {
    this.single = Array.from({ length: 4 }, () => this.createClip('Quiz-Ding_Dong04-4(Single).mp3', .3));
    this.short = this.createClip('Quiz-Ding_Dong04-1(Short).mp3', .4);
    for (const [words, file] of Object.entries(recordedPrompts)) {
      const clip = runtime.createClip(`${baseUrl}${file}`);
      // Prioritize the opening prompt rather than decoding all 36 clips at once.
      clip.preload = this.recordings.size === 0 ? 'auto' : 'none';
      clip.volume = .8;
      this.recordings.set(words, clip);
    }
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
    this.playClip(this.short);
    this.speak();
  }

  complete(nextWords: readonly string[]): void {
    if (!this.playing) return;
    this.words = nextWords.join(' ');
    ++this.revision;
    const nextNarration = this.recordings.get(this.words);
    if (nextNarration) nextNarration.preload = 'auto';
    let clip = this.single.find(item => !this.active.has(item));
    if (!clip) {
      // Never restart a sounding success tone, even during very fast completions.
      clip = this.createClip('Quiz-Ding_Dong04-4(Single).mp3', .3);
      this.single.push(clip);
    }
    this.playClip(clip);
    this.speak();
  }

  finish(): void {
    this.stop();
    this.playClip(this.short);
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
    if (this.narration) {
      this.narration.onended = this.narration.onerror = null;
      this.narration.pause();
      this.narration.currentTime = 0;
      this.narration = undefined;
    }
    if (this.utterance) {
      this.utterance.onend = this.utterance.onerror = null;
      this.utterance = undefined;
      this.runtime.speech?.cancel();
    }
    for (const clip of this.active.keys()) { clip.pause(); clip.currentTime = 0; }
    this.active.clear();
  }

  resume(): void { this.speak(); }

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

  private speak(skipRecording = false): void {
    if (!this.enabled || !this.playing || this.runtime.hidden() || this.spokenRevision === this.revision || this.utterance || this.narration || !this.words) return;
    const clip = skipRecording ? undefined : this.recordings.get(this.words);
    if (clip) {
      const revision = this.revision;
      this.narration = clip;
      this.narrationRevision = revision;
      clip.currentTime = 0;
      const done = (): void => {
        if (this.narration !== clip || this.narrationRevision !== revision) return;
        this.narration = undefined;
        clip.onended = clip.onerror = null;
        this.spokenRevision = revision;
        this.speak();
      };
      const failed = (): void => {
        if (this.narration !== clip || this.narrationRevision !== revision) return;
        this.narration = undefined;
        clip.onended = clip.onerror = null;
        clip.pause();
        this.speak(this.revision === revision);
      };
      clip.onended = done;
      clip.onerror = failed;
      try { void clip.play().catch(failed); } catch { failed(); }
      return;
    }
    const speech = this.runtime.speech;
    if (!speech) return;
    const voices = speech.getVoices().filter(voice => voice.localService);
    const voice = voices.find(voice => /^en[-_]/i.test(voice.lang)) ?? voices.find(voice => voice.default) ?? voices[0];
    if (!voice) return;
    const utterance = this.runtime.createUtterance(this.words);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = 1.3;
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
