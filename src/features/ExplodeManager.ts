import * as THREE from 'three';
import type { ComponentEntity } from '../core/ComponentEntity';
import type { ComponentRegistry } from '../core/Registry';

/** Maximum explode travel (metres) for weight 1.0 at slider = 1. */
const MAX_TRAVEL_M = 0.5;

/**
 * Feature 6: exploded assembly view with adjustable distance.
 * Directions come from each record's `explodeDir`, falling back to a radial
 * direction from the assembly centroid. Explosion is a display offset only —
 * base placements, collisions and COM are unaffected.
 */
export class ExplodeManager {
  private factor = 0;

  constructor(private readonly registry: ComponentRegistry) {}

  getFactor(): number {
    return this.factor;
  }

  isExploded(): boolean {
    return this.factor > 0.0001;
  }

  private weightFor(entity: ComponentEntity): number {
    if (entity.record.isEnclosure) return 1.7;
    if (entity.id.startsWith('wheel-')) return 1.0;
    switch (entity.record.category) {
      case 'sensor':
      case 'comms':
        return 1.3;
      case 'structure':
        return 0.6;
      default:
        return 0.9;
    }
  }

  setFactor(factor: number): void {
    this.factor = THREE.MathUtils.clamp(factor, 0, 1);
    const centroid = this.registry.assemblyCentroid();
    const dir = new THREE.Vector3();
    for (const entity of this.registry.entities) {
      const explicit = entity.record.explodeDir;
      if (explicit) {
        dir.set(explicit[0], explicit[1], explicit[2]);
      } else {
        dir.copy(entity.getBaseCenterWorld()).sub(centroid);
      }
      if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
      dir.normalize();
      entity.explodeOffsetM
        .copy(dir)
        .multiplyScalar(this.factor * MAX_TRAVEL_M * this.weightFor(entity));
      entity.syncObjectTransform();
    }
  }

  /** Re-applies the current factor (after placements changed). */
  refresh(): void {
    this.setFactor(this.factor);
  }
}
