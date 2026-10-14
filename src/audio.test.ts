import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameAudio } from './audio';
import type { AudioRuntime } from './audio';

class Clip extends EventTarget {
  currentTime = 0;
  duration = .25;
  preload = '';
  volume = 1;
  play = vi.fn(async () => {});
  pause = vi.fn();
  constructor(readonly src: string) { super(); }
  end(): void { this.dispatchEvent(new Event('ended')); }
}

function setup() {
  const clips: Clip[] = [];
  const spoken: SpeechSynthesisUtterance[] = [];
  const speech = new EventTarget() as EventTarget & {
    getVoices: () => SpeechSynthesisVoice[];
    speak: (utterance: SpeechSynthesisUtterance) => void;
    cancel: () => void;
  };
  const voices = [
    { name: 'Remote', localService: false, lang: 'en-US', default: true },
    { name: 'Local', localService: true, lang: 'en-US', default: false },
  ] as SpeechSynthesisVoice[];
  speech.getVoices = vi.fn(() => voices);
  speech.speak = vi.fn(utterance => spoken.push(utterance));
  speech.cancel = vi.fn();
  let hidden = false;
  const runtime: AudioRuntime = {
    createClip: src => {
      const clip = new Clip(src);
      clips.push(clip);
      return clip as unknown as HTMLAudioElement;
    },
    speech: speech as unknown as SpeechSynthesis,
    createUtterance: text => ({ text } as SpeechSynthesisUtterance),
    hidden: () => hidden,
  };
  const audio = new GameAudio('/assets/', runtime);
  const short = clips.find(clip => clip.src.includes('(Short)'))!;
  const single = clips.filter(clip => clip.src.includes('(Single)'));
  return { audio, speech, spoken, clips, short, single, voices, hide: () => { hidden = true; } };
}

describe('効果音とお題の読み上げ', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('開始音の終了後に3単語をまとめて端末内の音声で読む', () => {
    const { audio, short, speech, spoken } = setup();
    audio.start(['Egao', 'Dango', 'Pan']);
    expect(short.play).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    expect(spoken).toHaveLength(0);
    short.end();
    vi.advanceTimersByTime(80);
    expect(spoken[0]?.text).toBe('Egao Dango Pan');
    expect(spoken[0]?.voice?.localService).toBe(true);
    expect(speech.speak).toHaveBeenCalledTimes(1);
  });

  it('得点は読み上げを止めて毎回発音し、連打後は最新のお題だけを読む', () => {
    const { audio, short, single, spoken, speech } = setup();
    audio.start(['Egao', 'Dango', 'Pan']);
    short.end();
    vi.advanceTimersByTime(80);
    audio.score();
    expect(speech.cancel).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 11; i++) audio.score();
    expect(single.reduce((n, clip) => n + clip.play.mock.calls.length, 0)).toBe(12);
    audio.prompt(['Ebi', 'Daikon', 'Ponzu']);
    audio.prompt(['Ehon', 'Donguri', 'Panda']);
    vi.advanceTimersByTime(100);
    expect(spoken).toHaveLength(1);
    for (const clip of single.slice(0, -1)) clip.end();
    vi.advanceTimersByTime(80);
    expect(spoken).toHaveLength(1);
    single.at(-1)!.end();
    vi.advanceTimersByTime(80);
    expect(spoken.map(item => item.text)).toEqual(['Egao Dango Pan', 'Ehon Donguri Panda']);
  });

  it('終了・再プレイ・ミュートで古い音と読み上げを取り消す', () => {
    const { audio, short, single, spoken } = setup();
    audio.start(['Egao', 'Dango', 'Pan']);
    audio.score();
    audio.finish();
    expect(short.play).toHaveBeenCalledTimes(2);
    single[0]!.end();
    short.end();
    vi.advanceTimersByTime(1000);
    expect(spoken).toHaveLength(0);
    audio.start(['Ebi', 'Daikon', 'Ponzu']);
    audio.setEnabled(false);
    audio.score();
    short.end();
    vi.advanceTimersByTime(1000);
    expect(single[1]!.play).not.toHaveBeenCalled();
    expect(spoken).toHaveLength(0);
    audio.setEnabled(true);
    vi.advanceTimersByTime(80);
    expect(spoken[0]?.text).toBe('Ebi Daikon Ponzu');
  });

  it('再生拒否でもゲームを止めず、次の再生と読み上げへ復帰する', async () => {
    const { audio, short, single, spoken } = setup();
    short.play.mockRejectedValueOnce(new Error('NotAllowedError'));
    audio.start(['Egao', 'Dango', 'Pan']);
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(80);
    expect(spoken[0]?.text).toBe('Egao Dango Pan');
    audio.score();
    expect(single[0]!.play).toHaveBeenCalledTimes(1);
  });

  it('端末内の音声が後から利用可能になったら読み、非表示では停止する', () => {
    const { audio, short, spoken, speech, voices, hide } = setup();
    const local = voices.pop()!;
    audio.start(['Egao', 'Dango', 'Pan']);
    short.end();
    vi.advanceTimersByTime(80);
    expect(spoken).toHaveLength(0);
    voices.push(local);
    speech.dispatchEvent(new Event('voiceschanged'));
    vi.advanceTimersByTime(80);
    expect(spoken).toHaveLength(1);
    hide();
    audio.suspend();
    audio.resume();
    vi.advanceTimersByTime(1000);
    expect(spoken).toHaveLength(1);
    expect(speech.cancel).toHaveBeenCalledTimes(1);
  });
});
