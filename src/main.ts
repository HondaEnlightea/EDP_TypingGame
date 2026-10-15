import './style.css';
import phraseData from './data/phrases.json';
import slotWordData from './data/slot-words.json';
import { TypingGame } from './game';
import type { Mode } from './game';
import { inputText, parsePhrases, parseWordPools } from './phrases';
import type { Phrase } from './phrases';
import { TypingEffects } from './effects';
import { GameAudio } from './audio';
import { isFixedCombination } from './prompts';

const phrases = parsePhrases(phraseData);
const game = new TypingGame(phrases, Math.random, parseWordPools(slotWordData));
const logoUrl = `${import.meta.env.BASE_URL}edp-logo.png`;
const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <div class="site-shell">
    <header class="site-header">
      <a class="brand" href="./" aria-label="EDP TYPE ホーム">
        <img src="${logoUrl}" alt="EDP" width="82" height="39" /><span>TYPE</span>
      </a>
      <div class="header-controls">
        <button id="effects-toggle" class="effects-toggle" type="button" aria-pressed="true" aria-label="演出をオフにする"><span aria-hidden="true">✦</span> 演出</button>
        <button id="sound-toggle" class="effects-toggle" type="button" aria-pressed="true" aria-label="音をオフにする">音</button>
      </div>
    </header>
    <main>
      <section id="ready-view" class="ready-view" aria-labelledby="intro-title">
        <h1 id="intro-title" class="sr-only">EDPタイピング</h1>
        <div class="preview-surface"><div id="preview-display" class="word-display"></div></div>
        <p class="instructions">E・D・Pの3単語をつなげて入力。</p>
        <form id="start-form" class="start-form">
          <fieldset class="mode-options">
            <legend class="sr-only">モードを選ぶ</legend>
            <label><input type="radio" name="mode" value="timed" checked><span>60秒</span></label>
            <label><input type="radio" name="mode" value="practice"><span>練習</span></label>
          </fieldset>
          <button type="submit" class="button primary">はじめる</button>
        </form>
        <details class="play-help">
          <summary>遊び方</summary>
          <ul>
            <li>半角英数で入力。大文字・小文字はどちらでも。</li>
            <li>スペース不要。ミスしても、正しい文字を打てば続きます。</li>
            <li>通常は1文字1点。ElectricDataProcessing・EchigoDangerousPeopleは1文字10点。</li>
            <li>60秒モードは開始と同時に計測。画面を離れても時間は進みます。</li>
            <li>練習モードは時間制限なし。「終了」で結果を見られます。</li>
            <li>音は画面上部で切り替え。3単語の完成時に成功音が鳴り、出題直後にお題を読みます。読み上げは端末の音声を使用します。</li>
          </ul>
        </details>
      </section>
      <section id="game-view" hidden aria-labelledby="game-title">
        <h1 id="game-title" class="sr-only">タイピング</h1>
        <div class="game-toolbar">
          <div class="timer"><span id="time-label">残り時間</span><strong id="time-value">60<small>秒</small></strong></div>
          <div class="score"><span>スコア</span><strong id="score-value">0</strong></div>
          <button id="finish-button" class="text-button">終了</button>
        </div>
        <div class="typing-panel" id="typing-panel">
          <div class="typing-surface">
            <div id="word-display" class="word-display"></div>
            <label for="typing-input" class="sr-only">タイピング入力</label>
            <input id="typing-input" class="typing-input" type="text" aria-label="タイピング入力" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="text" />
          </div>
          <p id="meaning" class="meaning"></p>
          <p id="feedback" class="feedback" role="status" aria-live="polite"></p>
        </div>
      </section>
      <section id="result-view" class="result-view" hidden aria-labelledby="result-title">
        <h1 id="result-title">結果</h1>
        <div class="result-score"><span>スコア</span><strong id="result-score">0</strong></div>
        <dl class="result-stats">
          <div><dt>正確率</dt><dd id="result-accuracy">—</dd></div>
          <div><dt>完成</dt><dd id="result-completed">0 組</dd></div>
          <div><dt>最大コンボ</dt><dd id="result-combo">0</dd></div>
        </dl>
        <div class="result-actions"><button id="replay-button" class="button primary">もう一度</button><button id="choose-mode-button" class="text-button">モード変更</button></div>
        <details class="result-details">
          <summary>詳しい結果</summary>
          <dl><div><dt>ミス</dt><dd id="result-misses">0</dd></div><div><dt>プレイ時間</dt><dd id="result-time">0.0 秒</dd></div></dl>
        </details>
      </section>
    </main>
  </div>
`;

function element<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const readyView = element('ready-view');
const gameView = element('game-view');
const resultView = element('result-view');
const startForm = element<HTMLFormElement>('start-form');
const typingInput = element<HTMLInputElement>('typing-input');
const feedback = element('feedback');
const typingPanel = element('typing-panel');
const wordDisplay = element('word-display');
const timeValue = element('time-value');
const scoreValue = element('score-value');
const replayButton = element<HTMLButtonElement>('replay-button');
const effects = new TypingEffects(element<HTMLButtonElement>('effects-toggle'));
const sound = new GameAudio(import.meta.env.BASE_URL);
let soundEnabled = true;
element('sound-toggle').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  sound.setEnabled(soundEnabled);
  element('sound-toggle').setAttribute('aria-pressed', String(soundEnabled));
  element('sound-toggle').setAttribute('aria-label', soundEnabled ? '音をオフにする' : '音をオンにする');
  if (game.snapshot().phase === 'playing') typingInput.focus();
});
element('effects-toggle').addEventListener('click', () => {
  if (game.snapshot().phase === 'playing') typingInput.focus();
});
let interval: ReturnType<typeof setInterval> | undefined;
let renderedPhrase = '';
let selectedMode: Mode = 'timed';
let composing = false;

function buildWords(container: HTMLElement, phrase: Phrase): void {
  container.replaceChildren();
  container.style.setProperty('--prompt-length', String(inputText(phrase).length));
  container.setAttribute('aria-label', phrase.words.join(' '));
  let index = 0;
  for (const word of phrase.words) {
    const group = document.createElement('span');
    group.className = 'prompt-word';
    for (const [i, char] of [...word].entries()) {
      const glyph = document.createElement('span');
      glyph.className = i === 0 ? 'glyph initial' : 'glyph';
      glyph.textContent = char;
      glyph.style.setProperty('--rainbow-hue', String(index++ * 300 / Math.max(1, inputText(phrase).length - 1)));
      group.append(glyph);
    }
    container.append(group);
  }
}

buildWords(element('preview-display'), {
  id: 'intro-preview', words: ['Electric', 'Data', 'Processing'], meaningJa: '', tags: [],
});
effects.setPreview(element('preview-display'));

function accuracyText(accuracy: number | null): string {
  return accuracy === null ? '—' : `${accuracy.toFixed(1)}%`;
}

function showView(view: HTMLElement): void {
  for (const section of [readyView, gameView, resultView]) section.hidden = section !== view;
  effects.refreshPreview();
}

function setFeedback(text = '', error = false): void {
  feedback.textContent = text;
  feedback.classList.toggle('error-text', error);
  typingPanel.classList.toggle('has-miss', error);
}

function renderPrompt(): void {
  const { phrase, position } = game.snapshot();
  const changed = renderedPhrase !== phrase.id;
  if (changed) {
    renderedPhrase = phrase.id;
    buildWords(wordDisplay, phrase);
    element('meaning').textContent = phrase.meaningJa;
    element('meaning').hidden = !phrase.meaningJa;
  }
  wordDisplay.querySelectorAll<HTMLElement>('.glyph').forEach((span, i) => {
    span.classList.toggle('typed', i < position);
    span.classList.toggle('rainbow-typed', i < position && isFixedCombination(phrase.words));
    span.classList.toggle('current', i === position);
    if (i <= position) effects.resolve(span);
  });
  if (changed) effects.reveal(wordDisplay);
  const text = inputText(phrase);
  typingInput.value = text.slice(0, position);
  typingInput.setAttribute('aria-description', `お題：${phrase.words.join(' ')}。次の文字：${text[position] ?? ''}。スペースは不要です。`);
}

function renderStats(): void {
  const state = game.snapshot();
  const seconds = state.mode === 'timed' ? Math.ceil((state.remainingMs ?? 0) / 1000) : Math.floor(state.elapsedMs / 1000);
  timeValue.innerHTML = `${seconds}<small>秒</small>`;
  timeValue.classList.toggle('time-low', state.mode === 'timed' && seconds <= 10);
  scoreValue.textContent = String(state.score);
}

function showResult(): void {
  clearInterval(interval);
  interval = undefined;
  const state = game.snapshot();
  sound.finish();
  typingInput.disabled = true;
  element('result-title').textContent = state.mode === 'timed' && state.remainingMs === 0 ? 'タイムアップ' : '結果';
  element('result-score').textContent = String(state.score);
  element('result-accuracy').textContent = accuracyText(state.accuracy);
  element('result-completed').textContent = `${state.completed} 組`;
  element('result-combo').textContent = String(state.maxCombo);
  element('result-misses').textContent = String(state.misses);
  element('result-time').textContent = `${(state.elapsedMs / 1000).toFixed(1)} 秒`;
  resultView.querySelector('details')!.open = false;
  showView(resultView);
  replayButton.focus();
  if (state.score > 0) effects.burst(element('result-score').getBoundingClientRect(), 16);
}

function start(mode: Mode): void {
  clearInterval(interval);
  selectedMode = mode;
  composing = false;
  renderedPhrase = '';
  game.start(mode, performance.now());
  typingInput.disabled = false;
  element('time-label').textContent = mode === 'timed' ? '残り時間' : '経過時間';
  setFeedback();
  showView(gameView);
  renderPrompt();
  renderStats();
  typingInput.focus();
  sound.start(game.snapshot().phrase.words);
  interval = setInterval(() => {
    game.tick(performance.now());
    if (game.snapshot().phase === 'finished') showResult();
    else renderStats();
  }, 100);
}

function acceptLetter(key: string): void {
  const previous = game.snapshot();
  const glyph = wordDisplay.querySelectorAll<HTMLElement>('.glyph')[previous.position] ?? null;
  const rect = wordDisplay.getBoundingClientRect();
  const outcome = game.type(key, performance.now());
  if (outcome === 'finished') { showResult(); return; }
  if (outcome === 'ignored') return;
  renderPrompt();
  renderStats();
  if (outcome === 'miss') {
    const state = game.snapshot();
    setFeedback(`次は「${inputText(state.phrase)[state.position]}」`, true);
  } else {
    setFeedback();
    sound.letter();
    if (outcome === 'completed') sound.complete(game.snapshot().phrase.words);
    if (outcome === 'completed') effects.burst(rect);
    else effects.letter(glyph);
  }
}

startForm.addEventListener('submit', (event) => {
  event.preventDefault();
  start(new FormData(startForm).get('mode') === 'practice' ? 'practice' : 'timed');
});
replayButton.addEventListener('click', () => start(selectedMode));
element('choose-mode-button').addEventListener('click', () => {
  sound.stop();
  showView(readyView);
  startForm.querySelector<HTMLInputElement>('input:checked')?.focus();
});
element('finish-button').addEventListener('click', () => {
  game.finish(performance.now());
  showResult();
});

typingInput.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (composing || event.isComposing || event.keyCode === 229) {
    setFeedback('日本語入力をOFFにしてください。', true);
    return;
  }
  if (event.key.length === 1 || ['Backspace', 'Delete', 'Enter'].includes(event.key)) {
    event.preventDefault();
    if (event.repeat) return;
    if (/^[a-z]$/i.test(event.key)) acceptLetter(event.key);
  }
});
// Handles single-character text input on browsers that do not emit a usable keydown.
typingInput.addEventListener('beforeinput', (event) => {
  if (composing || event.isComposing) return;
  event.preventDefault();
  if (event.inputType === 'insertText' && event.data && /^[a-z]$/i.test(event.data)) acceptLetter(event.data);
});
typingInput.addEventListener('compositionstart', () => {
  composing = true;
  setFeedback('日本語入力をOFFにしてください。', true);
});
typingInput.addEventListener('compositionend', () => { composing = false; renderPrompt(); });
typingInput.addEventListener('input', () => { if (!composing) renderPrompt(); });
typingInput.addEventListener('paste', (event) => {
  event.preventDefault();
  setFeedback('1文字ずつ入力してください。');
});
typingInput.addEventListener('drop', (event) => event.preventDefault());
typingInput.addEventListener('blur', () => {
  if (game.snapshot().phase === 'playing') setFeedback('お題をクリックして続ける');
});
typingInput.addEventListener('focus', () => {
  if (game.snapshot().phase === 'playing') setFeedback();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) sound.suspend();
  else sound.resume();
  if (game.snapshot().phase !== 'playing') return;
  game.tick(performance.now());
  if (game.snapshot().phase === 'finished') showResult();
  else renderStats();
});
window.addEventListener('pagehide', () => sound.stop());
