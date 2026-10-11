import './style.css';
import phraseData from './data/phrases.json';
import { TypingGame, ROUND_DURATION_MS } from './game';
import type { Mode } from './game';
import { inputText, parsePhrases } from './phrases';

const phrases = parsePhrases(phraseData);
const game = new TypingGame(phrases);
const logoUrl = `${import.meta.env.BASE_URL}edp-logo.png`;
const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <div class="site-shell">
    <header class="site-header">
      <a class="brand" href="./" aria-label="EDP TYPE ホーム">
        <img src="${logoUrl}" alt="EDP" width="98" height="47" />
        <span class="brand-divider"></span><span class="brand-type">TYPE<span>タイピングゲーム</span></span>
      </a>
      <span class="edition"><span class="status-dot"></span> PROTOTYPE <span class="edition-number">/ 01</span></span>
    </header>

    <main>
      <section id="ready-view" aria-labelledby="intro-title">
        <div class="intro-heading"><span class="eyebrow">THREE WORDS. ONE EDP.</span><span class="mini-label">新潟大学コンピュータクラブ</span></div>
        <div class="intro-grid">
          <div class="intro-copy">
            <h1 id="intro-title">その3文字を、<br><span>打ち込め。</span></h1>
            <p class="intro-description">E・D・Pから始まる、3つの単語。<br>あなたの指で、EDPの新しい意味を見つけよう。</p>
            <div class="initial-art" aria-hidden="true"><span>E<small>01</small></span><span>D<small>02</small></span><span>P<small>03</small></span></div>
          </div>
          <form id="start-form" class="launch-panel">
            <div class="panel-heading"><span class="eyebrow">SELECT MODE</span><span class="panel-marker">＋</span></div>
            <fieldset class="mode-options">
              <legend>遊び方を選ぶ</legend>
              <label class="mode-option"><input type="radio" name="mode" value="timed" checked><span class="mode-copy"><strong>60秒チャレンジ</strong><span>制限時間内に、どこまで打てる？</span></span><span class="mode-badge">60s</span></label>
              <label class="mode-option"><input type="radio" name="mode" value="practice"><span class="mode-copy"><strong>じっくり練習</strong><span>時間制限なし。自分のペースで。</span></span><span class="mode-badge">∞</span></label>
            </fieldset>
            <button type="submit" class="button primary launch-button">タイピングを始める <span aria-hidden="true">↗</span></button>
            <p class="launch-note">物理キーボード・半角英数でプレイ</p>
          </form>
        </div>
        <ol class="rules">
          <li><span class="rule-index">01</span><div><strong>3単語をつなげて入力</strong><p>スペース不要。大文字・小文字はどちらでも。</p></div></li>
          <li><span class="rule-index">02</span><div><strong>ミスしても、そのまま続けよう</strong><p>打ち直し不要。次の正しい文字で進めます。</p></div></li>
          <li><span class="rule-index">03</span><div><strong>正しく打った文字がスコアに</strong><p>コンボをつないで、スコアを伸ばそう。</p></div></li>
        </ol>
      </section>

      <section id="game-view" hidden aria-labelledby="game-title">
        <div class="section-heading"><div><span class="eyebrow" id="mode-label">60 SECOND CHALLENGE</span><h1 id="game-title">What is EDP?</h1></div><button id="finish-button" class="button secondary">ここまでの結果を見る</button></div>
        <div class="live-stats">
          <div class="live-stat time-stat"><span id="time-label">残り時間</span><strong id="time-value">60<small>秒</small></strong></div>
          <div class="live-stat"><span>スコア</span><strong id="score-value">0</strong></div>
          <div class="live-stat"><span>正確率</span><strong id="accuracy-value">—</strong></div>
          <div class="live-stat"><span>コンボ</span><strong id="combo-value">0</strong></div>
        </div>
        <div id="time-track" class="time-track" role="progressbar" aria-label="残り時間" aria-valuemin="0" aria-valuemax="60" aria-valuenow="60"><div id="time-fill"></div></div>
        <div class="typing-panel" id="typing-panel">
          <div class="prompt-heading"><span class="eyebrow">TYPE THESE WORDS</span><span id="phrase-badge" class="phrase-badge">EDP SPECIAL</span></div>
          <div id="word-display" class="word-display" aria-label="出題された3単語"></div>
          <p id="meaning" class="meaning"></p>
          <div class="input-zone">
            <label for="typing-input" class="input-caption">つなげて入力 <span>SPACE 不要 / 大文字・小文字 OK</span></label>
            <div id="target-display" class="target-display" aria-hidden="true"></div>
            <input id="typing-input" type="text" placeholder="ここをクリックして入力" aria-label="タイピング入力" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="text" />
          </div>
          <div class="prompt-footer"><p id="feedback" role="status" aria-live="polite">半角英数で入力してください。</p><span><strong id="completed-value">0</strong> 組クリア</span></div>
        </div>
        <p class="play-note">ミスで入力位置は戻りません。Backspace・スペースは不要です。画面を離れても時間は進みます。</p>
      </section>

      <section id="result-view" hidden aria-labelledby="result-title">
        <div class="result-heading"><span class="eyebrow" id="result-mode">CHALLENGE COMPLETE</span><h1 id="result-title">おつかれさま！</h1><p id="result-message">あなたの指で、新しいEDPが生まれました。</p></div>
        <div class="result-panel">
          <div class="result-score"><span class="eyebrow">YOUR SCORE</span><strong id="result-score">0</strong><span>正しく打った文字数</span></div>
          <dl class="result-stats">
            <div><dt>正確率</dt><dd id="result-accuracy">—</dd></div>
            <div><dt>クリアしたお題</dt><dd id="result-completed">0 組</dd></div>
            <div><dt>最大コンボ</dt><dd id="result-combo">0</dd></div>
            <div><dt>ミスした文字</dt><dd id="result-misses">0</dd></div>
            <div><dt>プレイ時間</dt><dd id="result-time">0.0 秒</dd></div>
          </dl>
        </div>
        <div class="result-actions"><button id="replay-button" class="button primary">もう一度プレイ <span aria-hidden="true">↗</span></button><button id="choose-mode-button" class="button secondary">モードを選ぶ</button></div>
        <p class="result-edp">EDPには、こんな意味も。<strong>Echigo Dangerous People</strong><span>Electronic Data Processing</span></p>
      </section>
    </main>
    <footer class="site-footer"><span>EDP TYPE <span class="footer-slash">/</span> CULTURE FESTIVAL 2026</span><span>${phrases.length}のお題で試せるプロトタイプ</span></footer>
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
const targetDisplay = element('target-display');
const timeValue = element('time-value');
const timeTrack = element('time-track');
const timeFill = element('time-fill');
const scoreValue = element('score-value');
const accuracyValue = element('accuracy-value');
const comboValue = element('combo-value');
const completedValue = element('completed-value');
const replayButton = element<HTMLButtonElement>('replay-button');
let interval: ReturnType<typeof setInterval> | undefined;
let renderedPhrase = '';
let selectedMode: Mode = 'timed';
let composing = false;
let previousMiss = false;

function accuracyText(accuracy: number | null): string {
  return accuracy === null ? '—' : `${accuracy.toFixed(1)}%`;
}

function showView(view: HTMLElement): void {
  for (const section of [readyView, gameView, resultView]) section.hidden = section !== view;
}

function setFeedback(text: string, error = false): void {
  feedback.textContent = text;
  feedback.classList.toggle('error-text', error);
  typingPanel.classList.toggle('has-miss', error);
}

function renderPrompt(): void {
  const { phrase, position } = game.snapshot();
  if (renderedPhrase !== phrase.id) {
    renderedPhrase = phrase.id;
    wordDisplay.replaceChildren();
    for (const [i, word] of phrase.words.entries()) {
      const column = document.createElement('div');
      column.className = 'word-column';
      const label = document.createElement('span');
      label.className = 'word-label';
      label.textContent = `0${i + 1} / ${word[0]}`;
      const title = document.createElement('strong');
      title.textContent = word;
      column.append(label, title);
      wordDisplay.append(column);
    }
    element('meaning').textContent = phrase.meaningJa;
    element('phrase-badge').textContent = phrase.tags.includes('special') ? 'EDP SPECIAL' : 'NEW EDP';
    targetDisplay.replaceChildren();
    for (const char of inputText(phrase)) {
      const span = document.createElement('span');
      span.textContent = char;
      targetDisplay.append(span);
    }
  }
  [...targetDisplay.children].forEach((span, i) => {
    span.classList.toggle('typed', i < position);
    span.classList.toggle('current', i === position);
  });
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
  accuracyValue.textContent = accuracyText(state.accuracy);
  comboValue.textContent = String(state.combo);
  completedValue.textContent = String(state.completed);
  timeFill.style.width = `${((state.remainingMs ?? ROUND_DURATION_MS) / ROUND_DURATION_MS) * 100}%`;
  timeTrack.setAttribute('aria-valuenow', String(seconds));
}

function showResult(): void {
  clearInterval(interval);
  interval = undefined;
  const state = game.snapshot();
  typingInput.disabled = true;
  element('result-mode').textContent = state.mode === 'timed' ? 'CHALLENGE COMPLETE' : 'PRACTICE COMPLETE';
  element('result-title').textContent = state.mode === 'timed' && state.remainingMs === 0 ? 'タイムアップ！' : 'おつかれさま！';
  element('result-message').textContent = state.score === 0 ? 'まずは1文字から。何度でもチャレンジしよう。' : 'あなたの指で、新しいEDPが生まれました。';
  element('result-score').textContent = String(state.score);
  element('result-accuracy').textContent = accuracyText(state.accuracy);
  element('result-completed').textContent = `${state.completed} 組`;
  element('result-combo').textContent = String(state.maxCombo);
  element('result-misses').textContent = String(state.misses);
  element('result-time').textContent = `${(state.elapsedMs / 1000).toFixed(1)} 秒`;
  showView(resultView);
  replayButton.focus();
}

function start(mode: Mode): void {
  clearInterval(interval);
  selectedMode = mode;
  composing = previousMiss = false;
  renderedPhrase = '';
  game.start(mode, performance.now());
  typingInput.disabled = false;
  element('mode-label').textContent = mode === 'timed' ? '60 SECOND CHALLENGE' : 'FREE PRACTICE';
  element('time-label').textContent = mode === 'timed' ? '残り時間' : '経過時間';
  timeTrack.hidden = mode === 'practice';
  setFeedback('半角英数で入力してください。');
  showView(gameView);
  renderPrompt();
  renderStats();
  typingInput.focus();
  interval = setInterval(() => {
    game.tick(performance.now());
    if (game.snapshot().phase === 'finished') showResult();
    else renderStats();
  }, 100);
}

function acceptLetter(key: string): void {
  const oldPhrase = game.snapshot().phrase;
  const outcome = game.type(key, performance.now());
  if (outcome === 'finished') { showResult(); return; }
  if (outcome === 'ignored') return;
  renderPrompt();
  renderStats();
  if (outcome === 'miss') {
    const state = game.snapshot();
    setFeedback(`ミス！ 次は「${inputText(state.phrase)[state.position]}」。そのまま続けよう。`, true);
    previousMiss = true;
  } else if (outcome === 'completed') {
    setFeedback(`${oldPhrase.words.join(' ')} クリア！ 次のお題へ。`);
    previousMiss = false;
  } else if (previousMiss || feedback.classList.contains('error-text')) {
    setFeedback('いい調子！ そのまま続けよう。');
    previousMiss = false;
  }
}

startForm.addEventListener('submit', (event) => {
  event.preventDefault();
  start(new FormData(startForm).get('mode') === 'practice' ? 'practice' : 'timed');
});
replayButton.addEventListener('click', () => start(selectedMode));
element('choose-mode-button').addEventListener('click', () => {
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
    setFeedback('日本語入力をOFFにして、半角英数に切り替えてください。', true);
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
  setFeedback('日本語入力をOFFにして、半角英数に切り替えてください。', true);
});
typingInput.addEventListener('compositionend', () => { composing = false; renderPrompt(); });
typingInput.addEventListener('input', () => { if (!composing) renderPrompt(); });
typingInput.addEventListener('paste', (event) => {
  event.preventDefault();
  setFeedback('貼り付けは使えません。1文字ずつ入力してください。');
});
typingInput.addEventListener('drop', (event) => event.preventDefault());
typingInput.addEventListener('blur', () => {
  if (game.snapshot().phase === 'playing') setFeedback('入力欄をクリックすると続けられます。');
});
typingInput.addEventListener('focus', () => {
  if (game.snapshot().phase === 'playing') setFeedback('半角英数で入力してください。');
});
document.addEventListener('visibilitychange', () => {
  if (game.snapshot().phase !== 'playing') return;
  game.tick(performance.now());
  if (game.snapshot().phase === 'finished') showResult();
  else renderStats();
});
