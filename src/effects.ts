/** Visual feedback is independent of scoring and never delays the next prompt. */
export class TypingEffects {
  private readonly motion = matchMedia('(prefers-reduced-motion: reduce)');
  private readonly animations = new Set<Animation>();
  private readonly layer = document.createElement('div');
  private enabled = true;
  private preview: HTMLElement | undefined;
  private previewTimer: ReturnType<typeof setTimeout> | undefined;
  private previewIndex = 0;
  private readonly reels = new Map<HTMLElement, ReturnType<typeof setTimeout>[]>();

  constructor(private readonly toggle: HTMLButtonElement) {
    this.layer.className = 'sparkle-layer';
    this.layer.setAttribute('aria-hidden', 'true');
    document.body.append(this.layer);
    this.motion.addEventListener('change', () => this.refreshPreview());
    document.addEventListener('visibilitychange', () => this.refreshPreview());
    toggle.addEventListener('click', () => {
      this.enabled = !this.enabled;
      document.documentElement.dataset.effects = this.enabled ? 'on' : 'off';
      this.updateToggle();
      this.refreshPreview();
    });
    this.updateToggle();
  }

  private updateToggle(): void {
    this.toggle.setAttribute('aria-pressed', String(this.enabled));
    this.toggle.setAttribute('aria-label', this.enabled ? '演出をオフにする' : '演出をオンにする');
    this.toggle.title = this.enabled ? '演出をオフにする' : '演出をオンにする';
  }

  clear(): void {
    clearTimeout(this.previewTimer);
    this.previewTimer = undefined;
    this.previewIndex = 0;
    for (const glyph of this.reels.keys()) this.resolve(glyph);
    for (const animation of this.animations) animation.cancel();
    this.animations.clear();
    this.layer.replaceChildren();
  }

  resolve(glyph: HTMLElement): void {
    for (const timer of this.reels.get(glyph) ?? []) clearTimeout(timer);
    this.reels.delete(glyph);
    glyph.classList.remove('reeling');
    delete glyph.dataset.reel;
  }

  reveal(container: HTMLElement): void {
    if (!this.enabled || this.motion.matches || document.hidden) return;
    const glyphs = [...container.querySelectorAll<HTMLElement>('.glyph:not(.initial):not(.current):not(.typed)')];
    const digits = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    glyphs.forEach((glyph, index) => {
      // All letters settle within 150 ms, irrespective of prompt length.
      const delay = index / Math.max(1, glyphs.length - 1) * 90;
      glyph.classList.add('reeling');
      glyph.dataset.reel = digits[(index * 7 + 3) % digits.length]!;
      const timers = [
        setTimeout(() => { glyph.dataset.reel = digits[(index * 11 + 9) % digits.length]!; }, delay + 30),
        setTimeout(() => this.resolve(glyph), delay + 60),
      ];
      this.reels.set(glyph, timers);
    });
  }

  setPreview(preview: HTMLElement): void {
    this.preview = preview;
    this.refreshPreview();
  }

  refreshPreview(): void {
    this.clear();
    if (!this.enabled || this.motion.matches || document.hidden || !this.preview?.checkVisibility()) return;
    this.previewTimer = setTimeout(() => this.popPreviewLetter(), 450);
  }

  private popPreviewLetter(): void {
    if (!this.enabled || this.motion.matches || document.hidden || !this.preview?.checkVisibility()) return;
    const glyphs = this.preview.querySelectorAll<HTMLElement>('.glyph');
    const glyph = glyphs[this.previewIndex];
    if (!glyph) return;
    const baseColor = getComputedStyle(glyph).color;
    this.play(glyph, [
      { transform: 'translateY(0) scale(1)', color: baseColor, textShadow: 'none' },
      { transform: 'translateY(-.12em) scale(1.16)', color: '#008eac', textShadow: '0 0 7px #23dcffb3, 0 0 18px #23dcff66', offset: .32 },
      { transform: 'translateY(.025em) scale(.98)', color: baseColor, textShadow: '0 0 5px #23dcff33', offset: .7 },
      { transform: 'translateY(0) scale(1)', color: baseColor, textShadow: 'none' },
    ], 420);
    const rect = glyph.getBoundingClientRect();
    // Small, deterministic glints sit above the popping letter.
    for (let i = 0; i < 3; i++) {
      const particle = document.createElement('i');
      particle.className = 'sparkle preview-sparkle';
      particle.style.color = i === 1 ? '#48b9e2' : '#6289f5';
      particle.style.width = particle.style.height = `${i === 1 ? 7 : 5}px`;
      particle.style.left = `${rect.left + rect.width * (.2 + i * .3)}px`;
      particle.style.top = `${rect.top + rect.height * .28}px`;
      this.layer.append(particle);
      const x = (i - 1) * 16;
      const y = i === 1 ? -30 : -18;
      this.play(particle, [
        { transform: 'translate(-50%, -50%) scale(.2)', opacity: 0 },
        { transform: `translate(calc(-50% + ${x * .4}px), calc(-50% + ${y * .4}px)) scale(1)`, opacity: .75, offset: .3 },
        { transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(.1)`, opacity: 0 },
      ], 520, true);
    }
    this.previewIndex = (this.previewIndex + 1) % glyphs.length;
    this.previewTimer = setTimeout(() => this.popPreviewLetter(), this.previewIndex === 0 ? 1800 : 180);
  }

  private play(target: HTMLElement, frames: Keyframe[], duration: number, remove = false): void {
    const animation = target.animate(frames, { duration, easing: 'cubic-bezier(.16,.65,.3,1)' });
    this.animations.add(animation);
    const cleanup = (): void => {
      this.animations.delete(animation);
      if (remove) target.remove();
    };
    animation.onfinish = cleanup;
    animation.oncancel = cleanup;
  }

  letter(glyph: HTMLElement | null): void {
    if (!this.enabled || this.motion.matches || !glyph) return;
    this.play(glyph, [
      { textShadow: '0 0 8px #32baff, 0 0 22px #548aff' },
      { textShadow: '0 0 0 transparent' },
    ], 280);
  }

  burst(rect: DOMRect, rainbow = false, count = 24): void {
    if (!this.enabled || this.motion.matches || document.hidden) return;
    // Bound simultaneous work even during very fast typing.
    const available = Math.min(count, 64 - this.layer.childElementCount);
    for (let i = 0; i < available; i++) {
      const particle = document.createElement('i');
      particle.className = i % 3 === 0 ? 'sparkle mote' : 'sparkle';
      const hue = rainbow ? (i / count * 360 + 205) % 360 : 195 + Math.random() * 45;
      particle.style.color = `hsl(${hue} 90% 56%)`;
      const size = 4 + Math.random() * 8;
      particle.style.width = particle.style.height = `${size}px`;
      particle.style.left = `${rect.left + rect.width * (.08 + Math.random() * .84)}px`;
      particle.style.top = `${rect.top + rect.height * (.25 + Math.random() * .55)}px`;
      this.layer.append(particle);
      const x = (Math.random() - .5) * 130;
      const y = -(25 + Math.random() * 85);
      const angle = (Math.random() - .5) * 110;
      this.play(particle, [
        { transform: 'translate(-50%, -50%) scale(.2)', opacity: 0 },
        { transform: `translate(calc(-50% + ${x * .2}px), calc(-50% + ${y * .2}px)) rotate(${angle * .2}deg) scale(1)`, opacity: .9, offset: .2 },
        { transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${angle}deg) scale(.15)`, opacity: 0 },
      ], 650 + Math.random() * 400, true);
    }
  }
}
