import type { EnclosureMode } from '../types';
import type { ComponentRegistry } from '../core/Registry';

/**
 * Feature 4: solid / transparent / hidden outer-enclosure modes.
 * Applies to every entity whose record is flagged `isEnclosure`.
 */
export class EnclosureModeManager {
  private mode: EnclosureMode = 'solid';

  constructor(private readonly registry: ComponentRegistry) {}

  getMode(): EnclosureMode {
    return this.mode;
  }

  setMode(mode: EnclosureMode): void {
    this.mode = mode;
    for (const entity of this.registry.entities) {
      if (!entity.record.isEnclosure) continue;
      entity.hiddenByEnclosureMode = mode === 'hidden';
      entity.setTransparentMode(mode === 'transparent');
      entity.applyVisibility();
    }
  }
}
