import { el } from './dom';
import type { CollisionReport } from '../features/CollisionManager';

export class StatusBar {
  private readonly hintEl: HTMLElement;
  private readonly selectedEl: HTMLElement;
  private readonly collisionEl: HTMLElement;

  constructor(container: HTMLElement) {
    this.hintEl = el('span', 'sb-hint', 'Ready.');
    this.selectedEl = el('span', 'sb-selected', '');
    this.collisionEl = el('span', 'sb-collisions ok', 'No collisions');
    const disclaimer = el(
      'span',
      'sb-disclaimer',
      'Layout study only — provisional dimensions, not for procurement (ASR-ENG-001 Rev B)'
    );
    container.append(this.hintEl, this.selectedEl, this.collisionEl, disclaimer);
  }

  setHint(text: string): void {
    this.hintEl.textContent = text;
  }

  setSelected(text: string): void {
    this.selectedEl.textContent = text;
  }

  setCollisions(report: CollisionReport): void {
    const pairCount = report.pairs.length;
    const koCount = report.keepOutViolations.length;
    if (pairCount === 0 && koCount === 0) {
      this.collisionEl.textContent = 'No collisions';
      this.collisionEl.className = 'sb-collisions ok';
      return;
    }
    const parts: string[] = [];
    if (pairCount > 0) parts.push(`${pairCount} collision${pairCount === 1 ? '' : 's'}`);
    if (koCount > 0) parts.push(`${koCount} keep-out violation${koCount === 1 ? '' : 's'}`);
    this.collisionEl.textContent = parts.join(' · ');
    this.collisionEl.className = 'sb-collisions bad';
  }
}
