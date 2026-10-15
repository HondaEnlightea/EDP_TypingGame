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
    { name: 'Microsoft Haruka', localService: true, lang: 'ja-JP', default: false },
    { name: 'Microsoft Zira', localService: true, lang: 'en-US', default: false },
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
    const local = voices.filter(voice => voice.localService);
    voices.splice(0, voices.length, ...voices.filter(voice => !voice.localService));
    audio.start(['Egao', 'Dango', 'Pan']);
    expect(spoken).toHaveLength(0);
    voices.push(...local);
    speech.dispatchEvent(new Event('voiceschanged'));
    expect(spoken).toHaveLength(1);
    hide();
    audio.suspend();
    audio.resume();
    expect(spoken).toHaveLength(1);
    expect(speech.cancel).toHaveBeenCalledTimes(1);
  });

  it('問題集に追加する新しい3単語も、渡された文字列のまま読む', () => {
    const { audio, spoken } = setup();
    audio.start(['Emerald', 'Delta', 'Phoenix']);
    expect(spoken[0]?.text).toBe('Emerald Delta Phoenix');
    audio.complete(['Eclipse', 'Dynamo', 'Prism']);
    endReading(spoken[0]!);
    expect(spoken[1]?.text).toBe('Eclipse Dynamo Prism');
  });

  it('指定の2組は英語でZiraを優先し、通常問題は日本語に戻す', () => {
    const { audio, spoken } = setup();
    audio.start(['Electric', 'Data', 'Processing']);
    expect(spoken[0]).toMatchObject({ lang: 'en-US', rate: .85, voice: { name: 'Microsoft Zira' } });
    audio.complete(['Echigo', 'Dangerous', 'People']);
    endReading(spoken[0]!);
    expect(spoken[1]).toMatchObject({ lang: 'en-US', voice: { name: 'Microsoft Zira' } });
    audio.complete(['Egao', 'Dango', 'Pan']);
    endReading(spoken[1]!);
    expect(spoken[2]).toMatchObject({ lang: 'ja-JP', rate: 1.3, voice: { name: 'Microsoft Haruka' } });
  });

  it('英語音声が一覧になくても日本語音声を指定せずen-USで読む', () => {
    const { audio, voices, spoken } = setup();
    voices.splice(0, voices.length, ...voices.filter(voice => voice.lang === 'ja-JP'));
    audio.start(['Electric', 'Data', 'Processing']);
    expect(spoken[0]).toMatchObject({ lang: 'en-US', voice: null });
  });

  it('完成した組が対象のときだけShortを鳴らし、鳴っているShortも中断しない', () => {
    const { audio, single, clips } = setup();
    audio.start(['Electric', 'Data', 'Processing']);
    audio.complete(['Egao', 'Dango', 'Pan']);
    let shorts = clips.filter(clip => clip.src.includes('Short'));
    expect(shorts.reduce((n, clip) => n + clip.play.mock.calls.length, 0)).toBe(2);
    expect(single.every(clip => !clip.play.mock.calls.length)).toBe(true);
    audio.complete(['Echigo', 'Dangerous', 'People']);
    expect(single[0]!.play).toHaveBeenCalledTimes(1);
    audio.complete(['Electric', 'Data', 'Processing']);
    shorts = clips.filter(clip => clip.src.includes('Short'));
    expect(shorts.reduce((n, clip) => n + clip.play.mock.calls.length, 0)).toBe(3);
    expect(shorts.every(clip => !clip.pause.mock.calls.length)).toBe(true);
  });

  it.each([
    ['Electric', 'Data', 'Processing'],
    ['eChIgO', 'dAnGeRoUs', 'pEoPlE'],
  ])('指定の組 %s %s %s だけ1文字ごとにSingleを鳴らし、重なっても中断しない', (e, d, p) => {
    const { audio, clips, speech } = setup();
    audio.letter();
    expect(clips.every(clip => !clip.play.mock.calls.length)).toBe(true);
    audio.start([e, d, p]);
    for (let i = 0; i < 8; i++) audio.letter();
    const singles = clips.filter(clip => clip.src.includes('Single'));
    expect(singles).toHaveLength(8);
    expect(singles.every(clip => clip.play.mock.calls.length === 1 && !clip.pause.mock.calls.length)).toBe(true);
    expect(speech.cancel).not.toHaveBeenCalled();
    audio.complete(['Emerald', 'Delta', 'Phoenix']);
    expect(clips.filter(clip => clip.src.includes('Short')).reduce((n, clip) => n + clip.play.mock.calls.length, 0)).toBe(2);
    audio.letter();
    expect(singles.reduce((n, clip) => n + clip.play.mock.calls.length, 0)).toBe(8);
    audio.complete(['Electric', 'Data', 'Processing']);
    expect(clips.filter(clip => clip.src.includes('Single')).reduce((n, clip) => n + clip.play.mock.calls.length, 0)).toBe(9);
    audio.setEnabled(false);
    audio.letter();
    expect(clips.filter(clip => clip.src.includes('Single')).reduce((n, clip) => n + clip.play.mock.calls.length, 0)).toBe(9);
    audio.setEnabled(true);
    audio.letter();
    expect(clips.filter(clip => clip.src.includes('Single')).reduce((n, clip) => n + clip.play.mock.calls.length, 0)).toBe(10);
    audio.finish();
    audio.letter();
    expect(clips.filter(clip => clip.src.includes('Single')).reduce((n, clip) => n + clip.play.mock.calls.length, 0)).toBe(10);
  });
});
