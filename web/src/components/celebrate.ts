const COLORS = ['#1a7f37', '#2fae4a', '#0b6fd0', '#0a95e8', '#ff9600', '#ffc800'];

/**
 * A short confetti burst for finished goals (taken medicine, water target, onboarding done).
 * Pure DOM, no library; skipped entirely when the person prefers reduced motion.
 */
export function celebrate(pieces = 70) {
  if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const nodes: HTMLElement[] = [];
  for (let i = 0; i < pieces; i++) {
    const el = document.createElement('span');
    el.className = 'confetti-piece';
    el.style.left = `${Math.random() * 100}vw`;
    el.style.background = COLORS[i % COLORS.length]!;
    el.style.setProperty('--dx', `${(Math.random() - 0.5) * 40}vw`);
    el.style.setProperty('--dur', `${1.4 + Math.random() * 1.2}s`);
    el.style.animationDelay = `${Math.random() * 0.25}s`;
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    nodes.push(el);
  }
  setTimeout(() => nodes.forEach((n) => n.remove()), 3200);
}
