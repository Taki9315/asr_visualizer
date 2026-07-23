import type { ComponentEntity } from '../core/ComponentEntity';
import type { ComponentRegistry } from '../core/Registry';
import { el } from './dom';

export interface HierarchyCallbacks {
  onSelect: (id: string) => void;
  onToggleVisibility: (id: string) => void;
}

/**
 * Feature 3: component hierarchy with per-component visibility toggles.
 * The tree follows the logical `parentId` grouping from the dataset.
 */
export class HierarchyPanel {
  private readonly listEl: HTMLElement;

  constructor(
    container: HTMLElement,
    private readonly registry: ComponentRegistry,
    private readonly cb: HierarchyCallbacks
  ) {
    container.append(el('h2', 'panel-title', 'Component hierarchy'));
    const hint = el(
      'div',
      'panel-hint',
      'Click to select. Eye toggles visibility. Padlock = placement locked.'
    );
    container.append(hint);
    this.listEl = el('div', 'hierarchy-list');
    container.append(this.listEl);
  }

  render(selectedId: string | null): void {
    this.listEl.textContent = '';
    const renderLevel = (parentId: string | null, depth: number): void => {
      for (const entity of this.registry.childrenOf(parentId)) {
        this.listEl.append(this.renderRow(entity, depth, selectedId));
        renderLevel(entity.id, depth + 1);
      }
    };
    renderLevel(null, 0);
  }

  private renderRow(entity: ComponentEntity, depth: number, selectedId: string | null): HTMLElement {
    const row = el('div', 'h-row');
    row.style.paddingLeft = `${8 + depth * 16}px`;
    if (entity.id === selectedId) row.classList.add('selected');
    if (entity.colliding) row.classList.add('colliding');

    const eye = el('button', 'h-eye', entity.userVisible ? '◉' : '○');
    eye.type = 'button';
    eye.title = entity.userVisible ? 'Hide' : 'Show';
    eye.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.cb.onToggleVisibility(entity.id);
    });
    row.append(eye);

    const name = el('span', 'h-name', entity.record.name);
    name.title = `${entity.id}${entity.record.bomRef ? ` — ${entity.record.bomRef}` : ''}`;
    row.append(name);

    if (entity.record.locked) {
      row.append(el('span', 'h-lock', '\u{1F512}'));
    }
    if (entity.record.status !== 'vendor-datasheet') {
      const dot = el('span', 'h-prov', '●');
      dot.title = entity.record.status === 'provisional' ? 'Provisional data' : 'Assumed data';
      row.append(dot);
    }
    if (entity.usingGlb) {
      row.append(el('span', 'h-glb', 'GLB'));
    }

    row.addEventListener('click', () => this.cb.onSelect(entity.id));
    return row;
  }
}
