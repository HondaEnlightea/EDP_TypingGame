import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameAudio } from './audio';
import type { AudioRuntime } from './audio';

class Clip extends EventTarget {
  currentTime = 0;
  duration = .25;
  preload = '';
  volume = 1;
  onended: HTMLAudioElement['onended'] = null;
  onerror: HTMLAudioElement['onerror'] = null;
  play = vi.fn(async () => {});
  pause = vi.fn();
  constructor(readonly src: string) { super(); }
  end(): void {
    this.onended?.call(this as unknown as HTMLAudioElement, new Event('ended'));
    this.dispatchEvent(new Event('ended'));
  }
}

function setup(recordings: Readonly<Record<string, string>> = {}) {
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
  const audio = new GameAudio('/assets/', runtime, recordings);
  const short = clips.find(clip => clip.src.includes('(Short)'))!;
  const single = clips.filter(clip => clip.src.includes('(Single)'));
  return { audio, speech, spoken, clips, short, single, voices, hide: () => { hidden = true; } };
}

function endReading(utterance: SpeechSynthesisUtterance): void {
  utterance.onend?.call(utterance, {} as SpeechSynthesisEvent);
}

describe('効果音とお題の読み上げ', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('開始音の終了を待たずに3単語を読み始める', () => {
    const { audio, short, speech, spoken } = setup();
    audio.start(['Egao', 'Dango', 'Pan']);
    expect(short.play).toHaveBeenCalledTimes(1);
    expect(short.currentTime).toBe(0);
    expect(short.pause).not.toHaveBeenCalled();
    expect(spoken[0]?.text).toBe('Egao Dango Pan');
    expect(spoken[0]?.voice?.localService).toBe(true);
    expect(speech.speak).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(short.pause).not.toHaveBeenCalled();
  });

  it('3単語完成で成功音を鳴らし、読み上げを中断せず最新のお題へ進む', () => {
    const { audio, single, spoken, speech } = setup();
    audio.start(['Egao', 'Dango', 'Pan']);
    audio.complete(['Ebi', 'Daikon', 'Ponzu']);
    audio.complete(['Ehon', 'Donguri', 'Panda']);
    expect(single[0]!.play).toHaveBeenCalledTimes(1);
    expect(single[1]!.play).toHaveBeenCalledTimes(1);
    expect(speech.cancel).not.toHaveBeenCalled();
    expect(spoken).toHaveLength(1);
    endReading(spoken[0]!);
    expect(spoken.map(item => item.text)).toEqual(['Egao Dango Pan', 'Ehon Donguri Panda']);
    endReading(spoken[1]!);
    expect(spoken).toHaveLength(2);
  });

  it('成功音が重なっても再生中の音を切らない', () => {
    const { audio, clips, speech } = setup();
    audio.start(['Egao', 'Dango', 'Pan']);
    for (let i = 0; i < 8; i++) audio.complete(['Ebi', 'Daikon', 'Ponzu']);
    const sounding = clips.filter(clip => clip.src.includes('Single'));
    expect(sounding).toHaveLength(8);
    for (const clip of sounding) {
      expect(clip.play).toHaveBeenCalledTimes(1);
      expect(clip.pause).not.toHaveBeenCalled();
    }
    expect(speech.cancel).not.toHaveBeenCalled();
    sounding[0]!.end();
    audio.complete(['Ehon', 'Donguri', 'Panda']);
    expect(sounding[0]!.play).toHaveBeenCalledTimes(2);
  });

  it('終了・再プレイ・ミュートでは古い音と読み上げを取り消す', () => {
    const { audio, short, single, spoken, speech } = setup();
    audio.start(['Egao', 'Dango', 'Pan']);
    audio.complete(['Ebi', 'Daikon', 'Ponzu']);
    audio.finish();
    expect(short.play).toHaveBeenCalledTimes(2);
    expect(single[0]!.pause).toHaveBeenCalledTimes(1);
    expect(speech.cancel).toHaveBeenCalledTimes(1);
    endReading(spoken[0]!);
    expect(spoken).toHaveLength(1);
    audio.start(['Ebi', 'Daikon', 'Ponzu']);
    audio.setEnabled(false);
    audio.complete(['Ehon', 'Donguri', 'Panda']);
    expect(single[0]!.play).toHaveBeenCalledTimes(1);
    audio.setEnabled(true);
    expect(spoken.at(-1)?.text).toBe('Ehon Donguri Panda');
  });

  it('効果音の再生拒否が読み上げやゲームを止めない', async () => {
    const { audio, short, single, spoken } = setup();
    short.play.mockRejectedValueOnce(new Error('NotAllowedError'));
    audio.start(['Egao', 'Dango', 'Pan']);
    expect(spoken[0]?.text).toBe('Egao Dango Pan');
    await vi.advanceTimersByTimeAsync(0);
    audio.complete(['Ebi', 'Daikon', 'Ponzu']);
    expect(single[0]!.play).toHaveBeenCalledTimes(1);
  });

  it('音声が後から利用可能になったら即座に読み、非表示では停止する', () => {
    const { audio, spoken, speech, voices, hide } = setup();
    const local = voices.pop()!;
    audio.start(['Egao', 'Dango', 'Pan']);
    expect(spoken).toHaveLength(0);
    voices.push(local);
    speech.dispatchEvent(new Event('voiceschanged'));
    expect(spoken).toHaveLength(1);
    hide();
    audio.suspend();
    audio.resume();
    expect(spoken).toHaveLength(1);
    expect(speech.cancel).toHaveBeenCalledTimes(1);
  });

  it('事前生成した音声を即時再生し、終了後に最新のお題だけを読む', () => {
    const { audio, clips, spoken } = setup({
      'Egao Dango Pan': 'narration/a.wav',
      'Ebi Daikon Ponzu': 'narration/b.wav',
      'Ehon Donguri Panda': 'narration/c.wav',
    });
    const [first, second, latest] = clips.filter(clip => clip.src.includes('narration'));
    audio.start(['Egao', 'Dango', 'Pan']);
    expect(first!.play).toHaveBeenCalledTimes(1);
    expect(spoken).toHaveLength(0);
    audio.complete(['Ebi', 'Daikon', 'Ponzu']);
    audio.complete(['Ehon', 'Donguri', 'Panda']);
    expect(first!.pause).not.toHaveBeenCalled();
    expect(second!.play).not.toHaveBeenCalled();
    first!.end();
    expect(latest!.play).toHaveBeenCalledTimes(1);
    audio.finish();
    expect(latest!.pause).toHaveBeenCalledTimes(1);
    latest!.end();
    expect(latest!.play).toHaveBeenCalledTimes(1);
  });

  it('読み上げファイルの再生拒否時には端末音声に切り替える', async () => {
    const { audio, clips, spoken } = setup({ 'Egao Dango Pan': 'narration/a.wav' });
    const recorded = clips.find(clip => clip.src.includes('narration'))!;
    recorded.play.mockRejectedValueOnce(new Error('NotAllowedError'));
    audio.start(['Egao', 'Dango', 'Pan']);
    await vi.advanceTimersByTimeAsync(0);
    expect(spoken[0]?.text).toBe('Egao Dango Pan');
  });
});
