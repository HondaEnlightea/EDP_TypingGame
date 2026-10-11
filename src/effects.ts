/** Visual feedback is independent of scoring and never delays the next prompt. */
export class TypingEffects {
  private readonly motion = matchMedia('(prefers-reduced-motion: reduce)');
  private readonly animations = new Set<Animation>();
  private readonly layer = document.createElement('div');
  private enabled = true;

  constructor(private readonly toggle: HTMLButtonElement) {
    this.layer.className = 'sparkle-layer';
    this.layer.setAttribute('aria-hidden', 'true');
    document.body.append(this.layer);
    this.motion.addEventListener('change', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    toggle.addEventListener('click', () => {
      this.enabled = !this.enabled;
      document.documentElement.dataset.effects = this.enabled ? 'on' : 'off';
      this.updateToggle();
      this.clear();
    });
    this.updateToggle();
  }

  private updateToggle(): void {
    this.toggle.setAttribute('aria-pressed', String(this.enabled));
    this.toggle.setAttribute('aria-label', this.enabled ? '演出をオフにする' : '演出をオンにする');
    this.toggle.title = this.enabled ? '演出をオフにする' : '演出をオンにする';
  }

  clear(): void {
    for (const animation of this.animations) animation.cancel();
    this.animations.clear();
    this.layer.replaceChildren();
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
